// @ts-check
import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';

// https://astro.build/config
export default defineConfig({
	integrations: [
		starlight({
			title: 'Nokkvi',
			social: [{ icon: 'github', label: 'GitHub', href: 'https://github.com/f-o-o-g-s/nokkvi' }],
			customCss: ['./src/styles/custom.css'],
			sidebar: [
				{
					label: 'Guides',
					items: [
						{ label: 'Installation', slug: 'guides/installation' },
						{ label: 'Example Guide', slug: 'guides/example' },
					],
				},
				{
					label: 'Reference',
					autogenerate: { directory: 'reference' },
				},
			],
		}),
	],
});
