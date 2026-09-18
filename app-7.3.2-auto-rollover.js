/* DG Zeiterfassung 7.3.2 - automatischer Lohn-Stichtag und Zaehler-Neustart */
(function(){
'use strict';
const V732='7.3.2';
const byId732=id=>document.getElementById(id);
function pad732(n){return String(n).padStart(2,'0');}
function iso732(d){return d.getFullYear()+'-'+pad732(d.getMonth()+1)+'-'+pad732(d.getDate());}
function de732(v){try{return typeof formatDateDE==='function'?formatDateDE(v):String(v||'');}catch(_e){return String(v||'');}}
function add732(d,n){const x=new Date(d.getFullYear(),d.getMonth(),d.getDate());x.setDate(x.getDate()+n);return x;}
function easter732(y){
  const a=y%19,b=Math.floor(y/100),c=y%100,d=Math.floor(b/4),e=b%4,f=Math.floor((b+8)/25),g=Math.floor((b-f+1)/3),h=(19*a+b-d-g+15)%30,i=Math.floor(c/4),k=c%4,l=(32+2*e+2*i-h-k)%7,m=Math.floor((a+11*h+22*l)/451),month=Math.floor((h+l-7*m+114)/31),day=((h+l-7*m+114)%31)+1;
  return new Date(y,month-1,day);
}
function holidaySet732(y){
  const e=easter732(y);
  return new Set([
    y+'-01-01',y+'-01-06',y+'-05-01',y+'-10-03',y+'-11-01',y+'-12-25',y+'-12-26',
    iso732(add732(e,-2)),iso732(add732(e,1)),iso732(add732(e,39)),iso732(add732(e,50))
  ]);
}
function due732(y,m){
  let d=new Date(Number(y),Number(m)-1,20),h=holidaySet732(Number(y));
  while(d.getDay()===0||d.getDay()===6||h.has(iso732(d)))d=add732(d,-1);
  return iso732(d);
}
function cycle732(y,m){
  y=Number(y);m=Number(m);let py=y,pm=m-1;if(pm===0){pm=12;py--;}
  const prev=due732(py,pm).split('-').map(Number);
  const start=iso732(add732(new Date(prev[0],prev[1]-1,prev[2]),1));
  return {start:start,end:due732(y,m)};
}
function selectedEmp732(){return {year:Number(byId732('empYear')?.value),month:Number(byId732('empMonth')?.value)};}
function selectedPayroll732(){return {year:Number(byId732('dg520Year')?.value||byId732('bossYear')?.value),month:Number(byId732('dg520Month')?.value||byId732('bossMonth')?.value)};}

function renderEmployeeCycle732(){
  const q=selectedEmp732();if(!(q.year>0&&q.month>=1&&q.month<=12))return;
  const grid=byId732('empYear')?.closest('.grid2');if(!grid)return;
  let box=byId732('dg731EmployeeCycle');
  if(!box){box=document.createElement('div');box.id='dg731EmployeeCycle';box.className='dg731-cycle';grid.insertAdjacentElement('afterend',box);}
  const c=cycle732(q.year,q.month);
  box.innerHTML='Abrechnungszeitraum: '+de732(c.start)+' – '+de732(c.end)+'<small>Der Zähler startet automatisch am Folgetag des tatsächlichen Lohn-Stichtags neu. Ein manueller Monatsabschluss ist dafür nicht erforderlich.</small>';
}
function renderPayrollCycle732(){
  const q=selectedPayroll732();if(!(q.year>0&&q.month>=1&&q.month<=12))return;
  const due=byId732('dg520Due'),sec=byId732('dg520PayrollClose');if(!sec)return;
  let box=byId732('dg731PayrollCycle');
  if(!box){box=document.createElement('div');box.id='dg731PayrollCycle';box.className='dg731-cycle';if(due)due.insertAdjacentElement('afterend',box);}
  const c=cycle732(q.year,q.month);
  box.innerHTML='Abrechnungszeitraum: '+de732(c.start)+' – '+de732(c.end)+'<small>Automatischer Neustart der Wochen- und Monatsstunden am '+de732(iso732(add732(new Date(...c.end.split('-').map((v,i)=>i===1?Number(v)-1:Number(v))),1)))+'.</small>';
  let note=byId732('dg732AutoResetNote');
  if(!note){note=document.createElement('div');note.id='dg732AutoResetNote';note.className='status ok';box.insertAdjacentElement('afterend',note);}
  note.textContent='Automatische Zähler-Nullstellung aktiv: Auch wenn das Büro den Monatsabschluss vergisst, beginnen Wochen- und Monatsstunden am Folgetag des Lohn-Stichtags automatisch neu.';
}
function stamp732(){
  try{
    document.title='DG Zeiterfassung '+V732;
    document.querySelectorAll('.login-card .muted.small').forEach(x=>{if(/^Version\s+/i.test((x.textContent||'').trim()))x.textContent='Version '+V732;});
    document.querySelectorAll('.hero strong').forEach(x=>{if(/Zeiterfassung/i.test(x.textContent||''))x.textContent='Zeiterfassung - '+V732;});
    window.DG_APP_VERSION=V732;window.DG_RELEASE=V732;if(window.DG3)DG3.version=V732;
  }catch(_e){}
}
function install732(){
  stamp732();
  renderEmployeeCycle732();
  renderPayrollCycle732();
  ['empYear','empMonth'].forEach(id=>{const x=byId732(id);if(x&&!x.dataset.dg732){x.dataset.dg732='1';x.addEventListener('change',renderEmployeeCycle732);}});
  ['dg520Year','dg520Month'].forEach(id=>{const x=byId732(id);if(x&&!x.dataset.dg732){x.dataset.dg732='1';x.addEventListener('change',renderPayrollCycle732);}});
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>setTimeout(install732,0),{once:true});else setTimeout(install732,0);
setTimeout(install732,500);
setTimeout(install732,1400);
})();