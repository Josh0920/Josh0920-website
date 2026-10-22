/* Verse pop-ups for the Hebrew Calendar, as on the commentary: RefTagger
 * links each reference, and scripture-context.js links the bare ones ("(7:9)")
 * from the item they sit in.
 *
 * The calendar is drawn by React, which rewrites the month panel in place
 * whenever a month is chosen. Linking rewrites text into anchors, and React
 * would then update text that is no longer on the page, leaving the last
 * month's references showing. So the live panel is left to React and hidden;
 * a copy of it is shown and linked, and rebuilt whenever React changes the
 * original. Everything outside the panel never changes once drawn, so it is
 * linked where it stands. The page sets window.refTagger before this runs.
 */
(function () {
  "use strict";

  var SCRIPTS = ["/scripture-context.js", "/RefTagger.js"];
  var REF_LINE = /^((?:[1-3] )?[A-ZÉ][A-Za-zé]*) \d+:\d+/;

  function load(src) {
    return new Promise(function (done) {
      var s = document.createElement("script");
      s.src = src;
      s.onload = s.onerror = done;
      document.body.appendChild(s);
    });
  }

  /* Each item's bare references belong to its own passage: the book its
     reference line opens with ("Ezek 26:1-28:19" → Ezekiel). */
  function markBooks(root) {
    [].forEach.call(root.querySelectorAll("div"), function (div) {
      var last = div.lastElementChild;
      var m = last && last.tagName === "SPAN" && REF_LINE.exec(last.textContent.trim());
      if (m) div.setAttribute("data-loc", m[1]);
    });
  }

  function copyOf(live) {
    var copy = live.cloneNode(true);
    copy.removeAttribute("data-live");
    copy.classList.remove("no-ref");
    copy.setAttribute("data-copy", "");
    markBooks(copy);
    return copy;
  }

  function start(live) {
    // A reference keeps the design's own type and colour; a light underline in
    // the calendar's red marks it, as the commentary underlines its references.
    var st = document.createElement("style");
    st.textContent = "[data-live]{display:none !important}" +
      "a.rtBibleRef,a.rtBibleRef:link,a.rtBibleRef:visited{color:inherit !important;" +
      "text-decoration:underline !important;text-decoration-color:rgba(168,38,27,.45) !important;" +
      "text-decoration-thickness:1px !important;text-underline-offset:2px}" +
      "a.rtBibleRef:hover{color:#A8261B !important;text-decoration-color:#A8261B !important}";
    document.head.appendChild(st);
    live.setAttribute("data-live", "");
    live.classList.add("no-ref");                 // neither linker touches it
    var shown = copyOf(live);
    live.parentNode.insertBefore(shown, live.nextSibling);

    // scripture-context links the page as it loads; RefTagger tags it as it
    // loads. Then follow React: rebuild the copy and link it again.
    load(SCRIPTS[0]).then(function () { return load(SCRIPTS[1]); }).then(function () {
      var timer = null;
      new MutationObserver(function () {
        clearTimeout(timer);
        timer = setTimeout(function () {
          var next = copyOf(live);
          closeNote();                       // its number has just been replaced
          closeDay();                        // and the rows the day showed
          shown.parentNode.replaceChild(next, shown);
          shown = next;
          if (window.rescanScripture) window.rescanScripture(shown);
        }, 120);           // typing in the search: link once it settles
      }).observe(live, { childList: true, subtree: true, characterData: true });
    });
  }

  /* Notes. An entry's explanation opens from the small number beside its day
     ("10?¹", Joshua 2026-10-22), like a footnote. The panel on screen is the
     copy above, which React does not drive, so the note is opened here: one
     pop-up for the page, filled from the number's data-note, its references
     linked like the rest. */
  var pop = null, popFor = null;
  function closeNote() {
    if (pop) pop.hidden = true;
    if (popFor) popFor.setAttribute("aria-expanded", "false");
    popFor = null;
  }
  function openNote(btn) {
    if (!pop) {
      pop = document.createElement("div");
      pop.className = "cal-pop";
      pop.setAttribute("role", "note");
      document.body.appendChild(pop);
      var st = document.createElement("style");
      st.textContent = ".cal-pop{position:absolute;z-index:50;box-sizing:border-box;width:min(380px, calc(100vw - 24px));" +
        "background:#FBF9F3;border:1px solid #1C1B19;padding:12px 14px;font-size:16px;line-height:1.45;color:#1C1B19;" +
        "box-shadow:0 8px 28px rgba(28,27,25,.18)}.cal-pop[hidden]{display:none}" +
        ".cal-note:focus-visible{outline:2px solid #A8261B;outline-offset:1px}";
      document.head.appendChild(st);
    }
    pop.textContent = btn.getAttribute("data-note") || "";
    pop.hidden = false;
    popFor = btn;
    btn.setAttribute("aria-expanded", "true");
    var r = btn.getBoundingClientRect(), w = pop.offsetWidth;
    pop.style.left = Math.max(12, Math.min(r.left + scrollX - 8, scrollX + innerWidth - w - 12)) + "px";
    pop.style.top = (r.bottom + scrollY + 6) + "px";
    if (window.rescanScripture) window.rescanScripture(pop);
  }
  /* The month view (Joshua, 2026-10-22: "maybe making every dot a popup
     window"). A dot opens its entry, a day (or "Day not given") everything on
     it. The entries are the list's own rows, taken from the live panel by
     data-key, so they read as in the list and are linked like it. */
  var ES = location.pathname.indexOf("/es/") !== -1;
  var day = null, dayBody = null, dayHead = null, dayFor = null;
  function closeDay() {
    if (day) day.hidden = true;
    if (dayFor) dayFor.removeAttribute("data-open");
    dayFor = null;
  }
  function openDay(btn, keys, byKeyboard) {
    if (!day) {
      day = document.createElement("div");
      day.className = "cal-day-pop";
      day.setAttribute("role", "dialog");
      day.innerHTML = '<div class="cal-day-head"><span></span><button type="button" class="cal-day-x">×</button></div><div></div>';
      dayHead = day.firstChild.firstChild;
      dayBody = day.lastChild;
      day.querySelector(".cal-day-x").setAttribute("aria-label", ES ? "Cerrar" : "Close");
      day.querySelector(".cal-day-x").addEventListener("click", closeDay);
      document.body.appendChild(day);
      var st = document.createElement("style");
      // compact: the list's rows at a smaller size (Joshua, 2026-10-22: "make
      // the drop down window smaller in size, right now it is huge and bulky")
      var row = ".cal-day-pop [data-key]";
      st.textContent = ".cal-day-pop{position:absolute;z-index:40;box-sizing:border-box;width:min(300px, calc(100vw - 24px));" +
        "max-height:min(50vh, 380px);overflow:auto;background:#FBF9F3;border:1px solid #1C1B19;padding:0 10px 2px;" +
        "color:#1C1B19;font-family:'EB Garamond', Georgia, serif;font-size:14px;line-height:1.3;box-shadow:0 6px 18px rgba(28,27,25,.16)}" +
        ".cal-day-pop[hidden]{display:none}" +
        ".cal-day-head{position:sticky;top:0;z-index:1;display:flex;align-items:center;justify-content:space-between;gap:8px;" +
        "background:#FBF9F3;border-bottom:1px solid #1C1B19;font-size:15px;font-weight:500;padding:3px 0 2px}" +
        ".cal-day-x{min-width:32px;min-height:32px;margin-right:-8px;background:none;border:0;font-size:20px;line-height:1;color:#1C1B19;cursor:pointer}" +
        row + "{grid-template-columns:34px minmax(0, 1fr) !important;gap:6px !important;padding:7px 0 !important}" +
        row + " span{font-size:13.5px !important;line-height:1.3 !important}" +
        row + " > span:first-child{font-size:14px !important}" +
        row + " > div > div:first-child > span:first-child{font-size:15px !important}" +
        row + " [lang=he]{font-size:14px !important}" +
        row + " .cal-note{font-size:10px !important}" +
        row + ":last-child{border-bottom:0 !important}" +
        "[data-cell][data-open]{outline:2px solid #A8261B;outline-offset:-1px}";
      document.head.appendChild(st);
    }
    var live = document.querySelector("section[data-live]");
    dayBody.textContent = "";
    keys.forEach(function (k) {
      var row = live && live.querySelector('[data-key="' + k + '"]');
      if (row) dayBody.appendChild(row.cloneNode(true));
    });
    markBooks(dayBody);
    dayHead.textContent = btn.getAttribute("data-head") || "";
    closeDay();
    day.hidden = false;
    dayFor = btn.closest("[data-cell]") || btn;
    dayFor.setAttribute("data-open", "");
    // under the day, or over it if there is more room there; on a small screen
    // it fits the room it has and scrolls inside
    day.style.maxHeight = "";
    var r = dayFor.getBoundingClientRect(), w = day.offsetWidth, h = day.offsetHeight;
    var below = innerHeight - r.bottom - 18, above = r.top - 18, top;
    if (h <= below || (below >= above && below >= 220)) {
      if (h > below) day.style.maxHeight = below + "px";
      top = r.bottom + scrollY + 6;
    } else if (h <= above || above >= 220) {
      if (h > above) { day.style.maxHeight = above + "px"; h = above; }
      top = r.top + scrollY - 6 - h;
    } else {
      top = scrollY + Math.max(12, innerHeight - h - 12);
    }
    day.style.left = Math.max(12, Math.min(r.left + scrollX, scrollX + innerWidth - w - 12)) + "px";
    day.style.top = top + "px";
    day.scrollTop = 0;
    if (window.rescanScripture) window.rescanScripture(dayBody);
    if (byKeyboard) day.querySelector(".cal-day-x").focus();
  }

  document.addEventListener("click", function (e) {
    var t = e.target.closest ? e.target : e.target.parentElement;
    var btn = t.closest(".cal-note");
    if (btn) { e.preventDefault(); if (popFor === btn) closeNote(); else openNote(btn); return; }
    if (pop && !pop.hidden && !t.closest(".cal-pop")) closeNote();
    var dot = t.closest(".cal-dot"), cell = !dot && t.closest(".cal-day");
    if (dot || cell) {
      var keys = dot ? [dot.getAttribute("data-key")] : (cell.getAttribute("data-keys") || "").split(" ");
      openDay(dot || cell, keys, e.detail === 0);
      return;
    }
    if (day && !day.hidden && !t.closest(".cal-day-pop") && !t.closest(".cal-pop")) closeDay();
  });
  document.addEventListener("keydown", function (e) {
    if (e.key !== "Escape") return;
    if (pop && !pop.hidden) { closeNote(); return; }
    if (day && !day.hidden) { var back = dayFor; closeDay(); var b = back && back.querySelector(".cal-day"); if (b) b.focus(); }
  });

  /* On a touch screen the first tap on a reference only shows its verses
     (RefTagger opens the pop-up on the hover a tap sets off); a second tap on
     the same reference opens it at biblia.com (Joshua, 2026-10-21). Armed on
     pointerdown rather than click: iOS already swallows the click of a first
     tap that opens a hover pop-up, so counting clicks would take three taps. */
  var touch = false, armed = null, follow = false;
  document.addEventListener("pointerdown", function (e) {
    var a = e.target.closest && e.target.closest("a.rtBibleRef");
    touch = e.pointerType === "touch";
    follow = touch && !!a && armed === a;
    armed = touch && a ? a : null;
  }, true);
  document.addEventListener("click", function (e) {
    var a = e.target.closest && e.target.closest("a.rtBibleRef");
    if (a && touch && !follow) e.preventDefault();
  }, true);

  // The calendar mounts a moment after the page unpacks. Until then its
  // template sits in the page as markup ("{{sm.name}}") inside <x-dc>, and the
  // runtime builds the calendar from that markup: anything added to it then
  // becomes part of the design, so wait for the drawn page in #dc-root.
  (function wait(tries) {
    var live = document.querySelector('#dc-root [data-document-role="page"] section');
    if (live && live.textContent.trim() && live.textContent.indexOf("{{") === -1) return start(live);
    if (tries < 200) setTimeout(function () { wait(tries + 1); }, 50);
  })(0);
})();
