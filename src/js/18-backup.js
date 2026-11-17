/* ============================= Backup & restore (host only) ============================= */
const BACKUP_KIND = 'matchday-draft-backup';
function toggleBackup(){ showBackup = !showBackup; restoreDraft = null; restoreArm = false; restoreBusy = ''; backupMsg = ''; render(); }
function lastBackupText(){
  let t = null; try{ t = localStorage.getItem('md_last_backup_' + currentSquadId); }catch(e){}
  if(!t) return 'Never backed up from this phone.';
  const days = Math.floor((Date.now() - new Date(t).getTime()) / 864e5);
  return 'Last backup from this phone: ' + (days<=0 ? 'today' : days===1 ? 'yesterday' : days + ' days ago') + '.';
}
async function buildBackup(){
  let history = HISTORY, rivals = RIVALS;
  if(db){
    // the live list stops at the latest 200 matches; a backup takes every one
    const hs = await db.collection(squadPath('history')).get();
    history = hs.docs.map(d=>Object.assign({id:d.id}, d.data()));
    const rs = await db.collection(squadPath('rivalries')).get();
    rivals = rs.docs.map(d=>Object.assign({id:d.id}, d.data()));
  }
  return {
    kind: BACKUP_KIND, version: 1, exportedAt: new Date().toISOString(),
    squad: {id: currentSquadId, name: currentSquadName()},
    roster: SQUAD, match: S, history, rivalries: rivals
  };
}
async function downloadBackup(){
  if(!isHost() || backupBusy) return;
  backupBusy = true; backupMsg = ''; render();
  try{
    const data = await buildBackup();
    const json = JSON.stringify(data, null, 1);
    const day = new Date().toISOString().slice(0,10);
    const safe = (currentSquadName()||'squad').replace(/[^a-z0-9]+/gi,'-').replace(/^-|-$/g,'').toLowerCase() || 'squad';
    const name = 'matchday-backup-' + safe + '-' + day + '.json';
    const file = (typeof File==='function') ? new File([json], name, {type:'application/json'}) : null;
    const standalone = window.matchMedia && window.matchMedia('(display-mode: standalone)').matches;
    // installed iPhone apps can't download files, so hand it to the share sheet instead
    if(standalone && file && navigator.canShare && navigator.canShare({files:[file]})){
      await navigator.share({files:[file], title:'Matchday Draft backup'});
    }else{
      const url = URL.createObjectURL(new Blob([json], {type:'application/json'}));
      const a = document.createElement('a'); a.href = url; a.download = name;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(()=>URL.revokeObjectURL(url), 4000);
    }
    try{ localStorage.setItem('md_last_backup_' + currentSquadId, new Date().toISOString()); }catch(e){}
    backupMsg = '✅ Backup saved: ' + data.history.length + ' match' + (data.history.length===1?'':'es') + ', ' + ((data.roster.players||[]).length) + ' players.';
  }catch(e){
    backupMsg = (e && e.name==='AbortError') ? '' : '⚠️ The backup couldn’t be made. Check your connection and try again.';
  }
  backupBusy = false; render();
}
function validateBackup(d){
  if(!d || d.kind!==BACKUP_KIND || typeof d.version!=='number') return 'This isn’t a Matchday Draft backup file.';
  if(d.version > 1) return 'This backup was made by a newer version of the app. Refresh the app and try again.';
  if(!d.roster || !Array.isArray(d.roster.players)) return 'The backup is missing the player list.';
  if(!d.match || typeof d.match!=='object') return 'The backup is missing the match-day state.';
  if(!Array.isArray(d.history) || d.history.some(h=>!h || !h.id || !Array.isArray(h.teamAIds) || !Array.isArray(h.teamBIds))) return 'The backup’s match history looks damaged.';
  if(d.rivalries && !Array.isArray(d.rivalries)) return 'The backup’s rivalries look damaged.';
  return '';
}
function pickRestoreFile(input){
  const f = input.files && input.files[0];
  input.value = '';
  if(!f) return;
  const rd = new FileReader();
  rd.onload = ()=>{
    let d = null, err = '';
    try{ d = JSON.parse(String(rd.result)); }catch(e){ err = 'That file couldn’t be read as a backup.'; }
    if(!err) err = validateBackup(d);
    restoreDraft = err ? {error: err} : {data: d};
    restoreArm = false; render();
  };
  rd.onerror = ()=>{ restoreDraft = {error: 'That file couldn’t be opened.'}; render(); };
  rd.readAsText(f);
}
async function applyRestore(){
  if(!isHost() || !restoreDraft || !restoreDraft.data) return;
  if(!restoreArm){ restoreArm = true; render(); return; }
  const d = restoreDraft.data;
  const strip = o=>{ const c = Object.assign({}, o); delete c.id; return c; };
  restoreBusy = 'Restoring players and match day…'; render();
  try{
    if(db){
      await db.doc(squadPath('state/roster')).set(d.roster);
      await db.doc(squadPath('state/match')).set(d.match);
      const keepH = new Set(d.history.map(h=>h.id));
      const curH = await db.collection(squadPath('history')).get();
      const dels = curH.docs.filter(x=>!keepH.has(x.id)).map(x=>()=>db.doc(squadPath('history/'+x.id)).delete());
      const sets = d.history.map(h=>()=>db.doc(squadPath('history/'+h.id)).set(strip(h)));
      const riv = d.rivalries || [];
      const keepR = new Set(riv.map(x=>x.id));
      const curR = await db.collection(squadPath('rivalries')).get();
      const rdels = curR.docs.filter(x=>!keepR.has(x.id)).map(x=>()=>db.doc(squadPath('rivalries/'+x.id)).delete());
      const rsets = riv.filter(x=>x && x.id).map(x=>()=>db.doc(squadPath('rivalries/'+x.id)).set(strip(x)));
      const jobs = dels.concat(sets, rdels, rsets);
      for(let i=0; i<jobs.length; i+=20){
        restoreBusy = 'Restoring matches… ' + Math.min(i+20, jobs.length) + ' of ' + jobs.length; render();
        await Promise.all(jobs.slice(i, i+20).map(f=>f()));
      }
    }else{
      SQUAD = d.roster; S = d.match;
      HISTORY = d.history.slice().sort((a,b)=> String(b.date).localeCompare(String(a.date)));
      localCommit();
    }
    restoreBusy = ''; restoreDraft = null; restoreArm = false;
    backupMsg = '✅ Restored: ' + d.history.length + ' match' + (d.history.length===1?'':'es') + ' and ' + d.roster.players.length + ' players.';
  }catch(e){
    restoreBusy = ''; restoreArm = false;
    backupMsg = '⚠️ The restore stopped part-way (' + ((e && e.code) || 'connection problem') + '). Nothing was lost from the file — try again.';
  }
  render();
}
function renderBackupModal(){
  if(!showBackup) return '';
  if(!isHost()){ showBackup = false; return ''; }
  const rd = restoreDraft;
  let restoreBox = '';
  if(rd && rd.error) restoreBox = `<div class="login-err" style="margin-top:10px;">${esc(rd.error)}</div>`;
  else if(rd && rd.data){
    const d = rd.data;
    restoreBox = `
      <div class="hres" style="margin-top:12px; padding:12px; border:1px solid var(--line-strong); border-radius:var(--radius-sm);">
        <div style="font-weight:700;">${esc((d.squad && d.squad.name) || 'Squad')} · saved ${esc(new Date(d.exportedAt).toLocaleString(undefined,{day:'numeric',month:'short',year:'numeric',hour:'numeric',minute:'2-digit'}))}</div>
        <div class="panel-sub" style="margin:4px 0 10px;">${d.roster.players.length} players · ${d.history.length} matches · ${(d.rivalries||[]).length} rivalries</div>
        <div class="panel-sub" style="margin:0 0 10px; color:var(--danger);">This replaces <b>${esc(currentSquadName())}</b>’s players, today’s match and the whole match history with what’s in the file. Anything added since the backup is lost.</div>
        <div class="row" style="gap:8px;">
          <button class="btn ${restoreArm ? 'btn-danger' : 'btn-primary'}" ${restoreBusy?'disabled':''} onclick="applyRestore()">${restoreArm ? 'Tap again to replace' : 'Restore this backup'}</button>
          <button class="btn btn-ghost" ${restoreBusy?'disabled':''} onclick="restoreDraft=null; restoreArm=false; render();">Cancel</button>
        </div>
      </div>`;
  }
  return `
  <div class="modal-backdrop" onclick="if(event.target===this && !restoreBusy) toggleBackup();">
    <div class="modal">
      <div class="row" style="justify-content:space-between; margin-bottom:4px;">
        <div class="panel-title" style="margin:0;">💾 Backup &amp; restore</div>
        <button class="icon-btn" ${restoreBusy?'disabled':''} onclick="toggleBackup()">✕</button>
      </div>
      <p class="panel-sub">Saves everything for <b>${esc(currentSquadName())}</b> to one file: players, chemistry links, today’s match, every past match with results and votes, and rivalries. Keep it somewhere safe (Files, Google Drive, or send it to yourself on WhatsApp). PINs aren’t included.</p>
      <div class="row" style="gap:8px; flex-wrap:wrap;">
        <button class="btn btn-primary" ${backupBusy||restoreBusy?'disabled':''} onclick="downloadBackup()">${backupBusy ? 'Preparing…' : '⬇️ Download backup'}</button>
        <label class="btn" style="cursor:pointer;">⬆️ Restore from file<input type="file" accept=".json,application/json" style="display:none;" onchange="pickRestoreFile(this)"></label>
      </div>
      <div class="panel-sub" style="margin:10px 0 0;">${esc(lastBackupText())} A backup after each matchday is a good habit.</div>
      ${backupMsg ? `<div class="panel-sub" style="margin:8px 0 0; color:var(--chalk);">${esc(backupMsg)}</div>` : ''}
      ${restoreBusy ? `<div class="panel-sub" style="margin:8px 0 0;">⏳ ${esc(restoreBusy)}</div>` : ''}
      ${restoreBox}
    </div>
  </div>`;
}

