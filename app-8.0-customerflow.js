/* DG Zeiterfassung 8.0 - customer matching, multi-location grouping and manual offer requests */
(function(){
'use strict';

var STATE={busy:false,lastRun:0,lastResult:null,manualOrders:[]};
window.DG81CustomerFlow=STATE;

function byId(id){return document.getElementById(id);}
function esc81(v){return String(v==null?'':v).replace(/[&<>"']/g,function(c){return({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c];});}
function norm81(v){
  var s=String(v==null?'':v).trim().toLowerCase();
  try{s=s.normalize('NFD').replace(/[̀-ͯ]/g,'');}catch(_e){}
  return s.replace(/ß/g,'ss').replace(/[^a-z0-9@.+-]+/g,' ').replace(/\s+/g,' ').trim();
}
function unique81(a){return Array.from(new Set((a||[]).filter(Boolean)));}
function intersects81(a,b){var s=new Set(a||[]);return (b||[]).some(function(x){return s.has(x);});}
function bool81(v){var s=norm81(v);return v===true||v===1||s==='ja'||s==='true'||s==='1';}
function parseDate81(v){var m=String(v||'').match(/(\d{4})-(\d{2})-(\d{2})/);return m?Date.UTC(+m[1],+m[2]-1,+m[3]):NaN;}
function gapDays81(a,b){
  var a1=parseDate81(a.firstDate),a2=parseDate81(a.lastDate||a.firstDate),b1=parseDate81(b.firstDate),b2=parseDate81(b.lastDate||b.firstDate);
  if(!isFinite(a1)||!isFinite(a2)||!isFinite(b1)||!isFinite(b2))return 9999;
  if(a2>=b1&&b2>=a1)return 0;
  return Math.round(Math.min(Math.abs(a1-b2),Math.abs(b1-a2))/86400000);
}
function customerName81(v){
  var s=String(v||'').trim();
  if(!s)return'';
  s=s.split(/s*,?s+-s+/)[0];
  var zip=s.search(/\bd{5}\b/);if(zip>0)s=s.slice(0,zip);
  s=s.replace(/([^)]*)/g,' ');
  s=norm81(s)
    .replace(/^(?:frau|herr|familie|fam|eheleute|firma|fa|dr|prof)\b.?s*/g,'')
    .replace(/\b(?:nk|bk|mh|wa|bes|wp|klima|aqon)\b/g,' ')
    .replace(/\bans*d+[a-z]?\b/g,' ')
    .replace(/\s+/g,' ').trim();
  return s;
}
function stripUnit81(v){
  var s=String(v||'').trim();
  s=s.replace(/\b(?:wohnung|whg.?|wohneinheit|we)s*[-:#]?s*[w.-]+.*$/i,'');
  s=s.replace(/(?:[,;s]+)(?:eg|dg|ug|kg|d+s*.?s*og)\b.*$/i,'');
  return s.replace(/[s,;-]+$/g,'').trim();
}
function addressDisplay81(v){
  if(!v)return'';
  var s=String(v).trim(),m=s.match(/s*,?s+-s+(.+)$/);
  if(m)s=m[1].trim();
  if(!/d/.test(s)&&!/stra(?:ss|ß)e|str.|weg|platz|allee|gasse|ring/i.test(s))return'';
  return stripUnit81(s);
}
function reportAddresses81(r){
  var raw=(r&&(r.executionAddress||r.address||r.location||r.siteAddress))||'';
  var a=[];
  if(raw)String(raw).split(/[
;|]+/).forEach(function(x){x=stripUnit81(x);if(x)a.push(x);});
  var fromCustomer=addressDisplay81(r&&r.customer);if(fromCustomer)a.push(fromCustomer);
  return unique81(a);
}
function addressKey81(v){
  var s=norm81(stripUnit81(v));
  return s.replace(/\bstrasse\b/g,'str').replace(/\bstr\b/g,'str').replace(/\s+/g,' ').trim();
}
function tokens81(text){
  var s=String(text||''),out=[],m;
  var rx=/\b(?:AN|ANG|AUF|BES|KT)s*[-:#]?s*[A-Z0-9-]{2,}\b/gi;
  while((m=rx.exec(s)))out.push(norm81(m[0]).replace(/\s+/g,''));
  return unique81(out);
}
function contacts81(text){
  var s=String(text||''),out=[],mail=s.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+.[A-Z]{2,}/gi)||[];
  mail.forEach(function(x){out.push('m:'+norm81(x));});
  var ph=s.match(/(?:+?49|0)[\ds()/-]{6,}/g)||[];
  ph.forEach(function(x){var d=x.replace(/D/g,'');if(d.length>=7)out.push('p:'+d.replace(/^49/,'0'));});
  return unique81(out);
}
function meta81(g){
  var reports=(g&&g.reports)||[],all=[g||{}].concat(reports),texts=[];
  all.forEach(function(r){texts.push(r.customer||'',r.activity||'',r.description||'',r.task||'',r.internalNote||'');});
  var joined=texts.join(' | '),names=unique81(all.map(function(r){return customerName81(r.customer||g.customer||'');})),addresses=[],sourceIds=[],maintCustomers=[],maintObjects=[];
  all.forEach(function(r){
    reportAddresses81(r).forEach(function(x){addresses.push(addressKey81(x));});
    [r.sourceCalendarEventId,r.calendarEventId,r.sourceEventId,r.googleEventId].forEach(function(x){if(x)sourceIds.push(String(x));});
    [r.maintenanceCustomerId,r.wartungCustomerId,r.wartungKundenId].forEach(function(x){if(x)maintCustomers.push(String(x));});
    [r.maintenanceObjectId,r.wartungObjectId,r.wartungObjektId].forEach(function(x){if(x)maintObjects.push(String(x));});
  });
  var displays=[];all.forEach(function(r){reportAddresses81(r).forEach(function(x){displays.push(x);});});
  var maintenance=all.some(function(r){return bool81(r.isMaintenance)||bool81(r.maintenance);})||/\bwartung(?:sauftrag|svertrag)?\b/i.test(joined);
  var detailed=displays.length>0||texts.some(function(x){return /\bd{5}\b/.test(String(x||''));});
  var bare=all.some(function(r){var c=String(r.customer||'').trim();return !!customerName81(c)&&!addressDisplay81(c)&&!/(?:d{5}|stra(?:ss|ß)e|str.|weg|platz|allee|gasse|ring)/i.test(c);});
  return {group:g,names:names,addresses:unique81(addresses),displayAddresses:unique81(displays),sourceIds:unique81(sourceIds),maintCustomers:unique81(maintCustomers),maintObjects:unique81(maintObjects),orderTokens:tokens81(joined),contacts:contacts81(joined),maintenance:maintenance,detailed:detailed,bare:bare,firstDate:g.firstDate||(reports[0]&&reports[0].date)||'',lastDate:g.lastDate||(reports[reports.length-1]&&reports[reports.length-1].date)||g.firstDate||''};
}
function strongMatch81(a,b){
  if(intersects81(a.maintCustomers,b.maintCustomers))return true;
  if(intersects81(a.sourceIds,b.sourceIds))return true;
  if(intersects81(a.orderTokens,b.orderTokens))return true;
  if(intersects81(a.contacts,b.contacts))return true;
  var common=a.names.filter(function(x){return b.names.indexOf(x)>=0;});
  if(!common.length)return false;
  var gap=gapDays81(a,b);
  if(intersects81(a.addresses,b.addresses)&&gap<=45)return true;
  if(a.maintenance&&b.maintenance&&gap<=90)return true;
  if(gap<=1&&((a.detailed&&b.bare)||(b.detailed&&a.bare)))return true;
  if(gap<=1&&common.some(function(x){return x.split(' ').length>=2;}))return true;
  return false;
}
function objectIds81(g){return unique81((g.objectIds||[g.objectId]).filter(Boolean).map(String));}
function manualMatch81(reportMeta,orderMeta){
  var common=reportMeta.names.filter(function(x){return orderMeta.names.indexOf(x)>=0;});if(!common.length)return false;
  if(intersects81(reportMeta.contacts,orderMeta.contacts))return true;
  if(intersects81(reportMeta.orderTokens,orderMeta.orderTokens))return true;
  if(intersects81(reportMeta.addresses,orderMeta.addresses))return true;
  return false;
}
async function absorbManualOrder81(order,m){
  var ids=objectIds81(m.group);if(!ids.length)return false;
  if(String(m.group.jobStatus||'')!=='Laufend'){
    for(var i=0;i<ids.length;i++)await api(chefPayload({action:'setRegieObjectJobStatus',objectId:ids[i],jobStatus:'Laufend'}));
    m.group.jobStatus='Laufend';
  }
  try{
    var objectId=ids[0],old=await api(chefPayload({action:'getObjectInternalNote',objectId:objectId})),prefix='Auftragsplanung uebernommen: ',extra=prefix+String(order.description||order.customer||'')+(order.address?' | '+String(order.address):'')+(order.internalNote?' | '+String(order.internalNote):'');
    if(String(old&&old.note||'').indexOf(prefix)<0)await api(chefPayload({action:'saveObjectInternalNote',objectId:objectId,note:[String(old&&old.note||'').trim(),extra].filter(Boolean).join('
')}));
  }catch(_e){}
  await api(chefPayload({action:'setManualOrderStatus',id:order.id,status:'In Regiebericht uebernommen'}));
  return true;
}
async function reconcile81(force){
  if(STATE.busy||!navigator.onLine)return STATE.lastResult;
  if(!force&&Date.now()-STATE.lastRun<8000)return STATE.lastResult;
  try{if(typeof canAccessBoss==='function'&&!canAccessBoss())return null;}catch(_e){}
  STATE.busy=true;
  try{
    var loaded=await Promise.all([api(chefPayload({action:'getRegieReports',status:'Offen',year:0,month:0})),api(chefPayload({action:'getManualOrders',status:'Alle'}))]);
    var groups=loaded[0]||[],orders=(loaded[1]||[]).filter(function(x){return ['Ohne Termin','Termin zu vereinbaren','Offen','Laufend'].indexOf(String(x.status||''))>=0;}),metas=groups.map(meta81),absorbed=0;
    for(var oi=0;oi<orders.length;oi++){
      var order=orders[oi],om=meta81({customer:order.customer,address:order.address,description:order.description,internalNote:order.internalNote,reports:[]}),hit=null;
      for(var mi=0;mi<metas.length;mi++)if(manualMatch81(metas[mi],om)){hit=metas[mi];if(String(hit.group.jobStatus||'')==='Laufend')break;}
      if(hit&&await absorbManualOrder81(order,hit))absorbed++;
    }
    var parent=metas.map(function(_x,i){return i;});
    function find(x){while(parent[x]!==x){parent[x]=parent[parent[x]];x=parent[x];}return x;}
    function join(a,b){a=find(a);b=find(b);if(a!==b)parent[b]=a;}
    for(var i=0;i<metas.length;i++)for(var j=i+1;j<metas.length;j++)if(strongMatch81(metas[i],metas[j]))join(i,j);
    var clusters={};metas.forEach(function(m,i){var k=find(i);(clusters[k]||(clusters[k]=[])).push(m);});
    var merged=0,moved=absorbed;
    for(var key in clusters){
      var c=clusters[key];if(c.length<2)continue;
      var ids=unique81(c.reduce(function(out,m){return out.concat(objectIds81(m.group));},[]));if(ids.length<2)continue;
      var hasRunning=c.some(function(m){return String(m.group.jobStatus||'')==='Laufend';});
      await api(chefPayload({action:'mergeRegieObjects',objectIds:ids}));
      merged++;
      if(hasRunning){
        for(var n=0;n<ids.length;n++)await api(chefPayload({action:'setRegieObjectJobStatus',objectId:ids[n],jobStatus:'Laufend'}));
        if(c.some(function(m){return String(m.group.jobStatus||'')!=='Laufend';}))moved++;
      }
    }
    STATE.lastRun=Date.now();STATE.lastResult={merged:merged,moved:moved};
    if(merged&&typeof d3Notice==='function')d3Notice('✓ '+merged+' zusammengehörige Auftragsgruppe(n) automatisch zusammengeführt.'+(moved?' '+moved+' davon zu laufenden Aufträgen zugeordnet.':''),'ok');
    return STATE.lastResult;
  }catch(e){
    STATE.lastRun=Date.now();STATE.lastResult={merged:0,moved:0,error:e&&e.message||String(e)};
    if(typeof d3Notice==='function')d3Notice('Automatische Auftragszuordnung ausgelassen: '+STATE.lastResult.error,'warn');
    return STATE.lastResult;
  }finally{STATE.busy=false;}
}
function displayPlaces81(g){
  var map={};[g||{}].concat((g&&g.reports)||[]).forEach(function(r){reportAddresses81(r).forEach(function(x){var k=addressKey81(x);if(k&&!map[k])map[k]=stripUnit81(x);});});
  return Object.keys(map).map(function(k){return map[k];});
}
function decoratePlaces81(view){
  var groups=window.DG3&&DG3.reports&&DG3.reports[view]||[],root=byId(view==='Laufend'?'d3RunningList':'regieResult');if(!root)return;
  groups.forEach(function(g,i){var places=displayPlaces81(g);if(places.length<2)return;var card=root.querySelector('.report-card[\data-index="'+i+'"]');if(!card||card.querySelector('.dg81-locations'))return;var d=document.createElement('div');d.className='status info dg81-locations';d.style.marginTop='8px';var s=document.createElement('strong');s.textContent='Ausführungsorte ('+places.length+')';d.appendChild(s);places.forEach(function(p){var x=document.createElement('div');x.textContent='• '+p;d.appendChild(x);});var head=card.querySelector('.total');if(head)head.insertAdjacentElement('afterend',d);else card.prepend(d);});
}

var baseReports81=window.d3Reports;
if(typeof baseReports81==='function'){
  var wrappedReports81=async function(view){var v=view||'Abgeschlossen';if(v==='Abgeschlossen'||v==='Laufend')await reconcile81(false);var r=await baseReports81.apply(this,arguments);decoratePlaces81(v);return r;};
  window.d3Reports=wrappedReports81;
  try{d3Reports=wrappedReports81;}catch(_e){}
}
window.dg81ReconcileRegie=function(){STATE.lastRun=0;return reconcile81(true);};

function manualStage81(x){var s=String(x&&x.status||'');if(s==='Angebot zu erstellen')return'Zu erstellen';if(s==='Offenes Angebot')return'Offen';if(s==='Angebot Abgelehnt')return'Archiv';return'';}
function isManualOffer81(x){return String(x&&x.source||'')==='Angebotsanfrage'||/^ANGREQ-/.test(String(x&&x.id||''));}
function offerNumber81(x){var m=String(x&&x.internalNote||'').match(/[DG-ANGEBOT:([^]]+)]/);return m?m[1].trim():'';}
function visibleNote81(x){return String(x&&x.internalNote||'').replace(/^[DG-ANGEBOT:[^]]+]s*/,'').trim();}
function dueIn81(days){var d=new Date();d.setDate(d.getDate()+Number(days||5));return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');}
async function manualOrders81(){var rows=await api(chefPayload({action:'getManualOrders',status:'Alle'}))||[];STATE.manualOrders=rows.filter(isManualOffer81);return STATE.manualOrders;}
function manualById81(id){return STATE.manualOrders.find(function(x){return String(x.id)===String(id);});}
function offerReminderText81(x){var no=offerNumber81(x);return no?'Angebot '+no+' · '+String(x.customer||'')+' nachfassen':'';}
async function closeManualReminder81(x){
  var text=offerReminderText81(x);if(!text)return;
  try{var rows=await api(chefPayload({action:'getOwnReminders',includeDone:false}))||[];for(var i=0;i<rows.length;i++)if(String(rows[i].text||'')===text)await api(chefPayload({action:'completeOwnReminder',reminderId:rows[i].id}));}catch(_e){}
}
function ensureOfferButton81(){
  var p=byId('d3OfferOpen');if(!p||byId('dg81OfferActions'))return;
  var box=document.createElement('div');box.id='dg81OfferActions';box.className='report-actions';box.style.marginBottom='12px';
  var b=document.createElement('button');b.type='button';b.className='btn success';b.textContent='+ Angebotsanfrage anlegen';b.addEventListener('click',function(){window.dg81NewOfferRequest();});box.appendChild(b);
  var h=p.querySelector('h3');if(h)h.insertAdjacentElement('afterend',box);else p.prepend(box);
}
function manualCard81(x,stage,index){
  var actions='';
  if(stage==='Zu erstellen')actions=d3Button('Angebot erstellt','dg81ManualOfferCreated',[x.id],'success')+d3Button('Anfrage entfernen','dg81ManualOfferDelete',[x.id],'danger');
  if(stage==='Offen')actions=d3Button('Angenommen','dg81ManualOfferDecision',[x.id,true],'success')+d3Button('Abgelehnt','dg81ManualOfferDecision',[x.id,false],'secondary')+d3Button('Zu „Angebote zu erstellen“','dg81ManualOfferBack',[x.id],'danger');
  if(stage==='Archiv')actions=d3Button('Zurück zu „Angebote zu erstellen“','dg81ManualOfferBack',[x.id]);
  var no=offerNumber81(x),note=visibleNote81(x);
  return '<div class="report-card dg81-manual-offer'+(index%2?' d3-alt':'')+'"><div class="d3-head"><strong>'+esc81(x.customer)+'</strong><span class="badge">Manuell erfasst</span></div>'+(no?'<div class="report-meta"><strong>Angebot '+esc81(no)+'</strong></div>':'<div class="report-meta">Angebotsanfrage</div>')+(x.address?'<div style="white-space:pre-line">'+esc81(x.address)+'</div>':'')+'<div>'+esc81(x.description||'')+'</div>'+((x.phone||x.email)?'<div class="report-meta">'+esc81([x.phone,x.email].filter(Boolean).join(' · '))+'</div>':'')+(note?'<div class="status info">'+esc81(note)+'</div>':'')+'<div class="report-actions">'+actions+'</div></div>';
}
function updateOfferCounts81(all){
  all=all||STATE.manualOrders||[];
  var mc=all.filter(function(x){return manualStage81(x)==='Zu erstellen';}).length,mo=all.filter(function(x){return manualStage81(x)==='Offen';}).length,ma=all.filter(function(x){return manualStage81(x)==='Archiv';}).length;
  var rc=window.DG3&&DG3.offers&&Array.isArray(DG3.offers['Zu erstellen'])?DG3.offers['Zu erstellen'].length:0,ro=window.DG3&&DG3.offers&&Array.isArray(DG3.offers.Offen)?DG3.offers.Offen.length:0,ra=window.DG3&&DG3.offers&&Array.isArray(DG3.offers.Archiv)?DG3.offers.Archiv.length:0;
  if(window.DG3)DG3.offerCounts={open:ro+mo,create:rc+mc};
  var buttons=document.querySelectorAll('#d3Offers .d3-menu [\data-panel]');buttons.forEach(function(b){var p=b.getAttribute('data-panel'),n=null,label='';if(p==='d3OfferOpen'){n=ro+mo;label='Offene Angebote';}if(p==='d3OfferCreate'){n=rc+mc;label='Angebote zu erstellen';}if(p==='d3OfferArchive'){n=ra+ma;label='Angebotsarchiv';}if(n!==null)b.innerHTML=esc81(label)+' <span class="dg60-count">'+n+'</span>';});
  if(typeof d3Count==='function')d3Count('offers',rc+mc);
}
async function appendManualOffers81(stage){
  ensureOfferButton81();var all=await manualOrders81(),items=all.filter(function(x){return manualStage81(x)===stage;}),id=stage==='Offen'?'d3OfferOpen':stage==='Zu erstellen'?'d3OfferCreate':'d3OfferArchive',host=byId(id+'List');if(!host)return;
  var normal=window.DG3&&DG3.offers&&Array.isArray(DG3.offers[stage])?DG3.offers[stage]:[];
  if(items.length&&normal.length===0)host.innerHTML='';
  if(items.length)host.insertAdjacentHTML('beforeend',items.map(function(x,i){return manualCard81(x,stage,normal.length+i);}).join(''));
  if(!items.length&&!normal.length)host.innerHTML='Keine Angebote vorhanden.';
  var total=normal.length+items.length;if(typeof setMessage==='function')setMessage(id+'Status',total+' Angebot(e) geladen.','ok');
  updateOfferCounts81(all);setTimeout(function(){updateOfferCounts81(all);},600);
}

window.dg81NewOfferRequest=function(){
  if(typeof d3Form!=='function')return false;
  d3Form('Angebotsanfrage anlegen',[{name:'customer',label:'Kunde',required:true},{name:'address',label:'Ausführungsadresse(n)',type:'textarea'},{name:'phone',label:'Telefon'},{name:'email',label:'E-Mail',type:'email'},{name:'description',label:'Was soll angeboten werden?',type:'textarea',required:true},{name:'internalNote',label:'Interner Vermerk',type:'textarea'}],{},async function(item){
    var id='ANGREQ-'+(typeof uid==='function'?uid():Date.now().toString(36));await api(chefPayload({action:'saveManualOrder',item:Object.assign({},item,{id:id,status:'Angebot zu erstellen',source:'Angebotsanfrage'})}));
    if(typeof d3Open==='function')d3Open('d3Offers','d3OfferCreate');await window.loadOffers('Zu erstellen');if(typeof d3Notice==='function')d3Notice('✓ Angebotsanfrage wurde unter „Angebote zu erstellen“ angelegt.','ok');
  });return false;
};
window.dg81ManualOfferCreated=function(id){
  var x=manualById81(id);if(!x)return false;
  d3Form('Angebot erstellt – Reminder festlegen',[{name:'offerNumber',label:'Angebotsnummer',required:true},{name:'reminderDate',label:'Erinnerung am',type:'date',required:true},{name:'internalNote',label:'Interner Vermerk',type:'textarea'}],{offerNumber:offerNumber81(x),reminderDate:dueIn81(5),internalNote:visibleNote81(x)},async function(v){
    var note='[DG-ANGEBOT:'+String(v.offerNumber).trim()+']'+(String(v.internalNote||'').trim()?'
'+String(v.internalNote).trim():'');await api(chefPayload({action:'saveManualOrderNote',id:x.id,note:note}));await api(chefPayload({action:'setManualOrderStatus',id:x.id,status:'Offenes Angebot'}));
    await api(chefPayload({action:'createOwnReminder',item:{text:'Angebot '+String(v.offerNumber).trim()+' · '+String(x.customer||'')+' nachfassen',dueDate:v.reminderDate,files:[]}}));await window.loadOffers('Zu erstellen');if(typeof d3Open==='function')d3Open('d3Offers','d3OfferOpen');await window.loadOffers('Offen');
  });return false;
};
window.dg81ManualOfferDecision=async function(id,yes){
  var x=manualById81(id);if(!x)return false;if(!confirm(yes?'Angebot annehmen und zu „Laufende Aufträge“ verschieben?':'Angebot ablehnen und ins Angebotsarchiv verschieben?'))return false;
  await api(chefPayload({action:'setManualOrderStatus',id:x.id,status:yes?'Laufend':'Angebot Abgelehnt'}));await closeManualReminder81(x);await window.loadOffers('Offen');if(yes&&typeof d3Dashboard==='function')await d3Dashboard(true);return false;
};
window.dg81ManualOfferBack=async function(id){var x=manualById81(id);if(!x)return false;if(!confirm('Diesen Vorgang zu „Angebote zu erstellen“ verschieben?'))return false;await api(chefPayload({action:'setManualOrderStatus',id:x.id,status:'Angebot zu erstellen'}));await closeManualReminder81(x);await window.loadOffers(manualStage81(x)||'Offen');return false;};
window.dg81ManualOfferDelete=async function(id){if(!confirm('Diese manuell erfasste Angebotsanfrage wirklich entfernen?'))return false;await api(chefPayload({action:'deleteManualOrder',id:id}));await window.loadOffers('Zu erstellen');return false;};

var baseOffers81=window.loadOffers;
if(typeof baseOffers81==='function'){
  var wrappedOffers81=async function(stage){var s=stage||'Offen',r=await baseOffers81.apply(this,arguments);try{await appendManualOffers81(s);}catch(e){var id=s==='Offen'?'d3OfferOpen':s==='Zu erstellen'?'d3OfferCreate':'d3OfferArchive';if(typeof setMessage==='function')setMessage(id+'Status','Normale Angebote geladen; manuelle Angebotsanfragen konnten nicht ergänzt werden: '+(e&&e.message||e),'warn');}return r;};
  window.loadOffers=wrappedOffers81;try{loadOffers=wrappedOffers81;}catch(_e){}
}

var baseDashboard81=window.d3Dashboard;
if(typeof baseDashboard81==='function'){
  var wrappedDashboard81=async function(){var r=await baseDashboard81.apply(this,arguments);try{updateOfferCounts81(await manualOrders81());}catch(_e){}return r;};
  window.d3Dashboard=wrappedDashboard81;try{d3Dashboard=wrappedDashboard81;}catch(_e){}
}

function installLoaders81(){
  ensureOfferButton81();
  if(window.DG3&&DG3.loaders){DG3.loaders.d3OfferOpen=function(){return window.loadOffers('Offen');};DG3.loaders.d3OfferCreate=function(){return window.loadOffers('Zu erstellen');};DG3.loaders.d3OfferArchive=function(){return window.loadOffers('Archiv');};DG3.loaders.d3Completed=function(){return window.d3Reports((DG3.completedView||'Abgeschlossen'));};DG3.loaders.d3Running=function(){return window.d3Reports('Laufend');};}
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',function(){setTimeout(installLoaders81,0);},{once:true});else setTimeout(installLoaders81,0);
})();
