/* DG Zeiterfassung 5.2.5 - Performance und Timeout-Entlastung */
(function(){
'use strict';
const V525='5.2.5';
const S=window.DG525=window.DG525||{dashboardPromise:null,lastDashboard:0,lastAuto:0};
const DASH_TTL=180000;
const AUTO_TTL=300000;
const OLD_TIMEOUT='Serverantwort dauert zu lange. Vor erneutem Anlegen zuerst Daten neu laden.';
const READ_TIMEOUT='Datenabruf dauert zu lange. Der letzte bekannte Stand bleibt angezeigt.';
const WRITE_TIMEOUT='Speichern dauert zu lange. Bitte nicht erneut speichern – zuerst Daten neu laden und prüfen, ob die Änderung bereits übernommen wurde.';
const getJson=(k)=>{try{return JSON.parse(localStorage.getItem(k)||'null')}catch(_e){return null}};
const setJson=(k,v)=>{try{localStorage.setItem(k,JSON.stringify(v))}catch(_e){}};
const now=()=>Date.now();
const isReadAction=(a)=>/^(get|check)/.test(a)||['ping','employeeLogin','systemHealthCheck'].includes(a);
function renderDash(d){if(!d)return;['completed','running','offers','days','reminders','inquiries','maintenance'].forEach(k=>{if(d[k]!==undefined&&typeof d3Count==='function')d3Count(k,d[k])});}
function clearStaleReadNotice(){const n=document.getElementById('d3Notice');if(!n)return;const t=String(n.textContent||'');if(t===OLD_TIMEOUT||t===READ_TIMEOUT||t.startsWith('Verbindungsprüfung fehlgeschlagen: '+READ_TIMEOUT))n.remove();}

/* Timeout-Meldungen unterscheiden: Lesen darf nicht wie ein unsicherer Schreibvorgang wirken. */
const api525=window.api;
if(typeof api525==='function')window.api=api=async function(payload){
  const action=String(payload&&payload.action||'');
  try{
    const r=await api525.apply(this,arguments);
    if(isReadAction(action))clearStaleReadNotice();
    return r;
  }catch(e){
    if(e&&String(e.message||'')===OLD_TIMEOUT)e.message=isReadAction(action)?READ_TIMEOUT:WRITE_TIMEOUT;
    throw e;
  }
};

/* Dashboard: genau ein Sammelaufruf. Automatische Aktualisierung zwingt niemals eine teure Backend-Neuberechnung. */
window.d3Dashboard=d3Dashboard=async function(force){
  if(!canAccessBoss())return;
  const live=getJson('dg51_dashboard'),backup=getJson('dg525_dashboard_last'),cached=(live&&live.data)?live:backup;
  if(cached&&cached.data)renderDash(cached.data);
  if(!navigator.onLine)return cached&&cached.data;
  const fresh=cached&&Number(cached.ts)>0&&now()-Number(cached.ts)<DASH_TTL;
  if(!force&&fresh)return cached.data;
  if(S.dashboardPromise)return S.dashboardPromise;
  S.dashboardPromise=(async()=>{
    try{
      const d=await api(chefPayload({action:'getDashboardSummary51',force:Boolean(force)}));
      const snap={ts:now(),data:d||{}};
      S.lastDashboard=snap.ts;
      setJson('dg51_dashboard',snap);setJson('dg525_dashboard_last',snap);
      renderDash(d||{});clearStaleReadNotice();
      if(document.getElementById('d3Sync'))document.getElementById('d3Sync').textContent='Zuletzt aktualisiert: '+new Date().toLocaleTimeString('de-DE')+' · Hintergrundlast reduziert.';
      return d;
    }catch(e){
      if(cached&&cached.data)renderDash(cached.data);
      if(document.getElementById('d3Sync'))document.getElementById('d3Sync').textContent='Letzter gültiger Stand angezeigt · '+e.message;
      return cached&&cached.data;
    }finally{S.dashboardPromise=null;}
  })();
  return S.dashboardPromise;
};

/* Hintergrund-Sync nur noch alle fünf Minuten und ohne geöffnete Bürobereiche erneut zu laden. */
window.d3Sync=d3Sync=async function(force){
  if(DG3.syncing||DG3.pending||document.hidden||!navigator.onLine||!DG3.ready||!auth().employee||d3Dirty())return;
  if(!force&&now()-S.lastAuto<AUTO_TTL)return;
  S.lastAuto=now();DG3.syncing=true;
  try{
    await syncQueue(false);
    if(d3Visible(document.getElementById('employeeView'))){
      await Promise.allSettled([loadDay(Boolean(force)),loadCalendarEvents(Boolean(force))]);
    }else{
      await d3Dashboard(Boolean(force));
    }
    if(document.getElementById('d3Sync'))document.getElementById('d3Sync').textContent='Zuletzt aktualisiert: '+new Date().toLocaleTimeString('de-DE')+' · automatische Prüfung alle 5 Minuten.';
  }catch(e){
    if(document.getElementById('d3Sync'))document.getElementById('d3Sync').textContent='Hintergrund-Aktualisierung ausgelassen: '+e.message;
  }finally{DG3.syncing=false;}
};

/* Alte, bereits erledigte Timeout-Anzeige beim erfolgreichen Wechsel ins Büro nicht stehen lassen. */
const showBoss525=window.showBoss;
if(typeof showBoss525==='function')window.showBoss=showBoss=function(){clearStaleReadNotice();return showBoss525.apply(this,arguments)};

function stamp525(){document.title='DG Zeiterfassung '+V525;document.querySelectorAll('.login-card .muted.small').forEach(x=>{if(/^Version /.test((x.textContent||'').trim()))x.textContent='Version '+V525});document.querySelectorAll('.hero strong').forEach(x=>{if(/Zeiterfassung/.test(x.textContent||''))x.textContent='Zeiterfassung - '+V525});try{DG3.version=V525;window.DG_APP_VERSION=V525}catch(_e){}}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',stamp525);else stamp525();
})();
