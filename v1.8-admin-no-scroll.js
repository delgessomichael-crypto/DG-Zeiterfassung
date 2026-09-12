(function(){
'use strict';
if(window.__DG_V18_ADMIN_NO_SCROLL__)return;window.__DG_V18_ADMIN_NO_SCROLL__=true;
const $=id=>document.getElementById(id);
function titleOf(card){if(!card)return'';const h=card.querySelector(':scope > .dg48-head h2,:scope > h2');return h?String(h.textContent||'').trim():''}
function getItems(){const all=[...document.querySelectorAll('#bossView .card')];const byTitle=test=>all.find(c=>test(titleOf(c)))||null;return [
 {key:'employee',card:byTitle(t=>t==='Mitarbeiterverwaltung'||t.startsWith('Mitarbeiterverwaltung ·'))},
 {key:'absence',card:$('dg48AbsenceGroup')||byTitle(t=>t==='Urlaub / Abwesenheiten / Feiertage')},
 {key:'reports',card:$('dg48EmployeeClosures')||byTitle(t=>t==='Mitarbeiterberichte'||t==='Mitarbeiterabschlüsse')}
].filter(x=>x.card)}
function bodyOf(card){return card?[...card.children].find(x=>x.classList&&x.classList.contains('dg48-body'))||null:null}
function headOf(card){return card?[...card.children].find(x=>x.classList&&x.classList.contains('dg48-head'))||null:null}
function setOpen(card,open){if(!card)return;card.classList.add('dgv142-navchild');card.classList.toggle('dgv142-active',open);card.style.setProperty('display',open?'block':'none','important');const body=bodyOf(card);if(body)body.classList.toggle('hidden',!open);const tog=headOf(card)?.querySelector('.dg48-toggle');if(tog)tog.textContent=open?'−':'+';const details=[...card.children].find(x=>x.tagName==='DETAILS');if(details)details.open=open}
function keyForButton(btn){const k=btn.dataset.dgv17Key||btn.dataset.dgv16Key||'';if(k)return k;const t=String(btn.textContent||'');if(t.includes('Mitarbeiterverwaltung'))return'employee';if(t.includes('Urlaub'))return'absence';if(t.includes('Mitarbeiterberichte')||t.includes('Mitarbeiterabschlüsse'))return'reports';return''}
function stabilize(anchorTop,menu){const keep=()=>{const now=menu.getBoundingClientRect().top;const delta=now-anchorTop;if(Math.abs(delta)>0.5)window.scrollBy(0,delta)};keep();requestAnimationFrame(()=>{keep();requestAnimationFrame(keep)});setTimeout(keep,20);setTimeout(keep,60);setTimeout(keep,120)}
function bind(){const group=$('dgv142AdminGroup');if(!group)return;const menu=group.querySelector('.dgv142-submenu');if(!menu||menu.dataset.dgv18Bound==='1')return;menu.dataset.dgv18Bound='1';menu.addEventListener('pointerdown',e=>{const b=e.target.closest('button');if(b)e.preventDefault()},true);menu.addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;const key=keyForButton(b);if(!key)return;const anchorTop=menu.getBoundingClientRect().top;e.preventDefault();e.stopImmediatePropagation();const items=getItems();items.forEach(x=>setOpen(x.card,x.key===key));b.blur();if(key==='reports'&&typeof window.loadBossDayClosuresV48==='function')setTimeout(()=>window.loadBossDayClosuresV48(),30);stabilize(anchorTop,menu)},true)}
[100,250,500,900,1500,2500].forEach(ms=>setTimeout(bind,ms));window.addEventListener('load',()=>setTimeout(bind,200));const mo=new MutationObserver(()=>{clearTimeout(window.__dgv18t);window.__dgv18t=setTimeout(bind,50)});mo.observe(document.documentElement,{childList:true,subtree:true});
})();