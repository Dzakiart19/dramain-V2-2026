/**
 * Adapter untuk platform: DramaBox (via priv-api.anichin.bio)
 *
 * BASE ASLI (dikonfirmasi lewat recon langsung, bukan lagi lewat
 * shortdramavid.xyz — situs itu cuma wrapper/proxy tanpa nilai tambah
 * dan sempat rate-limit):
 *
 *   https://priv-api.anichin.bio/api/{provider}/{action}?...&lang=id&api_key=KEY
 *
 * API key WAJIB diisi lewat env var ANICHIN_API_KEY (Replit Secret),
 * TIDAK PERNAH di-hardcode di sini dan TIDAK PERNAH dikirim ke browser.
 * Semua request yang butuh key dilakukan server-side saja.
 *
 * Endpoint yang dikonfirmasi:
 *   GET /{provider}/languages                  → daftar bahasa tersedia
 *   GET /{provider}/trending                    → { items }
 *   GET /{provider}/latest                       → { items }
 *   GET /{provider}/vip                           → { items }
 *   GET /{provider}/dubindo                       → { items }
 *   GET /{provider}/foryou?page=N                → { items, page, perPage, total, hasMore }
 *   GET /{provider}/search?q=Q                    → { items }
 *   GET /{provider}/detail?id=ID                  → info drama (episode titles-nya kadang
 *                                                    tidak sinkron dengan nomornya — jangan
 *                                                    dipakai sebagai sumber daftar episode)
 *   GET /{provider}/allepisode?id=ID              → { bookId, bookName, chapterCount,
 *                                                       cover, totalEpisodes, episodes:
 *                                                       [{ chapterId, number, chapterName,
 *                                                          duration, locked, hlsUrl, subtitlesUrl }] }
 *                                                    → sumber daftar episode yang akurat
 *   GET /{provider}/subtitles?id=ID&ep=N          → { bookId, episode, subtitles }
 *   GET /{provider}/hls?id=ID&ep=N                → manifest .m3u8 mentah (BUKAN JSON,
 *                                                    perlu api_key — hanya boleh di-fetch
 *                                                    dari server, tidak dari browser)
 *
 * Catatan: endpoint "watch" TIDAK ada di API ini (`invalid action "watch"`) —
 * aksi yang benar untuk resolve stream adalah `hls`. Endpoint "notifications"
 * juga tidak ada di API ini; fungsi notifications() selalu return [].
 */

const { fetchJSON } = require("../fetcher");

const BASE = "https://priv-api.anichin.bio/api";

function apiKey() {
  const key = process.env.ANICHIN_API_KEY;
  if (!key) throw new Error("ANICHIN_API_KEY belum diset — tidak bisa memanggil API DramaBox");
  return key;
}

function buildUrl(provider, action, params = {}) {
  const qs = new URLSearchParams({ ...params, lang: "id", api_key: apiKey() });
  return `${BASE}/${provider}/${action}?${qs.toString()}`;
}

/**
 * URL manifest HLS mentah (mengandung api_key) — HANYA untuk dipakai
 * server-side (lihat route /api/hls-stream di server.js). Jangan pernah
 * dikirim langsung ke client.
 */
function hlsManifestUrl(provider, id, ep) {
  return buildUrl(provider, "hls", { id, ep });
}

/**
 * Cari drama untuk satu provider.
 * @param {string} q - kata kunci
 * @param {string} [provider] - wajib untuk API ini (tidak ada search lintas-provider)
 * @returns {Array} list drama flat
 */
async function search(q, provider) {
  if (!q || q.trim().length < 2 || !provider) return [];
  const raw = await fetchJSON(buildUrl(provider, "search", { q }));
  const list = Array.isArray(raw) ? raw : (raw.items ?? []);
  return list.map((d) => normalizeSearchItem(d, provider));
}

/**
 * Detail lengkap satu drama. Daftar episode diambil dari `allepisode`
 * karena field episodes bawaan `detail` tidak selalu sinkron nomor↔judul.
 * @param {string} provider
 * @param {string} id
 * @returns {{ id, title, cover, description, totalEpisodes, episodes, provider }}
 */
async function detail(provider, id) {
  const [info, eps] = await Promise.all([
    fetchJSON(buildUrl(provider, "detail", { id })),
    allepisode(provider, id).catch(() => ({ episodes: [], totalEpisodes: 0 })),
  ]);

  return {
    id: info.id ?? id,
    title: info.title ?? info.name ?? eps.bookName ?? "Tanpa Judul",
    cover: info.cover ?? info.poster ?? eps.cover ?? "",
    description: info.description ?? info.synopsis ?? "",
    totalEpisodes: eps.totalEpisodes || eps.episodes.length || Number(info.totalEpisodes ?? 0),
    episodes: eps.episodes,
    provider,
  };
}

/**
 * Daftar lengkap episode sebuah drama (sumber episode yang akurat).
 * @param {string} provider
 * @param {string} id
 * @returns {{ bookId, bookName, cover, totalEpisodes, episodes: Array }}
 */
async function allepisode(provider, id) {
  const raw = await fetchJSON(buildUrl(provider, "allepisode", { id }));
  const episodes = Array.isArray(raw.episodes)
    ? raw.episodes.map((e) => ({
        number: Number(e.number ?? 0),
        title: e.chapterName ?? e.title ?? `Episode ${e.number}`,
        locked: Boolean(e.locked),
        duration: Number(e.duration ?? 0),
      }))
    : [];

  return {
    bookId: raw.bookId ?? id,
    bookName: raw.bookName ?? "",
    cover: raw.cover ?? "",
    totalEpisodes: Number(raw.totalEpisodes ?? raw.chapterCount ?? episodes.length),
    episodes,
  };
}

/**
 * Subtitle satu episode.
 * @param {string} provider
 * @param {string} id
 * @param {number} ep
 * @returns {Array}
 */
async function subtitles(provider, id, ep = 1) {
  const raw = await fetchJSON(buildUrl(provider, "subtitles", { id, ep }));
  return raw?.subtitles ?? [];
}

/**
 * Bahasa yang tersedia untuk platform ini.
 * @param {string} provider
 * @returns {{ default, languages }}
 */
async function languages(provider) {
  const raw = await fetchJSON(buildUrl(provider, "languages"));
  return {
    default: raw?.default ?? "id",
    languages: raw?.languages ?? [],
  };
}

/**
 * Cek status kunci suatu episode tanpa mengambil manifest videonya —
 * dipakai server.js sebelum membuka route streaming.
 * @param {string} provider
 * @param {string} id
 * @param {number} ep
 * @returns {{ locked, episodeNumber }}
 */
async function checkEpisodeLock(provider, id, ep) {
  const eps = await allepisode(provider, id);
  const found = eps.episodes.find((e) => e.number === Number(ep));
  return {
    locked: found ? found.locked : false,
    episodeNumber: Number(ep),
  };
}

/**
 * Drama trending.
 * @param {string} provider
 */
async function trending(provider) {
  const raw = await fetchJSON(buildUrl(provider, "trending"));
  const list = Array.isArray(raw) ? raw : (raw.items ?? []);
  return list.map((d) => normalizeSearchItem(d, provider));
}

/**
 * Drama terbaru.
 * @param {string} provider
 */
async function latest(provider) {
  try {
    const raw = await fetchJSON(buildUrl(provider, "latest"));
    const list = Array.isArray(raw) ? raw : (raw.items ?? []);
    return list.map((d) => normalizeSearchItem(d, provider));
  } catch {
    // endpoint "latest" sudah tidak ada di upstream — fallback ke foryou
    return (await foryou(provider, 1)).items;
  }
}

/**
 * Browse home — gabungan trending + latest, deduplikasi by id.
 */
async function browse(provider) {
  const [t, l] = await Promise.all([trending(provider), latest(provider)]);
  const seen = new Set();
  return [...t, ...l].filter((d) => {
    if (seen.has(d.id)) return false;
    seen.add(d.id);
    return true;
  });
}

/**
 * Drama VIP (konten premium/berbayar).
 * @param {string} provider
 */
async function vip(provider) {
  try {
    const raw = await fetchJSON(buildUrl(provider, "vip"));
    const list = Array.isArray(raw) ? raw : (raw.items ?? []);
    return list.map((d) => normalizeSearchItem(d, provider));
  } catch {
    return [];
  }
}

/**
 * Drama sulih suara Indonesia (dubbing).
 * @param {string} provider
 */
async function dubindo(provider) {
  try {
    const raw = await fetchJSON(buildUrl(provider, "dubindo"));
    const list = Array.isArray(raw) ? raw : (raw.items ?? []);
    return list.map((d) => normalizeSearchItem(d, provider));
  } catch {
    return [];
  }
}

/**
 * Feed rekomendasi "for you", dengan pagination.
 * @param {string} provider
 * @param {number} page - mulai dari 1
 * @returns {{ items, page, perPage, total, hasMore }}
 */
async function foryou(provider, page = 1) {
  const raw = await fetchJSON(buildUrl(provider, "foryou", { page: Number(page) || 1 }));
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
 * Resolve status stream (lock only — URL video dibuka lewat route
 * /api/hls-stream di server.js supaya api_key tidak pernah sampai ke
 * browser).
 * @param {string} provider
 * @param {string} id - drama id
 * @param {number} ep - nomor episode (mulai dari 1)
 * @returns {{ videoUrl, locked, episodeNumber, qualityList }}
 */
async function stream(provider, id, ep = 1) {
  const { locked, episodeNumber } = await checkEpisodeLock(provider, id, ep);
  return {
    videoUrl:      locked ? "" : `/api/hls-stream/${provider}/${id}?ep=${episodeNumber}`,
    locked,
    episodeNumber,
    qualityList:   [],
    streamType:    "hls",
  };
}

/**
 * Status platform — endpoint ini tidak ada di priv-api.anichin.bio,
 * selalu kembalikan array kosong (notifikasi tidak didukung).
 */
async function notifications() {
  return [];
}

// ─── Normalizer Internal ────────────────────────────────────────────────────

function normalizeSearchItem(d, provider) {
  const epCount = Array.isArray(d.episodes)
    ? d.episodes.length
    : Number(d.episodes ?? d.totalEpisodes ?? d.episodeCount ?? 0);

  return {
    id: String(d.id ?? ""),
    title: d.title ?? d.name ?? "Tanpa Judul",
    cover: d.cover ?? d.poster ?? d.thumbnail ?? "",
    provider,
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
