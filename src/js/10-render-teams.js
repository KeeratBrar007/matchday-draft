/* ---- Mode choice ---- */
function renderModeChoice(){
  if(!isHost()){
    return `<div class="panel"><div class="waiting-note">Waiting for the host to choose random split or captain's draft…</div></div>`;
  }
  return `
  <div class="panel">
    <div class="panel-title">How should we split up?</div>
    <div class="panel-sub">${S.playingIds.length} playing today${S.subIds.length? ' · '+S.subIds.length+' on the bench (chosen at random since the squad is bigger than '+(S.format*2)+')':''}.</div>
    <div class="mode-grid">
      <div class="mode-card" onclick="chooseMode('random')">
        <div class="emoji">🎲</div>
        <h3>Random split</h3>
        <p>Instantly balances two teams by ability rank and by position — ${SPORT.modeBlurb}. Reshuffle as many times as you like before confirming.</p>
      </div>
      <div class="mode-card" onclick="chooseMode('draft')">
        <div class="emoji">🧢</div>
        <h3>Captain's draft</h3>
        <p>Pick two captains, give them a budget, and let them bid against each other for every other player — live, from their own phones.</p>
      </div>
    </div>
  </div>
  <div class="footer-actions"><button class="btn btn-ghost" onclick="backToSetup()">◂ Back to roster</button></div>
  `;
}

/* ---- Random result ---- */
function teamListHtml(ids){
  if(!ids.length) return `<div class="slot-empty">— none —</div>`;
  return `<ul>${ids.map(id=>`<li><span>${esc(playerName(id))} ${posBadges(id)}${starBadge(id)}${chemBadge(id)}${guestTag(id)}</span></li>`).join('')}</ul>`;
}
function teamCompHtml(ids){
  return `<span class="team-comp">${compositionLine(ids)}${noKeeperNote(ids)}</span>`;
}

// A quick "how even is this?" readout for the host to eyeball before
// confirming — ability gap, position-coverage gap, and whether any star
// players ended up on the same side.
function balanceSummary(teamA, teamB){
  const abA = teamA.reduce((s,id)=>s+rankOf(id),0), abB = teamB.reduce((s,id)=>s+rankOf(id),0);
  const abDiff = Math.abs(abA-abB);
  const cA = positionCounts(teamA), cB = positionCounts(teamB);
  const posDiff = POSITION_ORDER.reduce((s,p)=>s+Math.abs(cA[p]-cB[p]),0);
  const starsA = starCount(teamA), starsB = starCount(teamB);
  const starClash = starsA>0 && starsB===0 ? 'a' : starsB>0 && starsA===0 ? 'b' : null;
  const label = (abDiff<=2 && posDiff<=2 && !starClash) ? 'Well balanced'
    : (abDiff<=4 && posDiff<=4) ? 'Reasonably balanced' : 'Lopsided';
  return {abDiff, posDiff, starsA, starsB, starClash, label};
}
function balanceReadoutHtml(teamA, teamB){
  const b = balanceSummary(teamA, teamB);
  const tone = b.label==='Lopsided' ? 'amber' : 'good';
  return `<div class="banner ${tone} balance-note">⚖ ${b.label} — ability gap ${b.abDiff.toFixed(1)}, position gap ${b.posDiff}${
    (b.starsA+b.starsB)>0 ? (b.starClash ? ` · ⚠ both stars on Team ${b.starClash.toUpperCase()}` : ' · stars split across teams') : ''
  }</div>`;
}

function renderRandom(){
  const r = S.randomResult;
  if(!r) return `<div class="panel"><div class="waiting-note">Shuffling…</div></div>`;
  return `
  <div class="panel">
    <div class="panel-title">Random split</div>
    <div class="panel-sub">Balanced by ability rank, position and star players, teams shuffled for who's "Team A" vs "Team B".</div>
    ${balanceReadoutHtml(r.teamA, r.teamB)}
    <div class="teams-grid">
      <div class="team-card">
        <div class="team-head a"><h3>Team A</h3>${teamCompHtml(r.teamA)}</div>
        <div class="team-body">${teamListHtml(r.teamA)}</div>
      </div>
      <div class="team-card">
        <div class="team-head b"><h3>Team B</h3>${teamCompHtml(r.teamB)}</div>
        <div class="team-body">${teamListHtml(r.teamB)}</div>
      </div>
    </div>
    ${r.subs.length ? `
    <div class="panel-title subs-card" style="font-size:1.1rem;">Bench / subs</div>
    <div class="chip-row">${r.subs.map(id=>`<span class="chip">${esc(playerName(id))} ${posBadges(id)}${starBadge(id)}</span>`).join('')}</div>
    ` : ''}
    ${shareButtonsHtml()}
  </div>
  ${isHost() ? `
  <div class="footer-actions">
    <button class="btn btn-ghost" onclick="backToSetup()">◂ Back</button>
    <button class="btn" onclick="reshuffleRandom()">🔀 Reshuffle</button>
    <button class="btn btn-primary" onclick="confirmRandom()">✅ Confirm &amp; save</button>
  </div>` : `<div class="waiting-note">Waiting for the host to confirm…</div>`}
  `;
}

/* ---- Captains pick ---- */
function renderCaptainsPick(){
  if(!isHost()){
    return `<div class="panel"><div class="waiting-note">Waiting for the host to pick captains…</div></div>`;
  }
  const mode = S.captainPickMode;
  const caps = S.captains;
  let body = '';
  if(!mode){
    body = `
    <div class="toggle-row">
      <div class="toggle-btn" onclick="setCaptainPickMode('manual')">Pick manually</div>
      <div class="toggle-btn" onclick="setCaptainPickMode('random'); randomizeCaptains();">🎲 Randomize</div>
    </div>`;
  } else if(mode==='manual'){
    const names = S.playingIds.map(id=>{
      let cls = 'pick-name';
      if(caps.a===id) cls += ' pick-a';
      else if(caps.b===id) cls += ' pick-b';
      return `<div class="${cls}" onclick="manualPick('${id}')">${esc(playerName(id))} ${posBadges(id)}${starBadge(id)}${caps.a===id?' (A)':''}${caps.b===id?' (B)':''}</div>`;
    }).join('');
    body = `
      <div class="panel-sub">Tap a name for Captain A, then another for Captain B.</div>
      <div class="pick-grid">${names}</div>
      <button class="btn btn-ghost btn-sm" onclick="resetCaptains()">Reset picks</button>
    `;
  } else {
    body = `
      <div class="panel-sub">Randomly chosen from today's players.</div>
      <button class="btn btn-sm" onclick="randomizeCaptains()">🎲 Re-roll</button>
    `;
  }

  return `
  <div class="panel">
    <div class="panel-title">Pick two captains</div>
    ${body}
    ${(caps.a && caps.b) ? `
      <div class="row" style="margin-top:14px;">
        <div class="chip" style="border-color:var(--teamA); color:var(--teamA);">Captain A — ${esc(playerName(caps.a))}</div>
        <div class="chip" style="border-color:var(--teamB); color:var(--teamB);">Captain B — ${esc(playerName(caps.b))}</div>
      </div>` : ''}
  </div>
  <div class="footer-actions">
    <button class="btn btn-ghost" onclick="backToSetup()">◂ Back</button>
    <button class="btn btn-primary" ${(caps.a && caps.b) ? '' : 'disabled'} onclick="goToBudget()">Continue to budget ▸</button>
  </div>
  `;
}

/* ---- Budget setup ---- */
function renderBudget(){
  if(!isHost()){
    return `<div class="panel"><div class="waiting-note">Waiting for the host to set the auction budget…</div></div>`;
  }
  return `
  <div class="panel">
    <div class="panel-title">Auction budget</div>
    <div class="panel-sub">Every player goes up for the same starting price — captains bid it up from there. Both captains get the same budget.</div>
    <div class="row">
      <div class="field grow">
        <label>Starting budget / captain</label>
        <input type="number" min="10" step="5" id="fBudget" value="${S.budget}">
      </div>
      <div class="field grow">
        <label>Starting price / player</label>
        <input type="number" min="5" step="5" id="fBase" value="${S.basePrice}">
      </div>
      <div class="field grow">
        <label>Bid increment</label>
        <input type="number" min="1" step="1" id="fIncrement" value="${S.increment}">
      </div>
      <div class="field grow">
        <label>Time per decision</label>
        <select id="fTimer" class="field-input">
          ${[[0,'No timer'],[20,'20 seconds'],[30,'30 seconds'],[45,'45 seconds'],[60,'60 seconds']].map(o=>`<option value="${o[0]}" ${(S.timerSecs==null?30:S.timerSecs)===o[0]?'selected':''}>${o[1]}</option>`).join('')}
        </select>
      </div>
    </div>
    <div class="panel-sub" style="margin-top:8px;">When a captain's time runs out they pass automatically, so one slow phone can't stall the draft.</div>
    <div class="banner" style="margin-top:14px;">If a captain runs out of budget before their squad is full, whoever is still short gets the remaining unsold players free of charge once the other team fills up.</div>
  </div>
  <div class="footer-actions">
    <button class="btn btn-ghost" onclick="saveState({phase:'captains'})">◂ Back</button>
    <button class="btn btn-primary" onclick="startAuction(Number(document.getElementById('fBudget').value)||100, Number(document.getElementById('fBase').value)||10, Number(document.getElementById('fIncrement').value)||5, Number(document.getElementById('fTimer').value))">Start auction ▸</button>
  </div>
  `;
}

/* ---- Auction ---- */
function capCardHtml(team){
  const a = S.auction;
  const capA = a.capA || S.format, capB = a.capB || S.format;
  const teamObj = team==='a' ? a.teamA : a.teamB;
  const capId = team==='a' ? S.captains.a : S.captains.b;
  const isTurn = !a.done && a.turn===team && (teamFull(a.teamA,capA)===teamFull(a.teamB,capB));
  const n = team==='a' ? capA : capB;
  return `
    <div class="cap-card ${team} ${isTurn?'turn':''}">
      <div class="who">Team ${team.toUpperCase()} · Captain</div>
      <div class="cap-name">${esc(playerName(capId))}</div>
      <div class="cap-budget">₹${teamObj.budget}</div>
      <div class="fill">${teamObj.ids.length}/${n} players</div>
    </div>`;
}

function renderAuctionActions(){
  const a = S.auction;
  if(a.done) return '';
  const capA = a.capA || S.format, capB = a.capB || S.format;
  const bothOpen = teamFull(a.teamA,capA) === teamFull(a.teamB,capB);
  if(!bothOpen){
    return `<div class="waiting-note">Filling the remaining roster automatically…</div>`;
  }
  const myTeam = myTeamRole();
  const canActAsA = isHost() || myTeam==='a';
  const canActAsB = isHost() || myTeam==='b';

  function actionsFor(team, canAct){
    const isTurn = a.turn===team;
    const teamObj = team==='a'?a.teamA:a.teamB;
    const canAfford = teamObj.budget >= a.currentBid;
    if(!isTurn){
      return `<div class="waiting-note">Waiting for Team ${team.toUpperCase()}…</div>`;
    }
    if(!canAct){
      return `<div class="waiting-note">It's Team ${team.toUpperCase()}'s turn — waiting on their phone…</div>`;
    }
    const min = a.currentBid, inc = S.increment || 5;
    const quick = [min + inc, min + 3*inc, min + 5*inc].filter(v=>v <= teamObj.budget);
    return `
      <div class="bid-actions">
        <button class="btn btn-primary" ${canAfford?'':'disabled'} onclick="auctionBid('${team}')">Bid ₹${min}</button>
        <button class="btn btn-danger" onclick="auctionPass('${team}')">Pass</button>
      </div>
      ${canAfford ? `
      <div class="bid-more">
        ${quick.map(v=>`<button class="btn btn-sm" onclick="auctionBid('${team}', ${v})">₹${v}</button>`).join('')}
      </div>
      <div class="bid-custom">
        <span>₹</span>
        <input type="number" class="field-input" id="bidInput_${team}" inputmode="numeric" min="${min}" max="${teamObj.budget}" step="1" placeholder="Your amount" value="${escAttr(bidDrafts[team])}" oninput="bidDrafts['${team}']=this.value" onkeydown="if(event.key==='Enter') bidFromInput('${team}');">
        <button class="btn btn-sm btn-primary" onclick="bidFromInput('${team}')">Bid</button>
      </div>
      <div class="bid-hint">Any amount from ₹${min} to ₹${teamObj.budget} (your budget).</div>
      ${bidErr[team] ? `<div class="login-err">${esc(bidErr[team])}</div>` : ''}` : `<div class="bid-hint">Not enough budget left to bid on this one.</div>`}`;
  }

  const canRandomize = isHost() || myTeam==='a' || myTeam==='b';
  return `
    <div class="teams-grid">
      <div>${actionsFor('a', canActAsA)}</div>
      <div>${actionsFor('b', canActAsB)}</div>
    </div>
    ${canRandomize ? `
    <div class="footer-actions" style="margin-top:10px;">
      <button class="btn btn-sm" onclick="randomizeRemaining()">🔀 Randomize remaining players &amp; finish</button>
    </div>` : ''}`;
}

function renderAuction(){
  const a = S.auction;
  if(!a) return `<div class="panel"><div class="waiting-note">Setting up the auction…</div></div>`;
  const currentId = a.order[a.index];
  const onBlock = !a.done && currentId;

  // each sale is written on the side of the team that got the player, newest on top
  const lastSale = a.log[a.log.length-1];
  const sideLog = team=> a.log.filter(l=>l.team===team).slice().reverse().map(l=>
    `<li class="${l===lastSale ? 'just' : ''}">${l.free? '🎁 ':'💰 '}<b>${esc(playerName(l.playerId))}</b> <span>${l.free? 'free (leftover)':'₹'+l.price}</span>${l===lastSale ? '<em>just now</em>' : ''}</li>`
  ).join('');
  const log = a.log.length ? `<div class="sold-sides">
      <div class="sold-col a"><div class="sold-head">→ Team A</div><ul class="sold-list">${sideLog('a') || '<li class="none">nobody yet</li>'}</ul></div>
      <div class="sold-col b"><div class="sold-head">Team B ←</div><ul class="sold-list">${sideLog('b') || '<li class="none">nobody yet</li>'}</ul></div>
    </div>` : '';

  return `
  <div class="panel">
    <div class="panel-title">Live auction</div>
    <div class="panel-sub">Best-ranked players go up first · ${a.index}/${a.order.length} decided</div>
    ${(myTeamRole() && !a.done) ? `<div class="row" style="gap:8px; margin:-2px 0 12px; flex-wrap:wrap;">
      <button class="btn btn-ghost btn-sm" onclick="toggleAlerts()">${alertsOn ? '🔔 Turn alerts: on' : '🔕 Turn alerts: off'}</button>
      <span class="panel-sub" style="margin:0;">Buzz, beep and flash on your turn · screen stays awake</span>
    </div>` : ''}
    <div class="auction-scoreboard">
      ${capCardHtml('a')}
      <div class="block-card">
        ${onBlock ? `
          <div class="tag">On the block</div>
          <div class="name">${esc(playerName(currentId))} ${posBadges(currentId)}${starBadge(currentId)}${chemBadge(currentId)}</div>
          ${attrChips(currentId)}
          <div class="price">₹${a.leader ? a.pendingLeaderPrice : a.currentBid}</div>
          <div class="leader">${a.leader ? 'Team '+a.leader.toUpperCase()+' leads · next bid ₹'+a.currentBid+'+' : 'No bids yet · opening bid'}</div>
          ${timerHtml(a)}
        ` : `<div class="tag">Auction complete</div><div class="name">🏁</div>`}
      </div>
      ${capCardHtml('b')}
    </div>
    ${lastSale ? `<div class="sold-flash ${lastSale.team}" id="soldFlash">${lastSale.team==='b' ? '' : '← '}${lastSale.free ? '🎁' : '💰'} <b>${esc(playerName(lastSale.playerId))}</b> joins Team ${lastSale.team.toUpperCase()}${lastSale.free ? ' (free)' : ' for ₹' + lastSale.price}${lastSale.team==='b' ? ' →' : ''}</div>` : ''}
    ${renderAuctionActions()}
    ${a.note && !a.done ? `<div class="banner amber" style="margin-top:10px;">${/jumped/.test(a.note) ? '📣' : '⏱'} ${esc(a.note)}</div>` : ''}
    ${(isHost() && !a.done) ? `<div class="row" style="gap:8px; margin-top:10px; align-items:center; flex-wrap:wrap;">
      <span class="panel-sub" style="margin:0;">⏱ Time per decision</span>
      <select class="field-input" style="width:auto;" onchange="setTimerSecs(Number(this.value))">
        ${[[0,'No timer'],[20,'20 s'],[30,'30 s'],[45,'45 s'],[60,'60 s']].map(o=>`<option value="${o[0]}" ${(S.timerSecs||0)===o[0]?'selected':''}>${o[1]}</option>`).join('')}
      </select>
    </div>` : ''}
    ${a.done ? shareButtonsHtml() : ''}
  </div>

  <div class="panel log-panel">
    <div class="panel-title" style="font-size:1.1rem; margin-bottom:8px;">Sold so far</div>
    ${log || `<div class="empty-note">No sales yet.</div>`}
  </div>

  ${a.done && isHost() ? `
  <div class="footer-actions">
    <button class="btn btn-primary" onclick="saveAuctionToHistory()">✅ Finish &amp; save result</button>
  </div>` : ''}
  `;
}

