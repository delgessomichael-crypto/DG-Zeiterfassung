/* DG App 10 - compact office dashboard / collapsible sections */
(function(){
'use strict';

const VERSION='20260925-1835-office-compact1';
const q=id=>document.getElementById(id);
const S=window.DG10_OFFICE_COMPACT=window.DG10_OFFICE_COMPACT||{
  quickCollapsed:true,
  toolsCollapsed:true,
  sectionState:{},
  timer:null,
  observer:null
};

function bossVisible(){
  const b=q('bossView');
  return !!(b&&!b.classList.contains('hidden'));
}
function setCollapsed(shell,collapsed){
  if(!shell)return;
  shell.classList.toggle('dg10-collapsed',!!collapsed);
  const btn=shell.querySelector(':scope > .dg10-collapse-head');
  if(btn){
    btn.setAttribute('aria-expanded',String(!collapsed));
    const c=btn.querySelector('.dg10-collapse-chevron');
    if(c)c.textContent=collapsed?'▸':'▾';
  }
}
function shell(id,title,collapsed){
  let x=q(id);
  if(!x){
    x=document.createElement('section');
    x.id=id;
    x.className='dg10-collapse-shell';
    x.innerHTML='<button type="button" class="dg10-collapse-head"><span>'+title+'</span><span class="dg10-collapse-chevron" aria-hidden="true">▸</span></button><div class="dg10-collapse-body"></div>';
  }
  setCollapsed(x,collapsed);
  return x;
}
function ensureCss(){
  if(q('dg10OfficeCompactCss'))return;
  const s=document.createElement('style');
  s.id='dg10OfficeCompactCss';
  s.textContent=
    '.dg10-collapse-shell{margin:10px 0 12px;border:1px solid #dbe3ec;border-radius:15px;background:#fff;overflow:hidden;box-shadow:0 3px 12px rgba(15,23,42,.04)}'+
    '.dg10-collapse-head{width:100%;min-height:46px;border:0;background:#eef4ff;color:#31589e;padding:10px 14px;display:flex;align-items:center;justify-content:space-between;gap:12px;font:inherit;font-size:16px;font-weight:900;cursor:pointer;text-align:left}'+
    '.dg10-collapse-chevron{font-size:22px;line-height:1}'+
    '.dg10-collapse-body{padding:10px 12px}'+
    '.dg10-collapse-shell.dg10-collapsed>.dg10-collapse-body{display:none!important}'+
    '#dg10QuickShell .tabs{margin:0!important}'+
    '#dg10QuickShell #dg60OfficeToolbar{margin:10px 0 0!important;padding:0!important;border:0!important;background:transparent!important;box-shadow:none!important}'+
    '#bossView .dg80-final-section-title{display:flex!important;align-items:center!important;justify-content:space-between!important;gap:10px!important;cursor:pointer!important;user-select:none!important;padding:10px 12px!important;margin:0!important;border-radius:12px!important;background:#eef4ff!important;color:#31589e!important;font-size:16px!important}'+
    '#bossView .dg80-final-section-title:focus{outline:3px solid rgba(49,88,158,.22)!important;outline-offset:2px!important}'+
    '#bossView .dg80-final-section.dg10-section-collapsed>:not(.dg80-final-section-title){display:none!important}'+
    '#bossView .dg80-final-section{margin:0 0 11px!important;padding:0!important;border:1px solid #dbe3ec!important;border-radius:15px!important;background:#fff!important;overflow:hidden!important}'+
    '#bossView .dg80-final-section:not(.dg10-section-collapsed)>.dg80-final-grid,#bossView .dg80-final-section:not(.dg10-section-collapsed)>.dg10-accounting-grid{padding:10px!important}'+
    '#bossView .dg80-final-grid,#bossView .dg10-accounting-grid{grid-template-columns:repeat(auto-fit,minmax(150px,1fr))!important;gap:9px!important}'+
    '#bossView .dg80-final-tile,#bossView .dg10-accounting-tile{min-height:86px!important;border-radius:16px!important;padding:10px 11px!important;gap:7px!important}'+
    '#bossView .dg80-final-tile span,#bossView .dg10-accounting-tile span{font-size:14px!important;line-height:1.1!important}'+
    '#bossView .dg80-final-tile strong,#bossView .dg10-accounting-tile strong{font-size:24px!important;line-height:1!important}'+
    '#dg10ToolsShell{margin:0 0 12px!important}'+
    '#dg10ToolsShell .dg80-final-top{display:grid!important;grid-template-columns:repeat(3,minmax(0,1fr))!important;gap:9px!important;margin:0!important}'+
    '#dg10ToolsShell .dg80-final-top-btn{min-height:48px!important;border-radius:12px!important;padding:8px 10px!important}'+
    '#dg10ToolsShell .dg80-final-top-btn span{font-size:14px!important}'+
    '#dg10ToolsShell .dg80-final-top-btn strong{font-size:21px!important}'+
    '#bossView .dg10-new-appointment{background:#dbeafe!important;border-color:#93c5fd!important;color:#1d4ed8!important;justify-content:center!important}'+
    '#bossView .dg10-new-appointment span,#bossView .dg10-new-appointment strong{color:#1d4ed8!important}'+
    '#employeeView #inspectionQuickLauncher{margin:0 0 12px!important}'+
    '#employeeView #inspectionQuickLauncher button{width:100%!important;min-height:48px!important;font-weight:900!important}'+
    '@media(max-width:759px){'+
      '.dg10-collapse-body{padding:8px}'+
      '#bossView .dg80-final-grid,#bossView .dg10-accounting-grid{grid-template-columns:repeat(2,minmax(0,1fr))!important;gap:8px!important}'+
      '#bossView .dg80-final-tile,#bossView .dg10-accounting-tile{min-height:80px!important;padding:9px!important}'+
      '#bossView .dg80-final-tile span,#bossView .dg10-accounting-tile span{font-size:13px!important}'+
      '#bossView .dg80-final-tile strong,#bossView .dg10-accounting-tile strong{font-size:22px!important}'+
      '#dg10ToolsShell .dg80-final-top{grid-template-columns:1fr!important}'+
    '}';
  document.head.appendChild(s);
}

function ensureQuickShell(){
  const main=q('mainScreen'),tabs=main?.querySelector(':scope > .tabs');
  if(!main)return;
  let x=q('dg10QuickShell');
  if(!x){
    x=shell('dg10QuickShell','Schnellzugriffe & App',S.quickCollapsed);
    const employee=q('employeeView');
    if(employee)main.insertBefore(x,employee);else main.appendChild(x);
    x.querySelector('.dg10-collapse-head').addEventListener('click',()=>{
      S.quickCollapsed=!S.quickCollapsed;
      setCollapsed(x,S.quickCollapsed);
    });
  }
  const body=x.querySelector('.dg10-collapse-body');
  if(tabs&&tabs.parentElement!==body)body.prepend(tabs);
  const bar=q('dg60OfficeToolbar');
  if(bar&&bar.parentElement!==body)body.appendChild(bar);
  setCollapsed(x,S.quickCollapsed);
}

function ensureInspectionEmployeeOnly(){
  const wrap=q('inspectionQuickLauncher'),employee=q('employeeView');
  if(!wrap||!employee)return;
  if(wrap.parentElement!==employee)employee.prepend(wrap);
  wrap.classList.toggle('hidden',!String(localStorage.getItem('dg_employee')||'').trim());
}

function ensureToolsShell(){
  const d=q('bossView')?.querySelector(':scope > .d3-dashboard');
  const top=d?.querySelector('.dg80-final-top');
  if(!d||!top)return;
  let x=q('dg10ToolsShell');
  if(!x||x.parentElement!==d){
    if(x)x.remove();
    x=shell('dg10ToolsShell','Büro-Werkzeuge',S.toolsCollapsed);
    d.insertBefore(x,d.firstChild);
    x.querySelector('.dg10-collapse-head').addEventListener('click',()=>{
      S.toolsCollapsed=!S.toolsCollapsed;
      setCollapsed(x,S.toolsCollapsed);
    });
  }
  const body=x.querySelector('.dg10-collapse-body');
  if(top.parentElement!==body)body.appendChild(top);
  setCollapsed(x,S.toolsCollapsed);
}

function sectionKey(sec){
  return String(sec?.dataset?.section||sec?.querySelector(':scope > .dg80-final-section-title')?.textContent||'bereich').trim();
}
function sectionDefaultCollapsed(key){
  return key!=='daily';
}
function applySection(sec){
  const title=sec.querySelector(':scope > .dg80-final-section-title');
  if(!title)return;
  const key=sectionKey(sec);
  if(S.sectionState[key]===undefined)S.sectionState[key]=sectionDefaultCollapsed(key);
  const collapsed=!!S.sectionState[key];
  sec.classList.toggle('dg10-section-collapsed',collapsed);
  title.setAttribute('role','button');
  title.setAttribute('tabindex','0');
  title.setAttribute('aria-expanded',String(!collapsed));
  let ch=title.querySelector(':scope > .dg10-section-chevron');
  if(!ch){
    ch=document.createElement('span');
    ch.className='dg10-section-chevron';
    ch.setAttribute('aria-hidden','true');
    title.appendChild(ch);
  }
  ch.textContent=collapsed?'▸':'▾';
  if(title.dataset.dg10CollapseBound==='1')return;
  title.dataset.dg10CollapseBound='1';
  const toggle=e=>{
    if(e.type==='keydown'&&!['Enter',' '].includes(e.key))return;
    if(e.type==='keydown')e.preventDefault();
    S.sectionState[key]=!S.sectionState[key];
    applySection(sec);
  };
  title.addEventListener('click',toggle);
  title.addEventListener('keydown',toggle);
}
function ensureSections(){
  q('bossView')?.querySelectorAll('.dg80-final-section').forEach(applySection);
}

function openCalendar(){
  if(typeof window.dg80OfficeOpen==='function'){
    window.dg80OfficeOpen('calendar',{force:true});
    return;
  }
  const b=q('dg80FinalCalendar');
  if(b)b.click();
}
function ensureAppointmentTile(){
  const grid=q('bossView')?.querySelector('.dg80-final-section[data-section="daily"] .dg80-final-grid');
  if(!grid)return;
  let b=grid.querySelector(':scope > .dg10-new-appointment');
  if(!b){
    b=document.createElement('button');
    b.type='button';
    b.className='d3-tile dg80-final-tile dg10-new-appointment';
    b.innerHTML='<span>+ Termin</span><strong>📅</strong>';
    b.addEventListener('click',e=>{e.preventDefault();e.stopPropagation();openCalendar();},true);
    const quick=grid.querySelector('[data-dg80-final="quickOfferRequest"]');
    if(quick)quick.insertAdjacentElement('afterend',b);else grid.appendChild(b);
  }
}

function sync(){
  ensureCss();
  ensureQuickShell();
  ensureInspectionEmployeeOnly();
  if(bossVisible()){
    ensureToolsShell();
    ensureSections();
    ensureAppointmentTile();
  }
  document.documentElement.dataset.dgOfficeCompact=VERSION;
}
function schedule(){
  clearTimeout(S.timer);
  S.timer=setTimeout(sync,25);
}
function install(){
  sync();
  if(!S.observer){
    S.observer=new MutationObserver(schedule);
    S.observer.observe(document.body,{subtree:true,childList:true,attributes:true,attributeFilter:['class']});
  }
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)schedule();});
  window.addEventListener('resize',schedule,{passive:true});
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});else install();
})();