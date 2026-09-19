/* DG Zeiterfassung 8.0 production service worker */
const CACHE='dg-zeiterfassung-8.0-prod-20260919-16';
const STATIC=[
  './app-5.0.css?v=20260918-800-prod1',
  './app-8.0.js?v=20260919-800-ui16',
  './app-8.0-customerflow.js?v=20260919-customerflow2',
  './payroll-hotfix-8.0.js?v=20260919-800-ui8',
  './ui-hotfix-8.0.js?v=20260919-800-ui16',
  './dg_icon_192.png',
  './dg_icon_512.png',
  './manifest.json'
];
self.addEventListener('install',event=>{
  event.waitUntil((async()=>{
    const c=await caches.open(CACHE);
    await Promise.all(STATIC.map(async u=>{try{await c.add(u);}catch(_e){}}));
    await self.skipWaiting();
  })());
});
self.addEventListener('activate',event=>{
  event.waitUntil((async()=>{
    const keys=await caches.keys();
    await Promise.all(keys.filter(k=>k.startsWith('dg-zeiterfassung-')&&k!==CACHE).map(k=>caches.delete(k)));
    await self.clients.claim();
  })());
});
self.addEventListener('fetch',event=>{
  const req=event.request;
  if(req.method!=='GET')return;
  const url=new URL(req.url);
  if(url.origin!==self.location.origin)return;

  const isHtml=req.mode==='navigate'||url.pathname.endsWith('.html')||url.pathname.endsWith('/DG-Zeiterfassung/');
  if(isHtml){
    event.respondWith((async()=>{
      try{
        const fresh=await fetch(req,{cache:'no-store'});
        return fresh;
      }catch(_e){
        const cached=await caches.match('./version8.html');
        return cached||Response.error();
      }
    })());
    return;
  }

  event.respondWith((async()=>{
    const cached=await caches.match(req);
    if(cached)return cached;
    try{
      const fresh=await fetch(req);
      if(fresh&&fresh.ok){
        const c=await caches.open(CACHE);
        c.put(req,fresh.clone()).catch(()=>{});
      }
      return fresh;
    }catch(_e){
      return Response.error();
    }
  })());
});
