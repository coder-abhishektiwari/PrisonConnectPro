const fs = require('fs');
const path = require('path');

const RECORDINGS_DIR = path.join(__dirname, '..', 'recordings');
if (!fs.existsSync(RECORDINGS_DIR)) {
  fs.mkdirSync(RECORDINGS_DIR, { recursive: true });
}

/**
 * Saves a recording uploaded by the Android Kiosk.
 */
async function saveUploadedRecording({ callId, inmateId, contactId, fileBuffer, fileName, mimeType }) {
  const ext = path.extname(fileName) || '.mp4';
  const recFileName = `REC-${callId}-${Date.now()}${ext}`;
  const filePath = path.join(RECORDINGS_DIR, recFileName);

  await fs.promises.writeFile(filePath, fileBuffer);
  const stats = await fs.promises.stat(filePath);

  return {
    recordingId: `REC-${callId}`,
    callId,
    inmateId,
    contactId,
    fileName: recFileName,
    filePath,
    fileSize: stats.size,
    mimeType: mimeType || 'video/mp4',
    createdAt: new Date().toISOString(),
    status: 'completed'
  };
}

module.exports = {
  RECORDINGS_DIR,
  saveUploadedRecording
};
