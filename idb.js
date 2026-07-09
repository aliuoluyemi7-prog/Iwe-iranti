/* =============================================================
   IndexedDB storage layer for Ìwé Ìrántí
   -------------------------------------------------------------
   Replaces localStorage as the entry store. Two object stores:
     - "entries": one record per diary entry (keyPath 'id'), so
       saving one entry only writes one record instead of
       rewriting the whole diary every time.
     - "meta": small key/value records (salt, check, mode, a
       migration flag).
   Falls back gracefully — if IndexedDB isn't available (very old
   browsers, some locked-down WebViews), the app keeps using
   localStorage exactly as it did before.
   ============================================================= */

const IDB_NAME = 'iwe-iranti-db';
const IDB_VERSION = 1;
const IDB_SUPPORTED = (function(){
  try { return !!window.indexedDB; } catch(e){ return false; }
})();

let _idbConn = null;

function idbOpen(){
  if(_idbConn) return _idbConn;
  _idbConn = new Promise((resolve, reject)=>{
    if(!IDB_SUPPORTED){ reject(new Error('IndexedDB not supported')); return; }
    const req = indexedDB.open(IDB_NAME, IDB_VERSION);
    req.onupgradeneeded = (e)=>{
      const db = e.target.result;
      if(!db.objectStoreNames.contains('entries')) db.createObjectStore('entries', {keyPath:'id'});
      if(!db.objectStoreNames.contains('meta')) db.createObjectStore('meta', {keyPath:'key'});
    };
    req.onsuccess = (e)=> resolve(e.target.result);
    req.onerror = (e)=> reject(e.target.error || new Error('IndexedDB open failed'));
    req.onblocked = ()=> reject(new Error('IndexedDB open blocked'));
  }).catch(err=>{ _idbConn=null; throw err; });
  return _idbConn;
}

function idbRequest(req){
  return new Promise((resolve, reject)=>{
    req.onsuccess = ()=>resolve(req.result);
    req.onerror = ()=>reject(req.error || new Error('IndexedDB request failed'));
  });
}

async function idbStore(name, mode){
  const db = await idbOpen();
  return db.transaction(name, mode).objectStore(name);
}

async function idbGetAllEntries(){
  const store = await idbStore('entries','readonly');
  return idbRequest(store.getAll());
}
async function idbPutEntry(entry){
  const store = await idbStore('entries','readwrite');
  return idbRequest(store.put(entry));
}
async function idbDeleteEntry(id){
  const store = await idbStore('entries','readwrite');
  return idbRequest(store.delete(id));
}
async function idbClearEntries(){
  const store = await idbStore('entries','readwrite');
  return idbRequest(store.clear());
}
async function idbGetMeta(key){
  const store = await idbStore('meta','readonly');
  const rec = await idbRequest(store.get(key));
  return rec ? rec.value : null;
}
async function idbSetMeta(key, value){
  const store = await idbStore('meta','readwrite');
  return idbRequest(store.put({key, value}));
}
async function idbDeleteMeta(key){
  const store = await idbStore('meta','readwrite');
  return idbRequest(store.delete(key));
}

/* One-time migration of any pre-existing localStorage data into
   IndexedDB. Idempotent — safe to call on every boot. Old
   localStorage keys are left untouched (not deleted) so a failed
   migration never loses data; they're just no longer read once
   the migration flag is set. */
async function idbMigrateFromLocalStorage(keys){
  if(!IDB_SUPPORTED) return;
  const already = await idbGetMeta('migrated_v1').catch(()=>null);
  if(already) return;

  let mode = 'plain', salt = null, check = null, legacyEntries = [];
  let hadPriorUsage = false;
  try{
    hadPriorUsage = localStorage.getItem(keys.K_MODE) !== null;
    mode = localStorage.getItem(keys.K_MODE) || 'plain';
    salt = localStorage.getItem(keys.K_SALT);
    const rawCheck = localStorage.getItem(keys.K_CHECK);
    check = rawCheck ? JSON.parse(rawCheck) : null;
    const rawEntries = localStorage.getItem(mode==='plain' ? keys.K_PLAIN : keys.K_ENC);
    legacyEntries = rawEntries ? JSON.parse(rawEntries) : [];
  }catch(e){
    // Corrupt or missing legacy data — nothing to migrate, start fresh.
    legacyEntries = [];
  }

  await idbSetMeta('mode', mode);
  if(salt) await idbSetMeta('salt', salt);
  if(check) await idbSetMeta('check', check);
  if(hadPriorUsage) await idbSetMeta('configured', true);
  for(const entry of legacyEntries){
    await idbPutEntry(entry);
  }
  await idbSetMeta('migrated_v1', true);
}
