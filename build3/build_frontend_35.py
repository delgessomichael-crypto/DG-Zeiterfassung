import pathlib,subprocess,hashlib,json,os,shutil
from bs4 import BeautifulSoup
R=pathlib.Path(__file__).resolve().parent
O=R/'release'
ROOT=R.parent
O.mkdir(exist_ok=True)
def nodes(p):return json.loads(subprocess.check_output(['node',str(R/'ast.cjs'),str(p)]))
# Build 3.5.1 directly from the already generated/stable 3.4 frontend.
# Do not rebuild the retired 3.1 legacy chain again.
base=ROOT/'app-3.4.js'
base_css=ROOT/'app-3.4.css'
base_html=ROOT/'index.html'
base_manifest=ROOT/'manifest.json'
for p in [base,base_css,base_html,base_manifest]:
    if not p.exists(): raise SystemExit('stable 3.4 base missing: '+str(p))
feat_path=R/'src/features_3_5.js'
js=base.read_text()
css=base_css.read_text()+'\n'+(R/'src/features_3_5.css').read_text()
feat_nodes=nodes(feat_path)
replace_names={'updatePhotoStatus','startCamera','captureCameraPhoto','addPhotos','refreshWeek','d3Dashboard'}
replacement={n['name']:n['source'] for n in feat_nodes if n.get('name') in replace_names}
base_nodes=nodes(base)
for n in base_nodes:
    name=n.get('name')
    if name in replacement:
        if n['source'] not in js: raise SystemExit('replacement source missing for '+name)
        js=js.replace(n['source'],replacement[name],1)
# Append only genuinely new 3.5.1 logic before startup.
new_parts=[n['source'] for n in feat_nodes if n.get('name') not in replace_names]
js=js.replace("version:'3.4'","version:'3.5.1'",1)
js=js.replace("DG_APP_VERSION='3.4'","DG_APP_VERSION='3.5.1'",1)
js=js.replace("clientVersion:'3.4'","clientVersion:'3.5.1'",1)
js=js.replace('App 3.4','App 3.5.1')
js=js.replace("parts[0]===3&&parts[1]>=3","parts[0]===3&&parts[1]>=4")
js=js.replace('App 3.4 benötigt Google-GS Backend 3.3 oder neuer.','App 3.5.1 benötigt Google-GS Backend 3.4 oder neuer.')
marker='function d3Startup()'
if marker not in js: raise SystemExit('startup marker missing')
js=js.replace(marker,'\n'.join(new_parts)+'\n\n'+marker,1)
(O/'app-3.5.js').write_text(js)
(O/'app-3.5.css').write_text(css)
html=BeautifulSoup(base_html.read_text(),'html.parser')
html.title.string='DG Zeiterfassung 3.5.1'
login=html.select_one('.login-card .center.muted.small')
hero=html.select_one('.hero .head-row strong')
if login:login.string='Version 3.5.1'
if hero:hero.string='Zeiterfassung - 3.5.1'
for e in html.select('script[src],link[rel=stylesheet]'):e.decompose()
jh=hashlib.sha256(js.encode()).hexdigest()[:12]
ch=hashlib.sha256(css.encode()).hexdigest()[:12]
html.head.append(html.new_tag('link',rel='stylesheet',href='./app-3.5.css?v='+ch))
sc=html.new_tag('script',src='./app-3.5.js?v='+jh);sc['defer']='';html.body.append(sc)
(O/'index.html').write_text(str(html))
m=json.loads(base_manifest.read_text());m['name']='DG Zeiterfassung 3.5.1';(O/'manifest.json').write_text(json.dumps(m,ensure_ascii=False,indent=2))
assets=['./','./index.html','./app-3.5.js?v='+jh,'./app-3.5.css?v='+ch,'./manifest.json','./dg_icon_192.png','./dg_icon_512.png']
sw="""// DG 3.5.1: one app asset, no dynamic legacy injection.\nconst CACHE_NAME='dg-zeiterfassung-3-5-1-%s',APP_SHELL=%s;\nself.addEventListener('install',event=>event.waitUntil((async()=>{const c=await caches.open(CACHE_NAME);await c.addAll(APP_SHELL);await self.skipWaiting();})()));\nself.addEventListener('activate',event=>event.waitUntil((async()=>{await Promise.all((await caches.keys()).filter(k=>k.startsWith('dg-zeiterfassung-')&&k!==CACHE_NAME).map(k=>caches.delete(k)));await self.clients.claim();})()));\nself.addEventListener('fetch',event=>{const u=new URL(event.request.url),base=new URL('./',self.location.href);if(event.request.method!=='GET'||u.origin!==base.origin||!u.pathname.startsWith(base.pathname))return;if(event.request.mode==='navigate'){event.respondWith((async()=>{try{const r=await fetch(event.request,{cache:'no-store'});if(!r.ok)throw new Error('HTTP '+r.status);return r;}catch(e){return (await (await caches.open(CACHE_NAME)).match(new URL('./index.html',base).href))||Response.error();}})());return;}if(!APP_SHELL.some(p=>new URL(p,base).href===u.href))return;event.respondWith((async()=>{const c=await caches.open(CACHE_NAME),hit=await c.match(event.request);if(hit)return hit;const r=await fetch(event.request);if(r.ok)await c.put(event.request,r.clone());return r;})());});\n"""%(jh,json.dumps(assets,ensure_ascii=False))
(O/'sw.js').write_text(sw)
print('DG 3.5.1 build',jh,ch)
