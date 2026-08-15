const { createRecord } = require("./_lib/airtable");

const BASE_ID = "app1fk9xNGcMnVZnl";
const TABLE_ID = "tblJ1V5FCtLcgEihr"; // "ShowUp Intake"

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

  const bookingUid = (body.bookingUid || "").trim();
  const name = (body.name || "").trim();
  const email = (body.email || "").trim();
  const focoActual = (body.focoActual || "").trim();
  const motivoAgendo = (body.motivoAgendo || "").trim();
  const queEsperan = (body.queEsperan || "").trim();
  const fileUrls = Array.isArray(body.fileUrls) ? body.fileUrls : [];

  if (!bookingUid) {
    res.status(400).json({ ok: false, error: "missing_booking_uid" });
    return;
  }

  const fields = {
    "Booking UID": bookingUid,
    "Submitted At": new Date().toISOString(),
  };
  if (name) fields["Lead Name"] = name;
  if (email) fields["Lead Email"] = email;
  if (focoActual) fields["Foco Actual"] = focoActual;
  if (motivoAgendo) fields["Motivo Agendo"] = motivoAgendo;
  if (queEsperan) fields["Que Esperan"] = queEsperan;
  if (fileUrls.length) fields["Archivos"] = fileUrls.map((url) => ({ url }));

  const result = await createRecord(BASE_ID, TABLE_ID, fields);
  res.status(result.ok ? 200 : 500).json(result);
};
