/**
 * Adapter untuk platform: PineDrama (via priv-api.anichin.bio)
 *
 * BASE: https://priv-api.anichin.bio/api/pinedrama/{action}?...&lang=id&api_key=KEY
 *
 * API key SAMA dengan DramaBox — baca dari env var ANICHIN_API_KEY.
 *
 * Endpoint yang dikonfirmasi:
 *   GET /pinedrama/languages                       → { default, languages }
 *   GET /pinedrama/trending?page=N&count=N         → { items }
 *   GET /pinedrama/foryou?page=N&count=N           → { items, page, perPage, hasMore, cursor }
 *   GET /pinedrama/category                        → { categories: [{ id, name, scene }] }
 *   GET /pinedrama/search?q=Q&page=N&count=N       → { items }
 *   GET /pinedrama/detail?id=ID                    → { id, title, cover, description,
 *                                                       totalEpisodes, isCompleted,
 *                                                       defaultLanguage, episodes }
 *   GET /pinedrama/allepisode?id=ID                → { bookId, bookName, cover, description,
 *                                                       totalEpisodes, episodes:
 *                                                       [{ number, title, locked, quality,
 *                                                          duration_ms, qualityList }] }
 *   GET /pinedrama/episode?id=ID&ep=N              → { number, title, videoUrl, locked,
 *                                                       quality, videoId, duration_ms,
 *                                                       qualityList: [{ label, isDefault,
 *                                                                        height, url }] }
 *
 * PERBEDAAN PENTING vs DramaBox:
 * - Video adalah MP4 langsung dari TikTok CDN (bukan HLS .m3u8)
 * - URL TikTok CDN tidak mengandung api_key → aman dikirim ke client
 * - Tidak ada endpoint: latest, vip, dubindo (return [] / fallback)
 * - Tidak ada endpoint: subtitles
 * - Streaming: adapter.stream() mengembalikan { streamType:"mp4", videoUrl: "<tiktok url>" }
 *   Frontend mendeteksi streamType dan memutar via <video src> langsung (bukan HLS.js)
 */

const { fetchJSON } = require("../fetcher");

const BASE = "https://priv-api.anichin.bio/api";
const PROVIDER_ID = "pinedrama";

function apiKey() {
  const key = process.env.ANICHIN_API_KEY;
  if (!key) throw new Error("ANICHIN_API_KEY belum diset — tidak bisa memanggil API PineDrama");
  return key;
}

function buildUrl(action, params = {}) {
  const qs = new URLSearchParams({ ...params, lang: "id", api_key: apiKey() });
  return `${BASE}/${PROVIDER_ID}/${action}?${qs.toString()}`;
}

/**
 * Tidak digunakan untuk PineDrama (video MP4, bukan HLS manifest).
 * Diekspor agar kontrak adapter tidak pecah.
 */
function hlsManifestUrl() {
  throw new Error("PineDrama menggunakan MP4 langsung — tidak ada HLS manifest. Gunakan /api/watch.");
}

// ─── Normalizer ─────────────────────────────────────────────────────────────

function normalizeItem(d, provider) {
  const epCount = typeof d.episodes === "number"
    ? d.episodes
    : (Array.isArray(d.episodes) ? d.episodes.length : Number(d.episodes ?? d.totalEpisodes ?? 0));
  return {
    id: String(d.id ?? ""),
    title: d.title ?? d.name ?? "Tanpa Judul",
    cover: d.cover ?? d.poster ?? d.thumbnail ?? "",
    provider,
    episodes: epCount,
    description: d.description ?? d.synopsis ?? "",
  };
}

// ─── Search ──────────────────────────────────────────────────────────────────

async function search(q, provider) {
  if (!q || q.trim().length < 2) return [];
  const raw = await fetchJSON(buildUrl("search", { q, page: 1, count: 20 }));
  const list = Array.isArray(raw) ? raw : (raw.items ?? []);
  return list.map((d) => normalizeItem(d, provider || PROVIDER_ID));
}

// ─── Trending / Latest / VIP / DubIndo ───────────────────────────────────────

async function trending(provider) {
  const raw = await fetchJSON(buildUrl("trending", { page: 1, count: 15 }));
  const list = Array.isArray(raw) ? raw : (raw.items ?? []);
  return list.map((d) => normalizeItem(d, provider || PROVIDER_ID));
}

/**
 * PineDrama tidak punya endpoint "latest" — fallback ke foryou page 1
 * sebagai konten paling segar.
 */
async function latest(provider) {
  const data = await foryou(provider, 1);
  return data.items;
}

/** Tidak ada konten VIP terpisah di PineDrama. */
async function vip() { return []; }

/** Tidak ada konten dubbing Indonesia terpisah di PineDrama. */
async function dubindo() { return []; }

// ─── Browse (trending + foryou, dedup) ───────────────────────────────────────

async function browse(provider) {
  const [t, f] = await Promise.all([trending(provider), foryou(provider, 1)]);
  const seen = new Set();
  return [...t, ...f.items].filter((d) => {
    if (seen.has(d.id)) return false;
    seen.add(d.id);
    return true;
  });
}

// ─── For You ─────────────────────────────────────────────────────────────────

async function foryou(provider, page = 1) {
  const raw = await fetchJSON(buildUrl("foryou", { page: Number(page) || 1, count: 15 }));
  const list = Array.isArray(raw) ? raw : (raw.items ?? []);
  return {
    items: list.map((d) => normalizeItem(d, provider || PROVIDER_ID)),
    page: raw.page ?? Number(page),
    perPage: raw.perPage ?? list.length,
    total: raw.total ?? list.length,
    hasMore: raw.hasMore ?? false,
  };
}

// ─── Languages ───────────────────────────────────────────────────────────────

async function languages() {
  const raw = await fetchJSON(buildUrl("languages"));
  return {
    default: raw?.default ?? "id",
    languages: raw?.languages ?? [],
  };
}

// ─── All Episodes ─────────────────────────────────────────────────────────────

async function allepisode(provider, id) {
  const raw = await fetchJSON(buildUrl("allepisode", { id }));
  const episodes = Array.isArray(raw.episodes)
    ? raw.episodes.map((e) => ({
        number: Number(e.number ?? 0),
        title: e.title ?? `Episode ${e.number}`,
        locked: Boolean(e.locked),
        // duration_ms → detik, sama dengan kontrak DramaBox (field duration)
        duration: Number(e.duration_ms ? Math.round(e.duration_ms / 1000) : 0),
      }))
    : [];

  return {
    bookId: raw.bookId ?? id,
    bookName: raw.bookName ?? "",
    cover: raw.cover ?? "",
    totalEpisodes: Number(raw.totalEpisodes ?? episodes.length),
    episodes,
  };
}

// ─── Detail ──────────────────────────────────────────────────────────────────

async function detail(provider, id) {
  const [info, eps] = await Promise.all([
    fetchJSON(buildUrl("detail", { id })),
    allepisode(provider, id).catch(() => ({ episodes: [], totalEpisodes: 0 })),
  ]);

  return {
    id: info.id ?? id,
    title: info.title ?? eps.bookName ?? "Tanpa Judul",
    cover: info.cover ?? eps.cover ?? "",
    description: info.description ?? "",
    totalEpisodes: eps.totalEpisodes || eps.episodes.length || Number(info.totalEpisodes ?? 0),
    episodes: eps.episodes,
    provider,
  };
}

// ─── Subtitles ────────────────────────────────────────────────────────────────

/** PineDrama tidak menyediakan endpoint subtitles. */
async function subtitles() { return []; }

// ─── Stream ───────────────────────────────────────────────────────────────────

/**
 * Resolve URL video untuk satu episode.
 *
 * PineDrama mengembalikan URL TikTok CDN (video/mp4) yang TIDAK mengandung
 * api_key → aman dikirim ke browser. Frontend mendeteksi streamType:"mp4"
 * dan memutar via <video src> langsung, bukan HLS.js.
 *
 * @returns {{ videoUrl, locked, episodeNumber, qualityList, streamType }}
 */
async function stream(provider, id, ep = 1) {
  // Cek status lock dari allepisode (lebih ringan dari fetch episode penuh)
  const eps = await allepisode(provider, id).catch(() => ({ episodes: [] }));
  const found = eps.episodes.find((e) => e.number === Number(ep));

  if (found?.locked) {
    return {
      videoUrl: "",
      locked: true,
      episodeNumber: Number(ep),
      qualityList: [],
      streamType: "mp4",
    };
  }

  // Ambil URL video segar — URL TikTok CDN expire, jadi selalu fetch baru
  const raw = await fetchJSON(buildUrl("episode", { id, ep: Number(ep) }));

  return {
    videoUrl: raw.videoUrl ?? "",
    locked: Boolean(raw.locked),
    episodeNumber: Number(raw.number ?? ep),
    qualityList: Array.isArray(raw.qualityList) ? raw.qualityList : [],
    streamType: "mp4",
  };
}

// ─── Notifications ────────────────────────────────────────────────────────────

async function notifications() { return []; }

// ─── Exports ──────────────────────────────────────────────────────────────────

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
