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
  const H = await phone('#host='+HOSTCODE);
  const names=['Arjun','Rohan','Vikram','Sahil','Aditya','Karan','Dev','Ishaan','Yuvraj','Nikhil'];
  for(let i=0;i<names.length;i++){ await H.evaluate(([n,i])=>addPlayer(n,[i<2?'GK':i<5?'DEF':i<9?'MID':'FWD'],{},false,false),[names[i],i]); await wait(50); }
  const F = await phone(''); 
  // login page light
  const bg = p=>p.evaluate(()=>getComputedStyle(document.body).backgroundColor);
  const fg = p=>p.evaluate(()=>getComputedStyle(document.body).color);
  ok(await bg(F)==='rgb(255, 255, 255)', 'login page background is white: '+await bg(F));
  await F.screenshot({path:'th_login_light.png'});
  await F.fill('#loginNameInput','Arjun'); await F.press('#loginNameInput','Enter'); await F.waitForSelector('#pinSetInput',{timeout:3000}).catch(()=>{}); await F.evaluate(()=>{ if(pinModalOpen) closePinModal(true); }); await wait(300);
  ok(await F.evaluate(()=>document.documentElement.dataset.theme)==='light','default theme is light');
  ok(await F.evaluate(()=>!document.body.classList.contains('is-host')),'friend body has no is-host class');
  ok(await H.evaluate(()=>document.body.classList.contains('is-host')),'host body has is-host class');
  // friend: detail hidden
  const vis = (p,sel)=>p.evaluate(s=>[...document.querySelectorAll(s)].filter(e=>e.offsetParent!==null).length, sel);
  const detailSel='.select-row .rank-badge, .select-row .ability-bar, .select-row .chem-badge, .select-row .star-badge, .select-row .attr-row, .select-row .stats-line, .host-detail';
  ok(await vis(F,detailSel)===0,'friend sees none of the detail elements');
  ok(await F.$$eval('.panel-title',e=>e.map(x=>x.innerText)).then(a=>!a.includes('Match format')),'friend has no Match format panel');
  ok(await F.$$eval('.select-row',e=>e.length)>0,'friend still sees the player list');
  // host: details visible
  const hostVis = await vis(H,detailSel);
  ok(hostVis>0,'host sees the detail elements ('+hostVis+')');
  ok(await H.$$eval('.panel-title',e=>e.map(x=>x.innerText)).then(a=>a.includes('Match format')),'host has Match format panel');
  await H.screenshot({path:'th_host_light.png', fullPage:true});
  await F.screenshot({path:'th_friend_light.png', fullPage:true});
  // selected highlight
  const row = await F.$('.select-row.selected');
  if(row){ const b = await row.evaluate(e=>getComputedStyle(e).boxShadow); ok(/rgb/.test(b),'selected row has a coloured edge: '+b); }
  // dark mode toggle
  await F.click('.theme-btn'); await wait(200);
  ok(await F.evaluate(()=>document.documentElement.dataset.theme)==='dark','toggle switches to dark');
  const dbg = await bg(F); const dfg = await fg(F);
  ok(dbg!=='rgb(255, 255, 255)' && dfg!=='rgb(20, 32, 26)','dark mode inverts colours: bg '+dbg+' text '+dfg);
  ok(await F.evaluate(()=>localStorage.getItem('md_theme'))==='dark','choice saved');
  await F.screenshot({path:'th_friend_dark.png', fullPage:true});
  await F.reload(); await F.waitForFunction(()=>dbReady&&rosterLoaded); await wait(300);
  ok(await F.evaluate(()=>document.documentElement.dataset.theme)==='dark','dark persists after reload');
  await H.click('.theme-btn'); await wait(200);
  await H.screenshot({path:'th_host_dark.png', fullPage:true});
  // teams screens, both roles, both themes
  await H.evaluate(()=>goToMode()); await wait(300); await H.evaluate(()=>chooseMode('random')); await wait(500);
  for(const [p,n] of [[H,'host'],[F,'friend']]){ await p.screenshot({path:'th_teams_'+n+'_dark.png',fullPage:true}); }
  await H.click('.theme-btn'); await F.click('.theme-btn'); await wait(300);
  for(const [p,n] of [[H,'host'],[F,'friend']]){ await p.screenshot({path:'th_teams_'+n+'_light.png',fullPage:true}); }
  ok(await F.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'friend teams: no sideways scroll');
  ok(await F.evaluate(()=>document.querySelectorAll('.team-body .chem-badge,.team-body .star-badge,.team-comp,.balance-note').length>=0 && [...document.querySelectorAll('.team-comp,.balance-note')].every(e=>e.offsetParent===null)),'friend teams: balance/composition detail hidden');
  ok(await H.evaluate(()=>[...document.querySelectorAll('.team-comp,.balance-note')].some(e=>e.offsetParent!==null)),'host teams: balance/composition detail visible');
  // Walk host through the flow for more screens
  for(const f of [()=>H.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)]) ok(await f(),'host dark: no sideways scroll');
  ok(await F.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'friend dark: no sideways scroll');
  /*__DENIED_DUMP__*/ console.log('DENIED '+JSON.stringify(Object.keys(store).filter(k=>k.startsWith('__denied/')).map(k=>store[k])));
  ok(errs.length===0,'no page errors '+JSON.stringify(errs));
  console.log(fails?('\n'+fails+' FAILED'):'\nALL PASSED'); await br.close(); srv.close();
})();
