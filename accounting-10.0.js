/* DG App 10 - Rechnungswesen / Gmail workflow */
(function(){
'use strict';
const V='20260924-1835-finance-delete5';
const q=id=>document.getElementById(id);
const MONTHS=['Januar','Februar','März','April','Mai','Juni','Juli','August','September','Oktober','November','Dezember'];
const state={incoming:[],tax:[],syncing:false,reconnectUrl:''};
function esc(v){return String(v==null?'':v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function boss(){return q('bossView');}
function dash(){return boss()?.querySelector(':scope > .d3-dashboard');}
function year(){return new Date().getFullYear();}
function month(){return new Date().getMonth()+1;}
function payload(extra){
  const employee=String(localStorage.getItem('dg_employee')||'').trim();
  const pin=String(localStorage.getItem('dg_device_session')||sessionStorage.getItem('dg_employee_pin')||'').trim();
  return Object.assign({employee,employeePin:pin,deviceSessionToken:pin},extra||{});
}
async function req(extra){if(typeof window.api!=='function')throw new Error('API nicht verfügbar.');return window.api(payload(extra));}
function de(v){if(!v)return '';try{return new Date(v).toLocaleString('de-DE',{dateStyle:'short',timeStyle:'short'});}catch(_e){return String(v);}}

function css(){
 if(q('dg10AccountingCss'))return;
 const s=document.createElement('style');s.id='dg10AccountingCss';
 s.textContent=
 '#bossView .dg10-accounting-section{margin-top:8px}'+
 '#bossView .dg10-accounting-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(145px,1fr));gap:12px;align-items:stretch}'+
 '#bossView .dg10-accounting-tile{background:#e8f7ea!important;color:#185c2c!important;border:1px solid #b9e4c1!important;min-height:118px!important;box-shadow:0 4px 14px rgba(15,23,42,.05)!important;cursor:pointer!important}'+
 '#bossView .dg10-accounting-tile>span,#bossView .dg10-accounting-tile>strong{color:#185c2c!important}'+
 '#bossView .dg10-accounting-add strong{font-size:44px!important;line-height:1!important}'+
 '#bossView .dg10-fin-archive-tile{background:#e8f7ea!important;color:#185c2c!important;border:1px solid #b9e4c1!important}'+
 '.dg10-account-card{padding:16px}.dg10-account-note{padding:14px;border:1px dashed #cbd5e1;border-radius:14px;background:#f8fafc;color:#475569;font-weight:700;line-height:1.45}'+
 '.dg10-fin-toolbar{display:flex;gap:9px;flex-wrap:wrap;align-items:center;margin:10px 0 14px}.dg10-fin-list{display:grid;gap:12px}'+
 '.dg10-fin-mail{border:1px solid #dbe3ec;border-radius:15px;padding:14px;background:#fff}.dg10-fin-mail:nth-child(even){background:#f8fafc}'+
 '.dg10-fin-head{display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap}.dg10-fin-subject{font-size:17px;font-weight:900}.dg10-fin-meta{color:#64748b;font-size:13px;margin-top:4px}'+
 '.dg10-fin-files{margin-top:8px;font-size:13px;color:#475569}.dg10-fin-actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:12px}'+
 '.dg10-fin-status{margin:8px 0}.dg10-account-filter{display:grid;grid-template-columns:minmax(150px,1fr) minmax(150px,1fr);gap:12px;margin:12px 0 16px}'+
 '.dg10-account-filter label{display:block;font-weight:900;margin-bottom:5px}.dg10-account-filter select{width:100%}'+
 '.dg10-account-archive-menu{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px;margin-top:14px}'+
 '.dg10-account-archive-menu button{min-height:86px;border:1px solid #b9e4c1;border-radius:15px;background:#e8f7ea;color:#185c2c;font:inherit;font-weight:900;padding:12px;cursor:pointer}'+
 '.dg10-account-back{margin-bottom:14px}@media(max-width:700px){#bossView .dg10-accounting-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.dg10-account-filter,.dg10-account-archive-menu{grid-template-columns:1fr}}';
 document.head.appendChild(s);
}
function monthOptions(sel){return MONTHS.map((n,i)=>'<option value="'+(i+1)+'" '+(i+1===sel?'selected':'')+'>'+esc(n)+'</option>').join('');}
function yearOptions(sel){let h='';for(let y=year()+1;y>=2020;y--)h+='<option value="'+y+'" '+(y===sel?'selected':'')+'>'+y+'</option>';return h;}
function filterHtml(key){return '<div class="dg10-account-filter"><div><label>Jahr</label><select data-dg10-year="'+key+'">'+yearOptions(year())+'</select></div><div><label>Monat</label><select data-dg10-month="'+key+'">'+monthOptions(month())+'</select></div></div>';}

function ensureCards(){
 const r=boss();if(!r)return;
 const specs=[
 ['dg10InvoiceIncoming','Allgemeiner Rechnungseingang','<h2>Allgemeiner Rechnungseingang</h2><div class="muted small">Alle erkannten Eingangsrechnungen aus Gmail – ausgenommen Nachrichten von Frau Busse.</div><div class="dg10-fin-toolbar"><button class="btn secondary" data-dg10-sync="incoming">Jetzt synchronisieren</button></div><div id="dg10IncomingStatus" class="dg10-fin-status"></div><div id="dg10IncomingList" class="dg10-fin-list"></div>'],
 ['dg10TaxAdvisor','Steuerberater – Frau Busse','<h2>Steuerberater – Frau Busse</h2><div class="muted small">Ausschließlich Nachrichten von kontakt@buchhaltung-busse.de.</div><div class="dg10-fin-toolbar"><button class="btn secondary" data-dg10-sync="tax">Jetzt synchronisieren</button></div><div id="dg10TaxStatus" class="dg10-fin-status"></div><div id="dg10TaxList" class="dg10-fin-list"></div>'],
 ['dg10FinanceArchive','Rechnungsarchiv','<h2>Rechnungsarchiv</h2><div class="muted small">Archiv immer nach Monat und Jahr.</div><div class="dg10-account-archive-menu"><button data-dg10-archive="created">Erstellte Rechnungen</button><button data-dg10-archive="paid">Bezahlte Rechnungen</button><button data-dg10-archive="tax">Steuerberater</button></div>'],
 ['dg10ArchiveCreated','Erstellte Rechnungen','<button class="btn secondary dg10-account-back" data-back>← Rechnungsarchiv</button><h2>Erstellte Rechnungen</h2>'+filterHtml('created')+'<div id="dg10ArchiveCreatedList" class="dg10-fin-list"></div>'],
 ['dg10ArchivePaid','Bezahlte Rechnungen','<button class="btn secondary dg10-account-back" data-back>← Rechnungsarchiv</button><h2>Bezahlte Rechnungen</h2>'+filterHtml('paid')+'<div id="dg10ArchivePaidList" class="dg10-fin-list"></div>'],
 ['dg10ArchiveTax','Steuerberater Archiv','<button class="btn secondary dg10-account-back" data-back>← Rechnungsarchiv</button><h2>Steuerberater</h2>'+filterHtml('tax')+'<div id="dg10ArchiveTaxList" class="dg10-fin-list"></div>'],
 ['dg10FinanceAdd','Bereich hinzufügen','<h2>Bereich hinzufügen</h2><div class="dg10-account-note">Die Plus-Kachel ist vorbereitet. Hier können später weitere Rechnungswesen-Bereiche manuell ergänzt werden.</div>']
 ];
 specs.forEach(([id,title,html])=>{let card=q(id);if(!card){card=document.createElement('div');card.id=id;card.className='card d3-main dg10-account-card';card.dataset.dg10Title=title;card.innerHTML=html;r.appendChild(card);}});
 wireCards();
}
function show(id,title,parent){
 const r=boss(),card=q(id);if(!r||!card)return;
 try{window.dg80OfficeClose?.();}catch(_e){}
 r.querySelectorAll(':scope > .dg80-shell-active').forEach(x=>x.classList.remove('dg80-shell-active'));
 card.classList.add('dg80-shell-active');q('dg80OfficeToolbar')?.classList.add('active');
 if(typeof window.dg80OfficeSetPath==='function')window.dg80OfficeSetPath(parent||'Rechnungswesen',title,false);
 else if(q('dg80OfficeTitle'))q('dg80OfficeTitle').textContent=(parent?parent+' > ':'')+title;
 setTimeout(()=>q('dg80OfficeToolbar')?.scrollIntoView({behavior:'smooth',block:'start'}),20);
}
function financeFilesHtml(files){
 return (Array.isArray(files)?files:[]).map(a=>{
   const name=String(a&&a.name||'Datei'),mime=String(a&&a.mime||''),url=String(a&&a.url||'');
   const label=/^image\//i.test(mime)?'🖼 '+name:(/pdf/i.test(mime)?'📄 '+name:'📎 '+name);
   if(url)return '<a class="btn secondary" target="_blank" rel="noopener" href="'+esc(url)+'">'+esc(label)+'</a>';
   return '<span class="btn secondary" style="opacity:.65;cursor:default">'+esc(label)+'</span>';
 }).join('');
}
function mailHtml(x,kind){
 const files=financeFilesHtml(x.attachments);
 let actions='<a class="btn secondary" target="_blank" rel="noopener" href="'+esc(x.gmailUrl||'#')+'">In Gmail öffnen</a>';
 if(kind==='incoming')actions+='<button class="btn success" data-paid="'+esc(x.messageId)+'">Als bezahlt markieren</button>';
 if(kind==='tax')actions+='<button class="btn success" data-tax-invoice="'+esc(x.messageId)+'">Als Rechnung markieren</button><button class="btn secondary" data-tax-archive="'+esc(x.messageId)+'">Archivieren</button>';
 actions+='<button class="btn danger" data-fin-delete="'+esc(x.messageId)+'">Löschen</button>';
 return '<div class="dg10-fin-mail"><div class="dg10-fin-head"><div><div class="dg10-fin-subject">'+esc(x.subject||'(ohne Betreff)')+'</div><div class="dg10-fin-meta">'+esc(x.senderName||x.senderEmail||'')+(x.senderEmail?' · '+esc(x.senderEmail):'')+'</div></div><strong>'+esc(de(x.receivedAt))+'</strong></div>'+(files?'<div class="dg10-fin-files"><div class="muted small" style="margin-bottom:6px"><strong>Anhänge</strong></div><div class="dg10-fin-actions">'+files+'</div></div>':'')+'<div class="dg10-fin-actions">'+actions+'</div></div>';
}
function googleReconnectHtml(url){
  return '<div class="status warn"><strong>Google-Freigabe muss einmalig aktualisiert werden.</strong><br>'+
    'Die bisherige Verbindung kann Gmail lesen, darf Nachrichten aber noch nicht verschieben oder mit Labels versehen.'+
    '<div style="margin-top:10px"><a class="btn primary" href="'+esc(url)+'" target="_blank" rel="noopener">Google-Freigabe aktualisieren</a></div></div>';
}
async function handleSync(area){
 if(state.syncing)return false;
 state.syncing=true;
 const target=area==='tax'?q('dg10TaxStatus'):q('dg10IncomingStatus');
 if(target)target.innerHTML='<div class="status info">Gmail wird synchronisiert …</div>';
 try{
   const r=await req({action:'syncFinanceGmailV10'});
   state.reconnectUrl=(r&&(r.needsReconnect||r.needsConnect)&&r.authUrl)?String(r.authUrl):'';
   if(target){
     target.innerHTML='<div class="status ok">Synchronisierung abgeschlossen: '+
       Number(r&&r.imported||0)+' Rechnung(en), '+Number(r&&r.tax||0)+' Steuerberater-Mail(s), '+
       Number(r&&r.failed||0)+' Fehler.</div>'+
       (state.reconnectUrl?googleReconnectHtml(state.reconnectUrl):'');
   }
   return true;
 }catch(e){
   const msg=e&&e.message?e.message:String(e);
   if(target)target.innerHTML='<div class="status error">Synchronisierung fehlgeschlagen: '+esc(msg)+'</div>';
   return false;
 }finally{state.syncing=false;}
}
async function refreshIncoming(){
 const host=q('dg10IncomingList'),st=q('dg10IncomingStatus');if(!host)return;
 try{
   const rows=await req({action:'getFinanceInboxV10'});state.incoming=rows||[];
   host.innerHTML=state.incoming.map(x=>mailHtml(x,'incoming')).join('')||'<div class="status ok">Keine offenen Eingangsrechnungen.</div>';
   if(st)st.innerHTML='<div class="status ok">'+state.incoming.length+' offene Rechnung(en) im allgemeinen Rechnungseingang.</div>'+(state.reconnectUrl?googleReconnectHtml(state.reconnectUrl):'');
 }catch(e){if(st)st.innerHTML='<div class="status error">'+esc(e.message)+'</div>';}
}
async function refreshTax(){
 const host=q('dg10TaxList'),st=q('dg10TaxStatus');if(!host)return;
 try{
   const rows=await req({action:'getTaxAdvisorInboxV10'});state.tax=rows||[];
   host.innerHTML=state.tax.map(x=>mailHtml(x,'tax')).join('')||'<div class="status ok">Keine offenen Nachrichten von Frau Busse.</div>';
   if(st)st.innerHTML='<div class="status ok">'+state.tax.length+' Nachricht(en) von Frau Busse.</div>'+(state.reconnectUrl?googleReconnectHtml(state.reconnectUrl):'');
 }catch(e){if(st)st.innerHTML='<div class="status error">'+esc(e.message)+'</div>';}
}
async function loadIncoming(sync){
 show('dg10InvoiceIncoming','Allgemeiner Rechnungseingang','Rechnungswesen');
 const ok=sync?await handleSync('incoming'):true;
 if(ok)await refreshIncoming();
}
async function loadTax(sync){
 show('dg10TaxAdvisor','Steuerberater – Frau Busse','Rechnungswesen');
 const ok=sync?await handleSync('tax'):true;
 if(ok)await refreshTax();
}
async function loadArchive(kind){
 const y=Number(document.querySelector('[data-dg10-year="'+kind+'"]')?.value||year()),m=Number(document.querySelector('[data-dg10-month="'+kind+'"]')?.value||month());
 if(kind==='created'){
   const host=q('dg10ArchiveCreatedList');if(!host)return;
   try{
     const rows=await req({action:'getRegieReports',status:'Abgerechnet',year:y,month:m});
     host.innerHTML=(rows||[]).map(x=>'<div class="dg10-fin-mail"><div class="dg10-fin-subject">'+esc(x.customer||'Auftrag')+'</div><div class="dg10-fin-meta">'+esc(x.firstDate||'')+(x.lastDate&&x.lastDate!==x.firstDate?' bis '+esc(x.lastDate):'')+' · '+Number(x.reports?.length||0)+' Bericht(e)</div></div>').join('')||'<div class="status ok">Keine erstellten Rechnungen in '+MONTHS[m-1]+' '+y+'.</div>';
   }catch(e){host.innerHTML='<div class="status error">'+esc(e.message)+'</div>';}
   return;
 }
 const host=q(kind==='paid'?'dg10ArchivePaidList':'dg10ArchiveTaxList');if(!host)return;
 try{
   const rows=await req({action:'getFinanceArchiveV10',kind,year:y,month:m});
   host.innerHTML=(rows||[]).map(x=>'<div class="dg10-fin-mail"><div class="dg10-fin-subject">'+esc(x.subject||'(ohne Betreff)')+'</div><div class="dg10-fin-meta">'+esc(x.senderName||x.senderEmail||'')+' · '+esc(kind==='paid'?'Bezahlt: '+de(x.paidAt):'Archiviert: '+de(x.archivedAt))+'</div>'+(financeFilesHtml(x.attachments)?'<div class="dg10-fin-files"><div class="muted small" style="margin:8px 0 6px"><strong>Anhänge</strong></div><div class="dg10-fin-actions">'+financeFilesHtml(x.attachments)+'</div></div>':'')+'<div class="dg10-fin-actions"><a class="btn secondary" target="_blank" rel="noopener" href="'+esc(x.gmailUrl||'#')+'">In Gmail öffnen</a><button class="btn danger" data-fin-delete="'+esc(x.messageId)+'">Löschen</button></div></div>').join('')||'<div class="status ok">Keine Einträge in '+MONTHS[m-1]+' '+y+'.</div>';
 }catch(e){host.innerHTML='<div class="status error">'+esc(e.message)+'</div>';}
}
function openArchive(kind){
 if(kind==='created'){show('dg10ArchiveCreated','Erstellte Rechnungen','Rechnungsarchiv');setTimeout(()=>loadArchive('created'),0);}
 else if(kind==='paid'){show('dg10ArchivePaid','Bezahlte Rechnungen','Rechnungsarchiv');setTimeout(()=>loadArchive('paid'),0);}
 else {show('dg10ArchiveTax','Steuerberater','Rechnungsarchiv');setTimeout(()=>loadArchive('tax'),0);}
}
function wireCards(){
 const root=boss();if(!root||root.dataset.dg10FinanceWired)return;
 root.dataset.dg10FinanceWired='1';
 root.addEventListener('click',async e=>{
   const sync=e.target.closest('[data-dg10-sync]');if(sync){
     e.preventDefault();
     sync.disabled=true;
     const area=String(sync.dataset.dg10Sync||'incoming');
     try{
       const ok=await handleSync(area);
       if(ok){if(area==='tax')await refreshTax();else await refreshIncoming();}
     }finally{sync.disabled=false;}
     return;
   }
   const paid=e.target.closest('[data-paid]');if(paid){e.preventDefault();paid.disabled=true;try{await req({action:'markFinancePaidV10',messageId:paid.dataset.paid});await refreshIncoming();}finally{paid.disabled=false;}return;}
   const del=e.target.closest('[data-fin-delete]');if(del){
     e.preventDefault();
     if(!confirm('Diese E-Mail wirklich löschen? Sie wird aus der App entfernt und in Gmail in den Papierkorb verschoben.'))return;
     del.disabled=true;
     try{
       await req({action:'deleteFinanceMailV10',messageId:del.dataset.finDelete});
       const active=q('bossView')?.querySelector('.dg80-shell-active');
       if(active?.id==='dg10InvoiceIncoming')await refreshIncoming();
       else if(active?.id==='dg10TaxAdvisor')await refreshTax();
       else if(active?.id==='dg10ArchivePaid')await loadArchive('paid');
       else if(active?.id==='dg10ArchiveTax')await loadArchive('tax');
       await refreshCounts();
     }finally{del.disabled=false;}
     return;
   }

   const ti=e.target.closest('[data-tax-invoice]');if(ti){e.preventDefault();ti.disabled=true;try{await req({action:'markTaxMailAsInvoiceV10',messageId:ti.dataset.taxInvoice});await refreshTax();}finally{ti.disabled=false;}return;}
   const ta=e.target.closest('[data-tax-archive]');if(ta){e.preventDefault();ta.disabled=true;try{await req({action:'archiveTaxAdvisorMailV10',messageId:ta.dataset.taxArchive});await refreshTax();}finally{ta.disabled=false;}return;}
   const ar=e.target.closest('[data-dg10-archive]');if(ar){e.preventDefault();openArchive(ar.dataset.dg10Archive);return;}
   if(e.target.closest('[data-back]')){e.preventDefault();show('dg10FinanceArchive','Rechnungsarchiv','Archive & Auswertung');return;}
 },{capture:false});
 root.addEventListener('change',e=>{const k=e.target?.dataset?.dg10Year||e.target?.dataset?.dg10Month;if(k)loadArchive(k);});
}
function tile(key,label,count,extra){return '<button type="button" class="d3-tile dg10-accounting-tile '+(extra||'')+'" data-dg10-account="'+esc(key)+'"><span>'+esc(label)+'</span><strong>'+esc(count||'›')+'</strong></button>';}
function installSection(){
 const d=dash();if(!d)return false;css();ensureCards();
 d.querySelector('[data-dg80-final="completed"]')?.remove();
 let sec=d.querySelector(':scope > .dg10-accounting-section');
 if(!sec){
   sec=document.createElement('section');sec.className='dg80-final-section dg10-accounting-section';sec.dataset.section='accounting';
   sec.innerHTML='<div class="dg80-final-section-title">Rechnungswesen</div><div class="dg10-accounting-grid">'+tile('create','Rechnungen zu erstellen','…')+tile('incoming','Rechnungseingang','…')+tile('tax','Steuerberater','…')+tile('add','', '+','dg10-accounting-add')+'</div>';
   const admin=d.querySelector(':scope > .dg80-final-section[data-section="admin"]');if(admin)d.insertBefore(sec,admin);else d.appendChild(sec);
   sec.addEventListener('click',e=>{
     const b=e.target.closest('[data-dg10-account]');if(!b)return;e.preventDefault();e.stopPropagation();
     const k=b.dataset.dg10Account;
     if(k==='create'){window.dg80OfficeOpen?.('completed',{force:true});setTimeout(()=>window.dg80OfficeSetPath?.('Rechnungswesen','Rechnungen zu erstellen',false),0);}
     else if(k==='incoming')loadIncoming(true);
     else if(k==='tax')loadTax(true);
     else if(k==='add')show('dg10FinanceAdd','Bereich hinzufügen','Rechnungswesen');
   },true);
 }
 let archiveSec=d.querySelector(':scope > .dg80-final-section[data-section="archive"]');
 if(archiveSec&&!archiveSec.querySelector('[data-dg10-fin-archive]')){
   const grid=archiveSec.querySelector('.dg80-final-grid')||archiveSec;
   const b=document.createElement('button');b.type='button';b.className='d3-tile dg80-final-tile dg10-fin-archive-tile';b.dataset.dg10FinArchive='1';b.innerHTML='<span>Rechnungsarchiv</span><strong>›</strong>';
   b.addEventListener('click',e=>{e.preventDefault();e.stopPropagation();show('dg10FinanceArchive','Rechnungsarchiv','Archive & Auswertung');},true);grid.appendChild(b);
 }
 refreshCounts();
 return true;
}
async function refreshCounts(){
 try{
   const x=await req({action:'getFinanceOverviewV10'});
   const sec=dash()?.querySelector('.dg10-accounting-section');if(!sec)return;
   const a=sec.querySelector('[data-dg10-account="incoming"] strong'),t=sec.querySelector('[data-dg10-account="tax"] strong');
   if(a)a.textContent=String(x.incoming||0);if(t)t.textContent=String(x.tax||0);
   const c=sec.querySelector('[data-dg10-account="create"] strong'),old=q('d3Count-completed');if(c)c.textContent=old?.textContent||'…';
 }catch(_e){}
}
function install(){
 if(installSection())document.documentElement.dataset.dgAccounting=V;
 setInterval(()=>{installSection();refreshCounts();},20*60*1000);
 let tries=0;const retry=setInterval(()=>{tries++;installSection();if(tries>=20)clearInterval(retry);},250);
}
window.addEventListener('message',e=>{if(e.data&&e.data.type==='dg-gmail-connected')setTimeout(()=>{handleSync();refreshCounts();},900);});
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});else setTimeout(install,0);
})();
