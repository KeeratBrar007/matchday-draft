/* ============================= Head-to-head & rivalries ============================= */
function h2hRecord(x, y, sinceIso){
  const out = {games:0, xw:0, yw:0, d:0};
  const since = sinceIso ? new Date(sinceIso).getTime() : 0;
  HISTORY.forEach(h=>{
    if(since && new Date(h.date).getTime() < since) return;
    if(!h.winner) return;
    const A = h.teamAIds||[], B = h.teamBIds||[];
    const xA = A.includes(x), xB = B.includes(x), yA = A.includes(y), yB = B.includes(y);
    if(!((xA && yB) || (xB && yA))) return;
    out.games++;
    if(h.winner==='draw') out.d++;
    else if((h.winner==='a') === xA) out.xw++;
    else out.yw++;
  });
  return out;
}
function h2hList(id){
  const rows = [];
  allPlayersArr().forEach(o=>{
    if(o.id===id || isGuest(o.id)) return;
    const r = h2hRecord(id, o.id);
    if(r.games>0) rows.push(Object.assign({id:o.id}, r));
  });
  rows.sort((a,b)=> b.games-a.games || playerName(a.id).localeCompare(playerName(b.id)));
  return rows;
}
function rivalKey(x, y){ return [x,y].sort().join('__'); }
function rivalryBetween(x, y){ return RIVALS.find(r=>r.id===rivalKey(x,y)); }
function incomingRequests(id){ return db && id ? RIVALS.filter(r=>r.status==='pending' && r.b===id) : []; }
function outgoingRequests(id){ return db && id ? RIVALS.filter(r=>r.status==='pending' && r.a===id) : []; }
function activeRivalries(id){ return RIVALS.filter(r=>r.status==='active' && (!id || r.a===id || r.b===id)); }
function rivalCooldown(r){
  return !!(r && r.status==='declined' && r.endedAt && Date.now() - new Date(r.endedAt).getTime() < 24*36e5);
}
function sendRivalry(targetId){
  const me = getMyPlayerId();
  if(!db || !me || me===targetId || !findPlayer(targetId)) return;
  const ex = rivalryBetween(me, targetId);
  if(ex && (ex.status==='pending' || ex.status==='active' || rivalCooldown(ex))) return;
  db.doc(squadPath('rivalries/' + rivalKey(me, targetId))).set({a:me, b:targetId, status:'pending', createdAt:new Date().toISOString()}).catch(()=>{});
}
function sendRivalryFromSelect(){
  const el = document.getElementById('rivalPick');
  if(el && el.value) sendRivalry(el.value);
}
function respondRivalry(id, accept){
  const r = RIVALS.find(x=>x.id===id);
  const me = getMyPlayerId();
  if(!db || !r || r.status!=='pending' || (r.b!==me && !isHost())) return;
  const now = new Date().toISOString();
  db.doc(squadPath('rivalries/' + id)).update(accept ? {status:'active', startedAt:now} : {status:'declined', endedAt:now}).catch(()=>{});
}
function withdrawRivalry(id){
  const r = RIVALS.find(x=>x.id===id);
  const me = getMyPlayerId();
  if(!db || !r || r.status!=='pending' || (r.a!==me && !isHost())) return;
  db.doc(squadPath('rivalries/' + id)).delete().catch(()=>{});
}
function endRivalry(id){
  const r = RIVALS.find(x=>x.id===id);
  const me = getMyPlayerId();
  if(!db || !r || r.status!=='active' || (r.a!==me && r.b!==me && !isHost())) return;
  if(rivalArm !== id){
    rivalArm = id; render();
    setTimeout(()=>{ if(rivalArm===id){ rivalArm = null; render(); } }, 4000);
    return;
  }
  rivalArm = null;
  db.doc(squadPath('rivalries/' + id)).update({status:'ended', endedAt:new Date().toISOString()}).catch(()=>{});
}
function rivalCardHtml(r){
  const rec = h2hRecord(r.a, r.b, r.startedAt), all = h2hRecord(r.a, r.b);
  const me = getMyPlayerId();
  const since = r.startedAt ? new Date(r.startedAt).toLocaleDateString(undefined,{day:'numeric',month:'short'}) : '';
  const canEnd = isHost() || me===r.a || me===r.b;
  return `<div class="riv-card">
    <div class="riv-score"><span>${nameLink(r.a)}</span><span class="sc">${rec.xw} – ${rec.yw}</span><span style="text-align:right;">${nameLink(r.b)}</span></div>
    <div class="panel-sub">Since ${esc(since)} · ${rec.games} meeting${rec.games===1?'':'s'}${rec.d ? ' · '+rec.d+' draw'+(rec.d===1?'':'s') : ''} · all-time ${all.xw}–${all.yw}${all.d ? ' ('+all.d+' drawn)' : ''}</div>
    ${canEnd ? `<button class="btn btn-sm btn-ghost" onclick="endRivalry('${r.id}')">${rivalArm===r.id ? 'Tap again to end it' : 'End rivalry'}</button>` : ''}
  </div>`;
}
function renderRivalsBoard(){
  const act = activeRivalries().map(r=>({r, n:h2hRecord(r.a,r.b,r.startedAt).games})).sort((x,y)=>y.n-x.n).map(x=>x.r);
  return `<div class="panel-sub">Friendly feuds. A rivalry only counts matches played after both sides agreed to it.</div>
  ${act.length ? act.map(rivalCardHtml).join('') : `<div class="empty-note">No rivalries yet. Open your own profile and tap <b>Rivals</b> to challenge someone.</div>`}`;
}
function renderRivalBanner(){
  const me = getMyPlayerId();
  if(!db || !me) return '';
  return incomingRequests(me).map(r=>`<div class="banner amber" style="display:flex; align-items:center; justify-content:space-between; gap:10px; flex-wrap:wrap;">
    <span>⚔️ <b>${esc(playerName(r.a))}</b> challenged you to a rivalry.</span>
    <span class="row-controls"><button class="btn btn-sm btn-primary" onclick="respondRivalry('${r.id}',true)">Accept</button><button class="btn btn-sm btn-ghost" onclick="respondRivalry('${r.id}',false)">Decline</button></span>
  </div>`).join('');
}
function profileTabsHtml(p, isMe){
  const n = isMe ? incomingRequests(p.id).length : 0;
  return `<div class="scope-tabs">
    <button class="toggle-btn ${profileTab==='stats'?'active':''}" onclick="setProfileTab('stats')">Stats</button>
    <button class="toggle-btn ${profileTab==='rivals'?'active':''}" onclick="setProfileTab('rivals')">⚔️ Rivals${n ? ' ('+n+')' : ''}</button>
  </div>`;
}
function setProfileTab(t){ profileTab = t; render(); }
function rivalsTabHtml(p, isMe){
  const me = getMyPlayerId();
  const rows = h2hList(p.id);
  let html = '';
  if(db){
    if(isMe){
      incomingRequests(p.id).forEach(r=>{
        html += `<div class="riv-card"><div class="panel-sub" style="margin:0 0 8px;">⚔️ <b>${esc(playerName(r.a))}</b> wants a rivalry with you.</div>
          <span class="row-controls"><button class="btn btn-sm btn-primary" onclick="respondRivalry('${r.id}',true)">Accept</button><button class="btn btn-sm btn-ghost" onclick="respondRivalry('${r.id}',false)">Decline</button></span></div>`;
      });
      outgoingRequests(p.id).forEach(r=>{
        html += `<div class="riv-card"><div class="panel-sub" style="margin:0 0 8px;">Waiting for <b>${esc(playerName(r.b))}</b> to accept…</div>
          <button class="btn btn-sm btn-ghost" onclick="withdrawRivalry('${r.id}')">Withdraw request</button></div>`;
      });
    }
    const act = activeRivalries(p.id);
    html += `<div class="pf-section">Rivalries</div>`;
    html += act.length ? act.map(rivalCardHtml).join('') : `<div class="empty-note">No active rivalries${isMe ? ' — challenge someone below.' : '.'}</div>`;
    if(isMe){
      const nem = rows.filter(r=> r.yw - r.xw >= 2 && r.games >= 3 && !rivalryBetween(p.id, r.id)).slice(0,2);
      nem.forEach(r=>{
        html += `<div class="nemesis"><span>😤 <b>${esc(playerName(r.id))}</b> keeps beating you (${r.xw}–${r.yw}).</span><button class="btn btn-sm" onclick="sendRivalry('${r.id}')">Start a rivalry</button></div>`;
      });
      const cands = allPlayersArr().filter(o=>!isGuest(o.id) && o.id!==p.id && !(rivalryBetween(p.id,o.id) && ['pending','active'].includes(rivalryBetween(p.id,o.id).status)) && !rivalCooldown(rivalryBetween(p.id,o.id)));
      if(cands.length){
        html += `<div class="pf-section">Challenge someone</div>
        <div class="login-row"><select id="rivalPick" class="field-input grow" style="min-width:0;">${cands.map(o=>`<option value="${o.id}">${esc(o.name)}</option>`).join('')}</select>
        <button class="btn btn-primary" style="flex:none; white-space:nowrap;" onclick="sendRivalryFromSelect()">⚔️ Send</button></div>
        <div class="panel-sub" style="margin-top:6px;">They have to accept before it starts.</div>`;
      }
    }else if(me && me!==p.id){
      const ex = rivalryBetween(me, p.id);
      if(!ex || ex.status==='declined' || ex.status==='ended'){
        html += rivalCooldown(ex)
          ? `<div class="panel-sub" style="margin-top:8px;">${esc(p.name)} declined a recent request — try again tomorrow.</div>`
          : `<div style="margin-top:8px;"><button class="btn btn-sm" onclick="sendRivalry('${p.id}')">⚔️ Challenge ${esc(p.name)} to a rivalry</button></div>`;
      }else if(ex.status==='pending'){
        html += ex.a===me
          ? `<div class="panel-sub" style="margin-top:8px;">Request sent — waiting for ${esc(p.name)}. <button class="btn btn-sm btn-ghost" onclick="withdrawRivalry('${ex.id}')">Withdraw</button></div>`
          : `<div style="margin-top:8px;" class="row-controls"><button class="btn btn-sm btn-primary" onclick="respondRivalry('${ex.id}',true)">Accept ${esc(p.name)}'s challenge</button><button class="btn btn-sm btn-ghost" onclick="respondRivalry('${ex.id}',false)">Decline</button></div>`;
      }
    }
  }
  html += `<div class="pf-section">Head-to-head ${isMe ? '(you vs everyone)' : 'for ' + esc(p.name)}</div>`;
  html += rows.length ? rows.map(r=>`
    <div class="h2h-row">
      <div>${nameLink(r.id)}<small>${r.games} meeting${r.games===1?'':'s'} on opposite teams</small></div>
      <div class="h2h-rec" style="color:${r.xw>r.yw?'var(--good)':r.xw<r.yw?'var(--danger)':'var(--chalk-dim)'};">${r.xw}–${r.d}–${r.yw}</div>
    </div>`).join('') + `<div class="panel-sub" style="margin-top:6px;">Wins–draws–losses against each player, from ${isMe ? 'your' : esc(p.name)+'\\u2019s'} side.</div>`
    : `<div class="empty-note">No matches against other players recorded yet.</div>`;
  return html;
}

