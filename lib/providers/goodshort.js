/**
 * Adapter untuk platform: GoodShort (via priv-api.anichin.bio)
 *
 * BASE: https://priv-api.anichin.bio/api/goodshort/{action}?...&lang=id&api_key=KEY
 *
 * API key SAMA dengan DramaBox/PineDrama — baca dari env var ANICHIN_API_KEY.
 *
 * Endpoint yang dikonfirmasi:
 *   GET /goodshort/languages                          → [{code, name}]  (array langsung)
 *   GET /goodshort/trending?lang=id                   → {items, page, perPage, total, totalPages, hasMore}
 *   GET /goodshort/foryou?page=N&lang=id              → {items, page, perPage, total, totalPages, hasMore}
 *   GET /goodshort/search?query=Q&page=N&lang=id      → {items, page, hasMore}
 *     NOTE: parameter pencarian adalah "query=", BUKAN "q="
 *   GET /goodshort/detail?id=ID&lang=id               → {id, title, cover, description, tags,
 *                                                         totalEps, episodes:[{number, title,
 *                                                         videoUrl:"", locked}]}
 *     NOTE: "totalEps" (bukan totalEpisodes), videoUrl di episode selalu kosong
 *   GET /goodshort/allepisode?id=ID&lang=id           → {cover, title, total,
 *                                                         episodes:[{number, chapterId, hlsUrl,
 *                                                         locked, quality, qualityList, image,
 *                                                         price, title, videoUrl}]}
 *     NOTE: "title" (bukan bookName), "total" (bukan totalEpisodes), tidak ada bookId
 *     hlsUrl & videoUrl = path relatif "/api/goodshort/hls?bookId=...&chapterId=...&q=720p&lang=in"
 *   GET /goodshort/episode?id=ID&ep=N&lang=id         → {number, hlsUrl, locked, quality,
 *                                                         qualityList, title, videoUrl}
 *     hlsUrl = path relatif ke endpoint hls di priv-api.anichin.bio
 *   GET /goodshort/hls?bookId=ID&chapterId=CID&q=720p&lang=in
 *                                                     → manifest .m3u8 dengan:
 *                                                        - segmen URL ABSOLUT dari v3.goodshort.com
 *                                                        - AES-128 key embedded sebagai
 *                                                          data:text/plain;base64,... (bukan URL)
 *                                                          → HLS.js handle natively, tidak perlu proxy key
 *
 * PERBEDAAN PENTING vs DramaBox:
 * - hlsManifestUrl() adalah ASYNC — butuh fetch episode dulu untuk dapat chapterId dari hlsUrl
 *   → server.js route /api/hls-stream WAJIB await adapter.hlsManifestUrl(...)
 * - Segmen di manifest sudah URL absolut (https://v3.goodshort.com/...) — proxy langsung tanpa konversi
 * - AES-128 key adalah data URI, bukan URL eksternal → tidak perlu entry di HLS_ALLOWED_HOSTS untuk key
 * - CDN segmen: v3.goodshort.com → wajib ada di HLS_ALLOWED_HOSTS di server.js
 * - Tidak ada endpoint: latest, vip, dubindo, subtitles (return [] / fallback ke foryou)
 */

const { fetchJSON } = require("../fetcher");

const BASE        = "https://priv-api.anichin.bio/api";
const BASE_ORIGIN = "https://priv-api.anichin.bio";
const PROVIDER_ID = "goodshort";

function apiKey() {
  const key = process.env.ANICHIN_API_KEY;
  if (!key) throw new Error("ANICHIN_API_KEY belum diset — tidak bisa memanggil API GoodShort");
  return key;
}

function buildUrl(action, params = {}) {
  const qs = new URLSearchParams({ ...params, lang: "id", api_key: apiKey() });
  return `${BASE}/${PROVIDER_ID}/${action}?${qs.toString()}`;
}

// ─── Normalizer ───────────────────────────────────────────────────────────────

function normalizeItem(d, provider) {
  const epCount = typeof d.episodes === "number"
    ? d.episodes
    : (Array.isArray(d.episodes) ? d.episodes.length : Number(d.episodes ?? d.totalEps ?? 0));
  return {
    id:          String(d.id ?? ""),
    title:       d.title ?? "Tanpa Judul",
    cover:       d.cover ?? d.image ?? "",
    provider:    provider || PROVIDER_ID,
    episodes:    epCount,
    description: d.description ?? "",
  };
}

// ─── languages ────────────────────────────────────────────────────────────────

async function languages() {
  const raw = await fetchJSON(buildUrl("languages"));
  const list = Array.isArray(raw) ? raw : (raw.languages ?? []);
  return {
    default:   "id",
    languages: list,
  };
}

// ─── trending ─────────────────────────────────────────────────────────────────

async function trending(provider) {
  const raw  = await fetchJSON(buildUrl("trending"));
  const list = Array.isArray(raw) ? raw : (raw.items ?? []);
  return list.map((d) => normalizeItem(d, provider));
}

// ─── latest ───────────────────────────────────────────────────────────────────

/** GoodShort tidak punya endpoint "latest" — fallback ke foryou page 1. */
async function latest(provider) {
  const data = await foryou(provider, 1);
  return data.items;
}

// ─── vip / dubindo ────────────────────────────────────────────────────────────

async function vip()     { return []; }
async function dubindo() { return []; }

// ─── browse ───────────────────────────────────────────────────────────────────

async function browse(provider) {
  const [t, f] = await Promise.all([trending(provider), foryou(provider, 1)]);
  const seen   = new Set();
  return [...t, ...f.items].filter((d) => {
    if (seen.has(d.id)) return false;
    seen.add(d.id);
    return true;
  });
}

// ─── foryou ───────────────────────────────────────────────────────────────────

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

// ─── search ───────────────────────────────────────────────────────────────────

/**
 * GoodShort memakai parameter "query=" (bukan "q=") — berbeda dari DramaBox/PineDrama.
 */
async function search(q, provider) {
  if (!q || q.trim().length < 2) return [];
  const raw  = await fetchJSON(buildUrl("search", { query: q.trim(), page: 1 }));
  const list = Array.isArray(raw) ? raw : (raw.items ?? []);
  return list.map((d) => normalizeItem(d, provider || PROVIDER_ID));
}

// ─── allepisode ───────────────────────────────────────────────────────────────

async function allepisode(provider, id) {
  const raw      = await fetchJSON(buildUrl("allepisode", { id }));
  const episodes = Array.isArray(raw.episodes)
    ? raw.episodes.map((e) => ({
        number:   Number(e.number ?? 0),
        title:    e.title ?? `Episode ${e.number}`,
        locked:   Boolean(e.locked),
        duration: 0,  // GoodShort tidak menyediakan durasi per episode
      }))
    : [];

  return {
    bookId:        id,
    bookName:      raw.title ?? "",
    cover:         raw.cover ?? "",
    totalEpisodes: Number(raw.total ?? episodes.length),
    episodes,
  };
}

// ─── detail ───────────────────────────────────────────────────────────────────

async function detail(provider, id) {
  // detail.episodes tidak punya chapterId / videoUrl — fetch allepisode untuk data akurat
  const [info, eps] = await Promise.all([
    fetchJSON(buildUrl("detail", { id })),
    allepisode(provider, id).catch(() => ({ episodes: [], totalEpisodes: 0, bookName: "", cover: "" })),
  ]);

  return {
    id:            String(info.id ?? id),
    title:         info.title ?? eps.bookName ?? "Tanpa Judul",
    cover:         info.cover ?? eps.cover ?? "",
    description:   info.description ?? "",
    totalEpisodes: eps.totalEpisodes || eps.episodes.length || Number(info.totalEps ?? 0),
    episodes:      eps.episodes,
    provider,
  };
}

// ─── subtitles ────────────────────────────────────────────────────────────────

/** GoodShort tidak menyediakan endpoint subtitles. */
async function subtitles() { return []; }

// ─── notifications ────────────────────────────────────────────────────────────

async function notifications() { return []; }

// ─── stream ───────────────────────────────────────────────────────────────────

/**
 * Resolve status stream satu episode.
 *
 * Mengembalikan path internal /api/hls-stream/... agar api_key tidak pernah
 * sampai ke browser. Platform id wajib disertakan di query (?platform=goodshort)
 * karena goodshort bukan DEFAULT_PLATFORM — tanpanya server.js akan fallback ke
 * adapter yang salah.
 *
 * Manifest HLS diambil server-side via hlsManifestUrl() (async).
 */
async function stream(provider, id, ep = 1) {
  const epData = await fetchJSON(buildUrl("episode", { id, ep: Number(ep) }));

  if (epData.locked) {
    return {
      videoUrl:      "",
      locked:        true,
      episodeNumber: Number(ep),
      qualityList:   [],
      streamType:    "hls",
    };
  }

  return {
    videoUrl:      `/api/hls-stream/${PROVIDER_ID}/${id}?ep=${ep}&platform=${PROVIDER_ID}`,
    locked:        false,
    episodeNumber: Number(epData.number ?? ep),
    qualityList:   Array.isArray(epData.qualityList) ? epData.qualityList : [],
    streamType:    "hls",
  };
}

// ─── hlsManifestUrl ───────────────────────────────────────────────────────────

/**
 * Ambil URL manifest HLS upstream — ASYNC karena butuh fetch episode dulu
 * untuk mendapat path hls (yang mengandung chapterId) dari field hlsUrl.
 *
 * Field hlsUrl dari /episode = "/api/goodshort/hls?bookId=...&chapterId=...&q=720p&lang=in"
 * → resolve ke "https://priv-api.anichin.bio/api/goodshort/hls?...&api_key=KEY"
 *
 * Manifest yang dikembalikan berisi:
 * - Segmen URL absolut (https://v3.goodshort.com/...) → diproxy via /hls-proxy
 * - AES-128 key sebagai data URI (data:text/plain;base64,...) → HLS.js handle natively,
 *   tidak dikirim ke /hls-proxy, tidak perlu ada di HLS_ALLOWED_HOSTS
 *
 * HANYA untuk dipakai server-side (route /api/hls-stream di server.js).
 * server.js WAJIB await adapter.hlsManifestUrl(...) karena fungsi ini async.
 */
async function hlsManifestUrl(provider, id, ep) {
  const epData  = await fetchJSON(buildUrl("episode", { id, ep: Number(ep) }));
  const relPath = epData.hlsUrl ?? epData.videoUrl ?? "";
  if (!relPath) {
    throw new Error(`GoodShort: tidak ada hlsUrl untuk episode ${ep} (bookId=${id})`);
  }
  // relPath = "/api/goodshort/hls?bookId=...&chapterId=...&q=720p&lang=in"
  const url = new URL(`${BASE_ORIGIN}${relPath}`);
  url.searchParams.set("api_key", apiKey());
  return url.toString();
}

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
