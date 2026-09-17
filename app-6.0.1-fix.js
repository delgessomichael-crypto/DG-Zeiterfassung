/* DG Zeiterfassung 6.0.1 - UI-Farben, Kalender-Refresh und zentraler Versionsstempel */
(function(){
'use strict';
const V='6.0.1';
const q=id=>document.getElementById(id);
let stamping=false;

function stamp(){
  if(stamping)return;
  stamping=true;
  try{
    if(document.title!=='DG Zeiterfassung '+V)document.title='DG Zeiterfassung '+V;
    document.querySelectorAll('.login-card .muted.small,#loginScreen .center.muted.small').forEach(x=>{
      if(/^Version /.test((x.textContent||'').trim())&&x.textContent!=='Version '+V)x.textContent='Version '+V;
    });
    document.querySelectorAll('.hero strong,#mainScreen .hero .head-row strong').forEach(x=>{
      if(/Zeiterfassung/.test(x.textContent||'')&&x.textContent!=='Zeiterfassung - '+V)x.textContent='Zeiterfassung - '+V;
    });
    try{window.DG_APP_VERSION=V;if(window.DG3)DG3.version=V;}catch(_e){}
  }finally{stamping=false;}
}

function watchVersion(){
  if(window.__dg601VersionWatch)return;
  window.__dg601VersionWatch=true;
  const obs=new MutationObserver(()=>stamp());
  obs.observe(document.documentElement,{subtree:true,childList:true,characterData:true});
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
   Sonst zeigt ein alter lokaler Kalendercache den bereits erledigten Termin erneut an. */
const oldApi=window.api;
if(typeof oldApi==='function'&&!window.__dg601ApiWrapped){
  window.__dg601ApiWrapped=true;
  window.api=api=async function(payload){
    const r=await oldApi.apply(this,arguments);
    if(payload&&payload.action==='createInspectionOffer'){
      try{
        const employee=(typeof auth==='function'?auth().employee:'')||payload.employee||'';
        if(employee){
          localStorage.removeItem('dg_calendar_'+employee);
          localStorage.removeItem('dg51_calendar_ts_'+employee);
        }
      }catch(_e){}
    }
    return r;
  };
}

function boot(){stamp();watchVersion();css();}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
setTimeout(boot,50);
setTimeout(stamp,250);
setTimeout(stamp,750);
})();
