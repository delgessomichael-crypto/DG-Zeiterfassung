import pathlib,hashlib,json
from bs4 import BeautifulSoup
R=pathlib.Path(__file__).resolve().parent;O=R/'release';ROOT=R.parent;O.mkdir(exist_ok=True)
base_js=ROOT/'app-3.5.js';base_css=ROOT/'app-3.5.css';base_html=ROOT/'index.html';base_manifest=ROOT/'manifest.json'
for p in [base_js,base_css,base_html,base_manifest]:
    if not p.exists(): raise SystemExit('stable 3.7.1 base missing: '+str(p))
js=base_js.read_text();css=base_css.read_text();feat=''.join((R/'src'/f'features_3_7_{i}.js').read_text() for i in (1,2,3,4));feat_css=(R/'src/features_3_7.css').read_text()
startup="if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',d3Startup,{once:true});else d3Startup();"
if startup not in js: raise SystemExit('startup marker missing')
js=js.replace(startup,feat+'\n'+startup,1)
js=js.replace("version:'3.7.1'","version:'3.7.2'",1).replace("DG_APP_VERSION='3.7.1'","DG_APP_VERSION='3.7.2'",1).replace("clientVersion:'3.7.1'","clientVersion:'3.7.2'",1).replace('App 3.7.1','App 3.7.2')
css=css+'\n'+feat_css+'\n'
(O/'app-3.5.js').write_text(js);(O/'app-3.5.css').write_text(css)
html=BeautifulSoup(base_html.read_text(),'html.parser');html.title.string='DG Zeiterfassung 3.7.2';login=html.select_one('.login-card .center.muted.small');hero=html.select_one('.hero .head-row strong')
if login:login.string='Version 3.7.2'
if hero:hero.string='Zeiterfassung - 3.7.2'
for e in html.select('script[src],link[rel=stylesheet]'):e.decompose()
jh=hashlib.sha256(js.encode()).hexdigest()[:12];ch=hashlib.sha256(css.encode()).hexdigest()[:12]
html.head.append(html.new_tag('link',rel='stylesheet',href='./app-3.5.css?v='+ch));sc=html.new_tag('script',src='./app-3.5.js?v='+jh);sc['defer']='';html.body.append(sc);(O/'index.html').write_text(str(html))
m=json.loads(base_manifest.read_text());m['name']='DG Zeiterfassung 3.7.2';(O/'manifest.json').write_text(json.dumps(m,ensure_ascii=False,indent=2))
assets=['./','./index.html','./app-3.5.js?v='+jh,'./app-3.5.css?v='+ch,'./manifest.json','./dg_icon_192.png','./dg_icon_512.png']
sw="""const CACHE_NAME='dg-zeiterfassung-3-7-2-%s',APP_SHELL=%s;self.addEventListener('install',e=>e.waitUntil((async()=>{const c=await caches.open(CACHE_NAME);await c.addAll(APP_SHELL);await self.skipWaiting()})()));self.addEventListener('activate',e=>e.waitUntil((async()=>{await Promise.all((await caches.keys()).filter(k=>k.startsWith('dg-zeiterfassung-')&&k!==CACHE_NAME).map(k=>caches.delete(k)));await self.clients.claim()})()));self.addEventListener('fetch',e=>{const u=new URL(e.request.url),base=new URL('./',self.location.href);if(e.request.method!=='GET'||u.origin!==base.origin||!u.pathname.startsWith(base.pathname))return;if(e.request.mode==='navigate'){e.respondWith((async()=>{try{return await fetch(e.request,{cache:'no-store'})}catch(_){return(await(await caches.open(CACHE_NAME)).match(new URL('./index.html',base).href))||Response.error()}})());return;}if(!APP_SHELL.some(p=>new URL(p,base).href===u.href))return;e.respondWith((async()=>{const c=await caches.open(CACHE_NAME),hit=await c.match(e.request);if(hit)return hit;const r=await fetch(e.request);if(r.ok)await c.put(e.request,r.clone());return r})())});"""%(jh,json.dumps(assets,ensure_ascii=False));(O/'sw.js').write_text(sw)
print('DG 3.7.2 build',jh,ch)
