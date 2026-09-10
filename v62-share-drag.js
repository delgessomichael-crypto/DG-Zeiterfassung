(function(){
'use strict';
if(window.__DG_V62_SHARE_DRAG__)return;window.__DG_V62_SHARE_DRAG__=true;
const $=id=>document.getElementById(id);
let sharePanel=null,dragEl=null,suppressClick=false;
function esc(v){return String(v==null?'':v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
function msg(text,type='info'){const e=$('dg62MS');if(e){e.className='status '+type;e.textContent=text}}
function isGoogle(){return String($('dg62MT')&&$('dg62MT').textContent||'').toLowerCase().includes('google')}
function durationMin(){const s=$('dg62Start')?$('dg62Start').value:'',e=$('dg62End')?$('dg62End').value:'';const m=t=>{const a=/^(\d{2}):(\d{2})$/.exec(t||'');return a?Number(a[1])*60+Number(a[2]):0};return Math.max(15,m(e)-m(s))}
function hhmm(total){total=Math.max(0,Math.min(23*60+59,total));return String(Math.floor(total/60)).padStart(2,'0')+':'+String(total%60).padStart(2,'0')}
function buildSharePanel(){
  const base=$('dg62Share'),modal=$('dg62Modal');if(!base||!modal)return;
  let b=$('dg62ShareBtn');if(!b){b=document.createElement('button');b.id='dg62ShareBtn';b.type='button';b.className='btn primary hidden';b.style.width='100%';b.style.marginTop='10px';b.textContent='Termin mit Mitarbeiter teilen';base.insertAdjacentElement('beforebegin',b);b.addEventListener('click',toggleSharePanel)}
  if(!$('dg62SharePanel')){sharePanel=document.createElement('div');sharePanel.id='dg62SharePanel';sharePanel.className='hidden';sharePanel.style.marginTop='10px';sharePanel.innerHTML='<div class="muted small" style="margin-bottom:6px">Zusätzliche Mitarbeiter auswählen. Der ursprüngliche Termin bleibt bestehen.</div><div id="dg62ShareExtra" class="dg62-share"></div><button id="dg62ShareConfirm" type="button" class="btn success" style="width:100%;margin-top:8px">Ausgewählte Mitarbeiter hinzufügen</button>';base.insertAdjacentElement('afterend',sharePanel);$('dg62ShareConfirm').addEventListener('click',confirmShare)}
}
function currentAssignments(){return [...document.querySelectorAll('#dg62Share .dg62cb')].filter(x=>x.checked).map(x=>x.value)}
function toggleSharePanel(){
  buildSharePanel();const p=$('dg62SharePanel'),extra=$('dg62ShareExtra'),base=$('dg62Share');if(!p||!extra||!base)return;
  if(!p.classList.contains('hidden')){p.classList.add('hidden');return}
  const assigned=new Set(currentAssignments());const labels=[...base.querySelectorAll('label')];extra.innerHTML=labels.map(l=>{const i=l.querySelector('input');if(!i||assigned.has(i.value))return'';return '<label><input type="checkbox" class="dg62-share-extra" value="'+esc(i.value)+'">'+esc((l.textContent||'').trim())+'</label>'}).join('')||'<div class="muted small">Alle aktiven Mitarbeiter sind diesem Termin bereits zugeordnet.</div>';
  p.classList.remove('hidden')
}
async function confirmShare(){
  const ids=[...document.querySelectorAll('.dg62-share-extra:checked')].map(x=>x.value);if(!ids.length){msg('Bitte mindestens einen zusätzlichen Mitarbeiter auswählen.','warn');return}
  const customer=$('dg62Customer').value.trim(),address=$('dg62Address').value.trim(),task=$('dg62Task').value.trim(),date=$('dg62ED').value,start=$('dg62Start').value,end=$('dg62End').value;
  try{
    msg('Termin wird mit ausgewählten Mitarbeitern geteilt …','info');
    if(isGoogle()){
      await api(chefPayload({action:'savePlannerEvent',item:{id:'',customer,address,task,date,start,end,employeeIds:ids}}));
    }else{
      const base=[...document.querySelectorAll('#dg62Share .dg62cb')];base.forEach(x=>{if(ids.includes(x.value))x.checked=true});
      if(typeof window.dg62Save!=='function')throw new Error('Speicherfunktion nicht verfügbar.');
      await window.dg62Save();return;
    }
    if(typeof window.dg62Close==='function')window.dg62Close();if(typeof window.dg62Load==='function')await window.dg62Load();
  }catch(e){msg(e&&e.message?e.message:'Termin konnte nicht geteilt werden.','error')}
}
function updateShareUi(){
  buildSharePanel();const title=String($('dg62MT')&&$('dg62MT').textContent||'').toLowerCase(),editing=title.includes('bearbeiten');const b=$('dg62ShareBtn'),p=$('dg62SharePanel');if(b)b.classList.toggle('hidden',!editing);if(p)p.classList.add('hidden');
  if(editing&&!isGoogle()){
    document.querySelectorAll('#dg62Share .dg62cb').forEach(x=>{if(x.checked)x.disabled=true});
  }
}
function eventOpened(){setTimeout(updateShareUi,0)}
const oldEdit=window.dg62Edit;if(typeof oldEdit==='function')window.dg62Edit=function(){const r=oldEdit.apply(this,arguments);eventOpened();return r};
const oldNew=window.dg62New;if(typeof oldNew==='function')window.dg62New=function(){const r=oldNew.apply(this,arguments);buildSharePanel();const b=$('dg62ShareBtn'),p=$('dg62SharePanel');if(b)b.classList.add('hidden');if(p)p.classList.add('hidden');return r};
function enhanceEvents(){
  document.querySelectorAll('.dg62-event').forEach(el=>{if(el.dataset.dragReady==='1')return;el.dataset.dragReady='1';el.draggable=true;el.style.userSelect='none';
    el.addEventListener('dragstart',e=>{dragEl=el;suppressClick=true;el.style.opacity='.55';try{e.dataTransfer.effectAllowed='move';e.dataTransfer.setData('text/plain','dg-calendar-event')}catch(_e){}});
    el.addEventListener('dragend',()=>{el.style.opacity='';setTimeout(()=>{suppressClick=false},120);dragEl=null});
    el.addEventListener('click',e=>{if(suppressClick){e.stopImmediatePropagation();e.preventDefault()}},true);
  });
  document.querySelectorAll('.dg62-cell').forEach(cell=>{if(cell.dataset.dropReady==='1')return;cell.dataset.dropReady='1';cell.addEventListener('dragover',e=>{if(!dragEl)return;e.preventDefault();cell.style.background='#dbeafe'});cell.addEventListener('dragleave',()=>{cell.style.background=''});cell.addEventListener('drop',async e=>{if(!dragEl)return;e.preventDefault();cell.style.background='';const source=dragEl,section=cell.closest('.dg62-day');if(!section)return;const all=[...section.querySelectorAll('.dg62-cell')],heads=[...section.querySelectorAll('.dg62-name')],idx=all.indexOf(cell),cols=Math.max(1,heads.length),row=Math.floor(idx/cols),hour=7+row,rect=cell.getBoundingClientRect(),fraction=Math.max(0,Math.min(.999,(e.clientY-rect.top)/Math.max(1,rect.height))),quarter=Math.round(fraction*4)*15,startMin=Math.min(19*60+45,hour*60+Math.min(45,quarter));
      source.dispatchEvent(new MouseEvent('click',{bubbles:true,cancelable:true}));await new Promise(r=>setTimeout(r,20));if(!$('dg62Modal')||$('dg62Modal').classList.contains('hidden'))return;const dur=durationMin();$('dg62ED').value=section.dataset.date||$('dg62ED').value;$('dg62Start').value=hhmm(startMin);$('dg62End').value=hhmm(Math.min(20*60,startMin+dur));msg('Neue Zeit gewählt. Termin wird gespeichert …','info');try{await window.dg62Save()}catch(err){msg(err&&err.message?err.message:'Termin konnte nicht verschoben werden.','error')}})
  })
}
const oldLoad=window.dg62Load;if(typeof oldLoad==='function')window.dg62Load=async function(){const r=await oldLoad.apply(this,arguments);setTimeout(enhanceEvents,0);return r};
const obs=new MutationObserver(()=>{buildSharePanel();enhanceEvents()});obs.observe(document.documentElement,{childList:true,subtree:true});
buildSharePanel();enhanceEvents();
})();