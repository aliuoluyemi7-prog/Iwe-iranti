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
