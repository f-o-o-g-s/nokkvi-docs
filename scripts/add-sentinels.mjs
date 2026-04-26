#!/usr/bin/env node
// One-shot helper: wrap each settings table in config.mdx with
// `{/* config-table:start id="..." */}` / `{/* config-table:end */}` sentinels
// so future regeneration tools can target table content without disturbing
// the surrounding prose. Idempotent — running twice is a no-op.

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const mdxPath = resolve(__dirname, '..', 'src', 'content', 'docs', 'reference', 'config.mdx');

// Heading text → sentinel id. Order matters; first match wins per section.
const SECTIONS = [
  ['## General Settings', 'general'],
  ['## Interface Settings', 'interface'],
  ['### Metadata Strip Customization', 'metadata-strip'],
  ['## Behavior Settings', 'behavior'],
  ['## Playback Settings', 'playback'],
  ['### Scrobbling', 'scrobbling'],
  ['### Playlists', 'playlists'],
  ['### General Visualizer', 'visualizer-general'],
  ['### Bars Mode', 'visualizer-bars'],
  ['### Lines Mode', 'visualizer-lines'],
  ['## Audio Engine (Internal)', 'audio-engine'],
];

const START_RE = (id) => new RegExp(`\\{/\\* config-table:start id="${id}" \\*/\\}`);
const END_MARK = '{/* config-table:end */}';

let mdx = readFileSync(mdxPath, 'utf8');
const lines = mdx.split('\n');

let inserted = 0;
let skipped = 0;

for (const [heading, id] of SECTIONS) {
  const headingIdx = lines.findIndex(l => l.trim() === heading);
  if (headingIdx === -1) {
    console.warn(`heading not found: ${heading}`);
    continue;
  }

  // Find the first table row after the heading (the `| Key |...` header).
  let tableStart = -1;
  for (let i = headingIdx + 1; i < lines.length; i++) {
    if (lines[i].startsWith('| Key |')) { tableStart = i; break; }
    // Stop searching if we hit the next heading without finding a table.
    if (lines[i].startsWith('#')) break;
  }
  if (tableStart === -1) {
    console.warn(`no table found under: ${heading}`);
    continue;
  }

  // Find the last consecutive table row (lines starting with `|`).
  let tableEnd = tableStart;
  for (let i = tableStart + 1; i < lines.length; i++) {
    if (lines[i].startsWith('|')) tableEnd = i;
    else break;
  }

  // Idempotency: skip if already wrapped.
  const above = lines[tableStart - 1] ?? '';
  const below = lines[tableEnd + 1] ?? '';
  if (START_RE(id).test(above) && below.trim() === END_MARK) {
    skipped++;
    continue;
  }

  // Insert end first (higher index) so we don't shift the start index.
  lines.splice(tableEnd + 1, 0, END_MARK);
  lines.splice(tableStart, 0, `{/* config-table:start id="${id}" */}`);
  inserted++;
}

writeFileSync(mdxPath, lines.join('\n'));
console.log(`sentinels inserted: ${inserted}, already present: ${skipped}`);
