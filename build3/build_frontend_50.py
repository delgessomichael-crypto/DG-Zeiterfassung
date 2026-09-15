import pathlib,hashlib,json
from bs4 import BeautifulSoup
R=pathlib.Path(__file__).resolve().parent;O=R/'release';ROOT=R.parent;O.mkdir(exist_ok=True)
base_js=ROOT/'app-3.5.js';base_css=ROOT/'app-3.5.css';base_html=ROOT/'index.html';base_manifest=ROOT/'manifest.json';payroll_js=ROOT/'app-5.2.0-payroll.js';fix_js=ROOT/'app-5.2.1-fixes.js';review_js=ROOT/'app-5.2.2-review.js'
for p in [base_js,base_css,base_html,base_manifest,payroll_js,fix_js,review_js]:
    if not p.exists(): raise SystemExit('stable base missing: '+str(p))
features=['features_5_0.js','features_5_0_1.js','features_5_0_2.js','features_5_0_3.js','features_5_0_4.js','features_5_0_5.js','features_5_1.js','features_5_1_1.js','features_5_1_2.js']
js=base_js.read_text();css=base_css.read_text();feat='\n'.join((R/'src'/name).read_text() for name in features)+'\n'+payroll_js.read_text()+'\n'+fix_js.read_text()+'\n'+review_js.read_text();feat_css=(R/'src/features_5_0.css').read_text()+'\n'+(R/'src/features_5_0_1.css').read_text()
startup="if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',d3Startup,{once:true});else d3Startup();"
if startup not in js: raise SystemExit('startup marker missing')
js=js.replace(startup,feat+'\n'+startup,1)
versions=['3.9','5.0','5.0.1','5.0.2','5.0.3','5.0.4','5.0.5','5.1','5.1.0','5.1.1','5.1.2','5.2.0','5.2.1','5.2.2','5.2.3','5.2.4']
for old in versions: js=js.replace("version:'"+old+"'","version:'5.2.4'")
for old in versions: js=js.replace("DG_APP_VERSION='"+old+"'","DG_APP_VERSION='5.2.4'")
for old in versions: js=js.replace("clientVersion:'"+old+"'","clientVersion:'5.2.4'")
for old in ['App 3.9','App 5.0.1','App 5.0.2','App 5.0.3','App 5.0.4','App 5.0.5','App 5.1','App 5.1.1','App 5.1.2','App 5.2.0','App 5.2.1','App 5.2.2','App 5.2.3']: js=js.replace(old,'App 5.2.4')
for old in ['Google-GS 3.0','Google-GS 5.0.1','Google-GS 5.0.2','Google-GS 5.1','Google-GS 5.1.1','Google-GS 5.1.2','Google-GS 5.2.0']: js=js.replace(old,'Google-GS 5.2.0.2')
for old in ['Backend 3.0','Backend 5.0.2','Backend 5.1','Backend 5.1.1','Backend 5.1.2','Backend 5.2.0']: js=js.replace(old,'Backend 5.2.0.2')
js=js.replace('/^3\\./','/^(?:3\\.|5\\.)/')
css=css+'\n'+feat_css+'\n'
(O/'app-5.0.js').write_text(js);(O/'app-5.0.css').write_text(css)
html=BeautifulSoup(base_html.read_text(),'html.parser');html.title.string='DG Zeiterfassung 5.2.4';login=html.select_one('.login-card .center.muted.small');hero=html.select_one('.hero .head-row strong')
if login: login.string='Version 5.2.4'
if hero: hero.string='Zeiterfassung - 5.2.4'
for e in html.select('script[src],link[rel=stylesheet]'): e.decompose()
jh=hashlib.sha256(js.encode()).hexdigest()[:12];ch=hashlib.sha256(css.encode()).hexdigest()[:12]
html.head.append(html.new_tag('link',rel='stylesheet',href='./app-5.0.css?v='+ch));sc=html.new_tag('script',src='./app-5.0.js?v='+jh);sc['defer']='';html.body.append(sc);(O/'index.html').write_text(str(html))
m=json.loads(base_manifest.read_text());m['name']='DG Zeiterfassung 5.2.4';m['short_name']='DG 5.2.4';(O/'manifest.json').write_text(json.dumps(m,ensure_ascii=False,indent=2))
assets=['./','./index.html','./app-5.0.js?v='+jh,'./app-5.0.css?v='+ch,'./manifest.json','./dg_icon_192.png','./dg_icon_512.png']
sw="""const CACHE_NAME='dg-zeiterfassung-5-2-4-%s',APP_SHELL=%s;self.addEventListener('install',e=>e.waitUntil((async()=>{const c=await caches.open(CACHE_NAME);await c.addAll(APP_SHELL);await self.skipWaiting()})()));self.addEventListener('activate',e=>e.waitUntil((async()=>{await Promise.all((await caches.keys()).filter(k=>k.startsWith('dg-zeiterfassung-')&&k!==CACHE_NAME).map(k=>caches.delete(k)));await self.clients.claim()})()));self.addEventListener('fetch',e=>{const u=new URL(e.request.url),base=new URL('./',self.location.href);if(e.request.method!=='GET'||u.origin!==base.origin||!u.pathname.startsWith(base.pathname))return;if(e.request.mode==='navigate'){e.respondWith((async()=>{try{return await fetch(e.request,{cache:'no-store'})}catch(_){return(await(await caches.open(CACHE_NAME)).match(new URL('./index.html',base).href))||Response.error()}})());return;}if(!APP_SHELL.some(p=>new URL(p,base).href===u.href))return;e.respondWith((async()=>{const c=await caches.open(CACHE_NAME),hit=await c.match(e.request);if(hit)return hit;const r=await fetch(e.request);if(r.ok)await c.put(e.request,r.clone());return r})())});"""%(jh,json.dumps(assets,ensure_ascii=False));(O/'sw.js').write_text(sw)
print('DG 5.2.4 build',jh,ch)
