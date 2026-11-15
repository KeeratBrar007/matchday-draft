// selecting more players than the format needs asks first
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
 const names=['Arjun','Rohan','Vikram','Sahil','Aditya','Karan','Dev','Ishaan','Yuvraj','Nikhil','Om','Kabir','Manav','Jai'];
 for(const [i,n] of names.entries()){ await H.evaluate(([n,i])=>addPlayer(n,[['GK','DEF','MID','FWD'][i%4]],{},false,false),[n,i]); await wait(30); }
 const ids = names.map(n=>n.toLowerCase());
 await H.evaluate(()=>saveState({format:6, selectedIds:[], oddSide:null, extraConfirmedEven:false, benchOk:false})); await wait(300);
 const sel = ()=>H.evaluate(()=>S.selectedIds.slice());
 const modal = ()=>H.evaluate(()=>{ const m=document.querySelector('[aria-labelledby=ovTitle]'); return m ? m.innerText : ''; });
 // tap 12 on the list
 for(const id of ids.slice(0,12)){ await H.click(`li.select-row[data-pid="${id}"]`); await wait(80); }
 ok((await sel()).length===12, 'host taps 12 players for 6v6');
 // 13th tap asks first
 await H.click(`li.select-row[data-pid="manav"]`); await wait(250);
 const m1 = await modal();
 ok((await sel()).length===12 && /That’s 13 players/.test(m1), 'the 13th tap is NOT ticked yet; it asks "That’s 13 players"');
 ok(/Uneven teams: 7v6/.test(m1) && /Make it 7v7/.test(m1) && /Keep 6v6, extras on the bench/.test(m1) && /Manav/.test(m1), 'options: uneven 7v6, make it 7v7, keep 6v6 with a sub (names who’s being added)');
 await H.screenshot({path:'h_overflow.png'});
 // can't keep ticking underneath: modal blocks the page
 const blocked = await H.evaluate(()=>{ const r=document.querySelector('li.select-row[data-pid="jai"]').getBoundingClientRect(); const el=document.elementFromPoint(r.x+r.width/2, Math.min(innerHeight-5, Math.max(5, r.y+r.height/2))); return !!(el && el.closest('.modal-backdrop')); });
 ok(blocked, 'the question covers the list, so nobody else can be ticked until it’s answered');
 await H.click('button:has-text("Cancel")'); await wait(250);
 ok((await sel()).length===12 && !(await modal()), 'Cancel: still 12, Manav not added');
 // uneven
 await H.click(`li.select-row[data-pid="manav"]`); await wait(250);
 await H.click('button.ov-plan:has-text("Uneven teams")'); await wait(400);
 const st1 = await H.evaluate(()=>({n:S.selectedIds.length, f:S.format, o:S.oddSide}));
 ok(st1.n===13 && st1.f===6 && (st1.o==='a'||st1.o==='b') && /Uneven teams confirmed/.test(await txt(H)), 'uneven: Manav added, 6v6 + 1 extra (7v6): '+JSON.stringify(st1));
 // 14th asks again (limit is now 13)
 await H.click(`li.select-row[data-pid="jai"]`); await wait(250);
 const m2 = await modal();
 ok((await sel()).length===13 && /That’s 14 players/.test(m2) && !/Uneven/.test(m2) && /Make it 7v7/.test(m2), '14th tap asks again (no uneven option for an even number)');
 await H.click('button.ov-plan:has-text("Make it 7v7")'); await wait(400);
 const st2 = await H.evaluate(()=>({n:S.selectedIds.length, f:S.format, o:S.oddSide}));
 ok(st2.n===14 && st2.f===7 && !st2.o, '7v7: Jai added, format 7v7, no extra: '+JSON.stringify(st2));
 // shrink the format with 14 ticked: banner, then bench
 await H.evaluate(()=>setFormat(6)); await wait(300);
 ok(/14 ticked for 6v6 \(12 needed\)/.test(await txt(H)), 'switching to 6v6 with 14 ticked shows a warning');
 await H.click('#overBanner button'); await wait(250);
 await H.click('button.ov-plan:has-text("Keep 6v6")'); await wait(400);
 ok(await H.evaluate(()=>S.benchOk)===true && !(await H.$('#overBanner')) && /2 on the bench \(subs\)/.test(await txt(H)), 'Keep 6v6: 2 on the bench, warning gone');
 // once bench is chosen, more ticks are allowed
 await H.evaluate(()=>saveState({selectedIds: S.selectedIds.slice(0,12), benchOk:true})); await wait(300);
 await H.click(`li.select-row[data-pid="jai"]`); await wait(250);
 ok((await sel()).length===13 && !(await modal()), 'with bench chosen, the 13th goes straight on');
 // Select all with 5v5: ticks 10, asks about the other 4
 await H.evaluate(()=>saveState({format:5, selectedIds:[], oddSide:null, extraConfirmedEven:false, benchOk:false})); await wait(400);
 await H.click('button:has-text("Select all")'); await wait(400);
 const m3 = await modal();
 ok((await sel()).length===10 && /That’s 14 players/.test(m3) && /Make it 7v7/.test(m3), 'Select all with 5v5: ticks 10, then asks about the other 4');
 await H.click('button.ov-plan:has-text("Make it 7v7")'); await wait(400);
 ok((await sel()).length===14 && await H.evaluate(()=>S.format)===7, '...Make it 7v7 adds the other 4');
 // drag-style add past the limit (same path as dragging down the ticks)
 await H.evaluate(()=>saveState({format:5, selectedIds:[], oddSide:null, extraConfirmedEven:false, benchOk:false})); await wait(400);
 await H.evaluate((ids)=>commitSelection(ids.slice(0,11), true), ids); await wait(400);
 const m4 = await modal();
 ok((await sel()).length===10 && /That’s 11 players/.test(m4) && /Uneven teams: 6v5/.test(m4), 'dragging over 11 for 5v5: 10 ticked, asks about the 11th (uneven 6v5)');
 await H.click('button:has-text("Cancel")'); await wait(300);
 // a friend ticking himself in isn't blocked, but the host is told
 const F = await phone(''); await login(F, 'Jai');
 await F.evaluate(()=>toggleSelected('jai')); await wait(500);
 ok((await sel()).length===11, 'a friend can still tick himself in');
 ok(/11 ticked for 5v5 \(10 needed\)/.test(await txt(H)), '...and the host sees the warning to sort it out');
 ok(errs.length===0, 'no page errors '+errs.join(' | '));
 ok(denied().length===0, 'no denied writes '+JSON.stringify(denied()));
 console.log(fails? fails+' FAILED':'ALL PASS'); await br.close(); srv.close(); process.exit(fails?1:0);
})();
