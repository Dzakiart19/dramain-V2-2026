/**
 * Adapter untuk platform: MoboReels (via priv-api.anichin.bio)
 *
 * BASE: https://priv-api.anichin.bio/api/moboreels/{action}?...&lang=id&api_key=KEY
 * Video: MP4 (CDN sign params expire — selalu fetch fresh)
 * Tidak ada endpoint allepisode terpisah — ambil dari detail.
 */

const { fetchJSON } = require("../fetcher");

const BASE = "https://priv-api.anichin.bio/api";
const PROVIDER_ID = "moboreels";

function apiKey() {
  const key = process.env.ANICHIN_API_KEY;
  if (!key) throw new Error("ANICHIN_API_KEY belum diset — tidak bisa memanggil API MoboReels");
  return key;
}

function buildUrl(action, params = {}, lang = "id") {
  const qs = new URLSearchParams({ ...params, lang, api_key: apiKey() });
  return `${BASE}/${PROVIDER_ID}/${action}?${qs.toString()}`;
}

function hlsManifestUrl() {
  throw new Error("MoboReels menggunakan MP4 langsung — tidak ada HLS manifest. Gunakan /api/watch.");
}

function normalizeItem(d, provider) {
  const epCount = typeof d.episodes === "number"
    ? d.episodes
    : (Array.isArray(d.episodes) ? d.episodes.length : Number(d.totalEpisodes ?? 0));
  return {
    id: String(d.id ?? ""),
    title: d.title ?? d.name ?? "Tanpa Judul",
    cover: d.cover ?? d.poster ?? d.thumbnail ?? "",
    provider,
    episodes: epCount,
    description: d.description ?? d.synopsis ?? "",
  };
}

async function languages() {
  const raw = await fetchJSON(buildUrl("languages"));
  return {
    default: raw?.default ?? "id",
    languages: Array.isArray(raw?.languages) ? raw.languages : [],
  };
}

async function trending(provider, lang = "id") {
  const raw = await fetchJSON(buildUrl("trending", {}, lang));
  const list = Array.isArray(raw) ? raw : (raw.items ?? []);
  return list.map((d) => normalizeItem(d, provider || PROVIDER_ID));
}

async function latest(provider, lang = "id") {
  const data = await foryou(provider, 1, lang);
  return data.items;
}

async function vip() { return []; }
async function dubindo() { return []; }

async function browse(provider, lang = "id") {
  const [t, f] = await Promise.all([trending(provider, lang), foryou(provider, 1, lang)]);
  const seen = new Set();
  return [...t, ...f.items].filter((d) => {
    if (seen.has(d.id)) return false;
    seen.add(d.id);
    return true;
  });
}

async function foryou(provider, page = 1, lang = "id") {
  const raw = await fetchJSON(buildUrl("foryou", { page: Number(page) || 1 }, lang));
  const list = Array.isArray(raw) ? raw : (raw.items ?? []);
  return {
    items: list.map((d) => normalizeItem(d, provider || PROVIDER_ID)),
    page: raw.page ?? Number(page),
    perPage: raw.perPage ?? list.length,
    total: raw.total ?? list.length,
    hasMore: raw.hasMore ?? false,
  };
}

async function search(q, provider, lang = "id") {
  if (!q || q.trim().length < 2) return [];
  const raw = await fetchJSON(buildUrl("search", { q, page: 1 }, lang));
  const list = Array.isArray(raw) ? raw : (raw.items ?? []);
  return list.map((d) => normalizeItem(d, provider || PROVIDER_ID));
}

async function allepisode(provider, id, lang = "id") {
  const raw = await fetchJSON(buildUrl("detail", { id }, lang));
  const rawEps = Array.isArray(raw.episodes) ? raw.episodes : [];
  const episodes = rawEps.map((e) => ({
    number: Number(e.number ?? 0),
    title: e.title ?? `Episode ${e.number}`,
    locked: Boolean(e.locked),
    duration: e.duration != null
      ? Number(e.duration)
      : (e.duration_ms != null ? Math.round(Number(e.duration_ms) / 1000) : 0),
  }));
  return {
    bookId: raw.id ?? id,
    bookName: raw.title ?? raw.name ?? "",
    cover: raw.cover ?? raw.poster ?? "",
    totalEpisodes: episodes.length,
    episodes,
  };
}

async function detail(provider, id, lang = "id") {
  const [info, eps] = await Promise.all([
    fetchJSON(buildUrl("detail", { id }, lang)),
    allepisode(provider, id, lang).catch(() => ({ episodes: [], totalEpisodes: 0, bookName: "", cover: "" })),
  ]);
  return {
    id: info.id ?? id,
    title: info.title ?? info.name ?? eps.bookName ?? "Tanpa Judul",
    cover: info.cover ?? info.poster ?? eps.cover ?? "",
    description: info.description ?? info.synopsis ?? "",
    totalEpisodes: eps.totalEpisodes || eps.episodes.length || 0,
    episodes: eps.episodes,
    provider,
  };
}

async function subtitles() { return []; }

async function stream(provider, id, ep = 1) {
  const raw = await fetchJSON(buildUrl("episode", { id, ep: Number(ep) }));
  if (raw.locked || !raw.videoUrl) {
    return {
      videoUrl: "",
      locked: true,
      episodeNumber: Number(raw.number ?? ep),
      qualityList: [],
      streamType: "mp4",
    };
  }
  return {
    videoUrl: raw.videoUrl,
    locked: false,
    episodeNumber: Number(raw.number ?? ep),
    qualityList: Array.isArray(raw.qualityList) ? raw.qualityList : [],
    streamType: "mp4",
  };
}

async function notifications() { return []; }

module.exports = {
  search, detail, allepisode, subtitles, languages, stream,
  browse, trending, latest, vip, dubindo, foryou, notifications, hlsManifestUrl,
};
