---
name: HLS Proxy
description: Solusi CORS dan MSE restriction untuk HLS streaming di Replit
---

# HLS Proxy — Pattern dan Limitasi

## Masalah
- HLS stream dari `hwzthls.dramaboxdb.com` di-block CORS oleh browser
- Replit preview iframe membatasi MediaSource Extensions (MSE) — `bufferIncompatibleCodecsError`
- Error ini **spesifik untuk iframe Replit preview**, bukan di browser nyata

## Solusi Yang Diimplementasi
Route `/hls-proxy?url=ENCODED_URL` di Express:
1. Fetch URL target via server (bypass CORS)
2. Jika `.m3u8`: rewrite semua URL absolut dalam file → `/hls-proxy?url=...`
3. Jika `.ts`: relay binary via `upstream.body.pipe(res)`
4. Set `Access-Control-Allow-Origin: *`

Watch endpoint otomatis wrap videoUrl: `data.videoUrl = /hls-proxy?url=ENCODED`

## Fallback Iframe
Ketika HLS.js gagal karena MSE restriction, tampilkan tombol "Buka di Tab Baru" (`window.open(location.href, '_blank')`). Di tab baru (luar iframe), video bermain normal.

**Why:** MSE diblokir di iframe sandbox Replit tapi bekerja normal di browser biasa dan di deployed app.

**How to apply:** Selalu sediakan fallback external link di player untuk environment iframe/sandboxed.
