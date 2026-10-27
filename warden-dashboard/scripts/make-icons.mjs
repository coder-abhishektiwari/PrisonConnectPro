/**
 * Renders public/ic_icon.webp into the app icon set:
 *   build/icon.png  — 512×512 master (Linux .deb / AppImage, generic use)
 *   build/icon.ico  — multi-size Windows icon (NSIS installer + app.exe)
 *
 * Run: npm run icons   (from the warden-dashboard directory)
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import toIco from 'to-ico';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const source = join(root, 'public', 'ic_icon.webp');
const buildDir = join(root, 'build');
const icoSizes = [16, 32, 48, 64, 128, 256];
const transparent = { r: 0, g: 0, b: 0, alpha: 0 };

const input = await readFile(source);

async function png(size) {
  return sharp(input)
    .resize(size, size, { fit: 'contain', background: transparent })
    .png()
    .toBuffer();
}

await mkdir(buildDir, { recursive: true });

const master = await png(512);
await writeFile(join(buildDir, 'icon.png'), master);

const icoBuffer = await toIco(await Promise.all(icoSizes.map((size) => png(size))));
await writeFile(join(buildDir, 'icon.ico'), icoBuffer);

console.log(`Icons written: build/icon.png (512), build/icon.ico [${icoSizes.join(', ')}]`);
