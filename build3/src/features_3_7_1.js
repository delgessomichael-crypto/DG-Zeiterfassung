/* DG 3.7: Wartungskunden, Objekte, Geräte, Wartungsarchiv und Kalender-Verfügbarkeitsprüfung. */
(function(){
'use strict';
const S=window.DG37=window.DG37||{workers:[],previewEvents:[],previewDate:'',customer:null,overview:null,plannerLink:null,plannerEditId:''};
const esc37=v=>String(v==null?'':v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const val=id=>String($(id)?.value||'').trim();
const monthLabel=k=>{if(!/^\d{4}-\d{2}$/.test(k||''))return k||'';const [y,m]=k.split('-').map(Number);return new Intl.DateTimeFormat('de-DE',{month:'long',year:'numeric'}).format(new Date(y,m-1,1));};
const fmtDevice=d=>[d.deviceType,d.otherDescription,d.manufacturer,d.model].filter(Boolean).join(' · ');
function d37Notice(msg,type='info'){if(typeof d3Notice==='function')d3Notice(msg,type);else alert(msg);}

/* ---------- Kalender: Mitarbeiterwahl + Tagesvorschau ---------- */
async function d37Workers(){
  if(S.workers.length)return S.workers;
  S.workers=(await api(chefPayload({action:'getPlannerWorkers'}))||[]).filter(x=>x.active);
  return S.workers;
}
function d37SelectedWorkerIds(){return [...document.querySelectorAll('#dg62Share .dg62cb:checked')].map(x=>x.value);}
function d37EnsurePlannerPreview(){
  const share=$('dg62Share');if(!share)return null;
  let p=$('d37PlannerPreview');if(!p){p=document.createElement('div');p.id='d37PlannerPreview';p.className='d37-planner-preview';share.insertAdjacentElement('afterend',p);}return p;
}
async function d37RepairPlannerAssignment(){
  const share=$('dg62Share');if(!share)return;
  let workers=[];try{workers=await d37Workers();}catch(e){workers=[];}
  if(!share.querySelector('.dg62cb')&&workers.length){
    const selected=new Set((S.pendingWorkerIds||[]).map(String));
    share.innerHTML=workers.map(w=>'<label><input type="checkbox" class="dg62cb" value="'+esc37(w.id)+'" '+(selected.has(String(w.id))?'checked':'')+'>'+esc37(w.displayName||w.employeeName)+'</label>').join('');
    const hint=$('dg62ShareHint');if(hint)hint.textContent='Mitarbeiter auswählen. Darunter wird der Kalender des gewählten Tages eingeblendet.';
  }
  [...share.querySelectorAll('.dg62cb')].forEach(cb=>{if(cb.dataset.d37)return;cb.dataset.d37='1';cb.addEventListener('change',d37PreviewPlannerDay);});
  ['dg62ED','dg62Start','dg62End'].forEach(id=>{const e=$(id);if(e&&!e.dataset.d37){e.dataset.d37='1';e.addEventListener('change',d37PreviewPlannerDay);}});
  d37EnsurePlannerPreview();await d37PreviewPlannerDay();
}
function d37Overlap(e,start,end){if(!start||!end)return false;return String(e.start||'')<end&&String(e.end||'')>start;}
async function d37PreviewPlannerDay(){
  const host=d37EnsurePlannerPreview();if(!host)return;
  const date=val('dg62ED'),ids=d37SelectedWorkerIds(),start=val('dg62Start'),end=val('dg62End');
  if(!date){host.innerHTML='<div class="muted small">Bitte zuerst einen Tag auswählen.</div>';return;}
  if(!ids.length){host.innerHTML='<div class="d37-preview-empty">Noch kein Mitarbeiter ausgewählt. Nach Auswahl erscheint hier dessen Kalender für '+esc37(formatDateDE(date))+'.</div>';return;}
  host.innerHTML='<div class="status info">Kalender '+esc37(formatDateDE(date))+' wird geladen …</div>';
  try{
    const [workers,events]=await Promise.all([d37Workers(),api(chefPayload({action:'getPlannerEvents',startDate:date,endDate:date}))]);
    S.previewEvents=(events||[]);S.previewDate=date;
    host.innerHTML='<div class="d37-preview-title">Kalender am '+esc37(formatDateDE(date))+'</div><div class="d37-preview-grid">'+ids.map(id=>{
      const w=workers.find(x=>String(x.id)===String(id))||{displayName:id};
      const ev=(events||[]).filter(x=>(x.employeeIds||[]).map(String).includes(String(id))&&String(x.id)!==String(S.plannerEditId||''));
      const conflicts=ev.filter(x=>d37Overlap(x,start,end));
      return '<div class="d37-preview-worker '+(conflicts.length?'conflict':'')+'"><strong>'+esc37(w.displayName||w.employeeName)+'</strong>'+(ev.length?ev.map(x=>'<div class="d37-preview-event '+(d37Overlap(x,start,end)?'conflict':'')+'"><b>'+esc37(x.start)+'–'+esc37(x.end)+'</b> '+esc37(x.customer||'Termin')+(x.type==='Wartung'?' <span>🔧</span>':'')+'<div class="small muted">'+esc37(x.task||'')+'</div></div>').join(''):'<div class="d37-free">Keine Termine – Zeitraum frei.</div>')+(conflicts.length?'<div class="d37-conflict-note">⚠ Überschneidung mit der gewählten Uhrzeit.</div>':'')+'</div>';
    }).join('')+'</div>';
  }catch(e){host.innerHTML='<div class="status error">Kalender konnte nicht geladen werden: '+esc37(e.message)+'</div>';}
