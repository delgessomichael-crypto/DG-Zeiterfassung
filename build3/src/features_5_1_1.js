/* DG 5.1.1: Mitarbeiter bleibt auf diesem Gerät angemeldet, bis er sich selbst abmeldet. */
(function(){
'use strict';
const V511='5.1.1',TOKEN_KEY='dg_device_session';

function deviceToken511(){return localStorage.getItem(TOKEN_KEY)||'';}

/* Bestehende API-Aufrufe benutzen statt des PINs den vom Backend ausgestellten, widerrufbaren Geräte-Token. */
window.auth=auth=function(){
  return {
    employee:localStorage.getItem('dg_employee')||'',
    pin:deviceToken511()||sessionStorage.getItem('dg_employee_pin')||''
  };
};

window.loginEmployee=loginEmployee=async function(){
  const employee=$('loginEmployee').value,pin=$('loginPin').value;
  if(!employee){setMessage('loginStatus','Bitte Mitarbeiter auswählen.','error');return;}
  if(!pin){setMessage('loginStatus','Bitte PIN eingeben.','error');return;}
  if(!navigator.onLine){setMessage('loginStatus','Die erste Anmeldung muss online erfolgen.','error');return;}
  try{
    setMessage('loginStatus','Anmeldung wird geprüft ...','info');
    const res=await api({action:'employeeLogin',employee:employee,pin:pin,createDeviceSession:true});
    if(!res||!res.deviceSessionToken)throw new Error('Geräte-Anmeldung konnte nicht erstellt werden. Bitte Backend 5.1.1 prüfen.');
    localStorage.setItem('dg_employee',res.employee||employee);
    localStorage.setItem(TOKEN_KEY,res.deviceSessionToken);
    sessionStorage.removeItem('dg_employee_pin');
    localStorage.removeItem('dg_employee_pin');
    localStorage.setItem('dg_chef_access',res.chefAccess?'1':'0');
    $('loginPin').value='';
    openMain();
  }catch(e){setMessage('loginStatus',e.message,'error');}
};

window.logout=logout=function(){
  const employee=localStorage.getItem('dg_employee')||'',token=deviceToken511();
  /* Oberfläche sofort abmelden. Der Server-Token wird im Hintergrund widerrufen. */
  localStorage.removeItem('dg_employee');
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem('dg_chef_access');
  localStorage.removeItem('dg_employee_pin');
  sessionStorage.removeItem('dg_employee_pin');
  try{sessionStorage.removeItem('dg51_backend');}catch(_e){}
  if($('mainScreen'))$('mainScreen').classList.add('hidden');
  if($('loginScreen'))$('loginScreen').classList.remove('hidden');
  if($('loginPin'))$('loginPin').value='';
  if(navigator.onLine&&employee&&token){
    fetch(API_URL,{method:'POST',headers:{'Content-Type':'text/plain;charset=utf-8'},body:JSON.stringify({action:'employeeLogout',employee:employee,deviceSessionToken:token,clientVersion:V511})}).catch(()=>{});
  }
};

/* Veraltete Sitzung automatisch zum Login zurückführen, statt den Mitarbeiter in einer defekten Ansicht zu lassen. */
const api511=window.api;
if(typeof api511==='function')window.api=api=async function(payload){
  try{return await api511.apply(this,arguments);}catch(e){
    const msg=String(e&&e.message||'');
    if(deviceToken511()&&/Sitzung.*ungültig|Sitzung.*abgemeldet|Mitarbeiter.*inaktiv|Anmeldung erforderlich/i.test(msg)){
      localStorage.removeItem(TOKEN_KEY);localStorage.removeItem('dg_employee');localStorage.removeItem('dg_chef_access');
      if($('mainScreen'))$('mainScreen').classList.add('hidden');if($('loginScreen'))$('loginScreen').classList.remove('hidden');
      setMessage('loginStatus','Die Anmeldung auf diesem Gerät wurde beendet. Bitte einmal neu anmelden.','warn');
    }
    throw e;
  }
};

/* Bereits eingeloggte 5.1-Nutzer einmalig im Hintergrund auf die dauerhafte Geräte-Session umstellen. */
async function migrateExistingLogin511(){
  if(deviceToken511()||!navigator.onLine)return;
  const employee=localStorage.getItem('dg_employee')||'',pin=sessionStorage.getItem('dg_employee_pin')||'';
  if(!employee||!pin)return;
  try{
    const res=await api({action:'employeeLogin',employee:employee,pin:pin,createDeviceSession:true});
    if(res&&res.deviceSessionToken){localStorage.setItem(TOKEN_KEY,res.deviceSessionToken);sessionStorage.removeItem('dg_employee_pin');localStorage.removeItem('dg_employee_pin');}
  }catch(_e){}
}
const openMain511=window.openMain;
if(typeof openMain511==='function')window.openMain=function(){const r=openMain511.apply(this,arguments);setTimeout(migrateExistingLogin511,0);return r;};

/* Backend 5.1.1 ist für die widerrufbare Geräte-Session erforderlich. */
window.d3CheckBackend=d3CheckBackend=async function(force){
  const cached=(()=>{try{return JSON.parse(sessionStorage.getItem('dg51_backend')||'null');}catch(_e){return null;}})();
  if(!force&&cached&&cached.version&&Date.now()-Number(cached.ts||0)<1800000&&/^5\.1(?:\.\d+)?$/.test(String(cached.version))){DG3.backend=cached.version;$('d3Notice')?.remove();return true;}
  try{
    const r=await api({action:'ping'}),found=String(r&&r.version||''),p=found.split('.').map(Number),ok=p[0]>5||(p[0]===5&&(p[1]>1||(p[1]===1&&(p[2]||0)>=1)));
    DG3.backend=ok?found:'';
    if(ok){try{sessionStorage.setItem('dg51_backend',JSON.stringify({ts:Date.now(),version:found}));}catch(_e){}$('d3Notice')?.remove();return true;}
    d3Notice('App 5.1.1 benötigt Google-GS 5.1.1 oder neuer. Gefunden: '+(found||'unbekannt')+'. Speichern ist gesperrt.','warn');return false;
  }catch(e){DG3.backend='';d3Notice('Verbindungsprüfung fehlgeschlagen: '+e.message,'warn');return false;}
};

try{DG3.version=V511;window.DG_APP_VERSION=V511;}catch(_e){}
})();
