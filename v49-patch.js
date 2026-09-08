(function(){
  'use strict';
  if(window.__DG_V49_PATCH__) return;
  window.__DG_V49_PATCH__=true;

  function el(id){return document.getElementById(id)}
  function esc(v){return String(v==null?'':v).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]})}

  function renameEmployeeReports(){
    var group=el('dg48EmployeeClosures');
    if(!group)return;
    var h=group.querySelector(':scope > .dg48-head h2');
    if(h)h.textContent='Mitarbeiterberichte';
  }

  function addStyles(){
    if(el('dgV49Styles'))return;
    var s=document.createElement('style');s.id='dgV49Styles';s.textContent=`
      .dg48-day{cursor:pointer;transition:transform .08s ease,box-shadow .08s ease}
      .dg48-day:hover{box-shadow:0 4px 14px rgba(0,0,0,.08)}
      .dg49-detail{margin-top:10px;padding-top:10px;border-top:1px solid #e5e7eb}
      .dg49-detail.hidden{display:none!important}
      .dg49-report{padding:9px 0;border-top:1px solid #e5e7eb}
      .dg49-report:first-child{border-top:0}
      .dg49-report-title{font-weight:800}
      .dg49-report-meta{font-size:13px;color:var(--muted);margin-top:3px}
      .dg49-report-activity{margin-top:5px;white-space:pre-wrap}
      .dg49-hint{font-size:12px;color:var(--muted);margin-top:7px;font-weight:700}
    `;document.head.appendChild(s);
  }

  window.toggleBossDayDetailsV49=function(key){
    var d=el('dg49Detail_'+key);if(!d)return;
    d.classList.toggle('hidden');
  };

  window.renderBossDayClosuresV48=function(rows){
    var out=el('dg48DayResult');if(!out)return;
    if(!rows.length){out.innerHTML='<div class="status info">Für diesen Monat sind keine Arbeitstage vorhanden.</div>';return;}
    out.innerHTML=rows.map(function(emp,ei){
      return '<div class="dg48-days-employee"><strong>'+esc(emp.employee)+'</strong><div class="dg48-day-grid">'+(emp.days||[]).map(function(d,di){
        var c=!!d.closed,key=ei+'_'+di;
        var reports=(d.reports||[]);
        var detail=reports.length?reports.map(function(r){
          var assignment=r.isAdditionalAssignment?' <span class="muted">· Mitarbeit'+(r.assignedBy?' von '+esc(r.assignedBy):'')+'</span>':'';
          var material=r.materialUsed&&r.material?'<div class="dg49-report-meta">Material: '+esc(r.material)+'</div>':'';
          return '<div class="dg49-report"><div class="dg49-report-title">'+esc(r.customer||'Ohne Baustellenangabe')+'</div><div class="dg49-report-meta">'+esc(r.start||'')+'–'+esc(r.end||'')+' · '+esc(formatHours(r.hours||0))+' Std.'+assignment+'</div><div class="dg49-report-activity">'+esc(r.activity||'Keine Tätigkeitsbeschreibung')+'</div>'+material+'</div>';
        }).join(''):'<div class="muted small">Keine Einzelberichte vorhanden.</div>';
        return '<div class="dg48-day '+(c?'closed':'open')+'" onclick="toggleBossDayDetailsV49(\''+key+'\')"><div class="dg48-day-state '+(c?'closed':'open')+'">'+(c?'🟢 Vollständig übertragen':'🔴 Noch nicht abgeschlossen')+'</div><strong>'+esc(formatDateDE(d.date))+'</strong><div class="muted small">'+esc(formatHours(d.hours||0))+' Std. · '+Number(d.entryCount||0)+' Eintrag/Einträge</div><div class="dg49-hint">Berichtdetails anzeigen</div><div id="dg49Detail_'+key+'" class="dg49-detail hidden">'+detail+(c?'':'<button type="button" class="btn danger" data-employee="'+esc(emp.employee)+'" data-date="'+esc(d.date)+'" onclick="event.stopPropagation();manualCloseBossDayV48(this.dataset.employee,this.dataset.date)">Tag manuell abschließen</button>')+'</div></div>';
      }).join('')+'</div></div>';
    }).join('');
  };

  addStyles();renameEmployeeReports();
  document.title='DG Zeiterfassung v49';
  var lv=document.querySelector('.login-card .center.muted.small');if(lv)lv.textContent='Version 49';
  var hv=document.querySelector('.hero .head-row strong');if(hv)hv.textContent='Zeiterfassung · v49';
})();
