# usage: python3 screenshot.py <slug> [<slug> ...]  -> out/<slug>.png (full size) and out/<slug>-preview.jpg
# Needs Python Playwright. Set CHROME to a Chrome/Chromium path if Playwright's own browser is not installed.
import sys, os, pathlib, re
from playwright.sync_api import sync_playwright
from PIL import Image
kw = {'args': ['--no-sandbox']}
if os.environ.get('CHROME'): kw['executable_path'] = os.environ['CHROME']
elif os.path.exists('/usr/bin/google-chrome'): kw['executable_path'] = '/usr/bin/google-chrome'
with sync_playwright() as p:
    b = p.chromium.launch(**kw)
    for slug in sys.argv[1:]:
        html = f'out/{slug}.html'
        W, H = map(int, re.search(r'viewBox="0 0 (\d+) (\d+)"', open(html).read()).groups())
        pg = b.new_page(viewport={'width': W, 'height': H}); pg.goto(pathlib.Path(html).resolve().as_uri())
        pg.wait_for_function("document.body.dataset.ready==='1'"); pg.wait_for_timeout(250)
        pg.screenshot(path=f'out/{slug}.png'); pg.close()
        Image.open(f'out/{slug}.png').convert('RGB').resize((W * 5 // 8, H * 5 // 8)).save(f'out/{slug}-preview.jpg', quality=72)
        print('ok', slug, W, H)
    b.close()
