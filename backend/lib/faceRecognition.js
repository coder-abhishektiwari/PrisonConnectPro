const path = require('path');
const fs = require('fs');
const http = require('http');
const jpeg = require('jpeg-js');
const pngjs = require('pngjs');
// Bypass package "exports" restriction by loading the WASM build directly.
// Works everywhere: host monorepo (backend/lib -> ../../node_modules),
// Docker container (/app/lib -> ../node_modules) and Render.
function resolveHumanDir() {
  const candidates = [
    path.resolve(__dirname, '../../node_modules/@vladmandic/human'),
    path.resolve(__dirname, '../node_modules/@vladmandic/human'),
    path.resolve(__dirname, 'node_modules/@vladmandic/human')
  ];
  for (const dir of candidates) {
    if (fs.existsSync(path.join(dir, 'dist', 'human.node-wasm.js'))) return dir;
  }
  return candidates[0];
}
const HumanDir = resolveHumanDir();
const Human = require(path.join(HumanDir, 'dist/human.node-wasm.js'));

const MODELS_DIR = path.join(__dirname, '..', 'human-models');
const WASM_DIR = path.join(__dirname, '..', 'wasm');

let human = null;
let modelsLoaded = false;
let modelServer = null;

async function startModelServer() {
  return new Promise((resolve, reject) => {
    modelServer = http.createServer((req, res) => {
      const urlPath = decodeURIComponent(req.url.split('?')[0]);
      let filePath;
      if (urlPath.startsWith('/models/')) {
        filePath = path.join(MODELS_DIR, urlPath.replace('/models/', ''));
      } else if (urlPath.startsWith('/wasm/')) {
        filePath = path.join(WASM_DIR, urlPath.replace('/wasm/', ''));
      } else {
        res.writeHead(404); res.end('Not found'); return;
      }
      const resolved = path.resolve(filePath);
      if (!resolved.startsWith(path.resolve(MODELS_DIR)) && !resolved.startsWith(path.resolve(WASM_DIR))) {
        res.writeHead(403); res.end('Forbidden'); return;
      }
      fs.readFile(resolved, (err, data) => {
        if (err) { res.writeHead(404); res.end('Not found'); return; }
        const ext = path.extname(resolved).toLowerCase();
        const ct = ext === '.json' ? 'application/json' : ext === '.wasm' ? 'application/wasm' : 'application/octet-stream';
        res.writeHead(200, { 'Content-Type': ct }); res.end(data);
      });
    });
    modelServer.listen(0, '127.0.0.1', () => {
      const port = modelServer.address().port;
      console.log(`[human] Model server on port ${port}`);
      resolve(port);
    });
    modelServer.on('error', reject);
  });
}

function getHumanConfig(port) {
  return {
    backend: 'wasm',
    wasmPath: `http://127.0.0.1:${port}/wasm/`,
    modelBasePath: `http://127.0.0.1:${port}/models/`,
    debug: false,
    async: true,
    filter: { enabled: true, flip: false, equalization: true, width: 0, height: 0, return: false },
    face: {
      enabled: true,
      detector: { enabled: true, rotation: true, maxDetected: 1, minConfidence: 0.2, minSize: 0, iouThreshold: 0.1, scale: 1.4, mask: false, return: false },
      mesh: { enabled: true, keepInvalid: false },
      iris: { enabled: false },
      emotion: { enabled: false },
      description: { enabled: true, minConfidence: 0.1 },
      antispoof: { enabled: true },
      liveness: { enabled: true },
    },
    body: { enabled: false },
    hand: { enabled: false },
    object: { enabled: false },
    gesture: { enabled: false },
    segmentation: { enabled: false },
  };
}

async function loadModels() {
  if (modelsLoaded) return;
  const requiredFiles = [
    'blazeface.json', 'blazeface.bin',
    'facemesh.json', 'facemesh.bin',
    'faceres.json', 'faceres.bin',
    'liveness.json', 'liveness.bin',
    'antispoof.json', 'antispoof.bin',
  ];
  const missing = requiredFiles.filter(f => !fs.existsSync(path.join(MODELS_DIR, f)));
  if (missing.length > 0) {
    throw new Error(`Missing Human models: ${missing.join(', ')}`);
  }
  const wasmFiles = ['tfjs-backend-wasm.wasm', 'tfjs-backend-wasm-simd.wasm', 'tfjs-backend-wasm-threaded-simd.wasm'];
  const missingWasm = wasmFiles.filter(f => !fs.existsSync(path.join(WASM_DIR, f)));
  if (missingWasm.length > 0) {
    throw new Error(`Missing WASM files: ${missingWasm.join(', ')}`);
  }

  const port = await startModelServer();
  const config = getHumanConfig(port);
  human = new Human.Human(config);
  await human.tf.ready();
  await human.load();
  modelsLoaded = true;
  console.log('[human] Models loaded successfully');
  console.log('[human] Backend:', human.tf.getBackend());
  console.log('[human] Loaded models:', human.models.loaded());
}

function decodeImageBuffer(imageBuffer) {
  if (imageBuffer[0] === 0xff && imageBuffer[1] === 0xd8) {
    const decoded = jpeg.decode(imageBuffer, { useTArray: true, formatAsRGBA: true });
    return { data: decoded.data, width: decoded.width, height: decoded.height };
  }
  if (imageBuffer[0] === 0x89 && imageBuffer[1] === 0x50 && imageBuffer[2] === 0x4e && imageBuffer[3] === 0x47) {
    const png = pngjs.PNG.sync.read(imageBuffer);
    return { data: png.data, width: png.width, height: png.height };
  }
  throw new Error('Unsupported image format. Only JPEG and PNG are supported.');
}

function pixelsToTensor(human, data, width, height) {
  return human.tf.tidy(() => {
    const tensor = human.tf.tensor3d(new Uint8Array(data), [height, width, 4]);
    const rgb = human.tf.slice(tensor, [0, 0, 0], [height, width, 3]);
    const expanded = human.tf.expandDims(rgb, 0);
    return human.tf.cast(expanded, 'float32');
  });
}

async function detectAndEmbed(imageBuffer) {
  if (!modelsLoaded) await loadModels();
  if (!human) throw new Error('Human not initialized');

  let tensor;
  try {
    const { data, width, height } = decodeImageBuffer(imageBuffer);
    tensor = pixelsToTensor(human, data, width, height);
  } catch (e) {
    if (e.message === 'Unsupported image format. Only JPEG and PNG are supported.') throw e;
    throw new Error('Invalid image format');
  }

  try {
    const result = await human.detect(tensor, getHumanConfig(modelServer.address().port));

    if (!result.face || result.face.length === 0) {
      throw new Error('NO_FACE_DETECTED');
    }
    if (result.face.length > 1) {
      throw new Error('MULTIPLE_FACES_DETECTED');
    }

    const face = result.face[0];
    if (!face.embedding || !Array.isArray(face.embedding) || face.embedding.length === 0) {
      throw new Error('NO_EMBEDDING');
    }

    return {
      embedding: Array.from(face.embedding),
      liveness: face.live || 0,
      antispoof: face.real || 0,
      faceScore: face.score || 0,
      boxScore: face.boxScore || 0,
    };
  } finally {
    if (tensor) human.tf.dispose(tensor);
  }
}

function cosineSimilarity(embeddingA, embeddingB) {
  if (!Array.isArray(embeddingA) || !Array.isArray(embeddingB)) return 0;
  if (embeddingA.length !== embeddingB.length) return 0;
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < embeddingA.length; i++) {
    const a = embeddingA[i], b = embeddingB[i];
    dot += a * b;
    normA += a * a;
    normB += b * b;
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

function isLive(liveness, antispoof, threshold = 0.5) {
  if (liveness !== undefined && liveness !== null && liveness > 0 && liveness < threshold) return false;
  if (antispoof !== undefined && antispoof !== null && antispoof > 0 && antispoof < threshold) return false;
  return true;
}

module.exports = {
  loadModels,
  detectAndEmbed,
  cosineSimilarity,
  isLive,
};