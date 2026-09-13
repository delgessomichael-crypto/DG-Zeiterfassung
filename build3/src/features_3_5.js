/* DG 3.5.1: unlimited employee photos, Sunday/holiday work hours, chef-only inspection workflow, mandatory day closures only Mon-Fri/non-holiday. */

function updatePhotoStatus(){
  if(!$('photoStatus'))return;
  $('photoStatus').textContent=preparedPhotos.length?preparedPhotos.length+' Bild(er) bereit. Bitte Vorschau kontrollieren.':'Noch keine Bilder hinzugefügt.';
  $('clearPhotosBtn')?.classList.toggle('hidden',preparedPhotos.length===0);
  renderPhotoPreview();
}
async function startCamera(){
  if(!navigator.mediaDevices||!navigator.mediaDevices.getUserMedia){$('cameraPhoto')?.click();return;}
  try{stopCamera();cameraStream=await navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:'environment'}},audio:false});$('cameraVideo').srcObject=cameraStream;$('cameraLive').classList.remove('hidden');}
  catch(_e){$('cameraPhoto')?.click();}
}
function captureCameraPhoto(){
  if(!cameraStream)return;
  const v=$('cameraVideo');if(!v.videoWidth||!v.videoHeight)return;
  const max=1200,f=Math.min(1,max/v.videoWidth,max/v.videoHeight),c=document.createElement('canvas');c.width=Math.round(v.videoWidth*f);c.height=Math.round(v.videoHeight*f);c.getContext('2d').drawImage(v,0,0,c.width,c.height);preparedPhotos.push({dataUrl:c.toDataURL('image/jpeg',0.68)});updatePhotoStatus();
}
async function addPhotos(files,inputId){
  const list=Array.from(files||[]);if(!list.length)return;$('photoStatus').textContent='Bilder werden vorbereitet ...';
  try{for(const f of list)preparedPhotos.push({dataUrl:await resizeImage(f)});updatePhotoStatus();}
  catch(_e){$('photoStatus').textContent='Mindestens ein Bild konnte nicht vorbereitet werden.';}
  if($(inputId))$(inputId).value='';
}

async function refreshWeek(){
  let box=$('dg54WeekHours');const monthBox=$('employeeTimeBank');if(!monthBox)return;
  if(!box){box=document.createElement('div');box.id='dg54WeekHours';box.className='dg54-week';monthBox.insertAdjacentElement('beforebegin',box);}
  if(!navigator.onLine){box.innerHTML='Geleistete Wochenstunden: offline nicht verfügbar';return;}
  const a=auth();if(!a.employee||!a.pin)return;
  try{
    box.innerHTML='Geleistete Wochenstunden: werden geladen …';
    const d=await api({action:'getWeekData',employee:a.employee,pin:a.pin,referenceDate:isoToday()});
    box.innerHTML='Geleistete Wochenstunden: '+fmt(d.total||0)+' Std.<small>Woche '+deDate(d.start)+' bis '+deDate(d.end)+' · Montag bis Sonntag · tatsächliche Einsätze an Sonn- und Feiertagen werden mitgerechnet</small>';
  }catch(_e){box.innerHTML='Geleistete Wochenstunden: nicht verfügbar';}
}

function d35MandatoryDayClosure(day){
  if(!day||day.closed)return false;
  const raw=String(day.date||'').trim();
  if(raw){
    const dt=new Date(raw+'T12:00:00');
    if(!Number.isNaN(dt.getTime())){const w=dt.getDay();if(w===0||w===6)return false;}
  }
  const status=[day.status,day.dayStatus,day.absenceStatus,day.type,day.reason,day.note].filter(Boolean).join(' ').toLowerCase();
  if(status.includes('feiertag')||status.includes('holiday'))return false;
  return true;
}

async function d3Dashboard(){
  if(!canAccessBoss()||!navigator.onLine)return;
  const d=new Date(),jobs=[['reports',{action:'getRegieReports',status:'Offen',year:0,month:0}],['offers',{action:'getOfferReports',stage:'Offen'}],['days',{action:'getBossDayClosures',year:d.getFullYear(),month:d.getMonth()+1}],['reminders',{action:'getOfferReminders',includeDone:false}],['inquiries',{action:'getCustomerInquiries',status:'Offen'}]];
  await Promise.all(jobs.map(async([k,p])=>{try{
    const a=await api(chefPayload(p));
    if(k==='reports'){
      d3Count('running',a.filter(g=>g.jobStatus==='Laufend').length);
      d3Count('completed',a.filter(g=>g.jobStatus!=='Laufend').length);
    }else if(k==='days'){
      d3Count('days',a.reduce((n,x)=>n+(x.days||[]).filter(d35MandatoryDayClosure).length,0));
    }else d3Count(k,k==='reminders'?a.filter(x=>x.isDue).length:a.length);
  }catch(_e){if(k==='reports'){d3Count('running','!');d3Count('completed','!');}else d3Count(k,'!');}}));
}

const d35BaseRenderBossDayClosures=window.renderBossDayClosuresV48;
window.renderBossDayClosuresV48=function(rows){
  const filtered=(rows||[]).map(emp=>({...emp,days:(emp.days||[]).filter(d=>d.closed||d35MandatoryDayClosure(d))})).filter(emp=>(emp.days||[]).length);
  return d35BaseRenderBossDayClosures?d35BaseRenderBossDayClosures(filtered):undefined;
};

function d35InstallInspectionButton(){
  const save=[...document.querySelectorAll('#employeeView button')].find(b=>b.textContent.trim()==='Eintrag speichern');
  if(!save)return;
  let b=$('d35InspectionBtn');
  if(!canAccessBoss()){b?.remove();return;}
  if(!b){
    b=document.createElement('button');b.type='button';b.id='d35InspectionBtn';b.className='btn success d35-inspection';b.textContent='Besichtigungstermin';
    b.addEventListener('click',d35InspectionVisit);
  }
  if(b.previousElementSibling!==save)save.insertAdjacentElement('afterend',b);
}
function d35SelectedCalendarEvent(){
  const rows=window.__dgCalendarEvents||[];return rows.find(e=>String(e.id||'')===String(selectedCalendarEventId||''))||null;
}
function d35InspectionVisit(){
  if(!canAccessBoss()){setMessage('entryStatus','Besichtigungstermine können nur mit Chefzugang übertragen werden.','error');return;}
  const customer=String($('customer')?.value||'').trim();if(!customer){setMessage('entryStatus','Bitte mindestens Kunde / Baustelle auswählen oder eintragen.','error');return;}
  const options=[0.5,1,1.5,2,2.5,3].map(v=>({value:String(v),label:String(v).replace('.',',')+' Std.'}));
  d3Form('Besichtigungstermin',[{name:'hours',label:'Zeitaufwand',type:'select',options}],{hours:'1'},async v=>{
    const event=d35SelectedCalendarEvent();
    const payload={action:'createInspectionOffer',employee:auth().employee,employeePin:auth().pin,item:{customer,date:$('date')?.value||localDate(),hours:Number(v.hours),vehicleUsed:true,sourceCalendarEventId:selectedCalendarEventId||'',event:event?{title:event.title||'',location:event.location||'',description:event.description||'',startDate:event.startDate||'',startTime:event.startTime||'',endDate:event.endDate||'',endTime:event.endTime||'',phone:event.phone||'',email:event.email||''}:null}};
    const r=await api(payload);resetEntry();await loadCalendarEvents();setMessage('entryStatus','✓ Besichtigung als offenes Angebot übertragen. Zeitaufwand '+formatHours(v.hours)+' Std. · Fahrzeugeinsatz Ja.','ok');return r;
  });
}

const d35BaseOpenMain=openMain;
openMain=function(){const r=d35BaseOpenMain.apply(this,arguments);setTimeout(d35InstallInspectionButton,0);return r;};
const d35BaseShowEmployee=showEmployee;
showEmployee=function(){const r=d35BaseShowEmployee.apply(this,arguments);setTimeout(d35InstallInspectionButton,0);return r;};
window.addEventListener('load',()=>setTimeout(d35InstallInspectionButton,250));
