/* DG 5.0.2: stabiles Unterschriftenfeld ohne Scroll-/Sprung beim Loslassen. */
(function(){
'use strict';
const V502='5.0.2';

/*
 * Das bisherige Pad mischte Touch- und Mausereignisse und beendete Touch nur
 * direkt auf dem Canvas. Auf Mobilgeraeten kann touchend/cancel ausserhalb des
 * Canvas landen bzw. ein synthetisches Click ausloesen. Die neue Variante
 * benutzt Pointer Events mit Pointer Capture. Waehrend einer Unterschrift
 * gehoert der aktive Pointer damit bis zum Ende dem Canvas. Kein Fokuswechsel,
 * kein synthetischer Klick und kein Browser-Scroll innerhalb des Pads.
 */
window.initPad=initPad=function(id){
  const canvas=$(id),ctx=canvas.getContext('2d'),wrap=$(id+'Wrap');
  let drawing=false,signed=false,active=false,lastTap=0,activePointer=null;
  function setActive(v){active=!!v;if(wrap)wrap.classList.toggle('active',active);canvas.style.touchAction=active?'none':'auto';}
  function resize(){
    const ratio=devicePixelRatio||1,rect=canvas.getBoundingClientRect(),old=signed?canvas.toDataURL('image/png'):'';
    canvas.width=Math.max(1,Math.round(rect.width*ratio));canvas.height=Math.round(180*ratio);
    ctx.setTransform(ratio,0,0,ratio,0,0);ctx.lineWidth=2;ctx.lineCap='round';ctx.lineJoin='round';ctx.strokeStyle='#111827';
    if(old){const img=new Image();img.onload=()=>ctx.drawImage(img,0,0,rect.width,180);img.src=old;}
  }
  function point(ev){const r=canvas.getBoundingClientRect();return{x:ev.clientX-r.left,y:ev.clientY-r.top};}
  function start(ev){
    if(!active||drawing||ev.isPrimary===false)return;
    ev.preventDefault();ev.stopPropagation();
    drawing=true;signed=true;activePointer=ev.pointerId;
    try{canvas.setPointerCapture(ev.pointerId);}catch(_e){}
    const p=point(ev);ctx.beginPath();ctx.moveTo(p.x,p.y);ctx.lineTo(p.x+.01,p.y+.01);ctx.stroke();
  }
  function move(ev){
    if(!drawing||!active||ev.pointerId!==activePointer)return;
    ev.preventDefault();ev.stopPropagation();const p=point(ev);ctx.lineTo(p.x,p.y);ctx.stroke();
  }
  function finish(ev){
    if(!drawing||ev.pointerId!==activePointer)return;
    ev.preventDefault();ev.stopPropagation();drawing=false;
    try{if(canvas.hasPointerCapture(ev.pointerId))canvas.releasePointerCapture(ev.pointerId);}catch(_e){}
    activePointer=null;
  }
  canvas.addEventListener('pointerdown',start,{passive:false});
  canvas.addEventListener('pointermove',move,{passive:false});
  canvas.addEventListener('pointerup',finish,{passive:false});
  canvas.addEventListener('pointercancel',finish,{passive:false});
  canvas.addEventListener('lostpointercapture',ev=>{if(drawing&&ev.pointerId===activePointer){drawing=false;activePointer=null;}},{passive:true});
  canvas.addEventListener('contextmenu',ev=>ev.preventDefault());
  canvas.addEventListener('dragstart',ev=>ev.preventDefault());

  if(wrap){
    const lock=wrap.querySelector('.signature-lock');
    const unlock=ev=>{ev.preventDefault();ev.stopPropagation();setActive(true);lastTap=0;};
    const tap=ev=>{
      ev.preventDefault();ev.stopPropagation();const now=Date.now();
      if(ev.type==='dblclick'||now-lastTap<550)unlock(ev);else lastTap=now;
    };
    lock.addEventListener('dblclick',unlock,{passive:false});
    lock.addEventListener('pointerup',tap,{passive:false});
  }
  resize();setActive(false);
  return{
    resize,
    lock(){drawing=false;activePointer=null;setActive(false);},
    clear(){drawing=false;activePointer=null;ctx.clearRect(0,0,canvas.getBoundingClientRect().width,180);signed=false;setActive(false);},
    hasSignature(){return signed;},
    dataUrl(){return signed?canvas.toDataURL('image/png'):'';}
  };
};

/* Doppelte/synthetische Clicks im aktiven Unterschriftenbereich abfangen. */
document.addEventListener('click',ev=>{const wrap=ev.target&&ev.target.closest?ev.target.closest('.signature-wrap.active'):null;if(wrap){ev.preventDefault();ev.stopPropagation();}},true);
try{DG3.version=V502;window.DG_APP_VERSION=V502;}catch(_e){}
})();
