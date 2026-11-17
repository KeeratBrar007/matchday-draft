/* ============================= Match-flow actions ============================= */

function setFormat(n){
  // changing the format changes what "exactly enough" even means, so any
  // earlier answer to the "is there an extra player" prompt no longer applies
  saveState({format:n, oddSide:null, extraConfirmedEven:false, benchOk:false});
}
/* ---- picking more players than the format needs ----
   When the host's tap (or drag, or Select all) would take the list past what the
   format needs, the extra players aren't ticked yet: the host is asked first
   (uneven teams, a bigger format, or extras on the bench), then they're added. */
let overflowAsk = null;   // {ids:[players waiting to be ticked]}
function selLimit(){ return (S.format||6)*2 + (S.oddSide ? 1 : 0); }
function overflowBlocked(){ return isHost() && !S.benchOk && (S.phase==='setup' || !S.phase); }
function overflowPlan(total){
  const f = S.format||6, plans = [];
  if(total % 2 === 1) plans.push({k:'uneven', label:'Uneven teams: ' + ((total+1)/2) + 'v' + ((total-1)/2), sub:'One team gets the extra player'});
  const big = Math.ceil(total/2);
  if(big > f) plans.push({k:'bigger', label:'Make it ' + big + 'v' + big, sub: big*2 + ' players' + (big*2 > total ? ' (' + (big*2-total) + ' more needed)' : '')});
  plans.push({k:'bench', label:'Keep ' + f + 'v' + f + ', extras on the bench', sub:'They come on as subs'});
  return plans;
}
function resolveOverflow(k){
  if(!isHost()) return;
  const ask = overflowAsk || {ids:[]};
  const sel = (S.selectedIds||[]).slice(), t = new Date().toISOString();
  const add = (ask.ids||[]).filter(id=>!sel.includes(id));
  overflowAsk = null;
  if(k==='cancel'){ render(); return; }
  const next = sel.concat(add), total = next.length;
  const patch = {selectedIds: next, rsvpLog: (S.rsvpLog||[]).concat(add.map(id=>({id, a:'in', t, by:'host'}))).slice(-300)};
  if(k==='uneven'){ Object.assign(patch, {format:(total-1)/2, oddSide: Math.random()<0.5 ? 'a' : 'b', extraConfirmedEven:false, benchOk:false}); }
  else if(k==='bigger'){ Object.assign(patch, {format:Math.ceil(total/2), oddSide:null, extraConfirmedEven:false, benchOk:false}); }
  else if(k==='bench'){ patch.benchOk = true; }
  saveState(patch);
}
function renderOverflowAsk(){
  if(!overflowAsk) return '';
  if(!isHost()){ overflowAsk = null; return ''; }
  const sel = S.selectedIds||[], add = overflowAsk.ids.filter(id=>!sel.includes(id));
  const total = sel.length + add.length, f = S.format||6, need = selLimit();
  return `
  <div class="modal-backdrop" onclick="if(event.target===this) resolveOverflow('cancel');">
    <div class="modal" style="max-width:420px;" role="dialog" aria-labelledby="ovTitle">
      <div class="panel-title" id="ovTitle" style="margin:0 0 4px;">That’s ${total} players</div>
      <div class="panel-sub" style="margin:0 0 10px;">${f}v${f}${S.oddSide ? ' with one extra' : ''} needs ${need}, and ${sel.length} ${sel.length===1?'is':'are'} already ticked. ${add.length ? 'Adding <b>' + esc(add.map(playerName).join(', ')) + '</b> goes over. What’s the plan?' : 'What’s the plan?'}</div>
      <div class="ov-plans">${overflowPlan(total).map(p=>`<button class="btn ov-plan" onclick="resolveOverflow('${p.k}')"><b>${esc(p.label)}</b><small>${esc(p.sub)}</small></button>`).join('')}</div>
      <div class="footer-actions" style="justify-content:flex-start; margin-top:10px;">
        <button class="btn btn-ghost" onclick="resolveOverflow('cancel')">${add.length ? 'Cancel, don’t add ' + (add.length===1 ? esc(playerName(add[0])) : 'these ' + add.length) : 'Decide later'}</button>
      </div>
    </div>
  </div>`;
}
function confirmEvenTeams(){ saveState({extraConfirmedEven:true}); }
function confirmExtraPlayer(){ saveState({oddSide: Math.random()<0.5 ? 'a' : 'b'}); }
function bumpFormatForExtra(){ setFormat(S.format+1); }

/* ---- quick selection: select all / clear, and drag across rows ---- */
function selectAllVisible(on){
  if(!isHost()) return;
  const rows = [...document.querySelectorAll('li.select-row[data-pid]:not(.locked)')].map(li=>li.dataset.pid);
  commitSelection(rows, on);
}
function commitSelection(ids, on){
  if(on && overflowBlocked()){
    const cur = S.selectedIds||[], adds = ids.filter(id=>!cur.includes(id)), room = Math.max(0, selLimit() - cur.length);
    if(adds.length > room){
      overflowAsk = {ids: adds.slice(room)};
      ids = adds.slice(0, room);
      if(!ids.length){ render(); return; }
    }
  }
  const sel = new Set(S.selectedIds||[]), t = new Date().toISOString(), log = [];
  ids.forEach(pid=>{
    const was = sel.has(pid);
    if(on && !was){ sel.add(pid); log.push({id:pid, a:'in', t, by:'host'}); }
    if(!on && was){ sel.delete(pid); log.push({id:pid, a:'out', t, by:'host'}); }
  });
  if(log.length) saveState({selectedIds: [...sel], rsvpLog: (S.rsvpLog||[]).concat(log).slice(-300)});
  if(!on && pollWaitActive()){
    const m = pollVotesMap();
    log.filter(e=>e.a==='out').forEach(e=>{ const v = m[e.id]; if(v && !v.no && db) db.doc(squadPath('pollVotes/' + S.poll.id + '__' + e.id)).set({pollId:S.poll.id, playerId:e.id, slots:[], no:true, at:new Date().toISOString()}).catch(()=>{}); else if(v && !db){ POLLVOTES = POLLVOTES.map(x=>x===v ? Object.assign({}, x, {slots:[], no:true}) : x); } });
  }
}
const DRAG = {mode:null, pending:null, timer:null, x:0, y:0, raf:null, suppressClick:false, pendingRender:false};
function dragRowAt(x, y, sel){ const el = document.elementFromPoint(x, y); return el ? el.closest(sel) : null; }
function dsBegin(li){
  DRAG.mode = 'select'; DRAG.target = !li.classList.contains('selected'); DRAG.changed = new Set();
  DRAG.selCount = (S.selectedIds||[]).length;
  document.body.classList.add('drag-selecting');
  try{ if(navigator.vibrate) navigator.vibrate(12); }catch(e){}
  dsApply(li); dragAutoScroll();
}
function dsApply(li){
  if(!li || li.classList.contains('locked') || !li.dataset.pid) return;
  if(li.classList.contains('selected') !== DRAG.target){
    if(DRAG.target && overflowBlocked() && DRAG.selCount >= selLimit()){ DRAG.changed.add(li.dataset.pid); li.classList.add('over-limit'); return; }
    DRAG.selCount += DRAG.target ? 1 : -1;
    li.classList.toggle('selected', DRAG.target);
    const cb = li.querySelector('.check-box'); if(cb) cb.textContent = DRAG.target ? '✓' : '';
  }
  DRAG.changed.add(li.dataset.pid);
}
function dsEnd(){
  document.body.classList.remove('drag-selecting');
  const ids = [...DRAG.changed], on = DRAG.target;
  DRAG.mode = null; DRAG.suppressClick = true; setTimeout(()=>{ DRAG.suppressClick = false; }, 400);
  commitSelection(ids, on);
  if(DRAG.pendingRender){ DRAG.pendingRender = false; render(); }
}
function roBegin(li){
  DRAG.mode = 'reorder'; DRAG.li = li; DRAG.list = li.parentElement;
  DRAG.startOrder = [...DRAG.list.querySelectorAll('li[data-rank-id]')].map(x=>x.dataset.rankId);
  li.classList.add('dragging');
  document.body.classList.add('drag-selecting');
  try{ if(navigator.vibrate) navigator.vibrate(12); }catch(e){}
  dragAutoScroll();
}
function roMove(){
  const over = dragRowAt(DRAG.x, DRAG.y, 'li[data-rank-id]');
  if(!over || over===DRAG.li || over.parentElement!==DRAG.list) return;
  const r = over.getBoundingClientRect();
  if(DRAG.y < r.top + r.height/2) DRAG.list.insertBefore(DRAG.li, over);
  else DRAG.list.insertBefore(DRAG.li, over.nextSibling);
}
function roEnd(){
  const li = DRAG.li; li.classList.remove('dragging'); document.body.classList.remove('drag-selecting');
  const order = [...DRAG.list.querySelectorAll('li[data-rank-id]')].map(x=>x.dataset.rankId);
  DRAG.mode = null; DRAG.suppressClick = true; setTimeout(()=>{ DRAG.suppressClick = false; }, 400);
  if(order.join('|') !== DRAG.startOrder.join('|')) movePlayersToOrder(order);
  if(DRAG.pendingRender){ DRAG.pendingRender = false; }
  render();
}
function movePlayersToOrder(order){
  if(!isHost()) return;
  const next = cloneSquad();
  const byId = {}; next.players.forEach(p=>{ byId[p.id] = p; });
  const moved = order.map(id=>byId[id]).filter(Boolean);
  const rest = next.players.filter(p=>!order.includes(p.id));
  next.players = moved.concat(rest);
  syncRankBaseline(next);
  saveSquadDoc(next);
}
function dragAutoScroll(){
  cancelAnimationFrame(DRAG.raf);
  const step = ()=>{
    if(!DRAG.mode) return;
    const box = DRAG.mode==='reorder' ? (DRAG.li.closest('.modal-backdrop') || null) : null;
    const edge = 70, h = window.innerHeight;
    const dy = DRAG.y < edge ? -12 : (DRAG.y > h - edge ? 12 : 0);
    if(dy){ if(box) box.scrollTop += dy; else window.scrollBy(0, dy); }
    if(DRAG.mode==='select') dsApply(dragRowAt(DRAG.x, DRAG.y, 'li.select-row[data-pid]'));
    else if(DRAG.mode==='reorder') roMove();
    DRAG.raf = requestAnimationFrame(step);
  };
  DRAG.raf = requestAnimationFrame(step);
}
function dragPointerDown(target, x, y, isTouch){
  if(!isHost()) return false;
  const handle = target.closest && target.closest('.drag-handle');
  if(handle){ const li = handle.closest('li[data-rank-id]'); if(li){ DRAG.x = x; DRAG.y = y; roBegin(li); return true; } }
  const li = target.closest && target.closest('li.select-row[data-pid]');
  if(!li || li.classList.contains('locked') || target.closest('button, input, .edit-panel')) return false;
  DRAG.pending = {li, x, y, onBox: !!target.closest('.check-box')};
  DRAG.x = x; DRAG.y = y;
  clearTimeout(DRAG.timer);
  if(isTouch && !DRAG.pending.onBox){
    // press and hold a name, then drag
    DRAG.timer = setTimeout(()=>{ if(DRAG.pending && !DRAG.mode){ const p = DRAG.pending; DRAG.pending = null; dsBegin(p.li); } }, 320);
    // safety: never hold the screen for long if no touch-end arrives
    setTimeout(()=>{ if(DRAG.pending && !DRAG.mode){ DRAG.pending = null; if(DRAG.pendingRender){ DRAG.pendingRender = false; render(); } } }, 4000);
  }
  return DRAG.pending.onBox;
}
function dragPointerMove(x, y){
  DRAG.x = x; DRAG.y = y;
  if(DRAG.mode) return true;
  const p = DRAG.pending; if(!p) return false;
  const moved = Math.abs(x - p.x) + Math.abs(y - p.y) > 8;
  if(!moved) return false;
  const over = dragRowAt(x, y, 'li.select-row[data-pid]');
  if(p.mouse && !p.onBox && (!over || over===p.li)) return false;   // still on the first row: keep waiting
  if(p.onBox || (over && over!==p.li && p.mouse)){ DRAG.pending = null; clearTimeout(DRAG.timer); dsBegin(p.li); dsApply(over); return true; }
  // a normal swipe: let the page scroll
  DRAG.pending = null; clearTimeout(DRAG.timer);
  if(DRAG.pendingRender){ DRAG.pendingRender = false; setTimeout(render, 0); }
  return false;
}
function dragPointerUp(){
  clearTimeout(DRAG.timer); DRAG.pending = null;
  if(DRAG.mode==='select') dsEnd();
  else if(DRAG.mode==='reorder') roEnd();
  else if(DRAG.pendingRender){ DRAG.pendingRender = false; setTimeout(render, 0); }
}
document.addEventListener('touchstart', e=>{ if(e.touches.length!==1) return; const t = e.touches[0]; dragPointerDown(e.target, t.clientX, t.clientY, true); }, {passive:true});
document.addEventListener('touchmove', e=>{ const t = e.touches[0]; if(!t) return; if(dragPointerMove(t.clientX, t.clientY) && e.cancelable) e.preventDefault(); }, {passive:false});
document.addEventListener('touchend', ()=>dragPointerUp(), {passive:true});
document.addEventListener('touchcancel', ()=>dragPointerUp(), {passive:true});
document.addEventListener('mousedown', e=>{ if(e.button!==0) return; if(dragPointerDown(e.target, e.clientX, e.clientY, false) || DRAG.mode) e.preventDefault(); if(DRAG.pending) DRAG.pending.mouse = true; });
document.addEventListener('mousemove', e=>{ if((DRAG.pending || DRAG.mode) && dragPointerMove(e.clientX, e.clientY)) e.preventDefault(); });
document.addEventListener('mouseup', ()=>dragPointerUp());
document.addEventListener('click', e=>{ if(DRAG.suppressClick){ e.stopPropagation(); e.preventDefault(); DRAG.suppressClick = false; } }, true);
document.addEventListener('contextmenu', e=>{ if(DRAG.mode || DRAG.pending) e.preventDefault(); });

function toggleSelected(id){
  if(!isHost() && id !== getMyPlayerId()) return; // players can only tick themselves in or out
  const sel = S.selectedIds||[];
  const isIn = sel.includes(id);
  if(!isIn && overflowBlocked() && sel.length + 1 > selLimit()){ overflowAsk = {ids:[id]}; render(); return; }
  if(pollWaitActive() && findPlayer(id) && !isGuest(id)){
    const p = S.poll, v = pollVotesMap()[id];
    if(isIn) return castPollVote(id, [], true);
    const slots = ((v && !v.no) ? (v.slots||[]) : []).filter(x=>x!==p.decided).concat([p.decided]);
    return castPollVote(id, slots, false, isHost());   // the host can squeeze someone in past the limit
  }
  const log = (S.rsvpLog||[]).concat([{id, a: isIn ? 'out' : 'in', t:new Date().toISOString(), by: id===getMyPlayerId() ? 'self' : 'host'}]).slice(-300);
  saveState({selectedIds: isIn ? sel.filter(x=>x!==id) : sel.concat([id]), rsvpLog:log});
}

/* ---- attendance: who turns up, who drops out late ----
   A "drop-out" is someone who ticked in and then out again (themselves or via the host).
   It's "late" when that happened within LATE_HOURS of the host locking the squad. */
const ATT_WINDOW = 10, LATE_HOURS = 4;
function liveDrops(now){
  const sel = new Set(S.selectedIds||[]);
  const last = {}, everIn = new Set();
  (S.rsvpLog||[]).forEach(e=>{ last[e.id] = e; if(e.a==='in') everIn.add(e.id); });
  const out = [];
  Object.keys(last).forEach(id=>{
    const e = last[id];
    if(e.a==='out' && everIn.has(id) && !sel.has(id) && !isGuest(id) && findPlayer(id)){
      const hrs = ((now||Date.now()) - new Date(e.t).getTime()) / 36e5;
      out.push({id, late: hrs <= LATE_HOURS, at:e.t});
    }
  });
  return out;
}
function buildAttendanceSnap(){
  return {
    at:new Date().toISOString(),
    expected:(S.selectedIds||[]).filter(id=>!isGuest(id)),
    dropped:liveDrops().map(d=>({id:d.id, late:d.late}))
  };
}
function goToMode(){
  const pool = computePlayingPool();
  saveState(Object.assign({phase:'mode', attSnap:buildAttendanceSnap()}, pool));
}

function backToSetup(){
  saveState({phase:'setup', mode:null, randomResult:null, captains:{a:null,b:null},
    captainPickMode:null, auction:null, playingIds:null, subIds:null});
}

function chooseMode(mode){
  if(mode==='random'){
    saveState({mode:'random', phase:'random', randomResult: computeRandomSplit()});
  }else{
    saveState({mode:'draft', phase:'captains', captainPickMode:null, captains:{a:null,b:null}});
  }
}

function reshuffleRandom(){
  saveState({randomResult: computeRandomSplit()});
}

function confirmRandom(){
  const r = S.randomResult;
  resultDraft = {winner:null, scoreA:'', scoreB:'', duration:'', scorers:[], assists:[], saved:false, ps:{}, wktsA:'', wktsB:''};
  const id = addToHistory({
    date:new Date().toISOString(),
    format:S.format,
    mode:'random',
    teamA:{players:r.teamA.map(playerName)}, teamAIds:r.teamA,
    teamB:{players:r.teamB.map(playerName)}, teamBIds:r.teamB,
    subs:r.subs.map(playerName), subIds:r.subs,
    att:S.attSnap || null
  });
  saveState({phase:'complete', lastHistoryId:id});
}

function setCaptainPickMode(m){
  saveState({captainPickMode:m, captains:{a:null,b:null}});
  manualPickStage = 'a';
}

function randomizeCaptains(){
  const pool = shuffledCopy(S.playingIds);
  saveState({captains:{a:pool[0], b:pool[1]}});
}

function manualPick(id){
  const caps = Object.assign({}, S.captains);
  if(caps.a===id || caps.b===id) return;
  if(!caps.a){ caps.a = id; manualPickStage = 'b'; }
  else if(!caps.b){ caps.b = id; manualPickStage = 'done'; }
  saveState({captains:caps});
}

function resetCaptains(){
  manualPickStage = 'a';
  saveState({captains:{a:null,b:null}});
}

function goToBudget(){
  saveState({phase:'budget'});
}

function startAuction(budget, basePrice, increment, timerSecs){
  const order = S.playingIds
    .filter(id=> id!==S.captains.a && id!==S.captains.b)
    .sort((x,y)=> rankOf(y)-rankOf(x));
  const auction = {
    order, index:0,
    currentBid: basePrice, leader:null, passesInARow:0,
    openToggle:true, turn:'a',
    teamA:{ids:[S.captains.a], budget}, teamB:{ids:[S.captains.b], budget},
    // per-team roster size — usually both S.format, but one side carries the
    // extra player when the host confirmed an odd headcount at setup
    capA: S.format + (S.oddSide==='a' ? 1 : 0),
    capB: S.format + (S.oddSide==='b' ? 1 : 0),
    log:[], done:false, savedToHistory:false
  };
  nextPlayerSetup(auction, basePrice); // seed the correct opening turn for player #1
  saveState({phase:'auction', budget, basePrice, increment, timerSecs: (timerSecs!=null && isFinite(timerSecs)) ? timerSecs : S.timerSecs, auction});
}

function nextPlayerSetup(auction, basePrice){
  auction.currentBid = basePrice;
  auction.leader = null;
  auction.passesInARow = 0;
  auction.turn = auction.openToggle ? 'a' : 'b';
  auction.openToggle = !auction.openToggle;
  return auction;
}

// A captain can bid the minimum (currentBid) or any higher amount up to
// their remaining budget. The other side then has to beat it by at least
// one increment.
let bidDrafts = {a:'', b:''}, bidErr = {a:'', b:''};
function auctionBid(team, amount){
  const a = JSON.parse(JSON.stringify(S.auction));
  if(a.done || a.turn!==team) return;
  const teamObj = team==='a' ? a.teamA : a.teamB;
  const min = a.currentBid;
  let price = (amount==null || amount==='') ? min : Math.round(Number(amount));
  if(!isFinite(price) || price < min){ bidErr[team] = 'The lowest bid now is ₹' + min + '.'; render(); return; }
  if(price > teamObj.budget){ bidErr[team] = 'You only have ₹' + teamObj.budget + ' left.'; render(); return; }
  bidErr[team] = ''; bidDrafts[team] = '';
  a.note = price > min ? 'Team ' + team.toUpperCase() + ' jumped to ₹' + price + '.' : null;
  a.leader = team;
  a.passesInARow = 0;
  a.turn = team==='a' ? 'b' : 'a';
  a.pendingLeaderPrice = price;              // what they pay if nobody beats it
  a.currentBid = price + S.increment;        // what the other side must bid next
  saveState({auction:a});
}
function bidFromInput(team){ auctionBid(team, bidDrafts[team]); }

function auctionPass(team, auto){
  const a = JSON.parse(JSON.stringify(S.auction));
  if(a.done || a.turn!==team) return;
  a.note = auto ? 'Team ' + team.toUpperCase() + ' ran out of time \u2014 passed automatically.' : null;
  // fall back to S.format for an auction started before capA/capB existed
  if(a.capA==null) a.capA = S.format;
  if(a.capB==null) a.capB = S.format;

  if(a.leader){
    // sell to the leader at the price they locked in
    const winner = a.leader;
    const price = a.pendingLeaderPrice != null ? a.pendingLeaderPrice : S.basePrice;
    const pid = a.order[a.index];
    const teamObj = winner==='a' ? a.teamA : a.teamB;
    teamObj.ids.push(pid);
    teamObj.budget -= price;
    a.log.push({playerId:pid, team:winner, price, free:false});
    a.index++;
    runAutoFill(a, a.capA, a.capB);
    finishAuctionIfDone(a, a.capA, a.capB);
    if(!a.done) nextPlayerSetup(a, S.basePrice);
  } else {
    a.passesInARow++;
    if(a.passesInARow>=2){
      // nobody wanted this player at the asking price — hand it to
      // whichever team currently has fewer players
      const pid = a.order[a.index];
      const short = a.teamA.ids.length <= a.teamB.ids.length ? 'a' : 'b';
      const teamObj = short==='a' ? a.teamA : a.teamB;
      teamObj.ids.push(pid);
      a.log.push({playerId:pid, team:short, price:0, free:true});
      a.index++;
      runAutoFill(a, a.capA, a.capB);
      finishAuctionIfDone(a, a.capA, a.capB);
      if(!a.done) nextPlayerSetup(a, S.basePrice);
    } else {
      a.turn = team==='a' ? 'b' : 'a';
    }
  }
  saveState({auction:a});
}

// What each player went for in the auction: {playerId: {p:price, f:true if handed out free}}.
function auctionPriceMap(a){
  const out = {};
  (a.log||[]).forEach(l=>{ if(l && l.playerId) out[l.playerId] = {p: l.price||0, f: !!l.free}; });
  return out;
}
function saveAuctionToHistory(){
  const a = S.auction;
  resultDraft = {winner:null, scoreA:'', scoreB:'', duration:'', scorers:[], assists:[], saved:false, ps:{}, wktsA:'', wktsB:''};
  const id = addToHistory({
    date:new Date().toISOString(),
    format:S.format,
    mode:'draft',
    teamA:{captain:playerName(S.captains.a), players:a.teamA.ids.map(playerName)}, teamAIds:a.teamA.ids,
    teamB:{captain:playerName(S.captains.b), players:a.teamB.ids.map(playerName)}, teamBIds:a.teamB.ids,
    subs:(S.subIds||[]).map(playerName), subIds:S.subIds||[],
    att:S.attSnap || null,
    prices: auctionPriceMap(a),
    captainIds:{a:S.captains.a||null, b:S.captains.b||null}
  });
  saveState({auction:Object.assign({}, a, {savedToHistory:true}), phase:'complete', lastHistoryId:id});
}

// Lets either captain (or the host) stop bidding early and have whatever's
// left of the roster divided between the two teams — still balanced by
// ability, position and chemistry against what each side already bought.
function randomizeRemaining(){
  const a = JSON.parse(JSON.stringify(S.auction));
  if(a.done) return;
  const capA = a.capA || S.format, capB = a.capB || S.format;
  const remaining = a.order.slice(a.index);
  const needA = Math.max(0, capA - a.teamA.ids.length);
  const needB = Math.max(0, capB - a.teamB.ids.length);
  const {sideAIds, sideBIds} = balancedAssign(remaining, a.teamA.ids, a.teamB.ids, needA, needB);
  sideAIds.forEach(pid=>{ a.teamA.ids.push(pid); a.log.push({playerId:pid, team:'a', price:0, free:true}); });
  sideBIds.forEach(pid=>{ a.teamB.ids.push(pid); a.log.push({playerId:pid, team:'b', price:0, free:true}); });
  a.index = a.order.length;
  a.leader = null;
  a.done = true;
  saveState({auction:a});
}

function getCompleteTeamIds(){
  if(S.mode==='draft' && S.auction){
    return {teamAIds:S.auction.teamA.ids, teamBIds:S.auction.teamB.ids, subIds:S.subIds||[]};
  } else if(S.randomResult){
    return {teamAIds:S.randomResult.teamA, teamBIds:S.randomResult.teamB, subIds:S.randomResult.subs};
  }
  return {teamAIds:[], teamBIds:[], subIds:[]};
}

function startNewMatch(){
  saveState(Object.assign(defaultState(), {
    format:S.format,
    selectedIds:(S.selectedIds||[]).filter(id=>findPlayer(id)),
    budget:S.budget, basePrice:S.basePrice, increment:S.increment, timerSecs:S.timerSecs,
    poll:S.poll||null, live:null,
    // anyone carried over from last time counts as "in" from now, so pulling out late is still noticed
    rsvpLog:(S.selectedIds||[]).filter(id=>findPlayer(id)).map(id=>({id, a:'in', t:new Date().toISOString(), by:'carry'}))
  }));
}

function claimHost(){
  isHostDevice = true;
  try{ localStorage.setItem('md_is_host', '1'); }catch(e){}
  render();
  syncHostClaim();
}
function releaseHost(){
  isHostDevice = false;
  try{ localStorage.setItem('md_is_host', '0'); localStorage.removeItem('md_host_uid'); }catch(e){}
  if(db && AUTH_UID) db.doc('hostClaims/' + AUTH_UID).delete().catch(()=>{});
  hostClaimState = 'na';
  setTimeout(reconnectAll, 400);
  render();
}

/* ---- database lock: anonymous sign-in + a host claim the security rules check ----
   Every phone signs in anonymously (no account, nothing to type). The host's phone
   then writes hostClaims/<its sign-in id> containing the host code; the Firestore
   rules only accept that write if the code is right, and only let phones with a
   claim change the roster, results and squads. */
async function ensureAuth(){
  if(!FB_AUTH){ authStatus = 'none'; return; }
  try{
    const res = await Promise.race([
      FB_AUTH.signInAnonymously(),
      new Promise((_,rej)=>setTimeout(()=>rej({code:'timeout'}), 8000))
    ]);
    AUTH_UID = (res && res.user && res.user.uid) || (FB_AUTH.currentUser && FB_AUTH.currentUser.uid) || null;
    authStatus = AUTH_UID ? 'ok' : 'error';
  }catch(e){
    const c = (e && e.code) || '';
    authStatus = (c==='auth/operation-not-allowed' || c==='auth/admin-restricted-operation') ? 'off' : 'error';
  }
}
async function syncHostClaim(){
  if(!isHostDevice){ hostClaimState = 'na'; return; }
  if(!db || !AUTH_UID){ hostClaimState = 'unknown'; return; }
  const ref = db.doc('hostClaims/' + AUTH_UID);
  if(pendingHostCode){
    try{
      await ref.set({code: pendingHostCode, at: new Date().toISOString()});
      pendingHostCode = null;
      hostClaimState = 'ok';
      try{ localStorage.setItem('md_host_uid', AUTH_UID); }catch(e){}
      reconnectAll();   // now allowed to see every game
    }catch(e){ hostClaimState = 'needed'; }
    render(); return;
  }
  let known = null; try{ known = localStorage.getItem('md_host_uid'); }catch(e){}
  if(known === AUTH_UID){ hostClaimState = 'ok'; return; }
  try{
    const snap = await ref.get();
    hostClaimState = snap.exists ? 'ok' : 'needed';
    if(snap.exists){ try{ localStorage.setItem('md_host_uid', AUTH_UID); }catch(e){} }
  }catch(e){ hostClaimState = 'unknown'; }
  render();
}
function confirmHostFromBanner(){
  if(isHostCode(hostConfirmDraft)){
    pendingHostCode = hostConfirmDraft; hostConfirmDraft = ''; hostConfirmErr = false;
    syncHostClaim();
  }else{ hostConfirmErr = true; render(); }
}
function onWriteError(e, path){
  if(!e || e.code !== 'permission-denied') return;
  if(path && /^(logins|access)\//.test(String(path))) return;
  if(path && String(path).indexOf('/pollVotes/') >= 0){
    deniedToast = isHost()
      ? 'Poll answers can’t be saved yet: add the poll rule in Firebase (SETUP.md, Part 7).'
      : 'Your answer wasn’t saved: the host still needs to switch polls on in the database.';
    clearTimeout(deniedTimer); deniedTimer = setTimeout(()=>{ deniedToast = null; render(); }, 8000);
    render(); return;
  }
  if(isHost()){ hostClaimState = 'needed'; deniedToast = 'That change wasn’t saved. Confirm your host code in the yellow box at the top, then try again.'; }
  else { deniedToast = 'That change wasn’t saved — only the host can do that.'; try{ resyncNow(true); }catch(_){} }
  clearTimeout(deniedTimer); deniedTimer = setTimeout(()=>{ deniedToast = null; render(); }, 6000);
  render();
}
function deniedToastHtml(){
  return deniedToast ? `<div class="update-toast" role="alert"><span>🔒 ${esc(deniedToast)}</span><button class="btn btn-sm" onclick="deniedToast=null; render();">OK</button></div>` : '';
}
function hostLockBannerHtml(){
  if(!isHost() || !db) return '';
  if(authStatus==='off') return `<div class="banner amber">🔒 Database lock: anonymous sign-in isn’t switched on in Firebase yet. Follow step 1 of “Part 6” in SETUP.md. Until then the app works as before, without the lock.</div>`;
  if(authStatus==='error') return `<div class="banner amber">🔒 This phone couldn’t sign in to the database, so your changes may not save. Check the connection, then close and reopen the app.</div>`;
  if(hostClaimState!=='needed') return '';
  return `<div class="banner amber">
    <div style="margin-bottom:8px;">🔒 Confirm your host code once on this phone so your changes save.</div>
    <div class="row" style="gap:8px;">
      <input type="password" class="field-input grow" style="min-width:0;" id="hostConfirmInput" placeholder="Host code" autocomplete="off" value="${esc(hostConfirmDraft)}" oninput="hostConfirmDraft=this.value" onkeydown="if(event.key==='Enter') confirmHostFromBanner();">
      <button class="btn btn-primary" style="flex:none;" onclick="confirmHostFromBanner()">Confirm</button>
    </div>
    ${hostConfirmErr ? `<div class="login-err">That isn’t the host code.</div>` : ''}
  </div>`;
}
// The manual fallback for becoming host on a device that didn't come in
// through the secret host link — same shared secret, just typed in instead.
function toggleHostCode(){
  showHostCode = !showHostCode;
  hostCodeDraft = '';
  loginError = '';
  hostCodeError = false;
  render();
}
function submitHostCode(){
  if(isHostCode(hostCodeDraft)){
    pendingHostCode = hostCodeDraft;
    showHostCode = false;
    hostCodeDraft = '';
    hostCodeError = false;
    claimHost();
  } else {
    hostCodeError = true;
    render();
  }
}
// Which roster player this device belongs to, if any — scoped per squad
// since the same phone might be a captain in one squad and a spectator in
// another. null means "just spectating".
function normName(s){ return String(s||'').trim().replace(/\s+/g,' ').toLowerCase(); }
function getLoginName(){
  try{ return localStorage.getItem('md_login_name') || ''; }catch(e){ return ''; }
}
function findPlayerByName(name){
  const n = normName(name);
  if(!n) return null;
  return allPlayersArr().find(p=>normName(p.name)===n) || null;
}
// Login is just a name: whichever player in this squad's roster has that name.
// Stored as a name (not an id) so it keeps working if the host switches squads
// and the same person is in both.
function getMyPlayerId(){
  const p = findPlayerByName(getLoginName());
  return p ? p.id : null;
}
/* ---- optional 4-digit PIN: stops someone typing a captain's name and bidding for them.
   Stored only as a salted SHA-256 hash in a shared doc, so it works from any phone. ---- */
const _pinKeyCache = {};
function pinKey(name){
  const n = normName(name);
  return _pinKeyCache[n] || (_pinKeyCache[n] = sha256Hex('md-pin-key|' + n).slice(0, 24));
}
function pinHash(name, pin){ return sha256Hex('md-pin|' + normName(name) + '|' + pin); }
function localPinHash(){ try{ return localStorage.getItem('md_login_pin') || ''; }catch(e){ return ''; } }
function hasPin(name){ return !!(db && PINS[pinKey(name)]); }
// Signed in as a name that has a PIN, but this phone hasn't proven it knows it
// (or the PIN was changed on another phone) -> back to the PIN prompt.
function pinLocked(){
  const n = getLoginName();
  if(!db || !n) return false;
  const h = PINS[pinKey(n)];
  return !!h && localPinHash() !== h;
}
function currentPinStep(){
  if(pinStep) return pinStep;
  const n = getLoginName();
  if(n && getMyPlayerId() && pinLocked()) return {name:n};
  return null;
}
function isLoggedIn(){
  if(pinLocked()) return false;
  if(getMyPlayerId()) return true;
  // privacy rules: trust the login until the name index has answered, then require at least one game
  if(db && squadsMode==='access' && getLoginName()) return accessIds===null || accessIds.length > 0;
  // on another game's list counts too (this game just shows view-only)
  return !!db && !!getLoginName() && (!allRostersLoaded || gamesForName(getLoginName()).length > 0);
}
function doLoginAs(name, hash){
  try{
    localStorage.setItem('md_login_name', name);
    if(hash) localStorage.setItem('md_login_pin', hash); else localStorage.removeItem('md_login_pin');
  }catch(e){}
  afterLogin();
}
const loginAccessChecked = {}, loginRetried = {};
function submitLogin(){
  if(currentPinStep()){ submitPin(); return; }
  const typed = (loginDraft||'').trim();
  if(!typed){ loginError = 'Type your name first.'; render(); return; }
  let p = findPlayerByName(typed);
  if(!p && db){
    if(!allRostersLoaded && squadsMode==='list'){ loginError = 'Checking…'; loginRetryPending = true; loadAllRosters(); render(); return; }
    const games = gamesForName(typed);
    if(games.length){
      const real = namesInGame(games[0].id).find(x=>normName(x)===normName(typed));
      p = {name: real || typed};
      if(!pickedSquadId && games.length===1) switchSquad(games[0].id);
    }else if(!loginAccessChecked[normName(typed)]){
      // privacy rules: this phone can't see the player lists yet, so ask the name index
      loginError = 'Checking…'; render();
      db.doc('access/' + accessKey(typed)).get().then(snap=>{
        const ids = (snap.exists && snap.data() && snap.data().squads) || [];
        if(!ids.length && !loginRetried[normName(typed)]){
          // just added by the host? their app publishes the list a moment later - look once more
          loginRetried[normName(typed)] = true;
          setTimeout(submitLogin, 1500); return;
        }
        loginAccessChecked[normName(typed)] = ids.length ? 'yes' : 'no';
        if(ids.length && !pickedSquadId && ids.length===1){ pickedSquadId = ids[0]; try{ localStorage.setItem('md_squad', ids[0]); }catch(e){} }
        submitLogin();
      }).catch(()=>{ loginAccessChecked[normName(typed)] = 'no'; submitLogin(); });
      return;
    }else{
      // use the index answer once; a "not found" is re-checked next time (the host may have just added them)
      if(loginAccessChecked[normName(typed)]==='yes') p = {name: typed};
      delete loginAccessChecked[normName(typed)]; delete loginRetried[normName(typed)];
    }
  }
  if(!p){ loginError = 'We couldn’t find “' + typed + '”. Check the spelling, or ask the host to add you.'; render(); return; }
  if(!pickedSquadId && db && squadsList.length>1){
    const g = gamesForName(p.name);
    if(g.length===1) switchSquad(g[0].id);
  }
  loginDraft = ''; loginError = '';
  if(hasPin(p.name)){
    pinStep = {name:p.name}; pinDraft = ''; pinError = '';
    try{ localStorage.removeItem('md_login_name'); localStorage.removeItem('md_login_pin'); }catch(e){}
    render(); return;
  }
  doLoginAs(p.name, '');
  render();
}
function submitPin(){
  const step = currentPinStep(); if(!step) return;
  const now = Date.now();
  if(now < pinLockUntil){ pinError = 'Too many wrong tries — wait a few seconds and try again.'; render(); return; }
  if(!/^\d{4}$/.test(pinDraft)){ pinError = 'Enter your 4 digits.'; render(); return; }
  const h = pinHash(step.name, pinDraft);
  if(h === PINS[pinKey(step.name)]){
    doLoginAs(step.name, h);
    pinStep = null; pinDraft = ''; pinError = ''; pinFails = 0;
  }else{
    pinFails++;
    if(pinFails >= 5){ pinFails = 0; pinLockUntil = now + 30000; pinError = 'Too many wrong tries — try again in 30 seconds.'; }
    else pinError = 'That PIN isn’t right.';
    pinDraft = '';
  }
  render();
}
function pinCancel(){
  pinStep = null; pinDraft = ''; pinError = '';
  try{ localStorage.removeItem('md_login_name'); localStorage.removeItem('md_login_pin'); }catch(e){}
  render();
}
function openPinModal(){ pinModalOpen = true; pinSetDraft = ''; pinSetError = ''; render(); }
function markPinSkipped(){
  try{
    const k = pinKey(getLoginName());
    const list = JSON.parse(localStorage.getItem('md_pin_skip') || '[]');
    if(!list.includes(k)){ list.push(k); localStorage.setItem('md_pin_skip', JSON.stringify(list)); }
  }catch(e){}
}
function closePinModal(skip){ if(skip) markPinSkipped(); pinModalOpen = false; pinSetDraft = ''; pinSetError = ''; render(); }
function savePin(){
  const name = getLoginName();
  if(!name || !db) return;
  if(!/^\d{4}$/.test(pinSetDraft)){ pinSetError = 'Pick exactly 4 digits.'; render(); return; }
  const h = pinHash(name, pinSetDraft);
  const k = pinKey(name);
  PINS[k] = h;
  try{ localStorage.setItem('md_login_pin', h); }catch(e){}
  db.doc('pins/' + k).set({h, at:new Date().toISOString()}).catch(()=>{});
  pinModalOpen = false; pinSetDraft = ''; pinSetError = '';
  render();
}
function removeMyPin(){
  const name = getLoginName();
  if(!name || !db) return;
  const k = pinKey(name);
  delete PINS[k];
  try{ localStorage.removeItem('md_login_pin'); }catch(e){}
  db.doc('pins/' + k).delete().catch(()=>{});
  markPinSkipped();
  pinModalOpen = false; render();
}
// Host only: a player forgot their PIN — clear it so they can log in by name again.
function hostResetPin(playerId){
  if(!isHost() || !db) return;
  if(pinResetArm !== playerId){
    pinResetArm = playerId; render();
    setTimeout(()=>{ if(pinResetArm === playerId){ pinResetArm = null; render(); } }, 4000);
    return;
  }
  pinResetArm = null;
  const p = findPlayer(playerId); if(!p) return;
  const k = pinKey(p.name);
  delete PINS[k];
  db.doc('pins/' + k).delete().catch(()=>{});
  render();
}
function shouldOfferPin(){
  if(!db || isHost() || !isLoggedIn()) return false;
  const k = pinKey(getLoginName());
  if(PINS[k]) return false;
  try{ return !JSON.parse(localStorage.getItem('md_pin_skip') || '[]').includes(k); }catch(e){ return true; }
}
function logout(){
  try{ localStorage.removeItem('md_login_name'); localStorage.removeItem('md_login_pin'); }catch(e){}
  if(db && AUTH_UID && !isHost()) db.doc('logins/' + AUTH_UID).delete().catch(()=>{});
  pinStep = null; pinDraft = ''; pinError = '';
  loginDraft = ''; loginError = '';
  render();
}
function loginRequired(){ return !isHost() && !isLoggedIn(); }
// Derived, not chosen: 'a'/'b' only once this device's player has actually
// been picked as a captain for the current match.
function myTeamRole(){
  const id = getMyPlayerId();
  if(!id || !S.captains) return null;
  if(S.captains.a===id) return 'a';
  if(S.captains.b===id) return 'b';
  return null;
}
function myRoleLabel(){
  const team = myTeamRole();
  if(team==='a') return `Captain — ${playerName(S.captains.a)}`;
  if(team==='b') return `Captain — ${playerName(S.captains.b)}`;
  const id = getMyPlayerId();
  if(id) return `Playing as ${playerName(id)}`;
  return 'Logged in';
}

/* ---- share the teams as a neat message (WhatsApp etc) ---- */
function buildTeamSheetText(){
  const {teamAIds, teamBIds, subIds} = getCompleteTeamIds();
  if(!teamAIds.length && !teamBIds.length) return '';
  const capA = (S.mode==='draft' && S.captains) ? S.captains.a : null;
  const capB = (S.mode==='draft' && S.captains) ? S.captains.b : null;
  const when = new Date().toLocaleDateString(undefined, {weekday:'short', day:'numeric', month:'short'});
  const list = (ids, cap)=> ids.map((id,i)=> (i+1) + '. ' + playerName(id) + (id===cap ? ' (C)' : '')).join('\n');
  const lines = [];
  lines.push(SPORT.icon + ' *Matchday* · ' + when + ' · ' + S.format + 'v' + S.format);
  lines.push('*Team A* 🔵  vs  🔴 *Team B*');
  lines.push('');
  lines.push('🔵 *Team A*');
  lines.push(list(teamAIds, capA));
  lines.push('');
  lines.push('🔴 *Team B*');
  lines.push(list(teamBIds, capB));
  if(subIds.length){
    lines.push('');
    lines.push('🪑 *Subs:* ' + subIds.map(playerName).join(', '));
  }
  const h = HISTORY.find(x=>x.id===S.lastHistoryId);
  if(h && h.winner){
    lines.push('');
    lines.push('🏆 ' + (h.winner==='draw' ? SPORT.draw : 'Team '+h.winner.toUpperCase()+' won') +
      (h.scoreA!=null && h.scoreB!=null && h.scoreA!=='' && h.scoreB!=='' ? ' ' + h.scoreA + '–' + h.scoreB : ''));
  }
  lines.push('');
  lines.push('See you on the ' + SPORT.field + '! 🔥');
  return lines.join('\n');
}
function copyTeamSheet(){
  const text = buildTeamSheetText();
  if(!text) return;
  const onDone = () => {
    copyFeedback = true; render();
    setTimeout(()=>{ copyFeedback = false; render(); }, 1800);
  };
  const fallback = () => {
    try{
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed'; ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.focus(); ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      onDone();
    }catch(e){ /* clipboard unavailable — nothing more we can do */ }
  };
  try{
    if(navigator && navigator.clipboard && navigator.clipboard.writeText){
      navigator.clipboard.writeText(text).then(onDone).catch(fallback);
    }else{
      fallback();
    }
  }catch(e){ fallback(); }
}
function shareTeamsWhatsApp(){
  const text = buildTeamSheetText();
  if(!text) return;
  openWhatsApp(text);
}
function shareButtonsHtml(){
  if(!buildTeamSheetText()) return '';
  return `<div class="footer-actions share-row" style="margin-top:12px;">
    <button class="btn btn-sm" onclick="copyTeamSheet()">${copyFeedback ? '✅ Copied!' : '📋 Copy teams'}</button>
    <button class="btn btn-sm" onclick="shareTeamsWhatsApp()">💬 Send to WhatsApp</button>
  </div>`;
}

