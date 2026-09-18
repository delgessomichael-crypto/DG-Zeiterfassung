/* DG Zeiterfassung - retirement service worker.
   Clears legacy DG caches, takes no fetch control and unregisters itself. */
self.addEventListener('install',event=>{event.waitUntil(self.skipWaiting());});
self.addEventListener('activate',event=>{
  event.waitUntil((async()=>{
    try{
      const keys=await caches.keys();
      await Promise.all(keys.filter(k=>k.startsWith('dg-zeiterfassung-')).map(k=>caches.delete(k)));
    }catch(_e){}
    try{await self.registration.unregister();}catch(_e){}
  })());
});
