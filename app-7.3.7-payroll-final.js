/* DG Zeiterfassung 7.3.7 - finaler Lohnstichtag + Zwangsuebergabe immer sichtbar */
(function(){
'use strict';
const V737='7.3.7';
const $737=id=>document.getElementById(id);

function pad737(n){return String(n).padStart(2,'0');}
function iso737(d){return d.getFullYear()+'-'+pad737(d.getMonth()+1)+'-'+pad737(d.getDate());}
function add737(d,n){const x=new Date(d.getFullYear(),d.getMonth(),d.getDate());x.setDate(x.getDate()+n);return x;}
function de737(v){try{return typeof formatDateDE==='function'?formatDateDE(v):String(v||'');}catch(_e){return String(v||'');}}
function diff737(v){const p=String(v||'').split('-').map(Number);if(p.length!==3)return 0;const a=new Date(p[0],p[1]-1,p[2]),b=new Date();a.setHours(0,0,0,0);b.setHours(0,0,0,0);return Math.round((a-b)/86400000);}

function easter737(y){
  const a=y%19,b=Math.floor(y/100),c=y%100,d=Math.floor(b/4),e=b%4,f=Math.floor((b+8)/25),g=Math.floor((b-f+1)/3),h=(19*a+b-d-g+15)%30,i=Math.floor(c/4),k=c%4,l=(32+2*e+2*i-h-k)%7,m=Math.floor((a+11*h+22*l)/451),month=Math.floor((h+l-7*m+114)/31),day=((h+l-7*m+114)%31)+1;
  return new Date(y,month-1,day);
}
function holidays737(y){
  const e=easter737(y);
  return new Set([
    y+'-01-01',y+'-01-06',
    iso737(add737(e,-2)),iso737(add737(e,1)),
    y+'-05-01',iso737(add737(e,39)),iso737(add737(e,50)),iso737(add737(e,60)),
    y+'-10-03',y+'-11-01',y+'-12-25',y+'-12-26'
  ]);
}
function payrollDue737(year,month){
  year=Number(year);month=Number(month);
  let d=new Date(year,month-1,20),h=holidays737(year);
  while(d.getDay()===0||d.getDay()===6||h.has(iso737(d)))d=add737(d,-1);
  return iso737(d);
}
function nextYm737(y,m){m=Number(m)+1;y=Number(y);if(m===13){m=1;y++;}return {year:y,month:m};}
function selected737(){return {year:Number($737('dg520Year')?.value||new Date().getFullYear()),month:Number($737('dg520Month')?.value||new Date().getMonth()+1)};}

/* Jede Backend-Antwort zur Lohnfaelligkeit wird lokal auf den tatsaechlichen
   Arbeitstag normalisiert. Dadurch kann ein alter 20.-Wert die Anzeige nicht
   mehr zurueck auf Sonntag/Feiertag setzen. */
const apiBase737=window.api;
if(typeof apiBase737==='function')window.api=api=async function(payload){
  const r=await apiBase737.apply(this,arguments);
  try{
    const action=String(payload&&payload.action||'');
    if(r&&typeof r==='object'&&['getPayrollCycleState','getMonthPayrollAudit','completePayrollCycle','forceCompletePayrollCycle'].includes(action)){
      const y=Number(payload.year),m=Number(payload.month);
      if(y>0&&m>=1&&m<=12){
        r.dueDate=payrollDue737(y,m);
        const n=nextYm737(y,m);
        if('nextDueDate' in r||action!=='getMonthPayrollAudit')r.nextDueDate=payrollDue737(n.year,n.month);
        if(r.audit&&typeof r.audit==='object'){
          r.audit.dueDate=payrollDue737(y,m);
          if(r.audit.nextDueDate!==undefined)r.audit.nextDueDate=payrollDue737(n.year,n.month);
        }
      }
    }
  }catch(_e){}
  return r;
};

function paintCorrectDue737(){
  const q=selected737(),due=payrollDue737(q.year,q.month),d=diff737(due),box=$737('dg520Due');
  if(box){
    let text='',cls='';
    if(d===0){text='🔴 Lohnübergabe heute fällig ('+de737(due)+').';cls='error';}
    else if(d>0){text=(d<=2?'🔴 ':'🟢 ')+'Lohnübergabe am '+de737(due)+' · noch '+d+' Tag'+(d===1?'':'e')+'.';cls=d<=2?'error':d<=5?'warn':'';}
    else{text='🔴 Lohnübergabe seit '+Math.abs(d)+' Tag'+(Math.abs(d)===1?'':'en')+' überfällig ('+de737(due)+').';cls='error';}
    const regular=q.year+'-'+pad737(q.month)+'-20';
    if(due!==regular)text+=' Regulärer 20. fällt auf Wochenende/Feiertag – Übergabe vorgezogen.';
    if(box.textContent!==text){box.className='dg520-due '+cls;box.textContent=text;}
  }

  const now=new Date(),tileDue=payrollDue737(now.getFullYear(),now.getMonth()+1),td=diff737(tileDue);
  const strong=$737('d3Count-payroll'),tile=document.querySelector('#bossView .d3-tile.payroll');
  if(strong){
    const val=td===0?'Heute':td>0?(td+' Tag'+(td===1?'':'e')):(Math.abs(td)+' Tag'+(Math.abs(td)===1?'':'e')+' überf.');
    if(strong.textContent!==val)strong.textContent=val;
  }
  if(tile)tile.title='Lohnübergabe '+de737(tileDue);
}

function ensureForce737(a){
  const out=$737('dg520Result');if(!out||!a)return;
  const completed=a?.state?.status==='Uebergeben'&&!a?.state?.changedSinceApproval;
  let box=$737('dg737ForceBox');
  if(completed){if(box)box.remove();return;}
  if(!box){
    box=document.createElement('div');box.id='dg737ForceBox';box.className='status warn';box.style.marginTop='14px';
    out.appendChild(box);
  }
  const errors=Number(a?.summary?.errors||0),warnings=Number(a?.summary?.warnings||0);
  box.innerHTML=
    '<strong>Zwangsübergabe / bewusste Freigabe</strong><br>'+
    'Wenn du alle Auffälligkeiten geprüft hast, kannst du den Monat unabhängig vom automatischen Prüfstatus direkt abschließen und als an den Steuerberater übergeben markieren.'+
    '<div class="muted small" style="margin-top:5px">'+errors+' Fehler · '+warnings+' ungeprüfte Hinweise</div>'+
    '<div class="button-row" style="margin-top:10px">'+
      '<button class="btn danger" type="button" onclick="return dg736ForceRelease()">Alles überprüft – trotzdem an Steuerberater übergeben</button>'+
    '</div>';
}

const renderBase737=window.renderAudit520;
if(typeof renderBase737==='function')window.renderAudit520=renderAudit520=function(a){
  const r=renderBase737.apply(this,arguments);
  try{ensureForce737(a);paintCorrectDue737();}catch(_e){}
  return r;
};

const auditBase737=window.dg520RunAudit;
if(typeof auditBase737==='function')window.dg520RunAudit=async function(){
  const r=await auditBase737.apply(this,arguments);
  try{if(typeof currentAudit520!=='undefined'&&currentAudit520)ensureForce737(currentAudit520);paintCorrectDue737();}catch(_e){}
  return r;
};

function stamp737(){
  try{
    document.title='DG Zeiterfassung '+V737;
    document.querySelectorAll('.login-card .muted.small').forEach(x=>{if(/^Version\s+/i.test((x.textContent||'').trim()))x.textContent='Version '+V737;});
    document.querySelectorAll('.hero strong').forEach(x=>{if(/Zeiterfassung/i.test(x.textContent||''))x.textContent='Zeiterfassung - '+V737;});
    window.DG_APP_VERSION=V737;window.DG_RELEASE=V737;if(window.DG3)DG3.version=V737;
  }catch(_e){}
}
function install737(){
  stamp737();paintCorrectDue737();
  try{if(typeof currentAudit520!=='undefined'&&currentAudit520)ensureForce737(currentAudit520);}catch(_e){}
  ['dg520Year','dg520Month'].forEach(id=>{const x=$737(id);if(x&&!x.dataset.dg737){x.dataset.dg737='1';x.addEventListener('change',paintCorrectDue737);}});
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>setTimeout(install737,0),{once:true});else setTimeout(install737,0);
setTimeout(install737,500);
/* Altcode schreibt die Faelligkeit periodisch erneut. Dieser kleine
   Korrekturlauf verhindert, dass der falsche 20.-Wert sichtbar bleibt. */
setInterval(paintCorrectDue737,1000);
})();
