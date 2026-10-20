/* Сквозное шифрование синхронизации в вебе — тот же контракт, что на айфоне
   (Services/SynapseSyncCrypto.swift). Из кода через HKDF-SHA256 (соль
   synapse-sync-pair-v1) выводятся адрес пары (info "lookup") и ключ
   заворачивания (info "wrap"); данные — AES-GCM, формат «combined» = iv(12) ||
   шифртекст || тег(16), как у CryptoKit. Совпадение с айфоном проверено. */
var SynSyncCrypto = (function () {
  var ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  var te = new TextEncoder();
  var PAIR_SALT = te.encode('synapse-sync-pair-v1');

  // Кириллица, похожая на латиницу: код набирают с русской раскладкой, и «А»
  // или «С» с неё раньше молча выбрасывались — код выходил «неполным». Только
  // буквы, которые есть в алфавите кода (О в нём нет — её не подменяем).
  var LOOKALIKE = { 'А': 'A', 'В': 'B', 'Е': 'E', 'К': 'K', 'М': 'M', 'Н': 'H',
                    'Р': 'P', 'С': 'C', 'Т': 'T', 'Х': 'X', 'У': 'Y' };
  function normalize(code) {
    return String(code || '').toUpperCase().split('').map(function (c) {
      return LOOKALIKE[c] || c;
    }).filter(function (c) {
      return ALPHABET.indexOf(c) >= 0;
    }).join('');
  }
  function isComplete(code) { return normalize(code).length === 8; }
  function newCode() {
    var raw = crypto.getRandomValues(new Uint8Array(8));
    var s = '';
    for (var i = 0; i < 8; i++) {
      s += ALPHABET[raw[i] % ALPHABET.length];
      if (i === 3) s += '-';
    }
    return s;
  }
  function b64(bytes) {
    var b = new Uint8Array(bytes), bin = '';
    for (var i = 0; i < b.length; i++) bin += String.fromCharCode(b[i]);
    return btoa(bin);
  }
  function unb64(s) {
    var bin = atob(s), b = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) b[i] = bin.charCodeAt(i);
    return b;
  }
  async function derive(code, info) {
    var ikm = await crypto.subtle.importKey('raw', te.encode(normalize(code)), 'HKDF', false, ['deriveBits']);
    var bits = await crypto.subtle.deriveBits(
      { name: 'HKDF', hash: 'SHA-256', salt: PAIR_SALT, info: te.encode(info) }, ikm, 256);
    return new Uint8Array(bits);
  }
  async function pairLookup(code) { return b64(await derive(code, 'lookup')); }
  async function importAes(raw) {
    return crypto.subtle.importKey('raw', raw, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
  }
  async function seal(plainBytes, keyRaw) {
    var iv = crypto.getRandomValues(new Uint8Array(12));
    var key = await importAes(keyRaw);
    var ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: iv }, key, plainBytes));
    var out = new Uint8Array(12 + ct.length);
    out.set(iv, 0); out.set(ct, 12);
    return out;
  }
  async function open(combined, keyRaw) {
    var iv = combined.slice(0, 12), ct = combined.slice(12);
    var key = await importAes(keyRaw);
    try { return new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: iv }, key, ct)); }
    catch (e) { return null; }
  }
  function newDataKey() { return crypto.getRandomValues(new Uint8Array(32)); }
  async function wrap(dataKeyRaw, code) { return b64(await seal(dataKeyRaw, await derive(code, 'wrap'))); }
  async function unwrap(wrappedB64, code) {
    var raw = await open(unb64(wrappedB64), await derive(code, 'wrap'));
    return (raw && raw.length === 32) ? raw : null;
  }
  async function sealText(str, keyRaw) { return b64(await seal(te.encode(str), keyRaw)); }
  async function openText(b64str, keyRaw) {
    var r = await open(unb64(b64str), keyRaw);
    return r ? new TextDecoder().decode(r) : null;
  }
  function hex(bytes){ var b=new Uint8Array(bytes),s=''; for(var i=0;i<b.length;i++){ s+=('0'+b[i].toString(16)).slice(-2);} return s; }

  return {
    ALPHABET: ALPHABET, normalize: normalize, isComplete: isComplete, newCode: newCode,
    b64: b64, unb64: unb64, hex: hex, pairLookup: pairLookup, seal: seal, open: open,
    newDataKey: newDataKey, wrap: wrap, unwrap: unwrap, sealText: sealText, openText: openText
  };
})();
