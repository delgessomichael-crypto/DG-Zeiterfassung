/* DG 3.3: Trustlocal, safe email links, billed archive folders, extra regie attachments. */
const d33BaseInstallOffice=d3InstallOffice;
const d33BaseReportCard=d3ReportCard;
const d33BaseReports=d3Reports;

function d33ExternalInquiryLinks(r){
  let h='';
  if(r.externalUrl)h+='<a class="btn primary" target="_blank" rel="noopener noreferrer" href="'+esc(r.externalUrl)+'">'+(r.source==='Trustlocal'?'Anfrage bei Trustlocal öffnen':'Anfrage extern öffnen')+'</a>';
  if(r.phoneUrl)h+='<a class="btn secondary" target="_blank" rel="noopener noreferrer" href="'+esc(r.phoneUrl)+'">Kontaktdaten öffnen</a>';
  return h;
}
function d33ContactLinks(r){
  const p=r.phone?'<a target="_blank" rel="noopener noreferrer" href="tel:'+esc(r.phone)+'">'+esc(r.phone)+'</a>':'';
  const m=r.email?'<a target="_blank" rel="noopener noreferrer" href="mailto:'+esc(r.email)+'">'+esc(r.email)+'</a>':'';
  return [p,m].filter(Boolean).join(' ');
}
function d32InquiryCard(r,i,archive=false){
  const note=r.internalNote?'<div class="status info">Interne Notiz: '+esc(r.internalNote)+'</div>':'';
  const external=d33ExternalInquiryLinks(r);
  const actions=archive?'':d3Button('Termin wurde vereinbart','d3InquiryArchive',[r.id],'success')+d3Button('Reminder','d3InquiryReminder',[r.id],'primary')+d3Button('Interne Notiz','d3InquiryNote',[r.id])+d3Button('Ablehnen','d3RejectInquiry',[r.id],'danger');
  return '<div class="report-card'+(i%2?' d3-alt':'')+'"><div class="d3-head"><strong>'+esc(r.customer)+'</strong><span class="badge">'+esc(r.source)+'</span></div><div class="report-meta">'+esc(r.receivedAt)+' - '+esc(r.status)+'</div><div>'+esc(d3Address(r))+'</div>'+(d33ContactLinks(r)?'<div>'+d33ContactLinks(r)+'</div>':'')+'<div>'+esc(r.description||r.subject)+'</div>'+note+(archive&&r.doneReason?'<div class="muted small">Archiviert: '+esc(r.doneReason)+'</div>':'')+((external||actions)?'<div class="report-actions">'+external+actions+'</div>':'')+'</div>';
}

async function loadReminders(){
  setMessage('d3ReminderStatus','Reminder werden geladen ...','info');
  try{
    const [offers,inquiries]=await Promise.all([api(chefPayload({action:'getOfferReminders',includeDone:false})),api(chefPayload({action:'getInquiryReminders',includeDone:false}))]);
    DG3.offerReminders=offers;DG3.inquiryReminders=inquiries;
    const offerHtml=offers.map((r,i)=>'<div class="report-card'+(i%2?' d3-alt':'')+'"><div class="d3-head"><strong>'+esc(r.customer)+' - '+esc(r.offerNumber)+'</strong><span class="badge">Angebot</span></div><div class="status '+(r.isOverdue?'warn':'info')+'">Fällig: '+esc(formatDateDE(r.dueDate))+'</div><div>'+esc(r.description)+'</div><div>Telefon: <a target="_blank" rel="noopener noreferrer" href="tel:'+esc(r.phone)+'">'+esc(r.phone)+'</a></div><div class="report-actions">'+d3Button('Angenommen','d3ReminderDecision',[r.id,true],'success')+d3Button('Kein Auftrag','d3ReminderDecision',[r.id,false],'secondary')+d3Button('Verschieben','d3ReminderDate',[r.id])+'</div></div>').join('');
    const inquiryHtml=inquiries.map((r,i)=>'<div class="report-card'+((offers.length+i)%2?' d3-alt':'')+'"><div class="d3-head"><strong>'+esc(r.customer)+'</strong><span class="badge">Anfrage · '+esc(r.source)+'</span></div><div class="status '+(r.isOverdue?'warn':'info')+'">Erinnerung: '+esc(formatDateDE(r.dueDate))+'</div><div>'+esc(r.description)+'</div>'+(r.internalNote?'<div class="status info">Interne Notiz: '+esc(r.internalNote)+'</div>':'')+'<div class="report-actions">'+d33ExternalInquiryLinks(r)+d3Button('Zurück zu offenen Anfragen','d3InquiryReminderReopen',[r.id])+d3Button('Termin wurde vereinbart','d3InquiryReminderArchive',[r.id],'success')+d3Button('Interne Notiz','d3InquiryReminderNote',[r.id])+d3Button('Ablehnen','d3InquiryReminderReject',[r.id],'danger')+'</div></div>').join('');
    $('d3ReminderList').innerHTML=offerHtml+inquiryHtml||'Keine offenen Reminder.';
    const due=offers.filter(x=>x.isDue).length+inquiries.filter(x=>x.isDue).length;setMessage('d3ReminderStatus',(offers.length+inquiries.length)+' offene Reminder, '+due+' fällig.','ok');d3Count('reminders',due);
  }catch(e){setMessage('d3ReminderStatus',e.message,'error');}
}

function d33BilledParts(g){
  const s=String(g.billedAt||'');let m=s.match(/(\d{2})\.(\d{2})\.(\d{4})/);if(m)return{year:+m[3],month:+m[2]};
  m=String(g.lastDate||'').match(/^(\d{4})-(\d{2})-/);return m?{year:+m[1],month:+m[2]}:{year:0,month:0};
}
function d33RenderBilledMonth(year,month){
  const root=$('regieResult'),all=DG3.billedAll||[];if(!root)return;
  const groups=all.filter(g=>{const p=d33BilledParts(g);return p.year===year&&p.month===month;});DG3.reports.Abgerechnet=groups;
  const list=$('d33BilledList');if(!list)return;list.replaceChildren();groups.forEach((g,i)=>list.append(d3ReportCard(g,'Abgerechnet',i)));if(!groups.length)list.innerHTML='<div class="status ok">Keine abgerechneten Aufträge in diesem Monat.</div>';
  document.querySelectorAll('.d33-month').forEach(b=>b.classList.toggle('active',+b.dataset.year===year&&+b.dataset.month===month));
  setMessage('regieStatus',groups.length+' abgerechnete Kundenkarte(n) in '+String(month).padStart(2,'0')+' - '+year+' geladen.','ok');
}
async function d33LoadBilledArchive(){
  const root=$('regieResult');if(!root)return;DG3.active='Abgerechnet';window.__regieStatus='Abgerechnet';$('regieDateFilter')?.classList.add('hidden');setMessage('regieStatus','Abgerechnete Aufträge werden geladen ...','info');
  try{
    const all=await api(chefPayload({action:'getRegieReports',status:'Abgerechnet',year:0,month:0}));DG3.billedAll=all;root.replaceChildren();
    const map={};all.forEach(g=>{const p=d33BilledParts(g);if(!p.year)return;map[p.year]=map[p.year]||{};map[p.year][p.month]=(map[p.year][p.month]||0)+1;});
    const years=Object.keys(map).map(Number).sort((a,b)=>b-a);const nav=d3Element('div','d33-billed-nav');
    years.forEach((y,yi)=>{const total=Object.values(map[y]).reduce((a,b)=>a+b,0),det=document.createElement('details');det.className='d33-year';det.open=yi===0;const sum=document.createElement('summary');sum.textContent=y+' · '+total+' Auftrag'+(total===1?'':'e');det.append(sum);const months=d3Element('div','d33-months');Object.keys(map[y]).map(Number).sort((a,b)=>b-a).forEach(m=>{const b=document.createElement('button');b.type='button';b.className='d33-month';b.dataset.year=y;b.dataset.month=m;b.textContent=String(m).padStart(2,'0')+' - '+y+' · '+map[y][m]+' Auftrag'+(map[y][m]===1?'':'e');b.onclick=()=>d33RenderBilledMonth(y,m);months.append(b);});det.append(months);nav.append(det);});
    root.append(nav,d3Element('div','d33-billed-list'));root.lastElementChild.id='d33BilledList';
    if(years.length){const y=years[0],m=Math.max(...Object.keys(map[y]).map(Number));d33RenderBilledMonth(y,m);}else{root.innerHTML='<div class="status ok">Noch keine abgerechneten Aufträge.</div>';setMessage('regieStatus','Keine abgerechneten Aufträge.','ok');}
  }catch(e){setMessage('regieStatus','Laden fehlgeschlagen: '+e.message,'error');}
}
d3Reports=async function(view='Abgeschlossen'){if(view==='Abgerechnet')return d33LoadBilledArchive();return d33BaseReports(view);};

function d33ReadFile(file){return new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve({name:file.name,type:file.type||'application/octet-stream',dataUrl:r.result});r.onerror=()=>reject(new Error('Datei konnte nicht gelesen werden.'));r.readAsDataURL(file);});}
function d33AttachmentBox(card,g,view,index){
  if(view==='Abgerechnet')return;const ids=(g.objectIds||[g.objectId]).filter(Boolean);if(!ids.length)return;
  const box=d3Element('div','d33-attachments','<div class="d3-head"><strong>Zusätzliche Bilder / Dateien</strong><button type="button" class="btn primary d33-upload">Datei / Bild hinzufügen</button></div><div class="muted small">PDF, JPG, PNG oder WEBP · maximal 5 MB je Datei. Zusatzdateien werden automatisch in den Bericht-ZIP übernommen.</div><input class="d33-file-input hidden" type="file" accept="application/pdf,image/jpeg,image/png,image/webp" multiple><div class="d33-attachment-list muted small">Zusatzdateien werden geladen ...</div><div class="d33-attachment-status"></div>');
  const exportBox=card.querySelector('.d3-export');if(exportBox)exportBox.insertAdjacentElement('afterend',box);else card.append(box);
  const input=box.querySelector('.d33-file-input');box.querySelector('.d33-upload').onclick=()=>input.click();input.onchange=async()=>{const files=[...input.files];input.value='';if(!files.length)return;if(files.length>5)return alert('Bitte höchstens 5 Dateien auf einmal auswählen.');if(files.some(f=>f.size>5*1024*1024))return alert('Eine Datei ist größer als 5 MB.');const btn=box.querySelector('.d33-upload');btn.disabled=true;try{const payload=[];for(const f of files)payload.push(await d33ReadFile(f));await api(chefPayload({action:'addRegieAttachments',objectIds:ids,customer:g.customer,files:payload}));await d33LoadAttachments(box,ids);}catch(e){box.querySelector('.d33-attachment-status').innerHTML='<div class="status error">'+esc(e.message)+'</div>';}finally{btn.disabled=false;}};
  d33LoadAttachments(box,ids);
}
async function d33LoadAttachments(box,ids){
  const list=box.querySelector('.d33-attachment-list');try{const rows=await api(chefPayload({action:'getRegieAttachments',objectIds:ids}));if(!rows.length){list.textContent='Noch keine Zusatzdateien.';return;}const imageRows=rows.filter(r=>/^image\//.test(r.mime));list.innerHTML='';rows.forEach(r=>{const row=d3Element('div','d33-attachment-row');if(/^image\//.test(r.mime)){const b=document.createElement('button');b.type='button';b.className='d32-thumb d33-small-thumb';const img=document.createElement('img');img.src=d32Thumb(r.fileId);img.alt=esc(r.name);b.append(img);b.onclick=()=>{const items=imageRows.map(x=>({id:x.fileId,url:x.url}));d32GalleryOpen(items,Math.max(0,imageRows.findIndex(x=>x.id===r.id)));};row.append(b);}const a=document.createElement('a');a.href=r.url;a.target='_blank';a.rel='noopener noreferrer';a.textContent=r.name;row.append(a,d3Element('span','muted small',' · '+esc(r.uploadedAt)+' · '+esc(r.uploadedBy)));list.append(row);});}catch(e){list.innerHTML='<div class="status error">'+esc(e.message)+'</div>';}
}
d3ReportCard=function(g,view,index){const c=d33BaseReportCard(g,view,index);d33AttachmentBox(c,g,view,index);return c;};

function d33InstallBilledUi(){
  const filter=$('regieDateFilter');if(filter)filter.classList.add('d33-legacy-billed-filter');
}
d3InstallOffice=function(){d33BaseInstallOffice();d33InstallBilledUi();};
