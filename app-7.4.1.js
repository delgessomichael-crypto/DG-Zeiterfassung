/* DG 7.4.1 FINAL - einheitlicher sichtbarer Versionsstand */
(function(){
'use strict';
const V='7.4.1';
function stamp(){
  if(document.title!=='DG Zeiterfassung '+V)document.title='DG Zeiterfassung '+V;
  document.querySelectorAll('.login-card .muted.small').forEach(x=>{if(/^Version\s+/i.test((x.textContent||'').trim())&&x.textContent!=='Version '+V)x.textContent='Version '+V;});
  document.querySelectorAll('.hero strong').forEach(x=>{if(/Zeiterfassung/i.test(x.textContent||'')&&x.textContent!=='Zeiterfassung - '+V)x.textContent='Zeiterfassung - '+V;});
  try{window.DG_APP_VERSION=V;window.DG_RELEASE=V;if(window.DG3)DG3.version=V;}catch(_e){}
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',stamp,{once:true});else stamp();
})();

/* ===== CONSOLIDATED SOURCE: app-5.0.js ===== */
const API_URL='https://script.google.com/macros/s/AKfycby2L3SMgh2RoGWsNRUp6o11g4iyZ8bgkSIGaAZPnBXCkJTkDDGF9aydn9vVKMB7kXsO/exec';

let preparedPhotos=[],lastDayData={entries:[],total:0,closed:false},customerPad=null,employeePad=null,noCustomerPresent=false,employeeDirectory=[],cameraStream=null,selectedCalendarEventId='',bossFilter='all',bossDetailIndex=-1,bossDetailTab='overview';

const $=id=>document.getElementById(id);

const formatHours=v=>Number(v||0).toFixed(2).replace('.',',');

const esc=v=>String(v==null?'':v).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');

function localDate(){const d=new Date();return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0')}

function uid(){return 'pwa-'+Date.now()+'-'+Math.random().toString(36).slice(2)}

function auth(){return{employee:localStorage.getItem('dg_employee')||'',pin:sessionStorage.getItem('dg_employee_pin')||''}}

function canAccessBoss(){
  const employee=auth().employee;
  return localStorage.getItem('dg_chef_access')==='1';
}

function setMessage(id,msg,type='info'){if(id==='regieStatus'&&DG3.active==='Laufend')id='d3RunningStatus';const e=$(id);if(e){e.className='status '+type;e.textContent=msg;}}

function clearMessage(id){if(id==='regieStatus'&&DG3.active==='Laufend')id='d3RunningStatus';const e=$(id);if(e){e.className='';e.textContent='';}}

function updateConnection(){const online=navigator.onLine;setMessage('connectionBar',online?'🟢 Online':'🟠 Offline – Eingaben werden auf diesem Gerät gespeichert.',online?'ok':'warn');if($('loginNet'))setMessage('loginNet',online?'🟢 Online':'🟠 Offline',online?'ok':'warn');refreshQueueCount()}

window.addEventListener('online',async()=>{updateConnection();await syncQueue();await loadCalendarEvents()});

window.addEventListener('offline',updateConnection);

function dgError(message,type){const e=new Error(message);e.dgType=type;return e}

function api(payload){return d3Api(payload);}

function loginEnter(ev){if(ev&&ev.key==='Enter'){ev.preventDefault();ev.stopPropagation();loginEmployee();}}

async function loginEmployee(){const employee=$('loginEmployee').value,pin=$('loginPin').value;if(!employee){setMessage('loginStatus','Bitte Mitarbeiter auswählen.','error');return}if(!pin){setMessage('loginStatus','Bitte PIN eingeben.','error');return}if(!navigator.onLine){setMessage('loginStatus','Die erste Anmeldung muss online erfolgen.','error');return}try{setMessage('loginStatus','Anmeldung wird geprüft ...','info');const res=await api({action:'employeeLogin',employee,pin});localStorage.setItem('dg_employee',res.employee||employee);sessionStorage.setItem('dg_employee_pin',pin);localStorage.setItem('dg_chef_access',res.chefAccess?'1':'0');openMain()}catch(e){setMessage('loginStatus',e.message,'error')}}

function logout(){localStorage.removeItem('dg_employee');sessionStorage.removeItem('dg_employee_pin');localStorage.removeItem('dg_chef_access');$('mainScreen').classList.add('hidden');$('loginScreen').classList.remove('hidden');$('loginPin').value=''}

function openMain(){const a=auth();$('loginScreen').classList.add('hidden');$('mainScreen').classList.remove('hidden');$('employeeLabel').textContent='Angemeldet: '+a.employee;$('date').value=localDate();const bossAllowed=canAccessBoss();$('bossTab').classList.toggle('hidden',!bossAllowed);showEmployee();DG3.reports={};DG3.inquiries=[];DG3.orders=[];$('regieResult').replaceChildren();$('d3RunningList').replaceChildren();d3CheckBackend();loadEmployeeDirectory();requestAnimationFrame(()=>{if(customerPad)customerPad.resize();if(employeePad)employeePad.resize()});updateConnection();loadDay();loadCalendarEvents();setTimeout(d35InstallInspectionButton,0);}

function showEmployee(){$('employeeView').classList.remove('hidden');$('bossView').classList.add('hidden');$('employeeTab').classList.add('active');$('bossTab').classList.remove('active');setTimeout(d35InstallInspectionButton,0);}

function showBoss(){if(!canAccessBoss()){showEmployee();setMessage('entryStatus','Kein Zugriff auf Buero.','error');return;}$('employeeView').classList.add('hidden');$('bossView').classList.remove('hidden');$('employeeTab').classList.remove('active');$('bossTab').classList.add('active');if(navigator.onLine){d3CheckBackend();d3Dashboard();}}

async function loadEmployeeDirectory(){
  try{
    employeeDirectory=await api({action:'getEmployees'});
    const current=auth().employee;
    $('loginEmployee').innerHTML='<option value="">Bitte auswählen</option>'+employeeDirectory.map(x=>'<option>'+esc(x)+'</option>').join('');
    if(current&&employeeDirectory.includes(current))$('loginEmployee').value=current;
    fillAbsenceEmployees();
  }catch(e){ if($('loginEmployee'))$('loginEmployee').innerHTML='<option value="">Mitarbeiter konnten nicht geladen werden</option>'; }
}

function fillAbsenceEmployees(){const opts=(employeeDirectory||[]).map(x=>'<option>'+esc(x)+'</option>').join('');if($('absenceEmployee'))$('absenceEmployee').innerHTML=opts;if($('vacationEmployee'))$('vacationEmployee').innerHTML=opts}

function chefPayload(extra={}){const a=auth();return Object.assign({employee:a.employee,employeePin:a.pin},extra)}

async function loadChefAdministration(){
  try{
    const rows=await api(chefPayload({action:'getEmployeeAdminData'}));
    renderEmployeeAdminList(rows||[]);
    const abs=await api(chefPayload({action:'getAbsences'}));renderAbsenceList(abs||[]);
    await loadVacationAccountsUi();
    clearMessage('bossStatus');
  }catch(e){setMessage('bossStatus',e.message,'error')}
}

function renderEmployeeAdminList(rows){
  window.__employeeAdminRows=rows||[];
  filterEmployeeAdminOptions();
  if($('adminTimeBankEmployee')){
    const previousName=$('adminTimeBankEmployee').value;
    $('adminTimeBankEmployee').innerHTML='<option value="">Bitte Mitarbeiter wählen</option>'+window.__employeeAdminRows.map(x=>'<option value="'+esc(x.name)+'">'+esc(x.name)+(x.active?'':' (inaktiv)')+'</option>').join('');
    if(window.__employeeAdminRows.some(x=>x.name===previousName)) $('adminTimeBankEmployee').value=previousName;
  }
}

function filterEmployeeAdminOptions(){
  if(!$('adminEmployeeSelect'))return;
  const previous=$('adminEmployeeSelect').value;
  const q=String($('adminEmployeeSearch')?$('adminEmployeeSearch').value:'').trim().toLowerCase();
  const options=(window.__employeeAdminRows||[]).map((x,i)=>({x,i})).filter(o=>{
    if(!q)return true;
    const x=o.x;
    return [x.name,x.firstName,x.lastName,x.personnelNumber].some(v=>String(v||'').toLowerCase().includes(q));
  });
  $('adminEmployeeSelect').innerHTML='<option value="">Bitte Mitarbeiter wählen</option>'+options.map(o=>'<option value="'+o.i+'">'+esc(o.x.name)+(o.x.personnelNumber?' · PN '+esc(o.x.personnelNumber):'')+(o.x.active?'':' (inaktiv)')+'</option>').join('');
  if(previous!=='' && options.some(o=>String(o.i)===String(previous))) $('adminEmployeeSelect').value=previous;
}

function parseHoursInput(v){const s=String(v==null?'':v).trim().replace(',','.');if(!s)return 0;const n=Number(s);return Number.isFinite(n)?n:NaN}

function formatInputHours(v){return Number(v||0).toFixed(2).replace('.',',')}

function loadSelectedEmployeeAdmin(){const v=$('adminEmployeeSelect').value;if(v==='')return;editEmployeeAdmin(Number(v))}

function setAdminValue(id,value){if($(id))$(id).value=value||''}

function editEmployeeAdmin(i){
  const x=(window.__employeeAdminRows||[])[i];if(!x)return;
  $('adminOriginalName').value=x.name;$('adminOriginalActive').value=x.active?'1':'0';
  setAdminValue('adminName',x.name);setAdminValue('adminPersonnelNumber',x.personnelNumber);setAdminValue('adminLastName',x.lastName);setAdminValue('adminFirstName',x.firstName);setAdminValue('adminBirthDate',x.birthDate);$('adminPin').value='';
  setAdminValue('adminEntryDate',x.entryDate);setAdminValue('adminExitDate',x.exitDate);setAdminValue('adminStreet',x.street);setAdminValue('adminPostalCode',x.postalCode);setAdminValue('adminCity',x.city);setAdminValue('adminPhone',x.phone);setAdminValue('adminMobile',x.mobile);setAdminValue('adminEmail',x.email);
  setAdminValue('adminCalendarId',x.calendarId);$('adminEmploymentType').value=x.employmentType||'Vollzeit';$('adminWeeklyHours').value=formatInputHours(x.weeklyHours);$('adminMon').value=formatInputHours(x.monday);$('adminTue').value=formatInputHours(x.tuesday);$('adminWed').value=formatInputHours(x.wednesday);$('adminThu').value=formatInputHours(x.thursday);$('adminFri').value=formatInputHours(x.friday);$('adminHolidayCredit').checked=Boolean(x.holidayCredit);$('adminChefAccess').checked=Boolean(x.chefAccess);
  setAdminValue('adminHealthInsurance',x.healthInsurance);setAdminValue('adminHealthInsuranceNumber',x.healthInsuranceNumber);setAdminValue('adminSocialSecurityNumber',x.socialSecurityNumber);setAdminValue('adminTaxId',x.taxId);setAdminValue('adminBank',x.bank);setAdminValue('adminIban',x.iban);$('adminPaymentMethod').value=x.paymentMethod||'Überweisung';setAdminValue('adminEmergencyContactName',x.emergencyContactName);setAdminValue('adminEmergencyContactPhone',x.emergencyContactPhone);setAdminValue('adminDrivingLicence',x.drivingLicence);setAdminValue('adminNotes',x.notes);paymentMethodChanged();
  if($('adminEmployeeSelect'))$('adminEmployeeSelect').value=String(i);if($('adminTimeBankEmployee'))$('adminTimeBankEmployee').value=x.name;
  if($('adminActiveState')){$('adminActiveState').textContent=x.active?'Status: Aktiv':'Status: Inaktiv';$('adminActiveState').className='status '+(x.active?'ok':'warn')}
  if($('adminDeactivateBtn')){$('adminDeactivateBtn').classList.remove('hidden');$('adminDeactivateBtn').disabled=!x.active;$('adminDeactivateBtn').style.opacity=x.active?'1':'.45'}
  if($('adminActivateBtn')){$('adminActivateBtn').classList.remove('hidden');$('adminActivateBtn').disabled=!!x.active;$('adminActivateBtn').style.opacity=x.active?'.45':'1'}
  if($('adminDeleteBtn'))$('adminDeleteBtn').classList.remove('hidden');updateHoursSum();if($('adminTimeBankBalance'))$('adminTimeBankBalance').textContent='Zeitguthaben: '+formatHours(x.timeBankBalance||0)+' Std.';loadTimeBankAdmin(x.name);$('adminName').scrollIntoView({behavior:'smooth',block:'center'});
}

function clearEmployeeAdminForm(){
  $('adminOriginalName').value='';$('adminOriginalActive').value='1';if($('adminEmployeeSelect'))$('adminEmployeeSelect').value='';if($('adminEmployeeSearch'))$('adminEmployeeSearch').value='';if($('adminTimeBankEmployee'))$('adminTimeBankEmployee').value='';
  ['adminName','adminPersonnelNumber','adminLastName','adminFirstName','adminBirthDate','adminEntryDate','adminExitDate','adminStreet','adminPostalCode','adminCity','adminPhone','adminMobile','adminEmail','adminCalendarId','adminHealthInsurance','adminHealthInsuranceNumber','adminSocialSecurityNumber','adminTaxId','adminBank','adminIban','adminEmergencyContactName','adminEmergencyContactPhone','adminDrivingLicence','adminNotes'].forEach(id=>setAdminValue(id,''));
  $('adminPin').value='';$('adminEmploymentType').value='Vollzeit';$('adminPaymentMethod').value='Überweisung';$('adminWeeklyHours').value='';['adminMon','adminTue','adminWed','adminThu','adminFri'].forEach(id=>$(id).value='');$('adminHolidayCredit').checked=true;$('adminChefAccess').checked=false;paymentMethodChanged();filterEmployeeAdminOptions();
  if($('adminActiveState')){$('adminActiveState').textContent='Neuer Mitarbeiter';$('adminActiveState').className='status info'}if($('adminDeactivateBtn'))$('adminDeactivateBtn').classList.add('hidden');if($('adminActivateBtn'))$('adminActivateBtn').classList.add('hidden');if($('adminDeleteBtn'))$('adminDeleteBtn').classList.add('hidden');updateHoursSum();if($('adminTimeBankBalance'))$('adminTimeBankBalance').textContent='Zeitguthaben: 0,00 Std.';if($('timeBankHistory'))$('timeBankHistory').innerHTML='';if($('adminTimeBankHours'))$('adminTimeBankHours').value='';if($('adminTimeBankReason'))$('adminTimeBankReason').value='';clearMessage('employeeAdminStatus');
}

function updateHoursSum(){const vals=['adminMon','adminTue','adminWed','adminThu','adminFri'].map(id=>parseHoursInput($(id).value));const valid=vals.every(Number.isFinite);const sum=valid?vals.reduce((a,b)=>a+b,0):0;if($('adminHoursSum'))$('adminHoursSum').textContent=valid?'Summe Mo–Fr: '+formatHours(sum)+' Std.':'Bitte Stundenwerte prüfen.';return valid?sum:NaN}

function updateWeeklyHoursFromDays(){const sum=updateHoursSum();if(Number.isFinite(sum))$('adminWeeklyHours').value=formatInputHours(sum)}

function distributeWeeklyHours(){const w=parseHoursInput($('adminWeeklyHours').value);if(!Number.isFinite(w)||w<0||w>60){setMessage('employeeAdminStatus','Bitte gültige Wochenstunden zwischen 0 und 60 eingeben.','error');return}const d=Math.round((w/5)*100)/100;['adminMon','adminTue','adminWed','adminThu','adminFri'].forEach(id=>$(id).value=formatInputHours(d));updateHoursSum();clearMessage('employeeAdminStatus')}

function employmentTypeChanged(){if(['Aushilfe','Minijob'].includes($('adminEmploymentType').value))$('adminHolidayCredit').checked=false}

function paymentMethodChanged(){if($('adminBankFields'))$('adminBankFields').classList.toggle('hidden',$('adminPaymentMethod').value==='Bar')}

async function saveEmployeeAdminUi(){
  const dayIds=['adminMon','adminTue','adminWed','adminThu','adminFri'];const dayVals=dayIds.map(id=>parseHoursInput($(id).value));let weekly=parseHoursInput($('adminWeeklyHours').value);
  if(!Number.isFinite(weekly)||weekly<0||weekly>60){setMessage('employeeAdminStatus','Wochenstunden sind ungültig. Erlaubt: 0 bis 60 Std.','error');return}
  if(dayVals.some(v=>!Number.isFinite(v)||v<0||v>24)){setMessage('employeeAdminStatus','Bitte die Sollstunden Montag bis Freitag prüfen. Erlaubt sind 0 bis 24 Std. je Tag.','error');return}
  if(dayVals.every(v=>v===0)&&weekly>0){const d=Math.round((weekly/5)*100)/100;dayVals.fill(d);dayIds.forEach((id,i)=>$(id).value=formatInputHours(dayVals[i]))}
  const daySum=Math.round(dayVals.reduce((a,b)=>a+b,0)*100)/100;weekly=daySum;$('adminWeeklyHours').value=formatInputHours(weekly);updateHoursSum();
  const item={originalName:$('adminOriginalName').value.trim(),name:$('adminName').value.trim(),pin:$('adminPin').value.trim(),calendarId:$('adminCalendarId').value.trim(),employmentType:$('adminEmploymentType').value,weeklyHours:weekly,monday:dayVals[0],tuesday:dayVals[1],wednesday:dayVals[2],thursday:dayVals[3],friday:dayVals[4],holidayCredit:$('adminHolidayCredit').checked,chefAccess:$('adminChefAccess').checked,active:$('adminOriginalActive').value!=='0',lastName:$('adminLastName').value.trim(),firstName:$('adminFirstName').value.trim(),birthDate:$('adminBirthDate').value,personnelNumber:$('adminPersonnelNumber').value.trim(),street:$('adminStreet').value.trim(),postalCode:$('adminPostalCode').value.trim(),city:$('adminCity').value.trim(),phone:$('adminPhone').value.trim(),mobile:$('adminMobile').value.trim(),email:$('adminEmail').value.trim(),healthInsurance:$('adminHealthInsurance').value.trim(),healthInsuranceNumber:$('adminHealthInsuranceNumber').value.trim(),socialSecurityNumber:$('adminSocialSecurityNumber').value.trim(),taxId:$('adminTaxId').value.trim(),bank:$('adminBank').value.trim(),iban:$('adminIban').value.trim(),entryDate:$('adminEntryDate').value,exitDate:$('adminExitDate').value,paymentMethod:$('adminPaymentMethod').value,emergencyContactName:$('adminEmergencyContactName').value.trim(),emergencyContactPhone:$('adminEmergencyContactPhone').value.trim(),drivingLicence:$('adminDrivingLicence').value.trim(),notes:$('adminNotes').value.trim(),hourlyWage:parseHoursInput($('adminHourlyWage')?.value||'0')};
  if(!item.name){setMessage('employeeAdminStatus','Bitte einen Anzeigenamen eintragen oder bestehenden Mitarbeiter auswählen.','error');return}
  if(!$('adminOriginalName').value&&!item.pin){setMessage('employeeAdminStatus','Für einen neuen Mitarbeiter bitte PIN eingeben.','error');return}
  if($('adminOriginalName').value&&$('adminOriginalName').value!==item.name){setMessage('employeeAdminStatus','Den Anzeigenamen eines bestehenden Mitarbeiters bitte nicht ändern. Neu anlegen und alten deaktivieren.','warn');return}
  try{setMessage('employeeAdminStatus','Mitarbeiter wird gespeichert ...','info');const res=await api(chefPayload({action:'saveEmployeeAdmin',item}));renderEmployeeAdminList(res.employees||[]);await loadEmployeeDirectory();setMessage('employeeAdminStatus','✅ Stammdaten gespeichert: '+item.name,'ok');const idx=(window.__employeeAdminRows||[]).findIndex(x=>x.name===item.name);if(idx>=0)editEmployeeAdmin(idx)}catch(e){setMessage('employeeAdminStatus','Speichern nicht möglich: '+e.message,'error')}
}

async function toggleEmployeeActiveUi(name,active){if(!confirm((active?'Mitarbeiter aktivieren: ':'Mitarbeiter deaktivieren: ')+name+'?'))return;try{await api(chefPayload({action:'setEmployeeActive',targetName:name,active}));await loadChefAdministration();await loadEmployeeDirectory()}catch(e){setMessage('employeeAdminStatus',e.message,'error')}}

async function toggleSelectedEmployeeActiveUi(){const name=$('adminOriginalName').value;if(!name)return;const active=$('adminOriginalActive').value==='0';await toggleEmployeeActiveUi(name,active);const idx=(window.__employeeAdminRows||[]).findIndex(x=>x.name===name);if(idx>=0)editEmployeeAdmin(idx)}

async function setSelectedEmployeeActiveUi(active){const current=$('adminOriginalActive').value==='1';if(current===active)return;await toggleSelectedEmployeeActiveUi()}

async function deleteSelectedEmployeeUi(){
  const name=$('adminOriginalName').value;if(!name)return;
  if(!confirm('Mitarbeiter wirklich löschen: '+name+'?\n\nDie Mitarbeiter-Anmeldung wird entfernt. Historische Zeit- und Urlaubsdaten bleiben erhalten.'))return;
  const confirmationPin=prompt('Zur Sicherheit bitte deinen eigenen PIN erneut eingeben:');
  if(confirmationPin===null)return;
  if(!/^\d{4,10}$/.test(String(confirmationPin).trim())){setMessage('employeeAdminStatus','Bitte einen gültigen PIN eingeben.','error');return}
  try{
    setMessage('employeeAdminStatus','Mitarbeiter wird gelöscht ...','info');
    const res=await api(chefPayload({action:'deleteEmployeeAdmin',targetName:name,confirmationPin:String(confirmationPin).trim()}));
    clearEmployeeAdminForm();
    renderEmployeeAdminList(res.employees||[]);
    await loadEmployeeDirectory();fillAbsenceEmployees();
    setMessage('employeeAdminStatus','✅ '+name+' wurde aus der Mitarbeiterverwaltung gelöscht. Historische Daten bleiben erhalten.','ok');
  }catch(e){setMessage('employeeAdminStatus','Löschen nicht möglich: '+e.message,'error')}
}

function loadSelectedTimeBankEmployee(){const name=$('adminTimeBankEmployee')?$('adminTimeBankEmployee').value:'';if(!name){if($('adminTimeBankBalance'))$('adminTimeBankBalance').textContent='Zeitguthaben: 0,00 Std.';if($('timeBankHistory'))$('timeBankHistory').innerHTML='';return}loadTimeBankAdmin(name)}

async function loadTimeBankAdmin(name){if(!name||!navigator.onLine)return;try{const x=await api(chefPayload({action:'getTimeBankAccount',targetEmployee:name}));if($('adminTimeBankBalance'))$('adminTimeBankBalance').textContent='Zeitguthaben: '+formatHours(x.balance||0)+' Std.';if($('timeBankHistory'))$('timeBankHistory').innerHTML=(x.transactions||[]).slice(0,12).map(t=>'<div class="entry"><strong>'+(Number(t.hours)>0?'+':'')+formatHours(t.hours)+' Std. · '+esc(t.art)+'</strong><br><span class="muted small">'+esc(t.reason||'')+' · '+esc(t.createdAt||'')+' · '+esc(t.createdBy||'')+'</span></div>').join('')||'<div class="muted small">Noch keine Buchungen.</div>'}catch(e){setMessage('timeBankAdminStatus',e.message,'error')}}

async function saveTimeBankManualUi(action){const name=($('adminTimeBankEmployee')&&$('adminTimeBankEmployee').value)||$('adminOriginalName').value||$('adminName').value.trim(),hours=parseHoursInput($('adminTimeBankHours').value),reason=$('adminTimeBankReason').value.trim();if(!name){setMessage('timeBankAdminStatus','Bitte zuerst einen bestehenden Mitarbeiter auswählen.','error');return}if(!(hours>0)){setMessage('timeBankAdminStatus','Bitte gültige Stunden eingeben.','error');return}if(!reason){setMessage('timeBankAdminStatus','Bitte einen Grund eintragen.','error');return}try{const r=await api(chefPayload({action:'saveTimeBankManual',targetEmployee:name,hours,timeBankAction:action,reason}));setMessage('timeBankAdminStatus','✅ Gebucht. Neues Zeitguthaben: '+formatHours(r.balanceAfter)+' Std.','ok');$('adminTimeBankHours').value='';$('adminTimeBankReason').value='';await loadTimeBankAdmin(name);const row=(window.__employeeAdminRows||[]).find(x=>x.name===name);if(row)row.timeBankBalance=r.balanceAfter}catch(e){setMessage('timeBankAdminStatus',e.message,'error')}}

async function saveAbsenceUi(){const target=$('absenceEmployee').value,type=$('absenceType').value,startDate=$('absenceStart').value,endDate=$('absenceEnd').value;if(!target||!startDate||!endDate){setMessage('absenceStatus','Bitte Mitarbeiter und Zeitraum auswählen.','error');return}try{const r=await api(chefPayload({action:'saveAbsence',targetEmployee:target,type,startDate,endDate}));setMessage('absenceStatus','✅ '+type+' eingetragen: '+r.days+' Arbeitstag(e) · '+formatHours(r.creditedHours||0)+' Std. Gutschrift.'+(type==='Freizeitausgleich'?' Zeitguthaben danach: '+formatHours(r.timeBankBalance)+' Std.':''),'ok');const abs=await api(chefPayload({action:'getAbsences'}));renderAbsenceList(abs||[])}catch(e){setMessage('absenceStatus',e.message,'error')}}

function renderAbsenceList(rows){$('absenceList').innerHTML=(rows||[]).map(x=>`<div class="entry"><strong>${esc(x.employee)}</strong> · ${esc(x.type)}<br><span class="muted">${formatDateDE(x.start)} bis ${formatDateDE(x.end)} · ${formatHours(x.creditedHours||0)} Std.</span><br><button class="btn danger" style="margin-top:8px" data-id="${esc(x.id)}" onclick="return deleteAbsenceUi(this.dataset.id)">Eintrag löschen</button></div>`).join('')||'<div class="muted">Keine geplanten Abwesenheiten.</div>'}

async function deleteAbsenceUi(id){if(!confirm('Abwesenheit wirklich löschen?'))return;try{await api(chefPayload({action:'deleteAbsence',id}));const abs=await api(chefPayload({action:'getAbsences'}));renderAbsenceList(abs||[]);setMessage('absenceStatus','Abwesenheit gelöscht.','ok')}catch(e){setMessage('absenceStatus',e.message,'error')}}

async function syncHolidaysUi(){try{const y=Number($('holidayYear').value);await api(chefPayload({action:'syncHolidays',year:y}));setMessage('holidayStatus','✅ Feiertage für '+y+' aktualisiert.','ok')}catch(e){setMessage('holidayStatus',e.message,'error')}}

async function loadVacationAccountUi(){
  if(!$('vacationEmployee')||!$('vacationEmployee').value||!$('vacationYear').value)return;
  try{
    const x=await api(chefPayload({action:'getVacationAccount',targetEmployee:$('vacationEmployee').value,year:Number($('vacationYear').value)}));
    $('vacationEntitlement').value=Number(x.vacationEntitlement||0)||'';
    $('vacationAccountResult').innerHTML='<div class="entry"><strong>'+esc(x.employee)+' · '+x.year+'</strong><br>Urlaub zustehend: <span class="vac-green">'+formatHours(x.vacationEntitlement)+' Tage</span> · Urlaub genommen: <span class="vac-red">'+Number(x.vacationUsed||0)+' Tage</span> · Rest: <span class="vac-green">'+formatHours(x.vacationRemaining)+' Tage</span> · Krank: <span class="vac-red">'+Number(x.sickDays||0)+' Tage</span></div>';
    clearMessage('vacationStatus');
  }catch(e){setMessage('vacationStatus',e.message,'error')}
}

async function saveVacationEntitlementUi(){
  const target=$('vacationEmployee').value,year=Number($('vacationYear').value),entitlement=Number($('vacationEntitlement').value);
  if(!target||!year||!(entitlement>=0)){setMessage('vacationStatus','Bitte Mitarbeiter, Jahr und Urlaubsanspruch eintragen.','error');return}
  try{const x=await api(chefPayload({action:'saveVacationEntitlement',targetEmployee:target,year,entitlement}));setMessage('vacationStatus','✅ Urlaubsanspruch gespeichert.','ok');await loadVacationAccountUi();await loadVacationAccountsUi()}catch(e){setMessage('vacationStatus',e.message,'error')}
}

async function loadVacationAccountsUi(){
  if(!$('vacationYear')||!$('vacationYear').value)return;
  try{const rows=await api(chefPayload({action:'getVacationAccounts',year:Number($('vacationYear').value)}));$('vacationAccountsList').innerHTML=(rows||[]).map(x=>'<div class="entry"><strong>'+esc(x.employee)+'</strong>'+(!x.active?' <span class="badge">inaktiv</span>':'')+'<br>Urlaub zustehend: <span class="vac-green">'+formatHours(x.vacationEntitlement)+' Tage</span> · Urlaub genommen: <span class="vac-red">'+Number(x.vacationUsed||0)+' Tage</span> · Rest: <span class="vac-green">'+formatHours(x.vacationRemaining)+' Tage</span> · Krank: <span class="vac-red">'+Number(x.sickDays||0)+' Tage</span></div>').join('')||'<div class="muted">Keine Daten.</div>'}catch(e){setMessage('vacationStatus',e.message,'error')}
}

function applyDayStatus(status){status=status||'Arbeiten';const blocked=status!=='Arbeiten'&&!canAccessBoss();$('workEntryCard').classList.toggle('hidden',blocked);$('dayCloseCard').classList.toggle('hidden',blocked);if(status!=='Arbeiten')setMessage('dayStatusMessage','Dieser Tag ist als '+status+' erfasst. Verwaltung durch das Buero.'+(lastDayData.creditedHours?' Gutschrift: '+formatHours(lastDayData.creditedHours)+' Std.':''),'info');else clearMessage('dayStatusMessage');}

function formatDateDE(value){
  const p=String(value||'').split('-');
  return p.length===3?p[2]+'.'+p[1]+'.'+p[0]:String(value||'');
}

async function loadCalendarEvents(){
  const a=auth();
  if(!a.employee||!a.pin)return;

  if(!navigator.onLine){
    const cached=localStorage.getItem('dg_calendar_'+a.employee);
    if(cached){
      renderCalendarEvents(JSON.parse(cached));
      setMessage('calendarStatus','🟠 Offline – zuletzt geladene Termine werden angezeigt.','warn');
    }else{
      setMessage('calendarStatus','🟠 Offline – Termine wurden auf diesem Gerät noch nicht geladen.','warn');
      $('calendarEvents').innerHTML='<div class="muted">Keine zwischengespeicherten Termine vorhanden.</div>';
    }
    return;
  }

  try{
    setMessage('calendarStatus','Termine werden geladen ...','info');
    const events=await api({
      action:'getEmployeeCalendarEvents',
      employee:a.employee,
      pin:a.pin,
      startDate:localDate(),
      days:3
    });
    if(auth().employee!==a.employee)return;localStorage.setItem('dg_calendar_'+a.employee,JSON.stringify(events||[]));
    renderCalendarEvents(events||[]);
    clearMessage('calendarStatus');
  }catch(e){
    setMessage('calendarStatus',e.message,'error');
  }
}

function renderCalendarEvents(events){
  if(!events.length){
    $('calendarEvents').innerHTML='<div class="muted">Keine Termine für heute, morgen oder übermorgen.</div>';
    return;
  }

  $('calendarEvents').innerHTML=events.map((event,index)=>{
    const location=event.location?'<br><span class="muted">📍 '+esc(event.location)+'</span>':'';
    const description=event.description?'<br><span class="muted">'+esc(event.description)+'</span>':'';
    const time=event.allDay?'Ganztägig':esc(event.startTime)+' - '+esc(event.endTime);

    return `<div class="entry">
      <strong>${formatDateDE(event.startDate)} · ${time}</strong><br>
      <strong>${esc(event.title||'Termin')}</strong>
      ${location}
      ${description}
      <div class="button-row" style="margin-top:8px">
        <button class="btn primary" data-index="${index}" onclick="return takeCalendarEvent(Number(this.dataset.index))">Auftrag übernehmen</button>
        ${event.location?`<button class="btn secondary" data-location="${esc(event.location)}" onclick="return openNavigation(this.dataset.location)">Navigation</button>`:''}
      </div>
    </div>`;
  }).join('');

  window.__dgCalendarEvents=events;
}

function takeCalendarEvent(index){
  const events=window.__dgCalendarEvents||[];
  const event=events[index];
  if(!event)return;
  selectedCalendarEventId=event.id||'';

  $('date').value=event.startDate||localDate();

  let customer=event.title||'';
  if(event.location){
    customer+=(customer?' - ':'')+event.location;
  }
  $('customer').value=customer;

  if(!$('activity').value.trim()&&event.description){
    $('activity').value=event.description;
  }

  showEmployee();
  $('customer').scrollIntoView({behavior:'smooth',block:'center'});
  setMessage('entryStatus','✅ Termin übernommen. Tatsächliche Von/Bis-Zeit bitte beim Einsatz eintragen.','ok');
  loadDay();
}

function openNavigation(location){
  if(!location)return;
  window.open('https://www.google.com/maps/search/?api=1&query='+encodeURIComponent(location),'_blank');
}

function parseTimeMinutes(value){const m=String(value||'').trim().match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);if(!m)return null;const h=Number(m[1]),min=Number(m[2]);if(h<0||h>23||min<0||min>59)return null;return h*60+min}

function normalizeTimeInput(value){const mins=parseTimeMinutes(value);if(mins===null)return '';return String(Math.floor(mins/60)).padStart(2,'0')+':'+String(mins%60).padStart(2,'0')}

function timeInputMinutes(id){const el=$(id);if(!el)return null;const n=Number(el.valueAsNumber);if(Number.isFinite(n)&&n>=0)return Math.round(n/60000);return parseTimeMinutes(el.value)}

function calculateHours(){
  const startEl=$('start'),endEl=$('end'),hoursEl=$('hours');if(!startEl||!endEl||!hoursEl)return 0;
  const s=typeof normalizeTimeInput==='function'?normalizeTimeInput(startEl.value):startEl.value;
  const e=typeof normalizeTimeInput==='function'?normalizeTimeInput(endEl.value):endEl.value;
  if(!s||!e){hoursEl.value='';return 0}
  startEl.value=s;endEl.value=e;
  let sm=typeof parseTimeMinutes==='function'?parseTimeMinutes(s):null;
  let em=typeof parseTimeMinutes==='function'?parseTimeMinutes(e):null;
  if(sm===null||em===null||em===sm){hoursEl.value='';return 0}
  if(em<sm)em+=1440;
  const mins=em-sm,h=mins>0&&mins<1440?mins/60:0;
  hoursEl.value=h>0?h.toFixed(2):'';
  const status=$('entryStatus');if(h>0&&status&&status.textContent.includes('Termin übernommen. Tatsächliche Von/Bis-Zeit')&&typeof clearMessage==='function')clearMessage('entryStatus');
  return h;
}

function toggleMaterial(){const yes=document.querySelector('input[name="materialUsed"]:checked').value==='yes';$('materialBox').classList.toggle('hidden',!yes);if(!yes)$('material').value=''}

function togglePhotos(){const yes=document.querySelector('input[name="photosUsed"]:checked').value==='yes';$('photoBox').classList.toggle('hidden',!yes);if(!yes){stopCamera();clearPhotos()}}

function renderPhotoPreview(){const box=$('photoPreview');if(!box)return;box.innerHTML=preparedPhotos.map((p,i)=>'<div class="photo-preview-item"><img src="'+p.dataUrl+'" alt="Foto '+(i+1)+'"><button type="button" class="photo-preview-remove" onclick="return removePreparedPhoto('+i+')">×</button></div>').join('')}

function updatePhotoStatus(){if(!$('photoStatus'))return;$('photoStatus').textContent=preparedPhotos.length?preparedPhotos.length+' Bild(er) bereit. Bitte Vorschau kontrollieren.':'Noch keine Bilder hinzugefügt.';$('clearPhotosBtn')?.classList.toggle('hidden',preparedPhotos.length===0);renderPhotoPreview();}

function removePreparedPhoto(i){preparedPhotos.splice(i,1);updatePhotoStatus()}

function clearPhotos(){preparedPhotos=[];$('cameraPhoto').value='';$('galleryPhotos').value='';updatePhotoStatus()}

async function startCamera(){if(!navigator.mediaDevices||!navigator.mediaDevices.getUserMedia){$('cameraPhoto')?.click();return;}try{stopCamera();cameraStream=await navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:'environment'}},audio:false});$('cameraVideo').srcObject=cameraStream;$('cameraLive').classList.remove('hidden');}catch(_e){$('cameraPhoto')?.click();}}

function stopCamera(){if(cameraStream){cameraStream.getTracks().forEach(t=>t.stop());cameraStream=null}if($('cameraVideo'))$('cameraVideo').srcObject=null;if($('cameraLive'))$('cameraLive').classList.add('hidden')}

function captureCameraPhoto(){if(!cameraStream)return;const v=$('cameraVideo');if(!v.videoWidth||!v.videoHeight)return;const max=1200,f=Math.min(1,max/v.videoWidth,max/v.videoHeight),c=document.createElement('canvas');c.width=Math.round(v.videoWidth*f);c.height=Math.round(v.videoHeight*f);c.getContext('2d').drawImage(v,0,0,c.width,c.height);preparedPhotos.push({dataUrl:c.toDataURL('image/jpeg',0.68)});updatePhotoStatus();}

async function addPhotos(files,inputId){const list=Array.from(files||[]);if(!list.length)return;$('photoStatus').textContent='Bilder werden vorbereitet ...';try{for(const f of list)preparedPhotos.push({dataUrl:await resizeImage(f)});updatePhotoStatus();}catch(_e){$('photoStatus').textContent='Mindestens ein Bild konnte nicht vorbereitet werden.';}if($(inputId))$(inputId).value='';}

function resizeImage(file){return new Promise((resolve,reject)=>{const r=new FileReader();r.onerror=reject;r.onload=()=>{const img=new Image();img.onerror=reject;img.onload=()=>{const max=1200;let w=img.width,h=img.height;if(w>max||h>max){const f=Math.min(max/w,max/h);w=Math.round(w*f);h=Math.round(h*f)}const c=document.createElement('canvas');c.width=w;c.height=h;c.getContext('2d').drawImage(img,0,0,w,h);resolve(c.toDataURL('image/jpeg',0.68))};img.src=r.result};r.readAsDataURL(file)})}

function initPad(id){const canvas=$(id),ctx=canvas.getContext('2d'),wrap=$(id+'Wrap');let drawing=false,signed=false,active=false,lastTap=0;function setActive(v){active=!!v;if(wrap)wrap.classList.toggle('active',active)}function resize(){const ratio=devicePixelRatio||1,rect=canvas.getBoundingClientRect();canvas.width=Math.max(1,Math.round(rect.width*ratio));canvas.height=Math.round(180*ratio);ctx.setTransform(ratio,0,0,ratio,0,0);ctx.lineWidth=2;ctx.lineCap='round';ctx.strokeStyle='#111827'}function pt(ev){const r=canvas.getBoundingClientRect(),p=ev.touches?ev.touches[0]:ev;return{x:p.clientX-r.left,y:p.clientY-r.top}}function start(ev){if(!active)return;drawing=true;signed=true;const p=pt(ev);ctx.beginPath();ctx.moveTo(p.x,p.y);ev.preventDefault()}function move(ev){if(!drawing||!active)return;const p=pt(ev);ctx.lineTo(p.x,p.y);ctx.stroke();ev.preventDefault()}function end(ev){if(!drawing)return;drawing=false;if(ev)ev.preventDefault()}canvas.addEventListener('mousedown',start);canvas.addEventListener('mousemove',move);window.addEventListener('mouseup',end);canvas.addEventListener('touchstart',start,{passive:false});canvas.addEventListener('touchmove',move,{passive:false});canvas.addEventListener('touchend',end,{passive:false});if(wrap){const lock=wrap.querySelector('.signature-lock');const tap=ev=>{const now=Date.now();if(ev.type==='dblclick'||now-lastTap<550){setActive(true);lastTap=0;if(ev.preventDefault)ev.preventDefault()}else lastTap=now};lock.addEventListener('dblclick',tap);lock.addEventListener('touchend',tap,{passive:false});lock.addEventListener('click',tap)}resize();setActive(false);return{resize,lock(){setActive(false)},clear(){ctx.clearRect(0,0,canvas.getBoundingClientRect().width,180);signed=false;setActive(false)},hasSignature(){return signed},dataUrl(){return signed?canvas.toDataURL('image/png'):''}}}

function clearCustomerSignature(){customerPad.clear();noCustomerPresent=false}

function clearEmployeeSignature(){employeePad.clear()}

function markNoCustomer(){customerPad.clear();noCustomerPresent=true;setMessage('entryStatus','Kundenunterschrift wird ausgelassen.','info')}

async function saveEntry(){
  const a=auth(),date=$('date').value,customer=$('customer').value.trim(),activity=$('activity').value.trim(),materialUsed=document.querySelector('input[name="materialUsed"]:checked').value==='yes',material=$('material').value.trim(),jobCompleted=document.querySelector('input[name="jobCompleted"]:checked').value==='yes';
  const startMinutes=timeInputMinutes('start'),endMinutes=timeInputMinutes('end');
  if(!customer){setMessage('entryStatus','Bitte Kunde / Baustelle eintragen.','error');return}
  if(startMinutes===null||endMinutes===null){setMessage('entryStatus','Bitte gültige Von-/Bis-Zeit eintragen.','error');return}
  const startTime=String(Math.floor(startMinutes/60)).padStart(2,'0')+':'+String(startMinutes%60).padStart(2,'0');
  const endTime=String(Math.floor(endMinutes/60)).padStart(2,'0')+':'+String(endMinutes%60).padStart(2,'0');
  $('start').value=startTime;$('end').value=endTime;const hours=calculateHours();
  if(!(hours>0&&hours<=24)){setMessage('entryStatus','Arbeitszeit konnte nicht berechnet werden. Bitte Von/Bis prüfen.','error');return}
  if(!activity){setMessage('entryStatus','Bitte die ausgeführte Tätigkeit eintragen.','error');return}
  if(materialUsed&&!material){setMessage('entryStatus','Bitte Material eintragen.','error');return}


  const entry={clientId:uid(),employee:a.employee,employeePin:a.pin,date,customer,start:startTime,end:endTime,startMinutes,endMinutes,hours,activity,syncCalendar:false,materialUsed,material,additionalEmployeesUsed:false,additionalEmployees:[],additionalEmployeeHours:[],photos:preparedPhotos.slice(),customerSignature:noCustomerPresent?'':customerPad.dataUrl(),sourceCalendarEventId:selectedCalendarEventId,replacementAssignmentId:'',jobStatus:jobCompleted?'Abgeschlossen':'Laufend'};
  const item={type:'saveEntry',createdAt:Date.now(),payload:{action:'saveEntry',employee:a.employee,pin:a.pin,entry}};
  if(!navigator.onLine){await queuePut(item);setMessage('entryStatus','🟠 Offline gespeichert. Automatische Übertragung folgt bei Internetverbindung.','warn');resetEntry();await refreshQueueCount();return}
  try{
    setMessage('entryStatus','Eintrag wird übertragen ...','info');
    const day=await api(item.payload);
    lastDayData=day;renderDay();resetEntry();await loadCalendarEvents();
    setMessage('entryStatus','✅ Eintrag gespeichert. Der Auftrag steht jetzt im Chefbereich unter Regieberichte.','ok');
  }catch(e){
    if(e&&e.dgType==='network'){
      await queuePut(item);
      setMessage('entryStatus','🟠 Keine Serververbindung. Auftrag wurde lokal gespeichert und ist unter „Ausstehende Übertragungen“ sichtbar.','warn');
      resetEntry();await refreshQueueCount();
    }else{
      setMessage('entryStatus','❌ Auftrag nicht gespeichert: '+(e&&e.message?e.message:'Unbekannter Serverfehler.'),'error');
    }
  }
}

function resetEntry(){stopCamera();selectedCalendarEventId='';$('customer').value='';$('start').value='';$('end').value='';$('hours').value='';$('activity').value='';document.querySelector('input[name="materialUsed"][value="no"]').checked=true;toggleMaterial();document.querySelector('input[name="photosUsed"][value="no"]').checked=true;togglePhotos();document.querySelector('input[name="jobCompleted"][value="yes"]').checked=true;clearCustomerSignature();noCustomerPresent=false}

async function loadDay(){const a=auth(),date=$('date').value;if(!a.employee||!date)return;const token=DG3.dayToken=(DG3.dayToken||0)+1,key='dg_day_'+a.employee+'_'+date;const current=()=>auth().employee===a.employee&&date===$('date').value&&token===DG3.dayToken;try{let data;if(!navigator.onLine){const cached=localStorage.getItem(key);data=cached?JSON.parse(cached):{entries:[],total:0,closed:false,status:'Arbeiten'};}else{data=await api({action:'getDayData',employee:a.employee,pin:a.pin,date});if(current())localStorage.setItem(key,JSON.stringify(data));}if(current()){lastDayData=data;renderDay();}}catch(e){if(current())setMessage('entryStatus',e.message,'error');}}

function renderDay(){
  const entries=lastDayData.entries||[];
  if(!entries.length){$('entries').innerHTML='<div class="muted">Keine Einträge für diesen Tag.</div>'}
  else{
    $('entries').innerHTML=entries.map(e=>`<div class="entry">
      <strong>${esc(e.customer)}</strong>${e.isAdditionalAssignment?' <span class="badge">BEREITS ERFASST · Mitarbeit</span>':''}<br>
      ${esc(e.start)} - ${esc(e.end)} · <strong>${formatHours(e.hours)} Std.</strong><br>
      ${e.isAdditionalAssignment?`<div class="status ${e.assignmentStatus==='Abweichung'?'warn':e.assignmentStatus==='Bestätigt'?'ok':'info'}">Diese Stunden sind bereits deinem Stundenkonto zugeordnet.<br>Eingetragen von ${esc(e.assignedBy||'')} · Status: ${esc(e.assignmentStatus||'Zugeordnet')}${e.assignmentNote?'<br>Hinweis: '+esc(e.assignmentNote):''}</div>`:''}
      <span class="muted">${esc(e.activity)}</span><br>
      ${e.isAdditionalAssignment?`<div class="admin-actions" style="margin-top:8px"><button class="btn success" onclick="return confirmAssignment('${esc(e.assignmentId)}')">✓ Stimmt</button><button class="btn secondary" onclick="return takeAssignment('${esc(e.assignmentId)}')">Eigene Angaben erfassen</button><button class="btn danger" onclick="return reportAssignmentIssue('${esc(e.assignmentId)}')">Stimmt nicht</button></div>`:`<span class="muted">Material: ${e.materialUsed?esc(e.material||'Ja'):'Nein'} · Bilder: ${Number(e.photoCount||0)}</span>`}
      ${lastDayData.closed||e.isAdditionalAssignment?'':`<br><button class="btn danger" style="margin-top:8px" data-id="${esc(e.id)}" onclick="return deleteEntry(this.dataset.id)">Eintrag löschen</button>`}
    </div>`).join('');
  }
  const total=Number(lastDayData.total||0),target=Number(lastDayData.targetHours||0),diff=total-target;
  const dayEl=$('dayTotal');
  if(dayEl){dayEl.className='day-balance '+(target>0&&total+0.001<target?'bad':'good');dayEl.textContent='Heute: '+formatHours(total)+' Std.'+(target>0?' / Soll: '+formatHours(target)+' Std. · '+(diff>=0?(diff>0?'+'+formatHours(diff)+' Std. über Soll':'Tagessoll erreicht ✓'):'Noch offen: '+formatHours(Math.abs(diff))+' Std.'):'');}
  if($('employeeTimeBank'))$('employeeTimeBank').textContent='Zeitguthaben: '+formatHours(lastDayData.timeBankBalance||0)+' Std.';
  updateNetTotal();
  applyDayStatus(lastDayData.status||'Arbeiten');
  if(lastDayData.closed)setMessage('closeStatus','Dieser Tag ist bereits abgeschlossen.','ok');else clearMessage('closeStatus')
}

async function confirmAssignment(id){
  if(!navigator.onLine){setMessage('entryStatus','Bestätigung benötigt Internet.','warn');return}
  const a=auth();try{await api({action:'confirmEmployeeAssignment',employee:a.employee,pin:a.pin,assignmentId:id});await loadDay();setMessage('entryStatus','✓ Mitarbeit bestätigt.','ok')}catch(e){setMessage('entryStatus',e.message,'error')}
}

function takeAssignment(id){
  const e=(lastDayData.entries||[]).find(x=>x.assignmentId===id);if(!e)return;
  selectedAssignmentId=id;$('customer').value=e.customer||'';$('start').value=e.start||'';$('end').value=e.end||'';$('activity').value=e.activity||'';calculateHours();
  $('customer').scrollIntoView({behavior:'smooth',block:'center'});setMessage('entryStatus','Du bearbeitest jetzt eine bereits zugeordnete Mitarbeit. Beim Speichern wird sie ersetzt – nicht doppelt gezählt.','info');
}

async function reportAssignmentIssue(id){
  if(!navigator.onLine){setMessage('entryStatus','Abweichung melden benötigt Internet.','warn');return}
  const note=prompt('Was stimmt an dieser Mitarbeit-Zuordnung nicht?');if(note===null)return;if(!note.trim()){setMessage('entryStatus','Bitte einen kurzen Hinweis eingeben.','error');return}
  const a=auth();try{await api({action:'reportEmployeeAssignmentIssue',employee:a.employee,pin:a.pin,assignmentId:id,note:note.trim()});await loadDay();setMessage('entryStatus','⚠ Abweichung wurde für das Büro markiert.','warn')}catch(e){setMessage('entryStatus',e.message,'error')}
}

async function deleteEntry(id){if(!navigator.onLine){setMessage('entryStatus','Löschen ist offline erst nach der Synchronisierung möglich.','warn');return}if(!confirm('Eintrag wirklich löschen?'))return;const a=auth();try{lastDayData=await api({action:'deleteEntry',id,employee:a.employee,date:$('date').value,pin:a.pin});renderDay();setMessage('entryStatus','Eintrag gelöscht.','ok')}catch(e){setMessage('entryStatus',e.message,'error')}}

function updateNetTotal(){const pause=Number($('pauseHours').value)||0;$('netTotal').textContent='Arbeitszeit netto: '+formatHours(Math.max(0,Number(lastDayData.total||0)-pause))+' Std.'}

function closeDay(){const modal=$('closeDayConfirmModal');if(modal){modal.classList.remove('hidden');modal.style.display='flex'}}

function cancelCloseDay(){const modal=$('closeDayConfirmModal');if(modal){modal.classList.add('hidden');modal.style.display='none'}}

async function confirmCloseDay(){cancelCloseDay();await performCloseDay()}

async function performCloseDay(){const a=auth(),date=$('date').value;const item={type:'closeDay',createdAt:Date.now(),payload:{action:'closeDay',employee:a.employee,pin:a.pin,date,signatureDataUrl:'',pauseHours:Number($('pauseHours').value)||0}};if(!navigator.onLine){await queuePut(item);setMessage('closeStatus','🟠 Tagesabschluss offline gespeichert. Wird automatisch übertragen.','warn');await refreshQueueCount();return}try{const res=await api(item.payload);setMessage('closeStatus',res.alreadyClosed?'Tag war bereits abgeschlossen.':'✅ Tag abgeschlossen. Der Abschluss ist im Chefbereich verfügbar.','ok');await loadDay()}catch(e){await queuePut(item);setMessage('closeStatus','🟠 Tagesabschluss wurde offline vorgemerkt.','warn');await refreshQueueCount()}}

async function loadMonth(){const a=auth();if(!navigator.onLine){setMessage('monthStatus','Monatsübersicht benötigt Internet.','warn');return}try{const data=await api({action:'getMonthData',employee:a.employee,pin:a.pin,year:Number($('empYear').value),month:Number($('empMonth').value)});const ms=data.monthSummary||{},ys=data.yearSummary||{};let html='<div class="total">Gesamt: '+formatHours(data.total)+' Std.</div><div class="status info">Dieser Monat: Urlaub '+Number(ms.vacationDays||0)+' Tag(e) · Krank '+Number(ms.sickDays||0)+' Tag(e) · Feiertage '+Number(ms.holidayDays||0)+' Tag(e) · Freizeitausgleich '+formatHours(ms.compensatoryHours||0)+' Std. · Zeitguthaben '+formatHours(data.timeBankBalance||0)+' Std.</div><div class="status info">Jahr '+Number(ys.year||$('empYear').value)+': Urlaub '+Number(ys.vacationUsed||0)+' Tag(e) · Krank '+Number(ys.sickDays||0)+' Tag(e) · Urlaub zustehend '+formatHours(ys.vacationEntitlement)+' · Resturlaub '+formatHours(ys.vacationRemaining)+' Tage</div>';const days={};(data.rows||[]).forEach(r=>{const d=r.date||'';if(!days[d])days[d]={date:d,total:0,rows:[],closed:true};days[d].total+=Number(r.hours)||0;days[d].rows.push(r);if(!r.closed)days[d].closed=false});html+=Object.keys(days).sort().map(d=>{const x=days[d];const details=x.rows.map(r=>'<div class="entry" style="margin:8px 0 0"><strong>'+esc(r.customer)+'</strong> · '+formatHours(r.hours)+' Std. '+(r.closed?'✓':'(offen)')+(r.isAdditionalAssignment?' <span class="muted">· Mitarbeit, eingetragen von '+esc(r.assignedBy||'')+' · '+esc(r.assignmentStatus||'Zugeordnet')+'</span>':'')+'</div>').join('');const resend=x.closed?'':' <button type="button" class="btn primary" style="padding:8px 10px;margin-left:8px" onclick="return event.preventDefault();event.stopPropagation();transmitOpenDay(\''+esc(x.date)+'\')">Jetzt übermitteln</button>';const light=x.closed?'🟢':'🔴';const state=x.closed?'übermittelt':'offen';return '<details class="entry"><summary style="cursor:pointer"><span style="font-size:18px;margin-right:5px" aria-label="'+state+'">'+light+'</span><strong>'+formatDateDE(x.date)+'</strong> · <strong>'+formatHours(x.total)+' Std.</strong> <span class="muted">('+state+')</span>'+resend+'</summary><div style="margin-top:8px">'+details+'</div></details>'}).join('');if((data.statuses||[]).length){html+='<h3 style="margin-top:16px">Urlaub / Krank / Feiertag</h3>';html+=(data.statuses||[]).map(s=>'<div class="entry"><strong>'+formatDateDE(s.date)+'</strong> · '+esc(s.status)+(Number(s.creditedHours||0)?' · '+formatHours(s.creditedHours)+' Std. Gutschrift':'')+'</div>').join('')}$('monthResult').innerHTML=html;clearMessage('monthStatus')}catch(e){setMessage('monthStatus',e.message,'error')}}

async function transmitOpenDay(date){if(!navigator.onLine){setMessage('monthStatus','🟠 Keine Internetverbindung. Bitte später erneut versuchen.','warn');return}if(!confirm('Tag '+formatDateDE(date)+' jetzt ans Büro übermitteln?'))return;const a=auth();try{setMessage('monthStatus','Tag '+formatDateDE(date)+' wird übermittelt ...','info');const q=(await queueAll().catch(()=>[])).sort((x,y)=>x.createdAt-y.createdAt);const sameDay=q.filter(item=>{const p=item&&item.payload||{},e=p.entry||{};return (item.type==='saveEntry'&&e.date===date)||(item.type==='closeDay'&&p.date===date)});for(const item of sameDay){await api(item.payload);await queueDelete(item.id)}const hadClose=sameDay.some(item=>item.type==='closeDay');if(!hadClose)await api({action:'closeDay',employee:a.employee,pin:a.pin,date:date,signatureDataUrl:'',pauseHours:0});await refreshQueueCount();setMessage('monthStatus','✅ Tag '+formatDateDE(date)+' wurde ans Büro übermittelt.','ok');await loadMonth();if($('date').value===date)await loadDay()}catch(e){setMessage('monthStatus','Übermittlung nicht möglich: '+(e&&e.message?e.message:'Unbekannter Fehler.'),'error')}}

function bossOpenIssues(x){return (x.overlapConflicts||[]).filter(c=>!c.reviewed).length+(x.assignmentIssues||[]).length}

function bossTraffic(x){if(bossOpenIssues(x)>0)return '🔴';if(x.closureStatus!=='Abgeschlossen')return '🟠';return '🟢'}

function setBossFilter(v){bossFilter=v;['All','Alerts','Open'].forEach(k=>{const el=$('bossFilter'+k);if(el)el.classList.toggle('active',v===(k==='All'?'all':k==='Alerts'?'alerts':'open'))});renderBossCompact()}

function renderBossCompact(){
  const rows=window.__bossMonthRows||[];let grandTarget=0,grandActual=0;
  rows.forEach(x=>{grandTarget+=Number(x.targetTotal||0);grandActual+=Number(x.actualTotal||0)});
  const visible=rows.map((x,i)=>({x,i})).filter(o=>bossFilter==='all'||(bossFilter==='alerts'&&((o.x.overlapConflicts||[]).length||(o.x.assignmentIssues||[]).length))||(bossFilter==='open'&&bossOpenIssues(o.x)>0));
  let html='<div class="boss-compact-head"><div>Mitarbeiter</div><div style="text-align:right">Soll</div><div style="text-align:right">Ist</div><div style="text-align:right">+ / −</div><div></div><div></div></div>';
  html+=visible.map(o=>{const x=o.x,b=Number(x.balance||0),bc=b>0?'balance-plus':b<0?'balance-minus':'balance-zero';return '<div class="boss-compact-row"><div><strong>'+esc(x.employee)+'</strong>'+(x.active===false?' <span class="muted small">(inaktiv)</span>':'')+'</div><div class="boss-compact-value target-value">'+formatHours(x.targetTotal)+' </div><div class="boss-compact-value actual-value">'+formatHours(x.actualTotal)+'</div><div class="boss-compact-value '+bc+'">'+(b>0?'+':'')+formatHours(b)+'</div><div class="traffic" title="Status">'+bossTraffic(x)+'</div><div><button class="btn secondary" style="width:100%;padding:10px" onclick="return openBossActions('+o.i+')">Aktionen</button></div></div>'}).join('')||'<div class="status info">Für diesen Filter keine Mitarbeiter.</div>';
  const gb=grandActual-grandTarget;html+='<div class="boss-compact-row" style="border-top:2px solid #9ca3af"><div><strong>Gesamt</strong></div><div class="boss-compact-value target-value">'+formatHours(grandTarget)+'</div><div class="boss-compact-value actual-value">'+formatHours(grandActual)+'</div><div class="boss-compact-value '+(gb>0?'balance-plus':gb<0?'balance-minus':'balance-zero')+'">'+(gb>0?'+':'')+formatHours(gb)+'</div><div></div><div></div></div>';
  $('bossResult').innerHTML=html;
}

async function loadBossMonth(){
  if(!navigator.onLine){setMessage('bossStatus','Chefansicht benötigt Internet.','warn');return}
  const year=Number($('bossYear').value),month=Number($('bossMonth').value);if(!(year>0&&month>=1&&month<=12)){setMessage('bossStatus','Bitte Jahr und Monat prüfen.','error');return}
  try{setMessage('bossStatus','Monatsübersicht wird geladen ...','info');const rows=await api({action:'getBossMonthData',employee:auth().employee,employeePin:auth().pin,year,month});window.__bossMonthRows=rows||[];bossDetailIndex=-1;renderBossCompact();clearMessage('bossStatus')}catch(e){$('bossResult').innerHTML='';setMessage('bossStatus','Monatsübersicht konnte nicht geladen werden: '+e.message,'error')}
}

function bossToolbar(x){return '<div class="detail-toolbar"><div class="detail-toolbar-inner"><button class="btn secondary" onclick="return backBossOverview()">← Zurück</button><strong>'+esc(x.employee)+' · '+$('bossMonth').selectedOptions[0].text+' '+esc($('bossYear').value)+'</strong><div class="detail-nav"><button class="btn secondary" onclick="return bossPrevEmployee()">← Vorheriger</button><button class="btn secondary" onclick="return bossNextEmployee()">Nächster →</button></div></div></div>'}

function backBossOverview(){bossDetailIndex=-1;renderBossCompact()}

function bossPrevEmployee(){const r=window.__bossMonthRows||[];if(!r.length)return;bossDetailIndex=(bossDetailIndex-1+r.length)%r.length;renderBossActions()}

function bossNextEmployee(){const r=window.__bossMonthRows||[];if(!r.length)return;bossDetailIndex=(bossDetailIndex+1)%r.length;renderBossActions()}

function openBossActions(i){bossDetailIndex=i;bossDetailTab='overview';renderBossActions();window.scrollTo({top:0,behavior:'smooth'})}

function setBossDetailTab(t){bossDetailTab=t;renderBossActions()}

function renderBossActions(){
  const rows=window.__bossMonthRows||[],x=rows[bossDetailIndex];if(!x){renderBossCompact();return}
  let html=bossToolbar(x)+'<div class="action-tabs"><button class="btn '+(bossDetailTab==='overview'?'primary':'secondary')+'" onclick="return setBossDetailTab(\'overview\')">Monatsdetails</button><button class="btn '+(bossDetailTab==='entries'?'primary':'secondary')+'" onclick="return setBossDetailTab(\'entries\')">Aufträge</button><button class="btn '+(bossDetailTab==='alerts'?'primary':'secondary')+'" onclick="return setBossDetailTab(\'alerts\')">Auffälligkeiten</button><button class="btn '+(bossDetailTab==='adjust'?'primary':'secondary')+'" onclick="return setBossDetailTab(\'adjust\')">± Stunden</button><button class="btn '+(bossDetailTab==='timebank'?'primary':'secondary')+'" onclick="return setBossDetailTab(\'timebank\')">Zeitguthaben</button><button class="btn '+(bossDetailTab==='closure'?'primary':'secondary')+'" onclick="return setBossDetailTab(\'closure\')">Monatsabschluss</button></div>';
  if(bossDetailTab==='overview')html+=renderBossOverview(x);
  if(bossDetailTab==='entries')html+=renderBossEntries(x);
  if(bossDetailTab==='alerts')html+=renderBossAlerts(x);
  if(bossDetailTab==='adjust')html+=renderBossAdjust(x,bossDetailIndex);
  if(bossDetailTab==='timebank')html+=renderBossTimeBank(x);
  if(bossDetailTab==='closure')html+=renderBossClosure(x);
  $('bossResult').innerHTML=html;
}

function renderBossOverview(x){const b=Number(x.balance||0);return '<div class="status info"><strong>Soll '+formatHours(x.targetTotal)+' Std. · Ist '+formatHours(x.actualTotal)+' Std. · '+(b>=0?'+':'')+formatHours(b)+' Std.</strong></div><div class="entry">Arbeitszeit '+formatHours(x.workTotal)+' Std. · Gutschriften '+formatHours(x.creditedTotal)+' Std. · Freizeitausgleich '+formatHours(x.compensatoryHours||0)+' Std. · Korrekturen '+(Number(x.adjustmentTotal)>0?'+':'')+formatHours(x.adjustmentTotal)+' Std.</div><div class="entry">Monat: Urlaub '+Number(x.vacationDays||0)+' · Krank '+Number(x.sickDays||0)+' · Feiertage '+Number(x.holidayDays||0)+'</div><div class="entry">Jahr: Urlaub beansprucht '+Number(x.yearVacationDays||0)+' · zustehend '+formatHours(x.vacationEntitlement)+' · Rest '+formatHours(x.vacationRemaining)+' Tage</div><div class="entry">Zeitguthaben: '+formatHours(x.timeBankBalance||0)+' Std. · Für Abrechnung: '+formatHours(x.payableHours||0)+' Std.</div><div class="entry">Prüfstatus: '+bossTraffic(x)+' · '+bossOpenIssues(x)+' offene Punkte · Monatsabschluss: <span class="closure-badge '+(x.closureStatus==='Abgeschlossen'?'closed':'')+'">'+esc(x.closureStatus||'Offen')+'</span></div>'}

function renderBossEntries(x){return (x.entries||[]).map((e,i)=>'<div class="entry"><strong>'+formatDateDE(e.date)+' · '+esc(e.customer)+' · '+formatHours(e.hours)+' Std.</strong>'+(e.isAdditionalAssignment?' · Mitarbeit':'')+'<br><span class="muted">'+esc(e.activity||'')+'</span><div class="admin-actions" style="margin-top:8px"><button class="btn secondary" onclick="return openObjectView('+i+')">🏢 Objekt aufrufen</button><button class="btn secondary" onclick="return setBossDetailTab(\'adjust\')">± Stunden anpassen</button></div></div>').join('')||'<div class="muted">Keine Aufträge.</div>'}

function renderBossAlerts(x){let h='';const cs=(x.overlapConflicts||[]);h+=cs.map(c=>'<div class="status '+(c.reviewed?'ok':'error')+'"><strong>'+(c.reviewed?'✓ Überprüft':'⚠ Doppelbelegung prüfen')+'</strong><br>'+formatDateDE(c.date)+' · '+esc(c.first)+' '+esc(c.start1)+'–'+esc(c.end1)+' / '+esc(c.second)+' '+esc(c.start2)+'–'+esc(c.end2)+(c.reviewed?'<br><span class="small">'+esc((c.reviewedInfo||{}).reviewedAt||'')+' · '+esc((c.reviewedInfo||{}).reviewedBy||'')+'</span>':'<br><button class="btn success" style="margin-top:8px" onclick="return reviewBossConflict(\''+encodeURIComponent(c.id)+'\',\''+esc(c.date)+'\')">✓ Überprüft – korrekt</button>')+'</div>').join('');h+=(x.assignmentIssues||[]).map(c=>'<div class="status warn"><strong>⚠ Gemeldete Abweichung</strong><br>'+formatDateDE(c.date)+' · '+esc(c.customer)+' · '+esc(c.note||'')+'</div>').join('');return h||'<div class="status ok">Keine Auffälligkeiten.</div>'}

function renderBossAdjust(x,i){return '<div class="adjustment-box"><h3>Stunden anpassen</h3><div class="muted small">Originalaufträge bleiben unverändert. Jede Korrektur ist nachvollziehbar.</div><div class="adjustment-grid"><label>Stunden<input id="adjHours_'+i+'" inputmode="decimal" placeholder="z.B. 2,5"></label><label>Grund<input id="adjReason_'+i+'" placeholder="Grund ist Pflicht"></label><button class="btn success" onclick="return saveBossAdjustment('+i+',1)">+ Gutschreiben</button><button class="btn danger" onclick="return saveBossAdjustment('+i+',-1)">− Abziehen</button></div><h3>Historie</h3><div class="adjustment-history">'+((x.adjustments||[]).length?(x.adjustments||[]).map(a=>'<div class="adjustment-item"><div><span class="'+(Number(a.hours)>=0?'adjustment-positive':'adjustment-negative')+'">'+(Number(a.hours)>0?'+':'')+formatHours(a.hours)+' Std.</span> · '+esc(a.reason||'')+'<div class="muted small">'+esc(a.createdAt||'')+' · '+esc(a.createdBy||'')+'</div></div><button class="btn secondary" onclick="return deleteBossAdjustment(\''+esc(a.id)+'\')">Entfernen</button></div>').join(''):'<div class="muted">Keine Korrekturen.</div>')+'</div></div>'}

function renderBossTimeBank(x){const deficit=Math.max(0,Number(x.targetTotal||0)-Number(x.actualTotal||0)),surplus=Math.max(0,Number(x.actualTotal||0)-Number(x.targetTotal||0));return '<div class="timebank-box">Aktuelles Zeitguthaben: '+formatHours(x.timeBankBalance||0)+' Std.</div><div class="entry">Monats-Soll '+formatHours(x.targetTotal)+' Std. · Ist '+formatHours(x.actualTotal)+' Std.'+(deficit>0?' · Fehlend '+formatHours(deficit)+' Std.':'')+(surplus>0?' · Monatsplus '+formatHours(surplus)+' Std.':'')+'</div>'+(deficit>0&&Number(x.timeBankBalance)>0?'<button class="btn success" style="width:100%;margin-top:8px" onclick="return applyBankToCurrentMonth()">Zeitguthaben auf Monats-Soll anrechnen</button>':'')+(surplus>0&&!x.monthSurplusBanked?'<button class="btn secondary" style="width:100%;margin-top:8px" onclick="return bankCurrentMonthSurplus()">Monatsplus ins Zeitguthaben übernehmen</button>':'')+(x.monthSurplusBanked?'<div class="status ok">✓ Monatsplus wurde bereits ins Zeitguthaben übernommen.</div>':'')+'<div id="bossTimeBankStatus"></div><div class="muted small" style="margin-top:10px">Zeitkorrekturen werden in der Mitarbeiterverwaltung pro Mitarbeiter gebucht. Freizeitausgleich wird unter Urlaub / Krankheit / Abwesenheiten eingetragen.</div>'}

async function applyBankToCurrentMonth(){const x=(window.__bossMonthRows||[])[bossDetailIndex];if(!x)return;try{const r=await api(chefPayload({action:'applyTimeBankToMonth',targetEmployee:x.employee,year:Number($('bossYear').value),month:Number($('bossMonth').value)}));setMessage('bossTimeBankStatus','✅ '+formatHours(Math.abs(r.hours))+' Std. angerechnet. Zeitguthaben danach: '+formatHours(r.balanceAfter)+' Std.','ok');await reloadBossKeepDetail()}catch(e){setMessage('bossTimeBankStatus',e.message,'error')}}

async function bankCurrentMonthSurplus(){const x=(window.__bossMonthRows||[])[bossDetailIndex];if(!x)return;if(!confirm('Monatsplus von '+x.employee+' wirklich ins Zeitguthaben übernehmen?'))return;try{const r=await api(chefPayload({action:'bankMonthSurplus',targetEmployee:x.employee,year:Number($('bossYear').value),month:Number($('bossMonth').value)}));setMessage('bossTimeBankStatus','✅ '+formatHours(r.hours)+' Std. ins Zeitguthaben übernommen.','ok');await reloadBossKeepDetail()}catch(e){setMessage('bossTimeBankStatus',e.message,'error')}}

function renderBossClosure(x){const open=bossOpenIssues(x),closed=x.closureStatus==='Abgeschlossen';let h='<div class="status '+(open?'warn':'ok')+'">'+(open?'🟠 '+open+' offene Punkte vorhanden. Vor Abschluss bitte prüfen.':'🟢 Keine offenen Auffälligkeiten.')+'</div><div class="entry"><strong>Monatsabschluss: '+esc(x.closureStatus||'Offen')+'</strong>'+(x.closureLast?'<br><span class="muted">'+esc(x.closureLast.at||'')+' · '+esc(x.closureLast.by||'')+(x.closureLast.reason?' · '+esc(x.closureLast.reason):'')+'</span>':'')+'</div>';if(!closed)h+='<button class="btn success" style="width:100%" onclick="return changeMonthClosure(\'Abgeschlossen\')">✓ Monat abschließen</button>';else h+='<button class="btn secondary" style="width:100%" onclick="return changeMonthClosure(\'Wieder geöffnet\')">Monatsabschluss wieder öffnen</button>';if((x.closureHistory||[]).length)h+='<h3>Abschlusshistorie</h3>'+(x.closureHistory||[]).map(e=>'<div class="entry">'+esc(e.action)+' · '+esc(e.at)+' · '+esc(e.by)+(e.reason?' · '+esc(e.reason):'')+'</div>').join('');return h}

async function reviewBossConflict(encodedId,date){const x=(window.__bossMonthRows||[])[bossDetailIndex];if(!x)return;try{await api(chefPayload({action:'markConflictReviewed',conflictId:decodeURIComponent(encodedId),targetEmployee:x.employee,year:Number($('bossYear').value),month:Number($('bossMonth').value),date}));await reloadBossKeepDetail();setMessage('bossStatus','✓ Doppelbelegung als überprüft gespeichert.','ok')}catch(e){setMessage('bossStatus',e.message,'error')}}

async function changeMonthClosure(action){const x=(window.__bossMonthRows||[])[bossDetailIndex];if(!x)return;let reason='';if(action==='Wieder geöffnet'){reason=prompt('Grund für die Wiederöffnung:')||'';if(!reason.trim())return}else if(bossOpenIssues(x)>0&&!confirm('Es gibt noch offene Prüfpunkte. Monat trotzdem abschließen?'))return;try{await api(chefPayload({action:'setMonthClosureStatus',targetEmployee:x.employee,year:Number($('bossYear').value),month:Number($('bossMonth').value),closureAction:action,reason}));await reloadBossKeepDetail();setMessage('bossStatus','Monatsabschluss aktualisiert.','ok')}catch(e){setMessage('bossStatus',e.message,'error')}}

async function reloadBossKeepDetail(){const old=bossDetailIndex,tab=bossDetailTab;const rows=await api({action:'getBossMonthData',employee:auth().employee,employeePin:auth().pin,year:Number($('bossYear').value),month:Number($('bossMonth').value)});window.__bossMonthRows=rows||[];bossDetailIndex=Math.min(old,(rows||[]).length-1);bossDetailTab=tab;renderBossActions()}

async function openObjectView(entryIndex){const x=(window.__bossMonthRows||[])[bossDetailIndex],e=(x.entries||[])[entryIndex];if(!e)return;try{setMessage('bossStatus','Objekt wird geladen ...','info');const o=await api(chefPayload({action:'getObjectReports',objectId:e.objectId||'',customer:e.customer}));let h=bossToolbar(x)+'<button class="btn secondary" onclick="return renderBossActions()">← Zurück zu '+esc(x.employee)+'</button><div class="object-summary"><strong>🏢 '+esc(o.displayName||e.customer)+'</strong><br>Berichte: '+Number(o.reportCount||0)+' · Gesamtstunden: '+formatHours(o.totalHours)+' · Mitarbeiter: '+esc((o.employees||[]).join(', '))+'</div>';h+=(o.reports||[]).map(r=>'<div class="report-card"><strong>'+formatDateDE(r.date)+' · '+esc(r.employee)+' · '+formatHours(r.hours)+' Std.</strong><div class="report-meta">'+esc(r.start)+'–'+esc(r.end)+' · '+esc(r.regieStatus)+'</div><div>'+esc(r.activity||'')+'</div>'+(r.materialUsed?'<div class="report-meta"><strong>Material:</strong> '+esc(r.material||'')+'</div>':'')+'<div class="report-actions">'+reportLinks(r)+'</div></div>').join('');$('bossResult').innerHTML=h;clearMessage('bossStatus')}catch(err){setMessage('bossStatus',err.message,'error')}}

async function downloadTaxAdvisorPdf(){if(!navigator.onLine){setMessage('bossStatus','PDF-Erstellung benötigt Internet.','warn');return}try{setMessage('bossStatus','PDF für Steuerberater wird erstellt ...','info');const r=await api(chefPayload({action:'createTaxAdvisorPdf',year:Number($('bossYear').value),month:Number($('bossMonth').value)}));const bytes=Uint8Array.from(atob(r.base64),c=>c.charCodeAt(0)),blob=new Blob([bytes],{type:'application/pdf'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=r.fileName||'Monatsuebersicht.pdf';document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),30000);setMessage('bossStatus','✅ PDF erstellt.','ok')}catch(e){setMessage('bossStatus','PDF konnte nicht erstellt werden: '+e.message,'error')}}

function reportLinks(r){let html='';if(r.customerSignatureUrl)html+='<a class="btn secondary" target="_blank" rel="noopener" href="'+esc(r.customerSignatureUrl)+'">Unterschrift öffnen</a>';const urls=String(r.photoUrls||'').split(' | ').filter(Boolean);urls.forEach((u,i)=>html+='<a class="btn secondary" target="_blank" rel="noopener" href="'+esc(u)+'">Bild '+(i+1)+'</a>');return html}

function regieCustomerKey(v){let s=String(v||'').toLowerCase().replace(/ß/g,'ss').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,' ').trim().replace(/\s+/g,' ');s=s.replace(/\bstr\b/g,'strasse').replace(/\bstrasse\b/g,'strasse').replace(/([a-z0-9]+)str\b/g,'$1strasse');return s}

function loadRegieReports(view){return d3Reports(view||DG3.active);}

let pendingRegieMergeObjectIds=[];

function updateRegieMergeButton(view){const root=d3ReportRoot(view||DG3.active),n=root.querySelectorAll('.regie-merge-select:checked').length,h=root.querySelector('.d3-hint');if(h)h.textContent=n+' Kundenkarte(n) markiert.';}

function requestMergeSelectedRegieReports(view){return d3Merge(view||DG3.active);}

function closeRegieMergeConfirm(){DG3.merge=null;$('regieMergeConfirmModal').classList.add('hidden');}

function confirmMergeSelectedRegieReports(){return d3ConfirmMerge();}

function setRegieObjectJobStatus(ids,status){return d3JobStatus(ids,status);}

async function markRegieObjectCompleted(objectIds){return setRegieObjectJobStatus(objectIds,'Abgeschlossen')}

function markRegieObjectBilled(ids){return d3Bill(ids);}

function parseDecimalInput(value){const n=Number(String(value==null?'':value).trim().replace(',','.'));return Number.isFinite(n)?n:NaN}

async function saveBossAdjustment(rowIndex,direction){
  if(!navigator.onLine){setMessage('bossStatus','Stundenkorrekturen benötigen Internet.','warn');return}
  const rows=window.__bossMonthRows||[],x=rows[rowIndex];if(!x)return;
  const raw=parseDecimalInput($('adjHours_'+rowIndex).value),reason=$('adjReason_'+rowIndex).value.trim();
  if(!(raw>0)){setMessage('bossStatus','Bitte eine positive Stundenanzahl eingeben, z.B. 2,5.','error');return}
  if(!reason){setMessage('bossStatus','Bitte einen Grund für die Stundenkorrektur eintragen.','error');return}
  const hours=Math.abs(raw)*(direction<0?-1:1);
  const actionText=direction<0?'abziehen':'gutschreiben';
  if(!confirm(formatHours(Math.abs(hours))+' Std. bei '+x.employee+' '+actionText+'?'))return;
  try{
    setMessage('bossStatus','Stundenkorrektur wird gespeichert ...','info');
    await api({action:'saveMonthlyAdjustment',employee:auth().employee,employeePin:auth().pin,targetEmployee:x.employee,year:Number($('bossYear').value),month:Number($('bossMonth').value),hours,reason});
    await reloadBossKeepDetail();
    setMessage('bossStatus','✅ Stundenkorrektur gespeichert.','ok');
  }catch(e){setMessage('bossStatus','Stundenkorrektur nicht möglich: '+e.message,'error')}
}

async function deleteBossAdjustment(adjustmentId){
  if(!navigator.onLine){setMessage('bossStatus','Stundenkorrekturen benötigen Internet.','warn');return}
  if(!confirm('Diese Stundenkorrektur wirklich entfernen?'))return;
  try{
    await api({action:'deleteMonthlyAdjustment',employee:auth().employee,employeePin:auth().pin,adjustmentId});
    await reloadBossKeepDetail();
    setMessage('bossStatus','✅ Stundenkorrektur entfernt.','ok');
  }catch(e){setMessage('bossStatus','Korrektur konnte nicht entfernt werden: '+e.message,'error')}
}

function openDb(){return new Promise((resolve,reject)=>{const req=indexedDB.open('DGZeiterfassungOffline',2);req.onupgradeneeded=()=>{if(!req.result.objectStoreNames.contains('queue'))req.result.createObjectStore('queue',{keyPath:'id',autoIncrement:true})};req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error)})}

async function queuePut(item){item=JSON.parse(JSON.stringify(item));item.owner=item.owner||item.payload?.employee||item.payload?.entry?.employee||auth().employee;if(item.payload){delete item.payload.pin;delete item.payload.employeePin;if(item.payload.entry)delete item.payload.entry.employeePin;}const db=await openDb();await new Promise((res,rej)=>{const t=db.transaction('queue','readwrite');t.objectStore('queue').put(item);t.oncomplete=res;t.onerror=()=>rej(t.error);});db.close();}

async function queueAll(){const db=await openDb(),all=await new Promise((res,rej)=>{const r=db.transaction('queue','readonly').objectStore('queue').getAll();r.onsuccess=()=>res(r.result||[]);r.onerror=()=>rej(r.error);});db.close();return all.filter(x=>(x.owner||x.payload?.employee||x.payload?.entry?.employee)===auth().employee);}

async function queueDelete(id){const db=await openDb();return new Promise((resolve,reject)=>{const tx=db.transaction('queue','readwrite');tx.objectStore('queue').delete(id);tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error)})}

function queuedItemInfo(item){
  const p=(item&&item.payload)||{},e=p.entry||{};
  if(item&&item.type==='saveEntry')return {title:e.customer||'Auftrag',date:e.date||'',time:(e.start||'')+(e.end?'–'+e.end:''),hours:Number(e.hours||0),activity:e.activity||''};
  if(item&&item.type==='closeDay')return {title:'Tagesabschluss',date:p.date||'',time:'',hours:0,activity:''};
  return {title:(item&&item.type)||'Übertragung',date:'',time:'',hours:0,activity:''};
}

async function renderQueueDetails(){const box=$('queueDetails');if(!box)return;box.innerHTML=(await queueAll()).map(item=>{const x=queuedItemInfo(item);return '<div class="entry"><strong>'+esc(x.title)+'</strong><div>'+esc(x.date)+' '+esc(x.time)+'</div>'+(item.error?'<div class="status error">'+esc(item.error)+'</div>':'')+'<div class="report-actions">'+d3Button('Erneut uebertragen','retryQueueItem',[item.id])+ (item.type==='saveEntry'?d3Button('Korrigieren','d3EditQueue',[item.id],'secondary'):'')+'</div></div>';}).join('')||'Keine ausstehenden Uebertragungen.';}

function toggleQueueDetails(){const box=$('queueDetails');box.classList.toggle('hidden');if(!box.classList.contains('hidden'))renderQueueDetails()}

async function refreshQueueCount(){
  const q=await queueAll().catch(()=>[]),bar=$('queueBar'),text=$('queueText');
  bar.classList.toggle('hidden',q.length===0);
  text.textContent=q.length===1?'1 Auftrag/Abschluss wartet auf Übertragung.':q.length+' Aufträge/Abschlüsse warten auf Übertragung.';
  if(q.length&&!$('queueDetails').classList.contains('hidden'))await renderQueueDetails();
}

async function retryQueueItem(id){const item=(await queueAll()).find(x=>Number(x.id)===Number(id));if(!item)return;delete item.error;await queuePut(item);await syncQueue(true);}

async function syncQueue(show){if(DG3.queueBusy||!navigator.onLine)return;const a=auth();if(!a.employee||!a.pin)return;DG3.queueBusy=true;let sent=0,failed=0;const blocked=new Set();try{for(const item of (await queueAll()).sort((a,b)=>a.createdAt-b.createdAt)){if(auth().employee!==a.employee)break;const date=queuedItemInfo(item).date;if((item.type==='closeDay'&&blocked.has(date))||(item.error&&!show)){blocked.add(date);failed++;continue;}try{const payload={...item.payload,employee:a.employee,pin:a.pin,employeePin:a.pin};if(payload.entry)payload.entry={...payload.entry,employeePin:a.pin};await api(payload);await queueDelete(item.id);sent++;}catch(e){failed++;blocked.add(date);if(['network','version'].includes(e.dgType))break;item.error=e.message;await queuePut(item);}}await refreshQueueCount();if(sent)await loadDay();if(show)setMessage('entryStatus',sent+' uebertragen, '+failed+' noch offen. Details pruefen.',failed?'warn':'ok');}finally{DG3.queueBusy=false;}}

function initEnterSupport(){
  document.addEventListener('keydown',function(ev){
    if(ev.key!=='Enter')return;
    const target=ev.target;
    if(!target)return;
    if(target.tagName==='BUTTON'||target.type==='checkbox'||target.type==='radio'||target.type==='file')return;
    if(target.tagName==='TEXTAREA' && !(ev.ctrlKey||ev.metaKey))return;
    const card=target.closest('.card,.login-card');
    if(!card)return;
    const buttons=Array.from(card.querySelectorAll('[data-enter-default]'));
    const btn=buttons.find(function(b){return !b.disabled && b.offsetParent!==null;});
    if(!btn)return;
    ev.preventDefault();
    btn.click();
  });
}

function fillMonths(id){const n=['Januar','Februar','März','April','Mai','Juni','Juli','August','September','Oktober','November','Dezember'];$(id).innerHTML=n.map((x,i)=>'<option value="'+(i+1)+'">'+x+'</option>').join('')}

function init(){initEnterSupport();fillMonths('empMonth');fillMonths('bossMonth');fillMonths('regieMonth');$('regieMonth').insertAdjacentHTML('afterbegin','<option value="0">Alle Monate</option>');const d=new Date();loadEmployeeDirectory();$('empYear').value=d.getFullYear();$('bossYear').value=d.getFullYear();$('regieYear').value=d.getFullYear();$('empMonth').value=String(d.getMonth()+1);$('bossMonth').value=String(d.getMonth()+1);$('regieMonth').value=String(d.getMonth()+1);$('holidayYear').value=d.getFullYear();if($('vacationYear'))$('vacationYear').value=d.getFullYear();$('absenceStart').value=localDate();$('absenceEnd').value=localDate();clearEmployeeAdminForm();customerPad=initPad('customerSignature');employeePad=null;toggleMaterial();togglePhotos();updateConnection();const a=auth();if(a.employee&&a.pin)openMain();else $('loginScreen').classList.remove('hidden');if(navigator.onLine)syncQueue()}

/* DG 3.0: one request coordinator and one synchronization clock. */
window.DG3={version:'5.2.5',backend:'',pending:0,reads:new Map(),reports:{},active:'Abgeschlossen',loaders:{},ready:false};window.DG_APP_VERSION='5.2.5';
function d3Visible(e){return !!(e&&e.getClientRects().length);}
function d3Notice(msg,type='info'){let e=$('d3Notice');if(!e){e=document.createElement('div');e.id='d3Notice';document.querySelector('#mainScreen .tabs').after(e);}e.className='status '+type;e.textContent=msg;}
function d3Button(text,fn,args=[],kind='primary'){return '<button type="button" class="btn '+kind+'" data-d3-fn="'+esc(fn)+'" data-d3-args="'+esc(JSON.stringify(args))+'">'+esc(text)+'</button>';}
async function d3CheckBackend(){try{const r=await api({action:'ping'});DG3.backend=String(r.version||'');if(!/^(?:3\.|5\.)/.test(DG3.backend))d3Notice('App 5.0: Bitte zuerst Google-GS 5.0 bereitstellen. Backend: '+DG3.backend+'. Speichern ist gesperrt.','warn');else $('d3Notice')?.remove();return /^(?:3\.|5\.)/.test(DG3.backend);}catch(e){d3Notice('Verbindungspruefung fehlgeschlagen: '+e.message,'warn');return false;}}
async function d3Api(payload){const action=String(payload.action||''),read=/^(get|check)/.test(action)||['ping','employeeLogin','systemHealthCheck'].includes(action),key=JSON.stringify(payload);if(action!=='ping'&&!/^(?:3\.|5\.)/.test(DG3.backend)){await d3CheckBackend();if(!/^(?:3\.|5\.)/.test(DG3.backend))throw dgError('Google-Backend 5.0 noch nicht bereitgestellt.','version');}if(read&&DG3.reads.has(key))return DG3.reads.get(key);const promise=(async()=>{if(!read)DG3.pending++;const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),65000);try{let response;try{response=await fetch(API_URL,{method:'POST',headers:{'Content-Type':'text/plain;charset=utf-8'},body:JSON.stringify({...payload,clientVersion:'5.2.5'}),signal:controller.signal});}catch(e){throw dgError(e.name==='AbortError'?'Serverantwort dauert zu lange. Vor erneutem Anlegen zuerst Daten neu laden.':'Keine Serververbindung.','network');}if(!response.ok)throw dgError('HTTP '+response.status,'network');let data;try{data=JSON.parse(await response.text());}catch(e){throw dgError('Ungueltige Serverantwort.','server');}if(!data.ok)throw dgError(data.error||'Serverfehler.','server');return data.data!==undefined?data.data:data;}finally{clearTimeout(timer);if(!read)DG3.pending--;}})();if(read)DG3.reads.set(key,promise);try{return await promise;}finally{if(read&&DG3.reads.get(key)===promise)DG3.reads.delete(key);}}
document.addEventListener('click',e=>{const b=e.target.closest?.('button');if(!b)return;const fn=b.dataset.d3Fn,handler=fn?window[fn]:b.getAttribute('onclick')?b.onclick:null;if(typeof handler!=='function')return;e.preventDefault();e.stopImmediatePropagation();if(b.dataset.d3Busy)return;try{const r=handler.apply(b,fn?JSON.parse(b.dataset.d3Args||'[]'):[e]);if(r&&typeof r.then==='function'){b.dataset.d3Busy='1';b.disabled=true;b.setAttribute('aria-busy','true');Promise.resolve(r).catch(err=>d3Notice(err.message,'error')).finally(()=>{delete b.dataset.d3Busy;b.disabled=false;b.removeAttribute('aria-busy');});}}catch(err){d3Notice(err.message,'error');}},true);
function d3Dirty(){return !!(document.activeElement?.matches('input,textarea,select')||document.querySelector('[data-d3-busy]')||[...document.querySelectorAll('[id$="Modal"],.regie-merge-select:checked')].some(d3Visible)||(($('customer')?.value||'').trim())||(($('activity')?.value||'').trim())||(typeof preparedPhotos!=='undefined'&&preparedPhotos.length));}
async function d3Sync(){if(DG3.syncing||DG3.pending||document.hidden||!navigator.onLine||!DG3.ready||!auth().employee||d3Dirty())return;DG3.syncing=true;try{await syncQueue(false);if(d3Visible($('employeeView'))){await loadDay();await loadCalendarEvents();}else{if(DG3.loaders[DG3.open])await DG3.loaders[DG3.open]();await d3Dashboard();}if($('d3Sync'))$('d3Sync').textContent='Aktualisierung angefordert: '+new Date().toLocaleTimeString('de-DE')+' - Ergebnis im jeweiligen Bereich.';}catch(e){if($('d3Sync'))$('d3Sync').textContent='Aktualisierung fehlgeschlagen: '+e.message;}finally{DG3.syncing=false;}}
function d3Element(tag,cls='',html=''){const e=document.createElement(tag);e.className=cls;e.innerHTML=html;return e;}
function d3Download(r,type){const b=Uint8Array.from(atob(r.base64),c=>c.charCodeAt(0)),u=URL.createObjectURL(new Blob([b],{type})),a=document.createElement('a');a.href=u;a.download=r.fileName;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(u),30000);}
function d3Form(title,fields,values,save){$('d3FormModal')?.remove();const modal=d3Element('div','d3-modal','<form class="d3-form"><h2></h2><div class="d3-fields"></div><div role="status" class="d3-message"></div><div class="report-actions"><button type="submit" class="btn success">Speichern</button><button type="button" class="btn secondary" data-cancel>Abbrechen</button></div></form>');modal.id='d3FormModal';modal.querySelector('h2').textContent=title;const form=modal.querySelector('form'),host=modal.querySelector('.d3-fields'),status=modal.querySelector('.d3-message');fields.forEach(f=>{const label=d3Element('label','',esc(f.label));let input;if(f.type==='workers'){input=d3Element('div','d3-workers');f.options.forEach(w=>{const l=d3Element('label','d3-selection','<input type="checkbox" name="'+esc(f.name)+'" value="'+esc(w.value)+'"> '+esc(w.label));l.querySelector('input').checked=(values[f.name]||[]).includes(w.value);input.append(l);});}else{input=document.createElement(f.type==='textarea'?'textarea':f.type==='select'?'select':'input');if(f.type!=='textarea'&&f.type!=='select')input.type=f.type||'text';if(f.type==='select')f.options.forEach(o=>{const p=typeof o==='string'?{value:o,label:o}:o,x=d3Element('option','',esc(p.label));x.value=p.value;input.append(x);});input.name=f.name;input.id='d3Field-'+f.name;input.value=values[f.name]??'';input.required=!!f.required;label.htmlFor=input.id;}host.append(label,input);});modal.querySelector('[data-cancel]').addEventListener('click',()=>{if(!form.dataset.busy)modal.remove();});form.addEventListener('submit',async e=>{e.preventDefault();if(form.dataset.busy||!form.reportValidity())return;const v={};fields.forEach(f=>v[f.name]=f.type==='workers'?[...form.querySelectorAll('input[name="'+f.name+'"]:checked')].map(x=>x.value):form.elements[f.name].value);form.dataset.busy='1';form.querySelectorAll('button').forEach(x=>x.disabled=true);status.className='status info';status.textContent='Wird gespeichert ...';try{await save(v);modal.remove();}catch(err){status.className='status error';status.textContent=err.message;}finally{delete form.dataset.busy;form.querySelectorAll('button').forEach(x=>x.disabled=false);}});document.body.append(modal);return modal;}



/* Compiled component v45-patch.js */
(function(){
'use strict';
const byId=id=>document.getElementById(id);
function escAttr(v){return String(v==null?'':v).replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;').replace(/>/g,'&gt;')}
function addStyles(){
    if(byId('dgV45Styles')) return;
    const s=document.createElement('style');
    s.id='dgV45Styles';
    s.textContent=`
      .dg-v45-modal{position:fixed;inset:0;z-index:10050;background:rgba(0,0,0,.45);display:flex;align-items:center;justify-content:center;padding:20px}
      .dg-v45-modal.hidden{display:none!important}.dg-v45-card{background:#fff;border-radius:18px;max-width:640px;width:100%;padding:24px;box-shadow:0 18px 60px rgba(0,0,0,.28);max-height:90vh;overflow:auto}
      .dg-v45-actions{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:18px}.dg-v45-choice{border:1px solid #d1d5db;border-radius:12px;padding:12px;margin-top:10px;display:flex;justify-content:space-between;gap:12px;align-items:center}
      .dg-v45-choice .btn{width:auto}.dg-global-status{position:fixed;top:18px;left:50%;transform:translateX(-50%);z-index:10070;min-width:min(92vw,420px);max-width:92vw;padding:12px 16px;border-radius:12px;font-weight:800;text-align:center;box-shadow:0 8px 25px rgba(0,0,0,.18)}
      .dg-global-status.info{background:#e0f2fe;color:#075985}.dg-global-status.ok{background:#dcfce7;color:#166534}.dg-global-status.error{background:#fee2e2;color:#991b1b}
      @media(max-width:700px){.dg-v45-actions{grid-template-columns:1fr}.dg-v45-choice{flex-direction:column;align-items:stretch}.dg-v45-choice .btn{width:100%}}
    `;
    document.head.appendChild(s);
  }
function addModals(){
    if(!byId('dgGlobalStatus')){const e=document.createElement('div');e.id='dgGlobalStatus';e.className='dg-global-status hidden';document.body.appendChild(e)}
    if(!byId('dgDeleteModal')){const e=document.createElement('div');e.id='dgDeleteModal';e.className='dg-v45-modal hidden';e.innerHTML='<div class="dg-v45-card" style="max-width:480px"><h2 style="margin-top:0">Eintrag wirklich entfernen?</h2><div>Der ausgewählte Tageseintrag wird endgültig gelöscht.</div><div class="dg-v45-actions"><button class="btn success" onclick="return dgConfirmDeleteEntry()">Ja</button><button class="btn danger" onclick="return dgCancelDeleteEntry()">Nein</button></div></div>';document.body.appendChild(e)}
    if(!byId('dgRegieSelectModal')){const e=document.createElement('div');e.id='dgRegieSelectModal';e.className='dg-v45-modal hidden';e.innerHTML='<div class="dg-v45-card"><h2 style="margin-top:0">Bericht bearbeiten</h2><div class="muted">Bitte den Einzelbericht auswählen.</div><div id="dgRegieSelectList"></div><div class="dg-v45-actions" style="grid-template-columns:1fr"><button class="btn secondary" onclick="return dgCloseRegieSelect()">Abbrechen</button></div></div>';document.body.appendChild(e)}
    if(!byId('dgRegieEditModal')){const e=document.createElement('div');e.id='dgRegieEditModal';e.className='dg-v45-modal hidden';e.innerHTML='<div class="dg-v45-card"><h2 style="margin-top:0">Regiebericht bearbeiten</h2><input id="dgEditId" type="hidden"><label>Datum</label><input id="dgEditDate" type="date"><label>Kunde / Baustelle</label><input id="dgEditCustomer"><div class="grid2"><div><label>Von</label><input id="dgEditStart" type="time"></div><div><label>Bis</label><input id="dgEditEnd" type="time"></div></div><label>Ausgeführte Tätigkeit</label><textarea id="dgEditActivity"></textarea><label style="display:flex;gap:8px;align-items:center"><input id="dgEditMaterialUsed" type="checkbox" style="width:auto" onchange="dgToggleMaterial()"> Material verbaut</label><div id="dgEditMaterialWrap" class="hidden"><label>Material</label><textarea id="dgEditMaterial"></textarea></div><label>Auftragsstatus</label><select id="dgEditJobStatus"><option value="Laufend">Laufend</option><option value="Abgeschlossen">Abgeschlossen</option></select><div id="dgEditStatus"></div><div class="dg-v45-actions"><button class="btn primary" onclick="return dgSaveRegieEdit()">Änderungen speichern</button><button class="btn secondary" onclick="return dgCloseRegieEdit()">Abbrechen</button></div></div>';document.body.appendChild(e)}
  }
window.__dgReportMap={};
window.__dgGroupMap={};
window.dgRequestGroupEdit=function(key){const ids=window.__dgGroupMap[key]||[];if(!ids.length){setMessage('regieStatus','Kein bearbeitbarer Einzelbericht gefunden.','error');return}if(ids.length===1){window.dgOpenRegieEdit(ids[0]);return}const list=byId('dgRegieSelectList');list.innerHTML=ids.map(id=>{const r=window.__dgReportMap[id]||{};return '<div class="dg-v45-choice"><div><strong>'+formatDateDE(r.date||'')+' · '+esc(r.employee||'')+' · '+formatHours(r.hours||0)+' Std.</strong><div class="report-meta">'+esc((r.start||'')+'–'+(r.end||''))+'</div><div>'+esc(r.activity||'')+'</div></div><button class="btn primary" data-id="'+escAttr(id)+'">Bearbeiten</button></div>'}).join('');list.querySelectorAll('button[data-id]').forEach(b=>b.onclick=()=>{window.dgCloseRegieSelect();window.dgOpenRegieEdit(b.dataset.id)});byId('dgRegieSelectModal').classList.remove('hidden')};
window.dgCloseRegieSelect=function(){byId('dgRegieSelectModal').classList.add('hidden')};
window.dgOpenRegieEdit=function(id){const r=window.__dgReportMap[String(id)]||null;if(!r){setMessage('regieStatus','Bericht konnte nicht geladen werden.','error');return}byId('dgEditId').value=r.id||'';byId('dgEditDate').value=r.date||'';byId('dgEditCustomer').value=r.customer||'';byId('dgEditStart').value=r.start||'';byId('dgEditEnd').value=r.end||'';byId('dgEditActivity').value=r.activity||'';byId('dgEditMaterialUsed').checked=Boolean(r.materialUsed);byId('dgEditMaterial').value=r.material||'';byId('dgEditJobStatus').value=r.jobStatus||'Abgeschlossen';window.dgToggleMaterial();if(typeof clearMessage==='function')clearMessage('dgEditStatus');byId('dgRegieEditModal').classList.remove('hidden')};
window.dgToggleMaterial=function(){byId('dgEditMaterialWrap').classList.toggle('hidden',!byId('dgEditMaterialUsed').checked)};
window.dgCloseRegieEdit=function(){byId('dgRegieEditModal').classList.add('hidden')};
window.dgSaveRegieEdit=async function(){const entryId=byId('dgEditId').value;const item={date:byId('dgEditDate').value,customer:byId('dgEditCustomer').value.trim(),start:byId('dgEditStart').value,end:byId('dgEditEnd').value,activity:byId('dgEditActivity').value.trim(),materialUsed:byId('dgEditMaterialUsed').checked,material:byId('dgEditMaterial').value.trim(),jobStatus:byId('dgEditJobStatus').value};if(!entryId||!item.date||!item.customer||!item.start||!item.end||!item.activity){setMessage('dgEditStatus','Bitte alle Pflichtfelder ausfüllen.','error');return}try{setMessage('dgEditStatus','Änderungen werden gespeichert ...','info');await window.api(chefPayload({action:'updateRegieReport',entryId,item}));window.dgCloseRegieEdit();await window.loadRegieReports(window.__regieStatus||'Abgeschlossen');setMessage('regieStatus','✓ Regiebericht wurde aktualisiert.','ok')}catch(e){setMessage('dgEditStatus',e.message,'error')}};
addStyles();
addModals();
})();


/* Compiled component v48-patch.js */
(function(){
'use strict';
function el(id){return document.getElementById(id)}
function esc2(v){return String(v==null?'':v).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]})}
function addStyles(){if(el('dgV48Styles'))return;const s=document.createElement('style');s.id='dgV48Styles';s.textContent=`.dg48-head{display:flex;align-items:center;justify-content:space-between;gap:12px;cursor:pointer;user-select:none;margin:-4px 0 0;padding:4px 0 10px;border-bottom:1px solid #e5e7eb}.dg48-head h2{margin:0;color:var(--brand)}.dg48-toggle{border:0;border-radius:10px;background:#e5e7eb;color:#111827;font-weight:900;font-size:22px;line-height:1;width:44px;height:40px;flex:0 0 44px}.dg48-body{padding-top:12px}.dg48-body.hidden{display:none!important}.dg48-subsection{border:1px solid #e5e7eb;border-radius:14px;padding:14px;margin:10px 0;background:#fff}.dg48-subsection h3{color:var(--brand);margin:0 0 10px;font-size:22px}.dg48-days-employee{border:1px solid #e5e7eb;border-radius:14px;padding:12px;margin-top:10px}.dg48-day-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(230px,1fr));gap:10px;margin-top:10px}.dg48-day{border-radius:12px;padding:11px;border:1px solid #d1d5db;background:#fff}.dg48-day.closed{border-left:6px solid #16a34a}.dg48-day.open{border-left:6px solid #dc2626}.dg48-day-state{font-weight:800;margin-bottom:5px}.dg48-day-state.closed{color:#166534}.dg48-day-state.open{color:#991b1b}.dg48-day .btn{width:100%;margin-top:8px}.boss-compact-row button[data-dg-actions]{background:var(--brand)!important;color:#fff!important}@media(max-width:700px){.dg48-day-grid{grid-template-columns:1fr}.dg48-head h2{font-size:19px}.dg48-subsection h3{font-size:18px}}`;document.head.appendChild(s)}
function findCard(root,title){return Array.from(root.querySelectorAll(':scope > .card')).find(function(c){const h=c.querySelector(':scope > h2');return h&&h.textContent.trim()===title})}
function collapse(card,title,open){if(!card||card.dataset.dg48==='1')return card;card.dataset.dg48='1';const h=card.querySelector(':scope > h2');const head=document.createElement('div');head.className='dg48-head';head.innerHTML='<h2>'+esc2(title||(h?h.textContent:''))+'</h2><button type="button" class="dg48-toggle">'+(open?'−':'+')+'</button>';const body=document.createElement('div');body.className='dg48-body'+(open?'':' hidden');Array.from(card.childNodes).forEach(function(n){if(n!==h)body.appendChild(n)});if(h)h.remove();card.appendChild(head);card.appendChild(body);head.addEventListener('click',function(e){e.preventDefault();const show=body.classList.contains('hidden');body.classList.toggle('hidden',!show);head.querySelector('.dg48-toggle').textContent=show?'−':'+'});return card}
function makeDaySection(){const sec=document.createElement('div');sec.className='dg48-subsection';sec.id='dg48DayClosures';sec.innerHTML='<h3>Tagesabschlüsse</h3><div class="muted small">Grün = vollständig übertragen/abgeschlossen. Rot = noch offen. Offene Arbeitstage können vom Büro manuell abgeschlossen werden.</div><div class="grid2"><div><label>Jahr</label><input id="dg48DayYear" type="number"></div><div><label>Monat</label><select id="dg48DayMonth"></select></div></div><button type="button" class="btn primary" style="width:100%;margin-top:10px" onclick="return loadBossDayClosuresV48()">Tagesabschlüsse laden</button><div id="dg48DayStatus"></div><div id="dg48DayResult"></div>';const now=new Date();const y=sec.querySelector('#dg48DayYear'),m=sec.querySelector('#dg48DayMonth');y.value=(el('bossYear')&&el('bossYear').value)||now.getFullYear();['Januar','Februar','März','April','Mai','Juni','Juli','August','September','Oktober','November','Dezember'].forEach(function(n,i){const o=document.createElement('option');o.value=String(i+1);o.textContent=n;m.appendChild(o)});m.value=(el('bossMonth')&&el('bossMonth').value)||String(now.getMonth()+1);return sec}
function buildLayout(){const root=el('bossView');if(!root||root.dataset.dg48Layout==='1')return;root.dataset.dg48Layout='1';const regie=findCard(root,'Regieberichte'),month=findCard(root,'Monatsübersicht aller Mitarbeiter'),employee=findCard(root,'Mitarbeiterverwaltung'),absence=findCard(root,'Urlaub / Krankheit / Abwesenheiten eintragen'),vacation=findCard(root,'Urlaubskonto'),holiday=findCard(root,'Feiertage Bayern / Nürnberg');if(regie)collapse(regie,'Regieberichte',false);if(month){const group=document.createElement('div');group.className='card';group.id='dg48EmployeeClosures';group.innerHTML='<h2>Mitarbeiterabschlüsse</h2>';const inner=document.createElement('div');inner.appendChild(makeDaySection());month.classList.add('dg48-subsection');month.style.boxShadow='none';month.style.margin='10px 0';const mh=month.querySelector(':scope > h2');if(mh)mh.textContent='Monatsabschlüsse';inner.appendChild(month);group.appendChild(inner);if(regie)regie.insertAdjacentElement('afterend',group);else root.insertBefore(group,root.firstChild);collapse(group,'Mitarbeiterabschlüsse',false)}if(employee)collapse(employee,'Mitarbeiterverwaltung · Punkte 1–9',false);if(absence||vacation||holiday){const group=document.createElement('div');group.className='card';group.id='dg48AbsenceGroup';group.innerHTML='<h2>Urlaub / Abwesenheiten / Feiertage</h2>';const inner=document.createElement('div');[absence,vacation,holiday].forEach(function(c){if(c){c.classList.add('dg48-subsection');c.style.boxShadow='none';c.style.margin='10px 0';inner.appendChild(c)}});group.appendChild(inner);root.appendChild(group);collapse(group,'Urlaub / Abwesenheiten / Feiertage',false)}}
function blueActions(){document.querySelectorAll('.boss-compact-row button').forEach(function(b){if((b.textContent||'').trim()==='Aktionen'){b.type='button';b.classList.remove('secondary');b.classList.add('primary');b.dataset.dgActions='1'}})}
if(typeof window.renderBossCompact==='function'){const old=window.renderBossCompact;window.renderBossCompact=function(){const r=old.apply(this,arguments);blueActions();return r}}
window.openBossActions=function(i){bossDetailIndex=i;bossDetailTab='overview';renderBossActions();const r=el('bossResult');if(r)r.scrollIntoView({behavior:'smooth',block:'start'})};
window.loadBossDayClosuresV48=async function(){if(!navigator.onLine){setMessage('dg48DayStatus','Tagesabschlüsse benötigen Internet.','warn');return}const year=Number(el('dg48DayYear').value),month=Number(el('dg48DayMonth').value);try{setMessage('dg48DayStatus','Tagesabschlüsse werden geladen ...','info');const rows=await api(chefPayload({action:'getBossDayClosures',year:year,month:month}));renderBossDayClosuresV48(rows||[]);setMessage('dg48DayStatus','✓ Tagesabschlüsse geladen.','ok')}catch(e){setMessage('dg48DayStatus',e.message,'error')}};
window.renderBossDayClosuresV48=function(rows){const out=el('dg48DayResult');if(!out)return;if(!rows.length){out.innerHTML='<div class="status info">Für diesen Monat sind keine Arbeitstage vorhanden.</div>';return}out.innerHTML=rows.map(function(emp){return '<div class="dg48-days-employee"><strong>'+esc2(emp.employee)+'</strong><div class="dg48-day-grid">'+(emp.days||[]).map(function(d){const c=!!d.closed;return '<div class="dg48-day '+(c?'closed':'open')+'"><div class="dg48-day-state '+(c?'closed':'open')+'">'+(c?'🟢 Vollständig übertragen':'🔴 Noch nicht abgeschlossen')+'</div><strong>'+esc2(formatDateDE(d.date))+'</strong><div class="muted small">'+esc2(formatHours(d.hours||0))+' Std. · '+Number(d.entryCount||0)+' Eintrag/Einträge</div>'+(c?'':'<button type="button" class="btn danger" data-employee="'+esc2(emp.employee)+'" data-date="'+esc2(d.date)+'" onclick="return manualCloseBossDayV48(this.dataset.employee,this.dataset.date)">Tag manuell abschließen</button>')+'</div>'}).join('')+'</div></div>'}).join('')};
window.manualCloseBossDayV48=async function(employee,date){if(!confirm('Tag '+formatDateDE(date)+' für '+employee+' wirklich manuell abschließen?'))return;try{setMessage('dg48DayStatus','Tag wird manuell abgeschlossen ...','info');const r=await api(chefPayload({action:'manualCloseBossDay',targetEmployee:employee,date:date}));setMessage('dg48DayStatus',r&&r.alreadyClosed?'Tag war bereits abgeschlossen.':'✓ Tag wurde manuell abgeschlossen.','ok');await loadBossDayClosuresV48();if(typeof loadBossMonth==='function')await loadBossMonth()}catch(e){setMessage('dg48DayStatus',e.message,'error')}};
addStyles();
buildLayout();
blueActions();
})();


/* Compiled component v49-patch.js */
(function(){
'use strict';
function el(id){return document.getElementById(id)}
function esc(v){return String(v==null?'':v).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]})}
function renameEmployeeReports(){
    var group=el('dg48EmployeeClosures');
    if(!group)return;
    var h=group.querySelector(':scope > .dg48-head h2');
    if(h)h.textContent='Mitarbeiterberichte';
  }
function addStyles(){
    if(el('dgV49Styles'))return;
    var s=document.createElement('style');s.id='dgV49Styles';s.textContent=`
      .dg48-day{cursor:pointer;transition:transform .08s ease,box-shadow .08s ease}
      .dg48-day:hover{box-shadow:0 4px 14px rgba(0,0,0,.08)}
      .dg49-detail{margin-top:10px;padding-top:10px;border-top:1px solid #e5e7eb}
      .dg49-detail.hidden{display:none!important}
      .dg49-report{padding:9px 0;border-top:1px solid #e5e7eb}
      .dg49-report:first-child{border-top:0}
      .dg49-report-title{font-weight:800}
      .dg49-report-meta{font-size:13px;color:var(--muted);margin-top:3px}
      .dg49-report-activity{margin-top:5px;white-space:pre-wrap}
      .dg49-hint{font-size:12px;color:var(--muted);margin-top:7px;font-weight:700}
    `;document.head.appendChild(s);
  }
window.toggleBossDayDetailsV49=function(key){
    var d=el('dg49Detail_'+key);if(!d)return;
    d.classList.toggle('hidden');
  };
window.renderBossDayClosuresV48=function(rows){
    var out=el('dg48DayResult');if(!out)return;
    if(!rows.length){out.innerHTML='<div class="status info">Für diesen Monat sind keine Arbeitstage vorhanden.</div>';return;}
    out.innerHTML=rows.map(function(emp,ei){
      return '<div class="dg48-days-employee"><strong>'+esc(emp.employee)+'</strong><div class="dg48-day-grid">'+(emp.days||[]).map(function(d,di){
        var c=!!d.closed,key=ei+'_'+di;
        var reports=(d.reports||[]);
        var detail=reports.length?reports.map(function(r){
          var assignment=r.isAdditionalAssignment?' <span class="muted">· Mitarbeit'+(r.assignedBy?' von '+esc(r.assignedBy):'')+'</span>':'';
          var material=r.materialUsed&&r.material?'<div class="dg49-report-meta">Material: '+esc(r.material)+'</div>':'';
          return '<div class="dg49-report"><div class="dg49-report-title">'+esc(r.customer||'Ohne Baustellenangabe')+'</div><div class="dg49-report-meta">'+esc(r.start||'')+'–'+esc(r.end||'')+' · '+esc(formatHours(r.hours||0))+' Std.'+assignment+'</div><div class="dg49-report-activity">'+esc(r.activity||'Keine Tätigkeitsbeschreibung')+'</div>'+material+'</div>';
        }).join(''):'<div class="muted small">Keine Einzelberichte vorhanden.</div>';
        return '<div class="dg48-day '+(c?'closed':'open')+'" onclick="return toggleBossDayDetailsV49(\''+key+'\')"><div class="dg48-day-state '+(c?'closed':'open')+'">'+(c?'🟢 Vollständig übertragen':'🔴 Noch nicht abgeschlossen')+'</div><strong>'+esc(formatDateDE(d.date))+'</strong><div class="muted small">'+esc(formatHours(d.hours||0))+' Std. · '+Number(d.entryCount||0)+' Eintrag/Einträge</div><div class="dg49-hint">Berichtdetails anzeigen</div><div id="dg49Detail_'+key+'" class="dg49-detail hidden">'+detail+(c?'':'<button type="button" class="btn danger" data-employee="'+esc(emp.employee)+'" data-date="'+esc(d.date)+'" onclick="return event.stopPropagation();manualCloseBossDayV48(this.dataset.employee,this.dataset.date)">Tag manuell abschließen</button>')+'</div></div>';
      }).join('')+'</div></div>';
    }).join('');
  };
addStyles();
renameEmployeeReports();
})();


/* Compiled component v50-patch.js */
(function(){
'use strict';
function el(id){return document.getElementById(id)}
function h(v){return String(v==null?'':v).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]})}
function norm(v){return String(v==null?'':v).toLocaleLowerCase('de-DE').replace(/\s+/g,' ').trim()}
function addStyles(){
    if(el('dgV50Styles'))return;
    const s=document.createElement('style');s.id='dgV50Styles';s.textContent=`
      .dg50-search{margin:12px 0 14px;padding:12px;border:1px solid #d1d5db;border-radius:14px;background:#f9fafb}
      .dg50-search-row{display:grid;grid-template-columns:1fr auto;gap:8px;align-items:end}
      .dg50-search-row .btn{white-space:nowrap}
      .dg50-results{margin-top:10px}.dg50-section{margin-top:12px}.dg50-section h3{margin:0 0 8px;color:var(--brand)}
      .dg50-hit{border:1px solid #e5e7eb;border-radius:12px;padding:11px;margin-top:8px;background:#fff}
      .dg50-hit.running{border-left:6px solid #b91c1c}.dg50-hit.open{border-left:6px solid #166534}
      .dg50-hit-title{font-weight:800}.dg50-hit-meta{font-size:13px;color:var(--muted);margin-top:4px}
      .dg50-warning-list{margin:10px 0 0;padding:0;list-style:none}.dg50-warning-list li{padding:10px;border:1px solid #fed7aa;background:#fff7ed;border-radius:10px;margin-top:8px}
      .dg50-modal{position:fixed;inset:0;z-index:10120;background:rgba(0,0,0,.48);display:flex;align-items:center;justify-content:center;padding:18px}.dg50-modal.hidden{display:none!important}
      .dg50-modal-card{background:#fff;border-radius:18px;width:min(100%,680px);max-height:90vh;overflow:auto;padding:22px;box-shadow:0 18px 60px rgba(0,0,0,.3)}
      .dg50-modal-actions{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:18px}
      @media(max-width:700px){.dg50-search-row,.dg50-modal-actions{grid-template-columns:1fr}}
    `;document.head.appendChild(s);
  }
function findRegieBody(){
    const root=el('bossView');if(!root)return null;
    const cards=Array.from(root.querySelectorAll(':scope > .card'));
    const card=cards.find(function(c){const x=c.querySelector('.dg48-head h2,:scope > h2');return x&&x.textContent.trim()==='Regieberichte'});
    if(!card)return null;
    return card.querySelector('.dg48-body')||card;
  }
function addSearch(){
    if(el('dg50RegieSearch'))return;
    const body=findRegieBody();if(!body)return;
    const box=document.createElement('div');box.className='dg50-search';box.id='dg50RegieSearch';
    box.innerHTML='<label for="dg50SearchInput" style="margin-top:0">Kunde / Adresse / Suchbegriff</label><div class="dg50-search-row"><input id="dg50SearchInput" type="search" placeholder="z. B. Kollat, Nürnberg, Steineck ..." autocomplete="off"><button type="button" class="btn primary" onclick="return dg50RunSearch()">Suchen</button></div><div class="muted small" style="margin-top:6px">Durchsucht gleichzeitig laufende Aufträge und offene Regieberichte – unabhängig vom aktuell gewählten Reiter.</div><div id="dg50SearchStatus"></div><div id="dg50SearchResults" class="dg50-results"></div>';
    const firstControls=body.querySelector('.admin-grid,.button-row');
    if(firstControls)body.insertBefore(box,firstControls);else body.prepend(box);
    let timer=null;el('dg50SearchInput').addEventListener('input',function(){clearTimeout(timer);const q=this.value.trim();if(!q){el('dg50SearchResults').innerHTML='';if(typeof clearMessage==='function')clearMessage('dg50SearchStatus');return}timer=setTimeout(function(){window.dg50RunSearch()},320)});
  }
function groupText(g){
    const reports=g.reports||[];
    return [g.customer,g.firstDate,g.lastDate,(g.employees||[]).join(' '),reports.map(function(r){return [r.employee,r.customer,r.activity,r.material,r.date].join(' ')}).join(' ')].join(' ');
  }
window.dg50RunSearch=async function(){
    const input=el('dg50SearchInput'),out=el('dg50SearchResults');if(!input||!out)return;
    const q=norm(input.value);if(q.length<2){out.innerHTML='';setMessage('dg50SearchStatus','Bitte mindestens 2 Zeichen eingeben.','warn');return}
    if(!navigator.onLine){setMessage('dg50SearchStatus','Suche benötigt Internet.','warn');return}
    try{
      setMessage('dg50SearchStatus','Aufträge werden durchsucht ...','info');
      let groups=await api(chefPayload({action:'getRegieReports',status:'Offen',year:0,month:0}));
      
      const hits=(groups||[]).filter(function(g){return norm(groupText(g)).includes(q)});
      const running=hits.filter(function(g){return (g.jobStatus||'Abgeschlossen')==='Laufend'});
      const open=hits.filter(function(g){return (g.jobStatus||'Abgeschlossen')!=='Laufend'});
      function render(g,kind){
        const reports=g.reports||[],activities=Array.from(new Set(reports.map(function(r){return String(r.activity||'').trim()}).filter(Boolean))).slice(0,3);
        return '<div class="dg50-hit '+kind+'"><div class="dg50-hit-title">'+h(g.customer||'Objekt')+'</div><div class="dg50-hit-meta">'+h(formatDateDE(g.firstDate||''))+(g.lastDate&&g.lastDate!==g.firstDate?' bis '+h(formatDateDE(g.lastDate)):'')+' · '+Number(g.reportCount||reports.length||0)+' Bericht(e) · '+h(formatHours(g.totalHours||0))+' Std.</div>'+(activities.length?'<div class="dg50-hit-meta">'+activities.map(h).join(' · ')+'</div>':'')+'</div>';
      }
      let html='';
      html+='<div class="dg50-section"><h3>🔴 Laufende Aufträge ('+running.length+')</h3>'+(running.map(function(g){return render(g,'running')}).join('')||'<div class="muted">Keine laufenden Treffer.</div>')+'</div>';
      html+='<div class="dg50-section"><h3>🟢 Abgeschlossene Auftraege ('+open.length+')</h3>'+(open.map(function(g){return render(g,'open')}).join('')||'<div class="muted">Keine offenen Treffer.</div>')+'</div>';
      out.innerHTML=html;setMessage('dg50SearchStatus',hits.length+' passende Objekt(e) gefunden.','ok');
    }catch(e){out.innerHTML='';setMessage('dg50SearchStatus',e.message,'error')}
  };
addStyles();
addSearch();
})();


/* Compiled component v51-patch.js */
(function(){
'use strict';
function el(id){return document.getElementById(id)}
function addStyles(){
    if(el('dgV51Styles')) return;
    const s=document.createElement('style');
    s.id='dgV51Styles';
    s.textContent=`
      #employeeTimeBank.dg51-month-hours{background:#dcfce7!important;color:#166534!important;border:1px solid #bbf7d0!important;font-weight:800}
    `;
    document.head.appendChild(s);
  }
async function refreshMonthHours(){
    const box=el('employeeTimeBank');
    if(!box) return;
    box.classList.add('dg51-month-hours');
    if(!navigator.onLine){
      box.textContent='Geleistete Monatsstunden: offline nicht verfügbar';
      return;
    }
    const a=typeof auth==='function'?auth():{};
    if(!a.employee||!a.pin){
      box.textContent='Geleistete Monatsstunden: 0,00 Std.';
      return;
    }
    const d=new Date();
    try{
      const data=await api({action:'getMonthData',employee:a.employee,pin:a.pin,year:d.getFullYear(),month:d.getMonth()+1});
      const total=Number(data&&data.total||0);
      box.textContent='Geleistete Monatsstunden: '+formatHours(total)+' Std.';
    }catch(e){
      box.textContent='Geleistete Monatsstunden: nicht verfügbar';
    }
  }
const baseRenderDay=window.renderDay;
if(typeof baseRenderDay==='function'){
    window.renderDay=function(){
      const r=baseRenderDay.apply(this,arguments);
      refreshMonthHours();
      return r;
    };
  }
addStyles();
})();


/* Compiled component v54-patch.js */
(function(){
'use strict';
const $=id=>document.getElementById(id);
const esc=v=>String(v==null?'':v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot',"'":'&#39;'}[c]));
function addCss(){if($('dg54css'))return;const s=document.createElement('style');s.id='dg54css';s.textContent=`
.dg54-week{background:#dcfce7;color:#166534;border:1px solid #bbf7d0;border-radius:12px;padding:12px;font-weight:800;margin:10px 0}.dg54-week small{display:block;font-weight:700;margin-top:3px}.dg54-photo-tools{margin:12px 0;padding:12px;border:1px solid #d1d5db;border-radius:14px;background:#f9fafb}.dg54-photo-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(120px,1fr));gap:10px;margin-top:10px}.dg54-photo{position:relative;border:2px solid #16a34a;border-radius:12px;overflow:hidden;background:#fff}.dg54-photo.off{opacity:.5;border-color:#d1d5db}.dg54-photo img{display:block;width:100%;height:110px;object-fit:cover;cursor:zoom-in;background:#e5e7eb}.dg54-photo label{display:flex;align-items:center;gap:7px;padding:7px;margin:0;font-size:12px}.dg54-photo input{width:auto}.dg54-photo-actions{display:flex;gap:8px;flex-wrap:wrap;align-items:center}.dg54-photo-actions .btn{width:auto}.dg54-count{font-weight:800}.dg54-modal{position:fixed;inset:0;z-index:12000;background:rgba(0,0,0,.82);display:flex;align-items:center;justify-content:center;padding:18px}.dg54-modal.hidden{display:none!important}.dg54-modal img{max-width:96vw;max-height:88vh;object-fit:contain;border-radius:12px;background:#fff}.dg54-modal button{position:fixed;top:14px;right:14px}.dg54-local-status{margin-top:8px}.dg54-busy{opacity:.72;cursor:wait!important}#dayTotal{background:#dcfce7!important;color:#166534!important;border-color:#bbf7d0!important}#netTotal{display:none!important}
@media(max-width:700px){.dg54-photo-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.dg54-photo img{height:100px}}
`;document.head.appendChild(s)}
function removeManualPause(){const sel=$('pauseHours');if(sel){const label=document.querySelector('label[for="pauseHours"]');if(label)label.remove();sel.remove()}const net=$('netTotal');if(net)net.remove()}
function isoToday(){const d=new Date();return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0')}
function deDate(v){return typeof formatDateDE==='function'?formatDateDE(v):v}
function fmt(v){return typeof formatHours==='function'?formatHours(v):Number(v||0).toFixed(2).replace('.',',')}
async function refreshWeek(){let box=$('dg54WeekHours');const monthBox=$('employeeTimeBank');if(!monthBox)return;if(!box){box=document.createElement('div');box.id='dg54WeekHours';box.className='dg54-week';monthBox.insertAdjacentElement('beforebegin',box);}if(!navigator.onLine){box.innerHTML='Geleistete Wochenstunden: offline nicht verfügbar';return;}const a=auth();if(!a.employee||!a.pin)return;try{box.innerHTML='Geleistete Wochenstunden: werden geladen …';const d=await api({action:'getWeekData',employee:a.employee,pin:a.pin,referenceDate:isoToday()});box.innerHTML='Geleistete Wochenstunden: '+fmt(d.total||0)+' Std.<small>Woche '+deDate(d.start)+' bis '+deDate(d.end)+' · Montag bis Sonntag · tatsächliche Einsätze an Sonn- und Feiertagen werden mitgerechnet</small>';}catch(_e){box.innerHTML='Geleistete Wochenstunden: nicht verfügbar';}}
function finishDayUi(){removeManualPause();const day=$('dayTotal');if(day&&window.lastDayData){day.className='day-balance good';day.textContent='Heute: '+fmt(lastDayData.total||0)+' Std.';if(Number(lastDayData.automaticPauseHours||0)>0){day.title='Automatische Pause: '+fmt(lastDayData.automaticPauseHours)+' Std.'}}refreshWeek()}
const oldRenderDay=window.renderDay;
if(typeof oldRenderDay==='function')window.renderDay=function(){const r=oldRenderDay.apply(this,arguments);finishDayUi();return r};
removeManualPause();
window.loadMonth=async function(){const a=auth();if(!navigator.onLine){setMessage('monthStatus','Monatsübersicht benötigt Internet.','warn');return}try{setMessage('monthStatus','Monatsübersicht wird geladen …','info');const data=await api({action:'getMonthData',employee:a.employee,pin:a.pin,year:Number($('empYear').value),month:Number($('empMonth').value)});const ms=data.monthSummary||{},ys=data.yearSummary||{},dayMap={};(data.dayTotals||[]).forEach(x=>dayMap[x.date]=x);let html='<div class="total">Gesamt: '+fmt(data.total)+' Std.</div>';if(Number(data.automaticPauseTotal||0)>0)html+='<div class="status ok">Automatische Pausen berücksichtigt: '+fmt(data.automaticPauseTotal)+' Std.</div>';html+='<div class="status info">Dieser Monat: Urlaub '+Number(ms.vacationDays||0)+' Tag(e) · Krank '+Number(ms.sickDays||0)+' Tag(e) · Feiertage '+Number(ms.holidayDays||0)+' Tag(e) · Freizeitausgleich '+fmt(ms.compensatoryHours||0)+' Std. · Zeitguthaben '+fmt(data.timeBankBalance||0)+' Std.</div><div class="status info">Jahr '+Number(ys.year||$('empYear').value)+': Urlaub '+Number(ys.vacationUsed||0)+' Tag(e) · Krank '+Number(ys.sickDays||0)+' Tag(e) · Urlaub zustehend '+fmt(ys.vacationEntitlement)+' · Resturlaub '+fmt(ys.vacationRemaining)+' Tage</div>';const days={};(data.rows||[]).forEach(r=>{const d=r.date||'';if(!days[d])days[d]={date:d,rows:[],closed:true};days[d].rows.push(r);if(!r.closed)days[d].closed=false});html+=Object.keys(days).sort().map(d=>{const x=days[d],dt=dayMap[d]||{},net=dt.netHours!=null?dt.netHours:x.rows.reduce((s,r)=>s+Number(r.hours||0),0);const details=x.rows.map(r=>'<div class="entry" style="margin:8px 0 0"><strong>'+esc(r.customer)+'</strong> · '+fmt(r.hours)+' Std. '+(r.closed?'✓':'(offen)')+(r.isAdditionalAssignment?' <span class="muted">· Mitarbeit, eingetragen von '+esc(r.assignedBy||'')+' · '+esc(r.assignmentStatus||'Zugeordnet')+'</span>':'')+'</div>').join('');const pause=Number(dt.pauseHours||0)?'<div class="muted small">Automatische Pause: '+fmt(dt.pauseHours)+' Std. · Brutto '+fmt(dt.grossHours)+' Std.</div>':'';const resend=x.closed?'':' <button type="button" class="btn primary" style="padding:8px 10px;margin-left:8px" onclick="return event.preventDefault();event.stopPropagation();transmitOpenDay(\''+esc(x.date)+'\')">Jetzt übermitteln</button>';const light=x.closed?'🟢':'🔴',state=x.closed?'übermittelt':'offen';return '<details class="entry"><summary><span style="font-size:18px;margin-right:5px">'+light+'</span><strong>'+deDate(x.date)+'</strong> · <strong>'+fmt(net)+' Std.</strong> <span class="muted">('+state+')</span>'+resend+'</summary>'+pause+'<div style="margin-top:8px">'+details+'</div></details>'}).join('');if((data.statuses||[]).length){html+='<h3 style="margin-top:16px">Urlaub / Krank / Feiertag</h3>'+(data.statuses||[]).map(s=>'<div class="entry"><strong>'+deDate(s.date)+'</strong> · '+esc(s.status)+(Number(s.creditedHours||0)?' · '+fmt(s.creditedHours)+' Std. Gutschrift':'')+'</div>').join('')}$('monthResult').innerHTML=html;setMessage('monthStatus','✓ Monatsübersicht geladen.','ok')}catch(e){setMessage('monthStatus',e.message,'error')}};
const oldReportLinks=window.reportLinks;
window.reportLinks=function(r){let html='';if(r.customerSignatureUrl)html+='<a class="btn secondary" target="_blank" rel="noopener" href="'+esc(r.customerSignatureUrl)+'">Unterschrift öffnen</a>';const urls=String(r.photoUrls||'').split(' | ').filter(Boolean),ids=String(r.photoFileIds||'').split(',').map(x=>x.trim());urls.forEach((u,i)=>{const id=ids[i]||'';html+='<a class="btn secondary dg54-photo-link" target="_blank" rel="noopener" data-dg-photo-id="'+esc(id)+'" href="'+esc(u)+'">Bild '+(i+1)+' öffnen</a>'});return html||((typeof oldReportLinks==='function')?oldReportLinks(r):'')};
function thumb(id,href){return id?'https://drive.google.com/thumbnail?id='+encodeURIComponent(id)+'&sz=w700':href}
function addPhotoModal(){if($('dg54PhotoModal'))return;const m=document.createElement('div');m.id='dg54PhotoModal';m.className='dg54-modal hidden';m.innerHTML='<button class="btn secondary" type="button">Schließen</button><img alt="Baustellenbild">';m.querySelector('button').onclick=()=>m.classList.add('hidden');m.onclick=e=>{if(e.target===m)m.classList.add('hidden')};document.body.appendChild(m)}
function openPhoto(src){addPhotoModal();const m=$('dg54PhotoModal');m.querySelector('img').src=src;m.classList.remove('hidden')}
function updatePhotoCount(box){const all=[...box.querySelectorAll('.dg54-photo-check')],on=all.filter(x=>x.checked);const c=box.querySelector('.dg54-count');if(c)c.textContent=on.length+' von '+all.length+' Bildern ausgewählt';all.forEach(x=>x.closest('.dg54-photo').classList.toggle('off',!x.checked))}
window.dg54DownloadPhotos=async function(btn){const box=btn.closest('.dg54-photo-tools'),checks=[...box.querySelectorAll('.dg54-photo-check:checked')],ids=checks.map(x=>x.dataset.id).filter(Boolean);if(!ids.length){const st=box.querySelector('.dg54-photo-status');st.className='status warn dg54-photo-status';st.textContent='Bitte mindestens ein Bild markieren.';return}const card=box.closest('.report-card'),customer=(card&&card.querySelector('strong')?card.querySelector('strong').textContent.replace(/^🏢\s*/,''):'Objekt');const st=box.querySelector('.dg54-photo-status');try{btn.disabled=true;st.className='status info dg54-photo-status';st.textContent='Markierte Bilder werden als ZIP vorbereitet …';const r=await api(chefPayload({action:'createRegiePhotoZip',fileIds:ids,customer:customer}));const bytes=Uint8Array.from(atob(r.base64),c=>c.charCodeAt(0)),blob=new Blob([bytes],{type:'application/zip'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=r.fileName||'Regiebilder.zip';document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),30000);st.className='status ok dg54-photo-status';st.textContent='✓ '+Number(r.count||ids.length)+' Bild(er) als ZIP bereitgestellt.'}catch(e){st.className='status error dg54-photo-status';st.textContent='Bilder konnten nicht vorbereitet werden: '+e.message}finally{btn.disabled=false}}
const oldDayClosures=window.renderBossDayClosuresV48;
if(typeof oldDayClosures==='function')window.renderBossDayClosuresV48=function(rows){const r=oldDayClosures.apply(this,arguments);const cards=[...document.querySelectorAll('#dg48DayResult .dg48-day')];let n=0;(rows||[]).forEach(emp=>(emp.days||[]).forEach(d=>{const card=cards[n++];if(!card||!Number(d.pauseHours||0))return;const meta=card.querySelector('.muted.small');if(meta&&!card.querySelector('.dg54-pause-note')){const note=document.createElement('div');note.className='muted small dg54-pause-note';note.textContent='Brutto '+fmt(d.grossHours||0)+' Std. · automatische Pause '+fmt(d.pauseHours)+' Std.';meta.insertAdjacentElement('afterend',note)}}));return r};
addCss();
addPhotoModal();
removeManualPause();
})();


/* Compiled component v55-patch.js */
(function(){
'use strict';
const $=id=>document.getElementById(id);
const esc55=v=>String(v==null?'':v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmt55=v=>typeof formatHours==='function'?formatHours(v):Number(v||0).toFixed(2).replace('.',',');
let supplementMode=false;
function addCss(){if($('dg55css'))return;const s=document.createElement('style');s.id='dg55css';s.textContent=`
.dg55-supplement{display:inline-block;margin-left:7px;padding:3px 8px;border-radius:999px;background:#fff7ed;color:#9a3412;border:1px solid #fed7aa;font-size:12px;font-weight:800}.dg55-supplement-note{margin-top:5px;color:#9a3412;font-size:12px;font-weight:700}.dg55-after-close{margin:10px 0;padding:12px;border:1px solid #fed7aa;border-radius:12px;background:#fff7ed}.dg55-after-close .btn{width:100%;margin-top:8px}.dg55-active{border:2px solid #f59e0b!important;box-shadow:0 0 0 3px rgba(245,158,11,.12)}
`;document.head.appendChild(s)}
window.updateNetTotal=function(){};
window.performCloseDay=async function(){
  const a=auth(),date=$('date').value;
  const item={type:'closeDay',createdAt:Date.now(),payload:{action:'closeDay',employee:a.employee,pin:a.pin,date,signatureDataUrl:'',pauseHours:0}};
  if(!navigator.onLine){await queuePut(item);setMessage('closeStatus','🟠 Tagesabschluss offline gespeichert. Wird automatisch übertragen.','warn');await refreshQueueCount();return}
  try{setMessage('closeStatus','Tagesabschluss wird übertragen …','info');const res=await api(item.payload);setMessage('closeStatus',res.alreadyClosed?'Tag war bereits abgeschlossen.':'✅ Tag abgeschlossen. Der Abschluss ist im Chefbereich verfügbar.','ok');await loadDay()}
  catch(e){if(e&&e.dgType==='network'){await queuePut(item);setMessage('closeStatus','🟠 Tagesabschluss wurde offline vorgemerkt.','warn');await refreshQueueCount()}else setMessage('closeStatus','Tagesabschluss nicht möglich: '+(e&&e.message?e.message:'Unbekannter Fehler.'),'error')}
};
function addSupplementUi(){
  const day=$('dayTotal');if(!day)return;
  let box=$('dg55AfterClose');
  if(lastDayData&&lastDayData.closed){
    if(!box){box=document.createElement('div');box.id='dg55AfterClose';box.className='dg55-after-close';day.insertAdjacentElement('afterend',box)}
    box.innerHTML='<strong>Tag bereits abgeschlossen</strong><div class="small">Ein ungeplanter weiterer Einsatz kann als nachvollziehbarer Nachtrag erfasst werden.</div><button type="button" class="btn secondary" onclick="return dg55StartSupplement()">Nachtrag zu abgeschlossenem Tag erfassen</button>';
    box.classList.toggle('dg55-active',supplementMode);
    if(supplementMode)box.querySelector('button').textContent='Nachtragserfassung aktiv';
  }else if(box){box.remove();supplementMode=false}
}
window.dg55StartSupplement=function(){
  if(!lastDayData||!lastDayData.closed)return;
  if(!confirm('Der Tag wurde bereits abgeschlossen. Wirklich einen zusätzlichen Einsatz als Nachtrag erfassen?'))return;
  supplementMode=true;addSupplementUi();
  const card=$('workEntryCard');if(card){card.classList.add('dg55-active');card.scrollIntoView({behavior:'smooth',block:'start'})}
  setMessage('entryStatus','Nachtragserfassung aktiv. Der neue Eintrag wird mit Datum und Uhrzeit als Nachtrag gekennzeichnet.','warn');
};
function decorateEmployeeEntries(){
  const rows=[...document.querySelectorAll('#entries > .entry')];
  (lastDayData&&lastDayData.entries||[]).forEach((e,i)=>{if(!e.isSupplement||!rows[i])return;const first=rows[i].querySelector('strong');if(first&&!rows[i].querySelector('.dg55-supplement'))first.insertAdjacentHTML('afterend',' <span class="dg55-supplement">NACHTRAG</span>');if(e.supplementCreatedAt&&!rows[i].querySelector('.dg55-supplement-note'))rows[i].insertAdjacentHTML('beforeend','<div class="dg55-supplement-note">Nachtrag erfasst am '+esc55(e.supplementCreatedAt)+'</div>')});
}
const prevRenderDay=window.renderDay;
if(typeof prevRenderDay==='function')window.renderDay=function(){const r=prevRenderDay.apply(this,arguments);const day=$('dayTotal');if(day){day.className='day-balance good';day.textContent='Heute: '+fmt55(Number(lastDayData&&lastDayData.total||0))+' Std.'}decorateEmployeeEntries();addSupplementUi();return r};
window.saveEntry=async function(){
  const a=auth(),date=$('date').value,customer=$('customer').value.trim(),activity=$('activity').value.trim(),materialUsed=document.querySelector('input[name="materialUsed"]:checked').value==='yes',material=$('material').value.trim(),jobCompleted=document.querySelector('input[name="jobCompleted"]:checked').value==='yes';
  if(lastDayData&&lastDayData.closed&&!supplementMode){setMessage('entryStatus','Der Tag ist abgeschlossen. Bitte zuerst „Nachtrag zu abgeschlossenem Tag erfassen“ wählen.','warn');addSupplementUi();return}
  const startMinutes=timeInputMinutes('start'),endMinutes=timeInputMinutes('end');
  if(!customer){setMessage('entryStatus','Bitte Kunde / Baustelle eintragen.','error');return}
  if(startMinutes===null||endMinutes===null){setMessage('entryStatus','Bitte gültige Von-/Bis-Zeit eintragen.','error');return}
  const startTime=String(Math.floor(startMinutes/60)).padStart(2,'0')+':'+String(startMinutes%60).padStart(2,'0');const endTime=String(Math.floor(endMinutes/60)).padStart(2,'0')+':'+String(endMinutes%60).padStart(2,'0');$('start').value=startTime;$('end').value=endTime;const hours=calculateHours();
  if(!(hours>0&&hours<=24)){setMessage('entryStatus','Arbeitszeit konnte nicht berechnet werden. Bitte Von/Bis prüfen.','error');return}if(!activity){setMessage('entryStatus','Bitte die ausgeführte Tätigkeit eintragen.','error');return}if(materialUsed&&!material){setMessage('entryStatus','Bitte Material eintragen.','error');return}
  const entry={clientId:uid(),employee:a.employee,employeePin:a.pin,date,customer,start:startTime,end:endTime,startMinutes,endMinutes,hours,activity,syncCalendar:false,materialUsed,material,additionalEmployeesUsed:false,additionalEmployees:[],additionalEmployeeHours:[],photos:preparedPhotos.slice(),customerSignature:noCustomerPresent?'':customerPad.dataUrl(),sourceCalendarEventId:selectedCalendarEventId,replacementAssignmentId:'',jobStatus:jobCompleted?'Abgeschlossen':'Laufend',isSupplement:Boolean(supplementMode)};
  const item={type:'saveEntry',createdAt:Date.now(),payload:{action:'saveEntry',employee:a.employee,pin:a.pin,entry}};
  if(!navigator.onLine){await queuePut(item);setMessage('entryStatus',supplementMode?'🟠 Nachtrag offline gespeichert. Automatische Übertragung folgt bei Internetverbindung.':'🟠 Offline gespeichert. Automatische Übertragung folgt bei Internetverbindung.','warn');resetEntry();supplementMode=false;await refreshQueueCount();return}
  try{setMessage('entryStatus',supplementMode?'Nachtrag wird übertragen …':'Eintrag wird übertragen …','info');const day=await api(item.payload);lastDayData=day;renderDay();resetEntry();supplementMode=false;const card=$('workEntryCard');if(card)card.classList.remove('dg55-active');await loadCalendarEvents();setMessage('entryStatus',entry.isSupplement?'✅ Nachtrag gespeichert und mit Zeitstempel gekennzeichnet.':'✅ Eintrag gespeichert. Der Auftrag steht jetzt im Chefbereich unter Regieberichte.','ok')}
  catch(e){if(e&&e.dgType==='network'){await queuePut(item);setMessage('entryStatus','🟠 Keine Serververbindung. Eintrag wurde lokal gespeichert.','warn');resetEntry();supplementMode=false;await refreshQueueCount()}else setMessage('entryStatus','❌ Auftrag nicht gespeichert: '+(e&&e.message?e.message:'Unbekannter Serverfehler.'),'error')}
};
addCss();
})();


/* Compiled component v56-patch.js */
(function(){
'use strict';
const $=id=>document.getElementById(id);
const fmt56=v=>typeof formatHours==='function'?formatHours(v):Number(v||0).toFixed(2).replace('.',',');
function css(){if($('dg56css'))return;const s=document.createElement('style');s.id='dg56css';s.textContent=`
#dg55AfterClose .btn{background:#b91c1c!important;color:#fff!important;border-color:#b91c1c!important}
.dg56-update-btn{background:#166534!important;color:#fff!important}
.dg56-needs-refresh{border:2px solid #f59e0b;border-radius:12px;padding:10px;margin:10px 0;background:#fff7ed;color:#9a3412;font-weight:800}
`;document.head.appendChild(s)}
function dayUpdateButton(){return [...document.querySelectorAll('#employeeView button.btn')].find(b=>(b.textContent||'').trim()==='Tag aktualisieren')||null}
function ensureUpdateStatus(){const b=dayUpdateButton();if(!b)return null;let st=$('dg56DayUpdateStatus');if(!st){st=document.createElement('div');st.id='dg56DayUpdateStatus';b.insertAdjacentElement('afterend',st)}return st}
function styleUi(){
  const supp=$('#dg55AfterClose button');
  if(supp){supp.classList.remove('secondary','success','primary');supp.classList.add('danger')}
  const b=dayUpdateButton();
  if(b){b.classList.remove('secondary','primary','danger');b.classList.add('success','dg56-update-btn');b.setAttribute('onclick','dg56UpdateDay()')}
  const old=document.querySelectorAll('#workEntryCard .dg54-local-status');old.forEach(x=>{const entry=$('entryStatus');if(entry&&x.textContent.trim()===entry.textContent.trim())x.remove()});
  const st=ensureUpdateStatus();
  if(st&&typeof lastDayData!=='undefined'&&lastDayData&&lastDayData.closed&&lastDayData.closureNeedsRefresh){st.className='dg56-needs-refresh';st.textContent='Nachtrag gespeichert. Bitte „Tag aktualisieren“ drücken, damit der Tagesabschluss mit den neuen Stunden abschließend neu berechnet wird.'}
}
window.dg56UpdateDay=async function(){
  const b=dayUpdateButton(),st=ensureUpdateStatus(),a=typeof auth==='function'?auth():{};
  if(!a.employee||!a.pin){if(st){st.className='status error';st.textContent='Anmeldung fehlt.'}return}
  try{
    if(b)b.disabled=true;
    if(st){st.className='status info';st.textContent=(typeof lastDayData!=='undefined'&&lastDayData&&lastDayData.closed&&lastDayData.closureNeedsRefresh)?'Tagesabschluss wird nach dem Nachtrag aktualisiert …':'Tag wird aktualisiert …'}
    if(typeof lastDayData!=='undefined'&&lastDayData&&lastDayData.closed&&lastDayData.closureNeedsRefresh){
      const res=await api({action:'refreshClosedDay',employee:a.employee,pin:a.pin,date:$('date').value});
      lastDayData=res;localStorage.setItem('dg_day_'+a.employee+'_'+$('date').value,JSON.stringify(lastDayData));renderDay();
      if(st){st.className='status ok';st.textContent='✅ Tagesabschluss aktualisiert. Nachtrag und neue Tagessumme sind vollständig ans Büro übertragen.'}
    }else{
      await loadDay();if(st){st.className='status ok';st.textContent='✅ Tag aktualisiert.'}
    }
  }catch(e){if(st){st.className='status error';st.textContent='Aktualisierung nicht möglich: '+(e&&e.message?e.message:'Unbekannter Fehler.')}}finally{if(b)b.disabled=false;styleUi()}
};
const oldSave=window.saveEntry;
if(typeof oldSave==='function')window.saveEntry=async function(){
  const before=(typeof lastDayData!=='undefined'&&lastDayData)?String(lastDayData.latestSupplementAt||''):'';
  const r=await oldSave.apply(this,arguments);
  if(typeof lastDayData!=='undefined'&&lastDayData&&lastDayData.supplementSaved){
    setMessage('entryStatus','✅ Nachtrag erfolgreich hinzugefügt. Im Chefbereich wurde ein neuer Regiebericht angelegt. Bitte jetzt „Tag aktualisieren“ drücken, damit der Tagesabschluss abschließend neu berechnet wird.','ok');
    const st=ensureUpdateStatus();if(st){st.className='dg56-needs-refresh';st.textContent='Bitte Tagesabschluss abschließend aktualisieren: „Tag aktualisieren“ drücken.'}
  }else if(typeof lastDayData!=='undefined'&&lastDayData&&lastDayData.closureNeedsRefresh&&String(lastDayData.latestSupplementAt||'')!==before){
    setMessage('entryStatus','✅ Nachtrag gespeichert. Bitte jetzt „Tag aktualisieren“ drücken, damit der Tagesabschluss neu berechnet wird.','ok');
  }
  styleUi();return r;
};
const oldRender=window.renderDay;
if(typeof oldRender==='function')window.renderDay=function(){const r=oldRender.apply(this,arguments);const day=$('dayTotal');if(day&&typeof lastDayData!=='undefined'&&lastDayData){day.className='day-balance good';day.textContent='Heute: '+fmt56(lastDayData.total||0)+' Std.'}setTimeout(styleUi,0);return r};
css();
styleUi();
})();


/* Compiled component v57-patch.js */
(function(){
'use strict';
const $=id=>document.getElementById(id);
const esc57=v=>String(v==null?'':v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmt57=v=>typeof formatHours==='function'?formatHours(v):Number(v||0).toFixed(2).replace('.',',');
function addCss(){if($('dg57css'))return;const s=document.createElement('style');s.id='dg57css';s.textContent=`
.dg57-transmitted{margin-top:5px;font-size:12px;font-weight:700;color:#475569}.dg57-transmitted.chef{color:#1e3a5f}.dg57-transmitted.employee{color:#64748b}
`;document.head.appendChild(s)}
function onlyDate(v){const x=String(v||'').trim();return x.includes(' ')?x.split(' ')[0]:x}
function addLine(host,text,chef){if(!host||!text)return;let x=host.querySelector(':scope > .dg57-transmitted');if(!x){x=document.createElement('div');x.className='dg57-transmitted '+(chef?'chef':'employee');host.appendChild(x)}x.textContent=(chef?'Übertragen am ':'Übertragen am ')+text}
function decorateEmployeeDay(){const rows=[...document.querySelectorAll('#entries > .entry')],data=(typeof lastDayData!=='undefined'&&lastDayData&&lastDayData.entries)||[];rows.forEach((row,i)=>{row.querySelectorAll('.dg55-supplement-note').forEach(x=>x.remove());const e=data[i]||{};const d=e.transmittedDate||onlyDate(e.supplementCreatedAt);if(d)addLine(row,d,false)})}
const oldRender=window.renderDay;
if(typeof oldRender==='function')window.renderDay=function(){const r=oldRender.apply(this,arguments);decorateEmployeeDay();return r};
const oldLoadMonth=window.loadMonth;
if(typeof oldLoadMonth==='function')window.loadMonth=async function(){const r=await oldLoadMonth.apply(this,arguments);try{const a=auth();if(!navigator.onLine||!a.employee||!a.pin)return r;const data=await api({action:'getMonthData',employee:a.employee,pin:a.pin,year:Number($('empYear').value),month:Number($('empMonth').value)});const byDate={};(data.rows||[]).forEach(x=>{(byDate[x.date]||(byDate[x.date]=[])).push(x)});[...document.querySelectorAll('#monthResult details.entry')].forEach(detail=>{const summary=detail.querySelector('summary');const m=(summary&&summary.textContent||'').match(/(\d{2}\.\d{2}\.\d{4})/);if(!m)return;const p=m[1].split('.'),iso=p[2]+'-'+p[1]+'-'+p[0],items=byDate[iso]||[],rows=[...detail.querySelectorAll(':scope > div .entry')];rows.forEach((row,i)=>{const d=(items[i]||{}).transmittedDate;if(d)addLine(row,d,false)})})}catch(_e){}return r};
window.renderBossEntries=function(x){return (x.entries||[]).map((e,i)=>'<div class="entry"><strong>'+formatDateDE(e.date)+' · '+esc57(e.customer)+' · '+fmt57(e.hours)+' Std.</strong>'+(e.isAdditionalAssignment?' · Mitarbeit':'')+(e.isSupplement?' <span class="dg55-supplement">NACHTRAG</span>':'')+'<br><span class="muted">'+esc57(e.activity||'')+'</span>'+(e.transmittedAt?'<div class="dg57-transmitted chef">Übertragen am '+esc57(e.transmittedAt)+'</div>':'')+'<div class="admin-actions" style="margin-top:8px"><button class="btn secondary" onclick="return openObjectView('+i+')">🏢 Objekt aufrufen</button><button class="btn secondary" onclick="return setBossDetailTab(\'adjust\')">± Stunden anpassen</button></div></div>').join('')||'<div class="muted">Keine Aufträge.</div>'};
window.openObjectView=async function(entryIndex){const x=(window.__bossMonthRows||[])[bossDetailIndex],e=(x&&x.entries||[])[entryIndex];if(!e)return;try{setMessage('bossStatus','Objekt wird geladen …','info');const o=await api(chefPayload({action:'getObjectReports',objectId:e.objectId||'',customer:e.customer}));let h=bossToolbar(x)+'<button class="btn secondary" onclick="return renderBossActions()">← Zurück zu '+esc57(x.employee)+'</button><div class="object-summary"><strong>🏢 '+esc57(o.displayName||e.customer)+'</strong><br>Berichte: '+Number(o.reportCount||0)+' · Gesamtstunden: '+fmt57(o.totalHours)+' · Mitarbeiter: '+esc57((o.employees||[]).join(', '))+'</div>';h+=(o.reports||[]).map(r=>'<div class="report-card"><strong>'+formatDateDE(r.date)+' · '+esc57(r.employee)+' · '+fmt57(r.hours)+' Std.</strong>'+(r.isSupplement?' <span class="dg55-supplement">NACHTRAG</span>':'')+'<div class="report-meta">'+esc57(r.start)+'–'+esc57(r.end)+' · '+esc57(r.regieStatus)+'</div><div>'+esc57(r.activity||'')+'</div>'+(r.transmittedAt?'<div class="dg57-transmitted chef">Übertragen am '+esc57(r.transmittedAt)+'</div>':'')+(r.materialUsed?'<div class="report-meta"><strong>Material:</strong> '+esc57(r.material||'')+'</div>':'')+'<div class="report-actions">'+reportLinks(r)+'</div></div>').join('');$('bossResult').innerHTML=h;clearMessage('bossStatus')}catch(err){setMessage('bossStatus',err.message,'error')}};
const oldClosures=window.renderBossDayClosuresV48;
if(typeof oldClosures==='function')window.renderBossDayClosuresV48=function(rows){const r=oldClosures.apply(this,arguments);let dayIndex=0;const dayCards=[...document.querySelectorAll('#dg48DayResult .dg48-day')];(rows||[]).forEach(emp=>(emp.days||[]).forEach(day=>{const card=dayCards[dayIndex++];if(!card)return;const reports=[...card.querySelectorAll('.dg49-report')];(day.reports||[]).forEach((rep,i)=>{if(reports[i]&&rep.transmittedAt)addLine(reports[i],rep.transmittedAt,true)})}));return r};
addCss();
})();


/* Compiled component v59-patch.js */
(function(){
'use strict';
const $=id=>document.getElementById(id);
const esc59=v=>String(v==null?'':v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmt59=v=>typeof formatHours==='function'?formatHours(v):Number(v||0).toFixed(2).replace('.',',');
let pendingDeleteId='';
let editIndex=-1;
function addCss(){if($('dg59css'))return;const s=document.createElement('style');s.id='dg59css';s.textContent=`
.dg59-actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:8px}.dg59-actions .btn{width:auto}.dg59-modal{position:fixed;inset:0;z-index:13000;background:rgba(0,0,0,.5);display:flex;align-items:center;justify-content:center;padding:18px}.dg59-modal.hidden{display:none!important}.dg59-modal-card{background:#fff;border-radius:18px;width:min(100%,680px);max-height:92vh;overflow:auto;padding:20px;box-shadow:0 18px 60px rgba(0,0,0,.3)}.dg59-locked{background:#f3f4f6!important;color:#4b5563!important}.dg59-lock-note{padding:10px;border-radius:10px;background:#e0f2fe;color:#075985;font-weight:700;margin:10px 0}.dg59-cal-day{border:1px solid #d1d5db;border-radius:14px;margin-top:10px;overflow:hidden;background:#fff}.dg59-cal-head{width:100%;border:0;background:#f8fafc;padding:13px 14px;display:flex;align-items:center;justify-content:space-between;gap:10px;font-weight:800;text-align:left}.dg59-cal-head.today{background:#e0f2fe;color:#075985}.dg59-cal-title{display:flex;flex-direction:column;gap:2px}.dg59-cal-title small{font-weight:600;color:#64748b}.dg59-cal-meta{display:flex;align-items:center;gap:10px;white-space:nowrap}.dg59-cal-count{font-size:12px;color:#64748b}.dg59-cal-icon{font-size:22px;line-height:1}.dg59-cal-body{padding:0 14px 10px}.dg59-cal-body.hidden{display:none!important}.dg59-cal-body .entry:first-child{border-top:0}.dg59-delete-warning{background:#fee2e2;color:#991b1b;padding:11px;border-radius:12px;font-weight:700;margin:10px 0}
@media(max-width:700px){.dg59-actions{display:grid;grid-template-columns:1fr 1fr}.dg59-actions .btn{width:100%}.dg59-cal-head{padding:12px}.dg59-cal-meta{gap:7px}}
`;document.head.appendChild(s)}
function addModals(){
  if(!$('dg59EditModal')){const m=document.createElement('div');m.id='dg59EditModal';m.className='dg59-modal hidden';m.innerHTML=`<div class="dg59-modal-card"><h2 style="margin-top:0">Eintrag bearbeiten</h2><div class="dg59-lock-note">Zeitangaben sind gesperrt und können vom Mitarbeiter nicht verändert werden. Falsche Zeiten kann nur das Büro korrigieren.</div><label>Datum</label><input id="dg59EditDate" class="dg59-locked" disabled><div class="grid2"><div><label>Von</label><input id="dg59EditStart" class="dg59-locked" disabled></div><div><label>Bis</label><input id="dg59EditEnd" class="dg59-locked" disabled></div></div><label>Stunden</label><input id="dg59EditHours" class="dg59-locked" disabled><label>Kunde / Baustelle</label><input id="dg59EditCustomer"><label>Ausgeführte Tätigkeit</label><textarea id="dg59EditActivity"></textarea><label style="display:flex;align-items:center;gap:8px"><input id="dg59EditMaterialUsed" type="checkbox" style="width:auto" onchange="dg59ToggleMaterial()"> Material verbaut</label><div id="dg59EditMaterialWrap"><label>Material</label><textarea id="dg59EditMaterial"></textarea></div><label>Auftragsstatus</label><select id="dg59EditJobStatus"><option value="Abgeschlossen">Abgeschlossen</option><option value="Laufend">Laufend</option></select><div id="dg59EditSignatureNote" class="muted small" style="margin-top:10px"></div><div id="dg59EditStatus"></div><div class="button-row" style="margin-top:14px"><button type="button" class="btn success" onclick="return dg59SaveEdit()">Änderungen speichern</button><button type="button" class="btn secondary" onclick="return dg59CloseEdit()">Abbrechen</button></div></div>`;document.body.appendChild(m)}
  if(!$('dg59DeleteModal')){const m=document.createElement('div');m.id='dg59DeleteModal';m.className='dg59-modal hidden';m.innerHTML=`<div class="dg59-modal-card" style="max-width:480px"><h2 style="margin-top:0">Eintrag wirklich löschen?</h2><div class="dg59-delete-warning">Der Eintrag wird dauerhaft entfernt. Diese Aktion kann nicht rückgängig gemacht werden.</div><div class="button-row"><button type="button" class="btn danger" onclick="return dg59ConfirmDelete()">Ja, Eintrag löschen</button><button type="button" class="btn secondary" onclick="return dg59CancelDelete()">Nein</button></div></div>`;document.body.appendChild(m)}
}
window.dg59ToggleMaterial=function(){const used=$('dg59EditMaterialUsed').checked;$('dg59EditMaterialWrap').classList.toggle('hidden',!used)};
window.dg59OpenEdit=function(index){
  const e=(lastDayData&&lastDayData.entries||[])[index];
  if(!e||e.isAdditionalAssignment)return;
  if(lastDayData.closed){setMessage('entryStatus','Der Tag ist bereits abgeschlossen. Bearbeiten ist nicht mehr möglich.','warn');return}
  editIndex=index;
  $('dg59EditDate').value=typeof formatDateDE==='function'?formatDateDE(e.date):e.date;
  $('dg59EditStart').value=e.start||'';$('dg59EditEnd').value=e.end||'';$('dg59EditHours').value=fmt59(e.hours)+' Std.';
  $('dg59EditCustomer').value=e.customer||'';$('dg59EditActivity').value=e.activity||'';
  $('dg59EditMaterialUsed').checked=!!e.materialUsed;$('dg59EditMaterial').value=e.material||'';
  $('dg59EditJobStatus').value=e.jobStatus||'Abgeschlossen';
  $('dg59EditSignatureNote').textContent=e.customerSignatureUrl?'Kundenunterschrift vorhanden – sie bleibt unverändert gespeichert.':'Keine Kundenunterschrift gespeichert.';
  dg59ToggleMaterial();if(typeof clearMessage==='function')clearMessage('dg59EditStatus');$('dg59EditModal').classList.remove('hidden')
};
window.dg59CloseEdit=function(){editIndex=-1;$('dg59EditModal').classList.add('hidden')};
window.dg59SaveEdit=async function(){
  const e=(lastDayData&&lastDayData.entries||[])[editIndex];if(!e)return;
  const customer=$('dg59EditCustomer').value.trim(),activity=$('dg59EditActivity').value.trim(),materialUsed=$('dg59EditMaterialUsed').checked,material=$('dg59EditMaterial').value.trim(),jobStatus=$('dg59EditJobStatus').value;
  if(!customer){setMessage('dg59EditStatus','Bitte Kunde / Baustelle eintragen.','error');return}if(!activity){setMessage('dg59EditStatus','Bitte die ausgeführte Tätigkeit eintragen.','error');return}if(materialUsed&&!material){setMessage('dg59EditStatus','Bitte Material eintragen.','error');return}
  try{setMessage('dg59EditStatus','Änderungen werden gespeichert …','info');const a=auth();const day=await api({action:'updateEmployeeEntry',employee:a.employee,pin:a.pin,entryId:e.id,item:{customer,activity,materialUsed,material,jobStatus}});lastDayData=day;localStorage.setItem('dg_day_'+a.employee+'_'+$('date').value,JSON.stringify(day));dg59CloseEdit();renderDay();setMessage('entryStatus','✅ Eintrag wurde aktualisiert. Zeit und Stunden blieben unverändert.','ok')}catch(err){setMessage('dg59EditStatus',err&&err.message?err.message:'Änderung nicht möglich.','error')}
};
window.deleteEntry=function(id){
  if(!id)return;if(lastDayData&&lastDayData.closed){setMessage('entryStatus','Der Tag ist bereits abgeschlossen. Löschen ist nicht mehr möglich.','warn');return}
  pendingDeleteId=String(id);$('dg59DeleteModal').classList.remove('hidden')
};
window.dg59CancelDelete=function(){pendingDeleteId='';$('dg59DeleteModal').classList.add('hidden')};
window.dg59ConfirmDelete=async function(){const id=pendingDeleteId;window.dg59CancelDelete();if(!id)return;if(!navigator.onLine){setMessage('entryStatus','Löschen benötigt eine Internetverbindung.','warn');return}try{setMessage('entryStatus','Eintrag wird gelöscht …','info');const a=auth();lastDayData=await api({action:'deleteEntry',id,employee:a.employee,date:$('date').value,pin:a.pin});localStorage.setItem('dg_day_'+a.employee+'_'+$('date').value,JSON.stringify(lastDayData));renderDay();setMessage('entryStatus','✅ Eintrag wurde gelöscht.','ok')}catch(err){setMessage('entryStatus',err&&err.message?err.message:'Löschen nicht möglich.','error')}};
function decorateDayEntries(){
  const entries=(lastDayData&&lastDayData.entries)||[],rows=[...document.querySelectorAll('#entries > .entry')];
  rows.forEach((row,i)=>{const e=entries[i];if(!e||e.isAdditionalAssignment||lastDayData.closed)return;const oldDelete=[...row.querySelectorAll('button')].find(b=>(b.textContent||'').includes('Eintrag löschen'));if(!oldDelete)return;let actions=row.querySelector('.dg59-actions');if(!actions){actions=document.createElement('div');actions.className='dg59-actions';oldDelete.parentNode.insertBefore(actions,oldDelete);actions.appendChild(oldDelete)}if(!actions.querySelector('.dg59-edit')){const b=document.createElement('button');b.type='button';b.className='btn success dg59-edit';b.textContent='Eintrag bearbeiten';b.onclick=()=>dg59OpenEdit(i);actions.insertBefore(b,actions.firstChild)}oldDelete.style.marginTop='';oldDelete.classList.add('dg59-delete')})
}
const oldRenderDay59=window.renderDay;
if(typeof oldRenderDay59==='function')window.renderDay=function(){const r=oldRenderDay59.apply(this,arguments);decorateDayEntries();return r};
function datePlus(iso,days){const p=iso.split('-').map(Number),d=new Date(p[0],p[1]-1,p[2]+days,12,0,0);return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0')}
function calKey(iso){return 'dg59Cal_'+iso.replace(/-/g,'')}
function eventHtml(event,index){const location=event.location?'<br><span class="muted">📍 '+esc59(event.location)+'</span>':'',description=event.description?'<br><span class="muted">'+esc59(event.description)+'</span>':'',time=event.allDay?'Ganztägig':esc59(event.startTime)+' - '+esc59(event.endTime);return `<div class="entry"><strong>${time}</strong><br><strong>${esc59(event.title||'Termin')}</strong>${location}${description}<div class="button-row" style="margin-top:8px"><button class="btn primary" data-index="${index}" onclick="return takeCalendarEvent(Number(this.dataset.index))">Auftrag übernehmen</button>${event.location?`<button class="btn secondary" data-location="${esc59(event.location)}" onclick="return openNavigation(this.dataset.location)">Navigation</button>`:''}</div></div>`}
window.dg59ToggleCalendarDay=function(iso){const body=$(calKey(iso)),head=document.querySelector('[data-dg59-cal="'+iso+'"]');if(!body||!head)return;const opening=body.classList.contains('hidden');body.classList.toggle('hidden',!opening);head.setAttribute('aria-expanded',opening?'true':'false');const icon=head.querySelector('.dg59-cal-icon');if(icon)icon.textContent=opening?'−':'+'};
window.renderCalendarEvents=function(events){
  events=Array.isArray(events)?events:[];window.__dgCalendarEvents=events;
  const today=typeof localDate==='function'?localDate():new Date().toISOString().slice(0,10),dates=[today,datePlus(today,1),datePlus(today,2)],labels=['Heute','Morgen','Übermorgen'];
  const groups={};dates.forEach(d=>groups[d]=[]);events.forEach((e,i)=>{if(groups[e.startDate])groups[e.startDate].push({event:e,index:i})});
  $('calendarEvents').innerHTML=dates.map((d,di)=>{const list=groups[d]||[],open=di===0,count=list.length,body=list.length?list.map(x=>eventHtml(x.event,x.index)).join(''):'<div class="muted" style="padding:12px 0">Keine Termine.</div>';return `<div class="dg59-cal-day"><button type="button" class="dg59-cal-head ${di===0?'today':''}" data-dg59-cal="${d}" aria-expanded="${open?'true':'false'}" onclick="return dg59ToggleCalendarDay('${d}')"><span class="dg59-cal-title"><span>${labels[di]} · ${typeof formatDateDE==='function'?formatDateDE(d):d}</span><small>${count===1?'1 Termin':count+' Termine'}</small></span><span class="dg59-cal-meta"><span class="dg59-cal-icon">${open?'−':'+'}</span></span></button><div id="${calKey(d)}" class="dg59-cal-body${open?'':' hidden'}">${body}</div></div>`}).join('')
};
addCss();
addModals();
})();


/* Compiled component v61-patch.js */
(function(){
'use strict';
const $=id=>document.getElementById(id);
const esc61=v=>String(v==null?'':v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let loadingEmployees61=false,minWage61=null;
function renameAdminHeading61(){document.querySelectorAll('.dg48-head h2,.card > h2').forEach(h=>{const txt=String(h.textContent||'').trim();if(txt.startsWith('Mitarbeiterverwaltung')&&txt!=='Mitarbeiterverwaltung')h.textContent='Mitarbeiterverwaltung'})}
function ensureWageField61(){if($('adminHourlyWage'))return;const sections=[...document.querySelectorAll('.admin-section')],payout=sections.find(s=>{const h=s.querySelector(':scope > h3');return h&&String(h.textContent||'').trim().startsWith('6. Auszahlung')});if(!payout)return;const wrap=document.createElement('div');wrap.id='dg61WageWrap';wrap.innerHTML='<label for="adminHourlyWage">Stundenlohn brutto</label><input id="adminHourlyWage" inputmode="decimal" placeholder="z. B. 26,50"><div id="dg61WageStatus" class="muted small" style="margin-top:6px"></div>';const paymentLabel=[...payout.querySelectorAll(':scope > label')].find(l=>String(l.textContent||'').includes('Auszahlungsart'));if(paymentLabel)payout.insertBefore(wrap,paymentLabel);else payout.prepend(wrap);$('adminHourlyWage').addEventListener('input',()=>checkWage61(false));$('adminHourlyWage').addEventListener('blur',()=>checkWage61(true));const type=$('adminEmploymentType');if(type)type.addEventListener('change',()=>checkWage61(false));const entry=$('adminEntryDate');if(entry)entry.addEventListener('change',()=>loadMinimumWage61().then(()=>checkWage61(false)));loadMinimumWage61()}
function isoToday61(){const d=new Date();return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0')}
function parseMoney61(v){const n=Number(String(v==null?'':v).trim().replace(',','.'));return Number.isFinite(n)?n:0}
function fmtMoney61(v){return Number(v||0).toFixed(2).replace('.',',')}
async function loadMinimumWage61(){if(!navigator.onLine||typeof window.api!=='function')return null;const entry=$('adminEntryDate')&&$('adminEntryDate').value,today=isoToday61(),date=entry&&entry>today?entry:today;try{const r=await window.api({action:'getMinimumWage',date});minWage61=r||null;checkWage61(false);return minWage61}catch(_e){return null}}
function checkWage61(showBlank){const input=$('adminHourlyWage'),st=$('dg61WageStatus');if(!input||!st)return true;const type=$('adminEmploymentType')?$('adminEmploymentType').value:'';if(type==='Azubi'){st.className='status info';st.textContent='Azubi: allgemeiner gesetzlicher Mindestlohn wird hier nicht geprüft.';return true}const wage=parseMoney61(input.value);if(!wage){st.className=showBlank?'status warn':'muted small';st.textContent=showBlank?'Bitte Brutto-Stundenlohn eintragen.':(minWage61&&minWage61.amount?'Gesetzlicher Mindestlohn: '+fmtMoney61(minWage61.amount)+' €/Std. ab '+formatDateDE(minWage61.from):'');return false}if(minWage61&&Number(minWage61.amount)>0&&wage+0.0001<Number(minWage61.amount)){st.className='status error';st.textContent='Stundenlohn zu niedrig. Mindestlohn: '+fmtMoney61(minWage61.amount)+' €/Std. ab '+formatDateDE(minWage61.from)+'.';return false}st.className='status ok';st.textContent=minWage61&&minWage61.amount?'✓ Mindestlohn eingehalten ('+fmtMoney61(minWage61.amount)+' €/Std.).':'✓ Stundenlohn eingetragen.';return true}
function renderEmployeeSelect61(rows){window.__employeeAdminRows=Array.isArray(rows)?rows:[];const select=$('adminEmployeeSelect');if(!select)return;const previous=select.value,q=String($('adminEmployeeSearch')?$('adminEmployeeSearch').value:'').trim().toLocaleLowerCase('de-DE'),options=window.__employeeAdminRows.map((x,i)=>({x,i})).filter(o=>!q||[o.x.name,o.x.firstName,o.x.lastName,o.x.personnelNumber].some(v=>String(v||'').toLocaleLowerCase('de-DE').includes(q)));select.innerHTML='<option value="">Bitte Mitarbeiter wählen</option>'+options.map(o=>'<option value="'+o.i+'">'+esc61(o.x.name)+(o.x.personnelNumber?' · PN '+esc61(o.x.personnelNumber):'')+(o.x.active?'':' (inaktiv)')+'</option>').join('');if(previous!==''&&options.some(o=>String(o.i)===String(previous)))select.value=previous;const tb=$('adminTimeBankEmployee');if(tb){const old=tb.value;tb.innerHTML='<option value="">Bitte Mitarbeiter wählen</option>'+window.__employeeAdminRows.map(x=>'<option value="'+esc61(x.name)+'">'+esc61(x.name)+(x.active?'':' (inaktiv)')+'</option>').join('');if(window.__employeeAdminRows.some(x=>x.name===old))tb.value=old}}
const oldRenderAdmin61=window.renderEmployeeAdminList;
window.renderEmployeeAdminList=function(rows){if(typeof oldRenderAdmin61==='function')oldRenderAdmin61.apply(this,arguments);renderEmployeeSelect61(rows)};
window.filterEmployeeAdminOptions=function(){renderEmployeeSelect61(window.__employeeAdminRows||[])};
window.dg61LoadEmployeeAdmin=async function(force){if(loadingEmployees61||!navigator.onLine)return;const select=$('adminEmployeeSelect');if(!select)return;if(!force&&Array.isArray(window.__employeeAdminRows)&&window.__employeeAdminRows.length){renderEmployeeSelect61(window.__employeeAdminRows);return}loadingEmployees61=true;const oldHtml=select.innerHTML;select.disabled=true;select.innerHTML='<option value="">Bestandsmitarbeiter werden geladen …</option>';try{const rows=await window.api(chefPayload({action:'getEmployeeAdminData'}));renderEmployeeSelect61(rows||[]);if(!(rows||[]).length)select.innerHTML='<option value="">Keine Bestandsmitarbeiter gefunden</option>'}catch(e){select.innerHTML=oldHtml||'<option value="">Bitte Mitarbeiter wählen</option>';if(typeof setMessage==='function')setMessage('employeeAdminStatus','Bestandsmitarbeiter konnten nicht geladen werden: '+(e&&e.message?e.message:'Unbekannter Fehler.'),'error')}finally{select.disabled=false;loadingEmployees61=false}};
const oldEditAdmin61=window.editEmployeeAdmin;
if(typeof oldEditAdmin61==='function')window.editEmployeeAdmin=function(i){const r=oldEditAdmin61.apply(this,arguments);ensureWageField61();const x=(window.__employeeAdminRows||[])[i];if($('adminHourlyWage'))$('adminHourlyWage').value=x&&Number(x.hourlyWage)>0?fmtMoney61(x.hourlyWage):'';minWage61=x&&x.minimumWage?x.minimumWage:minWage61;checkWage61(false);return r};
const oldClearAdmin61=window.clearEmployeeAdminForm;
if(typeof oldClearAdmin61==='function')window.clearEmployeeAdminForm=function(){const r=oldClearAdmin61.apply(this,arguments);ensureWageField61();if($('adminHourlyWage'))$('adminHourlyWage').value='';loadMinimumWage61();checkWage61(false);return r};
function activate61(){renameAdminHeading61();ensureWageField61()}
document.addEventListener('focusin',e=>{if(e.target&&e.target.id==='adminEmployeeSelect')dg61LoadEmployeeAdmin(false)});
activate61();
})();


/* Compiled component v62-patch.js */
(function(){
let calendarMode='three',rangeStart='',followToday=true,rangeRequest=0,rangePending=null;
function calendarRange(){
  const start=calendarMode==='week'?(weekStart||monday()):(followToday?today():(rangeStart||today()));
  const count=calendarMode==='week'?6:3;
  return {mode:calendarMode,start,end:add(start,count-1),days:Array.from({length:count},(_,i)=>add(start,i)),key:calendarMode+':'+start};
}
function selectCalendarRange(mode,start,live=false){
  calendarMode=mode;followToday=mode==='three'&&live;
  rangeStart=start||today();weekStart=monday(rangeStart);
  updateCalendarControls(calendarRange());
}
function updateCalendarControls(range){
  if($('dg62Date'))$('dg62Date').value=range.start;
  if($('dg62Date'))$('dg62Date').setAttribute('aria-label',range.mode==='three'?'Erster Tag der Drei-Tage-Ansicht':'Woche ausw\u00e4hlen');
  document.querySelectorAll('#dg62PlannerCard [data-calendar-view]').forEach(b=>{
    b.setAttribute('aria-pressed',String(b.dataset.calendarView===range.mode));
  });
}
function selectSavedDate(date){
  const range=calendarRange();
  if(date>=range.start&&date<=range.end)return;
  selectCalendarRange(calendarMode==='week'&&parse(date).getDay()!==0?'week':'three',date,false);
}
window.dg62OpenPlanner=function(){selectCalendarRange('three',today(),true);return dg62Load();};
'use strict';
const $=id=>document.getElementById(id);
const esc=v=>String(v==null?'':v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let weekStart='',workers=[],events=[],editId='',editMode='new',externalRef=null,lastSync='';
function iso(d){return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0')}
function parse(s){const p=String(s||'').split('-').map(Number);return new Date(p[0],p[1]-1,p[2],12)}
function add(s,n){const d=parse(s);d.setDate(d.getDate()+n);return iso(d)}
function monday(s){const d=s?parse(s):new Date(),n=(d.getDay()+6)%7;d.setDate(d.getDate()-n);return iso(d)}
function today(){return iso(new Date())}
function fmtDay(s){return new Intl.DateTimeFormat('de-DE',{weekday:'long',day:'2-digit',month:'2-digit',year:'numeric'}).format(parse(s))}
function fmtShort(s){return new Intl.DateTimeFormat('de-DE',{day:'2-digit',month:'2-digit',year:'numeric'}).format(parse(s))}
function mins(t){const m=/^(\d{1,2}):(\d{2})$/.exec(String(t||''));return m?Number(m[1])*60+Number(m[2]):0}
function status(id,text,type='info'){const e=$(id);if(e){e.className='status '+type;e.textContent=text}}
function visibleDays(){return calendarRange().days;}
function css(){if($('dg62css'))return;const s=document.createElement('style');s.id='dg62css';s.textContent=`#dg58BackendStatus,#dg59BackendStatus,#dg60BackendStatus,#dg61BackendStatus{display:none!important}.dg62-summary{cursor:pointer;font-size:21px;font-weight:800;color:var(--brand);list-style:none}.dg62-summary::-webkit-details-marker{display:none}.dg62-summary:before{content:'▸';display:inline-block;width:25px}.dg62-main[open]>.dg62-summary:before{content:'▾'}.dg62-toolbar{display:flex;gap:8px;flex-wrap:wrap;margin:14px 0}.dg62-toolbar .btn{width:auto}.dg62-weektitle{font-weight:900;color:var(--brand);margin:10px 0 14px}.dg62-legend{display:flex;gap:12px;flex-wrap:wrap;align-items:center;font-size:12px;color:#475569;margin:8px 0 12px}.dg62-dot{display:inline-block;width:12px;height:12px;border-radius:3px;margin-right:4px;vertical-align:-2px}.dg62-day{margin:0 0 18px;border:1px solid #d1d5db;border-radius:14px;overflow:hidden;background:#fff}.dg62-day.today{border:2px solid #60a5fa}.dg62-dayhead{padding:10px 12px;background:#eff6ff;color:#0057a8;font-weight:900;border-bottom:1px solid #bfdbfe}.dg62-gridwrap{overflow:auto}.dg62-grid{display:grid;position:relative;min-width:900px}.dg62-corner,.dg62-name{position:sticky;top:0;z-index:5;background:#f1f5f9;border-bottom:2px solid #94a3b8;height:52px;display:flex;align-items:center;justify-content:center;font-weight:900;color:#0057a8;text-align:center;padding:4px;overflow:hidden}.dg62-corner{left:0;z-index:7}.dg62-time{position:sticky;left:0;z-index:4;background:#f8fafc;text-align:center;font-weight:800;padding-top:5px;border-right:2px solid #cbd5e1;border-bottom:1px solid #e5e7eb}.dg62-cell{height:52px;border-bottom:1px solid #e5e7eb;border-right:1px solid #e5e7eb;cursor:pointer;position:relative}.dg62-cell:hover{background:#f8fafc}.dg62-event{position:absolute;z-index:3;background:#dbeafe;border:1px solid #60a5fa;border-left:5px solid #0057a8;border-radius:7px;padding:4px 5px;overflow:hidden;cursor:pointer;font-size:11px;line-height:1.15;box-sizing:border-box;min-height:20px}.dg62-event.google{background:#e0f2fe;border-color:#38bdf8;border-left-color:#0284c7}.dg62-event:hover{filter:brightness(.97);box-shadow:0 2px 8px rgba(0,0,0,.14)}.dg62-event strong{display:block;font-size:11px}.dg62-badge{display:inline-block;font-size:9px;font-weight:800;border-radius:10px;padding:1px 5px;background:#fff;color:#0369a1;margin-top:3px}.dg62-share{display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:8px;margin-top:8px}.dg62-share label{display:flex;gap:8px;align-items:center;border:1px solid #d1d5db;border-radius:10px;padding:9px}.dg62-share input{width:auto}.dg62-share label.locked{opacity:.65;background:#f8fafc}.dg62-modal{position:fixed;inset:0;z-index:14000;background:rgba(0,0,0,.48);display:flex;align-items:center;justify-content:center;padding:15px}.dg62-modal.hidden{display:none!important}.dg62-card{background:#fff;border-radius:18px;max-width:720px;width:100%;max-height:94vh;overflow:auto;padding:20px}.dg62-worker{display:grid;grid-template-columns:minmax(150px,1fr) minmax(210px,2fr) auto auto auto;gap:7px;align-items:center;padding:8px 0;border-top:1px solid #e5e7eb}.dg62-worker .btn{width:auto;padding:8px}.dg62-hint{font-size:12px;color:#64748b}.dg62-sync{font-size:12px;color:#64748b;margin-left:auto}@media(max-width:700px){.dg62-toolbar{display:grid;grid-template-columns:1fr 1fr}.dg62-toolbar .btn{width:100%}.dg62-worker{grid-template-columns:1fr}.dg62-grid{min-width:780px}.dg62-sync{margin-left:0}}`;document.head.appendChild(s)}
function modal(){if($('dg62Modal'))return;const m=document.createElement('div');m.id='dg62Modal';m.className='dg62-modal hidden';m.innerHTML='<div class="dg62-card"><h2 id="dg62MT" style="margin-top:0">Termin anlegen</h2><div id="dg62SourceHint" class="muted small" style="margin-bottom:10px"></div><label>Kundenname / Termintitel</label><input id="dg62Customer"><label>Adresse</label><input id="dg62Address"><label>Was ist zu tun</label><textarea id="dg62Task"></textarea><div class="grid2"><div><label>Datum</label><input id="dg62ED" type="date"></div><div></div></div><div class="grid2"><div><label>Von</label><input id="dg62Start" type="time"></div><div><label>Bis</label><input id="dg62End" type="time"></div></div><label>Termin teilen mit</label><div id="dg62ShareHint" class="muted small">Haken rein und fertig.</div><div id="dg62Share" class="dg62-share"></div><div id="dg62MS"></div><div class="button-row" style="margin-top:14px"><button id="dg62SaveBtn" class="btn success" onclick="return dg62Save()">Termin speichern</button><button class="btn secondary" onclick="return dg62Close()">Abbrechen</button></div><button id="dg62Copy" class="btn primary hidden" style="width:100%;margin-top:8px" onclick="return dg62CopyCurrent()">Kompletten Eintrag kopieren</button><button id="dg62Del" class="btn danger hidden" style="width:100%;margin-top:8px" onclick="return dg62Delete()">Termin löschen</button></div>';document.body.appendChild(m)}
function inject(){if($('dg62PlannerCard')||!$('bossView'))return;const c=document.createElement('div');c.className='card';c.id='dg62PlannerCard';c.innerHTML='<details class="dg62-main"><summary class="dg62-summary">Mitarbeiter Kalender</summary><div class="muted small">Startansicht: heute, morgen und übermorgen · 07:00–20:00 Uhr · inklusive Wochenwechsel. Wochenansicht: Montag bis Samstag.</div><div class="dg62-toolbar"><button class="btn success" onclick="return dg62New()">+ Termin</button><button class="btn secondary" onclick="return dg62PrevWeek()">← Vorwoche</button><button class="btn secondary" data-calendar-view="week" onclick="return dg62ThisWeek()">Diese Woche</button><button class="btn secondary" onclick="return dg62NextWeek()">Nächste Woche →</button><input id="dg62Date" type="date" onchange="dg62GoWeek(this.value)"><button class="btn primary" onclick="return dg62Load()">↻ Synchronisieren</button><button class="btn primary dg62-today-blue" data-calendar-view="three" onclick="return dg62JumpToday()">Heute + 2 Tage</button><button class="btn primary" onclick="return dg62Popout()">↗ Kalender in neuem Fenster öffnen</button><span id="dg62LastSync" class="dg62-sync"></span></div><div class="dg62-legend"><span><i class="dg62-dot" style="background:#dbeafe;border:1px solid #60a5fa"></i>DG-Termin</span><span><i class="dg62-dot" style="background:#e0f2fe;border:1px solid #38bdf8"></i>Google-Termin</span><span>Freie Fläche anklicken = neuer Termin</span></div><div id="dg62Status"></div><div id="dg62WeekTitle" class="dg62-weektitle"></div><div id="dg62Week"></div><details style="margin-top:14px"><summary style="cursor:pointer;font-weight:800;color:var(--brand)">Kalender-Mitarbeiter verwalten</summary><div class="dg62-hint" style="margin:8px 0">Bis zu 10 Monteure werden nebeneinander angezeigt. Reihenfolge kann jederzeit geändert werden.</div><div id="dg62Workers"></div><div class="admin-grid"><div><label>Mitarbeiter</label><input id="dg62WN"></div><div><label>Google Kalender-ID</label><input id="dg62WC"></div></div><button class="btn success" style="width:100%;margin-top:8px" onclick="return dg62AddWorker()">+ Mitarbeiter hinzufügen</button><div id="dg62WS"></div></details></details>';$('bossView').insertBefore(c,$('bossView').firstChild);modal()}
function renderWorkers(){const b=$('dg62Workers');if(!b)return;b.innerHTML=workers.map((w,i)=>'<div class="dg62-worker"><strong>'+esc(w.displayName||w.employeeName)+'</strong><span class="muted small">'+esc(w.calendarId||'Keine Kalender-ID')+'</span><button class="btn secondary" '+(i?'':'disabled')+' onclick="return dg62MoveWorker(\''+esc(w.id)+'\',-1)">↑</button><button class="btn secondary" '+(i===workers.length-1?'disabled':'')+' onclick="return dg62MoveWorker(\''+esc(w.id)+'\',1)">↓</button><button class="btn '+(w.active?'danger':'success')+'" onclick="return dg62ToggleWorker(\''+esc(w.id)+'\','+(!w.active)+')">'+(w.active?'Entfernen':'Aktivieren')+'</button></div>').join('')||'<div class="muted">Noch keine Kalender-Mitarbeiter.</div>'}
function renderDay(d){const ws=workers.filter(w=>w.active).slice(0,10),rowH=52,headerH=52,minCol=ws.length>=8?105:ws.length>=6?120:145;const wrap=document.createElement('section');wrap.className='dg62-day'+(d===today()?' today':'');wrap.dataset.date=d;wrap.innerHTML='<div class="dg62-dayhead">'+esc(fmtDay(d))+(d===today()?' · Heute':'')+'</div><div class="dg62-gridwrap"><div class="dg62-grid" style="grid-template-columns:68px repeat('+Math.max(ws.length,1)+',minmax('+minCol+'px,1fr));min-width:'+(68+Math.max(ws.length,1)*minCol)+'px"><div class="dg62-corner">Uhrzeit</div>'+ws.map(w=>'<div class="dg62-name">'+esc(w.displayName||w.employeeName)+'</div>').join('')+'</div></div>';const grid=wrap.querySelector('.dg62-grid');for(let h=7;h<20;h++){const t=document.createElement('div');t.className='dg62-time';t.textContent=String(h).padStart(2,'0')+':00';grid.appendChild(t);ws.forEach(w=>{const cell=document.createElement('div');cell.className='dg62-cell';cell.title='Freier Zeitraum – Termin anlegen';cell.addEventListener('click',()=>dg62New(d,w.id,String(h).padStart(2,'0')+':00'));grid.appendChild(cell)})}
 events.filter(e=>e.date===d).forEach(e=>(e.employeeIds||[]).forEach(id=>{const ci=ws.findIndex(w=>w.id===id);if(ci<0)return;let sm=Math.max(420,mins(e.start)),em=Math.min(1200,mins(e.end));if(em<=sm)return;const x=document.createElement('div');x.className='dg62-event'+(e.external?' google':'');x.style.top=(headerH+(sm-420)/60*rowH)+'px';x.style.left='calc(68px + (100% - 68px) * '+ci+'/'+ws.length+' + 3px)';x.style.width='calc((100% - 68px) / '+ws.length+' - 6px)';x.style.height=Math.max(20,(em-sm)/60*rowH-3)+'px';x.innerHTML='<strong>'+esc(e.start)+'–'+esc(e.end)+' · '+esc(e.customer||'Termin')+'</strong>'+esc(e.address||'')+'<br>'+esc(e.task||'')+(e.external?'<span class="dg62-badge">Google</span>':'');x.dataset.eventId=e.id;x.title=e.external?'Google-Termin öffnen / bearbeiten / kopieren':'DG-Termin öffnen / bearbeiten / kopieren';x.addEventListener('click',ev=>{ev.stopPropagation();dg62Edit(e.id)});grid.appendChild(x)}));return wrap}
function renderWeek(range=calendarRange()){
  const out=$('dg62Week');if(!out)return;
  const title=range.mode==='three'?'N\u00e4chste 3 Tage':'Woche';
  $('dg62WeekTitle').textContent=title+' '+fmtShort(range.start)+' bis '+fmtShort(range.end);
  updateCalendarControls(range);
  out.replaceChildren(...range.days.map(d=>{
    const day=renderDay(d),head=day.querySelector('.dg62-dayhead');
    if(range.mode==='three'&&d===add(today(),1))head.append(' \u00b7 Morgen');
    if(range.mode==='three'&&d===add(today(),2))head.append(' \u00b7 \u00dcbermorgen');
    if(!events.some(e=>e.date===d)){
      const empty=document.createElement('div');empty.className='muted small';
      empty.textContent='Keine Termine f\u00fcr diesen Tag.';empty.style.padding='8px 12px';
      head.after(empty);
    }
    return day;
  }));
}
window.dg62Load=function(){
  const range=calendarRange(),owner=auth().employee,key=owner+'|'+range.key;
  updateCalendarControls(range);
  if(!navigator.onLine){
    ++rangeRequest;rangePending=null;
    status('dg62Status','Offline \u2013 Kalender kann nicht synchronisiert werden.','warn');
    return Promise.resolve();
  }
  if(rangePending&&rangePending.key===key)return rangePending.promise;
  const seq=++rangeRequest;
  const isCurrent=()=>seq===rangeRequest&&owner===auth().employee&&range.key===calendarRange().key;
  status('dg62Status','Kalender wird synchronisiert \u2026');
  const promise=(async()=>{
    try{
      const r=await Promise.all([
        api(chefPayload({action:'getPlannerWorkers'})),
        api(chefPayload({action:'getPlannerEvents',startDate:range.start,endDate:range.end}))
      ]);
      if(!isCurrent())return;
      workers=r[0]||[];events=r[1]||[];
      renderWorkers();renderWeek(range);
      if(DG3.enhanceCalendar)DG3.enhanceCalendar();
      lastSync=new Intl.DateTimeFormat('de-DE',{hour:'2-digit',minute:'2-digit'}).format(new Date());
      if($('dg62LastSync'))$('dg62LastSync').textContent='Zuletzt synchronisiert: '+lastSync+' Uhr';
      status('dg62Status','\u2713 Kalender synchronisiert.','ok');
    }catch(e){if(isCurrent())status('dg62Status',e&&e.message?e.message:'Kalender konnte nicht geladen werden.','error');}
    finally{if(rangePending&&rangePending.seq===seq)rangePending=null;}
  })();
  rangePending={key,seq,promise};
  return promise;
};
window.dg62ThisWeek=function(){selectCalendarRange('week',today());return dg62Load();};
window.dg62PrevWeek=function(){selectCalendarRange('week',add(monday(calendarRange().start),-7));return dg62Load();};
window.dg62NextWeek=function(){selectCalendarRange('week',add(monday(calendarRange().start),7));return dg62Load();};
window.dg62GoWeek=function(d){
  if(!/^\d{4}-\d{2}-\d{2}$/.test(d)||iso(parse(d))!==d){updateCalendarControls(calendarRange());return;}
  selectCalendarRange(calendarMode,d,calendarMode==='three'&&d===today());return dg62Load();
};
window.dg62JumpToday=function(){return dg62OpenPlanner();};
function shares(sel=[],locked){return workers.filter(w=>w.active).slice(0,10).map(w=>'<label class="'+(locked?'locked':'')+'"><input type="checkbox" class="dg62cb" value="'+esc(w.id)+'" '+(sel.includes(w.id)?'checked':'')+' '+(locked?'disabled':'')+'>'+esc(w.displayName||w.employeeName)+'</label>').join('')}
function resetModal(){editId='KT-'+uid();DG3.shareId='';externalRef=null;editMode='new';$('dg62Copy').classList.add('hidden');$('dg62Del').classList.add('hidden');$('dg62SourceHint').textContent='';$('dg62ShareHint').textContent='Haken rein und fertig.';$('dg62SaveBtn').textContent='Termin speichern';$('dg62MS').textContent=''}
window.dg62New=function(d,w,start){resetModal();$('dg62MT').textContent='Termin anlegen';$('dg62Customer').value='';$('dg62Address').value='';$('dg62Task').value='';$('dg62ED').value=d||visibleDays()[0]||weekStart;$('dg62Start').value=start||'08:00';$('dg62End').value=start?(String(Math.min(20,Number(start.slice(0,2))+1)).padStart(2,'0')+':00'):'09:00';$('dg62Share').innerHTML=shares(w?[w]:[],false);$('dg62Modal').classList.remove('hidden')};
window.dg62Edit=function(id){const e=events.find(x=>String(x.id)===String(id));if(!e)return;resetModal();editId=e.id;editMode=e.external?'google':'dg';externalRef=e.external?{workerId:e.workerId,googleEventId:e.googleEventId}:null;$('dg62MT').textContent=e.external?'Google-Termin bearbeiten':'Termin bearbeiten';$('dg62Customer').value=e.customer||'';$('dg62Address').value=e.address||'';$('dg62Task').value=e.task||'';$('dg62ED').value=e.date||'';$('dg62Start').value=e.start||'';$('dg62End').value=e.end||'';$('dg62Share').innerHTML=shares(e.employeeIds||[],!!e.external);$('dg62Copy').classList.remove('hidden');$('dg62Del').classList.remove('hidden');if(e.external){$('dg62SourceHint').textContent='Dieser Termin wurde direkt in Google Kalender angelegt. Änderungen werden zurück in Google gespeichert.';$('dg62ShareHint').textContent='Mitarbeiterzuordnung ist bei einem bestehenden Google-Termin gesperrt. Für einen anderen Mitarbeiter bitte „Kompletten Eintrag kopieren“ verwenden.';$('dg62SaveBtn').textContent='Google-Termin speichern';$('dg62Del').textContent='Google-Termin löschen'}else{$('dg62Del').textContent='Termin löschen'}$('dg62Modal').classList.remove('hidden')};
window.dg62CopyCurrent=function(){const data={customer:$('dg62Customer').value,address:$('dg62Address').value,task:$('dg62Task').value,start:$('dg62Start').value,end:$('dg62End').value};dg62New();$('dg62MT').textContent='Kopie als neuen Termin anlegen';$('dg62Customer').value=data.customer;$('dg62Address').value=data.address;$('dg62Task').value=data.task;$('dg62Start').value=data.start;$('dg62End').value=data.end;$('dg62ED').value='';document.querySelectorAll('.dg62cb').forEach(x=>x.checked=false);status('dg62MS','Eintrag kopiert. Bitte neues Datum und gewünschten Mitarbeiter auswählen.','info')};
window.dg62Close=function(){$('dg62Modal').classList.add('hidden')};
function hasOverlap(item){const s=mins(item.start),e=mins(item.end);return events.some(x=>String(x.id)!==String(editId)&&x.date===item.date&&(x.employeeIds||[]).some(id=>item.employeeIds.includes(id))&&mins(x.start)<e&&mins(x.end)>s)}
window.dg62Save=async function(){let employeeIds=[...document.querySelectorAll('.dg62cb:checked')].map(x=>x.value);if(editMode==='google'&&externalRef)employeeIds=[externalRef.workerId];const item={id:editMode==='google'?'':editId,customer:$('dg62Customer').value.trim(),address:$('dg62Address').value.trim(),task:$('dg62Task').value.trim(),date:$('dg62ED').value,start:$('dg62Start').value,end:$('dg62End').value,employeeIds};if(!item.customer||!item.date||!item.start||!item.end||!item.employeeIds.length){status('dg62MS','Bitte mindestens Kundenname, Datum, Uhrzeit und Mitarbeiter vollständig angeben.','error');return}if(item.end<=item.start){status('dg62MS','Die Endzeit muss nach der Startzeit liegen.','error');return}if(editMode!=='google'&&hasOverlap(item)&&!confirm('Für mindestens einen ausgewählten Mitarbeiter überschneidet sich dieser Termin mit einem vorhandenen Termin. Trotzdem speichern?'))return;try{status('dg62MS',editMode==='google'?'Google-Termin wird gespeichert …':'Termin wird gespeichert …');if(editMode==='google'){await api(chefPayload({action:'saveExternalGoogleEvent',item:{workerId:externalRef.workerId,googleEventId:externalRef.googleEventId,customer:item.customer,address:item.address,task:item.task,date:item.date,start:item.start,end:item.end}}))}else{await api(chefPayload({action:'savePlannerEvent',item}))}dg62Close();selectSavedDate(item.date);await dg62Load()}catch(e){status('dg62MS',e.message||'Termin konnte nicht gespeichert werden.','error')}};
window.dg62Delete=async function(){if(editMode==='google'){if(!externalRef||!confirm('Diesen Google-Termin wirklich löschen? Er wird direkt aus dem Google Kalender entfernt.'))return;try{status('dg62MS','Google-Termin wird gelöscht …');await api(chefPayload({action:'deleteExternalGoogleEvent',item:externalRef}));dg62Close();await dg62Load()}catch(e){status('dg62MS',e.message||'Google-Termin konnte nicht gelöscht werden.','error')}return}if(!editId||!confirm('Termin wirklich löschen?'))return;try{await api(chefPayload({action:'deletePlannerEvent',id:editId}));dg62Close();await dg62Load()}catch(e){status('dg62MS',e.message||'Termin konnte nicht gelöscht werden.','error')}};
window.dg62MoveWorker=async function(id,direction){await api(chefPayload({action:'movePlannerWorker',id,direction}));await dg62Load()};
window.dg62ToggleWorker=async function(id,active){await api(chefPayload({action:'setPlannerWorkerActive',id,active}));await dg62Load()};
window.dg62AddWorker=async function(){const n=$('dg62WN').value.trim(),c=$('dg62WC').value.trim();if(!n||!c)return status('dg62WS','Name und Google Kalender-ID eintragen.','error');if(workers.filter(w=>w.active).length>=10)return status('dg62WS','Maximal 10 aktive Kalender-Mitarbeiter sind vorgesehen.','warn');try{status('dg62WS','Kalender-ID wird geprüft …');await api(chefPayload({action:'savePlannerWorker',item:{displayName:n,employeeName:n,provider:'google',calendarId:c,active:true}}));$('dg62WN').value='';$('dg62WC').value='';await dg62Load();status('dg62WS','✓ Mitarbeiter hinzugefügt.','ok')}catch(e){status('dg62WS',e.message,'error')}};
window.dg62Popout=function(){const w=window.open('','DG_Mitarbeiter_Kalender','popup=yes,width=1600,height=1000,resizable=yes,scrollbars=yes');if(!w)return alert('Popup wurde blockiert. Bitte Popups für diese Seite erlauben.');const style=[...document.querySelectorAll('style,link[rel=stylesheet]')].map(s=>s.outerHTML).join('');w.document.open();w.document.write('<!doctype html><html><head><meta charset="utf-8"><title>Mitarbeiter Kalender</title>'+style+'</head><body style="padding:18px;background:#f3f4f6"><div class="card"><h2 style="color:#0057a8">Mitarbeiter Kalender</h2><div id="pop"></div></div></body></html>');w.document.close();const base=w.document.createElement('base');base.href=location.href;w.document.head.prepend(base);const p=w.document.getElementById('pop');if(p)p.innerHTML=$('dg62WeekTitle').outerHTML+$('dg62Week').innerHTML};
css();
inject();
weekStart=monday();rangeStart=today();
updateCalendarControls(calendarRange());
DG3.calendar={event:id=>events.find(x=>x.id===id),workers:()=>workers,edit:()=>({id:editId,mode:editMode})};
})();


/* Compiled component v62-ui-stable.js */
(function(){
'use strict';
const $=id=>document.getElementById(id);
function addCss(){if($('dg62UiStableCss'))return;const s=document.createElement('style');s.id='dg62UiStableCss';s.textContent=`
#dg62PlannerCard{position:relative}
#dg62PlannerCard .dg62-summary{font-size:24px!important;font-weight:700!important;line-height:1.2!important;color:var(--brand)!important;padding:4px 82px 10px 0!important;list-style:none!important}
#dg62PlannerCard .dg62-summary:before{content:none!important;display:none!important;width:0!important}
#dg62PlannerCard .dg62-summary::-webkit-details-marker{display:none!important}
#dg62PlannerCard .dg62-summary::marker{content:''}
#dg62PlannerCard .dg62-card-toggle{position:absolute;right:20px;top:20px;width:62px;height:58px;border:0;border-radius:16px;background:#e5e7eb;color:#111827;font-size:31px;font-weight:900;line-height:1;cursor:pointer;z-index:6}
#dg62PlannerCard .dg62-card-toggle:hover{background:#dbeafe}
#dg62PlannerCard .dg62-toolbar .btn{font-weight:700!important}
#dg62PlannerCard .dg62-week-nav{background:var(--brand)!important;color:#fff!important}
#dg62PlannerCard .dg62-sync-green{background:#166534!important;color:#fff!important}
#dg62PlannerCard .dg62-today-blue{background:var(--brand)!important;color:#fff!important}
#dg62Modal .dg62-cancel-red{background:#b91c1c!important;color:#fff!important}
#dg62Modal .dg62-address-help{font-size:12px;color:#6b7280;margin-top:5px}
`;document.head.appendChild(s)}
function findButton(root,needle){return [...root.querySelectorAll('button')].find(b=>String(b.textContent||'').trim().toLowerCase().includes(needle.toLowerCase()))}
function decorateCard(){const card=$('dg62PlannerCard');if(!card)return;const details=card.querySelector('.dg62-main'),summary=details&&details.querySelector('.dg62-summary');if(!details||!summary)return;
 let toggle=card.querySelector('.dg62-card-toggle');if(!toggle){toggle=document.createElement('button');toggle.type='button';toggle.className='dg62-card-toggle';toggle.title='Mitarbeiter Kalender öffnen / schließen';toggle.addEventListener('click',e=>{e.preventDefault();e.stopPropagation();details.open=!details.open;toggle.textContent=details.open?'−':'+';});card.appendChild(toggle);details.addEventListener('toggle',()=>{toggle.textContent=details.open?'−':'+'})}toggle.textContent=details.open?'−':'+';
 ['Vorwoche','Diese Woche','Nächste Woche'].forEach(t=>{const b=findButton(card,t);if(b){b.classList.remove('secondary');b.classList.add('primary','dg62-week-nav')}});const sy=findButton(card,'Synchronisieren');if(sy){sy.classList.remove('primary','secondary');sy.classList.add('success','dg62-sync-green')}const td=findButton(card,'Heute zeigen');if(td){td.classList.remove('secondary');td.classList.add('primary','dg62-today-blue')}
}
function decorateModal(){const modal=$('dg62Modal');if(!modal)return;const cancel=findButton(modal,'Abbrechen');if(cancel){cancel.classList.remove('secondary');cancel.classList.add('secondary')}const a=$('dg62Address');if(a&&!$('dg62AddressHelp')){const h=document.createElement('div');h.id='dg62AddressHelp';h.className='dg62-address-help';h.textContent='Adressvorschläge können nach Aktivierung der Google Places API automatisch ergänzt werden.';a.insertAdjacentElement('afterend',h)}}
function decorate(){addCss();decorateCard();decorateModal()}
const oldEdit=window.dg62Edit;
if(typeof oldEdit==='function')window.dg62Edit=function(){const r=oldEdit.apply(this,arguments);decorateModal();return r};
const oldNew=window.dg62New;
if(typeof oldNew==='function')window.dg62New=function(){const r=oldNew.apply(this,arguments);decorateModal();return r};
decorate();
})();


/* Compiled component v62-actions-stable.js */
(function(){
'use strict';
const $=id=>document.getElementById(id);
function esc(v){return String(v==null?'':v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
function setMsg(text,type='info'){const e=$('dg62MS');if(e){e.className='status '+type;e.textContent=text}}
function isGoogleEdit(){return /google/i.test(String($('dg62MT')&&$('dg62MT').textContent||''))}
function mins(t){const m=/^(\d{1,2}):(\d{2})$/.exec(String(t||''));return m?Number(m[1])*60+Number(m[2]):0}
function hhmm(v){v=Math.max(0,Math.min(23*60+59,Math.round(v)));return String(Math.floor(v/60)).padStart(2,'0')+':'+String(v%60).padStart(2,'0')}
function ensureShareUi(){
  const modal=$('dg62Modal'),share=$('dg62Share');if(!modal||!share)return;
  let btn=$('dg62ShareEmployeeBtn');
  if(!btn){btn=document.createElement('button');btn.id='dg62ShareEmployeeBtn';btn.type='button';btn.className='btn primary hidden';btn.style.width='100%';btn.style.marginTop='10px';btn.textContent='Termin mit Mitarbeiter teilen';share.insertAdjacentElement('afterend',btn);btn.addEventListener('click',toggleSharePanel)}
  if(!$('dg62ShareEmployeePanel')){const p=document.createElement('div');p.id='dg62ShareEmployeePanel';p.className='hidden';p.style.marginTop='10px';p.innerHTML='<div class="muted small" style="margin-bottom:7px">Zusätzliche Mitarbeiter auswählen. Der bestehende Termin bleibt erhalten.</div><div id="dg62ShareEmployeeChoices" class="dg62-share"></div><button id="dg62ShareEmployeeConfirm" type="button" class="btn success" style="width:100%;margin-top:8px">Ausgewählte Mitarbeiter hinzufügen</button>';btn.insertAdjacentElement('afterend',p);$('dg62ShareEmployeeConfirm').addEventListener('click',confirmShare)}
}
function toggleSharePanel(){
  ensureShareUi();const p=$('dg62ShareEmployeePanel'),choices=$('dg62ShareEmployeeChoices'),base=$('dg62Share');if(!p||!choices||!base)return;
  if(!p.classList.contains('hidden')){p.classList.add('hidden');return}
  const assigned=new Set([...base.querySelectorAll('.dg62cb:checked')].map(x=>x.value));
  choices.innerHTML=[...base.querySelectorAll('label')].map(l=>{const i=l.querySelector('.dg62cb');if(!i||assigned.has(i.value))return'';return '<label><input type="checkbox" class="dg62-share-extra" value="'+esc(i.value)+'">'+esc((l.textContent||'').trim())+'</label>'}).join('')||'<div class="muted small">Alle aktiven Mitarbeiter sind bereits zugeordnet.</div>';
  p.classList.remove('hidden')
}
async function confirmShare(){
  const ids=[...document.querySelectorAll('.dg62-share-extra:checked')].map(x=>x.value);if(!ids.length){setMsg('Bitte mindestens einen zusätzlichen Mitarbeiter auswählen.','warn');return}
  const customer=$('dg62Customer').value.trim(),address=$('dg62Address').value.trim(),task=$('dg62Task').value.trim(),date=$('dg62ED').value,start=$('dg62Start').value,end=$('dg62End').value;
  try{setMsg('Termin wird mit ausgewählten Mitarbeitern geteilt …','info');
    if(isGoogleEdit()){
      await api(chefPayload({action:'savePlannerEvent',item:{id:(DG3.shareId||(DG3.shareId='KT-'+uid())),customer,address,task,date,start,end,employeeIds:ids}}));
      if(typeof window.dg62Close==='function')window.dg62Close();if(typeof window.dg62Load==='function')await window.dg62Load();
    }else{
      document.querySelectorAll('#dg62Share .dg62cb').forEach(x=>{if(ids.includes(x.value))x.checked=true});
      if(typeof window.dg62Save!=='function')throw new Error('Speicherfunktion nicht verfügbar.');await window.dg62Save();
    }
  }catch(e){setMsg(e&&e.message?e.message:'Termin konnte nicht geteilt werden.','error')}
}
function updateShareButton(){ensureShareUi();const b=$('dg62ShareEmployeeBtn'),p=$('dg62ShareEmployeePanel');const editing=/bearbeiten/i.test(String($('dg62MT')&&$('dg62MT').textContent||''));if(b)b.classList.toggle('hidden',!editing);if(p)p.classList.add('hidden')}
const oldEdit=window.dg62Edit;
if(typeof oldEdit==='function')window.dg62Edit=function(){const r=oldEdit.apply(this,arguments);updateShareButton();return r};
const oldNew=window.dg62New;
if(typeof oldNew==='function')window.dg62New=function(){const r=oldNew.apply(this,arguments);ensureShareUi();const b=$('dg62ShareEmployeeBtn'),p=$('dg62ShareEmployeePanel');if(b)b.classList.add('hidden');if(p)p.classList.add('hidden');return r};
ensureShareUi();
})();


/* Compiled component v62-places.js */
(function(){
'use strict';
const $=id=>document.getElementById(id);
const STORAGE_KEY='dg_maps_browser_key';
let loadPromise=null;
function getMapsKey(){return String(localStorage.getItem(STORAGE_KEY)||'').trim()}
function resetGoogleLoader(){loadPromise=null;try{document.querySelectorAll('script[src*="maps.googleapis.com/maps/api/js"]').forEach(s=>s.remove())}catch(_e){}}
window.dg62SetMapsKey=function(key){key=String(key||'').trim();if(!key){localStorage.removeItem(STORAGE_KEY);resetGoogleLoader();alert('Google Maps API-Key wurde auf diesem Gerät entfernt.');return false}localStorage.setItem(STORAGE_KEY,key);resetGoogleLoader();alert('Google Maps API-Key wurde auf diesem Gerät gespeichert.');setTimeout(()=>{ensureCalendar();ensureOtherAddressFields()},100);return true};
function addCss(){if($('dg62PlacesCss'))return;const s=document.createElement('style');s.id='dg62PlacesCss';s.textContent=`.pac-container{z-index:20000!important}.dg62-place-note{font-size:12px;color:#64748b;margin-top:5px}.dg62-place-ok{color:#166534!important}.dg62-place-setup{margin-top:7px;width:auto!important}`;document.head.appendChild(s)}
function askForKey(){const old=getMapsKey();const key=prompt('Google Maps API-Key auf diesem Gerät hinterlegen:',old?'Bereits hinterlegt – neuen Key hier einfügen':'');if(key===null)return;if(!String(key).trim())return alert('Kein API-Key eingegeben.');window.dg62SetMapsKey(key)}
function loadGoogle(){if(window.google&&google.maps&&google.maps.places)return Promise.resolve();if(loadPromise)return loadPromise;loadPromise=new Promise((resolve,reject)=>{const key=getMapsKey();if(!key)return reject(new Error('Google Maps API-Key ist auf diesem Gerät noch nicht hinterlegt.'));const cb='dgPlacesReady_'+Date.now();window[cb]=()=>{delete window[cb];resolve()};const sc=document.createElement('script');sc.async=true;sc.defer=true;sc.src='https://maps.googleapis.com/maps/api/js?key='+encodeURIComponent(key)+'&libraries=places&language=de&region=DE&callback='+cb;sc.onerror=()=>{loadPromise=null;reject(new Error('Google Places konnte nicht geladen werden.'))};document.head.appendChild(sc)});return loadPromise}
function attachAutocomplete(input,note){if(!input||input.dataset.dgPlaces==='1')return;loadGoogle().then(()=>{if(!(window.google&&google.maps&&google.maps.places))return;const ac=new google.maps.places.Autocomplete(input,{componentRestrictions:{country:'de'},fields:['formatted_address','address_components','name','place_id'],types:['address']});ac.addListener('place_changed',()=>{const p=ac.getPlace();if(p&&p.formatted_address)input.value=p.formatted_address;const comps={};(p.address_components||[]).forEach(c=>(c.types||[]).forEach(t=>comps[t]=c.long_name));input.dataset.placeId=p.place_id||'';input.dataset.street=[comps.route||'',comps.street_number||''].filter(Boolean).join(' ');input.dataset.postalCode=comps.postal_code||'';input.dataset.city=comps.locality||comps.postal_town||comps.administrative_area_level_3||'';if(note){note.textContent='✓ Adresse aus Google übernommen'+(input.dataset.postalCode||input.dataset.city?' · '+[input.dataset.postalCode,input.dataset.city].filter(Boolean).join(' '):'');note.classList.add('dg62-place-ok')}});input.dataset.dgPlaces='1';if(note){note.textContent='Adresse tippen – Google schlägt passende Adressen vor';note.classList.remove('dg62-place-ok')}}).catch(e=>{if(note){note.textContent=e.message||'Adressvorschläge nicht verfügbar.';note.classList.remove('dg62-place-ok')}ensureSetupButton(input,note)})}
function ensureSetupButton(input,note){if(getMapsKey())return;const parent=note&&note.parentNode;if(!parent||parent.querySelector('.dg62-place-setup'))return;const b=document.createElement('button');b.type='button';b.className='btn secondary dg62-place-setup';b.textContent='Google Adresssuche einrichten';b.addEventListener('click',askForKey);note.insertAdjacentElement('afterend',b)}
function ensureCalendar(){addCss();const input=$('dg62Address');if(!input)return;let note=$('dg62PlacesNote');if(!note){note=document.createElement('div');note.id='dg62PlacesNote';note.className='dg62-place-note';input.insertAdjacentElement('afterend',note)}if(!getMapsKey()){note.textContent='Google Adresssuche noch nicht eingerichtet.';ensureSetupButton(input,note);return}attachAutocomplete(input,note)}
function ensureOtherAddressFields(){document.querySelectorAll('input').forEach(input=>{if(input.id==='dg62Address')return;const key=((input.id||'')+' '+(input.name||'')+' '+(input.placeholder||'')).toLowerCase();if(!/(adresse|straße|strasse|anschrift)/.test(key))return;if(input.dataset.dgPlaces==='1')return;let note=input.nextElementSibling;if(!(note&&note.classList&&note.classList.contains('dg62-place-note'))){note=document.createElement('div');note.className='dg62-place-note';input.insertAdjacentElement('afterend',note)}if(!getMapsKey()){note.textContent='Google Adresssuche noch nicht eingerichtet.';ensureSetupButton(input,note);return}attachAutocomplete(input,note)})}
const oldEdit=window.dg62Edit;
if(typeof oldEdit==='function')window.dg62Edit=function(){const r=oldEdit.apply(this,arguments);setTimeout(ensureCalendar,0);return r};
const oldNew=window.dg62New;
if(typeof oldNew==='function')window.dg62New=function(){const r=oldNew.apply(this,arguments);setTimeout(ensureCalendar,0);return r};
ensureCalendar();ensureOtherAddressFields();
})();

/* DG 3.0 office: one menu state, one report renderer, scoped selection. */
function d3Body(c){return c?.querySelector(':scope > .dg48-body');}
function d3Collapse(c,closed){d3Body(c)?.classList.toggle('hidden',closed);const h=c.querySelector(':scope > .dg48-head'),b=h?.querySelector('button');if(b)b.textContent=closed?'+':'\u2212';if(h)h.setAttribute('aria-expanded',String(!closed));const d=c.querySelector(':scope > details');if(d)d.open=!closed;}
function d3Section(id,title,html=''){const c=d3Element('div','card','<div class="dg48-head" tabindex="0" role="button"><h2>'+esc(title)+'</h2><button class="dg48-toggle" type="button" tabindex="-1">+</button></div><div class="dg48-body hidden">'+html+'</div>');c.id=id;return c;}
function d3Open(id,child){const c=$(id);if(!c)return;const wasCalendarOpen=id==='dg62PlannerCard'&&c.querySelector('.dg62-main')?.open;[...$('bossView').children].filter(x=>x.classList.contains('card')).forEach(x=>d3Collapse(x,x!==c));if(child){c.querySelectorAll('.d3-panel').forEach(x=>x.classList.toggle('hidden',x.id!==child));c.querySelectorAll('[data-panel]').forEach(x=>x.setAttribute('aria-selected',String(x.dataset.panel===child)));}DG3.open=child||id;if(id==='dg62PlannerCard'){if(wasCalendarOpen)dg62OpenPlanner();return;}const fn=DG3.loaders[DG3.open];if(fn)Promise.resolve(fn()).catch(e=>d3Notice(e.message,'error'));}
function d3Wire(c){const old=c.querySelector(':scope > .dg48-head');if(!old)return;const h=old.cloneNode(true);old.replaceWith(h);h.tabIndex=0;const go=e=>{if(e.type==='keydown'&&!['Enter',' '].includes(e.key))return;e.preventDefault();e.stopPropagation();if(d3Body(c).classList.contains('hidden'))d3Open(c.id);else{d3Collapse(c,true);DG3.open='';}};h.addEventListener('click',go);h.addEventListener('keydown',go);}
function d3Group(id,title,items){const c=d3Section(id,title,'<div class="d3-menu"></div><div class="d3-content"></div>'),menu=c.querySelector('.d3-menu'),host=c.querySelector('.d3-content');items.forEach(([p,label])=>{if(!p)return;p.classList.add('d3-panel','hidden');p.querySelector(':scope > .dg48-head')?.remove();d3Body(p)?.classList.remove('hidden');const b=d3Element('button','',esc(label));b.type='button';b.dataset.panel=p.id;b.addEventListener('click',()=>{const y=menu.getBoundingClientRect().top;host.style.minHeight=Math.max(0,innerHeight-host.getBoundingClientRect().top)+'px';d3Open(id,p.id);const delta=menu.getBoundingClientRect().top-y;if(Math.abs(delta)>1)window.scrollBy({top:delta,behavior:'instant'});});menu.append(b);host.append(p);});return c;}
function d3InstallOffice(){const root=$('bossView'),cards=[...root.children],find=t=>cards.find(c=>(c.querySelector(':scope > .dg48-head h2,:scope > h2')?.textContent||'').includes(t));const completed=find('Regieberichte');completed.id='d3Completed';completed.querySelector('h2').textContent='Abgeschlossene Auftr\u00e4ge';$('regieMergeToolbar')?.remove();
 const running=d3Section('d3Running','Laufende Auftr\u00e4ge','<div id="d3RunningStatus"></div><div id="d3OrderPlan"></div><div id="d3RunningList"></div>');
 const inquiry=d3Section('d3Inquiries','Offene Anfragen','<div class="report-actions">'+d3Button('Gmail abgleichen','d3Import')+d3Button('Aktualisieren','d3Inquiries',[],'secondary')+'</div><div id="d3InquiryStatus"></div><div id="d3InquiryList"></div>');
 const offers=[['d3OfferOpen','Offene Angebote','Offen'],['d3OfferCreate','Angebote zu erstellen','Zu erstellen'],['d3OfferArchive','Angebotsarchiv','Archiv']].map(([id,title,stage])=>{const p=d3Section(id,title,'<h3>'+title+'</h3><div id="'+id+'Status"></div><div id="'+id+'List"></div>');DG3.loaders[id]=()=>loadOffers(stage);return [p,title];});const stat=d3Section('d3Stats','Angebotsstatistik','<div id="d3StatsStatus"></div><div id="d3StatsList"></div>');offers.push([stat,'Angebotsstatistik']);DG3.loaders.d3Stats=loadStats;const offerGroup=d3Group('d3Offers','Angebotsbereich',offers);
 const reminder=d3Section('d3Reminder','Reminder','<div id="d3ReminderStatus"></div><div id="d3ReminderList"></div>'),employee=find('Mitarbeiterverwaltung');employee.id='d3EmployeeAdmin';const admin=d3Group('d3Admin','Verwaltung',[[employee,'Mitarbeiterverwaltung'],[$('dg48AbsenceGroup'),'Urlaub / Abwesenheiten / Feiertage'],[$('dg48EmployeeClosures'),'Mitarbeiterberichte']]),health=d3Section('d3Health','Systemcheck','<div id="d3HealthList"></div>'),planner=$('dg62PlannerCard');
 [planner,completed,running,inquiry,offerGroup,reminder,admin,health].forEach((c,i)=>{root.append(c);c.classList.add('d3-main');c.classList.toggle('d3-alt',i%2===1);if(c!==planner)d3Wire(c);d3Collapse(c,true);});
 Object.assign(DG3.loaders,{d3Completed:()=>loadRegieReports(DG3.completedView||'Abgeschlossen'),d3Running:()=>loadRegieReports('Laufend'),d3Inquiries:d3Inquiries,d3Reminder:loadReminders,d3EmployeeAdmin:loadChefAdministration,dg48AbsenceGroup:loadChefAdministration,dg48EmployeeClosures:loadBossDayClosuresV48,d3Health:d3Health,dg62PlannerCard:()=>dg62Load()});
 const details=planner.querySelector('.dg62-main');details.addEventListener('toggle',()=>{if(details.open){[...root.children].filter(x=>x.classList.contains('card')&&x!==planner).forEach(x=>d3Collapse(x,true));DG3.open=planner.id;dg62OpenPlanner();}else if(DG3.open===planner.id){DG3.open='';}});
 const tiles=[['completed','Abgeschlossene Auftr\u00e4ge','d3Completed',''],['running','Laufende Auftr\u00e4ge','d3Running',''],['offers','Offene Angebote','d3Offers','d3OfferOpen'],['days','Offene Tagesabschl\u00fcsse','d3Admin','dg48EmployeeClosures'],['reminders','Reminder','d3Reminder',''],['inquiries','Offene Anfragen','d3Inquiries','']];root.prepend(d3Element('div','d3-dashboard',tiles.map(([key,label,id,sub])=>'<button type="button" class="d3-tile '+key+'" data-d3-fn="d3Open" data-d3-args="'+esc(JSON.stringify([id,sub]))+'"><span>'+esc(label)+'</span><strong id="d3Count-'+key+'">\u2026</strong></button>').join('')));root.prepend(d3Element('div','muted small','<div id="d3Sync">Automatische Aktualisierung bereit</div>'));
}
function d3Count(k,v){const e=$('d3Count-'+k);if(e&&e.textContent!==String(v))e.textContent=String(v);}
async function d3Dashboard(){if(!canAccessBoss()||!navigator.onLine)return;const d=new Date(),reportsP=api(chefPayload({action:'getRegieReports',status:'Offen',year:0,month:0})),offerOpenP=api(chefPayload({action:'getOfferReports',stage:'Offen'})),offerCreateP=api(chefPayload({action:'getOfferReports',stage:'Zu erstellen'})),daysP=api(chefPayload({action:'getBossDayClosures',year:d.getFullYear(),month:d.getMonth()+1})),remindersP=api(chefPayload({action:'getOfferReminders',includeDone:false})),inquiriesP=api(chefPayload({action:'getCustomerInquiries',status:'Offen'})),safe=async(p,fn,keys)=>{try{fn(await p);}catch(_e){keys.forEach(k=>d3Count(k,'!'));}};await Promise.all([safe(reportsP,a=>{d3Count('running',a.filter(g=>g.jobStatus==='Laufend').length);d3Count('completed',a.filter(g=>g.jobStatus!=='Laufend').length);},['running','completed']),safe(Promise.all([offerOpenP,offerCreateP]),([o,c])=>{DG3.offerCounts={open:o.length,create:c.length};d3Count('offers',o.length+c.length);},['offers']),safe(daysP,a=>d3Count('days',a.reduce((n,x)=>n+(x.days||[]).filter(d35MandatoryDayClosure).length,0)),['days']),safe(remindersP,a=>d3Count('reminders',a.filter(x=>x.isDue).length),['reminders']),safe(inquiriesP,a=>d3Count('inquiries',a.length),['inquiries'])]);}
function d3ReportRoot(view){return $(view==='Laufend'?'d3RunningList':'regieResult');}
async function d3Reports(view='Abgeschlossen'){DG3.active=view;window.__regieStatus=view;if(view!=='Laufend')DG3.completedView=view;const root=d3ReportRoot(view),st=view==='Laufend'?'d3RunningStatus':'regieStatus',billed=view==='Abgerechnet';DG3.tokens=DG3.tokens||{};const token=DG3.tokens[root.id]=(DG3.tokens[root.id]||0)+1;if(view!=='Laufend')$('regieDateFilter')?.classList.toggle('hidden',!billed);if(!navigator.onLine){setMessage(st,'Offline. Angezeigte Daten sind moeglicherweise veraltet.','warn');return;}setMessage(st,'Auftr\u00e4ge werden geladen ...','info');try{const data=await api(chefPayload({action:'getRegieReports',status:billed?'Abgerechnet':'Offen',year:billed?(+$('regieYear').value||0):0,month:billed?(+$('regieMonth').value||0):0}));if(DG3.tokens[root.id]!==token)return;const groups=data.filter(g=>billed||(view==='Laufend'?g.jobStatus==='Laufend':g.jobStatus!=='Laufend'));DG3.reports[view]=groups;root.replaceChildren();if(!billed&&groups.length)root.append(d3Element('div','d3-merge-top',d3Button('Ausgew\u00e4hlte zusammenf\u00fchren','requestMergeSelectedRegieReports',[view],'success')+'<div class="muted small d3-hint">Mindestens zwei Kundenkarten markieren.</div>'));groups.forEach((g,i)=>root.append(d3ReportCard(g,view,i)));if(!groups.length)root.innerHTML='<div class="status ok">Keine Eintr\u00e4ge.</div>';setMessage(st,groups.length+' Kundenkarte(n) geladen - '+new Date().toLocaleTimeString('de-DE'),'ok');if(view==='Laufend')await d3Orders();}catch(e){setMessage(st,'Laden fehlgeschlagen: '+e.message,'error');}}
function d3Single(r){return '<div class="entry"><strong>'+esc(formatDateDE(r.date))+' - '+esc(r.employee)+' - '+formatHours(r.hours)+' Std.</strong><div>'+esc(r.start)+' - '+esc(r.end)+'</div><div>'+esc(r.activity||'')+'</div>'+(r.materialUsed?'<div>Material: '+esc(r.material)+'</div>':'')+(r.isSupplement?'<div class="status info">Nachtrag '+esc(r.supplementCreatedAt||'')+'</div>':'')+'</div>';}
function d3ReportCard(g,view,index){const billed=view==='Abgerechnet',ids=[...new Set((g.objectIds||[g.objectId]).filter(Boolean))],reports=(g.reports||[]).filter(x=>x.id),key=view+':'+index,c=d3Element('div','report-card '+(billed?'billed':'open')+(index%2?' d3-alt':''));c.dataset.index=index;c.dataset.view=view;window.__dgGroupMap[key]=reports.map(x=>String(x.id));reports.forEach(r=>window.__dgReportMap[String(r.id)]=r);const state=billed?'Abgerechnet':view==='Laufend'?'Laufend':'Abgeschlossen';c.innerHTML=(!billed?'<label class="d3-selection"><input type="checkbox" class="regie-merge-select" data-index="'+index+'" data-object-ids="'+esc(ids.join(','))+'"> Zum Zusammenf\u00fchren markieren</label>':'')+'<div class="d3-head"><strong>\ud83c\udfe2 '+esc(g.customer)+'</strong><span class="job-status '+(billed?'billed':view==='Laufend'?'running':'completed')+'">'+state+'</span></div><div class="report-meta">'+esc(formatDateDE(g.firstDate))+(g.lastDate!==g.firstDate?' bis '+esc(formatDateDE(g.lastDate)):'')+' - '+reports.length+' Bericht(e)</div><div class="total">Gesamt Personal: '+formatHours(g.totalHours)+' Std.</div><div class="report-meta"><strong>Mitarbeiter:</strong> '+esc((g.employees||[]).join(', '))+'</div><details><summary>Einzelberichte anzeigen</summary>'+reports.map(d3Single).join('')+'</details>';
 const photos=new Map();reports.forEach(r=>{const p=String(r.photoFileIds||'').split(','),u=String(r.photoUrls||'').split(' | ');p.forEach((id,i)=>{if(id.trim())photos.set(id.trim(),u[i]||'');});});c.append(d3Element('div','d3-export','<strong>Bericht herunterladen</strong><div class="muted small">Exportiert genau die '+reports.length+' angezeigten Einzelberichte mit Unterschriften und ausgew\u00e4hlten Bildern.</div>'+[...photos].map(([id,u],i)=>'<label class="d3-selection"><input type="checkbox" class="d3-photo" value="'+esc(id)+'" checked> Bild '+(i+1)+' <a target="_blank" rel="noopener" href="'+esc(u)+'">ansehen</a></label>').join('')+d3Button('Bericht herunterladen','d3Export',[view,index])+'<div class="d3-export-status"></div>'));
 const b=[d3Button('Bericht bearbeiten','dgRequestGroupEdit',[key])];if(!billed){b.push(d3Button(view==='Laufend'?'Auftrag abschlie\u00dfen':'Auf laufend zur\u00fccksetzen','setRegieObjectJobStatus',[ids.join(','),view==='Laufend'?'Abgeschlossen':'Laufend'],'success'));if(view==='Abgeschlossen')b.push(d3Button('Als abgerechnet markieren','markRegieObjectBilled',[ids.join(',')],'success'));b.push(d3Button('Angebot zu erstellen','d3MoveOffer',[reports.map(x=>x.id)]));}b.push(d3Button('Interner Vermerk','d3Note',[ids[0],g.customer]));if(!billed)b.push(d3Button('Ausgew\u00e4hlte zusammenf\u00fchren','requestMergeSelectedRegieReports',[view],'success'));c.append(d3Element('div','report-actions',b.join('')));if(billed)c.append(d3Element('div','status info','Abgerechnet am '+esc(g.billedAt||'')+' von '+esc(g.billedBy||'')));c.querySelector('.regie-merge-select')?.addEventListener('change',()=>updateRegieMergeButton(view));return c;}
function d3Merge(view){const root=d3ReportRoot(view);if(!d3Visible(root))return;const checked=[...root.querySelectorAll('.regie-merge-select:checked')];if(checked.length<2)return alert('Mindestens zwei unterschiedliche Kundenkarten markieren.');const groups=checked.map(x=>DG3.reports[view][+x.dataset.index]),ids=[...new Set(groups.flatMap(g=>g.objectIds||[g.objectId]))].filter(Boolean);if(ids.length<2)return alert('Auswahl enthaelt nur ein gemeinsames Objekt.');DG3.merge={view,ids};$('regieMergeConfirmText').textContent='Diese '+groups.length+' Kundenkarten zusammenfuehren?\n\n'+groups.map(g=>g.customer).join('\n')+'\n\nEinzelberichte und Stunden bleiben erhalten.';$('regieMergeConfirmModal').classList.remove('hidden');}
async function d3ConfirmMerge(){if(DG3.merging||!DG3.merge)return;DG3.merging=true;const {view,ids}=DG3.merge;try{await api(chefPayload({action:'mergeRegieObjects',objectIds:ids}));closeRegieMergeConfirm();await d3Reports(view);setMessage(view==='Laufend'?'d3RunningStatus':'regieStatus','Ausgewaehlte Berichte zusammengefuehrt.','ok');}catch(e){alert('Zusammenfuehren fehlgeschlagen: '+e.message);}finally{DG3.merging=false;}}
async function d3Export(view,index){const g=DG3.reports[view]?.[index];if(!g)throw new Error('Bitte Berichte neu laden.');const card=d3ReportRoot(view).querySelector('.report-card[data-index="'+index+'"]'),st=card.querySelector('.d3-export-status');st.className='status info';st.textContent='Export wird erstellt ...';try{const r=await api(chefPayload({action:'createRegieReportZip',objectIds:g.objectIds||[g.objectId],entryIds:g.reports.map(x=>x.id),fileIds:[...card.querySelectorAll('.d3-photo:checked')].map(x=>x.value),customer:g.customer}));d3Download(r,'application/zip');st.className='status ok';st.textContent=r.reportCount+' Berichte exportiert.';}catch(e){st.className='status error';st.textContent=e.message;}}
async function d3JobStatus(ids,status){if(!confirm('Auftrag auf '+status+' setzen?'))return;const view=DG3.active;for(const objectId of ids.split(',').filter(Boolean))await api(chefPayload({action:'setRegieObjectJobStatus',objectId,jobStatus:status}));await d3Reports(view);}
async function d3Bill(ids){const objectIds=ids.split(',').filter(Boolean),risk=await api(chefPayload({action:'checkRegieBillingRisk',objectIds})),matches=risk.matches||[];if(!confirm((matches.length?'Weitere offene Vorgaenge gefunden:\n'+matches.map(x=>x.customer).join('\n')+'\n\n':'')+'Diesen Auftrag als abgerechnet markieren?'))return;await api(chefPayload({action:'markRegieObjectsBilled',objectIds,force:!!matches.length}));await d3Reports(DG3.active);}
async function d3MoveOffer(entryIds){if(!confirm('Nach Angebote zu erstellen verschieben?'))return;await api(chefPayload({action:'setRegieReportsOfferStatus',entryIds,offerStatus:'Angebot zu erstellen'}));await d3Reports(DG3.active);}
async function d3Note(objectId,customer){const r=await api(chefPayload({action:'getObjectInternalNote',objectId})),note=prompt('Interner Vermerk zu '+customer,r.note||'');if(note===null)return;await api(chefPayload({action:'saveObjectInternalNote',objectId,note}));}
async function d3Health(){const out=$('d3HealthList');out.textContent='System wird geprueft ...';try{const r=await api(chefPayload({action:'systemHealthCheck'}));out.innerHTML='<div class="status '+(r.ok?'ok':'warn')+'">App 5.0 - Backend '+esc(r.version)+' - '+esc(r.checkedAt)+'</div>'+(r.checks||[]).map(x=>'<div class="status '+(x.level==='error'?'error':x.level==='warn'?'warn':'ok')+'"><strong>'+esc(x.name)+'</strong><br>'+esc(x.detail)+'</div>').join('');}catch(e){out.textContent='Systemcheck fehlgeschlagen: '+e.message;}}


DG3.offers={};DG3.inquiries=[];DG3.orders=[];DG3.reminders=[];
function d3OfferBox(stage){return stage==='Offen'?'d3OfferOpen':stage==='Zu erstellen'?'d3OfferCreate':'d3OfferArchive';}
async function loadOffers(stage='Offen'){const id=d3OfferBox(stage);setMessage(id+'Status','Angebote werden geladen ...','info');try{const rows=await api(chefPayload({action:'getOfferReports',stage}));DG3.offers[stage]=rows;$(id+'List').innerHTML=rows.map((r,i)=>{const buttons=stage==='Offen'?d3Button('Angenommen','d3OfferDecision',[r.offerId,true],'success')+d3Button('Abgelehnt','d3OfferDecision',[r.offerId,false],'secondary'):stage==='Zu erstellen'?d3Button('Angebot erstellt','d3OfferCreated',[r.offerId],'success')+d3Button('Auftrag entfernen','d3DiscardOffer',[r.offerId],'danger'):'';return '<div class="report-card'+(i%2?' d3-alt':'')+'"><strong>'+esc(r.customer)+'</strong><div class="report-meta">'+esc(r.status)+' - '+Number(r.reportCount||0)+' Berichte - '+formatHours(r.totalHours)+' Std.</div><div>'+esc(r.description||'')+'</div>'+((r.reports||[]).length?'<details><summary>Einzelberichte anzeigen</summary>'+r.reports.map(d3Single).join('')+'</details>':'<div class="muted small">Angebot ohne bereits erfasste Arbeitszeit.</div>')+'<div class="report-actions">'+buttons+'</div></div>';}).join('')||'Keine Angebote vorhanden.';setMessage(id+'Status',rows.length+' Angebot(e) geladen.','ok');}catch(e){setMessage(id+'Status',e.message,'error');}}
function d3Offer(id){for(const list of Object.values(DG3.offers)){const r=list.find(x=>x.offerId===id);if(r)return r;}throw new Error('Angebot nicht mehr aktuell. Bitte neu laden.');}
async function d3OfferDecision(offerId,yes){const r=d3Offer(offerId),running=yes&&r.totalHours>0?confirm('Mit Arbeitszeit als laufenden Auftrag uebernehmen?\nOK = Laufender Auftrag\nAbbrechen = angenommen archivieren'):false;if(!confirm('Angebot '+(yes?'annehmen':'ablehnen')+'?'))return;await api(chefPayload(running?{action:'acceptOfferAsRunning',offerId}:{action:'setRegieReportsOfferStatus',offerId,entryIds:[],offerStatus:yes?'Angebot Angenommen':'Angebot Abgelehnt'}));await loadOffers('Offen');}
function d3OfferCreated(offerId){const r=d3Offer(offerId);d3Form('Angebot erstellt - Reminder in 5 Tagen',[{name:'customer',label:'Kunde',required:true},{name:'offerNumber',label:'Angebotsnummer',required:true},{name:'phone',label:'Telefon'},{name:'email',label:'E-Mail',type:'email'},{name:'description',label:'Beschreibung',type:'textarea'}],r,async item=>{await api(chefPayload({action:'saveOfferCreatedWithReminder',offerId,item}));await loadOffers('Zu erstellen');});}
async function d3DiscardOffer(offerId){if(!confirm('Noch nicht erstellten Angebotsvorgang entfernen? Arbeitszeiten bleiben im Nachweis erhalten.'))return;await api(chefPayload({action:'discardOfferPermanently',offerId}));await loadOffers('Zu erstellen');}
async function loadStats(){setMessage('d3StatsStatus','Statistik wird geladen ...','info');try{const x=await api(chefPayload({action:'getOfferStatistics'}));$('d3StatsList').innerHTML='<div class="d3-stats">'+[['Erstellt',x.total],['Offen',x.open],['Angenommen',x.accepted],['Abgelehnt',x.declined],['Annahmequote',Number(x.acceptanceRate||0).toFixed(1)+' %']].map(([k,v])=>'<div class="d3-stat"><span>'+k+'</span><strong>'+esc(v??0)+'</strong></div>').join('')+'</div>'+((x.months||[]).length?'<h3>Monatsuebersicht</h3>'+x.months.map(m=>'<div class="entry">'+esc(m.month)+' - '+m.total+' erstellt - '+m.accepted+' angenommen - '+m.declined+' abgelehnt</div>').join(''):'');setMessage('d3StatsStatus','Statistik aktuell.','ok');}catch(e){setMessage('d3StatsStatus',e.message,'error');}}
async function loadReminders(){setMessage('d3ReminderStatus','Reminder werden geladen ...','info');try{DG3.reminders=await api(chefPayload({action:'getOfferReminders',includeDone:false}));$('d3ReminderList').innerHTML=DG3.reminders.map((r,i)=>'<div class="report-card'+(i%2?' d3-alt':'')+'"><strong>'+esc(r.customer)+' - '+esc(r.offerNumber)+'</strong><div class="status '+(r.isOverdue?'warn':'info')+'">Faellig: '+esc(formatDateDE(r.dueDate))+'</div><div>'+esc(r.description)+'</div><div>Telefon: <a href="tel:'+esc(r.phone)+'">'+esc(r.phone)+'</a></div><div class="report-actions">'+d3Button('Angenommen','d3ReminderDecision',[r.id,true],'success')+d3Button('Kein Auftrag','d3ReminderDecision',[r.id,false],'secondary')+d3Button('Verschieben','d3ReminderDate',[r.id])+'</div></div>').join('')||'Keine offenen Reminder.';setMessage('d3ReminderStatus',DG3.reminders.length+' offene Reminder.','ok');d3Count('reminders',DG3.reminders.filter(x=>x.isDue).length);}catch(e){setMessage('d3ReminderStatus',e.message,'error');}}
async function d3ReminderDecision(id,yes){const r=DG3.reminders.find(x=>x.id===id);if(!r)throw new Error('Bitte neu laden.');const asRunning=yes&&r.totalHours>0?confirm('Als laufenden Auftrag uebernehmen? OK=laufend, Abbrechen=angenommen archivieren.'):false;if(!confirm(yes?'Angebot annehmen?':'Angebot ablehnen?'))return;await api(chefPayload({action:yes?'acceptOfferFromReminder':'declineOfferFromReminder',reminderId:id,asRunning}));await loadReminders();}
function d3ReminderDate(id){const r=DG3.reminders.find(x=>x.id===id);d3Form('Reminder verschieben',[{name:'dueDate',label:'Neues Datum',type:'date',required:true}],r,async v=>{await api(chefPayload({action:'rescheduleOfferReminder',reminderId:id,dueDate:v.dueDate,days:0}));await loadReminders();});}
function d3Inquiry(id){const r=DG3.inquiries.find(x=>x.id===id);if(!r)throw new Error('Anfrage nicht mehr aktuell. Bitte neu laden.');return r;}
function d3Address(r){return r.address||[r.postalCode,r.city].filter(Boolean).join(' ');}
async function d3Inquiries(){setMessage('d3InquiryStatus','Anfragen werden geladen ...','info');try{DG3.inquiries=await api(chefPayload({action:'getCustomerInquiries',status:'Offen'}));$('d3InquiryList').innerHTML=DG3.inquiries.map((r,i)=>'<div class="report-card'+(i%2?' d3-alt':'')+'"><div class="d3-head"><strong>'+esc(r.customer)+'</strong><span class="badge">'+esc(r.source)+'</span></div><div class="report-meta">'+esc(r.receivedAt)+' - '+esc(r.status)+'</div><div>'+esc(d3Address(r))+'</div><div><a href="tel:'+esc(r.phone)+'">'+esc(r.phone)+'</a> <a href="mailto:'+esc(r.email)+'">'+esc(r.email)+'</a></div><div>'+esc(r.description||r.subject)+'</div>'+(r.internalNote?'<div class="status info">Interne Notiz: '+esc(r.internalNote)+'</div>':'')+'<div class="report-actions">'+d3Button('Kontakt aufgenommen','d3Contact',[r.id])+d3Button('Termin erstellen','d3Appointment',['inquiry',r.id,false])+d3Button('Angebot / Besichtigung','d3Appointment',['inquiry',r.id,true])+d3Button('Als Angebot uebernehmen','d3InquiryOffer',[r.id])+d3Button('Als Auftrag uebernehmen','d3InquiryOrder',[r.id],'success')+d3Button('Interne Notiz','d3InquiryNote',[r.id])+d3Button('Erledigt','d3CompleteInquiry',[r.id],'success')+d3Button('Entfernen','d3DeleteInquiry',[r.id],'danger')+'</div></div>').join('')||'Keine offenen Anfragen.';setMessage('d3InquiryStatus',DG3.inquiries.length+' offene Anfragen.','ok');d3Count('inquiries',DG3.inquiries.length);}catch(e){setMessage('d3InquiryStatus',e.message,'error');}}
async function d3Import(){setMessage('d3InquiryStatus','Gmail: Website und CHECK24 werden abgeglichen ...','info');try{const r=await api(chefPayload({action:'syncCustomerInquiries'}));await d3Inquiries();setMessage('d3InquiryStatus','Abgleich: '+Number(r.imported||0)+' neu, '+Number(r.updated||0)+' ergaenzt.','ok');}catch(e){setMessage('d3InquiryStatus',e.message,'error');}}
function d3InquiryNote(id){const r=d3Inquiry(id);d3Form('Interne Notiz',[{name:'note',label:'Notiz',type:'textarea'}],{note:r.internalNote||''},async v=>{await api(chefPayload({action:'saveCustomerInquiryNote',id,note:v.note}));await d3Inquiries();});}
function d3Contact(id){const r=d3Inquiry(id);d3Form('Kontakt dokumentieren',[{name:'date',label:'Datum',type:'date',required:true},{name:'time',label:'Uhrzeit',type:'time',required:true},{name:'person',label:'Gespraechspartner'},{name:'note',label:'Notiz',type:'textarea'}],{date:localDate(),time:new Date().toTimeString().slice(0,5),person:r.customer,note:''},async v=>{await api(chefPayload({action:'saveCustomerInquiryContact',id,...v}));await d3Inquiries();});}
function d3CompleteInquiry(id){const r=d3Inquiry(id);d3Form('Anfrage erledigen',[{name:'reason',label:'Grund',type:'select',options:['Kein Auftrag','Nicht zustaendig','Doppelte Anfrage','Telefonisch erledigt','Kunde meldet sich wieder','Sonstiges']},{name:'note',label:'Interne Notiz',type:'textarea'}],{reason:'Kein Auftrag',note:r.internalNote||''},async v=>{await api(chefPayload({action:'completeCustomerInquiry',id,...v}));await d3Inquiries();});}
async function d3DeleteInquiry(id){if(!confirm('Anfrage aus der offenen Liste entfernen?'))return;await api(chefPayload({action:'deleteCustomerInquiry',id}));await d3Inquiries();}
function d3InquiryOffer(id){d3Form('Als offenes Angebot uebernehmen',[{name:'customer',label:'Kunde',required:true},{name:'phone',label:'Telefon',required:true}],d3Inquiry(id),async v=>{if(v.phone.replace(/\D/g,'').length<6)throw new Error('Gueltige Telefonnummer erforderlich.');await api(chefPayload({action:'inquiryToOffer',id,...v}));await d3Inquiries();});}
async function d3InquiryOrder(id){const r=d3Inquiry(id);if(!confirm('Als Auftrag ohne Termin uebernehmen?'))return;await api(chefPayload({action:'saveManualOrder',item:{id:'AUF-ANF-'+id,customer:r.customer,address:d3Address(r),phone:r.phone,email:r.email,description:r.description||r.subject,source:r.source,inquiryId:r.id,status:'Ohne Termin',internalNote:r.internalNote||''}}));await d3Inquiries();}
async function d3Orders(){DG3.orders=await api(chefPayload({action:'getManualOrders',status:'Alle'}));const rows=DG3.orders.filter(x=>['Ohne Termin','Termin zu vereinbaren','Offen','Laufend'].includes(x.status));$('d3OrderPlan').innerHTML='<div class="d3-head"><strong>Auftragsplanung</strong>'+d3Button('+ Auftrag anlegen','d3NewOrder',[],'success')+'</div>'+rows.map((r,i)=>'<div class="report-card'+(i%2?' d3-alt':'')+'"><strong>'+esc(r.customer)+'</strong> <span class="badge">'+esc(r.status)+'</span><div>'+esc(r.address)+'</div><div>'+esc(r.description)+'</div>'+(r.internalNote?'<div class="status info">'+esc(r.internalNote)+'</div>':'')+'<div class="report-actions">'+d3Button('Termin vereinbaren','d3Appointment',['order',r.id,false])+d3Button('Interne Notiz','d3OrderNote',[r.id])+d3Button(r.status==='Laufend'?'Abschliessen':'Arbeit begonnen','d3OrderStatus',[r.id,r.status==='Laufend'?'Abgeschlossen':'Laufend'],'success')+(r.status!=='Laufend'?d3Button('Entfernen','d3OrderDelete',[r.id],'danger'):'')+'</div></div>').join('');}
function d3NewOrder(){const id='AUF-'+uid();d3Form('Auftrag anlegen',[{name:'customer',label:'Kunde',required:true},{name:'address',label:'Adresse'},{name:'phone',label:'Telefon'},{name:'email',label:'E-Mail',type:'email'},{name:'description',label:'Auftrag',type:'textarea',required:true},{name:'internalNote',label:'Interne Notiz',type:'textarea'}],{},async item=>{await api(chefPayload({action:'saveManualOrder',item:{...item,id,status:'Ohne Termin',source:'Manuell'}}));await d3Orders();});}
function d3OrderNote(id){const r=DG3.orders.find(x=>x.id===id);if(!r)throw new Error('Bitte neu laden.');d3Form('Interne Notiz',[{name:'note',label:'Notiz',type:'textarea'}],{note:r.internalNote||''},async v=>{await api(chefPayload({action:'saveManualOrderNote',id,note:v.note}));await d3Orders();});}
async function d3OrderStatus(id,status){if(!confirm('Auftrag auf '+status+' setzen?'))return;await api(chefPayload({action:'setManualOrderStatus',id,status}));await d3Orders();}
async function d3OrderDelete(id){if(!confirm('Manuellen Auftrag entfernen?'))return;await api(chefPayload({action:'deleteManualOrder',id}));await d3Orders();}
async function d3Appointment(kind,id,offer){const r=kind==='inquiry'?d3Inquiry(id):DG3.orders.find(x=>x.id===id);if(!r)throw new Error('Quelle nicht mehr vorhanden.');const workers=(await api(chefPayload({action:'getPlannerWorkers'}))).filter(x=>x.active),eventId='KT-'+uid();d3Form(offer?'Besichtigung planen':'Termin vereinbaren',[{name:'customer',label:'Kunde',required:true},{name:'address',label:'Vollstaendige Adresse',required:true},{name:'task',label:'Taetigkeit',type:'textarea',required:true},{name:'date',label:'Datum',type:'date',required:true},{name:'start',label:'Von',type:'time',required:true},{name:'end',label:'Bis',type:'time',required:true},{name:'employeeIds',label:'Mitarbeiter',type:'workers',options:workers.map(w=>({value:w.id,label:w.displayName||w.employeeName}))}],{customer:r.customer,address:d3Address(r),task:(offer?'Besichtigung / Angebot: ':'')+(r.description||r.subject||''),date:localDate(),start:'08:00',end:'09:00',employeeIds:[]},async item=>{if(!item.employeeIds.length||item.end<=item.start)throw new Error('Mitarbeiter und Von/Bis pruefen.');await api(chefPayload({action:'planRequest3',kind,id,offer:!!offer,item:{...item,id:eventId}}));if(kind==='inquiry')await d3Inquiries();else await d3Orders();});}
async function d3EditQueue(id){const item=(await queueAll()).find(x=>Number(x.id)===Number(id));if(!item||item.type!=='saveEntry')return;const entry=item.payload.entry;d3Form('Ausstehende Angaben korrigieren',[{name:'customer',label:'Kunde',required:true},{name:'date',label:'Datum',type:'date',required:true},{name:'start',label:'Von',type:'time',required:true},{name:'end',label:'Bis',type:'time',required:true},{name:'activity',label:'Taetigkeit',type:'textarea',required:true}],entry,async v=>{const mins=s=>{const p=s.split(':').map(Number);return p[0]*60+p[1];},a=mins(v.start),b=mins(v.end),duration=(b-a+1440)%1440;if(!duration)throw new Error('Von und Bis duerfen nicht gleich sein.');Object.assign(entry,v,{hours:Math.round(duration/60*100)/100,startMinutes:a,endMinutes:b});delete item.error;await queuePut(item);await renderQueueDetails();});}


DG3.enhanceCalendar=function(){document.querySelectorAll('.dg62-event[data-event-id]').forEach(e=>{e.draggable=true;e.addEventListener('dragstart',ev=>{DG3.drag=e.dataset.eventId;ev.dataTransfer.setData('text/plain',DG3.drag);});e.addEventListener('dragend',()=>DG3.drag='');});document.querySelectorAll('.dg62-day').forEach(day=>{const cols=Math.max(1,day.querySelectorAll('.dg62-name').length);[...day.querySelectorAll('.dg62-cell')].forEach((cell,i)=>{cell.addEventListener('dragover',e=>{if(DG3.drag)e.preventDefault();});cell.addEventListener('drop',e=>{const id=DG3.drag||e.dataTransfer.getData('text/plain'),r=DG3.calendar.event(id);if(!r)return;e.preventDefault();e.stopPropagation();const minutes=t=>{const p=t.split(':').map(Number);return p[0]*60+p[1];},duration=minutes(r.end)-minutes(r.start),bounds=cell.getBoundingClientRect(),quarter=Math.min(45,Math.max(0,Math.round((e.clientY-bounds.top)/bounds.height*4)*15));let start=Math.min((7+Math.floor(i/cols))*60+quarter,1200-duration);if(start<420||duration<=0)return;const time=n=>String(Math.floor(n/60)).padStart(2,'0')+':'+String(n%60).padStart(2,'0');dg62Edit(id);$('dg62ED').value=day.dataset.date;$('dg62Start').value=time(start);$('dg62End').value=time(start+duration);setMessage('dg62MS','Neue Uhrzeit vorgeschlagen. Erst Termin speichern bestaetigt die Aenderung.','info');});});});};
function d3TransferInstall(){const b=d3Element('button','btn primary','An anderen Mitarbeiter uebertragen');b.id='d3Transfer';b.type='button';b.dataset.d3Fn='d3Transfer';b.style.cssText='width:100%;margin-top:8px';$('dg62Copy').after(b);}
async function d3Transfer(){const record=DG3.calendar.event(DG3.calendar.edit().id);if(!record)throw new Error('Zuerst einen vorhandenen Termin oeffnen.');const options=DG3.calendar.workers().filter(w=>w.active&&!(record.employeeIds||[]).includes(w.id)).map(w=>({value:w.id,label:w.displayName||w.employeeName}));if(!options.length)return alert('Kein anderer aktiver Mitarbeiter vorhanden.');d3Form('Termin uebertragen',[{name:'targetWorkerId',label:'Zielmitarbeiter',type:'select',options}],{targetWorkerId:options[0].value},async v=>{if(!confirm('Beim bisherigen Mitarbeiter entfernen und zum Zielmitarbeiter verschieben?'))return;await api(chefPayload({action:'transferPlannerEvent',item:{sourceId:record.id,targetWorkerId:v.targetWorkerId,date:record.date}}));dg62Close();await dg62Load();});}


async function d3CheckBackend(){try{const r=await api({action:'ping'}),found=String(r.version||''),parts=found.split('.').map(Number),ok=parts[0]===3&&parts[1]>=4;DG3.backend=ok?found:'';if(!ok)d3Notice('App 5.0 benötigt Google-GS Backend 3.1 oder neuer. Gefunden: '+(found||'unbekannt')+'. Speichern ist gesperrt.','warn');else $('d3Notice')?.remove();return ok;}catch(e){DG3.backend='';d3Notice('Verbindungsprüfung fehlgeschlagen: '+e.message,'warn');return false;}}
/* DG 3.2: dashboard traffic lights, inquiry workflow/archive/reminders, report gallery, AQON visibility cleanup. */
const d32BaseInstallOffice=d3InstallOffice;
const d32BaseReportCard=d3ReportCard;

function d32JumpTo(id){
  const target=$(id);if(!target)return;
  requestAnimationFrame(()=>window.scrollTo({top:Math.max(0,target.getBoundingClientRect().top+window.scrollY-8),behavior:'auto'}));
}
function d3TileOpen(id,child){d3Open(id,child);d32JumpTo(id);}
function d3OfferTileOpen(){
  const child=(DG3.offerCounts?.create>0&&!(DG3.offerCounts?.open>0))?'d3OfferCreate':'d3OfferOpen';
  d3TileOpen('d3Offers',child);
}
function d32RestyleMain(){
  [...$('bossView').children].filter(x=>x.classList.contains('d3-main')).forEach((c,i)=>c.classList.toggle('d3-alt',i%2===1));
}
function d32InstallInquiryGroup(){
  const root=$('bossView'),open=$('d3Inquiries');if(!root||!open||$('d3InquiriesGroup'))return;
  const archive=d3Section('d3InquiryArchive','Anfragenarchiv','<h3>Anfragenarchiv</h3><div id="d3InquiryArchiveStatus"></div><div id="d3InquiryArchiveList"></div>');
  const group=d3Group('d3InquiriesGroup','Offene Anfragen',[[open,'Offene Anfragen'],[archive,'Anfragenarchiv']]);
  open.classList.remove('d3-main','d3-alt');archive.classList.remove('d3-main','d3-alt');
  const before=$('d3Offers');root.insertBefore(group,before||null);group.classList.add('d3-main');d3Wire(group);d3Collapse(group,true);
  DG3.loaders.d3InquiryArchive=d3InquiryArchiveList;
  const tile=document.querySelector('.d3-tile.inquiries');if(tile){tile.dataset.d3Fn='d3TileOpen';tile.dataset.d3Args=JSON.stringify(['d3InquiriesGroup','d3Inquiries']);}
  d32RestyleMain();
}
function d32WireDashboardTiles(){
  document.querySelectorAll('.d3-tile').forEach(tile=>{
    if(tile.classList.contains('offers')){tile.dataset.d3Fn='d3OfferTileOpen';tile.dataset.d3Args='[]';return;}
    if(tile.classList.contains('inquiries'))return;
    const args=JSON.parse(tile.dataset.d3Args||'[]');tile.dataset.d3Fn='d3TileOpen';tile.dataset.d3Args=JSON.stringify(args);
  });
}
d3InstallOffice=function(){d32BaseInstallOffice();d32InstallInquiryGroup();d32WireDashboardTiles();};

function d3Count(k,v){
  const e=$('d3Count-'+k);if(!e)return;
  if(e.textContent!==String(v))e.textContent=String(v);
  const tile=e.closest('.d3-tile');if(!tile)return;
  tile.classList.remove('traffic-green','traffic-orange','traffic-red','traffic-error');
  const n=Number(v);
  if(!Number.isFinite(n)){tile.classList.add('traffic-error');return;}
  tile.classList.add(n===0?'traffic-green':n<=5?'traffic-orange':'traffic-red');
}
async function d3Dashboard(){if(!canAccessBoss()||!navigator.onLine)return;const d=new Date(),reportsP=api(chefPayload({action:'getRegieReports',status:'Offen',year:0,month:0})),offerOpenP=api(chefPayload({action:'getOfferReports',stage:'Offen'})),offerCreateP=api(chefPayload({action:'getOfferReports',stage:'Zu erstellen'})),daysP=api(chefPayload({action:'getBossDayClosures',year:d.getFullYear(),month:d.getMonth()+1})),remindersP=api(chefPayload({action:'getOfferReminders',includeDone:false})),inquiriesP=api(chefPayload({action:'getCustomerInquiries',status:'Offen'})),safe=async(p,fn,keys)=>{try{fn(await p);}catch(_e){keys.forEach(k=>d3Count(k,'!'));}};await Promise.all([safe(reportsP,a=>{d3Count('running',a.filter(g=>g.jobStatus==='Laufend').length);d3Count('completed',a.filter(g=>g.jobStatus!=='Laufend').length);},['running','completed']),safe(Promise.all([offerOpenP,offerCreateP]),([o,c])=>{DG3.offerCounts={open:o.length,create:c.length};d3Count('offers',o.length+c.length);},['offers']),safe(daysP,a=>d3Count('days',a.reduce((n,x)=>n+(x.days||[]).filter(d35MandatoryDayClosure).length,0)),['days']),safe(remindersP,a=>d3Count('reminders',a.filter(x=>x.isDue).length),['reminders']),safe(inquiriesP,a=>d3Count('inquiries',a.length),['inquiries'])]);}

function d32InquiryCard(r,i,archive=false){
  const note=r.internalNote?'<div class="status info">Interne Notiz: '+esc(r.internalNote)+'</div>':'';
  const actions=archive?'':d3Button('Termin wurde vereinbart','d3InquiryArchive',[r.id],'success')+d3Button('Reminder','d3InquiryReminder',[r.id],'primary')+d3Button('Interne Notiz','d3InquiryNote',[r.id])+d3Button('Ablehnen','d3RejectInquiry',[r.id],'danger');
  return '<div class="report-card'+(i%2?' d3-alt':'')+'"><div class="d3-head"><strong>'+esc(r.customer)+'</strong><span class="badge">'+esc(r.source)+'</span></div><div class="report-meta">'+esc(r.receivedAt)+' - '+esc(r.status)+'</div><div>'+esc(d3Address(r))+'</div><div><a href="tel:'+esc(r.phone)+'">'+esc(r.phone)+'</a> <a href="mailto:'+esc(r.email)+'">'+esc(r.email)+'</a></div><div>'+esc(r.description||r.subject)+'</div>'+note+(archive&&r.doneReason?'<div class="muted small">Archiviert: '+esc(r.doneReason)+'</div>':'')+(actions?'<div class="report-actions">'+actions+'</div>':'')+'</div>';
}
async function d3Inquiries(){
  setMessage('d3InquiryStatus','Anfragen werden geladen ...','info');
  try{DG3.inquiries=await api(chefPayload({action:'getCustomerInquiries',status:'Offen'}));$('d3InquiryList').innerHTML=DG3.inquiries.map((r,i)=>d32InquiryCard(r,i,false)).join('')||'Keine offenen Anfragen.';setMessage('d3InquiryStatus',DG3.inquiries.length+' offene Anfragen.','ok');d3Count('inquiries',DG3.inquiries.length);}catch(e){setMessage('d3InquiryStatus',e.message,'error');}
}
async function d3InquiryArchiveList(){
  setMessage('d3InquiryArchiveStatus','Archiv wird geladen ...','info');
  try{const rows=await api(chefPayload({action:'getCustomerInquiries',status:'Archiviert'}));$('d3InquiryArchiveList').innerHTML=rows.map((r,i)=>d32InquiryCard(r,i,true)).join('')||'Noch keine archivierten Anfragen.';setMessage('d3InquiryArchiveStatus',rows.length+' archivierte Anfrage(n).','ok');}catch(e){setMessage('d3InquiryArchiveStatus',e.message,'error');}
}
async function d3InquiryArchive(id){if(!confirm('Termin wurde vereinbart und Anfrage archivieren?'))return;await api(chefPayload({action:'archiveCustomerInquiry',id}));await d3Inquiries();await d3Dashboard();}
function d3InquiryReminder(id){
  const options=Array.from({length:10},(_,i)=>({value:String(i+1),label:(i+1)+' Tag'+(i?'e':'')}));
  d3Form('Erinnerung für Anfrage',[{name:'days',label:'Erinnerung in',type:'select',options}],{days:'5'},async v=>{await api(chefPayload({action:'createInquiryReminder',id,days:Number(v.days)}));await d3Inquiries();await d3Dashboard();});
}
async function d3RejectInquiry(id){if(!confirm('Anfrage endgültig aus der App entfernen und zugehörige Gmail-Nachricht in den Papierkorb verschieben?'))return;await api(chefPayload({action:'rejectCustomerInquiry',id}));await d3Inquiries();await d3Dashboard();}

async function loadReminders(){
  setMessage('d3ReminderStatus','Reminder werden geladen ...','info');
  try{
    const [offers,inquiries]=await Promise.all([api(chefPayload({action:'getOfferReminders',includeDone:false})),api(chefPayload({action:'getInquiryReminders',includeDone:false}))]);
    DG3.offerReminders=offers;DG3.inquiryReminders=inquiries;
    const offerHtml=offers.map((r,i)=>'<div class="report-card'+(i%2?' d3-alt':'')+'"><div class="d3-head"><strong>'+esc(r.customer)+' - '+esc(r.offerNumber)+'</strong><span class="badge">Angebot</span></div><div class="status '+(r.isOverdue?'warn':'info')+'">Fällig: '+esc(formatDateDE(r.dueDate))+'</div><div>'+esc(r.description)+'</div><div>Telefon: <a href="tel:'+esc(r.phone)+'">'+esc(r.phone)+'</a></div><div class="report-actions">'+d3Button('Angenommen','d3ReminderDecision',[r.id,true],'success')+d3Button('Kein Auftrag','d3ReminderDecision',[r.id,false],'secondary')+d3Button('Verschieben','d3ReminderDate',[r.id])+'</div></div>').join('');
    const inquiryHtml=inquiries.map((r,i)=>'<div class="report-card'+((offers.length+i)%2?' d3-alt':'')+'"><div class="d3-head"><strong>'+esc(r.customer)+'</strong><span class="badge">Anfrage · '+esc(r.source)+'</span></div><div class="status '+(r.isOverdue?'warn':'info')+'">Erinnerung: '+esc(formatDateDE(r.dueDate))+'</div><div>'+esc(r.description)+'</div>'+(r.internalNote?'<div class="status info">Interne Notiz: '+esc(r.internalNote)+'</div>':'')+'<div class="report-actions">'+d3Button('Zurück zu offenen Anfragen','d3InquiryReminderReopen',[r.id])+d3Button('Termin wurde vereinbart','d3InquiryReminderArchive',[r.id],'success')+d3Button('Interne Notiz','d3InquiryReminderNote',[r.id])+d3Button('Ablehnen','d3InquiryReminderReject',[r.id],'danger')+'</div></div>').join('');
    $('d3ReminderList').innerHTML=offerHtml+inquiryHtml||'Keine offenen Reminder.';
    const due=offers.filter(x=>x.isDue).length+inquiries.filter(x=>x.isDue).length;setMessage('d3ReminderStatus',(offers.length+inquiries.length)+' offene Reminder, '+due+' fällig.','ok');d3Count('reminders',due);
  }catch(e){setMessage('d3ReminderStatus',e.message,'error');}
}
async function d3ReminderDecision(id,yes){const r=(DG3.offerReminders||[]).find(x=>x.id===id);if(!r)throw new Error('Bitte neu laden.');const asRunning=yes&&r.totalHours>0?confirm('Als laufenden Auftrag übernehmen? OK=laufend, Abbrechen=angenommen archivieren.'):false;if(!confirm(yes?'Angebot annehmen?':'Angebot ablehnen?'))return;await api(chefPayload({action:yes?'acceptOfferFromReminder':'declineOfferFromReminder',reminderId:id,asRunning}));await loadReminders();await d3Dashboard();}
function d3ReminderDate(id){const r=(DG3.offerReminders||[]).find(x=>x.id===id);if(!r)throw new Error('Bitte neu laden.');d3Form('Reminder verschieben',[{name:'dueDate',label:'Neues Datum',type:'date',required:true}],r,async v=>{await api(chefPayload({action:'rescheduleOfferReminder',reminderId:id,dueDate:v.dueDate,days:0}));await loadReminders();await d3Dashboard();});}
async function d3InquiryReminderReopen(id){await api(chefPayload({action:'reopenInquiryReminder',reminderId:id}));await loadReminders();await d3Dashboard();}
async function d3InquiryReminderArchive(id){if(!confirm('Termin wurde vereinbart und Anfrage archivieren?'))return;await api(chefPayload({action:'archiveInquiryReminder',reminderId:id}));await loadReminders();await d3Dashboard();}
async function d3InquiryReminderReject(id){if(!confirm('Anfrage ablehnen und zugehörige Gmail-Nachricht in den Papierkorb verschieben?'))return;await api(chefPayload({action:'rejectInquiryReminder',reminderId:id}));await loadReminders();await d3Dashboard();}
function d3InquiryReminderNote(id){const r=(DG3.inquiryReminders||[]).find(x=>x.id===id);if(!r)throw new Error('Bitte neu laden.');d3Form('Interne Notiz',[{name:'note',label:'Notiz',type:'textarea'}],{note:r.internalNote||''},async v=>{await api(chefPayload({action:'saveCustomerInquiryNote',id:r.inquiryId,note:v.note}));await loadReminders();});}

function d32IsAqonOrder(r){return /\baqon\b/i.test([r.source,r.description,r.internalNote].filter(Boolean).join(' '));}
async function d3Orders(){
  DG3.orders=await api(chefPayload({action:'getManualOrders',status:'Alle'}));
  const rows=DG3.orders.filter(x=>!d32IsAqonOrder(x)&&['Ohne Termin','Termin zu vereinbaren','Offen','Laufend'].includes(x.status));
  $('d3OrderPlan').innerHTML='<div class="d3-head"><strong>Auftragsplanung</strong>'+d3Button('+ Auftrag anlegen','d3NewOrder',[],'success')+'</div>'+rows.map((r,i)=>'<div class="report-card'+(i%2?' d3-alt':'')+'"><strong>'+esc(r.customer)+'</strong> <span class="badge">'+esc(r.status)+'</span><div>'+esc(r.address)+'</div><div>'+esc(r.description)+'</div>'+(r.internalNote?'<div class="status info">'+esc(r.internalNote)+'</div>':'')+'<div class="report-actions">'+d3Button('Termin vereinbaren','d3Appointment',['order',r.id,false])+d3Button('Interne Notiz','d3OrderNote',[r.id])+d3Button(r.status==='Laufend'?'Abschließen':'Arbeit begonnen','d3OrderStatus',[r.id,r.status==='Laufend'?'Abgeschlossen':'Laufend'],'success')+(r.status!=='Laufend'?d3Button('Entfernen','d3OrderDelete',[r.id],'danger'):'')+'</div></div>').join('');
}

function d32Thumb(id,size='w240'){return 'https://drive.google.com/thumbnail?id='+encodeURIComponent(id)+'&sz='+size;}
function d32EnsureGallery(){
  if($('d32Gallery'))return;
  const m=d3Element('div','d32-gallery hidden','<div class="d32-gallery-box"><button type="button" class="d32-gallery-close" aria-label="Schließen">×</button><button type="button" class="d32-gallery-arrow d32-prev" aria-label="Vorheriges Bild">‹</button><img class="d32-gallery-image" alt="Bildvorschau"><button type="button" class="d32-gallery-arrow d32-next" aria-label="Nächstes Bild">›</button><div class="d32-gallery-foot"><strong class="d32-gallery-count"></strong><a class="d32-gallery-original" target="_blank" rel="noopener">Original öffnen</a></div></div>');
  m.id='d32Gallery';document.body.append(m);m.querySelector('.d32-gallery-close').onclick=d32GalleryClose;m.querySelector('.d32-prev').onclick=()=>d32GalleryMove(-1);m.querySelector('.d32-next').onclick=()=>d32GalleryMove(1);m.addEventListener('click',e=>{if(e.target===m)d32GalleryClose();});document.addEventListener('keydown',e=>{if(m.classList.contains('hidden'))return;if(e.key==='Escape')d32GalleryClose();if(e.key==='ArrowLeft')d32GalleryMove(-1);if(e.key==='ArrowRight')d32GalleryMove(1);});
}
function d32GalleryShow(){const m=$('d32Gallery'),g=DG3.gallery;if(!m||!g?.items?.length)return;g.index=(g.index+g.items.length)%g.items.length;const x=g.items[g.index];m.querySelector('.d32-gallery-image').src=d32Thumb(x.id,'w1600');m.querySelector('.d32-gallery-count').textContent='Bild '+(g.index+1)+' von '+g.items.length;const a=m.querySelector('.d32-gallery-original');a.href=x.url||d32Thumb(x.id,'w1600');a.classList.toggle('hidden',!a.href);}
function d32GalleryOpen(items,index){d32EnsureGallery();DG3.gallery={items,index};$('d32Gallery').classList.remove('hidden');d32GalleryShow();}
function d32GalleryMove(delta){if(!DG3.gallery)return;DG3.gallery.index+=delta;d32GalleryShow();}
function d32GalleryClose(){$('d32Gallery')?.classList.add('hidden');DG3.gallery=null;}
d3ReportCard=function(g,view,index){
  const c=d32BaseReportCard(g,view,index),box=c.querySelector('.d3-export');if(!box)return c;
  const labels=[...box.querySelectorAll('label.d3-selection')].filter(l=>l.querySelector('.d3-photo'));
  if(!labels.length)return c;
  const items=labels.map(l=>{const cb=l.querySelector('.d3-photo'),a=l.querySelector('a');return{id:cb.value,url:a?.href||''};});
  const grid=d3Element('div','d32-photo-grid');labels.forEach((old,i)=>{const cb=old.querySelector('.d3-photo');const item=d3Element('div','d32-photo-item');const check=document.createElement('label');check.className='d32-photo-check';check.append(cb,document.createTextNode(' Bild '+(i+1)));const b=document.createElement('button');b.type='button';b.className='d32-thumb';b.title='Bild '+(i+1)+' vergrößern';const img=document.createElement('img');img.src=d32Thumb(items[i].id);img.alt='Vorschau Bild '+(i+1);img.loading='lazy';b.append(img);b.addEventListener('click',e=>{e.preventDefault();e.stopPropagation();d32GalleryOpen(items,i);});item.append(b,check);grid.append(item);old.remove();});
  const download=[...box.querySelectorAll('button')].find(b=>b.textContent.includes('Bericht herunterladen'));if(download)box.insertBefore(grid,download);else box.append(grid);return c;
};


/* DG 3.3: Trustlocal, safe email links, billed archive folders, extra regie attachments. */
const d33BaseInstallOffice=d3InstallOffice;
const d33BaseReportCard=d3ReportCard;
const d33BaseReports=d3Reports;

function d33ExternalInquiryLinks(r){
  let h='';
  if(r.externalUrl)h+='<a class="btn primary" target="_blank" rel="noopener noreferrer" href="'+esc(r.externalUrl)+'">'+(r.source==='Trustlocal'?'Anfrage bei Trustlocal öffnen':'Anfrage extern öffnen')+'</a>';
  if(r.phoneUrl)h+='<a class="btn secondary" target="_blank" rel="noopener noreferrer" href="'+esc(r.phoneUrl)+'">Kontaktdaten öffnen</a>';
  return h;
}
function d33ContactLinks(r){
  const p=r.phone?'<a target="_blank" rel="noopener noreferrer" href="tel:'+esc(r.phone)+'">'+esc(r.phone)+'</a>':'';
  const m=r.email?'<a target="_blank" rel="noopener noreferrer" href="mailto:'+esc(r.email)+'">'+esc(r.email)+'</a>':'';
  return [p,m].filter(Boolean).join(' ');
}
function d32InquiryCard(r,i,archive=false){
  const note=r.internalNote?'<div class="status info">Interne Notiz: '+esc(r.internalNote)+'</div>':'';
  const external=d33ExternalInquiryLinks(r);
  const actions=archive?'':d3Button('Termin wurde vereinbart','d3InquiryArchive',[r.id],'success')+d3Button('Reminder','d3InquiryReminder',[r.id],'primary')+d3Button('Interne Notiz','d3InquiryNote',[r.id])+d3Button('Ablehnen','d3RejectInquiry',[r.id],'danger');
  return '<div class="report-card'+(i%2?' d3-alt':'')+'"><div class="d3-head"><strong>'+esc(r.customer)+'</strong><span class="badge">'+esc(r.source)+'</span></div><div class="report-meta">'+esc(r.receivedAt)+' - '+esc(r.status)+'</div><div>'+esc(d3Address(r))+'</div>'+(d33ContactLinks(r)?'<div>'+d33ContactLinks(r)+'</div>':'')+'<div>'+esc(r.description||r.subject)+'</div>'+note+(archive&&r.doneReason?'<div class="muted small">Archiviert: '+esc(r.doneReason)+'</div>':'')+((external||actions)?'<div class="report-actions">'+external+actions+'</div>':'')+'</div>';
}

async function loadReminders(){
  setMessage('d3ReminderStatus','Reminder werden geladen ...','info');
  try{
    const [offers,inquiries]=await Promise.all([api(chefPayload({action:'getOfferReminders',includeDone:false})),api(chefPayload({action:'getInquiryReminders',includeDone:false}))]);
    DG3.offerReminders=offers;DG3.inquiryReminders=inquiries;
    const offerHtml=offers.map((r,i)=>'<div class="report-card'+(i%2?' d3-alt':'')+'"><div class="d3-head"><strong>'+esc(r.customer)+' - '+esc(r.offerNumber)+'</strong><span class="badge">Angebot</span></div><div class="status '+(r.isOverdue?'warn':'info')+'">Fällig: '+esc(formatDateDE(r.dueDate))+'</div><div>'+esc(r.description)+'</div><div>Telefon: <a target="_blank" rel="noopener noreferrer" href="tel:'+esc(r.phone)+'">'+esc(r.phone)+'</a></div><div class="report-actions">'+d3Button('Angenommen','d3ReminderDecision',[r.id,true],'success')+d3Button('Kein Auftrag','d3ReminderDecision',[r.id,false],'secondary')+d3Button('Verschieben','d3ReminderDate',[r.id])+'</div></div>').join('');
    const inquiryHtml=inquiries.map((r,i)=>'<div class="report-card'+((offers.length+i)%2?' d3-alt':'')+'"><div class="d3-head"><strong>'+esc(r.customer)+'</strong><span class="badge">Anfrage · '+esc(r.source)+'</span></div><div class="status '+(r.isOverdue?'warn':'info')+'">Erinnerung: '+esc(formatDateDE(r.dueDate))+'</div><div>'+esc(r.description)+'</div>'+(r.internalNote?'<div class="status info">Interne Notiz: '+esc(r.internalNote)+'</div>':'')+'<div class="report-actions">'+d33ExternalInquiryLinks(r)+d3Button('Zurück zu offenen Anfragen','d3InquiryReminderReopen',[r.id])+d3Button('Termin wurde vereinbart','d3InquiryReminderArchive',[r.id],'success')+d3Button('Interne Notiz','d3InquiryReminderNote',[r.id])+d3Button('Ablehnen','d3InquiryReminderReject',[r.id],'danger')+'</div></div>').join('');
    $('d3ReminderList').innerHTML=offerHtml+inquiryHtml||'Keine offenen Reminder.';
    const due=offers.filter(x=>x.isDue).length+inquiries.filter(x=>x.isDue).length;setMessage('d3ReminderStatus',(offers.length+inquiries.length)+' offene Reminder, '+due+' fällig.','ok');d3Count('reminders',due);
  }catch(e){setMessage('d3ReminderStatus',e.message,'error');}
}

function d33BilledParts(g){
  const s=String(g.billedAt||'');let m=s.match(/(\d{2})\.(\d{2})\.(\d{4})/);if(m)return{year:+m[3],month:+m[2]};
  m=String(g.lastDate||'').match(/^(\d{4})-(\d{2})-/);return m?{year:+m[1],month:+m[2]}:{year:0,month:0};
}
function d33RenderBilledMonth(year,month){
  const root=$('regieResult'),all=DG3.billedAll||[];if(!root)return;
  const groups=all.filter(g=>{const p=d33BilledParts(g);return p.year===year&&p.month===month;});DG3.reports.Abgerechnet=groups;
  const list=$('d33BilledList');if(!list)return;list.replaceChildren();groups.forEach((g,i)=>list.append(d3ReportCard(g,'Abgerechnet',i)));if(!groups.length)list.innerHTML='<div class="status ok">Keine abgerechneten Aufträge in diesem Monat.</div>';
  document.querySelectorAll('.d33-month').forEach(b=>b.classList.toggle('active',+b.dataset.year===year&&+b.dataset.month===month));
  setMessage('regieStatus',groups.length+' abgerechnete Kundenkarte(n) in '+String(month).padStart(2,'0')+' - '+year+' geladen.','ok');
}
async function d33LoadBilledArchive(){
  const root=$('regieResult');if(!root)return;DG3.active='Abgerechnet';window.__regieStatus='Abgerechnet';$('regieDateFilter')?.classList.add('hidden');setMessage('regieStatus','Abgerechnete Aufträge werden geladen ...','info');
  try{
    const all=await api(chefPayload({action:'getRegieReports',status:'Abgerechnet',year:0,month:0}));DG3.billedAll=all;root.replaceChildren();
    const map={};all.forEach(g=>{const p=d33BilledParts(g);if(!p.year)return;map[p.year]=map[p.year]||{};map[p.year][p.month]=(map[p.year][p.month]||0)+1;});
    const years=Object.keys(map).map(Number).sort((a,b)=>b-a);const nav=d3Element('div','d33-billed-nav');
    years.forEach((y,yi)=>{const total=Object.values(map[y]).reduce((a,b)=>a+b,0),det=document.createElement('details');det.className='d33-year';det.open=yi===0;const sum=document.createElement('summary');sum.textContent=y+' · '+total+' Auftrag'+(total===1?'':'e');det.append(sum);const months=d3Element('div','d33-months');Object.keys(map[y]).map(Number).sort((a,b)=>b-a).forEach(m=>{const b=document.createElement('button');b.type='button';b.className='d33-month';b.dataset.year=y;b.dataset.month=m;b.textContent=String(m).padStart(2,'0')+' - '+y+' · '+map[y][m]+' Auftrag'+(map[y][m]===1?'':'e');b.onclick=()=>d33RenderBilledMonth(y,m);months.append(b);});det.append(months);nav.append(det);});
    root.append(nav,d3Element('div','d33-billed-list'));root.lastElementChild.id='d33BilledList';
    if(years.length){const y=years[0],m=Math.max(...Object.keys(map[y]).map(Number));d33RenderBilledMonth(y,m);}else{root.innerHTML='<div class="status ok">Noch keine abgerechneten Aufträge.</div>';setMessage('regieStatus','Keine abgerechneten Aufträge.','ok');}
  }catch(e){setMessage('regieStatus','Laden fehlgeschlagen: '+e.message,'error');}
}
d3Reports=async function(view='Abgeschlossen'){if(view==='Abgerechnet')return d33LoadBilledArchive();return d33BaseReports(view);};

function d33ReadFile(file){return new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve({name:file.name,type:file.type||'application/octet-stream',dataUrl:r.result});r.onerror=()=>reject(new Error('Datei konnte nicht gelesen werden.'));r.readAsDataURL(file);});}
function d33AttachmentBox(card,g,view,index){
  if(view==='Abgerechnet')return;const ids=(g.objectIds||[g.objectId]).filter(Boolean);if(!ids.length)return;
  const box=d3Element('div','d33-attachments','<div class="d3-head"><strong>Zusätzliche Bilder / Dateien</strong><button type="button" class="btn primary d33-upload">Datei / Bild hinzufügen</button></div><div class="muted small">PDF, JPG, PNG oder WEBP · maximal 5 MB je Datei. Zusatzdateien werden automatisch in den Bericht-ZIP übernommen.</div><input class="d33-file-input hidden" type="file" accept="application/pdf,image/jpeg,image/png,image/webp" multiple><div class="d33-attachment-list muted small">Zusatzdateien werden geladen ...</div><div class="d33-attachment-status"></div>');
  const exportBox=card.querySelector('.d3-export');if(exportBox)exportBox.insertAdjacentElement('afterend',box);else card.append(box);
  const input=box.querySelector('.d33-file-input');box.querySelector('.d33-upload').onclick=()=>input.click();input.onchange=async()=>{const files=[...input.files];input.value='';if(!files.length)return;if(files.length>5)return alert('Bitte höchstens 5 Dateien auf einmal auswählen.');if(files.some(f=>f.size>5*1024*1024))return alert('Eine Datei ist größer als 5 MB.');const btn=box.querySelector('.d33-upload');btn.disabled=true;try{const payload=[];for(const f of files)payload.push(await d33ReadFile(f));await api(chefPayload({action:'addRegieAttachments',objectIds:ids,customer:g.customer,files:payload}));await d33LoadAttachments(box,ids);}catch(e){box.querySelector('.d33-attachment-status').innerHTML='<div class="status error">'+esc(e.message)+'</div>';}finally{btn.disabled=false;}};
  d33LoadAttachments(box,ids);
}
async function d33LoadAttachments(box,ids){
  const list=box.querySelector('.d33-attachment-list');try{const rows=await api(chefPayload({action:'getRegieAttachments',objectIds:ids}));if(!rows.length){list.textContent='Noch keine Zusatzdateien.';return;}const imageRows=rows.filter(r=>/^image\//.test(r.mime));list.innerHTML='';rows.forEach(r=>{const row=d3Element('div','d33-attachment-row');if(/^image\//.test(r.mime)){const b=document.createElement('button');b.type='button';b.className='d32-thumb d33-small-thumb';const img=document.createElement('img');img.src=d32Thumb(r.fileId);img.alt=esc(r.name);b.append(img);b.onclick=()=>{const items=imageRows.map(x=>({id:x.fileId,url:x.url}));d32GalleryOpen(items,Math.max(0,imageRows.findIndex(x=>x.id===r.id)));};row.append(b);}const a=document.createElement('a');a.href=r.url;a.target='_blank';a.rel='noopener noreferrer';a.textContent=r.name;row.append(a,d3Element('span','muted small',' · '+esc(r.uploadedAt)+' · '+esc(r.uploadedBy)));list.append(row);});}catch(e){list.innerHTML='<div class="status error">'+esc(e.message)+'</div>';}
}
d3ReportCard=function(g,view,index){const c=d33BaseReportCard(g,view,index);d33AttachmentBox(c,g,view,index);return c;};

function d33InstallBilledUi(){
  const filter=$('regieDateFilter');if(filter)filter.classList.add('d33-legacy-billed-filter');
}
d3InstallOffice=function(){d33BaseInstallOffice();d33InstallBilledUi();};


/* DG 3.4: AQON PURE as separate inquiry queue with Gmail acknowledgement/links. */
const d34BaseInstallOffice=d3InstallOffice;

function d34SetAqonCount(n){
  const b=document.querySelector('#d3InquiriesGroup [data-panel="d34AqonInquiries"]');
  if(b)b.textContent='AQON PURE ANFRAGEN ('+Number(n||0)+')';
}
function d34InstallAqonPanel(){
  const group=$('d3InquiriesGroup');if(!group||$('d34AqonInquiries'))return;
  const menu=group.querySelector('.d3-menu'),host=group.querySelector('.d3-content');if(!menu||!host)return;
  const panel=d3Section('d34AqonInquiries','AQON PURE ANFRAGEN','<h3>AQON PURE ANFRAGEN</h3><div id="d34AqonStatus"></div><div id="d34AqonList"></div>');
  panel.classList.add('d3-panel','hidden');panel.querySelector(':scope > .dg48-head')?.remove();d3Body(panel)?.classList.remove('hidden');
  const b=d3Element('button','d34-aqon-menu','AQON PURE ANFRAGEN (0)');b.type='button';b.dataset.panel=panel.id;
  b.addEventListener('click',()=>{const y=menu.getBoundingClientRect().top;host.style.minHeight=Math.max(0,innerHeight-host.getBoundingClientRect().top)+'px';d3Open(group.id,panel.id);const delta=menu.getBoundingClientRect().top-y;if(Math.abs(delta)>1)window.scrollBy({top:delta,behavior:'instant'});});
  const archiveBtn=menu.querySelector('[data-panel="d3InquiryArchive"]'),archivePanel=$('d3InquiryArchive');
  menu.insertBefore(b,archiveBtn||null);host.insertBefore(panel,archivePanel||null);DG3.loaders.d34AqonInquiries=d34AqonInquiries;
}
d3InstallOffice=function(){d34BaseInstallOffice();d34InstallAqonPanel();};

function d34AqonLinks(r){
  let h='';
  if(r.dropboxUrl)h+='<a class="btn primary" target="_blank" rel="noopener noreferrer" href="'+esc(r.dropboxUrl)+'">Dropbox-Fotos öffnen</a>';
  if(r.aqonAppointmentUrl)h+='<a class="btn success" target="_blank" rel="noopener noreferrer" href="'+esc(r.aqonAppointmentUrl)+'">Termin bei AQON melden</a>';
  return h;
}
function d32InquiryCard(r,i,archive=false){
  const note=r.internalNote?'<div class="status info">Interne Notiz: '+esc(r.internalNote)+'</div>':'';
  const isAqon=r.source==='AQON PURE';
  const external=isAqon?d34AqonLinks(r):d33ExternalInquiryLinks(r);
  const details=isAqon&&r.aqonDetails?'<div class="d34-aqon-details"><strong>Auftragsinformationen aus der AQON-Mail</strong><pre>'+esc(r.aqonDetails)+'</pre></div>':'';
  const actions=archive?'':d3Button('Termin wurde vereinbart','d3InquiryArchive',[r.id],'success')+d3Button('Reminder','d3InquiryReminder',[r.id],'primary')+d3Button('Interne Notiz','d3InquiryNote',[r.id])+d3Button('Ablehnen','d3RejectInquiry',[r.id],'danger');
  return '<div class="report-card'+(i%2?' d3-alt':'')+'"><div class="d3-head"><strong>'+esc(r.customer)+'</strong><span class="badge">'+esc(r.source)+'</span></div><div class="report-meta">'+esc(r.receivedAt)+' - '+esc(r.status)+'</div><div>'+esc(d3Address(r))+'</div>'+(d33ContactLinks(r)?'<div>'+d33ContactLinks(r)+'</div>':'')+(isAqon?'':'<div>'+esc(r.description||r.subject)+'</div>')+details+note+(archive&&r.doneReason?'<div class="muted small">Archiviert: '+esc(r.doneReason)+'</div>':'')+((external||actions)?'<div class="report-actions">'+external+actions+'</div>':'')+'</div>';
}
async function d3Inquiries(){
  setMessage('d3InquiryStatus','Anfragen werden geladen ...','info');
  try{
    const all=await api(chefPayload({action:'getCustomerInquiries',status:'Offen'}));DG3.inquiries=all;
    const regular=all.filter(r=>r.source!=='AQON PURE'),aqon=all.filter(r=>r.source==='AQON PURE');
    $('d3InquiryList').innerHTML=regular.map((r,i)=>d32InquiryCard(r,i,false)).join('')||'Keine offenen allgemeinen Anfragen.';
    setMessage('d3InquiryStatus',regular.length+' offene allgemeine Anfrage(n).','ok');d34SetAqonCount(aqon.length);d3Count('inquiries',all.length);
  }catch(e){setMessage('d3InquiryStatus',e.message,'error');}
}
async function d34AqonInquiries(){setMessage('d34AqonStatus','AQON PURE Posteingang wird abgeglichen ...','info');try{const sync=await api(chefPayload({action:'syncCustomerInquiries'}));if(sync.aqonReplyErrors||sync.gmailFileErrors)setMessage('d34AqonStatus','AQON-Abgleich abgeschlossen, aber mit '+Number(sync.aqonReplyErrors||0)+' Antwort- und '+Number(sync.gmailFileErrors||0)+' Gmail-Ablagefehler(n).','warn');const all=await api(chefPayload({action:'getCustomerInquiries',status:'Offen'}));DG3.inquiries=all;const rows=all.filter(r=>r.source==='AQON PURE');$('d34AqonList').innerHTML=rows.map((r,i)=>d32InquiryCard(r,i,false)).join('')||'Keine offenen AQON PURE Anfragen.';setMessage('d34AqonStatus',rows.length+' offene AQON PURE Anfrage(n).','ok');d34SetAqonCount(rows.length);d3Count('inquiries',all.length);}catch(e){setMessage('d34AqonStatus','AQON-Abgleich fehlgeschlagen: '+e.message,'error');}}

const d34BaseImport=d3Import;
d3Import=async function(){
  setMessage('d3InquiryStatus','Gmail wird abgeglichen ...','info');
  try{
    const r=await api(chefPayload({action:'syncCustomerInquiries'}));
    const extra=(r.aqonReplied||r.aqonReplyErrors)?' · AQON bestätigt: '+Number(r.aqonReplied||0)+(r.aqonReplyErrors?' · Antwortfehler: '+r.aqonReplyErrors:''):'';
    setMessage('d3InquiryStatus','Gmail-Abgleich abgeschlossen: '+Number(r.imported||0)+' neu, '+Number(r.updated||0)+' aktualisiert'+extra+'.','ok');
    await d3Inquiries();await d3Dashboard();
    if(DG3.open==='d34AqonInquiries')await d34AqonInquiries();
  }catch(e){setMessage('d3InquiryStatus','Gmail-Abgleich fehlgeschlagen: '+e.message,'error');}
};


function d35MandatoryDayClosure(day){if(!day||day.closed)return false;const raw=String(day.date||'').trim();if(raw){const dt=new Date(raw+'T12:00:00');if(!Number.isNaN(dt.getTime())){const w=dt.getDay();if(w===0||w===6)return false;}}const status=[day.status,day.dayStatus,day.absenceStatus,day.type,day.reason,day.note].filter(Boolean).join(' ').toLowerCase();if(status.includes('feiertag')||status.includes('holiday'))return false;return true;}
function d35InstallInspectionButton(){const save=[...document.querySelectorAll('#employeeView button')].find(b=>b.textContent.trim()==='Eintrag speichern');if(!save)return;let b=$('d35InspectionBtn');if(!canAccessBoss()){b?.remove();return;}if(!b){b=document.createElement('button');b.type='button';b.id='d35InspectionBtn';b.className='btn success d35-inspection';b.textContent='Besichtigungstermin';b.addEventListener('click',d35InspectionVisit);}if(b.previousElementSibling!==save)save.insertAdjacentElement('afterend',b);}
function d35SelectedCalendarEvent(){const rows=window.__dgCalendarEvents||[];return rows.find(e=>String(e.id||'')===String(selectedCalendarEventId||''))||null;}
function d35InspectionVisit(){if(!canAccessBoss()){setMessage('entryStatus','Besichtigungstermine können nur mit Chefzugang übertragen werden.','error');return;}const customer=String($('customer')?.value||'').trim();if(!customer){setMessage('entryStatus','Bitte mindestens Kunde / Baustelle auswählen oder eintragen.','error');return;}const options=[0.5,1,1.5,2,2.5,3].map(v=>({value:String(v),label:String(v).replace('.',',')+' Std.'}));d3Form('Besichtigungstermin',[{name:'hours',label:'Zeitaufwand',type:'select',options}],{hours:'1'},async v=>{const event=d35SelectedCalendarEvent(),payload={action:'createInspectionOffer',employee:auth().employee,employeePin:auth().pin,item:{customer,date:$('date')?.value||localDate(),hours:Number(v.hours),vehicleUsed:true,sourceCalendarEventId:selectedCalendarEventId||'',event:event?{title:event.title||'',location:event.location||'',description:event.description||'',startDate:event.startDate||'',startTime:event.startTime||'',endDate:event.endDate||'',endTime:event.endTime||'',phone:event.phone||'',email:event.email||''}:null}};const r=await api(payload);resetEntry();await loadCalendarEvents();setMessage('entryStatus','✓ Besichtigung als offenes Angebot übertragen. Zeitaufwand '+formatHours(v.hours)+' Std. · Fahrzeugeinsatz Ja.','ok');return r;});}

function d3Startup(){try{const pin=localStorage.getItem('dg_employee_pin');if(pin&&!sessionStorage.getItem('dg_employee_pin'))sessionStorage.setItem('dg_employee_pin',pin);localStorage.removeItem('dg_employee_pin');d3InstallOffice();d3TransferInstall();document.querySelectorAll('[onclick]').forEach(e=>{const s=e.getAttribute('onclick');if(s&&!s.startsWith('return ')&&/^[\w.$]+\([\s\S]*\)$/.test(s.trim()))e.setAttribute('onclick','return '+s);});init();DG3.ready=true;setInterval(d3Sync,60000);document.addEventListener('visibilitychange',()=>{if(!document.hidden)d3Sync();});if('serviceWorker'in navigator)navigator.serviceWorker.register('./sw.js',{updateViaCache:'none'}).then(r=>r.update()).catch(e=>d3Notice('Offline-Funktion noch nicht bereit: '+e.message,'warn'));}catch(e){console.error(e);const msg=d3Element('div','status error');msg.textContent='App 5.0 konnte nicht starten: '+e.message;document.body.prepend(msg);}}
/* DG 3.6: Wartungsvertraege, Wartungskalender und Pflichtfeld naechste Wartung. */
(function(){
'use strict';
let employeeMaintenance=false;
const plannerMap={};

function isMaintenanceEvent(e){return !!(e&&(e.maintenance||e.type==='Wartung'||/(?:^|\n)Terminart:\s*Wartung(?:\n|$)/i.test(String(e.description||''))||/^🔧 WARTUNG ·/i.test(String(e.title||''))));}
function formatMaintenanceDue(v){if(!/^\d{4}-\d{2}$/.test(String(v||'')))return '';const p=String(v).split('-');return p[1]+'/'+p[0];}

function ensureEmployeeMaintenanceField(){
  if($('d36MaintenanceDue'))return;
  const activity=$('activity');if(!activity)return;
  const box=document.createElement('div');box.id='d36MaintenanceDue';box.className='d36-maintenance-due hidden';
  box.innerHTML='<div class="d36-maintenance-head">🔧 Wartungsauftrag</div><label for="d36NextMaintenance">Nächste Wartung fällig <span class="d36-required">Pflichtfeld</span></label><input id="d36NextMaintenance" type="month"><div class="muted small">Bitte Monat und Jahr der nächsten Wartung angeben.</div>';
  activity.insertAdjacentElement('afterend',box);
}
function setEmployeeMaintenance(on){employeeMaintenance=!!on;ensureEmployeeMaintenanceField();const box=$('d36MaintenanceDue');if(box)box.classList.toggle('hidden',!employeeMaintenance);if(!employeeMaintenance&&$('d36NextMaintenance'))$('d36NextMaintenance').value='';const card=$('workEntryCard');if(card)card.classList.toggle('d36-maintenance-active',employeeMaintenance);}

const baseTake=window.takeCalendarEvent;
if(typeof baseTake==='function')window.takeCalendarEvent=function(index){const ev=(window.__dgCalendarEvents||[])[index];const r=baseTake.apply(this,arguments);setEmployeeMaintenance(isMaintenanceEvent(ev));if(employeeMaintenance)setMessage('entryStatus','🔧 Wartungsauftrag übernommen. Vor dem Speichern ist „Nächste Wartung fällig“ Pflicht.','info');return r;};
const baseReset=window.resetEntry;
if(typeof baseReset==='function')window.resetEntry=function(){const r=baseReset.apply(this,arguments);setEmployeeMaintenance(false);return r;};
const baseEmployeeRender=window.renderCalendarEvents;
if(typeof baseEmployeeRender==='function')window.renderCalendarEvents=function(events){const r=baseEmployeeRender.apply(this,arguments);[...document.querySelectorAll('#calendarEvents button[data-index]')].forEach(b=>{const ev=(events||[])[Number(b.dataset.index)];if(!isMaintenanceEvent(ev))return;const entry=b.closest('.entry');if(entry&&!entry.querySelector('.d36-maintenance-badge'))entry.querySelector('strong')?.insertAdjacentHTML('afterend',' <span class="d36-maintenance-badge">🔧 WARTUNG</span>');if((b.textContent||'').trim()==='Auftrag übernehmen')b.textContent='Wartung übernehmen';});return r;};

const baseSaveEntry=window.saveEntry;
if(typeof baseSaveEntry==='function')window.saveEntry=async function(){if(employeeMaintenance&&!String($('d36NextMaintenance')?.value||'')){setMessage('entryStatus','Bei einer Wartung muss „Nächste Wartung fällig“ mit Monat und Jahr angegeben werden.','error');$('d36NextMaintenance')?.focus();return;}return baseSaveEntry.apply(this,arguments);};

const baseQueuePut=window.queuePut;
if(typeof baseQueuePut==='function')window.queuePut=async function(item){if(item&&item.payload&&item.payload.action==='saveEntry'&&employeeMaintenance){item.payload.entry=item.payload.entry||{};item.payload.entry.maintenance=true;item.payload.entry.nextMaintenanceDue=String($('d36NextMaintenance')?.value||'');}return baseQueuePut.apply(this,arguments);};

const baseApi=window.api;
if(typeof baseApi==='function')window.api=api=async function(payload){
  if(payload&&payload.action==='saveEntry'&&employeeMaintenance){payload.entry=payload.entry||{};payload.entry.maintenance=true;payload.entry.nextMaintenanceDue=String($('d36NextMaintenance')?.value||'');}
  if(payload&&payload.action==='savePlannerEvent'&&payload.item){const modal=$('dg62Modal'),sel=$('d36PlannerType');if(modal&&sel&&!modal.classList.contains('hidden'))payload.item.type=sel.value==='Wartung'?'Wartung':'Auftrag';}
  const result=await baseApi.apply(this,arguments);
  if(payload&&payload.action==='getPlannerEvents'&&Array.isArray(result)){Object.keys(plannerMap).forEach(k=>delete plannerMap[k]);result.forEach(x=>plannerMap[String(x.id)]=x);}
  return result;
};

function ensurePlannerType(){
  if($('d36PlannerType'))return;
  const task=$('dg62Task');if(!task)return;
  const wrap=document.createElement('div');wrap.id='d36PlannerTypeWrap';wrap.innerHTML='<label for="d36PlannerType">Terminart</label><select id="d36PlannerType"><option value="Auftrag">Auftrag</option><option value="Wartung">🔧 Wartung</option></select><div class="muted small">Bei Wartung wird der Termin beim Mitarbeiter eindeutig gekennzeichnet.</div>';
  task.insertAdjacentElement('afterend',wrap);
}
const baseNew=window.dg62New;
if(typeof baseNew==='function')window.dg62New=function(){const r=baseNew.apply(this,arguments);ensurePlannerType();$('d36PlannerType').disabled=false;$('d36PlannerType').value='Auftrag';return r;};
const baseEdit=window.dg62Edit;
if(typeof baseEdit==='function')window.dg62Edit=function(id){const r=baseEdit.apply(this,arguments);ensurePlannerType();const ev=plannerMap[String(id)]||{};$('d36PlannerType').value=ev.type==='Wartung'?'Wartung':'Auftrag';$('d36PlannerType').disabled=!!ev.external;return r;};
const baseCopy=window.dg62CopyCurrent;
if(typeof baseCopy==='function')window.dg62CopyCurrent=function(){ensurePlannerType();const type=$('d36PlannerType').value;const r=baseCopy.apply(this,arguments);ensurePlannerType();$('d36PlannerType').disabled=false;$('d36PlannerType').value=type;return r;};
const basePlannerLoad=window.dg62Load;
if(typeof basePlannerLoad==='function')window.dg62Load=async function(){const r=await basePlannerLoad.apply(this,arguments);[...document.querySelectorAll('.dg62-event[data-event-id]')].forEach(el=>{const ev=plannerMap[String(el.dataset.eventId)];const maintenance=ev&&ev.type==='Wartung';el.classList.toggle('d36-maintenance-event',!!maintenance);if(maintenance&&!el.querySelector('.d36-planner-badge'))el.insertAdjacentHTML('beforeend','<span class="d36-planner-badge">🔧 WARTUNG</span>');});return r;};

window.d36LoadMaintenance=async function(){
  const st=$('d36MaintenanceStatus'),list=$('d36MaintenanceList');if(!list)return;
  setMessage('d36MaintenanceStatus','Wartungsverträge werden geladen ...','info');
  try{const rows=await api(chefPayload({action:'getMaintenanceContracts'}));DG3.maintenance=rows||[];list.innerHTML=(rows||[]).map((x,i)=>'<div class="report-card'+(i%2?' d3-alt':'')+'"><div class="d3-head"><strong>🔧 '+esc(x.customer)+'</strong><span class="badge">'+esc(x.status||'Wartung')+'</span></div>'+(x.address?'<div>'+esc(x.address)+'</div>':'')+(x.task?'<div class="report-meta">'+esc(x.task)+'</div>':'')+(x.plannedDate?'<div class="status info">Geplanter Wartungstermin: '+esc(formatDateDE(x.plannedDate))+'</div>':'')+(x.nextMaintenanceDue?'<div class="status ok">Nächste Wartung fällig: '+esc(formatMaintenanceDue(x.nextMaintenanceDue))+'</div>':'')+((x.employees||[]).length?'<div class="report-meta"><strong>Mitarbeiter:</strong> '+esc(x.employees.join(', '))+'</div>':'')+'</div>').join('')||'<div class="status ok">Noch keine Wartungsverträge bzw. Wartungsaufträge vorhanden.</div>';setMessage('d36MaintenanceStatus',(rows||[]).length+' Wartung(en) / Wartungsvertrag(-verträge).','ok');d3Count('maintenance',(rows||[]).length);}catch(e){setMessage('d36MaintenanceStatus',e.message,'error');d3Count('maintenance','!');}
};

const baseInstallOffice=d3InstallOffice;
d3InstallOffice=function(){
  baseInstallOffice.apply(this,arguments);
  const root=$('bossView');if(!root||$('d36Maintenance'))return;
  const c=d3Section('d36Maintenance','Wartungsverträge','<div class="muted small">Wartungsaufträge und die zuletzt gemeldete nächste Wartungsfälligkeit.</div><div id="d36MaintenanceStatus"></div><div id="d36MaintenanceList"></div>');
  const reminder=$('d3Reminder');root.insertBefore(c,reminder||null);c.classList.add('d3-main');d3Wire(c);d3Collapse(c,true);DG3.loaders.d36Maintenance=d36LoadMaintenance;
  [...root.querySelectorAll(':scope > .d3-main')].forEach((x,i)=>x.classList.toggle('d3-alt',i%2===1));
  const dash=root.querySelector('.d3-dashboard'),offers=dash?.querySelector('.d3-tile.offers');if(dash&&!dash.querySelector('.d3-tile.maintenance')){const b=document.createElement('button');b.type='button';b.className='d3-tile maintenance';b.dataset.d3Fn='d3Open';b.dataset.d3Args=JSON.stringify(['d36Maintenance','']);b.innerHTML='<span>Wartungen</span><strong id="d3Count-maintenance">…</strong>';if(offers)offers.insertAdjacentElement('afterend',b);else dash.append(b);}
};
const baseDashboard=d3Dashboard;
d3Dashboard=async function(){const r=await baseDashboard.apply(this,arguments);if(canAccessBoss()&&navigator.onLine){try{const rows=await api(chefPayload({action:'getMaintenanceContracts'}));d3Count('maintenance',(rows||[]).length);}catch(_e){d3Count('maintenance','!');}}return r;};

const baseStartup=d3Startup;
d3Startup=function(){const r=baseStartup.apply(this,arguments);setTimeout(()=>{ensureEmployeeMaintenanceField();ensurePlannerType();},0);return r;};
})();

/* DG 3.7: Wartungskunden, Objekte, Geräte, Wartungsarchiv und Kalender-Verfügbarkeitsprüfung. */
(function(){
'use strict';
const S=window.DG37=window.DG37||{workers:[],previewEvents:[],previewDate:'',customer:null,overview:null,plannerLink:null,plannerEditId:''};
const esc37=v=>String(v==null?'':v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const val=id=>String($(id)?.value||'').trim();
const monthLabel=k=>{if(!/^\d{4}-\d{2}$/.test(k||''))return k||'';const [y,m]=k.split('-').map(Number);return new Intl.DateTimeFormat('de-DE',{month:'long',year:'numeric'}).format(new Date(y,m-1,1));};
const fmtDevice=d=>[d.deviceType,d.otherDescription,d.manufacturer,d.model].filter(Boolean).join(' · ');
function d37Notice(msg,type='info'){if(typeof d3Notice==='function')d3Notice(msg,type);else alert(msg);}

/* ---------- Kalender: Mitarbeiterwahl + Tagesvorschau ---------- */
async function d37Workers(){
  if(S.workers.length)return S.workers;
  S.workers=(await api(chefPayload({action:'getPlannerWorkers'}))||[]).filter(x=>x.active);
  return S.workers;
}
function d37SelectedWorkerIds(){return [...document.querySelectorAll('#dg62Share .dg62cb:checked')].map(x=>x.value);}
function d37EnsurePlannerPreview(){
  const share=$('dg62Share');if(!share)return null;
  let p=$('d37PlannerPreview');if(!p){p=document.createElement('div');p.id='d37PlannerPreview';p.className='d37-planner-preview';share.insertAdjacentElement('afterend',p);}return p;
}
async function d37RepairPlannerAssignment(){
  const share=$('dg62Share');if(!share)return;
  let workers=[];try{workers=await d37Workers();}catch(e){workers=[];}
  if(!share.querySelector('.dg62cb')&&workers.length){
    const selected=new Set((S.pendingWorkerIds||[]).map(String));
    share.innerHTML=workers.map(w=>'<label><input type="checkbox" class="dg62cb" value="'+esc37(w.id)+'" '+(selected.has(String(w.id))?'checked':'')+'>'+esc37(w.displayName||w.employeeName)+'</label>').join('');
    const hint=$('dg62ShareHint');if(hint)hint.textContent='Mitarbeiter auswählen. Darunter wird der Kalender des gewählten Tages eingeblendet.';
  }
  [...share.querySelectorAll('.dg62cb')].forEach(cb=>{if(cb.dataset.d37)return;cb.dataset.d37='1';cb.addEventListener('change',d37PreviewPlannerDay);});
  ['dg62ED','dg62Start','dg62End'].forEach(id=>{const e=$(id);if(e&&!e.dataset.d37){e.dataset.d37='1';e.addEventListener('change',d37PreviewPlannerDay);}});
  d37EnsurePlannerPreview();await d37PreviewPlannerDay();
}
function d37Overlap(e,start,end){if(!start||!end)return false;return String(e.start||'')<end&&String(e.end||'')>start;}
async function d37PreviewPlannerDay(){
  const host=d37EnsurePlannerPreview();if(!host)return;
  const date=val('dg62ED'),ids=d37SelectedWorkerIds(),start=val('dg62Start'),end=val('dg62End');
  if(!date){host.innerHTML='<div class="muted small">Bitte zuerst einen Tag auswählen.</div>';return;}
  if(!ids.length){host.innerHTML='<div class="d37-preview-empty">Noch kein Mitarbeiter ausgewählt. Nach Auswahl erscheint hier dessen Kalender für '+esc37(formatDateDE(date))+'.</div>';return;}
  host.innerHTML='<div class="status info">Kalender '+esc37(formatDateDE(date))+' wird geladen …</div>';
  try{
    const [workers,events]=await Promise.all([d37Workers(),api(chefPayload({action:'getPlannerEvents',startDate:date,endDate:date}))]);
    S.previewEvents=(events||[]);S.previewDate=date;
    host.innerHTML='<div class="d37-preview-title">Kalender am '+esc37(formatDateDE(date))+'</div><div class="d37-preview-grid">'+ids.map(id=>{
      const w=workers.find(x=>String(x.id)===String(id))||{displayName:id};
      const ev=(events||[]).filter(x=>(x.employeeIds||[]).map(String).includes(String(id))&&String(x.id)!==String(S.plannerEditId||''));
      const conflicts=ev.filter(x=>d37Overlap(x,start,end));
      return '<div class="d37-preview-worker '+(conflicts.length?'conflict':'')+'"><strong>'+esc37(w.displayName||w.employeeName)+'</strong>'+(ev.length?ev.map(x=>'<div class="d37-preview-event '+(d37Overlap(x,start,end)?'conflict':'')+'"><b>'+esc37(x.start)+'–'+esc37(x.end)+'</b> '+esc37(x.customer||'Termin')+(x.type==='Wartung'?' <span>🔧</span>':'')+'<div class="small muted">'+esc37(x.task||'')+'</div></div>').join(''):'<div class="d37-free">Keine Termine – Zeitraum frei.</div>')+(conflicts.length?'<div class="d37-conflict-note">⚠ Überschneidung mit der gewählten Uhrzeit.</div>':'')+'</div>';
    }).join('')+'</div>';
  }catch(e){host.innerHTML='<div class="status error">Kalender konnte nicht geladen werden: '+esc37(e.message)+'</div>';}
}
function d37PlannerConflicts(){const ids=d37SelectedWorkerIds(),date=val('dg62ED'),start=val('dg62Start'),end=val('dg62End');if(date!==S.previewDate)return [];return (S.previewEvents||[]).filter(e=>String(e.id)!==String(S.plannerEditId||'')&&(e.employeeIds||[]).some(id=>ids.includes(String(id)))&&d37Overlap(e,start,end));}
const baseNew37=window.dg62New;
if(typeof baseNew37==='function')window.dg62New=function(){S.plannerEditId='';S.pendingWorkerIds=[];S.plannerLink=null;const r=baseNew37.apply(this,arguments);setTimeout(d37RepairPlannerAssignment,0);return r;};
const baseEdit37=window.dg62Edit;
if(typeof baseEdit37==='function')window.dg62Edit=function(id){S.plannerEditId=String(id||'');const r=baseEdit37.apply(this,arguments);setTimeout(d37RepairPlannerAssignment,0);return r;};
const baseSave37=window.dg62Save;
if(typeof baseSave37==='function')window.dg62Save=async function(){const conflicts=d37PlannerConflicts();if(conflicts.length&&!confirm('Achtung: Der gewählte Zeitraum überschneidet sich mit '+conflicts.length+' vorhandenem Termin(en) des ausgewählten Mitarbeiters. Trotzdem speichern?'))return;return baseSave37.apply(this,arguments);};
const baseApi37=window.api;
if(typeof baseApi37==='function')window.api=api=async function(payload){
  if(payload&&payload.action==='savePlannerEvent'&&payload.item&&payload.item.type==='Wartung'&&S.plannerLink){Object.assign(payload.item,{maintenanceCustomerId:S.plannerLink.customerId||'',maintenanceObjectId:S.plannerLink.objectId||'',maintenanceDeviceId:S.plannerLink.deviceId||''});}
  const r=await baseApi37.apply(this,arguments);
  if(payload&&payload.action==='savePlannerEvent')S.plannerLink=null;
  return r;
};

/* ---------- Wartungskunden: Formular ---------- */
function d37BlankCustomer(){return{id:'',name:'',billingStreet:'',billingZip:'',billingCity:'',email:'',phone:'',objects:[d37BlankObject()]};}
function d37BlankObject(){return{id:'',name:'',street:'',zip:'',city:'',notes:'',devices:[d37BlankDevice()]};}
function d37BlankDevice(){return{id:'',deviceType:'Gas Brennwert',otherDescription:'',manufacturer:'',model:'',serialNumber:'',year:'',tenantName:'',tenantPhone:'',tenantEmail:'',sparePartManufacturer:'',sparePartSerialNumber:'',internalNotes:'',nextMaintenanceDue:'',repairs:[]};}
function d37Field(label,key,value='',type='text',extra=''){return '<label>'+label+'</label><input data-d37="'+key+'" type="'+type+'" value="'+esc37(value)+'" '+extra+'>';}
function d37DeviceHtml(d,oi,di){
  const repairs=(d.repairs||[]).map(r=>'<div class="d37-repair"><b>'+esc37(formatDateDE(r.date||''))+'</b> · '+esc37(r.description||'')+(r.createdBy?'<div class="small muted">Erfasst von '+esc37(r.createdBy)+'</div>':'')+'</div>').join('');
  const history=(d.history||[]).map(r=>'<div class="d37-repair"><b>'+esc37(formatDateDE(r.date||''))+'</b> · '+esc37(r.description||'')+'<div class="small muted">'+esc37(r.employee||'')+' · '+Number(r.hours||0).toFixed(2).replace('.',',')+' Std.'+(r.nextMaintenanceDue?' · nächste Wartung '+esc37(monthLabel(r.nextMaintenanceDue)):'')+'</div></div>').join('');
  return '<div class="d37-device" data-device-index="'+di+'" data-device-id="'+esc37(d.id||'')+'"><div class="d37-subhead"><strong>Gerät '+(di+1)+'</strong><button type="button" class="btn danger d37-mini" onclick="return d37RemoveDevice('+oi+','+di+')">Gerät entfernen</button></div><div class="d37-grid3">'
    +'<div><label>Geräteart</label><select data-d37="deviceType" onchange="d37ToggleOther(this)">'+['Gas Atmosphärisch','Gas Brennwert','Öl Atmosphärisch','Öl Brennwert','Hebeanlage','Sonstiges'].map(x=>'<option '+(d.deviceType===x?'selected':'')+'>'+x+'</option>').join('')+'</select></div>'
    +'<div class="d37-other '+(d.deviceType==='Sonstiges'?'':'hidden')+'">'+d37Field('Beschreibung bei Sonstiges','otherDescription',d.otherDescription)+'</div>'
    +'<div>'+d37Field('Hersteller','manufacturer',d.manufacturer)+'</div><div>'+d37Field('Typ / Modell','model',d.model)+'</div><div>'+d37Field('Seriennummer','serialNumber',d.serialNumber)+'</div><div>'+d37Field('Baujahr','year',d.year,'number','min="1900" max="2200"')+'</div>'
    +'<div>'+d37Field('Ersatzteil-Hersteller','sparePartManufacturer',d.sparePartManufacturer)+'</div><div>'+d37Field('Ersatzteil-Seriennummer','sparePartSerialNumber',d.sparePartSerialNumber)+'</div><div>'+d37Field('Nächste Wartung fällig','nextMaintenanceDue',d.nextMaintenanceDue,'month')+'</div></div>'
    +'<div class="d37-section-label">Mieter / Ansprechpartner am Gerät <span class="muted small">(optional)</span></div><div class="d37-grid3"><div>'+d37Field('Name','tenantName',d.tenantName)+'</div><div>'+d37Field('Telefon','tenantPhone',d.tenantPhone,'tel')+'</div><div>'+d37Field('E-Mail','tenantEmail',d.tenantEmail,'email')+'</div></div>'
    +'<label>Interne Vermerke</label><textarea data-d37="internalNotes">'+esc37(d.internalNotes||'')+'</textarea>'
    +(d.id?'<div class="d37-repair-box"><div class="d37-subhead"><strong>Wartungsberichte</strong></div>'+(history||'<div class="muted small">Noch keine abgeschlossenen Wartungen hinterlegt.</div>')+'<div class="d37-subhead" style="margin-top:12px"><strong>Reparaturen außerhalb des Wartungsvertrags</strong><button type="button" class="btn secondary d37-mini" onclick="return d37AddRepair(\''+esc37(d.id)+'\')">+ Reparatur eintragen</button></div>'+(repairs||'<div class="muted small">Noch keine Reparaturen hinterlegt.</div>')+'</div>':'')
    +'</div>';
}
function d37ObjectHtml(o,oi){return '<div class="d37-object" data-object-index="'+oi+'" data-object-id="'+esc37(o.id||'')+'"><div class="d37-subhead"><h3>Objekt '+(oi+1)+'</h3><button type="button" class="btn danger d37-mini" onclick="return d37RemoveObject('+oi+')">Objekt entfernen</button></div><div class="d37-grid2"><div>'+d37Field('Objektbezeichnung','objectName',o.name)+'</div><div>'+d37Field('Straße / Hausnummer','street',o.street)+'</div><div>'+d37Field('PLZ','zip',o.zip)+'</div><div>'+d37Field('Ort','city',o.city)+'</div></div><label>Objekt-Vermerk</label><textarea data-d37="objectNotes">'+esc37(o.notes||'')+'</textarea><div class="d37-devices">'+(o.devices||[]).map((d,di)=>d37DeviceHtml(d,oi,di)).join('')+'</div><button type="button" class="btn secondary" onclick="return d37AddDevice('+oi+')">+ Weiteres Gerät an diesem Objekt</button></div>';}
function d37RenderCustomerForm(hostId,model,mode){
  const host=$(hostId);if(!host)return;S.customer=JSON.parse(JSON.stringify(model||d37BlankCustomer()));
  host.innerHTML='<div class="d37-customer-form" data-host="'+esc37(hostId)+'" data-mode="'+esc37(mode)+'"><input type="hidden" class="d37CustomerId" value="'+esc37(S.customer.id||'')+'"><div class="d37-section-label">1. Kundendaten / Rechnungsempfänger</div><div class="d37-grid2"><div>'+d37Field('Name / Firma','customerName',S.customer.name)+'</div><div>'+d37Field('E-Mail','customerEmail',S.customer.email,'email')+'</div><div>'+d37Field('Telefon','customerPhone',S.customer.phone,'tel')+'</div><div>'+d37Field('Rechnungsadresse – Straße / Hausnummer','billingStreet',S.customer.billingStreet)+'</div><div>'+d37Field('Rechnungsadresse – PLZ','billingZip',S.customer.billingZip)+'</div><div>'+d37Field('Rechnungsadresse – Ort','billingCity',S.customer.billingCity)+'</div></div><div class="d37-section-label">2. Ausführungsorte / Objekte</div><div id="d37Objects">'+(S.customer.objects||[]).map(d37ObjectHtml).join('')+'</div><button type="button" class="btn secondary" onclick="return d37AddObject()">+ Weiteres Objekt hinzufügen</button><div class="d37CustomerStatus"></div><button type="button" class="btn success d37-save-customer" onclick="return d37SaveCustomer(\''+mode+'\')">'+(mode==='edit'?'Kundendaten speichern':'Kunde und Wartungsgeräte anlegen')+'</button></div>';
}
function d37ReadField(root,key){const e=root.querySelector('[data-d37="'+key+'"]');return e?String(e.value||'').trim():'';}
function d37ActiveCustomerForm(){return document.querySelector('#d37MaintenanceManage:not(.hidden) .d37-customer-form')||document.querySelector('#d37MaintenanceCreate:not(.hidden) .d37-customer-form')||document.querySelector('.d37-customer-form');}
function d37CollectCustomer(validate=true,root){
  root=root||d37ActiveCustomerForm();if(!root)return null;
  const c={id:String(root.querySelector('.d37CustomerId')?.value||'').trim(),name:d37ReadField(root,'customerName'),email:d37ReadField(root,'customerEmail'),phone:d37ReadField(root,'customerPhone'),billingStreet:d37ReadField(root,'billingStreet'),billingZip:d37ReadField(root,'billingZip'),billingCity:d37ReadField(root,'billingCity'),objects:[]};
  [...root.querySelectorAll('.d37-object')].forEach(or=>{const o={id:or.dataset.objectId||'',name:d37ReadField(or,'objectName'),street:d37ReadField(or,'street'),zip:d37ReadField(or,'zip'),city:d37ReadField(or,'city'),notes:d37ReadField(or,'objectNotes'),devices:[]};[...or.querySelectorAll(':scope > .d37-devices > .d37-device')].forEach(dr=>{const d={id:dr.dataset.deviceId||'',deviceType:d37ReadField(dr,'deviceType'),otherDescription:d37ReadField(dr,'otherDescription'),manufacturer:d37ReadField(dr,'manufacturer'),model:d37ReadField(dr,'model'),serialNumber:d37ReadField(dr,'serialNumber'),year:d37ReadField(dr,'year'),tenantName:d37ReadField(dr,'tenantName'),tenantPhone:d37ReadField(dr,'tenantPhone'),tenantEmail:d37ReadField(dr,'tenantEmail'),sparePartManufacturer:d37ReadField(dr,'sparePartManufacturer'),sparePartSerialNumber:d37ReadField(dr,'sparePartSerialNumber'),internalNotes:d37ReadField(dr,'internalNotes'),nextMaintenanceDue:d37ReadField(dr,'nextMaintenanceDue')};o.devices.push(d);});c.objects.push(o);});
  if(validate){
    if(!c.name||!c.billingStreet||!c.billingZip||!c.billingCity)throw new Error('Bitte Name und vollständige Rechnungsadresse eintragen.');
    if(!c.objects.length)throw new Error('Mindestens ein Ausführungsobjekt ist erforderlich.');
    c.objects.forEach((o,oi)=>{if(!o.name||!o.street||!o.zip||!o.city)throw new Error('Objekt '+(oi+1)+': Bezeichnung und vollständige Adresse fehlen.');if(!o.devices.length)throw new Error('Objekt '+(oi+1)+': Mindestens ein Wartungsgerät anlegen.');o.devices.forEach((d,di)=>{if(!d.deviceType)throw new Error('Objekt '+(oi+1)+', Gerät '+(di+1)+': Geräteart fehlt.');if(d.deviceType==='Sonstiges'&&!d.otherDescription)throw new Error('Objekt '+(oi+1)+', Gerät '+(di+1)+': Bei „Sonstiges“ ist die Beschreibung Pflicht.');if(!/^\d{4}-\d{2}$/.test(d.nextMaintenanceDue||''))throw new Error('Objekt '+(oi+1)+', Gerät '+(di+1)+': Nächste Wartung mit Monat und Jahr eintragen.');});});
  }
  return c;
}
function d37SyncModel(){try{S.customer=d37CollectCustomer(false)||S.customer;}catch(_e){}return S.customer;}
window.d37ToggleOther=function(sel){const dev=sel.closest('.d37-device'),other=dev?.querySelector('.d37-other');if(other)other.classList.toggle('hidden',sel.value!=='Sonstiges');};
window.d37AddObject=function(){const form=d37ActiveCustomerForm(),c=d37SyncModel();c.objects=c.objects||[];c.objects.push(d37BlankObject());d37RenderCustomerForm(form?.dataset.host||'d37CustomerCreateHost',c,form?.dataset.mode||'create');return false;};
window.d37RemoveObject=function(i){const form=d37ActiveCustomerForm(),c=d37SyncModel();if(c.objects.length<=1)return alert('Mindestens ein Objekt muss vorhanden bleiben.');c.objects.splice(i,1);d37RenderCustomerForm(form?.dataset.host||'d37CustomerCreateHost',c,form?.dataset.mode||'create');return false;};
window.d37AddDevice=function(i){const form=d37ActiveCustomerForm(),c=d37SyncModel();c.objects[i].devices.push(d37BlankDevice());d37RenderCustomerForm(form?.dataset.host||'d37CustomerCreateHost',c,form?.dataset.mode||'create');return false;};
window.d37RemoveDevice=function(oi,di){const form=d37ActiveCustomerForm(),c=d37SyncModel();if(c.objects[oi].devices.length<=1)return alert('Mindestens ein Gerät muss an diesem Objekt vorhanden bleiben.');c.objects[oi].devices.splice(di,1);d37RenderCustomerForm(form?.dataset.host||'d37CustomerCreateHost',c,form?.dataset.mode||'create');return false;};
window.d37SaveCustomer=async function(mode){const form=d37ActiveCustomerForm(),st=form?.querySelector('.d37CustomerStatus');try{const item=d37CollectCustomer(true,form);if(st){st.className='d37CustomerStatus status info';st.textContent='Kundendaten werden gespeichert …';}const saved=await api(chefPayload({action:'saveMaintenanceCustomer',item}));S.customer=saved;d37RenderCustomerForm(mode==='edit'?'d37CustomerEditHost':'d37CustomerCreateHost',saved,'edit');const fresh=d37ActiveCustomerForm()?.querySelector('.d37CustomerStatus');if(fresh){fresh.className='d37CustomerStatus status ok';fresh.textContent='✓ Kunde, Objekte und Geräte gespeichert.';}await d37LoadMaintenanceOverview();}catch(e){if(st){st.className='d37CustomerStatus status error';st.textContent=e.message;}else d37Notice(e.message,'error');}return false;};
window.d37AddRepair=function(deviceId){if(typeof d3Form!=='function')return;d3Form('Reparatur außerhalb Wartungsvertrag',[{name:'date',label:'Datum',type:'date'},{name:'description',label:'Ausgeführte Reparatur',type:'textarea'}],{date:localDate(),description:''},async v=>{if(!v.description.trim())throw new Error('Bitte Reparatur beschreiben.');await api(chefPayload({action:'addMaintenanceRepair',deviceId,date:v.date,description:v.description}));if(S.customer?.id){const fresh=await api(chefPayload({action:'getMaintenanceCustomer',id:S.customer.id}));d37RenderCustomerForm('d37CustomerEditHost',fresh,'edit');}});};

/* ---------- Wartungsbereich ---------- */
function d37MaintenanceShell(){
  const card=$('d36Maintenance');if(!card)return;
  const body=card.querySelector(':scope > .dg48-body');if(!body||$('d37MaintenanceNav'))return;
  body.innerHTML='<div id="d37MaintenanceNav" class="d37-maint-nav"><button type="button" data-tab="overview" onclick="return d37MaintenanceTab(\'overview\')">Wartungsübersicht</button><button type="button" data-tab="create" onclick="return d37MaintenanceTab(\'create\')">Kunde anlegen</button><button type="button" data-tab="manage" onclick="return d37MaintenanceTab(\'manage\')">Kunde verwalten</button><button type="button" data-tab="archive" onclick="return d37MaintenanceTab(\'archive\')">Wartungsarchiv</button></div><div id="d37MaintenanceOverview" class="d37-maint-panel"></div><div id="d37MaintenanceCreate" class="d37-maint-panel hidden"><div id="d37CustomerCreateHost"></div></div><div id="d37MaintenanceManage" class="d37-maint-panel hidden"><div class="d37-search"><input id="d37CustomerSearch" placeholder="Kunde, Objekt, Adresse, Gerät oder Seriennummer suchen"><button type="button" class="btn primary" onclick="return d37SearchCustomers()">Suchen</button></div><div id="d37CustomerSearchResults"></div><div id="d37CustomerEditHost" class="hidden"></div></div><div id="d37MaintenanceArchive" class="d37-maint-panel hidden"><div class="d37-search"><input id="d37ArchiveSearch" placeholder="Archiv durchsuchen"><button type="button" class="btn primary" onclick="return d37LoadArchive()">Suchen</button></div><div id="d37ArchiveList"></div></div>';
  d37RenderCustomerForm('d37CustomerCreateHost',d37BlankCustomer(),'create');
  DG3.loaders.d36Maintenance=window.d37LoadMaintenanceOverview;
}
window.d37MaintenanceTab=function(tab){
  document.querySelectorAll('#d37MaintenanceNav [data-tab]').forEach(b=>b.classList.toggle('active',b.dataset.tab===tab));
  const map={overview:'d37MaintenanceOverview',create:'d37MaintenanceCreate',manage:'d37MaintenanceManage',archive:'d37MaintenanceArchive'};Object.entries(map).forEach(([k,id])=>$(id)?.classList.toggle('hidden',k!==tab));
  if(tab==='overview')d37LoadMaintenanceOverview();if(tab==='manage')d37SearchCustomers();if(tab==='archive')d37LoadArchive();return false;
};
window.d37LoadMaintenanceOverview=async function(){
  d37MaintenanceShell();const host=$('d37MaintenanceOverview');if(!host)return;
  host.innerHTML='<div class="status info">Wartungen werden geladen …</div>';
  try{const data=await api(chefPayload({action:'getMaintenanceOverview'}));S.overview=data||{};d3Count('maintenance',Number(data.currentMonthOpen||0));
    const months=(data.months||[]);host.innerHTML='<div class="d37-overview-head"><div><h3>Wartungen '+esc37(data.windowLabel||'')+'</h3><div class="muted small">Die Kachel zählt nur im aktuellen Monat noch offene, nicht terminierte Wartungen.</div></div><div class="d37-open-count"><span>Aktueller Monat offen</span><strong>'+Number(data.currentMonthOpen||0)+'</strong></div></div><div class="d37-months">'+months.map(m=>'<button type="button" class="d37-month '+(m.current?'current':'')+'" onclick="return d37ShowMonth(\''+esc37(m.key)+'\')"><span>'+esc37(m.label||monthLabel(m.key))+'</span><strong>'+Number(m.openCount||0)+'</strong><small>'+Number(m.scheduledCount||0)+' terminiert</small></button>').join('')+'</div><div id="d37MonthDetail"></div>';const cur=months.find(x=>x.current)||months[Math.min(3,Math.max(0,months.length-1))];if(cur)d37ShowMonth(cur.key);
  }catch(e){host.innerHTML='<div class="status error">'+esc37(e.message)+'</div>';d3Count('maintenance','!');}
};
window.d37ShowMonth=function(key){const m=(S.overview?.months||[]).find(x=>x.key===key),host=$('d37MonthDetail');if(!m||!host)return false;document.querySelectorAll('.d37-month').forEach(b=>b.classList.toggle('selected',(b.textContent||'').includes(m.label||monthLabel(key))));host.innerHTML='<h3>'+esc37(m.label||monthLabel(key))+'</h3>'+((m.items||[]).map(x=>'<div class="report-card d37-maint-item"><div class="d3-head"><strong>🔧 '+esc37(x.customerName)+'</strong><span class="badge">'+(x.scheduled?'Terminiert':'Offen')+'</span></div><div><b>'+esc37(x.objectName)+'</b> · '+esc37(x.address||'')+'</div><div class="report-meta">'+esc37(fmtDevice(x))+(x.serialNumber?' · Seriennr. '+esc37(x.serialNumber):'')+'</div><div class="report-meta">Fällig: '+esc37(monthLabel(x.nextMaintenanceDue))+'</div>'+(x.scheduled?'<div class="status ok">Termin '+esc37(formatDateDE(x.plannedDate))+' · '+esc37((x.employeeNames||[]).join(', '))+'</div>':'<button type="button" class="btn success" onclick="return d37PlanMaintenance(\''+esc37(x.customerId)+'\',\''+esc37(x.objectId)+'\',\''+esc37(x.deviceId)+'\')">Wartung terminieren</button>')+'</div>').join('')||'<div class="status ok">In diesem Monat sind keine Wartungen fällig.</div>');return false;};
window.d37PlanMaintenance=function(customerId,objectId,deviceId){const all=(S.overview?.months||[]).flatMap(m=>m.items||[]),x=all.find(r=>r.deviceId===deviceId);if(!x)return alert('Wartungsgerät bitte neu laden.');S.plannerLink={customerId,objectId,deviceId};window.dg62New();setTimeout(async()=>{S.plannerLink={customerId,objectId,deviceId};$('d36PlannerType').value='Wartung';$('dg62Customer').value=x.customerName||'';$('dg62Address').value=x.address||'';$('dg62Task').value='Wartung '+fmtDevice(x)+(x.serialNumber?' · Seriennummer '+x.serialNumber:'');if(x.nextMaintenanceDue&&/^\d{4}-\d{2}$/.test(x.nextMaintenanceDue)){$('dg62ED').value=x.nextMaintenanceDue+'-01';}await d37RepairPlannerAssignment();$('dg62MT').textContent='Wartung terminieren';},0);return false;};
window.d37SearchCustomers=async function(){const host=$('d37CustomerSearchResults');if(!host)return false;try{const rows=await api(chefPayload({action:'searchMaintenanceCustomers',query:val('d37CustomerSearch')}));host.innerHTML=(rows||[]).map(x=>'<button type="button" class="d37-search-result" onclick="return d37OpenCustomer(\''+esc37(x.id)+'\')"><strong>'+esc37(x.name)+'</strong><span>'+Number(x.objectCount||0)+' Objekt(e) · '+Number(x.deviceCount||0)+' Gerät(e)</span><small>'+esc37(x.billingCity||'')+'</small></button>').join('')||'<div class="muted">Keine Kunden gefunden.</div>';}catch(e){host.innerHTML='<div class="status error">'+esc37(e.message)+'</div>';}return false;};
window.d37OpenCustomer=async function(id){try{const c=await api(chefPayload({action:'getMaintenanceCustomer',id}));S.customer=c;$('d37CustomerEditHost').classList.remove('hidden');d37RenderCustomerForm('d37CustomerEditHost',c,'edit');$('d37CustomerEditHost').scrollIntoView({behavior:'instant',block:'start'});}catch(e){d37Notice(e.message,'error');}return false;};
window.d37LoadArchive=async function(){const host=$('d37ArchiveList');if(!host)return false;host.innerHTML='<div class="status info">Archiv wird geladen …</div>';try{const rows=await api(chefPayload({action:'getMaintenanceArchive',query:val('d37ArchiveSearch')}));host.innerHTML=(rows||[]).map((x,i)=>'<div class="report-card '+(i%2?'d3-alt':'')+'"><div class="d3-head"><strong>'+esc37(x.kind==='Repair'?'🔧 Reparatur':'🧾 Wartungsbericht')+' · '+esc37(x.customerName)+'</strong><span class="badge">'+esc37(formatDateDE(x.date))+'</span></div><div>'+esc37(x.objectName||'')+' · '+esc37(x.deviceLabel||'')+'</div><div class="report-meta">'+esc37(x.description||'')+'</div>'+(x.employee?'<div class="small muted">Mitarbeiter: '+esc37(x.employee)+'</div>':'')+'</div>').join('')||'<div class="status ok">Noch keine Archiv-Einträge.</div>';}catch(e){host.innerHTML='<div class="status error">'+esc37(e.message)+'</div>';}return false;};

/* ---------- Installation / Kachelzählung ---------- */
const baseInstall37=window.d3InstallOffice;
if(typeof baseInstall37==='function')window.d3InstallOffice=d3InstallOffice=function(){const r=baseInstall37.apply(this,arguments);d37MaintenanceShell();return r;};
const baseDashboard37=window.d3Dashboard;
if(typeof baseDashboard37==='function')window.d3Dashboard=d3Dashboard=async function(){const r=await baseDashboard37.apply(this,arguments);if(canAccessBoss()&&navigator.onLine){try{const o=await api(chefPayload({action:'getMaintenanceOverview'}));d3Count('maintenance',Number(o.currentMonthOpen||0));S.overview=o;}catch(_e){d3Count('maintenance','!');}}return r;};
const baseOpen37=window.d3Open;
if(typeof baseOpen37==='function')window.d3Open=d3Open=function(id,child){const r=baseOpen37.apply(this,arguments);if(id==='d36Maintenance')setTimeout(()=>{d37MaintenanceShell();d37LoadMaintenanceOverview();$('d36Maintenance')?.scrollIntoView({behavior:'instant',block:'start'});},0);return r;};
const baseStartup37=window.d3Startup;
if(typeof baseStartup37==='function')window.d3Startup=d3Startup=function(){const r=baseStartup37.apply(this,arguments);setTimeout(()=>{d37MaintenanceShell();d37RepairPlannerAssignment();},0);return r;};
})();

/* DG 3.7: Wartungskunden, Objekte, Geräte, Wartungsarchiv und Kalender-Verfügbarkeitsprüfung. */
(function(){
'use strict';
const S=window.DG37=window.DG37||{workers:[],previewEvents:[],previewDate:'',customer:null,overview:null,plannerLink:null,plannerEditId:''};
const esc37=v=>String(v==null?'':v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const val=id=>String($(id)?.value||'').trim();
const monthLabel=k=>{if(!/^\d{4}-\d{2}$/.test(k||''))return k||'';const [y,m]=k.split('-').map(Number);return new Intl.DateTimeFormat('de-DE',{month:'long',year:'numeric'}).format(new Date(y,m-1,1));};
const fmtDevice=d=>[d.deviceType,d.otherDescription,d.manufacturer,d.model].filter(Boolean).join(' · ');
function d37Notice(msg,type='info'){if(typeof d3Notice==='function')d3Notice(msg,type);else alert(msg);}

/* ---------- Kalender: Mitarbeiterwahl + Tagesvorschau ---------- */
async function d37Workers(){
  if(S.workers.length)return S.workers;
  S.workers=(await api(chefPayload({action:'getPlannerWorkers'}))||[]).filter(x=>x.active);
  return S.workers;
}
function d37SelectedWorkerIds(){return [...document.querySelectorAll('#dg62Share .dg62cb:checked')].map(x=>x.value);}
function d37EnsurePlannerPreview(){
  const share=$('dg62Share');if(!share)return null;
  let p=$('d37PlannerPreview');if(!p){p=document.createElement('div');p.id='d37PlannerPreview';p.className='d37-planner-preview';share.insertAdjacentElement('afterend',p);}return p;
}
async function d37RepairPlannerAssignment(){
  const share=$('dg62Share');if(!share)return;
  let workers=[];try{workers=await d37Workers();}catch(e){workers=[];}
  if(!share.querySelector('.dg62cb')&&workers.length){
    const selected=new Set((S.pendingWorkerIds||[]).map(String));
    share.innerHTML=workers.map(w=>'<label><input type="checkbox" class="dg62cb" value="'+esc37(w.id)+'" '+(selected.has(String(w.id))?'checked':'')+'>'+esc37(w.displayName||w.employeeName)+'</label>').join('');
    const hint=$('dg62ShareHint');if(hint)hint.textContent='Mitarbeiter auswählen. Darunter wird der Kalender des gewählten Tages eingeblendet.';
  }
  [...share.querySelectorAll('.dg62cb')].forEach(cb=>{if(cb.dataset.d37)return;cb.dataset.d37='1';cb.addEventListener('change',d37PreviewPlannerDay);});
  ['dg62ED','dg62Start','dg62End'].forEach(id=>{const e=$(id);if(e&&!e.dataset.d37){e.dataset.d37='1';e.addEventListener('change',d37PreviewPlannerDay);}});
  d37EnsurePlannerPreview();await d37PreviewPlannerDay();
}
function d37Overlap(e,start,end){if(!start||!end)return false;return String(e.start||'')<end&&String(e.end||'')>start;}
async function d37PreviewPlannerDay(){
  const host=d37EnsurePlannerPreview();if(!host)return;
  const date=val('dg62ED'),ids=d37SelectedWorkerIds(),start=val('dg62Start'),end=val('dg62End');
  if(!date){host.innerHTML='<div class="muted small">Bitte zuerst einen Tag auswählen.</div>';return;}
  if(!ids.length){host.innerHTML='<div class="d37-preview-empty">Noch kein Mitarbeiter ausgewählt. Nach Auswahl erscheint hier dessen Kalender für '+esc37(formatDateDE(date))+'.</div>';return;}
  host.innerHTML='<div class="status info">Kalender '+esc37(formatDateDE(date))+' wird geladen …</div>';
  try{
    const [workers,events]=await Promise.all([d37Workers(),api(chefPayload({action:'getPlannerEvents',startDate:date,endDate:date}))]);
    S.previewEvents=(events||[]);S.previewDate=date;
    host.innerHTML='<div class="d37-preview-title">Kalender am '+esc37(formatDateDE(date))+'</div><div class="d37-preview-grid">'+ids.map(id=>{
      const w=workers.find(x=>String(x.id)===String(id))||{displayName:id};
      const ev=(events||[]).filter(x=>(x.employeeIds||[]).map(String).includes(String(id))&&String(x.id)!==String(S.plannerEditId||''));
      const conflicts=ev.filter(x=>d37Overlap(x,start,end));
      return '<div class="d37-preview-worker '+(conflicts.length?'conflict':'')+'"><strong>'+esc37(w.displayName||w.employeeName)+'</strong>'+(ev.length?ev.map(x=>'<div class="d37-preview-event '+(d37Overlap(x,start,end)?'conflict':'')+'"><b>'+esc37(x.start)+'–'+esc37(x.end)+'</b> '+esc37(x.customer||'Termin')+(x.type==='Wartung'?' <span>🔧</span>':'')+'<div class="small muted">'+esc37(x.task||'')+'</div></div>').join(''):'<div class="d37-free">Keine Termine – Zeitraum frei.</div>')+(conflicts.length?'<div class="d37-conflict-note">⚠ Überschneidung mit der gewählten Uhrzeit.</div>':'')+'</div>';
    }).join('')+'</div>';
  }catch(e){host.innerHTML='<div class="status error">Kalender konnte nicht geladen werden: '+esc37(e.message)+'</div>';}
}
function d37PlannerConflicts(){const ids=d37SelectedWorkerIds(),date=val('dg62ED'),start=val('dg62Start'),end=val('dg62End');if(date!==S.previewDate)return [];return (S.previewEvents||[]).filter(e=>String(e.id)!==String(S.plannerEditId||'')&&(e.employeeIds||[]).some(id=>ids.includes(String(id)))&&d37Overlap(e,start,end));}
const baseNew37=window.dg62New;
if(typeof baseNew37==='function')window.dg62New=function(){S.plannerEditId='';S.pendingWorkerIds=[];S.plannerLink=null;const r=baseNew37.apply(this,arguments);setTimeout(d37RepairPlannerAssignment,0);return r;};
const baseEdit37=window.dg62Edit;
if(typeof baseEdit37==='function')window.dg62Edit=function(id){S.plannerEditId=String(id||'');const r=baseEdit37.apply(this,arguments);setTimeout(d37RepairPlannerAssignment,0);return r;};
const baseSave37=window.dg62Save;
if(typeof baseSave37==='function')window.dg62Save=async function(){const conflicts=d37PlannerConflicts();if(conflicts.length&&!confirm('Achtung: Der gewählte Zeitraum überschneidet sich mit '+conflicts.length+' vorhandenem Termin(en) des ausgewählten Mitarbeiters. Trotzdem speichern?'))return;return baseSave37.apply(this,arguments);};
const baseApi37=window.api;
if(typeof baseApi37==='function')window.api=api=async function(payload){
  if(payload&&payload.action==='savePlannerEvent'&&payload.item&&payload.item.type==='Wartung'&&S.plannerLink){Object.assign(payload.item,{maintenanceCustomerId:S.plannerLink.customerId||'',maintenanceObjectId:S.plannerLink.objectId||'',maintenanceDeviceId:S.plannerLink.deviceId||''});}
  const r=await baseApi37.apply(this,arguments);
  if(payload&&payload.action==='savePlannerEvent')S.plannerLink=null;
  return r;
};

/* ---------- Wartungskunden: Formular ---------- */
function d37BlankCustomer(){return{id:'',name:'',billingStreet:'',billingZip:'',billingCity:'',email:'',phone:'',objects:[d37BlankObject()]};}
function d37BlankObject(){return{id:'',name:'',street:'',zip:'',city:'',notes:'',devices:[d37BlankDevice()]};}
function d37BlankDevice(){return{id:'',deviceType:'Gas Brennwert',otherDescription:'',manufacturer:'',model:'',serialNumber:'',year:'',tenantName:'',tenantPhone:'',tenantEmail:'',sparePartManufacturer:'',sparePartSerialNumber:'',internalNotes:'',nextMaintenanceDue:'',repairs:[]};}
function d37Field(label,key,value='',type='text',extra=''){return '<label>'+label+'</label><input data-d37="'+key+'" type="'+type+'" value="'+esc37(value)+'" '+extra+'>';}
function d37DeviceHtml(d,oi,di){
  const repairs=(d.repairs||[]).map(r=>'<div class="d37-repair"><b>'+esc37(formatDateDE(r.date||''))+'</b> · '+esc37(r.description||'')+(r.createdBy?'<div class="small muted">Erfasst von '+esc37(r.createdBy)+'</div>':'')+'</div>').join('');
  const history=(d.history||[]).map(r=>'<div class="d37-repair"><b>'+esc37(formatDateDE(r.date||''))+'</b> · '+esc37(r.description||'')+'<div class="small muted">'+esc37(r.employee||'')+' · '+Number(r.hours||0).toFixed(2).replace('.',',')+' Std.'+(r.nextMaintenanceDue?' · nächste Wartung '+esc37(monthLabel(r.nextMaintenanceDue)):'')+'</div></div>').join('');
  return '<div class="d37-device" data-device-index="'+di+'" data-device-id="'+esc37(d.id||'')+'"><div class="d37-subhead"><strong>Gerät '+(di+1)+'</strong><button type="button" class="btn danger d37-mini" onclick="return d37RemoveDevice('+oi+','+di+')">Gerät entfernen</button></div><div class="d37-grid3">'
    +'<div><label>Geräteart</label><select data-d37="deviceType" onchange="d37ToggleOther(this)">'+['Gas Atmosphärisch','Gas Brennwert','Öl Atmosphärisch','Öl Brennwert','Hebeanlage','Sonstiges'].map(x=>'<option '+(d.deviceType===x?'selected':'')+'>'+x+'</option>').join('')+'</select></div>'
    +'<div class="d37-other '+(d.deviceType==='Sonstiges'?'':'hidden')+'">'+d37Field('Beschreibung bei Sonstiges','otherDescription',d.otherDescription)+'</div>'
    +'<div>'+d37Field('Hersteller','manufacturer',d.manufacturer)+'</div><div>'+d37Field('Typ / Modell','model',d.model)+'</div><div>'+d37Field('Seriennummer','serialNumber',d.serialNumber)+'</div><div>'+d37Field('Baujahr','year',d.year,'number','min="1900" max="2200"')+'</div>'
    +'<div>'+d37Field('Ersatzteil-Hersteller','sparePartManufacturer',d.sparePartManufacturer)+'</div><div>'+d37Field('Ersatzteil-Seriennummer','sparePartSerialNumber',d.sparePartSerialNumber)+'</div><div>'+d37Field('Nächste Wartung fällig','nextMaintenanceDue',d.nextMaintenanceDue,'month')+'</div></div>'
    +'<div class="d37-section-label">Mieter / Ansprechpartner am Gerät <span class="muted small">(optional)</span></div><div class="d37-grid3"><div>'+d37Field('Name','tenantName',d.tenantName)+'</div><div>'+d37Field('Telefon','tenantPhone',d.tenantPhone,'tel')+'</div><div>'+d37Field('E-Mail','tenantEmail',d.tenantEmail,'email')+'</div></div>'
    +'<label>Interne Vermerke</label><textarea data-d37="internalNotes">'+esc37(d.internalNotes||'')+'</textarea>'
    +(d.id?'<div class="d37-repair-box"><div class="d37-subhead"><strong>Wartungsberichte</strong></div>'+(history||'<div class="muted small">Noch keine abgeschlossenen Wartungen hinterlegt.</div>')+'<div class="d37-subhead" style="margin-top:12px"><strong>Reparaturen außerhalb des Wartungsvertrags</strong><button type="button" class="btn secondary d37-mini" onclick="return d37AddRepair(\''+esc37(d.id)+'\')">+ Reparatur eintragen</button></div>'+(repairs||'<div class="muted small">Noch keine Reparaturen hinterlegt.</div>')+'</div>':'')
    +'</div>';
}
function d37ObjectHtml(o,oi){return '<div class="d37-object" data-object-index="'+oi+'" data-object-id="'+esc37(o.id||'')+'"><div class="d37-subhead"><h3>Objekt '+(oi+1)+'</h3><button type="button" class="btn danger d37-mini" onclick="return d37RemoveObject('+oi+')">Objekt entfernen</button></div><div class="d37-grid2"><div>'+d37Field('Objektbezeichnung','objectName',o.name)+'</div><div>'+d37Field('Straße / Hausnummer','street',o.street)+'</div><div>'+d37Field('PLZ','zip',o.zip)+'</div><div>'+d37Field('Ort','city',o.city)+'</div></div><label>Objekt-Vermerk</label><textarea data-d37="objectNotes">'+esc37(o.notes||'')+'</textarea><div class="d37-devices">'+(o.devices||[]).map((d,di)=>d37DeviceHtml(d,oi,di)).join('')+'</div><button type="button" class="btn secondary" onclick="return d37AddDevice('+oi+')">+ Weiteres Gerät an diesem Objekt</button></div>';}
function d37RenderCustomerForm(hostId,model,mode){
  const host=$(hostId);if(!host)return;S.customer=JSON.parse(JSON.stringify(model||d37BlankCustomer()));
  host.innerHTML='<div class="d37-customer-form" data-host="'+esc37(hostId)+'" data-mode="'+esc37(mode)+'"><input type="hidden" class="d37CustomerId" value="'+esc37(S.customer.id||'')+'"><div class="d37-section-label">1. Kundendaten / Rechnungsempfänger</div><div class="d37-grid2"><div>'+d37Field('Name / Firma','customerName',S.customer.name)+'</div><div>'+d37Field('E-Mail','customerEmail',S.customer.email,'email')+'</div><div>'+d37Field('Telefon','customerPhone',S.customer.phone,'tel')+'</div><div>'+d37Field('Rechnungsadresse – Straße / Hausnummer','billingStreet',S.customer.billingStreet)+'</div><div>'+d37Field('Rechnungsadresse – PLZ','billingZip',S.customer.billingZip)+'</div><div>'+d37Field('Rechnungsadresse – Ort','billingCity',S.customer.billingCity)+'</div></div><div class="d37-section-label">2. Ausführungsorte / Objekte</div><div id="d37Objects">'+(S.customer.objects||[]).map(d37ObjectHtml).join('')+'</div><button type="button" class="btn secondary" onclick="return d37AddObject()">+ Weiteres Objekt hinzufügen</button><div class="d37CustomerStatus"></div><button type="button" class="btn success d37-save-customer" onclick="return d37SaveCustomer(\''+mode+'\')">'+(mode==='edit'?'Kundendaten speichern':'Kunde und Wartungsgeräte anlegen')+'</button></div>';
}
function d37ReadField(root,key){const e=root.querySelector('[data-d37="'+key+'"]');return e?String(e.value||'').trim():'';}
function d37ActiveCustomerForm(){return document.querySelector('#d37MaintenanceManage:not(.hidden) .d37-customer-form')||document.querySelector('#d37MaintenanceCreate:not(.hidden) .d37-customer-form')||document.querySelector('.d37-customer-form');}
function d37CollectCustomer(validate=true,root){
  root=root||d37ActiveCustomerForm();if(!root)return null;
  const c={id:String(root.querySelector('.d37CustomerId')?.value||'').trim(),name:d37ReadField(root,'customerName'),email:d37ReadField(root,'customerEmail'),phone:d37ReadField(root,'customerPhone'),billingStreet:d37ReadField(root,'billingStreet'),billingZip:d37ReadField(root,'billingZip'),billingCity:d37ReadField(root,'billingCity'),objects:[]};
  [...root.querySelectorAll('.d37-object')].forEach(or=>{const o={id:or.dataset.objectId||'',name:d37ReadField(or,'objectName'),street:d37ReadField(or,'street'),zip:d37ReadField(or,'zip'),city:d37ReadField(or,'city'),notes:d37ReadField(or,'objectNotes'),devices:[]};[...or.querySelectorAll(':scope > .d37-devices > .d37-device')].forEach(dr=>{const d={id:dr.dataset.deviceId||'',deviceType:d37ReadField(dr,'deviceType'),otherDescription:d37ReadField(dr,'otherDescription'),manufacturer:d37ReadField(dr,'manufacturer'),model:d37ReadField(dr,'model'),serialNumber:d37ReadField(dr,'serialNumber'),year:d37ReadField(dr,'year'),tenantName:d37ReadField(dr,'tenantName'),tenantPhone:d37ReadField(dr,'tenantPhone'),tenantEmail:d37ReadField(dr,'tenantEmail'),sparePartManufacturer:d37ReadField(dr,'sparePartManufacturer'),sparePartSerialNumber:d37ReadField(dr,'sparePartSerialNumber'),internalNotes:d37ReadField(dr,'internalNotes'),nextMaintenanceDue:d37ReadField(dr,'nextMaintenanceDue')};o.devices.push(d);});c.objects.push(o);});
  if(validate){
    if(!c.name||!c.billingStreet||!c.billingZip||!c.billingCity)throw new Error('Bitte Name und vollständige Rechnungsadresse eintragen.');
    if(!c.objects.length)throw new Error('Mindestens ein Ausführungsobjekt ist erforderlich.');
    c.objects.forEach((o,oi)=>{if(!o.name||!o.street||!o.zip||!o.city)throw new Error('Objekt '+(oi+1)+': Bezeichnung und vollständige Adresse fehlen.');if(!o.devices.length)throw new Error('Objekt '+(oi+1)+': Mindestens ein Wartungsgerät anlegen.');o.devices.forEach((d,di)=>{if(!d.deviceType)throw new Error('Objekt '+(oi+1)+', Gerät '+(di+1)+': Geräteart fehlt.');if(d.deviceType==='Sonstiges'&&!d.otherDescription)throw new Error('Objekt '+(oi+1)+', Gerät '+(di+1)+': Bei „Sonstiges“ ist die Beschreibung Pflicht.');if(!/^\d{4}-\d{2}$/.test(d.nextMaintenanceDue||''))throw new Error('Objekt '+(oi+1)+', Gerät '+(di+1)+': Nächste Wartung mit Monat und Jahr eintragen.');});});
  }
  return c;
}
function d37SyncModel(){try{S.customer=d37CollectCustomer(false)||S.customer;}catch(_e){}return S.customer;}
window.d37ToggleOther=function(sel){const dev=sel.closest('.d37-device'),other=dev?.querySelector('.d37-other');if(other)other.classList.toggle('hidden',sel.value!=='Sonstiges');};
window.d37AddObject=function(){const form=d37ActiveCustomerForm(),c=d37SyncModel();c.objects=c.objects||[];c.objects.push(d37BlankObject());d37RenderCustomerForm(form?.dataset.host||'d37CustomerCreateHost',c,form?.dataset.mode||'create');return false;};
window.d37RemoveObject=function(i){const form=d37ActiveCustomerForm(),c=d37SyncModel();if(c.objects.length<=1)return alert('Mindestens ein Objekt muss vorhanden bleiben.');c.objects.splice(i,1);d37RenderCustomerForm(form?.dataset.host||'d37CustomerCreateHost',c,form?.dataset.mode||'create');return false;};
window.d37AddDevice=function(i){const form=d37ActiveCustomerForm(),c=d37SyncModel();c.objects[i].devices.push(d37BlankDevice());d37RenderCustomerForm(form?.dataset.host||'d37CustomerCreateHost',c,form?.dataset.mode||'create');return false;};
window.d37RemoveDevice=function(oi,di){const form=d37ActiveCustomerForm(),c=d37SyncModel();if(c.objects[oi].devices.length<=1)return alert('Mindestens ein Gerät muss an diesem Objekt vorhanden bleiben.');c.objects[oi].devices.splice(di,1);d37RenderCustomerForm(form?.dataset.host||'d37CustomerCreateHost',c,form?.dataset.mode||'create');return false;};
window.d37SaveCustomer=async function(mode){const form=d37ActiveCustomerForm(),st=form?.querySelector('.d37CustomerStatus');try{const item=d37CollectCustomer(true,form);if(st){st.className='d37CustomerStatus status info';st.textContent='Kundendaten werden gespeichert …';}const saved=await api(chefPayload({action:'saveMaintenanceCustomer',item}));S.customer=saved;d37RenderCustomerForm(mode==='edit'?'d37CustomerEditHost':'d37CustomerCreateHost',saved,'edit');const fresh=d37ActiveCustomerForm()?.querySelector('.d37CustomerStatus');if(fresh){fresh.className='d37CustomerStatus status ok';fresh.textContent='✓ Kunde, Objekte und Geräte gespeichert.';}await d37LoadMaintenanceOverview();}catch(e){if(st){st.className='d37CustomerStatus status error';st.textContent=e.message;}else d37Notice(e.message,'error');}return false;};
window.d37AddRepair=function(deviceId){if(typeof d3Form!=='function')return;d3Form('Reparatur außerhalb Wartungsvertrag',[{name:'date',label:'Datum',type:'date'},{name:'description',label:'Ausgeführte Reparatur',type:'textarea'}],{date:localDate(),description:''},async v=>{if(!v.description.trim())throw new Error('Bitte Reparatur beschreiben.');await api(chefPayload({action:'addMaintenanceRepair',deviceId,date:v.date,description:v.description}));if(S.customer?.id){const fresh=await api(chefPayload({action:'getMaintenanceCustomer',id:S.customer.id}));d37RenderCustomerForm('d37CustomerEditHost',fresh,'edit');}});};

/* ---------- Wartungsbereich ---------- */
function d37MaintenanceShell(){
  const card=$('d36Maintenance');if(!card)return;
  const body=card.querySelector(':scope > .dg48-body');if(!body||$('d37MaintenanceNav'))return;
  body.innerHTML='<div id="d37MaintenanceNav" class="d37-maint-nav"><button type="button" data-tab="overview" onclick="return d37MaintenanceTab(\'overview\')">Wartungsübersicht</button><button type="button" data-tab="create" onclick="return d37MaintenanceTab(\'create\')">Kunde anlegen</button><button type="button" data-tab="manage" onclick="return d37MaintenanceTab(\'manage\')">Kunde verwalten</button><button type="button" data-tab="archive" onclick="return d37MaintenanceTab(\'archive\')">Wartungsarchiv</button></div><div id="d37MaintenanceOverview" class="d37-maint-panel"></div><div id="d37MaintenanceCreate" class="d37-maint-panel hidden"><div id="d37CustomerCreateHost"></div></div><div id="d37MaintenanceManage" class="d37-maint-panel hidden"><div class="d37-search"><input id="d37CustomerSearch" placeholder="Kunde, Objekt, Adresse, Gerät oder Seriennummer suchen"><button type="button" class="btn primary" onclick="return d37SearchCustomers()">Suchen</button></div><div id="d37CustomerSearchResults"></div><div id="d37CustomerEditHost" class="hidden"></div></div><div id="d37MaintenanceArchive" class="d37-maint-panel hidden"><div class="d37-search"><input id="d37ArchiveSearch" placeholder="Archiv durchsuchen"><button type="button" class="btn primary" onclick="return d37LoadArchive()">Suchen</button></div><div id="d37ArchiveList"></div></div>';
  d37RenderCustomerForm('d37CustomerCreateHost',d37BlankCustomer(),'create');
  DG3.loaders.d36Maintenance=window.d37LoadMaintenanceOverview;
}
window.d37MaintenanceTab=function(tab){
  document.querySelectorAll('#d37MaintenanceNav [data-tab]').forEach(b=>b.classList.toggle('active',b.dataset.tab===tab));
  const map={overview:'d37MaintenanceOverview',create:'d37MaintenanceCreate',manage:'d37MaintenanceManage',archive:'d37MaintenanceArchive'};Object.entries(map).forEach(([k,id])=>$(id)?.classList.toggle('hidden',k!==tab));
  if(tab==='overview')d37LoadMaintenanceOverview();if(tab==='manage')d37SearchCustomers();if(tab==='archive')d37LoadArchive();return false;
};
window.d37LoadMaintenanceOverview=async function(){
  d37MaintenanceShell();const host=$('d37MaintenanceOverview');if(!host)return;
  host.innerHTML='<div class="status info">Wartungen werden geladen …</div>';
  try{const data=await api(chefPayload({action:'getMaintenanceOverview'}));S.overview=data||{};d3Count('maintenance',Number(data.currentMonthOpen||0));
    const months=(data.months||[]);host.innerHTML='<div class="d37-overview-head"><div><h3>Wartungen '+esc37(data.windowLabel||'')+'</h3><div class="muted small">Die Kachel zählt nur im aktuellen Monat noch offene, nicht terminierte Wartungen.</div></div><div class="d37-open-count"><span>Aktueller Monat offen</span><strong>'+Number(data.currentMonthOpen||0)+'</strong></div></div><div class="d37-months">'+months.map(m=>'<button type="button" class="d37-month '+(m.current?'current':'')+'" onclick="return d37ShowMonth(\''+esc37(m.key)+'\')"><span>'+esc37(m.label||monthLabel(m.key))+'</span><strong>'+Number(m.openCount||0)+'</strong><small>'+Number(m.scheduledCount||0)+' terminiert</small></button>').join('')+'</div><div id="d37MonthDetail"></div>';const cur=months.find(x=>x.current)||months[Math.min(3,Math.max(0,months.length-1))];if(cur)d37ShowMonth(cur.key);
  }catch(e){host.innerHTML='<div class="status error">'+esc37(e.message)+'</div>';d3Count('maintenance','!');}
};
window.d37ShowMonth=function(key){const m=(S.overview?.months||[]).find(x=>x.key===key),host=$('d37MonthDetail');if(!m||!host)return false;document.querySelectorAll('.d37-month').forEach(b=>b.classList.toggle('selected',(b.textContent||'').includes(m.label||monthLabel(key))));host.innerHTML='<h3>'+esc37(m.label||monthLabel(key))+'</h3>'+((m.items||[]).map(x=>'<div class="report-card d37-maint-item"><div class="d3-head"><strong>🔧 '+esc37(x.customerName)+'</strong><span class="badge">'+(x.scheduled?'Terminiert':'Offen')+'</span></div><div><b>'+esc37(x.objectName)+'</b> · '+esc37(x.address||'')+'</div><div class="report-meta">'+esc37(fmtDevice(x))+(x.serialNumber?' · Seriennr. '+esc37(x.serialNumber):'')+'</div><div class="report-meta">Fällig: '+esc37(monthLabel(x.nextMaintenanceDue))+'</div>'+(x.scheduled?'<div class="status ok">Termin '+esc37(formatDateDE(x.plannedDate))+' · '+esc37((x.employeeNames||[]).join(', '))+'</div>':'<button type="button" class="btn success" onclick="return d37PlanMaintenance(\''+esc37(x.customerId)+'\',\''+esc37(x.objectId)+'\',\''+esc37(x.deviceId)+'\')">Wartung terminieren</button>')+'</div>').join('')||'<div class="status ok">In diesem Monat sind keine Wartungen fällig.</div>');return false;};
window.d37PlanMaintenance=function(customerId,objectId,deviceId){const all=(S.overview?.months||[]).flatMap(m=>m.items||[]),x=all.find(r=>r.deviceId===deviceId);if(!x)return alert('Wartungsgerät bitte neu laden.');S.plannerLink={customerId,objectId,deviceId};window.dg62New();setTimeout(async()=>{S.plannerLink={customerId,objectId,deviceId};$('d36PlannerType').value='Wartung';$('dg62Customer').value=x.customerName||'';$('dg62Address').value=x.address||'';$('dg62Task').value='Wartung '+fmtDevice(x)+(x.serialNumber?' · Seriennummer '+x.serialNumber:'');if(x.nextMaintenanceDue&&/^\d{4}-\d{2}$/.test(x.nextMaintenanceDue)){$('dg62ED').value=x.nextMaintenanceDue+'-01';}await d37RepairPlannerAssignment();$('dg62MT').textContent='Wartung terminieren';},0);return false;};
window.d37SearchCustomers=async function(){const host=$('d37CustomerSearchResults');if(!host)return false;try{const rows=await api(chefPayload({action:'searchMaintenanceCustomers',query:val('d37CustomerSearch')}));host.innerHTML=(rows||[]).map(x=>'<button type="button" class="d37-search-result" onclick="return d37OpenCustomer(\''+esc37(x.id)+'\')"><strong>'+esc37(x.name)+'</strong><span>'+Number(x.objectCount||0)+' Objekt(e) · '+Number(x.deviceCount||0)+' Gerät(e)</span><small>'+esc37(x.billingCity||'')+'</small></button>').join('')||'<div class="muted">Keine Kunden gefunden.</div>';}catch(e){host.innerHTML='<div class="status error">'+esc37(e.message)+'</div>';}return false;};
window.d37OpenCustomer=async function(id){try{const c=await api(chefPayload({action:'getMaintenanceCustomer',id}));S.customer=c;$('d37CustomerEditHost').classList.remove('hidden');d37RenderCustomerForm('d37CustomerEditHost',c,'edit');$('d37CustomerEditHost').scrollIntoView({behavior:'instant',block:'start'});}catch(e){d37Notice(e.message,'error');}return false;};
window.d37LoadArchive=async function(){const host=$('d37ArchiveList');if(!host)return false;host.innerHTML='<div class="status info">Archiv wird geladen …</div>';try{const rows=await api(chefPayload({action:'getMaintenanceArchive',query:val('d37ArchiveSearch')}));host.innerHTML=(rows||[]).map((x,i)=>'<div class="report-card '+(i%2?'d3-alt':'')+'"><div class="d3-head"><strong>'+esc37(x.kind==='Repair'?'🔧 Reparatur':'🧾 Wartungsbericht')+' · '+esc37(x.customerName)+'</strong><span class="badge">'+esc37(formatDateDE(x.date))+'</span></div><div>'+esc37(x.objectName||'')+' · '+esc37(x.deviceLabel||'')+'</div><div class="report-meta">'+esc37(x.description||'')+'</div>'+(x.employee?'<div class="small muted">Mitarbeiter: '+esc37(x.employee)+'</div>':'')+'</div>').join('')||'<div class="status ok">Noch keine Archiv-Einträge.</div>';}catch(e){host.innerHTML='<div class="status error">'+esc37(e.message)+'</div>';}return false;};

/* ---------- Installation / Kachelzählung ---------- */
const baseInstall37=window.d3InstallOffice;
if(typeof baseInstall37==='function')window.d3InstallOffice=d3InstallOffice=function(){const r=baseInstall37.apply(this,arguments);d37MaintenanceShell();return r;};
const baseDashboard37=window.d3Dashboard;
if(typeof baseDashboard37==='function')window.d3Dashboard=d3Dashboard=async function(){const r=await baseDashboard37.apply(this,arguments);if(canAccessBoss()&&navigator.onLine){try{const o=await api(chefPayload({action:'getMaintenanceOverview'}));d3Count('maintenance',Number(o.currentMonthOpen||0));S.overview=o;}catch(_e){d3Count('maintenance','!');}}return r;};
const baseOpen37=window.d3Open;
if(typeof baseOpen37==='function')window.d3Open=d3Open=function(id,child){const r=baseOpen37.apply(this,arguments);if(id==='d36Maintenance')setTimeout(()=>{d37MaintenanceShell();d37LoadMaintenanceOverview();$('d36Maintenance')?.scrollIntoView({behavior:'instant',block:'start'});},0);return r;};
const baseStartup37=window.d3Startup;
if(typeof baseStartup37==='function')window.d3Startup=d3Startup=function(){const r=baseStartup37.apply(this,arguments);setTimeout(()=>{d37MaintenanceShell();d37RepairPlannerAssignment();},0);return r;};
})();
/* DG 3.7.1: Wartungskachel = Monatsreminder; nach Terminierung/Löschung sofort neu zählen. */
(function(){
'use strict';
async function d371RefreshMaintenanceReminder(){
  if(!canAccessBoss()||!navigator.onLine)return;
  try{
    const o=await api(chefPayload({action:'getMaintenanceOverview'}));
    if(window.DG37)DG37.overview=o||{};
    d3Count('maintenance',Number(o&&o.currentMonthOpen||0));
    const panel=$('d37MaintenanceOverview');
    const card=$('d36Maintenance');
    if(panel&&card&&!panel.classList.contains('hidden')&&!card.classList.contains('hidden')&&typeof window.d37LoadMaintenanceOverview==='function'){
      await window.d37LoadMaintenanceOverview();
    }
  }catch(_e){d3Count('maintenance','!');}
}
window.d371RefreshMaintenanceReminder=d371RefreshMaintenanceReminder;
const baseApi371=window.api;
if(typeof baseApi371==='function')window.api=api=async function(payload){
  const action=payload&&payload.action;
  const result=await baseApi371.apply(this,arguments);
  if(action==='savePlannerEvent'||action==='deletePlannerEvent')setTimeout(d371RefreshMaintenanceReminder,0);
  return result;
};
})();

/* DG 3.8: Wartungsverwaltung Feinschliff */
(function(){
'use strict';
const M38=window.DG38=window.DG38||{overview:null,loaded:false,customerCache:{}};
const months38=['Januar','Februar','März','April','Mai','Juni','Juli','August','September','Oktober','November','Dezember'];
function esc38(v){return String(v==null?'':v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function dueLabel38(v){if(!/^\d{4}-\d{2}$/.test(String(v||'')))return '';const [y,m]=String(v).split('-');return months38[Number(m)-1]+' '+y;}
function cleanTask38(v){let s=String(v||'');s=s.replace(/(?:^|\n)Terminart:\s*(?:Wartung|Auftrag)\s*/gi,'\n').replace(/(?:^|\n)Was ist zu tun:\s*/gi,'\n').replace(/^(?:\s*Was ist zu tun:\s*)+/gi,'').replace(/\s+/g,' ').trim();return s;}
function yearOptions38(selected){const y=new Date().getFullYear();let h='<option value="">Jahr</option>';for(let i=0;i<=5;i++){const v=String(y+i);h+='<option value="'+v+'" '+(v===String(selected||'')?'selected':'')+'>'+v+'</option>';}return h;}
function monthOptions38(selected){let h='<option value="">Monat</option>';months38.forEach((n,i)=>{const v=String(i+1).padStart(2,'0');h+='<option value="'+v+'" '+(v===String(selected||'')?'selected':'')+'>'+n+'</option>';});return h;}
function installMonthYear38(input,scope){if(!input||input.dataset.d38)return;input.dataset.d38='1';const value=String(input.value||''),p=/^(\d{4})-(\d{2})$/.exec(value)||[];input.type='hidden';const wrap=document.createElement('div');wrap.className='d38-month-year';wrap.innerHTML='<select class="d38-month">'+monthOptions38(p[2])+'</select><select class="d38-year">'+yearOptions38(p[1])+'</select>';input.insertAdjacentElement('afterend',wrap);const sync=()=>{const m=wrap.querySelector('.d38-month').value,y=wrap.querySelector('.d38-year').value;input.value=(m&&y)?(y+'-'+m):'';input.dispatchEvent(new Event('change',{bubbles:true}));};wrap.querySelectorAll('select').forEach(s=>s.addEventListener('change',sync));}
function scanMonthYear38(){const emp=$('d36NextMaintenance');if(emp)installMonthYear38(emp,'employee');document.querySelectorAll('.d37-customer-form input[data-d37="nextMaintenanceDue"]').forEach(x=>installMonthYear38(x,'customer'));}

/* Maintenance data is fetched once per app session, then cached until a real mutation. */
const api38=window.api;
if(typeof api38==='function')window.api=api=async function(payload){
  const action=payload&&payload.action;
  if(action==='getMaintenanceOverview'&&M38.loaded&&M38.overview)return M38.overview;
  if(action==='getMaintenanceCustomer'&&payload.id&&M38.customerCache[payload.id])return M38.customerCache[payload.id];
  if(action==='savePlannerEvent'&&payload.item&&window.DG37&&DG37.plannerLink){
    payload.item.type='Wartung';
    payload.item.maintenanceCustomerId=DG37.plannerLink.customerId||'';
    payload.item.maintenanceObjectId=DG37.plannerLink.objectId||'';
    payload.item.maintenanceDeviceId=DG37.plannerLink.deviceId||'';
  }
  const r=await api38.apply(this,arguments);
  if(action==='getMaintenanceOverview'){M38.overview=r||{};M38.loaded=true;if(window.DG37)DG37.overview=r||{};}
  if(action==='getMaintenanceCustomer'&&payload.id)M38.customerCache[payload.id]=r;
  if(['saveMaintenanceCustomer','deleteMaintenanceDevice','deleteMaintenanceCustomer','savePlannerEvent','deletePlannerEvent','saveEntry'].includes(action)){
    M38.loaded=false;M38.overview=null;if(window.DG37)DG37.overview=null;
    if(action==='saveMaintenanceCustomer'&&r&&r.id)M38.customerCache[r.id]=r;else if(action!=='savePlannerEvent'&&action!=='deletePlannerEvent'&&action!=='saveEntry')M38.customerCache={};
  }
  return r;
};
async function refreshMaintenance38(){try{M38.loaded=false;M38.overview=null;const o=await api(chefPayload({action:'getMaintenanceOverview'}));M38.overview=o||{};M38.loaded=true;if(window.DG37)DG37.overview=o||{};d3Count('maintenance',Number(o&&o.currentMonthOpen||0));if(typeof window.d37LoadMaintenanceOverview==='function'&&$('d37MaintenanceOverview'))await window.d37LoadMaintenanceOverview();}catch(_e){}}
window.d38RefreshMaintenance=refreshMaintenance38;

/* Employee maintenance due: month/year selects */
const take38=window.takeCalendarEvent;
if(typeof take38==='function')window.takeCalendarEvent=function(){const r=take38.apply(this,arguments);setTimeout(scanMonthYear38,0);return r;};
const reset38=window.resetEntry;
if(typeof reset38==='function')window.resetEntry=function(){const r=reset38.apply(this,arguments);setTimeout(scanMonthYear38,0);return r;};

/* Customer/device forms: month/year selects + obvious delete/edit controls. */
function decorateCustomer38(){
  scanMonthYear38();
  document.querySelectorAll('.d37-device').forEach(dev=>{if(dev.dataset.d38controls)return;dev.dataset.d38controls='1';const head=dev.querySelector('.d37-subhead');if(!head)return;const id=dev.dataset.deviceId||'';const edit=document.createElement('button');edit.type='button';edit.className='btn secondary d37-mini';edit.textContent='Gerät bearbeiten';edit.onclick=()=>{dev.querySelector('input,select,textarea')?.focus();dev.scrollIntoView({behavior:'smooth',block:'start'});};head.insertBefore(edit,head.lastElementChild);if(id){const del=head.querySelector('.btn.danger');if(del){del.onclick=()=>{d38DeleteDevice(id);return false;};del.textContent='Gerät löschen';}}
  });
  const form=document.querySelector('#d37CustomerEditHost .d37-customer-form');if(form&&!form.querySelector('.d38-delete-customer')){const id=form.querySelector('.d37CustomerId')?.value||'';if(id){const b=document.createElement('button');b.type='button';b.className='btn danger d38-delete-customer';b.textContent='Kompletten Kunden löschen';b.onclick=()=>d38DeleteCustomer(id);form.appendChild(b);}}
}
window.d38DeleteDevice=async function(id){if(!confirm('Dieses Wartungsgerät wirklich löschen? Wartungshistorie und alte Berichte bleiben im Archiv erhalten.'))return false;try{await api(chefPayload({action:'deleteMaintenanceDevice',id}));M38.customerCache={};await refreshMaintenance38();if(window.DG37&&DG37.customer&&DG37.customer.id){const c=await api(chefPayload({action:'getMaintenanceCustomer',id:DG37.customer.id}));if(typeof window.d37OpenCustomer==='function'){M38.customerCache[c.id]=c;await window.d37OpenCustomer(c.id);}}}catch(e){alert(e.message||'Gerät konnte nicht gelöscht werden.');}return false;};
window.d38DeleteCustomer=async function(id){if(!confirm('Kompletten Wartungskunden mit allen Objekten und Geräten löschen? Alte Wartungsberichte bleiben im Archiv erhalten.'))return false;try{await api(chefPayload({action:'deleteMaintenanceCustomer',id}));M38.customerCache={};await refreshMaintenance38();if($('d37CustomerEditHost')){$('d37CustomerEditHost').innerHTML='';$('d37CustomerEditHost').classList.add('hidden');}if(typeof window.d37SearchCustomers==='function')await window.d37SearchCustomers();}catch(e){alert(e.message||'Kunde konnte nicht gelöscht werden.');}return false;};
['d37AddObject','d37AddDevice','d37RemoveObject','d37RemoveDevice','d37SaveCustomer','d37OpenCustomer','d37MaintenanceTab'].forEach(name=>{const f=window[name];if(typeof f!=='function')return;window[name]=async function(){const r=await f.apply(this,arguments);setTimeout(decorateCustomer38,0);return r;};});

/* Overview: clickable customer and cached rendering. */
const showMonth38=window.d37ShowMonth;
if(typeof showMonth38==='function')window.d37ShowMonth=function(key){const r=showMonth38.apply(this,arguments);setTimeout(()=>{const m=(window.DG37&&DG37.overview&&DG37.overview.months||[]).find(x=>x.key===key),host=$('d37MonthDetail');if(!m||!host)return;[...host.querySelectorAll('.d37-maint-item')].forEach((card,i)=>{const x=(m.items||[])[i],strong=card.querySelector('.d3-head strong');if(!x||!strong)return;strong.style.cursor='pointer';strong.title='Kundendatensatz öffnen';strong.onclick=()=>d38OpenCustomerFromOverview(x.customerId);});},0);return r;};
window.d38OpenCustomerFromOverview=async function(id){if(typeof window.d37MaintenanceTab==='function')window.d37MaintenanceTab('manage');setTimeout(async()=>{try{await window.d37OpenCustomer(id);decorateCustomer38();}catch(_e){}},0);return false;};

/* Planning: always today or future, never preselect the first day of the due month. */
const plan38=window.d37PlanMaintenance;
if(typeof plan38==='function')window.d37PlanMaintenance=function(){const r=plan38.apply(this,arguments);setTimeout(()=>{const d=$('dg62ED');if(d){d.min=localDate();d.value=localDate();}scanMonthYear38();},0);return r;};
const savePlanner38=window.dg62Save;
if(typeof savePlanner38==='function')window.dg62Save=async function(){const type=$('d36PlannerType')?.value||'';if(type==='Wartung'){const d=$('dg62ED');if(d&&d.value<localDate()){status('dg62MS','Wartungstermine können nicht in die Vergangenheit gelegt werden.','error');d.value=localDate();return;}}const r=await savePlanner38.apply(this,arguments);setTimeout(refreshMaintenance38,0);return r;};
const delPlanner38=window.dg62Delete;
if(typeof delPlanner38==='function')window.dg62Delete=async function(){const r=await delPlanner38.apply(this,arguments);setTimeout(refreshMaintenance38,0);return r;};

/* Regiebericht: clean repeated labels and show next maintenance due. */
if(typeof window.d3Single==='function'||typeof d3Single==='function'){
  const d3Single38=function(r){const a=cleanTask38(r.activity||'');return '<div class="entry"><strong>'+esc(formatDateDE(r.date))+' - '+esc(r.employee)+' - '+formatHours(r.hours)+' Std.</strong><div>'+esc(r.start)+' - '+esc(r.end)+'</div><div>'+esc(a)+'</div>'+(r.maintenance&&r.nextMaintenanceDue?'<div class="status ok">Nächste Wartung fällig: '+esc(dueLabel38(r.nextMaintenanceDue))+'</div>':'')+(r.materialUsed?'<div>Material: '+esc(r.material)+'</div>':'')+(r.isSupplement?'<div class="status info">Nachtrag '+esc(r.supplementCreatedAt||'')+'</div>':'')+'</div>';};
  window.d3Single=d3Single=d3Single38;
}

/* Preload once after chef login; subsequent views use cache. */
const openMain38=window.openMain;
if(typeof openMain38==='function')window.openMain=function(){const r=openMain38.apply(this,arguments);setTimeout(async()=>{scanMonthYear38();decorateCustomer38();if(canAccessBoss()&&!M38.loaded){try{const o=await api(chefPayload({action:'getMaintenanceOverview'}));M38.overview=o||{};M38.loaded=true;d3Count('maintenance',Number(o&&o.currentMonthOpen||0));}catch(_e){}}},150);return r;};
const open38=window.d3Open;
if(typeof open38==='function')window.d3Open=function(){const r=open38.apply(this,arguments);setTimeout(()=>{decorateCustomer38();scanMonthYear38();},0);return r;};
})();

/* DG 3.9: Mitarbeiter-Kalenderrefresh, Wartungs-Jahresampeln und interne Geräte-ID */
(function(){
'use strict';
const M39=window.DG39=window.DG39||{stats:null,lastDeviceSearch:null};
function esc39(v){return String(v==null?'':v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function fmtDevice39(x){return [x.deviceType==='Sonstiges'?(x.otherDescription||'Sonstiges'):x.deviceType,x.manufacturer,x.model,x.serialNumber?('SN '+x.serialNumber):''].filter(Boolean).join(' · ');}

/* Nach Büroarbeit beim Wechsel zu Mitarbeiter immer den aktuellen Kalender laden. */
const showEmployee39=window.showEmployee;
if(typeof showEmployee39==='function')window.showEmployee=function(){const r=showEmployee39.apply(this,arguments);if(navigator.onLine)setTimeout(()=>{try{loadCalendarEvents();}catch(_e){}},0);return r;};

/* Geräte-ID: bestehende anzeigen, neue Geräte serverseitig eindeutig reservieren. */
async function decorateDeviceIds39(){
  const devices=[...document.querySelectorAll('.d37-device')];
  for(const dev of devices){
    if(dev.querySelector('.d39-device-id'))continue;
    let data=null;
    try{const oi=Number(dev.closest('.d37-object')?.dataset.objectIndex||-1),di=Number(dev.dataset.deviceIndex||-1);data=window.DG37&&DG37.customer&&DG37.customer.objects&&DG37.customer.objects[oi]&&DG37.customer.objects[oi].devices?DG37.customer.objects[oi].devices[di]:null;}catch(_e){}
    let internalId=String(data&&data.internalDeviceId||dev.dataset.internalDeviceId||'');
    const box=document.createElement('div');box.className='d39-device-id';box.innerHTML='<span>Interne Geräte-ID</span><strong>'+(internalId?esc39(internalId):'wird vergeben …')+'</strong>';
    const head=dev.querySelector('.d37-subhead');if(head)head.insertAdjacentElement('afterend',box);else dev.prepend(box);
    if(internalId){dev.dataset.internalDeviceId=internalId;continue;}
    if(!canAccessBoss()||!navigator.onLine){box.querySelector('strong').textContent='wird beim Speichern vergeben';continue;}
    try{const r=await api(chefPayload({action:'reserveMaintenanceDeviceId'}));internalId=String(r&&r.internalDeviceId||'');if(internalId){dev.dataset.internalDeviceId=internalId;box.querySelector('strong').textContent=internalId;}}catch(_e){box.querySelector('strong').textContent='wird beim Speichern vergeben';}
  }
}
function injectReservedIds39(payload){
  if(!payload||payload.action!=='saveMaintenanceCustomer'||!payload.item||!Array.isArray(payload.item.objects))return;
  const form=document.querySelector('.d37-customer-form');if(!form)return;
  [...form.querySelectorAll('.d37-object')].forEach((or,oi)=>{[...or.querySelectorAll(':scope > .d37-devices > .d37-device')].forEach((dev,di)=>{if(payload.item.objects[oi]&&payload.item.objects[oi].devices&&payload.item.objects[oi].devices[di])payload.item.objects[oi].devices[di].internalDeviceId=String(dev.dataset.internalDeviceId||'');});});
}

function ensureMaintenanceTop39(){
  const card=$('d36Maintenance');if(!card||$('d39MaintenanceTop'))return;
  const title=[...card.querySelectorAll('h2')].find(x=>(x.textContent||'').trim()==='Wartungsverträge');if(!title)return;
  const top=document.createElement('div');top.id='d39MaintenanceTop';
  top.innerHTML='<div class="d39-year-stats"><div class="d39-stat"><span id="d39TotalLabel">Wartungen total</span><strong id="d39Total">–</strong></div><div class="d39-stat"><span id="d39DoneLabel">Wartungen ausgeführt</span><strong id="d39Done">–</strong></div><div class="d39-stat"><span id="d39OpenLabel">Noch offene Wartungen</span><strong id="d39Open">–</strong></div></div><div class="d39-id-search"><label for="d39DeviceSearch">Geräte-ID suchen</label><div><input id="d39DeviceSearch" inputmode="numeric" placeholder="z. B. 1000"><button type="button" class="btn primary" onclick="return d39SearchDevice()">Suchen</button></div><div id="d39DeviceSearchResult"></div></div>';
  title.insertAdjacentElement('afterend',top);
}
function renderStats39(o){const s=o&&o.yearStats||null;if(!s)return;M39.stats=s;const y=s.year;if($('d39TotalLabel'))$('d39TotalLabel').textContent='Wartungen total '+y;if($('d39DoneLabel'))$('d39DoneLabel').textContent='Wartungen '+y+' ausgeführt';if($('d39OpenLabel'))$('d39OpenLabel').textContent='Noch offene Wartungen '+y;if($('d39Total'))$('d39Total').textContent=Number(s.total||0);if($('d39Done'))$('d39Done').textContent=Number(s.completed||0);if($('d39Open'))$('d39Open').textContent=Number(s.open||0);}
window.d39SearchDevice=async function(){const q=String($('d39DeviceSearch')?.value||'').trim(),host=$('d39DeviceSearchResult');if(!host)return false;if(!/^\d+$/.test(q)){host.innerHTML='<div class="status warn">Bitte eine Geräte-ID eingeben.</div>';return false;}host.innerHTML='<div class="status info">Gerät wird gesucht …</div>';try{const x=await api(chefPayload({action:'findMaintenanceDeviceByInternalId',internalDeviceId:q}));M39.lastDeviceSearch=x;host.innerHTML='<button type="button" class="d39-device-result" onclick="return d39OpenDeviceCustomer()"><strong>Geräte-ID '+esc39(x.internalDeviceId)+'</strong><span>'+esc39(x.customerName)+' · '+esc39(x.objectName)+'</span><small>'+esc39(fmtDevice39(x))+' · '+esc39(x.address||'')+'</small></button>';}catch(e){host.innerHTML='<div class="status error">'+esc39(e.message||'Gerät nicht gefunden.')+'</div>';}return false;};
window.d39OpenDeviceCustomer=function(){const x=M39.lastDeviceSearch;if(!x)return false;if(typeof window.d37MaintenanceTab==='function')window.d37MaintenanceTab('manage');setTimeout(async()=>{await window.d37OpenCustomer(x.customerId);await decorateDeviceIds39();const dev=document.querySelector('.d37-device[data-device-id="'+CSS.escape(String(x.deviceId))+'"]');dev?.scrollIntoView({behavior:'smooth',block:'center'});},0);return false;};

/* Geräte-ID in Monatsübersicht und Wartungsauftrag sichtbar. */
const showMonth39=window.d37ShowMonth;
if(typeof showMonth39==='function')window.d37ShowMonth=function(key){const r=showMonth39.apply(this,arguments);setTimeout(()=>{const m=(window.DG37&&DG37.overview&&DG37.overview.months||[]).find(x=>x.key===key),cards=[...document.querySelectorAll('#d37MonthDetail .d37-maint-item')];cards.forEach((c,i)=>{const x=m&&m.items&&m.items[i];if(!x||!x.internalDeviceId||c.querySelector('.d39-card-id'))return;const d=document.createElement('div');d.className='d39-card-id';d.textContent='Geräte-ID: '+x.internalDeviceId;const meta=c.querySelector('.report-meta');(meta||c).insertAdjacentElement(meta?'beforebegin':'afterbegin',d);});},0);return r;};
const plan39=window.d37PlanMaintenance;
if(typeof plan39==='function')window.d37PlanMaintenance=function(customerId,objectId,deviceId){const all=(window.DG37&&DG37.overview?.months||[]).flatMap(m=>m.items||[]),x=all.find(r=>String(r.deviceId)===String(deviceId));const r=plan39.apply(this,arguments);setTimeout(()=>{if(x&&$('dg62Task'))$('dg62Task').value='Wartung · Geräte-ID '+(x.internalDeviceId||'–')+' · '+fmtDevice39(x);},0);return r;};

const api39=window.api;
if(typeof api39==='function')window.api=api=async function(payload){injectReservedIds39(payload);const r=await api39.apply(this,arguments);if(payload&&payload.action==='getMaintenanceOverview'){ensureMaintenanceTop39();renderStats39(r);setTimeout(decorateDeviceIds39,0);}if(payload&&payload.action==='getMaintenanceCustomer')setTimeout(decorateDeviceIds39,0);return r;};
const loadMaint39=window.d37LoadMaintenanceOverview;
if(typeof loadMaint39==='function')window.d37LoadMaintenanceOverview=async function(){ensureMaintenanceTop39();const r=await loadMaint39.apply(this,arguments);renderStats39((window.DG38&&DG38.overview)||(window.DG37&&DG37.overview)||{});setTimeout(decorateDeviceIds39,0);return r;};
const openMain39=window.openMain;
if(typeof openMain39==='function')window.openMain=function(){const r=openMain39.apply(this,arguments);setTimeout(()=>{ensureMaintenanceTop39();const o=(window.DG38&&DG38.overview)||(window.DG37&&DG37.overview);if(o)renderStats39(o);decorateDeviceIds39();},250);return r;};
const open39=window.d3Open;
if(typeof open39==='function')window.d3Open=function(){const r=open39.apply(this,arguments);setTimeout(()=>{ensureMaintenanceTop39();const o=(window.DG38&&DG38.overview)||(window.DG37&&DG37.overview);if(o)renderStats39(o);decorateDeviceIds39();},0);return r;};
})();

/* DG 5.0: final maintenance UX, clean calendar text, customer master list, stable refresh */
(function(){
'use strict';
const V='5.0';
const esc50=v=>String(v==null?'':v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const months50=['Januar','Februar','März','April','Mai','Juni','Juli','August','September','Oktober','November','Dezember'];
function due50(v){const m=/^(\d{4})-(\d{2})$/.exec(String(v||''));return m?months50[Number(m[2])-1]+' '+m[1]:String(v||'');}
function cleanCalendarText50(v){
  let s=String(v||'').replace(/\r/g,'\n');
  s=s.replace(/Terminart:\s*(?:Wartung|Auftrag)/gi,' ')
    .replace(/Was ist zu tun:\s*/gi,' ')
    .replace(/DG-Termin-ID:\s*[A-Za-z0-9@._-]+/gi,' ')
    .replace(/Wartung-Kunden-ID:\s*[A-Za-z0-9-]+/gi,' ')
    .replace(/Wartung-Objekt-ID:\s*[A-Za-z0-9-]+/gi,' ')
    .replace(/Wartung-(?:Geraet|Gerät)-ID:\s*[A-Za-z0-9-]+/gi,' ')
    .replace(/Geräte-ID:\s*\d+/gi,' ')
    .replace(/\s+/g,' ').trim();
  return s;
}
function internalId50(v){const m=String(v||'').match(/Geräte-ID:\s*(\d+)/i);return m?m[1]:'';}

/* Mitarbeiterkalender: ausschließlich lesbarer Auftragstext + sichtbare Geräte-ID. */
const renderCal50=window.renderCalendarEvents;
if(typeof renderCal50==='function')window.renderCalendarEvents=function(events){
  const clean=(Array.isArray(events)?events:[]).map(e=>{
    const raw=String(e.description||'');
    return Object.assign({},e,{description:cleanCalendarText50(raw),internalDeviceId:e.internalDeviceId||internalId50(raw)});
  });
  const r=renderCal50.call(this,clean);
  window.__dgCalendarEvents=clean;
  [...document.querySelectorAll('#calendarEvents .entry')].forEach((card,i)=>{
    const e=clean[i];if(!e||!e.internalDeviceId||card.querySelector('.d50-device-badge'))return;
    const b=document.createElement('div');b.className='d50-device-badge';b.textContent='Geräte-ID '+e.internalDeviceId;const strong=card.querySelector('strong');(strong||card).insertAdjacentElement(strong?'afterend':'afterbegin',b);
  });
  return r;
};

/* Wartungskunden: neuer Reiter "Alle Kunden" mit alphabetischem Bestand. */
function ensureAllCustomers50(){
  const nav=$('d37MaintenanceNav');if(!nav||$('d50AllCustomersBtn'))return;
  const b=document.createElement('button');b.type='button';b.id='d50AllCustomersBtn';b.dataset.tab='all';b.textContent='Alle Kunden';b.onclick=()=>d50OpenAllCustomers();nav.appendChild(b);
  const panel=document.createElement('div');panel.id='d50MaintenanceAll';panel.className='d37-maint-panel hidden';nav.parentElement.appendChild(panel);
}
window.d50OpenAllCustomers=async function(){
  ensureAllCustomers50();document.querySelectorAll('#d37MaintenanceNav [data-tab]').forEach(b=>b.classList.toggle('active',b.dataset.tab==='all'));
  document.querySelectorAll('#d37MaintenanceOverview,#d37MaintenanceCreate,#d37MaintenanceManage,#d37MaintenanceArchive,#d50MaintenanceAll').forEach(p=>p.classList.toggle('hidden',p.id!=='d50MaintenanceAll'));
  const host=$('d50MaintenanceAll');if(!host)return false;
  host.innerHTML='<div class="status info">Bestandskunden werden geladen …</div>';
  try{
    const rows=await api(chefPayload({action:'searchMaintenanceCustomers',query:''}));
    const sorted=(rows||[]).slice().sort((a,b)=>String(a.name||'').localeCompare(String(b.name||''),'de',{sensitivity:'base'}));
    host.innerHTML='<h3>Alle Wartungskunden ('+sorted.length+')</h3>'+(sorted.map(x=>'<button type="button" class="d50-customer-row" data-id="'+esc50(x.id)+'"><strong>'+esc50(x.name)+'</strong><span>'+Number(x.objectCount||0)+' Objekt(e) · '+Number(x.deviceCount||0)+' Gerät(e)</span><small>'+esc50(x.billingCity||'')+'</small></button>').join('')||'<div class="status ok">Noch keine Wartungskunden angelegt.</div>');
    host.querySelectorAll('.d50-customer-row').forEach(btn=>btn.onclick=async()=>{window.d37MaintenanceTab('manage');await window.d37OpenCustomer(btn.dataset.id);});
  }catch(e){host.innerHTML='<div class="status error">'+esc50(e.message)+'</div>';}
  return false;
};
const tab50=window.d37MaintenanceTab;
if(typeof tab50==='function')window.d37MaintenanceTab=function(tab){ensureAllCustomers50();if(tab==='all')return d50OpenAllCustomers();return tab50.apply(this,arguments);};

/* Büro-Regiebericht: Wartungs-Kontext vollständig und lesbar. */
window.d3Single=d3Single=function(r){
  const task=cleanCalendarText50(r.activity||'');
  let h='<div class="entry"><strong>'+esc(formatDateDE(r.date))+' - '+esc(r.employee)+' - '+formatHours(r.hours)+' Std.</strong><div>'+esc(r.start)+' - '+esc(r.end)+'</div><div>'+esc(task)+'</div>';
  if(r.maintenance){
    h+='<div class="d50-maint-report">';
    if(r.nextMaintenanceDue)h+='<div class="status ok"><strong>Nächste Wartung fällig:</strong> '+esc50(due50(r.nextMaintenanceDue))+'</div>';
    if(r.internalDeviceId)h+='<div><strong>Geräte-ID:</strong> '+esc50(r.internalDeviceId)+'</div>';
    if(r.billingName)h+='<div><strong>Rechnungsempfänger:</strong> '+esc50(r.billingName)+' · '+esc50([r.billingStreet,[r.billingZip,r.billingCity].filter(Boolean).join(' ')].filter(Boolean).join(', '))+'</div>';
    if(r.billingEmail||r.billingPhone)h+='<div class="report-meta">'+[r.billingEmail?('E-Mail: '+esc50(r.billingEmail)):'',r.billingPhone?('Telefon: '+esc50(r.billingPhone)):''].filter(Boolean).join(' · ')+'</div>';
    if(r.executionAddress)h+='<div><strong>Ausführungsort:</strong> '+esc50(r.executionObjectName||'')+(r.executionObjectName?' · ':'')+esc50(r.executionAddress)+'</div>';
    h+='</div>';
  }
  if(r.materialUsed)h+='<div>Material: '+esc(r.material)+'</div>';
  if(r.isSupplement)h+='<div class="status info">Nachtrag '+esc(r.supplementCreatedAt||'')+'</div>';
  return h+'</div>';
};

/* Auto-Sync: nie offene Bürobereiche/Formulare neu rendern. Nur Zähler aktualisieren. */
window.d3Sync=d3Sync=async function(){
  if(DG3.syncing||DG3.pending||document.hidden||!navigator.onLine||!DG3.ready||!auth().employee||d3Dirty())return;
  DG3.syncing=true;
  try{
    await syncQueue(false);
    if(d3Visible($('employeeView'))){await loadDay();await loadCalendarEvents();}
    else await d3Dashboard();
    if($('d3Sync'))$('d3Sync').textContent='Zuletzt aktualisiert: '+new Date().toLocaleTimeString('de-DE')+' · offene Auswahlbereiche bleiben unverändert.';
  }catch(e){if($('d3Sync'))$('d3Sync').textContent='Aktualisierung fehlgeschlagen: '+e.message;}
  finally{DG3.syncing=false;}
};

try{DG3.version=V;window.DG_APP_VERSION=V;}catch(_e){}
const oldOpenMain50=window.openMain;
if(typeof oldOpenMain50==='function')window.openMain=function(){const r=oldOpenMain50.apply(this,arguments);setTimeout(ensureAllCustomers50,200);return r;};
const oldOpen50=window.d3Open;
if(typeof oldOpen50==='function')window.d3Open=function(){const r=oldOpen50.apply(this,arguments);setTimeout(ensureAllCustomers50,0);return r;};
})();

/* DG 5.0: final maintenance UX, clean calendar text, customer master list, stable refresh */
(function(){
'use strict';
const V='5.0';
const esc50=v=>String(v==null?'':v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const months50=['Januar','Februar','März','April','Mai','Juni','Juli','August','September','Oktober','November','Dezember'];
function due50(v){const m=/^(\d{4})-(\d{2})$/.exec(String(v||''));return m?months50[Number(m[2])-1]+' '+m[1]:String(v||'');}
function cleanCalendarText50(v){
  let s=String(v||'').replace(/\r/g,'\n');
  s=s.replace(/Terminart:\s*(?:Wartung|Auftrag)/gi,' ')
    .replace(/Was ist zu tun:\s*/gi,' ')
    .replace(/DG-Termin-ID:\s*[A-Za-z0-9@._-]+/gi,' ')
    .replace(/Wartung-Kunden-ID:\s*[A-Za-z0-9-]+/gi,' ')
    .replace(/Wartung-Objekt-ID:\s*[A-Za-z0-9-]+/gi,' ')
    .replace(/Wartung-(?:Geraet|Gerät)-ID:\s*[A-Za-z0-9-]+/gi,' ')
    .replace(/Geräte-ID:\s*\d+/gi,' ')
    .replace(/\s+/g,' ').trim();
  return s;
}
function internalId50(v){const m=String(v||'').match(/Geräte-ID:\s*(\d+)/i);return m?m[1]:'';}

/* Mitarbeiterkalender: ausschließlich lesbarer Auftragstext + sichtbare Geräte-ID. */
const renderCal50=window.renderCalendarEvents;
if(typeof renderCal50==='function')window.renderCalendarEvents=function(events){
  const clean=(Array.isArray(events)?events:[]).map(e=>{
    const raw=String(e.description||'');
    return Object.assign({},e,{description:cleanCalendarText50(raw),internalDeviceId:e.internalDeviceId||internalId50(raw)});
  });
  const r=renderCal50.call(this,clean);
  window.__dgCalendarEvents=clean;
  [...document.querySelectorAll('#calendarEvents .entry')].forEach((card,i)=>{
    const e=clean[i];if(!e||!e.internalDeviceId||card.querySelector('.d50-device-badge'))return;
    const b=document.createElement('div');b.className='d50-device-badge';b.textContent='Geräte-ID '+e.internalDeviceId;const strong=card.querySelector('strong');(strong||card).insertAdjacentElement(strong?'afterend':'afterbegin',b);
  });
  return r;
};

/* Wartungskunden: neuer Reiter "Alle Kunden" mit alphabetischem Bestand. */
function ensureAllCustomers50(){
  const nav=$('d37MaintenanceNav');if(!nav||$('d50AllCustomersBtn'))return;
  const b=document.createElement('button');b.type='button';b.id='d50AllCustomersBtn';b.dataset.tab='all';b.textContent='Alle Kunden';b.onclick=()=>d50OpenAllCustomers();nav.appendChild(b);
  const panel=document.createElement('div');panel.id='d50MaintenanceAll';panel.className='d37-maint-panel hidden';nav.parentElement.appendChild(panel);
}
window.d50OpenAllCustomers=async function(){
  ensureAllCustomers50();document.querySelectorAll('#d37MaintenanceNav [data-tab]').forEach(b=>b.classList.toggle('active',b.dataset.tab==='all'));
  document.querySelectorAll('#d37MaintenanceOverview,#d37MaintenanceCreate,#d37MaintenanceManage,#d37MaintenanceArchive,#d50MaintenanceAll').forEach(p=>p.classList.toggle('hidden',p.id!=='d50MaintenanceAll'));
  const host=$('d50MaintenanceAll');if(!host)return false;
  host.innerHTML='<div class="status info">Bestandskunden werden geladen …</div>';
  try{
    const rows=await api(chefPayload({action:'searchMaintenanceCustomers',query:''}));
    const sorted=(rows||[]).slice().sort((a,b)=>String(a.name||'').localeCompare(String(b.name||''),'de',{sensitivity:'base'}));
    host.innerHTML='<h3>Alle Wartungskunden ('+sorted.length+')</h3>'+(sorted.map(x=>'<button type="button" class="d50-customer-row" data-id="'+esc50(x.id)+'"><strong>'+esc50(x.name)+'</strong><span>'+Number(x.objectCount||0)+' Objekt(e) · '+Number(x.deviceCount||0)+' Gerät(e)</span><small>'+esc50(x.billingCity||'')+'</small></button>').join('')||'<div class="status ok">Noch keine Wartungskunden angelegt.</div>');
    host.querySelectorAll('.d50-customer-row').forEach(btn=>btn.onclick=async()=>{window.d37MaintenanceTab('manage');await window.d37OpenCustomer(btn.dataset.id);});
  }catch(e){host.innerHTML='<div class="status error">'+esc50(e.message)+'</div>';}
  return false;
};
const tab50=window.d37MaintenanceTab;
if(typeof tab50==='function')window.d37MaintenanceTab=function(tab){ensureAllCustomers50();if(tab==='all')return d50OpenAllCustomers();return tab50.apply(this,arguments);};

/* Büro-Regiebericht: Wartungs-Kontext vollständig und lesbar. */
window.d3Single=d3Single=function(r){
  const task=cleanCalendarText50(r.activity||'');
  let h='<div class="entry"><strong>'+esc(formatDateDE(r.date))+' - '+esc(r.employee)+' - '+formatHours(r.hours)+' Std.</strong><div>'+esc(r.start)+' - '+esc(r.end)+'</div><div>'+esc(task)+'</div>';
  if(r.maintenance){
    h+='<div class="d50-maint-report">';
    if(r.nextMaintenanceDue)h+='<div class="status ok"><strong>Nächste Wartung fällig:</strong> '+esc50(due50(r.nextMaintenanceDue))+'</div>';
    if(r.internalDeviceId)h+='<div><strong>Geräte-ID:</strong> '+esc50(r.internalDeviceId)+'</div>';
    if(r.billingName)h+='<div><strong>Rechnungsempfänger:</strong> '+esc50(r.billingName)+' · '+esc50([r.billingStreet,[r.billingZip,r.billingCity].filter(Boolean).join(' ')].filter(Boolean).join(', '))+'</div>';
    if(r.billingEmail||r.billingPhone)h+='<div class="report-meta">'+[r.billingEmail?('E-Mail: '+esc50(r.billingEmail)):'',r.billingPhone?('Telefon: '+esc50(r.billingPhone)):''].filter(Boolean).join(' · ')+'</div>';
    if(r.executionAddress)h+='<div><strong>Ausführungsort:</strong> '+esc50(r.executionObjectName||'')+(r.executionObjectName?' · ':'')+esc50(r.executionAddress)+'</div>';
    h+='</div>';
  }
  if(r.materialUsed)h+='<div>Material: '+esc(r.material)+'</div>';
  if(r.isSupplement)h+='<div class="status info">Nachtrag '+esc(r.supplementCreatedAt||'')+'</div>';
  return h+'</div>';
};

/* Auto-Sync: nie offene Bürobereiche/Formulare neu rendern. Nur Zähler aktualisieren. */
window.d3Sync=d3Sync=async function(){
  if(DG3.syncing||DG3.pending||document.hidden||!navigator.onLine||!DG3.ready||!auth().employee||d3Dirty())return;
  DG3.syncing=true;
  try{
    await syncQueue(false);
    if(d3Visible($('employeeView'))){await loadDay();await loadCalendarEvents();}
    else await d3Dashboard();
    if($('d3Sync'))$('d3Sync').textContent='Zuletzt aktualisiert: '+new Date().toLocaleTimeString('de-DE')+' · offene Auswahlbereiche bleiben unverändert.';
  }catch(e){if($('d3Sync'))$('d3Sync').textContent='Aktualisierung fehlgeschlagen: '+e.message;}
  finally{DG3.syncing=false;}
};

/* Finaler 5.0-Backendcheck: überschreibt die alte 3.x-Kompatibilitätsprüfung aus dem Altbestand. */
window.d3CheckBackend=d3CheckBackend=async function(){
  try{
    const r=await api({action:'ping'}),found=String(r&&r.version||''),ok=/^5(?:\.|$)/.test(found);
    DG3.backend=ok?found:'';
    if(!ok)d3Notice('App 5.0 benötigt Google-GS 5.0. Gefunden: '+(found||'unbekannt')+'. Speichern ist gesperrt.','warn');
    else $('d3Notice')?.remove();
    return ok;
  }catch(e){
    DG3.backend='';
    d3Notice('Verbindungsprüfung fehlgeschlagen: '+e.message,'warn');
    return false;
  }
};

try{DG3.version=V;window.DG_APP_VERSION=V;}catch(_e){}
const oldOpenMain50=window.openMain;
if(typeof oldOpenMain50==='function')window.openMain=function(){const r=oldOpenMain50.apply(this,arguments);setTimeout(ensureAllCustomers50,200);return r;};
const oldOpen50=window.d3Open;
if(typeof oldOpen50==='function')window.d3Open=function(){const r=oldOpen50.apply(this,arguments);setTimeout(ensureAllCustomers50,0);return r;};
})();

/* DG 5.0.1: Wartungsgeraete bekommen Bilder und Dateien/Wartungsberichte. */
(function(){
'use strict';
const V501='5.0.1';
const F501=window.DG501Files=window.DG501Files||{pending:{},saved:{}};
const esc501=v=>String(v==null?'':v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const safeKey501=v=>String(v||'').replace(/[^A-Za-z0-9_-]/g,'');
function clientKey501(){return 'mf-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,10);}
function humanSize501(n){n=Number(n)||0;if(n<1024)return n+' B';if(n<1024*1024)return (n/1024).toFixed(1).replace('.',',')+' KB';return (n/1024/1024).toFixed(1).replace('.',',')+' MB';}
function fileClientId501(){return 'MA-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,12);}
function findDevice501(key){return document.querySelector('.d37-device[data-d501-key="'+CSS.escape(String(key))+'"]');}
function savedRows501(key){return Array.isArray(F501.saved[key])?F501.saved[key]:[];}
function pendingRows501(key){return Array.isArray(F501.pending[key])?F501.pending[key]:[];}
function attachmentRows501(key){
  const saved=savedRows501(key),pending=pendingRows501(key);
  const rows=saved.map(a=>'<div class="d501-file-row saved" data-attachment-id="'+esc501(a.id||'')+'"><div class="d501-file-main"><strong>'+(a.kind==='Bild'?'🖼️':'📄')+' '+esc501(a.name||'Datei')+'</strong><span>'+esc501(a.mime||'')+(a.size?' · '+esc501(humanSize501(a.size)):'')+(a.createdAt?' · '+esc501(a.createdAt):'')+'</span></div><div class="d501-file-actions"><button type="button" class="btn secondary d37-mini" onclick="return d501OpenMaintenanceFile(\''+esc501(a.id||'')+'\')">Öffnen</button><button type="button" class="btn danger d37-mini" onclick="return d501DeleteMaintenanceFile(\''+esc501(a.id||'')+'\',\''+esc501(key)+'\')">Löschen</button></div></div>').join('');
  const waiting=pending.map((a,i)=>'<div class="d501-file-row pending"><div class="d501-file-main">'+(a.kind==='Bild'&&a.dataUrl?'<img class="d501-thumb" src="'+esc501(a.dataUrl)+'" alt="Vorschau">':'')+'<strong>'+(a.kind==='Bild'?'🖼️':'📄')+' '+esc501(a.name||'Datei')+'</strong><span>'+esc501(humanSize501(a.size))+' · wird mit „Kundendaten speichern“ hochgeladen</span></div><div class="d501-file-actions"><button type="button" class="btn danger d37-mini" onclick="return d501RemovePending(\''+esc501(key)+'\','+i+')">Entfernen</button></div></div>').join('');
  return rows+waiting||'<div class="muted small">Noch keine Bilder oder Dateien am Gerät hinterlegt.</div>';
}
function renderBox501(key){const box=document.querySelector('.d501-attachments[data-key="'+CSS.escape(String(key))+'"] .d501-file-list');if(box)box.innerHTML=attachmentRows501(key);}
function section501(key){const k=esc501(key);return '<div class="d501-attachments" data-key="'+k+'"><div class="d37-section-label">Gerätebilder &amp; Unterlagen / Wartungsberichte</div><div class="muted small">Bilder, PDFs und weitere Unterlagen werden dauerhaft diesem Gerät und seiner Geräte-ID zugeordnet.</div><div class="button-row d501-upload-actions"><button type="button" class="btn secondary" onclick="document.getElementById(\'d501img-'+k+'\').click()">🖼️ Bilder hinzufügen</button><button type="button" class="btn secondary" onclick="document.getElementById(\'d501file-'+k+'\').click()">📎 Dateien hinzufügen</button></div><input id="d501img-'+k+'" class="hidden" type="file" accept="image/*" multiple onchange="d501FilesChosen(this,\''+k+'\',\'Bild\')"><input id="d501file-'+k+'" class="hidden" type="file" multiple onchange="d501FilesChosen(this,\''+k+'\',\'Datei\')"><div class="d501-file-list">'+attachmentRows501(key)+'</div><div class="d501-file-status"></div></div>';
}

const blank501=window.d37BlankDevice;
if(typeof blank501==='function')window.d37BlankDevice=d37BlankDevice=function(){const d=blank501.apply(this,arguments);d._uploadKey=clientKey501();d.newAttachments=[];return d;};

const deviceHtml501=window.d37DeviceHtml;
if(typeof deviceHtml501==='function')window.d37DeviceHtml=d37DeviceHtml=function(d,oi,di){
  d=d||{};const key=safeKey501(d.id||d._uploadKey||clientKey501());d._uploadKey=key;
  F501.saved[key]=Array.isArray(d.attachments)?d.attachments.slice():savedRows501(key);
  if(Array.isArray(d.newAttachments)&&d.newAttachments.length&&!pendingRows501(key).length)F501.pending[key]=d.newAttachments.slice();
  let h=deviceHtml501.call(this,d,oi,di);
  h=h.replace('<div class="d37-device"','<div class="d37-device" data-d501-key="'+esc501(key)+'"');
  const pos=h.lastIndexOf('</div>');if(pos>=0)h=h.slice(0,pos)+section501(key)+h.slice(pos);
  return h;
};

const collect501=window.d37CollectCustomer;
if(typeof collect501==='function')window.d37CollectCustomer=d37CollectCustomer=function(validate,root){
  root=root||document.querySelector('#d37MaintenanceManage:not(.hidden) .d37-customer-form')||document.querySelector('#d37MaintenanceCreate:not(.hidden) .d37-customer-form')||document.querySelector('.d37-customer-form');
  const c=collect501.call(this,validate,root);if(!c||!root)return c;
  [...root.querySelectorAll('.d37-object')].forEach((or,oi)=>{
    [...or.querySelectorAll(':scope > .d37-devices > .d37-device')].forEach((dr,di)=>{
      const d=c.objects&&c.objects[oi]&&c.objects[oi].devices?c.objects[oi].devices[di]:null;if(!d)return;
      const key=safeKey501(dr.dataset.d501Key||d.id||clientKey501());d._uploadKey=key;d.newAttachments=pendingRows501(key).map(a=>Object.assign({},a));
    });
  });
  return c;
};

function readDataUrl501(file){return new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(String(r.result||''));r.onerror=()=>reject(new Error('Datei konnte nicht gelesen werden.'));r.readAsDataURL(file);});}
function loadImage501(dataUrl){return new Promise((resolve,reject)=>{const img=new Image();img.onload=()=>resolve(img);img.onerror=()=>reject(new Error('Bild konnte nicht verarbeitet werden.'));img.src=dataUrl;});}
async function prepareImage501(file){
  const raw=await readDataUrl501(file);const img=await loadImage501(raw);const max=1800,scale=Math.min(1,max/Math.max(img.naturalWidth||img.width,img.naturalHeight||img.height));if(scale>=0.999&&file.size<=3*1024*1024)return{dataUrl:raw,mime:file.type||'image/jpeg'};
  const c=document.createElement('canvas');c.width=Math.max(1,Math.round((img.naturalWidth||img.width)*scale));c.height=Math.max(1,Math.round((img.naturalHeight||img.height)*scale));c.getContext('2d').drawImage(img,0,0,c.width,c.height);return{dataUrl:c.toDataURL('image/jpeg',0.84),mime:'image/jpeg'};
}
window.d501FilesChosen=async function(input,key,kind){
  key=safeKey501(key);const card=findDevice501(key),status=card&&card.querySelector('.d501-file-status'),files=[...(input.files||[])];input.value='';if(!files.length)return false;
  try{
    if(status){status.className='status info d501-file-status';status.textContent='Dateien werden vorbereitet …';}
    const pending=pendingRows501(key).slice();let currentBytes=pending.reduce((n,x)=>n+(Number(x.size)||0),0);
    for(const file of files){
      if(file.size>12*1024*1024)throw new Error(file.name+': maximal 12 MB pro Datei.');
      if(currentBytes+file.size>25*1024*1024)throw new Error('Maximal 25 MB neue Geräteunterlagen pro Speichervorgang.');
      let dataUrl,mime=file.type||'application/octet-stream';if(kind==='Bild'){if(!/^image\//i.test(mime))throw new Error(file.name+': keine Bilddatei.');const p=await prepareImage501(file);dataUrl=p.dataUrl;mime=p.mime;}else dataUrl=await readDataUrl501(file);
      pending.push({clientId:fileClientId501(),kind:kind,name:file.name||((kind==='Bild'?'Bild':'Datei')+'_'+(pending.length+1)),mime:mime,size:file.size||0,dataUrl:dataUrl});currentBytes+=file.size||0;
    }
    F501.pending[key]=pending;renderBox501(key);if(status){status.className='status ok d501-file-status';status.textContent='✓ '+files.length+' Datei(en) vorbereitet. Bitte Kundendaten speichern.';}
  }catch(e){if(status){status.className='status error d501-file-status';status.textContent=e.message;}else alert(e.message);}
  return false;
};
window.d501RemovePending=function(key,index){key=safeKey501(key);const a=pendingRows501(key).slice();a.splice(Number(index),1);F501.pending[key]=a;renderBox501(key);return false;};
window.d501OpenMaintenanceFile=async function(id){
  if(!id)return false;try{const r=await api(chefPayload({action:'getMaintenanceAttachment',id:id})),bytes=Uint8Array.from(atob(r.base64||''),c=>c.charCodeAt(0)),blob=new Blob([bytes],{type:r.mime||'application/octet-stream'}),url=URL.createObjectURL(blob);if(/^image\//i.test(r.mime||'')||String(r.mime||'').toLowerCase()==='application/pdf'){window.open(url,'_blank','noopener');setTimeout(()=>URL.revokeObjectURL(url),60000);}else{const a=document.createElement('a');a.href=url;a.download=r.name||'Datei';document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),30000);}}catch(e){alert('Datei konnte nicht geöffnet werden: '+e.message);}return false;
};
window.d501DeleteMaintenanceFile=async function(id,key){
  if(!id||!confirm('Diese Geräteunterlage wirklich löschen?'))return false;try{await api(chefPayload({action:'deleteMaintenanceAttachment',id:id}));key=safeKey501(key);F501.saved[key]=savedRows501(key).filter(x=>String(x.id)!==String(id));if(window.DG37&&DG37.customer){(DG37.customer.objects||[]).forEach(o=>(o.devices||[]).forEach(d=>{if(String(d.id||d._uploadKey)===key)d.attachments=(d.attachments||[]).filter(x=>String(x.id)!==String(id));}));}renderBox501(key);}catch(e){alert('Unterlage konnte nicht gelöscht werden: '+e.message);}return false;
};

const api501=window.api;
if(typeof api501==='function')window.api=api=async function(payload){const r=await api501.apply(this,arguments);if(payload&&payload.action==='saveMaintenanceCustomer'){F501.pending={};F501.saved={};}return r;};

/* Patchstand eindeutig erkennen. */
window.d3CheckBackend=d3CheckBackend=async function(){
  try{const r=await api({action:'ping'}),found=String(r&&r.version||''),p=found.split('.').map(Number),ok=p[0]===5&&(p[1]>0||(p[1]===0&&p[2]>=1));DG3.backend=ok?found:'';if(!ok)d3Notice('App 5.2.5 benötigt Google-GS 5.2.0.2.2 oder neuer. Gefunden: '+(found||'unbekannt')+'. Speichern ist gesperrt.','warn');else $('d3Notice')?.remove();return ok;}catch(e){DG3.backend='';d3Notice('Verbindungsprüfung fehlgeschlagen: '+e.message,'warn');return false;}
};
try{DG3.version=V501;window.DG_APP_VERSION=V501;}catch(_e){}
})();

/* DG 5.0.2: stabiles Unterschriftenfeld ohne Scroll-/Sprung beim Loslassen. */
(function(){
'use strict';
const V502='5.0.2';

/*
 * Das bisherige Pad mischte Touch- und Mausereignisse und beendete Touch nur
 * direkt auf dem Canvas. Auf Mobilgeraeten kann touchend/cancel ausserhalb des
 * Canvas landen bzw. ein synthetisches Click ausloesen. Die neue Variante
 * benutzt Pointer Events mit Pointer Capture. Waehrend einer Unterschrift
 * gehoert der aktive Pointer damit bis zum Ende dem Canvas. Kein Fokuswechsel,
 * kein synthetischer Klick und kein Browser-Scroll innerhalb des Pads.
 */
window.initPad=initPad=function(id){
  const canvas=$(id),ctx=canvas.getContext('2d'),wrap=$(id+'Wrap');
  let drawing=false,signed=false,active=false,lastTap=0,activePointer=null;
  function setActive(v){active=!!v;if(wrap)wrap.classList.toggle('active',active);canvas.style.touchAction=active?'none':'auto';}
  function resize(){
    const ratio=devicePixelRatio||1,rect=canvas.getBoundingClientRect(),old=signed?canvas.toDataURL('image/png'):'';
    canvas.width=Math.max(1,Math.round(rect.width*ratio));canvas.height=Math.round(180*ratio);
    ctx.setTransform(ratio,0,0,ratio,0,0);ctx.lineWidth=2;ctx.lineCap='round';ctx.lineJoin='round';ctx.strokeStyle='#111827';
    if(old){const img=new Image();img.onload=()=>ctx.drawImage(img,0,0,rect.width,180);img.src=old;}
  }
  function point(ev){const r=canvas.getBoundingClientRect();return{x:ev.clientX-r.left,y:ev.clientY-r.top};}
  function start(ev){
    if(!active||drawing||ev.isPrimary===false)return;
    ev.preventDefault();ev.stopPropagation();
    drawing=true;signed=true;activePointer=ev.pointerId;
    try{canvas.setPointerCapture(ev.pointerId);}catch(_e){}
    const p=point(ev);ctx.beginPath();ctx.moveTo(p.x,p.y);ctx.lineTo(p.x+.01,p.y+.01);ctx.stroke();
  }
  function move(ev){
    if(!drawing||!active||ev.pointerId!==activePointer)return;
    ev.preventDefault();ev.stopPropagation();const p=point(ev);ctx.lineTo(p.x,p.y);ctx.stroke();
  }
  function finish(ev){
    if(!drawing||ev.pointerId!==activePointer)return;
    ev.preventDefault();ev.stopPropagation();drawing=false;
    try{if(canvas.hasPointerCapture(ev.pointerId))canvas.releasePointerCapture(ev.pointerId);}catch(_e){}
    activePointer=null;
  }
  canvas.addEventListener('pointerdown',start,{passive:false});
  canvas.addEventListener('pointermove',move,{passive:false});
  canvas.addEventListener('pointerup',finish,{passive:false});
  canvas.addEventListener('pointercancel',finish,{passive:false});
  canvas.addEventListener('lostpointercapture',ev=>{if(drawing&&ev.pointerId===activePointer){drawing=false;activePointer=null;}},{passive:true});
  canvas.addEventListener('contextmenu',ev=>ev.preventDefault());
  canvas.addEventListener('dragstart',ev=>ev.preventDefault());

  if(wrap){
    const lock=wrap.querySelector('.signature-lock');
    const unlock=ev=>{ev.preventDefault();ev.stopPropagation();setActive(true);lastTap=0;};
    const tap=ev=>{
      ev.preventDefault();ev.stopPropagation();const now=Date.now();
      if(ev.type==='dblclick'||now-lastTap<550)unlock(ev);else lastTap=now;
    };
    lock.addEventListener('dblclick',unlock,{passive:false});
    lock.addEventListener('pointerup',tap,{passive:false});
  }
  resize();setActive(false);
  return{
    resize,
    lock(){drawing=false;activePointer=null;setActive(false);},
    clear(){drawing=false;activePointer=null;ctx.clearRect(0,0,canvas.getBoundingClientRect().width,180);signed=false;setActive(false);},
    hasSignature(){return signed;},
    dataUrl(){return signed?canvas.toDataURL('image/png'):'';}
  };
};

/* Doppelte/synthetische Clicks im aktiven Unterschriftenbereich abfangen. */
document.addEventListener('click',ev=>{const wrap=ev.target&&ev.target.closest?ev.target.closest('.signature-wrap.active'):null;if(wrap){ev.preventDefault();ev.stopPropagation();}},true);
try{DG3.version=V502;window.DG_APP_VERSION=V502;}catch(_e){}
})();

/* DG 5.0.3: Kunde/Baustelle eines Regieberichts im Büro gezielt korrigieren. */
(function(){
'use strict';
const V503='5.0.3';

function editModalTitle503(text){
  const h=document.querySelector('#dgRegieEditModal .dg-v45-card h2');
  if(h)h.textContent=text;
}
function selectModalTitle503(text,sub){
  const card=document.querySelector('#dgRegieSelectModal .dg-v45-card');
  if(!card)return;
  const h=card.querySelector('h2');if(h)h.textContent=text;
  const m=card.querySelector('.muted');if(m)m.textContent=sub||'';
}
function focusCustomer503(){
  const input=$('dgEditCustomer');
  if(!input)return;
  input.classList.add('dg503-customer-focus');
  input.focus();
  input.select();
  const st=$('dgEditStatus');
  if(st){st.className='status info';st.textContent='Kunde / Baustelle korrigieren und anschließend „Änderungen speichern“ drücken. Zeiten, Tätigkeit, Bilder und Unterschrift bleiben erhalten.';}
}

const baseOpenEdit503=window.dgOpenRegieEdit;
if(typeof baseOpenEdit503==='function'){
  window.dgOpenRegieEdit=function(id){
    editModalTitle503('Regiebericht bearbeiten');
    const r=baseOpenEdit503.call(this,id);
    const input=$('dgEditCustomer');if(input)input.classList.remove('dg503-customer-focus');
    return r;
  };
}

window.dgOpenCustomerCorrection=function(id){
  if(typeof baseOpenEdit503!=='function')return false;
  editModalTitle503('Kunde / Baustelle korrigieren');
  baseOpenEdit503.call(window,id);
  setTimeout(focusCustomer503,0);
  return false;
};

window.dgRequestCustomerCorrection=function(key){
  const ids=window.__dgGroupMap&&window.__dgGroupMap[key]||[];
  if(!ids.length){setMessage('regieStatus','Kein bearbeitbarer Einzelbericht gefunden.','error');return false;}
  if(ids.length===1)return window.dgOpenCustomerCorrection(ids[0]);
  const list=$('dgRegieSelectList');
  if(!list)return false;
  selectModalTitle503('Kunde / Baustelle korrigieren','Bitte den Einzelbericht auswählen, der dem falschen Kunden zugeordnet wurde.');
  list.innerHTML=ids.map(id=>{const r=window.__dgReportMap&&window.__dgReportMap[id]||{};return '<div class="dg-v45-choice"><div><strong>'+formatDateDE(r.date||'')+' · '+esc(r.employee||'')+' · '+formatHours(r.hours||0)+' Std.</strong><div class="report-meta">Aktuell: '+esc(r.customer||'')+'</div><div>'+esc(r.activity||'')+'</div></div><button class="btn primary" data-id="'+esc(id)+'">Kunde korrigieren</button></div>';}).join('');
  list.querySelectorAll('button[data-id]').forEach(b=>b.onclick=()=>{window.dgCloseRegieSelect();window.dgOpenCustomerCorrection(b.dataset.id);});
  $('dgRegieSelectModal').classList.remove('hidden');
  return false;
};

const baseGroupEdit503=window.dgRequestGroupEdit;
if(typeof baseGroupEdit503==='function')window.dgRequestGroupEdit=function(key){
  selectModalTitle503('Bericht bearbeiten','Bitte den Einzelbericht auswählen.');
  return baseGroupEdit503.call(this,key);
};

const baseReportCard503=window.d3ReportCard||window.d3ReportCard;
if(typeof baseReportCard503==='function'){
  window.d3ReportCard=d3ReportCard=function(g,view,index){
    const card=baseReportCard503.call(this,g,view,index);
    if(view!=='Abgerechnet'){
      const actions=card&&card.querySelector('.report-actions');
      if(actions&&!actions.querySelector('.dg503-correct-customer')){
        const btn=document.createElement('button');
        btn.type='button';btn.className='btn secondary dg503-correct-customer';btn.textContent='Kunde korrigieren';
        btn.addEventListener('click',()=>window.dgRequestCustomerCorrection(view+':'+index));
        actions.prepend(btn);
      }
    }
    return card;
  };
}

try{DG3.version=V503;window.DG_APP_VERSION=V503;}catch(_e){}
})();

/* DG 5.0.4: Wartungsvertrag - Ausführungsort aus Kundendaten übernehmen. */
(function(){
'use strict';
const V504='5.0.4';

function f504(root,key){return root?root.querySelector('[data-d37="'+key+'"]'):null;}
function norm504(v){return String(v==null?'':v).trim().toLocaleLowerCase('de-DE');}
function same504(a,b){return norm504(a)===norm504(b);}
function summary504(form){
  const name=f504(form,'customerName')?.value||'';
  const street=f504(form,'billingStreet')?.value||'';
  const zip=f504(form,'billingZip')?.value||'';
  const city=f504(form,'billingCity')?.value||'';
  return [name,street,[zip,city].filter(Boolean).join(' ')].filter(Boolean).join(' · ')||'Daten werden aus Punkt 1 übernommen.';
}
function copy504(form,obj){
  if(!form||!obj)return;
  [['customerName','objectName'],['billingStreet','street'],['billingZip','zip'],['billingCity','city']].forEach(([src,dst])=>{
    const a=f504(form,src),b=f504(obj,dst);if(a&&b)b.value=a.value||'';
  });
  const s=obj.querySelector('.d504-address-summary');if(s)s.textContent=summary504(form);
}
function setMode504(form,obj,checked){
  const cb=obj.querySelector('.d504-address-check');if(cb)cb.checked=!!checked;
  ['objectName','street','zip','city'].forEach(key=>{
    const input=f504(obj,key),box=input&&input.parentElement;if(box)box.classList.toggle('hidden',!!checked);
  });
  const s=obj.querySelector('.d504-address-summary');if(s)s.classList.toggle('hidden',!checked);
  if(checked)copy504(form,obj);
}
function infer504(modelCustomer,o,index){
  if(o&&typeof o._sameAsBilling==='boolean')return o._sameAsBilling;
  const blank=!String(o?.name||'').trim()&&!String(o?.street||'').trim()&&!String(o?.zip||'').trim()&&!String(o?.city||'').trim();
  if(blank)return index===0&&!String(modelCustomer?.id||'').trim();
  return same504(o?.name,modelCustomer?.name)&&same504(o?.street,modelCustomer?.billingStreet)&&same504(o?.zip,modelCustomer?.billingZip)&&same504(o?.city,modelCustomer?.billingCity);
}
function relabel504(form,key,text){
  const input=f504(form,key);if(!input)return;
  const label=input.previousElementSibling;if(label&&label.tagName==='LABEL')label.textContent=text;
}
function enhance504(hostId,modelCustomer){
  const host=$(hostId),form=host&&host.querySelector('.d37-customer-form');if(!form)return;

  /* Punkt 1 bewusst kurz halten. */
  relabel504(form,'billingStreet','Straße / Hausnummer');
  relabel504(form,'billingZip','PLZ');
  relabel504(form,'billingCity','Ort');

  [...form.querySelectorAll('.d37-object')].forEach((obj,index)=>{
    let row=obj.querySelector('.d504-address-toggle');
    if(!row){
      row=document.createElement('div');row.className='d504-address-toggle';
      row.innerHTML='<label class="d504-address-label"><input type="checkbox" class="d504-address-check" style="width:auto"> <strong>Ausführungsort entspricht Kundendaten</strong></label><div class="d504-address-summary status ok hidden"></div>';
      const head=obj.querySelector('.d37-subhead');if(head)head.insertAdjacentElement('afterend',row);else obj.prepend(row);
      row.querySelector('.d504-address-check').addEventListener('change',ev=>setMode504(form,obj,ev.target.checked));
    }
    const om=(modelCustomer&&Array.isArray(modelCustomer.objects))?modelCustomer.objects[index]:null;
    setMode504(form,obj,infer504(modelCustomer||{},om,index));
  });

  /* Ändert sich Punkt 1, werden angehakte Ausführungsorte live mitgeführt. */
  ['customerName','billingStreet','billingZip','billingCity'].forEach(key=>{
    const input=f504(form,key);if(!input||input.dataset.d504Bound==='1')return;
    input.dataset.d504Bound='1';input.addEventListener('input',()=>{
      form.querySelectorAll('.d37-object').forEach(obj=>{if(obj.querySelector('.d504-address-check')?.checked)copy504(form,obj);});
    });
  });
}

const render504=window.d37RenderCustomerForm;
if(typeof render504==='function')window.d37RenderCustomerForm=d37RenderCustomerForm=function(hostId,model,mode){
  const r=render504.apply(this,arguments);setTimeout(()=>enhance504(hostId,model),0);return r;
};

/* Vor dem Sammeln versteckte Felder mit Punkt 1 synchronisieren. */
const collect504=window.d37CollectCustomer;
if(typeof collect504==='function')window.d37CollectCustomer=d37CollectCustomer=function(validate,root){
  root=root||document.querySelector('#d37MaintenanceManage:not(.hidden) .d37-customer-form')||document.querySelector('#d37MaintenanceCreate:not(.hidden) .d37-customer-form')||document.querySelector('.d37-customer-form');
  if(root)root.querySelectorAll('.d37-object').forEach(obj=>{if(obj.querySelector('.d504-address-check')?.checked)copy504(root,obj);});
  const c=collect504.call(this,validate,root);
  if(c&&root){[...root.querySelectorAll('.d37-object')].forEach((obj,i)=>{if(c.objects&&c.objects[i])c.objects[i]._sameAsBilling=!!obj.querySelector('.d504-address-check')?.checked;});}
  return c;
};

try{DG3.version=V504;window.DG_APP_VERSION=V504;}catch(_e){}
})();

/* DG 5.0.5: ausgeführte Wartungen ohne bestehenden Wartungsvertrag manuell mitzählen. */
(function(){
'use strict';
const V505='5.0.5';
function ensureManualMaintenanceButton505(){
  const top=$('d39MaintenanceTop');if(!top)return;
  const stats=[...top.querySelectorAll('.d39-stat')];if(stats.length<2||stats[1].querySelector('.d505-manual-maint'))return;
  const b=document.createElement('button');b.type='button';b.className='btn secondary d505-manual-maint';b.textContent='+ manuell erfassen';b.onclick=()=>d505AddManualMaintenance();stats[1].appendChild(b);
}
window.d505AddManualMaintenance=function(){
  const today=typeof localDate==='function'?localDate():new Date().toISOString().slice(0,10);
  d3Form('Ausgeführte Wartungen manuell erfassen',[
    {name:'date',label:'Datum',type:'date',required:true},
    {name:'count',label:'Anzahl ausgeführter Wartungen',type:'number',required:true},
    {name:'note',label:'Vermerk (optional)',type:'textarea'}
  ],{date:today,count:'1',note:''},async v=>{
    const n=Math.floor(Number(v.count)||0);if(n<1||n>99)throw new Error('Bitte eine Anzahl zwischen 1 und 99 eintragen.');
    await api(chefPayload({action:'addManualMaintenanceCount',date:v.date,count:n,note:String(v.note||'').trim()}));
    if(window.DG38){DG38.loaded=false;DG38.overview=null;}
    if(window.DG37)DG37.overview=null;
    if(typeof window.d38RefreshMaintenance==='function')await window.d38RefreshMaintenance();
    else if(typeof window.d37LoadMaintenanceOverview==='function')await window.d37LoadMaintenanceOverview();
    ensureManualMaintenanceButton505();
  });
  const count=$('d3Field-count');if(count){count.min='1';count.max='99';count.step='1';}
  return false;
};

/* Button nach allen Stellen ergänzen, an denen die Jahresampeln neu aufgebaut werden. */
const load505=window.d37LoadMaintenanceOverview;
if(typeof load505==='function')window.d37LoadMaintenanceOverview=async function(){const r=await load505.apply(this,arguments);setTimeout(ensureManualMaintenanceButton505,0);return r;};
const openMain505=window.openMain;
if(typeof openMain505==='function')window.openMain=function(){const r=openMain505.apply(this,arguments);setTimeout(ensureManualMaintenanceButton505,300);return r;};
const open505=window.d3Open;
if(typeof open505==='function')window.d3Open=function(){const r=open505.apply(this,arguments);setTimeout(ensureManualMaintenanceButton505,50);return r;};

/* 5.0.5 benötigt für die dauerhafte manuelle Zählung GS 5.0.2+. */
window.d3CheckBackend=d3CheckBackend=async function(){
  try{const r=await api({action:'ping'}),found=String(r&&r.version||''),p=found.split('.').map(Number),ok=p[0]>5||(p[0]===5&&(p[1]>0||(p[1]===0&&p[2]>=2)));DG3.backend=ok?found:'';if(!ok)d3Notice('App 5.2.5 benötigt Google-GS 5.2.0.2.2 oder neuer. Gefunden: '+(found||'unbekannt')+'. Speichern ist gesperrt.','warn');else $('d3Notice')?.remove();return ok;}catch(e){DG3.backend='';d3Notice('Verbindungsprüfung fehlgeschlagen: '+e.message,'warn');return false;}
};
try{DG3.version=V505;window.DG_APP_VERSION=V505;}catch(_e){}
})();

/* DG 5.1: Performance-Layer ohne Funktionsaenderung. */
(function(){
'use strict';
const V51='5.1';
const PERF=window.DG51=window.DG51||{
  employeePromise:null,dayPromises:{},calendarPromise:null,dashboardPromise:null,readCache:new Map(),
  lastAutoSync:0,lastCalendarFetch:0,lastDayFetch:{},lastDashboardFetch:0,
  forceDay:false,forceCalendar:false,forceDashboard:false
};
const DAY_TTL=15000,CALENDAR_TTL=12000,DASHBOARD_TTL=90000,AUTO_SYNC_TTL=180000,EMPLOYEE_TTL=21600000,BACKEND_TTL=1800000;
const READ_TTL51={getRegieReports:15000,getOfferReports:20000,getOfferReminders:20000,getCustomerInquiries:20000,getBossDayClosures:30000,getEmployeeAdminData:60000,getAbsences:60000,getPlannerWorkers:120000,getMaintenanceCustomer:30000,getMaintenanceArchive:30000};

function jget51(key){try{return JSON.parse(localStorage.getItem(key)||'null');}catch(_e){return null;}}
function jset51(key,value){try{localStorage.setItem(key,JSON.stringify(value));}catch(_e){}}
function sget51(key){try{return JSON.parse(sessionStorage.getItem(key)||'null');}catch(_e){return null;}}
function sset51(key,value){try{sessionStorage.setItem(key,JSON.stringify(value));}catch(_e){}}
function now51(){return Date.now();}
function valid51(x,ttl){return x&&Number(x.ts)>0&&(now51()-Number(x.ts)<ttl);}
function safeText51(v){return String(v==null?'':v);}
function readKey51(payload){const x=Object.assign({},payload||{});delete x.employeePin;delete x.pin;delete x.force;return JSON.stringify(x);}
function clearReadCache51(){PERF.readCache.clear();}

/* Schreibzugriffe markieren nur die betroffenen Caches als veraltet. */
const apiBase51=window.api;
const DAY_WRITES51=new Set(['saveEntry','updateEmployeeEntry','deleteEntry','closeDay','refreshClosedDay','setDayStatus','confirmEmployeeAssignment','reportEmployeeAssignmentIssue']);
const CAL_WRITES51=new Set(['savePlannerEvent','deletePlannerEvent','transferPlannerEvent','saveExternalGoogleEvent','deleteExternalGoogleEvent','planRequest3']);
const DASH_WRITES51=new Set([
  'saveEntry','updateEmployeeEntry','deleteEntry','closeDay','refreshClosedDay','setDayStatus','confirmEmployeeAssignment','reportEmployeeAssignmentIssue',
  'updateRegieReport','markRegieReportBilled','markRegieObjectBilled','markRegieObjectsBilled','setRegieObjectJobStatus','markRegieObjectCompleted','mergeRegieObjects',
  'createInspectionOffer','setRegieReportsOfferStatus','discardOfferPermanently','acceptOfferAsRunning','saveOfferCreatedWithReminder','rescheduleOfferReminder','declineOfferFromReminder','acceptOfferFromReminder',
  'syncCustomerInquiries','updateCustomerInquiry','completeCustomerInquiry','deleteCustomerInquiry','archiveCustomerInquiry','rejectCustomerInquiry','inquiryToOffer',
  'saveMaintenanceCustomer','deleteMaintenanceDevice','deleteMaintenanceCustomer','addMaintenanceRepair','addManualMaintenanceCount','savePlannerEvent','deletePlannerEvent',
  'saveEmployeeAdmin','setEmployeeActive','deleteEmployeeAdmin','saveAbsence','deleteAbsence','saveVacationEntitlement'
]);
if(typeof apiBase51==='function')window.api=api=async function(payload){
  const a=payload&&payload.action,ttl=READ_TTL51[a],key=ttl?readKey51(payload):'',cached=ttl?PERF.readCache.get(key):null;
  if(ttl&&!payload.force&&cached&&now51()-cached.ts<ttl)return cached.value;
  const r=await apiBase51.apply(this,arguments);
  if(ttl)PERF.readCache.set(key,{ts:now51(),value:r});
  if(DAY_WRITES51.has(a))PERF.forceDay=true;
  if(CAL_WRITES51.has(a))PERF.forceCalendar=true;
  if(DASH_WRITES51.has(a)){PERF.forceDashboard=true;clearReadCache51();try{localStorage.removeItem('dg51_dashboard');}catch(_e){}}
  return r;
};

function renderEmployeeDirectory51(rows){
  employeeDirectory=Array.isArray(rows)?rows:[];
  const current=auth().employee;
  if($('loginEmployee')){
    $('loginEmployee').innerHTML='<option value="">Bitte auswählen</option>'+employeeDirectory.map(x=>'<option>'+esc(x)+'</option>').join('');
    if(current&&employeeDirectory.includes(current))$('loginEmployee').value=current;
  }
  if(typeof fillAbsenceEmployees==='function')fillAbsenceEmployees();
}
window.loadEmployeeDirectory=loadEmployeeDirectory=async function(force){
  const cached=jget51('dg51_employees');
  if(cached&&Array.isArray(cached.rows)&&!employeeDirectory.length)renderEmployeeDirectory51(cached.rows);
  if(!navigator.onLine)return employeeDirectory;
  if(!force&&valid51(cached,EMPLOYEE_TTL)&&employeeDirectory.length)return employeeDirectory;
  if(PERF.employeePromise)return PERF.employeePromise;
  PERF.employeePromise=(async()=>{try{const rows=await api({action:'getEmployees',force:Boolean(force)});renderEmployeeDirectory51(rows||[]);jset51('dg51_employees',{ts:now51(),rows:rows||[]});return rows||[];}catch(e){if(!employeeDirectory.length&&$('loginEmployee'))$('loginEmployee').innerHTML='<option value="">Mitarbeiter konnten nicht geladen werden</option>';return employeeDirectory;}finally{PERF.employeePromise=null;}})();
  return PERF.employeePromise;
};

/* Tag sofort aus lokalem Stand zeichnen, Netz nur bei Bedarf. */
window.loadDay=loadDay=async function(force){
  const a=auth(),date=$('date')&&$('date').value;if(!a.employee||!date)return;
  const dataKey='dg_day_'+a.employee+'_'+date,tsKey='dg51_day_ts_'+a.employee+'_'+date;
  const cached=jget51(dataKey),last=Number(localStorage.getItem(tsKey)||0),must=Boolean(force||PERF.forceDay||!cached||now51()-last>DAY_TTL);
  if(cached){lastDayData=cached;renderDay();}
  if(!navigator.onLine){if(!cached)lastDayData={entries:[],total:0,closed:false,status:'Arbeiten'};if(!cached)renderDay();return lastDayData;}
  if(!must)return cached;
  if(PERF.dayPromises[dataKey])return PERF.dayPromises[dataKey];
  const token=DG3.dayToken=(DG3.dayToken||0)+1,current=()=>auth().employee===a.employee&&date===$('date').value&&token===DG3.dayToken;
  PERF.dayPromises[dataKey]=(async()=>{try{const data=await api({action:'getDayData',employee:a.employee,pin:a.pin,date:date,force:Boolean(force||PERF.forceDay)});PERF.forceDay=false;localStorage.setItem(dataKey,JSON.stringify(data));localStorage.setItem(tsKey,String(now51()));PERF.lastDayFetch[date]=now51();if(current()){lastDayData=data;renderDay();}return data;}catch(e){if(!cached&&current())setMessage('entryStatus',e.message,'error');return cached;}finally{delete PERF.dayPromises[dataKey];}})();
  return PERF.dayPromises[dataKey];
};

/* Kalender: Cache sofort anzeigen, doppelte und kurz aufeinanderfolgende Google-Abfragen verhindern. */
window.loadCalendarEvents=loadCalendarEvents=async function(force){
  const a=auth();if(!a.employee||!a.pin)return;
  const key='dg_calendar_'+a.employee,tsKey='dg51_calendar_ts_'+a.employee,cached=jget51(key),last=Number(localStorage.getItem(tsKey)||0),must=Boolean(force||PERF.forceCalendar||!cached||now51()-last>CALENDAR_TTL);
  if(Array.isArray(cached))renderCalendarEvents(cached);
  if(!navigator.onLine){if(Array.isArray(cached))setMessage('calendarStatus','🟠 Offline – zuletzt geladene Termine werden angezeigt.','warn');return cached||[];}
  if(!must){clearMessage('calendarStatus');return cached||[];}
  if(PERF.calendarPromise)return PERF.calendarPromise;
  PERF.calendarPromise=(async()=>{try{const events=await api({action:'getEmployeeCalendarEvents',employee:a.employee,pin:a.pin,startDate:localDate(),days:3,force:Boolean(force||PERF.forceCalendar)});PERF.forceCalendar=false;if(auth().employee!==a.employee)return events||[];jset51(key,events||[]);localStorage.setItem(tsKey,String(now51()));PERF.lastCalendarFetch=now51();renderCalendarEvents(events||[]);clearMessage('calendarStatus');return events||[];}catch(e){if(!cached)setMessage('calendarStatus',e.message,'error');else setMessage('calendarStatus','Letzter Terminstand angezeigt – Aktualisierung folgt bei stabiler Verbindung.','warn');return cached||[];}finally{PERF.calendarPromise=null;}})();
  return PERF.calendarPromise;
};

/* Manuelles Aktualisieren umgeht bewusst Kurzzeitcaches. */
document.addEventListener('click',function(ev){const b=ev.target&&ev.target.closest?ev.target.closest('button'):null;if(!b)return;const oc=safeText51(b.getAttribute('onclick'));if(oc.includes('loadCalendarEvents'))PERF.forceCalendar=true;if(/Aktualisieren/i.test(b.textContent||'')){clearReadCache51();if(b.closest('#bossView'))PERF.forceDashboard=true;}},true);

function renderDashboard51(d){
  if(!d)return;
  if(d.completed!==undefined)d3Count('completed',d.completed);
  if(d.running!==undefined)d3Count('running',d.running);
  if(d.offers!==undefined)d3Count('offers',d.offers);
  if(d.days!==undefined)d3Count('days',d.days);
  if(d.reminders!==undefined)d3Count('reminders',d.reminders);
  if(d.inquiries!==undefined)d3Count('inquiries',d.inquiries);
  if(d.maintenance!==undefined)d3Count('maintenance',d.maintenance);
}
window.d3Dashboard=d3Dashboard=async function(force){
  if(!canAccessBoss())return;
  const cached=jget51('dg51_dashboard');if(cached&&cached.data)renderDashboard51(cached.data);
  if(!navigator.onLine)return cached&&cached.data;
  const must=Boolean(force||PERF.forceDashboard||!valid51(cached,DASHBOARD_TTL));
  if(!must)return cached&&cached.data;
  if(PERF.dashboardPromise)return PERF.dashboardPromise;
  PERF.dashboardPromise=(async()=>{try{const d=await api(chefPayload({action:'getDashboardSummary51',force:Boolean(force||PERF.forceDashboard)}));PERF.forceDashboard=false;PERF.lastDashboardFetch=now51();jset51('dg51_dashboard',{ts:PERF.lastDashboardFetch,data:d||{}});renderDashboard51(d||{});if($('d3Sync'))$('d3Sync').textContent='Zuletzt aktualisiert: '+new Date().toLocaleTimeString('de-DE');return d;}catch(e){if(!cached){['completed','running','offers','days','reminders','inquiries','maintenance'].forEach(k=>d3Count(k,'!'));}if($('d3Sync'))$('d3Sync').textContent='Aktualisierung fehlgeschlagen: '+e.message;return cached&&cached.data;}finally{PERF.dashboardPromise=null;}})();
  return PERF.dashboardPromise;
};

/* Backend-Ping höchstens alle 30 Minuten je Sitzung. */
window.d3CheckBackend=d3CheckBackend=async function(force){
  const cached=sget51('dg51_backend');
  if(!force&&valid51(cached,BACKEND_TTL)&&cached.version){DG3.backend=cached.version;$('d3Notice')?.remove();return true;}
  try{const r=await api({action:'ping'}),found=String(r&&r.version||''),p=found.split('.').map(Number),ok=p[0]>5||(p[0]===5&&p[1]>=1);DG3.backend=ok?found:'';if(ok){sset51('dg51_backend',{ts:now51(),version:found});$('d3Notice')?.remove();return true;}d3Notice('App 5.2.5 benötigt Google-GS 5.2.0.2.2 oder neuer. Gefunden: '+(found||'unbekannt')+'. Speichern ist gesperrt.','warn');return false;}catch(e){DG3.backend='';d3Notice('Verbindungsprüfung fehlgeschlagen: '+e.message,'warn');return false;}
};

/* Keine Wrapper-Kaskade mehr beim Hauptstart: nur wirklich benoetigte Daten. */
window.showEmployee=showEmployee=function(){
  const wasBoss=$('bossView')&&!$('bossView').classList.contains('hidden');
  $('employeeView').classList.remove('hidden');$('bossView').classList.add('hidden');$('employeeTab').classList.add('active');$('bossTab').classList.remove('active');
  setTimeout(()=>{if(typeof d35InstallInspectionButton==='function')d35InstallInspectionButton();},0);
  if(wasBoss&&navigator.onLine)Promise.allSettled([loadDay(false),loadCalendarEvents(false)]);
};
window.showBoss=showBoss=function(){
  if(!canAccessBoss()){showEmployee();setMessage('entryStatus','Kein Zugriff auf Büro.','error');return;}
  $('employeeView').classList.add('hidden');$('bossView').classList.remove('hidden');$('employeeTab').classList.remove('active');$('bossTab').classList.add('active');
  const c=jget51('dg51_dashboard');if(c&&c.data)renderDashboard51(c.data);
  if(navigator.onLine){if(!DG3.backend)d3CheckBackend(false);d3Dashboard(false);}
};
window.openMain=openMain=function(){
  const a=auth();$('loginScreen').classList.add('hidden');$('mainScreen').classList.remove('hidden');$('employeeLabel').textContent='Angemeldet: '+a.employee;$('date').value=localDate();$('bossTab').classList.toggle('hidden',!canAccessBoss());
  $('employeeView').classList.remove('hidden');$('bossView').classList.add('hidden');$('employeeTab').classList.add('active');$('bossTab').classList.remove('active');
  DG3.reports={};DG3.inquiries=[];DG3.orders=[];$('regieResult')?.replaceChildren();$('d3RunningList')?.replaceChildren();
  if(!DG3.backend)d3CheckBackend(false);
  if(!employeeDirectory.length)loadEmployeeDirectory(false);
  requestAnimationFrame(()=>{if(customerPad)customerPad.resize();if(employeePad)employeePad.resize();});
  updateConnection();
  Promise.allSettled([loadDay(false),loadCalendarEvents(false)]);
  setTimeout(()=>{if(typeof d35InstallInspectionButton==='function')d35InstallInspectionButton();},0);
};

/* Ein Auto-Sync reicht alle drei Minuten; Tag und Kalender parallel statt nacheinander. */
window.d3Sync=d3Sync=async function(force){
  if(DG3.syncing||DG3.pending||document.hidden||!navigator.onLine||!DG3.ready||!auth().employee||d3Dirty())return;
  if(!force&&now51()-PERF.lastAutoSync<AUTO_SYNC_TTL)return;
  PERF.lastAutoSync=now51();DG3.syncing=true;
  try{
    await syncQueue(false);
    if(d3Visible($('employeeView')))await Promise.allSettled([loadDay(Boolean(force)),loadCalendarEvents(Boolean(force))]);
    else await d3Dashboard(Boolean(force));
    if($('d3Sync'))$('d3Sync').textContent='Zuletzt aktualisiert: '+new Date().toLocaleTimeString('de-DE')+' · nur geänderte Bereiche werden neu geladen.';
  }catch(e){if($('d3Sync'))$('d3Sync').textContent='Aktualisierung fehlgeschlagen: '+e.message;}
  finally{DG3.syncing=false;}
};

try{if(window.DG38){DG38.loaded=false;DG38.overview=null;}}catch(_e){}
try{DG3.version=V51;window.DG_APP_VERSION=V51;}catch(_e){}
})();

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
    if(!res||!res.deviceSessionToken)throw new Error('Geräte-Anmeldung konnte nicht erstellt werden. Bitte Backend 5.2.0.2.2.1 prüfen.');
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

/* Backend 5.2.0.2.2.1 ist für die widerrufbare Geräte-Session erforderlich. */
window.d3CheckBackend=d3CheckBackend=async function(force){
  const cached=(()=>{try{return JSON.parse(sessionStorage.getItem('dg51_backend')||'null');}catch(_e){return null;}})();
  if(!force&&cached&&cached.version&&Date.now()-Number(cached.ts||0)<1800000&&/^5\.1(?:\.\d+)?$/.test(String(cached.version))){DG3.backend=cached.version;$('d3Notice')?.remove();return true;}
  try{
    const r=await api({action:'ping'}),found=String(r&&r.version||''),p=found.split('.').map(Number),ok=p[0]>5||(p[0]===5&&(p[1]>1||(p[1]===1&&(p[2]||0)>=1)));
    DG3.backend=ok?found:'';
    if(ok){try{sessionStorage.setItem('dg51_backend',JSON.stringify({ts:Date.now(),version:found}));}catch(_e){}$('d3Notice')?.remove();return true;}
    d3Notice('App 5.2.5.1 benötigt Google-GS 5.2.0.2.2.1 oder neuer. Gefunden: '+(found||'unbekannt')+'. Speichern ist gesperrt.','warn');return false;
  }catch(e){DG3.backend='';d3Notice('Verbindungsprüfung fehlgeschlagen: '+e.message,'warn');return false;}
};

try{DG3.version=V511;window.DG_APP_VERSION=V511;}catch(_e){}
})();

/* DG 5.1.2: Büro kann fehlerhafte Tages-/Regieberichtseinträge direkt löschen. */
(function(){
'use strict';
const V512='5.1.2';

function clearDayCaches512(employee,date){
  try{localStorage.removeItem('dg_day_'+employee+'_'+date);}catch(_e){}
  try{localStorage.removeItem('dg51_day_ts_'+employee+'_'+date);}catch(_e){}
  try{localStorage.removeItem('dg51_dashboard');}catch(_e){}
  try{if(window.DG51){DG51.forceDay=true;DG51.forceDashboard=true;}}catch(_e){}
}

window.deleteBossDayEntry512=async function(employee,date,entryId,customer,hours){
  employee=String(employee||'');date=String(date||'');entryId=String(entryId||'');
  if(!entryId)return false;
  const label=(customer||'Ohne Baustellenangabe')+' · '+formatHours(hours||0)+' Std.';
  if(!confirm('Diesen Eintrag wirklich löschen?\n\n'+label+'\n'+formatDateDE(date)+' · '+employee+'\n\nDie Stunden werden aus Tagesstunden, Monatsstunden und den zugehörigen Regieberichten entfernt.'))return false;
  try{
    setMessage('dg48DayStatus','Eintrag wird gelöscht und Stunden werden neu berechnet ...','info');
    const r=await api(chefPayload({action:'deleteBossDayEntry',targetEmployee:employee,date:date,entryId:entryId}));
    clearDayCaches512(employee,date);
    setMessage('dg48DayStatus','✓ Eintrag gelöscht. Tages- und Monatssummen wurden neu berechnet.','ok');
    await loadBossDayClosuresV48();
    const work=[];
    if(typeof window.loadBossMonth==='function')work.push(Promise.resolve().then(()=>window.loadBossMonth()));
    if(typeof window.d3Dashboard==='function')work.push(Promise.resolve().then(()=>window.d3Dashboard(true)));
    await Promise.allSettled(work);
    return r;
  }catch(e){
    setMessage('dg48DayStatus',e&&e.message?e.message:'Eintrag konnte nicht gelöscht werden.','error');
    return false;
  }
};

/* Nach dem bestehenden Renderer direkt an jedem Einzelbericht einen klaren Löschbutton ergänzen. */
const renderClosures512=window.renderBossDayClosuresV48;
if(typeof renderClosures512==='function')window.renderBossDayClosuresV48=function(rows){
  const r=renderClosures512.apply(this,arguments);
  const employeeBoxes=[...document.querySelectorAll('#dg48DayResult .dg48-days-employee')];
  (rows||[]).forEach((emp,ei)=>{
    const box=employeeBoxes[ei];if(!box)return;
    const dayCards=[...box.querySelectorAll(':scope > .dg48-day-grid > .dg48-day')];
    (emp.days||[]).forEach((day,di)=>{
      const card=dayCards[di];if(!card)return;
      const reportEls=[...card.querySelectorAll('.dg49-detail .dg49-report')];
      (day.reports||[]).forEach((rep,ri)=>{
        const report=reportEls[ri];if(!report||!rep||!rep.id||report.querySelector('.dg512-delete-entry'))return;
        const billed=String(rep.billingStatus||'Offen')==='Abgerechnet';
        if(billed){
          const n=document.createElement('div');n.className='muted small';n.style.marginTop='8px';n.textContent='Bereits abgerechnet – Löschen gesperrt.';report.appendChild(n);return;
        }
        const b=document.createElement('button');b.type='button';b.className='btn danger dg512-delete-entry';b.style.marginTop='10px';b.style.width='100%';b.textContent='Fehleintrag löschen';
        b.addEventListener('click',ev=>{ev.preventDefault();ev.stopPropagation();deleteBossDayEntry512(emp.employee,day.date,rep.id,rep.customer,rep.hours);});
        report.appendChild(b);
      });
    });
  });
  return r;
};

/* Performance-Caches nach Büro-Löschung als veraltet markieren. */
const api512=window.api;
if(typeof api512==='function')window.api=api=async function(payload){
  const r=await api512.apply(this,arguments);
  if(payload&&payload.action==='deleteBossDayEntry')clearDayCaches512(payload.targetEmployee,payload.date);
  return r;
};

/* Für diese Funktion muss der passende 5.1.2-Backendstand vorhanden sein. */
window.d3CheckBackend=d3CheckBackend=async function(force){
  const cached=(()=>{try{return JSON.parse(sessionStorage.getItem('dg51_backend')||'null');}catch(_e){return null;}})();
  if(!force&&cached&&cached.version&&Date.now()-Number(cached.ts||0)<1800000){
    const p=String(cached.version).split('.').map(Number),ok=p[0]>5||(p[0]===5&&(p[1]>1||(p[1]===1&&(p[2]||0)>=2)));
    if(ok){DG3.backend=String(cached.version);$('d3Notice')?.remove();return true;}
  }
  try{
    const res=await api({action:'ping'}),found=String(res&&res.version||''),p=found.split('.').map(Number),ok=p[0]>5||(p[0]===5&&(p[1]>1||(p[1]===1&&(p[2]||0)>=2)));
    DG3.backend=ok?found:'';
    if(ok){try{sessionStorage.setItem('dg51_backend',JSON.stringify({ts:Date.now(),version:found}));}catch(_e){}$('d3Notice')?.remove();return true;}
    d3Notice('App 5.2.5.2 benötigt Google-GS 5.2.0.2.2.2 oder neuer. Gefunden: '+(found||'unbekannt')+'. Speichern ist gesperrt.','warn');return false;
  }catch(e){DG3.backend='';d3Notice('Verbindungsprüfung fehlgeschlagen: '+e.message,'warn');return false;}
};

try{DG3.version=V512;window.DG_APP_VERSION=V512;}catch(_e){}
})();

/* DG Zeiterfassung 5.2.0 - Monatsabschluss, Lohnprüfung und Steuerberater-Übergabe */
(function(){
'use strict';
const V520='5.2.0';
let currentAudit520=null;
const byId=id=>document.getElementById(id);
const e520=v=>String(v==null?'':v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const money520=v=>Number(v||0).toFixed(2).replace('.',',');
const h520=v=>Number(v||0).toFixed(2).replace('.',',');
const parse520=v=>{const n=Number(String(v==null?'':v).trim().replace(',','.'));return Number.isFinite(n)?n:0};
const fmtDate520=iso=>{const p=String(iso||'').split('-');return p.length===3?p[2]+'.'+p[1]+'.'+p[0]:String(iso||'')};
const monthNames520=['Januar','Februar','März','April','Mai','Juni','Juli','August','September','Oktober','November','Dezember'];
function addCss520(){if(byId('dg520Styles'))return;const s=document.createElement('style');s.id='dg520Styles';s.textContent=`.dg520-payroll{border:2px solid #1d4ed8!important;background:#f8fbff!important}.dg520-payroll h3{margin:0 0 6px;color:#123f91}.dg520-due{font-weight:900;margin:10px 0;padding:10px 12px;border-radius:12px;background:#eef2ff}.dg520-due.warn{background:#fff7ed;color:#9a3412}.dg520-due.error{background:#fef2f2;color:#991b1b}.dg520-due.ok{background:#f0fdf4;color:#166534}.dg520-summary{display:grid;grid-template-columns:repeat(4,minmax(120px,1fr));gap:9px;margin:12px 0}.dg520-stat{border:1px solid #dbe2ea;border-radius:12px;background:#fff;padding:10px;text-align:center}.dg520-stat strong{display:block;font-size:24px}.dg520-issues{display:grid;gap:9px;margin-top:12px}.dg520-issue{border-radius:12px;padding:12px;border:1px solid #e5e7eb;background:#fff}.dg520-issue.error{border-left:6px solid #dc2626}.dg520-issue.warn{border-left:6px solid #f59e0b}.dg520-issue.reviewed{opacity:.7;border-left-color:#16a34a}.dg520-issue-title{font-weight:900}.dg520-issue-meta{font-size:13px;color:#64748b;margin:3px 0 6px}.dg520-issue-actions{display:flex;gap:7px;flex-wrap:wrap;margin-top:9px}.dg520-issue-actions .btn{width:auto!important;margin:0!important}.dg520-table-wrap{overflow:auto;margin-top:12px;border:1px solid #e5e7eb;border-radius:12px;background:#fff}.dg520-table{width:100%;border-collapse:collapse;min-width:1000px}.dg520-table th,.dg520-table td{padding:9px;border-bottom:1px solid #e5e7eb;text-align:right;white-space:nowrap}.dg520-table th:first-child,.dg520-table td:first-child,.dg520-table th:nth-child(2),.dg520-table td:nth-child(2),.dg520-table th:nth-child(3),.dg520-table td:nth-child(3){text-align:left}.dg520-table th{background:#f8fafc;position:sticky;top:0}.dg520-status{font-weight:900;padding:8px 10px;border-radius:10px;display:inline-block}.dg520-status.open{background:#fff7ed;color:#9a3412}.dg520-status.done{background:#f0fdf4;color:#166534}.dg520-status.changed{background:#fef2f2;color:#991b1b}.dg520-modal{position:fixed;inset:0;z-index:14000;background:rgba(15,23,42,.62);display:flex;align-items:center;justify-content:center;padding:18px}.dg520-modal.hidden{display:none!important}.dg520-modal-card{width:min(560px,100%);background:#fff;border-radius:18px;padding:20px;box-shadow:0 22px 70px rgba(0,0,0,.35)}.dg520-payroll-fields{border:1px solid #bfdbfe!important;background:#eff6ff!important}.dg520-check{display:flex;align-items:center;gap:8px;margin-top:10px}.dg520-check input{width:auto}.dg520-correct-btn{margin-top:7px!important;width:100%!important}@media(max-width:720px){.dg520-summary{grid-template-columns:1fr 1fr}.dg520-issue-actions .btn{width:100%!important}.dg520-modal-card{padding:15px}}`;document.head.appendChild(s)}
function ensurePayrollFields520(){if(byId('adminPayrollType'))return;const timeSec=byId('adminTimeBankEmployee')&&byId('adminTimeBankEmployee').closest('.admin-section');if(!timeSec)return;const sec=document.createElement('div');sec.className='admin-section dg520-payroll-fields';sec.id='dg520PayrollFields';sec.innerHTML='<h3>9. Lohnabrechnung</h3><div class="muted small">Diese Angaben werden für Monatsabschluss und Übergabe an den Steuerberater verwendet.</div><div class="admin-grid"><div><label>Abrechnungsart</label><select id="adminPayrollType" onchange="dg520PayrollTypeChanged()"><option value="Stundenlohn">Stundenlohn</option><option value="Festgehalt">Festgehalt</option></select></div><div id="adminMonthlySalaryWrap"><label>Monatsgehalt brutto</label><input id="adminMonthlySalary" inputmode="decimal" placeholder="z. B. 3100,00" type="text"></div></div><label class="dg520-check"><input id="adminPayrollRelevant" type="checkbox" checked> Mitarbeiter in Lohnübergabe berücksichtigen</label><div id="adminPayrollHint" class="field-hint"></div>';timeSec.insertAdjacentElement('beforebegin',sec);const h=timeSec.querySelector(':scope > h3');if(h&&/^9\./.test(h.textContent))h.textContent=h.textContent.replace(/^9\./,'10.');dg520PayrollTypeChanged()}
window.dg520PayrollTypeChanged=function(){const type=byId('adminPayrollType')?.value||'Stundenlohn',wrap=byId('adminMonthlySalaryWrap'),hint=byId('adminPayrollHint');if(wrap)wrap.style.opacity=type==='Festgehalt'?'1':'.45';if(hint)hint.textContent=type==='Festgehalt'?'Festgehalt: Monatsgehalt ist Pflicht; ein Stundenlohn ist für die Lohnübergabe nicht erforderlich.':'Stundenlohn: Brutto-Stundenlohn wird aus dem vorhandenen Feld in den Stammdaten verwendet.'};
function payrollFormData520(){return {payrollType:byId('adminPayrollType')?.value||'Stundenlohn',monthlySalary:parse520(byId('adminMonthlySalary')?.value),payrollRelevant:!!byId('adminPayrollRelevant')?.checked}}
function installAdminWrappers520(){ensurePayrollFields520();if(window.__dg520AdminWrapped)return;window.__dg520AdminWrapped=true;const oldEdit=window.editEmployeeAdmin;if(typeof oldEdit==='function')window.editEmployeeAdmin=function(i){const r=oldEdit.apply(this,arguments);ensurePayrollFields520();const x=(window.__employeeAdminRows||[])[i]||{};byId('adminPayrollType').value=x.payrollType||'Stundenlohn';byId('adminMonthlySalary').value=Number(x.monthlySalary)>0?money520(x.monthlySalary):'';byId('adminPayrollRelevant').checked=x.payrollRelevant!==false;dg520PayrollTypeChanged();return r};const oldClear=window.clearEmployeeAdminForm;if(typeof oldClear==='function')window.clearEmployeeAdminForm=function(){const r=oldClear.apply(this,arguments);ensurePayrollFields520();byId('adminPayrollType').value='Stundenlohn';byId('adminMonthlySalary').value='';byId('adminPayrollRelevant').checked=true;dg520PayrollTypeChanged();return r};window.saveEmployeeAdminUi=saveEmployeeAdminUi=async function(){ensurePayrollFields520();const dayIds=['adminMon','adminTue','adminWed','adminThu','adminFri'],dayVals=dayIds.map(id=>parseHoursInput(byId(id).value));let weekly=parseHoursInput(byId('adminWeeklyHours').value);if(!Number.isFinite(weekly)||weekly<0||weekly>60){setMessage('employeeAdminStatus','Wochenstunden sind ungültig. Erlaubt: 0 bis 60 Std.','error');return}if(dayVals.some(v=>!Number.isFinite(v)||v<0||v>24)){setMessage('employeeAdminStatus','Bitte die Sollstunden Montag bis Freitag prüfen. Erlaubt sind 0 bis 24 Std. je Tag.','error');return}if(dayVals.every(v=>v===0)&&weekly>0){const d=Math.round((weekly/5)*100)/100;dayVals.fill(d);dayIds.forEach((id,i)=>byId(id).value=formatInputHours(dayVals[i]))}weekly=Math.round(dayVals.reduce((a,b)=>a+b,0)*100)/100;byId('adminWeeklyHours').value=formatInputHours(weekly);updateHoursSum();const pay=payrollFormData520();const item={originalName:byId('adminOriginalName').value.trim(),name:byId('adminName').value.trim(),pin:byId('adminPin').value.trim(),calendarId:byId('adminCalendarId').value.trim(),employmentType:byId('adminEmploymentType').value,weeklyHours:weekly,monday:dayVals[0],tuesday:dayVals[1],wednesday:dayVals[2],thursday:dayVals[3],friday:dayVals[4],holidayCredit:byId('adminHolidayCredit').checked,chefAccess:byId('adminChefAccess').checked,active:byId('adminOriginalActive').value!=='0',lastName:byId('adminLastName').value.trim(),firstName:byId('adminFirstName').value.trim(),birthDate:byId('adminBirthDate').value,personnelNumber:byId('adminPersonnelNumber').value.trim(),street:byId('adminStreet').value.trim(),postalCode:byId('adminPostalCode').value.trim(),city:byId('adminCity').value.trim(),phone:byId('adminPhone').value.trim(),mobile:byId('adminMobile').value.trim(),email:byId('adminEmail').value.trim(),healthInsurance:byId('adminHealthInsurance').value.trim(),healthInsuranceNumber:byId('adminHealthInsuranceNumber').value.trim(),socialSecurityNumber:byId('adminSocialSecurityNumber').value.trim(),taxId:byId('adminTaxId').value.trim(),bank:byId('adminBank').value.trim(),iban:byId('adminIban').value.trim(),entryDate:byId('adminEntryDate').value,exitDate:byId('adminExitDate').value,paymentMethod:byId('adminPaymentMethod').value,emergencyContactName:byId('adminEmergencyContactName').value.trim(),emergencyContactPhone:byId('adminEmergencyContactPhone').value.trim(),drivingLicence:byId('adminDrivingLicence').value.trim(),notes:byId('adminNotes').value.trim(),hourlyWage:parseHoursInput(byId('adminHourlyWage')?.value||'0'),payrollType:pay.payrollType,monthlySalary:pay.monthlySalary,payrollRelevant:pay.payrollRelevant};if(!item.name){setMessage('employeeAdminStatus','Bitte einen Anzeigenamen eintragen oder bestehenden Mitarbeiter auswählen.','error');return}if(!byId('adminOriginalName').value&&!item.pin){setMessage('employeeAdminStatus','Für einen neuen Mitarbeiter bitte PIN eingeben.','error');return}if(byId('adminOriginalName').value&&byId('adminOriginalName').value!==item.name){setMessage('employeeAdminStatus','Den Anzeigenamen eines bestehenden Mitarbeiters bitte nicht ändern. Neu anlegen und alten deaktivieren.','warn');return}if(item.payrollRelevant&&item.payrollType==='Festgehalt'&&!(item.monthlySalary>0)){setMessage('employeeAdminStatus','Bitte bei Festgehalt das Brutto-Monatsgehalt eintragen.','error');return}try{setMessage('employeeAdminStatus','Mitarbeiter- und Lohndaten werden gespeichert ...','info');const res=await api(chefPayload({action:'saveEmployeeAdmin',item:item}));renderEmployeeAdminList(res.employees||[]);await loadEmployeeDirectory();setMessage('employeeAdminStatus','✅ Stammdaten und Lohndaten gespeichert: '+item.name,'ok');const idx=(window.__employeeAdminRows||[]).findIndex(x=>x.name===item.name);if(idx>=0)editEmployeeAdmin(idx)}catch(e){setMessage('employeeAdminStatus','Speichern nicht möglich: '+e.message,'error')}}}
function makePayrollSection520(){if(byId('dg520PayrollClose'))return byId('dg520PayrollClose');const host=byId('dg48EmployeeClosures');if(!host)return null;const body=host.querySelector(':scope > .dg48-body')||host;const sec=document.createElement('div');sec.className='dg48-subsection dg520-payroll';sec.id='dg520PayrollClose';const now=new Date();sec.innerHTML='<h3>Monatsabschluss &amp; Lohnübergabe</h3><div class="muted small">Automatische Plausibilitätsprüfung aller Mitarbeiter. Lohnübergabe an den Steuerberater jeweils zum 20. des Monats.</div><div class="grid2"><div><label>Jahr</label><input id="dg520Year" type="number"></div><div><label>Monat</label><select id="dg520Month">'+monthNames520.map((n,i)=>'<option value="'+(i+1)+'">'+n+'</option>').join('')+'</select></div></div><div id="dg520Due" class="dg520-due"></div><div class="button-row"><button class="btn primary" type="button" onclick="return dg520RunAudit()">Monat jetzt prüfen</button><button class="btn danger" type="button" onclick="return downloadTaxAdvisorPdf()">PDF Steuerberater</button></div><div id="dg520Status"></div><div id="dg520Result"></div>';sec.querySelector('#dg520Year').value=(byId('bossYear')&&byId('bossYear').value)||now.getFullYear();sec.querySelector('#dg520Month').value=(byId('bossMonth')&&byId('bossMonth').value)||String(now.getMonth()+1);body.insertBefore(sec,body.firstChild);updateDue520(null);return sec}
function selected520(){return {year:Number(byId('dg520Year')?.value||byId('bossYear')?.value),month:Number(byId('dg520Month')?.value||byId('bossMonth')?.value)}}
function updateDue520(audit){const el=byId('dg520Due');if(!el)return;const q=selected520(),due=new Date(q.year,q.month-1,20),today=new Date();today.setHours(0,0,0,0);due.setHours(0,0,0,0);const diff=Math.round((due-today)/86400000),status=audit?.state?.status||'Offen';let text='',cls='';if(status==='Uebergeben'){text='🟢 Lohnübergabe an Steuerberater als erledigt markiert.';cls='ok'}else if(diff>0){text='🟢 Lohnübergabe am 20.'+String(q.month).padStart(2,'0')+'.'+q.year+' · noch '+diff+' Tag'+(diff===1?'':'e')+'.';cls=diff<=5?'warn':''}else if(diff===0){text='🔴 Lohnübergabe heute fällig (20.'+String(q.month).padStart(2,'0')+'.'+q.year+').';cls='error'}else{text='🔴 Lohnübergabe seit '+Math.abs(diff)+' Tag'+(Math.abs(diff)===1?'':'en')+' überfällig.';cls='error'}el.className='dg520-due '+cls;el.textContent=text}
window.dg520RunAudit=async function(){const q=selected520();if(!(q.year>0&&q.month>=1&&q.month<=12)){setMessage('dg520Status','Bitte Jahr und Monat prüfen.','error');return}try{setMessage('dg520Status','Monat wird vollständig geprüft ...','info');currentAudit520=await api(chefPayload({action:'getMonthPayrollAudit',year:q.year,month:q.month}));renderAudit520(currentAudit520);setMessage('dg520Status','✓ Monatsprüfung abgeschlossen.','ok')}catch(e){byId('dg520Result').innerHTML='';setMessage('dg520Status','Monatsprüfung nicht möglich: '+e.message,'error')}};
function stateBadge520(state){const st=state?.status||'Offen',cls=st==='Uebergeben'||st==='Freigegeben'?'done':st==='Aenderung nach Abschluss'?'changed':'open';const label=st==='Uebergeben'?'Übergeben':st==='Aenderung nach Abschluss'?'Änderung nach Abschluss':st;return '<span class="dg520-status '+cls+'">'+e520(label)+'</span>'}
function renderAudit520(a){updateDue520(a);const out=byId('dg520Result');if(!out)return;const s=a.summary||{},state=a.state||{};let html='<div style="margin:10px 0">Lohnstatus: '+stateBadge520(state)+'</div>';if(state.changedSinceApproval)html+='<div class="status error"><strong>⚠ Nachträgliche Änderung erkannt.</strong><br>Die Daten unterscheiden sich vom bereits freigegebenen/übergebenen Stand. Monatsprüfung und Freigabe müssen erneut erfolgen.</div>';html+='<div class="dg520-summary"><div class="dg520-stat"><strong>'+Number(s.errors||0)+'</strong>🔴 Fehler</div><div class="dg520-stat"><strong>'+Number(s.warnings||0)+'</strong>🟠 offen</div><div class="dg520-stat"><strong>'+Number(s.reviewedWarnings||0)+'</strong>🟢 bestätigt</div><div class="dg520-stat"><strong>'+Number(s.employees||0)+'</strong>Mitarbeiter</div></div>';html+=renderPayrollTable520(a.payrollRows||[]);const issues=a.issues||[];html+='<h4 style="margin:16px 0 6px">Auffälligkeiten</h4><div class="dg520-issues">';if(!issues.length)html+='<div class="status ok">🟢 Keine Auffälligkeiten gefunden.</div>';else issues.forEach(x=>{const rev=x.reviewed&&x.severity==='warn';html+='<div class="dg520-issue '+e520(x.severity)+(rev?' reviewed':'')+'"><div class="dg520-issue-title">'+(x.severity==='error'?'🔴':'🟠')+' '+e520(x.employee)+(x.date?' · '+e520(fmtDate520(x.date)):'')+' · '+e520(x.title)+(rev?' · ✓ geprüft':'')+'</div><div class="dg520-issue-meta">'+e520(x.detail||'')+'</div><div class="dg520-issue-actions">'+(x.date?'<button class="btn primary" type="button" onclick="return dg520OpenDay(\''+encodeURIComponent(x.employee)+'\',\''+e520(x.date)+'\')">Tag öffnen und prüfen</button>':'')+(x.entryId&&String(x.entryId).indexOf('assigned:')!==0?'<button class="btn secondary" type="button" onclick="return dg520OpenCorrection(\''+encodeURIComponent(x.employee)+'\',\''+e520(x.date)+'\',\''+encodeURIComponent(x.entryId)+'\',\''+e520(x.start||'')+'\',\''+e520(x.end||'')+'\',\''+encodeURIComponent(x.customer||'')+'\')">Zeit korrigieren</button>':'')+(x.severity==='warn'&&!x.reviewed?'<button class="btn success" type="button" onclick="return dg520ReviewIssue(\''+encodeURIComponent(x.id)+'\',\''+encodeURIComponent(x.employee)+'\',\''+e520(x.date||'')+'\')">✓ Geprüft – korrekt</button>':'')+'</div></div>'});html+='</div><div class="button-row" style="margin-top:14px"><button class="btn success" type="button" '+(a.canRelease&&!state.changedSinceApproval?'':'disabled')+' onclick="return dg520SetState(\'Freigegeben\')">🟢 Monatsabschluss freigeben</button><button class="btn primary" type="button" '+((state.status==='Freigegeben'&&!state.changedSinceApproval)?'':'disabled')+' onclick="return dg520SetState(\'Uebergeben\')">🔵 An Steuerberater übergeben</button><button class="btn secondary" type="button" '+((state.status==='Offen')?'disabled':'')+' onclick="return dg520SetState(\'Wieder geoeffnet\')">Monat wieder öffnen</button></div>';out.innerHTML=html}
function renderPayrollTable520(rows){let h='<div class="dg520-table-wrap"><table class="dg520-table"><thead><tr><th>Mitarbeiter</th><th>Status</th><th>Abrechnung</th><th>Soll</th><th>Ist</th><th>geleistet</th><th>Lohn-Std.</th><th>Satz/Gehalt</th><th>Brutto*</th><th>Urlaub</th><th>Krank</th><th>Zeitkonto</th></tr></thead><tbody>';rows.forEach(r=>{const pay=r.payrollType==='Festgehalt'?money520(r.monthlySalary)+' €/Monat':money520(r.hourlyWage)+' €/Std.';h+='<tr><td>'+e520(r.employee)+'</td><td>'+e520(r.employmentType)+'</td><td>'+e520(r.payrollType)+(r.payrollRelevant?'':' · nicht lohnrelevant')+'</td><td>'+h520(r.targetHours)+'</td><td>'+h520(r.actualHours)+'</td><td>'+h520(r.workHours)+'</td><td>'+h520(r.payrollHours)+'</td><td>'+e520(pay)+'</td><td>'+money520(r.grossEstimate)+' €</td><td>'+Number(r.vacationDays||0)+'</td><td>'+Number(r.sickDays||0)+'</td><td>'+h520(r.timeBankBalance)+'</td></tr>'});return h+'</tbody></table></div><div class="muted small">* rechnerischer Wert zur Kontrolle; verbindliche Lohnabrechnung erstellt der Steuerberater.</div>'}
window.dg520ReviewIssue=async function(issueId,employee,date){try{const q=selected520();setMessage('dg520Status','Hinweis wird als geprüft gespeichert ...','info');await api(chefPayload({action:'markPayrollIssueReviewed',issueId:decodeURIComponent(issueId),targetEmployee:decodeURIComponent(employee),year:q.year,month:q.month,date:date||'',note:'Geprüft – korrekt'}));await dg520RunAudit()}catch(e){setMessage('dg520Status',e.message,'error')}};
window.dg520SetState=async function(action){const q=selected520();let reason='';if(action==='Wieder geoeffnet'){reason=prompt('Grund für die Wiederöffnung:')||'';if(!reason)return}if(action==='Uebergeben'&&!confirm('Lohnunterlagen für '+monthNames520[q.month-1]+' '+q.year+' wirklich als an den Steuerberater übergeben markieren?'))return;try{setMessage('dg520Status','Status wird gespeichert ...','info');await api(chefPayload({action:'setPayrollMonthStatus',year:q.year,month:q.month,payrollAction:action,reason:reason}));await dg520RunAudit()}catch(e){setMessage('dg520Status',e.message,'error')}};
window.dg520OpenDay=async function(empEncoded,date){const employee=decodeURIComponent(empEncoded),p=String(date).split('-'),year=Number(p[0]),month=Number(p[1]);const group=byId('dg48EmployeeClosures');if(group){const body=group.querySelector(':scope > .dg48-body');if(body)body.classList.remove('hidden');const t=group.querySelector(':scope > .dg48-head .dg48-toggle');if(t)t.textContent='−'}if(byId('dg48DayYear'))byId('dg48DayYear').value=year;if(byId('dg48DayMonth'))byId('dg48DayMonth').value=month;try{setMessage('dg520Status','Tagesbericht wird geöffnet ...','info');await loadBossDayClosuresV48();const boxes=[...document.querySelectorAll('#dg48DayResult .dg48-days-employee')],box=boxes.find(b=>(b.querySelector(':scope > strong')?.textContent||'').trim()===employee);if(!box)throw new Error('Mitarbeiter im Tagesabschluss nicht gefunden.');const wanted=fmtDate520(date),cards=[...box.querySelectorAll('.dg48-day')],card=cards.find(c=>(c.querySelector(':scope > strong')?.textContent||'').trim()===wanted);if(!card)throw new Error('Tagesbericht '+wanted+' wurde nicht gefunden.');const detail=card.querySelector('.dg49-detail');if(detail)detail.classList.remove('hidden');card.scrollIntoView({behavior:'smooth',block:'center'});card.style.outline='3px solid #2563eb';setTimeout(()=>card.style.outline='',3500);clearMessage('dg520Status')}catch(e){setMessage('dg520Status','Tagesbericht konnte nicht geöffnet werden: '+e.message,'error')}};
function ensureCorrectionModal520(){if(byId('dg520CorrectionModal'))return;const m=document.createElement('div');m.id='dg520CorrectionModal';m.className='dg520-modal hidden';m.innerHTML='<div class="dg520-modal-card"><h2 style="margin-top:0">Arbeitszeit korrigieren</h2><div id="dg520CorrectionLabel" class="status info"></div><input id="dg520CorrectionEmployee" type="hidden"><input id="dg520CorrectionDate" type="hidden"><input id="dg520CorrectionEntry" type="hidden"><div class="grid2"><div><label>Von</label><input id="dg520CorrectionStart" type="time"></div><div><label>Bis</label><input id="dg520CorrectionEnd" type="time"></div></div><label>Grund der Korrektur</label><input id="dg520CorrectionReason" placeholder="Pflichtangabe"><div class="button-row"><button class="btn success" type="button" onclick="return dg520SaveCorrection()">Korrektur speichern</button><button class="btn secondary" type="button" onclick="return dg520CloseCorrection()">Abbrechen</button></div><div id="dg520CorrectionStatus"></div></div>';document.body.appendChild(m);m.addEventListener('click',e=>{if(e.target===m)dg520CloseCorrection()})}
window.dg520OpenCorrection=function(empEncoded,date,entryEncoded,start,end,customerEncoded){ensureCorrectionModal520();const employee=decodeURIComponent(empEncoded),entryId=decodeURIComponent(entryEncoded),customer=decodeURIComponent(customerEncoded||'');byId('dg520CorrectionEmployee').value=employee;byId('dg520CorrectionDate').value=date;byId('dg520CorrectionEntry').value=entryId;byId('dg520CorrectionStart').value=start||'';byId('dg520CorrectionEnd').value=end||'';byId('dg520CorrectionReason').value='';byId('dg520CorrectionLabel').textContent=employee+' · '+fmtDate520(date)+(customer?' · '+customer:'');byId('dg520CorrectionStatus').innerHTML='';byId('dg520CorrectionModal').classList.remove('hidden');setTimeout(()=>byId('dg520CorrectionReason').focus(),30);return false};window.dg520CloseCorrection=function(){byId('dg520CorrectionModal')?.classList.add('hidden')};window.dg520SaveCorrection=async function(){const employee=byId('dg520CorrectionEmployee').value,date=byId('dg520CorrectionDate').value,entryId=byId('dg520CorrectionEntry').value,start=byId('dg520CorrectionStart').value,end=byId('dg520CorrectionEnd').value,reason=byId('dg520CorrectionReason').value.trim();if(!start||!end||!reason){setMessage('dg520CorrectionStatus','Von, Bis und Grund sind Pflicht.','error');return}try{setMessage('dg520CorrectionStatus','Zeit wird korrigiert und Tag neu berechnet ...','info');await api(chefPayload({action:'updateBossDayEntry',targetEmployee:employee,date:date,entryId:entryId,start:start,end:end,reason:reason}));dg520CloseCorrection();try{await loadBossDayClosuresV48()}catch(_e){}await dg520RunAudit();setMessage('dg520Status','✅ Arbeitszeit korrigiert: '+employee+' · '+fmtDate520(date),'ok')}catch(e){setMessage('dg520CorrectionStatus',e.message,'error')}};
function addCorrectionButtonsToDays520(rows){const boxes=[...document.querySelectorAll('#dg48DayResult .dg48-days-employee')];(rows||[]).forEach((emp,ei)=>{const box=boxes[ei];if(!box)return;const cards=[...box.querySelectorAll(':scope > .dg48-day-grid > .dg48-day')];(emp.days||[]).forEach((day,di)=>{const card=cards[di];if(!card)return;const reports=[...card.querySelectorAll('.dg49-detail .dg49-report')];(day.reports||[]).forEach((rep,ri)=>{const el=reports[ri];if(!el||!rep.id||String(rep.id).indexOf('assigned:')===0||el.querySelector('.dg520-correct-btn')||String(rep.billingStatus||'Offen')==='Abgerechnet')return;const b=document.createElement('button');b.type='button';b.className='btn secondary dg520-correct-btn';b.textContent='Zeit korrigieren';b.onclick=ev=>{ev.preventDefault();ev.stopPropagation();dg520OpenCorrection(encodeURIComponent(emp.employee),day.date,encodeURIComponent(rep.id),rep.start,rep.end,encodeURIComponent(rep.customer||''))};el.appendChild(b)})})})}
function installDayRenderer520(){if(window.__dg520DayWrapped)return;const old=window.renderBossDayClosuresV48;if(typeof old!=='function')return;window.__dg520DayWrapped=true;window.renderBossDayClosuresV48=function(rows){const r=old.apply(this,arguments);addCorrectionButtonsToDays520(rows);return r}}
function installPayrollUi520(){addCss520();installAdminWrappers520();makePayrollSection520();ensureCorrectionModal520();installDayRenderer520();const sync=()=>{if(byId('dg520Year')&&byId('bossYear'))byId('dg520Year').value=byId('bossYear').value;if(byId('dg520Month')&&byId('bossMonth'))byId('dg520Month').value=byId('bossMonth').value;updateDue520(currentAudit520)};if(byId('bossYear')&&!byId('bossYear').dataset.dg520){byId('bossYear').dataset.dg520='1';byId('bossYear').addEventListener('change',sync)}if(byId('bossMonth')&&!byId('bossMonth').dataset.dg520){byId('bossMonth').dataset.dg520='1';byId('bossMonth').addEventListener('change',sync)}}
const oldLoadBossMonth520=window.loadBossMonth;if(typeof oldLoadBossMonth520==='function')window.loadBossMonth=async function(){const r=await oldLoadBossMonth520.apply(this,arguments);if(byId('dg520PayrollClose')){byId('dg520Year').value=byId('bossYear').value;byId('dg520Month').value=byId('bossMonth').value;updateDue520(currentAudit520)}return r};
window.d3CheckBackend=d3CheckBackend=async function(force){try{if(force)sessionStorage.removeItem('dg51_backend');const cached=JSON.parse(sessionStorage.getItem('dg51_backend')||'null');if(!force&&cached&&cached.version&&Date.now()-Number(cached.ts||0)<1800000){const p=String(cached.version).split('.').map(Number),ok=p[0]>5||(p[0]===5&&p[1]>=2);if(ok){DG3.backend=String(cached.version);byId('d3Notice')?.remove();return true}}}catch(_e){}try{const r=await api({action:'ping'}),found=String(r&&r.version||''),p=found.split('.').map(Number),ok=p[0]>5||(p[0]===5&&p[1]>=2);DG3.backend=ok?found:'';if(ok){try{sessionStorage.setItem('dg51_backend',JSON.stringify({ts:Date.now(),version:found}))}catch(_e){}byId('d3Notice')?.remove();return true}d3Notice('App 5.2.5 benötigt Google-GS 5.2.0.2 oder neuer. Gefunden: '+(found||'unbekannt')+'. Speichern ist gesperrt.','warn');return false}catch(e){DG3.backend='';d3Notice('Verbindungsprüfung fehlgeschlagen: '+e.message,'warn');return false}};
function versionLabels520(){document.title='DG Zeiterfassung 5.2.0';document.querySelectorAll('.hero strong').forEach(x=>{if(/Zeiterfassung/.test(x.textContent))x.textContent='Zeiterfassung - 5.2.0'});document.querySelectorAll('.login-card .muted.small').forEach(x=>{if(/^Version /.test(x.textContent.trim()))x.textContent='Version 5.2.0'});try{DG3.version=V520;window.DG_APP_VERSION=V520}catch(_e){}try{sessionStorage.removeItem('dg51_backend')}catch(_e){}}
function boot520(){versionLabels520();installPayrollUi520();setTimeout(installPayrollUi520,200);setTimeout(installPayrollUi520,900)}if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot520);else boot520();
})();
;

/* ===== CONSOLIDATED SOURCE: app-6.0-runtime.js ===== */
/* DG Zeiterfassung 7.4.1 - konsolidierter Runtime-Layer */
(function(){
'use strict';
const V='7.4.1',VIEW='dg60_view',STATE='dg60_office_state',BACK='dg60_backend',BACK_TTL=1800000,OFFER_TTL=30000;
const q=id=>document.getElementById(id),esc60=v=>String(v==null?'':v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let offerAt=0,offerPromise=null;
const parts=v=>String(v||'').split('.').map(x=>Number(x)||0);
const backendOk=v=>{const p=parts(v);return (p[0]||0)>=6||(p[0]===5&&p[1]===2&&p[2]===0&&(p[3]||0)>=8);};
const backend60=v=>(parts(v)[0]||0)>=6;

function stamp(){document.title='DG Zeiterfassung '+V;document.querySelectorAll('.login-card .muted.small').forEach(x=>{if(/^Version /.test((x.textContent||'').trim()))x.textContent='Version '+V;});document.querySelectorAll('.hero strong').forEach(x=>{if(/Zeiterfassung/.test(x.textContent||''))x.textContent='Zeiterfassung - '+V;});try{DG3.version=V;window.DG_APP_VERSION=V;}catch(_e){}}
function css(){if(q('dg60Css'))return;const s=document.createElement('style');s.id='dg60Css';s.textContent='.dg60-count{display:inline-flex;align-items:center;justify-content:center;min-width:24px;height:24px;padding:0 7px;margin-left:7px;border-radius:999px;background:#e2e8f0;color:#334155;font-size:12px;font-weight:900}.dg60-rem-ok{margin-top:8px;padding:8px 10px;border-radius:10px;background:#f0fdf4;color:#166534;font-size:12px;font-weight:800}.dg60-rem-warn{margin-top:8px;padding:8px 10px;border-radius:10px;background:#fff7ed;color:#9a3412;font-size:12px;font-weight:800}#dg60OfficeToolbar{display:flex;justify-content:flex-end;margin:0 0 14px;padding:10px 12px;border:1px solid #d7dee8;border-radius:14px;background:#f8fafc}#dg60OpenWindow{border:0;border-radius:11px;padding:11px 16px;background:#1f5f36;color:#fff;font-weight:800;cursor:pointer}@media(max-width:700px){#dg60OpenWindow{width:100%}}';document.head.appendChild(s);}

/* Ein Backend-Ping hoechstens alle 30 Minuten. 5.2.0.8 bleibt waehrend der Umstellung kompatibel. */
window.d3CheckBackend=d3CheckBackend=async function(force){if(!force){try{const c=JSON.parse(sessionStorage.getItem(BACK)||'null');if(c&&backendOk(c.version)&&Date.now()-Number(c.ts||0)<BACK_TTL){DG3.backend=String(c.version);if(backend60(c.version))q('d3Notice')?.remove();else if(typeof d3Notice==='function')d3Notice('App 7.4.1: Google-GS 7.4.1 bitte noch bereitstellen. Aktuell '+c.version+'.','warn');return true;}}catch(_e){}}try{const r=await fetch(API_URL,{method:'POST',headers:{'Content-Type':'text/plain;charset=utf-8'},body:JSON.stringify({action:'ping',clientVersion:V})});if(!r.ok)throw new Error('HTTP '+r.status);const raw=JSON.parse(await r.text());if(!raw.ok)throw new Error(raw.error||'Serverfehler.');const data=raw.data!==undefined?raw.data:raw,found=String(data&&data.version||'');DG3.backend=backendOk(found)?found:'';if(!DG3.backend){d3Notice('App 7.4.1 benötigt Google-GS 7.4.1. Gefunden: '+(found||'unbekannt')+'.','warn');return false;}sessionStorage.setItem(BACK,JSON.stringify({ts:Date.now(),version:found}));if(backend60(found))q('d3Notice')?.remove();else d3Notice('App 7.4.1: Google-GS 7.4.1 bitte noch bereitstellen. Aktuell '+found+'.','warn');return true;}catch(e){DG3.backend='';if(typeof d3Notice==='function')d3Notice('Verbindungsprüfung fehlgeschlagen: '+e.message,'warn');return false;}};

/* Zentraler Transport 7.4.1: Request-Deduplizierung bleibt erhalten. */
window.d3Api=d3Api=async function(payload){const action=String(payload&&payload.action||''),read=/^(get|check)/.test(action)||['ping','employeeLogin','systemHealthCheck'].includes(action),key=JSON.stringify(payload||{});if(read&&DG3.reads.has(key))return DG3.reads.get(key);const run=(async()=>{if(action!=='ping'&&!backendOk(DG3.backend)){if(!await d3CheckBackend())throw dgError('Google-Backend 7.4.1 noch nicht bereitgestellt.','version');}if(!read)DG3.pending++;const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),65000);try{let response;try{response=await fetch(API_URL,{method:'POST',headers:{'Content-Type':'text/plain;charset=utf-8'},body:JSON.stringify(Object.assign({},payload,{clientVersion:V})),signal:controller.signal});}catch(e){throw dgError(e.name==='AbortError'?'Serverantwort dauert zu lange. Vor erneutem Anlegen zuerst Daten neu laden.':'Keine Serververbindung.','network');}if(!response.ok)throw dgError('HTTP '+response.status,'network');let data;try{data=JSON.parse(await response.text());}catch(_e){throw dgError('Ungültige Serverantwort.','server');}if(!data.ok)throw dgError(data.error||'Serverfehler.','server');return data.data!==undefined?data.data:data;}finally{clearTimeout(timer);if(!read)DG3.pending--;}})();if(read)DG3.reads.set(key,run);try{return await run;}finally{if(read&&DG3.reads.get(key)===run)DG3.reads.delete(key);}};

/* Angebote: kein automatischer Dreifach-Reload beim Start; Zaehler nur bei sichtbarem Bereich/Mutation. */
function offerBtn(id){return document.querySelector('#d3Offers .d3-menu [data-panel="'+id+'"]');}
function offerCount(id,label,n){const b=offerBtn(id);if(b)b.innerHTML=esc60(label)+' <span class="dg60-count">'+Number(n||0)+'</span>';}
function relabelOffers(){const tile=document.querySelector('#bossView .d3-dashboard .d3-tile.offers');if(!tile)return;const s=tile.querySelector('span');if(s)s.textContent='Angebote zu erstellen';tile.dataset.d3Fn='d3Open';tile.dataset.d3Args=JSON.stringify(['d3Offers','d3OfferCreate']);}
async function refreshOffers(force){if(!navigator.onLine||typeof api!=='function'||typeof chefPayload!=='function')return;if(!force&&offerAt&&Date.now()-offerAt<OFFER_TTL)return;if(offerPromise)return offerPromise;offerPromise=(async()=>{try{const r=await Promise.all(['Offen','Zu erstellen','Archiv'].map(stage=>api(chefPayload({action:'getOfferReports',stage}))));offerAt=Date.now();DG3.offers=DG3.offers||{};DG3.offers.Offen=r[0];DG3.offers['Zu erstellen']=r[1];DG3.offers.Archiv=r[2];DG3.offerCounts={open:r[0].length,create:r[1].length};offerCount('d3OfferOpen','Offene Angebote',r[0].length);offerCount('d3OfferCreate','Angebote zu erstellen',r[1].length);offerCount('d3OfferArchive','Angebotsarchiv',r[2].length);if(typeof d3Count==='function')d3Count('offers',r[1].length);relabelOffers();}catch(_e){}finally{offerPromise=null;}})();return offerPromise;}
window.dg60RefreshOfferCounts=refreshOffers;
window.d3MoveOfferBackToCreate=async function(offerId){if(!confirm('Dieses offene Angebot wirklich zurück zu „Angebote zu erstellen“ verschieben? Ein offener Reminder wird dabei beendet.'))return false;try{await api(chefPayload({action:'moveOfferBackToCreate',offerId:String(offerId||'')}));offerAt=0;await loadOffers('Offen');await refreshOffers(true);if(typeof d3Notice==='function')d3Notice('✓ Angebot wurde zu „Angebote zu erstellen“ verschoben.','ok');}catch(e){if(typeof d3Notice==='function')d3Notice(e.message,'error');else alert(e.message);}return false;};
window.d3OfferCreated=function(offerId){const r=d3Offer(offerId);d3Form('Angebot erstellt – Reminder festlegen',[{name:'customer',label:'Kunde',required:true},{name:'offerNumber',label:'Angebotsnummer',required:true},{name:'phone',label:'Telefon'},{name:'email',label:'E-Mail',type:'email'},{name:'description',label:'Beschreibung',type:'textarea'},{name:'reminderDays',label:'Erinnerung in Tagen (1–90)',type:'number',required:true}],Object.assign({},r,{reminderDays:5}),async item=>{const days=Number(item.reminderDays);if(!(days>=1&&days<=90))throw new Error('Bitte 1 bis 90 Tage für den Reminder eintragen.');item.reminderDays=days;await api(chefPayload({action:'saveOfferCreatedWithReminder',offerId,item}));offerAt=0;await loadOffers('Zu erstellen');await refreshOffers(true);});};
window.loadOffers=async function(stage='Offen'){const id=stage==='Offen'?'d3OfferOpen':stage==='Zu erstellen'?'d3OfferCreate':'d3OfferArchive';setMessage(id+'Status','Angebote werden geladen ...','info');try{const jobs=[api(chefPayload({action:'getOfferReports',stage}))];if(stage==='Offen')jobs.push(api(chefPayload({action:'getOfferReminders',includeDone:false})));const got=await Promise.all(jobs),rows=got[0]||[],rems=got[1]||[],by={};rems.forEach(x=>{if(x&&x.offerId)by[x.offerId]=x;});DG3.offers=DG3.offers||{};DG3.offers[stage]=rows;q(id+'List').innerHTML=rows.map((r,i)=>{let buttons='';if(stage==='Offen')buttons=d3Button('Angenommen','d3OfferDecision',[r.offerId,true],'success')+d3Button('Abgelehnt','d3OfferDecision',[r.offerId,false],'secondary')+d3Button('Zu „Angebote zu erstellen“','d3MoveOfferBackToCreate',[r.offerId],'danger');if(stage==='Zu erstellen')buttons=d3Button('Angebot erstellt','d3OfferCreated',[r.offerId],'success')+d3Button('Auftrag entfernen','d3DiscardOffer',[r.offerId],'danger');const rem=stage==='Offen'?by[r.offerId]:null,due=rem&&rem.dueDate?(typeof formatDateDE==='function'?formatDateDE(rem.dueDate):rem.dueDate):'',ri=stage!=='Offen'?'':rem?'<div class="dg60-rem-ok">Reminder verknüpft · fällig '+esc60(due)+'</div>':'<div class="dg60-rem-warn">⚠ Kein offener Reminder verknüpft.</div>';return '<div class="report-card'+(i%2?' d3-alt':'')+'"><strong>'+esc(r.customer)+'</strong><div class="report-meta">'+esc(r.status)+' - '+Number(r.reportCount||0)+' Berichte - '+formatHours(r.totalHours)+' Std.</div><div>'+esc(r.description||'')+'</div>'+((r.reports||[]).length?'<details><summary>Einzelberichte anzeigen</summary>'+r.reports.map(d3Single).join('')+'</details>':'<div class="muted small">Angebot ohne bereits erfasste Arbeitszeit.</div>')+ri+'<div class="report-actions">'+buttons+'</div></div>';}).join('')||'Keine Angebote vorhanden.';setMessage(id+'Status',rows.length+' Angebot(e) geladen.','ok');offerAt=Date.now();if(stage==='Offen')offerCount('d3OfferOpen','Offene Angebote',rows.length);if(stage==='Zu erstellen'){offerCount('d3OfferCreate','Angebote zu erstellen',rows.length);if(typeof d3Count==='function')d3Count('offers',rows.length);relabelOffers();}if(stage==='Archiv')offerCount('d3OfferArchive','Angebotsarchiv',rows.length);}catch(e){setMessage(id+'Status',e.message,'error');}};
['d3OfferDecision','d3DiscardOffer','d3ReminderDecision'].forEach(name=>{const old=window[name];if(typeof old!=='function')return;window[name]=async function(){const r=await old.apply(this,arguments);offerAt=0;await refreshOffers(true);return r;};});

/* Regie: keine N+1-getObjectReports-Nachladung mehr. GS 7.4.1 liefert die Historie komplett. */
const oldSingle=window.d3Single;if(typeof oldSingle==='function')window.d3Single=d3Single=function(r){let html=oldSingle(r);if(String(r&&r.status||'')!=='Abgerechnet'||/Bereits abgerechnet/.test(html))return html;return html.replace('</div>','<div class="muted small" style="margin-top:4px;font-weight:800">✓ Bereits abgerechnet'+(r&&r.billedAt?' · '+esc(r.billedAt):'')+'</div></div>');};
function regieRoot(view){return q(view==='Laufend'?'d3RunningList':'regieResult');}
window.requestMergeSelectedRegieReports=async function(view){const v=view||((DG3&&DG3.active)||'Abgeschlossen'),root=regieRoot(v);if(!root)return false;const boxes=[...root.querySelectorAll('.regie-merge-select:checked')],ids=[...new Set(boxes.flatMap(x=>String(x.dataset.objectIds||'').split(',').map(s=>s.trim()).filter(Boolean)))];if(ids.length<2){alert('Bitte mindestens zwei Kundenkarten im aktuell geöffneten Bereich markieren.');return false;}if(!confirm('Die '+boxes.length+' markierten Kundenkarten wirklich zusammenführen?'))return false;try{d3Notice('Regieberichte werden zusammengeführt ...','info');await api(chefPayload({action:'mergeRegieObjects',objectIds:ids}));boxes.forEach(x=>x.checked=false);await loadRegieReports(v);if(typeof d3Dashboard==='function')await d3Dashboard(true);d3Notice('✓ Regieberichte wurden zusammengeführt.','ok');}catch(e){d3Notice(e.message,'error');}return false;};

/* Bürostatus pro Fenster, ohne MutationObserver und ohne mehrere alte Office-Patches. */
const bossAllowed=()=>{try{return localStorage.getItem('dg_chef_access')==='1';}catch(_e){return false;}},bossVisible=()=>!!(q('bossView')&&!q('bossView').classList.contains('hidden'));
const setView=v=>{try{sessionStorage.setItem(VIEW,v);}catch(_e){}},getView=()=>{try{return sessionStorage.getItem(VIEW)||sessionStorage.getItem('dg530_view')||'';}catch(_e){return '';}},setState=(id,child)=>{try{sessionStorage.setItem(STATE,JSON.stringify({id:id||'',child:child||''}));}catch(_e){}},getState=()=>{try{return JSON.parse(sessionStorage.getItem(STATE)||sessionStorage.getItem('dg530_office_state')||'{}')||{};}catch(_e){return {};}};
function forced(){try{return new URL(location.href).searchParams.get('dgOffice')==='1';}catch(_e){return false;}}function cleanUrl(){try{const u=new URL(location.href);u.searchParams.delete('dgOffice');u.searchParams.delete('dgWindow');history.replaceState(null,'',u.pathname+(u.search||'')+u.hash);}catch(_e){}}
function toolbar(){const boss=q('bossView');if(!boss)return;['dg528OfficeToolbar','dg529OfficeToolbar','dg530OfficeToolbar'].forEach(id=>q(id)?.remove());if(q('dg60OfficeToolbar'))return;const bar=document.createElement('div');bar.id='dg60OfficeToolbar';const b=document.createElement('button');b.id='dg60OpenWindow';b.type='button';b.textContent='App erneut in neuem Fenster öffnen';b.addEventListener('click',()=>{setView('boss');const u=new URL(location.href);u.searchParams.set('dgOffice','1');u.searchParams.set('dgWindow',Date.now());if(!window.open(u.href,'_blank','width=1500,height=950,resizable=yes,scrollbars=yes'))alert('Bitte Pop-ups für diese App erlauben.');});bar.appendChild(b);boss.insertBefore(bar,boss.firstChild);}
function forceBoss(){if(!bossAllowed())return false;const e=q('employeeView'),b=q('bossView');if(!e||!b)return false;e.classList.add('hidden');b.classList.remove('hidden');q('employeeTab')?.classList.remove('active');q('bossTab')?.classList.add('active');setView('boss');toolbar();return true;}
const oldBoss=window.showBoss;if(typeof oldBoss==='function')window.showBoss=function(){setView('boss');const r=oldBoss.apply(this,arguments);toolbar();relabelOffers();return r;};
document.addEventListener('click',ev=>{const t=ev.target&&ev.target.closest?ev.target.closest('#bossTab,#employeeTab'):null;if(t)setView(t.id==='bossTab'?'boss':'employee');},true);window.addEventListener('pagehide',()=>{if(bossVisible())setView('boss');});
const oldOpen=window.d3Open;if(typeof oldOpen==='function')window.d3Open=d3Open=function(id,child){if(bossVisible())setState(id,child);const r=oldOpen.apply(this,arguments);if(id==='d3Offers')setTimeout(()=>refreshOffers(false),0);return r;};
async function restoreBoss(){if(!forceBoss())return;const s=getState();if(s.id&&q(s.id)&&typeof d3Open==='function')await Promise.resolve(d3Open(s.id,s.child||undefined));else if(typeof d3Dashboard==='function')await d3Dashboard();}

function boot(){css();stamp();toolbar();relabelOffers();const want=forced()||getView()==='boss';if(forced())setView('boss');if(want&&bossAllowed())requestAnimationFrame(()=>restoreBoss().finally(cleanUrl));else cleanUrl();}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();
;

/* ===== CONSOLIDATED SOURCE: app-6.0.3-backend.js ===== */
/* DG Zeiterfassung 7.4.1 - strikte, einheitliche Backend-Anbindung */
(function(){
'use strict';
const V='7.4.1',PREVIOUS=['7.4.0','7.3.7','7.3.6','7.3.5','7.3.4','7.3.3','7.3.2','7.3.1','7.3','7.2.1','7.2','7.1','7.0'],KEY='dg70_backend',TTL=5*60*1000;
const BACKEND_URL='https://script.google.com/macros/s/AKfycby2L3SMgh2RoGWsNRUp6o11g4iyZ8bgkSIGaAZPnBXCkJTkDDGF9aydn9vVKMB7kXsO/exec';
function byId(id){return document.getElementById(id);}
function exact(v){return String(v||'').trim()===V;}
function compatible(v){const s=String(v||'').trim();return exact(s)||PREVIOUS.includes(s);}
function foundVersion(){return String(window.__DG_FOUND_BACKEND||'unbekannt');}
function clearVersionNotices(){const n=byId('d3Notice');if(n&&/Google-GS|Google-Backend|Backend.*bereitgestellt|Bereitstellungs-Link|Versionsstand/i.test(n.textContent||''))n.remove();}
function showMismatch(found){window.__DG_FOUND_BACKEND=String(found||'unbekannt');if(compatible(found)){clearVersionNotices();return true;}if(window.DG3)DG3.backend='';const msg='Versionsstand stimmt nicht: App '+V+' benötigt Google-GS '+V+'. Aktiv ist Google-GS '+foundVersion()+'.';if(typeof window.d3Notice==='function')window.d3Notice(msg,'warn');return false;}
window.d3CheckBackend=d3CheckBackend=async function(force){
  if(!force){try{const c=JSON.parse(sessionStorage.getItem(KEY)||'null');if(c&&compatible(c.version)&&Date.now()-Number(c.ts||0)<TTL){window.__DG_FOUND_BACKEND=String(c.version);if(window.DG3)DG3.backend=String(c.version);clearVersionNotices();return true;}}catch(_e){}}
  try{
    const r=await fetch(BACKEND_URL,{method:'POST',headers:{'Content-Type':'text/plain;charset=utf-8'},body:JSON.stringify({action:'ping',clientVersion:V})});
    if(!r.ok)throw new Error('HTTP '+r.status);
    const raw=JSON.parse(await r.text());if(!raw.ok)throw new Error(raw.error||'Serverfehler.');
    const data=raw.data!==undefined?raw.data:raw,found=String(data&&data.version||raw.version||'unbekannt');
    window.__DG_FOUND_BACKEND=found;
    try{sessionStorage.removeItem('dg60_backend_reachable');sessionStorage.removeItem('dg60_backend');sessionStorage.removeItem('dg602_backend');if(compatible(found))sessionStorage.setItem(KEY,JSON.stringify({ts:Date.now(),version:found}));else sessionStorage.removeItem(KEY);}catch(_e){}
    if(window.DG3)DG3.backend=compatible(found)?found:'';
    return showMismatch(found);
  }catch(e){window.__DG_FOUND_BACKEND='nicht erreichbar';if(window.DG3)DG3.backend='';try{sessionStorage.removeItem(KEY);}catch(_e){}if(typeof window.d3Notice==='function')window.d3Notice('Google-Backend ist nicht erreichbar: '+(e&&e.message?e.message:'Unbekannter Fehler')+'.','warn');return false;}
};
window.d3Api=d3Api=async function(payload){
  const action=String(payload&&payload.action||''),read=/^(get|check|search|find)/.test(action)||['ping','employeeLogin','systemHealthCheck'].includes(action),key=JSON.stringify(payload||{});
  if(read&&window.DG3&&DG3.reads&&DG3.reads.has(key))return DG3.reads.get(key);
  const run=(async()=>{
    if(action!=='ping'&&(!window.DG3||!compatible(DG3.backend))){const ok=await d3CheckBackend(true);if(!ok)throw dgError('App '+V+' kann nicht speichern/laden, weil Google-GS '+foundVersion()+' aktiv ist. Benötigt wird Google-GS '+V+'.','version');}
    if(window.DG3&&!read)DG3.pending=(DG3.pending||0)+1;
    const controller=new AbortController(),timeoutMs=['getMonthPayrollAudit','createTaxAdvisorPdf','setPayrollMonthStatus','completePayrollCycle'].includes(action)?180000:65000,timer=setTimeout(()=>controller.abort(),timeoutMs);
    try{
      let response;try{response=await fetch(BACKEND_URL,{method:'POST',headers:{'Content-Type':'text/plain;charset=utf-8'},body:JSON.stringify(Object.assign({},payload,{clientVersion:V})),signal:controller.signal});}catch(e){throw dgError(e.name==='AbortError'?'Serverantwort dauert zu lange. Vor erneutem Speichern zuerst Daten neu laden.':'Keine Serververbindung.','network');}
      if(!response.ok)throw dgError('HTTP '+response.status,'network');
      let data;try{data=JSON.parse(await response.text());}catch(_e){throw dgError('Ungültige Serverantwort.','server');}
      if(!data.ok)throw dgError(data.error||'Serverfehler.','server');
      return data.data!==undefined?data.data:data;
    }finally{clearTimeout(timer);if(window.DG3&&!read)DG3.pending=Math.max(0,(DG3.pending||1)-1);}
  })();
  if(read&&window.DG3&&DG3.reads)DG3.reads.set(key,run);
  try{return await run;}finally{if(read&&window.DG3&&DG3.reads&&DG3.reads.get(key)===run)DG3.reads.delete(key);}
};
async function checkOnStart(){await window.d3CheckBackend(true);}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',function(){setTimeout(checkOnStart,120);},{once:true});else setTimeout(checkOnStart,120);
})();
;

/* ===== CONSOLIDATED SOURCE: app-6.0-ui.js ===== */
/* DG Zeiterfassung 7.4.1 - Monteur-Eingabe: Ja/Nein-Tasten und Sprache-zu-Text */
(function(){
'use strict';

const V60='7.4.1';
let activeRecognition60=null;
let activeSpeechTarget60='';
let activeSpeechButton60=null;

function byId60(id){return document.getElementById(id);}

function addCss60(){
  if(byId60('dg60Styles'))return;
  const s=document.createElement('style');
  s.id='dg60Styles';
  s.textContent=`
    .dg60-toggle-row{
      grid-template-columns:minmax(170px,1fr) minmax(220px,320px)!important;
      align-items:center!important;
      gap:10px!important;
    }
    .dg60-toggle-row>label.dg60-original-radio{display:none!important}
    .dg60-toggle-group{display:grid;grid-template-columns:1fr 1fr;gap:8px}
    .dg60-choice{
      border:2px solid #d1d5db;border-radius:12px;padding:12px 14px;
      font-weight:900;background:#f3f4f6;color:#374151;cursor:pointer;
      min-height:48px;transition:transform .06s ease,background .12s ease,border-color .12s ease;
    }
    .dg60-choice:active{transform:scale(.985)}
    .dg60-choice.dg60-yes.active{background:#166534;color:#fff;border-color:#166534}
    .dg60-choice.dg60-no.active{background:#b91c1c;color:#fff;border-color:#b91c1c}
    .dg60-speech-tools{display:flex;gap:8px;flex-wrap:wrap;margin:8px 0 4px}
    .dg60-speech-tools .btn{width:auto!important;margin:0!important;padding:10px 13px!important}
    .dg60-speech-btn.listening{background:#b91c1c!important;color:#fff!important;animation:dg60Pulse 1.2s infinite}
    .dg60-speech-status{font-size:12px;color:#64748b;margin:4px 0 8px;min-height:16px}
    .dg60-speech-status.ok{color:#166534;background:transparent;padding:0;border-radius:0;font-weight:700}
    .dg60-speech-status.warn{color:#9a3412;background:transparent;padding:0;border-radius:0;font-weight:700}
    .dg60-speech-status.error{color:#991b1b;background:transparent;padding:0;border-radius:0;font-weight:700}
    @keyframes dg60Pulse{0%,100%{opacity:1}50%{opacity:.65}}
    @media(max-width:720px){
      .dg60-toggle-row{grid-template-columns:1fr!important}
      .dg60-toggle-group{width:100%}
      .dg60-choice{min-height:52px;font-size:17px}
      .dg60-speech-tools{display:grid;grid-template-columns:1fr 1fr}
      .dg60-speech-tools .btn{width:100%!important}
    }
  `;
  document.head.appendChild(s);
}

function setVisibleVersion60(){
  document.title='DG Zeiterfassung '+V60;
  const loginVersion=document.querySelector('#loginScreen .center.muted.small');
  if(loginVersion)loginVersion.textContent='Version '+V60;
  const heroVersion=document.querySelector('#mainScreen .hero .head-row strong');
  if(heroVersion)heroVersion.textContent='Zeiterfassung - '+V60;
  try{window.DG_APP_VERSION=V60;if(window.DG3)window.DG3.version=V60;}catch(_e){}
}

function enhanceYesNo60(name){
  const inputs=[...document.querySelectorAll('input[type="radio"][name="'+name+'"]')];
  if(inputs.length<2)return;
  const row=inputs[0].closest('.radio-row');
  if(!row||row.dataset.dg60Enhanced==='1')return;
  row.dataset.dg60Enhanced='1';
  row.classList.add('dg60-toggle-row');

  inputs.forEach(input=>{
    const label=input.closest('label');
    if(label)label.classList.add('dg60-original-radio');
  });

  const group=document.createElement('div');
  group.className='dg60-toggle-group';
  group.setAttribute('role','group');
  group.setAttribute('aria-label',(row.querySelector('strong')?.textContent||name).trim());

  const yes=document.createElement('button');
  yes.type='button';yes.className='dg60-choice dg60-yes';yes.textContent='Ja';
  const no=document.createElement('button');
  no.type='button';no.className='dg60-choice dg60-no';no.textContent='Nein';
  group.append(yes,no);row.appendChild(group);

  function refresh(){
    const selected=inputs.find(x=>x.checked)?.value||'';
    yes.classList.toggle('active',selected==='yes');
    no.classList.toggle('active',selected==='no');
    yes.setAttribute('aria-pressed',selected==='yes'?'true':'false');
    no.setAttribute('aria-pressed',selected==='no'?'true':'false');
  }
  function choose(value){
    const input=inputs.find(x=>x.value===value);if(!input)return;
    input.checked=true;
    input.dispatchEvent(new Event('change',{bubbles:true}));
    refresh();
  }
  yes.addEventListener('click',()=>choose('yes'));
  no.addEventListener('click',()=>choose('no'));
  inputs.forEach(x=>x.addEventListener('change',refresh));
  refresh();
}

function speechCtor60(){return window.SpeechRecognition||window.webkitSpeechRecognition||null;}

function speechErrorText60(code){
  if(code==='not-allowed'||code==='service-not-allowed')return 'Mikrofonzugriff wurde nicht erlaubt. Bitte Mikrofon für diese App freigeben.';
  if(code==='no-speech')return 'Keine Sprache erkannt. Bitte erneut versuchen und deutlich sprechen.';
  if(code==='audio-capture')return 'Kein Mikrofon verfügbar oder das Mikrofon wird bereits verwendet.';
  if(code==='network')return 'Spracherkennung benötigt gerade eine Internetverbindung.';
  return 'Spracherkennung konnte nicht gestartet werden.';
}

function status60(targetId,text,type){
  const e=byId60('dg60SpeechStatus-'+targetId);if(!e)return;
  e.className='dg60-speech-status'+(type?' '+type:'');e.textContent=text||'';
}

function stopSpeech60(){
  if(activeRecognition60){try{activeRecognition60.stop();}catch(_e){}}
}

function startSpeech60(targetId,button){
  const target=byId60(targetId);if(!target)return;
  const Ctor=speechCtor60();
  if(!Ctor){status60(targetId,'Sprache-zu-Text wird von diesem Browser nicht unterstützt. Bitte Chrome oder Edge verwenden.','warn');return;}

  if(activeRecognition60){
    if(activeSpeechTarget60===targetId){stopSpeech60();return;}
    stopSpeech60();
  }

  const recognition=new Ctor();
  activeRecognition60=recognition;activeSpeechTarget60=targetId;activeSpeechButton60=button;
  recognition.lang='de-DE';
  recognition.continuous=true;
  recognition.interimResults=false;
  recognition.maxAlternatives=1;

  const original=String(target.value||'').trimEnd();
  let hadFinal=false;
  const processed=new Set();
  let lastFinal='',lastFinalAt=0;
  const normSpeech60=v=>String(v||'').toLowerCase().replace(/[^a-z0-9äöüß]+/gi,' ').trim().replace(/\s+/g,' ');
  const appendUniqueSpeech60=(base,piece)=>{
    const cur=String(base||'').trimEnd(),p=String(piece||'').trim();if(!p)return cur;
    const a=cur.split(/\s+/),b=p.split(/\s+/);let overlap=0,limit=Math.min(12,a.length,b.length);
    for(let n=1;n<=limit;n++){if(normSpeech60(a.slice(-n).join(' '))===normSpeech60(b.slice(0,n).join(' ')))overlap=n;}
    const rest=b.slice(overlap).join(' ');return rest?cur+(cur?' ':'')+rest:cur;
  };

  function cleanup(message,type){
    if(activeSpeechButton60){activeSpeechButton60.classList.remove('listening');activeSpeechButton60.textContent='🎤 Sprache zu Text';}
    if(activeRecognition60===recognition){activeRecognition60=null;activeSpeechTarget60='';activeSpeechButton60=null;}
    if(message)status60(targetId,message,type||'');
  }

  recognition.onstart=function(){
    button.classList.add('listening');button.textContent='⏹ Aufnahme stoppen';
    status60(targetId,'Aufnahme läuft – sprich deutlich. Erkannter Text wird angehängt.','ok');
  };

  recognition.onresult=function(event){
    for(let i=event.resultIndex;i<event.results.length;i++){
      const result=event.results[i];if(!result||!result.isFinal)continue;
      const piece=String(result[0]?.transcript||'').trim(),n=normSpeech60(piece),key=String(i)+'|'+n;
      if(!n||processed.has(key))continue;processed.add(key);
      const now=Date.now();if(n===lastFinal&&now-lastFinalAt<3500)continue;lastFinal=n;lastFinalAt=now;
      target.value=appendUniqueSpeech60(target.value,piece);hadFinal=true;
      target.dispatchEvent(new Event('input',{bubbles:true}));
      target.scrollTop=target.scrollHeight;
    }
  };

  recognition.onerror=function(event){
    cleanup(speechErrorText60(event.error),'error');
  };

  recognition.onend=function(){
    if(!hadFinal)target.value=original;
    cleanup(hadFinal?'Sprache übernommen. Du kannst den Text jetzt noch korrigieren.':'Aufnahme beendet.','');
  };

  try{recognition.start();}catch(e){cleanup('Spracherkennung konnte nicht gestartet werden. Bitte erneut versuchen.','error');}
}

function addSpeechTools60(targetId){
  const target=byId60(targetId);if(!target||target.dataset.dg60Speech==='1')return;
  target.dataset.dg60Speech='1';

  const tools=document.createElement('div');tools.className='dg60-speech-tools';
  const mic=document.createElement('button');mic.type='button';mic.className='btn primary dg60-speech-btn';mic.textContent='🎤 Sprache zu Text';
  const clear=document.createElement('button');clear.type='button';clear.className='btn secondary';clear.textContent='Text löschen';
  const stat=document.createElement('div');stat.id='dg60SpeechStatus-'+targetId;stat.className='dg60-speech-status';

  mic.addEventListener('click',()=>startSpeech60(targetId,mic));
  clear.addEventListener('click',()=>{
    if(activeSpeechTarget60===targetId)stopSpeech60();
    target.value='';target.dispatchEvent(new Event('input',{bubbles:true}));target.focus();status60(targetId,'Text gelöscht.','');
  });
  tools.append(mic,clear);
  target.insertAdjacentElement('afterend',tools);tools.insertAdjacentElement('afterend',stat);

  if(!speechCtor60()){
    mic.disabled=true;mic.classList.remove('primary');mic.classList.add('secondary');
    status60(targetId,'Sprache-zu-Text ist in diesem Browser nicht verfügbar. Chrome oder Edge verwenden.','warn');
  }
}

function install60(){
  addCss60();
  setVisibleVersion60();
  enhanceYesNo60('photosUsed');
  enhanceYesNo60('materialUsed');
  enhanceYesNo60('jobCompleted');
  addSpeechTools60('activity');
  addSpeechTools60('material');
}

const oldOpenMain60=window.openMain;
if(typeof oldOpenMain60==='function')window.openMain=function(){const r=oldOpenMain60.apply(this,arguments);setTimeout(install60,0);setTimeout(install60,300);return r;};
const oldShowEmployee60=window.showEmployee;
if(typeof oldShowEmployee60==='function')window.showEmployee=function(){const r=oldShowEmployee60.apply(this,arguments);setTimeout(install60,0);return r;};

if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install60);else install60();
setTimeout(install60,500);
})();
;

/* ===== CONSOLIDATED SOURCE: app-6.0.1-fix.js ===== */
/* DG Zeiterfassung 7.4.1 - UI-Farben, Kalender-Refresh und zentraler Versionsstempel */
(function(){
'use strict';
const V='7.4.1';
const q=id=>document.getElementById(id);
let stamping=false;

function stamp(){
  if(stamping)return;
  stamping=true;
  try{
    if(document.title!=='DG Zeiterfassung '+V)document.title='DG Zeiterfassung '+V;
    document.querySelectorAll('.login-card .muted.small,#loginScreen .center.muted.small').forEach(x=>{
      if(/^Version /.test((x.textContent||'').trim())&&x.textContent!=='Version '+V)x.textContent='Version '+V;
    });
    document.querySelectorAll('.hero strong,#mainScreen .hero .head-row strong').forEach(x=>{
      if(/Zeiterfassung/.test(x.textContent||'')&&x.textContent!=='Zeiterfassung - '+V)x.textContent='Zeiterfassung - '+V;
    });
    try{window.DG_APP_VERSION=V;if(window.DG3)DG3.version=V;}catch(_e){}
  }finally{stamping=false;}
}

function watchVersion(){
  if(window.__dg602VersionWatch)return;
  window.__dg602VersionWatch=true;
  const obs=new MutationObserver(()=>stamp());
  obs.observe(document.documentElement,{subtree:true,childList:true,characterData:true});
}

function css(){
  if(q('dg601Css'))return;
  const s=document.createElement('style');s.id='dg601Css';s.textContent=`
    .dg60-choice.dg60-yes{background:#dcfce7!important;color:#166534!important;border-color:#86efac!important}
    .dg60-choice.dg60-no{background:#fee2e2!important;color:#991b1b!important;border-color:#fca5a5!important}
    .dg60-choice.dg60-yes.active{background:#166534!important;color:#fff!important;border-color:#166534!important;box-shadow:0 0 0 3px rgba(22,101,52,.12)}
    .dg60-choice.dg60-no.active{background:#b91c1c!important;color:#fff!important;border-color:#b91c1c!important;box-shadow:0 0 0 3px rgba(185,28,28,.12)}
  `;document.head.appendChild(s);
}

/* Nach einer Besichtigung muss die Kalenderliste zwingend frisch vom Backend geladen werden.
   Sonst zeigt ein alter lokaler Kalendercache den bereits erledigten Termin erneut an. */
const oldApi=window.api;
if(typeof oldApi==='function'&&!window.__dg601ApiWrapped){
  window.__dg601ApiWrapped=true;
  window.api=api=async function(payload){
    const r=await oldApi.apply(this,arguments);
    if(payload&&payload.action==='createInspectionOffer'){
      try{
        const employee=(typeof auth==='function'?auth().employee:'')||payload.employee||'';
        if(employee){
          localStorage.removeItem('dg_calendar_'+employee);
          localStorage.removeItem('dg51_calendar_ts_'+employee);
        }
      }catch(_e){}
    }
    return r;
  };
}

function boot(){stamp();watchVersion();css();}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
setTimeout(boot,50);
setTimeout(stamp,250);
setTimeout(stamp,750);
})();
;

/* ===== CONSOLIDATED SOURCE: app-6.0.2-reminders.js ===== */
/* DG Zeiterfassung 7.4.1 - Eigene Reminder mit Sprache, Bildern und Dateien */
(function(){
'use strict';
const V='7.4.1';
const $2=id=>document.getElementById(id);
let ownSpeech=null;

function esc2(v){return String(v==null?'':v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function fmtSize(n){n=Number(n)||0;if(n<1024)return n+' B';if(n<1024*1024)return (n/1024).toFixed(1).replace('.',',')+' KB';return (n/1024/1024).toFixed(1).replace('.',',')+' MB';}
function tomorrow(){const d=new Date();d.setDate(d.getDate()+1);return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');}

function css(){
  if($2('dg602Css'))return;
  const s=document.createElement('style');s.id='dg602Css';s.textContent=`
    #d3Reminder>.dg48-head{display:flex;align-items:center;gap:10px}
    #d3Reminder>.dg48-head h2{flex:1}
    #d3Reminder>.dg48-head .dg48-toggle{order:2}
    #dg602AddReminder{order:1;width:48px;height:48px;border:0;border-radius:14px;background:#166534;color:#fff;font-size:34px;line-height:1;font-weight:900;cursor:pointer;display:flex;align-items:center;justify-content:center;box-shadow:0 4px 12px rgba(22,101,52,.18)}
    #dg602AddReminder:hover{background:#14532d}
    #dg602AddReminder:focus-visible{outline:3px solid #86efac;outline-offset:2px}
    .dg602-modal-form{max-width:760px}
    .dg602-modal-form textarea{min-height:150px;resize:vertical}
    .dg602-text-tools,.dg602-file-tools{display:flex;gap:10px;flex-wrap:wrap;margin:8px 0 12px}
    .dg602-text-tools .btn,.dg602-file-tools .btn{width:auto!important;margin:0!important}
    .dg602-mic.listening{background:#b91c1c!important;color:#fff!important}
    .dg602-files{display:grid;gap:7px;margin:8px 0 12px}
    .dg602-file{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:9px 11px;border:1px solid #d7dee8;border-radius:10px;background:#f8fafc}
    .dg602-file button{border:0;background:#fee2e2;color:#991b1b;border-radius:8px;font-weight:900;cursor:pointer;padding:6px 9px}
    .dg602-own-text{white-space:pre-wrap;margin:10px 0;font-size:16px}
    .dg602-attachments{display:flex;gap:8px;flex-wrap:wrap;margin:9px 0}
    .dg602-attachment{display:inline-flex;align-items:center;gap:6px;padding:8px 10px;border-radius:10px;background:#eef2ff;text-decoration:none;font-weight:800;color:#1e3a8a}
    .dg602-own-badge{background:#dcfce7!important;color:#166534!important}
    @media(max-width:720px){#dg602AddReminder{width:44px;height:44px}.dg602-text-tools,.dg602-file-tools{display:grid;grid-template-columns:1fr 1fr}.dg602-text-tools .btn,.dg602-file-tools .btn{width:100%!important}}
  `;document.head.appendChild(s);
}

function installPlus(){
  const section=$2('d3Reminder'),head=section?.querySelector(':scope > .dg48-head');if(!head)return false;
  let b=$2('dg602AddReminder');if(b)return true;
  b=document.createElement('button');b.type='button';b.id='dg602AddReminder';b.setAttribute('aria-label','Eigenen Reminder hinzufügen');b.title='Eigenen Reminder hinzufügen';b.textContent='+';
  head.appendChild(b);
  b.addEventListener('click',e=>{e.preventDefault();e.stopPropagation();openOwnReminderModal();});
  return true;
}

function speechCtor(){return window.SpeechRecognition||window.webkitSpeechRecognition||null;}
function stopSpeech(){if(ownSpeech){try{ownSpeech.stop();}catch(_e){}}}
function startSpeech(textarea,btn,status){
  const C=speechCtor();if(!C){status.textContent='Sprache-zu-Text wird von diesem Browser nicht unterstützt. Bitte Chrome oder Edge verwenden.';status.className='status warn';return;}
  if(ownSpeech){stopSpeech();return;}
  const rec=new C();ownSpeech=rec;rec.lang='de-DE';rec.continuous=true;rec.interimResults=true;rec.maxAlternatives=1;
  const original=String(textarea.value||'').trimEnd(),prefix=original?original+'\n':'';let finalText='',hadFinal=false;
  rec.onstart=()=>{btn.classList.add('listening');btn.textContent='⏹ Aufnahme stoppen';status.className='status ok';status.textContent='Aufnahme läuft – erkannter Text wird angehängt.';};
  rec.onresult=e=>{let interim='';for(let i=e.resultIndex;i<e.results.length;i++){const t=String(e.results[i][0]?.transcript||'').trim();if(!t)continue;if(e.results[i].isFinal){finalText+=(finalText?' ':'')+t;hadFinal=true;}else interim+=(interim?' ':'')+t;}textarea.value=prefix+(finalText+(interim?(finalText?' ':'')+interim:'')).trim();textarea.dispatchEvent(new Event('input',{bubbles:true}));};
  rec.onerror=e=>{const msg=(e.error==='not-allowed'||e.error==='service-not-allowed')?'Mikrofonzugriff wurde nicht erlaubt.':e.error==='no-speech'?'Keine Sprache erkannt. Bitte erneut versuchen.':'Spracherkennung konnte nicht gestartet werden.';status.className='status error';status.textContent=msg;};
  rec.onend=()=>{if(!hadFinal&&textarea.value.trim()===prefix.trim())textarea.value=original;btn.classList.remove('listening');btn.textContent='🎤 Sprache zu Text';if(!status.classList.contains('error')){status.className='muted small';status.textContent=hadFinal?'Sprache übernommen.':'';}ownSpeech=null;};
  try{rec.start();}catch(_e){ownSpeech=null;status.className='status error';status.textContent='Spracherkennung konnte nicht gestartet werden.';}
}

function readFile(file){return new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve({name:file.name,type:file.type||'application/octet-stream',dataUrl:String(r.result||'')});r.onerror=()=>reject(new Error('Datei konnte nicht gelesen werden: '+file.name));r.readAsDataURL(file);});}

function openOwnReminderModal(){
  $2('d3OwnReminderModal')?.remove();stopSpeech();
  const modal=document.createElement('div');modal.id='d3OwnReminderModal';modal.className='d3-modal';
  modal.innerHTML='<form class="d3-form dg602-modal-form"><h2>Eigenen Reminder hinzufügen</h2><div class="d3-fields"><label for="dg602Text">Reminder</label><textarea id="dg602Text" required placeholder="Was soll erinnert werden?"></textarea><div class="dg602-text-tools"><button type="button" class="btn primary dg602-mic">🎤 Sprache zu Text</button><button type="button" class="btn secondary dg602-clear">Text löschen</button></div><div class="dg602-speech-status muted small"></div><label for="dg602Due">Fällig am</label><input id="dg602Due" type="date" required><label>Bilder / Dateien</label><div class="dg602-file-tools"><button type="button" class="btn primary dg602-pick">📎 Bilder / Dateien hinzufügen</button><button type="button" class="btn secondary dg602-clear-files">Anhänge leeren</button></div><input class="dg602-input hidden" type="file" multiple accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.txt,.csv,.zip"><div class="muted small">Maximal 5 Anhänge · höchstens 5 MB je Datei. Bilder, PDF, Word, Excel, TXT, CSV oder ZIP.</div><div class="dg602-files"></div></div><div class="dg602-save-status"></div><div class="report-actions"><button type="submit" class="btn success">Reminder speichern</button><button type="button" class="btn secondary dg602-cancel">Abbrechen</button></div></form>';
  document.body.appendChild(modal);
  const form=modal.querySelector('form'),text=modal.querySelector('#dg602Text'),due=modal.querySelector('#dg602Due'),input=modal.querySelector('.dg602-input'),filesBox=modal.querySelector('.dg602-files'),speechStatus=modal.querySelector('.dg602-speech-status'),saveStatus=modal.querySelector('.dg602-save-status');let selected=[];
  due.value=tomorrow();
  function drawFiles(){filesBox.innerHTML=selected.map((f,i)=>'<div class="dg602-file"><span>📎 '+esc2(f.name)+' <small>('+fmtSize(f.size)+')</small></span><button type="button" data-i="'+i+'" aria-label="Anhang entfernen">×</button></div>').join('');}
  modal.querySelector('.dg602-mic').onclick=()=>startSpeech(text,modal.querySelector('.dg602-mic'),speechStatus);
  modal.querySelector('.dg602-clear').onclick=()=>{text.value='';text.focus();};
  modal.querySelector('.dg602-pick').onclick=()=>input.click();
  modal.querySelector('.dg602-clear-files').onclick=()=>{selected=[];input.value='';drawFiles();};
  filesBox.onclick=e=>{const b=e.target.closest('button[data-i]');if(!b)return;selected.splice(Number(b.dataset.i),1);drawFiles();};
  input.onchange=()=>{const incoming=[...input.files];input.value='';for(const f of incoming){if(selected.length>=5)break;if(f.size>5*1024*1024){alert('Datei ist größer als 5 MB: '+f.name);continue;}selected.push(f);}if(incoming.length&&selected.length>=5&&incoming.length+selected.length>5)alert('Maximal 5 Anhänge pro Reminder.');drawFiles();};
  modal.querySelector('.dg602-cancel').onclick=()=>{if(form.dataset.busy)return;stopSpeech();modal.remove();};
  form.onsubmit=async e=>{e.preventDefault();if(form.dataset.busy||!form.reportValidity())return;form.dataset.busy='1';form.querySelectorAll('button').forEach(b=>b.disabled=true);saveStatus.className='status info';saveStatus.textContent='Reminder wird gespeichert ...';try{const payload=[];for(const f of selected)payload.push(await readFile(f));await api(chefPayload({action:'createOwnReminder',item:{text:text.value.trim(),dueDate:due.value,files:payload}}));stopSpeech();modal.remove();await loadReminders();if(typeof d3Dashboard==='function')await d3Dashboard(true);}catch(err){saveStatus.className='status error';saveStatus.textContent=err.message;}finally{delete form.dataset.busy;form.querySelectorAll('button').forEach(b=>b.disabled=false);}};
  text.focus();
}
window.dg602OpenOwnReminder=openOwnReminderModal;

function ownAttachments(r){const a=Array.isArray(r.attachments)?r.attachments:[];if(!a.length)return'';return '<div class="dg602-attachments">'+a.map(x=>'<a class="dg602-attachment" target="_blank" rel="noopener noreferrer" href="'+esc2(x.url||'#')+'">📎 '+esc2(x.name||'Datei')+'</a>').join('')+'</div>';}
function ownCard(r,index){return '<div class="report-card'+(index%2?' d3-alt':'')+'"><div class="d3-head"><strong>Eigener Reminder</strong><span class="badge dg602-own-badge">Eigener Reminder</span></div><div class="status '+(r.isOverdue?'warn':'info')+'">Fällig: '+esc2(formatDateDE(r.dueDate))+'</div><div class="dg602-own-text">'+esc2(r.text)+'</div>'+ownAttachments(r)+'<div class="muted small">Erstellt '+esc2(r.createdAt||'')+(r.createdBy?' · '+esc2(r.createdBy):'')+'</div><div class="report-actions">'+d3Button('Erledigt','d3OwnReminderDone',[r.id],'success')+d3Button('Verschieben','d3OwnReminderDate',[r.id])+d3Button('Löschen','d3OwnReminderDelete',[r.id],'danger')+'</div></div>';}

window.loadReminders=loadReminders=async function(){
  installPlus();setMessage('d3ReminderStatus','Reminder werden geladen ...','info');
  try{
    const [offers,inquiries,own]=await Promise.all([
      api(chefPayload({action:'getOfferReminders',includeDone:false})),
      api(chefPayload({action:'getInquiryReminders',includeDone:false})),
      api(chefPayload({action:'getOwnReminders',includeDone:false}))
    ]);
    DG3.offerReminders=offers||[];DG3.inquiryReminders=inquiries||[];DG3.ownReminders=own||[];
    const offerHtml=(offers||[]).map((r,i)=>'<div class="report-card'+(i%2?' d3-alt':'')+'"><div class="d3-head"><strong>'+esc2(r.customer)+' - '+esc2(r.offerNumber)+'</strong><span class="badge">Angebot</span></div><div class="status '+(r.isOverdue?'warn':'info')+'">Fällig: '+esc2(formatDateDE(r.dueDate))+'</div><div>'+esc2(r.description)+'</div><div>Telefon: <a target="_blank" rel="noopener noreferrer" href="tel:'+esc2(r.phone)+'">'+esc2(r.phone)+'</a></div><div class="report-actions">'+d3Button('Angenommen','d3ReminderDecision',[r.id,true],'success')+d3Button('Kein Auftrag','d3ReminderDecision',[r.id,false],'secondary')+d3Button('Verschieben','d3ReminderDate',[r.id])+'</div></div>').join('');
    const inquiryHtml=(inquiries||[]).map((r,i)=>'<div class="report-card'+(((offers||[]).length+i)%2?' d3-alt':'')+'"><div class="d3-head"><strong>'+esc2(r.customer)+'</strong><span class="badge">Anfrage · '+esc2(r.source)+'</span></div><div class="status '+(r.isOverdue?'warn':'info')+'">Erinnerung: '+esc2(formatDateDE(r.dueDate))+'</div><div>'+esc2(r.description)+'</div>'+(r.internalNote?'<div class="status info">Interne Notiz: '+esc2(r.internalNote)+'</div>':'')+'<div class="report-actions">'+(typeof d33ExternalInquiryLinks==='function'?d33ExternalInquiryLinks(r):'')+d3Button('Zurück zu offenen Anfragen','d3InquiryReminderReopen',[r.id])+d3Button('Termin wurde vereinbart','d3InquiryReminderArchive',[r.id],'success')+d3Button('Interne Notiz','d3InquiryReminderNote',[r.id])+d3Button('Ablehnen','d3InquiryReminderReject',[r.id],'danger')+'</div></div>').join('');
    const offset=(offers||[]).length+(inquiries||[]).length,ownHtml=(own||[]).map((r,i)=>ownCard(r,offset+i)).join('');
    $2('d3ReminderList').innerHTML=offerHtml+inquiryHtml+ownHtml||'Keine offenen Reminder.';
    const total=(offers||[]).length+(inquiries||[]).length+(own||[]).length,due=(offers||[]).filter(x=>x.isDue).length+(inquiries||[]).filter(x=>x.isDue).length+(own||[]).filter(x=>x.isDue).length;
    setMessage('d3ReminderStatus',total+' offene Reminder, '+due+' fällig.','ok');d3Count('reminders',due);
    return{offers:offers||[],inquiries:inquiries||[],own:own||[]};
  }catch(e){setMessage('d3ReminderStatus',e.message,'error');throw e;}
};

window.d3OwnReminderDone=async function(id){if(!confirm('Diesen eigenen Reminder als erledigt markieren?'))return;await api(chefPayload({action:'completeOwnReminder',reminderId:id}));await loadReminders();};
window.d3OwnReminderDate=function(id){const r=(DG3.ownReminders||[]).find(x=>x.id===id);if(!r)throw new Error('Bitte Reminder neu laden.');d3Form('Eigenen Reminder verschieben',[{name:'dueDate',label:'Neues Datum',type:'date',required:true}],{dueDate:r.dueDate},async v=>{await api(chefPayload({action:'rescheduleOwnReminder',reminderId:id,dueDate:v.dueDate}));await loadReminders();});};
window.d3OwnReminderDelete=async function(id){if(!confirm('Diesen eigenen Reminder einschließlich seiner Anhänge löschen?'))return;await api(chefPayload({action:'deleteOwnReminder',reminderId:id}));await loadReminders();};

function install(){css();installPlus();try{if(window.DG3&&DG3.loaders)DG3.loaders.d3Reminder=window.loadReminders;}catch(_e){}}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});else install();
setTimeout(install,100);setTimeout(install,600);setTimeout(install,1600);
})();
;

/* ===== CONSOLIDATED SOURCE: app-6.0.3-final.js ===== */
/* DG Zeiterfassung 7.4.1 - finaler Produktions-Hardening-Layer */
(function(){
'use strict';
const V='7.4.1';
const BACKEND_URL='https://script.google.com/macros/s/AKfycby2L3SMgh2RoGWsNRUp6o11g4iyZ8bgkSIGaAZPnBXCkJTkDDGF9aydn9vVKMB7kXsO/exec';
const TOKEN_KEY='dg_device_session';
function $(id){return document.getElementById(id);}
function isBoss(){try{return localStorage.getItem('dg_chef_access')==='1';}catch(_e){return false;}}
function stamp(){
  document.title='DG Zeiterfassung '+V;
  document.querySelectorAll('.login-card .muted.small').forEach(function(x){if(/^Version\s+/i.test((x.textContent||'').trim()))x.textContent='Version '+V;});
  document.querySelectorAll('.hero strong').forEach(function(x){if(/Zeiterfassung/i.test(x.textContent||''))x.textContent='Zeiterfassung - '+V;});
  try{window.DG_APP_VERSION=V;window.DG_RELEASE=V;if(window.DG3)DG3.version=V;}catch(_e){}
}
function clearOldCaches(){try{['dg60_backend','dg602_backend','dg51_backend'].forEach(function(k){sessionStorage.removeItem(k);});}catch(_e){}}

/* Alte Basisversionen koennen im Hintergrund Chef-Leseaktionen anstossen. Normale Monteure erhalten lokal leere Daten statt unnoetiger Backend-Fehler. */
const bossReadArray=new Set(['getPlannerWorkers','getOfferReports','getOfferReminders','getBossDayClosures','getCustomerInquiries','getRegieReports','getAbsences','getMaintenanceOverview']);
const rawApi=window.api;
if(typeof rawApi==='function')window.api=api=async function(payload){
  const action=String(payload&&payload.action||'');
  if(!isBoss()&&bossReadArray.has(action)){
    if(action==='getMaintenanceOverview')return {currentMonthOpen:0,months:[],windowLabel:''};
    return [];
  }
  return rawApi.apply(this,arguments);
};

/* Falls alte Erweiterungsschichten mehrere Sync-Timer gestartet haben, werden deren Aufrufe zentral entprellt. */
const rawSync=window.d3Sync;let lastSync=0,syncPromise=null;
if(typeof rawSync==='function')window.d3Sync=d3Sync=function(){
  const now=Date.now();
  if(syncPromise)return syncPromise;
  if(now-lastSync<45000)return Promise.resolve();
  lastSync=now;
  try{
    const r=rawSync.apply(this,arguments);
    if(r&&typeof r.then==='function'){syncPromise=Promise.resolve(r).finally(function(){syncPromise=null;});return syncPromise;}
    return r;
  }catch(e){syncPromise=null;throw e;}
};

/* Abmelden immer ueber den aktuellen Backend-Pfad. Lokale Sitzung wird sofort beendet; Server-Token wird best effort widerrufen. */
window.logout=logout=function(){
  let employee='',token='';
  try{employee=localStorage.getItem('dg_employee')||'';token=localStorage.getItem(TOKEN_KEY)||'';}catch(_e){}
  try{
    localStorage.removeItem('dg_employee');localStorage.removeItem(TOKEN_KEY);localStorage.removeItem('dg_chef_access');localStorage.removeItem('dg_employee_pin');
    sessionStorage.removeItem('dg_employee_pin');sessionStorage.removeItem('dg603_backend');sessionStorage.removeItem('dg602_backend');sessionStorage.removeItem('dg60_backend');sessionStorage.removeItem('dg51_backend');
  }catch(_e){}
  if($('mainScreen'))$('mainScreen').classList.add('hidden');
  if($('loginScreen'))$('loginScreen').classList.remove('hidden');
  if($('loginPin'))$('loginPin').value='';
  if(navigator.onLine&&employee&&token){
    fetch(BACKEND_URL,{method:'POST',headers:{'Content-Type':'text/plain;charset=utf-8'},body:JSON.stringify({action:'employeeLogout',employee:employee,deviceSessionToken:token,clientVersion:V})}).catch(function(){});
  }
};

function boot(){clearOldCaches();stamp();setTimeout(stamp,350);setTimeout(stamp,1200);}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();
;

/* ===== CONSOLIDATED SOURCE: app-6.0.3-reminder-notes.js ===== */
/* DG Zeiterfassung 7.4.1 - Interne Notizen fuer eigene Reminder */
(function(){
'use strict';
if(window.__dg603ReminderNotes)return;
window.__dg603ReminderNotes=true;
let speech=null;
const byId=id=>document.getElementById(id);
const esc=v=>String(v==null?'':v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot',"'":'&#39;'}[c]));

function ensureCss(){
  if(byId('dg603ReminderNoteCss'))return;
  const s=document.createElement('style');s.id='dg603ReminderNoteCss';s.textContent=`
    .dg603-own-note{white-space:pre-wrap;margin:10px 0;padding:11px 13px;border-left:4px solid #d97706;background:#fff7ed;border-radius:8px;color:#7c2d12}
    .dg603-own-note strong{display:block;margin-bottom:4px}
    .dg603-note-form{max-width:760px}
    .dg603-note-form textarea{min-height:170px;resize:vertical}
    .dg603-note-tools{display:flex;gap:10px;flex-wrap:wrap;margin:8px 0 12px}
    .dg603-note-tools .btn{width:auto!important;margin:0!important}
    .dg603-note-mic.listening{background:#b91c1c!important;color:#fff!important}
  `;document.head.appendChild(s);
}

function stopSpeech(){if(speech){try{speech.stop();}catch(_e){}}}
function startSpeech(textarea,btn,status){
  const C=window.SpeechRecognition||window.webkitSpeechRecognition;
  if(!C){status.className='status warn';status.textContent='Sprache-zu-Text wird von diesem Browser nicht unterstützt. Bitte Chrome oder Edge verwenden.';return;}
  if(speech){stopSpeech();return;}
  const rec=new C();speech=rec;rec.lang='de-DE';rec.continuous=true;rec.interimResults=true;rec.maxAlternatives=1;
  const original=String(textarea.value||'').trimEnd(),prefix=original?original+'\n':'';let finalText='',hadFinal=false;
  rec.onstart=()=>{btn.classList.add('listening');btn.textContent='⏹ Aufnahme stoppen';status.className='status ok';status.textContent='Aufnahme läuft – erkannter Text wird angehängt.';};
  rec.onresult=e=>{let interim='';for(let i=e.resultIndex;i<e.results.length;i++){const t=String(e.results[i][0]?.transcript||'').trim();if(!t)continue;if(e.results[i].isFinal){finalText+=(finalText?' ':'')+t;hadFinal=true;}else interim+=(interim?' ':'')+t;}textarea.value=prefix+(finalText+(interim?(finalText?' ':'')+interim:'')).trim();};
  rec.onerror=e=>{status.className='status error';status.textContent=(e.error==='not-allowed'||e.error==='service-not-allowed')?'Mikrofonzugriff wurde nicht erlaubt.':e.error==='no-speech'?'Keine Sprache erkannt. Bitte erneut versuchen.':'Spracherkennung konnte nicht gestartet werden.';};
  rec.onend=()=>{if(!hadFinal&&textarea.value.trim()===prefix.trim())textarea.value=original;btn.classList.remove('listening');btn.textContent='🎤 Sprache zu Text';if(!status.classList.contains('error')){status.className='muted small';status.textContent=hadFinal?'Sprache übernommen.':'';}speech=null;};
  try{rec.start();}catch(_e){speech=null;status.className='status error';status.textContent='Spracherkennung konnte nicht gestartet werden.';}
}

function decorateOwnReminders(){
  ensureCss();
  const list=(window.DG3&&Array.isArray(DG3.ownReminders))?DG3.ownReminders:[];
  const cards=[...document.querySelectorAll('#d3ReminderList .report-card')].filter(c=>c.querySelector('.dg602-own-badge'));
  cards.forEach((card,i)=>{
    const r=list[i];if(!r)return;
    card.querySelectorAll('.dg603-own-note,.dg603-note-button-wrap').forEach(x=>x.remove());
    if(r.internalNote){
      const box=document.createElement('div');box.className='dg603-own-note';box.innerHTML='<strong>Interne Notiz</strong>'+esc(r.internalNote);
      const meta=card.querySelector('.muted.small');if(meta)meta.before(box);else card.appendChild(box);
    }
    const actions=card.querySelector('.report-actions');
    if(actions&&typeof window.d3Button==='function'){
      const wrap=document.createElement('span');wrap.className='dg603-note-button-wrap';wrap.innerHTML=d3Button('Interne Notiz','d3OwnReminderNote',[r.id]);
      const del=[...actions.querySelectorAll('button')].find(b=>/Löschen/i.test(b.textContent||''));
      if(del)actions.insertBefore(wrap,del);else actions.appendChild(wrap);
    }
  });
}

function openNote(id){
  const r=(window.DG3&&Array.isArray(DG3.ownReminders)?DG3.ownReminders:[]).find(x=>x.id===id);if(!r)throw new Error('Bitte Reminder neu laden.');
  byId('d3OwnReminderNoteModal')?.remove();stopSpeech();ensureCss();
  const modal=document.createElement('div');modal.id='d3OwnReminderNoteModal';modal.className='d3-modal';
  modal.innerHTML='<form class="d3-form dg603-note-form"><h2>Interne Notiz</h2><div class="d3-fields"><label for="dg603OwnNote">Notiz zum eigenen Reminder</label><textarea id="dg603OwnNote" maxlength="5000" placeholder="Interne Notiz eintragen ..."></textarea><div class="dg603-note-tools"><button type="button" class="btn primary dg603-note-mic">🎤 Sprache zu Text</button><button type="button" class="btn secondary dg603-note-clear">Text löschen</button></div><div class="dg603-note-speech muted small"></div></div><div class="dg603-note-status"></div><div class="report-actions"><button type="submit" class="btn success">Notiz speichern</button><button type="button" class="btn secondary dg603-note-cancel">Abbrechen</button></div></form>';
  document.body.appendChild(modal);
  const form=modal.querySelector('form'),text=modal.querySelector('#dg603OwnNote'),status=modal.querySelector('.dg603-note-speech'),save=modal.querySelector('.dg603-note-status'),mic=modal.querySelector('.dg603-note-mic');
  text.value=String(r.internalNote||'');
  mic.onclick=()=>startSpeech(text,mic,status);
  modal.querySelector('.dg603-note-clear').onclick=()=>{text.value='';text.focus();};
  modal.querySelector('.dg603-note-cancel').onclick=()=>{if(form.dataset.busy)return;stopSpeech();modal.remove();};
  form.onsubmit=async e=>{e.preventDefault();if(form.dataset.busy)return;form.dataset.busy='1';form.querySelectorAll('button').forEach(b=>b.disabled=true);save.className='status info';save.textContent='Interne Notiz wird gespeichert ...';try{await api(chefPayload({action:'saveOwnReminderInternalNote',reminderId:id,note:text.value.trim()}));stopSpeech();modal.remove();await loadReminders();}catch(err){save.className='status error';save.textContent=err.message;}finally{delete form.dataset.busy;form.querySelectorAll('button').forEach(b=>b.disabled=false);}};
  text.focus();text.setSelectionRange(text.value.length,text.value.length);
}

window.d3OwnReminderNote=function(id){openNote(id);};

function install(){
  ensureCss();
  const base=window.loadReminders;
  if(typeof base==='function'&&!base.__dg603NoteWrapped){
    const wrapped=async function(){const result=await base.apply(this,arguments);decorateOwnReminders();return result;};
    wrapped.__dg603NoteWrapped=true;
    window.loadReminders=loadReminders=wrapped;
    try{if(window.DG3&&DG3.loaders)DG3.loaders.d3Reminder=wrapped;}catch(_e){}
  }
  decorateOwnReminders();
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>setTimeout(install,0),{once:true});else setTimeout(install,0);
setTimeout(install,300);setTimeout(install,1200);
})();
;

/* ===== CONSOLIDATED SOURCE: app-7.0-shopping.js ===== */
/* DG Zeiterfassung 7.1 - Einkaufsliste + Angebotskachel-Navigation */
(function(){
'use strict';

const STORE='dg71_shopping_lists_v1';
const q=id=>document.getElementById(id);
const esc70=v=>String(v==null?'':v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let shopRecognition=null;
let shopMode='new';
let shopEditId='';

function uid70(){return 'SHOP-'+Date.now()+'-'+Math.random().toString(36).slice(2,10);}
function today70(){const d=new Date();return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');}
function fmtDate70(v){
  if(typeof window.formatDateDE==='function'){try{return window.formatDateDE(v);}catch(_e){}}
  const p=String(v||'').split('-');return p.length===3?p[2]+'.'+p[1]+'.'+p[0]:String(v||'');
}
function read70(){
  try{
    const rows=JSON.parse(localStorage.getItem(STORE)||'[]');
    return Array.isArray(rows)?rows:[];
  }catch(_e){return [];}
}
function write70(rows){
  try{localStorage.setItem(STORE,JSON.stringify(rows));}
  catch(_e){alert('Einkaufslisten konnten auf diesem Gerät nicht gespeichert werden.');return false;}
  updateTile70();
  return true;
}
function cleanLine70(v){return String(v||'').trim().replace(/^[-–—•*]+\s*/,'').trim();}
function lines70(text){
  return String(text||'').split(/\r?\n/).map(cleanLine70).filter(Boolean).slice(0,200);
}
function lineText70(items){
  const a=(items||[]).map(x=>cleanLine70(typeof x==='string'?x:x.text)).filter(Boolean);
  return a.length?a.map(x=>'- '+x).join('\n'):'- ';
}
function normalizeTextarea70(el){
  if(!el)return;
  const arr=lines70(el.value);
  el.value=arr.length?arr.map(x=>'- '+x).join('\n'):'- ';
}
function dueClass70(date){
  const d=String(date||'');
  if(!d)return '';
  const t=today70();
  if(d<t)return ' overdue';
  if(d===t)return ' today';
  return '';
}

function css70(){
  if(q('dg70ShoppingCss'))return;
  const s=document.createElement('style');s.id='dg70ShoppingCss';
  s.textContent=`
    .d3-tile.shopping{background:#e0f2fe!important;color:#075985!important}
    .d3-tile.shopping strong,.d3-tile.shopping span{color:#075985!important}
    .dg70-shop-overlay{position:fixed;inset:0;z-index:10000;background:rgba(15,23,42,.58);display:flex;align-items:center;justify-content:center;padding:18px}
    .dg70-shop-window{width:min(980px,96vw);max-height:92vh;overflow:auto;background:#fff;border-radius:18px;box-shadow:0 24px 70px rgba(0,0,0,.28);padding:20px}
    .dg70-shop-head{display:flex;align-items:center;gap:12px;justify-content:space-between;margin-bottom:14px}
    .dg70-shop-head h2{margin:0}
    .dg70-shop-close{border:0;background:#e5e7eb;border-radius:10px;font-size:24px;font-weight:900;width:42px;height:42px;cursor:pointer}
    .dg70-shop-toolbar{display:flex;gap:10px;flex-wrap:wrap;margin:10px 0 16px}
    .dg70-shop-list{display:grid;gap:12px}
    .dg70-shop-card{border:1px solid #d8dee8;border-radius:15px;padding:15px;background:#fff}
    .dg70-shop-card:nth-child(even){background:#f8fafc}
    .dg70-shop-card-head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;flex-wrap:wrap}
    .dg70-shop-customer{font-size:18px;font-weight:900;color:#111827}
    .dg70-shop-date{display:inline-flex;align-items:center;padding:7px 10px;border-radius:10px;background:#dbeafe;color:#1e3a8a;font-weight:900}
    .dg70-shop-date.today{background:#ffedd5;color:#9a3412}
    .dg70-shop-date.overdue{background:#fee2e2;color:#991b1b}
    .dg70-shop-items{display:grid;gap:7px;margin:13px 0}
    .dg70-shop-item{display:grid;grid-template-columns:minmax(0,1fr) auto;align-items:center;gap:10px;padding:8px 10px;border-radius:10px;background:#f8fafc;border:1px solid #e5e7eb}
    .dg70-shop-item-text{font-weight:700;white-space:pre-wrap;overflow-wrap:anywhere}
    .dg70-shop-remove{border:0;border-radius:9px;background:#b91c1c;color:#fff;font-weight:900;padding:8px 11px;cursor:pointer}
    .dg70-shop-actions{display:flex;gap:9px;flex-wrap:wrap;margin-top:10px}
    .dg70-shop-actions .btn{width:auto!important;margin:0!important}
    .dg70-shop-empty{padding:18px;border:1px dashed #cbd5e1;border-radius:13px;color:#64748b;text-align:center;font-weight:700}
    .dg70-shop-form{display:grid;gap:10px}
    .dg70-shop-form label{font-weight:900}
    .dg70-shop-form input,.dg70-shop-form textarea{width:100%;box-sizing:border-box}
    .dg70-shop-form textarea{min-height:190px;resize:vertical;font-size:17px;line-height:1.55}
    .dg70-shop-speech{display:flex;gap:9px;flex-wrap:wrap}
    .dg70-shop-speech .btn{width:auto!important;margin:0!important}
    .dg70-shop-speech .listening{background:#b91c1c!important;color:#fff!important}
    .dg70-shop-status{min-height:18px;font-size:13px;font-weight:800}
    @media(max-width:650px){
      .dg70-shop-overlay{padding:7px}.dg70-shop-window{padding:14px;border-radius:14px;max-height:96vh}
      .dg70-shop-item{grid-template-columns:1fr}.dg70-shop-remove{width:100%}
      .dg70-shop-actions{display:grid;grid-template-columns:1fr 1fr}.dg70-shop-actions .btn{width:100%!important}
    }
  `;
  document.head.appendChild(s);
}

function ensureOffersTile70(){
  const tile=document.querySelector('#bossView .d3-dashboard .d3-tile.offers');
  if(!tile)return;
  const label=tile.querySelector('span');if(label)label.textContent='Angebote zu erstellen';
  tile.dataset.d3Fn='d3TileOpen';
  tile.dataset.d3Args=JSON.stringify(['d3Offers','d3OfferCreate']);
}

function ensureShoppingTile70(){
  const dash=document.querySelector('#bossView .d3-dashboard');if(!dash)return null;
  let tile=dash.querySelector('.d3-tile.shopping');
  if(!tile){
    tile=document.createElement('button');
    tile.type='button';
    tile.className='d3-tile shopping';
    tile.dataset.d3Fn='dg70ShoppingOpen';
    tile.dataset.d3Args='[]';
    tile.innerHTML='<span>Einkauf</span><strong id="d3Count-shopping">0</strong>';
    const offers=dash.querySelector('.d3-tile.offers');
    if(offers)offers.insertAdjacentElement('afterend',tile);else dash.appendChild(tile);
  }
  return tile;
}
function updateTile70(){
  ensureOffersTile70();
  ensureShoppingTile70();
  const c=q('d3Count-shopping');if(c)c.textContent=String(read70().length);
}

function stopSpeech70(){
  if(shopRecognition){try{shopRecognition.stop();}catch(_e){}shopRecognition=null;}
}
function speechCtor70(){return window.SpeechRecognition||window.webkitSpeechRecognition||null;}
function setSpeechState70(on,msg){
  const b=q('dg70ShopMic'),st=q('dg70ShopSpeechStatus');
  if(b){b.classList.toggle('listening',!!on);b.textContent=on?'⏹ Aufnahme stoppen':'🎤 Sprache zu Text';}
  if(st)st.textContent=msg||'';
}
window.dg70ShopSpeech=function(){
  const C=speechCtor70(),ta=q('dg70ShopText');
  if(!ta)return;
  if(shopRecognition){stopSpeech70();setSpeechState70(false,'Aufnahme beendet.');return;}
  if(!C){setSpeechState70(false,'Spracheingabe wird von diesem Browser nicht unterstützt. Bitte Chrome oder Edge verwenden.');return;}
  normalizeTextarea70(ta);
  const rec=new C();shopRecognition=rec;rec.lang='de-DE';rec.continuous=true;rec.interimResults=false;rec.maxAlternatives=1;
  const processed=new Set();let lastFinal='',lastFinalAt=0;
  rec.onstart=()=>setSpeechState70(true,'Aufnahme läuft – für jeden Materialposten kurz eine Sprechpause machen.');
  rec.onresult=e=>{
    for(let i=e.resultIndex;i<e.results.length;i++){
      const result=e.results[i];if(!result||!result.isFinal)continue;
      const t=cleanLine70(result[0]&&result[0].transcript),n=String(t||'').toLowerCase().replace(/\s+/g,' ').trim(),key=String(i)+'|'+n;
      if(!n||processed.has(key))continue;processed.add(key);
      const now=Date.now();if(n===lastFinal&&now-lastFinalAt<3500)continue;lastFinal=n;lastFinalAt=now;
      const existing=lines70(ta.value),last=String(existing[existing.length-1]||'').toLowerCase().replace(/\s+/g,' ').trim();
      if(last===n)continue;
      ta.value=existing.concat([t]).map(x=>'- '+x).join('\n');
      ta.scrollTop=ta.scrollHeight;
      ta.dispatchEvent(new Event('input',{bubbles:true}));
    }
  };
  rec.onerror=e=>setSpeechState70(false,e.error==='not-allowed'?'Mikrofonzugriff wurde nicht erlaubt.':'Spracherkennung konnte nicht gestartet werden.');
  rec.onend=()=>{shopRecognition=null;setSpeechState70(false,'Spracheingabe beendet.');};
  try{rec.start();}catch(_e){shopRecognition=null;setSpeechState70(false,'Spracherkennung konnte nicht gestartet werden.');}
};

function editorHtml70(){
  const title=shopMode==='new'?'Neue Einkaufsliste':'Einkaufsliste erweitern / bearbeiten';
  return '<div class="dg70-shop-head"><h2>'+title+'</h2><button type="button" class="dg70-shop-close" data-shop-close>×</button></div>'+
    '<div class="dg70-shop-form">'+
      '<label for="dg70ShopCustomer">Kunde / Baustelle</label><input id="dg70ShopCustomer" placeholder="z. B. Müller – Badumbau Fürth">'+
      '<label for="dg70ShopDate">Material benötigt am</label><input id="dg70ShopDate" type="date">'+
      '<label for="dg70ShopText">Benötigte / fehlende Materialien</label><textarea id="dg70ShopText" placeholder="- Pressfitting 22 mm\n- 2 x Kugelhahn 1 Zoll"></textarea>'+
      '<div class="dg70-shop-speech"><button type="button" id="dg70ShopMic" class="btn primary" data-shop-speech>🎤 Sprache zu Text</button><button type="button" class="btn secondary" data-shop-normalize>Zeilen formatieren</button></div>'+
      '<div id="dg70ShopSpeechStatus" class="dg70-shop-status"></div>'+
      '<div class="dg70-shop-actions"><button type="button" class="btn success" data-shop-save>Speichern</button><button type="button" class="btn secondary" data-shop-back>Zurück zur Übersicht</button></div>'+
      '<div id="dg70ShopFormStatus" class="dg70-shop-status"></div>'+
    '</div>';
}

function renderEditor70(){
  const w=q('dg70ShopWindow');if(!w)return;
  w.innerHTML=editorHtml70();
  const rows=read70(),row=rows.find(x=>x.id===shopEditId);
  q('dg70ShopCustomer').value=row?row.customer:'';
  q('dg70ShopDate').value=row?row.needDate:today70();
  q('dg70ShopText').value=row?'- ': '- ';
  if(shopMode==='edit'&&row)q('dg70ShopText').value='- ';
  q('dg70ShopText').focus();
}

function listHtml70(){
  const rows=read70().slice().sort((a,b)=>String(a.needDate||'9999').localeCompare(String(b.needDate||'9999'))||String(a.customer||'').localeCompare(String(b.customer||''),'de'));
  const body=rows.length?rows.map(row=>{
    const items=(row.items||[]).map(item=>'<div class="dg70-shop-item"><div class="dg70-shop-item-text">- '+esc70(item.text)+'</div><button type="button" class="dg70-shop-remove" data-shop-remove="'+esc70(row.id)+'" data-item-remove="'+esc70(item.id)+'">Entfernen</button></div>').join('');
    return '<div class="dg70-shop-card">'+
      '<div class="dg70-shop-card-head"><div class="dg70-shop-customer">'+esc70(row.customer)+'</div><div class="dg70-shop-date'+dueClass70(row.needDate)+'">Benötigt: '+esc70(fmtDate70(row.needDate))+'</div></div>'+
      '<div class="dg70-shop-items">'+(items||'<div class="muted">Keine Materialien mehr auf der Liste.</div>')+'</div>'+
      '<div class="dg70-shop-actions"><button type="button" class="btn danger" data-shop-delete="'+esc70(row.id)+'">Löschen</button><button type="button" class="btn success" data-shop-add="'+esc70(row.id)+'">Hinzufügen</button></div>'+
    '</div>';
  }).join(''):'<div class="dg70-shop-empty">Noch keine Einkaufslisten vorhanden.</div>';
  return '<div class="dg70-shop-head"><h2>Einkauf</h2><button type="button" class="dg70-shop-close" data-shop-close>×</button></div>'+
    '<div class="dg70-shop-toolbar"><button type="button" class="btn success" data-shop-new>+ Neue Einkaufsliste</button></div>'+
    '<div class="dg70-shop-list">'+body+'</div>';
}

function renderOverview70(){const w=q('dg70ShopWindow');if(w)w.innerHTML=listHtml70();updateTile70();}

function openShell70(){
  css70();
  let o=q('dg70ShopOverlay');
  if(!o){
    o=document.createElement('div');o.id='dg70ShopOverlay';o.className='dg70-shop-overlay';
    o.innerHTML='<div class="dg70-shop-window" id="dg70ShopWindow" role="dialog" aria-modal="true" aria-label="Einkauf"></div>';
    document.body.appendChild(o);
    o.addEventListener('click',e=>{
      if(e.target===o){window.dg70ShoppingClose();return;}
      const t=e.target.closest('[data-shop-close],[data-shop-new],[data-shop-save],[data-shop-back],[data-shop-speech],[data-shop-normalize],[data-shop-delete],[data-shop-add],[data-shop-remove]');
      if(!t)return;
      if(t.hasAttribute('data-shop-close'))return window.dg70ShoppingClose();
      if(t.hasAttribute('data-shop-new')){shopMode='new';shopEditId='';renderEditor70();return;}
      if(t.hasAttribute('data-shop-back')){stopSpeech70();renderOverview70();return;}
      if(t.hasAttribute('data-shop-speech'))return window.dg70ShopSpeech();
      if(t.hasAttribute('data-shop-normalize')){normalizeTextarea70(q('dg70ShopText'));return;}
      if(t.hasAttribute('data-shop-save'))return saveEditor70();
      if(t.hasAttribute('data-shop-delete'))return deleteList70(t.dataset.shopDelete);
      if(t.hasAttribute('data-shop-add')){shopMode='edit';shopEditId=t.dataset.shopAdd;renderEditor70();return;}
      if(t.hasAttribute('data-shop-remove'))return removeItem70(t.dataset.shopRemove,t.dataset.itemRemove);
    });
    o.addEventListener('keydown',e=>{
      if(e.key==='Escape'){e.preventDefault();window.dg70ShoppingClose();return;}
      const ta=e.target.closest&&e.target.closest('#dg70ShopText');
      if(ta&&e.key==='Enter'&&!e.shiftKey){
        e.preventDefault();
        const start=ta.selectionStart,end=ta.selectionEnd,v=ta.value;
        ta.value=v.slice(0,start)+'\n- '+v.slice(end);
        ta.selectionStart=ta.selectionEnd=start+3;
      }
    });
    o.addEventListener('blur',e=>{if(e.target&&e.target.id==='dg70ShopText')normalizeTextarea70(e.target);},true);
  }
  o.style.display='flex';
}
window.dg70ShoppingOpen=function(){openShell70();shopMode='overview';shopEditId='';renderOverview70();};
window.dg70ShoppingClose=function(){stopSpeech70();const o=q('dg70ShopOverlay');if(o)o.style.display='none';};

function saveEditor70(){
  const customer=String(q('dg70ShopCustomer')&&q('dg70ShopCustomer').value||'').trim();
  const needDate=String(q('dg70ShopDate')&&q('dg70ShopDate').value||'').trim();
  const add=lines70(q('dg70ShopText')&&q('dg70ShopText').value||'');
  const status=q('dg70ShopFormStatus');
  if(!customer){if(status)status.textContent='Bitte Kunde / Baustelle eintragen.';return;}
  if(!needDate){if(status)status.textContent='Bitte angeben, wann das Material benötigt wird.';return;}
  if(!add.length){if(status)status.textContent='Bitte mindestens ein Material eintragen.';return;}
  const rows=read70();
  if(shopMode==='edit'&&shopEditId){
    const row=rows.find(x=>x.id===shopEditId);
    if(!row){if(status)status.textContent='Einkaufsliste wurde nicht gefunden.';return;}
    row.customer=customer;row.needDate=needDate;row.items=row.items||[];
    add.forEach(text=>row.items.push({id:uid70(),text}));
    row.updatedAt=new Date().toISOString();
  }else{
    rows.push({id:uid70(),customer,needDate,items:add.map(text=>({id:uid70(),text})),createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()});
  }
  stopSpeech70();if(write70(rows))renderOverview70();
}
function removeItem70(listId,itemId){
  const rows=read70(),row=rows.find(x=>x.id===listId);if(!row)return;
  row.items=(row.items||[]).filter(x=>x.id!==itemId);row.updatedAt=new Date().toISOString();
  if(write70(rows))renderOverview70();
}
function deleteList70(id){
  const rows=read70(),row=rows.find(x=>x.id===id);if(!row)return;
  if(!confirm('Einkaufsliste für „'+row.customer+'“ komplett löschen?'))return;
  if(write70(rows.filter(x=>x.id!==id)))renderOverview70();
}

function install70(){
  css70();ensureOffersTile70();updateTile70();
}
const oldBoss70=window.showBoss;
if(typeof oldBoss70==='function'&&!window.__dg70ShopBossWrapped){
  window.__dg70ShopBossWrapped=true;
  window.showBoss=function(){const r=oldBoss70.apply(this,arguments);setTimeout(install70,0);return r;};
}
const oldDash70=window.d3Dashboard;
if(typeof oldDash70==='function'&&!window.__dg70ShopDashWrapped){
  window.__dg70ShopDashWrapped=true;
  window.d3Dashboard=async function(){const r=await oldDash70.apply(this,arguments);install70();return r;};
}
window.addEventListener('storage',e=>{if(e.key===STORE){updateTile70();if(q('dg70ShopOverlay')&&q('dg70ShopOverlay').style.display!=='none')renderOverview70();}});
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>setTimeout(install70,0),{once:true});else setTimeout(install70,0);
setTimeout(install70,500);
})();
;

/* ===== CONSOLIDATED SOURCE: app-7.2-fixes.js ===== */
/* DG Zeiterfassung 7.2 - Urlaub/Feiertag-Sperre und Besichtigungszeiten */
(function(){
'use strict';

const V72='7.2';
const q72=id=>document.getElementById(id);
const esc72=v=>String(v==null?'':v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

function stamp72(){
  if(document.title!=='DG Zeiterfassung '+V72)document.title='DG Zeiterfassung '+V72;
  document.querySelectorAll('.login-card .muted.small,#loginScreen .center.muted.small').forEach(x=>{
    if(/^Version\s+/i.test((x.textContent||'').trim())&&x.textContent!=='Version '+V72)x.textContent='Version '+V72;
  });
  document.querySelectorAll('.hero strong,#mainScreen .hero .head-row strong').forEach(x=>{
    if(/Zeiterfassung/i.test(x.textContent||'')&&x.textContent!=='Zeiterfassung - '+V72)x.textContent='Zeiterfassung - '+V72;
  });
  try{window.DG_APP_VERSION=V72;window.DG_RELEASE=V72;if(window.DG3)DG3.version=V72;}catch(_e){}
}

function css72(){
  if(q72('dg72Css'))return;
  const s=document.createElement('style');s.id='dg72Css';
  s.textContent=`
    .dg72-day-lock{margin:12px 0;padding:15px 16px;border-radius:14px;background:#eef2ff;color:#312e81;border:1px solid #c7d2fe;font-weight:800}
    .dg72-day-lock strong{display:block;font-size:18px;margin-bottom:4px}
    .dg72-status-entry{border-left:6px solid #2563eb!important;background:#eff6ff!important}
    .dg72-status-badge{display:inline-flex;align-items:center;padding:3px 8px;border-radius:999px;background:#dbeafe;color:#1e3a8a;font-size:12px;font-weight:900;margin-left:7px}
    .dg72-inspection-note{min-height:120px!important}
    .dg72-report-status{margin:7px 0;padding:7px 9px;border-radius:9px;background:#dbeafe;color:#1e3a8a;font-weight:900}
  `;
  document.head.appendChild(s);
}

/* Urlaub und Feiertag sperren die Eingabe immer - auch bei Chefzugang in der Mitarbeiteransicht. */
window.applyDayStatus=function(status){
  status=String(status||'Arbeiten');
  const blocked=status!=='Arbeiten';
  const work=q72('workEntryCard'),close=q72('dayCloseCard');
  if(work)work.classList.toggle('hidden',blocked);
  if(close)close.classList.toggle('hidden',blocked);
  const old=q72('dg72DayLock');if(old)old.remove();
  if(blocked){
    const h=Number((typeof lastDayData!=='undefined'&&lastDayData)?lastDayData.creditedHours:0)||0;
    const box=document.createElement('div');box.id='dg72DayLock';box.className='dg72-day-lock';
    box.innerHTML='<strong>'+esc72(status)+'</strong>'+
      (h>0?esc72(typeof formatHours==='function'?formatHours(h):h)+' Std. werden automatisch gutgeschrieben. ':'')+
      'Der Tag ist automatisch abgeschlossen. Manuelle Arbeitszeiteingaben sind gesperrt.';
    const msg=q72('dayStatusMessage');if(msg){msg.innerHTML='';msg.appendChild(box);}
  }else if(typeof clearMessage==='function')clearMessage('dayStatusMessage');
};

/* Automatische Urlaub-/Feiertagsgutschrift auch im Tagesbericht sichtbar machen. */
const renderDay72Base=window.renderDay;
if(typeof renderDay72Base==='function')window.renderDay=function(){
  const r=renderDay72Base.apply(this,arguments);
  const rep=(typeof lastDayData!=='undefined'&&lastDayData)?lastDayData.statusReport:null;
  if(rep&&q72('entries')){
    const h=Number(rep.hours||0);
    q72('entries').innerHTML='<div class="entry dg72-status-entry"><strong>'+esc72(rep.status||'Abwesenheit')+
      '</strong><span class="dg72-status-badge">AUTOMATISCH</span><br>'+
      '<strong>'+esc72(typeof formatHours==='function'?formatHours(h):h)+' Std. Gutschrift</strong><br>'+
      '<span class="muted">'+esc72(rep.activity||'Automatische Zeitgutschrift')+'</span><br>'+
      '<span class="muted small">Tag automatisch abgeschlossen · keine manuelle Eingabe erforderlich</span></div>';
  }
  return r;
};

/* Besichtigung: Notiz + Zeitaufwand werden zusammen an das Backend übertragen.
   Die ausgewählte Zeit ist echte Arbeitszeit des ausführenden Mitarbeiters. */
window.dg72InspectionVisit=function(){
  if(typeof canAccessBoss==='function'&&!canAccessBoss()){
    setMessage('entryStatus','Besichtigungstermine können nur mit Chefzugang übertragen werden.','error');return;
  }
  const customer=String(q72('customer')?.value||'').trim();
  if(!customer){setMessage('entryStatus','Bitte mindestens Kunde / Baustelle auswählen oder eintragen.','error');return;}
  const rows=window.__dgCalendarEvents||[];
  const selectedId=(typeof selectedCalendarEventId!=='undefined'?selectedCalendarEventId:'')||'';
  const event=rows.find(e=>String(e.id||'')===String(selectedId))||null;
  const currentText=String(q72('activity')?.value||'').trim();
  const prefill=currentText||String(event&&event.description||'').trim()||'Besichtigungstermin';
  const options=[0.5,1,1.5,2,2.5,3].map(v=>({value:String(v),label:String(v).replace('.',',')+' Std.'}));
  const modal=d3Form('Besichtigungstermin',[
    {name:'hours',label:'Zeitaufwand',type:'select',options:options,required:true},
    {name:'activity',label:'Tätigkeitsnotiz / Besichtigung',type:'textarea',required:true}
  ],{hours:'1',activity:prefill},async v=>{
    const hours=Number(v.hours),activity=String(v.activity||'').trim();
    if(!(hours>0))throw new Error('Bitte einen Zeitaufwand auswählen.');
    if(!activity)throw new Error('Bitte die Tätigkeitsnotiz eintragen.');
    const payload={
      action:'createInspectionOffer',
      employee:auth().employee,
      employeePin:auth().pin,
      item:{
        customer:customer,
        date:q72('date')?.value||localDate(),
        hours:hours,
        activity:activity,
        start:String(q72('start')?.value||''),
        end:String(q72('end')?.value||''),
        vehicleUsed:true,
        sourceCalendarEventId:selectedId,
        event:event?{
          id:event.id||'',title:event.title||'',location:event.location||'',description:event.description||'',
          startDate:event.startDate||'',startTime:event.startTime||'',endDate:event.endDate||'',endTime:event.endTime||'',
          phone:event.phone||'',email:event.email||''
        }:null
      }
    };
    const res=await api(payload);
    if(typeof resetEntry==='function')resetEntry();
    if(typeof loadDay==='function')await loadDay(true);
    if(typeof loadCalendarEvents==='function')await loadCalendarEvents(true);
    setMessage('entryStatus','✓ Besichtigung übertragen. '+(typeof formatHours==='function'?formatHours(hours):hours)+' Std. wurden als Arbeitszeit gebucht; die Tätigkeitsnotiz wurde übernommen.','ok');
    return res;
  });
  const ta=modal&&modal.querySelector('textarea[name="activity"]');if(ta)ta.classList.add('dg72-inspection-note');
};

function wireInspection72(){
  const old=q72('d35InspectionBtn');if(!old)return false;
  if(old.dataset.dg72==='1')return true;
  const b=old.cloneNode(true);b.dataset.dg72='1';
  old.replaceWith(b);
  b.addEventListener('click',e=>{e.preventDefault();e.stopPropagation();window.dg72InspectionVisit();});
  return true;
}

/* Mitarbeiterberichte: Urlaub/Feiertag auf der Tageskarte deutlich kennzeichnen. */
function decorateBossStatusDays72(rows){
  const cards=[...document.querySelectorAll('#dg48DayResult .dg48-day')];let n=0;
  (rows||[]).forEach(emp=>(emp.days||[]).forEach(day=>{
    const card=cards[n++];if(!card||!day||!day.status||!['Urlaub','Feiertag'].includes(String(day.status)))return;
    card.classList.add('dg72-status-entry');
    const strong=card.querySelector(':scope > strong');
    if(strong&&!card.querySelector('.dg72-status-badge'))strong.insertAdjacentHTML('afterend',' <span class="dg72-status-badge">'+esc72(day.status)+'</span>');
    const detail=card.querySelector('.dg49-detail');
    if(detail&&!detail.querySelector('.dg72-report-status')){
      const x=document.createElement('div');x.className='dg72-report-status';
      x.textContent=day.status+' · '+(typeof formatHours==='function'?formatHours(day.hours||0):Number(day.hours||0).toFixed(2))+' Std. automatisch gutgeschrieben';
      detail.prepend(x);
    }
  }));
}
const bossRender72Base=window.renderBossDayClosuresV48;
if(typeof bossRender72Base==='function')window.renderBossDayClosuresV48=function(rows){
  const r=bossRender72Base.apply(this,arguments);decorateBossStatusDays72(rows);return r;
};

function install72(){
  css72();stamp72();wireInspection72();
  if(typeof lastDayData!=='undefined'&&lastDayData&&typeof window.applyDayStatus==='function')window.applyDayStatus(lastDayData.status||'Arbeiten');
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>setTimeout(install72,0),{once:true});else setTimeout(install72,0);
setTimeout(install72,300);
setTimeout(install72,1200);
})();
;

/* ===== CONSOLIDATED SOURCE: app-7.2.1-offer-flow.js ===== */
/* DG Zeiterfassung 7.2.1 - Angebotsentscheidung eindeutig verschieben */
(function(){
'use strict';
const V='7.2.1';

function notice(msg,type){
  try{if(typeof d3Notice==='function')return d3Notice(msg,type||'ok');}catch(_e){}
  try{alert(msg);}catch(_e){}
}
async function refreshOfferViews721(){
  try{if(typeof loadOffers==='function')await loadOffers('Offen');}catch(_e){}
  try{if(typeof dg60RefreshOfferCounts==='function')await dg60RefreshOfferCounts(true);}catch(_e){}
  try{
    const arch=document.getElementById('d3OfferArchive');
    if(arch&&!arch.classList.contains('hidden')&&typeof loadOffers==='function')await loadOffers('Archiv');
  }catch(_e){}
  try{
    const stat=document.getElementById('d3OfferStats');
    if(stat&&!stat.classList.contains('hidden')&&typeof loadStats==='function')await loadStats();
  }catch(_e){}
  try{if(typeof d3Dashboard==='function')await d3Dashboard(true);}catch(_e){}
}

window.d3OfferDecision=async function(offerId,yes){
  const id=String(offerId||'').trim();
  if(!id)return false;
  if(!confirm(yes
    ?'Angebot annehmen und vollständig zu „Laufende Aufträge“ verschieben?'
    :'Angebot ablehnen und in das Angebotsarchiv verschieben?'))return false;
  try{
    if(yes){
      await api(chefPayload({action:'acceptOfferAsRunning',offerId:id}));
      notice('✓ Angebot angenommen und zu „Laufende Aufträge“ verschoben.','ok');
    }else{
      await api(chefPayload({action:'setRegieReportsOfferStatus',offerId:id,entryIds:[],offerStatus:'Angebot Abgelehnt'}));
      notice('✓ Angebot abgelehnt und ins Angebotsarchiv verschoben.','ok');
    }
    await refreshOfferViews721();
  }catch(e){
    notice((e&&e.message)||'Angebotsentscheidung konnte nicht gespeichert werden.','error');
  }
  return false;
};

/* Auch Entscheidungen aus der Reminder-Ansicht folgen derselben eindeutigen Regel. */
window.d3ReminderDecision=async function(id,yes){
  const rid=String(id||'').trim();
  const rows=(window.DG3&&Array.isArray(DG3.reminders))?DG3.reminders:[];
  const r=rows.find(x=>String(x.id||'')===rid);
  if(!r){notice('Reminder bitte neu laden.','error');return false;}
  if(!confirm(yes
    ?'Angebot annehmen und zu „Laufende Aufträge“ verschieben?'
    :'Angebot ablehnen und ins Angebotsarchiv verschieben?'))return false;
  try{
    await api(chefPayload({
      action:yes?'acceptOfferFromReminder':'declineOfferFromReminder',
      reminderId:rid,
      asRunning:yes
    }));
    if(typeof loadReminders==='function')await loadReminders();
    await refreshOfferViews721();
    notice(yes?'✓ Auftrag läuft jetzt unter „Laufende Aufträge“.':'✓ Angebot wurde archiviert.','ok');
  }catch(e){
    notice((e&&e.message)||'Reminder-Entscheidung konnte nicht gespeichert werden.','error');
  }
  return false;
};

try{window.DG_APP_VERSION=V;if(window.DG3)DG3.version=V;}catch(_e){}
})();
;

/* ===== CONSOLIDATED SOURCE: app-7.4-current.js ===== */
/* DG 7.4.1 CURRENT ONLY - zusammengefuehrter aktueller Stand */

/* DG Zeiterfassung 7.3.3 - Mitarbeiterkalender: Abwesenheiten sichtbar, Buchung bleibt moeglich */
(function(){
'use strict';
const V733='7.3.3';
let workers733=[],availability733=[];
const $733=id=>document.getElementById(id);
const esc733=v=>String(v==null?'':v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

function css733(){
  if($733('dg733Css'))return;
  const s=document.createElement('style');s.id='dg733Css';
  s.textContent=`
    .dg733-unavailable-head{background:#fecaca!important;color:#7f1d1d!important;flex-direction:column;line-height:1.05}
    .dg733-unavailable-cell{background:#fee2e2!important;box-shadow:inset 0 0 0 1px #fca5a5}
    .dg733-unavailable-cell:hover{background:#fecaca!important}
    .dg733-status-badge{display:inline-block;margin-top:3px;padding:2px 7px;border-radius:999px;background:#b91c1c;color:#fff;font-size:10px;font-weight:900;white-space:nowrap}
    .dg733-legend{display:inline-flex;align-items:center;gap:5px}
    .dg733-legend-dot{width:12px;height:12px;border-radius:3px;background:#fee2e2;border:1px solid #ef4444;display:inline-block}
    .dg733-modalwarn{margin:8px 0;padding:9px 11px;border-radius:10px;background:#fee2e2;border:1px solid #fca5a5;color:#991b1b;font-weight:800}
  `;
  document.head.appendChild(s);
}
function name733(w){return String(w&&((w.employeeName||w.displayName)||'')||'').trim();}
function byDateEmployee733(date,employee){
  const key=String(employee||'').trim().toLowerCase();
  return availability733.find(x=>String(x.date||'')===String(date||'')&&String(x.employee||'').trim().toLowerCase()===key)||null;
}
function activeWorkers733(){return (workers733||[]).filter(w=>w&&w.active).slice(0,10);}
function visibleRange733(){
  const dates=[...document.querySelectorAll('#dg62Week .dg62-day[data-date]')].map(x=>x.dataset.date).filter(Boolean).sort();
  return dates.length?{start:dates[0],end:dates[dates.length-1]}:null;
}
function ensureLegend733(){
  const legend=$733('dg62PlannerCard')?.querySelector('.dg62-legend');if(!legend||legend.querySelector('.dg733-legend'))return;
  const x=document.createElement('span');x.className='dg733-legend';x.innerHTML='<i class="dg733-legend-dot"></i>Nicht verfügbar – Termin kann trotzdem gebucht werden';legend.appendChild(x);
}
function decorate733(){
  css733();ensureLegend733();
  const ws=activeWorkers733();if(!ws.length)return;
  document.querySelectorAll('#dg62Week .dg62-day[data-date]').forEach(day=>{
    const date=day.dataset.date,names=[...day.querySelectorAll('.dg62-name')],cells=[...day.querySelectorAll('.dg62-cell')],cols=ws.length;
    names.forEach(n=>{n.classList.remove('dg733-unavailable-head');n.querySelectorAll('.dg733-status-badge').forEach(x=>x.remove());});
    cells.forEach(c=>{c.classList.remove('dg733-unavailable-cell');delete c.dataset.dg733Status;});
    ws.forEach((w,ci)=>{
      const a=byDateEmployee733(date,name733(w));if(!a)return;
      const label=String(a.status||'Nicht verfügbar').trim();
      const head=names[ci];if(head){
        head.classList.add('dg733-unavailable-head');
        const b=document.createElement('span');b.className='dg733-status-badge';b.textContent=label;head.appendChild(b);
        head.title=(w.displayName||w.employeeName||'Mitarbeiter')+' · '+label+' · Buchung trotzdem möglich';
      }
      cells.forEach((cell,i)=>{if(i%cols!==ci)return;cell.classList.add('dg733-unavailable-cell');cell.dataset.dg733Status=label;cell.title=(w.displayName||w.employeeName||'Mitarbeiter')+' ist '+label+'. Anklicken = Termin trotzdem anlegen.';});
    });
  });
}
async function loadAvailability733(){
  const range=visibleRange733();if(!range||!navigator.onLine)return;
  try{
    availability733=await api(chefPayload({action:'getPlannerAvailability',startDate:range.start,endDate:range.end}))||[];
    window.__dg733PlannerAvailability=availability733;
    decorate733();
  }catch(e){
    availability733=[];
    const s=$733('dg62Status');if(s&&/Kalender synchronisiert/i.test(s.textContent||''))s.textContent='✓ Kalender synchronisiert. Abwesenheitsmarkierung benötigt Google-GS 7.4.1.';
  }
}
function statusForWorker733(date,id){
  const w=workers733.find(x=>String(x.id)===String(id));return w?byDateEmployee733(date,name733(w)):null;
}
function warnModal733(date,workerId){
  const a=statusForWorker733(date,workerId),box=$733('dg62MS');if(!a||!box)return;
  box.className='dg733-modalwarn';
  box.textContent='⚠ '+(workers733.find(x=>String(x.id)===String(workerId))?.displayName||name733(workers733.find(x=>String(x.id)===String(workerId)))||'Mitarbeiter')+' ist an diesem Tag als „'+String(a.status||'nicht verfügbar')+'“ markiert. Der Termin kann trotzdem gespeichert werden.';
}

const apiBase733=window.api;
if(typeof apiBase733==='function')window.api=api=async function(payload){
  const r=await apiBase733.apply(this,arguments);
  if(payload&&payload.action==='getPlannerWorkers')workers733=Array.isArray(r)?r:[];
  if(payload&&payload.action==='getPlannerAvailability')availability733=Array.isArray(r)?r:[];
  return r;
};

const loadBase733=window.dg62Load;
if(typeof loadBase733==='function')window.dg62Load=async function(){
  const r=await loadBase733.apply(this,arguments);
  if(!workers733.length){
    try{workers733=await api(chefPayload({action:'getPlannerWorkers'}))||[];}catch(_e){}
  }
  await loadAvailability733();
  return r;
};

const newBase733=window.dg62New;
if(typeof newBase733==='function')window.dg62New=function(d,w,start){
  const r=newBase733.apply(this,arguments);
  setTimeout(()=>warnModal733(d,w),0);
  return r;
};

const saveBase733=window.dg62Save;
if(typeof saveBase733==='function')window.dg62Save=async function(){
  const date=String($733('dg62ED')?.value||''),ids=[...document.querySelectorAll('.dg62cb:checked')].map(x=>x.value);
  const hits=ids.map(id=>({id,a:statusForWorker733(date,id)})).filter(x=>x.a);
  if(hits.length){
    const text=hits.map(x=>{
      const w=workers733.find(y=>String(y.id)===String(x.id));
      return (w?.displayName||w?.employeeName||'Mitarbeiter')+': '+String(x.a.status||'nicht verfügbar');
    }).join('\n');
    if(!confirm('Achtung – folgende Mitarbeiter sind an diesem Tag als nicht verfügbar markiert:\n\n'+text+'\n\nTermin trotzdem speichern?'))return false;
  }
  return saveBase733.apply(this,arguments);
};

function addTrainingOption733(){
  const sel=$733('absenceType');if(!sel||[...sel.options].some(o=>o.value==='Schulung'))return;
  const o=document.createElement('option');o.value='Schulung';o.textContent='Schulung';sel.appendChild(o);
}
function stamp733(){ /* CLEAN 7.4.1: Versionsanzeige nur im aktuellen Runtime-Block */ }
function install733(){css733();addTrainingOption733();ensureLegend733();decorate733();}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>setTimeout(install733,0),{once:true});else setTimeout(install733,0);
})();


/* DG Zeiterfassung 7.3.4 - Lohnfaelligkeit + Abwesenheitszentrale */
(function(){
'use strict';
const V734='7.3.4';
const byId734=id=>document.getElementById(id);
const esc734=v=>String(v==null?'':v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let absenceOverview734=null,dueCache734={};

function pad734(n){return String(n).padStart(2,'0');}
function iso734(d){return d.getFullYear()+'-'+pad734(d.getMonth()+1)+'-'+pad734(d.getDate());}
function de734(v){try{return typeof formatDateDE==='function'?formatDateDE(v):String(v||'');}catch(_e){return String(v||'');}}
function add734(d,n){const x=new Date(d.getFullYear(),d.getMonth(),d.getDate());x.setDate(x.getDate()+n);return x;}
function localDue734(y,m){let d=new Date(Number(y),Number(m)-1,20);while(d.getDay()===0||d.getDay()===6)d=add734(d,-1);return iso734(d);}
function diff734(iso){const p=String(iso||'').split('-').map(Number);if(p.length!==3)return 0;const a=new Date(p[0],p[1]-1,p[2]),b=new Date();a.setHours(0,0,0,0);b.setHours(0,0,0,0);return Math.round((a-b)/86400000);}
function selectedPayroll734(){return {year:Number(byId734('dg520Year')?.value||new Date().getFullYear()),month:Number(byId734('dg520Month')?.value||new Date().getMonth()+1)};}

function css734(){
  if(byId734('dg734Css'))return;
  const s=document.createElement('style');s.id='dg734Css';
  s.textContent=`
    .dg734-summary{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px;margin:12px 0}
    .dg734-stat{border:1px solid #dbe3ef;border-radius:14px;padding:12px;background:#f8fafc}
    .dg734-stat strong{display:block;font-size:24px;color:#173f8a;margin-top:3px}
    .dg734-alert{border-radius:12px;padding:10px 12px;margin:8px 0;font-weight:800}
    .dg734-alert.info{background:#eff6ff;color:#1e3a8a}.dg734-alert.warn{background:#fff7ed;color:#9a3412}.dg734-alert.error{background:#fef2f2;color:#991b1b}
    .dg734-sickbox{border:1px solid #fecaca;background:#fff7f7;border-radius:14px;padding:12px;margin:10px 0}
    .dg734-sickbox.hidden{display:none!important}
    .dg734-case{padding:9px 11px;margin:7px 0;border-radius:10px;background:#fff;border:1px solid #e5e7eb}
    .dg734-legal{font-size:12px;line-height:1.45;color:#64748b;margin-top:10px}
    .dg734-payroll-hot{background:#fee2e2!important;color:#991b1b!important}
    .dg734-sick-tile{background:#fef3c7!important;color:#92400e!important}.dg734-sick-tile.hot{background:#fee2e2!important;color:#991b1b!important}
    .dg734-sick-alert-list{margin-top:10px}.dg734-sick-alert-row{padding:9px 11px;border-radius:10px;margin:6px 0;background:#fff;border:1px solid #e5e7eb}
    @media(max-width:760px){.dg734-summary{grid-template-columns:1fr}}
  `;
  document.head.appendChild(s);
}

/* ---------- Lohnuebergabe: immer tatsaechlicher Stichtag ---------- */
function paintDue734(due,state){
  const d=diff734(due),completed=state&&state.status==='Uebergeben';
  const section=byId734('dg520Due');
  if(section){
    let text='',cls='';
    if(completed){text='🟢 Monatsabschluss erfolgt. Nächste Lohnübergabe wird automatisch neu berechnet.';cls='ok';}
    else if(d===0){text='🔴 Lohnübergabe heute fällig ('+de734(due)+').';cls='error';}
    else if(d>0){text=(d<=2?'🔴 ':'🟢 ')+'Lohnübergabe am '+de734(due)+' · noch '+d+' Tag'+(d===1?'':'e')+'.';cls=d<=2?'error':d<=5?'warn':'';}
    else{text='🔴 Lohnübergabe seit '+Math.abs(d)+' Tag'+(Math.abs(d)===1?'':'en')+' überfällig ('+de734(due)+').';cls='error';}
    const q=selectedPayroll734(),regular=q.year+'-'+pad734(q.month)+'-20';if(!completed&&due!==regular)text+=' Regulärer 20. fällt auf Wochenende/Feiertag – Übergabe vorgezogen.';
    section.className='dg520-due '+cls;section.textContent=text;
  }
  const tile=document.querySelector('#bossView .d3-tile.payroll'),strong=byId734('d3Count-payroll');
  if(tile&&strong){
    strong.textContent=d===0?'Heute':d>0?(d+' Tag'+(d===1?'':'e')):(Math.abs(d)+' Tag'+(Math.abs(d)===1?'':'e')+' überf.');
    tile.title='Lohnübergabe '+de734(due);tile.classList.toggle('dg734-payroll-hot',d<=0);
  }
}
async function refreshDue734(force){
  const now=new Date(),tileKey=now.getFullYear()+'-'+(now.getMonth()+1),q=selectedPayroll734(),keys=[tileKey,q.year+'-'+q.month];
  for(const key of [...new Set(keys)]){
    if(!force&&dueCache734[key])continue;
    const [y,m]=key.split('-').map(Number);
    try{dueCache734[key]=await api(chefPayload({action:'getPayrollCycleState',year:y,month:m}));}
    catch(_e){dueCache734[key]={year:y,month:m,dueDate:localDue734(y,m),state:{status:'Offen'}};}
  }
  const current=dueCache734[tileKey]||{dueDate:localDue734(now.getFullYear(),now.getMonth()+1),state:{}};
  const selected=dueCache734[q.year+'-'+q.month]||{dueDate:localDue734(q.year,q.month),state:{}};
  paintDue734(current.dueDate,current.state);
  if(byId734('dg520Due'))paintDue734(selected.dueDate,selected.state);
}
const dashBase734=window.d3Dashboard;
if(typeof dashBase734==='function')window.d3Dashboard=async function(){const r=await dashBase734.apply(this,arguments);setTimeout(()=>{refreshSicknessTile734();},0);return r;};
const payrollBase734=window.makePayrollSection520;
if(typeof payrollBase734==='function')window.makePayrollSection520=function(){const r=payrollBase734.apply(this,arguments);setTimeout(()=>{patchPayrollSubtitle734();},0);return r;};

function patchPayrollSubtitle734(){
  const sec=byId734('dg520PayrollClose');if(!sec)return;
  const muted=sec.querySelector(':scope > .muted.small');if(muted)muted.textContent='Automatische Plausibilitätsprüfung aller Mitarbeiter. Lohnübergabe regulär zum 20.; fällt dieser auf Wochenende/Feiertag, am vorherigen Arbeitstag.';
}
async function refreshSicknessTile734(){
  const dash=document.querySelector('#bossView .d3-dashboard');if(!dash||!navigator.onLine)return;
  let tile=dash.querySelector('.d3-tile.sickness734');
  if(!tile){
    tile=document.createElement('button');tile.type='button';tile.className='d3-tile sickness734 dg734-sick-tile';
    tile.innerHTML='<span>Krank-Fristen</span><strong id="d3Count-sickness734">…</strong>';
    const payroll=dash.querySelector('.d3-tile.payroll');if(payroll)payroll.insertAdjacentElement('afterend',tile);else dash.appendChild(tile);
    tile.addEventListener('click',()=>{try{if(typeof d3Open==='function')d3Open('d3Admin');}catch(_e){}setTimeout(()=>{ensureAbsenceUi734();const c=absenceCard734();if(c)c.scrollIntoView({behavior:'smooth',block:'start'});},100);});
  }
  try{
    const x=await api(chefPayload({action:'getSicknessAlerts'})),rows=x?.alerts||[],n=Number(x?.count||0),strong=byId734('d3Count-sickness734');
    if(strong)strong.textContent=String(n);tile.classList.toggle('hot',rows.some(r=>r.level==='error'));tile.title=n?rows.map(r=>r.employee+': '+r.title).join('\n'):'Keine kritischen Krank-Fristen.';
    let list=byId734('dg734SicknessAlertList');const card=absenceCard734();
    if(card&&!list){list=document.createElement('div');list.id='dg734SicknessAlertList';list.className='dg734-sick-alert-list';const summary=byId734('dg734AbsenceSummary');(summary||card.querySelector('h2'))?.insertAdjacentElement('afterend',list);}
    if(list)list.innerHTML=rows.map(r=>'<div class="dg734-sick-alert-row"><strong>'+esc734(r.employee)+' · '+esc734(r.title)+'</strong><br><span class="muted">'+esc734(r.detail)+'</span></div>').join('');
  }catch(_e){}
}

/* ---------- Abwesenheiten ---------- */
function absenceCard734(){return byId734('absenceEmployee')?.closest('.card')||null;}
function year734(){const d=String(byId734('absenceStart')?.value||'');return Number(d.slice(0,4))||new Date().getFullYear();}
function type734(){return String(byId734('absenceType')?.value||'Urlaub');}
function sixMonthsAfter734(iso){const p=String(iso||'').split('-').map(Number);if(p.length!==3)return '';const d=new Date(p[0],p[1]-1,p[2]);d.setMonth(d.getMonth()+6);return iso734(d);}
function recentCaseNeedsCheck734(overview){
  const start=String(byId734('absenceStart')?.value||'');const c=(overview?.sicknessCases||[])[0];return !!(start&&c&&c.end&&start<=sixMonthsAfter734(c.end));
}
function ensureAbsenceUi734(){
  const card=absenceCard734();if(!card)return;card.id=card.id||'dg734AbsenceCard';
  const h=card.querySelector('h2');if(h)h.textContent='Abwesenheit eintragen';
  const sel=byId734('absenceType');
  if(sel){
    const old=sel.value||'Urlaub';sel.innerHTML='<option value="Urlaub">Urlaub</option><option value="Krank">Krankheit</option><option value="Schulung">Schulung</option>';
    sel.value=['Urlaub','Krank','Schulung'].includes(old)?old:'Urlaub';
  }
  const grid=byId734('absenceEmployee')?.closest('.admin-grid');
  if(grid&&!byId734('dg734AbsenceSummary')){const box=document.createElement('div');box.id='dg734AbsenceSummary';box.className='status info';box.textContent='Übersicht wird geladen …';grid.insertAdjacentElement('afterend',box);}
  if(!byId734('dg734SickControls')){
    const dates=byId734('absenceStart')?.closest('.grid2');
    const box=document.createElement('div');box.id='dg734SickControls';box.className='dg734-sickbox hidden';
    box.innerHTML='<strong>Krankheitsfall / Entgeltfortzahlung</strong><div class="admin-grid" style="margin-top:8px"><div><label>Einordnung</label><select id="dg734SicknessMode"><option value="Neu">Neuer Krankheitsfall</option><option value="">Bitte prüfen / noch unklar</option><option value="Fortsetzung">Fortsetzung derselben Erkrankung</option></select></div><div id="dg734ContinueWrap" class="hidden"><label>Fortgesetzter Fall</label><select id="dg734ContinuationCase"></select></div></div><div id="dg734SickHint" class="dg734-legal">Es wird keine Diagnose gespeichert. Bei erneuter Arbeitsunfähigkeit entscheidet die Einordnung „neu“ oder „Fortsetzung“ darüber, ob die 6-Wochen-Frist weiterläuft. Im Zweifel Krankenkasse/Lohnbüro prüfen.</div>';
    dates?.insertAdjacentElement('afterend',box);
  }
  const hint=card.querySelector('.field-hint');if(hint)hint.textContent='Urlaub und Schulung werden nach hinterlegten Sollstunden gutgeschrieben. Bei Krankheit überwacht die App zusätzlich die Entgeltfortzahlungsfrist und weist auf Krankengeld/Krankenkasse hin.';
  const emp=byId734('absenceEmployee'),typ=byId734('absenceType'),start=byId734('absenceStart'),mode=byId734('dg734SicknessMode');
  if(emp&&!emp.dataset.dg734){emp.dataset.dg734='1';emp.addEventListener('change',()=>refreshAbsence734(true));}
  if(typ&&!typ.dataset.dg734){typ.dataset.dg734='1';typ.addEventListener('change',()=>{toggleSick734();renderAbsenceSummary734();});}
  if(start&&!start.dataset.dg734){start.dataset.dg734='1';start.addEventListener('change',()=>refreshAbsence734(true));}
  if(mode&&!mode.dataset.dg734){mode.dataset.dg734='1';mode.addEventListener('change',()=>toggleContinuation734());}
  toggleSick734();
}
function toggleSick734(){
  const sick=type734()==='Krank',box=byId734('dg734SickControls');if(box)box.classList.toggle('hidden',!sick);toggleContinuation734();
}
function toggleContinuation734(){const wrap=byId734('dg734ContinueWrap');if(wrap)wrap.classList.toggle('hidden',byId734('dg734SicknessMode')?.value!=='Fortsetzung');}
function fillCases734(){
  const s=byId734('dg734ContinuationCase');if(!s)return;const rows=absenceOverview734?.sicknessCases||[];
  s.innerHTML=rows.map(c=>'<option value="'+esc734(c.caseId)+'">'+esc734(de734(c.start)+'–'+de734(c.end)+' · '+c.calendarDays+' Kalendertage'+(c.payer?' · '+c.payer:''))+'</option>').join('')||'<option value="">Kein früherer Krankheitsfall vorhanden</option>';
}
function alerts734(rows){
  return (rows||[]).map(x=>'<div class="dg734-alert '+esc734(x.level||'info')+'">'+esc734(x.text||'')+'</div>').join('');
}
function renderAbsenceSummary734(){
  const host=byId734('dg734AbsenceSummary');if(!host)return;
  const o=absenceOverview734;if(!o){host.className='status info';host.textContent='Bitte Mitarbeiter auswählen.';return;}
  const t=type734();host.className='';let html='';
  if(t==='Urlaub'){
    html='<div class="dg734-summary"><div class="dg734-stat">Jahresanspruch<strong>'+Number(o.vacationEntitlement||0).toFixed(1).replace('.',',')+' Tage</strong></div><div class="dg734-stat">Genommen<strong>'+Number(o.vacationUsed||0).toFixed(1).replace('.',',')+' Tage</strong></div><div class="dg734-stat">Restanspruch<strong>'+Number(o.vacationRemaining||0).toFixed(1).replace('.',',')+' Tage</strong></div></div>';
  }else if(t==='Krank'){
    const latest=(o.sicknessCases||[])[0],remaining=latest?Number(latest.remainingEmployerPayDays||0):42;
    html='<div class="dg734-summary"><div class="dg734-stat">Krankheitstage '+o.year+'<strong>'+Number(o.sickCalendarDays||0)+' Kalendertage</strong></div><div class="dg734-stat">davon Arbeitstage<strong>'+Number(o.sickWorkDays||0)+' Tage</strong></div><div class="dg734-stat">6-Wochen-Reserve letzter Fall<strong>'+remaining+' Tage</strong></div></div>'+alerts734(o.warnings);
    if(latest)html+='<div class="dg734-case"><strong>Letzter Krankheitsfall:</strong> '+esc734(de734(latest.start))+' bis '+esc734(de734(latest.end))+' · '+Number(latest.calendarDays||0)+' Kalendertage'+(latest.payer?' · '+esc734(latest.payer):'')+(latest.employerPayThrough?' · AG-Fortzahlung bis '+esc734(de734(latest.employerPayThrough)):'')+'</div>';
    html+='<div class="dg734-legal"><strong>Sicherheitslogik:</strong> Arbeitgeber-Entgeltfortzahlung wird grundsätzlich für höchstens 6 Wochen je Krankheitsfall berücksichtigt. Ab dem 43. Krankheitstag desselben Falles schreibt die App keine Arbeitgeberstunden mehr gut und markiert Krankengeld/Krankenkasse. Die vierwöchige Wartezeit bei Neueinstellung wird ebenfalls berücksichtigt. Bei erneuter Erkrankung wird nicht nach Diagnosen gefragt; die Zuordnung „neuer Fall / Fortsetzung“ muss bewusst erfolgen.</div>';
  }else{
    html='<div class="dg734-alert info">Schulung: Der Zeitraum wird als Abwesenheit markiert und die hinterlegten Sollstunden werden gutgeschrieben.</div>';
  }
  host.innerHTML=html;fillCases734();
}
async function refreshAbsence734(force){
  ensureAbsenceUi734();const emp=String(byId734('absenceEmployee')?.value||'');if(!emp){absenceOverview734=null;renderAbsenceSummary734();return;}
  try{
    const y=year734();if(byId734('vacationEmployee'))byId734('vacationEmployee').value=emp;if(byId734('vacationYear'))byId734('vacationYear').value=String(y);absenceOverview734=await api(chefPayload({action:'getAbsenceOverview',targetEmployee:emp,year:y,force:!!force}));
    if(type734()==='Krank'){
      const mode=byId734('dg734SicknessMode');
      if(mode&&!mode.dataset.manual734){
        mode.value=recentCaseNeedsCheck734(absenceOverview734)?'':'Neu';
      }
    }
    fillCases734();toggleContinuation734();renderAbsenceSummary734();
  }catch(e){const h=byId734('dg734AbsenceSummary');if(h){h.className='status error';h.textContent='Abwesenheitsübersicht konnte nicht geladen werden: '+(e?.message||e);}}
}
const renderAbsencesBase734=window.renderAbsenceList;
window.renderAbsenceList=renderAbsenceList=function(rows){
  const host=byId734('absenceList');if(!host)return;
  host.innerHTML=(rows||[]).map(x=>{
    const label=x.type==='Krank'?'Krankheit':x.type;
    const extra=x.type==='Krank'?(x.payer?'<br><span class="muted">Lohnbehandlung: '+esc734(x.payer)+'</span>':'')+(x.note?'<br><span class="dg734-alert warn" style="display:block">'+esc734(x.note)+'</span>':''):'';
    return '<div class="entry"><strong>'+esc734(x.employee)+'</strong> · '+esc734(label)+'<br><span class="muted">'+esc734(de734(x.start))+' bis '+esc734(de734(x.end))+' · '+(typeof formatHours==='function'?formatHours(x.creditedHours||0):Number(x.creditedHours||0).toFixed(2))+' Std. Gutschrift</span>'+extra+'<br><button class="btn danger" style="margin-top:8px" data-id="'+esc734(x.id)+'" onclick="return deleteAbsenceUi(this.dataset.id)">Eintrag löschen</button></div>';
  }).join('')||'<div class="muted">Keine geplanten Abwesenheiten.</div>';
};

window.saveAbsenceUi=saveAbsenceUi=async function(){
  const target=String(byId734('absenceEmployee')?.value||''),type=type734(),startDate=String(byId734('absenceStart')?.value||''),endDate=String(byId734('absenceEnd')?.value||'');
  if(!target||!startDate||!endDate){setMessage('absenceStatus','Bitte Mitarbeiter und Zeitraum auswählen.','error');return false;}
  let sicknessMode='',continuationCaseId='';
  if(type==='Krank'){
    sicknessMode=String(byId734('dg734SicknessMode')?.value||'');
    if(!sicknessMode){setMessage('absenceStatus','Bitte vor dem Speichern klären: neuer Krankheitsfall oder Fortsetzung derselben Erkrankung. Im Zweifel Krankenkasse/Lohnbüro prüfen.','error');return false;}
    if(sicknessMode==='Fortsetzung'){continuationCaseId=String(byId734('dg734ContinuationCase')?.value||'');if(!continuationCaseId){setMessage('absenceStatus','Bitte den fortgesetzten Krankheitsfall auswählen.','error');return false;}}
  }
  try{
    const r=await api(chefPayload({action:'saveAbsence',targetEmployee:target,type,startDate,endDate,sicknessMode,continuationCaseId}));
    let msg='✓ '+(type==='Krank'?'Krankheit':type)+' eingetragen: '+Number(r.days||0)+' Arbeitstag(e) · '+(typeof formatHours==='function'?formatHours(r.creditedHours||0):r.creditedHours)+' Std. Gutschrift.';
    if(r.sickness){msg+=' Lohnbehandlung: '+r.sickness.payer+'.';if(r.sickness.employerPayThrough)msg+=' AG-Entgeltfortzahlung bis '+de734(r.sickness.employerPayThrough)+'.';if(r.sickness.note)msg+=' '+r.sickness.note;}
    setMessage('absenceStatus',msg,'ok');
    const abs=await api(chefPayload({action:'getAbsences'}));renderAbsenceList(abs||[]);await refreshAbsence734(true);
  }catch(e){setMessage('absenceStatus',e?.message||String(e),'error');}
  return false;
};

const adminBase734=window.loadChefAdministration;
if(typeof adminBase734==='function')window.loadChefAdministration=async function(){const r=await adminBase734.apply(this,arguments);setTimeout(()=>{ensureAbsenceUi734();refreshAbsence734(false);},0);return r;};

function stamp734(){ /* CLEAN 7.4.1: Versionsanzeige nur im aktuellen Runtime-Block */ }
function install734(){
  css734();ensureAbsenceUi734();
  const mode=byId734('dg734SicknessMode');if(mode&&!mode.dataset.manualListener734){mode.dataset.manualListener734='1';mode.addEventListener('change',()=>{mode.dataset.manual734='1';});}
  patchPayrollSubtitle734();refreshAbsence734(false);refreshSicknessTile734();
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>setTimeout(install734,0),{once:true});else setTimeout(install734,0);
})();

/* DG Zeiterfassung 7.3.5 - Gesundmeldung + einheitliche interne Notizen */
(function(){
'use strict';
const V735='7.3.5';
const byId735=id=>document.getElementById(id);
const esc735=v=>String(v==null?'':v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function today735(){const d=new Date();return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');}
function de735(v){try{return typeof formatDateDE==='function'?formatDateDE(v):String(v||'');}catch(_e){return String(v||'');}}

/* Krankheit endet automatisch am eingetragenen Bis-Datum.
   Diese Funktion ist nur fuer vorzeitige Rueckkehr gedacht. */
window.dg735Healthy=dg735Healthy=function(id,employee,currentEnd){
  if(typeof d3Form!=='function')return;
  d3Form('Mitarbeiter gesund melden',[
    {name:'returnDate',label:'Arbeitsfähig ab',type:'date',required:true}
  ],{returnDate:today735()},async v=>{
    const r=await api(chefPayload({action:'endSicknessAbsence',id,returnDate:v.returnDate}));
    if(r&&r.changed===false){
      setMessage('absenceStatus',r.message||'Mitarbeiter war bereits wieder als arbeitsfähig geführt.','info');
    }else{
      setMessage('absenceStatus','✓ '+(employee||'Mitarbeiter')+' ist ab '+de735(v.returnDate)+' wieder arbeitsfähig. Ab diesem Datum werden Arbeitszeiten wieder normal gezählt.','ok');
    }
    const abs=await api(chefPayload({action:'getAbsences'}));
    renderAbsenceList(abs||[]);
    try{if(typeof refreshAbsence734==='function')await refreshAbsence734(true);}catch(_e){}
    try{if(typeof refreshSicknessTile734==='function')await refreshSicknessTile734();}catch(_e){}
    try{if(typeof d3Dashboard==='function')await d3Dashboard(true);}catch(_e){}
  });
};

const absenceBase735=window.renderAbsenceList;
if(typeof absenceBase735==='function')window.renderAbsenceList=renderAbsenceList=function(rows){
  const r=absenceBase735.apply(this,arguments);
  const host=byId735('absenceList'),items=[...(host?.querySelectorAll('.entry')||[])],today=today735();
  (rows||[]).forEach((x,i)=>{
    if(x.type!=='Krank'||String(x.end||'')<today)return;
    const box=items[i];if(!box||box.querySelector('.dg735-healthy'))return;
    const b=document.createElement('button');
    b.type='button';b.className='btn success dg735-healthy';b.style.marginTop='8px';b.style.marginLeft='8px';
    b.textContent='Gesund melden';
    b.addEventListener('click',()=>dg735Healthy(x.id,x.employee,x.end));
    const del=box.querySelector('button.btn.danger');if(del)del.insertAdjacentElement('afterend',b);else box.appendChild(b);
  });
  return r;
};

/* Untere Kundenkarten nutzen jetzt exakt denselben Formularstil wie die obere Interne Notiz. */
window.d3Note=d3Note=async function(objectId,customer){
  const r=await api(chefPayload({action:'getObjectInternalNote',objectId}));
  d3Form('Interne Notiz',[
    {name:'note',label:'Notiz',type:'textarea'}
  ],{note:r?.note||''},async v=>{
    await api(chefPayload({action:'saveObjectInternalNote',objectId,note:v.note}));
    try{await d3Reports(DG3.active||'Laufend');}catch(_e){}
  });
};

async function patchRegieNotes735(view){
  const root=typeof d3ReportRoot==='function'?d3ReportRoot(view):null;
  if(!root)return;
  const groups=(window.DG3&&DG3.reports&&DG3.reports[view])||[];
  const ids=[...new Set(groups.map(g=>(g.objectIds||[g.objectId]).filter(Boolean)[0]).filter(Boolean))];
  let notes={};
  if(ids.length){
    try{notes=await api(chefPayload({action:'getObjectInternalNotes',objectIds:ids}))||{};}catch(_e){
      for(const id of ids){try{notes[id]=await api(chefPayload({action:'getObjectInternalNote',objectId:id}));}catch(__e){}}
    }
  }
  [...root.querySelectorAll('.report-card[data-index]')].forEach(card=>{
    const i=Number(card.dataset.index),g=groups[i];if(!g)return;
    const id=(g.objectIds||[g.objectId]).filter(Boolean)[0],note=notes[id]?.note||'';
    card.querySelectorAll('button').forEach(b=>{if((b.textContent||'').trim()==='Interner Vermerk')b.textContent='Interne Notiz';});
    let box=card.querySelector('.dg735-object-note');
    if(note){
      if(!box){box=document.createElement('div');box.className='status info dg735-object-note';const actions=card.querySelector('.report-actions');if(actions)actions.insertAdjacentElement('beforebegin',box);else card.appendChild(box);}
      box.innerHTML='<strong>Interne Notiz:</strong> '+esc735(note);
    }else if(box)box.remove();
  });
}
const reportsBase735=window.d3Reports;
if(typeof reportsBase735==='function')window.d3Reports=d3Reports=async function(view='Abgeschlossen'){
  const r=await reportsBase735.apply(this,arguments);
  try{await patchRegieNotes735(view);}catch(_e){}
  return r;
};

function patchText735(){
  document.querySelectorAll('button').forEach(b=>{if((b.textContent||'').trim()==='Interner Vermerk')b.textContent='Interne Notiz';});
  const h=byId735('dg734SickHint');
  if(h)h.textContent='Krankheit endet automatisch am eingetragenen Bis-Datum. Bei früherer Rückkehr „Gesund melden“ verwenden; ab dem Rückkehrdatum werden Arbeitsstunden wieder normal gezählt. Es wird keine Diagnose gespeichert.';
}
function stamp735(){ /* CLEAN 7.4.1: Versionsanzeige nur im aktuellen Runtime-Block */ }
function install735(){
  patchText735();
  try{if(window.DG3&&DG3.active)patchRegieNotes735(DG3.active);}catch(_e){}
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>setTimeout(install735,0),{once:true});else setTimeout(install735,0);
})();


/* DG Zeiterfassung 7.4.1 - bereinigte aktuelle Laufzeit ohne 7.3.x-Overlaykette */
(function(){
'use strict';
const V='7.4.1';
const $=id=>document.getElementById(id);
let audit=null, payrollBusy=false;

function pad(n){return String(n).padStart(2,'0');}
function iso(d){return d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate());}
function add(d,n){const x=new Date(d.getFullYear(),d.getMonth(),d.getDate());x.setDate(x.getDate()+n);return x;}
function de(v){try{return typeof formatDateDE==='function'?formatDateDE(v):String(v||'');}catch(_e){return String(v||'');}}
function esc(v){return String(v==null?'':v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot',"'":'&#39;'}[c]));}
function norm(v){return String(v||'').toLocaleLowerCase('de-DE').replace(/\s+/g,' ').trim();}
function easter(y){
  const a=y%19,b=Math.floor(y/100),c=y%100,d=Math.floor(b/4),e=b%4,f=Math.floor((b+8)/25),g=Math.floor((b-f+1)/3),h=(19*a+b-d-g+15)%30,i=Math.floor(c/4),k=c%4,l=(32+2*e+2*i-h-k)%7,m=Math.floor((a+11*h+22*l)/451),mo=Math.floor((h+l-7*m+114)/31),day=((h+l-7*m+114)%31)+1;
  return new Date(y,mo-1,day);
}
function holidays(y){
  const e=easter(y);
  return new Set([
    y+'-01-01',y+'-01-06',iso(add(e,-2)),iso(add(e,1)),
    y+'-05-01',iso(add(e,39)),iso(add(e,50)),iso(add(e,60)),
    y+'-10-03',y+'-11-01',y+'-12-25',y+'-12-26'
  ]);
}
function due(y,m){
  let d=new Date(Number(y),Number(m)-1,20),h=holidays(Number(y));
  while(d.getDay()===0||d.getDay()===6||h.has(iso(d)))d=add(d,-1);
  return iso(d);
}
function ymPrev(y,m){m=Number(m)-1;y=Number(y);if(m===0){m=12;y--;}return {y,m};}
function cycle(y,m){
  const p=ymPrev(y,m),prev=due(p.y,p.m).split('-').map(Number);
  return {start:iso(add(new Date(prev[0],prev[1]-1,prev[2]),1)),end:due(y,m)};
}
function diff(v){const p=String(v||'').split('-').map(Number);if(p.length!==3)return 0;const a=new Date(p[0],p[1]-1,p[2]),b=new Date();a.setHours(0,0,0,0);b.setHours(0,0,0,0);return Math.round((a-b)/86400000);}
function selectedPayroll(){return {year:Number($('dg520Year')?.value||new Date().getFullYear()),month:Number($('dg520Month')?.value||new Date().getMonth()+1)};}

function css(){
  if($('dg74Css'))return;
  const s=document.createElement('style');s.id='dg74Css';
  s.textContent=`
    #dg520Due,#d3Count-payroll{display:none!important}
    .dg74-due{font-weight:900;margin:10px 0;padding:11px 14px;border-radius:13px;background:#eef2ff}
    .dg74-due.warn{background:#fff7ed;color:#9a3412}.dg74-due.error{background:#fef2f2;color:#991b1b}.dg74-due.ok{background:#f0fdf4;color:#166534}
    .dg74-force{margin-top:14px;padding:14px;border-radius:14px;background:#fff7ed;border:1px solid #fdba74;color:#9a3412}
    .dg74-cycle{margin:10px 0;padding:12px 14px;border-radius:12px;background:#e8f0ff;border:1px solid #9db7f5;color:#163b88;font-weight:900}
    .dg74-cycle small{display:block;margin-top:3px;color:#395b95}
    .dg74-highlight{outline:3px solid #2563eb!important;box-shadow:0 0 0 5px rgba(37,99,235,.13)!important}
  `;
  document.head.appendChild(s);
}

function paintDue(){
  css();
  const sec=$('dg520PayrollClose'),q=selectedPayroll(),payDue=due(q.year,q.month),d=diff(payDue),regular=q.year+'-'+pad(q.month)+'-20';
  if(sec){
    let box=$('dg74Due');
    if(!box){box=document.createElement('div');box.id='dg74Due';box.className='dg74-due';const old=$('dg520Due');if(old)old.insertAdjacentElement('afterend',box);else sec.prepend(box);}
    let txt='',cls='';
    if(d===0){txt='🔴 Lohnübergabe heute fällig ('+de(payDue)+').';cls='error';}
    else if(d>0){txt=(d<=2?'🔴 ':'🟢 ')+'Lohnübergabe am '+de(payDue)+' · noch '+d+' Tag'+(d===1?'':'e')+'.';cls=d<=2?'error':d<=5?'warn':'ok';}
    else{txt='🔴 Lohnübergabe seit '+Math.abs(d)+' Tag'+(Math.abs(d)===1?'':'en')+' überfällig ('+de(payDue)+').';cls='error';}
    if(payDue!==regular)txt+=' Regulärer 20. fällt auf Wochenende/Feiertag – Übergabe vorgezogen.';
    box.className='dg74-due '+cls;box.textContent=txt;

    const c=cycle(q.year,q.month);let cbox=$('dg74PayrollCycle');
    if(!cbox){cbox=document.createElement('div');cbox.id='dg74PayrollCycle';cbox.className='dg74-cycle';box.insertAdjacentElement('afterend',cbox);}
    cbox.innerHTML='Abrechnungszeitraum: '+de(c.start)+' – '+de(c.end)+'<small>Stunden-Zähler starten am Folgetag des tatsächlichen Lohn-Stichtags automatisch neu.</small>';
  }

  const tile=document.querySelector('#bossView .d3-tile.payroll');
  if(tile){
    let strong=$('dg74CountPayroll');
    if(!strong){strong=document.createElement('strong');strong.id='dg74CountPayroll';const old=$('d3Count-payroll');if(old)old.insertAdjacentElement('afterend',strong);else tile.appendChild(strong);}
    const n=new Date(),tDue=due(n.getFullYear(),n.getMonth()+1),td=diff(tDue);
    strong.textContent=td===0?'Heute':td>0?(td+' Tag'+(td===1?'':'e')):(Math.abs(td)+' Tag'+(Math.abs(td)===1?'':'e')+' überf.');
    tile.title='Lohnübergabe '+de(tDue);
  }
}

function payrollTable(rows){
  let h='<div class="dg520-table-wrap"><table class="dg520-table"><thead><tr><th>Mitarbeiter</th><th>Status</th><th>Abrechnung</th><th>Soll</th><th>Ist</th><th>geleistet</th><th>Lohn-Std.</th><th>Satz/Gehalt</th><th>Brutto*</th><th>Urlaub</th><th>Krank</th></tr></thead><tbody>';
  (rows||[]).forEach(r=>{
    const pay=r.payrollType==='Festgehalt'?money520(r.monthlySalary)+' €/Monat':money520(r.hourlyWage)+' €/Std.';
    h+='<tr><td>'+e520(r.employee)+'</td><td>'+e520(r.employmentType)+'</td><td>'+e520(r.payrollType)+(r.payrollRelevant?'':' · nicht lohnrelevant')+'</td><td>'+h520(r.targetHours)+'</td><td>'+h520(r.actualHours)+'</td><td>'+h520(r.workHours)+'</td><td>'+h520(r.payrollHours)+'</td><td>'+e520(pay)+'</td><td>'+money520(r.grossEstimate)+' €</td><td>'+Number(r.vacationDays||0)+'</td><td>'+Number(r.sickDays||0)+'</td></tr>';
  });
  return h+'</tbody></table></div><div class="muted small">* Tatsächlich geleistete bzw. gutgeschriebene Stunden werden ausbezahlt. Es wird kein Zeitguthaben aufgebaut.</div>';
}
window.renderPayrollTable520=payrollTable;

function decorateAudit(a){
  audit=a||audit;if(!a)return;
  paintDue();
  const out=$('dg520Result');if(!out)return;
  let row=[...out.children].filter(x=>x.classList?.contains('button-row')).pop();
  if(row&&!row.dataset.dg74){
    row.dataset.dg74='1';
    const completed=a?.state?.status==='Uebergeben'&&!a?.state?.changedSinceApproval;
    if(completed){
      row.innerHTML='<button class="btn success" type="button" disabled>✓ Monatsabschluss erfolgt</button><button class="btn secondary" type="button" onclick="return dg520SetState(\'Wieder geoeffnet\')">Monat wieder öffnen</button>';
    }else{
      row.innerHTML='<button class="btn success" type="button" '+(a?.canRelease&&!a?.state?.changedSinceApproval?'':'disabled')+' id="dg74NormalClose">Monatsabschluss erfolgt</button><button class="btn danger" type="button" id="dg74ForceClose">Alles überprüft – trotzdem an Steuerberater übergeben</button>';
      $('dg74NormalClose')?.addEventListener('click',()=>completePayroll(false));
      $('dg74ForceClose')?.addEventListener('click',()=>completePayroll(true));
    }
  }
  let note=$('dg74ForceNote');
  if(!note&&!completedState(a)){
    note=document.createElement('div');note.id='dg74ForceNote';note.className='dg74-force';
    note.innerHTML='<strong>Bewusste Freigabe möglich</strong>Die rote Zwangsübergabe bleibt immer verfügbar. Sie dokumentiert, dass alle Auffälligkeiten geprüft und der Monat trotzdem freigegeben wurde.';
    out.appendChild(note);
  }
}
function completedState(a){return a?.state?.status==='Uebergeben'&&!a?.state?.changedSinceApproval;}

async function completePayroll(force){
  const q=selectedPayroll();if(payrollBusy)return false;
  const a=audit;
  if(!a){setMessage('dg520Status','Bitte zuerst „Monat jetzt prüfen“ ausführen.','error');return false;}
  if(!force && (!a.canRelease||a?.state?.changedSinceApproval)){setMessage('dg520Status','Normale Freigabe ist noch blockiert. Nutze nach Prüfung gegebenenfalls die rote Zwangsübergabe.','error');return false;}
  const run=async reason=>{
    payrollBusy=true;
    try{
      setMessage('dg520Status',force?'Zwangsübergabe wird gespeichert ...':'Monatsabschluss wird gespeichert ...','info');
      const action=force?'forceCompletePayrollCycle':'completePayrollCycle';
      const r=await api(chefPayload({action,year:q.year,month:q.month,reason:reason||''}));
      audit=r?.audit||a;
      if(typeof window.dg520RunAudit==='function')await window.dg520RunAudit();
      try{if(typeof window.d3Dashboard==='function')await window.d3Dashboard(true);}catch(_e){}
      setMessage('dg520Status',force?'✓ Bewusst trotz Auffälligkeiten übergeben.':'✓ Monatsabschluss erfolgt.','ok');
    }finally{payrollBusy=false;}
  };
  if(force){
    if(typeof d3Form!=='function')return false;
    d3Form('Alles geprüft – trotzdem übergeben',[{name:'reason',label:'Prüfvermerk / Grund',type:'textarea',required:true}],{reason:'Alle angezeigten Auffälligkeiten wurden geprüft. Monatsabschluss wird bewusst trotzdem durchgeführt.'},async v=>{
      if(!confirm('Monat wirklich trotz verbleibender Auffälligkeiten abschließen und an den Steuerberater übergeben?'))throw new Error('Freigabe abgebrochen.');
      await run(String(v.reason||'').trim());
    });
  }else{
    if(!confirm('Monatsabschluss wirklich durchführen?'))return false;
    await run('');
  }
  return false;
}

const baseAudit=window.renderAudit520;
if(typeof baseAudit==='function')window.renderAudit520=function(a){const r=baseAudit.apply(this,arguments);audit=a;decorateAudit(a);return r;};

function observePayroll(){ /* CLEAN 7.4.1: kein dauerhafter DOM-Observer mehr */ }

async function refreshCounters(){
  const a=typeof auth==='function'?auth():{},week=$('dg54WeekHours'),month=$('employeeTimeBank');
  if(!a.employee||!a.pin||!navigator.onLine)return;
  try{
    const n=new Date(),d=await api({action:'getWeekData',employee:a.employee,pin:a.pin,referenceDate:iso(n)});
    if(week)week.innerHTML='Geleistete Wochenstunden: '+formatHours(d.total||0)+' Std.<small>Zeitraum '+de(d.start)+' bis '+de(d.end)+'</small>';
    if(month){month.style.display='';month.textContent='Geleistete Monatsstunden: '+formatHours(d.monthTotal||0)+' Std.';}
  }catch(_e){}
}
function cleanMonth(){
  const root=$('monthResult');if(root){
    root.querySelectorAll('.status,.entry,.total').forEach(x=>{
      if(/Zeitguthaben/i.test(x.textContent||''))x.innerHTML=(x.innerHTML||'').replace(/\s*[·|]\s*Zeitguthaben\s*[^<·|]*Std\.?/gi,'').replace(/Zeitguthaben\s*[^<·|]*Std\.?\s*[·|]?/gi,'');
    });
  }
  const y=Number($('empYear')?.value),m=Number($('empMonth')?.value),grid=$('empYear')?.closest('.grid2');
  if(y>0&&m>=1&&m<=12&&grid){
    const c=cycle(y,m);let box=$('dg74EmployeeCycle');
    if(!box){box=document.createElement('div');box.id='dg74EmployeeCycle';box.className='dg74-cycle';grid.insertAdjacentElement('afterend',box);}
    box.innerHTML='Abrechnungszeitraum: '+de(c.start)+' – '+de(c.end)+'<small>Der Zähler beginnt am Folgetag des tatsächlichen Lohn-Stichtags neu.</small>';
  }
}
const baseLoadMonth=window.loadMonth;
if(typeof baseLoadMonth==='function')window.loadMonth=async function(){const r=await baseLoadMonth.apply(this,arguments);cleanMonth();await refreshCounters();return r;};
const baseRenderDay=window.renderDay;
if(typeof baseRenderDay==='function')window.renderDay=function(){const r=baseRenderDay.apply(this,arguments);setTimeout(refreshCounters,80);return r;};

window.dg520OpenDay=async function(empEncoded,date){
  const employee=decodeURIComponent(empEncoded||''),p=String(date||'').split('-'),y=Number(p[0]),m=Number(p[1]);
  try{
    setMessage('dg520Status','Tagesbericht wird geöffnet ...','info');
    if(typeof d3Open==='function')d3Open('d3Admin','dg48EmployeeClosures');
    await new Promise(r=>setTimeout(r,30));
    if($('dg48DayYear'))$('dg48DayYear').value=String(y);
    if($('dg48DayMonth'))$('dg48DayMonth').value=String(m);
    if(typeof loadBossDayClosuresV48!=='function')throw new Error('Mitarbeiterberichte sind nicht verfügbar.');
    await loadBossDayClosuresV48();
    const boxes=[...document.querySelectorAll('#dg48DayResult .dg48-days-employee')];
    const box=boxes.find(b=>norm((b.querySelector('.dg521-employee-head strong')||b.querySelector(':scope > strong'))?.textContent)===norm(employee));
    if(!box)throw new Error('Mitarbeiter '+employee+' nicht gefunden.');
    box.classList.remove('dg521-collapsed');
    box.querySelector(':scope > .dg48-day-grid')?.classList.remove('hidden');
    const wanted=typeof formatDateDE==='function'?formatDateDE(date):de(date);
    const card=[...box.querySelectorAll('.dg48-day')].find(c=>norm(c.querySelector(':scope > strong')?.textContent)===norm(wanted));
    if(!card)throw new Error('Tagesbericht '+wanted+' nicht gefunden.');
    const detail=card.querySelector('.dg49-detail');if(detail)detail.classList.remove('hidden');
    card.classList.add('dg74-highlight');card.scrollIntoView({behavior:'smooth',block:'center'});
    setTimeout(()=>card.classList.remove('dg74-highlight'),3500);
    clearMessage('dg520Status');
  }catch(e){setMessage('dg520Status','Tagesbericht konnte nicht geöffnet werden: '+(e?.message||e),'error');}
  return false;
};
function captureDayOpen(e){
  const b=e.target?.closest?.('button');if(!b||!/^Tag öffnen und prüfen$/i.test((b.textContent||'').trim()))return;
  const oc=b.getAttribute('onclick')||'',m=oc.match(/dg520OpenDay\('([^']*)','([^']*)'\)/);
  if(!m)return;
  e.preventDefault();e.stopImmediatePropagation();window.dg520OpenDay(m[1],m[2]);
}

const baseDashboard=window.d3Dashboard;
if(typeof baseDashboard==='function')window.d3Dashboard=async function(){const r=await baseDashboard.apply(this,arguments);paintDue();return r;};
const basePayroll=window.makePayrollSection520;
if(typeof basePayroll==='function')window.makePayrollSection520=function(){const r=basePayroll.apply(this,arguments);paintDue();return r;};

function stamp(){
  document.title='DG Zeiterfassung '+V;
  document.querySelectorAll('.login-card .muted.small').forEach(x=>{if(/^Version\s+/i.test((x.textContent||'').trim()))x.textContent='Version '+V;});
  document.querySelectorAll('.hero strong').forEach(x=>{if(/Zeiterfassung/i.test(x.textContent||''))x.textContent='Zeiterfassung - '+V;});
  try{window.DG_APP_VERSION=V;window.DG_RELEASE=V;if(window.DG3)DG3.version=V;}catch(_e){}
}
function install(){
  css();stamp();paintDue();observePayroll();cleanMonth();refreshCounters();
  const bank=$('adminTimeBankEmployee')?.closest('.admin-section');if(bank)bank.style.display='none';
  if(!document.documentElement.dataset.dg74DayOpen){document.documentElement.dataset.dg74DayOpen='1';document.addEventListener('click',captureDayOpen,true);}
  ['dg520Year','dg520Month','empYear','empMonth'].forEach(id=>{const x=$(id);if(x&&!x.dataset.dg74){x.dataset.dg74='1';x.addEventListener('change',()=>{paintDue();cleanMonth();});}});
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>setTimeout(install,0),{once:true});else setTimeout(install,0);
setTimeout(install,180);
})();
;

/* ===== CONSOLIDATED SOURCE: app-7.4-clean-final.js ===== */
/* DG Zeiterfassung 7.4.1 CLEAN - finale UI-Logik ohne Legacy-Overlays */
(function(){
'use strict';
const V740='7.4.1';
const $=id=>document.getElementById(id);
const esc=v=>String(v==null?'':v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

function pad(n){return String(n).padStart(2,'0');}
function iso(d){return d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate());}
function add(d,n){const x=new Date(d.getFullYear(),d.getMonth(),d.getDate());x.setDate(x.getDate()+n);return x;}
function de(v){try{return typeof formatDateDE==='function'?formatDateDE(v):String(v||'');}catch(_e){return String(v||'');}}
function diff(v){const p=String(v||'').split('-').map(Number);if(p.length!==3)return 0;const a=new Date(p[0],p[1]-1,p[2]),b=new Date();a.setHours(0,0,0,0);b.setHours(0,0,0,0);return Math.round((a-b)/86400000);}

function easter(y){
  const a=y%19,b=Math.floor(y/100),c=y%100,d=Math.floor(b/4),e=b%4,f=Math.floor((b+8)/25),g=Math.floor((b-f+1)/3),h=(19*a+b-d-g+15)%30,i=Math.floor(c/4),k=c%4,l=(32+2*e+2*i-h-k)%7,m=Math.floor((a+11*h+22*l)/451),month=Math.floor((h+l-7*m+114)/31),day=((h+l-7*m+114)%31)+1;
  return new Date(y,month-1,day);
}
function holidays(y){
  const e=easter(y);
  return new Set([
    y+'-01-01',y+'-01-06',
    iso(add(e,-2)),iso(add(e,1)),
    y+'-05-01',iso(add(e,39)),iso(add(e,50)),iso(add(e,60)),
    y+'-10-03',y+'-11-01',y+'-12-25',y+'-12-26'
  ]);
}
function payrollDue(year,month){
  year=Number(year);month=Number(month);
  let d=new Date(year,month-1,20),h=holidays(year);
  while(d.getDay()===0||d.getDay()===6||h.has(iso(d)))d=add(d,-1);
  return iso(d);
}
function selected(){
  return {
    year:Number($('dg520Year')?.value||$('bossYear')?.value||new Date().getFullYear()),
    month:Number($('dg520Month')?.value||$('bossMonth')?.value||(new Date().getMonth()+1))
  };
}

function paintDue(){
  const q=selected(),due=payrollDue(q.year,q.month),d=diff(due),box=$('dg520Due');
  if(box){
    let text='',cls='';
    if(d===0){text='🔴 Lohnübergabe heute fällig ('+de(due)+').';cls='error';}
    else if(d>0){text=(d<=2?'🔴 ':'🟢 ')+'Lohnübergabe am '+de(due)+' · noch '+d+' Tag'+(d===1?'':'e')+'.';cls=d<=2?'error':d<=5?'warn':'';}
    else{text='🔴 Lohnübergabe seit '+Math.abs(d)+' Tag'+(Math.abs(d)===1?'':'en')+' überfällig ('+de(due)+').';cls='error';}
    const regular=q.year+'-'+pad(q.month)+'-20';
    if(due!==regular)text+=' Regulärer 20. fällt auf Wochenende/Feiertag – Übergabe vorgezogen.';
    box.className='dg520-due '+cls;
    box.textContent=text;
  }
  const now=new Date(),tdue=payrollDue(now.getFullYear(),now.getMonth()+1),td=diff(tdue);
  const strong=$('d3Count-payroll'),tile=document.querySelector('#bossView .d3-tile.payroll');
  if(strong)strong.textContent=td===0?'Heute':td>0?(td+' Tag'+(td===1?'':'e')):(Math.abs(td)+' Tag'+(Math.abs(td)===1?'':'e')+' überf.');
  if(tile)tile.title='Lohnübergabe '+de(tdue);
}

function ensureForceBox(a){
  const out=$('dg520Result');if(!out||!a)return;
  const completed=a?.state?.status==='Uebergeben'&&!a?.state?.changedSinceApproval;
  let box=$('dg740ForceBox');
  if(completed){if(box)box.remove();return;}
  if(!box){
    box=document.createElement('div');
    box.id='dg740ForceBox';
    box.className='status warn';
    box.style.marginTop='14px';
    out.appendChild(box);
  }
  const errors=Number(a?.summary?.errors||0),warnings=Number(a?.summary?.warnings||0);
  box.innerHTML=
    '<strong>Zwangsübergabe / bewusste Freigabe</strong><br>'+
    'Wenn alle Auffälligkeiten geprüft wurden, kann der Monat unabhängig vom automatischen Prüfstatus direkt abgeschlossen und als an den Steuerberater übergeben markiert werden.'+
    '<div class="muted small" style="margin-top:5px">'+errors+' Fehler · '+warnings+' ungeprüfte Hinweise</div>'+
    '<div class="button-row" style="margin-top:10px">'+
      '<button class="btn danger" type="button" onclick="return dg740ForceRelease()">Alles überprüft – trotzdem an Steuerberater übergeben</button>'+
    '</div>';
}

window.dg740ForceRelease=async function(){
  const q=selected(),a=(typeof currentAudit520!=='undefined'?currentAudit520:null);
  if(!a){setMessage('dg520Status','Bitte zuerst „Monat jetzt prüfen“ ausführen.','error');return false;}
  if(typeof d3Form!=='function')return false;
  const count=Number(a?.summary?.errors||0)+' Fehler / '+Number(a?.summary?.warnings||0)+' ungeprüfte Hinweise';
  d3Form('Alles geprüft – trotzdem übergeben',[
    {name:'reason',label:'Grund / interner Prüfvermerk',type:'textarea',required:true}
  ],{reason:'Alle angezeigten Auffälligkeiten wurden geprüft. Bewusste Übergabe trotz '+count+'.'},async v=>{
    if(!confirm('Monat wirklich trotz verbleibender Auffälligkeiten an den Steuerberater übergeben?\n\n'+count+'\n\nDie Entscheidung wird protokolliert.'))throw new Error('Freigabe abgebrochen.');
    setMessage('dg520Status','Zwangsübergabe wird gespeichert ...','info');
    const r=await api(chefPayload({action:'forceCompletePayrollCycle',year:q.year,month:q.month,reason:String(v.reason||'').trim()}));
    if(typeof currentAudit520!=='undefined')currentAudit520=r.audit||a;
    if(typeof renderAudit520==='function')renderAudit520(r.audit||a);
    setMessage('dg520Status','✓ Monat wurde bewusst trotz Auffälligkeiten übergeben.','ok');
    try{if(typeof d3Dashboard==='function')await d3Dashboard(true);}catch(_e){}
  });
  return false;
};

window.dg520OpenDay=async function(empEncoded,date){
  const employee=decodeURIComponent(String(empEncoded||'')),p=String(date||'').split('-'),year=Number(p[0]),month=Number(p[1]);
  try{
    if(typeof d3Open==='function')d3Open('d3Admin');
    const group=$('dg48EmployeeClosures');
    if(group){
      const body=group.querySelector(':scope > .dg48-body');
      if(body)body.classList.remove('hidden');
      const t=group.querySelector(':scope > .dg48-head .dg48-toggle');
      if(t)t.textContent='−';
    }
    if($('dg48DayYear'))$('dg48DayYear').value=String(year);
    if($('dg48DayMonth'))$('dg48DayMonth').value=String(month);
    setMessage('dg520Status','Tagesbericht wird geöffnet ...','info');
    if(typeof loadBossDayClosuresV48!=='function')throw new Error('Mitarbeiterberichte sind nicht verfügbar.');
    await loadBossDayClosuresV48();

    const boxes=[...document.querySelectorAll('#dg48DayResult .dg48-days-employee')];
    const box=boxes.find(b=>{
      const h=b.querySelector('.dg521-employee-head strong')||b.querySelector(':scope > strong');
      return (h?.textContent||'').trim()===employee;
    });
    if(!box)throw new Error('Mitarbeiter '+employee+' wurde in diesem Monat nicht gefunden.');

    const wanted=de(date);
    const cards=[...box.querySelectorAll('.dg48-day')];
    const card=cards.find(c=>(c.querySelector(':scope > strong')?.textContent||'').trim()===wanted);
    if(!card)throw new Error('Tagesbericht '+wanted+' wurde nicht gefunden.');

    const detail=card.querySelector('.dg49-detail');if(detail)detail.classList.remove('hidden');
    card.style.outline='3px solid #2563eb';
    card.scrollIntoView({behavior:'smooth',block:'center'});
    setTimeout(()=>{card.style.outline='';},3000);
    clearMessage('dg520Status');
  }catch(e){
    setMessage('dg520Status','Tagesbericht konnte nicht geöffnet werden: '+(e?.message||e),'error');
  }
  return false;
};

const renderAuditBase=window.renderAudit520;
if(typeof renderAuditBase==='function')window.renderAudit520=function(a){
  const r=renderAuditBase.apply(this,arguments);
  paintDue();ensureForceBox(a);
  return r;
};
const dashboardBase=window.d3Dashboard;
if(typeof dashboardBase==='function')window.d3Dashboard=async function(){
  const r=await dashboardBase.apply(this,arguments);
  paintDue();
  return r;
};
const payrollSectionBase=window.makePayrollSection520;
if(typeof payrollSectionBase==='function')window.makePayrollSection520=function(){
  const r=payrollSectionBase.apply(this,arguments);
  paintDue();
  ['dg520Year','dg520Month'].forEach(id=>{const x=$(id);if(x&&!x.dataset.dg740){x.dataset.dg740='1';x.addEventListener('change',paintDue);}});
  return r;
};
const auditBase=window.dg520RunAudit;
if(typeof auditBase==='function')window.dg520RunAudit=async function(){
  const r=await auditBase.apply(this,arguments);
  try{paintDue();if(typeof currentAudit520!=='undefined'&&currentAudit520)ensureForceBox(currentAudit520);}catch(_e){}
  return r;
};

function cleanupLegacyArtifacts(){
  ['dg521Styles','dg522Styles'].forEach(id=>{const n=$(id);if(n)n.remove();});
  document.querySelectorAll('.dg522-review-panel').forEach(n=>n.remove());
}
function stamp(){
  document.title='DG Zeiterfassung '+V740;
  document.querySelectorAll('.login-card .muted.small').forEach(x=>{if(/^Version\s+/i.test((x.textContent||'').trim()))x.textContent='Version '+V740;});
  document.querySelectorAll('.hero strong').forEach(x=>{if(/Zeiterfassung/i.test(x.textContent||''))x.textContent='Zeiterfassung - '+V740;});
  try{window.DG_APP_VERSION=V740;window.DG_RELEASE=V740;if(window.DG3)DG3.version=V740;}catch(_e){}
}
function install(){
  cleanupLegacyArtifacts();
  stamp();
  paintDue();
  try{if(typeof currentAudit520!=='undefined'&&currentAudit520)ensureForceBox(currentAudit520);}catch(_e){}
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});else install();
})();
;
