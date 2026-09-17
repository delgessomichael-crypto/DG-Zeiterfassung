/* DG Zeiterfassung 6.0 - Backend-Kompatibilitaet ohne unnoetige Warnmeldung */
(function(){
'use strict';
const V='6.0',KEY='dg60_backend_reachable',TTL=30*60*1000,MIN=[5,2,0,5];
function byId(id){return document.getElementById(id);}
function parts(v){return String(v||'').split('.').map(function(x){return Number(x)||0;});}
function supported(v){
  const p=parts(v);
  for(let i=0;i<MIN.length;i++){
    if((p[i]||0)>MIN[i])return true;
    if((p[i]||0)<MIN[i])return false;
  }
  return true;
}
function clearOldNotices(){
  const notice=byId('d3Notice');
  if(notice&&/Google-GS|Google-Backend|Backend.*bereitgestellt|Bereitstellungs-Link/i.test(notice.textContent||''))notice.remove();
  document.querySelectorAll('.status.error,.status.warn').forEach(function(el){
    const t=String(el.textContent||'');
    if(/Google-Backend 6\.0 noch nicht bereitgestellt|Google-GS 6\.0 bitte|bisherigen Bereitstellungs-Link/i.test(t)){
      el.textContent='Backend verbunden.';
      el.className='status ok';
    }
  });
}
function showVersionNotice(found){
  if(supported(found)){
    clearOldNotices();
    return true;
  }
  if(typeof window.d3Notice==='function')window.d3Notice('Google-GS '+(found||'unbekannt')+' ist zu alt. Fuer App 6.0 wird mindestens Google-GS 5.2.0.5 benoetigt.','warn');
  return false;
}
window.d3CheckBackend=d3CheckBackend=async function(force){
  if(!force){
    try{
      const c=JSON.parse(sessionStorage.getItem(KEY)||'null');
      if(c&&c.version&&Date.now()-Number(c.ts||0)<TTL){
        if(window.DG3)DG3.backend=String(c.version);
        return showVersionNotice(c.version);
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
    try{
      sessionStorage.setItem(KEY,JSON.stringify({ts:Date.now(),version:found}));
      sessionStorage.setItem('dg60_backend',JSON.stringify({ts:Date.now(),version:found}));
    }catch(_e){}
    return showVersionNotice(found);
  }catch(e){
    if(window.DG3)DG3.backend='';
    if(typeof window.d3Notice==='function')window.d3Notice('Google-Backend ist nicht erreichbar: '+(e&&e.message?e.message:'Unbekannter Fehler')+'.','warn');
    return false;
  }
};
async function clearBlockedStatus(){
  const ok=await window.d3CheckBackend(false);if(!ok)return;
  clearOldNotices();
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',function(){setTimeout(clearBlockedStatus,100);},{once:true});else setTimeout(clearBlockedStatus,100);
})();
