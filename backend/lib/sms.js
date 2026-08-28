/**
 * SMS dispatch service.
 *
 * Two transports are supported:
 *   1. Fast2SMS (OTP + transactional SMS for Indian numbers)
 *   2. Console / JSONL log fallback (used when SMS_PROVIDER !== 'fast2sms' or
 *      when Fast2SMS credentials are missing / the gateway call fails).
 *
 * Every outbound SMS is ALWAYS logged to `backend/logs/sms.jsonl` so that
 * the flow remains fully testable in development without spending credits.
 */

const fs = require('fs');
const path = require('path');

const LOG_DIR = path.join(__dirname, '..', 'logs');
const LOG_FILE = path.join(LOG_DIR, 'sms.jsonl');

const PROVIDER = process.env.SMS_PROVIDER || 'log'; // 'fast2sms' | 'log'
const FAST2SMS_API_KEY = process.env.FAST2SMS_API_KEY;
const SMS_OTP_DOMAIN = process.env.SMS_OTP_DOMAIN || ''; // e.g. 'family.example.com'

console.log(`[sms] provider=${PROVIDER} hasKey=${!!FAST2SMS_API_KEY} domain=${SMS_OTP_DOMAIN || '(none)'}`);

function ensureLogFile() {
  if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR, { recursive: true });
}

function appendLog(entry) {
  try {
    ensureLogFile();
    fs.appendFileSync(LOG_FILE, JSON.stringify({ timestamp: new Date().toISOString(), ...entry }) + '\n');
  } catch (err) {
    console.error('[sms] failed to append log:', err.message);
  }
}

function consoleLog(entry) {
  const { phone, message } = entry;
  console.log(`[sms:${entry.transport}:${entry.kind}] -> ${phone} :: ${message}`);
}

/** Normalize phone to 10-digit Indian mobile (no country code, no +). */
function normalizePhone(phone) {
  let p = String(phone || '').replace(/[^\d]/g, '');
  // Strip country code prefix (91 or 0)
  if (p.length === 12 && p.startsWith('91')) p = p.slice(2);
  if (p.length === 11 && p.startsWith('0')) p = p.slice(1);
  return p;
}

async function sendViaFast2Sms({ phone, message, kind }) {
  if (!FAST2SMS_API_KEY) {
    const err = new Error('FAST2SMS_API_KEY is not configured');
    err.code = 'SMS_CONFIG';
    throw err;
  }

  const mobile = normalizePhone(phone);
  console.log(`[sms] fast2sms kind=${kind} phone=${mobile} msgLen=${(message||'').length}`);

  // DLT-registered route — works for both OTP and link messages.
  const res = await fetch('https://www.fast2sms.com/dev/bulkV2', {
    method: 'POST',
    headers: {
      'authorization': FAST2SMS_API_KEY,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      message,
      route: 'v3',
      language: 'english',
      numbers: mobile,
    }),
  });

  const body = await res.json().catch(() => ({}));
  console.log(`[sms] fast2sms bulk response: status=${res.status} return=${body.return} body=`, JSON.stringify(body));
  if (!res.ok || body.return !== true) {
    const err = new Error(`Fast2SMS bulk failed: ${res.status} ${JSON.stringify(body)}`);
    err.code = 'SMS_GATEWAY';
    err.details = body;
    throw err;
  }
  return { provider: 'fast2sms', messageId: body.request_id || null, kind };
}

/**
 * Build a WebOTP-compatible OTP message.
 * Format required by the WebOTP API: the code must be on the last line
 * together with `@domain`, e.g.:
 *   "Your PrisonConnect verification code is 123456."
 *   "123456 @family.example.com"
 */
function buildOtpMessage(otp, purpose) {
  const label = purpose || 'verification';
  if (SMS_OTP_DOMAIN) {
    return `Your PrisonConnect ${label} code is ${otp}.\n\n@${SMS_OTP_DOMAIN} ${otp}`;
  }
  return `Your PrisonConnect ${label} code is ${otp}. ${otp}`;
}

/**
 * Send an SMS.
 * @param {object} opts
 * @param {string} opts.phone     Recipient phone (any common format).
 * @param {string} opts.message   Message body.
 * @param {string} [opts.kind]    'otp' | 'link' | 'generic' — influences transport.
 * @param {string} [opts.callId]  Optional audit reference.
 * @returns {Promise<{provider: string, loggedAt: string, messageId?: string|null}>}
 */
async function sendSms({ phone, message, kind = 'generic', callId = null }) {
  const entry = {
    kind,
    phone: normalizePhone(phone),
    message,
    callId,
    transport: 'log'
  };

  if (PROVIDER === 'fast2sms') {
    try {
      const result = await sendViaFast2Sms({ phone: entry.phone, message, kind });
      entry.transport = 'fast2sms';
      entry.messageId = result.messageId || null;
      entry.gatewayOk = true;
    } catch (err) {
      entry.transport = 'fast2sms_logged_fallback';
      entry.gatewayOk = false;
      entry.gatewayError = err.message;
      console.error(`[sms] Fast2SMS failed (fallback to log): ${err.message}`);
    }
  }

  appendLog(entry);
  consoleLog(entry);
  return { provider: entry.transport, loggedAt: new Date().toISOString(), messageId: entry.messageId || null };
}

module.exports = { sendSms, buildOtpMessage, normalizePhone, PROVIDER, FAST2SMS_API_KEY };
