# per-stage ascent/descent and min/max from terrain tiles along the mapped line
# usage: python3 elevation.py <slug>  -> geo/<slug>-elev.json, per-stage km / climb / descent from the mapped line
import json,math,sys,os,subprocess
from PIL import Image
os.makedirs('tiles',exist_ok=True); slug=sys.argv[1]; g=json.load(open(f'geo/{slug}.json')); Z=13; cache={}
def tile(x,y):
    k=(x,y)
    if k not in cache:
        f=f'tiles/{Z}-{x}-{y}.png'
        if not os.path.exists(f) or os.path.getsize(f)<500: subprocess.run(['curl','-sS','-m','40','-o',f,f'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{Z}/{x}/{y}.png'])
        cache[k]=Image.open(f).convert('RGB').load()
    return cache[k]
def ele(lon,lat):
    n=2**Z; x=(lon+180)/360*n; s=math.sin(math.radians(lat)); y=(0.5-math.log((1+s)/(1-s))/(4*math.pi))*n
    px=tile(int(x),int(y)); r,gg,b=px[min(255,int((x%1)*256)),min(255,int((y%1)*256))]; return r*256+gg+b/256-32768
def dist(a,b): return math.hypot((a[0]-b[0])*math.cos(math.radians(a[1]))*111.32,(a[1]-b[1])*110.57)
out={}
for l in g['lines']:
    if l.get('cls')!='main': continue
    pts=l['pts']; prof=[]; d=0; last=None
    for p in pts:
        if last is not None: d+=dist(last,p)
        last=p
        if not prof or d-prof[-1][0]>0.04: prof.append((d,ele(*p)))
    # smooth
    e=[v for _,v in prof]; sm=[sum(e[max(0,i-2):i+3])/len(e[max(0,i-2):i+3]) for i in range(len(e))]
    up=dn=0; ref=sm[0]; T=12
    for v in sm:
        if v-ref>T: up+=v-ref; ref=v
        elif ref-v>T: dn+=ref-v; ref=v
    out[l['key']]=dict(km=round(d,1),up=int(round(up,-1)),down=int(round(dn,-1)),start=int(sm[0]),end=int(sm[-1]),max=int(max(sm)),min=int(min(sm)),prof=[(round(a,2),int(b)) for a,b in zip([x for x,_ in prof],sm)][::3])
    print(l['key'],{k:v for k,v in out[l['key']].items() if k!='prof'})
json.dump(out,open(f'geo/{slug}-elev.json','w'))
print('total km',round(sum(v['km'] for v in out.values()),1),'up',sum(v['up'] for v in out.values()),'down',sum(v['down'] for v in out.values()))
