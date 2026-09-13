/* DG 3.9: Mitarbeiter-Kalenderrefresh, Wartungs-Jahresampeln und interne Geräte-ID */
(function(){
'use strict';
const M39=window.DG39=window.DG39||{stats:null,lastDeviceSearch:null};
function esc39(v){return String(v==null?'':v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function fmtDevice39(x){return [x.deviceType==='Sonstiges'?(x.otherDescription||'Sonstiges'):x.deviceType,x.manufacturer,x.model,x.serialNumber?('SN '+x.serialNumber):''].filter(Boolean).join(' · ');}

const showEmployee39=window.showEmployee;
if(typeof showEmployee39==='function')window.showEmployee=function(){const r=showEmployee39.apply(this,arguments);if(navigator.onLine)setTimeout(()=>{try{loadCalendarEvents();}catch(_e){}},0);return r;};

function decorateDeviceIds39(){
  document.querySelectorAll('.d37-device').forEach(dev=>{
    if(dev.querySelector('.d39-device-id'))return;
    let data=null;
    try{
      const oi=Number(dev.closest('.d37-object')?.dataset.objectIndex||-1),di=Number(dev.dataset.deviceIndex||-1);
      data=window.DG37&&DG37.customer&&DG37.customer.objects&&DG37.customer.objects[oi]&&DG37.customer.objects[oi].devices?DG37.customer.objects[oi].devices[di]:null;
    }catch(_e){}
    const box=document.createElement('div');box.className='d39-device-id';
    box.innerHTML='<span>Interne Geräte-ID</span><strong>'+(data&&data.internalDeviceId?esc39(data.internalDeviceId):'<em>wird beim Speichern automatisch vergeben</em>')+'</strong>';
    const head=dev.querySelector('.d37-subhead');if(head)head.insertAdjacentElement('afterend',box);else dev.prepend(box);
  });
}
function ensureMaintenanceTop39(){
  const card=$('d36Maintenance');if(!card||$('d39MaintenanceTop'))return;
  const title=[...card.querySelectorAll('h2')].find(x=>(x.textContent||'').trim()==='Wartungsverträge');if(!title)return;
  const top=document.createElement('div');top.id='d39MaintenanceTop';
  top.innerHTML='<div class="d39-year-stats"><div class="d39-stat"><span id="d39TotalLabel">Wartungen total</span><strong id="d39Total">–</strong></div><div class="d39-stat"><span id="d39DoneLabel">Wartungen ausgeführt</span><strong id="d39Done">–</strong></div><div class="d39-stat"><span id="d39OpenLabel">Noch offene Wartungen</span><strong id="d39Open">–</strong></div></div><div class="d39-id-search"><label for="d39DeviceSearch">Geräte-ID suchen</label><div><input id="d39DeviceSearch" inputmode="numeric" placeholder="z. B. 1000"><button type="button" class="btn primary" onclick="return d39SearchDevice()">Suchen</button></div><div id="d39DeviceSearchResult"></div></div>';
  title.insertAdjacentElement('afterend',top);
}
function renderStats39(o){const s=o&&o.yearStats||null;if(!s)return;M39.stats=s;const y=s.year;if($('d39TotalLabel'))$('d39TotalLabel').textContent='Wartungen total '+y;if($('d39DoneLabel'))$('d39DoneLabel').textContent='Wartungen '+y+' ausgeführt';if($('d39OpenLabel'))$('d39OpenLabel').textContent='Noch offene Wartungen '+y;if($('d39Total'))$('d39Total').textContent=Number(s.total||0);if($('d39Done'))$('d39Done').textContent=Number(s.completed||0);if($('d39Open'))$('d39Open').textContent=Number(s.open||0);}
window.d39SearchDevice=async function(){const q=String($('d39DeviceSearch')?.value||'').trim(),host=$('d39DeviceSearchResult');if(!host)return false;if(!/^\d+$/.test(q)){host.innerHTML='<div class="status warn">Bitte eine Geräte-ID eingeben.</div>';return false;}host.innerHTML='<div class="status info">Gerät wird gesucht …</div>';try{const x=await api(chefPayload({action:'findMaintenanceDeviceByInternalId',internalDeviceId:q}));M39.lastDeviceSearch=x;host.innerHTML='<button type="button" class="d39-device-result" onclick="return d39OpenDeviceCustomer()"><strong>Geräte-ID '+esc39(x.internalDeviceId)+'</strong><span>'+esc39(x.customerName)+' · '+esc39(x.objectName)+'</span><small>'+esc39(fmtDevice39(x))+' · '+esc39(x.address||'')+'</small></button>';}catch(e){host.innerHTML='<div class="status error">'+esc39(e.message||'Gerät nicht gefunden.')+'</div>';}return false;};
window.d39OpenDeviceCustomer=function(){const x=M39.lastDeviceSearch;if(!x)return false;if(typeof window.d37MaintenanceTab==='function')window.d37MaintenanceTab('manage');setTimeout(async()=>{await window.d37OpenCustomer(x.customerId);decorateDeviceIds39();const dev=document.querySelector('.d37-device[data-device-id="'+CSS.escape(String(x.deviceId))+'"]');dev?.scrollIntoView({behavior:'smooth',block:'center'});},0);return false;};

const showMonth39=window.d37ShowMonth;
if(typeof showMonth39==='function')window.d37ShowMonth=function(key){const r=showMonth39.apply(this,arguments);setTimeout(()=>{const m=(window.DG37&&DG37.overview&&DG37.overview.months||[]).find(x=>x.key===key),cards=[...document.querySelectorAll('#d37MonthDetail .d37-maint-item')];cards.forEach((c,i)=>{const x=m&&m.items&&m.items[i];if(!x||!x.internalDeviceId||c.querySelector('.d39-card-id'))return;const d=document.createElement('div');d.className='d39-card-id';d.textContent='Geräte-ID: '+x.internalDeviceId;const meta=c.querySelector('.report-meta');(meta||c).insertAdjacentElement(meta?'beforebegin':'afterbegin',d);});},0);return r;};
const plan39=window.d37PlanMaintenance;
if(typeof plan39==='function')window.d37PlanMaintenance=function(customerId,objectId,deviceId){const all=(window.DG37&&DG37.overview?.months||[]).flatMap(m=>m.items||[]),x=all.find(r=>String(r.deviceId)===String(deviceId));const r=plan39.apply(this,arguments);setTimeout(()=>{if(x&&$('dg62Task'))$('dg62Task').value='Wartung · Geräte-ID '+(x.internalDeviceId||'–')+' · '+fmtDevice39(x);},0);return r;};

const api39=window.api;
if(typeof api39==='function')window.api=api=async function(payload){const r=await api39.apply(this,arguments);if(payload&&payload.action==='getMaintenanceOverview'){ensureMaintenanceTop39();renderStats39(r);setTimeout(decorateDeviceIds39,0);}if(payload&&payload.action==='getMaintenanceCustomer')setTimeout(decorateDeviceIds39,0);return r;};
const loadMaint39=window.d37LoadMaintenanceOverview;
if(typeof loadMaint39==='function')window.d37LoadMaintenanceOverview=async function(){ensureMaintenanceTop39();const r=await loadMaint39.apply(this,arguments);renderStats39((window.DG38&&DG38.overview)||(window.DG37&&DG37.overview)||{});setTimeout(decorateDeviceIds39,0);return r;};
const openMain39=window.openMain;
if(typeof openMain39==='function')window.openMain=function(){const r=openMain39.apply(this,arguments);setTimeout(()=>{ensureMaintenanceTop39();const o=(window.DG38&&DG38.overview)||(window.DG37&&DG37.overview);if(o)renderStats39(o);decorateDeviceIds39();},250);return r;};
const open39=window.d3Open;
if(typeof open39==='function')window.d3Open=function(){const r=open39.apply(this,arguments);setTimeout(()=>{ensureMaintenanceTop39();const o=(window.DG38&&DG38.overview)||(window.DG37&&DG37.overview);if(o)renderStats39(o);decorateDeviceIds39();},0);return r;};
})();
