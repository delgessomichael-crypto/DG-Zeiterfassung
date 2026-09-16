/* DG Zeiterfassung 5.2.8 - Büroansicht bleibt nach Aktualisierung aktiv + zweites App-Fenster */
(function(){
'use strict';
const V528='5.2.8';
const MODE_KEY='dg_ui_mode_528';
const OFFICE_STATE_KEY='dg_office_state_528';

function q(id){return document.getElementById(id);}
function isBossVisible(){const e=q('bossView');return !!e&&!e.classList.contains('hidden');}
function saveMode(mode){try{sessionStorage.setItem(MODE_KEY,mode);}catch(_e){}}
function readMode(){try{return sessionStorage.getItem(MODE_KEY)||'';}catch(_e){return '';}}
function saveOfficeState(id,child){
  try{sessionStorage.setItem(OFFICE_STATE_KEY,JSON.stringify({id:String(id||''),child:String(child||'')}));}catch(_e){}
}
function readOfficeState(){
  try{return JSON.parse(sessionStorage.getItem(OFFICE_STATE_KEY)||'{}')||{};}catch(_e){return {};}
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
  document.title='DG Zeiterfassung '+V528;
  const login=document.querySelector('#loginScreen .center.muted.small');if(login)login.textContent='Version '+V528;
  const hero=document.querySelector('#mainScreen .hero .head-row strong');if(hero)hero.textContent='Zeiterfassung - '+V528;
  try{window.DG_APP_VERSION=V528;if(window.DG3)DG3.version=V528;}catch(_e){}
}
function addCss(){
  if(q('dg528Css'))return;
  const s=document.createElement('style');s.id='dg528Css';
  s.textContent=`
    #dg528OfficeToolbar{display:flex;justify-content:flex-end;align-items:center;gap:10px;margin:0 0 14px 0;padding:10px 12px;border:1px solid #d7dee8;border-radius:14px;background:#f8fafc;box-shadow:0 1px 2px rgba(15,23,42,.04)}
    #dg528OfficeToolbar .dg528-open-window{appearance:none;border:0;border-radius:11px;padding:11px 16px;background:#1f5f36;color:#fff;font-weight:800;font-size:14px;cursor:pointer;box-shadow:0 1px 2px rgba(0,0,0,.12)}
    #dg528OfficeToolbar .dg528-open-window:hover{filter:brightness(.96)}
    @media(max-width:700px){#dg528OfficeToolbar{justify-content:stretch}#dg528OfficeToolbar .dg528-open-window{width:100%}}
  `;
  document.head.appendChild(s);
}
function openSecondWindow(){
  saveMode('boss');
  const st=readOfficeState();if(st.id)saveOfficeState(st.id,st.child);
  let url;
  try{url=new URL(location.href);}catch(_e){return;}
  url.searchParams.set('dgOffice','1');url.searchParams.set('dgWindow',String(Date.now()));
  const w=window.open(url.href,'_blank','width=1500,height=950,resizable=yes,scrollbars=yes');
  if(!w)alert('Das neue Fenster wurde vom Browser blockiert. Bitte Pop-ups für diese App erlauben.');
}
window.dg528OpenSecondWindow=openSecondWindow;
function installToolbar(){
  const boss=q('bossView');if(!boss||q('dg528OfficeToolbar'))return;
  const bar=document.createElement('div');bar.id='dg528OfficeToolbar';
  const b=document.createElement('button');b.type='button';b.className='dg528-open-window';b.textContent='App erneut in neuem Fenster öffnen';b.addEventListener('click',openSecondWindow);
  bar.appendChild(b);boss.insertBefore(bar,boss.firstChild);
}
function restoreOfficeSection(){
  const st=readOfficeState();
  if(!st.id||typeof window.d3Open!=='function')return;
  const target=q(st.id);if(!target)return;
  try{window.d3Open(st.id,st.child||undefined);}catch(_e){}
}

const baseShowEmployee=window.showEmployee;
if(typeof baseShowEmployee==='function')window.showEmployee=function(){
  saveMode('employee');
  return baseShowEmployee.apply(this,arguments);
};

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
  if(wantBoss&&typeof window.canAccessBoss==='function'&&window.canAccessBoss()){
    setTimeout(function(){
      try{window.showBoss();installToolbar();if(saved.id)restoreOfficeSection();}catch(_e){}
      cleanOfficeUrl();
    },120);
  }else cleanOfficeUrl();
  return r;
};

window.addEventListener('beforeunload',function(){
  if(isBossVisible())saveMode('boss');
  else if(q('employeeView')&&!q('employeeView').classList.contains('hidden'))saveMode('employee');
});

function boot(){
  addCss();updateVersion();installToolbar();
  if(officeForcedByUrl())saveMode('boss');
  setTimeout(function(){if(isBossVisible()){saveMode('boss');installToolbar();}},300);
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot);else boot();
})();
