/* DG Zeiterfassung 7.4.2 - Payroll Hotfix 3
   Top tile + selected-month status + direct forced close with long timeout. */
(function(){
'use strict';
const HOTFIX='20260918-payroll3';
const BACKEND='https://script.google.com/macros/s/AKfycby2L3SMgh2RoGWsNRUp6o11g4iyZ8bgkSIGaAZPnBXCkJTkDDGF9aydn9vVKMB7kXsO/exec';
const $=id=>document.getElementById(id);
let resultObserver=null,installing=false,lastPayrollState=null,lastBossState=null,refreshTimer=0;

function pad(n){return String(n).padStart(2,'0');}
function iso(d){return d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate());}
function add(d,n){const x=new Date(d.getFullYear(),d.getMonth(),d.getDate(),12);x.setDate(x.getDate()+n);return x;}
function de(v){const p=String(v||'').split('-');return p.length===3?p[2]+'.'+p[1]+'.'+p[0]:String(v||'');}
function monthName(m){return ['Januar','Februar','März','April','Mai','Juni','Juli','August','September','Oktober','November','Dezember'][Number(m)-1]||String(m);}
function daysTo(v){const p=String(v||'').split('-').map(Number);if(p.length!==3||!p[0])return 0;const a=new Date(p[0],p[1]-1,p[2],12),b=new Date();b.setHours(12,0,0,0);return Math.round((a-b)/86400000);}
function easter(y){
  const a=y%19,b=Math.floor(y/100),c=y%100,d=Math.floor(b/4),e=b%4,f=Math.floor((b+8)/25),g=Math.floor((b-f+1)/3),
        h=(19*a+b-d-g+15)%30,i=Math.floor(c/4),k=c%4,l=(32+2*e+2*i-h-k)%7,m=Math.floor((a+11*h+22*l)/451),
        mo=Math.floor((h+l-7*m+114)/31),day=((h+l-7*m+114)%31)+1;
  return new Date(y,mo-1,day,12);
}
function holidays(y){
  const e=easter(y);
  return new Set([y+'-01-01',y+'-01-06',iso(add(e,-2)),iso(add(e,1)),y+'-05-01',iso(add(e,39)),iso(add(e,50)),iso(add(e,60)),y+'-10-03',y+'-11-01',y+'-12-25',y+'-12-26']);
}
function localDue(y,m){
  let d=new Date(Number(y),Number(m)-1,20,12),h=holidays(Number(y));
  while(d.getDay()===0||d.getDay()===6||h.has(iso(d)))d=add(d,-1);
  return iso(d);
}
function chef(extra){
  return Object.assign({
    employee:localStorage.getItem('dg_employee')||'',
    employeePin:sessionStorage.getItem('dg_employee_pin')||''
  },extra||{});
}
async function direct(payload,timeoutMs){
  const ctl=new AbortController(),timer=setTimeout(()=>ctl.abort(),Number(timeoutMs)||90000);
  try{
    const r=await fetch(BACKEND,{
      method:'POST',
      headers:{'Content-Type':'text/plain;charset=utf-8'},
      body:JSON.stringify(Object.assign({},payload,{clientVersion:'7.4.2-payroll3'})),
      signal:ctl.signal,
      cache:'no-store'
    });
    if(!r.ok)throw new Error('HTTP '+r.status);
    const txt=await r.text();let j;
    try{j=JSON.parse(txt);}catch(_e){throw new Error('Ungültige Serverantwort.');}
    if(!j.ok)throw new Error(j.error||'Serverfehler.');
    return j.data!==undefined?j.data:j;
  }catch(e){
    if(e&&e.name==='AbortError')throw new Error('Serverantwort dauert länger als 4 Minuten. Bitte Abschlussstatus neu laden, bevor erneut gespeichert wird.');
    throw e;
  }finally{clearTimeout(timer);}
}
function payrollSelection(){
  return {year:Number($('dg520Year')?.value||new Date().getFullYear()),month:Number($('dg520Month')?.value||new Date().getMonth()+1)};
}
function bossSelection(){
  return {year:Number($('bossYear')?.value||new Date().getFullYear()),month:Number($('bossMonth')?.value||new Date().getMonth()+1)};
}
function isCompleted(r){return !!(r&&r.state&&r.state.status==='Uebergeben'&&!r.state.changedSinceApproval);}
function ensureCss(){
  if($('dg742PayrollHotfix3Css'))return;
  const s=document.createElement('style');s.id='dg742PayrollHotfix3Css';
  s.textContent=
    '#dg520Due,#dg74Due{display:none!important}'+
    '#dg742HotfixDue3{font-weight:900;margin:10px 0;padding:12px 15px;border-radius:13px;background:#fff7ed;color:#8a3b18}'+
    '#dg742HotfixDue3.today{background:#fee2e2;color:#991b1b}'+
    '#dg742HotfixDue3.future{background:#f0fdf4;color:#166534}'+
    '#dg742MonthCloseStatus{font-weight:900;margin:12px 0;padding:13px 15px;border-radius:13px;border:1px solid transparent}'+
    '#dg742MonthCloseStatus.closed{background:#dcfce7;color:#166534;border-color:#86efac}'+
    '#dg742MonthCloseStatus.open{background:#fee2e2;color:#991b1b;border-color:#fecaca}'+
    '#dg742ForceClose{background:#b42318!important;color:#fff!important;border-color:#b42318!important}'+
    '#dg742TopPayroll{display:block!important}';
  document.head.appendChild(s);
}
function renderDue(due,state){
  const sec=$('dg520PayrollClose');if(!sec)return;
  ensureCss();
  let box=$('dg742HotfixDue3');
  if(!box){
    box=document.createElement('div');box.id='dg742HotfixDue3';
    const anchor=$('dg520Due')||sec.querySelector('.grid2');
    if(anchor)anchor.insertAdjacentElement('afterend',box);else sec.prepend(box);
  }
  const q=payrollSelection(),d=daysTo(due),regular=q.year+'-'+pad(q.month)+'-20',moved=due!==regular;
  let txt='',cls='';
  if(isCompleted(state)){txt='🟢 Monatsabschluss abgeschlossen · Stichtag '+de(due)+'.';cls='future';}
  else if(d===0){txt='🔴 Lohnübergabe Heute ('+de(due)+').';cls='today';}
  else if(d>0){txt='🟢 Lohnübergabe am '+de(due)+' · noch '+d+' Tag'+(d===1?'':'e')+'.';cls='future';}
  else{txt='🔴 Lohnübergabe seit '+Math.abs(d)+' Tag'+(Math.abs(d)===1?'':'en')+' überfällig ('+de(due)+').';cls='today';}
  if(moved)txt+=' Regulärer Stichtag 20. fällt auf Wochenende/Feiertag – auf den vorherigen Arbeitstag vorgezogen.';
  box.className=cls;box.textContent=txt;box.dataset.hotfix=HOTFIX;
}
function renderTopTile(due,state){
  const tile=document.querySelector('#bossView .d3-tile.payroll');if(!tile)return;
  ensureCss();
  const old1=$('d3Count-payroll'),old2=$('dg74CountPayroll');
  if(old1)old1.style.display='none';
  if(old2)old2.style.display='none';
  let strong=$('dg742TopPayroll');
  if(!strong){strong=document.createElement('strong');strong.id='dg742TopPayroll';tile.appendChild(strong);}
  const d=daysTo(due);
  if(isCompleted(state))strong.textContent='✓ Abgeschlossen · '+de(due).slice(0,5);
  else if(d===0)strong.textContent='Heute · '+de(due).slice(0,5);
  else if(d>0)strong.textContent=de(due).slice(0,5)+' · '+d+' Tag'+(d===1?'':'e');
  else strong.textContent=de(due).slice(0,5)+' · '+Math.abs(d)+' Tag'+(Math.abs(d)===1?'':'e')+' überf.';
  tile.classList.remove('warn','error','done');
  if(isCompleted(state))tile.classList.add('done');
  else if(d<=0)tile.classList.add('error');
  else if(d<=5)tile.classList.add('warn');
  tile.title='Lohn-Stichtag '+de(due)+(isCompleted(state)?' · abgeschlossen':'');
}
function ensureMonthStatusBox(){
  const year=$('bossYear');if(!year)return null;
  let box=$('dg742MonthCloseStatus');if(box)return box;
  box=document.createElement('div');box.id='dg742MonthCloseStatus';
  const grid=year.closest('.grid2');
  if(grid)grid.insertAdjacentElement('afterend',box);
  else year.parentElement?.insertAdjacentElement('afterend',box);
  return box;
}
function renderMonthStatus(r){
  const q=bossSelection(),box=ensureMonthStatusBox();if(!box)return;
  const done=isCompleted(r),changed=!!r?.state?.changedSinceApproval,status=String(r?.state?.status||'Offen');
  box.className=done?'closed':'open';
  if(done)box.textContent='🟢 Abgeschlossen · '+monthName(q.month)+' '+q.year;
  else if(changed)box.textContent='🔴 Abschluss fehlt · Daten wurden nach dem Abschluss geändert · '+monthName(q.month)+' '+q.year;
  else if(status==='Freigegeben')box.textContent='🔴 Abschluss fehlt · Monat ist nur freigegeben, noch nicht übergeben · '+monthName(q.month)+' '+q.year;
  else box.textContent='🔴 Abschluss fehlt · '+monthName(q.month)+' '+q.year;
  box.dataset.hotfix=HOTFIX;
}
function setPayrollStatus(text,type){
  const s=$('dg520Status');if(s){s.className='status '+(type||'info');s.textContent=text;}
}
function markPayrollCompleted(){
  const out=$('dg520Result');if(!out)return;
  let row=[...out.querySelectorAll(':scope > .button-row')].pop();if(!row)return;
  row.innerHTML='<button class="btn success" type="button" disabled>✓ Monatsabschluss erfolgt</button><button class="btn secondary" type="button" onclick="return dg520SetState(\'Wieder geoeffnet\')">Monat wieder öffnen</button>';
}
async function fetchPayrollState(){
  const q=payrollSelection();
  const local={year:q.year,month:q.month,dueDate:localDue(q.year,q.month),state:{status:'Offen'}};
  renderDue(local.dueDate,lastPayrollState||local); 
  try{
    const r=await direct(chef({action:'getPayrollCycleState',year:q.year,month:q.month}),90000);
    lastPayrollState=r||local;
    const due=String(r?.dueDate||local.dueDate);
    renderDue(due,r);
    if(q.year===new Date().getFullYear()&&q.month===new Date().getMonth()+1)renderTopTile(due,r);
    return r;
  }catch(_e){
    if(q.year===new Date().getFullYear()&&q.month===new Date().getMonth()+1)renderTopTile(local.dueDate,lastPayrollState||local);
    return lastPayrollState||local;
  }
}
async function fetchBossState(){
  const q=bossSelection();
  try{
    const r=await direct(chef({action:'getPayrollCycleState',year:q.year,month:q.month}),90000);
    lastBossState=r;renderMonthStatus(r);
    return r;
  }catch(e){
    const fallback={year:q.year,month:q.month,dueDate:localDue(q.year,q.month),state:{status:'Offen'}};
    lastBossState=fallback;renderMonthStatus(fallback);return fallback;
  }
}
async function refreshTopCurrent(){
  const n=new Date(),q={year:n.getFullYear(),month:n.getMonth()+1};
  let due=localDue(q.year,q.month),r=null;
  try{r=await direct(chef({action:'getPayrollCycleState',year:q.year,month:q.month}),90000);if(r?.dueDate)due=String(r.dueDate);}catch(_e){}
  renderTopTile(due,r);
}
async function forceClose(){
  const q=payrollSelection();
  const reason=prompt('Prüfvermerk / Grund für den Abschluss trotz Meldungen:','Alle angezeigten Meldungen wurden geprüft. Der Monat wird bewusst trotz verbleibender Auffälligkeiten abgeschlossen.');
  if(!reason||!String(reason).trim())return false;
  if(!confirm('Monat '+monthName(q.month)+' '+q.year+' wirklich trotz verbleibender Meldungen abschließen? Der Vorgang wird mit Begründung protokolliert.'))return false;
  const btn=$('dg742ForceClose');if(btn)btn.disabled=true;
  try{
    setPayrollStatus('Monat wird trotz Meldungen abgeschlossen ...','info');
    const r=await direct(chef({action:'forceCompletePayrollCycle',year:q.year,month:q.month,reason:String(reason).trim()}),240000);
    lastPayrollState=r?.audit?{year:q.year,month:q.month,dueDate:r.audit.dueDate,state:r.audit.state}:await fetchPayrollState();
    setPayrollStatus('✓ Monat wurde trotz Meldungen abgeschlossen und protokolliert.','ok');
    markPayrollCompleted();
    await Promise.allSettled([fetchPayrollState(),fetchBossState(),refreshTopCurrent()]);
  }catch(e){
    setPayrollStatus('Abschluss nicht möglich: '+(e&&e.message?e.message:e),'error');
  }finally{if(btn&&document.body.contains(btn))btn.disabled=false;}
  return false;
}
function hijackForceButton(){
  const out=$('dg520Result');if(!out||!out.innerHTML.trim())return;
  if(isCompleted(lastPayrollState)){markPayrollCompleted();return;}
  let row=[...out.querySelectorAll(':scope > .button-row')].pop();
  if(!row){row=document.createElement('div');row.className='button-row';out.appendChild(row);}
  let candidate=$('dg742ForceClose')||$('dg74ForceClose')||[...row.querySelectorAll('button')].find(b=>/Trotz Meldungen|trotz.*übergeben|Alles überprüft/i.test(b.textContent||''));
  if(candidate&&candidate.id!=='dg742ForceClose'){
    const fresh=candidate.cloneNode(true);fresh.id='dg742ForceClose';fresh.disabled=false;fresh.textContent='Trotz Meldungen abschließen';candidate.replaceWith(fresh);candidate=fresh;
  }
  if(!candidate){
    candidate=document.createElement('button');candidate.id='dg742ForceClose';candidate.type='button';candidate.className='btn danger';candidate.textContent='Trotz Meldungen abschließen';
    const transfer=[...row.querySelectorAll('button')].find(b=>/Steuerberater/i.test(b.textContent||''));
    if(transfer)row.insertBefore(candidate,transfer);else row.appendChild(candidate);
  }
  if(candidate.dataset.dg742Bound!=='1'){
    candidate.dataset.dg742Bound='1';
    candidate.addEventListener('click',e=>{e.preventDefault();e.stopImmediatePropagation();forceClose();},true);
  }
  candidate.disabled=false;candidate.dataset.hotfix=HOTFIX;
}
function bindSelectors(){
  [['dg520Year',()=>{fetchPayrollState();hijackForceButton();}],['dg520Month',()=>{fetchPayrollState();hijackForceButton();}],['bossYear',fetchBossState],['bossMonth',fetchBossState]].forEach(([id,fn])=>{
    const x=$(id);if(!x||x.dataset.dg742P3)return;x.dataset.dg742P3='1';x.addEventListener('change',()=>setTimeout(fn,0));
  });
}
function wrapLoaders(){
  if(!window.__DG742_LOAD_BOSS_P3&&typeof window.loadBossMonth==='function'){
    window.__DG742_LOAD_BOSS_P3=true;const base=window.loadBossMonth;
    window.loadBossMonth=async function(){const r=await base.apply(this,arguments);await fetchBossState();return r;};
  }
  if(!window.__DG742_AUDIT_P3&&typeof window.dg520RunAudit==='function'){
    window.__DG742_AUDIT_P3=true;const base=window.dg520RunAudit;
    window.dg520RunAudit=async function(){const r=await base.apply(this,arguments);await fetchPayrollState();hijackForceButton();return r;};
  }
}
function attachObserver(){
  const out=$('dg520Result');if(!out||resultObserver)return;
  resultObserver=new MutationObserver(()=>{clearTimeout(refreshTimer);refreshTimer=setTimeout(()=>{hijackForceButton();fetchPayrollState();},80);});
  resultObserver.observe(out,{childList:true,subtree:true});
}
function install(){
  if(installing)return;installing=true;
  try{
    document.documentElement.dataset.dgPayrollHotfix=HOTFIX;
    ensureCss();bindSelectors();wrapLoaders();attachObserver();hijackForceButton();
    fetchPayrollState();fetchBossState();refreshTopCurrent();
  }finally{installing=false;}
}
window.dg742PayrollHotfix3Install=install;
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});else install();
[100,400,1000,2500,5000].forEach(ms=>setTimeout(install,ms));
})();
