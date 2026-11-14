const { chromium, devices } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path');
const HOSTCODE = fs.readFileSync(path.join(__dirname,'.hostcode'),'utf8').trim();
const srv = http.createServer((q,r)=>{ r.setHeader('content-type','text/html'); r.end(fs.readFileSync(path.join(__dirname,'site/index.html'))); }).listen(0);
let fails=0; const ok=(c,m)=>{ console.log((c?'PASS ':'FAIL ')+m); if(!c) fails++; };
const store={}; const pages=[]; const errs=[]; const wait=ms=>new Promise(r=>setTimeout(r,ms));
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
  }
  const txt=p=>p.evaluate(()=>document.body.innerText);
  const H = await phone('#host='+HOSTCODE);
  const names=['Arjun','Rohan','Vikram','Sahil','Aditya','Karan','Dev','Ishaan','Yuvraj','Nikhil'];
  for(let i=0;i<names.length;i++){ await H.evaluate(([n,i])=>addPlayer(n,[i<2?'GK':i<5?'DEF':i<9?'MID':'FWD'],{},false,false),[names[i],i]); await wait(50); }
  const F = await phone(''); await F.fill('#loginNameInput','Arjun'); await F.press('#loginNameInput','Enter'); await F.waitForSelector('#pinSetInput',{timeout:3000}).catch(()=>{}); await F.evaluate(()=>{ if(pinModalOpen) closePinModal(true); });

  // --- before any match: hub card but no last-match card
  let ft = await txt(F);
  ok(/Ready for kickoff/i.test(ft) && /No live draft running right now/.test(ft), 'friend sees the "ready for kickoff" hub card');
  ok(!/Last matchday/i.test(ft), 'no last-match card until a match exists');
  ok(!/Ready for kickoff/i.test(await txt(H)), 'host does not get the friends’ hub card');

  // --- two finished matches via history entries
  const mk=(date,a,b,winner,sa,sb,scorers)=>({date,format:5,mode:'random',teamA:{players:a.map(x=>x[0].toUpperCase()+x.slice(1))},teamAIds:a,teamB:{players:b.map(x=>x[0].toUpperCase()+x.slice(1))},teamBIds:b,subs:[],subIds:[],winner,scoreA:sa,scoreB:sb,scorers,assists:[],duration:40});
  const now=Date.now();
  await H.evaluate(([e1,e2])=>{ addToHistory(e1); addToHistory(e2); },[
    mk(new Date(now-86400000*2).toISOString(),['arjun','rohan','vikram'],['sahil','aditya','karan'],'a',3,1,[{playerId:'arjun',goals:2},{playerId:'rohan',goals:1}]),
    mk(new Date(now-3600000).toISOString(),['arjun','sahil','dev'],['rohan','karan','ishaan'],'a',2,0,[{playerId:'arjun',goals:1},{playerId:'sahil',goals:1}])
  ]);
  await wait(500);
  ft = await txt(F);
  ok(/Last matchday/i.test(ft), 'friend now sees the last-match card');
  ok(await F.evaluate(()=>document.querySelector('.last-match .sc').innerText.replace(/\s/g,''))==='2:0', 'last-match scoreline is the most recent match (2 : 0)');
  ok(/Team A victory/.test(ft), 'winner chip shown');

  // --- leaderboard
  await F.evaluate(()=>toggleAwards()); await wait(150);
  ok(await F.$$eval('.pod',e=>e.length)===3, 'podium has three places');
  ok(await F.$eval('.pod.first .pn',e=>e.innerText)==='Arjun', 'Arjun (2 wins from 2) is first on the podium');
  const arjunRow = await F.$$eval('.stand-row:not(.head)',rows=>rows.map(r=>r.innerText.replace(/\s+/g,' ')));
  ok(/Arjun/.test(arjunRow[0]) && /100%/.test(arjunRow[0]), 'table lists Arjun first with 100% win rate: '+arjunRow[0]);
  const rohan = arjunRow.find(r=>/Rohan/.test(r)); ok(/50%/.test(rohan), 'Rohan (1 win from 2) shows 50%: '+rohan);
  ok(await F.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1), 'no page-level sideways scroll with the table');
  await F.screenshot({path:'awards.png'});
  await F.evaluate(()=>toggleAwards());

  // --- past matches
  ok(!(await F.$('button:has-text("Past matches")')), 'friends have no Past matches button (they use their profile)');
  await F.evaluate(()=>toggleHistory()); await wait(150);
  ok(!(await F.$('details.hdetails')), 'and the Past matches window will not open for a friend');
  await F.evaluate(()=>{ showHistory=false; }); 
  const F_ = F; const Fh = H;
  await H.evaluate(()=>toggleHistory()); await wait(150);
  ok(await H.$$eval('.history-item',e=>e.length)===2, 'two past-match cards');
  ok(await H.$$eval('details.hdetails[open]',e=>e.length)===0, 'lineups start collapsed');
  await H.click('details.hdetails summary'); await wait(100);
  ok(await H.$$eval('details.hdetails[open]',e=>e.length)===1, 'tapping Lineups expands one card');
  await F.evaluate(()=>toggleSelected('arjun')); await wait(400);   // a friend's change re-renders the host's page
  ok(await H.$$eval('details.hdetails[open]',e=>e.length)===1, 'expanded card stays open through a live update');
  await H.screenshot({path:'history.png'});
  await H.evaluate(()=>toggleHistory());
  await H.evaluate(()=>toggleHistory()); await wait(100);
  ok(/Log a match played outside/.test(await txt(H)), 'host still has the "log a match" button'); await H.evaluate(()=>toggleHistory());

  // --- setup search (friend)
  await F.fill('#setupSearchInput','kar'); await wait(100);
  let rows = await F.$$eval('li.select-row .player-name',e=>e.map(x=>x.innerText.trim()));
  ok(rows.length===1 && rows[0]==='Karan', 'setup search "kar" shows only Karan: '+JSON.stringify(rows));
  await F.fill('#setupSearchInput','zzz'); await wait(100);
  ok(/Nobody matches/.test(await txt(F)), 'no-match message');
  await F.fill('#setupSearchInput',''); await wait(100);
  ok(await F.$$eval('li.select-row',e=>e.length)===10, 'clearing search restores all 10');

  // --- host database search + filters
  await H.evaluate(()=>toggleDatabase()); await wait(150);
  ok(await H.$$eval('.modal .player-list li.player-row-wrap',e=>e.length)===10, 'database lists all 10');
  ok(await H.$$eval('button[title="Weaker"]',e=>e.length)===10, 'rank arrows visible with no filter');
  await H.click('#dbSearchInput'); await H.keyboard.type('a');
  await F.evaluate(()=>{}); // other phone writes mid-typing to force a live re-render on host
  await F.evaluate(()=>toggleSelected('arjun')); await wait(300);
  await H.keyboard.type('r'); await wait(150);
  ok(await H.$eval('#dbSearchInput',e=>e.value)==='ar', 'typing keeps focus through a live update (value "ar")');
  rows = await H.$$eval('.modal .player-list li .player-name',e=>e.map(x=>x.innerText.trim()));
  ok(rows.length===2 && rows.includes('Arjun') && rows.includes('Karan'), 'search "ar" -> Arjun and Karan (both contain "ar"): '+JSON.stringify(rows));
  ok(await H.$$eval('button[title="Weaker"]',e=>e.length)===0, 'rank arrows hidden while filtering');
  await H.fill('#dbSearchInput',''); await wait(100);
  await H.click('.db-filter .chip-toggle:has-text("GK")'); await wait(100);
  rows = await H.$$eval('.modal .player-list li .player-name',e=>e.map(x=>x.innerText.trim()));
  ok(rows.length===2 && rows.includes('Arjun') && rows.includes('Rohan'), 'GK filter -> Arjun and Rohan: '+JSON.stringify(rows));
  await H.click('.db-filter .chip-toggle:has-text("All")'); await wait(100);
  ok(await H.$$eval('button[title="Weaker"]',e=>e.length)===10, 'arrows are back after clearing the filter');
  await H.screenshot({path:'database.png'});
  ok(await H.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1), 'host database: no sideways scroll');

  /*__DENIED_DUMP__*/ console.log('DENIED '+JSON.stringify(Object.keys(store).filter(k=>k.startsWith('__denied/')).map(k=>store[k])));
  ok(errs.length===0,'no page errors '+JSON.stringify(errs.slice(0,3)));
  await br.close(); srv.close();
  console.log(fails?`\n${fails} FAILED`:'\nALL PASSED'); process.exit(fails?1:0);
})().catch(e=>{ console.error('CRASH',e); process.exit(2); });
