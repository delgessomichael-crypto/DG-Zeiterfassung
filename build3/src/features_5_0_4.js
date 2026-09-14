/* DG 5.0.4: Wartungsvertrag - Ausführungsort aus Kundendaten übernehmen. */
(function(){
'use strict';
const V504='5.0.4';

function f504(root,key){return root?root.querySelector('[data-d37="'+key+'"]'):null;}
function norm504(v){return String(v==null?'':v).trim().toLocaleLowerCase('de-DE');}
function same504(a,b){return norm504(a)===norm504(b);}
function summary504(form){
  const name=f504(form,'customerName')?.value||'';
  const street=f504(form,'billingStreet')?.value||'';
  const zip=f504(form,'billingZip')?.value||'';
  const city=f504(form,'billingCity')?.value||'';
  return [name,street,[zip,city].filter(Boolean).join(' ')].filter(Boolean).join(' · ')||'Daten werden aus Punkt 1 übernommen.';
}
function copy504(form,obj){
  if(!form||!obj)return;
  [['customerName','objectName'],['billingStreet','street'],['billingZip','zip'],['billingCity','city']].forEach(([src,dst])=>{
    const a=f504(form,src),b=f504(obj,dst);if(a&&b)b.value=a.value||'';
  });
  const s=obj.querySelector('.d504-address-summary');if(s)s.textContent=summary504(form);
}
function setMode504(form,obj,checked){
  const cb=obj.querySelector('.d504-address-check');if(cb)cb.checked=!!checked;
  ['objectName','street','zip','city'].forEach(key=>{
    const input=f504(obj,key),box=input&&input.parentElement;if(box)box.classList.toggle('hidden',!!checked);
  });
  const s=obj.querySelector('.d504-address-summary');if(s)s.classList.toggle('hidden',!checked);
  if(checked)copy504(form,obj);
}
function infer504(modelCustomer,o,index){
  if(o&&typeof o._sameAsBilling==='boolean')return o._sameAsBilling;
  const blank=!String(o?.name||'').trim()&&!String(o?.street||'').trim()&&!String(o?.zip||'').trim()&&!String(o?.city||'').trim();
  if(blank)return index===0&&!String(modelCustomer?.id||'').trim();
  return same504(o?.name,modelCustomer?.name)&&same504(o?.street,modelCustomer?.billingStreet)&&same504(o?.zip,modelCustomer?.billingZip)&&same504(o?.city,modelCustomer?.billingCity);
}
function relabel504(form,key,text){
  const input=f504(form,key);if(!input)return;
  const label=input.previousElementSibling;if(label&&label.tagName==='LABEL')label.textContent=text;
}
function enhance504(hostId,modelCustomer){
  const host=$(hostId),form=host&&host.querySelector('.d37-customer-form');if(!form)return;

  /* Punkt 1 bewusst kurz halten. */
  relabel504(form,'billingStreet','Straße / Hausnummer');
  relabel504(form,'billingZip','PLZ');
  relabel504(form,'billingCity','Ort');

  [...form.querySelectorAll('.d37-object')].forEach((obj,index)=>{
    let row=obj.querySelector('.d504-address-toggle');
    if(!row){
      row=document.createElement('div');row.className='d504-address-toggle';
      row.innerHTML='<label class="d504-address-label"><input type="checkbox" class="d504-address-check" style="width:auto"> <strong>Ausführungsort entspricht Kundendaten</strong></label><div class="d504-address-summary status ok hidden"></div>';
      const head=obj.querySelector('.d37-subhead');if(head)head.insertAdjacentElement('afterend',row);else obj.prepend(row);
      row.querySelector('.d504-address-check').addEventListener('change',ev=>setMode504(form,obj,ev.target.checked));
    }
    const om=(modelCustomer&&Array.isArray(modelCustomer.objects))?modelCustomer.objects[index]:null;
    setMode504(form,obj,infer504(modelCustomer||{},om,index));
  });

  /* Ändert sich Punkt 1, werden angehakte Ausführungsorte live mitgeführt. */
  ['customerName','billingStreet','billingZip','billingCity'].forEach(key=>{
    const input=f504(form,key);if(!input||input.dataset.d504Bound==='1')return;
    input.dataset.d504Bound='1';input.addEventListener('input',()=>{
      form.querySelectorAll('.d37-object').forEach(obj=>{if(obj.querySelector('.d504-address-check')?.checked)copy504(form,obj);});
    });
  });
}

const render504=window.d37RenderCustomerForm;
if(typeof render504==='function')window.d37RenderCustomerForm=d37RenderCustomerForm=function(hostId,model,mode){
  const r=render504.apply(this,arguments);setTimeout(()=>enhance504(hostId,model),0);return r;
};

/* Vor dem Sammeln versteckte Felder mit Punkt 1 synchronisieren. */
const collect504=window.d37CollectCustomer;
if(typeof collect504==='function')window.d37CollectCustomer=d37CollectCustomer=function(validate,root){
  root=root||document.querySelector('#d37MaintenanceManage:not(.hidden) .d37-customer-form')||document.querySelector('#d37MaintenanceCreate:not(.hidden) .d37-customer-form')||document.querySelector('.d37-customer-form');
  if(root)root.querySelectorAll('.d37-object').forEach(obj=>{if(obj.querySelector('.d504-address-check')?.checked)copy504(root,obj);});
  const c=collect504.call(this,validate,root);
  if(c&&root){[...root.querySelectorAll('.d37-object')].forEach((obj,i)=>{if(c.objects&&c.objects[i])c.objects[i]._sameAsBilling=!!obj.querySelector('.d504-address-check')?.checked;});}
  return c;
};

try{DG3.version=V504;window.DG_APP_VERSION=V504;}catch(_e){}
})();
