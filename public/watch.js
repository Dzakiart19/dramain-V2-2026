/* ─── Parse URL params ────────────────────────────────────── */
const params    = new URLSearchParams(location.search);
const PROVIDER  = params.get("provider") || "dramabox";
const ID        = params.get("id") || "";
let   currentEp = Number(params.get("ep")) || 1;

/* ─── DOM ─────────────────────────────────────────────────── */
const $ = (id) => document.getElementById(id);
const video        = $("videoPlayer");
const playerLoader = $("playerLoader");
const dramaInfo    = $("dramaInfo");
const episodeList  = $("episodeList");
const epStatus     = $("episodeStatus");

/* ─── HLS Player ──────────────────────────────────────────── */
let hls = null;
let currentVideoUrl = "";

function showOpenExternal() {
  playerLoader.innerHTML = `
    <div style="text-align:center;padding:16px">
      <p style="font-size:1.3rem">▶️</p>
      <p style="color:#a0a0b0;margin:8px 0 14px;font-size:0.88rem">
        Video siap — klik untuk nonton
      </p>
      <button onclick="window.open(location.href,'_blank')"
        style="padding:10px 20px;background:var(--accent);border:none;border-radius:8px;color:#fff;font-size:0.9rem;cursor:pointer;font-weight:600">
        🔗 Buka di Tab Baru
      </button>
    </div>`;
  playerLoader.style.display = "flex";
}

function loadStream(videoUrl) {
  currentVideoUrl = videoUrl;
  playerLoader.style.display = "flex";
  playerLoader.innerHTML = `<div class="spinner"></div><p>Memuat video...</p>`;

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
        showToast("Koneksi terputus...", 3000);
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

/* ─── API ─────────────────────────────────────────────────── */
async function api(path) {
  const res = await fetch(path);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const j = await res.json();
  if (!j.ok) throw new Error(j.error ?? "Server error");
  return j.data;
}

/* ─── Episode ─────────────────────────────────────────────── */
async function playEpisode(ep) {
  currentEp = ep;

  document.querySelectorAll(".ep-btn").forEach((b) => {
    b.classList.toggle("active", Number(b.dataset.ep) === ep);
  });

  const activeBtn = document.querySelector(`.ep-btn[data-ep="${ep}"]`);
  if (activeBtn) activeBtn.scrollIntoView({ block: "nearest", behavior: "smooth" });

  history.replaceState(null, "", `?provider=${PROVIDER}&id=${ID}&ep=${ep}`);

  try {
    playerLoader.style.display = "flex";
    playerLoader.innerHTML = `<div class="spinner"></div><p>Memuat episode ${ep}...</p>`;

    const data = await api(`/api/watch/${PROVIDER}/${ID}?ep=${ep}`);

    if (data.locked) {
      playerLoader.innerHTML = `<div style="text-align:center">
        <p style="font-size:2rem">🔒</p>
        <p style="margin-top:8px;color:#a0a0b0">Episode ${ep} terkunci</p>
      </div>`;
      return;
    }

    if (!data.videoUrl) throw new Error("URL stream tidak tersedia");
    loadStream(data.videoUrl);

  } catch (e) {
    playerLoader.innerHTML = `<div style="text-align:center;color:#a0a0b0">
      <p>⚠️ Gagal memuat episode ${ep}</p>
      <p style="font-size:0.8rem;margin-top:6px">${esc(e.message)}</p>
      <button onclick="playEpisode(${ep})" style="margin-top:12px;padding:8px 16px;background:var(--accent);border:none;border-radius:8px;color:#fff;cursor:pointer">Coba Lagi</button>
    </div>`;
    playerLoader.style.display = "flex";
  }
}

/**
 * Bangun tombol episode dari array episode objects atau dari total count.
 * @param {Array|number} episodesData - array of {number, title, locked} atau integer
 */
function buildEpisodeButtons(episodesData) {
  episodeList.innerHTML = "";

  let episodes = [];

  if (Array.isArray(episodesData) && episodesData.length > 0) {
    episodes = episodesData;
  } else if (typeof episodesData === "number" && episodesData > 0) {
    episodes = Array.from({ length: episodesData }, (_, i) => ({
      number: i + 1, title: `Episode ${i + 1}`, locked: false,
    }));
  }

  if (!episodes.length) {
    epStatus.textContent = "Jumlah episode tidak diketahui";
    return;
  }

  const locked = episodes.filter((e) => e.locked).length;
  const unlocked = episodes.length - locked;
  epStatus.textContent = `${episodes.length} episode · ${unlocked} dapat ditonton${locked ? ` · ${locked} terkunci` : ""}`;

  episodes.forEach((ep) => {
    const btn = document.createElement("button");
    btn.className = "ep-btn" + (ep.locked ? " locked" : "") + (ep.number === currentEp ? " active" : "");
    btn.textContent = ep.number;
    btn.dataset.ep = ep.number;
    btn.title = ep.locked ? `🔒 ${ep.title}` : ep.title;

    if (!ep.locked) {
      btn.addEventListener("click", () => playEpisode(ep.number));
    }
    episodeList.appendChild(btn);
  });

  const activeBtn = episodeList.querySelector(".ep-btn.active");
  if (activeBtn) activeBtn.scrollIntoView({ block: "nearest" });
}

/* ─── Init ────────────────────────────────────────────────── */
async function init() {
  if (!ID) {
    dramaInfo.innerHTML = `<p style="color:var(--text2)">Drama tidak ditemukan.</p>`;
    return;
  }

  document.title = "Memuat... — DramaStream";

  try {
    const d = await api(`/api/drama/${PROVIDER}/${ID}`);
    document.title = `${d.title} — DramaStream`;

    dramaInfo.innerHTML = `
      <div class="drama-badges">
        <span class="badge">📺 ${esc(d.provider)}</span>
        <span class="badge">🎬 ${d.totalEpisodes || "?"} episode</span>
      </div>
      <div class="drama-title">${esc(d.title)}</div>
      <div class="drama-desc">${esc(d.description || "Tidak ada deskripsi.")}</div>`;

    buildEpisodeButtons(d.episodes?.length ? d.episodes : d.totalEpisodes);

  } catch (e) {
    dramaInfo.innerHTML = `<p style="color:var(--text2)">Gagal memuat info drama: ${esc(e.message)}</p>`;
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

/* ─── Utility ─────────────────────────────────────────────── */
function esc(str) {
  if (!str) return "";
  return String(str)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;")
    .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function showToast(msg, ms = 3000) {
  const t = $("toast");
  t.textContent = msg; t.classList.remove("hidden");
  setTimeout(() => t.classList.add("hidden"), ms);
}

init();
