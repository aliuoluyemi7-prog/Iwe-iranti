/* =============================================================
   Shared constants and mutable state for Ìwé Ìrántí.
   Loaded first (right after idb.js) so every other module can
   reference these as plain globals — this app is split into
   several small <script> files rather than ES modules so that
   existing inline onclick="..." handlers in index.html keep
   working without any changes.
   ============================================================= */

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
let lastReminderFireDate=null;
let deferredInstallPrompt=null;
