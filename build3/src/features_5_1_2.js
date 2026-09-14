/* DG 5.1.2: Büro kann fehlerhafte Tages-/Regieberichtseinträge direkt löschen. */
(function(){
'use strict';
const V512='5.1.2';

function clearDayCaches512(employee,date){
  try{localStorage.removeItem('dg_day_'+employee+'_'+date);}catch(_e){}
  try{localStorage.removeItem('dg51_day_ts_'+employee+'_'+date);}catch(_e){}
  try{localStorage.removeItem('dg51_dashboard');}catch(_e){}
  try{if(window.DG51){DG51.forceDay=true;DG51.forceDashboard=true;}}catch(_e){}
}

window.deleteBossDayEntry512=async function(employee,date,entryId,customer,hours){
  employee=String(employee||'');date=String(date||'');entryId=String(entryId||'');
  if(!entryId)return false;
  const label=(customer||'Ohne Baustellenangabe')+' · '+formatHours(hours||0)+' Std.';
  if(!confirm('Diesen Eintrag wirklich löschen?\n\n'+label+'\n'+formatDateDE(date)+' · '+employee+'\n\nDie Stunden werden aus Tagesstunden, Monatsstunden und den zugehörigen Regieberichten entfernt.'))return false;
  try{
    setMessage('dg48DayStatus','Eintrag wird gelöscht und Stunden werden neu berechnet ...','info');
    const r=await api(chefPayload({action:'deleteBossDayEntry',targetEmployee:employee,date:date,entryId:entryId}));
    clearDayCaches512(employee,date);
    setMessage('dg48DayStatus','✓ Eintrag gelöscht. Tages- und Monatssummen wurden neu berechnet.','ok');
    await loadBossDayClosuresV48();
    const work=[];
    if(typeof window.loadBossMonth==='function')work.push(Promise.resolve().then(()=>window.loadBossMonth()));
    if(typeof window.d3Dashboard==='function')work.push(Promise.resolve().then(()=>window.d3Dashboard(true)));
    await Promise.allSettled(work);
    return r;
  }catch(e){
    setMessage('dg48DayStatus',e&&e.message?e.message:'Eintrag konnte nicht gelöscht werden.','error');
    return false;
  }
};

/* Nach dem bestehenden Renderer direkt an jedem Einzelbericht einen klaren Löschbutton ergänzen. */
const renderClosures512=window.renderBossDayClosuresV48;
if(typeof renderClosures512==='function')window.renderBossDayClosuresV48=function(rows){
  const r=renderClosures512.apply(this,arguments);
  const employeeBoxes=[...document.querySelectorAll('#dg48DayResult .dg48-days-employee')];
  (rows||[]).forEach((emp,ei)=>{
    const box=employeeBoxes[ei];if(!box)return;
    const dayCards=[...box.querySelectorAll(':scope > .dg48-day-grid > .dg48-day')];
    (emp.days||[]).forEach((day,di)=>{
      const card=dayCards[di];if(!card)return;
      const reportEls=[...card.querySelectorAll('.dg49-detail .dg49-report')];
      (day.reports||[]).forEach((rep,ri)=>{
        const report=reportEls[ri];if(!report||!rep||!rep.id||report.querySelector('.dg512-delete-entry'))return;
        const billed=String(rep.billingStatus||'Offen')==='Abgerechnet';
        if(billed){
          const n=document.createElement('div');n.className='muted small';n.style.marginTop='8px';n.textContent='Bereits abgerechnet – Löschen gesperrt.';report.appendChild(n);return;
        }
        const b=document.createElement('button');b.type='button';b.className='btn danger dg512-delete-entry';b.style.marginTop='10px';b.style.width='100%';b.textContent='Fehleintrag löschen';
        b.addEventListener('click',ev=>{ev.preventDefault();ev.stopPropagation();deleteBossDayEntry512(emp.employee,day.date,rep.id,rep.customer,rep.hours);});
        report.appendChild(b);
      });
    });
  });
  return r;
};

/* Performance-Caches nach Büro-Löschung als veraltet markieren. */
const api512=window.api;
if(typeof api512==='function')window.api=api=async function(payload){
  const r=await api512.apply(this,arguments);
  if(payload&&payload.action==='deleteBossDayEntry')clearDayCaches512(payload.targetEmployee,payload.date);
  return r;
};

/* Für diese Funktion muss der passende 5.1.2-Backendstand vorhanden sein. */
window.d3CheckBackend=d3CheckBackend=async function(force){
  const cached=(()=>{try{return JSON.parse(sessionStorage.getItem('dg51_backend')||'null');}catch(_e){return null;}})();
  if(!force&&cached&&cached.version&&Date.now()-Number(cached.ts||0)<1800000){
    const p=String(cached.version).split('.').map(Number),ok=p[0]>5||(p[0]===5&&(p[1]>1||(p[1]===1&&(p[2]||0)>=2)));
    if(ok){DG3.backend=String(cached.version);$('d3Notice')?.remove();return true;}
  }
  try{
    const res=await api({action:'ping'}),found=String(res&&res.version||''),p=found.split('.').map(Number),ok=p[0]>5||(p[0]===5&&(p[1]>1||(p[1]===1&&(p[2]||0)>=2)));
    DG3.backend=ok?found:'';
    if(ok){try{sessionStorage.setItem('dg51_backend',JSON.stringify({ts:Date.now(),version:found}));}catch(_e){}$('d3Notice')?.remove();return true;}
    d3Notice('App 5.1.2 benötigt Google-GS 5.1.2 oder neuer. Gefunden: '+(found||'unbekannt')+'. Speichern ist gesperrt.','warn');return false;
  }catch(e){DG3.backend='';d3Notice('Verbindungsprüfung fehlgeschlagen: '+e.message,'warn');return false;}
};

try{DG3.version=V512;window.DG_APP_VERSION=V512;}catch(_e){}
})();
