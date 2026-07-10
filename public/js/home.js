import { api } from "./api.js";
import { esc, showToast, skeletonCards } from "./utils.js";
import { icon } from "./icons.js";

/* ─── State ───────────────────────────────────────────────── */
let currentProvider = "";
let currentPlatform = "";
// map: provider id → platform id (diisi saat init dari /api/config)
const providerPlatformMap = {};
let foryouPage = 1;
let foryouLoading = false;
let homeLoading = false;

/* ─── DOM ─────────────────────────────────────────────────── */
const $ = (id) => document.getElementById(id);
const header        = document.querySelector("header");
const searchToggle  = $("searchToggle");
const searchBar     = $("searchBar");
const searchInput   = $("searchInput");
const searchClose   = $("searchClose");
const providerFilter = $("providerFilter");
const searchResults = $("searchResults");
const searchSection = $("searchSection");
const homeSection   = $("homeSection");
const searchTitle   = $("searchTitle");
const overlay       = $("overlay");
const modalContent  = $("modalContent");
const modalClose    = $("modalClose");
const rowsRoot       = $("rowsRoot");
const hero           = $("hero");
const notifBar       = $("notifications");

/* ─── Definisi kategori (baris) ──────────────────────────────
 * Setiap kategori terpisah & mandiri: judul, endpoint, dan cara
 * memuatnya sendiri-sendiri. Menambah kategori baru = menambah satu
 * entri di array ini, tidak perlu ubah logika render.
 */
const ROWS = [
  { id: "trending", title: "Trending", endpoint: (p, plt) => `/api/trending/${p}?platform=${plt}` },
  { id: "latest",   title: "Terbaru",   endpoint: (p, plt) => `/api/latest/${p}?platform=${plt}` },
  { id: "dubindo",  title: "Sulih Suara Indonesia", endpoint: (p, plt) => `/api/dubindo/${p}?platform=${plt}` },
  { id: "vip",      title: "VIP",       endpoint: (p, plt) => `/api/vip/${p}?platform=${plt}` },
];

/* ─── Init ────────────────────────────────────────────────── */
async function init() {
  try {
    const config = await api("/api/config");

    // Kumpulkan semua provider dari semua platform ke dalam satu dropdown
    config.forEach((platform) => {
      platform.providers.forEach((p) => {
        providerPlatformMap[p.id] = platform.id;
        const opt = document.createElement("option");
        opt.value = p.id;
        opt.textContent = p.label;
        providerFilter.appendChild(opt);
      });
    });

    // Restore pilihan terakhir user dari localStorage, fallback ke default
    const saved = localStorage.getItem("dramain_provider");
    const defaultProvider = config[0].providers[0].id;
    currentProvider = (saved && providerPlatformMap[saved]) ? saved : defaultProvider;
    currentPlatform = providerPlatformMap[currentProvider];
    providerFilter.value = currentProvider;
    loadNotifications();
    loadHome(currentProvider, currentPlatform);
  } catch (e) {
    showToast("Gagal memuat konfigurasi: " + e.message);
  }
}

async function loadNotifications() {
  try {
    const notifs = await api(`/api/notifications?platform=${currentPlatform}`);
    if (!notifs?.length) return;
    const offline = notifs.filter((n) => n.type === "offline" || n.type === "warning" || n.type === "down");
    if (offline.length) {
      notifBar.innerHTML = `${icon.alert()} <span>${esc(offline.map((n) => n.platform).join(", "))} sedang maintenance</span>`;
      notifBar.classList.remove("hidden");
    }
  } catch {}
}

/* ─── Hero ────────────────────────────────────────────────── */
function renderHero(d) {
  if (!d) { hero.classList.add("hidden"); return; }
  hero.classList.remove("hidden");
  hero.style.setProperty("--hero-image", `url("${d.cover}")`);
  hero.innerHTML = `
    <div class="hero-backdrop" style="background-image:url('${esc(d.cover)}')"></div>
    <div class="hero-scrim"></div>
    <div class="hero-content">
      <h1>${esc(d.title)}</h1>
      <p class="hero-desc">${esc(d.description || "Drama pendek eksklusif — tonton episode pertama sekarang.")}</p>
      <div class="hero-actions">
        <button class="btn-primary" id="heroPlayBtn">${icon.play()} Putar</button>
        <button class="btn-secondary" id="heroInfoBtn">${icon.info()} Info Selengkapnya</button>
      </div>
    </div>`;
  $("heroPlayBtn").addEventListener("click", () => {
    const plt = providerPlatformMap[d.provider] || currentPlatform;
    window.location.href = `/watch.html?provider=${d.provider}&id=${d.id}&ep=1&platform=${plt}`;
  });
  $("heroInfoBtn").addEventListener("click", () => openModal(d.id, d.provider));
}

/* ─── Rows — render & fetch mandiri per kategori ────────────── */
function ensureRowEl(row) {
  let section = document.getElementById(`row-${row.id}`);
  if (section) return section;
  section = document.createElement("section");
  section.className = "row";
  section.id = `row-${row.id}`;
  section.innerHTML = `
    <div class="row-header"><h2>${esc(row.title)}</h2></div>
    <div class="row-viewport">
      <button class="row-nav row-nav-prev" aria-label="Sebelumnya">${icon.chevronLeft()}</button>
      <div class="row-track" data-track></div>
      <button class="row-nav row-nav-next" aria-label="Berikutnya">${icon.chevronRight()}</button>
    </div>`;
  rowsRoot.appendChild(section);

  const track = section.querySelector("[data-track]");
  section.querySelector(".row-nav-prev").addEventListener("click", () => scrollRow(track, -1));
  section.querySelector(".row-nav-next").addEventListener("click", () => scrollRow(track, 1));
  return section;
}

function scrollRow(track, dir) {
  track.scrollBy({ left: dir * track.clientWidth * 0.9, behavior: "smooth" });
}

async function loadRow(row, provider, platform) {
  const section = ensureRowEl(row);
  const track = section.querySelector("[data-track]");
  track.innerHTML = skeletonCards(8);

  try {
    const items = await api(row.endpoint(provider, platform));
    if (!items?.length) {
      section.classList.add("hidden");
      return;
    }
    section.classList.remove("hidden");
    track.innerHTML = items.map(cardHTML).join("");
    bindCardClicks(track);
  } catch (e) {
    section.classList.add("hidden");
  }
}

/* ─── For You — baris dengan pagination sendiri ─────────────── */
async function loadForYou(provider, append = false) {
  if (foryouLoading) return;
  foryouLoading = true;

  let section = document.getElementById("row-foryou");
  if (!section) {
    section = document.createElement("section");
    section.className = "row row-foryou";
    section.id = "row-foryou";
    section.innerHTML = `
      <div class="row-header"><h2>Untuk Anda</h2></div>
      <div class="grid-track" data-grid></div>
      <div class="row-more-wrap">
        <button class="btn-more" id="foryouMoreBtn">Muat Lebih Banyak</button>
      </div>`;
    rowsRoot.appendChild(section);
    $("foryouMoreBtn").addEventListener("click", () => {
      foryouPage++;
      loadForYou(currentProvider, true);
    });
  }

  const grid = section.querySelector("[data-grid]");
  const moreBtn = $("foryouMoreBtn");
  if (!append) grid.innerHTML = skeletonCards(10);
  moreBtn.textContent = "Memuat...";
  moreBtn.disabled = true;

  try {
    const data = await api(`/api/foryou/${provider}?page=${foryouPage}&platform=${currentPlatform}`);
    const html = data.items.map(cardHTML).join("");
    if (append) grid.insertAdjacentHTML("beforeend", html);
    else grid.innerHTML = html;
    bindCardClicks(grid);
    moreBtn.classList.toggle("hidden", !data.hasMore);
  } catch (e) {
    if (!append) grid.innerHTML = "";
    showToast("Gagal memuat rekomendasi: " + e.message);
  } finally {
    moreBtn.textContent = "Muat Lebih Banyak";
    moreBtn.disabled = false;
    foryouLoading = false;
  }
}

/* ─── Home — muat hero + semua baris kategori ───────────────── */
async function loadHome(provider, platform) {
  if (homeLoading) return;
  homeLoading = true;
  foryouPage = 1;
  rowsRoot.innerHTML = "";

  try {
    const trending = await api(`/api/trending/${provider}?platform=${platform}`);
    renderHero(trending?.[0]);
  } catch {
    renderHero(null);
  }

  for (const row of ROWS) {
    loadRow(row, provider, platform);
  }
  loadForYou(provider, false);
  homeLoading = false;
}

/* ─── Search ──────────────────────────────────────────────── */
async function doSearch(q) {
  q = q.trim();
  if (!q) return;
  const provider = providerFilter.value || currentProvider;
  const platform = providerPlatformMap[provider] || currentPlatform;

  homeSection.classList.add("hidden");
  searchSection.classList.remove("hidden");
  searchTitle.textContent = `Hasil pencarian untuk "${q}"`;
  searchResults.innerHTML = skeletonCards(10);

  try {
    const results = await api(`/api/search?q=${encodeURIComponent(q)}&provider=${provider}&platform=${platform}`);
    if (!results?.length) {
      searchResults.innerHTML = emptyState("Tidak ada hasil", "Coba kata kunci lain");
      return;
    }
    searchResults.innerHTML = results.map(cardHTML).join("");
    bindCardClicks(searchResults);
  } catch (e) {
    searchResults.innerHTML = emptyState("Pencarian gagal", e.message);
  }
}

function closeSearch() {
  homeSection.classList.remove("hidden");
  searchSection.classList.add("hidden");
  searchBar.classList.remove("is-open");
  searchInput.value = "";
}

/* ─── Card HTML ───────────────────────────────────────────── */
function cardHTML(d) {
  const cover = d.cover
    ? `<img src="${esc(d.cover)}" alt="${esc(d.title)}" loading="lazy" />`
    : `<div class="cover-fallback">${icon.film()}</div>`;
  const epLabel = d.episodes ? `<span class="ep-badge">${d.episodes} EP</span>` : "";
  return `
    <div class="drama-card" data-id="${esc(d.id)}" data-provider="${esc(d.provider)}" tabindex="0">
      <div class="cover-wrap">
        ${cover}
        ${epLabel}
        <div class="card-hover">
          <div class="card-hover-play">${icon.playCircle()}</div>
        </div>
      </div>
      <div class="card-body">
        <div class="card-title">${esc(d.title)}</div>
      </div>
    </div>`;
}

function bindCardClicks(root) {
  root.querySelectorAll(".drama-card:not(.is-skeleton)").forEach((card) => {
    card.addEventListener("click", () => openModal(card.dataset.id, card.dataset.provider));
    card.addEventListener("keydown", (e) => {
      if (e.key === "Enter") openModal(card.dataset.id, card.dataset.provider);
    });
  });
}

function emptyState(title, sub = "") {
  return `<div class="empty-state">
    ${icon.film()}
    <p><strong>${esc(title)}</strong></p>
    ${sub ? `<p class="empty-sub">${esc(sub)}</p>` : ""}
  </div>`;
}

/* ─── Modal ───────────────────────────────────────────────── */
async function openModal(id, provider) {
  overlay.classList.remove("hidden");
  document.body.classList.add("no-scroll");
  modalContent.innerHTML = `<div class="modal-loading"><div class="spinner"></div></div>`;

  const platform = providerPlatformMap[provider] || currentPlatform;

  try {
    const d = await api(`/api/drama/${provider}/${id}?platform=${platform}`);
    const cover = d.cover ? `<img src="${esc(d.cover)}" alt="${esc(d.title)}" />` : "";
    const totalEp = d.totalEpisodes || "?";

    modalContent.innerHTML = `
      <div class="modal-drama">
        <div class="modal-cover">${cover}</div>
        <div class="modal-meta">
          <h2>${esc(d.title)}</h2>
          <div class="modal-badges">
            <span class="badge">${esc(d.provider)}</span>
            <span class="badge">${esc(String(totalEp))} Episode</span>
          </div>
          <div class="modal-desc">${esc(d.description || "Tidak ada deskripsi.")}</div>
          <div class="modal-actions">
            <button class="btn-primary" id="watchNowBtn">${icon.play()} Tonton Sekarang</button>
          </div>
        </div>
      </div>`;

    $("watchNowBtn").addEventListener("click", () => {
      window.location.href = `/watch.html?provider=${provider}&id=${id}&ep=1&platform=${platform}`;
    });
  } catch (e) {
    modalContent.innerHTML = `<div class="modal-error">Gagal memuat detail: ${esc(e.message)}</div>`;
  }
}

function closeModal() {
  overlay.classList.add("hidden");
  document.body.classList.remove("no-scroll");
}

/* ─── Events ──────────────────────────────────────────────── */
providerFilter.addEventListener("change", () => {
  const selected = providerFilter.value;
  if (!selected) return;
  currentProvider = selected;
  currentPlatform = providerPlatformMap[selected] || currentPlatform;
  localStorage.setItem("dramain_provider", currentProvider);
  foryouPage = 1;
  loadHome(currentProvider, currentPlatform);
});

searchToggle.addEventListener("click", () => {
  searchBar.classList.add("is-open");
  searchInput.focus();
});
searchClose.addEventListener("click", closeSearch);
searchInput.addEventListener("keydown", (e) => e.key === "Enter" && doSearch(searchInput.value));
searchInput.addEventListener("keydown", (e) => e.key === "Escape" && closeSearch());

modalClose.addEventListener("click", closeModal);
overlay.addEventListener("click", (e) => { if (e.target === overlay) closeModal(); });
document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !overlay.classList.contains("hidden")) closeModal(); });

document.querySelector(".logo").addEventListener("click", (e) => {
  e.preventDefault();
  closeSearch();
});

window.addEventListener("scroll", () => {
  header.classList.toggle("is-scrolled", window.scrollY > 8);
});

init();
