#!/usr/bin/env node
// One-shot helper: read the current config.mdx tables and emit
// scripts/config-descriptions.json so we capture the hand-tuned prose as
// override values for future regeneration.

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const mdxPath = resolve(__dirname, '..', 'src', 'content', 'docs', 'reference', 'config.mdx');
const outPath = resolve(__dirname, 'config-descriptions.json');

const mdx = readFileSync(mdxPath, 'utf8');
const out = {};

// Match table rows: `| \`key\` | \`default\` | description |`
// Skip the header and the alignment rows.
const rowRe = /^\|\s*`([^`]+)`\s*\|[^|]*\|\s*(.+?)\s*\|\s*$/gm;
let m;
while ((m = rowRe.exec(mdx)) !== null) {
  const key = m[1];
  const desc = m[2].trim();
  // Skip the eq_gains-style rows where the key contains `, ...` (literals not
  // setting names).
  if (key.includes(',') || key.includes(' ')) continue;
  out[key] = { description: desc };
}

const sorted = Object.fromEntries(
  Object.entries(out).sort(([a], [b]) => a.localeCompare(b))
);

writeFileSync(outPath, JSON.stringify(sorted, null, 2) + '\n');
console.log(`seeded ${Object.keys(sorted).length} descriptions → ${outPath}`);
