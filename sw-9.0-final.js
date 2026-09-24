/* DG Zeiterfassung 10.0 - Railway migration cache */
const CACHE='dg-zeiterfassung-10.0-absence-direct-20260924-0650';
const STATIC=[
  './index.html',
  './app-5.0.css?v=20260918-800-prod1',
  './core-9.0-final.js?v=20260924-0650-absence-direct-render',
  './customerflow-9.0-final.js?v=20260920-900-final1',
  './payroll-9.0-final.js?v=20260923-2240-v10-final',
  './ui-9.0-final.js?v=20260923-1620-v10-title-final',
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
  const req=event.request;if(req.method!=='GET')return;
  const url=new URL(req.url);if(url.origin!==self.location.origin)return;
  const nav=req.mode==='navigate'||url.pathname.endsWith('.html')||url.pathname.endsWith('/DG-Zeiterfassung/');
  if(nav){
    event.respondWith((async()=>{try{return await fetch(req,{cache:'no-store'});}catch(_e){return (await caches.match('./index.html'))||Response.error();}})());
    return;
  }
  event.respondWith((async()=>{
    const cached=await caches.match(req);if(cached)return cached;
    try{const fresh=await fetch(req);if(fresh&&fresh.ok){const c=await caches.open(CACHE);c.put(req,fresh.clone()).catch(()=>{});}return fresh;}
    catch(_e){return Response.error();}
  })());
});
