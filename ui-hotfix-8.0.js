/* DG Zeiterfassung 8.0 - UI Hotfix 1
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
setTimeout(install,250);
setTimeout(install,1200);
})();


/* DG Zeiterfassung 8.0 - UI Hotfix 2
   Office tile shell, lossless collapse/drafts, standalone payroll, payroll-cycle counter and calendar refresh repair. */
(function(){
'use strict';
const V='8.0-ui2';
const API_URL_80='https://script.google.com/macros/s/AKfycby2L3SMgh2RoGWsNRUp6o11g4iyZ8bgkSIGaAZPnBXCkJTkDDGF9aydn9vVKMB7kXsO/exec';
const q=id=>document.getElementById(id);
const S=window.DG80_UI2=window.DG80_UI2||{active:'',dirty:new Set(),lastDirty:{},calendarPromise:null,counterPromise:null,dragKey:'',installed:false};

const CATALOG=[
  {key:'calendar',label:'Mitarbeiter Kalender',panel:'dg62PlannerCard',cls:'calendar',counter:null,loader:'dg62Load'},
  {key:'completed',label:'Rechnung zu erstellen',panel:'d3Completed',cls:'completed',counter:'d3Count-completed',loader:'d3Reports',args:['Abgeschlossen']},
  {key:'billed',label:'Abgerechnete Aufträge',panel:'d3Completed',cls:'billed',counter:null,loader:'d3Reports',args:['Abgerechnet']},
  {key:'running',label:'Laufende Aufträge',panel:'d3Running',cls:'running',counter:'d3Count-running',loader:'d3Reports',args:['Laufend']},
  {key:'offerCreate',label:'Erstellte Angebote',parent:'d3Offers',child:'d3OfferCreate',cls:'offers',counter:'d3Count-offers',loader:'loadOffers',args:['Zu erstellen']},
  {key:'offerOpen',label:'Erstellte Angebote',parent:'d3Offers',child:'d3OfferOpen',cls:'offer-open',counter:null,loader:'loadOffers',args:['Offen']},
  {key:'offerArchive',label:'Angebotsarchiv',parent:'d3Offers',child:'d3OfferArchive',cls:'offer-archive',counter:null,loader:'loadOffers',args:['Archiv']},
  {key:'offerStats',label:'Angebotsstatistik',parent:'d3Offers',child:'d3Stats',cls:'offer-stats',counter:null,loader:'loadStats'},
  {key:'shopping',label:'Einkaufsliste',special:'shopping',cls:'shopping',counter:'d3Count-shopping'},
  {key:'maintenance',label:'Wartungen',panel:'d36Maintenance',cls:'maintenance',counter:'d3Count-maintenance',loader:'d36LoadMaintenance'},
  {key:'days',label:'Offene Tagesabschlüsse',parent:'d3Admin',child:'dg48EmployeeClosures',cls:'days',counter:'d3Count-days',loader:'loadBossDayClosuresV48'},
  {key:'payroll',label:'Monatsabschluss & Lohnübergabe',panel:'d3PayrollStandalone',cls:'payroll',counter:'dg80TopPayroll',loader:'dg80PayrollInstall'},
  {key:'absence',label:'Urlaub / Abwesenheiten / Feiertage',parent:'d3Admin',child:'dg48AbsenceGroup',cls:'absence',counter:null,loader:'loadChefAdministration'},
  {key:'sickness',label:'Krank-Fristen',parent:'d3Admin',child:'dg48AbsenceGroup',cls:'sickness734',counter:'d3Count-sickness734',loader:'loadChefAdministration',after:'sickness'},
  {key:'employeeAdmin',label:'Mitarbeiterverwaltung',parent:'d3Admin',child:'d3EmployeeAdmin',cls:'employee-admin',counter:null,loader:'loadChefAdministration'},
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
    +'#employeeTimeBank small{display:block;margin-top:5px;font-size:13px;font-weight:700;line-height:1.35}'
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

function wrapperFor(c){
  if(!c)return null;
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
  if(/^(bossYear|bossMonth|empYear|empMonth|regieYear|regieMonth|dg48DayYear|dg48DayMonth|dg520Year|dg520Month|adminEmployeeSearch|adminEmployeeSelect|adminTimeBankEmployee|vacationEmployee|vacationYear|holidayYear)$/i.test(t.id||''))return false;
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
  const box=q('employeeTimeBank'),employee=localStorage.getItem('dg_employee')||'',pin=localStorage.getItem('dg_device_session')||sessionStorage.getItem('dg_employee_pin')||'';if(!box||!employee||!pin||!navigator.onLine)return;
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
  window.addEventListener('online',()=>setTimeout(()=>refreshPayrollCounter80(true),350));
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)refreshPayrollCounter80(false);});
  setInterval(()=>refreshPayrollCounter80(false),300000);
}

function ensureShell(){
  const r=root();if(!r)return false;
  if(!dashboard()&&fn('dg742EnsureOffice'))try{fn('dg742EnsureOffice')();}catch(_e){}
  if(!dashboard())return false;
  addCss();ensurePayrollStandalone();renameEmployeeClosures();r.classList.add('dg80-office-shell');buildDashboard();ensureToolbar();bindDirtyTracking();wrapApiForDirty();routerInstall();paintDirty();S.installed=true;return true;
}
function install(){
  ensureShell();installCalendarRepair();installCounter80();setTimeout(()=>refreshPayrollCounter80(true),450);setTimeout(()=>calendar80(false),700);document.documentElement.dataset.dgUiHotfix2=V;
}
window.dg80Ui2Install=install;
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});else install();
[250,900,2200,5000].forEach(ms=>setTimeout(()=>{ensureShell();},ms));
})();


/* DG Zeiterfassung 8.0 - UI Hotfix 3
   Buero kompakt: Hero ausblenden, Kachelgruppen, sortierbare Untermenues,
   feste Speichern-Kachel, reine Lohn-Countdownzahl und erweiterte Kachelzaehler. */
(function(){
'use strict';
const V='8.0-ui3';
const q=id=>document.getElementById(id);
const G=window.DG80_UI3=window.DG80_UI3||{
  activeGroup:'',
  rebuilding:false,
  dragKey:'',
  extraPromise:null,
  extraAt:0,
  counts:{},
  subCounts:{},
  saveBusy:false,
  observer:null,
  apiWrapped:false,
  dashWrapped:false,
  viewWrapped:false,
  officeWrapped:false
};
const EXTRA_TTL=300000;

const SECTIONS=[
  {key:'daily',label:'Tägliches Geschäft',tiles:['calendar','completed','running','offerCreate','offerOpen','shopping','maintenance','days','reminders','customers']},
  {key:'archive',label:'Archive & Auswertung',tiles:['billed','offerArchive','offerStats']},
  {key:'admin',label:'Personal & Verwaltung',tiles:['payroll','admin','health']}
];
const TILES={
  calendar:{label:'Mitarbeiter Kalender',countId:'dg80c-calendar',open:'calendar'},
  completed:{label:'Rechnung zu erstellen',countId:'d3Count-completed',open:'completed'},
  billed:{label:'Abgerechnete Aufträge',countId:'dg80c-billed',open:'billed'},
  running:{label:'Laufende Aufträge',countId:'d3Count-running',open:'running'},
  offerCreate:{label:'Erstellte Angebote',countId:'d3Count-offers',open:'offerCreate'},
  offerOpen:{label:'Erstellte Angebote',countId:'dg80c-offerOpen',open:'offerOpen'},
  offerArchive:{label:'Angebotsarchiv',countId:'dg80c-offerArchive',open:'offerArchive'},
  offerStats:{label:'Angebotsstatistik',countId:'dg80c-offerStats',open:'offerStats'},
  shopping:{label:'Einkaufsliste',countId:'d3Count-shopping',open:'shopping'},
  maintenance:{label:'Wartungen',countId:'d3Count-maintenance',open:'maintenance'},
  days:{label:'Offene Tagesabschlüsse',countId:'d3Count-days',open:'days'},
  reminders:{label:'Reminder',countId:'d3Count-reminders',open:'reminders'},
  customers:{label:'Offene Anfragen',countId:'d3Count-inquiries',group:'customers'},
  payroll:{label:'Lohnübergabe',countId:'dg80TopPayroll',open:'payroll'},
  admin:{label:'Mitarbeiterverwaltung',countId:'dg80c-admin',group:'admin'},
  health:{label:'Systemcheck',countId:'dg80c-health',open:'health'}
};
const GROUPS={
  customers:{
    label:'Offene Anfragen',
    items:[
      {key:'inquiries',label:'Offene Kundenanfragen',count:'regularInquiries'},
      {key:'aqon',label:'AQON PURE Anfragen',count:'aqonInquiries'},
      {key:'inquiryArchive',label:'Anfragenarchiv',count:'inquiryArchive'}
    ]
  },
  admin:{
    label:'Mitarbeiterverwaltung',
    items:[
      {key:'employeeAdmin',label:'Mitarbeiterverwaltung',count:'employees'},
      {key:'absence',label:'Urlaub / Abwesenheiten / Feiertage'},
      {key:'sickness',label:'Krank-Fristen',count:'sickness'}
    ]
  }
};

function empKey(){return String(localStorage.getItem('dg_employee')||'geraet').replace(/[^A-Za-z0-9_-]+/g,'_');}
function layoutKey(){return 'dg80_ui3_layout_'+empKey();}
function subKey(group){return 'dg80_ui3_sub_'+group+'_'+empKey();}
function extraKey(){return 'dg80_ui3_extra_'+empKey();}
function readJson(k,fallback){try{const x=JSON.parse(localStorage.getItem(k)||'null');return x===null?fallback:x;}catch(_e){return fallback;}}
function writeJson(k,v){try{localStorage.setItem(k,JSON.stringify(v));}catch(_e){}}
function esc(v){return String(v==null?'':v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function root(){return q('bossView');}
function dash(){return root()?.querySelector(':scope > .d3-dashboard');}
function ui2(){return window.DG80_UI2||null;}
function employeeCount(){try{return typeof employeeDirectory!=='undefined'&&Array.isArray(employeeDirectory)?employeeDirectory.length:0;}catch(_e){return 0;}}
function todayIso(){const d=new Date();return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');}
function isoDate(v){const s=String(v||'');return /^\d{4}-\d{2}-\d{2}$/.test(s)?s:'';}
function dayDiff(fromIso,toIso){
  const a=String(fromIso||'').split('-').map(Number),b=String(toIso||'').split('-').map(Number);
  if(a.length!==3||b.length!==3)return null;
  const x=Date.UTC(a[0],a[1]-1,a[2]),y=Date.UTC(b[0],b[1]-1,b[2]);
  return Math.round((y-x)/86400000);
}

function css(){
  if(q('dg80Ui3Css'))return;
  const s=document.createElement('style');s.id='dg80Ui3Css';
  s.textContent=''
    +'.dg80-office-mode .hero{display:none!important}'
    +'#bossView .dg80-ui3-dashboard{display:block!important;grid-template-columns:none!important}'
    +'#bossView .dg80-ui3-section{margin:0 0 20px}'
    +'#bossView .dg80-ui3-section-title{font-size:17px;font-weight:900;color:#31589e;margin:6px 0 10px;padding:0 3px}'
    +'#bossView .dg80-ui3-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:12px;align-items:stretch}'
    +'#bossView .dg80-ui3-dashboard>.d3-tile{display:none!important}'
    +'#bossView .dg80-ui3-dashboard .dg80-ui3-tile{background:#e8f7ea!important;color:#185c2c!important;border:1px solid #b9e4c1!important;min-height:116px!important;padding:14px 15px!important;display:flex!important;flex-direction:column!important;justify-content:space-between!important;align-items:flex-start!important;text-align:left!important;border-radius:22px!important;box-shadow:0 5px 16px rgba(15,23,42,.05)!important;cursor:grab!important}'
    +'#bossView .dg80-ui3-dashboard .dg80-ui3-tile:hover{background:#dcf3e0!important;border-color:#87cf94!important;transform:translateY(-1px)}'
    +'#bossView .dg80-ui3-dashboard .dg80-ui3-tile>span{font-size:17px!important;line-height:1.12!important;font-weight:900!important;color:#185c2c!important;max-width:100%!important;white-space:normal!important}'
    +'#bossView .dg80-ui3-dashboard .dg80-ui3-tile>strong{font-size:31px!important;line-height:1!important;font-weight:900!important;color:#185c2c!important}'
    +'#bossView .dg80-ui3-dashboard .dg80-ui3-tile.dragging{opacity:.42!important}'
    +'#bossView .dg80-ui3-dashboard .dg80-ui3-tile.dg80-group-active,#bossView .dg80-ui3-dashboard .dg80-ui3-tile.dg80-leaf-active{outline:3px solid #4d8b61!important;box-shadow:0 0 0 5px rgba(77,139,97,.16)!important}'
    +'#bossView .dg80-ui3-dashboard .dg80-save-tile{cursor:pointer!important}'
    +'#bossView .dg80-ui3-dashboard .dg80-save-tile.clean{background:#dcfce7!important;border-color:#86d29a!important;color:#14532d!important}'
    +'#bossView .dg80-ui3-dashboard .dg80-save-tile.dirty{background:#fee2e2!important;border-color:#f19a9a!important;color:#991b1b!important}'
    +'#bossView .dg80-ui3-dashboard .dg80-save-tile.dirty>span,#bossView .dg80-ui3-dashboard .dg80-save-tile.dirty>strong{color:#991b1b!important}'
    +'#bossView .dg80-ui3-dashboard .dg80-payroll-tile.dg80-payroll-urgent{background:#fee2e2!important;border-color:#ef9a9a!important;color:#991b1b!important}'
    +'#bossView .dg80-ui3-dashboard .dg80-payroll-tile.dg80-payroll-urgent>span,#bossView .dg80-ui3-dashboard .dg80-payroll-tile.dg80-payroll-urgent>strong{color:#991b1b!important}'
    +'#dg80SaveChanges,#dg80SaveHint{display:none!important}'
    +'#dg80GroupChooser{padding:18px!important}'
    +'.dg80-group-head{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:14px}'
    +'.dg80-group-head h2{margin:0;color:#31589e}'
    +'.dg80-group-close{width:46px!important;height:46px!important;padding:0!important;font-size:28px!important;line-height:1!important;font-weight:900!important}'
    +'.dg80-sub-list{display:grid;gap:12px}'
    +'.dg80-sub-button{width:100%;min-height:68px;border:1px solid #a9d9b4;border-radius:16px;background:#e8f7ea;color:#185c2c;padding:14px 16px;display:flex;align-items:center;justify-content:space-between;gap:14px;text-align:left;font:inherit;font-size:17px;font-weight:900;cursor:grab}'
    +'.dg80-sub-button:hover{background:#dcf3e0}'
    +'.dg80-sub-button strong{font-size:24px;color:#185c2c}'
    +'.dg80-sub-button.dragging{opacity:.42}'
    +'.dg80-sub-help{font-size:12px;color:#64748b;font-weight:700;margin:0 0 10px}'
    +'@media(max-width:759px){#bossView .dg80-ui3-grid{grid-template-columns:repeat(2,minmax(0,1fr));gap:9px}#bossView .dg80-ui3-dashboard .dg80-ui3-tile{min-height:108px!important;padding:12px!important;border-radius:17px!important}#bossView .dg80-ui3-dashboard .dg80-ui3-tile>span{font-size:14px!important}#bossView .dg80-ui3-dashboard .dg80-ui3-tile>strong{font-size:27px!important}.dg80-sub-button{font-size:15px;min-height:62px}}';
  document.head.appendChild(s);
}

function captureCounts(){
  Object.keys(TILES).forEach(k=>{
    const id=TILES[k].countId,e=id&&q(id);
    if(e&&String(e.textContent||'').trim())G.counts[k]=String(e.textContent).trim();
  });
}
function setCount(key,value){
  if(value===undefined||value===null)return;
  G.counts[key]=String(value);
  const id=TILES[key]&&TILES[key].countId,e=id&&q(id);
  if(e)e.textContent=String(value);
}
function setSubCount(key,value){
  if(value===undefined||value===null)return;
  G.subCounts[key]=String(value);
  document.querySelectorAll('[data-dg80-sub-count="'+key+'"]').forEach(e=>e.textContent=String(value));
}
function defaultLayout(){
  const out={};SECTIONS.forEach(s=>out[s.key]=s.tiles.slice());return out;
}
function mergedLayout(){
  const def=defaultLayout(),saved=readJson(layoutKey(),null),known=new Set(Object.keys(TILES).filter(k=>k!=='save')),used=new Set(),out={};
  SECTIONS.forEach(s=>{const src=saved&&Array.isArray(saved[s.key])?saved[s.key]:def[s.key];out[s.key]=src.filter(k=>known.has(k)&&!used.has(k));out[s.key].forEach(k=>used.add(k));});
  SECTIONS.forEach(s=>def[s.key].forEach(k=>{if(known.has(k)&&!used.has(k)){out[s.key].push(k);used.add(k);}}));
  return out;
}
function saveLayout(){
  const d=dash();if(!d)return;const out={};
  d.querySelectorAll('.dg80-ui3-section').forEach(sec=>{out[sec.dataset.section]=[...sec.querySelectorAll('.dg80-ui3-tile[data-ui3-key]')].map(x=>x.dataset.ui3Key).filter(k=>k!=='save');});
  writeJson(layoutKey(),out);
}
function tileHtml(key){
  const t=TILES[key],value=G.counts[key]!==undefined?G.counts[key]:'…',extra=key==='payroll'?' dg80-payroll-tile':'';
  return '<button type="button" draggable="true" class="d3-tile dg80-ui3-tile'+extra+'" data-ui3-key="'+esc(key)+'"><span>'+esc(t.label)+'</span><strong id="'+esc(t.countId)+'">'+esc(value)+'</strong></button>';
}
function saveTileHtml(){
  const n=ui2()?.dirty instanceof Set?ui2().dirty.size:0;
  return '<button type="button" class="d3-tile dg80-ui3-tile dg80-save-tile '+(n?'dirty':'clean')+'" data-ui3-key="save"><span>Änderungen Speichern</span><strong id="dg80c-save">'+n+'</strong></button>';
}

function installDrag(d){
  if(!d||d.dataset.dg80Ui3Drag==='1')return;d.dataset.dg80Ui3Drag='1';
  d.addEventListener('dragstart',e=>{
    const t=e.target.closest('.dg80-ui3-tile[data-ui3-key]');if(!t||t.dataset.ui3Key==='save')return;
    G.dragKey=t.dataset.ui3Key;t.classList.add('dragging');try{e.dataTransfer.effectAllowed='move';e.dataTransfer.setData('text/plain',G.dragKey);}catch(_e){}
  });
  d.addEventListener('dragover',e=>{
    if(!G.dragKey)return;
    const grid=e.target.closest('.dg80-ui3-grid');if(!grid)return;e.preventDefault();
    const src=d.querySelector('.dg80-ui3-tile[data-ui3-key="'+CSS.escape(G.dragKey)+'"]');if(!src)return;
    const target=e.target.closest('.dg80-ui3-tile[data-ui3-key]');
    if(target&&target!==src&&target.dataset.ui3Key!=='save'){
      const r=target.getBoundingClientRect(),before=e.clientY<r.top+r.height/2;
      grid.insertBefore(src,before?target:target.nextSibling);
    }else if(!target)grid.appendChild(src);
  });
  d.addEventListener('drop',e=>{if(!G.dragKey)return;e.preventDefault();saveLayout();});
  d.addEventListener('dragend',()=>{d.querySelectorAll('.dragging').forEach(x=>x.classList.remove('dragging'));G.dragKey='';saveLayout();});
  d.addEventListener('click',e=>{
    const t=e.target.closest('.dg80-ui3-tile[data-ui3-key]');if(!t||G.dragKey)return;
    e.preventDefault();e.stopPropagation();mainTileClick(t.dataset.ui3Key);
  });
}
function renderDashboard(){
  const d=dash();if(!d||G.rebuilding)return false;
  G.rebuilding=true;
  try{
    captureCounts();css();
    d.className='d3-dashboard dg80-office-dashboard dg80-ui3-dashboard';
    const layout=mergedLayout();
    let html='';
    SECTIONS.forEach((s,si)=>{
      html+='<section class="dg80-ui3-section" data-section="'+esc(s.key)+'"><div class="dg80-ui3-section-title">'+esc(s.label)+'</div><div class="dg80-ui3-grid">';
      if(si===0)html+=saveTileHtml();
      (layout[s.key]||[]).forEach(k=>{html+=tileHtml(k);});
      html+='</div></section>';
    });
    d.innerHTML=html;
    d.dataset.dg80Ui3='1';d.dataset.dg80Ui3Drag='';
    installDrag(d);
    applyCachedExtra();
    paintSave();
    paintPayroll();
    paintAdmin();
    paintHealth();
    return true;
  }finally{G.rebuilding=false;}
}

function clearHighlights(){
  dash()?.querySelectorAll('.dg80-group-active,.dg80-leaf-active').forEach(x=>x.classList.remove('dg80-group-active','dg80-leaf-active'));
}
function markMain(key,cls){
  clearHighlights();
  dash()?.querySelector('.dg80-ui3-tile[data-ui3-key="'+CSS.escape(key)+'"]')?.classList.add(cls||'dg80-leaf-active');
}
function leafGroup(key){
  if(GROUPS.customers.items.some(x=>x.key===key))return 'customers';
  if(GROUPS.admin.items.some(x=>x.key===key))return 'admin';
  return '';
}

let baseOfficeOpen=null,baseOfficeClose=null;
function ensureChooser(){
  const r=root();if(!r)return null;let c=q('dg80GroupChooser');
  if(!c){c=document.createElement('div');c.id='dg80GroupChooser';c.className='card';r.appendChild(c);}
  return c;
}
function orderedGroupItems(group){
  const g=GROUPS[group],saved=readJson(subKey(group),[]),by={};g.items.forEach(x=>by[x.key]=x);
  const out=[],used=new Set();(Array.isArray(saved)?saved:[]).forEach(k=>{if(by[k]&&!used.has(k)){out.push(by[k]);used.add(k);}});
  g.items.forEach(x=>{if(!used.has(x.key))out.push(x);});return out;
}
function renderGroup(group){
  const g=GROUPS[group],c=ensureChooser();if(!g||!c)return;
  const items=orderedGroupItems(group);
  c.innerHTML='<div class="dg80-group-head"><h2>'+esc(g.label)+'</h2><button type="button" class="btn secondary dg80-group-close" aria-label="Schließen">×</button></div><div class="dg80-sub-help">Unterpunkte können per Drag & Drop in die gewünschte Reihenfolge gebracht werden.</div><div class="dg80-sub-list">'+items.map(x=>'<button type="button" draggable="true" class="dg80-sub-button" data-dg80-sub="'+esc(x.key)+'"><span>'+esc(x.label)+'</span><strong data-dg80-sub-count="'+esc(x.count||'')+'">'+(x.count?esc(G.subCounts[x.count]!==undefined?G.subCounts[x.count]:'…'):'›')+'</strong></button>').join('')+'</div>';
  c.querySelector('.dg80-group-close').addEventListener('click',closeAll);
  const list=c.querySelector('.dg80-sub-list');let drag='';
  list.addEventListener('dragstart',e=>{const b=e.target.closest('[data-dg80-sub]');if(!b)return;drag=b.dataset.dg80Sub;b.classList.add('dragging');});
  list.addEventListener('dragover',e=>{if(!drag)return;e.preventDefault();const b=e.target.closest('[data-dg80-sub]'),src=list.querySelector('[data-dg80-sub="'+CSS.escape(drag)+'"]');if(!src)return;if(b&&b!==src){const r=b.getBoundingClientRect();list.insertBefore(src,e.clientY<r.top+r.height/2?b:b.nextSibling);}else if(!b)list.appendChild(src);});
  list.addEventListener('drop',e=>{if(!drag)return;e.preventDefault();writeJson(subKey(group),[...list.querySelectorAll('[data-dg80-sub]')].map(x=>x.dataset.dg80Sub));});
  list.addEventListener('dragend',()=>{list.querySelectorAll('.dragging').forEach(x=>x.classList.remove('dragging'));writeJson(subKey(group),[...list.querySelectorAll('[data-dg80-sub]')].map(x=>x.dataset.dg80Sub));drag='';});
  list.addEventListener('click',e=>{const b=e.target.closest('[data-dg80-sub]');if(!b||drag)return;e.preventDefault();openSub(group,b.dataset.dg80Sub);});
}
function showGroup(group){
  const c=ensureChooser();if(!c)return;
  const already=G.activeGroup===group&&(c.classList.contains('dg80-shell-active')||(ui2()&&ui2().active&&leafGroup(ui2().active)===group));
  if(already){closeAll();return;}
  if(baseOfficeClose)try{baseOfficeClose();}catch(_e){}
  G.activeGroup=group;renderGroup(group);
  root()?.querySelectorAll(':scope > .dg80-shell-active').forEach(x=>x.classList.remove('dg80-shell-active'));
  c.classList.add('dg80-shell-active');
  q('dg80OfficeToolbar')?.classList.remove('active');
  markMain(group,'dg80-group-active');
  setTimeout(()=>c.scrollIntoView({behavior:'smooth',block:'start'}),20);
}
function openSub(group,key){
  const c=q('dg80GroupChooser');if(c)c.classList.remove('dg80-shell-active');
  G.activeGroup=group;markMain(group,'dg80-group-active');
  if(baseOfficeOpen)baseOfficeOpen(key,{force:false});
  setTimeout(()=>markMain(group,'dg80-group-active'),20);
}
function closeAll(){
  if(baseOfficeClose)try{baseOfficeClose();}catch(_e){}
  q('dg80GroupChooser')?.classList.remove('dg80-shell-active');
  G.activeGroup='';clearHighlights();
}
function mainTileClick(key){
  if(key==='save'){saveAll();return;}
  const t=TILES[key];if(!t)return;
  if(t.group){showGroup(t.group);return;}
  G.activeGroup='';q('dg80GroupChooser')?.classList.remove('dg80-shell-active');clearHighlights();
  if(baseOfficeOpen)baseOfficeOpen(t.open,{force:false});
  setTimeout(()=>markMain(key,'dg80-leaf-active'),20);
}

function paintSave(){
  const s=ui2(),n=s&&s.dirty instanceof Set?s.dirty.size:0,t=dash()?.querySelector('.dg80-save-tile'),c=q('dg80c-save');
  if(c)c.textContent=String(n);
  if(t){t.classList.toggle('dirty',n>0);t.classList.toggle('clean',n===0);t.title=n?String(n)+' Bereich(e) mit ungespeicherten Änderungen':'Alle Änderungen gespeichert';}
}
async function waitDirtyGone(key,timeout){
  const start=Date.now();while(Date.now()-start<(timeout||8000)){if(!(ui2()?.dirty instanceof Set)||!ui2().dirty.has(key))return true;await new Promise(r=>setTimeout(r,120));}return false;
}
async function saveAll(){
  if(G.saveBusy)return;const s=ui2();if(!s||!(s.dirty instanceof Set)||!s.dirty.size){paintSave();return;}
  G.saveBusy=true;paintSave();
  try{
    let guard=0;
    while(s.dirty.size&&guard++<20){
      const key=[...s.dirty][0],group=leafGroup(key);
      if(group){G.activeGroup=group;q('dg80GroupChooser')?.classList.remove('dg80-shell-active');if(baseOfficeOpen)baseOfficeOpen(key,{force:true});setTimeout(()=>markMain(group,'dg80-group-active'),20);}
      else if(baseOfficeOpen)baseOfficeOpen(key,{force:true});
      await new Promise(r=>setTimeout(r,100));
      const b=q('dg80SaveChanges');if(!b)break;b.click();
      const ok=await waitDirtyGone(key,8500);paintSave();if(!ok)break;
    }
  }finally{G.saveBusy=false;paintSave();}
}

function paintAdmin(){
  const n=employeeCount();if(n>0){setCount('admin',n);setSubCount('employees',n);}
  const sick=q('d3Count-sickness734');if(sick&&String(sick.textContent||'').trim())setSubCount('sickness',String(sick.textContent).trim());
}
function paintHealth(){setCount('health',window.DG3&&DG3.backend?0:1);}
function paintPayroll(){
  const t=dash()?.querySelector('.dg80-payroll-tile'),v=Number(G.counts.payroll);
  if(!t||!Number.isFinite(v))return;t.classList.toggle('dg80-payroll-urgent',v<=3);
}
function applyExtra(x){
  if(!x)return;
  if(x.calendar!==undefined)setCount('calendar',x.calendar);
  if(x.billed!==undefined)setCount('billed',x.billed);
  if(x.offerOpen!==undefined)setCount('offerOpen',x.offerOpen);
  if(x.offerArchive!==undefined)setCount('offerArchive',x.offerArchive);
  if(x.offerStats!==undefined)setCount('offerStats',x.offerStats);
  if(x.inquiries!==undefined)setCount('customers',x.inquiries);
  if(x.regularInquiries!==undefined)setSubCount('regularInquiries',x.regularInquiries);
  if(x.aqonInquiries!==undefined)setSubCount('aqonInquiries',x.aqonInquiries);
  if(x.inquiryArchive!==undefined)setSubCount('inquiryArchive',x.inquiryArchive);
  if(x.payroll!==undefined)setCount('payroll',x.payroll);
  paintPayroll();paintAdmin();paintHealth();
}
function applyCachedExtra(){const c=readJson(extraKey(),null);if(c&&c.data)applyExtra(c.data);}

async function refreshExtra(force){
  applyCachedExtra();paintAdmin();paintHealth();
  if(!navigator.onLine)return;
  const cached=readJson(extraKey(),null),fresh=cached&&Date.now()-Number(cached.ts||0)<EXTRA_TTL;
  if(!force&&fresh)return cached.data;
  if(G.extraPromise)return G.extraPromise;
  G.extraPromise=(async()=>{
    try{
      const now=new Date(),y=now.getFullYear(),m=now.getMonth()+1;
      const calls=[
        window.api(chefPayload({action:'getOfferStatistics'})),
        window.api(chefPayload({action:'getRegieReports',status:'Abgerechnet',year:0,month:0})),
        window.api(chefPayload({action:'getPlannerWorkers'})),
        window.api(chefPayload({action:'getCustomerInquiries',status:'Offen'})),
        window.api(chefPayload({action:'getCustomerInquiries',status:'Archiviert'})),
        window.api(chefPayload({action:'getPayrollCycleState',year:y,month:m}))
      ];
      const r=await Promise.allSettled(calls),prev=cached&&cached.data?cached.data:{},out=Object.assign({},prev);
      if(r[0].status==='fulfilled'){const s=r[0].value||{};out.offerOpen=Number(s.open||0);out.offerStats=Number(s.total||0);out.offerArchive=Math.max(0,Number(s.total||0)-Number(s.open||0));}
      if(r[1].status==='fulfilled')out.billed=Array.isArray(r[1].value)?r[1].value.length:0;
      if(r[2].status==='fulfilled')out.calendar=(r[2].value||[]).filter(w=>w&&w.active&&String(w.calendarId||'').trim()).length;
      if(r[3].status==='fulfilled'){const rows=r[3].value||[],aq=rows.filter(x=>x&&x.source==='AQON PURE').length;out.inquiries=rows.length;out.aqonInquiries=aq;out.regularInquiries=Math.max(0,rows.length-aq);}
      if(r[4].status==='fulfilled')out.inquiryArchive=Array.isArray(r[4].value)?r[4].value.length:0;
      if(r[5].status==='fulfilled'){
        const p=r[5].value||{},st=p.state||{},done=st.status==='Uebergeben'&&!st.changedSinceApproval,due=isoDate(done?p.nextDueDate:p.dueDate),diff=due?dayDiff(todayIso(),due):null;
        out.payroll=diff===null?0:Math.max(0,diff);
      }
      G.extraAt=Date.now();writeJson(extraKey(),{ts:G.extraAt,data:out});applyExtra(out);return out;
    }catch(e){console.warn('DG 8.0 Kachelzähler',e);return cached&&cached.data;}
    finally{G.extraPromise=null;}
  })();
  return G.extraPromise;
}

function wrapDashboard(){
  if(G.dashWrapped||typeof window.d3Dashboard!=='function')return;G.dashWrapped=true;
  const base=window.d3Dashboard;
  const wrapped=async function(force){
    const r=await base.apply(this,arguments);
    if(r){
      if(r.completed!==undefined)setCount('completed',r.completed);
      if(r.running!==undefined)setCount('running',r.running);
      if(r.offers!==undefined)setCount('offerCreate',r.offers);
      if(r.days!==undefined)setCount('days',r.days);
      if(r.reminders!==undefined)setCount('reminders',r.reminders);
      if(r.inquiries!==undefined)setCount('customers',r.inquiries);
      if(r.maintenance!==undefined)setCount('maintenance',r.maintenance);
    }
    refreshExtra(Boolean(force));return r;
  };
  try{window.d3Dashboard=wrapped;if(typeof d3Dashboard!=='undefined')d3Dashboard=wrapped;}catch(_e){window.d3Dashboard=wrapped;}
}
function wrapApi(){
  if(G.apiWrapped||typeof window.api!=='function')return;G.apiWrapped=true;
  const base=window.api,mut=new Set(['markRegieObjectBilled','markRegieObjectsBilled','setRegieReportsOfferStatus','discardOfferPermanently','acceptOfferAsRunning','saveOfferCreatedWithReminder','declineOfferFromReminder','acceptOfferFromReminder','archiveCustomerInquiry','rejectCustomerInquiry','completeCustomerInquiry','deleteCustomerInquiry','syncCustomerInquiries','completePayrollCycle','forceCompletePayrollCycle','setPayrollMonthStatus','savePlannerWorker','movePlannerWorker','setPlannerWorkerActive']);
  const wrapped=async function(payload){const r=await base.apply(this,arguments);if(mut.has(String(payload&&payload.action||''))){G.extraAt=0;localStorage.removeItem(extraKey());setTimeout(()=>refreshExtra(true),180);}return r;};
  try{window.api=wrapped;if(typeof api!=='undefined')api=wrapped;}catch(_e){window.api=wrapped;}
}
function setOfficeMode(on){q('mainScreen')?.classList.toggle('dg80-office-mode',!!on);}
function wrapViews(){
  if(G.viewWrapped)return;G.viewWrapped=true;
  const b=window.showBoss,e=window.showEmployee;
  if(typeof b==='function'){const wb=function(){const r=b.apply(this,arguments);setTimeout(()=>{const on=!q('bossView')?.classList.contains('hidden');setOfficeMode(on);if(on){renderDashboard();refreshExtra(false);paintSave();}},0);return r;};try{window.showBoss=wb;if(typeof showBoss!=='undefined')showBoss=wb;}catch(_e){window.showBoss=wb;}}
  if(typeof e==='function'){const we=function(){const r=e.apply(this,arguments);setTimeout(()=>setOfficeMode(false),0);return r;};try{window.showEmployee=we;if(typeof showEmployee!=='undefined')showEmployee=we;}catch(_e){window.showEmployee=we;}}
}
function wrapOffice(){
  if(G.officeWrapped)return;G.officeWrapped=true;baseOfficeOpen=window.dg80OfficeOpen;baseOfficeClose=window.dg80OfficeClose;
  document.addEventListener('click',e=>{if(e.target&&e.target.closest&&e.target.closest('#dg80OfficeClose'))setTimeout(()=>{G.activeGroup='';clearHighlights();},20);},true);
}
function observe(){
  if(G.observer||!root())return;let timer=0;
  G.observer=new MutationObserver(()=>{clearTimeout(timer);timer=setTimeout(()=>{const d=dash();if(d&&(!d.querySelector('.dg80-ui3-section')||d.querySelector(':scope > .d3-tile')))renderDashboard();paintSave();paintAdmin();paintPayroll();},90);});
  G.observer.observe(root(),{childList:true,subtree:true});
}
function install(){
  css();wrapOffice();wrapApi();wrapDashboard();wrapViews();renderDashboard();observe();applyCachedExtra();paintSave();paintAdmin();paintHealth();
  const bossOpen=q('bossView')&&!q('bossView').classList.contains('hidden');setOfficeMode(!!bossOpen);
  if(bossOpen)refreshExtra(false);
  document.documentElement.dataset.dgUiHotfix3=V;
}
window.dg80Ui3Install=install;
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});else install();
[120,380,1080,2480,5280,6800].forEach(ms=>setTimeout(()=>{renderDashboard();paintSave();paintAdmin();},ms));
setInterval(()=>{paintSave();paintAdmin();paintHealth();},500);
})();


/* DG Zeiterfassung 8.0 - UI Hotfix 4
   Top-Aktionen breit, Kalenderzaehler korrigiert und robuste Menueoeffnung mit Struktur-Selbsttest. */
(function(){
'use strict';
const V='8.0-ui4';
const q=id=>document.getElementById(id);
const S=window.DG80_UI4=window.DG80_UI4||{active:'',calendarPromise:null,installed:false,observer:null,repairing:false};

const LEAF={
  calendar:{wrapper:'dg62PlannerCard',loader:'dg62Load',title:'Mitarbeiter Kalender',after:'calendar'},
  completed:{wrapper:'d3Completed',loader:'d3Reports',args:['Abgeschlossen'],title:'Rechnung zu erstellen'},
  billed:{wrapper:'d3Completed',loader:'d3Reports',args:['Abgerechnet'],title:'Abgerechnete Aufträge'},
  running:{wrapper:'d3Running',loader:'d3Reports',args:['Laufend'],title:'Laufende Aufträge'},
  offerCreate:{wrapper:'d3Offers',child:'d3OfferCreate',loader:'loadOffers',args:['Zu erstellen'],title:'Erstellte Angebote'},
  offerOpen:{wrapper:'d3Offers',child:'d3OfferOpen',loader:'loadOffers',args:['Offen'],title:'Erstellte Angebote'},
  offerArchive:{wrapper:'d3Offers',child:'d3OfferArchive',loader:'loadOffers',args:['Archiv'],title:'Angebotsarchiv'},
  offerStats:{wrapper:'d3Offers',child:'d3Stats',loader:'loadStats',title:'Angebotsstatistik'},
  shopping:{special:'shopping',title:'Einkaufsliste'},
  maintenance:{wrapper:'d36Maintenance',loader:'d36LoadMaintenance',title:'Wartungen'},
  days:{wrapper:'d3Admin',child:'dg48EmployeeClosures',loader:'loadBossDayClosuresV48',title:'Offene Tagesabschlüsse'},
  reminders:{wrapper:'d3Reminder',loader:'loadReminders',title:'Reminder'},
  payroll:{wrapper:'d3PayrollStandalone',loader:'dg80PayrollInstall',title:'Lohnübergabe',after:'payroll'},
  inquiries:{wrapper:'d3InquiriesGroup',child:'d3Inquiries',loader:'d3Inquiries',title:'Offene Kundenanfragen'},
  aqon:{wrapper:'d3InquiriesGroup',child:'d34AqonInquiries',loader:'d34AqonInquiries',title:'AQON PURE Anfragen'},
  inquiryArchive:{wrapper:'d3InquiriesGroup',child:'d3InquiryArchive',loader:'d3InquiryArchiveList',title:'Anfragenarchiv'},
  employeeAdmin:{wrapper:'d3Admin',child:'d3EmployeeAdmin',loader:'loadChefAdministration',title:'Mitarbeiterverwaltung'},
  absence:{wrapper:'d3Admin',child:'dg48AbsenceGroup',loader:'loadChefAdministration',title:'Urlaub / Abwesenheiten / Feiertage'},
  sickness:{wrapper:'d3Admin',child:'dg48AbsenceGroup',loader:'loadChefAdministration',title:'Krank-Fristen',after:'sickness'},
  health:{wrapper:'d3Health',loader:'d3Health',title:'Systemcheck'}
};
const GROUP_MAIN={inquiries:'customers',aqon:'customers',inquiryArchive:'customers',employeeAdmin:'admin',absence:'admin',sickness:'admin'};

function root(){return q('bossView');}
function dash(){return root()?.querySelector(':scope > .d3-dashboard');}
function ui2(){return window.DG80_UI2||null;}
function fn(name){return name&&typeof window[name]==='function'?window[name]:(name&&typeof globalThis[name]==='function'?globalThis[name]:null);}
function bodyOf(x){return x?.querySelector(':scope > .dg48-body')||x;}
function isDirty(key){const s=ui2();return !!(s&&s.dirty instanceof Set&&s.dirty.has(key));}
function setUi2Active(key){const s=ui2();if(s)s.active=key||'';}
function clearHighlights(){dash()?.querySelectorAll('.dg80-group-active,.dg80-leaf-active').forEach(x=>x.classList.remove('dg80-group-active','dg80-leaf-active'));}
function highlight(key){
  clearHighlights();
  const main=GROUP_MAIN[key]||key;
  dash()?.querySelector('.dg80-ui3-tile[data-ui3-key="'+CSS.escape(main)+'"]')?.classList.add(GROUP_MAIN[key]?'dg80-group-active':'dg80-leaf-active');
}
function ensureCss(){
  if(q('dg80Ui4Css'))return;
  const s=document.createElement('style');s.id='dg80Ui4Css';
  s.textContent=''
    +'#bossView .dg80-ui4-top-actions{display:grid;grid-template-columns:1fr;gap:11px;margin:0 0 18px}'
    +'#bossView .dg80-ui4-top-actions .dg80-ui3-tile{min-height:76px!important;width:100%!important;border-radius:18px!important;display:grid!important;grid-template-columns:1fr auto!important;align-items:center!important;padding:15px 20px!important;cursor:pointer!important}'
    +'#bossView .dg80-ui4-top-actions .dg80-ui3-tile>span{font-size:21px!important;line-height:1.1!important}'
    +'#bossView .dg80-ui4-top-actions .dg80-ui3-tile>strong{font-size:31px!important;margin:0!important}'
    +'#bossView .dg80-ui4-top-actions .dg80-save-tile{order:1}'
    +'#bossView .dg80-ui4-top-actions [data-ui3-key="calendar"]{order:2}'
    +'#bossView .dg80-ui3-section[data-section="daily"] .dg80-ui3-grid:empty{display:none!important}'
    +'@media(max-width:700px){#bossView .dg80-ui4-top-actions .dg80-ui3-tile{min-height:68px!important;padding:13px 15px!important}#bossView .dg80-ui4-top-actions .dg80-ui3-tile>span{font-size:18px!important}}';
  document.head.appendChild(s);
}

function arrangeTop(){
  const d=dash();if(!d)return false;
  let top=q('dg80Ui4TopActions');
  if(!top){top=document.createElement('div');top.id='dg80Ui4TopActions';top.className='dg80-ui4-top-actions';d.prepend(top);}
  const save=d.querySelector('.dg80-save-tile'),cal=d.querySelector('.dg80-ui3-tile[data-ui3-key="calendar"]');
  [save,cal].forEach(t=>{if(t){t.draggable=false;top.appendChild(t);}});
  return !!(save&&cal);
}
function toolbar(){
  let b=q('dg80OfficeToolbar');if(b)return b;
  const d=dash();if(!d)return null;
  b=document.createElement('div');b.id='dg80OfficeToolbar';b.className='dg80-office-toolbar';
  b.innerHTML='<div class="dg80-office-toolbar-head"><h2 id="dg80OfficeTitle">Büro</h2><div class="dg80-office-actions"><button id="dg80SaveChanges" type="button" class="btn success" style="display:none">Änderungen Speichern</button><button id="dg80OfficeClose" type="button" class="btn secondary" aria-label="Untermenü schließen" title="Schließen">×</button></div></div><div id="dg80SaveHint" style="display:none"></div>';
  d.insertAdjacentElement('afterend',b);return b;
}

function repairOffice(){
  if(S.repairing)return;S.repairing=true;
  try{const f=fn('dg742EnsureOffice');if(f)f();}catch(_e){}
  finally{S.repairing=false;}
}
function selectChild(w,childId){
  if(!w||!childId)return;
  w.querySelectorAll('.d3-panel').forEach(p=>p.classList.toggle('hidden',p.id!==childId));
  w.querySelectorAll('[data-panel]').forEach(b=>b.setAttribute('aria-selected',String(b.dataset.panel===childId)));
  const c=q(childId);if(c){c.classList.remove('hidden');bodyOf(c)?.classList.remove('hidden');}
}
function closeAll(){
  const r=root();if(!r)return;
  r.querySelectorAll(':scope > .dg80-shell-active').forEach(x=>x.classList.remove('dg80-shell-active'));
  q('dg80GroupChooser')?.classList.remove('dg80-shell-active');
  q('dg80OfficeToolbar')?.classList.remove('active');
  clearHighlights();S.active='';setUi2Active('');
  try{if(window.DG3)DG3.open='';}catch(_e){}
  const shop=q('dg70ShopOverlay');if(shop&&getComputedStyle(shop).display!=='none'){const c=fn('dg70ShoppingClose');if(c)try{c();}catch(_e){}}
}
function invokeLoader(def,key){
  if(!def||isDirty(key))return;
  const f=fn(def.loader);if(!f)return;
  try{Promise.resolve(f.apply(window,def.args||[])).catch(e=>console.warn('DG Menü laden',key,e));}catch(e){console.warn('DG Menü laden',key,e);}
}
function manualOpen(key,force){
  const def=LEAF[key];if(!def)return false;
  if(def.special==='shopping'){
    const ov=q('dg70ShopOverlay'),shown=ov&&getComputedStyle(ov).display!=='none';
    if((S.active===key||shown)&&!force){closeAll();return true;}
    closeAll();const f=fn('dg70ShoppingOpen');if(f){f();S.active=key;setUi2Active(key);highlight(key);return true;}return false;
  }
  if(S.active===key&&!force){closeAll();return true;}
  let w=q(def.wrapper);if(!w){repairOffice();w=q(def.wrapper);}
  if(!w)return false;
  const r=root(),bar=toolbar();if(!r||!bar)return false;
  const shop=q('dg70ShopOverlay');if(shop&&getComputedStyle(shop).display!=='none'){const c=fn('dg70ShoppingClose');if(c)try{c();}catch(_e){}}
  r.querySelectorAll(':scope > .dg80-shell-active').forEach(x=>x.classList.remove('dg80-shell-active'));
  q('dg80GroupChooser')?.classList.remove('dg80-shell-active');
  w.classList.add('dg80-shell-active');w.classList.remove('hidden');bodyOf(w)?.classList.remove('hidden');selectChild(w,def.child);
  bar.classList.add('active');const title=q('dg80OfficeTitle');if(title)title.textContent=def.title||key;
  if(w.parentElement===r&&w.previousElementSibling!==bar)try{bar.insertAdjacentElement('afterend',w);}catch(_e){}
  S.active=key;setUi2Active(key);try{if(window.DG3)DG3.open=def.child||def.wrapper;}catch(_e){}highlight(key);
  if(def.after==='calendar'){const det=w.querySelector('.dg62-main');if(det)det.open=true;const o=fn('dg62OpenPlanner');if(o)try{o();}catch(_e){}}
  if(def.after==='payroll'){const p=fn('dg80PayrollInstall');if(p)try{p();}catch(_e){}}
  invokeLoader(def,key);
  if(def.after==='sickness')setTimeout(()=>{const a=fn('ensureAbsenceUi734');if(a)try{a();}catch(_e){}q('dg734SicknessAlertList')?.scrollIntoView({block:'nearest'});},120);
  setTimeout(()=>bar.scrollIntoView({behavior:'smooth',block:'start'}),15);
  return true;
}

function installClicks(){
  const r=root();if(!r||r.dataset.dg80Ui4Clicks==='1')return;r.dataset.dg80Ui4Clicks='1';
  r.addEventListener('click',e=>{
    const x=e.target.closest('#dg80OfficeClose');if(x){e.preventDefault();e.stopImmediatePropagation();closeAll();return;}
    const sub=e.target.closest('.dg80-sub-button[data-dg80-sub]');
    if(sub){
      const key=sub.dataset.dg80Sub;if(LEAF[key]){e.preventDefault();e.stopImmediatePropagation();manualOpen(key,false);}return;
    }
    const t=e.target.closest('.dg80-ui3-tile[data-ui3-key]');
    if(!t)return;
    const key=t.dataset.ui3Key;
    if(key==='save'||key==='customers'||key==='admin')return; // UI3 behält Speichern und Gruppenauswahl.
    if(LEAF[key]){e.preventDefault();e.stopImmediatePropagation();manualOpen(key,false);}
  },true);
}

async function correctCalendarCount(force){
  const el=q('dg80c-calendar');if(!el||!navigator.onLine)return;
  if(S.calendarPromise&&!force)return S.calendarPromise;
  S.calendarPromise=(async()=>{
    try{
      const apiFn=window.api;if(typeof apiFn!=='function')return;
      const chef=typeof window.chefPayload==='function'?window.chefPayload:(typeof chefPayload==='function'?chefPayload:null);
      if(!chef)return;
      const [wr,er]=await Promise.allSettled([
        apiFn(chef({action:'getPlannerWorkers'})),
        apiFn({action:'getEmployees',force:Boolean(force)})
      ]);
      if(wr.status!=='fulfilled')return;
      const rows=Array.isArray(wr.value)?wr.value:[],emps=er.status==='fulfilled'&&Array.isArray(er.value)?new Set(er.value.map(x=>String(x||'').trim())):null;
      let valid=rows.filter(x=>x&&x.active&&String(x.calendarId||'').trim());
      if(emps&&emps.size){
        const matched=valid.filter(x=>emps.has(String(x.employeeName||'').trim()));
        if(matched.length)valid=matched;
      }
      const ids=new Set(valid.map(x=>String(x.calendarId||'').trim()).filter(Boolean));
      el.textContent=String(ids.size);
      try{if(window.DG80_UI3)window.DG80_UI3.counts.calendar=String(ids.size);}catch(_e){}
      return ids.size;
    }catch(e){console.warn('DG Kalenderzähler',e);}
    finally{S.calendarPromise=null;}
  })();
  return S.calendarPromise;
}

function selfTest(){
  const out={};
  Object.keys(LEAF).forEach(k=>{
    const d=LEAF[k],special=d.special==='shopping';
    out[k]={
      wrapper:special?true:!!q(d.wrapper),
      child:!d.child||!!q(d.child),
      loader:special?!!fn('dg70ShoppingOpen'):(!d.loader||!!fn(d.loader))
    };
    out[k].ok=out[k].wrapper&&out[k].child&&out[k].loader;
  });
  const bad=Object.entries(out).filter(([,v])=>!v.ok);
  if(bad.length){repairOffice();setTimeout(()=>console.warn('DG Menü-Selbsttest: fehlende Komponenten',bad),50);}
  else console.info('DG Menü-Selbsttest: alle Menüs strukturell verfügbar.',out);
  return out;
}
window.dg80Ui4SelfTest=selfTest;
window.dg80Ui4Open=manualOpen;
window.dg80Ui4Close=closeAll;

function observe(){
  if(S.observer||!root())return;
  let timer=0;S.observer=new MutationObserver(()=>{clearTimeout(timer);timer=setTimeout(()=>{arrangeTop();installClicks();},80);});
  S.observer.observe(root(),{childList:true,subtree:true});
}
function install(){
  if(!root()||!dash())return false;
  ensureCss();arrangeTop();installClicks();observe();setTimeout(()=>correctCalendarCount(false),120);setTimeout(selfTest,300);
  S.installed=true;document.documentElement.dataset.dgUiHotfix4=V;return true;
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});else install();
[250,750,1600,3200,5200].forEach(ms=>setTimeout(()=>{install();arrangeTop();},ms));
document.addEventListener('visibilitychange',()=>{if(!document.hidden)setTimeout(()=>correctCalendarCount(false),150);});
window.addEventListener('online',()=>setTimeout(()=>correctCalendarCount(true),250));
})();


/* DG Zeiterfassung 8.0 - UI Hotfix 5
   Bezeichnungen finalisiert, Sammelkacheln robust geöffnet, Einkaufslisten-Zähler
   lokal synchronisiert und Hauptkacheln mittig ausgerichtet. */
(function(){
'use strict';
const V='8.0-ui5';
const q=id=>document.getElementById(id);
const S=window.DG80_UI5=window.DG80_UI5||{group:'',observer:null,lastShop:-1,installed:false};
const SHOP_KEY='dg71_shopping_lists_v1';

const LABELS={
  completed:'Rechnung zu erstellen',
  offerCreate:'Offene Angebote',
  offerOpen:'Erstellte Angebote',
  shopping:'Einkaufsliste',
  days:'Offene Tagesabschlüsse',
  customers:'Offene Anfragen',
  admin:'Mitarbeiterverwaltung'
};
const TITLES={
  completed:'Rechnung zu erstellen',
  offerCreate:'Offene Angebote',
  offerOpen:'Erstellte Angebote',
  shopping:'Einkaufsliste',
  days:'Offene Tagesabschlüsse',
  inquiries:'Offene Anfragen',
  aqon:'AQON PURE Anfragen',
  inquiryArchive:'Anfragenarchiv',
  employeeAdmin:'Mitarbeiterverwaltung',
  absence:'Urlaub / Abwesenheiten / Feiertage',
  sickness:'Krank-Fristen'
};
const GROUPS={
  customers:{
    title:'Offene Anfragen',
    items:[
      {key:'inquiries',label:'Offene Kundenanfragen'},
      {key:'aqon',label:'AQON PURE Anfragen'},
      {key:'inquiryArchive',label:'Anfragenarchiv'}
    ]
  },
  admin:{
    title:'Mitarbeiterverwaltung',
    items:[
      {key:'employeeAdmin',label:'Mitarbeiterverwaltung'},
      {key:'days',label:'Übertragene Tagesabschlüsse / Prüfung'},
      {key:'absence',label:'Urlaub / Abwesenheiten / Feiertage'},
      {key:'sickness',label:'Krank-Fristen'}
    ]
  }
};

function boss(){return q('bossView');}
function dash(){return boss()?.querySelector(':scope > .d3-dashboard');}
function empKey(){return String(localStorage.getItem('dg_employee')||'geraet').replace(/[^A-Za-z0-9_-]+/g,'_');}
function orderKey(group){return 'dg80_ui3_sub_'+group+'_'+empKey();}
function readJson(k,fallback){try{const x=JSON.parse(localStorage.getItem(k)||'null');return x===null?fallback:x;}catch(_e){return fallback;}}
function writeJson(k,v){try{localStorage.setItem(k,JSON.stringify(v));}catch(_e){}}
function esc(v){return String(v==null?'':v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}

function css(){
  if(q('dg80Ui5Css'))return;
  const s=document.createElement('style');s.id='dg80Ui5Css';
  s.textContent=''
    +'#bossView .dg80-ui3-dashboard .dg80-ui3-tile{align-items:center!important;text-align:center!important}'
    +'#bossView .dg80-ui3-dashboard .dg80-ui3-tile>span,#bossView .dg80-ui3-dashboard .dg80-ui3-tile>strong{width:100%!important;text-align:center!important;align-self:center!important}'
    +'#bossView .dg80-ui4-top-actions .dg80-ui3-tile{display:flex!important;flex-direction:column!important;align-items:center!important;justify-content:center!important;text-align:center!important;gap:8px!important}'
    +'#bossView .dg80-ui4-top-actions .dg80-ui3-tile>span,#bossView .dg80-ui4-top-actions .dg80-ui3-tile>strong{width:100%!important;text-align:center!important}'
    +'#bossView .dg80-ui3-dashboard .dg80-ui3-tile[data-ui3-key="admin"],#bossView .dg80-ui3-dashboard .dg80-ui3-tile[data-ui3-key="customers"]{cursor:pointer!important}'
    +'#dg80GroupChooser .dg80-sub-button{background:#e8f7ea!important;color:#185c2c!important;border-color:#a9d9b4!important}'
    +'#dg80GroupChooser .dg80-sub-button span{font-weight:900!important}'
    +'#d3Completed .dg80-invoice-button{background:#3f6b3e!important;color:#fff!important;border-color:#3f6b3e!important}';
  document.head.appendChild(s);
}

function setButtonLabelKeepCount(button,label){
  if(!button)return;
  const count=button.querySelector('.dg60-count');
  if(count){
    [...button.childNodes].forEach(n=>{if(n.nodeType===3)n.remove();});
    button.insertBefore(document.createTextNode(label+' '),count);
  }else{
    button.textContent=label;
  }
}

function shoppingCount(){
  try{const rows=JSON.parse(localStorage.getItem(SHOP_KEY)||'[]');return Array.isArray(rows)?rows.length:0;}catch(_e){return 0;}
}
function syncShoppingCount(){
  const n=shoppingCount();S.lastShop=n;
  const e=q('d3Count-shopping');if(e)e.textContent=String(n);
  try{if(window.DG80_UI3&&window.DG80_UI3.counts)window.DG80_UI3.counts.shopping=String(n);}catch(_e){}
}

function relabel(){
  css();
  const d=dash();
  if(d){
    Object.entries(LABELS).forEach(([key,label])=>{
      const t=d.querySelector('.dg80-ui3-tile[data-ui3-key="'+CSS.escape(key)+'"]');
      const s=t&&t.querySelector(':scope > span');if(s&&s.textContent!==label)s.textContent=label;
    });
  }

  const completed=q('d3Completed');
  if(completed){
    const h=completed.querySelector(':scope > .dg48-head h2,:scope > h2');
    if(h)h.textContent='Rechnung zu erstellen';
    [...completed.querySelectorAll('button')].forEach(b=>{
      if(/Offene Regieberichte|Rechnungen zu erstellen/i.test((b.textContent||'').trim())){
        b.textContent='🟢 Rechnungen zu erstellen';b.classList.add('dg80-invoice-button');
      }
    });
  }

  const createBtn=document.querySelector('#d3Offers .d3-menu [data-panel="d3OfferCreate"]');
  const openBtn=document.querySelector('#d3Offers .d3-menu [data-panel="d3OfferOpen"]');
  setButtonLabelKeepCount(createBtn,'Offene Angebote');
  setButtonLabelKeepCount(openBtn,'Erstellte Angebote');
  const hCreate=q('d3OfferCreate')?.querySelector('h3');if(hCreate)hCreate.textContent='Offene Angebote';
  const hOpen=q('d3OfferOpen')?.querySelector('h3');if(hOpen)hOpen.textContent='Erstellte Angebote';

  const dayHead=q('dg48EmployeeClosures')?.querySelector(':scope > .dg48-head h2,:scope > h2');
  if(dayHead)dayHead.textContent='Offene Tagesabschlüsse';

  const shopHead=q('dg70ShopWindow')?.querySelector('.dg70-shop-head h2');
  if(shopHead&&shopHead.textContent.trim()==='Einkauf')shopHead.textContent='Einkaufsliste';
  const shopDialog=q('dg70ShopWindow');if(shopDialog)shopDialog.setAttribute('aria-label','Einkaufsliste');

  const active=String(window.DG80_UI4?.active||window.DG80_UI2?.active||'');
  const title=q('dg80OfficeTitle');
  if(title&&TITLES[active])title.textContent=TITLES[active];

  syncShoppingCount();
}

function orderedItems(group){
  const g=GROUPS[group],saved=readJson(orderKey(group),[]),by={},out=[],used=new Set();
  g.items.forEach(x=>by[x.key]=x);
  (Array.isArray(saved)?saved:[]).forEach(k=>{if(by[k]&&!used.has(k)){out.push(by[k]);used.add(k);}});
  g.items.forEach(x=>{if(!used.has(x.key))out.push(x);});
  return out;
}
function closeGroup(){
  q('dg80GroupChooser')?.classList.remove('dg80-shell-active');
  dash()?.querySelectorAll('.dg80-group-active').forEach(x=>x.classList.remove('dg80-group-active'));
  S.group='';
}
function renderGroup(group){
  const g=GROUPS[group],r=boss();if(!g||!r)return;
  const wasOpen=S.group===group&&q('dg80GroupChooser')?.classList.contains('dg80-shell-active');
  if(wasOpen){closeGroup();return;}

  if(typeof window.dg80Ui4Close==='function')try{window.dg80Ui4Close();}catch(_e){}
  let box=q('dg80GroupChooser');
  if(!box){box=document.createElement('div');box.id='dg80GroupChooser';box.className='card';r.appendChild(box);}
  const items=orderedItems(group);
  box.innerHTML='<div class="dg80-group-head"><h2>'+esc(g.title)+'</h2><button type="button" class="btn secondary dg80-group-close" aria-label="Schließen">×</button></div>'+
    '<div class="dg80-sub-help">Unterpunkte können per Drag & Drop frei angeordnet werden.</div>'+
    '<div class="dg80-sub-list">'+items.map(x=>'<button type="button" draggable="true" class="dg80-sub-button" data-dg80-sub="'+esc(x.key)+'"><span>'+esc(x.label)+'</span><strong>›</strong></button>').join('')+'</div>';

  box.classList.add('dg80-shell-active');
  q('dg80OfficeToolbar')?.classList.remove('active');
  dash()?.querySelectorAll('.dg80-group-active,.dg80-leaf-active').forEach(x=>x.classList.remove('dg80-group-active','dg80-leaf-active'));
  dash()?.querySelector('.dg80-ui3-tile[data-ui3-key="'+CSS.escape(group)+'"]')?.classList.add('dg80-group-active');
  S.group=group;
  try{if(window.DG80_UI3)window.DG80_UI3.activeGroup=group;}catch(_e){}

  box.querySelector('.dg80-group-close')?.addEventListener('click',e=>{e.preventDefault();e.stopPropagation();closeGroup();});

  const list=box.querySelector('.dg80-sub-list');let drag='';
  list.addEventListener('dragstart',e=>{const b=e.target.closest('[data-dg80-sub]');if(!b)return;drag=b.dataset.dg80Sub;b.classList.add('dragging');});
  list.addEventListener('dragover',e=>{if(!drag)return;e.preventDefault();const b=e.target.closest('[data-dg80-sub]'),src=list.querySelector('[data-dg80-sub="'+CSS.escape(drag)+'"]');if(!src)return;if(b&&b!==src){const rc=b.getBoundingClientRect();list.insertBefore(src,e.clientY<rc.top+rc.height/2?b:b.nextSibling);}else if(!b)list.appendChild(src);});
  list.addEventListener('drop',e=>{if(!drag)return;e.preventDefault();writeJson(orderKey(group),[...list.querySelectorAll('[data-dg80-sub]')].map(x=>x.dataset.dg80Sub));});
  list.addEventListener('dragend',()=>{list.querySelectorAll('.dragging').forEach(x=>x.classList.remove('dragging'));writeJson(orderKey(group),[...list.querySelectorAll('[data-dg80-sub]')].map(x=>x.dataset.dg80Sub));drag='';});

  setTimeout(()=>box.scrollIntoView({behavior:'smooth',block:'start'}),20);
}

function installGroupClicks(){
  const r=boss();if(!r||r.dataset.dg80Ui5Groups==='1')return;r.dataset.dg80Ui5Groups='1';
  r.addEventListener('click',e=>{
    const tile=e.target.closest('.dg80-ui3-tile[data-ui3-key]');
    if(!tile)return;
    const key=tile.dataset.ui3Key;
    if(key!=='customers'&&key!=='admin')return;
    e.preventDefault();e.stopImmediatePropagation();renderGroup(key);
  },true);
}

function observe(){
  if(S.observer||!boss())return;
  let timer=0;
  S.observer=new MutationObserver(()=>{clearTimeout(timer);timer=setTimeout(relabel,45);});
  S.observer.observe(boss(),{childList:true,subtree:true,characterData:true});
}

function selfTest(){
  const result={
    completed:!!q('d3Completed'),
    offers:!!q('d3Offers')&&!!q('d3OfferCreate')&&!!q('d3OfferOpen'),
    shopping:typeof window.dg70ShoppingOpen==='function',
    days:!!q('dg48EmployeeClosures'),
    inquiries:!!q('d3InquiriesGroup')&&!!q('d3Inquiries')&&!!q('d34AqonInquiries')&&!!q('d3InquiryArchive'),
    admin:!!q('d3Admin')&&!!q('d3EmployeeAdmin')&&!!q('dg48AbsenceGroup'),
    ui4:typeof window.dg80Ui4Open==='function'
  };
  const bad=Object.entries(result).filter(([,ok])=>!ok).map(([k])=>k);
  if(bad.length)console.warn('DG UI5 Selbsttest: fehlend',bad);else console.info('DG UI5 Selbsttest: alle betroffenen Bereiche vorhanden.',result);
  return result;
}
window.dg80Ui5SelfTest=selfTest;

function install(){
  css();relabel();installGroupClicks();observe();syncShoppingCount();
  S.installed=true;document.documentElement.dataset.dgUiHotfix5=V;
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});else install();
[120,350,900,1800,3600,6000].forEach(ms=>setTimeout(()=>{install();relabel();},ms));
window.addEventListener('storage',e=>{if(e.key===SHOP_KEY)syncShoppingCount();});
setInterval(()=>{if(shoppingCount()!==S.lastShop)syncShoppingCount();},1200);
setTimeout(selfTest,2200);
})();


/* DG Zeiterfassung 8.0 - UI Hotfix 6
   Top-Aktionen dauerhaft sichtbar + Tagesabschluss-Prüfung wieder in Mitarbeiterverwaltung. */
(function(){
'use strict';
const V='8.0-ui6';
const q=id=>document.getElementById(id);
const S=window.DG80_UI6=window.DG80_UI6||{observer:null,timer:null,installed:false};

function boss(){return q('bossView');}
function dash(){return boss()?.querySelector(':scope > .d3-dashboard');}

function css(){
  if(q('dg80Ui6Css'))return;
  const s=document.createElement('style');s.id='dg80Ui6Css';
  s.textContent=''
    +'#bossView #dg80Ui4TopActions{display:grid!important;grid-template-columns:1fr!important;gap:12px!important;margin:0 0 18px!important;width:100%!important}'
    +'#bossView #dg80Ui4TopActions .dg80-ui3-tile{display:flex!important;flex-direction:column!important;align-items:center!important;justify-content:center!important;width:100%!important;min-height:82px!important;text-align:center!important}'
    +'#bossView #dg80Ui4TopActions .dg80-ui3-tile>span,#bossView #dg80Ui4TopActions .dg80-ui3-tile>strong{width:100%!important;text-align:center!important}'
    +'#bossView .dg80-ui3-section[data-section="daily"] .dg80-ui3-grid:empty{display:none!important}';
  document.head.appendChild(s);
}

function ensureTopActions(){
  const d=dash();if(!d)return false;
  let top=q('dg80Ui4TopActions');
  if(!top){
    top=document.createElement('div');
    top.id='dg80Ui4TopActions';
    top.className='dg80-ui4-top-actions';
    d.prepend(top);
  }else if(top.parentElement!==d){
    d.prepend(top);
  }
  const save=d.querySelector('.dg80-save-tile');
  const cal=d.querySelector('.dg80-ui3-tile[data-ui3-key="calendar"]');
  if(save){
    save.draggable=false;
    if(save.parentElement!==top)top.appendChild(save);
  }
  if(cal){
    cal.draggable=false;
    if(cal.parentElement!==top)top.appendChild(cal);
  }
  return !!(save&&cal);
}

function ensureAdminDayReviewButton(){
  const box=q('dg80GroupChooser');
  const title=box?.querySelector('.dg80-group-head h2');
  if(!box||!title||title.textContent.trim()!=='Mitarbeiterverwaltung')return false;
  const list=box.querySelector('.dg80-sub-list');if(!list)return false;
  let btn=list.querySelector('[data-dg80-sub="days"]');
  if(!btn){
    btn=document.createElement('button');
    btn.type='button';btn.draggable=true;btn.className='dg80-sub-button';btn.dataset.dg80Sub='days';
    btn.innerHTML='<span>Übertragene Tagesabschlüsse / Prüfung</span><strong>›</strong>';
    const first=list.querySelector('[data-dg80-sub="employeeAdmin"]');
    if(first)first.insertAdjacentElement('afterend',btn);else list.prepend(btn);
  }else{
    const s=btn.querySelector('span');if(s)s.textContent='Übertragene Tagesabschlüsse / Prüfung';
  }
  return true;
}

function repair(){
  css();
  ensureTopActions();
  ensureAdminDayReviewButton();
}
function schedule(){
  clearTimeout(S.timer);S.timer=setTimeout(repair,35);
}
function observe(){
  if(S.observer||!boss())return;
  S.observer=new MutationObserver(schedule);
  S.observer.observe(boss(),{childList:true,subtree:true});
}
function selfTest(){
  const result={
    topSave:!!q('dg80Ui4TopActions')?.querySelector('.dg80-save-tile'),
    topCalendar:!!q('dg80Ui4TopActions')?.querySelector('[data-ui3-key="calendar"]'),
    dayView:!!q('dg48EmployeeClosures'),
    dayLoader:typeof window.loadBossDayClosuresV48==='function',
    reviewCss:!!q('dg522Styles')||document.documentElement.innerHTML.includes('dg522')
  };
  const bad=Object.entries(result).filter(([,ok])=>!ok).map(([k])=>k);
  if(bad.length)console.warn('DG UI6 Selbsttest: fehlend',bad);else console.info('DG UI6 Selbsttest erfolgreich',result);
  return result;
}
window.dg80Ui6SelfTest=selfTest;

function install(){
  if(!boss()||!dash())return false;
  repair();observe();
  S.installed=true;document.documentElement.dataset.dgUiHotfix6=V;
  return true;
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});else install();

// UI3 rendert das Dashboard in den ersten Sekunden mehrfach neu.
// Darum nach jedem möglichen Rebuild nochmals dauerhaft einhängen.
[80,180,350,700,1200,2200,3600,5200,7000,9000,12000].forEach(ms=>setTimeout(repair,ms));
setInterval(repair,4000);
setTimeout(selfTest,2500);
})();
