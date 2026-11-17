/* ============================= Demo mode =============================
   ?demo=1 (or "Try the demo" on the login screen) opens the whole app with
   made-up players and history, for anyone who wants a look without logging in.
   - It never connects to Firebase, so it can't see or touch real games.
   - Everything it saves goes under its own names in this browser (see the
     storage shim at the top of index.html), and the "who am I" settings are
     per tab, so two tabs can be the host and a player side by side.
   - Two demo tabs stay in sync, to show the live updates a real group gets.
   This file runs before boot, so it only uses function declarations and var. */
var DEMO = !!window.MD_DEMO;
var demoResetArm = false, demoWaText = null, demoTourOpen = false;
var DEMO_UPI = 'demo.host@example';   // not a real UPI handle, so a scan can't pay anyone

// small seeded random numbers, so every fresh demo looks the same
function demoRng(seed){ return function(){ seed |= 0; seed = seed + 0x6D2B79F5 | 0; var t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
function demoPick(rng, arr){ return arr[Math.floor(rng() * arr.length)]; }
function demoShuffle(rng, arr){ var a = arr.slice(); for(var i = a.length - 1; i > 0; i--){ var j = Math.floor(rng() * (i + 1)); var t = a[i]; a[i] = a[j]; a[j] = t; } return a; }
function demoDay(daysAgo, hour){ var d = new Date(); d.setDate(d.getDate() - daysAgo); d.setHours(hour || 7, 0, 0, 0); return d; }
function demoSlug(n){ return n.toLowerCase().replace(/[^a-z0-9]+/g, '-'); }

// one game: players (weakest first, like the real ranking), history (newest first), stats
function demoBuildGame(cfg){
  var rng = demoRng(cfg.seed);
  var players = cfg.people.map(function(p){ return {id: demoSlug(p[0]), name: p[0], positions: p[1], attributes: p[2] || {}, star: !!p[3]}; });
  var strength = {}; cfg.people.forEach(function(p, i){ strength[demoSlug(p[0])] = p[4]; });
  var ids = players.map(function(p){ return p.id; });
  var history = [], stats = {};
  function bump(id, k, n){ stats[id] = stats[id] || {played:0, wins:0, losses:0, draws:0, goals:0, assists:0}; stats[id][k] += (n == null ? 1 : n); }
  for(var w = cfg.matches; w >= 1; w--){
    var here = demoShuffle(rng, ids).slice(0, cfg.format * 2);
    here.sort(function(a, b){ return strength[b] - strength[a]; });
    var A = [], B = [];   // snake split by strength, like a fair draft
    here.forEach(function(id, i){ ((i % 4 === 0 || i % 4 === 3) ? A : B).push(id); });
    var power = function(t){ return t.reduce(function(n, id){ return n + strength[id]; }, 0); };
    var lean = (power(A) - power(B)) / 20;
    var sA = cfg.score(rng, lean), sB = cfg.score(rng, -lean);
    if(cfg.key === 'cricket' && sA === sB) sA += 1;
    var winner = sA > sB ? 'a' : sB > sA ? 'b' : 'draw';
    var scorers = [], assists = [], ownGoals = [];
    function share(team, total, s1){
      var left = total, out = {};
      var pool = team.filter(function(id){ return s1 ? cfg.scorerWeight(players.find(function(p){ return p.id === id; })) > 0 : true; });
      while(left > 0 && pool.length){ var id = demoPick(rng, pool), bit = Math.min(left, cfg.chunk(rng)); out[id] = (out[id] || 0) + bit; left -= bit; }
      return out;
    }
    var og = (cfg.key === 'football' && w === 4) ? 1 : 0;   // one own goal in the history, for the record
    [['a', A, sA], ['b', B, sB]].forEach(function(t){
      var mine = t[2] - (og && t[0] === 'a' ? 1 : 0);
      var g = share(t[1], mine, true);
      Object.keys(g).forEach(function(id){ scorers.push({playerId: id, goals: g[id]}); bump(id, 'goals', g[id]); });
      var aN = cfg.key === 'football' ? Math.max(0, mine - 1) : cfg.key === 'cricket' ? Math.min(9, 3 + Math.floor(rng() * 5)) : 0;
      if(aN){ var a = share(cfg.key === 'cricket' ? (t[0] === 'a' ? B : A) : t[1], aN, false); Object.keys(a).forEach(function(id){ var who = cfg.key === 'cricket' ? (t[0] === 'a' ? B : A) : t[1]; if(who.indexOf(id) < 0) return; assists.push({playerId: id, assists: a[id]}); bump(id, 'assists', a[id]); }); }
    });
    if(og){ ownGoals.push({playerId: B[B.length - 1], goals: 1}); }
    here.forEach(function(id){ bump(id, 'played'); bump(id, winner === 'draw' ? 'draws' : ((winner === 'a') === (A.indexOf(id) >= 0) ? 'wins' : 'losses')); });
    // player of the match: everyone who played votes for someone on each team
    var potm = {a: {}, b: {}};
    [['a', A], ['b', B]].forEach(function(t){
      var best = t[1].slice().sort(function(x, y){ return (scorers.find(function(s){ return s.playerId === y; }) || {goals: 0}).goals - (scorers.find(function(s){ return s.playerId === x; }) || {goals: 0}).goals; });
      here.forEach(function(v, i){ if(i % 2 === 0 || rng() < .5) potm[t[0]][v] = rng() < .7 ? best[0] : demoPick(rng, t[1]); });
    });
    var when = demoDay(w * 7 - (cfg.key === 'cricket' ? 1 : 0), cfg.hour);
    var h = {
      id: 'demo-' + cfg.key + '-' + w, date: when.toISOString(), format: cfg.format, mode: (w % 3 === 0) ? 'draft' : 'random',
      teamA: {players: A.map(function(id){ return players.find(function(p){ return p.id === id; }).name; })}, teamAIds: A,
      teamB: {players: B.map(function(id){ return players.find(function(p){ return p.id === id; }).name; })}, teamBIds: B,
      subs: [], subIds: [], winner: winner, scoreA: sA, scoreB: sB, scorers: scorers, assists: assists, ownGoals: ownGoals,
      duration: cfg.duration, potmVotes: potm, live: w <= 3
    };
    if(cfg.key === 'cricket'){ h.wktsA = 3 + Math.floor(rng() * 6); h.wktsB = 3 + Math.floor(rng() * 7); }
    // turf money for the last few weeks; a couple of people still owe
    if(w <= cfg.feeWeeks){
      var paid = {};
      here.forEach(function(id){ if(id === cfg.host) return; if(w === 1 && here.indexOf(id) % 4 === 1) return; if(w === 2 && here.indexOf(id) === 5) return; paid[id] = {how: rng() < .6 ? 'upi' : 'cash', at: when.toISOString()}; });
      h.fees = {items: [{label: 'Turf', amount: cfg.turf, paidBy: '_c'}].concat(cfg.water ? [{label: 'Water', amount: 100, paidBy: here[3]}] : []),
                players: here.slice(), split: 'equal', custom: {}, paid: paid, collectorId: cfg.host, createdAt: when.toISOString(), guestsByHost: true, guestOf: {}};
    }
    history.unshift(h);
  }
  // the database ranking: weakest first, strongest last
  players.sort(function(a, b){ return strength[a.id] - strength[b.id]; });
  var squad = Object.assign(defaultSquad(), {
    players: players, stats: stats, chemistryGroups: cfg.chem || [],
    pay: {upi: DEMO_UPI, name: players.find(function(p){ return p.id === cfg.host; }).name + ' (demo)', playerId: cfg.host},
    feeTemplate: {items: [{label: 'Turf', amount: cfg.turf, by: '_c'}].concat(cfg.water ? [{label: 'Water', amount: 100, by: 'player'}] : []), split: 'equal'}
  });
  return {squad: squad, history: history, ids: ids};
}

function demoLocalStore(){
  var created = demoDay(80).toISOString();
  var fb = demoBuildGame({
    key: 'football', seed: 7, format: 6, matches: 10, hour: 7, duration: 60, turf: 1200, water: true, feeWeeks: 5, host: 'aarav',
    // name, positions, attributes (1 = good, 2 = great), star, strength
    people: [
      ['Aarav', ['MID'], {passing: 2, game_iq: 2}, false, 7], ['Kabir', ['FWD'], {shooting: 2, speed: 1}, true, 9],
      ['Rohan', ['DEF'], {tackling: 2, stamina: 1}, false, 6], ['Ishaan', ['FWD', 'MID'], {dribbling: 2, shooting: 1}, true, 8],
      ['Vihaan', ['MID'], {stamina: 2}, false, 5], ['Arjun', ['DEF'], {tackling: 1}, false, 5],
      ['Dev', ['FWD'], {speed: 2}, false, 6], ['Neel', ['GK'], {game_iq: 1}, false, 6],
      ['Kian', ['MID', 'DEF'], {passing: 1}, false, 4], ['Reyansh', ['DEF'], {}, false, 3],
      ['Aditya', ['MID'], {passing: 1, stamina: 1}, false, 5], ['Manav', ['FWD'], {shooting: 1}, false, 4],
      ['Yash', ['GK'], {}, false, 4], ['Zoravar', ['DEF', 'MID'], {tackling: 1}, false, 3]
    ],
    chem: [['kabir', 'ishaan']],
    score: function(rng, lean){ return Math.max(0, Math.round(2 + lean * 3 + rng() * 3 - 1)); },
    chunk: function(){ return 1; },
    scorerWeight: function(p){ return p.positions.indexOf('GK') >= 0 ? 0 : 1; }
  });
  var cr = demoBuildGame({
    key: 'cricket', seed: 11, format: 6, matches: 5, hour: 16, duration: 10, turf: 1800, water: false, feeWeeks: 3, host: 'sahil',
    people: [
      ['Sahil', ['MID'], {batting: 1, pace: 1}, false, 7], ['Pranav', ['FWD'], {batting: 2, power: 1}, true, 9],
      ['Harsh', ['DEF'], {pace: 2}, false, 7], ['Tanmay', ['GK'], {keeping: 2}, false, 6],
      ['Parth', ['DEF'], {spin: 2}, false, 6], ['Varun', ['FWD'], {batting: 1}, false, 5],
      ['Kunal', ['MID'], {fielding: 1}, false, 5], ['Siddharth', ['FWD'], {power: 2}, false, 6],
      ['Rahul', ['DEF'], {spin: 1}, false, 4], ['Ansh', ['MID'], {}, false, 4],
      ['Ritvik', ['FWD'], {fielding: 1}, false, 3], ['Om', ['DEF'], {pace: 1}, false, 3]
    ],
    score: function(rng, lean){ return Math.max(40, Math.round(85 + lean * 25 + rng() * 40 - 20)); },
    chunk: function(rng){ return 4 + Math.floor(rng() * 28); },
    scorerWeight: function(){ return 1; }
  });

  // football: a confirmed poll for this weekend with 12 spots, a waitlist and one "No"
  var fids = fb.ids, now = new Date(), sat = new Date(now); while(sat.getDay() !== 0) sat.setDate(sat.getDate() + 1);
  var opt1 = slotLabel(sat, 'Morning'), satEve = new Date(sat); satEve.setDate(satEve.getDate() - 1);
  var poll = {id: 'pdemo', q: 'Who’s in for football?', opts: [{id: 'o1', label: opt1, d: isoDay(sat), part: 'Morning'}, {id: 'o2', label: slotLabel(satEve, 'Evening'), d: isoDay(satEve), part: 'Evening'}],
              status: 'decided', decided: 'o1', max: 12, createdAt: demoDay(2).toISOString(), decidedAt: demoDay(1).toISOString()};
  var order = ['aarav', 'kabir', 'rohan', 'ishaan', 'neel', 'dev', 'vihaan', 'arjun', 'kian', 'aditya', 'reyansh', 'manav', 'zoravar'];
  var votes = order.map(function(id, i){ return {id: 'pdemo__' + id, pollId: 'pdemo', playerId: id, slots: i % 3 === 0 ? ['o1', 'o2'] : ['o1'], no: false, at: new Date(Date.now() - 2 * 864e5 + i * 47 * 60000).toISOString()}; });
  votes.push({id: 'pdemo__yash', pollId: 'pdemo', playerId: 'yash', slots: [], no: true, at: new Date(Date.now() - 864e5).toISOString()});
  var inIds = order.slice(0, 12);
  var fState = Object.assign(defaultState(), {format: 6, phase: 'setup', poll: poll, selectedIds: inIds,
    rsvpLog: inIds.map(function(id){ return {id: id, a: 'in', t: poll.decidedAt, by: 'poll'}; }), timerSecs: 0});
  fb.squad.lastPoll = {max: 12, q: poll.q, opts: poll.opts.map(function(o){ return {label: o.label, d: o.d, part: o.part}; })};

  var cState = Object.assign(defaultState(), {format: 6, phase: 'setup', selectedIds: cr.ids.slice(), timerSecs: 0});
  return {
    currentSquadId: 'demo-football',
    squads: [{id: 'demo-football', name: 'Sunday Football', sport: 'football', createdAt: created},
             {id: 'demo-cricket', name: 'Weekend Cricket', sport: 'cricket', createdAt: created}],
    data: {
      'demo-football': {squad: fb.squad, state: fState, history: fb.history, pollVotes: votes},
      'demo-cricket': {squad: cr.squad, state: cState, history: cr.history, pollVotes: []}
    }
  };
}

// first visit in this tab: you're the host
if(DEMO){ try{ if(localStorage.getItem('md_is_host') == null){ localStorage.setItem('md_is_host', '1'); isHostDevice = true; } }catch(e){} }

function demoViewAs(id){
  if(!DEMO) return;
  try{
    if(!id){ isHostDevice = true; localStorage.setItem('md_is_host', '1'); localStorage.removeItem('md_login_name'); }
    else { isHostDevice = false; localStorage.setItem('md_is_host', '0'); localStorage.setItem('md_login_name', playerName(id)); }
  }catch(e){}
  render(); window.scrollTo(0, 0);
}
function demoReset(){
  if(!DEMO) return;
  if(!demoResetArm){ demoResetArm = true; render(); setTimeout(function(){ demoResetArm = false; render(); }, 4000); return; }
  demoResetArm = false;
  LOCAL = demoLocalStore(); saveLocalStore();
  squadsList = LOCAL.squads; currentSquadId = null;
  switchSquad('demo-football');
  demoViewAs('');
}
function demoExit(){
  try{ sessionStorage.removeItem('matchday_demo'); }catch(e){}
  location.href = location.pathname + '?demo=0';
}
function demoOpen(){ location.href = location.pathname + '?demo=1'; }
function demoBannerHtml(){
  if(!DEMO) return '';
  var me = getMyPlayerId();
  var opts = '<option value="">Host (you)</option>' + rosterPlayersArr().slice().sort(function(a, b){ return a.name.localeCompare(b.name); })
    .map(function(p){ return '<option value="' + p.id + '"' + (me === p.id && !isHost() ? ' selected' : '') + '>' + esc(p.name) + '</option>'; }).join('');
  return '<div class="demo-bar" role="note">'
    + '<div class="demo-top"><b>🧪 Demo</b><span>Made-up players and matches. Nothing here is real or shared.</span></div>'
    + '<div class="demo-row">'
    + '<label class="demo-as">View as <select id="demoAs" onchange="demoViewAs(this.value)">' + opts + '</select></label>'
    + '<button class="btn btn-sm btn-ghost" onclick="demoTourOpen=!demoTourOpen; render();">' + (demoTourOpen ? 'Hide tips' : 'What to try') + '</button>'
    + '<button class="btn btn-sm ' + (demoResetArm ? 'btn-danger' : 'btn-ghost') + '" onclick="demoReset()">' + (demoResetArm ? 'Tap again to reset' : '↺ Reset') + '</button>'
    + '<button class="btn btn-sm btn-ghost" onclick="demoExit()">Exit</button>'
    + '</div>'
    + (demoTourOpen ? '<ol class="demo-tour">'
      + '<li>Look at the poll: 12 spots filled, one on the waitlist. Then tap <b>Continue to mode</b> and pick teams (auto-balanced, or a captains’ auction).</li>'
      + '<li>On the result screen tap <b>▶ Start live score</b>, add a few goals, then <b>Full time</b> and <b>📸 Result card</b>.</li>'
      + '<li>Open <b>💰 Payments</b> (who still owes), <b>🏆 Leaderboard</b> and <b>📈 Numbers</b>.</li>'
      + '<li>Switch <b>View as</b> to a player to see a friend’s phone. Open this demo in a second tab too: changes show up in both, live.</li>'
      + '<li>Try the cricket game from the game switcher at the top.</li>'
      + '</ol>' : '')
    + '</div>';
}
// WhatsApp buttons show the message instead of opening WhatsApp
function demoWaModal(){
  if(!DEMO || demoWaText == null) return '';
  return '<div class="modal-backdrop" onclick="if(event.target===this){ demoWaText=null; render(); }"><div class="modal" style="max-width:460px;">'
    + '<div class="panel-title" style="margin:0 0 4px;">💬 WhatsApp message</div>'
    + '<div class="panel-sub" style="margin:0 0 8px;">In the real app this opens WhatsApp with the message ready to send to the group:</div>'
    + '<pre class="demo-wa" id="demoWaText">' + esc(demoWaText) + '</pre>'
    + '<div class="footer-actions" style="justify-content:flex-start; margin-top:10px;"><button class="btn btn-primary" onclick="demoWaText=null; render();">Close</button></div>'
    + '</div></div>';
}
// two demo tabs share one store: pick up the other tab's changes as they happen
window.addEventListener('storage', function(e){
  if(!DEMO || e.key !== 'mddemo_local_v2' || !e.newValue || !LOCAL) return;
  try{ LOCAL = JSON.parse(e.newValue); }catch(x){ return; }
  squadsList = LOCAL.squads;
  var rec = LOCAL.data[currentSquadId]; if(!rec) return;
  SQUAD = rec.squad; S = rec.state; HISTORY = rec.history; POLLVOTES = rec.pollVotes || [];
  render();
});
