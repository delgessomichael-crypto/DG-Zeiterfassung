/* DG 3.5: unlimited employee photos, Sunday/holiday weekly hours, chef-only inspection workflow. */

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

function d35InstallInspectionButton(){
  const save=[...document.querySelectorAll('#employeeView button')].find(b=>b.textContent.trim()==='Eintrag speichern');
  if(!save)return;
  let b=$('d35InspectionBtn');
  if(!canAccessBoss()){b?.remove();return;}
  if(b)return;
  b=document.createElement('button');b.type='button';b.id='d35InspectionBtn';b.className='btn success d35-inspection';b.textContent='Besichtigungstermin';
  b.addEventListener('click',d35InspectionVisit);save.insertAdjacentElement('afterend',b);
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
window.addEventListener('load',()=>setTimeout(d35InstallInspectionButton,250));
