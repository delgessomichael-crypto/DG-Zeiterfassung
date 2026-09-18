/* DG Zeiterfassung 7.2 - Urlaub/Feiertag-Sperre und Besichtigungszeiten */
(function(){
'use strict';

const V72='7.2';
const q72=id=>document.getElementById(id);
const esc72=v=>String(v==null?'':v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

function stamp72(){
  if(document.title!=='DG Zeiterfassung '+V72)document.title='DG Zeiterfassung '+V72;
  document.querySelectorAll('.login-card .muted.small,#loginScreen .center.muted.small').forEach(x=>{
    if(/^Version\s+/i.test((x.textContent||'').trim())&&x.textContent!=='Version '+V72)x.textContent='Version '+V72;
  });
  document.querySelectorAll('.hero strong,#mainScreen .hero .head-row strong').forEach(x=>{
    if(/Zeiterfassung/i.test(x.textContent||'')&&x.textContent!=='Zeiterfassung - '+V72)x.textContent='Zeiterfassung - '+V72;
  });
  try{window.DG_APP_VERSION=V72;window.DG_RELEASE=V72;if(window.DG3)DG3.version=V72;}catch(_e){}
}

function css72(){
  if(q72('dg72Css'))return;
  const s=document.createElement('style');s.id='dg72Css';
  s.textContent=`
    .dg72-day-lock{margin:12px 0;padding:15px 16px;border-radius:14px;background:#eef2ff;color:#312e81;border:1px solid #c7d2fe;font-weight:800}
    .dg72-day-lock strong{display:block;font-size:18px;margin-bottom:4px}
    .dg72-status-entry{border-left:6px solid #2563eb!important;background:#eff6ff!important}
    .dg72-status-badge{display:inline-flex;align-items:center;padding:3px 8px;border-radius:999px;background:#dbeafe;color:#1e3a8a;font-size:12px;font-weight:900;margin-left:7px}
    .dg72-inspection-note{min-height:120px!important}
    .dg72-report-status{margin:7px 0;padding:7px 9px;border-radius:9px;background:#dbeafe;color:#1e3a8a;font-weight:900}
  `;
  document.head.appendChild(s);
}

/* Urlaub und Feiertag sperren die Eingabe immer - auch bei Chefzugang in der Mitarbeiteransicht. */
window.applyDayStatus=function(status){
  status=String(status||'Arbeiten');
  const blocked=status!=='Arbeiten';
  const work=q72('workEntryCard'),close=q72('dayCloseCard');
  if(work)work.classList.toggle('hidden',blocked);
  if(close)close.classList.toggle('hidden',blocked);
  const old=q72('dg72DayLock');if(old)old.remove();
  if(blocked){
    const h=Number(window.lastDayData&&lastDayData.creditedHours||0);
    const box=document.createElement('div');box.id='dg72DayLock';box.className='dg72-day-lock';
    box.innerHTML='<strong>'+esc72(status)+'</strong>'+
      (h>0?esc72(typeof formatHours==='function'?formatHours(h):h)+' Std. werden automatisch gutgeschrieben. ':'')+
      'Der Tag ist automatisch abgeschlossen. Manuelle Arbeitszeiteingaben sind gesperrt.';
    const msg=q72('dayStatusMessage');if(msg){msg.innerHTML='';msg.appendChild(box);}
  }else if(typeof clearMessage==='function')clearMessage('dayStatusMessage');
};

/* Automatische Urlaub-/Feiertagsgutschrift auch im Tagesbericht sichtbar machen. */
const renderDay72Base=window.renderDay;
if(typeof renderDay72Base==='function')window.renderDay=function(){
  const r=renderDay72Base.apply(this,arguments);
  const rep=(typeof lastDayData!=='undefined'&&lastDayData)?lastDayData.statusReport:null;
  if(rep&&q72('entries')){
    const h=Number(rep.hours||0);
    q72('entries').innerHTML='<div class="entry dg72-status-entry"><strong>'+esc72(rep.status||'Abwesenheit')+
      '</strong><span class="dg72-status-badge">AUTOMATISCH</span><br>'+
      '<strong>'+esc72(typeof formatHours==='function'?formatHours(h):h)+' Std. Gutschrift</strong><br>'+
      '<span class="muted">'+esc72(rep.activity||'Automatische Zeitgutschrift')+'</span><br>'+
      '<span class="muted small">Tag automatisch abgeschlossen · keine manuelle Eingabe erforderlich</span></div>';
  }
  return r;
};

/* Besichtigung: Notiz + Zeitaufwand werden zusammen an das Backend übertragen.
   Die ausgewählte Zeit ist echte Arbeitszeit des ausführenden Mitarbeiters. */
window.dg72InspectionVisit=function(){
  if(typeof canAccessBoss==='function'&&!canAccessBoss()){
    setMessage('entryStatus','Besichtigungstermine können nur mit Chefzugang übertragen werden.','error');return;
  }
  const customer=String(q72('customer')?.value||'').trim();
  if(!customer){setMessage('entryStatus','Bitte mindestens Kunde / Baustelle auswählen oder eintragen.','error');return;}
  const rows=window.__dgCalendarEvents||[];
  const selectedId=(typeof selectedCalendarEventId!=='undefined'?selectedCalendarEventId:'')||'';
  const event=rows.find(e=>String(e.id||'')===String(selectedId))||null;
  const currentText=String(q72('activity')?.value||'').trim();
  const prefill=currentText||String(event&&event.description||'').trim()||'Besichtigungstermin';
  const options=[0.5,1,1.5,2,2.5,3].map(v=>({value:String(v),label:String(v).replace('.',',')+' Std.'}));
  const modal=d3Form('Besichtigungstermin',[
    {name:'hours',label:'Zeitaufwand',type:'select',options:options,required:true},
    {name:'activity',label:'Tätigkeitsnotiz / Besichtigung',type:'textarea',required:true}
  ],{hours:'1',activity:prefill},async v=>{
    const hours=Number(v.hours),activity=String(v.activity||'').trim();
    if(!(hours>0))throw new Error('Bitte einen Zeitaufwand auswählen.');
    if(!activity)throw new Error('Bitte die Tätigkeitsnotiz eintragen.');
    const payload={
      action:'createInspectionOffer',
      employee:auth().employee,
      employeePin:auth().pin,
      item:{
        customer:customer,
        date:q72('date')?.value||localDate(),
        hours:hours,
        activity:activity,
        start:String(q72('start')?.value||''),
        end:String(q72('end')?.value||''),
        vehicleUsed:true,
        sourceCalendarEventId:selectedId,
        event:event?{
          id:event.id||'',title:event.title||'',location:event.location||'',description:event.description||'',
          startDate:event.startDate||'',startTime:event.startTime||'',endDate:event.endDate||'',endTime:event.endTime||'',
          phone:event.phone||'',email:event.email||''
        }:null
      }
    };
    const res=await api(payload);
    if(typeof resetEntry==='function')resetEntry();
    if(typeof loadDay==='function')await loadDay(true);
    if(typeof loadCalendarEvents==='function')await loadCalendarEvents(true);
    setMessage('entryStatus','✓ Besichtigung übertragen. '+(typeof formatHours==='function'?formatHours(hours):hours)+' Std. wurden als Arbeitszeit gebucht; die Tätigkeitsnotiz wurde übernommen.','ok');
    return res;
  });
  const ta=modal&&modal.querySelector('textarea[name="activity"]');if(ta)ta.classList.add('dg72-inspection-note');
};

function wireInspection72(){
  const old=q72('d35InspectionBtn');if(!old)return false;
  if(old.dataset.dg72==='1')return true;
  const b=old.cloneNode(true);b.dataset.dg72='1';
  old.replaceWith(b);
  b.addEventListener('click',e=>{e.preventDefault();e.stopPropagation();window.dg72InspectionVisit();});
  return true;
}

/* Mitarbeiterberichte: Urlaub/Feiertag auf der Tageskarte deutlich kennzeichnen. */
function decorateBossStatusDays72(rows){
  const cards=[...document.querySelectorAll('#dg48DayResult .dg48-day')];let n=0;
  (rows||[]).forEach(emp=>(emp.days||[]).forEach(day=>{
    const card=cards[n++];if(!card||!day||!day.status||!['Urlaub','Feiertag'].includes(String(day.status)))return;
    card.classList.add('dg72-status-entry');
    const strong=card.querySelector(':scope > strong');
    if(strong&&!card.querySelector('.dg72-status-badge'))strong.insertAdjacentHTML('afterend',' <span class="dg72-status-badge">'+esc72(day.status)+'</span>');
    const detail=card.querySelector('.dg49-detail');
    if(detail&&!detail.querySelector('.dg72-report-status')){
      const x=document.createElement('div');x.className='dg72-report-status';
      x.textContent=day.status+' · '+(typeof formatHours==='function'?formatHours(day.hours||0):Number(day.hours||0).toFixed(2))+' Std. automatisch gutgeschrieben';
      detail.prepend(x);
    }
  }));
}
const bossRender72Base=window.renderBossDayClosuresV48;
if(typeof bossRender72Base==='function')window.renderBossDayClosuresV48=function(rows){
  const r=bossRender72Base.apply(this,arguments);decorateBossStatusDays72(rows);return r;
};

function install72(){
  css72();stamp72();wireInspection72();
  if(typeof lastDayData!=='undefined'&&lastDayData&&typeof window.applyDayStatus==='function')window.applyDayStatus(lastDayData.status||'Arbeiten');
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>setTimeout(install72,0),{once:true});else setTimeout(install72,0);
setTimeout(install72,300);
setTimeout(install72,1200);
})();
