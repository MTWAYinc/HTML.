// Port of scoutclub/reviews_widgets.py. Detects Shopify review-app signatures
// (Judge.me/Loox/Yotpo/Okendo/Stamped) and best-effort queries the same
// undocumented endpoints their own storefront widgets call. Every parse is
// defensive: an unexpected shape degrades to "couldn't read it," never throws
// and never invents a number.
const { fetchJson } = require("./fetchTimeout");

const SIGNATURES = {
  judgeme: [/judge\.me/i, /jdgm-widget/i, /jdgm-/i],
  loox: [/loox\.io/i, /loox-reviews/i, /class="loox/i],
  yotpo: [/yotpo/i],
  okendo: [/okendo/i],
  stamped: [/stamped\.io/i, /stamped-widget/i],
};

const STATIC_ATTR_PATTERNS = {
  judgeme: [/data-average-rating="([\d.]+)"/, /data-number-of-reviews="(\d+)"/],
  loox: [/data-rating="([\d.]+)"/, /data-raters="(\d+)"/],
  stamped: [/data-rating="([\d.]+)"/, /data-reviews-count="(\d+)"/],
};

const YOTPO_APP_KEY_PATTERNS = [
  /cdn-widgetsrepository\.yotpo\.com\/v1\/loader\/([A-Za-z0-9]+)/,
  /staticw2\.yotpo\.com\/([A-Za-z0-9]+)\/widget\.js/,
  /yotpoApiKey\s*=\s*"([A-Za-z0-9]+)"/,
  /"yotpoStoreId"\s*:\s*"([A-Za-z0-9]+)"/,
  /data-yotpo-app-key="([A-Za-z0-9]+)"/,
];
const YOTPO_PRODUCT_ID_RE = /data-yotpo-product-id="(\d+)"/;

const SHOPIFY_DOMAIN_PATTERNS = [
  /"myshopify_domain"\s*:\s*"([a-zA-Z0-9-]+\.myshopify\.com)"/,
  /Shopify\.shop\s*=\s*"([a-zA-Z0-9-]+\.myshopify\.com)"/,
];

function detectReviewApp(html) {
  for (const [app, patterns] of Object.entries(SIGNATURES)) {
    if (patterns.some((p) => p.test(html))) return app;
  }
  return null;
}

function extractStaticAttrs(app, html) {
  const patterns = STATIC_ATTR_PATTERNS[app];
  if (!patterns) return [null, null];
  const [ratingPat, countPat] = patterns;
  const ratingMatch = html.match(ratingPat);
  if (!ratingMatch) return [null, null];
  const countMatch = html.match(countPat);
  const rating = parseFloat(ratingMatch[1]);
  const count = countMatch ? parseInt(countMatch[1], 10) : null;
  if (Number.isNaN(rating)) return [null, null];
  return [rating, count];
}

function extractMyshopifyDomain(html) {
  for (const pattern of SHOPIFY_DOMAIN_PATTERNS) {
    const m = html.match(pattern);
    if (m) return m[1];
  }
  return null;
}

function extractYotpoAppKey(html) {
  for (const pattern of YOTPO_APP_KEY_PATTERNS) {
    const m = html.match(pattern);
    if (m) return m[1];
  }
  return null;
}

async function fetchYotpoBottomline(html) {
  // Deliberately requires an explicit data-yotpo-product-id in the HTML — some
  // custom integrations expose the app key but not this attribute. We do NOT
  // substitute Shopify's numeric product id from /products.json even though it
  // usually matches Yotpo's internal id, because it isn't guaranteed and pulling
  // the wrong product's rating unknowingly is worse than having no data.
  const appKey = extractYotpoAppKey(html);
  const productIdMatch = html.match(YOTPO_PRODUCT_ID_RE);
  if (!appKey || !productIdMatch) return [null, null];
  const productId = productIdMatch[1];
  const url = `https://api.yotpo.com/v1/widget/${appKey}/products/${productId}/bottomline.json`;
  const data = await fetchJson(url, { timeoutMs: 5000 });
  if (!data) return [null, null];
  const bottomline = (data.response || {}).bottomline || {};
  const rating = bottomline.average_score;
  const count = bottomline.total_reviews;
  if (rating === undefined || rating === null) return [null, null];
  return [parseFloat(rating), count !== undefined && count !== null ? parseInt(count, 10) : null];
}

async function fetchJudgemeSummary(html, pageUrl) {
  const shopDomain = extractMyshopifyDomain(html);
  if (!shopDomain) return [null, null];
  const params = new URLSearchParams({ shop_domain: shopDomain, url: pageUrl, platform: "shopify" });
  const url = `https://judge.me/api/v1/widgets/preview_badge?${params.toString()}`;
  const data = await fetchJson(url, { timeoutMs: 5000 });
  if (!data) return [null, null];
  const rating = data.average_rating ?? data.rating;
  const count = data.review_count ?? data.reviews_count;
  if (rating === undefined || rating === null) return [null, null];
  return [parseFloat(rating), count !== undefined && count !== null ? parseInt(count, 10) : null];
}

// Returns { rating, count, method, app }. method in "widget_static:<app>" |
// "widget_api:<app>" | "sin_datos". app can be set even when method is
// "sin_datos" (app detected but couldn't read the number), or null if no
// known app was recognized.
async function getReviewsFromWidgets(html, pageUrl) {
  const app = detectReviewApp(html);
  if (app === null) return { rating: null, count: null, method: "sin_datos", app: null };

  let [rating, count] = extractStaticAttrs(app, html);
  if (rating !== null) return { rating, count, method: `widget_static:${app}`, app };

  if (app === "yotpo") {
    [rating, count] = await fetchYotpoBottomline(html);
    if (rating !== null) return { rating, count, method: "widget_api:yotpo", app };
  } else if (app === "judgeme") {
    [rating, count] = await fetchJudgemeSummary(html, pageUrl);
    if (rating !== null) return { rating, count, method: "widget_api:judgeme", app };
  }

  return { rating: null, count: null, method: "sin_datos", app };
}

module.exports = { detectReviewApp, getReviewsFromWidgets };
