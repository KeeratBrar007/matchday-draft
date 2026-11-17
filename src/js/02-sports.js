/* ============================= Sports =============================
   Each game (squad) has a sport. The sport decides the look, positions,
   skills, team sizes and the two headline stats. Internally every sport
   reuses the same four position slots (GK/DEF/MID/FWD) and the same two stat
   slots (goals/assists), so the draft, balancing, leaderboards and records
   all work unchanged and just show the sport's own words. */
const SPORTS = {
  football: {
    key:'football', name:'Football', icon:'⚽', play:'football', field:'pitch', kickoff:'Ready for kickoff',
    pos:{GK:['GK','Goalkeeper'], DEF:['DEF','Defender'], MID:['MID','Midfielder'], FWD:['FWD','Forward']},
    posOrder:['GK','DEF','MID','FWD'], keeper:true, keeperWord:'goalkeepers',
    attrs:[['shooting','Shooting'],['tackling','Tackling'],['speed','Speed'],['dribbling','Dribbling'],['stamina','Stamina'],['passing','Passing'],['game_iq','Game knowledge']],
    formats:[5,6,7,8], defFormat:6,
    s1:{name:'Goals', one:'goal', many:'goals', icon:'⚽', col:'⚽', award:'Golden boot', awardIcon:'🥇'},
    s2:{name:'Assists', one:'assist', many:'assists', icon:'🅰️', col:'🅰', award:'Playmaker', awardIcon:'🎯'},
    draw:'Draw', scoreWord:'Score', lengthLabel:'Match length (min)', lengthPh:'e.g. 60', lengthToMin:1, marginUnit:1,
    feat1Min:2, feat2Min:99, bigWinMin:2, highScoreMin:4,
    modeBlurb:'each side gets a fair share of defenders, midfielders and forwards, and a keeper whenever two or more are available',
    cols:null, extras:[]
  },
  cricket: {
    key:'cricket', name:'Cricket', icon:'🏏', play:'cricket', field:'field', kickoff:'Ready for the first ball',
    pos:{GK:['WK','Wicketkeeper'], DEF:['BOWL','Bowler'], MID:['AR','All-rounder'], FWD:['BAT','Batter']},
    posOrder:['FWD','DEF','MID','GK'], keeper:true, keeperWord:'wicketkeepers',
    attrs:[['batting','Batting'],['power','Power hitting'],['pace','Pace bowling'],['spin','Spin bowling'],['fielding','Fielding'],['keeping','Keeping'],['game_iq','Game sense']],
    formats:[6,8,11], defFormat:8,
    s1:{name:'Runs', one:'run', many:'runs', icon:'🏏', col:'🏏', award:'Orange cap', awardIcon:'🟠'},
    s2:{name:'Wickets', one:'wicket', many:'wickets', icon:'🎯', col:'🎯', award:'Purple cap', awardIcon:'🟣'},
    draw:'Tie', scoreWord:'Runs', lengthLabel:'Overs per side', lengthPh:'e.g. 10', lengthToMin:4, marginUnit:10,
    feat1Min:30, feat2Min:3, bigWinMin:20, highScoreMin:150, teamWickets:true,
    modeBlurb:'each side gets a fair share of batters, bowlers and all-rounders, and a wicketkeeper whenever two or more are available',
    cols:[{k:'s1',h:'Runs'},{k:'b',h:'Balls'},{k:'s2',h:'Wkts'},{k:'c',h:'Catches'}],
    extras:[{k:'b',name:'balls faced'},{k:'c',name:'catches'}]
  },
  basketball: {
    key:'basketball', name:'Basketball', icon:'🏀', play:'basketball', field:'court', kickoff:'Ready for tip-off',
    pos:{GK:['C','Center'], DEF:['F','Forward'], MID:['G','Guard'], FWD:['WG','Wing']},
    posOrder:['MID','DEF','GK'], keeper:false, keeperWord:'centers',
    attrs:[['shooting','Shooting'],['three','3-point'],['handles','Handles'],['defense','Defense'],['rebounding','Rebounding'],['passing','Passing'],['athletic','Athleticism']],
    formats:[3,4,5], defFormat:5,
    s1:{name:'Points', one:'point', many:'points', icon:'🏀', col:'🏀', award:'Top scorer', awardIcon:'🔥'},
    s2:{name:'Rebounds', one:'rebound', many:'rebounds', icon:'💪', col:'💪', award:'Board king', awardIcon:'👑'},
    draw:'Tie', scoreWord:'Points', lengthLabel:'Length (min)', lengthPh:'e.g. 40', lengthToMin:1, marginUnit:5,
    feat1Min:15, feat2Min:8, bigWinMin:10, highScoreMin:80,
    modeBlurb:'each side gets a fair share of guards, forwards and centers',
    cols:[{k:'s1',h:'Pts'},{k:'s2',h:'Reb'},{k:'ast',h:'Ast'}],
    extras:[{k:'ast',name:'assists'}]
  }
};
SPORTS.pickleball = {
  key:'pickleball', name:'Pickleball', icon:'🏓', play:'pickleball', field:'court', kickoff:'Ready to serve',
  pos:{GK:['–','—'], DEF:['NET','Net player'], MID:['ALL','All-court'], FWD:['PWR','Power hitter']},
  posOrder:['MID','DEF','FWD'], keeper:false, keeperWord:'',
  attrs:[['serve','Serve'],['return','Return'],['dinking','Dinking'],['drives','Drives'],['volleys','Volleys'],['smash','Smasher'],['placement','Shot picker'],['spin','Master spinner'],['footwork','Footwork'],['game_iq','Strategy']],
  formats:[1,2], defFormat:2,
  s1:{name:'Aces', one:'ace', many:'aces', icon:'🎯', col:'🎯', award:'Ace machine', awardIcon:'🎯'},
  s2:{name:'Winners', one:'winner', many:'winners', icon:'💥', col:'💥', award:'Shot maker', awardIcon:'💥'},
  draw:'Tie', scoreWord:'Points', lengthLabel:'Games played', lengthPh:'e.g. 3', lengthToMin:15, marginUnit:3,
  feat1Min:4, feat2Min:6, bigWinMin:6, highScoreMin:22,
  modeBlurb:'teams are balanced by ability and playing style',
  cols:[{k:'s1',h:'Aces'},{k:'s2',h:'Winners'}],
  extras:[]
};
let SPORT = SPORTS.football;
function sportOfSquad(id){ const sq = (squadsList||[]).find(x=>x.id===id); return (sq && SPORTS[sq.sport]) ? sq.sport : 'football'; }
function syncSport(){
  const key = sportOfSquad(currentSquadId);
  if(SPORT.key === key && document.documentElement.getAttribute('data-sport') === key) return;
  applySport(key);
}
function applySport(key){
  SPORT = SPORTS[key] || SPORTS.football;
  Object.keys(SPORT.pos).forEach(k=>{ if(POSITIONS[k]){ POSITIONS[k].label = SPORT.pos[k][0]; POSITIONS[k].full = SPORT.pos[k][1]; } });
  POSITION_ORDER = SPORT.posOrder.slice();
  ATTRIBUTES = {}; SPORT.attrs.forEach(([k,l])=>{ ATTRIBUTES[k] = {label:l}; });
  ATTRIBUTE_ORDER = SPORT.attrs.map(a=>a[0]);
  FORMATS = SPORT.formats.slice();
  try{ document.documentElement.setAttribute('data-sport', SPORT.key); localStorage.setItem('md_sport', SPORT.key); }catch(e){}
}
function noKeeperNote(ids, long){
  if(!SPORT.keeper || !ids.length || positionCounts(ids).GK > 0) return '';
  return long ? ' · <span style="color:var(--danger)">no ' + SPORT.keeperWord + ' selected</span>' : ' · ⚠ no ' + POSITIONS.GK.label;
}
function s1Text(n){ return n + ' ' + (n===1 ? SPORT.s1.one : SPORT.s1.many); }
function s2Text(n){ return n + ' ' + (n===1 ? SPORT.s2.one : SPORT.s2.many); }

const POSITIONS = {
  GK:  {label:'GK',  full:'Goalkeeper', color:'var(--pos-gk)'},
  DEF: {label:'DEF', full:'Defender',   color:'var(--pos-def)'},
  MID: {label:'MID', full:'Midfielder', color:'var(--pos-mid)'},
  FWD: {label:'FWD', full:'Forward',    color:'var(--pos-fwd)'}
};
let POSITION_ORDER = ['GK','DEF','MID','FWD'];

let ATTRIBUTES = {
  shooting:  {label:'Shooting'},
  tackling:  {label:'Tackling'},
  speed:     {label:'Speed'},
  dribbling: {label:'Dribbling'},
  stamina:   {label:'Stamina'},
  passing:   {label:'Passing'},
  game_iq:   {label:'Game knowledge'}
};
let ATTRIBUTE_ORDER = ['shooting','tackling','speed','dribbling','stamina','passing','game_iq'];

// A player can hold more than one position — positionsOf always returns a
// non-empty array (falls back to ['MID'] for old/blank data).
function positionsOf(id){
  const p = findPlayer(id);
  const pos = (p && Array.isArray(p.positions) && p.positions.length) ? p.positions : ['MID'];
  const ok = pos.filter(x=>POSITIONS[x] && POSITION_ORDER.includes(x));
  return ok.length ? ok : ['MID'];
}
// Attributes are a {key: level} map — level 1 = has it, level 2 = "+"
// (exceptional). Reads old array-shaped data (from before levels existed)
// as level 1 for everything, so nothing already saved gets lost.
function attributesOf(id){
  const p = findPlayer(id);
  const raw = p && p.attributes;
  if(!raw) return {};
  if(Array.isArray(raw)){
    const out = {}; raw.forEach(k=>{ if(ATTRIBUTES[k]) out[k]=1; }); return out;
  }
  const out = {};
  Object.keys(raw).forEach(k=>{ if(ATTRIBUTES[k] && (raw[k]===1 || raw[k]===2)) out[k]=raw[k]; });
  return out;
}
function attrChipLabel(attr, level){
  return ATTRIBUTES[attr].label + (level===2 ? '+' : '');
}
// Counts toward every tagged position, so a GK/DEF player counts in both —
// this is "position coverage", not a strict headcount split.
function positionCounts(ids){
  const c = {GK:0,DEF:0,MID:0,FWD:0};
  ids.forEach(id=> positionsOf(id).forEach(pos=> c[pos]++));
  return c;
}
function compositionLine(ids){
  const c = positionCounts(ids);
  return POSITION_ORDER.map(p=>`${c[p]} ${POSITIONS[p].label}`).join(' · ');
}
function posBadges(id){
  return positionsOf(id).map(pos=>{
    const meta = POSITIONS[pos];
    return `<span class="pos-badge" style="color:${meta.color}; border-color:${meta.color};">${meta.label}</span>`;
  }).join(' ');
}
function attrChips(id){
  const attrs = attributesOf(id);
  const keys = Object.keys(attrs);
  if(!keys.length) return '';
  return `<div class="attr-row">${keys.map(k=>`<span class="attr-chip${attrs[k]===2?' attr-plus':''}">${attrChipLabel(k,attrs[k])}</span>`).join('')}</div>`;
}
function statsLine(id){
  const s = statsOf(id);
  if(!s.played) return '';
  return `<div class="stats-line">${s.played} played · ${s.wins}W ${s.draws}D ${s.losses}L${s.goals?' · '+s.goals+' '+SPORT.s1.icon:''}</div>`;
}
function chemistryGroupOf(id){
  return (SQUAD.chemistryGroups||[]).find(g=>g.includes(id)) || null;
}
function chemBadge(id){
  const g = chemistryGroupOf(id);
  if(!g || g.length<2) return '';
  const mates = g.filter(x=>x!==id).map(playerName).join(', ');
  return `<span class="pos-badge chem-badge" title="Plays well with: ${esc(mates)}">🔗</span>`;
}

/* ---- star players: a rare, huge quality gap over the rest of the squad ---- */
function isStarPlayer(id){
  const p = findPlayer(id);
  return !!(p && p.star);
}
function starCount(ids){ return ids.filter(isStarPlayer).length; }
function starBadge(id){
  return isStarPlayer(id) ? `<span class="pos-badge star-badge" title="Star player">⭐</span>` : '';
}

/* ---- balanced, chemistry- and position-aware team splitting ---- */

// Group a list of ids into "units" — a chemistry group (trimmed to just the
// ids present in this list) stays together as one unit; anyone with no
// group of their own is a unit of one.
function buildChemistryUnits(ids){
  const idSet = new Set(ids);
  const seen = new Set();
  const units = [];
  ids.forEach(id=>{
    if(seen.has(id)) return;
    const g = chemistryGroupOf(id);
    const unit = g ? g.filter(x=>idSet.has(x)) : [id];
    unit.forEach(x=>seen.add(x));
    units.push(unit);
  });
  return units;
}
function unitStats(unit){
  let ability = 0, stars = 0;
  const pos = {GK:0,DEF:0,MID:0,FWD:0};
  unit.forEach(id=>{
    ability += rankOf(id);
    if(isStarPlayer(id)) stars++;
    positionsOf(id).forEach(p=> pos[p]++);
  });
  return {ability, pos, stars, hasGk: pos.GK>0, hasStar: stars>0};
}
// Greedily assigns `ids` between two sides, starting from whatever each
// side already holds (existingAIds/existingBIds) and never exceeding
// capA/capB more players. Chemistry groups are kept together whenever
// capacity allows; ability, position coverage AND star-player spread are
// balanced against what each side already has. Units containing a
// goalkeeper are placed first (a hard-ish priority), star units next —
// a heavy penalty keeps two stars off the same side whenever capacity
// allows it, the same way an uneven goalkeeper split is discouraged.
function balancedAssign(ids, existingAIds, existingBIds, capA, capB){
  // Shuffle first so ties in the sort below (equal priority units — same
  // GK/star/size/ability profile) don't always resolve the same way, and
  // add a small random jitter to genuinely close side-decisions further
  // down. Without either of these the optimizer is fully deterministic —
  // the exact bug that made "reshuffle" return the same split every time.
  const units = buildChemistryUnits(shuffledCopy(ids))
    .map(u=>({ids:u, stats:unitStats(u)}))
    .sort((x,y)=>{
      if(x.stats.hasGk !== y.stats.hasGk) return x.stats.hasGk ? -1 : 1;
      if(x.stats.hasStar !== y.stats.hasStar) return x.stats.hasStar ? -1 : 1;
      if(y.ids.length !== x.ids.length) return y.ids.length - x.ids.length;
      return (y.stats.ability/y.ids.length) - (x.stats.ability/x.ids.length);
    });

  let abilityA=0, abilityB=0, starsA=0, starsB=0;
  const posA={GK:0,DEF:0,MID:0,FWD:0}, posB={GK:0,DEF:0,MID:0,FWD:0};
  existingAIds.forEach(id=>{ abilityA+=rankOf(id); if(isStarPlayer(id)) starsA++; positionsOf(id).forEach(p=>posA[p]++); });
  existingBIds.forEach(id=>{ abilityB+=rankOf(id); if(isStarPlayer(id)) starsB++; positionsOf(id).forEach(p=>posB[p]++); });
  let remA = capA, remB = capB;
  const outA=[], outB=[];

  function place(id, side){
    if(side==='A'){ outA.push(id); remA--; abilityA+=rankOf(id); if(isStarPlayer(id)) starsA++; positionsOf(id).forEach(p=>posA[p]++); }
    else { outB.push(id); remB--; abilityB+=rankOf(id); if(isStarPlayer(id)) starsB++; positionsOf(id).forEach(p=>posB[p]++); }
  }

  units.forEach(({ids:unit, stats})=>{
    const fitsA = unit.length<=remA, fitsB = unit.length<=remB;
    let side;
    if(fitsA && fitsB){
      let penA=0, penB=0;
      POSITION_ORDER.forEach(p=>{
        penA += Math.abs((posA[p]+stats.pos[p]) - posB[p]);
        penB += Math.abs(posA[p] - (posB[p]+stats.pos[p]));
      });
      const starPenA = Math.abs((starsA+stats.stars) - starsB);
      const starPenB = Math.abs(starsA - (starsB+stats.stars));
      const abA = Math.abs((abilityA+stats.ability) - abilityB);
      const abB = Math.abs(abilityA - (abilityB+stats.ability));
      // A little noise so near-equal options can go either way on a
      // reshuffle; a real imbalance (position/star/ability gap far bigger
      // than this) still always resolves to the fairer side.
      const jitter = (Math.random()-0.5)*1.6;
      side = (penA*3 + starPenA*8 + abA*0.5 + jitter) <= (penB*3 + starPenB*8 + abB*0.5) ? 'A' : 'B';
    } else if(fitsA){ side = 'A'; }
    else if(fitsB){ side = 'B'; }
    else {
      // neither side has room for the whole unit — split it as a last
      // resort so the rosters still fill; chemistry loses to capacity.
      unit.forEach(id=> place(id, remA>0 ? 'A' : 'B'));
      return;
    }
    unit.forEach(id=> place(id, side));
  });

  return {sideAIds: outA, sideBIds: outB};
}

