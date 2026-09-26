/* DG App 10 - einheitliches Zusammenfuegen fuer Kundenanfragen.
   Nutzt die bestehende Railway/Postgres-Aktion mergeCustomerInquiriesV10.
   Sichtbare, bereits automatisch gruppierte Karten liefern mergedIds; beim manuellen
   Zusammenfuegen werden deshalb immer alle Ursprungs-IDs der markierten Karten gesendet. */
(function(){
'use strict';

const VERSION='20260926-1845-inquiry-merge1';
const state=window.DG10_INQUIRY_MERGE=window.DG10_INQUIRY_MERGE||{
  selected:{general:new Map(),aqon:new Map()},
  observer:null,
  timer:0,
  busy:false
};

const configs={
  general:{
    key:'general',
    rootId:'d3InquiryList',
    barId:'dg10InquiryMergeBar',
    btnId:'dg10InquiryMergeBtn',
    countId:'dg10InquiryMergeCount',
    filter:r=>String(r&&r.source||'')!=='AQON PURE',
    reload:async()=>{if(typeof window.d3Inquiries==='function')await window.d3Inquiries();}
  },
  aqon:{
    key:'aqon',
    rootId:'d34AqonList',
    barId:'dg10AqonMergeBar',
    btnId:'dg10AqonMergeBtn',
    countId:'dg10AqonMergeCount',
    filter:r=>String(r&&r.source||'')==='AQON PURE',
    reload:async()=>{if(typeof window.d34AqonInquiries==='function')await window.d34AqonInquiries();}
  }
};

function q(id){return document.getElementById(id);}
function esc(v){return String(v==null?'':v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function rowsFor(cfg){
  try{
    const all=Array.isArray(window.DG3&&window.DG3.inquiries)?window.DG3.inquiries:[];
    return all.filter(cfg.filter);
  }catch(_e){return [];}
}
function rawIds(row){
  const ids=Array.isArray(row&&row.mergedIds)?row.mergedIds:[row&&row.id];
  return [...new Set(ids.map(x=>String(x||'').trim()).filter(Boolean))];
}
function cardKey(row){
  return String(row&&row.id||rawIds(row)[0]||'').trim();
}
function selectedCardCount(cfg){return state.selected[cfg.key].size;}
function selectedRawIds(cfg){
  const out=[];
  state.selected[cfg.key].forEach(v=>{for(const id of (v.ids||[]))out.push(id);});
  return [...new Set(out)];
}
function updateBar(cfg){
  const btn=q(cfg.btnId),n=q(cfg.countId),count=selectedCardCount(cfg);
  if(btn){btn.disabled=count<2||state.busy;btn.setAttribute('aria-disabled',String(btn.disabled));}
  if(n)n.textContent=String(count);
}
function ensureCss(){
  if(q('dg10InquiryMergeCss'))return;
  const s=document.createElement('style');s.id='dg10InquiryMergeCss';
  s.textContent=''
    +'.dg10-inquiry-merge-bar{display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin:12px 0 14px;padding:10px 0}'
    +'.dg10-inquiry-merge-bar .btn{min-height:46px;font-weight:800}'
    +'.dg10-inquiry-merge-select{display:flex!important;align-items:center;gap:9px;width:max-content;max-width:100%;margin:0 0 10px 0!important;padding:7px 10px;border:1px solid #cbd5e1;border-radius:10px;background:#f8fafc;font-weight:800;cursor:pointer}'
    +'.dg10-inquiry-merge-select input{width:20px;height:20px;margin:0;flex:0 0 auto}'
    +'.dg10-inquiry-merge-select.is-selected{border-color:#86b89a;background:#e8f7ea;color:#185c2c}';
  document.head.appendChild(s);
}
function ensureBar(cfg,root){
  let bar=q(cfg.barId);
  if(!bar){
    bar=document.createElement('div');
    bar.id=cfg.barId;
    bar.className='dg10-inquiry-merge-bar';
    bar.innerHTML='<button type="button" class="btn success" id="'+cfg.btnId+'" disabled>'
      +'Ausgewählte zusammenfügen (<span id="'+cfg.countId+'">0</span>)</button>'
      +'<span class="muted small">Mindestens zwei Kundenanfragen markieren.</span>';
    if(root.parentElement)root.parentElement.insertBefore(bar,root);
    const btn=q(cfg.btnId);if(btn)btn.addEventListener('click',()=>merge(cfg));
  }
  updateBar(cfg);
}
function decorate(cfg){
  const root=q(cfg.rootId);if(!root)return;
  ensureBar(cfg,root);
  const rows=rowsFor(cfg),cards=[...root.querySelectorAll(':scope > .report-card')];
  const validKeys=new Set();

  cards.forEach((card,i)=>{
    const row=rows[i];if(!row)return;
    const key=cardKey(row),ids=rawIds(row);if(!key||!ids.length)return;
    validKeys.add(key);
    card.dataset.dgInquiryMergeKey=key;

    let lab=card.querySelector(':scope > .dg10-inquiry-merge-select');
    if(!lab){
      lab=document.createElement('label');
      lab.className='d3-selection dg10-inquiry-merge-select';
      lab.innerHTML='<input type="checkbox"> Zum Zusammenfügen markieren';
      card.insertBefore(lab,card.firstChild);
    }
    const cb=lab.querySelector('input');
    if(!cb)return;
    const chosen=state.selected[cfg.key].has(key);
    cb.checked=chosen;lab.classList.toggle('is-selected',chosen);
    cb.onchange=()=>{
      if(cb.checked){
        state.selected[cfg.key].set(key,{
          ids:ids.slice(),
          customer:String(row.customer||'Ohne Kundenname')
        });
      }else state.selected[cfg.key].delete(key);
      lab.classList.toggle('is-selected',cb.checked);
      updateBar(cfg);
    };
  });

  for(const key of [...state.selected[cfg.key].keys()]){
    if(!validKeys.has(key))state.selected[cfg.key].delete(key);
  }
  updateBar(cfg);
}
async function merge(cfg){
  const selected=[...state.selected[cfg.key].values()];
  const ids=selectedRawIds(cfg);
  if(selected.length<2||ids.length<2)return;
  const names=selected.map(x=>x.customer||'Ohne Kundenname');
  const ok=confirm(
    'Diese '+selected.length+' Kundenanfragen zusammenfügen?\n\n'
    +names.join('\n')
    +'\n\nDie Ursprungsanfragen bleiben erhalten und werden als zusammengehöriger Vorgang gruppiert.'
  );
  if(!ok)return;

  state.busy=true;updateBar(cfg);
  try{
    if(typeof window.api!=='function')throw new Error('Backend nicht bereit.');
    const payload={action:'mergeCustomerInquiriesV10',ids};
    const auth=typeof window.chefPayload==='function'?window.chefPayload(payload):payload;
    await window.api(auth);
    state.selected[cfg.key].clear();
    await cfg.reload();
    if(typeof window.d3Dashboard==='function')await window.d3Dashboard(true);
  }catch(e){
    alert('Zusammenführen fehlgeschlagen: '+(e&&e.message?e.message:String(e)));
  }finally{
    state.busy=false;
    setTimeout(()=>decorate(cfg),0);
  }
}
function decorateAll(){
  ensureCss();
  decorate(configs.general);
  decorate(configs.aqon);
}
function schedule(){
  clearTimeout(state.timer);
  state.timer=setTimeout(decorateAll,40);
}
function install(){
  decorateAll();
  if(state.observer)state.observer.disconnect();
  state.observer=new MutationObserver(schedule);
  state.observer.observe(document.body,{childList:true,subtree:true});
  document.documentElement.dataset.dgInquiryMerge=VERSION;
  window.dg10DecorateInquiryMerge=decorateAll;
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});
else setTimeout(install,0);
})();