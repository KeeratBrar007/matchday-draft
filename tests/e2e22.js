// demo mode: made-up data, no database, kept apart from real data, two tabs in sync
const { chromium, devices } = require('playwright');
const http=require('http'),fs=require('fs'),path=require('path'),cp=require('child_process');
const HOSTCODE=fs.readFileSync(path.join(__dirname,'.hostcode'),'utf8').trim();
const srv=http.createServer((q,r)=>{ if(q.url.startsWith('/sw.js')){r.statusCode=404;return r.end();} r.setHeader('content-type','text/html'); if(q.url.startsWith('/blank')) return r.end('<!doctype html><title>blank</title>'); r.end(fs.readFileSync(path.join(__dirname,'site/index.html'))); }).listen(0);
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



// a fake Firebase that counts any use at all: the demo must never touch it
const FB_SPY = "window.__fb=0; window.__opened=[]; window.open=(u)=>{ window.__opened.push(u); return null; };"
 + "window.firebase={initializeApp(){window.__fb++;}, firestore(){window.__fb++; throw new Error('firestore used');}, auth(){window.__fb++; throw new Error('auth used');}};";
 // ---- the real app's login screen offers the demo (a friend's phone, with the test database) ----
 const H0 = await phone('#host='+HOSTCODE);
 await H0.evaluate(()=>addPlayer('Real Person',['MID'],{},false,false)); await wait(300);
 const R = await phone('');
 ok(/Log in/.test(await txt(R)) && /Try the demo/.test(await txt(R)), 'login screen has a "Try the demo" button');
 await R.click('button:has-text("Try the demo")'); await wait(900);
 ok(/[?&]demo=1/.test(R.url()) && /🧪 Demo/.test(await txt(R)), 'tapping it opens the demo');
 ok(await R.evaluate(()=>!db), '...without a database');
 const ctx=await br.newContext({...devices['iPhone 13']});
 let netFirebase=0;
 await ctx.route(/gstatic\.com|googleapis\.com/, r=>{ if(/firestore\.googleapis|identitytoolkit|securetoken|firebaseio/.test(r.request().url())) netFirebase++; r.abort(); });
 await ctx.addInitScript(FB_SPY);
 const open = async (q)=>{ const p=await ctx.newPage(); p.on('pageerror',e=>errs.push(String(e))); await p.goto(url+(q||'')); await wait(700); return p; };
 // things a real user of this phone already has saved (written on a plain page of the same site)
 const blank = await ctx.newPage(); await blank.goto(url+'blank');
 await blank.evaluate(()=>{ localStorage.setItem('md_login_name','Real Name'); localStorage.setItem('md_alerts','off'); localStorage.setItem('md_squad','real-game'); });
 // ---- a recruiter opens the demo link ----
 const A = await open('?demo=1');
 const at = await txt(A);
 ok(/🧪 Demo/.test(at) && /Made-up players and matches/.test(at), 'demo banner explains it’s made-up data');
 ok(await A.evaluate(()=>isHost() && !db), 'starts as the host, with no database');
 ok(/12 of 12 spots filled · 1 on the waitlist/.test(at) && /1\. Zoravar/.test(at), 'a confirmed poll with 12 spots and a waitlist');
 ok(await A.evaluate(()=>HISTORY.length)===10 && await A.evaluate(()=>SQUAD.players.length)===14, '14 players and 10 past matches');
 ok(/to collect/.test(at), 'some turf money still to collect');
 ok(!/Playing solo on this device/.test(at), 'no “playing solo” notice in the demo (two tabs do sync)');
 await A.click('.demo-bar button:has-text("What to try")'); await wait(200);
 ok(/Start live score/.test(await A.$eval('.demo-tour',e=>e.innerText)) && await A.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1), '"What to try" lists a short tour and fits the phone');
 await A.screenshot({path:'demo_tour.png'});
 await A.click('.demo-bar button:has-text("Hide tips")'); await wait(150);
 await A.screenshot({path:'demo_home.png'});
 // leaderboard + profile
 await A.evaluate(()=>goLeaderboard()); await wait(300);
 const lb = await txt(A);
 ok(/Player Standings/.test(lb) && /Golden boot|All-time/i.test(lb), 'leaderboard is filled in');
 await A.evaluate(()=>openProfile('kabir')); await wait(300);
 ok(/Kabir/.test(await txt(A)) && /Past matches/i.test(await txt(A)), 'a player profile has past matches');
 await A.evaluate(()=>goHome()); await wait(200);
 // numbers across both demo games
 await A.click('button:has-text("📈 Numbers")'); await wait(800);
 const st = await A.evaluate(()=>statsData);
 ok(st && st.games===2 && st.matches===15 && st.feeTracked>0 && st.feeOwed>0 && st.people===26, '📈 Numbers covers both demo games: '+JSON.stringify(st && {g:st.games,m:st.matches,p:st.people,f:st.feeTracked,o:st.feeOwed}));
 await A.evaluate(()=>toggleStats()); await wait(200);
 // payments
 await A.evaluate(()=>togglePayments()); await wait(300);
 ok(/Still to collect/i.test(await txt(A)) && /demo\.host@example/.test(await txt(A)), 'Payments shows who owes, with the dummy UPI ID');
 await A.evaluate(()=>togglePayments()); await wait(200);
 // WhatsApp shows the message instead of opening WhatsApp
 await A.evaluate(()=>sharePollConfirm()); await wait(300);
 ok(!!(await A.$('#demoWaText')) && /Confirmed/.test(await A.$eval('#demoWaText',e=>e.innerText)) && (await A.evaluate(()=>window.__opened.length))===0, 'WhatsApp buttons show the message in the demo, nothing opens');
 await A.click('.modal button:has-text("Close")'); await wait(200);
 // ---- pick teams, live score, result card ----
 await A.click('button:has-text("Continue to mode")'); await wait(300);
 await A.evaluate(()=>chooseMode('random')); await wait(300);
 await A.evaluate(()=>confirmRandom()); await wait(400);
 ok(/Start live score/.test(await txt(A)), 'teams picked; live score ready');
 await A.click('button:has-text("Start live score")'); await wait(400);
 // a second tab, as a player, sees it live
 const B = await open('?demo=1');
 ok(/LIVE/.test(await txt(B)), 'a second demo tab shows the live match');
 const pid = await B.evaluate(()=>HISTORY.find(h=>h.id===S.lastHistoryId).teamAIds[1]);
 await B.selectOption('#demoAs', pid); await wait(400);
 const bName = await B.evaluate(id=>playerName(id), pid);
 ok(await B.evaluate(()=>!isHost()) && new RegExp('Playing as ' + bName).test(await txt(B)) && !(await B.$('button:has-text("📈 Numbers")')), 'View as a player: tab 2 shows '+bName+'’s phone (no host buttons)');
 ok(await A.evaluate(()=>isHost()), '...while tab 1 is still the host');
 await A.click('.live-grid > div:nth-child(1) .live-btn'); await wait(250);
 await A.click('.live-pick button >> nth=0'); await wait(250);
 await A.click('button:has-text("No assist")'); await wait(700);
 ok(/1:0/.test(await B.$eval('.live-score .ln',e=>e.innerText.replace(/\s+/g,''))), 'the goal tapped in tab 1 shows up in tab 2 straight away');
 await B.screenshot({path:'demo_player_live.png'});
 await A.click('button:has-text("Full time")'); await wait(150); await A.click('button:has-text("Tap again to save")'); await wait(600);
 ok(/FULL TIME/.test(await txt(A)) && await A.evaluate(()=>HISTORY.length)===11, 'full time saves the result into the demo history');
 await A.click('#liveCard button:has-text("Result card")'); await wait(2000);
 ok(!!(await A.$('#resultCardImg')), 'the result card is drawn');
 await A.evaluate(()=>{ resultCardOpen=null; render(); }); await wait(200);
 // ---- reset ----
 await A.click('.demo-bar button:has-text("Reset")'); await A.click('.demo-bar button:has-text("Tap again to reset")'); await wait(600);
 ok(await A.evaluate(()=>S.phase==='setup' && HISTORY.length===10 && !!S.poll && isHost()), 'Reset puts the demo back to the start');
 await wait(400);
 ok(await B.evaluate(()=>HISTORY.length===10 && S.phase==='setup'), '...in the other tab too');
 // ---- captains' auction, with the host bidding for both captains ----
 await A.click('button:has-text("Continue to mode")'); await wait(300);
 await A.evaluate(()=>chooseMode('draft')); await wait(300);
 await A.evaluate(()=>saveState({phase:'captains', captains:{a:'aarav', b:'kabir'}})); await wait(200);
 await A.evaluate(()=>startAuction(100,10,5,0)); await wait(400);
 for(let i=0;i<3;i++){ await A.click('.bid-actions .btn-primary >> nth=0'); await wait(250); await A.click('.bid-actions .btn-danger >> nth=0'); await wait(350); }
 const sold = await A.evaluate(()=>S.auction.log.length);
 ok(sold===3 && !!(await A.$('#soldFlash')), 'the auction runs in the demo: 3 players sold, "joins Team…" message shown');
 await A.screenshot({path:'demo_auction.png'});
 await A.click('.demo-bar button:has-text("Reset")'); await A.click('.demo-bar button:has-text("Tap again to reset")'); await wait(600);
 // ---- cricket ----
 await A.evaluate(()=>switchSquad('demo-cricket')); await wait(400);
 ok(await A.evaluate(()=>document.documentElement.getAttribute('data-sport'))==='cricket' && await A.evaluate(()=>HISTORY.length)===5 && /Weekend Cricket/.test(await txt(A)), 'the cricket game has its own theme and 5 matches');
 await A.evaluate(()=>switchSquad('demo-football')); await wait(300);
 // ---- nothing real was touched ----
 console.log('fb', await A.evaluate(()=>window.__fb), netFirebase);
 ok(await A.evaluate(()=>window.__fb)===0 && netFirebase===0, 'the demo never touched Firebase (no calls, no network)');
 const demoErrs = errs.length;
 await A.click('.demo-bar button:has-text("Exit")'); await wait(800);
 ok(/[?&]demo=0/.test(A.url()) && !/🧪 Demo/.test(await txt(A)), 'Exit leaves the demo');
 await blank.reload();
 const real = await blank.evaluate(()=>({n:localStorage.getItem('md_login_name'), l:localStorage.getItem('md_alerts'), s:localStorage.getItem('md_squad')}));
 ok(real.n==='Real Name' && real.l==='off' && real.s==='real-game', 'this phone’s real login and saved game are untouched: '+JSON.stringify(real));
 const keys = await blank.evaluate(()=>Object.keys(localStorage).sort());
 ok(keys.some(k=>k.startsWith('mddemo_')) && keys.includes('md_login_name'), 'demo data lives under its own names: '+keys.join(','));
 ok(await A.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1), 'no sideways scrolling');
 ok(demoErrs===0, 'no page errors in the demo '+errs.slice(0,3).join(' | '));
 console.log(fails? fails+' FAILED':'ALL PASS'); await br.close(); srv.close(); process.exit(fails?1:0);
})();
