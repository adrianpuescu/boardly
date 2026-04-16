import { Resend } from "resend";

let client: Resend | null = null;

function getResend(): Resend {
  const key = process.env.RESEND_API_KEY;
  if (!key) {
    throw new Error("RESEND_API_KEY is not set");
  }
  if (!client) {
    client = new Resend(key);
  }
  return client;
}

interface SendEmailOptions {
  to: string;
  subject: string;
  html: string;
}

export async function sendEmail({ to, subject, html }: SendEmailOptions) {
  return getResend().emails.send({
    from: "Boardly <onboarding@resend.dev>",
    to,
    subject,
    html,
  });
}
