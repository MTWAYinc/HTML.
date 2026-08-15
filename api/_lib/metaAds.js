// Port of scoutclub/meta_ads.py. Country checks are parallelized with
// Promise.all (single attempt each) instead of the Python version's sequential
// per-country loop with exponential-backoff retries — a serverless function on
// an 8s internal budget can't afford 3 retries x 4 countries x N variants
// sequentially. Degrades to all-null exactly like the Python path when no
// token is present (score_current_marketing already handles that gracefully).
const { fetchJson } = require("./fetchTimeout");

const AD_LIBRARY_URL = "https://graph.facebook.com/v20.0/ads_archive";
const COUNTRIES = ["US", "CA", "GB", "AU"]; // Ad Library uses GB, not UK

const SUFFIX_WORDS = [
  "co.", "co", "inc.", "inc", "llc", "ltd.", "ltd",
  "skincare", "cosmetics", "jewelry", "jewellery", "beauty", "studio", "shop",
];
const SUFFIX_REGEX = new RegExp(`\\s+(${SUFFIX_WORDS.map((w) => w.replace(".", "\\.")).join("|")})\\.?$`, "i");

function deriveBrandNameVariants(baseName, domain) {
  const variants = [];
  const add = (candidate) => {
    if (candidate) {
      candidate = candidate.trim();
      if (candidate && !variants.includes(candidate)) variants.push(candidate);
    }
  };

  const name =
    baseName ||
    domain
      .split(".")[0]
      .replace(/-/g, " ")
      .replace(/\w\S*/g, (t) => t.charAt(0).toUpperCase() + t.slice(1).toLowerCase());
  add(name);

  let stripped = name;
  let changed = true;
  while (changed) {
    const newStripped = stripped.replace(SUFFIX_REGEX, "").trim();
    changed = newStripped !== stripped;
    stripped = newStripped;
  }
  add(stripped);

  const words = stripped.split(/\s+/).filter(Boolean);
  if (words.length >= 3) add(words[0]);

  return variants;
}

async function checkActiveAdsForVariant(variant, token) {
  const results = {};
  await Promise.all(
    COUNTRIES.map(async (country) => {
      const params = new URLSearchParams({
        search_terms: variant,
        ad_reached_countries: `["${country}"]`,
        ad_active_status: "ACTIVE",
        access_token: token,
        limit: "25",
      });
      const data = await fetchJson(`${AD_LIBRARY_URL}?${params.toString()}`, { timeoutMs: 6000 });
      results[country] = data === null ? null : Boolean(data.data && data.data.length);
    })
  );
  return results;
}

// Returns { results, variantUsed, tried }. If no token, no calls are made and
// every country degrades to "unknown" (null).
async function checkActiveAds(variants, token) {
  const tried = [];
  if (!token) {
    const noToken = {};
    for (const c of COUNTRIES) noToken[c] = null;
    return { results: noToken, variantUsed: null, tried };
  }

  let lastResults = {};
  for (const c of COUNTRIES) lastResults[c] = null;

  for (const variant of variants) {
    tried.push(variant);
    const results = await checkActiveAdsForVariant(variant, token);
    lastResults = results;
    if (Object.values(results).some((v) => v === true)) {
      return { results, variantUsed: variant, tried };
    }
  }

  return { results: lastResults, variantUsed: null, tried };
}

module.exports = { deriveBrandNameVariants, checkActiveAds, COUNTRIES };
