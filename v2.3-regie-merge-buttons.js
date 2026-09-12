(function(){
'use strict';
if(window.__DG_V23_REGIE_MERGE__)return;window.__DG_V23_REGIE_MERGE__=true;
const $=id=>document.getElementById(id);
function css(){if($('dgv23MergeCss'))return;const s=document.createElement('style');s.id='dgv23MergeCss';s.textContent=`
.dgv23-merge-btn{background:#166534!important;color:#fff!important}
.dgv23-merge-btn:disabled{opacity:.45!important;cursor:not-allowed!important}
.dgv23-merge-toolbar{margin:10px 0 12px}
.dgv23-merge-toolbar .dgv23-merge-btn{width:100%}
`;document.head.appendChild(s)}
function selectedIds(){const ids=[];document.querySelectorAll('.regie-merge-select:checked').forEach(el=>{String(el.dataset.objectIds||'').split(',').filter(Boolean).forEach(id=>{if(!ids.includes(id))ids.push(id)})});return ids}
function runMerge(){const ids=selectedIds();if(ids.length<2){alert('Bitte mindestens zwei Aufträge bzw. Regieberichte markieren.');return}if(typeof window.requestMergeSelectedRegieReports==='function')window.requestMergeSelectedRegieReports()}
function update(){const ready=selectedIds().length>=2;document.querySelectorAll('.dgv23-merge-btn').forEach(b=>b.disabled=!ready)}
function decorateBox(id,isRunning){const box=$(id);if(!box)return;box.querySelectorAll('.dgv142-direct-merge,.dgv142-merge-top').forEach(x=>x.remove());const cards=[...box.children].filter(x=>x.classList&&x.classList.contains('report-card'));cards.forEach(card=>{const cb=card.querySelector('.regie-merge-select');if(cb&&!cb.dataset.dgv23){cb.dataset.dgv23='1';cb.addEventListener('change',update)}if(!cb)return;if(!card.querySelector('.dgv23-card-merge')){const host=card.querySelector('.report-actions')||card;const b=document.createElement('button');b.type='button';b.className='btn success dgv23-merge-btn dgv23-card-merge';b.textContent='Ausgewählte zusammenführen';b.addEventListener('click',e=>{e.preventDefault();e.stopPropagation();runMerge()});host.appendChild(b)}});if(isRunning&&cards.length&&!box.querySelector('.dgv23-merge-toolbar')){const t=document.createElement('div');t.className='dgv23-merge-toolbar';t.innerHTML='<button type="button" class="btn success dgv23-merge-btn">Ausgewählte zusammenführen</button>';t.firstChild.addEventListener('click',e=>{e.preventDefault();runMerge()});box.insertBefore(t,box.firstChild)}update()}
function apply(){css();decorateBox('dgv13RunningList',true);decorateBox('regieResult',false);update()}
apply();window.addEventListener('DOMContentLoaded',apply);window.addEventListener('load',apply);[100,300,700,1200,2200].forEach(ms=>setTimeout(apply,ms));const mo=new MutationObserver(()=>{clearTimeout(window.__dgv23m);window.__dgv23m=setTimeout(apply,60)});mo.observe(document.documentElement,{childList:true,subtree:true});
})();