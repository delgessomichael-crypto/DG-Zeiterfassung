/* DG Zeiterfassung 5.2.1 - Büro UX, Lohncounter und Tagesabschluss-Korrekturen */
(function(){
'use strict';
const V521='5.2.1';
const q521=id=>document.getElementById(id);
const esc521=v=>String(v==null?'':v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const openEmployees521=new Set();
let deletePayload521=null;

function addCss521(){
  if(q521('dg521Styles'))return;
  const s=document.createElement('style');s.id='dg521Styles';s.textContent=`
  .d3-tile.payroll{background:#eef2ff;color:#3730a3}.d3-tile.payroll.warn{background:#fff7ed;color:#9a3412}.d3-tile.payroll.error{background:#fef2f2;color:#991b1b}.d3-tile.payroll.done{background:#f0fdf4;color:#166534}
  .dg521-employee-head{width:100%;display:flex;align-items:center;gap:10px;border:0;background:transparent;padding:3px 2px 10px;text-align:left;cursor:pointer;font:inherit;color:inherit}
  .dg521-employee-head strong{font-size:20px}.dg521-employee-head .dg521-meta{margin-left:auto;color:#64748b;font-size:13px;font-weight:700}.dg521-employee-head .dg521-toggle{font-size:24px;font-weight:900;line-height:1;min-width:24px;text-align:center}
  .dg521-lamp{width:15px;height:15px;border-radius:999px;display:inline-block;box-shadow:0 0 0 3px rgba(0,0,0,.04)}.dg521-lamp.ok{background:#22c55e}.dg521-lamp.bad{background:#dc2626}
  .dg521-plausibility{font-size:12px;font-weight:800;margin-left:2px}.dg521-plausibility.ok{color:#166534}.dg521-plausibility.bad{color:#991b1b}
  .dg521-report-actions{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:10px}.dg521-report-actions .btn{width:100%!important;margin:0!important}
  .dg521-billed-note{margin-top:8px;padding:8px 10px;border-radius:10px;background:#fff7ed;color:#9a3412;font-size:12px;font-weight:700}
  .dg521-delete-summary{background:#f8fafc;border:1px solid #e5e7eb;border-radius:12px;padding:10px;margin:10px 0}.dg521-delete-warning{background:#fef2f2;color:#991b1b;border-radius:10px;padding:9px;margin:8px 0;font-weight:800}
  .dg521-collapsed .dg48-day-grid{display:none!important}
  @media(max-width:720px){.dg521-report-actions{grid-template-columns:1fr}.dg521-employee-head strong{font-size:18px}.dg521-employee-head{align-items:flex-start;flex-wrap:wrap}.dg521-employee-head .dg521-meta{margin-left:25px}}
  `;document.head.appendChild(s);
}

function localToday521(){const d=new Date();return new Date(d.getFullYear(),d.getMonth(),d.getDate())}
function payrollDueInfo521(){
  const today=localToday521(), due=new Date(today.getFullYear(),today.getMonth(),20);due.setHours(0,0,0,0);
  const diff=Math.round((due-today)/86400000);
  if(diff>0)return {diff,text:diff+' Tag'+(diff===1?'':'e'),cls:diff<=5?'warn':''};
  if(diff===0)return {diff,text:'Heute',cls:'error'};
  return {diff,text:Math.abs(diff)+' Tag'+(Math.abs(diff)===1?'':'e')+' überf.',cls:'error'};
}
function ensurePayrollTile521(){
  const dash=document.querySelector('#bossView .d3-dashboard');if(!dash)return;
  let b=dash.querySelector('.d3-tile.payroll');
  if(!b){b=document.createElement('button');b.type='button';b.className='d3-tile payroll';b.innerHTML='<span>Lohnübergabe</span><strong id="d3Count-payroll">…</strong>';const days=dash.querySelector('.d3-tile.days');if(days)days.insertAdjacentElement('afterend',b);else dash.appendChild(b);b.addEventListener('click',()=>{if(typeof d3Open==='function')d3Open('d3Admin','dg48EmployeeClosures');setTimeout(()=>q521('dg520PayrollClose')?.scrollIntoView({behavior:'smooth',block:'start'}),80);});}
  const info=payrollDueInfo521(),strong=q521('d3Count-payroll');if(strong&&strong.textContent!==info.text)strong.textContent=info.text;b.classList.remove('warn','error','done');if(info.cls)b.classList.add(info.cls);b.title=info.diff>=0?'Noch '+info.text+' bis zur Lohnübergabe am 20.':'Lohnübergabe '+info.text;
}

function stableWire521(card){
  if(!card||card.dataset.dg521Stable==='1')return;
  const old=card.querySelector(':scope > .dg48-head');if(!old)return;
  const h=old.cloneNode(true);old.replaceWith(h);card.dataset.dg521Stable='1';h.tabIndex=0;
  const go=e=>{if(e.type==='keydown'&&!['Enter',' '].includes(e.key))return;e.preventDefault();e.stopPropagation();const top=h.getBoundingClientRect().top;const body=typeof d3Body==='function'?d3Body(card):card.querySelector(':scope > .dg48-body');const closed=body?body.classList.contains('hidden'):false;if(closed){if(typeof d3Open==='function')d3Open(card.id);}else{if(typeof d3Collapse==='function')d3Collapse(card,true);if(window.DG3&&DG3.open===card.id)DG3.open='';}requestAnimationFrame(()=>{const nh=card.querySelector(':scope > .dg48-head');if(!nh)return;const delta=nh.getBoundingClientRect().top-top;if(Math.abs(delta)>1)window.scrollBy({top:delta,behavior:'instant'});});};
  h.addEventListener('click',go);h.addEventListener('keydown',go);
}
function fixMaintenanceAndAdmin521(){
  const maintenance=q521('d36Maintenance'),admin=q521('d3Admin');
  if(maintenance){const body=typeof d3Body==='function'?d3Body(maintenance):maintenance.querySelector(':scope > .dg48-body'),top=q521('d39MaintenanceTop');if(top&&body&&top.parentElement!==body)body.insertBefore(top,body.firstChild);stableWire521(maintenance);}
  if(admin)stableWire521(admin);
}

function minutes521(v){const m=String(v||'').match(/^(\d{1,2}):(\d{2})$/);if(!m)return null;return Number(m[1])*60+Number(m[2])}
function plausibility521(emp){
  const issues=[];
  (emp.days||[]).forEach(day=>{
    if(!day.closed)issues.push((day.date||'')+': Tagesabschluss offen');
    const net=Number(day.hours||0),gross=Number(day.grossHours||0),pause=Number(day.pauseHours||0);
    if(net>8)issues.push((day.date||'')+': mehr als 8 Std.');
    if(net>10)issues.push((day.date||'')+': mehr als 10 Std.');
    if(gross>6&&pause<.5)issues.push((day.date||'')+': Pause unter 30 Min.');
    if(gross>9&&pause<.75)issues.push((day.date||'')+': Pause unter 45 Min.');
    const seen=new Set(),intervals=[];
    (day.reports||[]).forEach(r=>{
      const key=[String(r.customer||'').toLowerCase(),r.start||'',r.end||''].join('|');if(seen.has(key))issues.push((day.date||'')+': möglicher Doppeleintrag');seen.add(key);
      let a=minutes521(r.start),b=minutes521(r.end);if(a===null||b===null){issues.push((day.date||'')+': Uhrzeit unvollständig');return;}if(b<a)b+=1440;intervals.push({a,b});
    });
    intervals.sort((x,y)=>x.a-y.a);for(let i=1;i<intervals.length;i++)if(intervals[i].a<intervals[i-1].b){issues.push((day.date||'')+': überschneidende Uhrzeiten');break;}
  });
  return [...new Set(issues)];
}
function setEmployeeOpen521(box,open,name){
  if(!box)return;box.classList.toggle('dg521-collapsed',!open);const t=box.querySelector('.dg521-toggle');if(t)t.textContent=open?'−':'+';if(name){if(open)openEmployees521.add(name);else openEmployees521.delete(name)}
}
function decorateEmployeeGroups521(rows){
  const boxes=[...document.querySelectorAll('#dg48DayResult .dg48-days-employee')];(rows||[]).forEach((emp,i)=>{const box=boxes[i];if(!box)return;const name=String(emp.employee||'Mitarbeiter'),issues=plausibility521(emp),ok=!issues.length;let head=box.querySelector(':scope > .dg521-employee-head');const old=box.querySelector(':scope > strong');if(old)old.classList.add('hidden');if(!head){head=document.createElement('button');head.type='button';head.className='dg521-employee-head';box.insertBefore(head,box.firstChild);head.addEventListener('click',()=>setEmployeeOpen521(box,box.classList.contains('dg521-collapsed'),name));}
    head.innerHTML='<span class="dg521-lamp '+(ok?'ok':'bad')+'"></span><strong>'+esc521(name)+'</strong><span class="dg521-plausibility '+(ok?'ok':'bad')+'">'+(ok?'Alles plausibel':'Überprüfung notwendig')+'</span><span class="dg521-meta">'+Number((emp.days||[]).length)+' Tag'+((emp.days||[]).length===1?'':'e')+(ok?'':' · '+issues.length+' Hinweis'+(issues.length===1?'':'e'))+'</span><span class="dg521-toggle">+</span>';
    head.title=ok?'Keine Auffälligkeit in der Schnellprüfung.':issues.join('\n');setEmployeeOpen521(box,openEmployees521.has(name),name);
  });
}

function ensureDeleteModal521(){
  if(q521('dg521DeleteModal'))return;
  const m=document.createElement('div');m.id='dg521DeleteModal';m.className='dg520-modal hidden';m.innerHTML='<div class="dg520-modal-card"><h2 style="margin-top:0">Eintrag entfernen &amp; Stunden abziehen</h2><div id="dg521DeleteSummary" class="dg521-delete-summary"></div><div id="dg521DeleteWarning"></div><label>Begründung</label><textarea id="dg521DeleteReason" placeholder="z. B. versehentliche Doppelbuchung" rows="3"></textarea><div class="button-row"><button class="btn danger" type="button" onclick="return dg521ConfirmDelete()">Eintrag endgültig entfernen</button><button class="btn secondary" type="button" onclick="return dg521CloseDelete()">Abbrechen</button></div><div id="dg521DeleteStatus"></div></div>';document.body.appendChild(m);m.addEventListener('click',e=>{if(e.target===m)dg521CloseDelete()});
}
window.dg521OpenDelete=function(employee,date,entryId,customer,hours,billed){
  ensureDeleteModal521();deletePayload521={employee:decodeURIComponent(employee),date:String(date||''),entryId:decodeURIComponent(entryId),customer:decodeURIComponent(customer||''),hours:Number(hours||0),billed:String(billed)==='1'};q521('dg521DeleteSummary').innerHTML='<strong>'+esc521(deletePayload521.employee)+' · '+esc521(typeof formatDateDE==='function'?formatDateDE(deletePayload521.date):deletePayload521.date)+'</strong><br>'+esc521(deletePayload521.customer||'Ohne Baustellenangabe')+' · '+Number(deletePayload521.hours||0).toFixed(2).replace('.',',')+' Std.';q521('dg521DeleteWarning').innerHTML=deletePayload521.billed?'<div class="dg521-delete-warning">⚠ Dieser Eintrag ist bereits als abgerechnet markiert. Die Büro-Korrektur wird protokolliert; die Stunden werden trotzdem aus Tages- und Monatswerten entfernt.</div>':'';q521('dg521DeleteReason').value='';q521('dg521DeleteStatus').innerHTML='';q521('dg521DeleteModal').classList.remove('hidden');setTimeout(()=>q521('dg521DeleteReason').focus(),30);return false;
};
window.dg521CloseDelete=function(){q521('dg521DeleteModal')?.classList.add('hidden');deletePayload521=null;return false};
window.dg521ConfirmDelete=async function(){
  if(!deletePayload521)return false;const reason=q521('dg521DeleteReason').value.trim();if(!reason){if(typeof setMessage==='function')setMessage('dg521DeleteStatus','Bitte eine Begründung eintragen.','error');return false;}if(!confirm('Eintrag wirklich entfernen? Die gebuchten Stunden werden automatisch neu berechnet.'))return false;
  try{setMessage('dg521DeleteStatus','Eintrag wird entfernt und Stunden werden neu berechnet ...','info');const p=deletePayload521;await api(chefPayload({action:'deleteBossDayEntry',targetEmployee:p.employee,date:p.date,entryId:p.entryId,reason:reason}));dg521CloseDelete();if(typeof loadBossDayClosuresV48==='function')await loadBossDayClosuresV48();if(typeof loadBossMonth==='function')await loadBossMonth();if(typeof d3Dashboard==='function')await d3Dashboard();if(typeof dg520RunAudit==='function'&&q521('dg520Result')?.innerHTML)await dg520RunAudit();if(typeof d3Notice==='function')d3Notice('✓ Eintrag entfernt. Tages- und Monatsstunden wurden neu berechnet.','ok');}catch(e){setMessage('dg521DeleteStatus',e.message,'error')}return false;
};

function decorateReportActions521(rows){
  const boxes=[...document.querySelectorAll('#dg48DayResult .dg48-days-employee')];(rows||[]).forEach((emp,ei)=>{const box=boxes[ei];if(!box)return;const cards=[...box.querySelectorAll(':scope > .dg48-day-grid > .dg48-day')];(emp.days||[]).forEach((day,di)=>{const card=cards[di];if(!card)return;const reports=[...card.querySelectorAll('.dg49-detail .dg49-report')];(day.reports||[]).forEach((rep,ri)=>{const el=reports[ri];if(!el||!rep||!rep.id)return;el.querySelectorAll('.dg512-delete-entry,.dg520-correct-btn').forEach(x=>x.remove());[...el.querySelectorAll('.muted.small')].forEach(n=>{if((n.textContent||'').includes('Bereits abgerechnet'))n.remove();});let actions=el.querySelector('.dg521-report-actions');if(actions)actions.remove();actions=document.createElement('div');actions.className='dg521-report-actions';const assigned=String(rep.id).indexOf('assigned:')===0,billed=String(rep.billingStatus||'Offen')==='Abgerechnet';if(billed){const note=document.createElement('div');note.className='dg521-billed-note';note.textContent='Bereits abgerechnet – Büro-Korrektur ist mit Begründung möglich.';el.appendChild(note);}const edit=document.createElement('button');edit.type='button';edit.className='btn primary';edit.textContent=assigned?'Mitarbeit – Quellbericht bearbeiten':'Eintrag bearbeiten';edit.disabled=assigned;edit.addEventListener('click',ev=>{ev.preventDefault();ev.stopPropagation();if(assigned)return;dg520OpenCorrection(encodeURIComponent(emp.employee),day.date,encodeURIComponent(rep.id),rep.start||'',rep.end||'',encodeURIComponent(rep.customer||''));setTimeout(()=>{const m=q521('dg520CorrectionModal');if(m){const h=m.querySelector('h2');if(h)h.textContent='Eintrag bearbeiten';}},0);});const del=document.createElement('button');del.type='button';del.className='btn danger';del.textContent='Eintrag entfernen & Stunden abziehen';del.addEventListener('click',ev=>{ev.preventDefault();ev.stopPropagation();dg521OpenDelete(encodeURIComponent(emp.employee),day.date,encodeURIComponent(rep.id),encodeURIComponent(rep.customer||''),Number(rep.hours||0),billed?'1':'0');});actions.append(edit,del);el.appendChild(actions);})})});
}

function installDayRenderer521(){
  if(window.__dg521RendererWrapped||typeof window.renderBossDayClosuresV48!=='function')return;window.__dg521RendererWrapped=true;const old=window.renderBossDayClosuresV48;window.renderBossDayClosuresV48=function(rows){const r=old.apply(this,arguments);decorateEmployeeGroups521(rows);decorateReportActions521(rows);return r};
}
function installOpenDayPatch521(){
  if(window.__dg521OpenDayWrapped||typeof window.dg520OpenDay!=='function')return;window.__dg521OpenDayWrapped=true;const old=window.dg520OpenDay;window.dg520OpenDay=async function(empEncoded,date){const r=await old.apply(this,arguments);const employee=decodeURIComponent(empEncoded),boxes=[...document.querySelectorAll('#dg48DayResult .dg48-days-employee')],box=boxes.find(b=>((b.querySelector('.dg521-employee-head strong')||b.querySelector(':scope > strong'))?.textContent||'').trim()===employee);if(box){setEmployeeOpen521(box,true,employee);const wanted=typeof formatDateDE==='function'?formatDateDE(date):date,card=[...box.querySelectorAll('.dg48-day')].find(c=>(c.querySelector(':scope > strong')?.textContent||'').trim()===wanted);if(card)setTimeout(()=>card.scrollIntoView({behavior:'smooth',block:'center'}),40);}return r};
}

function applyFixes521(){addCss521();ensureDeleteModal521();ensurePayrollTile521();fixMaintenanceAndAdmin521();installDayRenderer521();installOpenDayPatch521();}
const oldInstallOffice521=window.d3InstallOffice;if(typeof oldInstallOffice521==='function')window.d3InstallOffice=function(){const r=oldInstallOffice521.apply(this,arguments);setTimeout(applyFixes521,0);return r};
const observer521=new MutationObserver(()=>{ensurePayrollTile521();fixMaintenanceAndAdmin521();});
function boot521(){applyFixes521();const root=q521('bossView');if(root)observer521.observe(root,{childList:true,subtree:true});setTimeout(applyFixes521,250);setTimeout(applyFixes521,1200);setInterval(ensurePayrollTile521,60000);document.title='DG Zeiterfassung '+V521;document.querySelectorAll('.login-card .muted.small').forEach(x=>{if(/^Version /.test((x.textContent||'').trim()))x.textContent='Version '+V521});document.querySelectorAll('.hero strong').forEach(x=>{if(/Zeiterfassung/.test(x.textContent||''))x.textContent='Zeiterfassung - '+V521});try{if(window.DG3)DG3.version=V521;window.DG_APP_VERSION=V521}catch(_e){}}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot521);else boot521();
})();
