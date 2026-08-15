// Port of scoutclub/models.py's Signals defaults + ScoreBreakdown.total/.band.

function defaultSignals(domain) {
  return {
    domain,
    brandName: null,
    brandNameVariants: [],

    productPrices: [],
    priceSource: "sin_datos", // "products_json" | "scraped_pdp" | "sin_datos"
    catalogSize: 0,

    metaAdsByCountry: {},
    metaAdsVariantUsed: null,
    metaAdsVariantsTried: [],
    metaTokenPresent: false,

    reviewRating: null,
    reviewCount: null,
    reviewSource: "sin_datos",
    reviewAppDetected: null,
    newsletterSource: "static",

    dropshippingLanguageFound: false,
    hasNewsletterSignup: false,

    contactName: null,
    contactTitle: null,
    contactLinkedinUrl: null,
    contactEmail: null,
    decisionMakerIsContractor: false,

    categoryGuess: null,
    categoryConfidence: "none",
    country: null,

    companyName: null,

    scrapeNotes: [],
  };
}

function breakdownTotal(breakdown) {
  return (
    breakdown.revenue[0] +
    breakdown.businessModel[0] +
    breakdown.aovPosition[0] +
    breakdown.currentMarketing[0] +
    breakdown.productMarketFit[0] +
    breakdown.decisionMaker[0] +
    breakdown.categoryMatch[0] +
    breakdown.businessHealth[0]
  );
}

function breakdownBand(total) {
  if (total >= 20) return "qualified";
  if (total >= 18) return "manual_review";
  return "reject";
}

function breakdownAsDict(breakdown) {
  const total = breakdownTotal(breakdown);
  return {
    revenue: breakdown.revenue,
    businessModel: breakdown.businessModel,
    aovPosition: breakdown.aovPosition,
    currentMarketing: breakdown.currentMarketing,
    productMarketFit: breakdown.productMarketFit,
    decisionMaker: breakdown.decisionMaker,
    categoryMatch: breakdown.categoryMatch,
    businessHealth: breakdown.businessHealth,
    total,
    band: breakdownBand(total),
  };
}

module.exports = { defaultSignals, breakdownTotal, breakdownBand, breakdownAsDict };
