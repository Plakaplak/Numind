/* ==========================================================================
   db.js — Penyimpanan lokal (IndexedDB) + pengolahan foto nota.
   Data utama: 1 dokumen "state". Foto nota: blob terpisah (hemat memori).
   Jika IndexedDB tidak tersedia, data jatuh ke localStorage (tanpa foto permanen).
   ========================================================================== */
(function (root) {
  'use strict';
  const NAME = 'kasproyek', VER = 1;
  let db = null, mode = 'idb';
  const memPhotos = new Map();
  const urlCache = new Map();
  let bc = null;

  function open() {
    return new Promise((res, rej) => {
      if (!('indexedDB' in root)) return rej(new Error('IndexedDB tidak tersedia'));
      let r;
      try { r = indexedDB.open(NAME, VER); } catch (e) { return rej(e); }
      r.onupgradeneeded = () => { const d = r.result; if (!d.objectStoreNames.contains('kv')) d.createObjectStore('kv'); if (!d.objectStoreNames.contains('photos')) d.createObjectStore('photos'); };
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
      r.onblocked = () => rej(new Error('IndexedDB terblokir'));
    });
  }
  function run(store, m, fn) {
    return new Promise((res, rej) => {
      const t = db.transaction(store, m);
      const req = fn(t.objectStore(store));
      t.oncomplete = () => res(req ? req.result : undefined);
      t.onerror = () => rej(t.error);
      t.onabort = () => rej(t.error || new Error('Transaksi dibatalkan'));
    });
  }

  async function init() {
    try { db = await open(); mode = 'idb'; }
    catch (e) { mode = 'local'; console.warn('Fallback ke localStorage:', e.message); }
    try { if (root.BroadcastChannel) bc = new BroadcastChannel('kasproyek'); } catch (e) { /* abaikan */ }
    try { if (navigator.storage && navigator.storage.persist) navigator.storage.persist(); } catch (e) { /* abaikan */ }
    return mode;
  }
  function onRemoteChange(fn) { if (bc) bc.onmessage = ev => { if (ev.data === 'saved') fn(); }; }

  async function loadState() {
    if (mode === 'idb') return run('kv', 'readonly', s => s.get('state'));
    try { const raw = localStorage.getItem('kasproyek.state'); return raw ? JSON.parse(raw) : undefined; } catch (e) { return undefined; }
  }
  async function saveState(obj) {
    if (mode === 'idb') await run('kv', 'readwrite', s => s.put(obj, 'state'));
    else localStorage.setItem('kasproyek.state', JSON.stringify(obj));
    if (bc) bc.postMessage('saved');
  }

  /* ----- Foto ----- */
  async function putPhoto(id, rec) {
    if (mode === 'idb') return run('photos', 'readwrite', s => s.put(rec, id));
    memPhotos.set(id, rec);
  }
  async function getPhoto(id) {
    if (mode === 'idb') return run('photos', 'readonly', s => s.get(id));
    return memPhotos.get(id);
  }
  async function deletePhoto(id) {
    if (!id || String(id).startsWith('demo-')) return;
    const u = urlCache.get(id); if (u) { URL.revokeObjectURL(u); urlCache.delete(id); }
    if (mode === 'idb') return run('photos', 'readwrite', s => s.delete(id));
    memPhotos.delete(id);
  }
  async function allPhotoIds() {
    if (mode === 'idb') return run('photos', 'readonly', s => s.getAllKeys());
    return [...memPhotos.keys()];
  }
  async function photoURL(id) {
    if (!id || String(id).startsWith('demo-')) return null;
    if (urlCache.has(id)) return urlCache.get(id);
    const rec = await getPhoto(id);
    if (!rec || !rec.blob) return null;
    const u = URL.createObjectURL(rec.blob);
    urlCache.set(id, u);
    return u;
  }
  async function clearAll() {
    if (mode === 'idb') { await run('kv', 'readwrite', s => s.clear()); await run('photos', 'readwrite', s => s.clear()); }
    else { localStorage.removeItem('kasproyek.state'); memPhotos.clear(); }
    for (const u of urlCache.values()) URL.revokeObjectURL(u);
    urlCache.clear();
  }

  /* ----- Hash & kompresi ----- */
  async function hashBuffer(buf) {
    try {
      if (root.crypto && crypto.subtle) {
        const d = await crypto.subtle.digest('SHA-256', buf);
        return [...new Uint8Array(d)].slice(0, 12).map(b => b.toString(16).padStart(2, '0')).join('');
      }
    } catch (e) { /* jatuh ke FNV */ }
    const a = new Uint8Array(buf); let h1 = 0x811c9dc5, h2 = 0x01000193;
    for (let i = 0; i < a.length; i++) { h1 = Math.imul(h1 ^ a[i], 16777619) >>> 0; h2 = Math.imul(h2 + a[i], 2246822519) >>> 0; }
    return 'f' + h1.toString(16) + h2.toString(16);
  }
  function loadBitmap(file) {
    if (root.createImageBitmap) return createImageBitmap(file, { imageOrientation: 'from-image' }).catch(() => viaImg(file));
    return viaImg(file);
  }
  function viaImg(file) {
    return new Promise((res, rej) => {
      const u = URL.createObjectURL(file); const img = new Image();
      img.onload = () => { URL.revokeObjectURL(u); res(img); };
      img.onerror = () => { URL.revokeObjectURL(u); rej(new Error('Gambar tidak bisa dibaca')); };
      img.src = u;
    });
  }
  function canvasToBlob(c, type, q) { return new Promise(r => c.toBlob(r, type, q)); }

  /** Terima File dari kamera/galeri/PDF, simpan, kembalikan {id, hash, kind, size}. */
  async function savePhotoFile(file, opts) {
    opts = opts || {};
    const isPdf = file.type === 'application/pdf' || /\.pdf$/i.test(file.name || '');
    const isImg = /^image\//.test(file.type) || /\.(jpe?g|png|webp|heic|heif)$/i.test(file.name || '');
    if (!isPdf && !isImg) throw new Error('Format berkas tidak didukung. Pakai foto (JPG/PNG) atau PDF.');
    if (isPdf) {
      if (file.size > 8 * 1024 * 1024) throw new Error('PDF terlalu besar (maksimal 8 MB).');
      const buf = await file.arrayBuffer();
      const id = 'pdf_' + Core.uid('f');
      const hash = await hashBuffer(buf);
      await putPhoto(id, { id, blob: new Blob([buf], { type: 'application/pdf' }), type: 'application/pdf', name: file.name || 'nota.pdf', hash, size: file.size, createdAt: Date.now() });
      return { id, hash, kind: 'pdf', size: file.size, name: file.name };
    }
    const bmp = await loadBitmap(file);
    const max = opts.max || 1600;
    const w0 = bmp.width, h0 = bmp.height;
    const sc = Math.min(1, max / Math.max(w0, h0));
    const w = Math.max(1, Math.round(w0 * sc)), h = Math.max(1, Math.round(h0 * sc));
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const g = c.getContext('2d');
    g.fillStyle = '#fff'; g.fillRect(0, 0, w, h);
    g.drawImage(bmp, 0, 0, w, h);
    if (bmp.close) bmp.close();
    let blob = await canvasToBlob(c, 'image/jpeg', 0.78);
    if (!blob) throw new Error('Gagal memproses gambar');
    const buf = await blob.arrayBuffer();
    const hash = await hashBuffer(buf);
    const id = 'img_' + Core.uid('f');
    await putPhoto(id, { id, blob, type: 'image/jpeg', name: (file.name || 'nota').replace(/\.[^.]+$/, '') + '.jpg', hash, size: blob.size, createdAt: Date.now(), w, h });
    return { id, hash, kind: 'img', size: blob.size, name: file.name };
  }

  /** Hapus foto yang tidak dipakai transaksi/inbox manapun. */
  async function gcPhotos(state) {
    try {
      const used = new Set();
      for (const t of state.transactions) if (t.photoId) used.add(t.photoId);
      for (const r of state.receipts) if (r.photoId) used.add(r.photoId);
      const ids = await allPhotoIds();
      let n = 0;
      for (const id of ids) if (!used.has(id)) { await deletePhoto(id); n++; }
      return n;
    } catch (e) { return 0; }
  }

  /* ----- Backup foto ----- */
  function blobToDataURL(blob) { return new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(blob); }); }
  async function exportPhotos(state) {
    const out = {};
    const ids = new Set();
    for (const t of state.transactions) if (t.photoId && !String(t.photoId).startsWith('demo-')) ids.add(t.photoId);
    for (const r of state.receipts) if (r.photoId) ids.add(r.photoId);
    for (const id of ids) {
      const rec = await getPhoto(id);
      if (rec && rec.blob) out[id] = { type: rec.type, name: rec.name, hash: rec.hash, data: await blobToDataURL(rec.blob) };
    }
    return out;
  }
  async function importPhotos(map) {
    let n = 0;
    for (const [id, p] of Object.entries(map || {})) {
      const blob = await (await fetch(p.data)).blob();
      await putPhoto(id, { id, blob, type: p.type, name: p.name, hash: p.hash, size: blob.size, createdAt: Date.now() });
      n++;
    }
    return n;
  }

  root.DB = { init, mode: () => mode, loadState, saveState, onRemoteChange, putPhoto, getPhoto, deletePhoto, photoURL, clearAll, savePhotoFile, gcPhotos, exportPhotos, importPhotos };
})(typeof self !== 'undefined' ? self : this);
