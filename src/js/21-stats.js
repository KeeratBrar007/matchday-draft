/* ============================= Stats: season, all-time, records ============================= */
function setStatsScope(k){ statsScope = k; showAwardsCard = false; render(); }
function statsSeasonYear(){ return statsSeason || String(new Date().getFullYear()); }
function statsSeasonPrev(){ statsSeason = String(Number(statsSeasonYear()) - 1); render(); }
function statsSeasonNext(){ statsSeason = String(Number(statsSeasonYear()) + 1); render(); }
function statsSeasonReset(){ statsSeason = null; render(); }
function statsScopeInfo(){
  if(statsScope==='season'){
    const y = statsSeasonYear();
    return {kind:'season', entries: HISTORY.filter(h=> String(new Date(h.date).getFullYear())===y), title:'Season ' + y, empty:'No matches recorded in ' + y + ' yet.'};
  }
  if(statsScope==='all'){
    return {kind:'all', entries: HISTORY.slice(), title:'All-time', empty:'No matches recorded yet.'};
  }
  const month = statsMonth || currentYearMonth();
  return {kind:'month', month, entries: historyForMonth(month), title: formatYearMonth(month), empty:'No matches recorded in ' + formatYearMonth(month) + ' yet.'};
}
function longestWinStreak(id, entries){
  let best = 0, cur = 0;
  entries.slice().reverse().forEach(h=>{   // oldest first
    const inA = (h.teamAIds||[]).includes(id), inB = (h.teamBIds||[]).includes(id);
    if(!inA && !inB) return;
    if(!h.winner) return;
    const won = (inA && h.winner==='a') || (inB && h.winner==='b');
    if(won){ cur++; if(cur>best) best = cur; } else cur = 0;
  });
  return best;
}
function computeRecords(entries, minGames){
  const stats = computeMonthlyStats(entries);
  const ids = Object.keys(stats);
  const out = [];
  const top = (icon, label, fn, fmt, min)=>{
    let best = -Infinity, holders = [];
    ids.forEach(id=>{ const v = fn(id); if(v>best){ best = v; holders = [id]; } else if(v===best) holders.push(id); });
    if(holders.length && best >= (min==null ? 1 : min)) out.push({icon, label, value: fmt ? fmt(best) : String(best), holders});
  };
  top(SPORT.s1.icon, 'Most ' + SPORT.s1.many, id=>stats[id].goals);
  top(SPORT.s2.icon, 'Most ' + SPORT.s2.many, id=>stats[id].assists);
  top('🏆', 'Most wins', id=>stats[id].wins);
  top('👟', 'Most matches', id=>stats[id].played);
  top('📈', 'Best win rate', id=> stats[id].played>=minGames ? Math.round(100*stats[id].wins/stats[id].played) : -1, v=>v+'%', 0);
  top('🔥', 'Longest win streak', id=>longestWinStreak(id, entries), v=>v+' in a row', 2);
  const potm = computeMonthlyPotmCounts(entries);
  top('🏅', 'Most POTMs', id=>potm[id]||0);
  // single-match feats
  let bestGoals = 0, goalHolders = [];
  entries.forEach(h=>(h.scorers||[]).forEach(s=>{
    if(!s.playerId || isGuest(s.playerId) || !s.goals) return;
    if(s.goals>bestGoals){ bestGoals = s.goals; goalHolders = [s.playerId]; }
    else if(s.goals===bestGoals && !goalHolders.includes(s.playerId)) goalHolders.push(s.playerId);
  }));
  if(bestGoals>=SPORT.feat1Min) out.push({icon:'🎯', label:(SPORT.key==='cricket' ? 'Highest score' : 'Most ' + SPORT.s1.many + ' in a match'), value:s1Text(bestGoals), holders:goalHolders});
  let best2 = 0, best2H = [];
  entries.forEach(h=>(h.assists||[]).forEach(a=>{
    if(!a.playerId || isGuest(a.playerId) || !a.assists) return;
    if(a.assists>best2){ best2 = a.assists; best2H = [a.playerId]; }
    else if(a.assists===best2 && !best2H.includes(a.playerId)) best2H.push(a.playerId);
  }));
  if(best2>=SPORT.feat2Min) out.push({icon:SPORT.s2.icon, label:(SPORT.key==='cricket' ? 'Best bowling' : 'Most ' + SPORT.s2.many + ' in a match'), value:s2Text(best2), holders:best2H});
  let bigMargin = 0, bigH = null, highTotal = 0, highH = null;
  entries.forEach(h=>{
    if(typeof h.scoreA!=='number' || typeof h.scoreB!=='number') return;
    const m = Math.abs(h.scoreA - h.scoreB), tot = h.scoreA + h.scoreB;
    if(m>bigMargin){ bigMargin = m; bigH = h; }
    if(tot>highTotal){ highTotal = tot; highH = h; }
  });
  const dstr = h=> new Date(h.date).toLocaleDateString(undefined,{day:'numeric',month:'short',year:'numeric'});
  if(bigH && bigMargin>=SPORT.bigWinMin) out.push({icon:'💥', label:'Biggest win', value:Math.max(bigH.scoreA,bigH.scoreB)+'–'+Math.min(bigH.scoreA,bigH.scoreB), holders:[], note:'Team '+(bigH.scoreA>bigH.scoreB?'A':'B')+' · '+dstr(bigH)});
  if(highH && highTotal>=SPORT.highScoreMin) out.push({icon:'🎆', label:'Highest-scoring game', value:s1Text(highTotal), holders:[], note:highH.scoreA+'–'+highH.scoreB+' · '+dstr(highH)});
  return out;
}
function renderRecordsHtml(entries, kind){
  const recs = computeRecords(entries, kind==='all' ? 5 : 3);
  if(!recs.length) return '';
  return `<div class="rec-title">${kind==='all' ? '🏛 Hall of fame' : '⭐ Season highlights'}</div>
  <div class="rec-grid">${recs.map(r=>`
    <div class="rec-card">
      <div class="rl">${r.icon} ${esc(r.label)}</div>
      <div class="rv">${esc(r.value)}</div>
      <div class="rn">${r.holders.length ? r.holders.map(id=>nameLink(id)).join(' &amp; ') : esc(r.note||'')}</div>
    </div>`).join('')}</div>`;
}

