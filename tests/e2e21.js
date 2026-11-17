// host's usage numbers (for a resume)
const { chromium, devices } = require('playwright');
const http=require('http'),fs=require('fs'),path=require('path'),cp=require('child_process');
const HOSTCODE=fs.readFileSync(path.join(__dirname,'.hostcode'),'utf8').trim();
const srv=http.createServer((q,r)=>{ if(q.url.startsWith('/sw.js')){r.statusCode=404;return r.end();} r.setHeader('content-type','text/html'); r.end(fs.readFileSync(path.join(__dirname,'site/index.html'))); }).listen(0);
const store={}; const pages=[]; const errs=[]; const wait=ms=>new Promise(r=>setTimeout(r,ms));
let fails=0; const ok=(c,m)=>{ console.log((c?'PASS ':'FAIL ')+m); if(!c) fails++; };
const denied=()=>Object.keys(store).filter(k=>k.startsWith('__denied/')).map(k=>store[k]).filter(d=>!/^(logins|access)\//.test(d.path));
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
 for(const n of ['Arjun','Rohan','Vikram','Sahil','Aditya','Karan']){ await H.evaluate((n)=>addPlayer(n,['MID'],{},false,false),n); await wait(30); }
 const D = n=>new Date(Date.now()-n*864e5).toISOString();
 const mk=(n,a,b,extra)=>Object.assign({date:D(n),format:3,mode:'random',teamA:{players:[]},teamAIds:a,teamB:{players:[]},teamBIds:b,subs:[],subIds:[],winner:'a',scoreA:2,scoreB:1,scorers:[{playerId:a[0],goals:2},{playerId:b[0],goals:1}],assists:[],duration:60}, extra||{});
 await H.evaluate(([l])=>l.forEach(e=>addToHistory(e)), [[
   mk(60, ['arjun','rohan','vikram'], ['sahil','aditya','karan']),
   mk(12, ['arjun','rohan','vikram'], ['sahil','aditya','karan'], {mode:'draft'}),
   mk(5,  ['arjun','rohan','sahil'],  ['vikram','aditya','karan'], {live:true}),
 ]]); await wait(500);
 // turf money on the latest match: ₹1200 between 6, Arjun collects, Rohan paid in cash
 const hid = await H.evaluate(()=>HISTORY[0].id);
 await H.evaluate((hid)=>updateHistoryResult(hid, {fees:{items:[{label:'Turf', amount:1200, paidBy:'_c'}], players:['arjun','rohan','vikram','sahil','aditya','karan'], split:'equal', custom:{}, paid:{rohan:{how:'cash', at:new Date().toISOString()}}, collectorId:'arjun', createdAt:new Date().toISOString(), guestsByHost:true, guestOf:{}}}), hid); await wait(400);
 // a second game: cricket, with Arjun (same person) and Zed, one match yesterday plus an unplayed guest
 await H.evaluate(()=>createSquad('Sunday cricket','cricket')); await wait(800);
 for(const n of ['Arjun','Zed','Moe','Lou']){ await H.evaluate((n)=>addPlayer(n,['FWD'],{},false,false),n); await wait(30); }
 await H.evaluate((m)=>addToHistory(m), Object.assign(mk(1, ['arjun','zed'], ['moe','lou']), {scorers:[{playerId:'arjun',goals:40},{playerId:'moe',goals:22}]})); await wait(500);
 // open the numbers
 ok(!!(await H.$('button:has-text("📈 Numbers")')), 'host has a 📈 Numbers button');
 await H.click('button:has-text("📈 Numbers")'); await wait(1500);
 const st = await H.evaluate(()=>statsData);
 console.log(JSON.stringify(st));
 ok(st && st.games===2, 'counts both games');
 ok(st.people===9 && st.dbPlayers===9, '9 different people (Arjun counted once across football and cricket): '+st.people);
 ok(st.matches===4 && st.results===4 && st.live===1 && st.auctions===1, '4 matches, 1 live-scored, 1 auction');
 ok(st.active30===9, 'everyone played in the last 30 days: '+st.active30);
 ok(st.feeTracked===1200 && st.feeOwed===800 && st.feeCollected===400 && st.feeMatches===1, '₹1,200 tracked, ₹800 still owed (4 × ₹200), ₹400 settled');
 ok(st.weeks===9 && st.perWeek===0.4, 'running 9 weeks, 0.4 matches a week over the last 8 weeks: '+st.weeks+' '+st.perWeek);
 ok(st.avgPlayers===6 - 0 || st.avgPlayers===5, 'average players per match: '+st.avgPlayers);
 ok(st.scored===71, 'goals and runs logged add up: '+st.scored);
 const t = await txt(H);
 ok(/Your numbers/.test(t) && /players have played/.test(t) && /turf costs tracked/.test(t) && /By game/i.test(t) && /Sunday cricket/.test(t), 'the window shows the tiles and a by-game list');
 const lines = await H.evaluate(()=>statsResumeLines(statsData));
 console.log(lines.join('\n'));
 ok(/9 players across 2 sports, 4 matches and ₹1,200 in turf costs tracked since/.test(lines[0]), 'resume line 1 reads well');
 ok(/9 active players/.test(lines[1]) && /4 results \(1 scored live\)/.test(lines[1]), 'resume line 2 reads well');
 ok(await H.evaluate(()=>document.querySelector('.modal').scrollWidth <= document.querySelector('.modal').clientWidth+1), 'fits a phone screen');
 await H.screenshot({path:'h_stats.png'});
 // friends don't get it
 const F = await phone(''); await login(F, 'Rohan');
 ok(!(await F.$('button:has-text("📈 Numbers")')), 'friends don’t see the Numbers button');
 ok(errs.length===0, 'no page errors '+errs.join(' | '));
 ok(denied().length===0, 'no denied writes '+JSON.stringify(denied()));
 console.log(fails? fails+' FAILED':'ALL PASS'); await br.close(); srv.close(); process.exit(fails?1:0);
})();
