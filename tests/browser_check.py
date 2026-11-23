from playwright.sync_api import sync_playwright
from pathlib import Path
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from threading import Thread
from functools import partial
root=Path('/mnt/data/token_radar_candidate')
server=ThreadingHTTPServer(('127.0.0.1', 8799), partial(SimpleHTTPRequestHandler, directory=str(root/'out/dashboard')))
Thread(target=server.serve_forever, daemon=True).start()
url='http://127.0.0.1:8799/'
with sync_playwright() as p:
 browser=p.chromium.launch(headless=True,executable_path='/usr/bin/chromium',args=['--no-sandbox','--disable-dev-shm-usage'])
 page=browser.new_page(viewport={'width':1500,'height':1020}, device_scale_factor=1)
 errors=[]
 page.on('pageerror',lambda e:errors.append(str(e)))
 html=(root/'dashboard/index.html').read_text()
 html=html.replace('<link rel="stylesheet" href="style.css">','').replace('<script src="data.js"></script><script src="app.js"></script>','')
 page.set_content(html)
 page.add_style_tag(content=(root/'dashboard/style.css').read_text())
 page.add_script_tag(content=(root/'out/dashboard/data.js').read_text())
 page.add_script_tag(content=(root/'dashboard/app.js').read_text())
 page.wait_for_timeout(450)
 print('TOTAL',page.locator('#n-total').inner_text(),'ROWS',page.locator('#rows tr[data-slug]').count(),'ERRORS',errors)
 page.screenshot(path=str(root/'screenshots/01-board.png'))
 page.locator('#rows tr[data-slug]').first.click()
 page.wait_for_timeout(350)
 print('DETAIL',page.locator('#detail').get_attribute('class'),'STEPS',page.locator('.steps li').count())
 page.screenshot(path=str(root/'screenshots/02-detail.png'))
 page.locator('#close').click()
 page.locator('#search').fill('solana')
 page.wait_for_timeout(200)
 print('FILTERED',page.locator('#rows tr[data-slug]').count(),'COUNT',page.locator('#count').inner_text())
 page.screenshot(path=str(root/'screenshots/03-filtered.png'))
 assert page.locator('#n-total').inner_text()=='163'
 assert page.locator('#count').inner_text()!='0'
 print("FINAL_BROWSER_ERRORS",errors)
 assert not errors
 browser.close()
server.shutdown()
