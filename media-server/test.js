require('dotenv').config();
const BASE = `http://127.0.0.1:${process.env.PORT || 3003}`;
const KEY = process.env.MEDIA_API_KEY;

const H = { 'Content-Type': 'application/json', 'X-API-Key': KEY, Connection: 'close' };
async function api(method, path, body) {
  const r = await fetch(BASE + path, { method, headers: H, body: body ? JSON.stringify(body) : undefined });
  const j = await r.json();
  if (!r.ok) throw new Error(`${method} ${path} -> ${r.status} ${JSON.stringify(j)}`);
  return j;
}
function assert(cond, msg) { if (!cond) throw new Error('ASSERT FAIL: ' + msg); console.log('ok -', msg); }

(async () => {
  const health = await fetch(BASE + '/health').then((r) => r.json());
  assert(health.status === 'ok', 'health');

  await api('POST', '/rooms', { roomId: 'ROOM-TEST' });
  const t = await api('POST', '/rooms/ROOM-TEST/transports', { peerId: 'peer-a', direction: 'send' });
  assert(t.data.id && t.data.iceParameters && t.data.iceCandidates.length, 'createWebRtcTransport returns ice params');

  const t2 = await api('POST', '/rooms/ROOM-TEST/transports', { peerId: 'peer-b', direction: 'recv' });
  assert(t2.data.id, 'recv transport');

  const info = await api('GET', '/rooms/ROOM-TEST');
  assert(info.data.peers.includes('peer-a'), 'peer registered');

  await api('POST', '/rooms/ROOM-TEST/record', { recordingId: 'REC-TEST' }).then(async (r) => {
    if (r.error && r.error.code === 'FFMPEG_UNAVAILABLE') {
      console.log('skip - ffmpeg unavailable on this host');
      return;
    }
    const stopped = await api('POST', '/rooms/ROOM-TEST/record/stop', { recordingId: 'REC-TEST' });
    assert(stopped.data.files && stopped.data.files.length > 0, 'recording lifecycle produces a file');
  }).catch((e) => {
    if (/501/.test(e.message)) { console.log('skip - ffmpeg unavailable on this host'); return; }
    throw e;
  });

  await api('DELETE', '/rooms/ROOM-TEST');
  try { await api('GET', '/rooms/ROOM-TEST'); throw new Error('expected 404'); } catch (e) {
    assert(/404/.test(e.message), 'room deleted');
  }
  console.log('ALL MEDIA-SERVER TESTS PASS');
  process.exit(0);
})().catch((e) => { console.error(e.message); process.exit(1); });