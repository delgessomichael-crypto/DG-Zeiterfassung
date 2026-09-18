/* DG Zeiterfassung 7.3 - Lohnzyklus 21.-20. und Monatsabschluss */
(function(){
'use strict';
const V73='7.3';
let dg73PayrollState=null;

function el73(id){return document.getElementById(id);}
function iso73(v){return String(v||'');}
function de73(v){
  try{return typeof formatDateDE==='function'?formatDateDE(v):v;}catch(_e){return v;}
}
function selected73(){
  return {year:Number(el73('dg520Year')?.value||el73('bossYear')?.value),month:Number(el73('dg520Month')?.value||el73('bossMonth')?.value)};
}
function diffDays73(iso){
  const p=String(iso||'').split('-').map(Number);if(p.length!==3||!p[0])return 0;
  const a=new Date(p[0],p[1]-1,p[2]);a.setHours(0,0,0,0);
  const b=new Date();b.setHours(0,0,0,0);return Math.round((a-b)/86400000);
}
function sameSelection73(x){const q=selected73();return x&&Number(x.year)===q.year&&Number(x.month)===q.month;}
function cycleLabel73(x){
  if(!x||!x.cycleStart||!x.cycleEnd)return '';
  return 'Abrechnungszeitraum: '+de73(x.cycleStart)+' bis '+de73(x.cycleEnd)+' · neue Stundenzählung jeweils ab dem 21.';
}
function setCycleLabel73(x){
  const sec=el73('dg520PayrollClose');if(!sec)return;
  let box=el73('dg73CycleLabel');
  if(!box){box=document.createElement('div');box.id='dg73CycleLabel';box.className='status info';const due=el73('dg520Due');if(due)due.insertAdjacentElement('afterend',box);}
  box.textContent=cycleLabel73(x)||'Lohnzeitraum wird geladen ...';
}
function updateDue73(audit){
  const el=el73('dg520Due');if(!el)return;
  const state=(audit&&audit.state)||dg73PayrollState?.state||{},completed=state.status==='Uebergeben';
  let due=completed?(audit?.nextDueDate||dg73PayrollState?.nextDueDate):(audit?.dueDate||dg73PayrollState?.dueDate);
  if(!due){const q=selected73();due=String(q.year)+'-'+String(q.month).padStart(2,'0')+'-20';}
  const diff=diffDays73(due),prefix=completed?'Nächste Lohnübergabe':'Lohnübergabe',regular=completed?null:(String(selected73().year)+'-'+String(selected73().month).padStart(2,'0')+'-20');
  let text='',cls='';
  if(completed){
    text='🟢 Monatsabschluss erfolgt. '+prefix+' am '+de73(due)+(diff>0?' · noch '+diff+' Tag'+(diff===1?'':'e')+'.':diff===0?' · heute.':' · überfällig.');
    cls=diff<=5?'warn':'ok';
  }else if(diff>0){
    text=(diff<=2?'🔴 ':'🟢 ')+prefix+' am '+de73(due)+' · noch '+diff+' Tag'+(diff===1?'':'e')+'.';cls=diff<=2?'error':diff<=5?'warn':'';
  }else if(diff===0){
    text='🔴 '+prefix+' heute fällig ('+de73(due)+').';cls='error';
  }else{
    text='🔴 '+prefix+' seit '+Math.abs(diff)+' Tag'+(Math.abs(diff)===1?'':'en')+' überfällig.';cls='error';
  }
  if(!completed&&regular&&due!==regular)text+=' Regulärer 20. fällt auf Wochenende/Feiertag – deshalb vorgezogen.';
  el.className='dg520-due '+cls;el.textContent=text;
}
window.updateDue520=updateDue73;

async function refreshState73(){
  const q=selected73();if(!(q.year>0&&q.month>=1&&q.month<=12))return null;
  try{
    const x=await api(chefPayload({action:'getPayrollCycleState',year:q.year,month:q.month}));
    dg73PayrollState=x||null;setCycleLabel73(x);updateDue73(x);return x;
  }catch(_e){
    setCycleLabel73(null);updateDue73(null);return null;
  }
}
window.dg73RefreshPayrollState=refreshState73;

const makeBase73=window.makePayrollSection520||makePayrollSection520;
window.makePayrollSection520=makePayrollSection520=function(){
  const sec=makeBase73.apply(this,arguments);if(!sec)return sec;
  const row=sec.querySelector('.button-row');
  if(row&&!el73('dg73CompletePayroll')){
    const b=document.createElement('button');b.id='dg73CompletePayroll';b.type='button';b.className='btn success';b.textContent='Monatsabschluss erfolgt';b.onclick=()=>window.dg73CompletePayroll();row.appendChild(b);
  }
  ['dg520Year','dg520Month'].forEach(id=>{const x=el73(id);if(x&&!x.dataset.dg73){x.dataset.dg73='1';x.addEventListener('change',()=>{dg73PayrollState=null;refreshState73();});}});
  setTimeout(refreshState73,0);return sec;
};

async function runAudit73(){
  const q=selected73();if(!(q.year>0&&q.month>=1&&q.month<=12)){setMessage('dg520Status','Bitte Jahr und Monat prüfen.','error');return null;}
  try{
    setMessage('dg520Status','Lohnzeitraum wird geprüft ...','info');
    const a=await api(chefPayload({action:'getMonthPayrollAudit',year:q.year,month:q.month}));
    currentAudit520=a;dg73PayrollState=Object.assign({},a,{state:a.state});renderAudit520(a);setCycleLabel73(a);updateDue73(a);setMessage('dg520Status','✓ Monatsprüfung abgeschlossen.','ok');return a;
  }catch(e){
    if(el73('dg520Result'))el73('dg520Result').innerHTML='';
    setMessage('dg520Status','Monatsprüfung nicht möglich: '+e.message,'error');return null;
  }
}
window.dg520RunAudit=runAudit73;

function resetVisibleCounters73(counterStart){
  const w=el73('dg54WeekHours');if(w)w.innerHTML='Geleistete Wochenstunden: 0,00 Std.<small>Neue Zählung ab '+de73(counterStart)+'</small>';
  try{if(window.PERF&&PERF.readCache)PERF.readCache.clear();}catch(_e){}
  try{localStorage.removeItem('dg51_dashboard');}catch(_e){}
  setTimeout(()=>{try{if(typeof loadDay==='function')loadDay(true);}catch(_e){}},0);
  setTimeout(()=>{try{if(typeof loadMonth==='function'&&el73('empYear')&&el73('empMonth'))loadMonth();}catch(_e){}},120);
}
window.dg73CompletePayroll=async function(){
  let audit=currentAudit520;
  const q=selected73();
  if(!audit||Number(audit.year)!==q.year||Number(audit.month)!==q.month)audit=await runAudit73();
  if(!audit)return false;
  if(!audit.canRelease){
    setMessage('dg520Status','Monatsabschluss noch nicht möglich: '+Number(audit.summary?.errors||0)+' Fehler und '+Number(audit.summary?.warnings||0)+' ungeprüfte Hinweise.','error');return false;
  }
  const label=cycleLabel73(audit);
  if(!confirm('Monatsabschluss wirklich durchführen?\n\n'+label+'\n\nDanach beginnen Monats- und Wochenstundenzähler für den nächsten Lohnzeitraum wieder bei 0.'))return false;
  try{
    setMessage('dg520Status','Monatsabschluss wird gespeichert ...','info');
    const r=await api(chefPayload({action:'completePayrollCycle',year:q.year,month:q.month}));
    currentAudit520=r.audit||audit;
    dg73PayrollState={year:q.year,month:q.month,cycleStart:r.cycleStart||audit.cycleStart,cycleEnd:r.cycleEnd||audit.cycleEnd,dueDate:audit.dueDate,nextDueDate:r.nextDueDate,nextYear:r.nextYear,nextMonth:r.nextMonth,state:currentAudit520.state,counterStart:r.counterStart};
    renderAudit520(currentAudit520);setCycleLabel73(dg73PayrollState);updateDue73(currentAudit520);resetVisibleCounters73(r.counterStart);
    setMessage('dg520Status','✓ Monatsabschluss erfolgt. Die neue Stundenzählung beginnt am '+de73(r.counterStart)+'.','ok');
  }catch(e){setMessage('dg520Status','Monatsabschluss nicht möglich: '+e.message,'error');}
  return false;
};

const loadMonthBase73=window.loadMonth;
if(typeof loadMonthBase73==='function')window.loadMonth=async function(){
  const r=await loadMonthBase73.apply(this,arguments);
  try{
    const root=el73('monthResult');
    if(root&&el73('empYear')&&el73('empMonth')){
      const y=Number(el73('empYear').value),m=Number(el73('empMonth').value),st=await api(chefPayload({action:'getPayrollCycleState',year:y,month:m}));
      if(st&&st.cycleStart&&st.cycleEnd&&!root.querySelector('.dg73-cycle-info')){
        const d=document.createElement('div');d.className='status info dg73-cycle-info';d.textContent='Lohnzeitraum: '+de73(st.cycleStart)+' bis '+de73(st.cycleEnd);root.prepend(d);
      }
    }
  }catch(_e){}
  return r;
};

function stamp73(){
  if(document.title!=='DG Zeiterfassung '+V73)document.title='DG Zeiterfassung '+V73;
  document.querySelectorAll('.login-card .muted.small').forEach(x=>{if(/^Version\s+/i.test((x.textContent||'').trim()))x.textContent='Version '+V73;});
  document.querySelectorAll('.hero strong').forEach(x=>{if(/Zeiterfassung/i.test(x.textContent||''))x.textContent='Zeiterfassung - '+V73;});
  try{window.DG_APP_VERSION=V73;window.DG_RELEASE=V73;if(window.DG3)DG3.version=V73;}catch(_e){}
}
function install73(){stamp73();try{makePayrollSection520();}catch(_e){}}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>setTimeout(install73,0),{once:true});else setTimeout(install73,0);
setTimeout(install73,500);
})();
