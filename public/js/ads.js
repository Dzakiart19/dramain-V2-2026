/**
 * Iklan (ExoClick).
 *
 * Banner display (zone 5972888 & 5972890) sudah dirender langsung oleh
 * skrip ExoClick (ad-provider.js + <ins data-zoneid>) yang ditaruh inline
 * di index.html/watch.html — tidak butuh logika JS tambahan di sini.
 *
 * File ini HANYA menangani popup dari 2 zone VAST (5972886 & 5972892).
 * Investigasi menunjukkan kedua zone itu bukan iklan video asli — keduanya
 * VAST <Wrapper> yang isinya redirect ke popup/landing page pihak ketiga
 * (bukan <InLine> dengan <MediaFile> yang bisa diputar di <video>). Karena
 * itu diperlakukan sebagai "direct link" — dibuka di tab baru sekali per
 * sesi pada interaksi klik pertama, sama seperti pola direct-link Adsterra
 * sebelumnya.
 *
 * Resolusi VAST dilakukan di BACKEND (/api/ad-popup-target), bukan fetch
 * langsung dari browser ke magsrv.com — domain iklan sering diblokir oleh
 * ad-blocker/browser mobile di sisi client.
 *
 * PENTING (revisi ke-2): dulu kode ini membuka tab KOSONG dulu (sinkron,
 * supaya lolos gesture-check browser), baru mengisi URL-nya setelah VAST
 * selesai di-resolve (async) — dan menutup tab itu kalau ternyata no-fill.
 * Di HP, window.close() yang dipanggil dari JS pada tab yang browser
 * anggap "tab asli" (bukan popup window klasik) SERING diabaikan diam-diam
 * oleh mobile browser (langkah keamanan) — jadi tab kosong itu nyangkut
 * selamanya di about:blank. Tab kosong seperti itu TIDAK menghasilkan
 * trafik/pendapatan apa pun karena tidak ada iklan yang benar-benar tampil.
 *
 * Solusi: resolve VAST di BACKGROUND begitu halaman dimuat (bukan di
 * dalam click handler), simpan hasilnya. Baru saat user klik, kalau target
 * SUDAH didapat, langsung window.open(target) sinkron (satu langkah, tanpa
 * tab kosong perantara). Kalau belum/tidak ada iklan (no-fill), popup
 * SAMA SEKALI TIDAK dibuka — tidak ada tab kosong yang mengganggu.
 */

import { backendUrl } from "/js/api.js";

const SESSION_FLAG = "dramain_exoclick_popup_shown";

async function resolveVastTarget() {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 7000);
  try {
    const res = await fetch(backendUrl("/api/ad-popup-target"), { signal: controller.signal });
    if (!res.ok) return null;
    const json = await res.json();
    return json?.ok ? (json.data?.target ?? null) : null;
  } finally {
    clearTimeout(timer);
  }
}

function triggerPopupOnce() {
  if (sessionStorage.getItem(SESSION_FLAG)) return;

  // Mulai resolve di background segera saat halaman dimuat — supaya saat
  // user benar-benar klik, target (kalau ada) sudah siap dan window.open
  // bisa dipanggil sinkron langsung ke URL final (tanpa tab kosong).
  let resolvedTarget = null;
  let resolving = true;
  resolveVastTarget()
    .then((target) => { resolvedTarget = target; })
    .catch(() => { resolvedTarget = null; })
    .finally(() => { resolving = false; });

  const openOnce = () => {
    if (sessionStorage.getItem(SESSION_FLAG)) return;
    if (resolving) return; // belum selesai resolve — jangan buka apa pun, tunggu klik berikutnya
    document.removeEventListener("click", openOnce, true);

    if (!resolvedTarget) return; // no-fill — tidak ada popup sama sekali, tidak ada tab kosong

    sessionStorage.setItem(SESSION_FLAG, "1");
    window.open(resolvedTarget, "_blank", "noopener,noreferrer");
  };

  document.addEventListener("click", openOnce, true);
}

try {
  triggerPopupOnce();
} catch {
  // sessionStorage bisa gagal di mode privat ketat — abaikan.
}
