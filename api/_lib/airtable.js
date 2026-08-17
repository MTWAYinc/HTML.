// Shared server-side Airtable read/write helper. Token stays in an env var
// here, never in client-side JS (fixes the pattern Form.html used to have).

// Reads all records from a table, following Airtable's offset-based
// pagination. `params` accepts Airtable list params (filterByFormula,
// sort, fields, etc.) minus pageSize/offset, which this function manages.
async function listRecords(baseId, tableId, params = {}) {
  const token = process.env.AIRTABLE_TOKEN;
  if (!token) {
    return { ok: false, error: "AIRTABLE_TOKEN not configured" };
  }
  const records = [];
  let offset;
  try {
    do {
      const url = new URL(`https://api.airtable.com/v0/${baseId}/${tableId}`);
      Object.entries(params).forEach(([key, value]) => {
        if (Array.isArray(value)) {
          value.forEach((v, i) => url.searchParams.append(`${key}[${i}]`, v));
        } else if (value !== undefined) {
          url.searchParams.set(key, value);
        }
      });
      if (offset) url.searchParams.set("offset", offset);

      const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) {
        const body = await res.text().catch(() => "");
        return { ok: false, error: `Airtable responded ${res.status}: ${body}` };
      }
      const body = await res.json();
      records.push(...(body.records || []));
      offset = body.offset;
    } while (offset);
    return { ok: true, records };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
}

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

module.exports = { createRecord, listRecords };
