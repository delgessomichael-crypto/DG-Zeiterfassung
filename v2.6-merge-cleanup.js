(function(){
'use strict';
if(window.__DG_V26_MERGE_CLEANUP__)return;window.__DG_V26_MERGE_CLEANUP__=true;
const $=id=>document.getElementById(id);
function css(){if($('dgv26MergeCss'))return;const s=document.createElement('style');s.id='dgv26MergeCss';s.textContent=`
.dgv25-merge-top,.dgv25-merge-btn{display:none!important}
.dgv142-direct-merge{display:inline-block!important;background:#166534!important;color:#fff!important;margin-top:8px!important}
.dgv142-merge-top{display:block!important;margin:8px 0 12px!important}
.dgv142-merge-top .btn{background:#166534!important;color:#fff!important;width:100%!important}
`;document.head.appendChild(s)}
function doMerge(e){if(e){e.preventDefault();e.stopPropagation()}const selected=[...document.querySelectorAll('.regie-merge-select:checked')];const ids=[];selected.forEach(el=>String(el.dataset.objectIds||'').split(',').filter(Boolean).forEach(id=>{if(!ids.includes(id))ids.push(id)}));if(ids.length<2){alert('Bitte mindestens zwei Aufträge bzw. Regieberichte markieren.');return}if(typeof window.requestMergeSelectedRegieReports==='function'){window.requestMergeSelectedRegieReports();return}alert('Zusammenführen-Funktion ist derzeit nicht verfügbar.')}
function ensureCardButtons(root){if(!root)return;root.querySelectorAll('.report-card').forEach(card=>{const cb=card.querySelector('.regie-merge-select');if(!cb)return;let actions=card.querySelector('.report-actions');if(!actions){actions=document.createElement('div');actions.className='report-actions';card.appendChild(actions)}let b=card.querySelector('.dgv142-direct-merge');if(!b){b=document.createElement('button');b.type='button';b.className='btn success dgv142-direct-merge';actions.appendChild(b)}else if(b.parentElement!==actions){actions.appendChild(b)}b.textContent='Ausgewählte zusammenführen';b.classList.remove('danger');b.classList.add('success');b.onclick=doMerge})}
function ensureRunningTop(){const box=$('dgv13RunningList');if(!box)return;let top=box.querySelector('.dgv142-merge-top');if(!top){top=document.createElement('div');top.className='dgv142-merge-top';const b=document.createElement('button');b.type='button';b.className='btn success';top.appendChild(b);box.insertBefore(top,box.firstChild)}const b=top.querySelector('button');if(b){b.textContent='Ausgewählte zusammenführen';b.onclick=doMerge}}
function apply(){css();ensureCardButtons($('regieResult'));ensureCardButtons($('dgv13RunningList'));ensureRunningTop()}
apply();window.addEventListener('DOMContentLoaded',apply);window.addEventListener('load',apply);[100,300,600,1000,1600,2400,3500].forEach(ms=>setTimeout(apply,ms));const mo=new MutationObserver(()=>{clearTimeout(window.__dgv26m);window.__dgv26m=setTimeout(apply,60)});mo.observe(document.documentElement,{childList:true,subtree:true});setInterval(()=>{const boss=$('bossView');if(boss&&!boss.classList.contains('hidden'))apply()},1200);
})();