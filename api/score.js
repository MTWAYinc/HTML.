const { assertSafePublicUrl } = require("./_lib/ssrfGuard");
const { gatherSignals } = require("./_lib/gatherSignals");
const { defaultSignals } = require("./_lib/models");
const scoring = require("./_lib/scoring");
const { buildPublicCopy } = require("./_lib/publicCopy");

// Internal wall-clock budget, kept well under vercel.json's maxDuration (20s)
// so there's headroom to still respond after hitting this cutoff.
const GATHER_BUDGET_MS = 8000;

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

  let signals = null;
  let degraded = false;
  try {
    signals = await Promise.race([
      gatherSignals(baseUrl, domain, token),
      new Promise((resolve) => setTimeout(() => resolve(null), GATHER_BUDGET_MS)),
    ]);
  } catch {
    signals = null;
  }

  if (signals === null) {
    degraded = true;
    signals = defaultSignals(domain);
    signals.scrapeNotes.push("se alcanzo el presupuesto de tiempo antes de terminar de recolectar senales");
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
