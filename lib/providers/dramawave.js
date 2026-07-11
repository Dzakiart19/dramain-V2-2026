/**
 * Adapter untuk platform: DramaWave (via priv-api.anichin.bio)
 *
 * BASE: https://priv-api.anichin.bio/api/dramawave/{action}?...&lang=id&api_key=KEY
 * API key WAJIB diisi lewat env var ANICHIN_API_KEY (Replit Secret),
 * TIDAK PERNAH di-hardcode di sini dan TIDAK PERNAH dikirim ke browser.
 *
 * Endpoint yang dikonfirmasi (recon langsung):
 *   GET /languages                     → { languages: [{code, name}] }
 *   GET /trending?lang=id              → { items: [{id,title,cover,episodes,description}] }
 *   GET /foryou?page=N&lang=id         → { items, page, hasMore }
 *   GET /search?q=Q&lang=id            → { items, hasMore, page } — param q= jalan normal
 *   GET /detail?id=ID&lang=id          → { id, title, cover, description, tags, episodes, totalEps }
 *     episodes[] sudah berisi { number, title, videoUrl, hlsUrl, locked, subtitles }
 *     lengkap — totalEps dikonfirmasi AKURAT (sinkron dengan episodes.length &
 *     dengan video yang benar-benar ada), tidak seperti FlareFlow. Karena itu
 *     tidak perlu panggil endpoint /allepisode terpisah untuk allepisode().
 *   GET /episode?id=ID&ep=N&lang=id    → { number, videoUrl, hlsUrl, locked, qualityList }
 *     videoUrl = URL ABSOLUT langsung ke manifest .m3u8 di video-vN.mydramawave.com,
 *     TIDAK mengandung api_key — tapi tetap diproxy lewat /api/hls-stream untuk
 *     konsisten dengan provider HLS lain & menyembunyikan detail CDN upstream.
 *   GET /hls?id=ID&ep=N&q=720p&api_key=KEY → 302 redirect ke videoUrl yang sama
 *     persis dengan /episode — tidak dipakai, /episode sudah cukup.
 *
 * Tidak ada endpoint: latest, vip, dubindo, subtitles (standalone), notifications
 * → fallback graceful (return [] atau reuse foryou/detail).
 *
 * Episode out-of-range: upstream balas 500 "episode N not found" (bukan 200
 * silent seperti FlareFlow) — checkEpisodeLock() menangani lewat try/catch.
 */

const { fetchJSON } = require("../fetcher");

const BASE = "https://priv-api.anichin.bio/api/dramawave";
const PROVIDER_ID = "dramawave";

function apiKey() {
  const key = process.env.ANICHIN_API_KEY;
  if (!key) throw new Error("ANICHIN_API_KEY belum diset — tidak bisa memanggil API DramaWave");
  return key;
}

function buildUrl(action, params = {}) {
  const qs = new URLSearchParams({ ...params, lang: "id", api_key: apiKey() });
  return `${BASE}/${action}?${qs.toString()}`;
}

/**
 * URL manifest HLS mentah — HANYA untuk dipakai server-side (route
 * /api/hls-stream di server.js). Jangan pernah dikirim langsung ke client.
 */
async function hlsManifestUrl(provider, id, ep) {
  const epData = await fetchJSON(buildUrl("episode", { id, ep: Number(ep) }));
  const url = epData.videoUrl ?? epData.hlsUrl ?? "";
  if (!url) {
    throw new Error(`DramaWave: tidak ada videoUrl untuk episode ${ep} (id=${id})`);
  }
  return url;
}

async function search(q, provider) {
  if (!q || q.trim().length < 2) return [];
  const raw = await fetchJSON(buildUrl("search", { q }));
  const list = Array.isArray(raw) ? raw : (raw.items ?? []);
  return list.map((d) => normalizeSearchItem(d, provider));
}

/**
 * Detail lengkap satu drama. Episode list diambil langsung dari /detail —
 * berbeda dari DramaBox, di sini totalEps sudah akurat sehingga tidak perlu
 * cross-check ke endpoint terpisah.
 */
async function detail(provider, id) {
  const info = await fetchJSON(buildUrl("detail", { id }));
  const episodes = normalizeEpisodes(info.episodes);

  return {
    id: info.id ?? id,
    title: info.title ?? "Tanpa Judul",
    cover: info.cover ?? "",
    description: info.description ?? "",
    totalEpisodes: Number(info.totalEps ?? episodes.length),
    episodes,
    provider,
  };
}

/**
 * Daftar lengkap episode — bersumber dari /detail (sudah akurat & lengkap),
 * bukan endpoint /allepisode terpisah (shape-nya lebih mentah dan tidak
 * menambah informasi baru untuk kebutuhan kontrak ini).
 */
async function allepisode(provider, id) {
  const info = await fetchJSON(buildUrl("detail", { id }));
  const episodes = normalizeEpisodes(info.episodes);

  return {
    bookId: info.id ?? id,
    bookName: info.title ?? "",
    cover: info.cover ?? "",
    totalEpisodes: Number(info.totalEps ?? episodes.length),
    episodes,
  };
}

function normalizeEpisodes(raw) {
  return Array.isArray(raw)
    ? raw.map((e) => ({
        number: Number(e.number ?? 0),
        title: e.title ?? `Episode ${e.number}`,
        locked: Boolean(e.locked),
        duration: Number(e.duration ?? 0),
      }))
    : [];
}

/**
 * Tidak ada endpoint /subtitles terpisah di upstream — subtitle sudah
 * ter-embed di setiap item episode pada /detail, jadi ambil dari sana.
 */
async function subtitles(provider, id, ep = 1) {
  const info = await fetchJSON(buildUrl("detail", { id }));
  const found = (info.episodes ?? []).find((e) => Number(e.number) === Number(ep));
  return found?.subtitles ?? [];
}

async function languages(provider) {
  const raw = await fetchJSON(buildUrl("languages"));
  return {
    default: raw?.default ?? "id",
    languages: raw?.languages ?? [],
  };
}

/**
 * Cek status kunci suatu episode. Upstream membalas 500 "episode N not
 * found" untuk ep di luar range — ditangkap sebagai locked:true supaya
 * tidak bocor ke client sebagai error mentah.
 */
async function checkEpisodeLock(provider, id, ep) {
  try {
    const epData = await fetchJSON(buildUrl("episode", { id, ep: Number(ep) }));
    return {
      locked: Boolean(epData.locked) || !epData.videoUrl,
      episodeNumber: Number(ep),
      epData,
    };
  } catch {
    return { locked: true, episodeNumber: Number(ep), epData: null };
  }
}

async function trending(provider) {
  const raw = await fetchJSON(buildUrl("trending"));
  const list = Array.isArray(raw) ? raw : (raw.items ?? []);
  return list.map((d) => normalizeSearchItem(d, provider));
}

/**
 * Tidak ada endpoint /latest di upstream — fallback ke foryou halaman
 * pertama, sama pola dengan MoboReels.
 */
async function latest(provider) {
  const fy = await foryou(provider, 1);
  return fy.items;
}

async function browse(provider) {
  const [t, l] = await Promise.all([trending(provider), latest(provider)]);
  const seen = new Set();
  return [...t, ...l].filter((d) => {
    if (seen.has(d.id)) return false;
    seen.add(d.id);
    return true;
  });
}

/** Tidak ada endpoint /vip di upstream. */
async function vip() {
  return [];
}

/** Tidak ada endpoint /dubindo di upstream. */
async function dubindo() {
  return [];
}

async function foryou(provider, page = 1) {
  const raw = await fetchJSON(buildUrl("foryou", { page: Number(page) || 1 }));
  const list = Array.isArray(raw) ? raw : (raw.items ?? []);
  return {
    items: list.map((d) => normalizeSearchItem(d, provider)),
    page: raw.page ?? (Number(page) || 1),
    perPage: raw.perPage ?? list.length,
    total: raw.total ?? list.length,
    hasMore: raw.hasMore ?? false,
  };
}

/**
 * Resolve status stream. videoUrl asli TIDAK mengandung api_key, tapi tetap
 * diproxy lewat /api/hls-stream (bukan dikirim langsung) supaya konsisten
 * dengan provider HLS lain dan detail CDN upstream tidak bocor ke response.
 */
async function stream(provider, id, ep = 1) {
  const { locked, episodeNumber, epData } = await checkEpisodeLock(provider, id, ep);

  if (locked || !epData) {
    return {
      videoUrl: "",
      locked: true,
      episodeNumber,
      qualityList: [],
      streamType: "hls",
    };
  }

  return {
    videoUrl: `/api/hls-stream/${PROVIDER_ID}/${id}?ep=${episodeNumber}&platform=${PROVIDER_ID}`,
    locked: false,
    episodeNumber,
    qualityList: Array.isArray(epData.qualityList) ? epData.qualityList : [],
    streamType: "hls",
  };
}

/** Tidak ada endpoint /notifications di upstream. */
async function notifications() {
  return [];
}

// ─── Normalizer Internal ────────────────────────────────────────────────────

function normalizeSearchItem(d, provider) {
  const epCount = Array.isArray(d.episodes)
    ? d.episodes.length
    : Number(d.episodes ?? d.totalEps ?? d.totalEpisodes ?? 0);

  return {
    id: String(d.id ?? ""),
    title: d.title ?? d.name ?? "Tanpa Judul",
    cover: d.cover ?? d.poster ?? d.thumbnail ?? "",
    provider: provider || PROVIDER_ID,
    episodes: epCount,
    description: d.description ?? d.synopsis ?? "",
  };
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
