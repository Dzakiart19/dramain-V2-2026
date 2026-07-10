/**
 * Client API tipis — satu titik akses ke backend, dipakai home.js dan
 * watch.js. Kalau bentuk response backend berubah, cukup ubah di sini.
 */
// window.BACKEND_URL diisi oleh config.js (kosong = relative, diisi = absolute ke Replit)
export function backendUrl(path) {
  const base = (window.BACKEND_URL && window.BACKEND_URL !== '__REPLIT_BACKEND_URL__')
    ? window.BACKEND_URL.replace(/\/$/, '')
    : '';
  return base + path;
}

export async function api(path) {
  const res = await fetch(backendUrl(path));
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const j = await res.json();
  if (!j.ok) throw new Error(j.error ?? "Server error");
  return j.data;
}
