#!/usr/bin/env node
// Parse nokkvi's Rust config structs into a canonical JSON schema.
// Reads from $NOKKVI_PATH (default: ./nokkvi) and writes scripts/config-schema.json.

import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const NOKKVI = process.env.NOKKVI_PATH
  ? resolve(process.env.NOKKVI_PATH)
  : resolve(__dirname, '..', 'nokkvi');

const FILES = {
  toml: 'data/src/types/toml_settings.rs',
  enums: 'data/src/types/player_settings.rs',
  visualizer: 'data/src/types/visualizer_config.rs',
  credentials: 'data/src/credentials.rs',
  views: 'data/src/types/toml_views.rs',
  sortMode: 'data/src/types/sort_mode.rs',
  queueSortMode: 'data/src/types/queue_sort_mode.rs',
  viewColumns: 'data/src/types/view_columns.rs',
  eq: 'data/src/audio/eq.rs',
};

// Maps the `// -- X --` markers in toml_settings.rs to the canonical doc section.
const SECTION_MAP = {
  'Application': 'General',
  'Behavior': 'Behavior',
  'Interface': 'Interface',
  'Metadata Strip': 'MetadataStrip',
  'Playback': 'Playback',
  'Scrobbling': 'Scrobbling',
  'Playlists': 'Playlists',
  'Equalizer': 'AudioEngine',
  'Genres view column toggles': 'General',
  'Playlists view column toggles': 'General',
};

// Maps canonical section names → sentinel ids used in config.mdx
// ({/* config-table:start id="..." */}). Kept here for reference and to keep
// the /sync-config-docs command in sync; the schema itself just stores the
// canonical section name.
//
// General → general, Interface → interface, Behavior → behavior,
// MetadataStrip → metadata-strip, Playback → playback, Scrobbling → scrobbling,
// Playlists → playlists, Views → views, VisualizerGeneral → visualizer-general,
// VisualizerBars → visualizer-bars, VisualizerLines → visualizer-lines,
// VisualizerScope → visualizer-scope, AudioEngine → audio-engine.

// Per-key section overrides where the docs group differently than the source.
const SECTION_OVERRIDES = {
  sound_effects_enabled: 'AudioEngine',
  sfx_volume: 'AudioEngine',
};

function read(rel) {
  const abs = join(NOKKVI, rel);
  // Check if a module directory exists in place of a .rs file
  // (e.g. player_settings.rs → player_settings/).
  const dirAlt = abs.endsWith('.rs') ? abs.slice(0, -3) : null;
  try {
    const s = statSync(dirAlt ?? abs);
    if (s.isDirectory()) {
      return readdirSync(dirAlt ?? abs)
        .filter(f => f.endsWith('.rs'))
        .sort()
        .map(f => readFileSync(join(dirAlt ?? abs, f), 'utf8'))
        .join('\n');
    }
  } catch { /* fall through */ }
  return readFileSync(abs, 'utf8');
}

// ── Rust syntax helpers ─────────────────────────────────────────────────────

function camelToSnake(s) {
  return s.replace(/([a-z0-9])([A-Z])/g, '$1_$2').toLowerCase();
}

function applyRename(variant, mode) {
  if (!mode) return variant;
  switch (mode) {
    case 'snake_case': return camelToSnake(variant);
    case 'lowercase': return variant.toLowerCase();
    case 'UPPERCASE': return variant.toUpperCase();
    case 'kebab-case': return camelToSnake(variant).replace(/_/g, '-');
    case 'SCREAMING_SNAKE_CASE': return camelToSnake(variant).toUpperCase();
    case 'camelCase': return variant[0].toLowerCase() + variant.slice(1);
    case 'PascalCase': return variant;
    default: return variant;
  }
}

// Extract a struct body by name. Returns the text between the matching braces,
// or null if not found. Handles nested braces by counting depth.
function extractBlock(source, header) {
  const start = source.indexOf(header);
  if (start === -1) return null;
  const open = source.indexOf('{', start);
  if (open === -1) return null;
  let depth = 1;
  for (let i = open + 1; i < source.length; i++) {
    if (source[i] === '{') depth++;
    else if (source[i] === '}') {
      depth--;
      if (depth === 0) return source.slice(open + 1, i);
    }
  }
  return null;
}

// Parse `pub field: Type,` lines from a struct body, attaching preceding ///
// doc comments and tracking `// -- Section --` markers. Set `allowPrivate`
// for structs whose fields are not all `pub` (e.g. internal credentials).
// Honors `#[serde(rename = "X")]` — the renamed value becomes the canonical
// TOML key, which is what end users see and what the docs document.
function parseFields(body, { allowPrivate = false } = {}) {
  const lines = body.split('\n');
  const fields = [];
  let doc = [];
  let section = null;
  let pendingRename = null;
  const fieldRe = allowPrivate
    ? /^(?:pub\s+)?(\w+):\s*(.+?),?\s*$/
    : /^pub\s+(\w+):\s*(.+?),?\s*$/;

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) { doc = []; continue; }

    const secMatch = line.match(/^\/\/\s*--\s*(.+?)\s*--\s*$/);
    if (secMatch) { section = secMatch[1]; doc = []; continue; }

    const docMatch = line.match(/^\/\/\/\s?(.*)$/);
    if (docMatch) { doc.push(docMatch[1]); continue; }

    if (line.startsWith('//')) { doc = []; continue; }

    const renameMatch = line.match(/^#\[serde\(rename\s*=\s*"([^"]+)"\)\]/);
    if (renameMatch) { pendingRename = renameMatch[1]; continue; }

    if (line.startsWith('#[')) continue;

    const fieldMatch = line.match(fieldRe);
    if (fieldMatch) {
      fields.push({
        name: fieldMatch[1],
        tomlKey: pendingRename ?? fieldMatch[1],
        rustType: fieldMatch[2].replace(/,$/, '').trim(),
        section,
        doc: doc.join(' ').trim(),
      });
      doc = [];
      pendingRename = null;
    }
  }
  return fields;
}

// Parse `const TABLE: &[(EnumName, MetaStruct)] = &[ (EnumName::Variant,
// MetaStruct { ..., toml_key: "value", ... }), ... ];` and return a map from
// variant → toml_key for each enum found. Used to resolve default expressions
// like `SortMode::RecentlyAdded.to_toml_key().to_string()`.
function parseTomlKeyTables(...sources) {
  const out = {};
  const re = /\(\s*(\w+)::(\w+)\s*,\s*\w+\s*\{[\s\S]*?toml_key:\s*"([^"]+)"[\s\S]*?\}\s*,?\s*\)/g;
  for (const source of sources) {
    let m;
    while ((m = re.exec(source)) !== null) {
      const [, enumName, variant, tomlKey] = m;
      if (!out[enumName]) out[enumName] = {};
      out[enumName][variant] = tomlKey;
    }
    re.lastIndex = 0;
  }
  return out;
}

// Strip a trailing `// ...` comment, but only when preceded by whitespace so
// we don't accidentally cut into `://` inside strings.
function stripTrailingComment(line) {
  return line.replace(/\s+\/\/.*$/, '').trim();
}

// Parse `field: <expr>,` lines from inside a `Self { ... }` block.
// Tolerates trailing inline comments and nested struct expressions.
function parseDefaultExprs(body) {
  const exprs = {};
  if (!body) return exprs;
  const lines = body.split('\n');
  let buffer = '';
  let depth = 0;

  for (const raw of lines) {
    const trimmed = raw.trim();
    if (!trimmed || trimmed.startsWith('//')) {
      if (depth === 0) buffer = '';
      continue;
    }
    const line = stripTrailingComment(trimmed);
    if (!line) continue;
    buffer += (buffer ? ' ' : '') + line;
    for (const c of line) {
      if (c === '{' || c === '[' || c === '(') depth++;
      else if (c === '}' || c === ']' || c === ')') depth--;
    }
    if (depth !== 0) continue;
    if (!buffer.endsWith(',')) continue;

    const stripped = buffer.replace(/,\s*$/, '').trim();
    const m = stripped.match(/^(\w+):\s*([\s\S]+)$/);
    if (m) exprs[m[1]] = m[2].trim();
    buffer = '';
  }
  return exprs;
}

// Find standalone helper functions like `fn name() -> T { value }` so we can
// inline their return values when they appear as default expressions. The body
// is allowed to span multiple lines as long as it contains no nested braces.
function parseSimpleFns(source) {
  const fns = {};
  const re = /fn\s+(\w+)\s*\(\)\s*->\s*\w+\s*\{\s*([^{}]+?)\s*\}/g;
  let m;
  while ((m = re.exec(source)) !== null) {
    fns[m[1]] = m[2].replace(/\s+/g, ' ').trim();
  }
  return fns;
}

// Find `pub const NAME: TYPE = LITERAL;` declarations so bare constant
// references in default expressions can be inlined.
function parseConsts(source) {
  const consts = {};
  const re = /pub const ([A-Z][A-Z0-9_]*)\s*:\s*[^=]+=\s*([^;]+);/g;
  let m;
  while ((m = re.exec(source)) !== null) {
    consts[m[1]] = m[2].trim();
  }
  return consts;
}

// Parse `pub enum Name { ... }` blocks, capturing #[serde(rename_all)] and
// #[default] markers to resolve TOML serialization values. Also handles the
// `wire_enum!` macro (visualizer enums), whose variants carry an explicit wire
// literal in `Variant = <disc> => "wire"` form — that literal wins over
// rename_all, matching the `#[serde(rename = "wire")]` the macro emits.
function parseEnums(source) {
  const enums = {};
  const re = /pub enum (\w+)\s*\{/g;
  let match;
  while ((match = re.exec(source)) !== null) {
    const name = match[1];
    const headerStart = match.index;
    // Look back for #[serde(rename_all = "...")] in the preceding ~15 lines.
    const before = source.slice(Math.max(0, headerStart - 600), headerStart);
    const renameMatch = before.match(/#\[serde\(rename_all\s*=\s*"([^"]+)"\)\]/);
    const renameAll = renameMatch ? renameMatch[1] : null;

    const body = extractBlock(source, `pub enum ${name}`);
    if (!body) continue;

    const variants = [];
    let defaultVariant = null;
    let pendingDefault = false;
    let pendingRename = null;

    for (const raw of body.split('\n')) {
      const line = raw.trim();
      if (!line || line.startsWith('//')) continue;

      if (line === '#[default]') { pendingDefault = true; continue; }
      const renameOne = line.match(/^#\[serde\(rename\s*=\s*"([^"]+)"\)\]/);
      if (renameOne) { pendingRename = renameOne[1]; continue; }
      if (line.startsWith('#[')) continue;

      const variantMatch = line.match(/^([A-Z]\w*)/);
      if (variantMatch) {
        const rust = variantMatch[1];
        // `wire_enum!` variants (`Variant = 2 => "wire",`) pin the wire literal
        // explicitly; prefer it over the rename_all fallback. `#[serde(rename)]`
        // still wins if present.
        const wireArrow = line.match(/=>\s*"([^"]+)"/);
        const toml = pendingRename ?? (wireArrow ? wireArrow[1] : applyRename(rust, renameAll));
        variants.push({ rust, toml });
        if (pendingDefault) defaultVariant = toml;
        pendingDefault = false;
        pendingRename = null;
      }
    }
    enums[name] = { renameAll, variants, default: defaultVariant };
  }
  return enums;
}

// Resolve a Rust default expression into a JSON-friendly value.
// `nested` maps nested-struct type names to their field-default maps;
// `fns` maps simple `fn name() -> T { value }` helpers to their return value;
// `consts` maps SCREAMING_SNAKE_CASE constant names to their literal value;
// `tomlKeys` maps `EnumName.Variant` → toml_key string, populated from the
// metadata tables in sort_mode.rs / queue_sort_mode.rs.
function resolveDefault(expr, enums, nested, fns = {}, consts = {}, tomlKeys = {}) {
  // Strip module path prefixes like `crate::types::player_settings::Foo::bar` → `Foo::bar`.
  const e = expr.trim().replace(/^(?:\w+::)+([A-Z]\w*::)/, '$1');

  // Inline standalone helper functions (e.g. default_auto_sensitivity()).
  let fnMatch = e.match(/^(\w+)\(\)$/);
  if (fnMatch && fns[fnMatch[1]]) {
    return resolveDefault(fns[fnMatch[1]], enums, nested, fns, consts, tomlKeys);
  }

  // Inline bare constants, including module-path-prefixed forms like
  // `crate::types::player_settings::ARTWORK_COLUMN_WIDTH_PCT_DEFAULT`.
  const constMatch = e.match(/^(?:\w+::)*([A-Z][A-Z0-9_]*)$/);
  if (constMatch && consts[constMatch[1]]) {
    return resolveDefault(consts[constMatch[1]], enums, nested, fns, consts, tomlKeys);
  }

  let m;
  if ((m = e.match(/^"([^"]*)"$/))) return m[1];
  if ((m = e.match(/^"([^"]*)"\.to_string\(\)$/))) return m[1];
  if ((m = e.match(/^String::from\("([^"]*)"\)$/))) return m[1];
  if (e === 'String::new()') return '';
  if (e === 'Vec::new()') return [];
  if (e === 'true' || e === 'false') return e === 'true';
  if (/^-?\d+\.\d+$/.test(e)) return parseFloat(e);
  if (/^-?\d+$/.test(e)) return parseInt(e, 10);

  // Array literal: [value; N] where N is a number or a const (e.g.
  // `[0.0; EQ_BAND_COUNT]`). Resolve the count through consts when not numeric.
  if ((m = e.match(/^\[(.+?);\s*([\w:]+)\s*\]$/))) {
    const v = resolveDefault(m[1], enums, nested, fns, consts, tomlKeys);
    const count = /^\d+$/.test(m[2])
      ? parseInt(m[2], 10)
      : resolveDefault(m[2], enums, nested, fns, consts, tomlKeys);
    if (typeof count === 'number') return new Array(count).fill(v);
  }

  // EnumName::Variant.to_toml_key()(.to_string())? — resolved from the
  // metadata tables in sort_mode.rs / queue_sort_mode.rs.
  if ((m = e.match(/^(\w+)::(\w+)\.to_toml_key\(\)(?:\.to_string\(\))?$/))) {
    const v = tomlKeys[m[1]]?.[m[2]];
    if (v !== undefined) return v;
  }

  // EnumName::default()
  if ((m = e.match(/^(\w+)::default\(\)$/))) {
    if (enums[m[1]]) return enums[m[1]].default;
    if (nested[m[1]]) return { __nested: m[1] };
  }

  // EnumName::Variant
  if ((m = e.match(/^(\w+)::(\w+)$/))) {
    if (enums[m[1]]) {
      const v = enums[m[1]].variants.find(x => x.rust === m[2]);
      if (v) return v.toml;
    }
  }

  // Fallback: return raw expression for human review.
  return { __unresolved: e };
}

// ── Main extraction ─────────────────────────────────────────────────────────

const tomlSrc = read(FILES.toml);
const enumSrc = read(FILES.enums);
const vizSrc = read(FILES.visualizer);
const credSrc = read(FILES.credentials);
const viewsSrc = read(FILES.views);
const sortModeSrc = read(FILES.sortMode);
const queueSortModeSrc = read(FILES.queueSortMode);
const viewColumnsSrc = read(FILES.viewColumns);
const eqSrc = read(FILES.eq);

const enums = { ...parseEnums(enumSrc), ...parseEnums(vizSrc) };
const fns = { ...parseSimpleFns(vizSrc), ...parseSimpleFns(tomlSrc) };
// eqSrc carries EQ_BAND_COUNT (used by `eq_gains: [0.0; EQ_BAND_COUNT]`).
const consts = { ...parseConsts(enumSrc), ...parseConsts(vizSrc), ...parseConsts(tomlSrc), ...parseConsts(eqSrc) };
const tomlKeys = parseTomlKeyTables(sortModeSrc, queueSortModeSrc);

// Phase 1: collect field definitions from each struct.
const tomlBody = extractBlock(tomlSrc, 'pub struct TomlSettings');
const tomlFields = parseFields(tomlBody);

const credBody = extractBlock(credSrc, 'struct Config');
const credFields = parseFields(credBody, { allowPrivate: true })
  .map(f => ({ ...f, section: 'Application' }));

const vizBody = extractBlock(vizSrc, 'pub struct VisualizerConfig');
const vizFields = parseFields(vizBody);
const barsBody = extractBlock(vizSrc, 'pub struct BarsConfig');
const barsFields = parseFields(barsBody);
const linesBody = extractBlock(vizSrc, 'pub struct LinesConfig');
const linesFields = parseFields(linesBody);
const scopeBody = extractBlock(vizSrc, 'pub struct ScopeConfig');
const scopeFields = parseFields(scopeBody);

const viewsBody = extractBlock(viewsSrc, 'pub struct TomlViewPreferences');
const viewsFields = parseFields(viewsBody);

// ViewColumns is embedded in TomlSettings via `#[serde(flatten)]`, so its 50
// `<view>_show_<col>` fields stay TOP-LEVEL `[settings]` keys on the TOML wire.
// We expand them inline where the `view_columns` field sits in TomlSettings.
const viewColumnsBody = extractBlock(viewColumnsSrc, 'pub struct ViewColumns');
const viewColumnsFields = parseFields(viewColumnsBody);

// Phase 2: collect default expressions from each `impl Default`. The impl body
// contains `fn default() -> Self { Self { ... } }`; we want the innermost block.
function extractDefaultsBlock(source, structName) {
  const implBody = extractBlock(source, `impl Default for ${structName}`);
  if (!implBody) return null;
  const fnBody = extractBlock(implBody, 'fn default()');
  if (!fnBody) return null;
  return extractBlock(fnBody, 'Self');
}

const tomlDefaults = parseDefaultExprs(extractDefaultsBlock(tomlSrc, 'TomlSettings'));
const vizDefaults = parseDefaultExprs(extractDefaultsBlock(vizSrc, 'VisualizerConfig'));
const barsDefaults = parseDefaultExprs(extractDefaultsBlock(vizSrc, 'BarsConfig'));
const linesDefaults = parseDefaultExprs(extractDefaultsBlock(vizSrc, 'LinesConfig'));
const scopeDefaults = parseDefaultExprs(extractDefaultsBlock(vizSrc, 'ScopeConfig'));
const viewsDefaults = parseDefaultExprs(extractDefaultsBlock(viewsSrc, 'TomlViewPreferences'));
const viewColumnsDefaults = parseDefaultExprs(extractDefaultsBlock(viewColumnsSrc, 'ViewColumns'));

const nestedDefaults = {
  VisualizerConfig: vizDefaults,
  BarsConfig: barsDefaults,
  LinesConfig: linesDefaults,
  ScopeConfig: scopeDefaults,
};

// Phase 3: assemble the flat settings list.
function buildSetting(field, defaultExpr, opts = {}) {
  const { keyPrefix = '', sectionOverride = null } = opts;
  const resolved = defaultExpr !== undefined
    ? resolveDefault(defaultExpr, enums, nestedDefaults, fns, consts, tomlKeys)
    : null;

  // Strip Option<T> wrapper for type display only.
  const innerType = field.rustType.replace(/^Option<(.+)>$/, '$1');
  const enumName = enums[innerType] ? innerType : null;

  return {
    key: keyPrefix + (field.tomlKey ?? field.name),
    section: sectionOverride
      ?? SECTION_OVERRIDES[field.name]
      ?? SECTION_MAP[field.section]
      ?? field.section
      ?? 'Unknown',
    rustType: field.rustType,
    default: resolved,
    enumVariants: enumName ? enums[enumName].variants.map(v => v.toml) : null,
    doc: field.doc,
    sourceFile: opts.sourceFile,
  };
}

// Internal-only fields that exist in the Rust structs but are never written
// or read by users in `config.toml`. The drift checker would otherwise flag
// them forever as "added but undocumented". Keep this list tight — anything
// here is a deliberate decision to hide an implementation detail.
const HIDDEN_KEYS = new Set();

const settings = [];

// Credentials (server_url, username) live in config.toml under General.
for (const f of credFields) {
  settings.push(buildSetting(f, '""', {
    sourceFile: FILES.credentials,
    sectionOverride: 'General',
  }));
}

// TomlSettings — flat top-level fields. `visualization_mode` belongs to Playback;
// the visualizer.* sub-tree lives in VisualizerConfig (loaded separately by nokkvi).
for (const f of tomlFields) {
  if (HIDDEN_KEYS.has(f.name)) continue;
  // `#[serde(flatten)] view_columns: ViewColumns` — the 50 per-view column
  // toggles stay flat top-level keys on the wire, so expand them in place
  // rather than emitting a single opaque `view_columns` setting.
  if (f.rustType === 'ViewColumns') {
    for (const sub of viewColumnsFields) {
      if (HIDDEN_KEYS.has(sub.name)) continue;
      settings.push(buildSetting(sub, viewColumnsDefaults[sub.name], {
        sectionOverride: 'General',
        sourceFile: FILES.viewColumns,
      }));
    }
    continue;
  }
  settings.push(buildSetting(f, tomlDefaults[f.name], { sourceFile: FILES.toml }));
}

// TomlViewPreferences — per-view sort/direction settings under `[views]`.
for (const f of viewsFields) {
  if (HIDDEN_KEYS.has(f.name)) continue;
  settings.push(buildSetting(f, viewsDefaults[f.name], {
    sourceFile: FILES.views,
    sectionOverride: 'Views',
  }));
}

// VisualizerConfig flat fields → "VisualizerGeneral"; nested bars/lines are
// expanded with prefixed keys.
for (const f of vizFields) {
  if (f.name === 'bars') {
    for (const sub of barsFields) {
      settings.push(buildSetting(sub, barsDefaults[sub.name], {
        keyPrefix: 'visualizer.bars.',
        sectionOverride: 'VisualizerBars',
        sourceFile: FILES.visualizer,
      }));
    }
  } else if (f.name === 'lines') {
    for (const sub of linesFields) {
      settings.push(buildSetting(sub, linesDefaults[sub.name], {
        keyPrefix: 'visualizer.lines.',
        sectionOverride: 'VisualizerLines',
        sourceFile: FILES.visualizer,
      }));
    }
  } else if (f.name === 'scope') {
    for (const sub of scopeFields) {
      settings.push(buildSetting(sub, scopeDefaults[sub.name], {
        keyPrefix: 'visualizer.scope.',
        sectionOverride: 'VisualizerScope',
        sourceFile: FILES.visualizer,
      }));
    }
  } else {
    settings.push(buildSetting(f, vizDefaults[f.name], {
      keyPrefix: 'visualizer.',
      sectionOverride: 'VisualizerGeneral',
      sourceFile: FILES.visualizer,
    }));
  }
}

const out = {
  generated_at: new Date().toISOString(),
  nokkvi_path: NOKKVI,
  settings,
};

const outPath = resolve(__dirname, 'config-schema.json');
writeFileSync(outPath, JSON.stringify(out, null, 2) + '\n');

const unresolvedCount = settings.filter(s =>
  s.default && typeof s.default === 'object' && s.default.__unresolved
).length;

console.log(`extracted ${settings.length} settings → ${outPath}`);
if (unresolvedCount) {
  console.warn(`  ${unresolvedCount} default value(s) could not be resolved automatically`);
}
