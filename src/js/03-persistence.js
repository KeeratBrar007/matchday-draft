/* ============================= Persistence layer ============================= */

// Every persisted document lives under the active squad: squads/<id> holds
// just {name, createdAt} (cheap to list); squads/<id>/state/match and
// squads/<id>/state/roster are this squad's S and SQUAD; squads/<id>/history
// is its match log. app/current is the one shared pointer saying which
// squad every device should be looking at.
function squadPath(sub){ return 'squads/' + currentSquadId + '/' + sub; }

function saveState(patch){
  const next = Object.assign({}, S, patch, {updatedAt:new Date().toISOString()});
  if(db && !isHost()){
    // friends send only what they changed, so a phone that's a moment out of
    // date can't overwrite the host's settings (and the database lock allows it)
    db.doc(squadPath('state/match')).update(Object.assign({}, patch, {updatedAt: next.updatedAt})).catch(()=>{});
  }else if(db){
    db.doc(squadPath('state/match')).set(next).catch(()=>{ /* best effort */ });
  }else{
    S = next;
    localCommit();
  }
}

function saveSquadDoc(next){
  if(db){
    db.doc(squadPath('state/roster')).set(next).catch(()=>{});
  }else{
    SQUAD = next;
    localCommit();
  }
}

// entry = {date, format, mode, teamA, teamB, teamAIds, teamBIds, subs, subIds}
// Returns the new doc's id synchronously (minted client-side) so the
// match-result form can target an update to this same entry later.
function addToHistory(entry){
  if(db){
    const ref = db.collection(squadPath('history')).doc();
    ref.set(entry).catch(()=>{});
    return ref.id;
  }else{
    const id = 'local-' + Date.now() + '-' + Math.floor(Math.random()*1000);
    HISTORY = [Object.assign({id}, entry)].concat(HISTORY).slice(0,200);
    localCommit();
    return id;
  }
}
function updateHistoryResult(id, resultData){
  if(!id) return;
  if(db){
    db.doc(squadPath('history/'+id)).update(resultData).catch(()=>{});
  }else{
    HISTORY = HISTORY.map(h=> h.id===id ? Object.assign({}, h, resultData) : h);
    localCommit();
  }
}
function deleteHistoryDoc(id){
  if(!id) return;
  if(db){
    db.doc(squadPath('history/'+id)).delete().catch(()=>{});
  }else{
    HISTORY = HISTORY.filter(h=>h.id!==id);
    localCommit();
  }
}

/* ---- squad management (create / switch / rename / delete) ---- */

function loadLocalStore(){
  try{ const raw = localStorage.getItem('md_local_v2'); if(raw) return JSON.parse(raw); }catch(e){}
  return null;
}
function saveLocalStore(){ try{ localStorage.setItem('md_local_v2', JSON.stringify(LOCAL)); }catch(e){} }
function defaultLocalStore(){
  const id = 'local-default';
  return {
    currentSquadId: id,
    squads: [{id, name:'My Squad', createdAt:new Date().toISOString()}],
    data: { [id]: { squad: defaultSquad(), state: defaultState(), history: [] } }
  };
}
// Writes the in-memory S/SQUAD/HISTORY back into LOCAL and persists —
// the no-db equivalent of a db write landing and the snapshot firing.
function localCommit(){
  LOCAL.data[currentSquadId] = { squad: SQUAD, state: S, history: HISTORY, pollVotes: POLLVOTES };
  saveLocalStore();
  render();
}

// Belt and braces on top of the live listeners: re-reads the shared state
// straight from the server and only re-renders if something really changed.
let lastResync = 0;
function resyncNow(force){
  if(db && squadsLoaded && !isHost()) loadAllRosters();
  if(!db || !currentSquadId || !dbReady) return;
  if(typeof document!=='undefined' && document.visibilityState==='hidden') return;
  const now = Date.now();
  if(!force && now - lastResync < 2500) return;
  lastResync = now;
  const sid = currentSquadId;
  db.doc('squads/'+sid+'/state/match').get().then(snap=>{
    if(sid!==currentSquadId || !snap.exists) return;
    const fresh = Object.assign(defaultState(), snap.data());
    if(JSON.stringify(fresh) !== JSON.stringify(S)){ S = fresh; render(); }
  }).catch(()=>{});
}
document.addEventListener('visibilitychange', ()=>resyncNow(true));
window.addEventListener('online', ()=>resyncNow(true));
window.addEventListener('focus', ()=>resyncNow(false));
window.addEventListener('pageshow', ()=>resyncNow(true));
// While a draft is in progress people are waiting on each other's phones, so
// check the server every few seconds (screen on only). Cheap: a handful of
// reads per minute per phone, and only during these phases.
setInterval(()=>{
  if(S && (S.phase==='captains' || S.phase==='budget' || S.phase==='auction')) resyncNow(false);
}, 5000);

let subDenied = false;
function subscribeToSquad(id){
  rosterLoaded = false; subDenied = false;
  if(unsubRoster) unsubRoster();
  if(unsubMatch) unsubMatch();
  if(unsubHistory) unsubHistory();
  if(unsubRiv) unsubRiv();
  RIVALS = [];
  unsubRoster = db.doc('squads/'+id+'/state/roster').onSnapshot(snap=>{
    SQUAD = snap.exists ? Object.assign(defaultSquad(), snap.data()) : defaultSquad();
    ensureRankBaselineFresh();
    rosterLoaded = true;
    syncMembership();
    render();
  }, ()=>{ SQUAD = defaultSquad(); rosterLoaded = true; subDenied = true; render(); });
  unsubMatch = db.doc('squads/'+id+'/state/match').onSnapshot(snap=>{
    S = snap.exists ? Object.assign(defaultState(), snap.data()) : defaultState();
    matchLoadedFor = id;
    dbReady = true;
    render();
  }, ()=>{ S = defaultState(); matchLoadedFor = id; dbReady = true; render(); });
  unsubHistory = db.collection('squads/'+id+'/history').orderBy('date','desc').limit(200).onSnapshot(qsnap=>{
    HISTORY = qsnap.docs.map(d=>Object.assign({id:d.id}, d.data()));
    historyLoadedFor = id;
    render();
  }, ()=>{ HISTORY = []; historyLoadedFor = id; });
  if(unsubPoll) unsubPoll();
  POLLVOTES = [];
  pollVotesLoaded = false;
  unsubPoll = db.collection('squads/'+id+'/pollVotes').onSnapshot(qsnap=>{
    POLLVOTES = qsnap.docs.map(d=>Object.assign({id:d.id}, d.data()));
    pollVotesLoaded = true;
    render();
  }, ()=>{ POLLVOTES = []; pollVotesLoaded = true; });
  unsubRiv = db.collection('squads/'+id+'/rivalries').onSnapshot(qsnap=>{
    RIVALS = qsnap.docs.map(d=>Object.assign({id:d.id}, d.data()));
    render();
  }, ()=>{ RIVALS = []; });
}

// First-ever load of the new multi-squad structure: brings this artifact's
// pre-existing single squad/roster + state/current + history into a real
// squad named "My Squad" (skipped, harmlessly, if there was none), then
// points app/current at it. Best-effort — if two devices race into this on
// the very first load post-update, worst case is two starter squads, and
// deleteSquad can clean that up.
async function migrateOrCreateDefaultSquad(){
  if(migratingSquad) return;
  migratingSquad = true;
  try{
    const [legacyRoster, legacyState] = await Promise.all([
      db.doc('squad/roster').get(), db.doc('state/current').get()
    ]);
    const legacyData = legacyRoster.exists ? legacyRoster.data() : null;
    const hasLegacy = !!(legacyData && (((legacyData.players)||[]).length || ((legacyData.unrankedPlayers)||[]).length));
    const ref = db.collection('squads').doc();
    await ref.set({name:'My Squad', createdAt:new Date().toISOString()});
    await db.doc('squads/'+ref.id+'/state/roster').set(Object.assign(defaultSquad(), hasLegacy ? legacyData : {}));
    const legacyStateData = legacyState.exists ? legacyState.data() : {};
    await db.doc('squads/'+ref.id+'/state/match').set(Object.assign(defaultState(), legacyStateData));
    if(hasLegacy){
      const legacyHistory = await db.collection('history').orderBy('date','desc').limit(50).get();
      for(const d of legacyHistory.docs){
        await db.doc('squads/'+ref.id+'/history/'+d.id).set(d.data());
      }
    }
    await db.doc('app/current').set({squadId: ref.id});
  }catch(e){ /* best effort — worst case the picker just stays empty until retried */ }
  migratingSquad = false;
}

/* ---- game privacy ----
   With the privacy rules, a friend's phone can only read the games whose
   member list contains the name it logged in as (logins/<sign-in id>).
   The host's app keeps two things up to date automatically:
     squads/<id>.members  -  normalised names on that game's player list
     access/<name key>    -  {squads:[ids]} so a phone can find its games
                             without listing every game (needs the exact name)
   Under the older open rules everything below still works the old way. */
let squadsUnsub = null, accessUnsub = null, squadDocUnsubs = {}, squadDocCache = {}, squadsMode = 'list', accessIds = null;
let memberSyncTimer = null, membershipSyncedOnce = false, loginWriteDenied = false, accessWriteDenied = false;
const accessWritten = {};
function accessKey(name){ return sha256Hex('md-access|' + normName(name)).slice(0, 24); }
function setSquadsList(list){
  squadsList = list.slice().sort((a,b)=>String(a.createdAt||'').localeCompare(String(b.createdAt||'')));
  squadsLoaded = true;
  const me0 = normName(getLoginName());
  if(subDenied && currentSquadId && me0 && squadsList.some(x=>x.id===currentSquadId && (x.members||[]).includes(me0))) subscribeToSquad(currentSquadId);
  if(pickedSquadId && !squadsList.some(x=>x.id===pickedSquadId) && squadsMode==='list'){
    pickedSquadId = null; try{ localStorage.removeItem('md_squad'); }catch(e){}
  }
  followTarget();
  loadAllRosters();
  render();
}
function watchSquads(){
  if(squadsUnsub){ squadsUnsub(); squadsUnsub = null; }
  squadsUnsub = db.collection('squads').orderBy('createdAt','asc').onSnapshot(qsnap=>{
    squadsMode = 'list';
    setSquadsList(qsnap.docs.map(d=>Object.assign({id:d.id}, d.data())));
  }, ()=>{
    // not allowed to list every game: find my own games by name instead
    squadsMode = 'access';
    watchMySquadsByAccess();
  });
}
function watchMySquadsByAccess(){
  if(accessUnsub){ accessUnsub(); accessUnsub = null; }
  Object.values(squadDocUnsubs).forEach(u=>u()); squadDocUnsubs = {}; squadDocCache = {};
  const n = getLoginName();
  accessIds = null;
  if(!n){ accessIds = []; setSquadsList([]); return; }
  accessUnsub = db.doc('access/' + accessKey(n)).onSnapshot(snap=>{
    const ids = (snap.exists && snap.data() && snap.data().squads) || [];
    accessIds = ids.slice();
    Object.keys(squadDocUnsubs).forEach(id=>{ if(!ids.includes(id)){ squadDocUnsubs[id](); delete squadDocUnsubs[id]; delete squadDocCache[id]; } });
    if(!ids.length){ setSquadsList([]); return; }
    ids.forEach(id=>{
      if(squadDocUnsubs[id]) return;
      squadDocUnsubs[id] = db.doc('squads/' + id).onSnapshot(sn=>{
        if(sn.exists) squadDocCache[id] = Object.assign({id}, sn.data()); else delete squadDocCache[id];
        setSquadsList(Object.values(squadDocCache));
      }, ()=>{ delete squadDocCache[id]; delete squadDocUnsubs[id]; setSquadsList(Object.values(squadDocCache)); });
    });
  }, ()=>{ accessIds = []; setSquadsList([]); });
}
async function writeLogin(){
  if(!db || !AUTH_UID || isHost()) return;
  const n = normName(getLoginName()); if(!n) return;
  if(loginWriteDenied) return;
  try{ await db.doc('logins/' + AUTH_UID).set({name: n, at: new Date().toISOString()}); }
  catch(e){ if(e && e.code==='permission-denied') loginWriteDenied = true; /* older rules: not needed */ }
}
// after a friend logs in: tell the database who this phone is, then re-read
// re-open the live connections after this phone's permissions change
function reconnectAll(){
  if(!db) return;
  watchSquads();
  if(currentSquadId) subscribeToSquad(currentSquadId);
  loadAllRosters();
}
async function afterLogin(){
  if(!db || isHost()) return;
  await writeLogin();
  if(squadsMode==='access') watchMySquadsByAccess();
  else watchSquads();
  if(currentSquadId) subscribeToSquad(currentSquadId);
  loadAllRosters();
}
function syncMembership(){
  if(!db || !isHost() || !squadsLoaded || !allRostersLoaded) return;
  clearTimeout(memberSyncTimer);
  memberSyncTimer = setTimeout(()=>{
    const byName = {}, affected = new Set();
    squadsList.forEach(sq=>{
      const names = Array.from(new Set(namesInGame(sq.id).map(normName).filter(Boolean))).sort();
      const old = (sq.members||[]).slice().sort();
      if(JSON.stringify(names) !== JSON.stringify(old)){
        db.doc('squads/' + sq.id).update({members: names}).catch(()=>{});
        old.concat(names).forEach(x=>affected.add(x));
      }
      names.forEach(x=>{ (byName[x] = byName[x] || new Set()).add(sq.id); });
    });
    if(!membershipSyncedOnce){ Object.keys(byName).forEach(x=>affected.add(x)); membershipSyncedOnce = true; }
    affected.forEach(x=>{
      if(accessWriteDenied) return;   // older rules: the index isn't needed
      const ids = Array.from(byName[x] || []).sort(), k = accessKey(x), js = JSON.stringify(ids);
      if(accessWritten[k]===js) return;
      accessWritten[k] = js;
      db.doc('access/' + k).set({squads: ids}).catch(e=>{ delete accessWritten[k]; if(e && e.code==='permission-denied'){ accessWriteDenied = true; membershipSyncedOnce = false; } });
    });
  }, 300);
}
function loadAllRosters(){
  if(!db) return;
  clearTimeout(rosterLoadTimer);
  rosterLoadTimer = setTimeout(async ()=>{
    const out = {};
    await Promise.all(squadsList.map(sq=> db.doc('squads/'+sq.id+'/state/roster').get().then(snap=>{
      const d = snap.exists ? snap.data() : {};
      out[sq.id] = (d.players||[]).concat(d.unrankedPlayers||[]).map(p=>p && p.name).filter(Boolean);
    }).catch(()=>{ out[sq.id] = []; })));
    const changed = !allRostersLoaded || JSON.stringify(out) !== JSON.stringify(allRosters);
    allRosters = out; allRostersLoaded = true;
    syncMembership();
    if(loginRetryPending){ loginRetryPending = false; submitLogin(); return; }
    if(changed) render();
  }, 150);
}
function namesInGame(id){
  if(id===currentSquadId && rosterLoaded) return rosterPlayersArr().map(p=>p.name);
  return allRosters[id] || [];
}
// Friends only ever see the games they're on; the host sees every game.
function myGames(){
  if(isHost()) return squadsList;
  const n = getLoginName();
  return n ? gamesForName(n) : [];
}
// A friend looking at a game they're not on gets moved to one of theirs.
let movingGame = false;
function friendBlockedHere(){
  return !isHost() && !!db && !!getLoginName() && rosterLoaded && !getMyPlayerId();
}
function enforceMyGames(){
  if(movingGame || !friendBlockedHere() || !allRostersLoaded) return;
  const games = myGames();
  if(games.length===1 && games[0].id!==currentSquadId){
    movingGame = true;
    setTimeout(()=>{ movingGame = false; switchSquad(games[0].id); }, 0);
  }
}
function gamesForName(name){
  const n = normName(name);
  if(!n) return [];
  return squadsList.filter(sq=> namesInGame(sq.id).some(x=>normName(x)===n));
}
function needsGamePick(){
  if(!db || !squadsLoaded) return false;
  if(isHost()) return squadsList.length>1 && !pickedSquadId;
  if(!allRostersLoaded) return false;
  const games = myGames();
  if(games.length<=1) return false;
  return !(pickedSquadId && games.some(g=>g.id===pickedSquadId)) || friendBlockedHere();
}
function openGamePicker(){ gamePickerOpen = true; newGameDraft = null; loadAllRosters(); render(); window.scrollTo(0,0); }
function closeGamePicker(){ gamePickerOpen = false; newGameDraft = null; render(); }
function openNewGame(){ if(!isHost()) return; newGameDraft = {sport:'cricket', name:''}; render(); }
function renderGamePicker(){
  const me = getLoginName();
  const order = ['football','cricket','basketball','pickleball'];
  const list = myGames().slice().sort((a,b)=> order.indexOf(sportOfSquad(a.id)) - order.indexOf(sportOfSquad(b.id)) || String(a.createdAt).localeCompare(String(b.createdAt)));
  const card = sq=>{
    const sp = SPORTS[sportOfSquad(sq.id)];
    const on = me && namesInGame(sq.id).some(x=>normName(x)===normName(me));
    const n = namesInGame(sq.id).length;
    const sub = isHost() ? (n + ' player' + (n===1?'':'s')) : (on ? 'You’re playing ✓' : '');
    return `<button type="button" class="game-card ${sp.key} ${sq.id===currentSquadId && !needsGamePick() ? 'current' : ''}" onclick="switchSquad('${sq.id}')">
      ${sq.id===currentSquadId && !needsGamePick() ? '<span class="gt">Now</span>' : ''}
      <div class="gi">${sp.icon}</div>
      <div class="gn">${esc(sq.name || sp.name)}</div>
      <div class="gs">${sp.name}${sub ? ' · ' + sub : ''}</div>
    </button>`;
  };
  const form = (isHost() && newGameDraft) ? `
    <div class="page-card" style="margin-top:14px;">
      <div class="panel-title" style="font-size:1.2rem;">＋ New game</div>
      <div class="sport-pick">${order.map(k=>`<button type="button" class="${newGameDraft.sport===k?'active':''}" onclick="newGameDraft.sport='${k}'; render();"><span>${SPORTS[k].icon}</span>${SPORTS[k].name}</button>`).join('')}</div>
      <div class="row" style="gap:8px;">
        <input type="text" class="field-input grow" style="min-width:0;" id="newGameName" maxlength="40" placeholder="${escAttr(SPORTS[newGameDraft.sport].name + ' crew')}" value="${escAttr(newGameDraft.name)}" oninput="newGameDraft.name=this.value" onkeydown="if(event.key==='Enter') createSquad(newGameDraft.name, newGameDraft.sport);">
        <button class="btn btn-primary" style="flex:none;" onclick="createSquad(newGameDraft.name, newGameDraft.sport)">Create</button>
      </div>
      <div class="panel-sub" style="margin:8px 0 0;">Each game has its own players, matches, polls and leaderboard. Add players to it from 🗂 Database once you’re in.</div>
    </div>` : '';
  return `
  <div class="page-head">
    <h2>${needsGamePick() ? 'Pick a game' : 'Games'}</h2>
    <p>${isHost() ? 'Each game has its own players, matches, polls and leaderboard. Friends only see the games they’ve been added to.' : 'These are the games you’ve been added to. You can switch any time with the game button at the top.'}</p>
  </div>
  <div class="game-grid">
    ${list.map(card).join('')}
    ${isHost() && !newGameDraft ? `<button type="button" class="game-card" style="background:var(--panel); color:var(--chalk); border-style:dashed;" onclick="openNewGame()"><div class="gi">＋</div><div class="gn">Add a game</div><div class="gs" style="opacity:.7;">Football, cricket, basketball or pickleball</div></button>` : ''}
  </div>
  ${form}
  ${(!needsGamePick()) ? `<div class="footer-actions" style="justify-content:flex-start;"><button class="btn btn-ghost" onclick="closeGamePicker()">◂ Back</button></div>` : ''}`;
}
function notOnListBannerHtml(){
  if(isHost() || !db || !getLoginName() || getMyPlayerId() || !rosterLoaded) return '';
  return `<div class="banner amber">You’re not on the ${esc(SPORT.name)} player list here yet, so you can watch but not tick in or vote. Ask the host to add you.
    ${squadsList.length>1 ? `<div style="margin-top:8px;"><button class="btn btn-sm" onclick="openGamePicker()">Switch game</button></div>` : ''}</div>`;
}
function targetSquadId(){
  if(pickedSquadId && (!squadsLoaded || squadsList.some(s=>s.id===pickedSquadId))) return pickedSquadId;
  return appCurrentId;
}
function followTarget(){
  const id = targetSquadId();
  if(id && id!==currentSquadId){ currentSquadId = id; matchLoadedFor = null; subscribeToSquad(id); }
}
function createSquad(name, sport){
  sport = SPORTS[sport] ? sport : 'football';
  name = (name||'').trim() || (SPORTS[sport].name + ' crew');
  const created = new Date().toISOString();
  const state = Object.assign(defaultState(), {format: SPORTS[sport].defFormat});
  if(db){
    const ref = db.collection('squads').doc();
    ref.set({name, createdAt:created, sport}).catch(()=>{});
    db.doc('squads/'+ref.id+'/state/roster').set(defaultSquad()).catch(()=>{});
    db.doc('squads/'+ref.id+'/state/match').set(state).catch(()=>{});
    if(!squadsList.some(x=>x.id===ref.id)) squadsList = squadsList.concat([{id:ref.id, name, createdAt:created, sport}]);
    switchSquad(ref.id);
  }else{
    const id = 'local-' + Date.now();
    LOCAL.squads = LOCAL.squads.concat([{id, name, createdAt:created, sport}]);
    LOCAL.data[id] = { squad: defaultSquad(), state, history: [] };
    squadsList = LOCAL.squads;
    switchSquad(id);
  }
  newSquadName = ''; newGameDraft = null;
}
function switchSquad(id){
  if(!id) return;
  if(db){
    pickedSquadId = id;
    try{ localStorage.setItem('md_squad', id); }catch(e){}
    gamePickerOpen = false; showAwards = false; profileId = null; pollRegister = false;
    followTarget();
    render();
    return;
  }
  if(id===currentSquadId){ gamePickerOpen = false; render(); return; }
  {
    LOCAL.currentSquadId = id;
    currentSquadId = id;
    const rec = LOCAL.data[id] || { squad: defaultSquad(), state: defaultState(), history: [] };
    SQUAD = rec.squad; S = rec.state; HISTORY = rec.history; POLLVOTES = rec.pollVotes || [];
    ensureRankBaselineFresh();
    saveLocalStore();
    render();
  }
}
function renameSquad(id, name){
  name = (name||'').trim();
  if(!name) return;
  if(db){
    db.doc('squads/'+id).update({name}).catch(()=>{});
  }else{
    const sq = LOCAL.squads.find(s=>s.id===id);
    if(sq){ sq.name = name; squadsList = LOCAL.squads; saveLocalStore(); render(); }
  }
}
// Removes a squad from the picker. Its documents are left in place (the
// store doesn't cascade-delete nested paths) — harmless, just unreachable.
function deleteSquad(id){
  if(squadsList.length<=1) return; // always keep at least one squad to switch into
  if(db){
    db.doc('squads/'+id).delete().catch(()=>{});
    const next = squadsList.find(s=>s.id!==id);
    if(next && id===appCurrentId) db.doc('app/current').set({squadId: next.id}).catch(()=>{});
    if(id===currentSquadId && next) switchSquad(next.id);
  }else{
    LOCAL.squads = LOCAL.squads.filter(s=>s.id!==id);
    delete LOCAL.data[id];
    squadsList = LOCAL.squads;
    if(id===currentSquadId){ switchSquad(LOCAL.squads[0].id); }
    else { saveLocalStore(); render(); }
  }
}
function toggleSquadManager(){ showSquadManager = !showSquadManager; render(); }

/* ---- shared live database (Firebase Firestore) ----
   Paste your Firebase web-app config between the braces below (it is not a
   secret; Firebase web configs are meant to be public). While it is left as
   null the app simply runs in per-phone "solo" mode. */
const FIREBASE_CONFIG = {
  apiKey: "AIzaSyAPOz_N3v_I8rEIEeFUzsMyVlQnfrcAVTk",
  authDomain: "matchday-draft.firebaseapp.com",
  projectId: "matchday-draft",
  storageBucket: "matchday-draft.firebasestorage.app",
  messagingSenderId: "411510696810",
  appId: "1:411510696810:web:0a114e74ae835b306c5313"
};

// Firestore refuses arrays directly inside arrays (chemistry groups are
// arrays of arrays) and refuses `undefined` — so wrap/strip on the way in and
// unwrap on the way out. Everything else round-trips unchanged.
function fsEncode(v){
  if(Array.isArray(v)) return v.map(x=> Array.isArray(x) ? {__arr: fsEncode(x)} : fsEncode(x));
  if(v && typeof v==='object'){
    const o = {};
    Object.keys(v).forEach(k=>{ if(v[k]!==undefined) o[k] = fsEncode(v[k]); });
    return o;
  }
  return v;
}
function fsDecode(v){
  if(Array.isArray(v)) return v.map(fsDecode);
  if(v && typeof v==='object'){
    const keys = Object.keys(v);
    if(keys.length===1 && keys[0]==='__arr' && Array.isArray(v.__arr)) return v.__arr.map(fsDecode);
    const o = {};
    keys.forEach(k=>{ o[k] = fsDecode(v[k]); });
    return o;
  }
  return v;
}
function fsWrapDocSnap(s){
  return { id: s.id, exists: s.exists, data: ()=> fsDecode(s.data()) };
}
function fsWrapQuerySnap(q){
  return { docs: q.docs.map(fsWrapDocSnap) };
}
function fsWrapQuery(q){
  return {
    orderBy: (f,d)=> fsWrapQuery(q.orderBy(f,d)),
    limit: n=> fsWrapQuery(q.limit(n)),
    get: ()=> q.get().then(fsWrapQuerySnap),
    onSnapshot: (ok,err)=> q.onSnapshot(s=>ok(fsWrapQuerySnap(s)), err)
  };
}
function fsWrapDoc(r){
  return {
    id: r.id,
    get: ()=> r.get().then(fsWrapDocSnap),
    set: d=> r.set(fsEncode(d)).catch(e=>{ onWriteError(e, r.path); throw e; }),
    update: d=> r.update(fsEncode(d)).catch(e=>{ onWriteError(e, r.path); throw e; }),
    delete: ()=> r.delete().catch(e=>{ onWriteError(e, r.path); throw e; }),
    onSnapshot: (ok,err)=> r.onSnapshot(s=>ok(fsWrapDocSnap(s)), err)
  };
}
function initFirebaseDb(){
  try{
    if(!FIREBASE_CONFIG || !window.firebase) return null;
    firebase.initializeApp(FIREBASE_CONFIG);
    const fs = firebase.firestore();
    // The default streaming connection can silently stall on phones (mobile
    // networks, battery savers, in-app browsers): updates only show after a
    // reload. Long-polling is a touch slower but keeps delivering them.
    try{ fs.settings({ experimentalForceLongPolling: true }); }catch(e){}
    try{ if(firebase.auth) FB_AUTH = firebase.auth(); }catch(e){ FB_AUTH = null; }
    return {
      doc: p=> fsWrapDoc(fs.doc(p)),
      collection: p=>{
        const c = fs.collection(p);
        const q = fsWrapQuery(c);
        q.doc = id=> fsWrapDoc(id ? c.doc(id) : c.doc());
        return q;
      }
    };
  }catch(e){ return null; }
}

async function initDb(){
  try{
    if(window.claude && window.claude.use){
      db = await window.claude.use('db');
    }
  }catch(e){ db = null; }
  if(!db) db = initFirebaseDb();

  if(!db){
    LOCAL = loadLocalStore() || defaultLocalStore();
    currentSquadId = LOCAL.currentSquadId;
    squadsList = LOCAL.squads;
    const rec = LOCAL.data[currentSquadId] || { squad: defaultSquad(), state: defaultState(), history: [] };
    SQUAD = rec.squad; S = rec.state; HISTORY = rec.history; POLLVOTES = rec.pollVotes || []; pollVotesLoaded = true;
    ensureRankBaselineFresh();
    dbReady = true;
    rosterLoaded = true;
    render();
    return;
  }
  setTimeout(()=>{ if(!(dbReady && rosterLoaded)){ slowConnect = true; render(); } }, 10000);
  await ensureAuth();
  syncHostClaim();
  if(!isHost() && getLoginName()) await writeLogin();

  pinsLoaded = false;
  db.collection('pins').onSnapshot(qsnap=>{
    PINS = {};
    qsnap.docs.forEach(d=>{ const x = d.data(); if(x && x.h) PINS[d.id] = x.h; });
    pinsLoaded = true;
    render();
  }, ()=>{ pinsLoaded = true; render(); });

  watchSquads();

  db.doc('app/current').onSnapshot(snap=>{
    const id = snap.exists ? snap.data().squadId : null;
    appCurrentId = id;
    if(id){
      followTarget();
    } else if(!id){
      dbReady = true;
      migrateOrCreateDefaultSquad();
    }
    render();
  }, ()=>{ dbReady = true; render(); });
}

