/* The site's PDF reader, from Joshua's design "Handout Reader Cleanup"
   (2026-10-31), used for the Matthew handouts and every paper (the library,
   /peter/ and /textualcriticism/; "do the same for the papers").

   The pages are drawn here with PDF.js on a grey ground, 612px wide at 100%
   (the design's letter page), with a floating toolbar: previous / "1 / 4" /
   next, zoom out / 100% / zoom in, fit to width. While it loads: a thin
   moving bar along the top, placeholder pages, and a "Loading… 1 of 4 pages"
   pill. A paper runs to 26 pages, so only the pages near the view are drawn,
   and far ones are let go again, which keeps a phone's memory in hand.

   Papers also have a Reader mode (Joshua, 2026-11-08: "a 'reader mode' for
   all my papers that looks like 'Scroll' mode on joshuahaub.com/commentarytest";
   then "instead of 'scroll' can you name it 'reader mode'" and "instead of
   'page' can you put 'Original mode'"). Given `text`, the reader gets a
   Reader mode / Original mode switch: Reader mode shows the paper
   as running text, set as the commentary's Scroll view sets it, with
   footnotes in popups and the PDF's page numbers in the margin of the text.
   The text is papers/<id>/text.html, written from the Word original by
   commentary-build/build_paper_text.py. Switching keeps the reader's place,
   and the choice is remembered. If the text cannot be had, the switch never
   shows and the pages are all there is.

     const view = PdfPages.mount(host, pdfUrl, { strings, onPages(n), text });
     view.destroy();      // before the host is reused

   The page that mounts it styles the reader around it (pdf-pages.css has the
   pane, the pages, the toolbar and the Scroll view). */
(function () {
  "use strict";
  const PDFJS = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/";
  const EN = {
    loading: "Loading…", of: "{i} of {n} pages", label: "Pages", controls: "Page controls",
    prev: "Previous page", next: "Next page", out: "Zoom out", in: "Zoom in",
    reset: "Reset zoom to 100%", fit: "Fit to width",
    fail: "This couldn’t load.", open: "Open the PDF",
    view: "View", scroll: "Reader mode", page: "Original mode",
    scrollTip: "The paper as running text", pageTip: "The paper’s pages, as printed",
    size: "Text size", smaller: "Smaller text", larger: "Larger text",
    text: "Paper text", textLoading: "Loading the text…", note: "Footnote", close: "Close",
    pageNo: "Page {n}"
  };
  const VIEW_KEY = "paperView", SIZE_KEY = "paperTextSize";
  const SIZES = [15, 16, 17, 18, 19, 20, 22], SIZE_DEFAULT = 2;
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
  // the commentary's own Scroll and Page icons
  const ICON_SCROLL = '<svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" aria-hidden="true"><path d="M3 2.6h10M3 6h10M3 9.4h10M3 12.8h6"/></svg>';
  const ICON_PAGE = '<svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3.2" y="2" width="9.6" height="12" rx="1"/><path d="M5.6 5.4h4.8M5.6 8h4.8M5.6 10.6h3"/></svg>';
  const store = {
    get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* private mode */ } }
  };
  const calm = () => window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
  const narrow = () => window.matchMedia && matchMedia("(max-width: 620px)").matches;

  function mount(host, pdfUrl, opts) {
    opts = opts || {};
    const T = Object.assign({}, EN, opts.strings || {});
    const url = new URL(pdfUrl, document.baseURI).href;   // PDF.js ignores <base>
    const textUrl = opts.text ? new URL(opts.text, document.baseURI).href : null;
    let alive = true;
    host.classList.add("hv-host");
    host.innerHTML = `
      ${textUrl ? `<div class="hv-modes" role="toolbar" aria-label="${esc(T.view)}" hidden>
        <div class="hv-seg" role="group" aria-label="${esc(T.view)}">
          <button type="button" data-mode="scroll" title="${esc(T.scrollTip)}" aria-pressed="false">${ICON_SCROLL}<span>${esc(T.scroll)}</span></button>
          <button type="button" data-mode="page" title="${esc(T.pageTip)}" aria-pressed="true">${ICON_PAGE}<span>${esc(T.page)}</span></button>
        </div>
        <div class="hv-size" role="group" aria-label="${esc(T.size)}">
          <button type="button" data-size="-1" title="${esc(T.smaller)}" aria-label="${esc(T.smaller)}">A</button>
          <button type="button" data-size="1" title="${esc(T.larger)}" aria-label="${esc(T.larger)}" class="hv-size-up">A</button>
        </div>
      </div>
      <div class="pt-read" tabindex="0" role="region" aria-label="${esc(T.text)}"><div class="pt-page"><p class="pt-wait">${esc(T.textLoading)}</p></div></div>` : ""}
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

    // the page count joins the date under the title, once, from whichever view loads first
    let reported = false;
    function report(n) { if (!reported && n && opts.onPages) { reported = true; opts.onPages(n); } }

    /* ── Page view: the PDF's pages ── */
    let z = 1;                                   // the design's 100% (a phone's width once measured)
    let sizes = [{ w: 612, h: 792 }, { w: 612, h: 792 }];
    let frames = [], pages = [], drawnAt = [], current = 1, loadingPhase = true, pdfStarted = false, pendingPage = 0;
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
    function go(p, instant) {
      p = Math.min(pages.length, Math.max(1, p));
      scroll.scrollTo({ top: frames[p - 1].offsetTop - pad().top, behavior: instant || calm() ? "auto" : "smooth" });
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

    function startPdf() {
      if (pdfStarted) return;
      pdfStarted = true;
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
          const p = host.querySelector(".hv-progress");
          if (p) p.remove();
          status.remove();
          scroll.removeAttribute("aria-busy");
          pagesEl.style.width = "auto";
          pagesEl.innerHTML = `<p class="hv-fail">${esc(T.fail)} <a href="${esc(url)}" target="_blank" rel="noopener">${esc(T.open)}</a></p>`;
          return;
        }
        if (!alive) return;
        sizes = pages.map(p => { const v = p.getViewport({ scale: 1 }); return { w: v.width, h: v.height }; });
        build();
        report(pages.length);
        if (pendingPage > 1) { current = Math.min(pages.length, pendingPage); scroll.scrollTop = frames[current - 1].offsetTop - pad().top; }
        pendingPage = 0;
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
    }

    /* ── Scroll view: the paper as running text ── */
    const modes = host.querySelector(".hv-modes");
    const read = host.querySelector(".pt-read"), sheet = host.querySelector(".pt-page");
    let mode = "page", textReady = false, sizeIx = SIZE_DEFAULT;
    let pop = null, popAnchor = null, popTimer = 0, borrowed = null, borrowSlot = null;
    const offs = [];                             // listeners on document/window, removed on destroy
    const on = (target, type, fn, o) => { target.addEventListener(type, fn, o); offs.push(() => target.removeEventListener(type, fn, o)); };

    function applySize() {
      if (!read) return;
      read.style.setProperty("--pt-size", SIZES[sizeIx] + "px");
      modes.querySelector('[data-size="-1"]').disabled = sizeIx <= 0;
      modes.querySelector('[data-size="1"]').disabled = sizeIx >= SIZES.length - 1;
    }
    /* What scrolls the text. On a wide screen the text has a box of its own;
       on a phone it flows down the reader's page, with the title and comments
       after it (pdf-pages.css), so the reader's own scroll carries it. */
    function scroller() {
      if (/(auto|scroll)/.test(getComputedStyle(read).overflowY)) return read;
      for (let el = host.parentElement; el; el = el.parentElement) {
        if (/(auto|scroll)/.test(getComputedStyle(el).overflowY)) return el;
      }
      return document.scrollingElement || document.documentElement;
    }
    // the top of what can be read: below the Reader mode bar where it is pinned
    function viewTop() {
      const sc = scroller();
      const top = sc === document.scrollingElement ? 0 : sc.getBoundingClientRect().top;
      return sc === read ? top : Math.max(top, modes.getBoundingClientRect().bottom);
    }
    // the PDF page at the top of the text: the last page marker above the
    // reading line, or the page before the first marker
    function textPage() {
      const marks = sheet.querySelectorAll(".pgb[data-i]");
      if (!marks.length) return 1;
      const line = viewTop() + Math.min(120, scroller().clientHeight * 0.25);
      let p = Math.max(1, +marks[0].dataset.i - 1);
      for (const m of marks) { if (m.getBoundingClientRect().top <= line) p = +m.dataset.i; else break; }
      return p;
    }
    function showTextPage(p) {
      const sc = scroller();
      let target = null;
      if (p > 1) for (const m of sheet.querySelectorAll(".pgb[data-i]")) { if (+m.dataset.i <= p) target = m; else break; }
      if (!target) {
        if (sc === read) read.scrollTop = 0;
        else { const up = host.getBoundingClientRect().top - viewTop(); if (up < 0) sc.scrollTop += up; }
        return;
      }
      const block = target.closest("p, h2, h3, h4, .tbl-wrap, td, th") || target;
      const y = (target.classList.contains("pgb-lead") ? block : target).getBoundingClientRect().top;
      sc.scrollTop += y - viewTop() - 28;
    }
    function setMode(m, remember) {
      if (m === mode || (m === "scroll" && !textReady)) return;
      const from = mode === "scroll" ? textPage() : current;
      hidePop();
      mode = m;
      host.classList.toggle("pt-on", m === "scroll");
      modes.querySelectorAll("[data-mode]").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.mode === m)));
      // a phone always opens in Reader mode, so a switch there is not remembered
      if (remember && !narrow()) store.set(VIEW_KEY, m);
      if (m === "scroll") {
        showTextPage(from);
        /* Focus the text only when the reader chose Reader mode just now, so
           the arrow keys scroll it. Done on opening, Safari drew its focus
           ring round the pane after a Command-R reload (Joshua, 2026-11-09):
           the key press makes the focus look keyboard-driven. */
        if (remember) read.focus({ preventScroll: true });
      } else {
        startPdf();
        if (pages.length) go(from, true);
        else pendingPage = from;
      }
    }

    function returnNote() {
      if (borrowed && borrowSlot && borrowSlot.parentNode) borrowSlot.parentNode.replaceChild(borrowed, borrowSlot);
      borrowed = borrowSlot = null;
    }
    function place(anchor) {
      if (narrow()) { pop.style.left = ""; pop.style.top = ""; return; }
      const r = anchor.getBoundingClientRect(), w = pop.offsetWidth, h = pop.offsetHeight;
      let left = r.left + r.width / 2 - w / 2;
      left = Math.max(10, Math.min(left, innerWidth - w - 10));
      let top = (r.top - h - 9 > 8) ? r.top - h - 9 : r.bottom + 9;
      top = Math.max(8, Math.min(top, innerHeight - h - 8));
      pop.style.left = left + "px"; pop.style.top = top + "px";
    }
    /* The popup borrows the note's live nodes rather than a copy, as the
       commentary's does: the verse links RefTagger made inside a note keep
       their tooltips only on the elements it bound them to. */
    function showPop(anchor) {
      clearTimeout(popTimer);
      const note = sheet.querySelector(`.note[data-fn="${CSS.escape(anchor.dataset.f)}"]`);
      const body = note && note.querySelector(":scope > span + span");
      if (!body) return;
      if (!pop) {
        pop = document.createElement("div");
        pop.className = "pt-pop";
        pop.setAttribute("role", "dialog");
        pop.innerHTML = `<div class="pt-pop-h"><span class="pt-pop-l"></span><button type="button" class="pt-pop-x" aria-label="${esc(T.close)}"><svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" aria-hidden="true"><path d="M1 1l8 8M9 1l-8 8"/></svg></button></div><div class="pt-pop-b"></div>`;
        pop.querySelector(".pt-pop-x").addEventListener("click", hidePop);
        pop.addEventListener("mouseenter", () => clearTimeout(popTimer));
        pop.addEventListener("mouseleave", () => { if (!narrow()) hideSoon(); });
        document.body.appendChild(pop);
      }
      if (popAnchor && popAnchor !== anchor) popAnchor.classList.remove("lit");
      returnNote();
      popAnchor = anchor;
      anchor.classList.add("lit");
      const label = T.note + " " + anchor.textContent.trim();
      pop.querySelector(".pt-pop-l").textContent = label;
      pop.setAttribute("aria-label", label);
      const b = pop.querySelector(".pt-pop-b");
      b.innerHTML = "";
      borrowed = body;
      borrowSlot = document.createComment("note");
      body.parentNode.replaceChild(borrowSlot, body);
      b.appendChild(body);
      pop.style.left = "-9999px"; pop.style.top = "-9999px";
      pop.classList.add("show");
      place(anchor);
    }
    /* Close a hovered note once the pointer has left it, but not while it is on
       the verse preview RefTagger opened from a link in the note: that preview
       is drawn outside the popup, and reaching its "more »" would otherwise
       close the note underneath it. */
    function hideSoon() {
      clearTimeout(popTimer);
      popTimer = setTimeout(function check() {
        if ((pop && pop.matches(":hover")) || (popAnchor && popAnchor.matches(":hover")) ||
            document.querySelector(".rtTooltip:hover")) { popTimer = setTimeout(check, 300); return; }
        hidePop();
      }, 220);
    }
    function hidePop() {
      clearTimeout(popTimer);
      if (pop) pop.classList.remove("show");
      returnNote();
      if (popAnchor) { popAnchor.classList.remove("lit"); popAnchor = null; }
    }

    function wireText() {
      sheet.addEventListener("click", e => {
        const m = e.target.closest(".fnm");
        if (!m) return;
        e.stopPropagation();
        if (popAnchor === m && pop && pop.classList.contains("show")) hidePop(); else showPop(m);
      });
      sheet.addEventListener("keydown", e => {
        const m = e.target.closest(".fnm");
        if (m && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); showPop(m); }
      });
      sheet.addEventListener("mouseover", e => {
        const m = e.target.closest(".fnm");
        if (!m || narrow()) return;
        clearTimeout(popTimer);
        popTimer = setTimeout(() => showPop(m), 260);
      });
      sheet.addEventListener("mouseout", e => {
        const m = e.target.closest(".fnm");
        if (!m || narrow() || m.contains(e.relatedTarget)) return;
        hideSoon();
      });
      read.addEventListener("scroll", () => {
        if (!popAnchor || narrow()) return;
        const r = popAnchor.getBoundingClientRect(), v = read.getBoundingClientRect();
        if (r.bottom < v.top || r.top > v.bottom) hidePop(); else place(popAnchor);
      }, { passive: true });
      on(document, "click", e => { if (pop && !pop.contains(e.target) && !e.target.closest(".fnm, .rtTooltip")) hidePop(); });
      // Escape closes the note first, and only the note
      on(window, "keydown", e => {
        if (e.key === "Escape" && pop && pop.classList.contains("show")) { e.stopPropagation(); e.preventDefault(); hidePop(); }
      }, true);
      on(window, "resize", () => { if (popAnchor) place(popAnchor); });
    }

    if (textUrl) {
      const saved = parseInt(store.get(SIZE_KEY), 10);
      if (SIZES.indexOf(saved) >= 0) sizeIx = SIZES.indexOf(saved);
      applySize();
      modes.addEventListener("click", e => {
        const b = e.target.closest("button");
        if (!b || b.disabled) return;
        if (b.dataset.mode) setMode(b.dataset.mode, true);
        else if (b.dataset.size) {
          // keep the paragraph being read where it is while the type changes size
          const line = viewTop() + 40;
          let keep = null, off = 0;
          for (const el of sheet.querySelectorAll("p, h2, h3, h4, .tbl-wrap")) {
            const r = el.getBoundingClientRect();
            if (r.bottom > line) { keep = el; off = r.top - line; break; }
          }
          sizeIx = Math.max(0, Math.min(SIZES.length - 1, sizeIx + +b.dataset.size));
          applySize();
          store.set(SIZE_KEY, String(SIZES[sizeIx]));
          if (keep) scroller().scrollTop += keep.getBoundingClientRect().top - (viewTop() + 40) - off;
          if (popAnchor) place(popAnchor);
        }
      });
      /* A phone always opens a paper in Reader mode (Joshua, 2026-11-11: "Make
         mobile always open papers in Reader Mode"); elsewhere the last choice. */
      const want = narrow() || store.get(VIEW_KEY) === "scroll" ? "scroll" : "page";
      if (want === "scroll") host.classList.add("pt-on", "pt-pending");
      else startPdf();
      fetch(textUrl).then(r => { if (!r.ok) throw new Error(r.status); return r.text(); }).then(src => {
        if (!alive) return;
        const art = new DOMParser().parseFromString(src, "text/html").querySelector("article.pt-doc");
        if (!art) throw new Error("no text");
        sheet.innerHTML = "";
        sheet.appendChild(document.adoptNode(art));
        sheet.querySelectorAll(".pgb[data-p]").forEach(m => { m.title = T.pageNo.replace("{n}", m.dataset.p); });
        textReady = true;
        modes.hidden = false;
        host.classList.add("hv-moded");
        host.classList.remove("pt-pending");
        wireText();
        // verse links, as on the articles: scripture-context.js only watches
        // the article pane by itself, so it is handed the text
        if (window.rescanScripture) { try { window.rescanScripture(art); } catch (e) { /* the text reads without them */ } }
        if (want === "scroll") { mode = "page"; host.classList.remove("pt-on"); setMode("scroll", false); report(+art.dataset.pages); }
      }).catch(() => {
        // no text for this paper: the pages are all there is
        if (!alive) return;
        host.classList.remove("pt-on", "pt-pending");
        if (modes) modes.remove();
        if (read) read.remove();
        startPdf();
      });
    } else {
      startPdf();
    }

    return {
      destroy() {
        alive = false;
        clearTimeout(timer);
        hidePop();
        if (pop) pop.remove();
        offs.forEach(f => f());
        if (nearObs) nearObs.disconnect();
        if (farObs) farObs.disconnect();
        host.classList.remove("hv-host", "hv-moded", "pt-on", "pt-pending");
      }
    };
  }

  window.PdfPages = { mount, loadPdfJs };
})();
