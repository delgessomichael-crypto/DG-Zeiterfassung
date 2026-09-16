/* DG Zeiterfassung 5.2.9 - Büroansicht bleibt sicher aktiv + zweites App-Fenster */
(function(){
'use strict';
const V529='5.2.9';
const MODE_KEY='dg_ui_mode_529';
const OLD_MODE_KEY='dg_ui_mode_528';
const OFFICE_STATE_KEY='dg_office_state_529';
const OLD_OFFICE_STATE_KEY='dg_office_state_528';

function q(id){return document.getElementById(id);}
function isBossVisible(){const e=q('bossView');return !!e&&!e.classList.contains('hidden');}
function isEmployeeVisible(){const e=q('employeeView');return !!e&&!e.classList.contains('hidden');}
function saveMode(mode){try{sessionStorage.setItem(MODE_KEY,mode);}catch(_e){}}
function readMode(){
  try{return sessionStorage.getItem(MODE_KEY)||sessionStorage.getItem(OLD_MODE_KEY)||'';}catch(_e){return '';}
}
function saveOfficeState(id,child){
  try{sessionStorage.setItem(OFFICE_STATE_KEY,JSON.stringify({id:String(id||''),child:String(child||'')}));}catch(_e){}
}
function readOfficeState(){
  try{return JSON.parse(sessionStorage.getItem(OFFICE_STATE_KEY)||sessionStorage.getItem(OLD_OFFICE_STATE_KEY)||'{}')||{};}catch(_e){return {};}
}
function officeForcedByUrl(){
  try{return new URL(location.href).searchParams.get('dgOffice')==='1';}catch(_e){return false;}
}
function cleanOfficeUrl(){
  try{
    const u=new URL(location.href);
    if(!u.searchParams.has('dgOffice')&&!u.searchParams.has('dgWindow'))return;
    u.searchParams.delete('dgOffice');u.searchParams.delete('dgWindow');
    history.replaceState(null,'',u.pathname+(u.search||'')+u.hash);
  }catch(_e){}
}
function updateVersion(){
  document.title='DG Zeiterfassung '+V529;
  const login=document.querySelector('#loginScreen .center.muted.small');if(login)login.textContent='Version '+V529;
  const hero=document.querySelector('#mainScreen .hero .head-row strong');if(hero)hero.textContent='Zeiterfassung - '+V529;
  try{window.DG_APP_VERSION=V529;if(window.DG3)DG3.version=V529;}catch(_e){}
}
function addCss(){
  if(q('dg529Css'))return;
  const s=document.createElement('style');s.id='dg529Css';
  s.textContent=`
    #dg529OfficeToolbar{display:flex;justify-content:flex-end;align-items:center;gap:10px;margin:0 0 14px 0;padding:10px 12px;border:1px solid #d7dee8;border-radius:14px;background:#f8fafc;box-shadow:0 1px 2px rgba(15,23,42,.04)}
    #dg529OfficeToolbar .dg529-open-window{appearance:none;border:0;border-radius:11px;padding:11px 16px;background:#1f5f36;color:#fff;font-weight:800;font-size:14px;cursor:pointer;box-shadow:0 1px 2px rgba(0,0,0,.12)}
    #dg529OfficeToolbar .dg529-open-window:hover{filter:brightness(.96)}
    @media(max-width:700px){#dg529OfficeToolbar{justify-content:stretch}#dg529OfficeToolbar .dg529-open-window{width:100%}}
  `;
  document.head.appendChild(s);
}
function openSecondWindow(){
  saveMode('boss');
  let url;
  try{url=new URL(location.href);}catch(_e){return;}
  url.searchParams.set('dgOffice','1');url.searchParams.set('dgWindow',String(Date.now()));
  const w=window.open(url.href,'_blank','width=1500,height=950,resizable=yes,scrollbars=yes');
  if(!w)alert('Das neue Fenster wurde vom Browser blockiert. Bitte Pop-ups für diese App erlauben.');
}
window.dg529OpenSecondWindow=openSecondWindow;
function installToolbar(){
  const boss=q('bossView');if(!boss||q('dg529OfficeToolbar'))return;
  q('dg528OfficeToolbar')?.remove();
  const bar=document.createElement('div');bar.id='dg529OfficeToolbar';
  const b=document.createElement('button');b.type='button';b.className='dg529-open-window';b.textContent='App erneut in neuem Fenster öffnen';b.addEventListener('click',openSecondWindow);
  bar.appendChild(b);boss.insertBefore(bar,boss.firstChild);
}
function restoreOfficeSection(){
  const st=readOfficeState();
  if(!st.id||typeof window.d3Open!=='function')return;
  if(!q(st.id))return;
  try{window.d3Open(st.id,st.child||undefined);}catch(_e){}
}
function forceBossNow(restoreSection){
  if(typeof window.canAccessBoss==='function'&&!window.canAccessBoss())return false;
  if(typeof window.showBoss!=='function')return false;
  try{
    window.showBoss();
    installToolbar();
    if(restoreSection)restoreOfficeSection();
    saveMode('boss');
    return true;
  }catch(_e){return false;}
}
function wireExplicitModeTabs(){
  const e=q('employeeTab');
  if(e&&!e.dataset.dg529ModeWire){e.dataset.dg529ModeWire='1';e.addEventListener('click',function(){saveMode('employee');});}
  const b=q('bossTab');
  if(b&&!b.dataset.dg529ModeWire){b.dataset.dg529ModeWire='1';b.addEventListener('click',function(){saveMode('boss');});}
}

/* WICHTIG: showEmployee wird absichtlich NICHT mehr umgebogen.
   openMain() ruft showEmployee() beim Laden intern auf. Genau das hatte in 5.2.8
   den gespeicherten Büro-Modus wieder auf Mitarbeiter überschrieben. */
const baseShowBoss=window.showBoss;
if(typeof baseShowBoss==='function')window.showBoss=function(){
  saveMode('boss');
  const r=baseShowBoss.apply(this,arguments);
  installToolbar();
  return r;
};

const baseD3Open=window.d3Open;
if(typeof baseD3Open==='function')window.d3Open=function(id,child){
  if(isBossVisible()){saveMode('boss');saveOfficeState(id,child);}
  return baseD3Open.apply(this,arguments);
};

const baseOpenMain=window.openMain;
if(typeof baseOpenMain==='function')window.openMain=function(){
  const wantBoss=officeForcedByUrl()||readMode()==='boss';
  const saved=readOfficeState();
  const r=baseOpenMain.apply(this,arguments);
  wireExplicitModeTabs();
  if(wantBoss){
    /* sofort zurück ins Büro; zusätzliche Wiederholung fängt spätere UI-Initialisierung ab */
    forceBossNow(false);
    setTimeout(function(){forceBossNow(false);},40);
    setTimeout(function(){
      forceBossNow(false);
      if(saved.id)restoreOfficeSection();
      cleanOfficeUrl();
    },180);
  }else cleanOfficeUrl();
  return r;
};

window.addEventListener('beforeunload',function(){
  if(isBossVisible())saveMode('boss');
  else if(isEmployeeVisible())saveMode('employee');
});

function boot(){
  addCss();updateVersion();wireExplicitModeTabs();installToolbar();
  if(officeForcedByUrl())saveMode('boss');
  /* Migration aus 5.2.8 */
  if(!sessionStorage.getItem(MODE_KEY)){
    try{const old=sessionStorage.getItem(OLD_MODE_KEY);if(old)sessionStorage.setItem(MODE_KEY,old);}catch(_e){}
  }
  setTimeout(function(){
    wireExplicitModeTabs();
    if(isBossVisible()){saveMode('boss');installToolbar();}
  },300);
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot);else boot();
})();
