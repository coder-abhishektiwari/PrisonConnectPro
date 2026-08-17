/**
 * SMS dispatch service.
 *
 * Two transports are supported:
 *   1. MSG91 (DLT-enabled transactional SMS + WebOTP OTP delivery)
 *   2. Console / JSONL log fallback (used when SMS_PROVIDER !== 'msg91' or
 *      when MSG91 credentials are missing / the gateway call fails).
 *
 * Every outbound SMS is ALWAYS logged to `backend/logs/sms.jsonl` so that
 * the flow remains fully testable in development without spending credits.
 */

const fs = require('fs');
const path = require('path');

const LOG_DIR = path.join(__dirname, '..', 'logs');
const LOG_FILE = path.join(LOG_DIR, 'sms.jsonl');

const PROVIDER = process.env.SMS_PROVIDER || 'log'; // 'msg91' | 'log'
const MSG91_AUTH_KEY = process.env.MSG91_AUTH_KEY;
const MSG91_SENDER_ID = process.env.MSG91_SENDER_ID || 'PRSNCT';
const MSG91_OTP_TEMPLATE_ID = process.env.MSG91_OTP_TEMPLATE_ID;
const MSG91_SMS_FLOW_ID = process.env.MSG91_SMS_FLOW_ID; // DLT flow id for transaction messages
const SMS_OTP_DOMAIN = process.env.SMS_OTP_DOMAIN || ''; // e.g. 'family.example.com'

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

/** Normalize phone to MSG91 expected format (+91XXXXXXXXXX or 91XXXXXXXXXX). */
function normalizePhone(phone) {
  let p = String(phone || '').replace(/[^\d+]/g, '');
  if (p.startsWith('00')) p = '+' + p.slice(2);
  if (!p.startsWith('+')) p = '+' + p;
  return p.replace(/^(\+)91(\+)?/, '$191'); // collapse duplicate country prefixes
}

async function sendViaMsg91({ phone, message, kind }) {
  if (!MSG91_AUTH_KEY) {
    const err = new Error('MSG91_AUTH_KEY is not configured');
    err.code = 'SMS_CONFIG';
    throw err;
  }

  const country = /^\+91/.test(phone) ? '91' : (process.env.MSG91_COUNTRY || '91');
  const mobile = phone.replace(/^\+/, '');

  if (kind === 'otp') {
    // Parse the 6-digit code out of the WebOTP-formatted message so we can
    // hand it to MSG91's OTP endpoint explicitly.
    const match = (message || '').match(/\b\d{6}\b/);
    const otp = match ? match[0] : null;

    if (!MSG91_OTP_TEMPLATE_ID) {
      const err = new Error('MSG91_OTP_TEMPLATE_ID is not configured');
      err.code = 'SMS_CONFIG';
      throw err;
    }

    const params = new URLSearchParams({
      template_id: MSG91_OTP_TEMPLATE_ID,
      mobile,
      authkey: MSG91_AUTH_KEY,
      otp_expiry: String(process.env.SMS_OTP_EXPIRY_MINUTES || 5)
    });
    if (otp) params.set('otp', otp);
    if (SMS_OTP_DOMAIN) params.set('var', SMS_OTP_DOMAIN);

    const res = await fetch(`https://control.msg91.com/api/v5/otp?${params.toString()}`, { method: 'POST' });
    const body = await res.json().catch(() => ({}));
    if (!res.ok || (body.type !== 'success' && body.message !== 'Success')) {
      const err = new Error(`MSG91 OTP send failed: ${res.status} ${JSON.stringify(body)}`);
      err.code = 'SMS_GATEWAY';
      err.details = body;
      throw err;
    }
    return { provider: 'msg91', messageId: body.messageId || null, kind };
  }

  // Non-OTP transactional message via MSG91 flow / sendhttp API.
  if (MSG91_SMS_FLOW_ID) {
    const res = await fetch('https://control.msg91.com/api/v5/flow/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', authkey: MSG91_AUTH_KEY },
      body: JSON.stringify({
        flow_id: MSG91_SMS_FLOW_ID,
        sender: MSG91_SENDER_ID,
        mobiles: mobile,
        VAR1: message,
        route: 4,
        country
      })
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      const err = new Error(`MSG91 flow send failed: ${res.status} ${JSON.stringify(body)}`);
      err.code = 'SMS_GATEWAY';
      err.details = body;
      throw err;
    }
    return { provider: 'msg91', messageId: body.messageId || null, kind };
  }

  const res = await fetch('https://api.msg91.com/api/sendhttp.php', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      authkey: MSG91_AUTH_KEY,
      mobiles: mobile,
      message,
      sender: MSG91_SENDER_ID,
      route: '4',
      country
    }).toString()
  });
  const body = await res.text().catch(() => '');
  if (!/^\d{6}$/.test(body.trim())) {
    const err = new Error(`MSG91 sendhttp failed: ${res.status} ${body}`);
    err.code = 'SMS_GATEWAY';
    err.details = body;
    throw err;
  }
  return { provider: 'msg91', messageId: body.trim(), kind };
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
  // WebOTP requires the OTP + origin as the LAST line: "@<domain> <code>".
  // The origin must match the family-web page origin served over HTTPS (or
  // localhost/127.0.0.1 in dev). Without a configured domain the code still
  // appears on the final line so log-based testing can read it back.
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

  if (PROVIDER === 'msg91') {
    try {
      const result = await sendViaMsg91({ phone: entry.phone, message, kind });
      entry.transport = 'msg91';
      entry.messageId = result.messageId || null;
      entry.gatewayOk = true;
    } catch (err) {
      entry.transport = 'msg91_logged_fallback';
      entry.gatewayOk = false;
      entry.gatewayError = err.message;
      console.error(`[sms] MSG91 failed (fallback to log): ${err.message}`);
    }
  }

  appendLog(entry);
  consoleLog(entry);
  return { provider: entry.transport, loggedAt: new Date().toISOString(), messageId: entry.messageId || null };
}

module.exports = { sendSms, buildOtpMessage, normalizePhone };