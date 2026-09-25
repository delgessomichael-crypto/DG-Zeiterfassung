(function(){
'use strict';
function q(id){return document.getElementById(id);}
function mount(){
  var boss=q('bossView');
  if(!boss||boss.classList.contains('hidden'))return;
  try{if(typeof window.dg10MountFragDG==='function')window.dg10MountFragDG();}catch(e){console.error('Frag DG top',e);}
  var dash=boss.querySelector(':scope > .d3-dashboard');
  var archive=dash&&dash.querySelector('.dg80-final-section[data-section="archive"]');
  if(!dash||!archive)return;
  var sec=q('dg10FragOwnSection');
  if(!sec){
    sec=document.createElement('section');
    sec.id='dg10FragOwnSection';
    sec.className='dg80-final-section';
    sec.dataset.section='fragDG';
    sec.innerHTML='<div class="dg80-final-section-title">Frag DG</div><div class="dg80-final-grid"><button type="button" id="dg10FragOwnRef" class="d3-tile dg80-final-tile"><span>Referenzbaustellen</span><strong>›</strong></button></div>';
    archive.insertAdjacentElement('afterend',sec);
    var b=q('dg10FragOwnRef');
    if(b)b.onclick=function(ev){
      ev.preventDefault();
      if(typeof window.dg10OpenReferenceProjects==='function')window.dg10OpenReferenceProjects();
    };
  }else if(sec.previousElementSibling!==archive){
    archive.insertAdjacentElement('afterend',sec);
  }
  try{
    if(typeof window.DG10_OFFICE_COMPACT!=='undefined'){
      var title=sec.querySelector(':scope > .dg80-final-section-title');
      if(title&&!title.querySelector('.dg10-section-chevron')){
        var ch=document.createElement('span');
        ch.className='dg10-section-chevron';
        ch.textContent='▾';
        title.appendChild(ch);
      }
    }
  }catch(_e){}
}
function schedule(){setTimeout(mount,0);}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',schedule,{once:true});else schedule();
new MutationObserver(schedule).observe(document.documentElement,{subtree:true,childList:true,attributes:true,attributeFilter:['class']});
setInterval(mount,1000);
})();