/* DG Zeiterfassung 6.0.2 - strikte Backend-Version */
(function(){
'use strict';
const V='6.0.2',KEY='dg602_backend',TTL=5*60*1000;
function byId(id){return document.getElementById(id);}
function clearOldNotices(){
  const notice=byId('d3Notice');
  if(notice&&/Google-GS|Google-Backend|Backend.*bereitgestellt|Bereitstellungs-Link|Versionsstand/i.test(notice.textContent||''))notice.remove();
}
function exact(found){return String(found||'')===V;}
function showVersionNotice(found){
  if(exact(found)){clearOldNotices();return true;}
  if(window.DG3)DG3.backend='';
  const msg='Versionsstand stimmt nicht: App '+V+' benötigt Google-GS '+V+'. Aktiv ist Google-GS '+(found||'unbekannt')+'. Bitte die bestehende Apps-Script-Bereitstellung auf Version '+V+' aktualisieren.';
  if(typeof window.d3Notice==='function')window.d3Notice(msg,'warn');
  return false;
}
window.d3CheckBackend=d3CheckBackend=async function(force){
  if(!force){
    try{
      const c=JSON.parse(sessionStorage.getItem(KEY)||'null');
      if(c&&exact(c.version)&&Date.now()-Number(c.ts||0)<TTL){
        if(window.DG3)DG3.backend=V;
        clearOldNotices();
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
    try{
      sessionStorage.removeItem('dg60_backend_reachable');
      sessionStorage.removeItem('dg60_backend');
      if(exact(found))sessionStorage.setItem(KEY,JSON.stringify({ts:Date.now(),version:found}));
      else sessionStorage.removeItem(KEY);
    }catch(_e){}
    if(window.DG3)DG3.backend=exact(found)?found:'';
    return showVersionNotice(found);
  }catch(e){
    if(window.DG3)DG3.backend='';
    try{sessionStorage.removeItem(KEY);}catch(_e){}
    if(typeof window.d3Notice==='function')window.d3Notice('Google-Backend ist nicht erreichbar: '+(e&&e.message?e.message:'Unbekannter Fehler')+'.','warn');
    return false;
  }
};
async function checkOnStart(){await window.d3CheckBackend(true);}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',function(){setTimeout(checkOnStart,120);},{once:true});else setTimeout(checkOnStart,120);
})();
