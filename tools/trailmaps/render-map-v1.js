#!/usr/bin/env node
// LEGACY renderer, kept only to re-render the first three maps (Peaks of the Balkans, Alta Via 1, Madeira Crossing)
// exactly as approved. Their configs carry "renderer": "v1". Use render-map.js for everything new.
// Trek Trails route-map renderer. usage: node trailmap.js config.json  ->  out/<slug>.html
// Terrain comes from real elevation tiles; the route is drawn schematically through the stops.
const fs = require('fs'), path = require('path'), { execSync } = require('child_process');
const { PNG } = require('pngjs');
const { contours } = require('d3-contour');
const topojson = require('topojson-client');
const topo = require('world-atlas/countries-10m.json');

const cfg = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
for (const d of ['out', 'tiles']) fs.mkdirSync(path.join(__dirname, d), { recursive: true });
const [W, H] = cfg.size || [1600, 1200];
const C = { paper: '#EFEBD8', low: '#F6F3E4', mid: '#B7C79A', high: '#7E9E6C', ridge: '#DCE5C4', ink: '#293029', cream: '#F1EFE0',
  route: '#C8632F', transfer: '#6E6A5C', arrow: '#2C3A6B', border: '#8C8F84', water: '#BFD9E0', sea: '#CFE2E6', ember: '#CF6C33', muted: '#6B6F63' };

// ---------- frame (web mercator, 4:3) ----------
const mx = lon => (lon + 180) / 360, my = lat => { const s = Math.sin(lat * Math.PI / 180); return 0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI); };
const pts = [...cfg.stops, ...(cfg.via || []), ...(cfg.extent || [])];
let x0 = Math.min(...pts.map(p => mx(p.lon))), x1 = Math.max(...pts.map(p => mx(p.lon))), y0 = Math.min(...pts.map(p => my(p.lat))), y1 = Math.max(...pts.map(p => my(p.lat)));
const pad = Object.assign({ l: 0.3, r: 0.3, t: 0.25, b: 0.25 }, cfg.pad || {});
let w = x1 - x0, h = y1 - y0; const base = Math.max(w, h * 4 / 3, 1e-5);
x0 -= base * pad.l; x1 += base * pad.r; y0 -= base * 0.75 * pad.t; y1 += base * 0.75 * pad.b;
w = x1 - x0; h = y1 - y0;
if (w / h > W / H) { const nh = w * H / W; y0 -= (nh - h) / 2; y1 += (nh - h) / 2; } else { const nw = h * W / H; x0 -= (nw - w) / 2; x1 += (nw - w) / 2; }
const P = (lon, lat) => [(mx(lon) - x0) / (x1 - x0) * W, (my(lat) - y0) / (y1 - y0) * H];
const midLat = cfg.stops.reduce((a, s) => a + s.lat, 0) / cfg.stops.length;
const kmPerPx = (x1 - x0) * 40075 * Math.cos(midLat * Math.PI / 180) / W;

// ---------- elevation grid ----------
const z = Math.max(5, Math.min(12, Math.floor(Math.log2(900 / ((x1 - x0) * 256)))));
const n = 2 ** z, tx0 = Math.floor(x0 * n), tx1 = Math.floor(x1 * n), ty0 = Math.floor(y0 * n), ty1 = Math.floor(y1 * n);
const tiles = {};
for (let tx = tx0; tx <= tx1; tx++) for (let ty = ty0; ty <= ty1; ty++) {
  const f = path.join(__dirname, 'tiles', `${z}-${tx}-${ty}.png`);
  if (!fs.existsSync(f) || fs.statSync(f).size < 500) execSync(`curl -sS -m 40 -o "${f}" "https://s3.amazonaws.com/elevation-tiles-prod/terrarium/${z}/${tx}/${ty}.png"`);
  try { tiles[tx + ',' + ty] = PNG.sync.read(fs.readFileSync(f)); } catch (e) { console.warn('tile failed', z, tx, ty); }
}
const elevAt = (gx, gy) => { // gx, gy in global tile-pixel units
  const tx = Math.floor(gx / 256), ty = Math.floor(gy / 256), t = tiles[tx + ',' + ty]; if (!t) return 0;
  const px = Math.min(255, Math.floor(gx - tx * 256)), py = Math.min(255, Math.floor(gy - ty * 256)), i = (py * 256 + px) * 4;
  return t.data[i] * 256 + t.data[i + 1] + t.data[i + 2] / 256 - 32768;
};
const GW = Math.round(W / 4), GH = Math.round(H / 4); let grid = new Float64Array(GW * GH);
for (let j = 0; j < GH; j++) for (let i = 0; i < GW; i++) grid[j * GW + i] = elevAt((x0 + (i + .5) / GW * (x1 - x0)) * n * 256, (y0 + (j + .5) / GH * (y1 - y0)) * n * 256);
function blur(a, r) { const o = new Float64Array(a.length), t = new Float64Array(a.length);
  for (let j = 0; j < GH; j++) for (let i = 0; i < GW; i++) { let s = 0, c = 0; for (let k = -r; k <= r; k++) { const q = i + k; if (q >= 0 && q < GW) { s += a[j * GW + q]; c++; } } t[j * GW + i] = s / c; }
  for (let j = 0; j < GH; j++) for (let i = 0; i < GW; i++) { let s = 0, c = 0; for (let k = -r; k <= r; k++) { const q = j + k; if (q >= 0 && q < GH) { s += t[q * GW + i]; c++; } } o[j * GW + i] = s / c; }
  return o; }
const raw = grid; const sea = Array.from(raw).filter(v => v <= 0.5).length > raw.length * 0.02;
grid = blur(blur(grid.map(v => Math.max(0, v)), 3), 3);
const sorted = Array.from(grid).filter((v, i) => raw[i] > 0.5).sort((a, b) => a - b), qt = p => sorted[Math.floor(p * (sorted.length - 1))];
const th = cfg.levels || [qt(0.22), qt(0.52), qt(0.78), qt(0.93)];
const sx = W / GW, sy = H / GH;
const ringPath = r => 'M' + r.map(p => (p[0] * sx).toFixed(1) + ',' + (p[1] * sy).toFixed(1)).join('L') + 'Z';
const band = v => contours().size([GW, GH]).smooth(true).thresholds([v])(grid)[0].coordinates.map(poly => poly.map(ringPath).join('')).join('');
const seaPath = sea ? (() => { const g2 = blur(raw, 1); return contours().size([GW, GH]).smooth(true).thresholds([0.5])(g2)[0].coordinates.map(poly => poly.map(ringPath).join('')).join(''); })() : '';

// peaks: local maxima of the lightly blurred grid
const g1 = blur(raw, 2), peaks = [];
for (let j = 8; j < GH - 8; j += 1) for (let i = 8; i < GW - 8; i += 1) { const v = g1[j * GW + i]; if (v < th[2]) continue; let top = true; for (let a = -7; a <= 7 && top; a++) for (let b = -7; b <= 7; b++) if (g1[(j + a) * GW + i + b] > v) { top = false; break; } if (top) peaks.push([i * sx, j * sy, v]); }
peaks.sort((a, b) => b[2] - a[2]);

// ---------- vector layers ----------
const countries = topojson.feature(topo, topo.objects.countries).features;
const inFrameLL = (lon, lat) => { const [x, y] = P(lon, lat); return x > -300 && x < W + 300 && y > -300 && y < H + 300; };
let borders = '';
countries.forEach(c => { const polys = c.geometry.type === 'Polygon' ? [c.geometry.coordinates] : c.geometry.coordinates;
  polys.forEach(poly => poly.forEach(ring => { let seg = []; ring.forEach(q => { if (inFrameLL(q[0], q[1])) seg.push(P(q[0], q[1])); else { if (seg.length > 1) borders += 'M' + seg.map(p => p[0].toFixed(1) + ',' + p[1].toFixed(1)).join('L'); seg = []; } }); if (seg.length > 1) borders += 'M' + seg.map(p => p[0].toFixed(1) + ',' + p[1].toFixed(1)).join('L'); })); });

function catmull(p, k = 16) { const out = [], Q = [p[0], ...p, p[p.length - 1]];
  for (let i = 1; i < Q.length - 2; i++) for (let s = 0; s < k; s++) { const t = s / k, t2 = t * t, t3 = t2 * t, [a, b, c, d] = [Q[i - 1], Q[i], Q[i + 1], Q[i + 2]];
    out.push([0, 1].map(j => 0.5 * (2 * b[j] + (-a[j] + c[j]) * t + (2 * a[j] - 5 * b[j] + 4 * c[j] - d[j]) * t2 + (-a[j] + 3 * b[j] - 3 * c[j] + d[j]) * t3))); }
  out.push(p[p.length - 1]); return out; }
const line = a => 'M' + a.map(p => p[0].toFixed(1) + ',' + p[1].toFixed(1)).join('L');
const esc = t => String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;');
const stop = name => { const s = cfg.stops.find(s => s.name === name); if (!s) throw new Error('unknown stop ' + name); return s; };

const geo = cfg.geo ? JSON.parse(fs.readFileSync(path.join(__dirname, cfg.geo), 'utf8')) : { lines: [], rivers: [], lakes: [] };
const thin = a => { const o = [a[0]]; for (const p of a) { const q = o[o.length - 1]; if (Math.hypot(p[0] - q[0], p[1] - q[1]) > 2.2) o.push(p); } o.push(a[a.length - 1]); return o; };
const proj = pts => thin(pts.map(p => P(p[0], p[1])));
let riversSvg = '', lakesSvg = '', altSvg = '', mainSvg = '', trackPts = [];
geo.rivers.forEach(r => { riversSvg += `<path d="${line(proj(r))}" fill="none" stroke="${C.water}" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"/>`; });
geo.lakes.forEach(r => { lakesSvg += `<path d="${line(proj(r))}Z" fill="${C.water}" stroke="${C.cream}" stroke-width="2"/>`; });
const altD = geo.lines.filter(l => l.cls === 'alt').map(l => { const q = proj(l.pts); trackPts.push(...q.filter((_, i) => i % 6 === 0)); return line(q); }).join('');
if (altD) altSvg = `<path d="${altD}" fill="none" stroke="${C.cream}" stroke-width="9" stroke-linecap="round" stroke-linejoin="round" opacity=".8"/><path d="${altD}" fill="none" stroke="${C.arrow}" stroke-width="4.5" stroke-linecap="round" stroke-linejoin="round"/>`;
const mainD = geo.lines.filter(l => l.cls === 'main').map(l => { const q = proj(l.pts); trackPts.push(...q.filter((_, i) => i % 6 === 0)); return line(q); }).join('');
if (mainD) mainSvg = `<path d="${mainD}" fill="none" stroke="${C.cream}" stroke-width="13" stroke-linecap="round" stroke-linejoin="round"/><path d="${mainD}" fill="none" stroke="${C.route}" stroke-width="7.5" stroke-linecap="round" stroke-linejoin="round"/>`;
if (geo.snap) cfg.stops.forEach(s => { if (geo.snap[s.name]) { s.lon = geo.snap[s.name][0]; s.lat = geo.snap[s.name][1]; } });
let routes = '', chips = '';
cfg.legs.forEach((leg, li) => {
  const st = geo.stages && geo.stages[leg.from + '|' + leg.to];
  if (st && leg.mode !== 'transfer') { if (st.real) { if (leg.draw === undefined) leg.draw = false; if (leg.km == null && leg.chip !== false) leg.km = st.km; } else if (!leg.dash) leg.dash = '2 13'; }
  const a = stop(leg.from), b = stop(leg.to);
  const way = [P(a.lon, a.lat), ...(leg.via || []).map(v => P(v[1], v[0])), P(b.lon, b.lat)];
  const curve = catmull(way), col = leg.mode === 'transfer' ? C.transfer : (leg.color || C.route);
  if (leg.draw !== false) routes += `<path d="${line(curve)}" fill="none" stroke="${C.cream}" stroke-width="12" stroke-linecap="round" stroke-linejoin="round" opacity=".75"/>` +
    `<path d="${line(curve)}" fill="none" stroke="${col}" stroke-width="${leg.mode === 'transfer' ? 5 : 7}" stroke-linecap="round" stroke-linejoin="round"${leg.mode === 'transfer' ? ' stroke-dasharray="3 12"' : leg.dash ? ` stroke-dasharray="${leg.dash}"` : ''}/>`;
  if (leg.km == null || leg.chip === false) return;
  // dashed stage arrow, offset to one side of the leg, with a distance chip
  const A = way[0], B = way[way.length - 1], dx = B[0] - A[0], dy = B[1] - A[1], L = Math.hypot(dx, dy) || 1, side = leg.side || 1, off = (leg.off || 58) * side;
  const nx = -dy / L * off, ny = dx / L * off, ux = dx / L, uy = dy / L;
  const s = [A[0] + nx + ux * 26, A[1] + ny + uy * 26], e = [B[0] + nx * 0.55 - ux * 30, B[1] + ny * 0.55 - uy * 30];
  const ctrl = [(s[0] + e[0]) / 2 + nx * 0.45, (s[1] + e[1]) / 2 + ny * 0.45];
  chips += `<path d="M${s[0].toFixed(1)},${s[1].toFixed(1)}Q${ctrl[0].toFixed(1)},${ctrl[1].toFixed(1)} ${e[0].toFixed(1)},${e[1].toFixed(1)}" fill="none" stroke="${C.arrow}" stroke-width="3" stroke-dasharray="7 7" marker-end="url(#ah)"/>`;
  const cx = (s[0] + 2 * ctrl[0] + e[0]) / 4, cy = (s[1] + 2 * ctrl[1] + e[1]) / 4;
  chips += `<g class="chip" data-x="${cx.toFixed(1)}" data-y="${cy.toFixed(1)}"><text class="chiptx" x="${cx.toFixed(1)}" y="${cy.toFixed(1)}" text-anchor="middle" dominant-baseline="central">${esc(leg.label || (leg.km + ' km'))}</text></g>`;
});

let dots = '', labels = '';
cfg.stops.forEach(s => { if (s.hidden) return; const [x, y] = P(s.lon, s.lat), end = s.type === 'start' || s.type === 'end';
  dots += `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${end ? 13 : 11}" fill="${end ? C.ember : C.cream}" stroke="${end ? C.cream : C.ink}" stroke-width="${end ? 3 : 4}"/>`;
  const pos = s.labelPos || 'E', d = 26; const [ox, oy, anchor] = { E: [d, 0, 'start'], W: [-d, 0, 'end'], N: [0, -d - 16, 'middle'], S: [0, d + 16, 'middle'], NE: [d * .8, -d, 'start'], NW: [-d * .8, -d, 'end'], SE: [d * .8, d, 'start'], SW: [-d * .8, d, 'end'] }[pos];
  labels += `<g class="pill"><text class="stoptx" x="${(x + ox + (anchor === 'start' ? 16 : anchor === 'end' ? -16 : 0)).toFixed(1)}" y="${(y + oy).toFixed(1)}" text-anchor="${anchor}" dominant-baseline="central">${esc(s.label || s.name)}</text></g>`; });

let places = '';
(cfg.places || []).forEach(p => { const [x, y] = P(p.lon, p.lat);
  if (p.kind === 'lake') places += `<ellipse cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" rx="${((p.w_km || 2) / 2 / kmPerPx).toFixed(1)}" ry="${((p.h_km || 1) / 2 / kmPerPx).toFixed(1)}" transform="rotate(${p.angle || 0} ${x.toFixed(1)} ${y.toFixed(1)})" fill="${C.water}" stroke="${C.cream}" stroke-width="2"/>`;
  if (p.kind === 'peak') places += `<path d="M${(x - 11).toFixed(1)},${(y + 8).toFixed(1)}L${x.toFixed(1)},${(y - 10).toFixed(1)}L${(x + 11).toFixed(1)},${(y + 8).toFixed(1)}Z" fill="${C.ink}" stroke="${C.cream}" stroke-width="2.5" stroke-linejoin="round"/>`;
  if (p.kind === 'minor') places += `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="7" fill="${C.cream}" stroke="${C.arrow}" stroke-width="3.5"/>`;
  if (p.kind === 'town') places += `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="11" fill="${C.cream}" stroke="${C.ink}" stroke-width="3"/><circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="4.5" fill="${C.ink}"/>`;
  if (p.kind === 'river') { places += `<text class="river" x="${x.toFixed(1)}" y="${y.toFixed(1)}" text-anchor="middle" dominant-baseline="central" transform="rotate(${p.angle || 0} ${x.toFixed(1)} ${y.toFixed(1)})">${esc(p.name)}</text>`; return; }
  const a = p.labelPos === 'W' ? 'end' : p.labelPos === 'E' ? 'start' : 'middle', lx = x + (a === 'end' ? -18 : a === 'start' ? 18 : 0), ly = y + (a === 'middle' ? (p.labelPos === 'N' ? -22 : 26) : 0);
  const cls = p.kind === 'ocean' ? 'ocean' : p.kind === 'country' ? 'country' : p.kind === 'town' ? 'town' : p.kind === 'minor' ? 'minor' : 'place';
  places += `<text class="${cls}" x="${lx.toFixed(1)}" y="${(ly - (p.ele ? 11 : 0)).toFixed(1)}" text-anchor="${a}" dominant-baseline="central">${esc(p.name)}</text>` + (p.ele ? `<text class="ele" x="${lx.toFixed(1)}" y="${(ly + 13).toFixed(1)}" text-anchor="${a}" dominant-baseline="central">${esc(p.ele)}</text>` : ''); });

// mountain glyphs on real summits, kept away from the route, stops and corner furniture
const keepOut = [...cfg.stops.map(s => P(s.lon, s.lat)), ...(cfg.places || []).map(p => P(p.lon, p.lat)), ...trackPts];
const corner = cfg.titleCorner || 'NW';
const inTitle = (x, y) => (corner === 'NW' ? x < 720 && y < 520 : corner === 'NE' ? x > W - 720 && y < 520 : corner === 'SW' ? x < 720 && y > H - 520 : x > W - 720 && y > H - 520) || (x > W - 580 && y > H - 220) || (x < 700 && y > H - 60);
let glyphs = '', used = [];
for (const [x, y] of peaks) { if (used.length >= (cfg.glyphs || 14)) break; if (x < 40 || x > W - 40 || y < 40 || y > H - 40 || inTitle(x, y)) continue;
  if (keepOut.some(q => Math.hypot(q[0] - x, q[1] - y) < 70) || used.some(q => Math.hypot(q[0] - x, q[1] - y) < 150)) continue; used.push([x, y]);
  const k = 1 + (used.length % 3) * 0.18;
  glyphs += `<path d="M${(x - 26 * k).toFixed(1)},${(y + 12 * k).toFixed(1)}l${(14 * k).toFixed(1)},${(-24 * k).toFixed(1)}l${(8 * k).toFixed(1)},${(11 * k).toFixed(1)}l${(9 * k).toFixed(1)},${(-18 * k).toFixed(1)}l${(17 * k).toFixed(1)},${(31 * k).toFixed(1)}" fill="none" stroke="${C.ink}" stroke-width="3" stroke-linejoin="round" stroke-linecap="round" opacity=".8"/>` +
    `<path d="M${(x - 12 * k).toFixed(1)},${(y - 12 * k).toFixed(1)}l${(4 * k).toFixed(1)},${(9 * k).toFixed(1)}l${(5 * k).toFixed(1)},${(-4 * k).toFixed(1)}" fill="none" stroke="${C.ink}" stroke-width="2" stroke-linecap="round" opacity=".6"/>`; }

// ---------- furniture ----------
const b64 = f => fs.readFileSync(f).toString('base64');
const fontCSS = `@font-face{font-family:'Alfa Slab One';src:url(data:font/woff2;base64,${b64(path.join(__dirname, 'node_modules/@fontsource/alfa-slab-one/files/alfa-slab-one-latin-400-normal.woff2'))}) format('woff2')}` +
  `@font-face{font-family:'Barlow Condensed';font-weight:600;src:url(data:font/woff2;base64,${b64(path.join(__dirname, 'node_modules/@fontsource/barlow-condensed/files/barlow-condensed-latin-600-normal.woff2'))}) format('woff2')}` +
  `@font-face{font-family:'Barlow Condensed';font-weight:600;unicode-range:U+0100-024F,U+1E00-1EFF;src:url(data:font/woff2;base64,${b64(path.join(__dirname, 'node_modules/@fontsource/barlow-condensed/files/barlow-condensed-latin-ext-600-normal.woff2'))}) format('woff2')}`;
const logo = 'data:image/png;base64,' + b64(cfg.logo ? path.join(__dirname, cfg.logo) : path.join(__dirname, '../../public/img/logo.png'));
const east = corner.includes('E'), south = corner.includes('S');
const tLines = cfg.titleLines || [cfg.title];
const tSize = cfg.titleSize || 96, tx = east ? W - 56 : 56, tAnchor = east ? 'end' : 'start';
const tTop = south ? H - 56 - tLines.length * tSize * 0.98 - 170 : 56;
const title = tLines.map((l, i) => `<text class="title" x="${tx}" y="${(tTop + tSize * 0.86 + i * tSize * 0.98).toFixed(1)}" text-anchor="${tAnchor}" font-size="${tSize}">${esc(l.toUpperCase())}</text>`).join('') +
  `<image href="${logo}" x="${east ? W - 56 - 150 : 56}" y="${(tTop + tLines.length * tSize * 0.98 + 26).toFixed(1)}" width="150" height="150"/>`;
const legend = (cfg.legend || []).map((l, i) => { const y = H - 150 + i * 44 - ((cfg.legend.length - 2) * 22); return `<line x1="${W - 530}" y1="${y}" x2="${W - 460}" y2="${y}" stroke="${l.color}" stroke-width="${l.dash ? 5 : 7}" stroke-linecap="round"${l.dash ? ` stroke-dasharray="${l.dash}"` : ''}/><text class="legend" x="${W - 444}" y="${y}" dominant-baseline="central">${esc(l.label)}</text>`; }).join('');

const svg = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">
<defs><style>${fontCSS}
.title{font-family:'Alfa Slab One',serif;fill:${C.ink};letter-spacing:.01em}
.stoptx{font-family:'Barlow Condensed',sans-serif;font-weight:600;font-size:${cfg.stopSize || 34}px;fill:${C.cream};letter-spacing:.02em}
.chiptx{font-family:'Barlow Condensed',sans-serif;font-weight:600;font-size:24px;fill:${C.cream};letter-spacing:.03em}
.place{font-family:'Barlow Condensed',sans-serif;font-weight:600;font-size:24px;fill:${C.muted};paint-order:stroke;stroke:${C.paper};stroke-width:5px;stroke-linejoin:round}
.country{font-family:'Barlow Condensed',sans-serif;font-weight:600;font-size:30px;fill:${C.muted};letter-spacing:.3em;paint-order:stroke;stroke:${C.paper};stroke-width:6px;stroke-linejoin:round;opacity:.9}
.town{font-family:'Barlow Condensed',sans-serif;font-weight:600;font-size:30px;fill:${C.ink};paint-order:stroke;stroke:${C.paper};stroke-width:6px;stroke-linejoin:round}
.minor{font-family:'Barlow Condensed',sans-serif;font-weight:600;font-size:25px;fill:${C.ink};paint-order:stroke;stroke:${C.paper};stroke-width:5px;stroke-linejoin:round}
.ele{font-family:'Barlow Condensed',sans-serif;font-weight:600;font-size:20px;fill:${C.muted};paint-order:stroke;stroke:${C.paper};stroke-width:5px;stroke-linejoin:round}
.river{font-family:'Barlow Condensed',sans-serif;font-weight:600;font-size:21px;fill:#5E93A6;letter-spacing:.06em;paint-order:stroke;stroke:${C.paper};stroke-width:4px;stroke-linejoin:round}
.ocean{font-family:'Barlow Condensed',sans-serif;font-weight:600;font-size:28px;fill:#7FA3AE;letter-spacing:.35em}
.legend{font-family:'Barlow Condensed',sans-serif;font-weight:600;font-size:27px;fill:${C.ink}}
.credit{font-family:'Barlow Condensed',sans-serif;font-weight:600;font-size:19px;fill:${C.muted}}
.mark{font-family:'Alfa Slab One',serif;font-size:27px;fill:${C.ink}}</style>
<marker id="ah" viewBox="0 0 10 10" refX="7" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse"><path d="M0,0L10,5L0,10z" fill="${C.arrow}"/></marker>
<clipPath id="f"><rect width="${W}" height="${H}"/></clipPath></defs>
<g clip-path="url(#f)">
<rect width="${W}" height="${H}" fill="${sea ? C.sea : C.paper}"/>${sea ? `<path d="${seaPath}" fill="${C.paper}" stroke="${C.cream}" stroke-width="5" stroke-linejoin="round"/>` : ''}
<path d="${band(th[0])}" fill="#DDE2C2" opacity=".7"/>
<path d="${band(th[1])}" fill="${C.mid}" opacity=".92"/>
<path d="${band(th[2])}" fill="${C.high}"/>
<path d="${band(th[3])}" fill="none" stroke="${C.ridge}" stroke-width="2.5" opacity=".75"/>
<path d="${cfg.borders === false ? '' : borders}" fill="none" stroke="${C.border}" stroke-width="2.5" stroke-linejoin="round" stroke-dasharray="14 6 3 6"/>
${riversSvg}${lakesSvg}${glyphs}${altSvg}${mainSvg}${routes}${places}${chips}${dots}${labels}
${title}
<rect x="${W - 560}" y="${H - 200 - (cfg.legend ? (cfg.legend.length - 2) * 22 : 0)}" width="520" height="${90 + (cfg.legend ? (cfg.legend.length - 1) * 44 : 0)}" rx="10" fill="${C.paper}" opacity=".94"/>
${legend}
<text class="mark" x="${W - 40}" y="${H - 58}" text-anchor="end">TREK</text><text class="mark" x="${W - 40}" y="${H - 28}" text-anchor="end">TRAILS</text>
<text class="credit" x="32" y="${H - 26}">${esc(cfg.credit || 'Terrain: Tilezen / AWS Terrain Tiles · Borders: Natural Earth · Route drawn schematically')}</text>
</g></svg>`;
// the page adds the dark pills behind stop names and distance chips once the fonts are measured
const html = `<!doctype html><html><head><meta charset="utf-8"></head><body style="margin:0;background:#fff">${svg}<script>
document.fonts.ready.then(()=>{const NS='http://www.w3.org/2000/svg';
document.querySelectorAll('g.pill,g.chip').forEach(g=>{const t=g.querySelector('text'),b=t.getBBox(),chip=g.classList.contains('chip'),px=chip?12:16,py=chip?5:7;
const r=document.createElementNS(NS,'rect');r.setAttribute('x',b.x-px);r.setAttribute('y',b.y-py);r.setAttribute('width',b.width+2*px);r.setAttribute('height',b.height+2*py);r.setAttribute('rx',chip?16:20);r.setAttribute('fill','${C.ink}');g.insertBefore(r,t)});
document.body.dataset.ready='1'});
</script></body></html>`;
const out = path.join(__dirname, 'out', cfg.slug + '.html'); fs.writeFileSync(out, html);
console.log('wrote', out, '| zoom', z, '| tiles', Object.keys(tiles).length, '| km/px', kmPerPx.toFixed(3), '| levels', th.map(v => Math.round(v)).join(','), '| sea', sea);
