/* DG 5.0.1: Wartungsgeraete bekommen Bilder und Dateien/Wartungsberichte. */
(function(){
'use strict';
const V501='5.0.1';
const F501=window.DG501Files=window.DG501Files||{pending:{},saved:{}};
const esc501=v=>String(v==null?'':v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const safeKey501=v=>String(v||'').replace(/[^A-Za-z0-9_-]/g,'');
function clientKey501(){return 'mf-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,10);}
function humanSize501(n){n=Number(n)||0;if(n<1024)return n+' B';if(n<1024*1024)return (n/1024).toFixed(1).replace('.',',')+' KB';return (n/1024/1024).toFixed(1).replace('.',',')+' MB';}
function fileClientId501(){return 'MA-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,12);}
function findDevice501(key){return document.querySelector('.d37-device[data-d501-key="'+CSS.escape(String(key))+'"]');}
function savedRows501(key){return Array.isArray(F501.saved[key])?F501.saved[key]:[];}
function pendingRows501(key){return Array.isArray(F501.pending[key])?F501.pending[key]:[];}
function attachmentRows501(key){
  const saved=savedRows501(key),pending=pendingRows501(key);
  const rows=saved.map(a=>'<div class="d501-file-row saved" data-attachment-id="'+esc501(a.id||'')+'"><div class="d501-file-main"><strong>'+(a.kind==='Bild'?'🖼️':'📄')+' '+esc501(a.name||'Datei')+'</strong><span>'+esc501(a.mime||'')+(a.size?' · '+esc501(humanSize501(a.size)):'')+(a.createdAt?' · '+esc501(a.createdAt):'')+'</span></div><div class="d501-file-actions"><button type="button" class="btn secondary d37-mini" onclick="return d501OpenMaintenanceFile(\''+esc501(a.id||'')+'\')">Öffnen</button><button type="button" class="btn danger d37-mini" onclick="return d501DeleteMaintenanceFile(\''+esc501(a.id||'')+'\',\''+esc501(key)+'\')">Löschen</button></div></div>').join('');
  const waiting=pending.map((a,i)=>'<div class="d501-file-row pending"><div class="d501-file-main">'+(a.kind==='Bild'&&a.dataUrl?'<img class="d501-thumb" src="'+esc501(a.dataUrl)+'" alt="Vorschau">':'')+'<strong>'+(a.kind==='Bild'?'🖼️':'📄')+' '+esc501(a.name||'Datei')+'</strong><span>'+esc501(humanSize501(a.size))+' · wird mit „Kundendaten speichern“ hochgeladen</span></div><div class="d501-file-actions"><button type="button" class="btn danger d37-mini" onclick="return d501RemovePending(\''+esc501(key)+'\','+i+')">Entfernen</button></div></div>').join('');
  return rows+waiting||'<div class="muted small">Noch keine Bilder oder Dateien am Gerät hinterlegt.</div>';
}
function renderBox501(key){const box=document.querySelector('.d501-attachments[data-key="'+CSS.escape(String(key))+'"] .d501-file-list');if(box)box.innerHTML=attachmentRows501(key);}
function section501(key){const k=esc501(key);return '<div class="d501-attachments" data-key="'+k+'"><div class="d37-section-label">Gerätebilder &amp; Unterlagen / Wartungsberichte</div><div class="muted small">Bilder, PDFs und weitere Unterlagen werden dauerhaft diesem Gerät und seiner Geräte-ID zugeordnet.</div><div class="button-row d501-upload-actions"><button type="button" class="btn secondary" onclick="document.getElementById(\'d501img-'+k+'\').click()">🖼️ Bilder hinzufügen</button><button type="button" class="btn secondary" onclick="document.getElementById(\'d501file-'+k+'\').click()">📎 Dateien hinzufügen</button></div><input id="d501img-'+k+'" class="hidden" type="file" accept="image/*" multiple onchange="d501FilesChosen(this,\''+k+'\',\'Bild\')"><input id="d501file-'+k+'" class="hidden" type="file" multiple onchange="d501FilesChosen(this,\''+k+'\',\'Datei\')"><div class="d501-file-list">'+attachmentRows501(key)+'</div><div class="d501-file-status"></div></div>';
}

const blank501=window.d37BlankDevice;
if(typeof blank501==='function')window.d37BlankDevice=d37BlankDevice=function(){const d=blank501.apply(this,arguments);d._uploadKey=clientKey501();d.newAttachments=[];return d;};

const deviceHtml501=window.d37DeviceHtml;
if(typeof deviceHtml501==='function')window.d37DeviceHtml=d37DeviceHtml=function(d,oi,di){
  d=d||{};const key=safeKey501(d.id||d._uploadKey||clientKey501());d._uploadKey=key;
  F501.saved[key]=Array.isArray(d.attachments)?d.attachments.slice():savedRows501(key);
  if(Array.isArray(d.newAttachments)&&d.newAttachments.length&&!pendingRows501(key).length)F501.pending[key]=d.newAttachments.slice();
  let h=deviceHtml501.call(this,d,oi,di);
  h=h.replace('<div class="d37-device"','<div class="d37-device" data-d501-key="'+esc501(key)+'"');
  const pos=h.lastIndexOf('</div>');if(pos>=0)h=h.slice(0,pos)+section501(key)+h.slice(pos);
  return h;
};

const collect501=window.d37CollectCustomer;
if(typeof collect501==='function')window.d37CollectCustomer=d37CollectCustomer=function(validate,root){
  root=root||document.querySelector('#d37MaintenanceManage:not(.hidden) .d37-customer-form')||document.querySelector('#d37MaintenanceCreate:not(.hidden) .d37-customer-form')||document.querySelector('.d37-customer-form');
  const c=collect501.call(this,validate,root);if(!c||!root)return c;
  [...root.querySelectorAll('.d37-object')].forEach((or,oi)=>{
    [...or.querySelectorAll(':scope > .d37-devices > .d37-device')].forEach((dr,di)=>{
      const d=c.objects&&c.objects[oi]&&c.objects[oi].devices?c.objects[oi].devices[di]:null;if(!d)return;
      const key=safeKey501(dr.dataset.d501Key||d.id||clientKey501());d._uploadKey=key;d.newAttachments=pendingRows501(key).map(a=>Object.assign({},a));
    });
  });
  return c;
};

function readDataUrl501(file){return new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(String(r.result||''));r.onerror=()=>reject(new Error('Datei konnte nicht gelesen werden.'));r.readAsDataURL(file);});}
function loadImage501(dataUrl){return new Promise((resolve,reject)=>{const img=new Image();img.onload=()=>resolve(img);img.onerror=()=>reject(new Error('Bild konnte nicht verarbeitet werden.'));img.src=dataUrl;});}
async function prepareImage501(file){
  const raw=await readDataUrl501(file);const img=await loadImage501(raw);const max=1800,scale=Math.min(1,max/Math.max(img.naturalWidth||img.width,img.naturalHeight||img.height));if(scale>=0.999&&file.size<=3*1024*1024)return{dataUrl:raw,mime:file.type||'image/jpeg'};
  const c=document.createElement('canvas');c.width=Math.max(1,Math.round((img.naturalWidth||img.width)*scale));c.height=Math.max(1,Math.round((img.naturalHeight||img.height)*scale));c.getContext('2d').drawImage(img,0,0,c.width,c.height);return{dataUrl:c.toDataURL('image/jpeg',0.84),mime:'image/jpeg'};
}
window.d501FilesChosen=async function(input,key,kind){
  key=safeKey501(key);const card=findDevice501(key),status=card&&card.querySelector('.d501-file-status'),files=[...(input.files||[])];input.value='';if(!files.length)return false;
  try{
    if(status){status.className='status info d501-file-status';status.textContent='Dateien werden vorbereitet …';}
    const pending=pendingRows501(key).slice();let currentBytes=pending.reduce((n,x)=>n+(Number(x.size)||0),0);
    for(const file of files){
      if(file.size>12*1024*1024)throw new Error(file.name+': maximal 12 MB pro Datei.');
      if(currentBytes+file.size>25*1024*1024)throw new Error('Maximal 25 MB neue Geräteunterlagen pro Speichervorgang.');
      let dataUrl,mime=file.type||'application/octet-stream';if(kind==='Bild'){if(!/^image\//i.test(mime))throw new Error(file.name+': keine Bilddatei.');const p=await prepareImage501(file);dataUrl=p.dataUrl;mime=p.mime;}else dataUrl=await readDataUrl501(file);
      pending.push({clientId:fileClientId501(),kind:kind,name:file.name||((kind==='Bild'?'Bild':'Datei')+'_'+(pending.length+1)),mime:mime,size:file.size||0,dataUrl:dataUrl});currentBytes+=file.size||0;
    }
    F501.pending[key]=pending;renderBox501(key);if(status){status.className='status ok d501-file-status';status.textContent='✓ '+files.length+' Datei(en) vorbereitet. Bitte Kundendaten speichern.';}
  }catch(e){if(status){status.className='status error d501-file-status';status.textContent=e.message;}else alert(e.message);}
  return false;
};
window.d501RemovePending=function(key,index){key=safeKey501(key);const a=pendingRows501(key).slice();a.splice(Number(index),1);F501.pending[key]=a;renderBox501(key);return false;};
window.d501OpenMaintenanceFile=async function(id){
  if(!id)return false;try{const r=await api(chefPayload({action:'getMaintenanceAttachment',id:id})),bytes=Uint8Array.from(atob(r.base64||''),c=>c.charCodeAt(0)),blob=new Blob([bytes],{type:r.mime||'application/octet-stream'}),url=URL.createObjectURL(blob);if(/^image\//i.test(r.mime||'')||String(r.mime||'').toLowerCase()==='application/pdf'){window.open(url,'_blank','noopener');setTimeout(()=>URL.revokeObjectURL(url),60000);}else{const a=document.createElement('a');a.href=url;a.download=r.name||'Datei';document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),30000);}}catch(e){alert('Datei konnte nicht geöffnet werden: '+e.message);}return false;
};
window.d501DeleteMaintenanceFile=async function(id,key){
  if(!id||!confirm('Diese Geräteunterlage wirklich löschen?'))return false;try{await api(chefPayload({action:'deleteMaintenanceAttachment',id:id}));key=safeKey501(key);F501.saved[key]=savedRows501(key).filter(x=>String(x.id)!==String(id));if(window.DG37&&DG37.customer){(DG37.customer.objects||[]).forEach(o=>(o.devices||[]).forEach(d=>{if(String(d.id||d._uploadKey)===key)d.attachments=(d.attachments||[]).filter(x=>String(x.id)!==String(id));}));}renderBox501(key);}catch(e){alert('Unterlage konnte nicht gelöscht werden: '+e.message);}return false;
};

const api501=window.api;
if(typeof api501==='function')window.api=api=async function(payload){const r=await api501.apply(this,arguments);if(payload&&payload.action==='saveMaintenanceCustomer'){F501.pending={};F501.saved={};}return r;};

/* Patchstand eindeutig erkennen. */
window.d3CheckBackend=d3CheckBackend=async function(){
  try{const r=await api({action:'ping'}),found=String(r&&r.version||''),p=found.split('.').map(Number),ok=p[0]===5&&(p[1]>0||(p[1]===0&&p[2]>=1));DG3.backend=ok?found:'';if(!ok)d3Notice('App 5.0.1 benötigt Google-GS 5.0.1 oder neuer. Gefunden: '+(found||'unbekannt')+'. Speichern ist gesperrt.','warn');else $('d3Notice')?.remove();return ok;}catch(e){DG3.backend='';d3Notice('Verbindungsprüfung fehlgeschlagen: '+e.message,'warn');return false;}
};
try{DG3.version=V501;window.DG_APP_VERSION=V501;}catch(_e){}
})();
