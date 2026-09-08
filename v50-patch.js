(function(){
  'use strict';
  if(window.__DG_V50_PATCH__) return;
  window.__DG_V50_PATCH__=true;

  function el(id){return document.getElementById(id)}
  function h(v){return String(v==null?'':v).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]})}
  function norm(v){return String(v==null?'':v).toLocaleLowerCase('de-DE').replace(/\s+/g,' ').trim()}

  function addStyles(){
    if(el('dgV50Styles'))return;
    const s=document.createElement('style');s.id='dgV50Styles';s.textContent=`
      .dg50-search{margin:12px 0 14px;padding:12px;border:1px solid #d1d5db;border-radius:14px;background:#f9fafb}
      .dg50-search-row{display:grid;grid-template-columns:1fr auto;gap:8px;align-items:end}
      .dg50-search-row .btn{white-space:nowrap}
      .dg50-results{margin-top:10px}.dg50-section{margin-top:12px}.dg50-section h3{margin:0 0 8px;color:var(--brand)}
      .dg50-hit{border:1px solid #e5e7eb;border-radius:12px;padding:11px;margin-top:8px;background:#fff}
      .dg50-hit.running{border-left:6px solid #b91c1c}.dg50-hit.open{border-left:6px solid #166534}
      .dg50-hit-title{font-weight:800}.dg50-hit-meta{font-size:13px;color:var(--muted);margin-top:4px}
      .dg50-warning-list{margin:10px 0 0;padding:0;list-style:none}.dg50-warning-list li{padding:10px;border:1px solid #fed7aa;background:#fff7ed;border-radius:10px;margin-top:8px}
      .dg50-modal{position:fixed;inset:0;z-index:10120;background:rgba(0,0,0,.48);display:flex;align-items:center;justify-content:center;padding:18px}.dg50-modal.hidden{display:none!important}
      .dg50-modal-card{background:#fff;border-radius:18px;width:min(100%,680px);max-height:90vh;overflow:auto;padding:22px;box-shadow:0 18px 60px rgba(0,0,0,.3)}
      .dg50-modal-actions{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:18px}
      @media(max-width:700px){.dg50-search-row,.dg50-modal-actions{grid-template-columns:1fr}}
    `;document.head.appendChild(s);
  }

  function findRegieBody(){
    const root=el('bossView');if(!root)return null;
    const cards=Array.from(root.querySelectorAll(':scope > .card'));
    const card=cards.find(function(c){const x=c.querySelector('.dg48-head h2,:scope > h2');return x&&x.textContent.trim()==='Regieberichte'});
    if(!card)return null;
    return card.querySelector('.dg48-body')||card;
  }

  function addSearch(){
    if(el('dg50RegieSearch'))return;
    const body=findRegieBody();if(!body)return;
    const box=document.createElement('div');box.className='dg50-search';box.id='dg50RegieSearch';
    box.innerHTML='<label for="dg50SearchInput" style="margin-top:0">Kunde / Adresse / Suchbegriff</label><div class="dg50-search-row"><input id="dg50SearchInput" type="search" placeholder="z. B. Kollat, Nürnberg, Steineck ..." autocomplete="off"><button type="button" class="btn primary" onclick="dg50RunSearch()">Suchen</button></div><div class="muted small" style="margin-top:6px">Durchsucht gleichzeitig laufende Aufträge und offene Regieberichte – unabhängig vom aktuell gewählten Reiter.</div><div id="dg50SearchStatus"></div><div id="dg50SearchResults" class="dg50-results"></div>';
    const firstControls=body.querySelector('.admin-grid,.button-row');
    if(firstControls)body.insertBefore(box,firstControls);else body.prepend(box);
    let timer=null;el('dg50SearchInput').addEventListener('input',function(){clearTimeout(timer);const q=this.value.trim();if(!q){el('dg50SearchResults').innerHTML='';if(typeof clearMessage==='function')clearMessage('dg50SearchStatus');return}timer=setTimeout(function(){window.dg50RunSearch()},320)});
  }

  function groupText(g){
    const reports=g.reports||[];
    return [g.customer,g.firstDate,g.lastDate,(g.employees||[]).join(' '),reports.map(function(r){return [r.employee,r.customer,r.activity,r.material,r.date].join(' ')}).join(' ')].join(' ');
  }

  window.dg50RunSearch=async function(){
    const input=el('dg50SearchInput'),out=el('dg50SearchResults');if(!input||!out)return;
    const q=norm(input.value);if(q.length<2){out.innerHTML='';setMessage('dg50SearchStatus','Bitte mindestens 2 Zeichen eingeben.','warn');return}
    if(!navigator.onLine){setMessage('dg50SearchStatus','Suche benötigt Internet.','warn');return}
    try{
      setMessage('dg50SearchStatus','Aufträge werden durchsucht ...','info');
      let groups=await api(chefPayload({action:'getRegieReports',status:'Offen',year:0,month:0}));
      if(typeof mergeRegieGroups==='function')groups=mergeRegieGroups(groups||[]);
      const hits=(groups||[]).filter(function(g){return norm(groupText(g)).includes(q)});
      const running=hits.filter(function(g){return (g.jobStatus||'Abgeschlossen')==='Laufend'});
      const open=hits.filter(function(g){return (g.jobStatus||'Abgeschlossen')!=='Laufend'});
      function render(g,kind){
        const reports=g.reports||[],activities=Array.from(new Set(reports.map(function(r){return String(r.activity||'').trim()}).filter(Boolean))).slice(0,3);
        return '<div class="dg50-hit '+kind+'"><div class="dg50-hit-title">'+h(g.customer||'Objekt')+'</div><div class="dg50-hit-meta">'+h(formatDateDE(g.firstDate||''))+(g.lastDate&&g.lastDate!==g.firstDate?' bis '+h(formatDateDE(g.lastDate)):'')+' · '+Number(g.reportCount||reports.length||0)+' Bericht(e) · '+h(formatHours(g.totalHours||0))+' Std.</div>'+(activities.length?'<div class="dg50-hit-meta">'+activities.map(h).join(' · ')+'</div>':'')+'</div>';
      }
      let html='';
      html+='<div class="dg50-section"><h3>🔴 Laufende Aufträge ('+running.length+')</h3>'+(running.map(function(g){return render(g,'running')}).join('')||'<div class="muted">Keine laufenden Treffer.</div>')+'</div>';
      html+='<div class="dg50-section"><h3>🟢 Offene Regieberichte ('+open.length+')</h3>'+(open.map(function(g){return render(g,'open')}).join('')||'<div class="muted">Keine offenen Treffer.</div>')+'</div>';
      out.innerHTML=html;setMessage('dg50SearchStatus',hits.length+' passende Objekt(e) gefunden.','ok');
    }catch(e){out.innerHTML='';setMessage('dg50SearchStatus',e.message,'error')}
  };

  function addRiskModal(){
    if(el('dg50BillingModal'))return;
    const m=document.createElement('div');m.id='dg50BillingModal';m.className='dg50-modal hidden';
    m.innerHTML='<div class="dg50-modal-card"><h2 style="margin-top:0;color:#b45309">⚠ Vor Abrechnung prüfen</h2><div id="dg50BillingText"></div><ul id="dg50BillingList" class="dg50-warning-list"></ul><div class="status warn" style="margin-top:12px">Es kann sich um einen anderen Auftrag, eine andere Wohnung oder Adresse desselben Kunden handeln. Deshalb wird nicht automatisch zusammengeführt.</div><div class="dg50-modal-actions"><button type="button" class="btn secondary" onclick="dg50CancelBilling()">Abbrechen / prüfen</button><button type="button" class="btn danger" onclick="dg50ForceBilling()">Trotzdem diesen Auftrag abrechnen</button></div></div>';
    document.body.appendChild(m);
  }

  let pendingBillingIds=[];
  window.dg50CancelBilling=function(){pendingBillingIds=[];el('dg50BillingModal').classList.add('hidden')};
  async function executeBilling(ids,force){
    try{
      setMessage('regieStatus','Abrechnung wird gespeichert ...','info');let count=0;
      for(const objectId of ids){const r=await api(chefPayload({action:'markRegieObjectBilled',objectId:objectId,force:Boolean(force)}));count+=Number(r.count||0)}
      setMessage('regieStatus','✅ '+count+' Bericht(e) des Objekts als abgerechnet markiert.','ok');await loadRegieReports('Abgeschlossen');
    }catch(e){setMessage('regieStatus',e.message,'error')}
  }
  window.dg50ForceBilling=async function(){const ids=pendingBillingIds.slice();window.dg50CancelBilling();if(ids.length)await executeBilling(ids,true)};

  const originalBilling=window.markRegieObjectBilled;
  window.markRegieObjectBilled=async function(objectIds){
    const ids=String(objectIds||'').split(',').map(function(x){return x.trim()}).filter(Boolean);
    if(!ids.length){setMessage('regieStatus','Objekt-ID fehlt. Bitte Regieberichte neu laden.','error');return}
    try{
      setMessage('regieStatus','Vor Abrechnung werden weitere offene/laufende Aufträge geprüft ...','info');
      const risk=await api(chefPayload({action:'checkRegieBillingRisk',objectIds:ids}));
      const matches=(risk&&risk.matches)||[];
      if(matches.length){
        pendingBillingIds=ids.slice();
        el('dg50BillingText').innerHTML='<strong>Zu diesem Kunden wurden '+matches.length+' weitere offene oder laufende Vorgänge gefunden.</strong><br>Bitte prüfen, ob etwas vergessen wurde zusammenzuführen.';
        el('dg50BillingList').innerHTML=matches.map(function(x){return '<li><strong>'+(x.jobStatus==='Laufend'?'🔴 Laufender Auftrag':'🟢 Offener Regiebericht')+'</strong><br>'+h(x.customer||'Objekt')+'<div class="muted small">'+h(formatDateDE(x.firstDate||''))+(x.lastDate&&x.lastDate!==x.firstDate?' bis '+h(formatDateDE(x.lastDate)):'')+' · '+Number(x.reportCount||0)+' Bericht(e)</div></li>'}).join('');
        el('dg50BillingModal').classList.remove('hidden');setMessage('regieStatus','⚠ Weitere Vorgänge dieses Kunden gefunden. Bitte Hinweis prüfen.','warn');return;
      }
      if(!confirm('Keine weiteren passenden offenen/laufenden Vorgänge gefunden. Diesen Auftrag wirklich als abgerechnet markieren?'))return;
      await executeBilling(ids,false);
    }catch(e){setMessage('regieStatus','Prüfung vor Abrechnung nicht möglich: '+e.message,'error')}
  };

  addStyles();addSearch();addRiskModal();
  document.title='DG Zeiterfassung v50';
  const lv=document.querySelector('.login-card .center.muted.small');if(lv)lv.textContent='Version 50';
  const hv=document.querySelector('.hero .head-row strong');if(hv)hv.textContent='Zeiterfassung · v50';
})();
