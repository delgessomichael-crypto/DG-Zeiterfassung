(function(){
  'use strict';
  if(window.__DG_V44_PATCH__) return;
  window.__DG_V44_PATCH__=true;

  function byId(id){return document.getElementById(id)}
  function addStyles(){
    if(byId('dgV44Styles')) return;
    const style=document.createElement('style');
    style.id='dgV44Styles';
    style.textContent=`
      .global-action-status{position:fixed;left:50%;top:18px;transform:translateX(-50%);z-index:10050;min-width:min(92vw,420px);max-width:92vw;padding:13px 16px;border-radius:14px;box-shadow:0 8px 30px rgba(0,0,0,.18);font-weight:800;text-align:center}
      .global-action-status.info{background:#e0f2fe;color:#075985}.global-action-status.ok{background:#dcfce7;color:#166534}.global-action-status.error{background:#fee2e2;color:#991b1b}
      .dg-v44-modal{position:fixed;inset:0;z-index:10040;background:rgba(0,0,0,.45);display:flex;align-items:center;justify-content:center;padding:20px}
      .dg-v44-modal.hidden{display:none!important}.dg-v44-modal-card{background:#fff;border-radius:18px;max-width:620px;width:100%;padding:24px;box-shadow:0 18px 60px rgba(0,0,0,.28);max-height:90vh;overflow:auto}
      .dg-v44-modal-actions{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:18px}
      .dg-report-choice{border:1px solid #d1d5db;border-radius:12px;padding:12px;margin-top:10px;display:flex;gap:12px;align-items:center;justify-content:space-between}
      .dg-report-choice .btn{width:auto;flex:0 0 auto}
      @media(max-width:700px){.dg-v44-modal-actions{grid-template-columns:1fr}.dg-report-choice{align-items:stretch;flex-direction:column}.dg-report-choice .btn{width:100%}}
    `;
    document.head.appendChild(style);
  }

  function addUi(){
    if(!byId('globalActionStatus')){
      const el=document.createElement('div');el.id='globalActionStatus';el.className='global-action-status hidden';document.body.appendChild(el);
    }
    if(!byId('deleteEntryConfirmModal')){
      const wrap=document.createElement('div');wrap.id='deleteEntryConfirmModal';wrap.className='dg-v44-modal hidden';
      wrap.innerHTML='<div class="dg-v44-modal-card" style="max-width:480px"><h2 style="margin-top:0">Eintrag wirklich entfernen?</h2><div style="font-size:17px;line-height:1.45">Der ausgewählte Tageseintrag wird endgültig gelöscht.</div><div class="dg-v44-modal-actions"><button class="btn success" type="button" onclick="confirmDeleteEntryUi()">Ja</button><button class="btn danger" type="button" onclick="cancelDeleteEntryUi()">Nein</button></div></div>';
      document.body.appendChild(wrap);
    }
    if(!byId('regieSelectEditModal')){
      const wrap=document.createElement('div');wrap.id='regieSelectEditModal';wrap.className='dg-v44-modal hidden';
      wrap.innerHTML='<div class="dg-v44-modal-card"><h2 style="margin-top:0">Bericht bearbeiten</h2><div class="muted">Dieser Auftrag enthält mehrere Einzelberichte. Bitte den Bericht auswählen, der geändert werden soll.</div><div id="regieSelectEditList"></div><div class="dg-v44-modal-actions" style="grid-template-columns:1fr"><button class="btn secondary" type="button" onclick="closeRegieSelectEdit()">Abbrechen</button></div></div>';
      document.body.appendChild(wrap);
    }
    if(!byId('regieEditModal')){
      const wrap=document.createElement('div');wrap.id='regieEditModal';wrap.className='dg-v44-modal hidden';
      wrap.innerHTML='<div class="dg-v44-modal-card"><h2 style="margin-top:0">Regiebericht bearbeiten</h2><input id="regieEditId" type="hidden"><label>Datum</label><input id="regieEditDate" type="date"><label>Kunde / Baustelle</label><input id="regieEditCustomer" type="text"><div class="grid2"><div><label>Von</label><input id="regieEditStart" type="time"></div><div><label>Bis</label><input id="regieEditEnd" type="time"></div></div><label>Ausgeführte Tätigkeit</label><textarea id="regieEditActivity"></textarea><label style="display:flex;gap:8px;align-items:center"><input id="regieEditMaterialUsed" type="checkbox" style="width:auto" onchange="toggleRegieEditMaterial()"> Material verbaut</label><div id="regieEditMaterialWrap" class="hidden"><label>Material</label><textarea id="regieEditMaterial"></textarea></div><label>Auftragsstatus</label><select id="regieEditJobStatus"><option value="Laufend">Laufend</option><option value="Abgeschlossen">Abgeschlossen</option></select><div id="regieEditStatus"></div><div class="dg-v44-modal-actions"><button class="btn primary" type="button" onclick="saveRegieReportEdit()">Änderungen speichern</button><button class="btn secondary" type="button" onclick="closeRegieReportEdit()">Abbrechen</button></div></div>';
      document.body.appendChild(wrap);
    }
  }

  function setVersion(){
    document.title='DG Zeiterfassung v44';
    const loginVersion=document.querySelector('.login-card .center.muted.small');
    if(loginVersion && /Version\s+\d+/i.test(loginVersion.textContent||'')) loginVersion.textContent='Version 44';
    const heroVersion=document.querySelector('.hero .head-row strong');
    if(heroVersion && /Zeiterfassung/.test(heroVersion.textContent||'')) heroVersion.textContent='Zeiterfassung · v44';
  }

  window.showGlobalActionStatus=function(text,type,autoHide){
    const el=byId('globalActionStatus');if(!el)return;
    el.textContent=text||'';el.className='global-action-status '+(type||'info');el.classList.remove('hidden');
    clearTimeout(window.__dgGlobalStatusTimer);
    if(autoHide) window.__dgGlobalStatusTimer=setTimeout(function(){el.classList.add('hidden')},autoHide);
  };

  const WRITE_ACTIONS=new Set([
    'saveEmployeeAdmin','setEmployeeActive','deleteEmployeeAdmin','saveAbsence','saveTimeBankManual','applyTimeBankToMonth','bankMonthSurplus','deleteAbsence','syncHolidays','saveVacationEntitlement','saveMonthlyAdjustment','deleteMonthlyAdjustment','markConflictReviewed','setMonthClosureStatus','setDayStatus','confirmEmployeeAssignment','reportEmployeeAssignmentIssue','saveEntry','deleteEntry','closeDay','sendMonthReport','setRegieObjectJobStatus','markRegieObjectCompleted','markRegieObjectBilled','markRegieReportBilled','mergeRegieObjects','updateRegieReport'
  ]);

  const originalApi=window.api;
  if(typeof originalApi==='function'){
    window.api=async function(payload){
      const action=String(payload&&.payload||'');
      const actualAction=String(payload&&payload.action||'');
      const isWrite=WRITE_ACTIONS.has(actualAction);
      if(isWrite) window.showGlobalActionStatus('Wird verarbeitet ...','info');
      try{
        const result=await originalApi(payload);
        if(actualAction==='getRegieReports') window.__dgV44LastRegieRaw=result||[];
        if(isWrite) window.showGlobalActionStatus('✓ Aktion erfolgreich abgeschlossen.','ok',1800);
        return result;
      }catch(e){
        if(isWrite) window.showGlobalActionStatus('Aktion fehlgeschlagen: '+(e&&e.message?e.message:'Unbekannter Fehler'),'error',4500);
        throw e;
      }
    };
  }

  let pendingDeleteEntryId='';
  window.deleteEntry=function(id){
    if(!navigator.onLine){if(typeof setMessage==='function')setMessage('entryStatus','Löschen ist offline erst nach der Synchronisierung möglich.','warn');return}
    pendingDeleteEntryId=String(id||'');
    const modal=byId('deleteEntryConfirmModal');if(modal)modal.classList.remove('hidden');
  };
  window.cancelDeleteEntryUi=function(){pendingDeleteEntryId='';const modal=byId('deleteEntryConfirmModal');if(modal)modal.classList.add('hidden')};
  window.confirmDeleteEntryUi=async function(){
    const id=pendingDeleteEntryId;window.cancelDeleteEntryUi();if(!id)return;
    const a=auth();
    try{
      if(typeof setMessage==='function')setMessage('entryStatus','Eintrag wird entfernt ...','info');
      window.lastDayData=await window.api({action:'deleteEntry',id:id,employee:a.employee,date:byId('date').value,pin:a.pin});
      renderDay();
      if(typeof setMessage==='function')setMessage('entryStatus','✓ Eintrag wurde entfernt.','ok');
    }catch(e){if(typeof setMessage==='function')setMessage('entryStatus',e.message,'error')}
  };

  window.__regieReportById=window.__regieReportById||{};
  window.__regieGroupReports=window.__regieGroupReports||{};
  function filteredRegieGroups(view){
    let groups=window.__dgV44LastRegieRaw||[];
    if(typeof mergeRegieGroups==='function') groups=mergeRegieGroups(groups);
    if(view==='Laufend') groups=(groups||[]).filter(function(g){return (g.jobStatus||'Abgeschlossen')==='Laufend'});
    if(view==='Abgeschlossen') groups=(groups||[]).filter(function(g){return (g.jobStatus||'Abgeschlossen')==='Abgeschlossen'});
    return groups||[];
  }
  function enhanceRegie(view){
    const root=byId('regieResult');if(!root)return;
    root.querySelectorAll('.report-card > .report-actions button').forEach(function(btn){
      if((btn.textContent||'').indexOf('Falschmeldung korrigieren')>=0){btn.textContent='Auf laufend zurücksetzen';btn.classList.remove('secondary');btn.classList.add('danger')}
    });
    const groups=filteredRegieGroups(view);
    const cards=Array.from(root.children).filter(function(el){return el.classList&&el.classList.contains('report-card')});
    groups.forEach(function(g,gi){
      const card=cards[gi];if(!card)return;
      const reports=(g.reports||[]).filter(function(r){return r&&r.id});
      const groupKey='group-'+gi+'-'+String(g.objectId||'')+'-'+String(g.firstDate||'');
      window.__regieGroupReports[groupKey]=reports.map(function(r){return String(r.id)});
      reports.forEach(function(r){window.__regieReportById[String(r.id)]=r});

      const mainActions=Array.from(card.children).find(function(el){return el.classList&&el.classList.contains('report-actions')});
      if(mainActions && !mainActions.querySelector('[data-dg-group-edit="'+groupKey+'"]')){
        const editBtn=document.createElement('button');editBtn.type='button';editBtn.className='btn primary';editBtn.textContent='Bericht bearbeiten';editBtn.dataset.dgGroupEdit=groupKey;editBtn.onclick=function(){window.requestRegieGroupEdit(groupKey)};mainActions.insertBefore(editBtn,mainActions.firstChild);
      }

      const entries=Array.from(card.querySelectorAll('details .entry'));
      reports.forEach(function(r,ri){
        const id=String(r.id||'');
        const entry=entries[ri];if(!entry)return;
        const actions=entry.querySelector('.report-actions');if(!actions||actions.querySelector('[data-dg-edit-report="'+CSS.escape(id)+'"]'))return;
        const btn=document.createElement('button');btn.type='button';btn.className='btn primary';btn.textContent='Bericht bearbeiten';btn.dataset.dgEditReport=id;btn.onclick=function(){window.openRegieReportEditById(id)};actions.appendChild(btn);
      });
    });
  }

  const originalLoadRegie=window.loadRegieReports;
  if(typeof originalLoadRegie==='function'){
    window.loadRegieReports=async function(view){const r=await originalLoadRegie(view);enhanceRegie(view);return r};
  }

  window.requestRegieGroupEdit=function(groupKey){
    const ids=(window.__regieGroupReports||{})[groupKey]||[];
    if(!ids.length){setMessage('regieStatus','Zu diesem Auftrag wurde kein bearbeitbarer Einzelbericht gefunden.','error');return}
    if(ids.length===1){window.openRegieReportEditById(ids[0]);return}
    const list=byId('regieSelectEditList');
    list.innerHTML=ids.map(function(id){
      const r=(window.__regieReportById||{})[id]||{};
      return '<div class="dg-report-choice"><div><strong>'+formatDateDE(r.date||'')+' · '+esc(r.employee||'')+' · '+formatHours(r.hours||0)+' Std.</strong><div class="report-meta">'+esc((r.start||'')+'–'+(r.end||''))+'</div><div>'+esc(r.activity||'')+'</div></div><button class="btn primary" type="button" data-edit-id="'+esc(id)+'">Bearbeiten</button></div>';
    }).join('');
    list.querySelectorAll('[data-edit-id]').forEach(function(btn){btn.onclick=function(){window.closeRegieSelectEdit();window.openRegieReportEditById(btn.dataset.editId)}});
    byId('regieSelectEditModal').classList.remove('hidden');
  };
  window.closeRegieSelectEdit=function(){const modal=byId('regieSelectEditModal');if(modal)modal.classList.add('hidden')};

  window.openRegieReportEditById=function(id){
    const r=(window.__regieReportById||{})[String(id||'')];
    if(!r){setMessage('regieStatus','Regiebericht konnte nicht geladen werden. Bitte Liste aktualisieren.','error');return}
    byId('regieEditId').value=r.id||'';byId('regieEditDate').value=r.date||'';byId('regieEditCustomer').value=r.customer||'';byId('regieEditStart').value=r.start||'';byId('regieEditEnd').value=r.end||'';byId('regieEditActivity').value=r.activity||'';byId('regieEditMaterialUsed').checked=Boolean(r.materialUsed);byId('regieEditMaterial').value=r.material||'';byId('regieEditJobStatus').value=r.jobStatus||'Abgeschlossen';
    window.toggleRegieEditMaterial();if(typeof clearMessage==='function')clearMessage('regieEditStatus');
    const modal=byId('regieEditModal');if(modal)modal.classList.remove('hidden');
  };
  window.toggleRegieEditMaterial=function(){const wrap=byId('regieEditMaterialWrap');if(wrap)wrap.classList.toggle('hidden',!byId('regieEditMaterialUsed').checked)};
  window.closeRegieReportEdit=function(){const modal=byId('regieEditModal');if(modal)modal.classList.add('hidden')};
  window.saveRegieReportEdit=async function(){
    const entryId=byId('regieEditId').value;
    const item={date:byId('regieEditDate').value,customer:byId('regieEditCustomer').value.trim(),start:byId('regieEditStart').value,end:byId('regieEditEnd').value,activity:byId('regieEditActivity').value.trim(),materialUsed:byId('regieEditMaterialUsed').checked,material:byId('regieEditMaterial').value.trim(),jobStatus:byId('regieEditJobStatus').value};
    if(!entryId||!item.date||!item.customer||!item.start||!item.end||!item.activity){setMessage('regieEditStatus','Bitte alle Pflichtfelder ausfüllen.','error');return}
    try{
      setMessage('regieEditStatus','Änderungen werden gespeichert ...','info');
      await window.api(chefPayload({action:'updateRegieReport',entryId:entryId,item:item}));
      setMessage('regieEditStatus','✓ Änderungen erfolgreich gespeichert.','ok');
      window.closeRegieReportEdit();
      await window.loadRegieReports(window.__regieStatus||'Abgeschlossen');
      setMessage('regieStatus','✓ Regiebericht wurde aktualisiert.','ok');
    }catch(e){setMessage('regieEditStatus',e.message,'error')}
  };

  const originalSetRegieStatus=window.setRegieObjectJobStatus;
  if(typeof originalSetRegieStatus==='function'){
    window.setRegieObjectJobStatus=async function(objectIds,jobStatus){
      if(typeof setMessage==='function')setMessage('regieStatus','Status wird geändert ...','info');
      return originalSetRegieStatus(objectIds,jobStatus);
    };
  }
  const originalMarkBilled=window.markRegieObjectBilled;
  if(typeof originalMarkBilled==='function'){
    window.markRegieObjectBilled=async function(objectIds){
      if(typeof setMessage==='function')setMessage('regieStatus','Regieberichte werden als abgerechnet gespeichert ...','info');
      return originalMarkBilled(objectIds);
    };
  }

  addStyles();addUi();setVersion();
})();
