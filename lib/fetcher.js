/**
 * HTTP fetch utility dengan:
 * - Auto retry (3x) pada error jaringan
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
        throw new Error(`HTTP ${res.status} — ${safeUrl}`);
      }

      const text = await res.text();
      try {
        return JSON.parse(text);
      } catch {
        throw new Error(`Response bukan JSON dari ${safeUrl}: ${text.slice(0, 100)}`);
      }
    } catch (err) {
      clearTimeout(timer);
      if (attempt === retries) {
        // Pastikan pesan error apa pun (termasuk error jaringan bawaan
        // node-fetch yang bisa memuat URL asli) tidak membawa URL mentah.
        const safeErr = new Error(String(err.message ?? err).split(url).join(safeUrl));
        throw safeErr;
      }
      await new Promise((r) => setTimeout(r, attempt * 500));
    }
  }
}

module.exports = { fetchJSON, redactUrl };
