/* DG Zeiterfassung 7.2.1 - Angebotsentscheidung eindeutig verschieben */
(function(){
'use strict';
const V='7.2.1';

function notice(msg,type){
  try{if(typeof d3Notice==='function')return d3Notice(msg,type||'ok');}catch(_e){}
  try{alert(msg);}catch(_e){}
}
async function refreshOfferViews721(){
  try{if(typeof loadOffers==='function')await loadOffers('Offen');}catch(_e){}
  try{if(typeof dg60RefreshOfferCounts==='function')await dg60RefreshOfferCounts(true);}catch(_e){}
  try{
    const arch=document.getElementById('d3OfferArchive');
    if(arch&&!arch.classList.contains('hidden')&&typeof loadOffers==='function')await loadOffers('Archiv');
  }catch(_e){}
  try{
    const stat=document.getElementById('d3OfferStats');
    if(stat&&!stat.classList.contains('hidden')&&typeof loadStats==='function')await loadStats();
  }catch(_e){}
  try{if(typeof d3Dashboard==='function')await d3Dashboard(true);}catch(_e){}
}

window.d3OfferDecision=async function(offerId,yes){
  const id=String(offerId||'').trim();
  if(!id)return false;
  if(!confirm(yes
    ?'Angebot annehmen und vollständig zu „Laufende Aufträge“ verschieben?'
    :'Angebot ablehnen und in das Angebotsarchiv verschieben?'))return false;
  try{
    if(yes){
      await api(chefPayload({action:'acceptOfferAsRunning',offerId:id}));
      notice('✓ Angebot angenommen und zu „Laufende Aufträge“ verschoben.','ok');
    }else{
      await api(chefPayload({action:'setRegieReportsOfferStatus',offerId:id,entryIds:[],offerStatus:'Angebot Abgelehnt'}));
      notice('✓ Angebot abgelehnt und ins Angebotsarchiv verschoben.','ok');
    }
    await refreshOfferViews721();
  }catch(e){
    notice((e&&e.message)||'Angebotsentscheidung konnte nicht gespeichert werden.','error');
  }
  return false;
};

/* Auch Entscheidungen aus der Reminder-Ansicht folgen derselben eindeutigen Regel. */
window.d3ReminderDecision=async function(id,yes){
  const rid=String(id||'').trim();
  const rows=(window.DG3&&Array.isArray(DG3.reminders))?DG3.reminders:[];
  const r=rows.find(x=>String(x.id||'')===rid);
  if(!r){notice('Reminder bitte neu laden.','error');return false;}
  if(!confirm(yes
    ?'Angebot annehmen und zu „Laufende Aufträge“ verschieben?'
    :'Angebot ablehnen und ins Angebotsarchiv verschieben?'))return false;
  try{
    await api(chefPayload({
      action:yes?'acceptOfferFromReminder':'declineOfferFromReminder',
      reminderId:rid,
      asRunning:yes
    }));
    if(typeof loadReminders==='function')await loadReminders();
    await refreshOfferViews721();
    notice(yes?'✓ Auftrag läuft jetzt unter „Laufende Aufträge“.':'✓ Angebot wurde archiviert.','ok');
  }catch(e){
    notice((e&&e.message)||'Reminder-Entscheidung konnte nicht gespeichert werden.','error');
  }
  return false;
};

try{window.DG_APP_VERSION=V;if(window.DG3)DG3.version=V;}catch(_e){}
})();