// drag-select on the match-day list, drag-reorder in the database, select all
const { chromium, devices } = require('playwright');
const http=require('http'),fs=require('fs'),path=require('path');
const HOSTCODE=fs.readFileSync(path.join(__dirname,'.hostcode'),'utf8').trim();
const srv=http.createServer((q,r)=>{ if(q.url.startsWith('/sw.js')){r.statusCode=404;return r.end();} r.setHeader('content-type','text/html'); r.end(fs.readFileSync(path.join(__dirname,'site/index.html'))); }).listen(0);
const store={}; const pages=[]; const errs=[]; const wait=ms=>new Promise(r=>setTimeout(r,ms));
let fails=0; const ok=(c,m)=>{ console.log((c?'PASS ':'FAIL ')+m); if(!c) fails++; };
(async()=>{
 const br=await chromium.launch(); const url=`http://localhost:${srv.address().port}/`;
 async function phone(hash, opts){ const ctx=await br.newContext(opts||{...devices['iPhone 13']}); await ctx.route(/gstatic\.com|googleapis\.com/,r=>r.abort()); const p=await ctx.newPage();
  p.on('pageerror',e=>errs.push(String(e)));
  await p.exposeFunction('__fsRelay',async(pth,json)=>{ if(json===null) delete store[pth]; else store[pth]=JSON.parse(json); for(const q of pages){ if(q!==p) await q.evaluate(([a,b])=>window.__mockApply(a,b),[pth,json]).catch(()=>{}); } });
  await p.addInitScript('window.__mockInit='+JSON.stringify(store)+';'); await p.addInitScript(fs.readFileSync(path.join(__dirname,'mock2.js'),'utf8')); pages.push(p); await p.goto(url+(hash||'')); await p.evaluate((j)=>window.__mockApplyAll && window.__mockApplyAll(JSON.parse(j)), JSON.stringify(store)).catch(()=>{}); await p.waitForFunction(()=>dbReady&&rosterLoaded); await wait(300); return p; }
 const H=await phone('#host='+HOSTCODE);
 const names=['P01','P02','P03','P04','P05','P06','P07','P08','P09','P10','P11','P12','P13','P14','P15','P16'];
 for(const [i,n] of names.entries()){ await H.evaluate(([n,i])=>addPlayer(n,[['GK','DEF','MID','FWD'][i%4]],{},false,false),[n,i]); await wait(30); }
 await H.evaluate(()=>saveState({selectedIds:[]})); await wait(400);
 const sel = ()=>H.evaluate(()=>(S.selectedIds||[]).slice().sort());
 const center = async (p, sel)=>{ const b = await p.$eval(sel, e=>{ const r=e.getBoundingClientRect(); return {x:r.x+r.width/2, y:r.y+r.height/2}; }); return b; };
 // ---- touch: drag down the tick boxes ----
 const cdp = await H.context().newCDPSession(H);
 const touch = (type, pts)=>cdp.send('Input.dispatchTouchEvent', {type, touchPoints: pts.map(p=>({x:Math.round(p.x), y:Math.round(p.y)}))});
 await H.evaluate(()=>document.querySelector('li.select-row[data-pid="p01"]').scrollIntoView({block:'center'})); await wait(200);
 let a = await center(H,'li.select-row[data-pid="p01"] .check-box'), b = await center(H,'li.select-row[data-pid="p05"] .check-box');
 const y0 = await H.evaluate(()=>scrollY);
 await touch('touchStart',[a]);
 for(let i=1;i<=10;i++){ await touch('touchMove',[{x:a.x, y:a.y+(b.y-a.y)*i/10}]); await wait(30); }
 await touch('touchEnd',[]); await wait(500);
 ok(JSON.stringify(await sel())==='["p01","p02","p03","p04","p05"]', 'touch: dragging down the ticks selects 5 in one go: '+JSON.stringify(await sel()));
 ok(Math.abs((await H.evaluate(()=>scrollY)) - y0) < 5, 'the page did not scroll while drag-selecting');
 // drag back over the same rows starting on a ticked one = untick
 a = await center(H,'li.select-row[data-pid="p02"] .check-box'); b = await center(H,'li.select-row[data-pid="p04"] .check-box');
 await touch('touchStart',[a]); for(let i=1;i<=6;i++){ await touch('touchMove',[{x:a.x, y:a.y+(b.y-a.y)*i/6}]); await wait(30); } await touch('touchEnd',[]); await wait(500);
 ok(JSON.stringify(await sel())==='["p01","p05"]', 'starting on a ticked row unticks as you drag: '+JSON.stringify(await sel()));
 // a normal swipe on names scrolls and does NOT select
 a = await center(H,'li.select-row[data-pid="p07"] .player-name');
 const y1 = await H.evaluate(()=>scrollY);
 await touch('touchStart',[a]); for(let i=1;i<=6;i++){ await touch('touchMove',[{x:a.x, y:a.y-40*i}]); await wait(16); } await touch('touchEnd',[]); await wait(400);
 ok(JSON.stringify(await sel())==='["p01","p05"]', 'a quick swipe on names does not select anything');
 // press and hold a name, then drag
 await H.evaluate(()=>document.querySelector('li.select-row[data-pid="p08"]').scrollIntoView({block:'center'})); await wait(200);
 a = await center(H,'li.select-row[data-pid="p08"] .player-name'); b = await center(H,'li.select-row[data-pid="p10"] .player-name');
 await touch('touchStart',[a]); await wait(450);
 for(let i=1;i<=6;i++){ await touch('touchMove',[{x:a.x, y:a.y+(b.y-a.y)*i/6}]); await wait(30); } await touch('touchEnd',[]); await wait(500);
 ok(JSON.stringify(await sel())==='["p01","p05","p08","p09","p10"]', 'press-and-hold a name then drag selects too: '+JSON.stringify(await sel()));
 // plain tap still toggles one
 await H.tap('li.select-row[data-pid="p12"] .player-name'); await wait(400);
 ok((await sel()).includes('p12'), 'a normal tap still ticks one player');
 ok((await H.evaluate(()=>S.rsvpLog.filter(e=>e.by==='host').length))>=8, 'drag ticks are logged for attendance');
 // select all / clear
 await H.click('button:has-text("Select all")'); await wait(400);
 const ovq = await H.$('[aria-labelledby=ovTitle]');
 ok(!!ovq && (await sel()).length < 16, 'Select all past the format asks first (uneven / bigger / bench)');
 await H.click('button.ov-plan:has-text("extras on the bench")'); await wait(400);
 ok((await sel()).length===16, 'Select all ticks everyone');
 await H.click('.sel-tools button:has-text("Clear")'); await wait(400);
 ok((await sel()).length===0, 'Clear unticks everyone');
 // ---- mouse (laptop) ----
 const L = await phone('#host='+HOSTCODE, {viewport:{width:1100,height:800}});
 await L.evaluate(()=>document.querySelector('li.select-row[data-pid="p03"]').scrollIntoView({block:'center'})); await wait(200);
 a = await center(L,'li.select-row[data-pid="p03"] .player-name'); b = await center(L,'li.select-row[data-pid="p06"] .player-name');
 await L.mouse.move(a.x,a.y); await L.mouse.down(); for(let i=1;i<=8;i++){ await L.mouse.move(a.x, a.y+(b.y-a.y)*i/8); await wait(25); } await L.mouse.up(); await wait(500);
 ok(JSON.stringify(await sel())==='["p03","p04","p05","p06"]', 'mouse: click-and-drag over names selects a range: '+JSON.stringify(await sel()));
 // ---- database: drag a player up ----
 await H.evaluate(()=>{ toggleDatabase(); }); await wait(300);
 const order0 = await H.evaluate(()=>SQUAD.players.map(p=>p.name).slice(0,6).join(','));
 ok(await H.$$eval('.drag-handle',e=>e.length)===16, 'every ranked player has a drag handle');
 await H.evaluate(()=>document.querySelector('li[data-rank-id="p03"]').scrollIntoView({block:'center'})); await wait(200);
 a = await center(H,'li[data-rank-id="p05"] .drag-handle'); b = await center(H,'li[data-rank-id="p02"] .drag-handle');
 await touch('touchStart',[a]); for(let i=1;i<=10;i++){ await touch('touchMove',[{x:a.x, y:a.y+(b.y-a.y)*i/10 - 10}]); await wait(30); } await touch('touchEnd',[]); await wait(500);
 const order1 = await H.evaluate(()=>SQUAD.players.map(p=>p.name).slice(0,6).join(','));
 ok(order1==='P01,P05,P02,P03,P04,P06', 'dragging P05 up above P02 re-ranks it: '+order0+' → '+order1);
 // mouse drag down in the database
 await L.evaluate(()=>toggleDatabase()); await wait(300);
 await L.evaluate(()=>document.querySelector('li[data-rank-id="p02"]').scrollIntoView({block:'center'})); await wait(200);
 a = await center(L,'li[data-rank-id="p01"] .drag-handle'); b = await center(L,'li[data-rank-id="p03"] .drag-handle');
 await L.mouse.move(a.x,a.y); await L.mouse.down(); for(let i=1;i<=10;i++){ await L.mouse.move(a.x, a.y+(b.y-a.y)*i/10 + 10); await wait(25); } await L.mouse.up(); await wait(500);
 const order2 = await H.evaluate(()=>SQUAD.players.map(p=>p.name).slice(0,6).join(','));
 ok(order2==='P05,P02,P03,P01,P04,P06', 'mouse: dragging P01 down below P03: '+order2);
 await H.screenshot({path:'h_db_drag.png'});
 // ---- pickleball abilities ----
 await H.evaluate(()=>{ toggleDatabase(); createSquad('Pickle', 'pickleball'); }); await wait(500);
 const at = await H.evaluate(()=>ATTRIBUTE_ORDER.map(k=>ATTRIBUTES[k].label));
 ok(['Smasher','Shot picker','Volleys','Master spinner'].every(x=>at.includes(x)), 'pickleball abilities include Smasher, Shot picker, Volleys, Master spinner: '+at.join(', '));
 ok(errs.length===0,'no page errors '+JSON.stringify(errs));
 console.log(fails?('\n'+fails+' FAILED'):'\nALL PASSED'); await br.close(); srv.close();
})();
