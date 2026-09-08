(function(){
  'use strict';
  if(window.__DG_V51_PATCH__) return;
  window.__DG_V51_PATCH__=true;

  function el(id){return document.getElementById(id)}

  function addStyles(){
    if(el('dgV51Styles')) return;
    const s=document.createElement('style');
    s.id='dgV51Styles';
    s.textContent=`
      #employeeTimeBank.dg51-month-hours{background:#dcfce7!important;color:#166534!important;border:1px solid #bbf7d0!important;font-weight:800}
    `;
    document.head.appendChild(s);
  }

  async function refreshMonthHours(){
    const box=el('employeeTimeBank');
    if(!box) return;
    box.classList.add('dg51-month-hours');
    if(!navigator.onLine){
      box.textContent='Geleistete Monatsstunden: offline nicht verfügbar';
      return;
    }
    const a=typeof auth==='function'?auth():{};
    if(!a.employee||!a.pin){
      box.textContent='Geleistete Monatsstunden: 0,00 Std.';
      return;
    }
    const d=new Date();
    try{
      const data=await api({action:'getMonthData',employee:a.employee,pin:a.pin,year:d.getFullYear(),month:d.getMonth()+1});
      const total=Number(data&&data.total||0);
      box.textContent='Geleistete Monatsstunden: '+formatHours(total)+' Std.';
    }catch(e){
      box.textContent='Geleistete Monatsstunden: nicht verfügbar';
    }
  }

  const baseRenderDay=window.renderDay;
  if(typeof baseRenderDay==='function'){
    window.renderDay=function(){
      const r=baseRenderDay.apply(this,arguments);
      refreshMonthHours();
      return r;
    };
  }

  const baseLoadDay=window.loadDay;
  if(typeof baseLoadDay==='function'){
    window.loadDay=async function(){
      const r=await baseLoadDay.apply(this,arguments);
      await refreshMonthHours();
      return r;
    };
  }

  addStyles();
  refreshMonthHours();
  document.title='DG Zeiterfassung v51';
  const lv=document.querySelector('.login-card .center.muted.small');if(lv)lv.textContent='Version 51';
  const hv=document.querySelector('.hero .head-row strong');if(hv)hv.textContent='Zeiterfassung · v51';
})();
