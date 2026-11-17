/* ============================= Player profile ============================= */
function openProfile(id, tab){
  if(!id || !findPlayer(id)) return;
  showHistory = false; showAttendance = false; profilePickerOpen = false;
  if(profileId !== id) profileMatchesAll = false;
  profileId = id; profileTab = tab || 'stats'; render(); window.scrollTo(0,0);
}
function closeProfile(){ profileId = null; render(); window.scrollTo(0,0); }
function toggleProfilePicker(){ profilePickerOpen = !profilePickerOpen; render(); }
function renderProfilePicker(){
  if(!profilePickerOpen) return '';
  const list = (SQUAD.players||[]).slice().sort((a,b)=>(a.name||'').localeCompare(b.name||''));
  return `
  <div class="modal-backdrop" onclick="if(event.target===this) toggleProfilePicker();">
    <div class="modal">
      <div class="row" style="justify-content:space-between; margin-bottom:10px;">
        <div class="panel-title" style="margin:0;">Player profiles</div>
        <button class="icon-btn" onclick="toggleProfilePicker()">✕</button>
      </div>
      <div class="hint" style="margin-bottom:10px;">Tap a player to see their stats, head-to-head record and rivalries.</div>
      ${list.length ? list.map(p=>`<button type="button" class="btn" style="width:100%; justify-content:flex-start; margin-bottom:6px;" onclick="profilePickerOpen=false; openProfile('${p.id}')">${esc(p.name)}</button>`).join('') : '<div class="hint">No players yet.</div>'}
    </div>
  </div>`;
}

// Everything below comes from saved match history, newest first.
function profileSportExtrasHtml(id){
  if(SPORT.key==='football' || SPORT.key==='pickleball') return '';
  let best1 = 0, best2 = 0, runsWithBalls = 0, balls = 0, catches = 0, ast = 0, games = 0;
  HISTORY.forEach(h=>{
    const A = h.teamAIds||[], B = h.teamBIds||[];
    if(!A.includes(id) && !B.includes(id)) return;
    games++;
    const g = (h.scorers||[]).filter(x=>x.playerId===id).reduce((n,x)=>n+(x.goals||0),0);
    const w = (h.assists||[]).filter(x=>x.playerId===id).reduce((n,x)=>n+(x.assists||0),0);
    const ex = (h.pstats||{})[id] || {};
    best1 = Math.max(best1, g); best2 = Math.max(best2, w);
    if(ex.b){ balls += ex.b; runsWithBalls += g; }
    catches += ex.c||0; ast += ex.ast||0;
  });
  if(!games) return '';
  const tile = (v,l)=>`<div class="pf-tile"><b>${v}</b><span>${l}</span></div>`;
  if(SPORT.key==='cricket'){
    return `<div class="pf-grid">${tile(best1,'Highest score')}${tile(best2 ? best2+' wkts' : '–','Best bowling')}${tile(balls ? Math.round(100*runsWithBalls/balls) : '–','Strike rate')}${tile(catches,'Catches')}</div>`;
  }
  return `<div class="pf-grid">${tile(best1,'Best game (pts)')}${tile(ast,'Assists')}${tile(games ? (ast/games).toFixed(1) : '–','Assists / game')}</div>`;
}
function computeProfile(id){
  const out = {played:0, wins:0, draws:0, losses:0, goals:0, assists:0, potm:0, form:[], mates:{}};
  HISTORY.forEach(h=>{
    const A = h.teamAIds||[], B = h.teamBIds||[];
    const inA = A.includes(id), inB = B.includes(id);
    if(!inA && !inB) return;
    out.played++;
    let res = null;
    if(h.winner==='draw') res = 'D';
    else if(h.winner==='a' || h.winner==='b') res = ((h.winner==='a') === inA) ? 'W' : 'L';
    if(res==='W') out.wins++; else if(res==='L') out.losses++; else if(res==='D') out.draws++;
    if(res && out.form.length < 5) out.form.push(res);
    (h.scorers||[]).forEach(s=>{ if(s.playerId===id) out.goals += (s.goals||0); });
    (h.assists||[]).forEach(a=>{ if(a.playerId===id) out.assists += (a.assists||0); });
    ['a','b'].forEach(t=>{ const w = computePotmWinner(h,t); if(w && !w.tied && w.leaders[0]===id) out.potm++; });
    if(res){
      (inA ? A : B).forEach(m=>{
        if(m===id || isGuest(m) || !findPlayer(m)) return;
        const r = out.mates[m] || (out.mates[m] = {g:0, w:0});
        r.g++; if(res==='W') r.w++;
      });
    }
  });
  return out;
}
const PROFILE_MATCHES_SHOWN = 5;
function potmLineHtml(h, me){
  const part = t=>{
    const w = computePotmWinner(h, t);
    if(!w) return null;
    const names = w.leaders.map(id=> id===me ? `<b>⭐ ${esc(playerName(id))}</b>` : esc(playerName(id))).join(' / ');
    return `${names} <small>(Team ${t.toUpperCase()}${w.tied?', tied':''})</small>`;
  };
  const bits = [part('a'), part('b')].filter(Boolean);
  return bits.length ? bits.join(' · ') : '<span style="color:var(--chalk-faint);">no votes yet</span>';
}
function priceLineHtml(h, id){
  if(h.mode!=='draft') return '';
  const cap = h.captainIds || {};
  if(cap.a===id || cap.b===id) return `<div class="pm-sub">🧢 Captain</div>`;
  if(!h.prices) return `<div class="pm-sub" style="color:var(--chalk-faint);">💰 Price not recorded (drafted before prices were saved)</div>`;
  const mine = h.prices[id];
  if(!mine) return '';
  if(mine.f) return `<div class="pm-sub">💰 Free pick (handed out when the auction was finished early)</div>`;
  const max = Math.max(0, ...Object.values(h.prices).map(x=>(x && !x.f) ? (x.p||0) : 0));
  const top = mine.p>0 && mine.p===max;
  return `<div class="pm-sub">💰 Bought for <b>₹${mine.p}</b>${top ? '<span class="hi-badge">Highest</span>' : ''}</div>`;
}
function profileMatchesHtml(p, isMe){
  const list = HISTORY.filter(h=>(h.teamAIds||[]).includes(p.id) || (h.teamBIds||[]).includes(p.id));
  const shown = profileMatchesAll ? list : list.slice(0, PROFILE_MATCHES_SHOWN);
  const rows = shown.map(h=>{
    const inA = (h.teamAIds||[]).includes(p.id);
    const side = inA ? 'a' : 'b';
    let res = 'N';
    if(h.winner==='draw') res = 'D';
    else if(h.winner==='a' || h.winner==='b') res = h.winner===side ? 'W' : 'L';
    const hasScore = h.scoreA!=null && h.scoreA!=='' && h.scoreB!=null && h.scoreB!=='';
    const score = hasScore ? `Team A ${teamScore(h,'a')} – ${teamScore(h,'b')} Team B`
      : (h.winner==='draw' ? SPORT.draw : h.winner==='a' ? 'Team A won' : h.winner==='b' ? 'Team B won' : 'No result yet');
    const g = (h.scorers||[]).filter(x=>x.playerId===p.id).reduce((n,x)=>n+(x.goals||0),0);
    const as = (h.assists||[]).filter(x=>x.playerId===p.id).reduce((n,x)=>n+(x.assists||0),0);
    const extra = playerMatchLine(h, p.id);
    const when = new Date(h.date).toLocaleDateString(undefined,{day:'numeric', month:'short'});
    return `<div class="pm-row">
      <span class="form-chip ${res}">${res==='N'?'–':res}</span>
      <div class="pm-main">
        <div class="pm-top">${esc(score)} <small>· ${esc(when)} · ${esc(matchModeLabel(h.mode))}</small></div>
        <div class="pm-sub">${isMe?'You':esc(p.name)} played for <b>Team ${side.toUpperCase()}</b>${extra ? ' · '+extra : ''}</div>
        <div class="pm-sub">🏅 Man of the match: ${potmLineHtml(h, p.id)}</div>
        ${h.winner ? `<div style="margin-top:6px;">${resultCardBtn(h, 'btn-ghost')}</div>` : ''}
        ${priceLineHtml(h, p.id)}
        ${isMe ? (()=>{
          const pv = h.potmVotes || {};
          const done = ['a','b'].every(t=> !(h[t==='a'?'teamAIds':'teamBIds']||[]).length || ((pv[t]||{})[p.id]));
          const open = profileVoteOpen===h.id;
          return `<button class="btn btn-sm ${done?'btn-ghost':''}" style="margin-top:6px;" onclick="profileVoteOpen=${open?'null':`'${h.id}'`}; render();">${open ? 'Close voting' : (done ? '🏅 Change your vote' : '🏅 Vote for man of the match')}</button>
          ${open ? `<div class="pm-vote">${potmVotingHtml(h)}</div>` : ''}`;
        })() : ''}
      </div>
    </div>`;
  }).join('');
  return `
      <div class="pf-section">Past matches${list.length ? ' ('+list.length+')' : ''}</div>
      ${list.length ? rows : `<div class="empty-note">No matches yet. A match shows up here once the host confirms the teams (random split) or the auction finishes, and the score and man of the match appear after the result is saved.</div>`}
      ${list.length > PROFILE_MATCHES_SHOWN ? `<button class="btn btn-sm btn-ghost" style="margin-top:6px;" onclick="profileMatchesAll=!profileMatchesAll; render();">${profileMatchesAll ? 'Show fewer' : 'Show all '+list.length}</button>` : ''}`;
}
function renderProfilePage(){
  if(!profileId) return '';
  const p = findPlayer(profileId);
  if(!p){ profileId = null; return renderBody(); }
  const s = computeProfile(p.id);
  const wr = s.played ? Math.round(100*s.wins/s.played) : 0;
  const isMe = !!db && getMyPlayerId()===p.id;
  const mates = Object.keys(s.mates).map(id=>({id, g:s.mates[id].g, w:s.mates[id].w}))
    .filter(m=>m.g>=2)
    .sort((x,y)=> (y.w/y.g - x.w/x.g) || (y.g - x.g) || playerName(x.id).localeCompare(playerName(y.id)))
    .slice(0,3);
  const idx = SQUAD.players.findIndex(x=>x.id===p.id);
  const hostLine = isHost() ? `<div class="host-detail" style="margin-top:10px;">${idx>=0 ? 'Rank #'+(idx+1)+' of '+SQUAD.players.length : 'Not ranked yet'}${p.star?' · ⭐ star player':''}${p.unavailable?' · unavailable':''}</div>` : '';
  const tile = (v,l)=>`<div class="pf-tile"><b>${v}</b><span>${l}</span></div>`;
  return `
  <button type="button" class="back-link" onclick="closeProfile()">◂ Back${showAwards ? ' to leaderboard' : ''}</button>
  <div class="page-card">
    <div>
      <div class="row" style="justify-content:space-between; align-items:flex-start;">
        <div class="pf-head">
          <div class="pf-avatar">${esc((p.name||'?').trim().charAt(0).toUpperCase())}</div>
          <div>
            <div class="pf-name">${esc(p.name)}</div>
            <div class="badge-row" style="margin-top:4px;">${posBadges(p.id)}${starBadge(p.id)}</div>
          </div>
        </div>
      </div>
      ${hostLine}
      ${profileTabsHtml(p, isMe)}
      ${profileTab==='rivals' ? rivalsTabHtml(p, isMe) : `
      ${s.played ? `
      <div class="pf-grid">
        ${tile(s.played,'Played')}${tile(wr+'%','Win rate')}${tile(s.wins+'-'+s.draws+'-'+s.losses,'W-D-L')}
        ${tile(s.goals,SPORT.s1.name)}${tile(s.assists,SPORT.s2.name)}${tile(s.potm,'POTM')}
      </div>
      ${s.played>0 && s.goals>0 ? `<div class="panel-sub" style="margin:6px 0 0;">${(s.goals/s.played).toFixed(1)} ${SPORT.s1.many} per match</div>` : ''}
      ${profileSportExtrasHtml(p.id)}
      <div class="pf-section">Recent form <span style="text-transform:none; letter-spacing:0;">(latest first)</span></div>
      ${s.form.length ? `<div class="form-row">${s.form.map(r=>`<span class="form-chip ${r}">${r}</span>`).join('')}</div>` : `<div class="empty-note">No results recorded yet.</div>`}
      <div class="pf-section">Best teammates</div>
      ${mates.length ? mates.map(m=>`
        <div class="mate-row">
          <div>${nameLink(m.id)}<small>${m.g} matches together · ${m.w} won</small></div>
          <div class="mate-pct">${Math.round(100*m.w/m.g)}%</div>
        </div>`).join('') : `<div class="empty-note">Play a couple more matches together to see who ${esc(p.name)} wins with.</div>`}
      ` : `<div class="empty-note" style="margin-top:14px;">No matches recorded for ${esc(p.name)} yet.</div>`}
      ${profileMatchesHtml(p, isMe)}
      ${(()=>{ const g = chemistryGroupOf(p.id); const links = g ? g.filter(x=>x!==p.id && findPlayer(x)) : [];
        return `<div class="pf-section">🔗 Chemistry link</div>` + (links.length
          ? `<div class="panel-sub" style="margin:0 0 6px;">${isMe?'You are':esc(p.name)+' is'} linked with these players, so the team split tries to keep them on the same side.</div>` + links.map(id=>`<div class="mate-row"><div>${nameLink(id)}</div><div class="mate-pct">🔗</div></div>`).join('')
          : `<div class="empty-note">No chemistry link set up for ${isMe?'you':esc(p.name)}.</div>`); })()}
      ${isMe ? attendanceLineHtml(p.id) : ''}
      ${isMe ? myPayCardHtml('profile') : ''}
      ${isMe ? `
      <div class="pf-section">Your login</div>
      <div class="row" style="gap:10px; flex-wrap:wrap;">
        <span class="panel-sub" style="margin:0;">${hasPin(p.name) ? '🔒 Protected with a PIN.' : 'No PIN yet — anyone could log in as you.'}</span>
        <button class="btn btn-sm" onclick="openPinModal()">${hasPin(p.name) ? 'Change PIN' : 'Set a PIN'}</button>
      </div>` : ''}
      ${(isHost() && !isMe && db && hasPin(p.name)) ? `
      <div class="pf-section">Host</div>
      <button class="btn btn-sm" onclick="hostResetPin('${p.id}')">${pinResetArm===p.id ? 'Tap again to confirm' : '🔑 Reset their PIN'}</button>` : ''}
      `}
    </div>
  </div>`;
}
function renderPinModal(){
  if(!pinModalOpen) return '';
  const name = getLoginName();
  if(!name || !db){ pinModalOpen = false; return ''; }
  const has = hasPin(name);
  return `
  <div class="modal-backdrop" onclick="if(event.target===this) closePinModal(false);">
    <div class="modal" style="max-width:380px;">
      <div class="row" style="justify-content:space-between; margin-bottom:4px;">
        <div class="panel-title" style="margin:0;">${has ? 'Change your PIN' : '🔑 Protect your name'}</div>
        <button class="icon-btn" onclick="closePinModal(false)">✕</button>
      </div>
      <p class="panel-sub">${has
        ? 'Pick a new 4-digit PIN. Your other phones will ask for it once.'
        : 'Pick 4 digits you’ll remember. Logging in as <b>'+esc(name)+'</b> on any other phone will then ask for them — so nobody can bid or vote as you.'}</p>
      <input type="tel" class="field-input pin-input" style="width:100%;" id="pinSetInput" data-af inputmode="numeric" pattern="[0-9]*" maxlength="4" autocomplete="off" placeholder="0000" value="${esc(pinSetDraft)}"
        oninput="pinSetDraft=this.value.replace(/\\D/g,'').slice(0,4); this.value=pinSetDraft;" onkeydown="if(event.key==='Enter'){ savePin(); }">
      ${pinSetError ? `<div class="login-err">${esc(pinSetError)}</div>` : ''}
      <div class="footer-actions" style="margin-top:14px; justify-content:flex-start;">
        <button class="btn btn-primary" onclick="savePin()">Save PIN</button>
        ${has ? `<button class="btn btn-ghost" onclick="removeMyPin()">Remove PIN</button>` : `<button class="btn btn-ghost" onclick="closePinModal(true)">Not now</button>`}
      </div>
      <p class="panel-sub" style="margin:12px 0 0;">Forgot it later? The host can reset it.</p>
    </div>
  </div>`;
}

