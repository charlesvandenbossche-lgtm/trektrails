# usage: python3 find-names.py <lat> <lon> <half-size-deg> "regex"  -> named OSM features in that box
import os
os.makedirs('osm',exist_ok=True)
import sys,subprocess,os,re,time,unicodedata,xml.etree.ElementTree as ET
lat,lon,d=float(sys.argv[1]),float(sys.argv[2]),float(sys.argv[3]); pat=re.compile(sys.argv[4],re.I)
bbox=f"{lon-d:.4f},{lat-d:.4f},{lon+d:.4f},{lat+d:.4f}"; f='osm/n_'+bbox.replace(',','_')+'.xml'
if not os.path.exists(f) or os.path.getsize(f)<150: subprocess.run(['curl','-sS','-m','200','-o',f,f'https://api.openstreetmap.org/api/0.6/map?bbox={bbox}'])
try: r=ET.parse(f).getroot()
except Exception: print('FAIL',open(f).read()[:120]); sys.exit()
nd={n.get('id'):(n.get('lat'),n.get('lon')) for n in r.findall('node')}
def nrm(s): return unicodedata.normalize('NFKD',s).encode('ascii','ignore').decode()
for e in list(r.findall('node'))+list(r.findall('way'))+list(r.findall('relation')):
    t={x.get('k'):x.get('v') for x in e.findall('tag')}
    nm=' | '.join(v for k,v in t.items() if k.startswith('name') or k in('int_name','alt_name'))
    if nm and pat.search(nrm(nm)):
        p=(e.get('lat'),e.get('lon')) if e.tag=='node' else (nd.get(e.find('nd').get('ref')) if e.tag=='way' and e.find('nd') is not None else ('rel',e.get('id')))
        print(e.tag,p,nm[:90],t.get('place') or t.get('natural') or t.get('tourism') or t.get('route') or t.get('waterway') or '')
