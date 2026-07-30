/**
 * HTTP fetch utility dengan:
 * - Auto retry (3x) pada error jaringan & HTTP 5xx
 * - TIDAK retry HTTP 4xx — error permanen, tidak ada gunanya coba ulang
 * - Timeout configurable
 * - Header browser standar agar tidak diblokir
 */

const fetch = require("node-fetch");

const DEFAULT_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36",
  Accept: "application/json, text/plain, */*",
  "Accept-Language": "id-ID,id;q=0.9,en-US;q=0.8",
};

/**
 * Buang query string sensitif (api_key, token, dst) dari URL sebelum
 * dipakai di pesan error — pesan error ini bisa saja diteruskan ke
 * client (lihat server.js `fail()`), jadi TIDAK BOLEH pernah membawa
 * secret apa pun.
 */
function redactUrl(url) {
  try {
    const u = new URL(url);
    for (const key of u.searchParams.keys()) {
      if (/key|token|secret|password/i.test(key)) {
        u.searchParams.set(key, "***");
      }
    }
    return u.toString();
  } catch {
    return "[url tidak valid]";
  }
}

async function fetchJSON(url, options = {}) {
  const { retries = 3, timeoutMs = 12000, headers = {} } = options;
  const safeUrl = redactUrl(url);

  for (let attempt = 1; attempt <= retries; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const res = await fetch(url, {
        signal: controller.signal,
        headers: { ...DEFAULT_HEADERS, ...headers },
      });

      clearTimeout(timer);

      if (!res.ok) {
        const err = new Error(`HTTP ${res.status} — ${safeUrl}`);
        // 4xx = error permanen (bad request, auth gagal, not found) — jangan retry,
        // langsung lempar supaya upstream tidak dibebani request ulang yang sia-sia.
        if (res.status >= 400 && res.status < 500) throw err;
        // 5xx = mungkin sementara — boleh retry
        if (attempt === retries) throw err;
        await new Promise((r) => setTimeout(r, attempt * 500));
        continue;
      }

      const text = await res.text();
      try {
        return JSON.parse(text);
      } catch {
        // Response bukan JSON = bukan error sementara — jangan retry
        throw new Error(`Response bukan JSON dari ${safeUrl}: ${text.slice(0, 100)}`);
      }
    } catch (err) {
      clearTimeout(timer);
      const msg = String(err.message ?? err);
      // Error permanen (4xx atau non-JSON): langsung re-throw tanpa retry
      const isPermanent = /^HTTP 4\d\d —|^Response bukan JSON/.test(msg);
      if (isPermanent || attempt === retries) {
        throw new Error(msg.split(url).join(safeUrl));
      }
      // Error jaringan / timeout / 5xx → tunggu lalu retry
      await new Promise((r) => setTimeout(r, attempt * 500));
    }
  }
}

module.exports = { fetchJSON, redactUrl };
