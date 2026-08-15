// Port of scoutclub.py's gather_signals(): orchestrates the scraping helpers
// into a filled-out Signals object, in the same order as the Python source.
const scraping = require("./scraping");
const metaAds = require("./metaAds");
const { defaultSignals } = require("./models");

// Accepts an optional externally-created signals object (`s`) that the
// caller keeps a reference to. This lets a caller enforce an overall time
// budget via Promise.race without losing everything gathered so far: since
// `s` is mutated in place as each step completes, whatever's already been
// written is still there even if the race times out before this function
// returns. See api/score.js for how the budget/race actually uses this.
async function gatherSignals(baseUrl, domain, token, s) {
  s = s || defaultSignals(domain);

  const { html: homeHtml, $: home$ } = await scraping.getSoup(baseUrl);
  if (!home$) s.scrapeNotes.push("no se pudo obtener la home del sitio");

  const brandHint = scraping.getSiteNameHint(home$);
  s.brandName = brandHint;
  s.brandNameVariants = metaAds.deriveBrandNameVariants(brandHint, domain);
  s.companyName = brandHint || domain;

  s.metaTokenPresent = Boolean(token);
  const { results, variantUsed, tried } = await metaAds.checkActiveAds(s.brandNameVariants, token);
  s.metaAdsByCountry = results;
  s.metaAdsVariantUsed = variantUsed;
  s.metaAdsVariantsTried = tried;

  // Product pages fetched once, shared between AOV and reviews.
  const productUrls = await scraping.getProductUrls(baseUrl, 5);
  const productPages = await scraping.fetchProductPages(productUrls);

  const { prices, source: priceSource } = await scraping.getProductPrices(baseUrl, productPages);
  s.productPrices = prices;
  s.priceSource = priceSource;
  s.catalogSize = await scraping.getCatalogSize(baseUrl);

  const reviews = await scraping.getReviewsFull(homeHtml, home$, baseUrl, productPages);
  s.reviewRating = reviews.rating;
  s.reviewCount = reviews.count;
  s.reviewSource = reviews.method;
  s.reviewAppDetected = reviews.app;

  s.country = scraping.getCountrySignals(home$, domain);

  s.dropshippingLanguageFound = scraping.hasDropshippingLanguage(home$);
  s.hasNewsletterSignup = scraping.hasNewsletterSignup(home$);
  s.newsletterSource = s.hasNewsletterSignup ? "static" : "sin_datos";

  // v1 intentionally has no Playwright fallback (locked architecture decision -
  // see RISKS.md / plan). Note it the same way the Python path notes an
  // unavailable/failed Playwright render, for parity in the audit trail.
  if (reviews.method === "sin_datos" || !s.hasNewsletterSignup) {
    s.scrapeNotes.push("fallback de Playwright no disponible en v1 (decision de arquitectura, no un fallo)");
  }

  const { category, confidence } = scraping.guessCategory(home$);
  s.categoryGuess = category;
  s.categoryConfidence = confidence;

  const { $: about$ } = await scraping.getAboutTeamHtml(baseUrl);
  const { name, title, linkedinUrl, isContractor } = scraping.findFounderContact(about$, home$);
  s.contactName = name;
  s.contactTitle = title;
  s.contactLinkedinUrl = linkedinUrl;
  s.decisionMakerIsContractor = isContractor;
  s.contactEmail = scraping.findEmail(about$, home$);

  return s;
}

module.exports = { gatherSignals };
