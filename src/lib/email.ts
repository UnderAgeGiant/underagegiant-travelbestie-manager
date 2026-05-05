import nodemailer from 'nodemailer';
import * as fs from 'fs';
import * as path from 'path';
import { logger } from './logger';

const TEMPLATE_PATH = path.join(__dirname, '..', 'templates', 'Welcome-Email.html');

function loadTemplate(userName: string): string {
  const html = fs.readFileSync(TEMPLATE_PATH, 'utf-8');
  return html.replace(/\{user_name\}/g, userName);
}

function createTransport() {
  return nodemailer.createTransport({
    host: process.env.EMAIL_HOST,
    port: Number(process.env.EMAIL_PORT ?? 587),
    secure: process.env.EMAIL_SECURE === 'true',
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS,
    },
  });
}

export async function sendWelcomeEmail(toEmail: string, userName: string): Promise<void> {
  const transporter = createTransport();
  const html = loadTemplate(userName);

  await transporter.sendMail({
    from: process.env.EMAIL_FROM ?? process.env.EMAIL_USER,
    to: toEmail,
    subject: '¡Bienvenido a TravelingBestie! ✈️',
    html,
  });

  logger.info({ msg: 'welcome email sent', email: toEmail });
}
