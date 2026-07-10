/**
 * Ads (Adsterra) — logic latar belakang yang dimuat di semua halaman.
 *
 * PENTING (perbaikan setelah review): banner Adsterra (atOptions + invoke.js)
 * memakai document.write, yang kalau ditaruh langsung sebagai <script> di body
 * dokumen utama akan BLOCKING parsing HTML pada titik itu. Supaya render
 * halaman tidak pernah terhambat oleh iklan (dan supaya aman kalau upstream
 * iklan lambat/gagal — mis. domain belum di-whitelist di dashboard Adsterra),
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
  iframe.setAttribute("loading", "lazy");
  iframe.title = "Iklan";
  // Sandbox TANPA "allow-same-origin": iframe mendapat origin buram (opaque)
  // yang terisolasi penuh dari origin situs utama — script iklan pihak
  // ketiga TIDAK BISA membaca/mengubah DOM halaman utama atau memanggil API
  // parent, walau tetap bisa merender diri & menangani klik (redirect iklan).
  iframe.setAttribute("sandbox", "allow-scripts allow-popups allow-popups-to-escape-sandbox");

  const html =
    `<!DOCTYPE html><html><head><style>body{margin:0;padding:0;overflow:hidden;background:transparent}</style></head><body>` +
    `<script>atOptions=${JSON.stringify({ key, format: "iframe", height, width, params: {} })};<\/script>` +
    `<script src="https://www.highperformanceformat.com/${key}/invoke.js"><\/script>` +
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
 * "Direct Link" Adsterra — dipicu sekali per SESI (bukan setiap klik) pada
 * interaksi klik pertama pengguna, dibuka di tab baru, lalu tidak lagi
 * sampai tab/sesi browser ditutup. Tidak memanggil preventDefault sehingga
 * tidak mengganggu navigasi/klik normal di situs.
 */
const DIRECT_LINK_URL = "https://www.effectivecpmnetwork.com/rxcmrgifsa?key=8d07e6464742bfb5835760dcf7a772a4";
const SESSION_FLAG = "dramain_direct_link_shown";

function triggerDirectLinkOnce() {
  if (sessionStorage.getItem(SESSION_FLAG)) return;

  const openOnce = () => {
    if (sessionStorage.getItem(SESSION_FLAG)) return;
    sessionStorage.setItem(SESSION_FLAG, "1");
    window.open(DIRECT_LINK_URL, "_blank", "noopener,noreferrer");
    document.removeEventListener("click", openOnce, true);
  };

  document.addEventListener("click", openOnce, true);
}

try {
  triggerDirectLinkOnce();
} catch {
  // sessionStorage bisa gagal di mode privat ketat — abaikan, jangan sampai
  // memblokir render halaman.
}
