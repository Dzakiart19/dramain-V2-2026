/**
 * Adapter untuk platform: iDrama (via priv-api.anichin.bio)
 *
 * BASE: https://priv-api.anichin.bio/api/idrama/{action}?...&lang=id&api_key=KEY
 *
 * API key SAMA dengan DramaBox/PineDrama — baca dari env var ANICHIN_API_KEY.
 *
 * Endpoint yang dikonfirmasi (recon langsung, 2026-07-10):
 *   GET /idrama/languages                        → Array<{ code, name }>
 *   GET /idrama/trending?page=N&lang=id          → { items, hasMore }
 *   GET /idrama/foryou?page=N&lang=id            → { items, hasMore }
 *   GET /idrama/search?q=Q&page=N&lang=id        → { items, hasMore }
 *   GET /idrama/detail?id=ID&lang=id             → { id, title, cover, description, tags,
 *                                                     episodes: [{ number, title, videoUrl,
 *                                                       locked, qualityList, subtitles }] }
 *   GET /idrama/episode?id=ID&ep=N&lang=id       → { number, videoUrl, locked, qualityList,
 *                                                     subtitles }
 *
 * PERBEDAAN PENTING vs DramaBox/PineDrama:
 * - Tidak ada endpoint terpisah `allepisode` — daftar episode lengkap (termasuk
 *   videoUrl per episode) sudah ikut di response `detail`. `allepisode()` di
 *   adapter ini reuse `detail` mentah, bukan endpoint baru.
 * - Tidak ada endpoint: latest, vip, dubindo → return [] (fallback graceful).
 * - `languages` mengembalikan array flat (bukan { default, languages }) →
 *   dinormalisasi di sini agar sesuai kontrak.
 * - Video HLS (.m3u8) di-host di CDN `v-a.idrama.video`, URL-nya di-sign per
 *   request (query `ts` + `secret`) dan TIDAK mengandung `api_key` kita →
 *   fine untuk diteruskan ke server (bukan browser) via route internal.
 *   URL ini expire, jadi TIDAK di-cache — selalu resolve ulang lewat
 *   `hlsManifestUrl()` setiap kali browser minta manifest.
 * - Manifest .m3u8 dari CDN ini memuat baris segmen `.ts` yang RELATIF
 *   (bukan absolut) — ditangani oleh `rewriteManifestLine()` di server.js
 *   yang me-resolve URL relatif terhadap manifest URL sebelum diproxy.
 * - `duration` per episode tidak disediakan upstream → selalu 0.
 */

const { fetchJSON } = require("../fetcher");

const BASE = "https://priv-api.anichin.bio/api";

function apiKey() {
  const key = process.env.ANICHIN_API_KEY;
  if (!key) throw new Error("ANICHIN_API_KEY belum diset — tidak bisa memanggil API iDrama");
  return key;
}

function buildUrl(provider, action, params = {}) {
  const qs = new URLSearchParams({ ...params, lang: "id", api_key: apiKey() });
  return `${BASE}/${provider}/${action}?${qs.toString()}`;
}

// ─── Normalizer ─────────────────────────────────────────────────────────────

function normalizeItem(d, provider) {
  const epCount = Array.isArray(d.episodes)
    ? d.episodes.length
    : Number(d.episodes ?? d.totalEpisodes ?? 0);
  return {
    id: String(d.id ?? ""),
    title: d.title ?? d.name ?? "Tanpa Judul",
    cover: d.cover ?? d.poster ?? d.thumbnail ?? "",
    provider,
    episodes: epCount,
    description: d.description ?? d.synopsis ?? "",
  };
}

function normalizeEpisode(e) {
  return {
    number: Number(e.number ?? 0),
    title: e.title ?? `Episode ${e.number ?? ""}`.trim(),
    locked: Boolean(e.locked),
    // Upstream iDrama tidak menyediakan durasi per episode.
    duration: 0,
  };
}

// ─── Search ──────────────────────────────────────────────────────────────────

async function search(q, provider) {
  if (!q || q.trim().length < 2 || !provider) return [];
  const raw = await fetchJSON(buildUrl(provider, "search", { q, page: 1 }));
  const list = Array.isArray(raw) ? raw : (raw.items ?? []);
  return list.map((d) => normalizeItem(d, provider));
}

// ─── Trending / Latest / VIP / DubIndo ───────────────────────────────────────

async function trending(provider) {
  const raw = await fetchJSON(buildUrl(provider, "trending", { page: 1 }));
  const list = Array.isArray(raw) ? raw : (raw.items ?? []);
  return list.map((d) => normalizeItem(d, provider));
}

/** iDrama tidak punya endpoint "latest" terpisah dari upstream. */
async function latest() { return []; }

/** Tidak ada konten VIP terpisah di iDrama. */
async function vip() { return []; }

/** Tidak ada konten dubbing Indonesia terpisah di iDrama. */
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
  const raw = await fetchJSON(buildUrl(provider, "foryou", { page: Number(page) || 1 }));
  const list = Array.isArray(raw) ? raw : (raw.items ?? []);
  return {
    items: list.map((d) => normalizeItem(d, provider)),
    page: raw.page ?? (Number(page) || 1),
    perPage: raw.perPage ?? list.length,
    total: raw.total ?? list.length,
    hasMore: raw.hasMore ?? false,
  };
}

// ─── Languages ───────────────────────────────────────────────────────────────

async function languages(provider) {
  const raw = await fetchJSON(buildUrl(provider, "languages"));
  // Upstream iDrama balikin array flat [{code,name}] — dinormalisasi ke
  // kontrak { default, languages } yang dipakai platform lain.
  const list = Array.isArray(raw) ? raw : (raw?.languages ?? []);
  return {
    default: "id",
    languages: list.map((l) => ({ code: l.code, label: l.name ?? l.label ?? l.code })),
  };
}

// ─── All Episodes ─────────────────────────────────────────────────────────────

/**
 * iDrama tidak punya endpoint allepisode terpisah — daftar episode lengkap
 * (dengan videoUrl per episode, tidak dipakai di sini karena bisa expire)
 * sudah ikut di response `detail`. Reuse fetch yang sama.
 */
async function rawDetail(provider, id) {
  return fetchJSON(buildUrl(provider, "detail", { id }));
}

async function allepisode(provider, id) {
  const raw = await rawDetail(provider, id);
  const episodes = Array.isArray(raw.episodes) ? raw.episodes.map(normalizeEpisode) : [];
  return {
    bookId: raw.id ?? id,
    bookName: raw.title ?? "",
    cover: raw.cover ?? "",
    totalEpisodes: episodes.length,
    episodes,
  };
}

// ─── Detail ──────────────────────────────────────────────────────────────────

async function detail(provider, id) {
  const raw = await rawDetail(provider, id);
  const episodes = Array.isArray(raw.episodes) ? raw.episodes.map(normalizeEpisode) : [];
  return {
    id: raw.id ?? id,
    title: raw.title ?? "Tanpa Judul",
    cover: raw.cover ?? "",
    description: raw.description ?? "",
    totalEpisodes: episodes.length,
    episodes,
    provider,
  };
}

// ─── Subtitles ────────────────────────────────────────────────────────────────

async function subtitles(provider, id, ep = 1) {
  const raw = await fetchJSON(buildUrl(provider, "episode", { id, ep: Number(ep) || 1 }));
  return Array.isArray(raw.subtitles) ? raw.subtitles : [];
}

// ─── Stream ───────────────────────────────────────────────────────────────────

/**
 * URL manifest HLS mentah (mengandung `secret` sign upstream, bukan
 * `api_key` kita) — HANYA dipakai server-side (lihat route /api/hls-stream
 * di server.js). Selalu fetch baru karena URL upstream expire (`ts`).
 * Async karena upstream idrama tidak punya pola URL statis seperti
 * DramaBox — manifest URL-nya dinamis, harus diambil dari /episode dulu.
 */
async function hlsManifestUrl(provider, id, ep) {
  const raw = await fetchJSON(buildUrl(provider, "episode", { id, ep: Number(ep) || 1 }));
  if (!raw.videoUrl) throw new Error("Video URL tidak tersedia dari upstream iDrama");
  return raw.videoUrl;
}

/**
 * Resolve status stream. videoUrl yang dikirim ke client SELALU path
 * internal /api/hls-stream (bukan URL v-a.idrama.video mentah), konsisten
 * dengan platform HLS lain — walau URL upstream di sini tidak membawa
 * api_key kita, tetap diproxy agar CORS & rewriting segmen relatif konsisten.
 * @returns {{ videoUrl, locked, episodeNumber, qualityList, streamType }}
 */
async function stream(provider, id, ep = 1) {
  const raw = await fetchJSON(buildUrl(provider, "episode", { id, ep: Number(ep) || 1 }));
  const locked = Boolean(raw.locked);
  return {
    videoUrl: locked ? "" : `/api/hls-stream/${provider}/${id}?ep=${Number(ep) || 1}`,
    locked,
    episodeNumber: Number(raw.number ?? ep),
    // Kosongkan qualityList — jangan kirim URL CDN v-a.idrama.video mentah
    // (dengan ts/secret sign) ke client, walau bukan api_key kita. Konsisten
    // dengan DramaBox: semua stream lewat route internal /api/hls-stream saja.
    qualityList: [],
    streamType: "hls",
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
