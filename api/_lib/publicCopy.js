// Translates the internal ScoreBreakdown (8 dims, Spanish debug reasons) into
// visitor-facing English copy: 2-3 strengths and 1-2 opportunities. The raw
// internal `reason` strings from scoring.js are debug-format and in Spanish -
// they go to Airtable for MTWAY's internal use, never to the visitor. No em
// dashes anywhere, per the site's copy rules.

// Dimensions ordered by how meaningful they are to show a visitor first.
// decisionMaker is intentionally last/deprioritized - it mostly reflects
// whether we could identify a contact on their site, not their brand's
// readiness, so it's a weak candidate for visitor-facing copy either way.
const DIMENSION_ORDER = [
  "aovPosition",
  "productMarketFit",
  "currentMarketing",
  "revenue",
  "categoryMatch",
  "businessHealth",
  "businessModel",
  "decisionMaker",
];

function copyFor(dim, points, signals) {
  switch (dim) {
    case "revenue":
      if (points === 3) return { strength: "Your catalog size and review volume point to real scale already." };
      if (points === 1) return { opportunity: "We didn't find strong public signals of scale yet, things like catalog size, review volume, or active ad spend." };
      return {};

    case "businessModel":
      if (points === 1) return { opportunity: "We noticed language on your site associated with dropshipping or print on demand fulfillment." };
      return {};

    case "aovPosition":
      if (points === 3) return { strength: "Your average order value sits right in the premium range we look for." };
      if (points === 1) {
        if (signals.priceSource === "sin_datos") {
          return { opportunity: "We couldn't measure your average order value from public data. Worth confirming directly." };
        }
        return { opportunity: "Your average order value looks outside the premium range we typically see perform best." };
      }
      return {};

    case "currentMarketing":
      if (points === 3) return { strength: "You're running active ads in multiple markets, a strong demand generation signal." };
      if (points === 1) {
        if (!signals.metaTokenPresent) return {};
        return { opportunity: "We didn't detect active ads running in the markets we checked." };
      }
      return {};

    case "productMarketFit":
      if (points === 3) return { strength: "Your reviews show strong product market fit, both rating and volume." };
      if (points === 1) {
        if (signals.reviewRating === null || signals.reviewRating === undefined) {
          return { opportunity: "We couldn't find public review data on your site. A visible review count builds trust fast." };
        }
        return { opportunity: "Your review rating is below the range we typically see for premium brands." };
      }
      return {};

    case "decisionMaker":
      if (points === 3) return { strength: "Your site clearly points to a founder or owner, easy to reach the right person." };
      return {};

    case "categoryMatch":
      if (points === 3) return { strength: `Your product category matches ${signals.categoryGuess || "one of our core categories"} cleanly.` };
      if (points === 1) return { opportunity: "We couldn't confidently match your catalog to one of our core categories, apparel, skincare, jewelry, or cosmetics." };
      return {};

    case "businessHealth":
      if (points === 3) return { strength: "No major red flags across the signals we check for brand health." };
      return {};

    default:
      return {};
  }
}

function buildPublicCopy(breakdown, signals) {
  const strengths = [];
  const opportunities = [];

  for (const dim of DIMENSION_ORDER) {
    const [points] = breakdown[dim];
    const { strength, opportunity } = copyFor(dim, points, signals);
    if (strength && strengths.length < 3) strengths.push(strength);
    if (opportunity && opportunities.length < 2) opportunities.push(opportunity);
  }

  if (!strengths.length) {
    strengths.push("Your site is live and public, which is the baseline we need to run any diagnostic at all.");
  }
  if (!opportunities.length) {
    opportunities.push("Nothing major stood out. A quick call can confirm the details behind these numbers.");
  }

  return { strengths, opportunities };
}

module.exports = { buildPublicCopy };
