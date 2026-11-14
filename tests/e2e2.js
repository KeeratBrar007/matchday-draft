const { chromium, devices } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path');
const HOSTCODE = fs.readFileSync(path.join(__dirname,'.hostcode'),'utf8').trim();
const srv = http.createServer((q,r)=>{ r.setHeader('content-type','text/html'); r.end(fs.readFileSync(path.join(__dirname,'site/index.html'))); }).listen(0);
let fails=0; const ok=(c,m)=>{ console.log((c?'PASS ':'FAIL ')+m); if(!c) fails++; };
const store={}; const pages=[];
(async()=>{
  const port = srv.address().port, url=`http://localhost:${port}/`;
  const br = await chromium.launch();
  const errs=[];
  async function phone(hash){
    const ctx = await br.newContext({...devices['iPhone 13']});
    await ctx.route(/gstatic\.com|googleapis\.com/, r=>r.abort());
    const p = await ctx.newPage();
    p.on('pageerror',e=>errs.push(e.message));
    await p.exposeFunction('__fsRelay', async (pth,json)=>{
      if(json===null) delete store[pth]; else store[pth]=JSON.parse(json);
      for(const q of pages){ if(q!==p) await q.evaluate(([a,b])=>window.__mockApply(a,b),[pth,json]).catch(()=>{}); }
    });
    await p.addInitScript('window.__mockInit='+JSON.stringify(store)+';');
    await p.addInitScript(fs.readFileSync(path.join(__dirname,'mock2.js'),'utf8'));
    pages.push(p);
    await p.goto(url+(hash||'')); await p.evaluate((j)=>window.__mockApplyAll && window.__mockApplyAll(JSON.parse(j)), JSON.stringify(store)).catch(()=>{});
    await p.waitForFunction(()=>dbReady && rosterLoaded, null, {timeout:8000});
    return p;
  }
  const txt = p=>p.evaluate(()=>document.body.innerText);
  const wait=ms=>new Promise(r=>setTimeout(r,ms));

  // --- host phone, via the secret link ---
  const H = await phone('#host='+HOSTCODE);
  ok(await H.evaluate(()=>isHost()), 'host link unlocks host mode');
  ok(await H.evaluate(()=>location.hash)==='', 'host code scrubbed from the address bar');
  const names=['Arjun','Rohan','Vikram','Sahil','Aditya','Karan','Dev','Ishaan','Yuvraj','Nikhil','Manav','Tanish'];
  for(let i=0;i<names.length;i++){ await H.evaluate(([n,i])=>addPlayer(n,[i<2?'GK':i<5?'DEF':i<9?'MID':'FWD'],{}, false, false),[names[i],i]); await wait(50); }
  await wait(300);
  await H.evaluate(()=>renameSquad(currentSquadId,'Secret Sunday Squad')); await wait(300);
  const ht = await txt(H);
  ok(/Secret Sunday Squad/i.test(ht), 'host sees the squad name');
  ok(/Log match/.test(ht) && /Database/.test(ht), 'host sees Log match + Database');

  // --- friend phone: login page ---
  const F = await phone('');
  let t = await txt(F);
  ok(/Log in/.test(t) && !/Leaderboard/.test(t), 'friend lands on the login page, nothing else visible');
  ok(!/Secret Sunday Squad/.test(t), 'login page does not reveal the squad');
  await F.fill('#loginNameInput','Zed'); await F.click('text=Enter');
  await F.waitForFunction(()=>/couldn.t find/.test(document.body.innerText),null,{timeout:3000}).catch(()=>{});
  t = await txt(F);
  ok(/couldn.t find/.test(t) && /Log in/.test(t), 'unknown name is refused with a clear message');
  await F.fill('#loginNameInput','  arjun '); await F.press('#loginNameInput','Enter'); await F.waitForSelector('#pinSetInput',{timeout:3000}).catch(()=>{}); await F.evaluate(()=>{ if(pinModalOpen) closePinModal(true); });
  t = await txt(F);
  ok(!/Log in/.test(t) && /Leaderboard/.test(t), 'name "  arjun " (any case/spacing) logs in');
  ok(await F.evaluate(()=>getMyPlayerId())==='arjun', 'friend is identified as Arjun');
  ok(!/Secret Sunday Squad/.test(t), 'squad name hidden from friend');
  ok(!/Log match|Database|Past matches \(0\)x/.test(t) && !/Database/.test(t) && !/Log match/.test(t), 'no Log match / Database for friend');
  ok(!(await F.$('select')), 'no squad switcher or "who are you" dropdown for friend');
  ok(!/Guest/.test(t.replace(/guest list/i,'')) , 'no guest-adding box for friend');

  // --- attendance: only self ---
  await H.evaluate(()=>saveState({selectedIds:[]})); await wait(300);
  await F.evaluate(()=>toggleSelected('rohan')); await wait(300);
  ok(!(await H.evaluate(()=>S.selectedIds||[])).includes('rohan'), "friend can't tick someone else in");
  await F.click('li.select-row:not(.locked)'); await wait(300);
  ok((await H.evaluate(()=>S.selectedIds||[])).includes('arjun'), 'friend can tick themselves in (host sees it)');
  ok(await F.$$eval('li.select-row.locked',e=>e.length)>=10, 'other players’ rows are locked for the friend');
  await F.click('li.select-row:not(.locked)'); await wait(300);
  ok(!(await H.evaluate(()=>S.selectedIds||[])).includes('arjun'), 'friend can untick themselves');

  // --- leaderboard ---
  await F.evaluate(()=>toggleAwards()); await wait(100);
  ok(await F.evaluate(()=>!!document.querySelector('.page-head h2')), 'friend can open the leaderboard page');
  ok(!/Secret Sunday Squad/.test(await txt(F)), 'leaderboard does not show the squad name');
  await F.evaluate(()=>toggleAwards());

  // --- drafting: friend as captain bids; non-captain cannot ---
  const R = await phone(''); await R.fill('#loginNameInput','Rohan'); await R.press('#loginNameInput','Enter'); await R.waitForSelector('#pinSetInput',{timeout:3000}).catch(()=>{}); await R.evaluate(()=>{ if(pinModalOpen) closePinModal(true); });
  await H.evaluate(()=>{ setFormat(5); });
  await H.evaluate(()=>saveState({selectedIds: SQUAD.players.map(p=>p.id)})); await wait(200);
  await H.evaluate(()=>goToMode()); await wait(200);
  await H.evaluate(()=>chooseMode('draft')); await wait(200);
  await H.evaluate(()=>saveState({captains:{a:'arjun', b:'karan'}})); await wait(200);
  await H.evaluate(()=>startAuction(100,10,5)); await wait(500);
  const Ft = await txt(F), Rt = await txt(R);
  const turn = await H.evaluate(()=>S.auction.turn);
  console.log('   (auction turn: '+turn+')');
  ok(/Captain/.test(Ft), 'Arjun’s chip says Captain');
  if(turn==='a'){
    ok(await F.$$eval('button',b=>b.some(x=>/Bid/.test(x.innerText))), 'captain Arjun sees a Bid button on his turn');
  } else {
    ok(/waiting|Waiting/.test(Ft), 'captain waits when it is not his turn');
  }
  ok(!(await R.$$eval('button',b=>b.some(x=>/^Bid|Pass/.test(x.innerText.trim())))), 'non-captain Rohan sees no Bid/Pass buttons');
  ok(/Live auction/.test(Rt), 'non-captain can watch the live auction');
  if(turn==='a'){ await F.click('button:has-text("Bid")'); await wait(400);
    ok(await H.evaluate(()=>S.auction.leader)==='a', 'captain’s bid reaches the shared state'); }
  const Ktab = await phone(''); await Ktab.fill('#loginNameInput','karan'); await Ktab.press('#loginNameInput','Enter'); await Ktab.waitForSelector('#pinSetInput',{timeout:3000}).catch(()=>{}); await Ktab.evaluate(()=>{ if(pinModalOpen) closePinModal(true); });
  ok(await Ktab.evaluate(()=>myTeamRole())==='b', 'Karan is recognised as Team B captain via name login');

  // --- logout, wrong/right host code through the UI ---
  await R.click('text=Log out'); await wait(100);
  ok(/Log in/.test(await txt(R)), 'Log out returns to the login page');
  await R.click('text=I’m the host').catch(()=>R.click("text=I'm the host"));
  await R.fill('#hostCodeInput','wrongcode'); await R.click('text=Unlock');
  ok(/isn.t right/.test(await txt(R)) && !(await R.evaluate(()=>isHost())), 'wrong host code is rejected');
  await R.fill('#hostCodeInput',HOSTCODE); await R.press('#hostCodeInput','Enter'); await wait(150);
  ok(await R.evaluate(()=>isHost()) && /Secret Sunday Squad/.test(await txt(R)), 'correct host code on the login page unlocks host mode');
  await R.click('text=Step down'); await wait(150);
  ok(/Log in/.test(await txt(R)) && !(await R.evaluate(()=>isHost())), 'host stepping down returns to login');

  // --- layout + source hygiene ---
  for(const p of [F,H]){ const w=await p.evaluate(()=>({s:document.documentElement.scrollWidth,i:innerWidth})); ok(w.s<=w.i+1,'no sideways scroll ('+w.s+'/'+w.i+')'); }
  const FS = fs.readFileSync(path.join(__dirname,'site/index.html'),'utf8');
  ok(!FS.includes(HOSTCODE) && !FS.includes('B6kCTUws2WTf'), 'neither the new nor the old host code appears in the page source');
  await F.screenshot({path:'friend.png'});
  const L = await phone(''); await L.screenshot({path:'login.png'});
  /*__DENIED_DUMP__*/ console.log('DENIED '+JSON.stringify(Object.keys(store).filter(k=>k.startsWith('__denied/')).map(k=>store[k])));
  ok(errs.length===0,'no page errors '+JSON.stringify(errs.slice(0,3)));
  await br.close(); srv.close();
  console.log(fails?`\n${fails} FAILED`:'\nALL PASSED'); process.exit(fails?1:0);
})().catch(e=>{ console.error('CRASH',e); process.exit(2); });
