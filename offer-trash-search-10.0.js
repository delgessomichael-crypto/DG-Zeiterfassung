/* DG App 10 - Angebots-Papierkorb + globale Kundensuche */
(function(){
'use strict';
const VERSION='20260925-1625-trash-search1';
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
    if(panel.querySelector(':scope > .dg-customer-search-btn'))continue;
    const b=document.createElement('button');b.type='button';b.className='btn primary dg-search-btn dg-customer-search-btn';b.textContent='🔎 Kunde suchen';b.onclick=openSearch;
    const h=panel.querySelector(':scope > h2,:scope > h3,:scope > .dg48-head');
    if(h)h.insertAdjacentElement('afterend',b);else panel.prepend(b);
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
function install(){
  ensureCss();ensureTrashButton();ensureSearchButtons();
  clearInterval(window.__dgTrashSearchInt);
  window.__dgTrashSearchInt=setInterval(()=>{ensureTrashButton();ensureSearchButtons();},1200);
  document.documentElement.dataset.dgTrashSearch=VERSION;
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});else install();
})();