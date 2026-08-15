// Near-mechanical port of scoutclub/scoring.py's 8 score_* functions + score_all.
// Pure functions, no I/O — reason strings stay in Spanish/debug format on purpose,
// matching the source; they're for internal (Airtable) use only, never shown to
// the visitor. See publicCopy.js for the visitor-facing translation.
const { breakdownTotal, breakdownBand, breakdownAsDict } = require("./models");

function scoreRevenue(s) {
  let points = 0;
  if (s.catalogSize >= 15) points += 1;
  if ((s.reviewCount || 0) >= 100) points += 1;
  const adsActive = Object.values(s.metaAdsByCountry).some((v) => v === true);
  if (adsActive) points += 1;

  let score;
  if (points >= 3) score = 3;
  else if (points === 2) score = 2;
  else score = 1;
  const reason = `proxy=${points}/3 (catalogo=${s.catalogSize} skus, reviews=${s.reviewCount}, ads_activos=${adsActive})`;
  return [score, reason];
}

function scoreBusinessModel(s) {
  if (s.dropshippingLanguageFound) {
    return [1, "lenguaje de dropshipping/print-on-demand detectado en el sitio"];
  }
  return [2, "sin evidencia fuerte en ningun sentido (default conservador)"];
}

function scoreAovPosition(s) {
  if (s.priceSource === "sin_datos" || !s.productPrices.length) {
    return [1, "Sin datos de precio (no se pudo medir AOV, no confundir con AOV bajo)"];
  }

  const prices = [...s.productPrices].sort((a, b) => a - b);
  const n = prices.length;
  const median = n % 2 === 1 ? prices[Math.floor(n / 2)] : (prices[n / 2 - 1] + prices[n / 2]) / 2;

  let score;
  if (median >= 150 && median <= 300) score = 3;
  else if ((median >= 100 && median < 150) || (median > 300 && median <= 400)) score = 2;
  else score = 1;
  return [score, `mediana=$${median.toFixed(0)} (fuente=${s.priceSource}, n=${n})`];
}

function scoreCurrentMarketing(s) {
  const variantNote = `variante_usada=${JSON.stringify(s.metaAdsVariantUsed)}, variantes_probadas=${JSON.stringify(
    s.metaAdsVariantsTried
  )}`;
  if (!s.metaTokenPresent) {
    return [1, `sin token de Meta Ad Library configurado; senal desconocida. ${variantNote}`];
  }

  const countriesWithAds = Object.entries(s.metaAdsByCountry)
    .filter(([, v]) => v === true)
    .map(([c]) => c);
  const n = countriesWithAds.length;
  let score;
  if (n >= 2) score = 3;
  else if (n === 1) score = 2;
  else score = 1;
  return [score, `ads activos en ${n} pais(es) (${JSON.stringify(countriesWithAds)}). ${variantNote}`];
}

function scoreProductMarketFit(s) {
  const rating = s.reviewRating;
  const count = s.reviewCount || 0;

  if (rating === null || rating === undefined) {
    if (s.reviewAppDetected) {
      return [
        1,
        `Sin datos de reviews (se detecto ${s.reviewAppDetected} pero no se pudieron leer los numeros, no confundir con reviews bajas)`,
      ];
    }
    return [1, "Sin datos de reviews (ninguna app de reviews conocida detectada en el sitio)"];
  }

  const fuente = `fuente=${s.reviewSource}`;
  if (rating >= 4.5 && count >= 50) {
    return [3, `reviews confirmadas: rating=${rating} con ${count} reviews (${fuente})`];
  }
  if (rating >= 4.0) {
    return [2, `reviews confirmadas: rating=${rating} con ${count} reviews (${fuente})`];
  }
  if (rating >= 4.5 && count < 50) {
    return [2, `reviews confirmadas: rating=${rating} pero solo ${count} reviews - evidencia delgada (${fuente})`];
  }
  return [1, `reviews confirmadas y bajas: rating=${rating} por debajo de 4.0 (${fuente})`];
}

function scoreDecisionMaker(s) {
  if (s.decisionMakerIsContractor) {
    return [1, `titulo/contexto sugiere agencia/contractor (${s.contactTitle})`];
  }
  if (s.contactTitle === null || s.contactTitle === undefined) {
    return [1, "no se identifico decision maker"];
  }
  const title = s.contactTitle.toLowerCase();
  if (["founder", "co-founder", "ceo", "owner"].some((k) => title.includes(k))) {
    return [3, `decision maker encontrado: ${s.contactName} (${s.contactTitle})`];
  }
  return [2, `decision maker adyacente encontrado: ${s.contactName} (${s.contactTitle})`];
}

function scoreCategoryMatch(s) {
  if (s.categoryGuess === null || s.categoryGuess === undefined) {
    return [1, "sin match a Clothing/Skincare/Jewelry/Cosmetics"];
  }
  if (s.categoryConfidence === "strong") {
    return [3, `match limpio a ${s.categoryGuess}`];
  }
  return [2, `match debil/mixto a ${s.categoryGuess}`];
}

function scoreBusinessHealth(s) {
  const flags = [];
  if (s.dropshippingLanguageFound) flags.push("dropshipping detectado");
  if (s.reviewRating !== null && s.reviewRating !== undefined && s.reviewRating < 4.0) flags.push("reviews < 4.0");
  if (!Object.values(s.metaAdsByCountry).some((v) => v === true)) flags.push("sin evidencia de ads");
  if (!s.hasNewsletterSignup) flags.push("sin captura de email/newsletter");
  if (s.categoryGuess === null || s.categoryGuess === undefined) flags.push("category match fallido");

  const n = flags.length;
  let score;
  if (n === 0) score = 3;
  else if (n === 1) score = 2;
  else score = 1;
  return [score, `${n} red flag(s) detectada(s): ${JSON.stringify(flags)}`];
}

function scoreAll(s) {
  return {
    revenue: scoreRevenue(s),
    businessModel: scoreBusinessModel(s),
    aovPosition: scoreAovPosition(s),
    currentMarketing: scoreCurrentMarketing(s),
    productMarketFit: scoreProductMarketFit(s),
    decisionMaker: scoreDecisionMaker(s),
    categoryMatch: scoreCategoryMatch(s),
    businessHealth: scoreBusinessHealth(s),
  };
}

function classify(breakdown) {
  const total = breakdownTotal(breakdown);
  const band = breakdownBand(total);
  if (band === "qualified") return { estado: "Nuevo, no contactado", canal: "SendClub + AllianceClub", band };
  if (band === "manual_review") return { estado: "Revision manual", canal: "Pendiente de asignar", band };
  return { estado: "", canal: "", band };
}

module.exports = {
  scoreRevenue,
  scoreBusinessModel,
  scoreAovPosition,
  scoreCurrentMarketing,
  scoreProductMarketFit,
  scoreDecisionMaker,
  scoreCategoryMatch,
  scoreBusinessHealth,
  scoreAll,
  classify,
  breakdownTotal,
  breakdownBand,
  breakdownAsDict,
};
