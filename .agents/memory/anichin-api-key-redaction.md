---
name: Anichin API real upstream + key redaction
description: Real DramaBox data source is priv-api.anichin.bio (not shortdramavid.xyz), auth via api_key query param; error paths must redact secrets before reaching clients.
---

The actual upstream for the "shortdramavid" DramaBox provider is `https://priv-api.anichin.bio/api/{provider}/{action}`, authenticated via an `api_key` query param (stored as the `ANICHIN_API_KEY` Replit secret). shortdramavid.xyz is just a thin wrapper around this API with no added value and its own rate limiting.

**Why:** the user provided the real base URL and key directly; probing confirmed shortdramavid.xyz's endpoints (languages/allepisode/subtitles/hls) 404 to a SPA shell there but work fine against priv-api.anichin.bio directly. The "watch" action name doesn't exist on the real API — the correct action is "hls", which returns a raw .m3u8 manifest (not JSON).

**How to apply:** Any code path that builds a URL containing `api_key` (or other secret-like query params) must never let that raw URL leak into an error message, log line returned to the client, or JSON response. Centralize redaction (regex on `?&api_key=...`) in both the low-level fetch helper (fetcher.js) and every server route's catch block — a single missed catch block (e.g. a proxy route) is enough to leak the key. The manifest-fetch step (which needs the key) must happen server-side only; the resulting segment URLs it returns are key-free and safe to hand to the browser via a separate public proxy.
