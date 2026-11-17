/* ============================= "Who's in?" polls =============================
   The host makes a poll here and shares it to the WhatsApp group; friends tap the
   link and answer in the app. The app knows the whole roster, so it can list exactly
   who hasn't replied. Picking the winning slot ticks those players in for the match. */
function pollDefaultQ(){ return 'Who’s in for ' + SPORT.play + '?'; }
function pollEligible(){ return rosterPlayersArr().filter(p=>!p.unavailable && !p.guest); }
function pollVotesMap(){
  const p = S.poll, m = {};
  if(!p) return m;
  POLLVOTES.forEach(v=>{ if(v && v.pollId===p.id && findPlayer(v.playerId)) m[v.playerId] = v; });
  return m;
}
function pollAnswered(v){ return !!(v && (v.no || (v.slots||[]).length)); }
function pollVisible(){
  const p = S.poll;
  if(!p) return false;
  if(p.status!=='decided') return true;
  // a confirmed poll stays up until that match has been played and saved
  return !HISTORY.some(h=> String(h.date||'') > String(p.decidedAt||''));
}
function pollNeedsMyAnswer(){
  const me = getMyPlayerId();
  if(!me || !pollVisible() || S.poll.status!=='open') return false;
  return !pollAnswered(pollVotesMap()[me]);
}
function pollNoReply(){ const m = pollVotesMap(); return pollEligible().filter(p=>!pollAnswered(m[p.id])); }
// "Seen": the poll was on their screen but they haven't picked anything yet.
// Stored as an empty answer, so it needs no extra database rule.
function pollSeenOnly(){ const m = pollVotesMap(); return pollEligible().filter(p=>m[p.id] && !pollAnswered(m[p.id])); }
function markPollSeen(){
  const p = S.poll, me = getMyPlayerId();
  if(!p || !me || !pollVotesLoaded || pollSeenMarked.has(p.id) || !pollVisible()) return;
  pollSeenMarked.add(p.id);
  if(pollVotesMap()[me]) return;            // already seen or answered
  const vid = p.id + '__' + me;
  const doc = {pollId: p.id, playerId: me, slots: [], no: false, at: new Date().toISOString()};
  if(db) db.doc(squadPath('pollVotes/' + vid)).set(doc).catch(()=>{});
  else { POLLVOTES = POLLVOTES.concat([Object.assign({id: vid}, doc)]); localCommit(); }
}
// Links in shared messages must open on friends' phones, so they always point at the
// live site, even when the poll was made from a downloaded copy or a test page.
const SITE_URL = 'https://keeratbrar007.github.io/matchday-draft/';
function siteBase(){
  const live = /^https:$/.test(location.protocol) && /\.github\.io$/.test(location.hostname);
  return live ? location.origin + location.pathname.replace(/index\.html$/, '') : SITE_URL;
}
function pollLinkFor(poll, vote){ return siteBase() + '?g=' + encodeURIComponent(currentSquadId||'') + '&poll=' + encodeURIComponent(poll.id) + (vote ? '&vote=' + encodeURIComponent(vote) : ''); }
function pollLink(vote){ return S.poll ? pollLinkFor(S.poll, vote) : siteBase(); }
function infoToastHtml(){
  return infoToast ? `<div class="update-toast" role="status"><span>${esc(infoToast)}</span><button class="btn btn-sm" onclick="infoToast=null; render();">OK</button></div>` : '';
}
function showInfo(msg){ infoToast = msg; clearTimeout(infoTimer); infoTimer = setTimeout(()=>{ infoToast = null; render(); }, 6000); }
function applyPendingVote(){
  const pv = pendingVote; if(!pv) return;
  const me = getMyPlayerId(); if(!me || !pollVotesLoaded || (db && matchLoadedFor!==currentSquadId)) return;
  pendingVote = null;
  const p = S.poll;
  if(!p || !pollVisible() || (pv.poll && pv.poll !== p.id)){ showInfo('That poll has finished. Here’s the latest one.'); render(); return; }
  if(pv.vote === 'no'){
    pollAnswerNo();
    showInfo('✅ Saved: you can’t make it. Tap below to change.');
  }else{
    const o = p.opts.find(x=>x.id===pv.vote);
    if(!o){ render(); return; }
    const cur = pollVotesMap()[me];
    const slots = (cur && !cur.no) ? (cur.slots||[]).filter(x=>x!==o.id) : [];
    slots.push(o.id);
    castPollVote(me, slots, false);
    showInfo('✅ Saved: you’re in for ' + o.label + (p.opts.length>1 && p.status!=='decided' ? '. Tick any other times that work too.' : '.'));
  }
  render();
}
// api.whatsapp.com keeps emoji intact (the short wa.me address can turn them into "�")
function openWhatsApp(text){ window.open('https://api.whatsapp.com/send?text=' + encodeURIComponent(text), '_blank', 'noopener'); }
function isoDay(dt){ return dt.getFullYear() + '-' + String(dt.getMonth()+1).padStart(2,'0') + '-' + String(dt.getDate()).padStart(2,'0'); }
function slotLabel(dt, part){ return dt.toLocaleDateString(undefined, {weekday:'short', day:'numeric', month:'short'}) + ' · ' + part; }
// The same weekday as last time, on or after today, and always later than last time's date.
function nextSameWeekday(isoD){
  const [y,m,dd] = isoD.split('-').map(Number), old = new Date(y, m-1, dd), now = new Date();
  const dt = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  while(dt.getDay() !== old.getDay()) dt.setDate(dt.getDate()+1);
  while(dt <= old) dt.setDate(dt.getDate()+7);
  return dt;
}
function repeatPollPlan(){
  const lp = SQUAD.lastPoll;
  if(!lp || !Array.isArray(lp.opts) || !lp.opts.length) return null;
  return {max: lp.max || null, q: lp.q || pollDefaultQ(), opts: lp.opts.map(o=> (o && o.d && o.part) ? {label: slotLabel(nextSameWeekday(o.d), o.part), d: isoDay(nextSameWeekday(o.d)), part: o.part} : {label: (o && o.label) || ''}).filter(o=>o.label)};
}
function repeatLastPoll(){
  if(!isHost()) return;
  const plan = repeatPollPlan(); if(!plan) return;
  pollDraft = {q: plan.q, opts: plan.opts.map(o=>o.label), custom:'', meta: {}, max: plan.max || ''};
  plan.opts.forEach(o=>{ if(o.d) pollDraft.meta[o.label] = {d:o.d, part:o.part}; });
  createPoll(true);
}
function pollPresetSlots(){
  const out = [], now = new Date();
  for(let d=0; d<5; d++){
    const dt = new Date(now.getFullYear(), now.getMonth(), now.getDate()+d);
    const day = dt.toLocaleDateString(undefined, {weekday:'short', day:'numeric', month:'short'});
    const rel = d===0 ? 'Today' : d===1 ? 'Tomorrow' : dt.toLocaleDateString(undefined, {weekday:'long'});
    ['Morning','Evening'].forEach(part=> out.push({label: slotLabel(dt, part), short: rel + ' ' + part.toLowerCase(), d: isoDay(dt), part}));
  }
  return out;
}
function openPollForm(){
  if(!isHost()) return;
  const lp = SQUAD.lastPoll;
  pollDraft = {q: pollDefaultQ(), opts: [], custom: '', max: (lp && 'max' in lp) ? (lp.max||'') : (S.format||6)*2}; pollFormErr = ''; pollFormOpen = true; render();
}
function togglePollDraftOpt(label){
  const i = pollDraft.opts.indexOf(label);
  if(i>=0) pollDraft.opts.splice(i,1); else if(pollDraft.opts.length < 8) pollDraft.opts.push(label);
  pollFormErr = ''; render();
}
let POLL_PRESETS = [];
function togglePollPreset(i){ const x = POLL_PRESETS[i]; if(!x) return; pollDraft.meta = pollDraft.meta || {}; pollDraft.meta[x.label] = {d:x.d, part:x.part}; togglePollDraftOpt(x.label); }
function removePollDraftOpt(i){ pollDraft.opts.splice(i,1); render(); }
function addPollDraftCustom(){
  const l = (pollDraft.custom||'').trim().slice(0,60);
  if(!l) return;
  if(!pollDraft.opts.includes(l) && pollDraft.opts.length < 8) pollDraft.opts.push(l);
  pollDraft.custom = ''; pollFormErr = ''; render();
}
// Every answer gets its own link: one tap opens the app and saves that answer.
function pollShareText(poll){
  const lines = [SPORT.icon + ' *' + poll.q + '*'];
  if(poll.opts.length > 1){
    lines.push('Tap every time that works for you:', '');
    poll.opts.forEach(o=>{ lines.push('🕒 *' + o.label + '*', pollLinkFor(poll, o.id), ''); });
    lines.push('❌ *No, can’t make it*', pollLinkFor(poll, 'no'));
  }else{
    lines.push('🗓 ' + poll.opts[0].label, '');
    lines.push('✅ *Yes, I’m in*', pollLinkFor(poll, poll.opts[0].id), '');
    lines.push('❌ *No*', pollLinkFor(poll, 'no'));
  }
  lines.push('', 'See who’s coming:', pollLinkFor(poll));
  return lines.join('\n');
}
function createPoll(share){
  if(!isHost()) return;
  if(!pollDraft.opts.length){ pollFormErr = 'Pick or type at least one time.'; render(); return; }
  const poll = {
    id: 'p' + Date.now().toString(36),
    q: (pollDraft.q||'').trim().slice(0,80) || pollDefaultQ(),
    opts: pollDraft.opts.map((label,i)=>Object.assign({id:'o'+(i+1), label}, ((pollDraft.meta||{})[label]) || {})),
    status: 'open', decided: null, createdAt: new Date().toISOString(), decidedAt: null,
    max: Number(pollDraft.max) > 0 ? Math.min(99, Math.round(Number(pollDraft.max))) : null
  };
  const patch = {poll};
  // only one time: nothing to pick, so it's confirmed straight away and every
  // Yes ticks that player in for the match (every No ticks them out)
  if(poll.opts.length===1){
    poll.status = 'decided'; poll.decided = poll.opts[0].id; poll.decidedAt = poll.createdAt;
    if(S.phase==='setup' || S.phase==='complete'){ patch.selectedIds = []; patch.rsvpLog = []; }
  }
  const old = S.poll;
  saveState(patch);
  // remember it, so next week is one tap
  saveSquadDoc(Object.assign({}, SQUAD, {lastPoll: {max: poll.max, q: poll.q, opts: poll.opts.map(o=> o.d ? {label:o.label, d:o.d, part:o.part} : {label:o.label})}}));
  // tidy away the previous poll's answers
  if(old && db) POLLVOTES.filter(v=>v.pollId===old.id).forEach(v=>db.doc(squadPath('pollVotes/'+v.id)).delete().catch(()=>{}));
  if(old && !db){ POLLVOTES = POLLVOTES.filter(v=>v.pollId!==old.id); }
  pollFormOpen = false; pollRegister = false; pollEndArm = false;
  if(share) openWhatsApp(pollShareText(poll));
  render();
}
/* ---- waitlist ----
   A poll can have a number of spots (poll.max). Once a time is confirmed, the first
   people to say yes fill the spots; anyone after that waits in the order they said yes,
   and moves in automatically when someone drops out. The order of S.selectedIds is the
   order people got in; the waitlist is everyone who said yes to the confirmed time but
   isn't in. Whoever's phone records a drop-out also moves the next person in (friends
   may already change selectedIds), and the host's phone tidies up anything missed. */
function pollMax(p){ p = p || S.poll; return (p && Number(p.max) > 0) ? Number(p.max) : 0; }
function pollWaitActive(){ const p = S.poll; return !!(p && p.status==='decided' && pollMax(p) && (S.phase==='setup' || S.phase==='complete')); }
function pollYesOrder(optId, exclude){
  return Object.values(pollVotesMap()).filter(v=>!v.no && (v.slots||[]).includes(optId) && v.playerId!==exclude)
    .sort((a,b)=> String(a.at||'').localeCompare(String(b.at||''))).map(v=>v.playerId);
}
function pollWaitlist(sel, exclude){
  const p = S.poll; if(!p || p.status!=='decided' || !pollMax(p)) return [];
  const inSet = new Set(sel || S.selectedIds || []);
  // A "Yes" older than that person's latest drop-out is stale: their "No" just hasn't
  // reached this phone yet (answers and the player list arrive separately).
  const lastOut = {}; (S.rsvpLog||[]).forEach(e=>{ if(e.a==='out') lastOut[e.id] = e.t; else if(e.a==='in') delete lastOut[e.id]; });
  const m = pollVotesMap();
  return pollYesOrder(p.decided, exclude).filter(id=>!inSet.has(id) && findPlayer(id) && !(lastOut[id] && String((m[id]||{}).at||'') <= String(lastOut[id])));
}
function waitPos(id){ const i = pollWaitlist().indexOf(id); return i<0 ? 0 : i+1; }
// move people up from the waitlist while there's room; returns the new list + log entries
function pollFillSpots(sel, exclude){
  const max = pollMax(); const out = sel.slice(), log = [], t = new Date().toISOString();
  if(!max) return {sel: out, log};
  const wl = pollWaitlist(out, exclude);
  while(out.length < max && wl.length){ const id = wl.shift(); out.push(id); log.push({id, a:'in', t, by:'waitlist'}); }
  return {sel: out, log};
}
let pollReconcileTimer = null;
function schedulePollReconcile(){
  if(!isHost() || !pollWaitActive() || pollReconcileTimer) return;
  const sel = S.selectedIds||[];
  if(sel.length >= pollMax() || !pollWaitlist().length) return;
  pollReconcileTimer = setTimeout(()=>{
    pollReconcileTimer = null;
    if(!isHost() || !pollWaitActive()) return;
    const cur = S.selectedIds||[];
    const f = pollFillSpots(cur);
    if(f.log.length) saveState({selectedIds: f.sel, rsvpLog: (S.rsvpLog||[]).concat(f.log).slice(-300)});
  }, 900);
}
function setPollMax(n){
  if(!isHost() || !S.poll) return;
  const max = n>0 ? Math.min(99, Math.round(n)) : null;
  saveState({poll: Object.assign({}, S.poll, {max})});
  saveSquadDoc(Object.assign({}, SQUAD, {lastPoll: Object.assign({}, SQUAD.lastPoll||{}, {max})}));
}
function castPollVote(playerId, slots, no, force){
  const p = S.poll;
  if(!p || !playerId || !findPlayer(playerId)) return;
  if(!isHost() && playerId !== getMyPlayerId()) return;   // friends answer only for themselves
  const vid = p.id + '__' + playerId;
  if(playerId === getMyPlayerId()) pollSeenMarked.add(p.id);   // an answer means seen; never overwrite it with a "seen" mark
  const now = new Date().toISOString();
  const doc = {pollId: p.id, playerId, slots: (slots||[]).filter(x=>p.opts.some(o=>o.id===x)), no: !!no, at: now};
  // still saying yes to something you'd already said yes to: you keep your place in the queue
  const prevV = pollVotesMap()[playerId];
  if(!doc.no && prevV && !prevV.no && prevV.at && (prevV.slots||[]).some(x=>doc.slots.includes(x))) doc.at = prevV.at;
  if(db){
    db.doc(squadPath('pollVotes/' + vid)).set(doc).catch(()=>{});
  }else{
    POLLVOTES = POLLVOTES.filter(v=>v.id!==vid).concat([Object.assign({id: vid}, doc)]);
    localCommit();
  }
  // once a time is confirmed, changing your answer ticks you in or out of the match
  if(p.status==='decided' && (S.phase==='setup' || S.phase==='complete')){
    const nowIn = !doc.no && doc.slots.includes(p.decided);
    const sel = S.selectedIds||[], isSel = sel.includes(playerId);
    const by = playerId===getMyPlayerId() ? 'self' : 'host', max = pollMax(p);
    if(nowIn && !isSel){
      // full: they wait their turn (the host can still squeeze someone in)
      if(!max || force || sel.length < max){
        const log = (S.rsvpLog||[]).concat([{id: playerId, a:'in', t: now, by}]).slice(-300);
        saveState({selectedIds: sel.concat([playerId]), rsvpLog: log});
      }
    }else if(!nowIn && isSel){
      const f = pollFillSpots(sel.filter(x=>x!==playerId), playerId);
      const log = (S.rsvpLog||[]).concat([{id: playerId, a:'out', t: now, by}], f.log).slice(-300);
      saveState({selectedIds: f.sel, rsvpLog: log});
    }
  }
  render();
}
function togglePollSlot(optId, pid){
  const id = pid || getMyPlayerId(); if(!id) return;
  const v = pollVotesMap()[id];
  let slots = (v && !v.no) ? (v.slots||[]).slice() : [];
  slots = slots.includes(optId) ? slots.filter(x=>x!==optId) : slots.concat([optId]);
  castPollVote(id, slots, false);
}
function pollSayNo(pid){
  const id = pid || getMyPlayerId(); if(!id) return;
  const v = pollVotesMap()[id];
  castPollVote(id, [], !(v && v.no));   // tapping again clears it
}
// "No": for a confirmed poll that means not coming to the confirmed time
function pollAnswerNo(pid){
  const id = pid || getMyPlayerId(); if(!id) return;
  castPollVote(id, [], true);
}
// for a single time (or the confirmed one): in / can't make it
function pollAnswerOne(optId, yes, pid){
  const id = pid || getMyPlayerId(); if(!id) return;
  const v = pollVotesMap()[id];
  let slots = (v && !v.no) ? (v.slots||[]).filter(x=>x!==optId) : [];
  if(yes) slots.push(optId);
  castPollVote(id, slots, !yes && !slots.length);
}
function decidePoll(optId){
  if(!isHost() || !S.poll) return;
  const m = pollVotesMap(), t = new Date().toISOString();
  const all = pollYesOrder(optId).filter(id=>findPlayer(id)), max = pollMax();
  const ins = max ? all.slice(0, max) : all;
  const patch = {poll: Object.assign({}, S.poll, {status:'decided', decided: optId, decidedAt: t})};
  if(S.phase==='setup' || S.phase==='complete'){
    patch.selectedIds = ins;
    patch.rsvpLog = ins.map(id=>({id, a:'in', t, by:'poll'}));
  }
  saveState(patch);
}
function reopenPoll(){ if(isHost() && S.poll) saveState({poll: Object.assign({}, S.poll, {status:'open', decided:null, decidedAt:null})}); }
function endPoll(){
  if(!isHost()) return;
  if(!pollEndArm){ pollEndArm = true; render(); return; }
  pollEndArm = false; pollRegister = false; saveState({poll:null});
}
function pollNamesFor(optId){
  const m = pollVotesMap();
  return Object.values(m).filter(v=>!v.no && (v.slots||[]).includes(optId)).map(v=>v.playerId);
}
function sharePollNudge(){
  const p = S.poll; if(!p) return;
  const names = pollNoReply().map(x=>x.name);
  if(!names.length) return;
  openWhatsApp('⏰ Still waiting on: ' + names.join(', ') + '\n\n' + pollShareText(p));
}
function sharePollConfirm(){
  const p = S.poll; if(!p || p.status!=='decided') return;
  const o = p.opts.find(x=>x.id===p.decided);
  const wlIds = pollWaitlist();
  const ins = pollNamesFor(p.decided).filter(id=>!wlIds.includes(id)).map(playerName);
  const m = pollVotesMap();
  const outs = pollEligible().filter(x=>pollAnswered(m[x.id]) && !(m[x.id].slots||[]).includes(p.decided)).map(x=>x.name);
  const quiet = pollNoReply().map(x=>x.name);
  const lines = ['✅ *Confirmed: ' + (o ? o.label : '') + '*', '', '*In (' + ins.length + (pollMax(p) ? '/' + pollMax(p) : '') + '):* ' + (ins.join(', ') || '–')];
  if(wlIds.length) lines.push('*⏳ Waitlist:* ' + wlIds.map((id,i)=>(i+1) + '. ' + playerName(id)).join(', ') + ' (you move in automatically if someone drops out)');
  if(outs.length) lines.push('*Can’t make it:* ' + outs.join(', '));
  const seenNames = new Set(pollSeenOnly().map(x=>x.name));
  const seenQ = quiet.filter(n=>seenNames.has(n)), unopenedQ = quiet.filter(n=>!seenNames.has(n));
  if(seenQ.length) lines.push('*Seen, no answer:* ' + seenQ.join(', '));
  if(unopenedQ.length) lines.push('*Not opened:* ' + unopenedQ.join(', '));
  lines.push('', 'Plans changed? Can’t make it any more:', pollLinkFor(p, 'no'), '', 'Now in:', pollLinkFor(p, p.decided));
  openWhatsApp(lines.join('\n'));
}
function renderPollCard(){
  const p = S.poll;
  if(!pollVisible()){
    return (isHost() && (S.phase==='setup' || S.phase==='complete')) ? `<div class="poll-cta">
      <button class="btn btn-primary" onclick="openPollForm()">📊 Ask who’s in</button>
      ${repeatPollPlan() ? `<button class="btn" onclick="repeatLastPoll()">🔁 Same as last week</button><span>${esc(repeatPollPlan().opts.map(o=>o.label).join(' / '))}</span>` : `<span>Make a poll, send it to the WhatsApp group, and answers come back here.</span>`}</div>` : '';
  }
  const m = pollVotesMap(), me = getMyPlayerId(), mine = me ? m[me] : null;
  const elig = pollEligible();
  const replied = elig.filter(x=>pollAnswered(m[x.id])).length;
  const max = pollMax(p), need = max || (S.format||6) * 2;
  const decided = p.status==='decided';
  const wl = decided ? pollWaitlist() : [], myWait = me ? wl.indexOf(me) + 1 : 0;
  const single = decided ? p.opts.find(o=>o.id===p.decided) : (p.opts.length===1 ? p.opts[0] : null);
  const optRow = (o)=>{
    let ids = pollNamesFor(o.id);
    if(decided && max) ids = ids.filter(id=>!wl.includes(id));
    const n = ids.length, over = (!decided && max && n > max) ? n - max : 0;
    const isMine = !!(mine && !mine.no && (mine.slots||[]).includes(o.id));
    const pct = Math.min(100, Math.round(100*n/Math.max(need,1)));
    const act = !me ? '' : (single ? `pollAnswerOne('${o.id}', true)` : `togglePollSlot('${o.id}')`);
    return `<div class="poll-opt yes-opt ${isMine?'mine':''} ${me?'tap':''}" ${act?`onclick="${act}" role="button" tabindex="0"`:''}>
      ${me ? `<span class="poll-tick">${isMine?'✓':''}</span>` : ''}
      <div class="poll-opt-main">
        <div class="poll-opt-label">${single ? '✅ Yes' + (decided ? ', I’m in' : '') : esc(o.label)}</div>
        <div class="poll-bar"><i style="width:${pct}%"></i></div>
        <div class="poll-names">${n ? ids.map(id=>esc(playerName(id))).join(', ') : 'Nobody yet'}</div>
        ${over ? `<div class="poll-names" style="color:var(--amber-ink, var(--chalk-dim));">${over} more than the ${max} spots: they’d go on the waitlist</div>` : ''}
      </div>
      <div class="poll-count">${n}<small>of ${need}</small></div>
      ${(isHost() && !decided) ? `<button class="btn btn-sm" style="flex:none;" onclick="event.stopPropagation(); decidePoll('${o.id}')">Pick</button>` : ''}
    </div>`;
  };
  const noIds = elig.filter(x=>{ const v = m[x.id]; if(!pollAnswered(v)) return false; return decided ? !(v.slots||[]).includes(p.decided) : !!v.no; }).map(x=>x.id);
  const waitRow = wl.length ? `<div class="poll-opt wait-opt ${myWait?'mine':''}">
      ${me ? `<span class="poll-tick" style="${myWait ? 'border-color:transparent;' : 'visibility:hidden;'}">${myWait?'⏳':''}</span>` : ''}
      <div class="poll-opt-main">
        <div class="poll-opt-label">⏳ Waitlist</div>
        <div class="poll-names">${wl.map((id,i)=>(i+1) + '. ' + esc(playerName(id))).join(' · ')}</div>
      </div>
      <div class="poll-count">${wl.length}</div>
    </div>` : '';
  const myNo = !!(me && noIds.includes(me));
  const noRow = `<div class="poll-opt no-opt ${myNo?'mine':''} ${me?'tap':''}" ${me?`onclick="pollAnswerNo()" role="button" tabindex="0"`:''}>
      ${me ? `<span class="poll-tick">${myNo?'✓':''}</span>` : ''}
      <div class="poll-opt-main">
        <div class="poll-opt-label">❌ ${single ? 'No' : 'No, can’t make it'}</div>
        <div class="poll-names">${noIds.length ? noIds.map(id=>esc(playerName(id))).join(', ') : 'Nobody yet'}</div>
      </div>
      <div class="poll-count">${noIds.length}</div>
    </div>`;
  const noReply = pollNoReply();
  const won = decided ? p.opts.find(o=>o.id===p.decided) : null;
  const register = (isHost() && pollRegister) ? `
    <table class="poll-reg">
      <tr><th>Player</th>${p.opts.map((o,i)=>`<th title="${escAttr(o.label)}">${p.opts.length>1 ? (i+1) : 'In'}</th>`).join('')}<th>No</th></tr>
      ${elig.map(x=>{ const v = m[x.id]; return `<tr><td>${esc(x.name)}</td>${p.opts.map(o=>{ const on = v && !v.no && (v.slots||[]).includes(o.id); return `<td><button class="${on?'y':''}" onclick="togglePollSlot('${o.id}','${x.id}')">${on?'✓':'·'}</button></td>`; }).join('')}<td><button class="${v && v.no?'n':''}" onclick="pollSayNo('${x.id}')">${v && v.no?'✗':'·'}</button></td></tr>`; }).join('')}
    </table>
    ${p.opts.length>1 ? `<div class="poll-list">${p.opts.map((o,i)=>`${i+1} = ${esc(o.label)}`).join(' · ')}</div>` : ''}` : '';
  return `
  <div class="panel poll-card" id="pollCard">
    <div class="poll-head">
      <div class="poll-q">📊 ${esc(p.q)}</div>
      <div class="poll-meta">${replied} of ${elig.length} replied${pollSeenOnly().length ? '<br>' + pollSeenOnly().length + ' seen' : ''}</div>
    </div>
    ${won ? `<div class="poll-won">✅ Confirmed: ${esc(won.label)}<small>${max ? (S.selectedIds||[]).length + ' of ' + max + ' spots filled' + (wl.length ? ' · ' + wl.length + ' on the waitlist' : '') : pollNamesFor(won.id).length + ' in · ' + need + ' needed for ' + S.format + 'v' + S.format}</small></div>`
          : (p.opts.length>1 ? `<div class="panel-sub" style="margin:4px 0 0;">Tick every time that works for you, or No.</div>` : `<div class="poll-when">🗓 ${esc(p.opts[0].label)}</div>`)}
    ${(decided ? [won] : p.opts).filter(Boolean).map(optRow).join('')}
    ${waitRow}
    ${myWait ? `<div class="banner amber" style="margin:8px 0 0;">⏳ You’re <b>#${myWait}</b> on the waitlist. If someone drops out, you’re moved in automatically.</div>` : ''}
    ${noRow}
    ${!me && !isHost() ? `<div class="panel-sub" style="margin-top:8px;">Log in with your name to answer.</div>` : ''}
    ${(()=>{
      if(!noReply.length) return `<div class="poll-list"><b>Everyone has answered 🎉</b></div>`;
      const seen = pollSeenOnly(), seenIds = new Set(seen.map(x=>x.id));
      const unopened = noReply.filter(x=>!seenIds.has(x.id));
      return (seen.length ? `<div class="poll-list"><b>👀 Seen, not answered (${seen.length}):</b> ${seen.map(x=>esc(x.name)).join(', ')}</div>` : '')
           + (unopened.length ? `<div class="poll-list"><b>Not opened yet (${unopened.length}):</b> ${unopened.map(x=>esc(x.name)).join(', ')}</div>` : '');
    })()}
    ${decided && (S.phase==='setup' || S.phase==='complete') ? `<div class="poll-list">Everyone who’s in has been ticked in for the match. Changing an answer here ticks them in or out.</div>` : ''}
    ${register}
    ${isHost() ? `<div class="poll-actions">
      <button class="btn btn-sm btn-primary" onclick="openWhatsApp(pollShareText(S.poll))">💬 Share poll</button>
      ${decided ? `<button class="btn btn-sm" onclick="sharePollConfirm()">✅ Send final list</button>` : ''}
      <span class="poll-spots">Spots <button class="btn btn-sm btn-ghost" onclick="setPollMax(${max ? max-1 : need-1})" ${max===1?'disabled':''}>−</button><b>${max || 'no limit'}</b><button class="btn btn-sm btn-ghost" onclick="setPollMax(${max ? max+1 : need})">＋</button>${max ? `<button class="btn btn-sm btn-ghost" onclick="setPollMax(0)">No limit</button>` : ''}</span>
      ${noReply.length ? `<button class="btn btn-sm" onclick="sharePollNudge()">⏰ Nudge ${noReply.length}</button>` : ''}
      <button class="btn btn-sm" onclick="pollRegister=!pollRegister; render();">${pollRegister ? 'Done' : '✏️ Answer for someone'}</button>
      ${decided && p.opts.length>1 ? `<button class="btn btn-sm btn-ghost" onclick="reopenPoll()">↩ Reopen</button>` : ''}
      <button class="btn btn-sm btn-ghost" onclick="openPollForm()">＋ New poll</button>
      <button class="btn btn-sm ${pollEndArm?'btn-danger':'btn-ghost'}" onclick="endPoll()">${pollEndArm ? 'Tap again to remove' : '🗑 Remove'}</button>
    </div>
    ${!decided ? `<div class="poll-list">When you’re ready, tap <b>Pick</b> on a time to confirm it. ${max ? 'The first ' + max + ' who said yes get ticked in; the rest go on the waitlist.' : 'Everyone who said yes gets ticked in.'}</div>` : ''}` : ''}
  </div>`;
}
function renderPollForm(){
  if(!pollFormOpen) return '';
  if(!isHost()){ pollFormOpen = false; return ''; }
  const presets = POLL_PRESETS = pollPresetSlots();
  return `
  <div class="modal-backdrop" onclick="if(event.target===this){ pollFormOpen=false; render(); }">
    <div class="modal">
      <div class="row" style="justify-content:space-between; margin-bottom:8px;">
        <div class="panel-title" style="margin:0;">📊 New poll</div>
        <button class="icon-btn" onclick="pollFormOpen=false; render();">✕</button>
      </div>
      <div class="edit-label">Question</div>
      <input type="text" class="field-input" style="width:100%;" id="pollQInput" maxlength="80" value="${escAttr(pollDraft.q)}" oninput="pollDraft.q=this.value">
      <div class="edit-label" style="margin-top:12px;">Times (one time = simple Yes/No that ticks people in as they answer)</div>
      <div class="poll-preset">${presets.map((x,i)=>`<button type="button" class="chip-toggle ${pollDraft.opts.includes(x.label)?'active':''}" title="${escAttr(x.label)}" onclick="togglePollPreset(${i})">${esc(x.short)}</button>`).join('')}</div>
      <div class="row" style="gap:8px;">
        <input type="text" class="field-input grow" style="min-width:0;" id="pollCustomInput" maxlength="60" placeholder="Or type one, e.g. Sat 7am at the turf" value="${escAttr(pollDraft.custom)}" oninput="pollDraft.custom=this.value" onkeydown="if(event.key==='Enter') addPollDraftCustom();">
        <button class="btn" style="flex:none;" onclick="addPollDraftCustom()">Add</button>
      </div>
      ${pollDraft.opts.length ? `<div class="poll-list" style="margin-top:12px;"><b>Options:</b></div>
        ${pollDraft.opts.map((l,i)=>`<div class="row" style="justify-content:space-between; padding:6px 0; border-bottom:1px solid var(--line);"><span>${esc(l)}</span><button class="icon-btn" onclick="removePollDraftOpt(${i})">✕</button></div>`).join('')}` : ''}
      <div class="edit-label" style="margin-top:12px;">Spots</div>
      <div class="row" style="gap:8px; align-items:center;">
        <input type="number" class="field-input" style="width:90px;" id="pollMaxInput" min="1" max="99" inputmode="numeric" placeholder="No limit" value="${escAttr(pollDraft.max)}" oninput="pollDraft.max=this.value">
        <span class="panel-sub" style="margin:0;">Once a time is picked, the first ${Number(pollDraft.max)>0 ? Number(pollDraft.max) : 'N'} to say yes are in. Anyone after that goes on a waitlist and moves in automatically if someone drops out. Leave empty for no limit.</span>
      </div>
      ${pollFormErr ? `<div class="login-err">${esc(pollFormErr)}</div>` : ''}
      ${S.poll && pollVisible() ? `<div class="panel-sub" style="margin:10px 0 0;">This replaces the current poll and its answers.</div>` : ''}
      <div class="footer-actions" style="margin-top:14px; justify-content:flex-start;">
        <button class="btn btn-primary" onclick="createPoll(true)">💬 Create &amp; send to WhatsApp</button>
        <button class="btn btn-ghost" onclick="createPoll(false)">Create only</button>
      </div>
    </div>
  </div>`;
}

