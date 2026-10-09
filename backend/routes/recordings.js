const express = require('express');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const { readDb, updateDb } = require('../lib/db');
const { requireAuth, requireRole } = require('../middleware/auth');
const { sendSuccess, sendError, asyncRoute } = require('../lib/response');
const { inAdminScope, kioskScopeOf, inScopeOf, scopeList } = require('../lib/scoping');
const { saveUploadedRecording, saveUploadedRecordingFromPath, recordingFileOf, RECORDINGS_DIR } = require('../lib/recorder');

const router = express.Router();

// ============ chunked, resumable kiosk upload (recordings/.uploads/<id>) ============
const UPLOADS_DIR = path.join(RECORDINGS_DIR, '.uploads');
const CHUNK_MAX_BYTES = 5 * 1024 * 1024;
const RECORDING_MAX_BYTES = 512 * 1024 * 1024;
const PARTIAL_TTL_MS = 7 * 24 * 60 * 60 * 1000;

// Chunks of one upload must be appended strictly in order; this serialises them.
const chunkLocks = new Map();

// The kiosk uploads with whichever session is live on the device: at call
// time that is the inmate PIN session (role 'inmate' + kioskId claim), but a
// kiosk operator/admin session is equally valid for the same device.
const KIOSK_UPLOAD_ROLES = ['admin', 'warden', 'kiosk', 'kiosk_admin', 'inmate'];

// ============ on-demand retrieval: kiosk master -> backend temp copy ============
// The kiosk keeps the encrypted master copy; a warden's Play click pulls a
// temporary copy into the backend, which is TTL-deleted afterwards so Render's
// disk never accumulates recordings (the master stays on the device).
const KIOSK_COPY_TTL_MS = (Number(process.env.RECORDING_TEMP_TTL_HOURS) > 0
  ? Number(process.env.RECORDING_TEMP_TTL_HOURS)
  : 24) * 60 * 60 * 1000;
// Same grace the devices page uses: 4 missed 30s heartbeats = offline.
const KIOSK_ONLINE_GRACE_MS = 4 * 30 * 1000;
// A retrieve request the kiosk never acted on stops counting as in-flight.
const RETRIEVE_REQUEST_TTL_MS = 30 * 60 * 1000;

async function findKioskOnline(kioskId) {
  if (!kioskId) return false;
  const kiosks = await readDb('kiosks.json');
  const kiosk = kiosks.find((k) => k.kioskId === kioskId);
  const beat = kiosk && kiosk.lastHeartbeatAt ? Date.parse(kiosk.lastHeartbeatAt) : NaN;
  return Number.isFinite(beat) && Date.now() - beat <= KIOSK_ONLINE_GRACE_MS;
}

function kioskCopyExpired(rec) {
  const exp = rec && rec.retrieval && rec.retrieval.expiresAt
    ? Date.parse(rec.retrieval.expiresAt)
    : NaN;
  return Number.isFinite(exp) && Date.now() > exp;
}

/** Flip a requested retrieval to 'transferring' once bytes start landing. */
async function markRetrievalTransferring(callId) {
  await updateDb('recordings.json', (all) => {
    const idx = all.findIndex((r) => r.callId === callId && r.storage === 'kiosk');
    if (idx === -1 || !all[idx].retrieval || all[idx].retrieval.status !== 'requested') {
      return { data: all, result: null };
    }
    all[idx] = {
      ...all[idx],
      retrieval: { ...all[idx].retrieval, status: 'transferring', startedAt: new Date().toISOString() }
    };
    return { data: all, result: all[idx] };
  });
}

/** Best-effort progress of an in-flight chunked upload for a call. */
async function findUploadMetaForCall(callId) {
  try {
    const entries = await fs.promises.readdir(UPLOADS_DIR);
    for (const id of entries) {
      const meta = await readUploadMeta(id);
      if (meta && meta.callId === callId) {
        const st = await fs.promises.stat(uploadPartPath(id)).catch(() => null);
        return { ...meta, receivedBytes: st ? st.size : 0 };
      }
    }
  } catch (err) {
    // No upload sessions yet.
  }
  return null;
}

function uploadDir(uploadId) {
  return path.join(UPLOADS_DIR, uploadId);
}

function uploadMetaPath(uploadId) {
  return path.join(uploadDir(uploadId), 'meta.json');
}

function uploadPartPath(uploadId) {
  return path.join(uploadDir(uploadId), 'part.bin');
}

async function readUploadMeta(uploadId) {
  try {
    return JSON.parse(await fs.promises.readFile(uploadMetaPath(uploadId), 'utf8'));
  } catch (err) {
    return null;
  }
}

async function writeUploadMeta(meta) {
  await fs.promises.writeFile(uploadMetaPath(meta.uploadId), JSON.stringify(meta));
}

function withUploadLock(uploadId, fn) {
  const prev = chunkLocks.get(uploadId) || Promise.resolve();
  const run = prev.then(fn, fn);
  const tail = run.then(() => {}, () => {});
  chunkLocks.set(uploadId, tail);
  tail.then(() => {
    if (chunkLocks.get(uploadId) === tail) chunkLocks.delete(uploadId);
  });
  return run;
}

function sha256File(filePath) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    fs.createReadStream(filePath)
      .on('error', reject)
      .on('data', (chunk) => hash.update(chunk))
      .on('end', () => resolve(hash.digest('hex')));
  });
}

async function sweepStaleUploads() {
  try {
    const entries = await fs.promises.readdir(UPLOADS_DIR);
    const cutoff = Date.now() - PARTIAL_TTL_MS;
    for (const id of entries) {
      const st = await fs.promises.stat(uploadDir(id)).catch(() => null);
      if (st && st.mtimeMs < cutoff) {
        await fs.promises.rm(uploadDir(id), { recursive: true, force: true });
      }
    }
  } catch (err) {
    // Nothing to sweep yet.
  }
}

/**
 * The device that ran the call uploads from its own session; if a different
 * inmate has since logged in on that same kiosk, the call's own device id is
 * still enough to hand over the file it produced.
 */
async function inUploadScope(req, call) {
  if (await inScopeOf(req, call)) return true;
  const kioskId = kioskScopeOf(req);
  return !!kioskId && !!call.kioskId && call.kioskId === kioskId;
}

async function findCall(callId) {
  const calls = await readDb('calls.json');
  return calls.find((c) => c.callId === callId || c.roomId === callId) || null;
}

/** Shared tail for every accepted upload: DB record + call status + event. */
async function persistUpload(broadcastEvent, callId, rec) {
  let prevFilePath = null;
  await updateDb('recordings.json', (all) => {
    const existingIdx = all.findIndex((r) => r.callId === callId || r.recordingId === rec.recordingId);
    if (existingIdx !== -1) {
      prevFilePath = all[existingIdx].filePath || null;
      let merged = { ...all[existingIdx], ...rec };
      // A master held on the kiosk just landed a fresh backend copy: that copy
      // is temporary, so stamp the TTL the sweep will act on.
      if (all[existingIdx].storage === 'kiosk') {
        merged = {
          ...merged,
          storage: 'kiosk',
          retrieval: {
            ...(all[existingIdx].retrieval || {}),
            status: 'ready',
            completedAt: new Date().toISOString(),
            expiresAt: new Date(Date.now() + KIOSK_COPY_TTL_MS).toISOString()
          }
        };
      }
      all[existingIdx] = merged;
      return { data: all, result: all[existingIdx] };
    }
    return { data: [...all, rec], result: rec };
  });

  // Re-retrieval replaced an older temp copy - drop it so it cannot linger.
  if (prevFilePath && rec.filePath && prevFilePath !== rec.filePath) {
    fs.promises.unlink(prevFilePath).catch(() => {});
  }

  await updateDb('calls.json', (calls) => {
    const c = calls.find((x) => x.callId === callId || x.roomId === callId);
    if (c) {
      c.recordingStatus = 'completed';
      c.recordingId = rec.recordingId;
    }
    return { data: calls, result: c };
  });

  broadcastEvent('recording-finished', rec);
  return rec;
}

// ---- signed streaming URLs ----
// <video>/<audio> tags cannot attach a Bearer header, so playback goes through
// a short-lived HMAC-signed link issued only to authenticated, in-scope users.
const STREAM_TTL_SECONDS = Number(process.env.RECORDING_URL_TTL_SECONDS) > 0
  ? Number(process.env.RECORDING_URL_TTL_SECONDS)
  : 7200;

function streamSecret() {
  return process.env.RECORDING_URL_SECRET || process.env.JWT_SECRET;
}

function signStream(recordingId, exp) {
  return crypto.createHmac('sha256', streamSecret())
    .update(`stream:${recordingId}:${exp}`)
    .digest('base64url');
}

/** Constant-time comparison (hash first so lengths never leak). */
function safeEqual(a, b) {
  const ha = crypto.createHash('sha256').update(String(a)).digest();
  const hb = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(ha, hb);
}

/**
 * Recording as exposed to dashboards: playable flag, never server paths.
 * `storage: 'kiosk'` means the master copy lives on the device and any
 * backend file is a temporary copy whose TTL may already have passed.
 */
function publicRecording(rec) {
  const { filePath, ...rest } = rec || {};
  const expired = kioskCopyExpired(rec);
  const available = !!recordingFileOf(rec) && !expired;
  return {
    ...rest,
    url: null,
    available,
    storage: (rec && rec.storage) || 'backend',
    retrieval: (rec && rec.retrieval) || null
  };
}

function createRecordingsRouter(broadcastEvent) {
  router.get('/', requireAuth, requireRole('admin', 'warden'), asyncRoute(async (req, res) =>
    sendSuccess(res, (await scopeList(req, await readDb('recordings.json'))).map(publicRecording))));

  // ---- metadata-only registration: the file stays encrypted on the kiosk ----
  router.post('/register', requireAuth, requireRole(...KIOSK_UPLOAD_ROLES), asyncRoute(async (req, res) => {
    const { callId, fileName, size, sha256, durationSeconds } = req.body || {};
    if (!callId || !fileName || !Number.isFinite(size) || size <= 0) {
      return sendError(res, 'INVALID_REQUEST', 'callId, fileName and size are required', 400);
    }

    const call = await findCall(callId);
    if (!call || !(await inUploadScope(req, call))) {
      return sendError(res, 'CALL_NOT_FOUND', 'No call matches the given callId', 404);
    }

    let created;
    await updateDb('recordings.json', (all) => {
      const idx = all.findIndex((r) => r.callId === call.callId || r.recordingId === `REC-${call.callId}`);
      if (idx !== -1) {
        const prev = all[idx];
        // A row that already holds a backend file (old auto-upload flow) keeps
        // it untouched; otherwise this is the master's metadata.
        const hasBackendFile = !!prev.filePath;
        all[idx] = {
          ...prev,
          fileName: hasBackendFile ? prev.fileName : fileName,
          // The name the file has ON THE KIOSK. persistUpload may later
          // overwrite `fileName` with the backend's REC-*.mp4 name — this
          // field is what the heartbeat must serve so the device can find
          // its own copy when the warden hits Retrieve.
          localFileName: hasBackendFile ? prev.localFileName || null : fileName,
          fileSize: hasBackendFile ? prev.fileSize : size,
          localSha256: sha256 || prev.localSha256 || null,
          duration: durationSeconds != null ? durationSeconds : (prev.duration || 0),
          storage: hasBackendFile ? prev.storage || 'backend' : 'kiosk',
          status: 'completed',
          registeredAt: prev.registeredAt || new Date().toISOString()
        };
        created = all[idx];
        return { data: all, result: all[idx] };
      }

      const rec = {
        recordingId: `REC-${call.callId}`,
        callId: call.callId,
        kioskId: call.kioskId || kioskScopeOf(req) || null,
        inmateId: call.inmateId || null,
        contactId: call.contactId || null,
        fileName,
        localFileName: fileName,
        fileSize: size,
        mimeType: 'video/mp4',
        localSha256: sha256 || null,
        duration: durationSeconds || 0,
        storage: 'kiosk',
        status: 'completed',
        registeredAt: new Date().toISOString(),
        createdAt: new Date().toISOString()
      };
      all.push(rec);
      created = rec;
      return { data: all, result: rec };
    });

    await updateDb('calls.json', (calls) => {
      const c = calls.find((x) => x.callId === call.callId || x.roomId === call.callId);
      if (c) {
        c.recordingStatus = 'completed';
        c.recordingId = created.recordingId;
      }
      return { data: calls, result: c };
    });

    broadcastEvent('recording-registered', created);
    return sendSuccess(res, { recordingId: created.recordingId, storage: created.storage }, 201);
  }));

  // ---- chunked upload: init (also the resume point) ----
  router.post('/upload/init', requireAuth, requireRole(...KIOSK_UPLOAD_ROLES), asyncRoute(async (req, res) => {
    const { callId, fileName, size, sha256, chunkSize } = req.body || {};
    if (!callId || !fileName || !sha256 || !Number.isFinite(size) || size <= 0) {
      return sendError(res, 'INVALID_REQUEST', 'callId, fileName, size and sha256 are required', 400);
    }
    if (size > RECORDING_MAX_BYTES) {
      return sendError(res, 'RECORDING_TOO_LARGE', 'Recording exceeds the maximum accepted size', 413);
    }

    const call = await findCall(callId);
    if (!call || !(await inUploadScope(req, call))) {
      return sendError(res, 'CALL_NOT_FOUND', 'No call matches the given callId', 404);
    }
    // The kiosk identifies calls by roomId (its recording files are named
    // rec-<roomId>-...), but recordings.call_id is a foreign key to calls.id.
    // Store the canonical callId so the final INSERT cannot violate it.
    const canonicalCallId = call.callId;

    // First bytes of a retrieval upload: the request is now in flight.
    await markRetrievalTransferring(canonicalCallId);

    await fs.promises.mkdir(UPLOADS_DIR, { recursive: true });

    // Resume: a partial for the same content already exists - hand back how
    // much of it landed so the kiosk can skip those chunks.
    const entries = await fs.promises.readdir(UPLOADS_DIR);
    for (const id of entries) {
      const meta = await readUploadMeta(id);
      if (!meta || (meta.callId !== canonicalCallId && meta.callId !== callId) || meta.sha256 !== sha256 || meta.size !== size) continue;
      const st = await fs.promises.stat(uploadPartPath(id)).catch(() => null);
      if (!st) continue;
      if (st.size > size) {
        await fs.promises.rm(uploadDir(id), { recursive: true, force: true }).catch(() => {});
        continue;
      }
      meta.callId = canonicalCallId;
      meta.receivedBytes = st.size;
      await writeUploadMeta(meta);
      return sendSuccess(res, { uploadId: id, receivedBytes: st.size, chunkSize: meta.chunkSize });
    }

    const uploadId = `UPL-${uuidv4().substring(0, 8).toUpperCase()}`;
    await fs.promises.mkdir(uploadDir(uploadId), { recursive: true });
    const meta = {
      uploadId,
      callId: canonicalCallId,
      fileName,
      mimeType: 'video/mp4',
      size,
      sha256,
      chunkSize: Math.min(Math.max(1, Number(chunkSize) || CHUNK_MAX_BYTES), CHUNK_MAX_BYTES),
      receivedBytes: 0,
      kioskId: kioskScopeOf(req) || null,
      createdBy: req.auth?.sub || null,
      createdAt: new Date().toISOString()
    };
    await writeUploadMeta(meta);
    await fs.promises.writeFile(uploadPartPath(uploadId), '');
    sweepStaleUploads();
    return sendSuccess(res, { uploadId, receivedBytes: 0, chunkSize: meta.chunkSize }, 201);
  }));

  // ---- chunked upload: append one chunk at its exact offset ----
  router.post('/upload/:uploadId/chunk', requireAuth, requireRole(...KIOSK_UPLOAD_ROLES), asyncRoute(async (req, res) =>
    withUploadLock(req.params.uploadId, async () => {
      const { uploadId } = req.params;
      const { index, offset, data } = req.body || {};

      const meta = await readUploadMeta(uploadId);
      if (!meta) return sendError(res, 'UPLOAD_NOT_FOUND', 'Unknown or expired upload session', 404);
      const requesterKiosk = kioskScopeOf(req);
      if (meta.kioskId && requesterKiosk && meta.kioskId !== requesterKiosk) {
        return sendError(res, 'UPLOAD_NOT_FOUND', 'Unknown or expired upload session', 404);
      }

      const st = await fs.promises.stat(uploadPartPath(uploadId)).catch(() => null);
      const receivedBytes = st ? st.size : 0;
      if (receivedBytes >= meta.size) {
        return sendSuccess(res, { receivedBytes: meta.size, complete: true });
      }
      if (!Number.isFinite(offset) || offset < 0 || typeof data !== 'string' || !data.length) {
        return sendError(res, 'INVALID_REQUEST', 'offset and data are required', 400);
      }
      if (offset < receivedBytes) {
        // Retried chunk that already landed - acknowledge without appending.
        return sendSuccess(res, { receivedBytes, complete: receivedBytes >= meta.size });
      }
      if (offset !== receivedBytes) {
        return sendError(res, 'OUT_OF_ORDER', `Expected chunk offset ${receivedBytes}`, 409);
      }

      const buf = Buffer.from(data, 'base64');
      if (!buf.length) return sendError(res, 'INVALID_REQUEST', 'Chunk decoded to zero bytes', 400);
      if (receivedBytes + buf.length > meta.size) {
        return sendError(res, 'CHUNK_OVERFLOW', 'Chunk would exceed the declared size', 400);
      }

      await fs.promises.appendFile(uploadPartPath(uploadId), buf);
      meta.receivedBytes = receivedBytes + buf.length;
      await writeUploadMeta(meta);
      return sendSuccess(res, { receivedBytes: meta.receivedBytes, complete: meta.receivedBytes >= meta.size, index });
    })));

  // ---- chunked upload: verify checksum, move into place, publish ----
  router.post('/upload/:uploadId/complete', requireAuth, requireRole(...KIOSK_UPLOAD_ROLES), asyncRoute(async (req, res) =>
    withUploadLock(req.params.uploadId, async () => {
      const { uploadId } = req.params;

      const meta = await readUploadMeta(uploadId);
      if (!meta) return sendError(res, 'UPLOAD_NOT_FOUND', 'Unknown or expired upload session', 404);
      const requesterKiosk = kioskScopeOf(req);
      if (meta.kioskId && requesterKiosk && meta.kioskId !== requesterKiosk) {
        return sendError(res, 'UPLOAD_NOT_FOUND', 'Unknown or expired upload session', 404);
      }

      const st = await fs.promises.stat(uploadPartPath(uploadId)).catch(() => null);
      const receivedBytes = st ? st.size : 0;
      if (receivedBytes !== meta.size) {
        return sendError(res, 'INCOMPLETE', `Received ${receivedBytes} of ${meta.size} bytes`, 409);
      }

      const digest = await sha256File(uploadPartPath(uploadId)).catch(() => null);
      if (digest !== meta.sha256) {
        // Corrupt assembly - drop it so the next attempt starts clean.
        await fs.promises.rm(uploadDir(uploadId), { recursive: true, force: true });
        return sendError(res, 'CHECKSUM_MISMATCH', 'Uploaded bytes do not match the declared sha256', 400);
      }

      const call = await findCall(meta.callId);
      if (!call || !(await inUploadScope(req, call))) {
        return sendError(res, 'CALL_NOT_FOUND', 'No call matches the given callId', 404);
      }

      let rec;
      try {
        rec = await saveUploadedRecordingFromPath({
          callId: call.callId,
          kioskId: call.kioskId || null,
          inmateId: call.inmateId || null,
          contactId: call.contactId || null,
          sourcePath: uploadPartPath(uploadId),
          fileName: meta.fileName,
          mimeType: meta.mimeType
        });
      } catch (err) {
        console.error('[recordings] failed finalising chunked upload:', err.message);
        return sendError(res, 'STORAGE_ERROR', 'Failed to store uploaded recording', 500);
      }

      await fs.promises.rm(uploadDir(uploadId), { recursive: true, force: true });
      await persistUpload(broadcastEvent, call.callId, rec);
      return sendSuccess(res, rec, 200);
    })));

  // ---- on-demand retrieval: ask the kiosk to push its master copy ----
  router.post('/:recordingId/retrieve', requireAuth, requireRole('admin', 'warden'), asyncRoute(async (req, res) => {
    const recordings = await readDb('recordings.json');
    const recording = recordings.find((r) => r.recordingId === req.params.recordingId);
    if (!recording || !(await inScopeOf(req, recording))) {
      return sendError(res, 'NOT_FOUND', 'Recording not found', 404);
    }

    // A fresh temp copy is already here - nothing to do.
    if (recordingFileOf(recording) && !kioskCopyExpired(recording)) {
      return sendSuccess(res, { status: 'ready', available: true });
    }
    if ((recording.storage || 'backend') !== 'kiosk') {
      return sendError(res, 'UNAVAILABLE', 'No recording file is available for this recording', 404);
    }
    if (!(await findKioskOnline(recording.kioskId))) {
      return sendError(res, 'KIOSK_OFFLINE', 'The kiosk holding this recording is currently offline', 409);
    }

    const now = Date.now();
    const updated = await updateDb('recordings.json', (all) => {
      const idx = all.findIndex((r) => r.recordingId === recording.recordingId);
      if (idx === -1) return { data: all, result: null };
      const prev = all[idx].retrieval || {};
      const prevAt = prev.requestedAt ? Date.parse(prev.requestedAt) : 0;
      if ((prev.status === 'requested' || prev.status === 'transferring') && now - prevAt < RETRIEVE_REQUEST_TTL_MS) {
        return { data: all, result: all[idx] }; // already in flight
      }
      all[idx] = {
        ...all[idx],
        retrieval: {
          ...prev,
          status: 'requested',
          requestedAt: new Date(now).toISOString(),
          requestedBy: (req.auth && req.auth.sub) || null,
          startedAt: null,
          completedAt: null,
          expiresAt: null
        }
      };
      return { data: all, result: all[idx] };
    });
    if (!updated) return sendError(res, 'NOT_FOUND', 'Recording not found', 404);

    broadcastEvent('recording-retrieving', updated);
    return sendSuccess(res, { status: updated.retrieval.status });
  }));

  // ---- polling point for the dashboard's "Retrieving file..." overlay ----
  router.get('/:recordingId/status', requireAuth, requireRole('admin', 'warden'), asyncRoute(async (req, res) => {
    const recordings = await readDb('recordings.json');
    const recording = recordings.find((r) => r.recordingId === req.params.recordingId);
    if (!recording || !(await inScopeOf(req, recording))) {
      return sendError(res, 'NOT_FOUND', 'Recording not found', 404);
    }

    const storage = recording.storage || 'backend';
    const file = recordingFileOf(recording);
    if (file && !kioskCopyExpired(recording)) {
      return sendSuccess(res, {
        status: 'ready',
        available: true,
        storage,
        expiresAt: (recording.retrieval && recording.retrieval.expiresAt) || null
      });
    }

    if (storage !== 'kiosk') {
      return sendSuccess(res, { status: file ? 'ready' : 'unavailable', available: !!file, storage });
    }
    if (!(await findKioskOnline(recording.kioskId))) {
      return sendSuccess(res, { status: 'kiosk_offline', available: false, storage });
    }

    const st = recording.retrieval && recording.retrieval.status;
    const meta = await findUploadMetaForCall(recording.callId);
    const progress = {
      receivedBytes: meta ? meta.receivedBytes : 0,
      size: (meta && meta.size) || recording.fileSize || 0,
      requestedAt: (recording.retrieval && recording.retrieval.requestedAt) || null
    };
    if (st === 'transferring' || st === 'requested') {
      return sendSuccess(res, { status: st, available: false, storage, ...progress });
    }
    return sendSuccess(res, { status: 'stored', available: false, storage, ...progress });
  }));

  // ---- signed playback link (authenticated, in-scope callers only) ----
  router.get('/:recordingId/url', requireAuth, requireRole('admin', 'warden'), asyncRoute(async (req, res) => {
    const recordings = await readDb('recordings.json');
    const recording = recordings.find((r) => r.recordingId === req.params.recordingId);
    if (!recording || !(await inScopeOf(req, recording))) {
      return sendError(res, 'NOT_FOUND', 'Recording not found', 404);
    }
    if (!recordingFileOf(recording)) {
      return sendError(res, 'NO_FILE', 'No stored file for this recording', 404);
    }
    const exp = Math.floor(Date.now() / 1000) + STREAM_TTL_SECONDS;
    return sendSuccess(res, {
      url: `/recordings/${encodeURIComponent(recording.recordingId)}/stream?exp=${exp}&sig=${signStream(recording.recordingId, exp)}`,
      expiresAt: new Date(exp * 1000).toISOString()
    });
  }));

  // ---- the media itself: signed + HTTP Range (seek) ----
  router.get('/:recordingId/stream', asyncRoute(async (req, res) => {
    const exp = Number(req.query.exp);
    const sig = String(req.query.sig || '');
    if (!Number.isFinite(exp) || !sig || Date.now() / 1000 > exp) {
      return sendError(res, 'LINK_EXPIRED', 'Recording link is invalid or has expired', 403);
    }
    if (!safeEqual(sig, signStream(req.params.recordingId, exp))) {
      return sendError(res, 'FORBIDDEN', 'Recording link signature is invalid', 403);
    }

    const recordings = await readDb('recordings.json');
    const recording = recordings.find((r) => r.recordingId === req.params.recordingId);
    const file = recordingFileOf(recording);
    if (!file) return sendError(res, 'NOT_FOUND', 'Recording file not found', 404);

    const size = (await fs.promises.stat(file)).size;
    res.setHeader('Accept-Ranges', 'bytes');
    res.setHeader('Content-Type', 'video/mp4');
    res.setHeader('Cache-Control', 'private, max-age=0, must-revalidate');

    const range = req.headers.range;
    if (!range) {
      res.setHeader('Content-Length', size);
      return fs.createReadStream(file).pipe(res);
    }

    const match = /^bytes=(\d*)-(\d*)$/.exec(range.trim());
    if (!match) {
      res.setHeader('Content-Range', `bytes */${size}`);
      return res.status(416).end();
    }
    let start = match[1] === '' ? null : Number(match[1]);
    let end = match[2] === '' ? null : Number(match[2]);
    if (start === null) {
      // Suffix form: bytes=-N (last N bytes)
      start = Math.max(0, size - (end || 0));
      end = size - 1;
    } else {
      end = end === null ? size - 1 : Math.min(end, size - 1);
    }
    if (!Number.isFinite(start) || start >= size || start > end) {
      res.setHeader('Content-Range', `bytes */${size}`);
      return res.status(416).end();
    }

    res.status(206);
    res.setHeader('Content-Range', `bytes ${start}-${end}/${size}`);
    res.setHeader('Content-Length', end - start + 1);
    return fs.createReadStream(file, { start, end }).pipe(res);
  }));

  router.get('/:recordingId', requireAuth, requireRole('admin', 'warden'), asyncRoute(async (req, res) => {
    const recordings = await readDb('recordings.json');
    const recording = recordings.find((r) => r.recordingId === req.params.recordingId);
    if (!recording || !(await inScopeOf(req, recording))) return sendError(res, 'NOT_FOUND', 'Recording not found', 404);
    return sendSuccess(res, publicRecording(recording));
  }));

  router.post('/', requireAuth, requireRole('admin', 'warden'), asyncRoute(async (req, res) => {
    const { callId } = req.body;
    if (!callId) return sendError(res, 'INVALID_REQUEST', 'callId is required', 400);
    const call = (await readDb('calls.json')).find((c) => c.callId === callId);
    if (!call || !inAdminScope(req, call)) {
      return sendError(res, 'NOT_FOUND', 'Call not found', 404);
    }
    const newRecording = {
      recordingId: `REC-${uuidv4().substring(0, 8).toUpperCase()}`,
      callId, kioskId: call.kioskId || kioskScopeOf(req) || null,
      inmateId: call.inmateId || null,
      status: 'not_started', startTime: null, endTime: null, duration: 0,
      createdAt: new Date().toISOString()
    };
    await updateDb('recordings.json', (r) => ({ data: [...r, newRecording], result: newRecording }));
    return sendSuccess(res, newRecording, 201);
  }));

  router.post('/upload', requireAuth, requireRole('admin', 'warden'), asyncRoute(async (req, res) => {
    const { callId, base64Data, fileName, mimeType } = req.body || {};
    if (!callId) return sendError(res, 'INVALID_REQUEST', 'callId is required', 400);

    const call = (await readDb('calls.json')).find((c) => c.callId === callId || c.roomId === callId);
    if (!call || !(await inScopeOf(req, call))) {
      return sendError(res, 'CALL_NOT_FOUND', 'No call matches the given callId', 404);
    }

    let fileBuffer;
    if (base64Data) {
      fileBuffer = Buffer.from(base64Data, 'base64');
    } else if (Buffer.isBuffer(req.body)) {
      fileBuffer = req.body;
    } else {
      return sendError(res, 'INVALID_REQUEST', 'No recording data provided (base64Data or raw body required)', 400);
    }

    let rec;
    try {
      rec = await saveUploadedRecording({
        callId: call.callId,
        kioskId: call.kioskId || null,
        inmateId: req.body?.inmateId || call.inmateId || null,
        contactId: req.body?.contactId || call.contactId || null,
        fileBuffer,
        fileName: fileName || `kiosk-rec-${call.callId}.mp4`,
        mimeType: mimeType || 'video/mp4'
      });
    } catch (err) {
      console.error('[recordings] failed persisting upload:', err.message);
      return sendError(res, 'STORAGE_ERROR', 'Failed to store uploaded recording', 500);
    }

    await persistUpload(broadcastEvent, call.callId, rec);
    return sendSuccess(res, rec, 200);
  }));

  router.post('/:recordingId/start', requireAuth, requireRole('admin', 'warden'), asyncRoute(async (req, res) => {
    const { recordingId } = req.params;
    const recordings = await readDb('recordings.json');
    const recording = recordings.find((r) => r.recordingId === recordingId);
    if (!recording || !(await inScopeOf(req, recording))) return sendError(res, 'NOT_FOUND', 'Recording not found', 404);

    const updated = await updateDb('recordings.json', (all) => {
      const idx = all.findIndex((r) => r.recordingId === recordingId);
      all[idx] = { ...all[idx], status: 'recording', startTime: new Date().toISOString() };
      return { data: all, result: all[idx] };
    });

    broadcastEvent('recording-started', updated);
    return sendSuccess(res, updated);
  }));

  router.post('/:recordingId/stop', requireAuth, requireRole('admin', 'warden'), asyncRoute(async (req, res) => {
    const { recordingId } = req.params;
    const recordings = await readDb('recordings.json');
    const recording = recordings.find((r) => r.recordingId === recordingId);
    if (!recording || !(await inScopeOf(req, recording))) return sendError(res, 'NOT_FOUND', 'Recording not found', 404);

    const updated = await updateDb('recordings.json', (all) => {
      const idx = all.findIndex((r) => r.recordingId === recordingId);
      const startMs = all[idx].startTime ? new Date(all[idx].startTime).getTime() : Date.now();
      all[idx] = {
        ...all[idx], status: 'completed', endTime: new Date().toISOString(),
        duration: Math.max(1, Math.round((Date.now() - startMs) / 1000))
      };
      return { data: all, result: all[idx] };
    });

    broadcastEvent('recording-finished', updated);
    return sendSuccess(res, updated);
  }));

  return router;
}

/**
 * Deletes backend temp copies whose TTL has passed. Only rows whose master
 * lives on the kiosk (`storage: 'kiosk'`) are touched — files uploaded by the
 * old auto-upload flow are the only copy and must never be swept. The row
 * survives, so the warden can simply retrieve it again.
 */
async function sweepKioskCopyTTL(broadcastEvent) {
  try {
    const all = await readDb('recordings.json');
    for (const rec of all) {
      if ((rec.storage || 'backend') !== 'kiosk' || !rec.filePath || !kioskCopyExpired(rec)) continue;
      const file = recordingFileOf(rec);
      if (file) await fs.promises.unlink(file).catch(() => {});
      const updated = await updateDb('recordings.json', (rows) => {
        const idx = rows.findIndex((r) => r.recordingId === rec.recordingId);
        if (idx === -1) return { data: rows, result: null };
        rows[idx] = {
          ...rows[idx],
          filePath: null,
          fileSize: null,
          retrieval: {
            ...(rows[idx].retrieval || {}),
            status: 'expired',
            expiredAt: new Date().toISOString()
          }
        };
        return { data: rows, result: rows[idx] };
      });
      if (updated) {
        console.log(`[recordings] TTL sweep removed temp copy of ${rec.recordingId}`);
        broadcastEvent('recording-updated', publicRecording(updated));
      }
    }
  } catch (err) {
    console.warn('[recordings] kiosk-copy TTL sweep failed:', err.message);
  }
}

module.exports = createRecordingsRouter;
module.exports.sweepKioskCopyTTL = sweepKioskCopyTTL;
