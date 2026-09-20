/* DG Zeiterfassung 9.0 - Payroll UI Final
   Selected month status, force close button, correct top tile due date. */
(function(){
'use strict';
const V='9.0';
const BACKEND='https://dg-app-10-api-production.up.railway.app/';
const $=id=>document.getElementById(id);
let resultObserver=null,installing=false;

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
  const token=localStorage.getItem('dg_device_session')||'';
  const sessionPin=sessionStorage.getItem('dg_employee_pin')||'';
  return Object.assign({
    employee:localStorage.getItem('dg_employee')||'',
    employeePin:token||sessionPin
  },extra||{});
}
async function direct(payload,timeoutMs){
  const ctl=new AbortController(),timer=setTimeout(()=>ctl.abort(),Number(timeoutMs)||90000);
  try{
    const r=await fetch(BACKEND,{
      method:'POST',
      headers:{'Content-Type':'text/plain;charset=utf-8'},
      body:JSON.stringify(Object.assign({},payload,{clientVersion:V})),
      signal:ctl.signal,
      cache:'no-store'
    });
    if(!r.ok)throw new Error('HTTP '+r.status);
    const txt=await r.text();let j;
    try{j=JSON.parse(txt);}catch(_e){throw new Error('Ungültige Serverantwort.');}
    if(!j.ok)throw new Error(j.error||'Serverfehler.');
    return j.data!==undefined?j.data:j;
  }catch(e){
    if(e&&e.name==='AbortError')throw new Error('Serverantwort dauert länger als 4 Minuten. Bitte Status neu laden, bevor erneut gespeichert wird.');
    throw e;
  }finally{clearTimeout(timer);}
}
function payrollSelection(){
  return {year:Number($('dg520Year')?.value||new Date().getFullYear()),month:Number($('dg520Month')?.value||new Date().getMonth()+1)};
}
function bossSelection(){
  return {year:Number($('bossYear')?.value||new Date().getFullYear()),month:Number($('bossMonth')?.value||new Date().getMonth()+1)};
}
function completed(r){return !!(r&&r.state&&r.state.status==='Uebergeben'&&!r.state.changedSinceApproval);}
function ensureCss(){
  if($('dg80PayrollCss'))return;
  const s=document.createElement('style');s.id='dg80PayrollCss';
  s.textContent=
    '#dg520Due,#dg74Due,#dg742HotfixDue3{display:none!important}'+
    '#dg80Due{font-weight:900;margin:10px 0;padding:12px 15px;border-radius:13px}'+
    '#dg80Due.red{background:#fee2e2;color:#991b1b}'+
    '#dg80Due.green{background:#dcfce7;color:#166534}'+
    '#dg80MonthState{font-weight:900;margin:12px 0;padding:14px 16px;border-radius:13px;border:1px solid transparent}'+
    '#dg80MonthState.closed{background:#dcfce7;color:#166534;border-color:#86efac}'+
    '#dg80MonthState.open{background:#fee2e2;color:#991b1b;border-color:#fecaca}'+
    '#dg80ForceTop{width:100%!important;margin-top:12px!important;background:#b42318!important;color:#fff!important;border-color:#b42318!important;padding:15px 18px!important;font-size:18px!important;font-weight:900!important}'+
    '#dg80TopPayroll{display:block!important;text-align:center!important;width:100%!important;font-size:31px!important;line-height:1!important}';
  document.head.appendChild(s);
}
function ensurePayrollSectionUi(){
  const sec=$('dg520PayrollClose');if(!sec)return;
  ensureCss();

  let state=$('dg80MonthState');
  if(!state){
    state=document.createElement('div');state.id='dg80MonthState';state.className='open';state.textContent='🔴 Abschlussstatus wird geladen …';
    const grid=sec.querySelector('.grid2');
    if(grid)grid.insertAdjacentElement('afterend',state);else sec.prepend(state);
  }

  let force=$('dg80ForceTop');
  if(!force){
    const firstRow=sec.querySelector(':scope > .button-row');
    force=document.createElement('button');
    force.id='dg80ForceTop';force.type='button';force.className='btn danger';
    force.textContent='Monat ohne Prüfung abschließen';
    force.addEventListener('click',e=>{e.preventDefault();e.stopImmediatePropagation();forceClose();},true);
    if(firstRow)firstRow.insertAdjacentElement('afterend',force);
    else sec.appendChild(force);
  }
}
function renderPayrollState(r){
  ensurePayrollSectionUi();
  const q=payrollSelection(),state=$('dg80MonthState');if(!state)return;
  if(completed(r)){
    state.className='closed';
    state.textContent='🟢 Abgeschlossen · '+monthName(q.month)+' '+q.year;
  }else{
    state.className='open';
    if(r?.state?.changedSinceApproval)state.textContent='🔴 Abschluss fehlt · Daten wurden nach dem letzten Abschluss geändert · '+monthName(q.month)+' '+q.year;
    else if(r?.state?.status==='Freigegeben')state.textContent='🔴 Abschluss fehlt · nur freigegeben, noch nicht endgültig abgeschlossen · '+monthName(q.month)+' '+q.year;
    else state.textContent='🔴 Abschluss fehlt · '+monthName(q.month)+' '+q.year;
  }
}
function renderDue(due,r){
  const sec=$('dg520PayrollClose');if(!sec)return;
  ensurePayrollSectionUi();
  let box=$('dg80Due');
  if(!box){
    box=document.createElement('div');box.id='dg80Due';
    const state=$('dg80MonthState');
    if(state)state.insertAdjacentElement('afterend',box);else sec.prepend(box);
  }
  const d=daysTo(due);
  if(completed(r)){
    box.className='green';
    box.textContent='🟢 Lohnübergabe / Monatsabschluss erledigt · Stichtag '+de(due)+'.';
  }else if(d===0){
    box.className='red';
    box.textContent='🔴 Lohnübergabe Heute ('+de(due)+').';
  }else if(d>0){
    box.className='green';
    box.textContent='🟢 Lohnübergabe am '+de(due)+' · noch '+d+' Tag'+(d===1?'':'e')+'.';
  }else{
    box.className='red';
    box.textContent='🔴 Lohnübergabe seit '+Math.abs(d)+' Tag'+(Math.abs(d)===1?'':'en')+' überfällig ('+de(due)+').';
  }
  const q=payrollSelection(),regular=q.year+'-'+pad(q.month)+'-20';
  if(due!==regular)box.textContent+=' Regulärer Stichtag 20. fällt auf Wochenende/Feiertag – auf den vorherigen Arbeitstag vorgezogen.';
}
function renderTopTile(due,r){
  const tile=document.querySelector('#bossView .d3-tile.payroll');if(!tile)return;
  const old1=$('d3Count-payroll'),old2=$('dg74CountPayroll'),old3=$('dg742TopPayroll');
  [old1,old2,old3].forEach(x=>{if(x)x.style.display='none';});
  let strong=$('dg80TopPayroll');
  if(!strong){strong=document.createElement('strong');strong.id='dg80TopPayroll';tile.appendChild(strong);}
  const now=new Date();
  let target=String(due||'');
  if(completed(r)){
    if(r&&/^\d{4}-\d{2}-\d{2}$/.test(String(r.nextDueDate||'')))target=String(r.nextDueDate);
    else{
      let y=now.getFullYear(),m=now.getMonth()+2;
      if(m>12){m=1;y++;}
      target=localDue(y,m);
    }
  }
  let d=daysTo(target);
  if(!Number.isFinite(d))d=0;
  d=Math.max(0,d);
  strong.textContent=String(d);
  tile.classList.remove('warn','error','done');
  tile.classList.toggle('error',d<=3);
  tile.classList.toggle('done',d>3);
  tile.title='Lohnübergabe in '+d+' Tag'+(d===1?'':'en')+' · '+de(target);
}
async function getState(y,m){
  const fallback={year:y,month:m,dueDate:localDue(y,m),state:{status:'Offen'}};
  try{return await direct(chef({action:'getPayrollCycleState',year:y,month:m}),90000)||fallback;}catch(_e){return fallback;}
}
async function refreshPayrollSection(){
  ensurePayrollSectionUi();
  const q=payrollSelection(),r=await getState(q.year,q.month),due=String(r.dueDate||localDue(q.year,q.month));
  renderPayrollState(r);renderDue(due,r);
}
async function refreshBossMonthState(){
  const q=bossSelection(),r=await getState(q.year,q.month);
  let box=$('dg80BossMonthState');
  const year=$('bossYear');
  if(year&&!box){
    box=document.createElement('div');box.id='dg80BossMonthState';
    const grid=year.closest('.grid2');
    if(grid)grid.insertAdjacentElement('afterend',box);
  }
  if(box){
    box.style.fontWeight='900';box.style.margin='12px 0';box.style.padding='14px 16px';box.style.borderRadius='13px';
    if(completed(r)){box.style.background='#dcfce7';box.style.color='#166534';box.textContent='🟢 Abgeschlossen · '+monthName(q.month)+' '+q.year;}
    else{box.style.background='#fee2e2';box.style.color='#991b1b';box.textContent='🔴 Abschluss fehlt · '+monthName(q.month)+' '+q.year;}
  }
}
async function refreshTopTile(){
  const n=new Date(),y=n.getFullYear(),m=n.getMonth()+1,r=await getState(y,m),due=String(r.dueDate||localDue(y,m));
  renderTopTile(due,r);
}
function setStatus(text,type){
  const s=$('dg520Status');if(s){s.className='status '+(type||'info');s.textContent=text;}
}
async function forceClose(){
  const q=payrollSelection();
  const token=localStorage.getItem('dg_device_session')||'';
  const legacyPin=sessionStorage.getItem('dg_employee_pin')||'';
  if(!token&&!legacyPin){
    setStatus('Anmeldungssitzung fehlt. Bitte einmal abmelden und neu anmelden.','error');
    return false;
  }
  if(!confirm('Monat '+monthName(q.month)+' '+q.year+' ohne vorherige vollständige Prüfung abschließen? Der Vorgang wird dokumentiert.'))return false;
  const reason=prompt('Prüfvermerk / Grund:','Monat wurde bewusst ohne vollständige Prüfung abgeschlossen.');
  if(!reason||!String(reason).trim())return false;
  const btn=$('dg80ForceTop');if(btn)btn.disabled=true;
  try{
    setStatus('Monat wird ohne Prüfung abgeschlossen ...','info');
    await direct(chef({action:'forceCompletePayrollCycle',year:q.year,month:q.month,reason:String(reason).trim()}),240000);
    setStatus('✓ Monat wurde ohne Prüfung abgeschlossen und protokolliert.','ok');
    await Promise.allSettled([refreshPayrollSection(),refreshBossMonthState(),refreshTopTile()]);
    const out=$('dg520Result');
    if(out){
      const row=[...out.querySelectorAll(':scope > .button-row')].pop();
      if(row)row.innerHTML='<button class="btn success" type="button" disabled>✓ Monatsabschluss erfolgt</button><button class="btn secondary" type="button" onclick="return dg520SetState(\'Wieder geoeffnet\')">Monat wieder öffnen</button>';
    }
  }catch(e){setStatus('Abschluss nicht möglich: '+(e&&e.message?e.message:e),'error');}
  finally{if(btn&&document.body.contains(btn))btn.disabled=false;}
  return false;
}
function bind(){
  [['dg520Year',refreshPayrollSection],['dg520Month',refreshPayrollSection],['bossYear',refreshBossMonthState],['bossMonth',refreshBossMonthState]].forEach(([id,fn])=>{
    const x=$(id);if(!x||x.dataset.dg80)return;x.dataset.dg80='1';x.addEventListener('change',()=>setTimeout(fn,0));
  });
}
function wrap(){
  if(!window.__DG80_AUDIT_WRAP&&typeof window.dg520RunAudit==='function'){
    window.__DG80_AUDIT_WRAP=true;const base=window.dg520RunAudit;
    window.dg520RunAudit=async function(){const r=await base.apply(this,arguments);await refreshPayrollSection();return r;};
  }
  if(!window.__DG80_BOSS_WRAP&&typeof window.loadBossMonth==='function'){
    window.__DG80_BOSS_WRAP=true;const base=window.loadBossMonth;
    window.loadBossMonth=async function(){const r=await base.apply(this,arguments);await refreshBossMonthState();return r;};
  }
  if(!window.__DG80_SHOW_BOSS_WRAP&&typeof window.showBoss==='function'){
    window.__DG80_SHOW_BOSS_WRAP=true;const base=window.showBoss;
    window.showBoss=function(){const r=base.apply(this,arguments);setTimeout(()=>{install();refreshTopTile();refreshBossMonthState();refreshPayrollSection();},80);return r;};
  }
  if(!window.__DG80_DASH_WRAP&&typeof window.d3Dashboard==='function'){
    window.__DG80_DASH_WRAP=true;const base=window.d3Dashboard;
    window.d3Dashboard=async function(){const r=await base.apply(this,arguments);await refreshTopTile();return r;};
  }
  if(!window.__DG80_OFFICE_WRAP&&typeof window.d3InstallOffice==='function'){
    window.__DG80_OFFICE_WRAP=true;const base=window.d3InstallOffice;
    window.d3InstallOffice=function(){const r=base.apply(this,arguments);setTimeout(()=>{install();refreshTopTile();refreshBossMonthState();refreshPayrollSection();},50);return r;};
  }
}
function observe(){
  const out=$('dg520Result');if(!out||resultObserver)return;
  resultObserver=new MutationObserver(()=>setTimeout(()=>{ensurePayrollSectionUi();refreshPayrollSection();},60));
  resultObserver.observe(out,{childList:true,subtree:true});
}
function install(){
  if(installing)return;installing=true;
  try{
    document.documentElement.dataset.dgVersion='9.0';
    ensureCss();ensurePayrollSectionUi();bind();wrap();observe();
    refreshPayrollSection();refreshBossMonthState();refreshTopTile();
    document.title='DG Zeiterfassung 9.0';
    document.querySelectorAll('.login-card .muted.small').forEach(x=>{if(/^Version /.test((x.textContent||'').trim()))x.textContent='Version 9.0';});
    document.querySelectorAll('.hero strong').forEach(x=>{if(/Zeiterfassung/.test(x.textContent||''))x.textContent='Zeiterfassung - 9.0';});
  }finally{installing=false;}
}
window.dg80PayrollInstall=install;
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});else install();

})();
