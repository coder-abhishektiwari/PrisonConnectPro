/**
 * SMS dispatch service — DLT-compliant Fast2SMS integration.
 *
 * All SMS (OTP + call link + scheduled) are sent via the official DLT route
 * (POST /dev/bulkV2, route: "dlt").  Quick-SMS fallback is intentionally
 * removed per requirements.
 *
 * DLT templates use {#VAR#} placeholders; the caller supplies the actual
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
const FAST2SMS_SCHEDULED_TEMPLATE_ID = process.env.FAST2SMS_SCHEDULED_TEMPLATE_ID || '';
const SMS_OTP_DOMAIN = process.env.SMS_OTP_DOMAIN || '';

console.log(
  `[sms] provider=${PROVIDER} hasKey=${!!FAST2SMS_API_KEY} ` +
  `sender=${FAST2SMS_SENDER_ID || '(none)'} entity=${FAST2SMS_ENTITY_ID || '(none)'} ` +
  `otpTpl=${FAST2SMS_OTP_TEMPLATE_ID || '(none)'} linkTpl=${FAST2SMS_LINK_TEMPLATE_ID || '(none)'} ` +
  `schedTpl=${FAST2SMS_SCHEDULED_TEMPLATE_ID || '(none)'}`
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
  const { phone, message, kind } = entry;
  console.log(`[sms:${entry.transport}:${kind}] -> ${phone}`);
  console.log(`[sms:${kind}:message] ${message}`);
  if (entry.templateVars) {
    console.log(`[sms:${kind}:vars] ${JSON.stringify(entry.templateVars)}`);
  }
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
 * @param {string[]} opts.templateVars    Pipe-separated values for {#VAR#} placeholders
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
 * Call Link SMS — 2 variables.
 *
 * Template:
 *   "Dear {#VAR#},
 *    Your secure video call with DSS Solutions has been scheduled.
 *    Click the secure link below to join your video call: {#VAR#}
 *    This link is valid for one session only. Please do not share it with anyone.
 *    Regards, DSS Solutions"
 *
 * @param {string} familyMemberName  Name of the person receiving the SMS
 * @param {string} linkUrl           Full call link URL
 * @returns {string[]}
 */
function linkTemplateVars(familyMemberName, linkUrl) {
  return [familyMemberName || 'Dear Member', linkUrl];
}

/**
 * OTP SMS — 2 variables (same OTP twice: display + WebOTP).
 *
 * Template:
 *   "Your OTP to join the call is {#VAR#}. Do not share this OTP with anyone.
 *    @prisonconnect-familyweb.onrender.com #{#VAR#}"
 *
 * @param {string|number} otp
 * @returns {string[]}
 */
function otpTemplateVars(otp) {
  const code = String(otp);
  return [code, code];
}

/**
 * Scheduled Call SMS — 6 variables.
 *
 * Template:
 *   "Dear {#VAR#},
 *    {#VAR#} has scheduled a {#VAR#} on {#VAR#} at {#VAR#}.
 *    Click the secure link below to join the call: {#VAR#}
 *    Please do not share this link with anyone. This link is valid for one time only.
 *    Regards, DSS Solutions"
 *
 * @param {string} familyMemberName
 * @param {string} inmateName
 * @param {string} callType
 * @param {string} date
 * @param {string} time       24hr format time
 * @param {string} linkUrl
 * @returns {string[]}
 */
function scheduledTemplateVars(familyMemberName, inmateName, callType, date, time, linkUrl) {
  return [
    familyMemberName || 'Dear Member',
    inmateName || 'An inmate',
    callType || 'video',
    date || '',
    time || '',
    linkUrl,
  ];
}

// ─── Public send interface ─────────────────────────────────────────────────────

/**
 * Preview what the SMS will look like (for logging/debugging).
 */
function previewSms(kind, vars) {
  if (kind === 'link' && vars.length >= 2) {
    return `Dear ${vars[0]}, Your secure video call with DSS Solutions has been scheduled. Click the secure link below to join your video call: ${vars[1]} This link is valid for one session only.`;
  }
  if (kind === 'otp' && vars.length >= 1) {
    return `Your OTP to join the call is ${vars[0]}. Do not share this OTP with anyone. @prisonconnect-familyweb.onrender.com #${vars[1] || vars[0]}`;
  }
  if (kind === 'scheduled' && vars.length >= 6) {
    return `Dear ${vars[0]}, ${vars[1]} has scheduled a ${vars[2]} on ${vars[3]} at ${vars[4]}. Click the secure link below to join the call: ${vars[5]} Please do not share this link with anyone.`;
  }
  return null;
}

/**
 * Send an SMS.
 *
 * @param {object}   opts
 * @param {string}   opts.phone         Recipient 10-digit mobile.
 * @param {string}   opts.message       Human-readable text (used for logging only).
 * @param {string}   [opts.kind]        'otp' | 'link' | 'scheduled' | 'generic' — selects the DLT template.
 * @param {string}   [opts.callId]      Audit reference.
 * @param {string[]} [opts.templateVars] Values for {#VAR#} in the DLT template.
 * @returns {Promise<{provider: string, loggedAt: string, messageId?: string|null}>}
 */
async function sendSms({ phone, message, kind = 'generic', callId = null, templateVars }) {
  const entry = {
    kind,
    phone: normalizePhone(phone),
    message,
    callId,
    templateVars,
    transport: 'log',
  };

  if (PROVIDER === 'fast2sms') {
    // Log preview of what the family member will receive
    const preview = previewSms(kind, templateVars || []);
    if (preview) {
      console.log(`[sms:${kind}:preview] >>> FAMILY MEMBER WILL RECEIVE:`);
      console.log(`[sms:${kind}:preview] ${preview}`);
    }
    console.log(`[sms:${kind}:vars] variables_values = "${(templateVars || []).join('|')}"`);

    const templateMap = {
      otp: FAST2SMS_OTP_TEMPLATE_ID,
      link: FAST2SMS_LINK_TEMPLATE_ID,
      scheduled: FAST2SMS_SCHEDULED_TEMPLATE_ID,
    };
    const templateId = templateMap[kind] || FAST2SMS_LINK_TEMPLATE_ID;

    if (!templateId) {
      const errMsg = `No DLT template ID for kind="${kind}" — set FAST2SMS_OTP_TEMPLATE_ID, FAST2SMS_LINK_TEMPLATE_ID, or FAST2SMS_SCHEDULED_TEMPLATE_ID`;
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
  scheduledTemplateVars,
  normalizePhone,
  PROVIDER,
};
