// captains choose their own bid amount
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
 async function login(F,name){ await F.fill('#loginNameInput',name); await F.press('#loginNameInput','Enter'); await wait(600); await F.evaluate(()=>{ if(pinModalOpen) closePinModal(true); }); await wait(150); }
 const H=await phone('#host='+HOSTCODE);
 const names=['Arjun','Rohan','Vikram','Sahil','Aditya','Karan','Dev','Ishaan'];
 for(const [i,n] of names.entries()){ await H.evaluate(([n,i])=>addPlayer(n,[['GK','DEF','MID','FWD'][i%4]],{},false,false),[n,i]); await wait(40); }
 await H.evaluate(()=>saveState({format:4, timerSecs:0})); await wait(200);
 await H.evaluate(()=>goToMode()); await wait(200);
 await H.evaluate(()=>saveState({mode:'draft',phase:'captains',captains:{a:'arjun',b:'karan'}})); await wait(200);
 await H.evaluate(()=>startAuction(100,10,5,0)); await wait(400);
 const A=await phone(''); await login(A,'Arjun'); const K=await phone(''); await login(K,'Karan');
 ok(await A.evaluate(()=>S.auction.turn)==='a', 'Arjun (Team A) to bid first');
 const quick = await A.$$eval('.bid-more .btn',e=>e.map(x=>x.innerText));
 ok(JSON.stringify(quick)==='["₹15","₹25","₹35"]', 'quick raise buttons from the ₹10 opening: '+quick.join(' '));
 ok(/Any amount from ₹10 to ₹100/.test(await A.evaluate(()=>document.body.innerText)), 'shows the allowed range');
 const ta = await A.$('.bid-actions'); await ta.scrollIntoViewIfNeeded(); const box = await A.evaluate(()=>{ const r=document.querySelector('.bid-actions').closest('.teams-grid').getBoundingClientRect(); return {x:r.x,y:r.y+window.scrollY,w:r.width,h:r.height}; }); await A.screenshot({path:'f_bid_custom.png', fullPage:true, clip:{x:0,y:Math.max(0,box.y-250),width:390,height:box.h+300}});
 ok(await A.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1), 'no sideways scrolling with the bid controls');
 // too high
 await A.fill('#bidInput_a','150'); await A.click('.bid-custom button'); await wait(200);
 ok(/only have ₹100 left/.test(await A.evaluate(()=>document.body.innerText)) && await H.evaluate(()=>S.auction.leader)===null, 'more than the budget is refused');
 // custom jump to 40
 await A.fill('#bidInput_a','40'); await A.press('#bidInput_a','Enter'); await wait(400);
 const st = await H.evaluate(()=>({l:S.auction.leader, p:S.auction.pendingLeaderPrice, c:S.auction.currentBid, t:S.auction.turn}));
 ok(st.l==='a' && st.p===40 && st.c===45 && st.t==='b', 'Arjun jumps to ₹40; Karan must bid ₹45+: '+JSON.stringify(st));
 const kt = await K.evaluate(()=>document.body.innerText);
 ok(/Team A jumped to ₹40/.test(kt) && /Team A leads · next bid ₹45\+/.test(kt) && /bid ₹45 or more/.test(kt), 'Karan sees the jump, the lead and his minimum');
 ok((await K.$eval('.block-card .price',e=>e.innerText))==='₹40', 'the big price shows the leading bid (₹40)');
 // too low
 await K.fill('#bidInput_b','42'); await K.click('.bid-custom button'); await wait(200);
 ok(/lowest bid now is ₹45/.test(await K.evaluate(()=>document.body.innerText)) && await H.evaluate(()=>S.auction.leader)==='a', 'below the minimum is refused');
 // quick button
 await K.click('.bid-more .btn >> nth=1'); await wait(400);   // buttons are 50, 60, 70
 ok(await H.evaluate(()=>S.auction.pendingLeaderPrice)===60 && await H.evaluate(()=>S.auction.leader)==='b', 'Karan taps a quick raise: ₹60');
 // Arjun passes -> Karan buys at 55
 const pid = await H.evaluate(()=>S.auction.order[S.auction.index]);
 await A.click('button:has-text("Pass")'); await wait(400);
 const sold = await H.evaluate(()=>S.auction.log.slice(-1)[0]);
 ok(sold.team==='b' && sold.price===60 && sold.playerId===pid && await H.evaluate(()=>S.auction.teamB.budget)===40, 'sold to Karan for ₹60, his budget drops to ₹40');
 // the sale is written on Team B's side
 const pname = await H.evaluate((id)=>playerName(id), pid);
 const side = async (P,t)=> (await P.$eval('.sold-col.'+t, e=>e.innerText)).replace(/\s+/g,' ');
 ok(new RegExp(pname + ' ₹60 just now','i').test(await side(A,'b')) && /nobody yet/.test(await side(A,'a')), 'sale shows on Team B’s side ("just now"), Team A’s side is empty: '+await side(A,'b'));
 const fl = await A.$eval('#soldFlash', e=>({cls:e.className, t:e.innerText, right: e.getBoundingClientRect().right, left: e.getBoundingClientRect().left, w: document.documentElement.clientWidth}));
 ok(/sold-flash b/.test(fl.cls) && new RegExp(pname + ' joins Team B for ₹60').test(fl.t) && fl.right > fl.w*0.85 && fl.left > fl.w*0.12, 'a "joins Team B" message appears on the right-hand side: '+JSON.stringify(fl));
 await A.screenshot({path:'f_sold_sides.png'});
 // plain minimum bid still works
 const before = await H.evaluate(()=>S.auction.currentBid);
 await H.evaluate(()=>{ const t=S.auction.turn; auctionBid(t); }); await wait(300);
 ok(await H.evaluate(()=>S.auction.pendingLeaderPrice)===before, 'the plain "Bid" button still bids the minimum');
 const leader = await H.evaluate(()=>S.auction.leader), pid2 = await H.evaluate(()=>S.auction.order[S.auction.index]);
 await H.evaluate((l)=>auctionPass(l==='a'?'b':'a'), leader); await wait(400);
 const n2 = await H.evaluate((id)=>playerName(id), pid2);
 ok(new RegExp(n2 + ' ₹\\d+ just now','i').test(await side(A, leader)) && !/just now/i.test(await side(A, leader==='a'?'b':'a')), 'next sale goes on Team ' + leader.toUpperCase() + '’s side and "just now" moves to it');
 const fl2 = await A.$eval('#soldFlash', e=>({cls:e.className, left: e.getBoundingClientRect().left, right: e.getBoundingClientRect().right, w: document.documentElement.clientWidth}));
 ok(fl2.cls.includes('sold-flash '+leader) && (leader==='a' ? fl2.left < fl2.w*0.15 : fl2.right > fl2.w*0.85), 'the message moves to Team ' + leader.toUpperCase() + '’s side: '+JSON.stringify(fl2));
 await A.screenshot({path:'f_sold_flash2.png'});
 ok(errs.length===0,'no page errors '+JSON.stringify(errs));
 console.log(fails?('\n'+fails+' FAILED'):'\nALL PASSED'); await br.close(); srv.close();
})();
