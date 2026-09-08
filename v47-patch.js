(function(){
  'use strict';
  if(window.__DG_V47_PATCH__) return;
  window.__DG_V47_PATCH__=true;

  function el(id){ return document.getElementById(id); }
  function text(v){ return String(v==null?'':v); }
  function escapeHtml(v){
    return text(v).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];});
  }

  function addStyles(){
    if(el('dgV47Styles')) return;
    var s=document.createElement('style');
    s.id='dgV47Styles';
    s.textContent=`
      .dg-collapse-head{display:flex;align-items:center;justify-content:space-between;gap:12px;cursor:pointer;user-select:none;margin:-4px 0 0;padding:4px 0 10px;border-bottom:1px solid #e5e7eb}
      .dg-collapse-head h2{margin:0;color:var(--brand)}
      .dg-collapse-toggle{border:0;border-radius:10px;background:#e5e7eb;color:#111827;font-weight:900;font-size:22px;line-height:1;width:44px;height:40px;flex:0 0 44px}
      .dg-collapse-body{padding-top:10px}
      .dg-collapse-body.hidden{display:none!important}
      .dg-subcard{box-shadow:none!important;border:1px solid #e5e7eb!important;margin:10px 0!important;border-radius:14px!important}
      .dg-day-employee{border:1px solid #e5e7eb;border-radius:14px;padding:12px;margin-top:10px}
      .dg-day-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(230px,1fr));gap:10px;margin-top:10px}
      .dg-day-item{border-radius:12px;padding:11px;border:1px solid #d1d5db;background:#fff}
      .dg-day-item.closed{border-left:6px solid #16a34a}.dg-day-item.open{border-left:6px solid #dc2626}
      .dg-day-status{font-weight:800;margin-bottom:5px}.dg-day-status.closed{color:#166534}.dg-day-status.open{color:#991b1b}
      .dg-day-item .btn{width:100%;margin-top:8px}
      .boss-compact-row button[data-dg-actions]{background:var(--brand)!important;color:#fff!important}
      @media(max-width:700px){.dg-day-grid{grid-template-columns:1fr}.dg-collapse-head h2{font-size:19px}}
    `;
    document.head.appendChild(s);
  }

  function makeCollapsible(card,title,open){
    if(!card || card.dataset.dgCollapsible==='1') return card;
    card.dataset.dgCollapsible='1';
    var oldH=card.querySelector(':scope > h2');
    var head=document.createElement('div');
    head.className='dg-collapse-head';
    head.innerHTML='<h2>'+escapeHtml(title || (oldH?oldH.textContent:''))+'</h2><button type="button" class="dg-collapse-toggle" aria-label="Bereich auf- oder zuklappen">'+(open?'−':'+')+'</button>';
    var body=document.createElement('div');
    body.className='dg-collapse-body'+(open?'':' hidden');
    Array.from(card.childNodes).forEach(function(n){ if(n!==oldH) body.appendChild(n); });
    if(oldH) oldH.remove();
    card.appendChild(head);card.appendChild(body);
    function toggle(){
      var nowOpen=body.classList.contains('hidden');
      body.classList.toggle('hidden',!nowOpen);
      head.querySelector('.dg-collapse-toggle').textContent=nowOpen?'−':'+';
      card.dataset.dgOpen=nowOpen?'1':'0';
      if(nowOpen && card.id==='dgDayClosuresCard' && !el('dgDayClosureResult').dataset.loaded){ window.loadBossDayClosures(); }
    }
    head.addEventListener('click',function(e){ if(e.target.closest('button') || e.target===head || e.target.closest('h2')) toggle(); });
    card.dataset.dgOpen=open?'1':'0';
    return card;
  }

  function findCardByHeading(root,heading){
    return Array.from(root.querySelectorAll(':scope > .card')).find(function(card){
      var h=card.querySelector(':scope > h2'); return h && h.textContent.trim()===heading;
    });
  }

  function createDayClosuresCard(){
    var card=document.createElement('div');
    card.className='card';card.id='dgDayClosuresCard';
    card.innerHTML='<h2>Tagesabschlüsse aller Mitarbeiter</h2><div class="muted small">Grün = vollständig übertragen/abgeschlossen. Rot = noch offen. Offene Arbeitstage können vom Büro manuell abgeschlossen werden.</div><div class="grid2"><div><label>Jahr</label><input id="dgDayClosureYear" type="number"></div><div><label>Monat</label><select id="dgDayClosureMonth"></select></div></div><button type="button" class="btn primary" style="width:100%;margin-top:10px" onclick="loadBossDayClosures()">Tagesabschlüsse laden</button><div id="dgDayClosureStatus"></div><div id="dgDayClosureResult"></div>';
    return card;
  }

  function initDayInputs(){
    var now=new Date();
    var y=el('dgDayClosureYear'),m=el('dgDayClosureMonth');
    if(!y||!m)return;
    y.value=(el('bossYear')&&el('bossYear').value)||now.getFullYear();
    if(!m.options.length){
      var names=['Januar','Februar','März','April','Mai','Juni','Juli','August','September','Oktober','November','Dezember'];
      names.forEach(function(n,i){var o=document.createElement('option');o.value=String(i+1);o.textContent=n;m.appendChild(o);});
    }
    m.value=(el('bossMonth')&&el('bossMonth').value)||String(now.getMonth()+1);
  }

  function initBossLayout(){
    var root=el('bossView'); if(!root || root.dataset.dgV47Layout==='1') return;
    root.dataset.dgV47Layout='1';
    var regie=findCardByHeading(root,'Regieberichte');
    var month=findCardByHeading(root,'Monatsübersicht aller Mitarbeiter');
    var employee=findCardByHeading(root,'Mitarbeiterverwaltung');
    var absence=findCardByHeading(root,'Urlaub / Krankheit / Abwesenheiten eintragen');
    var vacation=findCardByHeading(root,'Urlaubskonto');
    var holiday=findCardByHeading(root,'Feiertage Bayern / Nürnberg');

    if(regie) makeCollapsible(regie,'Regieberichte',true);
    if(month) makeCollapsible(month,'Monatsübersicht aller Mitarbeiter',false);

    if(month && !el('dgDayClosuresCard')){
      var day=createDayClosuresCard();
      month.insertAdjacentElement('afterend',day);
      makeCollapsible(day,'Tagesabschlüsse aller Mitarbeiter',false);
      initDayInputs();
    }

    if(employee) makeCollapsible(employee,'Mitarbeiterverwaltung · Punkte 1–9',false);

    if((absence||vacation||holiday) && !el('dgAbsenceGroup')){
      var group=document.createElement('div');group.className='card';group.id='dgAbsenceGroup';group.innerHTML='<h2>Urlaub / Abwesenheiten / Feiertage</h2>';
      var body=document.createElement('div');
      [absence,vacation,holiday].forEach(function(card){if(card){card.classList.add('dg-subcard');body.appendChild(card);}});
      group.appendChild(body);
      if(employee) employee.insertAdjacentElement('afterend',group); else root.appendChild(group);
      makeCollapsible(group,'Urlaub / Abwesenheiten / Feiertage',false);
    }
  }

  function enhanceActionButtons(){
    document.querySelectorAll('.boss-compact-row button').forEach(function(btn){
      if((btn.textContent||'').trim()==='Aktionen'){
        btn.type='button';btn.classList.remove('secondary');btn.classList.add('primary');btn.dataset.dgActions='1';
      }
    });
  }

  if(typeof window.renderBossCompact==='function'){
    var originalRenderBossCompact=window.renderBossCompact;
    window.renderBossCompact=function(){var r=originalRenderBossCompact.apply(this,arguments);enhanceActionButtons();return r;};
  }

  window.openBossActions=function(i){
    try{
      bossDetailIndex=i;bossDetailTab='overview';renderBossActions();
      var target=el('bossResult');if(target) target.scrollIntoView({behavior:'smooth',block:'start'});
    }catch(e){
      if(typeof setMessage==='function') setMessage('bossStatus','Aktionen konnten nicht geöffnet werden: '+(e.message||e),'error');
    }
  };

  window.loadBossDayClosures=async function(){
    if(!navigator.onLine){if(typeof setMessage==='function')setMessage('dgDayClosureStatus','Tagesabschlüsse benötigen Internet.','warn');return;}
    var y=Number(el('dgDayClosureYear').value),m=Number(el('dgDayClosureMonth').value);
    if(!(y>0&&m>=1&&m<=12)){setMessage('dgDayClosureStatus','Bitte Jahr und Monat auswählen.','error');return;}
    try{
      setMessage('dgDayClosureStatus','Tagesabschlüsse werden geladen ...','info');
      var rows=await api(chefPayload({action:'getBossDayClosures',year:y,month:m}));
      renderBossDayClosures(rows||[]);el('dgDayClosureResult').dataset.loaded='1';
      setMessage('dgDayClosureStatus','✓ Tagesabschlüsse geladen.','ok');
    }catch(e){setMessage('dgDayClosureStatus',e.message,'error');}
  };

  window.renderBossDayClosures=function(rows){
    var root=el('dgDayClosureResult');if(!root)return;
    if(!rows.length){root.innerHTML='<div class="status info">Für diesen Monat sind keine Arbeitstage vorhanden.</div>';return;}
    root.innerHTML=rows.map(function(emp){
      var days=(emp.days||[]).map(function(d){
        var closed=!!d.closed;
        return '<div class="dg-day-item '+(closed?'closed':'open')+'"><div class="dg-day-status '+(closed?'closed':'open')+'">'+(closed?'🟢 Vollständig übertragen':'🔴 Noch nicht abgeschlossen')+'</div><strong>'+escapeHtml(typeof formatDateDE==='function'?formatDateDE(d.date):d.date)+'</strong><div class="muted small">'+escapeHtml(typeof formatHours==='function'?formatHours(d.hours):d.hours)+' Std. · '+Number(d.entryCount||0)+' Eintrag/Einträge</div>'+(closed?'':'<button type="button" class="btn danger" data-employee="'+escapeHtml(emp.employee)+'" data-date="'+escapeHtml(d.date)+'" onclick="manualCloseBossDayUi(this.dataset.employee,this.dataset.date)">Tag manuell abschließen</button>')+'</div>';
      }).join('');
      return '<div class="dg-day-employee"><strong>'+escapeHtml(emp.employee)+'</strong>'+(emp.active===false?' <span class="muted small">(inaktiv)</span>':'')+'<div class="dg-day-grid">'+days+'</div></div>';
    }).join('');
  };

  window.manualCloseBossDayUi=async function(employee,date){
    if(!confirm('Tag '+(typeof formatDateDE==='function'?formatDateDE(date):date)+' für '+employee+' wirklich manuell abschließen?')) return;
    try{
      setMessage('dgDayClosureStatus','Tag wird manuell abgeschlossen ...','info');
      var r=await api(chefPayload({action:'manualCloseBossDay',targetEmployee:employee,date:date}));
      setMessage('dgDayClosureStatus',r&&r.alreadyClosed?'Tag war bereits abgeschlossen.':'✓ Tag wurde manuell abgeschlossen.','ok');
      await window.loadBossDayClosures();
      if(typeof loadBossMonth==='function' && window.__bossMonthRows) await loadBossMonth();
    }catch(e){setMessage('dgDayClosureStatus',e.message,'error');}
  };

  if(typeof window.saveTimeBankManualUi==='function'){
    var originalSaveTimeBankManualUi=window.saveTimeBankManualUi;
    window.saveTimeBankManualUi=async function(){
      var r=await originalSaveTimeBankManualUi.apply(this,arguments);
      try{if(window.__bossMonthRows && typeof loadBossMonth==='function') await loadBossMonth();}catch(_e){}
      return r;
    };
  }

  addStyles();
  initBossLayout();
  enhanceActionButtons();
  document.title='DG Zeiterfassung v47';
  var version=document.querySelector('.login-card .center.muted.small');if(version)version.textContent='Version 47';
  var hero=document.querySelector('.hero .head-row strong');if(hero)hero.textContent='Zeiterfassung · v47';
})();
