// Builds the two homepage maps (world and Europe) as inline SVG at build time.
import { geoEqualEarth, geoConicConformal, geoPath } from 'd3-geo';
import { feature } from 'topojson-client';
import world110 from 'world-atlas/land-110m.json';
import world50 from 'world-atlas/land-50m.json';
import { T } from '../data/treks.mjs';

// [latitude, longitude] of each trek, roughly its midpoint
const LL = {
  'tour-du-mont-blanc': [45.83, 6.86], 'laugavegur': [63.85, -19.3], 'jotunheimen': [61.6, 8.4],
  'isle-of-skye': [57.4, -6.2], 'kungsleden-winter': [68.1, 18.6], 'dolomites': [46.75, 11.9],
  'vosges-ridge': [48.04, 7.0], 'mullerthal-trail': [49.8, 6.3], 'madeira-crossing': [32.75, -17.0],
  'gran-canaria-traverse': [27.95, -15.6], 'peaks-of-the-balkans': [42.45, 19.8], 'mestia-to-ushguli': [43.0, 42.9],
  'cappadocia-valleys': [38.65, 34.85], 'jordan-trail': [30.4, 35.5], 'high-atlas': [31.6, -6.5],
  'ak-suu-traverse': [42.4, 78.6], 'kilimanjaro-lemosho': [-3.07, 37.35], 'camino-de-santiago': [42.85, -8.0],
  'west-highland-way': [56.4, -4.7], 'inca-trail': [-13.2, -72.5], 'annapurna-circuit': [28.6, 84.1],
  'alta-via-1': [46.25, 12.3], 'pacific-crest-trail': [40.5, -121.5], 'arizona-trail': [34.2, -111.4], 'reunion-trail': [-21.13, 55.53],
};
const EUROPE = { w: -26, e: 47, s: 26, n: 71.5 };
const inEurope = ([lat, lon]) => lon >= EUROPE.w && lon <= EUROPE.e && lat >= EUROPE.s && lat <= EUROPE.n;
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

function dots(projection, list, r, W) {
  return list.map((t) => {
    const [x, y] = projection([LL[t.slug][1], LL[t.slug][0]]);
    const label = `${t.name} · ${t.where}`;
    const tw = Math.min(label.length * 7.4 + 20, 330);
    const left = x + tw + 16 > W;               // flip the label when it would leave the map
    const tx = left ? x - 14 - tw : x + 14;
    return `<a class="dot" href="/treks/${t.slug}/" aria-label="${esc(t.name)}, ${esc(t.where)}">` +
      `<circle class="hit" cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${r * 2.6}"/>` +
      `<circle class="pin" cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${r}"/>` +
      `<g class="tip"><rect x="${tx.toFixed(1)}" y="${(y - 14).toFixed(1)}" width="${tw.toFixed(0)}" height="28" rx="4"/>` +
      `<text x="${(tx + 10).toFixed(1)}" y="${(y + 5).toFixed(1)}">${esc(label)}</text></g></a>`;
  }).join('');
}

export function maps() {
  const have = T.filter((t) => LL[t.slug]);
  // ---- world
  const W = 960, H = 470;
  const land = feature(world110, world110.objects.land);
  const wp = geoEqualEarth().fitExtent([[8, 8], [W - 8, H - 8]], { type: 'Polygon', coordinates: [[[-170, -56], [-170, 80], [0, 80], [179, 80], [179, -56], [0, -56], [-170, -56]]] });
  const wpath = geoPath(wp).digits(1);
  const box = [[EUROPE.w, EUROPE.s], [EUROPE.w, EUROPE.n], [EUROPE.e, EUROPE.n], [EUROPE.e, EUROPE.s]];
  const boxPath = wpath({ type: 'LineString', coordinates: [...Array(21).keys()].flatMap((i) => []).concat(
    ...[0, 1, 2, 3].map((k) => { const a = box[k], b = box[(k + 1) % 4]; return [...Array(11).keys()].map((i) => [a[0] + (b[0] - a[0]) * i / 10, a[1] + (b[1] - a[1]) * i / 10]); })) });
  const far = have.filter((t) => !inEurope(LL[t.slug])), near = have.filter((t) => inEurope(LL[t.slug]));
  const world = `<svg class="map" viewBox="0 0 ${W} ${H}" role="group" aria-label="World map of treks"><path class="land" d="${wpath(land)}"/>` +
    `<path class="eubox" d="${boxPath}"/>` + dots(wp, near, 3, W).replaceAll('class="dot"', 'class="dot small"') + dots(wp, far, 6.5, W) + `</svg>`;
  // ---- Europe
  const EW = 620, EH = 470;
  const land50 = feature(world50, world50.objects.land);
  const ep = geoConicConformal().parallels([35, 62]).rotate([-10, 0]).fitExtent([[6, 6], [EW - 6, EH - 6]], { type: 'MultiPoint', coordinates: [[EUROPE.w + 3, 30], [EUROPE.e - 2, 30], [-22, 66], [44, 62], [10, 70.5], [10, 27]] });
  ep.clipExtent([[0, 0], [EW, EH]]);
  const epath = geoPath(ep).digits(1);
  const europe = `<svg class="map" viewBox="0 0 ${EW} ${EH}" role="group" aria-label="Map of treks in Europe and around the Mediterranean"><path class="land" d="${epath(land50)}"/>` + dots(ep, near, 6.5, EW) + `</svg>`;
  return { world, europe, far: far.length, near: near.length };
}
