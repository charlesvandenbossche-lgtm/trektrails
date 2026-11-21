# usage: python3 profile.py <slug>  -> out/<slug>-profile.html (then screenshot.py <slug>-profile)
# Needs geo/<slug>-elev.json (elevation.py) and specs/<slug>.json. Stop labels come from cfg/<slug>.json
# ("label" per stop) or from "profileLabels": {"Stop name": "Short label"} in the cfg.
import json, sys, base64, os
slug = sys.argv[1]; os.makedirs('out', exist_ok=True)
e = json.load(open(f'geo/{slug}-elev.json')); spec = json.load(open(f'specs/{slug}.json')); cfg = json.load(open(f'cfg/{slug}.json'))
lab = {s['name']: s.get('label', s['name']) for s in cfg['stops']}; lab.update(cfg.get('profileLabels', {}))
W, H, L, R, T, B = 1600, 620, 90, 40, 150, 110
pts = []; off = 0; marks = []
for i, st in enumerate(spec['stages']):
    k = st[0] + '|' + st[1]
    if k not in e: continue
    s = e[k]
    if not marks: marks.append((off, s['prof'][0][1], lab.get(st[0], st[0])))
    for d, z in s['prof']: pts.append((off + d, z))
    off += s['km']; pts.append((off, s['prof'][-1][1])); marks.append((off, s['prof'][-1][1], lab.get(st[1], st[1])))
_seen=set(); marks=[m for m in marks if m[2] and not (m[2] in _seen or _seen.add(m[2]))]  # blank label hides a stop; repeats show once
tot = off; import math
zmax = max(1000, math.ceil((max(z for _, z in pts) + 250) / 500) * 500)
up = sum(v['up'] for v in e.values()); dn = sum(v['down'] for v in e.values())
X = lambda d: L + d / tot * (W - L - R); Y = lambda z: H - B - (z / zmax) * (H - T - B)
path = 'M' + 'L'.join(f'{X(d):.1f},{Y(z):.1f}' for d, z in pts)
area = path + f'L{X(tot):.1f},{Y(0):.1f}L{X(0):.1f},{Y(0):.1f}Z'
ff = lambda pkg, f: base64.b64encode(open(f'node_modules/@fontsource/{pkg}/files/{f}', 'rb').read()).decode()
css = (f"@font-face{{font-family:'Alfa Slab One';src:url(data:font/woff2;base64,{ff('alfa-slab-one','alfa-slab-one-latin-400-normal.woff2')}) format('woff2')}}"
       f"@font-face{{font-family:'Barlow Condensed';font-weight:600;src:url(data:font/woff2;base64,{ff('barlow-condensed','barlow-condensed-latin-600-normal.woff2')}) format('woff2')}}"
       f"@font-face{{font-family:'Barlow Condensed';font-weight:600;unicode-range:U+0100-024F;src:url(data:font/woff2;base64,{ff('barlow-condensed','barlow-condensed-latin-ext-600-normal.woff2')}) format('woff2')}}")
step = 500 if zmax <= 3500 else 1000
g = ''
for z in range(0, zmax + 1, step):
    g += f'<line x1="{L}" x2="{W-R}" y1="{Y(z):.1f}" y2="{Y(z):.1f}" stroke="#293029" stroke-opacity=".12"/><text class="ax" x="{L-12}" y="{Y(z):.1f}" text-anchor="end" dominant-baseline="central">{z:,} m</text>'
kstep = 10 if tot < 80 else 20 if tot < 200 else 50
for d in range(0, int(tot) + 1, kstep):
    g += f'<text class="ax" x="{X(d):.1f}" y="{H-B+26}" text-anchor="middle">{d} km</text><line x1="{X(d):.1f}" x2="{X(d):.1f}" y1="{H-B}" y2="{H-B+8}" stroke="#293029" stroke-opacity=".4"/>'
lb = ''
for i, (d, z, n) in enumerate(marks):
    x = X(d); y = Y(z); ly = max(T - 34, y - 58) if i % 2 == 0 else max(T - 8, y - 30)
    a = 'start' if i == 0 else 'end' if i == len(marks) - 1 else 'middle'
    lb += f'<line x1="{x:.1f}" x2="{x:.1f}" y1="{y:.1f}" y2="{ly+8:.1f}" stroke="#293029" stroke-width="1.5" stroke-opacity=".5"/><circle cx="{x:.1f}" cy="{y:.1f}" r="6" fill="#F1EFE0" stroke="#293029" stroke-width="3"/><text class="st" x="{x:.1f}" y="{ly:.1f}" text-anchor="{a}">{n}</text>'
first, last = marks[0][2], marks[-1][2]
svg = f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" width="{W}" height="{H}"><style>{css}.t{{font-family:'Alfa Slab One';font-size:40px;fill:#293029}}.ax{{font-family:'Barlow Condensed';font-weight:600;font-size:20px;fill:#6B6F63}}.st{{font-family:'Barlow Condensed';font-weight:600;font-size:21px;fill:#293029;paint-order:stroke;stroke:#EFEBD8;stroke-width:5px}}.cr{{font-family:'Barlow Condensed';font-weight:600;font-size:18px;fill:#6B6F63}}</style>
<rect width="{W}" height="{H}" fill="#EFEBD8"/><text class="t" x="{L}" y="62">ELEVATION PROFILE</text><text class="ax" x="{L}" y="94">{first} to {last} · {tot:.0f} km · about +{round(up,-2):,} m / −{round(dn,-2):,} m</text>
{g}<path d="{area}" fill="#7E9E6C" fill-opacity=".55"/><path d="{path}" fill="none" stroke="#C8632F" stroke-width="4" stroke-linejoin="round"/>{lb}
<text class="cr" x="{L}" y="{H-22}">Trail: © OpenStreetMap contributors · Elevation: AWS Terrain Tiles · Trek Trails</text></svg>'''
open(f'out/{slug}-profile.html', 'w').write(f'<!doctype html><html><head><meta charset="utf-8"></head><body style="margin:0">{svg}<script>document.fonts.ready.then(()=>{{document.body.dataset.ready="1"}})</script></body></html>')
print('ok', slug, round(tot, 1), 'km', up, dn)
