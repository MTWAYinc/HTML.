// Node port of sendclub/smtp_sender.py's SMTP config (same host/port, same
// env var naming convention) for ShowUpClub, which runs as a Vercel
// serverless function and can't import Python directly. Sends everything
// from a single inbox (info@) so a lead sees one consistent thread across
// confirmation + reminders, instead of SendClub's admin@/info@ alternation
// (which exists there for cold-outreach volume, not relevant here).
const nodemailer = require("nodemailer");

let transporter = null;
function getTransporter() {
  if (transporter) return transporter;
  transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 465),
    secure: true,
    auth: {
      user: process.env.SMTP_USER_INFO,
      pass: process.env.SMTP_PASSWORD_INFO,
    },
  });
  return transporter;
}

async function sendMail({ to, subject, text, html }) {
  const from = process.env.SMTP_USER_INFO;
  try {
    const info = await getTransporter().sendMail({ from, to, subject, text, html });
    return { ok: true, messageId: info.messageId };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
}

module.exports = { sendMail };
