const fs = require('fs');
const path = require('path');

const RECORDINGS_DIR = path.join(__dirname, '..', 'recordings');
if (!fs.existsSync(RECORDINGS_DIR)) {
  fs.mkdirSync(RECORDINGS_DIR, { recursive: true });
}

/**
 * Saves a recording uploaded by the Android Kiosk.
 */
async function saveUploadedRecording({ callId, kioskId, inmateId, contactId, fileBuffer, fileName, mimeType }) {
  const ext = path.extname(fileName) || '.mp4';
  const recFileName = `REC-${callId}-${Date.now()}${ext}`;
  const filePath = path.join(RECORDINGS_DIR, recFileName);

  await fs.promises.writeFile(filePath, fileBuffer);
  const stats = await fs.promises.stat(filePath);

  return recordingRecord({ callId, kioskId, inmateId, contactId, fileName: recFileName, filePath, fileSize: stats.size, mimeType });
}

function recordingRecord({ callId, kioskId, inmateId, contactId, fileName, filePath, fileSize, mimeType }) {
  return {
    recordingId: `REC-${callId}`,
    callId,
    kioskId: kioskId || null,
    inmateId,
    contactId,
    fileName,
    filePath,
    fileSize,
    mimeType: mimeType || 'video/mp4',
    createdAt: new Date().toISOString(),
    status: 'completed'
  };
}

/**
 * Finalises a chunked (resumable) kiosk upload: the assembled partial file is
 * renamed into place instead of being read into memory again.
 */
async function saveUploadedRecordingFromPath({ callId, kioskId, inmateId, contactId, sourcePath, fileName, mimeType }) {
  const ext = path.extname(fileName) || '.mp4';
  const recFileName = `REC-${callId}-${Date.now()}${ext}`;
  const filePath = path.join(RECORDINGS_DIR, recFileName);

  try {
    await fs.promises.rename(sourcePath, filePath);
  } catch (err) {
    if (err.code !== 'EXDEV') throw err;
    await fs.promises.copyFile(sourcePath, filePath);
    await fs.promises.unlink(sourcePath).catch(() => {});
  }
  const stats = await fs.promises.stat(filePath);

  return recordingRecord({ callId, kioskId, inmateId, contactId, fileName: recFileName, filePath, fileSize: stats.size, mimeType });
}

/**
 * Resolves a recording row to the file that actually exists on disk, or null.
 * Accepts the absolute path written at upload time or a bare fileName inside
 * RECORDINGS_DIR; anything resolving outside RECORDINGS_DIR is refused.
 */
function recordingFileOf(rec) {
  if (!rec) return null;
  const candidates = [];
  if (rec.filePath) candidates.push(rec.filePath);
  if (rec.fileName) candidates.push(path.join(RECORDINGS_DIR, rec.fileName));
  for (const candidate of candidates) {
    const resolved = path.resolve(candidate);
    if (!resolved.startsWith(RECORDINGS_DIR + path.sep)) continue;
    try {
      if (fs.statSync(resolved).isFile()) return resolved;
    } catch (err) {
      // Missing file - try the next candidate.
    }
  }
  return null;
}

module.exports = {
  RECORDINGS_DIR,
  saveUploadedRecording,
  saveUploadedRecordingFromPath,
  recordingFileOf
};
