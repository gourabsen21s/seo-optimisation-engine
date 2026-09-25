/**
 * Real output from one Rankcrew run, used as the landing page's sample data.
 * Source: `seo-engine` audit of https://books.toscrape.com (a public scraping sandbox), 2026-09-25.
 * Nothing here is invented: counts, titles and paths are copied from that audit and its proposed fixes.
 */
export const SAMPLE = {
  site: "books.toscrape.com",
  date: "2026-09-25",
  crawlSeconds: 51,
  scores: { overall: 50, seo: 40, adsense: 60 },
  bySeverity: {"critical": 1, "high": 8, "medium": 7, "low": 12, "info": 3},
  fixes: { total: 67, safe: 65, review: 2, canonicals: 56, draftPages: 5, schema: 2, files: 3, manual: 1 },
} as const;

export type Severity = "critical" | "high" | "medium" | "low" | "info";
export const FINDINGS: { s: Severity; t: string; n: number }[] = [
{
"s": "critical",
"t": "No Privacy Policy page found",
"n": 0
},
{
"s": "high",
"t": "No Google-certified consent banner (CMP) detected",
"n": 0
},
{
"s": "high",
"t": "No Disclaimer page found",
"n": 0
},
{
"s": "high",
"t": "No Contact page found",
"n": 0
},
{
"s": "high",
"t": "HTTP does not redirect to HTTPS",
"n": 0
},
{
"s": "high",
"t": "Mixed content (http:// resources on https pages)",
"n": 56
},
{
"s": "high",
"t": "Site resolves on more than one address",
"n": 0
},
{
"s": "high",
"t": "No XML sitemap found",
"n": 0
},
{
"s": "high",
"t": "Only 0 articles found (crawl limit reached — may be higher)",
"n": 0
},
{
"s": "medium",
"t": "No Terms of Use page found",
"n": 0
},
{
"s": "medium",
"t": "About page is not in the header menu",
"n": 1
},
{
"s": "medium",
"t": "About page is thin (385 words)",
"n": 1
},
{
"s": "medium",
"t": "Pages without a canonical tag",
"n": 56
},
{
"s": "medium",
"t": "Homepage has no Organization schema",
"n": 1
},
{
"s": "medium",
"t": "Duplicate titles",
"n": 6
},
{
"s": "medium",
"t": "Pages without a meta description",
"n": 6
},
{
"s": "low",
"t": "No Editorial Policy page found",
"n": 0
},
{
"s": "low",
"t": "No human-readable HTML sitemap page",
"n": 0
},
{
"s": "low",
"t": "No robots.txt file",
"n": 0
},
{
"s": "low",
"t": "Images without width/height (causes layout shift)",
"n": 56
},
{
"s": "low",
"t": "Homepage has no WebSite schema",
"n": 1
},
{
"s": "low",
"t": "No site search form",
"n": 0
},
{
"s": "low",
"t": "No publish dates detected",
"n": 0
},
{
"s": "low",
"t": "Heading levels are skipped (e.g. H1 → H3)",
"n": 6
},
{
"s": "low",
"t": "Meta descriptions outside 70–160 characters",
"n": 49
},
{
"s": "low",
"t": "Missing Open Graph title/image (poor social sharing)",
"n": 56
},
{
"s": "low",
"t": "Titles outside 30–60 characters",
"n": 24
},
{
"s": "low",
"t": "URLs with uppercase, underscores or excessive length",
"n": 50
},
{
"s": "info",
"t": "No ads.txt yet (add it right after approval)",
"n": 0
},
{
"s": "info",
"t": "AdSense code not installed (add it when ready to apply)",
"n": 0
},
{
"s": "info",
"t": "No /llms.txt for AI answer engines (optional)",
"n": 0
}
];

export const CRAWLED: string[] = [
"/",
"/catalogue/page-2.html",
"/catalogue/its-only-the-himalayas_981/index.html",
"/catalogue/libertarianism-for-beginners_982/index.html",
"/catalogue/mesaerion-the-best-science-fiction-stories-1800-1849_983/index.html",
"/catalogue/olio_984/index.html",
"/catalogue/our-band-could-be-your-life-scenes-from-the-american-indie-underground-1981-1991_985/index.html",
"/catalogue/rip-it-up-and-start-again_986/index.html",
"/catalogue/scott-pilgrims-precious-little-life-scott-pilgrim-1_987/index.html",
"/catalogue/shakespeares-sonnets_989/index.html",
"/catalogue/set-me-free_988/index.html",
"/catalogue/starving-hearts-triangular-trade-trilogy-1_990/index.html",
"/catalogue/the-black-maria_991/index.html",
"/catalogue/the-boys-in-the-boat-nine-americans-and-their-epic-quest-for-gold-at-the-1936-berlin-olympics_992/index.html",
"/catalogue/the-coming-woman-a-novel-based-on-the-life-of-the-infamous-feminist-victoria-woodhull_993/index.html",
"/catalogue/the-dirty-little-secrets-of-getting-your-dream-job_994/index.html",
"/catalogue/the-requiem-red_995/index.html",
"/catalogue/sapiens-a-brief-history-of-humankind_996/index.html",
"/catalogue/page-3.html",
"/catalogue/page-1.html",
"/catalogue/you-cant-bury-them-all-poems_961/index.html",
"/catalogue/in-a-dark-dark-wood_963/index.html",
"/catalogue/behind-closed-doors_962/index.html",
"/catalogue/maude-1883-1993she-grew-up-with-the-country_964/index.html",
"/catalogue/penny-maybe_965/index.html",
"/catalogue/sophies-world_966/index.html",
"/catalogue/the-bear-and-the-piano_967/index.html",
"/catalogue/the-elephant-tree_968/index.html",
"/catalogue/the-five-love-languages-how-to-express-heartfelt-commitment-to-your-mate_969/index.html",
"/catalogue/the-four-agreements-a-practical-guide-to-personal-freedom_970/index.html",
"/catalogue/wall-and-piece_971/index.html",
"/catalogue/worlds-elsewhere-journeys-around-shakespeares-globe_972/index.html",
"/catalogue/aladdin-and-his-wonderful-lamp_973/index.html",
"/catalogue/americas-cradle-of-quarterbacks-western-pennsylvanias-football-factory-from-johnny-unitas-to-joe-montana_974/index.html",
"/catalogue/birdsong-a-story-in-pictures_975/index.html",
"/catalogue/page-4.html",
"/catalogue/the-natural-history-of-us-the-fine-art-of-pretending-2_941/index.html",
"/catalogue/peak-secrets-from-the-new-science-of-expertise_389/index.html",
"/catalogue/a-summer-in-europe_458/index.html",
"/catalogue/setting-the-world-on-fire-the-brief-astonishing-life-of-st-catherine-of-siena_603/index.html",
"/catalogue/life_104/index.html",
"/catalogue/no-one-here-gets-out-alive_336/index.html",
"/catalogue/the-story-of-hong-gildong_84/index.html",
"/catalogue/my-name-is-lucy-barton_720/index.html",
"/catalogue/louisa-the-extraordinary-life-of-mrs-adams_818/index.html",
"/catalogue/god-the-most-unpleasant-character-in-all-fiction_697/index.html",
"/catalogue/the-bone-hunters-lexy-vaughan-steven-macaulay-2_343/index.html",
"/catalogue/leave-this-song-behind-teen-poetry-at-its-best_474/index.html",
"/catalogue/you-are-what-you-love-the-spiritual-power-of-habit_872/index.html",
"/catalogue/orchestra-of-exiles-the-story-of-bronislaw-huberman-the-israel-philharmonic-and-the-one-thousand-jews-he-saved-from-nazi-horrors_337/index.html",
"/catalogue/this-is-your-brain-on-music-the-science-of-a-human-obsession_414/index.html",
"/catalogue/shtum_733/index.html",
"/catalogue/the-mistake-off-campus-2_851/index.html",
"/catalogue/page-5.html",
"/catalogue/the-e-myth-revisited-why-most-small-businesses-dont-work-and-what-to-do-about-it_545/index.html",
"/catalogue/the-thing-about-jellyfish_283/index.html"
];
