/* DG Zeiterfassung 6.0.3 - strikte, einheitliche Backend-Anbindung */
(function(){
'use strict';
const V='6.0.3',PREVIOUS=['7.1','7.0'],KEY='dg603_backend',TTL=5*60*1000;
const BACKEND_URL='https://script.google.com/macros/s/AKfycby2L3SMgh2RoGWsNRUp6o11g4iyZ8bgkSIGaAZPnBXCkJTkDDGF9aydn9vVKMB7kXsO/exec';
function byId(id){return document.getElementById(id);}
function exact(v){return String(v||'').trim()===V;}
function compatible(v){const s=String(v||'').trim();return exact(s)||PREVIOUS.includes(s);}
function foundVersion(){return String(window.__DG_FOUND_BACKEND||'unbekannt');}
function clearVersionNotices(){const n=byId('d3Notice');if(n&&/Google-GS|Google-Backend|Backend.*bereitgestellt|Bereitstellungs-Link|Versionsstand/i.test(n.textContent||''))n.remove();}
function showMismatch(found){window.__DG_FOUND_BACKEND=String(found||'unbekannt');if(compatible(found)){clearVersionNotices();return true;}if(window.DG3)DG3.backend='';const msg='Versionsstand stimmt nicht: App '+V+' benötigt Google-GS '+V+'. Aktiv ist Google-GS '+foundVersion()+'.';if(typeof window.d3Notice==='function')window.d3Notice(msg,'warn');return false;}
window.d3CheckBackend=d3CheckBackend=async function(force){
  if(!force){try{const c=JSON.parse(sessionStorage.getItem(KEY)||'null');if(c&&compatible(c.version)&&Date.now()-Number(c.ts||0)<TTL){window.__DG_FOUND_BACKEND=String(c.version);if(window.DG3)DG3.backend=String(c.version);clearVersionNotices();return true;}}catch(_e){}}
  try{
    const r=await fetch(BACKEND_URL,{method:'POST',headers:{'Content-Type':'text/plain;charset=utf-8'},body:JSON.stringify({action:'ping',clientVersion:V})});
    if(!r.ok)throw new Error('HTTP '+r.status);
    const raw=JSON.parse(await r.text());if(!raw.ok)throw new Error(raw.error||'Serverfehler.');
    const data=raw.data!==undefined?raw.data:raw,found=String(data&&data.version||raw.version||'unbekannt');
    window.__DG_FOUND_BACKEND=found;
    try{sessionStorage.removeItem('dg60_backend_reachable');sessionStorage.removeItem('dg60_backend');sessionStorage.removeItem('dg602_backend');if(compatible(found))sessionStorage.setItem(KEY,JSON.stringify({ts:Date.now(),version:found}));else sessionStorage.removeItem(KEY);}catch(_e){}
    if(window.DG3)DG3.backend=compatible(found)?found:'';
    return showMismatch(found);
  }catch(e){window.__DG_FOUND_BACKEND='nicht erreichbar';if(window.DG3)DG3.backend='';try{sessionStorage.removeItem(KEY);}catch(_e){}if(typeof window.d3Notice==='function')window.d3Notice('Google-Backend ist nicht erreichbar: '+(e&&e.message?e.message:'Unbekannter Fehler')+'.','warn');return false;}
};
window.d3Api=d3Api=async function(payload){
  const action=String(payload&&payload.action||''),read=/^(get|check|search|find)/.test(action)||['ping','employeeLogin','systemHealthCheck'].includes(action),key=JSON.stringify(payload||{});
  if(read&&window.DG3&&DG3.reads&&DG3.reads.has(key))return DG3.reads.get(key);
  const run=(async()=>{
    if(action!=='ping'&&(!window.DG3||!compatible(DG3.backend))){const ok=await d3CheckBackend(true);if(!ok)throw dgError('App '+V+' kann nicht speichern/laden, weil Google-GS '+foundVersion()+' aktiv ist. Benötigt wird Google-GS '+V+'.','version');}
    if(window.DG3&&!read)DG3.pending=(DG3.pending||0)+1;
    const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),65000);
    try{
      let response;try{response=await fetch(BACKEND_URL,{method:'POST',headers:{'Content-Type':'text/plain;charset=utf-8'},body:JSON.stringify(Object.assign({},payload,{clientVersion:V})),signal:controller.signal});}catch(e){throw dgError(e.name==='AbortError'?'Serverantwort dauert zu lange. Vor erneutem Speichern zuerst Daten neu laden.':'Keine Serververbindung.','network');}
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
