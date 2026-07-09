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
