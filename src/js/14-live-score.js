/* ============================= Live score =============================
   The host taps the score in as the match happens; every phone shows it live.
   "Full time" saves the result (score, scorers, length) into the match record,
   exactly like the result form. Lives in S.live = {hid, startedAt, endedAt,
   status:'live'|'ended', events:[{id, team, pts, pid, ast, w}]}. */
const LIVE_SPORT = {
  football:   {btns:[{pts:1, label:'⚽ Goal'}], who:true, assist:true, clock:true},
  basketball: {btns:[{pts:1, label:'+1'},{pts:2, label:'+2'},{pts:3, label:'+3'}], who:true, assist:false, clock:true},
  cricket:    {btns:[{pts:1, label:'+1'},{pts:2, label:'+2'},{pts:4, label:'4'},{pts:6, label:'6'},{w:true, label:'Wkt'}], who:false, assist:false, clock:false},
  pickleball: {btns:[{pts:1, label:'+1 point'}], who:false, assist:false, clock:false}
};
let liveAsk = null;   // {team, pts, stage:'who'|'assist', pid}
function liveCfg(){ return LIVE_SPORT[SPORT.key] || LIVE_SPORT.football; }
function liveOn(){ return !!(S.live && S.live.status==='live' && S.live.hid===S.lastHistoryId && S.phase==='complete'); }
function liveShown(){ return !!(S.live && S.live.hid===S.lastHistoryId && S.phase==='complete'); }
function liveTotals(L){
  const t = {a:0, b:0, wa:0, wb:0};
  (L.events||[]).forEach(e=>{ if(e.w) t['w'+e.team]++; else t[e.team] += (e.pts||0); });
  return t;
}
function liveClockText(L){
  const end = L.endedAt || Date.now(), sec = Math.max(0, Math.floor((end - L.startedAt)/1000));
  return Math.floor(sec/60) + ':' + String(sec%60).padStart(2,'0');
}
function startLive(){
  if(!isHost() || !S.lastHistoryId) return;
  saveState({live: {hid: S.lastHistoryId, startedAt: Date.now(), endedAt: null, status: 'live', events: []}});
}
function liveTap(team, i){
  if(!liveOn() || !isHost()) return;
  const b = liveCfg().btns[i]; if(!b) return;
  if(liveCfg().who && !b.w){ liveAsk = {team, pts: b.pts, stage: 'who'}; render(); return; }
  liveAdd({team, pts: b.w ? 0 : b.pts, w: !!b.w, pid: null, ast: null});
}
function liveOwnGoal(){ if(!liveAsk) return; liveAsk.stage = 'og'; render(); }
function liveAskPick(pid){
  if(!liveAsk) return;
  if(liveAsk.stage==='og'){ liveAdd({team: liveAsk.team, pts: liveAsk.pts, w:false, og:true, pid: pid || null, ast: null}); liveAsk = null; render(); return; }
  if(liveAsk.stage==='who' && liveCfg().assist && pid){ liveAsk.pid = pid; liveAsk.stage = 'assist'; render(); return; }
  if(liveAsk.stage==='assist') liveAdd({team: liveAsk.team, pts: liveAsk.pts, w:false, pid: liveAsk.pid, ast: pid || null});
  else liveAdd({team: liveAsk.team, pts: liveAsk.pts, w:false, pid: pid || null, ast: null});
  liveAsk = null; render();
}
function liveAdd(ev){
  const L = JSON.parse(JSON.stringify(S.live));
  ev.id = 'e' + Date.now().toString(36); ev.at = Date.now() - L.startedAt;
  L.events = (L.events||[]).concat([ev]);
  try{ if(navigator.vibrate) navigator.vibrate(15); }catch(e){}
  saveState({live: L});
}
function liveUndo(){
  if(!liveOn() || !isHost()) return;
  const L = JSON.parse(JSON.stringify(S.live)); L.events = (L.events||[]).slice(0,-1); saveState({live: L});
}
let liveEndArm = false;
function liveFullTime(){
  if(!liveOn() || !isHost()) return;
  if(!liveEndArm){ liveEndArm = true; render(); setTimeout(()=>{ liveEndArm = false; render(); }, 4000); return; }
  liveEndArm = false;
  const L = JSON.parse(JSON.stringify(S.live)), t = liveTotals(L);
  const h = HISTORY.find(x=>x.id===L.hid);
  const teamAIds = (h && h.teamAIds) || getCompleteTeamIds().teamAIds, teamBIds = (h && h.teamBIds) || getCompleteTeamIds().teamBIds;
  const winner = t.a>t.b ? 'a' : t.b>t.a ? 'b' : 'draw';
  const sum = {}, ast = {};
  const og = {};
  (L.events||[]).forEach(e=>{
    if(e.og){ if(e.pid) og[e.pid] = (og[e.pid]||0) + 1; return; }
    if(e.pid && e.pts) sum[e.pid] = (sum[e.pid]||0) + e.pts; if(e.ast) ast[e.ast] = (ast[e.ast]||0) + 1;
  });
  const ownGoals = Object.keys(og).map(id=>({playerId:id, goals:og[id]}));
  const scorers = Object.keys(sum).map(id=>({playerId:id, goals:sum[id]}));
  const assists = Object.keys(ast).map(id=>({playerId:id, assists:ast[id]}));
  const minutes = Math.max(1, Math.round((Date.now() - L.startedAt)/60000));
  const duration = liveCfg().clock ? minutes : null;
  const extra = SPORT.teamWickets ? {wktsA: t.wa, wktsB: t.wb} : {};
  updateHistoryResult(L.hid, Object.assign({winner, scoreA: t.a, scoreB: t.b, scorers, assists, ownGoals, duration, live: true}, extra));
  applyMatchOutcome(teamAIds, teamBIds, winner, scorers, t.a, t.b, duration, assists);
  resultDraft.saved = true;
  L.status = 'ended'; L.endedAt = Date.now();
  saveState({live: L});
}
function liveEventText(e){
  const min = Math.floor((e.at||0)/60000) + 1;
  const time = liveCfg().clock ? '<span class="lf-t">' + min + '’</span>' : '';
  if(e.w) return time + '☝️ Wicket';
  if(e.og) return time + '⚽ ' + (e.pid ? esc(playerName(e.pid)) + ' <span class="lf-og">own goal</span>' : '<span class="lf-og">Own goal</span>');
  if(SPORT.key==='football') return time + '⚽ ' + (e.pid ? esc(playerName(e.pid)) : 'Goal') + (e.ast ? '<small>assist ' + esc(playerName(e.ast)) + '</small>' : '');
  return time + '+' + e.pts + (e.pid ? ' ' + esc(playerName(e.pid)) : '');
}
// one column per team, under that team's side of the score
function liveSideHtml(L, team){
  const all = (L.events||[]).filter(e=>e.team===team), max = 8, evs = all.slice(-max);
  return `<div class="lf-col ${team}">${all.length > max ? `<div class="lf-more">+${all.length - max} earlier</div>` : ''}${evs.map(e=>`<div class="lf-ev">${liveEventText(e)}</div>`).join('') || '<div class="lf-none">–</div>'}</div>`;
}
function liveCardHtml(){
  if(!liveShown()) return '';
  const L = S.live, t = liveTotals(L), on = L.status==='live';
  const sc = side=> String(t[side]) + (SPORT.teamWickets ? '/' + t['w'+side] : '');
  const evs = (L.events||[]).slice(-6).reverse();
  const cfg = liveCfg();
  const btnRow = team=> `<div class="live-btns">${cfg.btns.map((b,i)=>`<button class="btn ${b.w ? 'btn-danger' : 'btn-primary'} live-btn" onclick="liveTap('${team}', ${i})">${b.label}</button>`).join('')}</div>`;
  return `
  <div class="panel live-card ${on?'on':''}" id="liveCard">
    <div class="live-head">${on ? `<span class="live-dot"></span> LIVE${cfg.clock ? ` · <span id="liveClock">${liveClockText(L)}</span>` : ''}` : `🏁 FULL TIME${cfg.clock ? ' · ' + liveClockText(L) : ''}`}</div>
    <div class="live-score">
      <div class="lt a">Team A</div>
      <div class="ln"><span>${sc('a')}</span><i>:</i><span>${sc('b')}</span></div>
      <div class="lt b">Team B</div>
    </div>
    ${evs.length ? `<div class="live-feed">${liveSideHtml(L,'a')}${liveSideHtml(L,'b')}</div>` : (on ? `<div class="live-feed empty">Kick-off! Scores appear here as they happen.</div>` : '')}
    ${!on ? `<div class="poll-actions">${resultCardBtn(HISTORY.find(x=>x.id===L.hid), 'btn-primary')}</div>` : ''}
    ${isHost() && on ? `
      <div class="live-grid">
        <div><div class="lt a" style="margin-bottom:6px;">Team A</div>${btnRow('a')}</div>
        <div><div class="lt b" style="margin-bottom:6px;">Team B</div>${btnRow('b')}</div>
      </div>
      <div class="poll-actions">
        <button class="btn btn-sm" onclick="liveUndo()" ${(L.events||[]).length ? '' : 'disabled'}>↩ Undo last</button>
        <button class="btn btn-sm ${liveEndArm ? 'btn-danger' : 'btn-primary'}" onclick="liveFullTime()">${liveEndArm ? 'Tap again to save the result' : '🏁 Full time'}</button>
      </div>
      <div class="poll-list">Full time saves the score${cfg.who ? ', the ' + SPORT.s1.many + (cfg.assist ? ' and assists' : '') : ''}${cfg.clock ? ' and the match length' : ''} as the result. You can still add or fix details in 📜 Past matches.</div>` : ''}
  </div>`;
}
function renderLiveAsk(){
  if(!liveAsk || !liveOn()) { liveAsk = null; return ''; }
  const h = HISTORY.find(x=>x.id===S.live.hid);
  const ids = h ? (liveAsk.team==='a' ? h.teamAIds : h.teamBIds) || [] : (getCompleteTeamIds()[liveAsk.team==='a' ? 'teamAIds' : 'teamBIds'] || []);
  const other = liveAsk.team==='a' ? 'b' : 'a';
  const otherIds = h ? (other==='a' ? h.teamAIds : h.teamBIds) || [] : (getCompleteTeamIds()[other==='a' ? 'teamAIds' : 'teamBIds'] || []);
  const og = liveAsk.stage==='og';
  const pool = og ? otherIds : liveAsk.stage==='assist' ? ids.filter(id=>id!==liveAsk.pid) : ids;
  const title = og ? 'Own goal by?' : liveAsk.stage==='assist' ? 'Assist?' : (SPORT.key==='football' ? 'Who scored?' : 'Who scored the ' + liveAsk.pts + '?');
  return `
  <div class="modal-backdrop" onclick="if(event.target===this){ liveAsk=null; render(); }">
    <div class="modal" style="max-width:420px;">
      <div class="panel-title" style="margin:0 0 4px;">${title} <span style="color:var(--team${(og ? other : liveAsk.team).toUpperCase()});">· Team ${(og ? other : liveAsk.team).toUpperCase()}</span></div>
      ${og ? `<div class="panel-sub" style="margin:0;">Goal for Team ${liveAsk.team.toUpperCase()}. Pick the Team ${other.toUpperCase()} player who put it in their own net. It won’t count as their goal.</div>` : ''}
      <div class="live-pick">${pool.map(id=>`<button class="btn" onclick="liveAskPick('${id}')">${esc(playerName(id))}</button>`).join('')}</div>
      ${liveAsk.stage==='who' && SPORT.key==='football' ? `<button class="btn live-og-btn" onclick="liveOwnGoal()">🙃 Own goal (by a Team ${other.toUpperCase()} player)</button>` : ''}
      <div class="footer-actions" style="justify-content:flex-start; margin-top:12px;">
        <button class="btn btn-ghost" onclick="liveAskPick(null)">${liveAsk.stage==='assist' ? 'No assist' : og ? 'Skip (don’t know who)' : 'Skip (don’t know)'}</button>
        <button class="btn btn-ghost" onclick="liveAsk=null; render();">Cancel</button>
      </div>
    </div>
  </div>`;
}
setInterval(()=>{ const c = document.getElementById('liveClock'); if(c && liveOn()) c.textContent = liveClockText(S.live); }, 1000);


