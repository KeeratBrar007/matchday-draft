// waitlist + result card image
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
 const names=['Arjun','Rohan','Vikram','Sahil','Aditya','Karan','Dev','Om'];
 for(const [i,n] of names.entries()){ await H.evaluate(([n,i])=>addPlayer(n,[['GK','DEF','MID','FWD'][i%4]],{},false,false),[n,i]); await wait(40); }
 await H.evaluate(()=>saveState({format:2})); await wait(300);
 // ---- poll form: spots default to two full teams ----
 await H.evaluate(()=>openPollForm()); await wait(200);
 ok(await H.$eval('#pollMaxInput', e=>e.value)==='4', 'new poll: spots default to 4 for 2v2');
 await H.evaluate(()=>{ pollDraft.opts=['Sat 7am','Sun 7am']; }); await H.evaluate(()=>createPoll(false)); await wait(300);
 ok(await H.evaluate(()=>S.poll.max)===4, 'poll saved with 4 spots');
 const vote = async (id, slots)=>{ await H.evaluate(([id,sl])=>castPollVote(id, sl, false), [id, slots]); await wait(60); };
 // six say yes to Saturday, in this order
 const order = ['arjun','rohan','vikram','sahil','aditya','karan'];
 for(const id of order) await vote(id, ['o1']);
 await vote('rohan', ['o1','o2']);   // Rohan adds Sunday too: keeps his place
 ok(/2 more than the 4 spots/.test(await txt(H)), 'before picking, the poll warns 2 would be on the waitlist');
 // friend phones
 const AD = await phone(''); await login(AD,'Aditya');
 const RO = await phone(''); await login(RO,'Rohan');
 await H.evaluate(()=>decidePoll('o1')); await wait(500);
 ok(JSON.stringify(await H.evaluate(()=>S.selectedIds))==='["arjun","rohan","vikram","sahil"]', 'picking Saturday ticks in the first 4 to say yes (Rohan kept his place)');
 ok(JSON.stringify(await H.evaluate(()=>pollWaitlist()))==='["aditya","karan"]', 'Aditya and Karan are on the waitlist, in order');
 const ht = await txt(H);
 ok(/4 of 4 spots filled · 2 on the waitlist/.test(ht) && /1\. Aditya · 2\. Karan/.test(ht), 'poll card shows spots filled and the numbered waitlist');
 ok(/You’re #1 on the waitlist/.test(await txt(AD)), 'Aditya’s phone: "You’re #1 on the waitlist"');
 ok(/waitlist #1/.test(await H.$eval('li.select-row[data-pid="aditya"]', e=>e.innerText)), 'the player list tags Aditya as waitlist #1');
 // Rohan drops out from his own phone -> Aditya moves in automatically
 await RO.evaluate(()=>pollAnswerNo()); await wait(600);
 ok(JSON.stringify(await H.evaluate(()=>S.selectedIds))==='["arjun","vikram","sahil","aditya"]', 'Rohan says No: Aditya moves in straight away');
 ok(!/You’re #/.test(await txt(AD)) && await AD.evaluate(()=>(S.selectedIds||[]).includes('aditya')), 'Aditya’s phone shows him in');
 const rl = await H.evaluate(()=>S.rsvpLog.slice(-2));
 ok(rl[0].id==='rohan' && rl[0].a==='out' && rl[1].id==='aditya' && rl[1].by==='waitlist', 'attendance log: Rohan out, Aditya in from the waitlist');
 // Rohan changes his mind: back of the queue
 await RO.evaluate(()=>pollAnswerOne(S.poll.decided, true)); await wait(500);
 ok(JSON.stringify(await H.evaluate(()=>pollWaitlist()))==='["karan","rohan"]', 'Rohan says yes again: he goes to the back of the waitlist');
 ok(/You’re #2 on the waitlist/.test(await txt(RO)), 'Rohan sees #2');
 // a friend can’t jump the queue by ticking himself in on the list
 await RO.evaluate(()=>toggleSelected('rohan')); await wait(400);
 ok(!(await H.evaluate(()=>S.selectedIds.includes('rohan'))), 'ticking yourself in on the list while it’s full keeps you on the waitlist');
 // host ticks Vikram out on the list -> Karan moves in, Vikram marked No
 await H.evaluate(()=>toggleSelected('vikram')); await wait(500);
 ok(JSON.stringify(await H.evaluate(()=>S.selectedIds))==='["arjun","sahil","aditya","karan"]' && await H.evaluate(()=>pollVotesMap().vikram.no)===true, 'host ticks Vikram out: Karan moves in, Vikram’s answer becomes No');
 // a late yes goes on the waitlist
 await vote('dev', ['o1']); await wait(300);
 ok(JSON.stringify(await H.evaluate(()=>pollWaitlist()))==='["rohan","dev"]', 'a late yes (Dev) joins the back of the waitlist');
 // host adds a spot -> next in line moves up (host phone tidies it)
 await H.evaluate(()=>setPollMax(5)); await wait(1600);
 ok(JSON.stringify(await H.evaluate(()=>S.selectedIds))==='["arjun","sahil","aditya","karan","rohan"]', 'host raises spots to 5: Rohan moves in');
 // host can still squeeze someone in past the limit
 await H.evaluate(()=>toggleSelected('om')); await wait(400);
 ok(await H.evaluate(()=>S.selectedIds.includes('om') && S.selectedIds.length===6), 'host can tick someone in past the limit');
 await H.evaluate(()=>toggleSelected('om')); await wait(400);
 // final list message
 await H.evaluate(()=>sharePollConfirm()); await wait(200);
 const msg = decodeURIComponent((await H.evaluate(()=>window.__opened.slice(-1)[0])).split('text=')[1]);
 console.log('--- final list ---\n'+msg+'\n---');
 ok(/\*In \(5\/5\):\*/.test(msg) && /⏳ Waitlist:\* 1\. Dev/.test(msg) && !/In \(5\/5\):\* [^\n]*Dev/.test(msg), 'final list message: In (5/5) and the waitlist');
 // out-of-order delivery: the host sees Sahil leave the list before his "No" arrives (his old Yes is still there)
 await H.evaluate(()=>saveState({selectedIds: S.selectedIds.filter(x=>x!=='sahil'), rsvpLog: (S.rsvpLog||[]).concat([{id:'sahil', a:'out', t:new Date().toISOString(), by:'self'}])})); await wait(1800);
 const afterRace = await H.evaluate(()=>S.selectedIds);
 ok(!afterRace.includes('sahil') && afterRace.includes('dev'), 'a drop-out whose No hasn’t arrived yet isn’t put straight back in; the next in line (Dev) moves up: '+JSON.stringify(afterRace));
 await H.screenshot({path:'h_waitlist.png'}); await RO.screenshot({path:'f_waitlist.png'});
 // no limit: everyone is in
 await H.evaluate(()=>{ openPollForm(); pollDraft.opts=['Mon 7pm']; pollDraft.max=''; createPoll(false); }); await wait(300);
 for(const id of ['arjun','rohan','vikram','sahil','aditya','karan']) await vote(id, ['o1']);
 await wait(300);
 ok(await H.evaluate(()=>S.poll.max)===null && await H.evaluate(()=>S.selectedIds.length)===6 && await H.evaluate(()=>pollWaitlist().length)===0, 'no limit: all 6 yeses are ticked in, no waitlist');
 // single-time poll with spots: ticks in as they answer, extras wait
 await H.evaluate(()=>{ openPollForm(); pollDraft.opts=['Tue 7pm']; pollDraft.max='3'; createPoll(false); }); await wait(300);
 for(const id of ['om','dev','karan','arjun']) await vote(id, ['o1']);
 await wait(300);
 ok(JSON.stringify(await H.evaluate(()=>S.selectedIds))==='["om","dev","karan"]' && JSON.stringify(await H.evaluate(()=>pollWaitlist()))==='["arjun"]', 'single-time poll with 3 spots: first 3 in, Arjun waits');
 await H.evaluate(()=>{ toggleSelected('dev'); }); await wait(500);
 ok(JSON.stringify(await H.evaluate(()=>S.selectedIds))==='["om","karan","arjun"]', '...and moves in when Dev drops');
 // "same as last week" keeps the spots
 ok(await H.evaluate(()=>repeatPollPlan().max)===3, '"Same as last week" remembers the spots');

 // ---- result card ----
 const ids = names.map(n=>n.toLowerCase());
 await H.evaluate(()=>endPoll()); await H.evaluate(()=>endPoll()); await wait(200);
 await H.evaluate((ids)=>{ toggleLogMatch(); ids.slice(0,4).forEach(id=>logToggleTeam(id,'a')); ids.slice(4,8).forEach(id=>logToggleTeam(id,'b')); logSetWinner('a'); saveLoggedMatch(); }, ids); await wait(500);
 const hid = await H.evaluate(()=>HISTORY[0].id);
 await H.evaluate((hid)=>updateHistoryResult(hid, {scoreA:3, scoreB:2, scorers:[{playerId:'arjun',goals:2},{playerId:'aditya',goals:2}], assists:[], ownGoals:[{playerId:'dev',goals:1}], duration:60}), hid); await wait(300);
 // friends vote player of the match
 await AD.evaluate((hid)=>castPotmVote(hid,'a','arjun'), hid); await AD.evaluate((hid)=>castPotmVote(hid,'b','aditya'), hid); await wait(400);
 // a friend opens it from their profile
 await AD.evaluate(()=>goMyProfile()); await wait(300);
 const btn = await AD.$('button:has-text("📸 Result card")');
 ok(!!btn, 'friends get a 📸 Result card button on their past matches');
 await btn.click(); await wait(2500);
 const info = await AD.evaluate(()=>new Promise(r=>{ const im=document.getElementById('resultCardImg'); if(!im) return r(null); const go=()=>r({w:im.naturalWidth, h:im.naturalHeight, png:im.src.startsWith('data:image/png')}); im.complete?go():im.onload=go; }));
 ok(info && info.w===1080 && info.h===1350 && info.png, 'result card is a 1080×1350 PNG (fits WhatsApp nicely): '+JSON.stringify(info));
 const b64 = await AD.evaluate(()=>document.getElementById('resultCardImg').src.split(',')[1]);
 fs.writeFileSync(path.join(__dirname,'result_card.png'), Buffer.from(b64,'base64'));
 const share = await AD.evaluate(()=>canShareResultCard());
 ok(await AD.$(share ? 'button:has-text("Share")' : 'button:has-text("Save image")'), 'card offers '+(share?'Share':'Save image'));
 const [dl] = await Promise.all([AD.waitForEvent('download', {timeout:5000}).catch(()=>null), AD.click('button:has-text("Save image")')]);
 ok(dl && /^matchday-result-\d{4}-\d{2}-\d{2}\.png$/.test(dl.suggestedFilename()), 'Save image downloads '+(dl && dl.suggestedFilename()));
 // the card shows on the result screen after live full time too
 ok(await H.evaluate(()=>typeof resultCardBtn(HISTORY[0])==='string' && resultCardBtn(HISTORY[0]).includes('Result card')), 'host gets the button too');
 ok(errs.length===0, 'no page errors '+errs.join(' | '));
 ok(denied().length===0, 'no denied writes '+JSON.stringify(denied()));
 console.log(fails? fails+' FAILED':'ALL PASS'); await br.close(); srv.close(); process.exit(fails?1:0);
})();
