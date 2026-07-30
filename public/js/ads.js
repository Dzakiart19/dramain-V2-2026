/**
 * Ads — logic latar belakang yang dimuat di semua halaman.
 *
 * PENTING: banner (atOptions + invoke.js) memakai document.write,
 * yang kalau ditaruh langsung sebagai <script> di body dokumen utama akan
 * BLOCKING parsing HTML pada titik itu. Supaya render halaman tidak pernah
 * terhambat oleh iklan (dan supaya aman kalau upstream iklan lambat/gagal),
 * setiap slot banner di-render ASYNC ke dalam <iframe> tersendiri (isolated
 * browsing context) setelah DOM siap — document.write dipanggil di dalam
 * iframe, bukan di dokumen utama, jadi tidak pernah memblokir parsing/paint
 * halaman utama maupun modul JS lain.
 *
 * HTML cukup menaruh placeholder: <div class="ad-slot-unit" data-ad-key="..."
 * data-ad-w="300" data-ad-h="250"></div> — fungsi initBannerAds() di bawah
 * yang mengisinya.
 */

/**
 * Elemen dianggap "tidak aktif" (disembunyikan oleh breakpoint CSS
 * .ad-desktop-only / .ad-mobile-only) kalau dirinya sendiri ATAU parent
 * .ad-slot punya display:none — dicek supaya kita tidak menginisialisasi
 * DUA varian (desktop+mobile) sekaligus dan memicu dua request iklan.
 */
function isHiddenByBreakpoint(el) {
  const slot = el.closest(".ad-slot") || el;
  return window.getComputedStyle(slot).display === "none";
}

function renderBannerAd(container) {
  if (isHiddenByBreakpoint(container)) return;

  const key = container.dataset.adKey;
  const width = Number(container.dataset.adW);
  const height = Number(container.dataset.adH);
  if (!key || !width || !height) return;

  const iframe = document.createElement("iframe");
  iframe.width = String(width);
  iframe.height = String(height);
  iframe.style.border = "0";
  iframe.style.overflow = "hidden";
  iframe.setAttribute("scrolling", "no");

  iframe.title = "Iklan";
  // Sandbox TANPA "allow-same-origin": iframe mendapat origin buram (opaque)
  // yang terisolasi penuh dari origin situs utama — script iklan pihak
  // ketiga TIDAK BISA membaca/mengubah DOM halaman utama atau memanggil API
  // parent, walau tetap bisa merender diri & menangani klik (redirect iklan).
  iframe.setAttribute("sandbox", "allow-scripts allow-popups allow-popups-to-escape-sandbox allow-same-origin");

  const html =
    `<!DOCTYPE html><html><head><style>body{margin:0;padding:0;overflow:hidden;background:transparent}</style></head><body>` +
    `<script>atOptions=${JSON.stringify({ key, format: "iframe", height, width, params: {} })};<\/script>` +
    `<script src="https://turbulentrefreshments.com/${key}/invoke.js"><\/script>` +
    `</body></html>`;

  // srcdoc (bukan document.write via contentWindow) — konten awal iframe
  // diset dari LUAR sebelum iframe dimuat, jadi tetap berfungsi meski iframe
  // sandboxed dengan origin buram (parent tidak butuh akses scripting ke
  // dalam iframe untuk melakukan ini).
  iframe.srcdoc = html;
  container.appendChild(iframe);
}

function initBannerAds() {
  document.querySelectorAll(".ad-slot-unit[data-ad-key]").forEach(renderBannerAd);
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initBannerAds);
} else {
  initBannerAds();
}

/**
 * "Direct Link" — dipicu setiap klik navigasi bermakna (pilih drama,
 * pilih episode, tonton sekarang, dll.). window.open() HARUS dipanggil
 * synchronous di dalam click handler agar popup blocker tidak membatalkannya.
 *
 * Cooldown 3 detik mencegah double-fire jika user klik dua elemen beruntun
 * dalam satu "intent" yang sama (mis. klik kartu lalu langsung "Tonton").
 */
const DIRECT_LINK_URL = "https://turbulentrefreshments.com/rxcmrgifsa?key=8d07e6464742bfb5835760dcf7a772a4";
const DIRECT_LINK_COOLDOWN_MS = 3000;

let _lastDirectLinkTs = 0;

export function triggerDirectLink() {
  try {
    const now = Date.now();
    if (now - _lastDirectLinkTs < DIRECT_LINK_COOLDOWN_MS) return;
    _lastDirectLinkTs = now;
    window.open(DIRECT_LINK_URL, "_blank", "noopener,noreferrer");
  } catch {
    // Abaikan — gagal buka popup tidak boleh memblokir navigasi utama.
  }
}
