/* DG Zeiterfassung 7.3.5 - Gesundmeldung + einheitliche interne Notizen */
(function(){
'use strict';
const V735='7.3.5';
const byId735=id=>document.getElementById(id);
const esc735=v=>String(v==null?'':v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function today735(){const d=new Date();return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');}
function de735(v){try{return typeof formatDateDE==='function'?formatDateDE(v):String(v||'');}catch(_e){return String(v||'');}}

/* Krankheit endet automatisch am eingetragenen Bis-Datum.
   Diese Funktion ist nur fuer vorzeitige Rueckkehr gedacht. */
window.dg735Healthy=dg735Healthy=function(id,employee,currentEnd){
  if(typeof d3Form!=='function')return;
  d3Form('Mitarbeiter gesund melden',[
    {name:'returnDate',label:'Arbeitsfähig ab',type:'date',required:true}
  ],{returnDate:today735()},async v=>{
    const r=await api(chefPayload({action:'endSicknessAbsence',id,returnDate:v.returnDate}));
    if(r&&r.changed===false){
      setMessage('absenceStatus',r.message||'Mitarbeiter war bereits wieder als arbeitsfähig geführt.','info');
    }else{
      setMessage('absenceStatus','✓ '+(employee||'Mitarbeiter')+' ist ab '+de735(v.returnDate)+' wieder arbeitsfähig. Ab diesem Datum werden Arbeitszeiten wieder normal gezählt.','ok');
    }
    const abs=await api(chefPayload({action:'getAbsences'}));
    renderAbsenceList(abs||[]);
    try{if(typeof refreshAbsence734==='function')await refreshAbsence734(true);}catch(_e){}
    try{if(typeof refreshSicknessTile734==='function')await refreshSicknessTile734();}catch(_e){}
    try{if(typeof d3Dashboard==='function')await d3Dashboard(true);}catch(_e){}
  });
};

const absenceBase735=window.renderAbsenceList;
if(typeof absenceBase735==='function')window.renderAbsenceList=renderAbsenceList=function(rows){
  const r=absenceBase735.apply(this,arguments);
  const host=byId735('absenceList'),items=[...(host?.querySelectorAll('.entry')||[])],today=today735();
  (rows||[]).forEach((x,i)=>{
    if(x.type!=='Krank'||String(x.end||'')<today)return;
    const box=items[i];if(!box||box.querySelector('.dg735-healthy'))return;
    const b=document.createElement('button');
    b.type='button';b.className='btn success dg735-healthy';b.style.marginTop='8px';b.style.marginLeft='8px';
    b.textContent='Gesund melden';
    b.addEventListener('click',()=>dg735Healthy(x.id,x.employee,x.end));
    const del=box.querySelector('button.btn.danger');if(del)del.insertAdjacentElement('afterend',b);else box.appendChild(b);
  });
  return r;
};

/* Untere Kundenkarten nutzen jetzt exakt denselben Formularstil wie die obere Interne Notiz. */
window.d3Note=d3Note=async function(objectId,customer){
  const r=await api(chefPayload({action:'getObjectInternalNote',objectId}));
  d3Form('Interne Notiz',[
    {name:'note',label:'Notiz',type:'textarea'}
  ],{note:r?.note||''},async v=>{
    await api(chefPayload({action:'saveObjectInternalNote',objectId,note:v.note}));
    try{await d3Reports(DG3.active||'Laufend');}catch(_e){}
  });
};

async function patchRegieNotes735(view){
  const root=typeof d3ReportRoot==='function'?d3ReportRoot(view):null;
  if(!root)return;
  const groups=(window.DG3&&DG3.reports&&DG3.reports[view])||[];
  const ids=[...new Set(groups.map(g=>(g.objectIds||[g.objectId]).filter(Boolean)[0]).filter(Boolean))];
  let notes={};
  if(ids.length){
    try{notes=await api(chefPayload({action:'getObjectInternalNotes',objectIds:ids}))||{};}catch(_e){
      for(const id of ids){try{notes[id]=await api(chefPayload({action:'getObjectInternalNote',objectId:id}));}catch(__e){}}
    }
  }
  [...root.querySelectorAll('.report-card[data-index]')].forEach(card=>{
    const i=Number(card.dataset.index),g=groups[i];if(!g)return;
    const id=(g.objectIds||[g.objectId]).filter(Boolean)[0],note=notes[id]?.note||'';
    card.querySelectorAll('button').forEach(b=>{if((b.textContent||'').trim()==='Interner Vermerk')b.textContent='Interne Notiz';});
    let box=card.querySelector('.dg735-object-note');
    if(note){
      if(!box){box=document.createElement('div');box.className='status info dg735-object-note';const actions=card.querySelector('.report-actions');if(actions)actions.insertAdjacentElement('beforebegin',box);else card.appendChild(box);}
      box.innerHTML='<strong>Interne Notiz:</strong> '+esc735(note);
    }else if(box)box.remove();
  });
}
const reportsBase735=window.d3Reports;
if(typeof reportsBase735==='function')window.d3Reports=d3Reports=async function(view='Abgeschlossen'){
  const r=await reportsBase735.apply(this,arguments);
  try{await patchRegieNotes735(view);}catch(_e){}
  return r;
};

function patchText735(){
  document.querySelectorAll('button').forEach(b=>{if((b.textContent||'').trim()==='Interner Vermerk')b.textContent='Interne Notiz';});
  const h=byId735('dg734SickHint');
  if(h)h.textContent='Krankheit endet automatisch am eingetragenen Bis-Datum. Bei früherer Rückkehr „Gesund melden“ verwenden; ab dem Rückkehrdatum werden Arbeitsstunden wieder normal gezählt. Es wird keine Diagnose gespeichert.';
}
function stamp735(){
  try{
    document.title='DG Zeiterfassung '+V735;
    document.querySelectorAll('.login-card .muted.small').forEach(x=>{if(/^Version\s+/i.test((x.textContent||'').trim()))x.textContent='Version '+V735;});
    document.querySelectorAll('.hero strong').forEach(x=>{if(/Zeiterfassung/i.test(x.textContent||''))x.textContent='Zeiterfassung - '+V735;});
    window.DG_APP_VERSION=V735;window.DG_RELEASE=V735;if(window.DG3)DG3.version=V735;
  }catch(_e){}
}
function install735(){
  patchText735();stamp735();
  try{if(window.DG3&&DG3.active)patchRegieNotes735(DG3.active);}catch(_e){}
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>setTimeout(install735,0),{once:true});else setTimeout(install735,0);
setTimeout(install735,700);
})();
