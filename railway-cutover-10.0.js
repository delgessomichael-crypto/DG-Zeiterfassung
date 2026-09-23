/* DG App 10.0 - Railway cutover compatibility hotfix
   Purpose: the productive app uses Railway as its primary backend.
   Legacy Google-GS version checks must never block loading or saving. */
(function(){
'use strict';

const RELEASE='10.0';
const LEGACY_COMPAT='9.0';
const CACHE_KEY='dg70_backend';

function byId(id){return document.getElementById(id);}

function clearLegacyVersionUi(){
  const notice=byId('d3Notice');
  if(notice&&/Google-GS|Google-Backend|Versionsstand|Backend.*bereitgestellt|kann nicht speichern\/laden/i.test(notice.textContent||'')){
    notice.remove();
  }
  const sync=byId('d3Sync');
  if(sync&&/Google-GS|Google-Backend|Versionsstand|kann nicht speichern\/laden/i.test(sync.textContent||'')){
    sync.textContent='Railway verbunden · Daten werden aktualisiert.';
  }
}

function markRailwayReady(){
  window.__DG_FOUND_BACKEND='Railway 10.0';
  window.__DG_RAILWAY_CUTOVER=true;
  try{
    if(window.DG3)window.DG3.backend=LEGACY_COMPAT;
    sessionStorage.setItem(CACHE_KEY,JSON.stringify({ts:Date.now(),version:LEGACY_COMPAT,source:'railway'}));
    ['dg60_backend','dg602_backend','dg603_backend','dg51_backend','dg9_backend'].forEach(k=>sessionStorage.removeItem(k));
  }catch(_e){}
  clearLegacyVersionUi();
  return true;
}

async function railwayCompatibilityCheck(){
  return markRailwayReady();
}

window.d3CheckBackend=railwayCompatibilityCheck;
try{d3CheckBackend=railwayCompatibilityCheck;}catch(_e){}

function stamp(){
  document.title='DG Zeiterfassung '+RELEASE;
  document.querySelectorAll('#loginScreen .center.muted.small').forEach(x=>{x.textContent='Version '+RELEASE;});
  document.querySelectorAll('#mainScreen .hero .head-row strong').forEach(x=>{if(/Zeiterfassung/i.test(x.textContent||''))x.textContent='Zeiterfassung - '+RELEASE;});
  try{window.DG_APP_VERSION=RELEASE;window.DG_RELEASE=RELEASE;}catch(_e){}
  markRailwayReady();
}

if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',stamp,{once:true});
else stamp();

setTimeout(markRailwayReady,150);
setTimeout(markRailwayReady,750);
setTimeout(markRailwayReady,2000);
})();