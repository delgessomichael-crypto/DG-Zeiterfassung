/* DG Zeiterfassung 6.0 - konsolidierter Laufzeit-Patch
   Ziele: weniger Wrapper/Requests, keine Regie-N+1-Nachladung, stabile Büroansicht,
   Angebotszaehler nur bei Bedarf, einheitliche App-/Backend-Version 6.0. */
(function(){
'use strict';

const DG60_VERSION='6.0';
const DG60_VIEW_KEY='dg60_view';
const DG60_OFFICE_STATE_KEY='dg60_office_state';
const DG60_BACKEND_CACHE_KEY='dg60_backend';
const DG60_BACKEND_CACHE_TTL=30*60*1000;
const DG60_OFFER_COUNT_TTL=30*1000;
const q60=id=>document.getElementById(id);
const esc60=v=>String(v==null?'':v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let offerCountPromise60=null,offerCountAt60=0;

function versionParts60(v){return String(v||'').split('.').map(x=>Number(x)||0);}
function backendIs60(v){return (versionParts60(v)[0]||0)>=6;}
function backendCompatible60(v){
  const p=versionParts60(v);
  if((p[0]||0)>=6)return true;
  return (p[0]===5&&p[1]===2&&p[2]===0&&(p[3]||0)>=8);
}
function stampVersion60(){
  document.title='DG Zeiterfassung '+DG60_VERSION;
  document.querySelectorAll('.login-card .muted.small').forEach(x=>{if(/^Version /.test((x.textContent||'').trim()))x.textContent='Version '+DG60_VERSION;});
  document.querySelectorAll('.hero strong').forEach(x=>{if(/Zeiterfassung/.test(x.textContent||''))x.textContent='Zeiterfassung - '+DG60_VERSION;});
  try{window.DG_APP_VERSION=DG60_VERSION;if(window.DG3)DG3.version=DG60_VERSION;}catch(_e){}
}

function css60(){
  if(q60('dg60Css'))return;
  const s=document.createElement('style');s.id='dg60Css';
  s.textContent=`
    .dg60-menu-count{display:inline-flex;align-items:center;justify-content:center;min-width:24px;height:24px;padding:0 7px;margin-left:7px;border-radius:999px;background:#e2e8f0;color:#334155;font-size:12px;font-weight:900;vertical-align:middle}
    .dg60-reminder-ok{margin-top:8px;padding:8px 10px;border-radius:10px;background:#f0fdf4;color:#166534;font-size:12px;font-weight:800}
    .dg60-reminder-warn{margin-top:8px;padding:8px 10px;border-radius:10px;background:#fff7ed;color:#9a3412;font-size:12px;font-weight:800}
    #dg60OfficeToolbar{display:flex;justify-content:flex-end;align-items:center;gap:10px;margin:0 0 14px;padding:10px 12px;border:1px solid #d7dee8;border-radius:14px;background:#f8fafc}
    #dg60OpenWindow{border:0;border-radius:11px;padding:11px 16px;background:#1f5f36;color:#fff;font-weight:800;cursor:pointer}
    @media(max-width:700px){#dg60OfficeToolbar{justify-content:stretch}#dg60OpenWindow{width:100%}}
  `;
  document.head.appendChild(s);
}

/* ---------- Backend / API 6.0 ---------- */
window.d3CheckBackend=d3CheckBackend=async function(force){
  if(!force){
    try{
      const c=JSON.parse(sessionStorage.getItem(DG60_BACKEND_CACHE_KEY)||'null');
      if(c&&backendCompatible60(c.version)&&Date.now()-Number(c.ts||0)<DG60_BACKEND_CACHE_TTL){
        DG3.backend=String(c.version||'');
        if(backendIs60(c.version))q60('d3Notice')?.remove();
        else if(typeof d3Notice==='function')d3Notice('App 6.0 läuft im Übergangsmodus. Bitte Google-GS 6.0 bereitstellen. Gefunden: '+c.version+'.','warn');
        return true;
      }
    }catch(_e){}
  }
  try{
    const r=await fetch(API_URL,{method:'POST',headers:{'Content-Type':'text/plain;charset=utf-8'},body:JSON.stringify({action:'ping',clientVersion:DG60_VERSION})});
    if(!r.ok)throw new Error('HTTP '+r.status);
    const data=JSON.parse(await r.text());
    if(!data.ok)throw new Error(data.error||'Serverfehler.');
    const result=data.data!==undefined?data.data:data,found=String(result&&result.version||'');
    const ok=backendCompatible60(found);DG3.backend=ok?found:'';
    if(ok){
      try{sessionStorage.setItem(DG60_BACKEND_CACHE_KEY,JSON.stringify({ts:Date.now(),version:found}));}catch(_e){}
      if(backendIs60(found))q60('d3Notice')?.remove();
      else if(typeof d3Notice==='function')d3Notice('App 6.0 läuft im Übergangsmodus. Bitte Google-GS 6.0 bereitstellen. Gefunden: '+(found||'unbekannt')+'.','warn');
      return true;
    }
    if(typeof d3Notice==='function')d3Notice('App 6.0 benötigt Google-GS 6.0. Gefunden: '+(found||'unbekannt')+'. Speichern ist gesperrt.','warn');
    return false;
  }catch(e){DG3.backend='';if(typeof d3Notice==='function')d3Notice('Verbindungsprüfung fehlgeschlagen: '+e.message,'warn');return false;}
};

/* Originale API-Kette bleibt erhalten. Nur der innerste Transport wird auf ClientVersion 6.0 gesetzt.
   Dadurch bleiben Geräte-Session, Cache-Invalidierung und alle bestehenden API-Wrapper aktiv. */
window.d3Api=d3Api=function(payload){
  const action=String(payload&&payload.action||''),read=/^(get|check)/.test(action)||['ping','employeeLogin','systemHealthCheck'].includes(action),key=JSON.stringify(payload||{});
  const run=(async()=>{
    if(action!=='ping'&&!backendCompatible60(DG3.backend)){
      const ok=await d3CheckBackend();if(!ok)throw dgError('Google-Backend 6.0 noch nicht bereitgestellt.','version');
    }
    if(!read)DG3.pending++;
    const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),65000);
    try{
      let response;
      try{response=await fetch(API_URL,{method:'POST',headers:{'Content-Type':'text/plain;charset=utf-8'},body:JSON.stringify(Object.assign({},payload,{clientVersion:DG60_VERSION})),signal:controller.signal});}
      catch(e){throw dgError(e.name==='AbortError'?'Serverantwort dauert zu lange. Vor erneutem Anlegen zuerst Daten neu laden.':'Keine Serververbindung.','network');}
      if(!response.ok)throw dgError('HTTP '+response.status,'network');
      let data;try{data=JSON.parse(await response.text());}catch(_e){throw dgError('Ungültige Serverantwort.','server');}
      if(!data.ok)throw dgError(data.error||'Serverfehler.','server');
      return data.data!==undefined?data.data:data;
    }finally{clearTimeout(timer);if(!read)DG3.pending--;}
  })();
  if(read){
    if(DG3.reads.has(key))return DG3.reads.get(key);
    DG3.reads.set(key,run);return run.finally(()=>{if(DG3.reads.get(key)===run)DG3.reads.delete(key);});
  }
  return run;
};

/* ---------- Angebotsbereich ---------- */
function offerMenuButton60(panelId){return document.querySelector('#d3Offers .d3-menu [data-panel="'+panelId+'"]');}
function setMenuCount60(panelId,label,n){const b=offerMenuButton60(panelId);if(b)b.innerHTML=esc60(label)+' <span class="dg60-menu-count">'+Number(n||0)+'</span>';}
function relabelDashboard60(){
  const tile=document.querySelector('#bossView .d3-dashboard .d3-tile.offers');
  if(!tile)return;
  const t=tile.querySelector('span');if(t)t.textContent='Angebote zu erstellen';
  tile.dataset.d3Fn='d3Open';tile.dataset.d3Args=JSON.stringify(['d3Offers','d3OfferCreate']);
}
async function refreshOfferCounts60(force){
  if(!navigator.onLine||typeof api!=='function'||typeof chefPayload!=='function')return;
  if(!force&&offerCountAt60&&Date.now()-offerCountAt60<DG60_OFFER_COUNT_TTL)return;
  if(offerCountPromise60)return offerCountPromise60;
  offerCountPromise60=(async()=>{
    try{
      const stages=['Offen','Zu erstellen','Archiv'];
      const rows=await Promise.all(stages.map(stage=>api(chefPayload({action:'getOfferReports',stage:stage}))));
      offerCountAt60=Date.now();
      if(window.DG3){DG3.offers=DG3.offers||{};DG3.offers.Offen=rows[0];DG3.offers['Zu erstellen']=rows[1];DG3.offers.Archiv=rows[2];DG3.offerCounts={open:rows[0].length,create:rows[1].length};}
      setMenuCount60('d3OfferOpen','Offene Angebote',rows[0].length);
      setMenuCount60('d3OfferCreate','Angebote zu erstellen',rows[1].length);
      setMenuCount60('d3OfferArchive','Angebotsarchiv',rows[2].length);
      if(typeof d3Count==='function')d3Count('offers',rows[1].length);
      relabelDashboard60();
    }catch(_e){}finally{offerCountPromise60=null;}
  })();
  return offerCountPromise60;
}
window.dg60RefreshOfferCounts=refreshOfferCounts60;
window.d3OfferTileOpen=function(){if(typeof d3Open==='function')return d3Open('d3Offers','d3OfferCreate');};
window.d3MoveOfferBackToCreate=async function(offerId){
  if(!confirm('Dieses offene Angebot wirklich zurück zu „Angebote zu erstellen“ verschieben? Ein offener Reminder wird dabei beendet.'))return false;
  try{
    await api(chefPayload({action:'moveOfferBackToCreate',offerId:String(offerId||'')}));offerCountAt60=0;
    if(typeof loadOffers==='function')await loadOffers('Offen');await refreshOfferCounts60(true);
    if(typeof d3Notice==='function')d3Notice('✓ Angebot wurde zu „Angebote zu erstellen“ verschoben.','ok');
  }catch(e){if(typeof d3Notice==='function')d3Notice(e.message,'error');else alert(e.message);}return false;
};
window.d3OfferCreated=function(offerId){
  const r=d3Offer(offerId);
  d3Form('Angebot erstellt – Reminder festlegen',[
    {name:'customer',label:'Kunde',required:true},{name:'offerNumber',label:'Angebotsnummer',required:true},{name:'phone',label:'Telefon'},
    {name:'email',label:'E-Mail',type:'email'},{name:'description',label:'Beschreibung',type:'textarea'},
    {name:'reminderDays',label:'Erinnerung in Tagen (1–90)',type:'number',required:true}
  ],Object.assign({},r,{reminderDays:5}),async item=>{
    const days=Number(item.reminderDays);if(!(days>=1&&days<=90))throw new Error('Bitte 1 bis 90 Tage für den Reminder eintragen.');
    item.reminderDays=days;await api(chefPayload({action:'saveOfferCreatedWithReminder',offerId:offerId,item:item}));offerCountAt60=0;
    await loadOffers('Zu erstellen');await refreshOfferCounts60(true);
  });
};
window.loadOffers=async function(stage='Offen'){
  const id=stage==='Offen'?'d3OfferOpen':stage==='Zu erstellen'?'d3OfferCreate':'d3OfferArchive';
  setMessage(id+'Status','Angebote werden geladen ...','info');
  try{
    const jobs=[api(chefPayload({action:'getOfferReports',stage:stage}))];if(stage==='Offen')jobs.push(api(chefPayload({action:'getOfferReminders',includeDone:false})));
    const got=await Promise.all(jobs),rows=got[0]||[],reminders=got[1]||[];if(window.DG3){DG3.offers=DG3.offers||{};DG3.offers[stage]=rows;}
    const reminderByOffer={};reminders.forEach(x=>{if(x&&x.offerId)reminderByOffer[x.offerId]=x;});
    q60(id+'List').innerHTML=rows.map((r,i)=>{
      let buttons='';
      if(stage==='Offen')buttons=d3Button('Angenommen','d3OfferDecision',[r.offerId,true],'success')+d3Button('Abgelehnt','d3OfferDecision',[r.offerId,false],'secondary')+d3Button('Zu „Angebote zu erstellen“','d3MoveOfferBackToCreate',[r.offerId],'danger');
      if(stage==='Zu erstellen')buttons=d3Button('Angebot erstellt','d3OfferCreated',[r.offerId],'success')+d3Button('Auftrag entfernen','d3DiscardOffer',[r.offerId],'danger');
      const rem=stage==='Offen'?reminderByOffer[r.offerId]:null,due=rem&&rem.dueDate?(typeof formatDateDE==='function'?formatDateDE(rem.dueDate):rem.dueDate):'';
      const reminderInfo=stage!=='Offen'?'':rem?'<div class="dg60-reminder-ok">Reminder verknüpft · fällig '+esc60(due)+'</div>':'<div class="dg60-reminder-warn">⚠ Kein offener Reminder verknüpft. Falls dieses Angebot wirklich versendet wurde: zurück zu „Angebote zu erstellen“ verschieben und erneut „Angebot erstellt“ wählen.</div>';
      return '<div class="report-card'+(i%2?' d3-alt':'')+'"><strong>'+esc(r.customer)+'</strong><div class="report-meta">'+esc(r.status)+' - '+Number(r.reportCount||0)+' Berichte - '+formatHours(r.totalHours)+' Std.</div><div>'+esc(r.description||'')+'</div>'+((r.reports||[]).length?'<details><summary>Einzelberichte anzeigen</summary>'+r.reports.map(d3Single).join('')+'</details>':'<div class="muted small">Angebot ohne bereits erfasste Arbeitszeit.</div>')+reminderInfo+'<div class="report-actions">'+buttons+'</div></div>';
    }).join('')||'Keine Angebote vorhanden.';
    setMessage(id+'Status',rows.length+' Angebot(e) geladen.','ok');offerCountAt60=Date.now();
    if(stage==='Offen')setMenuCount60('d3OfferOpen','Offene Angebote',rows.length);
    if(stage==='Zu erstellen'){setMenuCount60('d3OfferCreate','Angebote zu erstellen',rows.length);if(window.DG3)DG3.offerCounts=Object.assign({},DG3.offerCounts,{create:rows.length});if(typeof d3Count==='function')d3Count('offers',rows.length);relabelDashboard60();}
    if(stage==='Archiv')setMenuCount60('d3OfferArchive','Angebotsarchiv',rows.length);
  }catch(e){setMessage(id+'Status',e.message,'error');}
};

/* Bestehende Angebotsaktionen nur einmal um Zaehler-Invalidierung erweitern. */
[['d3OfferDecision'],['d3DiscardOffer'],['d3ReminderDecision']].forEach(([name])=>{
  const old=window[name];if(typeof old!=='function'||old.__dg60Wrapped)return;
  const wrapped=async function(){const r=await old.apply(this,arguments);offerCountAt60=0;await refreshOfferCounts60(true);return r;};wrapped.__dg60Wrapped=true;window[name]=wrapped;
});

/* ---------- Regieberichte ----------
   GS >=5.2.0.4 liefert historische, bereits abgerechnete Teilberichte serverseitig direkt mit.
   Die frühere N+1-Nachladung (getObjectReports je Kundenkarte) entfällt vollständig. */
const baseSingle60=window.d3Single;
if(typeof baseSingle60==='function'&&!baseSingle60.__dg60Wrapped){
  const wrapped=function(r){
    let html=baseSingle60(r);if(String(r&&r.status||'')!=='Abgerechnet'||/Bereits abgerechnet/.test(html))return html;
    const note='<div class="muted small" style="margin-top:4px;font-weight:800">✓ Bereits abgerechnet'+(r&&r.billedAt?' · '+esc(r.billedAt):'')+'</div>';
    return html.replace('</div>',note+'</div>');
  };wrapped.__dg60Wrapped=true;window.d3Single=d3Single=wrapped;
}
function regieRoot60(view){return q60(view==='Laufend'?'d3RunningList':'regieResult');}
window.requestMergeSelectedRegieReports=async function(view){
  const v=view||((window.DG3&&DG3.active)||'Abgeschlossen'),root=regieRoot60(v);if(!root)return false;
  const boxes=[...root.querySelectorAll('.regie-merge-select:checked')];
  const ids=[...new Set(boxes.flatMap(x=>String(x.dataset.objectIds||'').split(',').map(s=>s.trim()).filter(Boolean)))];
  if(ids.length<2){alert('Bitte mindestens zwei Kundenkarten im aktuell geöffneten Bereich markieren.');return false;}
  if(!confirm('Die '+boxes.length+' markierten Kundenkarten wirklich zusammenführen?'))return false;
  try{
    if(typeof d3Notice==='function')d3Notice('Regieberichte werden zusammengeführt ...','info');
    await api(chefPayload({action:'mergeRegieObjects',objectIds:ids}));boxes.forEach(x=>x.checked=false);
    await window.loadRegieReports(v);if(typeof d3Dashboard==='function')await d3Dashboard(true);
    if(typeof d3Notice==='function')d3Notice('✓ Regieberichte wurden zusammengeführt.','ok');
  }catch(e){if(typeof d3Notice==='function')d3Notice(e.message,'error');else alert(e.message);}return false;
};

/* ---------- Büroansicht / zweites Fenster ---------- */
function bossAllowed60(){try{return localStorage.getItem('dg_chef_access')==='1';}catch(_e){return false;}}
function bossVisible60(){const e=q60('bossView');return !!e&&!e.classList.contains('hidden');}
function setView60(v){try{sessionStorage.setItem(DG60_VIEW_KEY,v);}catch(_e){}}
function getView60(){try{return sessionStorage.getItem(DG60_VIEW_KEY)||sessionStorage.getItem('dg530_view')||'';}catch(_e){return '';}}
function setOfficeState60(id,child){try{sessionStorage.setItem(DG60_OFFICE_STATE_KEY,JSON.stringify({id:id||'',child:child||''}));}catch(_e){}}
function getOfficeState60(){try{return JSON.parse(sessionStorage.getItem(DG60_OFFICE_STATE_KEY)||sessionStorage.getItem('dg530_office_state')||'{}')||{};}catch(_e){return {};}}
function forcedOffice60(){try{return new URL(location.href).searchParams.get('dgOffice')==='1';}catch(_e){return false;}}
function cleanUrl60(){try{const u=new URL(location.href);u.searchParams.delete('dgOffice');u.searchParams.delete('dgWindow');history.replaceState(null,'',u.pathname+(u.search||'')+u.hash);}catch(_e){}}
function openSecond60(){
  setView60('boss');let u;try{u=new URL(location.href);}catch(_e){return;}u.searchParams.set('dgOffice','1');u.searchParams.set('dgWindow',Date.now());
  const w=window.open(u.href,'_blank','width=1500,height=950,resizable=yes,scrollbars=yes');if(!w)alert('Das neue Fenster wurde vom Browser blockiert. Bitte Pop-ups für diese App erlauben.');
}
function toolbar60(){
  const boss=q60('bossView');if(!boss)return;
  ['dg528OfficeToolbar','dg529OfficeToolbar','dg530OfficeToolbar'].forEach(id=>q60(id)?.remove());if(q60('dg60OfficeToolbar'))return;
  const bar=document.createElement('div');bar.id='dg60OfficeToolbar';const b=document.createElement('button');b.id='dg60OpenWindow';b.type='button';b.textContent='App erneut in neuem Fenster öffnen';b.addEventListener('click',openSecond60);bar.appendChild(b);boss.insertBefore(bar,boss.firstChild);
}
function forceBossVisual60(){
  if(!bossAllowed60())return false;const employee=q60('employeeView'),boss=q60('bossView'),et=q60('employeeTab'),bt=q60('bossTab');if(!employee||!boss)return false;
  employee.classList.add('hidden');boss.classList.remove('hidden');et?.classList.remove('active');bt?.classList.add('active');setView60('boss');toolbar60();return true;
}
async function restoreBoss60(){
  if(!forceBossVisual60())return;relabelDashboard60();
  const s=getOfficeState60();
  if(s.id&&typeof window.d3Open==='function'&&q60(s.id)){try{await Promise.resolve(window.d3Open(s.id,s.child||undefined));}catch(_e){}}
  else if(typeof window.d3Dashboard==='function'){try{await d3Dashboard();}catch(_e){}}
}
const baseShowBoss60=window.showBoss;
if(typeof baseShowBoss60==='function'&&!baseShowBoss60.__dg60Wrapped){const wrapped=function(){setView60('boss');const r=baseShowBoss60.apply(this,arguments);toolbar60();relabelDashboard60();return r;};wrapped.__dg60Wrapped=true;window.showBoss=wrapped;}
document.addEventListener('click',function(ev){
  const t=ev.target&&ev.target.closest?ev.target.closest('#bossTab,#employeeTab'):null;if(!t)return;if(t.id==='bossTab')setView60('boss');else setView60('employee');
},true);
window.addEventListener('pagehide',()=>{if(bossVisible60())setView60('boss');});window.addEventListener('beforeunload',()=>{if(bossVisible60())setView60('boss');});

/* Ein gemeinsamer d3Open-Wrapper ersetzt die bisherigen Angebots- und Büro-Wrapper. */
const baseOpen60=window.d3Open;
if(typeof baseOpen60==='function'&&!baseOpen60.__dg60Wrapped){
  const wrapped=function(id,child){
    if(bossVisible60())setOfficeState60(id,child);
    const r=baseOpen60.apply(this,arguments);
    if(id==='d3Offers')setTimeout(()=>refreshOfferCounts60(false),0);
    return r;
  };wrapped.__dg60Wrapped=true;window.d3Open=d3Open=wrapped;
}

function boot60(){
  css60();stampVersion60();toolbar60();relabelDashboard60();
  try{if(!sessionStorage.getItem(DG60_VIEW_KEY)&&sessionStorage.getItem('dg530_view'))sessionStorage.setItem(DG60_VIEW_KEY,sessionStorage.getItem('dg530_view'));}catch(_e){}
  const wantBoss=forcedOffice60()||getView60()==='boss';if(forcedOffice60())setView60('boss');
  if(wantBoss&&bossAllowed60())requestAnimationFrame(()=>{restoreBoss60().finally(cleanUrl60);});else cleanUrl60();
  /* Keine Angebots-/Regie-Zusatzabfragen beim Start. Daten werden nur geladen, wenn der Bereich sichtbar ist. */
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot60,{once:true});else boot60();
})();
