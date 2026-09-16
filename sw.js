const CACHE_NAME='dg-zeiterfassung-6-0-20260916b';
const APP60='./app-6.0-runtime.js?v=20260916b';
const APP_SHELL=["./","./index.html","./app-5.0.js?v=e3c82c090f11","./app-5.0.css?v=799b73f6d5b0","./manifest.json","./dg_icon_192.png","./dg_icon_512.png",APP60];

async function dg60PatchedHtml(response){
  if(!response)return response;
  const text=await response.text();
  let html=text
    .replace(/DG Zeiterfassung 5\.2\.5/g,'DG Zeiterfassung 6.0')
    .replace(/Version 5\.2\.5/g,'Version 6.0')
    .replace(/Zeiterfassung - 5\.2\.5/g,'Zeiterfassung - 6.0');
  html=html
    .replace(/<script[^>]+app-5\.2\.6-offers\.js[^>]*><\/script>/g,'')
    .replace(/<script[^>]+app-5\.2\.7-regie\.js[^>]*><\/script>/g,'')
    .replace(/<script[^>]+app-5\.2\.8-office\.js[^>]*><\/script>/g,'')
    .replace(/<script[^>]+app-5\.2\.9-office\.js[^>]*><\/script>/g,'')
    .replace(/<script[^>]+app-5\.3\.0-office-state\.js[^>]*><\/script>/g,'')
    .replace(/<script[^>]+app-6\.0\.js[^>]*><\/script>/g,'');
  if(!html.includes('app-6.0-runtime.js'))html=html.replace('</body>','<script defer src="'+APP60+'"></script></body>');
  const headers=new Headers(response.headers);headers.set('content-type','text/html; charset=utf-8');headers.delete('content-length');
  return new Response(html,{status:response.status,statusText:response.statusText,headers});
}

self.addEventListener('install',e=>e.waitUntil((async()=>{const c=await caches.open(CACHE_NAME);await c.addAll(APP_SHELL);await self.skipWaiting()})()));
self.addEventListener('activate',e=>e.waitUntil((async()=>{await Promise.all((await caches.keys()).filter(k=>k.startsWith('dg-zeiterfassung-')&&k!==CACHE_NAME).map(k=>caches.delete(k)));await self.clients.claim()})()));
self.addEventListener('fetch',e=>{const u=new URL(e.request.url),base=new URL('./',self.location.href);if(e.request.method!=='GET'||u.origin!==base.origin||!u.pathname.startsWith(base.pathname))return;
if(e.request.mode==='navigate'){e.respondWith((async()=>{try{return await dg60PatchedHtml(await fetch(e.request,{cache:'no-store'}));}catch(_){const c=await caches.open(CACHE_NAME),hit=await c.match(new URL('./index.html',base).href)||await c.match(new URL('./',base).href);return hit?await dg60PatchedHtml(hit):Response.error()}})());return;}
if(!APP_SHELL.some(p=>new URL(p,base).href===u.href))return;e.respondWith((async()=>{const c=await caches.open(CACHE_NAME),hit=await c.match(e.request);if(hit)return hit;const r=await fetch(e.request,{cache:'no-store'});if(r.ok)await c.put(e.request,r.clone());return r})())});
