/* DG 3.4: AQON PURE as separate inquiry queue with Gmail acknowledgement/links. */
const d34BaseInstallOffice=d3InstallOffice;

function d34SetAqonCount(n){
  const b=document.querySelector('#d3InquiriesGroup [data-panel="d34AqonInquiries"]');
  if(b)b.textContent='AQON PURE ANFRAGEN ('+Number(n||0)+')';
}
function d34InstallAqonPanel(){
  const group=$('d3InquiriesGroup');if(!group||$('d34AqonInquiries'))return;
  const menu=group.querySelector('.d3-menu'),host=group.querySelector('.d3-content');if(!menu||!host)return;
  const panel=d3Section('d34AqonInquiries','AQON PURE ANFRAGEN','<h3>AQON PURE ANFRAGEN</h3><div id="d34AqonStatus"></div><div id="d34AqonList"></div>');
  panel.classList.add('d3-panel','hidden');panel.querySelector(':scope > .dg48-head')?.remove();d3Body(panel)?.classList.remove('hidden');
  const b=d3Element('button','d34-aqon-menu','AQON PURE ANFRAGEN (0)');b.type='button';b.dataset.panel=panel.id;
  b.addEventListener('click',()=>{const y=menu.getBoundingClientRect().top;host.style.minHeight=Math.max(0,innerHeight-host.getBoundingClientRect().top)+'px';d3Open(group.id,panel.id);const delta=menu.getBoundingClientRect().top-y;if(Math.abs(delta)>1)window.scrollBy({top:delta,behavior:'instant'});});
  const archiveBtn=menu.querySelector('[data-panel="d3InquiryArchive"]'),archivePanel=$('d3InquiryArchive');
  menu.insertBefore(b,archiveBtn||null);host.insertBefore(panel,archivePanel||null);DG3.loaders.d34AqonInquiries=d34AqonInquiries;
}
d3InstallOffice=function(){d34BaseInstallOffice();d34InstallAqonPanel();};

function d34AqonLinks(r){
  let h='';
  if(r.dropboxUrl)h+='<a class="btn primary" target="_blank" rel="noopener noreferrer" href="'+esc(r.dropboxUrl)+'">Dropbox-Fotos öffnen</a>';
  if(r.aqonAppointmentUrl)h+='<a class="btn success" target="_blank" rel="noopener noreferrer" href="'+esc(r.aqonAppointmentUrl)+'">Termin bei AQON melden</a>';
  return h;
}
function d32InquiryCard(r,i,archive=false){
  const note=r.internalNote?'<div class="status info">Interne Notiz: '+esc(r.internalNote)+'</div>':'';
  const isAqon=r.source==='AQON PURE';
  const external=isAqon?d34AqonLinks(r):d33ExternalInquiryLinks(r);
  const details=isAqon&&r.aqonDetails?'<div class="d34-aqon-details"><strong>Auftragsinformationen aus der AQON-Mail</strong><pre>'+esc(r.aqonDetails)+'</pre></div>':'';
  const actions=archive?'':d3Button('Termin wurde vereinbart','d3InquiryArchive',[r.id],'success')+d3Button('Reminder','d3InquiryReminder',[r.id],'primary')+d3Button('Interne Notiz','d3InquiryNote',[r.id])+d3Button('Ablehnen','d3RejectInquiry',[r.id],'danger');
  return '<div class="report-card'+(i%2?' d3-alt':'')+'"><div class="d3-head"><strong>'+esc(r.customer)+'</strong><span class="badge">'+esc(r.source)+'</span></div><div class="report-meta">'+esc(r.receivedAt)+' - '+esc(r.status)+'</div><div>'+esc(d3Address(r))+'</div>'+(d33ContactLinks(r)?'<div>'+d33ContactLinks(r)+'</div>':'')+(isAqon?'':'<div>'+esc(r.description||r.subject)+'</div>')+details+note+(archive&&r.doneReason?'<div class="muted small">Archiviert: '+esc(r.doneReason)+'</div>':'')+((external||actions)?'<div class="report-actions">'+external+actions+'</div>':'')+'</div>';
}
async function d3Inquiries(){
  setMessage('d3InquiryStatus','Anfragen werden geladen ...','info');
  try{
    const all=await api(chefPayload({action:'getCustomerInquiries',status:'Offen'}));DG3.inquiries=all;
    const regular=all.filter(r=>r.source!=='AQON PURE'),aqon=all.filter(r=>r.source==='AQON PURE');
    $('d3InquiryList').innerHTML=regular.map((r,i)=>d32InquiryCard(r,i,false)).join('')||'Keine offenen allgemeinen Anfragen.';
    setMessage('d3InquiryStatus',regular.length+' offene allgemeine Anfrage(n).','ok');d34SetAqonCount(aqon.length);d3Count('inquiries',all.length);
  }catch(e){setMessage('d3InquiryStatus',e.message,'error');}
}
async function d34AqonInquiries(){
  setMessage('d34AqonStatus','AQON PURE Anfragen werden geladen ...','info');
  try{
    const all=await api(chefPayload({action:'getCustomerInquiries',status:'Offen'}));DG3.inquiries=all;const rows=all.filter(r=>r.source==='AQON PURE');
    $('d34AqonList').innerHTML=rows.map((r,i)=>d32InquiryCard(r,i,false)).join('')||'Keine offenen AQON PURE Anfragen.';
    setMessage('d34AqonStatus',rows.length+' offene AQON PURE Anfrage(n).','ok');d34SetAqonCount(rows.length);d3Count('inquiries',all.length);
  }catch(e){setMessage('d34AqonStatus',e.message,'error');}
}

const d34BaseImport=d3Import;
d3Import=async function(){
  setMessage('d3InquiryStatus','Gmail wird abgeglichen ...','info');
  try{
    const r=await api(chefPayload({action:'syncCustomerInquiries'}));
    const extra=(r.aqonReplied||r.aqonReplyErrors)?' · AQON bestätigt: '+Number(r.aqonReplied||0)+(r.aqonReplyErrors?' · Antwortfehler: '+r.aqonReplyErrors:''):'';
    setMessage('d3InquiryStatus','Gmail-Abgleich abgeschlossen: '+Number(r.imported||0)+' neu, '+Number(r.updated||0)+' aktualisiert'+extra+'.','ok');
    await d3Inquiries();await d3Dashboard();
    if(DG3.open==='d34AqonInquiries')await d34AqonInquiries();
  }catch(e){setMessage('d3InquiryStatus','Gmail-Abgleich fehlgeschlagen: '+e.message,'error');}
};
