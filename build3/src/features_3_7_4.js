/* DG 3.7.1: Wartungskachel = Monatsreminder; nach Terminierung/Löschung sofort neu zählen. */
(function(){
'use strict';
async function d371RefreshMaintenanceReminder(){
  if(!canAccessBoss()||!navigator.onLine)return;
  try{
    const o=await api(chefPayload({action:'getMaintenanceOverview'}));
    if(window.DG37)DG37.overview=o||{};
    d3Count('maintenance',Number(o&&o.currentMonthOpen||0));
    const panel=$('d37MaintenanceOverview');
    const card=$('d36Maintenance');
    if(panel&&card&&!panel.classList.contains('hidden')&&!card.classList.contains('hidden')&&typeof window.d37LoadMaintenanceOverview==='function'){
      await window.d37LoadMaintenanceOverview();
    }
  }catch(_e){d3Count('maintenance','!');}
}
window.d371RefreshMaintenanceReminder=d371RefreshMaintenanceReminder;
const baseApi371=window.api;
if(typeof baseApi371==='function')window.api=api=async function(payload){
  const action=payload&&payload.action;
  const result=await baseApi371.apply(this,arguments);
  if(action==='savePlannerEvent'||action==='deletePlannerEvent')setTimeout(d371RefreshMaintenanceReminder,0);
  return result;
};
})();
