// Shared server-side Airtable write helper. Token stays in an env var here,
// never in client-side JS (fixes the pattern Form.html used to have).
async function createRecord(baseId, tableId, fields) {
  const token = process.env.AIRTABLE_TOKEN;
  if (!token) {
    return { ok: false, error: "AIRTABLE_TOKEN not configured" };
  }
  try {
    const res = await fetch(`https://api.airtable.com/v0/${baseId}/${tableId}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ typecast: true, fields }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      return { ok: false, error: `Airtable responded ${res.status}: ${body}` };
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
}

module.exports = { createRecord };
