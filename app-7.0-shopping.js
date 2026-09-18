/* DG Zeiterfassung 7.1 - Einkaufsliste + Angebotskachel-Navigation */
(function(){
'use strict';

const STORE='dg71_shopping_lists_v1';
const q=id=>document.getElementById(id);
const esc70=v=>String(v==null?'':v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let shopRecognition=null;
let shopMode='new';
let shopEditId='';

function uid70(){return 'SHOP-'+Date.now()+'-'+Math.random().toString(36).slice(2,10);}
function today70(){const d=new Date();return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');}
function fmtDate70(v){
  if(typeof window.formatDateDE==='function'){try{return window.formatDateDE(v);}catch(_e){}}
  const p=String(v||'').split('-');return p.length===3?p[2]+'.'+p[1]+'.'+p[0]:String(v||'');
}
function read70(){
  try{
    const rows=JSON.parse(localStorage.getItem(STORE)||'[]');
    return Array.isArray(rows)?rows:[];
  }catch(_e){return [];}
}
function write70(rows){
  try{localStorage.setItem(STORE,JSON.stringify(rows));}
  catch(_e){alert('Einkaufslisten konnten auf diesem Gerät nicht gespeichert werden.');return false;}
  updateTile70();
  return true;
}
function cleanLine70(v){return String(v||'').trim().replace(/^[-–—•*]+\s*/,'').trim();}
function lines70(text){
  return String(text||'').split(/\r?\n/).map(cleanLine70).filter(Boolean).slice(0,200);
}
function lineText70(items){
  const a=(items||[]).map(x=>cleanLine70(typeof x==='string'?x:x.text)).filter(Boolean);
  return a.length?a.map(x=>'- '+x).join('\n'):'- ';
}
function normalizeTextarea70(el){
  if(!el)return;
  const arr=lines70(el.value);
  el.value=arr.length?arr.map(x=>'- '+x).join('\n'):'- ';
}
function dueClass70(date){
  const d=String(date||'');
  if(!d)return '';
  const t=today70();
  if(d<t)return ' overdue';
  if(d===t)return ' today';
  return '';
}

function css70(){
  if(q('dg70ShoppingCss'))return;
  const s=document.createElement('style');s.id='dg70ShoppingCss';
  s.textContent=`
    .d3-tile.shopping{background:#e0f2fe!important;color:#075985!important}
    .d3-tile.shopping strong,.d3-tile.shopping span{color:#075985!important}
    .dg70-shop-overlay{position:fixed;inset:0;z-index:10000;background:rgba(15,23,42,.58);display:flex;align-items:center;justify-content:center;padding:18px}
    .dg70-shop-window{width:min(980px,96vw);max-height:92vh;overflow:auto;background:#fff;border-radius:18px;box-shadow:0 24px 70px rgba(0,0,0,.28);padding:20px}
    .dg70-shop-head{display:flex;align-items:center;gap:12px;justify-content:space-between;margin-bottom:14px}
    .dg70-shop-head h2{margin:0}
    .dg70-shop-close{border:0;background:#e5e7eb;border-radius:10px;font-size:24px;font-weight:900;width:42px;height:42px;cursor:pointer}
    .dg70-shop-toolbar{display:flex;gap:10px;flex-wrap:wrap;margin:10px 0 16px}
    .dg70-shop-list{display:grid;gap:12px}
    .dg70-shop-card{border:1px solid #d8dee8;border-radius:15px;padding:15px;background:#fff}
    .dg70-shop-card:nth-child(even){background:#f8fafc}
    .dg70-shop-card-head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;flex-wrap:wrap}
    .dg70-shop-customer{font-size:18px;font-weight:900;color:#111827}
    .dg70-shop-date{display:inline-flex;align-items:center;padding:7px 10px;border-radius:10px;background:#dbeafe;color:#1e3a8a;font-weight:900}
    .dg70-shop-date.today{background:#ffedd5;color:#9a3412}
    .dg70-shop-date.overdue{background:#fee2e2;color:#991b1b}
    .dg70-shop-items{display:grid;gap:7px;margin:13px 0}
    .dg70-shop-item{display:grid;grid-template-columns:minmax(0,1fr) auto;align-items:center;gap:10px;padding:8px 10px;border-radius:10px;background:#f8fafc;border:1px solid #e5e7eb}
    .dg70-shop-item-text{font-weight:700;white-space:pre-wrap;overflow-wrap:anywhere}
    .dg70-shop-remove{border:0;border-radius:9px;background:#b91c1c;color:#fff;font-weight:900;padding:8px 11px;cursor:pointer}
    .dg70-shop-actions{display:flex;gap:9px;flex-wrap:wrap;margin-top:10px}
    .dg70-shop-actions .btn{width:auto!important;margin:0!important}
    .dg70-shop-empty{padding:18px;border:1px dashed #cbd5e1;border-radius:13px;color:#64748b;text-align:center;font-weight:700}
    .dg70-shop-form{display:grid;gap:10px}
    .dg70-shop-form label{font-weight:900}
    .dg70-shop-form input,.dg70-shop-form textarea{width:100%;box-sizing:border-box}
    .dg70-shop-form textarea{min-height:190px;resize:vertical;font-size:17px;line-height:1.55}
    .dg70-shop-speech{display:flex;gap:9px;flex-wrap:wrap}
    .dg70-shop-speech .btn{width:auto!important;margin:0!important}
    .dg70-shop-speech .listening{background:#b91c1c!important;color:#fff!important}
    .dg70-shop-status{min-height:18px;font-size:13px;font-weight:800}
    @media(max-width:650px){
      .dg70-shop-overlay{padding:7px}.dg70-shop-window{padding:14px;border-radius:14px;max-height:96vh}
      .dg70-shop-item{grid-template-columns:1fr}.dg70-shop-remove{width:100%}
      .dg70-shop-actions{display:grid;grid-template-columns:1fr 1fr}.dg70-shop-actions .btn{width:100%!important}
    }
  `;
  document.head.appendChild(s);
}

function ensureOffersTile70(){
  const tile=document.querySelector('#bossView .d3-dashboard .d3-tile.offers');
  if(!tile)return;
  const label=tile.querySelector('span');if(label)label.textContent='Angebote zu erstellen';
  tile.dataset.d3Fn='d3TileOpen';
  tile.dataset.d3Args=JSON.stringify(['d3Offers','d3OfferCreate']);
}

function ensureShoppingTile70(){
  const dash=document.querySelector('#bossView .d3-dashboard');if(!dash)return null;
  let tile=dash.querySelector('.d3-tile.shopping');
  if(!tile){
    tile=document.createElement('button');
    tile.type='button';
    tile.className='d3-tile shopping';
    tile.dataset.d3Fn='dg70ShoppingOpen';
    tile.dataset.d3Args='[]';
    tile.innerHTML='<span>Einkauf</span><strong id="d3Count-shopping">0</strong>';
    const offers=dash.querySelector('.d3-tile.offers');
    if(offers)offers.insertAdjacentElement('afterend',tile);else dash.appendChild(tile);
  }
  return tile;
}
function updateTile70(){
  ensureOffersTile70();
  ensureShoppingTile70();
  const c=q('d3Count-shopping');if(c)c.textContent=String(read70().length);
}

function stopSpeech70(){
  if(shopRecognition){try{shopRecognition.stop();}catch(_e){}shopRecognition=null;}
}
function speechCtor70(){return window.SpeechRecognition||window.webkitSpeechRecognition||null;}
function setSpeechState70(on,msg){
  const b=q('dg70ShopMic'),st=q('dg70ShopSpeechStatus');
  if(b){b.classList.toggle('listening',!!on);b.textContent=on?'⏹ Aufnahme stoppen':'🎤 Sprache zu Text';}
  if(st)st.textContent=msg||'';
}
window.dg70ShopSpeech=function(){
  const C=speechCtor70(),ta=q('dg70ShopText');
  if(!ta)return;
  if(shopRecognition){stopSpeech70();setSpeechState70(false,'Aufnahme beendet.');return;}
  if(!C){setSpeechState70(false,'Spracheingabe wird von diesem Browser nicht unterstützt. Bitte Chrome oder Edge verwenden.');return;}
  normalizeTextarea70(ta);
  const rec=new C();shopRecognition=rec;rec.lang='de-DE';rec.continuous=true;rec.interimResults=false;rec.maxAlternatives=1;
  const processed=new Set();let lastFinal='',lastFinalAt=0;
  rec.onstart=()=>setSpeechState70(true,'Aufnahme läuft – für jeden Materialposten kurz eine Sprechpause machen.');
  rec.onresult=e=>{
    for(let i=e.resultIndex;i<e.results.length;i++){
      const result=e.results[i];if(!result||!result.isFinal)continue;
      const t=cleanLine70(result[0]&&result[0].transcript),n=String(t||'').toLowerCase().replace(/\s+/g,' ').trim(),key=String(i)+'|'+n;
      if(!n||processed.has(key))continue;processed.add(key);
      const now=Date.now();if(n===lastFinal&&now-lastFinalAt<3500)continue;lastFinal=n;lastFinalAt=now;
      const existing=lines70(ta.value),last=String(existing[existing.length-1]||'').toLowerCase().replace(/\s+/g,' ').trim();
      if(last===n)continue;
      ta.value=existing.concat([t]).map(x=>'- '+x).join('\n');
      ta.scrollTop=ta.scrollHeight;
      ta.dispatchEvent(new Event('input',{bubbles:true}));
    }
  };
  rec.onerror=e=>setSpeechState70(false,e.error==='not-allowed'?'Mikrofonzugriff wurde nicht erlaubt.':'Spracherkennung konnte nicht gestartet werden.');
  rec.onend=()=>{shopRecognition=null;setSpeechState70(false,'Spracheingabe beendet.');};
  try{rec.start();}catch(_e){shopRecognition=null;setSpeechState70(false,'Spracherkennung konnte nicht gestartet werden.');}
};

function editorHtml70(){
  const title=shopMode==='new'?'Neue Einkaufsliste':'Einkaufsliste erweitern / bearbeiten';
  return '<div class="dg70-shop-head"><h2>'+title+'</h2><button type="button" class="dg70-shop-close" data-shop-close>×</button></div>'+
    '<div class="dg70-shop-form">'+
      '<label for="dg70ShopCustomer">Kunde / Baustelle</label><input id="dg70ShopCustomer" placeholder="z. B. Müller – Badumbau Fürth">'+
      '<label for="dg70ShopDate">Material benötigt am</label><input id="dg70ShopDate" type="date">'+
      '<label for="dg70ShopText">Benötigte / fehlende Materialien</label><textarea id="dg70ShopText" placeholder="- Pressfitting 22 mm\n- 2 x Kugelhahn 1 Zoll"></textarea>'+
      '<div class="dg70-shop-speech"><button type="button" id="dg70ShopMic" class="btn primary" data-shop-speech>🎤 Sprache zu Text</button><button type="button" class="btn secondary" data-shop-normalize>Zeilen formatieren</button></div>'+
      '<div id="dg70ShopSpeechStatus" class="dg70-shop-status"></div>'+
      '<div class="dg70-shop-actions"><button type="button" class="btn success" data-shop-save>Speichern</button><button type="button" class="btn secondary" data-shop-back>Zurück zur Übersicht</button></div>'+
      '<div id="dg70ShopFormStatus" class="dg70-shop-status"></div>'+
    '</div>';
}

function renderEditor70(){
  const w=q('dg70ShopWindow');if(!w)return;
  w.innerHTML=editorHtml70();
  const rows=read70(),row=rows.find(x=>x.id===shopEditId);
  q('dg70ShopCustomer').value=row?row.customer:'';
  q('dg70ShopDate').value=row?row.needDate:today70();
  q('dg70ShopText').value=row?'- ': '- ';
  if(shopMode==='edit'&&row)q('dg70ShopText').value='- ';
  q('dg70ShopText').focus();
}

function listHtml70(){
  const rows=read70().slice().sort((a,b)=>String(a.needDate||'9999').localeCompare(String(b.needDate||'9999'))||String(a.customer||'').localeCompare(String(b.customer||''),'de'));
  const body=rows.length?rows.map(row=>{
    const items=(row.items||[]).map(item=>'<div class="dg70-shop-item"><div class="dg70-shop-item-text">- '+esc70(item.text)+'</div><button type="button" class="dg70-shop-remove" data-shop-remove="'+esc70(row.id)+'" data-item-remove="'+esc70(item.id)+'">Entfernen</button></div>').join('');
    return '<div class="dg70-shop-card">'+
      '<div class="dg70-shop-card-head"><div class="dg70-shop-customer">'+esc70(row.customer)+'</div><div class="dg70-shop-date'+dueClass70(row.needDate)+'">Benötigt: '+esc70(fmtDate70(row.needDate))+'</div></div>'+
      '<div class="dg70-shop-items">'+(items||'<div class="muted">Keine Materialien mehr auf der Liste.</div>')+'</div>'+
      '<div class="dg70-shop-actions"><button type="button" class="btn danger" data-shop-delete="'+esc70(row.id)+'">Löschen</button><button type="button" class="btn success" data-shop-add="'+esc70(row.id)+'">Hinzufügen</button></div>'+
    '</div>';
  }).join(''):'<div class="dg70-shop-empty">Noch keine Einkaufslisten vorhanden.</div>';
  return '<div class="dg70-shop-head"><h2>Einkauf</h2><button type="button" class="dg70-shop-close" data-shop-close>×</button></div>'+
    '<div class="dg70-shop-toolbar"><button type="button" class="btn success" data-shop-new>+ Neue Einkaufsliste</button></div>'+
    '<div class="dg70-shop-list">'+body+'</div>';
}

function renderOverview70(){const w=q('dg70ShopWindow');if(w)w.innerHTML=listHtml70();updateTile70();}

function openShell70(){
  css70();
  let o=q('dg70ShopOverlay');
  if(!o){
    o=document.createElement('div');o.id='dg70ShopOverlay';o.className='dg70-shop-overlay';
    o.innerHTML='<div class="dg70-shop-window" id="dg70ShopWindow" role="dialog" aria-modal="true" aria-label="Einkauf"></div>';
    document.body.appendChild(o);
    o.addEventListener('click',e=>{
      if(e.target===o){window.dg70ShoppingClose();return;}
      const t=e.target.closest('[data-shop-close],[data-shop-new],[data-shop-save],[data-shop-back],[data-shop-speech],[data-shop-normalize],[data-shop-delete],[data-shop-add],[data-shop-remove]');
      if(!t)return;
      if(t.hasAttribute('data-shop-close'))return window.dg70ShoppingClose();
      if(t.hasAttribute('data-shop-new')){shopMode='new';shopEditId='';renderEditor70();return;}
      if(t.hasAttribute('data-shop-back')){stopSpeech70();renderOverview70();return;}
      if(t.hasAttribute('data-shop-speech'))return window.dg70ShopSpeech();
      if(t.hasAttribute('data-shop-normalize')){normalizeTextarea70(q('dg70ShopText'));return;}
      if(t.hasAttribute('data-shop-save'))return saveEditor70();
      if(t.hasAttribute('data-shop-delete'))return deleteList70(t.dataset.shopDelete);
      if(t.hasAttribute('data-shop-add')){shopMode='edit';shopEditId=t.dataset.shopAdd;renderEditor70();return;}
      if(t.hasAttribute('data-shop-remove'))return removeItem70(t.dataset.shopRemove,t.dataset.itemRemove);
    });
    o.addEventListener('keydown',e=>{
      if(e.key==='Escape'){e.preventDefault();window.dg70ShoppingClose();return;}
      const ta=e.target.closest&&e.target.closest('#dg70ShopText');
      if(ta&&e.key==='Enter'&&!e.shiftKey){
        e.preventDefault();
        const start=ta.selectionStart,end=ta.selectionEnd,v=ta.value;
        ta.value=v.slice(0,start)+'\n- '+v.slice(end);
        ta.selectionStart=ta.selectionEnd=start+3;
      }
    });
    o.addEventListener('blur',e=>{if(e.target&&e.target.id==='dg70ShopText')normalizeTextarea70(e.target);},true);
  }
  o.style.display='flex';
}
window.dg70ShoppingOpen=function(){openShell70();shopMode='overview';shopEditId='';renderOverview70();};
window.dg70ShoppingClose=function(){stopSpeech70();const o=q('dg70ShopOverlay');if(o)o.style.display='none';};

function saveEditor70(){
  const customer=String(q('dg70ShopCustomer')&&q('dg70ShopCustomer').value||'').trim();
  const needDate=String(q('dg70ShopDate')&&q('dg70ShopDate').value||'').trim();
  const add=lines70(q('dg70ShopText')&&q('dg70ShopText').value||'');
  const status=q('dg70ShopFormStatus');
  if(!customer){if(status)status.textContent='Bitte Kunde / Baustelle eintragen.';return;}
  if(!needDate){if(status)status.textContent='Bitte angeben, wann das Material benötigt wird.';return;}
  if(!add.length){if(status)status.textContent='Bitte mindestens ein Material eintragen.';return;}
  const rows=read70();
  if(shopMode==='edit'&&shopEditId){
    const row=rows.find(x=>x.id===shopEditId);
    if(!row){if(status)status.textContent='Einkaufsliste wurde nicht gefunden.';return;}
    row.customer=customer;row.needDate=needDate;row.items=row.items||[];
    add.forEach(text=>row.items.push({id:uid70(),text}));
    row.updatedAt=new Date().toISOString();
  }else{
    rows.push({id:uid70(),customer,needDate,items:add.map(text=>({id:uid70(),text})),createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()});
  }
  stopSpeech70();if(write70(rows))renderOverview70();
}
function removeItem70(listId,itemId){
  const rows=read70(),row=rows.find(x=>x.id===listId);if(!row)return;
  row.items=(row.items||[]).filter(x=>x.id!==itemId);row.updatedAt=new Date().toISOString();
  if(write70(rows))renderOverview70();
}
function deleteList70(id){
  const rows=read70(),row=rows.find(x=>x.id===id);if(!row)return;
  if(!confirm('Einkaufsliste für „'+row.customer+'“ komplett löschen?'))return;
  if(write70(rows.filter(x=>x.id!==id)))renderOverview70();
}

function install70(){
  css70();ensureOffersTile70();updateTile70();
}
const oldBoss70=window.showBoss;
if(typeof oldBoss70==='function'&&!window.__dg70ShopBossWrapped){
  window.__dg70ShopBossWrapped=true;
  window.showBoss=function(){const r=oldBoss70.apply(this,arguments);setTimeout(install70,0);return r;};
}
const oldDash70=window.d3Dashboard;
if(typeof oldDash70==='function'&&!window.__dg70ShopDashWrapped){
  window.__dg70ShopDashWrapped=true;
  window.d3Dashboard=async function(){const r=await oldDash70.apply(this,arguments);install70();return r;};
}
window.addEventListener('storage',e=>{if(e.key===STORE){updateTile70();if(q('dg70ShopOverlay')&&q('dg70ShopOverlay').style.display!=='none')renderOverview70();}});
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>setTimeout(install70,0),{once:true});else setTimeout(install70,0);
})();
