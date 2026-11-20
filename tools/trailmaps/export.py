# usage: python3 export.py <slug> [--profile]
# Copies out/<slug>.png to public/img/maps/<slug>.webp, registers it in src/data/maps.json,
# and with --profile also out/<slug>-profile.png -> public/img/maps/<slug>-profile.webp.
import sys, json, os
from PIL import Image
here = os.path.dirname(os.path.abspath(__file__)); root = os.path.join(here, '..', '..')
slug = sys.argv[1]; note = ''
for a in sys.argv[2:]:
    if a.startswith('--note='): note = a[7:]
im = Image.open(os.path.join(here, 'out', slug + '.png')).convert('RGB')
im.save(os.path.join(root, 'public/img/maps', slug + '.webp'), quality=84, method=6)
mp_path = os.path.join(root, 'src/data/maps.json'); mp = json.load(open(mp_path))
mp[slug] = {'w': im.width, 'h': im.height, 'note': note or mp.get(slug, {}).get('note', '')}
json.dump(mp, open(mp_path, 'w'), ensure_ascii=False, indent=1)
if '--profile' in sys.argv:
    Image.open(os.path.join(here, 'out', slug + '-profile.png')).convert('RGB').save(os.path.join(root, 'public/img/maps', slug + '-profile.webp'), quality=84, method=6)
print('exported', slug, im.size)
