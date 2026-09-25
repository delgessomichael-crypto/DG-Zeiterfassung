/* DG App 10 - Frag DG + Referenzbaustellen */
(function(){
'use strict';

const VERSION='20260925-2055-frag-dg1';
const q=id=>document.getElementById(id);
const S=window.DG10_FRAG_DG=window.DG10_FRAG_DG||{busy:false,refs:[],observer:null,timer:null};

function esc(v){return String(v==null?'':v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function chef(){
  if(typeof window.canAccessBoss==='function')return !!window.canAccessBoss();
  return localStorage.getItem('dg_chef_access')==='1';
}
function payload(x){
  if(typeof window.chefPayload==='function')return window.chefPayload(x);
  return Object.assign({},x,{
    employee:localStorage.getItem('dg_employee')||'',
    deviceSessionToken:localStorage.getItem('dg_device_session')||''
  });
}
async function call(x){
  if(typeof window.api!=='function')throw new Error('App-Schnittstelle ist noch nicht bereit.');
  return window.api(payload(x));
}
function css(){
  if(q('fragDgCss'))return;
  const s=document.createElement('style');s.id='fragDgCss';
  s.textContent=`
    #fragDgTop{margin:0 0 12px;padding:12px;border:2px solid #405fa7;border-radius:16px;background:#f4f7ff;box-shadow:0 5px 18px rgba(64,95,167,.10)}
    .frag-dg-title{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:8px}
    .frag-dg-title strong{font-size:18px;color:#31589e}
    .frag-dg-line{display:grid;grid-template-columns:minmax(0,1fr) auto auto;gap:8px;align-items:center}
    .frag-dg-line input{margin:0!important;min-height:46px!important}
    .frag-dg-line button{min-height:46px!important;white-space:nowrap}
    #fragDgAnswer{margin-top:9px;white-space:pre-wrap;line-height:1.45}
    #fragDgAnswer:empty{display:none}
    .frag-dg-mic.listening{background:#a33a2b!important;color:#fff!important}
    .frag-dg-ref-tile{background:#eef4ff!important;color:#31589e!important;border:1px solid #bfd0f3!important}
    #fragDgReferencesPanel{margin-top:12px;padding:14px;border:1px solid #dbe3ec;border-radius:16px;background:#fff}
    .frag-dg-ref-head{display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap;margin-bottom:10px}
    .frag-dg-ref-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}
    .frag-dg-ref-files{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px;margin-top:10px}
    .frag-dg-ref-files>div{border:1px solid #dbe3ec;border-radius:12px;padding:10px;background:#f8fafc}
    .frag-dg-ref-list{display:grid;gap:10px;margin-top:14px}
    .frag-dg-ref-card{border:1px solid #dbe3ec;border-radius:14px;padding:12px;background:#fff}
    .frag-dg-ref-card-head{display:flex;justify-content:space-between;gap:10px;align-items:flex-start;flex-wrap:wrap}
    .frag-dg-ref-badge{display:inline-block;padding:4px 8px;border-radius:999px;background:#eef4ff;color:#31589e;font-size:12px;font-weight:900}
    .frag-dg-ref-card .muted{margin-top:5px}
    @media(max-width:720px){
      .frag-dg-line{grid-template-columns:minmax(0,1fr) auto}
      .frag-dg-line .frag-dg-send{grid-column:1/-1;width:100%}
      .frag-dg-ref-grid,.frag-dg-ref-files{grid-template-columns:1fr}
    }
  `;
  document.head.appendChild(s);
}

function speech(input,button){
  const SR=window.SpeechRecognition||window.webkitSpeechRecognition;
  if(!SR){button.disabled=true;button.title='Spracherkennung wird von diesem Browser nicht unterstützt.';return;}
  let rec=null;
  button.addEventListener('click',()=>{
    if(rec){try{rec.stop();}catch(_e){}return;}
    rec=new SR();rec.lang='de-DE';rec.interimResults=false;rec.continuous=false;
    button.classList.add('listening');button.textContent='■';
    rec.onresult=e=>{
      const text=Array.from(e.results||[]).map(r=>r[0]&&r[0].transcript||'').join(' ').trim();
      if(text){input.value=(input.value?input.value.trim()+' ':'')+text;input.dispatchEvent(new Event('input',{bubbles:true}));}
    };
    rec.onerror=e=>{if(e&&e.error!=='aborted')console.warn('Frag DG Sprache',e.error);};
    rec.onend=()=>{rec=null;button.classList.remove('listening');button.textContent='🎤';};
    try{rec.start();}catch(_e){rec=null;button.classList.remove('listening');button.textContent='🎤';}
  });
}

async function ask(){
  if(S.busy)return;
  const input=q('fragDgPrompt'),out=q('fragDgAnswer'),btn=q('fragDgSend');
  const prompt=String(input&&input.value||'').trim();
  if(!prompt)return;
  S.busy=true;if(btn)btn.disabled=true;
  out.className='status info';out.textContent='Frag DG arbeitet ...';
  try{
    const r=await call({action:'getAiAssistantV10',prompt});
    out.className=r&&r.configured===false?'status warn':'status ok';
    out.textContent=String(r&&r.text||'Keine Antwort erhalten.');
  }catch(e){
    out.className='status error';out.textContent=String(e&&e.message||e);
  }finally{S.busy=false;if(btn)btn.disabled=false;}
}

function ensureTop(){
  if(!chef())return;
  const boss=q('bossView');if(!boss)return;
  let box=q('fragDgTop');
  if(!box){
    box=document.createElement('div');box.id='fragDgTop';
    box.innerHTML=
      '<div class="frag-dg-title"><strong>Frag DG</strong><span class="muted small">Intelligente Unterstützung für den Büroalltag</span></div>'+
      '<div class="frag-dg-line"><input id="fragDgPrompt" type="text" placeholder="Frag DG – z. B. Was ist heute dringend?">'+
      '<button type="button" class="btn secondary frag-dg-mic" id="fragDgMic" title="Spracheingabe">🎤</button>'+
      '<button type="button" class="btn primary frag-dg-send" id="fragDgSend">Frag DG</button></div>'+
      '<div id="fragDgAnswer"></div>';
    boss.insertBefore(box,boss.firstChild);
    q('fragDgSend').addEventListener('click',ask);
    q('fragDgPrompt').addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();ask();}});
    speech(q('fragDgPrompt'),q('fragDgMic'));
  }else if(boss.firstChild!==box){
    boss.insertBefore(box,boss.firstChild);
  }
  const old=q('dg10Ai');if(old)old.remove();
}

async function dataUrl(file){
  if(!file)return '';
  if(file.size>15*1024*1024)throw new Error(file.name+' ist größer als 15 MB.');
  if(!/^image\//i.test(file.type||''))return rawDataUrl(file);
  try{
    const src=await rawDataUrl(file);
    const img=await new Promise((ok,fail)=>{const x=new Image();x.onload=()=>ok(x);x.onerror=fail;x.src=src;});
    const max=1800,scale=Math.min(1,max/Math.max(img.width,img.height));
    if(scale>=.999&&file.size<2.5*1024*1024)return src;
    const canvas=document.createElement('canvas');
    canvas.width=Math.max(1,Math.round(img.width*scale));canvas.height=Math.max(1,Math.round(img.height*scale));
    canvas.getContext('2d').drawImage(img,0,0,canvas.width,canvas.height);
    return canvas.toDataURL('image/jpeg',.82);
  }catch(_e){return rawDataUrl(file);}
}
function rawDataUrl(file){
  return new Promise((ok,fail)=>{const r=new FileReader();r.onload=()=>ok(String(r.result||''));r.onerror=()=>fail(r.error||new Error('Datei konnte nicht gelesen werden.'));r.readAsDataURL(file);});
}
async function collectFiles(){
  const out=[];
  for(const [id,phase] of [['fragRefBefore','Vorher'],['fragRefBuild','Montage'],['fragRefDone','Fertig']]){
    const input=q(id);if(!input)continue;
    for(let i=0;i<input.files.length;i++){
      const file=input.files[i];
      out.push({phase,name:file.name,type:'image/jpeg',sortOrder:i,dataUrl:await dataUrl(file)});
      if(out.length>18)throw new Error('Bitte höchstens 18 Bilder pro Speichervorgang auswählen.');
    }
  }
  return out;
}
function clearForm(){
  ['fragRefId','fragRefCustomer','fragRefLocation','fragRefProject','fragRefDevice','fragRefDescription'].forEach(id=>{const e=q(id);if(e)e.value='';});
  ['fragRefBefore','fragRefBuild','fragRefDone'].forEach(id=>{const e=q(id);if(e)e.value='';});
  if(q('fragRefApproved'))q('fragRefApproved').checked=false;
}
function refCard(r){
  const counts={Vorher:0,Montage:0,Fertig:0};
  (r.images||[]).forEach(x=>{if(Object.prototype.hasOwnProperty.call(counts,x.phase))counts[x.phase]++;});
  return '<div class="frag-dg-ref-card">'+
    '<div class="frag-dg-ref-card-head"><div><strong>'+esc(r.project||'Referenzbaustelle')+'</strong><div>'+esc(r.location||'')+(r.device?' · '+esc(r.device):'')+'</div></div><span class="frag-dg-ref-badge">'+esc(r.status||'Entwurf')+'</span></div>'+
    (r.customerInternal?'<div class="muted small">Kunde intern: '+esc(r.customerInternal)+'</div>':'')+
    (r.description?'<div style="margin-top:7px">'+esc(r.description)+'</div>':'')+
    '<div class="muted small">Bilder: Vorher '+counts.Vorher+' · Montage '+counts.Montage+' · Fertig '+counts.Fertig+'</div>'+
    '<div class="muted small">Kundenfreigabe: '+(r.customerApproved?'Ja':'Nein')+'</div>'+
    '<div class="button-row" style="margin-top:8px"><button type="button" class="btn secondary" data-frag-edit="'+esc(r.id)+'">Bearbeiten</button></div>'+
  '</div>';
}
async function loadRefs(){
  const host=q('fragRefList');if(!host)return;
  host.innerHTML='<div class="status info">Referenzbaustellen werden geladen ...</div>';
  try{
    const rows=await call({action:'getReferenceProjectsV10',limit:100});
    S.refs=Array.isArray(rows)?rows:[];
    host.innerHTML=S.refs.map(refCard).join('')||'<div class="status ok">Noch keine Referenzbaustellen gespeichert.</div>';
    const counter=q('fragDgRefCount');if(counter)counter.textContent=String(S.refs.length);
  }catch(e){host.innerHTML='<div class="status error">'+esc(e&&e.message||e)+'</div>';}
}
function editRef(id){
  const r=S.refs.find(x=>String(x.id)===String(id));if(!r)return;
  q('fragRefId').value=r.id||'';q('fragRefCustomer').value=r.customerInternal||'';q('fragRefLocation').value=r.location||'';
  q('fragRefProject').value=r.project||'';q('fragRefDevice').value=r.device||'';q('fragRefDescription').value=r.description||'';
  q('fragRefApproved').checked=!!r.customerApproved;
  q('fragRefStatus').innerHTML='<div class="status info">Eintrag geladen. Neue Bilder werden zusätzlich angehängt.</div>';
  q('fragDgReferencesPanel').scrollIntoView({behavior:'smooth',block:'start'});
}
async function saveRef(status){
  const st=q('fragRefStatus');st.innerHTML='<div class="status info">Referenzbaustelle wird gespeichert ...</div>';
  try{
    const item={
      id:q('fragRefId').value,
      customerInternal:q('fragRefCustomer').value,
      location:q('fragRefLocation').value,
      project:q('fragRefProject').value,
      device:q('fragRefDevice').value,
      description:q('fragRefDescription').value,
      customerApproved:q('fragRefApproved').checked,
      status
    };
    const files=await collectFiles();
    const r=await call({action:'saveReferenceProjectV10',item,files});
    st.innerHTML='<div class="status ok">'+(status==='Freigegeben'?'Zur Veröffentlichung freigegeben.':'Entwurf gespeichert.')+' '+Number(r&&r.imagesAdded||0)+' Bild(er) übernommen.</div>';
    clearForm();await loadRefs();
  }catch(e){st.innerHTML='<div class="status error">'+esc(e&&e.message||e)+'</div>';}
}

function panelHtml(){
  return '<div class="frag-dg-ref-head"><div><h2 style="margin:0">Referenzbaustellen · Frag DG</h2><div class="muted small">Vorher/Nachher-Projekte für Website, Google und lokale Sichtbarkeit vorbereiten.</div></div><button type="button" class="btn secondary" id="fragRefClose">Schließen</button></div>'+
    '<div class="status info">Noch keine automatische Website-Veröffentlichung: „Freigeben“ markiert das Projekt derzeit als von euch geprüft und veröffentlichungsbereit. Die direkte Website-Anbindung folgt als nächster Schritt.</div>'+
    '<input type="hidden" id="fragRefId">'+
    '<div class="frag-dg-ref-grid"><div><label>Kunde (nur intern)</label><input id="fragRefCustomer" placeholder="z. B. Müller"></div><div><label>Ort</label><input id="fragRefLocation" placeholder="z. B. Zirndorf"></div></div>'+
    '<label>Projekt</label><input id="fragRefProject" placeholder="z. B. Austausch Gasheizung gegen Wärmepumpe">'+
    '<label>Gerät / Technik</label><input id="fragRefDevice" placeholder="z. B. Vaillant aroTHERM plus">'+
    '<label>Projektbeschreibung</label><textarea id="fragRefDescription" rows="4" placeholder="Ausgangssituation, ausgeführte Arbeiten und Besonderheiten"></textarea>'+
    '<div class="frag-dg-ref-files"><div><strong>Vorher</strong><input id="fragRefBefore" type="file" accept="image/*" multiple></div><div><strong>Montage</strong><input id="fragRefBuild" type="file" accept="image/*" multiple></div><div><strong>Fertig</strong><input id="fragRefDone" type="file" accept="image/*" multiple></div></div>'+
    '<div class="check-row" style="margin-top:12px"><label><input id="fragRefApproved" type="checkbox"> Kundenfreigabe zur Veröffentlichung liegt vor</label></div>'+
    '<div class="button-row"><button type="button" class="btn secondary" id="fragRefDraft">Als Entwurf speichern</button><button type="button" class="btn success" id="fragRefApprove">Zur Veröffentlichung freigeben</button></div>'+
    '<div id="fragRefStatus"></div><h3 style="margin-top:20px">Gespeicherte Referenzbaustellen</h3><div id="fragRefList" class="frag-dg-ref-list"></div>';
}
function openRefs(){
  let p=q('fragDgReferencesPanel');if(!p)return;
  p.classList.remove('hidden');loadRefs();setTimeout(()=>p.scrollIntoView({behavior:'smooth',block:'start'}),20);
}
function ensureReferences(){
  if(!chef())return;
  const archive=document.querySelector('#bossView .dg80-final-section[data-section="archive"]');
  const grid=archive&&archive.querySelector('.dg80-final-grid');
  if(!archive||!grid)return;
  let tile=q('fragDgRefTile');
  if(!tile){
    tile=document.createElement('button');tile.type='button';tile.id='fragDgRefTile';
    tile.className='d3-tile dg80-final-tile frag-dg-ref-tile';
    tile.innerHTML='<span>Referenzbaustellen</span><strong id="fragDgRefCount">0</strong>';
    tile.addEventListener('click',e=>{e.preventDefault();e.stopPropagation();openRefs();});
    grid.appendChild(tile);
  }
  let panel=q('fragDgReferencesPanel');
  if(!panel){
    panel=document.createElement('div');panel.id='fragDgReferencesPanel';panel.className='hidden';
    panel.innerHTML=panelHtml();
    archive.insertAdjacentElement('afterend',panel);
    q('fragRefClose').onclick=()=>panel.classList.add('hidden');
    q('fragRefDraft').onclick=()=>saveRef('Entwurf');
    q('fragRefApprove').onclick=()=>saveRef('Freigegeben');
    panel.addEventListener('click',e=>{const b=e.target.closest('[data-frag-edit]');if(b)editRef(b.dataset.fragEdit);});
    loadRefs();
  }
}

function sync(){
  css();
  if(!chef())return;
  ensureTop();
  ensureReferences();
  const old=q('dg10Ai');if(old)old.remove();
  document.documentElement.dataset.fragDg=VERSION;
}
function schedule(){clearTimeout(S.timer);S.timer=setTimeout(sync,80);}
function install(){
  sync();
  if(!S.observer){
    S.observer=new MutationObserver(schedule);
    S.observer.observe(document.body,{subtree:true,childList:true});
  }
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)schedule();});
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});else install();
})();