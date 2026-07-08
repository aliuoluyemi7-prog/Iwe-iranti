/* ================= CONSTANTS ================= */
const MOODS = [
  {k:'happy',    e:'😊', l:'Happy',    c:'#D98E3F'},
  {k:'grateful', e:'🙏', l:'Grateful', c:'#5C8A5C'},
  {k:'sad',      e:'😔', l:'Sad',      c:'#5C7FA6'},
  {k:'angry',    e:'😡', l:'Angry',    c:'#B45151'},
  {k:'tired',    e:'😴', l:'Tired',    c:'#8A7CA8'},
  {k:'hopeful',  e:'🌱', l:'Hopeful',  c:'#3E9C7F'},
];
const K_SALT='iwe_salt', K_CHECK='iwe_check', K_ENC='iwe_entries_enc', K_PLAIN='iwe_entries_plain';
const K_MODE='iwe_mode'; // 'encrypted' | 'plain'
const K_CONFIGURED='iwe_configured'; // has the user ever completed the PIN setup/skip screen?
const K_THEME='iwe_theme', K_REMINDER='iwe_reminder_time';

const SECURE = !!(window.crypto && window.crypto.subtle);

let cryptoKey=null;      // AES-GCM CryptoKey, memory-only, present only while unlocked in encrypted mode
let entries=[];          // decrypted working set for this session
let editingId=null;
let pinBuffer='';
let pinStage='enter';    // 'enter' | 'setup-new' | 'setup-confirm' | 'change-old' | 'change-new' | 'change-confirm'
let pinFirstEntry='';
let calendarMonth=new Date();
let archiveFilters={moods:new Set(), tag:null, favoritesOnly:false, dateFrom:'', dateTo:''};
let autosaveTimer=null;

/* ================= UTIL ================= */
function $(id){return document.getElementById(id);}
function fmtDate(d){return d.toLocaleDateString('en-GB',{day:'numeric',month:'long',year:'numeric'});}
function isoDate(d){return d.toISOString().slice(0,10);}
function toast(msg){const t=$('toast');t.textContent=msg;t.classList.add('show');clearTimeout(t._h);t._h=setTimeout(()=>t.classList.remove('show'),1800);}
function escapeHtml(str){const d=document.createElement('div');d.textContent=str||'';return d.innerHTML;}
function moodOf(k){return MOODS.find(m=>m.k===k)||MOODS[0];}
function plainTextOf(html){const d=document.createElement('div');d.innerHTML=html||'';return d.textContent||'';}
function wordCount(html){const t=plainTextOf(html).trim();return t?t.split(/\s+/).length:0;}
function highlightTerms(text, terms){
  const escaped=escapeHtml(text);
  if(!terms || !terms.length) return escaped;
  const pattern=terms.map(t=>t.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')).filter(Boolean).join('|');
  if(!pattern) return escaped;
  const re=new RegExp('('+pattern+')','ig');
  return escaped.replace(re, '<mark class="hl">$1</mark>');
}

/* ================= CRYPTO ================= */
function bufToB64(buf){return btoa(String.fromCharCode(...new Uint8Array(buf)));}
function b64ToBuf(b64){return Uint8Array.from(atob(b64), c=>c.charCodeAt(0)).buffer;}

async function deriveKey(pin, saltB64){
  const enc=new TextEncoder();
  const saltBuf=b64ToBuf(saltB64);
  const material=await crypto.subtle.importKey('raw', enc.encode(pin), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    {name:'PBKDF2', salt:saltBuf, iterations:120000, hash:'SHA-256'},
    material,
    {name:'AES-GCM', length:256},
    false,
    ['encrypt','decrypt']
  );
}
async function encryptObj(key, obj){
  const iv=crypto.getRandomValues(new Uint8Array(12));
  const enc=new TextEncoder();
  const data=await crypto.subtle.encrypt({name:'AES-GCM', iv}, key, enc.encode(JSON.stringify(obj)));
  return {iv:bufToB64(iv), data:bufToB64(data)};
}
async function decryptObj(key, ivB64, dataB64){
  const dec=new TextDecoder();
  const plain=await crypto.subtle.decrypt({name:'AES-GCM', iv:b64ToBuf(ivB64)}, key, b64ToBuf(dataB64));
  return JSON.parse(dec.decode(plain));
}

function newSalt(){return bufToB64(crypto.getRandomValues(new Uint8Array(16)));}

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

/* ================= LOCK / PIN ================= */
function renderPinPad(){
  const pad=$('pinPad'); pad.innerHTML='';
  ['1','2','3','4','5','6','7','8','9','','0','⌫'].forEach(k=>{
    const b=document.createElement('button');
    b.textContent=k;
    if(k==='') b.style.visibility='hidden';
    else b.onclick=()=>pinPress(k);
    pad.appendChild(b);
  });
}
function renderPinDots(){
  const dots=$('pinDots'); dots.innerHTML='';
  for(let i=0;i<4;i++){
    const d=document.createElement('div');
    d.className='pin-dot'+(i<pinBuffer.length?' filled':'');
    dots.appendChild(d);
  }
}
function pinPress(k){
  if(k==='⌫'){pinBuffer=pinBuffer.slice(0,-1); renderPinDots(); return;}
  if(pinBuffer.length>=4) return;
  pinBuffer+=k; renderPinDots();
  if(pinBuffer.length===4) setTimeout(submitPin,150);
}

async function submitPin(){
  const err=$('pinError');
  const heading=$('lockHeading');

  if(pinStage==='setup-new'){
    pinFirstEntry=pinBuffer; pinBuffer=''; renderPinDots();
    pinStage='setup-confirm';
    heading.textContent='Confirm your PIN';
    return;
  }
  if(pinStage==='setup-confirm'){
    if(pinBuffer!==pinFirstEntry){
      err.textContent="PINs didn't match — try again";
      pinBuffer=''; pinFirstEntry=''; renderPinDots();
      pinStage='setup-new'; heading.textContent='Set a 4-digit PIN';
      setTimeout(()=>err.textContent='',1800);
      return;
    }
    await finishPinSetup(pinBuffer);
    return;
  }
  if(pinStage==='change-old'){
    const salt=await getSalt();
    try{
      const testKey=await deriveKey(pinBuffer, salt);
      const check=await getCheck();
      await decryptObj(testKey, check.iv, check.data);
      pinBuffer=''; renderPinDots();
      pinStage='change-new'; heading.textContent='Enter a new PIN';
    }catch(e){
      err.textContent='Incorrect current PIN';
      pinBuffer=''; renderPinDots();
      setTimeout(()=>err.textContent='',1600);
    }
    return;
  }
  if(pinStage==='change-new'){
    pinFirstEntry=pinBuffer; pinBuffer=''; renderPinDots();
    pinStage='change-confirm'; heading.textContent='Confirm new PIN';
    return;
  }
  if(pinStage==='change-confirm'){
    if(pinBuffer!==pinFirstEntry){
      err.textContent="PINs didn't match — try again";
      pinBuffer=''; pinFirstEntry=''; renderPinDots();
      pinStage='change-new'; heading.textContent='Enter a new PIN';
      setTimeout(()=>err.textContent='',1800);
      return;
    }
    await reencryptWithNewPin(pinBuffer);
    return;
  }

  // default: unlocking
  const mode=await getMode();
  if(mode==='plain'){ unlockApp(); return; }

  const salt=await getSalt();
  try{
    const key=await deriveKey(pinBuffer, salt);
    const check=await getCheck();
    await decryptObj(key, check.iv, check.data); // throws if wrong pin
    cryptoKey=key;
    await loadEntries();
    unlockApp();
  }catch(e){
    err.textContent='Wrong PIN, try again';
    pinBuffer=''; renderPinDots();
    setTimeout(()=>err.textContent='',1600);
  }
}

async function finishPinSetup(pin){
  const salt=newSalt();
  const key=await deriveKey(pin, salt);
  const check=await encryptObj(key, {ok:true, ts:Date.now()});
  await setSalt(salt);
  await setCheck(check);

  // migrate any existing plain entries into the encrypted store
  let existingPlain=[];
  if(IDB_SUPPORTED){
    try{ existingPlain = await idbGetAllEntries(); }catch(e){ existingPlain=[]; }
  }else{
    existingPlain = JSON.parse(localStorage.getItem(K_PLAIN)||'[]');
  }
  cryptoKey=key;
  entries = existingPlain;
  await setMode('encrypted');
  await setConfigured(true);
  await persist();
  if(!IDB_SUPPORTED) localStorage.removeItem(K_PLAIN);

  pinBuffer=''; pinFirstEntry=''; pinStage='enter';
  toast('PIN set — your diary is now encrypted');
  unlockApp();
}

async function reencryptWithNewPin(newPin){
  const salt=newSalt();
  const key=await deriveKey(newPin, salt);
  const check=await encryptObj(key, {ok:true, ts:Date.now()});
  cryptoKey=key;
  await setSalt(salt);
  await setCheck(check);
  await persist();
  pinBuffer=''; pinFirstEntry=''; pinStage='enter';
  toast('PIN changed');
  $('lockScreen').classList.add('hidden');
  renderHome();
}

function unlockApp(){
  $('lockScreen').classList.add('hidden');
  pinBuffer='';
  renderHome();
}

async function initLock(){
  renderPinPad(); renderPinDots();
  const note=$('pinSetupNote');
  const warn=$('pinWarning');
  const heading=$('lockHeading');
  const skipBtn=$('skipPinBtn');

  if(!SECURE){
    note.style.display='block';
    note.textContent='Encryption needs a secure connection (https or localhost). Opening this file directly will skip the PIN.';
    heading.textContent='Ìwé Ìrántí';
    await setMode('plain');
    await loadEntries();
    unlockApp();
    return;
  }

  const mode=await getMode();
  const salt=await getSalt();
  const configured=await getConfigured();
  if(mode==='plain' && !salt && !configured){
    // never configured — offer setup
    heading.textContent='Set a 4-digit PIN';
    note.style.display='block';
    note.textContent='This locks and encrypts your diary on this device.';
    warn.style.display='block';
    warn.textContent='There is no "forgot PIN" reset. If you lose it, your only way back in is an encrypted backup — set one up under Settings once you\'re in.';
    skipBtn.style.display='block';
    pinStage='setup-new';
  }else if(mode==='encrypted'){
    heading.textContent='Enter your PIN';
    note.style.display='none'; warn.style.display='none'; skipBtn.style.display='none';
    pinStage='enter';
  }else{
    // plain mode, already chosen to skip before
    await loadEntries();
    unlockApp();
    return;
  }
}

async function skipPinSetup(){
  await setMode('plain');
  await setConfigured(true);
  await loadEntries();
  unlockApp();
}

function changePin(){
  pinStage='change-old'; pinBuffer=''; pinFirstEntry='';
  $('lockScreen').classList.remove('hidden');
  $('lockHeading').textContent='Enter current PIN';
  $('pinSetupNote').style.display='none';
  $('pinWarning').style.display='none';
  $('skipPinBtn').style.display='none';
  renderPinPad(); renderPinDots();
}

async function removePin(){
  if(!confirm('Remove PIN and decrypt your diary on this device? Anyone with access to this phone will be able to open it.')) return;
  await setMode('plain');
  await setConfigured(true);
  try{
    if(IDB_SUPPORTED){
      await idbClearEntries();
      for(const e of entries){ await idbPutEntry(e); }
    }else{
      localStorage.setItem(K_PLAIN, JSON.stringify(entries));
      localStorage.removeItem(K_ENC);
    }
  }catch(e){
    toast('Could not fully update storage — try again');
  }
  await clearEncryptionMeta();
  cryptoKey=null;
  toast('PIN removed — diary is now unencrypted on this device');
}

/* ================= NAVIGATION ================= */
function showScreen(name){
  document.querySelectorAll('.screen').forEach(s=>s.classList.remove('active'));
  $('screen-'+name).classList.add('active');
  document.querySelectorAll('.tab-btn').forEach(b=>b.classList.toggle('active', b.dataset.screen===name));
  if(name==='home') renderHome();
  if(name==='archive') renderArchive();
  if(name==='calendar') renderCalendar();
}

/* ================= STREAK ================= */
function currentStreak(){
  const days=new Set(entries.filter(e=>!e.deleted).map(e=>e.date));
  let streak=0;
  let d=new Date();
  // if nothing today yet, start counting from yesterday so a missed "today" doesn't zero it out prematurely
  if(!days.has(isoDate(d))) d.setDate(d.getDate()-1);
  while(days.has(isoDate(d))){
    streak++;
    d.setDate(d.getDate()-1);
  }
  return streak;
}

/* ================= HOME ================= */
function renderHome(){
  const now=new Date();
  const hr=now.getHours();
  $('greetingText').textContent = hr<12?'Good morning':hr<17?'Good afternoon':'Good evening';
  $('todayDate').textContent = fmtDate(now);
  $('streakBadge').innerHTML = `🔥 ${currentStreak()}-day streak`;

  const today=entries.find(e=>e.date===isoDate(now) && !e.deleted);
  $('todayStatus').innerHTML = today
    ? `<p class="sans" style="font-size:13px;color:var(--ink-soft);margin:0 0 10px;">You already wrote today: "${escapeHtml(today.title)}"</p>`
    : `<p class="sans" style="font-size:13px;color:var(--ink-soft);margin:0 0 10px;">Nothing written yet today.</p>`;

  const recent = entries.filter(e=>!e.deleted).slice().sort((a,b)=>b.date.localeCompare(a.date)).slice(0,5);
  const list=$('recentList'); list.innerHTML='';
  if(recent.length===0){ list.innerHTML='<div class="empty">Your first entry will show up here.</div>'; return; }
  recent.forEach(e=>list.appendChild(entryRow(e)));
}

function entryRow(e, terms){
  terms = terms || [];
  const row=document.createElement('div');
  row.className='entry-item';
  const mood=moodOf(e.mood);
  const titleText = e.title||'Untitled';
  const snippetText = plainTextOf(e.content).slice(0,60);
  const titleHtml = terms.length ? highlightTerms(titleText, terms) : escapeHtml(titleText);
  const snippetHtml = terms.length ? highlightTerms(snippetText, terms) : escapeHtml(snippetText);
  row.innerHTML=`
    <div class="entry-mood" style="color:${mood.c}">${mood.e}</div>
    <div class="entry-meta">
      <div class="entry-date">${fmtDate(new Date(e.date))}</div>
      <div class="entry-title">${e.favorite?'<span class="star-ic">★</span>':''}${titleHtml}</div>
      <div class="entry-snippet">${snippetHtml}</div>
      ${e.tags&&e.tags.length?`<div class="entry-tags">${e.tags.map(t=>`<span class="tag-chip">${escapeHtml(t)}</span>`).join('')}</div>`:''}
    </div>`;
  row.onclick=()=>openWrite(e.id);
  return row;
}

/* ================= WRITE ================= */
function renderMoodRow(selected){
  const row=$('moodRow'); row.innerHTML='';
  MOODS.forEach(m=>{
    const b=document.createElement('button');
    b.type='button';
    b.className='mood-btn'+(m.k===selected?' selected':'');
    if(m.k===selected){ b.style.background=m.c; }
    b.innerHTML=`${m.e} ${m.l}`;
    b.dataset.mood=m.k;
    b.onclick=()=>{
      document.querySelectorAll('.mood-btn').forEach(x=>{x.classList.remove('selected'); x.style.background='';});
      b.classList.add('selected'); b.style.background=m.c;
      scheduleAutosave();
    };
    row.appendChild(b);
  });
}

function openWrite(id){
  clearTimeout(autosaveTimer);
  editingId = id || null;
  const existing = id ? entries.find(e=>e.id===id) : null;
  const today = new Date();

  $('writeHeading').textContent = existing ? 'Edit entry' : 'New entry';
  $('entryDate').value = existing ? fmtDate(new Date(existing.date)) : fmtDate(today);
  $('entryTitle').value = existing ? existing.title : '';
  $('entryTags').value = existing && existing.tags ? existing.tags.join(', ') : '';
  $('rtEditor').innerHTML = existing ? existing.content : '';
  $('favoriteToggle').classList.toggle('selected', !!(existing && existing.favorite));
  $('favoriteToggle').style.background = (existing && existing.favorite) ? '#C9A15A' : '';
  $('deleteBtn').style.display = existing ? 'block' : 'none';
  renderMoodRow(existing ? existing.mood : 'grateful');
  updateWordCount();
  $('autosaveNote').textContent='';

  document.querySelectorAll('.screen').forEach(s=>s.classList.remove('active'));
  $('screen-write').classList.add('active');
  document.querySelectorAll('.tab-btn').forEach(b=>b.classList.toggle('active', b.dataset.screen==='write'));
}

function updateWordCount(){
  $('wordCount').textContent = wordCount($('rtEditor').innerHTML) + ' words';
}

function rtCommand(cmd, val){
  document.execCommand(cmd, false, val || null);
  $('rtEditor').focus();
  scheduleAutosave();
}
function rtBlockquote(){
  document.execCommand('formatBlock', false, 'blockquote');
  $('rtEditor').focus();
  scheduleAutosave();
}

function toggleFavoriteInWrite(){
  const btn=$('favoriteToggle');
  const active = !btn.classList.contains('selected');
  btn.classList.toggle('selected', active);
  btn.style.background = active ? '#C9A15A' : '';
  scheduleAutosave();
}

function scheduleAutosave(){
  clearTimeout(autosaveTimer);
  autosaveTimer=setTimeout(()=>{ saveEntry(true); }, 900);
}

async function saveEntry(silent){
  clearTimeout(autosaveTimer);
  const title=$('entryTitle').value.trim();
  const content=$('rtEditor').innerHTML;
  const plain=plainTextOf(content).trim();
  const moodBtn=document.querySelector('.mood-btn.selected');
  const mood = moodBtn ? moodBtn.dataset.mood : 'grateful';
  const tags = $('entryTags').value.split(',').map(t=>t.trim()).filter(Boolean);
  const favorite = $('favoriteToggle').classList.contains('selected');

  if(!plain && !title){
    if(!silent) toast('Write something first');
    return;
  }

  const now=Date.now();
  let savedEntry;
  if(editingId){
    entries = entries.map(e=>{
      if(e.id!==editingId) return e;
      savedEntry = {...e, title: title||'Untitled', content, mood, tags, favorite, updatedAt:now};
      return savedEntry;
    });
  }else{
    const dateStr = isoDate(new Date());
    editingId = now;
    savedEntry = {id:now, date:dateStr, title:title||'Untitled', content, mood, tags, favorite, createdAt:now, updatedAt:now, deleted:false};
    entries.push(savedEntry);
  }
  await persistEntry(savedEntry);
  updateWordCount();

  if(silent){
    $('autosaveNote').textContent='Saved just now';
    clearTimeout($('autosaveNote')._h);
    $('autosaveNote')._h=setTimeout(()=>{$('autosaveNote').textContent='';},2000);
    $('deleteBtn').style.display='block';
  }else{
    toast('Entry saved');
    editingId=null;
    showScreen('home');
  }
}

async function deleteEntry(){
  clearTimeout(autosaveTimer);
  if(!editingId) return;
  let trashed;
  entries = entries.map(e=>{
    if(e.id!==editingId) return e;
    trashed = {...e, deleted:true, deletedAt:Date.now()};
    return trashed;
  });
  await persistEntry(trashed);
  editingId=null;
  toast('Moved to trash');
  showScreen('home');
}

/* ================= ARCHIVE ================= */
function allTags(){
  const s=new Set();
  entries.filter(e=>!e.deleted).forEach(e=>(e.tags||[]).forEach(t=>s.add(t)));
  return Array.from(s).sort();
}

function onDateRangeChange(){
  archiveFilters.dateFrom = $('dateFromInput').value || '';
  archiveFilters.dateTo = $('dateToInput').value || '';
  renderArchive();
}

function renderFilters(){
  const row=$('filterRow'); row.innerHTML='';

  const favChip=document.createElement('button');
  favChip.className='filter-chip'+(archiveFilters.favoritesOnly?' active':'');
  favChip.textContent='★ Favorites';
  favChip.onclick=()=>{archiveFilters.favoritesOnly=!archiveFilters.favoritesOnly; renderArchive();};
  row.appendChild(favChip);

  MOODS.forEach(m=>{
    const chip=document.createElement('button');
    chip.className='filter-chip'+(archiveFilters.moods.has(m.k)?' active':'');
    chip.textContent=`${m.e} ${m.l}`;
    chip.onclick=()=>{
      if(archiveFilters.moods.has(m.k)) archiveFilters.moods.delete(m.k);
      else archiveFilters.moods.add(m.k);
      renderArchive();
    };
    row.appendChild(chip);
  });

  allTags().forEach(t=>{
    const chip=document.createElement('button');
    chip.className='filter-chip'+(archiveFilters.tag===t?' active':'');
    chip.textContent='#'+t;
    chip.onclick=()=>{ archiveFilters.tag = archiveFilters.tag===t ? null : t; renderArchive(); };
    row.appendChild(chip);
  });

  const hasActiveFilters = archiveFilters.favoritesOnly || archiveFilters.moods.size || archiveFilters.tag
    || archiveFilters.dateFrom || archiveFilters.dateTo || ($('searchInput').value||'').trim();
  if(hasActiveFilters){
    const clearChip=document.createElement('button');
    clearChip.className='filter-chip';
    clearChip.style.color='var(--danger)';
    clearChip.style.borderColor='var(--danger)';
    clearChip.textContent='✕ Clear all';
    clearChip.onclick=()=>{
      archiveFilters={moods:new Set(), tag:null, favoritesOnly:false, dateFrom:'', dateTo:''};
      $('searchInput').value='';
      $('dateFromInput').value='';
      $('dateToInput').value='';
      renderArchive();
    };
    row.appendChild(clearChip);
  }
}

function renderArchive(){
  renderFilters();
  const rawQuery=($('searchInput').value||'').trim().toLowerCase();
  const terms = rawQuery ? rawQuery.split(/\s+/).filter(Boolean) : [];
  let list = entries.filter(e=>!e.deleted).slice().sort((a,b)=>b.date.localeCompare(a.date));

  if(archiveFilters.favoritesOnly) list = list.filter(e=>e.favorite);
  if(archiveFilters.moods.size) list = list.filter(e=>archiveFilters.moods.has(e.mood));
  if(archiveFilters.tag) list = list.filter(e=>(e.tags||[]).includes(archiveFilters.tag));
  if(archiveFilters.dateFrom) list = list.filter(e=>e.date >= archiveFilters.dateFrom);
  if(archiveFilters.dateTo) list = list.filter(e=>e.date <= archiveFilters.dateTo);

  if(terms.length){
    list = list.filter(e=>{
      const haystack = [
        e.title||'',
        plainTextOf(e.content),
        moodOf(e.mood).l,
        (e.tags||[]).join(' '),
        fmtDate(new Date(e.date))
      ].join(' ').toLowerCase();
      return terms.every(t=>haystack.includes(t));
    });
  }

  const countEl=$('resultCount');
  if(countEl){
    const activeAnything = terms.length || archiveFilters.favoritesOnly || archiveFilters.moods.size
      || archiveFilters.tag || archiveFilters.dateFrom || archiveFilters.dateTo;
    countEl.textContent = activeAnything ? `${list.length} entr${list.length===1?'y':'ies'} found` : '';
  }

  const container=$('archiveList'); container.innerHTML='';
  if(list.length===0){ container.innerHTML='<div class="empty">No entries match.</div>'; return; }
  list.forEach(e=>container.appendChild(entryRow(e, terms)));
}

/* ================= CALENDAR ================= */
function renderCalendar(){
  const y=calendarMonth.getFullYear(), m=calendarMonth.getMonth();
  $('calMonthLabel').textContent = calendarMonth.toLocaleDateString('en-GB',{month:'long', year:'numeric'});

  const byDate={};
  entries.filter(e=>!e.deleted).forEach(e=>{ (byDate[e.date] = byDate[e.date]||[]).push(e); });

  const grid=$('calGrid'); grid.innerHTML='';
  ['S','M','T','W','T','F','S'].forEach(d=>{
    const el=document.createElement('div'); el.className='cal-dow'; el.textContent=d; grid.appendChild(el);
  });

  const firstDay=new Date(y,m,1);
  const startOffset=firstDay.getDay();
  const daysInMonth=new Date(y,m+1,0).getDate();
  const todayIso=isoDate(new Date());

  for(let i=0;i<startOffset;i++){
    const el=document.createElement('div'); el.className='cal-day empty-cell'; grid.appendChild(el);
  }
  for(let day=1; day<=daysInMonth; day++){
    const dateObj=new Date(y,m,day);
    const iso=isoDate(dateObj);
    const dayEntries=byDate[iso];
    const el=document.createElement('div');
    el.className='cal-day'+(iso===todayIso?' today':'')+(dayEntries?' has-entry':'');
    el.innerHTML = `<span>${day}</span>`;
    if(dayEntries && dayEntries.length){
      const mood=moodOf(dayEntries[0].mood);
      el.innerHTML += `<span class="cal-dot" style="background:${mood.c}"></span>`;
      el.onclick=()=>openWrite(dayEntries[0].id);
    }else{
      el.onclick=()=>{
        // jump to write screen pre-dated for a past day isn't supported for new entries other than today;
        // for past empty days, just inform the user.
        if(iso===todayIso) openWrite();
        else toast("You can only write new entries for today");
      };
    }
    grid.appendChild(el);
  }
}
function calPrevMonth(){ calendarMonth=new Date(calendarMonth.getFullYear(), calendarMonth.getMonth()-1, 1); renderCalendar(); }
function calNextMonth(){ calendarMonth=new Date(calendarMonth.getFullYear(), calendarMonth.getMonth()+1, 1); renderCalendar(); }

/* ================= TRASH ================= */
function renderTrash(){
  const list=$('trashList'); list.innerHTML='';
  const trashed = entries.filter(e=>e.deleted).sort((a,b)=>(b.deletedAt||0)-(a.deletedAt||0));
  if(trashed.length===0){ list.innerHTML='<div class="empty">Trash is empty.</div>'; return; }
  trashed.forEach(e=>{
    const row=document.createElement('div');
    row.className='entry-item';
    const mood=moodOf(e.mood);
    row.innerHTML=`
      <div class="entry-mood" style="color:${mood.c}">${mood.e}</div>
      <div class="entry-meta">
        <div class="entry-date">${fmtDate(new Date(e.date))}</div>
        <div class="entry-title">${escapeHtml(e.title||'Untitled')}</div>
        <div class="btn-row">
          <button class="btn btn-ghost sans" style="padding:8px;font-size:12px;" data-act="restore">Restore</button>
          <button class="btn btn-danger sans" style="padding:8px;font-size:12px;" data-act="wipe">Delete forever</button>
        </div>
      </div>`;
    row.querySelector('[data-act="restore"]').onclick=async()=>{
      let restored;
      entries = entries.map(x=>{
        if(x.id!==e.id) return x;
        restored = {...x, deleted:false, deletedAt:null};
        return restored;
      });
      await persistEntry(restored); toast('Entry restored'); renderTrash();
    };
    row.querySelector('[data-act="wipe"]').onclick=async()=>{
      if(!confirm('Permanently delete this entry? This cannot be undone.')) return;
      entries = entries.filter(x=>x.id!==e.id);
      await removeEntryPersisted(e.id); toast('Entry permanently deleted'); renderTrash();
    };
    list.appendChild(row);
  });
}
function openTrash(){
  document.querySelectorAll('.screen').forEach(s=>s.classList.remove('active'));
  $('screen-trash').classList.add('active');
  renderTrash();
}

/* ================= THEME ================= */
function applyTheme(t){
  document.documentElement.setAttribute('data-theme', t);
  localStorage.setItem(K_THEME, t);
  $('themeToggleBtn').textContent = t==='dark' ? '☀️ Light' : '🌙 Dark';
}
function toggleTheme(){
  const cur=localStorage.getItem(K_THEME)||'light';
  applyTheme(cur==='dark' ? 'light' : 'dark');
}

/* ================= BACKUP ================= */

/* Reusable passphrase prompt modal, used for encrypted backups.
   Resolves to the entered passphrase, or null if cancelled. */
function askPassphrase({title, message, confirmRequired}){
  return new Promise((resolve)=>{
    const modal=$('passModal');
    const input=$('passModalInput');
    const input2=$('passModalInput2');
    const err=$('passModalError');
    const okBtn=$('passModalOk');
    const cancelBtn=$('passModalCancel');

    $('passModalTitle').textContent=title;
    $('passModalMsg').textContent=message;
    input.value=''; input2.value=''; err.textContent='';
    input2.style.display = confirmRequired ? 'block' : 'none';
    modal.classList.remove('hidden');
    setTimeout(()=>input.focus(), 50);

    function cleanup(){
      modal.classList.add('hidden');
      okBtn.onclick=null; cancelBtn.onclick=null;
    }
    okBtn.onclick=()=>{
      const val=input.value;
      if(!val || val.length<4){ err.textContent='Use at least 4 characters'; return; }
      if(confirmRequired && val!==input2.value){ err.textContent="Passphrases don't match"; return; }
      cleanup();
      resolve(val);
    };
    cancelBtn.onclick=()=>{ cleanup(); resolve(null); };
  });
}

async function exportEncryptedBackup(){
  const pass = await askPassphrase({
    title:'Set a backup passphrase',
    message:"This locks your backup file. Whoever restores it — including future you — will need this exact passphrase. There is no reset, so write it down somewhere safe.",
    confirmRequired:true
  });
  if(!pass) return;
  try{
    const salt=newSalt();
    const key=await deriveKey(pass, salt);
    const payload={ entries: entries.filter(e=>!e.deleted), exportedAt: Date.now() };
    const enc=await encryptObj(key, payload);
    const backup={ app:'iwe-iranti', format:'encrypted-backup', version:1, salt, iv:enc.iv, data:enc.data };
    const blob=new Blob([JSON.stringify(backup)], {type:'application/json'});
    const url=URL.createObjectURL(blob);
    const a=document.createElement('a');
    a.href=url; a.download='iwe-iranti-backup-'+isoDate(new Date())+'.ibak.json'; a.click();
    URL.revokeObjectURL(url);
    toast('Encrypted backup downloaded');
  }catch(e){
    toast('Could not create the backup — try again');
  }
}

async function importEncryptedBackup(event){
  const file=event.target.files[0];
  event.target.value='';
  if(!file) return;
  const reader=new FileReader();
  reader.onload=async()=>{
    let backup;
    try{ backup=JSON.parse(reader.result); }
    catch(e){ toast('That file is not a valid backup'); return; }
    if(!backup || backup.format!=='encrypted-backup' || !backup.salt || !backup.iv || !backup.data){
      toast('That file is not a valid encrypted backup');
      return;
    }
    const pass = await askPassphrase({
      title:'Enter backup passphrase',
      message:'Enter the passphrase you set when this backup was created.',
      confirmRequired:false
    });
    if(!pass) return;
    try{
      const key=await deriveKey(pass, backup.salt);
      const payload=await decryptObj(key, backup.iv, backup.data);
      const incoming=Array.isArray(payload.entries) ? payload.entries : [];
      const ids=new Set(entries.map(e=>e.id));
      const toAdd=incoming.filter(e=>!ids.has(e.id));
      for(const e of toAdd){
        entries.push(e);
        await persistEntry(e);
      }
      toast(`Restored ${toAdd.length} entr${toAdd.length===1?'y':'ies'}`);
      renderHome();
    }catch(e){
      toast('Wrong passphrase, or the backup file is corrupted');
    }
  };
  reader.readAsText(file);
}

function exportData(){
  const data=JSON.stringify(entries.filter(e=>!e.deleted), null, 2);
  const blob=new Blob([data],{type:'application/json'});
  const url=URL.createObjectURL(blob);
  const a=document.createElement('a');
  a.href=url; a.download='iwe-iranti-backup-'+isoDate(new Date())+'.json'; a.click();
  URL.revokeObjectURL(url);
  toast('Backup downloaded (unencrypted file — store it somewhere private)');
}
async function importData(event){
  const file=event.target.files[0];
  if(!file) return;
  const reader=new FileReader();
  reader.onload=async()=>{
    try{
      const incoming=JSON.parse(reader.result);
      if(!Array.isArray(incoming)) throw new Error('bad format');
      const ids=new Set(entries.map(e=>e.id));
      const toAdd=incoming.filter(e=>!ids.has(e.id));
      entries = entries.concat(toAdd);
      for(const e of toAdd){ await persistEntry(e); }
      toast('Entries imported');
      renderHome();
    }catch(err){ toast('Could not read that file'); }
  };
  reader.readAsText(file);
}


/* ================= PDF EXPORT ================= */
function exportPDF(){
  const list = entries.filter(e=>!e.deleted).slice().sort((a,b)=>a.date.localeCompare(b.date));
  const container=$('printArea'); container.innerHTML='';
  if(list.length===0){ toast('No entries to export'); return; }
  list.forEach(e=>{
    const div=document.createElement('div');
    div.className='print-entry';
    div.innerHTML=`<h3>${escapeHtml(e.title||'Untitled')}</h3>
      <div class="print-date">${fmtDate(new Date(e.date))} — ${moodOf(e.mood).l}</div>
      <div>${e.content}</div>`;
    container.appendChild(div);
  });
  document.querySelectorAll('.screen').forEach(s=>s.classList.remove('active'));
  $('screen-print').classList.add('active');
  setTimeout(()=>{ window.print(); showScreen('settings'); }, 200);
}

/* ================= REMINDERS ================= */
function initReminder(){
  const saved=localStorage.getItem(K_REMINDER);
  if(saved) $('reminderTime').value=saved;
  setInterval(checkReminder, 30000);
}
async function setReminder(){
  const val=$('reminderTime').value;
  if(!val){ toast('Pick a time first'); return; }
  if('Notification' in window){
    const perm = await Notification.requestPermission();
    if(perm!=='granted'){ toast('Notifications were not allowed'); return; }
  }
  localStorage.setItem(K_REMINDER, val);
  toast('Reminder set for '+val+' (while the app is open)');
}
function clearReminder(){
  localStorage.removeItem(K_REMINDER);
  $('reminderTime').value='';
  toast('Reminder turned off');
}
let lastReminderFireDate=null;
function checkReminder(){
  const val=localStorage.getItem(K_REMINDER);
  if(!val || !('Notification' in window) || Notification.permission!=='granted') return;
  const now=new Date();
  const hhmm = String(now.getHours()).padStart(2,'0')+':'+String(now.getMinutes()).padStart(2,'0');
  const today=isoDate(now);
  if(hhmm===val && lastReminderFireDate!==today){
    lastReminderFireDate=today;
    if(navigator.serviceWorker && navigator.serviceWorker.controller){
      navigator.serviceWorker.controller.postMessage({type:'SHOW_REMINDER', title:'Ìwé Ìrántí', body:'A moment for today\u2019s entry?'});
    }
  }
}

/* ================= INSTALL PROMPT ================= */
let deferredInstallPrompt=null;
window.addEventListener('beforeinstallprompt',(e)=>{
  e.preventDefault();
  deferredInstallPrompt=e;
  $('installBtn').style.display='block';
});
function installApp(){
  if(!deferredInstallPrompt) return;
  deferredInstallPrompt.prompt();
  deferredInstallPrompt=null;
  $('installBtn').style.display='none';
}

/* ================= INIT ================= */
if('serviceWorker' in navigator){
  window.addEventListener('load', ()=>{
    navigator.serviceWorker.register('sw.js').catch(()=>{});
  });
}
applyTheme(localStorage.getItem(K_THEME)||'light');

async function boot(){
  if(IDB_SUPPORTED){
    try{
      await idbMigrateFromLocalStorage({K_MODE, K_SALT, K_CHECK, K_PLAIN, K_ENC});
    }catch(e){ /* best-effort; app still works via localStorage fallback */ }
  }
  await initLock();
}
boot();
initReminder();
