/* ---- Setup: pick who's here today from the database ---- */
// Shown the moment selection hits exactly format*2 — catches both a
// latecomer arriving after teams are already "full" and a host who meant to
// pick a bigger format. Stays dismissed (per the state flags) until the
// format changes or the extra-player choice is reset.
function extraPlayerPromptHtml(sel){
  if(!isHost()) return '';
  const need = S.format*2;
  if(sel.length !== need || S.oddSide || S.extraConfirmedEven) return '';
  return `
  <div class="banner amber" style="margin-top:10px;">
    <div style="margin-bottom:8px;">That's exactly ${need} for ${S.format}v${S.format} — is there one more player today?</div>
    <div class="row" style="gap:8px; flex-wrap:wrap;">
      <button class="btn btn-sm" onclick="confirmEvenTeams()">No, that's everyone</button>
      <button class="btn btn-sm" onclick="confirmExtraPlayer()">Yes — uneven teams (${S.format+1}v${S.format})</button>
      <button class="btn btn-sm" onclick="bumpFormatForExtra()">Actually I meant ${S.format+1}v${S.format+1}</button>
    </div>
  </div>`;
}

function setSetupSearch(v){ setupSearch = v; render(); }
function renderHubHtml(){
  const last = HISTORY[0];
  const lastCard = last ? `
  <div class="last-match">
    <div class="lm-top"><span>Last matchday · ${esc(new Date(last.date).toLocaleDateString(undefined,{weekday:'short',month:'short',day:'numeric'}))}</span><span>${esc(matchModeLabel(last.mode))}</span></div>
    ${scorelineHtml(last, 'scoreline')}
    <div class="hres" style="margin-top:8px;">${resultChipHtml(last)}</div>
  </div>` : '';
  return `
  <div class="hub-hero">
    <span class="hub-pill">${SPORT.kickoff}</span>
    <h2>No live draft running right now</h2>
    <p>As soon as the host starts the team split, the live draft appears here automatically. Tick yourself in below if you're playing today.</p>
  </div>
  ${lastCard}
  ${installBtnHtml()}`;
}
function renderSetup(){
  const known = SQUAD.players.filter(p=>!p.unavailable);
  const unranked = (SQUAD.unrankedPlayers||[]).filter(p=>!p.unavailable);
  const unavailableCount = SQUAD.players.concat(SQUAD.unrankedPlayers||[]).filter(p=>p.unavailable).length;
  const sel = S.selectedIds||[];
  const todaysGuests = (SQUAD.guests||[]).filter(g=>sel.includes(g.id));

  function selRow(p, rankLabel){
    const checked = sel.includes(p.id);
    const canTick = isHost() || p.id === getMyPlayerId();
    return `
    <li class="player-row-wrap select-row ${checked?'selected':''} ${canTick?'':'locked'}" data-pid="${p.id}" ${canTick?`onclick="toggleSelected('${p.id}')"`:''}>
      <div class="player-row">
        <span class="rank-badge">${rankLabel}</span>
        <span class="check-box">${checked?'✓':''}</span>
        <span class="badge-row">${posBadges(p.id)}${starBadge(p.id)}${chemBadge(p.id)}</span>
        <span class="player-name">${esc(p.name)}${p.guest ? guestTag(p.id) : ''}${!checked && waitPos(p.id) ? ' <span class="chip wait-tag">⏳ waitlist #' + waitPos(p.id) + '</span>' : ''}</span>
        ${p.guest && isHost() ? `<button type="button" class="icon-btn" title="Whose guest?" onclick="event.stopPropagation(); guestEditId = (guestEditId==='${p.id}' ? null : '${p.id}'); render();">✎</button>` : ''}
      </div>
      ${p.guest && isHost() && guestEditId===p.id ? `<div class="edit-panel" onclick="event.stopPropagation();"><div class="edit-label">${esc(p.name)} is a guest of…</div>${guestOfChipsHtml(guestOf(p.id), pid=>`guestOfEditToggle('${p.id}','${pid}')`, p.id)}</div>` : ''}
    </li>`;
  }

  const sq = normName(setupSearch);
  const nameOk = p=> !sq || normName(p.name).includes(sq);
  const rankedRows = known.map((p,i)=>({p,i})).filter(x=>nameOk(x.p)).map(x=>selRow(x.p, '#'+(x.i+1))).join('');
  const unrankedRows = unranked.filter(nameOk).map(p=>selRow(p,'?')).join('');
  const guestRows = todaysGuests.filter(nameOk).map(p=>selRow(p,'G')).join('');
  const total = known.length + unranked.length;

  return `
  ${isHost() ? '' : renderHubHtml()}
  ${isHost() ? `<div class="panel">
    <div class="panel-title">Match format</div>
    <div class="panel-sub">How many a side today?</div>
    <div class="format-grid">
      ${FORMATS.map(n=>`
        <div class="format-card ${S.format===n?'active':''}" ${isHost()?`onclick="setFormat(${n})"`:''}>
          <div class="num">${n}v${n}</div>
          <div class="lbl">${n*2} players</div>
        </div>`).join('')}
    </div>
    ${S.oddSide ? `<div class="panel-sub" style="margin-top:8px;">Uneven teams confirmed — Team ${S.oddSide.toUpperCase()} will carry the extra player (${S.format+1}v${S.format}).${isHost() ? ` <button class="btn btn-ghost btn-sm" onclick="saveState({oddSide:null, extraConfirmedEven:false})">Undo</button>` : ''}</div>` : ''}
  </div>` : ''}

  <div class="panel">
    <div class="row" style="justify-content:space-between; margin-bottom:4px;">
      <div class="panel-title" style="margin-bottom:0;">Who's playing today</div>
      ${isHost() ? `<button class="btn btn-sm" onclick="toggleDatabase()">🗂 Player database</button>` : ''}
    </div>
    <div class="panel-sub">${isHost()
      ? `Anyone can tap themselves in from their own phone — no need to wait for the host to open the app. New to the group? Add them from the player database first, then they'll show up here.${unavailableCount ? ` (${unavailableCount} marked unavailable and hidden — manage that in the player database.)` : ''}`
      : `Tap your own name to mark yourself in or out.`}</div>
    ${isHost() ? (()=>{
      const need = S.format*2 + (S.oddSide ? 1 : 0);
      const starsSel = sel.filter(isStarPlayer).length;
      const rankIdx = sel.map(id=>SQUAD.players.findIndex(p=>p.id===id)).filter(i=>i>=0);
      const avgRank = rankIdx.length ? (rankIdx.reduce((a,b)=>a+b,0)/rankIdx.length+1).toFixed(1) : '–';
      return `<div class="host-detail">
        <b>${sel.length}</b> selected of ${need} needed · ${compositionLine(sel)}${noKeeperNote(sel, true)}<br>
        ⭐ stars in: ${starsSel} · average rank of those in: #${avgRank} · bench if everyone plays: ${Math.max(0, sel.length-need)}
      </div>${sel.length > need && !S.benchOk ? `<div class="banner amber" id="overBanner" style="margin-top:8px;">⚠️ ${sel.length} ticked for ${S.format}v${S.format}${S.oddSide ? ' + 1' : ''} (${need} needed). <button class="btn btn-sm" onclick="overflowAsk={ids:[]}; render();">Sort it out</button></div>` : ''}${S.benchOk && sel.length > need ? `<div class="panel-sub" style="margin-top:6px;">${sel.length - need} on the bench (subs). <button class="btn btn-ghost btn-sm" onclick="saveState({benchOk:false})">Undo</button></div>` : ''}`;
    })() : ''}
    ${total || todaysGuests.length ? `
      ${isHost() ? '' : `<div class="panel-sub" style="margin-bottom:8px;">${sel.length} selected</div>`}
      <input type="text" id="setupSearchInput" placeholder="Search players…" autocomplete="off" style="margin-bottom:10px;" value="${esc(setupSearch)}" oninput="setSetupSearch(this.value)">
      ${isHost() && (rankedRows||unrankedRows||guestRows) ? `<div class="sel-tools">
        <button class="btn btn-sm" onclick="selectAllVisible(true)">✓ Select all</button>
        <button class="btn btn-sm btn-ghost" onclick="selectAllVisible(false)">Clear</button>
        <span>Tip: drag down the ticks (or press and hold a name, then drag) to tick lots at once.</span>
      </div>` : ''}
      ${(rankedRows||unrankedRows||guestRows) ? `<ul class="player-list">${rankedRows}${unrankedRows}${guestRows}</ul>` : `<div class="empty-note">Nobody matches “${esc(setupSearch)}”.</div>`}
    ` : `<div class="empty-note">No players in the database yet — open the player database to add some.</div>`}
    ${extraPlayerPromptHtml(sel)}
    ${isHost() ? `
    <div class="row" style="gap:8px; margin-top:12px; flex-wrap:wrap; align-items:center;">
      <input type="text" class="field-input" style="flex:1; min-width:140px;" placeholder="Guest's name" value="${esc(guestForm.name)}" oninput="guestForm.name=this.value" onkeydown="if(event.key==='Enter'){ submitGuestPlayer(); }">
      ${POSITION_ORDER.map(pos=>`<button type="button" class="chip-toggle ${guestForm.positions.includes(pos)?'active':''}" onclick="toggleGuestPosition('${pos}', this)">${POSITIONS[pos].label}</button>`).join('')}
      <button class="btn btn-sm" onclick="submitGuestPlayer()">+ Guest for today</button>
    </div>
    <div class="edit-label" style="margin-top:8px;">Guest of <span style="text-transform:none; letter-spacing:0; font-weight:400;">(who brought them; pick one, several, or everyone)</span></div>
    ${guestOfChipsHtml(guestForm.of, pid=>`guestOfFormToggle('${pid}')`)}
    <div class="panel-sub" style="margin-top:4px;">One-off fill-in — counts today, but won't clutter the permanent database or monthly awards.</div>` : ''}
  </div>

  ${isHost() ? `
  <div class="footer-actions">
    <button class="btn btn-primary" ${sel.length<2?'disabled':''} onclick="goToMode()">Continue to mode ▸</button>
  </div>` : `<div class="waiting-note">Waiting for the host to finish picking today's players…</div>`}
  `;
}

/* ---- Player database modal ---- */
function toggleDatabase(){ showDatabase = !showDatabase; render(); }
function dbFilterActive(){ return !!dbSearch.trim() || dbPosFilter!=='ALL'; }
function dbMatches(p){
  const q = normName(dbSearch);
  if(q && !normName(p.name).includes(q)) return false;
  if(dbPosFilter!=='ALL' && !positionsOf(p.id).includes(dbPosFilter)) return false;
  return true;
}
function setDbSearch(v){ dbSearch = v; render(); }
function setDbPos(pos){ dbPosFilter = pos; render(); }
function renderDatabaseModal(){
  if(!showDatabase) return '';
  if(!isHost()){ showDatabase = false; return ''; } // roster management stays host-only; see renderAwardsModal for the everyone-facing view
  const rankedAll = SQUAD.players.map((p,i)=>({p,i}));
  const rankedShown = rankedAll.filter(x=>dbMatches(x.p));
  const unrankedShown = (SQUAD.unrankedPlayers||[]).filter(dbMatches);
  const rankedRows = rankedShown.map(x=>playerRowHtml(x.p,x.i,true,SQUAD.players.length)).join('');
  const unrankedRows = unrankedShown.map(p=>playerRowHtml(p,0,false)).join('');
  const totalPeople = SQUAD.players.length + (SQUAD.unrankedPlayers||[]).length;
  const shownPeople = rankedShown.length + unrankedShown.length;
  return `
  <div class="modal-backdrop" onclick="if(event.target===this) toggleDatabase();">
    <div class="modal" style="max-width:640px;">
      <div class="row" style="justify-content:space-between; margin-bottom:12px;">
        <div class="panel-title" style="margin:0;">Player database</div>
        <button class="icon-btn" onclick="toggleDatabase()">✕</button>
      </div>
      <div class="panel-sub">Everyone who's ever played — add new people, tweak positions/attributes, adjust ability rank, and manage chemistry links here. Match setup just picks who's around today.</div>
      <div class="panel-sub">Rank only moves on its own after a win, and only for that calendar month — it resets back to however you last set it manually (the ▲▼ arrows, or ranking someone for the first time) once a new month starts.</div>
      ${renderAddPlayerForm()}
      ${totalPeople ? `
      <div class="db-filter">
        <input type="text" id="dbSearchInput" placeholder="Search by name…" autocomplete="off" value="${esc(dbSearch)}" oninput="setDbSearch(this.value)">
        <span class="chip-toggle-row">
          ${['ALL'].concat(POSITION_ORDER).map(pos=>`<button type="button" class="chip-toggle ${dbPosFilter===pos?'active':''}" onclick="setDbPos('${pos}')">${pos==='ALL'?'All':POSITIONS[pos].label}</button>`).join('')}
        </span>
      </div>
      <div class="panel-sub" style="margin:2px 0 6px;">${dbFilterActive() ? `Showing ${shownPeople} of ${totalPeople} — clear the search and filter to re-order ranks with ▲▼.` : `${totalPeople} in the database`}</div>` : ''}
      ${SQUAD.players.length ? `
        <div class="panel-sub" style="margin:10px 0 8px;">${compositionLine(allPlayerIds())}</div>
        ${rankedShown.length ? `<ul class="player-list">${rankedRows}</ul>` : `<div class="empty-note">No ranked players match.</div>`}` : `<div class="empty-note">No ranked players yet.</div>`}
      ${unrankedShown.length ? `
        <div class="panel-title" style="font-size:1.1rem; margin:16px 0 8px;">New / unranked players</div>
        <ul class="player-list">${unrankedRows}</ul>` : ''}
      ${renderChemistryPanel()}
    </div>
  </div>`;
}

/* ---- Awards board: open to every viewer, not just the host ---- */
function toggleAwards(){ showAwards = !showAwards; if(!showAwards) showAwardsCard = false; render(); window.scrollTo(0,0); }
function toggleAwardsCard(){ showAwardsCard = !showAwardsCard; render(); }
// The longest current win streak across the whole month, for the shareable
// card's headline "hot streak" — the full board already shows everyone's
// streak inline, this just picks out the single best one.
function computeTopStreak(month){
  const monthly = computeMonthlyStats(month);
  let best = null;
  Object.keys(monthly).forEach(id=>{
    const s = computeStreak(id, month);
    if(s && s.type==='W' && (!best || s.streak>best.streak)) best = {id, streak:s.streak};
  });
  return best;
}
// A single-glance, portrait-ish summary meant to be screenshotted and
// dropped into the group chat, rather than making everyone open the app.
function renderAwardsCardHtml(){
  const month = statsMonth || currentYearMonth();
  const monthly = computeMonthlyStats(month);
  const ids = Object.keys(monthly);
  const topScorer = ids.slice().sort((x,y)=>monthly[y].goals-monthly[x].goals)[0];
  const topScorerGoals = topScorer ? monthly[topScorer].goals : 0;
  const topAssister = ids.slice().sort((x,y)=>monthly[y].assists-monthly[x].assists)[0];
  const topAssisterCount = topAssister ? monthly[topAssister].assists : 0;
  const potmCounts = computeMonthlyPotmCounts(month);
  const potmIds = Object.keys(potmCounts);
  const topPotm = potmIds.slice().sort((x,y)=>potmCounts[y]-potmCounts[x])[0];
  const topPotmCount = topPotm ? potmCounts[topPotm] : 0;
  const streak = computeTopStreak(month);
  const rows = [
    topScorerGoals>0 ? {icon:SPORT.s1.awardIcon, label:SPORT.s1.award, value: playerName(topScorer)+' — '+s1Text(topScorerGoals)} : null,
    topAssisterCount>0 ? {icon:SPORT.s2.awardIcon, label:SPORT.s2.award, value: playerName(topAssister)+' — '+s2Text(topAssisterCount)} : null,
    topPotmCount>0 ? {icon:'🏅', label:'Most POTMs', value: playerName(topPotm)+' — '+topPotmCount} : null,
    streak ? {icon:'🔥', label:'Hot streak', value: playerName(streak.id)+' — '+streak.streak+' wins in a row'} : null
  ].filter(Boolean);
  return `
  <div style="background:linear-gradient(160deg, var(--panel-2), var(--panel)); border:1px solid var(--line-strong); border-radius:var(--radius); padding:24px; text-align:center;">
    <div style="font-size:.75rem; letter-spacing:.15em; text-transform:uppercase; color:var(--chalk-faint);">${esc(isHost() ? currentSquadName() : 'Matchday Draft')}</div>
    <div style="font-size:1.5rem; font-weight:700; margin:4px 0 18px;">🏆 ${esc(formatYearMonth(month))}</div>
    ${rows.length ? `
    <div style="display:flex; flex-direction:column; gap:14px;">
      ${rows.map(r=>`
      <div>
        <div style="font-size:1.6rem;">${r.icon}</div>
        <div style="font-size:.7rem; text-transform:uppercase; letter-spacing:.1em; color:var(--chalk-faint); margin-top:2px;">${esc(r.label)}</div>
        <div style="font-size:1.1rem; font-weight:600;">${esc(r.value)}</div>
      </div>`).join('')}
    </div>` : `<div class="empty-note">No matches recorded yet this month.</div>`}
    <div style="margin-top:20px; font-size:.75rem; color:var(--chalk-faint);">📸 Screenshot to share in the group chat</div>
  </div>`;
}
function renderLeaderboardPage(){
  const tabs = [['month','Month'],['season','Season'],['all','All-time'],['rivals','⚔️ Rivals']];
  return `
  <div class="page-head">
    <div class="row" style="justify-content:space-between; align-items:flex-start;">
      <h2>Player Standings</h2>
      ${statsScope==='month' ? `<button class="btn btn-sm" onclick="toggleAwardsCard()">${showAwardsCard ? '📋 Full board' : '📤 Shareable card'}</button>` : ''}
    </div>
    <p>Ranked by wins, then win rate and ${SPORT.s1.many}. Flip between this month, the season, all-time records and rivalries. Tap a name to open that player's profile.</p>
  </div>
  <div class="scope-tabs">${tabs.map(t=>`<button class="toggle-btn ${statsScope===t[0]?'active':''}" onclick="setStatsScope('${t[0]}')">${t[1]}</button>`).join('')}</div>
  <div class="page-card">
    ${statsScope==='rivals' ? renderRivalsBoard() : (showAwardsCard && statsScope==='month' ? renderAwardsCardHtml() : renderStatsTable())}
  </div>`;
}

/* ---- Squad manager (host only): create / rename / delete / switch squads ---- */
function renderSquadManagerModal(){
  if(!showSquadManager) return '';
  if(!isHost()){ showSquadManager = false; return ''; }
  const rows = squadsList.map(s=>`
    <div class="squad-row ${s.id===currentSquadId?'current':''}">
      <input type="text" class="field-input" style="flex:1;" value="${esc(s.name)}"
        onchange="renameSquad('${s.id}', this.value)">
      <span class="row-controls">
        ${s.id!==currentSquadId ? `<button class="btn btn-sm" onclick="switchSquad('${s.id}')">Switch</button>` : `<span class="cap-tag">Current</span>`}
        <button class="icon-btn" title="Delete squad" ${squadsList.length<=1?'disabled':''} onclick="deleteSquad('${s.id}')">✕</button>
      </span>
    </div>`).join('');
  return `
  <div class="modal-backdrop" onclick="if(event.target===this) toggleSquadManager();">
    <div class="modal">
      <div class="row" style="justify-content:space-between; margin-bottom:12px;">
        <div class="panel-title" style="margin:0;">Squads</div>
        <button class="icon-btn" onclick="toggleSquadManager()">✕</button>
      </div>
      <div class="panel-sub">Keep separate player databases and match histories for different groups you play with — a Friday 5-a-side crew and a Sunday league team don't have to share a roster.</div>
      ${rows}
      <div style="margin-top:14px;">${installBtnHtml()}</div>
      <div class="row" style="margin-top:12px;">
        <input type="text" class="field-input grow" id="newSquadNameInput" placeholder="New squad name" value="${esc(newSquadName)}" oninput="newSquadName=this.value" onkeydown="if(event.key==='Enter'){ createNewSquadFromInput(); }">
        <button class="btn btn-primary" onclick="createNewSquadFromInput()">+ Create</button>
      </div>
    </div>
  </div>`;
}
function createNewSquadFromInput(){
  createSquad(newSquadName);
}

