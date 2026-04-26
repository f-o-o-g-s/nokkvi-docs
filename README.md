# nokkvi-docs

Source for the [Nokkvi](https://github.com/f-o-o-g-s/nokkvi) documentation site, built with [Astro](https://astro.build) + [Starlight](https://starlight.astro.build).

**Live site:** https://f-o-o-g-s.github.io/nokkvi-docs/

## Local development

```bash
npm install
npm run dev
```

`npm run dev` pulls the latest [nokkvi](https://github.com/f-o-o-g-s/nokkvi) repo into `./nokkvi/` (so the docs can reference its config schema and source) and serves the site at <http://localhost:4321>.

There's also a Docker setup if you'd rather not install Node locally:

```bash
docker compose up
```

This mounts the sibling `../nokkvi/` directory into the container so the same workflow works.

## Project layout

| Path | Purpose |
| :--- | :------ |
| `src/content/docs/` | Markdown / MDX page sources |
| `src/components/` | Custom Astro components (Hero, SiteTitle) |
| `src/styles/custom.css` | Everforest theme overrides |
| `astro.config.mjs` | Sidebar structure and Starlight config |
| `scripts/` | Config-schema extraction and drift-checking against nokkvi |
| `.github/workflows/deploy.yml` | GitHub Pages deploy on push to `master` |

## How deployment works

Every push to `master` triggers `.github/workflows/deploy.yml`, which:

1. Checks out this repo and the [nokkvi](https://github.com/f-o-o-g-s/nokkvi) repo side-by-side
2. Runs `astro build`
3. Publishes the result to GitHub Pages

Pushes to nokkvi that touch `assets/`, `CHANGELOG.md`, or `CONTRIBUTING.md` also trigger a rebuild via a `repository_dispatch` webhook — see `.github/workflows/docs_deploy.yml` in the nokkvi repo.

## Contributing

PRs welcome. Most pages are plain Markdown / MDX; the sidebar lives in `astro.config.mjs`.
