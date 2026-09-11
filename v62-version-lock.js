(function(){
'use strict';
if(window.__DG_V62_VERSION_LOCK__)return;window.__DG_V62_VERSION_LOCK__=true;
const VERSION='62.19';
function apply(){
  try{document.title='DG Zeiterfassung v'+VERSION;}catch(_e){}
  const lv=document.querySelector('.login-card .center.muted.small');
  if(lv&&lv.textContent!=='Version '+VERSION)lv.textContent='Version '+VERSION;
  const hv=document.querySelector('.hero .head-row strong');
  if(hv&&hv.textContent!=='Zeiterfassung · v'+VERSION)hv.textContent='Zeiterfassung · v'+VERSION;
}
apply();
[0,50,100,200,350,500,700,900,1200,1500,2000,3000,5000].forEach(ms=>setTimeout(apply,ms));
window.addEventListener('load',apply);
})();