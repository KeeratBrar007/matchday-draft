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
  await p.addInitScript('window.__mockInit='+JSON.stringify(store)+';'); await p.addInitScript(fs.readFileSync(path.join(__dirname,'mock2.js'),'utf8')); pages.push(p); await p.goto(url+(hash||'')); await p.evaluate((j)=>window.__mockApplyAll && window.__mockApplyAll(JSON.parse(j)), JSON.stringify(store)).catch(()=>{}); await p.waitForFunction(()=>dbReady&&rosterLoaded); return p; }
 const H=await phone('#host='+HOSTCODE);
 const names=['Arjun','Rohan','Vikram','Sahil','Aditya','Karan'];
 for(let i=0;i<names.length;i++){ await H.evaluate(([n,i])=>addPlayer(n,[i<1?'GK':i<3?'DEF':i<5?'MID':'FWD'],{},false,false),[names[i],i]); await wait(60); }
 await wait(300);
 // an old draft (no prices saved) and a random match
 await H.evaluate(()=>{
  addToHistory({date:new Date(Date.now()-3*864e5).toISOString(),format:3,mode:'draft',teamA:{players:[]},teamAIds:['arjun','rohan','vikram'],teamB:{players:[]},teamBIds:['sahil','aditya','karan'],subs:[],subIds:[],winner:'b',scoreA:0,scoreB:2,scorers:[],assists:[]});
  addToHistory({date:new Date(Date.now()-2*864e5).toISOString(),format:3,mode:'random',teamA:{players:[]},teamAIds:['rohan','vikram','sahil'],teamB:{players:[]},teamBIds:['arjun','aditya','karan'],subs:[],subIds:[],winner:'draw',scoreA:1,scoreB:1,scorers:[{playerId:'arjun',goals:1}],assists:[]});
 }); await wait(300);
 // a real draft saved through the app's own save path
 await H.evaluate(()=>{
  saveState({mode:'draft', format:3, captains:{a:'arjun', b:'karan'}, subIds:[]});
  S.captains={a:'arjun',b:'karan'};
  S.auction={teamA:{ids:['arjun','rohan','sahil']}, teamB:{ids:['karan','vikram','aditya']}, order:['rohan','vikram','sahil','aditya'], index:4, done:true,
    log:[{playerId:'rohan',team:'a',price:40,free:false},{playerId:'vikram',team:'b',price:55,free:false},{playerId:'sahil',team:'a',price:20,free:false},{playerId:'aditya',team:'b',price:0,free:true}]};
  saveAuctionToHistory();
 }); await wait(500);
 const last = await H.evaluate(()=>HISTORY[0]);
 ok(last.prices && last.prices.vikram && last.prices.vikram.p===55 && last.captainIds.a==='arjun', 'drafted match saves each player\'s price and the captains: '+JSON.stringify(last.prices));
 const hid = last.id;
 await H.evaluate(([id])=>updateHistoryResult(id,{winner:'b',scoreA:2,scoreB:3,scorers:[{playerId:'vikram',goals:2}],assists:[],potmVotes:{a:{arjun:'rohan',sahil:'rohan'},b:{karan:'vikram',aditya:'vikram'}}}),[hid]); await wait(500);

 const F=await phone(''); await F.fill('#loginNameInput','Vikram'); await F.press('#loginNameInput','Enter'); await wait(300); await F.evaluate(()=>{ if(pinModalOpen) closePinModal(true); });
 await F.click('.pg-nav button:has-text("My profile")'); await wait(300);
 const rows = await F.$$eval('.pm-row',e=>e.map(x=>x.innerText.replace(/\s+/g,' ')));
 console.log(rows.join('\n'));
 ok(rows.length===3, 'profile lists Vikram\'s 3 past matches');
 ok(/Team A 2 – 3 Team B/.test(rows[0]) && /^W/.test(rows[0]), 'newest first, with score and a W');
 ok(/Man of the match: Rohan \(Team A\) · ⭐ Vikram \(Team B\)/.test(rows[0]), 'shows both teams\' man of the match, starring Vikram');
 ok(/Bought for ₹55/.test(rows[0]) && /Highest/i.test(rows[0]), 'shows his price and the Highest tag (most expensive that day)');
 ok(/2 goals/.test(rows[0]), 'and his goals');
 ok(!/Bought for|Price not recorded/.test(rows[1]), 'random-split match has no price line');
 ok(/Price not recorded/.test(rows[2]), 'old draft says the price was not recorded');
 await F.screenshot({path:'f_pastmatches.png', fullPage:true});
 // Rohan: bought but not highest; Aditya: free; Arjun: captain
 await F.evaluate(()=>openProfile('rohan')); await wait(200);
 let r0 = await F.$eval('.pm-row',e=>e.innerText.replace(/\s+/g,' '));
 ok(/Bought for ₹40/.test(r0) && !/Highest/i.test(r0) && /⭐ Rohan/.test(r0), 'Rohan: ₹40, not highest, starred as Team A man of the match');
 await F.evaluate(()=>openProfile('aditya')); await wait(200);
 r0 = await F.$eval('.pm-row',e=>e.innerText.replace(/\s+/g,' '));
 ok(/Free pick/.test(r0), 'Aditya shows as a free pick');
 await F.evaluate(()=>openProfile('arjun')); await wait(200);
 r0 = await F.$eval('.pm-row',e=>e.innerText.replace(/\s+/g,' '));
 ok(/Captain/.test(r0), 'Arjun shows as captain');
 /*__DENIED_DUMP__*/ console.log('DENIED '+JSON.stringify(Object.keys(store).filter(k=>k.startsWith('__denied/')).map(k=>store[k])));
  ok(errs.length===0,'no page errors '+JSON.stringify(errs));
 console.log(fails?('\n'+fails+' FAILED'):'\nALL PASSED'); await br.close(); srv.close();
})();
