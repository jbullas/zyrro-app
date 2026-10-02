#!/usr/bin/env node
/**
 * make-bundle.mjs — assembles a single context bundle for the Zyrro planning surface.
 *
 * Run from the repo root:   npm run bundle
 * Output:                   context-bundle.md   (add to .gitignore; the source bundle)
 *                           context-bundle.zip   (add to .gitignore; attach THIS to the planning chat)
 *
 * Approach: no curated file list. The bundle includes EVERY tracked text file
 * (driven off `git ls-files`), minus the lockfile and binary/asset types. This
 * means the planning surface sees exactly what the repo tracks — no assumptions,
 * nothing to keep extending. Very long lines (e.g. base64-embedded images) are
 * stripped so they don't bloat the bundle.
 *
 * To narrow it later, add extensions to skip in TEXT_EXT or names to DENY below.
 */

import { readFileSync, writeFileSync, existsSync, statSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { deflateRawSync } from 'node:zlib';
import path from 'node:path';

// --- config ---------------------------------------------------------------

const OUT = 'context-bundle.md';
const ZIP_OUT = 'context-bundle.zip';
const MAX_LINE = 2000; // lines longer than this are stripped (embedded assets, minified blobs)

// Include any tracked file with one of these extensions...
const TEXT_EXT = new Set(['.md', '.ts', '.tsx', '.mts', '.js', '.mjs', '.css', '.sql', '.json']);

// ...except these filenames (large/noisy, no planning value).
const DENY = new Set(['package-lock.json', 'context-bundle.md']);

// --- helpers --------------------------------------------------------------

function trackedFiles() {
  return execSync('git ls-files', { encoding: 'utf8' })
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean);
}

function readProcessed(file) {
  return readFileSync(file, 'utf8')
    .split('\n')
    .map((line) =>
      line.length > MAX_LINE
        ? `[stripped: ${line.length}-char line — likely an embedded asset]`
        : line
    )
    .join('\n');
}

// Minimal CRC-32 (standard zip/png polynomial), no library needed.
const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();

function crc32(buf) {
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    crc = CRC_TABLE[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

// Builds a single-entry .zip (DEFLATE) in pure JS via node:zlib — no external
// zip tool or extra dependency, so it works the same on Windows as anywhere else.
function makeZip(entryName, data) {
  const nameBuf = Buffer.from(entryName, 'utf8');
  const compressed = deflateRawSync(data);
  const crc = crc32(data);
  const now = new Date();
  const dosTime =
    ((now.getHours() << 11) | (now.getMinutes() << 5) | (now.getSeconds() >> 1)) & 0xffff;
  const dosDate =
    (((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate()) & 0xffff;

  const localHeader = Buffer.alloc(30);
  localHeader.writeUInt32LE(0x04034b50, 0); // local file header signature
  localHeader.writeUInt16LE(20, 4); // version needed
  localHeader.writeUInt16LE(0, 6); // flags
  localHeader.writeUInt16LE(8, 8); // compression method: deflate
  localHeader.writeUInt16LE(dosTime, 10);
  localHeader.writeUInt16LE(dosDate, 12);
  localHeader.writeUInt32LE(crc, 14);
  localHeader.writeUInt32LE(compressed.length, 18);
  localHeader.writeUInt32LE(data.length, 22);
  localHeader.writeUInt16LE(nameBuf.length, 26);
  localHeader.writeUInt16LE(0, 28); // extra field length

  const centralHeader = Buffer.alloc(46);
  centralHeader.writeUInt32LE(0x02014b50, 0); // central directory file header signature
  centralHeader.writeUInt16LE(20, 4); // version made by
  centralHeader.writeUInt16LE(20, 6); // version needed
  centralHeader.writeUInt16LE(0, 8); // flags
  centralHeader.writeUInt16LE(8, 10); // compression method: deflate
  centralHeader.writeUInt16LE(dosTime, 12);
  centralHeader.writeUInt16LE(dosDate, 14);
  centralHeader.writeUInt32LE(crc, 16);
  centralHeader.writeUInt32LE(compressed.length, 20);
  centralHeader.writeUInt32LE(data.length, 24);
  centralHeader.writeUInt16LE(nameBuf.length, 28);
  centralHeader.writeUInt16LE(0, 30); // extra field length
  centralHeader.writeUInt16LE(0, 32); // file comment length
  centralHeader.writeUInt16LE(0, 34); // disk number start
  centralHeader.writeUInt16LE(0, 36); // internal file attributes
  centralHeader.writeUInt32LE(0, 38); // external file attributes
  centralHeader.writeUInt32LE(0, 42); // relative offset of local header

  const eocd = Buffer.alloc(22);
  const centralDirSize = centralHeader.length + nameBuf.length;
  const centralDirOffset = localHeader.length + nameBuf.length + compressed.length;
  eocd.writeUInt32LE(0x06054b50, 0); // end of central directory signature
  eocd.writeUInt16LE(0, 4); // disk number
  eocd.writeUInt16LE(0, 6); // disk with central dir
  eocd.writeUInt16LE(1, 8); // entries on this disk
  eocd.writeUInt16LE(1, 10); // total entries
  eocd.writeUInt32LE(centralDirSize, 12);
  eocd.writeUInt32LE(centralDirOffset, 16);
  eocd.writeUInt16LE(0, 20); // comment length

  return Buffer.concat([
    localHeader,
    nameBuf,
    compressed,
    centralHeader,
    nameBuf,
    eocd,
  ]);
}

// --- build ----------------------------------------------------------------

let tracked;
try {
  tracked = trackedFiles();
} catch {
  console.error('git ls-files failed — run this from the repo root inside the git repo.');
  process.exit(1);
}

const parts = [
  `# Zyrro context bundle`,
  `Generated: ${new Date().toISOString()}`,
  ``,
  `Point-in-time snapshot of the repo for the planning surface. Treat as current truth;`,
  `it supersedes memory for all code-state facts (routes, structure, build status, model).`,
  ``,
  `===== TRACKED FILE TREE (git ls-files) =====`,
  ``,
  '```',
  tracked.join('\n'),
  '```',
];

let included = 0;
const excluded = [];
for (const file of tracked) {
  const base = path.basename(file);
  if (DENY.has(base) || !TEXT_EXT.has(path.extname(file)) || !existsSync(file)) {
    excluded.push(file);
    continue;
  }
  parts.push(``, `===== FILE: ${file} =====`, ``, readProcessed(file));
  included++;
}

const bundleText = parts.join('\n') + '\n';
writeFileSync(OUT, bundleText, 'utf8');
writeFileSync(ZIP_OUT, makeZip(OUT, Buffer.from(bundleText, 'utf8')));

console.log(`Wrote ${OUT}`);
console.log(`Wrote ${ZIP_OUT} (attach this one to the planning chat)`);
console.log(`Included ${included} of ${tracked.length} tracked files.`);
console.log(`Excluded ${excluded.length} (binaries/assets/lockfile).`);
console.log(`Bundle size: ${(statSync(OUT).size / 1024).toFixed(0)} KB (.md), ${(statSync(ZIP_OUT).size / 1024).toFixed(0)} KB (.zip)`);
