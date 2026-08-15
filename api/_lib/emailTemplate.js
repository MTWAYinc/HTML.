// Minimal table-based HTML email wrapper, MTWAY-branded. Inline styles only
// (no <style> blocks) since that's what actually survives Gmail/Outlook/Apple
// Mail stripping, not the CSS custom properties the website itself uses.
// White background on purpose: email clients frequently override dark
// backgrounds or force their own dark-mode remap, which breaks a black
// background in unpredictable ways across clients.
function escapeHtml(str) {
  return String(str || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function renderEmailHtml({ heading, paragraphs = [], primaryCta, links = [], signatureLines = [] }) {
  const paragraphsHtml = paragraphs
    .map(
      (p) =>
        `<p style="margin:0 0 16px;font-family:Helvetica,Arial,sans-serif;font-size:15px;line-height:1.6;color:#1a1a1a;">${escapeHtml(
          p
        )}</p>`
    )
    .join("\n");

  const ctaHtml = primaryCta
    ? `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:24px 0;">
        <tr><td style="background:#111111;border-radius:2px;">
          <a href="${escapeHtml(primaryCta.url)}" style="display:inline-block;padding:14px 28px;font-family:Helvetica,Arial,sans-serif;font-size:13px;font-weight:bold;letter-spacing:1px;text-transform:uppercase;color:#ffffff;text-decoration:none;">${escapeHtml(
            primaryCta.label
          )}</a>
        </td></tr>
      </table>`
    : "";

  const linksHtml = links
    .map(
      (l) =>
        `<p style="margin:0 0 12px;font-family:Helvetica,Arial,sans-serif;font-size:13px;color:#444444;">${escapeHtml(
          l.label
        )}: <a href="${escapeHtml(l.url)}" style="color:#111111;">${escapeHtml(l.url)}</a></p>`
    )
    .join("\n");

  const signatureHtml = signatureLines
    .map(
      (line, i) =>
        `<p style="margin:0;font-family:Helvetica,Arial,sans-serif;font-size:14px;color:${
          i === 0 ? "#1a1a1a" : "#666666"
        };">${escapeHtml(line)}</p>`
    )
    .join("\n");

  return `<!DOCTYPE html>
<html>
<body style="margin:0;padding:0;background:#f4f4f4;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f4f4f4;padding:32px 16px;">
<tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:480px;background:#ffffff;">
<tr><td style="padding:32px 36px 8px;">
  <div style="margin-bottom:20px;">
    <img src="https://mtwayinc.com/mtway-shield.jpg" width="18" height="17" alt="MTWAY" style="vertical-align:middle;border:0;margin-right:8px;">
    <span style="font-family:Helvetica,Arial,sans-serif;font-size:10px;font-weight:bold;letter-spacing:3px;text-transform:uppercase;color:#999999;vertical-align:middle;">MTWAY CLUB</span>
  </div>
  <h1 style="margin:0 0 20px;font-family:Georgia,'Times New Roman',serif;font-size:24px;font-weight:normal;color:#111111;">${escapeHtml(
    heading
  )}</h1>
  ${paragraphsHtml}
  ${ctaHtml}
  ${linksHtml}
  <div style="height:1px;background:#eaeaea;margin:24px 0;"></div>
  ${signatureHtml}
</td></tr>
<tr><td style="padding:20px 36px 28px;">
  <p style="margin:0;font-family:Helvetica,Arial,sans-serif;font-size:10px;letter-spacing:.5px;color:#aaaaaa;">MTWAY INC. Delaware, USA.</p>
</td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;
}

module.exports = { renderEmailHtml };
