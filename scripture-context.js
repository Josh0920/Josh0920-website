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
 *        - the LXX, the Septuagint, the OG (Old Greek) and the Vulgate are texts
 *          under discussion more often than translations being quoted, so they
 *          count only right beside a reference — read on past inline markup
 *          and page markers: "Dan 7:27 <span>θ</span>, LXX", "65:17 (p13 OG)";
 *          or right before one, which the bare references in its list then
 *          share: "LXX Genesis 32:14, 19; 33:10" (2026-11-23).
 *   6. Tables (Joshua, 2026-11-17, "make these rules universal"): a bare
 *      reference in a table cell belongs to its column's heading when that
 *      heading is a book ("Psalms" over "33:20 (OG)"); in a comparison table's
 *      other columns only references naming their own book are linked.
 *      Pseudepigrapha ("Jub. 4:15", "T. Reu. 5:6") are not Scripture, and a
 *      range written short ("24-5") is 24-25.
 *   5. "v. 7", "vv. 6–7", "vv 6-7", "v. 9b", "vs 26" (his own short form),
 *      "verse 34a", "verses 34–35" (and Spanish "versículo(s)") are verses of
 *      the chapter in hand (Joshua, 2026-11-16: "learn that "v. [number]" and
 *      "vv [numbers]" refers to verses as well"). The chapter, in order:
 *      the passage cited after a quotation the "v." stands in (“… [verse 10
 *      …] …” (Romans 5:8, 10)); a reference or chapter named earlier in its
 *      sentence; the passage of the commentary section it is in; then, on a
 *      page whose title names a chapter ("Titus 2: So That", "… of Luke
 *      23:34a"), the last reference before it, but the title's own chapter
 *      after a mere mention of a chapter of the same book ("in Genesis 3") or
 *      after a new paragraph; elsewhere the last reference or chapter named
 *      before it. A reference in parentheses the "v." is outside of is an
 *      aside ("(false teachers, 1:10ff)") on such a page. A book named with no
 *      chapter ("the book of Romans") leaves none, and then nothing is linked,
 *      unless it is the book already in hand ("Titus’ opponents"). The name of
 *      a work (in italics, or a run of chapters: Westermann's *Genesis 1-11*)
 *      sets no chapter. Checked 2026-11-17 against all 111 pages.
 *   4. NETS (Joshua, 2026-11-16: "can you create the ability to use NETS"):
 *      a reference marked NETS, or LXX/Septuagint beside it, opens the NETS
 *      project's own PDF of that book, with a small card in place of
 *      RefTagger's verse text. For a passage in NETS_PLACES (2026-11-17, "can
 *      you display on my website the verse with a link to that exact part of
 *      the pdf?") the card shows NETS's wording, read off the PDF, with NETS's
 *      credit line, and the link opens the PDF at that verse. NETS allows
 *      quoting up to 250 verses that way; the PDFs themselves "may not be
 *      sold or redistributed", so the site links to them and never copies
 *      them.
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
    // "OG" (Old Greek) is Jobes's name for the Septuagint outside the
    // Pentateuch: "33:2 OG", "Is 42:12 OG" (2026-11-17)
    "LXX": "nets", "Septuagint": "nets", "Septuaginta": "nets", "OG": "nets", "Old Greek": "nets",
    "Vulgate": "vulgataclem", "Vulgata": "vulgataclem"
  };
  var WITNESS = { "LXX": 1, "Septuagint": 1, "Septuaginta": 1, "OG": 1, "Old Greek": 1, "Vulgate": 1, "Vulgata": 1 };

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

  /* NETS passages cited on the site, read off the NETS PDFs: the PDF page,
     how far down it the verse starts (in points, for the viewer's
     "view=FitH,top", so Chrome opens with the verse at the top of the window;
     other viewers open the page), and NETS's wording, shown in the card.
     NETS's terms allow quoting up to 250 verses with its credit line, which
     the card carries. Not for the 1 and 2 Peter commentary: a commentary
     needs Oxford University Press's written permission. */
  var NETS_PLACES = {
    // the 1 and 2 Peter paper and commentary (tables of LXX/OG references) and the
    // commentary's notes, read off the NETS PDFs 2026-11-17; Psalms use the Greek
    // numbering NETS prints first ("33:2 OG"). NETS numbers the Old Greek's Hosea
    // 2:25 as 2:23 (num). Daniel has the Old Greek and Theodotion side by side
    // ("Daniel 7:27" and "Daniel 7:27 Th").
    "Genesis 6:17": { page: 9, top: 757, text: "And for my part, look, I am going to bring the flood, water on the earth, to destroy under heaven all flesh in which is a spirit of life, and as many as there are on the earth shall perish." },
    "Genesis 18:22": { page: 16, top: 182, text: "And after the men had turned away from there, they went to Sodoma, but Abraam was still standing before the Lord." },
    "Genesis 19:29": { page: 17, top: 160, text: "And it came about when God annihilated all the cities of the neighboring region that God remembered Abraam and sent Lot out of the midst of the overthrow when the Lord overthrew the cities which Lot used to dwell in." },
    "Exodus 19:5": { page: 22, top: 650, text: "And now if by paying attention you listen to my voice and keep my covenant, you shall be for me a people special above all nations. For all the earth is mine." },
    "Exodus 19:6": { page: 22, top: 650, text: "And you shall be for me a royal priesthood and a holy nation. These words you shall say to the sons of Israel." },
    "Leviticus 16:30": { page: 16, top: 297, text: "For on this day he shall make atonement for you, to cleanse you from all your sins before the Lord, and you shall be clean." },
    "Proverbs 3:34": { page: 6, top: 780, text: "The Lord resists the arrogant, but he gives grace to the humble." },
    "Proverbs 11:31": { page: 12, top: 490, text: "If the righteous is scarcely saved, where will the impious and the sinner appear?" },
    "Proverbs 19:22": { page: 18, top: 380, text: "Compassion is a profit for a man, and a poor righteous person is better than a rich liar." },
    "Psalms 8:6": { page: 9, top: 402, text: "You diminished him a little in comparison with angels; with glory and honor you crowned him." },
    "Psalms 33:1": { page: 21, top: 557, text: "Pertaining to Dauid. When he changed his face before Abimelech, and he let him go, and he went away." },
    "Psalms 33:2": { page: 21, top: 603, text: "I will bless the Lord at every opportunity; continually shall his praise be in my mouth." },
    "Psalms 33:5": { page: 21, top: 691, text: "I sought the Lord, and he hearkened to me, and from all my sojournings he rescued me." },
    "Psalms 33:6": { page: 21, top: 724, text: "Come to him, and be enlightened, and your faces shall never be put to shame." },
    "Psalms 33:8": { page: 22, top: 104, text: "An angel of the Lord will encamp around those who fear him and will rescue them." },
    "Psalms 33:9": { page: 22, top: 134, text: "O taste, and see that the Lord is kind; happy the man who hopes in him." },
    "Psalms 33:12": { page: 22, top: 260, text: "Come, O children; hear me; the fear of the Lord I will teach you." },
    "Psalms 33:13": { page: 22, top: 281, text: "What person is he who wants life, coveting to see good days?" },
    "Psalms 33:14": { page: 22, top: 303, text: "Stop your tongue from evil and your lips from speaking deceit." },
    "Psalms 33:15": { page: 22, top: 325, text: "Turn away from evil, and do good; seek peace, and pursue it." },
    "Psalms 33:16": { page: 22, top: 358, text: "The Lord’s eyes are on the righteous, and his ears are toward their petition." },
    "Psalms 33:17": { page: 22, top: 380, text: "But the Lord’s face is against evildoers, to destroy the remembrance of them from earth." },
    "Psalms 33:18": { page: 22, top: 402, text: "The righteous cried, and the Lord listened to them, and from all their afflictions he rescued them." },
    "Psalms 33:20": { page: 22, top: 479, text: "Many are the afflictions of the righteous, and from them all he will rescue them." },
    "Psalms 33:23": { page: 22, top: 556, text: "The Lord will redeem his slaves’ souls, and none of those who hope in him will go wrong." },
    "Psalms 89:4": { page: 52, top: 104, text: "because a thousand years in your sight are like the day of yesterday that passed and a watch in a night." },
    "Psalms 117:22": { page: 65, top: 690, text: "A stone which the builders rejected, this one became the chief cornerstone." },
    "Isaiah 8:12": { page: 9, top: 722, text: "Never say “Hard,” for whatever this people says is hard, but do not fear what it fears, neither be troubled." },
    "Isaiah 8:13": { page: 9, top: 722, text: "Sanctify the Lord himself, and he himself will be your fear." },
    "Isaiah 28:16": { page: 22, top: 700, text: "therefore thus says the Lord, See, I will lay for the foundations of Sion a precious, choice stone, a highly valued cornerstone for its foundations, and the one who believes in him will not be put to shame." },
    "Isaiah 34:4": { page: 28, top: 190, text: "Heaven shall roll up like a scroll, and all the stars shall fall like leaves from a vine and as leaves fall from a fig tree." },
    "Isaiah 42:8": { page: 34, top: 502, text: "I am the Lord God; this is my name; my glory I will not give to another, nor my excellences to the graven images." },
    "Isaiah 42:12": { page: 34, top: 766, text: "They will give glory to God; they will declare his excellences in the islands." },
    "Isaiah 43:3": { page: 35, top: 214, text: "because I am the Lord your God, the Holy One of Israel, who saves you. I have made Egypt and Ethiopia and Soene your exchange on your behalf." },
    "Isaiah 43:4": { page: 35, top: 274, text: "Because you have become precious in my sight, you have been glorified, and I have loved you, and I will give many people on your behalf and rulers on behalf of your head." },
    "Isaiah 43:20": { page: 35, top: 406, text: "The wild animals of the field will praise me, sirens and the daughters of ostriches, because I have provided water in the wilderness and rivers in the dry land, to give drink to my chosen race," },
    "Isaiah 43:21": { page: 35, top: 477, text: "my people whom I have acquired to set forth my excellences." },
    "Isaiah 52:5": { page: 43, top: 612, text: "And now, why are you here? This is what the Lord says, Because my people were taken for nothing, you marvel and howl. This is what the Lord says, Because of you, my name is continually blasphemed among the nations." },
    "Isaiah 53:4": { page: 43, top: 730, text: "This one bears our sins and suffers pain for us, and we accounted him to be in trouble and calamity and ill-treatment." },
    "Isaiah 53:5": { page: 43, top: 778, text: "But he was wounded because of our acts of lawlessness and has been weakened because of our sins; upon him was the discipline of our peace; by his bruise we were healed." },
    "Isaiah 53:6": { page: 44, top: 106, text: "All we like sheep have gone astray; a man has strayed in his own way, and the Lord gave him over to our sins." },
    "Isaiah 53:9": { page: 44, top: 310, text: "And I will give the wicked for his burial and the rich for his death, because he committed no lawlessness, nor was deceit found in his mouth." },
    "Isaiah 65:17": { page: 52, top: 143, text: "For heaven will be new, and the earth will be new, and they shall not remember the former things, nor shall they come upon their heart," },
    "Hosea 2:25": { page: 7, top: 300, num: "23", text: "and I will sow her for myself in the land. And I will have pity on Not Pitied, and I will say to Not My People, “You are my people,” and he shall say, “You are the Lord my God.”" },
    "Daniel 7:27": { page: 23, top: 790, text: "And he shall give the authority and the kingdom and the magnitude of all the kingdoms, which are under heaven, to the holy people of the Most High, to reign over an everlasting kingdom, and all authorities will be subjected to him and obey him until the conclusion of the word.”" },
    "Daniel 7:27 Th": { page: 23, top: 790, text: "And the kingdom and the authority and the greatness of the kings, which are under the whole heaven, was given to the holy ones of the Most High, and his kingdom is an everlasting kingdom, and all dominions shall be slaves and heed him.”" },
    // the second Genesis 4 paper, "Cain and Abel: The MT and LXX Versions" (read off
    // the PDF 2026-11-23). It cites Genesis 32 by the Septuagint's numbers; NETS
    // prints the English number first: LXX 32:14 is its 13(14).
    "Genesis 4:7": { page: 8, top: 195, text: "If you offer correctly but do not divide correctly, have you not sinned? Be still; his recourse is to you, and you will rule over him.”" },
    "Genesis 32:14": { page: 28, top: 646, num: "13(14)", text: "And he slept there that night. And from what he was bringing he took presents and sent them off to his brother Esau," },
    "Genesis 32:19": { page: 28, top: 802, num: "18(19)", text: "you shall say, ‘Your servant Iakob’s; he has sent presents to my lord Esau, and there he is behind us.’ ”" },
    "Genesis 32:21": { page: 28, top: 106, num: "20(21)", text: "And you shall say, ‘There is your servant Iakob coming behind us.’ ” For he said, “I shall propitiate his face with the presents that go on before him, and afterwards I shall see his face, for perhaps he will accept my face.”" },
    "Genesis 32:22": { page: 28, top: 154, num: "21(22)", text: "And the presents passed by in front of him, but he himself slept that night in the camp." },
    "Genesis 33:10": { page: 28, top: 838, text: "But Iakob said, “If I have found favor before you, accept my presents through my hands; with regard to this I saw your face, as someone might see a divine face, and you will be pleased with me." },
    "Genesis 43:11": { page: 36, top: 250, text: "Then their father Israel said to them, “If it is so, do this: take some of the fruits of the land in your containers, and bring down presents to the man, some pine resin and some honey, incense and oil of myrrh and terebinth and nuts." },
    "Genesis 43:15": { page: 36, top: 394, text: "Now when the men took these presents they also took double the money in their hands, and Beniamin, and rising, they went down into Egypt and stood before Ioseph." },
    "Genesis 43:25": { page: 36, top: 790, text: "And they made the presents ready until Ioseph came at noon, for they had heard that he was going to have lunch there." },
    "Genesis 43:26": { page: 36, top: 838, text: "And Ioseph came into the dwelling, and they brought to him the presents that they had in their hands—into the house—and did obeisance to him face down on the ground." },
    // the Genesis 4 paper, footnote 18 (checked 2026-11-17, 01-gen-nets.pdf, page 8)
    "Genesis 4:8": { page: 8, top: 200,
      text: "And Kain said to his brother Habel, “Let us go through into the plain.” And it came about when they were in the plain, that then Kain rose up against his brother Habel and killed him." }
  };
  var NETS_CREDIT = "Quotations marked NETS are taken from A New English Translation of the Septuagint, ©2007 by the International Organization for Septuagint and Cognate Studies, Inc. Used by permission of Oxford University Press. All rights reserved.";
  /* The verses of a reference, from NETS_PLACES: "Psalms 33:12-17" gathers
     each verse, "Daniel 7:27" with th set takes Theodotion's text (NETS sets
     the Old Greek and Theodotion side by side). Null unless every verse is
     there; a reference then gets the plain card and the book's PDF. */
  function netsPlace(ref, th) {
    var m = /^(.+?) (\d+):(\d+)[a-d]?(?:-(\d+)[a-d]?)?$/.exec(ref);
    if (!m) return null;
    var from = +m[3], to = m[4] ? +m[4] : from, verses = [], first = null;
    if (to < from || to - from > 15) to = from;
    for (var v = from; v <= to; v++) {
      var key = m[1] + " " + m[2] + ":" + v;
      var p = (th && NETS_PLACES[key + " Th"]) || NETS_PLACES[key];
      if (!p) return null;
      first = first || p;
      verses.push([p.num || v, p.text]);
    }
    var twoTexts = !!NETS_PLACES[m[1] + " " + m[2] + ":" + from + " Th"], es = isSpanish();
    var label = twoTexts ? (th ? (es ? "Teodoci\u00f3n" : "Theodotion") : (es ? "griego antiguo" : "Old Greek")) : "";
    if (first.num) label = (es ? "numerado " : "numbered ") + m[2] + ":" + first.num;
    return { page: first.page, top: first.top, verses: verses, label: label };
  }

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
    ["Isaiah", ["Isaiah", "Isa", "Is"]],    // "Is 42:12 OG" (a short form: a book only with a number after it)
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
    ["1 Thessalonians", ["1 Tesalonicenses", "1 Tes", "1 Ts"]],   // "1 Tes. 4:1" was read as Luke (2026-11-16)
    ["2 Thessalonians", ["2 Tesalonicenses", "2 Tes", "2 Ts"]],
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
    // abbreviations of four letters or fewer ("Os", "Mal", "Josh", "1 Tes"),
    // unless the same spelling is a book's full name somewhere ("Job", "Amos")
    var full = {}, short = {};
    tables.forEach(function (t) { t.forEach(function (bk) { full[bk[1][0].toLowerCase()] = true; }); });
    tables.forEach(function (t) {
      t.forEach(function (bk) {
        bk[1].slice(1).forEach(function (n) {
          var k = n.toLowerCase();
          if (!full[k] && k.replace(/^\d\s*/, "").length <= 4) short[k] = true;
        });
      });
    });
    return {
      lookup: lookup,
      short: short,
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
    "^(?:[a-d]|ff?\\.?)?\\s*(?:[,;]\\s*)?(?:\\(\\s*)?(?:\u03b8\\s*,\\s*)?(" + VERSION_ALT + ")(?![A-Za-z\\u00C0-\\u024F0-9_])");
  var WITNESS_BEFORE = new RegExp("(?:^|[^A-Za-z\\u00C0-\\u024F0-9_/])(" +
    Object.keys(WITNESS).sort(function (x, y) { return y.length - x.length; }).map(esc).join("|") + ")\\s+$");
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

  /* "v. 7", "vv. 6–7", "vv 6-7", "v. 9b", "verse 34a", "verses 34–35", and the
     Spanish "versículo(s)". Group 1 is what comes before (not a letter, so
     "rev. 2" is not one), 2 the word, 3–6 the verse(s) and their letters. */
  var VERSE_RE = /(^|[^A-Za-z\u00C0-\u024F])((?:[Vv](?:v|ss?)?\.?|[Vv]erses?|[Vv]ers\u00edculos?)\s?)(\d{1,3})([a-d])?(?:\s*[-\u2013]\s*(\d{1,3})([a-d])?)?(?!\d|:\d)/g;
  /* A chapter named on its own: "chapter 3", "ch. 3", "chs. 18-9", "capítulo 3". */
  var CHAPTER_RE = /(?:^|[^A-Za-z\u00C0-\u024F])(?:[Cc]hapters?|ch\.|chs\.|[Cc]ap\u00edtulos?|[Cc]apitulos?|cap\.)\s*(\d{1,3})(?![\d:])(?!\s*[-\u2013]\s*\d)/g;   // not a run: "Chapters 1–17" is in a title

  /* Sentence ends for the reach of a translation. Unlike sentenceStarts this
     does not end a sentence at an abbreviation ("Gen. 4:7", "cf. v. 9", "J.
     Byron"), or "the NET renders Gen. 4:7" would lose the NET at "Gen.". */
  var ABBR_WORDS = ["cf", "e.g", "i.e", "esp", "v", "vv", "vs", "ch", "chs", "p", "pp", "ed", "eds", "trans",
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
    /(?:[Mm]inute|[Mm]in\.|[Tt]imestamp)\s*$|\bJub\.\s*$|\bT\.\s*[A-Z][a-z]{1,6}\.\s*$|\b[12]\s?(?:En|Bar)\.\s*$|\b(?:Hom|Ep|Comm|Adv|Haer|Strom|Apol|Praef|Frag|Serm|Tract|Ant|Vit|Pp|No|Vol)\.\s*$|\b(?:pp?|vol)\.\s*$/;
  function skippable(node) {
    for (var el = node.parentElement; el; el = el.parentElement) {
      if (SKIP.test(el.tagName)) return true;
      if (el.classList) {
        var cl = el.classList;
        // Tables are scanned: a bare reference there belongs to its column
        // heading (see columnBookOf), never to the surrounding prose.
        // "note"/"notes" are deliberately absent: footnotes are scanned like
        // any other prose, using the data-loc the build stamps on each note.
        if (cl.contains("no-ref") || cl.contains("meta") || cl.contains("kicker") ||
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
  function netsLink(bookName, chv, shown, th) {
    var a = document.createElement("a");
    a.className = "rtBibleRef ref-auto ref-nets";
    if (th) a.setAttribute("data-nets-text", "th");
    var place = netsPlace(bookName + " " + chv, th);
    a.href = NETS_BASE + NETS[bookName][0] + "-nets.pdf" +
             (place ? "#page=" + place.page + "&view=FitH," + place.top : "");
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
    var place = netsPlace(ref, a.getAttribute("data-nets-text") === "th");
    if (place) return {
      head: ref,
      label: place.label,
      verses: place.verses,
      credit: NETS_CREDIT,
      link: es ? "Abrir en NETS, pág. " + place.page + " del PDF »" : "Open in NETS, PDF page " + place.page + " »"
    };
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
    var tag = document.createElement("span"); tag.textContent = "(NETS" + (t.label ? ", " + t.label : "") + ")"; h.appendChild(tag);
    var b = document.createElement("div"); b.className = "rc-nets-b";
    if (t.verses) {
      b.className += " rc-nets-v";
      t.verses.forEach(function (vv, i) {
        var num = document.createElement("sup"); num.textContent = vv[0];
        b.appendChild(num); b.appendChild(document.createTextNode(" " + vv[1] + (i < t.verses.length - 1 ? " " : "")));
      });
    } else b.textContent = t.body;
    var f = document.createElement("div"); f.className = "rc-nets-f";
    var l = document.createElement("a"); l.href = a.href; l.target = "_blank"; l.rel = "noopener"; l.textContent = t.link;
    f.appendChild(l);
    netsCard.appendChild(h); netsCard.appendChild(b); netsCard.appendChild(f);
    if (t.credit) { var c = document.createElement("div"); c.className = "rc-nets-c"; c.textContent = t.credit; netsCard.appendChild(c); }
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

  /* The chapter of the commentary section a node is in: "2 Peter · 1:1-4" is
     chapter 1. Returns [section element, book, chapter] or null. */
  function homeChapterOf(node, lookup, bookRe) {
    for (var el = node.parentElement; el; el = el.parentElement) {
      if (el.hasAttribute && el.hasAttribute("data-loc")) {
        var loc = el.getAttribute("data-loc") || "", found = null, bm2, at = -1;
        bookRe.lastIndex = 0;
        while ((bm2 = bookRe.exec(loc))) { found = lookup[bm2[1].toLowerCase()] || found; at = bm2.index + bm2[0].length; }
        bookRe.lastIndex = 0;
        var cm = at >= 0 ? /(\d{1,3})\s*[:.]\s*\d/.exec(loc.slice(at)) : null;
        return found && cm ? [el, found, +cm[1]] : [el, null, null];
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

  /* A table cell's book: the heading of its column when that heading is a
     book ("Psalms" over "33:20 (OG)" in the 1 and 2 Peter tables). Returns
     the book, "" for a cell of a comparison table (papers, commentary) whose
     column names no book — its bare references are then left alone — or null
     outside such tables. */
  function columnBookOf(node, lookup) {
    var cell = null;
    for (var el = node.parentElement; el; el = el.parentElement) {
      if (el.tagName === "TD" || el.tagName === "TH") { cell = el; break; }
    }
    if (!cell) return null;
    var table = cell.closest ? cell.closest("table") : null;
    if (!table) return null;
    var head = table.tHead && table.tHead.rows[0];
    var th = head && head.cells[cell.cellIndex];
    var name = th ? (th.textContent || "").replace(/\s+/g, " ").trim().toLowerCase() : "";
    if (name && lookup[name]) return lookup[name];
    var compare = table.classList.contains("sbl") || !!(table.closest && table.closest(".tbl-wrap"));
    return compare ? "" : null;
  }

  /* "24-5" is 24-25, "20-1" is 20-21: the end of a range written short. */
  function rangeEnd(a, b) {
    if (b && +b < +a && b.length < a.length) return a.slice(0, a.length - b.length) + b;
    return b;
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
    // a paper's own title on its title page, not its first section heading
    var h = root.querySelector ? root.querySelector(".fm-title, h1, h2") : null;
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
    // the chapter in hand where the last text ended:
    // [book, chapter or null, named with a verse?, its block]
    var chapCarry = null, lastHome = null;
    // the passage in the title ("Titus 2: So That", "… of Luke 23:34a"): [book, chapter]
    var titleCh = null;
    (function () {
      var title = titleOf(root) || "", tm, tb = null, tc = null;
      BOOK_RE.lastIndex = 0;
      while ((tm = BOOK_RE.exec(title))) {
        tb = BOOK_LOOKUP[tm[1].toLowerCase()] || tb;
        var cm = /^\.?\s+(\d{1,3})(?!\d)/.exec(title.slice(tm.index + tm[0].length));
        tc = cm ? +cm[1] : null;
      }
      BOOK_RE.lastIndex = 0;
      if (tb) book = tb;
      if (tb && tc) { chapCarry = [tb, tc, true, null]; titleCh = [tb, tc]; }
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

    nodes.forEach(function (node, ni) {
      var text = node.nodeValue;
      if (!text || !text.trim()) return;

      // Where each book is named here, with its sentence, so a reference can
      // pick the one that actually governs it.
      var bounds = sentenceStarts(text);
      var bmarks = [], bm;
      BOOK_RE.lastIndex = 0;
      while ((bm = BOOK_RE.exec(text))) {
        /* A short form is a book only with a chapter after it: the Spanish
           «Os exhortamos» is "you", not Hosea; "Josh", "Phil", "Mal" alone are
           a name or a word. */
        if (bundle.short[bm[1].toLowerCase()] &&
            !/^\.?\s*[\[(]?\d/.test(text.slice(bm.index + bm[0].length, bm.index + bm[0].length + 5))) continue;
        bmarks.push([bm.index, BOOK_LOOKUP[bm[1].toLowerCase()], sentenceOf(bounds, bm.index)]);
      }
      if (bmarks.length) book = bmarks[bmarks.length - 1][1];   // sticky carry-over
      var home = homeBookOf(node, BOOK_LOOKUP, BOOK_RE);
      var column = columnBookOf(node, BOOK_LOOKUP);
      var forced = forcedBookOf(node, BOOK_LOOKUP, BOOK_RE) || column || null;

      function bookAt(pos, carried) {
        if (forced) return forced;          // the passage names its own book
        var sent = sentenceOf(bounds, pos), last = null, anyBefore = null;
        for (var i = 0; i < bmarks.length; i++) {
          if (bmarks[i][0] >= pos) break;
          anyBefore = bmarks[i][1];
          if (bmarks[i][2] === sent) last = bmarks[i][1];
        }
        if (last) return last;              // named in this very sentence
        if (column === "") return anyBefore;  // a table cell: only its own books
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
      /* What follows a reference, read on into the next runs of text of the
         same block: "Dan 7:27 <span>θ</span>, LXX" puts its LXX two text
         nodes further on. */
      function tailAt(endPos) {
        var tail = text.slice(endPos, endPos + 40);
        for (var j = ni + 1; tail.length < 40 && j < nodes.length; j++) {
          if (blockOf(nodes[j]) !== block) break;
          if (skippable(nodes[j])) continue;        // a page marker ("p13") between
          tail += nodes[j].nodeValue || "";
        }
        return tail.slice(0, 40);
      }
      // Theodotion's sign after a reference: "Dan 7:27 θ, LXX"
      function theodotion(endPos) { return /^(?:[a-d]|ff?\.?)?\s*(?:[,;]\s*)?(?:\(\s*)?\u03b8/.test(tailAt(endPos)); }
      function versionFor(pos, endPos, bookName, before) {
        var am = AFTER_RE.exec(tailAt(endPos));
        var v = (am && VERSIONS[am[1]]) || before || sentenceVersion(pos) || docDefault;
        if (v === "nets" && !NETS[bookName]) v = docDefault === "nets" ? DEFAULT_VERSION : docDefault;
        return v;
      }

      /* Where a chapter is put in hand in this node: by a reference, by a
         book named with a chapter ("Genesis 4 begins"), by "chapter 3" — and
         where a book named alone ("the book of Genesis") leaves none. Read in
         every node, headings and links included, as books are. */
      var homeCh = homeChapterOf(node, BOOK_LOOKUP, BOOK_RE);
      if (homeCh && homeCh[0] !== lastHome) { lastHome = homeCh[0]; if (homeCh[2]) chapCarry = [homeCh[1], homeCh[2], true, null]; }
      var blk = blockOf(node);
      /* The name of a work is not a chapter put in hand: Westermann's
         *Genesis 1-11*, a commentary on "Luke 9:51-24:53". So a book in italics
         sets none, nor does a run of chapters. */
      var cited = (function () {
        for (var el = node.parentElement; el && el !== blk; el = el.parentElement) {
          if (/^(I|EM|CITE)$/.test(el.tagName)) return true;
        }
        return false;
      })();
      // marks: [where, book, chapter or null, named with a verse?, sentence]
      var chapStart = chapCarry, cmarks = [], refSpans = [], km;
      REF_RE.lastIndex = 0;
      while ((km = REF_RE.exec(text))) {
        refSpans.push([km.index, km.index + km[0].length]);
        if (km[4] && +km[4] !== +km[2]) continue;                    // "9:51-24:53"
        var kb = km[1] ? BOOK_LOOKUP[km[1].toLowerCase()] : bookAt(km.index, book);
        if (kb) cmarks.push([km.index, kb, +km[2], true]);
      }
      REF_RE.lastIndex = 0;
      for (var bi = 0; bi < bmarks.length; bi++) {
        var bAt = bmarks[bi][0], bAfter = text.slice(bAt, bAt + 60);
        var nameLen = (BOOK_RE.lastIndex = 0, (BOOK_RE.exec(bAfter) || [""])[0].length);
        BOOK_RE.lastIndex = 0;
        var rest = bAfter.slice(nameLen), cnum = /^\.?\s+(\d{1,3})(?![\d])(\s*[:.]\s*\d)?(\s*[-–]\s*\d)?/.exec(rest);
        if (cited) continue;
        // "the Philippians", "the Romans": the people, not the book
        if (!cnum && /(?:ians|ans|ews)$/.test(bmarks[bi][1]) && /\bthe\s+$/i.test(text.slice(Math.max(0, bAt - 5), bAt + 1))) continue;
        if (!cnum) cmarks.push([bAt, bmarks[bi][1], null, false]);          // a book alone: no chapter
        else if (!cnum[2] && !cnum[3]) cmarks.push([bAt, bmarks[bi][1], +cnum[1], false]);  // "Genesis 4 begins"
      }
      CHAPTER_RE.lastIndex = 0;
      while ((km = CHAPTER_RE.exec(text))) {
        var cb = bookAt(km.index, book);
        if (cb) cmarks.push([km.index, cb, +km[1], true]);
      }
      cmarks.sort(function (x, y) { return x[0] - y[0]; });
      /* A book named alone puts no chapter in hand, so it ends the one in
         hand — unless it is that same book: "Titus’ opponents" in Titus 2,
         "Mark writes" in Mark 2. */
      (function () {
        var cur = chapStart && chapStart[1] ? chapStart[0] : (titleCh ? titleCh[0] : null);
        cmarks = cmarks.filter(function (cm) {
          if (!cm[2] && cm[1] === cur) return false;
          cur = cm[2] ? cm[1] : null;
          return true;
        });
      })();
      // sentences that do not end at "esp." or "cf.": "1 Cor 13:1-13 (esp. verse 13)"
      for (var ci = 0; ci < cmarks.length; ci++) cmarks[ci].push(sentenceOf(vbounds, cmarks[ci][0]));
      if (cmarks.length) {
        var lastMark = cmarks[cmarks.length - 1];
        chapCarry = [lastMark[1], lastMark[2], lastMark[3], blk];
      }

      // parentheses, so an aside — "(false teachers, 1:10ff)" — can be told apart
      var parens = [];
      (function () {
        var open = [];
        for (var i = 0; i < text.length; i++) {
          if (text[i] === "(") open.push(i);
          else if (text[i] === ")" && open.length) parens.push([open.pop(), i]);
        }
      })();
      /* On a page about one passage, a reference in parentheses that closed
         before the "v." is an aside and does not move the "v." to its chapter.
         A citation closing a quotation is no aside: it names the passage. */
      function aside(at, pos) {
        if (!titleCh) return false;
        for (var i = 0; i < parens.length; i++) {
          var p = parens[i];
          if (p[0] < at && at < p[1] && p[1] < pos)
            return !/[”’"'»]\s*$/.test(text.slice(Math.max(0, p[0] - 3), p[0]));
        }
        return false;
      }
      /* A "v." inside a quotation that ends with its citation is a verse of
         that passage: “while we were yet sinners [verse 10 calls us
         ‘enemies’] Christ died for us” (Romans 5:8, 10). */
      function quoteCite(pos) {
        var open = Math.max(text.lastIndexOf("“", pos), text.lastIndexOf("«", pos));
        if (open < 0 || /[”»]/.test(text.slice(open, pos))) return null;
        var cm = /[”»]/.exec(text.slice(pos));
        if (!cm) return null;
        var close = pos + cm.index;
        if (/[“«]/.test(text.slice(pos, close))) return null;
        var after = /^[\s,.;:!?]*\(\s*/.exec(text.slice(close + 1));
        if (!after) return null;
        var at = close + 1 + after[0].length;
        for (var i = 0; i < cmarks.length; i++) {
          if (cmarks[i][3] && cmarks[i][0] >= at - 1 && cmarks[i][0] <= at + 1) return [cmarks[i][1], cmarks[i][2]];
        }
        return null;
      }
      /* The chapter for a "v." at pos: the passage a quotation around it
         cites; else one named in its sentence; else the section's passage.
         Then, on a page about one passage (its title names a chapter), the
         last reference before it, unless that was only a book or chapter named
         in passing ("in Genesis 3") — the page's passage again. Elsewhere,
         the last one before it, as before. */
      function chapterAt(pos) {
        var q = quoteCite(pos);
        if (q) return q;
        var sent = sentenceOf(vbounds, pos), inSent = null, last = null;
        for (var i = 0; i < cmarks.length; i++) {
          if (cmarks[i][0] >= pos) break;
          if (aside(cmarks[i][0], pos)) continue;
          last = cmarks[i];
          if (cmarks[i][4] === sent) inSent = cmarks[i];
        }
        if (inSent) return inSent[2] ? [inSent[1], inSent[2]] : null;
        if (homeCh && homeCh[2]) return [homeCh[1], homeCh[2]];
        if (titleCh) {
          if (last) {
            if (last[3]) return [last[1], last[2]];
            if (last[1] === titleCh[0]) return titleCh;
            return last[2] ? [last[1], last[2]] : null;
          }
          if (chapStart && chapStart[3] === blk && chapStart[2] && chapStart[1]) return [chapStart[0], chapStart[1]];
          return titleCh;
        }
        if (last) return last[2] ? [last[1], last[2]] : null;
        return chapStart && chapStart[1] ? [chapStart[0], chapStart[1]] : null;
      }

      if (skippable(node) || !(book || forced || chapStart || cmarks.length)) return;

      var reps = [];                 // [start, end, [nodes]] to put in place of the text
      REF_RE.lastIndex = 0;
      var cursor = 0, m, list = null;
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
        /* A witness right before a reference ("cf. LXX Genesis 32:14, 19; 33:10;
           43:11") is its text, and the text of the bare references that go on
           after it in the same list. */
        var wm = WITNESS_BEFORE.exec(text.slice(Math.max(0, m.index - 16), m.index));
        var before = wm ? VERSIONS[wm[1]]
                   : (!named && list && /^\s*;\s*$/.test(text.slice(list.end, m.index)) ? list.code : null);
        list = before ? { end: runEnd, code: before } : null;
        var ver = versionFor(m.index, runEnd, useBook, before);

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
        if (m[5]) chv += "-" + (m[4] ? m[4] + ":" + m[5] : rangeEnd(m[3], m[5]));
        var th = ver === "nets" && theodotion(runEnd);

        reps.push([m.index, m.index + m[0].length,
                   [ver === "nets" ? netsLink(useBook, chv, m[0], th) : placeholder(useBook, chv, m[0], ver)]]);
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
          var cchv = lastCh + ":" + c[1] + (c[2] ? "-" + rangeEnd(c[1], c[2]) : "");
          reps.push([c.index + at, c.index + c[0].length,
                     [ver === "nets" ? netsLink(useBook, cchv, c[0].slice(at), th)
                                     : placeholder(useBook, cchv, c[0].slice(at), ver)]]);
          cursor = c.index + c[0].length;
          linked++;
          CONT_RE.lastIndex = cursor;
        }
        REF_RE.lastIndex = cursor;
      }

      /* "v. 7", "vv. 6–7", "verse 34a": verses of the chapter in hand. */
      var taken = refSpans.concat(reps.map(function (r) { return [r[0], r[1]]; }));
      VERSE_RE.lastIndex = 0;
      var vr;
      while ((vr = VERSE_RE.exec(text))) {
        var vs = vr.index + vr[1].length, ve = vr.index + vr[0].length;
        var clash = taken.some(function (t) { return vs < t[1] && ve > t[0]; });
        var here = chapterAt(vs);
        if (clash || !here || +vr[3] > 176 || (vr[5] && +vr[5] > 176) ||
            (vr[5] && +rangeEnd(vr[3], vr[5]) < +vr[3]) || here[1] > (CHAPTERS[here[0]] || 150)) continue;
        // more verses of the same chapter after it: "vv. 6, 7"
        var vEnd = ve, more = [], cv;
        CONT_RE.lastIndex = ve;
        while ((cv = CONT_RE.exec(text)) && cv.index === vEnd) {
          if (+cv[1] > 176 || (cv[2] && +cv[2] > 176)) break;
          more.push(cv); vEnd = cv.index + cv[0].length; CONT_RE.lastIndex = vEnd;
        }
        var vver = versionFor(vs, vEnd, here[0]);
        var vchv = here[1] + ":" + vr[3] + (vr[5] ? "-" + rangeEnd(vr[3], vr[5]) : "");
        var shown = text.slice(vs, ve);
        reps.push([vs, ve, [vver === "nets" ? netsLink(here[0], vchv, shown) : placeholder(here[0], vchv, shown, vver)]]);
        linked++;
        more.forEach(function (cv2) {
          var at2 = cv2[0].indexOf(cv2[1]), ch2 = here[1] + ":" + cv2[1] + (cv2[2] ? "-" + cv2[2] : "");
          reps.push([cv2.index + at2, cv2.index + cv2[0].length,
                     [vver === "nets" ? netsLink(here[0], ch2, cv2[0].slice(at2)) : placeholder(here[0], ch2, cv2[0].slice(at2), vver)]]);
          linked++;
        });
        VERSE_RE.lastIndex = vEnd;
      }

      if (reps.length) {
        reps.sort(function (x, y) { return x[0] - y[0]; });
        var out = document.createDocumentFragment(), pos = 0;
        reps.forEach(function (r) {
          if (r[0] < pos) return;            // never overlap
          out.appendChild(document.createTextNode(text.slice(pos, r[0])));
          r[2].forEach(function (el) { out.appendChild(el); });
          pos = r[1];
        });
        out.appendChild(document.createTextNode(text.slice(pos)));
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
      ".rc-nets-v{font:15px/1.5 Georgia,'Times New Roman',serif;color:#222;}" +
      ".rc-nets-v sup{font:700 10px Helvetica,Arial,sans-serif;color:#777;margin-right:1px;}" +
      ".rc-nets-c{padding:7px 10px 8px;border-top:1px solid #e3e3e3;font-size:10.5px;line-height:1.35;color:#777;}" +
      "[data-theme=dark] .rc-nets-v{color:#e9edf3;}[data-theme=dark] .rc-nets-v sup{color:#a6afbf;}" +
      "[data-theme=dark] .rc-nets-c{border-top-color:#353c45;color:#a6afbf;}" +
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
