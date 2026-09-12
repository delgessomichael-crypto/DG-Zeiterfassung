(function(){
'use strict';
if(window.__DG_V62_VERSION_LOCK__)return;window.__DG_V62_VERSION_LOCK__=true;
const VERSION='62.19';
function installCss(){
  if(document.getElementById('dgVersionLockCss'))return;
  const s=document.createElement('style');
  s.id='dgVersionLockCss';
  s.textContent=`
.login-card .center.muted.small{font-size:0!important}
.login-card .center.muted.small::after{content:'Version 62.19';font-size:13px!important}
.hero .head-row strong{font-size:0!important}
.hero .head-row strong::after{content:'Zeiterfassung · v62.19';font-size:16px!important}
`;
  document.head.appendChild(s);
}
function apply(){
  installCss();
  try{document.title='DG Zeiterfassung v'+VERSION;}catch(_e){}
}
apply();
window.addEventListener('DOMContentLoaded',apply);
window.addEventListener('load',apply);
[0,25,50,100,200,350,500,700,900,1200,1500,2000,3000,5000].forEach(ms=>setTimeout(apply,ms));
setInterval(()=>{try{if(document.title!=='DG Zeiterfassung v'+VERSION)document.title='DG Zeiterfassung v'+VERSION}catch(_e){}},1000);
})();