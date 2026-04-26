// @ts-check
import { defineConfig } from "astro/config";
import starlight from "@astrojs/starlight";

// https://astro.build/config
export default defineConfig({
  site: "https://f-o-o-g-s.github.io",
  base: "/nokkvi-docs",
  integrations: [
    starlight({
      title: "Nokkvi",
      logo: {
        src: "./src/assets/logo.svg",
        replacesTitle: false,
      },
      components: {
        SiteTitle: "./src/components/SiteTitle.astro",
        Hero: "./src/components/Hero.astro",
      },
      social: [
        {
          icon: "github",
          label: "GitHub",
          href: "https://github.com/f-o-o-g-s/nokkvi",
        },
      ],
      customCss: ["./src/styles/custom.css"],
      sidebar: [
        { label: "Overview", slug: "overview" },
        { label: "Installation", slug: "guides/installation" },
        { label: "Connecting to Navidrome", slug: "guides/navidrome" },
        {
          label: "Library",
          items: [
            { label: "Queue", slug: "guides/queue" },
            { label: "Albums", slug: "guides/albums" },
            { label: "Artists", slug: "guides/artists" },
            { label: "Songs", slug: "guides/songs" },
            { label: "Playlists", slug: "guides/playlists" },
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
