---
description: Detect and apply drift between nokkvi's config structs and the docs
allowed-tools: Bash, Read, Edit, Write
---

Sync the config reference page (`src/content/docs/reference/config.mdx`) against the live nokkvi source. The flow is **detect → propose → confirm → apply** — never silently rewrite tables.

## Steps

1. **Refresh the schema.** Run `node scripts/extract-config.mjs`. This parses the Rust source under `nokkvi/` (or `$NOKKVI_PATH`) and writes `scripts/config-schema.json`. If the script errors out (parse failure, missing file), stop and surface the error — that usually means upstream changed shape and the parser needs adjustment.

2. **Detect drift.** Run `node scripts/check-drift.mjs --json` and capture the JSON. The shape is:
   ```
   { clean, added[], removed[], changedDefault[], missingDescription[] }
   ```
   If `clean === true`, report "docs in sync" and stop.

3. **Walk each drift category** and propose changes. Do not edit `config.mdx` until the user confirms.

   - **`changedDefault`** — factual corrections. Show each as `<key>: docs=X → code=Y`. These are safe to batch into a single confirmation: "Apply N default-value corrections?" On yes, edit the relevant rows in `config.mdx` (use the Edit tool with the precise old row; the row's `key` makes it unique within its sentinel-bracketed table).

   - **`added`** — new settings present in code but missing from the docs. For each:
     - Check if `scripts/config-descriptions.json` already has a description override (it shouldn't, since it's new).
     - If the schema entry has a `doc` from the Rust `///` comment, use that as the seed description.
     - If no doc comment exists, ask the user for the description before adding the row. Suggest one based on the field name + type, but let the user override.
     - Save accepted descriptions to `scripts/config-descriptions.json` (alphabetically sorted) so the override file remains authoritative.
     - Insert the new row inside the matching `{/* config-table:start id="..." */}` ... `{/* config-table:end */}` block. Use the `section` field on the schema entry to pick the correct sentinel id (mapping: `General` → `general`, `Interface` → `interface`, `MetadataStrip` → `metadata-strip`, `Behavior` → `behavior`, `Playback` → `playback`, `Scrobbling` → `scrobbling`, `Playlists` → `playlists`, `Views` → `views`, `VisualizerGeneral` → `visualizer-general`, `VisualizerBars` → `visualizer-bars`, `VisualizerLines` → `visualizer-lines`, `AudioEngine` → `audio-engine`).

   - **`removed`** — settings in docs but missing from code. **Always ask before deleting** — these may indicate an upstream rename rather than a real removal. Show the user the surrounding context (`config.mdx:line`) and the closest-named code key (Levenshtein on schema keys) as a possible rename candidate. Only delete the row on explicit confirmation. If it's a rename, edit the row to use the new key + remove any stale entry from `config-descriptions.json`.

   - **`missingDescription`** — schema keys with no override entry in `config-descriptions.json`. These are usually a side-effect of `added` handling above; if any remain, prompt the user to author one and write it back to the JSON.

4. **Verify.** After all edits, run `node scripts/check-drift.mjs` (without `--json`) and confirm it reports `✓ docs in sync`. If drift remains, surface what's still off — don't loop blindly.

5. **Build sanity-check.** Run `npm run build` (or `npx astro build` if the `pull` script chokes on the local nokkvi mount). MDX with malformed table rows surfaces here. If the build fails, fix and re-run; do not commit broken MDX.

6. **Stop. Don't commit.** The user runs `/commit` separately. Print a one-line summary: `applied N change(s) to config.mdx; 0 drift remaining`.

## Argument handling

If `$ARGUMENTS` contains `--check-only`, run steps 1–2 and report only — never edit. Useful for CI-like runs where you just want the drift report.

If `$ARGUMENTS` contains a path, treat it as `NOKKVI_PATH` and prepend `NOKKVI_PATH=<path>` to the extract command. Useful when nokkvi lives outside the standard `./nokkvi` mount (e.g. `NOKKVI_PATH=/tmp/nokkvi-readonly`).

## Important

- Never bypass the description override layer. The descriptions in `config-descriptions.json` are hand-tuned and richer than the Rust doc comments. When auto-generating new rows, the override file is the source of truth for prose; the Rust doc comment is only a seed.
- The sentinel comments are load-bearing. If a `{/* config-table:start id="..." */}` or `{/* config-table:end */}` is missing, run `node scripts/add-sentinels.mjs` (idempotent) to restore them before editing.
- Do not modify `nokkvi/` itself. This command is one-way: code → docs.
