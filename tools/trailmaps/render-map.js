#!/usr/bin/env node
// Trek Trails route-map renderer v2. usage: node trailmap2.js config.json  ->  out/<slug>.html
// Terrain from elevation tiles, trail lines / places from OpenStreetMap extracts (geo json), automatic label layout.
const fs = require('fs'), path = require('path'), { execSync } = require('child_process');
const { PNG } = require('pngjs');
const { contours } = require('d3-contour');
const topojson = require('topojson-client');
const topo = require('world-atlas/countries-10m.json');

const cfg = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
for (const d of ['out', 'tiles']) fs.mkdirSync(path.join(__dirname, d), { recursive: true });
const C = { paper: '#EFEBD8', mid: '#B7C79A', high: '#7E9E6C', ridge: '#DCE5C4', ink: '#293029', cream: '#F1EFE0',
  route: '#C8632F', transfer: '#6E6A5C', arrow: '#2C3A6B', border: '#8C8F84', water: '#BFD9E0', sea: '#CFE2E6', ember: '#CF6C33', muted: '#6B6F63' };
const geo = cfg.geo && fs.existsSync(path.join(__dirname, cfg.geo)) ? JSON.parse(fs.readFileSync(path.join(__dirname, cfg.geo), 'utf8')) : { lines: [], rivers: [], lakes: [] };
geo.rivers = geo.rivers || []; geo.lakes = geo.lakes || []; geo.lines = geo.lines || [];
cfg.stops.forEach(s => { const q = (geo.snap && geo.snap[s.name]) || (geo.stops && geo.stops[s.name]); if (q) { s.lon = q[0]; s.lat = q[1]; } });
cfg.stops = cfg.stops.filter(s => s.lat != null);
const known = new Set(cfg.stops.map(s => s.name));
cfg.legs = cfg.legs.filter(l => known.has(l.from) && known.has(l.to));
cfg.places = cfg.places || [];

// ---------- frame (web mercator) ----------
const mx = lon => (lon + 180) / 360, my = lat => { const s = Math.sin(lat * Math.PI / 180); return 0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI); };
const mainPts = geo.lines.filter(l => l.cls === 'main').flatMap(l => l.pts.filter((_, i) => i % 5 === 0).map(p => ({ lon: p[0], lat: p[1] })));
const viaPts = cfg.legs.flatMap(l => (l.via || []).map(v => ({ lat: v[0], lon: v[1] })));
const pts = [...cfg.stops, ...viaPts, ...(cfg.extent || []), ...mainPts];
const bx0 = Math.min(...pts.map(p => mx(p.lon))), bx1 = Math.max(...pts.map(p => mx(p.lon))), by0 = Math.min(...pts.map(p => my(p.lat))), by1 = Math.max(...pts.map(p => my(p.lat)));
const bw = Math.max(bx1 - bx0, 1e-6), bh = Math.max(by1 - by0, 1e-6);
const [W, H] = cfg.size || (bh / bw > 1.15 ? [1200, 1600] : [1600, 1200]);
let x0, x1, y0, y1;
const tLines = cfg.titleLines || [cfg.title];
let tSize = cfg.titleSize || (Math.max(...tLines.map(l => l.length)) > 11 ? 84 : 96);
const tW = () => Math.max(...tLines.map(l => l.length)) * tSize * 0.74, tH = () => tLines.length * tSize * 0.98 + 190;
let margin = Object.assign({ l: 150, r: 150, t: 130, b: 150 }, cfg.margin || {});
function setFrame() {
  const iw = W - margin.l - margin.r, ih = H - margin.t - margin.b, sc = Math.min(iw / bw, ih / bh);
  const cx = margin.l + iw / 2, cy = margin.t + ih / 2;
  x0 = (bx0 + bx1) / 2 - cx / sc; x1 = x0 + W / sc; y0 = (by0 + by1) / 2 - cy / sc; y1 = y0 + H / sc;
}
const P = (lon, lat) => [(mx(lon) - x0) / (x1 - x0) * W, (my(lat) - y0) / (y1 - y0) * H];
const cornerBox = c => { const w = tW() + 70, h = tH() + 60; return { x1: c.includes('E') ? W - w : 0, x2: c.includes('E') ? W : w, y1: c.includes('S') ? H - h - 30 : 0, y2: c.includes('S') ? H : h }; };
const hits = b => pts.filter(p => { const [x, y] = P(p.lon, p.lat); return x > b.x1 && x < b.x2 && y > b.y1 && y < b.y2; }).length;
let corner = cfg.titleCorner;
setFrame();
for (let pass = 0; pass < 3; pass++) {
  const cand = ['NW', 'NE', 'SW'].map(c => [hits(cornerBox(c)), c]).sort((a, b) => a[0] - b[0]);
  if (!cfg.titleCorner) corner = cand[0][1];
  const th_ = hits(cornerBox(corner)), lg = hits({ x1: W - 600, x2: W, y1: H - 230, y2: H });
  if (!th_ && !lg) break;
  if (th_) { if (pass === 0 && tSize > 80) tSize = 76; else if (corner.includes('S')) margin.b += 130; else margin.t += 130; }
  if (lg) margin.b += 90;
  setFrame();
}
corner = corner || 'NW';
const midLat = cfg.stops.reduce((a, s) => a + s.lat, 0) / cfg.stops.length;
const kmPerPx = (x1 - x0) * 40075 * Math.cos(midLat * Math.PI / 180) / W;

// ---------- elevation grid ----------
const z = Math.max(3, Math.min(12, Math.floor(Math.log2(900 / ((x1 - x0) * 256)))));
const n = 2 ** z, tx0 = Math.floor(x0 * n), tx1 = Math.floor(x1 * n), ty0 = Math.floor(y0 * n), ty1 = Math.floor(y1 * n);
const tiles = {};
for (let tx = tx0; tx <= tx1; tx++) for (let ty = ty0; ty <= ty1; ty++) {
  const f = path.join(__dirname, 'tiles', `${z}-${tx}-${ty}.png`);
  if (!fs.existsSync(f) || fs.statSync(f).size < 500) { try { execSync(`curl -sS -m 40 -o "${f}" "https://s3.amazonaws.com/elevation-tiles-prod/terrarium/${z}/${((tx % n) + n) % n}/${ty}.png"`); } catch (e) {} }
  try { tiles[tx + ',' + ty] = PNG.sync.read(fs.readFileSync(f)); } catch (e) { console.warn('tile failed', z, tx, ty); }
}
const elevAt = (gx, gy) => { const tx = Math.floor(gx / 256), ty = Math.floor(gy / 256), t = tiles[tx + ',' + ty]; if (!t) return 0;
  const px = Math.min(255, Math.floor(gx - tx * 256)), py = Math.min(255, Math.floor(gy - ty * 256)), i = (py * 256 + px) * 4;
  return t.data[i] * 256 + t.data[i + 1] + t.data[i + 2] / 256 - 32768; };
const GW = Math.round(W / 4), GH = Math.round(H / 4); let grid = new Float64Array(GW * GH);
for (let j = 0; j < GH; j++) for (let i = 0; i < GW; i++) grid[j * GW + i] = elevAt((x0 + (i + .5) / GW * (x1 - x0)) * n * 256, (y0 + (j + .5) / GH * (y1 - y0)) * n * 256);
function blur(a, r) { const o = new Float64Array(a.length), t = new Float64Array(a.length);
  for (let j = 0; j < GH; j++) for (let i = 0; i < GW; i++) { let s = 0, c = 0; for (let k = -r; k <= r; k++) { const q = i + k; if (q >= 0 && q < GW) { s += a[j * GW + q]; c++; } } t[j * GW + i] = s / c; }
  for (let j = 0; j < GH; j++) for (let i = 0; i < GW; i++) { let s = 0, c = 0; for (let k = -r; k <= r; k++) { const q = j + k; if (q >= 0 && q < GH) { s += t[q * GW + i]; c++; } } o[j * GW + i] = s / c; }
  return o; }
const raw = grid; const sea = cfg.sea !== false && Array.from(raw).filter(v => v <= 0.5).length > raw.length * 0.02;
grid = blur(blur(grid.map(v => Math.max(0, v)), 3), 3);
let sorted = Array.from(grid).filter((v, i) => raw[i] > 0.5).sort((a, b) => a - b); if (!sorted.length) sorted = [0];
const qt = p => sorted[Math.floor(p * (sorted.length - 1))];
const th = cfg.levels || [qt(0.22), qt(0.52), qt(0.78), qt(0.93)];
const sx = W / GW, sy = H / GH;
const ringPath = r => 'M' + r.map(p => (p[0] * sx).toFixed(1) + ',' + (p[1] * sy).toFixed(1)).join('L') + 'Z';
const cont = (g, v) => contours().size([GW, GH]).smooth(true).thresholds([v])(g)[0].coordinates.map(poly => poly.map(ringPath).join('')).join('');
const band = v => cont(grid, v);
const seaPath = sea ? cont(blur(raw, 1), 0.5) : '';
const g1 = blur(raw, 2), peaks = [];
for (let j = 8; j < GH - 8; j++) for (let i = 8; i < GW - 8; i++) { const v = g1[j * GW + i]; if (v < th[2]) continue; let top = true; for (let a = -7; a <= 7 && top; a++) for (let b = -7; b <= 7; b++) if (g1[(j + a) * GW + i + b] > v) { top = false; break; } if (top) peaks.push([i * sx, j * sy, v]); }
peaks.sort((a, b) => b[2] - a[2]);

// ---------- vector layers ----------
const esc = t => String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;');
const line = a => 'M' + a.map(p => p[0].toFixed(1) + ',' + p[1].toFixed(1)).join('L');
const inFrameLL = (lon, lat) => { const [x, y] = P(lon, lat); return x > -300 && x < W + 300 && y > -300 && y < H + 300; };
let borders = '';
if (cfg.borders !== false) topojson.feature(topo, topo.objects.countries).features.forEach(c => { if (!c.geometry) return; const polys = c.geometry.type === 'Polygon' ? [c.geometry.coordinates] : c.geometry.coordinates;
  polys.forEach(poly => poly.forEach(ring => { let seg = []; const flush = () => { if (seg.length > 1) borders += line(seg); seg = []; }; ring.forEach(q => { if (inFrameLL(q[0], q[1])) seg.push(P(q[0], q[1])); else flush(); }); flush(); })); });
function catmull(p, k = 16) { const out = [], Q = [p[0], ...p, p[p.length - 1]];
  for (let i = 1; i < Q.length - 2; i++) for (let s = 0; s < k; s++) { const t = s / k, t2 = t * t, t3 = t2 * t, [a, b, c, d] = [Q[i - 1], Q[i], Q[i + 1], Q[i + 2]];
    out.push([0, 1].map(j => 0.5 * (2 * b[j] + (-a[j] + c[j]) * t + (2 * a[j] - 5 * b[j] + 4 * c[j] - d[j]) * t2 + (-a[j] + 3 * b[j] - 3 * c[j] + d[j]) * t3))); }
  out.push(p[p.length - 1]); return out; }
const thin = a => { const o = [a[0]]; for (const p of a) { const q = o[o.length - 1]; if (Math.hypot(p[0] - q[0], p[1] - q[1]) > 2.2) o.push(p); } o.push(a[a.length - 1]); return o; };
const proj = pts => thin(pts.map(p => P(p[0], p[1])));
const trackPts = []; const sample = (q, k) => { let last = null; q.forEach(p => { if (!last || Math.hypot(p[0] - last[0], p[1] - last[1]) > k) { trackPts.push(p); last = p; } }); };
let riversSvg = '', lakesSvg = '', altSvg = '', mainSvg = '';
geo.rivers.forEach(r => { if (r.length > 1) riversSvg += `<path d="${line(proj(r))}" fill="none" stroke="${C.water}" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"/>`; });
geo.lakes.forEach(r => { if (r.length > 2) lakesSvg += `<path d="${line(proj(r))}Z" fill="${C.water}" stroke="${C.cream}" stroke-width="2"/>`; });
const altD = geo.lines.filter(l => l.cls === 'alt').map(l => { const q = proj(l.pts); sample(q, 14); return line(q); }).join('');
if (altD) altSvg = `<path d="${altD}" fill="none" stroke="${C.cream}" stroke-width="9" stroke-linecap="round" stroke-linejoin="round" opacity=".8"/><path d="${altD}" fill="none" stroke="${C.arrow}" stroke-width="4.5" stroke-linecap="round" stroke-linejoin="round"/>`;
const lineBy = {};
const mainD = geo.lines.filter(l => l.cls === 'main').map(l => { const q = proj(l.pts); if (l.key) lineBy[l.key] = q; sample(q, 10); return line(q); }).join('');
if (mainD) mainSvg = `<path d="${mainD}" fill="none" stroke="${C.cream}" stroke-width="13" stroke-linecap="round" stroke-linejoin="round"/><path d="${mainD}" fill="none" stroke="${C.route}" stroke-width="7.5" stroke-linecap="round" stroke-linejoin="round"/>`;

// ---------- label layout ----------
const boxes = []; const ov = (a, b) => { const w = Math.min(a.x2, b.x2) - Math.max(a.x1, b.x1), h = Math.min(a.y2, b.y2) - Math.max(a.y1, b.y1); return w > 0 && h > 0 ? w * h : 0; };
const area = b => (b.x2 - b.x1) * (b.y2 - b.y1);
const cost = b => { let c = 0; for (const o of boxes) c += ov(b, o) * 3; for (const p of trackPts) if (p[0] > b.x1 - 5 && p[0] < b.x2 + 5 && p[1] > b.y1 - 5 && p[1] < b.y2 + 5) c += 420;
  const inside = ov(b, { x1: 12, y1: 12, x2: W - 12, y2: H - 46 }); c += (area(b) - inside) * 8; return c; };
const tw = (t, size) => String(t).length * size * 0.47;
const east = corner.includes('E'), south = corner.includes('S');
const tx = east ? W - 56 : 56, tAnchor = east ? 'end' : 'start';
const tTop = south ? H - 70 - tLines.length * tSize * 0.98 - 170 : 56;
boxes.push({ x1: east ? W - tW() - 70 : 0, x2: east ? W : tW() + 70, y1: tTop - 20, y2: tTop + tH() - 10 });
boxes.push({ x1: W - 150, x2: W, y1: H - 100, y2: H });

const stop = name => { const s = cfg.stops.find(s => s.name === name); if (!s) throw new Error('unknown stop ' + name); return s; };
let anySchematic = false, anyTransfer = false, routes = '';
cfg.legs.forEach(leg => {
  const st = geo.stages && geo.stages[leg.from + '|' + leg.to];
  if (leg.mode === 'transfer') anyTransfer = true;
  else if (st && st.real) { if (leg.draw === undefined) leg.draw = false; if (leg.km == null && leg.chip !== false) leg.km = st.km; }
  else if (leg.draw !== false) { if (!leg.dash && !cfg.schematic) leg.dash = '2 13'; anySchematic = true; }
  const a = stop(leg.from), b = stop(leg.to);
  leg.way = [P(a.lon, a.lat), ...(leg.via || []).map(v => P(v[1], v[0])), P(b.lon, b.lat)];
  if (leg.draw === false) return;
  const curve = catmull(leg.way), col = leg.mode === 'transfer' ? C.transfer : (leg.color || C.route); sample(curve, 10);
  routes += `<path d="${line(curve)}" fill="none" stroke="${C.cream}" stroke-width="12" stroke-linecap="round" stroke-linejoin="round" opacity=".75"/>` +
    `<path d="${line(curve)}" fill="none" stroke="${col}" stroke-width="${leg.mode === 'transfer' ? 5 : 7}" stroke-linecap="round" stroke-linejoin="round"${leg.mode === 'transfer' ? ' stroke-dasharray="3 12"' : leg.dash ? ` stroke-dasharray="${leg.dash}"` : ''}/>`;
});
const legendItems = cfg.legend || [{ label: cfg.legendLabel || cfg.title, color: C.route },
  ...(altD ? [{ label: cfg.altLabel || 'Full route', color: C.arrow }] : []),
  ...(anySchematic && !cfg.schematic ? [{ label: 'Stage drawn approximately', color: C.route, dash: '2 13' }] : []),
  ...(anyTransfer ? [{ label: 'Transfer', color: C.transfer, dash: '3 12' }] : [])];
const lgW = Math.max(...legendItems.map(l => tw(l.label, 27))) + 150, lgH = legendItems.length * 44 + 30, lgX = W - 40 - lgW - (legendItems.length > 1 ? 0 : 120), lgY = H - 40 - lgH - (legendItems.length > 1 ? 70 : 0);
boxes.push({ x1: lgX, y1: lgY, x2: lgX + lgW, y2: lgY + lgH });
const legend = `<rect x="${lgX}" y="${lgY}" width="${lgW}" height="${lgH}" rx="10" fill="${C.paper}" opacity=".94"/>` + legendItems.map((l, i) => { const y = lgY + 37 + i * 44; return `<line x1="${lgX + 26}" y1="${y}" x2="${lgX + 96}" y2="${y}" stroke="${l.color}" stroke-width="${l.dash ? 5 : 7}" stroke-linecap="round"${l.dash ? ` stroke-dasharray="${l.dash}"` : ''}/><text class="legend" x="${lgX + 114}" y="${y}" dominant-baseline="central">${esc(l.label)}</text>`; }).join('');

const sSize = cfg.stopSize || (cfg.stops.length > 8 ? 29 : 33);
const POS = { E: [26, 0, 'start'], W: [-26, 0, 'end'], NE: [21, -30, 'start'], SE: [21, 30, 'start'], NW: [-21, -30, 'end'], SW: [-21, 30, 'end'], N: [0, -44, 'middle'], S: [0, 44, 'middle'] };
const pillBox = (x, y, pos, w, size) => { const [ox, oy, a] = POS[pos], hh = size / 2 + 9; const xl = a === 'start' ? x + ox : a === 'end' ? x + ox - w - 32 : x - w / 2 - 16; return { x1: xl, x2: xl + w + 32, y1: y + oy - hh, y2: y + oy + hh }; };
let dots = '', labels = '';
cfg.stops.forEach(s => { if (s.hidden) return; const [x, y] = P(s.lon, s.lat); boxes.push({ x1: x - 15, x2: x + 15, y1: y - 15, y2: y + 15 }); });
cfg.places.forEach(p => { if (['peak', 'minor', 'town'].includes(p.kind)) { const [x, y] = P(p.lon, p.lat); p._m = { x1: x - 12, x2: x + 12, y1: y - 12, y2: y + 12 }; boxes.push(p._m); } });
cfg.stops.forEach(s => { if (s.hidden) return; const [x, y] = P(s.lon, s.lat), end = s.type === 'start' || s.type === 'end', text = s.label || s.name, w = tw(text, sSize);
  dots += `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${end ? 13 : 11}" fill="${end ? C.ember : C.cream}" stroke="${end ? C.cream : C.ink}" stroke-width="${end ? 3 : 4}"/>`;
  let pos = s.labelPos; if (!pos) { let best = 1e18; Object.keys(POS).forEach((k, i) => { const c = cost(pillBox(x, y, k, w, sSize)) + i * 25; if (c < best) { best = c; pos = k; } }); }
  const b = pillBox(x, y, pos, w, sSize); boxes.push(b);
  labels += `<rect x="${b.x1.toFixed(1)}" y="${b.y1.toFixed(1)}" width="${(b.x2 - b.x1).toFixed(1)}" height="${(b.y2 - b.y1).toFixed(1)}" rx="20" fill="${C.ink}"/><text class="stoptx" x="${((b.x1 + b.x2) / 2).toFixed(1)}" y="${((b.y1 + b.y2) / 2).toFixed(1)}" text-anchor="middle" dominant-baseline="central">${esc(text)}</text>`; });
let chips = '';
const fmtKm = k => (k >= 100 ? Math.round(k).toLocaleString('en') : k) + ' km';
cfg.legs.forEach(leg => { if (leg.km == null || leg.chip === false) return;
  const A = leg.way[0], B = leg.way[leg.way.length - 1], dx = B[0] - A[0], dy = B[1] - A[1], L = Math.hypot(dx, dy) || 1, text = leg.label || fmtKm(leg.km), hw = tw(text, 24) / 2 + 13;
  const geom = (side, off0) => { const off = off0 * side, nx = -dy / L * off, ny = dx / L * off, ux = dx / L, uy = dy / L, g = Math.min(26, L / 4);
    const s = [A[0] + nx + ux * g, A[1] + ny + uy * g], e = [B[0] + nx * 0.55 - ux * (g + 4), B[1] + ny * 0.55 - uy * (g + 4)], ctrl = [(s[0] + e[0]) / 2 + nx * 0.45, (s[1] + e[1]) / 2 + ny * 0.45];
    const cx = (s[0] + 2 * ctrl[0] + e[0]) / 4, cy = (s[1] + 2 * ctrl[1] + e[1]) / 4; return { s, e, ctrl, cx, cy, box: { x1: cx - hw, x2: cx + hw, y1: cy - 19, y2: cy + 19 } }; };
  const lp = lineBy[leg.from + '|' + leg.to]; let plen = 0, cum = [0];
  if (lp) { for (let i = 1; i < lp.length; i++) { plen += Math.hypot(lp[i][0] - lp[i - 1][0], lp[i][1] - lp[i - 1][1]); cum.push(plen); } }
  const winding = lp ? L / plen < 0.82 : false, noArrow = leg.arrow === false || winding || (leg.draw !== false) || L <= 60;
  let g; if (leg.side && !noArrow) g = geom(leg.side, leg.off || 58);
  else if (noArrow) { // chip beside the middle of the drawn line
    let M, dir;
    if (lp) { const at = f => { const t = plen * f, i = Math.max(1, cum.findIndex(c => c >= t)); return lp[Math.min(i, lp.length - 1)]; }; M = at(0.5); const p1 = at(0.42), p2 = at(0.58); dir = [p2[0] - p1[0], p2[1] - p1[1]]; }
    else { const cv = catmull(leg.way), i = Math.floor(cv.length / 2); M = cv[i]; const p1 = cv[Math.max(0, i - 3)], p2 = cv[Math.min(cv.length - 1, i + 3)]; dir = [p2[0] - p1[0], p2[1] - p1[1]]; }
    const dl = Math.hypot(dir[0], dir[1]) || 1, nx = -dir[1] / dl, ny = dir[0] / dl; let best = 1e18;
    [36, 58, 84].forEach((o, i) => [1, -1].forEach(sd => { const ox = nx * o * sd * (1 + Math.abs(nx) * hw / 60), oy = ny * o * sd, cx = M[0] + ox, cy = M[1] + oy, q = { cx, cy, box: { x1: cx - hw, x2: cx + hw, y1: cy - 19, y2: cy + 19 } }, c = cost(q.box) + i * 40; if (c < best) { best = c; g = q; } }));
  } else { let best = 1e18; [58, 85, 115].forEach((o, i) => [1, -1].forEach(sd => { const q = geom(sd, o), c = cost(q.box) + i * 60; if (c < best) { best = c; g = q; } })); }
  boxes.push(g.box);
  if (!noArrow) chips += `<path d="M${g.s[0].toFixed(1)},${g.s[1].toFixed(1)}Q${g.ctrl[0].toFixed(1)},${g.ctrl[1].toFixed(1)} ${g.e[0].toFixed(1)},${g.e[1].toFixed(1)}" fill="none" stroke="${C.arrow}" stroke-width="3" stroke-dasharray="7 7" marker-end="url(#ah)"/>`;
  chips += `<rect x="${g.box.x1.toFixed(1)}" y="${g.box.y1.toFixed(1)}" width="${(hw * 2).toFixed(1)}" height="38" rx="16" fill="${C.ink}"/><text class="chiptx" x="${g.cx.toFixed(1)}" y="${g.cy.toFixed(1)}" text-anchor="middle" dominant-baseline="central">${esc(text)}</text>`; });

const auto = (geo.auto || []).filter(p => { const [x, y] = P(p.lon, p.lat); return x > 60 && x < W - 60 && y > 60 && y < H - 80; });
const picked = [];
const far = (p, d) => { const [x, y] = P(p.lon, p.lat); return ![...cfg.places, ...picked].some(q => q.lat != null && Math.hypot(P(q.lon, q.lat)[0] - x, P(q.lon, q.lat)[1] - y) < d) && !cfg.stops.some(s => Math.hypot(P(s.lon, s.lat)[0] - x, P(s.lon, s.lat)[1] - y) < (p.kind === 'town' ? 110 : 45) || (s.label || s.name).toLowerCase().includes(p.name.toLowerCase()) || p.name.toLowerCase().includes(s.name.toLowerCase())); };
auto.filter(p => p.kind === 'town').sort((a, b) => (b.rank || 0) - (a.rank || 0)).forEach(p => { if (picked.filter(q => q.kind === 'town').length < (cfg.autoTowns ?? 3) && far(p, 150)) picked.push(Object.assign({ auto: true }, p)); });
auto.filter(p => p.kind === 'peak' && p.ele).sort((a, b) => b.ele - a.ele).forEach(p => { if (picked.filter(q => q.kind === 'peak').length < (cfg.autoPeaks ?? 6) && far(p, 170)) picked.push(Object.assign({ auto: true }, p, { ele: Math.round(p.ele).toLocaleString('en') + ' m' })); });
picked.forEach(p => { const [x, y] = P(p.lon, p.lat); p._m = { x1: x - 12, x2: x + 12, y1: y - 12, y2: y + 12 }; });
let places = '';
[...cfg.places, ...picked].forEach(p => { const [x, y] = P(p.lon, p.lat);
  if (p.kind === 'lake') { places += `<ellipse cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" rx="${((p.w_km || 2) / 2 / kmPerPx).toFixed(1)}" ry="${((p.h_km || 1) / 2 / kmPerPx).toFixed(1)}" transform="rotate(${p.angle || 0} ${x.toFixed(1)} ${y.toFixed(1)})" fill="${C.water}" stroke="${C.cream}" stroke-width="2"/>`; if (!p.name) return; }
  if (p.kind === 'river') { places += `<text class="river" x="${x.toFixed(1)}" y="${y.toFixed(1)}" text-anchor="middle" dominant-baseline="central" transform="rotate(${p.angle || 0} ${x.toFixed(1)} ${y.toFixed(1)})">${esc(p.name)}</text>`; return; }
  const cls = p.kind === 'ocean' ? 'ocean' : p.kind === 'country' ? 'country' : p.kind === 'town' ? 'town' : p.kind === 'minor' ? 'minor' : 'place';
  const size = cls === 'town' ? 30 : cls === 'minor' ? 25 : cls === 'country' ? 30 : cls === 'ocean' ? 28 : 24, w = tw(p.name, size) * (cls === 'country' || cls === 'ocean' ? 1.75 : 1), two = !!p.ele, hh = two ? 26 : 15;
  const lb = pos => { const a = pos === 'W' ? 'end' : pos === 'E' ? 'start' : 'middle', lx = x + (a === 'end' ? -18 : a === 'start' ? 18 : 0), ly = y + (a === 'middle' ? (pos === 'N' ? -(hh + 12) : pos === 'S' ? hh + 14 : 0) : 0);
    return { a, lx, ly, box: { x1: a === 'end' ? lx - w : a === 'start' ? lx : lx - w / 2, x2: a === 'end' ? lx : a === 'start' ? lx + w : lx + w / 2, y1: ly - hh, y2: ly + hh } }; };
  let g, c0 = 0; const marker = ['peak', 'minor', 'town'].includes(p.kind);
  if (!marker) g = lb('C'); else if (p.labelPos) g = lb(p.labelPos); else { let best = 1e18; ['E', 'W', 'N', 'S'].forEach((k, i) => { const q = lb(k), c = cost(q.box) + i * 20; if (c < best) { best = c; g = q; c0 = c; } }); }
  if (p.auto && (c0 > area(g.box) * 0.5 || cost(p._m) > 250)) return;
  if (marker && p.auto) boxes.push(p._m); boxes.push(g.box);
  if (p.kind === 'peak') places += `<path d="M${(x - 11).toFixed(1)},${(y + 8).toFixed(1)}L${x.toFixed(1)},${(y - 10).toFixed(1)}L${(x + 11).toFixed(1)},${(y + 8).toFixed(1)}Z" fill="${C.ink}" stroke="${C.cream}" stroke-width="2.5" stroke-linejoin="round"/>`;
  if (p.kind === 'minor') places += `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="7" fill="${C.cream}" stroke="${C.arrow}" stroke-width="3.5"/>`;
  if (p.kind === 'town') places += `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="11" fill="${C.cream}" stroke="${C.ink}" stroke-width="3"/><circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="4.5" fill="${C.ink}"/>`;
  places += `<text class="${cls}" x="${g.lx.toFixed(1)}" y="${(g.ly - (two ? 11 : 0)).toFixed(1)}" text-anchor="${g.a}" dominant-baseline="central">${esc(p.name)}</text>` + (two ? `<text class="ele" x="${g.lx.toFixed(1)}" y="${(g.ly + 13).toFixed(1)}" text-anchor="${g.a}" dominant-baseline="central">${esc(p.ele)}</text>` : ''); });

let glyphs = '', used = [];
for (const [x, y] of peaks) { if (used.length >= (cfg.glyphs ?? 9)) break; if (x < 50 || x > W - 50 || y < 50 || y > H - 60) continue;
  const gb = { x1: x - 36, x2: x + 36, y1: y - 30, y2: y + 22 }; if (boxes.some(o => ov(gb, o) > 0)) continue;
  if (trackPts.some(q => Math.hypot(q[0] - x, q[1] - y) < 60) || used.some(q => Math.hypot(q[0] - x, q[1] - y) < 160)) continue; used.push([x, y]);
  const k = 1 + (used.length % 3) * 0.18;
  glyphs += `<path d="M${(x - 26 * k).toFixed(1)},${(y + 12 * k).toFixed(1)}l${(14 * k).toFixed(1)},${(-24 * k).toFixed(1)}l${(8 * k).toFixed(1)},${(11 * k).toFixed(1)}l${(9 * k).toFixed(1)},${(-18 * k).toFixed(1)}l${(17 * k).toFixed(1)},${(31 * k).toFixed(1)}" fill="none" stroke="${C.ink}" stroke-width="3" stroke-linejoin="round" stroke-linecap="round" opacity=".8"/>` +
    `<path d="M${(x - 12 * k).toFixed(1)},${(y - 12 * k).toFixed(1)}l${(4 * k).toFixed(1)},${(9 * k).toFixed(1)}l${(5 * k).toFixed(1)},${(-4 * k).toFixed(1)}" fill="none" stroke="${C.ink}" stroke-width="2" stroke-linecap="round" opacity=".6"/>`; }

// ---------- furniture ----------
const b64 = f => fs.readFileSync(f).toString('base64');
const ff = (pkg, file) => b64(path.join(__dirname, 'node_modules/@fontsource', pkg, 'files', file));
const fontCSS = `@font-face{font-family:'Alfa Slab One';src:url(data:font/woff2;base64,${ff('alfa-slab-one', 'alfa-slab-one-latin-400-normal.woff2')}) format('woff2')}` +
  `@font-face{font-family:'Alfa Slab One';unicode-range:U+0100-024F,U+1E00-1EFF;src:url(data:font/woff2;base64,${ff('alfa-slab-one', 'alfa-slab-one-latin-ext-400-normal.woff2')}) format('woff2')}` +
  `@font-face{font-family:'Barlow Condensed';font-weight:600;src:url(data:font/woff2;base64,${ff('barlow-condensed', 'barlow-condensed-latin-600-normal.woff2')}) format('woff2')}` +
  `@font-face{font-family:'Barlow Condensed';font-weight:600;unicode-range:U+0100-024F,U+1E00-1EFF;src:url(data:font/woff2;base64,${ff('barlow-condensed', 'barlow-condensed-latin-ext-600-normal.woff2')}) format('woff2')}`;
const logo = 'data:image/png;base64,' + b64(cfg.logo ? path.join(__dirname, cfg.logo) : path.join(__dirname, '../../public/img/logo.png'));
const title = tLines.map((l, i) => `<text class="title" x="${tx}" y="${(tTop + tSize * 0.86 + i * tSize * 0.98).toFixed(1)}" text-anchor="${tAnchor}" font-size="${tSize}">${esc(l.toUpperCase())}</text>`).join('') +
  `<image href="${logo}" x="${east ? W - 56 - 150 : 56}" y="${(tTop + tLines.length * tSize * 0.98 + 26).toFixed(1)}" width="150" height="150"/>`;
const anyReal = geo.lines.length > 0, osm = anyReal || (geo.auto || []).length || geo.stops;
const credit = cfg.credit || [anyReal ? 'Trail and places: © OpenStreetMap contributors' : osm ? 'Places: © OpenStreetMap contributors' : '', 'Terrain: Tilezen / AWS Terrain Tiles', cfg.borders === false ? '' : 'Borders: Natural Earth', anyReal ? '' : 'Route drawn schematically'].filter(Boolean).join(' · ');

const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">
<defs><style>${fontCSS}
.title{font-family:'Alfa Slab One',serif;fill:${C.ink};letter-spacing:.01em}
.stoptx{font-family:'Barlow Condensed',sans-serif;font-weight:600;font-size:${sSize}px;fill:${C.cream};letter-spacing:.02em}
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
<path d="${borders}" fill="none" stroke="${C.border}" stroke-width="2.5" stroke-linejoin="round" stroke-dasharray="14 6 3 6"/>
${riversSvg}${lakesSvg}${glyphs}${altSvg}${mainSvg}${routes}${places}${chips}${dots}${labels}
${title}
${legend}
<text class="mark" x="${W - 40}" y="${H - 58}" text-anchor="end">TREK</text><text class="mark" x="${W - 40}" y="${H - 28}" text-anchor="end">TRAILS</text>
<text class="credit" x="32" y="${H - 26}">${esc(credit)}</text>
</g></svg>`;
const html = `<!doctype html><html><head><meta charset="utf-8"></head><body style="margin:0;background:#fff">${svg}<script>document.fonts.ready.then(()=>{document.body.dataset.ready='1'});</script></body></html>`;
fs.writeFileSync(path.join(__dirname, 'out', cfg.slug + '.html'), html);
console.log(cfg.slug, `${W}x${H}`, '| zoom', z, '| km/px', kmPerPx.toFixed(3), '| corner', corner, '| real lines', geo.lines.filter(l => l.cls === 'main').length, '| schematic', anySchematic, '| auto places', picked.length);
