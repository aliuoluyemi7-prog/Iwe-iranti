/* =============================================================
   App bootstrap for Ìwé Ìrántí.
   Everything else lives in focused modules loaded before this
   file (see index.html for load order): idb.js, state.js,
   crypto.js, ui.js, storage.js, lock.js, editor.js, search.js,
   calendar.js, trash.js, backup.js, reminders.js.
   This file only wires up install/service-worker plumbing and
   boots the app once every module has loaded.
   ============================================================= */

/* ================= INSTALL PROMPT ================= */
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
