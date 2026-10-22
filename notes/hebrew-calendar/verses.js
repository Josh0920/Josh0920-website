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
          shown.parentNode.replaceChild(next, shown);
          shown = next;
          if (window.rescanScripture) window.rescanScripture(shown);
        }, 120);           // typing in the search: link once it settles
      }).observe(live, { childList: true, subtree: true, characterData: true });
    });
  }

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
