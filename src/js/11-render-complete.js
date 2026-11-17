/* ---- Complete: final teams + optional match result ---- */
function renderComplete(){
  const {teamAIds, teamBIds, subIds} = getCompleteTeamIds();
  let capA=null, capB=null, priceOf=()=>null;
  if(S.mode==='draft' && S.auction){
    capA = S.captains.a; capB = S.captains.b;
    const priceMap = {};
    S.auction.log.forEach(l=>{ priceMap[l.playerId] = l; });
    priceOf = (id)=> priceMap[id];
  }

  function list(ids, capId){
    return `<ul>${ids.map(id=>{
      const rec = priceOf(id);
      const isCap = id===capId;
      return `<li><span>${nameLink(id)} ${posBadges(id)}${starBadge(id)}${chemBadge(id)}${guestTag(id)}${isCap?'<span class="cap-tag">C</span>':''}</span>${rec && !isCap ? `<span class="price">${rec.free?'free':'₹'+rec.price}</span>`:''}</li>`;
    }).join('')}</ul>`;
  }
  function compAndBudget(ids, budgetLeft){
    return `<span class="team-comp">${compositionLine(ids)}${noKeeperNote(ids)}${budgetLeft!=null?' · ₹'+budgetLeft+' left':''}</span>`;
  }

  return `
  <div class="panel">
    <div class="banner good">Saved to match history 🎉</div>
    <div class="panel-title">Final teams</div>
    <div class="teams-grid">
      <div class="team-card">
        <div class="team-head a"><h3>Team A</h3>${compAndBudget(teamAIds, S.mode==='draft'?S.auction.teamA.budget:null)}</div>
        <div class="team-body">${list(teamAIds, capA)}</div>
      </div>
      <div class="team-card">
        <div class="team-head b"><h3>Team B</h3>${compAndBudget(teamBIds, S.mode==='draft'?S.auction.teamB.budget:null)}</div>
        <div class="team-body">${list(teamBIds, capB)}</div>
      </div>
    </div>
    ${subIds.length ? `
    <div class="panel-title subs-card" style="font-size:1.1rem;">Bench / subs</div>
    <div class="chip-row">${subIds.map(id=>`<span class="chip">${esc(playerName(id))} ${posBadges(id)}${starBadge(id)}</span>`).join('')}</div>` : ''}
    ${shareButtonsHtml()}
  </div>

  ${renderResultForm(teamAIds, teamBIds)}

  ${(()=>{
    if(!isHost()) return '';
    const h = HISTORY.find(x=>x.id===S.lastHistoryId); if(!h) return '';
    const f = feeOf(h);
    if(!f) return `<div class="panel"><div class="panel-title" style="font-size:1.1rem;">💰 Turf money</div><div class="panel-sub">Split the turf and anything else between everyone who played, then send it to the group.</div><button class="btn btn-primary" onclick="openFeeEditor('${h.id}')">💰 Split the cost</button></div>`;
    const owing = feeLines(f).filter(l=>l.owes>0);
    return `<div class="panel"><div class="panel-title" style="font-size:1.1rem;">💰 Turf money</div><div class="panel-sub">${rupees(feeTotal(f))}${f.split!=='custom' ? ' · ' + rupees(feeEach(f)) + ' each' : ''} · ${owing.filter(l=>l.paid).length} of ${owing.length} paid</div><div class="row" style="gap:8px;"><button class="btn" onclick="togglePayments()">Mark who’s paid</button><button class="btn btn-ghost" onclick="openFeeEditor('${h.id}')">Edit costs</button></div></div>`;
  })()}

  ${potmVotingHtml(HISTORY.find(h=>h.id===S.lastHistoryId))}

  ${isHost() ? `
  <div class="footer-actions">
    <button class="btn btn-primary" onclick="startNewMatch()">🏟 Start new match</button>
  </div>` : ''}
  `;
}

function renderResultForm(teamAIds, teamBIds){
  if(!isHost()) return '';
  if(liveShown()) return '';
  const hNow = HISTORY.find(x=>x.id===S.lastHistoryId);
  const liveStart = (!resultDraft.saved && hNow && !hNow.winner) ? `<div class="panel"><div class="panel-title" style="font-size:1.1rem;">⏱ Live score</div><div class="panel-sub">Tap the score in as you play. Every phone sees it live, and the result saves itself at full time.</div><button class="btn btn-primary" onclick="startLive()">▶ Start live score</button></div>` : '';
  if(resultDraft.saved){
    return `<div class="panel"><div class="banner good">Match result saved — thanks for keeping the record straight!</div></div>`;
  }
  const allMatchIds = teamAIds.concat(teamBIds);
  const scorerRows = resultDraft.scorers.map((s,i)=>`
    <div class="row" style="gap:8px; flex-wrap:nowrap;">
      <select class="field-input" style="flex:1;" onchange="setScorerPlayer(${i}, this.value)">
        <option value="">Who scored?</option>
        ${allMatchIds.map(id=>`<option value="${id}" ${s.playerId===id?'selected':''}>${esc(playerName(id))}</option>`).join('')}
      </select>
      <input type="number" min="1" value="${s.goals||1}" style="width:64px;" onchange="setScorerGoals(${i}, this.value)">
      <button class="icon-btn" onclick="removeScorerRow(${i})">✕</button>
    </div>`).join('');
  const assistRows = resultDraft.assists.map((a,i)=>`
    <div class="row" style="gap:8px; flex-wrap:nowrap;">
      <select class="field-input" style="flex:1;" onchange="setAssistPlayer(${i}, this.value)">
        <option value="">Who assisted?</option>
        ${allMatchIds.map(id=>`<option value="${id}" ${a.playerId===id?'selected':''}>${esc(playerName(id))}</option>`).join('')}
      </select>
      <input type="number" min="1" value="${a.assists||1}" style="width:64px;" onchange="setAssistCount(${i}, this.value)">
      <button class="icon-btn" onclick="removeAssistRow(${i})">✕</button>
    </div>`).join('');

  return liveStart + `
  <div class="panel">
    <div class="panel-title" style="font-size:1.3rem;">${liveStart ? 'Or enter the result afterwards' : 'Match result'}</div>
    <div class="panel-sub">Optional — fill in whatever you remember. Recording a winner nudges their rank up — more for a longer match, a bigger scoreline, or an upset; barely at all for a short kickabout or a favorite winning as expected — and starts building chemistry between regulars who keep winning together.</div>
    <div class="field" style="margin-bottom:10px;">
      <label>Winner</label>
      <div class="chip-toggle-row">
        <button type="button" class="chip-toggle ${resultDraft.winner==='a'?'active':''}" onclick="setResultWinner('a')">Team A</button>
        <button type="button" class="chip-toggle ${resultDraft.winner==='b'?'active':''}" onclick="setResultWinner('b')">Team B</button>
        <button type="button" class="chip-toggle ${resultDraft.winner==='draw'?'active':''}" onclick="setResultWinner('draw')">${SPORT.draw}</button>
      </div>
    </div>
    ${SPORT.key!=='football' ? sportScoreFieldsHtml(resultDraft, 'resultDraft') + psTableHtml('result', resultDraft, teamAIds, teamBIds) : `
    <div class="row" style="margin-bottom:10px;">
      <div class="field grow">
        <label>Score — Team A</label>
        <input type="number" min="0" value="${resultDraft.scoreA}" oninput="resultDraft.scoreA=this.value">
      </div>
      <div class="field grow">
        <label>Score — Team B</label>
        <input type="number" min="0" value="${resultDraft.scoreB}" oninput="resultDraft.scoreB=this.value">
      </div>
      <div class="field grow">
        <label>Match length (min)</label>
        <input type="number" min="0" step="5" placeholder="e.g. 60" value="${resultDraft.duration}" oninput="resultDraft.duration=this.value">
      </div>
    </div>
    <div class="field" style="margin-bottom:8px;">
      <label>Goal scorers</label>
      <div style="display:flex; flex-direction:column; gap:6px;">${scorerRows}</div>
      <button type="button" class="btn btn-sm" style="align-self:flex-start; margin-top:6px;" onclick="addScorerRow()">+ Add scorer</button>
    </div>
    <div class="field" style="margin-bottom:8px;">
      <label>Assists</label>
      <div style="display:flex; flex-direction:column; gap:6px;">${assistRows}</div>
      <button type="button" class="btn btn-sm" style="align-self:flex-start; margin-top:6px;" onclick="addAssistRow()">+ Add assist</button>
    </div>`}
    <div class="footer-actions">
      <button class="btn btn-ghost" onclick="skipResult()">Skip for now</button>
      <button class="btn btn-primary" onclick="saveMatchResult()">💾 Save result</button>
    </div>
  </div>`;
}

/* ---- Log a match played outside the app ---- */
function renderLogMatchModal(){
  if(!showLogMatch || !logDraft) return '';
  if(!isHost()){ showLogMatch = false; return ''; }
  const all = allPlayersArr();
  const rows = all.map(p=>{
    const inA = logDraft.teamA.includes(p.id), inB = logDraft.teamB.includes(p.id);
    return `
    <div class="row" style="justify-content:space-between; padding:6px 0; border-bottom:1px solid var(--line); flex-wrap:nowrap;">
      <span>${esc(p.name)} ${posBadges(p.id)}${starBadge(p.id)}</span>
      <span class="row-controls">
        <button type="button" class="chip-toggle ${inA?'active':''}" style="${inA?'border-color:var(--teamA); color:var(--teamA); background:var(--teamA-dim);':''}" onclick="logToggleTeam('${p.id}', ${inA?'null':"'a'"})">A</button>
        <button type="button" class="chip-toggle ${inB?'active':''}" style="${inB?'border-color:var(--teamB); color:var(--teamB); background:var(--teamB-dim);':''}" onclick="logToggleTeam('${p.id}', ${inB?'null':"'b'"})">B</button>
      </span>
    </div>`;
  }).join('');

  const allMatchIds = logDraft.teamA.concat(logDraft.teamB);
  const scorerRows = logDraft.scorers.map((s,i)=>`
    <div class="row" style="gap:8px; flex-wrap:nowrap;">
      <select class="field-input" style="flex:1;" onchange="logSetScorerPlayer(${i}, this.value)">
        <option value="">Who scored?</option>
        ${allMatchIds.map(id=>`<option value="${id}" ${s.playerId===id?'selected':''}>${esc(playerName(id))}</option>`).join('')}
      </select>
      <input type="number" min="1" value="${s.goals||1}" style="width:64px;" onchange="logSetScorerGoals(${i}, this.value)">
      <button class="icon-btn" onclick="logRemoveScorerRow(${i})">✕</button>
    </div>`).join('');
  const assistRows = logDraft.assists.map((a,i)=>`
    <div class="row" style="gap:8px; flex-wrap:nowrap;">
      <select class="field-input" style="flex:1;" onchange="logSetAssistPlayer(${i}, this.value)">
        <option value="">Who assisted?</option>
        ${allMatchIds.map(id=>`<option value="${id}" ${a.playerId===id?'selected':''}>${esc(playerName(id))}</option>`).join('')}
      </select>
      <input type="number" min="1" value="${a.assists||1}" style="width:64px;" onchange="logSetAssistCount(${i}, this.value)">
      <button class="icon-btn" onclick="logRemoveAssistRow(${i})">✕</button>
    </div>`).join('');

  return `
  <div class="modal-backdrop" onclick="if(event.target===this) toggleLogMatch();">
    <div class="modal" style="max-width:600px;">
      <div class="row" style="justify-content:space-between; margin-bottom:12px;">
        <div class="panel-title" style="margin:0;">Log a match played outside the app</div>
        <button class="icon-btn" onclick="toggleLogMatch()">✕</button>
      </div>
      <div class="panel-sub">Tag who was on which team and whatever result details you remember — this feeds the same stats, rank and chemistry tracking as matches run through the app.</div>
      <div class="format-grid" style="margin-bottom:14px;">
        ${FORMATS.map(n=>`<div class="format-card ${logDraft.format===n?'active':''}" onclick="logSetFormat(${n})"><div class="num">${n}v${n}</div></div>`).join('')}
      </div>
      ${all.length ? `<div style="max-height:220px; overflow-y:auto; margin-bottom:14px;">${rows}</div>` : `<div class="empty-note">Add players to the database first.</div>`}
      <div class="field" style="margin-bottom:10px;">
        <label>Winner</label>
        <div class="chip-toggle-row">
          <button type="button" class="chip-toggle ${logDraft.winner==='a'?'active':''}" onclick="logSetWinner('a')">Team A</button>
          <button type="button" class="chip-toggle ${logDraft.winner==='b'?'active':''}" onclick="logSetWinner('b')">Team B</button>
          <button type="button" class="chip-toggle ${logDraft.winner==='draw'?'active':''}" onclick="logSetWinner('draw')">${SPORT.draw}</button>
        </div>
      </div>
      ${SPORT.key!=='football' ? sportScoreFieldsHtml(logDraft, 'logDraft') + psTableHtml('log', logDraft, logDraft.teamA, logDraft.teamB) : `
      <div class="row" style="margin-bottom:10px;">
        <div class="field grow"><label>Score — Team A</label><input type="number" min="0" value="${logDraft.scoreA}" oninput="logDraft.scoreA=this.value"></div>
        <div class="field grow"><label>Score — Team B</label><input type="number" min="0" value="${logDraft.scoreB}" oninput="logDraft.scoreB=this.value"></div>
        <div class="field grow"><label>Match length (min)</label><input type="number" min="0" step="5" placeholder="e.g. 60" value="${logDraft.duration}" oninput="logDraft.duration=this.value"></div>
      </div>
      <div class="field" style="margin-bottom:8px;">
        <label>Goal scorers</label>
        <div style="display:flex; flex-direction:column; gap:6px;">${scorerRows}</div>
        <button type="button" class="btn btn-sm" style="align-self:flex-start; margin-top:6px;" onclick="logAddScorerRow()">+ Add scorer</button>
      </div>
      <div class="field" style="margin-bottom:8px;">
        <label>Assists</label>
        <div style="display:flex; flex-direction:column; gap:6px;">${assistRows}</div>
        <button type="button" class="btn btn-sm" style="align-self:flex-start; margin-top:6px;" onclick="logAddAssistRow()">+ Add assist</button>
      </div>`}
      <div class="footer-actions">
        <button class="btn btn-primary" ${(logDraft.teamA.length<1||logDraft.teamB.length<1)?'disabled':''} onclick="saveLoggedMatch()">💾 Save match</button>
      </div>
    </div>
  </div>`;
}

/* ---- History modal (host can edit or delete a past match's details) ---- */
function toggleHistory(){ showHistory = !showHistory; editingHistoryId = null; historyEditDraft = null; pendingDeleteId = null; render(); }

function startEditHistory(id){
  const h = HISTORY.find(x=>x.id===id);
  if(!h) return;
  editingHistoryId = id;
  pendingDeleteId = null;
  historyEditDraft = {
    winner: h.winner || null,
    scoreA: h.scoreA!=null ? String(h.scoreA) : '',
    scoreB: h.scoreB!=null ? String(h.scoreB) : '',
    duration: h.duration!=null ? String(h.duration) : '',
    scorers: (h.scorers||[]).map(s=>({playerId:s.playerId, goals:s.goals})),
    assists: (h.assists||[]).map(a=>({playerId:a.playerId, assists:a.assists})),
    ps: recordToPs(h),
    wktsA: h.wktsA!=null ? String(h.wktsA) : '', wktsB: h.wktsB!=null ? String(h.wktsB) : ''
  };
  render();
}
function cancelEditHistory(){ editingHistoryId = null; historyEditDraft = null; render(); }
function setHistEditWinner(w){ historyEditDraft.winner = (historyEditDraft.winner===w) ? null : w; render(); }
function histEditAddScorerRow(){ historyEditDraft.scorers.push({playerId:'', goals:1}); render(); }
function histEditRemoveScorerRow(i){ historyEditDraft.scorers.splice(i,1); render(); }
function histEditSetScorerPlayer(i, id){ historyEditDraft.scorers[i].playerId = id; }
function histEditSetScorerGoals(i, val){ historyEditDraft.scorers[i].goals = Number(val)||1; }
function histEditAddAssistRow(){ historyEditDraft.assists.push({playerId:'', assists:1}); render(); }
function histEditRemoveAssistRow(i){ historyEditDraft.assists.splice(i,1); render(); }
function histEditSetAssistPlayer(i, id){ historyEditDraft.assists[i].playerId = id; }
function histEditSetAssistCount(i, val){ historyEditDraft.assists[i].assists = Number(val)||1; }

// Editing re-derives every stat/chemistry effect from scratch: undo what the
// old recorded result contributed, then apply the edited one. See
// revertMatchOutcome's note — rank ORDER itself isn't rewound, only counters
// and chemistry.
function saveEditHistory(id){
  const h = HISTORY.find(x=>x.id===id);
  if(!h || !historyEditDraft) return;
  revertMatchOutcome(h);
  const scoreA = historyEditDraft.scoreA===''? null : Number(historyEditDraft.scoreA);
  const scoreB = historyEditDraft.scoreB===''? null : Number(historyEditDraft.scoreB);
  const duration = historyEditDraft.duration===''? null : Number(historyEditDraft.duration);
  const scorers = historyEditDraft.scorers.filter(s=>s.playerId && s.goals>0);
  const assists = historyEditDraft.assists.filter(a=>a.playerId && a.assists>0);
  const sx = sportResultExtras(historyEditDraft);
  const sc = sx.scorers || scorers, as = sx.assists || assists;
  updateHistoryResult(id, Object.assign({winner:historyEditDraft.winner, scoreA, scoreB, duration, scorers:sc, assists:as}, sx));
  applyMatchOutcome(h.teamAIds||[], h.teamBIds||[], historyEditDraft.winner, sc, scoreA, scoreB, duration, as);
  editingHistoryId = null;
  historyEditDraft = null;
  render();
}

function askDeleteHistory(id){ pendingDeleteId = id; editingHistoryId = null; render(); }
function cancelDeleteHistory(){ pendingDeleteId = null; render(); }
function confirmDeleteHistory(id){
  const h = HISTORY.find(x=>x.id===id);
  if(h) revertMatchOutcome(h);
  deleteHistoryDoc(id);
  pendingDeleteId = null;
  render();
}

function histEditFormHtml(h){
  const allMatchIds = (h.teamAIds||[]).concat(h.teamBIds||[]);
  const scorerRows = historyEditDraft.scorers.map((s,i)=>`
    <div class="row" style="gap:8px; flex-wrap:nowrap;">
      <select class="field-input" style="flex:1;" onchange="histEditSetScorerPlayer(${i}, this.value)">
        <option value="">Who scored?</option>
        ${allMatchIds.map(id=>`<option value="${id}" ${s.playerId===id?'selected':''}>${esc(playerName(id))}</option>`).join('')}
      </select>
      <input type="number" min="1" value="${s.goals||1}" style="width:64px;" onchange="histEditSetScorerGoals(${i}, this.value)">
      <button class="icon-btn" onclick="histEditRemoveScorerRow(${i})">✕</button>
    </div>`).join('');
  const assistRows = historyEditDraft.assists.map((a,i)=>`
    <div class="row" style="gap:8px; flex-wrap:nowrap;">
      <select class="field-input" style="flex:1;" onchange="histEditSetAssistPlayer(${i}, this.value)">
        <option value="">Who assisted?</option>
        ${allMatchIds.map(id=>`<option value="${id}" ${a.playerId===id?'selected':''}>${esc(playerName(id))}</option>`).join('')}
      </select>
      <input type="number" min="1" value="${a.assists||1}" style="width:64px;" onchange="histEditSetAssistCount(${i}, this.value)">
      <button class="icon-btn" onclick="histEditRemoveAssistRow(${i})">✕</button>
    </div>`).join('');
  return `
    <div class="edit-panel" style="margin-top:8px;">
      <div class="edit-label">Winner</div>
      <div class="chip-toggle-row">
        <button type="button" class="chip-toggle ${historyEditDraft.winner==='a'?'active':''}" onclick="setHistEditWinner('a')">Team A</button>
        <button type="button" class="chip-toggle ${historyEditDraft.winner==='b'?'active':''}" onclick="setHistEditWinner('b')">Team B</button>
        <button type="button" class="chip-toggle ${historyEditDraft.winner==='draw'?'active':''}" onclick="setHistEditWinner('draw')">${SPORT.draw}</button>
      </div>
      ${SPORT.key!=='football' ? sportScoreFieldsHtml(historyEditDraft, 'historyEditDraft') + psTableHtml('hist', historyEditDraft, h.teamAIds||[], h.teamBIds||[]) : `
      <div class="row" style="margin:8px 0;">
        <div class="field grow"><label>Score — A</label><input type="number" min="0" value="${historyEditDraft.scoreA}" oninput="historyEditDraft.scoreA=this.value"></div>
        <div class="field grow"><label>Score — B</label><input type="number" min="0" value="${historyEditDraft.scoreB}" oninput="historyEditDraft.scoreB=this.value"></div>
        <div class="field grow"><label>Length (min)</label><input type="number" min="0" step="5" value="${historyEditDraft.duration}" oninput="historyEditDraft.duration=this.value"></div>
      </div>
      <div class="edit-label">Goal scorers</div>
      <div style="display:flex; flex-direction:column; gap:6px; margin-bottom:6px;">${scorerRows}</div>
      <button type="button" class="btn btn-sm" style="align-self:flex-start; margin-bottom:8px;" onclick="histEditAddScorerRow()">+ Add scorer</button>
      <div class="edit-label">Assists</div>
      <div style="display:flex; flex-direction:column; gap:6px; margin-bottom:6px;">${assistRows}</div>
      <button type="button" class="btn btn-sm" style="align-self:flex-start; margin-bottom:8px;" onclick="histEditAddAssistRow()">+ Add assist</button>`}
      <div class="footer-actions">
        <button class="btn btn-ghost btn-sm" onclick="cancelEditHistory()">Cancel</button>
        <button class="btn btn-primary btn-sm" onclick="saveEditHistory('${h.id}')">💾 Save changes</button>
      </div>
    </div>`;
}

function histToggle(id, open){ if(open) histOpen.add(id); else histOpen.delete(id); }
function matchModeLabel(m){ return m==='draft' ? 'Captains’ auction' : m==='random' ? 'Random split' : String(m||'Match'); }
function resultChipHtml(h){
  if(!h.winner) return `<span class="chip" style="cursor:default;">Result pending</span>`;
  if(h.winner==='draw') return `<span class="chip" style="cursor:default;">${SPORT.draw}</span>`;
  const col = h.winner==='a' ? 'var(--teamA)' : 'var(--teamB)';
  return `<span class="chip" style="cursor:default; border-color:${col}; color:${col};">Team ${h.winner.toUpperCase()} victory</span>`;
}
function scorelineHtml(h, cls){
  const has = h.scoreA!=null && h.scoreB!=null;
  return `<div class="${cls}"><span class="tn a">Team A</span><span class="sc">${has ? esc(teamScore(h,'a')) : '–'} : ${has ? esc(teamScore(h,'b')) : '–'}</span><span class="tn b">Team B</span></div>`;
}
function lineupLinks(ids, names){
  names = names || [];
  if(ids && ids.length === names.length) return ids.map((id,i)=> nameLink(id, names[i])).join(', ');
  return names.map(esc).join(', ');
}
function renderHistoryModal(){
  if(showHistory && !isHost()) showHistory = false;
  if(!showHistory) return '';
  const items = HISTORY.length ? HISTORY.map(h=>`
    <div class="history-item">
      <div class="row" style="justify-content:space-between; align-items:flex-start;">
        <div class="hdate">${new Date(h.date).toLocaleDateString(undefined,{weekday:'short',day:'numeric',month:'short'})} · ${h.format}v${h.format} · ${esc(matchModeLabel(h.mode))}${h.duration!=null?' · '+h.duration+' min':''}</div>
        ${isHost() ? `
        <span class="row-controls">
          <button class="icon-btn" title="Split the cost" onclick="openFeeEditor('${h.id}')">💰</button>
          <button class="icon-btn" title="Edit result" onclick="startEditHistory('${h.id}')">✎</button>
          <button class="icon-btn" title="Delete match" onclick="askDeleteHistory('${h.id}')">✕</button>
        </span>` : ''}
      </div>
      ${scorelineHtml(h, 'hcard-score')}
      <div class="hres">${resultChipHtml(h)}</div>
      <details class="hdetails" ${histOpen.has(h.id)?'open':''} ontoggle="histToggle('${h.id}', this.open)">
        <summary>Lineups ▾</summary>
        <div class="hteams"><b style="color:var(--teamA)">Team A${h.teamA.captain? ' (C: '+esc(h.teamA.captain)+')':''}:</b> ${lineupLinks(h.teamAIds, h.teamA.players)}</div>
        <div class="hteams"><b style="color:var(--teamB)">Team B${h.teamB.captain? ' (C: '+esc(h.teamB.captain)+')':''}:</b> ${lineupLinks(h.teamBIds, h.teamB.players)}</div>
        ${h.subs && h.subs.length ? `<div class="hteams">Bench: ${h.subs.map(esc).join(', ')}</div>` : ''}
        ${historyStatsLinesHtml(h)}
      </details>
      ${pendingDeleteId===h.id ? `
      <div class="banner amber" style="margin-top:8px; display:flex; align-items:center; justify-content:space-between; gap:10px;">
        <span>Delete this match? Its stats and any chemistry it created will be undone.</span>
        <span class="row-controls">
          <button class="btn btn-sm btn-ghost" onclick="cancelDeleteHistory()">Cancel</button>
          <button class="btn btn-sm btn-danger" onclick="confirmDeleteHistory('${h.id}')">Delete</button>
        </span>
      </div>` : ''}
      ${editingHistoryId===h.id ? histEditFormHtml(h) : ''}
      ${(h.teamAIds||[]).length && (h.teamBIds||[]).length ? potmVotingHtml(h) : ''}
    </div>`).join('') : `<div class="empty-note">No matches saved yet.</div>`;

  return `
  <div class="modal-backdrop" onclick="if(event.target===this) toggleHistory();">
    <div class="modal">
      <div class="row" style="justify-content:space-between; margin-bottom:12px;">
        <div class="panel-title" style="margin:0;">Past matches</div>
        <button class="icon-btn" onclick="toggleHistory()">✕</button>
      </div>
      ${isHost() ? `<div class="footer-actions" style="justify-content:flex-start; margin-bottom:12px;">
        <button class="btn btn-sm" onclick="toggleHistory(); toggleLogMatch();">📝 Log a match played outside the app</button>
      </div>` : ''}
      ${items}
    </div>
  </div>`;
}

