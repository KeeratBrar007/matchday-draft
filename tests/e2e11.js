// multi-sport games
const { chromium, devices } = require('playwright');
const http=require('http'),fs=require('fs'),path=require('path');
const HOSTCODE=fs.readFileSync(path.join(__dirname,'.hostcode'),'utf8').trim();
const srv=http.createServer((q,r)=>{ if(q.url.startsWith('/sw.js')){r.statusCode=404;return r.end();} r.setHeader('content-type','text/html'); r.end(fs.readFileSync(path.join(__dirname,'site/index.html'))); }).listen(0);
const store={}; const pages=[]; const errs=[]; const wait=ms=>new Promise(r=>setTimeout(r,ms));
let fails=0; const ok=(c,m)=>{ console.log((c?'PASS ':'FAIL ')+m); if(!c) fails++; };
const STUB = "window.__opened=[]; window.open=(u)=>{ window.__opened.push(u); return null; };";
(async()=>{
 const br=await chromium.launch(); const url=`http://localhost:${srv.address().port}/`;
 async function phone(hash){ const ctx=await br.newContext({...devices['iPhone 13']}); await ctx.route(/gstatic\.com|googleapis\.com/,r=>r.abort()); const p=await ctx.newPage();
  p.on('pageerror',e=>errs.push(String(e)));
  await p.exposeFunction('__fsRelay',async(pth,json)=>{ if(json===null) delete store[pth]; else store[pth]=JSON.parse(json); for(const q of pages){ if(q!==p) await q.evaluate(([a,b])=>window.__mockApply(a,b),[pth,json]).catch(()=>{}); } });
  await p.addInitScript('window.__mockInit='+JSON.stringify(store)+';'); await p.addInitScript(STUB); await p.addInitScript(fs.readFileSync(path.join(__dirname,'mock2.js'),'utf8')); pages.push(p); await p.goto(url+(hash||'')); await p.evaluate((j)=>window.__mockApplyAll && window.__mockApplyAll(JSON.parse(j)), JSON.stringify(store)).catch(()=>{}); await p.waitForFunction(()=>dbReady&&rosterLoaded); await wait(300); return p; }
 async function login(F,name){ await F.fill('#loginNameInput',name); await F.press('#loginNameInput','Enter'); await wait(700); await F.evaluate(()=>{ if(pinModalOpen) closePinModal(true); }); await wait(150); }
 const txt = p=>p.evaluate(()=>document.body.innerText);
 const H=await phone('#host='+HOSTCODE);
 // football game players
 for(const [i,n] of ['Arjun','Dev','Karan','Sahil','Vikram','Yuvraj'].entries()){ await H.evaluate(([n,i])=>addPlayer(n,[['GK','DEF','MID','FWD'][i%4]],{},false,false),[n,i]); await wait(50); }
 const footballId = await H.evaluate(()=>currentSquadId);
 ok(await H.evaluate(()=>document.documentElement.getAttribute('data-sport'))==='football', 'starts as football');
 // host adds a cricket game from the picker
 await H.click('.game-chip'); await wait(200);
 ok(/Games/.test(await txt(H)) && /Add a game/.test(await txt(H)), 'game button opens the games page with "Add a game"');
 await H.click('text=Add a game'); await wait(150);
 await H.click('.sport-pick button:has-text("Cricket")'); await H.fill('#newGameName','Sunday Cricket'); await H.click('button:has-text("Create")'); await wait(600);
 const cricketId = await H.evaluate(()=>currentSquadId);
 ok(cricketId!==footballId && await H.evaluate(()=>SPORT.key)==='cricket', 'host is now in the new cricket game');
 ok(await H.evaluate(()=>document.documentElement.getAttribute('data-sport'))==='cricket' && (await H.evaluate(()=>getComputedStyle(document.documentElement).getPropertyValue('--amber').trim()))==='#c8312f', 'cricket theme colours applied');
 ok((await H.$eval('.brand .ball',e=>e.innerText))==='🏏', 'cricket icon in the header');
 ok(JSON.stringify(await H.evaluate(()=>FORMATS))==='[6,8,11]' && await H.evaluate(()=>S.format)===8, 'cricket team sizes 6/8/11, default 8');
 for(const [i,n] of ['Rohan','Dev','Aditya','Nikhil','Ishaan','Kabir'].entries()){ await H.evaluate(([n,i])=>addPlayer(n,[['FWD','DEF','MID','GK'][i%4]],{},false,false),[n,i]); await wait(50); }
 const badges = await H.evaluate(()=>[...new Set(SQUAD.players.map(p=>positionsOf(p.id).map(x=>POSITIONS[x].label).join('')))]);
 ok(['BAT','BOWL','AR','WK'].every(b=>badges.includes(b)), 'cricket positions: '+badges.join(', '));
 ok(await H.evaluate(()=>ATTRIBUTE_ORDER.includes('batting') && ATTRIBUTE_ORDER.includes('spin')), 'cricket skills (batting, spin…)');
 // basketball game
 await H.evaluate(()=>{ openGamePicker(); openNewGame(); newGameDraft.sport='basketball'; createSquad('Hoops', 'basketball'); }); await wait(600);
 const bballId = await H.evaluate(()=>currentSquadId);
 ok(await H.evaluate(()=>SPORT.key)==='basketball' && JSON.stringify(await H.evaluate(()=>FORMATS))==='[3,4,5]' && JSON.stringify(await H.evaluate(()=>POSITION_ORDER.map(k=>POSITIONS[k].label)))==='["G","F","C"]', 'basketball: 3/4/5 and G/F/C positions');
 for(const n of ['Dev','Kabir','Arjun','Rohan','Yash','Om']){ await H.evaluate((n)=>addPlayer(n,['MID'],{},false,false),n); await wait(50); }

 // ---- friends ----
 const R = await phone(''); await login(R,'Rohan');   // in cricket + basketball, not football (the default)
 ok(await R.evaluate(()=>!loginRequired()), 'Rohan (not in the default football game) can log in');
 ok(/Pick a game/.test(await txt(R)), 'two games for Rohan: he gets "Pick a game"');
 const cards = await R.$$eval('.game-card',e=>e.map(x=>x.innerText.replace(/\s+/g,' ')));
 ok(cards.length===2 && /Sunday Cricket/.test(cards.join('|')) && /Hoops/.test(cards.join('|')) && !/My Squad|Football/.test(cards.join('|')), 'picker shows only the 2 games Rohan is on (football is hidden): '+cards.join(' | '));
 await R.screenshot({path:'f_picker.png'});
 await R.click('.game-card.cricket'); await wait(500);
 ok(await R.evaluate(()=>SPORT.key)==='cricket' && await R.evaluate(()=>getMyPlayerId())==='rohan', 'Rohan picks cricket and is himself there');
 const A = await phone(''); await login(A,'Arjun');   // football + basketball
 await A.click('.game-card.football'); await wait(400);
 ok(await A.evaluate(()=>SPORT.key)==='football', 'Arjun picks football');
 const K = await phone(''); await login(K,'Karan');   // football only -> straight in
 ok(await K.evaluate(()=>SPORT.key)==='football' && !/Pick a game/.test(await txt(K)), 'Karan is only on football: goes straight in, no picker');
 ok(!(await K.$('.game-chip')), 'Karan (one game) has no game button at all');
 ok(!/Cricket|Hoops|Basketball/.test(await txt(K)), 'Karan never sees the other games’ names');
 // per-person: host switching doesn't move friends
 await H.evaluate((id)=>switchSquad(id), footballId); await wait(400);
 ok(await R.evaluate(()=>SPORT.key)==='cricket', 'host switching games does not move anyone else');
 // friend viewing a game they are not on
 await K.evaluate((id)=>switchSquad(id), cricketId); await wait(500);
 ok(await K.evaluate(()=>SPORT.key)==='football' && !/Sunday Cricket|Rohan/.test(await txt(K)), 'Karan forced onto cricket (e.g. an old link) is moved straight back to football, cricket never shown');
 await K.evaluate((id)=>switchSquad(id), footballId); await wait(300);

 // ---- a cricket match with full stats ----
 await H.evaluate((id)=>switchSquad(id), cricketId); await wait(500);
 await H.evaluate(()=>{ saveState({format:3, selectedIds:SQUAD.players.map(p=>p.id)}); }); await wait(300);
 await H.evaluate(()=>{ goToMode(); }); await wait(300); await H.evaluate(()=>chooseMode('random')); await wait(300); await H.evaluate(()=>confirmRandom()); await wait(600);
 const ht = await txt(H);
 ok(/Runs — Team A/i.test(ht) && /Wickets — A/i.test(ht) && /Overs per side/i.test(ht) && /Tie/.test(ht), 'cricket result form: runs, wickets, overs, Tie');
 ok((await H.$$eval('.ps-table th',e=>e.map(x=>x.textContent).join(',')))==='Player,Runs,Balls,Wkts,Catches', 'per-player sheet: Runs, Balls, Wkts, Catches');
 const tA = await H.evaluate(()=>getCompleteTeamIds().teamAIds), tB = await H.evaluate(()=>getCompleteTeamIds().teamBIds);
 await H.evaluate(([a,b])=>{
   resultDraft.winner='a'; resultDraft.scoreA='96'; resultDraft.wktsA='4'; resultDraft.scoreB='88'; resultDraft.wktsB='9'; resultDraft.duration='10';
   setPS('result', a[0], 's1', 52); setPS('result', a[0], 'b', 30); setPS('result', a[0], 'c', 1);
   setPS('result', b[0], 's2', 3); setPS('result', b[1], 's1', 20); setPS('result', b[1], 'b', 18);
   saveMatchResult();
 },[tA,tB]); await wait(500);
 const h = await H.evaluate(()=>HISTORY[0]);
 ok(h.scoreA===96 && h.wktsA===4 && h.wktsB===9 && h.scorers.some(x=>x.goals===52) && h.assists.some(x=>x.assists===3) && h.pstats[tA[0]].b===30 && h.pstats[tA[0]].c===1, 'saved: 96/4 vs 88/9, runs, wickets, balls, catches');
 await H.evaluate(()=>goLeaderboard()); await wait(300);
 const lb = await txt(H);
 ok(/Orange cap: .* — 52 runs/.test(lb) && /Purple cap: .* — 3 wickets/.test(lb), 'leaderboard: Orange cap (runs) and Purple cap (wickets)');
 ok(/🏏/.test(await H.$eval('.stand-row.head',e=>e.innerText)), 'leaderboard columns use cricket icons');
 await H.evaluate((id)=>openProfile(id), tA[0]); await wait(300);
 const pf = await txt(H);
 ok(/RUNS/i.test(pf) && /WICKETS/i.test(pf) && /HIGHEST SCORE/i.test(pf) && /STRIKE RATE/i.test(pf) && /173/.test(pf), 'profile: runs, wickets, highest score, strike rate (52 off 30 = 173)');
 ok(/Team A 96\/4 – 88\/9 Team B/.test(pf) && /🏏 52 \(30\) runs/.test(pf) && /🧤 1 catch/.test(pf), 'past match line in cricket words');
 await H.screenshot({path:'h_cricket_profile.png', fullPage:true});
 await R.evaluate(()=>goLeaderboard()); await wait(300); await R.screenshot({path:'f_cricket_lb.png', fullPage:true});
 await H.evaluate(()=>{ document.documentElement.setAttribute('data-theme','dark'); closeProfile(); goLeaderboard(); }); await wait(300); await H.screenshot({path:'h_cricket_dark.png'}); await H.evaluate(()=>{ document.documentElement.setAttribute('data-theme','light'); goHome(); });

 // ---- basketball: log a match played outside the app ----
 await H.evaluate((id)=>switchSquad(id), bballId); await wait(500);
 await H.evaluate(()=>{ toggleLogMatch(); const ids=SQUAD.players.map(p=>p.id); ids.slice(0,3).forEach(id=>logToggleTeam(id,'a')); ids.slice(3,6).forEach(id=>logToggleTeam(id,'b')); logSetWinner('b'); logDraft.scoreA='41'; logDraft.scoreB='50';
   setPS('log', ids[3], 's1', 22); setPS('log', ids[3], 's2', 9); setPS('log', ids[3], 'ast', 5); }); await wait(200);
 ok((await H.$$eval('.ps-table th',e=>e.map(x=>x.textContent).join(',')))==='Player,Pts,Reb,Ast', 'basketball sheet: Pts, Reb, Ast');
 await H.evaluate(()=>saveLoggedMatch()); await wait(500);
 await H.evaluate(()=>goLeaderboard()); await wait(300);
 const bl = await txt(H);
 ok(/Top scorer: .* — 22 points/.test(bl) && /Board king: .* — 9 rebounds/.test(bl), 'basketball leaderboard: Top scorer and Board king');
 await H.screenshot({path:'h_bball_lb.png', fullPage:true});
 // ---- pickleball ----
 await H.evaluate(()=>{ openGamePicker(); openNewGame(); }); await wait(150);
 ok((await H.$$eval('.sport-pick button',e=>e.map(x=>x.innerText.replace(/\s+/g,' ')))).join('|').includes('Pickleball'), 'Pickleball is offered when adding a game');
 await H.click('.sport-pick button:has-text("Pickleball")'); await H.fill('#newGameName','Pickle crew'); await H.click('button:has-text("Create")'); await wait(600);
 ok(await H.evaluate(()=>SPORT.key)==='pickleball' && (await H.evaluate(()=>getComputedStyle(document.documentElement).getPropertyValue('--amber').trim()))==='#0f9d8a' && (await H.$eval('.brand .ball',e=>e.innerText))==='🏓', 'pickleball theme (teal) and 🏓');
 ok(JSON.stringify(await H.evaluate(()=>FORMATS))==='[1,2]' && await H.evaluate(()=>S.format)===2 && JSON.stringify(await H.evaluate(()=>POSITION_ORDER.map(k=>POSITIONS[k].label)))==='["ALL","NET","PWR"]', 'pickleball: singles/doubles (default doubles), All-court / Net / Power styles');
 for(const n of ['Dev','Kabir','Arjun','Rohan']){ await H.evaluate((n)=>addPlayer(n,['MID'],{},false,false),n); await wait(40); }
 await H.evaluate(()=>{ toggleLogMatch(); const ids=SQUAD.players.map(p=>p.id); ids.slice(0,2).forEach(id=>logToggleTeam(id,'a')); ids.slice(2,4).forEach(id=>logToggleTeam(id,'b')); logSetWinner('a'); logDraft.scoreA='11'; logDraft.scoreB='7'; setPS('log', ids[0], 's1', 4); setPS('log', ids[0], 's2', 6); }); await wait(200);
 ok((await H.$$eval('.ps-table th',e=>e.map(x=>x.textContent).join(',')))==='Player,Aces,Winners', 'pickleball sheet: Aces, Winners');
 await H.evaluate(()=>saveLoggedMatch()); await wait(400); await H.evaluate(()=>goLeaderboard()); await wait(300);
 ok(/Ace machine: .* — 4 aces/.test(await txt(H)) && /Shot maker: .* — 6 winners/.test(await txt(H)), 'pickleball awards: Ace machine, Shot maker');
 await H.screenshot({path:'h_pickle_lb.png'});
 // ---- football unchanged ----
 await H.evaluate((id)=>switchSquad(id), footballId); await wait(400);
 ok(await H.evaluate(()=>SPORT.key)==='football' && JSON.stringify(await H.evaluate(()=>POSITION_ORDER.map(k=>POSITIONS[k].label)))==='["GK","DEF","MID","FWD"]' && (await H.$eval('.brand .ball',e=>e.innerText))==='⚽', 'back in football: GK/DEF/MID/FWD and ⚽');
 ok(await H.evaluate(()=>HISTORY.length)===0, 'each game keeps its own history (football has none)');
 // ---- poll link carries the game ----
 await H.evaluate((id)=>switchSquad(id), cricketId); await wait(400);
 await H.evaluate(()=>{ startNewMatch(); }); await wait(300);
 await H.evaluate(()=>{ openPollForm(); togglePollDraftOpt('Sun 7am'); createPoll(true); }); await wait(400);
 const msg = decodeURIComponent((await H.evaluate(()=>window.__opened.slice(-1)[0])).split('text=')[1]);
 ok(/🏏 \*Who’s in for cricket\?\*/.test(msg) && new RegExp('\\?g='+cricketId+'&poll=').test(msg), 'cricket poll message: cricket wording and the game in the link');
 const yesLink = msg.split('\n').find(l=>/vote=o1/.test(l)).replace('https://keeratbrar007.github.io/matchday-draft/', url);
 const D = await phone(yesLink.replace(url,''));    // Dev, logged out, phone was never on cricket
 await login(D,'Dev'); await wait(900);
 ok(await D.evaluate(()=>SPORT.key)==='cricket', 'the poll link opens the right game');
 ok((await H.evaluate(()=>S.selectedIds)).includes('dev'), 'Dev’s Yes from the link ticked him in for the cricket match');
 console.log('DENIED '+JSON.stringify(Object.keys(store).filter(k=>k.startsWith('__denied/')).map(k=>store[k])));
 ok(errs.length===0,'no page errors '+JSON.stringify(errs));
 console.log(fails?('\n'+fails+' FAILED'):'\nALL PASSED'); await br.close(); srv.close();
})();
