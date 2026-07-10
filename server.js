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
  console.error("[API Error]", rawMsg);
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
    const upstream = await fetch(manifestUrl, { headers: { "User-Agent": UA } });

    if (!upstream.ok) {
      return res.status(upstream.status).send(`Upstream error: ${upstream.status}`);
    }

    const text = await upstream.text();
    const rewritten = text.split("\n").map((line) => {
      line = line.trim();
      if (line.startsWith("http://") || line.startsWith("https://")) {
        return `/hls-proxy?url=${encodeURIComponent(line)}`;
      }
      return line;
    }).join("\n");

    res.setHeader("Content-Type", "application/vnd.apple.mpegurl");
    res.setHeader("Cache-Control", "no-store");
    res.send(rewritten);
  } catch (err) {
    console.error("[HLS Stream Error]", err.message);
    res.status(500).send("Gagal memuat manifest: " + redactSecrets(err.message ?? String(err)));
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
]);

function isAllowedProxyHost(hostname) {
  if (HLS_ALLOWED_HOSTS.has(hostname)) return true;
  // CDN DramaBox — semua sub-domain *.dramaboxdb.com (mis: hwzthls.dramaboxdb.com)
  if (hostname.endsWith(".dramaboxdb.com")) return true;
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

// GET /hls-proxy?url=ENCODED_URL — relay HLS manifest & segments via server
// Menghindari CORS block browser saat fetch dari domain eksternal
app.get("/hls-proxy", async (req, res) => {
  const { url } = req.query;
  if (!url) return res.status(400).send("Missing url param");

  let target;
  try { target = new URL(url); } catch {
    return res.status(400).send("URL tidak valid");
  }

  // Hanya izinkan http/https
  if (target.protocol !== "https:" && target.protocol !== "http:") {
    return res.status(400).send("Protokol tidak diizinkan");
  }

  // Blokir akses ke jaringan internal (SSRF)
  if (isPrivateHost(target.hostname)) {
    return res.status(403).send("Host tidak diizinkan");
  }

  // Allowlist CDN — hanya domain yang dikenal boleh diakses
  if (!isAllowedProxyHost(target.hostname)) {
    console.warn("[HLS Proxy] Host ditolak:", target.hostname);
    return res.status(403).send("Host tidak diizinkan");
  }

  const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/138.0.0.0 Safari/537.36";

  try {
    const upstream = await fetch(target.toString(), {
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
      // Rewrite setiap baris URL absolut (http/https) → /hls-proxy?url=...
      const rewritten = text.split("\n").map((line) => {
        line = line.trim();
        if (line.startsWith("http://") || line.startsWith("https://")) {
          return `/hls-proxy?url=${encodeURIComponent(line)}`;
        }
        return line;
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
    console.error("[HLS Proxy Error]", err.message);
    res.status(500).send("Proxy error: " + redactSecrets(err.message ?? String(err)));
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
