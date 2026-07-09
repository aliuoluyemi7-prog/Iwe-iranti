/* ================= ARCHIVE / SEARCH ================= */
function highlightTerms(text, terms){
  const escaped=escapeHtml(text);
  if(!terms || !terms.length) return escaped;
  const pattern=terms.map(t=>t.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')).filter(Boolean).join('|');
  if(!pattern) return escaped;
  const re=new RegExp('('+pattern+')','ig');
  return escaped.replace(re, '<mark class="hl">$1</mark>');
}

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
