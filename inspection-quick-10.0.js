/* DG App 10 - Chef quick inspection request */
(function(){
'use strict';

const V='20260924-1118-inspection-quick1';
const $=id=>document.getElementById(id);
const esc=v=>String(v==null?'':v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

function chefAllowed(){
  try{
    if(localStorage.getItem('dg_chef_access')==='1')return true;
    if(typeof window.canAccessBoss==='function'&&window.canAccessBoss())return true;
    if(typeof canAccessBoss==='function'&&canAccessBoss())return true;
  }catch(_e){}
  const boss=document.getElementById('bossTab');
  return !!(boss&&!boss.classList.contains('hidden')&&boss.offsetParent!==null);
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
  const email=(text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+.[A-Z]{2,}/i)||[''])[0];
  const phones=[...text.matchAll(/(?:+49|0)[0-9][0-9 -/()]{5,}/g)].map(m=>m[0].trim());
  return {email,phone1:phones[0]||'',phone2:phones[1]||''};
}
function parseAddress(location){
  const s=String(location||'').trim();
  const m=s.match(/^(.*?)(?:,s*)?(d{5})s+([^,]+)(?:,s*Deutschland)?$/i);
  if(m)return {street:m[1].trim(),postalCode:m[2],city:m[3].trim()};
  return {street:s,postalCode:'',city:''};
}
function splitName(title){
  let t=String(title||'').trim();
  t=t.replace(/^(?:Besichtigung|Termin|Kundentermin|Auftrag)s*[-:·]s*/i,'').trim();
  const firstPart=t.split(/s+-s+|,s*(?=d{5})/)[0].trim();
  if(!firstPart)return {firstName:'',lastName:''};
  if(firstPart.includes(',')){
    const p=firstPart.split(',').map(x=>x.trim()).filter(Boolean);
    return {lastName:p[0]||'',firstName:p.slice(1).join(' ')};
  }
  const p=firstPart.split(/s+/).filter(Boolean);
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
function clearForm(){
  ['inspectionLastName','inspectionFirstName','inspectionStreet','inspectionPostalCode','inspectionCity','inspectionEmail','inspectionMobile','inspectionLandline','inspectionDescription','inspectionCalendarEventId'].forEach(id=>{if($(id))$(id).value='';});
  if($('inspectionCalendarSelect'))$('inspectionCalendarSelect').value='';
  notice('','info');
}
function closeModal(){
  const m=$('inspectionQuickModal');if(m)m.classList.add('hidden');
  stopSpeech();
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
  recognition.lang='de-DE';recognition.continuous=true;recognition.interimResults=true;
  let base=String($('inspectionDescription')?.value||'').trim();
  recognition.onstart=()=>{speechActive=true;if($('inspectionSpeechBtn'))$('inspectionSpeechBtn').textContent='⏹ Spracheingabe stoppen';notice('Spracheingabe läuft …','info');};
  recognition.onresult=ev=>{
    let finalText='',interim='';
    for(let i=ev.resultIndex;i<ev.results.length;i++){
      const t=String(ev.results[i][0].transcript||'').trim();
      if(ev.results[i].isFinal)finalText+=(finalText?' ':'')+t;else interim+=(interim?' ':'')+t;
    }
    if(finalText)base=(base?base+' ':'')+finalText;
    const ta=$('inspectionDescription');if(ta)ta.value=(base+(interim?' '+interim:'')).trim();
  };
  recognition.onerror=ev=>{notice('Spracheingabe: '+String(ev.error||'Fehler'),'warn');stopSpeech();};
  recognition.onend=()=>{if(speechActive){speechActive=false;const b=$('inspectionSpeechBtn');if(b)b.textContent='🎤 Spracheingabe';}};
  recognition.start();
}
async function submit(){
  if(!chefAllowed()){notice('Diese Funktion ist nur mit Chefzugang verfügbar.','error');return;}
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
    calendarEventId:String($('inspectionCalendarEventId')?.value||'').trim()
  };
  if(!item.lastName&&!item.firstName){notice('Bitte Name oder Vorname eintragen.','error');$('inspectionLastName')?.focus();return;}
  if(!item.description){notice('Bitte Auftragsbeschreibung eintragen.','error');$('inspectionDescription')?.focus();return;}
  const btn=$('inspectionSubmitBtn');
  if(btn){btn.disabled=true;btn.textContent='Wird übertragen …';}
  stopSpeech();
  try{
    const fn=typeof window.api==='function'?window.api:null;
    if(!fn)throw new Error('API ist noch nicht bereit.');
    const r=await fn(apiPayload({action:'createEmployeeInspectionRequestV10',item}));
    notice('✅ Besichtigung wurde an das Büro übertragen und steht unter „Angebote zu erstellen“.','ok');
    if(typeof window.dg60RefreshOfferCounts==='function')window.dg60RefreshOfferCounts(true).catch(()=>{});
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
      <button type="button" class="btn success" id="inspectionSubmitBtn" style="width:100%;margin-top:14px">Übertragen</button>
      <div id="inspectionQuickStatus"></div>
    </div>`;
  document.body.appendChild(m);
  $('inspectionCloseBtn').addEventListener('click',closeModal);
  $('inspectionSpeechBtn').addEventListener('click',toggleSpeech);
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
  mo.observe(document.body,{subtree:true,childList:true,attributes:true,attributeFilter:['class']});
  const baseOpen=window.openMain;
  if(typeof baseOpen==='function'&&!baseOpen.__inspectionWrapped){
    const wrapped=function(){const r=baseOpen.apply(this,arguments);setTimeout(ensureButton,0);return r;};
    wrapped.__inspectionWrapped=true;window.openMain=wrapped;
  }
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});else setTimeout(install,0);
})();
