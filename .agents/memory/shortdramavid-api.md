---
name: ShortDramaVid API
description: Endpoint pattern, quirks, dan data shape untuk shortdramavid.xyz
---

# ShortDramaVid API — Temuan Recon

**Base:** `https://www.shortdramavid.xyz`

## Quirk Kritis
- **Semua endpoint WAJIB pakai trailing slash** — tanpa slash → 308 redirect, response-nya hanya string path redirect
- `/api/search?q=love` → 308 ke `/api/search/?q=love` → JSON

## Endpoint
| Path | Response |
|------|----------|
| `/api/search/?q=QUERY` | multi-provider results |
| `/api/{provider}/search/?q=QUERY` | per-provider list |
| `/api/{provider}/detail/{id}/` | detail + episodes array |
| `/api/{provider}/watch/?id=ID&ep=N` | videoUrl HLS + locked status |
| `/api/notifications/` | status platform |

## Shape Detail Response
```json
{
  "id": "...",
  "title": "...",
  "cover": "...",
  "description": "...",
  "tags": [...],
  "episodes": [{"number":1,"title":"Episode 1","videoUrl":"","locked":false}]
}
```
**`episodes` adalah array of objects, BUKAN integer.** `totalEpisodes` tidak ada — hitung dari `episodes.length`.

## Provider Aktif
dramabox, goodshort, netshort, reelshort, melolo, dramawave, moboreels, dramabite, pinedrama

## HLS Stream
- Watch endpoint → `priv-api.anichin.bio/api/{provider}/hls?id=...&ep=...&lang=id&api_key=...`
- Segments dari `hwzthls.dramaboxdb.com` → `.ts` 720p H.264
- Butuh proxy backend karena CORS block di browser

**Why:** Tanpa trailing slash API tidak return JSON, dan `episodes` sebagai array bukan integer menyebabkan `[object Object]` jika tidak di-handle.
