/* ============================= Attendance (host) ============================= */
function toggleAttendance(){ showAttendance = !showAttendance; render(); }
function attPlayed(h, id){ return (h.teamAIds||[]).includes(id) || (h.teamBIds||[]).includes(id) || (h.subIds||[]).includes(id); }
function attInvolved(h, id){
  return attPlayed(h,id) || !!(h.att && ((h.att.expected||[]).includes(id) || (h.att.dropped||[]).some(d=>d.id===id)));
}
function computeAttendance(){
  const win = HISTORY.slice(0, ATT_WINDOW);
  return allPlayersArr().filter(p=>!isGuest(p.id)).map(p=>{
    let oldest = -1;
    win.forEach((h,i)=>{ if(attInvolved(h,p.id)) oldest = i; });
    const olderExists = HISTORY.slice(ATT_WINDOW).some(h=>attInvolved(h,p.id));
    const opp = olderExists ? win.length : (oldest>=0 ? oldest+1 : 0);
    const span = win.slice(0, opp);
    let played = 0, late = 0, streak = 0, last = null;
    span.forEach(h=>{
      if(attPlayed(h,p.id)){ played++; if(!last) last = h.date; }
      if(h.att && (h.att.dropped||[]).some(d=>d.id===p.id && d.late)) late++;
    });
    for(const h of span){ if(attPlayed(h,p.id)) streak++; else break; }
    const pct = opp ? Math.round(100*played/opp) : null;
    let status = 'ok';
    if(!opp) status = 'new';
    else if(late>=2 || (opp>=3 && pct<50)) status = 'bad';
    else if(late===1 || (opp>=3 && pct<80)) status = 'mid';
    return {id:p.id, name:p.name, unavailable:!!p.unavailable, opp, played, late, streak, pct, last, status};
  });
}
const ATT_LABEL = {ok:'🟢 Reliable', mid:'🟡 Patchy', bad:'🔴 Flaky', new:'⚪ New'};
function attendanceLineHtml(id){
  const r = computeAttendance().find(x=>x.id===id);
  if(!r || !r.opp) return '';
  return `<div class="pf-section">Your attendance</div>
    <div class="panel-sub" style="margin:0;">Played ${r.played} of the last ${r.opp} · ${r.late} late drop-out${r.late===1?'':'s'} · <span class="st-chip ${r.status}">${ATT_LABEL[r.status]}</span></div>`;
}
function renderAttendanceModal(){
  if(!showAttendance) return '';
  if(!isHost()){ showAttendance = false; return ''; }
  const rows = computeAttendance();
  const order = {bad:0, mid:1, ok:2, new:3};
  rows.sort((x,y)=> order[x.status]-order[y.status] || ((x.pct==null?101:x.pct)-(y.pct==null?101:y.pct)) || x.name.localeCompare(y.name));
  const dropsNow = liveDrops();
  const inNow = (S.selectedIds||[]).filter(id=>!isGuest(id) && findPlayer(id)).length;
  const ago = iso=>{ const m = Math.round((Date.now()-new Date(iso).getTime())/60000); return m<60 ? m+' min ago' : Math.round(m/60)+' h ago'; };
  return `
  <div class="modal-backdrop" onclick="if(event.target===this) toggleAttendance();">
    <div class="modal" style="max-width:560px;">
      <div class="row" style="justify-content:space-between; margin-bottom:4px;">
        <div class="panel-title" style="margin:0;">📋 Attendance</div>
        <button class="icon-btn" onclick="toggleAttendance()">✕</button>
      </div>
      <div class="panel-sub">Who turns up and who bails, over the last ${ATT_WINDOW} matches (counted from each player's first one). A <b>late drop-out</b> is someone who ticked in, then out again within ${LATE_HOURS} hours of you locking the squad.</div>
      <div class="host-detail" style="display:block; margin-bottom:10px;"><b>${inNow}</b> in for today${dropsNow.length ? ' · dropped out: ' + dropsNow.map(d=>esc(playerName(d.id))+(d.late?' (late':' (')+', '+ago(d.at)+')').join(', ') : ' · nobody has dropped out'}</div>
      ${HISTORY.length ? `
      <div class="att-row head"><span>Player</span><span class="num">Played</span><span class="num">Late</span><span>Status</span></div>
      ${rows.map(r=>`
      <div class="att-row" style="${r.unavailable?'opacity:.55;':''}">
        <span>${nameLink(r.id)}<small>${r.last ? 'Last played '+esc(new Date(r.last).toLocaleDateString(undefined,{day:'numeric',month:'short'}))+(r.streak>1?' · '+r.streak+' in a row':'') : 'No matches yet'}</small></span>
        <span class="num">${r.opp ? r.played+'/'+r.opp+'<small>'+r.pct+'%</small>' : '–'}</span>
        <span class="num" style="${r.late?'color:var(--danger);':''}">${r.late}</span>
        <span><span class="st-chip ${r.status}">${ATT_LABEL[r.status]}</span></span>
      </div>`).join('')}` : `<div class="empty-note">No matches recorded yet — attendance builds up as you save them.</div>`}
      <div class="panel-sub" style="margin-top:10px;">Reliable: 80%+ and no late drop-outs. Patchy: under 80%, or one late drop-out. Flaky: under 50%, or two or more late drop-outs.</div>
    </div>
  </div>`;
}

