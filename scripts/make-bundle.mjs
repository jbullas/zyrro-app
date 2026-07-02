#!/usr/bin/env node
/**
 * make-bundle.mjs — assembles a single context bundle for the Zyrro planning surface.
 *
 * Run from the repo root:   node scripts/make-bundle.mjs
 * Output:                   context-bundle.md   (add to .gitignore; attach to the planning chat)
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
import path from 'node:path';

// --- config ---------------------------------------------------------------

const OUT = 'context-bundle.md';
const MAX_LINE = 2000; // lines longer than this are stripped (embedded assets, minified blobs)

// Include any tracked file with one of these extensions...
const TEXT_EXT = new Set(['.md', '.ts', '.tsx', '.js', '.mjs', '.css', '.sql', '.json']);

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

writeFileSync(OUT, parts.join('\n') + '\n', 'utf8');

console.log(`Wrote ${OUT}`);
console.log(`Included ${included} of ${tracked.length} tracked files.`);
console.log(`Excluded ${excluded.length} (binaries/assets/lockfile).`);
console.log(`Bundle size: ${(statSync(OUT).size / 1024).toFixed(0)} KB`);
