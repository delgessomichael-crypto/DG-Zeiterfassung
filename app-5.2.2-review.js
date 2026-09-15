/* DG Zeiterfassung 5.2.2 - sichtbare Mitarbeiter-Pruefung und Freigabe */
(function(){
'use strict';
const V522='5.2.2';
const $522=id=>document.getElementById(id);
const esc522=v=>String(v==null?'':v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let audit522=null,lastRows522=[],auditSeq522=0;

function addCss522(){
  if($522('dg522Styles'))return;
  const s=document.createElement('style');s.id='dg522Styles';s.textContent=`
  .dg522-review-panel{border:1px solid #dbe2ea;border-radius:14px;background:#f8fafc;padding:12px 14px;margin:0 0 14px}
  .dg521-collapsed .dg522-review-panel{display:none!important}
  .dg522-review-title{display:flex;align-items:center;gap:8px;flex-wrap:wrap;font-weight:900;margin-bottom:8px}
  .dg522-review-list{display:grid;gap:8px;margin-top:8px}
  .dg522-issue{border-radius:11px;background:#fff;border:1px solid #e5e7eb;padding:10px 11px}
  .dg522-issue.error{border-left:6px solid #dc2626}.dg522-issue.warn{border-left:6px solid #f59e0b}.dg522-issue.reviewed{border-left:6px solid #16a34a;background:#f0fdf4}
  .dg522-issue-head{font-weight:900}.dg522-issue-detail{font-size:13px;color:#64748b;margin-top:3px}.dg522-issue-actions{display:flex;gap:7px;flex-wrap:wrap;margin-top:8px}.dg522-issue-actions .btn{width:auto!important;margin:0!important}
  .dg522-release{margin-top:12px;padding-top:10px;border-top:1px solid #dbe2ea}.dg522-release .btn{width:100%!important}
  .dg522-release-ok{padding:10px;border-radius:10px;background:#dcfce7;color:#166534;font-weight:900;text-align:center}
  .dg522-release-blocked{padding:10px;border-radius:10px;background:#fee2e2;color:#991b1b;font-weight:900}
  .dg522-loading{padding:9px;border-radius:10px;background:#eff6ff;color:#1e40af;font-weight:800}
  @media(max-width:720px){.dg522-issue-actions .btn{width:100%!important}}
  `;document.head.appendChild(s);
}
function period522(){
  return {year:Number($522('dg48DayYear')?.value||$522('bossYear')?.value||new Date().getFullYear()),month:Number($522('dg48DayMonth')?.value||$522('bossMonth')?.value||(new Date().getMonth()+1))};
}
function date522(v){if(typeof formatDateDE==='function')return formatDateDE(v);const p=String(v||'').split('-');return p.length===3?p[2]+'.'+p[1]+'.'+p[0]:String(v||'')}
function employeeBox522(name){return [...document.querySelectorAll('#dg48DayResult .dg48-days-employee')].find(box=>((box.querySelector('.dg521-employee-head strong')||box.querySelector(':scope > strong'))?.textContent||'').trim()===String(name||'').trim())}
function employeeIssues522(name){return (audit522?.issues||[]).filter(x=>String(x.employee||'')===String(name||''));}
function unresolved522(x){return x.severity==='error'||(x.severity==='warn'&&!x.reviewed)}
function updateHeader522(box,emp,issues){
  const head=box?.querySelector(':scope > .dg521-employee-head');if(!head)return;
  const errors=issues.filter(x=>x.severity==='error').length,openWarnings=issues.filter(x=>x.severity==='warn'&&!x.reviewed).length,open=errors+openWarnings,ok=open===0;
  const lamp=head.querySelector('.dg521-lamp'),label=head.querySelector('.dg521-plausibility'),meta=head.querySelector('.dg521-meta');
  if(lamp){lamp.classList.toggle('ok',ok);lamp.classList.toggle('bad',!ok)}
  if(label){label.classList.toggle('ok',ok);label.classList.toggle('bad',!ok);label.textContent=ok?(issues.length?'Geprüft / freigegeben':'Alles plausibel'):'Überprüfung notwendig'}
  if(meta){const days=Number((emp?.days||[]).length);meta.textContent=days+' Tag'+(days===1?'':'e')+(issues.length?(open?' · '+open+' offen':' · '+issues.length+' geprüft'):'');}
  head.title=issues.length?issues.map(x=>(x.reviewed&&x.severity==='warn'?'✓ ':'')+(x.date?date522(x.date)+' · ':'')+x.title).join('\n'):'Keine Auffälligkeiten in der Monatsprüfung.';
}
function issueHtml522(x){
  const cls=x.severity==='error'?'error':(x.reviewed?'reviewed':'warn');
  const icon=x.severity==='error'?'🔴':(x.reviewed?'🟢':'🟠');
  const status=x.severity==='error'?'Korrektur erforderlich':(x.reviewed?'geprüft – korrekt':'prüfen');
  const emp=encodeURIComponent(x.employee||''),id=encodeURIComponent(x.id||'');
  return '<div class="dg522-issue '+cls+'"><div class="dg522-issue-head">'+icon+' '+esc522(x.date?date522(x.date)+' · ':'')+esc522(x.title||'Hinweis')+' · '+esc522(status)+'</div>'+(x.detail?'<div class="dg522-issue-detail">'+esc522(x.detail)+'</div>':'')+'<div class="dg522-issue-actions">'+(x.date?'<button class="btn secondary" type="button" onclick="return dg522OpenIssueDay(\''+emp+'\',\''+esc522(x.date)+'\')">Tag öffnen</button>':'')+(x.severity==='warn'&&!x.reviewed?'<button class="btn success" type="button" onclick="return dg522ReviewOne(\''+id+'\',\''+emp+'\',\''+esc522(x.date||'')+'\')">✓ Geprüft – korrekt</button>':'')+'</div></div>';
}
function renderEmployeeReview522(emp){
  const name=String(emp?.employee||''),box=employeeBox522(name);if(!box)return;
  const issues=employeeIssues522(name);updateHeader522(box,emp,issues);
  let panel=box.querySelector(':scope > .dg522-review-panel');if(!panel){panel=document.createElement('div');panel.className='dg522-review-panel';const head=box.querySelector(':scope > .dg521-employee-head');if(head)head.insertAdjacentElement('afterend',panel);else box.insertBefore(panel,box.firstChild);}
  const errors=issues.filter(x=>x.severity==='error'),warnings=issues.filter(x=>x.severity==='warn'),openWarnings=warnings.filter(x=>!x.reviewed),reviewedWarnings=warnings.filter(x=>x.reviewed);
  let html='<div class="dg522-review-title">Prüfung '+esc522(name)+' · '+esc522(date522(String(period522().year)+'-'+String(period522().month).padStart(2,'0')+'-01').slice(3))+'</div>';
  if(!issues.length){html+='<div class="status ok">🟢 Keine Auffälligkeiten gefunden. Für diesen Mitarbeiter besteht aktuell kein Handlungsbedarf.</div>';}
  else{
    html+='<div class="muted small">'+issues.length+' Prüfposition'+(issues.length===1?'':'en')+': '+errors.length+' Fehler · '+openWarnings.length+' ungeprüfte Hinweise · '+reviewedWarnings.length+' bereits geprüft.</div><div class="dg522-review-list">'+issues.map(issueHtml522).join('')+'</div>';
    html+='<div class="dg522-release">';
    if(errors.length){html+='<div class="dg522-release-blocked">🔴 Freigabe gesperrt: '+errors.length+' Fehler müssen zuerst korrigiert werden. Hinweise können unabhängig davon geprüft werden.</div>';}
    else if(openWarnings.length){html+='<button class="btn success" type="button" onclick="return dg522ReleaseEmployee(\''+encodeURIComponent(name)+'\')">✓ Alle Hinweise geprüft – Mitarbeiter freigeben</button>';}
    else{html+='<div class="dg522-release-ok">✓ Mitarbeiter für diesen Monat geprüft / freigegeben</div>';}
    html+='</div>';
  }
  panel.innerHTML=html;
}
function renderAll522(){(lastRows522||[]).forEach(renderEmployeeReview522)}
async function refreshAudit522(rows){
  if(rows)lastRows522=rows||[];const p=period522(),seq=++auditSeq522;if(!(p.year>0&&p.month>=1&&p.month<=12))return;
  document.querySelectorAll('#dg48DayResult .dg48-days-employee').forEach(box=>{let panel=box.querySelector(':scope > .dg522-review-panel');if(!panel){panel=document.createElement('div');panel.className='dg522-review-panel';box.querySelector(':scope > .dg521-employee-head')?.insertAdjacentElement('afterend',panel);}if(panel&&!panel.innerHTML)panel.innerHTML='<div class="dg522-loading">Prüfhinweise werden geladen ...</div>';});
  try{const a=await api(chefPayload({action:'getMonthPayrollAudit',year:p.year,month:p.month}));if(seq!==auditSeq522)return;audit522=a||{issues:[]};renderAll522();}catch(e){if(seq!==auditSeq522)return;document.querySelectorAll('#dg48DayResult .dg522-review-panel').forEach(p=>p.innerHTML='<div class="status error">Prüfhinweise konnten nicht geladen werden: '+esc522(e.message)+'</div>');}
}
window.dg522OpenIssueDay=function(empEncoded,date){const emp=decodeURIComponent(empEncoded);if(typeof dg520OpenDay==='function')return dg520OpenDay(encodeURIComponent(emp),date);return false};
window.dg522ReviewOne=async function(issueEncoded,empEncoded,date){
  const issueId=decodeURIComponent(issueEncoded),employee=decodeURIComponent(empEncoded),p=period522();
  try{await api(chefPayload({action:'markPayrollIssueReviewed',issueId:issueId,targetEmployee:employee,year:p.year,month:p.month,date:date||'',note:'Geprüft – korrekt in Mitarbeiter-Tagesübersicht'}));await refreshAudit522();if(typeof d3Notice==='function')d3Notice('✓ Hinweis als geprüft gespeichert.','ok');}catch(e){if(typeof d3Notice==='function')d3Notice(e.message,'error');else alert(e.message)}return false;
};
window.dg522ReleaseEmployee=async function(empEncoded){
  const employee=decodeURIComponent(empEncoded),issues=employeeIssues522(employee),errors=issues.filter(x=>x.severity==='error'),openWarnings=issues.filter(x=>x.severity==='warn'&&!x.reviewed),p=period522();
  if(errors.length){if(typeof d3Notice==='function')d3Notice('Freigabe nicht möglich: zuerst die roten Fehler korrigieren.','error');return false;}
  if(!openWarnings.length)return false;
  if(!confirm(employee+': '+openWarnings.length+' Hinweis'+(openWarnings.length===1?'':'e')+' wirklich als geprüft und korrekt bestätigen?'))return false;
  const box=employeeBox522(employee),panel=box?.querySelector('.dg522-review-panel');if(panel)panel.innerHTML='<div class="dg522-loading">Freigabe wird gespeichert ...</div>';
  try{for(const x of openWarnings){await api(chefPayload({action:'markPayrollIssueReviewed',issueId:x.id,targetEmployee:employee,year:p.year,month:p.month,date:x.date||'',note:'Mitarbeiter geprüft / freigegeben in Tagesübersicht'}));}await refreshAudit522();if(typeof d3Notice==='function')d3Notice('✓ '+employee+' geprüft und freigegeben.','ok');}catch(e){if(typeof d3Notice==='function')d3Notice(e.message,'error');else alert(e.message);await refreshAudit522();}return false;
};
function installRenderer522(){
  if(window.__dg522RendererWrapped||typeof window.renderBossDayClosuresV48!=='function')return;window.__dg522RendererWrapped=true;const old=window.renderBossDayClosuresV48;window.renderBossDayClosuresV48=function(rows){const r=old.apply(this,arguments);lastRows522=rows||[];setTimeout(()=>refreshAudit522(rows),0);return r};
}
function installMonthSelectors522(){['dg48DayYear','dg48DayMonth'].forEach(id=>{const el=$522(id);if(!el||el.dataset.dg522==='1')return;el.dataset.dg522='1';el.addEventListener('change',()=>setTimeout(()=>refreshAudit522(),0));});}
function boot522(){addCss522();installRenderer522();installMonthSelectors522();document.title='DG Zeiterfassung '+V522;document.querySelectorAll('.login-card .muted.small').forEach(x=>{if(/^Version /.test((x.textContent||'').trim()))x.textContent='Version '+V522});document.querySelectorAll('.hero strong').forEach(x=>{if(/Zeiterfassung/.test(x.textContent||''))x.textContent='Zeiterfassung - '+V522});try{if(window.DG3)DG3.version=V522;window.DG_APP_VERSION=V522}catch(_e){}setTimeout(installMonthSelectors522,500);}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot522);else boot522();
})();
