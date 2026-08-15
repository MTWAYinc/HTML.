// Port of scoutclub/scraping.py, using cheerio in place of BeautifulSoup.
// render_with_playwright() is intentionally NOT ported (see plan/RISKS notes) -
// the Python pipeline already treats it as an optional fallback that degrades
// to "no data" on any failure, so skipping it here just means that fallback
// path is always taken, which the scoring functions already handle gracefully.
const cheerio = require("cheerio");
const { fetchWithTimeout } = require("./fetchTimeout");
const reviewsWidgets = require("./reviewsWidgets");

const ABOUT_PATHS = ["/pages/about", "/pages/our-story", "/about", "/about-us", "/pages/team", "/team"];

const DECISION_MAKER_TITLES = /\b(Founder|Co-?Founder|CEO|Owner)\b/i;
const GROWTH_TITLES = /\b(VP\s*Growth|Head of Growth|CMO|VP\s*Marketing|Marketing Director|Head of Marketing)\b/i;
const CONTRACTOR_WORDS = /\b(agency|freelance|freelancer|consultant|contractor)\b/i;
const DROPSHIP_WORDS = /\b(dropship(ping)?|print[- ]on[- ]demand|fulfilled by|third[- ]party seller)\b/i;

const CATEGORY_KEYWORDS = {
  Clothing: ["dress", "dresses", "outerwear", "apparel", "jacket", "denim", "sweater", "t-shirt", "shirt", "pants", "activewear", "loungewear", "bra", "bras", "bralette", "bralettes", "underwear", "lingerie", "panty", "panties", "bodysuit", "bodysuits", "thong", "briefs", "intimates", "camisole", "shapewear"],
  Skincare: ["serum", "moisturizer", "cleanser", "skincare", "spf", "sunscreen", "toner", "retinol", "exfoliant"],
  Jewelry: ["ring", "rings", "necklace", "necklaces", "earring", "earrings", "bracelet", "jewelry", "jewellery", "pendant"],
  Cosmetics: ["foundation", "lipstick", "mascara", "eyeshadow", "makeup", "cosmetics", "blush", "concealer", "lip gloss"],
};

const CURRENCY_COUNTRY_HINTS = [
  [/\bGBP\b|£/, "United Kingdom"],
  [/\bAUD\b/, "Australia"],
  [/\bCAD\b/, "Canada"],
  [/\bUSD\b/, "United States"],
];
const CCTLD_COUNTRY = { ".co.uk": "United Kingdom", ".com.au": "Australia", ".ca": "Canada" };

const PRICE_REGEX = /\$\s?(\d{1,4}(?:[.,]\d{2})?)/;

// ---- fetch primitives -------------------------------------------------

async function fetchRaw(url) {
  for (let attempt = 0; attempt < 2; attempt++) {
    const res = await fetchWithTimeout(url, { timeoutMs: 8000 });
    if (res === null) {
      if (attempt === 1) return null;
      continue;
    }
    if (res.status === 200) return res;
    return null;
  }
  return null;
}

async function fetchPageText(url) {
  const res = await fetchRaw(url);
  if (!res) return null;
  try {
    return await res.text();
  } catch {
    return null;
  }
}

async function fetchPageJson(url) {
  const res = await fetchRaw(url);
  if (!res) return null;
  try {
    return await res.json();
  } catch {
    return null;
  }
}

function safeUrl(path, base) {
  try {
    return new URL(path, base).toString();
  } catch {
    return null;
  }
}

async function getSoup(url) {
  const html = await fetchPageText(url);
  if (html === null) return { html: null, $: null };
  try {
    return { html, $: cheerio.load(html) };
  } catch {
    return { html: null, $: null };
  }
}

function getCleanText($) {
  if (!$) return "";
  return $.root().text().replace(/\s+/g, " ").trim();
}

// ---- product urls / prices / catalog ----------------------------------

async function getProductUrls(baseUrl, limit = 5) {
  const data = await fetchPageJson(safeUrl("/products.json", baseUrl));
  if (data) {
    const handles = (data.products || []).map((p) => p.handle).filter(Boolean);
    if (handles.length) {
      return handles.slice(0, limit).map((h) => safeUrl(`/products/${h}`, baseUrl)).filter(Boolean);
    }
  }

  const { $ } = await getSoup(baseUrl);
  if (!$) return [];

  const productLinks = [];
  $("a[href]").each((_, el) => {
    if (productLinks.length >= limit) return false;
    const href = $(el).attr("href");
    if (href && /\/(products|product|shop)\//.test(href)) {
      const full = safeUrl(href, baseUrl);
      if (full && !productLinks.includes(full)) productLinks.push(full);
    }
  });
  return productLinks.slice(0, limit);
}

async function fetchProductPages(urls) {
  const pages = [];
  for (const url of urls) {
    const html = await fetchPageText(url);
    if (html === null) continue;
    let $;
    try {
      $ = cheerio.load(html);
    } catch {
      continue;
    }
    pages.push({ url, html, $ });
  }
  return pages;
}

function toFloat(raw) {
  const n = parseFloat(String(raw).replace(/,/g, ""));
  return Number.isNaN(n) ? null : n;
}

function extractPricesFromSoup($) {
  let candidates = [];
  $('[itemprop="price"]').each((_, el) => {
    const val = $(el).attr("content") || $(el).text();
    const m = (val || "").match(PRICE_REGEX);
    if (m) candidates.push(toFloat(m[1]));
  });
  if (!candidates.length) {
    $('.price, [class*="price"]').each((_, el) => {
      const m = ($(el).text() || "").match(PRICE_REGEX);
      if (m) candidates.push(toFloat(m[1]));
    });
  }
  if (!candidates.length) {
    const text = $.root().text();
    const re = new RegExp(PRICE_REGEX, "g");
    let m;
    while ((m = re.exec(text)) !== null) candidates.push(toFloat(m[1]));
  }
  return candidates.filter((c) => c !== null && c >= 1 && c <= 5000);
}

async function getProductPrices(baseUrl, productPages = null) {
  const data = await fetchPageJson(safeUrl("/products.json", baseUrl));
  if (data) {
    const prices = [];
    for (const product of (data.products || []).slice(0, 250)) {
      for (const variant of product.variants || []) {
        if (variant.price !== undefined && variant.price !== null) {
          const p = parseFloat(variant.price);
          if (!Number.isNaN(p)) prices.push(p);
        }
      }
    }
    if (prices.length) return { prices, source: "products_json" };
  }

  const pages = productPages !== null ? productPages : await fetchProductPages(await getProductUrls(baseUrl));

  const prices = [];
  for (const { $ } of pages) prices.push(...extractPricesFromSoup($));

  if (prices.length >= 3) return { prices, source: "scraped_pdp" };
  return { prices: [], source: "sin_datos" };
}

async function getCatalogSize(baseUrl) {
  const data = await fetchPageJson(safeUrl("/products.json", baseUrl));
  if (data) return (data.products || []).length;
  return 0;
}

// ---- reviews ------------------------------------------------------------

function getReviewsFromJsonLd($) {
  if (!$) return [null, null];
  let result = [null, null];
  $('script[type="application/ld+json"]').each((_, el) => {
    if (result[0] !== null) return false;
    let data;
    try {
      data = JSON.parse($(el).contents().text() || "{}");
    } catch {
      return;
    }
    const blocks = Array.isArray(data) ? data : [data];
    for (const block of blocks) {
      const rating = block && typeof block === "object" ? block.aggregateRating : null;
      if (rating) {
        const value = parseFloat(rating.ratingValue);
        const countRaw = rating.reviewCount ?? rating.ratingCount ?? 0;
        const count = parseInt(countRaw, 10);
        if (!Number.isNaN(value)) {
          result = [value, Number.isNaN(count) ? 0 : count];
          return false;
        }
      }
    }
  });
  return result;
}

function getReviewsFromTextPattern($) {
  if (!$) return [null, null];
  const text = $.root().text();
  const m = text.match(/(\d(?:\.\d)?)\s*(?:out of|\/)\s*5/);
  if (m) {
    const v = parseFloat(m[1]);
    if (!Number.isNaN(v)) return [v, null];
  }
  return [null, null];
}

async function getReviewsFromPageStructured(html, $, pageUrl) {
  const [rating, count] = getReviewsFromJsonLd($);
  if (rating !== null) return { rating, count, method: "json_ld", app: null };

  if (html) {
    const w = await reviewsWidgets.getReviewsFromWidgets(html, pageUrl);
    if (w.rating !== null) return { rating: w.rating, count: w.count, method: w.method, app: w.app };
    return { rating: null, count: null, method: "sin_datos", app: w.app };
  }

  return { rating: null, count: null, method: "sin_datos", app: null };
}

async function getReviewsFromProductPages(pages) {
  const perProduct = [];
  const appsDetected = [];

  for (const { url, html, $ } of pages) {
    const r = await getReviewsFromPageStructured(html, $, url);
    if (r.app && !appsDetected.includes(r.app)) appsDetected.push(r.app);
    if (r.rating !== null) perProduct.push({ rating: r.rating, count: r.count, method: r.method });
  }

  if (!perProduct.length) {
    return { rating: null, count: null, source: "sin_datos", app: appsDetected[0] || null };
  }

  let weightedSum = 0;
  let totalWeight = 0;
  let knownCountSum = 0;
  let anyKnownCount = false;
  const methodsUsed = new Set();
  for (const { rating, count, method } of perProduct) {
    const weight = count !== null && count > 0 ? count : 1;
    weightedSum += rating * weight;
    totalWeight += weight;
    methodsUsed.add(method);
    if (count !== null) {
      knownCountSum += count;
      anyKnownCount = true;
    }
  }

  const weightedRating = Math.round((weightedSum / totalWeight) * 100) / 100;
  const countOut = anyKnownCount ? knownCountSum : null;
  const source = `product_pages(n=${perProduct.length},metodos=${JSON.stringify([...methodsUsed].sort())})`;
  return { rating: weightedRating, count: countOut, source, app: appsDetected[0] || null };
}

async function getReviewsFull(html, $, pageUrl, productPages = null) {
  const structured = await getReviewsFromPageStructured(html, $, pageUrl);
  let appDetected = structured.app;
  if (structured.rating !== null) return { ...structured, app: appDetected };

  if (productPages && productPages.length) {
    const p = await getReviewsFromProductPages(productPages);
    appDetected = appDetected || p.app;
    if (p.rating !== null) return { rating: p.rating, count: p.count, method: p.source, app: appDetected };
  }

  const [tRating, tCount] = getReviewsFromTextPattern($);
  if (tRating !== null) return { rating: tRating, count: tCount, method: "text_pattern", app: appDetected };

  return { rating: null, count: null, method: "sin_datos", app: appDetected };
}

// ---- country / about-team / category / flags ---------------------------

function getCountrySignals($, domain) {
  for (const [suffix, country] of Object.entries(CCTLD_COUNTRY)) {
    if (domain.endsWith(suffix)) return country;
  }
  if (!$) return null;
  const text = $.root().text();
  for (const [pattern, country] of CURRENCY_COUNTRY_HINTS) {
    if (pattern.test(text)) return country;
  }
  return null;
}

async function getAboutTeamHtml(baseUrl) {
  for (const path of ABOUT_PATHS) {
    const html = await fetchPageText(safeUrl(path, baseUrl));
    if (html !== null) {
      try {
        return { html, $: cheerio.load(html) };
      } catch {
        continue;
      }
    }
  }
  return { html: null, $: null };
}

function findFounderContact(about$, home$) {
  const textSources = [];
  if (about$) textSources.push(getCleanText(about$));
  if (home$) textSources.push(getCleanText(home$));
  const combined = textSources.join(" \n ");

  let title = null;
  let isContractor = false;
  let m = combined.match(DECISION_MAKER_TITLES);
  if (m) title = m[0];
  else {
    m = combined.match(GROWTH_TITLES);
    if (m) title = m[0];
  }
  if (CONTRACTOR_WORDS.test(combined)) isContractor = true;

  let name = null;
  if (title && m) {
    const windowStart = Math.max(0, m.index - 60);
    const windowText = combined.slice(windowStart, m.index);
    const nameMatch = windowText.match(/([A-Z][a-z]+\s+[A-Z][a-z]+)\s*$/);
    if (nameMatch) name = nameMatch[1];
  }

  let linkedinUrl = null;
  for (const $ of [about$, home$]) {
    if (!$) continue;
    $("a[href]").each((_, el) => {
      const href = $(el).attr("href") || "";
      if (href.includes("linkedin.com/in/") || href.includes("linkedin.com/company/")) {
        linkedinUrl = href;
        return false;
      }
    });
    if (linkedinUrl) break;
  }

  return { name, title, linkedinUrl, isContractor };
}

function findEmail(about$, home$) {
  for (const $ of [about$, home$]) {
    if (!$) continue;
    let found = null;
    $("a[href]").each((_, el) => {
      const href = $(el).attr("href") || "";
      if (href.startsWith("mailto:")) {
        found = href.replace("mailto:", "").split("?")[0].trim();
        return false;
      }
    });
    if (found) return found;
  }
  return null;
}

function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Word-boundary matching, not plain substring counting. Plain substring
// counting made short keywords like "ring" match inside completely unrelated
// words (buying, during, wearing, string, covering, featuring), which
// misclassified apparel/lingerie sites as Jewelry any time their copy said
// something as ordinary as "designed for everyday wearing" or mentioned a
// "g-string". \b already treats a hyphen as a boundary, so "g-string" still
// doesn't spuriously match "ring" (the boundary falls at "g-" / "string",
// not inside "string" itself).
function countOccurrences(haystack, needle) {
  if (!needle) return 0;
  const re = new RegExp(`\\b${escapeRegex(needle)}\\b`, "g");
  const matches = haystack.match(re);
  return matches ? matches.length : 0;
}

function guessCategory($) {
  if (!$) return { category: null, confidence: "none" };
  const text = getCleanText($).toLowerCase();
  let navText = "";
  $("a").each((_, el) => {
    navText += $(el).text().toLowerCase() + " ";
  });
  const combined = text + " " + navText;

  const scores = {};
  for (const [category, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
    const hits = keywords.reduce((sum, kw) => sum + countOccurrences(combined, kw), 0);
    if (hits) scores[category] = hits;
  }

  const entries = Object.entries(scores);
  if (!entries.length) return { category: null, confidence: "none" };

  entries.sort((a, b) => b[1] - a[1]);
  const [topCat, topScore] = entries[0];
  if (entries.length > 1) {
    const secondScore = entries[1][1];
    if (secondScore >= topScore * 0.6) return { category: topCat, confidence: "weak" };
  }
  if (topScore >= 3) return { category: topCat, confidence: "strong" };
  return { category: topCat, confidence: "weak" };
}

function hasDropshippingLanguage($) {
  if (!$) return false;
  return DROPSHIP_WORDS.test($.root().text());
}

function hasNewsletterSignup($) {
  if (!$) return false;
  if ($('input[type="email"]').length > 0) return true;
  const text = getCleanText($).toLowerCase();
  return text.includes("subscribe") || text.includes("newsletter");
}

function getSiteNameHint($) {
  if (!$) return null;
  const og = $('meta[property="og:site_name"]').attr("content");
  if (og) return og.trim();

  const titleText = $("title").first().text();
  if (titleText) {
    const title = titleText.trim();
    for (const sep of [" | ", " - ", " – "]) {
      if (title.includes(sep)) {
        const parts = title.split(sep).map((p) => p.trim()).filter(Boolean);
        const generic = new Set(["shop", "home", "official store", "store"]);
        const candidates = parts.filter((p) => !generic.has(p.toLowerCase()));
        if (candidates.length) {
          return candidates.reduce((a, b) => (b.length < a.length ? b : a));
        }
      }
    }
    return title;
  }

  const footerText = $("footer").first().text();
  if (footerText) {
    const m = footerText.match(/©\s*\d{4}\s+([A-Za-z0-9&'.\- ]+)/);
    if (m) return m[1].trim();
  }
  return null;
}

module.exports = {
  getSoup,
  getProductUrls,
  fetchProductPages,
  getProductPrices,
  getCatalogSize,
  getReviewsFromJsonLd,
  getReviewsFromTextPattern,
  getReviewsFromPageStructured,
  getReviewsFromProductPages,
  getReviewsFull,
  getCountrySignals,
  getAboutTeamHtml,
  findFounderContact,
  findEmail,
  guessCategory,
  hasDropshippingLanguage,
  hasNewsletterSignup,
  getSiteNameHint,
};
