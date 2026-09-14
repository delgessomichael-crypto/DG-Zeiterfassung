/* DG 5.0.3: Kunde/Baustelle eines Regieberichts im Büro gezielt korrigieren. */
(function(){
'use strict';
const V503='5.0.3';

function editModalTitle503(text){
  const h=document.querySelector('#dgRegieEditModal .dg-v45-card h2');
  if(h)h.textContent=text;
}
function selectModalTitle503(text,sub){
  const card=document.querySelector('#dgRegieSelectModal .dg-v45-card');
  if(!card)return;
  const h=card.querySelector('h2');if(h)h.textContent=text;
  const m=card.querySelector('.muted');if(m)m.textContent=sub||'';
}
function focusCustomer503(){
  const input=$('dgEditCustomer');
  if(!input)return;
  input.classList.add('dg503-customer-focus');
  input.focus();
  input.select();
  const st=$('dgEditStatus');
  if(st){st.className='status info';st.textContent='Kunde / Baustelle korrigieren und anschließend „Änderungen speichern“ drücken. Zeiten, Tätigkeit, Bilder und Unterschrift bleiben erhalten.';}
}

const baseOpenEdit503=window.dgOpenRegieEdit;
if(typeof baseOpenEdit503==='function'){
  window.dgOpenRegieEdit=function(id){
    editModalTitle503('Regiebericht bearbeiten');
    const r=baseOpenEdit503.call(this,id);
    const input=$('dgEditCustomer');if(input)input.classList.remove('dg503-customer-focus');
    return r;
  };
}

window.dgOpenCustomerCorrection=function(id){
  if(typeof baseOpenEdit503!=='function')return false;
  editModalTitle503('Kunde / Baustelle korrigieren');
  baseOpenEdit503.call(window,id);
  setTimeout(focusCustomer503,0);
  return false;
};

window.dgRequestCustomerCorrection=function(key){
  const ids=window.__dgGroupMap&&window.__dgGroupMap[key]||[];
  if(!ids.length){setMessage('regieStatus','Kein bearbeitbarer Einzelbericht gefunden.','error');return false;}
  if(ids.length===1)return window.dgOpenCustomerCorrection(ids[0]);
  const list=$('dgRegieSelectList');
  if(!list)return false;
  selectModalTitle503('Kunde / Baustelle korrigieren','Bitte den Einzelbericht auswählen, der dem falschen Kunden zugeordnet wurde.');
  list.innerHTML=ids.map(id=>{const r=window.__dgReportMap&&window.__dgReportMap[id]||{};return '<div class="dg-v45-choice"><div><strong>'+formatDateDE(r.date||'')+' · '+esc(r.employee||'')+' · '+formatHours(r.hours||0)+' Std.</strong><div class="report-meta">Aktuell: '+esc(r.customer||'')+'</div><div>'+esc(r.activity||'')+'</div></div><button class="btn primary" data-id="'+esc(id)+'">Kunde korrigieren</button></div>';}).join('');
  list.querySelectorAll('button[data-id]').forEach(b=>b.onclick=()=>{window.dgCloseRegieSelect();window.dgOpenCustomerCorrection(b.dataset.id);});
  $('dgRegieSelectModal').classList.remove('hidden');
  return false;
};

const baseGroupEdit503=window.dgRequestGroupEdit;
if(typeof baseGroupEdit503==='function')window.dgRequestGroupEdit=function(key){
  selectModalTitle503('Bericht bearbeiten','Bitte den Einzelbericht auswählen.');
  return baseGroupEdit503.call(this,key);
};

const baseReportCard503=window.d3ReportCard||window.d3ReportCard;
if(typeof baseReportCard503==='function'){
  window.d3ReportCard=d3ReportCard=function(g,view,index){
    const card=baseReportCard503.call(this,g,view,index);
    if(view!=='Abgerechnet'){
      const actions=card&&card.querySelector('.report-actions');
      if(actions&&!actions.querySelector('.dg503-correct-customer')){
        const btn=document.createElement('button');
        btn.type='button';btn.className='btn secondary dg503-correct-customer';btn.textContent='Kunde korrigieren';
        btn.addEventListener('click',()=>window.dgRequestCustomerCorrection(view+':'+index));
        actions.prepend(btn);
      }
    }
    return card;
  };
}

try{DG3.version=V503;window.DG_APP_VERSION=V503;}catch(_e){}
})();
