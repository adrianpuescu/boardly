import { Resend } from "resend";

export const resend = new Resend(process.env.RESEND_API_KEY);

interface SendEmailOptions {
  to: string;
  subject: string;
  html: string;
}

export async function sendEmail({ to, subject, html }: SendEmailOptions) {
  return resend.emails.send({
    from: "Boardly <onboarding@resend.dev>",
    to,
    subject,
    html,
  });
}
