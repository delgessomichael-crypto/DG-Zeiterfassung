/* DG Zeiterfassung 6.0.2 - strikte Backend-Version mit klarer Diagnose */
(function(){
'use strict';
const V='6.0.2',KEY='dg602_backend',TTL=5*60*1000;
const BACKEND_URL='https://script.google.com/macros/s/AKfycby2L3SMgh2RoGWsNRUp6o11g4iyZ8bgkSIGaAZPnBXCkJTkDDGF9aydn9vVKMB7kXsO/exec';
function byId(id){return document.getElementById(id);}
function clearOldNotices(){
  const notice=byId('d3Notice');
  if(notice&&/Google-GS|Google-Backend|Backend.*bereitgestellt|Bereitstellungs-Link|Versionsstand/i.test(notice.textContent||''))notice.remove();
}
function exact(found){return String(found||'')===V;}
function foundVersion(){return String(window.__DG_FOUND_BACKEND||'unbekannt');}
function showVersionNotice(found){
  window.__DG_FOUND_BACKEND=String(found||'unbekannt');
  if(exact(found)){clearOldNotices();return true;}
  if(window.DG3)DG3.backend='';
  const msg='Versionsstand stimmt nicht: App '+V+' benötigt Google-GS '+V+'. Aktiv ist Google-GS '+foundVersion()+'. Bitte die bestehende Apps-Script-Bereitstellung auf '+V+' aktualisieren.';
  if(typeof window.d3Notice==='function')window.d3Notice(msg,'warn');
  return false;
}
window.d3CheckBackend=d3CheckBackend=async function(force){
  if(!force){
    try{
      const c=JSON.parse(sessionStorage.getItem(KEY)||'null');
      if(c&&exact(c.version)&&Date.now()-Number(c.ts||0)<TTL){
        window.__DG_FOUND_BACKEND=V;
        if(window.DG3)DG3.backend=V;
        clearOldNotices();
        return true;
      }
    }catch(_e){}
  }
  try{
    const r=await fetch(BACKEND_URL,{method:'POST',headers:{'Content-Type':'text/plain;charset=utf-8'},body:JSON.stringify({action:'ping',clientVersion:V})});
    if(!r.ok)throw new Error('HTTP '+r.status);
    const raw=JSON.parse(await r.text());
    if(!raw.ok)throw new Error(raw.error||'Serverfehler.');
    const data=raw.data!==undefined?raw.data:raw;
    const found=String(data&&data.version||'unbekannt');
    window.__DG_FOUND_BACKEND=found;
    try{
      sessionStorage.removeItem('dg60_backend_reachable');
      sessionStorage.removeItem('dg60_backend');
      if(exact(found))sessionStorage.setItem(KEY,JSON.stringify({ts:Date.now(),version:found}));
      else sessionStorage.removeItem(KEY);
    }catch(_e){}
    if(window.DG3)DG3.backend=exact(found)?found:'';
    return showVersionNotice(found);
  }catch(e){
    window.__DG_FOUND_BACKEND='nicht erreichbar';
    if(window.DG3)DG3.backend='';
    try{sessionStorage.removeItem(KEY);}catch(_e){}
    if(typeof window.d3Notice==='function')window.d3Notice('Google-Backend ist nicht erreichbar: '+(e&&e.message?e.message:'Unbekannter Fehler')+'.','warn');
    return false;
  }
};

/* Ueberschreibt die alte 6.0-Transportmeldung aus dem Runtime-Layer. */
window.d3Api=d3Api=async function(payload){
  const action=String(payload&&payload.action||''),read=/^(get|check)/.test(action)||['ping','employeeLogin','systemHealthCheck'].includes(action),key=JSON.stringify(payload||{});
  if(read&&window.DG3&&DG3.reads&&DG3.reads.has(key))return DG3.reads.get(key);
  const run=(async()=>{
    if(action!=='ping'&&(!window.DG3||String(DG3.backend||'')!==V)){
      const ok=await d3CheckBackend(true);
      if(!ok)throw dgError('App '+V+' kann nicht speichern/laden, weil Google-GS '+foundVersion()+' aktiv ist. Benötigt wird Google-GS '+V+'.','version');
    }
    if(window.DG3&&!read)DG3.pending=(DG3.pending||0)+1;
    const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),65000);
    try{
      let response;
      try{response=await fetch(BACKEND_URL,{method:'POST',headers:{'Content-Type':'text/plain;charset=utf-8'},body:JSON.stringify(Object.assign({},payload,{clientVersion:V})),signal:controller.signal});}
      catch(e){throw dgError(e.name==='AbortError'?'Serverantwort dauert zu lange. Vor erneutem Speichern zuerst Daten neu laden.':'Keine Serververbindung.','network');}
      if(!response.ok)throw dgError('HTTP '+response.status,'network');
      let data;try{data=JSON.parse(await response.text());}catch(_e){throw dgError('Ungültige Serverantwort.','server');}
      if(!data.ok)throw dgError(data.error||'Serverfehler.','server');
      return data.data!==undefined?data.data:data;
    }finally{clearTimeout(timer);if(window.DG3&&!read)DG3.pending=Math.max(0,(DG3.pending||1)-1);}
  })();
  if(read&&window.DG3&&DG3.reads)DG3.reads.set(key,run);
  try{return await run;}finally{if(read&&window.DG3&&DG3.reads&&DG3.reads.get(key)===run)DG3.reads.delete(key);}
};

async function checkOnStart(){await window.d3CheckBackend(true);}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',function(){setTimeout(checkOnStart,120);},{once:true});else setTimeout(checkOnStart,120);
})();
