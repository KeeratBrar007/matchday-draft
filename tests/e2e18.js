// already paid before the first money message
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
 const names=['Keerat','Arjun','Rohan','Vikram','Sahil','Aditya','Karan','Dev','Ishaan','Yuvraj','Nikhil','Om'];
 for(const [i,n] of names.entries()){ await H.evaluate(([n,i])=>addPlayer(n,[['GK','DEF','MID','FWD'][i%4]],{},false,false),[n,i]); await wait(40); }
 await wait(300);

 await H.evaluate(()=>saveSquadDoc(Object.assign({}, SQUAD, {pay:{upi:'keerat@okaxis', name:'Keerat', playerId:'keerat'}}))); await wait(200);
 const ids = names.map(n=>n.toLowerCase());
 await H.evaluate((ids)=>{ toggleLogMatch(); ids.slice(0,6).forEach(id=>logToggleTeam(id,'a')); ids.slice(6,12).forEach(id=>logToggleTeam(id,'b')); logSetWinner('a'); saveLoggedMatch(); }, ids); await wait(500);
 const hid = await H.evaluate(()=>HISTORY[0].id);
 await H.evaluate((hid)=>openFeeEditor(hid), hid); await wait(200);
 await H.fill('.fee-item >> nth=0 >> input[type=number]','1200'); await H.press('.fee-item >> nth=0 >> input[type=number]','Tab'); await wait(150);
 // Vikram already paid cash, Sahil already paid UPI — before the first message
 const row = n=>`.fee-pl:has-text("${n}")`;
 ok(await H.$$eval('.fee-pl .fee-prepaid',e=>e.length)===11, 'every player who owes has the already-paid buttons (not the collector)');
 await H.click(row('Vikram')+' >> button:has-text("Cash ✓")'); await wait(100);
 await H.click(row('Sahil')+' >> button:has-text("UPI ✓")'); await wait(100);
 // mistap and undo on Dev
 await H.click(row('Dev')+' >> button:has-text("Cash ✓")'); await wait(100);
 await H.click(row('Dev')+' >> button:has-text("Cash ✓")'); await wait(100);
 const r = async n=> (await H.$eval(row(n), e=>e.innerText)).replace(/\s+/g,' ');
 ok(/paid ₹100 ✓ cash/.test(await r('Vikram')) && /paid ₹100 ✓ UPI/.test(await r('Sahil')) && /owes ₹100/.test(await r('Dev')), 'rows show Vikram paid cash, Sahil paid UPI, Dev still owes (tap again undoes)');
 await H.screenshot({path:'h_fee_prepaid.png'});
 // phone width: no sideways scroll
 ok(await H.evaluate(()=>document.querySelector('.modal').scrollWidth <= document.querySelector('.modal').clientWidth+1), 'editor rows fit the phone width');
 await H.click('button:has-text("Save & send to WhatsApp")'); await wait(400);
 const msg = decodeURIComponent((await H.evaluate(()=>window.__opened.slice(-1)[0])).split('text=')[1]);
 console.log('--- fee message ---\n'+msg+'\n---');
 const toPay = msg.split('*To pay:*')[1].split('\n\n')[0];
 ok(!/Vikram|Sahil/.test(toPay) && (toPay.match(/• /g)||[]).length===9, 'To pay list leaves out the two who already paid (9 left)');
 ok(/✅ \*Already paid:\* .*Vikram \(cash\)/.test(msg) && /Sahil \(UPI\)/.test(msg), 'message lists them as already paid');
 const f = await H.evaluate(()=>HISTORY[0].fees);
 ok(f.paid.vikram && f.paid.vikram.how==='cash' && f.paid.sahil.how==='upi' && !f.paid.dev, 'saved as paid on the match');
 // payments window agrees
 await H.evaluate(()=>togglePayments()); await wait(200);
 const pt = await txt(H);
 ok(/2\/11 paid/.test(pt) && /paid by CASH/.test(pt) && /paid by UPI/.test(pt), 'Payments window shows 2/11 paid');
 ok(!/Vikram ₹100|Sahil ₹100/.test(pt.split(/Still to collect/i)[1].split(/Matches/i)[0]), 'they are not in "still to collect"');
 await H.evaluate(()=>togglePayments());
 // friends
 const V = await phone(''); await login(V,'Vikram');
 ok(!/You owe/.test(await txt(V)), 'Vikram is not asked to pay');
 const D = await phone(''); await login(D,'Dev');
 ok(/You owe ₹100/.test(await txt(D)), 'Dev still owes ₹100');
 // everyone paid -> message says so and has no pay link
 await H.evaluate((hid)=>openFeeEditor(hid), hid); await wait(200);
 await H.evaluate(()=>{ feeDraft.players.forEach(id=>{ if(id!=='keerat') feeDraft.paid[id] = {how:'cash', at:new Date().toISOString()}; }); render(); });
 await H.click('button:has-text("Save & send to WhatsApp")'); await wait(400);
 const msg2 = decodeURIComponent((await H.evaluate(()=>window.__opened.slice(-1)[0])).split('text=')[1]);
 ok(!/To pay/.test(msg2) && /Everyone’s paid/.test(msg2) && !/pay=1/.test(msg2), 'when everyone has paid the message says so and has no pay link');
 ok(errs.length===0, 'no page errors '+errs.join(' | '));
 ok(denied().length===0, 'no denied writes '+JSON.stringify(denied()));
 console.log(fails? fails+' FAILED':'ALL PASS'); await br.close(); srv.close(); process.exit(fails?1:0);
})();
