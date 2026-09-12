(function(){
'use strict';
if(window.__DG_V17_ADMIN_CONTAINER__)return;window.__DG_V17_ADMIN_CONTAINER__=true;
const $=id=>document.getElementById(id);
let activeKey='';
function titleOf(card){if(!card)return'';const h=card.querySelector(':scope > .dg48-head h2,:scope > h2');return h?String(h.textContent||'').trim():''}
function allCards(){return [...document.querySelectorAll('#bossView .card')]}
function findByTitle(test){return allCards().find(c=>test(titleOf(c)))||null}
function getItems(){return [
 {key:'employee',label:'Mitarbeiterverwaltung',card:findByTitle(t=>t==='Mitarbeiterverwaltung'||t.startsWith('Mitarbeiterverwaltung ·'))},
 {key:'absence',label:'Urlaub / Abwesenheiten / Feiertage',card:$('dg48AbsenceGroup')||findByTitle(t=>t==='Urlaub / Abwesenheiten / Feiertage')},
 {key:'reports',label:'Mitarbeiterberichte',card:$('dg48EmployeeClosures')||findByTitle(t=>t==='Mitarbeiterberichte'||t==='Mitarbeiterabschlüsse')}
].filter(x=>x.card)}
function directBody(card){return card?[...card.children].find(x=>x.classList&&x.classList.contains('dg48-body'))||null:null}
function directHead(card){return card?[...card.children].find(x=>x.classList&&x.classList.contains('dg48-head'))||null:null}
function setOpen(card,open){if(!card)return;card.classList.add('dgv142-navchild');card.classList.toggle('dgv142-active',open);card.style.setProperty('display',open?'block':'none','important');const body=directBody(card);if(body)body.classList.toggle('hidden',!open);const tog=directHead(card)?.querySelector('.dg48-toggle');if(tog)tog.textContent=open?'−':'+';const details=[...card.children].find(x=>x.tagName==='DETAILS');if(details)details.open=open}
function openKey(key){const items=getItems();activeKey=key;items.forEach(x=>setOpen(x.card,x.key===key));const chosen=items.find(x=>x.key===key);if(chosen&&chosen.key==='reports'&&typeof window.loadBossDayClosuresV48==='function')setTimeout(()=>window.loadBossDayClosuresV48(),30)}
function rebuild(){const group=$('dgv142AdminGroup');if(!group)return;const body=directBody(group);if(!body)return;let menu=body.querySelector('.dgv142-submenu');if(!menu)return;let host=body.querySelector('.dgv17-admin-content');if(!host){host=document.createElement('div');host.className='dgv17-admin-content';host.style.marginTop='10px';menu.insertAdjacentElement('afterend',host)}const items=getItems();items.forEach(x=>{if(x.card.parentElement!==host)host.appendChild(x.card)});if(!activeKey){const current=items.find(x=>x.card.classList.contains('dgv142-active')&&x.card.style.display!=='none');if(current)activeKey=current.key}items.forEach(x=>setOpen(x.card,x.key===activeKey));
 if(menu.dataset.dgv17Ready!=='1'){
   const fresh=menu.cloneNode(false);fresh.className=menu.className;menu.replaceWith(fresh);menu=fresh;menu.dataset.dgv17Ready='1';items.forEach(x=>{const b=document.createElement('button');b.type='button';b.dataset.dgv17Key=x.key;b.textContent=x.label;menu.appendChild(b)});menu.addEventListener('click',e=>{const b=e.target.closest('button[data-dgv17-key]');if(!b)return;e.preventDefault();e.stopPropagation();openKey(b.dataset.dgv17Key)});
 }else{
   const have=[...menu.querySelectorAll('button[data-dgv17-key]')].map(b=>b.dataset.dgv17Key).join('|');const want=items.map(x=>x.key).join('|');if(have!==want){menu.innerHTML='';items.forEach(x=>{const b=document.createElement('button');b.type='button';b.dataset.dgv17Key=x.key;b.textContent=x.label;menu.appendChild(b)})}
 }
}
[150,350,700,1200,2000,3200].forEach(ms=>setTimeout(rebuild,ms));window.addEventListener('load',()=>setTimeout(rebuild,250));const mo=new MutationObserver(()=>{clearTimeout(window.__dgv17t);window.__dgv17t=setTimeout(rebuild,70)});mo.observe(document.documentElement,{childList:true,subtree:true});setInterval(()=>{const b=$('bossView');if(b&&!b.classList.contains('hidden'))rebuild()},1200);
})();