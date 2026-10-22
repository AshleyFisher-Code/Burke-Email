// Every call to the server function goes through here, so errors read the same everywhere.
const MOCK = /[?&]mock=1/.test(location.search) && /^(localhost|127\.0\.0\.1)$/.test(location.hostname);
let fn;
async function load() {
  if (fn) return fn;
  if (MOCK) { const m = await import('./mock.js'); fn = m.coachMock; }
  else { const f = await import('./firebase.js'); fn = d => f.coachFn(d).then(r => r.data); }
  return fn;
}
export const isMock = MOCK;
export async function ask(action, data = {}) {
  if (!MOCK && !navigator.onLine) throw new Error('No signal. The coach needs the internet. Try again when you\'re connected.');
  const f = await load();
  try { return await f({ action, ...data }); }
  catch (e) {
    const code = (e && e.code || '').replace('functions/', '');
    if (code === 'not-found' || code === 'internal' && /not found/i.test(e.message)) throw new Error('The coach isn\'t switched on yet. Ask Mom.');
    if (code === 'deadline-exceeded') throw new Error('That took too long. Try again.');
    throw new Error(e && e.message && !/^internal$/i.test(e.message) ? e.message : 'Something went wrong. Try again.');
  }
}

/** Shrink a photo/screenshot so it uploads fast but the text stays sharp. Returns base64 JPEG (no prefix). */
export async function shrink(file, longSide = 1800) {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((ok, bad) => { const i = new Image(); i.onload = () => ok(i); i.onerror = bad; i.src = url; });
    const k = Math.min(1, longSide / Math.max(img.naturalWidth, img.naturalHeight));
    const c = document.createElement('canvas');
    c.width = Math.round(img.naturalWidth * k); c.height = Math.round(img.naturalHeight * k);
    const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height); g.drawImage(img, 0, 0, c.width, c.height);
    return c.toDataURL('image/jpeg', 0.85).split(',')[1];
  } finally { URL.revokeObjectURL(url); }
}
