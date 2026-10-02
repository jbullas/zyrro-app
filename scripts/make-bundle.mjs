#!/usr/bin/env node
/**
 * make-bundle.mjs — assembles a context bundle for the Zyrro planning surface.
 *
 * Run from the repo root:   npm run bundle
 *                           npm run bundle -- path
 *                           npm run bundle -- identity
 *                           npm run bundle -- --include components/OptionsFlow.tsx
 *                           npm run bundle -- path --include app/dashboard/page.tsx
 * Output:                   context-bundle.md   (gitignored; the source bundle)
 *                           context-bundle.zip   (gitignored; attach THIS to the planning chat)
 *
 * Approach: a curated default (small, flow-agnostic infra: AGENTS.md, non-changelog
 * docs, utils/supabase/, and the handful of lib/ files BOTH the /path and /identity
 * flows import), plus an optional area preset ("path" or "identity") that adds the
 * lib/, lib/prompts/, app/api/ routes, hooks and components that flow actually uses.
 * Changelogs are trimmed to the 3 most recent entries, and migrations are listed by
 * filename only (full SQL is dropped) — these keep the default bundle well under
 * 400KB even though the full repo is >2MB. The path/identity presets intentionally
 * run bigger than that (accepted as-is — see docs/changelogs/ for the call).
 *
 * The preset file lists below were built by tracing real `from '...'` imports
 * outward from each flow's entry points (app/path/page.tsx; app/start/page.tsx +
 * app/identity/page.tsx), not by guessing from filenames. If the import graph
 * changes, re-derive these lists rather than hand-patching them piecemeal.
 *
 * To narrow further, edit the constants below — they're the single place to change.
 */

import { readFileSync, writeFileSync, existsSync, statSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { deflateRawSync } from 'node:zlib';
import path from 'node:path';

// --- config ---------------------------------------------------------------

const OUT = 'context-bundle.md';
const ZIP_OUT = 'context-bundle.zip';
const MAX_LINE = 2000; // lines longer than this are stripped (embedded assets, minified blobs)
const CHANGELOG_COUNT = 3;

// Tracked-file prefixes allowed into the trimmed file tree (step 4). Everything
// else tracked (lockfiles, public/ assets, root config) is left out of the tree.
const TREE_PREFIXES = ['app/', 'components/', 'lib/', 'scripts/', 'utils/', 'docs/', 'supabase/migrations/'];

// Root-level files always included.
const DEFAULT_ROOT_FILES = ['AGENTS.md'];

// lib/ files imported by BOTH the /path and /identity flows — confirmed via the
// import graph (see file header). Not components: components shared by both flows
// are listed once per preset below instead, since the default has no app code.
const DEFAULT_LIB_FILES = [
  'lib/artifacts.ts',
  'lib/artifact-schemas.ts',
  'lib/with-db-retry.ts',
  'lib/use-auth-user.tsx',
  'lib/generation-status.ts',
  'lib/identity-questions.ts',
  'lib/llm.ts',
];

// Area presets: additive to the default set above. Each list is the full set of
// files that flow's entry point(s) reach, including the files already in
// DEFAULT_LIB_FILES (harmless duplication — the build step dedupes).
const PRESETS = {
  path: {
    pages: ['app/path/page.tsx'],
    apiRoutes: [
      'app/api/generate-path-options/route.ts',
      'app/api/generate-project-name/route.ts',
      'app/api/name-path-result/route.ts',
      'app/api/path-checkpoint-response/route.ts',
      'app/api/path-direction/route.ts',
      'app/api/path-options/route.ts',
      'app/api/path-report/route.ts',
      'app/api/select-path/route.ts',
    ],
    lib: [
      'lib/checkpoint-status.ts',
      'lib/entitlements.ts',
      'lib/generate-path-checkpoint.ts',
      'lib/generate-path-options-session.ts',
      'lib/generate-path-plan.ts',
      'lib/generate-path-report.ts',
      'lib/path-checkpoint.ts',
      'lib/path-direction.ts',
      'lib/path-options-session.ts',
      'lib/prompts/path-checkpoint.ts',
      'lib/prompts/path-options-semantic-check.ts',
      'lib/prompts/path-options-session.ts',
      'lib/prompts/path-plan.ts',
      'lib/prompts/path-report.ts',
      'lib/prompts/project-name.ts',
      'lib/use-path-direction.ts',
      'lib/use-path-options.ts',
      'lib/use-path-report.ts',
      'lib/use-project-naming.ts',
    ],
    components: [
      'components/ChipRow.tsx',
      'components/ConstellationCard.tsx',
      'components/DirectionFlow.tsx',
      'components/GatedState.tsx',
      'components/GeneratingState.tsx',
      'components/LinkButton.tsx',
      'components/MessageState.tsx',
      'components/OptionsFlow.tsx',
      'components/PathReportFlow.tsx',
      'components/PrimaryButton.tsx',
      'components/ReframeCtaBlock.tsx',
      'components/SecondaryButton.tsx',
      'components/SelectableList.tsx',
      'components/SubmitError.tsx',
    ],
  },
  identity: {
    pages: ['app/start/page.tsx', 'app/identity/page.tsx'],
    apiRoutes: [
      'app/api/complete-discovery/route.ts',
      'app/api/generate-identity-reframe/route.ts',
      'app/api/stage-discovery-answers/route.ts',
      'app/api/retry-generation/route.ts',
      'app/auth/callback/route.ts', // not under app/api/, but triggers kickoffIdentityGeneration on signup
    ],
    lib: [
      'lib/complete-discovery.ts',
      'lib/generate-identity-report.ts',
      'lib/kickoff-identity-generation.ts',
      'lib/prompts/identity-analysis.ts',
      'lib/prompts/identity-reframe.ts',
      'lib/prompts/identity-report.ts',
      'lib/signatures.ts',
    ],
    components: [
      'components/BackButton.tsx',
      'components/ConstellationCard.tsx',
      'components/DomainRadarChart.tsx',
      'components/GeneratingState.tsx',
      'components/IdentityBadge.tsx',
      'components/LinkButton.tsx',
      'components/MessageState.tsx',
      'components/PrimaryButton.tsx',
      'components/PrimarySignatureBars.tsx',
      'components/QuestionAnswerList.tsx',
      'components/ReframeCtaBlock.tsx',
      'components/SecondaryButton.tsx',
    ],
  },
};

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

function section(bytesBySection, key, bytes) {
  const cur = bytesBySection.get(key) || 0;
  bytesBySection.set(key, cur + bytes);
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

function categorize(file) {
  if (file.startsWith('docs/changelogs/')) return 'changelogs';
  if (file.startsWith('supabase/migrations/')) return 'migrations';
  if (file.startsWith('app/')) return 'app/';
  if (file.startsWith('components/')) return 'components/';
  if (file.startsWith('lib/')) return 'lib/';
  if (file.startsWith('scripts/')) return 'scripts/';
  if (file.startsWith('utils/')) return 'utils/';
  if (file.startsWith('docs/')) return 'docs/';
  return 'other';
}

// --- CLI args ---------------------------------------------------------------

function parseArgs(argv) {
  let preset = null;
  const includes = [];
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--include') {
      const val = argv[++i];
      if (val) includes.push(val);
      continue;
    }
    if (arg === 'path' || arg === 'identity') {
      if (preset) {
        console.warn(`Warning: preset already set to "${preset}" — ignoring extra "${arg}".`);
      } else {
        preset = arg;
      }
      continue;
    }
    console.warn(`Warning: unrecognized argument "${arg}" — ignoring.`);
  }
  return { preset, includes };
}

const { preset, includes } = parseArgs(process.argv.slice(2));

// --- build ----------------------------------------------------------------

let tracked;
try {
  tracked = trackedFiles();
} catch {
  console.error('git ls-files failed — run this from the repo root inside the git repo.');
  process.exit(1);
}
const trackedSet = new Set(tracked);

// Trimmed file tree (step 4).
const tree = tracked.filter((f) => TREE_PREFIXES.some((p) => f.startsWith(p)));

// Changelogs: last N only (step 2).
const allChangelogs = tracked
  .filter((f) => f.startsWith('docs/changelogs/') && f.endsWith('.md'))
  .sort()
  .reverse();
const recentChangelogs = allChangelogs.slice(0, CHANGELOG_COUNT);

// Migrations: filenames + current artifacts_type_check values (step 3).
const migrationFiles = tracked
  .filter((f) => f.startsWith('supabase/migrations/') && f.endsWith('.sql'))
  .sort();
let typeCheckValues = null;
let typeCheckSource = null;
for (const f of [...migrationFiles].reverse()) {
  const src = readFileSync(f, 'utf8');
  const m = src.match(/artifacts_type_check[\s\S]*?CHECK\s*\(\s*type\s+IN\s*\(([\s\S]*?)\)\s*\)/i);
  if (m) {
    typeCheckValues = m[1]
      .split(',')
      .map((s) => s.trim().replace(/^'|'$/g, ''))
      .filter(Boolean);
    typeCheckSource = f;
    break;
  }
}

// Default source-file set (replaces old flat step 5).
const defaultDocs = tracked.filter((f) => f.startsWith('docs/') && !f.startsWith('docs/changelogs/'));
const utilsSupabase = tracked.filter((f) => f.startsWith('utils/supabase/'));
const defaultLib = DEFAULT_LIB_FILES.filter((f) => trackedSet.has(f));

let sourceFiles = [
  ...DEFAULT_ROOT_FILES,
  ...defaultDocs,
  ...utilsSupabase,
  ...defaultLib,
];

if (preset) {
  const p = PRESETS[preset];
  sourceFiles.push(...p.pages, ...p.apiRoutes, ...p.lib, ...p.components);
}

for (const inc of includes) {
  if (!existsSync(inc)) {
    console.warn(`Warning: --include path not found: ${inc} — skipping.`);
    continue;
  }
  sourceFiles.push(inc);
}

// Dedupe, preserving first occurrence order.
sourceFiles = [...new Set(sourceFiles)];

// --- assemble ---------------------------------------------------------------

const parts = [
  `# Zyrro context bundle`,
  `Generated: ${new Date().toISOString()}`,
  preset ? `Preset: ${preset}` : `Preset: (default)`,
  ``,
  `Point-in-time snapshot of the repo for the planning surface. Treat as current truth;`,
  `it supersedes memory for all code-state facts (routes, structure, build status, model).`,
  ``,
  `===== TRACKED FILE TREE (trimmed: ${TREE_PREFIXES.join(', ')}) =====`,
  ``,
  '```',
  tree.join('\n'),
  '```',
  ``,
  `===== CHANGELOGS (${recentChangelogs.length} most recent of ${allChangelogs.length}) =====`,
  ``,
  `Older changelogs: docs/changelogs/ in repo (${allChangelogs.length} total).`,
];

for (const f of recentChangelogs) {
  parts.push(``, `----- ${f} -----`, ``, readProcessed(f));
}

parts.push(
  ``,
  `===== MIGRATIONS (filenames only — full SQL dropped) =====`,
  ``,
  '```',
  migrationFiles.join('\n'),
  '```',
  ``,
  typeCheckValues
    ? `Current artifacts_type_check allowed values (from ${typeCheckSource}):\n` +
      typeCheckValues.map((v) => `- ${v}`).join('\n')
    : `artifacts_type_check: not found in any migration.`
);

let included = 0;
const missing = [];
for (const file of sourceFiles) {
  if (!existsSync(file)) {
    missing.push(file);
    continue;
  }
  parts.push(``, `===== FILE: ${file} =====`, ``, readProcessed(file));
  included++;
}

const bundleText = parts.join('\n') + '\n';
writeFileSync(OUT, bundleText, 'utf8');
writeFileSync(ZIP_OUT, makeZip(OUT, Buffer.from(bundleText, 'utf8')));

// --- size report (step 7) ----------------------------------------------------

const totalBytes = statSync(OUT).size;
const bySection = new Map();

// Recompute sections straight from the written bundle by splitting on file markers.
{
  const raw = bundleText;
  const marker = /\n===== FILE: (.+?) =====\n/g;
  let m2;
  let lastIdx = 0;
  let lastName = null;
  const headerEnd = raw.indexOf('===== FILE:');
  const preamble = headerEnd === -1 ? raw : raw.slice(0, headerEnd);
  // Split preamble into tree/changelog/migration chunks for the report.
  const treeEnd = preamble.indexOf('===== CHANGELOGS');
  const changelogEnd = preamble.indexOf('===== MIGRATIONS');
  section(bySection, 'header + file tree', Buffer.byteLength(preamble.slice(0, treeEnd), 'utf8'));
  section(bySection, 'changelogs', Buffer.byteLength(preamble.slice(treeEnd, changelogEnd), 'utf8'));
  section(bySection, 'migrations', Buffer.byteLength(preamble.slice(changelogEnd), 'utf8'));
  while ((m2 = marker.exec(raw)) !== null) {
    if (lastName !== null) section(bySection, categorize(lastName.replace(/\\/g, '/')), Buffer.byteLength(raw.slice(lastIdx, m2.index), 'utf8'));
    lastName = m2[1];
    lastIdx = m2.index;
  }
  if (lastName !== null) section(bySection, categorize(lastName.replace(/\\/g, '/')), Buffer.byteLength(raw.slice(lastIdx), 'utf8'));
}

const zipBytes = statSync(ZIP_OUT).size;

console.log(`Wrote ${OUT}`);
console.log(`Wrote ${ZIP_OUT} (attach this one to the planning chat)`);
console.log(`Preset: ${preset || '(default)'}`);
console.log(`Included ${included} of ${sourceFiles.length} requested source files.`);
if (missing.length) console.log(`Missing (skipped): ${missing.join(', ')}`);
console.log(`Bundle size: ${(totalBytes / 1024).toFixed(1)} KB (.md), ${(zipBytes / 1024).toFixed(1)} KB (.zip)`);
console.log('');
console.log('Breakdown by section (of the .md):');
const rows = [...bySection.entries()].sort((a, b) => b[1] - a[1]);
for (const [k, v] of rows) {
  console.log(`  ${k.padEnd(20)} ${(v / 1024).toFixed(1).padStart(8)} KB`);
}
