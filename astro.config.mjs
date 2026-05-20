// @ts-check
import { defineConfig } from "astro/config";
import starlight from "@astrojs/starlight";
import starlightLinksValidator from "starlight-links-validator";

const BASE = "/nokkvi-docs";

/**
 * Remark plugin: prefix BASE onto root-absolute markdown links so authors
 * can write `/reference/foo` and have it resolve correctly under the
 * deployed base path. Skips external URLs, mailto/tel, pure anchors, and
 * links already prefixed with BASE.
 */
function remarkPrefixBase() {
  const shouldSkip = (url) =>
    !url ||
    /^[a-z][a-z0-9+.-]*:/i.test(url) || // protocol (http:, mailto:, etc.)
    url.startsWith("//") ||
    url.startsWith("#") ||
    !url.startsWith("/") ||
    url === BASE ||
    url.startsWith(`${BASE}/`) ||
    url.startsWith(`${BASE}#`);

  return (tree) => {
    const visit = (node) => {
      if (node.type === "link" && !shouldSkip(node.url)) {
        node.url = `${BASE}${node.url}`;
      }
      if (node.children) node.children.forEach(visit);
    };
    visit(tree);
  };
}

/**
 * Remark plugin: rewrite the relative changelog-sibling links that
 * GitHub resolves to files in the repo (`./CHANGELOG.md`,
 * `./CHANGELOG-X.Y.md`) to the matching docs site routes
 * (`/changelog/`, `/changelog-archive-X-Y/`). Anchor fragments are
 * preserved. remarkPrefixBase runs after this and prefixes BASE.
 */
function remarkRewriteChangelogLinks() {
  const archive = /^\.\/CHANGELOG-(\d+)\.(\d+)\.md(#.*)?$/;
  const live = /^\.\/CHANGELOG\.md(#.*)?$/;
  return (tree) => {
    const visit = (node) => {
      if (node.type === "link") {
        const url = node.url ?? "";
        let m;
        if ((m = archive.exec(url))) {
          node.url = `/changelog-archive-${m[1]}-${m[2]}/${m[3] ?? ""}`;
        } else if ((m = live.exec(url))) {
          node.url = `/changelog/${m[1] ?? ""}`;
        }
      }
      if (node.children) node.children.forEach(visit);
    };
    visit(tree);
  };
}

/**
 * Remark plugin: drop the leading top-level `# Changelog` heading from
 * the upstream nokkvi/CHANGELOG.md (and the CHANGELOG-X.Y.md archive
 * siblings) when they're rendered through pages/changelog*.astro.
 * Starlight already prints the page title, so leaving the file's own
 * h1 in produces a duplicate header.
 */
function remarkStripChangelogTitle() {
  return (tree, file) => {
    if (!file.path || !/(?:^|\/)CHANGELOG(-[^/]+)?\.md$/.test(file.path)) return;
    const first = tree.children[0];
    if (first?.type === "heading" && first.depth === 1) {
      tree.children.shift();
    }
  };
}

// https://astro.build/config
export default defineConfig({
  site: "https://f-o-o-g-s.github.io",
  base: BASE,
  markdown: {
    remarkPlugins: [remarkRewriteChangelogLinks, remarkPrefixBase, remarkStripChangelogTitle],
  },
  integrations: [
    starlight({
      title: "Nokkvi",
      logo: {
        src: "./src/assets/logo.svg",
        replacesTitle: false,
      },
      components: {
        Header: "./src/components/Header.astro",
        SiteTitle: "./src/components/SiteTitle.astro",
        Hero: "./src/components/Hero.astro",
      },
      social: [
        {
          icon: "github",
          label: "GitHub",
          href: "https://github.com/f-o-o-g-s/nokkvi",
        },
        {
          icon: "heart",
          label: "Ko-fi",
          href: "https://ko-fi.com/foogsnokkvi",
        },
      ],
      customCss: ["./src/styles/custom.css"],
      plugins: [
        starlightLinksValidator({
          // Both /changelog/ and /changelog-archive-*/ are raw src/pages/*.astro
          // routes (not Starlight docs-collection entries), so the validator
          // can't auto-verify links to them. The pages are real and built at
          // build time; mark them as known-good. Patterns are matched after
          // remarkPrefixBase has prepended BASE.
          exclude: [`${BASE}/changelog/`, `${BASE}/changelog-archive-*/`],
        }),
      ],
      sidebar: [
        { label: "Overview", slug: "overview" },
        { label: "Installation", slug: "guides/installation" },
        { label: "Connecting to Navidrome", slug: "guides/navidrome" },
        {
          label: "Library",
          items: [
            { label: "Library Basics", slug: "guides/library-basics" },
            { label: "Queue", slug: "guides/queue" },
            { label: "Albums", slug: "guides/albums" },
            { label: "Artists", slug: "guides/artists" },
            { label: "Songs", slug: "guides/songs" },
            { label: "Genres", slug: "guides/genres" },
            { label: "Playlists", slug: "guides/playlists" },
            { label: "Radio", slug: "guides/radio" },
          ],
        },
        {
          label: "Guides",
          items: [
            { label: "Artwork & Performance", slug: "guides/artwork" },
            { label: "Audio Engine", slug: "guides/audio" },
            { label: "Customizing Themes", slug: "guides/theming" },
            { label: "Media Controls (MPRIS)", slug: "guides/mpris" },
          ],
        },
        {
          label: "Reference",
          autogenerate: { directory: "reference" },
        },
      ],
    }),
  ],
});
