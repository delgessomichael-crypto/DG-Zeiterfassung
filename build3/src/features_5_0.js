/* DG 5.0: final maintenance UX, clean calendar text, customer master list, stable refresh */
(function(){
'use strict';
const V='5.0';
const esc50=v=>String(v==null?'':v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const months50=['Januar','Februar','März','April','Mai','Juni','Juli','August','September','Oktober','November','Dezember'];
function due50(v){const m=/^(\d{4})-(\d{2})$/.exec(String(v||''));return m?months50[Number(m[2])-1]+' '+m[1]:String(v||'');}
function cleanCalendarText50(v){
  let s=String(v||'').replace(/\r/g,'\n');
  s=s.replace(/Terminart:\s*(?:Wartung|Auftrag)/gi,' ')
    .replace(/Was ist zu tun:\s*/gi,' ')
    .replace(/DG-Termin-ID:\s*[A-Za-z0-9@._-]+/gi,' ')
    .replace(/Wartung-Kunden-ID:\s*[A-Za-z0-9-]+/gi,' ')
    .replace(/Wartung-Objekt-ID:\s*[A-Za-z0-9-]+/gi,' ')
    .replace(/Wartung-(?:Geraet|Gerät)-ID:\s*[A-Za-z0-9-]+/gi,' ')
    .replace(/Geräte-ID:\s*\d+/gi,' ')
    .replace(/\s+/g,' ').trim();
  return s;
}
function internalId50(v){const m=String(v||'').match(/Geräte-ID:\s*(\d+)/i);return m?m[1]:'';}

/* Mitarbeiterkalender: ausschließlich lesbarer Auftragstext + sichtbare Geräte-ID. */
const renderCal50=window.renderCalendarEvents;
if(typeof renderCal50==='function')window.renderCalendarEvents=function(events){
  const clean=(Array.isArray(events)?events:[]).map(e=>{
    const raw=String(e.description||'');
    return Object.assign({},e,{description:cleanCalendarText50(raw),internalDeviceId:e.internalDeviceId||internalId50(raw)});
  });
  const r=renderCal50.call(this,clean);
  window.__dgCalendarEvents=clean;
  [...document.querySelectorAll('#calendarEvents .entry')].forEach((card,i)=>{
    const e=clean[i];if(!e||!e.internalDeviceId||card.querySelector('.d50-device-badge'))return;
    const b=document.createElement('div');b.className='d50-device-badge';b.textContent='Geräte-ID '+e.internalDeviceId;const strong=card.querySelector('strong');(strong||card).insertAdjacentElement(strong?'afterend':'afterbegin',b);
  });
  return r;
};

/* Wartungskunden: neuer Reiter "Alle Kunden" mit alphabetischem Bestand. */
function ensureAllCustomers50(){
  const nav=$('d37MaintenanceNav');if(!nav||$('d50AllCustomersBtn'))return;
  const b=document.createElement('button');b.type='button';b.id='d50AllCustomersBtn';b.dataset.tab='all';b.textContent='Alle Kunden';b.onclick=()=>d50OpenAllCustomers();nav.appendChild(b);
  const panel=document.createElement('div');panel.id='d50MaintenanceAll';panel.className='d37-maint-panel hidden';nav.parentElement.appendChild(panel);
}
window.d50OpenAllCustomers=async function(){
  ensureAllCustomers50();document.querySelectorAll('#d37MaintenanceNav [data-tab]').forEach(b=>b.classList.toggle('active',b.dataset.tab==='all'));
  document.querySelectorAll('#d37MaintenanceOverview,#d37MaintenanceCreate,#d37MaintenanceManage,#d37MaintenanceArchive,#d50MaintenanceAll').forEach(p=>p.classList.toggle('hidden',p.id!=='d50MaintenanceAll'));
  const host=$('d50MaintenanceAll');if(!host)return false;
  host.innerHTML='<div class="status info">Bestandskunden werden geladen …</div>';
  try{
    const rows=await api(chefPayload({action:'searchMaintenanceCustomers',query:''}));
    const sorted=(rows||[]).slice().sort((a,b)=>String(a.name||'').localeCompare(String(b.name||''),'de',{sensitivity:'base'}));
    host.innerHTML='<h3>Alle Wartungskunden ('+sorted.length+')</h3>'+(sorted.map(x=>'<button type="button" class="d50-customer-row" data-id="'+esc50(x.id)+'"><strong>'+esc50(x.name)+'</strong><span>'+Number(x.objectCount||0)+' Objekt(e) · '+Number(x.deviceCount||0)+' Gerät(e)</span><small>'+esc50(x.billingCity||'')+'</small></button>').join('')||'<div class="status ok">Noch keine Wartungskunden angelegt.</div>');
    host.querySelectorAll('.d50-customer-row').forEach(btn=>btn.onclick=async()=>{window.d37MaintenanceTab('manage');await window.d37OpenCustomer(btn.dataset.id);});
  }catch(e){host.innerHTML='<div class="status error">'+esc50(e.message)+'</div>';}
  return false;
};
const tab50=window.d37MaintenanceTab;
if(typeof tab50==='function')window.d37MaintenanceTab=function(tab){ensureAllCustomers50();if(tab==='all')return d50OpenAllCustomers();return tab50.apply(this,arguments);};

/* Büro-Regiebericht: Wartungs-Kontext vollständig und lesbar. */
window.d3Single=d3Single=function(r){
  const task=cleanCalendarText50(r.activity||'');
  let h='<div class="entry"><strong>'+esc(formatDateDE(r.date))+' - '+esc(r.employee)+' - '+formatHours(r.hours)+' Std.</strong><div>'+esc(r.start)+' - '+esc(r.end)+'</div><div>'+esc(task)+'</div>';
  if(r.maintenance){
    h+='<div class="d50-maint-report">';
    if(r.nextMaintenanceDue)h+='<div class="status ok"><strong>Nächste Wartung fällig:</strong> '+esc50(due50(r.nextMaintenanceDue))+'</div>';
    if(r.internalDeviceId)h+='<div><strong>Geräte-ID:</strong> '+esc50(r.internalDeviceId)+'</div>';
    if(r.billingName)h+='<div><strong>Rechnungsempfänger:</strong> '+esc50(r.billingName)+' · '+esc50([r.billingStreet,[r.billingZip,r.billingCity].filter(Boolean).join(' ')].filter(Boolean).join(', '))+'</div>';
    if(r.billingEmail||r.billingPhone)h+='<div class="report-meta">'+[r.billingEmail?('E-Mail: '+esc50(r.billingEmail)):'',r.billingPhone?('Telefon: '+esc50(r.billingPhone)):''].filter(Boolean).join(' · ')+'</div>';
    if(r.executionAddress)h+='<div><strong>Ausführungsort:</strong> '+esc50(r.executionObjectName||'')+(r.executionObjectName?' · ':'')+esc50(r.executionAddress)+'</div>';
    h+='</div>';
  }
  if(r.materialUsed)h+='<div>Material: '+esc(r.material)+'</div>';
  if(r.isSupplement)h+='<div class="status info">Nachtrag '+esc(r.supplementCreatedAt||'')+'</div>';
  return h+'</div>';
};

/* Auto-Sync: nie offene Bürobereiche/Formulare neu rendern. Nur Zähler aktualisieren. */
window.d3Sync=d3Sync=async function(){
  if(DG3.syncing||DG3.pending||document.hidden||!navigator.onLine||!DG3.ready||!auth().employee||d3Dirty())return;
  DG3.syncing=true;
  try{
    await syncQueue(false);
    if(d3Visible($('employeeView'))){await loadDay();await loadCalendarEvents();}
    else await d3Dashboard();
    if($('d3Sync'))$('d3Sync').textContent='Zuletzt aktualisiert: '+new Date().toLocaleTimeString('de-DE')+' · offene Auswahlbereiche bleiben unverändert.';
  }catch(e){if($('d3Sync'))$('d3Sync').textContent='Aktualisierung fehlgeschlagen: '+e.message;}
  finally{DG3.syncing=false;}
};

/* Finaler 5.0-Backendcheck: überschreibt die alte 3.x-Kompatibilitätsprüfung aus dem Altbestand. */
window.d3CheckBackend=d3CheckBackend=async function(){
  try{
    const r=await api({action:'ping'}),found=String(r&&r.version||''),ok=/^5(?:\.|$)/.test(found);
    DG3.backend=ok?found:'';
    if(!ok)d3Notice('App 5.0 benötigt Google-GS 5.0. Gefunden: '+(found||'unbekannt')+'. Speichern ist gesperrt.','warn');
    else $('d3Notice')?.remove();
    return ok;
  }catch(e){
    DG3.backend='';
    d3Notice('Verbindungsprüfung fehlgeschlagen: '+e.message,'warn');
    return false;
  }
};

try{DG3.version=V;window.DG_APP_VERSION=V;}catch(_e){}
const oldOpenMain50=window.openMain;
if(typeof oldOpenMain50==='function')window.openMain=function(){const r=oldOpenMain50.apply(this,arguments);setTimeout(ensureAllCustomers50,200);return r;};
const oldOpen50=window.d3Open;
if(typeof oldOpen50==='function')window.d3Open=function(){const r=oldOpen50.apply(this,arguments);setTimeout(ensureAllCustomers50,0);return r;};
})();
