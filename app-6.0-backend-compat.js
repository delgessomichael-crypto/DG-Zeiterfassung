/* DG Zeiterfassung 6.0 - Backend-Uebergang ohne Arbeitsblockade */
(function(){
'use strict';
const V='6.0',KEY='dg60_backend_reachable',TTL=30*60*1000;
function byId(id){return document.getElementById(id);}
function showVersionNotice(found){
  if(/^6(?:\.|$)/.test(String(found||''))){byId('d3Notice')?.remove();return;}
  if(typeof window.d3Notice==='function')window.d3Notice('App 6.0 aktiv · Google-GS '+(found||'unbekannt')+' ist noch am bisherigen Bereitstellungs-Link aktiv. Die App bleibt nutzbar; Google-GS 6.0 bitte als neue Version der bestehenden Bereitstellung veröffentlichen.','warn');
}
window.d3CheckBackend=d3CheckBackend=async function(force){
  if(!force){
    try{
      const c=JSON.parse(sessionStorage.getItem(KEY)||'null');
      if(c&&c.version&&Date.now()-Number(c.ts||0)<TTL){
        if(window.DG3)DG3.backend=String(c.version);
        showVersionNotice(c.version);
        return true;
      }
    }catch(_e){}
  }
  try{
    const r=await fetch(API_URL,{method:'POST',headers:{'Content-Type':'text/plain;charset=utf-8'},body:JSON.stringify({action:'ping',clientVersion:V})});
    if(!r.ok)throw new Error('HTTP '+r.status);
    const raw=JSON.parse(await r.text());
    if(!raw.ok)throw new Error(raw.error||'Serverfehler.');
    const data=raw.data!==undefined?raw.data:raw;
    const found=String(data&&data.version||'unbekannt');
    if(window.DG3)DG3.backend=found;
    try{sessionStorage.setItem(KEY,JSON.stringify({ts:Date.now(),version:found}));sessionStorage.setItem('dg60_backend',JSON.stringify({ts:Date.now(),version:found}));}catch(_e){}
    showVersionNotice(found);
    return true;
  }catch(e){
    if(window.DG3)DG3.backend='';
    if(typeof window.d3Notice==='function')window.d3Notice('Google-Backend ist nicht erreichbar: '+(e&&e.message?e.message:'Unbekannter Fehler')+'.','warn');
    return false;
  }
};
/* Veraltete rote Bereichsmeldung nach erfolgreichem Ping entfernen. */
async function clearBlockedStatus(){
  const ok=await window.d3CheckBackend(false);if(!ok)return;
  document.querySelectorAll('.status.error').forEach(el=>{if(/Google-Backend 6\.0 noch nicht bereitgestellt/i.test(el.textContent||'')){el.textContent='Backend erreichbar. Bitte Bereich erneut aktualisieren.';el.className='status ok';}});
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>setTimeout(clearBlockedStatus,100),{once:true});else setTimeout(clearBlockedStatus,100);
})();
