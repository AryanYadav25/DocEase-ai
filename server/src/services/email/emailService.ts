import nodemailer, { type Transporter } from 'nodemailer';
import { env } from '../../config/env.js';
import { logger } from '../../config/logger.js';
import { AppError } from '../../utils/errors.js';

export function isEmailConfigured(): boolean {
  return env.EMAIL_PROVIDER === 'smtp' && !!env.SMTP_HOST && !!env.SMTP_PORT;
}

let transporter: Transporter | null = null;

function getTransporter() {
  if (!isEmailConfigured()) throw new AppError(503, 'EMAIL_NOT_CONFIGURED', 'Email delivery is not configured on this server.');
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: env.SMTP_HOST,
      port: env.SMTP_PORT,
      secure: env.SMTP_PORT === 465,
      auth: env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASS } : undefined,
    });
  }
  return transporter;
}

export async function sendEmail(message: { to: string; subject: string; text: string; html?: string }) {
  const t = getTransporter();
  await t.sendMail({ from: env.EMAIL_FROM, ...message });
  logger.info({ to: message.to, subject: message.subject }, 'Email sent');
}
