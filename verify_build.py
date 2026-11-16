#!/usr/bin/env python3
"""Pre-release checks for Dubai Fuel Monitor. Exit code 1 if anything fails.
Usage: python verify_build.py [--browser]   (--browser adds a Playwright load + offline smoke test)"""
import json, os, re, shutil, subprocess, sys
ROOT = os.path.dirname(os.path.abspath(__file__))
fails = []
def check(ok, msg):
    print(('PASS  ' if ok else 'FAIL  ') + msg)
    if not ok: fails.append(msg)
def read(p): return open(os.path.join(ROOT, p), encoding='utf-8').read()

for f in ['index.html', 'manifest.webmanifest', 'sw.js', 'offline.html', '.nojekyll', 'favicon.ico', 'apple-touch-icon.png', 'og-image.png', 'css/styles.css', 'js/app.js', 'js/news-fetcher.js']:
    check(os.path.exists(os.path.join(ROOT, f)), f'file present: {f}')

m = json.loads(read('manifest.webmanifest'))
check(m.get('start_url') == './' and m.get('scope') == './', 'manifest start_url and scope are "./"')
try:
    from PIL import Image
    sizes = set(); maskable = set()
    for i in m['icons']:
        p = os.path.join(ROOT, i['src']); ok = os.path.exists(p)
        if ok:
            w, h = Image.open(p).size; ok = f'{w}x{h}' == i['sizes']
        check(ok, f"icon {i['src']} exists and is {i['sizes']}")
        sizes.add(i['sizes']); 
        if 'maskable' in i.get('purpose', ''): maskable.add(i['sizes'])
    check({'192x192', '512x512'} <= sizes, 'manifest has 192 and 512 icons')
    check({'192x192', '512x512'} <= maskable, 'manifest has maskable 192 and 512 icons')
    check(Image.open(os.path.join(ROOT, 'og-image.png')).size == (1200, 630), 'og-image.png is 1200x630')
    check(Image.open(os.path.join(ROOT, 'apple-touch-icon.png')).size == (180, 180), 'apple-touch-icon.png is 180x180')
except ImportError:
    check(False, 'Pillow is required (pip install pillow)')

sw = read('sw.js'); app = read('js/app.js'); html = read('index.html')
core = re.findall(r"'([^']+)'", re.search(r'const CORE = \[(.*?)\];', sw, re.S).group(1))
check(all(p == './' or os.path.exists(os.path.join(ROOT, p)) for p in core), f'service worker precache: all {len(core)} entries exist')
check(all(p.startswith('./') for p in core), 'service worker precache paths are relative')
ver = re.search(r"CACHE = 'dubai-fuel-(v[\d.]+)'", sw).group(1); av = re.search(r"APP_VERSION = '(v[\d.]+)'", app).group(1)
check(ver == av, f'cache version ({ver}) matches APP_VERSION ({av})')
check(not re.search(r'(?:href|src)="/[^/]', html), 'index.html has no root-absolute asset paths')
check(html.count('https://esp046-cyber.github.io/uaegasoline/') >= 4 and 'dubaijebelalinews/' not in html, 'canonical / og / twitter URLs all point to /uaegasoline/')
check('viewport-fit=cover' in html, 'viewport has viewport-fit=cover')

def prices(key):
    blk = re.search(key + r":\s*\[(\[.*?\])\]", app, re.S).group(1)
    return [float(x) for x in re.findall(r",\s*([\d.]+)\]", blk)]
uae, ph = prices('uae'), prices('ph')
check(uae[2] < uae[1] < uae[0], f'UAE ordering E-Plus 91 < Special 95 < Super 98 {uae[:3]}')
check(ph[2] < ph[1] < ph[0], f'PH ordering RON 91 < RON 95 < RON 97/100 {ph[:3]}')

if shutil.which('node'):
    for js in ['js/app.js', 'js/news-fetcher.js', 'sw.js']:
        check(subprocess.run(['node', '--check', os.path.join(ROOT, js)], capture_output=True).returncode == 0, f'JavaScript syntax: {js}')

if '--browser' in sys.argv:
    import threading, http.server, functools, socketserver
    try:
        from playwright.sync_api import sync_playwright
        handler = functools.partial(http.server.SimpleHTTPRequestHandler, directory=ROOT)
        socketserver.TCPServer.allow_reuse_address = True
        srv = socketserver.TCPServer(('127.0.0.1', 8791), handler); threading.Thread(target=srv.serve_forever, daemon=True).start()
        with sync_playwright() as p:
            b = p.chromium.launch(); ctx = b.new_context(viewport={'width': 390, 'height': 844}); pg = ctx.new_page(); errs = []
            pg.on('pageerror', lambda e: errs.append(str(e)))
            pg.route('**/*', lambda r: r.continue_() if r.request.url.startswith('http://127.0.0.1:8791') else r.abort())
            pg.goto('http://127.0.0.1:8791/index.html'); pg.wait_for_timeout(3000)
            check(not errs, 'browser: no uncaught JavaScript errors' + (f' {errs}' if errs else ''))
            check(pg.locator('#matrix tbody tr').count() == 4, 'browser: price table has 4 rows')
            check(not pg.evaluate('document.documentElement.scrollWidth>innerWidth'), 'browser: no horizontal overflow at 390px')
            pg.wait_for_timeout(1500); ctx.set_offline(True); pg2 = ctx.new_page(); pg2.goto('http://127.0.0.1:8791/index.html'); pg2.wait_for_timeout(1500)
            check('Dubai Fuel' in pg2.title(), 'browser: app loads offline from the service worker cache')
            b.close()
        srv.shutdown()
    except Exception as e:
        check(False, f'browser smoke test could not run: {e}')

print('\nAll checks passed.' if not fails else f'\n{len(fails)} check(s) FAILED.')
sys.exit(1 if fails else 0)
