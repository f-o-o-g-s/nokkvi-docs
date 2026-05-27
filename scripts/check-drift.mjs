#!/usr/bin/env node
// Compare config-schema.json (extracted from nokkvi source) against the
// settings tables in src/content/docs/reference/config.mdx and report any
// drift. Exits 0 if clean, 1 if drift detected.

import { readFileSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const schemaPath = resolve(__dirname, 'config-schema.json');
const descPath = resolve(__dirname, 'config-descriptions.json');
const mdxPath = resolve(__dirname, '..', 'src', 'content', 'docs', 'reference', 'config.mdx');

if (!existsSync(schemaPath)) {
  console.error('config-schema.json not found. Run scripts/extract-config.mjs first.');
  process.exit(2);
}

const schema = JSON.parse(readFileSync(schemaPath, 'utf8'));
const descriptions = existsSync(descPath)
  ? JSON.parse(readFileSync(descPath, 'utf8'))
  : {};
const mdx = readFileSync(mdxPath, 'utf8');

// ── Parse the markdown tables ───────────────────────────────────────────────

const docKeys = new Map(); // key → { default, line }
const rowRe = /^\|\s*`([^`]+)`\s*\|\s*([^|]+?)\s*\|\s*(.+?)\s*\|\s*$/gm;
let m;
while ((m = rowRe.exec(mdx)) !== null) {
  const key = m[1];
  // Skip overview-table pseudo-rows: TOML section headers (`[settings]`) and
  // multi-key cells. Real config rows always have a backticked literal in the
  // default cell — overview rows describe sections in prose instead.
  if (key.includes(',') || key.includes(' ') || key.startsWith('[')) continue;
  const defaultCell = m[2].trim();
  if (!defaultCell.startsWith('`')) continue;
  const lineNumber = mdx.slice(0, m.index).split('\n').length;
  docKeys.set(key, { default: defaultCell, line: lineNumber });
}

// ── Canonicalize default values for comparison ──────────────────────────────

function canonicalFromCode(v) {
  if (v === null || v === undefined) return null;
  if (typeof v === 'string') return JSON.stringify(v);
  if (typeof v === 'number') return Number(v).toString();
  if (typeof v === 'boolean') return v.toString();
  if (Array.isArray(v)) {
    if (v.length === 0) return '[]';
    return JSON.stringify(v);
  }
  return JSON.stringify(v);
}

function canonicalFromMd(raw) {
  let s = raw.trim();
  // Strip surrounding backticks (e.g. `5` → 5, `"play_all"` → "play_all").
  s = s.replace(/^`(.+)`$/, '$1').trim();
  // Strip *(default)* annotation if present.
  s = s.replace(/\s*\*\(default\)\*\s*$/, '').trim();
  // Numbers (integer or float).
  if (/^-?\d+(\.\d+)?$/.test(s)) return Number(s).toString();
  // Booleans.
  if (s === 'true' || s === 'false') return s;
  // Empty string literal.
  if (s === '""') return JSON.stringify('');
  // Quoted string.
  if (/^"[^"]*"$/.test(s)) return s;
  // Common shorthand for the eq_gains 10-element zero array.
  if (s === '[0.0, ...]') return JSON.stringify(new Array(10).fill(0));
  // Empty array.
  if (s === '[]') return '[]';
  return s; // raw fallback
}

// ── Compute drift ───────────────────────────────────────────────────────────

const codeKeys = new Set(schema.settings.map(s => s.key));

const added = [];
const removed = [];
const changedDefault = [];
const missingDescription = [];

for (const setting of schema.settings) {
  const inDocs = docKeys.get(setting.key);
  if (!inDocs) {
    added.push(setting);
    continue;
  }
  const codeCanon = canonicalFromCode(setting.default);
  const docCanon = canonicalFromMd(inDocs.default);
  if (codeCanon !== docCanon) {
    changedDefault.push({
      key: setting.key,
      docs: inDocs.default,
      code: codeCanon,
      docsLine: inDocs.line,
    });
  }
  if (!descriptions[setting.key]) {
    missingDescription.push(setting);
  }
}

for (const [key, info] of docKeys) {
  if (!codeKeys.has(key)) removed.push({ key, line: info.line });
}

// ── Report ──────────────────────────────────────────────────────────────────

const total = added.length + removed.length + changedDefault.length + missingDescription.length;
const json = process.argv.includes('--json');

if (json) {
  console.log(JSON.stringify({
    clean: total === 0,
    added,
    removed,
    changedDefault,
    missingDescription,
  }, null, 2));
  process.exit(total === 0 ? 0 : 1);
}

if (total === 0) {
  console.log(`✓ docs in sync with ${schema.settings.length} settings from nokkvi`);
  process.exit(0);
}

console.log(`drift detected: ${total} issue(s)\n`);

if (added.length) {
  console.log(`ADDED (in code, missing from docs): ${added.length}`);
  for (const s of added) {
    console.log(`  + ${s.key}  [${s.section}]  default=${canonicalFromCode(s.default)}`);
  }
  console.log();
}

if (removed.length) {
  console.log(`REMOVED (in docs, missing from code): ${removed.length}`);
  for (const r of removed) {
    console.log(`  - ${r.key}  (config.mdx:${r.line})`);
  }
  console.log();
}

if (changedDefault.length) {
  console.log(`CHANGED defaults: ${changedDefault.length}`);
  for (const c of changedDefault) {
    console.log(`  ! ${c.key}  docs=${c.docs}  code=${c.code}  (config.mdx:${c.docsLine})`);
  }
  console.log();
}

if (missingDescription.length) {
  console.log(`MISSING description override: ${missingDescription.length}`);
  for (const s of missingDescription) {
    const fallback = s.doc ? ` (rust doc: "${s.doc}")` : '';
    console.log(`  ? ${s.key}${fallback}`);
  }
  console.log();
}

process.exit(1);
