/* ============================= Match-making logic ============================= */

function shuffledCopy(arr){
  const a = arr.slice();
  for(let i=a.length-1;i>0;i--){
    const j = Math.floor(Math.random()*(i+1));
    [a[i],a[j]] = [a[j],a[i]];
  }
  return a;
}

// How lopsided a player's recent appearances have been toward the bench
// rather than the pitch — higher means "more overdue for a game". Only
// looks at matches they were actually part of (playing OR benched), most
// recent first, so someone who just joined isn't penalized for the weeks
// before they existed.
function recentBenchBalance(id, lookback){
  lookback = lookback || 8;
  let benched = 0, played = 0, seen = 0;
  for(let i=0; i<HISTORY.length && seen<lookback; i++){
    const h = HISTORY[i];
    const inBench = (h.subIds||[]).includes(id);
    const inPlay = (h.teamAIds||[]).includes(id) || (h.teamBIds||[]).includes(id);
    if(!inBench && !inPlay) continue;
    seen++;
    if(inBench) benched++; else played++;
  }
  return benched - played;
}

// Decide, once, which of today's selected players are "in the match" vs
// bench, when more people showed up than two full teams need. Keeps up to
// two goalkeepers in the playing pool when available, so a random split
// still has a keeper for each side, and gives priority to whoever has been
// riding the bench most recently rather than picking purely at random.
function computePlayingPool(){
  const n = S.format;
  // one extra spot when the host confirmed an uneven-teams extra player
  const need = n*2 + (S.oddSide ? 1 : 0);
  const ids = (S.selectedIds||[]).slice();
  if(ids.length <= need){
    return {playingIds: ids, subIds: []};
  }
  const byFatigueDesc = (x,y) => recentBenchBalance(y) - recentBenchBalance(x);
  const gks = shuffledCopy(ids.filter(id=>positionsOf(id).includes('GK'))).sort(byFatigueDesc);
  const others = shuffledCopy(ids.filter(id=>!positionsOf(id).includes('GK'))).sort(byFatigueDesc);
  const guaranteedGks = gks.slice(0, Math.min(2, need));
  const rest = shuffledCopy(gks.slice(guaranteedGks.length).concat(others))
    .sort(byFatigueDesc)
    .slice(0, Math.max(0, need - guaranteedGks.length));
  const playingIds = shuffledCopy(guaranteedGks.concat(rest));
  const playingSet = new Set(playingIds);
  const subIds = ids.filter(id=>!playingSet.has(id));
  return {playingIds, subIds};
}

// Balance the playing pool into two teams by ability, position AND
// chemistry — see balancedAssign above. Fresh split, so both sides start
// empty with a full team's worth of capacity each.
function computeRandomSplit(){
  const n = S.format;
  const capA = n + (S.oddSide==='a' ? 1 : 0);
  const capB = n + (S.oddSide==='b' ? 1 : 0);
  const {sideAIds, sideBIds} = balancedAssign(S.playingIds, [], [], capA, capB);
  return {teamA: sideAIds, teamB: sideBIds, subs: S.subIds.slice()};
}

function teamFull(team, n){ return team.ids.length >= n; }

// After a sale, if exactly one team is now full, hand every remaining
// un-auctioned player to the other team for free until it's full too
// (or players run out) — this is the "ran out of budget" catch-up rule.
// capA/capB are usually both S.format, but differ by one when an uneven
// "extra player" match was confirmed at setup.
function runAutoFill(auction, capA, capB){
  const aFull = teamFull(auction.teamA, capA);
  const bFull = teamFull(auction.teamB, capB);
  if(aFull === bFull) return auction; // both full, both open, or roster already exhausted below

  const shortTeam = aFull ? auction.teamB : auction.teamA;
  const shortCap = aFull ? capB : capA;
  const shortKey = aFull ? 'teamB' : 'teamA';
  while(auction.index < auction.order.length && shortTeam.ids.length < shortCap){
    const pid = auction.order[auction.index];
    shortTeam.ids.push(pid);
    auction.log.push({playerId:pid, team:shortKey==='teamA'?'a':'b', price:0, free:true});
    auction.index++;
  }
  return auction;
}

function finishAuctionIfDone(auction, capA, capB){
  const bothFull = teamFull(auction.teamA,capA) && teamFull(auction.teamB,capB);
  const exhausted = auction.index >= auction.order.length;
  if(bothFull || exhausted){ auction.done = true; }
  return auction;
}

