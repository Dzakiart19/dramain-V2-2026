import { api, backendUrl } from "./api.js";
import { esc, showToast } from "./utils.js";
import { icon } from "./icons.js";
import { saveProgress, getEntry } from "./history.js";

/* ─── Parse URL params ────────────────────────────────────── */
const params    = new URLSearchParams(location.search);
const PROVIDER  = params.get("provider") || "dramabox";
const ID        = params.get("id") || "";
// Jika platform tidak ada di URL, fallback ke provider id (konvensi: provider id = platform id)
const PLATFORM  = params.get("platform") || PROVIDER;
let   currentEp = Number(params.get("ep")) || 1;
let   totalEpisodesCount = 0;
let   episodesData = [];
// Judul/cover drama — diisi saat init() sukses, dipakai untuk menulis riwayat
// tontonan (history.js) tanpa perlu fetch ulang tiap ganti episode.
let   dramaTitle = "";
let   dramaCover = "";
// Token untuk mencegah race condition saat klik episode beruntun:
// response episode lama yang datang terlambat akan diabaikan.
let   playToken = 0;

/* ─── DOM ─────────────────────────────────────────────────── */
const $ = (id) => document.getElementById(id);
const video        = $("videoPlayer");
const playerLoader = $("playerLoader");
const dramaInfo    = $("dramaInfo");
const episodeList  = $("episodeList");
const epStatus     = $("episodeStatus");
const autoplayToggle = $("autoplayToggle");

/* ─── Autoplay episode berikutnya ────────────────────────────
 * Default aktif — dipersist per-browser lewat localStorage supaya
 * pilihan pengguna tidak reset setiap ganti drama.
 */
let autoplayEnabled = localStorage.getItem("dramain_autoplay") !== "off";

function setAutoplay(enabled) {
  autoplayEnabled = enabled;
  localStorage.setItem("dramain_autoplay", enabled ? "on" : "off");
  autoplayToggle.classList.toggle("is-on", enabled);
  autoplayToggle.setAttribute("aria-pressed", String(enabled));
}

/* ─── HLS Player ──────────────────────────────────────────── */
let hls = null;

function showOpenExternal() {
  playerLoader.innerHTML = `
    <div class="loader-card">
      <div class="loader-icon">${icon.play()}</div>
      <p class="loader-text">Video siap — klik untuk nonton</p>
      <button class="btn-primary" id="openExternalBtn">Buka di Tab Baru</button>
    </div>`;
  playerLoader.style.display = "flex";
  $("openExternalBtn").addEventListener("click", () => window.open(location.href, "_blank"));
}

function showCompleted() {
  playerLoader.innerHTML = `
    <div class="loader-card">
      <div class="loader-icon">${icon.check()}</div>
      <p class="loader-text">Tamat — semua episode sudah ditonton</p>
    </div>`;
  playerLoader.style.display = "flex";
}

/** Terapkan posisi resume (kalau ada) sekali saat video baru siap diputar. */
function applyResumeSeek(resumeSeconds) {
  if (resumeSeconds > 0 && isFinite(video.duration) && resumeSeconds < video.duration - 3) {
    try { video.currentTime = resumeSeconds; } catch {}
  }
}

/** Putar stream HLS via HLS.js (DramaBox dan platform HLS lainnya). */
function loadStream(videoUrl, resumeSeconds = 0) {
  playerLoader.style.display = "flex";
  playerLoader.innerHTML = `<div class="spinner"></div><p class="loader-text">Memuat video...</p>`;

  if (Hls.isSupported()) {
    if (hls) { hls.destroy(); hls = null; }
    hls = new Hls({
      enableWorker: false,
      lowLatencyMode: false,
      maxBufferLength: 30,
      maxMaxBufferLength: 60,
      startLevel: -1,
      abrEwmaDefaultEstimate: 1000000,
    });
    hls.loadSource(videoUrl);
    hls.attachMedia(video);
    hls.on(Hls.Events.MANIFEST_PARSED, () => {
      playerLoader.style.display = "none";
      applyResumeSeek(resumeSeconds);
      video.play().catch(() => showOpenExternal());
    });
    hls.on(Hls.Events.ERROR, (_, data) => {
      if (!data.fatal) return;
      console.error("HLS fatal:", data.type, data.details);
      if (data.type === Hls.ErrorTypes.NETWORK_ERROR) {
        showToast("Koneksi terputus, mencoba lagi...", 3000);
        setTimeout(() => hls && hls.startLoad(), 2000);
      } else {
        showOpenExternal();
      }
    });
  } else if (video.canPlayType("application/vnd.apple.mpegurl")) {
    video.src = videoUrl;
    video.addEventListener("loadedmetadata", () => {
      playerLoader.style.display = "none";
      applyResumeSeek(resumeSeconds);
      video.play().catch(() => {});
    }, { once: true });
    video.addEventListener("error", () => showOpenExternal(), { once: true });
  } else {
    showOpenExternal();
  }
}

/** Putar video MP4 langsung via native <video> (PineDrama & platform MP4 lainnya). */
function loadMp4(videoUrl, resumeSeconds = 0) {
  playerLoader.style.display = "flex";
  playerLoader.innerHTML = `<div class="spinner"></div><p class="loader-text">Memuat video...</p>`;

  if (hls) { hls.destroy(); hls = null; }

  video.src = videoUrl;
  video.addEventListener("canplay", () => {
    playerLoader.style.display = "none";
    applyResumeSeek(resumeSeconds);
    video.play().catch(() => showOpenExternal());
  }, { once: true });
  video.addEventListener("error", () => showOpenExternal(), { once: true });
}

/**
 * Simpan progres tontonan saat ini ke riwayat (localStorage). Provider &
 * platform SELALU dari konstanta URL halaman ini (bukan pilihan dropdown
 * lain di tab manapun) — jadi tidak mungkin salah platform.
 */
function persistProgress() {
  if (!ID || !video.duration || !isFinite(video.duration)) return;
  saveProgress({
    provider: PROVIDER,
    platform: PLATFORM,
    id: ID,
    title: dramaTitle,
    cover: dramaCover,
    episode: currentEp,
    totalEpisodes: totalEpisodesCount,
    positionSec: video.currentTime,
    durationSec: video.duration,
  });
}

// Autosave berkala (throttle 5 detik) + saat video di-pause/tab disembunyikan/
// ditutup — supaya progres tetap tersimpan walau user keluar mendadak tanpa
// menunggu HLS/MP4 selesai.
let lastProgressSaveTs = 0;
video.addEventListener("timeupdate", () => {
  if (isPlayingAd) return; // jangan simpan posisi iklan sebagai progres drama
  const now = Date.now();
  if (now - lastProgressSaveTs < 5000) return;
  lastProgressSaveTs = now;
  persistProgress();
});
video.addEventListener("pause", () => { if (!isPlayingAd) persistProgress(); });
document.addEventListener("visibilitychange", () => { if (document.hidden && !isPlayingAd) persistProgress(); });
window.addEventListener("pagehide", () => { if (!isPlayingAd) persistProgress(); });

/* ─── Iklan pre-roll (ExoClick) ───────────────────────────────
 * Diputar inline di dalam player SEBELUM episode dimulai, pada episode
 * 1, 6, 11, 16, ... (setiap kelipatan 5 dari episode 1). isPlayingAd
 * dicek di semua listener video (timeupdate/pause/dst.) supaya progres
 * tontonan drama tidak ikut kesimpan sebagai posisi iklan.
 */
let isPlayingAd = false;

function shouldShowPrerollAd(ep) {
  return (ep - 1) % 5 === 0;
}

/**
 * Tampilkan iklan pre-roll SEBELUM episode dimulai, memakai unit ExoClick
 * "Outstream Video" (zone 5972890) yang SAMA dengan yang sudah terbukti
 * selalu berhasil serve di halaman ini (bukan zone VAST 5972886/5972892 —
 * itu zone khusus popunder/direct-link, fill-nya rendah dan tidak
 * didesain untuk video inline, itu sebabnya sebelumnya sering "kosong").
 *
 * Prosesnya SELALU transparan buat user — tidak pernah diam-diam kosong:
 * - Ada fill  → video iklan tampil, ada tombol Lewati setelah 5 detik.
 * - Tidak ada fill (stok iklan network sedang kosong) → tampil pesan
 *   singkat "Iklan tidak tersedia saat ini" ~1.5 detik, baru lanjut.
 * Dibatasi keras maksimal 20 detik total supaya tidak pernah macet.
 */
function runPrerollAd() {
  return new Promise((resolve) => {
    const wrap = document.querySelector(".player-wrap");
    const nodes = [];
    const cleanupAndResolve = () => {
      clearTimeout(hardTimeout);
      nodes.forEach((n) => n.remove());
      isPlayingAd = false;
      resolve();
    };

    isPlayingAd = true;
    playerLoader.style.display = "none";

    const badge = document.createElement("div");
    badge.className = "ad-preroll-badge";
    badge.textContent = "Iklan";
    wrap.appendChild(badge);
    nodes.push(badge);

    const adBox = document.createElement("div");
    adBox.className = "ad-preroll-box";
    adBox.innerHTML = `<ins class="eas6a97888e37" data-zoneid="5972890"></ins>`;
    wrap.appendChild(adBox);
    nodes.push(adBox);

    const statusText = document.createElement("p");
    statusText.className = "ad-preroll-status";
    statusText.textContent = "Memuat iklan...";
    wrap.appendChild(statusText);
    nodes.push(statusText);

    try {
      (window.AdProvider = window.AdProvider || []).push({ serve: {} });
    } catch {}

    const hardTimeout = setTimeout(cleanupAndResolve, 20000);

    // Beri jeda ~2.5 detik untuk cek apakah ExoClick berhasil isi <ins>
    // dengan konten (iframe iklan). Kalau tidak (no-fill), kabari user
    // secara jelas lalu lanjut — jangan diam-diam skip tanpa penjelasan.
    setTimeout(() => {
      const filled = adBox.querySelector("ins")?.childElementCount > 0;
      if (!filled) {
        statusText.textContent = "Iklan tidak tersedia saat ini";
        setTimeout(cleanupAndResolve, 1500);
        return;
      }

      statusText.remove();
      // Tombol lewati muncul setelah 5 detik nonton iklan.
      setTimeout(() => {
        if (!isPlayingAd) return;
        const skipBtn = document.createElement("button");
        skipBtn.className = "ad-preroll-skip";
        skipBtn.textContent = "Lewati Iklan ▸";
        skipBtn.addEventListener("click", cleanupAndResolve);
        wrap.appendChild(skipBtn);
        nodes.push(skipBtn);
      }, 5000);

      // Total tayang iklan ~15 detik sejak konfirmasi terisi.
      setTimeout(cleanupAndResolve, 15000);
    }, 2500);
  });
}

/* ─── Episode ─────────────────────────────────────────────── */
async function playEpisode(ep) {
  if (ep < 1) return;

  if (ep > totalEpisodesCount && totalEpisodesCount > 0) {
    showCompleted();
    return;
  }

  currentEp = ep;
  // Naikkan token — response request lama yang belum selesai akan diabaikan.
  const myToken = ++playToken;

  document.querySelectorAll(".ep-btn").forEach((b) => {
    b.classList.toggle("active", Number(b.dataset.ep) === ep);
  });
  const activeBtn = document.querySelector(`.ep-btn[data-ep="${ep}"]`);
  if (activeBtn) activeBtn.scrollIntoView({ block: "nearest", behavior: "smooth" });

  history.replaceState(null, "", `?provider=${PROVIDER}&id=${ID}&ep=${ep}&platform=${PLATFORM}`);

  if (shouldShowPrerollAd(ep)) {
    await runPrerollAd(myToken);
    if (myToken !== playToken) return;
    video.controls = true;
    video.muted = false;
  }

  try {
    playerLoader.style.display = "flex";
    playerLoader.innerHTML = `<div class="spinner"></div><p class="loader-text">Memuat episode ${ep}...</p>`;

    const data = await api(`/api/watch/${PROVIDER}/${ID}?ep=${ep}&platform=${PLATFORM}`);

    // Abaikan response jika user sudah klik episode lain sebelum ini selesai
    if (myToken !== playToken) return;

    if (data.locked) {
      playerLoader.innerHTML = `
        <div class="loader-card">
          <div class="loader-icon">${icon.lock()}</div>
          <p class="loader-text">Episode ${ep} terkunci</p>
        </div>`;
      return;
    }

    if (!data.videoUrl) throw new Error("URL stream tidak tersedia");

    // Resume mid-episode HANYA jika riwayat tersimpan untuk provider+id INI
    // persis di episode yang sama — kalau beda episode, mulai dari 0.
    const savedEntry = getEntry(PROVIDER, ID);
    const resumeSeconds =
      savedEntry && savedEntry.episode === ep && savedEntry.positionSec > 5
        ? savedEntry.positionSec
        : 0;

    // Tulis entri riwayat segera (sebelum video selesai load) supaya baris
    // "Lanjutkan Menonton" di home tetap tercatat walau user langsung
    // menutup tab sebelum sempat menonton.
    saveProgress({
      provider: PROVIDER,
      platform: PLATFORM,
      id: ID,
      title: dramaTitle,
      cover: dramaCover,
      episode: ep,
      totalEpisodes: totalEpisodesCount,
      positionSec: resumeSeconds,
      durationSec: savedEntry?.episode === ep ? savedEntry.durationSec : 0,
    });

    if (data.streamType === "mp4") {
      // PineDrama: URL TikTok CDN langsung (MP4), tidak perlu prefix backend
      loadMp4(data.videoUrl, resumeSeconds);
    } else {
      // DramaBox & platform HLS: videoUrl adalah path internal → prefix backend
      loadStream(backendUrl(data.videoUrl), resumeSeconds);
    }
  } catch (e) {
    if (myToken !== playToken) return;
    playerLoader.innerHTML = `
      <div class="loader-card">
        <div class="loader-icon">${icon.alert()}</div>
        <p class="loader-text">Gagal memuat episode ${ep}</p>
        <p class="loader-sub">${esc(e.message)}</p>
        <button class="btn-secondary" id="retryBtn">Coba Lagi</button>
      </div>`;
    playerLoader.style.display = "flex";
    $("retryBtn").addEventListener("click", () => playEpisode(ep));
  }
}

/**
 * Bangun tombol episode dari array episode objects atau dari total count.
 * @param {Array|number} episodesInput
 */
function buildEpisodeButtons(episodesInput) {
  episodeList.innerHTML = "";
  episodesData = [];

  if (Array.isArray(episodesInput) && episodesInput.length > 0) {
    episodesData = episodesInput;
  } else if (typeof episodesInput === "number" && episodesInput > 0) {
    episodesData = Array.from({ length: episodesInput }, (_, i) => ({
      number: i + 1, title: `Episode ${i + 1}`, locked: false,
    }));
  }

  totalEpisodesCount = episodesData.length;

  if (!episodesData.length) {
    epStatus.textContent = "Jumlah episode tidak diketahui";
    return;
  }

  const locked = episodesData.filter((e) => e.locked).length;
  const unlocked = episodesData.length - locked;
  epStatus.textContent = `${episodesData.length} episode · ${unlocked} dapat ditonton${locked ? ` · ${locked} terkunci` : ""}`;

  episodesData.forEach((ep) => {
    const btn = document.createElement("button");
    btn.className = "ep-btn" + (ep.locked ? " locked" : "") + (ep.number === currentEp ? " active" : "");
    btn.innerHTML = ep.locked
      ? `${icon.lock()}<span>${ep.number}</span>`
      : `<span>${ep.number}</span>`;
    btn.dataset.ep = ep.number;
    btn.title = ep.title;

    if (!ep.locked) {
      btn.addEventListener("click", () => playEpisode(ep.number));
    }
    episodeList.appendChild(btn);
  });

  const activeBtn = episodeList.querySelector(".ep-btn.active");
  if (activeBtn) activeBtn.scrollIntoView({ block: "nearest" });
}

/* ─── Autoplay ke episode berikutnya saat video selesai ─────── */
video.addEventListener("ended", () => {
  if (!autoplayEnabled) return;

  const nextEp = episodesData.find((e) => e.number === currentEp + 1);
  if (!nextEp) {
    showCompleted();
    return;
  }
  if (nextEp.locked) {
    showToast(`Episode ${nextEp.number} terkunci`, 3000);
    return;
  }
  playEpisode(nextEp.number);
});

autoplayToggle.addEventListener("click", () => setAutoplay(!autoplayEnabled));

/* ─── Meta tag helpers ────────────────────────────────────── */

/** Update <meta name="..."> atau <meta property="..."> secara aman. */
function setMeta(nameOrProp, content) {
  if (!content) return;
  let el = document.querySelector(
    `meta[name="${nameOrProp}"], meta[property="${nameOrProp}"]`
  );
  if (!el) {
    el = document.createElement("meta");
    const isOg = nameOrProp.startsWith("og:") || nameOrProp.startsWith("twitter:");
    el.setAttribute(isOg ? "property" : "name", nameOrProp);
    document.head.appendChild(el);
  }
  el.setAttribute("content", content);
}

/**
 * Perbarui semua meta tag secara dinamis saat drama berhasil dimuat.
 * Berguna agar tautan yang dibagikan menampilkan judul + cover yang benar.
 */
function updateMetaTags(drama) {
  const BASE = "https://dramain-aja.web.app";
  const title = `${drama.title} — Dramain Aja`;
  const desc  = drama.description
    ? drama.description.slice(0, 155) + (drama.description.length > 155 ? "…" : "")
    : `Nonton ${drama.title} — ${drama.totalEpisodes || "?"} episode gratis di Dramain Aja.`;
  const image = drama.cover || `${BASE}/og-image.jpg`;
  const url   = location.href;

  document.title = title;

  // Primary
  setMeta("description", desc);

  // Open Graph
  setMeta("og:title",       title);
  setMeta("og:description", desc);
  setMeta("og:image",       image);
  setMeta("og:image:alt",   drama.title);
  setMeta("og:url",         url);

  // Twitter / X
  setMeta("twitter:title",       title);
  setMeta("twitter:description", desc);
  setMeta("twitter:image",       image);
  setMeta("twitter:image:alt",   drama.title);

  // Canonical — arahkan ke URL lengkap halaman ini (dengan provider/id/ep)
  const canonical = document.getElementById("canonicalLink");
  if (canonical) canonical.setAttribute("href", url);

  // JSON-LD structured data — perbarui VideoObject dengan data drama aktual
  const schemaEl = document.getElementById("schemaJsonLd");
  if (schemaEl) {
    schemaEl.textContent = JSON.stringify({
      "@context": "https://schema.org",
      "@type": "VideoObject",
      "name": title,
      "description": desc,
      "thumbnailUrl": image,
      "uploadDate": new Date().toISOString().split("T")[0],
      "contentUrl": url,
      "embedUrl": url,
      "publisher": {
        "@type": "Organization",
        "name": "Dramain Aja",
        "url": `${BASE}/`
      }
    });
  }
}

/* ─── Init ────────────────────────────────────────────────── */
async function init() {
  setAutoplay(autoplayEnabled);

  if (!ID) {
    dramaInfo.innerHTML = `<p class="text-muted">Drama tidak ditemukan.</p>`;
    return;
  }

  document.title = "Memuat... — Dramain Aja";

  try {
    const d = await api(`/api/drama/${PROVIDER}/${ID}?platform=${PLATFORM}`);

    dramaTitle = d.title || "";
    dramaCover = d.cover || "";

    updateMetaTags(d);

    dramaInfo.innerHTML = `
      <div class="drama-badges">
        <span class="badge">${esc(d.provider)}</span>
        <span class="badge">${d.totalEpisodes || "?"} Episode</span>
      </div>
      <div class="drama-title">${esc(d.title)}</div>
      <div class="drama-desc">${esc(d.description || "Tidak ada deskripsi.")}</div>`;

    buildEpisodeButtons(d.episodes?.length ? d.episodes : d.totalEpisodes);
  } catch (e) {
    dramaInfo.innerHTML = `<p class="text-muted">Gagal memuat info drama: ${esc(e.message)}</p>`;
  }

  await playEpisode(currentEp);
}

/* ─── Keyboard shortcuts ──────────────────────────────────── */
document.addEventListener("keydown", (e) => {
  if (e.target.tagName === "INPUT") return;
  if (e.key === "ArrowRight") playEpisode(currentEp + 1);
  if (e.key === "ArrowLeft" && currentEp > 1) playEpisode(currentEp - 1);
  if (e.key === " ") { e.preventDefault(); video.paused ? video.play() : video.pause(); }
});

init();
