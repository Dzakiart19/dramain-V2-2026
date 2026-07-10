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

async function fetchJSON(url, options = {}) {
  const { retries = 3, timeoutMs = 12000, headers = {} } = options;

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
        throw new Error(`HTTP ${res.status} — ${url}`);
      }

      const text = await res.text();
      try {
        return JSON.parse(text);
      } catch {
        throw new Error(`Response bukan JSON dari ${url}: ${text.slice(0, 100)}`);
      }
    } catch (err) {
      clearTimeout(timer);
      if (attempt === retries) throw err;
      await new Promise((r) => setTimeout(r, attempt * 500));
    }
  }
}

module.exports = { fetchJSON };
