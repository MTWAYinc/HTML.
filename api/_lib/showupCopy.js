// Email copy for ShowUpClub. Same tone rules as sendclub/email_copy.py:
// short, human, no em dashes. Signed by Taha, since these are about a call
// that's specifically his, never Sindy's (see feedback-taha-handles-calls).
const TAHA_SIGNATURE = "Taha\nChief Performance Officer, MTWAY";

function firstName(name) {
  return (name || "").trim().split(/\s+/)[0] || "there";
}

const REMINDER_LABEL = { "24h": "tomorrow", "3h": "in a few hours", "20min": "in 20 minutes" };

function buildConfirmationEmail({ leadName, meetingTimeFormatted, callLink, rescheduleLink, prepLink }) {
  const lines = [
    `Hi ${firstName(leadName)},`,
    "",
    `You're set for ${meetingTimeFormatted} with me at MTWAY.`,
    "",
    `Call link: ${callLink}`,
    "",
    "Before we talk, it'd help to know a bit about where your business is at right now, " +
      `takes two minutes: ${prepLink}`,
    "",
    `Need to move it? Reschedule here: ${rescheduleLink}`,
    "",
    "Talk soon,",
    TAHA_SIGNATURE,
  ];
  return { subject: "You're confirmed with Taha at MTWAY", body: lines.join("\n") };
}

function buildReminderEmail({ leadName, reminderType, meetingTimeFormatted, callLink, rescheduleLink }) {
  const when = REMINDER_LABEL[reminderType] || "soon";
  const lines = [
    `Hi ${firstName(leadName)},`,
    "",
    `Quick reminder, we're talking ${when} (${meetingTimeFormatted}).`,
    "",
    `Call link: ${callLink}`,
    "",
    `Can't make it? Reschedule here: ${rescheduleLink}`,
    "",
    "See you soon,",
    TAHA_SIGNATURE,
  ];
  const subjectByType = {
    "24h": "Tomorrow: your call with Taha",
    "3h": "In a few hours: your call with Taha",
    "20min": "Starting soon: your call with Taha",
  };
  return { subject: subjectByType[reminderType] || "Reminder: your call with Taha", body: lines.join("\n") };
}

function buildSindyCancellationNotice({ leadName, leadEmail, meetingTimeFormatted }) {
  const lines = [
    `${leadName || "A lead"} (${leadEmail}) canceled their ${meetingTimeFormatted} call with Taha and didn't rebook.`,
    "",
    "Might be worth a manual follow up.",
  ];
  return { subject: `Cancellation: ${leadName || leadEmail}`, body: lines.join("\n") };
}

module.exports = { buildConfirmationEmail, buildReminderEmail, buildSindyCancellationNotice };
