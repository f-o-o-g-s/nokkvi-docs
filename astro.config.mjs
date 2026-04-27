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
 * Remark plugin: drop the leading top-level `# Changelog` heading from
 * the upstream nokkvi/CHANGELOG.md when it's rendered through
 * src/pages/changelog.astro. Starlight already prints the page title,
 * so leaving the file's own h1 in produces a duplicate header.
 */
function remarkStripChangelogTitle() {
  return (tree, file) => {
    if (!file.path?.endsWith("CHANGELOG.md")) return;
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
    remarkPlugins: [remarkPrefixBase, remarkStripChangelogTitle],
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
      plugins: [starlightLinksValidator()],
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
