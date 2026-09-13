/* DG 3.8: Wartungsverwaltung Feinschliff */
(function(){
'use strict';
const M38=window.DG38=window.DG38||{overview:null,loaded:false,customerCache:{}};
const months38=['Januar','Februar','März','April','Mai','Juni','Juli','August','September','Oktober','November','Dezember'];
function esc38(v){return String(v==null?'':v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function dueLabel38(v){if(!/^\d{4}-\d{2}$/.test(String(v||'')))return '';const [y,m]=String(v).split('-');return months38[Number(m)-1]+' '+y;}
function cleanTask38(v){let s=String(v||'');s=s.replace(/(?:^|\n)Terminart:\s*(?:Wartung|Auftrag)\s*/gi,'\n').replace(/(?:^|\n)Was ist zu tun:\s*/gi,'\n').replace(/^(?:\s*Was ist zu tun:\s*)+/gi,'').replace(/\s+/g,' ').trim();return s;}
function yearOptions38(selected){const y=new Date().getFullYear();let h='<option value="">Jahr</option>';for(let i=0;i<=5;i++){const v=String(y+i);h+='<option value="'+v+'" '+(v===String(selected||'')?'selected':'')+'>'+v+'</option>';}return h;}
function monthOptions38(selected){let h='<option value="">Monat</option>';months38.forEach((n,i)=>{const v=String(i+1).padStart(2,'0');h+='<option value="'+v+'" '+(v===String(selected||'')?'selected':'')+'>'+n+'</option>';});return h;}
function installMonthYear38(input,scope){if(!input||input.dataset.d38)return;input.dataset.d38='1';const value=String(input.value||''),p=/^(\d{4})-(\d{2})$/.exec(value)||[];input.type='hidden';const wrap=document.createElement('div');wrap.className='d38-month-year';wrap.innerHTML='<select class="d38-month">'+monthOptions38(p[2])+'</select><select class="d38-year">'+yearOptions38(p[1])+'</select>';input.insertAdjacentElement('afterend',wrap);const sync=()=>{const m=wrap.querySelector('.d38-month').value,y=wrap.querySelector('.d38-year').value;input.value=(m&&y)?(y+'-'+m):'';input.dispatchEvent(new Event('change',{bubbles:true}));};wrap.querySelectorAll('select').forEach(s=>s.addEventListener('change',sync));}
function scanMonthYear38(){const emp=$('d36NextMaintenance');if(emp)installMonthYear38(emp,'employee');document.querySelectorAll('.d37-customer-form input[data-d37="nextMaintenanceDue"]').forEach(x=>installMonthYear38(x,'customer'));}

/* Maintenance data is fetched once per app session, then cached until a real mutation. */
const api38=window.api;
if(typeof api38==='function')window.api=api=async function(payload){
  const action=payload&&payload.action;
  if(action==='getMaintenanceOverview'&&M38.loaded&&M38.overview)return M38.overview;
  if(action==='getMaintenanceCustomer'&&payload.id&&M38.customerCache[payload.id])return M38.customerCache[payload.id];
  if(action==='savePlannerEvent'&&payload.item&&window.DG37&&DG37.plannerLink){
    payload.item.type='Wartung';
    payload.item.maintenanceCustomerId=DG37.plannerLink.customerId||'';
    payload.item.maintenanceObjectId=DG37.plannerLink.objectId||'';
    payload.item.maintenanceDeviceId=DG37.plannerLink.deviceId||'';
  }
  const r=await api38.apply(this,arguments);
  if(action==='getMaintenanceOverview'){M38.overview=r||{};M38.loaded=true;if(window.DG37)DG37.overview=r||{};}
  if(action==='getMaintenanceCustomer'&&payload.id)M38.customerCache[payload.id]=r;
  if(['saveMaintenanceCustomer','deleteMaintenanceDevice','deleteMaintenanceCustomer','savePlannerEvent','deletePlannerEvent','saveEntry'].includes(action)){
    M38.loaded=false;M38.overview=null;if(window.DG37)DG37.overview=null;
    if(action==='saveMaintenanceCustomer'&&r&&r.id)M38.customerCache[r.id]=r;else if(action!=='savePlannerEvent'&&action!=='deletePlannerEvent'&&action!=='saveEntry')M38.customerCache={};
  }
  return r;
};
async function refreshMaintenance38(){try{M38.loaded=false;M38.overview=null;const o=await api(chefPayload({action:'getMaintenanceOverview'}));M38.overview=o||{};M38.loaded=true;if(window.DG37)DG37.overview=o||{};d3Count('maintenance',Number(o&&o.currentMonthOpen||0));if(typeof window.d37LoadMaintenanceOverview==='function'&&$('d37MaintenanceOverview'))await window.d37LoadMaintenanceOverview();}catch(_e){}}
window.d38RefreshMaintenance=refreshMaintenance38;

/* Employee maintenance due: month/year selects */
const take38=window.takeCalendarEvent;
if(typeof take38==='function')window.takeCalendarEvent=function(){const r=take38.apply(this,arguments);setTimeout(scanMonthYear38,0);return r;};
const reset38=window.resetEntry;
if(typeof reset38==='function')window.resetEntry=function(){const r=reset38.apply(this,arguments);setTimeout(scanMonthYear38,0);return r;};

/* Customer/device forms: month/year selects + obvious delete/edit controls. */
function decorateCustomer38(){
  scanMonthYear38();
  document.querySelectorAll('.d37-device').forEach(dev=>{if(dev.dataset.d38controls)return;dev.dataset.d38controls='1';const head=dev.querySelector('.d37-subhead');if(!head)return;const id=dev.dataset.deviceId||'';const edit=document.createElement('button');edit.type='button';edit.className='btn secondary d37-mini';edit.textContent='Gerät bearbeiten';edit.onclick=()=>{dev.querySelector('input,select,textarea')?.focus();dev.scrollIntoView({behavior:'smooth',block:'start'});};head.insertBefore(edit,head.lastElementChild);if(id){const del=head.querySelector('.btn.danger');if(del){del.onclick=()=>{d38DeleteDevice(id);return false;};del.textContent='Gerät löschen';}}
  });
  const form=document.querySelector('#d37CustomerEditHost .d37-customer-form');if(form&&!form.querySelector('.d38-delete-customer')){const id=form.querySelector('.d37CustomerId')?.value||'';if(id){const b=document.createElement('button');b.type='button';b.className='btn danger d38-delete-customer';b.textContent='Kompletten Kunden löschen';b.onclick=()=>d38DeleteCustomer(id);form.appendChild(b);}}
}
window.d38DeleteDevice=async function(id){if(!confirm('Dieses Wartungsgerät wirklich löschen? Wartungshistorie und alte Berichte bleiben im Archiv erhalten.'))return false;try{await api(chefPayload({action:'deleteMaintenanceDevice',id}));M38.customerCache={};await refreshMaintenance38();if(window.DG37&&DG37.customer&&DG37.customer.id){const c=await api(chefPayload({action:'getMaintenanceCustomer',id:DG37.customer.id}));if(typeof window.d37OpenCustomer==='function'){M38.customerCache[c.id]=c;await window.d37OpenCustomer(c.id);}}}catch(e){alert(e.message||'Gerät konnte nicht gelöscht werden.');}return false;};
window.d38DeleteCustomer=async function(id){if(!confirm('Kompletten Wartungskunden mit allen Objekten und Geräten löschen? Alte Wartungsberichte bleiben im Archiv erhalten.'))return false;try{await api(chefPayload({action:'deleteMaintenanceCustomer',id}));M38.customerCache={};await refreshMaintenance38();if($('d37CustomerEditHost')){$('d37CustomerEditHost').innerHTML='';$('d37CustomerEditHost').classList.add('hidden');}if(typeof window.d37SearchCustomers==='function')await window.d37SearchCustomers();}catch(e){alert(e.message||'Kunde konnte nicht gelöscht werden.');}return false;};
['d37AddObject','d37AddDevice','d37RemoveObject','d37RemoveDevice','d37SaveCustomer','d37OpenCustomer','d37MaintenanceTab'].forEach(name=>{const f=window[name];if(typeof f!=='function')return;window[name]=async function(){const r=await f.apply(this,arguments);setTimeout(decorateCustomer38,0);return r;};});

/* Overview: clickable customer and cached rendering. */
const showMonth38=window.d37ShowMonth;
if(typeof showMonth38==='function')window.d37ShowMonth=function(key){const r=showMonth38.apply(this,arguments);setTimeout(()=>{const m=(window.DG37&&DG37.overview&&DG37.overview.months||[]).find(x=>x.key===key),host=$('d37MonthDetail');if(!m||!host)return;[...host.querySelectorAll('.d37-maint-item')].forEach((card,i)=>{const x=(m.items||[])[i],strong=card.querySelector('.d3-head strong');if(!x||!strong)return;strong.style.cursor='pointer';strong.title='Kundendatensatz öffnen';strong.onclick=()=>d38OpenCustomerFromOverview(x.customerId);});},0);return r;};
window.d38OpenCustomerFromOverview=async function(id){if(typeof window.d37MaintenanceTab==='function')window.d37MaintenanceTab('manage');setTimeout(async()=>{try{await window.d37OpenCustomer(id);decorateCustomer38();}catch(_e){}},0);return false;};

/* Planning: always today or future, never preselect the first day of the due month. */
const plan38=window.d37PlanMaintenance;
if(typeof plan38==='function')window.d37PlanMaintenance=function(){const r=plan38.apply(this,arguments);setTimeout(()=>{const d=$('dg62ED');if(d){d.min=localDate();d.value=localDate();}scanMonthYear38();},0);return r;};
const savePlanner38=window.dg62Save;
if(typeof savePlanner38==='function')window.dg62Save=async function(){const type=$('d36PlannerType')?.value||'';if(type==='Wartung'){const d=$('dg62ED');if(d&&d.value<localDate()){status('dg62MS','Wartungstermine können nicht in die Vergangenheit gelegt werden.','error');d.value=localDate();return;}}const r=await savePlanner38.apply(this,arguments);setTimeout(refreshMaintenance38,0);return r;};
const delPlanner38=window.dg62Delete;
if(typeof delPlanner38==='function')window.dg62Delete=async function(){const r=await delPlanner38.apply(this,arguments);setTimeout(refreshMaintenance38,0);return r;};

/* Regiebericht: clean repeated labels and show next maintenance due. */
if(typeof window.d3Single==='function'||typeof d3Single==='function'){
  const d3Single38=function(r){const a=cleanTask38(r.activity||'');return '<div class="entry"><strong>'+esc(formatDateDE(r.date))+' - '+esc(r.employee)+' - '+formatHours(r.hours)+' Std.</strong><div>'+esc(r.start)+' - '+esc(r.end)+'</div><div>'+esc(a)+'</div>'+(r.maintenance&&r.nextMaintenanceDue?'<div class="status ok">Nächste Wartung fällig: '+esc(dueLabel38(r.nextMaintenanceDue))+'</div>':'')+(r.materialUsed?'<div>Material: '+esc(r.material)+'</div>':'')+(r.isSupplement?'<div class="status info">Nachtrag '+esc(r.supplementCreatedAt||'')+'</div>':'')+'</div>';};
  window.d3Single=d3Single=d3Single38;
}

/* Preload once after chef login; subsequent views use cache. */
const openMain38=window.openMain;
if(typeof openMain38==='function')window.openMain=function(){const r=openMain38.apply(this,arguments);setTimeout(async()=>{scanMonthYear38();decorateCustomer38();if(canAccessBoss()&&!M38.loaded){try{const o=await api(chefPayload({action:'getMaintenanceOverview'}));M38.overview=o||{};M38.loaded=true;d3Count('maintenance',Number(o&&o.currentMonthOpen||0));}catch(_e){}}},150);return r;};
const open38=window.d3Open;
if(typeof open38==='function')window.d3Open=function(){const r=open38.apply(this,arguments);setTimeout(()=>{decorateCustomer38();scanMonthYear38();},0);return r;};
})();
