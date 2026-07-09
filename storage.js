/* ================= PERSISTENCE =================
   Storage lives in IndexedDB (see idb.js) when available, since it
   scales far better than localStorage for a diary meant to grow for
   years. localStorage is kept as an automatic fallback for the rare
   browser/WebView without IndexedDB support, so the app degrades
   gracefully rather than breaking. */

async function getMode(){
  if(IDB_SUPPORTED){
    try{ return (await idbGetMeta('mode')) || 'plain'; }catch(e){ /* fall through */ }
  }
  return localStorage.getItem(K_MODE) || 'plain';
}
async function setMode(mode){
  if(IDB_SUPPORTED){
    try{ await idbSetMeta('mode', mode); return; }catch(e){ /* fall through */ }
  }
  localStorage.setItem(K_MODE, mode);
}
async function getSalt(){
  if(IDB_SUPPORTED){
    try{ const s=await idbGetMeta('salt'); if(s) return s; }catch(e){ /* fall through */ }
  }
  return localStorage.getItem(K_SALT);
}
async function setSalt(salt){
  if(IDB_SUPPORTED){
    try{ await idbSetMeta('salt', salt); return; }catch(e){ /* fall through */ }
  }
  localStorage.setItem(K_SALT, salt);
}
async function getCheck(){
  if(IDB_SUPPORTED){
    try{ const c=await idbGetMeta('check'); if(c) return c; }catch(e){ /* fall through */ }
  }
  const raw=localStorage.getItem(K_CHECK);
  return raw ? JSON.parse(raw) : null;
}
async function setCheck(check){
  if(IDB_SUPPORTED){
    try{ await idbSetMeta('check', check); return; }catch(e){ /* fall through */ }
  }
  localStorage.setItem(K_CHECK, JSON.stringify(check));
}
async function clearEncryptionMeta(){
  if(IDB_SUPPORTED){
    try{ await idbDeleteMeta('salt'); await idbDeleteMeta('check'); return; }catch(e){ /* fall through */ }
  }
  localStorage.removeItem(K_SALT); localStorage.removeItem(K_CHECK);
}
async function getConfigured(){
  if(IDB_SUPPORTED){
    try{ return !!(await idbGetMeta('configured')); }catch(e){ /* fall through */ }
  }
  return localStorage.getItem(K_CONFIGURED) === '1';
}
async function setConfigured(val){
  if(IDB_SUPPORTED){
    try{ await idbSetMeta('configured', !!val); return; }catch(e){ /* fall through */ }
  }
  localStorage.setItem(K_CONFIGURED, val ? '1' : '0');
}

async function loadEntries(){
  const mode=await getMode();
  let raw=null;
  if(IDB_SUPPORTED){
    try{ raw = await idbGetAllEntries(); }
    catch(e){ toast('Storage issue — falling back to backup storage'); raw=null; }
  }
  if(raw===null){
    raw = JSON.parse(localStorage.getItem(mode==='plain'?K_PLAIN:K_ENC) || '[]');
  }
  if(mode==='plain'){
    entries = raw;
    return;
  }
  const out=[];
  for(const rec of raw){
    try{
      const obj = await decryptObj(cryptoKey, rec.iv, rec.data);
      out.push({id:rec.id, date:rec.date, ...obj});
    }catch(e){ /* skip corrupt record */ }
  }
  entries = out;
}

/* Writes just ONE entry — used for normal saves/edits/deletes so a
   diary with thousands of entries doesn't re-encrypt everything on
   every keystroke autosave. */
async function persistEntry(entry){
  if(!entry) return;
  const mode=await getMode();
  try{
    if(mode==='plain'){
      if(IDB_SUPPORTED){ await idbPutEntry(entry); return; }
      localStorage.setItem(K_PLAIN, JSON.stringify(entries));
      return;
    }
    const {id, date, ...rest} = entry;
    const enc = await encryptObj(cryptoKey, rest);
    const rec = {id, date, iv:enc.iv, data:enc.data};
    if(IDB_SUPPORTED){ await idbPutEntry(rec); return; }
    // localStorage has no per-record API, so fall back to a full rewrite
    await persist();
  }catch(e){
    toast('Could not save that change — please try again');
  }
}

async function removeEntryPersisted(id){
  try{
    if(IDB_SUPPORTED){ await idbDeleteEntry(id); return; }
    await persist();
  }catch(e){
    toast('Could not remove entry from storage');
  }
}

/* Full rewrite — used for bulk operations (import, PIN change,
   removing PIN) where every record needs re-processing anyway. */
async function persist(){
  const mode=await getMode();
  try{
    if(mode==='plain'){
      if(IDB_SUPPORTED){
        await idbClearEntries();
        for(const e of entries){ await idbPutEntry(e); }
      }else{
        localStorage.setItem(K_PLAIN, JSON.stringify(entries));
      }
      return;
    }
    const out=[];
    for(const e of entries){
      const {id, date, ...rest} = e;
      const enc = await encryptObj(cryptoKey, rest);
      out.push({id, date, iv:enc.iv, data:enc.data});
    }
    if(IDB_SUPPORTED){
      await idbClearEntries();
      for(const rec of out){ await idbPutEntry(rec); }
    }else{
      localStorage.setItem(K_ENC, JSON.stringify(out));
    }
  }catch(e){
    toast('Could not save changes — check available storage space');
  }
}
