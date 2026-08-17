// Pulls new records from the 3 Airtable tables MTWAY already writes to
// (Form.html contact form, Access Protocol / ReadyClub, ShowUp Intake) into
// Supabase `leads`, so DeskClub has one place to see everything instead of
// juggling Airtable + Supabase at render time. Polled by cron-job.org every
// ~6h (same secret-in-query-param pattern as api/cron-tick.js) -- no need
// for ShowUpClub's 2-minute cadence, these are inbound web forms, not
// time-sensitive reminders.
//
// Uses a watermark per table (public.deskclub_sync_state) filtered by
// Airtable's own CREATED_TIME() so a run only processes records created
// since the last successful sync -- without this, every run would re-insert
// a fresh lead_events row for the same ShowUp Intake submission forever.
const { listRecords } = require("./_lib/airtable");
const { upsertLead, insertLeadEvent } = require("./_lib/deskclub-supabase");
const { createClient } = require("@supabase/supabase-js");

const BASE_ID = "app1fk9xNGcMnVZnl";
const TABLES = {
  form: "tblyI8a4BtV9ZQDIP", // "Table 1" (Form.html)
  accessProtocol: "tblmxNYPcMKjK8bST", // "Access Protocol Leads"
  showupIntake: "tblJ1V5FCtLcgEihr", // "ShowUp Intake"
};

let supabase = null;
function getSupabase() {
  if (supabase) return supabase;
  supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });
  return supabase;
}

async function getWatermark(syncKey) {
  const { data } = await getSupabase()
    .from("deskclub_sync_state")
    .select("last_synced_at")
    .eq("sync_key", syncKey)
    .maybeSingle();
  return data ? data.last_synced_at : null;
}

async function setWatermark(syncKey, isoTimestamp, detail) {
  await getSupabase()
    .from("deskclub_sync_state")
    .upsert({ sync_key: syncKey, last_synced_at: isoTimestamp, detail: detail || {} }, { onConflict: "sync_key" });
}

function splitName(fullName) {
  const parts = (fullName || "").trim().split(" ");
  return { firstName: parts[0] || "", lastName: parts.slice(1).join(" ") };
}

function maxCreatedTime(records, fallback) {
  return records.reduce((max, r) => (r.createdTime > max ? r.createdTime : max), fallback || "1970-01-01T00:00:00.000Z");
}

async function syncTable(syncKey, tableId) {
  const watermark = await getWatermark(syncKey);
  const filterByFormula = watermark ? `IS_AFTER(CREATED_TIME(), '${watermark}')` : undefined;
  const result = await listRecords(BASE_ID, tableId, filterByFormula ? { filterByFormula } : {});
  if (!result.ok) return { ok: false, error: result.error, processed: 0 };
  return { ok: true, records: result.records, newWatermark: maxCreatedTime(result.records, watermark) };
}

async function processForm(records) {
  let created = 0;
  for (const rec of records) {
    const f = rec.fields || {};
    const email = (f.Email || "").trim();
    if (!email) continue;
    const { firstName, lastName } = splitName(f["Full Name"]);
    const result = await upsertLead(
      {
        email,
        companyName: f.Company,
        firstName,
        lastName,
        website: f.Website,
        rawPayload: { phone: f.Phone, consent: f.Consent, presupuesto: f["Presupuesto Mensual Publicidad"] },
      },
      "airtable_form"
    );
    if (result.ok) created += 1;
  }
  return created;
}

async function processAccessProtocol(records) {
  let created = 0;
  for (const rec of records) {
    const f = rec.fields || {};
    const email = (f.Email || "").trim();
    if (!email) continue; // anonymous scoring, no identifiable lead -- correctly skipped, not a bug
    const website = (f.Domain || "").replace(/^https?:\/\//i, "");
    const result = await upsertLead(
      {
        email,
        website,
        // Score Total is the same 8-dimension, 1-24 sum as ScoutClub's
        // score_icp (api/_lib/scoring.js is a verified byte-for-byte port
        // of scoutclub/scoring.py) -- scales are confirmed compatible.
        icpScore: typeof f["Score Total"] === "number" ? f["Score Total"] : undefined,
        rawPayload: { band: f.Band, breakdown: f["Breakdown JSON"] },
      },
      "airtable_access_protocol"
    );
    if (result.ok) created += 1;
  }
  return created;
}

async function processShowupIntake(records) {
  let noted = 0;
  let createdMinimal = 0;
  for (const rec of records) {
    const f = rec.fields || {};
    const email = (f["Lead Email"] || "").trim();
    if (!email) continue;
    const eventResult = await insertLeadEvent(
      email,
      "nota_manual",
      {
        booking_uid: f["Booking UID"],
        foco_actual: f["Foco Actual"],
        motivo_agendo: f["Motivo Agendo"],
        que_esperan: f["Que Esperan"],
      },
      "airtable_showup_intake"
    );
    if (eventResult.ok) {
      noted += 1;
      continue;
    }
    if (eventResult.error === "lead_not_found") {
      const { firstName, lastName } = splitName(f["Lead Name"]);
      const createResult = await upsertLead(
        { email, firstName, lastName },
        "airtable_showup_intake"
      );
      if (createResult.ok) createdMinimal += 1;
    }
  }
  return { noted, createdMinimal };
}

module.exports = async function handler(req, res) {
  const secret = req.query?.secret || new URL(req.url, "http://x").searchParams.get("secret");
  if (!process.env.DESKCLUB_SYNC_SECRET || secret !== process.env.DESKCLUB_SYNC_SECRET) {
    res.status(401).json({ ok: false, error: "invalid_secret" });
    return;
  }

  const summary = {};

  const form = await syncTable("airtable_form", TABLES.form);
  if (form.ok) {
    summary.form = { fetched: form.records.length, created: await processForm(form.records) };
    await setWatermark("airtable_form", form.newWatermark);
  } else {
    summary.form = { error: form.error };
  }

  const accessProtocol = await syncTable("airtable_access_protocol", TABLES.accessProtocol);
  if (accessProtocol.ok) {
    summary.accessProtocol = {
      fetched: accessProtocol.records.length,
      created: await processAccessProtocol(accessProtocol.records),
    };
    await setWatermark("airtable_access_protocol", accessProtocol.newWatermark);
  } else {
    summary.accessProtocol = { error: accessProtocol.error };
  }

  const showupIntake = await syncTable("airtable_showup_intake", TABLES.showupIntake);
  if (showupIntake.ok) {
    summary.showupIntake = { fetched: showupIntake.records.length, ...(await processShowupIntake(showupIntake.records)) };
    await setWatermark("airtable_showup_intake", showupIntake.newWatermark);
  } else {
    summary.showupIntake = { error: showupIntake.error };
  }

  res.status(200).json({ ok: true, summary });
};
