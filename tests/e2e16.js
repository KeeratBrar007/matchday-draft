// live score + same poll as last week
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
 async function login(F,name){ await F.fill('#loginNameInput',name); await F.press('#loginNameInput','Enter'); await wait(600); await F.evaluate(()=>{ if(pinModalOpen) closePinModal(true); }); await wait(150); }
 const txt = p=>p.evaluate(()=>document.body.innerText);
 const H=await phone('#host='+HOSTCODE);
 const names=['Arjun','Rohan','Vikram','Sahil','Aditya','Karan'];
 for(const [i,n] of names.entries()){ await H.evaluate(([n,i])=>addPlayer(n,[['GK','DEF','MID','FWD'][i%4]],{},false,false),[n,i]); await wait(40); }
 await H.evaluate(()=>saveState({format:3, selectedIds:SQUAD.players.map(p=>p.id)})); await wait(300);
 await H.evaluate(()=>goToMode()); await wait(200); await H.evaluate(()=>chooseMode('random')); await wait(200); await H.evaluate(()=>confirmRandom()); await wait(500);
 ok(/Start live score/.test(await txt(H)), 'after confirming teams the host can start a live score');
 await H.click('button:has-text("Start live score")'); await wait(400);
 const A=await phone(''); await login(A,'Arjun');
 ok(/LIVE/.test(await txt(A)) && /0\s*:\s*0/.test(await A.$eval('.live-score',e=>e.innerText)), 'friends see LIVE 0 : 0');
 ok(!(await A.$('.live-btn')), 'friends can’t tap the score');
 const tA = await H.evaluate(()=>HISTORY.find(h=>h.id===S.lastHistoryId).teamAIds);
 // goal team A: scorer + assist
 await H.click('.live-grid > div:nth-child(1) .live-btn'); await wait(150);
 ok(/Who scored\?/.test(await txt(H)), 'tapping Goal asks who scored');
 await H.click(`.live-pick button:has-text("${await H.evaluate((id)=>playerName(id), tA[0])}")`); await wait(150);
 ok(/Assist\?/.test(await txt(H)), '...then the assist');
 await H.click(`.live-pick button:has-text("${await H.evaluate((id)=>playerName(id), tA[1])}")`); await wait(400);
 const sA = await A.$eval('.live-score',e=>e.innerText.replace(/\s+/g,''));
 ok(/TeamA1:0TeamB/i.test(sA), 'Arjun’s phone shows 1 : 0 straight away: '+sA);
 ok(new RegExp('⚽ ' + await H.evaluate((id)=>playerName(id), tA[0]) + ' \\(assist').test(await A.$eval('.live-feed',e=>e.innerText)), 'feed shows scorer and assist');
 // goal team B, skip scorer; then undo; then again
 await H.click('.live-grid > div:nth-child(2) .live-btn'); await wait(150); await H.click('button:has-text("Skip")'); await wait(300);
 ok(/1:1/.test(await A.$eval('.live-score .ln',e=>e.innerText.replace(/\s+/g,''))), 'Team B scores (scorer unknown): 1 : 1');
 await H.click('button:has-text("Undo last")'); await wait(300);
 ok(/1:0/.test(await A.$eval('.live-score .ln',e=>e.innerText.replace(/\s+/g,''))), 'undo takes it back off');
 await H.click('.live-grid > div:nth-child(1) .live-btn'); await wait(150); await H.click(`.live-pick button:has-text("${await H.evaluate((id)=>playerName(id), tA[0])}")`); await wait(150); await H.click('button:has-text("No assist")'); await wait(300);
 await A.screenshot({path:'f_live.png'}); await H.screenshot({path:'h_live.png'});
 // full time (two taps)
 await H.click('button:has-text("Full time")'); await wait(150);
 ok(/Tap again to save/.test(await txt(H)), 'full time asks for a second tap');
 await H.click('button:has-text("Tap again to save")'); await wait(500);
 const h = await H.evaluate(()=>HISTORY.find(x=>x.id===S.lastHistoryId));
 ok(h.winner==='a' && h.scoreA===2 && h.scoreB===0 && h.scorers.length===1 && h.scorers[0].goals===2 && h.assists.length===1 && h.duration>=1, 'result saved: Team A 2–0, scorer with 2, one assist, match length: '+JSON.stringify({w:h.winner,a:h.scoreA,b:h.scoreB,s:h.scorers,as:h.assists,d:h.duration}));
 ok(/FULL TIME/.test(await txt(A)), 'friends see FULL TIME');
 await A.evaluate(()=>goLeaderboard()); await wait(200);
 ok(/Golden boot: .* — 2 goals/.test(await txt(A)), 'leaderboard picks up the live goals');
 // ---- cricket live ----
 await H.evaluate(()=>createSquad('Cricket','cricket')); await wait(500);
 for(const n of ['Rohan','Dev','Om','Kabir']){ await H.evaluate((n)=>addPlayer(n,['FWD'],{},false,false),n); await wait(40); }
 await H.evaluate(()=>saveState({format:2, selectedIds:SQUAD.players.map(p=>p.id)})); await wait(300);
 await H.evaluate(()=>goToMode()); await wait(200); await H.evaluate(()=>chooseMode('random')); await wait(200); await H.evaluate(()=>confirmRandom()); await wait(500);
 await H.evaluate(()=>startLive()); await wait(300);
 ok(JSON.stringify(await H.$$eval('.live-grid > div:nth-child(1) .live-btn',e=>e.map(x=>x.innerText)))==='["+1","+2","4","6","Wkt"]', 'cricket buttons: +1 +2 4 6 Wkt');
 await H.click('.live-grid > div:nth-child(1) .live-btn >> nth=2'); await H.click('.live-grid > div:nth-child(1) .live-btn >> nth=3'); await H.click('.live-grid > div:nth-child(1) .live-btn >> nth=4'); await wait(400);
 ok(/10\/1:0\/0/.test(await H.$eval('.live-score .ln',e=>e.innerText.replace(/\s+/g,''))), 'cricket: a four, a six and a wicket = 10/1');
 await H.evaluate(()=>{ liveEndArm=true; liveFullTime(); }); await wait(400);
 const hc = await H.evaluate(()=>HISTORY.find(x=>x.id===S.lastHistoryId));
 ok(hc.scoreA===10 && hc.wktsA===1 && hc.winner==='a', 'cricket result saved as 10/1');
 // ---- basketball +3 asks who ----
 await H.evaluate(()=>createSquad('Hoops','basketball')); await wait(500);
 for(const n of ['Rohan','Dev','Om','Kabir']){ await H.evaluate((n)=>addPlayer(n,['MID'],{},false,false),n); await wait(40); }
 await H.evaluate(()=>saveState({format:2, selectedIds:SQUAD.players.map(p=>p.id)})); await wait(300);
 await H.evaluate(()=>goToMode()); await wait(200); await H.evaluate(()=>chooseMode('random')); await wait(200); await H.evaluate(()=>confirmRandom()); await wait(500);
 await H.evaluate(()=>startLive()); await wait(300);
 await H.click('.live-grid > div:nth-child(2) .live-btn >> nth=2'); await wait(150);
 ok(/Who scored the 3\?/.test(await txt(H)), 'basketball +3 asks who scored the 3');
 await H.click('.live-pick .btn >> nth=0'); await wait(300);
 ok(/0:3/.test(await H.$eval('.live-score .ln',e=>e.innerText.replace(/\s+/g,''))), 'basketball: 0 : 3');
 // ---- same poll as last week ----
 await H.evaluate((id)=>switchSquad(id), await H.evaluate(()=>squadsList.find(s=>(s.sport||'football')==='football').id)); await wait(500);
 await H.evaluate(()=>{ startNewMatch(); }); await wait(300);
 await H.evaluate(()=>{ openPollForm(); togglePollPreset(2); togglePollPreset(3); createPoll(false); }); await wait(400);
 const first = await H.evaluate(()=>S.poll.opts.map(o=>o.label));
 await H.evaluate(()=>{ pollEndArm=true; endPoll(); }); await wait(300);
 const t2 = await txt(H);
 ok(/Same as last week/.test(t2), 'after the poll ends, a "Same as last week" button appears');
 await H.evaluate(()=>{ window.__opened=[]; }); await H.click('button:has-text("Same as last week")'); await wait(500);
 const second = await H.evaluate(()=>S.poll.opts.map(o=>o.label));
 const wk = (a,b)=>{ const pa = a.match(/(\d+)/)[1], pb = b.match(/(\d+)/)[1]; return Number(pb)-Number(pa); };
 ok(second.length===2 && second[0].split(',')[0]===first[0].split(',')[0] && /Morning$/.test(second[0]) && /Evening$/.test(second[1]) && second[0]!==first[0], 'same weekday and times, one week later: '+first.join(' / ')+' → '+second.join(' / '));
 ok(/api\.whatsapp\.com/.test(await H.evaluate(()=>window.__opened[0]||'')), 'and it goes straight to WhatsApp (one tap)');
 ok(errs.length===0,'no page errors '+JSON.stringify(errs));
 console.log(fails?('\n'+fails+' FAILED'):'\nALL PASSED'); await br.close(); srv.close();
})();
