// turf money: split, pay info, UPI link + QR, marking paid, carry-over
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
 // settings
 await H.click('button:has-text("💰 Payments")'); await wait(150);
 ok(/no UPI ID yet/.test(await txt(H)), 'payments window says no UPI yet');
 await H.click('button:has-text("Settings")'); await H.fill('#payUpiInput','keerat bank'); await H.click('.modal button:has-text("Save")'); await wait(150);
 ok(/doesn’t look like a UPI ID/.test(await txt(H)), 'a bad UPI ID is rejected');
 await H.fill('#payUpiInput','keerat@okaxis'); await H.fill('#payNameInput','Keerat');
 await H.selectOption('.modal select', {label:'Keerat'}); await H.click('.modal button:has-text("Save")'); await wait(300);
 ok(JSON.stringify(await H.evaluate(()=>SQUAD.pay))==='{"upi":"keerat@okaxis","name":"Keerat","playerId":"keerat"}', 'UPI settings saved on the game');
 await H.evaluate(()=>togglePayments());
 // a 6v6 match (logged)
 const ids = names.map(n=>n.toLowerCase());
 await H.evaluate((ids)=>{ toggleLogMatch(); ids.slice(0,6).forEach(id=>logToggleTeam(id,'a')); ids.slice(6,12).forEach(id=>logToggleTeam(id,'b')); logSetWinner('a'); saveLoggedMatch(); }, ids); await wait(500);
 const hid = await H.evaluate(()=>HISTORY[0].id);
 // split: turf 1000 by collector, 2 water 100 by Arjun & Rohan
 await H.evaluate((hid)=>openFeeEditor(hid), hid); await wait(200);
 ok(/Split the cost/.test(await txt(H)) && await H.$$eval('.fee-pl',e=>e.length)===12, 'editor lists the 12 who played');
 await H.fill('.fee-item >> nth=0 >> input[type=number]','1000'); await H.press('.fee-item >> nth=0 >> input[type=number]','Tab'); await wait(100);
 await H.click('button:has-text("＋ Water ₹100")'); await H.click('button:has-text("＋ Water ₹100")'); await wait(100);
 await H.selectOption('.fee-item >> nth=1 >> select', 'arjun'); await H.selectOption('.fee-item >> nth=2 >> select', 'rohan'); await wait(150);
 const et = await txt(H);
 ok(/Total ₹1,200 · 12 sharing · ₹100 each/.test(et), 'total ₹1200, ₹100 each');
 const plRes = await H.$$eval('.fee-pl',e=>e.map(x=>x.innerText.replace(/\s+/g,' ')));
 ok(/Keerat.*collects/.test(plRes[0]) && /Arjun.*covered/.test(plRes[1]) && /Rohan.*covered/.test(plRes[2]) && /Vikram.*owes ₹100/.test(plRes[3]), 'Keerat collects, Arjun & Rohan covered by water, others owe ₹100');
 await H.screenshot({path:'h_fee_editor.png', fullPage:false});
 await H.click('button:has-text("Save & send to WhatsApp")'); await wait(400);
 const msg = decodeURIComponent((await H.evaluate(()=>window.__opened.slice(-1)[0])).split('text=')[1]);
 console.log('--- fee message ---\n'+msg+'\n---');
 ok(/Total ₹1,200 \(Turf ₹1,000, Water ₹100, Water ₹100\)/.test(msg) && /\*₹100 each\* · 12 players/.test(msg) && /Already covered: Arjun, Rohan/.test(msg) && (msg.match(/• /g)||[]).length===9 && /keerat@okaxis/.test(msg) && /pay=1/.test(msg), 'WhatsApp message: total, each, 9 to pay, covered, UPI, pay link');
 // friend view
 const V = await phone(''); await login(V,'Vikram');
 const vt = await txt(V);
 ok(/You owe ₹100/.test(vt) && /keerat@okaxis/.test(vt), 'Vikram sees he owes ₹100 and where to pay');
 const href = await V.$eval('#payCard a.btn', a=>a.getAttribute('href'));
 ok(/^upi:\/\/pay\?pa=keerat@okaxis&pn=Keerat&am=100\.00&cu=INR&tn=/.test(href), 'Pay button is a UPI link with the amount: '+href);
 await V.click('button:has-text("Show QR")'); await wait(200);
 const qr = await V.$('#payCard .qr-box'); await qr.screenshot({path:'qr_test.png'});
 const dec = cp.execSync(`python3 -c "import cv2; d=cv2.QRCodeDetector(); v,_,_=d.detectAndDecode(cv2.imread('qr_test.png')); print(v)"`).toString().trim();
 ok(dec===href, 'the QR scans to exactly the same UPI payment: '+dec);
 await V.screenshot({path:'f_pay_card.png', fullPage:false});
 const A = await phone(''); await login(A,'Arjun');
 ok(!/You owe/.test(await txt(A)), 'Arjun (brought water) owes nothing');
 const K = await phone(''); await login(K,'Keerat');
 ok(!/You owe/.test(await txt(K)), 'Keerat (collector) is never asked to pay himself');
 // host summary + marking
 ok(/₹900 to collect/.test(await txt(H)), 'host sees ₹900 to collect on the Matchday page');
 await V.evaluate((hid)=>markPaid(hid,'vikram','cash'), hid); await wait(300);
 ok(!(await H.evaluate((hid)=>HISTORY.find(h=>h.id===hid).fees.paid.vikram, hid)), 'a friend can’t mark themselves paid (button is host-only)');
 await V.evaluate((hid)=>updateHistoryResult(hid,{fees:null}), hid); await wait(300);
 ok(!!(await H.evaluate((hid)=>HISTORY.find(h=>h.id===hid).fees, hid)), '...and the database refuses a friend wiping the costs directly');
 await H.evaluate(()=>togglePayments()); await wait(150);
 await H.click('.pay-row:has-text("Vikram") >> button:has-text("Cash ✓")'); await wait(400);
 ok((await H.evaluate((hid)=>HISTORY.find(h=>h.id===hid).fees.paid.vikram.how, hid))==='cash', 'host marks Vikram paid in cash');
 ok(!/You owe/.test(await txt(V)), 'Vikram’s card disappears once paid');
 await V.evaluate(()=>goMyProfile()); await wait(200);
 ok(/All paid up ✓/.test(await txt(V)), 'his profile says all paid up');
 await H.click('.pay-row:has-text("Sahil") >> button:has-text("UPI ✓")'); await wait(300);
 await H.click('.pay-row:has-text("Sahil") >> button:has-text("UPI ✓")'); await wait(300);
 ok(!(await H.evaluate((hid)=>HISTORY.find(h=>h.id===hid).fees.paid.sahil, hid)), 'tapping again undoes a mark');
 await H.screenshot({path:'h_payments.png', fullPage:false});
 await H.evaluate(()=>togglePayments());
 // second match, custom split -> carry over
 await H.evaluate((ids)=>{ toggleLogMatch(); ids.slice(0,6).forEach(id=>logToggleTeam(id,'a')); ids.slice(6,12).forEach(id=>logToggleTeam(id,'b')); saveLoggedMatch(); }, ids); await wait(500);
 const hid2 = await H.evaluate(()=>HISTORY[0].id);
 await H.evaluate((hid2)=>{ openFeeEditor(hid2); }, hid2); await wait(150);
 ok(/Turf/.test(await H.$eval('.fee-item input',e=>e.value)) && (await H.$eval('.fee-item input[type=number]',e=>e.value))==='1000' && await H.$$eval('.fee-item',e=>e.length)===3, 'next time it starts from last week’s costs (Turf ₹1000 + 2 water)');
 await H.evaluate(()=>{ feeDraft.items.splice(1,2); feeDraft.split='custom'; feeDraft._all.forEach(id=>feeSetCustom(id, id==='om'?0:90)); feeDraft.custom.vikram=110; feeTogglePlayer('om'); }); await wait(100);
 await H.evaluate(()=>saveFees(false)); await wait(400);
 await V.evaluate(()=>goHome()); await wait(200); const vt2 = await txt(V);
 ok(/You owe ₹110/.test(vt2), 'custom split: Vikram owes his custom ₹110');
 const D = await phone(''); await login(D,'Dev');
 ok(/You owe ₹190/.test(await txt(D)) && /2 matches/.test(await txt(D)), 'unpaid weeks add up: Dev owes ₹190 over 2 matches');
 const O = await phone(''); await login(O,'Om');
 ok(/You owe ₹100/.test(await txt(O)) && /1 match\b/.test(await txt(O)), 'Om unticked in week 2 = free that week; he only owes week 1’s ₹100');
 // pay link opens the card
 const D2 = await phone('?g='+(await H.evaluate(()=>currentSquadId))+'&pay=1'); await login(D2,'Dev'); await wait(400);
 ok(await D2.evaluate(()=>!scrollToPay) && !!(await D2.$('#payCard')), 'the pay link opens straight on the payment card');
 // nudge
 await H.evaluate(()=>{ window.__opened=[]; togglePayments(); }); await wait(100); await H.click('button:has-text("Nudge on WhatsApp")'); await wait(100);
 const nudge = decodeURIComponent((await H.evaluate(()=>window.__opened[0])).split('text=')[1]);
 ok(/still to pay/.test(nudge) && /Dev ₹190 \(2 matches\)/.test(nudge) && !/Vikram ₹100/.test(nudge), 'nudge lists who still owes (with carried-over weeks)');
 ok(denied().length===1, 'exactly that one friend attempt was refused, nothing legitimate was');
 ok(errs.length===0,'no page errors '+JSON.stringify(errs));
 console.log(fails?('\n'+fails+' FAILED'):'\nALL PASSED'); await br.close(); srv.close();
})();
