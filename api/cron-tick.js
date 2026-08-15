// Polled every ~2 minutes by cron-job.org (Vercel Hobby cron only runs
// daily, not frequent enough for 20-minute-before reminders). Sends any
// reminder whose send_at has passed, as long as the meeting itself hasn't
// happened yet (paso 8: never remind after the meeting time).
const { getDueReminders, markReminderStatus } = require("./_lib/supabase");
const { sendMail } = require("./_lib/mailer");
const { buildReminderEmail } = require("./_lib/showupCopy");

module.exports = async function handler(req, res) {
  const secret = req.query?.secret || new URL(req.url, "http://x").searchParams.get("secret");
  if (!process.env.CRON_TICK_SECRET || secret !== process.env.CRON_TICK_SECRET) {
    res.status(401).json({ ok: false, error: "invalid_secret" });
    return;
  }

  const due = await getDueReminders();
  if (!due.ok) {
    res.status(500).json({ ok: false, error: due.error });
    return;
  }

  const results = [];
  const now = Date.now();
  for (const row of due.rows) {
    const booking = row.showup_bookings || {};
    if (!booking.meeting_time || new Date(booking.meeting_time).getTime() <= now) {
      await markReminderStatus(row.id, "skipped");
      results.push({ id: row.id, outcome: "skipped_meeting_passed" });
      continue;
    }
    const meetingTimeFormatted = new Date(booking.meeting_time).toISOString();
    const email = buildReminderEmail({
      leadName: booking.lead_name,
      reminderType: row.reminder_type,
      meetingTimeFormatted,
      callLink: booking.call_link,
      rescheduleLink: booking.reschedule_link,
    });
    const sendResult = booking.lead_email ? await sendMail({ to: booking.lead_email, ...email }) : { ok: false };
    if (sendResult.ok) {
      await markReminderStatus(row.id, "sent");
      results.push({ id: row.id, outcome: "sent" });
    } else {
      // Left as pending: the next tick retries. Bounded automatically by
      // the meeting-time cutoff above once the window closes.
      results.push({ id: row.id, outcome: "send_failed", error: sendResult.error });
    }
  }

  res.status(200).json({ ok: true, processed: results.length, results });
};
