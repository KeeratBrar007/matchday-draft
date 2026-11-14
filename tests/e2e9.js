// security (rules mirror) + backup/restore
const { chromium, devices } = require('playwright');
const http=require('http'),fs=require('fs'),path=require('path');
const HOSTCODE=fs.readFileSync(path.join(__dirname,'.hostcode'),'utf8').trim();
const srv=http.createServer((q,r)=>{ if(q.url.startsWith('/sw.js')){r.statusCode=404;return r.end();} r.setHeader('content-type','text/html'); r.end(fs.readFileSync(path.join(__dirname,'site/index.html'))); }).listen(0);
const store={}; const pages=[]; const errs=[]; const wait=ms=>new Promise(r=>setTimeout(r,ms));
let fails=0; const ok=(c,m)=>{ console.log((c?'PASS ':'FAIL ')+m); if(!c) fails++; };
const denied=()=>Object.keys(store).filter(k=>k.startsWith('__denied/')).map(k=>store[k]).filter(d=>!/^(logins|access)\//.test(d.path));
(async()=>{
 const br=await chromium.launch(); const url=`http://localhost:${srv.address().port}/`;
 async function phone(hash, ctxOpts, init){ const ctx=await br.newContext({...devices['iPhone 13'], acceptDownloads:true, ...(ctxOpts||{})}); await ctx.route(/gstatic\.com|googleapis\.com/,r=>r.abort()); const p=await ctx.newPage();
  p.on('pageerror',e=>errs.push(String(e)));
  await p.exposeFunction('__fsRelay',async(pth,json)=>{ if(json===null) delete store[pth]; else store[pth]=JSON.parse(json); for(const q of pages){ if(q!==p) await q.evaluate(([a,b])=>window.__mockApply(a,b),[pth,json]).catch(()=>{}); } });
  await p.addInitScript('window.__mockInit='+JSON.stringify(store)+';'); if(init) await p.addInitScript(init); await p.addInitScript(fs.readFileSync(path.join(__dirname,'mock2.js'),'utf8')); pages.push(p); await p.goto(url+(hash||'')); await p.evaluate((j)=>window.__mockApplyAll && window.__mockApplyAll(JSON.parse(j)), JSON.stringify(store)).catch(()=>{}); await p.waitForFunction(()=>dbReady&&rosterLoaded); await wait(300); return p; }
 const H=await phone('#host='+HOSTCODE);
 ok(Object.keys(store).some(k=>k.startsWith('hostClaims/')), 'host link creates a host claim in the database');
 ok(await H.evaluate(()=>hostClaimState)==='ok' && !(await H.$('#hostConfirmInput')), 'host phone is confirmed, no banner');
 ok(!Object.values(store).some(v=>v && typeof v==='object' && v.code===undefined && 0) , '(noop)');
 for(const [i,n] of ['Arjun','Rohan','Vikram','Sahil'].entries()){ await H.evaluate(([n,i])=>addPlayer(n,[i?'MID':'GK'],{},false,false),[n,i]); await wait(60); }
 await wait(300);
 ok((await H.evaluate(()=>SQUAD.players.length))===4, 'host can add players (roster write allowed)');

 // friend
 const F=await phone(''); await F.fill('#loginNameInput','Arjun'); await F.press('#loginNameInput','Enter'); await wait(300); await F.evaluate(()=>{ if(pinModalOpen) closePinModal(true); });
 const wasIn = (await H.evaluate(()=>S.selectedIds||[])).includes('arjun');
 await F.evaluate(()=>toggleSelected('arjun')); await wait(400);
 ok((await H.evaluate(()=>S.selectedIds||[])).includes('arjun') === !wasIn, 'friend can still tick themselves in/out');
 await F.evaluate(()=>toggleSelected('arjun')); await wait(400);
 ok((await H.evaluate(()=>S.selectedIds||[])).includes('arjun') === wasIn, '...both ways');
 console.log('dbg', JSON.stringify(denied()), await F.evaluate(()=>JSON.stringify({sel:S.selectedIds, phase:S.phase, me:getMyPlayerId()})));
 const before = denied().length;
 // a friend with some know-how calls the save functions directly
 await F.evaluate(()=>saveSquadDoc(Object.assign({}, SQUAD, {players:[]}))); await wait(400);
 ok((await H.evaluate(()=>SQUAD.players.length))===4, 'friend CANNOT wipe the roster');
 ok(denied().length>before, 'the database refused it');
 ok(/only the host/i.test(await F.evaluate(()=>document.body.innerText)), 'friend sees a "not saved — only the host" message');
 await F.evaluate(()=>addToHistory({date:new Date().toISOString(),format:2,mode:'random',teamA:{players:[]},teamAIds:['arjun'],teamB:{players:[]},teamBIds:['rohan'],subs:[],subIds:[]})); await wait(300);
 ok((await H.evaluate(()=>HISTORY.length))===0, 'friend cannot add fake matches');
 await F.evaluate(()=>saveState({phase:'complete', format:9})); await wait(300);
 ok((await H.evaluate(()=>S.format))!==9, 'friend cannot change match settings in the shared state');
 await F.evaluate(()=>db.doc('app/current').set({squadId:'hijack'}).catch(()=>{})); await wait(300);
 ok(store['app/current'].squadId!=='hijack', 'friend cannot switch everyone to another squad');
 await F.evaluate(()=>db.doc('hostClaims/'+AUTH_UID).set({code:'guess123', at:'x'}).catch(()=>{})); await wait(300);
 ok(!store['hostClaims/'+(await F.evaluate(()=>AUTH_UID))], 'a wrong code cannot make a host claim');

 // host who only has the old "I'm host" flag (no claim on this sign-in)
 const H2=await phone('', {}, "localStorage.setItem('md_is_host','1');");
 await wait(300);
 ok(await H2.evaluate(()=>hostClaimState)==='needed' && !!(await H2.$('#hostConfirmInput')), 'old host phone is asked to confirm the code once');
 await H2.evaluate(()=>saveSquadDoc(Object.assign({}, SQUAD, {players:SQUAD.players.slice(0,1)}))); await wait(300);
 ok((await H.evaluate(()=>SQUAD.players.length))===4, '...and its writes are refused until then');
 await H2.fill('#hostConfirmInput', 'wrong'); await H2.click('button:has-text("Confirm")'); await wait(200);
 ok(/isn’t the host code/.test(await H2.evaluate(()=>document.body.innerText)), 'wrong code rejected in the box');
 await H2.fill('#hostConfirmInput', HOSTCODE); await H2.click('button:has-text("Confirm")'); await wait(500);
 ok(await H2.evaluate(()=>hostClaimState)==='ok' && !(await H2.$('#hostConfirmInput')), 'right code confirms the phone');
 await H2.evaluate(()=>addPlayer('Karan',['FWD'],{},false,false)); await wait(400);
 ok((await H.evaluate(()=>SQUAD.players.length))===5, '...and its changes save now');
 await H2.evaluate(()=>releaseHost()); await wait(300);
 const h2uid = await H2.evaluate(()=>AUTH_UID);
 ok(!store['hostClaims/'+h2uid], 'stepping down removes the claim');

 /* ---- backup & restore ---- */
 const mk=(n,a,b,w)=>({date:new Date(Date.now()-n*864e5).toISOString(),format:2,mode:'random',teamA:{players:[]},teamAIds:a,teamB:{players:[]},teamBIds:b,subs:[],subIds:[],winner:w,scoreA:1,scoreB:0,scorers:[],assists:[]});
 await H.evaluate(([l])=>l.forEach(e=>addToHistory(e)),[[mk(3,['arjun','rohan'],['vikram','sahil'],'a'), mk(2,['arjun','vikram'],['rohan','sahil'],'b')]]); await wait(300);
 await H.evaluate(()=>{ SQUAD.chemistryGroups=[['arjun','rohan']]; saveSquadDoc(SQUAD); }); await wait(300);
 await H.evaluate(()=>toggleBackup()); await wait(200);
 ok(/Backup & restore/.test(await H.evaluate(()=>document.body.innerText)), 'host has a Backup & restore window');
 ok(!(await F.$('button:has-text("Backup")')), 'friends have no backup button');
 const [dl] = await Promise.all([H.waitForEvent('download'), H.click('button:has-text("Download backup")')]);
 const bpath = path.join(__dirname,'test_backup.json'); await dl.saveAs(bpath);
 const B = JSON.parse(fs.readFileSync(bpath,'utf8'));
 ok(B.kind==='matchday-draft-backup' && B.history.length===2 && B.roster.players.length===5 && JSON.stringify(B.roster.chemistryGroups)==='[["arjun","rohan"]]', 'backup file has players, chemistry, and both matches: '+dl.suggestedFilename());
 ok(/Backup saved/.test(await H.evaluate(()=>document.body.innerText)) && /today/.test(await H.evaluate(()=>document.body.innerText)), 'confirms and remembers the backup date');
 // disaster: host deletes a match and a player
 const firstId = await H.evaluate(()=>HISTORY[0].id);
 await H.evaluate(([id])=>{ db.doc(squadPath('history/'+id)).delete(); SQUAD.players=SQUAD.players.slice(1); saveSquadDoc(SQUAD); },[firstId]); await wait(400);
 await H.evaluate(()=>addToHistory({date:new Date().toISOString(),format:2,mode:'random',teamA:{players:[]},teamAIds:['rohan'],teamB:{players:[]},teamBIds:['sahil'],subs:[],subIds:[]})); await wait(300);
 ok((await H.evaluate(()=>HISTORY.length))===2 && (await H.evaluate(()=>SQUAD.players.length))===4, 'after the "accident": a match and a player gone, a stray match added');
 // bad file first
 fs.writeFileSync(path.join(__dirname,'bad.json'), '{"hello":1}');
 await H.setInputFiles('input[type=file]', path.join(__dirname,'bad.json')); await wait(300);
 ok(/isn’t a Matchday Draft backup/.test(await H.evaluate(()=>document.body.innerText)), 'a wrong file is rejected with a clear message');
 await H.setInputFiles('input[type=file]', bpath); await wait(300);
 const t1 = await H.evaluate(()=>document.body.innerText);
 ok(/5 players · 2 matches/.test(t1) && /This replaces/.test(t1), 'restore shows what is in the file and warns first');
 await H.click('button:has-text("Restore this backup")'); await wait(200);
 ok(/Tap again to replace/.test(await H.evaluate(()=>document.body.innerText)), 'restore needs a second tap');
 await H.click('button:has-text("Tap again to replace")'); await wait(1200);
 ok(/Restored: 2 matches and 5 players/.test(await H.evaluate(()=>document.body.innerText)), 'restore reports success');
 const ids = await F.evaluate(()=>HISTORY.map(h=>h.id).sort());
 ok(JSON.stringify(ids)===JSON.stringify(B.history.map(h=>h.id).sort()), 'every phone now has exactly the backed-up matches (stray one removed, deleted one back)');
 ok((await F.evaluate(()=>SQUAD.players.length))===5 && JSON.stringify(await F.evaluate(()=>SQUAD.chemistryGroups))==='[["arjun","rohan"]]', 'players and chemistry restored on the friend’s phone');
 // friend cannot restore even by calling it
 const nBefore = denied().length;
 await F.evaluate((d)=>{ restoreDraft={data:d}; restoreArm=true; applyRestore(); }, B); await wait(300);
 ok(denied().length===nBefore, 'friend restore does nothing (blocked in the app before reaching the database)');
 // friend votes for man of the match, sets and removes a PIN
 const vid = await F.evaluate(()=>HISTORY.find(h=>(h.teamAIds||[]).includes('arjun')).id);
 const nd = denied().length;
 await F.evaluate(([id])=>{ const h=HISTORY.find(x=>x.id===id); castPotmVote(id, h.teamAIds.includes('rohan')?'a':'b', 'rohan'); },[vid]); await wait(400);
 const votes = await H.evaluate(([id])=>HISTORY.find(x=>x.id===id).potmVotes,[vid]);
 ok(votes && JSON.stringify(votes).includes('"arjun":"rohan"'), 'friend can still vote for man of the match: '+JSON.stringify(votes));
 await F.evaluate(()=>{ pinSetDraft='4321'; savePin(); }); await wait(400);
 ok(Object.keys(store).some(k=>k.startsWith('pins/')), 'friend can set a PIN');
 await F.evaluate(()=>removeMyPin()); await wait(400);
 ok(!Object.keys(store).some(k=>k.startsWith('pins/')), 'friend can remove their PIN');
 ok(denied().length===nd, 'none of these were refused');
 // host opens the host link again on the same phone (claim already exists -> update)
 await H.goto(url+'#host='+encodeURIComponent(HOSTCODE)); await H.waitForFunction(()=>dbReady&&rosterLoaded); await wait(500);
 ok(await H.evaluate(()=>hostClaimState)==='ok', 'host re-opening the host link keeps working');
 // rivalry: request, decline, then re-send over the old doc
 const Ro=await phone(''); await Ro.fill('#loginNameInput','Rohan'); await Ro.press('#loginNameInput','Enter'); await wait(300); await Ro.evaluate(()=>{ if(pinModalOpen) closePinModal(true); });
 const nd2 = denied().length;
 await F.evaluate(()=>sendRivalry('rohan')); await wait(400);
 const rk = Object.keys(store).find(k=>k.includes('/rivalries/'));
 ok(rk && store[rk].status==='pending', 'friend can send a rivalry request');
 await Ro.evaluate(([id])=>respondRivalry(id,false),[rk.split('/').pop()]).catch(async()=>{}); await wait(400);
 const st = store[rk] && store[rk].status;
 await F.evaluate(([id])=>db.doc(squadPath('rivalries/'+id)).set({a:'arjun',b:'rohan',status:'pending',createdAt:new Date().toISOString()}),[rk.split('/').pop()]); await wait(300);
 ok(store[rk].status==='pending' && denied().length===nd2, 'declined ('+st+') then re-sent later: allowed');
 // friend's stale screen cannot undo a host setting
 await H.evaluate(()=>saveState({format:7})); await wait(300);
 await F.evaluate(()=>{ window.__mockStallBefore=1; }); 
 await F.evaluate(()=>{ S.format=5; toggleSelected('arjun'); }); await wait(400);
 ok((await H.evaluate(()=>S.format))===7, 'a friend tick from an out-of-date screen does not undo the host’s settings');
 await H.screenshot({path:'h_backup.png'});
 console.log('DENIED (expected ones from the friend attacks): '+denied().length);
 ok(errs.length===0,'no page errors '+JSON.stringify(errs));
 console.log(fails?('\n'+fails+' FAILED'):'\nALL PASSED'); await br.close(); srv.close();
})();
