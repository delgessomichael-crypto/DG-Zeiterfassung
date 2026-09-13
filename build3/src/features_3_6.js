/* DG 3.6: Wartungsvertraege, Wartungskalender und Pflichtfeld naechste Wartung. */
(function(){
'use strict';
let employeeMaintenance=false;
const plannerMap={};

function isMaintenanceEvent(e){return !!(e&&(e.maintenance||e.type==='Wartung'||/(?:^|\n)Terminart:\s*Wartung(?:\n|$)/i.test(String(e.description||''))||/^🔧 WARTUNG ·/i.test(String(e.title||''))));}
function formatMaintenanceDue(v){if(!/^\d{4}-\d{2}$/.test(String(v||'')))return '';const p=String(v).split('-');return p[1]+'/'+p[0];}

function ensureEmployeeMaintenanceField(){
  if($('d36MaintenanceDue'))return;
  const activity=$('activity');if(!activity)return;
  const box=document.createElement('div');box.id='d36MaintenanceDue';box.className='d36-maintenance-due hidden';
  box.innerHTML='<div class="d36-maintenance-head">🔧 Wartungsauftrag</div><label for="d36NextMaintenance">Nächste Wartung fällig <span class="d36-required">Pflichtfeld</span></label><input id="d36NextMaintenance" type="month"><div class="muted small">Bitte Monat und Jahr der nächsten Wartung angeben.</div>';
  activity.insertAdjacentElement('afterend',box);
}
function setEmployeeMaintenance(on){employeeMaintenance=!!on;ensureEmployeeMaintenanceField();const box=$('d36MaintenanceDue');if(box)box.classList.toggle('hidden',!employeeMaintenance);if(!employeeMaintenance&&$('d36NextMaintenance'))$('d36NextMaintenance').value='';const card=$('workEntryCard');if(card)card.classList.toggle('d36-maintenance-active',employeeMaintenance);}

const baseTake=window.takeCalendarEvent;
if(typeof baseTake==='function')window.takeCalendarEvent=function(index){const ev=(window.__dgCalendarEvents||[])[index];const r=baseTake.apply(this,arguments);setEmployeeMaintenance(isMaintenanceEvent(ev));if(employeeMaintenance)setMessage('entryStatus','🔧 Wartungsauftrag übernommen. Vor dem Speichern ist „Nächste Wartung fällig“ Pflicht.','info');return r;};
const baseReset=window.resetEntry;
if(typeof baseReset==='function')window.resetEntry=function(){const r=baseReset.apply(this,arguments);setEmployeeMaintenance(false);return r;};
const baseEmployeeRender=window.renderCalendarEvents;
if(typeof baseEmployeeRender==='function')window.renderCalendarEvents=function(events){const r=baseEmployeeRender.apply(this,arguments);[...document.querySelectorAll('#calendarEvents button[data-index]')].forEach(b=>{const ev=(events||[])[Number(b.dataset.index)];if(!isMaintenanceEvent(ev))return;const entry=b.closest('.entry');if(entry&&!entry.querySelector('.d36-maintenance-badge'))entry.querySelector('strong')?.insertAdjacentHTML('afterend',' <span class="d36-maintenance-badge">🔧 WARTUNG</span>');if((b.textContent||'').trim()==='Auftrag übernehmen')b.textContent='Wartung übernehmen';});return r;};

const baseSaveEntry=window.saveEntry;
if(typeof baseSaveEntry==='function')window.saveEntry=async function(){if(employeeMaintenance&&!String($('d36NextMaintenance')?.value||'')){setMessage('entryStatus','Bei einer Wartung muss „Nächste Wartung fällig“ mit Monat und Jahr angegeben werden.','error');$('d36NextMaintenance')?.focus();return;}return baseSaveEntry.apply(this,arguments);};

const baseQueuePut=window.queuePut;
if(typeof baseQueuePut==='function')window.queuePut=async function(item){if(item&&item.payload&&item.payload.action==='saveEntry'&&employeeMaintenance){item.payload.entry=item.payload.entry||{};item.payload.entry.maintenance=true;item.payload.entry.nextMaintenanceDue=String($('d36NextMaintenance')?.value||'');}return baseQueuePut.apply(this,arguments);};

const baseApi=window.api;
if(typeof baseApi==='function')window.api=api=async function(payload){
  if(payload&&payload.action==='saveEntry'&&employeeMaintenance){payload.entry=payload.entry||{};payload.entry.maintenance=true;payload.entry.nextMaintenanceDue=String($('d36NextMaintenance')?.value||'');}
  if(payload&&payload.action==='savePlannerEvent'&&payload.item){const modal=$('dg62Modal'),sel=$('d36PlannerType');if(modal&&sel&&!modal.classList.contains('hidden'))payload.item.type=sel.value==='Wartung'?'Wartung':'Auftrag';}
  const result=await baseApi.apply(this,arguments);
  if(payload&&payload.action==='getPlannerEvents'&&Array.isArray(result)){Object.keys(plannerMap).forEach(k=>delete plannerMap[k]);result.forEach(x=>plannerMap[String(x.id)]=x);}
  return result;
};

function ensurePlannerType(){
  if($('d36PlannerType'))return;
  const task=$('dg62Task');if(!task)return;
  const wrap=document.createElement('div');wrap.id='d36PlannerTypeWrap';wrap.innerHTML='<label for="d36PlannerType">Terminart</label><select id="d36PlannerType"><option value="Auftrag">Auftrag</option><option value="Wartung">🔧 Wartung</option></select><div class="muted small">Bei Wartung wird der Termin beim Mitarbeiter eindeutig gekennzeichnet.</div>';
  task.insertAdjacentElement('afterend',wrap);
}
const baseNew=window.dg62New;
if(typeof baseNew==='function')window.dg62New=function(){const r=baseNew.apply(this,arguments);ensurePlannerType();$('d36PlannerType').disabled=false;$('d36PlannerType').value='Auftrag';return r;};
const baseEdit=window.dg62Edit;
if(typeof baseEdit==='function')window.dg62Edit=function(id){const r=baseEdit.apply(this,arguments);ensurePlannerType();const ev=plannerMap[String(id)]||{};$('d36PlannerType').value=ev.type==='Wartung'?'Wartung':'Auftrag';$('d36PlannerType').disabled=!!ev.external;return r;};
const baseCopy=window.dg62CopyCurrent;
if(typeof baseCopy==='function')window.dg62CopyCurrent=function(){ensurePlannerType();const type=$('d36PlannerType').value;const r=baseCopy.apply(this,arguments);ensurePlannerType();$('d36PlannerType').disabled=false;$('d36PlannerType').value=type;return r;};
const basePlannerLoad=window.dg62Load;
if(typeof basePlannerLoad==='function')window.dg62Load=async function(){const r=await basePlannerLoad.apply(this,arguments);[...document.querySelectorAll('.dg62-event[data-event-id]')].forEach(el=>{const ev=plannerMap[String(el.dataset.eventId)];const maintenance=ev&&ev.type==='Wartung';el.classList.toggle('d36-maintenance-event',!!maintenance);if(maintenance&&!el.querySelector('.d36-planner-badge'))el.insertAdjacentHTML('beforeend','<span class="d36-planner-badge">🔧 WARTUNG</span>');});return r;};

window.d36LoadMaintenance=async function(){
  const st=$('d36MaintenanceStatus'),list=$('d36MaintenanceList');if(!list)return;
  setMessage('d36MaintenanceStatus','Wartungsverträge werden geladen ...','info');
  try{const rows=await api(chefPayload({action:'getMaintenanceContracts'}));DG3.maintenance=rows||[];list.innerHTML=(rows||[]).map((x,i)=>'<div class="report-card'+(i%2?' d3-alt':'')+'"><div class="d3-head"><strong>🔧 '+esc(x.customer)+'</strong><span class="badge">'+esc(x.status||'Wartung')+'</span></div>'+(x.address?'<div>'+esc(x.address)+'</div>':'')+(x.task?'<div class="report-meta">'+esc(x.task)+'</div>':'')+(x.plannedDate?'<div class="status info">Geplanter Wartungstermin: '+esc(formatDateDE(x.plannedDate))+'</div>':'')+(x.nextMaintenanceDue?'<div class="status ok">Nächste Wartung fällig: '+esc(formatMaintenanceDue(x.nextMaintenanceDue))+'</div>':'')+((x.employees||[]).length?'<div class="report-meta"><strong>Mitarbeiter:</strong> '+esc(x.employees.join(', '))+'</div>':'')+'</div>').join('')||'<div class="status ok">Noch keine Wartungsverträge bzw. Wartungsaufträge vorhanden.</div>';setMessage('d36MaintenanceStatus',(rows||[]).length+' Wartung(en) / Wartungsvertrag(-verträge).','ok');d3Count('maintenance',(rows||[]).length);}catch(e){setMessage('d36MaintenanceStatus',e.message,'error');d3Count('maintenance','!');}
};

const baseInstallOffice=d3InstallOffice;
d3InstallOffice=function(){
  baseInstallOffice.apply(this,arguments);
  const root=$('bossView');if(!root||$('d36Maintenance'))return;
  const c=d3Section('d36Maintenance','Wartungsverträge','<div class="muted small">Wartungsaufträge und die zuletzt gemeldete nächste Wartungsfälligkeit.</div><div id="d36MaintenanceStatus"></div><div id="d36MaintenanceList"></div>');
  const reminder=$('d3Reminder');root.insertBefore(c,reminder||null);c.classList.add('d3-main');d3Wire(c);d3Collapse(c,true);DG3.loaders.d36Maintenance=d36LoadMaintenance;
  [...root.querySelectorAll(':scope > .d3-main')].forEach((x,i)=>x.classList.toggle('d3-alt',i%2===1));
  const dash=root.querySelector('.d3-dashboard'),offers=dash?.querySelector('.d3-tile.offers');if(dash&&!dash.querySelector('.d3-tile.maintenance')){const b=document.createElement('button');b.type='button';b.className='d3-tile maintenance';b.dataset.d3Fn='d3Open';b.dataset.d3Args=JSON.stringify(['d36Maintenance','']);b.innerHTML='<span>Wartungen</span><strong id="d3Count-maintenance">…</strong>';if(offers)offers.insertAdjacentElement('afterend',b);else dash.append(b);}
};
const baseDashboard=d3Dashboard;
d3Dashboard=async function(){const r=await baseDashboard.apply(this,arguments);if(canAccessBoss()&&navigator.onLine){try{const rows=await api(chefPayload({action:'getMaintenanceContracts'}));d3Count('maintenance',(rows||[]).length);}catch(_e){d3Count('maintenance','!');}}return r;};

const baseStartup=d3Startup;
d3Startup=function(){const r=baseStartup.apply(this,arguments);setTimeout(()=>{ensureEmployeeMaintenanceField();ensurePlannerType();},0);return r;};
})();
