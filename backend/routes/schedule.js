const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { readDb, updateDb } = require('../lib/db');
const { requireAuth } = require('../middleware/auth');
const { sendSuccess, sendError, asyncRoute } = require('../lib/response');
const { inScopeOf, scopeList, kioskScopeOf } = require('../lib/scoping');
const { sendSms, scheduledTemplateVars } = require('../lib/sms');
const { contactPhone, buildCallLink } = require('../lib/familySecurity');

const router = express.Router();

router.get('/', requireAuth, asyncRoute(async (req, res) => {
  let schedules = await readDb('schedule.json');
  // Inmate: only see own schedules
  if (req.auth.role === 'inmate') {
    schedules = schedules.filter((s) => s.inmateId === req.auth.inmateId);
  } else {
    schedules = await scopeList(req, schedules);
  }
  return sendSuccess(res, schedules);
}));

router.get('/slots/:kioskId/:date', requireAuth, asyncRoute(async (req, res) => {
  const { kioskId, date } = req.params;
  if (!kioskId || !date) return sendError(res, 'INVALID_REQUEST', 'kioskId and date are required', 400);

  const kiosks = await readDb('kiosks.json');
  const kiosk = kiosks.find((k) => k.kioskId === kioskId);
  if (!kiosk) return sendError(res, 'INVALID_REFERENCE', 'kioskId does not exist', 422);
  const callerKiosk = kioskScopeOf(req);
  if (callerKiosk && kioskId !== callerKiosk) {
    return sendError(res, 'FORBIDDEN', 'Cannot view slots for another kiosk', 403);
  }

  const schedules = await readDb('schedule.json');
  const booked = schedules.filter(
    (s) => s.kioskId === kioskId && s.date === date && s.status !== 'cancelled'
  ).map((s) => ({
    scheduleId: s.scheduleId,
    timeSlot: s.timeSlot,
    callType: s.callType,
    contactId: s.contactId,
    inmateId: s.inmateId
  }));

  return sendSuccess(res, { kioskId, date, bookedSlots: booked });
}));

router.post('/book', requireAuth, asyncRoute(async (req, res) => {
  const { inmateId, kioskId, contactId, date, timeSlot, callType } = req.body;
  if (!inmateId || !kioskId || !contactId || !date || !timeSlot) {
    return sendError(res, 'INVALID_REQUEST', 'inmateId, kioskId, contactId, date and timeSlot are required', 400);
  }

  const [inmates, contacts, kiosks] = await Promise.all([
    readDb('inmates.json'), readDb('contacts.json'), readDb('kiosks.json')
  ]);
  const inmate = inmates.find((i) => i.inmateId === inmateId);
  if (!inmate) return sendError(res, 'INVALID_REFERENCE', 'inmateId does not exist', 422);
  if (!(await inScopeOf(req, inmate))) {
    return sendError(res, 'FORBIDDEN', 'Cannot book a call for an inmate outside your kiosk/jail', 403);
  }
  if (!contacts.find((c) => c.contactId === contactId)) return sendError(res, 'INVALID_REFERENCE', 'contactId does not exist', 422);
  const kiosk = kiosks.find((k) => k.kioskId === kioskId);
  if (!kiosk) return sendError(res, 'INVALID_REFERENCE', 'kioskId does not exist', 422);
  const callerKiosk = kioskScopeOf(req);
  if (callerKiosk && kioskId !== callerKiosk) {
    return sendError(res, 'FORBIDDEN', 'Cannot book a call at another kiosk', 403);
  }

  const selectedDate = new Date(`${date}T00:00:00`);
  if (selectedDate < new Date(new Date().toISOString().slice(0, 10))) {
    return sendError(res, 'INVALID_DATE', 'Cannot schedule a call in the past', 422);
  }

  const schedules = await readDb('schedule.json');
  const conflict = schedules.find((s) => s.inmateId === inmateId && s.date === date && s.timeSlot === timeSlot && s.status !== 'cancelled');
  if (conflict) {
    return sendError(res, 'SLOT_CONFLICT', 'This inmate already has a booking at this time', 409);
  }

  const toMin = (t) => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };
  const requestedMin = toMin(timeSlot.split('-')[0].trim());
  const kioskBooked = schedules.filter(
    (s) => s.kioskId === kioskId && s.date === date && s.status !== 'cancelled'
  );
  for (const b of kioskBooked) {
    const bStart = toMin(b.timeSlot.split('-')[0].trim());
    const bEnd = toMin(b.timeSlot.split('-')[1].trim());
    if (requestedMin >= bStart - 9 && requestedMin <= bEnd + 9) {
      return sendError(res, 'BUFFER_CONFLICT', `Cannot book within 10 minutes of an existing slot (${b.timeSlot})`, 409);
    }
  }

  const newSchedule = {
    scheduleId: `SCH-${uuidv4().substring(0, 8).toUpperCase()}`,
    inmateId, contactId, kioskId, date, timeSlot,
    callType: callType || 'video', status: 'scheduled', createdAt: new Date().toISOString()
  };
  const linkToken = `L-${uuidv4().replace(/-/g, '').slice(0, 10).toUpperCase()}`;
  newSchedule.linkToken = linkToken;
  await updateDb('schedule.json', (s) => ({ data: [...s, newSchedule], result: newSchedule }));

  setImmediate(() => {
    (async () => {
      const contact = contacts.find((c) => c.contactId === contactId);
      const familyPhone = contactPhone(contact);
      if (!familyPhone) {
        console.warn('[schedule] contact has no phone — skipping booking SMS');
        return;
      }
      const prisons = await readDb('prisons.json');
      const prison = prisons.find((p) => p.prisonId === inmate.prisonId || p.prisonId === kiosk.prisonId);
      const jailName = prison?.name || 'the correctional facility';
      const inmateName = inmate.name || inmate.fullName || `${inmate.firstName || ''} ${inmate.lastName || ''}`.trim() || 'An inmate';
      const familyMemberName = contact.fullName || contact.name || 'Dear Member';
      const time = timeSlot.split('-')[0].trim();
      const callLink = buildCallLink(linkToken);
      const message =
        `Dear ${familyMemberName}, ${inmateName} has scheduled a ${newSchedule.callType} on ${date} at ${time}. ` +
        `Click the secure link below to join the call: ${callLink} ` +
        `Please do not share this link with anyone.`;
      await sendSms({
        phone: familyPhone,
        message,
        kind: 'scheduled',
        callId: newSchedule.scheduleId,
        templateVars: scheduledTemplateVars(familyMemberName, inmateName, newSchedule.callType, date, time, callLink)
      });
    })().catch((err) => {
      console.error('[schedule] booking SMS failed:', err.message);
    });
  });

  return sendSuccess(res, newSchedule, 201);
}));

router.delete('/cancel/:bookingId', requireAuth, asyncRoute(async (req, res) => {
  const existing = (await readDb('schedule.json')).find((s) => s.scheduleId === req.params.bookingId);
  if (!existing || !(await inScopeOf(req, existing))) {
    return sendError(res, 'NOT_FOUND', 'Booking not found', 404);
  }
  const deleted = await updateDb('schedule.json', (schedules) => {
    const idx = schedules.findIndex((s) => s.scheduleId === req.params.bookingId);
    if (idx === -1) return { data: schedules, result: null };
    schedules.splice(idx, 1);
    return { data: schedules, result: true };
  });
  if (!deleted) return sendError(res, 'NOT_FOUND', 'Booking not found', 404);
  return sendSuccess(res, { message: 'Booking cancelled successfully' });
}));

module.exports = router;
