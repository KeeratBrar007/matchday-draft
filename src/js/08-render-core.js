/* ============================= Rendering ============================= */

const PHASE_STEPS = [
  {key:'setup', label:'Roster'},
  {key:'mode', label:'Mode'},
  {key:'draft', label:'Draft'},
  {key:'complete', label:'Result'}
];

function phaseStepKey(phase){
  if(phase==='setup') return 'setup';
  if(phase==='mode') return 'mode';
  if(['captains','budget','auction'].includes(phase)) return 'draft';
  if(phase==='random') return 'draft';
  if(phase==='complete') return 'complete';
  return 'setup';
}

// Rebuilding #app wholesale (below) would otherwise reset page scroll and
// any open modal's internal scroll back to the top on every single click —
// so capture both here and restore them right after.
function currentTheme(){ return document.documentElement.getAttribute('data-theme')==='dark' ? 'dark' : 'light'; }
function toggleTheme(){
  const t = currentTheme()==='dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', t);
  try{ localStorage.setItem('md_theme', t); }catch(e){}
  try{ const tc = document.querySelector('meta[name=theme-color]'); if(tc) tc.setAttribute('content', t==='dark' ? '#0b1812' : '#ffffff'); }catch(e){}
  render();
}
function themeBtnHtml(){
  return `<button class="btn btn-ghost btn-sm theme-btn" onclick="toggleTheme()" title="Switch between light and dark">${currentTheme()==='dark' ? '☀️ Light' : '🌙 Dark'}</button>`;
}
/* ---- install to home screen ---- */
function isStandalone(){
  try{ return (window.matchMedia && matchMedia('(display-mode: standalone)').matches) || navigator.standalone === true; }catch(e){ return false; }
}
function isIOS(){
  try{ return /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform==='MacIntel' && navigator.maxTouchPoints>1); }catch(e){ return false; }
}
function isAndroid(){ try{ return /android/i.test(navigator.userAgent); }catch(e){ return false; } }
function toggleInstallHelp(){ installHelp = !installHelp; render(); }
function installApp(){
  if(!deferredInstall) return;
  try{
    deferredInstall.prompt();
    Promise.resolve(deferredInstall.userChoice).finally(()=>{ deferredInstall = null; render(); });
  }catch(e){ deferredInstall = null; render(); }
}
function installBtnHtml(){
  if(isStandalone()) return '';
  if(!deferredInstall && !isIOS() && !isAndroid()) return '';
  const help = installHelp ? `<div class="install-help">${
    isIOS()
      ? 'In <b>Safari</b>, tap the Share button (the square with an arrow), then <b>Add to Home Screen</b>. If you opened this link inside WhatsApp or another app, open it in Safari first.'
      : 'In Chrome, tap the ⋮ menu, then <b>Install app</b> (or <b>Add to Home screen</b>).'
  }</div>` : '';
  return `<div class="install-wrap">${
    deferredInstall
      ? `<button class="btn btn-sm" onclick="installApp()">📲 Install app</button>`
      : `<button class="btn btn-sm" onclick="toggleInstallHelp()">📲 Add to Home Screen</button>`
  }${deferredInstall ? '' : help}</div>`;
}
// Compares the build marker of the copy running right now with the live one on
// the server; if they differ, offers a refresh. (Skipped on the unbuilt source.)
let lastUpdateCheck = 0;
function checkForUpdate(){
  try{
    const now = Date.now();
    if(updateReady || now - lastUpdateCheck < 60000) return;
    const mine = (document.querySelector('meta[name=md-build]')||{}).content;
    if(!mine || mine === '__BUILD' + '__') return;
    lastUpdateCheck = now;
    fetch('index.html?md-check=' + now, {cache:'no-store'})
      .then(r=> r.ok ? r.text() : '')
      .then(t=>{
        const m = /<meta name="md-build" content="([^"]+)"/.exec(t);
        if(m && m[1] !== mine){ updateReady = true; render(); }
      }).catch(()=>{});
  }catch(e){}
}
function updateToastHtml(){
  return updateReady ? `<div class="update-toast"><span>✨ A new version is ready.</span><button class="btn btn-sm" onclick="location.reload()">Refresh</button></div>` : '';
}

function renderLoading(){
  return `
  <div class="login-wrap">
    <div class="brand"><span class="ball">${SPORT.icon}</span><div><h1>Matchday Draft</h1></div></div>
    <div class="login-foot" style="margin:-10px 0 14px;">${themeBtnHtml()}</div>
    <div class="login-card"><p class="login-sub" style="margin:0;">${slowConnect ? 'Still connecting… check your internet connection, this can take a moment.' : 'Connecting…'}</p></div>
  </div>`;
}
function renderLogin(){
  const hostBox = showHostCode ? `
    <div class="login-row" style="margin-top:10px;">
      <input type="password" id="hostCodeInput" placeholder="Host code" autocomplete="off" value="${esc(hostCodeDraft)}"
        oninput="hostCodeDraft=this.value" onkeydown="if(event.key==='Enter'){ submitHostCode(); }">
      <button class="btn" onclick="submitHostCode()">Unlock</button>
    </div>
    ${hostCodeError ? `<div class="login-err">That code isn't right.</div>` : ''}
    <div class="login-foot"><button class="btn btn-ghost btn-sm" onclick="toggleHostCode()">Cancel</button></div>
  ` : `<div class="login-foot"><button class="btn btn-ghost btn-sm" onclick="toggleHostCode()">I'm the host</button></div>`;
  const step = currentPinStep();
  if(step){
    return `
  <div class="login-wrap">
    <div class="brand"><span class="ball">${SPORT.icon}</span><div><h1>Matchday Draft</h1></div></div>
    <div class="login-card">
      <h2>Enter your PIN</h2>
      <p class="login-sub">Hi <b>${esc(step.name)}</b> — your name is protected with a 4-digit PIN.</p>
      <div class="login-row">
        <input type="password" class="field-input grow pin-input" id="pinInput" data-af inputmode="numeric" pattern="[0-9]*" maxlength="4" autocomplete="off" placeholder="••••" value="${esc(pinDraft)}"
          oninput="pinDraft=this.value.replace(/\D/g,'').slice(0,4); if(pinDraft.length===4) submitPin();" onkeydown="if(event.key==='Enter'){ submitPin(); }">
        <button class="btn btn-primary" onclick="submitPin()">Enter</button>
      </div>
      ${pinError ? `<div class="login-err">${esc(pinError)}</div>` : ''}
      <div class="login-foot"><button class="btn btn-ghost btn-sm" onclick="pinCancel()">Not you? Back</button></div>
      <p class="login-sub" style="margin:12px 0 0; text-align:center;">Forgot it? Ask the host to reset it.</p>
    </div>
    <div class="login-foot">${themeBtnHtml()}</div>
    ${updateToastHtml()}
  </div>`;
  }
  return `
  <div class="login-wrap">
    <div class="brand"><span class="ball">${SPORT.icon}</span><div><h1>Matchday Draft</h1></div></div>
    <div class="login-card">
      <h2>Log in</h2>
      ${pendingVote ? `<p class="login-sub" style="color:var(--chalk); font-weight:600;">📊 Log in once and your poll answer saves straight away.</p>` : ''}
      <p class="login-sub">Type your name — the same one the host added you with. No password needed.</p>
      <div class="login-row">
        <input type="text" id="loginNameInput" placeholder="Your name" autocomplete="off" autocapitalize="words" value="${esc(loginDraft)}"
          oninput="loginDraft=this.value" onkeydown="if(event.key==='Enter'){ submitLogin(); }">
        <button class="btn btn-primary" onclick="submitLogin()">Enter</button>
      </div>
      ${loginError ? `<div class="login-err">${esc(loginError)}</div>` : ''}
      ${hostBox}
    </div>
    <div class="login-foot">${themeBtnHtml()}</div>
    <div class="login-foot" style="margin-top:8px;">${installBtnHtml()}</div>
    ${updateToastHtml()}
  </div>`;
}

function render(){
  if(DRAG.mode || DRAG.pending){ DRAG.pendingRender = true; return; }   // never swap the page out from under a finger
  syncSport();
  enforceMyGames();
  schedulePollReconcile();
  const app = document.getElementById('app');
  document.body.classList.toggle('is-host', isHost());
  const pageScrollY = window.scrollY;
  const openModal = document.querySelector('.modal-backdrop');
  const modalScrollTop = openModal ? openModal.scrollTop : null;
  // keep the cursor in a login box if a live update re-renders mid-typing
  const ae = document.activeElement;
  const keepId = (ae && (ae.id==='loginNameInput' || ae.id==='hostCodeInput' || ae.id==='dbSearchInput' || ae.id==='setupSearchInput' || ae.id==='pinInput' || ae.id==='pinSetInput' || ae.id==='hostConfirmInput' || ae.id==='pollQInput' || ae.id==='pollCustomInput' || ae.id==='pollMaxInput' || ae.id==='newGameName' || ae.id==='payUpiInput' || ae.id==='payNameInput' || ae.id==='bidInput_a' || ae.id==='bidInput_b')) ? ae.id : null;
  const keepPos = keepId ? ae.selectionStart : null;

  if(!(dbReady && rosterLoaded && (pinsLoaded || !db))){ app.innerHTML = renderLoading(); return; }
  if(loginRequired()){
    app.innerHTML = renderLogin();
    if(keepId){
      const el = document.getElementById(keepId);
      if(el){ el.focus(); try{ el.setSelectionRange(keepPos, keepPos); }catch(e){} }
    }else autoFocusEl();
    return;
  }
  if(shouldOfferPin() && pinOfferedFor !== pinKey(getLoginName())){ pinOfferedFor = pinKey(getLoginName()); pinModalOpen = true; }

  const pg = currentPage();
  app.innerHTML = renderTopbar() + renderPageNav() + renderTurnBanner() + ((pg==='home' && !(gamePickerOpen || needsGamePick()) && !friendBlockedHere()) ? renderProgress() : '') + renderBanner()
    + hostLockBannerHtml() + ((gamePickerOpen || needsGamePick()) ? renderGamePicker() : (friendBlockedHere() ? `<div class="waiting-note" style="margin:30px 0;">Opening your game…</div>` : (pg==='profile' ? renderProfilePage() : pg==='leaderboard' ? renderLeaderboardPage() : (liveCardHtml() + myPayCardHtml('home') + hostPaySummaryHtml() + renderPollCard() + renderBody()))))
    + renderHistoryModal() + renderDatabaseModal() + renderLogMatchModal() + renderSquadManagerModal()
    + renderAttendanceModal() + renderProfilePicker() + renderBackupModal() + renderPollForm() + renderPaymentsModal() + renderFeeEditor() + renderLiveAsk() + renderOverflowAsk() + renderStatsModal() + renderResultCardModal() + renderPinModal() + updateToastHtml() + deniedToastHtml() + infoToastHtml();
  if(keepId){
    const el = document.getElementById(keepId);
    if(el){ el.focus(); try{ el.setSelectionRange(keepPos, keepPos); }catch(e){} }
  }else autoFocusEl();

  window.scrollTo(0, pageScrollY);
  if(modalScrollTop != null){
    const newModal = document.querySelector('.modal-backdrop');
    if(newModal) newModal.scrollTop = modalScrollTop;
  }
  checkTurnAlert();
  if(pendingVote && pollVotesLoaded && getMyPlayerId() && (!db || matchLoadedFor===currentSquadId)) setTimeout(applyPendingVote, 0);
  else if(!pendingVote && document.getElementById('pollCard')) markPollSeen();
  if(scrollToPay && rosterLoaded && getMyPlayerId() && (!db || historyLoadedFor===currentSquadId)){
    const pc = document.getElementById('payCard');
    scrollToPay = false;
    if(pc) setTimeout(()=>{ try{ pc.scrollIntoView({behavior:'smooth', block:'start'}); }catch(e){} }, 50);
    else showInfo('Nothing to pay right now ✓');
  }
  if(scrollToPoll){
    const pc = document.getElementById('pollCard');
    if(pc){ scrollToPoll = false; setTimeout(()=>{ try{ pc.scrollIntoView({behavior:'smooth', block:'start'}); }catch(e){} }, 50); }
  }
}
function autoFocusEl(){
  const el = document.querySelector('[data-af]');
  if(el && (!document.activeElement || document.activeElement===document.body)){ try{ el.focus(); }catch(e){} }
}

function currentSquadName(){
  const sq = squadsList.find(s=>s.id===currentSquadId);
  return sq ? sq.name : 'My Squad';
}

function currentPage(){ return profileId ? 'profile' : (showAwards ? 'leaderboard' : 'home'); }
function goHome(){ showAwards=false; showAwardsCard=false; profileId=null; render(); window.scrollTo(0,0); }
function goLeaderboard(){ profileId=null; showAwards=true; showAwardsCard=false; render(); window.scrollTo(0,0); }
function goMyProfile(){ const id=getMyPlayerId(); if(!id) return; showAwards=false; openProfile(id); }
function renderPageNav(){
  const pg = currentPage();
  const me = getMyPlayerId();
  const dot = (me && incomingRequests(me).length) ? ' <span style="color:var(--danger);">●</span>' : '';
  const myActive = pg==='profile' && me && profileId===me;
  return `<nav class="pg-nav">
    <button class="${pg==='home'?'active':''}" onclick="goHome()">${SPORT.icon} Matchday${pollNeedsMyAnswer() ? ' <span style="color:var(--danger);">●</span>' : ''}</button>
    <button class="${pg==='leaderboard'?'active':''}" onclick="goLeaderboard()">🏆 Leaderboard</button>
    ${isHost()
      ? `<button class="${pg==='profile'?'active':''}" onclick="toggleProfilePicker()">👤 Profiles</button>`
      : (me ? `<button class="${myActive?'active':''}" onclick="goMyProfile()">👤 My profile${dot}</button>` : '')}
  </nav>`;
}
function renderTopbar(){
  return `
  <div class="topbar">
    <div class="brand">
      <span class="ball">${SPORT.icon}</span>
      <div>
        <h1>Matchday Draft</h1>
        <small>${isHost() ? esc(currentSquadName()) + ' · ' : ''}${esc(String(S.format))}v${esc(String(S.format))} · ${S.mode ? esc(S.mode) : 'no mode yet'}</small>
      </div>
    </div>
    <div class="row" style="gap:8px;">
      ${(isHost() || myGames().length>1) ? `<button type="button" class="game-chip" title="Switch game" onclick="openGamePicker()">${SPORT.icon} ${esc(isHost() ? currentSquadName() : SPORT.name)} ▾</button>` : ''}
      ${isHost() ? `<button class="btn btn-ghost btn-sm" onclick="toggleSquadManager()">⚙</button>` : ''}
      ${isHost() ? `<button class="btn btn-ghost btn-sm" onclick="toggleDatabase()">🗂 Database</button>` : ''}
      ${isHost() ? `<button class="btn btn-ghost btn-sm" onclick="toggleLogMatch()">📝 Log match</button>` : ''}
      ${isHost() ? `<button class="btn btn-ghost btn-sm" onclick="toggleAttendance()">📋 Attendance</button>` : ''}
      ${isHost() ? `<button class="btn btn-ghost btn-sm" onclick="toggleBackup()">💾 Backup</button>` : ''}
      ${isHost() ? `<button class="btn btn-ghost btn-sm" onclick="toggleStats()">📈 Numbers</button>` : ''}
      ${isHost() ? `<button class="btn btn-ghost btn-sm" onclick="togglePayments()">💰 Payments</button>` : ''}
      ${themeBtnHtml()}
      ${isHost() ? `<button class="btn btn-ghost btn-sm" onclick="toggleHistory()">📜 Past matches${HISTORY.length? ' ('+HISTORY.length+')':''}</button>` : ''}
      ${isHost() ? `
      <span class="chip" style="cursor:default;">Host</span>
      ${(isHostDevice && db) ? `<button class="btn btn-ghost btn-sm" onclick="releaseHost()" title="Log out of host mode on this device">Step down</button>` : ''}
      ` : `
      <span class="chip" style="cursor:default;">${esc(myRoleLabel())}</span>
      <button class="btn btn-ghost btn-sm" onclick="logout()">Log out</button>
      `}
    </div>
  </div>`;
}

function renderProgress(){
  const cur = phaseStepKey(S.phase);
  const order = PHASE_STEPS.map(s=>s.key);
  const curIdx = order.indexOf(cur);
  return `<div class="progress-strip">${
    PHASE_STEPS.map((s,i)=>{
      let cls = 'step';
      if(i===curIdx) cls += ' active';
      else if(i<curIdx) cls += ' done';
      return `<div class="${cls}">${esc(s.label)}</div>`;
    }).join('')
  }</div>`;
}

function renderBanner(){
  if(!db){
    return `<div class="banner amber">Playing solo on this device — live sync to other phones isn't switched on here, but everything below still works on this phone.</div>`;
  }
  let out = '';
  if(!isHost() && myTeamRole() && !PINS[pinKey(getLoginName())]){
    out += `<div class="banner amber" style="display:flex; align-items:center; justify-content:space-between; gap:10px;"><span>🔑 You're a captain — set a 4-digit PIN so nobody else can bid as you.</span><button class="btn btn-sm" onclick="openPinModal()">Set PIN</button></div>`;
  }
  out += renderRivalBanner();
  return out;
}

function isHost(){ return isHostDevice || (dbReady && !db); }

function renderBody(){
  switch(S.phase){
    case 'setup': return renderSetup();
    case 'mode': return renderModeChoice();
    case 'random': return renderRandom();
    case 'captains': return renderCaptainsPick();
    case 'budget': return renderBudget();
    case 'auction': return renderAuction();
    case 'complete': return renderComplete();
    default: return renderSetup();
  }
}

/* ---- shared: database row / edit panel / chemistry panel ---- */
function editPanelHtml(p){
  const attrs = attributesOf(p.id);
  return `
    <div class="edit-panel">
      <div class="edit-label">Position(s)</div>
      <div class="chip-toggle-row">
        ${POSITION_ORDER.map(pos=>`<button type="button" class="chip-toggle ${(p.positions||[]).includes(pos)?'active':''}" onclick="togglePlayerPosition('${p.id}','${pos}')">${POSITIONS[pos].label}</button>`).join('')}
      </div>
      <div class="edit-label">Special attributes (tap again for +)</div>
      <div class="chip-toggle-row">
        ${ATTRIBUTE_ORDER.map(a=>{
          const lvl = attrs[a]||0;
          return `<button type="button" class="chip-toggle ${lvl>0?'active':''} ${lvl===2?'plus':''}" onclick="togglePlayerAttribute('${p.id}','${a}')">${attrChipLabel(a,lvl)}</button>`;
        }).join('')}
      </div>
      <div class="edit-label">Standout quality</div>
      <div class="chip-toggle-row">
        <button type="button" class="chip-toggle star-toggle ${p.star?'active':''}" onclick="togglePlayerStar('${p.id}')">⭐ Star player — huge quality gap over the rest</button>
      </div>
      <div class="edit-label">Availability</div>
      <div class="chip-toggle-row">
        <button type="button" class="chip-toggle ${p.unavailable?'active':''}" onclick="toggleUnavailable('${p.id}')">🚫 Unavailable — hide from the match-day picker for now</button>
      </div>
      ${hasPin(p.name) ? `
      <div class="edit-label">Login PIN</div>
      <div class="chip-toggle-row">
        <button type="button" class="chip-toggle ${pinResetArm===p.id?'active':''}" onclick="hostResetPin('${p.id}')">${pinResetArm===p.id ? 'Tap again to confirm reset' : '🔑 Reset PIN — they forgot it'}</button>
      </div>` : ''}
    </div>`;
}

function playerRowHtml(p, i, ranked, total){
  return `
    <li class="player-row-wrap" ${ranked && isHost() && !dbFilterActive() ? `data-rank-id="${p.id}"` : ''} style="${p.unavailable?'opacity:.55;':''}">
      <div class="player-row">
        ${ranked && isHost() && !dbFilterActive() ? `<span class="drag-handle" title="Drag to move up or down" aria-label="Drag to reorder">⠿</span>` : ''}
        ${ranked
          ? `<span class="rank-badge">#${i+1}</span><span class="ability-bar"><i style="width:${Math.round((i/Math.max(1,(total||1)-1))*100)}%"></i></span>`
          : `<span class="rank-badge">?</span>`}
        <span class="badge-row">${posBadges(p.id)}${starBadge(p.id)}${chemBadge(p.id)}</span>
        <span class="player-name">${esc(p.name)}${p.unavailable ? ' <span class="chip" style="padding:2px 8px; font-size:.7rem;">Unavailable</span>' : ''}</span>
        ${isHost() ? `
        <span class="row-controls">
          <button class="icon-btn" title="${p.unavailable?'Mark available':'Mark unavailable'}" onclick="toggleUnavailable('${p.id}')">${p.unavailable?'✅':'🚫'}</button>
          <button class="icon-btn" title="Edit position / attributes" onclick="toggleEditPanel('${p.id}')">✎</button>
          ${ranked ? (dbFilterActive() ? '' : `
          <button class="icon-btn" title="Weaker" onclick="movePlayer('${p.id}',-1)" ${i===0?'disabled':''}>▲</button>
          <button class="icon-btn" title="Stronger" onclick="movePlayer('${p.id}',1)" ${i===(total-1)?'disabled':''}>▼</button>
          `) : `<button class="btn btn-sm" onclick="rankPlayerNow('${p.id}')">Rank now</button>`}
          <button class="icon-btn" title="Remove from database" onclick="removePlayer('${p.id}')">✕</button>
        </span>` : ''}
      </div>
      ${attrChips(p.id)}
      ${statsLine(p.id)}
      ${isHost() && editingPlayerId===p.id ? editPanelHtml(p) : ''}
    </li>`;
}

function renderChemistryPanel(){
  if(!isHost()) return '';
  const all = rosterPlayersArr(); // guests are one-off — not eligible for a standing chemistry link
  if(all.length<2) return '';
  const groups = SQUAD.chemistryGroups||[];
  return `
  <div class="panel-title" style="font-size:1.3rem; margin-top:16px;">Chemistry links</div>
  <div class="panel-sub">Tick two or more players who play well together — random splits (and mid-draft randomizing) will try to keep them on the same team. Regulars who win three matches together get linked automatically.</div>
  <div class="chip-toggle-row" style="margin-bottom:10px;">
    ${all.map(p=>`<button type="button" class="chip-toggle ${chemSelection.includes(p.id)?'active':''}" onclick="toggleChemSelect('${p.id}')">${esc(p.name)}</button>`).join('')}
  </div>
  <button class="btn btn-sm" ${chemSelection.length<2?'disabled':''} onclick="linkChemistry()">🔗 Link selected (${chemSelection.length})</button>
  ${groups.length ? `
  <div style="margin-top:14px; display:flex; flex-direction:column; gap:6px;">
    ${groups.map((g,i)=>`
      <div class="row" style="justify-content:space-between; background:var(--panel-2); border:1px solid var(--line); border-radius:var(--radius-sm); padding:8px 12px;">
        <span>🔗 ${g.map(id=>esc(playerName(id))).join(', ')}</span>
        <button class="icon-btn" title="Unlink" onclick="unlinkChemistry(${i})">✕</button>
      </div>`).join('')}
  </div>` : ''}`;
}

/* ---- monthly awards: golden boot, leaderboard and streaks all reset each
   calendar month, computed straight from this squad's match history rather
   than a lifetime counter (rank/chemistry stay cumulative — only the
   "awards" board is scoped to one month at a time). ---- */
function yearMonthOf(dateStr){
  const d = new Date(dateStr);
  if(isNaN(d)) return null;
  return d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0');
}
function currentYearMonth(){ return yearMonthOf(new Date().toISOString()); }
function formatYearMonth(ym){
  const [y,m] = ym.split('-').map(Number);
  return new Date(y, m-1, 1).toLocaleDateString(undefined, {month:'long', year:'numeric'});
}
function shiftYearMonth(ym, delta){
  const [y,m] = ym.split('-').map(Number);
  const d = new Date(y, m-1+delta, 1);
  return d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0');
}
function statsMonthPrev(){ statsMonth = shiftYearMonth(statsMonth||currentYearMonth(), -1); render(); }
function statsMonthNext(){ statsMonth = shiftYearMonth(statsMonth||currentYearMonth(), 1); render(); }
function statsMonthReset(){ statsMonth = null; render(); }

function historyForMonth(month){
  if(Array.isArray(month)) return month;      // already a list of matches (season / all-time views)
  return HISTORY.filter(h=> yearMonthOf(h.date)===month);
}
// Tallies played/win/loss/draw/goals/assists per player from just this
// month's matches — independent of SQUAD.stats, which stays a lifetime
// total. Guests are deliberately excluded so a one-off fill-in never shows
// up on the leaderboard.
function computeMonthlyStats(month){
  const stats = {};
  const bump = (id,key)=>{
    if(isGuest(id)) return;
    stats[id] = stats[id] || {played:0,wins:0,losses:0,draws:0,goals:0,assists:0};
    stats[id][key]++;
  };
  historyForMonth(month).forEach(h=>{
    const teamAIds = h.teamAIds||[], teamBIds = h.teamBIds||[];
    teamAIds.concat(teamBIds).forEach(id=> bump(id,'played'));
    if(h.winner==='a'){ teamAIds.forEach(id=>bump(id,'wins')); teamBIds.forEach(id=>bump(id,'losses')); }
    else if(h.winner==='b'){ teamBIds.forEach(id=>bump(id,'wins')); teamAIds.forEach(id=>bump(id,'losses')); }
    else if(h.winner==='draw'){ teamAIds.concat(teamBIds).forEach(id=>bump(id,'draws')); }
    (h.scorers||[]).forEach(s=>{
      if(!s.playerId || !s.goals || isGuest(s.playerId)) return;
      stats[s.playerId] = stats[s.playerId] || {played:0,wins:0,losses:0,draws:0,goals:0,assists:0};
      stats[s.playerId].goals += s.goals;
    });
    (h.assists||[]).forEach(a=>{
      if(!a.playerId || !a.assists || isGuest(a.playerId)) return;
      stats[a.playerId] = stats[a.playerId] || {played:0,wins:0,losses:0,draws:0,goals:0,assists:0};
      stats[a.playerId].assists += a.assists;
    });
  });
  return stats;
}

/* ---- Player of the match: voted by anyone who played that day, one team
   at a time — not picked by the host. Votes live on the history entry
   itself ({potmVotes:{a:{voterId:candidateId}, b:{...}}}), so they sync and
   persist just like the rest of the match record. ---- */
function computePotmTally(h, team){
  const votes = ((h&&h.potmVotes)||{})[team] || {};
  const tally = {};
  Object.values(votes).forEach(candidateId=>{ tally[candidateId] = (tally[candidateId]||0)+1; });
  return tally;
}
function computePotmWinner(h, team){
  const tally = computePotmTally(h, team);
  const ids = Object.keys(tally);
  if(!ids.length) return null;
  const max = Math.max(...ids.map(id=>tally[id]));
  const leaders = ids.filter(id=>tally[id]===max);
  return {leaders, count:max, tied: leaders.length>1};
}
function castPotmVote(historyId, team, candidateId){
  const myId = getMyPlayerId();
  const h = HISTORY.find(x=>x.id===historyId);
  if(!h || !myId) return;
  const participants = (h.teamAIds||[]).concat(h.teamBIds||[]);
  if(!participants.includes(myId)) return; // only those who actually played that day get a say
  const candidates = team==='a' ? (h.teamAIds||[]) : (h.teamBIds||[]);
  if(!candidates.includes(candidateId)) return;
  const potmVotes = Object.assign({a:{}, b:{}}, h.potmVotes);
  potmVotes[team] = Object.assign({}, potmVotes[team], {[myId]: candidateId});
  updateHistoryResult(historyId, {potmVotes});
}
function potmVotingHtml(h){
  if(!h) return '';
  const myId = getMyPlayerId();
  const participants = (h.teamAIds||[]).concat(h.teamBIds||[]);
  const canVote = !!myId && participants.includes(myId);
  function teamBlock(team, ids){
    if(!ids.length) return '';
    const votes = ((h.potmVotes||{})[team]) || {};
    const myVote = myId ? votes[myId] : null;
    const winner = computePotmWinner(h, team);
    return `
    <div style="flex:1; min-width:180px;">
      <div class="edit-label">Team ${team.toUpperCase()}</div>
      <div class="chip-toggle-row">
        ${ids.map(id=>{
          const count = Object.values(votes).filter(v=>v===id).length;
          return `<button type="button" class="chip-toggle ${myVote===id?'active':''}" ${canVote?`onclick="castPotmVote('${h.id}','${team}','${id}')"`:'disabled'}>${esc(playerName(id))}${count?' ('+count+')':''}</button>`;
        }).join('')}
      </div>
      ${winner ? `<div class="panel-sub" style="margin-top:4px;">🏅 ${winner.tied ? 'Tied: '+winner.leaders.map(id=>esc(playerName(id))).join(' & ') : esc(playerName(winner.leaders[0]))} (${winner.count} vote${winner.count===1?'':'s'})</div>` : ''}
    </div>`;
  }
  return `
  <div class="panel">
    <div class="row" style="justify-content:space-between; gap:8px;"><div class="panel-title" style="font-size:1.1rem; margin:0;">🏅 Player of the match</div>${resultCardBtn(h)}</div>
    <div class="panel-sub">${canVote ? "Voted by whoever played that day — tap your pick for each team." : "Only players who took part in this match get a vote."}</div>
    <div class="row" style="gap:16px; flex-wrap:wrap; margin-top:6px;">
      ${teamBlock('a', h.teamAIds||[])}
      ${teamBlock('b', h.teamBIds||[])}
    </div>
  </div>`;
}
// Tallies undisputed (non-tied) POTM wins per player across a month, for
// the awards leaderboard — a tie contributes to nobody's count.
function computeMonthlyPotmCounts(month){
  const counts = {};
  historyForMonth(month).forEach(h=>{
    ['a','b'].forEach(team=>{
      const w = computePotmWinner(h, team);
      if(w && !w.tied && !isGuest(w.leaders[0])){
        counts[w.leaders[0]] = (counts[w.leaders[0]]||0) + 1;
      }
    });
  });
  return counts;
}
// Current form within the selected month only — streaks reset each month
// along with everything else on the awards board.
function computeStreak(id, month){
  let streak = 0, type = null;
  for(const h of historyForMonth(month)){
    const inA = (h.teamAIds||[]).includes(id), inB = (h.teamBIds||[]).includes(id);
    if(!inA && !inB) continue;
    if(!h.winner) break;
    const won = (inA && h.winner==='a') || (inB && h.winner==='b');
    const lost = (inA && h.winner==='b') || (inB && h.winner==='a');
    const cur = won ? 'W' : lost ? 'L' : 'D';
    if(type===null){ type = cur; streak = 1; }
    else if(cur===type){ streak++; }
    else break;
  }
  return (type==='W' || type==='L') && streak>=2 ? {type, streak} : null;
}
function streakBadge(id, month){
  const s = computeStreak(id, month);
  if(!s) return '';
  return s.type==='W'
    ? `<span class="mono" style="color:var(--good);"> 🔥${s.streak}W</span>`
    : `<span class="mono" style="color:var(--danger);"> ❄️${s.streak}L</span>`;
}

function renderPodiumHtml(sorted, monthly){
  const top = sorted.slice(0,3);
  if(!top.length) return '';
  const medals = ['🥇','🥈','🥉'];
  const card = (i)=>{
    const id = top[i]; if(!id) return '<div></div>';
    const s = monthly[id];
    const wr = s.played ? Math.round(100*s.wins/s.played) : 0;
    return `<div class="pod ${i===0?'first':''}"><div class="medal">${i===0?'👑':medals[i]}</div><div class="pod-av">${esc((playerName(id)||'?').trim().charAt(0).toUpperCase())}</div><div class="pn">${nameLink(id)}</div><div class="pod-pos">${posBadges(id)}</div><div class="pw">${wr}%</div><div class="ps">${s.wins}W · ${s.played}P</div></div>`;
  };
  // classic podium order: 2nd, 1st, 3rd
  return `<div class="podium">${card(1)}${card(0)}${card(2)}</div>`;
}
function renderStatsTable(){
  const sc = statsScopeInfo();
  const monthly = computeMonthlyStats(sc.entries);
  const ids = Object.keys(monthly);
  const rate = id=> monthly[id].played ? monthly[id].wins/monthly[id].played : 0;
  const sorted = ids.slice().sort((x,y)=> (monthly[y].wins - monthly[x].wins) || (rate(y) - rate(x)) || (monthly[y].goals - monthly[x].goals) || playerName(x).localeCompare(playerName(y)));
  const topScorer = ids.slice().sort((x,y)=> monthly[y].goals - monthly[x].goals)[0];
  const topScorerGoals = topScorer ? monthly[topScorer].goals : 0;
  const topAssister = ids.slice().sort((x,y)=> monthly[y].assists - monthly[x].assists)[0];
  const topAssisterCount = topAssister ? monthly[topAssister].assists : 0;
  const potmCounts = computeMonthlyPotmCounts(sc.entries);
  const potmIds = Object.keys(potmCounts);
  const topPotm = potmIds.slice().sort((x,y)=>potmCounts[y]-potmCounts[x])[0];
  const topPotmCount = topPotm ? potmCounts[topPotm] : 0;
  const nav = sc.kind==='month' ? `
      <button class="icon-btn" title="Previous month" onclick="statsMonthPrev()">◂</button>
      ${statsMonth && statsMonth!==currentYearMonth() ? `<button class="btn btn-sm" onclick="statsMonthReset()">Today</button>` : ''}
      <button class="icon-btn" title="Next month" onclick="statsMonthNext()">▸</button>`
    : sc.kind==='season' ? `
      <button class="icon-btn" title="Previous season" onclick="statsSeasonPrev()">◂</button>
      ${statsSeason && statsSeason!==String(new Date().getFullYear()) ? `<button class="btn btn-sm" onclick="statsSeasonReset()">This year</button>` : ''}
      <button class="icon-btn" title="Next season" onclick="statsSeasonNext()">▸</button>`
    : `<span class="panel-sub" style="margin:0;">${sc.entries.length} match${sc.entries.length===1?'':'es'}${HISTORY.length>=200 ? ' (latest 200)' : ''}</span>`;
  return `
  <div class="row" style="justify-content:space-between; align-items:center;">
    <div class="panel-title" style="font-size:1.3rem; margin-bottom:0;">${esc(sc.title)}</div>
    <span class="row-controls">${nav}</span>
  </div>
  ${!ids.length ? `<div class="empty-note" style="margin-top:8px;">${esc(sc.empty)}</div>` : `
  ${sc.kind!=='month' ? renderRecordsHtml(sc.entries, sc.kind) : ''}
  ${sc.kind==='month' && topScorerGoals>0 ? `<div class="panel-sub" style="margin:8px 0 2px;">${SPORT.s1.awardIcon} ${SPORT.s1.award}: <b style="color:var(--chalk);">${nameLink(topScorer)}</b> — ${s1Text(topScorerGoals)}</div>` : ''}
  ${sc.kind==='month' && topAssisterCount>0 ? `<div class="panel-sub" style="margin:2px 0;">${SPORT.s2.awardIcon} ${SPORT.s2.award}: <b style="color:var(--chalk);">${nameLink(topAssister)}</b> — ${s2Text(topAssisterCount)}</div>` : ''}
  ${sc.kind==='month' && topPotmCount>0 ? `<div class="panel-sub" style="margin:2px 0 8px;">🏅 Most POTMs: <b style="color:var(--chalk);">${nameLink(topPotm)}</b> — ${topPotmCount}</div>` : ''}
  ${renderPodiumHtml(sorted, monthly)}
  <div class="stand-wrap"><div class="stand">
    <div class="stand-row head"><span>#</span><span>Player</span><span class="num">P</span><span class="num">W</span><span class="num">D</span><span class="num">L</span><span class="num">${SPORT.s1.col}</span><span class="num">${SPORT.s2.col}</span><span>Win rate</span></div>
    ${sorted.map((id,i)=>{
      const s = monthly[id];
      const wr = s.played ? Math.round(100*s.wins/s.played) : 0;
      return `<div class="stand-row">
        <span class="rk">${['🥇','🥈','🥉'][i] || (i+1)}</span>
        <span class="nm">${nameLink(id)} ${posBadges(id)}${starBadge(id)}${potmCounts[id]?' 🏅'+potmCounts[id]:''}${streakBadge(id, sc.entries)}</span>
        <span class="num">${s.played}</span><span class="num" style="color:var(--good);">${s.wins}</span><span class="num">${s.draws}</span><span class="num" style="color:var(--danger);">${s.losses}</span><span class="num">${s.goals}</span><span class="num">${s.assists}</span>
        <span class="wr"><span class="wr-bar"><i style="width:${wr}%"></i></span>${wr}%</span>
      </div>`;
    }).join('')}
  </div></div>
  </div>`}`;
}

function renderAddPlayerForm(){
  if(!isHost()) return '';
  const squadNames = allPlayersArr().map(p=>`<option value="${esc(p.name)}">`).join('');
  return `
    <form onsubmit="event.preventDefault(); submitAddPlayer();">
      <div class="row" style="margin-bottom:10px;">
        <div class="grow">
          <input type="text" id="addNameInput" list="squadNames" placeholder="Player name" autocomplete="off" oninput="autofillFromSquad(this.value)">
          <datalist id="squadNames">${squadNames}</datalist>
        </div>
        <button class="btn btn-primary" type="submit">+ Add to database</button>
      </div>
      <div class="field" style="margin-bottom:8px;">
        <label>Position(s)</label>
        <div class="chip-toggle-row">
          ${POSITION_ORDER.map(pos=>`<button type="button" class="chip-toggle add-pos-chip ${addForm.positions.includes(pos)?'active':''}" data-pos="${pos}" onclick="toggleAddPosition('${pos}', this)">${POSITIONS[pos].label}</button>`).join('')}
        </div>
      </div>
      <div class="field" style="margin-bottom:10px;">
        <label>Special attributes (tap again for +)</label>
        <div class="chip-toggle-row">
          ${ATTRIBUTE_ORDER.map(a=>{
            const lvl = addForm.attributes[a]||0;
            return `<button type="button" class="chip-toggle add-attr-chip ${lvl>0?'active':''} ${lvl===2?'plus':''}" data-attr="${a}" onclick="cycleAddAttribute('${a}', this)">${attrChipLabel(a,lvl)}</button>`;
          }).join('')}
        </div>
      </div>
      <div class="row" style="gap:8px;">
        <button type="button" class="chip-toggle add-unknown-chip ${addForm.unknown?'active':''}" onclick="toggleAddUnknown(this)">❔ Don't know their ability yet</button>
        <button type="button" class="chip-toggle add-star-chip ${addForm.star?'active':''}" onclick="toggleAddStar(this)">⭐ Star player</button>
      </div>
    </form>
    <div style="height:6px;"></div>`;
}

