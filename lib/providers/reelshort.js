/**
 * Adapter untuk platform: ReelShort (via priv-api.anichin.bio)
 *
 * BASE: https://priv-api.anichin.bio/api/reelshort/{action}?...&lang=en&api_key=KEY
 *
 * API key SAMA dengan DramaBox/PineDrama/GoodShort/ShortMax — baca dari env var
 * ANICHIN_API_KEY. Auth diterima via HEADER "X-API-Key" ATAU query "api_key"
 * (dikonfirmasi lewat curl langsung ke upstream, keduanya bekerja).
 *
 * Endpoint yang dikonfirmasi (test manual 2026-07-10):
 *   GET /reelshort/languages                          → {default, languages:[{code,name}], source, total}
 *   GET /reelshort/trending?lang=en                    → {items:[{id,title,cover,episodes}]}
 *   GET /reelshort/foryou?page=N&lang=en                → shape sama dengan trending
 *   GET /reelshort/search?query=Q&lang=en                → {items:[...]}
 *     NOTE: parameter pencarian adalah "query=", BUKAN "q=" — sama seperti GoodShort/ShortMax.
 *   GET /reelshort/detail?id=ID&lang=en                  → {id,title,cover,description,tags,
 *                                                            episodes:[{number,title,videoUrl:"",locked}]}
 *   GET /reelshort/allepisode?id=ID&lang=en              → {bookId,episodes:[{number,chapterId,
 *                                                            hlsUrl,locked}]}
 *     hlsUrl = path relatif "/api/reelshort/hls?id=...&ep=N"
 *   GET /reelshort/episode?id=ID&ep=N&lang=en            → {number,videoUrl,hlsUrl,locked,
 *                                                            qualityList:[{label,url,isDefault}]}
 *   GET /reelshort/hls?id=ID&ep=N                        → HTTP 302 REDIRECT ke manifest .m3u8
 *                                                            asli di v-mps.crazymaplestudios.com.
 *     PENTING — beda dari ShortMax/GoodShort: segmen di dalam manifest berupa
 *     PATH RELATIF (bukan URL absolut), mis. "abcd-hd-00001.ts". server.js
 *     sudah diperbaiki (lihat komentar di route /api/hls-stream) untuk resolve
 *     baris relatif terhadap `upstream.url` (URL akhir setelah redirect)
 *     sebelum diproxy — TANPA perbaikan itu, playback ReelShort akan gagal.
 *   GET /reelshort/episode?...&ep=999 (di luar range)     → {"error":"source error: episode
 *                                                            999 not found for ..."} (HTTP error,
 *                                                            ditangkap oleh fetchJSON sebagai throw)
 *
 * Konsistensi locked-status (BEDA dari ShortMax): semua endpoint yang ditest
 * (detail, allepisode, episode) SELALU mengembalikan locked:false secara
 * konsisten untuk seluruh episode pada setiap judul yang dicoba — TIDAK ada
 * inkonsistensi seperti ShortMax. Karena itu detail() di sini masih tetap
 * sengaja mengambil status locked dari allepisode() (bukan /detail) demi
 * konsistensi arsitektur adapter, meski secara empiris nilainya sama.
 *
 * Segmen video dikonfirmasi valid: diunduh via curl, diverifikasi dengan
 * ffprobe sebagai H.264 1080x1920, ukuran ~2MB per segmen 5 detik — playable.
 *
 * PERBEDAAN PENTING vs ShortMax/GoodShort:
 * - Auth via HEADER X-API-Key ATAU query api_key (keduanya valid, ShortMax hanya header).
 * - Endpoint /hls me-redirect (302) ke manifest asli, bukan mengembalikan body
 *   manifest langsung — fetch() Node mengikuti redirect secara default sehingga
 *   ini transparan untuk hlsManifestUrl(), TAPI segmen di dalam manifest relatif
 *   terhadap domain hasil redirect (v-mps.crazymaplestudios.com), bukan absolut.
 * - CDN segmen: v-mps.crazymaplestudios.com → wajib ada di HLS_ALLOWED_HOSTS di server.js.
 * - Tidak ada endpoint: latest, vip, dubindo, subtitles → fallback graceful (return []
 *   atau reuse foryou untuk latest, sama pola dengan ShortMax/GoodShort/PineDrama).
 */

const { fetchJSON } = require("../fetcher");

const BASE        = "https://priv-api.anichin.bio/api";
const BASE_ORIGIN = "https://priv-api.anichin.bio";
const PROVIDER_ID = "reelshort";
const DEFAULT_LANG = "en";

function apiKey() {
  const key = process.env.ANICHIN_API_KEY;
  if (!key) throw new Error("ANICHIN_API_KEY belum diset — tidak bisa memanggil API ReelShort");
  return key;
}

function authHeaders() {
  return { "X-API-Key": apiKey() };
}

function buildUrl(action, params = {}) {
  const qs = new URLSearchParams({ lang: DEFAULT_LANG, ...params });
  return `${BASE}/${PROVIDER_ID}/${action}?${qs.toString()}`;
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

/** ReelShort tidak punya endpoint "latest" — fallback ke foryou page 1. */
async function latest(provider) {
  const data = await foryou(provider, 1);
  return data.items;
}

// ─── vip / dubindo ────────────────────────────────────────────────────────────

/** ReelShort tidak punya endpoint vip/dubindo terpisah di dokumentasi upstream. */
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
 * ReelShort memakai parameter "query=" (bukan "q=") — sama seperti GoodShort/ShortMax.
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
        duration: 0, // ReelShort tidak menyediakan durasi per episode
      }))
    : [];

  return {
    bookId:        String(raw.bookId ?? raw.id ?? id),
    bookName:      raw.title ?? "",
    cover:         raw.cover ?? "",
    totalEpisodes: Number(raw.totalEpisodes ?? episodes.length),
    episodes,
  };
}

// ─── detail ───────────────────────────────────────────────────────────────────

async function detail(provider, id) {
  // Sama seperti ShortMax: status locked & data episode diambil dari
  // allepisode(), bukan dari field episodes di /detail, demi konsistensi
  // arsitektur adapter — meski pada ReelShort keduanya secara empiris sama
  // (locked:false untuk semua episode di setiap judul yang ditest).
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

/** ReelShort tidak menyediakan endpoint subtitles. */
async function subtitles() { return []; }

// ─── notifications ────────────────────────────────────────────────────────────

async function notifications() { return []; }

// ─── stream ───────────────────────────────────────────────────────────────────

/**
 * Resolve status stream satu episode.
 *
 * Mengembalikan path internal /api/hls-stream/... agar api_key tidak pernah
 * sampai ke browser. Platform id wajib disertakan di query (?platform=reelshort)
 * karena reelshort bukan DEFAULT_PLATFORM.
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
 * Ambil URL endpoint /reelshort/hls upstream — endpoint ini me-302-redirect ke
 * manifest .m3u8 asli di v-mps.crazymaplestudios.com. fetch() di server.js
 * mengikuti redirect secara default, jadi ini transparan.
 *
 * PENTING: manifest hasil redirect berisi segmen dengan PATH RELATIF (bukan
 * URL absolut) — server.js WAJIB resolve baris relatif terhadap `upstream.url`
 * (URL akhir setelah redirect) sebelum diproxy via /hls-proxy. Tanpa itu,
 * playback akan gagal karena browser mencoba fetch segmen relatif terhadap
 * origin server kita sendiri.
 *
 * HANYA untuk dipakai server-side (route /api/hls-stream di server.js).
 */
async function hlsManifestUrl(provider, id, ep) {
  const url = new URL(`${BASE_ORIGIN}/api/${PROVIDER_ID}/hls`);
  url.searchParams.set("id", id);
  url.searchParams.set("ep", Number(ep));
  // Endpoint hls butuh auth juga, tapi hlsManifestUrl() hanya mengembalikan URL
  // (fetch dilakukan oleh server.js tanpa header custom kita) — maka key
  // disisipkan sebagai query param; upstream ReelShort menerima keduanya.
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
