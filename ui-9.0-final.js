/* DG Zeiterfassung 9.0 - UI Hotfix 1
   Dashboard tile typography + weekly grouping of employee day closures. */
(function(){
'use strict';
const V='8.0-ui1';
const $=id=>document.getElementById(id);

function ensureCss(){
  if($('dg80UiHotfixCss'))return;
  const s=document.createElement('style');
  s.id='dg80UiHotfixCss';
  s.textContent=
    '.d3-dashboard{align-items:stretch!important}'+
    '.d3-tile{min-width:0!important;overflow:hidden!important;padding:14px 12px!important;gap:10px!important}'+
    '.d3-tile>span{font-size:14px!important;line-height:1.15!important;word-break:normal!important;overflow-wrap:normal!important;hyphens:none!important;white-space:normal!important;max-width:100%!important}'+
    '.d3-tile.completed>span,.d3-tile.days>span,.d3-tile.payroll>span{font-size:13px!important}'+
    '.d3-tile>strong{font-size:28px!important;line-height:1.04!important;word-break:normal!important;overflow-wrap:normal!important;hyphens:none!important;white-space:normal!important;max-width:100%!important}'+
    '.d3-tile.payroll>strong{font-size:22px!important;line-height:1.08!important}'+
    '.dg80-week-heading{grid-column:1/-1!important;background:#eef3f8;border:1px solid #d7dde7;border-radius:10px;padding:9px 12px;margin:6px 0 0;font-weight:900;color:#31589e;font-size:15px;line-height:1.2}'+
    '.dg48-day-grid>.dg80-week-heading:first-child{margin-top:0}'+
    '@media(min-width:1100px){.d3-dashboard{grid-template-columns:repeat(7,minmax(145px,1fr))!important}.d3-tile>span{font-size:13px!important}.d3-tile.completed>span,.d3-tile.days>span,.d3-tile.payroll>span{font-size:12.5px!important}.d3-tile>strong{font-size:26px!important}.d3-tile.payroll>strong{font-size:20px!important}}'+
    '@media(min-width:760px) and (max-width:1099px){.d3-dashboard{grid-template-columns:repeat(4,minmax(150px,1fr))!important}.d3-tile>span{font-size:13px!important}.d3-tile>strong{font-size:25px!important}}'+
    '@media(max-width:759px){.d3-dashboard{grid-template-columns:repeat(2,minmax(0,1fr))!important}.d3-tile>span{font-size:13px!important}.d3-tile>strong{font-size:24px!important}.dg80-week-heading{font-size:14px}}';
  document.head.appendChild(s);
}
function parseDate(v){
  const p=String(v||'').split('-').map(Number);
  if(p.length!==3||!p[0]||!p[1]||!p[2])return null;
  return new Date(p[0],p[1]-1,p[2],12);
}
function addDays(d,n){const x=new Date(d.getFullYear(),d.getMonth(),d.getDate(),12);x.setDate(x.getDate()+n);return x;}
function iso(d){return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');}
function deDate(d){return String(d.getDate()).padStart(2,'0')+'.'+String(d.getMonth()+1).padStart(2,'0')+'.'+d.getFullYear();}
function mondayOf(d){
  const day=d.getDay()===0?7:d.getDay();
  return addDays(d,1-day);
}
function groupWeeks(rows){
  const boxes=[...document.querySelectorAll('#dg48DayResult .dg48-days-employee')];
  (rows||[]).forEach((emp,ei)=>{
    const box=boxes[ei];if(!box)return;
    const grid=box.querySelector(':scope > .dg48-day-grid');
    if(!grid)return;
    grid.querySelectorAll(':scope > .dg80-week-heading').forEach(x=>x.remove());
    const cards=[...grid.querySelectorAll(':scope > .dg48-day')];
    const pairs=(emp.days||[]).map((day,i)=>({day,card:cards[i]})).filter(x=>x.card&&parseDate(x.day&&x.day.date));
    pairs.sort((a,b)=>String(a.day.date).localeCompare(String(b.day.date)));
    let weekKey='';
    pairs.forEach(pair=>{
      const d=parseDate(pair.day.date),m=mondayOf(d),sun=addDays(m,6),key=iso(m);
      if(key!==weekKey){
        weekKey=key;
        const h=document.createElement('div');
        h.className='dg80-week-heading';
        h.textContent='Woche von '+deDate(m)+' bis '+deDate(sun);
        grid.appendChild(h);
      }
      grid.appendChild(pair.card);
    });
    grid.dataset.dg80Weeks='1';
  });
}
function installRenderer(){
  if(window.__DG80_WEEK_RENDER_WRAP||typeof window.renderBossDayClosuresV48!=='function')return;
  window.__DG80_WEEK_RENDER_WRAP=true;
  const base=window.renderBossDayClosuresV48;
  window.renderBossDayClosuresV48=function(rows){
    const r=base.apply(this,arguments);
    try{groupWeeks(rows||[]);}catch(e){console.warn('DG 8.0 Wochenansicht',e);}
    return r;
  };
}
function install(){
  ensureCss();
  installRenderer();
  document.documentElement.dataset.dgUiHotfix=V;
}
window.dg80UiHotfixInstall=install;
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});else install();

})();


/* DG Zeiterfassung 9.0 - UI Hotfix 2
   Office tile shell, lossless collapse/drafts, standalone payroll, payroll-cycle counter and calendar refresh repair. */
(function(){
'use strict';
const V='8.0-ui2';
const API_URL_80='https://dg-app-10-api-production.up.railway.app/';
const q=id=>document.getElementById(id);
const S=window.DG80_UI2=window.DG80_UI2||{active:'',dirty:new Set(),lastDirty:{},calendarPromise:null,counterPromise:null,dragKey:'',installed:false};

const CATALOG=[
  {key:'calendar',label:'Mitarbeiter Kalender',panel:'dg62PlannerCard',cls:'calendar',counter:null,loader:'dg62Load'},
  {key:'completed',label:'Rechnung zu erstellen',panel:'d3Completed',cls:'completed',counter:'d3Count-completed',loader:'d3Reports',args:['Abgeschlossen']},
  {key:'billed',label:'Abgerechnete Aufträge',panel:'d3Completed',cls:'billed',counter:null,loader:'d3Reports',args:['Abgerechnet']},
  {key:'running',label:'Laufende Aufträge',panel:'d3Running',cls:'running',counter:'d3Count-running',loader:'d3Reports',args:['Laufend']},
  {key:'offerCreate',label:'Zu erstellende Angebote',parent:'d3Offers',child:'d3OfferCreate',cls:'offers',counter:'d3Count-offers',loader:'loadOffers',args:['Zu erstellen']},
  {key:'offerOpen',label:'Erstellte Angebote',parent:'d3Offers',child:'d3OfferOpen',cls:'offer-open',counter:null,loader:'loadOffers',args:['Offen']},
  {key:'offerArchive',label:'Angebotsarchiv',parent:'d3Offers',child:'d3OfferArchive',cls:'offer-archive',counter:null,loader:'loadOffers',args:['Archiv']},
  {key:'offerStats',label:'Angebotsstatistik',parent:'d3Offers',child:'d3Stats',cls:'offer-stats',counter:null,loader:'loadStats'},
  {key:'shopping',label:'Einkaufsliste',special:'shopping',cls:'shopping',counter:'d3Count-shopping'},
  {key:'maintenance',label:'Wartungen',panel:'d36Maintenance',cls:'maintenance',counter:'d3Count-maintenance',loader:'d36LoadMaintenance'},
  {key:'partnerNetwork',label:'Partnernetzwerk',panel:'dg10Partner',cls:'partner-network',counter:'dg80c-partnerNetwork',loader:'loadPartner10'},
  {key:'days',label:'Offene Tagesabschlüsse',parent:'d3Admin',child:'dg48EmployeeClosures',cls:'days',counter:'d3Count-days',loader:'loadBossDayClosuresV48'},
  {key:'payroll',label:'Monatsabschluss & Lohnübergabe',panel:'d3PayrollStandalone',cls:'payroll',counter:'dg80TopPayroll',loader:'dg80PayrollInstall'},
  {key:'absence',label:'Urlaub / Abwesenheiten / Feiertage',parent:'d3Admin',child:'dg48AbsenceGroup',cls:'absence',counter:null,loader:'loadChefAdministration'},
  {key:'sickness',label:'Krank-Fristen',parent:'d3Admin',child:'dg48AbsenceGroup',cls:'sickness734',counter:'d3Count-sickness734',loader:'loadChefAdministration',after:'sickness'},
  {key:'employeeAdmin',label:'Mitarbeiterverwaltung',parent:'d3Admin',child:'d3EmployeeAdmin',cls:'employee-admin',counter:null,loader:'loadChefAdministration'},
  {key:'employeeStats',label:'Mitarbeiter Auswertungen',panel:'dg80EmployeeStats',cls:'employee-stats',counter:null,loader:'dg80EmployeeStatsLoad'},
  {key:'websiteInquiries',label:'Webseiten Anfragen',panel:'dg80WebsiteInquiries',cls:'website-inquiries',counter:null,loader:'dg80WebsiteInquiriesLoad'},
  {key:'whatsappInquiries',label:'WhatsApp',panel:'dg80WhatsappInquiries',cls:'whatsapp-inquiries',counter:null,loader:'dg80WhatsappInquiriesLoad'},
  {key:'reminders',label:'Reminder',panel:'d3Reminder',cls:'reminders',counter:'d3Count-reminders',loader:'loadReminders'},
  {key:'inquiries',label:'Offene Anfragen',parent:'d3InquiriesGroup',child:'d3Inquiries',fallback:'d3Inquiries',cls:'inquiries',counter:'d3Count-inquiries',loader:'d3Inquiries'},
  {key:'inquiryArchive',label:'Anfragenarchiv',parent:'d3InquiriesGroup',child:'d3InquiryArchive',cls:'inquiry-archive',counter:null,loader:'d3InquiryArchiveList'},
  {key:'aqon',label:'AQON PURE Anfragen',parent:'d3InquiriesGroup',child:'d34AqonInquiries',cls:'aqon',counter:null,loader:'d34AqonInquiries'},
  {key:'health',label:'Systemcheck',panel:'d3Health',cls:'health',counter:null,loader:'d3Health'}
];

function employeeKey(){return String(localStorage.getItem('dg_employee')||'geraet').replace(/[^A-Za-z0-9_-]+/g,'_');}
function orderKey(){return 'dg80_office_tile_order_'+employeeKey();}
function cfg(key){return CATALOG.find(x=>x.key===key)||null;}
function fn(name){return name&&typeof window[name]==='function'?window[name]:null;}
function visible(el){return !!(el&&el.getClientRects&&el.getClientRects().length);}
function root(){return q('bossView');}
function dashboard(){return root()?.querySelector(':scope > .d3-dashboard');}
function esc(v){return String(v==null?'':v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function fmtHours80(v){try{return typeof formatHours==='function'?formatHours(v):Number(v||0).toFixed(2).replace('.',',');}catch(_e){return Number(v||0).toFixed(2).replace('.',',');}}
function de80(v){const p=String(v||'').split('-');return p.length===3?p[2]+'.'+p[1]+'.'+p[0]:String(v||'');}

function addCss(){
  if(q('dg80Ui2Css'))return;
  const s=document.createElement('style');s.id='dg80Ui2Css';
  s.textContent=''
    +'#bossView.dg80-office-shell>.card{display:none!important}'
    +'#bossView.dg80-office-shell>.card.dg80-shell-active{display:block!important}'
    +'#bossView.dg80-office-shell>.dg80-office-toolbar{display:none!important}'
    +'#bossView.dg80-office-shell>.dg80-office-toolbar.active{display:block!important}'
    +'#bossView .dg80-office-dashboard{grid-template-columns:repeat(auto-fit,minmax(145px,1fr))!important;gap:12px!important;align-items:stretch!important}'
    +'#bossView .dg80-office-dashboard .d3-tile{background:#e8f7ea!important;color:#185c2c!important;border:1px solid #b9e4c1!important;min-height:118px!important;cursor:grab!important;box-shadow:0 4px 14px rgba(15,23,42,.05)!important}'
    +'#bossView .dg80-office-dashboard .d3-tile:active{cursor:grabbing!important}'
    +'#bossView .dg80-office-dashboard .d3-tile:hover{background:#d9f2de!important;border-color:#84cf93!important;transform:translateY(-1px)}'
    +'#bossView .dg80-office-dashboard .d3-tile.dg80-active-tile{outline:3px solid #2f855a!important;box-shadow:0 0 0 5px rgba(47,133,90,.14)!important}'
    +'#bossView .dg80-office-dashboard .d3-tile>span,#bossView .dg80-office-dashboard .d3-tile>strong{color:#185c2c!important}'
    +'#bossView .dg80-office-dashboard .d3-tile.dragging{opacity:.45!important}'
    +'.dg80-office-toolbar{margin:14px 0 10px;padding:14px 16px;background:#fff;border:1px solid #d9e1ea;border-radius:16px;box-shadow:0 5px 18px rgba(15,23,42,.06)}'
    +'.dg80-office-toolbar-head{display:flex;gap:12px;align-items:center;justify-content:space-between;flex-wrap:wrap}'
    +'.dg80-office-toolbar h2{margin:0;color:#31589e;font-size:25px}'
    +'.dg80-office-actions{display:flex;gap:9px;align-items:center;flex-wrap:wrap}'
    +'#dg80SaveChanges{min-width:210px;font-weight:900!important}'
    +'#dg80OfficeClose{width:46px;height:46px;padding:0!important;font-size:28px!important;line-height:1!important;font-weight:900!important}'
    +'.dg80-save-hint{margin-top:8px;font-size:13px;font-weight:800;color:#64748b}'
    +'.dg80-save-hint.dirty{color:#991b1b}'
    +'#bossView .dg80-shell-active>.dg48-head{display:none!important}'
    +'#bossView .dg80-shell-active>.dg48-body{display:block!important}'
    +'#bossView .dg80-shell-active>.dg48-body>.d3-menu{display:none!important}'
    +'#bossView .dg80-shell-active>.dg48-body>.d3-content{min-height:0!important}'
    +'#d3PayrollStandalone>.dg48-body{display:block!important}'
    +'#d3PayrollStandalone #dg520PayrollClose{margin:0!important}'
    +'#employeeMonthlyHours small{display:block;margin-top:5px;font-size:13px;font-weight:700;line-height:1.35}'
    +'@media(max-width:759px){#bossView .dg80-office-dashboard{grid-template-columns:repeat(2,minmax(0,1fr))!important}.dg80-office-toolbar h2{font-size:21px}.dg80-office-actions{width:100%}#dg80SaveChanges{flex:1;min-width:0}}';
  document.head.appendChild(s);
}

function ensurePayrollStandalone(){
  const r=root();if(!r)return null;
  let sec=q('dg520PayrollClose');
  if(!sec){const maker=fn('makePayrollSection520');if(maker){try{sec=maker();}catch(_e){}}}
  if(!sec)return null;
  let card=q('d3PayrollStandalone');
  if(!card){card=document.createElement('div');card.id='d3PayrollStandalone';card.className='card d3-main';card.innerHTML='<div class="dg48-body"></div>';r.appendChild(card);}
  const body=card.querySelector(':scope > .dg48-body')||card;
  if(sec.parentElement!==body)body.appendChild(sec);
  return card;
}

function renameEmployeeClosures(){
  document.querySelectorAll('#d3Admin [data-panel="dg48EmployeeClosures"]').forEach(b=>b.textContent='Mitarbeiter-Abschlüsse');
  const c=q('dg48EmployeeClosures');
  if(c){c.querySelectorAll('h2,h3').forEach(h=>{if(/^Mitarbeiterberichte$/i.test(String(h.textContent||'').trim()))h.textContent='Mitarbeiter-Abschlüsse';});}
}

/* Partnernetzwerk: self-contained office implementation.
   It intentionally does not depend on the legacy core module load order. */
const PARTNER_DEFAULTS80=['Elektriker','Fliesenleger','Trockenbauer','Estrichleger'];
let partnerRows80=[],partnerActive80='';

function partnerCss80(){
  if(q('dg80PartnerCss'))return;
  const s=document.createElement('style');s.id='dg80PartnerCss';
  s.textContent=''
    +'.dg80p-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(190px,1fr));gap:12px;margin:14px 0}'
    +'.dg80p-trade{min-height:78px;border:1px solid #a9d9b4;border-radius:16px;background:#e8f7ea;color:#185c2c;padding:12px;font:inherit;font-weight:900;cursor:pointer;text-align:center}'
    +'.dg80p-trade:hover{background:#d9f2de;border-color:#78c48a;box-shadow:0 0 0 3px rgba(47,133,90,.12)}'
    +'.dg80p-add{font-size:34px;line-height:1;display:flex;align-items:center;justify-content:center}'
    +'.dg80p-head{display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap;margin:10px 0 14px}'
    +'.dg80p-card{border:1px solid #e5e7eb;border-radius:14px;padding:13px;margin:10px 0;background:#fff}'
    +'.dg80p-meta{display:grid;gap:4px;margin-top:7px;color:#64748b;font-size:13px}'
    +'.dg80p-note{margin-top:8px;padding-top:8px;border-top:1px dashed #dbe3ec;color:#64748b;font-size:13px}'
    +'.dg80p-empty{padding:16px;border:1px dashed #cbd5e1;border-radius:12px;color:#64748b;background:#f8fafc}'
    +'.dg80p-overlay{position:fixed;inset:0;z-index:100000;background:rgba(15,23,42,.48);display:flex;align-items:center;justify-content:center;padding:18px}'
    +'.dg80p-modal{width:min(720px,96vw);max-height:92vh;overflow:auto;background:#fff;border-radius:18px;padding:18px;box-shadow:0 24px 70px rgba(15,23,42,.28)}'
    +'.dg80p-modal h3{margin:0 0 14px;color:#31589e}.dg80p-fields{display:grid;grid-template-columns:1fr 1fr;gap:10px 14px}'
    +'.dg80p-field{display:flex;flex-direction:column;gap:5px}.dg80p-field.full{grid-column:1/-1}.dg80p-field label{font-weight:800;color:#334155}'
    +'.dg80p-field input,.dg80p-field textarea{width:100%;box-sizing:border-box;border:1px solid #cbd5e1;border-radius:10px;padding:10px;font:inherit}'
    +'.dg80p-field textarea{min-height:90px;resize:vertical}.dg80p-actions{display:flex;gap:10px;justify-content:flex-end;margin-top:16px;flex-wrap:wrap}'
    +'@media(max-width:650px){.dg80p-grid,.dg80p-fields{grid-template-columns:1fr}.dg80p-field.full{grid-column:1}.dg80p-trade{min-height:66px}}';
  document.head.appendChild(s);
}
function partnerPayload80(extra){
  const employee=String(localStorage.getItem('dg_employee')||'').trim();
  const token=String(localStorage.getItem('dg_device_session')||sessionStorage.getItem('dg_employee_pin')||'').trim();
  if(!employee||!token)throw new Error('Büro-Sitzung fehlt. Bitte einmal neu anmelden.');
  return Object.assign({employee,employeePin:token,deviceSessionToken:token},extra||{});
}
async function partnerRequest80(extra){
  const res=await fetch('https://dg-app-10-api-production.up.railway.app/',{
    method:'POST',headers:{'Content-Type':'text/plain;charset=utf-8'},cache:'no-store',
    body:JSON.stringify(partnerPayload80(extra))
  });
  const txt=await res.text();let j=null;try{j=JSON.parse(txt);}catch(_e){}
  if(!res.ok||!j||j.ok===false)throw new Error((j&&j.error)||('Serverfehler HTTP '+res.status));
  return j.data!==undefined?j.data:j;
}
function partnerModal80(title,fields,onSave){
  partnerCss80();
  q('dg80PartnerModal')?.remove();
  const ov=document.createElement('div');ov.id='dg80PartnerModal';ov.className='dg80p-overlay';
  ov.innerHTML='<form class="dg80p-modal"><h3>'+esc(title)+'</h3><div class="dg80p-fields">'
    +fields.map(f=>'<div class="dg80p-field '+(f.full?'full':'')+'"><label>'+esc(f.label)+(f.required?' *':'')+'</label>'
      +(f.type==='textarea'?'<textarea name="'+esc(f.name)+'" '+(f.required?'required':'')+'></textarea>':'<input name="'+esc(f.name)+'" type="'+esc(f.type||'text')+'" '+(f.required?'required':'')+'>')
      +'</div>').join('')
    +'</div><div id="dg80PartnerModalStatus"></div><div class="dg80p-actions"><button type="button" class="btn secondary" data-cancel>Abbrechen</button><button type="submit" class="btn success">Speichern</button></div></form>';
  document.body.appendChild(ov);
  const form=ov.querySelector('form'),cancel=ov.querySelector('[data-cancel]');
  cancel.addEventListener('click',()=>ov.remove());
  ov.addEventListener('click',e=>{if(e.target===ov)ov.remove();});
  form.addEventListener('submit',async e=>{
    e.preventDefault();
    const save=form.querySelector('[type="submit"]'),st=q('dg80PartnerModalStatus'),data={};
    fields.forEach(f=>data[f.name]=String(form.elements[f.name]?.value||'').trim());
    save.disabled=true;if(st){st.className='status info';st.textContent='Wird gespeichert ...';}
    try{await onSave(data);ov.remove();}catch(err){if(st){st.className='status error';st.textContent=err&&err.message?err.message:String(err);}save.disabled=false;}
  });
  setTimeout(()=>form.querySelector('input,textarea')?.focus(),0);
}
function partnerMeta80(label,value){
  value=String(value||'').trim();return value?'<div><strong>'+esc(label)+':</strong> '+esc(value)+'</div>':'';
}
function partnerCard80(p){
  return '<div class="dg80p-card"><strong>'+esc(p.company||p.contactName||'Partnerbetrieb')+'</strong><div class="dg80p-meta">'
    +partnerMeta80('Ansprechpartner',p.contactName)+partnerMeta80('Telefon',p.phone)+partnerMeta80('Mobil',p.mobile)
    +partnerMeta80('E-Mail',p.email)+partnerMeta80('Adresse',p.address)+partnerMeta80('Website',p.website)
    +'</div>'+(p.notes?'<div class="dg80p-note">'+esc(p.notes)+'</div>':'')+'</div>';
}
function partnerOfficePath80(parent,child,canBack){
  const f=window.dg80OfficeSetPath;
  if(typeof f==='function'){f(parent,child,canBack);return;}
  const title=q('dg80OfficeTitle'),parts=[parent,child].map(x=>String(x||'').trim()).filter(Boolean);
  if(title)title.textContent=parts.join(' > ')||'Büro';
  const back=q('dg80OfficeBack');if(back)back.classList.toggle('hidden',!canBack);
}
function partnerOverview80(){
  partnerCss80();
  const out=q('dg10PartnerBody');if(!out)return;
  partnerActive80='';
  const total=partnerRows80.reduce((n,c)=>n+(Array.isArray(c.partners)?c.partners.length:0),0),counter=q('dg80c-partnerNetwork');
  if(counter)counter.textContent=String(total);
  out.innerHTML='<div class="dg80p-grid">'
    +partnerRows80.map(c=>'<button type="button" class="dg80p-trade" data-dg80p-cat="'+esc(c.id)+'">'+esc(c.name)+'</button>').join('')
    +'<button type="button" class="dg80p-trade dg80p-add" id="dg80PartnerAddTrade" title="Weiteres Gewerk hinzufügen" aria-label="Weiteres Gewerk hinzufügen">+</button></div>';
  out.querySelectorAll('[data-dg80p-cat]').forEach(b=>b.addEventListener('click',()=>partnerTrade80(b.dataset.dg80pCat)));
  q('dg80PartnerAddTrade')?.addEventListener('click',partnerAddTrade80);
  partnerOfficePath80('Partnernetzwerk','',false);
}
function partnerTrade80(id){
  const cat=partnerRows80.find(x=>String(x.id)===String(id)),out=q('dg10PartnerBody');if(!cat||!out)return false;
  partnerActive80=String(id);
  const rows=Array.isArray(cat.partners)?cat.partners:[];
  out.innerHTML='<div class="dg80p-head"><div><h3 style="margin:0">'+esc(cat.name)+'</h3><div class="muted small">'+rows.length+' Partnerbetrieb(e)</div></div>'
    +'<button type="button" class="btn success" id="dg80PartnerAddCompany">+ Partner hinzufügen</button></div>'
    +(rows.map(partnerCard80).join('')||'<div class="dg80p-empty">Noch kein Partnerbetrieb in diesem Gewerk hinterlegt.</div>');
  q('dg80PartnerAddCompany')?.addEventListener('click',()=>partnerAddCompany80(cat.id));
  partnerOfficePath80('Partnernetzwerk',cat.name,true);return true;
}
function partnerAddTrade80(){
  partnerModal80('Weiteres Gewerk hinzufügen',[{name:'name',label:'Gewerk',required:true,full:true}],async v=>{
    if(!v.name)throw new Error('Bitte das Gewerk eintragen.');
    await partnerRequest80({action:'savePartnerCategoryV10',name:v.name});
    await loadPartnerNetwork80();
  });
}
function partnerAddCompany80(categoryId){
  const cat=partnerRows80.find(x=>String(x.id)===String(categoryId));
  partnerModal80('Partner hinzufügen – '+(cat?cat.name:'Gewerk'),[
    {name:'company',label:'Firmenname',required:true},{name:'contactName',label:'Ansprechpartner'},
    {name:'address',label:'Anschrift',full:true},{name:'phone',label:'Telefon'},{name:'mobile',label:'Mobil'},
    {name:'email',label:'E-Mail',type:'email'},{name:'website',label:'Website'},
    {name:'notes',label:'Notizen',type:'textarea',full:true}
  ],async v=>{
    if(!v.company)throw new Error('Bitte den Firmennamen eintragen.');
    await partnerRequest80({action:'savePartnerV10',item:Object.assign({},v,{categoryId:String(categoryId)})});
    await loadPartnerNetwork80();
    partnerTrade80(categoryId);
  });
}
async function loadPartnerNetwork80(){
  ensureDynamicPanel({key:'partnerNetwork'});
  partnerCss80();
  const out=q('dg10PartnerBody'),st=q('dg10PartnerStatus');if(!out)return [];
  if(st){st.className='status info';st.textContent='Partnernetzwerk wird geladen ...';}
  try{
    const rows=await partnerRequest80({action:'getPartnerNetworkV10',force:true});
    partnerRows80=Array.isArray(rows)?rows:[];
    partnerRows80.sort((a,b)=>{
      const ai=PARTNER_DEFAULTS80.indexOf(String(a.name||'')),bi=PARTNER_DEFAULTS80.indexOf(String(b.name||''));
      const ax=ai<0?999:ai,bx=bi<0?999:bi;return ax-bx||Number(a.sortOrder||999)-Number(b.sortOrder||999)||String(a.name||'').localeCompare(String(b.name||''),'de');
    });
    partnerOverview80();
    if(st){st.className='status ok';st.textContent='Partnernetzwerk geladen.';}
    return partnerRows80;
  }catch(err){
    out.innerHTML='';
    if(st){st.className='status error';st.textContent='Partnernetzwerk konnte nicht geladen werden: '+(err&&err.message?err.message:String(err));}
    throw err;
  }
}
function partnerBack80(){
  if(!partnerActive80)return false;
  partnerOverview80();return true;
}
window.loadPartner10=loadPartnerNetwork80;
window.dg10PartnerBack=partnerBack80;
window.dg10OpenTrade=partnerTrade80;
window.dg10AddPartner=partnerAddCompany80;

function ensureDynamicPanel(c){
  if(!c)return;
  if(c.key==='partnerNetwork'&&!q('dg10Partner')){
    const r=root();if(!r)return;
    const card=document.createElement('div');
    card.id='dg10Partner';card.className='card d3-main';
    card.innerHTML='<div class="muted small" style="margin-bottom:10px">Partnerbetriebe nach Gewerk verwalten.</div><div id="dg10PartnerStatus"></div><div id="dg10PartnerBody"></div>';
    r.appendChild(card);
  }
}
function wrapperFor(c){
  if(!c)return null;
  ensureDynamicPanel(c);
  if(c.special)return null;
  if(c.parent){const p=q(c.parent);if(p)return p;}
  if(c.panel&&q(c.panel))return q(c.panel);
  if(c.fallback&&q(c.fallback))return q(c.fallback);
  return null;
}
function available(c){return c.special==='shopping'?!!fn('dg70ShoppingOpen'):!!wrapperFor(c);}
function activeConfigs(){return CATALOG.filter(available);}

function oldValue(c){
  if(c.key==='payroll')return q('dg80TopPayroll')?.textContent||q('d3Count-payroll')?.textContent||'›';
  if(c.counter)return q(c.counter)?.textContent||'›';
  return '›';
}
function tileHtml(c,value){
  const ids=[];
  if(c.key==='payroll')ids.push('<strong id="dg80TopPayroll">'+esc(value||'›')+'</strong><strong id="d3Count-payroll" style="display:none">'+esc(value||'')+'</strong>');
  else if(c.counter)ids.push('<strong id="'+esc(c.counter)+'">'+esc(value||'0')+'</strong>');
  else ids.push('<strong>›</strong>');
  return '<button type="button" draggable="true" class="d3-tile '+esc(c.cls||c.key)+'" data-dg80-key="'+esc(c.key)+'" title="Klicken zum Öffnen · Ziehen zum Sortieren"><span>'+esc(c.label)+'</span>'+ids.join('')+'</button>';
}
function loadOrder(){try{const a=JSON.parse(localStorage.getItem(orderKey())||'[]');return Array.isArray(a)?a:[];}catch(_e){return [];}}
function saveOrder(){const d=dashboard();if(!d)return;try{localStorage.setItem(orderKey(),JSON.stringify([...d.querySelectorAll('[data-dg80-key]')].map(x=>x.dataset.dg80Key)));}catch(_e){}}
function orderedConfigs(list){const order=loadOrder(),pos={};order.forEach((k,i)=>pos[k]=i);return list.slice().sort((a,b)=>{const ai=Object.prototype.hasOwnProperty.call(pos,a.key)?pos[a.key]:9999,bi=Object.prototype.hasOwnProperty.call(pos,b.key)?pos[b.key]:9999;return ai-bi||CATALOG.indexOf(a)-CATALOG.indexOf(b);});}

function wireDashboard(d){
  if(!d||d.dataset.dg80Wired==='1')return;d.dataset.dg80Wired='1';
  d.addEventListener('click',e=>{
    const t=e.target.closest('[data-dg80-key]');if(!t||S.dragKey)return;
    e.preventDefault();e.stopPropagation();openKey(t.dataset.dg80Key);
  });
  d.addEventListener('dragstart',e=>{const t=e.target.closest('[data-dg80-key]');if(!t)return;S.dragKey=t.dataset.dg80Key;t.classList.add('dragging');try{e.dataTransfer.effectAllowed='move';e.dataTransfer.setData('text/plain',S.dragKey);}catch(_e){}});
  d.addEventListener('dragover',e=>{if(!S.dragKey)return;e.preventDefault();const t=e.target.closest('[data-dg80-key]');if(!t||t.dataset.dg80Key===S.dragKey)return;const src=d.querySelector('[data-dg80-key="'+CSS.escape(S.dragKey)+'"]');if(!src)return;const r=t.getBoundingClientRect();const before=e.clientY<r.top+r.height/2||(Math.abs(e.clientY-(r.top+r.height/2))<r.height*.4&&e.clientX<r.left+r.width/2);d.insertBefore(src,before?t:t.nextSibling);});
  d.addEventListener('drop',e=>{if(!S.dragKey)return;e.preventDefault();saveOrder();});
  d.addEventListener('dragend',()=>{d.querySelectorAll('.dragging').forEach(x=>x.classList.remove('dragging'));saveOrder();setTimeout(()=>{S.dragKey='';},80);});
}
function buildDashboard(){
  const r=root();if(!r)return null;
  let d=dashboard();if(!d)return null;
  const vals={};CATALOG.forEach(c=>vals[c.key]=oldValue(c));
  const list=orderedConfigs(activeConfigs());
  d.classList.add('dg80-office-dashboard');
  d.innerHTML=list.map(c=>tileHtml(c,vals[c.key])).join('');
  wireDashboard(d);
  return d;
}

function ensureToolbar(){
  const r=root(),d=dashboard();if(!r||!d)return null;
  let bar=q('dg80OfficeToolbar');
  if(!bar){
    bar=document.createElement('div');bar.id='dg80OfficeToolbar';bar.className='dg80-office-toolbar';
    bar.innerHTML='<div class="dg80-office-toolbar-head"><h2 id="dg80OfficeTitle">Büro</h2><div class="dg80-office-actions"><button id="dg80SaveChanges" type="button" class="btn success">Änderungen Speichern</button><button id="dg80OfficeClose" type="button" class="btn secondary" aria-label="Untermenü schließen" title="Schließen">×</button></div></div><div id="dg80SaveHint" class="dg80-save-hint">Alle Änderungen gespeichert.</div>';
    d.insertAdjacentElement('afterend',bar);
    q('dg80OfficeClose').addEventListener('click',e=>{e.preventDefault();closeActive();});
    q('dg80SaveChanges').addEventListener('click',e=>{e.preventDefault();saveActive();});
  }
  return bar;
}
function paintDirty(){
  const b=q('dg80SaveChanges'),h=q('dg80SaveHint');if(!b||!h)return;
  const dirty=S.dirty.size>0;
  b.classList.toggle('danger',dirty);b.classList.toggle('success',!dirty);
  h.classList.toggle('dirty',dirty);
  if(dirty){const names=[...S.dirty].map(k=>cfg(k)?.label||k);h.textContent='Ungespeicherte Änderungen: '+names.join(', ')+'. Schließen blendet nur aus – die Eingaben bleiben erhalten.';}
  else h.textContent='Alle Änderungen gespeichert.';
}
function markDirty(key,target){if(!key)return;S.dirty.add(key);if(target)S.lastDirty[key]=target;paintDirty();}
function clearDirty(key){if(!key)return;S.dirty.delete(key);delete S.lastDirty[key];paintDirty();}

function selectChild(c,w){
  if(!c||!w)return;
  const child=c.child&&q(c.child);
  if(!child)return;
  w.querySelectorAll('.d3-panel').forEach(p=>p.classList.toggle('hidden',p!==child));
  w.querySelectorAll('[data-panel]').forEach(b=>b.setAttribute('aria-selected',String(b.dataset.panel===c.child)));
  child.classList.remove('hidden');
  const body=child.querySelector(':scope > .dg48-body');if(body)body.classList.remove('hidden');
}
function loader(c){
  if(!c||S.dirty.has(c.key))return Promise.resolve();
  const f=fn(c.loader);if(!f){const g=window.DG3&&DG3.loaders&&(DG3.loaders[c.child]||DG3.loaders[c.panel]||DG3.loaders[c.parent]);return typeof g==='function'?Promise.resolve(g()):Promise.resolve();}
  try{return Promise.resolve(f.apply(window,c.args||[]));}catch(e){return Promise.reject(e);}
}
function afterOpen(c,w){
  if(c.key==='calendar'){
    const details=w.querySelector('.dg62-main');if(details)details.open=true;
    const f=fn('dg62OpenPlanner');if(f)try{f();}catch(_e){}
  }
  if(c.key==='payroll'){
    const f=fn('dg80PayrollInstall');if(f)try{f();}catch(_e){}
  }
  if(c.after==='sickness'){
    const f=fn('ensureAbsenceUi734');if(f)try{f();}catch(_e){}
    setTimeout(()=>q('dg734SicknessAlertList')?.scrollIntoView({block:'nearest'}),80);
  }
}
function closeActive(){
  const r=root();if(!r)return;
  r.querySelectorAll(':scope > .dg80-shell-active').forEach(x=>x.classList.remove('dg80-shell-active'));
  dashboard()?.querySelectorAll('.dg80-active-tile').forEach(x=>x.classList.remove('dg80-active-tile'));
  q('dg80OfficeToolbar')?.classList.remove('active');
  S.active='';if(window.DG3)DG3.open='';paintDirty();
}
function openShopping(c){
  const overlay=q('dg70ShopOverlay'),isOpen=overlay&&getComputedStyle(overlay).display!=='none';
  if(S.active===c.key||isOpen){const close=fn('dg70ShoppingClose');if(close)close();S.active='';dashboard()?.querySelector('[data-dg80-key="shopping"]')?.classList.remove('dg80-active-tile');return;}
  closeActive();const f=fn('dg70ShoppingOpen');if(f){f();S.active=c.key;dashboard()?.querySelector('[data-dg80-key="shopping"]')?.classList.add('dg80-active-tile');}
}
function openKey(key,options){
  const c=cfg(key);if(!c||!available(c))return;
  if(c.special==='shopping'){openShopping(c);return;}
  if(S.active==='shopping'){const close=fn('dg70ShoppingClose');if(close)try{close();}catch(_e){}S.active='';dashboard()?.querySelector('[data-dg80-key="shopping"]')?.classList.remove('dg80-active-tile');}
  if(S.active===key&&!options?.force){closeActive();return;}
  const r=root(),d=dashboard(),bar=ensureToolbar(),w=wrapperFor(c);if(!r||!d||!bar||!w)return;
  r.querySelectorAll(':scope > .dg80-shell-active').forEach(x=>{if(x!==w)x.classList.remove('dg80-shell-active');});
  w.classList.add('dg80-shell-active');selectChild(c,w);
  bar.classList.add('active');q('dg80OfficeTitle').textContent=c.label;
  S.active=key;if(window.DG3)DG3.open=c.child||c.panel||c.parent||key;
  d.querySelectorAll('.dg80-active-tile').forEach(x=>x.classList.remove('dg80-active-tile'));d.querySelector('[data-dg80-key="'+CSS.escape(key)+'"]')?.classList.add('dg80-active-tile');
  if(w.previousElementSibling!==bar){try{bar.insertAdjacentElement('afterend',w);}catch(_e){}}
  afterOpen(c,w);
  loader(c).catch(e=>{try{if(typeof d3Notice==='function')d3Notice(e&&e.message?e.message:String(e),'error');}catch(_e){}});
  setTimeout(()=>bar.scrollIntoView({behavior:'smooth',block:'start'}),20);paintDirty();
}
window.dg80OfficeOpen=openKey;window.dg80OfficeClose=closeActive;

function dirtyTarget(e){
  const t=e.target;if(!t||!S.active)return false;
  if(!t.matches('input,textarea,select'))return false;
  if(t.matches('.regie-merge-select,.d3-photo,.dg62cb,.dg62-share-extra'))return false;
  if(/^(bossYear|bossMonth|empYear|empMonth|regieYear|regieMonth|dg48DayYear|dg48DayMonth|dg520Year|dg520Month|adminEmployeeSearch|adminEmployeeSelect|adminTimeBankEmployee|vacationEmployee|vacationYear|holidayYear|dg80EmployeeStatsSelect)$/i.test(t.id||''))return false;
  const c=cfg(S.active),w=wrapperFor(c);return !!(w&&w.contains(t));
}
function bindDirtyTracking(){
  const r=root();if(!r||r.dataset.dg80Dirty==='1')return;r.dataset.dg80Dirty='1';
  ['input','change'].forEach(type=>r.addEventListener(type,e=>{if(dirtyTarget(e))markDirty(S.active,e.target);},true));
}
function statusError(ids){return ids.some(id=>{const e=q(id);return e&&/error/.test(e.className||'')&&String(e.textContent||'').trim();});}
function runSaveFunction(name,key,errorIds){
  const f=fn(name);if(!f)return false;
  const b=q('dg80SaveChanges');if(b)b.disabled=true;
  let result;try{result=f();}catch(e){if(b)b.disabled=false;const h=q('dg80SaveHint');if(h){h.className='dg80-save-hint dirty';h.textContent='Speichern nicht möglich: '+(e&&e.message?e.message:e);}return true;}
  Promise.resolve(result).then(()=>setTimeout(()=>{if(!statusError(errorIds||[]))clearDirty(key);},80)).finally(()=>{if(b)b.disabled=false;});
  return true;
}
function genericSave(key){
  const target=S.lastDirty[key],c=cfg(key),w=wrapperFor(c);if(!w)return false;
  const scope=target?.closest('.admin-section,.d37-object,.d37-device,.dg48-subsection,.d3-panel,.card')||w;
  const buttons=[...scope.querySelectorAll('button')].filter(b=>visible(b)&&!b.disabled&&/speichern|eintragen|übernehmen/i.test(String(b.textContent||'')));
  if(!buttons.length)return false;buttons[0].click();return true;
}
function saveActive(){
  if(!S.dirty.size){paintDirty();return;}
  if(!S.active||!S.dirty.has(S.active)){const k=[...S.dirty][0];openKey(k,{force:true});return;}
  const k=S.active,last=S.lastDirty[k],id=String(last&&last.id||'');
  if(k==='employeeAdmin'&&runSaveFunction('saveEmployeeAdminUi',k,['employeeAdminStatus']))return;
  if(k==='absence'){
    if(/^vacation/i.test(id)&&runSaveFunction('saveVacationEntitlementUi',k,['vacationStatus']))return;
    if(/^holiday/i.test(id)&&runSaveFunction('syncHolidaysUi',k,['holidayStatus']))return;
    if(runSaveFunction('saveAbsenceUi',k,['absenceStatus']))return;
  }
  if(genericSave(k)){const h=q('dg80SaveHint');if(h)h.textContent='Speichern wurde ausgelöst …';return;}
  const h=q('dg80SaveHint');if(h){h.className='dg80-save-hint dirty';h.textContent='Für diesen Bereich gibt es keine zentrale Speicheraktion. Bitte den Speichern-Button im geöffneten Formular verwenden.';}
}

function wrapApiForDirty(){
  if(window.__DG80_UI2_API_WRAP)return;
  const base=window.api;if(typeof base!=='function')return;
  window.__DG80_UI2_API_WRAP=true;
  const map={saveEmployeeAdmin:'employeeAdmin',saveAbsence:'absence',saveVacationEntitlement:'absence',saveMaintenanceCustomer:'maintenance',savePlannerEvent:'calendar'};
  const wrapped=async function(payload){const r=await base.apply(this,arguments);const k=map[payload&&payload.action];if(k)clearDirty(k);return r;};
  try{window.api=wrapped;if(typeof api!=='undefined')api=wrapped;}catch(_e){window.api=wrapped;}
}

function routerInstall(){
  if(window.__DG80_UI2_OPEN_WRAP)return;
  const base=window.d3Open;if(typeof base!=='function')return;
  window.__DG80_UI2_OPEN_WRAP=true;
  const route=function(id,child){
    const c=CATALOG.find(x=>(x.parent===id&&(!child||x.child===child))||(x.panel===id&&!child));
    if(c&&available(c)){openKey(c.key);return;}
    return base.apply(this,arguments);
  };
  try{window.d3Open=route;if(typeof d3Open!=='undefined')d3Open=route;}catch(_e){window.d3Open=route;}
}

function parseJson(v){try{return JSON.parse(v);}catch(_e){return null;}}
async function direct80(payload,timeout){
  const ctl=new AbortController(),timer=setTimeout(()=>ctl.abort(),timeout||40000);
  try{
    const res=await fetch(API_URL_80,{method:'POST',headers:{'Content-Type':'text/plain;charset=utf-8'},body:JSON.stringify(Object.assign({},payload,{clientVersion:V})),signal:ctl.signal,cache:'no-store'});
    if(!res.ok)throw new Error('HTTP '+res.status);
    const txt=await res.text(),j=parseJson(txt);if(!j)throw new Error('Ungültige Serverantwort.');if(!j.ok)throw new Error(j.error||'Serverfehler.');return j.data!==undefined?j.data:j;
  }catch(e){if(e&&e.name==='AbortError')throw new Error('Zeitüberschreitung beim Google-Kalender.');throw e;}finally{clearTimeout(timer);}
}
function renderCal80(events){const f=fn('renderCalendarEvents');if(f)f(events||[]);}
async function calendar80(force){
  const employee=localStorage.getItem('dg_employee')||'',pin=localStorage.getItem('dg_device_session')||sessionStorage.getItem('dg_employee_pin')||'';if(!employee||!pin)return [];
  const key='dg_calendar_'+employee,tsKey='dg51_calendar_ts_'+employee,cached=parseJson(localStorage.getItem(key)||'null'),last=Number(localStorage.getItem(tsKey)||0),forceNow=force===true||Boolean(window.DG51&&DG51.forceCalendar);
  if(Array.isArray(cached))renderCal80(cached);
  if(!navigator.onLine){if(Array.isArray(cached)&&typeof setMessage==='function')setMessage('calendarStatus','🟠 Offline – zuletzt geladene Termine werden angezeigt.','warn');return cached||[];}
  if(!forceNow&&Array.isArray(cached)&&Date.now()-last<30000){if(typeof clearMessage==='function')clearMessage('calendarStatus');return cached;}
  if(S.calendarPromise)return S.calendarPromise;
  S.calendarPromise=(async()=>{
    if(typeof setMessage==='function')setMessage('calendarStatus','Termine werden aktualisiert …','info');
    let lastErr=null;
    for(let attempt=0;attempt<(forceNow?2:1);attempt++){
      try{
        const events=await direct80({action:'getEmployeeCalendarEvents',employee:employee,pin:pin,startDate:(typeof localDate==='function'?localDate():new Date().toISOString().slice(0,10)),days:3,force:true},45000);
        localStorage.setItem(key,JSON.stringify(events||[]));localStorage.setItem(tsKey,String(Date.now()));if(window.DG51)DG51.forceCalendar=false;renderCal80(events||[]);if(typeof clearMessage==='function')clearMessage('calendarStatus');return events||[];
      }catch(e){lastErr=e;if(attempt===0&&forceNow)await new Promise(r=>setTimeout(r,700));}
    }
    const msg=lastErr&&lastErr.message?lastErr.message:String(lastErr||'Unbekannter Fehler');
    if(typeof setMessage==='function')setMessage('calendarStatus',Array.isArray(cached)?'Kalender konnte nicht aktualisiert werden: '+msg+' · letzter Terminstand bleibt sichtbar.':'Kalender konnte nicht geladen werden: '+msg,'error');
    return cached||[];
  })().finally(()=>{S.calendarPromise=null;});
  return S.calendarPromise;
}
function installCalendarRepair(){
  try{window.loadCalendarEvents=calendar80;if(typeof loadCalendarEvents!=='undefined')loadCalendarEvents=calendar80;}catch(_e){window.loadCalendarEvents=calendar80;}
  window.addEventListener('online',()=>setTimeout(()=>calendar80(true),250));
}

function pad80(n){return String(n).padStart(2,'0');}
function iso80(d){return d.getFullYear()+'-'+pad80(d.getMonth()+1)+'-'+pad80(d.getDate());}
function add80(d,n){const x=new Date(d.getFullYear(),d.getMonth(),d.getDate(),12);x.setDate(x.getDate()+n);return x;}
function easter80(y){const a=y%19,b=Math.floor(y/100),c=y%100,d=Math.floor(b/4),e=b%4,f=Math.floor((b+8)/25),g=Math.floor((b-f+1)/3),h=(19*a+b-d-g+15)%30,i=Math.floor(c/4),k=c%4,l=(32+2*e+2*i-h-k)%7,m=Math.floor((a+11*h+22*l)/451),mo=Math.floor((h+l-7*m+114)/31),day=((h+l-7*m+114)%31)+1;return new Date(y,mo-1,day,12);}
function holidays80(y){const e=easter80(y);return new Set([y+'-01-01',y+'-01-06',iso80(add80(e,-2)),iso80(add80(e,1)),y+'-05-01',iso80(add80(e,39)),iso80(add80(e,50)),iso80(add80(e,60)),y+'-10-03',y+'-11-01',y+'-12-25',y+'-12-26']);}
function due80(y,m){let d=new Date(Number(y),Number(m)-1,20,12),h=holidays80(Number(y));while(d.getDay()===0||d.getDay()===6||h.has(iso80(d)))d=add80(d,-1);return d;}
function nextYm80(y,m){m++;if(m>12){m=1;y++;}return {year:y,month:m};}
function payrollKey80(){const t=new Date(),today=new Date(t.getFullYear(),t.getMonth(),t.getDate(),12);let y=t.getFullYear(),m=t.getMonth()+1;if(today>due80(y,m)){const n=nextYm80(y,m);y=n.year;m=n.month;}return {year:y,month:m};}
async function refreshPayrollCounter80(force){
  const box=q('employeeMonthlyHours'),employee=localStorage.getItem('dg_employee')||'',pin=localStorage.getItem('dg_device_session')||sessionStorage.getItem('dg_employee_pin')||'';if(!box||!employee||!pin||!navigator.onLine)return;
  if(S.counterPromise&&!force)return S.counterPromise;
  const k=payrollKey80();
  S.counterPromise=(async()=>{
    try{
      const f=typeof window.api==='function'?window.api:null;const data=f?await f({action:'getMonthData',employee:employee,pin:pin,year:k.year,month:k.month}):await direct80({action:'getMonthData',employee:employee,pin:pin,year:k.year,month:k.month},45000);
      const start=data&&data.cycleStart?data.cycleStart:iso80(add80(due80(k.month===1?k.year-1:k.year,k.month===1?12:k.month-1),1));
      const end=data&&data.cycleEnd?data.cycleEnd:iso80(due80(k.year,k.month));
      box.style.display='';box.innerHTML='Geleistete Monatsstunden: '+fmtHours80(data&&data.total||0)+' Std.<small>Abrechnungszeitraum '+de80(start)+' bis '+de80(end)+' · Stunden nach einem vorgezogenen Monatsabschluss zählen automatisch zur nächsten Lohnabrechnung.</small>';
      return data;
    }catch(e){console.warn('DG 8.0 Abrechnungszähler',e);return null;}
  })().finally(()=>{S.counterPromise=null;});
  return S.counterPromise;
}
function installCounter80(){
  const base=window.renderDay;if(typeof base==='function'&&!window.__DG80_UI2_RENDERDAY_WRAP){window.__DG80_UI2_RENDERDAY_WRAP=true;const wrapped=function(){const r=base.apply(this,arguments);setTimeout(()=>refreshPayrollCounter80(true),100);return r;};try{window.renderDay=wrapped;if(typeof renderDay!=='undefined')renderDay=wrapped;}catch(_e){window.renderDay=wrapped;}}
  window.addEventListener('online',()=>{});
  document.addEventListener('visibilitychange',()=>{});
  setInterval(()=>refreshPayrollCounter80(false),3600000);
}

function ensureShell(){
  const r=root();if(!r)return false;
  if(!dashboard()&&fn('dg742EnsureOffice'))try{fn('dg742EnsureOffice')();}catch(_e){}
  if(!dashboard())return false;
  addCss();ensurePayrollStandalone();renameEmployeeClosures();r.classList.add('dg80-office-shell');ensureToolbar();bindDirtyTracking();wrapApiForDirty();routerInstall();paintDirty();S.installed=true;return true;
}
function install(){
  ensureShell();installCalendarRepair();installCounter80();document.documentElement.dataset.dgUiHotfix2=V;
}
window.dg80Ui2Install=install;
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});else install();
let dg80Ui2Retry=0;(function retryShell(){if(S.installed)return;if(ensureShell())return;if(++dg80Ui2Retry<20)setTimeout(retryShell,100);})();
})();



/* DG Zeiterfassung 9.0 - UI Hotfix 7 FINAL
   Konsolidierte Bürooberfläche ohne wiederholte Dashboard-Neuaufbauten.
   Ein Mount, schlanke Top-Aktionen, stabile Sammelmenüs und Tagesabschluss-Prüfung. */
(function(){
'use strict';
const V='8.0-ui7-final';
const q=id=>document.getElementById(id);
const S=window.DG80_FINAL=window.DG80_FINAL||{
  mounted:false,active:'',group:'',parentGroup:'',drag:'',saveBusy:false,
  extraPromise:null,extraAt:0,calendarCountPromise:null,
  reviewRows:[],reviewIssues:[],reviewBusy:false,
  wrapped:false
};
const EXTRA_TTL=3600000;
const SHOP_KEY='dg71_shopping_lists_v1';

const SECTIONS=[
  {key:'daily',label:'Tägliches Geschäft',tiles:['completed','running','offerCreate','offerOpen','shopping','maintenance','partnerNetwork','days','reminders','customers']},
  {key:'admin',label:'Personal & Verwaltung',tiles:['payroll','admin','health']},
  {key:'archive',label:'Archive & Auswertung',tiles:['billed','offerArchive','offerStats']}
];
const TILES={
  completed:{label:'Rechnung zu erstellen',count:'d3Count-completed',legacy:'completed',leaf:'completed'},
  running:{label:'Laufende Aufträge',count:'d3Count-running',legacy:'running',leaf:'running'},
  offerCreate:{label:'Zu erstellende Angebote',count:'d3Count-offers',legacy:'offers',leaf:'offerCreate'},
  offerOpen:{label:'Offene Angebote',count:'dg80c-offerOpen',legacy:'offer-open',leaf:'offerOpen'},
  shopping:{label:'Einkaufsliste',count:'d3Count-shopping',legacy:'shopping',leaf:'shopping'},
  maintenance:{label:'Wartungen',count:'d3Count-maintenance',legacy:'maintenance',leaf:'maintenance'},
  partnerNetwork:{label:'Partnernetzwerk',count:'dg80c-partnerNetwork',legacy:'partner-network',leaf:'partnerNetwork'},
  days:{label:'Offene Tagesabschlüsse',count:'d3Count-days',legacy:'days',leaf:'days'},
  reminders:{label:'Reminder',count:'d3Count-reminders',legacy:'reminders',leaf:'reminders'},
  customers:{label:'Offene Anfragen',count:'d3Count-inquiries',legacy:'inquiries',group:'customers'},
  billed:{label:'Abgerechnete Aufträge',count:'dg80c-billed',legacy:'billed',leaf:'billed'},
  offerArchive:{label:'Angebotsarchiv',count:'dg80c-offerArchive',legacy:'offer-archive',leaf:'offerArchive'},
  offerStats:{label:'Angebotsstatistik',count:'dg80c-offerStats',legacy:'offer-stats',leaf:'offerStats'},
  payroll:{label:'Lohnübergabe',count:'dg80TopPayroll',legacy:'payroll',leaf:'payroll'},
  admin:{label:'Mitarbeiterverwaltung',count:'dg80c-admin',legacy:'employee-admin',group:'admin'},
  health:{label:'Systemcheck',count:'dg80c-health',legacy:'health',leaf:'health'}
};
const GROUPS={
  customers:{
    title:'Offene Anfragen',
    items:[
      {key:'inquiries',label:'Offene Kundenanfragen',count:'regularInquiries'},
      {key:'aqon',label:'AQON PURE Anfragen',count:'aqonInquiries'},
      {key:'websiteInquiries',label:'Webseiten Anfragen',count:'websiteInquiries'},
      {key:'whatsappInquiries',label:'WhatsApp',count:'whatsappInquiries'},
      {key:'inquiryArchive',label:'Anfragenarchiv',count:'inquiryArchive'}
    ]
  },
  admin:{
    title:'Mitarbeiterverwaltung',
    items:[
      {key:'employeeAdmin',label:'Mitarbeiterverwaltung'},
      {key:'employeeStats',label:'Mitarbeiter Auswertungen'},
      {key:'days',label:'Übertragene Tagesabschlüsse / Prüfung'},
      {key:'absence',label:'Urlaub / Abwesenheiten / Feiertage'},
      {key:'sickness',label:'Krank-Fristen'}
    ]
  }
};
const LEAF={
  calendar:{title:'Mitarbeiter Kalender'},
  completed:{title:'Rechnung zu erstellen'},
  billed:{title:'Abgerechnete Aufträge'},
  running:{title:'Laufende Aufträge'},
  offerCreate:{title:'Zu erstellende Angebote'},
  offerOpen:{title:'Offene Angebote'},
  offerArchive:{title:'Angebotsarchiv'},
  offerStats:{title:'Angebotsstatistik'},
  shopping:{title:'Einkaufsliste'},
  maintenance:{title:'Wartungen'},
  partnerNetwork:{title:'Partnernetzwerk'},
  days:{title:'Offene Tagesabschlüsse'},
  reminders:{title:'Reminder'},
  payroll:{title:'Lohnübergabe'},
  inquiries:{title:'Offene Kundenanfragen'},
  aqon:{title:'AQON PURE Anfragen'},
  inquiryArchive:{title:'Anfragenarchiv'},
  websiteInquiries:{title:'Webseiten Anfragen'},
  whatsappInquiries:{title:'WhatsApp'},
  employeeAdmin:{title:'Mitarbeiterverwaltung'},
  employeeStats:{title:'Mitarbeiter Auswertungen'},
  absence:{title:'Urlaub / Abwesenheiten / Feiertage'},
  sickness:{title:'Krank-Fristen'},
  health:{title:'Systemcheck'}
};

function root(){return q('bossView');}
function dash(){return root()?.querySelector(':scope > .d3-dashboard');}
function ui2(){return window.DG80_UI2||null;}
function fn(name){return name&&typeof window[name]==='function'?window[name]:null;}
function esc(v){return String(v==null?'':v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function empKey(){return String(localStorage.getItem('dg_employee')||'geraet').replace(/[^A-Za-z0-9_-]+/g,'_');}
function layoutKey(){return 'dg80_final_layout_'+empKey();}
function subKey(g){return 'dg80_final_sub_'+g+'_'+empKey();}
function topKey(){return 'dg80_final_top_'+empKey();}
function extraKey(){return 'dg80_final_extra_v2_'+empKey();}
function readJson(k,f){try{const v=JSON.parse(localStorage.getItem(k)||'null');return v===null?f:v;}catch(_e){return f;}}
function writeJson(k,v){try{localStorage.setItem(k,JSON.stringify(v));}catch(_e){}}
function visibleBoss(){const r=root();return !!(r&&!r.classList.contains('hidden'));}
function shopCount(){try{const a=JSON.parse(localStorage.getItem(SHOP_KEY)||'[]');return Array.isArray(a)?a.length:0;}catch(_e){return 0;}}

const WA80=window.DG80_WHATSAPP=window.DG80_WHATSAPP||{filter:'Anfrage',data:null,busy:false};

function waCss80(){
  if(q('dg80WaCss'))return;
  const s=document.createElement('style');s.id='dg80WaCss';
  s.textContent=''
    +'.dg80-wa-status{margin-bottom:12px}.dg80-wa-tabs{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px;margin:12px 0}'
    +'.dg80-wa-tab{min-height:52px;border:0;border-radius:13px;background:#e5e7eb;color:#111827;font:inherit;font-weight:900;cursor:pointer;padding:10px}'
    +'.dg80-wa-tab.active{background:#4864a7;color:#fff}.dg80-wa-list{display:grid;gap:12px}'
    +'.dg80-wa-card{border:1px solid #dbe3ec;border-radius:16px;background:#fff;padding:14px;box-shadow:0 4px 14px rgba(15,23,42,.05)}'
    +'.dg80-wa-head{display:flex;justify-content:space-between;align-items:flex-start;gap:12px;flex-wrap:wrap}'
    +'.dg80-wa-head strong{font-size:18px}.dg80-wa-badges{display:flex;gap:7px;align-items:center;flex-wrap:wrap}'
    +'.dg80-wa-score{background:#eef4ff;color:#31589e;border-radius:999px;padding:5px 9px;font-size:12px;font-weight:900}'
    +'.dg80-wa-cat{background:#e8f7ea;color:#185c2c;border-radius:999px;padding:5px 9px;font-size:12px;font-weight:900}'
    +'.dg80-wa-msgs{display:grid;gap:7px;margin:10px 0}.dg80-wa-msg{background:#f8fafc;border-radius:10px;padding:9px 10px;white-space:pre-wrap}'
    +'.dg80-wa-msg time{display:block;color:#64748b;font-size:11px;margin-bottom:3px}.dg80-wa-media{display:flex;gap:7px;flex-wrap:wrap;margin-top:7px}'
    +'.dg80-wa-actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:12px}.dg80-wa-setup{border:1px solid #bfd7ff;background:#eef6ff;border-radius:14px;padding:12px;margin-bottom:12px}'
    +'.dg80-wa-setup code{font-size:12px;word-break:break-all}.dg80-wa-reason{color:#64748b;font-size:13px;margin-top:5px}'
    +'@media(max-width:700px){.dg80-wa-tabs{grid-template-columns:1fr 1fr}.dg80-wa-actions .btn{flex:1;min-width:140px}}';
  document.head.appendChild(s);
}
function waFmt80(v){
  if(!v)return '';try{return new Date(v).toLocaleString('de-DE',{dateStyle:'short',timeStyle:'short'});}catch(_e){return String(v);}
}
function waNeedNames80(n){
  const map={accessToken:'Access Token',phoneNumberId:'Phone Number ID',wabaId:'WABA ID',verifyToken:'Verify Token',appSecret:'App Secret'};
  return Object.keys(n||{}).filter(k=>n[k]).map(k=>map[k]||k);
}
function waMediaButtons80(media){
  return (media||[]).map(m=>{
    const label=/^image\//.test(String(m.mime||''))?'🖼 Bild öffnen':(/pdf/i.test(String(m.mime||''))?'📄 PDF öffnen':'📎 '+(m.filename||m.type||'Anhang'));
    const disabled=String(m.status||'')!=='ready';
    return '<button type="button" class="btn secondary" data-wa-media="'+esc(m.mediaId)+'" data-wa-file="'+esc(m.filename||'')+'" '+(disabled?'disabled title="Anhang wird noch verarbeitet"':'')+'>'+label+'</button>';
  }).join('');
}
function waCard80(t){
  const msgs=(t.messages||[]).slice(-12).map(m=>{
    const text=String(m.text||'').trim();
    const media=waMediaButtons80(m.media);
    if(!text&&!media)return '';
    return '<div class="dg80-wa-msg"><time>'+esc(waFmt80(m.messageAt))+' · '+esc(m.type||'Nachricht')+'</time>'+(text?esc(text):'')+(media?'<div class="dg80-wa-media">'+media+'</div>':'')+'</div>';
  }).join('');
  const transfer=t.status==='Offen'
    ?'<button type="button" class="btn success" data-wa-transfer="Anfrage" data-wa-id="'+esc(t.id)+'">Als Anfrage übernehmen</button>'
      +'<button type="button" class="btn primary" data-wa-transfer="Auftrag" data-wa-id="'+esc(t.id)+'">Als Auftrag übernehmen</button>'
    :'<span class="status ok">Übernommen als '+esc(t.transferredTo||t.category||'Vorgang')+(t.transferredId?' · '+esc(t.transferredId):'')+'</span>';
  const classify=t.status==='Offen'
    ?'<button type="button" class="btn secondary" data-wa-cat="Anfrage" data-wa-id="'+esc(t.id)+'">Anfrage</button>'
      +'<button type="button" class="btn secondary" data-wa-cat="Auftrag" data-wa-id="'+esc(t.id)+'">Auftrag</button>'
      +'<button type="button" class="btn secondary" data-wa-cat="Prüfen" data-wa-id="'+esc(t.id)+'">Prüfen</button>'
      +'<button type="button" class="btn danger" data-wa-cat="Ignoriert" data-wa-id="'+esc(t.id)+'">Nicht relevant</button>'
    :'';
  return '<div class="dg80-wa-card" data-wa-thread="'+esc(t.id)+'"><div class="dg80-wa-head"><div><strong>'+esc(t.contactName||t.waId||'WhatsApp-Kontakt')+'</strong>'
    +'<div class="muted small">'+(t.waId?'<a href="tel:'+esc(t.waId)+'">'+esc(t.waId)+'</a>':'')+(t.lastMessageAt?' · '+esc(waFmt80(t.lastMessageAt)):'')+'</div></div>'
    +'<div class="dg80-wa-badges"><span class="dg80-wa-cat">'+esc(t.category||'Prüfen')+'</span><span class="dg80-wa-score">Relevanz '+Number(t.relevanceScore||0)+' %</span></div></div>'
    +(t.classificationReason?'<div class="dg80-wa-reason">'+esc(t.classificationReason)+'</div>':'')
    +'<div class="dg80-wa-msgs">'+(msgs||'<div class="muted">Keine lesbare Textnachricht.</div>')+'</div>'
    +'<div class="dg80-wa-actions">'+transfer+classify+'</div></div>';
}
function waRender80(){
  const p=q('dg80WhatsappInquiries'),out=q('dg80WhatsappInquiryList'),st=q('dg80WhatsappStatus');if(!p||!out)return;
  waCss80();const d=WA80.data||{},threads=Array.isArray(d.threads)?d.threads:[];
  const missing=waNeedNames80(d.needs);
  if(st){
    if(d.configured&&d.webhookConfigured){st.className='status ok dg80-wa-status';st.textContent='WhatsApp Business ist technisch verbunden. Neue Nachrichten kommen per Webhook in Echtzeit an.';}
    else{st.className='status warn dg80-wa-status';st.textContent='WhatsApp Business ist vorbereitet, aber die Meta-Verbindung ist noch nicht vollständig eingerichtet.';}
  }
  const setup=q('dg80WhatsappSetup');
  if(setup){
    if(d.configured&&d.webhookConfigured)setup.innerHTML='<strong>Verbindung aktiv.</strong> Nach erfolgreicher Übernahme wird der Vorgang aus diesem DG-Eingang entfernt und die WhatsApp-Nachricht – soweit von Meta unterstützt – als gelesen markiert. WhatsApp-Chats selbst können über die Cloud API nicht archiviert werden.';
    else setup.innerHTML='<strong>Noch erforderlich:</strong> '+esc(missing.join(', ')||'Meta Webhook-Konfiguration')+(d.webhookUrl?'<br><strong>Webhook:</strong> <code>'+esc(d.webhookUrl)+'</code>':'');
  }
  const cats=['Anfrage','Auftrag','Prüfen','Übernommen'];
  p.querySelectorAll('[data-wa-filter]').forEach(b=>{
    const f=b.dataset.waFilter;b.classList.toggle('active',f===WA80.filter);
    const n=threads.filter(t=>f==='Übernommen'?t.status==='Übernommen':(t.status==='Offen'&&t.category===f)).length;
    b.textContent=(f==='Anfrage'?'Anfragen':f==='Auftrag'?'Aufträge':f)+' ('+n+')';
  });
  const rows=threads.filter(t=>WA80.filter==='Übernommen'?t.status==='Übernommen':(t.status==='Offen'&&t.category===WA80.filter));
  out.innerHTML=rows.map(waCard80).join('')||'<div class="status info">In diesem Bereich sind aktuell keine WhatsApp-Vorgänge.</div>';
  out.querySelectorAll('[data-wa-cat]').forEach(b=>b.addEventListener('click',()=>waSetCategory80(b.dataset.waId,b.dataset.waCat)));
  out.querySelectorAll('[data-wa-transfer]').forEach(b=>b.addEventListener('click',()=>waTransfer80(b.dataset.waId,b.dataset.waTransfer)));
  out.querySelectorAll('[data-wa-media]').forEach(b=>b.addEventListener('click',()=>waOpenMedia80(b.dataset.waMedia,b.dataset.waFile)));
}
async function waSetCategory80(id,category){
  if(WA80.busy)return;WA80.busy=true;
  try{await api(chefPayload({action:'setWhatsappThreadCategoryV10',id,category}));await window.dg80WhatsappInquiriesLoad(true);}
  catch(e){alert('WhatsApp-Zuordnung fehlgeschlagen: '+(e&&e.message?e.message:e));}finally{WA80.busy=false;}
}
async function waTransfer80(id,kind){
  if(WA80.busy)return;
  const text=kind==='Auftrag'?'als laufenden Auftrag':'als Kundenanfrage';
  if(!confirm('Diesen WhatsApp-Vorgang '+text+' übernehmen?'))return;
  WA80.busy=true;
  try{
    const r=await api(chefPayload({action:'transferWhatsappThreadV10',id,kind}));
    await window.dg80WhatsappInquiriesLoad(true);
    try{if(typeof window.d3Dashboard==='function')await window.d3Dashboard(true);}catch(_e){}
    if(r&&r.targetId)alert('Übernommen: '+r.targetId);
  }catch(e){alert('WhatsApp-Übernahme fehlgeschlagen: '+(e&&e.message?e.message:e));}finally{WA80.busy=false;}
}
async function waOpenMedia80(mediaId,filename){
  if(!mediaId)return;
  try{
    const r=await api(chefPayload({action:'getWhatsappMediaV10',mediaId,force:true}));
    const bin=atob(String(r.base64||'')),bytes=new Uint8Array(bin.length);for(let i=0;i<bin.length;i++)bytes[i]=bin.charCodeAt(i);
    const blob=new Blob([bytes],{type:r.mime||'application/octet-stream'}),url=URL.createObjectURL(blob);
    const w=window.open(url,'_blank','noopener,noreferrer');if(!w){const a=document.createElement('a');a.href=url;a.download=r.filename||filename||'WhatsApp-Anhang';a.click();}
    setTimeout(()=>URL.revokeObjectURL(url),60000);
  }catch(e){alert('Anhang konnte nicht geöffnet werden: '+(e&&e.message?e.message:e));}
}
function ensureExternalInquiryPanels(){
  const r=root();if(!r)return;
  if(!q('dg80WebsiteInquiries')){
    const p=document.createElement('div');p.id='dg80WebsiteInquiries';p.className='card d3-main';
    p.innerHTML='<div class="status info"><strong>Webseiten Anfragen</strong><br>Der Bereich ist vorbereitet. Die direkte Übergabe der Website-Anfragen per API richten wir später ein.</div><div id="dg80WebsiteInquiryList" class="muted">Noch keine direkte Webseiten-Anbindung aktiv.</div>';
    r.appendChild(p);
  }
  if(!q('dg80WhatsappInquiries')){
    waCss80();
    const p=document.createElement('div');p.id='dg80WhatsappInquiries';p.className='card d3-main';
    p.innerHTML='<div id="dg80WhatsappStatus" class="status info dg80-wa-status">WhatsApp-Eingang wird geladen ...</div>'
      +'<div id="dg80WhatsappSetup" class="dg80-wa-setup"></div>'
      +'<div class="dg80-wa-tabs"><button type="button" class="dg80-wa-tab active" data-wa-filter="Anfrage">Anfragen</button><button type="button" class="dg80-wa-tab" data-wa-filter="Auftrag">Aufträge</button><button type="button" class="dg80-wa-tab" data-wa-filter="Prüfen">Prüfen</button><button type="button" class="dg80-wa-tab" data-wa-filter="Übernommen">Übernommen</button></div>'
      +'<div id="dg80WhatsappInquiryList" class="dg80-wa-list"><div class="muted">WhatsApp-Daten werden geladen ...</div></div>';
    r.appendChild(p);
    p.querySelectorAll('[data-wa-filter]').forEach(btn=>btn.addEventListener('click',()=>{WA80.filter=btn.dataset.waFilter;waRender80();}));
  }
}
window.dg80WebsiteInquiriesLoad=async function(){ensureExternalInquiryPanels();const out=q('dg80WebsiteInquiryList');if(out)out.textContent='Noch keine direkte Webseiten-Anbindung aktiv.';};
window.dg80WhatsappInquiriesLoad=async function(force){
  ensureExternalInquiryPanels();const st=q('dg80WhatsappStatus');if(st){st.className='status info dg80-wa-status';st.textContent='WhatsApp-Eingang wird geladen ...';}
  try{WA80.data=await api(chefPayload({action:'getWhatsappInboxV10',force:!!force}));waRender80();return WA80.data;}
  catch(e){if(st){st.className='status error dg80-wa-status';st.textContent='WhatsApp-Eingang konnte nicht geladen werden: '+(e&&e.message?e.message:e);}throw e;}
};
window.dg80WhatsappOpenMedia=waOpenMedia80;

function empStatsFmt(v){return Number(v||0).toFixed(2).replace('.',',');}
function empStatsDate(v){const p=String(v||'').split('-');return p.length===3?p[2]+'.'+p[1]+'.'+p[0]:String(v||'');}
function ensureEmployeeStatsPanel(){
  const r=root();if(!r)return null;
  let p=q('dg80EmployeeStats');
  if(p)return p;
  p=document.createElement('div');p.id='dg80EmployeeStats';p.className='card d3-main';
  p.innerHTML='<div class="dg80-empstats-intro">Arbeitszeit, Urlaub und Fehlzeiten eines Mitarbeiters auf einen Blick.</div>'
    +'<div class="dg80-empstats-controls"><div><label for="dg80EmployeeStatsSelect">Mitarbeiter</label><select id="dg80EmployeeStatsSelect"><option value="">Bitte Mitarbeiter wählen</option></select></div>'
    +'<button type="button" class="btn primary" id="dg80EmployeeStatsRefresh">Auswertung laden</button></div>'
    +'<div id="dg80EmployeeStatsStatus"></div><div id="dg80EmployeeStatsResult"></div>';
  r.appendChild(p);
  q('dg80EmployeeStatsSelect').addEventListener('change',()=>{try{localStorage.setItem('dg80_employee_stats_selected',q('dg80EmployeeStatsSelect').value||'');}catch(_e){}dg80EmployeeStatsLoad(false);});
  q('dg80EmployeeStatsRefresh').addEventListener('click',()=>dg80EmployeeStatsLoad(true));
  return p;
}
async function fillEmployeeStatsEmployees(){
  const sel=q('dg80EmployeeStatsSelect');if(!sel)return [];
  let rows=Array.isArray(window.__employeeAdminRows)?window.__employeeAdminRows:[];
  if(!rows.length){
    try{rows=await api(chefPayload({action:'getEmployeeAdminData'}))||[];window.__employeeAdminRows=rows;}catch(_e){}
  }
  if(!rows.length){
    try{const names=await api({action:'getEmployees'});rows=(names||[]).map(name=>({name,active:true}));}catch(_e){}
  }
  const old=sel.value,saved=(()=>{try{return localStorage.getItem('dg80_employee_stats_selected')||'';}catch(_e){return '';}})();
  sel.innerHTML='<option value="">Bitte Mitarbeiter wählen</option>'+rows.map(x=>'<option value="'+esc(x.name)+'">'+esc(x.name)+(x.active===false?' (inaktiv)':'')+'</option>').join('');
  const wanted=[old,saved,(typeof auth==='function'?auth().employee:'')].find(v=>v&&rows.some(x=>x.name===v))||String(rows.find(x=>x.active!==false)?.name||rows[0]?.name||'');
  if(wanted)sel.value=wanted;
  return rows;
}
async function dg80EmployeeStatsLoad(force){
  const panel=ensureEmployeeStatsPanel(),out=q('dg80EmployeeStatsResult'),st=q('dg80EmployeeStatsStatus');if(!panel||!out)return;
  await fillEmployeeStatsEmployees();
  const sel=q('dg80EmployeeStatsSelect'),employee=String(sel?.value||'');if(!employee){out.innerHTML='';if(st){st.className='status info';st.textContent='Bitte Mitarbeiter auswählen.';}return;}
  if(st){st.className='status info';st.textContent='Auswertung wird geladen ...';}
  try{
    const d=await api(chefPayload({action:'getEmployeeWorkOverviewV10',targetEmployee:employee,force:!!force}));
    const work=[
      ['Woche aktuell',empStatsFmt(d.weekHours)+' Std.',''],
      ['Wochensoll',empStatsFmt(d.weeklyTarget)+' Std.',''],
      ['Monat aktuell',empStatsFmt(d.monthHours)+' Std.',''],
      ['Jahr '+d.year,empStatsFmt(d.yearHours)+' Std.','']
    ];
    const abs=[
      ['Urlaubsanspruch',empStatsFmt(d.vacationEntitlement)+' Tage','good'],
      ['Urlaub genommen',empStatsFmt(d.vacationUsed)+' Tage',''],
      ['Resturlaub',empStatsFmt(d.vacationRemaining)+' Tage','good'],
      ['Krankheitstage '+d.year,Number(d.sickDays||0)+' Tage',''],
      ['Schulungstage '+d.year,Number(d.trainingDays||0)+' Tage',''],
      ['Unerlaubte Fehlzeiten '+d.year,Number(d.unexcusedDays||0)+' Tage',Number(d.unexcusedDays||0)>0?'warn':'']
    ];
    const cards=a=>a.map(x=>'<div class="dg80-empstats-card '+esc(x[2]||'')+'"><span>'+esc(x[0])+'</span><strong>'+esc(x[1])+'</strong></div>').join('');
    out.innerHTML='<div class="dg80-empstats-period"><strong>'+esc(employee)+'</strong> · aktuelle Woche '+esc(empStatsDate(d.weekStart))+' bis '+esc(empStatsDate(d.weekEnd))+'</div>'
      +'<div class="dg80-empstats-section">Arbeitszeit</div><div class="dg80-empstats-grid">'+cards(work)+'</div>'
      +'<div class="dg80-empstats-section">Urlaub &amp; Abwesenheiten</div><div class="dg80-empstats-grid">'+cards(abs)+'</div>';
    if(st){st.className='status ok';st.textContent='Auswertung aktuell.';}
  }catch(e){out.innerHTML='';if(st){st.className='status error';st.textContent='Auswertung konnte nicht geladen werden: '+(e&&e.message?e.message:e);}}
}
window.dg80EmployeeStatsLoad=dg80EmployeeStatsLoad;

function css(){
  if(q('dg80FinalCss'))return;
  const s=document.createElement('style');s.id='dg80FinalCss';
  s.textContent=''
    +'.dg80-office-mode .hero{display:none!important}'
    +'#bossView.dg80-office-shell>.card{display:none!important}'
    +'#bossView.dg80-office-shell>.card.dg80-shell-active{display:block!important}'
    +'#bossView .dg80-final-dashboard{display:block!important;grid-template-columns:none!important}'
    +'#bossView .dg80-final-top{display:grid;grid-template-columns:1fr;gap:8px;margin:0 0 18px}'
    +'#bossView .dg80-final-top-btn{width:100%;min-height:56px;border:1px solid #b9e4c1;border-radius:15px;background:#e8f7ea;color:#185c2c;padding:9px 16px;display:flex;align-items:center;justify-content:center;gap:16px;font:inherit;font-weight:900;cursor:pointer;box-shadow:0 3px 10px rgba(15,23,42,.04)}'
    +'#bossView .dg80-final-top-btn span{font-size:18px;line-height:1.1;text-align:center}'
    +'#bossView .dg80-final-top-btn strong{font-size:25px;line-height:1;text-align:center}'
    +'#bossView .dg80-final-top-btn.dirty{background:#fee2e2;border-color:#ef9a9a;color:#991b1b}'
    +'#bossView .dg80-final-section{margin:0 0 22px}'
    +'#bossView .dg80-final-section-title{font-size:19px;font-weight:900;color:#31589e;margin:0 0 10px;padding:0 3px}'
    +'#bossView .dg80-final-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:12px}'
    +'#bossView .dg80-final-tile{min-height:118px;border:1px solid #b9e4c1;border-radius:22px;background:#e8f7ea;color:#185c2c;padding:14px;display:flex;flex-direction:column;align-items:center;justify-content:space-between;text-align:center;font:inherit;cursor:grab;box-shadow:0 5px 16px rgba(15,23,42,.05)}'
    +'#bossView .dg80-final-tile:hover{background:#dcf3e0;border-color:#87cf94;transform:translateY(-1px)}'
    +'#bossView .dg80-final-tile span{width:100%;font-size:17px;line-height:1.12;font-weight:900;text-align:center;color:#185c2c;white-space:normal}'
    +'#bossView .dg80-final-tile strong{width:100%;font-size:31px;line-height:1;font-weight:900;text-align:center;color:#185c2c}'
    +'#bossView .dg80-final-tile.dragging{opacity:.42}'
    +'#bossView .dg80-final-tile.active{outline:3px solid #4d8b61;box-shadow:0 0 0 5px rgba(77,139,97,.15)}'
    +'#bossView .dg80-final-tile.payroll.urgent{background:#fee2e2;border-color:#ef9a9a;color:#991b1b}'
    +'#bossView .dg80-final-tile.payroll.urgent span,#bossView .dg80-final-tile.payroll.urgent strong{color:#991b1b}'
    +'#dg80OfficeToolbar{margin:12px 0 10px!important}'
    +'#dg80SaveChanges,#dg80SaveHint{display:none!important}'
    +'#dg80OfficeToolbar .dg80-office-toolbar-head{justify-content:flex-end!important}'
    +'#dg80OfficeTitle{margin-right:auto!important}'
    +'#dg80GroupChooser{padding:16px!important}'
    +'.dg80-group-head{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:12px}'
    +'.dg80-group-head h2{margin:0;color:#31589e}'
    +'.dg80-group-close{width:44px!important;height:44px!important;padding:0!important;font-size:27px!important;line-height:1!important;font-weight:900!important}'
    +'.dg80-sub-help{font-size:12px;color:#64748b;font-weight:700;margin:0 0 10px}'
    +'.dg80-sub-list{display:grid;gap:10px}'
    +'.dg80-sub-button{width:100%;min-height:62px;border:1px solid #a9d9b4;border-radius:15px;background:#e8f7ea;color:#185c2c;padding:12px 15px;display:flex;align-items:center;justify-content:space-between;gap:14px;text-align:left;font:inherit;font-size:16px;font-weight:900;cursor:grab}'
    +'.dg80-sub-button strong{font-size:22px;color:#185c2c}'
    +'.dg80-sub-button.dragging{opacity:.42}'
    +'.dg80-week-heading{grid-column:1/-1!important;background:#eef3f8;border:1px solid #d7dde7;border-radius:10px;padding:9px 12px;margin:6px 0 0;font-weight:900;color:#31589e;font-size:15px;line-height:1.2}'
    +'.dg80-review-panel{border:1px solid #dbe2ea;border-radius:14px;background:#f8fafc;padding:12px 14px;margin:0 0 14px}'
    +'.dg521-collapsed .dg80-review-panel{display:none!important}'
    +'.dg80-review-title{font-weight:900;margin-bottom:7px}'
    +'.dg80-review-note{font-size:12px;color:#64748b;margin-bottom:8px}'
    +'.dg80-review-list{display:grid;gap:8px;margin-top:8px}'
    +'.dg80-review-issue{border-radius:11px;background:#fff;border:1px solid #e5e7eb;padding:10px 11px}'
    +'.dg80-review-issue.error{border-left:6px solid #dc2626}.dg80-review-issue.warn{border-left:6px solid #f59e0b}.dg80-review-issue.reviewed{border-left:6px solid #16a34a;background:#f0fdf4}'
    +'.dg80-review-head{font-weight:900}.dg80-review-detail{font-size:13px;color:#64748b;margin-top:3px}.dg80-review-actions{display:flex;gap:7px;flex-wrap:wrap;margin-top:8px}.dg80-review-actions .btn{width:auto!important;margin:0!important}'
    +'#d3EmployeeAdmin #dg10EmpOverview{display:none!important}'
    +'#dg80EmployeeStats{padding:20px!important}'
    +'.dg80-empstats-intro{color:#64748b;font-weight:700;margin:0 0 14px}'
    +'.dg80-empstats-controls{display:grid;grid-template-columns:minmax(260px,1fr) auto;gap:12px;align-items:end;margin-bottom:16px}'
    +'.dg80-empstats-controls label{font-weight:900;color:#1f2937}'
    +'.dg80-empstats-controls select{width:100%}'
    +'.dg80-empstats-period{font-size:14px;color:#64748b;font-weight:800;margin:4px 0 14px}'
    +'.dg80-empstats-section{margin:16px 0 8px;color:#31589e;font-size:19px;font-weight:900}'
    +'.dg80-empstats-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:12px}'
    +'.dg80-empstats-card{border:1px solid #dbe3ec;border-radius:16px;background:#f8fafc;padding:14px;min-height:86px}'
    +'.dg80-empstats-card span{display:block;color:#64748b;font-size:13px;font-weight:800;margin-bottom:7px}'
    +'.dg80-empstats-card strong{display:block;color:#1f2937;font-size:25px;line-height:1.05}'
    +'.dg80-empstats-card.warn{background:#fff7ed;border-color:#fed7aa}.dg80-empstats-card.warn strong{color:#9a3412}'
    +'.dg80-empstats-card.good{background:#f0fdf4;border-color:#bbf7d0}.dg80-empstats-card.good strong{color:#166534}'
    +'@media(max-width:759px){#bossView .dg80-final-grid{grid-template-columns:repeat(2,minmax(0,1fr));gap:9px}#bossView .dg80-final-tile{min-height:108px;border-radius:17px;padding:12px}#bossView .dg80-final-tile span{font-size:14px}#bossView .dg80-final-tile strong{font-size:27px}#bossView .dg80-final-top-btn{min-height:52px;padding:8px 12px}#bossView .dg80-final-top-btn span{font-size:16px}#bossView .dg80-final-top-btn strong{font-size:22px}.dg80-review-actions .btn{width:100%!important}.dg80-empstats-controls{grid-template-columns:1fr}.dg80-empstats-controls .btn{width:100%!important}.dg80-empstats-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}';
  document.head.appendChild(s);
  const fix=document.createElement('style');fix.id='dg80FinalLegacyAlign';fix.textContent='#bossView .d3-tile.sickness734{align-items:center!important;justify-content:space-between!important;text-align:center!important}#bossView .d3-tile.sickness734>span,#bossView .d3-tile.sickness734>strong{width:100%!important;text-align:center!important;align-self:center!important}';document.head.appendChild(fix);
}

function currentCounts(){
  const out={};
  Object.entries(TILES).forEach(([k,t])=>{if(k==='offerStats')return;const e=t.count&&q(t.count);if(e&&String(e.textContent||'').trim())out[k]=String(e.textContent).trim();});
  const cache=readJson(extraKey(),null);if(cache&&cache.data){
    Object.assign(out,cache.data);
    const rate=Number(cache.data.offerAcceptance);
    if(Number.isFinite(rate))out.offerStats=String(Math.max(0,Math.min(100,Math.round(rate))))+' %';
    else delete out.offerStats;
  }
  out.shopping=String(shopCount());
  return out;
}
function defaultLayout(){const x={};SECTIONS.forEach(s=>x[s.key]=s.tiles.slice());return x;}
function layout(){
  const def=defaultLayout(),saved=readJson(layoutKey(),null),known=new Set(Object.keys(TILES)),used=new Set(),out={};
  SECTIONS.forEach(s=>{
    const src=saved&&Array.isArray(saved[s.key])?saved[s.key]:def[s.key];
    out[s.key]=src.filter(k=>known.has(k)&&!used.has(k));out[s.key].forEach(k=>used.add(k));
  });
  SECTIONS.forEach(s=>def[s.key].forEach(k=>{if(!used.has(k)){out[s.key].push(k);used.add(k);}}));
  return out;
}
function tileHtml(k,counts){
  const t=TILES[k],v=counts[k]!==undefined?counts[k]:(k==='partnerNetwork'?'›':'…');
  return '<button type="button" draggable="true" class="d3-tile dg80-final-tile '+esc(t.legacy||k)+'" data-dg80-final="'+esc(k)+'" data-dg80-key="'+esc(t.leaf||k)+'"><span>'+esc(t.label)+'</span><strong id="'+esc(t.count)+'">'+esc(v)+'</strong></button>';
}
function saveLayout(){
  const d=dash();if(!d)return;const out={};
  d.querySelectorAll('.dg80-final-section').forEach(sec=>out[sec.dataset.section]=[...sec.querySelectorAll('.dg80-final-tile[data-dg80-final]')].map(x=>x.dataset.dg80Final));
  writeJson(layoutKey(),out);
}
function topOrder(){
  const saved=readJson(topKey(),[]),def=['save','calendar'],out=[];
  (Array.isArray(saved)?saved:[]).forEach(k=>{if(def.includes(k)&&!out.includes(k))out.push(k);});def.forEach(k=>{if(!out.includes(k))out.push(k);});return out;
}
function saveTopOrder(){const host=dash()?.querySelector('.dg80-final-top');if(host)writeJson(topKey(),[...host.querySelectorAll('[data-dg80-top]')].map(x=>x.dataset.dg80Top));}

function buildDashboard(force){
  const d=dash();if(!d)return false;
  if(d.dataset.dg80Final==='1'&&!force)return true;
  const counts=currentCounts(),lay=layout();
  d.className='d3-dashboard dg80-office-dashboard dg80-final-dashboard';
  const topHtml={save:'<button type="button" draggable="true" data-dg80-top="save" id="dg80FinalSave" class="dg80-final-top-btn"><span>Änderungen Speichern</span><strong id="dg80FinalSaveCount">0</strong></button>',calendar:'<button type="button" draggable="true" data-dg80-top="calendar" id="dg80FinalCalendar" class="dg80-final-top-btn"><span>Mitarbeiter Kalender</span><strong id="dg80c-calendar">'+esc(counts.calendar!==undefined?counts.calendar:'…')+'</strong></button>'};
  d.innerHTML='<div class="dg80-final-top">'+topOrder().map(k=>topHtml[k]).join('')+'</div>'
    +SECTIONS.map(s=>'<section class="dg80-final-section" data-section="'+esc(s.key)+'"><div class="dg80-final-section-title">'+esc(s.label)+'</div><div class="dg80-final-grid">'+(lay[s.key]||[]).map(k=>tileHtml(k,counts)).join('')+'</div></section>').join('');
  d.dataset.dg80Final='1';
  wireDashboard(d);paintDirty();applyExtra(readJson(extraKey(),null)?.data||{});syncShopping();return true;
}
function wireDashboard(d){
  if(d.dataset.dg80FinalWired==='1')return;d.dataset.dg80FinalWired='1';
  d.addEventListener('click',e=>{
    const save=e.target.closest('#dg80FinalSave');if(save){e.preventDefault();saveAll();return;}
    const cal=e.target.closest('#dg80FinalCalendar');if(cal){e.preventDefault();openLeaf('calendar');return;}
    const t=e.target.closest('.dg80-final-tile[data-dg80-final]');if(!t||S.drag)return;
    e.preventDefault();const key=t.dataset.dg80Final,c=TILES[key];if(!c)return;
    c.group?openGroup(c.group):openLeaf(c.leaf);
  });
  d.addEventListener('dragstart',e=>{const top=e.target.closest('[data-dg80-top]');if(top){S.topDrag=top.dataset.dg80Top;top.classList.add('dragging');try{e.dataTransfer.effectAllowed='move';e.dataTransfer.setData('text/plain','top:'+S.topDrag);}catch(_e){}return;}const t=e.target.closest('.dg80-final-tile[data-dg80-final]');if(!t)return;S.drag=t.dataset.dg80Final;t.classList.add('dragging');try{e.dataTransfer.effectAllowed='move';e.dataTransfer.setData('text/plain',S.drag);}catch(_e){}});
  d.addEventListener('dragover',e=>{if(S.topDrag){const host=e.target.closest('.dg80-final-top');if(!host)return;e.preventDefault();const src=host.querySelector('[data-dg80-top="'+CSS.escape(S.topDrag)+'"]'),target=e.target.closest('[data-dg80-top]');if(!src)return;if(target&&target!==src){const r=target.getBoundingClientRect();host.insertBefore(src,e.clientX<r.left+r.width/2?target:target.nextSibling);}else if(!target)host.appendChild(src);return;}if(!S.drag)return;const grid=e.target.closest('.dg80-final-grid');if(!grid)return;e.preventDefault();const src=d.querySelector('[data-dg80-final="'+CSS.escape(S.drag)+'"]');if(!src)return;const target=e.target.closest('.dg80-final-tile[data-dg80-final]');if(target&&target!==src){const r=target.getBoundingClientRect();grid.insertBefore(src,e.clientY<r.top+r.height/2?target:target.nextSibling);}else if(!target)grid.appendChild(src);});
  d.addEventListener('drop',e=>{if(S.topDrag){e.preventDefault();saveTopOrder();return;}if(!S.drag)return;e.preventDefault();saveLayout();});
  d.addEventListener('dragend',()=>{d.querySelectorAll('.dragging').forEach(x=>x.classList.remove('dragging'));if(S.topDrag){saveTopOrder();S.topDrag='';}S.drag='';saveLayout();});
}

function markActive(main){
  dash()?.querySelectorAll('.dg80-final-tile.active').forEach(x=>x.classList.remove('active'));
  if(main)dash()?.querySelector('[data-dg80-final="'+CSS.escape(main)+'"]')?.classList.add('active');
}
function mainForLeaf(key){
  if(['inquiries','aqon','websiteInquiries','whatsappInquiries','inquiryArchive'].includes(key))return 'customers';
  if(['employeeAdmin','employeeStats','absence','sickness'].includes(key))return 'admin';
  return key;
}
function ensureBackUi(){
  const bar=q('dg80OfficeToolbar'),title=q('dg80OfficeTitle');if(!bar||!title)return null;
  if(!q('dg80FinalNavCss')){
    const st=document.createElement('style');st.id='dg80FinalNavCss';
    st.textContent='.dg80-office-nav-left{display:flex;align-items:center;gap:10px;min-width:0;flex:1}.dg80-office-nav-left h2{margin:0;min-width:0}.dg80-office-back{flex:0 0 auto;white-space:nowrap}.dg80-office-back.hidden{display:none!important}@media(max-width:650px){.dg80-office-nav-left{align-items:flex-start;flex-direction:column;gap:6px}.dg80-office-back{padding:7px 10px!important}}';
    document.head.appendChild(st);
  }
  let left=bar.querySelector('.dg80-office-nav-left');
  if(!left){
    const head=bar.querySelector('.dg80-office-toolbar-head');if(!head)return null;
    left=document.createElement('div');left.className='dg80-office-nav-left';
    head.insertBefore(left,title);left.appendChild(title);
  }
  let back=q('dg80OfficeBack');
  if(!back){
    back=document.createElement('button');back.id='dg80OfficeBack';back.type='button';back.className='btn secondary dg80-office-back hidden';back.textContent='← Zurück';
    left.insertBefore(back,title);back.addEventListener('click',e=>{e.preventDefault();goBack();});
  }
  const close=q('dg80OfficeClose');
  if(close&&!close.dataset.dg80FinalNav){
    close.dataset.dg80FinalNav='1';
    close.addEventListener('click',()=>{
      if(S.active==='partnerNetwork'){const p=fn('dg10PartnerBack');if(p)try{p();}catch(_e){}}
      S.active='';S.group='';S.parentGroup='';markActive('');back.classList.add('hidden');
    },true);
  }
  return back;
}
function setOfficePath(parent,child,canBack){
  const back=ensureBackUi(),title=q('dg80OfficeTitle'),parts=[parent,child].map(x=>String(x||'').trim()).filter(Boolean);
  if(title)title.textContent=parts.join(' > ')||'Büro';
  if(back)back.classList.toggle('hidden',!canBack);
}
function groupContains(g,key){return !!(GROUPS[g]&&GROUPS[g].items.some(x=>x.key===key));}
function goBack(){
  if(S.active==='partnerNetwork'){
    const p=fn('dg10PartnerBack');
    if(p&&p()){S.parentGroup='';setOfficePath('Partnernetzwerk','',false);return true;}
  }
  if(S.parentGroup){
    const g=S.parentGroup;S.parentGroup='';openGroup(g);return true;
  }
  return false;
}
window.dg80FinalBack=goBack;
window.dg80OfficeSetPath=function(parent,child,canBack){setOfficePath(parent,child,canBack!==false&&!!String(child||'').trim());};

function openLeaf(key,force){
  const parent=(!force&&S.group&&groupContains(S.group,key))?S.group:'';
  q('dg80GroupChooser')?.classList.remove('dg80-shell-active');S.group='';
  if(key==='employeeStats')ensureEmployeeStatsPanel();if(key==='websiteInquiries'||key==='whatsappInquiries')ensureExternalInquiryPanels();
  const open=fn('dg80OfficeOpen');if(!open)return false;
  const same=S.active===key;
  open(key,{force:!!force});
  if(same&&!force){S.active='';S.parentGroup='';markActive('');setOfficePath('Büro','',false);return true;}
  S.active=key;S.parentGroup=parent;
  const leafTitle=LEAF[key]?LEAF[key].title:key;
  setOfficePath(parent?GROUPS[parent].title:'',leafTitle,!!parent);
  markActive(parent||mainForLeaf(key));
  if(key==='partnerNetwork')setTimeout(()=>{loadPartnerNetwork80().catch(()=>{});},0);
  if(key==='whatsappInquiries')setTimeout(()=>{window.dg80WhatsappInquiriesLoad?.(false).catch(()=>{});},0);
  if(key==='days')setTimeout(()=>{installDayReviewWrap();const f=fn('loadBossDayClosuresV48');if(f)Promise.resolve(f()).catch(()=>{});},20);
  setTimeout(syncLabels,0);return true;
}
function closeMenus(){
  if(S.active==='partnerNetwork'){const p=fn('dg10PartnerBack');if(p)try{p();}catch(_e){}}
  const c=fn('dg80OfficeClose');if(c)c();q('dg80GroupChooser')?.classList.remove('dg80-shell-active');
  S.active='';S.group='';S.parentGroup='';markActive('');setOfficePath('Büro','',false);
}
function orderedGroupItems(g){
  const def=GROUPS[g].items,saved=readJson(subKey(g),[]),by={},out=[],used=new Set();def.forEach(x=>by[x.key]=x);
  (Array.isArray(saved)?saved:[]).forEach(k=>{if(by[k]&&!used.has(k)){out.push(by[k]);used.add(k);}});def.forEach(x=>{if(!used.has(x.key))out.push(x);});return out;
}
function openGroup(g){
  const def=GROUPS[g],r=root();if(!def||!r)return;
  const box=q('dg80GroupChooser');
  if(S.group===g&&box?.classList.contains('dg80-shell-active')){closeMenus();return;}
  closeMenus();
  let host=q('dg80GroupChooser');if(!host){host=document.createElement('div');host.id='dg80GroupChooser';host.className='card';r.appendChild(host);}
  const items=orderedGroupItems(g);
  host.innerHTML='<div class="dg80-group-head"><h2>'+esc(def.title)+'</h2><button type="button" class="btn secondary dg80-group-close">×</button></div><div class="dg80-sub-help">Unterpunkte können per Drag & Drop frei angeordnet werden. Die Reihenfolge wird persönlich für den angemeldeten Mitarbeiter gespeichert.</div><div class="dg80-sub-list">'+items.map(x=>'<button type="button" draggable="true" class="dg80-sub-button" data-dg80-sub="'+esc(x.key)+'"><span>'+esc(x.label)+'</span><strong data-sub-count="'+esc(x.count||'')+'">'+(x.count?'…':'›')+'</strong></button>').join('')+'</div>';
  host.classList.add('dg80-shell-active');S.group=g;markActive(g);
  host.querySelector('.dg80-group-close').addEventListener('click',closeMenus);
  const list=host.querySelector('.dg80-sub-list');let drag='';
  list.addEventListener('click',e=>{const b=e.target.closest('[data-dg80-sub]');if(!b||drag)return;e.preventDefault();openLeaf(b.dataset.dg80Sub);});
  list.addEventListener('dragstart',e=>{const b=e.target.closest('[data-dg80-sub]');if(!b)return;drag=b.dataset.dg80Sub;b.classList.add('dragging');});
  list.addEventListener('dragover',e=>{if(!drag)return;e.preventDefault();const src=list.querySelector('[data-dg80-sub="'+CSS.escape(drag)+'"]'),b=e.target.closest('[data-dg80-sub]');if(!src)return;if(b&&b!==src){const rc=b.getBoundingClientRect();list.insertBefore(src,e.clientY<rc.top+rc.height/2?b:b.nextSibling);}else if(!b)list.appendChild(src);});
  list.addEventListener('drop',e=>{if(!drag)return;e.preventDefault();writeJson(subKey(g),[...list.querySelectorAll('[data-dg80-sub]')].map(x=>x.dataset.dg80Sub));});
  list.addEventListener('dragend',()=>{list.querySelectorAll('.dragging').forEach(x=>x.classList.remove('dragging'));writeJson(subKey(g),[...list.querySelectorAll('[data-dg80-sub]')].map(x=>x.dataset.dg80Sub));drag='';});
  if(g==='customers')refreshInquirySubcounts();
  setTimeout(()=>host.scrollIntoView({behavior:'smooth',block:'start'}),20);
}

function dirtySet(){const x=ui2();return x&&x.dirty instanceof Set?x.dirty:new Set();}
function paintDirty(){
  const n=dirtySet().size,b=q('dg80FinalSave'),c=q('dg80FinalSaveCount');if(c)c.textContent=String(n);if(b){b.classList.toggle('dirty',n>0);b.title=n?n+' Bereich(e) mit ungespeicherten Änderungen':'Alle Änderungen gespeichert';}
}
async function waitDirty(key,timeout){const t=Date.now();while(Date.now()-t<(timeout||9000)){if(!dirtySet().has(key))return true;await new Promise(r=>setTimeout(r,120));}return false;}
async function saveAll(){
  if(S.saveBusy)return;const set=dirtySet();if(!set.size){paintDirty();return;}S.saveBusy=true;
  try{
    let guard=0;
    while(set.size&&guard++<20){
      const key=[...set][0];openLeaf(key,true);await new Promise(r=>setTimeout(r,80));
      const hidden=q('dg80SaveChanges');if(!hidden)break;hidden.click();
      const ok=await waitDirty(key,9000);paintDirty();if(!ok)break;
    }
  }finally{S.saveBusy=false;paintDirty();}
}

function syncShopping(){const n=shopCount(),e=q('d3Count-shopping');if(e)e.textContent=String(n);}
function setCount(id,v){const e=q(id);if(e&&v!==undefined&&v!==null)e.textContent=String(v);}
function setPercent(id,v){const e=q(id),n=Number(v);if(e&&Number.isFinite(n)){e.textContent=String(Math.max(0,Math.min(100,Math.round(n))))+' %';e.title='Annahmequote: angenommene Angebote ÷ entschiedene Angebote';}}
function dg80PayrollNumericGuard(){
  const e=q('dg80TopPayroll');if(!e)return;
  const cache=readJson(extraKey(),null),v=cache&&cache.data?Number(cache.data.payroll):NaN;
  if(Number.isFinite(v))e.textContent=String(Math.max(0,Math.round(v)));
  const tile=e.closest('.d3-tile');if(tile&&Number.isFinite(v)){tile.classList.toggle('urgent',v<=3);tile.classList.remove('warn','done');}
}
function applyExtra(x){
  if(!x)return;
  if(x.calendar!==undefined)setCount('dg80c-calendar',x.calendar);
  if(x.offerOpen!==undefined)setCount('dg80c-offerOpen',x.offerOpen);
  if(x.offerArchive!==undefined)setCount('dg80c-offerArchive',x.offerArchive);
  if(x.offerAcceptance!==undefined)setPercent('dg80c-offerStats',x.offerAcceptance);
  if(x.billed!==undefined)setCount('dg80c-billed',x.billed);
  if(x.admin!==undefined)setCount('dg80c-admin',x.admin);
  if(x.health!==undefined)setCount('dg80c-health',x.health);
  if(x.payroll!==undefined)setCount('dg80TopPayroll',x.payroll);
  dg80PayrollNumericGuard();
  const pt=dash()?.querySelector('[data-dg80-final="payroll"]'),n=Number(x.payroll);if(pt&&Number.isFinite(n))pt.classList.toggle('urgent',n<=3);
}
function norm(s){return String(s||'').trim().toLowerCase().replace(/\s+/g,' ');}
async function refreshCalendarCount(){
  if(S.calendarCountPromise||!navigator.onLine||typeof window.api!=='function'||typeof window.chefPayload!=='function')return S.calendarCountPromise;
  S.calendarCountPromise=(async()=>{
    try{
      const [wr,er]=await Promise.allSettled([
        window.api(window.chefPayload({action:'getPlannerWorkers'})),
        window.api({action:'getEmployees'})
      ]);
      if(wr.status!=='fulfilled')return null;
      let rows=(wr.value||[]).filter(x=>x&&x.active&&String(x.calendarId||'').trim());
      if(er.status==='fulfilled'&&Array.isArray(er.value)&&er.value.length){
        const names=new Set(er.value.map(norm));
        const matched=rows.filter(w=>names.has(norm(w.employeeName))||names.has(norm(w.displayName)));
        if(matched.length)rows=matched;
      }
      const n=new Set(rows.map(x=>String(x.calendarId||'').trim()).filter(Boolean)).size;
      setCount('dg80c-calendar',n);return n;
    }catch(_e){return null;}finally{S.calendarCountPromise=null;}
  })();
  return S.calendarCountPromise;
}
function dayIso(d){return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');}
function diffDays(a,b){const A=a.split('-').map(Number),B=b.split('-').map(Number);return Math.round((Date.UTC(B[0],B[1]-1,B[2])-Date.UTC(A[0],A[1]-1,A[2]))/86400000);}
async function refreshExtra(force){
  const cached=readJson(extraKey(),null);if(cached&&cached.data)applyExtra(cached.data);
  if(!navigator.onLine||typeof window.api!=='function'||typeof window.chefPayload!=='function')return;
  if(!force&&cached&&cached.data&&cached.data.offerAcceptance!==undefined&&Date.now()-Number(cached.ts||0)<EXTRA_TTL)return cached.data;
  if(S.extraPromise)return S.extraPromise;
  S.extraPromise=(async()=>{
    const now=new Date(),year=now.getFullYear(),month=now.getMonth()+1,out=Object.assign({},cached?.data||{});
    const jobs=await Promise.allSettled([
      window.api(window.chefPayload({action:'getOfferStatistics'})),
      window.api(window.chefPayload({action:'getRegieReports',status:'Abgerechnet',year:0,month:0})),
      window.api(window.chefPayload({action:'getPayrollCycleState',year,month}))
    ]);
    if(jobs[0].status==='fulfilled'){
      const x=jobs[0].value||{},accepted=Math.max(0,Number(x.accepted||0)),declined=Math.max(0,Number(x.declined||0)),decided=accepted+declined,backendRate=Number(x.acceptanceRate);out.offerOpen=Number(x.open||0);out.offerAcceptance=Number.isFinite(backendRate)?backendRate:(decided>0?(accepted/decided*100):0);out.offerArchive=decided;delete out.offerStats;
    }
    if(jobs[1].status==='fulfilled')out.billed=Array.isArray(jobs[1].value)?jobs[1].value.length:0;
    if(jobs[2].status==='fulfilled'){
      const p=jobs[2].value||{},st=p.state||{},done=st.status==='Uebergeben'&&!st.changedSinceApproval,due=String(done?p.nextDueDate:p.dueDate||'');
      if(/^\d{4}-\d{2}-\d{2}$/.test(due))out.payroll=Math.max(0,diffDays(dayIso(now),due));
    }
    const cal=await refreshCalendarCount();if(cal!==null&&cal!==undefined)out.calendar=cal;
    try{const rows=await window.api({action:'getEmployees'});if(Array.isArray(rows))out.admin=rows.length;}catch(_e){}
    out.health=window.DG3&&DG3.backend?0:1;
    writeJson(extraKey(),{ts:Date.now(),data:out});applyExtra(out);return out;
  })().finally(()=>{S.extraPromise=null;});
  return S.extraPromise;
}
async function refreshInquirySubcounts(){
  if(!navigator.onLine||typeof window.api!=='function'||typeof window.chefPayload!=='function')return;
  try{
    const [o,a]=await Promise.all([
      window.api(window.chefPayload({action:'getCustomerInquiries',status:'Offen'})),
      window.api(window.chefPayload({action:'getCustomerInquiries',status:'Archiviert'}))
    ]);
    const open=Array.isArray(o)?o:[],aq=open.filter(x=>String(x.source||'').toUpperCase().includes('AQON')).length,reg=open.length-aq;
    document.querySelectorAll('[data-sub-count="regularInquiries"]').forEach(e=>e.textContent=String(reg));
    document.querySelectorAll('[data-sub-count="aqonInquiries"]').forEach(e=>e.textContent=String(aq));
    document.querySelectorAll('[data-sub-count="websiteInquiries"]').forEach(e=>e.textContent='0');
    document.querySelectorAll('[data-sub-count="whatsappInquiries"]').forEach(e=>e.textContent='0');
    document.querySelectorAll('[data-sub-count="inquiryArchive"]').forEach(e=>e.textContent=String(Array.isArray(a)?a.length:0));
  }catch(_e){}
}

function syncLabels(){
  const d=dash();if(!d)return;
  Object.entries(TILES).forEach(([k,t])=>{const e=d.querySelector('[data-dg80-final="'+CSS.escape(k)+'"] span');if(e)e.textContent=t.label;});
  const title=q('dg80OfficeTitle');if(title&&S.active&&LEAF[S.active])title.textContent=LEAF[S.active].title;
  const completed=q('d3Completed');if(completed){
    const h=completed.querySelector(':scope > .dg48-head h2,:scope > h2');if(h)h.textContent='Rechnung zu erstellen';
    [...completed.querySelectorAll('button')].forEach(b=>{if(/Offene Regieberichte|Rechnungen zu erstellen/i.test((b.textContent||'').trim()))b.textContent='🟢 Rechnungen zu erstellen';});
  }
  const create=q('d3OfferCreate')?.querySelector('h3');if(create)create.textContent='Zu erstellende Angebote';
  const open=q('d3OfferOpen')?.querySelector('h3');if(open)open.textContent='Offene Angebote';
  const head=q('dg48EmployeeClosures')?.querySelector(':scope > .dg48-head h2,:scope > h2');if(head)head.textContent='Offene Tagesabschlüsse';
  const sh=q('dg70ShopWindow')?.querySelector('.dg70-shop-head h2');if(sh&&sh.textContent.trim()==='Einkauf')sh.textContent='Einkaufsliste';
  syncShopping();
}

function setOfficeMode(on){q('mainScreen')?.classList.toggle('dg80-office-mode',!!on);}
function mount(force){
  css();
  let d=dash();
  if(!d){
    const ensure=fn('dg742EnsureOffice')||fn('d3InstallOffice');if(ensure)try{ensure();}catch(_e){}
    d=dash();
  }
  if(!d)return false;
  root()?.classList.add('dg80-office-shell');
  buildDashboard(!!force||d.dataset.dg80Final!=='1');
  syncLabels();paintDirty();setOfficeMode(visibleBoss());
  const cachedExtra=readJson(extraKey(),null);if(cachedExtra&&cachedExtra.data)applyExtra(cachedExtra.data);
  S.mounted=true;document.documentElement.dataset.dgUiFinal=V;return true;
}

function wrapRuntime(){
  if(S.wrapped)return;S.wrapped=true;
  const sb=window.showBoss,se=window.showEmployee,db=window.d3Dashboard;
  if(typeof sb==='function'){
    window.showBoss=function(){const r=sb.apply(this,arguments);setOfficeMode(true);mount(false);setTimeout(()=>{mount(false);syncLabels();},0);return r;};
    try{if(typeof showBoss!=='undefined')showBoss=window.showBoss;}catch(_e){}
  }
  if(typeof se==='function'){
    window.showEmployee=function(){const r=se.apply(this,arguments);setOfficeMode(false);return r;};
    try{if(typeof showEmployee!=='undefined')showEmployee=window.showEmployee;}catch(_e){}
  }
  if(typeof db==='function'){
    window.d3Dashboard=async function(){const r=await db.apply(this,arguments);syncLabels();paintDirty();return r;};
    try{if(typeof d3Dashboard!=='undefined')d3Dashboard=window.d3Dashboard;}catch(_e){}
  }
  root()?.addEventListener('input',paintDirty,true);root()?.addEventListener('change',paintDirty,true);
  window.addEventListener('storage',e=>{if(e.key===SHOP_KEY)syncShopping();});
}

/* ----- Tagesabschluss-Prüfung: finaler Wrapper auf dem tatsächlich zuletzt geladenen Renderer ----- */
function parseDate(v){const p=String(v||'').split('-').map(Number);return p.length===3&&p[0]&&p[1]&&p[2]?new Date(p[0],p[1]-1,p[2],12):null;}
function addDays(d,n){const x=new Date(d.getFullYear(),d.getMonth(),d.getDate(),12);x.setDate(x.getDate()+n);return x;}
function monday(d){const x=d.getDay()===0?7:d.getDay();return addDays(d,1-x);}
function deDateObj(d){return String(d.getDate()).padStart(2,'0')+'.'+String(d.getMonth()+1).padStart(2,'0')+'.'+d.getFullYear();}
function groupWeeks(rows){
  const boxes=[...document.querySelectorAll('#dg48DayResult .dg48-days-employee')];
  (rows||[]).forEach((emp,ei)=>{
    const grid=boxes[ei]?.querySelector(':scope > .dg48-day-grid');if(!grid)return;
    grid.querySelectorAll(':scope > .dg80-week-heading').forEach(x=>x.remove());
    const cards=[...grid.querySelectorAll(':scope > .dg48-day')],pairs=(emp.days||[]).map((day,i)=>({day,card:cards[i]})).filter(x=>x.card&&parseDate(x.day?.date)).sort((a,b)=>String(a.day.date).localeCompare(String(b.day.date)));
    let wk='';pairs.forEach(p=>{const d=parseDate(p.day.date),m=monday(d),s=addDays(m,6),k=dayIso(m);if(k!==wk){wk=k;const h=document.createElement('div');h.className='dg80-week-heading';h.textContent='Woche von '+deDateObj(m)+' bis '+deDateObj(s);grid.appendChild(h);}grid.appendChild(p.card);});
  });
}
function period(){return {year:Number(q('dg48DayYear')?.value||q('bossYear')?.value||new Date().getFullYear()),month:Number(q('dg48DayMonth')?.value||q('bossMonth')?.value||(new Date().getMonth()+1))};}
function de(v){if(typeof window.formatDateDE==='function')return window.formatDateDE(v);const p=String(v||'').split('-');return p.length===3?p[2]+'.'+p[1]+'.'+p[0]:String(v||'');}
function minutes(v){const m=String(v||'').match(/^(\d{1,2}):(\d{2})$/);return m?Number(m[1])*60+Number(m[2]):null;}
function reviewedKey(){const p=period();return 'dg522_reviewed_'+p.year+'_'+p.month;}
function reviewedSet(){try{return new Set(JSON.parse(localStorage.getItem(reviewedKey())||'[]'));}catch(_e){return new Set();}}
function remember(id){const s=reviewedSet();s.add(id);try{localStorage.setItem(reviewedKey(),JSON.stringify([...s]));}catch(_e){}}
function b64(bytes){let b='';bytes.forEach(x=>b+=String.fromCharCode(x));return btoa(b).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');}
async function issueId(parts){const txt=parts.map(x=>String(x==null?'':x).trim()).join('|');if(window.crypto?.subtle){const h=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(txt));return 'PAY-'+b64(new Uint8Array(h)).slice(0,24);}let h=2166136261;for(let i=0;i<txt.length;i++){h^=txt.charCodeAt(i);h=Math.imul(h,16777619);}return 'DGLOCAL-'+(h>>>0).toString(16);}
async function addIssue(list,severity,type,employee,date,title,detail,key){
  const p=period(),id=await issueId([p.year,p.month,employee,date||'',type,key||'']);list.push({id,severity,type,employee,date:date||'',title,detail:detail||'',reviewed:reviewedSet().has(id)});
}
async function auditRows(rows){
  const out=[];
  for(const emp of (rows||[])){
    const name=String(emp.employee||''),days=(emp.days||[]).slice().sort((a,b)=>String(a.date||'').localeCompare(String(b.date||'')));
    for(const day of days){
      const d=String(day.date||''),net=Number(day.hours||0),pause=Number(day.pauseHours||0),reports=day.reports||[];
      if(net>10.0001)await addIssue(out,'error','daily_over_10',name,d,'Mehr als 10 Stunden Arbeitszeit','Netto-Arbeitszeit '+net.toFixed(2).replace('.',',')+' Std.');
      else if(net>8.0001)await addIssue(out,'warn','daily_over_8',name,d,'Mehr als 8 Stunden Arbeitszeit','Netto-Arbeitszeit '+net.toFixed(2).replace('.',',')+' Std.');
      if(!day.closed)await addIssue(out,'error','day_not_closed',name,d,'Tagesabschluss fehlt','Für diesen Arbeitstag wurde kein Tagesabschluss gefunden.');
      const req=net>9?0.75:(net>6?0.5:0);if(req&&pause+0.0001<req)await addIssue(out,'error','pause_short',name,d,'Pause zu kurz','Erfasst '+Math.round(pause*60)+' Min.; erforderlich mindestens '+Math.round(req*60)+' Min.');
      if(day.status&&day.status!=='Arbeiten')await addIssue(out,day.status==='Feiertag'?'warn':'error','work_and_status',name,d,'Arbeitszeit und '+day.status+' am selben Tag','Es sind Arbeitsstunden erfasst und der Tag ist zugleich als '+day.status+' markiert.');
      for(const r of reports){const a=minutes(r.start),b=minutes(r.end);if(!(Number(r.hours)>0)||a===null||b===null)await addIssue(out,'error','invalid_entry',name,d,'Unplausibler Zeiteintrag',(r.customer||'Ohne Kunde')+' · '+(r.start||'?')+'–'+(r.end||'?'),String(r.id||''));}
      for(let i=0;i<reports.length;i++)for(let j=i+1;j<reports.length;j++)if(norm(reports[i].customer)===norm(reports[j].customer)&&reports[i].start===reports[j].start&&reports[i].end===reports[j].end)await addIssue(out,'warn','duplicate_entry',name,d,'Möglicher Doppeleintrag',(reports[i].customer||'Ohne Kunde')+' · '+reports[i].start+'–'+reports[i].end,String(reports[i].id||'')+'|'+String(reports[j].id||''));
      const ints=reports.map(r=>{let a=minutes(r.start),b=minutes(r.end);if(a===null||b===null)return null;if(b<a)b+=1440;return {a,b,r};}).filter(Boolean).sort((a,b)=>a.a-b.a);
      for(let i=1;i<ints.length;i++)if(ints[i].a<ints[i-1].b){await addIssue(out,'error','overlap_local',name,d,'Überschneidende Uhrzeiten',(ints[i-1].r.customer||'Eintrag 1')+' '+ints[i-1].r.start+'–'+ints[i-1].r.end+' / '+(ints[i].r.customer||'Eintrag 2')+' '+ints[i].r.start+'–'+ints[i].r.end,'local-overlap-'+i);break;}
    }
    for(let i=1;i<days.length;i++){
      const prev=(days[i-1].reports||[]).slice().sort((a,b)=>String(a.end||'').localeCompare(String(b.end||''))).pop(),next=(days[i].reports||[]).slice().sort((a,b)=>String(a.start||'').localeCompare(String(b.start||'')))[0];if(!prev||!next)continue;
      const a=minutes(prev.end),b=minutes(next.start);if(a===null||b===null)continue;const rest=(1440-a+b)/60;if(rest<11)await addIssue(out,'warn','rest_under_11',name,String(days[i].date||''),'Ruhezeit unter 11 Stunden','Zwischen '+de(days[i-1].date)+' '+prev.end+' und '+de(days[i].date)+' '+next.start+' liegen nur '+rest.toFixed(2).replace('.',',')+' Std.');
    }
  }
  return out;
}
function employeeBox(name){return [...document.querySelectorAll('#dg48DayResult .dg48-days-employee')].find(box=>norm((box.querySelector('.dg521-employee-head strong')||box.querySelector(':scope > strong'))?.textContent)===norm(name));}
function issueHtml(x){
  const cls=x.reviewed?'reviewed':x.severity,icon=x.reviewed?'🟢':x.severity==='error'?'🔴':'🟠';
  return '<div class="dg80-review-issue '+cls+'"><div class="dg80-review-head">'+icon+' '+esc(x.date?de(x.date)+' · ':'')+esc(x.title)+' · '+(x.reviewed?'geprüft – korrekt':'prüfen')+'</div>'+(x.detail?'<div class="dg80-review-detail">'+esc(x.detail)+'</div>':'')+'<div class="dg80-review-actions">'+(x.date?'<button class="btn secondary" type="button" data-review-day="'+esc(x.date)+'" data-review-emp="'+esc(encodeURIComponent(x.employee))+'">Tag öffnen</button>':'')+(!x.reviewed?'<button class="btn success" type="button" data-review-id="'+esc(encodeURIComponent(x.id))+'" data-review-emp="'+esc(encodeURIComponent(x.employee))+'" data-review-date="'+esc(x.date||'')+'">✓ Geprüft – korrekt</button>':'')+'</div></div>';
}
function renderReviews(rows){
  S.reviewRows=rows||[];
  auditRows(S.reviewRows).then(issues=>{
    S.reviewIssues=issues;
    for(const emp of S.reviewRows){
      const name=String(emp.employee||''),box=employeeBox(name);if(!box)continue;
      const list=issues.filter(x=>x.employee===name),open=list.filter(x=>!x.reviewed);
      let panel=box.querySelector(':scope > .dg80-review-panel');if(!panel){panel=document.createElement('div');panel.className='dg80-review-panel';const head=box.querySelector(':scope > .dg521-employee-head');if(head)head.insertAdjacentElement('afterend',panel);else box.prepend(panel);}
      panel.innerHTML='<div class="dg80-review-title">Schnellprüfung '+esc(name)+'</div><div class="dg80-review-note">Rot und Orange bitte bewusst kontrollieren. Die vollständige Lohn-/Monatsprüfung erfolgt zusätzlich im Monatsabschluss.</div>'
        +(!list.length?'<div class="status ok">🟢 Keine Auffälligkeiten in den übertragenen Tagesabschlüssen.</div>':'<div class="muted small">'+list.length+' Prüfposition'+(list.length===1?'':'en')+': '+open.length+' offen · '+(list.length-open.length)+' geprüft.</div><div class="dg80-review-list">'+list.map(issueHtml).join('')+'</div>'+(open.length?'<div style="margin-top:10px"><button class="btn success" type="button" data-review-all="'+esc(encodeURIComponent(name))+'" style="width:100%">✓ Alle Auffälligkeiten geprüft – Mitarbeiter freigeben</button></div>':'<div class="status ok" style="margin-top:10px">✓ Mitarbeiter geprüft / freigegeben</div>'));
    }
  }).catch(e=>console.warn('DG Tagesabschluss-Prüfung',e));
}
function installReviewClicks(){
  if(root()?.dataset.dg80ReviewClicks==='1')return;if(!root())return;root().dataset.dg80ReviewClicks='1';
  root().addEventListener('click',async e=>{
    const day=e.target.closest('[data-review-day]');if(day){e.preventDefault();const f=fn('dg520OpenDay');if(f)f(day.dataset.reviewEmp,day.dataset.reviewDay);return;}
    const one=e.target.closest('[data-review-id]');if(one){e.preventDefault();await reviewOne(decodeURIComponent(one.dataset.reviewId),decodeURIComponent(one.dataset.reviewEmp),one.dataset.reviewDate);return;}
    const all=e.target.closest('[data-review-all]');if(all){e.preventDefault();await reviewAll(decodeURIComponent(all.dataset.reviewAll));}
  });
}
async function reviewOne(id,employee,date){
  try{const p=period();await window.api(window.chefPayload({action:'markPayrollIssueReviewed',issueId:id,targetEmployee:employee,year:p.year,month:p.month,date:date||'',note:'Geprüft – korrekt in Mitarbeiter-Tagesübersicht'}));remember(id);renderReviews(S.reviewRows);}catch(e){if(typeof window.d3Notice==='function')window.d3Notice(e.message,'error');}
}
async function reviewAll(employee){
  const open=S.reviewIssues.filter(x=>x.employee===employee&&!x.reviewed);if(!open.length)return;if(!confirm(employee+': '+open.length+' Auffälligkeit'+(open.length===1?'':'en')+' als geprüft und korrekt bestätigen?'))return;
  for(const x of open)await reviewOne(x.id,employee,x.date);
}
function installDayReviewWrap(){
  if(window.__DG80_FINAL_DAY_WRAP||typeof window.renderBossDayClosuresV48!=='function')return;
  window.__DG80_FINAL_DAY_WRAP=true;
  const base=window.renderBossDayClosuresV48;
  window.renderBossDayClosuresV48=function(rows){
    const r=base.apply(this,arguments);try{groupWeeks(rows||[]);}catch(_e){}setTimeout(()=>renderReviews(rows||[]),0);return r;
  };
  installReviewClicks();
}

function install(){
  css();installDayReviewWrap();wrapRuntime();
  let tries=0;(function ready(){if(mount(false))return;if(++tries<30)setTimeout(ready,100);})();
  setTimeout(()=>{if(visibleBoss()){mount(false);syncLabels();}},0);
}
window.dg80FinalMount=mount;
window.dg80FinalClose=closeMenus;
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});else install();
document.addEventListener('visibilitychange',()=>{if(!document.hidden&&visibleBoss()){syncLabels();paintDirty();}});
})();


/* DG Zeiterfassung 9.0 - UI Hotfix 12
   Dashboard-Handlungsfarben, aktive Kalender, offene Tagesabschluesse,
   Auffaelligkeiten-Pruefzentrale, dynamische Lohnfaelligkeit und Jahreszaehler. */
(function(){
'use strict';
const V='8.0-ui12';
const q=id=>document.getElementById(id);
const S=window.DG80_UI12=window.DG80_UI12||{
  installed:false,calendarCount:null,billedYear:null,billedCount:null,
  audit:null,adminRows:[],busy:false,observer:null
};

function esc(v){return String(v==null?'':v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function norm(v){return String(v==null?'':v).trim().toLowerCase().replace(/\s+/g,' ');}
function isActive(v){
  if(v===false||v===0||v===null)return false;
  const s=String(v==null?'1':v).trim().toLowerCase();
  return !['0','false','nein','no','inaktiv','inactive','gelöscht','geloescht','deleted'].includes(s);
}
function apiCall(payload){
  if(typeof window.api!=='function')return Promise.reject(new Error('Backend nicht bereit.'));
  if(typeof window.chefPayload==='function')return window.api(window.chefPayload(payload));
  return window.api(payload);
}
function bossRoot(){return q('bossView');}
function dash(){return bossRoot()?.querySelector(':scope > .d3-dashboard');}
function fmtDate(v){const p=String(v||'').split('-');return p.length===3?p[2]+'.'+p[1]+'.'+p[0]:String(v||'');}
function monthKey(){const d=new Date();return {year:d.getFullYear(),month:d.getMonth()+1};}
function empId(name){
  const n=norm(name),r=(S.adminRows||[]).find(x=>norm(x.name||x.employee||x.displayName)===n);
  return r?(r.personnelNumber||r.employeeId||r.id||r.name):name;
}
function setText(id,v){const e=q(id);if(e&&e.textContent!==String(v))e.textContent=String(v);}
function numericText(el){if(!el)return NaN;const m=String(el.textContent||'').match(/-?\d+/);return m?Number(m[0]):NaN;}

function addCss(){
  if(q('dg80Ui12Css'))return;
  const s=document.createElement('style');s.id='dg80Ui12Css';
  s.textContent=''
    +'#dg80FinalSave{background:#fee2e2!important;border-color:#ef9a9a!important;color:#991b1b!important}'
    +'#dg80FinalSave span,#dg80FinalSave strong{color:#991b1b!important}'
    +'#dg80FinalCalendar{background:#dbeafe!important;border-color:#93c5fd!important;color:#1d4ed8!important}'
    +'#dg80FinalCalendar span,#dg80FinalCalendar strong{color:#1d4ed8!important}'
    +'#bossView .dg80-final-tile.dg80-hot,#bossView .dg80-final-tile.dg80-anomaly.dg80-hot{background:#fee2e2!important;border-color:#ef9a9a!important;color:#991b1b!important}'
    +'#bossView .dg80-final-tile.dg80-hot span,#bossView .dg80-final-tile.dg80-hot strong,#bossView .dg80-final-tile.dg80-anomaly.dg80-hot span,#bossView .dg80-final-tile.dg80-anomaly.dg80-hot strong{color:#991b1b!important}'
    +'#bossView .dg80-final-tile.dg80-anomaly{background:#e8f7ea;border:1px solid #b9e4c1}'
    +'#dg80ActionCenter{padding:18px!important}'
    +'.dg80-ac-head{display:flex;gap:12px;align-items:center;justify-content:space-between;flex-wrap:wrap;margin-bottom:14px}'
    +'.dg80-ac-head h2{margin:0;color:#31589e}'
    +'.dg80-ac-tablewrap{overflow:auto;border:1px solid #dbe2ea;border-radius:14px;background:#fff}'
    +'.dg80-ac-table{width:100%;border-collapse:collapse;min-width:760px}'
    +'.dg80-ac-table th,.dg80-ac-table td{padding:10px 12px;border-bottom:1px solid #e5e7eb;text-align:left;vertical-align:top}'
    +'.dg80-ac-table th{background:#f8fafc;font-size:13px;color:#475569;position:sticky;top:0}'
    +'.dg80-ac-actions{display:flex;gap:7px;flex-wrap:wrap}.dg80-ac-actions .btn{width:auto!important;margin:0!important}'
    +'.dg80-ac-badge{display:inline-block;border-radius:999px;padding:3px 8px;font-size:12px;font-weight:900}'
    +'.dg80-ac-badge.error{background:#fee2e2;color:#991b1b}.dg80-ac-badge.warn{background:#fef3c7;color:#92400e}.dg80-ac-badge.ok{background:#dcfce7;color:#166534}'
    +'@media(max-width:759px){#dg80ActionCenter{padding:12px!important}.dg80-ac-actions .btn{width:100%!important}.dg80-ac-head .btn{width:100%!important}}';
  document.head.appendChild(s);
}

function ensureAnomalyTile(){
  const d=dash();if(!d)return;
  const sec=d.querySelector('.dg80-final-section[data-section="admin"] .dg80-final-grid');if(!sec)return;
  let t=sec.querySelector('[data-dg80-final="anomalies"]');
  if(!t){
    t=document.createElement('button');t.type='button';t.draggable=false;
    t.className='d3-tile dg80-final-tile dg80-anomaly';
    t.dataset.dg80Final='anomalies';
    t.innerHTML='<span>Auffälligkeiten</span><strong id="dg80c-anomalies">0</strong>';
    const health=sec.querySelector('[data-dg80-final="health"]');
    if(health)sec.insertBefore(t,health);else sec.appendChild(t);
  }
  const n=S.audit&&Array.isArray(S.audit.issues)?S.audit.issues.filter(x=>!x.reviewed).length:0;
  setText('dg80c-anomalies',n);t.classList.toggle('dg80-hot',n>0);
}

function paintActionTiles(){
  const d=dash();if(!d)return;
  ['completed','offerCreate','days','reminders','customers'].forEach(k=>{
    const t=d.querySelector('[data-dg80-final="'+k+'"]');if(!t)return;
    const n=numericText(t.querySelector('strong'));t.classList.toggle('dg80-hot',Number.isFinite(n)&&n>0);
  });
  ensureAnomalyTile();
  const year=new Date().getFullYear();
  const billed=d.querySelector('[data-dg80-final="billed"]');
  if(billed){
    const lab=billed.querySelector('span');if(lab)lab.textContent='Abgerechnete Aufträge '+year;
    if(S.billedYear===year&&S.billedCount!==null)setText(billed.querySelector('strong')?.id||'dg80c-billed',S.billedCount);
  }
}

function formatPayroll(){
  const e=q('dg80TopPayroll');if(!e)return;
  const n=numericText(e);
  if(!Number.isFinite(n))return;
  let txt='';
  if(n===0)txt='heute fällig';
  else if(n===1)txt='in 1 Tag fällig';
  else if(n>1)txt='in '+n+' Tagen fällig';
  else if(n===-1)txt='seit 1 Tag fällig';
  else txt='seit '+Math.abs(n)+' Tagen fällig';
  if(e.textContent!==txt)e.textContent=txt;
}

async function refreshCalendarCount(){
  try{
    const wr=await apiCall({action:'getPlannerWorkers'});
    const rows=Array.isArray(wr)?wr:[];
    const active=rows.filter(w=>w&&(w.active===true||w.active===1||String(w.active).trim()==='1'||String(w.active).trim().toLowerCase()==='true'));
    S.calendarCount=active.length;
    setText('dg80c-calendar',S.calendarCount);
    return S.calendarCount;
  }catch(_e){return null;}
}
async function refreshYearlyBilled(){
  const year=new Date().getFullYear();
  try{
    const rows=await apiCall({action:'getRegieReports',status:'Abgerechnet',year:year,month:0});
    S.billedYear=year;S.billedCount=Array.isArray(rows)?rows.length:0;
    setText('dg80c-billed',S.billedCount);paintActionTiles();
  }catch(_e){}
}

async function refreshAudit(){
  const p=monthKey();
  try{
    const a=await apiCall({action:'getMonthPayrollAudit',year:p.year,month:p.month});
    S.audit=window.dg16SanitizePayrollAudit?window.dg16SanitizePayrollAudit(a||{issues:[]}):(a||{issues:[]});
    if(!S.adminRows.length){
      try{const r=await apiCall({action:'getEmployeeAdminData'});if(Array.isArray(r))S.adminRows=r;}catch(_e){}
    }
    ensureAnomalyTile();
    return S.audit;
  }catch(_e){
    S.audit=S.audit||{issues:[]};ensureAnomalyTile();return S.audit;
  }
}

async function refreshAll(force){
  if(S.busy&&!force)return;S.busy=true;
  try{await Promise.allSettled([refreshCalendarCount(),refreshYearlyBilled(),refreshAudit()]);}
  finally{S.busy=false;enforce();}
}

function openCenter(title){
  const r=bossRoot();if(!r)return null;
  r.querySelectorAll(':scope > .dg80-shell-active').forEach(x=>x.classList.remove('dg80-shell-active'));
  let card=q('dg80ActionCenter');
  if(!card){card=document.createElement('div');card.id='dg80ActionCenter';card.className='card';r.appendChild(card);}
  card.classList.add('dg80-shell-active');
  const tb=q('dg80OfficeToolbar');if(tb)tb.classList.add('active');
  const t=q('dg80OfficeTitle');if(t)t.textContent=title;
  return card;
}

async function loadOpenDaysCenter(){
  const card=openCenter('Offene Tagesabschlüsse');if(!card)return;
  card.innerHTML='<div class="dg80-ac-head"><h2>Offene Tagesabschlüsse</h2><button class="btn secondary" type="button" id="dg80ReloadOpenDays">Aktualisieren</button></div><div class="status info">Offene Tagesabschlüsse werden geladen ...</div>';
  q('dg80ReloadOpenDays')?.addEventListener('click',loadOpenDaysCenter);
  try{
    const p=monthKey();
    const [rows,admins]=await Promise.all([
      apiCall({action:'getBossDayClosures',year:p.year,month:p.month}),
      S.adminRows.length?Promise.resolve(S.adminRows):apiCall({action:'getEmployeeAdminData'}).catch(()=>[])
    ]);
    if(Array.isArray(admins))S.adminRows=admins;
    const list=[];
    (rows||[]).forEach(emp=>(emp.days||[]).forEach(d=>{if(!d.closed)list.push({employee:emp.employee,date:d.date,hours:d.hours,entryCount:d.entryCount});}));
    list.sort((a,b)=>String(a.date).localeCompare(String(b.date))||String(a.employee).localeCompare(String(b.employee)));
    if(!list.length){card.innerHTML='<div class="dg80-ac-head"><h2>Offene Tagesabschlüsse</h2><button class="btn secondary" type="button" id="dg80ReloadOpenDays">Aktualisieren</button></div><div class="status ok">✓ Keine offenen Tagesabschlüsse vorhanden.</div>';q('dg80ReloadOpenDays')?.addEventListener('click',loadOpenDaysCenter);return;}
    card.innerHTML='<div class="dg80-ac-head"><h2>Offene Tagesabschlüsse</h2><button class="btn secondary" type="button" id="dg80ReloadOpenDays">Aktualisieren</button></div><div class="dg80-ac-tablewrap"><table class="dg80-ac-table"><thead><tr><th>Tag</th><th>Mitarbeiter</th><th>Mitarbeiter-ID</th><th>Stunden</th><th>Einträge</th><th>Aktion</th></tr></thead><tbody>'
      +list.map((x,i)=>'<tr><td><strong>'+esc(fmtDate(x.date))+'</strong></td><td>'+esc(x.employee)+'</td><td>'+esc(empId(x.employee))+'</td><td>'+Number(x.hours||0).toFixed(2).replace('.',',')+'</td><td>'+Number(x.entryCount||0)+'</td><td><div class="dg80-ac-actions"><button class="btn success" type="button" data-dg80-close-day="'+i+'">Manuell erfassen / freigeben</button></div></td></tr>').join('')
      +'</tbody></table></div>';
    q('dg80ReloadOpenDays')?.addEventListener('click',loadOpenDaysCenter);
    card.querySelectorAll('[data-dg80-close-day]').forEach(b=>b.addEventListener('click',async()=>{
      const x=list[Number(b.dataset.dg80CloseDay)];if(!x)return;
      if(!confirm('Tag '+fmtDate(x.date)+' für '+x.employee+' manuell abschließen und freigeben?'))return;
      try{b.disabled=true;await apiCall({action:'manualCloseBossDay',targetEmployee:x.employee,date:x.date});await refreshAll(true);await loadOpenDaysCenter();}catch(e){alert(e.message||e);}finally{b.disabled=false;}
    }));
  }catch(e){card.innerHTML='<div class="dg80-ac-head"><h2>Offene Tagesabschlüsse</h2></div><div class="status error">'+esc(e.message||e)+'</div>';}
}

window.DG80_UI12_openDays=loadOpenDaysCenter;

async function markIssueReviewed(x){
  const p=monthKey();
  await apiCall({action:'markPayrollIssueReviewed',issueId:x.id,targetEmployee:x.employee,year:p.year,month:p.month,date:x.date||'',note:'Im Büro geprüft und freigegeben'});
}

async function removeIssueEntry(x){
  if(!x.entryId||String(x.entryId).indexOf('assigned:')===0)throw new Error('Für diese Auffälligkeit ist kein direkt löschbarer Mitarbeitereintrag hinterlegt.');
  const reason=prompt('Begründung für das Entfernen des Mitarbeitereintrags:','Fehleintrag / Doppelbuchung');
  if(reason===null)return false;
  if(!String(reason).trim())throw new Error('Bitte eine Begründung eintragen.');
  if(!confirm('Eintrag von '+x.employee+' am '+fmtDate(x.date)+' wirklich entfernen? Die Stunden werden aus Tages- und Monatswerten neu berechnet.'))return false;
  await apiCall({action:'deleteBossDayEntry',targetEmployee:x.employee,date:x.date,entryId:x.entryId,reason:String(reason).trim()});
  return true;
}

async function loadAnomalyCenter(){
  const card=openCenter('Auffälligkeiten');if(!card)return;
  card.innerHTML='<div class="dg80-ac-head"><h2>Auffälligkeiten</h2><button class="btn secondary" type="button" id="dg80ReloadIssues">Aktualisieren</button></div><div class="status info">Auffälligkeiten werden geprüft ...</div>';
  q('dg80ReloadIssues')?.addEventListener('click',loadAnomalyCenter);
  const a=await refreshAudit(),issues=(a&&Array.isArray(a.issues)?a.issues:[]).filter(x=>!x.reviewed).slice();
  issues.sort((a,b)=>String(a.date||'9999').localeCompare(String(b.date||'9999'))||String(a.employee||'').localeCompare(String(b.employee||'')));
  if(!issues.length){card.innerHTML='<div class="dg80-ac-head"><h2>Auffälligkeiten</h2><button class="btn secondary" type="button" id="dg80ReloadIssues">Aktualisieren</button></div><div class="status ok">✓ Keine offenen Auffälligkeiten vorhanden.</div>';q('dg80ReloadIssues')?.addEventListener('click',loadAnomalyCenter);return;}
  card.innerHTML='<div class="dg80-ac-head"><h2>Auffälligkeiten</h2><button class="btn secondary" type="button" id="dg80ReloadIssues">Aktualisieren</button></div><div class="dg80-ac-tablewrap"><table class="dg80-ac-table"><thead><tr><th>Tag</th><th>Mitarbeiter</th><th>Mitarbeiter-ID</th><th>Auffälligkeit</th><th>Details</th><th>Aktionen</th></tr></thead><tbody>'
    +issues.map((x,i)=>'<tr><td>'+esc(x.date?fmtDate(x.date):'–')+'</td><td><strong>'+esc(x.employee||'–')+'</strong></td><td>'+esc(empId(x.employee||''))+'</td><td><span class="dg80-ac-badge '+(x.severity==='error'?'error':'warn')+'">'+(x.severity==='error'?'Fehler':'Prüfen')+'</span><br><strong>'+esc(x.title||x.type||'Auffälligkeit')+'</strong></td><td>'+esc(x.detail||'')+'</td><td><div class="dg80-ac-actions"><button class="btn success" type="button" data-dg80-review="'+i+'">✓ Geprüft / freigeben</button>'+(x.entryId&&String(x.entryId).indexOf('assigned:')!==0?'<button class="btn danger" type="button" data-dg80-remove="'+i+'">Mitarbeitereintrag entfernen</button>':'')+'</div></td></tr>').join('')
    +'</tbody></table></div>';
  q('dg80ReloadIssues')?.addEventListener('click',loadAnomalyCenter);
  card.querySelectorAll('[data-dg80-review]').forEach(b=>b.addEventListener('click',async()=>{const x=issues[Number(b.dataset.dg80Review)];if(!x)return;try{b.disabled=true;await markIssueReviewed(x);await refreshAll(true);await loadAnomalyCenter();}catch(e){alert(e.message||e);}finally{b.disabled=false;}}));
  card.querySelectorAll('[data-dg80-remove]').forEach(b=>b.addEventListener('click',async()=>{const x=issues[Number(b.dataset.dg80Remove)];if(!x)return;try{b.disabled=true;const ok=await removeIssueEntry(x);if(ok){await refreshAll(true);await loadAnomalyCenter();}}catch(e){alert(e.message||e);}finally{b.disabled=false;}}));
}

function installCapture(){
  if(document.documentElement.dataset.dg80Ui12Clicks==='1')return;
  document.documentElement.dataset.dg80Ui12Clicks='1';
  document.addEventListener('click',e=>{
    const t=e.target.closest('[data-dg80-final]');
    if(!t||!bossRoot()?.contains(t))return;
    const k=t.dataset.dg80Final;
    if(k==='days'){e.preventDefault();e.stopImmediatePropagation();loadOpenDaysCenter();}
    else if(k==='anomalies'){e.preventDefault();e.stopImmediatePropagation();(window.DG80_UI13_openAnomalies||loadAnomalyCenter)();}
  },true);
}

function enforce(){
  addCss();ensureAnomalyTile();paintActionTiles();formatPayroll();
  if(S.calendarCount!==null)setText('dg80c-calendar',S.calendarCount);
  const year=new Date().getFullYear(),b=dash()?.querySelector('[data-dg80-final="billed"]');
  if(b){
    const lab=b.querySelector('span');if(lab)lab.textContent='Abgerechnete Aufträge '+year;
    if(S.billedYear===year&&S.billedCount!==null){const st=b.querySelector('strong');if(st&&st.textContent!==String(S.billedCount))st.textContent=String(S.billedCount);}
  }
}
function observe(){
  if(S.observer)return;
  S.observer=new MutationObserver(()=>{clearTimeout(S._timer);S._timer=setTimeout(enforce,0);});
  S.observer.observe(document.body,{subtree:true,childList:true,characterData:true});
}
function install(){
  if(S.installed)return;S.installed=true;
  addCss();installCapture();observe();
  let n=0;(function ready(){enforce();if(dash())return;if(++n<40)setTimeout(ready,100);})();
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)enforce();});
  document.documentElement.dataset.dgUi12=V;
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});else install();
})();


/* DG Zeiterfassung 9.0 - UI Hotfix 13
   Verschlankte Pruefregeln + gezielte Tagesbearbeitung aus Auffaelligkeiten. */
(function(){
'use strict';
const V='8.0-ui13';
const q=id=>document.getElementById(id);
const S=window.DG80_UI13=window.DG80_UI13||{admins:[],audit:null,wrapped:false,cleanTimer:null};

function esc(v){return String(v==null?'':v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function norm(v){return String(v==null?'':v).trim().toLowerCase().replace(/\s+/g,' ');}
function fmtDate(v){const p=String(v||'').split('-');return p.length===3?p[2]+'.'+p[1]+'.'+p[0]:String(v||'');}
function monthKey(){const d=new Date();return {year:d.getFullYear(),month:d.getMonth()+1};}
function isActive(v){
  if(v===false||v===0||v===null)return false;
  const s=String(v==null?'1':v).trim().toLowerCase();
  return !['0','false','nein','no','inaktiv','inactive','gelöscht','geloescht','deleted'].includes(s);
}
function adminFor(name){const n=norm(name);return (S.admins||[]).find(x=>norm(x.name||x.employee||x.displayName)===n)||null;}
function isChef(name){const a=adminFor(name);return !!(a&&a.chefAccess);}
function isInactive(name){const a=adminFor(name);return !!(a&&!isActive(a.active));}
function empId(name){const a=adminFor(name);return a?(a.personnelNumber||a.employeeId||a.id||a.name):name;}
function issueEmployee(x){return String(x&&x.employee||'');}

function isPauseIssue(x){
  const s=norm((x&&x.type)+' '+(x&&x.title)+' '+(x&&x.detail));
  return s.includes('pause_short')||s.includes('pause zu kurz');
}
function isTargetDeviation(x){
  const s=norm((x&&x.type)+' '+(x&&x.title)+' '+(x&&x.detail));
  return s.includes('tages-soll')||s.includes('tagessoll')||s.includes('abweichung von tages')||s.includes('target deviation')||s.includes('daily_target');
}
function isWageMissing(x){
  const s=norm((x&&x.type)+' '+(x&&x.title)+' '+(x&&x.detail));
  return s.includes('stundenlohn fehlt')||s.includes('hourly wage')&&s.includes('fehlt')||s.includes('missing_hourly')||s.includes('hourly_wage_missing');
}
function isOverlap(x){
  const s=norm((x&&x.type)+' '+(x&&x.title)+' '+(x&&x.detail));
  return s.includes('overlap')||s.includes('überschneid')||s.includes('ueberschneid');
}
function suppressIssue(x){
  if(!x)return false;
  if(isPauseIssue(x)||isTargetDeviation(x))return true;
  const emp=issueEmployee(x);
  if(isWageMissing(x)&&isInactive(emp))return true;
  if(isOverlap(x)&&isChef(emp))return true;
  return false;
}
function sanitizeAudit(a){
  if(!a||typeof a!=='object')return a;
  const out=Object.assign({},a);
  out.issues=(Array.isArray(a.issues)?a.issues:[]).filter(x=>!suppressIssue(x));
  const errors=out.issues.filter(x=>x.severity==='error'&&!x.reviewed).length;
  const warnings=out.issues.filter(x=>x.severity!=='error'&&!x.reviewed).length;
  const reviewedWarnings=out.issues.filter(x=>x.severity!=='error'&&x.reviewed).length;
  out.summary=Object.assign({},a.summary||{},{
    errors:errors,warnings:warnings,reviewedWarnings:reviewedWarnings
  });
  out.canRelease=errors===0&&warnings===0;
  return out;
}
async function loadAdminsWith(base){
  try{
    const rows=await base({action:'getEmployeeAdminData',employee:localStorage.getItem('dg_employee')||'',employeePin:sessionStorage.getItem('dg_employee_pin')||''});
    if(Array.isArray(rows))S.admins=rows;
  }catch(_e){}
}
function wrapApi(){
  if(S.wrapped||typeof window.api!=='function')return;S.wrapped=true;
  const base=window.api;
  window.api=async function(payload){
    const r=await base.apply(this,arguments);
    try{
      if(payload&&payload.action==='getEmployeeAdminData'&&Array.isArray(r))S.admins=r;
      if(payload&&payload.action==='getMonthPayrollAudit'){
        if(!S.admins.length)await loadAdminsWith(base);
        const clean=sanitizeAudit(r);S.audit=clean;return clean;
      }
    }catch(_e){}
    return r;
  };
}

function employeeFromNode(node){
  const box=node?.closest?.('.dg48-days-employee');
  if(box){
    const h=box.querySelector('.dg521-employee-head strong')||box.querySelector(':scope > strong');
    if(h)return String(h.textContent||'').trim();
  }
  const txt=String(node?.textContent||'');
  const a=(S.admins||[]).find(x=>txt.includes(String(x.name||'')));
  return a?String(a.name):'';
}
function hideLegacyNoise(){
  const sels=['.dg522-issue','.dg80-review-issue','.dg520-issue'];
  document.querySelectorAll(sels.join(',')).forEach(el=>{
    const txt=String(el.textContent||''),emp=employeeFromNode(el);
    const fake={employee:emp,title:txt,detail:txt,type:''};
    if(suppressIssue(fake))el.remove();
  });
  document.querySelectorAll('.dg48-days-employee').forEach(box=>{
    const remaining=box.querySelectorAll('.dg522-issue,.dg80-review-issue');
    if(remaining.length)return;
    const head=box.querySelector(':scope > .dg521-employee-head');
    if(!head)return;
    head.querySelector('.dg521-lamp')?.classList.add('ok');
    head.querySelector('.dg521-lamp')?.classList.remove('bad');
    const l=head.querySelector('.dg521-plausibility');if(l){l.textContent='Alles plausibel';l.classList.add('ok');l.classList.remove('bad');}
  });
}

function openCenter(title){
  const root=q('bossView');if(!root)return null;
  root.querySelectorAll(':scope > .dg80-shell-active').forEach(x=>x.classList.remove('dg80-shell-active'));
  let card=q('dg80ActionCenter');
  if(!card){card=document.createElement('div');card.id='dg80ActionCenter';card.className='card';root.appendChild(card);}
  card.classList.add('dg80-shell-active');
  q('dg80OfficeToolbar')?.classList.add('active');
  const t=q('dg80OfficeTitle');if(t)t.textContent=title;
  return card;
}
async function apiCall(payload){
  if(typeof window.api!=='function')throw new Error('Backend nicht bereit.');
  if(typeof window.chefPayload==='function')return window.api(window.chefPayload(payload));
  return window.api(payload);
}
async function getAudit(){
  const p=monthKey();
  const [a,admins]=await Promise.all([
    apiCall({action:'getMonthPayrollAudit',year:p.year,month:p.month}),
    S.admins.length?Promise.resolve(S.admins):apiCall({action:'getEmployeeAdminData'}).catch(()=>[])
  ]);
  if(Array.isArray(admins))S.admins=admins;
  S.audit=sanitizeAudit(a||{issues:[]});return S.audit;
}
async function markReviewed(x,note){
  const p=monthKey();
  await apiCall({action:'markPayrollIssueReviewed',issueId:x.id,targetEmployee:x.employee,year:p.year,month:p.month,date:x.date||'',note:note||'Geprüft – korrekt'});
}
function issueSeverity(x){return x.severity==='error'?'Fehler':'Prüfen';}

async function openAnomalies(){
  const card=openCenter('Auffälligkeiten');if(!card)return;
  card.innerHTML='<div class="dg80-ac-head"><h2>Auffälligkeiten</h2><button class="btn secondary" type="button" id="dg13Reload">Aktualisieren</button></div><div class="status info">Auffälligkeiten werden geprüft ...</div>';
  q('dg13Reload')?.addEventListener('click',openAnomalies);
  try{
    const a=await getAudit(),issues=(a.issues||[]).filter(x=>!x.reviewed&&!suppressIssue(x)).slice()
      .sort((x,y)=>String(x.date||'9999').localeCompare(String(y.date||'9999'))||String(x.employee||'').localeCompare(String(y.employee||'')));
    const count=q('dg80c-anomalies');if(count)count.textContent=String(issues.length);
    q('bossView')?.querySelector('[data-dg80-final="anomalies"]')?.classList.toggle('dg80-hot',issues.length>0);
    if(!issues.length){
      card.innerHTML='<div class="dg80-ac-head"><h2>Auffälligkeiten</h2><button class="btn secondary" type="button" id="dg13Reload">Aktualisieren</button></div><div class="status ok">✓ Keine offenen Auffälligkeiten vorhanden.</div>';
      q('dg13Reload')?.addEventListener('click',openAnomalies);return;
    }
    card.innerHTML='<div class="dg80-ac-head"><h2>Auffälligkeiten</h2><button class="btn secondary" type="button" id="dg13Reload">Aktualisieren</button></div><div class="dg80-ac-tablewrap"><table class="dg80-ac-table"><thead><tr><th>Tag</th><th>Mitarbeiter</th><th>Mitarbeiter-ID</th><th>Auffälligkeit</th><th>Details</th><th>Aktionen</th></tr></thead><tbody>'
      +issues.map((x,i)=>'<tr><td>'+esc(x.date?fmtDate(x.date):'–')+'</td><td><strong>'+esc(x.employee||'–')+'</strong></td><td>'+esc(empId(x.employee||''))+'</td><td><span class="dg80-ac-badge '+(x.severity==='error'?'error':'warn')+'">'+issueSeverity(x)+'</span><br><strong>'+esc(x.title||x.type||'Auffälligkeit')+'</strong></td><td>'+esc(x.detail||'')+'</td><td><div class="dg80-ac-actions">'
        +(x.date?'<button class="btn primary" type="button" data-dg13-day="'+i+'">Tag öffnen</button>':'')
        +'<button class="btn success" type="button" data-dg13-ok="'+i+'">✓ Geprüft / freigeben</button>'
        +'<button class="btn secondary" type="button" data-dg13-false="'+i+'">Falschmeldung löschen</button>'
        +'</div></td></tr>').join('')
      +'</tbody></table></div>';
    q('dg13Reload')?.addEventListener('click',openAnomalies);
    card.querySelectorAll('[data-dg13-ok]').forEach(b=>b.addEventListener('click',async()=>{const x=issues[Number(b.dataset.dg13Ok)];if(!x)return;try{b.disabled=true;await markReviewed(x,'Geprüft / freigegeben');await openAnomalies();}catch(e){alert(e.message||e);}finally{b.disabled=false;}}));
    card.querySelectorAll('[data-dg13-false]').forEach(b=>b.addEventListener('click',async()=>{const x=issues[Number(b.dataset.dg13False)];if(!x)return;if(!confirm('Diese Meldung als Falschmeldung entfernen?'))return;try{b.disabled=true;await markReviewed(x,'Falschmeldung gelöscht');await openAnomalies();}catch(e){alert(e.message||e);}finally{b.disabled=false;}}));
    card.querySelectorAll('[data-dg13-day]').forEach(b=>b.addEventListener('click',()=>{const x=issues[Number(b.dataset.dg13Day)];if(x)openSingleDay(x.employee,x.date);}));
  }catch(e){card.innerHTML='<div class="dg80-ac-head"><h2>Auffälligkeiten</h2></div><div class="status error">'+esc(e.message||e)+'</div>';}
}
window.DG80_UI13_openAnomalies=openAnomalies;

async function getDay(employee,date){
  const p=String(date).split('-').map(Number),rows=await apiCall({action:'getBossDayClosures',year:p[0],month:p[1]});
  const emp=(rows||[]).find(x=>norm(x.employee)===norm(employee));
  return emp?(emp.days||[]).find(d=>String(d.date)===String(date))||null:null;
}
function toMinutes(t){const m=String(t||'').match(/^(\d{1,2}):(\d{2})$/);return m?Number(m[1])*60+Number(m[2]):null;}
function fromMinutes(m){m=((m%1440)+1440)%1440;return String(Math.floor(m/60)).padStart(2,'0')+':'+String(m%60).padStart(2,'0');}

async function editEntry(employee,date,r){
  if(!r||!r.id||String(r.id).startsWith('assigned:'))return;
  const start=prompt('Von (HH:MM):',r.start||'');if(start===null)return;
  const end=prompt('Bis (HH:MM):',r.end||'');if(end===null)return;
  const reason=prompt('Grund der Bearbeitung:','Korrektur durch Büro');if(reason===null||!reason.trim())return;
  await apiCall({action:'updateBossDayEntry',targetEmployee:employee,date,entryId:r.id,start:start.trim(),end:end.trim(),reason:reason.trim()});
}
async function deleteEntry(employee,date,r){
  if(!r||!r.id||String(r.id).startsWith('assigned:'))return;
  const reason=prompt('Begründung für das Löschen:','Fehleintrag');if(reason===null||!reason.trim())return;
  if(!confirm('Eintrag wirklich löschen? Tages- und Monatsstunden werden neu berechnet.'))return;
  await apiCall({action:'deleteBossDayEntry',targetEmployee:employee,date,entryId:r.id,reason:reason.trim()});
}
async function adjustEntry(employee,date,r,sign){
  if(!r||!r.id||String(r.id).startsWith('assigned:'))return;
  const raw=prompt((sign>0?'Stunden hinzufügen':'Stunden abziehen')+' (z. B. 0,5):','0,5');if(raw===null)return;
  const h=Number(String(raw).replace(',','.'));if(!(h>0&&h<=12))throw new Error('Bitte eine gültige Stundenanzahl zwischen 0 und 12 eingeben.');
  const a=toMinutes(r.start),b=toMinutes(r.end);if(a===null||b===null)throw new Error('Für diesen Eintrag fehlen gültige Von-/Bis-Zeiten.');
  let end=b;if(end<a)end+=1440;
  const next=end+sign*Math.round(h*60);
  if(next<=a)throw new Error('Die Korrektur würde den Eintrag auf 0 oder negative Stunden setzen.');
  const reason=prompt('Grund der Stundenkorrektur:','Stundenkorrektur durch Büro');if(reason===null||!reason.trim())return;
  await apiCall({action:'updateBossDayEntry',targetEmployee:employee,date,entryId:r.id,start:r.start,end:fromMinutes(next),reason:reason.trim()});
}
async function openSingleDay(employee,date){
  const card=openCenter('Tag bearbeiten');if(!card)return;
  card.innerHTML='<div class="dg80-ac-head"><h2>'+esc(fmtDate(date))+' · '+esc(employee)+'</h2><div class="dg80-ac-actions"><button class="btn secondary" type="button" id="dg13BackIssues">← Auffälligkeiten</button><button class="btn secondary" type="button" id="dg13ReloadDay">Aktualisieren</button></div></div><div class="status info">Tag wird geladen ...</div>';
  q('dg13BackIssues')?.addEventListener('click',openAnomalies);
  q('dg13ReloadDay')?.addEventListener('click',()=>openSingleDay(employee,date));
  try{
    const d=await getDay(employee,date);if(!d)throw new Error('Tagesdaten wurden nicht gefunden.');
    const reports=d.reports||[];
    card.innerHTML='<div class="dg80-ac-head"><h2>'+esc(fmtDate(date))+' · '+esc(employee)+'</h2><div class="dg80-ac-actions"><button class="btn secondary" type="button" id="dg13BackIssues">← Auffälligkeiten</button><button class="btn secondary" type="button" id="dg13ReloadDay">Aktualisieren</button></div></div>'
      +'<div class="status info"><strong>Mitarbeiter-ID:</strong> '+esc(empId(employee))+' · <strong>Tagessumme:</strong> '+Number(d.hours||0).toFixed(2).replace('.',',')+' Std. · <strong>Status:</strong> '+(d.closed?'abgeschlossen':'offen')+'</div>'
      +(reports.length?'<div class="dg80-ac-tablewrap"><table class="dg80-ac-table"><thead><tr><th>Kunde / Baustelle</th><th>Von</th><th>Bis</th><th>Stunden</th><th>Tätigkeit</th><th>Bearbeiten</th></tr></thead><tbody>'
        +reports.map((r,i)=>'<tr><td><strong>'+esc(r.customer||'–')+'</strong></td><td>'+esc(r.start||'–')+'</td><td>'+esc(r.end||'–')+'</td><td>'+Number(r.hours||0).toFixed(2).replace('.',',')+'</td><td>'+esc(r.activity||'')+'</td><td><div class="dg80-ac-actions">'
          +(String(r.id||'').startsWith('assigned:')?'<span class="muted small">Zugeordnete Mitarbeit – Quellbericht bearbeiten.</span>':'<button class="btn primary" type="button" data-dg13-edit="'+i+'">Bearbeiten</button><button class="btn danger" type="button" data-dg13-del="'+i+'">Löschen</button><button class="btn success" type="button" data-dg13-plus="'+i+'">Stunden +</button><button class="btn secondary" type="button" data-dg13-minus="'+i+'">Stunden −</button>')
          +'</div></td></tr>').join('')
        +'</tbody></table></div>':'<div class="status info">Für diesen Tag sind keine Einzelberichte vorhanden.</div>');
    q('dg13BackIssues')?.addEventListener('click',openAnomalies);
    q('dg13ReloadDay')?.addEventListener('click',()=>openSingleDay(employee,date));
    const action=async(type,i,b)=>{
      const r=reports[i];if(!r)return;
      try{b.disabled=true;if(type==='edit')await editEntry(employee,date,r);if(type==='del')await deleteEntry(employee,date,r);if(type==='plus')await adjustEntry(employee,date,r,1);if(type==='minus')await adjustEntry(employee,date,r,-1);await openSingleDay(employee,date);}catch(e){alert(e.message||e);}finally{b.disabled=false;}
    };
    card.querySelectorAll('[data-dg13-edit]').forEach(b=>b.addEventListener('click',()=>action('edit',Number(b.dataset.dg13Edit),b)));
    card.querySelectorAll('[data-dg13-del]').forEach(b=>b.addEventListener('click',()=>action('del',Number(b.dataset.dg13Del),b)));
    card.querySelectorAll('[data-dg13-plus]').forEach(b=>b.addEventListener('click',()=>action('plus',Number(b.dataset.dg13Plus),b)));
    card.querySelectorAll('[data-dg13-minus]').forEach(b=>b.addEventListener('click',()=>action('minus',Number(b.dataset.dg13Minus),b)));
  }catch(e){card.innerHTML='<div class="dg80-ac-head"><h2>Tag bearbeiten</h2><button class="btn secondary" type="button" id="dg13BackIssues">← Auffälligkeiten</button></div><div class="status error">'+esc(e.message||e)+'</div>';q('dg13BackIssues')?.addEventListener('click',openAnomalies);}
}

function refreshFilteredCount(){
  if(!S.audit)return;
  const open=(S.audit.issues||[]).filter(x=>!x.reviewed&&!suppressIssue(x));
  const e=q('dg80c-anomalies');if(e)e.textContent=String(open.length);
  q('bossView')?.querySelector('[data-dg80-final="anomalies"]')?.classList.toggle('dg80-hot',open.length>0);
}
async function refreshAudit(){
  try{S.audit=await getAudit();refreshFilteredCount();}catch(_e){}
}
function install(){
  wrapApi();
  hideLegacyNoise();refreshFilteredCount();
  const mo=new MutationObserver(()=>{clearTimeout(S.cleanTimer);S.cleanTimer=setTimeout(()=>{hideLegacyNoise();refreshFilteredCount();},0);});
  mo.observe(document.body,{subtree:true,childList:true,characterData:true});
  document.addEventListener('visibilitychange',()=>{if(!document.hidden){hideLegacyNoise();refreshFilteredCount();}});
  setInterval(async()=>{if(document.hidden||!q('bossView')||q('bossView').classList.contains('hidden'))return;try{const r=await apiCall({action:'getEmployeeAdminData'});if(Array.isArray(r))S.admins=r;await refreshAudit();}catch(_e){}},3600000);
  document.documentElement.dataset.dgUi13=V;
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});else install();
})();


/* DG Zeiterfassung 9.0 - UI Hotfix 14
   Hardened click binding for "Offene Tagesabschluesse". */
(function(){
'use strict';
const V='8.0-ui14';
function bind(){
  const root=document.getElementById('bossView');
  if(!root)return false;
  const tile=root.querySelector('[data-dg80-final="days"]');
  if(!tile)return false;
  if(tile.dataset.dg80Days14!=='1'){
    tile.dataset.dg80Days14='1';
    tile.addEventListener('click',function(e){
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
      const fn=window.DG80_UI12_openDays;
      if(typeof fn==='function'){
        Promise.resolve(fn()).then(function(){
          const card=document.getElementById('dg80ActionCenter');
          if(card){
            card.classList.add('dg80-shell-active');
            card.style.display='block';
            setTimeout(function(){try{card.scrollIntoView({behavior:'smooth',block:'start'});}catch(_e){}},0);
          }
        }).catch(function(err){
          alert('Offene Tagesabschlüsse konnten nicht geöffnet werden: '+(err&&err.message?err.message:err));
        });
      }else{
        alert('Die Tagesabschluss-Ansicht ist noch nicht bereit. Bitte die App einmal neu laden.');
      }
      return false;
    },true);
  }
  return true;
}
function install(){
  let n=0;(function retry(){if(bind())return;if(++n<50)setTimeout(retry,100);})();
  const mo=new MutationObserver(function(){bind();});
  mo.observe(document.body,{subtree:true,childList:true});
  document.documentElement.dataset.dgUi14=V;
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});else install();
})();


/* DG Zeiterfassung 9.0 - UI Hotfix 15
   Kalenderzaehler exakt auf aktive Mitarbeiter begrenzen,
   Stundenlohn-fehlt komplett ignorieren, Tagesabschluss-Button umbenennen. */
(function(){
'use strict';
const V='8.0-ui15';
const q=id=>document.getElementById(id);
const norm=v=>String(v==null?'':v).trim().toLowerCase().replace(/\s+/g,' ');

async function apiCall(payload){
  if(typeof window.api!=='function')throw new Error('Backend nicht bereit.');
  if(typeof window.chefPayload==='function')return window.api(window.chefPayload(payload));
  return window.api(payload);
}

function isWageMissingText(text){
  const s=norm(text);
  return s.includes('stundenlohn fehlt')||
         s.includes('brutto-stundenlohn')||
         s.includes('brutto stundenlohn')||
         s.includes('missing_hourly')||
         s.includes('hourly_wage_missing');
}

function removeWageWarnings(){
  document.querySelectorAll('.dg80-ac-table tbody tr,.dg520-issue,.dg522-issue,.dg80-review-issue').forEach(el=>{
    if(isWageMissingText(el.textContent||''))el.remove();
  });

  const table=q('dg80ActionCenter')?.querySelector('.dg80-ac-table tbody');
  if(table){
    const rows=[...table.querySelectorAll('tr')];
    const count=rows.length;
    const c=q('dg80c-anomalies');if(c)c.textContent=String(count);
    q('bossView')?.querySelector('[data-dg80-final="anomalies"]')?.classList.toggle('dg80-hot',count>0);
    if(count===0){
      const wrap=table.closest('.dg80-ac-tablewrap');
      if(wrap)wrap.outerHTML='<div class="status ok">✓ Keine offenen Auffälligkeiten vorhanden.</div>';
    }
  }
}

function renameDayCloseButtons(){
  document.querySelectorAll('[data-dg80-close-day]').forEach(b=>{
    if((b.textContent||'').trim()!=='Tag manuell abschließen')b.textContent='Tag manuell abschließen';
  });
}

async function refreshExactCalendarCount(){
  try{
    const workers=await apiCall({action:'getPlannerWorkers'});
    const rows=Array.isArray(workers)?workers:[];
    const n=rows.filter(w=>w&&(w.active===true||w.active===1||String(w.active).trim()==='1'||String(w.active).trim().toLowerCase()==='true')).length;
    if(q('dg80c-calendar'))q('dg80c-calendar').textContent=String(n);
    try{if(window.DG80_UI12)window.DG80_UI12.calendarCount=n;}catch(_e){}
    return n;
  }catch(_e){return null;}
}
function enforce(){
  renameDayCloseButtons();
  removeWageWarnings();
}

function install(){
  let tries=0;
  (function ready(){
    enforce();
    if(q('dg80c-calendar'))return;
    if(++tries<50)setTimeout(ready,100);
  })();

  const mo=new MutationObserver(()=>{
    clearTimeout(window.__dg80ui15t);
    window.__dg80ui15t=setTimeout(enforce,0);
  });
  mo.observe(document.body,{subtree:true,childList:true,characterData:true});

  document.addEventListener('visibilitychange',()=>{if(!document.hidden)enforce();});
  setInterval(()=>{if(q('bossView')&&!q('bossView').classList.contains('hidden'))refreshExactCalendarCount();},3600000);
  document.documentElement.dataset.dgUi15=V;
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});else install();
})();


/* DG Zeiterfassung 9.0 - UI Hotfix 16 FINAL CLEANUP
   Einheitliche Pruefregeln und stabile Dashboard-Zaehler. */
(function(){
'use strict';
const V='8.0-ui16';
const q=id=>document.getElementById(id);
const STATE=window.DG80_UI16=window.DG80_UI16||{admins:[],calendarCount:null,audit:null,timer:null};
const norm=v=>String(v==null?'':v).trim().toLowerCase().replace(/\s+/g,' ');

function activeValue(v){
  return v===true||v===1||String(v).trim()==='1'||String(v).trim().toLowerCase()==='true';
}
function adminFor(name){
  const n=norm(name);
  return (STATE.admins||[]).find(x=>norm(x.name||x.employee||x.displayName)===n)||null;
}
function isChef(name){
  const a=adminFor(name);return !!(a&&a.chefAccess);
}
function issueText(x){return norm((x&&x.type)+' '+(x&&x.title)+' '+(x&&x.detail));}
function suppress(x){
  const s=issueText(x);
  // Diese Regeln gelten bewusst nirgends mehr in der App:
  if(s.includes('stundenlohn fehlt')||s.includes('brutto-stundenlohn')||s.includes('brutto stundenlohn')||s.includes('missing_hourly')||s.includes('hourly_wage_missing'))return true;
  if(s.includes('pause zu kurz')||s.includes('pause_short'))return true;
  if(s.includes('tages-soll')||s.includes('tagessoll')||s.includes('abweichung von tages')||s.includes('daily_target')||s.includes('target deviation'))return true;
  if((s.includes('überschneid')||s.includes('ueberschneid')||s.includes('overlap'))&&isChef(x&&x.employee))return true;
  return false;
}

window.dg16SanitizePayrollAudit=function(a){
  if(!a||typeof a!=='object')return a;
  const out=Object.assign({},a);
  const issues=(Array.isArray(a.issues)?a.issues:[]).filter(x=>!suppress(x));
  out.issues=issues;
  const errors=issues.filter(x=>x.severity==='error'&&!x.reviewed).length;
  const warnings=issues.filter(x=>x.severity!=='error'&&!x.reviewed).length;
  const reviewedWarnings=issues.filter(x=>x.severity!=='error'&&x.reviewed).length;
  out.summary=Object.assign({},a.summary||{},{errors,warnings,reviewedWarnings});
  out.canRelease=errors===0&&warnings===0;
  STATE.audit=out;
  return out;
};

async function apiCall(payload){
  if(typeof window.api!=='function')throw new Error('Backend nicht bereit.');
  if(typeof window.chefPayload==='function')return window.api(window.chefPayload(payload));
  return window.api(payload);
}

async function loadAdmins(){
  try{
    const r=await apiCall({action:'getEmployeeAdminData'});
    if(Array.isArray(r))STATE.admins=r;
  }catch(_e){}
}
async function refreshCalendar(){
  try{
    const r=await apiCall({action:'getPlannerWorkers'});
    const rows=Array.isArray(r)?r:[];
    STATE.calendarCount=rows.filter(w=>w&&activeValue(w.active)).length;
    paintCalendar();
  }catch(_e){}
}
async function refreshAudit(){
  try{
    const now=new Date();
    const a=await apiCall({action:'getMonthPayrollAudit',year:now.getFullYear(),month:now.getMonth()+1});
    STATE.audit=window.dg16SanitizePayrollAudit(a||{issues:[]});
    paintAuditCount();
  }catch(_e){}
}
function paintCalendar(){
  if(STATE.calendarCount===null)return;
  const e=q('dg80c-calendar');if(e&&e.textContent!==String(STATE.calendarCount))e.textContent=String(STATE.calendarCount);
  try{if(window.DG80_UI12)window.DG80_UI12.calendarCount=STATE.calendarCount;}catch(_e){}
}
function paintAuditCount(){
  if(!STATE.audit)return;
  const n=(STATE.audit.issues||[]).filter(x=>!x.reviewed&&!suppress(x)).length;
  const e=q('dg80c-anomalies');if(e&&e.textContent!==String(n))e.textContent=String(n);
  q('bossView')?.querySelector('[data-dg80-final="anomalies"]')?.classList.toggle('dg80-hot',n>0);
  try{if(window.DG80_UI12)window.DG80_UI12.audit=STATE.audit;}catch(_e){}
}
function removeSuppressedRows(){
  document.querySelectorAll('.dg80-ac-table tbody tr,.dg520-issue,.dg522-issue,.dg80-review-issue').forEach(el=>{
    const txt=norm(el.textContent||'');
    if(txt.includes('stundenlohn fehlt')||txt.includes('brutto-stundenlohn')||txt.includes('brutto stundenlohn')||txt.includes('pause zu kurz')||txt.includes('tages-soll')||txt.includes('tagessoll')){
      el.remove();
    }
  });
}
function enforce(){
  paintCalendar();paintAuditCount();removeSuppressedRows();
}

// Harte Klickroute fuer die Auffaelligkeits-Kachel: immer die bereinigte UI13-Ansicht.
document.addEventListener('click',function(e){
  const t=e.target.closest('[data-dg80-final="anomalies"]');
  if(!t||!q('bossView')?.contains(t))return;
  if(typeof window.DG80_UI13_openAnomalies==='function'){
    e.preventDefault();e.stopPropagation();e.stopImmediatePropagation();
    window.DG80_UI13_openAnomalies();
  }
},true);

function install(){
  enforce();
  const mo=new MutationObserver(()=>{
    clearTimeout(STATE.timer);
    STATE.timer=setTimeout(enforce,0);
  });
  mo.observe(document.body,{subtree:true,childList:true,characterData:true});
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)enforce();});
  document.documentElement.dataset.dgUi16=V;
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});else install();
})();


/* DG Zeiterfassung 9.0 - UI Hotfix 17
   Jahreszaehler "Erstellte Angebote", Mitarbeiter-Tab blau,
   einheitliche App-Aktionsleiste mit Aktualisieren. */
(function(){
'use strict';
const V='8.0-ui17';
const q=id=>document.getElementById(id);
const S=window.DG80_UI17=window.DG80_UI17||{offers:[],offerYear:null,busy:false,timer:null};
const esc=v=>String(v==null?'':v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

async function apiCall(payload){
  if(typeof window.api!=='function')throw new Error('Backend nicht bereit.');
  if(typeof window.chefPayload==='function')return window.api(window.chefPayload(payload));
  return window.api(payload);
}
function year(){return new Date().getFullYear();}
function parseDateValue(v){
  if(v==null||v==='')return null;
  if(v instanceof Date&&!isNaN(v))return v;
  const s=String(v).trim();
  let m=s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if(m)return new Date(+m[1],+m[2]-1,+m[3],12);
  m=s.match(/^(\d{2})\.(\d{2})\.(\d{4})/);
  if(m)return new Date(+m[3],+m[2]-1,+m[1],12);
  const d=new Date(s);return isNaN(d)?null:d;
}
function createdDate(r){
  const keys=['offerCreatedAt','createdAt','createdDate','creationDate','dateCreated','reminderCreatedAt','insertedAt','created','date'];
  for(const k of keys){const d=parseDateValue(r&&r[k]);if(d)return d;}
  return null;
}
function deDate(d){return d?String(d.getDate()).padStart(2,'0')+'.'+String(d.getMonth()+1).padStart(2,'0')+'.'+d.getFullYear():'–';}
function uniqueOffers(rows){
  const map=new Map();
  (rows||[]).forEach(r=>{
    const key=String(r.offerId||r.offerNumber||r.id||((r.customer||'')+'|'+(r.createdAt||r.dueDate||'')));
    if(!map.has(key))map.set(key,r);
    else map.set(key,Object.assign({},map.get(key),r));
  });
  return [...map.values()];
}

function ensureCss(){
  if(q('dg80Ui17Css'))return;
  const s=document.createElement('style');s.id='dg80Ui17Css';
  s.textContent=''
    +'#employeeTab{background:#dbeafe!important;border-color:#93c5fd!important;color:#1d4ed8!important;font-weight:900!important}'
    +'#employeeTab.active{background:#2563eb!important;border-color:#2563eb!important;color:#fff!important}'
    +'#dg60OfficeToolbar{display:grid!important;grid-template-columns:1fr 1fr!important;gap:14px!important;justify-content:stretch!important;padding:10px 12px!important}'
    +'#dg60OfficeToolbar button{width:100%!important;min-height:52px!important;border-radius:11px!important;padding:11px 16px!important;font-weight:900!important;font-size:16px!important;cursor:pointer!important}'
    +'#dg60RefreshApp{border:0!important;background:#2563eb!important;color:#fff!important}'
    +'#dg60OpenWindow{width:100%!important;min-height:52px!important}'
    +'#bossView .dg80-created-offers-tile{background:#e8f7ea!important;border:1px solid #b9e4c1!important;color:#185c2c!important}'
    +'#bossView .dg80-created-offers-tile span,#bossView .dg80-created-offers-tile strong{color:#185c2c!important}'
    +'.dg80-offer-list{display:grid;gap:10px}'
    +'.dg80-offer-row{border:1px solid #dbe2ea;border-radius:13px;padding:12px 14px;background:#fff}'
    +'.dg80-offer-row-head{display:flex;justify-content:space-between;gap:12px;align-items:flex-start;flex-wrap:wrap}'
    +'.dg80-offer-row-title{font-weight:900;font-size:16px}.dg80-offer-row-date{font-weight:900;color:#31589e}'
    +'.dg80-offer-row-meta{margin-top:5px;font-size:13px;color:#64748b}'
    +'@media(max-width:700px){#dg60OfficeToolbar{grid-template-columns:1fr!important}}';
  document.head.appendChild(s);
}

function ensureToolbar(){
  const bar=q('dg60OfficeToolbar');if(!bar)return false;
  let refresh=q('dg60RefreshApp');
  if(!refresh){
    refresh=document.createElement('button');
    refresh.id='dg60RefreshApp';refresh.type='button';refresh.textContent='App aktualisieren';
    refresh.addEventListener('click',()=>{location.reload();});
    bar.insertBefore(refresh,q('dg60OpenWindow')||bar.firstChild);
  }
  return true;
}

function archiveGrid(){
  return q('bossView')?.querySelector('.dg80-final-section[data-section="archive"] .dg80-final-grid')||null;
}
function ensureCreatedTile(){
  const grid=archiveGrid();if(!grid)return false;
  let tile=grid.querySelector('[data-dg80-final="createdOffersYear"]');
  if(!tile){
    tile=document.createElement('button');
    tile.type='button';tile.draggable=false;
    tile.className='d3-tile dg80-final-tile dg80-created-offers-tile';
    tile.dataset.dg80Final='createdOffersYear';
    tile.innerHTML='<span>Erstellte Angebote '+year()+'</span><strong id="dg80c-createdOffersYear">…</strong>';
    const archive=grid.querySelector('[data-dg80-final="offerArchive"]');
    if(archive)grid.insertBefore(tile,archive);else grid.prepend(tile);
  }
  const label=tile.querySelector('span');if(label)label.textContent='Erstellte Angebote '+year();
  return true;
}

async function fetchCreatedOffers(){
  if(S.busy)return S.offers;S.busy=true;
  try{
    const jobs=await Promise.allSettled([
      apiCall({action:'getOfferReminders',includeDone:true}),
      apiCall({action:'getOfferReports',stage:'Offen'}),
      apiCall({action:'getOfferReports',stage:'Archiv'})
    ]);
    const all=[];
    jobs.forEach(j=>{if(j.status==='fulfilled'&&Array.isArray(j.value))all.push(...j.value);});
    S.offers=uniqueOffers(all).map(r=>Object.assign({},r,{__createdDate:createdDate(r)}));
    S.offerYear=year();
    paintCount();
    return S.offers;
  }finally{S.busy=false;}
}
function currentYearOffers(){
  const y=year();
  return (S.offers||[]).filter(r=>r.__createdDate&&r.__createdDate.getFullYear()===y)
    .sort((a,b)=>b.__createdDate-a.__createdDate);
}
function paintCount(){
  ensureCreatedTile();
  const e=q('dg80c-createdOffersYear');if(!e)return;
  const n=currentYearOffers().length;
  e.textContent=String(n);
  const t=e.closest('.dg80-created-offers-tile');if(t){const s=t.querySelector('span');if(s)s.textContent='Erstellte Angebote '+year();}
}

function openCenter(title){
  const root=q('bossView');if(!root)return null;
  root.querySelectorAll(':scope > .dg80-shell-active').forEach(x=>x.classList.remove('dg80-shell-active'));
  let card=q('dg80CreatedOffersCenter');
  if(!card){card=document.createElement('div');card.id='dg80CreatedOffersCenter';card.className='card';root.appendChild(card);}
  card.classList.add('dg80-shell-active');
  q('dg80OfficeToolbar')?.classList.add('active');
  const t=q('dg80OfficeTitle');if(t)t.textContent=title;
  return card;
}
async function openCreatedOffers(){
  const y=year(),card=openCenter('Erstellte Angebote '+y);if(!card)return;
  card.innerHTML='<div class="dg80-ac-head"><h2>Erstellte Angebote '+y+'</h2><button class="btn secondary" type="button" id="dg17RefreshOffers">Aktualisieren</button></div><div class="status info">Angebote werden geladen ...</div>';
  q('dg17RefreshOffers')?.addEventListener('click',openCreatedOffers);
  try{
    await fetchCreatedOffers();
    const rows=currentYearOffers();
    card.innerHTML='<div class="dg80-ac-head"><h2>Erstellte Angebote '+y+'</h2><button class="btn secondary" type="button" id="dg17RefreshOffers">Aktualisieren</button></div>'
      +(rows.length?'<div class="dg80-offer-list">'+rows.map(r=>'<div class="dg80-offer-row"><div class="dg80-offer-row-head"><div class="dg80-offer-row-title">'+esc(r.customer||'Ohne Kundenname')+(r.offerNumber?' · Angebot '+esc(r.offerNumber):'')+'</div><div class="dg80-offer-row-date">'+esc(deDate(r.__createdDate))+'</div></div><div class="dg80-offer-row-meta">'+esc(r.status||r.offerStatus||'Erstellt')+(r.description?' · '+esc(r.description):'')+'</div></div>').join('')+'</div>':'<div class="status ok">Im Jahr '+y+' wurden noch keine Angebote erstellt.</div>');
    q('dg17RefreshOffers')?.addEventListener('click',openCreatedOffers);
  }catch(e){card.innerHTML='<div class="dg80-ac-head"><h2>Erstellte Angebote '+y+'</h2></div><div class="status error">'+esc(e.message||e)+'</div>';}
}
window.DG80_UI17_openCreatedOffers=openCreatedOffers;

function bindCreatedTile(){
  const tile=q('bossView')?.querySelector('[data-dg80-final="createdOffersYear"]');if(!tile||tile.dataset.dg17==='1')return;
  tile.dataset.dg17='1';
  tile.addEventListener('click',e=>{e.preventDefault();e.stopPropagation();e.stopImmediatePropagation();openCreatedOffers();},true);
}
function enforce(){
  ensureCss();ensureToolbar();ensureCreatedTile();bindCreatedTile();paintCount();
}
function install(){
  ensureCss();
  let tries=0;(function ready(){enforce();if(archiveGrid()&&q('dg60OfficeToolbar'))return;if(++tries<60)setTimeout(ready,100);})();
  const mo=new MutationObserver(()=>{clearTimeout(S.timer);S.timer=setTimeout(enforce,0);});
  mo.observe(document.body,{subtree:true,childList:true,characterData:true});
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)enforce();});
  document.documentElement.dataset.dgUi17=V;
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});else install();
})();


/* DG Zeiterfassung 9.0 - UI Hotfix 18
   Erstellte Angebote: belastbarer Jahreszaehler aus tatsaechlich erstellten Vorgaengen.
   Schnellkachel "+ Angebotsanfrage" im taeglichen Geschaeft. */
(function(){
'use strict';
const V='8.0-ui18';
const q=id=>document.getElementById(id);
const REG='dg80_created_offer_year_registry_v1';
const S=window.DG80_UI18=window.DG80_UI18||{rows:[],busy:false,timer:null};
const esc=v=>String(v==null?'':v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

async function apiCall(payload){
  if(typeof window.api!=='function')throw new Error('Backend nicht bereit.');
  if(typeof window.chefPayload==='function')return window.api(window.chefPayload(payload));
  return window.api(payload);
}
function nowYear(){return new Date().getFullYear();}
function readReg(){try{return JSON.parse(localStorage.getItem(REG)||'{}')||{};}catch(_e){return {};}}
function writeReg(x){try{localStorage.setItem(REG,JSON.stringify(x));}catch(_e){}}
function parseDate(v){
  if(!v)return null;
  const s=String(v).trim();
  let m=s.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T\s].*)?$/);if(m)return new Date(+m[1],+m[2]-1,+m[3],12);
  m=s.match(/^(\d{2})\.(\d{2})\.(\d{4})(?:[,\s].*)?$/);if(m)return new Date(+m[3],+m[2]-1,+m[1],12);
  const d=new Date(s);return isNaN(d)?null:d;
}
function bestDate(r){
  const keys=['offerCreatedAt','createdAt','createdDate','creationDate','dateCreated','createdOn','offerDate','sentAt','completedAt','statusAt','updatedAt'];
  for(const k of keys){const d=parseDate(r&&r[k]);if(d)return d;}
  return null;
}
function keyOf(r){
  if(r.__manual)return 'M:'+String(r.id||r.offerId||r.offerNumber||r.customer||'');
  return 'O:'+String(r.offerId||r.offerNumber||r.id||r.customer||'');
}
function manualOfferNumber(r){
  const m=String(r&&r.internalNote||'').match(/\[DG-ANGEBOT:([^\]]+)\]/);return m?m[1].trim():'';
}
function manualCreated(r){
  const src=String(r&&r.source||''),id=String(r&&r.id||''),status=String(r&&r.status||'');
  const isOffer=src==='Angebotsanfrage'||/^ANGREQ-/.test(id);
  if(!isOffer)return false;
  if(status==='Angebot zu erstellen')return false;
  return !!manualOfferNumber(r)||status==='Offenes Angebot'||status==='Angebot Abgelehnt'||status==='Angebot Angenommen'||status==='Laufend'||status==='Abgeschlossen';
}
function normalizeRows(normalOpen,normalArchive,manual){
  const map=new Map();
  (normalOpen||[]).forEach(r=>map.set(keyOf(r),Object.assign({},r,{__stage:'Offen',__manual:false})));
  (normalArchive||[]).forEach(r=>map.set(keyOf(r),Object.assign({},r,{__stage:'Archiv',__manual:false})));
  (manual||[]).filter(manualCreated).forEach(r=>{
    const x=Object.assign({},r,{__stage:String(r.status||''),__manual:true,offerNumber:manualOfferNumber(r)});
    map.set(keyOf(x),x);
  });
  return [...map.values()];
}
function assignYears(rows){
  const reg=readReg(),y=nowYear(),stamp=new Date().toISOString();let changed=false;
  rows.forEach(r=>{
    const k=keyOf(r),d=bestDate(r);
    if(d){
      r.__createdDate=d;r.__createdYear=d.getFullYear();
      if(!reg[k]||reg[k].year!==r.__createdYear){reg[k]={year:r.__createdYear,firstSeen:reg[k]?.firstSeen||stamp,exact:true};changed=true;}
    }else if(reg[k]){
      r.__createdYear=Number(reg[k].year)||y;
      r.__createdDate=reg[k].exact&&reg[k].date?parseDate(reg[k].date):null;
      r.__firstSeen=reg[k].firstSeen||'';
    }else{
      reg[k]={year:y,firstSeen:stamp,exact:false};changed=true;
      r.__createdYear=y;r.__createdDate=null;r.__firstSeen=stamp;
    }
  });
  if(changed)writeReg(reg);
  return rows;
}
function currentRows(){
  const y=nowYear();
  return (S.rows||[]).filter(r=>Number(r.__createdYear)===y).sort((a,b)=>{
    const ad=a.__createdDate?a.__createdDate.getTime():Date.parse(a.__firstSeen||0)||0;
    const bd=b.__createdDate?b.__createdDate.getTime():Date.parse(b.__firstSeen||0)||0;
    if(bd!==ad)return bd-ad;
    return String(b.offerNumber||b.offerId||'').localeCompare(String(a.offerNumber||a.offerId||''),'de');
  });
}
function paint(){
  const e=q('dg80c-createdOffersYear');if(!e)return;
  e.textContent=String(currentRows().length);
  const s=e.closest('[data-dg80-final="createdOffersYear"]')?.querySelector('span');
  if(s)s.textContent='Erstellte Angebote '+nowYear();
}
async function refresh(){
  if(S.busy)return S.rows;S.busy=true;
  try{
    const got=await Promise.allSettled([
      apiCall({action:'getOfferReports',stage:'Offen'}),
      apiCall({action:'getOfferReports',stage:'Archiv'}),
      apiCall({action:'getManualOrders',status:'Alle'})
    ]);
    const open=got[0].status==='fulfilled'&&Array.isArray(got[0].value)?got[0].value:[];
    const arch=got[1].status==='fulfilled'&&Array.isArray(got[1].value)?got[1].value:[];
    const manual=got[2].status==='fulfilled'&&Array.isArray(got[2].value)?got[2].value:[];
    S.rows=assignYears(normalizeRows(open,arch,manual));
    paint();return S.rows;
  }finally{S.busy=false;}
}
function de(d){return d?String(d.getDate()).padStart(2,'0')+'.'+String(d.getMonth()+1).padStart(2,'0')+'.'+d.getFullYear():'Bestand '+nowYear();}
function openCenter(){
  const root=q('bossView');if(!root)return null;
  root.querySelectorAll(':scope > .dg80-shell-active').forEach(x=>x.classList.remove('dg80-shell-active'));
  let card=q('dg80CreatedOffersCenter');if(!card){card=document.createElement('div');card.id='dg80CreatedOffersCenter';card.className='card';root.appendChild(card);}
  card.classList.add('dg80-shell-active');
  q('dg80OfficeToolbar')?.classList.add('active');
  const t=q('dg80OfficeTitle');if(t)t.textContent='Erstellte Angebote '+nowYear();
  return card;
}
async function openList(){
  const card=openCenter();if(!card)return;
  card.innerHTML='<div class="dg80-ac-head"><h2>Erstellte Angebote '+nowYear()+'</h2><button class="btn secondary" id="dg18Refresh">Aktualisieren</button></div><div class="status info">Angebote werden geladen ...</div>';
  q('dg18Refresh')?.addEventListener('click',openList);
  try{
    await refresh();const rows=currentRows();
    card.innerHTML='<div class="dg80-ac-head"><h2>Erstellte Angebote '+nowYear()+'</h2><button class="btn secondary" id="dg18Refresh">Aktualisieren</button></div>'
      +(rows.length?'<div class="dg80-offer-list">'+rows.map(r=>'<div class="dg80-offer-row"><div class="dg80-offer-row-head"><div class="dg80-offer-row-title">'+esc(r.customer||'Ohne Kundenname')+(r.offerNumber?' · Angebot '+esc(r.offerNumber):'')+'</div><div class="dg80-offer-row-date">'+esc(de(r.__createdDate))+'</div></div><div class="dg80-offer-row-meta">'+esc(r.status||r.offerStatus||r.__stage||'Erstellt')+(r.description?' · '+esc(r.description):'')+'</div></div>').join('')+'</div>':'<div class="status ok">Im Jahr '+nowYear()+' wurden noch keine Angebote erstellt.</div>');
    q('dg18Refresh')?.addEventListener('click',openList);
  }catch(e){card.innerHTML='<div class="status error">'+esc(e.message||e)+'</div>';}
}
window.DG80_UI18_openCreatedOffers=openList;

function dailyGrid(){return q('bossView')?.querySelector('.dg80-final-section[data-section="daily"] .dg80-final-grid')||null;}
function ensureQuickOfferTile(){
  const grid=dailyGrid();if(!grid)return false;
  let t=grid.querySelector('[data-dg80-final="quickOfferRequest"]');
  if(!t){
    t=document.createElement('button');t.type='button';t.draggable=false;
    t.className='d3-tile dg80-final-tile dg80-quick-offer';
    t.dataset.dg80Final='quickOfferRequest';
    t.innerHTML='<strong class="dg80-quick-plus">+</strong><span>Angebotsanfrage</span>';
    grid.appendChild(t);
  }
  if(t.dataset.dg18!=='1'){
    t.dataset.dg18='1';
    t.addEventListener('click',e=>{
      e.preventDefault();e.stopPropagation();e.stopImmediatePropagation();
      if(typeof window.dg81NewOfferRequest==='function')window.dg81NewOfferRequest();
      else alert('Die Eingabemaske für Angebotsanfragen ist noch nicht bereit. Bitte die App einmal aktualisieren.');
    },true);
  }
  return true;
}
function css(){
  if(q('dg80Ui18Css'))return;
  const s=document.createElement('style');s.id='dg80Ui18Css';
  s.textContent=''
    +'#bossView .dg80-quick-offer{background:#dbeafe!important;border-color:#93c5fd!important;color:#1d4ed8!important;justify-content:center!important;gap:8px!important}'
    +'#bossView .dg80-quick-offer .dg80-quick-plus{font-size:48px!important;line-height:.8!important;color:#1d4ed8!important}'
    +'#bossView .dg80-quick-offer span{color:#1d4ed8!important;font-size:17px!important}'
    +'#bossView .dg80-quick-offer:hover{background:#bfdbfe!important;border-color:#60a5fa!important}';
  document.head.appendChild(s);
}
function bindCreated(){
  const t=q('bossView')?.querySelector('[data-dg80-final="createdOffersYear"]');if(!t||t.dataset.dg18==='1')return;
  t.dataset.dg18='1';
  t.addEventListener('click',e=>{e.preventDefault();e.stopPropagation();e.stopImmediatePropagation();openList();},true);
}
function enforce(){css();ensureQuickOfferTile();bindCreated();paint();}
function install(){
  css();let n=0;(function ready(){enforce();if(dailyGrid()&&q('dg80c-createdOffersYear'))return;if(++n<60)setTimeout(ready,100);})();
  const mo=new MutationObserver(()=>{clearTimeout(S.timer);S.timer=setTimeout(enforce,0);});mo.observe(document.body,{subtree:true,childList:true,characterData:true});
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)enforce();});
  document.documentElement.dataset.dgUi18=V;
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});else install();
})();


/* DG Zeiterfassung 9.0 - UI Hotfix 20
   Laufende-Auftraege: eindeutige Aktionsreihenfolge/Farben.
   Strukturierte Einzelberichte. */
(function(){
'use strict';
const V='8.0-ui20';
const q=id=>document.getElementById(id);
const S=window.DG80_UI20=window.DG80_UI20||{timer:null};

function css(){
  if(q('dg80Ui20Css'))return;
  const s=document.createElement('style');s.id='dg80Ui20Css';
  s.textContent=''
    +'.dg20-single{padding:15px 0!important}'
    +'.dg20-single+.dg20-single{border-top:1px solid #dbe2ea!important}'
    +'.dg20-worktime{font-size:16px;margin-bottom:14px;color:#0f172a}'
    +'.dg20-section{margin:0 0 15px}'
    +'.dg20-section:last-of-type{margin-bottom:4px}'
    +'.dg20-label{font-size:14px;font-weight:900;color:#31589e;margin-bottom:5px}'
    +'.dg20-text{font-size:16px;line-height:1.45;white-space:pre-line;color:#111827}'
    +'.dg20-material{white-space:pre-line}'
    +'#d3RunningList .report-card>.report-actions{display:flex!important;gap:8px!important;flex-wrap:wrap!important}'
    +'#d3RunningList .report-card>.report-actions .btn{margin:0!important}'
    +'@media(max-width:759px){#d3RunningList .report-card>.report-actions .btn{width:100%!important}}';
  document.head.appendChild(s);
}
function setKind(btn,kind){
  if(!btn)return;
  btn.classList.remove('primary','secondary','success','danger');
  btn.classList.add('btn',kind);
}
function arrangeCard(card){
  if(!card||card.dataset.view!=='Laufend')return;
  const actions=card.querySelector(':scope > .report-actions');if(!actions)return;
  const buttons=[...actions.querySelectorAll(':scope > button')];
  const find=re=>buttons.find(b=>re.test(String(b.textContent||'').trim()));
  const hand=find(/Übergabe an Rechnung zu erstellen|Auftrag abschlie/i);
  const edit=find(/^Bericht bearbeiten$/i);
  const note=find(/^Interner Vermerk$/i);
  const customer=find(/Kunde korrigieren|Kundendaten korrigieren/i);
  const offer=find(/Angebot zu erstellen|Angebot zu Kunde erstellen/i);
  const merge=find(/Ausgewählte zusammenführen/i);

  if(hand){hand.textContent='Übergabe an Rechnung zu erstellen';setKind(hand,'danger');}
  if(edit)setKind(edit,'primary');
  if(note)setKind(note,'primary');
  if(customer){customer.textContent='Kundendaten Korrigieren';setKind(customer,'danger');}
  if(offer){offer.textContent='Angebot zu Kunde erstellen';setKind(offer,'primary');}
  if(merge)setKind(merge,'success');

  const ordered=[hand,edit,note,customer,offer,merge].filter(Boolean);
  ordered.forEach(b=>actions.appendChild(b));
  buttons.filter(b=>!ordered.includes(b)).forEach(b=>actions.appendChild(b));
}
function enforce(){
  css();
  document.querySelectorAll('#d3RunningList .report-card[data-view="Laufend"]').forEach(arrangeCard);
}
function install(){
  css();enforce();
  const mo=new MutationObserver(()=>{clearTimeout(S.timer);S.timer=setTimeout(enforce,0);});
  mo.observe(document.body,{subtree:true,childList:true});
  document.documentElement.dataset.dgUi20=V;
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});else install();
})();


/* DG Zeiterfassung 9.0 - UI Hotfix 21
   Fokusmodus fuer Kachel-Navigation:
   geoeffneter Bereich erscheint oben, Dashboard-Kacheln werden ausgeblendet,
   beim Schliessen wird die vorherige Kachelposition wiederhergestellt. */
(function(){
'use strict';
const V='8.0-ui21';
const q=id=>document.getElementById(id);
const S=window.DG80_UI21=window.DG80_UI21||{originY:null,focus:false,timer:null,restorePending:false};

function root(){return q('bossView');}
function dash(){return root()?.querySelector(':scope > .d3-dashboard')||null;}
function activeShell(){
  const r=root();if(!r)return null;
  return r.querySelector(':scope > .dg80-shell-active');
}
function toolbarActive(){
  const b=q('dg80OfficeToolbar');return !!(b&&b.classList.contains('active'));
}
function css(){
  if(q('dg80Ui21Css'))return;
  const s=document.createElement('style');s.id='dg80Ui21Css';
  s.textContent=''
    +'#bossView.dg21-focus>.d3-dashboard{display:none!important}'
    +'#bossView.dg21-focus>#dg80OfficeToolbar{display:block!important;margin-top:0!important;scroll-margin-top:10px!important}'
    +'#bossView.dg21-focus>.dg80-shell-active{display:block!important;scroll-margin-top:84px!important}'
    +'#bossView.dg21-focus{padding-top:0!important}'
    +'#bossView.dg21-focus #dg80OfficeClose{background:#e5e7eb!important;color:#111827!important}'
    +'@media(max-width:759px){#bossView.dg21-focus>.dg80-shell-active{scroll-margin-top:72px!important}}';
  document.head.appendChild(s);
}
function rememberOrigin(){
  if(S.focus)return;
  S.originY=window.scrollY;
}
function scrollOpen(){
  const bar=q('dg80OfficeToolbar'),panel=activeShell();
  const target=bar&&toolbarActive()?bar:panel;
  if(!target)return;
  requestAnimationFrame(()=>requestAnimationFrame(()=>{
    try{target.scrollIntoView({behavior:'smooth',block:'start'});}catch(_e){}
  }));
}
function enter(){
  const r=root();if(!r||S.focus)return;
  S.focus=true;r.classList.add('dg21-focus');
  scrollOpen();
}
function exit(){
  const r=root();if(!r||!S.focus||S.restorePending)return;
  S.restorePending=true;
  r.classList.remove('dg21-focus');S.focus=false;
  const y=Number.isFinite(S.originY)?S.originY:null;
  S.originY=null;
  requestAnimationFrame(()=>requestAnimationFrame(()=>{
    if(y!==null){try{window.scrollTo({top:y,behavior:'smooth'});}catch(_e){window.scrollTo(0,y);}}
    S.restorePending=false;
  }));
}
function sync(){
  const has=!!activeShell()||toolbarActive();
  if(has)enter();else exit();
}
function install(){
  css();
  const r=root();if(!r){setTimeout(install,100);return;}
  if(r.dataset.dg21==='1')return;r.dataset.dg21='1';

  // Ausgangsposition merken, bevor die bestehende Kachellogik den Bereich oeffnet.
  r.addEventListener('click',e=>{
    const t=e.target.closest('.dg80-final-tile,[data-dg80-key],#dg80FinalCalendar');
    if(t&&!S.focus)rememberOrigin();
  },true);

  // Auch Untermenues bleiben im Fokusmodus; die urspruengliche Kachelposition bleibt erhalten.
  const mo=new MutationObserver(()=>{
    clearTimeout(S.timer);S.timer=setTimeout(sync,0);
  });
  mo.observe(r,{subtree:true,childList:true,attributes:true,attributeFilter:['class']});

  // Escape entspricht dem X: Bereich schliessen und zur Kachelauswahl zurueck.
  document.addEventListener('keydown',e=>{
    if(e.key!=='Escape'||!S.focus)return;
    const close=q('dg80OfficeClose');
    if(close&&toolbarActive()){e.preventDefault();close.click();}
  });

  sync();
  document.documentElement.dataset.dgUi21=V;
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});else install();
})();


/* DG Zeiterfassung 9.0 - UI Hotfix 22
   Robuster Fokusmodus: Kachel anklicken -> Auswahl sofort ausblenden,
   Inhalt an den Anfang der Bueroseite holen; Schliessen -> exakt zur
   vorherigen Kachelposition zurueck. */
(function(){
'use strict';
const V='8.0-ui22';
const q=id=>document.getElementById(id);
const S=window.DG80_UI22=window.DG80_UI22||{focus:false,originY:0,timer:null,scrollTimers:[]};

function root(){return q('bossView');}
function dashboard(){const r=root();return r?r.querySelector('.dg80-final-dashboard,.d3-dashboard'):null;}
function hasOpenContent(){
  const r=root();if(!r)return false;
  if(q('dg80OfficeToolbar')?.classList.contains('active'))return true;
  return !!r.querySelector(':scope > .dg80-shell-active');
}
function css(){
  if(q('dg80Ui22Css'))return;
  const s=document.createElement('style');s.id='dg80Ui22Css';
  s.textContent=''
    +'#bossView.dg22-focus .dg80-final-dashboard{display:none!important}'
    +'#bossView.dg22-focus>.d3-dashboard{display:none!important}'
    +'#bossView.dg22-focus>#dg80OfficeToolbar{display:block!important;margin-top:0!important}'
    +'#bossView.dg22-focus>.dg80-shell-active{display:block!important}'
    +'#bossView.dg22-focus #dg80OfficeClose{background:#e5e7eb!important;color:#111827!important}';
  document.head.appendChild(s);
}
function clearScrollTimers(){
  (S.scrollTimers||[]).forEach(t=>clearTimeout(t));S.scrollTimers=[];
}
function jumpToOpen(){
  const r=root();if(!r)return;
  const run=()=>{
    const bar=q('dg80OfficeToolbar');
    const target=(bar&&bar.classList.contains('active'))?bar:(r.querySelector(':scope > .dg80-shell-active')||r);
    const top=Math.max(0,window.scrollY+target.getBoundingClientRect().top-8);
    window.scrollTo(0,top);
  };
  clearScrollTimers();
  [0,40,120,260].forEach(ms=>S.scrollTimers.push(setTimeout(run,ms)));
}
function enter(){
  const r=root();if(!r)return;
  if(!S.focus){
    S.originY=window.scrollY;
    S.focus=true;
  }
  r.classList.add('dg22-focus');
  jumpToOpen();
}
function exit(){
  const r=root();if(!r||!S.focus)return;
  clearScrollTimers();
  r.classList.remove('dg22-focus');
  const y=S.originY;
  S.focus=false;
  requestAnimationFrame(()=>requestAnimationFrame(()=>window.scrollTo(0,Math.max(0,y||0))));
}
function isMainTile(el){
  return !!el?.closest?.('.dg80-final-tile,[data-dg80-key],#dg80FinalCalendar');
}
function isClose(el){
  return !!el?.closest?.('#dg80OfficeClose,.dg80-group-close');
}
function install(){
  css();
  const r=root();if(!r){setTimeout(install,100);return;}
  if(r.dataset.dg22==='1')return;r.dataset.dg22='1';

  // Direkte Steuerung statt nur auf DOM-Aenderungen zu hoffen.
  r.addEventListener('click',e=>{
    if(isMainTile(e.target)){
      if(!S.focus)S.originY=window.scrollY;
      // Nach der vorhandenen Kachel-Logik den Fokusmodus sicher aktivieren.
      setTimeout(()=>{if(hasOpenContent()){S.focus=true;r.classList.add('dg22-focus');jumpToOpen();}},0);
      setTimeout(()=>{if(hasOpenContent()){S.focus=true;r.classList.add('dg22-focus');jumpToOpen();}},80);
      return;
    }
    if(isClose(e.target)){
      // Erst bestehende Schliesslogik ausfuehren lassen, dann Auswahl zurueckholen.
      setTimeout(()=>{if(!hasOpenContent())exit();},0);
      setTimeout(()=>{if(!hasOpenContent())exit();},100);
    }
  },true);

  // Untermenue-Klick: Fokus bleibt, geoeffneter Unterbereich wird wieder nach oben geholt.
  r.addEventListener('click',e=>{
    if(!S.focus)return;
    if(e.target.closest('[data-dg80-sub]'))setTimeout(jumpToOpen,50);
  },true);

  // Fallback fuer programmatisches Oeffnen/Schliessen.
  const mo=new MutationObserver(()=>{
    clearTimeout(S.timer);
    S.timer=setTimeout(()=>{
      if(hasOpenContent()){
        if(S.focus){r.classList.add('dg22-focus');}
      }else if(S.focus){
        exit();
      }
    },20);
  });
  mo.observe(r,{subtree:true,childList:true,attributes:true,attributeFilter:['class']});

  document.addEventListener('keydown',e=>{
    if(e.key==='Escape'&&S.focus){
      const close=q('dg80OfficeClose');
      if(close&&q('dg80OfficeToolbar')?.classList.contains('active')){e.preventDefault();close.click();}
      else exit();
    }
  });

  document.documentElement.dataset.dgUi22=V;
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});else install();
})();


/* DG Zeiterfassung 9.0 - UI Hotfix 23
   Stabile Overlay-Navigation + reduzierte Backend-Last.
   Geoeffnete Kachelbereiche liegen als echtes Overlay ueber dem Dashboard.
   Keine Scroll-Automatik mehr noetig. */
(function(){
'use strict';
const V='8.0-ui23';
const q=id=>document.getElementById(id);
const S=window.DG80_UI23=window.DG80_UI23||{timer:null,countLoaded:false};

function root(){return q('bossView');}
function activePanel(){
  const r=root();if(!r)return null;
  return r.querySelector(':scope > .dg80-shell-active');
}
function groupOpen(){
  return !!q('dg80GroupChooser')?.classList.contains('dg80-shell-active');
}
function toolbarOpen(){
  return !!q('dg80OfficeToolbar')?.classList.contains('active');
}
function overlayOpen(){return toolbarOpen()||groupOpen()||!!activePanel();}

function css(){
  if(q('dg80Ui23Css'))return;
  const s=document.createElement('style');s.id='dg80Ui23Css';
  s.textContent=''
    /* neutralise the two earlier focus experiments */
    +'#bossView.dg21-focus>.d3-dashboard,#bossView.dg22-focus>.d3-dashboard,#bossView.dg21-focus .dg80-final-dashboard,#bossView.dg22-focus .dg80-final-dashboard{display:block!important}'
    /* dark/light backdrop */
    +'body.dg23-office-overlay:before{content:"";position:fixed;inset:0;background:rgba(15,23,42,.28);z-index:8998;backdrop-filter:blur(2px)}'
    /* main toolbar/header */
    +'body.dg23-office-overlay #dg80OfficeToolbar.active{position:fixed!important;z-index:9001!important;top:12px!important;left:50%!important;transform:translateX(-50%)!important;width:min(1500px,calc(100vw - 24px))!important;max-height:110px!important;margin:0!important;box-sizing:border-box!important}'
    /* active content pane */
    +'body.dg23-office-overlay #bossView>.dg80-shell-active:not(#dg80GroupChooser){position:fixed!important;z-index:9000!important;left:50%!important;transform:translateX(-50%)!important;top:112px!important;bottom:12px!important;width:min(1500px,calc(100vw - 24px))!important;max-width:none!important;margin:0!important;overflow:auto!important;box-sizing:border-box!important;background:#fff!important;border-radius:18px!important;box-shadow:0 20px 55px rgba(15,23,42,.28)!important}'
    /* chooser without toolbar */
    +'body.dg23-office-overlay #dg80GroupChooser.dg80-shell-active{position:fixed!important;z-index:9001!important;left:50%!important;transform:translateX(-50%)!important;top:18px!important;bottom:18px!important;width:min(1000px,calc(100vw - 24px))!important;max-width:none!important;margin:0!important;overflow:auto!important;box-sizing:border-box!important;background:#fff!important;border-radius:18px!important;box-shadow:0 20px 55px rgba(15,23,42,.28)!important}'
    +'body.dg23-office-overlay{overflow:hidden!important}'
    +'@media(max-width:759px){body.dg23-office-overlay #dg80OfficeToolbar.active{top:6px!important;width:calc(100vw - 12px)!important;max-height:122px!important}body.dg23-office-overlay #bossView>.dg80-shell-active:not(#dg80GroupChooser){top:118px!important;bottom:6px!important;width:calc(100vw - 12px)!important;border-radius:14px!important}body.dg23-office-overlay #dg80GroupChooser.dg80-shell-active{top:6px!important;bottom:6px!important;width:calc(100vw - 12px)!important}}';
  document.head.appendChild(s);
}

function syncOverlay(){
  document.body.classList.toggle('dg23-office-overlay',overlayOpen());
}

async function loadCreatedOfferCount(){
  if(S.countLoaded||typeof window.api!=='function')return;
  S.countLoaded=true;
  try{
    const payload=typeof window.chefPayload==='function'?window.chefPayload({action:'getOfferStatistics'}):{action:'getOfferStatistics'};
    const x=await window.api(payload);
    const y=String(new Date().getFullYear());
    let n=0,found=false;
    if(x&&Array.isArray(x.months)){
      x.months.forEach(m=>{
        const mk=String(m&&m.month||'');
        if(mk.startsWith(y)){n+=Number(m.total||0);found=true;}
      });
    }
    if(!found&&x&&Number.isFinite(Number(x.total))&&(!x.months||!x.months.length)){n=Number(x.total||0);found=true;}
    if(found){
      const e=q('dg80c-createdOffersYear');if(e)e.textContent=String(n);
      const t=e?.closest('[data-dg80-final="createdOffersYear"]');const l=t?.querySelector('span');
      if(l)l.textContent='Erstellte Angebote '+y;
    }
  }catch(_e){S.countLoaded=false;}
}

function install(){
  css();
  const r=root();if(!r){setTimeout(install,100);return;}
  if(r.dataset.dg23==='1')return;r.dataset.dg23='1';

  // Remove stale focus classes from the old attempts.
  r.classList.remove('dg21-focus','dg22-focus');

  const mo=new MutationObserver(()=>{
    clearTimeout(S.timer);S.timer=setTimeout(syncOverlay,0);
  });
  mo.observe(r,{subtree:true,childList:true,attributes:true,attributeFilter:['class']});

  // Overlay state is driven only by actual open/close state; no scrolling involved.
  r.addEventListener('click',()=>setTimeout(syncOverlay,0),true);
  document.addEventListener('keydown',e=>{
    if(e.key==='Escape'&&document.body.classList.contains('dg23-office-overlay')){
      const close=q('dg80OfficeClose');
      if(close&&toolbarOpen()){e.preventDefault();close.click();}
    }
  });

  syncOverlay();
  document.documentElement.dataset.dgUi23=V;
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});else install();
})();


/* DG Zeiterfassung 9.0 - UI Hotfix 24
   Performance-Modus: automatische Leseabfragen maximal 1x pro Stunde.
   Jeder datenabhaengige Buerobereich kann gezielt manuell synchronisiert werden. */
(function(){
'use strict';
const V='8.0-ui24';
const q=id=>document.getElementById(id);
const S=window.DG80_UI24=window.DG80_UI24||{busy:false,timer:null,last:{}};
const STORE='dg80_manual_sync_times_v1';

const NO_SYNC_TITLES=new Set(['Einkaufsliste']);
function norm(v){return String(v||'').trim().toLowerCase();}
function readTimes(){try{return JSON.parse(localStorage.getItem(STORE)||'{}')||{};}catch(_e){return {};}}
function saveTimes(x){try{localStorage.setItem(STORE,JSON.stringify(x));}catch(_e){}}
function currentTitle(){
  const a=q('dg80OfficeTitle');
  if(a&&String(a.textContent||'').trim()&&a.offsetParent!==null)return String(a.textContent||'').trim();
  const g=q('dg80GroupChooser')?.querySelector('.dg80-group-head h2');
  if(g)return String(g.textContent||'').trim();
  return '';
}
function stampKey(title){return norm(title).replace(/[^a-z0-9äöüß]+/g,'_');}
function stampText(title){
  const x=readTimes()[stampKey(title)];
  if(!x)return 'automatisch max. 1×/Std.';
  try{return 'zuletzt: '+new Date(x).toLocaleTimeString('de-DE',{hour:'2-digit',minute:'2-digit'});}catch(_e){return 'zuletzt synchronisiert';}
}
function clearReadCaches(){
  try{if(window.DG51&&DG51.readCache&&typeof DG51.readCache.clear==='function')DG51.readCache.clear();}catch(_e){}
  try{if(window.DG3&&DG3.reads&&typeof DG3.reads.clear==='function')DG3.reads.clear();}catch(_e){}
}
function forceFlags(){
  try{
    if(window.DG51){DG51.forceDashboard=true;DG51.forceCalendar=true;DG51.forceDay=true;}
    if(window.DG525)DG525.lastAuto=0;
  }catch(_e){}
}
function setSyncUi(title,busy,msg){
  document.querySelectorAll('.dg24-sync-btn').forEach(b=>{b.disabled=!!busy;b.textContent=busy?'Synchronisiert …':'Jetzt synchronisieren';});
  document.querySelectorAll('.dg24-sync-stamp').forEach(s=>{s.textContent=msg||stampText(title);});
}
async function runLoaderByTitle(title){
  const t=norm(title),open=window.DG3&&DG3.open?String(DG3.open):'';

  // Anfragen: manuell bedeutet echter Gmail/AQON-Abgleich.
  if(t==='offene anfragen'||t==='offene kundenanfragen'||t==='aqon pure anfragen'){
    if(typeof window.d3Import==='function'){await window.d3Import();return;}
  }
  if(t==='anfragenarchiv'){
    if(typeof window.d3InquiryArchiveList==='function'){await window.d3InquiryArchiveList();return;}
  }
  if(t==='webseiten anfragen'){
    if(typeof window.dg80WebsiteInquiriesLoad==='function'){await window.dg80WebsiteInquiriesLoad();return;}
  }
  if(t==='whatsapp'){
    if(typeof window.dg80WhatsappInquiriesLoad==='function'){await window.dg80WhatsappInquiriesLoad();return;}
  }

  // Kalender / Planung
  if(t==='mitarbeiter kalender'){
    if(typeof window.dg62Load==='function'){await window.dg62Load(true);return;}
    if(typeof window.loadCalendarEvents==='function'){await window.loadCalendarEvents(true);return;}
  }

  // Regieberichte / Auftraege
  if(t==='rechnung zu erstellen'){
    if(typeof window.loadRegieReports==='function'){await window.loadRegieReports('Abgeschlossen');return;}
  }
  if(t.startsWith('abgerechnete aufträge')){
    if(typeof window.loadRegieReports==='function'){await window.loadRegieReports('Abgerechnet');return;}
  }
  if(t==='laufende aufträge'){
    if(typeof window.loadRegieReports==='function'){await window.loadRegieReports('Laufend');return;}
  }

  // Angebote
  if(t==='zu erstellende angebote'){
    if(typeof window.loadOffers==='function'){await window.loadOffers('Zu erstellen');return;}
  }
  if(t==='offene angebote'){
    if(typeof window.loadOffers==='function'){await window.loadOffers('Offen');return;}
  }
  if(t==='angebotsarchiv'){
    if(typeof window.loadOffers==='function'){await window.loadOffers('Archiv');return;}
  }
  if(t==='angebotsstatistik'){
    if(typeof window.loadStats==='function'){await window.loadStats();return;}
  }
  if(t.startsWith('erstellte angebote')){
    if(typeof window.DG80_UI18_openCreatedOffers==='function'){await window.DG80_UI18_openCreatedOffers();return;}
  }

  // Sonstige datenintensive Bereiche
  if(t==='reminder'&&typeof window.loadReminders==='function'){await window.loadReminders();return;}
  if(t==='wartungen'){
    if(typeof window.d36LoadMaintenance==='function'){await window.d36LoadMaintenance();return;}
  }
  if(t==='offene tagesabschlüsse'||t==='übertragene tagesabschlüsse / prüfung'){
    if(typeof window.DG80_UI12_openDays==='function'){await window.DG80_UI12_openDays();return;}
    if(typeof window.loadBossDayClosuresV48==='function'){await window.loadBossDayClosuresV48();return;}
  }
  if(t==='lohnübergabe'){
    if(typeof window.dg520RunAudit==='function'){await window.dg520RunAudit();return;}
  }
  if(t==='mitarbeiterverwaltung'||t==='urlaub / abwesenheiten / feiertage'){
    if(typeof window.loadChefAdministration==='function'){await window.loadChefAdministration();return;}
  }
  if(t==='mitarbeiter auswertungen'){
    if(typeof window.dg80EmployeeStatsLoad==='function'){await window.dg80EmployeeStatsLoad(true);return;}
  }
  if(t==='whatsapp'){
    if(typeof window.dg80WhatsappInquiriesLoad==='function'){await window.dg80WhatsappInquiriesLoad(true);return;}
  }
  if(t==='krank-fristen'){
    if(typeof window.loadSicknessAlerts734==='function'){await window.loadSicknessAlerts734();return;}
  }
  if(t==='systemcheck'&&typeof window.d3Health==='function'){await window.d3Health();return;}

  // Letzter Fallback: nur den aktuell geoeffneten Loader aufrufen.
  if(open&&window.DG3&&DG3.loaders&&typeof DG3.loaders[open]==='function'){
    await DG3.loaders[open]();return;
  }
  // Nur wenn kein Bereichsloader existiert: Dashboard gezielt aktualisieren.
  if(typeof window.d3Dashboard==='function')await window.d3Dashboard(true);
}
async function manualSync(){
  if(S.busy)return;
  const title=currentTitle()||'Bereich';
  S.busy=true;setSyncUi(title,true,'Synchronisierung läuft …');
  try{
    clearReadCaches();forceFlags();
    await runLoaderByTitle(title);
    try{
      if(window.DG80_FINAL&&typeof window.dg80FinalRefreshExtra==='function')await window.dg80FinalRefreshExtra(true);
    }catch(_e){}
    const times=readTimes();times[stampKey(title)]=Date.now();saveTimes(times);
    setSyncUi(title,false,stampText(title));
  }catch(e){
    setSyncUi(title,false,'Fehler: '+(e&&e.message?e.message:e));
  }finally{S.busy=false;}
}
window.dg80ManualAreaSync=manualSync;

function needSync(title){
  if(!title||NO_SYNC_TITLES.has(title))return false;
  return true;
}
function makeButton(title){
  const wrap=document.createElement('div');wrap.className='dg24-sync-wrap';
  const b=document.createElement('button');b.type='button';b.className='btn danger dg24-sync-btn';b.textContent='Jetzt synchronisieren';b.addEventListener('click',e=>{e.preventDefault();e.stopPropagation();manualSync();});
  const s=document.createElement('span');s.className='dg24-sync-stamp';s.textContent=stampText(title);
  wrap.append(b,s);return wrap;
}
function installToolbarButton(){
  const bar=q('dg80OfficeToolbar');if(!bar||!bar.classList.contains('active'))return;
  const title=q('dg80OfficeTitle')?.textContent?.trim()||'';
  if(!needSync(title))return;
  const head=bar.querySelector('.dg80-office-toolbar-head');if(!head)return;
  let wrap=head.querySelector('.dg24-sync-wrap');
  if(!wrap){
    const h=head.querySelector('h2');
    const titleBox=document.createElement('div');titleBox.className='dg24-title-sync';
    if(h){h.parentNode.insertBefore(titleBox,h);titleBox.appendChild(h);}
    wrap=makeButton(title);titleBox.appendChild(wrap);
  }else{
    wrap.querySelector('.dg24-sync-stamp').textContent=stampText(title);
  }
}
function installGroupButton(){
  const box=q('dg80GroupChooser');if(!box||!box.classList.contains('dg80-shell-active'))return;
  const head=box.querySelector('.dg80-group-head');if(!head)return;
  const title=head.querySelector('h2')?.textContent?.trim()||'';
  if(!needSync(title)||head.querySelector('.dg24-sync-wrap'))return;
  const wrap=makeButton(title);
  const close=head.querySelector('.dg80-group-close');
  if(close)head.insertBefore(wrap,close);else head.appendChild(wrap);
}
function css(){
  if(q('dg80Ui24Css'))return;
  const s=document.createElement('style');s.id='dg80Ui24Css';
  s.textContent=''
   +'.dg24-title-sync{display:flex;align-items:center;gap:14px;flex-wrap:wrap;min-width:0}'
   +'.dg24-sync-wrap{display:flex;align-items:center;gap:8px;flex-wrap:wrap}'
   +'.dg24-sync-btn{background:#b9382b!important;border-color:#a33126!important;color:#fff!important;font-weight:900!important;min-height:42px!important;padding:9px 15px!important}'
   +'.dg24-sync-btn:hover{background:#9f2f24!important}'
   +'.dg24-sync-btn:disabled{opacity:.65!important;cursor:wait!important}'
   +'.dg24-sync-stamp{font-size:12px;font-weight:800;color:#64748b;white-space:nowrap}'
   +'.dg80-group-head{gap:12px!important;flex-wrap:wrap!important}'
   +'@media(max-width:700px){.dg24-title-sync,.dg24-sync-wrap{width:100%}.dg24-sync-btn{flex:1}.dg24-sync-stamp{width:100%}}';
  document.head.appendChild(s);
}
function enforce(){css();installToolbarButton();installGroupButton();}
function install(){
  css();enforce();
  const mo=new MutationObserver(()=>{clearTimeout(S.timer);S.timer=setTimeout(enforce,0);});
  mo.observe(document.body,{subtree:true,childList:true,attributes:true,attributeFilter:['class']});
  document.documentElement.dataset.dgUi24=V;
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});else install();
})();


/* DG Zeiterfassung 9.0 - UI Hotfix 25
   Gezielter Frische-Fix: Rechnung/Laufende Auftraege laden beim Oeffnen frisch,
   Wartungsvertraege synchronisieren ueber die aktuelle Wartungsuebersicht,
   Jahres-Wartungskacheln bleiben im sichtbaren Bereich. */
(function(){
'use strict';
const V='8.0-ui25';
const q=id=>document.getElementById(id);
const S=window.DG80_UI25=window.DG80_UI25||{busy:false,timer:null};

function norm(v){return String(v||'').trim().toLowerCase();}
function clearReadCaches(){
  try{if(window.DG51&&DG51.readCache&&typeof DG51.readCache.clear==='function')DG51.readCache.clear();}catch(_e){}
  try{if(window.DG3&&DG3.reads&&typeof DG3.reads.clear==='function')DG3.reads.clear();}catch(_e){}
}
async function freshReports(kind){
  clearReadCaches();
  if(typeof window.loadRegieReports==='function'){await window.loadRegieReports(kind);return;}
  if(typeof window.d3Reports==='function'){await window.d3Reports(kind);return;}
  const loader=window.DG3&&DG3.loaders&&(kind==='Laufend'?DG3.loaders.d3Running:DG3.loaders.d3Completed);
  if(typeof loader==='function')await loader();
}
async function freshMaintenance(){
  clearReadCaches();
  if(typeof window.d37LoadMaintenanceOverview==='function'){await window.d37LoadMaintenanceOverview();return;}
  if(window.DG3&&DG3.loaders&&typeof DG3.loaders.d36Maintenance==='function'){await DG3.loaders.d36Maintenance();return;}
  if(typeof window.d36LoadMaintenance==='function')await window.d36LoadMaintenance();
}
function visibleMaintenanceStats(){
  const card=q('d36Maintenance'),top=q('d39MaintenanceTop');if(!card||!top)return;
  const body=card.querySelector(':scope > .dg48-body')||card;
  const nav=q('d37MaintenanceNav');
  if(top.parentElement!==body){
    if(nav&&nav.parentElement===body)body.insertBefore(top,nav);
    else body.prepend(top);
  }
  top.classList.remove('hidden');
}
async function syncMaintenance(){
  if(S.busy)return;
  S.busy=true;
  try{await freshMaintenance();visibleMaintenanceStats();}
  finally{S.busy=false;}
}
function installOpenFresh(){
  const base=window.dg80OfficeOpen;
  if(typeof base!=='function'||base.__dg25)return false;
  const wrapped=function(key,options){
    const r=base.apply(this,arguments);
    if((key==='completed'||key==='running')&&!(options&&options.dg25SkipFresh)){
      const kind=key==='running'?'Laufend':'Abgeschlossen';
      setTimeout(()=>{freshReports(kind).catch(e=>console.warn('DG UI25 Auftrags-Sync',e));},0);
    }
    if(key==='maintenance'&&!(options&&options.dg25SkipFresh)){
      setTimeout(()=>{syncMaintenance().catch(e=>console.warn('DG UI25 Wartungs-Sync',e));},0);
    }
    return r;
  };
  wrapped.__dg25=true;
  window.dg80OfficeOpen=wrapped;
  return true;
}
function installManualSyncRepair(){
  const base=window.dg80ManualAreaSync;
  if(typeof base!=='function'||base.__dg25)return false;
  const wrapped=async function(){
    const title=norm(q('dg80OfficeTitle')?.textContent||'');
    if(title==='wartungen'||title==='wartungsverträge'||title==='wartungsvertraege'){
      const btns=[...document.querySelectorAll('.dg24-sync-btn')],stamps=[...document.querySelectorAll('.dg24-sync-stamp')];
      btns.forEach(b=>{b.disabled=true;b.textContent='Synchronisiert …';});
      stamps.forEach(s=>s.textContent='Synchronisierung läuft …');
      try{
        await syncMaintenance();
        const now=new Date().toLocaleTimeString('de-DE',{hour:'2-digit',minute:'2-digit'});
        stamps.forEach(s=>s.textContent='zuletzt: '+now);
      }catch(e){
        stamps.forEach(s=>s.textContent='Fehler: '+(e&&e.message?e.message:e));
      }finally{
        btns.forEach(b=>{b.disabled=false;b.textContent='Jetzt synchronisieren';});
      }
      return;
    }
    return base.apply(this,arguments);
  };
  wrapped.__dg25=true;
  window.dg80ManualAreaSync=wrapped;
  return true;
}
function repairSyncButtons(){
  document.querySelectorAll('.dg24-sync-btn').forEach(b=>{
    if(b.dataset.dg25==='1')return;
    b.dataset.dg25='1';
    b.addEventListener('click',e=>{
      const title=norm(q('dg80OfficeTitle')?.textContent||'');
      if(title!=='wartungen'&&title!=='wartungsverträge'&&title!=='wartungsvertraege')return;
      e.preventDefault();e.stopImmediatePropagation();
      window.dg80ManualAreaSync?.();
    },true);
  });
}
function demoteOptionalPlacesWarning(){
  const host=q('d3HealthList');if(!host)return;
  [...host.querySelectorAll('.status')].forEach(box=>{
    const t=String(box.textContent||'');
    if(!/Google Places Key/i.test(t))return;
    if(!/nicht zentral in Script Properties gespeichert/i.test(t))return;
    box.classList.remove('warn','error');box.classList.add('info');
    const strong=box.querySelector('strong');
    if(strong&&!/optional/i.test(strong.textContent||''))strong.textContent='Google Places Key (optional)';
    if(!/Adressvorschl/i.test(t))box.appendChild(document.createTextNode(' – betrifft nur die automatische Adressvorschlagsfunktion.'));
  });
}
function observe(){
  const root=q('bossView')||document.body;
  const mo=new MutationObserver(()=>{
    clearTimeout(S.timer);S.timer=setTimeout(()=>{installOpenFresh();installManualSyncRepair();repairSyncButtons();visibleMaintenanceStats();demoteOptionalPlacesWarning();},0);
  });
  mo.observe(root,{subtree:true,childList:true,attributes:true,attributeFilter:['class']});
}
function install(){
  installOpenFresh();installManualSyncRepair();repairSyncButtons();visibleMaintenanceStats();demoteOptionalPlacesWarning();observe();
  document.documentElement.dataset.dgUi25=V;
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});else install();
})();


/* DG Zeiterfassung 9.0 - UI Hotfix 26
   Manuell ausgefuehrte Wartung: Kundendaten, Geraetestandort und naechste Wartung
   werden in einem Arbeitsgang angelegt. */
(function(){
'use strict';
const V='8.0-ui26';
const q=id=>document.getElementById(id);
function val(v){return String(v==null?'':v).trim();}
function addSection(fieldId,title,text){
  const input=q(fieldId);if(!input)return;
  const label=input.previousElementSibling;
  const h=document.createElement('div');h.className='dg26-form-section';
  h.innerHTML='<strong>'+title+'</strong>'+(text?'<small>'+text+'</small>':'');
  (label||input).parentNode.insertBefore(h,label||input);
}
function enhance(){
  const modal=q('d3FormModal');if(!modal)return;
  modal.classList.add('dg26-maint-modal');
  addSection('d3Field-date','1. Ausgeführte Wartung','Diese Wartung wird als eine ausgeführte Wartung gezählt.');
  addSection('d3Field-customer','2. Kundendaten','Der Kunde wird gleichzeitig als Wartungskunde angelegt.');
  addSection('d3Field-locationName','3. Standort des Gerätes','Hier den tatsächlichen Standort der gewarteten Anlage eintragen.');
  addSection('d3Field-nextMaintenance','4. Nächste Wartung','Die nächste Fälligkeit erscheint anschließend automatisch in der Wartungsübersicht.');
  const loc=q('d3Field-locationStreet');
  if(loc&&!q('dg26CopyAddress')){
    const b=document.createElement('button');b.type='button';b.id='dg26CopyAddress';b.className='btn secondary dg26-copy';
    b.textContent='Rechnungsadresse als Gerätestandort übernehmen';
    b.addEventListener('click',()=>{
      [['customerStreet','locationStreet'],['customerZip','locationZip'],['customerCity','locationCity']].forEach(([a,z])=>{
        const s=q('d3Field-'+a),d=q('d3Field-'+z);if(s&&d)d.value=s.value;
      });
    });
    const lab=loc.previousElementSibling;(lab||loc).parentNode.insertBefore(b,lab||loc);
  }
}
function clearCaches(){
  try{if(window.DG51&&DG51.readCache&&typeof DG51.readCache.clear==='function')DG51.readCache.clear();}catch(_e){}
  try{if(window.DG3&&DG3.reads&&typeof DG3.reads.clear==='function')DG3.reads.clear();}catch(_e){}
  try{if(window.DG38){DG38.loaded=false;DG38.overview=null;}}catch(_e){}
  try{if(window.DG37)DG37.overview=null;}catch(_e){}
}
async function refresh(){
  clearCaches();
  if(typeof window.d38RefreshMaintenance==='function'){await window.d38RefreshMaintenance();return;}
  if(typeof window.d37LoadMaintenanceOverview==='function')await window.d37LoadMaintenanceOverview();
}
window.d505AddManualMaintenance=function(){
  const today=typeof window.localDate==='function'?window.localDate():new Date().toISOString().slice(0,10);
  const n=new Date();n.setFullYear(n.getFullYear()+1);const due=n.getFullYear()+'-'+String(n.getMonth()+1).padStart(2,'0');
  if(typeof window.d3Form!=='function')return false;
  window.d3Form('Ausgeführte Wartung erfassen & nächste Wartung anlegen',[
    {name:'date',label:'Datum der ausgeführten Wartung',type:'date',required:true},
    {name:'note',label:'Vermerk zur ausgeführten Wartung (optional)',type:'textarea'},
    {name:'customer',label:'Kunde / Firma',required:true},
    {name:'customerStreet',label:'Straße / Hausnummer',required:true},
    {name:'customerZip',label:'PLZ',required:true},
    {name:'customerCity',label:'Ort',required:true},
    {name:'phone',label:'Telefon (optional)'},
    {name:'email',label:'E-Mail (optional)',type:'email'},
    {name:'locationName',label:'Standort / Objektbezeichnung (optional)'},
    {name:'locationStreet',label:'Straße / Hausnummer',required:true},
    {name:'locationZip',label:'PLZ',required:true},
    {name:'locationCity',label:'Ort',required:true},
    {name:'device',label:'Gerät / Anlage (optional)'},
    {name:'nextMaintenance',label:'Nächste Wartung – Monat / Jahr',type:'month',required:true}
  ],{date:today,note:'',customer:'',customerStreet:'',customerZip:'',customerCity:'',phone:'',email:'',locationName:'',locationStreet:'',locationZip:'',locationCity:'',device:'',nextMaintenance:due},async v=>{
    const customer=val(v.customer),street=val(v.customerStreet),zip=val(v.customerZip),city=val(v.customerCity);
    const ls=val(v.locationStreet),lz=val(v.locationZip),lc=val(v.locationCity),next=val(v.nextMaintenance);
    if(!customer||!street||!zip||!city)throw new Error('Bitte die Kundendaten vollständig eintragen.');
    if(!ls||!lz||!lc)throw new Error('Bitte den Standort des Gerätes vollständig eintragen.');
    if(!/^\d{4}-\d{2}$/.test(next))throw new Error('Bitte Monat und Jahr der nächsten Wartung auswählen.');
    const item={
      id:'',name:customer,billingStreet:street,billingZip:zip,billingCity:city,email:val(v.email),phone:val(v.phone),
      objects:[{id:'',name:val(v.locationName)||'Gerätestandort',street:ls,zip:lz,city:lc,notes:'',
        devices:[{id:'',deviceType:'Sonstiges',otherDescription:val(v.device)||'Wartungsgerät',manufacturer:'',model:'',serialNumber:'',year:'',
          tenantName:'',tenantPhone:'',tenantEmail:'',sparePartManufacturer:'',sparePartSerialNumber:'',internalNotes:val(v.note),nextMaintenanceDue:next,repairs:[]}]}]
    };
    await window.api(window.chefPayload({action:'saveMaintenanceCustomer',item}));
    await window.api(window.chefPayload({action:'addManualMaintenanceCount',date:val(v.date),count:1,note:val(v.note)||('Wartung '+customer)}));
    await refresh();
  });
  setTimeout(enhance,0);
  return false;
};
function css(){
  if(q('dg26Css'))return;
  const s=document.createElement('style');s.id='dg26Css';
  s.textContent='.dg26-maint-modal .d3-form{max-width:860px!important;max-height:92vh!important;overflow:auto!important}'
    +'.dg26-maint-modal .d3-fields{display:grid!important;grid-template-columns:1fr 1fr!important;gap:10px 16px!important}'
    +'.dg26-maint-modal .d3-fields>label{align-self:end!important;margin:0!important}.dg26-maint-modal .d3-fields>input,.dg26-maint-modal .d3-fields>textarea{margin:0!important}'
    +'.dg26-form-section{grid-column:1/-1!important;margin:12px 0 0!important;padding:10px 12px!important;background:#eef4ff!important;border-radius:10px!important;color:#31589e!important}'
    +'.dg26-form-section strong{display:block!important;font-size:17px!important}.dg26-form-section small{display:block!important;color:#64748b!important;margin-top:2px!important}'
    +'.dg26-copy{grid-column:1/-1!important;width:auto!important;justify-self:start!important}'
    +'@media(max-width:700px){.dg26-maint-modal .d3-fields{grid-template-columns:1fr!important}.dg26-form-section,.dg26-copy{grid-column:1!important}}';
  document.head.appendChild(s);
}
function install(){css();document.documentElement.dataset.dgUi26=V;}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});else install();
})();

/* DG Zeiterfassung 9.0 - UI Hotfix 27
   Wartungsvertrag: Ausfuehrungsort kann mit einem Haken vollstaendig
   aus dem Rechnungsempfaenger uebernommen werden. */
(function(){
'use strict';
const V='8.0-ui27';
function field(root,key){return root?root.querySelector('[data-d37="'+key+'"]'):null;}
function copy(form,obj){
  [['customerName','objectName'],['billingStreet','street'],['billingZip','zip'],['billingCity','city']].forEach(([a,b])=>{
    const s=field(form,a),d=field(obj,b);if(s&&d)d.value=s.value||'';
  });
  const sum=obj.querySelector('.d504-address-summary');
  if(sum){
    const name=field(form,'customerName')?.value||'',street=field(form,'billingStreet')?.value||'',zip=field(form,'billingZip')?.value||'',city=field(form,'billingCity')?.value||'';
    sum.textContent=[name,street,[zip,city].filter(Boolean).join(' ')].filter(Boolean).join(' · ');
  }
}
function apply(form,obj,on){
  const cb=obj.querySelector('.d504-address-check');if(cb)cb.checked=!!on;
  ['objectName','street','zip','city'].forEach(k=>{
    const e=field(obj,k),box=e&&e.parentElement;
    if(e)e.required=!on;
    if(box)box.classList.toggle('hidden',!!on);
  });
  const sum=obj.querySelector('.d504-address-summary');if(sum)sum.classList.toggle('hidden',!on);
  if(on)copy(form,obj);
}
function enhanceForm(form){
  if(!form)return;
  [...form.querySelectorAll('.d37-object')].forEach(obj=>{
    let row=obj.querySelector('.d504-address-toggle');
    if(!row){
      row=document.createElement('div');row.className='d504-address-toggle';
      row.innerHTML='<label class="d504-address-label"><input type="checkbox" class="d504-address-check" style="width:auto"> <strong>Identisch mit Rechnungsempfänger</strong></label><div class="d504-address-summary status ok hidden"></div>';
      const head=obj.querySelector('.d37-subhead');if(head)head.insertAdjacentElement('afterend',row);else obj.prepend(row);
    }else{
      const strong=row.querySelector('strong');if(strong)strong.textContent='Identisch mit Rechnungsempfänger';
    }
    const cb=row.querySelector('.d504-address-check');
    if(cb&&cb.dataset.dg27!=='1'){
      cb.dataset.dg27='1';cb.addEventListener('change',()=>apply(form,obj,cb.checked));
    }
    apply(form,obj,!!cb?.checked);
  });
  ['customerName','billingStreet','billingZip','billingCity'].forEach(k=>{
    const e=field(form,k);if(!e||e.dataset.dg27==='1')return;
    e.dataset.dg27='1';e.addEventListener('input',()=>form.querySelectorAll('.d37-object').forEach(obj=>{if(obj.querySelector('.d504-address-check')?.checked)copy(form,obj);}));
  });
}
function scan(){document.querySelectorAll('.d37-customer-form').forEach(enhanceForm);}
function install(){
  scan();
  const mo=new MutationObserver(()=>setTimeout(scan,0));
  mo.observe(document.body,{subtree:true,childList:true});
  document.documentElement.dataset.dgUi27=V;
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});else install();
})();


/* DG Zeiterfassung 9.0 - UI Hotfix 28
   Wartungskunden: nächste Wartung in "Alle Kunden", zusätzliche Kundensuche
   neben Geräte-ID und einheitlich blaue Wartungsnavigation. */
(function(){
'use strict';
const V='8.0-ui28';
const q=id=>document.getElementById(id);
const esc=v=>String(v==null?'':v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const MONTHS=['Januar','Februar','März','April','Mai','Juni','Juli','August','September','Oktober','November','Dezember'];

function dueLabel(v){
  const m=/^(\d{4})-(\d{2})$/.exec(String(v||''));
  return m?MONTHS[Math.max(0,Math.min(11,Number(m[2])-1))]+' '+m[1]:String(v||'');
}
function nextDueFromCustomer(c){
  const dues=[];
  (c&&c.objects||[]).forEach(o=>(o.devices||[]).forEach(d=>{
    const v=String(d&&d.nextMaintenanceDue||'').trim();
    if(/^\d{4}-\d{2}$/.test(v))dues.push(v);
  }));
  dues.sort();
  return dues[0]||'';
}
async function fetchCustomer(id){
  if(typeof window.api!=='function')throw new Error('Backend nicht bereit.');
  const p={action:'getMaintenanceCustomer',id:String(id||''),force:true};
  return window.api(typeof window.chefPayload==='function'?window.chefPayload(p):p);
}
async function decorateAllCustomers(){
  const host=q('d50MaintenanceAll');if(!host)return;
  const rows=[...host.querySelectorAll('.d50-customer-row[data-id]')];
  if(!rows.length)return;
  const queue=rows.slice();let cursor=0;
  async function worker(){
    while(cursor<queue.length){
      const row=queue[cursor++];if(!row||row.dataset.dg28Due==='1')continue;
      row.dataset.dg28Due='1';
      let due='';
      try{due=nextDueFromCustomer(await fetchCustomer(row.dataset.id));}catch(_e){}
      let box=row.querySelector('.dg28-next-due');
      if(!box){box=document.createElement('span');box.className='dg28-next-due';row.appendChild(box);}
      box.innerHTML=due?'<b>Nächste Wartung:</b> '+esc(dueLabel(due)):'<b>Nächste Wartung:</b> nicht hinterlegt';
    }
  }
  await Promise.all([worker(),worker(),worker()]);
}
function wrapAllCustomers(){
  const base=window.d50OpenAllCustomers;if(typeof base!=='function'||base.__dg28)return false;
  const wrapped=async function(){
    const r=await base.apply(this,arguments);
    await decorateAllCustomers();
    return r;
  };
  wrapped.__dg28=true;window.d50OpenAllCustomers=wrapped;return true;
}

function ensureCustomerSearch(){
  const top=q('d39MaintenanceTop');if(!top||q('dg28CustomerSearch'))return;
  const device=top.querySelector('.d39-id-search');
  const box=document.createElement('div');box.id='dg28CustomerSearch';box.className='d39-id-search dg28-customer-search';
  box.innerHTML='<label for="dg28CustomerQuery">Kunde suchen</label><div><input id="dg28CustomerQuery" placeholder="Name, Ort oder Adresse"><button type="button" id="dg28CustomerSearchBtn" class="btn primary">Suchen</button></div><div id="dg28CustomerSearchResult"></div>';
  if(device)device.insertAdjacentElement('afterend',box);else top.appendChild(box);
  const run=async()=>{
    const host=q('dg28CustomerSearchResult'),query=String(q('dg28CustomerQuery')?.value||'').trim();
    if(!host)return;
    if(!query){host.innerHTML='<div class="status warn">Bitte einen Kundennamen oder Suchbegriff eingeben.</div>';return;}
    host.innerHTML='<div class="status info">Kunden werden gesucht …</div>';
    try{
      const p={action:'searchMaintenanceCustomers',query,force:true};
      const rows=await window.api(typeof window.chefPayload==='function'?window.chefPayload(p):p);
      host.innerHTML=(rows||[]).map(x=>'<button type="button" class="dg28-customer-hit" data-id="'+esc(x.id)+'"><strong>'+esc(x.name||'')+'</strong><span>'+Number(x.objectCount||0)+' Objekt(e) · '+Number(x.deviceCount||0)+' Gerät(e)</span><small>'+esc(x.billingCity||'')+'</small></button>').join('')||'<div class="status warn">Kein Wartungskunde gefunden.</div>';
      host.querySelectorAll('.dg28-customer-hit').forEach(b=>b.addEventListener('click',async()=>{
        if(typeof window.d37MaintenanceTab==='function')window.d37MaintenanceTab('manage');
        if(typeof window.d37OpenCustomer==='function')await window.d37OpenCustomer(b.dataset.id);
      }));
    }catch(e){host.innerHTML='<div class="status error">'+esc(e&&e.message?e.message:e)+'</div>';}
  };
  q('dg28CustomerSearchBtn')?.addEventListener('click',run);
  q('dg28CustomerQuery')?.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();run();}});
}
function css(){
  if(q('dg28Css'))return;
  const s=document.createElement('style');s.id='dg28Css';
  s.textContent=''
   +'#d37MaintenanceNav button{background:#31589e!important;border-color:#31589e!important;color:#fff!important;font-weight:900!important}'
   +'#d37MaintenanceNav button:hover{background:#27467f!important;border-color:#27467f!important;color:#fff!important}'
   +'#d37MaintenanceNav button.active{background:#1f3f7d!important;border-color:#1f3f7d!important;color:#fff!important;box-shadow:0 0 0 2px rgba(49,88,158,.18)!important}'
   +'.dg28-next-due{display:block!important;margin-top:5px!important;font-size:14px!important;color:#31589e!important;font-weight:700!important}'
   +'.dg28-customer-search{margin-top:12px!important}'
   +'.dg28-customer-hit{display:grid!important;grid-template-columns:minmax(220px,1.5fr) minmax(180px,1fr) minmax(120px,.7fr)!important;gap:14px!important;width:100%!important;text-align:left!important;align-items:center!important;padding:12px 14px!important;margin-top:8px!important;border:1px solid #d7deea!important;border-radius:12px!important;background:#fff!important;color:#111827!important}'
   +'.dg28-customer-hit:hover{background:#eef4ff!important;border-color:#9cb4e7!important}'
   +'.dg28-customer-hit strong{color:#111827!important}.dg28-customer-hit span,.dg28-customer-hit small{color:#64748b!important}'
   +'@media(max-width:700px){.dg28-customer-hit{grid-template-columns:1fr!important}}';
  document.head.appendChild(s);
}
function enforce(){css();wrapAllCustomers();ensureCustomerSearch();if(q('d50MaintenanceAll')&&!q('d50MaintenanceAll')?.classList.contains('hidden'))decorateAllCustomers();}
function install(){
  enforce();
  const mo=new MutationObserver(()=>setTimeout(enforce,0));
  mo.observe(document.body,{subtree:true,childList:true,attributes:true,attributeFilter:['class']});
  document.documentElement.dataset.dgUi28=V;
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});else install();
})();


/* DG Zeiterfassung 10.0 - UI Hotfix 17 - stable open days tile */
(function(){
'use strict';
const TILE='[data-dg80-final="days"]';
async function openDaysStable(){
  const direct=window.DG80_UI12_openDays;
  if(typeof direct==='function'){
    await direct();
  }else{
    const open=window.dg80OfficeOpen;
    if(typeof open==='function')open('days',{force:true});
    const load=window.loadBossDayClosuresV48;
    if(typeof load==='function')await load();
  }
  const card=document.getElementById('dg80ActionCenter')||document.getElementById('dg48EmployeeClosures');
  if(card){
    card.classList.add('dg80-shell-active');
    card.classList.remove('hidden');
    card.style.display='block';
    setTimeout(function(){try{card.scrollIntoView({behavior:'smooth',block:'start'});}catch(_e){}},0);
  }
}
function onClick(e){
  const target=e.target&&e.target.closest?e.target.closest(TILE):null;
  if(!target)return;
  const boss=document.getElementById('bossView');
  if(!boss||boss.classList.contains('hidden'))return;
  e.preventDefault();
  e.stopPropagation();
  e.stopImmediatePropagation();
  Promise.resolve(openDaysStable()).catch(function(err){
    const msg=err&&err.message?err.message:String(err||'Unbekannter Fehler');
    alert('Offene Tagesabschlüsse konnten nicht geöffnet werden: '+msg);
  });
}
document.addEventListener('click',onClick,true);
window.DG10_openDaysStable=openDaysStable;
document.documentElement.dataset.dgUi17='10.0-ui17';
})();


/* DG Zeiterfassung 10.0 - final visible version guard */
(function(){
'use strict';
const TITLE='DG Zeiterfassung 10.0';
function applyVersion10(){
  if(document.title!==TITLE)document.title=TITLE;
  document.documentElement.dataset.dgVersion='10.0';
  document.querySelectorAll('.login-card .muted.small,#loginScreen .center.muted.small').forEach(function(x){
    if(/^Version\s+/i.test(String(x.textContent||'').trim())&&x.textContent!=='Version 10.0')x.textContent='Version 10.0';
  });
  document.querySelectorAll('.hero strong,#mainScreen .hero .head-row strong').forEach(function(x){
    if(/Zeiterfassung/i.test(String(x.textContent||''))&&x.textContent!=='Zeiterfassung - 10.0')x.textContent='Zeiterfassung - 10.0';
  });
}
function installGuard(){
  applyVersion10();
  const t=document.querySelector('title');
  if(t&&!t.dataset.dg10Guard){
    t.dataset.dg10Guard='1';
    new MutationObserver(applyVersion10).observe(t,{childList:true,characterData:true,subtree:true});
  }
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',installGuard,{once:true});else installGuard();
window.addEventListener('pageshow',applyVersion10);
setTimeout(applyVersion10,250);
setTimeout(applyVersion10,1400);
setTimeout(applyVersion10,3200);
})();
