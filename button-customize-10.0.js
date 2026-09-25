/* DG App 10 - personal button layout and colors */
(function(){
'use strict';
const VERSION='20260925-2020-button-customize1';
const COLORS={red:'#a33a2b',green:'#3f653d',blue:'#405fa7'};
const KEY='dg_button_custom_v1';
let drag=null,menu=null,applying=false;

function employee(){return String(localStorage.getItem('dg_employee')||'global').trim()||'global';}
function load(){try{return JSON.parse(localStorage.getItem(KEY+'_'+employee())||'{}')||{};}catch(_e){return {};}}
function save(x){try{localStorage.setItem(KEY+'_'+employee(),JSON.stringify(x));}catch(_e){}}
function cleanText(v){return String(v||'').replace(/\s+/g,' ').trim().slice(0,90);}
function parentKey(p){
  if(!p)return '';
  if(p.id)return 'id:'+p.id;
  const card=p.closest('[id]');if(card&&card.id)return 'id:'+card.id+'|'+p.tagName+'|'+[...card.querySelectorAll(':scope *')].indexOf(p);
  const cls=[...p.classList].sort().join('.');
  const h=p.closest('.card,.report-card,.d3-main,section');
  return (h&&h.id?'id:'+h.id:'path:'+cls)+'|'+p.tagName;
}
function buttonKey(b){
  return b.id?'id:'+b.id:
    b.dataset.dg10Account?'account:'+b.dataset.dg10Account:
    b.dataset.dg80Final?'tile:'+b.dataset.dg80Final:
    b.getAttribute('onclick')?'onclick:'+b.getAttribute('onclick'):
    b.name?'name:'+b.name+'|'+cleanText(b.textContent):
    'text:'+cleanText(b.textContent);
}
function eligible(b){
  if(!b||b.closest('#dgButtonColorMenu'))return false;
  if(b.classList.contains('d32-gallery-arrow')||b.classList.contains('d32-gallery-close'))return false;
  return true;
}
function paint(b,color){
  if(!color)return;
  b.dataset.dgCustomColor=color;
  b.style.setProperty('background',COLORS[color]||color,'important');
  b.style.setProperty('background-color',COLORS[color]||color,'important');
  b.style.setProperty('color','#fff','important');
  b.style.setProperty('border-color',COLORS[color]||color,'important');
}
function applyParent(p,state){
  const pk=parentKey(p),order=state.orders&&state.orders[pk];
  if(Array.isArray(order)&&order.length){
    const btns=[...p.children].filter(x=>x.tagName==='BUTTON'&&eligible(x));
    const map=new Map(btns.map(b=>[buttonKey(b),b]));
    order.forEach(k=>{const b=map.get(k);if(b)p.appendChild(b);});
  }
}
function apply(){
  if(applying)return;applying=true;
  try{
    const state=load();
    document.querySelectorAll('button').forEach(b=>{
      if(!eligible(b))return;
      const key=buttonKey(b),color=state.colors&&state.colors[key];
      if(color)paint(b,color);
      b.draggable=true;
      b.dataset.dgButtonCustomize='1';
    });
    const parents=new Set([...document.querySelectorAll('button[data-dg-button-customize="1"]')].map(b=>b.parentElement).filter(Boolean));
    parents.forEach(p=>applyParent(p,state));
  }finally{applying=false;}
}
function rememberOrder(p){
  if(!p)return;
  const state=load();state.orders=state.orders||{};
  state.orders[parentKey(p)]=[...p.children].filter(x=>x.tagName==='BUTTON'&&eligible(x)).map(buttonKey);
  save(state);
}
function closeMenu(){if(menu){menu.remove();menu=null;}}
function openMenu(b,x,y){
  closeMenu();
  menu=document.createElement('div');menu.id='dgButtonColorMenu';
  menu.style.cssText='position:fixed;z-index:999999;left:'+Math.min(x,window.innerWidth-190)+'px;top:'+Math.min(y,window.innerHeight-170)+'px;background:#fff;border:1px solid #cbd5e1;border-radius:12px;padding:8px;box-shadow:0 12px 30px rgba(0,0,0,.22);display:grid;gap:7px;min-width:175px';
  menu.innerHTML='<button type="button" data-c="red" style="background:'+COLORS.red+';color:#fff">Anzeige rot</button><button type="button" data-c="green" style="background:'+COLORS.green+';color:#fff">Anzeige grün</button><button type="button" data-c="blue" style="background:'+COLORS.blue+';color:#fff">Anzeige blau</button>';
  menu.addEventListener('click',e=>{
    const c=e.target.closest('[data-c]')?.dataset.c;if(!c)return;
    const state=load();state.colors=state.colors||{};state.colors[buttonKey(b)]=c;save(state);paint(b,c);closeMenu();
  });
  document.body.appendChild(menu);
}
document.addEventListener('dragstart',e=>{
  const b=e.target.closest('button[data-dg-button-customize="1"]');if(!b)return;
  drag=b;b.style.opacity='.55';try{e.dataTransfer.effectAllowed='move';e.dataTransfer.setData('text/plain',buttonKey(b));}catch(_e){}
});
document.addEventListener('dragover',e=>{
  if(!drag)return;
  const b=e.target.closest('button[data-dg-button-customize="1"]');
  if(!b||b===drag||b.parentElement!==drag.parentElement)return;
  e.preventDefault();const r=b.getBoundingClientRect(),after=e.clientX>r.left+r.width/2||e.clientY>r.top+r.height/2;
  b.parentElement.insertBefore(drag,after?b.nextSibling:b);
});
document.addEventListener('drop',e=>{if(!drag)return;e.preventDefault();rememberOrder(drag.parentElement);});
document.addEventListener('dragend',()=>{if(drag){drag.style.opacity='';rememberOrder(drag.parentElement);}drag=null;});
document.addEventListener('contextmenu',e=>{
  const b=e.target.closest('button[data-dg-button-customize="1"]');if(!b)return;
  e.preventDefault();e.stopPropagation();openMenu(b,e.clientX,e.clientY);
});
document.addEventListener('click',e=>{if(menu&&!e.target.closest('#dgButtonColorMenu'))closeMenu();});
const mo=new MutationObserver(()=>{clearTimeout(window.__dgButtonCustomTimer);window.__dgButtonCustomTimer=setTimeout(apply,60);});
function install(){apply();mo.observe(document.body,{subtree:true,childList:true});document.documentElement.dataset.dgButtonCustomize=VERSION;}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});else install();
})();