/* DG Zeiterfassung 5.2.6 - Angebotsbereich: richtige Kachel, Bereichszaehler, Rueckverschieben und Reminder-Tage */
(function(){
'use strict';
const V526='5.2.6';
const MIN_BACKEND526=[5,2,0,3];
const q526=id=>document.getElementById(id);
const esc526=v=>String(v==null?'':v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let countsBusy526=false;

function css526(){
  if(q526('dg526Css'))return;
  const s=document.createElement('style');
  s.id='dg526Css';
  s.textContent=`
    .dg526-menu-count{display:inline-flex;align-items:center;justify-content:center;min-width:24px;height:24px;padding:0 7px;margin-left:7px;border-radius:999px;background:#e2e8f0;color:#334155;font-size:12px;font-weight:900;vertical-align:middle}
    .dg526-reminder-ok{margin-top:8px;padding:8px 10px;border-radius:10px;background:#f0fdf4;color:#166534;font-size:12px;font-weight:800}
    .dg526-reminder-warn{margin-top:8px;padding:8px 10px;border-radius:10px;background:#fff7ed;color:#9a3412;font-size:12px;font-weight:800}
  `;
  document.head.appendChild(s);
}

function offerMenuButton526(panelId){return document.querySelector('#d3Offers .d3-menu [data-panel="'+panelId+'"]');}
function setMenuCount526(panelId,label,n){
  const b=offerMenuButton526(panelId);if(!b)return;
  b.innerHTML=esc526(label)+' <span class="dg526-menu-count">'+Number(n||0)+'</span>';
}
function relabelDashboard526(){
  const t=document.querySelector('#bossView .d3-dashboard .d3-tile.offers span');
  if(t)t.textContent='Angebote zu erstellen';
}
function updateVersion526(){
  document.title='DG Zeiterfassung '+V526;
  const login=document.querySelector('#loginScreen .center.muted.small');if(login)login.textContent='Version '+V526;
  const hero=document.querySelector('#mainScreen .hero .head-row strong');if(hero)hero.textContent='Zeiterfassung - '+V526;
  try{window.DG_APP_VERSION=V526;if(window.DG3)DG3.version=V526;}catch(_e){}
}
function versionAtLeast526(found){
  const p=String(found||'').split('.').map(x=>Number(x)||0);
  for(let i=0;i<MIN_BACKEND526.length;i++){if((p[i]||0)>MIN_BACKEND526[i])return true;if((p[i]||0)<MIN_BACKEND526[i])return false;}
  return true;
}

async function refreshOfferCounts526(){
  if(countsBusy526||typeof api!=='function'||typeof chefPayload!=='function'||!navigator.onLine)return;
  countsBusy526=true;
  try{
    const stages=['Offen','Zu erstellen','Archiv'];
    const rows=await Promise.all(stages.map(stage=>api(chefPayload({action:'getOfferReports',stage}))));
    if(window.DG3&&DG3.offers){DG3.offers.Offen=rows[0];DG3.offers['Zu erstellen']=rows[1];DG3.offers.Archiv=rows[2];DG3.offerCounts={open:rows[0].length,create:rows[1].length};}
    setMenuCount526('d3OfferOpen','Offene Angebote',rows[0].length);
    setMenuCount526('d3OfferCreate','Angebote zu erstellen',rows[1].length);
    setMenuCount526('d3OfferArchive','Angebotsarchiv',rows[2].length);
    if(typeof d3Count==='function')d3Count('offers',rows[1].length);
    relabelDashboard526();
  }catch(_e){}finally{countsBusy526=false;}
}
window.dg526RefreshOfferCounts=refreshOfferCounts526;

/* Die Angebots-Kachel ist jetzt eine Arbeitskachel fuer die noch zu erstellenden Angebote. */
window.d3OfferTileOpen=function(){
  if(typeof d3TileOpen==='function')d3TileOpen('d3Offers','d3OfferCreate');
  else if(typeof d3Open==='function')d3Open('d3Offers','d3OfferCreate');
};

window.d3MoveOfferBackToCreate=async function(offerId){
  if(!confirm('Dieses offene Angebot wirklich zurück zu „Angebote zu erstellen“ verschieben? Ein offener Reminder wird dabei beendet.'))return false;
  try{
    await api(chefPayload({action:'moveOfferBackToCreate',offerId:String(offerId||'')}));
    if(typeof loadOffers==='function')await loadOffers('Offen');
    await refreshOfferCounts526();
    if(typeof d3Notice==='function')d3Notice('✓ Angebot wurde zu „Angebote zu erstellen“ verschoben.','ok');
  }catch(e){if(typeof d3Notice==='function')d3Notice(e.message,'error');else alert(e.message);}
  return false;
};

window.d3OfferCreated=function(offerId){
  const r=d3Offer(offerId);
  d3Form('Angebot erstellt – Reminder festlegen',[
    {name:'customer',label:'Kunde',required:true},
    {name:'offerNumber',label:'Angebotsnummer',required:true},
    {name:'phone',label:'Telefon'},
    {name:'email',label:'E-Mail',type:'email'},
    {name:'description',label:'Beschreibung',type:'textarea'},
    {name:'reminderDays',label:'Erinnerung in Tagen (1–90)',type:'number',required:true}
  ],Object.assign({},r,{reminderDays:5}),async item=>{
    const days=Number(item.reminderDays);
    if(!(days>=1&&days<=90))throw new Error('Bitte 1 bis 90 Tage für den Reminder eintragen.');
    item.reminderDays=days;
    await api(chefPayload({action:'saveOfferCreatedWithReminder',offerId,item}));
    await loadOffers('Zu erstellen');
    await refreshOfferCounts526();
  });
};

window.loadOffers=async function(stage='Offen'){
  const id=stage==='Offen'?'d3OfferOpen':stage==='Zu erstellen'?'d3OfferCreate':'d3OfferArchive';
  setMessage(id+'Status','Angebote werden geladen ...','info');
  try{
    const jobs=[api(chefPayload({action:'getOfferReports',stage}))];
    if(stage==='Offen')jobs.push(api(chefPayload({action:'getOfferReminders',includeDone:false})));
    const got=await Promise.all(jobs),rows=got[0]||[],reminders=got[1]||[];
    if(window.DG3&&DG3.offers)DG3.offers[stage]=rows;
    const reminderByOffer={};reminders.forEach(x=>{if(x&&x.offerId)reminderByOffer[x.offerId]=x;});
    q526(id+'List').innerHTML=rows.map((r,i)=>{
      let buttons='';
      if(stage==='Offen')buttons=d3Button('Angenommen','d3OfferDecision',[r.offerId,true],'success')+d3Button('Abgelehnt','d3OfferDecision',[r.offerId,false],'secondary')+d3Button('Zu „Angebote zu erstellen“','d3MoveOfferBackToCreate',[r.offerId],'danger');
      if(stage==='Zu erstellen')buttons=d3Button('Angebot erstellt','d3OfferCreated',[r.offerId],'success')+d3Button('Auftrag entfernen','d3DiscardOffer',[r.offerId],'danger');
      const rem=stage==='Offen'?reminderByOffer[r.offerId]:null;
      const due=rem&&rem.dueDate?(typeof formatDateDE==='function'?formatDateDE(rem.dueDate):rem.dueDate):'';
      const reminderInfo=stage!=='Offen'?'':rem?'<div class="dg526-reminder-ok">Reminder verknüpft · fällig '+esc526(due)+'</div>':'<div class="dg526-reminder-warn">⚠ Kein offener Reminder verknüpft. Falls dieses Angebot wirklich versendet wurde: zurück zu „Angebote zu erstellen“ verschieben und erneut „Angebot erstellt“ wählen.</div>';
      return '<div class="report-card'+(i%2?' d3-alt':'')+'"><strong>'+esc(r.customer)+'</strong><div class="report-meta">'+esc(r.status)+' - '+Number(r.reportCount||0)+' Berichte - '+formatHours(r.totalHours)+' Std.</div><div>'+esc(r.description||'')+'</div>'+((r.reports||[]).length?'<details><summary>Einzelberichte anzeigen</summary>'+r.reports.map(d3Single).join('')+'</details>':'<div class="muted small">Angebot ohne bereits erfasste Arbeitszeit.</div>')+reminderInfo+'<div class="report-actions">'+buttons+'</div></div>';
    }).join('')||'Keine Angebote vorhanden.';
    setMessage(id+'Status',rows.length+' Angebot(e) geladen.','ok');
    if(stage==='Offen')setMenuCount526('d3OfferOpen','Offene Angebote',rows.length);
    if(stage==='Zu erstellen'){setMenuCount526('d3OfferCreate','Angebote zu erstellen',rows.length);if(window.DG3)DG3.offerCounts=Object.assign({},DG3.offerCounts,{create:rows.length});if(typeof d3Count==='function')d3Count('offers',rows.length);relabelDashboard526();}
    if(stage==='Archiv')setMenuCount526('d3OfferArchive','Angebotsarchiv',rows.length);
  }catch(e){setMessage(id+'Status',e.message,'error');}
};

const oldDashboard526=window.d3Dashboard;
if(typeof oldDashboard526==='function')window.d3Dashboard=async function(){const r=await oldDashboard526.apply(this,arguments);await refreshOfferCounts526();return r;};
const oldOpen526=window.d3Open;
if(typeof oldOpen526==='function')window.d3Open=function(id,child){const r=oldOpen526.apply(this,arguments);if(id==='d3Offers')setTimeout(refreshOfferCounts526,0);return r;};
const oldDecision526=window.d3OfferDecision;
if(typeof oldDecision526==='function')window.d3OfferDecision=async function(){const r=await oldDecision526.apply(this,arguments);await refreshOfferCounts526();return r;};
const oldDiscard526=window.d3DiscardOffer;
if(typeof oldDiscard526==='function')window.d3DiscardOffer=async function(){const r=await oldDiscard526.apply(this,arguments);await refreshOfferCounts526();return r;};
const oldReminderDecision526=window.d3ReminderDecision;
if(typeof oldReminderDecision526==='function')window.d3ReminderDecision=async function(){const r=await oldReminderDecision526.apply(this,arguments);await refreshOfferCounts526();return r;};

/* 5.2.6 benoetigt die neuen Angebots-/Reminder-Aktionen aus GS 5.2.0.3. */
window.d3CheckBackend=d3CheckBackend=async function(force){
  try{
    const r=await api({action:'ping'}),found=String(r&&r.version||''),ok=versionAtLeast526(found);
    DG3.backend=ok?found:'';
    if(ok){try{sessionStorage.setItem('dg51_backend',JSON.stringify({ts:Date.now(),version:found}));}catch(_e){}q526('d3Notice')?.remove();return true;}
    if(typeof d3Notice==='function')d3Notice('App '+V526+' benötigt Google-GS 5.2.0.3 oder neuer. Gefunden: '+(found||'unbekannt')+'. Speichern ist gesperrt.','warn');
    return false;
  }catch(e){DG3.backend='';if(typeof d3Notice==='function')d3Notice('Verbindungsprüfung fehlgeschlagen: '+e.message,'warn');return false;}
};

function boot526(){
  css526();updateVersion526();relabelDashboard526();
  setTimeout(refreshOfferCounts526,250);setTimeout(refreshOfferCounts526,1600);
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot526);else boot526();
})();
