import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

export default defineConfig({
  site: 'https://zhaodaxi.github.io',
  compressHTML: true,
  integrations: [
    sitemap({
      filter: (page) => !page.endsWith('/search-index.json'),
    }),
  ],
});
