/**
 * Adapter untuk platform: DramaBite (via priv-api.anichin.bio)
 *
 * BASE: https://priv-api.anichin.bio/api/dramabite/{action}?...&lang=en
 *
 * API key SAMA dengan DramaBox/PineDrama/GoodShort/ShortMax/ReelShort — baca
 * dari env var ANICHIN_API_KEY. Auth diterima via HEADER "X-API-Key" ATAU
 * query "api_key" (dikonfirmasi lewat curl langsung ke upstream, keduanya
 * bekerja — sama seperti ReelShort). Endpoint /languages tidak butuh auth.
 *
 * Endpoint yang dikonfirmasi (test manual 2026-07-10):
 *   GET /dramabite/languages                       → {default, languages:[{code,name}], source, total}
 *   GET /dramabite/trending?lang=en                  → {items:[{id,title,cover,episodes}]}
 *   GET /dramabite/foryou?page=N&lang=en              → shape sama dengan trending
 *   GET /dramabite/search?query=Q                     → {items:[...]}
 *     NOTE: parameter pencarian "query=" (bukan "q="), sama seperti provider lain.
 *     Query kosong tidak ditolak upstream (HTTP 200), jadi validasi panjang
 *     minimum dilakukan di adapter ini, sama seperti provider lain.
 *   GET /dramabite/detail?id=ID&lang=en                → {id,title,cover,description,tags,
 *                                                          episodes:[{number,title,videoUrl:"",locked}]}
 *     videoUrl selalu kosong di /detail — video URL asli hanya ada di allepisode/episode.
 *   GET /dramabite/allepisode?id=ID&lang=en            → {id,title,cover,description,totalEpisodes,
 *                                                          episodes:[{number,title,videoUrl,locked}]}
 *     videoUrl = URL ABSOLUT LANGSUNG ke manifest .m3u8 di cdn-video.miniepisode.media
 *     (sudah menyertakan query wsSecret & wsTime). TIDAK ADA endpoint /hls terpisah
 *     seperti ReelShort/ShortMax — manifest didapat langsung dari sini/episode.
 *   GET /dramabite/episode?id=ID&ep=N                  → {number,videoUrl,locked}
 *   GET /dramabite/homepage?lang=en                    → TIDAK ADA di upstream nyata
 *     ("error":"invalid action \"homepage\"") meski didokumentasikan — diperlakukan
 *     sebagai endpoint tidak tersedia, fallback ke foryou (sama pola dengan provider lain).
 *
 * Konsistensi locked-status: SELALU locked:false di semua endpoint (detail,
 * allepisode, episode) untuk seluruh episode & judul yang ditest — tidak ada
 * inkonsistensi seperti ShortMax. detail() di sini tetap mengambil status
 * locked dari allepisode() demi konsistensi arsitektur adapter.
 *
 * Manifest & segmen: manifest .m3u8 di-fetch LANGSUNG tanpa redirect (HTTP 200
 * langsung dari cdn-video.miniepisode.media). Baris segmen di dalam manifest
 * berupa PATH RELATIF (mis. "xxx_0000000.ts?wsHlsSession=..."), sama seperti
 * ReelShort — sudah ditangani generik oleh resolve-relatif-terhadap-upstream.url
 * di server.js (/api/hls-stream & /hls-proxy), tidak perlu perubahan tambahan.
 * Segmen dikonfirmasi valid via ffprobe: H.264 1080x1920 + AAC.
 *
 * CDN segmen & manifest: cdn-video.miniepisode.media → wajib ada di
 * HLS_ALLOWED_HOSTS di server.js.
 *
 * Tidak ada endpoint: latest, vip, dubindo, subtitles, homepage → fallback
 * graceful (return [] atau reuse foryou untuk latest), sama pola dengan
 * provider lain.
 */

const { fetchJSON } = require("../fetcher");

const BASE         = "https://priv-api.anichin.bio/api";
const PROVIDER_ID   = "dramabite";
const DEFAULT_LANG  = "en";

function apiKey() {
  const key = process.env.ANICHIN_API_KEY;
  if (!key) throw new Error("ANICHIN_API_KEY belum diset — tidak bisa memanggil API DramaBite");
  return key;
}

function authHeaders() {
  return { "X-API-Key": apiKey() };
}

function buildUrl(action, params = {}) {
  const qs = new URLSearchParams({ lang: DEFAULT_LANG, ...params });
  return `${BASE}/${PROVIDER_ID}/${action}?${qs.toString()}`;
}

function get(action, params, needAuth = true) {
  return fetchJSON(buildUrl(action, params), needAuth ? { headers: authHeaders() } : {});
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
  const raw = await get("languages", {}, false);
  const list = Array.isArray(raw) ? raw : (raw.languages ?? []);
  return {
    default:   raw.default ?? DEFAULT_LANG,
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

/** DramaBite tidak punya endpoint "latest" — fallback ke foryou page 1. */
async function latest(provider) {
  const data = await foryou(provider, 1);
  return data.items;
}

// ─── vip / dubindo ────────────────────────────────────────────────────────────

/** DramaBite tidak punya endpoint vip/dubindo di upstream. */
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
 * DramaBite memakai parameter "query=" (bukan "q="). Upstream menerima query
 * kosong tanpa error (HTTP 200), jadi validasi panjang minimum dilakukan di
 * sini agar konsisten dengan provider lain (butuh minimal 2 karakter).
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
        duration: 0, // DramaBite tidak menyediakan durasi per episode
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
  // Sama seperti ReelShort/ShortMax: status locked & data episode diambil
  // dari allepisode(), bukan dari field episodes di /detail (yang videoUrl-nya
  // selalu kosong), demi konsistensi arsitektur adapter.
  const [info, eps] = await Promise.all([
    get("detail", { id }),
    allepisode(provider, id).catch(() => ({ episodes: [], totalEpisodes: 0, bookName: "", cover: "" })),
  ]);

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

/** DramaBite tidak menyediakan endpoint subtitles. */
async function subtitles() { return []; }

// ─── notifications ────────────────────────────────────────────────────────────

async function notifications() { return []; }

// ─── stream ───────────────────────────────────────────────────────────────────

/**
 * Resolve status stream satu episode.
 *
 * Berbeda dari ReelShort/ShortMax: DramaBite TIDAK punya endpoint /hls
 * terpisah — /episode langsung mengembalikan videoUrl absolut ke manifest
 * .m3u8 di cdn-video.miniepisode.media. Tetap dibungkus lewat
 * /api/hls-stream server-side supaya URL upstream (berisi wsSecret/wsTime)
 * tidak langsung bocor ke response JSON /api/watch, konsisten dengan
 * provider lain.
 */
async function stream(provider, id, ep = 1) {
  const epData = await get("episode", { id, ep: Number(ep) });

  if (epData.locked || !epData.videoUrl) {
    return {
      videoUrl:      "",
      locked:        Boolean(epData.locked),
      episodeNumber: Number(ep),
      qualityList:   [],
      streamType:    "hls",
    };
  }

  return {
    videoUrl:      `/api/hls-stream/${PROVIDER_ID}/${id}?ep=${ep}&platform=${PROVIDER_ID}`,
    locked:        false,
    episodeNumber: Number(epData.number ?? ep),
    qualityList:   [],
    streamType:    "hls",
  };
}

// ─── hlsManifestUrl ───────────────────────────────────────────────────────────

/**
 * Ambil URL manifest .m3u8 langsung dari /dramabite/episode — tidak ada
 * redirect di sini (beda dari ReelShort), tapi manifest hasilnya tetap
 * berisi segmen dengan PATH RELATIF, jadi server.js tetap wajib resolve
 * baris relatif terhadap `upstream.url` sebelum diproxy (logic ini sudah
 * generik dan sama dipakai untuk ReelShort).
 *
 * HANYA untuk dipakai server-side (route /api/hls-stream di server.js).
 */
async function hlsManifestUrl(provider, id, ep) {
  const epData = await get("episode", { id, ep: Number(ep) });
  if (!epData.videoUrl) {
    throw new Error("Manifest video tidak tersedia untuk episode ini");
  }
  return epData.videoUrl;
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
