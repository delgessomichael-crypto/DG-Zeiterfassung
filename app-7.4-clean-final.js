/* DG Zeiterfassung 7.4.0 CLEAN - finale UI-Logik ohne Legacy-Overlays */
(function(){
'use strict';
const V740='7.4.0';
const $=id=>document.getElementById(id);
const esc=v=>String(v==null?'':v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

function pad(n){return String(n).padStart(2,'0');}
function iso(d){return d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate());}
function add(d,n){const x=new Date(d.getFullYear(),d.getMonth(),d.getDate());x.setDate(x.getDate()+n);return x;}
function de(v){try{return typeof formatDateDE==='function'?formatDateDE(v):String(v||'');}catch(_e){return String(v||'');}}
function diff(v){const p=String(v||'').split('-').map(Number);if(p.length!==3)return 0;const a=new Date(p[0],p[1]-1,p[2]),b=new Date();a.setHours(0,0,0,0);b.setHours(0,0,0,0);return Math.round((a-b)/86400000);}

function easter(y){
  const a=y%19,b=Math.floor(y/100),c=y%100,d=Math.floor(b/4),e=b%4,f=Math.floor((b+8)/25),g=Math.floor((b-f+1)/3),h=(19*a+b-d-g+15)%30,i=Math.floor(c/4),k=c%4,l=(32+2*e+2*i-h-k)%7,m=Math.floor((a+11*h+22*l)/451),month=Math.floor((h+l-7*m+114)/31),day=((h+l-7*m+114)%31)+1;
  return new Date(y,month-1,day);
}
function holidays(y){
  const e=easter(y);
  return new Set([
    y+'-01-01',y+'-01-06',
    iso(add(e,-2)),iso(add(e,1)),
    y+'-05-01',iso(add(e,39)),iso(add(e,50)),iso(add(e,60)),
    y+'-10-03',y+'-11-01',y+'-12-25',y+'-12-26'
  ]);
}
function payrollDue(year,month){
  year=Number(year);month=Number(month);
  let d=new Date(year,month-1,20),h=holidays(year);
  while(d.getDay()===0||d.getDay()===6||h.has(iso(d)))d=add(d,-1);
  return iso(d);
}
function selected(){
  return {
    year:Number($('dg520Year')?.value||$('bossYear')?.value||new Date().getFullYear()),
    month:Number($('dg520Month')?.value||$('bossMonth')?.value||(new Date().getMonth()+1))
  };
}

function paintDue(){
  const q=selected(),due=payrollDue(q.year,q.month),d=diff(due),box=$('dg520Due');
  if(box){
    let text='',cls='';
    if(d===0){text='🔴 Lohnübergabe heute fällig ('+de(due)+').';cls='error';}
    else if(d>0){text=(d<=2?'🔴 ':'🟢 ')+'Lohnübergabe am '+de(due)+' · noch '+d+' Tag'+(d===1?'':'e')+'.';cls=d<=2?'error':d<=5?'warn':'';}
    else{text='🔴 Lohnübergabe seit '+Math.abs(d)+' Tag'+(Math.abs(d)===1?'':'en')+' überfällig ('+de(due)+').';cls='error';}
    const regular=q.year+'-'+pad(q.month)+'-20';
    if(due!==regular)text+=' Regulärer 20. fällt auf Wochenende/Feiertag – Übergabe vorgezogen.';
    box.className='dg520-due '+cls;
    box.textContent=text;
  }
  const now=new Date(),tdue=payrollDue(now.getFullYear(),now.getMonth()+1),td=diff(tdue);
  const strong=$('d3Count-payroll'),tile=document.querySelector('#bossView .d3-tile.payroll');
  if(strong)strong.textContent=td===0?'Heute':td>0?(td+' Tag'+(td===1?'':'e')):(Math.abs(td)+' Tag'+(Math.abs(td)===1?'':'e')+' überf.');
  if(tile)tile.title='Lohnübergabe '+de(tdue);
}

function ensureForceBox(a){
  const out=$('dg520Result');if(!out||!a)return;
  const completed=a?.state?.status==='Uebergeben'&&!a?.state?.changedSinceApproval;
  let box=$('dg740ForceBox');
  if(completed){if(box)box.remove();return;}
  if(!box){
    box=document.createElement('div');
    box.id='dg740ForceBox';
    box.className='status warn';
    box.style.marginTop='14px';
    out.appendChild(box);
  }
  const errors=Number(a?.summary?.errors||0),warnings=Number(a?.summary?.warnings||0);
  box.innerHTML=
    '<strong>Zwangsübergabe / bewusste Freigabe</strong><br>'+
    'Wenn alle Auffälligkeiten geprüft wurden, kann der Monat unabhängig vom automatischen Prüfstatus direkt abgeschlossen und als an den Steuerberater übergeben markiert werden.'+
    '<div class="muted small" style="margin-top:5px">'+errors+' Fehler · '+warnings+' ungeprüfte Hinweise</div>'+
    '<div class="button-row" style="margin-top:10px">'+
      '<button class="btn danger" type="button" onclick="return dg740ForceRelease()">Alles überprüft – trotzdem an Steuerberater übergeben</button>'+
    '</div>';
}

window.dg740ForceRelease=async function(){
  const q=selected(),a=(typeof currentAudit520!=='undefined'?currentAudit520:null);
  if(!a){setMessage('dg520Status','Bitte zuerst „Monat jetzt prüfen“ ausführen.','error');return false;}
  if(typeof d3Form!=='function')return false;
  const count=Number(a?.summary?.errors||0)+' Fehler / '+Number(a?.summary?.warnings||0)+' ungeprüfte Hinweise';
  d3Form('Alles geprüft – trotzdem übergeben',[
    {name:'reason',label:'Grund / interner Prüfvermerk',type:'textarea',required:true}
  ],{reason:'Alle angezeigten Auffälligkeiten wurden geprüft. Bewusste Übergabe trotz '+count+'.'},async v=>{
    if(!confirm('Monat wirklich trotz verbleibender Auffälligkeiten an den Steuerberater übergeben?\n\n'+count+'\n\nDie Entscheidung wird protokolliert.'))throw new Error('Freigabe abgebrochen.');
    setMessage('dg520Status','Zwangsübergabe wird gespeichert ...','info');
    const r=await api(chefPayload({action:'forceCompletePayrollCycle',year:q.year,month:q.month,reason:String(v.reason||'').trim()}));
    if(typeof currentAudit520!=='undefined')currentAudit520=r.audit||a;
    if(typeof renderAudit520==='function')renderAudit520(r.audit||a);
    setMessage('dg520Status','✓ Monat wurde bewusst trotz Auffälligkeiten übergeben.','ok');
    try{if(typeof d3Dashboard==='function')await d3Dashboard(true);}catch(_e){}
  });
  return false;
};

window.dg520OpenDay=async function(empEncoded,date){
  const employee=decodeURIComponent(String(empEncoded||'')),p=String(date||'').split('-'),year=Number(p[0]),month=Number(p[1]);
  try{
    if(typeof d3Open==='function')d3Open('d3Admin');
    const group=$('dg48EmployeeClosures');
    if(group){
      const body=group.querySelector(':scope > .dg48-body');
      if(body)body.classList.remove('hidden');
      const t=group.querySelector(':scope > .dg48-head .dg48-toggle');
      if(t)t.textContent='−';
    }
    if($('dg48DayYear'))$('dg48DayYear').value=String(year);
    if($('dg48DayMonth'))$('dg48DayMonth').value=String(month);
    setMessage('dg520Status','Tagesbericht wird geöffnet ...','info');
    if(typeof loadBossDayClosuresV48!=='function')throw new Error('Mitarbeiterberichte sind nicht verfügbar.');
    await loadBossDayClosuresV48();

    const boxes=[...document.querySelectorAll('#dg48DayResult .dg48-days-employee')];
    const box=boxes.find(b=>{
      const h=b.querySelector('.dg521-employee-head strong')||b.querySelector(':scope > strong');
      return (h?.textContent||'').trim()===employee;
    });
    if(!box)throw new Error('Mitarbeiter '+employee+' wurde in diesem Monat nicht gefunden.');

    const wanted=de(date);
    const cards=[...box.querySelectorAll('.dg48-day')];
    const card=cards.find(c=>(c.querySelector(':scope > strong')?.textContent||'').trim()===wanted);
    if(!card)throw new Error('Tagesbericht '+wanted+' wurde nicht gefunden.');

    const detail=card.querySelector('.dg49-detail');if(detail)detail.classList.remove('hidden');
    card.style.outline='3px solid #2563eb';
    card.scrollIntoView({behavior:'smooth',block:'center'});
    setTimeout(()=>{card.style.outline='';},3000);
    clearMessage('dg520Status');
  }catch(e){
    setMessage('dg520Status','Tagesbericht konnte nicht geöffnet werden: '+(e?.message||e),'error');
  }
  return false;
};

const renderAuditBase=window.renderAudit520;
if(typeof renderAuditBase==='function')window.renderAudit520=function(a){
  const r=renderAuditBase.apply(this,arguments);
  paintDue();ensureForceBox(a);
  return r;
};
const dashboardBase=window.d3Dashboard;
if(typeof dashboardBase==='function')window.d3Dashboard=async function(){
  const r=await dashboardBase.apply(this,arguments);
  paintDue();
  return r;
};
const payrollSectionBase=window.makePayrollSection520;
if(typeof payrollSectionBase==='function')window.makePayrollSection520=function(){
  const r=payrollSectionBase.apply(this,arguments);
  paintDue();
  ['dg520Year','dg520Month'].forEach(id=>{const x=$(id);if(x&&!x.dataset.dg740){x.dataset.dg740='1';x.addEventListener('change',paintDue);}});
  return r;
};
const auditBase=window.dg520RunAudit;
if(typeof auditBase==='function')window.dg520RunAudit=async function(){
  const r=await auditBase.apply(this,arguments);
  try{paintDue();if(typeof currentAudit520!=='undefined'&&currentAudit520)ensureForceBox(currentAudit520);}catch(_e){}
  return r;
};

function cleanupLegacyArtifacts(){
  ['dg521Styles','dg522Styles'].forEach(id=>{const n=$(id);if(n)n.remove();});
  document.querySelectorAll('.dg522-review-panel').forEach(n=>n.remove());
}
function stamp(){
  document.title='DG Zeiterfassung '+V740;
  document.querySelectorAll('.login-card .muted.small').forEach(x=>{if(/^Version\s+/i.test((x.textContent||'').trim()))x.textContent='Version '+V740;});
  document.querySelectorAll('.hero strong').forEach(x=>{if(/Zeiterfassung/i.test(x.textContent||''))x.textContent='Zeiterfassung - '+V740;});
  try{window.DG_APP_VERSION=V740;window.DG_RELEASE=V740;if(window.DG3)DG3.version=V740;}catch(_e){}
}
function install(){
  cleanupLegacyArtifacts();
  stamp();
  paintDue();
  try{if(typeof currentAudit520!=='undefined'&&currentAudit520)ensureForceBox(currentAudit520);}catch(_e){}
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});else install();
})();
