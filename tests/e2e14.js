// guests: whose guest, and their turf money
const { chromium, devices } = require('playwright');
const http=require('http'),fs=require('fs'),path=require('path');
const HOSTCODE=fs.readFileSync(path.join(__dirname,'.hostcode'),'utf8').trim();
const srv=http.createServer((q,r)=>{ if(q.url.startsWith('/sw.js')){r.statusCode=404;return r.end();} r.setHeader('content-type','text/html'); r.end(fs.readFileSync(path.join(__dirname,'site/index.html'))); }).listen(0);
const store={}; const pages=[]; const errs=[]; const wait=ms=>new Promise(r=>setTimeout(r,ms));
let fails=0; const ok=(c,m)=>{ console.log((c?'PASS ':'FAIL ')+m); if(!c) fails++; };
const STUB = "window.__opened=[]; window.open=(u)=>{ window.__opened.push(u); return null; };";
(async()=>{
 const br=await chromium.launch(); const url=`http://localhost:${srv.address().port}/`;
 async function phone(hash){ const ctx=await br.newContext({...devices['iPhone 13']}); await ctx.route(/gstatic\.com|googleapis\.com/,r=>r.abort()); const p=await ctx.newPage();
  p.on('pageerror',e=>errs.push(String(e)));
  await p.exposeFunction('__fsRelay',async(pth,json)=>{ if(json===null) delete store[pth]; else store[pth]=JSON.parse(json); for(const q of pages){ if(q!==p) await q.evaluate(([a,b])=>window.__mockApply(a,b),[pth,json]).catch(()=>{}); } });
  await p.addInitScript('window.__mockInit='+JSON.stringify(store)+';'); await p.addInitScript(STUB); await p.addInitScript(fs.readFileSync(path.join(__dirname,'mock2.js'),'utf8')); pages.push(p); await p.goto(url+(hash||'')); await p.evaluate((j)=>window.__mockApplyAll && window.__mockApplyAll(JSON.parse(j)), JSON.stringify(store)).catch(()=>{}); await p.waitForFunction(()=>dbReady&&rosterLoaded); await wait(300); return p; }
 async function login(F,name){ await F.fill('#loginNameInput',name); await F.press('#loginNameInput','Enter'); await wait(600); await F.evaluate(()=>{ if(pinModalOpen) closePinModal(true); }); await wait(150); }
 const txt = p=>p.evaluate(()=>document.body.innerText);
 const H=await phone('#host='+HOSTCODE);
 const names=['Keerat','Arjun','Rohan','Vikram','Sahil','Aditya','Karan','Dev','Ishaan'];
 for(const [i,n] of names.entries()){ await H.evaluate(([n,i])=>addPlayer(n,[['GK','DEF','MID','FWD'][i%4]],{},false,false),[n,i]); await wait(40); }
 await H.evaluate(()=>{ saveState({format:6}); saveSquadDoc(Object.assign({}, SQUAD, {pay:{upi:'keerat@okaxis', name:'Keerat', playerId:'keerat'}})); }); await wait(300);
 const st = await txt(H);
 ok(/Guest of/i.test(st) && /Everyone playing/.test(st), 'guest form has "Guest of" with an Everyone option');
 // Rahul: guest of Arjun
 await H.fill('input[placeholder="Guest\'s name"]','Rahul');
 await H.click('.chip-toggle:has-text("Arjun") >> nth=-1'); await wait(100);
 await H.click('button:has-text("+ Guest for today")'); await wait(300);
 // Sam: guest of Rohan & Vikram
 await H.fill('input[placeholder="Guest\'s name"]','Sam');
 await H.click('.chip-toggle:has-text("Rohan") >> nth=-1'); await H.click('.chip-toggle:has-text("Vikram") >> nth=-1'); await wait(100);
 await H.click('button:has-text("+ Guest for today")'); await wait(300);
 // Tom: everyone's guest
 await H.fill('input[placeholder="Guest\'s name"]','Tom');
 await H.click('.chip-toggle:has-text("Everyone playing") >> nth=-1'); await wait(100);
 await H.click('button:has-text("+ Guest for today")'); await wait(300);
 const g = await H.evaluate(()=>SQUAD.guests.map(x=>x.name+':'+x.of.join('+')));
 ok(JSON.stringify(g)==='["Rahul:arjun","Sam:rohan+vikram","Tom:*"]', 'saved who brought each guest: '+g.join(' '));
 const rows = await txt(H);
 ok(/Rahul\s*Guest of Arjun/i.test(rows) && /Sam\s*Guest of Rohan & Vikram/i.test(rows) && /Tom\s*Everyone’s guest/i.test(rows), 'labels show on the match-day list');
 // edit: Sam becomes Rohan only
 await H.click('li:has-text("Sam") >> button[title="Whose guest?"]'); await wait(150);
 await H.click('.edit-panel .chip-toggle:has-text("Vikram")'); await wait(300);
 ok(JSON.stringify(await H.evaluate(()=>SQUAD.guests.find(x=>x.name==='Sam').of))==='["rohan"]', 'host can change whose guest it is afterwards');
 await H.screenshot({path:'h_guests.png', fullPage:true});
 // play + split: 9 players + 3 guests = 12, turf 1200 -> 100 each
 await H.evaluate(()=>{ saveState({selectedIds: SQUAD.players.map(p=>p.id).concat(SQUAD.guests.map(g=>g.id))}); }); await wait(300);
 await H.evaluate(()=>goToMode()); await wait(200); await H.evaluate(()=>chooseMode('random')); await wait(200); await H.evaluate(()=>confirmRandom()); await wait(500);
 const hid = await H.evaluate(()=>S.lastHistoryId);
 const ft = await txt(H);
 ok(/Rahul.*Guest of Arjun/is.test(ft), 'final teams show whose guest');
 await H.evaluate((hid)=>{ openFeeEditor(hid); feeDraft.items=[{label:'Turf', amount:1200, paidBy:'_c'}]; render(); }, hid); await wait(200);
 const ed = await txt(H);
 ok(/Guests’ share is paid by whoever brought them/.test(ed), 'editor offers "guests paid by whoever brought them" (on by default)');
 const lines = await H.$$eval('.fee-pl',e=>e.map(x=>x.innerText.replace(/\s+/g,' ')));
 const find = n=>lines.find(l=>l.startsWith(n))||'';
 ok(/paid by Arjun/.test(find('Rahul')) && /owes ₹212 incl\. Rahul, Tom/.test(find('Arjun')), 'Rahul’s ₹100 moves to Arjun (₹100 + ₹100 + ₹12 share of Tom = ₹212): '+find('Arjun'));
 ok(/paid by Rohan/.test(find('Sam')) && /owes ₹212 incl\. Sam, Tom/.test(find('Rohan')), 'Sam’s ₹100 moves to Rohan');
 ok(/paid by everyone/.test(find('Tom')) && /owes ₹112 incl\. Tom/.test(find('Vikram')), 'Tom (everyone’s guest) is spread over the 9 regulars: ₹100 ÷ 9 rounded up = ₹12 each: '+find('Vikram'));
 await H.screenshot({path:'h_guest_fees.png', fullPage:false});
 await H.evaluate(()=>saveFees(true)); await wait(400);
 const msg = decodeURIComponent((await H.evaluate(()=>window.__opened.slice(-1)[0])).split('text=')[1]);
 ok(/Arjun ₹212 \(incl\. guest Rahul, Tom\)/.test(msg) && /Guests: .*Rahul \(guest of Arjun\)/.test(msg) && /Tom \(everyone’s guest\)/.test(msg), 'WhatsApp message explains the guest money');
 const A=await phone(''); await login(A,'Arjun');
 ok(/You owe ₹212/.test(await txt(A)) && /incl\. guests: Rahul, Tom/.test(await txt(A)), 'Arjun sees ₹212, including his guest Rahul');
 // switch the option off: guests pay their own (host marks cash)
 await H.evaluate((hid)=>{ openFeeEditor(hid); feeDraft.guestsByHost=false; saveFees(false); }, hid); await wait(400);
 ok(/You owe ₹100/.test(await txt(A)), 'with the option off, guests pay their own share and Arjun is back to ₹100');
 await H.evaluate(()=>togglePayments()); await wait(150);
 ok(/Rahul/.test(await H.$eval('.modal',e=>e.innerText)), 'guests then appear in the host’s list to mark paid (cash)');
 ok(errs.length===0,'no page errors '+JSON.stringify(errs));
 console.log(fails?('\n'+fails+' FAILED'):'\nALL PASSED'); await br.close(); srv.close();
})();
