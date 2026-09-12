(function(){
'use strict';
if(window.__DG_V15_SUBMENU_STABLE__)return;window.__DG_V15_SUBMENU_STABLE__=true;
function isSubmenuClick(e){const b=e.target&&e.target.closest?e.target.closest('.dgv142-submenu button'):null;if(!b)return false;const group=b.closest('#dgv142OfferGroup,#dgv142AdminGroup');return !!group}
function holdPosition(y){const restore=()=>window.scrollTo({top:y,left:0,behavior:'auto'});restore();requestAnimationFrame(()=>{restore();requestAnimationFrame(restore)});setTimeout(restore,30);setTimeout(restore,80);setTimeout(restore,160)}
document.addEventListener('pointerdown',e=>{if(!isSubmenuClick(e))return;window.__dgV15MenuScrollY=window.scrollY||window.pageYOffset||0},true);
document.addEventListener('click',e=>{if(!isSubmenuClick(e))return;const y=Number.isFinite(window.__dgV15MenuScrollY)?window.__dgV15MenuScrollY:(window.scrollY||0);holdPosition(y)},false);
})();