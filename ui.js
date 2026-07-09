/* ================= UTIL ================= */
function $(id){return document.getElementById(id);}
function fmtDate(d){return d.toLocaleDateString('en-GB',{day:'numeric',month:'long',year:'numeric'});}
function isoDate(d){return d.toISOString().slice(0,10);}
function toast(msg){const t=$('toast');t.textContent=msg;t.classList.add('show');clearTimeout(t._h);t._h=setTimeout(()=>t.classList.remove('show'),1800);}
function escapeHtml(str){const d=document.createElement('div');d.textContent=str||'';return d.innerHTML;}
function moodOf(k){return MOODS.find(m=>m.k===k)||MOODS[0];}
function plainTextOf(html){const d=document.createElement('div');d.innerHTML=html||'';return d.textContent||'';}
function wordCount(html){const t=plainTextOf(html).trim();return t?t.split(/\s+/).length:0;}

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
