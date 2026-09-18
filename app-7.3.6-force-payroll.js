/* DG Zeiterfassung 7.3.6 - Monatsabschluss manuell trotz gepruefter Auffaelligkeiten */
(function(){
'use strict';
const V736='7.3.6';
const byId736=id=>document.getElementById(id);

function selected736(){
  return {
    year:Number(byId736('dg520Year')?.value||0),
    month:Number(byId736('dg520Month')?.value||0)
  };
}
function issueText736(a){
  const e=Number(a?.summary?.errors||0),w=Number(a?.summary?.warnings||0);
  return e+' Fehler / '+w+' ungeprüfte Hinweise';
}
function decorate736(a){
  const out=byId736('dg520Result');if(!out||!a)return;
  const completed=a?.state?.status==='Uebergeben'&&!a?.state?.changedSinceApproval;
  let box=byId736('dg736ForceBox');
  if(completed||a.canRelease){
    if(box)box.remove();
    return;
  }
  if(!box){
    box=document.createElement('div');
    box.id='dg736ForceBox';
    box.className='status warn';
    box.style.marginTop='14px';
    out.appendChild(box);
  }
  box.innerHTML=
    '<strong>Bewusste manuelle Freigabe möglich</strong><br>'+
    'Wenn alle roten Einträge geprüft wurden und der Monatsabschluss trotzdem erfolgen soll, kann das Büro ihn bewusst freigeben. '+
    'Die Freigabe wird mit Benutzer, Zeitpunkt, Grund und Anzahl der verbleibenden Auffälligkeiten protokolliert.'+
    '<div class="button-row" style="margin-top:10px">'+
      '<button class="btn danger" type="button" onclick="return dg736ForceRelease()">Alles überprüft – trotzdem freigeben</button>'+
    '</div>';
}
const renderBase736=window.renderAudit520;
if(typeof renderBase736==='function')window.renderAudit520=renderAudit520=function(a){
  const r=renderBase736.apply(this,arguments);
  try{decorate736(a);}catch(_e){}
  return r;
};

window.dg736ForceRelease=dg736ForceRelease=function(){
  const q=selected736(),a=window.currentAudit520||currentAudit520;
  if(!(q.year>0&&q.month>=1&&q.month<=12)){setMessage('dg520Status','Bitte Jahr und Monat prüfen.','error');return false;}
  if(!a){setMessage('dg520Status','Bitte zuerst „Monat jetzt prüfen“ ausführen.','error');return false;}
  if(typeof d3Form!=='function')return false;
  const count=issueText736(a);
  d3Form('Alles geprüft – trotzdem freigeben',[
    {name:'reason',label:'Grund / interner Prüfvermerk',type:'textarea',required:true}
  ],{reason:'Alle angezeigten Auffälligkeiten wurden geprüft. Monatsabschluss wird bewusst trotz '+count+' freigegeben.'},async v=>{
    const ok=confirm(
      'Monatsabschluss wirklich trotz verbleibender Auffälligkeiten freigeben?\n\n'+
      count+'\n\n'+
      'Diese Entscheidung wird protokolliert.'
    );
    if(!ok)throw new Error('Freigabe abgebrochen.');
    setMessage('dg520Status','Manuelle Freigabe wird gespeichert ...','info');
    const r=await api(chefPayload({
      action:'forceCompletePayrollCycle',
      year:q.year,
      month:q.month,
      reason:String(v.reason||'').trim()
    }));
    currentAudit520=r.audit||a;
    try{renderAudit520(currentAudit520);}catch(_e){}
    setMessage(
      'dg520Status',
      '✓ Monatsabschluss wurde bewusst trotz Auffälligkeiten freigegeben und protokolliert.',
      'ok'
    );
    try{if(typeof d3Dashboard==='function')await d3Dashboard(true);}catch(_e){}
  });
  return false;
};

function stamp736(){
  try{
    document.title='DG Zeiterfassung '+V736;
    document.querySelectorAll('.login-card .muted.small').forEach(x=>{
      if(/^Version\s+/i.test((x.textContent||'').trim()))x.textContent='Version '+V736;
    });
    document.querySelectorAll('.hero strong').forEach(x=>{
      if(/Zeiterfassung/i.test(x.textContent||''))x.textContent='Zeiterfassung - '+V736;
    });
    window.DG_APP_VERSION=V736;window.DG_RELEASE=V736;if(window.DG3)DG3.version=V736;
  }catch(_e){}
}
function install736(){
  stamp736();
  try{if(typeof currentAudit520!=='undefined'&&currentAudit520)decorate736(currentAudit520);}catch(_e){}
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>setTimeout(install736,0),{once:true});else setTimeout(install736,0);
setTimeout(install736,650);
})();
