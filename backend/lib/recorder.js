const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const RECORDINGS_DIR = path.join(__dirname, '..', 'recordings');
if (!fs.existsSync(RECORDINGS_DIR)) fs.mkdirSync(RECORDINGS_DIR, { recursive: true });

let nextPort = parseInt(process.env.RECORDER_MIN_PORT || '20000', 10);
function allocatePort() {
  const port = nextPort;
  nextPort += 2; // leave room for RTCP if a codec ever needs a non-muxed port
  const maxPort = parseInt(process.env.RECORDER_MAX_PORT || '29998', 10);
  if (nextPort > maxPort) nextPort = parseInt(process.env.RECORDER_MIN_PORT || '20000', 10);
  return port;
}

/**
 * Starts recording a single producer's media to disk by consuming it through
 * a PlainTransport (server-side, no ICE/DTLS) and piping the raw RTP into
 * ffmpeg via an SDP file. One call to this per producer (audio and video are
 * recorded as separate files — muxing them live requires a second ffmpeg
 * pass, done in stopRecording).
 */
async function recordProducer({ router, producer, recordingId }) {
  const listenIp = process.env.RECORDER_LISTEN_IP || '127.0.0.1';
  const rtpTransport = await router.createPlainTransport({
    listenIp: { ip: listenIp },
    rtcpMux: true,
    comedia: false
  });

  const port = allocatePort();
  await rtpTransport.connect({ ip: listenIp, port });

  const consumer = await rtpTransport.consume({
    producerId: producer.id,
    rtpCapabilities: router.rtpCapabilities,
    paused: true
  });

  const codec = consumer.rtpParameters.codecs[0];
  const kind = consumer.kind;
  const encName = codec.mimeType.split('/')[1];

  const sdp = [
    'v=0',
    `o=- 0 0 IN IP4 ${listenIp}`,
    's=prisonconnect-recording',
    `c=IN IP4 ${listenIp}`,
    't=0 0',
    `m=${kind} ${port} RTP/AVP ${codec.payloadType}`,
    `a=rtpmap:${codec.payloadType} ${encName}/${codec.clockRate}${kind === 'audio' ? '/' + codec.channels : ''}`,
    'a=recvonly'
  ].join('\n');

  const sdpPath = path.join(RECORDINGS_DIR, `${recordingId}-${kind}.sdp`);
  fs.writeFileSync(sdpPath, sdp);

  const outputPath = path.join(
    RECORDINGS_DIR,
    `${recordingId}-${kind}.${kind === 'video' ? 'webm' : 'ogg'}`
  );

  const ffmpegArgs = [
    '-protocol_whitelist', 'file,udp,rtp',
    '-i', sdpPath,
    '-y',
    outputPath
  ];
  const ffmpegProc = spawn('ffmpeg', ffmpegArgs, { stdio: ['ignore', 'ignore', 'pipe'] });
  ffmpegProc.stderr.on('data', () => {}); // discard; wire to a log file if needed

  await consumer.resume();

  return { kind, transport: rtpTransport, consumer, ffmpegProc, outputPath, sdpPath };
}

async function stopHandle(handle) {
  if (!handle) return null;
  try { handle.ffmpegProc.kill('SIGINT'); } catch (_) {}
  try { handle.consumer.close(); } catch (_) {}
  try { handle.transport.close(); } catch (_) {}
  try { fs.unlinkSync(handle.sdpPath); } catch (_) {}
  return handle.outputPath;
}

module.exports = { recordProducer, stopHandle, RECORDINGS_DIR };
