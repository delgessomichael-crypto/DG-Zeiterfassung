/* DG App 10 - compact office dashboard / collapsible sections */
(function(){
'use strict';

const VERSION='20260925-1845-office-compact2';
const q=id=>document.getElementById(id);
const S=window.DG10_OFFICE_COMPACT=window.DG10_OFFICE_COMPACT||{sectionState:{},timer:null,observer:null};

function ensureCss(){
  if(q('dg10OfficeCompactCss'))return;
  const s=document.createElement('style');
  s.id='dg10OfficeCompactCss';
  s.textContent=
    '#bossView .dg80-final-section-title{display:flex!important;align-items:center!important;justify-content:space-between!important;gap:10px!important;cursor:pointer!important;user-select:none!important;padding:10px 12px!important;margin:0!important;border-radius:12px!important;background:#eef4ff!important;color:#31589e!important;font-size:16px!important}'+
    '#bossView .dg80-final-section-title:focus{outline:3px solid rgba(49,88,158,.22)!important;outline-offset:2px!important}'+
    '#bossView .dg80-final-section.dg10-section-collapsed>:not(.dg80-final-section-title){display:none!important}'+
    '#bossView .dg80-final-section{margin:0 0 11px!important;padding:0!important;border:1px solid #dbe3ec!important;border-radius:15px!important;background:#fff!important;overflow:hidden!important}'+
    '#bossView .dg80-final-section:not(.dg10-section-collapsed)>.dg80-final-grid,#bossView .dg80-final-section:not(.dg10-section-collapsed)>.dg10-accounting-grid{padding:10px!important}'+
    '#bossView .dg80-final-grid,#bossView .dg10-accounting-grid{grid-template-columns:repeat(auto-fit,minmax(150px,1fr))!important;gap:9px!important}'+
    '#bossView .dg80-final-tile,#bossView .dg10-accounting-tile{min-height:86px!important;border-radius:16px!important;padding:10px 11px!important;gap:7px!important}'+
    '#bossView .dg80-final-tile span,#bossView .dg10-accounting-tile span{font-size:14px!important;line-height:1.1!important}'+
    '#bossView .dg80-final-tile strong,#bossView .dg10-accounting-tile strong{font-size:24px!important;line-height:1!important}'+
    '@media(max-width:759px){#bossView .dg80-final-grid,#bossView .dg10-accounting-grid{grid-template-columns:repeat(2,minmax(0,1fr))!important;gap:8px!important}#bossView .dg80-final-tile,#bossView .dg10-accounting-tile{min-height:80px!important;padding:9px!important}#bossView .dg80-final-tile span,#bossView .dg10-accounting-tile span{font-size:13px!important}#bossView .dg80-final-tile strong,#bossView .dg10-accounting-tile strong{font-size:22px!important}}';
  document.head.appendChild(s);
}

function keyOf(sec){
  return String(sec?.dataset?.section||sec?.querySelector(':scope > .dg80-final-section-title')?.textContent||'bereich').trim();
}
function defaultCollapsed(key){return key!=='daily';}

function apply(sec){
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
    apply(sec);
  };
  title.addEventListener('click',toggle);
  title.addEventListener('keydown',toggle);
}

function sync(){
  ensureCss();
  q('bossView')?.querySelectorAll('.dg80-final-section').forEach(apply);
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
    S.observer.observe(document.body,{subtree:true,childList:true});
  }
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)schedule();});
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});else install();
})();