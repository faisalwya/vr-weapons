"""Load a version in headless Chrome, let its self-playing demo run, and report what happened.

    python3 tests/page_check.py v01 60        # version folder, seconds to watch

Serves the repo itself, so no other server is needed. Exits with 1 if the page threw errors.
Needs: pip install playwright, and a Chrome or Chromium (set CHROME=/path/to/chrome if not found).
Headless Chrome renders in software at a low frame rate, so the demo runs slower than real time.
"""
import asyncio, functools, http.server, json, os, shutil, sys, threading
from playwright.async_api import async_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
VER = sys.argv[1] if len(sys.argv) > 1 else 'v01'
SECS = int(sys.argv[2]) if len(sys.argv) > 2 else 60
CHROME = os.environ.get('CHROME') or shutil.which('google-chrome') or shutil.which('chromium') or shutil.which('chromium-browser')


def serve():
    handler = functools.partial(http.server.SimpleHTTPRequestHandler, directory=ROOT)
    handler.log_message = lambda *a: None
    srv = http.server.ThreadingHTTPServer(('127.0.0.1', 0), handler)
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    return srv.server_address[1]


async def main():
    port = serve()
    async with async_playwright() as p:
        args = ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist']
        b = await p.chromium.launch(executable_path=CHROME, args=args) if CHROME else await p.chromium.launch(args=args)
        pg = await b.new_page(viewport={'width': 640, 'height': 360})
        errors = []
        pg.on('pageerror', lambda e: errors.append(str(e)))
        pg.on('console', lambda m: errors.append(m.text) if m.type == 'error' and 'fonts.g' not in m.text else None)
        await pg.add_init_script('window.__log = []')
        await pg.goto(f'http://127.0.0.1:{port}/{VER}/', wait_until='load')
        await pg.wait_for_timeout(SECS * 1000)
        report = await pg.evaluate("""() => {
          const g = window.__game || {}, w = g.world || {};
          return { log: (window.__log || []).filter(l => !/^(sizzle|candle|fuse )/.test(l)).slice(0, 80),
                   status: w.status ? w.status() : null, practice: w.practice ? w.practice.log : null };
        }""")
        await b.close()
    print(f'{VER}: watched {SECS}s')
    if report['status']: print('status', json.dumps(report['status']))
    if report['practice']: print('practice', json.dumps(report['practice']))
    print('\n'.join(report['log']))
    print('errors', errors or 'none')
    sys.exit(1 if errors else 0)

asyncio.run(main())
