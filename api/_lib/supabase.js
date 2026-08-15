// Server-side Supabase helper for ShowUpClub's booking/reminder state.
// Uses the service-role key (never exposed client-side) so writes aren't
// blocked by row-level security. Mirrors api/_lib/airtable.js's shape:
// small focused functions, never a raw client leaking out.
const { createClient } = require("@supabase/supabase-js");

let client = null;
function getClient() {
  if (client) return client;
  client = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });
  return client;
}

const REMINDER_OFFSETS_MIN = { "24h": 24 * 60, "3h": 3 * 60, "20min": 20 };

async function upsertBooking({ bookingUid, leadName, leadEmail, meetingTime, callLink, rescheduleLink, status }) {
  const { error } = await getClient()
    .from("showup_bookings")
    .upsert(
      {
        booking_uid: bookingUid,
        lead_name: leadName,
        lead_email: leadEmail,
        meeting_time: meetingTime,
        call_link: callLink,
        reschedule_link: rescheduleLink,
        status,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "booking_uid" }
    );
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

async function insertReminderBatch({ bookingUid, meetingTime }) {
  const meetingDate = new Date(meetingTime);
  const rows = Object.entries(REMINDER_OFFSETS_MIN).map(([reminderType, minutesBefore]) => ({
    booking_uid: bookingUid,
    reminder_type: reminderType,
    send_at: new Date(meetingDate.getTime() - minutesBefore * 60 * 1000).toISOString(),
    status: "pending",
  }));
  const { error } = await getClient().from("showup_reminders").insert(rows);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

async function cancelPendingReminders(bookingUid) {
  const { error } = await getClient()
    .from("showup_reminders")
    .update({ status: "canceled" })
    .eq("booking_uid", bookingUid)
    .eq("status", "pending");
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

async function getDueReminders(limit = 25) {
  const nowIso = new Date().toISOString();
  const { data, error } = await getClient()
    .from("showup_reminders")
    .select("id, booking_uid, reminder_type, send_at, showup_bookings(lead_name, lead_email, meeting_time, call_link, reschedule_link, status)")
    .eq("status", "pending")
    .lte("send_at", nowIso)
    .limit(limit);
  if (error) return { ok: false, error: error.message };
  return { ok: true, rows: data || [] };
}

async function markReminderStatus(id, status) {
  const fields = { status };
  if (status === "sent") fields.sent_at = new Date().toISOString();
  const { error } = await getClient().from("showup_reminders").update(fields).eq("id", id);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

module.exports = {
  upsertBooking,
  insertReminderBatch,
  cancelPendingReminders,
  getDueReminders,
  markReminderStatus,
};
