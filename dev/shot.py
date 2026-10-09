import os
import sys, subprocess, time
from playwright.sync_api import sync_playwright
url, out = sys.argv[1], sys.argv[2]
w = int(sys.argv[3]) if len(sys.argv) > 3 else 900
h = int(sys.argv[4]) if len(sys.argv) > 4 else 900
srv = subprocess.Popen([sys.executable, '-m', 'http.server', '8766', '--bind', '127.0.0.1'], cwd=os.path.dirname(os.path.dirname(os.path.abspath(__file__))), stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(0.7)
try:
    with sync_playwright() as p:
        b = p.chromium.launch()
        pg = b.new_page(viewport={'width': w, 'height': h})
        errs = []
        pg.on('pageerror', lambda e: errs.append(str(e)))
        pg.on('console', lambda m: errs.append(m.text) if m.type == 'error' else None)
        pg.goto('http://127.0.0.1:8766/' + url)
        pg.wait_for_function('document.title === "done"', timeout=60000)
        pg.locator('canvas').first.screenshot(path=out)
        print('errors:', errs[:5])
        b.close()
finally:
    srv.terminate()
