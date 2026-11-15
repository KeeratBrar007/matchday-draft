// "who's in?" polls
const { chromium, devices } = require('playwright');
const http=require('http'),fs=require('fs'),path=require('path');
const HOSTCODE=fs.readFileSync(path.join(__dirname,'.hostcode'),'utf8').trim();
const srv=http.createServer((q,r)=>{ if(q.url.startsWith('/sw.js')){r.statusCode=404;return r.end();} r.setHeader('content-type','text/html'); r.end(fs.readFileSync(path.join(__dirname,'site/index.html'))); }).listen(0);
const store={}; const pages=[]; const errs=[]; const wait=ms=>new Promise(r=>setTimeout(r,ms));
let fails=0; const ok=(c,m)=>{ console.log((c?'PASS ':'FAIL ')+m); if(!c) fails++; };
const denied=()=>Object.keys(store).filter(k=>k.startsWith('__denied/')).map(k=>store[k]);
const STUB = "window.__opened=[]; window.open=(u)=>{ window.__opened.push(u); return null; };";
(async()=>{
 const br=await chromium.launch(); const url=`http://localhost:${srv.address().port}/`;
 async function phone(hash){ const ctx=await br.newContext({...devices['iPhone 13']}); await ctx.route(/gstatic\.com|googleapis\.com/,r=>r.abort()); const p=await ctx.newPage();
  p.on('pageerror',e=>errs.push(String(e)));
  await p.exposeFunction('__fsRelay',async(pth,json)=>{ if(json===null) delete store[pth]; else store[pth]=JSON.parse(json); for(const q of pages){ if(q!==p) await q.evaluate(([a,b])=>window.__mockApply(a,b),[pth,json]).catch(()=>{}); } });
  await p.addInitScript('window.__mockInit='+JSON.stringify(store)+';'); await p.addInitScript(STUB); await p.addInitScript(fs.readFileSync(path.join(__dirname,'mock2.js'),'utf8')); pages.push(p); await p.goto(url+(hash||'')); await p.evaluate((j)=>window.__mockApplyAll && window.__mockApplyAll(JSON.parse(j)), JSON.stringify(store)).catch(()=>{}); await p.waitForFunction(()=>dbReady&&rosterLoaded); await wait(300); return p; }
 async function friend(name, hash){ const F=await phone(hash||''); await F.fill('#loginNameInput',name); await F.press('#loginNameInput','Enter'); await wait(300); await F.evaluate(()=>{ if(pinModalOpen) closePinModal(true); }); return F; }
 const H=await phone('#host='+HOSTCODE);
 const names=['Arjun','Rohan','Vikram','Sahil','Aditya','Karan'];
 for(let i=0;i<names.length;i++){ await H.evaluate(([n,i])=>addPlayer(n,[i?'MID':'GK'],{},false,false),[names[i],i]); await wait(50); }
 await H.evaluate(()=>{ saveState({format:3, selectedIds:[]}); }); await wait(300);
 ok(/Ask who’s in/.test(await H.evaluate(()=>document.body.innerText)), 'host sees "Ask who’s in" on the Matchday page');
 await H.click('button:has-text("Ask who’s in")'); await wait(200);
 const chips = await H.$$eval('.poll-preset .chip-toggle',e=>e.map(x=>x.innerText));
 ok(chips[0]==='Today morning' && chips[3]==='Tomorrow evening', 'quick picks: '+chips.slice(0,4).join(', '));
 await H.click('.poll-preset .chip-toggle >> nth=2'); await H.click('.poll-preset .chip-toggle >> nth=3');
 await H.fill('#pollCustomInput','Sat 7am at the turf'); await H.click('button:has-text("Add")'); await wait(100);
 await H.click('button:has-text("Create & send to WhatsApp")'); await wait(400);
 const wa = await H.evaluate(()=>window.__opened[0]);
 const msg = decodeURIComponent((wa||'').split('text=')[1]||'');
 console.log('--- poll message ---\n'+msg+'\n---');
 ok(/^https:\/\/api\.whatsapp\.com\/send\?text=/.test(wa) && /https:\/\/keeratbrar007\.github\.io\/matchday-draft\/\?g=\w+&poll=/.test(msg) && !/localhost|file:/.test(msg) && /https:\/\/keeratbrar007\.github\.io\/matchday-draft\/\?g=\w+&poll=/.test(msg) && !/localhost|file:/.test(msg) && /Who’s in for football/.test(msg) && /Sat 7am at the turf/.test(msg) && (msg.match(/[?&]poll=\w+&vote=o\d/g)||[]).length===3 && /No, can’t make it\*\n\S+vote=no/.test(msg), 'WhatsApp message has a one-tap link for every time and for No');
 ok(await H.$('#pollCard')!==null && /0 of 6 replied/.test(await H.evaluate(()=>document.body.innerText)), 'poll card shows 0 of 6 replied');

 // friends open the #poll link
 const A = await friend('Arjun', '#poll');
 const POLLID = await H.evaluate(()=>S.poll.id); const R = await friend('Rohan'); const V = await friend('Vikram');
 ok(await A.$('#pollCard')!==null, 'friend opening the link sees the poll');
 ok(/●/.test(await R.$eval('.pg-nav',e=>e.innerText)), 'a red dot on Matchday until you answer');
 await A.click('.poll-opt.yes-opt >> nth=0'); await wait(150); await A.click('.poll-opt.yes-opt >> nth=1'); await wait(300);
 await R.click('.poll-opt.yes-opt >> nth=1'); await wait(200);
 await V.click('.poll-opt.no-opt'); await wait(400);
 ok(await A.$$eval('.poll-opt',e=>e.length)===4, 'multi-time poll shows the 3 times plus a No option');
 ok(!/●/.test(await R.$eval('.pg-nav',e=>e.innerText)), 'dot goes away after answering');
 const ht = await H.evaluate(()=>document.body.innerText);
 ok(/3 of 6 replied/.test(ht), 'host sees 3 of 6 replied');
 const counts = await H.$$eval('.poll-opt .poll-count',e=>e.map(x=>x.innerText.split('\n')[0]));
 ok(JSON.stringify(counts)==='["1","2","0","1"]', 'counts per time and for No: '+JSON.stringify(counts));
 ok(/No, can’t make it\s*Vikram/.test(ht), 'the No option lists who can’t make it');
 ok(/Not opened yet \(3\): Sahil, Aditya, Karan/.test(ht), 'lists exactly who hasn’t opened it');
 const Kseen = await friend('Karan'); await wait(500);
 const ht2 = await H.evaluate(()=>document.body.innerText);
 ok(/Seen, not answered \(1\): Karan/.test(ht2) && /Not opened yet \(2\): Sahil, Aditya/.test(ht2), 'Karan opened the app but didn’t answer: shown as seen');
 ok(/3 of 6 replied\s*1 seen/.test(ht2), 'the count line shows replied and seen');
 ok(/●/.test(await Kseen.$eval('.pg-nav',e=>e.innerText)), 'seen-but-not-answered still has the red dot');
 // friend cannot answer for someone else
 await A.evaluate(()=>castPollVote('karan',['o1'],false)); await wait(200);
 ok(!/Karan/.test((await H.$$eval('.poll-names',e=>e.map(x=>x.innerText))).join(' ')), 'a friend can’t answer for someone else');
 // nudge
 await H.evaluate(()=>{ window.__opened=[]; }); await H.click('button:has-text("Nudge 3")'); await wait(100);
 const nudge = decodeURIComponent((await H.evaluate(()=>window.__opened[0])).split('text=')[1]);
 ok(/Still waiting on: .*Sahil.*Karan|Still waiting on: .*Karan/.test(nudge) && !/Arjun/.test(nudge), 'nudge names only the silent ones: '+nudge.split('\n')[0]);
 // host answers for Karan (replied in the chat)
 await H.click('button:has-text("Answer for someone")'); await wait(150);
 const row = await H.$('tr:has-text("Karan")'); const b = await row.$$('button'); await b[1].click(); await wait(300);
 ok((await H.$$eval('.poll-names',e=>e.map(x=>x.innerText)))[1].includes('Karan'), 'host can answer for someone who replied in the chat');
 await H.click('button:has-text("Done")');
 await H.screenshot({path:'h_poll_open.png', fullPage:true});
 await A.screenshot({path:'f_poll_open.png', fullPage:true});
 // pick the time
 await H.click('.poll-opt >> nth=1 >> button:has-text("Pick")'); await wait(400);
 ok(JSON.stringify((await H.evaluate(()=>S.selectedIds)).sort())==='["arjun","karan","rohan"]', 'picking the time ticks in everyone who said yes to it');
 const at = await A.evaluate(()=>document.body.innerText);
 ok(/Confirmed: .*Evening/.test(at) && /3 of 6 spots filled/.test(at), 'friends see the confirmed time and the count');
 await H.evaluate(()=>{ window.__opened=[]; }); await H.click('button:has-text("Send final list")'); await wait(100);
 const conf = decodeURIComponent((await H.evaluate(()=>window.__opened[0])).split('text=')[1]);
 console.log('--- confirmation ---\n'+conf+'\n---');
 ok(/Confirmed/.test(conf) && /In \(3\/6\)/.test(conf) && /Vikram/.test(conf), 'confirmation message lists in / out / no reply');
 // Rohan pulls out after confirmation -> ticked out and logged
 await R.click('.poll-opt.no-opt'); await wait(400);
 ok(!(await H.evaluate(()=>S.selectedIds)).includes('rohan'), 'changing to "can’t make it" ticks Rohan out of the match');
 const lastLog = await H.evaluate(()=>S.rsvpLog.slice(-1)[0]);
 ok(lastLog.id==='rohan' && lastLog.a==='out', 'and it counts in the attendance log');
 // Sahil says yes late
 const Sa = await friend('Sahil');
 await Sa.click('.poll-opt.yes-opt'); await wait(400);
 ok((await H.evaluate(()=>S.selectedIds)).includes('sahil'), 'saying "I’m in" after confirmation ticks you in');
 await A.screenshot({path:'f_poll_decided.png', fullPage:true});
 // poll survives "start new match", hides after the match is saved
 await H.evaluate(()=>startNewMatch()); await wait(300);
 ok(await H.$('#pollCard')!==null, 'poll stays up through "Start new match"');
 await H.evaluate(()=>addToHistory({date:new Date().toISOString(),format:3,mode:'random',teamA:{players:[]},teamAIds:['arjun','karan'],teamB:{players:[]},teamBIds:['sahil','vikram'],subs:[],subIds:[]})); await wait(400);
 ok(await H.$('#pollCard')===null && /Ask who’s in/.test(await H.evaluate(()=>document.body.innerText)), 'once that match is played and saved, the poll card goes away');
 // new poll replaces and clears old answers
 await H.evaluate(()=>{ openPollForm(); togglePollDraftOpt('Sun 7am'); createPoll(false); }); await wait(500);
 ok(/0 of 6 replied/.test(await H.evaluate(()=>document.body.innerText)) && Object.keys(store).filter(k=>k.includes('/pollVotes/')).every(k=>!store[k].no && !(store[k].slots||[]).length && k.includes(store[k].pollId)), 'a new poll starts fresh (old answers removed; only "seen" marks for the new one)');
 ok(await A.$$eval('.poll-opt',e=>e.length)===2 && /Yes/.test(await A.$eval('.poll-opt.yes-opt',e=>e.innerText)) && /No/.test(await A.$eval('.poll-opt.no-opt',e=>e.innerText)), 'single-time poll shows just Yes / No');
 // ---- one-tap answer links ----
 const P2 = await H.evaluate(()=>S.poll.id);
 const Ad = await phone('?poll='+P2+'&vote=o1');            // Aditya, not logged in yet
 ok(/Log in once and your poll answer saves/.test(await Ad.evaluate(()=>document.body.innerText)), 'opening a Yes link while logged out asks to log in first');
 await Ad.fill('#loginNameInput','Aditya'); await Ad.press('#loginNameInput','Enter'); await wait(500); await Ad.evaluate(()=>{ if(pinModalOpen) closePinModal(true); }); await wait(300);
 console.log('dbg', JSON.stringify(await Ad.evaluate(()=>({pv:pendingVote, me:getMyPlayerId(), loaded:pollVotesLoaded, mine:pollVotesMap()[getMyPlayerId()], poll:S.poll&&S.poll.id}))), await H.$eval('.poll-opt.yes-opt',e=>e.innerText));
 ok((await H.$eval('.poll-opt.yes-opt',e=>e.innerText)).includes('Aditya'), '...then the Yes is saved straight after logging in');
 ok(/Saved: you’re in/.test(await Ad.evaluate(()=>document.body.innerText)), '...with a "Saved" message');
 ok(!/vote=/.test(await Ad.evaluate(()=>location.href)), 'the link is cleaned from the address bar (no double vote on refresh)');
 await A.evaluate((id)=>{ pendingVote={poll:id, vote:'no'}; render(); }, P2); await wait(600);
 ok((await H.$eval('.poll-opt.no-opt',e=>e.innerText)).includes('Arjun'), 'a logged-in friend tapping the No link: saved in one tap');
 await A.evaluate((id)=>{ pendingVote={poll:id, vote:'o1'}; render(); }, POLLID); await wait(600);
 ok((await H.evaluate(()=>S.selectedIds)).includes('aditya') && !(await H.evaluate(()=>S.selectedIds)).includes('arjun'), 'single-time poll: Yes ticks Aditya in straight away, No keeps Arjun out (no Pick needed)');
 ok(!(await H.$('button:has-text("Pick")')), 'single-time poll has no Pick button');
 await A.evaluate(()=>pollAnswerOne(S.poll.opts[0].id, true)); await wait(400);
 ok((await H.evaluate(()=>S.selectedIds)).includes('arjun'), 'Arjun changes to Yes: ticked in by itself');
 await A.evaluate(()=>pollAnswerNo()); await wait(400);
 ok(!(await H.evaluate(()=>S.selectedIds)).includes('arjun'), '...and back to No: ticked out by itself');
 ok(/That poll has finished/.test(await A.evaluate(()=>document.body.innerText)) && (await H.$eval('.poll-opt.no-opt',e=>e.innerText)).includes('Arjun'), 'an old poll’s link does nothing except show the current poll');
 await A.screenshot({path:'f_poll_single.png', fullPage:true});
 console.log('DENIED '+JSON.stringify(denied()));
 ok(errs.length===0,'no page errors '+JSON.stringify(errs));
 console.log(fails?('\n'+fails+' FAILED'):'\nALL PASSED'); await br.close(); srv.close();
})();
