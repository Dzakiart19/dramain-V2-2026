/**
 * Client API tipis — satu titik akses ke backend, dipakai home.js dan
 * watch.js. Kalau bentuk response backend berubah, cukup ubah di sini.
 */
export async function api(path) {
  const res = await fetch(path);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const j = await res.json();
  if (!j.ok) throw new Error(j.error ?? "Server error");
  return j.data;
}
