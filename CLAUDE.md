# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is the documentation site for **Nokkvi**, a music player application. It's built with [Astro](https://astro.build) and [Starlight](https://starlight.astro.build), a documentation theme that handles the site layout, sidebar navigation, and styling.

## Development Commands

```bash
# Start local dev server (pulls latest nokkvi repo, then runs on http://localhost:4321)
npm run dev

# Build production site to ./dist/
npm run build

# Preview production build locally
npm run preview

# Run Astro CLI directly for advanced operations
npm run astro -- <command>
```

## Architecture

**Starlight handles most of the site structure and styling** — it provides the navigation, sidebar generation, dark mode, and responsive layout out of the box. You typically don't need to touch the Starlight configuration unless changing sidebar structure or integrating new components.

### Content & Routing

- **Content source**: `/src/content/docs/` — Markdown/MDX files become pages automatically based on filename
- **Sidebar structure**: Defined in `astro.config.mjs` under the `sidebar` option. Guides are manually configured; Reference section uses `autogenerate` to index all `.mdx` files in that directory
- **Assets**: Images go in `/src/assets/` and are embedded in Markdown with relative paths
- **Static files**: Favicon and other static assets go in `/public/`

### Custom Components & Styling

- **Custom components**: `src/components/Hero.astro` and `src/components/SiteTitle.astro` are registered in `astro.config.mjs` to replace Starlight defaults
- **Theming**: `src/styles/custom.css` defines the Svalbard color scheme (light and dark variants) and custom fonts — all values override Starlight's CSS variables
- **Font stack**: Uses monospace (JetBrains Mono preferred) throughout, configured globally in custom.css

### External Data

The `scripts/pull` script (run before dev/build) ensures the main [nokkvi repository](https://github.com/f-o-o-g-s/nokkvi) is available locally in the `nokkvi/` directory. In Docker it's mounted; in CI it clones from GitHub. This allows documentation to reference or pull data from the main project if needed.

## Content Workflow

Add new pages as `.md` or `.mdx` files in the appropriate subdirectory:

- **Guides** (`src/content/docs/guides/`): How-to documents. Must be manually listed in `astro.config.mjs` sidebar to appear.
- **Reference** (`src/content/docs/reference/`): Technical docs. Auto-indexed by Starlight.

Frontmatter is handled by Starlight's `docsSchema()` — use standard fields like `title` and `description`.

## Key Points

- Starlight is the framework; your changes are mostly to content, styling, or custom components
- CSS variable overrides in `custom.css` affect all Starlight components
- The sidebar in `astro.config.mjs` drives the main navigation structure — update it when adding/removing guide pages
- Images use Sharp for optimization; no build step needed for images
