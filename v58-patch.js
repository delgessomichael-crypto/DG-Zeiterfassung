(function(){
'use strict';
if(window.__DG_V58_PATCH__)return;window.__DG_V58_PATCH__=true;
const $=id=>document.getElementById(id);

// v58 stability layer: repeated read requests from the historical patch chain are
// collapsed for a few seconds. Every write invalidates the cache immediately.
const READ_TTL=8000;
const readCache=new Map();
const writeActions=new Set([
  'saveEmployeeAdmin','setEmployeeActive','deleteEmployeeAdmin','saveAbsence','saveTimeBankManual',
  'applyTimeBankToMonth','bankMonthSurplus','deleteAbsence','syncHolidays','saveVacationEntitlement',
  'saveMonthlyAdjustment','deleteMonthlyAdjustment','markConflictReviewed','setMonthClosureStatus',
  'setDayStatus','confirmEmployeeAssignment','reportEmployeeAssignmentIssue','saveEntry','deleteEntry',
  'closeDay','refreshClosedDay','sendMonthReport','setRegieObjectJobStatus','markRegieObjectCompleted',
  'markRegieObjectBilled','markRegieObjectsBilled','markRegieReportBilled','mergeRegieObjects',
  'updateRegieReport','manualCloseBossDay'
]);
const cacheableReads=new Set([
  'getRegieReports','getMonthData','getWeekData','getBossDayClosures','getEmployees','getEmployeeAdminData',
  'getAbsences','getVacationAccounts','getVacationAccount','getBossMonthData','getChefEmployeeMonthData',
  'getObjectReports','getMyTimeBank','getEmployeeCalendarEvents','getDayData'
]);
const baseApi=window.api;
if(typeof baseApi==='function'){
  window.api=async function(payload){
    const action=String(payload&&payload.action||'');
    if(writeActions.has(action)){
      readCache.clear();
      try{return await baseApi(payload)}finally{readCache.clear()}
    }
    if(!cacheableReads.has(action))return baseApi(payload);
    const key=JSON.stringify(payload||{}),now=Date.now(),hit=readCache.get(key);
    if(hit&&hit.expires>now)return hit.promise;
    const promise=Promise.resolve().then(()=>baseApi(payload));
    readCache.set(key,{expires:now+READ_TTL,promise});
    try{return await promise}catch(e){readCache.delete(key);throw e}
  };
}

// 00:00 bis 00:00 bzw. identische Von-/Bis-Zeit darf nicht als 24-Stunden-Einsatz gelten.
window.calculateHours=function(){
  const startEl=$('start'),endEl=$('end'),hoursEl=$('hours');if(!startEl||!endEl||!hoursEl)return 0;
  const s=typeof normalizeTimeInput==='function'?normalizeTimeInput(startEl.value):startEl.value;
  const e=typeof normalizeTimeInput==='function'?normalizeTimeInput(endEl.value):endEl.value;
  if(!s||!e){hoursEl.value='';return 0}
  startEl.value=s;endEl.value=e;
  let sm=typeof parseTimeMinutes==='function'?parseTimeMinutes(s):null;
  let em=typeof parseTimeMinutes==='function'?parseTimeMinutes(e):null;
  if(sm===null||em===null||em===sm){hoursEl.value='';return 0}
  if(em<sm)em+=1440;
  const mins=em-sm,h=mins>0&&mins<1440?mins/60:0;
  hoursEl.value=h>0?h.toFixed(2):'';
  const status=$('entryStatus');if(h>0&&status&&status.textContent.includes('Termin übernommen. Tatsächliche Von/Bis-Zeit')&&typeof clearMessage==='function')clearMessage('entryStatus');
  return h;
};

function clearBusyButtons(){
  document.querySelectorAll('button.dg54-busy').forEach(function(b){b.disabled=false;b.classList.remove('dg54-busy');delete b.dataset.dg58BusyAt});
}

// The v54 local status handler disables a button before a confirm/prompt is shown.
// If the user cancels, older code paths returned without re-enabling it.
if(!window.__DG_V58_DIALOG_WRAP__){
  window.__DG_V58_DIALOG_WRAP__=true;
  const nativeConfirm=window.confirm.bind(window);
  const nativePrompt=window.prompt.bind(window);
  window.confirm=function(text){const ok=nativeConfirm(text);if(!ok)setTimeout(clearBusyButtons,0);return ok};
  window.prompt=function(){const r=nativePrompt.apply(window,arguments);if(r===null)setTimeout(clearBusyButtons,0);return r};
}

document.addEventListener('click',function(ev){
  const b=ev.target&&ev.target.closest?ev.target.closest('button'):null;if(!b)return;
  const t=String(b.textContent||'').trim().toLowerCase();
  if(t==='abbrechen'||t==='nein'||t.includes('schließen')||t.includes('abbrechen /'))setTimeout(clearBusyButtons,0);
},false);

// Safety net: a processing button must never stay blocked forever after a frontend exception.
const busyObserver=new MutationObserver(function(){
  document.querySelectorAll('button.dg54-busy').forEach(function(b){
    if(b.dataset.dg58BusyAt)return;
    b.dataset.dg58BusyAt=String(Date.now());
    setTimeout(function(){if(b.classList.contains('dg54-busy')){b.disabled=false;b.classList.remove('dg54-busy');delete b.dataset.dg58BusyAt}},60000);
  });
});
busyObserver.observe(document.documentElement,{subtree:true,attributes:true,attributeFilter:['class']});

function dedupeLocalStatuses(){
  document.querySelectorAll('.dg54-local-status').forEach(function(local){
    const text=String(local.textContent||'').trim();if(!text){local.classList.add('hidden');return}
    const host=local.closest('.card,.report-card,.dg48-subsection')||local.parentElement;
    if(!host)return;
    const duplicate=Array.from(host.querySelectorAll('.status:not(.dg54-local-status)')).some(function(s){return String(s.textContent||'').trim()===text});
    local.classList.toggle('hidden',duplicate);
  });
}
const statusObserver=new MutationObserver(function(){setTimeout(dedupeLocalStatuses,0)});
statusObserver.observe(document.documentElement,{subtree:true,childList:true,characterData:true});
setTimeout(dedupeLocalStatuses,0);

// Büro-KPIs nach Regie-Aktionen direkt mitziehen; kein erneutes Öffnen des Büro-Tabs nötig.
const baseLoadRegie58=window.loadRegieReports;
if(typeof baseLoadRegie58==='function')window.loadRegieReports=async function(view){
  const r=await baseLoadRegie58.apply(this,arguments);
  if(view!=='Abgerechnet'&&window.__dgRegieRaw){
    let groups=window.__dgRegieRaw||[];
    if(typeof mergeRegieGroups==='function')groups=mergeRegieGroups(groups);
    const running=groups.filter(g=>(g.jobStatus||'Abgeschlossen')==='Laufend').length;
    const open=groups.filter(g=>(g.jobStatus||'Abgeschlossen')!=='Laufend').length;
    const set=function(id,n,badClass){const x=$(id);if(!x)return;const strong=x.querySelector('strong');if(strong)strong.textContent=String(n);x.className='dg53-kpi '+(n?badClass:'green')};
    set('dg53Run',running,'red');set('dg53Open',open,'orange');
  }
  return r;
};

function backendBanner(message){
  let x=$('dg58BackendStatus');
  if(!message){if(x)x.remove();return}
  if(!x){x=document.createElement('div');x.id='dg58BackendStatus';x.className='status error';x.style.position='sticky';x.style.top='0';x.style.zIndex='20000';x.style.margin='0';x.style.borderRadius='0';document.body.prepend(x)}
  x.textContent=message;
}
async function checkBackendVersion(){
  if(!navigator.onLine||typeof window.api!=='function')return;
  try{
    const r=await window.api({action:'ping'});
    const v=Number(r&&r.version||0);
    if(v!==58)backendBanner('Frontend Version 58 ist aktiv, aber das Google-Backend ist nicht Version 58. Bitte die aktuelle GS-Version bereitstellen.');
    else backendBanner('');
  }catch(_e){/* normale Verbindungsanzeige übernimmt */}
}
window.addEventListener('online',checkBackendVersion);
setTimeout(checkBackendVersion,700);

document.title='DG Zeiterfassung v58';
const lv=document.querySelector('.login-card .center.muted.small');if(lv)lv.textContent='Version 58';
const hv=document.querySelector('.hero .head-row strong');if(hv)hv.textContent='Zeiterfassung · v58';
})();