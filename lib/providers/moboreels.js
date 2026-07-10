/**
 * Adapter untuk platform: MoboReels (via priv-api.anichin.bio)
 *
 * BASE: https://priv-api.anichin.bio/api/moboreels/{action}?...&lang=id&api_key=KEY
 *
 * API key SAMA dengan platform lain — baca dari env var ANICHIN_API_KEY.
 *
 * Endpoint yang dikonfirmasi:
 *   GET /moboreels/languages                  → { default, languages }
 *   GET /moboreels/trending?lang=L            → { items }
 *   GET /moboreels/foryou?page=N&lang=L       → { items, page, perPage, hasMore }
 *   GET /moboreels/search?q=Q&page=N&lang=L   → { items, hasMore, page, perPage }
 *   GET /moboreels/detail?id=ID&lang=L        → { id, title, cover, description,
 *                                                  episodes: [{ number, title?, locked,
 *                                                               duration? }] }
 *   GET /moboreels/episode?id=ID&ep=N&lang=L  → { number, videoUrl, locked,
 *                                                  qualityList: [{ label, url }] }
 *
 * PERBEDAAN PENTING vs DramaBox / PineDrama:
 * - Tidak ada endpoint allepisode terpisah — daftar episode diambil dari detail.
 * - Tidak ada endpoint: latest, vip, dubindo, subtitles, hls.
 * - Video adalah MP4 dari CDN cdnvideo.cdreader.com (bertanda-tangan CDN, tanpa api_key).
 * - URL MP4 mengandung signed params (t, us, sign) yang expire — selalu fetch baru,
 *   jangan cache videoUrl.
 * - streamType "mp4": frontend memutar via <video src> langsung, bukan HLS.js.
 * - totalEpisodes tidak ada di detail → gunakan episodes[].length.
 * - episode out-of-range → { locked: true } — clean, tidak crash.
 */

const { fetchJSON } = require("../fetcher");

const BASE        = "https://priv-api.anichin.bio/api";
const PROVIDER_ID = "moboreels";

function apiKey() {
  const key = process.env.ANICHIN_API_KEY;
  if (!key) throw new Error("ANICHIN_API_KEY belum diset — tidak bisa memanggil API MoboReels");
  return key;
}

function buildUrl(action, params = {}) {
  const qs = new URLSearchParams({ ...params, lang: "id", api_key: apiKey() });
  return `${BASE}/${PROVIDER_ID}/${action}?${qs.toString()}`;
}

/**
 * Tidak digunakan — MoboReels menggunakan MP4 langsung, bukan HLS manifest.
 * Diekspor agar kontrak adapter tetap utuh.
 */
function hlsManifestUrl() {
  throw new Error("MoboReels menggunakan MP4 langsung — tidak ada HLS manifest. Gunakan /api/watch.");
}

// ─── Normalizer Internal ────────────────────────────────────────────────────

function normalizeItem(d, provider) {
  const epCount = typeof d.episodes === "number"
    ? d.episodes
    : (Array.isArray(d.episodes) ? d.episodes.length : Number(d.totalEpisodes ?? 0));
  return {
    id:          String(d.id ?? ""),
    title:       d.title ?? d.name ?? "Tanpa Judul",
    cover:       d.cover ?? d.poster ?? d.thumbnail ?? "",
    provider,
    episodes:    epCount,
    description: d.description ?? d.synopsis ?? "",
  };
}

// ─── Languages ──────────────────────────────────────────────────────────────

async function languages() {
  const raw = await fetchJSON(buildUrl("languages"));
  return {
    default:   raw?.default ?? "id",
    languages: Array.isArray(raw?.languages) ? raw.languages : [],
  };
}

// ─── Trending ───────────────────────────────────────────────────────────────

async function trending(provider) {
  const raw  = await fetchJSON(buildUrl("trending"));
  const list = Array.isArray(raw) ? raw : (raw.items ?? []);
  return list.map((d) => normalizeItem(d, provider || PROVIDER_ID));
}

// ─── Latest (tidak ada endpoint khusus — fallback ke foryou page 1) ─────────

async function latest(provider) {
  const data = await foryou(provider, 1);
  return data.items;
}

// ─── VIP / DubIndo (tidak tersedia di MoboReels) ────────────────────────────

async function vip()     { return []; }
async function dubindo() { return []; }

// ─── Browse ─────────────────────────────────────────────────────────────────

async function browse(provider) {
  const [t, f] = await Promise.all([trending(provider), foryou(provider, 1)]);
  const seen   = new Set();
  return [...t, ...f.items].filter((d) => {
    if (seen.has(d.id)) return false;
    seen.add(d.id);
    return true;
  });
}

// ─── For You ────────────────────────────────────────────────────────────────

async function foryou(provider, page = 1) {
  const raw  = await fetchJSON(buildUrl("foryou", { page: Number(page) || 1 }));
  const list = Array.isArray(raw) ? raw : (raw.items ?? []);
  return {
    items:   list.map((d) => normalizeItem(d, provider || PROVIDER_ID)),
    page:    raw.page    ?? Number(page),
    perPage: raw.perPage ?? list.length,
    total:   raw.total   ?? list.length,
    hasMore: raw.hasMore ?? false,
  };
}

// ─── Search ─────────────────────────────────────────────────────────────────

async function search(q, provider) {
  if (!q || q.trim().length < 2) return [];
  const raw  = await fetchJSON(buildUrl("search", { q, page: 1 }));
  const list = Array.isArray(raw) ? raw : (raw.items ?? []);
  return list.map((d) => normalizeItem(d, provider || PROVIDER_ID));
}

// ─── All Episodes ────────────────────────────────────────────────────────────
//
// MoboReels tidak punya endpoint allepisode terpisah.
// Daftar episode diambil dari field episodes[] di response detail.

async function allepisode(provider, id) {
  const raw      = await fetchJSON(buildUrl("detail", { id }));
  const rawEps   = Array.isArray(raw.episodes) ? raw.episodes : [];
  const episodes = rawEps.map((e) => ({
    number:   Number(e.number ?? 0),
    title:    e.title ?? `Episode ${e.number}`,
    locked:   Boolean(e.locked),
    duration: e.duration != null
        ? Number(e.duration)
        : (e.duration_ms != null ? Math.round(Number(e.duration_ms) / 1000) : 0),
  }));

  return {
    bookId:        raw.id ?? id,
    bookName:      raw.title ?? raw.name ?? "",
    cover:         raw.cover ?? raw.poster ?? "",
    totalEpisodes: episodes.length,
    episodes,
  };
}

// ─── Detail ─────────────────────────────────────────────────────────────────

async function detail(provider, id) {
  const [info, eps] = await Promise.all([
    fetchJSON(buildUrl("detail", { id })),
    allepisode(provider, id).catch(() => ({ episodes: [], totalEpisodes: 0, bookName: "", cover: "" })),
  ]);

  return {
    id:            info.id ?? id,
    title:         info.title ?? info.name ?? eps.bookName ?? "Tanpa Judul",
    cover:         info.cover ?? info.poster ?? eps.cover ?? "",
    description:   info.description ?? info.synopsis ?? "",
    totalEpisodes: eps.totalEpisodes || eps.episodes.length || 0,
    episodes:      eps.episodes,
    provider,
  };
}

// ─── Subtitles (tidak tersedia di MoboReels) ─────────────────────────────────

async function subtitles() { return []; }

// ─── Stream ─────────────────────────────────────────────────────────────────
//
// MoboReels mengembalikan URL MP4 CDN (cdnvideo.cdreader.com) dengan signed
// params (t, us, sign) yang expire — URL ini TIDAK mengandung api_key backend,
// aman dikirim ke browser, tapi harus selalu di-fetch baru (jangan cache).
//
// Alur:
//   1. Panggil /episode → cek locked & ambil videoUrl sekaligus (satu request).
//   2. Jika locked:true atau tidak ada videoUrl → return locked response.
//   3. Jika tidak → return videoUrl + qualityList sebagai streamType "mp4".

async function stream(provider, id, ep = 1) {
  const raw = await fetchJSON(buildUrl("episode", { id, ep: Number(ep) }));

  if (raw.locked || !raw.videoUrl) {
    return {
      videoUrl:      "",
      locked:        true,
      episodeNumber: Number(raw.number ?? ep),
      qualityList:   [],
      streamType:    "mp4",
    };
  }

  return {
    videoUrl:      raw.videoUrl,
    locked:        false,
    episodeNumber: Number(raw.number ?? ep),
    qualityList:   Array.isArray(raw.qualityList) ? raw.qualityList : [],
    streamType:    "mp4",
  };
}

// ─── Notifications ───────────────────────────────────────────────────────────

async function notifications() { return []; }

// ─── Exports ─────────────────────────────────────────────────────────────────

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
