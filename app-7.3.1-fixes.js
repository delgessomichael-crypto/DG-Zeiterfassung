/* DG Zeiterfassung 7.3.1 - Lohnabschluss UI, Faelligkeit, Abrechnungszeitraum, kein Zeitguthaben */
(function(){
'use strict';
const V731='7.3.1';
const BACKEND731=(typeof API_URL!=='undefined'&&API_URL)||'https://script.google.com/macros/s/AKfycby2L3SMgh2RoGWsNRUp6o11g4iyZ8bgkSIGaAZPnBXCkJTkDDGF9aydn9vVKMB7kXsO/exec';
let payrollBusy731=false;

function el731(id){return document.getElementById(id);}
function pad731(n){return String(n).padStart(2,'0');}
function iso731(d){return d.getFullYear()+'-'+pad731(d.getMonth()+1)+'-'+pad731(d.getDate());}
function de731(v){try{return typeof formatDateDE==='function'?formatDateDE(v):String(v||'');}catch(_e){return String(v||'');}}
function esc731(v){return String(v==null?'':v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function selected731(){return {year:Number(el731('dg520Year')?.value||el731('bossYear')?.value),month:Number(el731('dg520Month')?.value||el731('bossMonth')?.value)};}

function easter731(y){
  const a=y%19,b=Math.floor(y/100),c=y%100,d=Math.floor(b/4),e=b%4,f=Math.floor((b+8)/25),g=Math.floor((b-f+1)/3),h=(19*a+b-d-g+15)%30,i=Math.floor(c/4),k=c%4,l=(32+2*e+2*i-h-k)%7,m=Math.floor((a+11*h+22*l)/451),month=Math.floor((h+l-7*m+114)/31),day=((h+l-7*m+114)%31)+1;
  return new Date(y,month-1,day);
}
function add731(d,n){const x=new Date(d.getFullYear(),d.getMonth(),d.getDate());x.setDate(x.getDate()+n);return x;}
function holidaySet731(y){
  const e=easter731(y),set=new Set([
    y+'-01-01',y+'-01-06',y+'-05-01',y+'-10-03',y+'-11-01',y+'-12-25',y+'-12-26',
    iso731(add731(e,-2)),iso731(add731(e,1)),iso731(add731(e,39)),iso731(add731(e,50))
  ]);
  return set;
}
function payrollDue731(y,m){
  let d=new Date(Number(y),Number(m)-1,20),h=holidaySet731(Number(y));
  while(d.getDay()===0||d.getDay()===6||h.has(iso731(d)))d=add731(d,-1);
  return iso731(d);
}
function cycle731(y,m){
  y=Number(y);m=Number(m);let py=y,pm=m-1;if(pm===0){pm=12;py--;}
  return {start:py+'-'+pad731(pm)+'-21',end:y+'-'+pad731(m)+'-20'};
}
function diff731(v){
  const p=String(v||'').split('-').map(Number);if(p.length!==3)return 0;
  const a=new Date(p[0],p[1]-1,p[2]),b=new Date();a.setHours(0,0,0,0);b.setHours(0,0,0,0);
  return Math.round((a-b)/86400000);
}

function css731(){
  if(el731('dg731Css'))return;
  const s=document.createElement('style');s.id='dg731Css';
  s.textContent=`
    .dg731-cycle{margin:12px 0;padding:13px 16px;border-radius:13px;background:#e8f0ff;border:1px solid #9db7f5;color:#163b88;font-weight:900}
    .dg731-cycle small{display:block;margin-top:3px;font-weight:700;color:#395b95}
    .dg731-help{margin:8px 0 0;font-size:13px;color:#5b6472}
    .dg731-busy{opacity:.72;cursor:wait!important;pointer-events:none}
    .dg731-closed-warning{margin:12px 0;padding:13px 15px;border-radius:12px;background:#fee2e2;border:1px solid #fca5a5;color:#991b1b;font-weight:900}
  `;
  document.head.appendChild(s);
}

function employeeCycle731(){
  const y=Number(el731('empYear')?.value),m=Number(el731('empMonth')?.value);if(!(y>0&&m>=1&&m<=12))return;
  const grid=el731('empYear')?.closest('.grid2');if(!grid)return;
  let box=el731('dg731EmployeeCycle');
  if(!box){box=document.createElement('div');box.id='dg731EmployeeCycle';box.className='dg731-cycle';grid.insertAdjacentElement('afterend',box);}
  const c=cycle731(y,m);
  box.innerHTML='Abrechnungszeitraum: '+esc731(de731(c.start))+' – '+esc731(de731(c.end))+'<small>Die Lohn- und Monatsstunden werden immer vom 21. bis zum 20. gezählt.</small>';
}
function cleanTimeBankText731(){
  const root=el731('monthResult');
  if(root){
    [...root.querySelectorAll('.status,.entry,.total')].forEach(x=>{
      if(/Zeitguthaben/i.test(x.textContent||'')){
        x.innerHTML=(x.innerHTML||'').replace(/\s*[·|]\s*Zeitguthaben\s*[^<·|]*Std\.?/gi,'').replace(/Zeitguthaben\s*[^<·|]*Std\.?\s*[·|]?/gi,'');
      }
    });
  }
  employeeCycle731();
}

async function refreshEmployeeCounters731(){
  const a=typeof auth==='function'?auth():{},week=el731('dg54WeekHours'),month=el731('employeeTimeBank');
  if(!a.employee||!a.pin||!navigator.onLine)return;
  try{
    const now=new Date(),ref=iso731(now),d=await api({action:'getWeekData',employee:a.employee,pin:a.pin,referenceDate:ref});
    if(week)week.innerHTML='Geleistete Wochenstunden: '+formatHours(d.total||0)+' Std.<small>Woche '+de731(d.start)+' bis '+de731(d.end)+' · tatsächliche Einsätze werden mitgerechnet</small>';
    if(month){
      month.style.display='';
      month.classList.add('dg51-month-hours');
      month.textContent='Geleistete Monatsstunden: '+formatHours(d.monthTotal!=null?d.monthTotal:0)+' Std.';
      month.title=d.monthStart?'Abrechnungszeitraum ab '+de731(d.monthStart):'';
    }
  }catch(_e){}
}

function due731(audit){
  const box=el731('dg520Due');if(!box)return;
  const q=selected731(),state=(audit&&audit.state)||{},completed=state.status==='Uebergeben';
  const regular=q.year+'-'+pad731(q.month)+'-20';
  const due=completed?(audit?.nextDueDate||payrollDue731(q.month===12?q.year+1:q.year,q.month===12?1:q.month+1)):(audit?.dueDate||payrollDue731(q.year,q.month));
  const d=diff731(due);let text='',cls='';
  if(completed){
    text='🟢 Monatsabschluss erfolgt. Nächste Lohnübergabe am '+de731(due)+(d>0?' · noch '+d+' Tag'+(d===1?'':'e')+'.':d===0?' · heute.':' · überfällig.');
    cls=d<=5?'warn':'ok';
  }else if(d===0){text='🔴 Lohnübergabe heute fällig ('+de731(due)+').';cls='error';}
  else if(d>0){text=(d<=2?'🔴 ':'🟢 ')+'Lohnübergabe am '+de731(due)+' · noch '+d+' Tag'+(d===1?'':'e')+'.';cls=d<=2?'error':d<=5?'warn':'';}
  else{text='🔴 Lohnübergabe seit '+Math.abs(d)+' Tag'+(Math.abs(d)===1?'':'en')+' überfällig ('+de731(due)+').';cls='error';}
  if(!completed&&due!==regular)text+=' Regulärer 20. fällt auf Wochenende/Feiertag – Übergabe vorgezogen.';
  box.className='dg520-due '+cls;box.textContent=text;
}
window.updateDue520=updateDue520=due731;

function payrollCycleLabel731(a){
  const q=selected731(),c={start:a?.cycleStart,end:a?.cycleEnd};
  if(!c.start||!c.end)Object.assign(c,cycle731(q.year,q.month));
  const sec=el731('dg520PayrollClose');if(!sec)return;
  let x=el731('dg731PayrollCycle');
  if(!x){x=document.createElement('div');x.id='dg731PayrollCycle';x.className='dg731-cycle';const due=el731('dg520Due');if(due)due.insertAdjacentElement('afterend',x);}
  x.innerHTML='Abrechnungszeitraum: '+esc731(de731(c.start))+' – '+esc731(de731(c.end))+'<small>Monatsstunden und Lohnabrechnung laufen immer vom 21. bis zum 20.</small>';
}

async function post731(payload,timeoutMs){
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),timeoutMs||90000);
  try{
    const body=Object.assign({},payload,{clientVersion:V731});
    const res=await fetch(BACKEND731,{method:'POST',headers:{'Content-Type':'text/plain;charset=utf-8'},body:JSON.stringify(body),signal:controller.signal});
    if(!res.ok)throw new Error('HTTP '+res.status);
    const data=JSON.parse(await res.text());if(!data.ok)throw new Error(data.error||'Serverfehler.');
    return data.data!==undefined?data.data:data;
  }catch(e){
    if(e&&e.name==='AbortError')throw new Error('Serverantwort dauert zu lange. Die Prüfung wurde beendet; bitte erneut versuchen.');
    throw e;
  }finally{clearTimeout(timer);}
}
function setAuditBusy731(on){
  payrollBusy731=!!on;
  const sec=el731('dg520PayrollClose');if(!sec)return;
  [...sec.querySelectorAll('button')].forEach(b=>{
    if(/Monat jetzt prüfen|PDF Steuerberater|Monatsabschluss erfolgt/i.test(b.textContent||'')){b.classList.toggle('dg731-busy',!!on);b.disabled=!!on;}
  });
  if(!on){try{document.documentElement.style.cursor='';document.body.style.cursor='';}catch(_e){}}
}

const renderPayrollBase731=typeof renderPayrollTable520==='function'?renderPayrollTable520:null;
window.renderPayrollTable520=renderPayrollTable520=function(rows){
  let h='<div class="dg520-table-wrap"><table class="dg520-table"><thead><tr><th>Mitarbeiter</th><th>Status</th><th>Abrechnung</th><th>Soll</th><th>Ist</th><th>geleistet</th><th>Lohn-Std.</th><th>Satz/Gehalt</th><th>Brutto*</th><th>Urlaub</th><th>Krank</th></tr></thead><tbody>';
  (rows||[]).forEach(r=>{
    const pay=r.payrollType==='Festgehalt'?money520(r.monthlySalary)+' €/Monat':money520(r.hourlyWage)+' €/Std.';
    h+='<tr><td>'+e520(r.employee)+'</td><td>'+e520(r.employmentType)+'</td><td>'+e520(r.payrollType)+(r.payrollRelevant?'':' · nicht lohnrelevant')+'</td><td>'+h520(r.targetHours)+'</td><td>'+h520(r.actualHours)+'</td><td>'+h520(r.workHours)+'</td><td>'+h520(r.payrollHours)+'</td><td>'+e520(pay)+'</td><td>'+money520(r.grossEstimate)+' €</td><td>'+Number(r.vacationDays||0)+'</td><td>'+Number(r.sickDays||0)+'</td></tr>';
  });
  return h+'</tbody></table></div><div class="muted small">* Tatsächlich geleistete bzw. gutgeschriebene Stunden werden ausbezahlt; es wird kein Zeitguthaben aufgebaut. Der Steuerberater erstellt die verbindliche Lohnabrechnung.</div>';
};

function decorateAudit731(a){
  due731(a);payrollCycleLabel731(a);
  const out=el731('dg520Result');if(!out)return;
  if(a?.state?.changedSinceApproval&&!out.querySelector('.dg731-closed-warning')){
    const w=document.createElement('div');w.className='dg731-closed-warning';w.textContent='⚠ Nachträgliche Änderung im bereits geprüften/abgeschlossenen Lohnzeitraum. Steuerberaterdaten müssen erneut geprüft und der Monatsabschluss erneut bestätigt werden.';out.prepend(w);
  }
  let lastRow=null;[...out.children].forEach(x=>{if(x.classList&&x.classList.contains('button-row'))lastRow=x;});
  if(lastRow){
    const completed=a?.state?.status==='Uebergeben'&&!a?.state?.changedSinceApproval;
    lastRow.innerHTML=completed
      ?'<button class="btn success" type="button" disabled>✓ Monatsabschluss erfolgt</button><button class="btn secondary" type="button" onclick="return dg520SetState(\'Wieder geoeffnet\')">Monat wieder öffnen</button>'
      :'<button class="btn success" type="button" '+(a?.canRelease&&!a?.state?.changedSinceApproval?'':'disabled')+' onclick="return dg731CompletePayroll()">Monatsabschluss erfolgt</button>';
    const note=document.createElement('div');note.className='dg731-help';note.textContent='Mit „Monatsabschluss erfolgt“ wird der Lohnzeitraum gleichzeitig als an den Steuerberater übergeben dokumentiert.';lastRow.insertAdjacentElement('afterend',note);
  }
}
const renderAuditBase731=typeof renderAudit520==='function'?renderAudit520:null;
window.renderAudit520=renderAudit520=function(a){
  const r=renderAuditBase731?renderAuditBase731(a):undefined;
  decorateAudit731(a);return r;
};

window.dg520RunAudit=async function(){
  if(payrollBusy731)return false;
  const q=selected731();if(!(q.year>0&&q.month>=1&&q.month<=12)){setMessage('dg520Status','Bitte Jahr und Monat prüfen.','error');return false;}
  setAuditBusy731(true);
  try{
    setMessage('dg520Status','Lohnzeitraum wird geprüft ...','info');
    const a=await post731(chefPayload({action:'getMonthPayrollAudit',year:q.year,month:q.month}),90000);
    currentAudit520=a;renderAudit520(a);setMessage('dg520Status','✓ Monatsprüfung abgeschlossen.','ok');
  }catch(e){
    if(el731('dg520Result'))el731('dg520Result').innerHTML='';
    setMessage('dg520Status','Monatsprüfung nicht möglich: '+(e?.message||e),'error');
  }finally{setAuditBusy731(false);}
  return false;
};

window.dg731CompletePayroll=async function(){
  if(payrollBusy731)return false;
  const q=selected731();let audit=currentAudit520;
  if(!audit||Number(audit.year)!==q.year||Number(audit.month)!==q.month){await window.dg520RunAudit();audit=currentAudit520;}
  if(!audit)return false;
  if(!audit.canRelease||audit?.state?.changedSinceApproval){setMessage('dg520Status','Monatsabschluss noch nicht möglich. Bitte zuerst alle Fehler und ungeprüften Hinweise bearbeiten.','error');return false;}
  const c=cycle731(q.year,q.month);
  if(!confirm('Monatsabschluss wirklich durchführen?\n\nAbrechnungszeitraum '+de731(audit.cycleStart||c.start)+' bis '+de731(audit.cycleEnd||c.end)+'\n\nDanach beginnt die neue Stunden-Zählung am 21.'))return false;
  setAuditBusy731(true);
  try{
    setMessage('dg520Status','Monatsabschluss wird gespeichert ...','info');
    const r=await post731(chefPayload({action:'completePayrollCycle',year:q.year,month:q.month}),90000);
    currentAudit520=r.audit||audit;renderAudit520(currentAudit520);
    const start=r.counterStart||r.nextCycleStart;
    const w=el731('dg54WeekHours');if(w)w.innerHTML='Geleistete Wochenstunden: 0,00 Std.<small>Neue Zählung ab '+de731(start)+'</small>';
    setMessage('dg520Status','✓ Monatsabschluss erfolgt. Neue Stunden-Zählung ab '+de731(start)+'.','ok');
    try{if(window.PERF&&PERF.readCache)PERF.readCache.clear();localStorage.removeItem('dg51_dashboard');}catch(_e){}
  }catch(e){setMessage('dg520Status','Monatsabschluss nicht möglich: '+(e?.message||e),'error');}
  finally{setAuditBusy731(false);}
  return false;
};
window.dg73CompletePayroll=window.dg731CompletePayroll;

const makePayrollBase731=typeof makePayrollSection520==='function'?makePayrollSection520:null;
window.makePayrollSection520=makePayrollSection520=function(){
  const sec=makePayrollBase731?makePayrollBase731.apply(this,arguments):null;if(!sec)return sec;
  const b=el731('dg73CompletePayroll');if(b){b.textContent='Monatsabschluss erfolgt';b.onclick=()=>window.dg731CompletePayroll();}
  due731(null);payrollCycleLabel731(null);
  ['dg520Year','dg520Month'].forEach(id=>{const x=el731(id);if(x&&!x.dataset.dg731){x.dataset.dg731='1';x.addEventListener('change',()=>{due731(null);payrollCycleLabel731(null);});}});
  return sec;
};

const loadMonthBase731=typeof window.loadMonth==='function'?window.loadMonth:null;
if(loadMonthBase731)window.loadMonth=loadMonth=async function(){
  const r=await loadMonthBase731.apply(this,arguments);cleanTimeBankText731();return r;
};

const renderDayBase731=typeof window.renderDay==='function'?window.renderDay:null;
if(renderDayBase731)window.renderDay=renderDay=function(){
  const r=renderDayBase731.apply(this,arguments);setTimeout(refreshEmployeeCounters731,120);return r;
};

function install731(){
  css731();
  const tb=el731('employeeTimeBank');if(tb){tb.style.display='';tb.textContent='Geleistete Monatsstunden: werden geladen …';}
  employeeCycle731();
  ['empYear','empMonth'].forEach(id=>{const x=el731(id);if(x&&!x.dataset.dg731){x.dataset.dg731='1';x.addEventListener('change',employeeCycle731);}});
  try{makePayrollSection520();}catch(_e){}
  due731(null);
  try{
    document.title='DG Zeiterfassung '+V731;
    document.querySelectorAll('.login-card .muted.small').forEach(x=>{if(/^Version\s+/i.test((x.textContent||'').trim()))x.textContent='Version '+V731;});
    document.querySelectorAll('.hero strong').forEach(x=>{if(/Zeiterfassung/i.test(x.textContent||''))x.textContent='Zeiterfassung - '+V731;});
    window.DG_APP_VERSION=V731;window.DG_RELEASE=V731;if(window.DG3)DG3.version=V731;
  }catch(_e){}
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>setTimeout(install731,0),{once:true});else setTimeout(install731,0);
setTimeout(install731,500);
setTimeout(cleanTimeBankText731,900);
setTimeout(refreshEmployeeCounters731,1100);
})();