(function(){
  const store = window.__mockInit || {};
  const HOSTCODE = '__HOSTCODE__';
  // ---- mirror of firestore.rules (keep the two in step) ----
  const FRIEND_MATCH_KEYS = __FRIEND_MATCH_KEYS__;
  const V2 = __V2__;   // privacy rules: reads limited to the games a phone's login is on
  function isHostUid(u){ return !!(u && store['hostClaims/'+u] !== undefined); }
  function inGame(sid, u){
    if(!V2) return true;
    if(isHostUid(u)) return true;
    const lg = store['logins/'+u], sq = store['squads/'+sid];
    return !!(u && lg && sq && (sq.members||[]).includes(lg.name));
  }
  function allowRead(path, isList, u){
    if(!V2) return true;
    const seg = path.split('/');
    if(path==='app/current') return true;
    if(seg[0]==='pins') return true;
    if(seg[0]==='hostClaims' || seg[0]==='logins') return !isList && seg.length===2 && seg[1]===u;
    if(seg[0]==='access') return !isList && seg.length===2;
    if(seg[0]==='squads'){ if(seg.length===1) return isHostUid(u); return inGame(seg[1], u); }
    return true;
  }
  function keysOnly(d, allowed){ return Object.keys(d||{}).every(k=>allowed.includes(k)); }
  function affected(before, after){
    const ks = new Set(Object.keys(before||{}).concat(Object.keys(after||{})));
    return [...ks].filter(k=> JSON.stringify((before||{})[k]) !== JSON.stringify((after||{})[k]));
  }
  function allow(op, path, before, after, uid){
    const signed = !!uid;
    const host = signed && store['hostClaims/'+uid] !== undefined;
    const seg = path.split('/');
    if(seg[0]==='hostClaims' && seg.length===2){
      if(op==='create'||op==='update') return signed && seg[1]===uid && after.code===HOSTCODE && keysOnly(after,['code','at']);
      if(op==='delete') return signed && seg[1]===uid;
      return false;
    }
    if(path==='app/current') return host;
    if(seg[0]==='logins' && seg.length===2){
      if(!V2) return false;
      if(op==='delete') return signed && seg[1]===uid;
      return signed && seg[1]===uid && keysOnly(after,['name','at']) && typeof after.name==='string';
    }
    if(seg[0]==='access' && seg.length===2) return V2 ? host : false;
    if(seg[0]==='squads' && seg.length>2 && !host && !inGame(seg[1], uid)) return false;
    if(seg[0]==='pins' && seg.length===2) return signed;
    if(seg[0]==='squads'){
      if(seg.length===2) return host;
      if(seg.length===4 && seg[2]==='state' && seg[3]==='roster') return host;
      if(seg.length===4 && seg[2]==='state' && seg[3]==='match'){
        if(host) return true;
        return signed && op==='update' && affected(before,after).every(k=>FRIEND_MATCH_KEYS.includes(k));
      }
      if(seg.length===4 && seg[2]==='history'){
        if(host) return true;
        return signed && op==='update' && affected(before,after).every(k=>k==='potmVotes');
      }
      if(seg.length===4 && seg[2]==='pollVotes'){
        if(op==='delete') return host;
        return signed && keysOnly(after,['pollId','playerId','slots','no','at']) && seg[3]===(after.pollId+'__'+after.playerId);
      }
      if(seg.length===4 && seg[2]==='rivalries'){
        if(host) return true;
        if(!signed) return false;
        if(op==='create'||op==='update') return keysOnly(after,['a','b','status','createdAt','startedAt','endedAt']);
        if(op==='delete') return true;
      }
    }
    return false;
  }
  // ---- fake anonymous auth: one uid per browser, kept across reloads ----
  let uid = null; try{ uid = localStorage.getItem('__mock_uid'); }catch(e){}
  const authCbs = [];
  const auth = {
    get currentUser(){ return uid ? {uid} : null; },
    signInAnonymously(){ if(!uid){ uid = 'u'+Math.random().toString(36).slice(2,10); try{ localStorage.setItem('__mock_uid', uid); }catch(e){} } setTimeout(()=>authCbs.forEach(cb=>cb({uid})),0); return Promise.resolve({user:{uid}}); },
    onAuthStateChanged(cb){ authCbs.push(cb); setTimeout(()=>cb(uid?{uid}:null),0); return ()=>{}; }
  };
  function deny(op, path, before, after){
    const rec = {op, path, uid, host: !!(uid && store['hostClaims/'+uid]), keys: affected(before, after)};
    try{ window.__fsRelay('__denied/'+Math.random().toString(36).slice(2,9), JSON.stringify(rec)); }catch(e){}
    const err = new Error('Missing or insufficient permissions.'); err.code = 'permission-denied';
    return Promise.reject(err);
  }
  function check(v,inArr){
    if(v===undefined) throw new Error('Firestore: undefined value');
    if(Array.isArray(v)){ if(inArr) throw new Error('Firestore: nested arrays not supported'); v.forEach(x=>check(x,true)); }
    else if(v&&typeof v==='object'){ Object.values(v).forEach(x=>check(x,false)); }
  }
  const listeners=new Set();
  const notify=()=>{ if(window.__stall) return; listeners.forEach(l=>setTimeout(l,0)); };
  window.__mockApply=(path,json)=>{ if(json===null) delete store[path]; else store[path]=JSON.parse(json); notify(); };
  window.__mockApplyAll=(obj)=>{ Object.keys(store).forEach(k=>{ if(!(k in obj)) delete store[k]; }); Object.keys(obj).forEach(k=>{ store[k]=obj[k]; }); notify(); };
  const clone=x=>x===undefined?undefined:JSON.parse(JSON.stringify(x));
  const relay=(path)=>{ window.__fsRelay(path, store[path]===undefined?null:JSON.stringify(store[path])); };
  function mkDoc(path){
    if(path.split('/').length%2) throw new Error('bad doc path '+path);
    const id=path.split('/').pop();
    const snap=()=>{ const d=store[path]; return {id, exists:d!==undefined, data:()=>clone(d)}; };
    return {
      id, path,
      get:()=>{
        if(path.startsWith('hostClaims/') && path.split('/')[1]!==uid) { const e=new Error('denied'); e.code='permission-denied'; return Promise.reject(e); }
        if(!allowRead(path, false, uid)){ const e=new Error('denied'); e.code='permission-denied'; return Promise.reject(e); }
        return Promise.resolve(snap());
      },
      set:d=>{ check(d,false); const before=clone(store[path]); const after=clone(d); const op = before===undefined?'create':'update';
        if(!allow(op,path,before,after,uid)) return deny(op,path,before,after);
        store[path]=after; notify(); relay(path); return Promise.resolve(); },
      update:d=>{ check(d,false); if(store[path]===undefined) return Promise.reject(new Error('no doc'));
        const before=clone(store[path]); const after=Object.assign(clone(before),clone(d));
        if(!allow('update',path,before,after,uid)) return deny('update',path,before,after);
        store[path]=after; notify(); relay(path); return Promise.resolve(); },
      delete:()=>{ const before=clone(store[path]);
        if(!allow('delete',path,before,undefined,uid)) return deny('delete',path,before,undefined);
        delete store[path]; notify(); relay(path); return Promise.resolve(); },
      onSnapshot:(ok, err)=>{
        let dead = false;
        const fire=()=>{ if(dead) return; if(!allowRead(path, false, uid)){ dead = true; listeners.delete(fire); const e=new Error('denied'); e.code='permission-denied'; if(err) err(e); return; } ok(snap()); };
        listeners.add(fire); setTimeout(fire,0); return ()=>{ dead = true; listeners.delete(fire); };
      }
    };
  }
  function mkQuery(path,order,lim){
    const run=()=>{
      const depth=path.split('/').length+1;
      let rows=Object.keys(store).filter(k=>k.startsWith(path+'/')&&k.split('/').length===depth).map(k=>({id:k.split('/').pop(),d:store[k]}));
      if(order){ rows.sort((a,b)=> (a.d[order.f]>b.d[order.f]?1:a.d[order.f]<b.d[order.f]?-1:0)*(order.dir==='desc'?-1:1)); }
      if(lim) rows=rows.slice(0,lim);
      return {docs:rows.map(r=>({id:r.id,exists:true,data:()=>clone(r.d)}))};
    };
    return {
      orderBy:(f,dir)=>mkQuery(path,{f,dir:dir||'asc'},lim),
      limit:n=>mkQuery(path,order,n),
      get:()=>{ if(!allowRead(path, true, uid)){ const e=new Error('denied'); e.code='permission-denied'; return Promise.reject(e); } return Promise.resolve(run()); },
      onSnapshot:(ok, err)=>{
        let dead = false;
        const fire=()=>{ if(dead) return; if(!allowRead(path, true, uid)){ dead = true; listeners.delete(fire); const e=new Error('denied'); e.code='permission-denied'; if(err) err(e); return; } ok(run()); };
        listeners.add(fire); setTimeout(fire,0); return ()=>{ dead = true; listeners.delete(fire); };
      },
      doc:(id)=>mkDoc(path+'/'+(id||Math.random().toString(36).slice(2,12)))
    };
  }
  window.firebase={ initializeApp(){}, firestore:()=>({ doc:mkDoc, collection:p=>mkQuery(p), settings(){} }), auth:()=>auth };
})();
