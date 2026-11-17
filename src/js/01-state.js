/* ============================= State & storage ============================= */

let FORMATS = [5,6,7,8];

// Per-match state — who's playing, what mode, how the draft/split is going.
// The player database itself (SQUAD) lives separately and persists forever.
function defaultState(){
  return {
    phase:'setup',
    poll:null,            // the current "who's in?" poll (host-written); answers live in squads/<id>/pollVotes
    format:6,
    selectedIds:[],       // which SQUAD players are attending this match
    playingIds:null,
    subIds:null,
    mode:null,
    randomResult:null,
    captainPickMode:null,
    captains:{a:null,b:null},
    budget:100,
    basePrice:10,
    increment:5,
    timerSecs:30,         // seconds each captain gets per decision in the auction (0 = no timer)
    rsvpLog:[],           // who ticked in/out today, with times (feeds attendance tracking)
    attSnap:null,         // snapshot taken when the squad is locked: who was expected / dropped out
    auction:null,
    lastHistoryId:null,   // history doc this match is writing to, for the result form
    // "extra player" prompt (shown once selection hits exactly format*2): null
    // until the host answers; oddSide is which team carries the extra player
    // once they've said one more's coming; extraConfirmedEven means "no,
    // that's everyone" was tapped so the prompt stays dismissed. Both reset
    // whenever the format changes.
    oddSide:null,
    extraConfirmedEven:false,
    benchOk:false,        // host chose: keep the format, extra players go on the bench
    updatedAt:null
  };
}

function defaultSquad(){
  // guests: one-off fill-ins — kept separate from players/unrankedPlayers so
  // they never show up in roster management, the match-day picker (after
  // today), or the monthly awards, but their name still resolves forever in
  // old match history.
  return { players:[], unrankedPlayers:[], guests:[], chemistryGroups:[], stats:{}, coWin:{}, rankBaseline:[], rankBaselineMonth:null };
}

let db = null;               // resolved db capability, or null
let S = defaultState();      // synced match state, scoped to the active squad
let SQUAD = defaultSquad();  // persistent player database for the active squad
let HISTORY = [];            // recent saved matches for the active squad
let rosterLoaded = false;    // this squad's roster has arrived (or definitely won't)
let slowConnect = false;     // still waiting after a while — show a hint
let loginDraft = '';
let loginError = '';
let dbReady = false;         // becomes true once we know db is usable (or definitely not)

// ---- multi-squad ----
// Everything above (S/SQUAD/HISTORY) belongs to ONE squad at a time — the
// "active" squad every device is currently looking at, tracked by
// currentSquadId. squadsList is every squad that exists, for the picker.
// In db mode the active squad is a shared pointer (app/current) so every
// phone follows the host's choice; with no db it's just a local list.
let currentSquadId = null;
let squadsList = [];         // [{id, name, createdAt}]
let unsubRoster = null, unsubMatch = null, unsubHistory = null; // db-mode listener teardown
let migratingSquad = false;  // guards this device from double-running the legacy-data migration
let LOCAL = null;            // no-db fallback store: { currentSquadId, squads:[...], data:{[id]:{squad,state,history}} }
let showSquadManager = false;
let newSquadName = '';
let showHostCode = false;   // inline "enter the host code" box on the login page
let hostCodeDraft = '';
let hostCodeError = false;

// ---- who's using this device ----
// Host access is a fixed, deliberate claim (Keerat's own devices) rather than
// a casual option next to "spectator" — nobody should be able to get host
// controls just by picking "Host" from a dropdown, or even by tapping a plain
// "I'm the host" button (that's still just self-declaration). Instead, host
// access is only ever granted to a device that opens the app through a
// secret link — one you keep for yourself and never share with players —
// of the form yourlink#host=<host code>, or by typing that code on the login
// page. Only a SHA-256 fingerprint of the code lives in this file, so reading
// the page source doesn't reveal it. Everyone else logs in with just their
// name; if that player later becomes a captain, their device picks up captain
// powers automatically the next time captains change.
const HOST_HASH = '310a65a502a0b5285e9f9d908fd6eee263a06e3ff891e779d43ebfec308e532b';
// Small synchronous SHA-256 (works on http/file pages where crypto.subtle may not exist).
function sha256Hex(str){
  const rotr = (x,n)=> (x>>>n) | (x<<(32-n));
  const primes = []; for(let n=2; primes.length<64; n++){ if(primes.every(p=>n%p)) primes.push(n); }
  const frac = x=> Math.floor((x-Math.floor(x))*4294967296);
  const K = primes.map(p=>frac(Math.cbrt(p)));
  const H = primes.slice(0,8).map(p=>frac(Math.sqrt(p)));
  const data = Array.from(unescape(encodeURIComponent(str)), c=>c.charCodeAt(0));
  const bitLen = data.length*8;
  data.push(0x80);
  while(data.length%64 !== 56) data.push(0);
  const hi = Math.floor(bitLen/4294967296), lo = bitLen>>>0;
  [hi,lo].forEach(w=>{ for(let s=24;s>=0;s-=8) data.push((w>>>s)&255); });
  for(let off=0; off<data.length; off+=64){
    const w = new Array(64);
    for(let i=0;i<16;i++) w[i] = (data[off+4*i]<<24)|(data[off+4*i+1]<<16)|(data[off+4*i+2]<<8)|data[off+4*i+3];
    for(let i=16;i<64;i++){
      const s0 = rotr(w[i-15],7)^rotr(w[i-15],18)^(w[i-15]>>>3);
      const s1 = rotr(w[i-2],17)^rotr(w[i-2],19)^(w[i-2]>>>10);
      w[i] = (w[i-16]+s0+w[i-7]+s1)|0;
    }
    let [a,b,c,d,e,f,g,h] = H;
    for(let i=0;i<64;i++){
      const S1 = rotr(e,6)^rotr(e,11)^rotr(e,25);
      const ch = (e&f)^(~e&g);
      const t1 = (h+S1+ch+K[i]+w[i])|0;
      const S0 = rotr(a,2)^rotr(a,13)^rotr(a,22);
      const maj = (a&b)^(a&c)^(b&c);
      const t2 = (S0+maj)|0;
      h=g; g=f; f=e; e=(d+t1)|0; d=c; c=b; b=a; a=(t1+t2)|0;
    }
    [a,b,c,d,e,f,g,h].forEach((v,i)=>{ H[i] = (H[i]+v)|0; });
  }
  return H.map(v=>(v>>>0).toString(16).padStart(8,'0')).join('');
}
function isHostCode(x){ return sha256Hex(String(x)) === HOST_HASH; }
let pickedSquadId = null;        // the game this phone chose (each person picks their own)
try{ pickedSquadId = localStorage.getItem('md_squad') || null; }catch(e){}
let appCurrentId = null, squadsLoaded = false, matchLoadedFor = null, historyLoadedFor = null;
let gamePickerOpen = false, newGameDraft = null;
let allRosters = {}, allRostersLoaded = false, rosterLoadTimer = null, loginRetryPending = false;
let scrollToPoll = false;
let scrollToPay = false;
let showPayments = false, feeEditId = null, feeDraft = null, payQrOpen = false, paySettings = null, payCopyFlash = false;
let pendingVote = null;          // {poll, vote} from a one-tap answer link, applied once logged in
let pollVotesLoaded = false;
const pollSeenMarked = new Set();   // polls this phone has already reported as seen
let infoToast = null, infoTimer = null;
let isHostDevice = false;
let pendingHostCode = null;      // host code entered this session, sent once to the database as proof
let FB_AUTH = null, AUTH_UID = null;
let authStatus = 'none';         // 'ok' | 'off' (anonymous sign-in not enabled in Firebase) | 'error' | 'none'
let hostClaimState = 'na';       // 'ok' | 'needed' | 'unknown' | 'na'
let hostConfirmDraft = '', hostConfirmErr = false;
let deniedToast = null, deniedTimer = null;
try{
  const stored = localStorage.getItem('md_is_host');
  if(stored != null){
    isHostDevice = stored === '1';
  } else if(localStorage.getItem('md_role') === 'host'){
    // migrate a device that had already set the old manual "Host" toggle
    isHostDevice = true;
    localStorage.setItem('md_is_host', '1');
  }
  // Opening the app via the secret host link grants (or re-grants) host
  // access on this device, permanently, until it's explicitly stepped down.
  if(/^#poll\b/.test(window.location.hash||'')){
    scrollToPoll = true;
    history.replaceState(null, '', window.location.pathname + window.location.search);
  }
  // one-tap answer links from the WhatsApp message: ?poll=<id>&vote=<option|no>
  const qs = new URLSearchParams(window.location.search||'');
  if(qs.has('pay')){
    scrollToPay = true; qs.delete('pay');
    const r0 = qs.toString();
    history.replaceState(null, '', window.location.pathname + (r0 ? '?'+r0 : '') + (window.location.hash||''));
  }
  if(qs.get('g')){
    pickedSquadId = qs.get('g');
    try{ localStorage.setItem('md_squad', pickedSquadId); }catch(e){}
    qs.delete('g');
    if(!qs.has('poll') && !qs.has('vote')){
      const rest0 = qs.toString();
      history.replaceState(null, '', window.location.pathname + (rest0 ? '?'+rest0 : '') + (window.location.hash||''));
    }
  }
  if(qs.has('poll') || qs.has('vote')){
    scrollToPoll = true;
    if(qs.get('vote')) pendingVote = {poll: qs.get('poll')||'', vote: qs.get('vote')};
    qs.delete('poll'); qs.delete('vote'); qs.delete('md-check');
    const rest = qs.toString();
    history.replaceState(null, '', window.location.pathname + (rest ? '?'+rest : '') + (window.location.hash||''));
  }
  const hashMatch = (window.location.hash||'').match(/[#&]host=([^&]+)/);
  if(hashMatch && isHostCode(decodeURIComponent(hashMatch[1]))){
    isHostDevice = true;
    pendingHostCode = decodeURIComponent(hashMatch[1]);
    localStorage.setItem('md_is_host', '1');
    // scrub the secret out of the visible URL so it doesn't linger in the
    // address bar (e.g. if the screen is ever shared or the tab is bookmarked mid-secret)
    history.replaceState(null, '', window.location.pathname + window.location.search);
  }
}catch(e){}

let showHistory = false;
let showDatabase = false;
let showAwards = false;      // the monthly awards board — open to every viewer, not just the host
let showAwardsCard = false;  // the screenshot-friendly shareable summary, nested inside the awards modal
let showLogMatch = false;
let manualPickStage = 'a';   // which captain slot manual-picking is filling next
let editingPlayerId = null;  // database row whose position/attribute editor is open
let chemSelection = [];      // ids currently ticked in the chemistry-link builder
let histOpen = new Set();   // past-match cards currently expanded
let setupSearch = '';        // search box above today's player list
let dbSearch = '';           // host-only player database search
let dbPosFilter = 'ALL';     // host-only position filter
let statsMonth = null;       // 'YYYY-MM' the leaderboard/awards are showing — defaults to the current month
let addForm = {positions:['MID'], attributes:{}, unknown:false, star:false}; // draft state for the add-player form
let guestForm = {name:'', positions:['MID'], of:[]};   // of: player ids who brought them, or ['*'] for everyone playing
let guestEditId = null; // draft state for the "add a guest for today" quick-add
let resultDraft = {winner:null, scoreA:'', scoreB:'', duration:'', scorers:[], assists:[], saved:false, ps:{}, wktsA:'', wktsB:''}; // draft match-result form
let logDraft = null;         // draft state for "log a match played outside the app"
let editingHistoryId = null; // history entry currently being edited, or null
let historyEditDraft = null; // draft state for the history-edit form
let pendingDeleteId = null;  // history entry awaiting a second tap to confirm deletion
let PINS = {};                // pin-doc id -> hash (shared, so a player's PIN follows them to any phone)
let pinsLoaded = false;
let pinStep = null;          // login: {name} while we wait for that player's PIN
let pinDraft = '', pinError = '';
let pinFails = 0, pinLockUntil = 0;
let pinModalOpen = false, pinSetDraft = '', pinSetError = '', pinOfferedFor = null, pinResetArm = null;
let profilePickerOpen = false;
let profileId = null;        // player whose profile card is open
let installHelp = false, deferredInstall = null;
let updateReady = false;     // the service worker found a newer version of the app
let alertsOn = (function(){ try{ return localStorage.getItem('md_alerts')!=='off'; }catch(e){ return true; } })();
let statsScope = 'month';     // leaderboard view: 'month' | 'season' | 'all' | 'rivals'
let statsSeason = null;      // 'YYYY' shown in the season view (defaults to this year)
let showBackup = false;       // host-only backup & restore modal
let restoreDraft = null;      // {data, summary, error} parsed from a chosen backup file
let restoreArm = false, restoreBusy = '', backupBusy = false, backupMsg = '';
let profileMatchesAll = false;
let profileVoteOpen = null;   // match id whose man-of-the-match vote is expanded on your profile // profile 'Past matches': show every match instead of the latest few
let profileTab = 'stats';    // profile card tab: 'stats' | 'rivals'
let RIVALS = [];             // rivalry docs for the active squad
let unsubRiv = null;
let POLLVOTES = [], unsubPoll = null;
let pollFormOpen = false, pollDraft = {q:'', opts:[], custom:''}, pollFormErr = '';
let pollRegister = false, pollEndArm = false;
let rivalArm = null;         // rivalry awaiting a second tap to end
let showAttendance = false;  // host-only attendance modal
let timerKey = '', timerStart = 0, timerFiredAt = 0, timerWarnKey = '';
let copyFeedback = false;    // briefly true right after "copy team sheet" succeeds

/* ---- id helpers ---- */
function slugify(name){
  let s = name.trim().toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/(^-+|-+$)/g,'');
  return s || ('p' + Date.now());
}
function uniqueId(base, existingIds){
  let id = base, n = 2;
  while(existingIds.includes(id)){ id = base + '-' + n; n++; }
  return id;
}
function escAttr(str){ return esc(str).replace(/"/g,'&quot;').replace(/'/g,'&#39;'); }
function esc(str){
  const d = document.createElement('div');
  d.textContent = str == null ? '' : String(str);
  return d.innerHTML;
}
function cloneSquad(){ return JSON.parse(JSON.stringify(SQUAD)); }

/* ---- the player database (SQUAD) ---- */
function allPlayersArr(){
  return SQUAD.players.concat(SQUAD.unrankedPlayers||[]).concat(SQUAD.guests||[]);
}
// The persistent roster only — players and unranked, never guests. Used
// anywhere a guest shouldn't linger: roster management, the chemistry
// picker, next time's match-day list.
function rosterPlayersArr(){
  return SQUAD.players.concat(SQUAD.unrankedPlayers||[]);
}
function allPlayerIds(){
  return allPlayersArr().map(p=>p.id);
}
function findPlayer(id){
  return allPlayersArr().find(p=>p.id===id);
}
function isGuest(id){
  return (SQUAD.guests||[]).some(p=>p.id===id);
}
function playerName(id){
  const p = findPlayer(id);
  return p ? p.name : '(unknown)';
}
// Ability rank = index among KNOWN players (ascending, weakest first) in the
// persistent database. A player with unknown ability isn't part of that
// ordering — for balancing purposes we treat them as exactly average, so
// they don't skew either team.
function rankOf(id){
  const idx = SQUAD.players.findIndex(p=>p.id===id);
  if(idx>=0) return idx;
  return SQUAD.players.length ? (SQUAD.players.length-1)/2 : 0;
}
function statsOf(id){
  return Object.assign({played:0,wins:0,losses:0,draws:0,goals:0,assists:0}, (SQUAD.stats||{})[id]);
}

/* ---- positions & attributes ---- */
function nameLink(id, label){
  const p = findPlayer(id);
  const t = esc(label != null ? label : playerName(id));
  if(!p || isGuest(id)) return t;
  return `<button type="button" class="pname-link" onclick="event.stopPropagation(); openProfile('${id}')">${t}</button>`;
}
