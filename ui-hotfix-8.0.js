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
