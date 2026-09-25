/* DG App 10 - compact office dashboard / all sections collapsible */
(function(){
'use strict';

const VERSION='20260925-1915-office-compact4';
const q=id=>document.getElementById(id);
const S=window.DG10_OFFICE_COMPACT=window.DG10_OFFICE_COMPACT||{};
S.sectionState=S.sectionState||{};
S.upperState=S.upperState||{access:true,app:true,tools:true};
S.timer=S.timer||null;
S.observer=S.observer||null;

function ensureCss(){
  if(q('dg10OfficeCompactCss'))return;
  const s=document.createElement('style');
  s.id='dg10OfficeCompactCss';
  s.textContent=
    '.dg10-upper-section{margin:0 0 11px!important;padding:0!important;border:1px solid #dbe3ec!important;border-radius:15px!important;background:#fff!important;overflow:hidden!important;box-shadow:0 3px 12px rgba(15,23,42,.04)!important}'+
    '.dg10-upper-title,#bossView .dg80-final-section-title{display:flex!important;align-items:center!important;justify-content:space-between!important;gap:10px!important;width:100%!important;box-sizing:border-box!important;cursor:pointer!important;user-select:none!important;padding:10px 12px!important;margin:0!important;border-radius:12px!important;background:#eef4ff!important;color:#31589e!important;font-size:16px!important;font-weight:900!important}'+
    '.dg10-upper-title{border:0!important;font:inherit!important;text-align:left!important}'+
    '.dg10-upper-title:focus,#bossView .dg80-final-section-title:focus{outline:3px solid rgba(49,88,158,.22)!important;outline-offset:2px!important}'+
    '.dg10-upper-chevron,.dg10-section-chevron{font-size:22px!important;line-height:1!important;flex:0 0 auto!important}'+
    '.dg10-upper-body{padding:10px 12px!important}'+
    '.dg10-upper-section.dg10-upper-collapsed>.dg10-upper-body{display:none!important}'+
    '#bossView .dg80-final-section.dg10-section-collapsed>:not(.dg80-final-section-title){display:none!important}'+
    '#bossView .dg80-final-section{margin:0 0 11px!important;padding:0!important;border:1px solid #dbe3ec!important;border-radius:15px!important;background:#fff!important;overflow:hidden!important}'+
    '#bossView .dg80-final-section:not(.dg10-section-collapsed)>.dg80-final-grid,#bossView .dg80-final-section:not(.dg10-section-collapsed)>.dg10-accounting-grid{padding:10px!important}'+
    '#bossView .dg80-final-grid,#bossView .dg10-accounting-grid{grid-template-columns:repeat(auto-fit,minmax(150px,1fr))!important;gap:9px!important}'+
    '#bossView .dg80-final-tile,#bossView .dg10-accounting-tile{min-height:86px!important;border-radius:16px!important;padding:10px 11px!important;gap:7px!important}'+
    '#bossView .dg80-final-tile span,#bossView .dg10-accounting-tile span{font-size:14px!important;line-height:1.1!important}'+
    '#bossView .dg80-final-tile strong,#bossView .dg10-accounting-tile strong{font-size:24px!important;line-height:1!important}'+
    '#dg10AccessShell .tabs{margin:0!important}'+
    '#dg10AccessShell #inspectionQuickLauncher{margin:10px 0 0!important}'+
    '#dg10AccessShell #inspectionQuickLauncher button{width:100%!important;min-height:48px!important}'+
    '#dg10AppShell #dg60OfficeToolbar{margin:0!important;padding:0!important;border:0!important;background:transparent!important}'+
    '#dg10AppShell #d3Sync{margin-top:8px!important;text-align:right!important}'+
    '#dg10ToolsShell .dg80-final-top{display:grid!important;grid-template-columns:repeat(3,minmax(0,1fr))!important;gap:9px!important;margin:0!important}'+
    '#dg10ToolsShell .dg80-final-top-btn{min-height:52px!important;border-radius:12px!important;padding:9px 10px!important}'+
    '#dg10ToolsShell .dg80-final-top-btn span{font-size:14px!important}'+
    '#dg10ToolsShell .dg80-final-top-btn strong{font-size:21px!important}'+
    '@media(max-width:759px){'+
      '.dg10-upper-body{padding:8px!important}'+
      '#bossView .dg80-final-grid,#bossView .dg10-accounting-grid{grid-template-columns:repeat(2,minmax(0,1fr))!important;gap:8px!important}'+
      '#bossView .dg80-final-tile,#bossView .dg10-accounting-tile{min-height:80px!important;padding:9px!important}'+
      '#bossView .dg80-final-tile span,#bossView .dg10-accounting-tile span{font-size:13px!important}'+
      '#bossView .dg80-final-tile strong,#bossView .dg10-accounting-tile strong{font-size:22px!important}'+
      '#dg10ToolsShell .dg80-final-top{grid-template-columns:1fr!important}'+
    '}';
  document.head.appendChild(s);
}

function setUpperCollapsed(shell,collapsed){
  if(!shell)return;
  shell.classList.toggle('dg10-upper-collapsed',!!collapsed);
  const head=shell.querySelector(':scope > .dg10-upper-title');
  if(head){
    head.setAttribute('aria-expanded',String(!collapsed));
    const ch=head.querySelector('.dg10-upper-chevron');
    if(ch)ch.textContent=collapsed?'▸':'▾';
  }
}

function ensureUpperShell(id,title,parent,before,stateKey){
  if(!parent)return null;
  let shell=q(id);
  if(!shell){
    shell=document.createElement('section');
    shell.id=id;
    shell.className='dg10-upper-section';
    shell.innerHTML='<button type="button" class="dg10-upper-title" aria-expanded="false"><span>'+title+'</span><span class="dg10-upper-chevron" aria-hidden="true">▸</span></button><div class="dg10-upper-body"></div>';
    parent.insertBefore(shell,before||null);
    shell.querySelector('.dg10-upper-title').addEventListener('click',()=>{
      S.upperState[stateKey]=!S.upperState[stateKey];
      setUpperCollapsed(shell,S.upperState[stateKey]);
    });
  }
  setUpperCollapsed(shell,S.upperState[stateKey]!==false);
  return shell;
}

function ensureAccessShell(){
  const app=q('mainScreen')?.querySelector(':scope > .app');
  if(!app)return;
  const employee=q('employeeView');
  const shell=ensureUpperShell('dg10AccessShell','Mitarbeiter, Büro & Besichtigung',app,employee,'access');
  if(!shell)return;
  const body=shell.querySelector('.dg10-upper-body');
  const connection=q('connectionBar');
  if(connection&&connection.parentElement!==body)body.appendChild(connection);
  const queue=q('queueBar');
  if(queue&&queue.parentElement!==body)body.appendChild(queue);
  const tabs=app.querySelector(':scope > .tabs')||q('employeeTab')?.closest('.tabs');
  if(tabs&&tabs.parentElement!==body)body.appendChild(tabs);
  const inspection=q('inspectionQuickLauncher');
  if(inspection&&inspection.parentElement!==body)body.appendChild(inspection);
}

function ensureAppShell(){
  const boss=q('bossView');
  const dash=boss?.querySelector(':scope > .d3-dashboard');
  if(!boss||!dash)return;
  const shell=ensureUpperShell('dg10AppShell','App-Steuerung',boss,dash,'app');
  if(!shell)return;
  const body=shell.querySelector('.dg10-upper-body');
  const bar=q('dg60OfficeToolbar');
  if(bar&&bar.parentElement!==body)body.appendChild(bar);
  const sync=q('d3Sync');
  const wrap=sync?.parentElement;
  if(sync){
    if(wrap&&wrap!==body&&wrap.parentElement===boss)body.appendChild(wrap);
    else if(sync.parentElement!==body&&(!wrap||wrap===boss))body.appendChild(sync);
  }
}

function ensureToolsShell(){
  const dash=q('bossView')?.querySelector(':scope > .d3-dashboard');
  const top=dash?.querySelector('.dg80-final-top');
  if(!dash||!top)return;
  let shell=q('dg10ToolsShell');
  if(!shell||shell.parentElement!==dash){
    if(shell)shell.remove();
    const firstSection=dash.querySelector(':scope > .dg80-final-section');
    shell=ensureUpperShell('dg10ToolsShell','Büro-Werkzeuge',dash,firstSection,'tools');
  }
  if(!shell)return;
  const body=shell.querySelector('.dg10-upper-body');
  if(top.parentElement!==body)body.appendChild(top);
  setUpperCollapsed(shell,S.upperState.tools!==false);
}

function keyOf(sec){
  return String(sec?.dataset?.section||sec?.querySelector(':scope > .dg80-final-section-title')?.textContent||'bereich').trim();
}
function defaultCollapsed(key){return key!=='daily';}

function applySection(sec){
  const title=sec.querySelector(':scope > .dg80-final-section-title');
  if(!title)return;
  const key=keyOf(sec);
  if(S.sectionState[key]===undefined)S.sectionState[key]=defaultCollapsed(key);
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

function sync(){
  ensureCss();
  ensureAccessShell();
  ensureAppShell();
  ensureToolsShell();
  q('bossView')?.querySelectorAll('.dg80-final-section').forEach(applySection);
  document.documentElement.dataset.dgOfficeCompact=VERSION;
}

function schedule(){
  clearTimeout(S.timer);
  S.timer=setTimeout(sync,30);
}
function install(){
  sync();
  if(!S.observer){
    S.observer=new MutationObserver(schedule);
    S.observer.observe(document.body,{subtree:true,childList:true});
  }
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)schedule();});
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});else install();
})();