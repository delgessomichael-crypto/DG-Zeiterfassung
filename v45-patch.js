(function(){
  'use strict';
  if(window.__DG_V45_PATCH__) return;
  window.__DG_V45_PATCH__=true;

  const byId=id=>document.getElementById(id);

  function escAttr(v){return String(v==null?'':v).replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;').replace(/>/g,'&gt;')}

  function addStyles(){
    if(byId('dgV45Styles')) return;
    const s=document.createElement('style');
    s.id='dgV45Styles';
    s.textContent=`
      .dg-v45-modal{position:fixed;inset:0;z-index:10050;background:rgba(0,0,0,.45);display:flex;align-items:center;justify-content:center;padding:20px}
      .dg-v45-modal.hidden{display:none!important}.dg-v45-card{background:#fff;border-radius:18px;max-width:640px;width:100%;padding:24px;box-shadow:0 18px 60px rgba(0,0,0,.28);max-height:90vh;overflow:auto}
      .dg-v45-actions{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:18px}.dg-v45-choice{border:1px solid #d1d5db;border-radius:12px;padding:12px;margin-top:10px;display:flex;justify-content:space-between;gap:12px;align-items:center}
      .dg-v45-choice .btn{width:auto}.dg-global-status{position:fixed;top:18px;left:50%;transform:translateX(-50%);z-index:10070;min-width:min(92vw,420px);max-width:92vw;padding:12px 16px;border-radius:12px;font-weight:800;text-align:center;box-shadow:0 8px 25px rgba(0,0,0,.18)}
      .dg-global-status.info{background:#e0f2fe;color:#075985}.dg-global-status.ok{background:#dcfce7;color:#166534}.dg-global-status.error{background:#fee2e2;color:#991b1b}
      @media(max-width:700px){.dg-v45-actions{grid-template-columns:1fr}.dg-v45-choice{flex-direction:column;align-items:stretch}.dg-v45-choice .btn{width:100%}}
    `;
    document.head.appendChild(s);
  }

  function addModals(){
    if(!byId('dgGlobalStatus')){const e=document.createElement('div');e.id='dgGlobalStatus';e.className='dg-global-status hidden';document.body.appendChild(e)}
    if(!byId('dgDeleteModal')){const e=document.createElement('div');e.id='dgDeleteModal';e.className='dg-v45-modal hidden';e.innerHTML='<div class="dg-v45-card" style="max-width:480px"><h2 style="margin-top:0">Eintrag wirklich entfernen?</h2><div>Der ausgewählte Tageseintrag wird endgültig gelöscht.</div><div class="dg-v45-actions"><button class="btn success" onclick="dgConfirmDeleteEntry()">Ja</button><button class="btn danger" onclick="dgCancelDeleteEntry()">Nein</button></div></div>';document.body.appendChild(e)}
    if(!byId('dgRegieSelectModal')){const e=document.createElement('div');e.id='dgRegieSelectModal';e.className='dg-v45-modal hidden';e.innerHTML='<div class="dg-v45-card"><h2 style="margin-top:0">Bericht bearbeiten</h2><div class="muted">Bitte den Einzelbericht auswählen.</div><div id="dgRegieSelectList"></div><div class="dg-v45-actions" style="grid-template-columns:1fr"><button class="btn secondary" onclick="dgCloseRegieSelect()">Abbrechen</button></div></div>';document.body.appendChild(e)}
    if(!byId('dgRegieEditModal')){const e=document.createElement('div');e.id='dgRegieEditModal';e.className='dg-v45-modal hidden';e.innerHTML='<div class="dg-v45-card"><h2 style="margin-top:0">Regiebericht bearbeiten</h2><input id="dgEditId" type="hidden"><label>Datum</label><input id="dgEditDate" type="date"><label>Kunde / Baustelle</label><input id="dgEditCustomer"><div class="grid2"><div><label>Von</label><input id="dgEditStart" type="time"></div><div><label>Bis</label><input id="dgEditEnd" type="time"></div></div><label>Ausgeführte Tätigkeit</label><textarea id="dgEditActivity"></textarea><label style="display:flex;gap:8px;align-items:center"><input id="dgEditMaterialUsed" type="checkbox" style="width:auto" onchange="dgToggleMaterial()"> Material verbaut</label><div id="dgEditMaterialWrap" class="hidden"><label>Material</label><textarea id="dgEditMaterial"></textarea></div><label>Auftragsstatus</label><select id="dgEditJobStatus"><option value="Laufend">Laufend</option><option value="Abgeschlossen">Abgeschlossen</option></select><div id="dgEditStatus"></div><div class="dg-v45-actions"><button class="btn primary" onclick="dgSaveRegieEdit()">Änderungen speichern</button><button class="btn secondary" onclick="dgCloseRegieEdit()">Abbrechen</button></div></div>';document.body.appendChild(e)}
  }

  function showGlobal(text,type,ms){const e=byId('dgGlobalStatus');if(!e)return;e.textContent=text;e.className='dg-global-status '+(type||'info');e.classList.remove('hidden');clearTimeout(window.__dgStatusTimer);if(ms)window.__dgStatusTimer=setTimeout(()=>e.classList.add('hidden'),ms)}

  const writes=new Set(['saveEmployeeAdmin','setEmployeeActive','deleteEmployeeAdmin','saveAbsence','saveTimeBankManual','applyTimeBankToMonth','bankMonthSurplus','deleteAbsence','syncHolidays','saveVacationEntitlement','saveMonthlyAdjustment','deleteMonthlyAdjustment','markConflictReviewed','setMonthClosureStatus','setDayStatus','confirmEmployeeAssignment','reportEmployeeAssignmentIssue','saveEntry','deleteEntry','closeDay','sendMonthReport','setRegieObjectJobStatus','markRegieObjectCompleted','markRegieObjectBilled','markRegieReportBilled','mergeRegieObjects','updateRegieReport']);
  const baseApi=window.api;
  if(typeof baseApi==='function') window.api=async function(payload){const action=String(payload&&payload.action||'');const write=writes.has(action);if(write)showGlobal('Wird verarbeitet ...','info');try{const r=await baseApi(payload);if(action==='getRegieReports')window.__dgRegieRaw=r||[];if(write)showGlobal('✓ Aktion erfolgreich abgeschlossen.','ok',1700);return r}catch(e){if(write)showGlobal('Aktion fehlgeschlagen: '+(e&&e.message?e.message:'Unbekannter Fehler'),'error',4500);throw e}};

  let pendingDelete='';
  window.deleteEntry=function(id){if(!navigator.onLine){if(typeof setMessage==='function')setMessage('entryStatus','Löschen ist offline erst nach der Synchronisierung möglich.','warn');return}pendingDelete=String(id||'');byId('dgDeleteModal').classList.remove('hidden')};
  window.dgCancelDeleteEntry=function(){pendingDelete='';byId('dgDeleteModal').classList.add('hidden')};
  window.dgConfirmDeleteEntry=async function(){const id=pendingDelete;window.dgCancelDeleteEntry();if(!id)return;try{setMessage('entryStatus','Eintrag wird entfernt ...','info');const a=auth();window.lastDayData=await window.api({action:'deleteEntry',id,employee:a.employee,date:byId('date').value,pin:a.pin});renderDay();setMessage('entryStatus','✓ Eintrag wurde entfernt.','ok')}catch(e){setMessage('entryStatus',e.message,'error')}};

  window.__dgReportMap={};window.__dgGroupMap={};
  function groupsFor(view){let groups=window.__dgRegieRaw||[];if(typeof mergeRegieGroups==='function')groups=mergeRegieGroups(groups);if(view==='Laufend')groups=groups.filter(g=>(g.jobStatus||'Abgeschlossen')==='Laufend');if(view==='Abgeschlossen')groups=groups.filter(g=>(g.jobStatus||'Abgeschlossen')==='Abgeschlossen');return groups}

  function enhanceRegie(view){
    const root=byId('regieResult');if(!root)return;
    const groups=groupsFor(view);const cards=Array.from(root.children).filter(e=>e.classList&&e.classList.contains('report-card'));
    cards.forEach(card=>{card.querySelectorAll(':scope > .report-actions button').forEach(btn=>{if((btn.textContent||'').includes('Falschmeldung korrigieren')){btn.textContent='Auf laufend zurücksetzen';btn.classList.remove('secondary');btn.classList.add('danger')}})});
    groups.forEach((g,i)=>{
      const card=cards[i];if(!card)return;const reports=(g.reports||[]).filter(r=>r&&r.id);const key='g'+i+'_'+String(g.objectId||g.firstDate||'');window.__dgGroupMap[key]=reports.map(r=>String(r.id));reports.forEach(r=>window.__dgReportMap[String(r.id)]=r);
      const actionRow=Array.from(card.children).find(e=>e.classList&&e.classList.contains('report-actions'));if(actionRow&&!actionRow.querySelector('[data-dg-main-edit]')){const b=document.createElement('button');b.type='button';b.className='btn primary';b.textContent='Bericht bearbeiten';b.dataset.dgMainEdit='1';b.onclick=()=>window.dgRequestGroupEdit(key);actionRow.insertBefore(b,actionRow.firstChild)}
    });
  }

  const baseLoadRegie=window.loadRegieReports;
  if(typeof baseLoadRegie==='function')window.loadRegieReports=async function(view){const r=await baseLoadRegie(view);enhanceRegie(view);return r};

  window.dgRequestGroupEdit=function(key){const ids=window.__dgGroupMap[key]||[];if(!ids.length){setMessage('regieStatus','Kein bearbeitbarer Einzelbericht gefunden.','error');return}if(ids.length===1){window.dgOpenRegieEdit(ids[0]);return}const list=byId('dgRegieSelectList');list.innerHTML=ids.map(id=>{const r=window.__dgReportMap[id]||{};return '<div class="dg-v45-choice"><div><strong>'+formatDateDE(r.date||'')+' · '+esc(r.employee||'')+' · '+formatHours(r.hours||0)+' Std.</strong><div class="report-meta">'+esc((r.start||'')+'–'+(r.end||''))+'</div><div>'+esc(r.activity||'')+'</div></div><button class="btn primary" data-id="'+escAttr(id)+'">Bearbeiten</button></div>'}).join('');list.querySelectorAll('button[data-id]').forEach(b=>b.onclick=()=>{window.dgCloseRegieSelect();window.dgOpenRegieEdit(b.dataset.id)});byId('dgRegieSelectModal').classList.remove('hidden')};
  window.dgCloseRegieSelect=function(){byId('dgRegieSelectModal').classList.add('hidden')};
  window.dgOpenRegieEdit=function(id){const r=window.__dgReportMap[String(id)]||null;if(!r){setMessage('regieStatus','Bericht konnte nicht geladen werden.','error');return}byId('dgEditId').value=r.id||'';byId('dgEditDate').value=r.date||'';byId('dgEditCustomer').value=r.customer||'';byId('dgEditStart').value=r.start||'';byId('dgEditEnd').value=r.end||'';byId('dgEditActivity').value=r.activity||'';byId('dgEditMaterialUsed').checked=Boolean(r.materialUsed);byId('dgEditMaterial').value=r.material||'';byId('dgEditJobStatus').value=r.jobStatus||'Abgeschlossen';window.dgToggleMaterial();if(typeof clearMessage==='function')clearMessage('dgEditStatus');byId('dgRegieEditModal').classList.remove('hidden')};
  window.dgToggleMaterial=function(){byId('dgEditMaterialWrap').classList.toggle('hidden',!byId('dgEditMaterialUsed').checked)};
  window.dgCloseRegieEdit=function(){byId('dgRegieEditModal').classList.add('hidden')};
  window.dgSaveRegieEdit=async function(){const entryId=byId('dgEditId').value;const item={date:byId('dgEditDate').value,customer:byId('dgEditCustomer').value.trim(),start:byId('dgEditStart').value,end:byId('dgEditEnd').value,activity:byId('dgEditActivity').value.trim(),materialUsed:byId('dgEditMaterialUsed').checked,material:byId('dgEditMaterial').value.trim(),jobStatus:byId('dgEditJobStatus').value};if(!entryId||!item.date||!item.customer||!item.start||!item.end||!item.activity){setMessage('dgEditStatus','Bitte alle Pflichtfelder ausfüllen.','error');return}try{setMessage('dgEditStatus','Änderungen werden gespeichert ...','info');await window.api(chefPayload({action:'updateRegieReport',entryId,item}));window.dgCloseRegieEdit();await window.loadRegieReports(window.__regieStatus||'Abgeschlossen');setMessage('regieStatus','✓ Regiebericht wurde aktualisiert.','ok')}catch(e){setMessage('dgEditStatus',e.message,'error')}};

  document.title='DG Zeiterfassung v45';
  addStyles();addModals();
})();
