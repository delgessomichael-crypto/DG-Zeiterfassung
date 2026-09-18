/* DG 7.4.0 CURRENT ONLY - zusammengefuehrter aktueller Stand */

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
    const s=$733('dg62Status');if(s&&/Kalender synchronisiert/i.test(s.textContent||''))s.textContent='✓ Kalender synchronisiert. Abwesenheitsmarkierung benötigt Google-GS 7.4.0.';
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
function stamp733(){
  try{
    document.title='DG Zeiterfassung '+V733;
    document.querySelectorAll('.login-card .muted.small').forEach(x=>{if(/^Version\s+/i.test((x.textContent||'').trim()))x.textContent='Version '+V733;});
    document.querySelectorAll('.hero strong').forEach(x=>{if(/Zeiterfassung/i.test(x.textContent||''))x.textContent='Zeiterfassung - '+V733;});
    window.DG_APP_VERSION=V733;window.DG_RELEASE=V733;if(window.DG3)DG3.version=V733;
  }catch(_e){}
}
function install733(){css733();addTrainingOption733();ensureLegend733();decorate733();}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>setTimeout(install733,0),{once:true});else setTimeout(install733,0);
setTimeout(install733,600);
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

function stamp734(){
  try{
    document.title='DG Zeiterfassung '+V734;
    document.querySelectorAll('.login-card .muted.small').forEach(x=>{if(/^Version\s+/i.test((x.textContent||'').trim()))x.textContent='Version '+V734;});
    document.querySelectorAll('.hero strong').forEach(x=>{if(/Zeiterfassung/i.test(x.textContent||''))x.textContent='Zeiterfassung - '+V734;});
    window.DG_APP_VERSION=V734;window.DG_RELEASE=V734;if(window.DG3)DG3.version=V734;
  }catch(_e){}
}
function install734(){
  css734();ensureAbsenceUi734();
  const mode=byId734('dg734SicknessMode');if(mode&&!mode.dataset.manualListener734){mode.dataset.manualListener734='1';mode.addEventListener('change',()=>{mode.dataset.manual734='1';});}
  patchPayrollSubtitle734();refreshAbsence734(false);refreshSicknessTile734();
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>setTimeout(install734,0),{once:true});else setTimeout(install734,0);
setTimeout(install734,700);
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
function stamp735(){
  try{
    document.title='DG Zeiterfassung '+V735;
    document.querySelectorAll('.login-card .muted.small').forEach(x=>{if(/^Version\s+/i.test((x.textContent||'').trim()))x.textContent='Version '+V735;});
    document.querySelectorAll('.hero strong').forEach(x=>{if(/Zeiterfassung/i.test(x.textContent||''))x.textContent='Zeiterfassung - '+V735;});
    window.DG_APP_VERSION=V735;window.DG_RELEASE=V735;if(window.DG3)DG3.version=V735;
  }catch(_e){}
}
function install735(){
  patchText735();
  try{if(window.DG3&&DG3.active)patchRegieNotes735(DG3.active);}catch(_e){}
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>setTimeout(install735,0),{once:true});else setTimeout(install735,0);
setTimeout(install735,700);
})();


/* DG Zeiterfassung 7.4.0 - bereinigte aktuelle Laufzeit ohne 7.3.x-Overlaykette */
(function(){
'use strict';
const V='7.4.0';
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
setTimeout(install,450);
})();

