(function(){
'use strict';
if(window.__DG_V59_PATCH__)return;window.__DG_V59_PATCH__=true;
const $=id=>document.getElementById(id);
const esc59=v=>String(v==null?'':v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmt59=v=>typeof formatHours==='function'?formatHours(v):Number(v||0).toFixed(2).replace('.',',');
let pendingDeleteId='';
let editIndex=-1;

// v58 cached read requests for a few seconds. A successful employee edit must
// invalidate that cache as well, otherwise an immediate reload could show old data.
const apiBefore59=window.api;let cacheNonce59=0;
const cacheReads59=new Set(['getRegieReports','getMonthData','getWeekData','getBossDayClosures','getEmployees','getEmployeeAdminData','getAbsences','getVacationAccounts','getVacationAccount','getBossMonthData','getChefEmployeeMonthData','getObjectReports','getMyTimeBank','getEmployeeCalendarEvents','getDayData']);
if(typeof apiBefore59==='function')window.api=async function(payload){const action=String(payload&&payload.action||'');const p=Object.assign({},payload||{});if(cacheReads59.has(action))p._v59cache=cacheNonce59;const r=await apiBefore59(p);if(action==='updateEmployeeEntry')cacheNonce59++;return r};

function addCss(){if($('dg59css'))return;const s=document.createElement('style');s.id='dg59css';s.textContent=`
.dg59-actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:8px}.dg59-actions .btn{width:auto}.dg59-modal{position:fixed;inset:0;z-index:13000;background:rgba(0,0,0,.5);display:flex;align-items:center;justify-content:center;padding:18px}.dg59-modal.hidden{display:none!important}.dg59-modal-card{background:#fff;border-radius:18px;width:min(100%,680px);max-height:92vh;overflow:auto;padding:20px;box-shadow:0 18px 60px rgba(0,0,0,.3)}.dg59-locked{background:#f3f4f6!important;color:#4b5563!important}.dg59-lock-note{padding:10px;border-radius:10px;background:#e0f2fe;color:#075985;font-weight:700;margin:10px 0}.dg59-cal-day{border:1px solid #d1d5db;border-radius:14px;margin-top:10px;overflow:hidden;background:#fff}.dg59-cal-head{width:100%;border:0;background:#f8fafc;padding:13px 14px;display:flex;align-items:center;justify-content:space-between;gap:10px;font-weight:800;text-align:left}.dg59-cal-head.today{background:#e0f2fe;color:#075985}.dg59-cal-title{display:flex;flex-direction:column;gap:2px}.dg59-cal-title small{font-weight:600;color:#64748b}.dg59-cal-meta{display:flex;align-items:center;gap:10px;white-space:nowrap}.dg59-cal-count{font-size:12px;color:#64748b}.dg59-cal-icon{font-size:22px;line-height:1}.dg59-cal-body{padding:0 14px 10px}.dg59-cal-body.hidden{display:none!important}.dg59-cal-body .entry:first-child{border-top:0}.dg59-delete-warning{background:#fee2e2;color:#991b1b;padding:11px;border-radius:12px;font-weight:700;margin:10px 0}
@media(max-width:700px){.dg59-actions{display:grid;grid-template-columns:1fr 1fr}.dg59-actions .btn{width:100%}.dg59-cal-head{padding:12px}.dg59-cal-meta{gap:7px}}
`;document.head.appendChild(s)}

function addModals(){
  if(!$('dg59EditModal')){const m=document.createElement('div');m.id='dg59EditModal';m.className='dg59-modal hidden';m.innerHTML=`<div class="dg59-modal-card"><h2 style="margin-top:0">Eintrag bearbeiten</h2><div class="dg59-lock-note">Zeitangaben sind gesperrt und können vom Mitarbeiter nicht verändert werden. Falsche Zeiten kann nur das Büro korrigieren.</div><label>Datum</label><input id="dg59EditDate" class="dg59-locked" disabled><div class="grid2"><div><label>Von</label><input id="dg59EditStart" class="dg59-locked" disabled></div><div><label>Bis</label><input id="dg59EditEnd" class="dg59-locked" disabled></div></div><label>Stunden</label><input id="dg59EditHours" class="dg59-locked" disabled><label>Kunde / Baustelle</label><input id="dg59EditCustomer"><label>Ausgeführte Tätigkeit</label><textarea id="dg59EditActivity"></textarea><label style="display:flex;align-items:center;gap:8px"><input id="dg59EditMaterialUsed" type="checkbox" style="width:auto" onchange="dg59ToggleMaterial()"> Material verbaut</label><div id="dg59EditMaterialWrap"><label>Material</label><textarea id="dg59EditMaterial"></textarea></div><label>Auftragsstatus</label><select id="dg59EditJobStatus"><option value="Abgeschlossen">Abgeschlossen</option><option value="Laufend">Laufend</option></select><div id="dg59EditSignatureNote" class="muted small" style="margin-top:10px"></div><div id="dg59EditStatus"></div><div class="button-row" style="margin-top:14px"><button type="button" class="btn success" onclick="dg59SaveEdit()">Änderungen speichern</button><button type="button" class="btn secondary" onclick="dg59CloseEdit()">Abbrechen</button></div></div>`;document.body.appendChild(m)}
  if(!$('dg59DeleteModal')){const m=document.createElement('div');m.id='dg59DeleteModal';m.className='dg59-modal hidden';m.innerHTML=`<div class="dg59-modal-card" style="max-width:480px"><h2 style="margin-top:0">Eintrag wirklich löschen?</h2><div class="dg59-delete-warning">Der Eintrag wird dauerhaft entfernt. Diese Aktion kann nicht rückgängig gemacht werden.</div><div class="button-row"><button type="button" class="btn danger" onclick="dg59ConfirmDelete()">Ja, Eintrag löschen</button><button type="button" class="btn secondary" onclick="dg59CancelDelete()">Nein</button></div></div>`;document.body.appendChild(m)}
}

window.dg59ToggleMaterial=function(){const used=$('dg59EditMaterialUsed').checked;$('dg59EditMaterialWrap').classList.toggle('hidden',!used)};
window.dg59OpenEdit=function(index){
  const e=(lastDayData&&lastDayData.entries||[])[index];
  if(!e||e.isAdditionalAssignment)return;
  if(lastDayData.closed){setMessage('entryStatus','Der Tag ist bereits abgeschlossen. Bearbeiten ist nicht mehr möglich.','warn');return}
  editIndex=index;
  $('dg59EditDate').value=typeof formatDateDE==='function'?formatDateDE(e.date):e.date;
  $('dg59EditStart').value=e.start||'';$('dg59EditEnd').value=e.end||'';$('dg59EditHours').value=fmt59(e.hours)+' Std.';
  $('dg59EditCustomer').value=e.customer||'';$('dg59EditActivity').value=e.activity||'';
  $('dg59EditMaterialUsed').checked=!!e.materialUsed;$('dg59EditMaterial').value=e.material||'';
  $('dg59EditJobStatus').value=e.jobStatus||'Abgeschlossen';
  $('dg59EditSignatureNote').textContent=e.customerSignatureUrl?'Kundenunterschrift vorhanden – sie bleibt unverändert gespeichert.':'Keine Kundenunterschrift gespeichert.';
  dg59ToggleMaterial();if(typeof clearMessage==='function')clearMessage('dg59EditStatus');$('dg59EditModal').classList.remove('hidden')
};
window.dg59CloseEdit=function(){editIndex=-1;$('dg59EditModal').classList.add('hidden')};
window.dg59SaveEdit=async function(){
  const e=(lastDayData&&lastDayData.entries||[])[editIndex];if(!e)return;
  const customer=$('dg59EditCustomer').value.trim(),activity=$('dg59EditActivity').value.trim(),materialUsed=$('dg59EditMaterialUsed').checked,material=$('dg59EditMaterial').value.trim(),jobStatus=$('dg59EditJobStatus').value;
  if(!customer){setMessage('dg59EditStatus','Bitte Kunde / Baustelle eintragen.','error');return}if(!activity){setMessage('dg59EditStatus','Bitte die ausgeführte Tätigkeit eintragen.','error');return}if(materialUsed&&!material){setMessage('dg59EditStatus','Bitte Material eintragen.','error');return}
  try{setMessage('dg59EditStatus','Änderungen werden gespeichert …','info');const a=auth();const day=await api({action:'updateEmployeeEntry',employee:a.employee,pin:a.pin,entryId:e.id,item:{customer,activity,materialUsed,material,jobStatus}});lastDayData=day;localStorage.setItem('dg_day_'+a.employee+'_'+$('date').value,JSON.stringify(day));dg59CloseEdit();renderDay();setMessage('entryStatus','✅ Eintrag wurde aktualisiert. Zeit und Stunden blieben unverändert.','ok')}catch(err){setMessage('dg59EditStatus',err&&err.message?err.message:'Änderung nicht möglich.','error')}
};

window.deleteEntry=function(id){
  if(!id)return;if(lastDayData&&lastDayData.closed){setMessage('entryStatus','Der Tag ist bereits abgeschlossen. Löschen ist nicht mehr möglich.','warn');return}
  pendingDeleteId=String(id);$('dg59DeleteModal').classList.remove('hidden')
};
window.dg59CancelDelete=function(){pendingDeleteId='';$('dg59DeleteModal').classList.add('hidden')};
window.dg59ConfirmDelete=async function(){const id=pendingDeleteId;window.dg59CancelDelete();if(!id)return;if(!navigator.onLine){setMessage('entryStatus','Löschen benötigt eine Internetverbindung.','warn');return}try{setMessage('entryStatus','Eintrag wird gelöscht …','info');const a=auth();lastDayData=await api({action:'deleteEntry',id,employee:a.employee,date:$('date').value,pin:a.pin});localStorage.setItem('dg_day_'+a.employee+'_'+$('date').value,JSON.stringify(lastDayData));renderDay();setMessage('entryStatus','✅ Eintrag wurde gelöscht.','ok')}catch(err){setMessage('entryStatus',err&&err.message?err.message:'Löschen nicht möglich.','error')}};

function decorateDayEntries(){
  const entries=(lastDayData&&lastDayData.entries)||[],rows=[...document.querySelectorAll('#entries > .entry')];
  rows.forEach((row,i)=>{const e=entries[i];if(!e||e.isAdditionalAssignment||lastDayData.closed)return;const oldDelete=[...row.querySelectorAll('button')].find(b=>(b.textContent||'').includes('Eintrag löschen'));if(!oldDelete)return;let actions=row.querySelector('.dg59-actions');if(!actions){actions=document.createElement('div');actions.className='dg59-actions';oldDelete.parentNode.insertBefore(actions,oldDelete);actions.appendChild(oldDelete)}if(!actions.querySelector('.dg59-edit')){const b=document.createElement('button');b.type='button';b.className='btn success dg59-edit';b.textContent='Eintrag bearbeiten';b.onclick=()=>dg59OpenEdit(i);actions.insertBefore(b,actions.firstChild)}oldDelete.style.marginTop='';oldDelete.classList.add('dg59-delete')})
}
const oldRenderDay59=window.renderDay;if(typeof oldRenderDay59==='function')window.renderDay=function(){const r=oldRenderDay59.apply(this,arguments);decorateDayEntries();return r};
setTimeout(decorateDayEntries,0);

function datePlus(iso,days){const p=iso.split('-').map(Number),d=new Date(p[0],p[1]-1,p[2]+days,12,0,0);return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0')}
function calKey(iso){return 'dg59Cal_'+iso.replace(/-/g,'')}
function eventHtml(event,index){const location=event.location?'<br><span class="muted">📍 '+esc59(event.location)+'</span>':'',description=event.description?'<br><span class="muted">'+esc59(event.description)+'</span>':'',time=event.allDay?'Ganztägig':esc59(event.startTime)+' - '+esc59(event.endTime);return `<div class="entry"><strong>${time}</strong><br><strong>${esc59(event.title||'Termin')}</strong>${location}${description}<div class="button-row" style="margin-top:8px"><button class="btn primary" data-index="${index}" onclick="takeCalendarEvent(Number(this.dataset.index))">Auftrag übernehmen</button>${event.location?`<button class="btn secondary" data-location="${esc59(event.location)}" onclick="openNavigation(this.dataset.location)">Navigation</button>`:''}</div></div>`}
window.dg59ToggleCalendarDay=function(iso){const body=$(calKey(iso)),head=document.querySelector('[data-dg59-cal="'+iso+'"]');if(!body||!head)return;const opening=body.classList.contains('hidden');body.classList.toggle('hidden',!opening);head.setAttribute('aria-expanded',opening?'true':'false');const icon=head.querySelector('.dg59-cal-icon');if(icon)icon.textContent=opening?'−':'+'};
window.renderCalendarEvents=function(events){
  events=Array.isArray(events)?events:[];window.__dgCalendarEvents=events;
  const today=typeof localDate==='function'?localDate():new Date().toISOString().slice(0,10),dates=[today,datePlus(today,1),datePlus(today,2)],labels=['Heute','Morgen','Übermorgen'];
  const groups={};dates.forEach(d=>groups[d]=[]);events.forEach((e,i)=>{if(groups[e.startDate])groups[e.startDate].push({event:e,index:i})});
  $('calendarEvents').innerHTML=dates.map((d,di)=>{const list=groups[d]||[],open=di===0,count=list.length,body=list.length?list.map(x=>eventHtml(x.event,x.index)).join(''):'<div class="muted" style="padding:12px 0">Keine Termine.</div>';return `<div class="dg59-cal-day"><button type="button" class="dg59-cal-head ${di===0?'today':''}" data-dg59-cal="${d}" aria-expanded="${open?'true':'false'}" onclick="dg59ToggleCalendarDay('${d}')"><span class="dg59-cal-title"><span>${labels[di]} · ${typeof formatDateDE==='function'?formatDateDE(d):d}</span><small>${count===1?'1 Termin':count+' Termine'}</small></span><span class="dg59-cal-meta"><span class="dg59-cal-icon">${open?'−':'+'}</span></span></button><div id="${calKey(d)}" class="dg59-cal-body${open?'':' hidden'}">${body}</div></div>`}).join('')
};

function removeOldVersionBanner(){const x=$('dg58BackendStatus');if(x&&String(x.textContent||'').includes('Frontend Version 58'))x.remove()}
const versionObserver59=new MutationObserver(removeOldVersionBanner);versionObserver59.observe(document.documentElement,{subtree:true,childList:true,characterData:true});
async function checkBackend59(){if(!navigator.onLine)return;try{const r=await window.api({action:'ping'}),v=Number(r&&r.version||0);removeOldVersionBanner();let x=$('dg59BackendStatus');if(v===59){if(x)x.remove();return}if(!x){x=document.createElement('div');x.id='dg59BackendStatus';x.className='status error';x.style.position='sticky';x.style.top='0';x.style.zIndex='20001';x.style.margin='0';x.style.borderRadius='0';document.body.prepend(x)}x.textContent='Frontend Version 59 ist aktiv, aber das Google-Backend ist nicht Version 59. Bitte GS v59 bereitstellen.'}catch(_e){}}
window.addEventListener('online',()=>setTimeout(checkBackend59,150));setTimeout(checkBackend59,950);

addCss();addModals();document.title='DG Zeiterfassung v59';const lv=document.querySelector('.login-card .center.muted.small');if(lv)lv.textContent='Version 59';const hv=document.querySelector('.hero .head-row strong');if(hv)hv.textContent='Zeiterfassung · v59';
})();