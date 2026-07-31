/**
 * Adapter untuk platform: PineDrama (via priv-api.anichin.bio)
 *
 * BASE: https://priv-api.anichin.bio/api/pinedrama/{action}?...&lang=id&api_key=KEY
 * Video: MP4 langsung dari TikTok CDN — streamType:"mp4"
 */

const { fetchJSON } = require("../fetcher");

const BASE = "https://priv-api.anichin.bio/api";
const PROVIDER_ID = "pinedrama";

function apiKey() {
  const key = process.env.ANICHIN_API_KEY;
  if (!key) throw new Error("ANICHIN_API_KEY belum diset — tidak bisa memanggil API PineDrama");
  return key;
}

function buildUrl(action, params = {}, lang = "id") {
  const qs = new URLSearchParams({ ...params, lang, api_key: apiKey() });
  return `${BASE}/${PROVIDER_ID}/${action}?${qs.toString()}`;
}

function hlsManifestUrl() {
  throw new Error("PineDrama menggunakan MP4 langsung — tidak ada HLS manifest. Gunakan /api/watch.");
}

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

async function search(q, provider, lang = "id") {
  if (!q || q.trim().length < 2) return [];
  const raw = await fetchJSON(buildUrl("search", { q, page: 1, count: 20 }, lang));
  const list = Array.isArray(raw) ? raw : (raw.items ?? []);
  return list.map((d) => normalizeItem(d, provider || PROVIDER_ID));
}

async function trending(provider, lang = "id") {
  const raw = await fetchJSON(buildUrl("trending", { page: 1, count: 15 }, lang));
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
  const raw = await fetchJSON(buildUrl("foryou", { page: Number(page) || 1, count: 15 }, lang));
  const list = Array.isArray(raw) ? raw : (raw.items ?? []);
  return {
    items: list.map((d) => normalizeItem(d, provider || PROVIDER_ID)),
    page: raw.page ?? Number(page),
    perPage: raw.perPage ?? list.length,
    total: raw.total ?? list.length,
    hasMore: raw.hasMore ?? false,
  };
}

async function languages() {
  const raw = await fetchJSON(buildUrl("languages"));
  return {
    default: raw?.default ?? "id",
    languages: raw?.languages ?? [],
  };
}

async function allepisode(provider, id, lang = "id") {
  const raw = await fetchJSON(buildUrl("allepisode", { id }, lang));
  const episodes = Array.isArray(raw.episodes)
    ? raw.episodes.map((e) => ({
        number: Number(e.number ?? 0),
        title: e.title ?? `Episode ${e.number}`,
        locked: Boolean(e.locked),
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

async function detail(provider, id, lang = "id") {
  const [info, eps] = await Promise.all([
    fetchJSON(buildUrl("detail", { id }, lang)),
    allepisode(provider, id, lang).catch(() => ({ episodes: [], totalEpisodes: 0 })),
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

async function subtitles() { return []; }

async function stream(provider, id, ep = 1) {
  const eps = await allepisode(provider, id).catch(() => ({ episodes: [] }));
  const found = eps.episodes.find((e) => e.number === Number(ep));
  if (found?.locked) {
    return { videoUrl: "", locked: true, episodeNumber: Number(ep), qualityList: [], streamType: "mp4" };
  }
  const raw = await fetchJSON(buildUrl("episode", { id, ep: Number(ep) }));
  return {
    videoUrl: raw.videoUrl ?? "",
    locked: Boolean(raw.locked),
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
