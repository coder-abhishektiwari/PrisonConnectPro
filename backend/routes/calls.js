const express = require('express');
const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');
const { readDb, updateDb } = require('../lib/db');
const { signAccessToken } = require('../lib/auth');
const { requireAuth, requireRole } = require('../middleware/auth');
const { sendSuccess, sendError, asyncRoute } = require('../lib/response');
const { inAdminScope, adminScopeFilter, inScopeOf, scopeList, kioskScopeOf } = require('../lib/scoping');
const { sendSms, otpTemplateVars, linkTemplateVars } = require('../lib/sms');
const { maskedPhone, contactPhone, buildLinkSms, buildCallLink } = require('../lib/familySecurity');
const { paginate } = require('../lib/paginate');

// ==================== CALL STATE MACHINE ====================
const CALL_STATES = ['scheduled', 'ringing', 'connecting', 'active', 'reconnecting', 'completed', 'failed', 'cancelled', 'rejected', 'missed'];
const TERMINAL_STATES = ['completed', 'failed', 'cancelled', 'rejected', 'missed'];
const ALLOWED_TRANSITIONS = {
  scheduled: ['ringing', 'cancelled'],
  ringing: ['connecting', 'missed', 'rejected', 'cancelled'],
  connecting: ['active', 'failed', 'cancelled'],
  active: ['reconnecting', 'completed', 'failed'],
  reconnecting: ['active', 'failed', 'completed'],
  completed: [], failed: [], cancelled: [], rejected: [], missed: []
};

/**
 * Complete a call record and charge the inmate's wallet in one shot (the
 * balance is ledger-derived and clamped at zero — never negative). Shared by
 * the /end endpoint AND the stale-active-call sweep so a kiosk killed
 * mid-call still gets billed (capped at the max duration) and never blocks
 * future calls with a stuck 'active' record.
 */

// ---- End-reason helpers ----

function buildEndReasonDescription(status, reason, call, neverConnected, extra) {
  // If kiosk sent a specific description, use it
  if (extra?.endReasonDescription) return extra.endReasonDescription;

  const familyStage = call.familyStage || extra?.familyStage || null;
  const linkSent = !!call.linkToken;
  const linkOpened = !!call.linkOpenedAt;
  const deviceVerified = !!call.deviceVerifiedAt;
  const otpVerified = !!call.otpVerifiedAt;
  const familyLeft = extra?.familyLeft || false;
  const deviceFailed = extra?.deviceVerifyFailed || false;
  const otpFailed = extra?.otpVerifyFailed || false;

  if (neverConnected) {
    // Inmate cancelled before call started
    if (reason === 'cancelled' || reason === 'kiosk_cancelled') {
      return 'Inmate cancelled the call before it started';
    }
    // Call was never picked up
    if (status === 'missed') {
      if (familyLeft) return 'Family member left the verification screen';
      if (otpFailed) return 'OTP verification failed';
      if (deviceFailed) return 'Device verification failed';
      if (!linkSent) return 'Call link was not sent to family member';
      if (linkSent && !linkOpened) return 'Family member did not open the call link';
      if (linkOpened && !deviceVerified) return 'Family member did not complete device verification';
      if (deviceVerified && !otpVerified) return 'Family member did not complete OTP verification';
      if (otpVerified) return 'Call media connection failed after verification';
      return 'Call was not answered';
    }
    if (status === 'rejected') return 'Call was rejected by family member';
    if (status === 'cancelled') return 'Call was cancelled';
    return 'Call did not connect';
  }

  // Connected calls
  if (reason === 'timeout') return 'Call ended — maximum duration reached';
  if (reason === 'sweep') return 'Call ended — session timed out (kiosk may have disconnected)';
  if (reason === 'completed') return 'Call completed successfully';
  if (reason === 'kiosk_cancelled') return 'Call ended by kiosk';
  if (reason === 'peer_left') return 'Other party left the call';
  if (reason === 'network_lost') return 'Call ended — network connection lost';
  if (reason === 'webrtc_failed') return 'Call ended — media connection failed';
  return 'Call ended';
}

function buildCallIssues(call, neverConnected, extra) {
  const issues = [];
  if (neverConnected) return issues;

  const hasAudio = extra?.hasAudio ?? true;
  const hasVideo = extra?.hasVideo ?? true;
  const familyAudio = extra?.familyAudioConnected ?? true;
  const familyVideo = extra?.familyVideoConnected ?? true;
  const inmateAudio = extra?.inmateAudioConnected ?? true;
  const inmateVideo = extra?.inmateVideoConnected ?? true;
  const resolution = extra?.resolution || null;
  const packetLoss = extra?.packetLoss || call.packetLoss || 0;
  const jitter = extra?.jitter || call.jitter || 0;
  const bitrate = extra?.bitrate || call.bitrate || 0;

  if (!hasAudio) issues.push({ type: 'audio', description: 'Audio was not connected', severity: 'critical' });
  if (!hasVideo) issues.push({ type: 'video', description: 'Video was not connected', severity: 'critical' });
  if (!familyAudio) issues.push({ type: 'family_audio', description: 'Family member audio not connected', severity: 'major' });
  if (!inmateAudio) issues.push({ type: 'inmate_audio', description: 'Inmate audio not connected', severity: 'major' });
  if (!familyVideo) issues.push({ type: 'family_video', description: 'Family member video not connected', severity: 'major' });
  if (!inmateVideo) issues.push({ type: 'inmate_video', description: 'Inmate video not connected', severity: 'major' });
  if (resolution && resolution !== '1080p') issues.push({ type: 'resolution', description: `Call connected at ${resolution} instead of 1080p`, severity: 'minor' });
  if (packetLoss > 5) issues.push({ type: 'packet_loss', description: `High packet loss: ${packetLoss}%`, severity: packetLoss > 15 ? 'critical' : 'major' });
  if (jitter > 50) issues.push({ type: 'jitter', description: `High jitter: ${jitter}ms`, severity: jitter > 100 ? 'critical' : 'major' });
  if (extra?.iceFailed) issues.push({ type: 'ice', description: 'ICE connection failed — NAT traversal issue', severity: 'critical' });
  if (extra?.dtlsFailed) issues.push({ type: 'dtls', description: 'DTLS handshake failed', severity: 'critical' });
  if (extra?.signalingFailed) issues.push({ type: 'signaling', description: 'Signaling server connection failed', severity: 'critical' });

  return issues;
}

async function finalizeCall(call, requestedEndTimeMs, broadcastEvent, endReason, extraData) {
  const startMs = new Date(call.startTime).getTime();
  const maxMs = (Number(call.maxDurationMinutes) || 15) * 60000;

  // Billing starts from media connection, NOT from call creation.
  // If media never connected (family left in lobby), charge is 0.
  const billingStartMs = call.mediaConnectedAt
    ? new Date(call.mediaConnectedAt).getTime()
    : startMs;
  const neverConnected = !call.mediaConnectedAt;

  // Determine actual status based on whether media ever connected
  let finalStatus = 'completed';
  let finalReason = endReason || null;
  if (neverConnected) {
    if (endReason === 'cancelled' || endReason === 'kiosk_cancelled') {
      finalStatus = 'cancelled';
    } else if (endReason === 'timeout' || endReason === 'sweep') {
      finalStatus = 'missed';
    } else if (endReason === 'rejected') {
      finalStatus = 'rejected';
    } else {
      finalStatus = 'missed';
      finalReason = finalReason || 'Call was not answered';
    }
  }

  // Human-readable end reason description
  const endReasonDescription = buildEndReasonDescription(finalStatus, finalReason, call, neverConnected, extraData);

  // Quality-related issues collected during the call
  const callIssues = buildCallIssues(call, neverConnected, extraData);

  // Quality: N/A if never connected, otherwise use reported quality
  let finalQuality = neverConnected ? 'N/A' : (call.connectionQuality || 'unknown');
  // If we have issues and quality is still 'good', downgrade based on issues
  if (!neverConnected && callIssues.length > 0 && finalQuality === 'good') {
    finalQuality = callIssues.some(i => i.severity === 'critical') ? 'poor' : 'fair';
  }

  // A call that outlived its max duration (kiosk died) is billed only up to
  // the cap — time after the app died must not be charged.
  const endMs = neverConnected
    ? billingStartMs  // No charge if never connected
    : Math.min(Math.max(requestedEndTimeMs, billingStartMs), billingStartMs + maxMs);
  const durationSec = Math.max(0, (endMs - billingStartMs) / 1000);
  const billedMinutes = Math.ceil(durationSec / 60);
  const ratePerMinute = Number(call.ratePerMinute) || 0;
  const chargeAmount = neverConnected ? 0 : +(billedMinutes * ratePerMinute).toFixed(2);

  const updatedCall = await updateDb('calls.json', (calls) => {
    const idx = calls.findIndex((c) => c.callId === call.callId);
    if (idx === -1) return { data: calls, result: null };
    calls[idx] = {
      ...calls[idx],
      status: finalStatus,
      endTime: new Date(endMs).toISOString(),
      durationMinutes: billedMinutes,
      chargeAmount,
      endReason: finalReason,
      endReasonDescription,
      callIssues,
      connectionQuality: finalQuality,
    };
    return { data: calls, result: calls[idx] };
  });
  if (!updatedCall) return null;

  if (chargeAmount > 0 && updatedCall.inmateId) {
    try {
      const inmates = await readDb('inmates.json');
      const inmate =
        inmates.find((i) => i.inmateId === updatedCall.inmateId) ||
        inmates.find((i) => i.assignedKioskId === updatedCall.inmateId) ||
        null;
      const wallets = await readDb('wallets.json');
      const wallet =
        wallets.find((w) => inmate?.walletId && w.walletId === inmate.walletId) ||
        wallets.find((w) => w.inmateId === updatedCall.inmateId) ||
        wallets.find((w) => w.inmateId === `INM-${updatedCall.inmateId}`) ||
        null;

      if (wallet) {
        await updateDb('transactions.json', (all) => {
          const tx = {
            transactionId: `TXN-${uuidv4().substring(0, 8).toUpperCase()}`,
            walletId: wallet.walletId,
            inmateId: updatedCall.inmateId,
            callId: updatedCall.callId,
            type: 'charge',
            amount: chargeAmount,
            currency: wallet.currency || 'INR',
            status: 'completed',
            description: `Call charge (${billedMinutes} min @ ₹${ratePerMinute}/min)`,
            timestamp: new Date().toISOString()
          };
          return { data: [...all, tx], result: tx };
        });
        await updateDb('wallets.json', (all) => {
          const idx = all.findIndex((w) => w.walletId === wallet.walletId);
          if (idx === -1) return { data: all, result: null };
          // Clamp at zero — never negative.
          all[idx].balance = Math.max(0, (Number(all[idx].balance) || 0) - chargeAmount);
          all[idx].totalSpent = (Number(all[idx].totalSpent) || 0) + chargeAmount;
          return { data: all, result: all[idx] };
        });
        console.log(`[wallet] charged ₹${chargeAmount} to ${wallet.walletId} for ${updatedCall.callId}`);
      } else {
        console.warn(`[wallet] no wallet found for inmate ${updatedCall.inmateId} — charge skipped`);
      }
    } catch (err) {
      // A failed deduction must never fail the call end itself.
      console.error('[wallet] deduction failed:', err.message);
    }
  }
  return updatedCall;
}

function createCallsRouter(broadcastEvent, signaling) {
  const router = express.Router();

  // ==================== CALL ROUTES ====================

  router.get('/', requireAuth, asyncRoute(async (req, res) => {
    let calls = await readDb('calls.json');
    // Inmate: only see own calls
    if (req.auth.role === 'inmate') {
      calls = calls.filter((c) => c.inmateId === req.auth.inmateId);
    } else if (req.auth.role === 'warden') {
      const wardens = await readDb('wardens.json');
      const warden = wardens.find((w) => w.wardenId === req.auth.sub);
      if (!warden) return sendError(res, 'NOT_FOUND', 'Warden profile not found', 404);
      const prisons = await readDb('prisons.json');
      const prisonIds = prisons
        .filter((p) => p.wardenId === warden.wardenId || p.prisonId === warden.prisonId)
        .map((p) => p.prisonId);
      const inmates = await readDb('inmates.json');
      const inmateIds = inmates.filter((i) => prisonIds.includes(i.prisonId)).map((i) => i.inmateId);
      calls = calls.filter((c) => inmateIds.includes(c.inmateId));
    } else {
      calls = calls.filter((c) => inAdminScope(req, c));
    }
    return sendSuccess(res, calls);
  }));

  router.get('/active', requireAuth, asyncRoute(async (req, res) => {
    let calls = await readDb('calls.json');
    if (req.auth.role === 'inmate') {
      calls = calls.filter((c) => c.inmateId === req.auth.inmateId);
    } else if (req.auth.role === 'warden') {
      const wardens = await readDb('wardens.json');
      const warden = wardens.find((w) => w.wardenId === req.auth.sub);
      if (!warden) return sendError(res, 'NOT_FOUND', 'Warden profile not found', 404);
      const prisons = await readDb('prisons.json');
      const prisonIds = prisons
        .filter((p) => p.wardenId === warden.wardenId || p.prisonId === warden.prisonId)
        .map((p) => p.prisonId);
      const inmates = await readDb('inmates.json');
      const inmateIds = inmates.filter((i) => prisonIds.includes(i.prisonId)).map((i) => i.inmateId);
      calls = calls.filter((c) => inmateIds.includes(c.inmateId));
    } else {
      calls = calls.filter((c) => inAdminScope(req, c));
    }
    const active = calls.filter((c) => c.status === 'active');
    const typeFilter = req.query.type;
    const filtered = (typeFilter && typeFilter !== 'all')
      ? active.filter((c) => c.type === typeFilter)
      : active;
    const result = await paginate({
      req, data: filtered,
      search: (c, q) =>
        (c.callId || '').toLowerCase().includes(q) ||
        (c.inmateName || '').toLowerCase().includes(q) ||
        (c.familyMemberName || '').toLowerCase().includes(q) ||
        (c.inmateId || '').toLowerCase().includes(q) ||
        (c.kioskId || '').toLowerCase().includes(q),
      searchFields: [],
    });
    return sendSuccess(res, result);
  }));

  router.get('/history', requireAuth, asyncRoute(async (req, res) => {
    let calls = await readDb('calls.json');
    const contacts = await readDb('contacts.json').catch(() => []);
    const contactName = (contactId, inmateId) => {
      // Only return a name if the contactId actually belongs to this inmate
      const inmateContacts = contacts.filter((c) => c.inmateId === inmateId);
      const exact = inmateContacts.find((c) => c.contactId === contactId);
      if (exact) return exact.fullName || null;
      // Not found — return null, caller will use familyMemberName or "Unknown"
      return null;
    };
    if (req.auth.role === 'inmate') {
      calls = calls.filter((c) => c.inmateId === req.auth.inmateId);
    } else if (req.auth.role === 'warden') {
      const wardens = await readDb('wardens.json');
      const warden = wardens.find((w) => w.wardenId === req.auth.sub);
      if (!warden) return sendError(res, 'NOT_FOUND', 'Warden profile not found', 404);
      const prisons = await readDb('prisons.json');
      const prisonIds = prisons
        .filter((p) => p.wardenId === warden.wardenId || p.prisonId === warden.prisonId)
        .map((p) => p.prisonId);
      const inmates = await readDb('inmates.json');
      const inmateIds = inmates.filter((i) => prisonIds.includes(i.prisonId)).map((i) => i.inmateId);
      calls = calls.filter((c) => inmateIds.includes(c.inmateId));
    } else {
      calls = calls.filter((c) => inAdminScope(req, c));
    }
    // Include terminal calls AND active calls (live ones show with badge)
    calls = calls.filter((c) => TERMINAL_STATES.includes(c.status) || c.status === 'active');

    // --- Search ---
    const search = (req.query.search || '').trim().toLowerCase();
    if (search) {
      calls = calls.filter((c) =>
        (c.callId || '').toLowerCase().includes(search) ||
        (c.inmateName || '').toLowerCase().includes(search) ||
        (c.familyMemberName || '').toLowerCase().includes(search) ||
        (c.kioskId || '').toLowerCase().includes(search) ||
        (c.inmateId || '').toLowerCase().includes(search)
      );
    }

    // --- Column Filters ---
    const typeFilter = req.query.type;
    if (typeFilter && typeFilter !== 'all') {
      calls = calls.filter((c) => c.type === typeFilter);
    }
    const statusFilterVal = req.query.status;
    if (statusFilterVal && statusFilterVal !== 'all') {
      calls = calls.filter((c) => c.status === statusFilterVal);
    }
    const kioskFilterVal = req.query.kioskId;
    if (kioskFilterVal && kioskFilterVal !== 'all') {
      calls = calls.filter((c) => c.kioskId === kioskFilterVal);
    }
    const qualityFilterVal = req.query.quality;
    if (qualityFilterVal && qualityFilterVal !== 'all') {
      calls = calls.filter((c) => (c.connectionQuality || 'unknown') === qualityFilterVal);
    }
    const recordingFilterVal = req.query.recording;
    const recordings = await readDb('recordings.json').catch(() => []);
    const recMap = {};
    recordings.forEach((r) => { recMap[r.callId] = r; });
    if (recordingFilterVal === 'yes') {
      calls = calls.filter((c) => recMap[c.callId]?.url);
    } else if (recordingFilterVal === 'no') {
      calls = calls.filter((c) => !recMap[c.callId]?.url);
    }

    // --- Date Range ---
    const dateFrom = req.query.dateFrom;
    const dateTo = req.query.dateTo;
    if (dateFrom) {
      const fromMs = new Date(dateFrom).getTime();
      if (!isNaN(fromMs)) calls = calls.filter((c) => new Date(c.startTime).getTime() >= fromMs);
    }
    if (dateTo) {
      const toMs = new Date(dateTo).getTime() + 86400000;
      if (!isNaN(toMs)) calls = calls.filter((c) => new Date(c.startTime).getTime() <= toMs);
    }

    // --- Sort ---
    const sortField = req.query.sortField || 'date';
    const sortDir = req.query.sortDir === 'asc' ? 1 : -1;
    calls.sort((a, b) => {
      if (sortField === 'duration') return sortDir * ((a.durationMinutes || 0) - (b.durationMinutes || 0));
      if (sortField === 'type') return sortDir * (a.type || '').localeCompare(b.type || '');
      return sortDir * (new Date(a.startTime || 0).getTime() - new Date(b.startTime || 0).getTime());
    });

    // --- Pagination ---
    const total = calls.length;
    const limit = Math.min(Math.max(parseInt(req.query.limit) || 20, 1), 100);
    const offset = Math.max(parseInt(req.query.offset) || 0, 0);
    const paged = calls.slice(offset, offset + limit).map((c) => ({
      ...c,
      contactName: contactName(c.contactId, c.inmateId) || c.familyMemberName || null
    }));

    return sendSuccess(res, { calls: paged, total, limit, offset });
  }));

  router.get('/scheduled/:id', requireAuth, asyncRoute(async (req, res) => {
    const { id } = req.params;
    const [schedules, inmates, contacts] = await Promise.all([
      readDb('schedule.json'), readDb('inmates.json'), readDb('contacts.json')
    ]);
    const inmate = inmates.find((i) => i.inmateId === id) ||
                   inmates.find((i) => i.assignedKioskId === id) ||
                   inmates.find((i) => i.prisonerNumber === id);
    if (!inmate || !(await inScopeOf(req, inmate))) {
      return sendError(res, 'NOT_FOUND', 'Inmate not found in your kiosk/jail', 404);
    }
    const matches = schedules.filter((s) => s.inmateId === inmate.inmateId);
    const scoped = await scopeList(req, matches);
    const contactName = (contactId, inmateId) => {
      const inmateContacts = contacts.filter((c) => c.inmateId === inmateId);
      const exact = inmateContacts.find((c) => c.contactId === contactId);
      if (exact) return exact.fullName || null;
      return null;
    };
    // booking for TODAY stays visible until midnight (its slot may still be
    // current), everything else ages out by date.
    const today = new Date().toISOString().slice(0, 10);
    return sendSuccess(res, scoped
      .filter((s) => (s.status || 'scheduled') === 'scheduled' && (s.date || '') >= today)
      .sort((a, b) => `${a.date}${a.timeSlot}`.localeCompare(`${b.date}${b.timeSlot}`))
      .map((s) => ({ ...s, contactName: contactName(s.contactId, s.inmateId) || s.contactName || null })));
  }));

  router.get('/history/:id', requireAuth, asyncRoute(async (req, res) => {
    const { id } = req.params;
    const [calls, inmates, contacts] = await Promise.all([
      readDb('calls.json'), readDb('inmates.json'), readDb('contacts.json')
    ]);
    const inmate = inmates.find((i) => i.inmateId === id) ||
                   inmates.find((i) => i.assignedKioskId === id) ||
                   inmates.find((i) => i.prisonerNumber === id);
    if (!inmate || !(await inScopeOf(req, inmate))) {
      return sendError(res, 'NOT_FOUND', 'Inmate not found in your kiosk/jail', 404);
    }
    const matches = calls.filter((c) => c.inmateId === inmate.inmateId);
    const scoped = await scopeList(req, matches);
    const contactName = (contactId, inmateId) => {
      const inmateContacts = contacts.filter((c) => c.inmateId === inmateId);
      const exact = inmateContacts.find((c) => c.contactId === contactId);
      if (exact) return exact.fullName || null;
      return null;
    };
    const history = scoped
      .filter((c) => c.status === 'completed' && (c.mediaConnectedAt || c.durationMinutes > 0))
      .sort((a, b) => new Date(b.startTime || 0) - new Date(a.startTime || 0))
      .map((c) => ({ ...c, contactName: contactName(c.contactId, c.inmateId) || c.familyMemberName || null }));
    return sendSuccess(res, history);
  }));

  router.get('/:callId', requireAuth, asyncRoute(async (req, res) => {
    const calls = await readDb('calls.json');
    const call = calls.find((c) => c.callId === req.params.callId);
    if (!call) return sendError(res, 'NOT_FOUND', 'Call not found', 404);
    // Wardens, jail admins and kiosk admins can only view calls within their scope.
    if (!inAdminScope(req, call)) {
      return sendError(res, 'NOT_FOUND', 'Call not found', 404);
    }
    return sendSuccess(res, call);
  }));

  router.post('/', requireAuth, asyncRoute(async (req, res) => {
    const callData = (req.body && typeof req.body === 'object') ? req.body : {};
    if (!callData.inmateId || !callData.contactId || !callData.kioskId) {
      return sendError(res, 'INVALID_REQUEST', 'inmateId, contactId and kioskId are required', 400);
    }

    const [inmates, contacts, kiosks, existingCalls, scheduleDocs] = await Promise.all([
      readDb('inmates.json'), readDb('contacts.json'), readDb('kiosks.json'), readDb('calls.json'), readDb('schedule.json')
    ]);
    // Scheduled call: reuse the link token that was already texted to the
    // family at booking time — no duplicate link SMS, no new link.
    const bookedSchedule = callData.scheduleId
      ? scheduleDocs.find((s) => s.scheduleId === callData.scheduleId && s.inmateId === callData.inmateId)
      : null;
    const scheduledLinkToken = bookedSchedule?.linkToken || null;

    const inmate = inmates.find((i) => i.inmateId === callData.inmateId);
    if (!inmate) return sendError(res, 'INVALID_REFERENCE', 'inmateId does not exist', 422);
    // A kiosk-bound admin can only create calls for their own kiosk's inmates.
    if (!inAdminScope(req, inmate)) {
      return sendError(res, 'FORBIDDEN', 'Cannot create a call for an inmate outside your kiosk/jail', 403);
    }

    const contact = contacts.find((c) => c.contactId === callData.contactId);
    if (!contact) return sendError(res, 'INVALID_REFERENCE', 'contactId does not exist', 422);
    if (contact.inmateId && contact.inmateId !== callData.inmateId &&
        contact.inmateId !== `INM-${callData.inmateId}`) {
      return sendError(res, 'UNAUTHORIZED_CONTACT', 'Contact is not an approved contact for this inmate', 403);
    }

    const kiosk = kiosks.find((k) => k.kioskId === callData.kioskId);
    if (!kiosk) return sendError(res, 'INVALID_REFERENCE', 'kioskId does not exist', 422);
    const requestedKiosk = kioskScopeOf(req);
    if (requestedKiosk && kiosk.kioskId !== requestedKiosk) {
      return sendError(res, 'FORBIDDEN', 'Cannot create a call for another kiosk', 403);
    }
    if (kiosk.status === 'disabled' || kiosk.authorizationStatus !== 'authorized') {
      return sendError(res, 'KIOSK_UNAUTHORIZED', 'Kiosk is not authorized for calls', 403);
    }

    const alreadyActive = existingCalls.find((c) => c.inmateId === callData.inmateId && c.status === 'active');
    if (alreadyActive) {
      // Stale-active sweep: a call whose entire max duration (+2 min grace) has
      // elapsed can only be an orphan (kiosk killed mid-call, /end never ran).
      // Finalize it — billed up to the cap, wallet charged — then proceed, so
      // one dead record can never block every future call.
      const maxMs = (Number(alreadyActive.maxDurationMinutes) || 15) * 60000;
      const graceMs = 2 * 60000;
      const startMs = new Date(alreadyActive.startTime || Date.now()).getTime();
      if (Date.now() - startMs > maxMs + graceMs) {
        console.warn(`[calls] sweeping stale active call ${alreadyActive.callId}`);
        await finalizeCall(alreadyActive, startMs + maxMs, broadcastEvent, 'sweep');
      } else {
        return sendError(res, 'CALL_IN_PROGRESS', 'Inmate already has an active call', 409);
      }
    }

    // Family secure-call token material. A scheduled call reuses the token
    // already texted at booking time; an instant call mints a fresh one.
    const linkToken = scheduledLinkToken || `L-${Array.from(crypto.randomBytes(6), (b) => '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ'[b % 36]).join('')}`;
    const otp = String(crypto.randomInt(100000, 999999));

    const [settingsDocs, pricingDocs] = await Promise.all([readDb('settings.json'), readDb('pricing.json')]);
    const settings = settingsDocs?.[0] || {};
    const pricing = pricingDocs?.[0] || {};
    const ratePerMinute = pricing[callData.type || 'video']?.ratePerMinute ?? (callData.type === 'audio' ? 1.0 : 2.5);

    const newCall = {
      callId: callData.callId || `CALL-${uuidv4().substring(0, 8).toUpperCase()}`,
      roomId: callData.roomId || `ROOM-${uuidv4().substring(0, 8).toUpperCase()}`,
      inmateId: callData.inmateId, contactId: callData.contactId, kioskId: callData.kioskId,
      prisonId: kiosk.prisonId || inmate.prisonId || null,
      facility: kiosk.prisonId || inmate.prisonId || null,
      type: callData.type || 'video',
      // 'active' from the moment of creation: this is what powers the
      // CALL_IN_PROGRESS double-call guard. /end (or the stale sweep) moves it
      // to 'completed'.
      status: 'active',
      startTime: callData.startTime || new Date().toISOString(),
      mediaConnectedAt: null,  // Set when WebRTC media actually connects — billing starts from here
      endTime: null, durationMinutes: 0,
      recordingEnabled: callData.recordingEnabled !== undefined ? callData.recordingEnabled : true,
      recordingStatus: 'not_recording',
      connectionQuality: 'good', bitrate: 0, packetLoss: 0, jitter: 0, iceState: 'new',
      inmateName: callData.inmateName || inmate.name || inmate.fullName || `${inmate.firstName || ''} ${inmate.lastName || ''}`.trim() || 'An inmate',
      familyMemberName: callData.familyMemberName || '',
      roomIdLabel: callData.roomIdLabel || '',
      maxDurationMinutes: settings.callSettings?.maxCallDurationMinutes ?? 15,
      ratePerMinute,
      scheduledAt: callData.scheduledAt || callData.startTime || new Date().toISOString(),
      linkToken,
      otp,
      family: {
        doorwayCode: callData.doorwayCode || '', doorwayId: callData.doorwayId || '',
        deviceVerified: false, otpVerified: false, sessionToken: null
      }
    };

    // Room-bound signaling token for the kiosk so it can authenticate the
    // signaling socket (role 'kiosk') and join exactly this call's room.
    newCall.signalingToken = signAccessToken({
      sub: req.auth?.sub || newCall.kioskId,
      role: 'kiosk',
      callId: newCall.callId,
      roomId: newCall.roomId,
      kioskId: newCall.kioskId
    });

    // Public signaling URL for this deployment, handed to clients inside the
    // create-call response. The Android kiosk uses it at runtime so the APK
    // never needs rebuilding when the public signaling URL changes (e.g.
    // cloudflared quick tunnels get a fresh URL on every start.bat run).
    if (process.env.SIGNALING_PUBLIC_URL) {
      newCall.signalingUrl = process.env.SIGNALING_PUBLIC_URL;
    }

    await updateDb('calls.json', (calls) => ({ data: [...calls, newCall], result: newCall }));
    broadcastEvent('call-created', newCall);

    // Scheduled call launched from the dashboard: mark that booking completed so
    // it leaves the kiosk's "My Scheduled Calls" list immediately.
    if (callData.scheduleId) {
      try {
        await updateDb('schedule.json', (all) => {
          const idx = all.findIndex(
            (s) => s.scheduleId === callData.scheduleId && s.inmateId === callData.inmateId
          );
          if (idx === -1) return { data: all, result: null };
          all[idx] = {
            ...all[idx],
            status: 'completed',
            callId: newCall.callId,
            completedAt: new Date().toISOString()
          };
          return { data: all, result: all[idx] };
        });
      } catch (err) {
        console.warn('[calls] failed marking schedule completed:', err.message);
      }
    }

    // ==== FAMILY LINK SMS (background) ====
    // Dispatched AFTER the response is sent — SMS gateway latency must never
    // delay call setup on the kiosk. A scheduled call already texted the link
    // at booking time, so only OTP goes out for those (no duplicate cost).
    // Failures only log; they can never fail the call itself.
    if (!scheduledLinkToken) {
      setImmediate(() => {
        (async () => {
          const familyPhone = contactPhone(contact);
          if (!familyPhone) {
            console.warn('[calls] contact has no phone number — skipping family link SMS');
            return;
          }
          const prisons = await readDb('prisons.json');
          const prison = prisons.find((p) => p.prisonId === (kiosk.prisonId || inmate.prisonId));
          const jailName = prison?.name || 'the correctional facility';
          const familyMemberName = contact.fullName || contact.name || 'Dear Member';
          const callLink = buildCallLink(newCall.linkToken);
          const smsResult = await sendSms({
            phone: familyPhone,
            message: buildLinkSms(newCall),
            kind: 'link',
            callId: newCall.callId,
            templateVars: linkTemplateVars(familyMemberName, callLink)
          });
          await updateDb('calls.json', (calls) => {
            const idx = calls.findIndex((c) => c.callId === newCall.callId);
            if (idx === -1) return { data: calls, result: null };
            calls[idx].sms = {
              sent: true,
              sentTo: maskedPhone(familyPhone),
              linkToken: newCall.linkToken,
              linkUrl: callLink,
              transport: smsResult.provider,
              loggedAt: smsResult.loggedAt
            };
            return { data: calls, result: calls[idx] };
          });
        })().catch((err) => {
          console.error('[calls] family link SMS dispatch failed:', err.message);
        });
      });
    } else {
      console.log(`[calls] scheduled call ${newCall.callId} — link already sent at booking, skipping link SMS`);
    }

    return sendSuccess(res, newCall, 201);
  }));

  router.patch('/:callId', requireAuth, asyncRoute(async (req, res) => {
    const { callId } = req.params;
    const updates = req.body;

    const existing = (await readDb('calls.json')).find((c) => c.callId === callId);
    if (!existing || !inAdminScope(req, existing)) {
      return sendError(res, 'NOT_FOUND', 'Call not found', 404);
    }

    try {
      const updated = await updateDb('calls.json', (calls) => {
        const idx = calls.findIndex((c) => c.callId === callId);
        if (idx === -1) return { data: calls, result: null };

        // Prevent updates to terminal calls.
        if (TERMINAL_STATES.includes(calls[idx].status)) {
          const err = new Error(`Cannot update a call in terminal state '${calls[idx].status}'`);
          err.code = 'INVALID_STATE';
          throw err;
        }

        if (updates.status && updates.status !== calls[idx].status) {
          const allowed = ALLOWED_TRANSITIONS[calls[idx].status] || [];
          if (!allowed.includes(updates.status)) {
            const err = new Error(`Cannot transition call from '${calls[idx].status}' to '${updates.status}'`);
            err.code = 'INVALID_TRANSITION';
            throw err;
          }
          // Auto-set endTime and duration when entering a terminal state.
          if (TERMINAL_STATES.includes(updates.status)) {
            const startMs = new Date(calls[idx].startTime).getTime();
            updates.endTime = new Date().toISOString();
            updates.durationMinutes = Math.round((Date.now() - startMs) / 60000);
            // Run billing for terminal transitions (PATCH can end calls too)
            updates._needsBilling = true;
          }
        }

        calls[idx] = { ...calls[idx], ...updates };

        // Track when WebRTC media actually connects — billing starts from here, not from startTime
        if (updates.iceState === 'connected' && !calls[idx].mediaConnectedAt) {
          calls[idx].mediaConnectedAt = new Date().toISOString();
        }
        return { data: calls, result: calls[idx] };
      });

      if (!updated) return sendError(res, 'NOT_FOUND', 'Call not found', 404);
      // Run billing if this PATCH transitioned the call to a terminal state.
      if (updated._needsBilling) {
        delete updated._needsBilling;
        const billed = await finalizeCall(updated, Date.now(), broadcastEvent, updated.status);
        if (billed) updated.chargeAmount = billed.chargeAmount;
      }
      broadcastEvent('call-updated', updated);
      return sendSuccess(res, updated);
    } catch (err) {
      if (err.code === 'INVALID_TRANSITION' || err.code === 'INVALID_STATE') return sendError(res, err.code, err.message, 409);
      throw err;
    }
  }));

  router.post('/:callId/end', requireAuth, asyncRoute(async (req, res) => {
    const { callId } = req.params;
    const extra = req.body && typeof req.body === 'object' ? req.body : {};

    const existing = (await readDb('calls.json')).find((c) => c.callId === callId);
    if (!existing || !inAdminScope(req, existing)) {
      return sendError(res, 'NOT_FOUND', 'Call not found', 404);
    }

    const updatedCall = await finalizeCall(existing, Date.now(), broadcastEvent, extra.endReason || 'completed', extra);
    if (!updatedCall) return sendError(res, 'NOT_FOUND', 'Call not found', 404);


    await updateDb('recordings.json', (recordings) => {
      const idx = recordings.findIndex((r) => r.callId === callId);
      if (idx === -1) return { data: recordings, result: null };
      recordings[idx] = {
        ...recordings[idx],
        status: 'completed',
        endTime: new Date().toISOString(),
        duration: updatedCall.durationMinutes * 60
      };
      return { data: recordings, result: recordings[idx] };
    });

    // Close the media room on the signaling server so live media stops (best effort).
    try {
      if (updatedCall.roomId) {
        await signaling('POST', `/api/rooms/${encodeURIComponent(updatedCall.roomId)}/close`, { reason: 'call ended' });
      }
    } catch (err) {
      if (err.code !== 'SIGNALING_ERROR' && err.code !== 'MEDIA_CONFIG') throw err;
    }
    // Remove stale room membership so the room frees up for the next call.
    await updateDb('rooms.json', (rooms) => {
      const room = rooms.find((r) => r.callId === callId);
      if (!room) return { data: rooms, result: null };
      room.status = 'idle';
      room.participants = [];
      room.participantCount = 0;
      room.activeCallId = null;
      return { data: rooms, result: room };
    });

    broadcastEvent('call-ended', { callId, status: 'completed' });
    return sendSuccess(res, updatedCall);
  }));

  router.post('/:callId/control', requireAuth, requireRole('admin', 'warden'), asyncRoute(async (req, res) => {
    const { callId } = req.params;
    const { action, target } = req.body;

    const allowedActions = ['mute', 'unmute', 'hangup', 'disable-camera', 'enable-camera'];
    if (!action || !allowedActions.includes(action)) {
      return sendError(res, 'INVALID_ACTION', `Action must be one of: ${allowedActions.join(', ')}`, 400);
    }

    const calls = await readDb('calls.json');
    const call = calls.find((c) => c.callId === callId);
    if (!call) return sendError(res, 'NOT_FOUND', 'Call not found', 404);
    // Control actions (mute/hangup) must be scoped to the operator's jail/kiosk.
    if (!inAdminScope(req, call)) return sendError(res, 'NOT_FOUND', 'Call not found', 404);

    // Apply the control action on the media room via the signaling server.
    if (call.roomId) {
      try {
        await signaling('POST', `/api/rooms/${encodeURIComponent(call.roomId)}/control`, { action, target: target || null });
      } catch (err) {
        console.error('[calls] signaling control failed:', err.message);
        return sendError(res, 'SIGNALING_ERROR', `Signaling server unavailable: ${err.message}`, 502);
      }
    }

    const controlEvent = { callId, action, target, timestamp: new Date().toISOString(), appliedBy: req.auth?.sub || 'unknown' };
    broadcastEvent('call-control', controlEvent);
    return sendSuccess(res, controlEvent);
  }));

  return router;
}

/**
 * Periodic sweep: finalize any active calls that exceeded their max duration
 * + 2 min grace. Prevents phantom "live" calls on the dashboard when a kiosk
 * crashes mid-call and /end never fires.
 */
async function sweepStaleCalls(broadcastEvent) {
  try {
    const calls = await readDb('calls.json');
    const now = Date.now();
    let swept = 0;

    for (const call of calls) {
      if (call.status !== 'active') continue;
      const maxMs = (Number(call.maxDurationMinutes) || 15) * 60000;
      const graceMs = 2 * 60000;
      const startMs = new Date(call.startTime || Date.now()).getTime();
      if (now - startMs > maxMs + graceMs) {
        console.warn(`[calls] periodic sweep: finalizing stale call ${call.callId}`);
        await finalizeCall(call, startMs + maxMs, broadcastEvent, 'sweep');
        swept++;
      }
    }
    if (swept > 0) console.log(`[calls] periodic sweep finalized ${swept} stale call(s)`);
  } catch (err) {
    console.error('[calls] periodic sweep failed:', err.message);
  }
}

module.exports = createCallsRouter;
module.exports.sweepStaleCalls = sweepStaleCalls;
