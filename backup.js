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
