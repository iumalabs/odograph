// Shared chrome for every transactional email this app sends (specs/055-transactional-email-
// template) — one reusable header/body/button/footer, filled per email via the EmailContent
// content slot. Table-based, fully inline-styled (no external stylesheet, ever) so mainstream
// email clients render it correctly; the one exception is a single embedded <style> block
// carrying the narrow-viewport responsive breakpoint (FR-009) — CSS media queries have no inline
// equivalent. A client that strips <style> blocks entirely still gets the inline (desktop) layout
// intact, never a broken one (FR-002).
//
// Colors/markup ported from the design source (Claude Design project
// dfecc39c-323d-4b89-a9ec-c126b3aa2deb, "Письмо - ссылка для входа.html") — deliberately NOT
// porting its "rotate your Access policy" copy, which references a Cloudflare Access mechanism
// this app doesn't have (spec.md Assumptions).

export type EmailContentDetail = { label: string; value: string };

export type EmailContent = {
  purposeTag: string;
  headline: string;
  bodyText: string;
  /** Set together or omitted together — a reminder-style email has no single primary action. */
  ctaLabel?: string | null;
  ctaUrl?: string | null;
  /** null when the content has nothing that expires (e.g. a reminder notification). */
  expiryNote?: string | null;
  /** Only entries the caller actually has — never a fixed set of rows with fabricated blanks
   * (Principle IV). Defaults to none. */
  details?: EmailContentDetail[];
  /** null when there's nothing to have "requested" (e.g. a reminder notification). */
  fallbackNote?: string | null;
};

const COLOR = {
  pageBg: "#e9edf1",
  dark: "#13171c",
  darkText: "#0a0c0f",
  accent: "#d4ff3f",
  white: "#ffffff",
  headline: "#13171c",
  body: "#4a5563",
  dim: "#8b96a4",
  strip: "#f4f6f8",
  line: "#e4e8ec",
  link: "#3a7bd5",
  footerFine: "#7d8896",
};

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function renderButton(content: EmailContent): string {
  if (!content.ctaLabel || !content.ctaUrl) return "";
  return `
<tr>
<td class="pad" bgcolor="${COLOR.white}" style="background:${COLOR.white};padding:0 32px 22px">
<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse">
<tr>
<td align="center" bgcolor="${COLOR.accent}" style="background:${COLOR.accent};border-radius:10px;padding:16px 30px">
<a href="${
    escapeHtml(content.ctaUrl)
  }" style="display:block;font-family:Arial,Helvetica,sans-serif;font-size:15px;font-weight:bold;letter-spacing:0.2px;color:${COLOR.darkText};text-decoration:none;mso-line-height-rule:exactly;line-height:18px">${
    escapeHtml(content.ctaLabel)
  }</a>
</td>
</tr>
</table>
</td>
</tr>`;
}

function renderExpiryStrip(content: EmailContent): string {
  if (!content.expiryNote) return "";
  return `
<tr>
<td class="pad" bgcolor="${COLOR.white}" style="background:${COLOR.white};padding:0 32px 26px">
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse:collapse;background:${COLOR.strip};border-radius:10px">
<tr>
<td style="padding:14px 16px;font-family:'Courier New',Courier,monospace;font-size:12px;line-height:19px;mso-line-height-rule:exactly;color:${COLOR.body}">${
    escapeHtml(content.expiryNote)
  }</td>
</tr>
</table>
</td>
</tr>`;
}

function renderDetails(content: EmailContent): string {
  const details = content.details ?? [];
  if (details.length === 0) return "";
  const rows = details.map((row) =>
    `<tr>
<td width="130" style="width:130px;padding:0 0 9px;font-family:'Courier New',Courier,monospace;font-size:12px;line-height:18px;color:${COLOR.dim}">${
      escapeHtml(row.label)
    }</td>
<td style="padding:0 0 9px;font-family:'Courier New',Courier,monospace;font-size:12px;line-height:18px;color:${COLOR.headline}">${
      escapeHtml(row.value)
    }</td>
</tr>`
  ).join("\n");
  return `
<tr>
<td class="pad" bgcolor="${COLOR.white}" style="background:${COLOR.white};padding:0 32px 6px">
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse:collapse;border-top:1px solid ${COLOR.line}">
<tr><td style="padding:20px 0 12px;font-family:'Courier New',Courier,monospace;font-size:11px;letter-spacing:1.2px;color:${COLOR.dim}">REQUEST DETAILS</td></tr>
<tr>
<td>
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse:collapse">
${rows}
</table>
</td>
</tr>
</table>
</td>
</tr>`;
}

function renderFallback(content: EmailContent): string {
  if (!content.ctaUrl && !content.fallbackNote) return "";
  const linkBlock = content.ctaUrl
    ? `<tr><td style="padding:20px 0 8px;font-family:Arial,Helvetica,sans-serif;font-size:13px;line-height:20px;mso-line-height-rule:exactly;color:${COLOR.body}">Button not working? Paste this into your browser:</td></tr>
<tr><td style="font-family:'Courier New',Courier,monospace;font-size:12px;line-height:19px;mso-line-height-rule:exactly;word-break:break-all"><a href="${
      escapeHtml(content.ctaUrl)
    }" style="color:${COLOR.link};text-decoration:underline">${
      escapeHtml(content.ctaUrl)
    }</a></td></tr>`
    : "";
  const noteBlock = content.fallbackNote
    ? `<tr><td style="padding:${
      content.ctaUrl ? "20px" : "0"
    } 0 0;font-family:Arial,Helvetica,sans-serif;font-size:13px;line-height:20px;mso-line-height-rule:exactly;color:${COLOR.dim}">${
      escapeHtml(content.fallbackNote)
    }</td></tr>`
    : "";
  return `
<tr>
<td class="pad" bgcolor="${COLOR.white}" style="background:${COLOR.white};padding:24px 32px 30px">
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse:collapse;border-top:1px solid ${COLOR.line}">
${linkBlock}
${noteBlock}
</table>
</td>
</tr>`;
}

export function renderEmailHtml(content: EmailContent): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light dark">
<meta name="supported-color-schemes" content="light dark">
<title>${escapeHtml(content.headline.replace(/\n/g, " "))}</title>
<style>
@media only screen and (max-width:620px){
  .wrap{width:100% !important}
  .pad{padding-left:22px !important;padding-right:22px !important}
  .h1{font-size:24px !important;line-height:30px !important}
}
</style>
</head>
<body style="margin:0;padding:0;background:${COLOR.pageBg};-webkit-font-smoothing:antialiased">
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:${COLOR.pageBg}">
<tr>
<td align="center" style="padding:28px 12px 40px">
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="600" class="wrap" style="width:600px;max-width:600px;border-collapse:collapse">

<tr>
<td class="pad" bgcolor="${COLOR.dark}" style="background:${COLOR.dark};padding:22px 32px;border-radius:14px 14px 0 0">
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse:collapse">
<tr>
<td width="34" valign="middle" style="width:34px">
<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse">
<tr><td width="30" height="30" align="center" valign="middle" bgcolor="${COLOR.accent}" style="width:30px;height:30px;background:${COLOR.accent};border-radius:9px;font-family:Arial,Helvetica,sans-serif;font-size:15px;font-weight:bold;letter-spacing:-0.5px;color:${COLOR.darkText};text-align:center;mso-line-height-rule:exactly;line-height:30px">od</td></tr>
</table>
</td>
<td valign="middle" style="font-family:Arial,Helvetica,sans-serif;font-size:16px;font-weight:bold;letter-spacing:-0.2px;color:${COLOR.white};mso-line-height-rule:exactly;line-height:22px">odograph</td>
<td align="right" valign="middle" style="font-family:'Courier New',Courier,monospace;font-size:11px;letter-spacing:1px;color:${COLOR.dim};mso-line-height-rule:exactly;line-height:16px">${
    escapeHtml(content.purposeTag)
  }</td>
</tr>
</table>
</td>
</tr>

<tr>
<td class="pad" bgcolor="${COLOR.white}" style="background:${COLOR.white};padding:36px 32px 8px">
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse:collapse">
<tr><td class="h1" style="font-family:Arial,Helvetica,sans-serif;font-size:27px;line-height:34px;mso-line-height-rule:exactly;font-weight:bold;letter-spacing:-0.6px;color:${COLOR.headline};padding-bottom:14px">${
    escapeHtml(content.headline).replace(/\n/g, "<br>")
  }</td></tr>
<tr><td style="font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:24px;mso-line-height-rule:exactly;color:${COLOR.body};padding-bottom:26px">${
    escapeHtml(content.bodyText)
  }</td></tr>
</table>
</td>
</tr>
${renderButton(content)}
${renderExpiryStrip(content)}
${renderDetails(content)}
${renderFallback(content)}

<tr>
<td class="pad" bgcolor="${COLOR.dark}" style="background:${COLOR.dark};padding:24px 32px;border-radius:0 0 14px 14px">
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse:collapse">
<tr><td style="font-family:Arial,Helvetica,sans-serif;font-size:13px;line-height:20px;mso-line-height-rule:exactly;color:#c3ccd6;padding-bottom:10px"><b style="color:${COLOR.white}">odograph</b> — a self-hosted maintenance log. Fill-ups, service, reminders, documents.</td></tr>
<tr><td style="font-family:'Courier New',Courier,monospace;font-size:11px;line-height:18px;mso-line-height-rule:exactly;color:${COLOR.footerFine}">Transactional mail — no marketing, nothing to unsubscribe from.</td></tr>
</table>
</td>
</tr>

</table>
</td>
</tr>
</table>
</body>
</html>`;
}

export function renderEmailText(content: EmailContent): string {
  const lines: string[] = [content.headline.replace(/\n/g, " "), "", content.bodyText];
  if (content.ctaLabel && content.ctaUrl) {
    lines.push("", `${content.ctaLabel}: ${content.ctaUrl}`);
  }
  if (content.expiryNote) {
    lines.push("", content.expiryNote);
  }
  const details = content.details ?? [];
  if (details.length > 0) {
    lines.push("", "Request details:");
    for (const row of details) lines.push(`  ${row.label}: ${row.value}`);
  }
  if (content.fallbackNote) {
    lines.push("", content.fallbackNote);
  }
  return lines.join("\n");
}
