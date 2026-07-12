/**
 * Iklan (ExoClick).
 *
 * Banner display (zone 5972888 & 5972890) sudah dirender langsung oleh
 * skrip ExoClick (ad-provider.js + <ins data-zoneid>) yang ditaruh inline
 * di index.html/watch.html — tidak butuh logika JS tambahan di sini.
 *
 * File ini HANYA menangani 2 zone VAST (5972886 & 5972892). Investigasi
 * menunjukkan kedua zone itu bukan iklan video asli — keduanya VAST
 * <Wrapper> yang isinya redirect ke popup/landing page pihak ketiga
 * (bukan <InLine> dengan <MediaFile> yang bisa diputar di <video>).
 * Karena itu, alih-alih dipaksa jadi pre-roll di dalam player, keduanya
 * diperlakukan sebagai "direct link" — dibuka di tab baru sekali per
 * sesi pada interaksi klik pertama, sama seperti pola direct-link
 * Adsterra sebelumnya. Salah satu zone dipilih acak setiap sesi supaya
 * fill-rate terbagi ke keduanya.
 */

const VAST_ZONES = [
  "https://s.magsrv.com/v1/vast.php?idz=5972886",
  "https://s.magsrv.com/v1/vast.php?idzone=5972892",
];

const SESSION_FLAG = "dramain_exoclick_popup_shown";

/**
 * Fire-and-forget tracking pixel (Impression) — dipanggil lewat Image()
 * bukan fetch(), supaya tidak pernah gagal karena CORS dan tidak
 * memblokir apa pun jika gagal.
 */
function firePixel(url) {
  if (!url) return;
  try {
    const img = new Image();
    img.referrerPolicy = "no-referrer-when-downgrade";
    img.src = url;
  } catch {
    // abaikan — tracking pixel tidak boleh pernah mengganggu UX
  }
}

/**
 * Ambil VAST XML, catat semua tracking pixel <Impression>, dan kembalikan
 * URL tujuan (VASTAdTagURI dari <Wrapper>, atau <ClickThrough> dari
 * <InLine> sebagai fallback jika suatu saat zone berubah jadi InLine).
 */
async function resolveVastTarget(vastUrl) {
  const res = await fetch(vastUrl, { credentials: "omit" });
  if (!res.ok) throw new Error(`VAST HTTP ${res.status}`);
  const text = await res.text();

  const doc = new DOMParser().parseFromString(text, "text/xml");
  if (doc.querySelector("parsererror")) throw new Error("VAST tidak valid");

  // Fire semua tracking pixel impression yang ada di respons.
  doc.querySelectorAll("Impression").forEach((node) => {
    firePixel(node.textContent?.trim());
  });

  const wrapperUri = doc.querySelector("Wrapper > VASTAdTagURI")?.textContent?.trim();
  if (wrapperUri) return wrapperUri;

  const clickThrough = doc.querySelector("InLine ClickThrough")?.textContent?.trim();
  if (clickThrough) return clickThrough;

  return null;
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

    const zone = VAST_ZONES[Math.floor(Math.random() * VAST_ZONES.length)];
    resolveVastTarget(zone)
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
