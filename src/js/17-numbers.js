/* ============================= Your numbers (host only) =============================
   Usage across every game the host runs: how many people play, how many matches
   and how much turf money the app has tracked. Read-only; it fetches each game's
   player list and full match history once when opened. */
let showStats = false, statsData = null, statsErr = '', statsCopied = '';
async function loadAllGamesData(){
  if(!db){
    if(!LOCAL || !LOCAL.squads) return [{id: currentSquadId, name: currentSquadName(), sport: SPORT.key, roster: SQUAD, history: HISTORY}];
    return LOCAL.squads.map(g=>{ const rec = g.id===currentSquadId ? {squad: SQUAD, history: HISTORY} : (LOCAL.data[g.id] || {});
      return {id: g.id, name: g.name, sport: SPORTS[g.sport] ? g.sport : 'football', roster: rec.squad || {}, history: rec.history || []}; });
  }
  const games = (squadsList||[]).length ? squadsList : [{id: currentSquadId, name: currentSquadName()}];
  return Promise.all(games.map(async g=>{
    const [r, hs] = await Promise.all([
      db.doc('squads/' + g.id + '/state/roster').get().catch(()=>null),
      db.collection('squads/' + g.id + '/history').get().catch(()=>({docs:[]}))
    ]);
    return {id: g.id, name: g.name || 'Game', sport: (SPORTS[g.sport] ? g.sport : 'football'),
            roster: (r && r.exists) ? (r.data()||{}) : {}, history: hs.docs.map(d=>Object.assign({id:d.id}, d.data()))};
  }));
}
function computeUsageStats(games, now){
  now = now || Date.now();
  const DAY = 864e5, people = new Set(), active30 = new Set(), dbPlayers = new Set(), guests = new Set();
  let matches = 0, results = 0, live = 0, auctions = 0, seats = 0, scored = 0, feeTracked = 0, feeOwed = 0, feeMatches = 0;
  let first = null, last8 = 0;
  const perGame = [];
  games.forEach(g=>{
    const ro = g.roster || {};
    const guestIds = new Set((ro.guests||[]).map(x=>x.id));
    (ro.players||[]).concat(ro.unrankedPlayers||[]).forEach(p=>{ if(p && p.id) dbPlayers.add(normName(p.name||p.id)); });
    const nameOf = id=>{ const p = (ro.players||[]).concat(ro.unrankedPlayers||[], ro.guests||[]).find(x=>x && x.id===id); return normName(p ? p.name : id); };
    let gm = 0; const gPeople = new Set();
    (g.history||[]).forEach(h=>{
      const ids = (h.teamAIds||[]).concat(h.teamBIds||[], h.subIds||[]);
      if(!ids.length) return;
      matches++; gm++;
      const t = new Date(h.date).getTime();
      if(!isNaN(t)){ if(first===null || t<first) first = t; if(now - t <= 56*DAY) last8++; }
      if(h.winner) results++;
      if(h.live) live++;
      if(h.mode==='draft') auctions++;
      seats += ids.length;
      (h.scorers||[]).forEach(x=>{ scored += Number(x.goals)||0; });
      ids.forEach(id=>{
        if(guestIds.has(id)){ guests.add(g.id + '|' + id); return; }
        const n = nameOf(id); people.add(n); gPeople.add(n);
        if(!isNaN(t) && now - t <= 30*DAY) active30.add(n);
      });
      const f = (h.fees && Array.isArray(h.fees.items)) ? h.fees : null;
      if(f){
        feeMatches++; feeTracked += feeTotal(f);
        try{ feeLines(f).forEach(l=>{ if(l.owes>0 && !l.paid) feeOwed += l.owes; }); }catch(e){}
      }
    });
    perGame.push({name: g.name, sport: g.sport, matches: gm, players: gPeople.size});
  });
  const weeks = first===null ? 0 : Math.max(1, Math.ceil((now - first) / (7*DAY)));
  return {games: games.length, perGame, people: people.size, active30: active30.size, dbPlayers: dbPlayers.size, guests: guests.size,
          matches, results, live, auctions, avgPlayers: matches ? Math.round(seats/matches) : 0, scored,
          feeTracked, feeOwed, feeCollected: Math.max(0, feeTracked - feeOwed), feeMatches,
          first, weeks, perWeek: Math.round((last8/8)*10)/10};
}
function statsResumeLines(st){
  const since = st.first ? new Date(st.first).toLocaleDateString('en-US', {month:'short', year:'numeric'}) : '';
  const sports = st.games > 1 ? ' across ' + st.games + ' sports' : '';
  const out = [];
  out.push('Built and run Matchday Draft, a real-time web app for my pickup group: ' + st.people + ' players' + sports + ', ' + st.matches + (st.matches===1 ? ' match' : ' matches') + (st.feeTracked ? ' and ' + rupees(st.feeTracked) + ' in turf costs' : '') + ' tracked' + (since ? ' since ' + since : '') + '.');
  if(st.active30) out.push('Used by ' + st.active30 + ' active players' + (st.perWeek >= 0.5 ? ', about ' + (st.perWeek >= 1 ? Math.round(st.perWeek) : st.perWeek) + ' match' + (st.perWeek >= 1.5 ? 'es' : '') + ' a week' : '') + '; ' + st.results + (st.results===1 ? ' result' : ' results') + (st.live ? ' (' + st.live + ' scored live)' : '') + ' recorded.');
  out.push('Installable web app (vanilla JavaScript + Firebase Firestore) with real-time sync across phones, database security rules, and automated end-to-end tests (Playwright) gating every release on GitHub Actions.');
  return out;
}
async function toggleStats(){
  showStats = !showStats; statsCopied = '';
  if(!showStats){ render(); return; }
  statsData = null; statsErr = ''; render();
  try{ statsData = computeUsageStats(await loadAllGamesData()); }
  catch(e){ statsErr = 'Couldn’t load the numbers. Check your connection and try again.'; }
  if(showStats) render();
}
function copyStatsLine(i){
  if(!statsData) return;
  const t = statsResumeLines(statsData)[i]; if(!t) return;
  const done = ()=>{ statsCopied = String(i); render(); setTimeout(()=>{ statsCopied = ''; if(showStats) render(); }, 1500); };
  try{ navigator.clipboard.writeText(t).then(done).catch(()=>window.prompt('Copy this:', t)); }catch(e){ window.prompt('Copy this:', t); }
}
function renderStatsModal(){
  if(!showStats) return '';
  if(!isHost()){ showStats = false; return ''; }
  const st = statsData;
  const pl = (n, one, many)=> n + ' ' + (n===1 ? one : (many || one + 's'));
  const tile = (n, label, sub)=>`<div class="st-tile"><b>${n}</b><span>${label}</span>${sub ? `<small>${sub}</small>` : ''}</div>`;
  return `
  <div class="modal-backdrop" onclick="if(event.target===this) toggleStats();">
    <div class="modal" style="max-width:560px;">
      <div class="row" style="justify-content:space-between; margin-bottom:4px;">
        <div class="panel-title" style="margin:0;">📈 Your numbers</div>
        <button class="icon-btn" onclick="toggleStats()">✕</button>
      </div>
      <div class="panel-sub">Every game you run, all time. Only you can see this.</div>
      ${!st ? `<div class="waiting-note" style="margin:30px 0;">${statsErr ? esc(statsErr) : 'Counting…'}</div>` : `
      <div class="st-grid">
        ${tile(st.people, 'players have played', st.dbPlayers + ' in your databases' + (st.guests ? ' · ' + st.guests + ' guests' : ''))}
        ${tile(st.active30, 'active in the last 30 days')}
        ${tile(st.matches, st.matches===1 ? 'match' : 'matches', st.results + ' with a result' + (st.live ? ' · ' + st.live + ' scored live' : ''))}
        ${tile(st.perWeek, 'matches a week', 'average over the last 8 weeks')}
        ${tile(rupees(st.feeTracked), 'turf costs tracked', pl(st.feeMatches, 'match', 'matches') + ' · ' + rupees(st.feeCollected) + ' settled' + (st.feeOwed ? ' · ' + rupees(st.feeOwed) + ' owed' : ''))}
        ${tile(st.weeks, 'weeks running', st.first ? 'since ' + esc(new Date(st.first).toLocaleDateString(undefined, {day:'numeric', month:'short', year:'numeric'})) : '')}
        ${tile(st.avgPlayers, 'players per match')}
        ${tile(st.scored, 'goals, runs & points logged', st.auctions ? pl(st.auctions, 'auction') + ' run' : '')}
      </div>
      ${st.perGame.length > 1 ? `<div class="fee-head">By game</div>${st.perGame.map(g=>`<div class="pay-row"><span>${(SPORTS[g.sport]||{}).icon||''} ${esc(g.name)}</span><span class="panel-sub" style="margin:0;">${pl(g.matches, 'match', 'matches')} · ${pl(g.players, 'player')}</span></div>`).join('')}` : ''}
      <div class="fee-head">For your resume</div>
      ${statsResumeLines(st).map((t,i)=>`<div class="st-line"><span>${esc(t)}</span><button class="btn btn-sm" onclick="copyStatsLine(${i})">${statsCopied===String(i) ? '✅ Copied' : 'Copy'}</button></div>`).join('')}
      <div class="panel-sub" style="margin:8px 0 0;">Numbers come straight from your match history, so they grow as you keep using it.</div>`}
    </div>
  </div>`;
}

