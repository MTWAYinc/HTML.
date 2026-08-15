// Receives cal.com booking webhooks (created/rescheduled/cancelled) for
// Taha's "The Alliance For the Elite Brands" event and drives ShowUpClub's
// reminder pipeline. Body parsing is disabled so the raw bytes are
// available for HMAC signature verification, per Vercel's documented
// webhook-verification pattern.
const crypto = require("crypto");
const getRawBody = require("raw-body");
const { sendMail } = require("./_lib/mailer");
const { upsertBooking, insertReminderBatch, cancelPendingReminders } = require("./_lib/supabase");
const { buildConfirmationEmail, buildSindyCancellationNotice } = require("./_lib/showupCopy");

module.exports.config = { api: { bodyParser: false } };

function verifySignature(rawBody, headerSignature) {
  const secret = process.env.CAL_WEBHOOK_SECRET;
  if (!secret || !headerSignature) return false;
  const expected = crypto.createHmac("sha256", secret).update(rawBody).digest("hex");
  const headerBuf = Buffer.from(String(headerSignature));
  const expectedBuf = Buffer.from(expected);
  if (headerBuf.length !== expectedBuf.length) return false;
  return crypto.timingSafeEqual(headerBuf, expectedBuf);
}

// cal.com's exact payload shape wasn't verified against a live event before
// build time (see the plan's caveat on this). These helpers isolate the
// guesswork so a field-name fix is a one-line change once a real payload
// has been logged and inspected.
function resolveCallLink(uid, payload) {
  return payload?.videoCallData?.url || payload?.location || `https://cal.com/booking/${uid}`;
}
function resolveRescheduleLink(uid) {
  return `https://cal.com/reschedule/${uid}`;
}
function resolveAttendee(payload) {
  const a = (payload?.attendees || [])[0] || {};
  return { name: a.name || "", email: a.email || "", timeZone: a.timeZone || "UTC" };
}
function formatMeetingTime(isoString, timeZone) {
  try {
    return new Intl.DateTimeFormat("en-US", {
      timeZone,
      dateStyle: "full",
      timeStyle: "short",
    }).format(new Date(isoString));
  } catch {
    return isoString;
  }
}
function prepLink(uid, name, email) {
  const params = new URLSearchParams({ b: uid, n: name || "", e: email || "" });
  return `https://mtwayinc.com/showup-prep.html?${params.toString()}`;
}

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ ok: false, error: "method_not_allowed" });
    return;
  }

  const rawBody = await getRawBody(req);
  if (!verifySignature(rawBody, req.headers["x-cal-signature-256"])) {
    res.status(401).json({ ok: false, error: "invalid_signature" });
    return;
  }

  let event;
  try {
    event = JSON.parse(rawBody.toString("utf-8"));
  } catch {
    res.status(400).json({ ok: false, error: "invalid_json" });
    return;
  }

  // Logged so the real field shape can be confirmed on first live delivery.
  console.log("cal-webhook received:", JSON.stringify(event));

  const triggerEvent = event.triggerEvent;
  const payload = event.payload || {};
  const uid = payload.uid;
  if (!uid) {
    res.status(400).json({ ok: false, error: "missing_booking_uid" });
    return;
  }

  const attendee = resolveAttendee(payload);
  const meetingTime = payload.startTime;
  const callLink = resolveCallLink(uid, payload);
  const rescheduleLink = resolveRescheduleLink(uid);

  try {
    if (triggerEvent === "BOOKING_CREATED") {
      await upsertBooking({
        bookingUid: uid,
        leadName: attendee.name,
        leadEmail: attendee.email,
        meetingTime,
        callLink,
        rescheduleLink,
        status: "agendada",
      });
      await insertReminderBatch({ bookingUid: uid, meetingTime });

      const meetingTimeFormatted = formatMeetingTime(meetingTime, attendee.timeZone);
      const email = buildConfirmationEmail({
        leadName: attendee.name,
        meetingTimeFormatted,
        callLink,
        rescheduleLink,
        prepLink: prepLink(uid, attendee.name, attendee.email),
      });
      if (attendee.email) await sendMail({ to: attendee.email, ...email });
    } else if (triggerEvent === "BOOKING_RESCHEDULED") {
      const previousUid = payload.rescheduleUid || payload.fromReschedule || uid;
      await cancelPendingReminders(previousUid);
      await upsertBooking({
        bookingUid: uid,
        leadName: attendee.name,
        leadEmail: attendee.email,
        meetingTime,
        callLink,
        rescheduleLink,
        status: "reagendada",
      });
      await insertReminderBatch({ bookingUid: uid, meetingTime });
    } else if (triggerEvent === "BOOKING_CANCELLED") {
      await cancelPendingReminders(uid);
      await upsertBooking({
        bookingUid: uid,
        leadName: attendee.name,
        leadEmail: attendee.email,
        meetingTime,
        callLink,
        rescheduleLink,
        status: "cancelada",
      });
      const meetingTimeFormatted = formatMeetingTime(meetingTime, attendee.timeZone);
      const notifyTo = process.env.NOTIFY_TO_EMAIL;
      if (notifyTo) {
        const notice = buildSindyCancellationNotice({
          leadName: attendee.name,
          leadEmail: attendee.email,
          meetingTimeFormatted,
        });
        await sendMail({ to: notifyTo, ...notice });
      }
    }
    res.status(200).json({ ok: true });
  } catch (err) {
    res.status(500).json({ ok: false, error: String(err) });
  }
};
