const { createRecord } = require("./_lib/airtable");

const BASE_ID = "app1fk9xNGcMnVZnl";
const TABLE_ID = "tblmxNYPcMKjK8bST"; // "Access Protocol Leads"

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ ok: false, error: "method_not_allowed" });
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
  body = body || {};

  const domain = (body.domain || "").trim();
  const email = (body.email || "").trim();
  const band = body.band || "";
  const total = Number(body.total) || 0;
  const breakdown = body.breakdown || {};

  if (!domain) {
    res.status(400).json({ ok: false, error: "missing_domain" });
    return;
  }

  const fields = {
    Domain: /^https?:\/\//i.test(domain) ? domain : `https://${domain}`,
    "Score Total": total,
    Band: band,
    "Breakdown JSON": JSON.stringify(breakdown, null, 2),
    "Submitted At": new Date().toISOString(),
  };
  if (email) fields.Email = email;

  const result = await createRecord(BASE_ID, TABLE_ID, fields);
  res.status(result.ok ? 200 : 500).json(result);
};
