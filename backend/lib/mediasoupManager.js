const mediasoup = require('mediasoup');
const os = require('os');

const NUM_WORKERS = Math.max(1, Math.min(os.cpus().length, parseInt(process.env.MEDIASOUP_WORKERS || '2', 10)));

const MEDIA_CODECS = [
  { kind: 'audio', mimeType: 'audio/opus', clockRate: 48000, channels: 2 },
  {
    kind: 'video',
    mimeType: 'video/VP8',
    clockRate: 90000,
    parameters: { 'x-google-start-bitrate': 1000 }
  }
];

// In production this MUST be the server's public IP (or use a TURN server for
// clients behind symmetric NAT). Set MEDIASOUP_ANNOUNCED_IP to your public IP.
const ANNOUNCED_IP = process.env.MEDIASOUP_ANNOUNCED_IP;
if (!ANNOUNCED_IP) {
  throw new Error('MEDIASOUP_ANNOUNCED_IP env var is required — set it to your server public IP');
}
const RTC_MIN_PORT = parseInt(process.env.MEDIASOUP_MIN_PORT || '40000', 10);
const RTC_MAX_PORT = parseInt(process.env.MEDIASOUP_MAX_PORT || '49999', 10);

const workers = [];
let nextWorkerIdx = 0;

// roomId -> { router, peers: Map<peerId, Peer> }
const rooms = new Map();

class Peer {
  constructor(peerId, socketId) {
    this.peerId = peerId;
    this.socketId = socketId;
    this.transports = new Map(); // transportId -> WebRtcTransport
    this.producers = new Map();  // producerId -> Producer
    this.consumers = new Map();  // consumerId -> Consumer
  }

  close() {
    this.consumers.forEach((c) => c.close());
    this.producers.forEach((p) => p.close());
    this.transports.forEach((t) => t.close());
    this.consumers.clear();
    this.producers.clear();
    this.transports.clear();
  }
}

async function initWorkers() {
  for (let i = 0; i < NUM_WORKERS; i++) {
    const worker = await mediasoup.createWorker({
      rtcMinPort: RTC_MIN_PORT,
      rtcMaxPort: RTC_MAX_PORT,
      logLevel: 'warn'
    });
    worker.on('died', (err) => {
      console.error(`[mediasoup] worker ${worker.pid} died unexpectedly:`, err?.message);
      process.exit(1); // fail fast rather than serve calls with a dead worker
    });
    workers.push(worker);
  }
  console.log(`[mediasoup] ${workers.length} worker(s) started (ports ${RTC_MIN_PORT}-${RTC_MAX_PORT})`);
}

function getNextWorker() {
  const worker = workers[nextWorkerIdx];
  nextWorkerIdx = (nextWorkerIdx + 1) % workers.length;
  return worker;
}

async function getOrCreateRoom(roomId) {
  let room = rooms.get(roomId);
  if (room) return room;

  const worker = getNextWorker();
  const router = await worker.createRouter({ mediaCodecs: MEDIA_CODECS });
  room = { router, peers: new Map() };
  rooms.set(roomId, room);
  return room;
}

function getRoom(roomId) {
  return rooms.get(roomId);
}

function removePeer(roomId, peerId) {
  const room = rooms.get(roomId);
  if (!room) return;
  const peer = room.peers.get(peerId);
  if (peer) {
    peer.close();
    room.peers.delete(peerId);
  }
  if (room.peers.size === 0) {
    room.router.close();
    rooms.delete(roomId);
  }
}

async function createWebRtcTransport(room, appData = {}) {
  const transport = await room.router.createWebRtcTransport({
    listenIps: [{ ip: '0.0.0.0', announcedIp: ANNOUNCED_IP }],
    enableUdp: true,
    enableTcp: true,
    preferUdp: true,
    initialAvailableOutgoingBitrate: 1_000_000
  });

  transport.appData = appData;

  transport.on('dtlsstatechange', (state) => {
    if (state === 'closed' || state === 'failed') transport.close();
  });

  return transport;
}

module.exports = {
  initWorkers,
  getOrCreateRoom,
  getRoom,
  removePeer,
  createWebRtcTransport,
  Peer,
  MEDIA_CODECS
};
