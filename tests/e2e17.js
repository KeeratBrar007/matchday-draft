// game privacy in the database (run with the privacy rules: V2=1)
const { chromium, devices } = require('playwright');
const http=require('http'),fs=require('fs'),path=require('path');
const HOSTCODE=fs.readFileSync(path.join(__dirname,'.hostcode'),'utf8').trim();
const srv=http.createServer((q,r)=>{ if(q.url.startsWith('/sw.js')){r.statusCode=404;return r.end();} r.setHeader('content-type','text/html'); r.end(fs.readFileSync(path.join(__dirname,'site/index.html'))); }).listen(0);
const store={}; const pages=[]; const errs=[]; const wait=ms=>new Promise(r=>setTimeout(r,ms));
let fails=0; const ok=(c,m)=>{ console.log((c?'PASS ':'FAIL ')+m); if(!c) fails++; };
(async()=>{
 const br=await chromium.launch(); const url=`http://localhost:${srv.address().port}/`;
 async function phone(hash){ const ctx=await br.newContext({...devices['iPhone 13']}); await ctx.route(/gstatic\.com|googleapis\.com/,r=>r.abort()); const p=await ctx.newPage();
  p.on('pageerror',e=>errs.push(String(e)));
  await p.exposeFunction('__fsRelay',async(pth,json)=>{ if(json===null) delete store[pth]; else store[pth]=JSON.parse(json); for(const q of pages){ if(q!==p) await q.evaluate(([a,b])=>window.__mockApply(a,b),[pth,json]).catch(()=>{}); } });
  await p.addInitScript('window.__mockInit='+JSON.stringify(store)+';'); await p.addInitScript(fs.readFileSync(path.join(__dirname,'mock2.js'),'utf8')); pages.push(p); await p.goto(url+(hash||'')); await p.evaluate((j)=>window.__mockApplyAll && window.__mockApplyAll(JSON.parse(j)), JSON.stringify(store)).catch(()=>{}); await p.waitForFunction(()=>dbReady&&rosterLoaded); await wait(300); return p; }
 async function login(F,name){ await F.fill('#loginNameInput',name); await F.press('#loginNameInput','Enter'); await F.waitForFunction(()=>!/Checking…/.test(document.body.innerText),null,{timeout:6000}).catch(()=>{}); await wait(900); await F.evaluate(()=>{ if(pinModalOpen) closePinModal(true); }); await wait(200); }
 const txt = p=>p.evaluate(()=>document.body.innerText);
 ok(await (await br.newPage()).evaluate(()=>1)===1, '(browser up)');
 const H=await phone('#host='+HOSTCODE);
 for(const n of ['Arjun','Karan','Dev']){ await H.evaluate((n)=>addPlayer(n,['MID'],{},false,false),n); await wait(60); }
 const footballId = await H.evaluate(()=>currentSquadId);
 await H.evaluate(()=>createSquad('Secret Cricket','cricket')); await wait(600);
 const cricketId = await H.evaluate(()=>currentSquadId);
 for(const n of ['Rohan','Dev']){ await H.evaluate((n)=>addPlayer(n,['FWD'],{},false,false),n); await wait(60); }
 await H.evaluate(()=>addToHistory({date:new Date().toISOString(),format:2,mode:'random',teamA:{players:[]},teamAIds:['rohan'],teamB:{players:[]},teamBIds:['dev'],subs:[],subIds:[],winner:'a',fees:{items:[{label:'Turf',amount:500,paidBy:'_c'}],players:['rohan','dev'],split:'equal',custom:{},paid:{}}})); await wait(1200);
 ok((store['squads/'+cricketId].members||[]).join(',')==='dev,rohan' && (store['squads/'+footballId].members||[]).join(',')==='arjun,dev,karan', 'the host’s app keeps each game’s member list');
 ok(Object.keys(store).filter(k=>k.startsWith('access/')).length>=4, 'and a name index for every player');
 // Karan: football only
 const K = await phone(''); await login(K,'Karan');
 ok(await K.evaluate(()=>getMyPlayerId())==='karan' && await K.evaluate(()=>SPORT.key)==='football', 'Karan logs in and lands in football');
 ok(await K.evaluate(()=>squadsMode)==='access' && JSON.stringify(await K.evaluate(()=>squadsList.map(s=>s.id)))===JSON.stringify([footballId]), 'his phone only knows about the football game');
 const tryRead = (p, pth, list)=>p.evaluate(async([pth,list])=>{ try{ if(list){ const q = await db.collection(pth).get(); return 'READ '+q.docs.length; } const s = await db.doc(pth).get(); return 'READ '+(s.exists?JSON.stringify(s.data()).slice(0,60):'(empty)'); }catch(e){ return 'DENIED'; } }, [pth, !!list]);
 ok(await tryRead(K,'squads/'+cricketId+'/state/roster')==='DENIED', 'Karan CANNOT read the cricket player list, even calling the database directly');
 ok(await tryRead(K,'squads/'+cricketId+'/history', true)==='DENIED', '...nor cricket matches (with the money)');
 ok(await tryRead(K,'squads/'+cricketId)==='DENIED', '...nor the cricket game itself (its name)');
 ok(await tryRead(K,'squads', true)==='DENIED', '...nor list all games');
 ok((await tryRead(K,'squads/'+footballId+'/state/roster')).startsWith('READ'), 'but he can read his own game');
 const rohanUid = null;
 // Rohan & Dev
 const R = await phone(''); await login(R,'Rohan');
 ok(await R.evaluate(()=>getMyPlayerId())==='rohan' && await R.evaluate(()=>SPORT.key)==='cricket', 'Rohan (cricket only, not the default game) logs in and lands in cricket');
 const rUid = await R.evaluate(()=>AUTH_UID);
 ok(await tryRead(K,'logins/'+rUid)==='DENIED', 'phones can’t read each other’s login records');
 ok(await K.evaluate(async()=>{ try{ await db.doc('access/'+accessKey('karan')).set({squads:['x']}); return 'WROTE'; }catch(e){ return 'DENIED'; } })==='DENIED', 'a friend can’t edit the name index to give themselves access');
 const D = await phone(''); await login(D,'Dev');
 ok(/Pick a game/.test(await txt(D)) && (await D.$$eval('.game-card',e=>e.length))===2, 'Dev (both games) gets the picker with exactly his 2 games');
 // host adds Karan to cricket -> live access
 await H.evaluate((id)=>switchSquad(id), cricketId); await wait(400);
 await H.evaluate(()=>addPlayer('Karan',['BAT'],{},false,false)); await wait(1500);
 ok(JSON.stringify(await K.evaluate(()=>squadsList.map(s=>s.id).sort()))===JSON.stringify([footballId,cricketId].sort()), 'when the host adds Karan to cricket, it appears on his phone by itself');
 ok((await tryRead(K,'squads/'+cricketId+'/state/roster')).startsWith('READ'), '...and now he can read it');
 // remove again
 await H.evaluate(()=>removePlayer('karan')); await wait(1500);
 ok(await tryRead(K,'squads/'+cricketId+'/state/roster')==='DENIED', 'removed from cricket = locked out again');
 ok(JSON.stringify(await K.evaluate(()=>squadsList.map(s=>s.id)))===JSON.stringify([footballId]), '...and it disappears from his phone');
 // spoofing note: a phone that claims a member's name can read that game (names aren't passwords)
 const X = await phone('');
 const spoof = await X.evaluate(async(cid)=>{ try{ await db.doc('logins/'+AUTH_UID).set({name:'rohan', at:'x'}); const s = await db.doc('squads/'+cid+'/state/roster').get(); return s.exists ? 'READ' : 'EMPTY'; }catch(e){ return 'DENIED'; } }, cricketId);
 console.log('NOTE spoofing a member’s exact name still works (expected, names aren’t passwords):', spoof);
 // host unaffected
 ok((await tryRead(H,'squads', true)).startsWith('READ') && (await tryRead(H,'squads/'+cricketId+'/history', true)).startsWith('READ'), 'the host still reads every game');
 ok(errs.length===0,'no page errors '+JSON.stringify(errs));
 console.log(fails?('\n'+fails+' FAILED'):'\nALL PASSED'); await br.close(); srv.close();
})();
