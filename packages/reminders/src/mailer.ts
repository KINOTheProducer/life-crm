import nodemailer from "nodemailer";

export interface Email {
  to: string;
  subject: string;
  html: string;
  text: string;
}

export interface Mailer {
  send(email: Email): Promise<void>;
}

/**
 * SMTP_URL=smtp://user:pass@host:587 sends real mail. SMTP_URL=log prints to the console,
 * handy in development. Unset disables email.
 */
export function mailerFromEnv(env: Record<string, string | undefined> = process.env): Mailer | null {
  const url = env.SMTP_URL;
  if (!url) return null;
  const from = env.EMAIL_FROM ?? "Life CRM <reminders@localhost>";
  if (url === "log") {
    return {
      async send(email) {
        console.log(`[email] to=${email.to} subject="${email.subject}"\n${email.text}`);
      },
    };
  }
  const transport = nodemailer.createTransport(url);
  return {
    async send(email) {
      await transport.sendMail({ from, ...email });
    },
  };
}
