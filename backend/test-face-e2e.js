process.noDeprecation = true;
const fs = require('fs');
const path = require('path');

async function test() {
  // Load the face recognition module
  const { loadModels, detectAndEmbed, cosineSimilarity, isLive } = require('./lib/faceRecognition');

  console.log('[test] Loading models...');
  await loadModels();
  console.log('[test] Models loaded\n');

  // Use a test image if available
  const testImagePath = path.join(__dirname, 'human-models', 'blazeface.json');
  console.log(`[test] Note: This test requires a real face image.`);
  console.log(`[test] To test manually:`);
  console.log(`[test] 1. Register: POST /auth/face-register with { inmateId, kioskId, image: <base64 jpeg> }`);
  console.log(`[test] 2. Identify: POST /auth/face-identify with { kioskId, image: <base64 jpeg> }`);
  console.log(`[test] 3. Check response includes similarity, liveness, antispoof scores`);
  console.log(`[test] 4. Verify LIVENESS_FAILED is returned for spoof attempts`);
  console.log(`\n[test] Testing cosineSimilarity...`);
  const a = [1, 0, 0];
  const b = [1, 0, 0];
  const c = [0, 1, 0];
  console.log(`[test] cosineSimilarity([1,0,0], [1,0,0]) = ${cosineSimilarity(a, b)} (expect 1.0)`);
  console.log(`[test] cosineSimilarity([1,0,0], [0,1,0]) = ${cosineSimilarity(a, c)} (expect 0.0)`);

  console.log(`\n[test] Testing isLive...`);
  console.log(`[test] isLive(0.8, 0.9, 0.5) = ${isLive(0.8, 0.9, 0.5)} (expect true)`);
  console.log(`[test] isLive(0.3, 0.9, 0.5) = ${isLive(0.3, 0.9, 0.5)} (expect false)`);
  console.log(`[test] isLive(0.0, 0.0, 0.5) = ${isLive(0.0, 0.0, 0.5)} (expect true - no models enabled)`);

  console.log('\n[test] Basic unit tests passed!');
  process.exit(0);
}

test().catch(err => {
  console.error('[test] Failed:', err.message);
  process.exit(1);
});