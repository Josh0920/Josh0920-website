/* scripture-context.js — link bare verse references using their context.
 *
 * RefTagger only links references that name their book ("Ecclesiastes 12:1").
 * Commentary prose rarely does: it names the book once and then writes
 * "11:9–12:1" or "(11:10)". This runs BEFORE RefTagger, tracks which book and
 * which translation are under discussion, and links those bare references
 * itself. RefTagger is told not to touch existing links, so the two coexist.
 *
 * Rules implemented (from Joshua):
 *   1. Bare "ch:v", ranges, and cross-chapter ranges are linked.
 *   2. The book carries forward from the last book named — in a reference OR
 *      in ordinary prose ("The author of Ecclesiastes, in 11:9–12:1, …") —
 *      until a different book is named.
 *   3. A translation named nearby is used for the link; otherwise NASB95.
 */
(function () {
  "use strict";


  /* Biblia resource ids for the versions worth naming in prose. */
  var VERSIONS = {
    NASB95: "nasb95", NASB: "nasb95", NASB20: "nasb2020",
    ESV: "esv", KJV: "kjv1900", NKJV: "nkjv", NIV: "niv", NRSV: "nrsv",
    NLT: "nlt", CSB: "csb", HCSB: "hcsb", NET: "gs-netbible", LEB: "leb",
    ASV: "asv", YLT: "ylt", MESSAGE: "message", GW: "godsword",
    RVR60: "rvr60", NVI: "nvi", NTV: "ntv", RVA: "rva",
    // spellings that actually appear in Spanish prose
    "RVR 1960": "rvr60", "Reina-Valera 1960": "rvr60", "Reina Valera": "rvr60",
    "Nueva Biblia de las Américas": "nblh",
    "Nueva Version Internacional": "nvi", "Nueva Versión Internacional": "nvi",
    // NBLA is served under Biblia's older id "nblh" (Nueva Biblia
    // Latinoamericana de Hoy) — "nbla" itself 404s.
    NBLA: "nblh", NBLH: "nblh",
    LXX: "lxx", VULGATE: "vulgataclem"
  };

  /* Canonical book names, plus the abbreviations Joshua actually writes.
     Order matters: longer names are tried first so "1 John" wins over "John". */
  var BOOKS = [
    ["Genesis", ["Genesis", "Gen"]],
    ["Exodus", ["Exodus", "Exod", "Ex"]],
    ["Leviticus", ["Leviticus", "Lev"]],
    ["Numbers", ["Numbers", "Num"]],
    ["Deuteronomy", ["Deuteronomy", "Deut"]],
    ["Joshua", ["Joshua", "Josh"]],
    ["Judges", ["Judges", "Judg"]],
    ["Ruth", ["Ruth"]],
    ["1 Samuel", ["1 Samuel", "1 Sam", "First Samuel"]],
    ["2 Samuel", ["2 Samuel", "2 Sam", "Second Samuel"]],
    ["1 Kings", ["1 Kings", "1 Kgs"]],
    ["2 Kings", ["2 Kings", "2 Kgs"]],
    ["1 Chronicles", ["1 Chronicles", "1 Chr"]],
    ["2 Chronicles", ["2 Chronicles", "2 Chr"]],
    ["Ezra", ["Ezra"]],
    ["Nehemiah", ["Nehemiah", "Neh"]],
    ["Esther", ["Esther", "Esth"]],
    ["Job", ["Job"]],
    ["Psalms", ["Psalms", "Psalm", "Pss", "Ps"]],
    ["Proverbs", ["Proverbs", "Prov"]],
    ["Ecclesiastes", ["Ecclesiastes", "Eccles", "Eccl", "Qoheleth"]],
    ["Song of Songs", ["Song of Songs", "Song of Solomon", "Song"]],
    ["Isaiah", ["Isaiah", "Isa"]],
    ["Jeremiah", ["Jeremiah", "Jer"]],
    ["Lamentations", ["Lamentations", "Lam"]],
    ["Ezekiel", ["Ezekiel", "Ezek"]],
    ["Daniel", ["Daniel", "Dan"]],
    ["Hosea", ["Hosea", "Hos"]],
    ["Joel", ["Joel"]],
    ["Amos", ["Amos"]],
    ["Obadiah", ["Obadiah", "Obad"]],
    ["Jonah", ["Jonah"]],
    ["Micah", ["Micah", "Mic"]],
    ["Nahum", ["Nahum", "Nah"]],
    ["Habakkuk", ["Habakkuk", "Hab"]],
    ["Zephaniah", ["Zephaniah", "Zeph"]],
    ["Haggai", ["Haggai", "Hag"]],
    ["Zechariah", ["Zechariah", "Zech"]],
    ["Malachi", ["Malachi", "Mal"]],
    ["Matthew", ["Matthew", "Matt"]],
    ["Mark", ["Mark"]],
    ["Luke", ["Luke"]],
    ["John", ["John"]],
    ["Acts", ["Acts"]],
    ["Romans", ["Romans", "Rom"]],
    ["1 Corinthians", ["1 Corinthians", "1 Cor", "First Corinthians"]],
    ["2 Corinthians", ["2 Corinthians", "2 Cor", "Second Corinthians"]],
    ["Galatians", ["Galatians", "Gal"]],
    ["Ephesians", ["Ephesians", "Eph"]],
    ["Philippians", ["Philippians", "Phil"]],
    ["Colossians", ["Colossians", "Col"]],
    ["1 Thessalonians", ["1 Thessalonians", "1 Thess"]],
    ["2 Thessalonians", ["2 Thessalonians", "2 Thess"]],
    ["1 Timothy", ["1 Timothy", "1 Tim"]],
    ["2 Timothy", ["2 Timothy", "2 Tim"]],
    ["Titus", ["Titus"]],
    ["Philemon", ["Philemon", "Phlm"]],
    ["Hebrews", ["Hebrews", "Heb"]],
    ["James", ["James", "Jas"]],
    ["1 Peter", ["1 Peter", "1 Pet", "First Peter"]],
    ["2 Peter", ["2 Peter", "2 Pet", "Second Peter"]],
    ["1 John", ["1 John"]],
    ["2 John", ["2 John"]],
    ["3 John", ["3 John"]],
    ["Jude", ["Jude"]],
    ["Revelation", ["Revelation", "Rev"]]
  ];


  /* Spanish book names → the canonical English name. Biblia resolves
     references by English name regardless of the translation served, so the
     NBLA text is fetched with an English reference. */
  var BOOKS_ES = [
    ["Genesis", ["Génesis", "Genesis", "Gén", "Gen"]],
    ["Exodus", ["Éxodo", "Exodo", "Éx", "Ex"]],
    ["Leviticus", ["Levítico", "Levitico", "Lev"]],
    ["Numbers", ["Números", "Numeros", "Núm", "Num"]],
    ["Deuteronomy", ["Deuteronomio", "Deut", "Dt"]],
    ["Joshua", ["Josué", "Josue", "Jos"]],
    ["Judges", ["Jueces", "Jue"]],
    ["Ruth", ["Rut"]],
    ["1 Samuel", ["1 Samuel", "1 Sam"]], ["2 Samuel", ["2 Samuel", "2 Sam"]],
    ["1 Kings", ["1 Reyes", "1 Re"]], ["2 Kings", ["2 Reyes", "2 Re"]],
    ["1 Chronicles", ["1 Crónicas", "1 Cronicas", "1 Cr"]],
    ["2 Chronicles", ["2 Crónicas", "2 Cronicas", "2 Cr"]],
    ["Ezra", ["Esdras", "Esd"]], ["Nehemiah", ["Nehemías", "Nehemias", "Neh"]],
    ["Esther", ["Ester", "Est"]], ["Job", ["Job"]],
    ["Psalms", ["Salmos", "Salmo", "Sal"]],
    ["Proverbs", ["Proverbios", "Prov", "Pr"]],
    ["Ecclesiastes", ["Eclesiastés", "Eclesiastes", "Ecl"]],
    ["Song of Songs", ["Cantar de los Cantares", "Cantares", "Cnt"]],
    ["Isaiah", ["Isaías", "Isaias", "Is"]],
    ["Jeremiah", ["Jeremías", "Jeremias", "Jer"]],
    ["Lamentations", ["Lamentaciones", "Lam"]],
    ["Ezekiel", ["Ezequiel", "Ez"]], ["Daniel", ["Daniel", "Dan"]],
    ["Hosea", ["Oseas", "Os"]], ["Joel", ["Joel"]], ["Amos", ["Amós", "Amos"]],
    ["Obadiah", ["Abdías", "Abdias", "Abd"]], ["Jonah", ["Jonás", "Jonas"]],
    ["Micah", ["Miqueas", "Miq"]], ["Nahum", ["Nahúm", "Nahum"]],
    ["Habakkuk", ["Habacuc", "Hab"]], ["Zephaniah", ["Sofonías", "Sofonias", "Sof"]],
    ["Haggai", ["Hageo", "Hag"]], ["Zechariah", ["Zacarías", "Zacarias", "Zac"]],
    ["Malachi", ["Malaquías", "Malaquias", "Mal"]],
    ["Matthew", ["Mateo", "Mat", "Mt"]], ["Mark", ["Marcos", "Mar", "Mr", "Mc"]],
    ["Luke", ["Lucas", "Luc", "Lc"]], ["John", ["Juan", "Jn"]],
    ["Acts", ["Hechos", "Hech", "Hch"]], ["Romans", ["Romanos", "Rom", "Ro"]],
    ["1 Corinthians", ["1 Corintios", "1 Co"]], ["2 Corinthians", ["2 Corintios", "2 Co"]],
    ["Galatians", ["Gálatas", "Galatas", "Gá"]], ["Ephesians", ["Efesios", "Ef"]],
    ["Philippians", ["Filipenses", "Fil"]], ["Colossians", ["Colosenses", "Col"]],
    ["1 Thessalonians", ["1 Tesalonicenses", "1 Ts"]],
    ["2 Thessalonians", ["2 Tesalonicenses", "2 Ts"]],
    ["1 Timothy", ["1 Timoteo", "1 Ti"]], ["2 Timothy", ["2 Timoteo", "2 Ti"]],
    ["Titus", ["Tito", "Tit"]], ["Philemon", ["Filemón", "Filemon", "Flm"]],
    ["Hebrews", ["Hebreos", "Heb", "He"]], ["James", ["Santiago", "Stg"]],
    ["1 Peter", ["1 Pedro", "1 P"]], ["2 Peter", ["2 Pedro", "2 P"]],
    ["1 John", ["1 Juan", "1 Jn"]], ["2 John", ["2 Juan", "2 Jn"]],
    ["3 John", ["3 Juan", "3 Jn"]], ["Jude", ["Judas"]],
    ["Revelation", ["Apocalipsis", "Apoc", "Ap"]]
  ];

  function esc(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }

  /* Chapter counts, used to reject impossible references — a stray "51:1"
     after Genesis is not Scripture. Verse counts are not checked, so a
     number like a clock time can still slip through if a book is in scope. */
  var CHAPTERS = {
    "Genesis":50,"Exodus":40,"Leviticus":27,"Numbers":36,"Deuteronomy":34,
    "Joshua":24,"Judges":21,"Ruth":4,"1 Samuel":31,"2 Samuel":24,"1 Kings":22,
    "2 Kings":25,"1 Chronicles":29,"2 Chronicles":36,"Ezra":10,"Nehemiah":13,
    "Esther":10,"Job":42,"Psalms":150,"Proverbs":31,"Ecclesiastes":12,
    "Song of Songs":8,"Isaiah":66,"Jeremiah":52,"Lamentations":5,"Ezekiel":48,
    "Daniel":12,"Hosea":14,"Joel":3,"Amos":9,"Obadiah":1,"Jonah":4,"Micah":7,
    "Nahum":3,"Habakkuk":3,"Zephaniah":3,"Haggai":2,"Zechariah":14,"Malachi":4,
    "Matthew":28,"Mark":16,"Luke":24,"John":21,"Acts":28,"Romans":16,
    "1 Corinthians":16,"2 Corinthians":13,"Galatians":6,"Ephesians":6,
    "Philippians":4,"Colossians":4,"1 Thessalonians":5,"2 Thessalonians":3,
    "1 Timothy":6,"2 Timothy":4,"Titus":3,"Philemon":1,"Hebrews":13,"James":5,
    "1 Peter":5,"2 Peter":3,"1 John":5,"2 John":1,"3 John":1,"Jude":1,
    "Revelation":22
  };

  function buildBundle(tables) {
    var names = [];
    tables.forEach(function (t) {
      t.forEach(function (bk) {
        bk[1].forEach(function (n) { names.push([n, bk[0]]); });
      });
    });
    names.sort(function (x, y) { return y[0].length - x[0].length; });
    var alt = names.map(function (n) { return esc(n[0]); }).join("|");
    var lookup = {};
    names.forEach(function (n) { lookup[n[0].toLowerCase()] = n[1]; });
    return {
      lookup: lookup,
      bookRe: new RegExp("\\b(" + alt + ")\\b", "g"),
      refRe: new RegExp("(?:(" + alt + ")\\.?\\s+)?" +
        "(\\d{1,3}):(\\d{1,3})(?:\\s*[\u2013\u2014-]\\s*(?:(\\d{1,3}):)?(\\d{1,3}))?", "g")
    };
  }

  /* The reader modal shows Spanish articles on a page whose own lang is "en",
     and the site flips <html lang> when the language toggle is used — so the
     language has to be read at scan time, not once at load. Spanish book names
     are kept out of English scans so short forms ("Sal", "Ap") cannot match
     ordinary English words. */
  function isSpanish() {
    return (document.documentElement.getAttribute("lang") || "")
             .toLowerCase().indexOf("es") === 0;
  }
  function defaultVersion() { return isSpanish() ? "nblh" : "nasb95"; }

  var EN = buildBundle([BOOKS]);
  var ES = buildBundle([BOOKS, BOOKS_ES]);

  /* ", 6" continuing the previous chapter — but not ", 15:6", which is a
     fresh chapter and belongs to the main pattern. */
  /* The (?!\d) matters: \d{1,3} is greedy, so against ", 12:10" it first tries
     "12", fails the colon guard, then backtracks to "1" — which passes, and a
     chapter reference gets silently linked as a stray verse. */
  var CONT_RE = /,\s*(\d{1,3})(?!\d)(?!\s*[:.]\s*\d)/g;

  var VERSION_RE = new RegExp(
    "(?:\\b|^)(" + Object.keys(VERSIONS)
      .sort(function (x, y) { return y.length - x.length; })
      .map(esc).join("|") + ")(?:\\b|$)", "g");

  /* Text nodes we must not touch: inside links, headings, code, or anything
     the page has already marked as not-for-scanning. */
  var SKIP = /^(A|SCRIPT|STYLE|CODE|PRE|H1|H2|H3|BUTTON|TIME)$/;

  /* Cues that a following "n:m" is a timestamp or a citation, not Scripture.
     The abbreviations stay case-sensitive — lowercase "no." and "or." turn up
     in ordinary prose and must not suppress a real reference — while the
     timestamp words allow a capital for sentence starts. */
  var NOT_SCRIPTURE =
    /(?:[Mm]inute|[Mm]in\.|[Tt]imestamp)\s*$|\b(?:Hom|Ep|Comm|Adv|Haer|Strom|Apol|Praef|Frag|Serm|Tract|Ant|Vit|Pp|No|Vol)\.\s*$|\b(?:pp?|vol)\.\s*$/;
  function skippable(node) {
    for (var el = node.parentElement; el; el = el.parentElement) {
      if (SKIP.test(el.tagName)) return true;
      if (el.classList) {
        var cl = el.classList;
        // Never infer a book inside a comparison table: its bare references
        // belong to the column heading, not to the surrounding prose.
        // "note"/"notes" are deliberately absent: footnotes are scanned like
        // any other prose, using the data-loc the build stamps on each note.
        if (cl.contains("no-ref") || cl.contains("meta") || cl.contains("kicker") ||
            cl.contains("tbl-wrap") || cl.contains("sbl") ||
            cl.contains("toc-line") || cl.contains("pgb") ||
            cl.contains("fnm")) return true;
      }
    }
    return false;
  }

  /* Build the placeholder RefTagger will tag, remembering the author's own
     wording so it can be restored afterwards. */
  function placeholder(bookName, chv, shown, version) {
    var span = document.createElement("span");
    span.className = "rc-pending";
    span.setAttribute("data-short", shown);
    span.setAttribute("data-want-version", version);
    span.textContent = bookName + " " + chv;
    return span;
  }

  /* The commentary declares the passage each section covers ("2 Peter · 1:1-4").
     That is the section's home book. A different book cited in passing
     ("a connection to Acts 11:17 and 15:11") should govern only the sentence
     it appears in — the next sentence returns to the passage under discussion.
     Pages without such headings keep the plain sticky behaviour. */
  function homeBookOf(node, lookup, bookRe) {
    for (var el = node.parentElement; el; el = el.parentElement) {
      /* Any element carrying data-loc, not just a section: footnotes render in
         one block at the end of the document, so the build stamps each note
         with the section its marker sits in. Without that a bare "1:4" in a
         note would inherit whatever book the previous note happened to name. */
      if (el.hasAttribute && el.hasAttribute("data-loc")) {
        /* Headings name the book in several shapes — "2 Peter · 1:1-4",
           "Introduction to 2 Peter · Audience", "Bibliography for 1 Peter" —
           so look for a book name anywhere in the label and take the last. */
        var loc = el.getAttribute("data-loc") || "";
        var found = null, bm2;
        bookRe.lastIndex = 0;
        while ((bm2 = bookRe.exec(loc))) found = lookup[bm2[1].toLowerCase()] || found;
        return found;
      }
    }
    return null;
  }

  /* Index of the sentence each character belongs to, so a book named in one
     sentence does not leak into the next. */
  function sentenceStarts(text) {
    var bounds = [0], re = /[.!?]["'”’)\]]*\s+/g, m;
    while ((m = re.exec(text))) bounds.push(m.index + m[0].length);
    return bounds;
  }
  function sentenceOf(bounds, pos) {
    var i = 0;
    for (var k = 0; k < bounds.length; k++) if (bounds[k] <= pos) i = k;
    return i;
  }

  function run(root) {
    var walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null);
    var nodes = [], n;
    while ((n = walker.nextNode())) nodes.push(n);

    var bundle = isSpanish() ? ES : EN;
    var BOOK_RE = bundle.bookRe, BOOK_LOOKUP = bundle.lookup, REF_RE = bundle.refRe;
    var DEFAULT_VERSION = defaultVersion();
    var spanish = isSpanish();

    var book = null;          // carries across the whole article
    var linked = 0;

    nodes.forEach(function (node) {
      var text = node.nodeValue;
      if (!text || !text.trim()) return;

      // Where each book is named here, with its sentence, so a reference can
      // pick the one that actually governs it.
      var bounds = sentenceStarts(text);
      var bmarks = [], bm;
      BOOK_RE.lastIndex = 0;
      while ((bm = BOOK_RE.exec(text))) {
        bmarks.push([bm.index, BOOK_LOOKUP[bm[1].toLowerCase()], sentenceOf(bounds, bm.index)]);
      }
      if (bmarks.length) book = bmarks[bmarks.length - 1][1];   // sticky carry-over
      var home = homeBookOf(node, BOOK_LOOKUP, BOOK_RE);

      function bookAt(pos, carried) {
        var sent = sentenceOf(bounds, pos), last = null, anyBefore = null;
        for (var i = 0; i < bmarks.length; i++) {
          if (bmarks[i][0] >= pos) break;
          anyBefore = bmarks[i][1];
          if (bmarks[i][2] === sent) last = bmarks[i][1];
        }
        if (last) return last;              // named in this very sentence
        if (home) return home;              // otherwise the section's passage
        return anyBefore || carried;        // else plain sticky behaviour
      }

      if (skippable(node) || !book) return;

      /* Translations named in this text node, with where they were named.
         A version only governs references that come AFTER it, and a code that
         titles a resource ("CSB Study Bible", "NIV Commentary") is a citation,
         not a choice of translation. */
      var vmarks = [], vm;
      VERSION_RE.lastIndex = 0;
      while ((vm = VERSION_RE.exec(text))) {
        var after = text.slice(vm.index + vm[0].length, vm.index + vm[0].length + 16);
        if (/^[\s.]*(Study|Bible|Commentary|Notes|Dictionary|Atlas|Reader)\b/i.test(after)) continue;
        vmarks.push([vm.index, VERSIONS[vm[1]] || DEFAULT_VERSION]);
      }
      function versionAt(pos) {
        var v = DEFAULT_VERSION;
        for (var i = 0; i < vmarks.length; i++) if (vmarks[i][0] < pos) v = vmarks[i][1];
        return v;
      }

      REF_RE.lastIndex = 0;
      var out = null, cursor = 0, m;
      while ((m = REF_RE.exec(text))) {
        var named = m[1] ? BOOK_LOOKUP[m[1].toLowerCase()] : null;
        var useBook = named || bookAt(m.index, book);
        if (!useBook) continue;

        /* Footnotes are full of things shaped like a reference that are not
           one. Recordings are cited by timestamp ("minute 42:44") and ancient
           works by section ("Origen, Homilies on Joshua, Hom. 7.1") — and that
           second shape sits just after a real book name, so sentence context
           would confidently mislabel it. Only bare references are suppressed;
           an explicit "1 Pet 1:4" still wins. */
        if (!named && NOT_SCRIPTURE.test(text.slice(Math.max(0, m.index - 26), m.index))) {
          continue;
        }

        // On English pages RefTagger already handles references that name
        // their book, so leave those alone. On Spanish pages it cannot see
        // them at all, so we take those too.
        if (named && !spanish) { book = named; continue; }
        if (named) book = named;

        var maxCh = CHAPTERS[useBook] || 150;
        if (+m[2] > maxCh || (m[4] && +m[4] > maxCh)) continue;
        if (+m[3] > 176 || (m[5] && +m[5] > 176)) continue;

        // Expand to the English name so RefTagger will tag it, remembering
        // the author's own wording to put back afterwards.
        var chv = m[2] + ":" + m[3];
        if (m[5]) chv += "-" + (m[4] ? m[4] + ":" + m[5] : m[5]);

        var ver = versionAt(m.index);
        out = out || document.createDocumentFragment();
        out.appendChild(document.createTextNode(text.slice(cursor, m.index)));
        out.appendChild(placeholder(useBook, chv, m[0], ver));
        cursor = m.index + m[0].length;
        linked++;

        /* A reference is often followed by more verses of the same chapter:
           "(1:5, 6; 3:18)" or "(9:1, 7)". Link those too. A number followed by
           a colon starts a new chapter, so it is left for the main pattern. */
        var lastCh = m[4] || m[2];
        CONT_RE.lastIndex = cursor;
        var c;
        while ((c = CONT_RE.exec(text)) && c.index === cursor) {
          if (+c[1] > 176) break;
          out.appendChild(document.createTextNode(c[0].slice(0, c[0].indexOf(c[1]))));
          out.appendChild(placeholder(useBook, lastCh + ":" + c[1], c[1], ver));
          cursor = c.index + c[0].length;
          linked++;
          CONT_RE.lastIndex = cursor;
        }
        REF_RE.lastIndex = cursor;
      }
      if (out) {
        out.appendChild(document.createTextNode(text.slice(cursor)));
        node.parentNode.replaceChild(out, node);
      }
    });
    return linked;
  }

  /* Phase two — once RefTagger has tagged an expanded reference, put the
     short text back. The tooltip reads data-reference off the anchor, not its
     text, so shortening the label leaves the popup working.

     Only spans that already contain an anchor are unwrapped; the rest are left
     for the next poll. Unwrapping early would destroy the expansion before
     RefTagger ever saw it. */
  function sweep(force) {
    var pending = document.querySelectorAll("span.rc-pending");
    [].forEach.call(pending, function (span) {
      var a = span.querySelector("a");
      var short = span.getAttribute("data-short");
      if (a) {
        a.textContent = short;
        a.classList.add("ref-auto");

        // RefTagger stamps every link with its one configured version, which
        // discards the translation named in the surrounding sentence. Put the
        // intended one back on both the link and the tooltip's lookup.
        var want = span.getAttribute("data-want-version");
        if (want && a.getAttribute("data-version") !== want) {
          var ref = a.getAttribute("data-reference") || "";
          a.setAttribute("data-version", want);
          a.href = "https://biblia.com/bible/" + want + "/" + encodeURIComponent(ref);
        }
        span.parentNode.replaceChild(a, span);
      } else if (force) {
        // RefTagger never tagged it — restore the author's text untouched
        span.parentNode.replaceChild(document.createTextNode(short), span);
      }
    });
    return document.querySelectorAll("span.rc-pending").length;
  }

  /* Some pages style their in-text links as small superscripts (footnote
     markers). Scripture links must not inherit that — they are ordinary words
     in the sentence. */
  function injectStyle() {
    if (document.getElementById("rc-style")) return;
    var st = document.createElement("style");
    st.id = "rc-style";
    st.textContent =
      "a.rtBibleRef, a.rtBibleRef:link, a.rtBibleRef:visited {" +
      "font-size: inherit !important; font-family: inherit !important;" +
      "font-weight: inherit !important; font-style: inherit !important;" +
      "vertical-align: baseline !important; line-height: inherit !important; }";
    (document.head || document.documentElement).appendChild(st);
  }

  /* Re-run over freshly injected content. The library page opens articles in
     a modal: it fetches the article, keeps only <article>/<footer>, and strips
     every <script> — so the article's own RefTagger never runs. We expand the
     new content here and ask RefTagger to tag it. */
  function rescan(root) {
    if (!root) return;
    try {
      run(root);
      if (window.refTagger && typeof refTagger.tag === "function") refTagger.tag();
      var tries = 0;
      (function settle() {
        if (sweep(false) === 0) return;
        if (++tries > 60) { sweep(true); return; }
        setTimeout(settle, 25);
      })();
    } catch (e) {
      if (window.console) console.error("[scripture-context] rescan", e);
    }
  }
  window.rescanScripture = rescan;

  /* Watch the reader modal, if this page has one. */
  function watchModal() {
    var body = document.getElementById("modalBody");
    if (!body || !window.MutationObserver) return;
    var timer = null;
    new MutationObserver(function () {
      clearTimeout(timer);
      timer = setTimeout(function () {
        // ignore the "Loading..." placeholder and already-processed content
        if (!body.textContent.trim()) return;
        if (body.querySelector("a.rtBibleRef") || body.querySelector("span.rc-pending")) return;
        rescan(body);
      }, 60);
    }).observe(body, { childList: true, subtree: true });
  }

  function start() {
    injectStyle();
    watchModal();
    /* Pick what to scan:
         - an article page has <article> (a library card is also <article>,
           hence :not(.item));
         - the library page has the reader modal, whose content arrives later
           and is picked up by the observer above;
         - everything else (the commentary, topic pages) has neither, so scan
           the document. */
    var root = document.querySelector("article:not(.item)") ||
               document.getElementById("modalBody") ||
               document.body;
    if (!root) return;
    try {
      var n = run(root);
      // run after RefTagger's own DOMContentLoaded handler (registered later
      // than ours, so it fires first on the next turn of the event loop)
      var tries = 0;
      (function settle() {
        var left = sweep(false);
        if (left === 0) return;
        if (++tries > 60) { sweep(true); return; }   // give up, restore text
        setTimeout(settle, 25);
      })();
      if (window.console && console.debug) console.debug("[scripture-context] expanded", n, "bare references");
    } catch (e) {
      if (window.console) console.error("[scripture-context]", e);
    }
  }

  /* Run as soon as this file executes rather than on DOMContentLoaded.
     RefTagger is loaded immediately after us at the end of <body> and tags
     the page there and then — waiting for DOMContentLoaded would put our
     expansion in place only after it had already scanned. */
  if (document.querySelector("article") || document.body) {
    start();
  } else {
    document.addEventListener("DOMContentLoaded", start);
  }
})();
