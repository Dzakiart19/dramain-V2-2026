/**
 * Adapter untuk platform: DramaBox (via priv-api.anichin.bio)
 *
 * API key WAJIB diisi lewat env var ANICHIN_API_KEY (Replit Secret),
 * TIDAK PERNAH di-hardcode di sini dan TIDAK PERNAH dikirim ke browser.
 */

const { fetchJSON } = require("../fetcher");

const BASE = "https://priv-api.anichin.bio/api";

function apiKey() {
  const key = process.env.ANICHIN_API_KEY;
  if (!key) throw new Error("ANICHIN_API_KEY belum diset — tidak bisa memanggil API DramaBox");
  return key;
}

function buildUrl(provider, action, params = {}, lang = "id") {
  const qs = new URLSearchParams({ ...params, lang, api_key: apiKey() });
  return `${BASE}/${provider}/${action}?${qs.toString()}`;
}

function hlsManifestUrl(provider, id, ep) {
  return buildUrl(provider, "hls", { id, ep });
}

async function search(q, provider, lang = "id") {
  if (!q || q.trim().length < 2 || !provider) return [];
  const raw = await fetchJSON(buildUrl(provider, "search", { q }, lang));
  const list = Array.isArray(raw) ? raw : (raw.items ?? []);
  return list.map((d) => normalizeSearchItem(d, provider));
}

async function detail(provider, id, lang = "id") {
  const [info, eps] = await Promise.all([
    fetchJSON(buildUrl(provider, "detail", { id }, lang)),
    allepisode(provider, id, lang).catch(() => ({ episodes: [], totalEpisodes: 0 })),
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

async function allepisode(provider, id, lang = "id") {
  const raw = await fetchJSON(buildUrl(provider, "allepisode", { id }, lang));
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

async function subtitles(provider, id, ep = 1, lang = "id") {
  const raw = await fetchJSON(buildUrl(provider, "subtitles", { id, ep }, lang));
  return raw?.subtitles ?? [];
}

async function languages(provider) {
  const raw = await fetchJSON(buildUrl(provider, "languages", {}));
  return {
    default: raw?.default ?? "id",
    languages: raw?.languages ?? [],
  };
}

async function checkEpisodeLock(provider, id, ep, lang = "id") {
  const eps = await allepisode(provider, id, lang);
  const found = eps.episodes.find((e) => e.number === Number(ep));
  return {
    locked: found ? found.locked : false,
    episodeNumber: Number(ep),
  };
}

async function trending(provider, lang = "id") {
  const raw = await fetchJSON(buildUrl(provider, "trending", {}, lang));
  const list = Array.isArray(raw) ? raw : (raw.items ?? []);
  return list.map((d) => normalizeSearchItem(d, provider));
}

async function latest(provider, lang = "id") {
  try {
    const raw = await fetchJSON(buildUrl(provider, "latest", {}, lang));
    const list = Array.isArray(raw) ? raw : (raw.items ?? []);
    return list.map((d) => normalizeSearchItem(d, provider));
  } catch {
    return (await foryou(provider, 1, lang)).items;
  }
}

async function browse(provider, lang = "id") {
  const [t, l] = await Promise.all([trending(provider, lang), latest(provider, lang)]);
  const seen = new Set();
  return [...t, ...l].filter((d) => {
    if (seen.has(d.id)) return false;
    seen.add(d.id);
    return true;
  });
}

async function vip(provider, lang = "id") {
  try {
    const raw = await fetchJSON(buildUrl(provider, "vip", {}, lang));
    const list = Array.isArray(raw) ? raw : (raw.items ?? []);
    return list.map((d) => normalizeSearchItem(d, provider));
  } catch {
    return [];
  }
}

async function dubindo(provider, lang = "id") {
  try {
    const raw = await fetchJSON(buildUrl(provider, "dubindo", {}, lang));
    const list = Array.isArray(raw) ? raw : (raw.items ?? []);
    return list.map((d) => normalizeSearchItem(d, provider));
  } catch {
    return [];
  }
}

async function foryou(provider, page = 1, lang = "id") {
  const raw = await fetchJSON(buildUrl(provider, "foryou", { page: Number(page) || 1 }, lang));
  const list = Array.isArray(raw) ? raw : (raw.items ?? []);
  return {
    items: list.map((d) => normalizeSearchItem(d, provider)),
    page: raw.page ?? (Number(page) || 1),
    perPage: raw.perPage ?? list.length,
    total: raw.total ?? list.length,
    hasMore: raw.hasMore ?? false,
  };
}

async function stream(provider, id, ep = 1) {
  const { locked, episodeNumber } = await checkEpisodeLock(provider, id, ep);
  return {
    videoUrl: locked ? "" : `/api/hls-stream/${provider}/${id}?ep=${episodeNumber}`,
    locked,
    episodeNumber,
    qualityList: [],
    streamType: "hls",
  };
}

async function notifications() {
  return [];
}

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
  search, detail, allepisode, subtitles, languages, stream,
  browse, trending, latest, vip, dubindo, foryou, notifications, hlsManifestUrl,
};
