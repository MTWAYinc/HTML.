const { assertSafePublicUrl } = require("./_lib/ssrfGuard");
const { gatherSignals } = require("./_lib/gatherSignals");
const { defaultSignals } = require("./_lib/models");
const scoring = require("./_lib/scoring");
const { buildPublicCopy } = require("./_lib/publicCopy");

// Internal wall-clock budget, kept under vercel.json's maxDuration (20s) so
// there's headroom to still respond after hitting this cutoff. Real sites
// with several About/Team page candidates to try (getAboutTeamHtml) can
// comfortably take 9-10s; 8s was cutting that off before it even reached
// category guessing, silently discarding a perfectly good result.
const GATHER_BUDGET_MS = 18000;

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "method_not_allowed" });
    return;
  }

  let body = req.body;
  if (typeof body === "string") {
    try {
      body = JSON.parse(body);
    } catch {
      body = {};
    }
  }
  const rawUrl = ((body && body.url) || "").trim();
  if (!rawUrl) {
    res.status(400).json({ error: "invalid_url" });
    return;
  }

  let normalized = rawUrl;
  if (!/^https?:\/\//i.test(normalized)) normalized = "https://" + normalized;

  const safeUrl = await assertSafePublicUrl(normalized);
  if (!safeUrl) {
    res.status(400).json({ error: "invalid_url" });
    return;
  }

  const parsed = new URL(safeUrl);
  const domain = parsed.hostname.replace(/^www\./, "");
  const baseUrl = `${parsed.protocol}//${parsed.hostname}`;
  const token = process.env.META_AD_LIBRARY_TOKEN || null;

  // Created here (not inside gatherSignals) so it survives the race below:
  // gatherSignals mutates this same object as it goes, so even if the race
  // times out before it returns, whatever was already written (catalog size,
  // category guess, reviews, etc.) is still on `signals` — degrading no
  // longer means throwing away real, already-computed results.
  const signals = defaultSignals(domain);
  let degraded = false;
  try {
    const completed = await Promise.race([
      gatherSignals(baseUrl, domain, token, signals).then(() => true),
      new Promise((resolve) => setTimeout(() => resolve(false), GATHER_BUDGET_MS)),
    ]);
    if (!completed) {
      degraded = true;
      signals.scrapeNotes.push("se alcanzo el presupuesto de tiempo antes de terminar de recolectar todas las senales (se uso lo que si se pudo recolectar)");
    }
  } catch {
    degraded = true;
    signals.scrapeNotes.push("error durante la recoleccion de senales (se uso lo que si se pudo recolectar)");
  }

  const breakdown = scoring.scoreAll(signals);
  const total = scoring.breakdownTotal(breakdown);
  const band = scoring.breakdownBand(total);
  const { strengths, opportunities } = buildPublicCopy(breakdown, signals);

  res.status(200).json({
    domain,
    band,
    total,
    breakdown,
    strengths,
    opportunities,
    degraded,
    scrapeNotes: signals.scrapeNotes,
  });
};
