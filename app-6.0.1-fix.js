/* DG Zeiterfassung 6.0.1 - UI-Farben, Kalender-Refresh und Versionsstempel */
(function(){
'use strict';
const V='6.0.1';
const q=id=>document.getElementById(id);

function stamp(){
  document.title='DG Zeiterfassung '+V;
  document.querySelectorAll('.login-card .muted.small').forEach(x=>{if(/^Version /.test((x.textContent||'').trim()))x.textContent='Version '+V;});
  document.querySelectorAll('.hero strong').forEach(x=>{if(/Zeiterfassung/.test(x.textContent||''))x.textContent='Zeiterfassung - '+V;});
  try{window.DG_APP_VERSION=V;if(window.DG3)DG3.version=V;}catch(_e){}
}

function css(){
  if(q('dg601Css'))return;
  const s=document.createElement('style');s.id='dg601Css';s.textContent=`
    .dg60-choice.dg60-yes{background:#dcfce7!important;color:#166534!important;border-color:#86efac!important}
    .dg60-choice.dg60-no{background:#fee2e2!important;color:#991b1b!important;border-color:#fca5a5!important}
    .dg60-choice.dg60-yes.active{background:#166534!important;color:#fff!important;border-color:#166534!important;box-shadow:0 0 0 3px rgba(22,101,52,.12)}
    .dg60-choice.dg60-no.active{background:#b91c1c!important;color:#fff!important;border-color:#b91c1c!important;box-shadow:0 0 0 3px rgba(185,28,28,.12)}
  `;document.head.appendChild(s);
}

/* Nach einer Besichtigung muss die Kalenderliste zwingend frisch vom Backend geladen werden.
   Sonst zeigt der 30-Sekunden-Cache den bereits erledigten Termin erneut an. */
const oldApi=window.api;
if(typeof oldApi==='function')window.api=api=async function(payload){
  const r=await oldApi.apply(this,arguments);
  if(payload&&payload.action==='createInspectionOffer'){
    try{
      const employee=(typeof auth==='function'?auth().employee:'')||payload.employee||'';
      if(employee){
        localStorage.removeItem('dg_calendar_'+employee);
        localStorage.removeItem('dg51_calendar_ts_'+employee);
      }
      if(window.DG51)DG51.forceCalendar=true;
    }catch(_e){}
  }
  return r;
};

function boot(){stamp();css();}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
setTimeout(boot,250);
})();
