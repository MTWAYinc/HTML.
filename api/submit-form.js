// Proxies Form.html's contact-form submission server-side, so the Airtable
// token never has to live in client-side JS (fixes the prior hardcoded-token
// pattern).
const { createRecord } = require("./_lib/airtable");

const BASE_ID = "app1fk9xNGcMnVZnl";
const TABLE_ID = "tblyI8a4BtV9ZQDIP"; // "Table 1"

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

  const fullName = (body.fullName || "").trim();
  const company = (body.company || "").trim();
  const email = (body.email || "").trim();
  const phone = (body.phone || "").trim();
  const website = (body.website || "").trim();
  const consent = Boolean(body.consent);
  const budget = (body.budget || "").trim();

  if (!fullName || !company || !email || !phone || !website || !consent) {
    res.status(400).json({ ok: false, error: "missing_required_field" });
    return;
  }

  const fields = {
    "Full Name": fullName,
    Company: company,
    Email: email,
    Phone: phone,
    Website: /^https?:\/\//i.test(website) ? website : `https://${website}`,
    Consent: true,
  };
  if (budget) fields["Presupuesto Mensual Publicidad"] = budget;

  const result = await createRecord(BASE_ID, TABLE_ID, fields);
  res.status(result.ok ? 200 : 500).json(result);
};
