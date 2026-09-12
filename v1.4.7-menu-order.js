(function(){
'use strict';
if(window.__DG_V147_MENU_ORDER__)return;window.__DG_V147_MENU_ORDER__=true;
const $=id=>document.getElementById(id);
function titleOf(card){if(!card)return'';const h=card.querySelector(':scope > .dg48-head h2,:scope > h2,:scope > summary');return h?String(h.textContent||'').trim():''}
function findTop(names){const root=$('bossView');if(!root)return null;const wanted=Array.isArray(names)?names:[names];return [...root.children].find(c=>c.classList&&c.classList.contains('card')&&wanted.includes(titleOf(c)))||null}
function addCss(){if($('dgv147Css'))return;const s=document.createElement('style');s.id='dgv147Css';s.textContent=`
#bossView>.dgv147-main-even{background:#ffffff!important}
#bossView>.dgv147-main-odd{background:#edf3f8!important}
#bossView>.dgv147-main-even>.dg48-head,#bossView>.dgv147-main-odd>.dg48-head{background:transparent!important}
#bossView>.dgv147-main-even>.dg48-body,#bossView>.dgv147-main-odd>.dg48-body{background:transparent!important}
`;document.head.appendChild(s)}
function arrange(){const root=$('bossView');if(!root)return;const planner=$('dg62PlannerCard')||findTop(['Mitarbeiter Kalender','Mitarbeiterkalender']);const completed=findTop(['Abgeschlossene Aufträge','Regieberichte']);const running=$('dgv13RunningCard')||findTop('Laufende Aufträge');const inquiries=$('dgv1InquiryCard')||findTop('Offene Anfragen');const offers=$('dgv142OfferGroup')||findTop('Angebotsbereich');const reminder=$('dg62ReminderCard')||findTop('Reminder');const admin=$('dgv142AdminGroup')||findTop('Verwaltung');const health=$('dg62HealthCard')||findTop('Systemcheck');const ordered=[planner,completed,running,inquiries,offers,reminder,admin,health].filter(Boolean);ordered.forEach((card,i)=>{card.style.removeProperty('display');card.classList.remove('dgv147-main-even','dgv147-main-odd');card.classList.add(i%2===0?'dgv147-main-even':'dgv147-main-odd');root.appendChild(card)});const allowed=new Set(ordered);[...root.children].forEach(c=>{if(!c.classList||!c.classList.contains('card')||allowed.has(c)||c.classList.contains('dgv142-navchild'))return;c.classList.remove('dgv147-main-even','dgv147-main-odd')})}
addCss();
[200,500,900,1500,2500,4000].forEach(ms=>setTimeout(arrange,ms));
window.addEventListener('load',()=>setTimeout(arrange,350));
const mo=new MutationObserver(()=>{clearTimeout(window.__dgv147t);window.__dgv147t=setTimeout(arrange,80)});mo.observe(document.documentElement,{childList:true,subtree:true});
setInterval(()=>{const boss=$('bossView');if(boss&&!boss.classList.contains('hidden'))arrange()},1500);
})();