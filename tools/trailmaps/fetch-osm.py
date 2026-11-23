# usage (from tools/trailmaps): python3 fetch-osm.py specs/<slug>.json
# Looks up each stop in OpenStreetMap, finds hiking-route relations shared between stops, cuts real stage lines.
import sys, os, json, math, heapq, time, subprocess, unicodedata, re
import xml.etree.ElementTree as ET

spec = json.load(open(sys.argv[1])); slug = spec['slug']
os.makedirs('osm', exist_ok=True); os.makedirs('geo', exist_ok=True)
def dist(a, b): return math.hypot((a[0]-b[0])*math.cos(math.radians(a[1]))*111.32, (a[1]-b[1])*110.57)
def norm(s): return re.sub(r'[^a-z0-9]+', ' ', unicodedata.normalize('NFKD', s or '').encode('ascii', 'ignore').decode().lower()).strip()
def latin(s): return bool(s) and all(ord(c) < 0x250 for c in s)

def fetch_bbox(lat, lon, d):
    while d >= 0.004:
        bbox = f"{lon-d:.4f},{lat-d:.4f},{lon+d:.4f},{lat+d:.4f}"; f = 'osm/b_' + bbox.replace(',', '_') + '.xml'
        if not os.path.exists(f) or os.path.getsize(f) < 150:
            subprocess.run(['curl', '-sS', '-m', '150', '-o', f, f'https://api.openstreetmap.org/api/0.6/map?bbox={bbox}']); time.sleep(1)
        try: return ET.parse(f).getroot()
        except Exception:
            d /= 2
    return None

stops = spec['stops']; rels_at = {}; relinfo = {}; auto = {}; lakes = []; fixed = {}
D = spec.get('box', 0.03)
for s in stops:
    if s.get('lat') is None: continue
    r = fetch_bbox(s['lat'], s['lon'], s.get('box', D))
    if r is None: print('!! no data for', s['name']); continue
    nd = {n.get('id'): (float(n.get('lon')), float(n.get('lat'))) for n in r.findall('node')}
    q = norm(s.get('q') or s['name']); best = None
    def consider(t, pos):
        global best
        names = [t.get('name'), t.get('name:en'), t.get('int_name'), t.get('alt_name'), t.get('official_name')]
        if not (t.get('place') or t.get('tourism') or t.get('natural') in ('peak', 'saddle', 'water') or t.get('amenity') or t.get('mountain_pass') or t.get('railway') or t.get('highway') == 'bus_stop' or t.get('historic') or t.get('barrier')): return
        for nm in names:
            if nm and (q == norm(nm) or (len(q) > 4 and q in norm(nm))):
                dd = dist(pos, (s['lon'], s['lat'])) + (0 if q == norm(nm) else 0.3) + (0 if t.get('place') or t.get('tourism') in ('alpine_hut', 'camp_site', 'wilderness_hut') else 0.2)
                if best is None or dd < best[0]: best = (dd, pos, nm)
    for n in r.findall('node'):
        t = {x.get('k'): x.get('v') for x in n.findall('tag')}
        if not t: continue
        pos = (float(n.get('lon')), float(n.get('lat'))); consider(t, pos)
        nm = t.get('name:en') if latin(t.get('name:en')) else t.get('name')
        if not latin(nm): continue
        if t.get('natural') == 'peak' and t.get('ele'):
            try: auto[n.get('id')] = dict(kind='peak', name=nm.split(' / ')[0].split(' - ')[0], ele=float(re.sub(r'[^0-9.]', '', t['ele'].replace(',', '.')) or 0), lat=pos[1], lon=pos[0])
            except Exception: pass
        if t.get('place') in ('city', 'town'): auto[n.get('id')] = dict(kind='town', name=nm, rank=2 if t['place'] == 'city' else 1, lat=pos[1], lon=pos[0])
    for w in r.findall('way'):
        t = {x.get('k'): x.get('v') for x in w.findall('tag')}
        if not t: continue
        p = [nd[x.get('ref')] for x in w.findall('nd') if x.get('ref') in nd]
        if not p: continue
        consider(t, p[0])
        if t.get('natural') == 'water' and len(p) > 25 and w.findall('nd')[0].get('ref') == w.findall('nd')[-1].get('ref'): lakes.append(p)
    for rel in r.findall('relation'):
        t = {x.get('k'): x.get('v') for x in rel.findall('tag')}
        if t.get('type') == 'route' and t.get('route') in ('hiking', 'foot'):
            nmem = len(rel.findall('member'))
            rels_at.setdefault(s['name'], set()).add(rel.get('id')); relinfo[rel.get('id')] = (t.get('name') or t.get('ref') or '', nmem, t.get('network'))
    if best and best[0] < spec.get('matchkm', 6):
        fixed[s['name']] = best[1]; print(f"{s['name']}: matched '{best[2]}' {best[0]:.1f} km from guess")
    else: print(f"{s['name']}: no name match, keeping guess")
pos = {s['name']: (fixed.get(s['name']) or ((s['lon'], s['lat']) if s.get('lat') is not None else None)) for s in stops}

# candidate relations: present at both ends of a stage, or forced
cand = set(str(x) for x in spec.get('relations', []))
count = {}
for nm, rs in rels_at.items():
    for x in rs: count[x] = count.get(x, 0) + 1
for st in spec['stages']:
    a, b = st[0], st[1]
    cand |= (rels_at.get(a, set()) & rels_at.get(b, set()))
cand |= {x for x, c in count.items() if c >= 2}
if spec.get('only'): cand = set(str(x) for x in spec['relations'])
cand = {x for x in cand if relinfo.get(x, ('', 0))[1] <= spec.get('maxmembers', 4000) or x in map(str, spec.get('relations', []))}
cand -= set(map(str, spec.get('skip', [])))
print('relations:', [(x, relinfo.get(x, ('?',))[0]) for x in sorted(cand, key=lambda x: -count.get(x, 0))][:14])
nodes = {}; G = {}; allways = []; ways_by_rel = {}; loaded = set()
def add(a, b, f=1.0):
    d = dist(nodes[a], nodes[b]) * f; G.setdefault(a, []).append((b, d)); G.setdefault(b, []).append((a, d))
def load(rid):
    if rid in loaded: return
    loaded.add(rid); f = f'osm/rel{rid}.xml'
    if not os.path.exists(f) or os.path.getsize(f) < 150:
        subprocess.run(['curl', '-sS', '-m', '300', '-o', f, f'https://api.openstreetmap.org/api/0.6/relation/{rid}/full']); time.sleep(1)
    try: r = ET.parse(f).getroot()
    except Exception: print('!! relation', rid, 'unreadable'); return
    for n in r.findall('node'): nodes[n.get('id')] = (float(n.get('lon')), float(n.get('lat')))
    ways = {w.get('id'): [x.get('ref') for x in w.findall('nd')] for w in r.findall('way')}
    rel = [x for x in r.findall('relation') if x.get('id') == rid]
    for m in (rel[0].findall('member') if rel else []):
        if m.get('type') == 'way' and m.get('ref') in ways:
            w = ways[m.get('ref')]; allways.append(w); ways_by_rel.setdefault(rid, []).append(w)
            for a, b in zip(w, w[1:]): add(a, b)
    kids = [m.get('ref') for m in (rel[0].findall('member') if rel else []) if m.get('type') == 'relation']
    for k in kids[:spec.get('maxkids', 60)]: load(k)
def components():
    comp = {}; c = 0
    for k in G:
        if k in comp: continue
        st = [k]
        while st:
            u = st.pop()
            if u in comp: continue
            comp[u] = c; st.extend(v for v, _ in G[u])
        c += 1
    return comp
def bridge():
    """Join loose way ends to the nearest node of another component within `gap` km (grid-indexed)."""
    gap = spec.get('gap', 0.7); cs = 0.01
    for _ in range(3):
        comp = components(); grid = {}
        for k in G:
            x, y = nodes[k]; grid.setdefault((int(x // cs), int(y // cs)), []).append(k)
        ends = set(x for w in allways for x in (w[0], w[-1]) if x in G); joined = 0
        r = int(gap / 111 / cs) + 1
        for e in ends:
            ex, ey = nodes[e]; gx, gy = int(ex // cs), int(ey // cs); best = None
            for i in range(gx - r, gx + r + 1):
                for j in range(gy - r, gy + r + 1):
                    for k in grid.get((i, j), ()):
                        if comp[k] == comp[e]: continue
                        d = dist(nodes[e], nodes[k])
                        if d < gap and (best is None or d < best[0]): best = (d, k)
            if best: add(e, best[1]); joined += 1
        if not joined: break
for rid in cand: load(rid)
# "network": true -> also route over every mapped path and track in the area (for treks without a route relation)
if spec.get('network'):
    W = {'path': 1.0, 'footway': 1.0, 'steps': 1.0, 'bridleway': 1.0, 'track': 1.25, 'unclassified': 1.6, 'residential': 1.4, 'service': 1.6, 'living_street': 1.4, 'tertiary': 2.5, 'secondary': 3.5, 'primary': 5}
    def netload(a, b, c, d, depth=0):
        """Fetch one bbox from the OSM map API; split it in four when it is too dense (API refuses >50k nodes)."""
        bbox = f"{a:.4f},{b:.4f},{c:.4f},{d:.4f}"; f = 'osm/n_' + bbox.replace(',', '_') + '.xml'
        if not os.path.exists(f) or os.path.getsize(f) < 150:
            subprocess.run(['curl', '-sS', '-m', '200', '-o', f, f'https://api.openstreetmap.org/api/0.6/map?bbox={bbox}']); time.sleep(1)
        try: return [ET.parse(f).getroot()]
        except Exception:
            if depth >= 3: print('!! area', bbox, 'unreadable'); return []
            mx, my = (a + c) / 2, (b + d) / 2
            return [r for q in ((a, b, mx, my), (mx, b, c, my), (a, my, mx, d), (mx, my, c, d)) for r in netload(*q, depth=depth + 1)]
    W.update(spec.get('weights', {}))
    lats = [s['lat'] for s in stops if s.get('lat') is not None]; lons = [s['lon'] for s in stops if s.get('lon') is not None]
    m = spec.get('netmargin', 0.02); cell = 0.05
    la0, la1, lo0, lo1 = min(lats) - m, max(lats) + m, min(lons) - m, max(lons) + m
    la = la0; nw = 0
    while la < la1:
        lo = lo0
        while lo < lo1:
            for r in netload(lo, la, min(lo+cell, lo1), min(la+cell, la1)):
                for n in r.findall('node'): nodes[n.get('id')] = (float(n.get('lon')), float(n.get('lat')))
                for w in r.findall('way'):
                    t = {x.get('k'): x.get('v') for x in w.findall('tag')}
                    fw = W.get(t.get('highway'))
                    if fw is None: continue
                    refs = [x.get('ref') for x in w.findall('nd') if x.get('ref') in nodes]
                    for a2, b2 in zip(refs, refs[1:]): add(a2, b2, fw)
                    allways.append(refs); nw += 1
            lo += cell
        la += cell
    print('network ways', nw)
if G: bridge()
def nearest(p): return min(G, key=lambda n: dist(nodes[n], p))
def path(a, b):
    Dm = {a: 0}; Pm = {}; h = [(0, a)]
    while h:
        d, u = heapq.heappop(h)
        if u == b: break
        if d > Dm[u]: continue
        for v, w in G[u]:
            if d + w < Dm.get(v, 1e18): Dm[v] = d + w; Pm[v] = u; heapq.heappush(h, (d + w, v))
    if b not in Dm: return None, None
    out = [b]
    while out[-1] != a: out.append(Pm[out[-1]])
    return out[::-1], Dm[b]
snap = {}; SN = spec.get('snap', 2.0)
if G:
    for nm, p in pos.items():
        if p is None: continue
        nn = nearest(p); d = dist(nodes[nn], p)
        if d < SN: snap[nm] = nn
    # stops without a position: place them along the mapped trail between known neighbours, by stage distance
    names = [s['name'] for s in stops]
    i = 0
    while i < len(names):
        if pos[names[i]] is None:
            j = i
            while j < len(names) and pos[names[j]] is None: j += 1
            if i > 0 and j < len(names) and names[i-1] in snap and names[j] in snap:
                pth, dkm = path(snap[names[i-1]], snap[names[j]])
                kms = []
                for k in range(i-1, j):
                    st = [s for s in spec['stages'] if s[0] == names[k] and s[1] == names[k+1]]; kms.append(st[0][2] if st and len(st[0]) > 2 and st[0][2] else 1)
                if pth:
                    cum = [0]
                    for a, b in zip(pth, pth[1:]): cum.append(cum[-1] + dist(nodes[a], nodes[b]))
                    acc = 0
                    for k in range(i, j):
                        acc += kms[k-i]; target = dkm * acc / sum(kms)
                        idx = min(range(len(cum)), key=lambda t: abs(cum[t]-target)); snap[names[k]] = pth[idx]; pos[names[k]] = nodes[pth[idx]]
                        print(f'{names[k]}: placed along the mapped trail ({target:.1f} of {dkm:.1f} km)')
            i = j
        else: i += 1
def run_stages():
    res = {}; lines = []
    for st in spec['stages']:
        a, b = st[0], st[1]; site = st[2] if len(st) > 2 else None
        p = d = None
        if [a, b] in spec.get('straight', []) and pos.get(a) and pos.get(b):  # e.g. a beach walk with no mapped path
            A, B = pos[a], pos[b]; n = 40; pts = [(A[0] + (B[0]-A[0])*i/n, A[1] + (B[1]-A[1])*i/n) for i in range(n+1)]
            d = sum(dist(x, y) for x, y in zip(pts, pts[1:]))
            res[a+'|'+b] = dict(km=round(d, 1), real=True, site=site); lines.append({'cls': 'main', 'key': a+'|'+b, 'pts': pts}); continue
        if a in snap and b in snap and snap[a] != snap[b]: p, d = path(snap[a], snap[b])
        if p: d = sum(dist(nodes[x], nodes[y]) for x, y in zip(p, p[1:]))  # true length, not the weighted cost
        lo, hi = spec.get('ratio', [0.5, 1.9])
        ok = p is not None and (site is None or lo*site <= d <= hi*site)
        res[a+'|'+b] = dict(km=d and round(d, 1), real=ok, site=site)
        if ok: lines.append({'cls': 'main', 'key': a+'|'+b, 'pts': [nodes[n] for n in p]})
    return res, lines
def resnap():
    for nm, p in pos.items():
        if p is None or not G: continue
        nn = nearest(p); d = dist(nodes[nn], p)
        if d < SN: snap[nm] = nn
res, lines = run_stages() if G else ({}, [])
fail = [k for k, v in res.items() if not v['real']] if res else [s[0]+'|'+s[1] for s in spec['stages']]
if fail and spec.get('local', True) and not spec.get('only'):
    extra = set()
    for k in fail:
        a, b = k.split('|')
        extra |= {x for x in rels_at.get(a, set()) | rels_at.get(b, set()) if relinfo[x][1] <= 500}
    extra -= loaded; extra -= set(map(str, spec.get('skip', [])))
    extra = sorted(extra, key=lambda x: -count.get(x, 0))[:spec.get('maxlocal', 30)]
    if extra:
        print('second pass with', len(extra), 'local trails')
        for rid in extra: load(rid)
        bridge(); resnap(); res, lines = run_stages()
for k, v in res.items(): print(f"{k.replace('|', ' -> ')}: mapped {v['km']} km, site {v['site']} -> {'REAL' if v['real'] else 'schematic'}")
if spec.get('alt'):
    rid = str(spec['alt']) if spec['alt'] is not True else max(ways_by_rel, key=lambda x: count.get(x, 0), default=None)
    for w in ways_by_rel.get(rid, []): lines.append({'cls': 'alt', 'pts': [nodes[n] for n in w]})
out = dict(lines=lines, rivers=[], lakes=lakes if spec.get('lakes', True) else [], stages=res,
           stops={k: list(v) for k, v in pos.items() if v is not None}, snap={k: list(nodes[v]) for k, v in snap.items()}, auto=list(auto.values()))
json.dump(out, open(f'geo/{slug}.json', 'w'), ensure_ascii=False)
print('real stages:', sum(1 for v in res.values() if v['real']), 'of', len(res), '| peaks', sum(1 for a in auto.values() if a['kind'] == 'peak'), '| lakes', len(lakes))
if os.environ.get('DEBUG'):
    comp = {}
    def flood(s, c):
        st = [s]
        while st:
            u = st.pop()
            if u in comp: continue
            comp[u] = c; st.extend(v for v, _ in G[u])
    c = 0
    for k in G:
        if k not in comp: flood(k, c); c += 1
    print('components', c)
    for nm in snap: print(' ', nm, 'comp', comp[snap[nm]], 'snapdist', round(dist(nodes[snap[nm]], pos[nm]), 2))
    sizes = {}
    for k, v in comp.items(): sizes[v] = sizes.get(v, 0) + 1
    big = sorted(sizes, key=lambda x: -sizes[x])[:6]
    for a in big:
        for b in big:
            if a < b:
                na = [k for k in comp if comp[k] == a][::7]; nb = [k for k in comp if comp[k] == b][::7]
                print('  gap', a, b, sizes[a], sizes[b], round(min(dist(nodes[x], nodes[y]) for x in na for y in nb), 2))
