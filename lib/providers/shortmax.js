/**
 * Adapter untuk platform: ShortMax (via priv-api.anichin.bio)
 *
 * BASE: https://priv-api.anichin.bio/api/shortmax/{action}?...&lang=id&api_key=KEY
 *
 * API key SAMA dengan DramaBox/PineDrama/GoodShort — baca dari env var ANICHIN_API_KEY.
 * Auth dikirim via HEADER "X-API-Key" (bukan query param seperti platform lain) —
 * dikonfirmasi lewat curl langsung ke upstream.
 *
 * Endpoint yang dikonfirmasi (test manual 2026-07-10):
 *   GET /shortmax/languages                              → {default, languages:[{code,name}], source, total}
 *   GET /shortmax/trending?lang=id                       → {items:[{id,title,cover,episodes}]}
 *   GET /shortmax/foryou?page=N&lang=id                  → {items:[...]} (shape sama dengan trending)
 *   GET /shortmax/search?query=Q&lang=id                 → {items:[{id,title,cover,episodes,description}], hasMore, page}
 *     NOTE: parameter pencarian adalah "query=", BUKAN "q=" — sama seperti GoodShort.
 *   GET /shortmax/detail?id=ID&lang=id                   → {id,title,cover,description,tags,
 *                                                            episodes:[{number,title,videoUrl:"",locked}]}
 *     PENTING: field `locked` di sini TIDAK BISA DIPERCAYA — upstream menandai mayoritas
 *     episode sebagai locked:true di endpoint ini, padahal /allepisode dan /episode
 *     (endpoint yang benar-benar dipakai untuk resolve video) selalu mengembalikan
 *     locked:false dengan videoUrl/qualityList lengkap untuk SEMUA episode yang ditest.
 *     → detail() di bawah SENGAJA mengambil status locked dari allepisode(), bukan
 *       dari field locked di /detail, supaya UI tidak salah menampilkan episode
 *       sebagai terkunci padahal sebenarnya bisa diputar gratis.
 *   GET /shortmax/allepisode?id=ID&lang=id                → {id,title,cover,description,totalEpisodes,
 *                                                             source, episodes:[{number,title,locked,
 *                                                             hlsUrl,videoUrl,qualityList:[{label,url}]}]}
 *     hlsUrl = path relatif "/api/shortmax/hls?id=...&ep=N" (tanpa q=/lang=)
 *     videoUrl & qualityList[].url = URL ABSOLUT langsung ke akamai-static.shorttv.live (mengandung
 *     auth_key upstream sendiri, BUKAN api_key kita — aman untuk diteruskan tapi kita tetap
 *     pakai jalur internal /api/hls-stream agar konsisten dengan platform HLS lain).
 *   GET /shortmax/episode?id=ID&ep=N&lang=id               → {number,videoUrl,hlsUrl,locked,qualityList}
 *     Shape identik dengan satu item di episodes[] milik allepisode.
 *   GET /shortmax/hls?id=ID&ep=N&q=480p|720p|1080p&lang=en → manifest .m3u8 dengan segmen URL ABSOLUT
 *     dari akamai-static.shorttv.live (dikonfirmasi playable — segmen .ts terdownload valid ~1.2MB).
 *     NOTE: default lang endpoint ini adalah "en" (bukan "id" seperti endpoint lain) — kita tetap
 *     pass lang eksplisit agar konsisten.
 *
 * PERBEDAAN PENTING vs GoodShort/DramaBox:
 * - Auth via HEADER X-API-Key, bukan query param api_key.
 * - hlsManifestUrl() ASYNC — perlu tahu quality yang diminta; default "720p" (seimbang
 *   kualitas vs bandwidth, sama seperti default kualitas GoodShort).
 * - Segmen manifest sudah URL absolut dari akamai-static.shorttv.live → proxy langsung
 *   tanpa konversi tambahan (sama pola dengan v3.goodshort.com).
 * - CDN segmen: akamai-static.shorttv.live → wajib ada di HLS_ALLOWED_HOSTS di server.js.
 * - Tidak ada endpoint: latest, vip, dubindo, subtitles → fallback graceful (return []
 *   atau reuse foryou untuk latest, sama pola dengan GoodShort/PineDrama).
 */

const { fetchJSON } = require("../fetcher");

const BASE        = "https://priv-api.anichin.bio/api";
const BASE_ORIGIN = "https://priv-api.anichin.bio";
const PROVIDER_ID = "shortmax";
const DEFAULT_QUALITY = "720p";

function apiKey() {
  const key = process.env.ANICHIN_API_KEY;
  if (!key) throw new Error("ANICHIN_API_KEY belum diset — tidak bisa memanggil API ShortMax");
  return key;
}

/**
 * Beda dari GoodShort/DramaBox: ShortMax tidak menerima api_key sebagai query
 * param — auth dikirim via header "X-API-Key" (lihat authHeaders()).
 */
function buildUrl(action, params = {}) {
  const qs = new URLSearchParams({ lang: "id", ...params });
  return `${BASE}/${PROVIDER_ID}/${action}?${qs.toString()}`;
}

function authHeaders() {
  return { "X-API-Key": apiKey() };
}

function get(action, params) {
  return fetchJSON(buildUrl(action, params), { headers: authHeaders() });
}

// ─── Normalizer ───────────────────────────────────────────────────────────────

function normalizeItem(d, provider) {
  const epCount = typeof d.episodes === "number"
    ? d.episodes
    : (Array.isArray(d.episodes) ? d.episodes.length : Number(d.episodes ?? d.totalEpisodes ?? 0));
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
  const raw = await get("languages");
  const list = Array.isArray(raw) ? raw : (raw.languages ?? []);
  return {
    default:   raw.default ?? "id",
    languages: list,
  };
}

// ─── trending ─────────────────────────────────────────────────────────────────

async function trending(provider) {
  const raw  = await get("trending");
  const list = Array.isArray(raw) ? raw : (raw.items ?? []);
  return list.map((d) => normalizeItem(d, provider));
}

// ─── latest ───────────────────────────────────────────────────────────────────

/** ShortMax tidak punya endpoint "latest" — fallback ke foryou page 1. */
async function latest(provider) {
  const data = await foryou(provider, 1);
  return data.items;
}

// ─── vip / dubindo ────────────────────────────────────────────────────────────

/** ShortMax tidak punya endpoint vip/dubindo terpisah di dokumentasi upstream. */
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
  const raw  = await get("foryou", { page: Number(page) || 1 });
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
 * ShortMax memakai parameter "query=" (bukan "q=") — sama seperti GoodShort.
 */
async function search(q, provider) {
  if (!q || q.trim().length < 2) return [];
  const raw  = await get("search", { query: q.trim() });
  const list = Array.isArray(raw) ? raw : (raw.items ?? []);
  return list.map((d) => normalizeItem(d, provider || PROVIDER_ID));
}

// ─── allepisode ───────────────────────────────────────────────────────────────

async function allepisode(provider, id) {
  const raw      = await get("allepisode", { id });
  const episodes = Array.isArray(raw.episodes)
    ? raw.episodes.map((e) => ({
        number:   Number(e.number ?? 0),
        title:    e.title ?? `Episode ${e.number}`,
        locked:   Boolean(e.locked),
        duration: 0, // ShortMax tidak menyediakan durasi per episode
      }))
    : [];

  return {
    bookId:        String(raw.id ?? id),
    bookName:      raw.title ?? "",
    cover:         raw.cover ?? "",
    totalEpisodes: Number(raw.totalEpisodes ?? episodes.length),
    episodes,
  };
}

// ─── detail ───────────────────────────────────────────────────────────────────

async function detail(provider, id) {
  // /detail dari upstream menandai mayoritas episode locked:true secara tidak akurat
  // (lihat catatan di kepala file) — status locked & data episode SELALU diambil dari
  // allepisode(), bukan dari field episodes di /detail.
  const [info, eps] = await Promise.all([
    get("detail", { id }),
    allepisode(provider, id).catch(() => ({ episodes: [], totalEpisodes: 0, bookName: "", cover: "" })),
  ]);

  // Fallback: jika allepisode() gagal (network/upstream error), jangan collapse
  // totalEpisodes ke 0 — pakai jumlah episode mentah dari /detail sebagai cadangan
  // (angka ini boleh tidak sinkron soal status locked, tapi tetap valid sebagai count).
  const fallbackCount = Array.isArray(info.episodes) ? info.episodes.length : 0;

  return {
    id:            String(info.id ?? id),
    title:         info.title ?? eps.bookName ?? "Tanpa Judul",
    cover:         info.cover ?? eps.cover ?? "",
    description:   info.description ?? "",
    totalEpisodes: eps.totalEpisodes || eps.episodes.length || fallbackCount,
    episodes:      eps.episodes.length ? eps.episodes : (info.episodes ?? []).map((e) => ({
      number:   Number(e.number ?? 0),
      title:    e.title ?? `Episode ${e.number}`,
      locked:   Boolean(e.locked),
      duration: 0,
    })),
    provider,
  };
}

// ─── subtitles ────────────────────────────────────────────────────────────────

/** ShortMax tidak menyediakan endpoint subtitles. */
async function subtitles() { return []; }

// ─── notifications ────────────────────────────────────────────────────────────

async function notifications() { return []; }

// ─── stream ───────────────────────────────────────────────────────────────────

/**
 * Resolve status stream satu episode.
 *
 * Mengembalikan path internal /api/hls-stream/... agar api_key tidak pernah
 * sampai ke browser. Platform id wajib disertakan di query (?platform=shortmax)
 * karena shortmax bukan DEFAULT_PLATFORM — tanpanya server.js akan fallback ke
 * adapter yang salah.
 *
 * Status locked diambil dari /episode langsung (bukan /detail) — konsisten
 * dengan seluruh episode yang ditest selalu locked:false + qualityList lengkap.
 */
async function stream(provider, id, ep = 1) {
  const epData = await get("episode", { id, ep: Number(ep) });

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
 * Ambil URL manifest HLS upstream langsung dari endpoint /shortmax/hls —
 * berbeda dari GoodShort, ShortMax TIDAK butuh fetch episode dulu untuk
 * mendapat id tambahan (chapterId dsb) — id drama + nomor episode saja cukup.
 * Tetap async agar kontrak konsisten dengan adapter lain & server.js yang
 * selalu memanggilnya via `await`.
 *
 * Manifest yang dikembalikan berisi segmen URL absolut dari
 * akamai-static.shorttv.live → diproxy via /hls-proxy (wajib terdaftar di
 * HLS_ALLOWED_HOSTS di server.js).
 *
 * HANYA untuk dipakai server-side (route /api/hls-stream di server.js).
 */
async function hlsManifestUrl(provider, id, ep, quality = DEFAULT_QUALITY) {
  const url = new URL(`${BASE_ORIGIN}/api/${PROVIDER_ID}/hls`);
  url.searchParams.set("id", id);
  url.searchParams.set("ep", Number(ep));
  url.searchParams.set("q", quality);
  url.searchParams.set("lang", "id");
  // Endpoint hls butuh header X-API-Key juga, tapi hlsManifestUrl() di kontrak
  // adapter hanya mengembalikan URL (fetch dilakukan oleh server.js via
  // node-fetch tanpa header custom kita) — maka key disisipkan sebagai query
  // param cadangan; upstream ShortMax menerima keduanya (header ATAU query).
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
