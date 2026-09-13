/* DG 3.5.2: unlimited employee photos, Sunday/holiday work hours, chef-only inspection workflow, mandatory day closures only Mon-Fri/non-holiday, offer count and AQON sync fixes. */

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
  const d=new Date();
  const reportsP=api(chefPayload({action:'getRegieReports',status:'Offen',year:0,month:0}));
  const offerOpenP=api(chefPayload({action:'getOfferReports',stage:'Offen'}));
  const offerCreateP=api(chefPayload({action:'getOfferReports',stage:'Zu erstellen'}));
  const daysP=api(chefPayload({action:'getBossDayClosures',year:d.getFullYear(),month:d.getMonth()+1}));
  const remindersP=api(chefPayload({action:'getOfferReminders',includeDone:false}));
  const inquiriesP=api(chefPayload({action:'getCustomerInquiries',status:'Offen'}));
  const safe=async(p,fn,keys)=>{try{fn(await p);}catch(_e){keys.forEach(k=>d3Count(k,'!'));}};
  await Promise.all([
    safe(reportsP,a=>{d3Count('running',a.filter(g=>g.jobStatus==='Laufend').length);d3Count('completed',a.filter(g=>g.jobStatus!=='Laufend').length);},['running','completed']),
    safe(Promise.all([offerOpenP,offerCreateP]),([o,c])=>{DG3.offerCounts={open:o.length,create:c.length};d3Count('offers',o.length+c.length);},['offers']),
    safe(daysP,a=>d3Count('days',a.reduce((n,x)=>n+(x.days||[]).filter(d35MandatoryDayClosure).length,0)),['days']),
    safe(remindersP,a=>d3Count('reminders',a.filter(x=>x.isDue).length),['reminders']),
    safe(inquiriesP,a=>d3Count('inquiries',a.length),['inquiries'])
  ]);
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

function openMain(){
  const a=auth();
  $('loginScreen').classList.add('hidden');
  $('mainScreen').classList.remove('hidden');
  $('employeeLabel').textContent='Angemeldet: '+a.employee;
  $('date').value=localDate();
  const bossAllowed=canAccessBoss();
  $('bossTab').classList.toggle('hidden',!bossAllowed);
  showEmployee();DG3.reports={};DG3.inquiries=[];DG3.orders=[];$('regieResult').replaceChildren();$('d3RunningList').replaceChildren();d3CheckBackend();loadEmployeeDirectory();
  requestAnimationFrame(()=>{if(customerPad)customerPad.resize();if(employeePad)employeePad.resize()});
  updateConnection();loadDay();loadCalendarEvents();setTimeout(d35InstallInspectionButton,0);
}
function showEmployee(){
  $('employeeView').classList.remove('hidden');$('bossView').classList.add('hidden');$('employeeTab').classList.add('active');$('bossTab').classList.remove('active');setTimeout(d35InstallInspectionButton,0);
}

async function d34AqonInquiries(){
  setMessage('d34AqonStatus','AQON PURE Posteingang wird abgeglichen ...','info');
  try{
    const now=Date.now();
    if(!DG3.aqonSyncAt||now-DG3.aqonSyncAt>30000){
      const sync=await api(chefPayload({action:'syncCustomerInquiries'}));DG3.aqonSyncAt=now;
      if(sync.aqonReplyErrors||sync.gmailFileErrors)setMessage('d34AqonStatus','AQON-Abgleich abgeschlossen, aber mit '+Number(sync.aqonReplyErrors||0)+' Antwort- und '+Number(sync.gmailFileErrors||0)+' Gmail-Ablagefehler(n).','warn');
    }
    const all=await api(chefPayload({action:'getCustomerInquiries',status:'Offen'}));DG3.inquiries=all;const rows=all.filter(r=>r.source==='AQON PURE');
    $('d34AqonList').innerHTML=rows.map((r,i)=>d32InquiryCard(r,i,false)).join('')||'Keine offenen AQON PURE Anfragen.';
    setMessage('d34AqonStatus',rows.length+' offene AQON PURE Anfrage(n).','ok');d34SetAqonCount(rows.length);d3Count('inquiries',all.length);
  }catch(e){setMessage('d34AqonStatus','AQON-Abgleich fehlgeschlagen: '+e.message,'error');}
}
