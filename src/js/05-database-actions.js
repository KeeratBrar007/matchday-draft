/* ============================= Database actions ============================= */

// Ability rank normally only moves for a reason: a manual edit (the ▲▼
// arrows, or ranking someone for the first time) or an automatic nudge after
// a win. The automatic nudges are meant to reflect *this month's* form —
// rankBaseline is "the order as it was last set on purpose", and every
// manual edit updates it immediately. At the start of a new calendar month,
// applyMonthlyRankReset snaps the live order back to that baseline, undoing
// whatever the automatic win-nudges drifted it to, while anything the host
// deliberately changed stays exactly as they left it.
function syncRankBaseline(next){
  next.rankBaseline = next.players.map(p=>p.id);
  next.rankBaselineMonth = currentYearMonth();
  return next;
}
function applyMonthlyRankReset(next){
  const month = currentYearMonth();
  if(next.rankBaselineMonth === month) return next; // already current
  if(!next.rankBaseline || !next.rankBaseline.length){
    // never tracked a baseline before (older data) — adopt today's order as
    // the starting point rather than reverting to nothing
    return syncRankBaseline(next);
  }
  const byId = {};
  next.players.forEach(p=> byId[p.id]=p);
  const reverted = [];
  next.rankBaseline.forEach(id=>{ if(byId[id]){ reverted.push(byId[id]); delete byId[id]; } });
  // anyone current the baseline doesn't know about (graduated from unranked
  // mid-month, or added after the baseline was captured) — keep them, in
  // their current relative order, appended at the end
  next.players.forEach(p=>{ if(byId[p.id]){ reverted.push(p); delete byId[p.id]; } });
  next.players = reverted;
  return syncRankBaseline(next);
}
// Cheap to call on every squad load — only actually rewrites anything the
// first time it notices the calendar month has moved on.
function ensureRankBaselineFresh(){
  if(SQUAD.rankBaselineMonth === currentYearMonth()) return;
  saveSquadDoc(applyMonthlyRankReset(cloneSquad()));
}

function addPlayer(name, positions, attributes, unknown, star){
  name = name.trim();
  if(!name) return;
  positions = (positions||[]).filter(p=>POSITIONS[p]);
  if(!positions.length) positions = ['MID'];
  const cleanAttrs = {};
  Object.keys(attributes||{}).forEach(k=>{
    if(ATTRIBUTES[k] && (attributes[k]===1 || attributes[k]===2)) cleanAttrs[k]=attributes[k];
  });
  const existingIds = allPlayerIds();
  const id = uniqueId(slugify(name), existingIds);
  const player = {id, name, positions, attributes:cleanAttrs, star: !!star};
  const next = cloneSquad();
  if(unknown) next.unrankedPlayers = (next.unrankedPlayers||[]).concat([player]);
  else { next.players = next.players.concat([player]); syncRankBaseline(next); }
  saveSquadDoc(next);
  saveState({selectedIds: (S.selectedIds||[]).concat([id])});
}

// A one-off fill-in for today only. Counts toward today's balancing (treated
// like any other unranked/average-ability player) and today's history entry,
// but lives in SQUAD.guests — never the ranked/unranked roster — so it never
// shows up in roster management, next time's match-day picker, the
// chemistry-link builder, or the monthly awards board. Open to anyone, same
// as ticking your own name in the picker.
function addGuestPlayer(name, positions, of){
  name = (name||'').trim();
  if(!name) return;
  positions = (positions||[]).filter(p=>POSITIONS[p]);
  if(!positions.length) positions = ['MID'];
  const id = uniqueId(slugify(name), allPlayerIds());
  const guest = {id, name, positions, guest:true, of: (of||[]).slice()};
  const next = cloneSquad();
  next.guests = (next.guests||[]).concat([guest]);
  saveSquadDoc(next);
  saveState({selectedIds: (S.selectedIds||[]).concat([id])});
}
function toggleGuestPosition(pos, btn){
  const has = guestForm.positions.includes(pos);
  if(has && guestForm.positions.length<=1) return; // always keep at least one
  guestForm.positions = has ? guestForm.positions.filter(x=>x!==pos) : guestForm.positions.concat([pos]);
  if(btn) btn.classList.toggle('active');
}
function submitGuestPlayer(){
  if(!isHost()) return;
  addGuestPlayer(guestForm.name, guestForm.positions, guestForm.of);
  guestForm = {name:'', positions:['MID'], of:[]};
  render();
}
// ---- "guest of": one person, several, or everyone playing ----
function guestOf(id){ const g = (SQUAD.guests||[]).find(x=>x.id===id); return g ? (g.of||[]) : []; }
function guestOfText(id, ofList){
  const of = ofList || guestOf(id);
  if(!of.length) return '';
  if(of.includes('*')) return 'everyone’s guest';
  const n = of.map(playerName).filter(Boolean);
  return 'guest of ' + (n.length<=2 ? n.join(' & ') : n.slice(0,-1).join(', ') + ' & ' + n[n.length-1]);
}
function guestTag(id){
  if(!isGuest(id)) return '';
  const t = guestOfText(id);
  return ` <span class="chip guest-tag">${t ? esc(t.charAt(0).toUpperCase() + t.slice(1)) : 'Guest'}</span>`;
}
function toggleGuestOf(list, pid){
  if(pid==='*') return list.includes('*') ? [] : ['*'];
  const l = list.filter(x=>x!=='*');
  return l.includes(pid) ? l.filter(x=>x!==pid) : l.concat([pid]);
}
function guestOfFormToggle(pid){ guestForm.of = toggleGuestOf(guestForm.of, pid); render(); }
function guestOfEditToggle(gid, pid){
  if(!isHost()) return;
  const next = cloneSquad();
  const g = (next.guests||[]).find(x=>x.id===gid); if(!g) return;
  g.of = toggleGuestOf(g.of||[], pid);
  saveSquadDoc(next);
}
function guestOfChipsHtml(current, onTap, excludeId){
  const sel = (S.selectedIds||[]).filter(id=>!isGuest(id) && id!==excludeId && findPlayer(id));
  const pool = sel.length ? sel : rosterPlayersArr().map(p=>p.id);
  const all = current.includes('*');
  return `<div class="chip-toggle-row" style="margin-top:6px;">
    <button type="button" class="chip-toggle ${all?'active':''}" onclick="${onTap('*')}">👥 Everyone playing</button>
    ${pool.map(id=>`<button type="button" class="chip-toggle ${!all && current.includes(id)?'active':''}" onclick="${onTap(id)}">${esc(playerName(id))}</button>`).join('')}
  </div>`;
}

// Bring a not-yet-ranked player into the ability ordering, inserted at the
// middle for now — nudge them up/down with the arrows once you've actually
// seen them play (or let a couple of wins do it automatically).
function rankPlayerNow(id){
  const next = cloneSquad();
  const p = (next.unrankedPlayers||[]).find(x=>x.id===id);
  if(!p) return;
  next.unrankedPlayers = next.unrankedPlayers.filter(x=>x.id!==id);
  next.players.splice(Math.round(next.players.length/2), 0, p);
  syncRankBaseline(next);
  saveSquadDoc(next);
}

function toggleEditPanel(id){
  editingPlayerId = (editingPlayerId===id) ? null : id;
  render();
}
function togglePlayerPosition(id, pos){
  const flip = arr => arr.map(p=>{
    if(p.id!==id) return p;
    const positions = p.positions||[];
    const has = positions.includes(pos);
    if(has && positions.length<=1) return p; // always keep at least one
    return Object.assign({}, p, {positions: has ? positions.filter(x=>x!==pos) : positions.concat([pos])});
  });
  const next = cloneSquad();
  next.players = flip(next.players);
  next.unrankedPlayers = flip(next.unrankedPlayers||[]);
  saveSquadDoc(next);
}
// Cycles a player's attribute through off → normal → "+" (exceptional) → off.
function togglePlayerAttribute(id, attr){
  const cycle = arr => arr.map(p=>{
    if(p.id!==id) return p;
    const cur = attributesOf(p.id)[attr] || 0;
    const next = (cur+1) % 3;
    const attrs = Object.assign({}, attributesOf(p.id));
    if(next===0) delete attrs[attr]; else attrs[attr]=next;
    return Object.assign({}, p, {attributes:attrs});
  });
  const next = cloneSquad();
  next.players = cycle(next.players);
  next.unrankedPlayers = cycle(next.unrankedPlayers||[]);
  saveSquadDoc(next);
}
function togglePlayerStar(id){
  const flip = arr => arr.map(p=> p.id===id ? Object.assign({}, p, {star: !p.star}) : p);
  const next = cloneSquad();
  next.players = flip(next.players);
  next.unrankedPlayers = flip(next.unrankedPlayers||[]);
  saveSquadDoc(next);
}
// Long-term unavailable (injured, traveling, etc.) — hidden from the
// match-day picker without touching their stats/history/rank. Distinct from
// just not ticking them for one match: this persists week to week until
// flipped back.
function toggleUnavailable(id){
  const flip = arr => arr.map(p=> p.id===id ? Object.assign({}, p, {unavailable: !p.unavailable}) : p);
  const next = cloneSquad();
  next.players = flip(next.players);
  next.unrankedPlayers = flip(next.unrankedPlayers||[]);
  saveSquadDoc(next);
}

function removePlayer(id){
  const next = cloneSquad();
  next.players = next.players.filter(p=>p.id!==id);
  next.unrankedPlayers = (next.unrankedPlayers||[]).filter(p=>p.id!==id);
  next.chemistryGroups = (next.chemistryGroups||[]).map(g=>g.filter(x=>x!==id)).filter(g=>g.length>1);
  syncRankBaseline(next);
  saveSquadDoc(next);
  saveState({selectedIds: (S.selectedIds||[]).filter(x=>x!==id)});
}

function movePlayer(id, dir){
  const next = cloneSquad();
  const idx = next.players.findIndex(p=>p.id===id);
  const j = idx+dir;
  if(idx<0 || j<0 || j>=next.players.length) return;
  [next.players[idx],next.players[j]] = [next.players[j],next.players[idx]];
  syncRankBaseline(next);
  saveSquadDoc(next);
}

/* ---- add-player form (kept local/imperative so typing never loses focus) ---- */
function autofillFromSquad(name){
  const match = allPlayersArr().find(p=>p.name.toLowerCase()===name.trim().toLowerCase());
  if(!match) return;
  addForm.positions = (match.positions && match.positions.length) ? match.positions.slice() : ['MID'];
  addForm.attributes = {};
  const raw = match.attributes;
  if(Array.isArray(raw)) raw.forEach(k=>{ if(ATTRIBUTES[k]) addForm.attributes[k]=1; });
  else if(raw) Object.keys(raw).forEach(k=>{ if(ATTRIBUTES[k]) addForm.attributes[k]=raw[k]; });

  document.querySelectorAll('.add-pos-chip').forEach(btn=>{
    btn.classList.toggle('active', addForm.positions.includes(btn.dataset.pos));
  });
  document.querySelectorAll('.add-attr-chip').forEach(btn=>{
    const lvl = addForm.attributes[btn.dataset.attr]||0;
    btn.classList.toggle('active', lvl>0);
    btn.classList.toggle('plus', lvl===2);
    btn.textContent = attrChipLabel(btn.dataset.attr, lvl);
  });
}
function toggleAddPosition(pos, btn){
  const i = addForm.positions.indexOf(pos);
  if(i>=0){
    if(addForm.positions.length>1){ addForm.positions.splice(i,1); btn.classList.remove('active'); }
  }else{
    addForm.positions.push(pos); btn.classList.add('active');
  }
}
function cycleAddAttribute(attr, btn){
  const cur = addForm.attributes[attr]||0;
  const next = (cur+1) % 3;
  if(next===0) delete addForm.attributes[attr]; else addForm.attributes[attr]=next;
  btn.classList.toggle('active', next>0);
  btn.classList.toggle('plus', next===2);
  btn.textContent = attrChipLabel(attr, next);
}
function toggleAddUnknown(btn){
  addForm.unknown = !addForm.unknown;
  btn.classList.toggle('active', addForm.unknown);
}
function toggleAddStar(btn){
  addForm.star = !addForm.star;
  btn.classList.toggle('active', addForm.star);
}
function submitAddPlayer(){
  const inp = document.getElementById('addNameInput');
  if(!inp || !inp.value.trim()) return;
  addPlayer(inp.value, addForm.positions, addForm.attributes, addForm.unknown, addForm.star);
  inp.value = '';
  addForm = {positions:['MID'], attributes:{}, unknown:false, star:false};
  inp.focus();
}

/* ---- chemistry links ---- */
function toggleChemSelect(id){
  const i = chemSelection.indexOf(id);
  if(i>=0) chemSelection.splice(i,1); else chemSelection.push(id);
  render();
}
function mergeChemistry(groups, ids){
  let merged = ids.slice();
  const remaining = [];
  groups.forEach(g=>{
    if(g.some(id=>merged.includes(id))) merged = Array.from(new Set(merged.concat(g)));
    else remaining.push(g);
  });
  remaining.push(merged);
  return remaining;
}
function linkChemistry(){
  if(chemSelection.length<2) return;
  const next = cloneSquad();
  next.chemistryGroups = mergeChemistry(next.chemistryGroups||[], chemSelection.slice());
  chemSelection = [];
  saveSquadDoc(next);
}
function unlinkChemistry(idx){
  const next = cloneSquad();
  next.chemistryGroups = (next.chemistryGroups||[]).slice();
  next.chemistryGroups.splice(idx,1);
  saveSquadDoc(next);
}

