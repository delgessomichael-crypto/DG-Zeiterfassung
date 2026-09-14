/* DG 5.0.5: ausgeführte Wartungen ohne bestehenden Wartungsvertrag manuell mitzählen. */
(function(){
'use strict';
const V505='5.0.5';
function ensureManualMaintenanceButton505(){
  const top=$('d39MaintenanceTop');if(!top)return;
  const stats=[...top.querySelectorAll('.d39-stat')];if(stats.length<2||stats[1].querySelector('.d505-manual-maint'))return;
  const b=document.createElement('button');b.type='button';b.className='btn secondary d505-manual-maint';b.textContent='+ manuell erfassen';b.onclick=()=>d505AddManualMaintenance();stats[1].appendChild(b);
}
window.d505AddManualMaintenance=function(){
  const today=typeof localDate==='function'?localDate():new Date().toISOString().slice(0,10);
  d3Form('Ausgeführte Wartungen manuell erfassen',[
    {name:'date',label:'Datum',type:'date',required:true},
    {name:'count',label:'Anzahl ausgeführter Wartungen',type:'number',required:true},
    {name:'note',label:'Vermerk (optional)',type:'textarea'}
  ],{date:today,count:'1',note:''},async v=>{
    const n=Math.floor(Number(v.count)||0);if(n<1||n>99)throw new Error('Bitte eine Anzahl zwischen 1 und 99 eintragen.');
    await api(chefPayload({action:'addManualMaintenanceCount',date:v.date,count:n,note:String(v.note||'').trim()}));
    if(window.DG38){DG38.loaded=false;DG38.overview=null;}
    if(window.DG37)DG37.overview=null;
    if(typeof window.d38RefreshMaintenance==='function')await window.d38RefreshMaintenance();
    else if(typeof window.d37LoadMaintenanceOverview==='function')await window.d37LoadMaintenanceOverview();
    ensureManualMaintenanceButton505();
  });
  const count=$('d3Field-count');if(count){count.min='1';count.max='99';count.step='1';}
  return false;
};

/* Button nach allen Stellen ergänzen, an denen die Jahresampeln neu aufgebaut werden. */
const load505=window.d37LoadMaintenanceOverview;
if(typeof load505==='function')window.d37LoadMaintenanceOverview=async function(){const r=await load505.apply(this,arguments);setTimeout(ensureManualMaintenanceButton505,0);return r;};
const openMain505=window.openMain;
if(typeof openMain505==='function')window.openMain=function(){const r=openMain505.apply(this,arguments);setTimeout(ensureManualMaintenanceButton505,300);return r;};
const open505=window.d3Open;
if(typeof open505==='function')window.d3Open=function(){const r=open505.apply(this,arguments);setTimeout(ensureManualMaintenanceButton505,50);return r;};

/* 5.0.5 benötigt für die dauerhafte manuelle Zählung GS 5.0.2+. */
window.d3CheckBackend=d3CheckBackend=async function(){
  try{const r=await api({action:'ping'}),found=String(r&&r.version||''),p=found.split('.').map(Number),ok=p[0]>5||(p[0]===5&&(p[1]>0||(p[1]===0&&p[2]>=2)));DG3.backend=ok?found:'';if(!ok)d3Notice('App 5.0.5 benötigt Google-GS 5.0.2 oder neuer. Gefunden: '+(found||'unbekannt')+'. Speichern ist gesperrt.','warn');else $('d3Notice')?.remove();return ok;}catch(e){DG3.backend='';d3Notice('Verbindungsprüfung fehlgeschlagen: '+e.message,'warn');return false;}
};
try{DG3.version=V505;window.DG_APP_VERSION=V505;}catch(_e){}
})();
