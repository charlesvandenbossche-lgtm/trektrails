# Trek Trails

A field guide to the world's great multi-day treks. Built with Astro, deployed to Cloudflare.

- `src/data/treks.mjs` holds every trek: fact sheet, stages, texts and photo names.
- `src/lib/render.mjs` turns that data into the pages.
- `src/pages/` has one file per page type; each trek gets its own URL under `/treks/`.
- `public/img/` holds the photos; `public/site.js` runs the filters and season finder.

`npm run build` writes the site to `dist/`. Every push to `main` is built and deployed by Cloudflare.
