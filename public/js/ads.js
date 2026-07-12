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
 * ad-blocker/browser mobile di sisi client (gejalanya: tab kosong terbuka
 * tapi tidak pernah terisi URL, tanpa error terlihat). Lihat server.js.
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

async function triggerPopupOnce() {
  if (sessionStorage.getItem(SESSION_FLAG)) return;

  const openOnce = (clickEvent) => {
    if (sessionStorage.getItem(SESSION_FLAG)) return;
    // Set flag SEBELUM async work selesai — klik kedua yang terjadi saat
    // fetch masih berlangsung tidak memicu popup ganda.
    sessionStorage.setItem(SESSION_FLAG, "1");
    document.removeEventListener("click", openOnce, true);

    // PENTING: window.open() HARUS dipanggil sinkron di dalam handler klik
    // ini (bukan setelah await fetch), kalau tidak browser menganggapnya
    // bukan lagi hasil aksi user langsung dan popup-nya diblokir diam-diam
    // (tanpa error apa pun) — inilah sebab popup tidak pernah muncul
    // sebelumnya walau klik biasa (mis. tombol "Putar") tetap berfungsi
    // normal. Solusinya: buka tab kosong dulu SINKRON, baru isi URL-nya
    // setelah VAST selesai di-resolve (async).
    const popup = window.open("", "_blank", "noopener,noreferrer");

    resolveVastTarget()
      .then((target) => {
        if (target && popup && !popup.closed) popup.location.href = target;
        else if (popup && !popup.closed) popup.close();
      })
      .catch(() => {
        // Gagal resolve (network/CORS/no-fill) — tutup tab kosong, jangan
        // biarkan tab blank menggantung, dan jangan ganggu UX klik utama.
        if (popup && !popup.closed) popup.close();
      });
  };

  document.addEventListener("click", openOnce, true);
}

try {
  triggerPopupOnce();
} catch {
  // sessionStorage bisa gagal di mode privat ketat — abaikan.
}
