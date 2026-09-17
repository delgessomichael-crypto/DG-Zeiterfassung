/* DG Zeiterfassung 6.0.3 - finaler Produktions-Hardening-Layer */
(function(){
'use strict';
const V='6.0.3';
const BACKEND_URL='https://script.google.com/macros/s/AKfycby2L3SMgh2RoGWsNRUp6o11g4iyZ8bgkSIGaAZPnBXCkJTkDDGF9aydn9vVKMB7kXsO/exec';
const TOKEN_KEY='dg_device_session';
function $(id){return document.getElementById(id);}
function isBoss(){try{return localStorage.getItem('dg_chef_access')==='1';}catch(_e){return false;}}
function stamp(){
  document.title='DG Zeiterfassung '+V;
  document.querySelectorAll('.login-card .muted.small').forEach(function(x){if(/^Version\s+/i.test((x.textContent||'').trim()))x.textContent='Version '+V;});
  document.querySelectorAll('.hero strong').forEach(function(x){if(/Zeiterfassung/i.test(x.textContent||''))x.textContent='Zeiterfassung - '+V;});
  try{window.DG_APP_VERSION=V;window.DG_RELEASE=V;if(window.DG3)DG3.version=V;}catch(_e){}
}
function clearOldCaches(){try{['dg60_backend','dg602_backend','dg51_backend'].forEach(function(k){sessionStorage.removeItem(k);});}catch(_e){}}

/* Alte Basisversionen koennen im Hintergrund Chef-Leseaktionen anstossen. Normale Monteure erhalten lokal leere Daten statt unnoetiger Backend-Fehler. */
const bossReadArray=new Set(['getPlannerWorkers','getOfferReports','getOfferReminders','getBossDayClosures','getCustomerInquiries','getRegieReports','getAbsences','getMaintenanceOverview']);
const rawApi=window.api;
if(typeof rawApi==='function')window.api=api=async function(payload){
  const action=String(payload&&payload.action||'');
  if(!isBoss()&&bossReadArray.has(action)){
    if(action==='getMaintenanceOverview')return {currentMonthOpen:0,months:[],windowLabel:''};
    return [];
  }
  return rawApi.apply(this,arguments);
};

/* Falls alte Erweiterungsschichten mehrere Sync-Timer gestartet haben, werden deren Aufrufe zentral entprellt. */
const rawSync=window.d3Sync;let lastSync=0,syncPromise=null;
if(typeof rawSync==='function')window.d3Sync=d3Sync=function(){
  const now=Date.now();
  if(syncPromise)return syncPromise;
  if(now-lastSync<45000)return Promise.resolve();
  lastSync=now;
  try{
    const r=rawSync.apply(this,arguments);
    if(r&&typeof r.then==='function'){syncPromise=Promise.resolve(r).finally(function(){syncPromise=null;});return syncPromise;}
    return r;
  }catch(e){syncPromise=null;throw e;}
};

/* Abmelden immer ueber den aktuellen Backend-Pfad. Lokale Sitzung wird sofort beendet; Server-Token wird best effort widerrufen. */
window.logout=logout=function(){
  let employee='',token='';
  try{employee=localStorage.getItem('dg_employee')||'';token=localStorage.getItem(TOKEN_KEY)||'';}catch(_e){}
  try{
    localStorage.removeItem('dg_employee');localStorage.removeItem(TOKEN_KEY);localStorage.removeItem('dg_chef_access');localStorage.removeItem('dg_employee_pin');
    sessionStorage.removeItem('dg_employee_pin');sessionStorage.removeItem('dg603_backend');sessionStorage.removeItem('dg602_backend');sessionStorage.removeItem('dg60_backend');sessionStorage.removeItem('dg51_backend');
  }catch(_e){}
  if($('mainScreen'))$('mainScreen').classList.add('hidden');
  if($('loginScreen'))$('loginScreen').classList.remove('hidden');
  if($('loginPin'))$('loginPin').value='';
  if(navigator.onLine&&employee&&token){
    fetch(BACKEND_URL,{method:'POST',headers:{'Content-Type':'text/plain;charset=utf-8'},body:JSON.stringify({action:'employeeLogout',employee:employee,deviceSessionToken:token,clientVersion:V})}).catch(function(){});
  }
};

function boot(){clearOldCaches();stamp();setTimeout(stamp,350);setTimeout(stamp,1200);}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();
