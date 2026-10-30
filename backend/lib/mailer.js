/**
 * Outbound mail service — SMTP dispatch with a log-only dev fallback.
 *
 * Mirrors lib/sms.js: every outbound message is ALWAYS appended to
 * `backend/logs/mail.jsonl` so the password-reset flow stays testable in
 * development without any SMTP credentials (MAIL_PROVIDER=log, the default
 * when SMTP_HOST is unset, prints the code straight to the console too).
 *
 * SMTP is configured entirely through env:
 *   SMTP_HOST   e.g. smtp.gmail.com
 *   SMTP_PORT   587 (STARTTLS, default) or 465 (implicit TLS)
 *   SMTP_SECURE optional; defaults to true when SMTP_PORT=465
 *   SMTP_USER   account / login
 *   SMTP_PASS   password (Gmail: app password)
 *   SMTP_FROM   optional envelope, defaults to SMTP_USER
 *   MAIL_PROVIDER  explicit `smtp` | `log` override
 */

const fs = require('fs');
const path = require('path');

const LOG_DIR = path.join(__dirname, '..', 'logs');
const LOG_FILE = path.join(LOG_DIR, 'mail.jsonl');

const SMTP_HOST = process.env.SMTP_HOST || '';
const SMTP_PORT = Number(process.env.SMTP_PORT || 587);
const SMTP_SECURE =
  process.env.SMTP_SECURE != null
    ? process.env.SMTP_SECURE === 'true'
    : SMTP_PORT === 465;
const SMTP_USER = process.env.SMTP_USER || '';
const SMTP_PASS = process.env.SMTP_PASS || '';
const SMTP_FROM = process.env.SMTP_FROM || SMTP_USER || 'PrisonConnect <no-reply@prisonconnect.local>';

const PROVIDER = (
  process.env.MAIL_PROVIDER || (SMTP_HOST ? 'smtp' : 'log')
).toLowerCase();

console.log(`[mail] provider=${PROVIDER} host=${SMTP_HOST || '(none)'} port=${SMTP_PORT} user=${SMTP_USER || '(none)'}`);

let transport = null;
function getTransport() {
  if (!transport) {
    // Lazy require + lazy create: the log provider must work with no SMTP
    // config at all (and nodemailer stays out of the hot path).
    const nodemailer = require('nodemailer');
    transport = nodemailer.createTransport({
      host: SMTP_HOST,
      port: SMTP_PORT,
      secure: SMTP_SECURE,
      auth: SMTP_USER ? { user: SMTP_USER, pass: SMTP_PASS } : undefined,
    });
  }
  return transport;
}

function appendLog(record) {
  try {
    if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR, { recursive: true });
    fs.appendFileSync(LOG_FILE, JSON.stringify(record) + '\n');
  } catch (err) {
    console.error('[mail] log write failed:', err.message);
  }
}

/**
 * Send one message. Throws on SMTP failure (callers decide how to surface
 * it); the log provider never throws.
 *
 * @param {{ to: string, subject: string, text: string, html?: string }} msg
 * @returns {Promise<{ delivered: boolean }>}
 */
async function sendMail({ to, subject, text, html }) {
  appendLog({ at: new Date().toISOString(), provider: PROVIDER, to, subject, text });

  if (PROVIDER === 'smtp') {
    if (!SMTP_HOST) throw new Error('MAIL_PROVIDER=smtp but SMTP_HOST is not set');
    await getTransport().sendMail({ from: SMTP_FROM, to, subject, text, html });
    console.log(`[mail] sent to=${to} subject="${subject}"`);
    return { delivered: true };
  }

  console.log(`[mail][log-provider] to=${to} subject="${subject}"\n${text}`);
  return { delivered: false };
}

module.exports = { sendMail, PROVIDER };
