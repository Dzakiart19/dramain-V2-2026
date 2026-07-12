const express = require("express");
const path = require("path");
const fetch = require("node-fetch");
const { PLATFORMS, DEFAULT_PLATFORM } = require("./lib/config");

const app = express();
const PORT = process.env.PORT || 5000;

app.use(express.json());

// CORS — izinkan Firebase Hosting (dan semua origin) mengakses API & HLS proxy.
// Api key tidak pernah sampai ke client (lihat route hls-stream & hls-proxy).
app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.sendStatus(204);
  next();
});

app.use(express.static(path.join(__dirname, "public")));

// ─── Load adapter per platform ─────────────────────────────────────────────
const adapters = {};
for (const [key, cfg] of Object.entries(PLATFORMS)) {
  adapters[key] = require(path.join(__dirname, cfg.adapterPath));
}

function getAdapter(platform = DEFAULT_PLATFORM, provider = null) {
  const cfg = PLATFORMS[platform];
  if (!cfg) {
    const e = new Error(`Platform tidak ditemukan: ${platform}`);
    e.statusCode = 400;
    throw e;
  }
  if (provider !== null) {
    const valid = cfg.providers.some((p) => p.id === provider);
    if (!valid) {
      const e = new Error(`Provider tidak dikenal untuk platform ${platform}: ${provider}`);
      e.statusCode = 400;
      throw e;
    }
  }
  return adapters[platform];
}

// ─── Helper ────────────────────────────────────────────────────────────────
function ok(res, data) {
  res.json({ ok: true, data });
}
// Buang query string sensitif (api_key, token, dst) dari pesan error
// sebelum diteruskan ke client — pesan error upstream bisa saja memuat
// URL asli lengkap dengan secret.
function redactSecrets(msg) {
  return String(msg).replace(/([?&](?:api_key|token|secret|password)=)[^&\s"]+/gi, "$1***");
}

function fail(res, err, status = 500) {
  const rawMsg = err?.message ?? String(err);
  // Gunakan statusCode dari error (mis: 400 untuk input tidak valid) jika tersedia
  const httpStatus = err?.statusCode ?? status;
  // Redact sebelum log — pesan upstream bisa memuat URL dengan api_key
  console.error("[API Error]", redactSecrets(rawMsg));
  res.status(httpStatus).json({ ok: false, error: redactSecrets(rawMsg) });
}

// ─── Routes ───────────────────────────────────────────────────────────────

// GET /api/config — daftar platform & provider tersedia
app.get("/api/config", (req, res) => {
  const out = Object.values(PLATFORMS).map((p) => ({
    id: p.id,
    label: p.label,
    providers: p.providers,
  }));
  ok(res, out);
});

// GET /api/search?q=QUERY&provider=PROVIDER&platform=PLATFORM
app.get("/api/search", async (req, res) => {
  const { q, provider, platform = DEFAULT_PLATFORM } = req.query;
  if (!q) return fail(res, "Parameter q wajib diisi", 400);
  try {
    const adapter = getAdapter(platform, provider || null);
    const results = await adapter.search(q, provider || null);
    ok(res, results);
  } catch (err) {
    fail(res, err);
  }
});

// GET /api/drama/:provider/:id?platform=PLATFORM
app.get("/api/drama/:provider/:id", async (req, res) => {
  const { provider, id } = req.params;
  const { platform = DEFAULT_PLATFORM } = req.query;
  try {
    const adapter = getAdapter(platform, provider);
    const data = await adapter.detail(provider, id);
    ok(res, data);
  } catch (err) {
    fail(res, err);
  }
});

// GET /api/watch/:provider/:id?ep=N&platform=PLATFORM
// adapter.stream() sudah mengembalikan videoUrl berupa route internal
// (/api/hls-stream/...) — api_key upstream tidak pernah sampai ke client.
app.get("/api/watch/:provider/:id", async (req, res) => {
  const { provider, id } = req.params;
  const { ep = 1, platform = DEFAULT_PLATFORM } = req.query;
  try {
    const adapter = getAdapter(platform, provider);
    const data = await adapter.stream(provider, id, Number(ep));
    ok(res, data);
  } catch (err) {
    fail(res, err);
  }
});

// GET /api/hls-stream/:provider/:id?ep=N&platform=PLATFORM
// Fetch manifest .m3u8 asli dari upstream (butuh api_key, server-side saja),
// lalu rewrite setiap baris URL segmen ke /hls-proxy?url=... (segmen tidak
// butuh api_key, jadi aman diteruskan ke client).
app.get("/api/hls-stream/:provider/:id", async (req, res) => {
  const { provider, id } = req.params;
  const { ep = 1, platform = DEFAULT_PLATFORM } = req.query;
  try {
    const adapter = getAdapter(platform, provider);
    // await diperlukan: hlsManifestUrl() bisa async (contoh: GoodShort perlu fetch
    // episode dulu untuk mendapat chapterId). Untuk adapter sync (DramaBox) tidak ada efek.
    const manifestUrl = await adapter.hlsManifestUrl(provider, id, Number(ep));

    const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/138.0.0.0 Safari/537.36";
    // fetchWithValidatedRedirects: manifestUrl (priv-api.anichin.bio, host
    // pertama yang selalu diizinkan) bisa meredirect ke CDN (mis. ReelShort →
    // v-mps.crazymaplestudios.com) — setiap hop divalidasi ulang terhadap
    // SSRF guard + allowlist, bukan cuma host awal.
    const upstream = await fetchWithValidatedRedirects(manifestUrl, { headers: { "User-Agent": UA } });

    if (!upstream.ok) {
      return res.status(upstream.status).send(`Upstream error: ${upstream.status}`);
    }

    const text = await upstream.text();
    // upstream.url = URL akhir setelah redirect (mis. ReelShort me-302 dari
    // /api/reelshort/hls ke domain CDN v-mps.crazymaplestudios.com). Dipakai
    // sebagai base untuk resolve baris segmen yang RELATIF (ReelShort) — beda
    // dari ShortMax/GoodShort yang segmennya sudah URL absolut.
    const manifestBase = upstream.url || manifestUrl;
    const rewriteUri = (uri) => {
      let absolute = uri;
      if (!uri.startsWith("http://") && !uri.startsWith("https://")) {
        try { absolute = new URL(uri, manifestBase).toString(); } catch { return uri; }
      }
      return `/hls-proxy?url=${encodeURIComponent(absolute)}`;
    };
    const rewritten = text.split("\n").map((rawLine) => {
      const line = rawLine.trim();
      if (!line) return rawLine;
      // Tag dengan atribut URI= (mis. #EXT-X-KEY, #EXT-X-MAP) — rewrite URI
      // di dalam tanda kutip, konsisten dengan logika yang sama di /hls-proxy.
      if (line.startsWith("#")) {
        return line.replace(/URI="([^"]+)"/, (m, uri) => `URI="${rewriteUri(uri)}"`);
      }
      // Baris non-comment = URI segmen/child playlist
      return rewriteUri(line);
    }).join("\n");

    res.setHeader("Content-Type", "application/vnd.apple.mpegurl");
    res.setHeader("Cache-Control", "no-store");
    res.send(rewritten);
  } catch (err) {
    console.error("[HLS Stream Error]", redactSecrets(err.message));
    res.status(err.statusCode || 500).send("Gagal memuat manifest: " + redactSecrets(err.message ?? String(err)));
  }
});

// GET /api/languages/:provider?platform=PLATFORM
app.get("/api/languages/:provider", async (req, res) => {
  const { provider } = req.params;
  const { platform = DEFAULT_PLATFORM } = req.query;
  try {
    const adapter = getAdapter(platform, provider);
    const data = await adapter.languages(provider);
    ok(res, data);
  } catch (err) {
    fail(res, err);
  }
});

// GET /api/allepisode/:provider/:id?platform=PLATFORM
app.get("/api/allepisode/:provider/:id", async (req, res) => {
  const { provider, id } = req.params;
  const { platform = DEFAULT_PLATFORM } = req.query;
  try {
    const adapter = getAdapter(platform, provider);
    const data = await adapter.allepisode(provider, id);
    ok(res, data);
  } catch (err) {
    fail(res, err);
  }
});

// GET /api/subtitles/:provider/:id?ep=N&platform=PLATFORM
app.get("/api/subtitles/:provider/:id", async (req, res) => {
  const { provider, id } = req.params;
  const { ep = 1, platform = DEFAULT_PLATFORM } = req.query;
  try {
    const adapter = getAdapter(platform, provider);
    const data = await adapter.subtitles(provider, id, Number(ep));
    ok(res, data);
  } catch (err) {
    fail(res, err);
  }
});

// Daftar hostname CDN yang diizinkan oleh /hls-proxy.
// Tambah entry baru di sini jika platform baru memakai CDN berbeda.
const HLS_ALLOWED_HOSTS = new Set([
  "priv-api.anichin.bio",
  // CDN TikTok (PineDrama) — semua sub-domain *.tiktokcdn.com & *.tiktokv.com
  "v3.goodshort.com",              // CDN segmen HLS GoodShort
  "akamai-static.shorttv.live",    // CDN segmen HLS ShortMax
  "v-mps.crazymaplestudios.com",   // CDN segmen HLS ReelShort
  "cdn-video.miniepisode.media",   // CDN manifest & segmen HLS DramaBite
]);

// CDN DramaWave — semua sub-domain *.mydramawave.com (video-v1..vN, static-v1, dst)

function isAllowedProxyHost(hostname) {
  if (HLS_ALLOWED_HOSTS.has(hostname)) return true;
  // CDN DramaBox — semua sub-domain *.dramaboxdb.com (mis: hwzthls.dramaboxdb.com)
  if (hostname.endsWith(".dramaboxdb.com")) return true;
  // CDN DramaWave — semua sub-domain *.mydramawave.com (video-v1..vN, static-v1, dst)
  if (hostname.endsWith(".mydramawave.com")) return true;
  // Izinkan seluruh sub-domain TikTok CDN (PineDrama)
  if (hostname.endsWith(".tiktokcdn.com")) return true;
  if (hostname.endsWith(".tiktokv.com"))   return true;
  if (hostname.endsWith(".tiktokcdn-us.com")) return true;
  return false;
}

// Blokir target yang mengarah ke jaringan internal (SSRF guard).
function isPrivateHost(hostname) {
  // localhost & loopback
  if (hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1") return true;
  // Private IPv4 ranges: 10/8, 172.16/12, 192.168/16, 169.254/16
  const v4 = hostname.match(/^(\d+)\.(\d+)/);
  if (v4) {
    const [, a, b] = v4.map(Number);
    if (a === 10) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 169 && b === 254) return true;
    if (a === 0) return true;
  }
  return false;
}

// Validasi satu URL target terhadap proteksi SSRF + allowlist CDN.
// Dipakai untuk validasi awal DAN untuk revalidasi setiap hop redirect
// (lihat fetchWithValidatedRedirects) — tanpa ini, host allowlist bisa
// dibypass jika sebuah host yang diizinkan meredirect ke host lain.
function validateProxyTarget(target) {
  if (target.protocol !== "https:" && target.protocol !== "http:") {
    return "Protokol tidak diizinkan";
  }
  if (isPrivateHost(target.hostname)) {
    return "Host tidak diizinkan";
  }
  if (!isAllowedProxyHost(target.hostname)) {
    console.warn("[HLS Proxy] Host ditolak:", target.hostname);
    return "Host tidak diizinkan";
  }
  return null;
}

// fetch() dengan redirect:'manual' + validasi ulang SSRF/allowlist di SETIAP
// hop redirect. Mencegah host yang lolos allowlist awal (mis. CDN resmi)
// meredirect ke host privat/asing yang seharusnya diblokir.
async function fetchWithValidatedRedirects(startUrl, options = {}, maxRedirects = 5) {
  let current = startUrl;
  for (let i = 0; i <= maxRedirects; i++) {
    const target = new URL(current);
    const err = validateProxyTarget(target);
    if (err) throw Object.assign(new Error(err), { statusCode: 403 });

    const res = await fetch(target.toString(), { ...options, redirect: "manual" });
    const isRedirect = res.status >= 300 && res.status < 400 && res.headers.get("location");
    if (!isRedirect) return res;

    current = new URL(res.headers.get("location"), target).toString();
  }
  throw Object.assign(new Error("Terlalu banyak redirect"), { statusCode: 502 });
}

// GET /hls-proxy?url=ENCODED_URL — relay HLS manifest & segments via server
// Menghindari CORS block browser saat fetch dari domain eksternal
app.get("/hls-proxy", async (req, res) => {
  const { url } = req.query;
  if (!url) return res.status(400).send("Missing url param");

  let target;
  try { target = new URL(url); } catch {
    return res.status(400).send("URL tidak valid");
  }

  const validationError = validateProxyTarget(target);
  if (validationError) {
    return res.status(403).send(validationError);
  }

  const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/138.0.0.0 Safari/537.36";

  try {
    const upstream = await fetchWithValidatedRedirects(target.toString(), {
      headers: { "User-Agent": UA },
    });

    if (!upstream.ok) {
      return res.status(upstream.status).send(`Upstream error: ${upstream.status}`);
    }

    const contentType = upstream.headers.get("content-type") || "";
    const isM3U8 = contentType.includes("mpegurl") || target.pathname.endsWith(".m3u8");

    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Cache-Control", "public, max-age=60");

    if (isM3U8) {
      res.setHeader("Content-Type", "application/vnd.apple.mpegurl");
      const text = await upstream.text();
      // upstream.url = URL akhir setelah redirect. Sama seperti route
      // /api/hls-stream: rewrite baris URI (segmen ATAU child playlist di
      // master playlist) yang relatif dengan resolve terhadap base ini dulu,
      // supaya nested/master playlist (mis. ReelShort atau provider masa
      // depan yang pakai path relatif) tetap ter-proxy dengan benar.
      const manifestBase = upstream.url || target.toString();
      const rewriteUri = (uri) => {
        let absolute = uri;
        if (!uri.startsWith("http://") && !uri.startsWith("https://")) {
          try { absolute = new URL(uri, manifestBase).toString(); } catch { return uri; }
        }
        return `/hls-proxy?url=${encodeURIComponent(absolute)}`;
      };
      const rewritten = text.split("\n").map((rawLine) => {
        const line = rawLine.trim();
        if (!line) return rawLine;
        // Tag dengan atribut URI= (mis. #EXT-X-KEY, #EXT-X-MAP, #EXT-X-MEDIA,
        // #EXT-X-I-FRAME-STREAM-INF) — rewrite URI di dalam tanda kutip, jangan
        // sentuh tag lain.
        if (line.startsWith("#")) {
          return line.replace(/URI="([^"]+)"/, (m, uri) => `URI="${rewriteUri(uri)}"`);
        }
        // Baris non-comment = URI segmen/child playlist
        return rewriteUri(line);
      }).join("\n");
      return res.send(rewritten);
    }

    // Segment .ts — relay binary
    const isTS = target.pathname.endsWith(".ts") || contentType.includes("video") || contentType.includes("octet");
    if (isTS) res.setHeader("Content-Type", "video/mp2t");
    else res.setHeader("Content-Type", contentType);

    upstream.body.on("error", (streamErr) => {
      console.error("[HLS Proxy] Stream error:", streamErr.message);
      if (!res.headersSent) res.status(500).send("Stream error");
      else res.destroy();
    });
    upstream.body.pipe(res);
  } catch (err) {
    console.error("[HLS Proxy Error]", redactSecrets(err.message));
    res.status(err.statusCode || 500).send("Proxy error: " + redactSecrets(err.message ?? String(err)));
  }
});

// GET /api/browse/:provider?platform=PLATFORM — trending + latest gabungan
app.get("/api/browse/:provider", async (req, res) => {
  const { provider } = req.params;
  const { platform = DEFAULT_PLATFORM } = req.query;
  try {
    const adapter = getAdapter(platform, provider);
    const data = await adapter.browse(provider);
    ok(res, data);
  } catch (err) {
    fail(res, err);
  }
});

// GET /api/trending/:provider?platform=PLATFORM
app.get("/api/trending/:provider", async (req, res) => {
  const { provider } = req.params;
  const { platform = DEFAULT_PLATFORM } = req.query;
  try {
    const adapter = getAdapter(platform, provider);
    const data = await adapter.trending(provider);
    ok(res, data);
  } catch (err) {
    fail(res, err);
  }
});

// GET /api/latest/:provider?platform=PLATFORM
app.get("/api/latest/:provider", async (req, res) => {
  const { provider } = req.params;
  const { platform = DEFAULT_PLATFORM } = req.query;
  try {
    const adapter = getAdapter(platform, provider);
    const data = await adapter.latest(provider);
    ok(res, data);
  } catch (err) {
    fail(res, err);
  }
});

// GET /api/more/:provider?q=QUERY&platform=PLATFORM — cari lebih banyak via search
app.get("/api/more/:provider", async (req, res) => {
  const { provider } = req.params;
  const { q = "love", platform = DEFAULT_PLATFORM } = req.query;
  try {
    const adapter = getAdapter(platform, provider);
    const data = await adapter.search(q, provider);
    ok(res, data);
  } catch (err) {
    fail(res, err);
  }
});

// GET /api/vip/:provider?platform=PLATFORM
app.get("/api/vip/:provider", async (req, res) => {
  const { provider } = req.params;
  const { platform = DEFAULT_PLATFORM } = req.query;
  try {
    const adapter = getAdapter(platform, provider);
    const data = await adapter.vip(provider);
    ok(res, data);
  } catch (err) {
    fail(res, err);
  }
});

// GET /api/dubindo/:provider?platform=PLATFORM
app.get("/api/dubindo/:provider", async (req, res) => {
  const { provider } = req.params;
  const { platform = DEFAULT_PLATFORM } = req.query;
  try {
    const adapter = getAdapter(platform, provider);
    const data = await adapter.dubindo(provider);
    ok(res, data);
  } catch (err) {
    fail(res, err);
  }
});

// GET /api/foryou/:provider?page=1&platform=PLATFORM
app.get("/api/foryou/:provider", async (req, res) => {
  const { provider } = req.params;
  const { page = 1, platform = DEFAULT_PLATFORM } = req.query;
  try {
    const adapter = getAdapter(platform, provider);
    const data = await adapter.foryou(provider, Number(page));
    ok(res, data);
  } catch (err) {
    fail(res, err);
  }
});

// GET /api/ad-popup-target — resolve VAST wrapper ExoClick SERVER-SIDE.
// Kedua zone VAST (5972886, 5972892) ternyata bukan video asli, melainkan
// <Wrapper> yang isinya redirect ke popup/landing page pihak ketiga —
// diperlakukan sebagai "direct link" (lihat public/js/ads.js). Resolusi
// dilakukan di backend (bukan fetch langsung dari browser client) karena
// domain iklan seperti magsrv.com sering diblokir oleh ad-blocker/browser
// mobile di sisi client — request server-to-server tidak terkena blokir itu.
const AD_VAST_ZONES = [
  "https://s.magsrv.com/v1/vast.php?idz=5972886",
  "https://s.magsrv.com/v1/vast.php?idzone=5972892",
];

app.get("/api/ad-popup-target", async (req, res) => {
  const zone = AD_VAST_ZONES[Math.floor(Math.random() * AD_VAST_ZONES.length)];
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 6000);
    let xml;
    try {
      const upstream = await fetch(zone, { signal: controller.signal });
      if (!upstream.ok) return ok(res, { target: null });
      xml = await upstream.text();
    } finally {
      clearTimeout(timer);
    }

    // Fire semua tracking pixel <Impression> server-side — tidak bergantung
    // client, tidak bisa diblokir ad-blocker browser, dan tidak pernah
    // memblokir response ke client (fire-and-forget, tanpa await).
    for (const m of xml.matchAll(/<Impression[^>]*>\s*<!\[CDATA\[(.*?)\]\]>\s*<\/Impression>/gs)) {
      fetch(m[1].trim()).catch(() => {});
    }

    const wrapperMatch = xml.match(/<VASTAdTagURI>\s*<!\[CDATA\[(.*?)\]\]>\s*<\/VASTAdTagURI>/s);
    const clickMatch = xml.match(/<ClickThrough[^>]*>\s*<!\[CDATA\[(.*?)\]\]>\s*<\/ClickThrough>/s);
    const target = wrapperMatch?.[1]?.trim() || clickMatch?.[1]?.trim() || null;
    ok(res, { target });
  } catch (err) {
    // Gagal resolve (network/timeout) — jangan pernah error ke client,
    // cukup target:null supaya client menutup tab kosong dengan tenang.
    console.error("[Ad Popup Error]", redactSecrets(err.message));
    ok(res, { target: null });
  }
});

// GET /api/notifications?platform=PLATFORM
app.get("/api/notifications", async (req, res) => {
  const { platform = DEFAULT_PLATFORM } = req.query;
  try {
    const adapter = getAdapter(platform);
    const data = await adapter.notifications();
    ok(res, data);
  } catch (err) {
    fail(res, err);
  }
});

// ─── SPA fallback ─────────────────────────────────────────────────────────
app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// Saat dijalankan langsung (node server.js / npm start / workflow Replit),
// buka port seperti biasa. Saat file ini di-require dari tempat lain
// (misalnya functions/index.js untuk Firebase Cloud Functions), JANGAN
// listen — biarkan runtime pemanggil yang mengatur request/response.
if (require.main === module) {
  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Dramain Aja running on http://0.0.0.0:${PORT}`);
  });
}

module.exports = app;
