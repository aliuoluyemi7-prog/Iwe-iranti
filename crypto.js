/* ================= CRYPTO ================= */
function bufToB64(buf){return btoa(String.fromCharCode(...new Uint8Array(buf)));}
function b64ToBuf(b64){return Uint8Array.from(atob(b64), c=>c.charCodeAt(0)).buffer;}

async function deriveKey(pin, saltB64){
  const enc=new TextEncoder();
  const saltBuf=b64ToBuf(saltB64);
  const material=await crypto.subtle.importKey('raw', enc.encode(pin), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    {name:'PBKDF2', salt:saltBuf, iterations:120000, hash:'SHA-256'},
    material,
    {name:'AES-GCM', length:256},
    false,
    ['encrypt','decrypt']
  );
}
async function encryptObj(key, obj){
  const iv=crypto.getRandomValues(new Uint8Array(12));
  const enc=new TextEncoder();
  const data=await crypto.subtle.encrypt({name:'AES-GCM', iv}, key, enc.encode(JSON.stringify(obj)));
  return {iv:bufToB64(iv), data:bufToB64(data)};
}
async function decryptObj(key, ivB64, dataB64){
  const dec=new TextDecoder();
  const plain=await crypto.subtle.decrypt({name:'AES-GCM', iv:b64ToBuf(ivB64)}, key, b64ToBuf(dataB64));
  return JSON.parse(dec.decode(plain));
}

function newSalt(){return bufToB64(crypto.getRandomValues(new Uint8Array(16)));}
