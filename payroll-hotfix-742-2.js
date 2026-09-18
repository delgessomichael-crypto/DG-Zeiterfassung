/* DG Zeiterfassung 7.4.2 - Payroll Hotfix 2
   Separate runtime layer: authoritative due-date display + forced month close. */
(function(){
'use strict';
const HOTFIX='20260918-payroll2';
const $=id=>document.getElementById(id);
let observed=null, installing=false;

function pad(n){return String(n).padStart(2,'0');}
function iso(d){return d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate());}
function add(d,n){const x=new Date(d.getFullYear(),d.getMonth(),d.getDate(),12);x.setDate(x.getDate()+n);return x;}
function easter(y){
  const a=y%19,b=Math.floor(y/100),c=y%100,d=Math.floor(b/4),e=b%4,f=Math.floor((b+8)/25),g=Math.floor((b-f+1)/3),
        h=(19*a+b-d-g+15)%30,i=Math.floor(c/4),k=c%4,l=(32+2*e+2*i-h-k)%7,m=Math.floor((a+11*h+22*l)/451),
        mo=Math.floor((h+l-7*m+114)/31),day=((h+l-7*m+114)%31)+1;
  return new Date(y,mo-1,day,12);
}
function holidays(y){
  const e=easter(y);
  return new Set([
    y+'-01-01',y+'-01-06',iso(add(e,-2)),iso(add(e,1)),y+'-05-01',
    iso(add(e,39)),iso(add(e,50)),iso(add(e,60)),y+'-10-03',y+'-11-01',y+'-12-25',y+'-12-26'
  ]);
}
function localDue(y,m){
  let d=new Date(Number(y),Number(m)-1,20,12),h=holidays(Number(y));
  while(d.getDay()===0||d.getDay()===6||h.has(iso(d)))d=add(d,-1);
  return iso(d);
}
function de(v){
  const p=String(v||'').split('-');
  return p.length===3?p[2]+'.'+p[1]+'.'+p[0]:String(v||'');
}
function daysTo(v){
  const p=String(v||'').split('-').map(Number);
  if(p.length!==3||!p[0])return 0;
  const a=new Date(p[0],p[1]-1,p[2],12),b=new Date();b.setHours(12,0,0,0);
  return Math.round((a-b)/86400000);
}
function selected(){
  return {
    year:Number($('dg520Year')?.value||new Date().getFullYear()),
    month:Number($('dg520Month')?.value||new Date().getMonth()+1)
  };
}
function ensureCss(){
  if($('dg742PayrollHotfixCss'))return;
  const s=document.createElement('style');s.id='dg742PayrollHotfixCss';
  s.textContent='#dg520Due,#dg74Due{display:none!important}'+
    '#dg742HotfixDue{font-weight:900;margin:10px 0;padding:12px 15px;border-radius:13px;background:#fff7ed;color:#8a3b18}'+
    '#dg742HotfixDue.today{background:#fee2e2;color:#991b1b}'+
    '#dg742HotfixDue.future{background:#f0fdf4;color:#166534}'+
    '#dg742ForceClose{background:#b42318!important;color:#fff!important;border-color:#b42318!important}'+
    '#dg742ForceClose:hover{filter:brightness(.96)}';
  document.head.appendChild(s);
}
function renderDue(due){
  const sec=$('dg520PayrollClose');if(!sec)return;
  ensureCss();
  let box=$('dg742HotfixDue');
  if(!box){
    box=document.createElement('div');box.id='dg742HotfixDue';
    const anchor=$('dg520Due')||sec.querySelector('.grid2');
    if(anchor)anchor.insertAdjacentElement('afterend',box);else sec.prepend(box);
  }
  const d=daysTo(due),q=selected(),regular=q.year+'-'+pad(q.month)+'-20',moved=due!==regular;
  let txt='',cls='';
  if(d===0){txt='🔴 Lohnübergabe Heute ('+de(due)+').';cls='today';}
  else if(d>0){txt='🟢 Lohnübergabe am '+de(due)+' · noch '+d+' Tag'+(d===1?'':'e')+'.';cls='future';}
  else{txt='🔴 Lohnübergabe seit '+Math.abs(d)+' Tag'+(Math.abs(d)===1?'':'en')+' überfällig ('+de(due)+').';cls='today';}
  if(moved)txt+=' Regulärer Stichtag 20. fällt auf Wochenende/Feiertag – auf den vorherigen Arbeitstag vorgezogen.';
  box.className=cls;
  box.textContent=txt;
  box.dataset.hotfix=HOTFIX;
}
async function refreshDue(){
  const q=selected();let due=localDue(q.year,q.month);
  renderDue(due);
  try{
    if(typeof window.api==='function'&&typeof window.chefPayload==='function'){
      const r=await window.api(window.chefPayload({action:'getPayrollCycleState',year:q.year,month:q.month}));
      if(r&&r.dueDate){due=String(r.dueDate);renderDue(due);}
    }
  }catch(_e){}
}
function setStatus(text,type){
  if(typeof window.setMessage==='function'){try{window.setMessage('dg520Status',text,type||'info');return;}catch(_e){}}
  const s=$('dg520Status');if(s){s.className='status '+(type||'info');s.textContent=text;}
}
async function forceClose(){
  const q=selected();
  const reason=prompt('Prüfvermerk / Grund für den Abschluss trotz Meldungen:','Alle angezeigten Meldungen wurden geprüft. Der Monat wird bewusst trotz verbleibender Auffälligkeiten abgeschlossen.');
  if(!reason||!String(reason).trim())return false;
  if(!confirm('Monat '+pad(q.month)+'.'+q.year+' wirklich trotz verbleibender Meldungen abschließen? Der Vorgang wird mit Begründung protokolliert.'))return false;
  try{
    if(typeof window.api!=='function'||typeof window.chefPayload!=='function')throw new Error('Backend-Funktion ist noch nicht bereit.');
    setStatus('Monat wird trotz Meldungen abgeschlossen ...','info');
    await window.api(window.chefPayload({action:'forceCompletePayrollCycle',year:q.year,month:q.month,reason:String(reason).trim()}));
    setStatus('✓ Monat wurde trotz Meldungen abgeschlossen und protokolliert.','ok');
    if(typeof window.dg520RunAudit==='function')await window.dg520RunAudit();
    ensureForceButton();
    await refreshDue();
  }catch(e){
    setStatus('Abschluss nicht möglich: '+(e&&e.message?e.message:e),'error');
  }
  return false;
}
function ensureForceButton(){
  const out=$('dg520Result');if(!out||!out.innerHTML.trim())return;
  if(/Monatsabschluss erfolgt/i.test(out.textContent||'')&&/Monat wieder öffnen/i.test(out.textContent||'')){
    $('dg742ForceClose')?.remove();return;
  }
  let row=[...out.querySelectorAll(':scope > .button-row')].pop();
  if(!row){
    row=document.createElement('div');row.className='button-row';out.appendChild(row);
  }
  let btn=$('dg742ForceClose');
  if(!btn){
    btn=document.createElement('button');
    btn.id='dg742ForceClose';btn.type='button';btn.className='btn danger';
    btn.textContent='Trotz Meldungen abschließen';
    btn.addEventListener('click',e=>{e.preventDefault();forceClose();});
    const transfer=[...row.querySelectorAll('button')].find(b=>/Steuerberater/i.test(b.textContent||''));
    if(transfer)row.insertBefore(btn,transfer);else row.appendChild(btn);
  }
  btn.disabled=false;
  btn.dataset.hotfix=HOTFIX;
}
function bindSelectors(){
  ['dg520Year','dg520Month'].forEach(id=>{
    const x=$(id);if(!x||x.dataset.dg742Hotfix)return;
    x.dataset.dg742Hotfix='1';x.addEventListener('change',()=>{refreshDue();setTimeout(ensureForceButton,50);});
  });
}
function attachResultObserver(){
  const out=$('dg520Result');if(!out||observed===out)return;
  if(observed&&observed.__dg742Observer){try{observed.__dg742Observer.disconnect();}catch(_e){}}
  const ob=new MutationObserver(()=>{ensureForceButton();refreshDue();});
  ob.observe(out,{childList:true,subtree:true});
  out.__dg742Observer=ob;observed=out;
}
function patchAudit(){
  if(window.__DG742_PAYROLL_HOTFIX_WRAPPED)return;
  const base=window.dg520RunAudit;
  if(typeof base!=='function')return;
  window.__DG742_PAYROLL_HOTFIX_WRAPPED=true;
  window.dg520RunAudit=async function(){
    const r=await base.apply(this,arguments);
    bindSelectors();attachResultObserver();ensureForceButton();await refreshDue();
    return r;
  };
}
function install(){
  if(installing)return;installing=true;
  try{
    document.documentElement.dataset.dgPayrollHotfix=HOTFIX;
    ensureCss();patchAudit();bindSelectors();attachResultObserver();ensureForceButton();refreshDue();
  }finally{installing=false;}
}
window.dg742PayrollHotfixInstall=install;
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});else install();
[100,400,1000,2500,5000].forEach(ms=>setTimeout(install,ms));
})();
