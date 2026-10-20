import type { Email } from "./mailer";

export interface DigestItem {
  title: string;
  body: string | null;
  url: string;
}

const escape = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

/** Daily digest in the app's paper/espresso/terracotta palette. Inline styles for email clients. */
export function greeting(hour: number) {
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

export function digestEmail(to: string, name: string, items: DigestItem[], appUrl: string, hour: number): Email {
  const first = name.split(" ")[0] || name;
  const hello = `${greeting(hour)}, ${first}`;
  const subject = items.length === 1 ? items[0]!.title : `${items.length} reminders about your people`;

  const rows = items
    .map(
      (i) => `<tr><td style="padding:16px 0;border-top:1px solid #e6e1d6">
  <a href="${escape(i.url)}" style="color:#372007;text-decoration:none;font-size:16px;font-weight:600">${escape(i.title)}</a>
  ${i.body ? `<div style="color:#6b5a45;font-size:14px;margin-top:4px">${escape(i.body)}</div>` : ""}
</td></tr>`,
    )
    .join("");

  const html = `<!doctype html><html><body style="margin:0;background:#f6f4ee;font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;color:#372007">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:32px 16px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#fcfbf7;border-radius:24px;padding:32px">
<tr><td style="font-family:ui-monospace,Menlo,monospace;font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:#6b5a45">Life CRM</td></tr>
<tr><td style="font-family:Georgia,'Times New Roman',serif;font-size:32px;line-height:1.1;padding:12px 0 20px">${escape(hello)}</td></tr>
${rows}
<tr><td style="padding-top:24px"><a href="${escape(appUrl)}/reminders" style="display:inline-block;background:#ba4b23;color:#fcfbf7;text-decoration:none;font-family:ui-monospace,Menlo,monospace;font-size:12px;letter-spacing:.08em;text-transform:uppercase;padding:12px 20px;border-radius:999px">Open reminders</a></td></tr>
</table>
<p style="font-size:12px;color:#6b5a45;margin-top:16px">Change when and how you get these in <a href="${escape(appUrl)}/settings" style="color:#a8431f">settings</a>.</p>
</td></tr></table></body></html>`;

  const text = [hello, "", ...items.map((i) => `- ${i.title}${i.body ? ` (${i.body})` : ""}\n  ${i.url}`), "", `${appUrl}/reminders`].join(
    "\n",
  );
  return { to, subject, html, text };
}
