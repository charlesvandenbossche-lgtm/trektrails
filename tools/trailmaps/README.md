# Trek Trails route maps and elevation profiles

Tools that draw the illustrated route map and the elevation profile on each trek page.
They are not part of the website build: Cloudflare never installs or runs anything in this folder.

## What is here

| File | What it does |
|---|---|
| `fetch-osm.py` | Looks up the stops in OpenStreetMap, finds the hiking routes that join them, and cuts the real trail line into stages. Writes `geo/<slug>.json`. |
| `elevation.py` | Measures distance, climb and descent per stage along that line from terrain data. Writes `geo/<slug>-elev.json`. |
| `render-map.js` | Draws the route map from `cfg/<slug>.json` (terrain, trail, stops, distance chips, peaks, legend). Writes `out/<slug>.html`. |
| `render-map-v1.js` | Legacy renderer, only for the first three approved maps (Peaks of the Balkans, Alta Via 1, Madeira Crossing). Their configs say `"renderer": "v1"`. |
| `profile.py` | Draws the elevation profile. Writes `out/<slug>-profile.html`. |
| `screenshot.py` | Turns `out/*.html` into PNG files with Chrome (Playwright), plus a small preview JPG. |
| `export.py` | Copies a finished map (and profile) to `public/img/maps/` as WebP and registers it in `src/data/maps.json`. |
| `find-names.py` | Searches OpenStreetMap for named places in a box, to find the right coordinates for a stop. |
| `specs/` | Input for `fetch-osm.py`: stops (guessed lat/lon, optional search name `q`) and stages. |
| `cfg/` | Map settings per trek: title, stops and labels, legs, extra places, legend, margins. |
| `geo/` | Trail lines, snapped stop positions and stage measurements, kept so maps can be redrawn without fetching again. |

`osm/`, `tiles/`, `out/` and `node_modules/` are caches and are not committed.

## Setup (once per machine or session)

```bash
cd tools/trailmaps
npm install
pip install playwright pillow   # if not present; Chrome or Playwright's Chromium is needed
```

If Chrome is not at `/usr/bin/google-chrome`, set `CHROME=/path/to/chrome` or run `playwright install chromium`.

## Making a map for a new trek

Run everything from `tools/trailmaps`.

1. **Spec.** Write `specs/<slug>.json`:
   ```json
   {"slug":"my-trek","box":0.03,
    "stops":[{"name":"Start village","lat":46.1,"lon":7.2,"q":"Name as in OSM"}, ...],
    "stages":[["Start village","Hut A"],["Hut A","Hut B"], ...]}
   ```
   Optional: `"relations":[id,...]` to force a route, `"only":true` to use only those, `"snap"` (km, default 2),
   `"ratio":[lo,hi]` (accepted mapped/stated distance range), `"skip":[ids]`. A stage can carry the stated
   distance as a third value; a stage whose mapped length is far off is then left schematic.
2. **Fetch.** `python3 fetch-osm.py specs/<slug>.json` prints per stage `REAL` (traced) or `schematic`.
   If a stage fails: check the stop names with `find-names.py`, correct the coordinates or `q`, or force the
   route relation. Add `DEBUG=1` to see which pieces of trail do not connect.
3. **Measure** (if you want stage figures or a profile): `python3 elevation.py <slug>`.
4. **Config.** Write `cfg/<slug>.json` (copy a recent one such as `cfg/reunion-trail.json`). Legs that were
   traced are drawn from the real line automatically; untraced legs are drawn dashed and the legend says
   "Stage drawn approximately". Distance chips use `km` from the leg, or the measured length if none is given.
5. **Render and look.** `node render-map.js cfg/<slug>.json && python3 screenshot.py <slug>`, then open
   `out/<slug>-preview.jpg` and check it: labels overlapping, chips on the wrong leg, the title covering the route.
   Fix with `labelPos` on a stop or place (`E W N S NE NW SE SW`), `margin`, `size` ([1200,1600] for portrait),
   `titleCorner`, `glyphs`, `autoPeaks`, `autoTowns`, `arrow:false` on a leg.
6. **Profile** (optional): `python3 profile.py <slug> && python3 screenshot.py <slug>-profile`.
7. **Export.** `python3 export.py <slug> [--profile] [--note="The first stage is drawn approximately."]`
   The note appears in the caption under the map on the site. For a profile, also set `profile:true` on the trek.

## Data sources and credits

- Trail lines, places and peaks: © OpenStreetMap contributors (ODbL), via `api.openstreetmap.org`.
  The Overpass API is not reachable from Claude's cloud workspace; the main API is.
- Terrain: AWS Terrain Tiles (Tilezen), `s3.amazonaws.com/elevation-tiles-prod`.
- Country borders: Natural Earth (via `world-atlas`).
- The credit line on each map is generated from what was actually used. Keep it.
