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
  {key:'completed',label:'Abgeschlossene Aufträge',panel:'d3Completed',cls:'completed',counter:'d3Count-completed',loader:'d3Reports',args:['Abgeschlossen']},
  {key:'billed',label:'Abgerechnete Aufträge',panel:'d3Completed',cls:'billed',counter:null,loader:'d3Reports',args:['Abgerechnet']},
  {key:'running',label:'Laufende Aufträge',panel:'d3Running',cls:'running',counter:'d3Count-running',loader:'d3Reports',args:['Laufend']},
  {key:'offerCreate',label:'Angebote zu erstellen',parent:'d3Offers',child:'d3OfferCreate',cls:'offers',counter:'d3Count-offers',loader:'loadOffers',args:['Zu erstellen']},
  {key:'offerOpen',label:'Offene Angebote',parent:'d3Offers',child:'d3OfferOpen',cls:'offer-open',counter:null,loader:'loadOffers',args:['Offen']},
  {key:'offerArchive',label:'Angebotsarchiv',parent:'d3Offers',child:'d3OfferArchive',cls:'offer-archive',counter:null,loader:'loadOffers',args:['Archiv']},
  {key:'offerStats',label:'Angebotsstatistik',parent:'d3Offers',child:'d3Stats',cls:'offer-stats',counter:null,loader:'loadStats'},
  {key:'shopping',label:'Einkauf',special:'shopping',cls:'shopping',counter:'d3Count-shopping'},
  {key:'maintenance',label:'Wartungen',panel:'d36Maintenance',cls:'maintenance',counter:'d3Count-maintenance',loader:'d36LoadMaintenance'},
  {key:'days',label:'Mitarbeiter-Abschlüsse',parent:'d3Admin',child:'dg48EmployeeClosures',cls:'days',counter:'d3Count-days',loader:'loadBossDayClosuresV48'},
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
