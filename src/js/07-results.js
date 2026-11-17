/* ============================= Match results & stats ============================= */

function clamp(v, lo, hi){ return Math.max(lo, Math.min(hi, v)); }

// How many rank spots a win is worth. A short kickabout barely moves
// anyone; a long session moves more. A lopsided scoreline moves more than
// a squeaker. And an upset — the team that was, on paper, weaker coming in
// — moves more than a "favorite wins as expected" result, which barely
// moves at all. Everything folds into one integer shift (1-5 spots).
function computeRankShift(teamAIds, teamBIds, winner, scoreA, scoreB, durationMinutes){
  if(winner!=='a' && winner!=='b') return 1;
  const winIds = winner==='a' ? teamAIds : teamBIds;
  const loseIds = winner==='a' ? teamBIds : teamAIds;
  const avgRank = ids => ids.length ? ids.reduce((s,id)=>s+rankOf(id),0)/ids.length : 0;
  const winAvg = avgRank(winIds), loseAvg = avgRank(loseIds);
  const span = Math.max(1, SQUAD.players.length - 1);

  const mins = Number(durationMinutes) * (SPORT.lengthToMin||1);
  const durationFactor = (mins>0) ? clamp(mins/60, 0.4, 1.8) : 1;

  let marginFactor = 1;
  if(scoreA!=null && scoreB!=null && !isNaN(scoreA) && !isNaN(scoreB)){
    marginFactor = clamp(1 + (Math.abs(scoreA-scoreB)/(SPORT.marginUnit||1))*0.15, 1, 2);
  }

  // positive when the winners were the weaker side coming in (an upset)
  const upset = (loseAvg - winAvg) / span;
  const upsetFactor = clamp(1 + upset*1.2, 0.4, 1.8);

  const raw = durationFactor * marginFactor * upsetFactor;
  return clamp(Math.round(raw), 1, 5);
}

// Applies everything a recorded result affects: play/win/loss/draw/goal
// tallies, a graduation + rank nudge (bigger for longer/lopsided/upset
// wins) for winners, and automatic chemistry links for pairs who've now
// won together three times.
function applyMatchOutcome(teamAIds, teamBIds, winner, scorers, scoreA, scoreB, durationMinutes, assists){
  const rankShift = computeRankShift(teamAIds, teamBIds, winner, scoreA, scoreB, durationMinutes);
  const next = cloneSquad();
  next.stats = Object.assign({}, next.stats||{});
  const bump = (id, key) => {
    next.stats[id] = Object.assign({played:0,wins:0,losses:0,draws:0,goals:0,assists:0}, next.stats[id]);
    next.stats[id][key]++;
  };
  teamAIds.concat(teamBIds).forEach(id=>{
    next.stats[id] = Object.assign({played:0,wins:0,losses:0,draws:0,goals:0,assists:0}, next.stats[id]);
    next.stats[id].played++;
  });
  if(winner==='a'){ teamAIds.forEach(id=>bump(id,'wins')); teamBIds.forEach(id=>bump(id,'losses')); }
  else if(winner==='b'){ teamBIds.forEach(id=>bump(id,'wins')); teamAIds.forEach(id=>bump(id,'losses')); }
  else if(winner==='draw'){ teamAIds.concat(teamBIds).forEach(id=>bump(id,'draws')); }
  (scorers||[]).forEach(s=>{
    if(!s.playerId || !s.goals) return;
    next.stats[s.playerId] = Object.assign({played:0,wins:0,losses:0,draws:0,goals:0,assists:0}, next.stats[s.playerId]);
    next.stats[s.playerId].goals += s.goals;
  });
  (assists||[]).forEach(a=>{
    if(!a.playerId || !a.assists) return;
    next.stats[a.playerId] = Object.assign({played:0,wins:0,losses:0,draws:0,goals:0,assists:0}, next.stats[a.playerId]);
    next.stats[a.playerId].assists += a.assists;
  });

  const winningIds = winner==='a' ? teamAIds.slice() : winner==='b' ? teamBIds.slice() : [];

  // graduate unranked winners into the ranked list before nudging anyone
  winningIds.forEach(id=>{
    const u = (next.unrankedPlayers||[]).find(p=>p.id===id);
    if(u){
      next.unrankedPlayers = next.unrankedPlayers.filter(p=>p.id!==id);
      next.players.splice(Math.round(next.players.length/2), 0, u);
    }
  });
  // nudge each winner up by the computed number of rank spots. Ability
  // rank is stored ascending (index 0 = weakest, last = strongest — same
  // convention as the "Weaker"/"Stronger" arrows in the database), so
  // moving UP means increasing the index.
  winningIds.forEach(id=>{
    let idx = next.players.findIndex(p=>p.id===id);
    let steps = rankShift;
    while(steps>0 && idx>=0 && idx < next.players.length-1){
      [next.players[idx+1], next.players[idx]] = [next.players[idx], next.players[idx+1]];
      idx++; steps--;
    }
  });
  // co-win tracking: three wins together auto-links a pair's chemistry
  next.coWin = Object.assign({}, next.coWin||{});
  if(winningIds.length>=2){
    for(let i=0;i<winningIds.length;i++){
      for(let j=i+1;j<winningIds.length;j++){
        const key = [winningIds[i],winningIds[j]].sort().join('|');
        next.coWin[key] = (next.coWin[key]||0)+1;
        if(next.coWin[key]===3){
          next.chemistryGroups = mergeChemistry(next.chemistryGroups||[], [winningIds[i], winningIds[j]]);
        }
      }
    }
  }
  saveSquadDoc(next);
}

// Undoes the play/win/loss/draw/goal counters and co-win tallies a match
// entry contributed, for deleting or editing a past result. Deliberately
// does NOT try to rewind the rank-order nudge — later matches may already
// have built on top of that ordering, so unwinding it exactly isn't
// possible in general; only the counters and (when this exact match was
// the one that crossed the threshold) the chemistry link it created are
// reversed.
function revertMatchOutcome(entry){
  if(!entry) return;
  const teamAIds = entry.teamAIds||[], teamBIds = entry.teamBIds||[];
  const winner = entry.winner, scorers = entry.scorers||[];
  if(!winner && !scorers.length && !(entry.assists||[]).length) return; // nothing was ever applied for this entry

  const next = cloneSquad();
  next.stats = Object.assign({}, next.stats||{});
  const dec = (id, key) => {
    if(!next.stats[id]) return;
    next.stats[id] = Object.assign({}, next.stats[id]);
    next.stats[id][key] = Math.max(0, (next.stats[id][key]||0) - 1);
  };
  if(winner){
    teamAIds.concat(teamBIds).forEach(id=> dec(id,'played'));
    if(winner==='a'){ teamAIds.forEach(id=>dec(id,'wins')); teamBIds.forEach(id=>dec(id,'losses')); }
    else if(winner==='b'){ teamBIds.forEach(id=>dec(id,'wins')); teamAIds.forEach(id=>dec(id,'losses')); }
    else if(winner==='draw'){ teamAIds.concat(teamBIds).forEach(id=>dec(id,'draws')); }
  }
  scorers.forEach(s=>{
    if(!s.playerId || !s.goals || !next.stats[s.playerId]) return;
    next.stats[s.playerId] = Object.assign({}, next.stats[s.playerId]);
    next.stats[s.playerId].goals = Math.max(0, next.stats[s.playerId].goals - s.goals);
  });
  (entry.assists||[]).forEach(a=>{
    if(!a.playerId || !a.assists || !next.stats[a.playerId]) return;
    next.stats[a.playerId] = Object.assign({}, next.stats[a.playerId]);
    next.stats[a.playerId].assists = Math.max(0, (next.stats[a.playerId].assists||0) - a.assists);
  });

  const winningIds = winner==='a' ? teamAIds.slice() : winner==='b' ? teamBIds.slice() : [];
  next.coWin = Object.assign({}, next.coWin||{});
  if(winningIds.length>=2){
    for(let i=0;i<winningIds.length;i++){
      for(let j=i+1;j<winningIds.length;j++){
        const key = [winningIds[i],winningIds[j]].sort().join('|');
        if(!next.coWin[key]) continue;
        const was = next.coWin[key];
        next.coWin[key] = Math.max(0, was-1);
        // only undo the auto-link if THIS match is what created it, and it
        // hasn't since merged with a bigger chemistry group
        if(was>=3 && next.coWin[key]<3){
          next.chemistryGroups = (next.chemistryGroups||[]).filter(g=>
            !(g.length===2 && g.includes(winningIds[i]) && g.includes(winningIds[j])));
        }
      }
    }
  }
  saveSquadDoc(next);
}

function setResultWinner(w){ resultDraft.winner = (resultDraft.winner===w) ? null : w; render(); }
function addScorerRow(){ resultDraft.scorers.push({playerId:'', goals:1}); render(); }
function removeScorerRow(i){ resultDraft.scorers.splice(i,1); render(); }
function setScorerPlayer(i, id){ resultDraft.scorers[i].playerId = id; }
function setScorerGoals(i, val){ resultDraft.scorers[i].goals = Number(val)||1; }
function addAssistRow(){ resultDraft.assists.push({playerId:'', assists:1}); render(); }
function removeAssistRow(i){ resultDraft.assists.splice(i,1); render(); }
function setAssistPlayer(i, id){ resultDraft.assists[i].playerId = id; }
function setAssistCount(i, val){ resultDraft.assists[i].assists = Number(val)||1; }
function skipResult(){ resultDraft.saved = true; render(); }

/* ---- sport stats: cricket and basketball record a per-player sheet.
   The two headline stats go into the same slots football uses for goals and
   assists (so every board and record works); the rest live in h.pstats. ---- */
function numOrNull(v){ return (v===''||v==null||isNaN(Number(v))) ? null : Number(v); }
function setPS(which, id, k, v){
  const d = which==='result' ? resultDraft : which==='log' ? logDraft : historyEditDraft;
  if(!d) return;
  d.ps = d.ps || {}; d.ps[id] = d.ps[id] || {};
  d.ps[id][k] = (v==='' ? '' : Math.max(0, Number(v)||0));
}
function psToRecord(ps){
  const scorers = [], assists = [], pstats = {};
  Object.keys(ps||{}).forEach(id=>{
    const r = ps[id] || {};
    const a = Number(r.s1)||0, b = Number(r.s2)||0;
    if(a>0) scorers.push({playerId:id, goals:a});
    if(b>0) assists.push({playerId:id, assists:b});
    const ex = {};
    (SPORT.extras||[]).forEach(e=>{ const v = Number(r[e.k])||0; if(v>0) ex[e.k] = v; });
    if(Object.keys(ex).length) pstats[id] = ex;
  });
  return {scorers, assists, pstats};
}
function recordToPs(h){
  const ps = {};
  (h.scorers||[]).forEach(x=>{ if(x.playerId) (ps[x.playerId] = ps[x.playerId] || {}).s1 = x.goals; });
  (h.assists||[]).forEach(x=>{ if(x.playerId) (ps[x.playerId] = ps[x.playerId] || {}).s2 = x.assists; });
  Object.keys(h.pstats||{}).forEach(id=>{ ps[id] = Object.assign(ps[id] || {}, h.pstats[id]); });
  return ps;
}
function sportResultExtras(draft){
  // fields to save alongside scorers/assists for non-football games
  const out = {};
  if(SPORT.key==='football') return out;
  const rec = psToRecord(draft.ps);
  out.scorers = rec.scorers; out.assists = rec.assists; out.pstats = rec.pstats;
  if(SPORT.teamWickets){ out.wktsA = numOrNull(draft.wktsA); out.wktsB = numOrNull(draft.wktsB); }
  return out;
}
function sportScoreFieldsHtml(draft, varName){
  const w = SPORT.scoreWord;
  return `<div class="row" style="margin-bottom:10px;">
      <div class="field grow"><label>${w} — Team A</label><input type="number" min="0" value="${escAttr(draft.scoreA)}" oninput="${varName}.scoreA=this.value"></div>
      ${SPORT.teamWickets ? `<div class="field grow"><label>Wickets — A</label><input type="number" min="0" max="11" value="${escAttr(draft.wktsA||'')}" oninput="${varName}.wktsA=this.value"></div>` : ''}
      <div class="field grow"><label>${w} — Team B</label><input type="number" min="0" value="${escAttr(draft.scoreB)}" oninput="${varName}.scoreB=this.value"></div>
      ${SPORT.teamWickets ? `<div class="field grow"><label>Wickets — B</label><input type="number" min="0" max="11" value="${escAttr(draft.wktsB||'')}" oninput="${varName}.wktsB=this.value"></div>` : ''}
      <div class="field grow"><label>${SPORT.lengthLabel}</label><input type="number" min="0" placeholder="${SPORT.lengthPh}" value="${escAttr(draft.duration)}" oninput="${varName}.duration=this.value"></div>
    </div>`;
}
function psTableHtml(which, draft, aIds, bIds){
  const cols = SPORT.cols || [];
  const ps = draft.ps || {};
  const cell = (id,k)=>{ const v = ps[id] && ps[id][k]; return (v===''||v==null) ? '' : v; };
  const row = id=>`<tr><td>${esc(playerName(id))}</td>${cols.map(c=>`<td><input type="number" min="0" inputmode="numeric" value="${cell(id,c.k)}" oninput="setPS('${which}','${id}','${c.k}',this.value)"></td>`).join('')}</tr>`;
  const sep = (t, col)=>`<tr class="tsep"><td colspan="${cols.length+1}" style="color:${col}">${t}</td></tr>`;
  return `<div class="field" style="margin-bottom:8px;">
    <label>Player stats <span style="text-transform:none; letter-spacing:0; font-weight:400;">(leave blank for 0)</span></label>
    <div style="overflow-x:auto;"><table class="ps-table">
      <tr><th>Player</th>${cols.map(c=>`<th>${c.h}</th>`).join('')}</tr>
      ${aIds.length ? sep('Team A','var(--teamA)') + aIds.map(row).join('') : ''}
      ${bIds.length ? sep('Team B','var(--teamB)') + bIds.map(row).join('') : ''}
    </table></div>
  </div>`;
}
function teamScore(h, side){
  const v = side==='a' ? h.scoreA : h.scoreB;
  if(v==null || v==='') return '–';
  const w = side==='a' ? h.wktsA : h.wktsB;
  return String(v) + (SPORT.teamWickets && w!=null && w!=='' ? '/' + w : '');
}
// one player's line for one match, in the sport's own words
function playerMatchLine(h, id){
  const g = (h.scorers||[]).filter(x=>x.playerId===id).reduce((n,x)=>n+(x.goals||0),0);
  const as = (h.assists||[]).filter(x=>x.playerId===id).reduce((n,x)=>n+(x.assists||0),0);
  const ex = (h.pstats||{})[id] || {};
  const parts = [];
  if(SPORT.key==='cricket'){
    if(g || ex.b) parts.push('🏏 ' + g + (ex.b ? ' (' + ex.b + ')' : '') + ' runs');
    if(as) parts.push('🎯 ' + s2Text(as));
    if(ex.c) parts.push('🧤 ' + ex.c + ' catch' + (ex.c===1 ? '' : 'es'));
  }else if(SPORT.key==='basketball'){
    if(g) parts.push('🏀 ' + s1Text(g));
    if(as) parts.push('💪 ' + s2Text(as));
    if(ex.ast) parts.push('🤝 ' + ex.ast + ' assist' + (ex.ast===1 ? '' : 's'));
  }else{
    if(g) parts.push((SPORT.key==='football' ? '⚽' : SPORT.s1.icon) + ' ' + s1Text(g));
    if(as) parts.push((SPORT.key==='football' ? '🅰' : SPORT.s2.icon) + ' ' + s2Text(as));
  }
  return parts.join(' · ');
}
function historyStatsLinesHtml(h){
  if(SPORT.key==='football'){
    return (h.scorers && h.scorers.length ? `<div class="hteams">⚽ Scorers: ${h.scorers.map(s=>esc(playerName(s.playerId))+' ('+s.goals+')').join(', ')}</div>` : '')
         + (h.assists && h.assists.length ? `<div class="hteams">🅰 Assists: ${h.assists.map(a=>esc(playerName(a.playerId))+' ('+a.assists+')').join(', ')}</div>` : '');
  }
  const ids = (h.teamAIds||[]).concat(h.teamBIds||[]).filter(id=>playerMatchLine(h,id));
  return ids.length ? `<div class="hteams">${ids.map(id=>esc(playerName(id)) + ': ' + esc(playerMatchLine(h,id))).join('<br>')}</div>` : '';
}

function saveMatchResult(){
  const {teamAIds, teamBIds} = getCompleteTeamIds();
  const scoreA = resultDraft.scoreA===''? null : Number(resultDraft.scoreA);
  const scoreB = resultDraft.scoreB===''? null : Number(resultDraft.scoreB);
  const duration = resultDraft.duration===''? null : Number(resultDraft.duration);
  const scorers = resultDraft.scorers.filter(s=>s.playerId && s.goals>0);
  const assists = resultDraft.assists.filter(a=>a.playerId && a.assists>0);
  const sx = sportResultExtras(resultDraft);
  const sc = sx.scorers || scorers, as = sx.assists || assists;
  updateHistoryResult(S.lastHistoryId, Object.assign({winner:resultDraft.winner, scoreA, scoreB, scorers:sc, assists:as, duration}, sx));
  applyMatchOutcome(teamAIds, teamBIds, resultDraft.winner, sc, scoreA, scoreB, duration, as);
  resultDraft.saved = true;
  render();
}

/* ---- log a match played without the app ---- */
function freshLogDraft(){
  return { format:S.format, teamA:[], teamB:[], winner:null, scoreA:'', scoreB:'', duration:'', scorers:[], assists:[], ps:{}, wktsA:'', wktsB:'' };
}
function toggleLogMatch(){
  if(!isHost()){ showLogMatch = false; return; }
  showLogMatch = !showLogMatch;
  if(showLogMatch) logDraft = freshLogDraft();
  render();
}
function logSetFormat(n){ logDraft.format = n; render(); }
function logToggleTeam(id, team){
  logDraft.teamA = logDraft.teamA.filter(x=>x!==id);
  logDraft.teamB = logDraft.teamB.filter(x=>x!==id);
  if(team==='a') logDraft.teamA.push(id);
  else if(team==='b') logDraft.teamB.push(id);
  render();
}
function logSetWinner(w){ logDraft.winner = (logDraft.winner===w) ? null : w; render(); }
function logAddScorerRow(){ logDraft.scorers.push({playerId:'', goals:1}); render(); }
function logRemoveScorerRow(i){ logDraft.scorers.splice(i,1); render(); }
function logSetScorerPlayer(i, id){ logDraft.scorers[i].playerId = id; }
function logSetScorerGoals(i, val){ logDraft.scorers[i].goals = Number(val)||1; }
function logAddAssistRow(){ logDraft.assists.push({playerId:'', assists:1}); render(); }
function logRemoveAssistRow(i){ logDraft.assists.splice(i,1); render(); }
function logSetAssistPlayer(i, id){ logDraft.assists[i].playerId = id; }
function logSetAssistCount(i, val){ logDraft.assists[i].assists = Number(val)||1; }

function saveLoggedMatch(){
  if(logDraft.teamA.length<1 || logDraft.teamB.length<1) return;
  const scoreA = logDraft.scoreA===''? null : Number(logDraft.scoreA);
  const scoreB = logDraft.scoreB===''? null : Number(logDraft.scoreB);
  const duration = logDraft.duration===''? null : Number(logDraft.duration);
  const scorers = logDraft.scorers.filter(s=>s.playerId && s.goals>0);
  const assists = logDraft.assists.filter(a=>a.playerId && a.assists>0);
  addToHistory({
    date:new Date().toISOString(),
    format:logDraft.format,
    mode:'manual',
    teamA:{players:logDraft.teamA.map(playerName)}, teamAIds:logDraft.teamA,
    teamB:{players:logDraft.teamB.map(playerName)}, teamBIds:logDraft.teamB,
    subs:[], subIds:[],
    winner: logDraft.winner, scoreA, scoreB, duration, scorers: (sportResultExtras(logDraft).scorers || scorers), assists: (sportResultExtras(logDraft).assists || assists),
    ...(SPORT.key==='football' ? {} : {pstats: sportResultExtras(logDraft).pstats}),
    ...(SPORT.teamWickets ? {wktsA: numOrNull(logDraft.wktsA), wktsB: numOrNull(logDraft.wktsB)} : {})
  });
  applyMatchOutcome(logDraft.teamA, logDraft.teamB, logDraft.winner, (sportResultExtras(logDraft).scorers || scorers), scoreA, scoreB, duration, (sportResultExtras(logDraft).assists || assists));
  showLogMatch = false;
  render();
}

