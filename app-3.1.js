const API_URL='https://script.google.com/macros/s/AKfycbyFHSno-zZJetrAsH00fybiuxYw8xfYVo0kkWxhYLHNxDK4fqn5yijJfokrMvG6C4oc/exec';

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

function openMain(){
  const a=auth();
  $('loginScreen').classList.add('hidden');
  $('mainScreen').classList.remove('hidden');
  $('employeeLabel').textContent='Angemeldet: '+a.employee;
  $('date').value=localDate();

  const bossAllowed=canAccessBoss();
  $('bossTab').classList.toggle('hidden',!bossAllowed);
  if(!bossAllowed)showEmployee();

  showEmployee();DG3.reports={};DG3.inquiries=[];DG3.orders=[];$('regieResult').replaceChildren();$('d3RunningList').replaceChildren();d3CheckBackend();loadEmployeeDirectory();
  requestAnimationFrame(()=>{if(customerPad)customerPad.resize();if(employeePad)employeePad.resize()});
  updateConnection();
  loadDay();
  loadCalendarEvents();
}

function showEmployee(){$('employeeView').classList.remove('hidden');$('bossView').classList.add('hidden');$('employeeTab').classList.add('active');$('bossTab').classList.remove('active')}

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

function updatePhotoStatus(){$('photoStatus').textContent=preparedPhotos.length?preparedPhotos.length+' von 6 Bild(ern) bereit. Bitte Vorschau kontrollieren.':'Noch keine Bilder hinzugefügt.';$('clearPhotosBtn').classList.toggle('hidden',preparedPhotos.length===0);renderPhotoPreview()}

function removePreparedPhoto(i){preparedPhotos.splice(i,1);updatePhotoStatus()}

function clearPhotos(){preparedPhotos=[];$('cameraPhoto').value='';$('galleryPhotos').value='';updatePhotoStatus()}

async function startCamera(){
  if(preparedPhotos.length>=6){setMessage('entryStatus','Maximal 6 Bilder möglich.','warn');return}
  if(!navigator.mediaDevices||!navigator.mediaDevices.getUserMedia){$('cameraPhoto').click();return}
  try{
    stopCamera();
    cameraStream=await navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:'environment'}},audio:false});
    $('cameraVideo').srcObject=cameraStream;$('cameraLive').classList.remove('hidden');
  }catch(e){$('cameraLive').classList.add('hidden');$('cameraPhoto').click()}
}

function stopCamera(){if(cameraStream){cameraStream.getTracks().forEach(t=>t.stop());cameraStream=null}if($('cameraVideo'))$('cameraVideo').srcObject=null;if($('cameraLive'))$('cameraLive').classList.add('hidden')}

function captureCameraPhoto(){
  if(!cameraStream||preparedPhotos.length>=6){if(preparedPhotos.length>=6)stopCamera();return}
  const v=$('cameraVideo');if(!v.videoWidth||!v.videoHeight)return;
  const max=1200,f=Math.min(1,max/v.videoWidth,max/v.videoHeight),c=document.createElement('canvas');c.width=Math.round(v.videoWidth*f);c.height=Math.round(v.videoHeight*f);c.getContext('2d').drawImage(v,0,0,c.width,c.height);preparedPhotos.push({dataUrl:c.toDataURL('image/jpeg',0.68)});updatePhotoStatus();if(preparedPhotos.length>=6)stopCamera();
}

async function addPhotos(files,inputId){const remaining=6-preparedPhotos.length;if(remaining<=0)return;const list=Array.from(files||[]).slice(0,remaining);$('photoStatus').textContent='Bilder werden vorbereitet ...';try{for(const f of list)preparedPhotos.push({dataUrl:await resizeImage(f)});updatePhotoStatus()}catch(e){$('photoStatus').textContent='Bild konnte nicht vorbereitet werden.'}$(inputId).value=''}

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
window.DG3={version:'3.1',backend:'',pending:0,reads:new Map(),reports:{},active:'Abgeschlossen',loaders:{},ready:false};window.DG_APP_VERSION='3.1';
function d3Visible(e){return !!(e&&e.getClientRects().length);}
function d3Notice(msg,type='info'){let e=$('d3Notice');if(!e){e=document.createElement('div');e.id='d3Notice';document.querySelector('#mainScreen .tabs').after(e);}e.className='status '+type;e.textContent=msg;}
function d3Button(text,fn,args=[],kind='primary'){return '<button type="button" class="btn '+kind+'" data-d3-fn="'+esc(fn)+'" data-d3-args="'+esc(JSON.stringify(args))+'">'+esc(text)+'</button>';}
async function d3CheckBackend(){try{const r=await api({action:'ping'});DG3.backend=String(r.version||'');if(!/^3\./.test(DG3.backend))d3Notice('App 3.1: Bitte zuerst Google-GS 3.0 bereitstellen. Backend: '+DG3.backend+'. Speichern ist gesperrt.','warn');else $('d3Notice')?.remove();return /^3\./.test(DG3.backend);}catch(e){d3Notice('Verbindungspruefung fehlgeschlagen: '+e.message,'warn');return false;}}
async function d3Api(payload){const action=String(payload.action||''),read=/^(get|check)/.test(action)||['ping','employeeLogin','systemHealthCheck'].includes(action),key=JSON.stringify(payload);if(action!=='ping'&&!/^3\./.test(DG3.backend)){await d3CheckBackend();if(!/^3\./.test(DG3.backend))throw dgError('Google-Backend 3.0 noch nicht bereitgestellt.','version');}if(read&&DG3.reads.has(key))return DG3.reads.get(key);const promise=(async()=>{if(!read)DG3.pending++;const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),65000);try{let response;try{response=await fetch(API_URL,{method:'POST',headers:{'Content-Type':'text/plain;charset=utf-8'},body:JSON.stringify({...payload,clientVersion:'3.1'}),signal:controller.signal});}catch(e){throw dgError(e.name==='AbortError'?'Serverantwort dauert zu lange. Vor erneutem Anlegen zuerst Daten neu laden.':'Keine Serververbindung.','network');}if(!response.ok)throw dgError('HTTP '+response.status,'network');let data;try{data=JSON.parse(await response.text());}catch(e){throw dgError('Ungueltige Serverantwort.','server');}if(!data.ok)throw dgError(data.error||'Serverfehler.','server');return data.data!==undefined?data.data:data;}finally{clearTimeout(timer);if(!read)DG3.pending--;}})();if(read)DG3.reads.set(key,promise);try{return await promise;}finally{if(read&&DG3.reads.get(key)===promise)DG3.reads.delete(key);}}
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
async function refreshWeek(){let box=$('dg54WeekHours');const monthBox=$('employeeTimeBank');if(!monthBox)return;if(!box){box=document.createElement('div');box.id='dg54WeekHours';box.className='dg54-week';monthBox.insertAdjacentElement('beforebegin',box)}if(!navigator.onLine){box.innerHTML='Geleistete Wochenstunden: offline nicht verfügbar';return}const a=typeof auth==='function'?auth():{};if(!a.employee||!a.pin)return;try{box.innerHTML='Geleistete Wochenstunden: werden geladen …';const d=await api({action:'getWeekData',employee:a.employee,pin:a.pin,referenceDate:isoToday()});box.innerHTML='Geleistete Wochenstunden: '+fmt(d.total||0)+' Std.<small>Woche '+deDate(d.start)+' bis '+deDate(d.end)+' · Montag bis Samstag</small>'}catch(e){box.innerHTML='Geleistete Wochenstunden: nicht verfügbar'}}
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
async function d3Dashboard(){if(!canAccessBoss()||!navigator.onLine)return;const d=new Date(),jobs=[['reports',{action:'getRegieReports',status:'Offen',year:0,month:0}],['offers',{action:'getOfferReports',stage:'Offen'}],['days',{action:'getBossDayClosures',year:d.getFullYear(),month:d.getMonth()+1}],['reminders',{action:'getOfferReminders',includeDone:false}],['inquiries',{action:'getCustomerInquiries',status:'Offen'}]];await Promise.all(jobs.map(async([k,p])=>{try{const a=await api(chefPayload(p));if(k==='reports'){d3Count('running',a.filter(g=>g.jobStatus==='Laufend').length);d3Count('completed',a.filter(g=>g.jobStatus!=='Laufend').length);}else d3Count(k,k==='days'?a.reduce((n,x)=>n+(x.days||[]).filter(d=>!d.closed).length,0):k==='reminders'?a.filter(x=>x.isDue).length:a.length);}catch(e){if(k==='reports'){d3Count('running','!');d3Count('completed','!');}else d3Count(k,'!');}}));}
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
async function d3Health(){const out=$('d3HealthList');out.textContent='System wird geprueft ...';try{const r=await api(chefPayload({action:'systemHealthCheck'}));out.innerHTML='<div class="status '+(r.ok?'ok':'warn')+'">App 3.1 - Backend '+esc(r.version)+' - '+esc(r.checkedAt)+'</div>'+(r.checks||[]).map(x=>'<div class="status '+(x.level==='error'?'error':x.level==='warn'?'warn':'ok')+'"><strong>'+esc(x.name)+'</strong><br>'+esc(x.detail)+'</div>').join('');}catch(e){out.textContent='Systemcheck fehlgeschlagen: '+e.message;}}


DG3.offers={};DG3.inquiries=[];DG3.orders=[];DG3.reminders=[];
function d3OfferBox(stage){return stage==='Offen'?'d3OfferOpen':stage==='Zu erstellen'?'d3OfferCreate':'d3OfferArchive';}
async function loadOffers(stage='Offen'){const id=d3OfferBox(stage);setMessage(id+'Status','Angebote werden geladen ...','info');try{const rows=await api(chefPayload({action:'getOfferReports',stage}));DG3.offers[stage]=rows;$(id+'List').innerHTML=rows.map((r,i)=>{const buttons=stage==='Offen'?d3Button('Angenommen','d3OfferDecision',[r.offerId,true],'success')+d3Button('Abgelehnt','d3OfferDecision',[r.offerId,false],'secondary'):stage==='Zu erstellen'?d3Button('Angebot erstellt','d3OfferCreated',[r.offerId],'success')+d3Button('Auftrag entfernen','d3DiscardOffer',[r.offerId],'danger'):'';return '<div class="report-card'+(i%2?' d3-alt':'')+'"><strong>'+esc(r.customer)+'</strong><div class="report-meta">'+esc(r.status)+' - '+Number(r.reportCount||0)+' Berichte - '+formatHours(r.totalHours)+' Std.</div><div>'+esc(r.description||'')+'</div>'+((r.reports||[]).length?'<details><summary>Einzelberichte anzeigen</summary>'+r.reports.map(d3Single).join('')+'</details>':'<div class="muted small">Angebot ohne bereits erfasste Arbeitszeit.</div>')+'<div class="report-actions">'+buttons+'</div></div>';}).join('')||'Keine Angebote vorhanden.';setMessage(id+'Status',rows.length+' Angebot(e) geladen.','ok');if(stage==='Offen')d3Count('offers',rows.length);}catch(e){setMessage(id+'Status',e.message,'error');}}
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


function d3Startup(){try{const pin=localStorage.getItem('dg_employee_pin');if(pin&&!sessionStorage.getItem('dg_employee_pin'))sessionStorage.setItem('dg_employee_pin',pin);localStorage.removeItem('dg_employee_pin');d3InstallOffice();d3TransferInstall();document.querySelectorAll('[onclick]').forEach(e=>{const s=e.getAttribute('onclick');if(s&&!s.startsWith('return ')&&/^[\w.$]+\([\s\S]*\)$/.test(s.trim()))e.setAttribute('onclick','return '+s);});init();DG3.ready=true;setInterval(d3Sync,60000);document.addEventListener('visibilitychange',()=>{if(!document.hidden)d3Sync();});if('serviceWorker'in navigator)navigator.serviceWorker.register('./sw.js',{updateViaCache:'none'}).then(r=>r.update()).catch(e=>d3Notice('Offline-Funktion noch nicht bereit: '+e.message,'warn'));}catch(e){console.error(e);const msg=d3Element('div','status error');msg.textContent='App 3.1 konnte nicht starten: '+e.message;document.body.prepend(msg);}}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',d3Startup,{once:true});else d3Startup();

