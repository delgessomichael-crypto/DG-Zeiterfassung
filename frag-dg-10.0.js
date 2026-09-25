(function(){
'use strict';

function q(id){return document.getElementById(id);}

function payload(extra){
  if(typeof window.chefPayload==='function')return window.chefPayload(extra||{});
  return extra||{};
}

async function askFragDG(){
  var input=q('dg10FragTopInput');
  var out=q('dg10FragTopOut');
  var send=q('dg10FragTopSend');
  var prompt=String(input&&input.value||'').trim();
  if(!prompt||!out)return;

  if(send)send.disabled=true;
  out.className='status info';
  out.textContent='Frag DG arbeitet ...';

  try{
    if(typeof window.api!=='function')throw new Error('App-Schnittstelle ist noch nicht bereit.');
    var r=await window.api(payload({action:'getAiAssistantV10',prompt:prompt}));
    out.className=(r&&r.configured===false)?'status warn':'status ok';
    out.textContent=String(r&&r.text||'Keine Antwort erhalten.');
  }catch(e){
    out.className='status error';
    out.textContent=String(e&&e.message||e);
  }finally{
    if(send)send.disabled=false;
  }
}

function bindSpeech(){
  var input=q('dg10FragTopInput');
  var mic=q('dg10FragTopMic');
  if(!input||!mic||mic.dataset.bound==='1')return;

  mic.dataset.bound='1';
  var SR=window.SpeechRecognition||window.webkitSpeechRecognition;
  if(!SR){
    mic.disabled=true;
    mic.title='Spracherkennung wird von diesem Browser nicht unterstützt.';
    return;
  }

  mic.onclick=function(ev){
    ev.preventDefault();
    var rec=new SR();
    rec.lang='de-DE';
    rec.interimResults=false;
    rec.continuous=false;
    mic.textContent='■';

    rec.onresult=function(e){
      var text='';
      for(var i=0;i<e.results.length;i++){
        if(e.results[i][0])text+=e.results[i][0].transcript+' ';
      }
      text=text.trim();
      if(text)input.value=(input.value?input.value.trim()+' ':'')+text;
    };

    rec.onend=function(){mic.textContent='🎤';};
    rec.onerror=function(){mic.textContent='🎤';};
    rec.start();
  };
}

function ensureTop(){
  var boss=q('bossView');
  if(!boss||boss.classList.contains('hidden'))return;

  var box=q('dg10FragTopBar');
  if(!box){
    box=document.createElement('section');
    box.id='dg10FragTopBar';
    box.style.cssText='margin:0 0 11px;padding:12px;border:2px solid #405fa7;border-radius:15px;background:#f4f7ff;box-sizing:border-box;';
    box.innerHTML=
      '<div style="display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:8px">'+
        '<strong style="font-size:18px;color:#31589e">Frag DG</strong>'+
        '<span class="muted small">Intelligente Unterstützung für den Büroalltag</span>'+
      '</div>'+
      '<div style="display:grid;grid-template-columns:minmax(0,1fr) auto auto;gap:8px;align-items:center">'+
        '<input id="dg10FragTopInput" type="text" placeholder="Frag DG – z. B. Was ist heute dringend?" style="margin:0;min-height:46px">'+
        '<button type="button" class="btn secondary" id="dg10FragTopMic" title="Spracheingabe">🎤</button>'+
        '<button type="button" class="btn primary" id="dg10FragTopSend">Frag DG</button>'+
      '</div>'+
      '<div id="dg10FragTopOut" style="margin-top:8px;white-space:pre-wrap"></div>';

    var appShell=q('dg10AppShell');
    boss.insertBefore(box,appShell||boss.firstChild);

    q('dg10FragTopSend').onclick=askFragDG;
    q('dg10FragTopInput').onkeydown=function(e){
      if(e.key==='Enter'){
        e.preventDefault();
        askFragDG();
      }
    };
    bindSpeech();
  }else{
    var app=q('dg10AppShell');
    if(app&&box.nextElementSibling!==app)boss.insertBefore(box,app);
  }
}

function toggleSection(sec,title){
  if(!sec||!title)return;
  var collapsed=sec.classList.toggle('dg10-section-collapsed');
  title.setAttribute('aria-expanded',String(!collapsed));
  var ch=title.querySelector('.dg10-section-chevron');
  if(ch)ch.textContent=collapsed?'▸':'▾';
}

function ensureSection(){
  var boss=q('bossView');
  var dash=boss&&boss.querySelector(':scope > .d3-dashboard');
  var archive=dash&&dash.querySelector('.dg80-final-section[data-section="archive"]');
  if(!dash||!archive)return;

  var sec=q('dg10FragOwnSection');
  if(!sec){
    sec=document.createElement('section');
    sec.id='dg10FragOwnSection';
    sec.className='dg80-final-section';
    sec.dataset.section='fragDG';
    sec.innerHTML=
      '<div class="dg80-final-section-title" role="button" tabindex="0" aria-expanded="true">'+
        '<span>Frag DG</span><span class="dg10-section-chevron" aria-hidden="true">▾</span>'+
      '</div>'+
      '<div class="dg80-final-grid">'+
        '<button type="button" id="dg10FragOwnRef" class="d3-tile dg80-final-tile">'+
          '<span>Referenzbaustellen</span><strong>›</strong>'+
        '</button>'+
      '</div>';

    archive.insertAdjacentElement('afterend',sec);

    var title=sec.querySelector(':scope > .dg80-final-section-title');
    title.addEventListener('click',function(ev){
      ev.preventDefault();
      ev.stopImmediatePropagation();
      toggleSection(sec,title);
    },true);

    title.addEventListener('keydown',function(ev){
      if(ev.key!=='Enter'&&ev.key!==' ')return;
      ev.preventDefault();
      ev.stopImmediatePropagation();
      toggleSection(sec,title);
    },true);

    var b=q('dg10FragOwnRef');
    if(b)b.onclick=function(ev){
      ev.preventDefault();
      ev.stopPropagation();
      if(typeof window.dg10OpenReferenceProjects==='function'){
        window.dg10OpenReferenceProjects();
      }else{
        alert('Referenzbaustellen werden noch geladen. Bitte die App einmal aktualisieren.');
      }
    };
  }else if(sec.previousElementSibling!==archive){
    archive.insertAdjacentElement('afterend',sec);
  }
}

function mount(){
  var boss=q('bossView');
  if(!boss||boss.classList.contains('hidden'))return;
  ensureTop();
  ensureSection();
}

function schedule(){setTimeout(mount,0);}

if(document.readyState==='loading'){
  document.addEventListener('DOMContentLoaded',schedule,{once:true});
}else{
  schedule();
}

new MutationObserver(schedule).observe(document.documentElement,{
  subtree:true,
  childList:true,
  attributes:true,
  attributeFilter:['class']
});

setInterval(mount,1000);
})();