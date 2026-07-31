/**
 * Adapter untuk platform: DrамаNova (via priv-api.anichin.bio)
 *
 * AUTH: Header "X-API-Key" — BUKAN query param seperti DramaBox.
 * API key WAJIB diisi lewat env var ANICHIN_API_KEY (Replit Secret),
 * TIDAK PERNAH di-hardcode di sini dan TIDAK PERNAH dikirim ke browser.
 *
 * STREAM TYPE: MP4 — upstream mengembalikan URL CDN BytePlus (ps2.bytedrama.com)
 * dengan CDN signing key (auth_key). Signing key ini ditujukan untuk browser,
 * bukan rahasia server — aman dikembalikan langsung ke client.
 * Route /hls-stream dan /hls-proxy TIDAK dipakai untuk platform ini.
 *
 * Endpoint yang dikonfirmasi:
 *   GET /dramanova/trending?lang=id            → { items, hasMore, page }
 *   GET /dramanova/latest?lang=id              → { items, hasMore, page }
 *   GET /dramanova/foryou?page=N&lang=id       → { items, hasMore, page, perPage }
 *   GET /dramanova/search?q=Q&lang=id          → { items, hasMore, page, perPage }
 *   GET /dramanova/detail?id=ID&lang=id        → { id, title, cover, description, tags, episodes: [...] }
 *                                                 episodes[]: { number, title, videoUrl (kosong), locked }
 *   GET /dramanova/episode?id=ID&ep=N&lang=id  → { number, videoUrl, locked, qualityList }
 *   GET /dramanova/languages                   → { languages: [{ code, name }] }
 *
 * Endpoint yang TIDAK ada di upstream ini:
 *   - allepisode (ganti dengan detail.episodes)
 *   - hls (platform MP4, tidak perlu)
 *   - subtitles
 *   - vip
 *   - dubindo
 *   - notifications
 */

const { fetchJSON } = require("../fetcher");

const BASE     = "https://priv-api.anichin.bio/api/dramanova";
const LANG     = "id";

function apiKey() {
  const key = process.env.ANICHIN_API_KEY;
  if (!key) throw new Error("ANICHIN_API_KEY belum diset — tidak bisa memanggil API DrамаNova");
  return key;
}

/** Buat URL endpoint, tambah lang default. Key dikirim via header, bukan URL. */
function buildUrl(action, params = {}) {
  const qs = new URLSearchParams({ lang: LANG, ...params });
  return `${BASE}/${action}?${qs.toString()}`;
}

/** Options fetchJSON dengan header auth. */
function authOpts() {
  return { headers: { "X-API-Key": apiKey() } };
}

// ─── Normalizer Internal ─────────────────────────────────────────────────────

function normalizeItem(d, provider) {
  const epCount = Array.isArray(d.episodes)
    ? d.episodes.length
    : Number(d.episodes ?? d.totalEpisodes ?? d.episodeCount ?? 0);

  return {
    id:          String(d.id ?? ""),
    title:       d.title ?? d.name ?? "Tanpa Judul",
    cover:       d.cover ?? d.poster ?? d.thumbnail ?? "",
    provider,
    episodes:    epCount,
    description: d.description ?? d.synopsis ?? "",
  };
}

// ─── Fungsi Adapter ──────────────────────────────────────────────────────────

async function trending(provider) {
  const raw  = await fetchJSON(buildUrl("trending"), authOpts());
  const list = Array.isArray(raw) ? raw : (raw.items ?? []);
  return list.map((d) => normalizeItem(d, provider));
}

async function latest(provider) {
  const raw  = await fetchJSON(buildUrl("latest"), authOpts());
  const list = Array.isArray(raw) ? raw : (raw.items ?? []);
  return list.map((d) => normalizeItem(d, provider));
}

async function foryou(provider, page = 1) {
  const raw  = await fetchJSON(buildUrl("foryou", { page: Number(page) || 1 }), authOpts());
  const list = Array.isArray(raw) ? raw : (raw.items ?? []);
  return {
    items:   list.map((d) => normalizeItem(d, provider)),
    page:    raw.page    ?? (Number(page) || 1),
    perPage: raw.perPage ?? list.length,
    total:   raw.total   ?? list.length,
    hasMore: raw.hasMore ?? false,
  };
}

async function search(q, provider) {
  if (!q || q.trim().length < 2 || !provider) return [];
  const raw  = await fetchJSON(buildUrl("search", { q }), authOpts());
  const list = Array.isArray(raw) ? raw : (raw.items ?? []);
  return list.map((d) => normalizeItem(d, provider));
}

/**
 * Detail drama + daftar episode.
 * Daftar episode dari detail.episodes — sudah berisi number, title, locked.
 * videoUrl di dalam setiap item sengaja dikosongkan oleh upstream; URL asli
 * baru tersedia saat memanggil /episode?id=&ep=.
 */
async function detail(provider, id) {
  const info = await fetchJSON(buildUrl("detail", { id }), authOpts());
  const eps  = normalizeEpisodes(info.episodes ?? []);

  return {
    id:            String(info.id ?? id),
    title:         info.title ?? info.name ?? "Tanpa Judul",
    cover:         info.cover ?? info.poster ?? "",
    description:   info.description ?? info.synopsis ?? "",
    totalEpisodes: eps.length || Number(info.totalEpisodes ?? 0),
    episodes:      eps,
    provider,
  };
}

/**
 * Daftar episode — karena tidak ada endpoint /allepisode, kita ambil dari
 * detail. Shape return identik dengan kontrak allepisode di adapter lain.
 */
async function allepisode(provider, id) {
  const info = await fetchJSON(buildUrl("detail", { id }), authOpts());
  const eps  = normalizeEpisodes(info.episodes ?? []);

  return {
    bookId:        String(info.id ?? id),
    bookName:      info.title ?? "",
    cover:         info.cover ?? "",
    totalEpisodes: eps.length || Number(info.totalEpisodes ?? 0),
    episodes:      eps,
  };
}

/** Konversi array episodes dari detail ke format episode standar. */
function normalizeEpisodes(raw) {
  return raw.map((e) => ({
    number:   Number(e.number ?? 0),
    title:    e.title ?? `Episode ${e.number}`,
    locked:   Boolean(e.locked),
    duration: Number(e.duration ?? 0) || null,
  }));
}

/**
 * Resolve stream untuk satu episode.
 * Upstream mengembalikan URL MP4 CDN (ps2.bytedrama.com) dengan signed auth_key.
 * URL ini dimaksudkan untuk diakses browser — aman dikembalikan langsung.
 * streamType: "mp4" agar frontend memakai <video src> native, bukan HLS.js.
 */
async function stream(provider, id, ep = 1) {
  const raw = await fetchJSON(buildUrl("episode", { id, ep: Number(ep) || 1 }), authOpts());

  return {
    videoUrl:      raw.locked ? "" : (raw.videoUrl ?? ""),
    locked:        Boolean(raw.locked),
    episodeNumber: Number(raw.number ?? ep),
    qualityList:   Array.isArray(raw.qualityList) ? raw.qualityList : [],
    streamType:    "mp4",
  };
}

/**
 * Platform ini tidak memakai HLS — melempar error eksplisit agar server.js
 * tidak diam-diam meneruskan request ke /hls-proxy.
 */
function hlsManifestUrl() {
  throw new Error("DrамаNova adalah platform MP4 — hlsManifestUrl() tidak tersedia");
}

/** Bahasa yang didukung. */
async function languages(provider) {
  try {
    const raw = await fetchJSON(buildUrl("languages"), authOpts());
    const langs = Array.isArray(raw.languages) ? raw.languages : [];
    return {
      default:   LANG,
      languages: langs.map((l) => ({ code: l.code, name: l.name ?? l.code })),
    };
  } catch {
    return { default: LANG, languages: [] };
  }
}

/** Browse = gabungan trending + latest, deduplikasi by id. */
async function browse(provider) {
  const [t, l] = await Promise.all([trending(provider), latest(provider)]);
  const seen = new Set();
  return [...t, ...l].filter((d) => {
    if (seen.has(d.id)) return false;
    seen.add(d.id);
    return true;
  });
}

/** Tidak ada endpoint VIP di upstream. */
async function vip() {
  return [];
}

/** Tidak ada endpoint dubindo di upstream. */
async function dubindo() {
  return [];
}

/** Subtitle tidak didukung upstream. */
async function subtitles() {
  return [];
}

/** Notifikasi tidak ada di upstream. */
async function notifications() {
  return [];
}

module.exports = {
  search,
  detail,
  allepisode,
  subtitles,
  languages,
  stream,
  browse,
  trending,
  latest,
  vip,
  dubindo,
  foryou,
  notifications,
  hlsManifestUrl,
};
