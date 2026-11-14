const { chromium, devices } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path');
const HOSTCODE = fs.readFileSync(path.join(__dirname,'.hostcode'),'utf8').trim();
const srv = http.createServer((q,r)=>{ r.setHeader('content-type','text/html'); r.end(fs.readFileSync(path.join(__dirname,'site/index.html'))); }).listen(0);
let fails=0; const ok=(c,m)=>{ console.log((c?'PASS ':'FAIL ')+m); if(!c) fails++; };
const store={}; const pages=[]; const errs=[];
const wait=ms=>new Promise(r=>setTimeout(r,ms));
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
  };
  const H = await phone('#host='+HOSTCODE);
  const names=['Arjun','Rohan','Vikram','Sahil','Aditya','Karan','Dev','Ishaan','Yuvraj','Nikhil'];
  for(let i=0;i<names.length;i++){ await H.evaluate(([n,i])=>addPlayer(n,[i<2?'GK':i<5?'DEF':i<9?'MID':'FWD'],{},false,false),[names[i],i]); await wait(50); }
  const F = await phone(''); await F.fill('#loginNameInput','Arjun'); await F.press('#loginNameInput','Enter'); await F.waitForSelector('#pinSetInput',{timeout:3000}).catch(()=>{}); await F.evaluate(()=>{ if(pinModalOpen) closePinModal(true); });
  const K = await phone(''); await K.fill('#loginNameInput','Karan'); await K.press('#loginNameInput','Enter'); await K.waitForSelector('#pinSetInput',{timeout:3000}).catch(()=>{}); await K.evaluate(()=>{ if(pinModalOpen) closePinModal(true); });
  await H.evaluate(()=>{ setFormat(5); saveState({selectedIds: SQUAD.players.map(p=>p.id)}); }); await wait(250);
  await H.evaluate(()=>goToMode()); await wait(200);
  await H.evaluate(()=>chooseMode('draft')); await wait(200);
  await H.evaluate(()=>saveState({captains:{a:'arjun', b:'karan'}})); await wait(200);
  await H.evaluate(()=>startAuction(100,10,5)); await wait(400);

  // Arjun bids -> turn passes to Karan
  await F.click('button:has-text("Bid")'); await wait(400);
  ok(await K.evaluate(()=>S.auction.turn)==='b', 'Karan sees it is his turn');

  // === the phone's live connection stalls (what happened on the real phone) ===
  await F.evaluate(()=>{ window.__stall = true; });
  await K.click('button:has-text("Bid")'); await wait(500);
  ok(await H.evaluate(()=>S.auction.turn)==='a', 'server state: turn is back with Arjun');
  ok(await F.evaluate(()=>S.auction.turn)==='b', '(stalled phone still shows the old turn, reproducing the bug)');
  // the 5s catch-up poll must rescue it with no reload
  await wait(7000);
  ok(await F.evaluate(()=>S.auction.turn)==='a', 'stalled phone catches up by itself within a few seconds');
  ok(await F.$$eval('button',b=>b.some(x=>/Bid/.test(x.innerText))), 'Arjun gets his Bid button back without reloading');

  // wake-from-sleep path: stalled again, then the page becomes visible
  await F.click('button:has-text("Bid")'); await wait(500);
  await F.evaluate(()=>{ window.__stall = true; });
  await K.click('button:has-text("Bid")'); await wait(500);
  console.log('INFO stalled phone already caught up:', await F.evaluate(()=>S.auction.turn)==='a');
  await F.evaluate(()=>document.dispatchEvent(new Event('visibilitychange'))); await wait(600);
  ok(await F.evaluate(()=>S.auction.turn)==='a', 'returning to the page re-syncs immediately');

  // no needless re-render loop when nothing changed
  await F.evaluate(()=>{ window.__renders=0; const r=render; window.render=function(){ window.__renders++; return r.apply(this,arguments); }; });
  await wait(12000);
  ok(await F.evaluate(()=>window.__renders)===0, 'polling does not re-render when nothing changed ('+await F.evaluate(()=>window.__renders)+' renders in 12s)');
  /*__DENIED_DUMP__*/ console.log('DENIED '+JSON.stringify(Object.keys(store).filter(k=>k.startsWith('__denied/')).map(k=>store[k])));
  ok(errs.length===0,'no page errors '+JSON.stringify(errs.slice(0,3)));
  await br.close(); srv.close();
  console.log(fails?`\n${fails} FAILED`:'\nALL PASSED'); process.exit(fails?1:0);
})().catch(e=>{ console.error('CRASH',e); process.exit(2); });
