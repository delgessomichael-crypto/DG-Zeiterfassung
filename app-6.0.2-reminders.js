/* DG Zeiterfassung 6.0.2 - Eigene Reminder mit Sprache, Bildern und Dateien */
(function(){
'use strict';
const V='6.0.2';
const $2=id=>document.getElementById(id);
let ownSpeech=null;

function esc2(v){return String(v==null?'':v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function fmtSize(n){n=Number(n)||0;if(n<1024)return n+' B';if(n<1024*1024)return (n/1024).toFixed(1).replace('.',',')+' KB';return (n/1024/1024).toFixed(1).replace('.',',')+' MB';}
function tomorrow(){const d=new Date();d.setDate(d.getDate()+1);return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');}

function css(){
  if($2('dg602Css'))return;
  const s=document.createElement('style');s.id='dg602Css';s.textContent=`
    #d3Reminder>.dg48-head{display:flex;align-items:center;gap:10px}
    #d3Reminder>.dg48-head h2{flex:1}
    #d3Reminder>.dg48-head .dg48-toggle{order:2}
    #dg602AddReminder{order:1;width:48px;height:48px;border:0;border-radius:14px;background:#166534;color:#fff;font-size:34px;line-height:1;font-weight:900;cursor:pointer;display:flex;align-items:center;justify-content:center;box-shadow:0 4px 12px rgba(22,101,52,.18)}
    #dg602AddReminder:hover{background:#14532d}
    #dg602AddReminder:focus-visible{outline:3px solid #86efac;outline-offset:2px}
    .dg602-modal-form{max-width:760px}
    .dg602-modal-form textarea{min-height:150px;resize:vertical}
    .dg602-text-tools,.dg602-file-tools{display:flex;gap:10px;flex-wrap:wrap;margin:8px 0 12px}
    .dg602-text-tools .btn,.dg602-file-tools .btn{width:auto!important;margin:0!important}
    .dg602-mic.listening{background:#b91c1c!important;color:#fff!important}
    .dg602-files{display:grid;gap:7px;margin:8px 0 12px}
    .dg602-file{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:9px 11px;border:1px solid #d7dee8;border-radius:10px;background:#f8fafc}
    .dg602-file button{border:0;background:#fee2e2;color:#991b1b;border-radius:8px;font-weight:900;cursor:pointer;padding:6px 9px}
    .dg602-own-text{white-space:pre-wrap;margin:10px 0;font-size:16px}
    .dg602-attachments{display:flex;gap:8px;flex-wrap:wrap;margin:9px 0}
    .dg602-attachment{display:inline-flex;align-items:center;gap:6px;padding:8px 10px;border-radius:10px;background:#eef2ff;text-decoration:none;font-weight:800;color:#1e3a8a}
    .dg602-own-badge{background:#dcfce7!important;color:#166534!important}
    @media(max-width:720px){#dg602AddReminder{width:44px;height:44px}.dg602-text-tools,.dg602-file-tools{display:grid;grid-template-columns:1fr 1fr}.dg602-text-tools .btn,.dg602-file-tools .btn{width:100%!important}}
  `;document.head.appendChild(s);
}

function installPlus(){
  const section=$2('d3Reminder'),head=section?.querySelector(':scope > .dg48-head');if(!head)return false;
  let b=$2('dg602AddReminder');if(b)return true;
  b=document.createElement('button');b.type='button';b.id='dg602AddReminder';b.setAttribute('aria-label','Eigenen Reminder hinzufügen');b.title='Eigenen Reminder hinzufügen';b.textContent='+';
  head.appendChild(b);
  b.addEventListener('click',e=>{e.preventDefault();e.stopPropagation();openOwnReminderModal();});
  return true;
}

function speechCtor(){return window.SpeechRecognition||window.webkitSpeechRecognition||null;}
function stopSpeech(){if(ownSpeech){try{ownSpeech.stop();}catch(_e){}}}
function startSpeech(textarea,btn,status){
  const C=speechCtor();if(!C){status.textContent='Sprache-zu-Text wird von diesem Browser nicht unterstützt. Bitte Chrome oder Edge verwenden.';status.className='status warn';return;}
  if(ownSpeech){stopSpeech();return;}
  const rec=new C();ownSpeech=rec;rec.lang='de-DE';rec.continuous=true;rec.interimResults=true;rec.maxAlternatives=1;
  const original=String(textarea.value||'').trimEnd(),prefix=original?original+'\n':'';let finalText='',hadFinal=false;
  rec.onstart=()=>{btn.classList.add('listening');btn.textContent='⏹ Aufnahme stoppen';status.className='status ok';status.textContent='Aufnahme läuft – erkannter Text wird angehängt.';};
  rec.onresult=e=>{let interim='';for(let i=e.resultIndex;i<e.results.length;i++){const t=String(e.results[i][0]?.transcript||'').trim();if(!t)continue;if(e.results[i].isFinal){finalText+=(finalText?' ':'')+t;hadFinal=true;}else interim+=(interim?' ':'')+t;}textarea.value=prefix+(finalText+(interim?(finalText?' ':'')+interim:'')).trim();textarea.dispatchEvent(new Event('input',{bubbles:true}));};
  rec.onerror=e=>{const msg=(e.error==='not-allowed'||e.error==='service-not-allowed')?'Mikrofonzugriff wurde nicht erlaubt.':e.error==='no-speech'?'Keine Sprache erkannt. Bitte erneut versuchen.':'Spracherkennung konnte nicht gestartet werden.';status.className='status error';status.textContent=msg;};
  rec.onend=()=>{if(!hadFinal&&textarea.value.trim()===prefix.trim())textarea.value=original;btn.classList.remove('listening');btn.textContent='🎤 Sprache zu Text';if(!status.classList.contains('error')){status.className='muted small';status.textContent=hadFinal?'Sprache übernommen.':'';}ownSpeech=null;};
  try{rec.start();}catch(_e){ownSpeech=null;status.className='status error';status.textContent='Spracherkennung konnte nicht gestartet werden.';}
}

function readFile(file){return new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve({name:file.name,type:file.type||'application/octet-stream',dataUrl:String(r.result||'')});r.onerror=()=>reject(new Error('Datei konnte nicht gelesen werden: '+file.name));r.readAsDataURL(file);});}

function openOwnReminderModal(){
  $2('d3OwnReminderModal')?.remove();stopSpeech();
  const modal=document.createElement('div');modal.id='d3OwnReminderModal';modal.className='d3-modal';
  modal.innerHTML='<form class="d3-form dg602-modal-form"><h2>Eigenen Reminder hinzufügen</h2><div class="d3-fields"><label for="dg602Text">Reminder</label><textarea id="dg602Text" required placeholder="Was soll erinnert werden?"></textarea><div class="dg602-text-tools"><button type="button" class="btn primary dg602-mic">🎤 Sprache zu Text</button><button type="button" class="btn secondary dg602-clear">Text löschen</button></div><div class="dg602-speech-status muted small"></div><label for="dg602Due">Fällig am</label><input id="dg602Due" type="date" required><label>Bilder / Dateien</label><div class="dg602-file-tools"><button type="button" class="btn primary dg602-pick">📎 Bilder / Dateien hinzufügen</button><button type="button" class="btn secondary dg602-clear-files">Anhänge leeren</button></div><input class="dg602-input hidden" type="file" multiple accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.txt,.csv,.zip"><div class="muted small">Maximal 5 Anhänge · höchstens 5 MB je Datei. Bilder, PDF, Word, Excel, TXT, CSV oder ZIP.</div><div class="dg602-files"></div></div><div class="dg602-save-status"></div><div class="report-actions"><button type="submit" class="btn success">Reminder speichern</button><button type="button" class="btn secondary dg602-cancel">Abbrechen</button></div></form>';
  document.body.appendChild(modal);
  const form=modal.querySelector('form'),text=modal.querySelector('#dg602Text'),due=modal.querySelector('#dg602Due'),input=modal.querySelector('.dg602-input'),filesBox=modal.querySelector('.dg602-files'),speechStatus=modal.querySelector('.dg602-speech-status'),saveStatus=modal.querySelector('.dg602-save-status');let selected=[];
  due.value=tomorrow();
  function drawFiles(){filesBox.innerHTML=selected.map((f,i)=>'<div class="dg602-file"><span>📎 '+esc2(f.name)+' <small>('+fmtSize(f.size)+')</small></span><button type="button" data-i="'+i+'" aria-label="Anhang entfernen">×</button></div>').join('');}
  modal.querySelector('.dg602-mic').onclick=()=>startSpeech(text,modal.querySelector('.dg602-mic'),speechStatus);
  modal.querySelector('.dg602-clear').onclick=()=>{text.value='';text.focus();};
  modal.querySelector('.dg602-pick').onclick=()=>input.click();
  modal.querySelector('.dg602-clear-files').onclick=()=>{selected=[];input.value='';drawFiles();};
  filesBox.onclick=e=>{const b=e.target.closest('button[data-i]');if(!b)return;selected.splice(Number(b.dataset.i),1);drawFiles();};
  input.onchange=()=>{const incoming=[...input.files];input.value='';for(const f of incoming){if(selected.length>=5)break;if(f.size>5*1024*1024){alert('Datei ist größer als 5 MB: '+f.name);continue;}selected.push(f);}if(incoming.length&&selected.length>=5&&incoming.length+selected.length>5)alert('Maximal 5 Anhänge pro Reminder.');drawFiles();};
  modal.querySelector('.dg602-cancel').onclick=()=>{if(form.dataset.busy)return;stopSpeech();modal.remove();};
  form.onsubmit=async e=>{e.preventDefault();if(form.dataset.busy||!form.reportValidity())return;form.dataset.busy='1';form.querySelectorAll('button').forEach(b=>b.disabled=true);saveStatus.className='status info';saveStatus.textContent='Reminder wird gespeichert ...';try{const payload=[];for(const f of selected)payload.push(await readFile(f));await api(chefPayload({action:'createOwnReminder',item:{text:text.value.trim(),dueDate:due.value,files:payload}}));stopSpeech();modal.remove();await loadReminders();if(typeof d3Dashboard==='function')await d3Dashboard(true);}catch(err){saveStatus.className='status error';saveStatus.textContent=err.message;}finally{delete form.dataset.busy;form.querySelectorAll('button').forEach(b=>b.disabled=false);}};
  text.focus();
}
window.dg602OpenOwnReminder=openOwnReminderModal;

function ownAttachments(r){const a=Array.isArray(r.attachments)?r.attachments:[];if(!a.length)return'';return '<div class="dg602-attachments">'+a.map(x=>'<a class="dg602-attachment" target="_blank" rel="noopener noreferrer" href="'+esc2(x.url||'#')+'">📎 '+esc2(x.name||'Datei')+'</a>').join('')+'</div>';}
function ownCard(r,index){return '<div class="report-card'+(index%2?' d3-alt':'')+'"><div class="d3-head"><strong>Eigener Reminder</strong><span class="badge dg602-own-badge">Eigener Reminder</span></div><div class="status '+(r.isOverdue?'warn':'info')+'">Fällig: '+esc2(formatDateDE(r.dueDate))+'</div><div class="dg602-own-text">'+esc2(r.text)+'</div>'+ownAttachments(r)+'<div class="muted small">Erstellt '+esc2(r.createdAt||'')+(r.createdBy?' · '+esc2(r.createdBy):'')+'</div><div class="report-actions">'+d3Button('Erledigt','d3OwnReminderDone',[r.id],'success')+d3Button('Verschieben','d3OwnReminderDate',[r.id])+d3Button('Löschen','d3OwnReminderDelete',[r.id],'danger')+'</div></div>';}

window.loadReminders=loadReminders=async function(){
  installPlus();setMessage('d3ReminderStatus','Reminder werden geladen ...','info');
  try{
    const [offers,inquiries,own]=await Promise.all([
      api(chefPayload({action:'getOfferReminders',includeDone:false})),
      api(chefPayload({action:'getInquiryReminders',includeDone:false})),
      api(chefPayload({action:'getOwnReminders',includeDone:false}))
    ]);
    DG3.offerReminders=offers||[];DG3.inquiryReminders=inquiries||[];DG3.ownReminders=own||[];
    const offerHtml=(offers||[]).map((r,i)=>'<div class="report-card'+(i%2?' d3-alt':'')+'"><div class="d3-head"><strong>'+esc2(r.customer)+' - '+esc2(r.offerNumber)+'</strong><span class="badge">Angebot</span></div><div class="status '+(r.isOverdue?'warn':'info')+'">Fällig: '+esc2(formatDateDE(r.dueDate))+'</div><div>'+esc2(r.description)+'</div><div>Telefon: <a target="_blank" rel="noopener noreferrer" href="tel:'+esc2(r.phone)+'">'+esc2(r.phone)+'</a></div><div class="report-actions">'+d3Button('Angenommen','d3ReminderDecision',[r.id,true],'success')+d3Button('Kein Auftrag','d3ReminderDecision',[r.id,false],'secondary')+d3Button('Verschieben','d3ReminderDate',[r.id])+'</div></div>').join('');
    const inquiryHtml=(inquiries||[]).map((r,i)=>'<div class="report-card'+(((offers||[]).length+i)%2?' d3-alt':'')+'"><div class="d3-head"><strong>'+esc2(r.customer)+'</strong><span class="badge">Anfrage · '+esc2(r.source)+'</span></div><div class="status '+(r.isOverdue?'warn':'info')+'">Erinnerung: '+esc2(formatDateDE(r.dueDate))+'</div><div>'+esc2(r.description)+'</div>'+(r.internalNote?'<div class="status info">Interne Notiz: '+esc2(r.internalNote)+'</div>':'')+'<div class="report-actions">'+(typeof d33ExternalInquiryLinks==='function'?d33ExternalInquiryLinks(r):'')+d3Button('Zurück zu offenen Anfragen','d3InquiryReminderReopen',[r.id])+d3Button('Termin wurde vereinbart','d3InquiryReminderArchive',[r.id],'success')+d3Button('Interne Notiz','d3InquiryReminderNote',[r.id])+d3Button('Ablehnen','d3InquiryReminderReject',[r.id],'danger')+'</div></div>').join('');
    const offset=(offers||[]).length+(inquiries||[]).length,ownHtml=(own||[]).map((r,i)=>ownCard(r,offset+i)).join('');
    $2('d3ReminderList').innerHTML=offerHtml+inquiryHtml+ownHtml||'Keine offenen Reminder.';
    const total=(offers||[]).length+(inquiries||[]).length+(own||[]).length,due=(offers||[]).filter(x=>x.isDue).length+(inquiries||[]).filter(x=>x.isDue).length+(own||[]).filter(x=>x.isDue).length;
    setMessage('d3ReminderStatus',total+' offene Reminder, '+due+' fällig.','ok');d3Count('reminders',due);
    return{offers:offers||[],inquiries:inquiries||[],own:own||[]};
  }catch(e){setMessage('d3ReminderStatus',e.message,'error');throw e;}
};

window.d3OwnReminderDone=async function(id){if(!confirm('Diesen eigenen Reminder als erledigt markieren?'))return;await api(chefPayload({action:'completeOwnReminder',reminderId:id}));await loadReminders();};
window.d3OwnReminderDate=function(id){const r=(DG3.ownReminders||[]).find(x=>x.id===id);if(!r)throw new Error('Bitte Reminder neu laden.');d3Form('Eigenen Reminder verschieben',[{name:'dueDate',label:'Neues Datum',type:'date',required:true}],{dueDate:r.dueDate},async v=>{await api(chefPayload({action:'rescheduleOwnReminder',reminderId:id,dueDate:v.dueDate}));await loadReminders();});};
window.d3OwnReminderDelete=async function(id){if(!confirm('Diesen eigenen Reminder einschließlich seiner Anhänge löschen?'))return;await api(chefPayload({action:'deleteOwnReminder',reminderId:id}));await loadReminders();};

function install(){css();installPlus();try{if(window.DG3&&DG3.loaders)DG3.loaders.d3Reminder=window.loadReminders;}catch(_e){}}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});else install();
setTimeout(install,100);setTimeout(install,600);setTimeout(install,1600);
})();
