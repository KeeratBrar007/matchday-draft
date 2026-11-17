/* ============================= Boot ============================= */
['pointerdown','keydown','touchstart'].forEach(ev=> document.addEventListener(ev, unlockAudio, {passive:true}));
document.addEventListener('visibilitychange', ()=>{
  if(!document.hidden){ stopTitleFlash(); checkTurnAlert(); checkForUpdate(); }
  else if(myTurnInfo() && alertsOn) startTitleFlash();
});
window.addEventListener('beforeinstallprompt', e=>{ e.preventDefault(); deferredInstall = e; render(); });
window.addEventListener('appinstalled', ()=>{ deferredInstall = null; render(); });
try{
  if('serviceWorker' in navigator && /^https?:$/.test(location.protocol)){
    navigator.serviceWorker.addEventListener('message', e=>{
      if(e.data && e.data.type==='md-updated'){ updateReady = true; render(); }
    });
    window.addEventListener('load', ()=>{ navigator.serviceWorker.register('sw.js').catch(()=>{}); setTimeout(checkForUpdate, 3000); });
  }
}catch(e){}
render();
initDb();
