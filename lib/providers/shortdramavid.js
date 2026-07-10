/**
 * Adapter untuk platform: shortdramavid.xyz
 *
 * Endpoint yang ditemukan via recon:
 *   Semua endpoint pakai trailing slash
 *   BASE/api/search/?q=QUERY               → search lintas provider
 *   BASE/api/{provider}/search/?q=QUERY    → search per provider
 *   BASE/api/{provider}/detail/{id}/       → detail drama + array episodes
 *   BASE/api/{provider}/watch/?id=ID&ep=N  → URL stream HLS
 *   BASE/api/notifications/                → status platform
 *   BASE/api/{provider}/vip/               → drama VIP
 *   BASE/api/{provider}/dubindo/           → drama sulih suara Indonesia
 *   BASE/api/{provider}/foryou/?page=N     → feed rekomendasi, dengan pagination
 *
 * Struktur episodes dari detail:
 *   [ { number, title, videoUrl, locked } ]
 *
 * Catatan hasil recon lanjutan:
 *   - Endpoint `languages`, `allepisode`, `subtitles`, `hls` TIDAK ada
 *     sebagai endpoint JSON terpisah di situs ini (selalu fallback ke
 *     halaman SPA / 404). Daftar episode lengkap sudah tersedia langsung
 *     dari `detail`. Field `hlsUrl` di setiap episode hanyalah alamat
 *     internal yang dipakai situs asal, bukan endpoint publik — sumber
 *     video sebenarnya didapat lewat `stream()` (endpoint `watch`).
 */

const { fetchJSON } = require("../fetcher");

const BASE = "https://www.shortdramavid.xyz";

/**
 * Cari drama. Kalau provider tidak diisi, cari di semua provider sekaligus.
 * @param {string} q - kata kunci
 * @param {string} [provider] - opsional, filter ke satu provider saja
 * @returns {Array} list drama flat
 */
async function search(q, provider = null) {
  if (!q || q.trim().length < 2) return [];

  let raw;
  if (provider) {
    raw = await fetchJSON(`${BASE}/api/${provider}/search/?q=${encodeURIComponent(q)}`);
    if (!Array.isArray(raw)) return [];
    return raw.map((d) => normalizeSearchItem(d, provider));
  }

  raw = await fetchJSON(`${BASE}/api/search/?q=${encodeURIComponent(q)}`);
  const results = raw?.results ?? [];
  return results.flatMap((group) =>
    (group.dramas ?? []).map((d) => normalizeSearchItem(d, group.platform))
  );
}

/**
 * Detail lengkap satu drama beserta daftar episode.
 * @param {string} provider
 * @param {string} id
 * @returns {{ id, title, cover, description, totalEpisodes, episodes, provider, raw }}
 */
async function detail(provider, id) {
  const raw = await fetchJSON(`${BASE}/api/${provider}/detail/${id}/`);

  const episodeList = Array.isArray(raw.episodes)
    ? raw.episodes.map((e) => ({
        number: Number(e.number ?? 0),
        title: e.title ?? `Episode ${e.number}`,
        locked: Boolean(e.locked),
      }))
    : [];

  return {
    id: raw.id ?? id,
    title: raw.title ?? raw.name ?? "Tanpa Judul",
    cover: raw.cover ?? raw.poster ?? "",
    description: raw.description ?? raw.synopsis ?? "",
    totalEpisodes: episodeList.length || Number(raw.totalEpisodes ?? raw.episodeCount ?? 0),
    episodes: episodeList,
    provider,
    raw,
  };
}

/**
 * Resolve URL stream HLS untuk satu episode.
 * @param {string} provider
 * @param {string} id - drama id
 * @param {number} ep - nomor episode (mulai dari 1)
 * @returns {{ videoUrl, locked, episodeNumber, qualityList }}
 */
async function stream(provider, id, ep = 1) {
  const raw = await fetchJSON(
    `${BASE}/api/${provider}/watch/?id=${id}&ep=${ep}`
  );

  if (raw.code !== 200 && !raw.videoUrl) {
    throw new Error(raw.msg ?? raw.message ?? "Gagal mengambil stream");
  }

  return {
    videoUrl: raw.videoUrl ?? "",
    locked: raw.locked ?? false,
    episodeNumber: raw.episodeNumber ?? ep,
    qualityList: raw.qualityList ?? [],
  };
}

/**
 * Drama trending (20 item).
 * @param {string} provider
 */
async function trending(provider) {
  const raw = await fetchJSON(`${BASE}/api/${provider}/trending/`);
  const list = Array.isArray(raw) ? raw : (raw.items ?? []);
  return list.map((d) => normalizeSearchItem(d, provider));
}

/**
 * Drama terbaru (20 item).
 * @param {string} provider
 */
async function latest(provider) {
  const raw = await fetchJSON(`${BASE}/api/${provider}/latest/`);
  const list = Array.isArray(raw) ? raw : (raw.items ?? []);
  return list.map((d) => normalizeSearchItem(d, provider));
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
 * Drama VIP (khusus konten premium/berbayar).
 * @param {string} provider
 */
async function vip(provider) {
  const raw = await fetchJSON(`${BASE}/api/${provider}/vip/`);
  const list = Array.isArray(raw) ? raw : (raw.items ?? []);
  return list.map((d) => normalizeSearchItem(d, provider));
}

/**
 * Drama sulih suara Indonesia (dubbing).
 * @param {string} provider
 */
async function dubindo(provider) {
  const raw = await fetchJSON(`${BASE}/api/${provider}/dubindo/`);
  const list = Array.isArray(raw) ? raw : (raw.items ?? []);
  return list.map((d) => normalizeSearchItem(d, provider));
}

/**
 * Feed rekomendasi "for you", dengan pagination.
 * @param {string} provider
 * @param {number} page - mulai dari 1
 * @returns {{ items, page, perPage, total, hasMore }}
 */
async function foryou(provider, page = 1) {
  const raw = await fetchJSON(`${BASE}/api/${provider}/foryou/?page=${Number(page) || 1}`);
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
 * Status semua provider dari endpoint notifications.
 */
async function notifications() {
  try {
    const raw = await fetchJSON(`${BASE}/api/notifications/`);
    return raw?.notifications ?? [];
  } catch {
    return [];
  }
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

module.exports = { search, detail, stream, browse, trending, latest, vip, dubindo, foryou, notifications };
