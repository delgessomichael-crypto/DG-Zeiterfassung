/* DG App 10 - clear employee day totals; pause calculation remains backend-authoritative */
(function(){
'use strict';
const $=id=>document.getElementById(id);
const fmt=v=>{
  if(typeof window.formatHours==='function')return window.formatHours(Number(v||0));
  return Number(v||0).toFixed(2).replace('.',',');
};
function paint(){
  const d=window.lastDayData;
  const el=$('dayTotal');
  if(!d||!el)return;
  const gross=Number(d.grossWorkTotal!=null?d.grossWorkTotal:
    (Array.isArray(d.entries)?d.entries.reduce((s,x)=>s+Number(x&&x.hours||0),0):d.total||0));
  const pause=Number(d.automaticPauseHours||0);
  const credited=Number(d.creditedHours||0);
  const net=Number(d.workTotal!=null?d.workTotal:Math.max(0,gross-pause));
  const total=Number(d.total!=null?d.total:net+credited);
  el.className='day-balance '+(Number(d.targetHours||0)>0&&total+0.001<Number(d.targetHours||0)?'bad':'good');
  let text='Erfasst: '+fmt(gross)+' Std. · Pause: '+fmt(pause)+' Std. · Arbeitszeit: '+fmt(net)+' Std.';
  if(credited>0)text+=' · Gutschrift: '+fmt(credited)+' Std. · Gesamt: '+fmt(total)+' Std.';
  el.textContent=text;
  el.title='Die hinterlegte automatische Pausenregel bleibt unverändert und wird in Arbeitszeit, Stundenkonto und Monatsabrechnung berücksichtigt.';
}
function install(){
  const base=window.renderDay;
  if(typeof base==='function'&&!base.__dgDayTotalClear){
    const wrapped=function(){const r=base.apply(this,arguments);paint();return r;};
    wrapped.__dgDayTotalClear=true;
    window.renderDay=wrapped;
  }
  paint();
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>setTimeout(install,0),{once:true});
else setTimeout(install,0);
})();
