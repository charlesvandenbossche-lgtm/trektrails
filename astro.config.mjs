import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';
export default defineConfig({
  site: 'https://trektrails.org',
  trailingSlash: 'always',
  build: { format: 'directory' },
  integrations: [sitemap()],
});
