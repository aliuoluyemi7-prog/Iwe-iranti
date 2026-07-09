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
