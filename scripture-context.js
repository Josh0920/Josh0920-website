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
 *      (Joshua, 2026-11-16: "keep NASB95 as the default, but if i ever
 *      reference another translation, offer that reftag translation (use
 *      context to know when the follow the refernce and when to switch back)".)
 *      It holds for references that name their book too, which RefTagger alone
 *      would always give its one default:
 *        - a translation right after a reference is that reference's:
 *          "(Gen 11:4, NASB95)", "(Proverbs 30:15–16 ESV)", "(Dan 7:27 θ, LXX)";
 *        - one named earlier in a sentence governs the references after it in
 *          that sentence ("the NET translates Deuteronomy 22:28 as …"), and the
 *          next sentence returns to the default;
 *        - "All Scripture quotations are from the ESV" makes it the default of
 *          that article or paper;
 *        - a translation that titles a resource ("CSB Study Bible", "NET Bible
 *          notes") or is denied ("not to the LXX version") is not a choice;
 *        - the LXX, the Septuagint and the Vulgate are texts under discussion
 *          more often than translations being quoted, so they count only right
 *          beside a reference.
 *   4. NETS (Joshua, 2026-11-16: "can you create the ability to use NETS"):
 *      a reference marked NETS, or LXX/Septuagint beside it, opens the NETS
 *      project's own PDF of that book, with a small card in place of
 *      RefTagger's verse text. The NETS files are free for personal, scholarly
 *      use but "may not be sold or redistributed", so the site links to them
 *      and quotes nothing from them.
 */
(function () {
  "use strict";


  /* The translations a reference can be linked to, by the names written in
     prose, with Biblia's id for each. Every id here was checked on 2026-11-16
     to return verse text through RefTagger's feed (reftagger.bibliacdn.com).
     Editions with no feed — NASB 2020, NVI, NTV, the Greek LXX, NA28 — are
     left out on purpose: a reference to one of them keeps the default rather
     than opening a preview that never loads. Case matters ("NET", not "net"). */
  var VERSIONS = {
    "NASB95": "nasb95", "NASB 95": "nasb95", "NASB1995": "nasb95", "NASB 1995": "nasb95",
    "NASB": "nasb95", "New American Standard Bible": "nasb95",
    "LSB": "lsb", "Legacy Standard Bible": "lsb",
    "ESV": "esv", "English Standard Version": "esv",
    "KJV": "kjv1900", "King James Version": "kjv1900",
    "NKJV": "nkjv", "New King James Version": "nkjv",
    "NIV": "niv", "New International Version": "niv",
    "CSB": "csb", "Christian Standard Bible": "csb",
    "HCSB": "hcsb", "Holman Christian Standard Bible": "hcsb",
    "NLT": "nlt", "New Living Translation": "nlt",
    "NET": "gs-netbible", "NET Bible": "gs-netbible", "New English Translation": "gs-netbible",
    "LEB": "leb", "Lexham English Bible": "leb",
    "NRSV": "nrsv", "NRSVue": "nrsv", "New Revised Standard Version": "nrsv",
    "RSV": "rsv", "Revised Standard Version": "rsv",
    "ASV": "asv", "American Standard Version": "asv",
    "YLT": "ylt", "Young\u2019s Literal Translation": "ylt", "Young's Literal Translation": "ylt",
    "Young\u2019s Literal": "ylt", "Young's Literal": "ylt",
    "Darby": "darby", "DARBY": "darby",
    "MESSAGE": "message", "The Message": "message", "MSG": "message",
    "GW": "godsword",
    "Douay-Rheims": "douayrheims", "Douay Rheims": "douayrheims",
    // Spanish. NBLA is served under Biblia's older id "nblh" (Nueva Biblia
    // Latinoamericana de Hoy) — "nbla" itself 404s.
    "NBLA": "nblh", "NBLH": "nblh", "Nueva Biblia de las Américas": "nblh",
    "RVR60": "rvr60", "RVR 1960": "rvr60", "RVR1960": "rvr60",
    "Reina-Valera 1960": "rvr60", "Reina Valera 1960": "rvr60",
    "Reina-Valera": "rvr60", "Reina Valera": "rvr60",
    // the Septuagint in English: the NETS project's PDFs (see NETS below)
    "NETS": "nets", "New English Translation of the Septuagint": "nets",
    // texts under discussion more often than translations being quoted:
    // they count only right beside a reference (WITNESS)
    "LXX": "nets", "Septuagint": "nets", "Septuaginta": "nets",
    "Vulgate": "vulgataclem", "Vulgata": "vulgataclem"
  };
  var WITNESS = { "LXX": 1, "Septuagint": 1, "Septuaginta": 1, "Vulgate": 1, "Vulgata": 1 };

  /* NETS, A New English Translation of the Septuagint, is published by its
     project as one PDF per book (ccat.sas.upenn.edu/nets/edition/). Its books
     keep the Septuagint's names and order, so 1 Samuel is "1 Reigns" and the
     twelve minor prophets are one file. */
  var NETS_BASE = "https://ccat.sas.upenn.edu/nets/edition/";
  var NETS = {
    "Genesis": ["01-gen", "Genesis"], "Exodus": ["02-exod", "Exodus"],
    "Leviticus": ["03-leu", "Leuitikon"], "Numbers": ["04-num", "Numbers"],
    "Deuteronomy": ["05-deut", "Deuteronomion"], "Joshua": ["06-iesous", "Iesous"],
    "Judges": ["07-judges", "Judges"], "Ruth": ["08-routh", "Routh"],
    "1 Samuel": ["09-1reigns", "1 Reigns"], "2 Samuel": ["10-2reigns", "2 Reigns"],
    "1 Kings": ["11-3reigns", "3 Reigns"], "2 Kings": ["12-4reigns", "4 Reigns"],
    "1 Chronicles": ["13-1suppl", "1 Supplements"], "2 Chronicles": ["14-2suppl", "2 Supplements"],
    "Ezra": ["16-2esdras", "2 Esdras"], "Nehemiah": ["16-2esdras", "2 Esdras"],
    "Esther": ["17-esther", "Esther"], "Job": ["28-iob", "Iob"],
    "Psalms": ["24-ps", "Psalms"], "Proverbs": ["25-proverbs", "Proverbs"],
    "Ecclesiastes": ["26-eccles", "Ecclesiast"], "Song of Songs": ["27-song", "Song of Songs"],
    "Isaiah": ["33-esaias", "Esaias"], "Jeremiah": ["34-ieremias", "Ieremias"],
    "Lamentations": ["36-lam", "Lamentations"], "Ezekiel": ["38-iezekiel", "Iezekiel"],
    "Daniel": ["40-daniel", "Daniel"]
  };
  ["Hosea", "Joel", "Amos", "Obadiah", "Jonah", "Micah", "Nahum", "Habakkuk", "Zephaniah",
   "Haggai", "Zechariah", "Malachi"].forEach(function (b) { NETS[b] = ["32-twelve", "The Twelve Prophets"]; });

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
    ["Song of Songs", ["Song of Songs", "Song of Solomon", "Canticles", "Song", "Cant"]],   // "Cant 2:17": Bauckham, in the 1 and 2 Peter paper
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


  /* Spanish book names → the canonical English name. The short NBLA forms
     (Gn, Lv, Nm, 1 S, 1 R, Dn) are the ones the Hebrew Calendar note uses.
     Biblia resolves
     references by English name regardless of the translation served, so the
     NBLA text is fetched with an English reference. */
  var BOOKS_ES = [
    ["Genesis", ["Génesis", "Genesis", "Gén", "Gen", "Gn"]],
    ["Exodus", ["Éxodo", "Exodo", "Éx", "Ex"]],
    ["Leviticus", ["Levítico", "Levitico", "Lev", "Lv"]],
    ["Numbers", ["Números", "Numeros", "Núm", "Num", "Nm"]],
    ["Deuteronomy", ["Deuteronomio", "Deut", "Dt"]],
    ["Joshua", ["Josué", "Josue", "Jos"]],
    ["Judges", ["Jueces", "Jue"]],
    ["Ruth", ["Rut"]],
    ["1 Samuel", ["1 Samuel", "1 Sam", "1 S"]], ["2 Samuel", ["2 Samuel", "2 Sam", "2 S"]],
    ["1 Kings", ["1 Reyes", "1 Re", "1 R"]], ["2 Kings", ["2 Reyes", "2 Re", "2 R"]],
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
    ["Ezekiel", ["Ezequiel", "Ez"]], ["Daniel", ["Daniel", "Dan", "Dn"]],
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
      /* Not \b: it counts accented letters as word breaks, so "Éx", "Josué"
         and "Gá" were never seen as book names and a Spanish reference with
         no book named before it went unlinked. (No lookbehind: older iPhones
         reject it, and with it the whole script.) */
      bookRe: new RegExp("(?:^|[^A-Za-z\\u00C0-\\u024F0-9_])(" + alt + ")(?![A-Za-z\\u00C0-\\u024F0-9_])", "g"),
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
  /* A continuation may be a range of its own: "Éx 12:1-14, 21-28". */
  var CONT_RE = /,\s*(\d{1,3})(?:\s*[-\u2013]\s*(\d{1,3}))?(?!\d)(?!\s*[:.]\s*\d)/g;

  var VERSION_ALT = Object.keys(VERSIONS)
    .sort(function (x, y) { return y.length - x.length; }).map(esc).join("|");
  var VERSION_RE = new RegExp(
    "(?:^|[^A-Za-z\\u00C0-\\u024F0-9_])(" + VERSION_ALT + ")(?![A-Za-z\\u00C0-\\u024F0-9_])", "g");
  /* A translation right after a reference (and its run of verses): ", ESV)",
     " ESV)", " (ESV)", " θ, LXX)" — Theodotion's sign before the LXX. A verse
     letter may come first ("23:34a, ESV"). */
  var AFTER_RE = new RegExp(
    "^[a-d]?\\s*(?:[,;]\\s*)?(?:\\(\\s*)?(?:\u03b8\\s*,\\s*)?(" + VERSION_ALT + ")(?![A-Za-z\\u00C0-\\u024F0-9_])");
  /* A resource, not a choice of translation: "CSB Study Bible", "NET Bible
     notes", "NIV Commentary". */
  var TITLE_AFTER = /^[\s.]*(?:Study|Commentary|Notes|Dictionary|Atlas|Reader|Bible\s+(?:notes|Notes|Commentary|Dictionary))\b/;
  /* A translation denied, not chosen: "certainly not to the LXX version". */
  var DENIED_BEFORE = /\bnot\s+(?:to\s+|in\s+|from\s+|of\s+|by\s+)?(?:the\s+)?$/i;
  /* A note that sets the translation for a whole article or paper:
     "All Scripture quotations are from the ESV", "unless otherwise noted, …
     taken from the NET". */
  var DECLARED_RE = new RegExp(
    "(?:\\b(?:All|all)\\b|unless otherwise (?:noted|indicated|stated))[^.]{0,90}?" +
    "(?:Scripture|scripture|quotations?|references|citations|verses)[^.]{0,60}?" +
    "(?:from|are|is|in)\\s+(?:the\\s+)?(" + VERSION_ALT + ")(?![A-Za-z0-9])");

  /* Sentence ends for the reach of a translation. Unlike sentenceStarts this
     does not end a sentence at an abbreviation ("Gen. 4:7", "cf. v. 9", "J.
     Byron"), or "the NET renders Gen. 4:7" would lose the NET at "Gen.". */
  var ABBR_WORDS = ["cf", "e.g", "i.e", "v", "vv", "ch", "chs", "p", "pp", "ed", "eds", "trans",
                    "vol", "no", "ibid", "Ibid", "al", "etc", "ca", "c", "St", "Dr", "Mr", "Mrs", "Jr", "Sr"];
  // the English book abbreviations ("Gen", "Matt", "1 Pet"), not the full names
  BOOKS.forEach(function (bk) { bk[1].forEach(function (n) { if (n !== bk[0] && n.length <= 7) ABBR_WORDS.push(n); }); });
  var ABBREV = new RegExp("(?:^|[\\s(\\[])(?:[A-Z]|" + ABBR_WORDS.map(esc).join("|") + ")$");
  function versionSentenceStarts(text) {
    var bounds = [0], re = /[.!?]["'”’)\]]*\s+/g, m;
    while ((m = re.exec(text))) {
      if (text[m.index] === "." && ABBREV.test(text.slice(Math.max(0, m.index - 9), m.index))) continue;
      bounds.push(m.index + m[0].length);
    }
    return bounds;
  }
  function blockOf(node) {
    for (var el = node.parentElement; el; el = el.parentElement) {
      if (/^(P|LI|TD|TH|BLOCKQUOTE|DIV|SECTION|ARTICLE|H4|H5|H6|DD|DT|FIGCAPTION)$/.test(el.tagName)) return el;
    }
    return null;
  }

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

  /* A NETS reference: a link to the project's PDF of the book, with a card
     (below) in place of a verse preview. Nothing is quoted from NETS. */
  function netsLink(bookName, chv, shown) {
    var a = document.createElement("a");
    a.className = "rtBibleRef ref-auto ref-nets";
    a.href = NETS_BASE + NETS[bookName][0] + "-nets.pdf";
    a.target = "_blank";
    a.rel = "noopener";
    a.setAttribute("data-reference", bookName + " " + chv);
    a.setAttribute("data-version", "nets");
    a.textContent = shown;
    return a;
  }

  /* The NETS card: what the reference is, where NETS keeps it, and the link.
     Hover (or focus) shows it on a computer; on a phone the first tap shows it
     and its link opens the PDF. */
  var netsCard = null, netsFor = null, netsTimer = 0, lastTouch = 0;
  function netsText(a) {
    var ref = a.getAttribute("data-reference") || "";
    var bookName = ref.replace(/\s+\d.*$/, ""), nb = NETS[bookName] || ["", bookName];
    var es = isSpanish(), where = ref.slice(bookName.length + 1);
    var named = nb[1] !== bookName ? nb[1] + " (" + bookName + ")" : nb[1];
    var note = "";
    if (bookName === "Psalms") note = es ? " NETS numera los salmos según el griego, a menudo uno menos." : " NETS numbers the Psalms by the Greek, often one lower.";
    if (bookName === "Jeremiah") note = es ? " Ieremias sigue el orden griego, distinto del hebreo desde el capítulo 25." : " Ieremias follows the Greek order, which departs from the Hebrew after chapter 25.";
    return {
      head: ref,
      body: (es ? "A New English Translation of the Septuagint. Cada libro es un PDF: este abre " + named + "; busque " + where + " allí."
                : "A New English Translation of the Septuagint. NETS comes as one PDF per book: this opens " + named + "; look for " + where + " there.") + note,
      link: es ? "Abrir en NETS (PDF) \u00bb" : "Open in NETS (PDF) \u00bb"
    };
  }
  function showNets(a) {
    clearTimeout(netsTimer);
    if (!netsCard) {
      netsCard = document.createElement("div");
      netsCard.className = "rc-nets-card";
      netsCard.setAttribute("role", "dialog");
      netsCard.addEventListener("mouseenter", function () { clearTimeout(netsTimer); });
      netsCard.addEventListener("mouseleave", function () { hideNetsSoon(); });
      document.body.appendChild(netsCard);
    }
    var t = netsText(a);
    netsCard.innerHTML = "";
    var h = document.createElement("div"); h.className = "rc-nets-h";
    h.appendChild(document.createTextNode(t.head + " "));
    var tag = document.createElement("span"); tag.textContent = "(NETS)"; h.appendChild(tag);
    var b = document.createElement("div"); b.className = "rc-nets-b"; b.textContent = t.body;
    var f = document.createElement("div"); f.className = "rc-nets-f";
    var l = document.createElement("a"); l.href = a.href; l.target = "_blank"; l.rel = "noopener"; l.textContent = t.link;
    f.appendChild(l);
    netsCard.appendChild(h); netsCard.appendChild(b); netsCard.appendChild(f);
    netsCard.setAttribute("aria-label", t.head + " (NETS)");
    netsCard.style.display = "block";
    var r = a.getBoundingClientRect(), w = netsCard.offsetWidth, ht = netsCard.offsetHeight;
    var left = Math.max(8, Math.min(r.left, innerWidth - w - 8));
    var top = r.bottom + 8 + ht < innerHeight ? r.bottom + 8 : Math.max(8, r.top - ht - 8);
    netsCard.style.left = left + "px";
    netsCard.style.top = top + "px";
    netsFor = a;
  }
  function hideNets() { clearTimeout(netsTimer); if (netsCard) netsCard.style.display = "none"; netsFor = null; }
  function hideNetsSoon() {
    clearTimeout(netsTimer);
    netsTimer = setTimeout(function check() {
      if ((netsCard && netsCard.matches(":hover")) || (netsFor && netsFor.matches(":hover"))) { netsTimer = setTimeout(check, 300); return; }
      hideNets();
    }, 260);
  }
  function wireNets() {
    var near = function (e) { return e.target && e.target.closest ? e.target.closest("a.ref-nets") : null; };
    document.addEventListener("touchstart", function (e) {
      lastTouch = Date.now();
      if (netsCard && netsFor && !netsCard.contains(e.target) && !near(e)) hideNets();
    }, true);
    document.addEventListener("mouseover", function (e) {
      var a = near(e);
      if (!a || Date.now() - lastTouch < 800) return;
      clearTimeout(netsTimer);
      netsTimer = setTimeout(function () { showNets(a); }, 220);
    });
    document.addEventListener("mouseout", function (e) {
      var a = near(e);
      if (a && !a.contains(e.relatedTarget)) hideNetsSoon();
    });
    document.addEventListener("focusin", function (e) { var a = near(e); if (a) showNets(a); });
    document.addEventListener("focusout", function (e) { if (near(e)) hideNetsSoon(); });
    // a tap shows the card first; its link opens the PDF
    document.addEventListener("click", function (e) {
      var a = near(e);
      if (a && Date.now() - lastTouch < 800 && netsFor !== a) { e.preventDefault(); showNets(a); }
    }, true);
    document.addEventListener("keydown", function (e) { if (e.key === "Escape" && netsFor) hideNets(); });
    window.addEventListener("scroll", function () { if (netsFor) hideNets(); }, true);
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

  /* A passage can name the book of every bare reference in it, whatever else
     it cites. Bauckham's list in the 1 and 2 Peter paper reads "1:11 (Dan 7:27
     θ, LXX); 1:17 (Ps 8:6); …": each bare reference is 2 Peter and each book
     named is the Old Testament source, so sentence context links "1:17" to
     Daniel. build_paper_text.py marks such a passage data-ref-book="2 Peter";
     nothing else on the site carries the attribute, so nothing else changes. */
  function forcedBookOf(node, lookup, bookRe) {
    for (var el = node.parentElement; el; el = el.parentElement) {
      if (el.hasAttribute && el.hasAttribute("data-ref-book")) {
        bookRe.lastIndex = 0;
        var fm = bookRe.exec(el.getAttribute("data-ref-book") || "");
        bookRe.lastIndex = 0;
        return fm ? (lookup[fm[1].toLowerCase()] || null) : null;
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

  /* The title of what is being read: a heading inside it (a paper's text), the
     reader's title bar when it is shown in the reader (an article's text has
     no heading of its own), else the page's own heading. */
  function titleOf(root) {
    var h = root.querySelector ? root.querySelector("h1, h2") : null;
    if (h) return h.textContent;
    var t = document.getElementById("modalTitle");
    if (t && root.id === "modalBody") return t.textContent;
    h = document.querySelector("h1");
    return h ? h.textContent : "";
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

    /* A book named in the title is the book under discussion from the start.
       The Spanish "Filipenses 2" names its book only in its title — its text
       says "los filipenses", the people — so its "(1:27)" had no book and was
       left plain, while the English, which says "the Philippians", was linked
       (found 2026-11-16). A book named in the text still takes over at once. */
    (function () {
      var title = titleOf(root) || "", tm, tb = null;
      BOOK_RE.lastIndex = 0;
      while ((tm = BOOK_RE.exec(title))) tb = BOOK_LOOKUP[tm[1].toLowerCase()] || tb;
      BOOK_RE.lastIndex = 0;
      if (tb) book = tb;
    })();

    /* The translation of this article or paper, if it declares one. */
    var docDefault = DEFAULT_VERSION;
    var dm = DECLARED_RE.exec(root.textContent || "");
    if (dm && VERSIONS[dm[1]] && VERSIONS[dm[1]] !== "nets") docDefault = VERSIONS[dm[1]];
    /* RefTagger links references that name their book in its own default;
       one meant for another translation is taken over here instead. */
    var TAGGER_VERSION = "nasb95";
    // a translation still in force where a text node ends mid-sentence
    var carry = null;

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
      var forced = forcedBookOf(node, BOOK_LOOKUP, BOOK_RE);

      function bookAt(pos, carried) {
        if (forced) return forced;          // the passage names its own book
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

      /* Translations named in this text node. A translation reaches the
         references after it in its own sentence; a witness (LXX, Vulgate) only
         the reference it stands beside. Read for every node, so a translation
         named in one run of text ("the <em>NET</em> translates …") carries
         into the next run of the same paragraph until the sentence ends. */
      var vbounds = versionSentenceStarts(text);
      var block = blockOf(node);
      var startVer = (carry && carry.block === block) ? carry.code : null;
      var vmarks = [], vm;
      VERSION_RE.lastIndex = 0;
      while ((vm = VERSION_RE.exec(text))) {
        var vname = vm[1], vat = vm.index + vm[0].indexOf(vname);
        var vend = vat + vname.length;
        VERSION_RE.lastIndex = vend;
        if (WITNESS[vname]) continue;
        if (TITLE_AFTER.test(text.slice(vend, vend + 24))) continue;
        if (DENIED_BEFORE.test(text.slice(Math.max(0, vat - 26), vat))) continue;
        vmarks.push([vat, VERSIONS[vname], sentenceOf(vbounds, vat)]);
      }
      // what is still in force at the end of this node, for the next one
      (function () {
        var lastSent = vbounds.length - 1, code = lastSent === 0 ? startVer : null;
        for (var i = 0; i < vmarks.length; i++) if (vmarks[i][2] === lastSent) code = vmarks[i][1];
        carry = code ? { block: block, code: code } : null;
      })();
      function sentenceVersion(pos) {
        var sent = sentenceOf(vbounds, pos), v = sent === 0 ? startVer : null;
        for (var i = 0; i < vmarks.length; i++) {
          if (vmarks[i][0] >= pos) break;
          if (vmarks[i][2] === sent) v = vmarks[i][1];
        }
        return v;
      }
      /* The translation for a reference: one beside it, else one earlier in
         its sentence, else the article's own, else the default. NETS only for
         the books it has; otherwise the reference keeps the default. */
      function versionFor(pos, endPos, bookName) {
        var am = AFTER_RE.exec(text.slice(endPos, endPos + 40));
        var v = (am && VERSIONS[am[1]]) || sentenceVersion(pos) || docDefault;
        if (v === "nets" && !NETS[bookName]) v = docDefault === "nets" ? DEFAULT_VERSION : docDefault;
        return v;
      }

      if (skippable(node) || !(book || forced)) return;

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

        var maxCh = CHAPTERS[useBook] || 150;
        var possible = !(+m[2] > maxCh || (m[4] && +m[4] > maxCh)) &&
                       !(+m[3] > 176 || (m[5] && +m[5] > 176));

        /* The run of verses that follows ("Romans 5:8, 10"), found before
           anything is changed, so a translation after the run ("…, 10,
           NASB1995") is seen as belonging to the whole of it. */
        var runEnd = m.index + m[0].length;
        CONT_RE.lastIndex = runEnd;
        var cr;
        while ((cr = CONT_RE.exec(text)) && cr.index === runEnd) { runEnd = cr.index + cr[0].length; CONT_RE.lastIndex = runEnd; }
        var ver = versionFor(m.index, runEnd, useBook);

        // On English pages RefTagger already handles references that name
        // their book, in its default, so leave those alone unless another
        // translation is wanted. On Spanish pages it cannot see them at all,
        // so we take those too.
        if (named) book = named;
        if (named && !spanish && ver === TAGGER_VERSION) continue;
        if (!possible) continue;

        // Expand to the English name so RefTagger will tag it, remembering
        // the author's own wording to put back afterwards.
        var chv = m[2] + ":" + m[3];
        if (m[5]) chv += "-" + (m[4] ? m[4] + ":" + m[5] : m[5]);

        out = out || document.createDocumentFragment();
        out.appendChild(document.createTextNode(text.slice(cursor, m.index)));
        out.appendChild(ver === "nets" ? netsLink(useBook, chv, m[0]) : placeholder(useBook, chv, m[0], ver));
        cursor = m.index + m[0].length;
        linked++;

        /* A reference is often followed by more verses of the same chapter:
           "(1:5, 6; 3:18)" or "(9:1, 7)". Link those too. A number followed by
           a colon starts a new chapter, so it is left for the main pattern. */
        var lastCh = m[4] || m[2];
        CONT_RE.lastIndex = cursor;
        var c;
        while ((c = CONT_RE.exec(text)) && c.index === cursor) {
          if (+c[1] > 176 || (c[2] && +c[2] > 176)) break;
          var at = c[0].indexOf(c[1]);
          out.appendChild(document.createTextNode(c[0].slice(0, at)));
          var cchv = lastCh + ":" + c[1] + (c[2] ? "-" + c[2] : "");
          out.appendChild(ver === "nets" ? netsLink(useBook, cchv, c[0].slice(at))
                                         : placeholder(useBook, cchv, c[0].slice(at), ver));
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
      "vertical-align: baseline !important; line-height: inherit !important; }" +
      /* the NETS card, in the manner of RefTagger's light preview */
      ".rc-nets-card{display:none;position:fixed;z-index:9999999;width:320px;max-width:calc(100vw - 16px);" +
      "box-sizing:border-box;background:#fff;color:#444;border-radius:4px;overflow:hidden;" +
      "box-shadow:0 0 6px 0 #444;font:13px/1.45 Helvetica,Arial,sans-serif;text-align:left;}" +
      ".rc-nets-h{background:#e7e7e7;color:#333;font-weight:700;padding:7px 10px;}" +
      ".rc-nets-h span{font-weight:400;color:#666;}" +
      ".rc-nets-b{padding:9px 10px 4px;}" +
      ".rc-nets-f{padding:4px 10px 9px;text-align:right;}" +
      ".rc-nets-f a{color:#0080FF;text-decoration:none;}.rc-nets-f a:hover{color:#66B2FF;}" +
      "[data-theme=dark] .rc-nets-card{background:#1f242b;color:#d5dbe4;box-shadow:0 0 8px 0 #000;}" +
      "[data-theme=dark] .rc-nets-h{background:#2b3138;color:#e9edf3;}" +
      "[data-theme=dark] .rc-nets-h span{color:#a6afbf;}" +
      "[data-theme=dark] .rc-nets-f a{color:#86a3ff;}";
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
    wireNets();
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
