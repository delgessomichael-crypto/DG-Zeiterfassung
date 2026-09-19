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
  addCss();ensurePayrollStandalone();renameEmployeeClosures();r.classList.add('dg80-office-shell');ensureToolbar();bindDirtyTracking();wrapApiForDirty();routerInstall();paintDirty();S.installed=true;return true;
}
function install(){
  ensureShell();installCalendarRepair();installCounter80();setTimeout(()=>refreshPayrollCounter80(true),450);setTimeout(()=>calendar80(false),700);document.documentElement.dataset.dgUiHotfix2=V;
}
window.dg80Ui2Install=install;
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});else install();
let dg80Ui2Retry=0;(function retryShell(){if(S.installed)return;if(ensureShell())return;if(++dg80Ui2Retry<20)setTimeout(retryShell,100);})();
})();



/* DG Zeiterfassung 8.0 - UI Hotfix 7 FINAL
   Konsolidierte Bürooberfläche ohne wiederholte Dashboard-Neuaufbauten.
   Ein Mount, schlanke Top-Aktionen, stabile Sammelmenüs und Tagesabschluss-Prüfung. */
(function(){
'use strict';
const V='8.0-ui7-final';
const q=id=>document.getElementById(id);
const S=window.DG80_FINAL=window.DG80_FINAL||{
  mounted:false,active:'',group:'',drag:'',saveBusy:false,
  extraPromise:null,extraAt:0,calendarCountPromise:null,
  reviewRows:[],reviewIssues:[],reviewBusy:false,
  wrapped:false
};
const EXTRA_TTL=300000;
const SHOP_KEY='dg71_shopping_lists_v1';

const SECTIONS=[
  {key:'daily',label:'Tägliches Geschäft',tiles:['completed','running','offerCreate','offerOpen','shopping','maintenance','days','reminders','customers']},
  {key:'archive',label:'Archive & Auswertung',tiles:['billed','offerArchive','offerStats']},
  {key:'admin',label:'Personal & Verwaltung',tiles:['payroll','admin','health']}
];
const TILES={
  completed:{label:'Rechnung zu erstellen',count:'d3Count-completed',legacy:'completed',leaf:'completed'},
  running:{label:'Laufende Aufträge',count:'d3Count-running',legacy:'running',leaf:'running'},
  offerCreate:{label:'Offene Angebote',count:'d3Count-offers',legacy:'offers',leaf:'offerCreate'},
  offerOpen:{label:'Erstellte Angebote',count:'dg80c-offerOpen',legacy:'offer-open',leaf:'offerOpen'},
  shopping:{label:'Einkaufsliste',count:'d3Count-shopping',legacy:'shopping',leaf:'shopping'},
  maintenance:{label:'Wartungen',count:'d3Count-maintenance',legacy:'maintenance',leaf:'maintenance'},
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
      {key:'inquiryArchive',label:'Anfragenarchiv',count:'inquiryArchive'}
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
const LEAF={
  calendar:{title:'Mitarbeiter Kalender'},
  completed:{title:'Rechnung zu erstellen'},
  billed:{title:'Abgerechnete Aufträge'},
  running:{title:'Laufende Aufträge'},
  offerCreate:{title:'Offene Angebote'},
  offerOpen:{title:'Erstellte Angebote'},
  offerArchive:{title:'Angebotsarchiv'},
  offerStats:{title:'Angebotsstatistik'},
  shopping:{title:'Einkaufsliste'},
  maintenance:{title:'Wartungen'},
  days:{title:'Offene Tagesabschlüsse'},
  reminders:{title:'Reminder'},
  payroll:{title:'Lohnübergabe'},
  inquiries:{title:'Offene Kundenanfragen'},
  aqon:{title:'AQON PURE Anfragen'},
  inquiryArchive:{title:'Anfragenarchiv'},
  employeeAdmin:{title:'Mitarbeiterverwaltung'},
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
function extraKey(){return 'dg80_final_extra_'+empKey();}
function readJson(k,f){try{const v=JSON.parse(localStorage.getItem(k)||'null');return v===null?f:v;}catch(_e){return f;}}
function writeJson(k,v){try{localStorage.setItem(k,JSON.stringify(v));}catch(_e){}}
function visibleBoss(){const r=root();return !!(r&&!r.classList.contains('hidden'));}
function shopCount(){try{const a=JSON.parse(localStorage.getItem(SHOP_KEY)||'[]');return Array.isArray(a)?a.length:0;}catch(_e){return 0;}}

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
    +'@media(max-width:759px){#bossView .dg80-final-grid{grid-template-columns:repeat(2,minmax(0,1fr));gap:9px}#bossView .dg80-final-tile{min-height:108px;border-radius:17px;padding:12px}#bossView .dg80-final-tile span{font-size:14px}#bossView .dg80-final-tile strong{font-size:27px}#bossView .dg80-final-top-btn{min-height:52px;padding:8px 12px}#bossView .dg80-final-top-btn span{font-size:16px}#bossView .dg80-final-top-btn strong{font-size:22px}.dg80-review-actions .btn{width:100%!important}}';
  document.head.appendChild(s);
}

function currentCounts(){
  const out={};
  Object.entries(TILES).forEach(([k,t])=>{const e=t.count&&q(t.count);if(e&&String(e.textContent||'').trim())out[k]=String(e.textContent).trim();});
  const cache=readJson(extraKey(),null);if(cache&&cache.data)Object.assign(out,cache.data);
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
  const t=TILES[k],v=counts[k]!==undefined?counts[k]:'…';
  return '<button type="button" draggable="true" class="d3-tile dg80-final-tile '+esc(t.legacy||k)+'" data-dg80-final="'+esc(k)+'" data-dg80-key="'+esc(t.leaf||k)+'"><span>'+esc(t.label)+'</span><strong id="'+esc(t.count)+'">'+esc(v)+'</strong></button>';
}
function saveLayout(){
  const d=dash();if(!d)return;const out={};
  d.querySelectorAll('.dg80-final-section').forEach(sec=>out[sec.dataset.section]=[...sec.querySelectorAll('.dg80-final-tile[data-dg80-final]')].map(x=>x.dataset.dg80Final));
  writeJson(layoutKey(),out);
}

function buildDashboard(force){
  const d=dash();if(!d)return false;
  if(d.dataset.dg80Final==='1'&&!force)return true;
  const counts=currentCounts(),lay=layout();
  d.className='d3-dashboard dg80-office-dashboard dg80-final-dashboard';
  d.innerHTML='<div class="dg80-final-top">'
    +'<button type="button" id="dg80FinalSave" class="dg80-final-top-btn"><span>Änderungen Speichern</span><strong id="dg80FinalSaveCount">0</strong></button>'
    +'<button type="button" id="dg80FinalCalendar" class="dg80-final-top-btn"><span>Mitarbeiter Kalender</span><strong id="dg80c-calendar">'+esc(counts.calendar!==undefined?counts.calendar:'…')+'</strong></button>'
    +'</div>'
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
  d.addEventListener('dragstart',e=>{const t=e.target.closest('.dg80-final-tile[data-dg80-final]');if(!t)return;S.drag=t.dataset.dg80Final;t.classList.add('dragging');try{e.dataTransfer.effectAllowed='move';e.dataTransfer.setData('text/plain',S.drag);}catch(_e){}});
  d.addEventListener('dragover',e=>{if(!S.drag)return;const grid=e.target.closest('.dg80-final-grid');if(!grid)return;e.preventDefault();const src=d.querySelector('[data-dg80-final="'+CSS.escape(S.drag)+'"]');if(!src)return;const target=e.target.closest('.dg80-final-tile[data-dg80-final]');if(target&&target!==src){const r=target.getBoundingClientRect();grid.insertBefore(src,e.clientY<r.top+r.height/2?target:target.nextSibling);}else if(!target)grid.appendChild(src);});
  d.addEventListener('drop',e=>{if(!S.drag)return;e.preventDefault();saveLayout();});
  d.addEventListener('dragend',()=>{d.querySelectorAll('.dragging').forEach(x=>x.classList.remove('dragging'));S.drag='';saveLayout();});
}

function markActive(main){
  dash()?.querySelectorAll('.dg80-final-tile.active').forEach(x=>x.classList.remove('active'));
  if(main)dash()?.querySelector('[data-dg80-final="'+CSS.escape(main)+'"]')?.classList.add('active');
}
function mainForLeaf(key){
  if(['inquiries','aqon','inquiryArchive'].includes(key))return 'customers';
  if(['employeeAdmin','absence','sickness'].includes(key))return 'admin';
  return key;
}
function openLeaf(key,force){
  q('dg80GroupChooser')?.classList.remove('dg80-shell-active');S.group='';
  const open=fn('dg80OfficeOpen');if(!open)return false;
  const same=S.active===key;
  open(key,{force:!!force});
  if(same&&!force){S.active='';markActive('');return true;}
  S.active=key;const title=q('dg80OfficeTitle');if(title&&LEAF[key])title.textContent=LEAF[key].title;
  markActive(mainForLeaf(key));
  if(key==='days')setTimeout(()=>{installDayReviewWrap();const f=fn('loadBossDayClosuresV48');if(f)Promise.resolve(f()).catch(()=>{});},20);
  setTimeout(syncLabels,0);return true;
}
function closeMenus(){
  const c=fn('dg80OfficeClose');if(c)c();q('dg80GroupChooser')?.classList.remove('dg80-shell-active');S.active='';S.group='';markActive('');
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
  host.innerHTML='<div class="dg80-group-head"><h2>'+esc(def.title)+'</h2><button type="button" class="btn secondary dg80-group-close">×</button></div><div class="dg80-sub-help">Unterpunkte können per Drag & Drop frei angeordnet werden.</div><div class="dg80-sub-list">'+items.map(x=>'<button type="button" draggable="true" class="dg80-sub-button" data-dg80-sub="'+esc(x.key)+'"><span>'+esc(x.label)+'</span><strong data-sub-count="'+esc(x.count||'')+'">'+(x.count?'…':'›')+'</strong></button>').join('')+'</div>';
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
function applyExtra(x){
  if(!x)return;
  if(x.calendar!==undefined)setCount('dg80c-calendar',x.calendar);
  if(x.offerOpen!==undefined)setCount('dg80c-offerOpen',x.offerOpen);
  if(x.offerArchive!==undefined)setCount('dg80c-offerArchive',x.offerArchive);
  if(x.offerStats!==undefined)setCount('dg80c-offerStats',x.offerStats);
  if(x.billed!==undefined)setCount('dg80c-billed',x.billed);
  if(x.admin!==undefined)setCount('dg80c-admin',x.admin);
  if(x.health!==undefined)setCount('dg80c-health',x.health);
  if(x.payroll!==undefined)setCount('dg80TopPayroll',x.payroll);
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
  if(!force&&cached&&Date.now()-Number(cached.ts||0)<EXTRA_TTL)return cached.data;
  if(S.extraPromise)return S.extraPromise;
  S.extraPromise=(async()=>{
    const now=new Date(),year=now.getFullYear(),month=now.getMonth()+1,out=Object.assign({},cached?.data||{});
    const jobs=await Promise.allSettled([
      window.api(window.chefPayload({action:'getOfferStatistics'})),
      window.api(window.chefPayload({action:'getRegieReports',status:'Abgerechnet',year:0,month:0})),
      window.api(window.chefPayload({action:'getPayrollCycleState',year,month}))
    ]);
    if(jobs[0].status==='fulfilled'){
      const x=jobs[0].value||{};out.offerOpen=Number(x.open||0);out.offerStats=Number(x.total||0);out.offerArchive=Math.max(0,Number(x.accepted||0)+Number(x.declined||0));
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
  const create=q('d3OfferCreate')?.querySelector('h3');if(create)create.textContent='Offene Angebote';
  const open=q('d3OfferOpen')?.querySelector('h3');if(open)open.textContent='Erstellte Angebote';
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
  refreshExtra(false);
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
    window.d3Dashboard=async function(){const r=await db.apply(this,arguments);syncLabels();paintDirty();refreshExtra(false);return r;};
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
document.addEventListener('visibilitychange',()=>{if(!document.hidden&&visibleBoss()){syncLabels();paintDirty();refreshExtra(false);}});
})();
