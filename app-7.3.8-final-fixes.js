/* DG Zeiterfassung 7.3.8 - stabile Lohnanzeige, Zwangsuebergabe, Tagespruefung */
(function(){
'use strict';
const V738='7.3.8';
const $738=id=>document.getElementById(id);
let busy738=false,observer738=null;

function pad738(n){return String(n).padStart(2,'0');}
function iso738(d){return d.getFullYear()+'-'+pad738(d.getMonth()+1)+'-'+pad738(d.getDate());}
function add738(d,n){const x=new Date(d.getFullYear(),d.getMonth(),d.getDate());x.setDate(x.getDate()+n);return x;}
function de738(v){try{return typeof formatDateDE==='function'?formatDateDE(v):String(v||'');}catch(_e){return String(v||'');}}
function diff738(v){
  const p=String(v||'').split('-').map(Number);if(p.length!==3||!p[0])return 0;
  const a=new Date(p[0],p[1]-1,p[2]),b=new Date();a.setHours(0,0,0,0);b.setHours(0,0,0,0);
  return Math.round((a-b)/86400000);
}
function easter738(y){
  const a=y%19,b=Math.floor(y/100),c=y%100,d=Math.floor(b/4),e=b%4,f=Math.floor((b+8)/25),g=Math.floor((b-f+1)/3),h=(19*a+b-d-g+15)%30,i=Math.floor(c/4),k=c%4,l=(32+2*e+2*i-h-k)%7,m=Math.floor((a+11*h+22*l)/451),month=Math.floor((h+l-7*m+114)/31),day=((h+l-7*m+114)%31)+1;
  return new Date(y,month-1,day);
}
function holidays738(y){
  const e=easter738(y);
  return new Set([
    y+'-01-01',y+'-01-06',iso738(add738(e,-2)),iso738(add738(e,1)),
    y+'-05-01',iso738(add738(e,39)),iso738(add738(e,50)),iso738(add738(e,60)),
    y+'-10-03',y+'-11-01',y+'-12-25',y+'-12-26'
  ]);
}
function payrollDue738(y,m){
  y=Number(y);m=Number(m);let d=new Date(y,m-1,20),h=holidays738(y);
  while(d.getDay()===0||d.getDay()===6||h.has(iso738(d)))d=add738(d,-1);
  return iso738(d);
}
function selected738(){
  return {year:Number($738('dg520Year')?.value||new Date().getFullYear()),month:Number($738('dg520Month')?.value||new Date().getMonth()+1)};
}

function css738(){
  if($738('dg738Css'))return;
  const s=document.createElement('style');s.id='dg738Css';
  s.textContent=`
    #dg520Due.dg738-legacy-hidden{display:none!important}
    #d3Count-payroll.dg738-legacy-hidden{display:none!important}
    .dg738-due{font-weight:900;margin:10px 0;padding:10px 12px;border-radius:12px;background:#eef2ff}
    .dg738-due.warn{background:#fff7ed;color:#9a3412}.dg738-due.error{background:#fef2f2;color:#991b1b}.dg738-due.ok{background:#f0fdf4;color:#166534}
    .dg738-force{margin-top:14px;padding:14px;border-radius:14px;background:#fff7ed;border:1px solid #fdba74;color:#9a3412}
    .dg738-force strong{display:block;margin-bottom:4px}
    .dg738-open-highlight{outline:3px solid #2563eb!important;box-shadow:0 0 0 5px rgba(37,99,235,.12)!important}
  `;
  document.head.appendChild(s);
}

function ensurePayrollDisplay738(){
  css738();
  const sec=$738('dg520PayrollClose');
  if(sec){
    const old=$738('dg520Due');
    if(old)old.classList.add('dg738-legacy-hidden');
    let box=$738('dg738Due');
    if(!box){
      box=document.createElement('div');box.id='dg738Due';box.className='dg738-due';
      if(old)old.insertAdjacentElement('afterend',box);
      else{
        const grid=sec.querySelector('.grid2');(grid||sec.firstElementChild)?.insertAdjacentElement('afterend',box);
      }
    }
    const q=selected738(),due=payrollDue738(q.year,q.month),d=diff738(due),regular=q.year+'-'+pad738(q.month)+'-20';
    let text='',cls='';
    if(d===0){text='🔴 Lohnübergabe heute fällig ('+de738(due)+').';cls='error';}
    else if(d>0){text=(d<=2?'🔴 ':'🟢 ')+'Lohnübergabe am '+de738(due)+' · noch '+d+' Tag'+(d===1?'':'e')+'.';cls=d<=2?'error':d<=5?'warn':'';}
    else{text='🔴 Lohnübergabe seit '+Math.abs(d)+' Tag'+(Math.abs(d)===1?'':'en')+' überfällig ('+de738(due)+').';cls='error';}
    if(due!==regular)text+=' Regulärer 20. fällt auf Wochenende/Feiertag – Übergabe vorgezogen.';
    box.className='dg738-due '+cls;if(box.textContent!==text)box.textContent=text;
  }

  const tile=document.querySelector('#bossView .d3-tile.payroll');
  if(tile){
    const oldStrong=$738('d3Count-payroll');
    if(oldStrong)oldStrong.classList.add('dg738-legacy-hidden');
    let strong=$738('dg738CountPayroll');
    if(!strong){
      strong=document.createElement('strong');strong.id='dg738CountPayroll';
      if(oldStrong)oldStrong.insertAdjacentElement('afterend',strong);else tile.appendChild(strong);
    }
    const now=new Date(),due=payrollDue738(now.getFullYear(),now.getMonth()+1),d=diff738(due);
    const val=d===0?'Heute':d>0?(d+' Tag'+(d===1?'':'e')):(Math.abs(d)+' Tag'+(Math.abs(d)===1?'':'e')+' überf.');
    if(strong.textContent!==val)strong.textContent=val;
    tile.title='Lohnübergabe '+de738(due);
    tile.classList.toggle('error',d<=0);
    tile.classList.toggle('warn',d>0&&d<=5);
  }
}

function auditLooksCompleted738(out){
  const badge=[...out.querySelectorAll('.dg520-status')].find(x=>/Übergeben/i.test(x.textContent||''));
  if(badge)return true;
  return /Monatsabschluss erfolgt/i.test(out.textContent||'') && !/Zwangsübergabe/i.test(out.textContent||'');
}
function ensureForce738(){
  const out=$738('dg520Result');if(!out||!out.innerHTML.trim())return;
  let box=$738('dg738ForceBox');
  if(auditLooksCompleted738(out)){if(box)box.remove();return;}
  if(!box){
    box=document.createElement('div');box.id='dg738ForceBox';box.className='dg738-force';
    box.innerHTML=
      '<strong>Zwangsübergabe / bewusste Freigabe</strong>'+
      '<div>Wenn alle Auffälligkeiten geprüft wurden, kann der Monat unabhängig vom automatischen Prüfstatus direkt abgeschlossen und als an den Steuerberater übergeben markiert werden.</div>'+
      '<div class="button-row" style="margin-top:10px">'+
        '<button class="btn danger" type="button" id="dg738ForceBtn">Alles überprüft – trotzdem an Steuerberater übergeben</button>'+
      '</div>';
    out.appendChild(box);
    $738('dg738ForceBtn')?.addEventListener('click',()=>window.dg738ForceRelease());
  }
}

window.dg738ForceRelease=async function(){
  if(busy738)return false;
  const q=selected738();
  if(!(q.year>0&&q.month>=1&&q.month<=12)){setMessage('dg520Status','Bitte Jahr und Monat prüfen.','error');return false;}
  if(typeof d3Form!=='function'){alert('Formular konnte nicht geöffnet werden.');return false;}
  d3Form('Alles geprüft – trotzdem übergeben',[
    {name:'reason',label:'Prüfvermerk / Grund',type:'textarea',required:true}
  ],{reason:'Alle angezeigten Auffälligkeiten wurden geprüft. Monatsabschluss und Übergabe werden bewusst trotzdem durchgeführt.'},async v=>{
    if(!confirm('Monat wirklich trotz verbleibender Auffälligkeiten abschließen und als an den Steuerberater übergeben markieren?'))throw new Error('Freigabe abgebrochen.');
    busy738=true;
    try{
      setMessage('dg520Status','Zwangsübergabe wird gespeichert ...','info');
      await api(chefPayload({action:'forceCompletePayrollCycle',year:q.year,month:q.month,reason:String(v.reason||'').trim()}));
      setMessage('dg520Status','✓ Monatsabschluss und Übergabe wurden bewusst trotz Auffälligkeiten gespeichert.','ok');
      try{if(typeof window.dg520RunAudit==='function')await window.dg520RunAudit();}catch(_e){}
      try{if(typeof window.d3Dashboard==='function')await window.d3Dashboard(true);}catch(_e){}
      setTimeout(()=>{ensurePayrollDisplay738();ensureForce738();},80);
    }finally{busy738=false;}
  });
  return false;
};

function norm738(v){return String(v||'').toLocaleLowerCase('de-DE').replace(/\s+/g,' ').trim();}
window.dg520OpenDay=async function(empEncoded,date){
  const employee=decodeURIComponent(empEncoded||''),parts=String(date||'').split('-'),year=Number(parts[0]),month=Number(parts[1]);
  try{
    setMessage('dg520Status','Tagesbericht wird geöffnet ...','info');

    const admin=$738('d3Admin');
    if(admin){
      const body=admin.querySelector(':scope > .dg48-body');if(body)body.classList.remove('hidden');
      const t=admin.querySelector(':scope > .dg48-head .dg48-toggle');if(t)t.textContent='−';
    }
    const group=$738('dg48EmployeeClosures');
    if(group){
      const body=group.querySelector(':scope > .dg48-body');if(body)body.classList.remove('hidden');
      const t=group.querySelector(':scope > .dg48-head .dg48-toggle');if(t)t.textContent='−';
    }
    if($738('dg48DayYear'))$738('dg48DayYear').value=String(year);
    if($738('dg48DayMonth'))$738('dg48DayMonth').value=String(month);

    if(typeof window.loadBossDayClosuresV48!=='function')throw new Error('Mitarbeiterberichte sind nicht verfügbar.');
    await window.loadBossDayClosuresV48();

    const boxes=[...document.querySelectorAll('#dg48DayResult .dg48-days-employee')];
    const box=boxes.find(b=>{
      const n=(b.querySelector('.dg521-employee-head strong')||b.querySelector(':scope > strong'));
      return norm738(n?.textContent)===norm738(employee);
    });
    if(!box)throw new Error('Mitarbeiter '+employee+' wurde in den Mitarbeiterberichten nicht gefunden.');

    box.classList.remove('dg521-collapsed');
    const tog=box.querySelector('.dg521-toggle');if(tog)tog.textContent='−';
    const grid=box.querySelector(':scope > .dg48-day-grid');if(grid){grid.classList.remove('hidden');grid.style.display='';}

    const wanted=typeof formatDateDE==='function'?formatDateDE(date):de738(date);
    const cards=[...box.querySelectorAll('.dg48-day')];
    const card=cards.find(c=>norm738(c.querySelector(':scope > strong')?.textContent)===norm738(wanted));
    if(!card)throw new Error('Tagesbericht '+wanted+' wurde nicht gefunden.');

    const detail=card.querySelector('.dg49-detail');if(detail)detail.classList.remove('hidden');
    card.classList.add('dg738-open-highlight');
    card.scrollIntoView({behavior:'smooth',block:'center'});
    setTimeout(()=>card.classList.remove('dg738-open-highlight'),4000);
    clearMessage('dg520Status');
  }catch(e){
    setMessage('dg520Status','Tagesbericht konnte nicht geöffnet werden: '+(e?.message||e),'error');
  }
  return false;
};

function stabilize738(){
  if(busy738)return;
  ensurePayrollDisplay738();
  ensureForce738();
}
function observe738(){
  if(observer738)return;
  const root=$738('bossView')||document.body;if(!root)return;
  observer738=new MutationObserver(()=>{
    if(busy738)return;
    requestAnimationFrame(stabilize738);
  });
  observer738.observe(root,{childList:true,subtree:true,characterData:true});
}
function stamp738(){
  try{
    document.title='DG Zeiterfassung '+V738;
    document.querySelectorAll('.login-card .muted.small').forEach(x=>{if(/^Version\s+/i.test((x.textContent||'').trim()))x.textContent='Version '+V738;});
    document.querySelectorAll('.hero strong').forEach(x=>{if(/Zeiterfassung/i.test(x.textContent||''))x.textContent='Zeiterfassung - '+V738;});
    window.DG_APP_VERSION=V738;window.DG_RELEASE=V738;if(window.DG3)DG3.version=V738;
  }catch(_e){}
}
function install738(){
  css738();stamp738();stabilize738();observe738();
  ['dg520Year','dg520Month'].forEach(id=>{const x=$738(id);if(x&&!x.dataset.dg738){x.dataset.dg738='1';x.addEventListener('change',ensurePayrollDisplay738);}});
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>setTimeout(install738,0),{once:true});else setTimeout(install738,0);
setTimeout(install738,500);
})();
