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
  try{const r=await api({action:'ping'}),found=String(r&&r.version||''),p=found.split('.').map(Number),ok=p[0]>5||(p[0]===5&&p[1]>=1);DG3.backend=ok?found:'';if(ok){sset51('dg51_backend',{ts:now51(),version:found});$('d3Notice')?.remove();return true;}d3Notice('App 5.1 benötigt Google-GS 5.1 oder neuer. Gefunden: '+(found||'unbekannt')+'. Speichern ist gesperrt.','warn');return false;}catch(e){DG3.backend='';d3Notice('Verbindungsprüfung fehlgeschlagen: '+e.message,'warn');return false;}
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
