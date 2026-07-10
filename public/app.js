/* ─── State ───────────────────────────────────────────────── */
const MORE_KEYWORDS = [
  "love","marry","revenge","rich","secret","wife","boss","baby",
  "pregnant","ceo","doctor","poor","king","dragon","billionaire",
  "heir","twin","fake","contract","alpha","omega","vampire","witch",
  "rebirth","reborn","regret","runaway","broken","hidden","trap",
];
let moreKeyIdx  = 0;
let seenIds     = new Set();
let currentProvider = "";

/* ─── DOM ─────────────────────────────────────────────────── */
const $ = (id) => document.getElementById(id);
const searchInput    = $("searchInput");
const searchBtn      = $("searchBtn");
const heroInput      = $("heroInput");
const heroBtn        = $("heroBtn");
const providerFilter = $("providerFilter");
const searchResults  = $("searchResults");
const searchSection  = $("searchSection");
const homeSection    = $("homeSection");
const searchTitle    = $("searchTitle");
const overlay        = $("overlay");
const modalContent   = $("modalContent");
const modalClose     = $("modalClose");
const loadMoreWrap   = $("loadMoreWrap");
const loadMoreBtn    = $("loadMoreBtn");
const notifBar       = $("notifications");

/* ─── API ─────────────────────────────────────────────────── */
async function api(path) {
  const res = await fetch(path);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const j = await res.json();
  if (!j.ok) throw new Error(j.error ?? "Server error");
  return j.data;
}

/* ─── Init ────────────────────────────────────────────────── */
async function init() {
  try {
    const config = await api("/api/config");
    const platform = config[0];

    platform.providers.forEach((p) => {
      const opt = document.createElement("option");
      opt.value = p.id; opt.textContent = p.label;
      providerFilter.appendChild(opt);
    });

    currentProvider = platform.providers[0].id;
    loadNotifications();
    loadHome(currentProvider);
  } catch (e) {
    showToast("Gagal memuat konfigurasi: " + e.message);
  }
}

async function loadNotifications() {
  try {
    const notifs = await api("/api/notifications");
    if (!notifs?.length) return;
    const offline = notifs.filter((n) => n.type === "offline" || n.type === "warning");
    if (offline.length) {
      notifBar.textContent = `⚠️ ${offline.map((n) => n.platform).join(", ")} sedang maintenance`;
      notifBar.classList.remove("hidden");
    }
  } catch {}
}

/* ─── Home — Trending + Terbaru ──────────────────────────── */
async function loadHome(provider) {
  seenIds.clear();
  moreKeyIdx = 0;

  // Render skeleton dua seksi
  renderSection("trendingSection", "🔥 Trending", loadingCards(10));
  renderSection("latestSection",   "🆕 Terbaru",  loadingCards(10));
  renderSection("moreSection",     "",            "");
  loadMoreWrap.classList.remove("hidden");

  // Fetch trending + latest paralel
  const [trending, latest] = await Promise.allSettled([
    api(`/api/trending/${provider}`),
    api(`/api/latest/${provider}`),
  ]);

  if (trending.status === "fulfilled" && trending.value?.length) {
    trending.value.forEach((d) => seenIds.add(d.id));
    fillSection("trendingSection", "🔥 Trending", trending.value);
  } else {
    fillSection("trendingSection", "🔥 Trending", []);
  }

  if (latest.status === "fulfilled" && latest.value?.length) {
    latest.value.forEach((d) => seenIds.add(d.id));
    fillSection("latestSection", "🆕 Terbaru", latest.value);
  } else {
    fillSection("latestSection", "🆕 Terbaru", []);
  }
}

async function loadMore() {
  const provider = currentProvider;
  const q = MORE_KEYWORDS[moreKeyIdx % MORE_KEYWORDS.length];
  moreKeyIdx++;

  loadMoreBtn.textContent = "Memuat...";
  loadMoreBtn.disabled = true;

  try {
    const results = await api(`/api/more/${provider}?q=${encodeURIComponent(q)}`);
    // Filter duplikat
    const fresh = results.filter((d) => !seenIds.has(d.id));
    fresh.forEach((d) => seenIds.add(d.id));

    const section = $("moreSection");
    if (fresh.length) {
      // Append cards ke seksi "more"
      const grid = section.querySelector(".drama-grid") || section;
      fresh.forEach((d) => {
        const wrap = document.createElement("div");
        wrap.innerHTML = cardHTML(d);
        const card = wrap.firstElementChild;
        card.addEventListener("click", () => openModal(card.dataset.id, card.dataset.provider));
        grid.appendChild(card);
      });
    }
  } catch (e) {
    showToast("Gagal muat lebih: " + e.message);
  } finally {
    loadMoreBtn.textContent = "Muat Lebih Banyak";
    loadMoreBtn.disabled = false;
  }
}

/* ─── Section Helpers ─────────────────────────────────────── */
function renderSection(id, title, content) {
  let el = $(id);
  if (!el) {
    el = document.createElement("div");
    el.id = id;
    $("homeSections").appendChild(el);
  }
  el.innerHTML = title
    ? `<div class="section-header"><h2>${title}</h2></div><div class="drama-grid">${content}</div>`
    : `<div class="drama-grid" style="max-width:1200px;margin:0 auto;padding:0 16px">${content}</div>`;
}

function fillSection(id, title, dramas) {
  const el = $(id);
  if (!el) return;
  if (!dramas.length) {
    el.innerHTML = "";
    return;
  }
  const gridHTML = dramas.map(cardHTML).join("");
  el.innerHTML = `<div class="section-header"><h2>${title}</h2></div><div class="drama-grid">${gridHTML}</div>`;
  el.querySelectorAll(".drama-card").forEach((card) => {
    card.addEventListener("click", () => openModal(card.dataset.id, card.dataset.provider));
  });
}

/* ─── Search ──────────────────────────────────────────────── */
async function doSearch(q) {
  q = q.trim();
  if (!q) return;
  const provider = providerFilter.value || null;
  const qs = provider
    ? `q=${encodeURIComponent(q)}&provider=${provider}`
    : `q=${encodeURIComponent(q)}`;

  homeSection.classList.add("hidden");
  searchSection.classList.remove("hidden");
  searchTitle.textContent = `Hasil pencarian: "${q}"`;
  searchResults.innerHTML = loadingCards(8);

  try {
    const results = await api(`/api/search?${qs}`);
    if (!results?.length) {
      searchResults.innerHTML = emptyState("Tidak ada hasil", `Coba kata kunci lain`);
      return;
    }
    searchResults.innerHTML = results.map(cardHTML).join("");
    searchResults.querySelectorAll(".drama-card").forEach((card) => {
      card.addEventListener("click", () => openModal(card.dataset.id, card.dataset.provider));
    });
  } catch (e) {
    searchResults.innerHTML = emptyState("Pencarian gagal", e.message);
  }
}

/* ─── Card HTML ───────────────────────────────────────────── */
function cardHTML(d) {
  const cover = d.cover
    ? `<img src="${esc(d.cover)}" alt="${esc(d.title)}" loading="lazy" />`
    : `<div style="height:100%;background:var(--bg3);display:flex;align-items:center;justify-content:center;color:var(--text2);font-size:2rem">🎬</div>`;
  const epLabel = d.episodes ? `<span class="ep-badge">${d.episodes} eps</span>` : "";
  return `
    <div class="drama-card" data-id="${esc(d.id)}" data-provider="${esc(d.provider)}">
      <div class="cover-wrap">
        ${cover}
        ${epLabel}
      </div>
      <div class="card-body">
        <div class="card-title">${esc(d.title)}</div>
      </div>
    </div>`;
}

function loadingCards(n) {
  return Array(n).fill("").map(() => `
    <div class="drama-card" style="cursor:default;pointer-events:none">
      <div class="cover-wrap" style="background:var(--bg3)"></div>
      <div class="card-body">
        <div class="skeleton-title" style="width:80%"></div>
      </div>
    </div>`).join("");
}

function emptyState(title, sub = "") {
  return `<div class="empty-state">
    <div class="emoji">🎬</div>
    <p><strong>${esc(title)}</strong></p>
    ${sub ? `<p style="margin-top:6px;font-size:0.82rem">${esc(sub)}</p>` : ""}
  </div>`;
}

/* ─── Modal ───────────────────────────────────────────────── */
async function openModal(id, provider) {
  overlay.classList.remove("hidden");
  modalContent.innerHTML = `
    <div style="text-align:center;padding:40px">
      <div class="spinner" style="margin:auto"></div>
    </div>`;

  try {
    const d = await api(`/api/drama/${provider}/${id}`);
    const cover = d.cover ? `<img src="${esc(d.cover)}" alt="${esc(d.title)}" />` : "";
    const totalEp = d.totalEpisodes || "?";

    modalContent.innerHTML = `
      <div class="modal-drama">
        <div class="modal-cover">${cover}</div>
        <div class="modal-meta">
          <h2>${esc(d.title)}</h2>
          <span class="badge">📺 ${esc(d.provider)}</span>
          <span class="badge">🎬 ${esc(String(totalEp))} episode</span>
          <div class="modal-desc">${esc(d.description || "Tidak ada deskripsi.")}</div>
          <div class="modal-actions">
            <button class="btn-watch" id="watchNowBtn">▶ Tonton Sekarang</button>
          </div>
        </div>
      </div>`;

    $("watchNowBtn").addEventListener("click", () => {
      window.location.href = `/watch.html?provider=${provider}&id=${id}&ep=1`;
    });
  } catch (e) {
    modalContent.innerHTML = `<div style="text-align:center;padding:40px;color:var(--text2)">
      Gagal memuat detail: ${esc(e.message)}
    </div>`;
  }
}

/* ─── Events ──────────────────────────────────────────────── */
searchBtn.addEventListener("click", () => doSearch(searchInput.value));
searchInput.addEventListener("keydown", (e) => e.key === "Enter" && doSearch(searchInput.value));
heroBtn.addEventListener("click", () => doSearch(heroInput.value));
heroInput.addEventListener("keydown", (e) => e.key === "Enter" && doSearch(heroInput.value));

loadMoreBtn.addEventListener("click", loadMore);

modalClose.addEventListener("click", () => overlay.classList.add("hidden"));
overlay.addEventListener("click", (e) => { if (e.target === overlay) overlay.classList.add("hidden"); });

document.querySelector(".logo").addEventListener("click", (e) => {
  e.preventDefault();
  homeSection.classList.remove("hidden");
  searchSection.classList.add("hidden");
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
