/* DG App 10 - employee inspection request */
(function(){
'use strict';

const V='20260925-2005-inspection-live-camera4';
const $=id=>document.getElementById(id);
const esc=v=>String(v==null?'':v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let inspectionPhotos=[],inspectionCameraStream=null;

function chefAllowed(){
  // Erst aktiv, wenn die Mitarbeiteransicht wirklich geöffnet wurde.
  try{
    const employee=String(localStorage.getItem('dg_employee')||'').trim();
    const main=document.getElementById('mainScreen');
    return !!(employee&&main&&!main.classList.contains('hidden'));
  }catch(_e){return false;}
}
function apiPayload(extra){
  const employee=localStorage.getItem('dg_employee')||'';
  const pin=localStorage.getItem('dg_device_session')||sessionStorage.getItem('dg_employee_pin')||'';
  return Object.assign({employee,employeePin:pin},extra||{});
}
function notice(msg,type){
  const e=$('inspectionQuickStatus');
  if(!e)return;
  e.className='status '+(type||'info');
  e.textContent=msg||'';
}
function parseContactText(text){
  text=String(text||'');
  const emailMatch=text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
  const email=emailMatch?emailMatch[0]:'';
  const phoneRe=/(?:\+49|0)[0-9][0-9 \-/()]{5,}/g;
  const phones=[];
  let m;
  while((m=phoneRe.exec(text))&&phones.length<2)phones.push(String(m[0]||'').trim());
  return {email,phone1:phones[0]||'',phone2:phones[1]||''};
}
function parseAddress(location){
  const s=String(location||'').trim();
  const m=s.match(/^(.*?)(?:,\s*)?(\d{5})\s+([^,]+?)(?:,\s*Deutschland)?$/i);
  if(m)return {street:m[1].trim(),postalCode:m[2],city:m[3].trim()};
  return {street:s,postalCode:'',city:''};
}
function splitName(title){
  let t=String(title||'').trim();
  t=t.replace(/^(?:Besichtigung|Termin|Kundentermin|Auftrag)\s*[-:·]\s*/i,'').trim();
  const firstPart=t.split(/\s+-\s+|,\s*(?=\d{5}\b)/)[0].trim();
  if(!firstPart)return {firstName:'',lastName:''};
  if(firstPart.includes(',')){
    const p=firstPart.split(',').map(x=>x.trim()).filter(Boolean);
    return {lastName:p[0]||'',firstName:p.slice(1).join(' ')};
  }
  const p=firstPart.split(/\s+/).filter(Boolean);
  if(p.length===1)return {firstName:'',lastName:p[0]};
  return {firstName:p.slice(0,-1).join(' '),lastName:p[p.length-1]};
}
function currentCalendarEvents(){
  return Array.isArray(window.__dgCalendarEvents)?window.__dgCalendarEvents:[];
}
function selectedCalendarEvent(){
  const id=typeof window.selectedCalendarEventId!=='undefined'?String(window.selectedCalendarEventId||''):'';
  return currentCalendarEvents().find(e=>String(e&&e.id||'')===id)||null;
}
function eventLabel(e){
  const d=[e.startDate||'',e.startTime||''].filter(Boolean).join(' ');
  return [d,e.title||e.customer||'',e.location||''].filter(Boolean).join(' · ');
}
function localDateIso(){
  const d=new Date(),y=d.getFullYear(),m=String(d.getMonth()+1).padStart(2,'0'),day=String(d.getDate()).padStart(2,'0');
  return y+'-'+m+'-'+day;
}
function timeMinutes(v){
  const m=String(v||'').match(/^(\d{1,2}):(\d{2})$/);
  if(!m)return null;
  const h=Number(m[1]),min=Number(m[2]);
  return h>=0&&h<=23&&min>=0&&min<=59?h*60+min:null;
}
function updateTimeHours(){
  const start=timeMinutes($('inspectionTimeStart')?.value),end=timeMinutes($('inspectionTimeEnd')?.value);
  const out=$('inspectionTimeHours');
  const hours=start!==null&&end!==null&&end>start?Math.round(((end-start)/60)*100)/100:0;
  if(out)out.value=hours>0?hours.toFixed(2).replace('.',','):'';
  return hours;
}
function timeCaptureActive(){
  const p=$('inspectionTimePanel');
  return !!(p&&!p.classList.contains('hidden'));
}
function toggleTimeCapture(){
  const p=$('inspectionTimePanel'),b=$('inspectionTimeBtn');if(!p||!b)return;
  const enable=p.classList.contains('hidden');
  p.classList.toggle('hidden',!enable);
  b.textContent=enable?'Zeit erfassen aktiv':'Zeit erfassen';
  if(enable){
    if(!$('inspectionTimeDate').value)$('inspectionTimeDate').value=localDateIso();
    const ev=selectedCalendarEvent();if(ev)fillFromEvent(ev,false);
    updateTimeHours();
  }
}
function fillFromEvent(e,overwrite){
  if(!e)return;
  const text=[e.title,e.description,e.location].filter(Boolean).join('\n');
  const contact=parseContactText(text);
  const addr=parseAddress(e.location||'');
  const nm=splitName(e.customer||e.title||'');
  const set=(id,val)=>{
    const x=$(id);if(!x||!val)return;
    if(overwrite||!String(x.value||'').trim())x.value=val;
  };
  set('inspectionLastName',nm.lastName);
  set('inspectionFirstName',nm.firstName);
  set('inspectionStreet',addr.street);
  set('inspectionPostalCode',addr.postalCode);
  set('inspectionCity',addr.city);
  set('inspectionEmail',String(e.email||contact.email||''));
  set('inspectionMobile',String(e.mobile||e.phone||contact.phone1||''));
  set('inspectionLandline',String(e.landline||contact.phone2||''));
  set('inspectionDescription',String(e.description||''));
  set('inspectionTimeDate',String(e.startDate||''));
  set('inspectionTimeStart',String(e.startTime||'').slice(0,5));
  set('inspectionTimeEnd',String(e.endTime||'').slice(0,5));
  updateTimeHours();
  const hidden=$('inspectionCalendarEventId');if(hidden)hidden.value=String(e.id||'');
}
function renderCalendarSelect(){
  const sel=$('inspectionCalendarSelect');if(!sel)return;
  const rows=currentCalendarEvents();
  sel.innerHTML='<option value="">Keine Kalenderdaten übernehmen</option>'+rows.map((e,i)=>'<option value="'+i+'">'+esc(eventLabel(e))+'</option>').join('');
  const current=selectedCalendarEvent();
  if(current){
    const idx=rows.findIndex(e=>String(e&&e.id||'')===String(current.id||''));
    if(idx>=0){sel.value=String(idx);fillFromEvent(current,false);}
  }
}
function renderInspectionPhotos(){
  const box=$('inspectionPhotoPreview'),st=$('inspectionPhotoStatus');if(!box)return;
  box.innerHTML=inspectionPhotos.map((p,i)=>'<div style="position:relative;border:1px solid #d1d5db;border-radius:12px;overflow:hidden;background:#fff"><img src="'+esc(p.dataUrl)+'" alt="Besichtigungsbild '+(i+1)+'" style="display:block;width:100%;height:110px;object-fit:cover"><button type="button" data-inspection-photo-remove="'+i+'" style="position:absolute;top:5px;right:5px;border:0;border-radius:999px;width:30px;height:30px;background:#b91c1c;color:#fff;font-weight:900">×</button></div>').join('');
  if(st)st.textContent=inspectionPhotos.length?inspectionPhotos.length+' Bild(er) angehängt.':'Noch keine Bilder angehängt.';
}
function resizeInspectionImage(file){
  return new Promise((resolve,reject)=>{
    const r=new FileReader();r.onerror=reject;r.onload=()=>{
      const img=new Image();img.onerror=reject;img.onload=()=>{
        const max=1200;let w=img.width,h=img.height;
        if(w>max||h>max){const f=Math.min(max/w,max/h);w=Math.round(w*f);h=Math.round(h*f);}
        const cv=document.createElement('canvas');cv.width=w;cv.height=h;cv.getContext('2d').drawImage(img,0,0,w,h);
        resolve(cv.toDataURL('image/jpeg',0.7));
      };img.src=r.result;
    };r.readAsDataURL(file);
  });
}
async function addInspectionPhotos(files){
  const list=Array.from(files||[]);if(!list.length)return;
  try{
    for(const file of list)inspectionPhotos.push({dataUrl:await resizeInspectionImage(file),name:file.name||'Besichtigungsbild.jpg'});
    renderInspectionPhotos();
  }catch(e){notice('Mindestens ein Bild konnte nicht vorbereitet werden.','warn');}
  if($('inspectionCameraInput'))$('inspectionCameraInput').value='';
  if($('inspectionGalleryInput'))$('inspectionGalleryInput').value='';
}
async function startInspectionCamera(){
  const live=$('inspectionCameraLive'),video=$('inspectionCameraVideo');
  if(!navigator.mediaDevices||!navigator.mediaDevices.getUserMedia){
    $('inspectionCameraInput')?.click();return;
  }
  try{
    stopInspectionCamera();
    inspectionCameraStream=await navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:'environment'}},audio:false});
    if(video)video.srcObject=inspectionCameraStream;
    live?.classList.remove('hidden');
    $('inspectionCameraBtn').textContent='📷 Kamera läuft';
  }catch(_e){
    $('inspectionCameraInput')?.click();
  }
}
function stopInspectionCamera(){
  if(inspectionCameraStream){inspectionCameraStream.getTracks().forEach(t=>t.stop());inspectionCameraStream=null;}
  const video=$('inspectionCameraVideo');if(video)video.srcObject=null;
  $('inspectionCameraLive')?.classList.add('hidden');
  const b=$('inspectionCameraBtn');if(b)b.textContent='📷 Kamera starten';
}
function captureInspectionPhoto(){
  const v=$('inspectionCameraVideo');if(!inspectionCameraStream||!v||!v.videoWidth||!v.videoHeight)return;
  const max=1200,scale=Math.min(1,max/v.videoWidth,max/v.videoHeight),cv=document.createElement('canvas');
  cv.width=Math.round(v.videoWidth*scale);cv.height=Math.round(v.videoHeight*scale);
  cv.getContext('2d').drawImage(v,0,0,cv.width,cv.height);
  inspectionPhotos.push({dataUrl:cv.toDataURL('image/jpeg',0.7),name:'Besichtigungsbild_'+String(inspectionPhotos.length+1).padStart(2,'0')+'.jpg'});
  renderInspectionPhotos();
}
function clearForm(){
  ['inspectionLastName','inspectionFirstName','inspectionStreet','inspectionPostalCode','inspectionCity','inspectionEmail','inspectionMobile','inspectionLandline','inspectionDescription','inspectionCalendarEventId','inspectionTimeDate','inspectionTimeStart','inspectionTimeEnd','inspectionTimeHours'].forEach(id=>{if($(id))$(id).value='';});
  if($('inspectionCalendarSelect'))$('inspectionCalendarSelect').value='';
  const p=$('inspectionTimePanel');if(p)p.classList.add('hidden');
  const b=$('inspectionTimeBtn');if(b)b.textContent='Zeit erfassen';
  inspectionPhotos=[];renderInspectionPhotos();
  notice('','info');
}
function closeModal(){
  const m=$('inspectionQuickModal');if(m)m.classList.add('hidden');
  stopSpeech();stopInspectionCamera();
}
function openModal(){
  if(!chefAllowed())return;
  const m=$('inspectionQuickModal');if(!m)return;
  clearForm();renderCalendarSelect();
  const current=selectedCalendarEvent();if(current)fillFromEvent(current,false);
  m.classList.remove('hidden');
  setTimeout(()=>$('inspectionLastName')?.focus(),50);
}

let recognition=null,speechActive=false;
function speechSupported(){
  return !!(window.SpeechRecognition||window.webkitSpeechRecognition);
}
function stopSpeech(){
  speechActive=false;
  try{recognition&&recognition.stop();}catch(_e){}
  recognition=null;
  const b=$('inspectionSpeechBtn');if(b)b.textContent='🎤 Spracheingabe';
}
function toggleSpeech(){
  if(speechActive){stopSpeech();return;}
  const SR=window.SpeechRecognition||window.webkitSpeechRecognition;
  if(!SR){
    notice('Spracheingabe wird von diesem Browser nicht unterstützt.','warn');
    return;
  }
  recognition=new SR();
  recognition.lang='de-DE';
  recognition.continuous=true;
  // Nur bestätigte Ergebnisse übernehmen. Android/Samsung liefert Zwischenresultate
  // mehrfach; diese dürfen nicht dauerhaft in den Text geschrieben werden.
  recognition.interimResults=false;
  const initial=String($('inspectionDescription')?.value||'').trimEnd();
  const sessionBase=initial?initial+'\n\n- ':'- ';
  const committed=new Map();
  recognition.onstart=()=>{speechActive=true;const ta=$('inspectionDescription');if(ta){ta.value=sessionBase;ta.dispatchEvent(new Event('input',{bubbles:true}));}if($('inspectionSpeechBtn'))$('inspectionSpeechBtn').textContent='⏹ Spracheingabe stoppen';notice('Spracheingabe läuft – neuer Sprachblock als Stichpunkt.','info');};
  recognition.onresult=ev=>{
    for(let i=ev.resultIndex;i<ev.results.length;i++){
      if(!ev.results[i].isFinal)continue;
      const t=String(ev.results[i][0].transcript||'').replace(/\s+/g,' ').trim();
      if(t)committed.set(i,t);
    }
    const spoken=[...committed.keys()].sort((a,b)=>a-b).map(i=>committed.get(i)).filter(Boolean).join(' ');
    const ta=$('inspectionDescription');
    if(ta){ta.value=sessionBase+spoken;ta.dispatchEvent(new Event('input',{bubbles:true}));}
  };
  recognition.onerror=ev=>{notice('Spracheingabe: '+String(ev.error||'Fehler'),'warn');stopSpeech();};
  recognition.onend=()=>{speechActive=false;recognition=null;const b=$('inspectionSpeechBtn');if(b)b.textContent='🎤 Spracheingabe';};
  recognition.start();
}
async function submit(){
  if(!chefAllowed()){notice('Bitte erneut als Mitarbeiter anmelden.','error');return;}
  const item={
    lastName:String($('inspectionLastName')?.value||'').trim(),
    firstName:String($('inspectionFirstName')?.value||'').trim(),
    street:String($('inspectionStreet')?.value||'').trim(),
    postalCode:String($('inspectionPostalCode')?.value||'').trim(),
    city:String($('inspectionCity')?.value||'').trim(),
    email:String($('inspectionEmail')?.value||'').trim(),
    mobile:String($('inspectionMobile')?.value||'').trim(),
    landline:String($('inspectionLandline')?.value||'').trim(),
    description:String($('inspectionDescription')?.value||'').trim(),
    calendarEventId:String($('inspectionCalendarEventId')?.value||'').trim(),
    captureTime:timeCaptureActive(),
    timeDate:String($('inspectionTimeDate')?.value||'').trim(),
    timeStart:String($('inspectionTimeStart')?.value||'').trim(),
    timeEnd:String($('inspectionTimeEnd')?.value||'').trim(),
    timeHours:updateTimeHours(),
    photos:inspectionPhotos.slice()
  };
  if(!item.lastName&&!item.firstName){notice('Bitte Name oder Vorname eintragen.','error');$('inspectionLastName')?.focus();return;}
  if(!item.description){notice('Bitte Auftragsbeschreibung eintragen.','error');$('inspectionDescription')?.focus();return;}
  if(item.captureTime){
    if(!item.timeDate){notice('Bitte Datum für die Zeiterfassung eintragen.','error');$('inspectionTimeDate')?.focus();return;}
    if(!(item.timeHours>0)){notice('Bitte gültige Von-/Bis-Zeit für die Zeiterfassung eintragen.','error');$('inspectionTimeStart')?.focus();return;}
  }
  const btn=$('inspectionSubmitBtn');
  if(btn){btn.disabled=true;btn.textContent='Wird übertragen …';}
  stopSpeech();
  try{
    const fn=typeof window.api==='function'?window.api:null;
    if(!fn)throw new Error('API ist noch nicht bereit.');
    const r=await fn(apiPayload({action:'createEmployeeInspectionRequestV10',item}));
    notice(item.captureTime
      ?'✅ Besichtigung übertragen. '+String(item.timeHours).replace('.',',')+' Std. wurden zusätzlich als Arbeitszeit erfasst.'
      :'✅ Besichtigung wurde an das Büro übertragen und steht unter „Angebote zu erstellen“.','ok');
    if(item.calendarEventId){
      try{
        if(typeof window.removeCalendarEventLocally==='function')window.removeCalendarEventLocally(item.calendarEventId);
        else if(Array.isArray(window.__dgCalendarEvents)){
          window.__dgCalendarEvents=window.__dgCalendarEvents.filter(e=>String(e&&e.id||'')!==item.calendarEventId);
        }
      }catch(_e){}
    }
    if(typeof window.dg60RefreshOfferCounts==='function')window.dg60RefreshOfferCounts(true).catch(()=>{});
    if(item.captureTime&&typeof window.loadDay==='function')window.loadDay().catch(()=>{});
    if(typeof window.loadCalendarEvents==='function')window.loadCalendarEvents().catch(()=>{});
    setTimeout(()=>{closeModal();clearForm();},1400);
    return r;
  }catch(e){
    notice('❌ Übertragung fehlgeschlagen: '+String(e&&e.message||e),'error');
  }finally{
    if(btn){btn.disabled=false;btn.textContent='Übertragen';}
  }
}
function buildModal(){
  if($('inspectionQuickModal'))return;
  const m=document.createElement('div');
  m.id='inspectionQuickModal';m.className='hidden inspection-quick-modal';
  m.innerHTML=`
    <div class="inspection-quick-panel">
      <div class="inspection-quick-head"><h2>Besichtigungstermin</h2><button type="button" class="btn secondary" id="inspectionCloseBtn">Schließen</button></div>
      <label>Kalenderdaten übernehmen</label>
      <select id="inspectionCalendarSelect"><option value="">Keine Kalenderdaten übernehmen</option></select>
      <input type="hidden" id="inspectionCalendarEventId">
      <div class="grid2"><div><label>Name</label><input id="inspectionLastName"></div><div><label>Vorname</label><input id="inspectionFirstName"></div></div>
      <label>Straße</label><input id="inspectionStreet">
      <div class="grid2"><div><label>PLZ</label><input id="inspectionPostalCode" inputmode="numeric" maxlength="5"></div><div><label>Ort</label><input id="inspectionCity"></div></div>
      <label>E-Mail-Adresse</label><input id="inspectionEmail" type="email">
      <div class="grid2"><div><label>Telefon Mobil</label><input id="inspectionMobile" type="tel"></div><div><label>Telefon Festnetz</label><input id="inspectionLandline" type="tel"></div></div>
      <label>Auftragsbeschreibung</label>
      <textarea id="inspectionDescription" class="inspection-description" placeholder="Auftragsbeschreibung einsprechen oder eintippen"></textarea>
      <button type="button" class="btn secondary" id="inspectionSpeechBtn" style="width:100%;margin-top:8px">🎤 Spracheingabe</button>
      <div style="margin-top:14px;padding:12px;border:1px solid #d7dee8;border-radius:12px;background:#f8fafc">
        <strong>📷 Bilder zur Besichtigung</strong>
        <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:9px">
          <button type="button" class="btn primary" id="inspectionCameraBtn">📷 Kamera starten</button>
          <button type="button" class="btn secondary" id="inspectionGalleryBtn">🖼️ Vorhandene Bilder</button>
        </div>
        <div id="inspectionCameraLive" class="hidden" style="margin-top:10px">
          <video id="inspectionCameraVideo" autoplay muted playsinline style="width:100%;max-height:360px;object-fit:cover;border-radius:12px;background:#111"></video>
          <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:8px">
            <button type="button" class="btn success" id="inspectionCaptureBtn">📸 Foto aufnehmen</button>
            <button type="button" class="btn secondary" id="inspectionCameraCloseBtn">Kamera schließen</button>
          </div>
        </div>
        <input id="inspectionCameraInput" type="file" accept="image/*" capture="environment" class="hidden">
        <input id="inspectionGalleryInput" type="file" accept="image/*" multiple class="hidden">
        <div id="inspectionPhotoStatus" class="muted small" style="margin-top:8px">Noch keine Bilder angehängt.</div>
        <div id="inspectionPhotoPreview" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(110px,1fr));gap:8px;margin-top:8px"></div>
      </div>
      <button type="button" class="btn danger" id="inspectionTimeBtn" style="width:100%;margin-top:14px">Zeit erfassen</button>
      <div id="inspectionTimePanel" class="hidden" style="margin-top:10px;padding:10px;border:1px solid #cbd5e1;border-radius:10px">
        <div class="grid2"><div><label>Datum</label><input id="inspectionTimeDate" type="date"></div><div><label>Stunden</label><input id="inspectionTimeHours" readonly></div></div>
        <div class="grid2"><div><label>Von</label><input id="inspectionTimeStart" type="time"></div><div><label>Bis</label><input id="inspectionTimeEnd" type="time"></div></div>
        <div class="muted small">Optional. Die erfasste Zeit erscheint bei „Einträge des Tages“ und fließt mit der hinterlegten automatischen Pausenregel in Stundenkonto und Monatsabrechnung ein.</div>
      </div>
      <button type="button" class="btn success" id="inspectionSubmitBtn" style="width:100%;margin-top:14px">Übertragen</button>
      <div id="inspectionQuickStatus"></div>
    </div>`;
  document.body.appendChild(m);
  $('inspectionCloseBtn').addEventListener('click',closeModal);
  $('inspectionSpeechBtn').addEventListener('click',toggleSpeech);
  $('inspectionCameraBtn').addEventListener('click',startInspectionCamera);
  $('inspectionCaptureBtn').addEventListener('click',captureInspectionPhoto);
  $('inspectionCameraCloseBtn').addEventListener('click',stopInspectionCamera);
  $('inspectionGalleryBtn').addEventListener('click',()=>$('inspectionGalleryInput')?.click());
  $('inspectionCameraInput').addEventListener('change',e=>addInspectionPhotos(e.target.files));
  $('inspectionGalleryInput').addEventListener('change',e=>addInspectionPhotos(e.target.files));
  $('inspectionPhotoPreview').addEventListener('click',e=>{const b=e.target.closest('[data-inspection-photo-remove]');if(!b)return;inspectionPhotos.splice(Number(b.dataset.inspectionPhotoRemove),1);renderInspectionPhotos();});
  $('inspectionTimeBtn').addEventListener('click',toggleTimeCapture);
  $('inspectionTimeStart').addEventListener('input',updateTimeHours);
  $('inspectionTimeEnd').addEventListener('input',updateTimeHours);
  $('inspectionSubmitBtn').addEventListener('click',submit);
  $('inspectionCalendarSelect').addEventListener('change',()=>{
    const v=$('inspectionCalendarSelect').value;
    if(v===''){ $('inspectionCalendarEventId').value=''; return; }
    const e=currentCalendarEvents()[Number(v)];
    if(e)fillFromEvent(e,true);
  });
  m.addEventListener('click',ev=>{if(ev.target===m)closeModal();});
}
function ensureButton(){
  const tabs=document.querySelector('#mainScreen .tabs');if(!tabs)return;
  let wrap=$('inspectionQuickLauncher');
  if(!chefAllowed()){
    if(wrap)wrap.classList.add('hidden');
    return;
  }
  if(!wrap){
    wrap=document.createElement('div');
    wrap.id='inspectionQuickLauncher';
    wrap.className='inspection-quick-launcher hidden';
    wrap.innerHTML='<button type="button" class="btn success" id="inspectionQuickBtn">Besichtigungstermin</button>';
    tabs.insertAdjacentElement('afterend',wrap);
  }
  const btn=$('inspectionQuickBtn');
  if(btn&&!btn.dataset.dgInspectionBound){
    btn.dataset.dgInspectionBound='1';
    btn.addEventListener('click',openModal);
  }
  wrap.classList.remove('hidden');
}
function install(){
  buildModal();ensureButton();
  const mo=new MutationObserver(()=>ensureButton());
  // Nur Strukturänderungen beobachten. Klassenänderungen würden den eigenen
  // Launcher erneut triggern und können auf Android den Start blockieren.
  mo.observe(document.body,{subtree:true,childList:true});
  const baseOpen=window.openMain;
  if(typeof baseOpen==='function'&&!baseOpen.__inspectionWrapped){
    const wrapped=function(){const r=baseOpen.apply(this,arguments);setTimeout(ensureButton,0);return r;};
    wrapped.__inspectionWrapped=true;window.openMain=wrapped;
  }
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});else setTimeout(install,0);
})();
