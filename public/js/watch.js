import { api } from "./api.js";
import { esc, showToast } from "./utils.js";
import { icon } from "./icons.js";

/* ─── Parse URL params ────────────────────────────────────── */
const params    = new URLSearchParams(location.search);
const PROVIDER  = params.get("provider") || "dramabox";
const ID        = params.get("id") || "";
let   currentEp = Number(params.get("ep")) || 1;
let   totalEpisodesCount = 0;
let   episodesData = [];

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

function loadStream(videoUrl) {
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
      video.play().catch(() => {});
    }, { once: true });
    video.addEventListener("error", () => showOpenExternal(), { once: true });
  } else {
    showOpenExternal();
  }
}

/* ─── Episode ─────────────────────────────────────────────── */
async function playEpisode(ep) {
  if (ep < 1) return;

  if (ep > totalEpisodesCount && totalEpisodesCount > 0) {
    showCompleted();
    return;
  }

  currentEp = ep;

  document.querySelectorAll(".ep-btn").forEach((b) => {
    b.classList.toggle("active", Number(b.dataset.ep) === ep);
  });
  const activeBtn = document.querySelector(`.ep-btn[data-ep="${ep}"]`);
  if (activeBtn) activeBtn.scrollIntoView({ block: "nearest", behavior: "smooth" });

  history.replaceState(null, "", `?provider=${PROVIDER}&id=${ID}&ep=${ep}`);

  try {
    playerLoader.style.display = "flex";
    playerLoader.innerHTML = `<div class="spinner"></div><p class="loader-text">Memuat episode ${ep}...</p>`;

    const data = await api(`/api/watch/${PROVIDER}/${ID}?ep=${ep}`);

    if (data.locked) {
      playerLoader.innerHTML = `
        <div class="loader-card">
          <div class="loader-icon">${icon.lock()}</div>
          <p class="loader-text">Episode ${ep} terkunci</p>
        </div>`;
      return;
    }

    if (!data.videoUrl) throw new Error("URL stream tidak tersedia");
    loadStream(data.videoUrl);
  } catch (e) {
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

/* ─── Init ────────────────────────────────────────────────── */
async function init() {
  setAutoplay(autoplayEnabled);

  if (!ID) {
    dramaInfo.innerHTML = `<p class="text-muted">Drama tidak ditemukan.</p>`;
    return;
  }

  document.title = "Memuat... — Dramain Aja";

  try {
    const d = await api(`/api/drama/${PROVIDER}/${ID}`);
    document.title = `${d.title} — Dramain Aja`;

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
