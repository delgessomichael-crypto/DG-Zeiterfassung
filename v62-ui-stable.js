(function(){
'use strict';
if(window.__DG_V62_UI_STABLE__)return;window.__DG_V62_UI_STABLE__=true;
const $=id=>document.getElementById(id);
function addCss(){if($('dg62UiStableCss'))return;const s=document.createElement('style');s.id='dg62UiStableCss';s.textContent=`
#dg62PlannerCard{position:relative}
#dg62PlannerCard .dg62-summary{font-size:24px!important;font-weight:700!important;line-height:1.2!important;color:var(--brand)!important;padding:4px 82px 10px 0!important;list-style:none!important}
#dg62PlannerCard .dg62-summary:before{content:none!important;display:none!important;width:0!important}
#dg62PlannerCard .dg62-summary::-webkit-details-marker{display:none!important}
#dg62PlannerCard .dg62-summary::marker{content:''}
#dg62PlannerCard .dg62-card-toggle{position:absolute;right:20px;top:20px;width:62px;height:58px;border:0;border-radius:16px;background:#e5e7eb;color:#111827;font-size:31px;font-weight:900;line-height:1;cursor:pointer;z-index:6}
#dg62PlannerCard .dg62-card-toggle:hover{background:#dbeafe}
#dg62PlannerCard .dg62-toolbar .btn{font-weight:700!important}
#dg62PlannerCard .dg62-week-nav{background:var(--brand)!important;color:#fff!important}
#dg62PlannerCard .dg62-sync-green{background:#166534!important;color:#fff!important}
#dg62PlannerCard .dg62-today-blue{background:var(--brand)!important;color:#fff!important}
#dg62Modal .dg62-cancel-red{background:#b91c1c!important;color:#fff!important}
#dg62Modal .dg62-address-help{font-size:12px;color:#6b7280;margin-top:5px}
`;document.head.appendChild(s)}
function findButton(root,needle){return [...root.querySelectorAll('button')].find(b=>String(b.textContent||'').trim().toLowerCase().includes(needle.toLowerCase()))}
function decorateCard(){const card=$('dg62PlannerCard');if(!card)return;const details=card.querySelector('.dg62-main'),summary=details&&details.querySelector('.dg62-summary');if(!details||!summary)return;
 let toggle=card.querySelector('.dg62-card-toggle');if(!toggle){toggle=document.createElement('button');toggle.type='button';toggle.className='dg62-card-toggle';toggle.title='Mitarbeiter Kalender öffnen / schließen';toggle.addEventListener('click',e=>{e.preventDefault();e.stopPropagation();details.open=!details.open;toggle.textContent=details.open?'−':'+';if(details.open&&typeof window.dg62Load==='function')window.dg62Load()});card.appendChild(toggle);details.addEventListener('toggle',()=>{toggle.textContent=details.open?'−':'+'})}toggle.textContent=details.open?'−':'+';
 ['Vorwoche','Diese Woche','Nächste Woche'].forEach(t=>{const b=findButton(card,t);if(b){b.classList.remove('secondary');b.classList.add('primary','dg62-week-nav')}});const sy=findButton(card,'Synchronisieren');if(sy){sy.classList.remove('primary','secondary');sy.classList.add('success','dg62-sync-green')}const td=findButton(card,'Heute zeigen');if(td){td.classList.remove('secondary');td.classList.add('primary','dg62-today-blue')}
}
function decorateModal(){const modal=$('dg62Modal');if(!modal)return;const cancel=findButton(modal,'Abbrechen');if(cancel){cancel.classList.remove('secondary');cancel.classList.add('danger','dg62-cancel-red')}const a=$('dg62Address');if(a&&!$('dg62AddressHelp')){const h=document.createElement('div');h.id='dg62AddressHelp';h.className='dg62-address-help';h.textContent='Adressvorschläge können nach Aktivierung der Google Places API automatisch ergänzt werden.';a.insertAdjacentElement('afterend',h)}}
function decorate(){addCss();decorateCard();decorateModal()}
const oldShowBoss=window.showBoss;if(typeof oldShowBoss==='function')window.showBoss=function(){const r=oldShowBoss.apply(this,arguments);setTimeout(decorate,180);return r};
const oldLoad=window.dg62Load;if(typeof oldLoad==='function')window.dg62Load=async function(){const r=await oldLoad.apply(this,arguments);decorate();return r};
const oldEdit=window.dg62Edit;if(typeof oldEdit==='function')window.dg62Edit=function(){const r=oldEdit.apply(this,arguments);decorateModal();return r};
const oldNew=window.dg62New;if(typeof oldNew==='function')window.dg62New=function(){const r=oldNew.apply(this,arguments);decorateModal();return r};
setTimeout(decorate,500);
})();