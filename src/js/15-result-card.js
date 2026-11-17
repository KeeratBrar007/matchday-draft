/* ============================= Result card image =============================
   A picture of the result (score, scorers, player of the match) to post in the
   WhatsApp group. Drawn on a canvas in the phone itself, then handed to the
   share sheet (or saved). Anyone can make one for any match with a result. */
let resultCardOpen = null, resultCardUrl = '', resultCardBlob = null, resultCardMsg = '';
function resultCardBtn(h, cls){
  if(!h || !h.winner) return '';
  return `<button class="btn btn-sm ${cls||''}" onclick="event.stopPropagation(); openResultCard('${h.id}')">📸 Result card</button>`;
}
function rcSideLines(h, team){
  const ids = new Set(team==='a' ? (h.teamAIds||[]) : (h.teamBIds||[]));
  const other = new Set(team==='a' ? (h.teamBIds||[]) : (h.teamAIds||[]));
  const fb = SPORT.key==='football';
  const out = (h.scorers||[]).filter(x=>x.playerId && x.goals && ids.has(x.playerId)).sort((a,b)=>b.goals-a.goals)
    .map(x=> fb ? playerName(x.playerId) + (x.goals>1 ? ' ×' + x.goals : '') : playerName(x.playerId) + ' ' + x.goals);
  // own goals count for the other side
  (h.ownGoals||[]).filter(x=>x.playerId && other.has(x.playerId)).forEach(x=> out.push(playerName(x.playerId) + ' (OG)' + (x.goals>1 ? ' ×' + x.goals : '')));
  return out;
}
function rcPotm(h, team){
  const w = computePotmWinner(h, team);
  return w ? w.leaders.map(playerName).join(' & ') : '';
}
function rcFit(ctx, text, maxW, size, weight, family){
  let s = size;
  do { ctx.font = weight + ' ' + s + 'px ' + family; if(ctx.measureText(text).width <= maxW) break; s -= 2; } while(s > 18);
  return s;
}
async function drawResultCard(h){
  try{ if(document.fonts && document.fonts.ready) await Promise.race([document.fonts.ready, new Promise(r=>setTimeout(r, 1500))]); }catch(e){}
  const W = 1080, H = 1350, c = document.createElement('canvas'); c.width = W; c.height = H;
  const ctx = c.getContext('2d');
  const css = getComputedStyle(document.documentElement);
  const colA = (css.getPropertyValue('--teamA')||'').trim() || '#1f78c8', colB = (css.getPropertyValue('--teamB')||'').trim() || '#d6453d';
  const head = "Teko, 'Arial Narrow', sans-serif", body = "'Work Sans', system-ui, sans-serif", mono = "'Space Mono', ui-monospace, monospace";
  // background
  const g = ctx.createLinearGradient(0, 0, 0, H); g.addColorStop(0, '#0d1b14'); g.addColorStop(1, '#06100b');
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  ctx.globalAlpha = .07; ctx.strokeStyle = '#fff'; ctx.lineWidth = 6;
  ctx.beginPath(); ctx.arc(W/2, 640, 230, 0, Math.PI*2); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(0, 640); ctx.lineTo(W, 640); ctx.stroke();
  ctx.globalAlpha = 1;
  // team colour bands
  ctx.fillStyle = colA; ctx.fillRect(0, 0, W/2, 14); ctx.fillStyle = colB; ctx.fillRect(W/2, 0, W/2, 14);
  ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
  // title
  ctx.fillStyle = 'rgba(255,255,255,.62)'; ctx.font = '600 34px ' + body;
  const when = new Date(h.date).toLocaleDateString(undefined, {weekday:'short', day:'numeric', month:'short', year:'numeric'});
  ctx.fillText((SPORT.icon || '') + '  ' + SPORT.name.toUpperCase() + '  ·  ' + when, W/2, 104);
  ctx.fillStyle = '#fff'; ctx.font = '600 64px ' + head;
  const gname = (currentSquadName && currentSquadName()) || 'Matchday';
  rcFit(ctx, gname, W - 140, 64, '600', head); ctx.fillText(gname, W/2, 180);
  // score
  const sA = String(h.scoreA ?? '–') + (SPORT.teamWickets && h.wktsA!=null ? '/' + h.wktsA : '');
  const sB = String(h.scoreB ?? '–') + (SPORT.teamWickets && h.wktsB!=null ? '/' + h.wktsB : '');
  ctx.font = '700 64px ' + head; ctx.fillStyle = colA; ctx.fillText('TEAM A', W*0.25, 330); ctx.fillStyle = colB; ctx.fillText('TEAM B', W*0.75, 330);
  const big = rcFit(ctx, sA + '  ' + sB, W*0.62, 230, '700', mono);
  ctx.font = '700 ' + big + 'px ' + mono; ctx.fillStyle = '#fff';
  ctx.fillText(sA, W*0.25, 560); ctx.fillText(sB, W*0.75, 560);
  ctx.fillStyle = 'rgba(255,255,255,.35)'; ctx.fillText(':', W/2, 545);
  // result line
  const res = h.winner==='draw' ? SPORT.draw || 'Draw' : 'Team ' + h.winner.toUpperCase() + ' wins';
  ctx.font = '600 44px ' + body; ctx.fillStyle = h.winner==='a' ? colA : h.winner==='b' ? colB : '#f5c542';
  ctx.fillText((h.winner==='draw' ? '🤝 ' : '🏆 ') + res + (h.duration ? '  ·  ' + h.duration + ' min' : ''), W/2, 660);
  // scorers, one column per team
  const linesA = rcSideLines(h, 'a'), linesB = rcSideLines(h, 'b');
  ctx.font = '600 30px ' + body; ctx.fillStyle = 'rgba(255,255,255,.55)';
  ctx.fillText((SPORT.s1.icon||'') + ' ' + SPORT.s1.name.toUpperCase(), W/2, 750);
  const rows = Math.min(7, Math.max(linesA.length, linesB.length, 1));
  for(let i=0; i<rows; i++){
    const y = 812 + i*54;
    [['a', linesA, W*0.25], ['b', linesB, W*0.75]].forEach(([t, ls, x])=>{
      let txt = ls[i] || (i===0 ? '–' : ''); if(i===6 && ls.length>7) txt = '+' + (ls.length-6) + ' more';
      if(!txt) return;
      ctx.fillStyle = '#fff'; const sz = rcFit(ctx, txt, W*0.42, 40, '500', body); ctx.font = '500 ' + sz + 'px ' + body; ctx.fillText(txt, x, y);
    });
  }
  // player of the match
  const pA = rcPotm(h, 'a'), pB = rcPotm(h, 'b');
  let y = 812 + rows*54 + 40;
  if(pA || pB){
    ctx.fillStyle = 'rgba(255,255,255,.55)'; ctx.font = '600 30px ' + body; ctx.fillText('🏅 PLAYER OF THE MATCH', W/2, y); y += 62;
    [[pA, W*0.25, colA], [pB, W*0.75, colB]].forEach(([n, x, col])=>{ if(!n) return; ctx.fillStyle = col; const sz = rcFit(ctx, n, W*0.42, 50, '600', head); ctx.font = '600 ' + sz + 'px ' + head; ctx.fillText(n, x, y); });
  }
  // footer
  ctx.fillStyle = 'rgba(255,255,255,.4)'; ctx.font = '500 28px ' + body;
  ctx.fillText('Made with Matchday Draft', W/2, H - 60);
  return c;
}
async function openResultCard(hid){
  const h = HISTORY.find(x=>x.id===hid); if(!h || !h.winner) return;
  resultCardOpen = hid; resultCardUrl = ''; resultCardBlob = null; resultCardMsg = ''; render();
  try{
    const c = await drawResultCard(h);
    resultCardUrl = c.toDataURL('image/png');
    resultCardBlob = await new Promise(r=> c.toBlob ? c.toBlob(r, 'image/png') : r(null));
  }catch(e){ resultCardMsg = 'Couldn’t make the picture on this phone.'; }
  if(resultCardOpen===hid) render();
}
function resultCardFile(){
  const h = HISTORY.find(x=>x.id===resultCardOpen);
  const day = h ? new Date(h.date).toISOString().slice(0,10) : 'match';
  const name = 'matchday-result-' + day + '.png';
  return (resultCardBlob && typeof File==='function') ? new File([resultCardBlob], name, {type:'image/png'}) : null;
}
function canShareResultCard(){ const f = resultCardFile(); try{ return !!(f && navigator.canShare && navigator.canShare({files:[f]})); }catch(e){ return false; } }
async function shareResultCard(){
  const f = resultCardFile(); if(!f) return;
  try{ await navigator.share({files:[f], text: SPORT.icon + ' ' + SPORT.name + ' result'}); }
  catch(e){ if(e && e.name!=='AbortError'){ resultCardMsg = 'Sharing didn’t work here. Use Save instead.'; render(); } }
}
function saveResultCard(){
  if(!resultCardUrl) return;
  const f = resultCardFile();
  const a = document.createElement('a'); a.href = resultCardUrl; a.download = f ? f.name : 'matchday-result.png';
  document.body.appendChild(a); a.click(); a.remove();
  resultCardMsg = 'Saved. On an iPhone, you can also press and hold the picture and choose “Save to Photos”.'; render();
}
function renderResultCardModal(){
  if(!resultCardOpen) return '';
  const share = canShareResultCard();
  return `
  <div class="modal-backdrop" onclick="if(event.target===this){ resultCardOpen=null; render(); }">
    <div class="modal" style="max-width:440px;">
      <div class="row" style="justify-content:space-between; margin-bottom:8px;">
        <div class="panel-title" style="margin:0;">📸 Result card</div>
        <button class="icon-btn" onclick="resultCardOpen=null; render();">✕</button>
      </div>
      ${resultCardUrl ? `<img class="rc-img" id="resultCardImg" src="${resultCardUrl}" alt="Result card">` : `<div class="waiting-note" style="margin:40px 0;">${resultCardMsg ? esc(resultCardMsg) : 'Drawing…'}</div>`}
      ${resultCardUrl ? `<div class="footer-actions" style="justify-content:flex-start; margin-top:12px; flex-wrap:wrap;">
        ${share ? `<button class="btn btn-primary" onclick="shareResultCard()">💬 Share (WhatsApp…)</button>` : ''}
        <button class="btn ${share ? '' : 'btn-primary'}" onclick="saveResultCard()">⬇ Save image</button>
      </div>
      ${!share ? `<div class="panel-sub" style="margin:8px 0 0;">Save it, then send it from WhatsApp’s photo button.</div>` : ''}
      ${resultCardMsg ? `<div class="panel-sub" style="margin:8px 0 0;">${esc(resultCardMsg)}</div>` : ''}` : ''}
    </div>
  </div>`;
}

