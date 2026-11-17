/* ============================= Your-turn alerts ============================= */
// A captain's phone buzzes, beeps and flashes a banner the moment it's their
// turn to bid, and the screen is kept awake during the auction so a locked
// phone doesn't leave the other captain waiting.
let audioCtx = null, lastTurnKey = null, titleTimer = null, wakeLock = null, wakeLockBusy = false;
const baseTitle = document.title;
function unlockAudio(){
  try{
    if(!audioCtx){ const AC = window.AudioContext || window.webkitAudioContext; if(AC) audioCtx = new AC(); }
    if(audioCtx && audioCtx.state==='suspended') audioCtx.resume();
  }catch(e){}
}
function beep(){
  if(!audioCtx) return;
  try{
    const t = audioCtx.currentTime;
    [[880,0],[1175,0.18]].forEach(([f,d])=>{
      const o = audioCtx.createOscillator(), g = audioCtx.createGain();
      o.type = 'sine'; o.frequency.value = f;
      g.gain.setValueAtTime(0.0001, t+d);
      g.gain.exponentialRampToValueAtTime(0.28, t+d+0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t+d+0.35);
      o.connect(g); g.connect(audioCtx.destination);
      o.start(t+d); o.stop(t+d+0.4);
    });
  }catch(e){}
}
function buzz(){ try{ if(navigator.vibrate) navigator.vibrate([220,90,220,90,420]); }catch(e){} }
function myTurnInfo(){
  const a = S.auction;
  if(S.phase!=='auction' || !a || a.done) return null;
  const t = myTeamRole();
  if(!t || a.turn!==t) return null;
  const capA = a.capA || S.format, capB = a.capB || S.format;
  if(teamFull(a.teamA,capA) !== teamFull(a.teamB,capB)) return null;   // roster is auto-filling, nobody to act
  const cur = a.order[a.index];
  return {team:t, bid:a.currentBid, player: cur ? playerName(cur) : ''};
}
function notifyTurn(info){
  try{
    if(!document.hidden || !('Notification' in window) || Notification.permission!=='granted') return;
    const body = (info.player ? info.player + ' is on the block — ' : '') + 'bid ₹' + info.bid + ' or more, or pass.';
    const opts = {body, tag:'md-turn', renotify:true, icon:'icon-192.png', vibrate:[200,100,200]};
    if(navigator.serviceWorker && navigator.serviceWorker.getRegistration){
      navigator.serviceWorker.getRegistration().then(reg=>{
        if(reg && reg.showNotification) reg.showNotification('Your turn ' + SPORT.icon, opts); else new Notification('Your turn ' + SPORT.icon, opts);
      }).catch(()=>{});
    }else new Notification('Your turn ' + SPORT.icon, opts);
  }catch(e){}
}
function closeTurnNotifications(){
  try{
    if(navigator.serviceWorker && navigator.serviceWorker.getRegistration){
      navigator.serviceWorker.getRegistration().then(reg=>{
        if(reg && reg.getNotifications) reg.getNotifications({tag:'md-turn'}).then(l=>l.forEach(n=>n.close()));
      }).catch(()=>{});
    }
  }catch(e){}
}
function startTitleFlash(){
  if(titleTimer) return;
  let on = false;
  titleTimer = setInterval(()=>{ on = !on; document.title = on ? '🔔 YOUR TURN!' : baseTitle; }, 1000);
}
function stopTitleFlash(){
  if(titleTimer){ clearInterval(titleTimer); titleTimer = null; }
  document.title = baseTitle;
}
async function syncWakeLock(want){
  try{
    if(want){
      if(!wakeLock && !wakeLockBusy && navigator.wakeLock && !document.hidden){
        wakeLockBusy = true;
        wakeLock = await navigator.wakeLock.request('screen');
        wakeLock.addEventListener('release', ()=>{ wakeLock = null; });
      }
    }else if(wakeLock){
      const w = wakeLock; wakeLock = null; await w.release();
    }
  }catch(e){ wakeLock = null; }
  wakeLockBusy = false;
}
function checkTurnAlert(){
  const info = myTurnInfo();
  if(info){
    const a = S.auction;
    const key = [a.index, a.currentBid, a.turn, a.leader||''].join('|');
    if(key !== lastTurnKey){
      lastTurnKey = key;
      if(alertsOn){ buzz(); beep(); notifyTurn(info); }
      // a captain browsing the leaderboard/profile gets pulled back to the auction
      if(currentPage()!=='home') setTimeout(goHome, 0);
    }
    if(document.hidden && alertsOn) startTitleFlash();
  }else{
    if(lastTurnKey!==null) closeTurnNotifications();
    lastTurnKey = null;
    stopTitleFlash();
  }
  syncWakeLock((!!myTeamRole() && S.phase==='auction' && !!S.auction && !S.auction.done) || (isHost() && liveOn()));
}
function renderTurnBanner(){
  const i = myTurnInfo();
  if(!i) return '';
  return `<div class="turn-banner" role="alert"><span class="tb-dot"></span><span><b>Your turn!</b> ${i.player ? esc(i.player)+' is on the block — ' : ''}bid ₹${i.bid} or more, or pass.</span>${S.timerSecs ? `<span class="tb-timer" id="tbTimer">⏱ ${Math.ceil(timerLeft())}s</span>` : ''}</div>`;
}
function toggleAlerts(){
  alertsOn = !alertsOn;
  try{ localStorage.setItem('md_alerts', alertsOn ? 'on' : 'off'); }catch(e){}
  unlockAudio();
  if(alertsOn){
    buzz(); beep();
    try{ if('Notification' in window && Notification.permission==='default') Notification.requestPermission(); }catch(e){}
  }else stopTitleFlash();
  render();
}

/* ---- auction countdown ----
   Each phone times a turn from the moment it sees that turn begin (no shared clock needed).
   The captain whose turn it is auto-passes at zero; the host and the other captain back that up
   a few seconds later in case that phone is asleep. Friends watching never write anything. */
function auctionBothOpen(a){
  const capA = a.capA || S.format, capB = a.capB || S.format;
  return teamFull(a.teamA,capA) === teamFull(a.teamB,capB);
}
function syncTimerKey(){
  const a = S.auction;
  const key = a ? [a.index, a.currentBid, a.turn, a.leader||'', a.passesInARow||0].join('|') : '';
  if(key !== timerKey){ timerKey = key; timerStart = Date.now(); timerFiredAt = 0; }
}
function timerActive(){
  const a = S.auction;
  return !!(S.timerSecs > 0 && S.phase==='auction' && a && !a.done && auctionBothOpen(a));
}
function timerLeft(){
  syncTimerKey();
  return Math.max(0, (S.timerSecs||0) - (Date.now() - timerStart) / 1000);
}
function timerHtml(a){
  if(!timerActive()) return '';
  const left = timerLeft(), pct = Math.round(100 * left / S.timerSecs);
  return `<div class="turn-timer ${left<=5?'urgent':''}" id="turnTimer">
    <div class="tt-label"><span>Team ${a.turn.toUpperCase()} to decide</span><b id="ttText">${Math.ceil(left)}s</b></div>
    <div class="tt-bar"><i id="ttBar" style="width:${pct}%"></i></div>
  </div>`;
}
function setTimerSecs(n){ saveState({timerSecs: Number(n)||0}); }
function tickTimer(){
  if(!timerActive()) return;
  const a = S.auction;
  const left = timerLeft();
  const t = document.getElementById('ttText'); if(t) t.textContent = Math.ceil(left) + 's';
  const bar = document.getElementById('ttBar'); if(bar) bar.style.width = Math.round(100*left/S.timerSecs) + '%';
  const box = document.getElementById('turnTimer'); if(box) box.classList.toggle('urgent', left<=5);
  const tb = document.getElementById('tbTimer'); if(tb) tb.textContent = '⏱ ' + Math.ceil(left) + 's';
  const mine = myTeamRole() === a.turn;
  if(mine && left>0 && left<=5 && timerWarnKey!==timerKey){
    timerWarnKey = timerKey;
    if(alertsOn){ try{ if(navigator.vibrate) navigator.vibrate(120); }catch(e){} }
  }
  if(left > 0) return;
  const overdue = (Date.now() - timerStart)/1000 - S.timerSecs;
  const canBackUp = isHost() || !!myTeamRole();
  if(((mine && overdue >= 0) || (canBackUp && overdue >= 3.5)) && Date.now() - timerFiredAt > 5000){
    timerFiredAt = Date.now();
    auctionPass(a.turn, true);
  }
}
setInterval(tickTimer, 500);

