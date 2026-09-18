/* DG Zeiterfassung CLEAN 7.4.2 - retirement service worker.
   Entfernt alte DG-Caches und registriert sich danach selbst ab.
   Die aktuelle App laedt nur die versionierte Clean Runtime direkt. */
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
