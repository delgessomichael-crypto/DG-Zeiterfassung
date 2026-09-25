/* DG App 10 - Angebots-Papierkorb + globale Kundensuche */
(function(){
'use strict';
const VERSION='20260925-1745-trash-search-counter1';
const q=id=>document.getElementById(id);
const esc=v=>String(v==null?'':v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function payload(x){
  if(typeof window.chefPayload==='function')return window.chefPayload(x);
  if(typeof window.bossPayload10==='function')return window.bossPayload10(x);
  const employee=localStorage.getItem('dg_employee')||'';
  const employeePin=localStorage.getItem('dg_device_session')||localStorage.getItem('dg_employee_pin')||'';
  return Object.assign({employee,employeePin},x||{});
}
async function call(x){
  if(typeof window.api!=='function')throw new Error('App-Verbindung ist noch nicht bereit.');
  return window.api(payload(x));
}
function ensureCss(){
  if(q('dgTrashSearchCss'))return;
  const s=document.createElement('style');s.id='dgTrashSearchCss';
  s.textContent=`
    .dg-trash-btn{width:100%;padding:17px 20px!important;margin:8px 0 14px!important;font-size:20px!important;font-weight:900!important;background:#a33a2b!important;color:#fff!important;border-color:#a33a2b!important}
    .dg-search-btn{width:100%;padding:12px 16px!important;margin:8px 0 12px!important;font-weight:850!important;background:#405fa7!important;color:#fff!important;border-color:#405fa7!important}
    .dg-overlay{position:fixed;inset:0;z-index:200000;background:rgba(15,23,42,.58);display:flex;align-items:center;justify-content:center;padding:16px}
    .dg-modal{width:min(1080px,97vw);max-height:92vh;overflow:auto;background:#fff;border-radius:18px;padding:18px;box-shadow:0 24px 80px rgba(0,0,0,.3)}
    .dg-modal-head{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:12px}
    .dg-modal-head h2{margin:0}
    .dg-close{border:0;background:#e5e7eb;border-radius:10px;width:42px;height:42px;font-size:24px;font-weight:900;cursor:pointer}
    .dg-search-input{width:100%;box-sizing:border-box;padding:14px 16px;border:1px solid #cbd5e1;border-radius:12px;font-size:18px}
    .dg-result-group{margin-top:18px}
    .dg-result-group h3{margin:0 0 8px;color:#334155}
    .dg-result-card{border:1px solid #dbe3ee;border-radius:12px;padding:12px;margin-bottom:8px;background:#f8fafc}
    .dg-result-card strong{font-size:17px}
    .dg-meta{color:#64748b;font-size:13px;margin-top:4px}
    .dg-actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:10px}
    .dg-trash-card{border:1px solid #efb4ad;border-radius:12px;padding:13px;margin:10px 0;background:#fff7f6}
    .dg-trash-card strong{font-size:17px}
  `;document.head.appendChild(s);
}
function closeOverlay(id){q(id)?.remove();}
function formatDate(v){try{return new Date(v).toLocaleString('de-DE');}catch(_e){return String(v||'');}}

async function refreshTrashCount(){
  const b=q('dgOfferTrashButton');if(!b)return;
  try{
    const rows=await call({action:'getDeletedOffersV10'});
    b.textContent='🗑 Papierkorb'+(Array.isArray(rows)&&rows.length?' ('+rows.length+')':'');
  }catch(_e){b.textContent='🗑 Papierkorb';}
}
async function openTrash(){
  closeOverlay('dgOfferTrashOverlay');ensureCss();
  const o=document.createElement('div');o.id='dgOfferTrashOverlay';o.className='dg-overlay';
  o.innerHTML='<div class="dg-modal"><div class="dg-modal-head"><h2>Gelöschte Angebotserstellungen</h2><button type="button" class="dg-close" data-close>×</button></div><div id="dgOfferTrashStatus" class="status info">Papierkorb wird geladen ...</div><div id="dgOfferTrashList"></div></div>';
  document.body.appendChild(o);
  o.addEventListener('click',async e=>{
    if(e.target===o||e.target.closest('[data-close]')){o.remove();return;}
    const restore=e.target.closest('[data-restore]'),purge=e.target.closest('[data-purge]');
    if(restore){
      const id=restore.dataset.restore;if(!confirm('Diesen Angebotsvorgang wiederherstellen?'))return;
      restore.disabled=true;
      try{
        await call({action:'restoreDiscardedOfferV10',offerId:id});
        await renderTrash();
        if(typeof window.loadOffers==='function')await window.loadOffers('Zu erstellen');
        if(typeof window.d3Dashboard==='function')await window.d3Dashboard(true);
        await refreshTrashCount();
      }catch(err){alert(err.message);}finally{restore.disabled=false;}
      return;
    }
    if(purge){
      const id=purge.dataset.purge;
      if(!confirm('Diesen Angebotsvorgang ENDGÜLTIG aus dem Papierkorb löschen?\n\nArbeitszeit-Nachweise bleiben erhalten, der Angebotsvorgang kann danach aber nicht mehr über den Papierkorb wiederhergestellt werden.'))return;
      purge.disabled=true;
      try{await call({action:'purgeDiscardedOfferV10',offerId:id});await renderTrash();await refreshTrashCount();}
      catch(err){alert(err.message);}finally{purge.disabled=false;}
    }
  });
  await renderTrash();
}
async function renderTrash(){
  const st=q('dgOfferTrashStatus'),list=q('dgOfferTrashList');if(!st||!list)return;
  st.className='status info';st.textContent='Papierkorb wird geladen ...';
  try{
    const rows=await call({action:'getDeletedOffersV10'});
    list.innerHTML=(rows||[]).map(r=>'<div class="dg-trash-card"><strong>'+esc(r.customer||'Ohne Kundenname')+'</strong>'+
      '<div class="dg-meta">Angebot: '+esc(r.offerId||'')+' · gelöscht '+esc(formatDate(r.deletedAt))+(r.deletedBy?' · von '+esc(r.deletedBy):'')+'</div>'+
      (r.description?'<div style="margin-top:6px">'+esc(r.description)+'</div>':'')+
      '<div class="dg-actions"><button type="button" class="btn success" data-restore="'+esc(r.offerId)+'">Wiederherstellen</button>'+
      '<button type="button" class="btn danger" data-purge="'+esc(r.offerId)+'">Endgültig löschen</button></div></div>').join('')||
      '<div class="status ok">Papierkorb ist leer.</div>';
    st.className='status ok';st.textContent=(rows||[]).length+' gelöschte Angebotserstellung(en).';
  }catch(e){st.className='status error';st.textContent=e.message;}
}
function ensureTrashButton(){
  const panel=q('d3OfferCreate');if(!panel||q('dgOfferTrashButton'))return;
  const status=q('d3OfferCreateStatus');
  const b=document.createElement('button');b.type='button';b.id='dgOfferTrashButton';b.className='btn danger dg-trash-btn';b.textContent='🗑 Papierkorb';b.onclick=openTrash;
  if(status&&status.parentElement)status.parentElement.insertBefore(b,status);else panel.prepend(b);
  refreshTrashCount();
}

let searchTimer=0;
function searchTargets(){
  const explicit=['d3Inquiries','d3Running','d3Completed','d3OfferOpen','d3OfferCreate','d3OfferArchive','d3Reminder','d36Maintenance','dg62PlannerCard','regieCard','dg10AccountingSection'];
  const out=new Set(explicit.map(q).filter(Boolean));
  document.querySelectorAll('#bossView .card,#bossView .d3-panel,#bossView section').forEach(el=>{
    const h=el.querySelector(':scope > h2,:scope > h3,:scope .dg48-head h2');
    const t=String(h&&h.textContent||'');
    if(/Anfrag|Angebot|Auftrag|Rechnung|Wartung|Kalender|Reminder|WhatsApp|Kunde/i.test(t))out.add(el);
  });
  return [...out];
}
function ensureSearchButtons(){
  for(const panel of searchTargets()){
    const buttons=[...panel.querySelectorAll('button')].filter(b=>{
      const owner=b.closest('.d3-panel,.card,section');
      return owner===panel&&(/Kunde\\s+suchen/i.test(String(b.textContent||''))||b.classList.contains('dg-customer-search-btn'));
    });
    let b=buttons.shift()||null;
    buttons.forEach(x=>x.remove());
    if(!b){
      b=document.createElement('button');b.type='button';
      const h=panel.querySelector(':scope > h2,:scope > h3,:scope > .dg48-head');
      if(h)h.insertAdjacentElement('afterend',b);else panel.prepend(b);
    }
    b.className='btn primary dg-search-btn dg-customer-search-btn';
    b.textContent='🔎 Kunde suchen';
    b.onclick=openSearch;
  }
}
function openSearch(){
  closeOverlay('dgCustomerSearchOverlay');ensureCss();
  const o=document.createElement('div');o.id='dgCustomerSearchOverlay';o.className='dg-overlay';
  o.innerHTML='<div class="dg-modal"><div class="dg-modal-head"><h2>Kunde suchen</h2><button type="button" class="dg-close" data-close>×</button></div>'+
    '<input id="dgCustomerSearchInput" class="dg-search-input" placeholder="Name, Telefonnummer, Kunden-/Angebots-/Auftragsnummer oder Teilbegriff wie Mü" autocomplete="off">'+
    '<div id="dgCustomerSearchStatus" class="dg-meta" style="margin-top:8px">Mindestens 2 Zeichen eingeben.</div><div id="dgCustomerSearchResults"></div></div>';
  document.body.appendChild(o);
  o.addEventListener('click',e=>{if(e.target===o||e.target.closest('[data-close]'))o.remove();});
  const inp=q('dgCustomerSearchInput');inp.focus();
  inp.addEventListener('input',()=>{clearTimeout(searchTimer);searchTimer=setTimeout(()=>runSearch(inp.value),220);});
}
async function runSearch(value){
  const term=String(value||'').trim(),st=q('dgCustomerSearchStatus'),host=q('dgCustomerSearchResults');if(!st||!host)return;
  if(term.length<2){st.textContent='Mindestens 2 Zeichen eingeben.';host.innerHTML='';return;}
  st.textContent='Suche läuft ...';
  try{
    const rows=await call({action:'searchCustomersV10',query:term}),groups={};
    for(const r of rows||[])(groups[r.source]||(groups[r.source]=[])).push(r);
    host.innerHTML=Object.keys(groups).sort((a,b)=>a.localeCompare(b,'de')).map(source=>
      '<div class="dg-result-group"><h3>'+esc(source)+' · '+groups[source].length+'</h3>'+
      groups[source].map(r=>'<div class="dg-result-card"><strong>'+esc(r.customer||'Ohne Kundenname')+'</strong>'+
        '<div class="dg-meta">'+esc([r.id,r.status,r.extra].filter(Boolean).join(' · '))+'</div>'+
        (r.detail?'<div style="margin-top:5px">'+esc(r.detail)+'</div>':'')+
        '<div class="dg-meta">'+esc([r.phone,r.email].filter(Boolean).join(' · '))+'</div></div>').join('')+'</div>'
    ).join('')||'<div class="status ok" style="margin-top:12px">Keine passenden Einträge gefunden.</div>';
    st.textContent=(rows||[]).length+' passende Einträge gefunden.';
  }catch(e){st.textContent=e.message;host.innerHTML='';}
}
function ensureTopSearchButton(){
  const host=document.querySelector('#bossView .dg80-final-top');if(!host)return;
  let b=q('dgGlobalCustomerSearch');
  const duplicates=[...host.querySelectorAll('[data-dg80-top="search"],#dgGlobalCustomerSearch')];
  if(!b)b=duplicates.shift()||null;
  duplicates.filter(x=>x!==b).forEach(x=>x.remove());
  if(!b){
    b=document.createElement('button');b.type='button';b.id='dgGlobalCustomerSearch';
    b.className='dg80-final-top-btn';b.dataset.dg80Top='search';b.draggable=false;
    b.innerHTML='<span>Kunde suchen</span><strong>🔎</strong>';
  }
  if(!q('dgGlobalCustomerSearchCss')){
    const s=document.createElement('style');s.id='dgGlobalCustomerSearchCss';
    s.textContent='#dgGlobalCustomerSearch{background:#dbeafe!important;border-color:#93c5fd!important;color:#1d4ed8!important}#dgGlobalCustomerSearch span,#dgGlobalCustomerSearch strong{color:#1d4ed8!important}';
    document.head.appendChild(s);
  }
  b.onclick=e=>{e.preventDefault();e.stopPropagation();openSearch();};
  const save=q('dg80FinalSave'),cal=q('dg80FinalCalendar');
  if(save&&save.parentElement===host){
    if(host.firstElementChild!==save)host.prepend(save);
    save.insertAdjacentElement('afterend',b);
  }else if(b.parentElement!==host)host.prepend(b);
  if(cal&&cal.parentElement===host&&cal.previousElementSibling!==b)b.insertAdjacentElement('afterend',cal);
}
window.dgOpenCustomerSearchV10=openSearch;

function install(){
  ensureCss();ensureTrashButton();ensureSearchButtons();ensureTopSearchButton();
  clearInterval(window.__dgTrashSearchInt);
  window.__dgTrashSearchInt=setInterval(()=>{ensureTrashButton();ensureSearchButtons();ensureTopSearchButton();},1200);
  document.documentElement.dataset.dgTrashSearch=VERSION;
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});else install();
})();

/* DG App 10 - autoritative dashboard counter audit.
   One backend refresh per hour; DOM repaint is local only so older UI hotfixes cannot overwrite counts. */
(function(){
'use strict';
const VERSION='20260925-1745-counter-audit1';
const TTL=3600000;
const q=id=>document.getElementById(id);
const S=window.DG10_COUNTERS=window.DG10_COUNTERS||{values:{},last:0,busy:null,observer:null,timer:null,wrapped:false};
const REG='dg80_created_offer_year_registry_v1';

function canBoss(){
  try{return typeof window.canAccessBoss==='function'?window.canAccessBoss():localStorage.getItem('dg_chef_access')==='1';}
  catch(_e){return false;}
}
function auth(x){
  if(typeof window.chefPayload==='function')return window.chefPayload(x);
  if(typeof window.bossPayload10==='function')return window.bossPayload10(x);
  return x;
}
async function call(x){
  if(typeof window.api!=='function')throw new Error('Backend nicht bereit.');
  return window.api(auth(x));
}
function arr(x){return Array.isArray(x)?x:[];}
function text(id,v){
  if(v===undefined||v===null)return;
  const e=q(id);if(e&&e.textContent!==String(v))e.textContent=String(v);
}
function pct(id,v){
  const n=Number(v);if(!Number.isFinite(n))return;
  text(id,Math.max(0,Math.min(100,Math.round(n)))+' %');
}
function norm(v){return String(v==null?'':v).trim().toLowerCase();}
function active(v){
  if(v===false||v===0||v===null)return false;
  return !['0','false','nein','no','inaktiv','inactive','gelöscht','geloescht','deleted'].includes(norm(v||'1'));
}
function manualOffer(x){return String(x&&x.source||'')==='Angebotsanfrage'||/^ANGREQ-/.test(String(x&&x.id||''));}
function manualStatus(x){return String(x&&x.status||'').trim();}
function parseDate(v){
  if(!v)return null;
  const s=String(v).trim();
  let m=s.match(/^(\\d{4})-(\\d{2})-(\\d{2})/);if(m)return new Date(+m[1],+m[2]-1,+m[3],12);
  m=s.match(/^(\\d{2})\\.(\\d{2})\\.(\\d{4})/);if(m)return new Date(+m[3],+m[2]-1,+m[1],12);
  const d=new Date(s);return isNaN(d)?null:d;
}
function registry(){try{return JSON.parse(localStorage.getItem(REG)||'{}')||{};}catch(_e){return {};}}
function manualYear(x,year,reg){
  const keys=['createdAt','createdDate','creationDate','dateCreated','createdOn','insertedAt','date'];
  for(const k of keys){const d=parseDate(x&&x[k]);if(d)return d.getFullYear();}
  const key='M:'+String(x&&x.id||x&&x.offerId||x&&x.offerNumber||x&&x.customer||'');
  if(reg[key]&&Number(reg[key].year))return Number(reg[key].year);
  reg[key]={year,firstSeen:new Date().toISOString(),exact:false};return year;
}
function isManualCreated(x){
  if(!manualOffer(x))return false;
  return ['Offenes Angebot','Angebot Abgelehnt','Angebot Angenommen','Laufend','Abgeschlossen','In Regiebericht uebernommen'].includes(manualStatus(x));
}
function dueReminder(x){
  if(x&&typeof x.isDue==='boolean')return x.isDue;
  const d=String(x&&x.dueDate||'').slice(0,10);if(!/^\\d{4}-\\d{2}-\\d{2}$/.test(d))return false;
  const n=new Date(),today=n.getFullYear()+'-'+String(n.getMonth()+1).padStart(2,'0')+'-'+String(n.getDate()).padStart(2,'0');
  return d<=today;
}
function dayCount(rows){
  if(typeof window.d35MandatoryDayClosure!=='function')return undefined;
  return arr(rows).reduce((n,x)=>n+arr(x&&x.days).filter(d=>window.d35MandatoryDayClosure(d)).length,0);
}
function offerMenu(v){
  document.querySelectorAll('#d3Offers .d3-menu [data-panel]').forEach(b=>{
    const p=b.getAttribute('data-panel');let n,label;
    if(p==='d3OfferCreate'){n=v.offerCreate;label='Angebote zu erstellen';}
    else if(p==='d3OfferOpen'){n=v.offerOpen;label='Offene Angebote';}
    else if(p==='d3OfferArchive'){n=v.offerArchive;label='Angebotsarchiv';}
    else return;
    if(n!==undefined)b.innerHTML=label+' <span class="dg60-count">'+Number(n||0)+'</span>';
  });
}
function subCount(key,v){document.querySelectorAll('[data-sub-count="'+key+'"]').forEach(e=>{if(e.textContent!==String(v))e.textContent=String(v);});}
function shoppingCount(){try{const a=JSON.parse(localStorage.getItem('dg71_shopping_lists_v1')||'[]');return Array.isArray(a)?a.length:0;}catch(_e){return 0;}}
function syncLegacyYearStates(n,year){
  if(Number.isFinite(Number(n))){
    const d=new Date(year,0,2,12),count=Math.max(0,Number(n));
    if(window.DG80_UI17)window.DG80_UI17.offers=Array.from({length:count},(_,i)=>({offerId:'DG10SYNC-'+i,__createdDate:d}));
    if(window.DG80_UI18)window.DG80_UI18.rows=Array.from({length:count},(_,i)=>({id:'DG10SYNC-'+i,__createdYear:year,__createdDate:d}));
  }
}
function paint(){
  const v=S.values||{};
  text('d3Count-completed',v.completed);
  text('d3Count-running',v.running);
  text('d3Count-offers',v.offerCreate);
  text('dg80c-offerOpen',v.offerOpen);
  text('dg80c-offerArchive',v.offerArchive);
  pct('dg80c-offerStats',v.offerAcceptance);
  text('dg80c-billed',v.billed);
  text('d3Count-days',v.days);
  text('d3Count-reminders',v.reminders);
  text('d3Count-inquiries',v.inquiries);
  text('d3Count-maintenance',v.maintenance);
  text('dg80c-partnerNetwork',v.partnerNetwork);
  text('dg80c-admin',v.admin);
  text('dg80c-calendar',v.calendar);
  text('d3Count-shopping',shoppingCount());
  text('dg80c-createdOffersYear',v.createdYear);
  offerMenu(v);
  if(v.regularInquiries!==undefined)subCount('regularInquiries',v.regularInquiries);
  if(v.aqonInquiries!==undefined)subCount('aqonInquiries',v.aqonInquiries);
  if(v.whatsappInquiries!==undefined)subCount('whatsappInquiries',v.whatsappInquiries);
  subCount('websiteInquiries',0);
  if(v.inquiryArchive!==undefined)subCount('inquiryArchive',v.inquiryArchive);
  const y=new Date().getFullYear(),b=q('dg80c-billed')?.closest('[data-dg80-final="billed"]')?.querySelector('span');
  if(b)b.textContent='Abgerechnete Aufträge '+y;
  const cy=q('dg80c-createdOffersYear')?.closest('[data-dg80-final="createdOffersYear"]')?.querySelector('span');
  if(cy)cy.textContent='Erstellte Angebote '+y;
}
async function refresh(force){
  if(!canBoss()||!navigator.onLine||typeof window.api!=='function'){paint();return S.values;}
  if(S.busy)return S.busy;
  if(!force&&S.last&&Date.now()-S.last<TTL){paint();return S.values;}
  S.busy=(async()=>{
    const now=new Date(),year=now.getFullYear(),month=now.getMonth()+1;
    const jobs=await Promise.allSettled([
      call({action:'getRegieReports',status:'Offen',year:0,month:0}),
      call({action:'getRegieReports',status:'Abgerechnet',year,month:0}),
      call({action:'getOfferReports',stage:'Zu erstellen'}),
      call({action:'getOfferReports',stage:'Offen'}),
      call({action:'getOfferReports',stage:'Archiv'}),
      call({action:'getManualOrders',status:'Alle'}),
      call({action:'getBossDayClosures',year,month}),
      call({action:'getOfferReminders',includeDone:false}),
      call({action:'getInquiryReminders',includeDone:false}),
      call({action:'getCustomerInquiries',status:'Offen'}),
      call({action:'getCustomerInquiries',status:'Archiviert'}),
      call({action:'getMaintenanceContracts'}),
      call({action:'getPartnerNetworkV10',force:false}),
      call({action:'getOfferStatistics'}),
      call({action:'getPlannerWorkers'}),
      call({action:'getWhatsappInboxV10',force:false}),
      call({action:'getEmployeeAdminData'})
    ]);
    const ok=i=>jobs[i].status==='fulfilled',val=i=>ok(i)?jobs[i].value:null,v=Object.assign({},S.values||{});
    if(ok(0)){const r=arr(val(0));v.running=r.filter(x=>String(x&&x.jobStatus||'')==='Laufend').length;v.completed=r.length-v.running;}
    const manual=ok(5)?arr(val(5)).filter(manualOffer):[];
    const mc=manual.filter(x=>manualStatus(x)==='Angebot zu erstellen').length;
    const mo=manual.filter(x=>manualStatus(x)==='Offenes Angebot').length;
    const ma=manual.filter(x=>manualStatus(x)==='Angebot Abgelehnt').length;
    if(ok(2))v.offerCreate=arr(val(2)).length+mc;
    if(ok(3))v.offerOpen=arr(val(3)).length+mo;
    if(ok(4))v.offerArchive=arr(val(4)).length+ma;
    if(ok(1))v.billed=arr(val(1)).length;
    if(ok(6)){const n=dayCount(val(6));if(n!==undefined)v.days=n;}
    if(ok(7)||ok(8))v.reminders=(ok(7)?arr(val(7)).filter(dueReminder).length:0)+(ok(8)?arr(val(8)).filter(dueReminder).length:0);
    let open=ok(9)?arr(val(9)):null,wa=ok(15)&&val(15)&&Array.isArray(val(15).threads)?val(15).threads:null;
    if(open){
      v.aqonInquiries=open.filter(x=>String(x&&x.source||'').toUpperCase().includes('AQON')).length;
      v.regularInquiries=open.length-v.aqonInquiries;
    }
    if(wa)v.whatsappInquiries=wa.filter(x=>String(x&&x.status||'')==='Offen').length;
    if(open)v.inquiries=open.length+(v.whatsappInquiries||0);
    if(ok(10))v.inquiryArchive=arr(val(10)).length;
    if(ok(11))v.maintenance=arr(val(11)).length;
    if(ok(12))v.partnerNetwork=arr(val(12)).reduce((n,c)=>n+arr(c&&c.partners).length,0);
    if(ok(16))v.admin=arr(val(16)).length;
    if(ok(14)){
      const workers=arr(val(14)).filter(x=>x&&active(x.active)&&String(x.calendarId||'').trim());
      v.calendar=new Set(workers.map(x=>String(x.calendarId||'').trim()).filter(Boolean)).size;
    }
    if(ok(13)){
      const st=val(13)||{},accepted=Math.max(0,Number(st.accepted||0)),declined=Math.max(0,Number(st.declined||0));
      const maccept=manual.filter(x=>['Angebot Angenommen','Laufend','Abgeschlossen','In Regiebericht uebernommen'].includes(manualStatus(x))).length;
      const mdecline=ma,decided=accepted+declined+maccept+mdecline;
      v.offerAcceptance=decided?((accepted+maccept)/decided*100):0;
      let normalYear=0;
      arr(st.months).forEach(m=>{if(String(m&&m.month||'').startsWith(String(year)))normalYear+=Number(m&&m.total||0);});
      const reg=registry();let changed=false;
      const manualYearCount=manual.filter(x=>isManualCreated(x)&&manualYear(x,year,reg)===year).length;
      try{localStorage.setItem(REG,JSON.stringify(reg));changed=true;}catch(_e){}
      v.createdYear=normalYear+manualYearCount;
      syncLegacyYearStates(v.createdYear,year);
    }
    S.values=v;S.last=Date.now();paint();return v;
  })().finally(()=>{S.busy=null;});
  return S.busy;
}
function observe(){
  if(S.observer)return;
  const root=q('bossView');if(!root)return;
  S.observer=new MutationObserver(()=>{clearTimeout(S.timer);S.timer=setTimeout(paint,40);});
  S.observer.observe(root,{subtree:true,childList:true,characterData:true});
}
function wrap(){
  if(S.wrapped)return;S.wrapped=true;
  const dash=window.d3Dashboard;
  if(typeof dash==='function'){
    const w=async function(){const r=await dash.apply(this,arguments);await refresh(true);return r;};
    window.d3Dashboard=w;try{d3Dashboard=w;}catch(_e){}
  }
  const sync=window.dg80ManualAreaSync;
  if(typeof sync==='function'){
    window.dg80ManualAreaSync=async function(){const r=await sync.apply(this,arguments);await refresh(true);return r;};
  }
}
function install(){
  observe();wrap();paint();setTimeout(()=>refresh(false),350);
  clearInterval(window.__dg10CounterInterval);
  window.__dg10CounterInterval=setInterval(()=>{if(!document.hidden)refresh(false);},TTL);
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)refresh(false);});
  document.documentElement.dataset.dg10Counters=VERSION;
}
window.dg10RefreshDashboardCounters=refresh;
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});else install();
})();
