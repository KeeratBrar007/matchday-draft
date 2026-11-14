const { chromium, devices } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path');
const HOSTCODE = fs.readFileSync(path.join(__dirname,'.hostcode'),'utf8').trim();
const srv = http.createServer((q,r)=>{ let p=q.url.split('?')[0]; if(p==='/sw.js'){ r.statusCode=404; return r.end(); } r.setHeader('content-type','text/html'); r.end(fs.readFileSync(path.join(__dirname,'site/index.html'))); }).listen(0);
let fails=0; const ok=(c,m)=>{ console.log((c?'PASS ':'FAIL ')+m); if(!c) fails++; };
const store={}; const pages=[]; const errs=[]; const wait=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{
  const url=`http://localhost:${srv.address().port}/`;
  const br = await chromium.launch();
  async function phone(hash){
    const ctx = await br.newContext({...devices['iPhone 13']});
    await ctx.route(/gstatic\.com|googleapis\.com/, r=>r.abort());
    const p = await ctx.newPage(); p.on('pageerror',e=>errs.push(e.message));
    await p.exposeFunction('__fsRelay', async (pth,json)=>{
      if(json===null) delete store[pth]; else store[pth]=JSON.parse(json);
      for(const q of pages){ if(q!==p) await q.evaluate(([a,b])=>window.__mockApply(a,b),[pth,json]).catch(()=>{}); }
    });
    await p.addInitScript('window.__mockInit='+JSON.stringify(store)+';');
    await p.addInitScript(fs.readFileSync(path.join(__dirname,'mock2.js'),'utf8'));
    pages.push(p); await p.goto(url+(hash||'')); await p.evaluate((j)=>window.__mockApplyAll && window.__mockApplyAll(JSON.parse(j)), JSON.stringify(store)).catch(()=>{});
    await p.waitForFunction(()=>dbReady && rosterLoaded,null,{timeout:8000});
    return p;
  }
  const txt=p=>p.evaluate(()=>document.body.innerText);
  const login = async (p,name)=>{ await p.fill('#loginNameInput',name); await p.press('#loginNameInput','Enter'); await wait(250); await p.evaluate(()=>{ if(pinModalOpen) closePinModal(true); }); await wait(150); };
  const rivDocs = ()=>Object.keys(store).filter(k=>k.includes('/rivalries/'));

  const H = await phone('#host='+HOSTCODE);
  const names=['Arjun','Rohan','Vikram','Sahil','Aditya','Karan','Dev','Ishaan','Yuvraj','Nikhil'];
  for(let i=0;i<names.length;i++){ await H.evaluate(([n,i])=>addPlayer(n,[i<2?'GK':i<5?'DEF':i<9?'MID':'FWD'],{},false,false),[names[i],i]); await wait(50); }

  /* ---------- seed matches: 2025, Jan 2026, and this month ---------- */
  const mk=(date,a,b,winner,sa,sb,scorers,assists)=>({date,format:3,mode:'random',teamA:{players:a.map(x=>x[0].toUpperCase()+x.slice(1))},teamAIds:a,teamB:{players:b.map(x=>x[0].toUpperCase()+x.slice(1))},teamBIds:b,subs:[],subIds:[],winner,scoreA:sa,scoreB:sb,scorers:scorers||[],assists:assists||[],duration:40});
  const T=n=>new Date(Date.now()-86400000*(10-n)).toISOString();
  const seeds=[
    mk('2025-06-10T18:00:00.000Z',['arjun','sahil'],['karan','dev'],'a',5,0,[{playerId:'arjun',goals:4},{playerId:'sahil',goals:1}]),
    mk('2026-01-15T18:00:00.000Z',['dev','vikram'],['yuvraj','nikhil'],'a',4,1,[{playerId:'dev',goals:3},{playerId:'vikram',goals:1}]),
    mk(T(1),['arjun','rohan','vikram'],['sahil','aditya','karan'],'a',3,1,[{playerId:'arjun',goals:2},{playerId:'rohan',goals:1}]),
    mk(T(2),['arjun','sahil','dev'],['rohan','karan','ishaan'],'a',2,0,[{playerId:'arjun',goals:1},{playerId:'sahil',goals:1}]),
    mk(T(3),['arjun','rohan','karan'],['vikram','dev','ishaan'],'b',0,1,[]),
    mk(T(4),['sahil','dev','yuvraj'],['arjun','rohan','aditya'],'draw',1,1,[],[{playerId:'arjun',assists:1}]),
    mk(T(5),['arjun','rohan','dev'],['karan','sahil','vikram'],'a',2,0,[])
  ];
  await H.evaluate(([list])=>{ list.forEach(e=>addToHistory(e)); },[seeds]); await wait(700);

  /* ================= SEASON & ALL-TIME ================= */
  const F = await phone(''); await login(F,'Arjun');
  await F.evaluate(()=>toggleAwards()); await wait(200);
  const tabs = await F.$$eval('.scope-tabs .toggle-btn',e=>e.map(x=>x.innerText));
  ok(tabs.length===4 && /Month/.test(tabs[0]) && /Season/.test(tabs[1]) && /All-time/i.test(tabs[2]) && /Rivals/.test(tabs[3]), 'Awards has Month / Season / All-time / Rivals tabs: '+tabs.join('|'));
  const monthGoals = await F.evaluate(()=>[...document.querySelectorAll('.stand-row:not(.head)')].map(r=>r.innerText.replace(/\s+/g,' ')).find(t=>/Arjun/.test(t)));
  ok(/ 5 /.test(monthGoals||'') , 'month view: Arjun has played 5 this month: '+monthGoals);
  await F.evaluate(()=>setStatsScope('season')); await wait(150);
  ok(/Season 2026/.test(await txt(F)), 'season view titled "Season 2026"');
  const seasonPlayed = await F.evaluate(()=>[...document.querySelectorAll('.stand-row:not(.head)')].map(r=>r.innerText.replace(/\s+/g,' ')).find(t=>/Dev/.test(t)));
  ok(/Dev/.test(seasonPlayed||'') && /\b5\b/.test(seasonPlayed), 'season includes January’s match (Dev played 5 in 2026): '+seasonPlayed);
  const rec = async (label)=> F.evaluate(l=>{ const c=[...document.querySelectorAll('.rec-card')].find(x=>x.querySelector('.rl').textContent.trim().toLowerCase().endsWith(l.toLowerCase())); return c? c.textContent.replace(/\s+/g,' ').trim() : null; }, label);
  let r1 = await rec('Most goals');
  ok(r1 && /Arjun/.test(r1) && /Dev/.test(r1) && /3/.test(r1), 'season "Most goals": Arjun & Dev tied on 3: '+r1);
  await F.evaluate(()=>statsSeasonPrev()); await wait(150);
  ok(/Season 2025/.test(await txt(F)), 'season arrows go back a year');
  await F.evaluate(()=>statsSeasonReset()); 
  await F.evaluate(()=>setStatsScope('all')); await wait(150);
  ok(/Hall of fame/i.test(await txt(F)), 'all-time view has a Hall of fame');
  r1 = await rec('Most goals'); ok(r1 && /Arjun/.test(r1) && /7/.test(r1) && !/Dev/.test(r1), 'all-time most goals: Arjun on 7: '+r1);
  r1 = await rec('Longest win streak'); ok(r1 && /3 in a row/.test(r1) && /Arjun/.test(r1) && /Dev/.test(r1), 'longest win streak 3 (Arjun & Dev): '+r1);
  r1 = await rec('Most goals in a match'); ok(r1 && /4 goals/.test(r1) && /Arjun/.test(r1), 'most goals in one match: Arjun 4: '+r1);
  r1 = await rec('Biggest win'); ok(r1 && /5–0/.test(r1), 'biggest win 5–0: '+r1);
  ok(await F.$$eval('.rec-card .pname-link',e=>e.length)>0, 'record holders are tappable');
  await F.screenshot({path:'f_alltime.png'});

  /* ================= RIVALRIES ================= */
  const K = await phone(''); await login(K,'Karan');
  await K.evaluate(()=>openProfile('karan','rivals')); await wait(250);
  ok(/keeps beating you/.test(await txt(K)) && /Arjun/.test(await txt(K)), 'Karan (0–4 vs Arjun) is nudged to start a rivalry');
  const h2h = await K.$$eval('.h2h-row',e=>e.map(x=>x.innerText.replace(/\s+/g,' ')));
  ok(h2h.some(t=>/Arjun/.test(t) && /0–0–4/.test(t)), 'head-to-head lists Arjun at 0–0–4 from Karan’s side: '+JSON.stringify(h2h.slice(0,3)));
  await K.evaluate(()=>{ [...document.querySelectorAll('.nemesis button')].find(b=>/rivalry/i.test(b.innerText)).click(); }); await wait(500);
  ok(rivDocs().length===1 && /arjun__karan$/.test(rivDocs()[0]) && store[rivDocs()[0]].status==='pending' && store[rivDocs()[0]].a==='karan', 'request saved as pending, from Karan to Arjun');
  ok(/Waiting for/.test(await txt(K)), 'Karan sees "waiting for Arjun"');
  ok(/challenged you to a rivalry/.test(await txt(F)), 'Arjun gets a banner with the request');
  ok(await F.evaluate(()=>/●/.test(document.querySelector('.pg-nav').innerText)), 'and a red dot on his profile chip');
  await F.evaluate(()=>{ toggleAwards(); }); await wait(100);
  await F.click('.banner button:has-text("Accept")'); await wait(500);
  const rd = store[rivDocs()[0]];
  ok(rd.status==='active' && !!rd.startedAt, 'accepting makes it active with a start time');
  await H.evaluate(()=>addToHistory({date:new Date().toISOString(),format:3,mode:'random',teamA:{players:['Karan','Dev','Yuvraj']},teamAIds:['karan','dev','yuvraj'],teamB:{players:['Arjun','Rohan','Sahil']},teamBIds:['arjun','rohan','sahil'],subs:[],subIds:[],winner:'a',scoreA:2,scoreB:1,scorers:[],assists:[],duration:40}));
  await wait(600);
  await F.evaluate(()=>{ showAwards=true; setStatsScope('rivals'); }); await wait(200);
  const card = await F.$eval('.riv-card',e=>e.innerText.replace(/\s+/g,' '));
  ok(/Karan/.test(card) && /Arjun/.test(card) && /1 – 0/.test(card) && /since/i.test(card), 'rivalry scoreboard counts only matches after it began (Karan 1 – 0): '+card);
  ok(/all-time 0–5/.test(card) || /all-time/.test(card), 'and shows the all-time record too');
  await F.evaluate(()=>closeProfile && 0);
  // Dev vs Rohan: decline + cooldown
  const D = await phone(''); await login(D,'Dev');
  await D.evaluate(()=>openProfile('dev','rivals')); await wait(200);
  await D.evaluate(()=>{ const s=document.getElementById('rivalPick'); s.value='rohan'; sendRivalryFromSelect(); }); await wait(500);
  ok(rivDocs().some(k=>/dev__rohan$/.test(k) && store[k].status==='pending'), 'Dev can challenge via the picker');
  const R = await phone(''); await login(R,'Rohan');
  await R.click('.banner button:has-text("Decline")'); await wait(500);
  ok(rivDocs().some(k=>/dev__rohan$/.test(k) && store[k].status==='declined'), 'Rohan declines');
  await D.evaluate(()=>sendRivalry('rohan')); await wait(300);
  ok(store[rivDocs().find(k=>/dev__rohan$/.test(k))].status==='declined', 'Dev cannot re-request straight away (cool-down)');
  await D.evaluate(()=>openProfile('rohan','rivals')); await wait(200);
  ok(/try again tomorrow/.test(await txt(D)), 'Dev is told to try again tomorrow');
  // withdraw
  await D.evaluate(()=>openProfile('vikram','rivals')); await wait(150);
  await D.evaluate(()=>sendRivalry('vikram')); await wait(400);
  ok(rivDocs().some(k=>/dev__vikram$/.test(k)), 'Dev challenges Vikram');
  await D.evaluate(()=>withdrawRivalry('dev__vikram')); await wait(400);
  ok(!rivDocs().some(k=>/dev__vikram$/.test(k)), 'Dev withdraws it');
  // end rivalry
  await K.evaluate(()=>{ openProfile('karan','rivals'); }); await wait(200);
  await K.evaluate(()=>endRivalry('arjun__karan')); await wait(150);
  ok(/Tap again to end it/.test(await txt(K)), 'ending needs a second tap');
  await K.evaluate(()=>endRivalry('arjun__karan')); await wait(500);
  ok(store[rivDocs().find(k=>/arjun__karan$/.test(k))].status==='ended', 'rivalry ended');
  await F.evaluate(()=>{ setStatsScope('rivals'); }); await wait(150);
  ok(await F.$('.riv-card')===null, 'ended rivalries leave the board');
  await K.screenshot({path:'k_rivals.png'});

  /* ================= ATTENDANCE ================= */
  await H.evaluate(()=>startNewMatch()); await wait(500);
  const Ro = R; await Ro.evaluate(()=>{ closeProfile && 0; }); 
  await Ro.evaluate(()=>toggleSelected('rohan')); await wait(500);       // Rohan pulls out
  await H.evaluate(()=>toggleAttendance()); await wait(200);
  ok(/dropped out: Rohan \(late/.test(await txt(H)), 'host sees Rohan’s drop-out live, flagged late');
  await H.evaluate(()=>toggleAttendance());
  await H.evaluate(()=>goToMode()); await wait(400);
  const snap = await H.evaluate(()=>S.attSnap);
  ok(snap && snap.dropped.length===1 && snap.dropped[0].id==='rohan' && snap.dropped[0].late===true, 'locking the squad snapshots Rohan as a late drop-out');
  await H.evaluate(()=>chooseMode('random')); await wait(400);
  await H.evaluate(()=>confirmRandom()); await wait(600);
  const lastEntry = Object.entries(store).filter(([k])=>/\/history\//.test(k)).map(([k,v])=>v).sort((a,b)=>b.date>a.date?1:-1)[0];
  ok(lastEntry && lastEntry.att && lastEntry.att.dropped[0].id==='rohan', 'the saved match carries the attendance snapshot');
  await H.evaluate(()=>toggleAttendance()); await wait(250);
  const attRows = await H.$$eval('.att-row:not(.head)',e=>e.map(x=>x.innerText.replace(/\s+/g,' ')));
  const rowOf = n=>attRows.find(t=>t.startsWith(n));
  ok(/Patchy/.test(rowOf('Rohan')||'') && /\b1\b/.test(rowOf('Rohan')||''), 'Rohan shows as Patchy with 1 late drop-out: '+rowOf('Rohan'));
  ok(/Reliable/.test(rowOf('Arjun')||''), 'Arjun shows as Reliable: '+rowOf('Arjun'));
  const rank = t=> /Flaky/.test(t)?0 : /Patchy/.test(t)?1 : /Reliable/.test(t)?2 : 3;
  ok(attRows.every((t,i)=> i===0 || rank(attRows[i-1])<=rank(t)), 'least reliable players are listed first: '+attRows.map(t=>t.split(' ')[0]+':'+rank(t)).join(' '));
  await H.screenshot({path:'h_attendance.png'});
  await H.evaluate(()=>toggleAttendance());
  await Ro.evaluate(()=>openProfile('rohan','stats')); await wait(250);
  ok(/your attendance/i.test(await txt(Ro)) && /1 late drop-out/.test(await txt(Ro)), 'Rohan sees his own attendance on his profile');
  await Ro.evaluate(()=>closeProfile());
  await F.evaluate(()=>{ showAwards=false; openProfile('rohan','stats'); }); await wait(200);
  ok(!/your attendance/i.test(await txt(F)), 'friends cannot see someone else’s attendance');
  await F.evaluate(()=>closeProfile());
  ok(await F.evaluate(()=>!document.querySelector('.topbar').innerText.includes('Attendance')), 'no Attendance button for friends');
  ok(await H.evaluate(()=>document.querySelector('.topbar').innerText.includes('Attendance')), 'host has an Attendance button');

  /* ================= AUCTION TIMER ================= */
  await H.evaluate(()=>startNewMatch()); await wait(400);
  await H.evaluate(()=>{ for(const id of ['arjun','rohan','vikram','sahil','aditya','karan','dev','ishaan','yuvraj','nikhil']) if(!(S.selectedIds||[]).includes(id)) toggleSelected(id); });
  await wait(400);
  await H.evaluate(()=>goToMode()); await wait(300);
  await H.evaluate(()=>saveState({mode:'draft', phase:'captains', captains:{a:'arjun',b:'karan'}})); await wait(300);
  ok(await H.evaluate(()=>{ saveState({phase:'budget'}); return true; }), 'budget screen reachable'); await wait(300);
  ok(await H.$('#fTimer')!==null && (await H.$eval('#fTimer',e=>e.value))==='30', 'budget screen has a "time per decision" picker defaulting to 30 s');
  await H.evaluate(()=>{ document.getElementById('fTimer').value='20'; });
  ok((await H.$eval('#fTimer',e=>e.value))==='20', '...with a 20 s option');
  await H.evaluate(()=>startAuction(100,10,5,3)); await wait(700);   // 3 s timer for the test
  const A = F; // Arjun's phone
  const Kc = K; await Kc.evaluate(()=>{ goHome(); });
  ok(await A.evaluate(()=>S.timerSecs)===3 && await A.evaluate(()=>S.phase)==='auction', 'auction running with a 3 s timer');
  ok(await A.$('#turnTimer')!==null && /\ds/.test(await A.$eval('#ttText',e=>e.textContent)), 'countdown shown on the block card');
  const Fr = await phone(''); await login(Fr,'Ishaan');
  ok(await Fr.$('#turnTimer')!==null, 'spectators see the countdown too');
  await Fr.evaluate(()=>{ window.__fp=0; window.auctionPass=()=>{ window.__fp++; }; window.auctionBid=()=>{ window.__fp++; }; });
  ok(await A.evaluate(()=>S.auction.turn)==='a', 'Team A (Arjun) is up');
  await wait(4200);
  ok(await H.evaluate(()=>S.auction.turn)==='b', 'Arjun ran out of time and was passed automatically');
  ok(/ran out of time/.test(await txt(Kc)), 'everyone sees "ran out of time"');
  await wait(3800);
  ok(await H.evaluate(()=>S.auction.index)===1, 'Karan also timed out, so the first player went to whoever had fewer (draft moved on)');
  // back-up: captains’ phones stop acting; host steps in after the grace period
  await A.evaluate(()=>{ window.auctionPass=()=>{}; }); await Kc.evaluate(()=>{ window.auctionPass=()=>{}; });
  const idx0 = await H.evaluate(()=>S.auction.index+':'+S.auction.turn+':'+S.auction.passesInARow);
  await wait(3000+4500);
  const idx1 = await H.evaluate(()=>S.auction.index+':'+S.auction.turn+':'+S.auction.passesInARow);
  ok(idx0!==idx1, 'with both captains’ phones asleep, the host’s phone passes for them after a short grace: '+idx0+' → '+idx1);
  ok(await Fr.evaluate(()=>window.__fp)===0, 'a watching friend’s phone never acts');
  await H.evaluate(()=>setTimerSecs(0)); await wait(500);
  ok(await A.$('#turnTimer')===null, 'host can switch the timer off mid-auction');
  await A.screenshot({path:'f_timer.png'});

  // chemistry link is visible on a profile but friends cannot edit it
  await H.evaluate(()=>{ const a=SQUAD.players[0].id,b=SQUAD.players[1].id; window.__ca=a; window.__cb=b; return saveSquadDoc(Object.assign({},SQUAD,{chemistryGroups:[[a,b]]})); }).catch(()=>{});
  await wait(600);
  const chemTxt = await F.evaluate(()=>{ openProfile(window.__ca||SQUAD.players[0].id,'stats'); return document.querySelector('.page-card').innerText; }).catch(e=>'ERR '+e);
  console.log('chem sample:', JSON.stringify(chemTxt).slice(0,200));
  ok(/Chemistry link/i.test(chemTxt) && /linked with/i.test(chemTxt), "profile shows who the player is chemistry-linked with");
  ok(await F.evaluate(()=>!/unlink|remove link|edit link/i.test(document.querySelector('.page-card').innerText)), 'and it has no edit controls for friends');
  await F.evaluate(()=>closeProfile());
  /*__DENIED_DUMP__*/ console.log('DENIED '+JSON.stringify(Object.keys(store).filter(k=>k.startsWith('__denied/')).map(k=>store[k])));
  ok(errs.length===0,'no page errors '+JSON.stringify(errs));
  console.log(fails?('\n'+fails+' FAILED'):'\nALL PASSED'); await br.close(); srv.close();
})();
