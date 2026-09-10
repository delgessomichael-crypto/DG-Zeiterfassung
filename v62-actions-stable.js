(function(){
'use strict';
if(window.__DG_V62_ACTIONS_STABLE__)return;window.__DG_V62_ACTIONS_STABLE__=true;
const $=id=>document.getElementById(id);
let suppressClick=false;
function esc(v){return String(v==null?'':v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
function setMsg(text,type='info'){const e=$('dg62MS');if(e){e.className='status '+type;e.textContent=text}}
function isGoogleEdit(){return /google/i.test(String($('dg62MT')&&$('dg62MT').textContent||''))}
function mins(t){const m=/^(\d{1,2}):(\d{2})$/.exec(String(t||''));return m?Number(m[1])*60+Number(m[2]):0}
function hhmm(v){v=Math.max(0,Math.min(23*60+59,Math.round(v)));return String(Math.floor(v/60)).padStart(2,'0')+':'+String(v%60).padStart(2,'0')}
function ensureShareUi(){
  const modal=$('dg62Modal'),share=$('dg62Share');if(!modal||!share)return;
  let btn=$('dg62ShareEmployeeBtn');
  if(!btn){btn=document.createElement('button');btn.id='dg62ShareEmployeeBtn';btn.type='button';btn.className='btn primary hidden';btn.style.width='100%';btn.style.marginTop='10px';btn.textContent='Termin mit Mitarbeiter teilen';share.insertAdjacentElement('afterend',btn);btn.addEventListener('click',toggleSharePanel)}
  if(!$('dg62ShareEmployeePanel')){const p=document.createElement('div');p.id='dg62ShareEmployeePanel';p.className='hidden';p.style.marginTop='10px';p.innerHTML='<div class="muted small" style="margin-bottom:7px">Zusätzliche Mitarbeiter auswählen. Der bestehende Termin bleibt erhalten.</div><div id="dg62ShareEmployeeChoices" class="dg62-share"></div><button id="dg62ShareEmployeeConfirm" type="button" class="btn success" style="width:100%;margin-top:8px">Ausgewählte Mitarbeiter hinzufügen</button>';btn.insertAdjacentElement('afterend',p);$('dg62ShareEmployeeConfirm').addEventListener('click',confirmShare)}
}
function toggleSharePanel(){
  ensureShareUi();const p=$('dg62ShareEmployeePanel'),choices=$('dg62ShareEmployeeChoices'),base=$('dg62Share');if(!p||!choices||!base)return;
  if(!p.classList.contains('hidden')){p.classList.add('hidden');return}
  const assigned=new Set([...base.querySelectorAll('.dg62cb:checked')].map(x=>x.value));
  choices.innerHTML=[...base.querySelectorAll('label')].map(l=>{const i=l.querySelector('.dg62cb');if(!i||assigned.has(i.value))return'';return '<label><input type="checkbox" class="dg62-share-extra" value="'+esc(i.value)+'">'+esc((l.textContent||'').trim())+'</label>'}).join('')||'<div class="muted small">Alle aktiven Mitarbeiter sind bereits zugeordnet.</div>';
  p.classList.remove('hidden')
}
async function confirmShare(){
  const ids=[...document.querySelectorAll('.dg62-share-extra:checked')].map(x=>x.value);if(!ids.length){setMsg('Bitte mindestens einen zusätzlichen Mitarbeiter auswählen.','warn');return}
  const customer=$('dg62Customer').value.trim(),address=$('dg62Address').value.trim(),task=$('dg62Task').value.trim(),date=$('dg62ED').value,start=$('dg62Start').value,end=$('dg62End').value;
  try{setMsg('Termin wird mit ausgewählten Mitarbeitern geteilt …','info');
    if(isGoogleEdit()){
      await api(chefPayload({action:'savePlannerEvent',item:{id:'',customer,address,task,date,start,end,employeeIds:ids}}));
      if(typeof window.dg62Close==='function')window.dg62Close();if(typeof window.dg62Load==='function')await window.dg62Load();
    }else{
      document.querySelectorAll('#dg62Share .dg62cb').forEach(x=>{if(ids.includes(x.value))x.checked=true});
      if(typeof window.dg62Save!=='function')throw new Error('Speicherfunktion nicht verfügbar.');await window.dg62Save();
    }
  }catch(e){setMsg(e&&e.message?e.message:'Termin konnte nicht geteilt werden.','error')}
}
function updateShareButton(){ensureShareUi();const b=$('dg62ShareEmployeeBtn'),p=$('dg62ShareEmployeePanel');const editing=/bearbeiten/i.test(String($('dg62MT')&&$('dg62MT').textContent||''));if(b)b.classList.toggle('hidden',!editing);if(p)p.classList.add('hidden')}
function enhanceDrag(){
  document.querySelectorAll('.dg62-event').forEach(ev=>{if(ev.dataset.dgDragStable==='1')return;ev.dataset.dgDragStable='1';ev.draggable=true;ev.style.userSelect='none';ev.title=(ev.title?ev.title+' · ':'')+'Ziehen = Uhrzeit ändern';
    ev.addEventListener('dragstart',e=>{suppressClick=true;ev.dataset.dragging='1';ev.style.opacity='.55';try{e.dataTransfer.effectAllowed='move';e.dataTransfer.setData('text/plain','dg62-event')}catch(_e){}});
    ev.addEventListener('dragend',()=>{ev.style.opacity='';delete ev.dataset.dragging;setTimeout(()=>suppressClick=false,180)});
    ev.addEventListener('click',e=>{if(suppressClick){e.preventDefault();e.stopImmediatePropagation()}},true)
  });
  document.querySelectorAll('.dg62-day').forEach(day=>{const heads=[...day.querySelectorAll('.dg62-name')],cols=Math.max(1,heads.length),cells=[...day.querySelectorAll('.dg62-cell')];cells.forEach((cell,idx)=>{if(cell.dataset.dgDropStable==='1')return;cell.dataset.dgDropStable='1';cell.addEventListener('dragover',e=>{if(!document.querySelector('.dg62-event[data-dragging="1"]'))return;e.preventDefault();cell.style.background='#dbeafe'});cell.addEventListener('dragleave',()=>cell.style.background='');cell.addEventListener('drop',async e=>{const src=document.querySelector('.dg62-event[data-dragging="1"]');if(!src)return;e.preventDefault();cell.style.background='';const row=Math.floor(idx/cols),hour=7+row,rect=cell.getBoundingClientRect(),frac=Math.max(0,Math.min(.999,(e.clientY-rect.top)/Math.max(1,rect.height))),quarter=Math.min(45,Math.round(frac*4)*15),newStart=hour*60+quarter;
      src.dispatchEvent(new MouseEvent('click',{bubbles:true,cancelable:true}));await new Promise(r=>setTimeout(r,30));if(!$('dg62Modal')||$('dg62Modal').classList.contains('hidden'))return;const oldStart=mins($('dg62Start').value),oldEnd=mins($('dg62End').value),dur=Math.max(15,oldEnd-oldStart);$('dg62ED').value=day.dataset.date||$('dg62ED').value;$('dg62Start').value=hhmm(newStart);$('dg62End').value=hhmm(Math.min(20*60,newStart+dur));setMsg('Neue Uhrzeit gewählt. Termin wird gespeichert …','info');if(typeof window.dg62Save==='function')await window.dg62Save()})})})
}
const oldEdit=window.dg62Edit;if(typeof oldEdit==='function')window.dg62Edit=function(){const r=oldEdit.apply(this,arguments);updateShareButton();return r};
const oldNew=window.dg62New;if(typeof oldNew==='function')window.dg62New=function(){const r=oldNew.apply(this,arguments);ensureShareUi();const b=$('dg62ShareEmployeeBtn'),p=$('dg62ShareEmployeePanel');if(b)b.classList.add('hidden');if(p)p.classList.add('hidden');return r};
const oldLoad=window.dg62Load;if(typeof oldLoad==='function')window.dg62Load=async function(){const r=await oldLoad.apply(this,arguments);enhanceDrag();return r};
ensureShareUi();enhanceDrag();
})();