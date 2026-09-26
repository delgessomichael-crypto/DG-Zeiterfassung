/* DG App 10 - final employee controls: signature / no-customer / transfer */
(function(){
'use strict';

const VERSION='20260926-employee-controls-signature2';
const state=window.DGEmployeeControls=window.DGEmployeeControls||{installed:false,pad:null,version:VERSION};

function el(id){return document.getElementById(id);}
function status(text,type){
  if(typeof window.setMessage==='function'){
    try{window.setMessage('entryStatus',text,type||'info');return;}catch(_e){}
  }
  const s=el('entryStatus');if(!s)return;
  s.className='status '+(type||'info');s.textContent=text||'';
}
function showTransferConfirmation(){
  const text='✅ Auftrag wurde an das Büro übertragen und ist unter „Einträge des Tages“ sichtbar.';
  status(text,'ok');
  const box=el('officeTransferConfirm');
  if(box){
    box.className='status ok dg-office-transfer-confirm';
    box.textContent=text;
  }
  const entries=el('entries');
  const card=entries&&entries.closest('.card');
  if(card){
    card.classList.remove('dg-transfer-card-flash');
    void card.offsetWidth;
    card.classList.add('dg-transfer-card-flash');
    setTimeout(()=>card.classList.remove('dg-transfer-card-flash'),2200);
  }
}

function installPad(){
  const wrap=el('customerSignatureWrap'),oldCanvas=el('customerSignature');
  if(!wrap||!oldCanvas)return null;

  const canvas=oldCanvas.cloneNode(false);
  canvas.id='customerSignature';
  canvas.dataset.dgFinalPad=VERSION;
  oldCanvas.replaceWith(canvas);

  let lock=wrap.querySelector('.signature-lock');
  if(!lock){
    lock=document.createElement('div');
    lock.className='signature-lock';
    wrap.appendChild(lock);
  }
  lock.textContent='Zum Unterschreiben einmal tippen';
  wrap.classList.remove('active');
  wrap.classList.add('dg-final-signature');

  const hint=wrap.nextElementSibling;
  if(hint&&hint.classList&&hint.classList.contains('signature-hint')){
    hint.textContent='Beim Scrollen bleibt das Feld gesperrt. Zum Unterschreiben einmal tippen.';
  }

  const ctx=canvas.getContext('2d');
  let drawing=false,signed=false,pointerId=null,active=false,lastTap=0,relockTimer=0;
  canvas.style.touchAction='auto';
  canvas.style.pointerEvents='none';
  canvas.style.width='100%';
  canvas.style.height='180px';

  function setActive(v){
    active=!!v;
    wrap.classList.toggle('active',active);
    canvas.style.pointerEvents=active?'auto':'none';
    canvas.style.touchAction=active?'none':'auto';
    if(hint&&hint.classList&&hint.classList.contains('signature-hint')){
      hint.textContent=active
        ?'Unterschrift aktiv – jetzt unterschreiben.'
        :'Beim Scrollen bleibt das Feld gesperrt. Zum Unterschreiben einmal tippen.';
    }
  }
  function scheduleRelock(){
    clearTimeout(relockTimer);
    relockTimer=setTimeout(()=>setActive(false),10000);
  }
  function paintConfig(){
    const ratio=window.devicePixelRatio||1;
    ctx.setTransform(ratio,0,0,ratio,0,0);
    ctx.lineWidth=2.2;ctx.lineCap='round';ctx.lineJoin='round';ctx.strokeStyle='#111827';
  }
  function resize(preserve){
    const rect=canvas.getBoundingClientRect();
    const cssW=Math.max(280,Math.round(rect.width||wrap.clientWidth||600));
    const cssH=180,ratio=window.devicePixelRatio||1;
    let snap='';
    if(preserve&&signed&&canvas.width&&canvas.height){
      try{snap=canvas.toDataURL('image/png');}catch(_e){}
    }
    canvas.width=Math.round(cssW*ratio);
    canvas.height=Math.round(cssH*ratio);
    canvas.style.height=cssH+'px';
    paintConfig();
    if(snap){
      const img=new Image();
      img.onload=()=>{paintConfig();ctx.drawImage(img,0,0,cssW,cssH);};
      img.src=snap;
    }
  }
  function point(ev){
    const r=canvas.getBoundingClientRect();
    return {x:ev.clientX-r.left,y:ev.clientY-r.top};
  }
  function begin(ev){
    if(!active||ev.isPrimary===false)return;
    ev.preventDefault();ev.stopPropagation();
    clearTimeout(relockTimer);
    drawing=true;signed=true;pointerId=ev.pointerId;
    try{canvas.setPointerCapture(pointerId);}catch(_e){}
    const p=point(ev);
    ctx.beginPath();ctx.moveTo(p.x,p.y);ctx.lineTo(p.x+.01,p.y+.01);ctx.stroke();
    if(hint&&hint.classList&&hint.classList.contains('signature-hint'))hint.textContent='Unterschrift erfasst.';
  }
  function move(ev){
    if(!drawing||!active||ev.pointerId!==pointerId)return;
    ev.preventDefault();ev.stopPropagation();
    const p=point(ev);ctx.lineTo(p.x,p.y);ctx.stroke();
  }
  function finish(ev){
    if(!drawing)return;
    if(ev.pointerId!==undefined&&pointerId!==null&&ev.pointerId!==pointerId)return;
    ev.preventDefault();ev.stopPropagation();
    drawing=false;
    try{if(pointerId!==null&&canvas.hasPointerCapture(pointerId))canvas.releasePointerCapture(pointerId);}catch(_e){}
    pointerId=null;
    scheduleRelock();
  }

  const unlock=ev=>{
    if(ev){ev.preventDefault();ev.stopPropagation();}
    lastTap=0;
    clearTimeout(relockTimer);
    setActive(true);
  };
  if(window.PointerEvent){
    lock.addEventListener('pointerup',unlock,{passive:false});
    canvas.addEventListener('pointerdown',begin,{passive:false});
    canvas.addEventListener('pointermove',move,{passive:false});
    canvas.addEventListener('pointerup',finish,{passive:false});
    canvas.addEventListener('pointercancel',finish,{passive:false});
  }else{
    lock.addEventListener('click',unlock);
    const touchPoint=ev=>{
      const p=ev.touches&&ev.touches[0]?ev.touches[0]:(ev.changedTouches&&ev.changedTouches[0]?ev.changedTouches[0]:ev);
      return {clientX:p.clientX,clientY:p.clientY,pointerId:1,isPrimary:true,preventDefault:()=>ev.preventDefault(),stopPropagation:()=>ev.stopPropagation()};
    };
    canvas.addEventListener('mousedown',ev=>begin({clientX:ev.clientX,clientY:ev.clientY,pointerId:1,isPrimary:true,preventDefault:()=>ev.preventDefault(),stopPropagation:()=>ev.stopPropagation()}),{passive:false});
    canvas.addEventListener('mousemove',ev=>move({clientX:ev.clientX,clientY:ev.clientY,pointerId:1,preventDefault:()=>ev.preventDefault(),stopPropagation:()=>ev.stopPropagation()}),{passive:false});
    window.addEventListener('mouseup',ev=>finish({pointerId:1,preventDefault:()=>ev.preventDefault(),stopPropagation:()=>ev.stopPropagation()}),{passive:false});
    canvas.addEventListener('touchstart',ev=>begin(touchPoint(ev)),{passive:false});
    canvas.addEventListener('touchmove',ev=>move(touchPoint(ev)),{passive:false});
    canvas.addEventListener('touchend',ev=>finish(touchPoint(ev)),{passive:false});
  }
  lock.addEventListener('click',ev=>{if(!active)unlock(ev);else{ev.preventDefault();ev.stopPropagation();}});

  document.addEventListener('pointerdown',ev=>{
    if(active&&!wrap.contains(ev.target))setActive(false);
  },true);
  canvas.addEventListener('contextmenu',ev=>ev.preventDefault());
  resize(false);
  setActive(false);

  let resizeTimer=0;
  window.addEventListener('resize',()=>{
    clearTimeout(resizeTimer);
    resizeTimer=setTimeout(()=>resize(true),180);
  },{passive:true});

  const pad={
    resize(){resize(true);},
    lock(){setActive(false);},
    clear(){
      clearTimeout(relockTimer);
      drawing=false;pointerId=null;
      ctx.clearRect(0,0,canvas.width,canvas.height);
      signed=false;setActive(false);
    },
    hasSignature(){return signed;},
    dataUrl(){return signed?canvas.toDataURL('image/png'):'';}
  };
  state.pad=pad;
  try{customerPad=pad;}catch(_e){window.customerPad=pad;}
  return pad;
}
function replaceButton(id,handler){
  const old=el(id);if(!old)return null;
  const btn=old.cloneNode(true);
  btn.removeAttribute('onclick');
  btn.type='button';
  old.replaceWith(btn);
  btn.addEventListener('click',function(ev){
    ev.preventDefault();ev.stopPropagation();
    handler(ev);
  });
  return btn;
}

function clearSignature(){
  const pad=state.pad||installPad();
  if(pad)pad.clear();
  status('Unterschrift gelöscht. Die Unterschrift ist für die Übertragung optional.','info');
}
async function transfer(){
  const pad=state.pad||installPad();
  const btn=el('transferToOfficeBtn');
  if(btn){btn.disabled=true;btn.dataset.oldText=btn.textContent;btn.textContent='Wird an Büro übertragen …';}
  const before=el('entryStatus')?String(el('entryStatus').textContent||''):'';
  try{
    if(typeof window.saveEntry!=='function')throw new Error('Übertragungsfunktion wurde nicht geladen.');
    await window.saveEntry();
    const s=el('entryStatus');
    const failed=!!(s&&(s.classList.contains('error')||/^❌/.test(String(s.textContent||'').trim())));
    if(!failed){
      showTransferConfirmation();
    }
  }catch(e){
    status('❌ Auftrag konnte nicht übertragen werden: '+(e&&e.message?e.message:'Unbekannter Fehler.'),'error');
  }finally{
    if(btn){btn.disabled=false;btn.textContent=btn.dataset.oldText||'An Büro übertragen';delete btn.dataset.oldText;}
  }
}

function install(){
  if(state.installed)return;
  const wrap=el('customerSignatureWrap');
  if(!wrap)return;
  state.installed=true;
  installPad();

  replaceButton('clearCustomerSignatureBtn',clearSignature);
  replaceButton('transferToOfficeBtn',transfer);

  const confirm=el('officeTransferConfirm');
  if(confirm){confirm.className='hidden';confirm.textContent='';}
  window.dgFinalClearCustomerSignature=clearSignature;
  window.dgFinalTransferToOffice=transfer;
}

if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});
else setTimeout(install,0);
})();
