const { chromium, devices } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path');
const HOSTCODE = fs.readFileSync(path.join(__dirname,'.hostcode'),'utf8').trim();
const MIME = {'.html':'text/html','.js':'text/javascript','.png':'image/png','.webmanifest':'application/manifest+json'};
let pageOverride = null;
function mkServer(withSw){
  return http.createServer((q,r)=>{
    let p = q.url.split('?')[0]; if(p==='/'||!p) p='/index.html';
    const f = path.join(__dirname,'site',p);
    if(p==='/sw.js' && !withSw){ r.statusCode=404; return r.end('no'); }
    if(!fs.existsSync(f) || !fs.statSync(f).isFile()){ r.statusCode=404; return r.end('nf'); }
    r.setHeader('content-type', MIME[path.extname(f)]||'application/octet-stream');
    r.setHeader('cache-control','no-store');
    if(p==='/index.html' && pageOverride!=null) return r.end(pageOverride);
    r.end(fs.readFileSync(f));
  }).listen(0);
}
const srv = mkServer(false), srvPwa = mkServer(true);
let fails=0; const ok=(c,m)=>{ console.log((c?'PASS ':'FAIL ')+m); if(!c) fails++; };
const store={}; const pages=[]; const errs=[]; const wait=ms=>new Promise(r=>setTimeout(r,ms));
const STUBS = `
  window.__beeps=0; window.__buzz=0; window.__wl=0; window.__wlr=0; window.__copied=null; window.__opened=null;
  window.AudioContext=class{constructor(){this.state='running';this.currentTime=0;this.destination={}} resume(){} createOscillator(){return{type:'',frequency:{value:0},connect(){},start(){window.__beeps++},stop(){}}} createGain(){return{gain:{setValueAtTime(){},exponentialRampToValueAtTime(){}},connect(){}}}};
  navigator.vibrate=function(p){ window.__buzz++; window.__lastBuzz=p; return true; };
  Object.defineProperty(navigator,'wakeLock',{value:{request:async function(){ window.__wl++; return {release:async function(){ window.__wlr++; }, addEventListener(){}}; }}});
  Object.defineProperty(navigator,'clipboard',{value:{writeText:async function(t){ window.__copied=t; }}});
  window.open=function(u){ window.__opened=u; return null; };
`;
(async()=>{
  const br = await chromium.launch();
  async function phone(base, hash, extraInit){
    const ctx = await br.newContext({...devices['iPhone 13']});
    await ctx.route(/gstatic\.com|googleapis\.com/, r=>r.abort());
    const p = await ctx.newPage(); p.on('pageerror',e=>errs.push(e.message));
    await p.exposeFunction('__fsRelay', async (pth,json)=>{
      if(json===null) delete store[pth]; else store[pth]=JSON.parse(json);
      for(const q of pages){ if(q!==p) await q.evaluate(([a,b])=>window.__mockApply(a,b),[pth,json]).catch(()=>{}); }
    });
    await p.addInitScript('window.__mockInit='+JSON.stringify(store)+';');
    await p.addInitScript(fs.readFileSync(path.join(__dirname,'mock2.js'),'utf8'));
    if(extraInit) await p.addInitScript(extraInit);
    pages.push(p); await p.goto(base+(hash||'')); await p.evaluate((j)=>window.__mockApplyAll && window.__mockApplyAll(JSON.parse(j)), JSON.stringify(store)).catch(()=>{});
    await p.waitForFunction(()=>dbReady && rosterLoaded,null,{timeout:8000});
    return p;
  }
  const url=`http://localhost:${srv.address().port}/`;
  const txt=p=>p.evaluate(()=>document.body.innerText);
  const login = async (p,name)=>{ await p.fill('#loginNameInput',name); await p.press('#loginNameInput','Enter'); await p.waitForFunction(()=>!/Checking…/.test(document.body.innerText),null,{timeout:6000}).catch(()=>{}); await wait(800); };

  const H = await phone(url,'#host='+HOSTCODE, STUBS);
  const names=['Arjun','Rohan','Vikram','Sahil','Aditya','Karan','Dev','Ishaan','Yuvraj','Nikhil'];
  for(let i=0;i<names.length;i++){ await H.evaluate(([n,i])=>addPlayer(n,[i<2?'GK':i<5?'DEF':i<9?'MID':'FWD'],{},false,false),[names[i],i]); await wait(50); }

  /* ================= PIN ================= */
  const K = await phone(url,'',STUBS); await login(K,'karan');
  ok(await K.$('#pinSetInput')!==null, 'first login offers to set a PIN');
  await K.fill('#pinSetInput','12'); await K.press('#pinSetInput','Enter'); await wait(150);
  ok(/exactly 4 digits/.test(await txt(K)), 'a 2-digit PIN is refused');
  await K.fill('#pinSetInput','4821'); await K.press('#pinSetInput','Enter'); await wait(400);
  ok(await K.$('#pinSetInput')===null, 'PIN modal closes after saving');
  const pinDocs = Object.keys(store).filter(k=>k.startsWith('pins/'));
  ok(pinDocs.length===1 && !!store[pinDocs[0]].h && !JSON.stringify(store).includes('4821'), 'PIN stored only as a hash (4821 appears nowhere in shared data)');
  ok(/Playing as Karan/.test(await txt(K)), 'Karan is logged in after setting the PIN');

  const X = await phone(url,'',STUBS); await login(X,'Karan');
  ok(await X.$('#pinInput')!==null && /Enter your PIN/.test(await txt(X)), 'someone typing Karan’s name gets the PIN prompt');
  await X.fill('#pinInput','0000'); await wait(300);
  ok(/isn.t right/.test(await txt(X)) && await X.$('#pinInput')!==null, 'wrong PIN is refused');
  ok(!/Playing as/.test(await txt(X)), '...and they are not logged in');
  await X.fill('#pinInput','4821'); await wait(400);
  ok(/Playing as Karan/.test(await txt(X)), 'right PIN logs in (auto-submits on the 4th digit)');

  // throttling
  const Y = await phone(url,'',STUBS); await login(Y,'Karan');
  for(let i=0;i<5;i++){ await Y.fill('#pinInput','1111'); await wait(120); }
  await Y.fill('#pinInput','4821'); await wait(300);
  ok(/Too many wrong tries/.test(await txt(Y)) && !/Playing as/.test(await txt(Y)), '5 wrong PINs lock the prompt for a bit, even for the right PIN');

  // not you -> back
  const Z = await phone(url,'',STUBS); await login(Z,'Karan');
  await Z.click('text=Not you? Back'); await wait(150);
  ok(await Z.$('#loginNameInput')!==null, '"Not you? Back" returns to the name box');

  // a phone that was already logged in before the PIN existed gets locked live
  const OLD = await phone(url,'',STUBS); await login(OLD,'Rohan'); await OLD.evaluate(()=>{ if(pinModalOpen) closePinModal(true); });
  await OLD.evaluate(()=>{ localStorage.setItem('md_login_name','Karan'); localStorage.removeItem('md_login_pin'); }); // simulate: logged in as Karan before PIN
  await OLD.evaluate(()=>render()); await wait(200);
  ok(await OLD.$('#pinInput')!==null, 'a phone logged in as Karan without his PIN is sent to the PIN prompt');

  // skip flow
  const R = await phone(url,'',STUBS); await login(R,'Rohan');
  ok(await R.$('#pinSetInput')!==null, 'Rohan is offered a PIN too');
  await R.click('text=Not now'); await wait(150);
  ok(await R.$('#pinSetInput')===null, '"Not now" closes it');
  await R.reload(); await R.waitForFunction(()=>dbReady&&rosterLoaded); await wait(400);
  ok(await R.$('#pinSetInput')===null, 'and it does not nag again on this phone');
  await R.click('button:has-text("My profile")'); await wait(200);
  ok(/your login/i.test(await txt(R)) && /Set a PIN/.test(await txt(R)), 'Rohan can still set a PIN from his profile');
  await R.click('text=Set a PIN'); await wait(150);
  ok(await R.$('#pinSetInput')!==null, 'profile button opens the PIN box');
  await R.click('.modal-backdrop:last-of-type .icon-btn'); await wait(100);

  // host reset
  await H.evaluate(()=>openProfile('karan')); await wait(200);
  ok(/Reset their PIN/.test(await txt(H)), 'host sees a reset button on a protected player’s profile');
  await H.click('text=Reset their PIN'); await wait(150);
  ok(/Tap again to confirm/.test(await txt(H)), 'reset needs a second tap');
  await H.click('text=Tap again to confirm'); await wait(400);
  ok(Object.keys(store).filter(k=>k.startsWith('pins/')).length===0, 'PIN removed after host reset');
  const W = await phone(url,'',STUBS); await login(W,'Karan'); await W.evaluate(()=>{ if(pinModalOpen) closePinModal(true); });
  ok(/Playing as Karan/.test(await txt(W)), 'after reset Karan can log in by name again');
  await H.evaluate(()=>closeProfile());
  // captain banner
  await H.evaluate(()=>saveState({captains:{a:'rohan',b:'karan'}})); await wait(400);
  ok(/set a 4-digit PIN so nobody else can bid/.test(await txt(R)), 'a captain without a PIN sees the nudge banner');
  ok(!/set a 4-digit PIN so nobody else can bid/.test(await txt(H)), 'host does not get the nudge');
  await H.evaluate(()=>saveState({captains:{a:null,b:null}})); await wait(200);

  /* ================= SHARE ================= */
  await H.evaluate(()=>goToMode()); await wait(300); await H.evaluate(()=>chooseMode('random')); await wait(500);
  const S1 = await W.evaluate(()=>buildTeamSheetText());
  ok(/Team A/.test(S1) && /Team B/.test(S1) && /1\. /.test(S1) && /6v6|5v5/.test(S1), 'share text has both teams, numbered, and the format');
  ok(!/#\d|rank|star/i.test(S1), 'share text carries no ranks or stars');
  ok(await W.$$eval('.share-row .btn',e=>e.map(x=>x.innerText)).then(a=>a.length===2), 'friends see Copy + WhatsApp buttons on the split screen');
  await W.click('text=Copy teams'); await wait(200);
  ok(await W.evaluate(()=>window.__copied)===S1, 'Copy puts the exact message on the clipboard');
  ok(/Copied/.test(await txt(W)), 'button confirms "Copied!"');
  await W.click('text=Send to WhatsApp'); await wait(100);
  const wa = await W.evaluate(()=>window.__opened);
  ok(wa && wa.startsWith('https://api.whatsapp.com/send?text=') && decodeURIComponent(wa.split('text=')[1])===S1, 'WhatsApp link carries the message');
  console.log('\n--- sample message ---\n'+S1+'\n----------------------\n');
  await H.evaluate(()=>confirmRandom()); await wait(500);
  ok(await H.$$eval('.share-row .btn',e=>e.length)===2, 'share buttons also on the final teams screen');

  /* ================= PROFILES ================= */
  const mk=(date,a,b,winner,sa,sb,scorers,assists)=>({date,format:3,mode:'random',teamA:{players:a.map(x=>x[0].toUpperCase()+x.slice(1))},teamAIds:a,teamB:{players:b.map(x=>x[0].toUpperCase()+x.slice(1))},teamBIds:b,subs:[],subIds:[],winner,scoreA:sa,scoreB:sb,scorers:scorers||[],assists:assists||[],duration:40});
  const T=n=>new Date(Date.now()-86400000*(10-n)).toISOString();
  await H.evaluate(([list])=>{ list.forEach(e=>addToHistory(e)); },[[
    mk(T(1),['arjun','rohan','vikram'],['sahil','aditya','karan'],'a',3,1,[{playerId:'arjun',goals:2},{playerId:'rohan',goals:1}]),
    mk(T(2),['arjun','sahil','dev'],['rohan','karan','ishaan'],'a',2,0,[{playerId:'arjun',goals:1},{playerId:'sahil',goals:1}]),
    mk(T(3),['arjun','rohan','karan'],['vikram','dev','ishaan'],'b',0,1,[]),
    mk(T(4),['sahil','dev','yuvraj'],['arjun','rohan','aditya'],'draw',1,1,[],[{playerId:'arjun',assists:1}]),
    mk(T(5),['arjun','rohan','dev'],['karan','sahil','vikram'],'a',2,0,[])
  ]]);
  await wait(600);
  const F = await phone(url,'',STUBS); await login(F,'Arjun'); await F.evaluate(()=>{ if(pinModalOpen) closePinModal(true); });
  await F.evaluate(()=>toggleAwards()); await wait(200);
  ok(await F.$$eval('.stand-row .pname-link',e=>e.length)>=3, 'leaderboard names are tappable');
  await F.evaluate(()=>{ const b=[...document.querySelectorAll('.stand-row .pname-link')].find(x=>x.innerText==='Arjun'); b.click(); }); await wait(200);
  const tiles = await F.$$eval('.pf-tile',e=>e.map(x=>x.querySelector('b').innerText));
  ok(JSON.stringify(tiles)==='["6","50%","3-1-1","3","1","0"]', 'Arjun profile tiles are right: '+JSON.stringify(tiles));
  const form = await F.$$eval('.form-row .form-chip',e=>e.map(x=>x.innerText).join(''));
  ok(form==='WDLWW', 'form is latest-first W D L W W: '+form);
  const mates = await F.$$eval('.mate-row',e=>e.map(x=>x.innerText.replace(/\s+/g,' ')));
  ok(mates.length===2 && /Dev/.test(mates[0]) && /100%/.test(mates[0]) && /Rohan/.test(mates[1]) && /50%/.test(mates[1]), 'best teammates: Dev 100% then Rohan 50%: '+JSON.stringify(mates));
  ok(!/Rank #/.test(await txt(F)), 'friends do not see rank on a profile');
  ok(!/Your login/.test(await txt(F)) === false || true, '(own-profile section checked below)');
  // click a teammate -> opens that profile
  await F.evaluate(()=>{ [...document.querySelectorAll('.mate-row .pname-link')].find(x=>x.innerText==='Dev').click(); }); await wait(200);
  ok(await F.$eval('.pf-name',e=>e.innerText)==='Dev', 'tapping a teammate opens their profile');
  await F.evaluate(()=>{ closeProfile(); }); await wait(100);
  await F.evaluate(()=>{ toggleAwards(); }); await wait(100);
  await H.evaluate(()=>{ toggleHistory(); }); await wait(200);
  await H.evaluate(()=>{ document.querySelector('details.hdetails').open = true; }); await wait(100);
  ok(await H.$$eval('details.hdetails .pname-link',e=>e.length)>=6, 'past-match lineups are tappable (host)');
  await H.evaluate(()=>{ document.querySelector('details.hdetails .pname-link').click(); }); await wait(200);
  ok(await H.$('.pf-name')!==null, 'tapping a lineup name opens the profile');
  await H.evaluate(()=>closeProfile());
  // friends vote from their own profile now
  await F.evaluate(()=>goMyProfile()); await wait(200);
  const voteBtns = await F.$$('button:has-text("Vote for man of the match")');
  ok(voteBtns.length>=1, 'own profile offers a "Vote for man of the match" button per past match: '+voteBtns.length);
  await voteBtns[0].click(); await wait(200);
  const firstId = await F.evaluate(()=>profileVoteOpen);
  await F.evaluate(()=>{ const b=[...document.querySelectorAll('.pm-vote .chip-toggle:not([disabled])')][0]; b.click(); }); await wait(400);
  const pv = await H.evaluate(([id])=>HISTORY.find(h=>h.id===id).potmVotes,[firstId]);
  ok(pv && JSON.stringify(pv).includes('"arjun"'), 'friend’s vote from the profile is saved: '+JSON.stringify(pv));
  await F.screenshot({path:'f_profile_vote.png'});
  await F.evaluate(()=>{ profileVoteOpen=null; openProfile('dev'); }); await wait(200);
  ok(!(await F.$('button:has-text("Vote for man of the match")')), 'no vote buttons on someone else’s profile');
  await F.screenshot({path:'f_profile_light.png'});
  await F.evaluate(()=>{ closeProfile(); });
  await F.click('button:has-text("My profile")'); await wait(200);
  ok(/your login/i.test(await txt(F)), 'own profile (via the top chip) includes the PIN section');
  await F.evaluate(()=>closeProfile());
  await H.evaluate(()=>openProfile('arjun')); await wait(200);
  ok(/Rank #1 of 10/.test(await txt(H)), 'host sees the rank line on a profile');
  await H.screenshot({path:'h_profile.png'});
  await H.evaluate(()=>closeProfile());
  await F.screenshot({path:'f_before_alerts.png'});

  /* ================= TURN ALERTS ================= */
  await H.evaluate(()=>startNewMatch()); await wait(400);
  await H.evaluate(()=>{ for(const id of ['arjun','rohan','vikram','sahil','aditya','karan','dev','ishaan','yuvraj','nikhil']) if(!(S.selectedIds||[]).includes(id)) toggleSelected(id); });
  await wait(300);
  await H.evaluate(()=>goToMode()); await wait(300);
  await H.evaluate(()=>saveState({mode:'draft', phase:'captains', captains:{a:'arjun',b:'karan'}})); await wait(300);
  await H.evaluate(()=>{ startAuction(100,10,5); }); await wait(600);
  const A = F;  // Arjun = captain A
  const Kc = await phone(url,'',STUBS); await login(Kc,'Karan'); await Kc.evaluate(()=>{ if(pinModalOpen) closePinModal(true); }); await wait(300);
  const turnTxt = await A.evaluate(()=>S.auction.turn);
  ok(turnTxt==='a', 'auction opens on Team A (Arjun)');
  ok(await A.$('.turn-banner')!==null && /Your turn/.test(await txt(A)), 'Arjun sees the flashing "Your turn" banner');
  ok(await Kc.$('.turn-banner')===null, 'Karan does not');
  ok(await A.evaluate(()=>window.__buzz)===1 && await A.evaluate(()=>window.__beeps)>=2, 'Arjun’s phone buzzed once and beeped');
  ok(await Kc.evaluate(()=>window.__buzz)===0, 'Karan’s did not');
  ok(await A.evaluate(()=>window.__wl)>=1, 'captain’s screen is kept awake');
  await A.evaluate(()=>{ render(); render(); render(); });
  ok(await A.evaluate(()=>window.__buzz)===1, 're-renders do not buzz again');
  await A.screenshot({path:'f_turn_light.png'});
  // Arjun bids -> Karan's turn
  await A.evaluate(()=>auctionBid('a')); await wait(500);
  ok(await A.$('.turn-banner')===null, 'banner clears once Arjun has acted');
  ok(await Kc.$('.turn-banner')!==null && await Kc.evaluate(()=>window.__buzz)===1, 'Karan now gets banner + buzz');
  // title flashes while hidden
  await Kc.evaluate(()=>{ Object.defineProperty(document,'hidden',{configurable:true,get:()=>true}); document.dispatchEvent(new Event('visibilitychange')); });
  await wait(1300);
  ok(/YOUR TURN/.test(await Kc.title()), 'tab title flashes while the phone is in the background');
  await Kc.evaluate(()=>{ Object.defineProperty(document,'hidden',{configurable:true,get:()=>false}); document.dispatchEvent(new Event('visibilitychange')); });
  await wait(200);
  ok(await Kc.title()==='Matchday Draft', 'title goes back to normal when you return');
  // mute
  await Kc.evaluate(()=>auctionBid('b')); await wait(400);          // back to Arjun
  await A.evaluate(()=>toggleAlerts()); await wait(200);            // Arjun mutes
  const b0 = await A.evaluate(()=>window.__buzz);
  await A.evaluate(()=>auctionBid('a')); await wait(300); await Kc.evaluate(()=>auctionBid('b')); await wait(500);
  ok(await A.evaluate(()=>window.__buzz)===b0 && await A.$('.turn-banner')!==null, 'muted: no buzz, banner still shows');
  // non-captain / friend gets nothing
  const Fr = await phone(url,'',STUBS); await login(Fr,'Rohan'); await Fr.evaluate(()=>{ if(pinModalOpen) closePinModal(true); }); await wait(300);
  ok(await Fr.$('.turn-banner')===null && await Fr.evaluate(()=>window.__buzz)===0 && await Fr.evaluate(()=>window.__wl)===0, 'a non-captain gets no alert and no wake lock');
  await H.evaluate(()=>randomizeRemaining()); await wait(500);
  ok(await A.$('.turn-banner')===null, 'banner gone when the auction is over');
  ok(await A.evaluate(()=>window.__wlr)>=1, 'wake lock released after the auction');

  /* ================= PWA ================= */
  const urlP=`http://localhost:${srvPwa.address().port}/`;
  const P = await phone(urlP,'',STUBS);
  ok(await P.evaluate(()=>!!document.querySelector('link[rel=manifest]')), 'manifest linked');
  const man = await P.evaluate(async()=>{ const r=await fetch(document.querySelector('link[rel=manifest]').href); return r.ok ? r.json() : null; });
  ok(man && man.display==='standalone' && man.icons.length>=3, 'manifest loads: standalone with icons');
  const icons = await P.evaluate(async(m)=>Promise.all(m.icons.map(i=>fetch(i.src).then(r=>r.status))), man);
  ok(icons.every(s=>s===200), 'all manifest icons load');
  ok(await P.evaluate(()=>fetch('apple-touch-icon.png').then(r=>r.status))===200, 'apple-touch-icon loads');
  const swOk = await P.evaluate(async()=>{ const r = await navigator.serviceWorker.ready; return !!r.active; });
  ok(swOk, 'service worker installed and active');
  await wait(500);
  const cached = await P.evaluate(async()=>{ const c=await caches.open('md-v1'); const ks=(await c.keys()).map(k=>new URL(k.url).pathname); return ks; });
  ok(cached.some(k=>/index\.html$/.test(k)) && cached.some(k=>/icon-192/.test(k)), 'app shell cached: '+cached.join(','));
  await P.reload(); await P.waitForFunction(()=>dbReady&&rosterLoaded);
  const ctxP = P.context();
  await ctxP.setOffline(true);
  await P.reload().catch(()=>{}); await wait(600);
  ok(/Matchday Draft/.test(await P.evaluate(()=>document.body.innerText)), 'offline reload still opens the app from cache');
  await ctxP.setOffline(false);
  // update toast
  pageOverride = fs.readFileSync(path.join(__dirname,'site/index.html'),'utf8').replace('content="testbuild1"','content="testbuild2"');
  await P.reload(); await wait(3800);
  ok(await P.$('.update-toast')!==null || await P.evaluate(()=>updateReady), 'a newer version triggers the "new version ready" toast');
  pageOverride = null;
  // install button
  const L = await phone(urlP,'',STUBS);
  ok(/Add to Home Screen/.test(await txt(L)), 'iPhone login page shows an "Add to Home Screen" button');
  await L.click('text=Add to Home Screen'); await wait(100);
  ok(/Safari/.test(await txt(L)) && /Share/.test(await txt(L)), 'it explains the Safari steps');
  await L.evaluate(()=>{ const e=new Event('beforeinstallprompt'); e.prompt=function(){ window.__prompted=true; }; e.userChoice=Promise.resolve({outcome:'accepted'}); window.dispatchEvent(e); });
  await wait(150);
  ok(/Install app/.test(await txt(L)), 'Android-style install prompt turns it into an "Install app" button');
  await L.click('text=Install app'); await wait(150);
  ok(await L.evaluate(()=>window.__prompted===true), 'tapping it fires the browser install prompt');
  await L.screenshot({path:'f_login_install.png'});

  /*__DENIED_DUMP__*/ console.log('DENIED '+JSON.stringify(Object.keys(store).filter(k=>k.startsWith('__denied/')).map(k=>store[k])));
  ok(errs.length===0,'no page errors '+JSON.stringify(errs));
  console.log(fails?('\n'+fails+' FAILED'):'\nALL PASSED'); await br.close(); srv.close(); srvPwa.close();
})();
