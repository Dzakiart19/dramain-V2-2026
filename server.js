const express = require("express");
const path = require("path");
const fetch = require("node-fetch");
const { PLATFORMS, DEFAULT_PLATFORM } = require("./lib/config");

const app = express();
const PORT = process.env.PORT || 5000;

app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

// ─── Load adapter per platform ─────────────────────────────────────────────
const adapters = {};
for (const [key, cfg] of Object.entries(PLATFORMS)) {
  adapters[key] = require(path.join(__dirname, cfg.adapterPath));
}

function getAdapter(platform = DEFAULT_PLATFORM) {
  const a = adapters[platform];
  if (!a) throw new Error(`Platform tidak ditemukan: ${platform}`);
  return a;
}

// ─── Helper ────────────────────────────────────────────────────────────────
function ok(res, data) {
  res.json({ ok: true, data });
}
function fail(res, err, status = 500) {
  const msg = err?.message ?? String(err);
  console.error("[API Error]", msg);
  res.status(status).json({ ok: false, error: msg });
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
    const adapter = getAdapter(platform);
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
    const adapter = getAdapter(platform);
    const data = await adapter.detail(provider, id);
    ok(res, data);
  } catch (err) {
    fail(res, err);
  }
});

// GET /api/watch/:provider/:id?ep=N&platform=PLATFORM
app.get("/api/watch/:provider/:id", async (req, res) => {
  const { provider, id } = req.params;
  const { ep = 1, platform = DEFAULT_PLATFORM } = req.query;
  try {
    const adapter = getAdapter(platform);
    const data = await adapter.stream(provider, id, Number(ep));
    if (data.videoUrl) {
      data.videoUrl = `/hls-proxy?url=${encodeURIComponent(data.videoUrl)}`;
    }
    ok(res, data);
  } catch (err) {
    fail(res, err);
  }
});

// GET /hls-proxy?url=ENCODED_URL — relay HLS manifest & segments via server
// Menghindari CORS block browser saat fetch dari domain eksternal
app.get("/hls-proxy", async (req, res) => {
  const { url } = req.query;
  if (!url) return res.status(400).send("Missing url param");

  let target;
  try { target = new URL(url); } catch {
    return res.status(400).send("URL tidak valid");
  }

  const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/138.0.0.0 Safari/537.36";

  try {
    const upstream = await fetch(target.toString(), {
      headers: { "User-Agent": UA, "Referer": "https://www.shortdramavid.xyz/" },
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

    upstream.body.pipe(res);
  } catch (err) {
    console.error("[HLS Proxy Error]", err.message);
    res.status(500).send("Proxy error: " + err.message);
  }
});

// GET /api/browse/:provider?platform=PLATFORM — trending + latest gabungan
app.get("/api/browse/:provider", async (req, res) => {
  const { provider } = req.params;
  const { platform = DEFAULT_PLATFORM } = req.query;
  try {
    const adapter = getAdapter(platform);
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
    const adapter = getAdapter(platform);
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
    const adapter = getAdapter(platform);
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
    const adapter = getAdapter(platform);
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
    const adapter = getAdapter(platform);
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
    const adapter = getAdapter(platform);
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
    const adapter = getAdapter(platform);
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

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Drama Stream running on http://0.0.0.0:${PORT}`);
});
