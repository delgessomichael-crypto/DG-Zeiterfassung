/* DG Zeiterfassung 6.0.3 - Interne Notizen fuer eigene Reminder */
(function(){
'use strict';
if(window.__dg603ReminderNotes)return;
window.__dg603ReminderNotes=true;
let speech=null;
const byId=id=>document.getElementById(id);
const esc=v=>String(v==null?'':v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot',"'":'&#39;'}[c]));

function ensureCss(){
  if(byId('dg603ReminderNoteCss'))return;
  const s=document.createElement('style');s.id='dg603ReminderNoteCss';s.textContent=`
    .dg603-own-note{white-space:pre-wrap;margin:10px 0;padding:11px 13px;border-left:4px solid #d97706;background:#fff7ed;border-radius:8px;color:#7c2d12}
    .dg603-own-note strong{display:block;margin-bottom:4px}
    .dg603-note-form{max-width:760px}
    .dg603-note-form textarea{min-height:170px;resize:vertical}
    .dg603-note-tools{display:flex;gap:10px;flex-wrap:wrap;margin:8px 0 12px}
    .dg603-note-tools .btn{width:auto!important;margin:0!important}
    .dg603-note-mic.listening{background:#b91c1c!important;color:#fff!important}
  `;document.head.appendChild(s);
}

function stopSpeech(){if(speech){try{speech.stop();}catch(_e){}}}
function startSpeech(textarea,btn,status){
  const C=window.SpeechRecognition||window.webkitSpeechRecognition;
  if(!C){status.className='status warn';status.textContent='Sprache-zu-Text wird von diesem Browser nicht unterstützt. Bitte Chrome oder Edge verwenden.';return;}
  if(speech){stopSpeech();return;}
  const rec=new C();speech=rec;rec.lang='de-DE';rec.continuous=true;rec.interimResults=true;rec.maxAlternatives=1;
  const original=String(textarea.value||'').trimEnd(),prefix=original?original+'\n':'';let finalText='',hadFinal=false;
  rec.onstart=()=>{btn.classList.add('listening');btn.textContent='⏹ Aufnahme stoppen';status.className='status ok';status.textContent='Aufnahme läuft – erkannter Text wird angehängt.';};
  rec.onresult=e=>{let interim='';for(let i=e.resultIndex;i<e.results.length;i++){const t=String(e.results[i][0]?.transcript||'').trim();if(!t)continue;if(e.results[i].isFinal){finalText+=(finalText?' ':'')+t;hadFinal=true;}else interim+=(interim?' ':'')+t;}textarea.value=prefix+(finalText+(interim?(finalText?' ':'')+interim:'')).trim();};
  rec.onerror=e=>{status.className='status error';status.textContent=(e.error==='not-allowed'||e.error==='service-not-allowed')?'Mikrofonzugriff wurde nicht erlaubt.':e.error==='no-speech'?'Keine Sprache erkannt. Bitte erneut versuchen.':'Spracherkennung konnte nicht gestartet werden.';};
  rec.onend=()=>{if(!hadFinal&&textarea.value.trim()===prefix.trim())textarea.value=original;btn.classList.remove('listening');btn.textContent='🎤 Sprache zu Text';if(!status.classList.contains('error')){status.className='muted small';status.textContent=hadFinal?'Sprache übernommen.':'';}speech=null;};
  try{rec.start();}catch(_e){speech=null;status.className='status error';status.textContent='Spracherkennung konnte nicht gestartet werden.';}
}

function decorateOwnReminders(){
  ensureCss();
  const list=(window.DG3&&Array.isArray(DG3.ownReminders))?DG3.ownReminders:[];
  const cards=[...document.querySelectorAll('#d3ReminderList .report-card')].filter(c=>c.querySelector('.dg602-own-badge'));
  cards.forEach((card,i)=>{
    const r=list[i];if(!r)return;
    card.querySelectorAll('.dg603-own-note,.dg603-note-button-wrap').forEach(x=>x.remove());
    if(r.internalNote){
      const box=document.createElement('div');box.className='dg603-own-note';box.innerHTML='<strong>Interne Notiz</strong>'+esc(r.internalNote);
      const meta=card.querySelector('.muted.small');if(meta)meta.before(box);else card.appendChild(box);
    }
    const actions=card.querySelector('.report-actions');
    if(actions&&typeof window.d3Button==='function'){
      const wrap=document.createElement('span');wrap.className='dg603-note-button-wrap';wrap.innerHTML=d3Button('Interne Notiz','d3OwnReminderNote',[r.id]);
      const del=[...actions.querySelectorAll('button')].find(b=>/Löschen/i.test(b.textContent||''));
      if(del)actions.insertBefore(wrap,del);else actions.appendChild(wrap);
    }
  });
}

function openNote(id){
  const r=(window.DG3&&Array.isArray(DG3.ownReminders)?DG3.ownReminders:[]).find(x=>x.id===id);if(!r)throw new Error('Bitte Reminder neu laden.');
  byId('d3OwnReminderNoteModal')?.remove();stopSpeech();ensureCss();
  const modal=document.createElement('div');modal.id='d3OwnReminderNoteModal';modal.className='d3-modal';
  modal.innerHTML='<form class="d3-form dg603-note-form"><h2>Interne Notiz</h2><div class="d3-fields"><label for="dg603OwnNote">Notiz zum eigenen Reminder</label><textarea id="dg603OwnNote" maxlength="5000" placeholder="Interne Notiz eintragen ..."></textarea><div class="dg603-note-tools"><button type="button" class="btn primary dg603-note-mic">🎤 Sprache zu Text</button><button type="button" class="btn secondary dg603-note-clear">Text löschen</button></div><div class="dg603-note-speech muted small"></div></div><div class="dg603-note-status"></div><div class="report-actions"><button type="submit" class="btn success">Notiz speichern</button><button type="button" class="btn secondary dg603-note-cancel">Abbrechen</button></div></form>';
  document.body.appendChild(modal);
  const form=modal.querySelector('form'),text=modal.querySelector('#dg603OwnNote'),status=modal.querySelector('.dg603-note-speech'),save=modal.querySelector('.dg603-note-status'),mic=modal.querySelector('.dg603-note-mic');
  text.value=String(r.internalNote||'');
  mic.onclick=()=>startSpeech(text,mic,status);
  modal.querySelector('.dg603-note-clear').onclick=()=>{text.value='';text.focus();};
  modal.querySelector('.dg603-note-cancel').onclick=()=>{if(form.dataset.busy)return;stopSpeech();modal.remove();};
  form.onsubmit=async e=>{e.preventDefault();if(form.dataset.busy)return;form.dataset.busy='1';form.querySelectorAll('button').forEach(b=>b.disabled=true);save.className='status info';save.textContent='Interne Notiz wird gespeichert ...';try{await api(chefPayload({action:'saveOwnReminderInternalNote',reminderId:id,note:text.value.trim()}));stopSpeech();modal.remove();await loadReminders();}catch(err){save.className='status error';save.textContent=err.message;}finally{delete form.dataset.busy;form.querySelectorAll('button').forEach(b=>b.disabled=false);}};
  text.focus();text.setSelectionRange(text.value.length,text.value.length);
}

window.d3OwnReminderNote=function(id){openNote(id);};

function install(){
  ensureCss();
  const base=window.loadReminders;
  if(typeof base==='function'&&!base.__dg603NoteWrapped){
    const wrapped=async function(){const result=await base.apply(this,arguments);decorateOwnReminders();return result;};
    wrapped.__dg603NoteWrapped=true;
    window.loadReminders=loadReminders=wrapped;
    try{if(window.DG3&&DG3.loaders)DG3.loaders.d3Reminder=wrapped;}catch(_e){}
  }
  decorateOwnReminders();
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>setTimeout(install,0),{once:true});else setTimeout(install,0);
setTimeout(install,300);setTimeout(install,1200);
})();
