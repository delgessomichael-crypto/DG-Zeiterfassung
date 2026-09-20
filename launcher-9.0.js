/* DG Zeiterfassung 9.0 - stable launcher/auth
   Absichtlich klein und unabhaengig vom grossen App-Bundle.
   Genau ein Startpfad fuer Mitarbeiterliste, Login und Core-Start. */
(function(){
'use strict';

const VERSION='9.0';
const BACKEND='https://script.google.com/macros/s/AKfycby2L3SMgh2RoGWsNRUp6o11g4iyZ8bgkSIGaAZPnBXCkJTkDDGF9aydn9vVKMB7kXsO/exec';
const EMP_CACHE='dg90_employee_cache';
const START_FLAG='__DG90_LAUNCHER_STARTED';

function el(id){return document.getElementById(id);}
function esc(v){return String(v==null?'':v).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');}
function status(text,type){
  const s=el('loginStatus');if(!s)return;
  s.className=text?'status '+(type||'info'):'';
  s.textContent=text||'';
}
function stamp(){
  document.title='DG Zeiterfassung '+VERSION;
  const lv=document.querySelector('#loginScreen .center.muted.small');
  if(lv)lv.textContent='Version '+VERSION;
  const hv=document.querySelector('#mainScreen .hero .head-row strong');
  if(hv)hv.textContent='Zeiterfassung - '+VERSION;
  try{window.DG_APP_VERSION=VERSION;window.DG_RELEASE=VERSION;if(window.DG3)DG3.version=VERSION;}catch(_e){}
}
function installVersionGuard(){
  if(window.__DG90_VERSION_GUARD)return;
  window.__DG90_VERSION_GUARD=true;
  const targets=[];
  const title=document.querySelector('title');if(title)targets.push(title);
  const login=document.querySelector('#loginScreen .center.muted.small');if(login)targets.push(login);
  const hero=document.querySelector('#mainScreen .hero .head-row strong');if(hero)targets.push(hero);
  if(!targets.length)return;
  const mo=new MutationObserver(function(){
    const wantedTitle='DG Zeiterfassung '+VERSION;
    const wantedLogin='Version '+VERSION;
    const wantedHero='Zeiterfassung - '+VERSION;
    if(document.title!==wantedTitle)document.title=wantedTitle;
    if(login&&login.textContent!==wantedLogin)login.textContent=wantedLogin;
    if(hero&&hero.textContent!==wantedHero)hero.textContent=wantedHero;
    try{window.DG_APP_VERSION=VERSION;window.DG_RELEASE=VERSION;if(window.DG3)DG3.version=VERSION;}catch(_e){}
  });
  targets.forEach(t=>mo.observe(t,{subtree:true,childList:true,characterData:true}));
}
async function direct(payload,timeoutMs){
  const ctl=new AbortController();
  const timer=setTimeout(()=>ctl.abort(),timeoutMs||30000);
  try{
    const r=await fetch(BACKEND,{
      method:'POST',
      headers:{'Content-Type':'text/plain;charset=utf-8'},
      body:JSON.stringify(Object.assign({},payload,{clientVersion:VERSION})),
      signal:ctl.signal,
      cache:'no-store'
    });
    if(!r.ok)throw new Error('HTTP '+r.status);
    const txt=await r.text();
    let j;try{j=JSON.parse(txt);}catch(_e){throw new Error('Ungültige Backend-Antwort.');}
    if(!j.ok)throw new Error(j.error||'Serverfehler.');
    return j.data!==undefined?j.data:j;
  }catch(e){
    if(e&&e.name==='AbortError')throw new Error('Zeitüberschreitung beim Google-Backend.');
    throw e;
  }finally{clearTimeout(timer);}
}
function renderEmployees(rows){
  const sel=el('loginEmployee');
  if(!sel||!Array.isArray(rows)||!rows.length)return false;
  sel.innerHTML='<option value="">Bitte auswählen</option>'+rows.map(n=>'<option value="'+esc(n)+'">'+esc(n)+'</option>').join('');
  const current=localStorage.getItem('dg_employee')||'';
  if(current&&rows.includes(current))sel.value=current;
  try{
    localStorage.setItem(EMP_CACHE,JSON.stringify({ts:Date.now(),rows:rows}));
    if(typeof window.employeeDirectory!=='undefined')window.employeeDirectory=rows.slice();
  }catch(_e){}
  return true;
}
function renderCachedEmployees(){
  try{
    const c=JSON.parse(localStorage.getItem(EMP_CACHE)||'null');
    if(c&&Array.isArray(c.rows)&&c.rows.length&&Date.now()-Number(c.ts||0)<86400000){
      return renderEmployees(c.rows);
    }
  }catch(_e){}
  return false;
}
async function loadEmployees(){
  renderCachedEmployees();
  try{
    const rows=await direct({action:'getEmployees'},30000);
    if(!renderEmployees(rows))throw new Error('Keine aktiven Mitarbeiter erhalten.');
    status('','');
    return rows;
  }catch(e){
    const sel=el('loginEmployee');
    if(sel&&sel.options.length<=1)sel.innerHTML='<option value="">Mitarbeiter konnten nicht geladen werden</option>';
    status('Mitarbeiter konnten nicht geladen werden: '+(e&&e.message?e.message:e),'error');
    throw e;
  }
}
function startCoreOnce(){
  if(window.__DG_CORE_STARTED)return true;
  const fn=typeof window.d3Startup==='function'?window.d3Startup:null;
  if(!fn)return false;
  try{fn();return !!window.__DG_CORE_STARTED;}catch(e){
    console.error('DG 9.0 Core-Start',e);
    status('App-Start fehlgeschlagen: '+(e&&e.message?e.message:e),'error');
    return false;
  }
}
function enterMain(){
  startCoreOnce();
  const fn=typeof window.openMain==='function'?window.openMain:null;
  if(!fn){
    status('Hauptansicht wurde nicht geladen. Bitte App neu öffnen.','error');
    return false;
  }
  try{
    fn();
    el('mainScreen')?.classList.remove('hidden');
    el('loginScreen')?.classList.add('hidden');
    return true;
  }catch(e){
    status('App-Start nach Anmeldung fehlgeschlagen: '+(e&&e.message?e.message:e),'error');
    return false;
  }
}
async function login(){
  const sel=el('loginEmployee'),pinEl=el('loginPin');
  const employee=String(sel&&sel.value||'').trim();
  const pin=String(pinEl&&pinEl.value||'').trim();
  if(!employee){status('Bitte Mitarbeiter auswählen.','error');return false;}
  if(!pin){status('Bitte PIN eingeben.','error');return false;}
  status('Anmeldung wird geprüft ...','info');
  try{
    const res=await direct({action:'employeeLogin',employee:employee,pin:pin,createDeviceSession:true},30000);
    localStorage.setItem('dg_employee',res.employee||employee);
    localStorage.setItem('dg_chef_access',res.chefAccess?'1':'0');
    if(res.deviceSessionToken)localStorage.setItem('dg_device_session',res.deviceSessionToken);
    sessionStorage.setItem('dg_employee_pin',pin);
    localStorage.removeItem('dg_employee_pin');
    if(pinEl)pinEl.value='';
    status('','');
    return enterMain();
  }catch(e){
    status('Anmeldung fehlgeschlagen: '+(e&&e.message?e.message:e),'error');
    return false;
  }
}
function bind(){
  const btn=[...document.querySelectorAll('#loginScreen button')].find(b=>/Anmelden/i.test(b.textContent||''));
  if(btn&&!btn.dataset.dg90Launcher){
    btn.dataset.dg90Launcher='1';
    btn.removeAttribute('onclick');
    btn.addEventListener('click',function(e){e.preventDefault();e.stopImmediatePropagation();login();},true);
  }
  const pin=el('loginPin');
  if(pin&&!pin.dataset.dg90Launcher){
    pin.dataset.dg90Launcher='1';
    pin.addEventListener('keydown',function(e){
      if(e.key==='Enter'){e.preventDefault();e.stopImmediatePropagation();login();}
    },true);
  }
}
async function boot(){
  if(window[START_FLAG])return;
  window[START_FLAG]=true;
  stamp();
  installVersionGuard();
  bind();
  startCoreOnce();
  try{await loadEmployees();}catch(_e){}
  // vorhandene Sitzung nur dann direkt weiterverwenden, wenn der Core bereit ist.
  const employee=localStorage.getItem('dg_employee')||'';
  const pin=sessionStorage.getItem('dg_employee_pin')||'';
  const token=localStorage.getItem('dg_device_session')||'';
  if(employee&&(pin||token))enterMain();
  document.documentElement.dataset.dgLauncher='9.0';
}

window.dg90Login=login;
window.dg90LoadEmployees=loadEmployees;

if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});
else setTimeout(boot,0);
})();
