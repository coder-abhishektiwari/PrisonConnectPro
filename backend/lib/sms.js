/**
 * SMS dispatch service — DLT-compliant Fast2SMS integration.
 *
 * All SMS (OTP + call link) are sent via the official DLT route
 * (POST /dev/bulkV2, route: "dlt").  Quick-SMS fallback is intentionally
 * removed per requirements.
 *
 * DLT templates use {#var#} placeholders; the caller supplies the actual
 * values through the `templateVars` parameter on `sendSms()`.
 *
 * Every outbound SMS is ALWAYS logged to `backend/logs/sms.jsonl` so that
 * the flow remains fully testable in development without spending credits.
 */

const fs = require('fs');
const path = require('path');

const LOG_DIR = path.join(__dirname, '..', 'logs');
const LOG_FILE = path.join(LOG_DIR, 'sms.jsonl');

// ─── ENV configuration ────────────────────────────────────────────────────────
const PROVIDER = process.env.SMS_PROVIDER || 'log';
const FAST2SMS_API_KEY = process.env.FAST2SMS_API_KEY;
const FAST2SMS_SENDER_ID = process.env.FAST2SMS_SENDER_ID || '';
const FAST2SMS_ENTITY_ID = process.env.FAST2SMS_ENTITY_ID || '';
const FAST2SMS_OTP_TEMPLATE_ID = process.env.FAST2SMS_OTP_TEMPLATE_ID || '';
const FAST2SMS_LINK_TEMPLATE_ID = process.env.FAST2SMS_LINK_TEMPLATE_ID || '';
const SMS_OTP_DOMAIN = process.env.SMS_OTP_DOMAIN || '';

console.log(
  `[sms] provider=${PROVIDER} hasKey=${!!FAST2SMS_API_KEY} ` +
  `sender=${FAST2SMS_SENDER_ID || '(none)'} entity=${FAST2SMS_ENTITY_ID || '(none)'} ` +
  `otpTpl=${FAST2SMS_OTP_TEMPLATE_ID || '(none)'} linkTpl=${FAST2SMS_LINK_TEMPLATE_ID || '(none)'}`
);

// ─── Helpers ──────────────────────────────────────────────────────────────────

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
  if (p.length === 12 && p.startsWith('91')) p = p.slice(2);
  if (p.length === 11 && p.startsWith('0')) p = p.slice(1);
  return p;
}

// ─── DLT SMS sender ───────────────────────────────────────────────────────────

/**
 * Send SMS via Fast2SMS DLT route.
 *
 * @param {object} opts
 * @param {string}   opts.phone           10-digit mobile
 * @param {string|number} opts.templateId DLT Message_ID (numeric string or int)
 * @param {string[]} opts.templateVars    Pipe-separated values for {#var#} placeholders
 * @returns {Promise<{provider: string, messageId: string|null}>}
 */
async function sendViaDlt({ phone, templateId, templateVars }) {
  if (!FAST2SMS_API_KEY) {
    throw new Error('FAST2SMS_API_KEY is not configured');
  }
  if (!FAST2SMS_SENDER_ID) {
    throw new Error('FAST2SMS_SENDER_ID is not configured — add it in Render env');
  }
  if (!templateId) {
    throw new Error('DLT Template ID (message) is not configured');
  }

  const mobile = normalizePhone(phone);
  const varsJoined = (templateVars || []).join('|');

  const payload = {
    sender_id: FAST2SMS_SENDER_ID,
    message: Number(templateId),
    variables_values: varsJoined,
    route: 'dlt',
    numbers: mobile,
  };

  // entity_id is optional — include only when set
  if (FAST2SMS_ENTITY_ID) {
    payload.entity_id = FAST2SMS_ENTITY_ID;
  }

  console.log(
    `[sms] dlt send phone=${mobile} tplId=${templateId} ` +
    `vars="${varsJoined}" sender=${FAST2SMS_SENDER_ID}`
  );

  const res = await fetch('https://www.fast2sms.com/dev/bulkV2', {
    method: 'POST',
    headers: {
      'authorization': FAST2SMS_API_KEY,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  const body = await res.json().catch(() => ({}));
  console.log(`[sms] dlt response: status=${res.status} return=${body.return} body=`, JSON.stringify(body));

  if (!res.ok || body.return !== true) {
    const err = new Error(`Fast2SMS DLT failed: ${res.status} ${JSON.stringify(body)}`);
    err.code = 'SMS_GATEWAY';
    err.details = body;
    throw err;
  }

  return { provider: 'fast2sms', messageId: body.request_id || null };
}

// ─── Template variable builders ────────────────────────────────────────────────

/**
 * Build template variables for the OTP DLT template.
 * Expected DLT template: "Your PrisonConnect verification code is {#var#}. …"
 *
 * @param {string|number} otp  6-digit OTP
 * @returns {string[]}        Array for pipe-join
 */
function otpTemplateVars(otp) {
  return [String(otp)];
}

/**
 * Build template variables for the call-link DLT template.
 * Expected DLT template:
 *   "[PrisonConnect] You have an incoming video call from {#var#}.
 *    Open this secure link to join: {#var#}"
 *
 * @param {string} inmateName
 * @param {string} linkUrl
 * @returns {string[]}
 */
function linkTemplateVars(inmateName, linkUrl) {
  return [inmateName || 'an inmate', linkUrl];
}

// ─── Public send interface ─────────────────────────────────────────────────────

/**
 * Send an SMS.
 *
 * @param {object}   opts
 * @param {string}   opts.phone         Recipient 10-digit mobile.
 * @param {string}   opts.message       Human-readable text (used for logging only).
 * @param {string}   [opts.kind]        'otp' | 'link' | 'generic' — selects the DLT template.
 * @param {string}   [opts.callId]      Audit reference.
 * @param {string[]} [opts.templateVars] Pipe-separated values for {#var#} in the DLT template.
 * @returns {Promise<{provider: string, loggedAt: string, messageId?: string|null}>}
 */
async function sendSms({ phone, message, kind = 'generic', callId = null, templateVars }) {
  const entry = {
    kind,
    phone: normalizePhone(phone),
    message,
    callId,
    transport: 'log',
  };

  if (PROVIDER === 'fast2sms') {
    // Select the DLT template ID based on message kind
    const templateId = kind === 'otp'
      ? FAST2SMS_OTP_TEMPLATE_ID
      : FAST2SMS_LINK_TEMPLATE_ID;

    if (!templateId) {
      const errMsg = `No DLT template ID for kind="${kind}" — set FAST2SMS_OTP_TEMPLATE_ID or FAST2SMS_LINK_TEMPLATE_ID`;
      entry.transport = 'fast2sms_error';
      entry.gatewayOk = false;
      entry.gatewayError = errMsg;
      console.error(`[sms] ${errMsg}`);
    } else if (!templateVars || !templateVars.length) {
      const errMsg = `templateVars required for DLT SMS (kind="${kind}")`;
      entry.transport = 'fast2sms_error';
      entry.gatewayOk = false;
      entry.gatewayError = errMsg;
      console.error(`[sms] ${errMsg}`);
    } else {
      try {
        const result = await sendViaDlt({
          phone: entry.phone,
          templateId,
          templateVars,
        });
        entry.transport = 'fast2sms';
        entry.messageId = result.messageId || null;
        entry.gatewayOk = true;
      } catch (err) {
        entry.transport = 'fast2sms_logged_fallback';
        entry.gatewayOk = false;
        entry.gatewayError = err.message;
        console.error(`[sms] Fast2SMS DLT failed (logged): ${err.message}`);
      }
    }
  }

  appendLog(entry);
  consoleLog(entry);
  return {
    provider: entry.transport,
    loggedAt: new Date().toISOString(),
    messageId: entry.messageId || null,
  };
}

module.exports = {
  sendSms,
  otpTemplateVars,
  linkTemplateVars,
  normalizePhone,
  PROVIDER,
};
