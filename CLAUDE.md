# Trek Trails — project notes for Claude

Trek Trails (https://trektrails.org) is Charles's personal, long-term English guide to the world's great
multi-day treks. It is run entirely through Claude: Charles asks, Claude researches, writes, builds and publishes.
Goals: be found in Google and AI search engines, stay easy to update, and later go multilingual.

Read this file at the start of every session. Update it when something here changes.

## How the site works

- **Astro 5 static site** in this repository (`charlesvandenbossche-lgtm/trektrails`, branch `main`).
  `astro.config.mjs` sets `site: https://trektrails.org`, `trailingSlash: 'always'` and the sitemap.
- **Publishing:** a push to `main` builds and deploys automatically on Cloudflare (Workers Builds, static
  assets from `./dist`, see `wrangler.jsonc`). Other branches get preview builds. After pushing, wait about
  100 seconds and check the build:
  `gh api "repos/charlesvandenbossche-lgtm/trektrails/commits/$(git rev-parse HEAD)/check-runs" --jq '.check_runs[] | {status,conclusion}'`
  Push with `git -c push.negotiate=true push origin main`.
- **Always run `npm run build` before pushing**, and look at changed pages in a browser (Playwright,
  `python3 -m http.server` on `dist/`), on desktop and at 390 px wide. Check `document.documentElement.scrollWidth`
  stays 390 on mobile.

### Where things are

| Path | What |
|---|---|
| `src/data/treks.mjs` | All trek content: the array `T` plus `REGIONS`, `TOPICS`, `MONTHS`, `LEVELS`, `SLEEP`, `NOTES`, `NEXT`. |
| `src/lib/render.mjs` | HTML for the pages: `home()`, `trails()`, `detail(t)`, `about()`. Pages insert it with `<Fragment set:html>`. |
| `src/lib/map.mjs` | The clickable world and Europe maps on the homepage. Every trek needs a `[lat, lon]` in `LL`. |
| `src/data/maps.json` | Route maps registered per slug (`w`, `h`, caption `note`). Images in `public/img/maps/<slug>.webp`. |
| `src/layouts/Base.astro` | `<head>`, header, footer, structured data, cookie banner, Google tags. |
| `src/pages/` | `index`, `treks/index`, `treks/[slug]` (Article, Breadcrumb and FAQ structured data), `about`, `privacy`, `404`. |
| `src/styles.css` | All styles (brand book, then appended blocks per feature). |
| `public/site.js` | Season finder, filters, old `#hash` link redirects. |
| `public/img/` | Photos (`<name>.jpg`), logo, favicon, `mark.png`, `maps/`. |
| `tools/trailmaps/` | Route-map and elevation-profile tools. See its `README.md`. Not part of the build. |

### A trek entry in `T`

Required: `slug, name, sub, where, countries, region, days, trip, km, sleep, st ('hut'|'camp'|'guest'|'yurt'),
level (1–5), months [1–12], img (photo name without .jpg, or null for brand stripes), tags, blurb, yes, no,
intro [paragraphs], hl [highlights], stages [[label, km|null, up|null, down|null, time, note]], hard, nights,
getting, when, pack, diy, gal [[photo, alt]]`. Optional: `up, high, highN, book {name,url,line,from}, org, long,
short [[label,value]]`.

The **full article template** (Peaks of the Balkans and The Réunion Trail have it) adds:
`dayNotes` (one paragraph per stage), `dayImg` (per stage `[photo, alt, caption]` or null), `truths`
("What nobody tells you"), `byMonth` ([[period, text]]), `costs {rows, note}`, `faq` ([[q, a]], also output as
FAQPage structured data), `compare` ([[slug, why]]), `pics {truths, byMonth, costs}` (photos between sections),
`checked` ("November 2026"), `profile: true` (shows `public/img/maps/<slug>-profile.webp`).
Regions: `alps, nordic, islands, east, africa, asia, americas`.

When adding a trek: add it to `T`, add `LL` in `map.mjs`, add photos to `public/img/`, make the route map
(`tools/trailmaps`), and check the homepage tally (`countries=22` is hard-coded in `render.mjs`).

## Brand

Brand book: Design System artifact `d1cb1864-0d6d-4f3f-b510-42f7756b358f`.
Colours: pine-night `#293029`, forest-deep `#1c382e`, forest `#335b41`, moss `#627645`, ochre `#d69f43`,
ember `#cf6c33`, rust `#b74c30`, trail `#cd8337`, granite `#484439`, parchment `#f1efe0`.
Fonts: Alfa Slab One (display), Barlow (text), Barlow Condensed 600 uppercase (labels).
Six horizon stripes; stat format "62 KM · +3,400 M · 6 DAYS"; no emoji. Homepage headline: "Discover the world hiking".
Logo: the round badge with mountains and a trail (`public/img/logo.png`).

## Writing rules

- English, plain and specific. Honest about difficulty and downsides: that is the site's selling point.
- Research current facts (prices, permits, closures, seasons) before writing, and cite them to Charles.
- Never present guesses as facts. Measured figures say "measured from the mapped trail"; approximate map
  lines are dashed and say so in the legend and caption; anything unverified is flagged to Charles.
- Day-by-day texts written without first-hand knowledge must be flagged to Charles for checking.
- Put a "last checked" month on full articles.

## Agreements with Charles (do not change without asking)

- **No Travelbase connection is mentioned anywhere on the site.** Charles left Travelbase, holds no shares and
  earns nothing from bookings. If that ever changes (commission, ownership), a small "Affiliated partner" tag on
  the booking box and one line on the About page must come back.
- Booking boxes link to the Travelbase trail websites (e.g. thebalkantrail.com, theicelandtrail.com) as a way to
  book "without the hassle".
- **Photos:** Charles has Travelbase's permission to use their photos and content (advised to get it in writing).
  Use the Travelbase Media Search connector; prefer `professional`, then `ugc` (traveller photos). Skip files whose
  names or tags suggest they came from the web (Flickr, Facebook, wallpaper sites, Unsplash, other operators).
  Photos Charles supplies himself are his responsibility; ask for source and licence if they are from the web.
- **AI-generated images** (e.g. the Arizona Trail): Charles does not want a visible note on the page. Alt text stays
  descriptive and does not claim a real location; the hero alt starts with "Illustration:" (`ai: true`).
- **Analytics only after consent.** Google Tag Manager `GTM-KHBQZ27F` and Google Analytics `G-VW9JZN4YZL` load
  only after "Accept" in the cookie banner (consent mode, ads storage stays denied). Do not add a Google tag with
  the same G- ID inside Tag Manager (double counting). Any new tracking goes behind the same consent.
- Charles's work email is private: never send it to outside services.
- Commit messages end with the attribution lines the session provides.

- **Unsplash** photos are allowed (Unsplash License, free; skip Unsplash+ premium). Credit "Photo: name / Unsplash".
  **Standing instruction from Charles (21 Nov 2026):** when he asks for 20 pictures of a trek, just do it, no need to
  ask first. Search the trek name on Unsplash in the built-in browser (unsplash.com is on the allowed-sites list),
  pick the 20 best free photos, click "Download free" for each (they land in his Downloads folder), and copy them into
  `trektrailpics/<Trail name>/` (create it; if that folder already holds other photos, use `<Trail name>/Unsplash/`).
  Name them `U01 - <photographer> - <short description>.jpg`, add `_credits.txt` (photographer + photo link) and a
  `00 - overzicht.jpg` contact sheet, check them against the sheet, then delete the copies from Downloads
  (deletion there needs his approval once per session). Do not touch other files in Downloads.
  20 real PCT photos are in `trektrailpics/Pacific Crest Trail/Unsplash` (not yet used on the site).

## Other channels

- **Instagram** `trektrails_org` via the Metricool connector (brand/blog id `8158576`, timezone Europe/Brussels).
  Posts are created as drafts; media must be public URLs on trektrails.org (deploy images first). Captions end with
  "trektrails.org (link in bio)"; hashtags in the first comment.
- **Travelbase Media Search** brand codes used: BT (Balkan), ICE, MBT (Mont Blanc), TJT (Jordan), MAT (Madeira),
  TRT (Réunion), KZT (Kyrgyzstan), DT (Dolomites), CAPT, ATL (Atlas), GCT (Canary), VOT (Vosges), MUT (Mullerthal),
  TGT (Georgia), TNT (Norway), SCT (Scotland), KING (Kungsleden), KILT (Kilimanjaro).
- Charles's computer: photos for new posts can be read from his Downloads folder through the desktop app
  (e.g. `Downloads/Trail pictures/<Trail name> 1.jpeg`), with his approval of folder access.

## Open items

- Full-article template rolled out to Peaks of the Balkans, The Réunion Trail, the Toubkal Circuit, the M'Goun Traverse and the Pacific Crest Trail (20 AI photos from
  `trektrailpics/Pacific Crest Trail`; long trails label their sections "Part" instead of "Day") (its photos are
  AI-generated, from Charles's folder `OneDrive/Bureaublad/trektrailpics/Toubkal Circuit`). Next candidates have big
  photo libraries: Laugavegur, Tour du Mont Blanc, Jordan Trail, Madeira Crossing.
- M'Goun Traverse (`mgoun-traverse`, full template, AI photos from `OneDrive/Bureaublad/trektrailpics/M'Goun Traverse`,
  route fully traced in OSM with network routing). It is separate from the High Atlas Traverse (`high-atlas`, Atlas Trail route).
- Pictures waiting in Charles's `Downloads/Trail pictures`: Appalachian Trail, Continental Divide Trail, Te Araroa,
  Bibbulmun Track, Great Himalaya Trail, Greater Patagonian Trail, Israel National Trail (new articles), and
  Pacific Crest Trail and Jordan Trail (existing articles).
- No route map for the High Atlas Traverse (camps not in OpenStreetMap). Schematic maps: Cappadocia, Pacific Crest
  Trail, Arizona Trail; partly approximate: Ak-Suu, Jotunheimen, Isle of Skye, Dolomites, Jordan Trail.
- Thin data on Camino de Santiago, West Highland Way, Inca Trail, Annapurna Circuit and Alta Via 1 (no booking box,
  few photos). The Réunion Trail has no booking box (no Travelbase site found).
- Laugavegur's route map is Charles's own design (1024 px), not one of the generated series.
- SEO: Search Console (domain property, sitemap `sitemap-index.xml`) was being set up on 20 Nov 2026; Bing via
  "Import from Google Search Console"; check Cloudflare does not block AI crawlers; consider `www` redirect;
  the repository is public.
- Instagram: drafts were scheduled 18 Nov – 4 Dec 2026; daily posting not set up yet.
