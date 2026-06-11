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

const KARMA_CONFIRMATION_TEMPLATE_PATH = path.join(__dirname, '..', 'templates', 'Karma-Confirmation-Email.html');

const OTP_TEMPLATE_PATH = path.join(__dirname, '..', 'templates', 'OTP-Email.html');

function loadOtpTemplate(otpCode: string): string {
  const html = fs.readFileSync(OTP_TEMPLATE_PATH, 'utf-8');
  return html.replace(/\{otp_code\}/g, otpCode);
}

function loadKarmaTemplate(
  userName: string,
  karmaAmount: number,
  packageLabel: string,
  amount: string,
  currency: string,
  captureId: string,
  purchaseDate: string,
  newBalance: number,
): string {
  const html = fs.readFileSync(KARMA_CONFIRMATION_TEMPLATE_PATH, 'utf-8');
  return html
    .replace(/\{user_name\}/g,     userName)
    .replace(/\{karma_amount\}/g,  String(karmaAmount))
    .replace(/\{package_label\}/g, packageLabel)
    .replace(/\{amount\}/g,        amount)
    .replace(/\{currency\}/g,      currency)
    .replace(/\{capture_id\}/g,    captureId)
    .replace(/\{purchase_date\}/g, purchaseDate)
    .replace(/\{new_balance\}/g,   String(newBalance));
}

export async function sendKarmaConfirmationEmail(
  toEmail: string,
  userName: string,
  karmaAmount: number,
  packageLabel: string,
  amount: string,
  currency: string,
  captureId: string,
  newBalance: number,
): Promise<void> {
  const transporter = createTransport();
  const purchaseDate = new Date().toLocaleString('es-CL', { timeZone: 'America/Santiago' });
  const html = loadKarmaTemplate(userName, karmaAmount, packageLabel, amount, currency, captureId, purchaseDate, newBalance);

  await transporter.sendMail({
    from:    process.env.EMAIL_FROM ?? process.env.EMAIL_USER,
    to:      toEmail,
    subject: `✨ ¡Compraste ${karmaAmount} Karma en Tripilove!`,
    html,
  });

  logger.info({ msg: 'karma confirmation email sent', email: toEmail, karmaAmount });
}

export async function sendOtpEmail(toEmail: string, otpCode: string): Promise<void> {
  const transporter = createTransport();
  const html = loadOtpTemplate(otpCode);
  await transporter.sendMail({
    from: process.env.EMAIL_FROM ?? process.env.EMAIL_USER,
    to:   toEmail,
    subject: '🔑 Tu código de verificación — Tripilove',
    html,
  });
  logger.info({ msg: 'OTP email sent', email: toEmail });
}

export async function sendWelcomeEmail(toEmail: string, userName: string): Promise<void> {
  const transporter = createTransport();
  const html = loadTemplate(userName);

  await transporter.sendMail({
    from: process.env.EMAIL_FROM ?? process.env.EMAIL_USER,
    to: toEmail,
    subject: '¡Bienvenido a Tripilove! ✈️',
    html,
  });

  logger.info({ msg: 'welcome email sent', email: toEmail });
}
