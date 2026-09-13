/* Compiled into the existing planner scope, never loaded as a second script. */
let calendarMode='three',rangeStart='',followToday=true,rangeRequest=0,rangePending=null;

function calendarRange(){
  const start=calendarMode==='week'?(weekStart||monday()):(followToday?today():(rangeStart||today()));
  const count=calendarMode==='week'?6:3;
  return {mode:calendarMode,start,end:add(start,count-1),days:Array.from({length:count},(_,i)=>add(start,i)),key:calendarMode+':'+start};
}
function visibleDays(){return calendarRange().days;}
function selectCalendarRange(mode,start,live=false){
  calendarMode=mode;followToday=mode==='three'&&live;
  rangeStart=start||today();weekStart=monday(rangeStart);
  updateCalendarControls(calendarRange());
}
function updateCalendarControls(range){
  if($('dg62Date'))$('dg62Date').value=range.start;
  if($('dg62Date'))$('dg62Date').setAttribute('aria-label',range.mode==='three'?'Erster Tag der Drei-Tage-Ansicht':'Woche ausw\u00e4hlen');
  document.querySelectorAll('#dg62PlannerCard [data-calendar-view]').forEach(b=>{
    b.setAttribute('aria-pressed',String(b.dataset.calendarView===range.mode));
  });
}
function selectSavedDate(date){
  const range=calendarRange();
  if(date>=range.start&&date<=range.end)return;
  selectCalendarRange(calendarMode==='week'&&parse(date).getDay()!==0?'week':'three',date,false);
}
function renderWeek(range=calendarRange()){
  const out=$('dg62Week');if(!out)return;
  const title=range.mode==='three'?'N\u00e4chste 3 Tage':'Woche';
  $('dg62WeekTitle').textContent=title+' '+fmtShort(range.start)+' bis '+fmtShort(range.end);
  updateCalendarControls(range);
  out.replaceChildren(...range.days.map(d=>{
    const day=renderDay(d),head=day.querySelector('.dg62-dayhead');
    if(range.mode==='three'&&d===add(today(),1))head.append(' \u00b7 Morgen');
    if(range.mode==='three'&&d===add(today(),2))head.append(' \u00b7 \u00dcbermorgen');
    if(!events.some(e=>e.date===d)){
      const empty=document.createElement('div');empty.className='muted small';
      empty.textContent='Keine Termine f\u00fcr diesen Tag.';empty.style.padding='8px 12px';
      head.after(empty);
    }
    return day;
  }));
}
window.dg62Load=function(){
  const range=calendarRange(),owner=auth().employee,key=owner+'|'+range.key;
  updateCalendarControls(range);
  if(!navigator.onLine){
    ++rangeRequest;rangePending=null;
    status('dg62Status','Offline \u2013 Kalender kann nicht synchronisiert werden.','warn');
    return Promise.resolve();
  }
  if(rangePending&&rangePending.key===key)return rangePending.promise;
  const seq=++rangeRequest;
  const isCurrent=()=>seq===rangeRequest&&owner===auth().employee&&range.key===calendarRange().key;
  status('dg62Status','Kalender wird synchronisiert \u2026');
  const promise=(async()=>{
    try{
      const r=await Promise.all([
        api(chefPayload({action:'getPlannerWorkers'})),
        api(chefPayload({action:'getPlannerEvents',startDate:range.start,endDate:range.end}))
      ]);
      if(!isCurrent())return;
      workers=r[0]||[];events=r[1]||[];
      renderWorkers();renderWeek(range);
      if(DG3.enhanceCalendar)DG3.enhanceCalendar();
      lastSync=new Intl.DateTimeFormat('de-DE',{hour:'2-digit',minute:'2-digit'}).format(new Date());
      if($('dg62LastSync'))$('dg62LastSync').textContent='Zuletzt synchronisiert: '+lastSync+' Uhr';
      status('dg62Status','\u2713 Kalender synchronisiert.','ok');
    }catch(e){if(isCurrent())status('dg62Status',e&&e.message?e.message:'Kalender konnte nicht geladen werden.','error');}
    finally{if(rangePending&&rangePending.seq===seq)rangePending=null;}
  })();
  rangePending={key,seq,promise};
  return promise;
};
window.dg62OpenPlanner=function(){selectCalendarRange('three',today(),true);return dg62Load();};
window.dg62ThisWeek=function(){selectCalendarRange('week',today());return dg62Load();};
window.dg62PrevWeek=function(){selectCalendarRange('week',add(monday(calendarRange().start),-7));return dg62Load();};
window.dg62NextWeek=function(){selectCalendarRange('week',add(monday(calendarRange().start),7));return dg62Load();};
window.dg62GoWeek=function(d){
  if(!/^\d{4}-\d{2}-\d{2}$/.test(d)||iso(parse(d))!==d){updateCalendarControls(calendarRange());return;}
  selectCalendarRange(calendarMode,d,calendarMode==='three'&&d===today());return dg62Load();
};
window.dg62JumpToday=function(){return dg62OpenPlanner();};
