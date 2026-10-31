/* The site's PDF reader, from Joshua's design "Handout Reader Cleanup"
   (2026-10-31), used for the Matthew handouts and every paper (the library,
   /peter/ and /textualcriticism/; "do the same for the papers").

   The pages are drawn here with PDF.js on a grey ground, 612px wide at 100%
   (the design's letter page), with a floating toolbar: previous / "1 / 4" /
   next, zoom out / 100% / zoom in, fit to width. While it loads: a thin
   moving bar along the top, placeholder pages, and a "Loading… 1 of 4 pages"
   pill. A paper runs to 26 pages, so only the pages near the view are drawn,
   and far ones are let go again, which keeps a phone's memory in hand.

     const view = PdfPages.mount(host, pdfUrl, { strings, onPages(n) });
     view.destroy();      // before the host is reused

   The page that mounts it styles the reader around it (pdf-pages.css has the
   pane, the pages and the toolbar). */
(function () {
  "use strict";
  const PDFJS = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/";
  const EN = {
    loading: "Loading…", of: "{i} of {n} pages", label: "Pages", controls: "Page controls",
    prev: "Previous page", next: "Next page", out: "Zoom out", in: "Zoom in",
    reset: "Reset zoom to 100%", fit: "Fit to width",
    fail: "This couldn’t load.", open: "Open the PDF"
  };
  // the placeholder lines of the design's loading page: width %, indent (pt of 480), centred
  const SK = [[46, 0, 1], [96], [72], [38], [58, 24], [34, 48], [66, 72], [52, 24], [70, 48], [62, 48], [68], [24, 24],
              [54, 48], [14, 72], [36, 48], [22, 48], [42, 24], [26, 48], [44, 48], [74, 48], [56, 48], [46, 24], [30, 48], [50, 48]];
  const SKELETON = `<div class="hv-sk" aria-hidden="true">${SK.map(([w, l = 0, c]) =>
    `<i style="width:${w}%;${c ? "align-self:center;margin-bottom:8px;" : `margin-left:${(l / 480 * 100).toFixed(1)}%;`}"></i>`).join("")}</div>`;

  let pdfjsLoading = null;
  function loadPdfJs() {
    if (window.pdfjsLib) return Promise.resolve();
    if (!pdfjsLoading) pdfjsLoading = new Promise((resolve, reject) => {
      const s = document.createElement("script");
      s.src = PDFJS + "pdf.min.js";
      s.onload = () => { window.pdfjsLib.GlobalWorkerOptions.workerSrc = PDFJS + "pdf.worker.min.js"; resolve(); };
      s.onerror = () => { pdfjsLoading = null; reject(new Error("PDF.js")); };
      document.head.appendChild(s);
    });
    return pdfjsLoading;
  }

  const esc = s => String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const icon = d => `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;

  function mount(host, pdfUrl, opts) {
    opts = opts || {};
    const T = Object.assign({}, EN, opts.strings || {});
    const url = new URL(pdfUrl, document.baseURI).href;   // PDF.js ignores <base>
    let alive = true;
    host.classList.add("hv-host");
    host.innerHTML = `
      <div class="hv-progress" aria-hidden="true"><div></div></div>
      <div class="hv-scroll" tabindex="0" role="region" aria-label="${esc(T.label)}" aria-busy="true"><div class="hv-pages"></div></div>
      <div class="hv-float hv-status" role="status"><span class="hv-spin" aria-hidden="true"></span><span>${esc(T.loading)}</span><span class="hv-of"></span></div>
      <div class="hv-float hv-bar" role="toolbar" aria-label="${esc(T.controls)}" hidden>
        <button type="button" class="hv-tb" data-hv="prev" aria-label="${esc(T.prev)}">${icon('<path d="M15 18l-6-6 6-6"/>')}</button>
        <span class="hv-count" aria-live="polite"></span>
        <button type="button" class="hv-tb" data-hv="next" aria-label="${esc(T.next)}">${icon('<path d="M9 18l6-6-6-6"/>')}</button>
        <span class="hv-sep" aria-hidden="true"></span>
        <button type="button" class="hv-tb" data-hv="out" aria-label="${esc(T.out)}">${icon('<path d="M5 12h14"/>')}</button>
        <button type="button" class="hv-tb hv-zoom" data-hv="reset" aria-label="${esc(T.reset)}">100%</button>
        <button type="button" class="hv-tb" data-hv="in" aria-label="${esc(T.in)}">${icon('<path d="M12 5v14M5 12h14"/>')}</button>
        <span class="hv-sep" aria-hidden="true"></span>
        <button type="button" class="hv-tb" data-hv="fit" aria-label="${esc(T.fit)}">${icon('<path d="M8 4H5a1 1 0 0 0-1 1v3M16 4h3a1 1 0 0 1 1 1v3M8 20H5a1 1 0 0 1-1-1v-3M16 20h3a1 1 0 0 0 1-1v-3"/>')}</button>
      </div>`;
    const scroll = host.querySelector(".hv-scroll"), pagesEl = host.querySelector(".hv-pages");
    const status = host.querySelector(".hv-status"), of = host.querySelector(".hv-of");
    const bar = host.querySelector(".hv-bar"), count = host.querySelector(".hv-count");
    const zoomBtn = host.querySelector('[data-hv="reset"]');
    const pad = () => { const cs = getComputedStyle(scroll); return { x: parseFloat(cs.paddingLeft) + parseFloat(cs.paddingRight), top: parseFloat(cs.paddingTop) }; };
    const fitZoom = () => Math.max(0.3, Math.min(2, (scroll.clientWidth - pad().x) / 612));
    const ratio = () => Math.max(1.5, Math.min(3, window.devicePixelRatio || 1));

    let z = 1;                                   // the design's 100% (a phone's width once measured)
    let sizes = [{ w: 612, h: 792 }, { w: 612, h: 792 }];
    let frames = [], pages = [], drawnAt = [], current = 1, loadingPhase = true;
    const near = new Set();                      // pages close enough to the view to draw
    let nearObs = null, farObs = null, timer = 0, pumping = false;

    function build() {
      pagesEl.innerHTML = sizes.map((s, i) => `<div class="hv-page" data-i="${i}">${SKELETON}<canvas aria-hidden="true"></canvas></div>`).join("");
      frames = Array.from(pagesEl.children);
      drawnAt = sizes.map(() => 0);
      layout();
    }
    function layout() {
      pagesEl.style.width = Math.round(Math.max(...sizes.map(s => s.w)) * z) + "px";
      frames.forEach((f, i) => { f.style.width = Math.round(sizes[i].w * z) + "px"; f.style.height = Math.round(sizes[i].h * z) + "px"; });
      zoomBtn.textContent = Math.round(z * 100) + "%";
    }
    function showCount() {
      count.textContent = `${current} / ${pages.length}`;
      bar.querySelector('[data-hv="prev"]').disabled = current <= 1;
      bar.querySelector('[data-hv="next"]').disabled = current >= pages.length;
    }
    function drop(i) {                           // let a far page go
      const f = frames[i];
      if (!f || !drawnAt[i]) return;
      const blank = document.createElement("canvas");
      blank.setAttribute("aria-hidden", "true");
      f.querySelector("canvas").replaceWith(blank);
      f.classList.remove("is-drawn");
      drawnAt[i] = 0;
    }
    async function draw(i) {
      const page = pages[i], frame = frames[i], at = z;
      const vp = page.getViewport({ scale: at * ratio() });
      const c = document.createElement("canvas");
      c.width = Math.ceil(vp.width); c.height = Math.ceil(vp.height);
      c.setAttribute("aria-hidden", "true");
      await page.render({ canvasContext: c.getContext("2d"), viewport: vp }).promise;
      if (!alive || at !== z || !near.has(i)) return;
      frame.querySelector("canvas").replaceWith(c);
      frame.classList.add("is-drawn");
      drawnAt[i] = at;
    }
    function nextWanted() {
      let best = -1, dist = Infinity;
      near.forEach(i => { if (drawnAt[i] !== z && Math.abs(i + 1 - current) < dist) { best = i; dist = Math.abs(i + 1 - current); } });
      return best;
    }
    async function pump() {
      if (pumping) return;
      pumping = true;
      try {
        for (let i = nextWanted(); alive && i >= 0; i = nextWanted()) {
          if (loadingPhase) of.textContent = T.of.replace("{i}", Math.min(pages.length, drawnAt.filter(Boolean).length + 1)).replace("{n}", pages.length);
          await draw(i);
        }
      } finally { pumping = false; }
      if (alive && loadingPhase && nextWanted() < 0) finishLoading();
    }
    function finishLoading() {
      loadingPhase = false;
      const p = host.querySelector(".hv-progress");
      if (p) p.remove();
      status.hidden = true;
      scroll.removeAttribute("aria-busy");
      bar.hidden = false;
      showCount();
    }
    function setZoom(nz) {
      nz = Math.min(2, Math.max(0.3, Math.round(nz * 100) / 100));
      if (nz === z) return;
      const r = scroll.scrollHeight > scroll.clientHeight ? scroll.scrollTop / (scroll.scrollHeight - scroll.clientHeight) : 0;
      z = nz; layout();
      scroll.scrollTop = r * (scroll.scrollHeight - scroll.clientHeight);
      clearTimeout(timer);                       // draw again at the new size once the zooming stops
      timer = setTimeout(() => { if (alive) pump(); }, 220);
    }
    function go(p) {
      p = Math.min(pages.length, Math.max(1, p));
      const calm = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
      scroll.scrollTo({ top: frames[p - 1].offsetTop - pad().top, behavior: calm ? "auto" : "smooth" });
      current = p; showCount();
    }
    bar.addEventListener("click", e => {
      const b = e.target.closest("[data-hv]");
      if (!b) return;
      const a = b.dataset.hv;
      if (a === "prev") go(current - 1);
      else if (a === "next") go(current + 1);
      else if (a === "out") setZoom(z - 0.1);
      else if (a === "in") setZoom(z + 0.1);
      else if (a === "reset") setZoom(1);
      else if (a === "fit") setZoom(fitZoom());
    });
    scroll.addEventListener("scroll", () => {
      if (!pages.length) return;
      const at = scroll.scrollTop + scroll.clientHeight * 0.35;
      let p = 1;
      frames.forEach((f, i) => { if (f.offsetTop <= at) p = i + 1; });
      if (p !== current) { current = p; if (!loadingPhase) showCount(); }
    }, { passive: true });

    (async () => {
      // mounted before the reader is shown: measure the pane once it is laid out
      await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
      if (!alive) return;
      if (scroll.clientWidth) z = Math.min(1, fitZoom());
      build();
      try {
        await loadPdfJs();
        const pdf = await window.pdfjsLib.getDocument(url).promise;
        if (!alive) return;
        for (let i = 1; i <= pdf.numPages; i++) pages.push(await pdf.getPage(i));
      } catch (e) {
        if (!alive) return;
        host.querySelector(".hv-progress").remove(); status.remove();
        scroll.removeAttribute("aria-busy");
        pagesEl.style.width = "auto";
        pagesEl.innerHTML = `<p class="hv-fail">${esc(T.fail)} <a href="${esc(url)}" target="_blank" rel="noopener">${esc(T.open)}</a></p>`;
        return;
      }
      if (!alive) return;
      sizes = pages.map(p => { const v = p.getViewport({ scale: 1 }); return { w: v.width, h: v.height }; });
      build();
      if (opts.onPages) opts.onPages(pages.length);
      // draw what is within a screen of the view; let go of what is three screens off
      nearObs = new IntersectionObserver(es => {
        es.forEach(e => { const i = +e.target.dataset.i; if (e.isIntersecting) near.add(i); else near.delete(i); });
        pump();
      }, { root: scroll, rootMargin: "100% 0px 100% 0px" });
      farObs = new IntersectionObserver(es => {
        es.forEach(e => { if (!e.isIntersecting) drop(+e.target.dataset.i); });
      }, { root: scroll, rootMargin: "300% 0px 300% 0px" });
      frames.forEach(f => { nearObs.observe(f); farObs.observe(f); });
    })();

    return {
      destroy() {
        alive = false;
        clearTimeout(timer);
        if (nearObs) nearObs.disconnect();
        if (farObs) farObs.disconnect();
        host.classList.remove("hv-host");
      }
    };
  }

  window.PdfPages = { mount, loadPdfJs };
})();
