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
