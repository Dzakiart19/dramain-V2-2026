---
name: GoodShort adapter
description: Quirks, field names, dan async pattern untuk lib/providers/goodshort.js
---

# GoodShort Adapter

**Why:** Beberapa field dan behavior GoodShort berbeda dari DramaBox — penting diingat saat maintenance.

## Perbedaan kritis vs DramaBox

| Aspek | GoodShort | DramaBox |
|---|---|---|
| `hlsManifestUrl` | **async** — fetch episode dulu untuk dapat chapterId dari `hlsUrl` | sync — URL dibangun dari params langsung |
| `server.js /api/hls-stream` | Butuh `await adapter.hlsManifestUrl(...)` | Sebelumnya tidak di-await |
| Parameter search | `query=` | `q=` |
| `detail.episodes` | `videoUrl` selalu kosong, tidak ada `chapterId` | Ada `videoUrl` |
| `allepisode.episodes` | Punya `chapterId` + `hlsUrl` (path relatif) | Format berbeda |
| `hlsUrl` dari `/episode` | Path relatif: `/api/goodshort/hls?bookId=...&chapterId=...&q=720p&lang=in` | URL absolut |
| CDN segmen HLS | `v3.goodshort.com` (absolut, AES-128 key = data URI) | CDN berbeda |
| Field count di `detail` | `totalEps` (bukan `totalEpisodes`) | `totalEpisodes` |
| Field count di `allepisode` | `total` | `totalEpisodes` |
| `bookName` di allepisode | Tersimpan di field `title` | `bookName` |

## AES-128 di manifest GoodShort
Key di manifest adalah `data:text/plain;base64,...` — embedded inline, bukan URL eksternal.
HLS.js handle ini natively; tidak perlu di-proxy dan tidak perlu masuk `HLS_ALLOWED_HOSTS`.

## stream() wajib include platform
Karena goodshort bukan DEFAULT_PLATFORM, videoUrl harus
`/api/hls-stream/goodshort/ID?ep=N&platform=goodshort`.
Tanpa `&platform=goodshort`, server fallback ke adapter dramabox → error.

**How to apply:** Saat debug atau update adapter goodshort, ingat hlsManifestUrl butuh
2x fetch (1x episode, 1x manifest). Jika ada timeout issue, periksa keduanya.
