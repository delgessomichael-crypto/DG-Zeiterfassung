(function(){
'use strict';
if(window.__DG_V21_REMOVE_DAYSTATUS__)return;window.__DG_V21_REMOVE_DAYSTATUS__=true;
function removeDayStatus(){const view=document.getElementById('employeeView');if(!view)return;[...view.children].forEach(card=>{if(!card.classList||!card.classList.contains('card'))return;const h=card.querySelector(':scope > h2,:scope > .dg48-head h2');if(h&&String(h.textContent||'').trim()==='Tagesstatus')card.remove()})}
removeDayStatus();
window.addEventListener('DOMContentLoaded',removeDayStatus);
window.addEventListener('load',removeDayStatus);
[100,300,700,1200,2200].forEach(ms=>setTimeout(removeDayStatus,ms));
const mo=new MutationObserver(()=>{clearTimeout(window.__dgV21DayStatus);window.__dgV21DayStatus=setTimeout(removeDayStatus,50)});mo.observe(document.documentElement,{childList:true,subtree:true});
})();