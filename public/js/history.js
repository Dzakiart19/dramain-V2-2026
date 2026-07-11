/**
 * Riwayat tontonan — disimpan di localStorage (per-browser, tidak butuh
 * akun/backend). Dipakai bersama oleh watch.js (nulis progres) dan home.js
 * (render baris "Lanjutkan Menonton").
 *
 * PENTING (anti-bocor antar-platform): setiap entri MENYIMPAN `provider`
 * DAN `platform` apa adanya sesuai saat drama itu ditonton. Saat resume,
 * kedua nilai ini WAJIB dipakai utuh (bukan provider/platform yang sedang
 * aktif di dropdown) — supaya drama yang ditonton di platform A tidak
 * pernah terbuka lewat adapter platform B. Konsisten dengan konvensi
 * proyek: provider id unik secara global (lihat lib/config.js).
 */

const KEY = "dramain_history";
const MAX_ITEMS = 40;

function readAll() {
  try {
    const raw = localStorage.getItem(KEY);
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

function writeAll(list) {
  try {
    localStorage.setItem(KEY, JSON.stringify(list));
  } catch {
    // localStorage penuh / mode privat ketat — abaikan, jangan sampai
    // memblokir playback video demi menyimpan riwayat.
  }
}

/** Semua riwayat, terbaru dulu. */
export function getHistory() {
  return readAll().sort((a, b) => b.updatedAt - a.updatedAt);
}

/** Satu entri riwayat untuk provider+id tertentu, atau null. */
export function getEntry(provider, id) {
  return readAll().find((h) => h.provider === provider && h.id === id) || null;
}

/**
 * Simpan/perbarui satu entri riwayat. Kunci unik = provider+id (provider id
 * unik global di seluruh platform, jadi tidak perlu platform di kunci).
 * Field yang tidak diisi dipertahankan dari entri lama (kalau ada) supaya
 * panggilan progres (timeupdate) tidak perlu mengirim ulang title/cover.
 */
export function saveProgress({
  provider, platform, id, title, cover,
  episode, totalEpisodes, positionSec = 0, durationSec = 0,
}) {
  if (!provider || !platform || !id) return;
  const list = readAll();
  const idx = list.findIndex((h) => h.provider === provider && h.id === id);
  const prev = idx >= 0 ? list[idx] : null;

  const entry = {
    provider, platform, id,
    title:          title ?? prev?.title ?? "",
    cover:          cover ?? prev?.cover ?? "",
    episode:        episode ?? prev?.episode ?? 1,
    totalEpisodes:  totalEpisodes ?? prev?.totalEpisodes ?? 0,
    positionSec:    Number(positionSec) || 0,
    durationSec:    Number(durationSec) || prev?.durationSec || 0,
    updatedAt:      Date.now(),
  };

  if (idx >= 0) list[idx] = entry;
  else list.push(entry);

  list.sort((a, b) => b.updatedAt - a.updatedAt);
  writeAll(list.slice(0, MAX_ITEMS));
}

export function removeEntry(provider, id) {
  writeAll(readAll().filter((h) => !(h.provider === provider && h.id === id)));
}

export function clearHistory() {
  writeAll([]);
}
