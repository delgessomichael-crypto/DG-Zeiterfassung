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
if(typeof dashBase734==='function')window.d3Dashboard=async function(){const r=await dashBase734.apply(this,arguments);setTimeout(()=>{refreshDue734(false);refreshSicknessTile734();},0);return r;};
const payrollBase734=window.makePayrollSection520;
if(typeof payrollBase734==='function')window.makePayrollSection520=function(){const r=payrollBase734.apply(this,arguments);setTimeout(()=>{patchPayrollSubtitle734();refreshDue734(false);},0);return r;};

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

function stamp734(){
  try{
    document.title='DG Zeiterfassung '+V734;
    document.querySelectorAll('.login-card .muted.small').forEach(x=>{if(/^Version\s+/i.test((x.textContent||'').trim()))x.textContent='Version '+V734;});
    document.querySelectorAll('.hero strong').forEach(x=>{if(/Zeiterfassung/i.test(x.textContent||''))x.textContent='Zeiterfassung - '+V734;});
    window.DG_APP_VERSION=V734;window.DG_RELEASE=V734;if(window.DG3)DG3.version=V734;
  }catch(_e){}
}
function install734(){
  css734();ensureAbsenceUi734();stamp734();
  const mode=byId734('dg734SicknessMode');if(mode&&!mode.dataset.manualListener734){mode.dataset.manualListener734='1';mode.addEventListener('change',()=>{mode.dataset.manual734='1';});}
  patchPayrollSubtitle734();refreshDue734(false);refreshAbsence734(false);refreshSicknessTile734();
  ['dg520Year','dg520Month'].forEach(id=>{const x=byId734(id);if(x&&!x.dataset.dg734){x.dataset.dg734='1';x.addEventListener('change',()=>refreshDue734(true));}});
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>setTimeout(install734,0),{once:true});else setTimeout(install734,0);
setTimeout(install734,700);
})();