/* Slide viewer: plays a PowerPoint deck the way PowerPoint plays it.

   The deck is prepared by slides-build/build_slides.py: every object on every
   slide is PowerPoint's own rendering of it (an SVG layer), and deck.json says
   where each one sits, which clicks build it, and how each morph pairs the
   objects of one slide with the next. This file only plays that back.

   The timings below were measured from PowerPoint's movie export of the NT
   Canon deck, frame by frame:
   - a morphing object follows cubic-bezier(.25,.15,.35,1) over the morph's
     whole duration (fit error under 0.5% at every frame);
   - an object that has no partner fades out between 2.5% and 26.5% of the
     morph, easing in;
   - a new object stays hidden until 44.5% and then fades in, easing out;
   - Wipe (filter "wipe(down)") uncovers from the bottom edge up, at an even
     speed, over the object's on-screen bounds;
   - text that re-wraps moves word by word, not as a block.

   SlideViewer.mount(element, {base, lang, pdf}) → {destroy, setLang}
*/
(function () {
  "use strict";

  /* ------------------------------------------------------------ easing */

  function cubicBezier(x1, y1, x2, y2) {
    const cx = 3 * x1, bx = 3 * (x2 - x1) - cx, ax = 1 - cx - bx;
    const cy = 3 * y1, by = 3 * (y2 - y1) - cy, ay = 1 - cy - by;
    const X = t => ((ax * t + bx) * t + cx) * t;
    const Y = t => ((ay * t + by) * t + cy) * t;
    const dX = t => (3 * ax * t + 2 * bx) * t + cx;
    return function (x) {
      if (x <= 0) return 0;
      if (x >= 1) return 1;
      let t = x;
      for (let i = 0; i < 8; i++) {
        const e = X(t) - x;
        if (Math.abs(e) < 1e-6) return Y(t);
        const d = dX(t);
        if (Math.abs(d) < 1e-6) break;
        t -= e / d;
      }
      let lo = 0, hi = 1;
      t = x;
      for (let i = 0; i < 32; i++) {
        const v = X(t);
        if (Math.abs(v - x) < 1e-6) break;
        if (v < x) lo = t; else hi = t;
        t = (lo + hi) / 2;
      }
      return Y(t);
    };
  }

  const MORPH = cubicBezier(0.25, 0.15, 0.35, 1);
  const FADE_OUT = { from: 0.025, to: 0.265, ease: cubicBezier(0.4, 0, 1, 1) };
  const FADE_IN = { from: 0.445, to: 1.0, ease: cubicBezier(0.2, 0.4, 0.4, 1) };

  function windowed(p, w) {
    return w.ease(Math.min(1, Math.max(0, (p - w.from) / (w.to - w.from))));
  }

  /* PowerPoint's "smooth start / smooth end" (SMIL accelerate/decelerate):
     speed ramps up over the first `a` of the time, down over the last `d`. */
  function warp(t, a, d) {
    if (!a && !d) return t;
    const r = 1 / (1 - a / 2 - d / 2);
    if (t < a) return r * t * t / (2 * a);
    if (t <= 1 - d) return r * (t - a / 2);
    const u = t - (1 - d);
    return r * (t - a / 2) - r * u * u / (2 * d);
  }

  /* A motion path ("M 0 0 L 0.25 0 E", fractions of the slide), walked at an
     even speed along its length. */
  function pathFn(str) {
    const tok = String(str || "").trim().split(/[\s,]+/);
    const pts = [];
    let cur = [0, 0], start = [0, 0], i = 0, cmd = "M";
    const num = () => parseFloat(tok[i++]);
    while (i < tok.length) {
      if (/^[A-Za-z]$/.test(tok[i])) cmd = tok[i++];
      const rel = cmd === cmd.toLowerCase();
      const C = cmd.toUpperCase();
      if (C === "E") break;
      if (C === "Z") { pts.push(start.slice()); cur = start.slice(); continue; }
      if (C === "M" || C === "L") {
        let p = [num(), num()];
        if (rel) p = [cur[0] + p[0], cur[1] + p[1]];
        if (C === "M") start = p.slice();
        pts.push(p);
        cur = p;
      } else if (C === "C") {
        let p1 = [num(), num()], p2 = [num(), num()], p3 = [num(), num()];
        if (rel) { p1 = [cur[0] + p1[0], cur[1] + p1[1]]; p2 = [cur[0] + p2[0], cur[1] + p2[1]]; p3 = [cur[0] + p3[0], cur[1] + p3[1]]; }
        const p0 = cur;
        for (let k = 1; k <= 24; k++) {
          const t = k / 24, m = 1 - t;
          pts.push([m * m * m * p0[0] + 3 * m * m * t * p1[0] + 3 * m * t * t * p2[0] + t * t * t * p3[0],
                    m * m * m * p0[1] + 3 * m * m * t * p1[1] + 3 * m * t * t * p2[1] + t * t * t * p3[1]]);
        }
        cur = p3;
      } else {
        i++;
      }
    }
    if (!pts.length) pts.push([0, 0]);
    const len = [0];
    for (let k = 1; k < pts.length; k++) {
      len.push(len[k - 1] + Math.hypot(pts[k][0] - pts[k - 1][0], pts[k][1] - pts[k - 1][1]));
    }
    const total = len[len.length - 1];
    return function (p) {
      if (pts.length === 1 || total === 0) return pts[pts.length - 1].slice();
      const want = Math.min(1, Math.max(0, p)) * total;
      let k = 1;
      while (k < len.length - 1 && len[k] < want) k++;
      const seg = len[k] - len[k - 1] || 1;
      const f = (want - len[k - 1]) / seg;
      return [pts[k - 1][0] + (pts[k][0] - pts[k - 1][0]) * f,
              pts[k - 1][1] + (pts[k][1] - pts[k - 1][1]) * f];
    };
  }

  const lerp = (a, b, t) => a + (b - a) * t;
  const lerpBox = (a, b, t) => ({ x: lerp(a.x, b.x, t), y: lerp(a.y, b.y, t), w: lerp(a.w, b.w, t), h: lerp(a.h, b.h, t) });

  /* ------------------------------------------------------------ strings */

  const STR = {
    en: { prev: "Previous", next: "Next", slides: "Slides", full: "Full screen", exitFull: "Exit full screen",
          slide: "Slide", of: "of", hint: "Click the slide or press → to advance", loading: "Loading slides…",
          failed: "The slides couldn't load. Try reloading the page.", end: "End of slides" },
    es: { prev: "Anterior", next: "Siguiente", slides: "Diapositivas", full: "Pantalla completa", exitFull: "Salir de pantalla completa",
          slide: "Diapositiva", of: "de", hint: "Haz clic en la diapositiva o pulsa → para avanzar", loading: "Cargando diapositivas…",
          failed: "No se pudieron cargar las diapositivas. Vuelve a cargar la página.", end: "Fin de las diapositivas" },
  };

  const ICON = {
    prev: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5l-7 7 7 7"/></svg>',
    next: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 5l7 7-7 7"/></svg>',
    full: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/></svg>',
    exitFull: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5"/></svg>',
  };

  const reducedMotion = () => window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ------------------------------------------------------------ viewer */

  function mount(root, opts) {
    const base = opts.base.replace(/\/?$/, "/");
    let lang = STR[opts.lang] ? opts.lang : "en";
    const t = k => STR[lang][k];

    root.classList.add("sv");
    root.setAttribute("tabindex", "0");
    root.setAttribute("role", "region");
    root.setAttribute("aria-roledescription", "slides");
    root.innerHTML = `
      <div class="sv-stage">
        <div class="sv-col">
          <div class="sv-frame">
            <div class="sv-canvas"></div>
            <div class="sv-status" role="status"></div>
          </div>
          <div class="sv-bar">
            <button type="button" class="sv-btn sv-prev">${ICON.prev}</button>
            <button type="button" class="sv-btn sv-next">${ICON.next}</button>
            <div class="sv-rail" role="slider" tabindex="-1" aria-valuemin="1">
              <div class="sv-rail-track"><div class="sv-rail-fill"></div></div>
            </div>
            <span class="sv-count"></span>
            <button type="button" class="sv-btn sv-full-btn">${ICON.full}</button>
          </div>
        </div>
      </div>
      <div class="sv-sr" aria-live="polite"></div>`;

    const q = s => root.querySelector(s);
    const stage = q(".sv-stage"), col = q(".sv-col"), frame = q(".sv-frame"), canvas = q(".sv-canvas"), status = q(".sv-status");
    const countEl = q(".sv-count"), srEl = q(".sv-sr"), rail = q(".sv-rail"), railFill = q(".sv-rail-fill");
    const prevBtn = q(".sv-prev"), nextBtn = q(".sv-next"), fullBtn = q(".sv-full-btn"), bar = q(".sv-bar");

    let deck = null, view = null, cur = { i: 0, k: 0 }, run = null, advTimer = null, busy = false, destroyed = false;
    const statesCache = {};
    let idle = null;

    function paintLabels() {
      prevBtn.setAttribute("aria-label", t("prev")); prevBtn.title = t("prev") + " (←)";
      nextBtn.setAttribute("aria-label", t("next")); nextBtn.title = t("next") + " (→)";
      const isFull = root.classList.contains("sv-is-full");
      fullBtn.setAttribute("aria-label", isFull ? t("exitFull") : t("full"));
      fullBtn.title = (isFull ? t("exitFull") : t("full")) + " (F)";
      fullBtn.innerHTML = isFull ? ICON.exitFull : ICON.full;
      frame.title = t("hint");
      rail.setAttribute("aria-label", t("slides"));
      root.setAttribute("aria-label", (deck && deck.title) || t("slides"));
      if (!deck) status.textContent = t("loading");
      paintCount();
    }

    function paintCount() {
      if (!deck) return;
      const n = deck.slides.length;
      countEl.textContent = `${cur.i + 1} / ${n}`;
      rail.setAttribute("aria-valuemax", String(n));
      rail.setAttribute("aria-valuenow", String(cur.i + 1));
      rail.setAttribute("aria-valuetext", `${t("slide")} ${cur.i + 1} ${t("of")} ${n}`);
      railFill.style.width = (n > 1 ? (cur.i / (n - 1)) * 100 : 100) + "%";
      prevBtn.disabled = cur.i === 0 && cur.k === 0;
      const s = deck.slides[cur.i];
      nextBtn.disabled = cur.i === n - 1 && cur.k >= s.steps.length && !run;
      if (opts.onSlide && cur.i !== lastReported) { lastReported = cur.i; opts.onSlide(cur.i, deck); }
    }
    let lastReported = -1;

    /* -- sizing: the slide is laid out at its own size (960×540 pt) and
          scaled to fit, so every layer keeps PowerPoint's coordinates. */
    function fit() {
      const dw = deck ? deck.w : 960, dh = deck ? deck.h : 540;
      const cs = getComputedStyle(stage);
      const w = stage.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
      // the toolbar sits under the slide, except in full screen where it floats over it
      const under = root.classList.contains("sv-is-full") ? 0 : bar.offsetHeight;
      const h = stage.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom) - under;
      const s = Math.max(0.05, Math.min(w / dw, h / dh));
      col.style.width = dw * s + "px";
      frame.style.height = dh * s + "px";
      canvas.style.transform = `scale(${s})`;
    }
    const ro = new ResizeObserver(fit);
    ro.observe(stage);

    /* -- layers */
    const src = key => base + "layers/" + key + ".svg";

    function place(el, x, y, w, h) {
      el.style.left = x + "px"; el.style.top = y + "px";
      el.style.width = w + "px"; el.style.height = h + "px";
    }

    function layerImg(key) {
      const m = deck.layers[key];
      const img = document.createElement("img");
      img.className = "sv-layer";
      img.alt = "";
      img.draggable = false;
      img.decoding = "async";
      img.src = src(key);
      place(img, m.x, m.y, m.w, m.h);
      return img;
    }

    /* One piece of a text layer — a word, a run, a band of lines — cut out so
       it can travel on its own path. rect is [x0,y0,x1,y1] in the object's
       frame; the piece is placed at frame + rect. */
    function clipOf(key, rect, at) {
      const m = deck.layers[key];
      const pad = 1;
      const x0 = rect[0] - pad, y0 = rect[1] - pad, w = rect[2] - rect[0] + 2 * pad, h = rect[3] - rect[1] + 2 * pad;
      const wrap = document.createElement("div");
      wrap.className = "sv-clip";
      place(wrap, at.x + x0, at.y + y0, w, h);
      const img = document.createElement("img");
      img.className = "sv-layer";
      img.alt = "";
      img.draggable = false;
      img.src = src(key);
      place(img, m.x - x0, m.y - y0, m.w, m.h);
      wrap.appendChild(img);
      wrap._origin = { x: at.x + rect[0], y: at.y + rect[1], h: rect[3] - rect[1] };
      return wrap;
    }

    function buildView(i) {
      const s = deck.slides[i];
      const el = document.createElement("div");
      el.className = "sv-slide";
      const shapes = {};
      for (const sh of s.shapes) {
        const d = document.createElement("div");
        d.className = "sv-shape";
        place(d, sh.box.x, sh.box.y, sh.box.w, sh.box.h);
        const layers = {}, links = [];
        for (const L of sh.layers) {
          const img = layerImg(L.key);
          d.appendChild(img);
          layers[L.lid] = img;
          for (const ln of deck.layers[L.key].links || []) {
            const a = document.createElement("a");
            a.className = "sv-link";
            a.href = ln.uri;
            a.target = "_blank";
            a.rel = "noopener noreferrer";
            a.setAttribute("aria-label", ln.uri);
            place(a, ln.x, ln.y, ln.w, ln.h);
            a._lid = L.lid;
            d.appendChild(a);
            links.push(a);
          }
        }
        el.appendChild(d);
        shapes[sh.uid] = { sh, el: d, layers, links };
      }
      return { i, s, el, shapes, states: states(i) };
    }

    /* Which layers are hidden, and how far motion paths have carried each
       object, before click 0, after click 1, … after the last click. */
    function states(i) {
      if (statesCache[i]) return statesCache[i];
      const s = deck.slides[i];
      const out = [];
      const hidden = new Set(s.start);
      const motion = {};
      out.push({ hidden: new Set(hidden), motion: Object.assign({}, motion) });
      for (const st of s.steps) {
        const evs = [];
        for (const e of st.effects) for (const b of e.beh) evs.push({ t: e.t + b.t, e, b });
        evs.sort((x, y) => x.t - y.t);
        for (const { e, b } of evs) {
          if (b.kind === "set" && b.attr === "style.visibility") {
            for (const l of e.layers) b.to === "visible" ? hidden.delete(l) : hidden.add(l);
          } else if (b.kind === "animMotion") {
            const end = pathFn(b.path)(1), was = motion[e.shape] || [0, 0];
            motion[e.shape] = [was[0] + end[0] * deck.w, was[1] + end[1] * deck.h];
          }
        }
        out.push({ hidden: new Set(hidden), motion: Object.assign({}, motion) });
      }
      statesCache[i] = out;
      return out;
    }

    function setVisible(v, lid, on) {
      for (const uid in v.shapes) {
        const sh = v.shapes[uid];
        const img = sh.layers[lid];
        if (!img) continue;
        img.style.visibility = on ? "visible" : "hidden";
        for (const a of sh.links) if (a._lid === lid) a.style.visibility = on ? "visible" : "hidden";
      }
    }

    function applyState(v, st) {
      for (const uid in v.shapes) {
        const sh = v.shapes[uid];
        sh.el.style.transform = "";
        sh.el.style.opacity = "";
        for (const lid in sh.layers) {
          const img = sh.layers[lid];
          img.style.opacity = "";
          img.style.clipPath = "";
          img.style.visibility = st.hidden.has(lid) ? "hidden" : "visible";
        }
        for (const a of sh.links) a.style.visibility = st.hidden.has(a._lid) ? "hidden" : "visible";
        const m = st.motion[uid];
        if (m) sh.el.style.transform = `translate(${m[0]}px, ${m[1]}px)`;
      }
    }

    /* -- the clock: tracks are {t0, dur, fn(p)}; fn is called with p in
          [0,1] once the track has started, and with 1 when it ends or when
          the run is cut short. */
    function play(tracks, total, onEnd) {
      const r = { done: false, raf: 0 };
      const t0 = performance.now();
      const end = () => {
        if (r.done) return;
        r.done = true;
        cancelAnimationFrame(r.raf);
        for (const tr of tracks) if (!tr.over) { tr.fn(1); tr.over = true; }
        onEnd();
      };
      r.finish = end;
      /* For checking against PowerPoint's movie: hold the animation at `ms`. */
      r.at = ms => {
        cancelAnimationFrame(r.raf);
        for (const tr of tracks) {
          if (ms < tr.t0) continue;
          tr.fn(tr.dur > 0 ? Math.min(1, (ms - tr.t0) / tr.dur) : 1);
        }
      };
      const tick = now => {
        const el = now - t0;
        for (const tr of tracks) {
          if (tr.over || el < tr.t0) continue;
          const p = tr.dur > 0 ? Math.min(1, (el - tr.t0) / tr.dur) : 1;
          tr.fn(p);
          if (p >= 1) tr.over = true;
        }
        if (el >= total && tracks.every(tr => tr.over)) end();
        else r.raf = requestAnimationFrame(tick);
      };
      if (reducedMotion()) { r.raf = requestAnimationFrame(() => end()); return r; }
      r.raf = requestAnimationFrame(tick);
      return r;
    }

    function effectFrame(img, filter, isIn, p) {
      const shown = isIn ? p : 1 - p;
      if (!filter || filter === "fade") {
        img.style.opacity = shown >= 1 ? "" : String(shown);
        return;
      }
      const m = /^wipe\((\w+)\)/.exec(filter);
      if (m) {
        const cut = ((1 - shown) * 100).toFixed(3) + "%";
        const inset = { down: `${cut} 0 0 0`, up: `0 0 ${cut} 0`, right: `0 ${cut} 0 0`, left: `0 0 0 ${cut}` }[m[1]] || `${cut} 0 0 0`;
        img.style.clipPath = shown >= 1 ? "" : `inset(${inset})`;
        return;
      }
      img.style.opacity = shown >= 1 ? "" : String(shown);    // unknown effect: fade
    }

    function playStep(k, onDone) {
      const v = view, s = v.s, st = s.steps[k];
      applyState(v, v.states[k]);
      const tracks = [];
      for (const e of st.effects) {
        for (const b of e.beh) {
          const t0 = e.t + b.t, dur = Math.max(0, b.dur);
          if (b.kind === "set" && b.attr === "style.visibility") {
            tracks.push({ t0, dur: 0, fn: () => { for (const l of e.layers) setVisible(v, l, b.to === "visible"); } });
          } else if (b.kind === "animEffect") {
            const isIn = b.transition !== "out";
            const imgs = e.layers.map(l => { for (const u in v.shapes) if (v.shapes[u].layers[l]) return v.shapes[u].layers[l]; }).filter(Boolean);
            if (isIn) imgs.forEach(img => effectFrame(img, b.filter, true, 0));
            tracks.push({ t0, dur, fn: p => imgs.forEach(img => effectFrame(img, b.filter, isIn, p)) });
          } else if (b.kind === "animMotion") {
            const sh = v.shapes[e.shape];
            if (!sh) continue;
            const path = pathFn(b.path), was = v.states[k].motion[e.shape] || [0, 0];
            const a = e.accel || b.accel || 0, d = e.decel || b.decel || 0;
            tracks.push({ t0, dur, fn: p => {
              const pt = path(warp(p, a, d));
              sh.el.style.transform = `translate(${was[0] + pt[0] * deck.w}px, ${was[1] + pt[1] * deck.h}px)`;
            } });
          }
        }
      }
      run = play(tracks, st.dur, () => {
        run = null;
        applyState(v, v.states[k + 1]);
        cur.k = k + 1;
        paintCount();
        if (onDone) onDone();
      });
      paintCount();
    }

    /* -- arriving on a slide: run its automatic opening build, then the
          slide's own timer, if it has one. */
    function arrive(forward) {
      const s = view.s;
      announce();
      prefetch(cur.i + 1);
      prefetch(cur.i + 2);
      const after = () => {
        const adv = s.transition.advAfter;
        if (forward && adv != null && cur.k >= s.steps.length && cur.i < deck.slides.length - 1) {
          advTimer = setTimeout(() => { advTimer = null; next(); }, adv);
        }
      };
      if (s.steps.length && s.steps[0].auto) playStep(0, after);
      else after();
    }

    function announce() {
      const s = view.s;
      srEl.textContent = `${t("slide")} ${cur.i + 1} ${t("of")} ${deck.slides.length}. ${s.text.replace(/\s+/g, " ")}`;
    }

    const fetched = new Set();
    function prefetch(i) {
      if (!deck || i < 0 || i >= deck.slides.length) return;
      for (const sh of deck.slides[i].shapes) {
        for (const key of [sh.all, sh.base].concat(sh.layers.map(l => l.key))) {
          if (!key || fetched.has(key)) continue;
          fetched.add(key);
          const im = new Image();
          im.src = src(key);
        }
      }
    }

    function ready(v) {
      const imgs = Array.from(v.el.querySelectorAll("img"));
      const all = Promise.all(imgs.map(im => (im.decode ? im.decode() : Promise.resolve()).catch(() => {})));
      return Promise.race([all, new Promise(r => setTimeout(r, 2500))]);
    }

    function show(v, st) {
      applyState(v, st);
      canvas.replaceChildren(v.el);
      view = v;
    }

    async function cutTo(i, where, forward) {
      clearTimeout(advTimer);
      busy = true;
      const v = buildView(i);
      const st = where === "end" ? v.states[v.states.length - 1] : v.states[0];
      applyState(v, st);
      v.el.style.visibility = "hidden";
      canvas.appendChild(v.el);
      await ready(v);
      if (destroyed) return;
      v.el.style.visibility = "";
      show(v, st);
      cur = { i, k: where === "end" ? v.s.steps.length : 0 };
      busy = false;
      paintCount();
      if (where === "end") announce();
      else arrive(forward);
    }

    async function morphTo(j) {
      clearTimeout(advTimer);
      busy = true;
      const A = view, B = buildView(j);
      const tr = B.s.transition, D = tr.dur;
      const aState = A.states[A.states.length - 1];
      applyState(B, B.states[0]);
      B.el.style.visibility = "hidden";
      canvas.appendChild(B.el);
      await ready(B);
      if (destroyed) return;
      B.el.style.visibility = "";
      busy = false;

      const geomA = uid => {
        const b = A.shapes[uid].sh.box, m = aState.motion[uid] || [0, 0];
        return { x: b.x + m[0], y: b.y + m[1], w: b.w, h: b.h };
      };
      const setGeom = (el, home, g, stretch) => {
        const sx = stretch && home.w ? g.w / home.w : 1, sy = stretch && home.h ? g.h / home.h : 1;
        el.style.transform = `translate(${g.x - home.x}px, ${g.y - home.y}px) scale(${sx}, ${sy})`;
      };
      const tracks = [], extras = [];
      const track = fn => tracks.push({ t0: 0, dur: D, fn });

      for (const pr of tr.pairs || []) {
        const a = A.shapes[pr.a], b = B.shapes[pr.b];
        if (!a || !b) continue;
        const ga = geomA(pr.a), gb = b.sh.box;
        if (pr.mode === "move") {
          a.el.style.opacity = "0";
          const stretch = !b.sh.text;
          track(p => setGeom(b.el, gb, lerpBox(ga, gb, MORPH(p)), stretch));
        } else if (pr.mode === "cross") {
          track(p => {
            const g = lerpBox(ga, gb, MORPH(p));
            setGeom(a.el, ga, g, !a.sh.text);
            a.el.style.opacity = String(1 - windowed(p, FADE_OUT));
            setGeom(b.el, gb, g, !b.sh.text);
            b.el.style.opacity = String(windowed(p, FADE_IN));
          });
        } else if (pr.mode === "words") {
          a.el.style.opacity = "0";
          b.el.style.opacity = "0";
          const box = document.createElement("div");
          box.className = "sv-morph";
          b.el.after(box);
          extras.push(box);
          if (b.sh.base) {
            const holder = document.createElement("div");
            holder.className = "sv-shape";
            place(holder, gb.x, gb.y, gb.w, gb.h);
            holder.appendChild(layerImg(b.sh.base));
            box.appendChild(holder);
            track(p => setGeom(holder, gb, lerpBox(ga, gb, MORPH(p)), true));
          }
          for (const g of pr.segs) {
            const wa = clipOf(a.sh.all, g.a, ga);
            box.appendChild(wa);
            const ax = ga.x + g.a[0], ay = ga.y + g.a[1], bx = gb.x + g.b[0], by = gb.y + g.b[1];
            const ha = g.a[3] - g.a[1], hb = g.b[3] - g.b[1], k = ha ? hb / ha : 1;
            let wb = null;
            if (g.fx) { wb = clipOf(b.sh.all, g.b, gb); box.appendChild(wb); }
            track(p => {
              const e = MORPH(p), x = lerp(ax, bx, e), y = lerp(ay, by, e), s = lerp(1, k, e);
              wa.style.transform = `translate(${x - ax}px, ${y - ay}px) scale(${s})`;
              if (wb) {
                wb.style.transform = `translate(${x - bx}px, ${y - by}px) scale(${s / k})`;
                const c = windowed(p, FADE_OUT);
                wa.style.opacity = String(1 - c);
                wb.style.opacity = String(c);
              }
            });
          }
          for (const r of pr.outA || []) {
            const w = clipOf(a.sh.all, r, ga);
            box.appendChild(w);
            track(p => {
              const g = lerpBox(ga, gb, MORPH(p));
              w.style.transform = `translate(${g.x - ga.x}px, ${g.y - ga.y}px)`;
              w.style.opacity = String(1 - windowed(p, FADE_OUT));
            });
          }
          for (const r of pr.inB || []) {
            const w = clipOf(b.sh.all, r, gb);
            box.appendChild(w);
            w.style.opacity = "0";
            track(p => {
              const g = lerpBox(ga, gb, MORPH(p));
              w.style.transform = `translate(${g.x - gb.x}px, ${g.y - gb.y}px)`;
              w.style.opacity = String(windowed(p, FADE_IN));
            });
          }
        }
      }
      for (const uid of tr.outA || []) {
        const a = A.shapes[uid];
        if (a) track(p => { a.el.style.opacity = String(1 - windowed(p, FADE_OUT)); });
      }
      for (const uid of tr.inB || []) {
        const b = B.shapes[uid];
        if (!b) continue;
        b.el.style.opacity = "0";
        track(p => { b.el.style.opacity = String(windowed(p, FADE_IN)); });
      }

      cur = { i: j, k: 0 };
      paintCount();
      run = play(tracks, D, () => {
        run = null;
        extras.forEach(x => x.remove());
        show(B, B.states[0]);
        arrive(true);
      });
    }

    /* -- navigation, PowerPoint's way: next plays the next click's build or
          moves on; a press during an animation finishes it instead. */
    function next() {
      if (!deck || busy) return;
      if (run) { run.finish(); return; }
      clearTimeout(advTimer);
      advTimer = null;
      const s = view.s;
      if (cur.k < s.steps.length) { playStep(cur.k); return; }
      if (cur.i >= deck.slides.length - 1) { srEl.textContent = t("end"); return; }
      const j = cur.i + 1, tr = deck.slides[j].transition;
      if (tr.type === "morph" && !reducedMotion()) morphTo(j);
      else cutTo(j, "start", true);
    }

    function prev() {
      if (!deck || busy) return;
      if (run) run.finish();
      clearTimeout(advTimer);
      advTimer = null;
      const s = view.s;
      let k = cur.k - 1;
      // A slide's automatic opening build is not a place to stop on the way back.
      if (k === 0 && s.steps[0] && s.steps[0].auto) k = -1;
      if (k >= 0) {
        cur.k = k;
        applyState(view, view.states[k]);
        paintCount();
      } else if (cur.i > 0) {
        cutTo(cur.i - 1, "end", false);
      }
    }

    function goTo(i) {
      if (!deck || busy) return;
      if (run) run.finish();
      cutTo(Math.max(0, Math.min(deck.slides.length - 1, i)), "start", true);
    }

    /* -- input */
    function editable(el) {
      return el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName));
    }
    function onKey(e) {
      if (!root.isConnected || root.offsetParent === null && !root.classList.contains("sv-is-full")) return;
      if (editable(document.activeElement) || e.metaKey || e.ctrlKey || e.altKey) return;
      const k = e.key;
      if (k === "Escape" && root.classList.contains("sv-pseudo-full")) { e.preventDefault(); setFull(false); return; }
      if (["ArrowRight", "ArrowDown", "PageDown", " ", "Enter", "n", "N"].includes(k)) {
        if (k === "Enter" && document.activeElement && document.activeElement.closest && document.activeElement.closest("button, a")) return;
        e.preventDefault(); next();
      } else if (["ArrowLeft", "ArrowUp", "PageUp", "Backspace", "p", "P"].includes(k)) {
        e.preventDefault(); prev();
      } else if (k === "Home") {
        e.preventDefault(); goTo(0);
      } else if (k === "End") {
        e.preventDefault(); if (deck) cutTo(deck.slides.length - 1, "end", false);
      } else if (k === "f" || k === "F") {
        e.preventDefault(); toggleFull();
      }
    }
    document.addEventListener("keydown", onKey);

    let down = null;
    frame.addEventListener("pointerdown", e => {
      if (e.button !== 0 || e.target.closest(".sv-link")) return;
      down = { x: e.clientX, y: e.clientY, t: performance.now() };
    });
    frame.addEventListener("pointerup", e => {
      if (!down || e.target.closest(".sv-link")) { down = null; return; }
      const dx = e.clientX - down.x, dy = e.clientY - down.y;
      down = null;
      if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy) * 1.2) { dx < 0 ? next() : prev(); return; }
      if (Math.hypot(dx, dy) < 12) next();
    });
    frame.addEventListener("pointercancel", () => { down = null; });

    prevBtn.addEventListener("click", prev);
    nextBtn.addEventListener("click", next);
    /* The progress line: where you are in the deck, with a mark where each
       class begins. Clicking it goes to that point. */
    rail.addEventListener("click", e => {
      if (!deck) return;
      const r = rail.querySelector(".sv-rail-track").getBoundingClientRect();
      const f = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width));
      goTo(Math.round(f * (deck.slides.length - 1)));
    });
    function paintMarks() {
      const track = rail.querySelector(".sv-rail-track");
      track.querySelectorAll(".sv-mark").forEach(m => m.remove());
      const n = deck.slides.length;
      for (const sec of deck.sections || []) {
        if (!sec.start) continue;
        const m = document.createElement("span");
        m.className = "sv-mark";
        m.style.left = (sec.start / (n - 1)) * 100 + "%";
        m.title = sec.title;
        track.appendChild(m);
      }
    }

    /* -- full screen: the real thing where the browser allows it, and a
          fixed full-window layer where it doesn't (iPhone Safari). */
    function isNativeFull() { return (document.fullscreenElement || document.webkitFullscreenElement) === root; }
    function toggleFull() {
      if (root.classList.contains("sv-is-full")) {
        if (isNativeFull()) (document.exitFullscreen || document.webkitExitFullscreen).call(document);
        else setFull(false);
        return;
      }
      const req = root.requestFullscreen || root.webkitRequestFullscreen;
      if (req) {
        Promise.resolve(req.call(root)).catch(() => setFull(true));
      } else {
        setFull(true);
      }
    }
    function setFull(on) {
      root.classList.toggle("sv-is-full", on);
      root.classList.toggle("sv-pseudo-full", on && !isNativeFull());
      paintLabels();
      requestAnimationFrame(fit);
      if (on) root.focus({ preventScroll: true });
      else clearTimeout(idle), root.classList.remove("sv-idle");
    }
    function onFullChange() { setFull(isNativeFull()); }
    document.addEventListener("fullscreenchange", onFullChange);
    document.addEventListener("webkitfullscreenchange", onFullChange);
    fullBtn.addEventListener("click", toggleFull);

    root.addEventListener("pointermove", () => {
      root.classList.remove("sv-idle");
      clearTimeout(idle);
      if (root.classList.contains("sv-is-full")) idle = setTimeout(() => root.classList.add("sv-idle"), 2500);
    });

    /* -- load */
    paintLabels();
    fetch(base + "deck.json")
      .then(r => { if (!r.ok) throw new Error(r.status); return r.json(); })
      .then(d => {
        if (destroyed) return;
        deck = d;
        status.textContent = "";
        paintMarks();
        fit();
        if (opts.onReady) opts.onReady(d);
        paintLabels();
        prefetch(0);
        cutTo(Math.max(0, Math.min(d.slides.length - 1, (opts.start || 1) - 1)), "start", true);
      })
      .catch(() => { status.textContent = t("failed"); });

    return {
      destroy() {
        destroyed = true;
        if (run) { const r = run; run = null; r.done = true; cancelAnimationFrame(r.raf); }
        clearTimeout(advTimer);
        clearTimeout(idle);
        ro.disconnect();
        document.removeEventListener("keydown", onKey);
        document.removeEventListener("fullscreenchange", onFullChange);
        document.removeEventListener("webkitfullscreenchange", onFullChange);
        if (isNativeFull()) (document.exitFullscreen || document.webkitExitFullscreen).call(document);
        root.innerHTML = "";
        root.className = root.className.replace(/\bsv[\w-]*/g, "").trim();
      },
      setLang(l) {
        if (!STR[l]) return;
        lang = l;
        paintLabels();
      },
      next, prev, goTo,
      _run: () => run,
      get sections() { return deck ? deck.sections || [] : []; },
      get state() { return { slide: cur.i, step: cur.k, animating: !!run }; },
    };
  }

  window.SlideViewer = { mount };
})();
