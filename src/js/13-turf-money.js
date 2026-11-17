/* ============================= Turf money =============================
   Costs are attached to a saved match (h.fees), so anything unpaid carries
   over week to week until the host marks it paid. Each cost has a payer:
   "_c" is the collector (whoever the money goes to, usually the host);
   anything a player already paid for (e.g. water) counts towards their share.
   The host's UPI details live on the game's roster (SQUAD.pay), host-only. */
function feeOf(h){ return (h && h.fees && Array.isArray(h.fees.items)) ? h.fees : null; }
function feeTotal(f){ return (f.items||[]).reduce((n,i)=>n+(Number(i.amount)||0),0); }
function feeEach(f){ const n = (f.players||[]).length; return n ? Math.ceil(feeTotal(f)/n) : 0; }
function feeShareMap(f){
  const out = {}, incl = {}, coveredBy = {};
  (f.players||[]).forEach(id=>{ out[id] = f.split==='custom' ? Math.max(0, Number((f.custom||{})[id])||0) : feeEach(f); });
  if(f.guestsByHost){
    const go = f.guestOf || {};
    const regular = (f.players||[]).filter(x=>!go[x]);
    Object.keys(go).forEach(gid=>{
      if(!(gid in out) || !out[gid]) return;
      const of = go[gid] || [];
      const payers = of.includes('*') ? regular : of.filter(x=>regular.includes(x));
      if(!payers.length) return;
      const each = Math.ceil(out[gid] / payers.length);
      out[gid] = 0; coveredBy[gid] = payers;
      payers.forEach(x=>{ out[x] = (out[x]||0) + each; (incl[x] = incl[x] || []).push(gid); });
    });
  }
  return {out, incl, coveredBy};
}
function feeSpentMap(f){
  const out = {};
  (f.items||[]).forEach(i=>{ if(i.paidBy && i.paidBy!=='_c') out[i.paidBy] = (out[i.paidBy]||0) + (Number(i.amount)||0); });
  return out;
}
function feeLines(f){
  const sm = feeShareMap(f), sh = sm.out, sp = feeSpentMap(f), cid = f.collectorId || null;
  const ids = Array.from(new Set((f.players||[]).concat(Object.keys(sp))));
  return ids.map(id=>{
    const share = sh[id]||0, spent = sp[id]||0, isC = id===cid, net = share - spent;
    return {id, share, spent, collector:isC, owes: isC ? 0 : Math.max(0, net), back: isC ? 0 : Math.max(0, -net), paid: (f.paid||{})[id] || null,
            incl: sm.incl[id] || [], coveredBy: sm.coveredBy[id] || null};
  });
}
function outstandingFor(id){
  return HISTORY.filter(feeOf).map(h=>{
    const l = feeLines(h.fees).find(x=>x.id===id);
    return (l && l.owes>0 && !l.paid) ? {h, amount:l.owes, incl:l.incl} : null;
  }).filter(Boolean);
}
function allOutstanding(){
  const by = {};
  HISTORY.filter(feeOf).forEach(h=> feeLines(h.fees).forEach(l=>{
    if(l.owes>0 && !l.paid){ (by[l.id] = by[l.id] || {id:l.id, total:0, items:[]}); by[l.id].total += l.owes; by[l.id].items.push({h, amount:l.owes}); }
  }));
  return Object.values(by).sort((a,b)=>b.total-a.total || playerName(a.id).localeCompare(playerName(b.id)));
}
function payInfo(){ return SQUAD.pay || {}; }
function upiOk(v){ return /^[a-zA-Z0-9.\-_]{2,256}@[a-zA-Z][a-zA-Z0-9.\-]{1,64}$/.test(String(v||'').trim()); }
function upiLink(amount, note){
  const p = payInfo();
  if(!upiOk(p.upi)) return '';
  return 'upi://pay?pa=' + encodeURIComponent(p.upi.trim()).replace(/%40/g,'@') + '&pn=' + encodeURIComponent(p.name || 'Host')
    + (amount ? '&am=' + Number(amount).toFixed(2) : '') + '&cu=INR' + (note ? '&tn=' + encodeURIComponent(note) : '');
}
function qrSvg(text, px){
  try{
    const q = new MDQR.QRCode(-1, MDQR.ECL.M); q.addData(text); q.make();
    const n = q.getModuleCount(), qz = 4, size = n + qz*2;
    let d = '';
    for(let r=0; r<n; r++) for(let c=0; c<n; c++) if(q.isDark(r,c)) d += 'M' + (c+qz) + ' ' + (r+qz) + 'h1v1h-1z';
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" width="${px}" height="${px}" shape-rendering="crispEdges" role="img" aria-label="UPI QR code"><rect width="${size}" height="${size}" fill="#fff"/><path d="${d}" fill="#000"/></svg>`;
  }catch(e){ return ''; }
}
function payLink(){ return siteBase() + '?g=' + encodeURIComponent(currentSquadId||'') + '&pay=1'; }
function feeGuestNames(ids){ return (ids||[]).map(playerName).sort((a,b)=>a.localeCompare(b)).join(', '); }
function feeDateText(h){ return new Date(h.date).toLocaleDateString(undefined,{weekday:'short', day:'numeric', month:'short'}); }
function rupees(n){ return '₹' + Math.round(Number(n)||0).toLocaleString('en-IN'); }
function copyText(t){
  const done = ()=>{ payCopyFlash = true; render(); setTimeout(()=>{ payCopyFlash = false; render(); }, 1500); };
  try{ navigator.clipboard.writeText(t).then(done).catch(()=>{ window.prompt('Copy this:', t); }); }catch(e){ window.prompt('Copy this:', t); }
}
function feeShareText(h, f){
  const lines = ['💰 *' + SPORT.name + ' money · ' + feeDateText(h) + '*'];
  lines.push('Total ' + rupees(feeTotal(f)) + ' (' + f.items.map(i=>i.label + ' ' + rupees(i.amount)).join(', ') + ')');
  if(f.split!=='custom') lines.push('*' + rupees(feeEach(f)) + ' each* · ' + (f.players||[]).length + ' players');
  const ls = feeLines(f);
  const owingAll = ls.filter(l=>l.owes>0), owing = owingAll.filter(l=>!l.paid), prepaid = owingAll.filter(l=>l.paid), covered = ls.filter(l=>!l.collector && l.owes===0 && l.spent>0 && l.back===0), backs = ls.filter(l=>l.back>0);
  if(owing.length){ lines.push('', '*To pay:*'); owing.forEach(l=>lines.push('• ' + playerName(l.id) + ' ' + rupees(l.owes) + (l.incl.length ? ' (incl. guest ' + feeGuestNames(l.incl) + ')' : '') + (l.spent ? ' (' + rupees(l.spent) + ' already spent)' : ''))); }
  if(prepaid.length) lines.push('', '✅ *Already paid:* ' + prepaid.map(l=>playerName(l.id) + ' (' + (l.paid.how==='upi' ? 'UPI' : 'cash') + ')').join(', '));
  if(!owing.length && prepaid.length) lines.push('Everyone’s paid 🎉');
  const gc = ls.filter(l=>l.coveredBy);
  if(gc.length) lines.push('🙋 Guests: ' + gc.map(l=>playerName(l.id) + ' (' + guestOfText(l.id, (f.guestOf||{})[l.id]) + ')').join(', '));
  if(covered.length) lines.push('', '✅ Already covered: ' + covered.map(l=>playerName(l.id)).join(', '));
  if(backs.length) lines.push('↩️ Gets money back: ' + backs.map(l=>playerName(l.id) + ' ' + rupees(l.back)).join(', '));
  const p = payInfo();
  if(owing.length){
    lines.push('', upiOk(p.upi) ? ('Pay ' + (p.name||'the host') + ' by UPI (' + p.upi.trim() + ') or cash.') : 'Pay the host in cash.');
    lines.push('See what you owe / pay in one tap:', payLink());
  }
  return lines.join('\n');
}
function shareFeeNudge(){
  const list = allOutstanding(); if(!list.length) return;
  const lines = ['⏰ *' + SPORT.name + ' money still to pay*'];
  list.forEach(x=>lines.push('• ' + playerName(x.id) + ' ' + rupees(x.total) + (x.items.length>1 ? ' (' + x.items.length + ' matches)' : '')));
  const p = payInfo();
  lines.push('', upiOk(p.upi) ? ('UPI: ' + p.upi.trim() + ' (' + (p.name||'host') + ') or cash.') : 'Cash to the host.');
  lines.push('Pay in one tap:', payLink());
  openWhatsApp(lines.join('\n'));
}
// ---- host: edit the costs for one match ----
function openFeeEditor(hid){
  const h = HISTORY.find(x=>x.id===hid);
  if(!h || !isHost()) return;
  const ex = feeOf(h), tpl = SQUAD.feeTemplate;
  const players = (h.teamAIds||[]).concat(h.teamBIds||[]);
  feeDraft = ex ? JSON.parse(JSON.stringify(ex)) : {
    items: (tpl && tpl.items && tpl.items.length) ? tpl.items.map(i=>({label:i.label, amount:i.amount, paidBy: i.by==='_c' ? '_c' : ''})) : [{label:'Turf', amount:'', paidBy:'_c'}],
    players: players.slice(), split: (tpl && tpl.split) || 'equal', custom: {}, paid: {},
    collectorId: payInfo().playerId || null, guestsByHost: true
  };
  // who brought each guest (kept on the costs, so it survives the guest being tidied away)
  feeDraft.guestOf = Object.assign({}, feeDraft.guestOf || {});
  players.filter(isGuest).forEach(g=>{ const of = guestOf(g); if(of.length) feeDraft.guestOf[g] = of.slice(); });
  if(feeDraft.guestsByHost==null) feeDraft.guestsByHost = true;
  feeDraft._all = players; feeDraft._err = '';
  feeEditId = hid; showPayments = false; render();
}
function closeFeeEditor(){ feeEditId = null; feeDraft = null; render(); }
function feeAddItem(label, amount){ feeDraft.items.push({label: label||'', amount: amount==null ? '' : amount, paidBy: label==='Water' ? '' : '_c'}); render(); }
function feeSet(i, k, v){ const it = feeDraft.items[i]; if(!it) return; it[k] = (k==='amount') ? (v==='' ? '' : Math.max(0, Math.round(Number(v)||0))) : v; }
function feeTogglePlayer(id){ const a = feeDraft.players; const i = a.indexOf(id); if(i>=0) a.splice(i,1); else a.push(id); render(); }
function feeDraftPaid(id, how){ const pd = feeDraft.paid = feeDraft.paid || {}; if(pd[id] && pd[id].how===how) delete pd[id]; else pd[id] = {how, at: new Date().toISOString()}; render(); }
function feeSetCustom(id, v){ feeDraft.custom[id] = v==='' ? '' : Math.max(0, Math.round(Number(v)||0)); }
function cleanFee(d){
  const items = d.items.filter(i=>Number(i.amount)>0).map(i=>({label:(String(i.label||'').trim().slice(0,30) || 'Cost'), amount:Math.round(Number(i.amount)), paidBy: (i.paidBy && i.paidBy!=='' ? i.paidBy : '_c')}));
  const players = d.players.filter(id=>d._all.includes(id));
  const custom = {};
  if(d.split==='custom') players.forEach(id=>{ custom[id] = Math.max(0, Math.round(Number(d.custom[id])||0)); });
  const paid = {}; Object.keys(d.paid||{}).forEach(id=>{ if(players.includes(id) || items.some(i=>i.paidBy===id)) paid[id] = d.paid[id]; });
  const guestOfSnap = {}; Object.keys(d.guestOf||{}).forEach(g=>{ if(players.includes(g) && (d.guestOf[g]||[]).length) guestOfSnap[g] = d.guestOf[g].slice(); });
  return {items, players, split: d.split==='custom' ? 'custom' : 'equal', custom, paid, collectorId: d.collectorId || null, createdAt: d.createdAt || new Date().toISOString(),
          guestsByHost: d.guestsByHost!==false, guestOf: guestOfSnap};
}
function saveFees(share){
  const h = HISTORY.find(x=>x.id===feeEditId); if(!h || !feeDraft) return;
  const f = cleanFee(feeDraft);
  if(!f.items.length){ feeDraft._err = 'Add at least one cost with an amount.'; render(); return; }
  if(!f.players.length){ feeDraft._err = 'Tick at least one player to split it between.'; render(); return; }
  updateHistoryResult(h.id, {fees: f});
  saveSquadDoc(Object.assign({}, SQUAD, {feeTemplate: {items: f.items.map(i=>({label:i.label, amount:i.amount, by: i.paidBy==='_c' ? '_c' : 'player'})), split: f.split}}));
  feeEditId = null; feeDraft = null;
  if(share) openWhatsApp(feeShareText(h, f));
  render();
}
function removeFees(){
  if(!feeEditId) return;
  if(!feeDraft._rmArm){ feeDraft._rmArm = true; render(); return; }
  updateHistoryResult(feeEditId, {fees: null});
  feeEditId = null; feeDraft = null; render();
}
function markPaid(hid, id, how){
  if(!isHost()) return;
  const h = HISTORY.find(x=>x.id===hid); const f = feeOf(h); if(!f) return;
  const nf = JSON.parse(JSON.stringify(f)); nf.paid = nf.paid || {};
  if(!how || (nf.paid[id] && nf.paid[id].how===how)) delete nf.paid[id];
  else nf.paid[id] = {how, at: new Date().toISOString()};
  updateHistoryResult(hid, {fees: nf});
}
function renderFeeEditor(){
  if(!feeEditId || !feeDraft) return '';
  if(!isHost()){ feeEditId = null; return ''; }
  const h = HISTORY.find(x=>x.id===feeEditId); if(!h){ feeEditId = null; return ''; }
  const d = feeDraft, all = d._all, p = payInfo();
  const prev = cleanFee(d);
  const total = feeTotal(prev), lines = feeLines(Object.assign({}, prev, {items: prev.items.length ? prev.items : [{label:'x', amount:0, paidBy:'_c'}]}));
  const lineOf = id=> lines.find(l=>l.id===id);
  const collectorName = (p.name || 'Host') + ' (money collector)';
  const payerOpts = (sel)=> `<option value="_c" ${sel==='_c'?'selected':''}>${esc(collectorName)}</option><option value="" ${sel===''?'selected':''}>— who paid? —</option>` + all.map(id=>`<option value="${id}" ${sel===id?'selected':''}>${esc(playerName(id))}</option>`).join('');
  const res = id=>{
    const l = lineOf(id); if(!l) return '<span class="res">free</span>';
    if(l.coveredBy) return `<span class="res" style="color:var(--good);">paid by ${esc(((d.guestOf||{})[id]||[]).includes('*') ? 'everyone' : feeGuestNames(l.coveredBy))}</span>`;
    if(l.collector) return `<span class="res">collects the money${l.incl.length ? ' (covers ' + esc(feeGuestNames(l.incl)) + ')' : ''}</span>`;
    if(l.back>0) return `<span class="res" style="color:var(--good);">gets back ${rupees(l.back)}</span>`;
    if(l.owes===0) return `<span class="res" style="color:var(--good);">covered ✓</span>`;
    const pd = l.paid;
    return `<span class="res"${pd ? ' style="color:var(--good);"' : ''}>${pd ? 'paid ' + rupees(l.owes) + ' ✓ ' + (pd.how==='upi' ? 'UPI' : 'cash') : 'owes <b class="pay-amt">' + rupees(l.owes) + '</b>'}${l.incl.length ? '<br>incl. ' + esc(feeGuestNames(l.incl)) : ''}</span>
      <span class="pay-btns fee-prepaid"><button type="button" class="btn btn-sm ${pd && pd.how==='upi' ? 'on' : ''}" title="Already paid by UPI" onclick="feeDraftPaid('${id}','upi')">UPI ✓</button><button type="button" class="btn btn-sm ${pd && pd.how==='cash' ? 'on' : ''}" title="Already paid in cash" onclick="feeDraftPaid('${id}','cash')">Cash ✓</button></span>`;
  };
  const hasGuests = all.some(id=>d.guestOf && d.guestOf[id]);
  const customSum = prev.split==='custom' ? prev.players.reduce((n,id)=>n+(prev.custom[id]||0),0) : 0;
  return `
  <div class="modal-backdrop" onclick="if(event.target===this) closeFeeEditor();">
    <div class="modal" style="max-width:560px;">
      <div class="row" style="justify-content:space-between; margin-bottom:4px;">
        <div class="panel-title" style="margin:0;">💰 Split the cost</div>
        <button class="icon-btn" onclick="closeFeeEditor()">✕</button>
      </div>
      <div class="panel-sub">${esc(feeDateText(h))} · ${all.length} players · ${esc(matchModeLabel(h.mode))}</div>
      ${!upiOk(p.upi) ? `<div class="banner amber" style="margin:8px 0;">Add your UPI ID in 💰 Payments → Settings so friends can pay you by UPI. Cash works either way.</div>` : ''}
      <div class="fee-head">Costs</div>
      ${d.items.map((it,i)=>`<div class="fee-item">
        <input type="text" class="field-input" maxlength="30" placeholder="e.g. Turf" value="${escAttr(it.label)}" onchange="feeSet(${i},'label',this.value); render();">
        <input type="number" class="field-input" min="0" inputmode="numeric" placeholder="₹" value="${it.amount===''?'':it.amount}" onchange="feeSet(${i},'amount',this.value); render();">
        <select class="field-input" onchange="feeSet(${i},'paidBy',this.value); render();">${payerOpts(it.paidBy)}</select>
        <button class="icon-btn" title="Remove" onclick="feeDraft.items.splice(${i},1); render();">✕</button>
      </div>`).join('')}
      <div class="row" style="gap:6px; flex-wrap:wrap; margin-top:4px;">
        <button class="btn btn-sm" onclick="feeAddItem('Water',100)">＋ Water ₹100</button>
        <button class="btn btn-sm" onclick="feeAddItem('',null)">＋ Other cost</button>
      </div>
      <div class="panel-sub" style="margin:10px 0 0;">“Paid by” a player (like whoever brought water) counts towards their share.</div>
      <div class="fee-head">Split</div>
      <div class="chip-toggle-row">
        <button type="button" class="chip-toggle ${d.split!=='custom'?'active':''}" onclick="feeDraft.split='equal'; render();">Equal</button>
        <button type="button" class="chip-toggle ${d.split==='custom'?'active':''}" onclick="feeDraft.split='custom'; render();">Custom amounts</button>
      </div>
      <div class="panel-sub" style="margin:8px 0 4px;">
        Total <b>${rupees(total)}</b>${d.split!=='custom' ? ` · ${prev.players.length} sharing · <b>${rupees(feeEach(prev))} each</b>${prev.players.length && total % prev.players.length ? ' (rounded up)' : ''}` : ` · custom amounts add up to <b>${rupees(customSum)}</b>${customSum!==total ? ` <span style="color:var(--danger);">(${customSum>total?'+':''}${rupees(customSum-total)} vs total)</span>` : ' ✓'}`}
      </div>
      ${all.map(id=>`<div class="fee-pl">
        <label><input type="checkbox" ${d.players.includes(id)?'checked':''} onchange="feeTogglePlayer('${id}')"> ${esc(playerName(id))}${id===d.collectorId ? ' <span class="chip" style="padding:1px 7px; font-size:.68rem;">collector</span>' : ''}${(d.guestOf||{})[id] ? ' <span class="chip guest-tag">' + esc(guestOfText(id, d.guestOf[id])) + '</span>' : ''}</label>
        <span style="display:flex; align-items:center; gap:8px;">
          ${d.split==='custom' && d.players.includes(id) ? `<input type="number" class="field-input" min="0" inputmode="numeric" placeholder="₹" value="${(d.custom[id]===''||d.custom[id]==null)?'':d.custom[id]}" onchange="feeSetCustom('${id}', this.value); render();">` : ''}
          ${d.players.includes(id) ? res(id) : '<span class="res">not paying</span>'}
        </span>
      </div>`).join('')}
      <div class="panel-sub" style="margin:8px 0 0;">Untick anyone who plays free. Already got someone’s money? Tap <b>UPI ✓</b> or <b>Cash ✓</b> next to them and they’ll show as paid in the message.</div>
      ${hasGuests ? `<label class="fee-pl" style="border:0; cursor:pointer;"><span style="display:flex; gap:8px; align-items:center;"><input type="checkbox" ${d.guestsByHost!==false?'checked':''} onchange="feeDraft.guestsByHost=this.checked; render();"> Guests’ share is paid by whoever brought them</span></label>` : ''}
      ${d._err ? `<div class="login-err">${esc(d._err)}</div>` : ''}
      <div class="footer-actions" style="margin-top:14px; justify-content:flex-start; flex-wrap:wrap;">
        <button class="btn btn-primary" onclick="saveFees(true)">💬 Save &amp; send to WhatsApp</button>
        <button class="btn" onclick="saveFees(false)">Save</button>
        ${feeOf(h) ? `<button class="btn ${d._rmArm?'btn-danger':'btn-ghost'}" onclick="removeFees()">${d._rmArm ? 'Tap again to remove' : 'Remove costs'}</button>` : ''}
      </div>
    </div>
  </div>`;
}
// ---- host: everything owed, settings ----
function togglePayments(){ showPayments = !showPayments; paySettings = null; render(); }
function openPaySettings(){ const p = payInfo(); paySettings = {upi: p.upi||'', name: p.name||'', playerId: p.playerId||'', err:''}; render(); }
function savePaySettings(){
  const d = paySettings; if(!d) return;
  const upi = (d.upi||'').trim();
  if(upi && !upiOk(upi)){ d.err = 'That doesn’t look like a UPI ID (it should look like name@bank).'; render(); return; }
  saveSquadDoc(Object.assign({}, SQUAD, {pay: {upi, name: (d.name||'').trim().slice(0,40), playerId: d.playerId || null}}));
  paySettings = null; render();
}
function renderPaymentsModal(){
  if(!showPayments) return '';
  if(!isHost()){ showPayments = false; return ''; }
  const p = payInfo(), list = allOutstanding(), owedTotal = list.reduce((n,x)=>n+x.total,0);
  const matches = HISTORY.filter(feeOf).slice(0, 12);
  const settings = paySettings ? `
    <div class="page-card" style="margin:10px 0;">
      <div class="edit-label">Your UPI ID</div>
      <input type="text" class="field-input" style="width:100%;" id="payUpiInput" autocomplete="off" autocapitalize="off" placeholder="yourname@okaxis" value="${escAttr(paySettings.upi)}" oninput="paySettings.upi=this.value">
      <div class="edit-label" style="margin-top:10px;">Name shown to friends</div>
      <input type="text" class="field-input" style="width:100%;" id="payNameInput" maxlength="40" placeholder="Keerat" value="${escAttr(paySettings.name)}" oninput="paySettings.name=this.value">
      <div class="edit-label" style="margin-top:10px;">You on the player list (so you’re never asked to pay yourself)</div>
      <select class="field-input" style="width:100%;" onchange="paySettings.playerId=this.value"><option value="">I don’t play / not listed</option>${rosterPlayersArr().map(x=>`<option value="${x.id}" ${paySettings.playerId===x.id?'selected':''}>${esc(x.name)}</option>`).join('')}</select>
      ${paySettings.err ? `<div class="login-err">${esc(paySettings.err)}</div>` : ''}
      <div class="panel-sub" style="margin:8px 0 0;">Everyone in this game can see this UPI ID. If yours is your phone number, consider making a separate UPI ID in your UPI app.</div>
      <div class="footer-actions" style="justify-content:flex-start; margin-top:10px;"><button class="btn btn-primary" onclick="savePaySettings()">Save</button><button class="btn btn-ghost" onclick="paySettings=null; render();">Cancel</button></div>
    </div>` : `
    <div class="pay-row"><span><span class="who">Money goes to:</span> ${upiOk(p.upi) ? esc(p.name||'Host') + ' · ' + esc(p.upi) : '<span style="color:var(--danger);">no UPI ID yet (cash only)</span>'}</span><button class="btn btn-sm" onclick="openPaySettings()">⚙ Settings</button></div>
    ${upiOk(p.upi) ? `<details style="margin-top:6px;"><summary class="panel-sub" style="cursor:pointer;">Show my UPI QR (to scan at the turf)</summary><div class="qr-box">${qrSvg(upiLink(0, ''), 200)}</div></details>` : ''}`;
  const matchBlock = h=>{
    const f = h.fees, ls = feeLines(f), owing = ls.filter(l=>l.owes>0), paidN = owing.filter(l=>l.paid).length;
    return `<div class="page-card" style="padding:12px; margin-top:10px;">
      <div class="row" style="justify-content:space-between;">
        <div><b>${esc(feeDateText(h))}</b> <span class="panel-sub" style="margin:0;">· ${rupees(feeTotal(f))}${f.split!=='custom' ? ' · ' + rupees(feeEach(f)) + ' each' : ''} · ${paidN}/${owing.length} paid</span></div>
        <button class="btn btn-sm btn-ghost" onclick="openFeeEditor('${h.id}')">Edit</button>
      </div>
      ${owing.map(l=>`<div class="pay-row">
        <span class="who">${esc(playerName(l.id))}<small>${rupees(l.owes)}${l.incl.length ? ' incl. ' + esc(feeGuestNames(l.incl)) : ''}${l.paid ? ' · paid by ' + l.paid.how.toUpperCase() : ''}</small></span>
        <span class="pay-btns">
          <button class="btn btn-sm ${l.paid && l.paid.how==='upi' ? 'on' : ''}" onclick="markPaid('${h.id}','${l.id}','upi')">UPI ✓</button>
          <button class="btn btn-sm ${l.paid && l.paid.how==='cash' ? 'on' : ''}" onclick="markPaid('${h.id}','${l.id}','cash')">Cash ✓</button>
        </span>
      </div>`).join('') || '<div class="panel-sub">Nobody owes anything for this one.</div>'}
      ${ls.filter(l=>l.back>0).map(l=>`<div class="panel-sub" style="margin:6px 0 0;">↩️ Give ${esc(playerName(l.id))} back ${rupees(l.back)}</div>`).join('')}
    </div>`;
  };
  return `
  <div class="modal-backdrop" onclick="if(event.target===this) togglePayments();">
    <div class="modal" style="max-width:560px;">
      <div class="row" style="justify-content:space-between; margin-bottom:6px;">
        <div class="panel-title" style="margin:0;">💰 Payments</div>
        <button class="icon-btn" onclick="togglePayments()">✕</button>
      </div>
      ${settings}
      <div class="fee-head">Still to collect</div>
      ${list.length ? `<div class="panel-sub" style="margin:0 0 6px;"><b>${rupees(owedTotal)}</b> from ${list.length} ${list.length===1?'person':'people'}: ${list.map(x=>esc(playerName(x.id)) + ' ' + rupees(x.total)).join(', ')}</div>
        <button class="btn btn-sm btn-primary" onclick="shareFeeNudge()">⏰ Nudge on WhatsApp</button>` : `<div class="panel-sub">Everyone’s paid up 🎉</div>`}
      <div class="fee-head">Matches</div>
      ${matches.length ? matches.map(matchBlock).join('') : `<div class="panel-sub">No costs added yet. After a match, tap “💰 Split the cost” on the result screen, or the 💰 button in 📜 Past matches.</div>`}
    </div>
  </div>`;
}
// ---- friends: what I owe ----
function myPayCardHtml(where){
  const me = getMyPlayerId(); if(!me) return '';
  const out = outstandingFor(me);
  if(!out.length) return where==='profile' && HISTORY.some(h=>feeOf(h) && feeLines(h.fees).some(l=>l.id===me)) ? `<div class="pf-section">Payments</div><div class="panel-sub">All paid up ✓</div>` : '';
  const total = out.reduce((n,x)=>n+x.amount,0), p = payInfo(), link = upiLink(total, SPORT.name + ' ' + out.map(x=>feeDateText(x.h)).join(', '));
  const body = `
    <div class="poll-head"><div class="poll-q">💰 You owe <span class="pay-amt">${rupees(total)}</span></div><div class="poll-meta">${out.length} match${out.length===1?'':'es'}</div></div>
    ${out.map(x=>`<div class="pay-row"><span>${esc(feeDateText(x.h))}${x.incl && x.incl.length ? `<small>incl. guest${x.incl.length>1?'s':''}: ${esc(feeGuestNames(x.incl))}</small>` : ''}</span><span class="pay-amt">${rupees(x.amount)}</span></div>`).join('')}
    ${upiOk(p.upi) ? `
      <div class="panel-sub" style="margin:10px 0 6px;">Pay <b>${esc(p.name||'the host')}</b> · UPI <b>${esc(p.upi)}</b> <button class="btn btn-sm btn-ghost" onclick="copyText(payInfo().upi)">${payCopyFlash ? '✅ Copied' : 'Copy'}</button></div>
      <div class="poll-actions" style="margin-top:4px;">
        <a class="btn btn-primary btn-sm" href="${escAttr(link)}">Pay ${rupees(total)} with a UPI app</a>
        <button class="btn btn-sm" onclick="payQrOpen=!payQrOpen; render();">${payQrOpen ? 'Hide QR' : 'Show QR'}</button>
      </div>
      ${payQrOpen ? `<div class="qr-box">${qrSvg(link, 220)}</div><div class="poll-list">Pays ${esc(p.name||'the host')} (${esc(p.upi)}) ${rupees(total)}. From another phone, scan it; on this phone, screenshot it and use “Scan from gallery” in your UPI app. Check the name your UPI app shows before you pay.</div>` : ''}
    ` : `<div class="panel-sub" style="margin:10px 0 0;">Pay the host in cash.</div>`}
    <div class="poll-list">Cash is fine too. The host marks you as paid; it disappears from here once they do.</div>`;
  return where==='profile' ? `<div class="pf-section">Payments</div><div class="page-card pay-card" style="padding:12px;">${body}</div>`
                           : `<div class="panel pay-card" id="payCard">${body}</div>`;
}
function hostPaySummaryHtml(){
  if(!isHost()) return '';
  const list = allOutstanding(); if(!list.length) return '';
  const t = list.reduce((n,x)=>n+x.total,0);
  return `<div class="poll-cta"><button class="btn" onclick="togglePayments()">💰 ${rupees(t)} to collect</button><span>${list.length} ${list.length===1?'person hasn’t':'people haven’t'} paid yet.</span></div>`;
}

