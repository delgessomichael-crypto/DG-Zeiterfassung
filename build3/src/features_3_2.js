/* DG 3.2: dashboard traffic lights, inquiry workflow/archive/reminders, report gallery, AQON visibility cleanup. */
const d32BaseInstallOffice=d3InstallOffice;
const d32BaseReportCard=d3ReportCard;

function d32JumpTo(id){
  const target=$(id);if(!target)return;
  requestAnimationFrame(()=>window.scrollTo({top:Math.max(0,target.getBoundingClientRect().top+window.scrollY-8),behavior:'auto'}));
}
function d3TileOpen(id,child){d3Open(id,child);d32JumpTo(id);}
function d3OfferTileOpen(){
  const child=(DG3.offerCounts?.create>0&&!(DG3.offerCounts?.open>0))?'d3OfferCreate':'d3OfferOpen';
  d3TileOpen('d3Offers',child);
}
function d32RestyleMain(){
  [...$('bossView').children].filter(x=>x.classList.contains('d3-main')).forEach((c,i)=>c.classList.toggle('d3-alt',i%2===1));
}
function d32InstallInquiryGroup(){
  const root=$('bossView'),open=$('d3Inquiries');if(!root||!open||$('d3InquiriesGroup'))return;
  const archive=d3Section('d3InquiryArchive','Anfragenarchiv','<h3>Anfragenarchiv</h3><div id="d3InquiryArchiveStatus"></div><div id="d3InquiryArchiveList"></div>');
  const group=d3Group('d3InquiriesGroup','Offene Anfragen',[[open,'Offene Anfragen'],[archive,'Anfragenarchiv']]);
  open.classList.remove('d3-main','d3-alt');archive.classList.remove('d3-main','d3-alt');
  const before=$('d3Offers');root.insertBefore(group,before||null);group.classList.add('d3-main');d3Wire(group);d3Collapse(group,true);
  DG3.loaders.d3InquiryArchive=d3InquiryArchiveList;
  const tile=document.querySelector('.d3-tile.inquiries');if(tile){tile.dataset.d3Fn='d3TileOpen';tile.dataset.d3Args=JSON.stringify(['d3InquiriesGroup','d3Inquiries']);}
  d32RestyleMain();
}
function d32WireDashboardTiles(){
  document.querySelectorAll('.d3-tile').forEach(tile=>{
    if(tile.classList.contains('offers')){tile.dataset.d3Fn='d3OfferTileOpen';tile.dataset.d3Args='[]';return;}
    if(tile.classList.contains('inquiries'))return;
    const args=JSON.parse(tile.dataset.d3Args||'[]');tile.dataset.d3Fn='d3TileOpen';tile.dataset.d3Args=JSON.stringify(args);
  });
}
d3InstallOffice=function(){d32BaseInstallOffice();d32InstallInquiryGroup();d32WireDashboardTiles();};

function d3Count(k,v){
  const e=$('d3Count-'+k);if(!e)return;
  if(e.textContent!==String(v))e.textContent=String(v);
  const tile=e.closest('.d3-tile');if(!tile)return;
  tile.classList.remove('traffic-green','traffic-orange','traffic-red','traffic-error');
  const n=Number(v);
  if(!Number.isFinite(n)){tile.classList.add('traffic-error');return;}
  tile.classList.add(n===0?'traffic-green':n<=5?'traffic-orange':'traffic-red');
}
async function d3Dashboard(){
  if(!canAccessBoss()||!navigator.onLine)return;
  const d=new Date();
  const reportsP=api(chefPayload({action:'getRegieReports',status:'Offen',year:0,month:0}));
  const offerOpenP=api(chefPayload({action:'getOfferReports',stage:'Offen'}));
  const offerCreateP=api(chefPayload({action:'getOfferReports',stage:'Zu erstellen'}));
  const daysP=api(chefPayload({action:'getBossDayClosures',year:d.getFullYear(),month:d.getMonth()+1}));
  const offerRemP=api(chefPayload({action:'getOfferReminders',includeDone:false}));
  const inquiryRemP=api(chefPayload({action:'getInquiryReminders',includeDone:false}));
  const inquiriesP=api(chefPayload({action:'getCustomerInquiries',status:'Offen'}));
  const safe=async(p,fn,keys)=>{try{fn(await p);}catch(_e){keys.forEach(k=>d3Count(k,'!'));}};
  await Promise.all([
    safe(reportsP,a=>{d3Count('running',a.filter(g=>g.jobStatus==='Laufend').length);d3Count('completed',a.filter(g=>g.jobStatus!=='Laufend').length);},['running','completed']),
    safe(Promise.all([offerOpenP,offerCreateP]),([o,c])=>{DG3.offerCounts={open:o.length,create:c.length};d3Count('offers',o.length+c.length);},['offers']),
    safe(daysP,a=>d3Count('days',a.reduce((n,x)=>n+(x.days||[]).filter(q=>!q.closed).length,0)),['days']),
    safe(Promise.all([offerRemP,inquiryRemP]),([o,i])=>d3Count('reminders',o.filter(x=>x.isDue).length+i.filter(x=>x.isDue).length),['reminders']),
    safe(inquiriesP,a=>d3Count('inquiries',a.length),['inquiries'])
  ]);
}

function d32InquiryCard(r,i,archive=false){
  const note=r.internalNote?'<div class="status info">Interne Notiz: '+esc(r.internalNote)+'</div>':'';
  const actions=archive?'':d3Button('Termin wurde vereinbart','d3InquiryArchive',[r.id],'success')+d3Button('Reminder','d3InquiryReminder',[r.id],'primary')+d3Button('Interne Notiz','d3InquiryNote',[r.id])+d3Button('Ablehnen','d3RejectInquiry',[r.id],'danger');
  return '<div class="report-card'+(i%2?' d3-alt':'')+'"><div class="d3-head"><strong>'+esc(r.customer)+'</strong><span class="badge">'+esc(r.source)+'</span></div><div class="report-meta">'+esc(r.receivedAt)+' - '+esc(r.status)+'</div><div>'+esc(d3Address(r))+'</div><div><a href="tel:'+esc(r.phone)+'">'+esc(r.phone)+'</a> <a href="mailto:'+esc(r.email)+'">'+esc(r.email)+'</a></div><div>'+esc(r.description||r.subject)+'</div>'+note+(archive&&r.doneReason?'<div class="muted small">Archiviert: '+esc(r.doneReason)+'</div>':'')+(actions?'<div class="report-actions">'+actions+'</div>':'')+'</div>';
}
async function d3Inquiries(){
  setMessage('d3InquiryStatus','Anfragen werden geladen ...','info');
  try{DG3.inquiries=await api(chefPayload({action:'getCustomerInquiries',status:'Offen'}));$('d3InquiryList').innerHTML=DG3.inquiries.map((r,i)=>d32InquiryCard(r,i,false)).join('')||'Keine offenen Anfragen.';setMessage('d3InquiryStatus',DG3.inquiries.length+' offene Anfragen.','ok');d3Count('inquiries',DG3.inquiries.length);}catch(e){setMessage('d3InquiryStatus',e.message,'error');}
}
async function d3InquiryArchiveList(){
  setMessage('d3InquiryArchiveStatus','Archiv wird geladen ...','info');
  try{const rows=await api(chefPayload({action:'getCustomerInquiries',status:'Archiviert'}));$('d3InquiryArchiveList').innerHTML=rows.map((r,i)=>d32InquiryCard(r,i,true)).join('')||'Noch keine archivierten Anfragen.';setMessage('d3InquiryArchiveStatus',rows.length+' archivierte Anfrage(n).','ok');}catch(e){setMessage('d3InquiryArchiveStatus',e.message,'error');}
}
async function d3InquiryArchive(id){if(!confirm('Termin wurde vereinbart und Anfrage archivieren?'))return;await api(chefPayload({action:'archiveCustomerInquiry',id}));await d3Inquiries();await d3Dashboard();}
function d3InquiryReminder(id){
  const options=Array.from({length:10},(_,i)=>({value:String(i+1),label:(i+1)+' Tag'+(i?'e':'')}));
  d3Form('Erinnerung für Anfrage',[{name:'days',label:'Erinnerung in',type:'select',options}],{days:'5'},async v=>{await api(chefPayload({action:'createInquiryReminder',id,days:Number(v.days)}));await d3Inquiries();await d3Dashboard();});
}
async function d3RejectInquiry(id){if(!confirm('Anfrage endgültig aus der App entfernen und zugehörige Gmail-Nachricht in den Papierkorb verschieben?'))return;await api(chefPayload({action:'rejectCustomerInquiry',id}));await d3Inquiries();await d3Dashboard();}

async function loadReminders(){
  setMessage('d3ReminderStatus','Reminder werden geladen ...','info');
  try{
    const [offers,inquiries]=await Promise.all([api(chefPayload({action:'getOfferReminders',includeDone:false})),api(chefPayload({action:'getInquiryReminders',includeDone:false}))]);
    DG3.offerReminders=offers;DG3.inquiryReminders=inquiries;
    const offerHtml=offers.map((r,i)=>'<div class="report-card'+(i%2?' d3-alt':'')+'"><div class="d3-head"><strong>'+esc(r.customer)+' - '+esc(r.offerNumber)+'</strong><span class="badge">Angebot</span></div><div class="status '+(r.isOverdue?'warn':'info')+'">Fällig: '+esc(formatDateDE(r.dueDate))+'</div><div>'+esc(r.description)+'</div><div>Telefon: <a href="tel:'+esc(r.phone)+'">'+esc(r.phone)+'</a></div><div class="report-actions">'+d3Button('Angenommen','d3ReminderDecision',[r.id,true],'success')+d3Button('Kein Auftrag','d3ReminderDecision',[r.id,false],'secondary')+d3Button('Verschieben','d3ReminderDate',[r.id])+'</div></div>').join('');
    const inquiryHtml=inquiries.map((r,i)=>'<div class="report-card'+((offers.length+i)%2?' d3-alt':'')+'"><div class="d3-head"><strong>'+esc(r.customer)+'</strong><span class="badge">Anfrage · '+esc(r.source)+'</span></div><div class="status '+(r.isOverdue?'warn':'info')+'">Erinnerung: '+esc(formatDateDE(r.dueDate))+'</div><div>'+esc(r.description)+'</div>'+(r.internalNote?'<div class="status info">Interne Notiz: '+esc(r.internalNote)+'</div>':'')+'<div class="report-actions">'+d3Button('Zurück zu offenen Anfragen','d3InquiryReminderReopen',[r.id])+d3Button('Termin wurde vereinbart','d3InquiryReminderArchive',[r.id],'success')+d3Button('Interne Notiz','d3InquiryReminderNote',[r.id])+d3Button('Ablehnen','d3InquiryReminderReject',[r.id],'danger')+'</div></div>').join('');
    $('d3ReminderList').innerHTML=offerHtml+inquiryHtml||'Keine offenen Reminder.';
    const due=offers.filter(x=>x.isDue).length+inquiries.filter(x=>x.isDue).length;setMessage('d3ReminderStatus',(offers.length+inquiries.length)+' offene Reminder, '+due+' fällig.','ok');d3Count('reminders',due);
  }catch(e){setMessage('d3ReminderStatus',e.message,'error');}
}
async function d3ReminderDecision(id,yes){const r=(DG3.offerReminders||[]).find(x=>x.id===id);if(!r)throw new Error('Bitte neu laden.');const asRunning=yes&&r.totalHours>0?confirm('Als laufenden Auftrag übernehmen? OK=laufend, Abbrechen=angenommen archivieren.'):false;if(!confirm(yes?'Angebot annehmen?':'Angebot ablehnen?'))return;await api(chefPayload({action:yes?'acceptOfferFromReminder':'declineOfferFromReminder',reminderId:id,asRunning}));await loadReminders();await d3Dashboard();}
function d3ReminderDate(id){const r=(DG3.offerReminders||[]).find(x=>x.id===id);if(!r)throw new Error('Bitte neu laden.');d3Form('Reminder verschieben',[{name:'dueDate',label:'Neues Datum',type:'date',required:true}],r,async v=>{await api(chefPayload({action:'rescheduleOfferReminder',reminderId:id,dueDate:v.dueDate,days:0}));await loadReminders();await d3Dashboard();});}
async function d3InquiryReminderReopen(id){await api(chefPayload({action:'reopenInquiryReminder',reminderId:id}));await loadReminders();await d3Dashboard();}
async function d3InquiryReminderArchive(id){if(!confirm('Termin wurde vereinbart und Anfrage archivieren?'))return;await api(chefPayload({action:'archiveInquiryReminder',reminderId:id}));await loadReminders();await d3Dashboard();}
async function d3InquiryReminderReject(id){if(!confirm('Anfrage ablehnen und zugehörige Gmail-Nachricht in den Papierkorb verschieben?'))return;await api(chefPayload({action:'rejectInquiryReminder',reminderId:id}));await loadReminders();await d3Dashboard();}
function d3InquiryReminderNote(id){const r=(DG3.inquiryReminders||[]).find(x=>x.id===id);if(!r)throw new Error('Bitte neu laden.');d3Form('Interne Notiz',[{name:'note',label:'Notiz',type:'textarea'}],{note:r.internalNote||''},async v=>{await api(chefPayload({action:'saveCustomerInquiryNote',id:r.inquiryId,note:v.note}));await loadReminders();});}

function d32IsAqonOrder(r){return /\baqon\b/i.test([r.source,r.description,r.internalNote].filter(Boolean).join(' '));}
async function d3Orders(){
  DG3.orders=await api(chefPayload({action:'getManualOrders',status:'Alle'}));
  const rows=DG3.orders.filter(x=>!d32IsAqonOrder(x)&&['Ohne Termin','Termin zu vereinbaren','Offen','Laufend'].includes(x.status));
  $('d3OrderPlan').innerHTML='<div class="d3-head"><strong>Auftragsplanung</strong>'+d3Button('+ Auftrag anlegen','d3NewOrder',[],'success')+'</div>'+rows.map((r,i)=>'<div class="report-card'+(i%2?' d3-alt':'')+'"><strong>'+esc(r.customer)+'</strong> <span class="badge">'+esc(r.status)+'</span><div>'+esc(r.address)+'</div><div>'+esc(r.description)+'</div>'+(r.internalNote?'<div class="status info">'+esc(r.internalNote)+'</div>':'')+'<div class="report-actions">'+d3Button('Termin vereinbaren','d3Appointment',['order',r.id,false])+d3Button('Interne Notiz','d3OrderNote',[r.id])+d3Button(r.status==='Laufend'?'Abschließen':'Arbeit begonnen','d3OrderStatus',[r.id,r.status==='Laufend'?'Abgeschlossen':'Laufend'],'success')+(r.status!=='Laufend'?d3Button('Entfernen','d3OrderDelete',[r.id],'danger'):'')+'</div></div>').join('');
}

function d32Thumb(id,size='w240'){return 'https://drive.google.com/thumbnail?id='+encodeURIComponent(id)+'&sz='+size;}
function d32EnsureGallery(){
  if($('d32Gallery'))return;
  const m=d3Element('div','d32-gallery hidden','<div class="d32-gallery-box"><button type="button" class="d32-gallery-close" aria-label="Schließen">×</button><button type="button" class="d32-gallery-arrow d32-prev" aria-label="Vorheriges Bild">‹</button><img class="d32-gallery-image" alt="Bildvorschau"><button type="button" class="d32-gallery-arrow d32-next" aria-label="Nächstes Bild">›</button><div class="d32-gallery-foot"><strong class="d32-gallery-count"></strong><a class="d32-gallery-original" target="_blank" rel="noopener">Original öffnen</a></div></div>');
  m.id='d32Gallery';document.body.append(m);m.querySelector('.d32-gallery-close').onclick=d32GalleryClose;m.querySelector('.d32-prev').onclick=()=>d32GalleryMove(-1);m.querySelector('.d32-next').onclick=()=>d32GalleryMove(1);m.addEventListener('click',e=>{if(e.target===m)d32GalleryClose();});document.addEventListener('keydown',e=>{if(m.classList.contains('hidden'))return;if(e.key==='Escape')d32GalleryClose();if(e.key==='ArrowLeft')d32GalleryMove(-1);if(e.key==='ArrowRight')d32GalleryMove(1);});
}
function d32GalleryShow(){const m=$('d32Gallery'),g=DG3.gallery;if(!m||!g?.items?.length)return;g.index=(g.index+g.items.length)%g.items.length;const x=g.items[g.index];m.querySelector('.d32-gallery-image').src=d32Thumb(x.id,'w1600');m.querySelector('.d32-gallery-count').textContent='Bild '+(g.index+1)+' von '+g.items.length;const a=m.querySelector('.d32-gallery-original');a.href=x.url||d32Thumb(x.id,'w1600');a.classList.toggle('hidden',!a.href);}
function d32GalleryOpen(items,index){d32EnsureGallery();DG3.gallery={items,index};$('d32Gallery').classList.remove('hidden');d32GalleryShow();}
function d32GalleryMove(delta){if(!DG3.gallery)return;DG3.gallery.index+=delta;d32GalleryShow();}
function d32GalleryClose(){$('d32Gallery')?.classList.add('hidden');DG3.gallery=null;}
d3ReportCard=function(g,view,index){
  const c=d32BaseReportCard(g,view,index),box=c.querySelector('.d3-export');if(!box)return c;
  const labels=[...box.querySelectorAll('label.d3-selection')].filter(l=>l.querySelector('.d3-photo'));
  if(!labels.length)return c;
  const items=labels.map(l=>{const cb=l.querySelector('.d3-photo'),a=l.querySelector('a');return{id:cb.value,url:a?.href||''};});
  const grid=d3Element('div','d32-photo-grid');labels.forEach((old,i)=>{const cb=old.querySelector('.d3-photo');const item=d3Element('div','d32-photo-item');const check=document.createElement('label');check.className='d32-photo-check';check.append(cb,document.createTextNode(' Bild '+(i+1)));const b=document.createElement('button');b.type='button';b.className='d32-thumb';b.title='Bild '+(i+1)+' vergrößern';const img=document.createElement('img');img.src=d32Thumb(items[i].id);img.alt='Vorschau Bild '+(i+1);img.loading='lazy';b.append(img);b.addEventListener('click',e=>{e.preventDefault();e.stopPropagation();d32GalleryOpen(items,i);});item.append(b,check);grid.append(item);old.remove();});
  const download=[...box.querySelectorAll('button')].find(b=>b.textContent.includes('Bericht herunterladen'));if(download)box.insertBefore(grid,download);else box.append(grid);return c;
};
