/* DG Zeiterfassung 5.2.7 - Regieberichte: Historie erhalten, sichere Zusammenfuehrung */
(function(){
'use strict';
const V527='5.2.7';
const byId527=id=>document.getElementById(id);

function updateVersion527(){
  document.title='DG Zeiterfassung '+V527;
  const login=document.querySelector('#loginScreen .center.muted.small');if(login)login.textContent='Version '+V527;
  const hero=document.querySelector('#mainScreen .hero .head-row strong');if(hero)hero.textContent='Zeiterfassung - '+V527;
  try{window.DG_APP_VERSION=V527;if(window.DG3)DG3.version=V527;}catch(_e){}
}

function root527(view){return byId527(view==='Laufend'?'d3RunningList':'regieResult');}
function currentIds527(g){return new Set((g.objectIds||[g.objectId]).filter(Boolean).map(String));}
function reportKey527(r){return String(r&&r.id||'');}

async function enrichGroup527(g){
  if(!g||!g.objectId||typeof api!=='function'||typeof chefPayload!=='function')return g;
  try{
    const full=await api(chefPayload({action:'getObjectReports',objectId:g.objectId,customer:g.customer||''}));
    const ids=currentIds527(g),seen={};
    const original=(g.reports||[]).slice();
    original.forEach(r=>{if(reportKey527(r))seen[reportKey527(r)]=r;});
    (full&&full.reports||[]).forEach(r=>{
      if(!ids.has(String(r.objectId||'')))return;
      if(reportKey527(r))seen[reportKey527(r)]=r;
    });
    const reports=Object.values(seen).sort((a,b)=>String(a.date+' '+a.start).localeCompare(String(b.date+' '+b.start)));
    if(!reports.length)return g;
    const employees={},objectIds={};let total=0,first='',last='';
    reports.forEach(r=>{employees[r.employee]=true;if(r.objectId)objectIds[r.objectId]=true;total+=Number(r.hours||0);if(r.date&&(!first||r.date<first))first=r.date;if(r.date&&(!last||r.date>last))last=r.date;});
    g.reports=reports;g.reportCount=reports.length;g.totalHours=Math.round(total*100)/100;
    g.employees=Object.keys(employees).filter(Boolean).sort();g.objectIds=Object.keys(objectIds).filter(Boolean);
    if(first)g.firstDate=first;if(last)g.lastDate=last;
    return g;
  }catch(_e){return g;}
}

async function rerender527(view){
  if(view==='Abgerechnet')return;
  const groups=(window.DG3&&DG3.reports&&DG3.reports[view])||[];
  if(!groups.length)return;
  await Promise.all(groups.map(enrichGroup527));
  const root=root527(view);if(!root||typeof d3ReportCard!=='function')return;
  root.replaceChildren();
  if(groups.length&&typeof d3Element==='function'&&typeof d3Button==='function'){
    root.append(d3Element('div','d3-merge-top',d3Button('Ausgewählte zusammenführen','requestMergeSelectedRegieReports',[view],'success')+'<div class="muted small d3-hint">Mindestens zwei Kundenkarten markieren.</div>'));
  }
  groups.forEach((g,i)=>root.append(d3ReportCard(g,view,i)));
}

const baseLoad527=window.loadRegieReports;
if(typeof baseLoad527==='function')window.loadRegieReports=async function(view){
  const v=view||'Abgeschlossen';
  const r=await baseLoad527.apply(this,arguments);
  if(v==='Laufend'||v==='Abgeschlossen')await rerender527(v);
  return r;
};

/* Historische, bereits abgerechnete Teilberichte bleiben sichtbar, sind aber klar markiert. */
const baseSingle527=window.d3Single;
if(typeof baseSingle527==='function')window.d3Single=d3Single=function(r){
  const html=baseSingle527(r);
  if(String(r&&r.status||'')!=='Abgerechnet')return html;
  const note='<div class="muted small" style="margin-top:4px;font-weight:800">✓ Bereits abgerechnet'+(r.billedAt?' · '+esc(r.billedAt):'')+'</div>';
  return html.replace('</div>',note+'</div>');
};

/* Auswahl immer nur aus dem aktuell sichtbaren Bereich lesen. Dadurch koennen versteckte
   Markierungen aus Laufend/Abgeschlossen nie wieder versehentlich mit zusammengefuehrt werden. */
window.requestMergeSelectedRegieReports=async function(view){
  const v=view||((window.DG3&&DG3.active)||'Abgeschlossen'),root=root527(v);
  if(!root)return false;
  const boxes=[...root.querySelectorAll('.regie-merge-select:checked')];
  const ids=[...new Set(boxes.flatMap(x=>String(x.dataset.objectIds||'').split(',').map(s=>s.trim()).filter(Boolean)))];
  if(ids.length<2){alert('Bitte mindestens zwei Kundenkarten im aktuell geöffneten Bereich markieren.');return false;}
  if(!confirm('Die '+boxes.length+' markierten Kundenkarten wirklich zusammenführen?'))return false;
  try{
    if(typeof d3Notice==='function')d3Notice('Regieberichte werden zusammengeführt ...','info');
    await api(chefPayload({action:'mergeRegieObjects',objectIds:ids}));
    boxes.forEach(x=>x.checked=false);
    await window.loadRegieReports(v);
    if(typeof d3Dashboard==='function')await d3Dashboard(true);
    if(typeof d3Notice==='function')d3Notice('✓ Regieberichte wurden zusammengeführt.','ok');
  }catch(e){if(typeof d3Notice==='function')d3Notice(e.message,'error');else alert(e.message);}
  return false;
};

/* 5.2.7 funktioniert bereits mit GS 5.2.0.3; GS 5.2.0.4 macht die Historie serverseitig dauerhaft konsistent. */
window.d3CheckBackend=d3CheckBackend=async function(){
  try{
    const r=await api({action:'ping'}),found=String(r&&r.version||''),p=found.split('.').map(Number);
    const ok=p[0]>5||(p[0]===5&&(p[1]>2||(p[1]===2&&((p[2]||0)>0||((p[2]||0)===0&&(p[3]||0)>=3)))));
    DG3.backend=ok?found:'';
    if(ok){byId527('d3Notice')?.remove();return true;}
    if(typeof d3Notice==='function')d3Notice('App '+V527+' benötigt Google-GS 5.2.0.3 oder neuer. Gefunden: '+(found||'unbekannt')+'. Speichern ist gesperrt.','warn');
    return false;
  }catch(e){DG3.backend='';if(typeof d3Notice==='function')d3Notice('Verbindungsprüfung fehlgeschlagen: '+e.message,'warn');return false;}
};

function boot527(){updateVersion527();setTimeout(()=>{const v=(window.DG3&&DG3.active)||'';if(v==='Laufend'||v==='Abgeschlossen')rerender527(v);},800);}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot527);else boot527();
})();
