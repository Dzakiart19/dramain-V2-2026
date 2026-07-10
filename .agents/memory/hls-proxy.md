---
name: HLS Proxy
description: Solusi CORS dan MSE restriction untuk HLS streaming di Replit
---

# HLS Proxy — Pattern dan Limitasi

## Masalah
- HLS stream dari CDN upstream di-block CORS oleh browser
- Replit preview iframe membatasi MediaSource Extensions (MSE) — `bufferIncompatibleCodecsError`
- Error ini **spesifik untuk iframe Replit preview**, bukan di browser nyata

## Solusi Yang Diimplementasi
Route `/hls-proxy?url=ENCODED_URL` di Express:
1. Fetch URL target via server (bypass CORS)
2. Jika `.m3u8`: rewrite semua URL absolut dalam file → `/hls-proxy?url=...`
3. Jika `.ts`: relay binary via `upstream.body.pipe(res)`
4. Set `Access-Control-Allow-Origin: *`

`/api/hls-stream/:provider/:id` mengambil manifest upstream server-side via
`await adapter.hlsManifestUrl(...)`, lalu mengembalikan manifest yang sudah
di-rewrite ke client — api_key tidak pernah sampai ke browser.

## CDN Allowlist (HLS_ALLOWED_HOSTS di server.js)
Host yang diizinkan di `/hls-proxy`:
- `priv-api.anichin.bio`
- `*.dramaboxdb.com` (DramaBox — mis: `hwzthls.dramaboxdb.com`)
- `*.tiktokcdn.com`, `*.tiktokv.com`, `*.tiktokcdn-us.com` (PineDrama)
- `v3.goodshort.com` (GoodShort)

Host di luar list → HTTP 403. Tambah entry saat onboarding platform HLS baru.

## Catatan AES-128 (GoodShort)
Manifest GoodShort memakai `EXT-X-KEY` dengan `URI="data:text/plain;base64,..."` —
key embedded inline, bukan URL eksternal. Proxy tidak menyentuhnya; HLS.js handle natively.

## Fallback Iframe
Ketika HLS.js gagal karena MSE restriction, tampilkan tombol "Buka di Tab Baru"
(`window.open(location.href, '_blank')`). Di tab baru (luar iframe), video bermain normal.

**Why:** MSE diblokir di iframe sandbox Replit tapi bekerja normal di browser biasa
dan di deployed app.

**How to apply:** Selalu sediakan fallback external link di player untuk environment
iframe/sandboxed. Untuk platform HLS baru, tambah CDN-nya ke `HLS_ALLOWED_HOSTS`
sebelum smoke-test, atau `/hls-proxy` akan return 403.
