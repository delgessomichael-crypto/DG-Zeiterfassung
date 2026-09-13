import pathlib,subprocess,hashlib,json,os
from bs4 import BeautifulSoup
R=pathlib.Path(__file__).resolve().parent;O=R/'release'
subprocess.check_call(['python',str(R/'build_frontend_34.py')],env={**os.environ,'DG_BUILD_ROOT':str(R)})
js=(O/'app-3.4.js').read_text();feat=(R/'src/features_3_5.js').read_text();css=(O/'app-3.4.css').read_text()+'\n'+(R/'src/features_3_5.css').read_text()
js=js.replace("version:'3.4'","version:'3.5'",1).replace("DG_APP_VERSION='3.4'","DG_APP_VERSION='3.5'",1).replace("clientVersion:'3.4'","clientVersion:'3.5'",1).replace('App 3.4','App 3.5')
js=js.replace("parts[0]===3&&parts[1]>=3","parts[0]===3&&parts[1]>=4").replace('App 3.4 benötigt Google-GS Backend 3.3 oder neuer.','App 3.5 benötigt Google-GS Backend 3.4 oder neuer.')
marker='function d3Startup()'
if marker not in js: raise SystemExit('startup marker missing')
js=js.replace(marker,feat+'\n\n'+marker,1)
(O/'app-3.5.js').write_text(js);(O/'app-3.5.css').write_text(css)
html=BeautifulSoup((O/'index.html').read_text(),'html.parser');html.title.string='DG Zeiterfassung 3.5'
login=html.select_one('.login-card .center.muted.small');hero=html.select_one('.hero .head-row strong')
if login:login.string='Version 3.5'
if hero:hero.string='Zeiterfassung - 3.5'
for e in html.select('script[src],link[rel=stylesheet]'):e.decompose()
jh=hashlib.sha256(js.encode()).hexdigest()[:12];ch=hashlib.sha256(css.encode()).hexdigest()[:12]
html.head.append(html.new_tag('link',rel='stylesheet',href='./app-3.5.css?v='+ch));sc=html.new_tag('script',src='./app-3.5.js?v='+jh);sc['defer']='';html.body.append(sc);(O/'index.html').write_text(str(html))
m=json.loads((O/'manifest.json').read_text());m['name']='DG Zeiterfassung 3.5';(O/'manifest.json').write_text(json.dumps(m,ensure_ascii=False,indent=2))
assets=['./','./index.html','./app-3.5.js?v='+jh,'./app-3.5.css?v='+ch,'./manifest.json','./dg_icon_192.png','./dg_icon_512.png']
sw="""// DG 3.5: one app asset, no dynamic legacy injection.\nconst CACHE_NAME='dg-zeiterfassung-3-5-%s',APP_SHELL=%s;\nself.addEventListener('install',event=>event.waitUntil((async()=>{const c=await caches.open(CACHE_NAME);await c.addAll(APP_SHELL);await self.skipWaiting();})()));\nself.addEventListener('activate',event=>event.waitUntil((async()=>{await Promise.all((await caches.keys()).filter(k=>k.startsWith('dg-zeiterfassung-')&&k!==CACHE_NAME).map(k=>caches.delete(k)));await self.clients.claim();})()));\nself.addEventListener('fetch',event=>{const u=new URL(event.request.url),base=new URL('./',self.location.href);if(event.request.method!=='GET'||u.origin!==base.origin||!u.pathname.startsWith(base.pathname))return;if(event.request.mode==='navigate'){event.respondWith((async()=>{try{const r=await fetch(event.request,{cache:'no-store'});if(!r.ok)throw new Error('HTTP '+r.status);return r;}catch(e){return (await (await caches.open(CACHE_NAME)).match(new URL('./index.html',base).href))||Response.error();}})());return;}if(!APP_SHELL.some(p=>new URL(p,base).href===u.href))return;event.respondWith((async()=>{const c=await caches.open(CACHE_NAME),hit=await c.match(event.request);if(hit)return hit;const r=await fetch(event.request);if(r.ok)await c.put(event.request,r.clone());return r;})());});\n"""%(jh,json.dumps(assets,ensure_ascii=False));(O/'sw.js').write_text(sw)
print('DG 3.5 build',jh,ch)
