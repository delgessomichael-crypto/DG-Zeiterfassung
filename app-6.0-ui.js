/* DG Zeiterfassung 6.0.1 - Monteur-Eingabe: Ja/Nein-Tasten und Sprache-zu-Text */
(function(){
'use strict';

const V60='6.0.1';
let activeRecognition60=null;
let activeSpeechTarget60='';
let activeSpeechButton60=null;

function byId60(id){return document.getElementById(id);}

function addCss60(){
  if(byId60('dg60Styles'))return;
  const s=document.createElement('style');
  s.id='dg60Styles';
  s.textContent=`
    .dg60-toggle-row{
      grid-template-columns:minmax(170px,1fr) minmax(220px,320px)!important;
      align-items:center!important;
      gap:10px!important;
    }
    .dg60-toggle-row>label.dg60-original-radio{display:none!important}
    .dg60-toggle-group{display:grid;grid-template-columns:1fr 1fr;gap:8px}
    .dg60-choice{
      border:2px solid #d1d5db;border-radius:12px;padding:12px 14px;
      font-weight:900;background:#f3f4f6;color:#374151;cursor:pointer;
      min-height:48px;transition:transform .06s ease,background .12s ease,border-color .12s ease;
    }
    .dg60-choice:active{transform:scale(.985)}
    .dg60-choice.dg60-yes.active{background:#166534;color:#fff;border-color:#166534}
    .dg60-choice.dg60-no.active{background:#b91c1c;color:#fff;border-color:#b91c1c}
    .dg60-speech-tools{display:flex;gap:8px;flex-wrap:wrap;margin:8px 0 4px}
    .dg60-speech-tools .btn{width:auto!important;margin:0!important;padding:10px 13px!important}
    .dg60-speech-btn.listening{background:#b91c1c!important;color:#fff!important;animation:dg60Pulse 1.2s infinite}
    .dg60-speech-status{font-size:12px;color:#64748b;margin:4px 0 8px;min-height:16px}
    .dg60-speech-status.ok{color:#166534;background:transparent;padding:0;border-radius:0;font-weight:700}
    .dg60-speech-status.warn{color:#9a3412;background:transparent;padding:0;border-radius:0;font-weight:700}
    .dg60-speech-status.error{color:#991b1b;background:transparent;padding:0;border-radius:0;font-weight:700}
    @keyframes dg60Pulse{0%,100%{opacity:1}50%{opacity:.65}}
    @media(max-width:720px){
      .dg60-toggle-row{grid-template-columns:1fr!important}
      .dg60-toggle-group{width:100%}
      .dg60-choice{min-height:52px;font-size:17px}
      .dg60-speech-tools{display:grid;grid-template-columns:1fr 1fr}
      .dg60-speech-tools .btn{width:100%!important}
    }
  `;
  document.head.appendChild(s);
}

function setVisibleVersion60(){
  document.title='DG Zeiterfassung '+V60;
  const loginVersion=document.querySelector('#loginScreen .center.muted.small');
  if(loginVersion)loginVersion.textContent='Version '+V60;
  const heroVersion=document.querySelector('#mainScreen .hero .head-row strong');
  if(heroVersion)heroVersion.textContent='Zeiterfassung - '+V60;
  try{window.DG_APP_VERSION=V60;if(window.DG3)window.DG3.version=V60;}catch(_e){}
}

function enhanceYesNo60(name){
  const inputs=[...document.querySelectorAll('input[type="radio"][name="'+name+'"]')];
  if(inputs.length<2)return;
  const row=inputs[0].closest('.radio-row');
  if(!row||row.dataset.dg60Enhanced==='1')return;
  row.dataset.dg60Enhanced='1';
  row.classList.add('dg60-toggle-row');

  inputs.forEach(input=>{
    const label=input.closest('label');
    if(label)label.classList.add('dg60-original-radio');
  });

  const group=document.createElement('div');
  group.className='dg60-toggle-group';
  group.setAttribute('role','group');
  group.setAttribute('aria-label',(row.querySelector('strong')?.textContent||name).trim());

  const yes=document.createElement('button');
  yes.type='button';yes.className='dg60-choice dg60-yes';yes.textContent='Ja';
  const no=document.createElement('button');
  no.type='button';no.className='dg60-choice dg60-no';no.textContent='Nein';
  group.append(yes,no);row.appendChild(group);

  function refresh(){
    const selected=inputs.find(x=>x.checked)?.value||'';
    yes.classList.toggle('active',selected==='yes');
    no.classList.toggle('active',selected==='no');
    yes.setAttribute('aria-pressed',selected==='yes'?'true':'false');
    no.setAttribute('aria-pressed',selected==='no'?'true':'false');
  }
  function choose(value){
    const input=inputs.find(x=>x.value===value);if(!input)return;
    input.checked=true;
    input.dispatchEvent(new Event('change',{bubbles:true}));
    refresh();
  }
  yes.addEventListener('click',()=>choose('yes'));
  no.addEventListener('click',()=>choose('no'));
  inputs.forEach(x=>x.addEventListener('change',refresh));
  refresh();
}

function speechCtor60(){return window.SpeechRecognition||window.webkitSpeechRecognition||null;}

function speechErrorText60(code){
  if(code==='not-allowed'||code==='service-not-allowed')return 'Mikrofonzugriff wurde nicht erlaubt. Bitte Mikrofon für diese App freigeben.';
  if(code==='no-speech')return 'Keine Sprache erkannt. Bitte erneut versuchen und deutlich sprechen.';
  if(code==='audio-capture')return 'Kein Mikrofon verfügbar oder das Mikrofon wird bereits verwendet.';
  if(code==='network')return 'Spracherkennung benötigt gerade eine Internetverbindung.';
  return 'Spracherkennung konnte nicht gestartet werden.';
}

function status60(targetId,text,type){
  const e=byId60('dg60SpeechStatus-'+targetId);if(!e)return;
  e.className='dg60-speech-status'+(type?' '+type:'');e.textContent=text||'';
}

function stopSpeech60(){
  if(activeRecognition60){try{activeRecognition60.stop();}catch(_e){}}
}

function startSpeech60(targetId,button){
  const target=byId60(targetId);if(!target)return;
  const Ctor=speechCtor60();
  if(!Ctor){status60(targetId,'Sprache-zu-Text wird von diesem Browser nicht unterstützt. Bitte Chrome oder Edge verwenden.','warn');return;}

  if(activeRecognition60){
    if(activeSpeechTarget60===targetId){stopSpeech60();return;}
    stopSpeech60();
  }

  const recognition=new Ctor();
  activeRecognition60=recognition;activeSpeechTarget60=targetId;activeSpeechButton60=button;
  recognition.lang='de-DE';
  recognition.continuous=true;
  recognition.interimResults=false;
  recognition.maxAlternatives=1;

  const original=String(target.value||'').trimEnd();
  let hadFinal=false;
  const processed=new Set();
  let lastFinal='',lastFinalAt=0;
  const normSpeech60=v=>String(v||'').toLowerCase().replace(/[^a-z0-9äöüß]+/gi,' ').trim().replace(/\s+/g,' ');
  const appendUniqueSpeech60=(base,piece)=>{
    const cur=String(base||'').trimEnd(),p=String(piece||'').trim();if(!p)return cur;
    const a=cur.split(/\s+/),b=p.split(/\s+/);let overlap=0,limit=Math.min(12,a.length,b.length);
    for(let n=1;n<=limit;n++){if(normSpeech60(a.slice(-n).join(' '))===normSpeech60(b.slice(0,n).join(' ')))overlap=n;}
    const rest=b.slice(overlap).join(' ');return rest?cur+(cur?' ':'')+rest:cur;
  };

  function cleanup(message,type){
    if(activeSpeechButton60){activeSpeechButton60.classList.remove('listening');activeSpeechButton60.textContent='🎤 Sprache zu Text';}
    if(activeRecognition60===recognition){activeRecognition60=null;activeSpeechTarget60='';activeSpeechButton60=null;}
    if(message)status60(targetId,message,type||'');
  }

  recognition.onstart=function(){
    button.classList.add('listening');button.textContent='⏹ Aufnahme stoppen';
    status60(targetId,'Aufnahme läuft – sprich deutlich. Erkannter Text wird angehängt.','ok');
  };

  recognition.onresult=function(event){
    for(let i=event.resultIndex;i<event.results.length;i++){
      const result=event.results[i];if(!result||!result.isFinal)continue;
      const piece=String(result[0]?.transcript||'').trim(),n=normSpeech60(piece),key=String(i)+'|'+n;
      if(!n||processed.has(key))continue;processed.add(key);
      const now=Date.now();if(n===lastFinal&&now-lastFinalAt<3500)continue;lastFinal=n;lastFinalAt=now;
      target.value=appendUniqueSpeech60(target.value,piece);hadFinal=true;
      target.dispatchEvent(new Event('input',{bubbles:true}));
      target.scrollTop=target.scrollHeight;
    }
  };

  recognition.onerror=function(event){
    cleanup(speechErrorText60(event.error),'error');
  };

  recognition.onend=function(){
    if(!hadFinal)target.value=original;
    cleanup(hadFinal?'Sprache übernommen. Du kannst den Text jetzt noch korrigieren.':'Aufnahme beendet.','');
  };

  try{recognition.start();}catch(e){cleanup('Spracherkennung konnte nicht gestartet werden. Bitte erneut versuchen.','error');}
}

function addSpeechTools60(targetId){
  const target=byId60(targetId);if(!target||target.dataset.dg60Speech==='1')return;
  target.dataset.dg60Speech='1';

  const tools=document.createElement('div');tools.className='dg60-speech-tools';
  const mic=document.createElement('button');mic.type='button';mic.className='btn primary dg60-speech-btn';mic.textContent='🎤 Sprache zu Text';
  const clear=document.createElement('button');clear.type='button';clear.className='btn secondary';clear.textContent='Text löschen';
  const stat=document.createElement('div');stat.id='dg60SpeechStatus-'+targetId;stat.className='dg60-speech-status';

  mic.addEventListener('click',()=>startSpeech60(targetId,mic));
  clear.addEventListener('click',()=>{
    if(activeSpeechTarget60===targetId)stopSpeech60();
    target.value='';target.dispatchEvent(new Event('input',{bubbles:true}));target.focus();status60(targetId,'Text gelöscht.','');
  });
  tools.append(mic,clear);
  target.insertAdjacentElement('afterend',tools);tools.insertAdjacentElement('afterend',stat);

  if(!speechCtor60()){
    mic.disabled=true;mic.classList.remove('primary');mic.classList.add('secondary');
    status60(targetId,'Sprache-zu-Text ist in diesem Browser nicht verfügbar. Chrome oder Edge verwenden.','warn');
  }
}

function install60(){
  addCss60();
  setVisibleVersion60();
  enhanceYesNo60('photosUsed');
  enhanceYesNo60('materialUsed');
  enhanceYesNo60('jobCompleted');
  addSpeechTools60('activity');
  addSpeechTools60('material');
}

const oldOpenMain60=window.openMain;
if(typeof oldOpenMain60==='function')window.openMain=function(){const r=oldOpenMain60.apply(this,arguments);setTimeout(install60,0);setTimeout(install60,300);return r;};
const oldShowEmployee60=window.showEmployee;
if(typeof oldShowEmployee60==='function')window.showEmployee=function(){const r=oldShowEmployee60.apply(this,arguments);setTimeout(install60,0);return r;};

if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install60);else install60();
setTimeout(install60,500);
})();
