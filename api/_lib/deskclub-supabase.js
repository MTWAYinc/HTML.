// Server-side Supabase helper for DeskClub's own write paths that live in
// this Vercel project (Airtable ingestion, the booking<->transcript
// matcher). Mirrors api/_lib/supabase.js / api/_lib/proposalclub-supabase.js:
// small focused functions, service-role key only, never a raw client
// leaking out.
const { createClient } = require("@supabase/supabase-js");

let client = null;
function getClient() {
  if (client) return client;
  client = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });
  return client;
}

// Only includes keys that are actually present -- an upsert that sends an
// explicit null for an unknown field would clobber a richer value another
// source (e.g. ScoutClub's local sync) already wrote for that email.
function stripNullish(row) {
  const out = {};
  for (const [key, value] of Object.entries(row)) {
    if (value !== null && value !== undefined) out[key] = value;
  }
  return out;
}

async function upsertLead(fields, sourceAgent, defaultSource = "inbound") {
  const email = (fields.email || "").trim().toLowerCase();
  if (!email) return { ok: false, error: "missing_email" };
  const row = stripNullish({
    email,
    company_name: fields.companyName,
    first_name: fields.firstName,
    last_name: fields.lastName,
    website: fields.website,
    country: fields.country,
    category: fields.category,
    icp_score: fields.icpScore,
    source: fields.source || defaultSource,
    source_agent: sourceAgent,
    status: fields.status,
    raw_payload: fields.rawPayload,
  });
  const { error } = await getClient().from("leads").upsert(row, { onConflict: "email" });
  if (error) return { ok: false, error: error.message };
  return { ok: true, email };
}

async function insertLeadEvent(leadEmail, eventType, detail, sourceAgent) {
  const email = (leadEmail || "").trim().toLowerCase();
  if (!email) return { ok: false, error: "missing_email" };
  const { data: lead, error: lookupError } = await getClient()
    .from("leads")
    .select("id")
    .eq("email", email)
    .maybeSingle();
  if (lookupError) return { ok: false, error: lookupError.message };
  if (!lead) return { ok: false, error: "lead_not_found" };
  const { error } = await getClient().from("lead_events").insert({
    lead_id: lead.id,
    event_type: eventType,
    detail: detail || {},
    source_agent: sourceAgent,
  });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

// Best-effort match against showup_bookings for a freshly-ingested Fathom
// transcript. Never touches `status` -- only ever writes
// realizada_match_status='posible_match' plus the candidate list. Flipping
// a booking to 'realizada' is exclusively done by Sindy, from DeskClub, via
// the confirm_booking_realizada RPC (see the migration). This is the "never
// silently guess an ID mapping between two systems" rule applied here: an
// email+time-window match is a strong signal, not a guarantee.
const MATCH_WINDOW_MS = 24 * 60 * 60 * 1000;

async function flagPossibleRealizadaMatch(transcript) {
  const email = (transcript.leadEmail || "").trim().toLowerCase();
  if (!email || !transcript.recordedAt) return { ok: true, matched: 0 };

  const recordedAt = new Date(transcript.recordedAt).getTime();
  if (!Number.isFinite(recordedAt)) return { ok: true, matched: 0 };

  const { data: candidates, error } = await getClient()
    .from("showup_bookings")
    .select("booking_uid, meeting_time, status")
    .ilike("lead_email", email)
    .neq("status", "cancelada");
  if (error) return { ok: false, error: error.message };

  const inWindow = (candidates || []).filter((b) => {
    if (!b.meeting_time) return false;
    const delta = Math.abs(new Date(b.meeting_time).getTime() - recordedAt);
    return delta <= MATCH_WINDOW_MS;
  });
  if (inWindow.length === 0) return { ok: true, matched: 0 };

  const candidateSummary = inWindow.map((b) => ({ booking_uid: b.booking_uid, meeting_time: b.meeting_time }));
  let matched = 0;
  for (const booking of inWindow) {
    const { error: updateError } = await getClient()
      .from("showup_bookings")
      .update({
        realizada_match_status: "posible_match",
        matched_transcript_id: transcript.id,
        match_candidates: candidateSummary,
        updated_at: new Date().toISOString(),
      })
      .eq("booking_uid", booking.booking_uid);
    if (!updateError) matched += 1;
  }
  return { ok: true, matched };
}

async function upsertHeartbeat(agentName, note = "") {
  const { error } = await getClient()
    .from("agent_heartbeats")
    .upsert(
      { agent_name: agentName, last_seen_at: new Date().toISOString(), note: note || null },
      { onConflict: "agent_name" }
    );
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

module.exports = {
  upsertLead,
  insertLeadEvent,
  flagPossibleRealizadaMatch,
  upsertHeartbeat,
};
