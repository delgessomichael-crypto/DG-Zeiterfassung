import pathlib,subprocess,hashlib,json
from bs4 import BeautifulSoup
R=pathlib.Path(__file__).resolve().parent;O=R/'release';ROOT=R.parent;O.mkdir(exist_ok=True)
def nodes(p):return json.loads(subprocess.check_output(['node',str(R/'ast.cjs'),str(p)]))
base=ROOT/'app-3.5.js';base_css=ROOT/'app-3.5.css';base_html=ROOT/'index.html';base_manifest=ROOT/'manifest.json'
for p in [base,base_css,base_html,base_manifest]:
    if not p.exists(): raise SystemExit('stable 3.5.1 base missing: '+str(p))
feat_path=R/'src/features_3_5.js';js=base.read_text();css=base_css.read_text();feat_nodes=nodes(feat_path)
replace_names={'updatePhotoStatus','startCamera','captureCameraPhoto','addPhotos','refreshWeek','d3Dashboard','loadOffers','d35MandatoryDayClosure','d35InstallInspectionButton','d35SelectedCalendarEvent','d35InspectionVisit','openMain','showEmployee','d34AqonInquiries'}
replacement={n['name']:n['source'] for n in feat_nodes if n.get('name') in replace_names}
for n in nodes(base):
    name=n.get('name')
    if name in replacement:
        if n['source'] not in js: raise SystemExit('replacement source missing for '+name)
        js=js.replace(n['source'],replacement[name],1)
js=js.replace("version:'3.5.1'","version:'3.5.2'",1).replace("DG_APP_VERSION='3.5.1'","DG_APP_VERSION='3.5.2'",1).replace("clientVersion:'3.5.1'","clientVersion:'3.5.2'",1).replace('App 3.5.1','App 3.5.2')
(O/'app-3.5.js').write_text(js);(O/'app-3.5.css').write_text(css)
html=BeautifulSoup(base_html.read_text(),'html.parser');html.title.string='DG Zeiterfassung 3.5.2';login=html.select_one('.login-card .center.muted.small');hero=html.select_one('.hero .head-row strong')
if login:login.string='Version 3.5.2'
if hero:hero.string='Zeiterfassung - 3.5.2'
for e in html.select('script[src],link[rel=stylesheet]'):e.decompose()
jh=hashlib.sha256(js.encode()).hexdigest()[:12];ch=hashlib.sha256(css.encode()).hexdigest()[:12]
html.head.append(html.new_tag('link',rel='stylesheet',href='./app-3.5.css?v='+ch));sc=html.new_tag('script',src='./app-3.5.js?v='+jh);sc['defer']='';html.body.append(sc);(O/'index.html').write_text(str(html))
m=json.loads(base_manifest.read_text());m['name']='DG Zeiterfassung 3.5.2';(O/'manifest.json').write_text(json.dumps(m,ensure_ascii=False,indent=2))
assets=['./','./index.html','./app-3.5.js?v='+jh,'./app-3.5.css?v='+ch,'./manifest.json','./dg_icon_192.png','./dg_icon_512.png']
sw="""const CACHE_NAME='dg-zeiterfassung-3-5-2-%s',APP_SHELL=%s;self.addEventListener('install',e=>e.waitUntil((async()=>{const c=await caches.open(CACHE_NAME);await c.addAll(APP_SHELL);await self.skipWaiting()})()));self.addEventListener('activate',e=>e.waitUntil((async()=>{await Promise.all((await caches.keys()).filter(k=>k.startsWith('dg-zeiterfassung-')&&k!==CACHE_NAME).map(k=>caches.delete(k)));await self.clients.claim()})()));self.addEventListener('fetch',e=>{const u=new URL(e.request.url),base=new URL('./',self.location.href);if(e.request.method!=='GET'||u.origin!==base.origin||!u.pathname.startsWith(base.pathname))return;if(e.request.mode==='navigate'){e.respondWith((async()=>{try{return await fetch(e.request,{cache:'no-store'})}catch(_){return(await(await caches.open(CACHE_NAME)).match(new URL('./index.html',base).href))||Response.error()}})());return;}if(!APP_SHELL.some(p=>new URL(p,base).href===u.href))return;e.respondWith((async()=>{const c=await caches.open(CACHE_NAME),hit=await c.match(e.request);if(hit)return hit;const r=await fetch(e.request);if(r.ok)await c.put(e.request,r.clone());return r})())});"""%(jh,json.dumps(assets,ensure_ascii=False));(O/'sw.js').write_text(sw)
print('DG 3.5.2 build',jh,ch)