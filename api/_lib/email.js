// Builds and sends the Access Protocol diagnostic report email, reusing the
// same shared MTWAY email wrapper (emailTemplate.js) and SMTP sender
// (mailer.js) that ShowUpClub already uses, so every transactional email
// looks and behaves the same way instead of each feature inventing its own.
const { renderEmailHtml } = require("./emailTemplate");
const { sendMail } = require("./mailer");

const BAND_COPY = {
  qualified: { label: "Qualified", headline: "You look like a strong fit for MTWAY CLUB." },
  manual_review: { label: "Worth A Conversation", headline: "You're close. A short call can fill in the gaps." },
  reject: { label: "Not Quite There Yet", headline: "MTWAY CLUB may not be the right fit today, and that's alright." },
};

const TAHA_CALENDAR_LINK = "https://cal.com/mtway.inc/elite-brands";
const TAHA_SIGNATURE = ["Taha", "Chief Performance Officer, MTWAY"];

async function sendReportEmail({ to, domain, band, total, strengths, opportunities }) {
  const bandInfo = BAND_COPY[band] || { label: band, headline: "" };

  const paragraphs = [
    `Here's your Access Protocol result for ${domain}.`,
    `${total} / 24, ${bandInfo.label.toLowerCase()}. ${bandInfo.headline}`,
  ];

  const html = renderEmailHtml({
    heading: `${total} / 24`,
    paragraphs,
    listSections: [
      { title: "What's Working", items: strengths },
      { title: "Worth A Closer Look", items: opportunities },
    ],
    primaryCta: { label: "Talk It Through With Taha", url: TAHA_CALENDAR_LINK },
    signatureLines: ["Talk soon,", ...TAHA_SIGNATURE],
  });

  const text = [
    `Here's your Access Protocol result for ${domain}.`,
    `${total} / 24, ${bandInfo.label}.`,
    "",
    "What's working:",
    ...strengths.map((s) => `- ${s}`),
    "",
    "Worth a closer look:",
    ...opportunities.map((o) => `- ${o}`),
    "",
    `Talk it through with Taha: ${TAHA_CALENDAR_LINK}`,
    "",
    "Talk soon,",
    ...TAHA_SIGNATURE,
  ].join("\n");

  return sendMail({
    to,
    subject: `Your MTWAY CLUB Diagnostic: ${total}/24 (${bandInfo.label})`,
    text,
    html,
  });
}

module.exports = { sendReportEmail };
