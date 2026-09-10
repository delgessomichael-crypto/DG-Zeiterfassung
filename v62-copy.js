(function(){
'use strict';
if(window.__DG_V62_COPY__)return;window.__DG_V62_COPY__=true;
const $=id=>document.getElementById(id);
function ensureCopyButton(){
  const modal=$('dg62Modal');if(!modal)return;
  const card=modal.querySelector('.dg62-card');if(!card||$('dg62Copy'))return;
  const del=$('dg62Del');
  const b=document.createElement('button');
  b.id='dg62Copy';b.type='button';b.className='btn primary hidden';b.style.width='100%';b.style.marginTop='8px';b.textContent='Kompletten Eintrag kopieren';
  b.onclick=window.dg62CopyCurrent;
  if(del)del.insertAdjacentElement('beforebegin',b);else card.appendChild(b);
}
window.dg62CopyCurrent=function(){
  const customer=$('dg62Customer')?$('dg62Customer').value:'';
  const address=$('dg62Address')?$('dg62Address').value:'';
  const task=$('dg62Task')?$('dg62Task').value:'';
  const start=$('dg62Start')?$('dg62Start').value:'08:00';
  const end=$('dg62End')?$('dg62End').value:'09:00';
  if(typeof window.dg62New!=='function')return;
  window.dg62New();
  if($('dg62MT'))$('dg62MT').textContent='Kopie als neuen Termin anlegen';
  if($('dg62Customer'))$('dg62Customer').value=customer;
  if($('dg62Address'))$('dg62Address').value=address;
  if($('dg62Task'))$('dg62Task').value=task;
  if($('dg62Start'))$('dg62Start').value=start;
  if($('dg62End'))$('dg62End').value=end;
  if($('dg62ED'))$('dg62ED').value='';
  document.querySelectorAll('.dg62cb').forEach(x=>x.checked=false);
  if($('dg62MS')){$('dg62MS').className='status info';$('dg62MS').textContent='Eintrag kopiert. Bitte neues Datum und gewünschten Mitarbeiter auswählen.'}
  const copy=$('dg62Copy');if(copy)copy.classList.add('hidden');
};
const oldEdit=window.dg62Edit;
if(typeof oldEdit==='function')window.dg62Edit=function(id){const r=oldEdit.apply(this,arguments);ensureCopyButton();const b=$('dg62Copy');if(b)b.classList.remove('hidden');return r};
const oldNew=window.dg62New;
if(typeof oldNew==='function')window.dg62New=function(){const r=oldNew.apply(this,arguments);ensureCopyButton();const b=$('dg62Copy');if(b)b.classList.add('hidden');return r};
ensureCopyButton();
})();