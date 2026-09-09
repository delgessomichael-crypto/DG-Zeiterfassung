(function(){
'use strict';
if(window.__DG_V56_PATCH__)return;window.__DG_V56_PATCH__=true;
const $=id=>document.getElementById(id);
const fmt56=v=>typeof formatHours==='function'?formatHours(v):Number(v||0).toFixed(2).replace('.',',');
function css(){if($('dg56css'))return;const s=document.createElement('style');s.id='dg56css';s.textContent=`
#dg55AfterClose .btn{background:#b91c1c!important;color:#fff!important;border-color:#b91c1c!important}
.dg56-update-btn{background:#166534!important;color:#fff!important}
.dg56-needs-refresh{border:2px solid #f59e0b;border-radius:12px;padding:10px;margin:10px 0;background:#fff7ed;color:#9a3412;font-weight:800}
`;document.head.appendChild(s)}
function dayUpdateButton(){return [...document.querySelectorAll('#employeeView button.btn')].find(b=>(b.textContent||'').trim()==='Tag aktualisieren')||null}
function ensureUpdateStatus(){const b=dayUpdateButton();if(!b)return null;let st=$('dg56DayUpdateStatus');if(!st){st=document.createElement('div');st.id='dg56DayUpdateStatus';b.insertAdjacentElement('afterend',st)}return st}
function styleUi(){
  const supp=$('#dg55AfterClose button');
  if(supp){supp.classList.remove('secondary','success','primary');supp.classList.add('danger')}
  const b=dayUpdateButton();
  if(b){b.classList.remove('secondary','primary','danger');b.classList.add('success','dg56-update-btn');b.setAttribute('onclick','dg56UpdateDay()')}
  const old=document.querySelectorAll('#workEntryCard .dg54-local-status');old.forEach(x=>{const entry=$('entryStatus');if(entry&&x.textContent.trim()===entry.textContent.trim())x.remove()});
  const st=ensureUpdateStatus();
  if(st&&typeof lastDayData!=='undefined'&&lastDayData&&lastDayData.closed&&lastDayData.closureNeedsRefresh){st.className='dg56-needs-refresh';st.textContent='Nachtrag gespeichert. Bitte „Tag aktualisieren“ drücken, damit der Tagesabschluss mit den neuen Stunden abschließend neu berechnet wird.'}
}
window.dg56UpdateDay=async function(){
  const b=dayUpdateButton(),st=ensureUpdateStatus(),a=typeof auth==='function'?auth():{};
  if(!a.employee||!a.pin){if(st){st.className='status error';st.textContent='Anmeldung fehlt.'}return}
  try{
    if(b)b.disabled=true;
    if(st){st.className='status info';st.textContent=(typeof lastDayData!=='undefined'&&lastDayData&&lastDayData.closed&&lastDayData.closureNeedsRefresh)?'Tagesabschluss wird nach dem Nachtrag aktualisiert …':'Tag wird aktualisiert …'}
    if(typeof lastDayData!=='undefined'&&lastDayData&&lastDayData.closed&&lastDayData.closureNeedsRefresh){
      const res=await api({action:'refreshClosedDay',employee:a.employee,pin:a.pin,date:$('date').value});
      lastDayData=res;localStorage.setItem('dg_day_'+a.employee+'_'+$('date').value,JSON.stringify(lastDayData));renderDay();
      if(st){st.className='status ok';st.textContent='✅ Tagesabschluss aktualisiert. Nachtrag und neue Tagessumme sind vollständig ans Büro übertragen.'}
    }else{
      await loadDay();if(st){st.className='status ok';st.textContent='✅ Tag aktualisiert.'}
    }
  }catch(e){if(st){st.className='status error';st.textContent='Aktualisierung nicht möglich: '+(e&&e.message?e.message:'Unbekannter Fehler.')}}finally{if(b)b.disabled=false;styleUi()}
};
const oldSave=window.saveEntry;
if(typeof oldSave==='function')window.saveEntry=async function(){
  const before=(typeof lastDayData!=='undefined'&&lastDayData)?String(lastDayData.latestSupplementAt||''):'';
  const r=await oldSave.apply(this,arguments);
  if(typeof lastDayData!=='undefined'&&lastDayData&&lastDayData.supplementSaved){
    setMessage('entryStatus','✅ Nachtrag erfolgreich hinzugefügt. Im Chefbereich wurde ein neuer Regiebericht angelegt. Bitte jetzt „Tag aktualisieren“ drücken, damit der Tagesabschluss abschließend neu berechnet wird.','ok');
    const st=ensureUpdateStatus();if(st){st.className='dg56-needs-refresh';st.textContent='Bitte Tagesabschluss abschließend aktualisieren: „Tag aktualisieren“ drücken.'}
  }else if(typeof lastDayData!=='undefined'&&lastDayData&&lastDayData.closureNeedsRefresh&&String(lastDayData.latestSupplementAt||'')!==before){
    setMessage('entryStatus','✅ Nachtrag gespeichert. Bitte jetzt „Tag aktualisieren“ drücken, damit der Tagesabschluss neu berechnet wird.','ok');
  }
  styleUi();return r;
};
const oldRender=window.renderDay;
if(typeof oldRender==='function')window.renderDay=function(){const r=oldRender.apply(this,arguments);const day=$('dayTotal');if(day&&typeof lastDayData!=='undefined'&&lastDayData){day.className='day-balance good';day.textContent='Heute: '+fmt56(lastDayData.total||0)+' Std.'}setTimeout(styleUi,0);return r};
const oldSet=window.setMessage;
if(typeof oldSet==='function')window.setMessage=function(id,msg,type){const r=oldSet.apply(this,arguments);if(id==='entryStatus'){setTimeout(()=>{document.querySelectorAll('#workEntryCard .dg54-local-status').forEach(x=>{const e=$('entryStatus');if(e&&x.textContent.trim()===e.textContent.trim())x.remove()})},0)}return r};
css();setTimeout(styleUi,0);document.title='DG Zeiterfassung v56';const lv=document.querySelector('.login-card .center.muted.small');if(lv)lv.textContent='Version 56';const hv=document.querySelector('.hero .head-row strong');if(hv)hv.textContent='Zeiterfassung · v56';
})();