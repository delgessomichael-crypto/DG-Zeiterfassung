(function(){
'use strict';
if(window.__DG_V62_AUTO_SYNC__)return;window.__DG_V62_AUTO_SYNC__=true;
const $=id=>document.getElementById(id);
const CAL_MS=30000;
const APP_MS=60000;
let busy=false,lastCalendarRun=0,lastAppRun=0,lastRegieView='';
function visible(el){return !!(el&&!el.classList.contains('hidden')&&el.offsetParent!==null)}
function editing(){const a=document.activeElement;if(!a)return false;return ['INPUT','TEXTAREA','SELECT'].includes(a.tagName)||a.isContentEditable}
function modalOpen(){const m=$('dg62Modal');return !!(m&&!m.classList.contains('hidden'))}
function mainOpen(){return visible($('mainScreen'))}
function bossOpen(){return visible($('bossView'))}
function employeeOpen(){return visible($('employeeView'))}
function calendarOpen(){const d=document.querySelector('#dg62PlannerCard .dg62-main');return bossOpen()&&!!(d&&d.open)}
function regieOpen(){const heads=[...document.querySelectorAll('#bossView .dg48-head')];const h=heads.find(x=>String(x.textContent||'').includes('Regieberichte'));if(!h)return false;const c=h.closest('.card'),b=c&&c.querySelector(':scope > .dg48-body');return !!(b&&!b.classList.contains('hidden'))}
function mark(text){let e=$('dgAutoSyncState');if(!e){e=document.createElement('div');e.id='dgAutoSyncState';e.className='muted small';e.style.margin='6px 0 10px';e.style.textAlign='right';const tabs=document.querySelector('#mainScreen .tabs');if(tabs)tabs.insertAdjacentElement('afterend',e)}if(e)e.textContent=text}
const oldRegie=window.loadRegieReports;if(typeof oldRegie==='function')window.loadRegieReports=async function(view){if(view)lastRegieView=view;return oldRegie.apply(this,arguments)};
async function runCalendar(now){if(now-lastCalendarRun<CAL_MS||!calendarOpen()||typeof window.dg62Load!=='function')return;lastCalendarRun=now;await window.dg62Load()}
async function runApp(now){if(now-lastAppRun<APP_MS)return;lastAppRun=now;if(typeof window.syncQueue==='function')await window.syncQueue(false);if(employeeOpen()){if(typeof window.loadDay==='function')await window.loadDay();if(typeof window.loadCalendarEvents==='function')await window.loadCalendarEvents()}else if(bossOpen()&&regieOpen()&&lastRegieView&&typeof window.loadRegieReports==='function'){await window.loadRegieReports(lastRegieView)}}
async function tick(force){if(busy||document.hidden||!navigator.onLine||!mainOpen()||modalOpen()||editing())return;busy=true;try{const now=Date.now();mark('Automatische Synchronisierung aktiv');if(force){lastCalendarRun=0;lastAppRun=0}await runCalendar(now);await runApp(now);mark('Automatisch synchronisiert · '+new Intl.DateTimeFormat('de-DE',{hour:'2-digit',minute:'2-digit',second:'2-digit'}).format(new Date()))}catch(_e){mark('Automatische Synchronisierung aktiv · nächster Versuch folgt automatisch')}finally{busy=false}}
setInterval(()=>tick(false),5000);
document.addEventListener('visibilitychange',()=>{if(!document.hidden)setTimeout(()=>tick(true),300)});
window.addEventListener('online',()=>setTimeout(()=>tick(true),500));
const oldShowEmployee=window.showEmployee;if(typeof oldShowEmployee==='function')window.showEmployee=function(){const r=oldShowEmployee.apply(this,arguments);setTimeout(()=>tick(true),250);return r};
const oldShowBoss=window.showBoss;if(typeof oldShowBoss==='function')window.showBoss=function(){const r=oldShowBoss.apply(this,arguments);setTimeout(()=>tick(true),350);return r};
setTimeout(()=>tick(true),1500);
})();