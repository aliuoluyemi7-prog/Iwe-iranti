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
