const express = require('express');
const { readDb } = require('../lib/db');
const { requireAuth, requireRole } = require('../middleware/auth');
const { sendSuccess, sendError, asyncRoute } = require('../lib/response');
const { kioskScopeOf, inScopeOf } = require('../lib/scoping');

const router = express.Router();

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const DAY_MS = 86400000;
// A booked or in-flight call has no outcome yet, so it never enters the totals.
const PENDING_STATUSES = ['scheduled', 'ringing', 'connecting', 'active'];

// Billing/quality only ever make sense for a call that actually connected.
function talkSeconds(call) {
  const start = Date.parse(call.mediaConnectedAt || call.startTime || '');
  const end = Date.parse(call.endTime || '');
  if (Number.isFinite(start) && Number.isFinite(end) && end > start) return Math.round((end - start) / 1000);
  const minutes = Number(call.durationMinutes) || 0;
  return minutes > 0 ? Math.round(minutes * 60) : 0;
}

// Calls MIS report for exactly one kiosk. The kiosk id normally comes from the
// caller's own token, so a kiosk session can never read another device's numbers.
router.get('/calls', requireAuth, requireRole('admin', 'kiosk_admin', 'warden', 'super-admin', 'super_admin'), asyncRoute(async (req, res) => {
  const from = String(req.query.from || '').trim();
  const to = String(req.query.to || '').trim();
  if (!DATE_RE.test(from) || !DATE_RE.test(to)) {
    return sendError(res, 'INVALID_REQUEST', 'from and to are required as YYYY-MM-DD', 400);
  }
  if (from > to) return sendError(res, 'INVALID_REQUEST', 'from must not be after to', 400);

  const tokenKiosk = kioskScopeOf(req);
  const requested = String(req.query.kioskId || '').trim();
  const kioskId = tokenKiosk || requested;
  if (!kioskId) return sendError(res, 'INVALID_REQUEST', 'kioskId is required', 400);
  if (tokenKiosk && requested && requested !== tokenKiosk) {
    return sendError(res, 'FORBIDDEN', 'A kiosk can only report on itself', 403);
  }

  const kiosks = await readDb('kiosks.json');
  const kiosk = kiosks.find((k) => k.kioskId === kioskId);
  if (!kiosk || !(await inScopeOf(req, kiosk))) {
    return sendError(res, 'NOT_FOUND', 'Kiosk not found', 404);
  }

  // The kiosk picks its dates in its own timezone, so shift the day boundaries
  // by that offset - otherwise the first and last day are cut short.
  const rawOffset = Number(req.query.tzOffset);
  const tzOffset = Number.isFinite(rawOffset) ? Math.round(rawOffset) : 0;
  const startMs = Date.parse(`${from}T00:00:00Z`) - tzOffset * 60000;
  const endMs = Date.parse(`${to}T00:00:00Z`) + DAY_MS - tzOffset * 60000;

  const [calls, prisons] = await Promise.all([readDb('calls.json'), readDb('prisons.json')]);
  const inRange = calls.filter((c) => {
    if (c.kioskId !== kioskId) return false;
    if (PENDING_STATUSES.includes(c.status)) return false;
    const started = Date.parse(c.startTime || c.createdAt || '');
    return Number.isFinite(started) && started >= startMs && started < endMs;
  });

  const summary = {
    totalCalls: inRange.length,
    completed: 0,
    notAnswered: 0,
    forceEnded: 0,
    video: 0,
    audio: 0,
  };
  const talk = [];

  for (const call of inRange) {
    if (call.type === 'video') summary.video += 1;
    else if (call.type === 'audio') summary.audio += 1;

    if (call.status === 'completed') {
      if (call.endReason === 'warden_ended') summary.forceEnded += 1;
      else summary.completed += 1;
    } else {
      // missed / rejected / cancelled / failed / never finalized
      summary.notAnswered += 1;
    }

    const seconds = talkSeconds(call);
    if (seconds > 0) talk.push(seconds);
  }

  const totalTalkSeconds = talk.reduce((sum, s) => sum + s, 0);
  const longestSeconds = talk.reduce((max, s) => (s > max ? s : max), 0);
  const shortestSeconds = talk.reduce((min, s) => (s < min ? s : min), Number.MAX_SAFE_INTEGER);

  const prison = prisons.find((p) => p.prisonId === kiosk.prisonId);
  return sendSuccess(res, {
    kioskId,
    kioskName: kiosk.name || kiosk.location || kioskId,
    prisonName: (prison && prison.name) || '',
    from,
    to,
    summary,
    duration: {
      connectedCalls: talk.length,
      totalTalkSeconds,
      averageSeconds: talk.length ? Math.round(totalTalkSeconds / talk.length) : 0,
      longestSeconds,
      shortestSeconds: talk.length ? shortestSeconds : 0,
    },
  });
}));

module.exports = router;
