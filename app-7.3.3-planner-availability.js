/* DG Zeiterfassung 7.3.3 - Mitarbeiterkalender: Abwesenheiten sichtbar, Buchung bleibt moeglich */
(function(){
'use strict';
const V733='7.3.3';
let workers733=[],availability733=[];
const $733=id=>document.getElementById(id);
const esc733=v=>String(v==null?'':v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

function css733(){
  if($733('dg733Css'))return;
  const s=document.createElement('style');s.id='dg733Css';
  s.textContent=`
    .dg733-unavailable-head{background:#fecaca!important;color:#7f1d1d!important;flex-direction:column;line-height:1.05}
    .dg733-unavailable-cell{background:#fee2e2!important;box-shadow:inset 0 0 0 1px #fca5a5}
    .dg733-unavailable-cell:hover{background:#fecaca!important}
    .dg733-status-badge{display:inline-block;margin-top:3px;padding:2px 7px;border-radius:999px;background:#b91c1c;color:#fff;font-size:10px;font-weight:900;white-space:nowrap}
    .dg733-legend{display:inline-flex;align-items:center;gap:5px}
    .dg733-legend-dot{width:12px;height:12px;border-radius:3px;background:#fee2e2;border:1px solid #ef4444;display:inline-block}
    .dg733-modalwarn{margin:8px 0;padding:9px 11px;border-radius:10px;background:#fee2e2;border:1px solid #fca5a5;color:#991b1b;font-weight:800}
  `;
  document.head.appendChild(s);
}
function name733(w){return String(w&&((w.employeeName||w.displayName)||'')||'').trim();}
function byDateEmployee733(date,employee){
  const key=String(employee||'').trim().toLowerCase();
  return availability733.find(x=>String(x.date||'')===String(date||'')&&String(x.employee||'').trim().toLowerCase()===key)||null;
}
function activeWorkers733(){return (workers733||[]).filter(w=>w&&w.active).slice(0,10);}
function visibleRange733(){
  const dates=[...document.querySelectorAll('#dg62Week .dg62-day[data-date]')].map(x=>x.dataset.date).filter(Boolean).sort();
  return dates.length?{start:dates[0],end:dates[dates.length-1]}:null;
}
function ensureLegend733(){
  const legend=$733('dg62PlannerCard')?.querySelector('.dg62-legend');if(!legend||legend.querySelector('.dg733-legend'))return;
  const x=document.createElement('span');x.className='dg733-legend';x.innerHTML='<i class="dg733-legend-dot"></i>Nicht verfügbar – Termin kann trotzdem gebucht werden';legend.appendChild(x);
}
function decorate733(){
  css733();ensureLegend733();
  const ws=activeWorkers733();if(!ws.length)return;
  document.querySelectorAll('#dg62Week .dg62-day[data-date]').forEach(day=>{
    const date=day.dataset.date,names=[...day.querySelectorAll('.dg62-name')],cells=[...day.querySelectorAll('.dg62-cell')],cols=ws.length;
    names.forEach(n=>{n.classList.remove('dg733-unavailable-head');n.querySelectorAll('.dg733-status-badge').forEach(x=>x.remove());});
    cells.forEach(c=>{c.classList.remove('dg733-unavailable-cell');delete c.dataset.dg733Status;});
    ws.forEach((w,ci)=>{
      const a=byDateEmployee733(date,name733(w));if(!a)return;
      const label=String(a.status||'Nicht verfügbar').trim();
      const head=names[ci];if(head){
        head.classList.add('dg733-unavailable-head');
        const b=document.createElement('span');b.className='dg733-status-badge';b.textContent=label;head.appendChild(b);
        head.title=(w.displayName||w.employeeName||'Mitarbeiter')+' · '+label+' · Buchung trotzdem möglich';
      }
      cells.forEach((cell,i)=>{if(i%cols!==ci)return;cell.classList.add('dg733-unavailable-cell');cell.dataset.dg733Status=label;cell.title=(w.displayName||w.employeeName||'Mitarbeiter')+' ist '+label+'. Anklicken = Termin trotzdem anlegen.';});
    });
  });
}
async function loadAvailability733(){
  const range=visibleRange733();if(!range||!navigator.onLine)return;
  try{
    availability733=await api(chefPayload({action:'getPlannerAvailability',startDate:range.start,endDate:range.end}))||[];
    window.__dg733PlannerAvailability=availability733;
    decorate733();
  }catch(e){
    availability733=[];
    const s=$733('dg62Status');if(s&&/Kalender synchronisiert/i.test(s.textContent||''))s.textContent='✓ Kalender synchronisiert. Abwesenheitsmarkierung benötigt Google-GS 7.3.3.';
  }
}
function statusForWorker733(date,id){
  const w=workers733.find(x=>String(x.id)===String(id));return w?byDateEmployee733(date,name733(w)):null;
}
function warnModal733(date,workerId){
  const a=statusForWorker733(date,workerId),box=$733('dg62MS');if(!a||!box)return;
  box.className='dg733-modalwarn';
  box.textContent='⚠ '+(workers733.find(x=>String(x.id)===String(workerId))?.displayName||name733(workers733.find(x=>String(x.id)===String(workerId)))||'Mitarbeiter')+' ist an diesem Tag als „'+String(a.status||'nicht verfügbar')+'“ markiert. Der Termin kann trotzdem gespeichert werden.';
}

const apiBase733=window.api;
if(typeof apiBase733==='function')window.api=api=async function(payload){
  const r=await apiBase733.apply(this,arguments);
  if(payload&&payload.action==='getPlannerWorkers')workers733=Array.isArray(r)?r:[];
  if(payload&&payload.action==='getPlannerAvailability')availability733=Array.isArray(r)?r:[];
  return r;
};

const loadBase733=window.dg62Load;
if(typeof loadBase733==='function')window.dg62Load=async function(){
  const r=await loadBase733.apply(this,arguments);
  if(!workers733.length){
    try{workers733=await api(chefPayload({action:'getPlannerWorkers'}))||[];}catch(_e){}
  }
  await loadAvailability733();
  return r;
};

const newBase733=window.dg62New;
if(typeof newBase733==='function')window.dg62New=function(d,w,start){
  const r=newBase733.apply(this,arguments);
  setTimeout(()=>warnModal733(d,w),0);
  return r;
};

const saveBase733=window.dg62Save;
if(typeof saveBase733==='function')window.dg62Save=async function(){
  const date=String($733('dg62ED')?.value||''),ids=[...document.querySelectorAll('.dg62cb:checked')].map(x=>x.value);
  const hits=ids.map(id=>({id,a:statusForWorker733(date,id)})).filter(x=>x.a);
  if(hits.length){
    const text=hits.map(x=>{
      const w=workers733.find(y=>String(y.id)===String(x.id));
      return (w?.displayName||w?.employeeName||'Mitarbeiter')+': '+String(x.a.status||'nicht verfügbar');
    }).join('\n');
    if(!confirm('Achtung – folgende Mitarbeiter sind an diesem Tag als nicht verfügbar markiert:\n\n'+text+'\n\nTermin trotzdem speichern?'))return false;
  }
  return saveBase733.apply(this,arguments);
};

function addTrainingOption733(){
  const sel=$733('absenceType');if(!sel||[...sel.options].some(o=>o.value==='Schulung'))return;
  const o=document.createElement('option');o.value='Schulung';o.textContent='Schulung';sel.appendChild(o);
}
function stamp733(){
  try{
    document.title='DG Zeiterfassung '+V733;
    document.querySelectorAll('.login-card .muted.small').forEach(x=>{if(/^Version\s+/i.test((x.textContent||'').trim()))x.textContent='Version '+V733;});
    document.querySelectorAll('.hero strong').forEach(x=>{if(/Zeiterfassung/i.test(x.textContent||''))x.textContent='Zeiterfassung - '+V733;});
    window.DG_APP_VERSION=V733;window.DG_RELEASE=V733;if(window.DG3)DG3.version=V733;
  }catch(_e){}
}
function install733(){css733();addTrainingOption733();ensureLegend733();decorate733();stamp733();}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>setTimeout(install733,0),{once:true});else setTimeout(install733,0);
setTimeout(install733,600);
})();
