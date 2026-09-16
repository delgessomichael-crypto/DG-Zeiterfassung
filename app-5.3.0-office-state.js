/* DG Zeiterfassung 5.3.0 - stabile Büroansicht pro Fenster + zweites App-Fenster */
(function(){
'use strict';
const V='5.3.0';
const VIEW_KEY='dg530_view';
const OFFICE_STATE_KEY='dg530_office_state';

function q(id){return document.getElementById(id);}
function bossAllowed(){try{return localStorage.getItem('dg_chef_access')==='1';}catch(_e){return false;}}
function bossVisible(){const e=q('bossView');return !!e&&!e.classList.contains('hidden');}
function employeeVisible(){const e=q('employeeView');return !!e&&!e.classList.contains('hidden');}
function setView(v){try{sessionStorage.setItem(VIEW_KEY,v);}catch(_e){}}
function getView(){try{return sessionStorage.getItem(VIEW_KEY)||'';}catch(_e){return '';}}
function setOfficeState(id,child){try{sessionStorage.setItem(OFFICE_STATE_KEY,JSON.stringify({id:id||'',child:child||''}));}catch(_e){}}
function getOfficeState(){try{return JSON.parse(sessionStorage.getItem(OFFICE_STATE_KEY)||'{}')||{};}catch(_e){return {};}}
function forcedOffice(){try{return new URL(location.href).searchParams.get('dgOffice')==='1';}catch(_e){return false;}}
function cleanUrl(){try{const u=new URL(location.href);u.searchParams.delete('dgOffice');u.searchParams.delete('dgWindow');history.replaceState(null,'',u.pathname+(u.search||'')+u.hash);}catch(_e){}}

function stampVersion(){
  document.title='DG Zeiterfassung '+V;
  document.querySelectorAll('.login-card .muted.small').forEach(x=>{if(/^Version /.test((x.textContent||'').trim()))x.textContent='Version '+V;});
  document.querySelectorAll('.hero strong').forEach(x=>{if(/Zeiterfassung/.test(x.textContent||''))x.textContent='Zeiterfassung - '+V;});
  try{if(window.DG3)DG3.version=V;window.DG_APP_VERSION=V;}catch(_e){}
}

function css(){
  if(q('dg530Css'))return;
  const s=document.createElement('style');s.id='dg530Css';
  s.textContent=`#dg530OfficeToolbar{display:flex;justify-content:flex-end;align-items:center;gap:10px;margin:0 0 14px;padding:10px 12px;border:1px solid #d7dee8;border-radius:14px;background:#f8fafc}#dg530OpenWindow{border:0;border-radius:11px;padding:11px 16px;background:#1f5f36;color:#fff;font-weight:800;cursor:pointer}@media(max-width:700px){#dg530OfficeToolbar{justify-content:stretch}#dg530OpenWindow{width:100%}}`;
  document.head.appendChild(s);
}
function openSecond(){
  setView('boss');
  let u;try{u=new URL(location.href);}catch(_e){return;}
  u.searchParams.set('dgOffice','1');u.searchParams.set('dgWindow',Date.now());
  const w=window.open(u.href,'_blank','width=1500,height=950,resizable=yes,scrollbars=yes');
  if(!w)alert('Das neue Fenster wurde vom Browser blockiert. Bitte Pop-ups für diese App erlauben.');
}
function toolbar(){
  const boss=q('bossView');if(!boss)return;
  q('dg528OfficeToolbar')?.remove();q('dg529OfficeToolbar')?.remove();
  if(q('dg530OfficeToolbar'))return;
  const bar=document.createElement('div');bar.id='dg530OfficeToolbar';
  const b=document.createElement('button');b.id='dg530OpenWindow';b.type='button';b.textContent='App erneut in neuem Fenster öffnen';b.addEventListener('click',openSecond);
  bar.appendChild(b);boss.insertBefore(bar,boss.firstChild);
}

/* direkter Umschalter: unabhängig von älteren showBoss/showEmployee-Wrappern */
function forceBoss(){
  if(!bossAllowed())return false;
  const employee=q('employeeView'),boss=q('bossView'),et=q('employeeTab'),bt=q('bossTab');
  if(!employee||!boss)return false;
  employee.classList.add('hidden');boss.classList.remove('hidden');
  et?.classList.remove('active');bt?.classList.add('active');
  setView('boss');toolbar();
  try{if(navigator.onLine){if(typeof window.d3CheckBackend==='function')window.d3CheckBackend();if(typeof window.d3Dashboard==='function')window.d3Dashboard();}}catch(_e){}
  return true;
}
function forceEmployee(){
  const employee=q('employeeView'),boss=q('bossView'),et=q('employeeTab'),bt=q('bossTab');
  if(!employee||!boss)return false;
  employee.classList.remove('hidden');boss.classList.add('hidden');
  et?.classList.add('active');bt?.classList.remove('active');
  setView('employee');return true;
}
function restoreSection(){
  const s=getOfficeState();if(!s.id||typeof window.d3Open!=='function'||!q(s.id))return;
  try{window.d3Open(s.id,s.child||undefined);}catch(_e){}
}

/* Capture-Listener merkt die echte Benutzerwahl. Keine internen Initialisierungsaufrufe können sie überschreiben. */
document.addEventListener('click',function(ev){
  const bossTab=ev.target&&ev.target.closest?ev.target.closest('#bossTab'):null;
  if(bossTab){setView('boss');setTimeout(()=>{forceBoss();},0);return;}
  const employeeTab=ev.target&&ev.target.closest?ev.target.closest('#employeeTab'):null;
  if(employeeTab){setView('employee');return;}
},true);

/* geöffneten Büro-Unterbereich pro Fenster merken */
const installD3Wrapper=function(){
  if(typeof window.d3Open!=='function'||window.__dg530D3Wrapped)return;
  window.__dg530D3Wrapped=true;
  const old=window.d3Open;
  window.d3Open=function(id,child){if(bossVisible())setOfficeState(id,child);return old.apply(this,arguments);};
};

function restoreAfterStartup(){
  const wantBoss=forcedOffice()||getView()==='boss';
  if(forcedOffice())setView('boss');
  installD3Wrapper();toolbar();stampVersion();
  if(wantBoss&&bossAllowed()){
    /* App 5.0 zeigt beim Start zunächst Mitarbeiter. Wir überschreiben dies NACH init() direkt im DOM. */
    forceBoss();
    setTimeout(forceBoss,25);
    setTimeout(function(){forceBoss();restoreSection();},120);
    setTimeout(function(){forceBoss();restoreSection();cleanUrl();},400);
  }else cleanUrl();
}

/* Sobald Büro sichtbar wird, Zustand sofort festhalten. Mitarbeiter wird nur über echten Tab-Klick gespeichert. */
function observeBoss(){
  const boss=q('bossView');if(!boss||boss.dataset.dg530Observed)return;
  boss.dataset.dg530Observed='1';
  new MutationObserver(function(){if(bossVisible())setView('boss');}).observe(boss,{attributes:true,attributeFilter:['class']});
}
window.addEventListener('pagehide',function(){if(bossVisible())setView('boss');});
window.addEventListener('beforeunload',function(){if(bossVisible())setView('boss');});

function boot(){
  css();stampVersion();observeBoss();installD3Wrapper();toolbar();
  restoreAfterStartup();
  setTimeout(function(){observeBoss();installD3Wrapper();toolbar();stampVersion();},700);
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot);else boot();
})();
