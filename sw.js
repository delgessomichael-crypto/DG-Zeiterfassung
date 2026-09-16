const CACHE_NAME='dg-zeiterfassung-5-2-6-offers-20260916b';
const PATCH_SRC='./app-5.2.6-offers.js?v=20260916b';
const APP_SHELL=["./","./index.html","./app-5.0.js?v=e3c82c090f11","./app-5.0.css?v=799b73f6d5b0","./manifest.json","./dg_icon_192.png","./dg_icon_512.png",PATCH_SRC];

async function dg526PatchedHtml(response){
  if(!response)return response;
  const text=await response.text();
  if(text.includes('app-5.2.6-offers.js'))return new Response(text,{status:response.status,statusText:response.statusText,headers:response.headers});
  const tag='<script defer src="'+PATCH_SRC+'"></script>';
  const html=text.includes('</body>')?text.replace('</body>',tag+'</body>'):text+tag;
  const headers=new Headers(response.headers);headers.set('content-type','text/html; charset=utf-8');headers.delete('content-length');
  return new Response(html,{status:response.status,statusText:response.statusText,headers});
}

self.addEventListener('install',e=>e.waitUntil((async()=>{
  const c=await caches.open(CACHE_NAME);
  await c.addAll(APP_SHELL);
  await self.skipWaiting();
})()));

self.addEventListener('activate',e=>e.waitUntil((async()=>{
  await Promise.all((await caches.keys()).filter(k=>k.startsWith('dg-zeiterfassung-')&&k!==CACHE_NAME).map(k=>caches.delete(k)));
  await self.clients.claim();
})()));

self.addEventListener('fetch',e=>{
  const u=new URL(e.request.url),base=new URL('./',self.location.href);
  if(e.request.method!=='GET'||u.origin!==base.origin||!u.pathname.startsWith(base.pathname))return;
  if(e.request.mode==='navigate'){
    e.respondWith((async()=>{
      try{return await dg526PatchedHtml(await fetch(e.request,{cache:'no-store'}));}
      catch(_){const c=await caches.open(CACHE_NAME),hit=await c.match(new URL('./index.html',base).href)||await c.match(new URL('./',base).href);return hit?await dg526PatchedHtml(hit):Response.error();}
    })());return;
  }
  if(!APP_SHELL.some(p=>new URL(p,base).href===u.href))return;
  e.respondWith((async()=>{const c=await caches.open(CACHE_NAME),hit=await c.match(e.request);if(hit)return hit;const r=await fetch(e.request,{cache:'no-store'});if(r.ok)await c.put(e.request,r.clone());return r})());
});
