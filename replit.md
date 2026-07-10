# Dramain Aja

Web app streaming drama pendek tanpa iklan, dengan UI bergaya Netflix
(dark, ikon monokrom, baris kategori horizontal, auto-play episode).

## Stack
- **Backend**: Node.js + Express
- **Frontend**: HTML/CSS/Vanilla JS (ES modules) + HLS.js
- **Video**: HLS (.m3u8) via HLS.js (DramaBox) atau MP4 native (PineDrama)

## Struktur Folder

```
/
├── server.js              # Express server — routes API backend (platform-agnostic)
├── lib/
│   ├── config.js          # Daftar platform & provider aktif + DEFAULT_PLATFORM
│   ├── fetcher.js         # HTTP client dengan retry, timeout & redact secret
│   └── providers/
│       ├── shortdramavid.js  # Adapter DramaBox (upstream: priv-api.anichin.bio, HLS)
│       └── pinedrama.js      # Adapter PineDrama (upstream: priv-api.anichin.bio, MP4)
├── public/
│   ├── index.html         # Halaman home (hero + baris kategori + pencarian)
│   ├── watch.html         # Halaman player video (auto-play episode berikutnya)
│   ├── style.css          # Satu file tema Netflix-style, terorganisir per komponen
│   └── js/
│       ├── api.js         # Wrapper fetch API ke backend (backendUrl + api helper)
│       ├── icons.js       # Semua ikon monokrom (inline SVG) — tidak ada emoji
│       ├── utils.js       # Helper kecil (escape HTML, toast, skeleton)
│       ├── home.js        # Logika halaman home: hero, baris kategori, search, modal
│       └── watch.js       # Logika halaman player: episode, auto-play, HLS/MP4
└── package.json
```

## Arsitektur Platform & Provider

### Konsep

Proyek ini membedakan dua level:

| Level | Contoh | Dikelola di |
|-------|--------|-------------|
| **Platform** | `dramabox`, `pinedrama` | `lib/config.js` → `PLATFORMS` |
| **Provider** | `dramabox`, `pinedrama` | tiap platform punya array `providers` |

Satu platform dipetakan ke satu adapter (`adapterPath`). Satu adapter bisa
melayani beberapa provider jika upstream API-nya mendukung path-segment berbeda.
Saat ini masing-masing platform hanya punya satu provider dengan id yang sama.

### Alur request (end-to-end)

```
Browser → /api/trending/dramabox?platform=dramabox
              ↓
          server.js: getAdapter("dramabox") → shortdramavid.js
              ↓
          adapter.trending("dramabox") → upstream priv-api.anichin.bio
              ↓
          JSON dinormalisasi → { id, title, cover, provider, episodes, ... }
              ↓
          Browser merender kartu
```

### Parameter `?platform=` wajib di semua API call frontend

Setiap request dari browser ke backend **harus** menyertakan `?platform=ID`.
Tanpa itu, backend jatuh ke `DEFAULT_PLATFORM` (= `dramabox`) — request
untuk PineDrama akan diproses oleh adapter yang salah.

`home.js` membangun `providerPlatformMap` saat init dari `/api/config`:
```js
// provider id → platform id
providerPlatformMap["dramabox"]  = "dramabox"
providerPlatformMap["pinedrama"] = "pinedrama"
```

Lalu setiap API call membawa platform yang tepat:
```js
/api/trending/pinedrama?platform=pinedrama
/api/watch/pinedrama/123?ep=1&platform=pinedrama
```

`watch.js` membaca `?platform=` dari URL. Jika tidak ada (link lama),
ia fallback berdasarkan provider: `provider === "pinedrama"` → `platform = "pinedrama"`,
sisanya → `"dramabox"`. URL selalu diperbarui via `history.replaceState`
dengan platform agar reload/share link tetap benar.

### Dropdown provider di UI

`/api/config` mengembalikan **semua** platform + provider. `home.js` di `init()`
iterasi seluruhnya dan mengisi satu `<select>` gabungan:

```
[ DramaBox ▾ ]   ← default
[ PineDrama ]
```

Saat user ganti pilihan, `currentProvider` dan `currentPlatform` diperbarui,
dan seluruh halaman di-reload dengan data platform baru.

Di mobile, dropdown ini **terlihat** (tidak disembunyikan). Ukuran font
diperkecil sedikit (`0.78rem`, padding `6px 8px`) agar muat di header.

### Tipe stream per platform

| Platform | Tipe | Cara putar |
|----------|------|-----------|
| DramaBox | HLS `.m3u8` | HLS.js (`loadStream`) — manifest di-fetch server-side, api_key tidak pernah ke browser |
| PineDrama | MP4 TikTok CDN | `<video src>` native (`loadMp4`) — URL tidak mengandung secret |

`watch.js` membaca `data.streamType` dari `/api/watch`:
- `streamType === "mp4"` → `loadMp4(data.videoUrl)` (URL langsung)
- lainnya → `loadStream(backendUrl(data.videoUrl))` (path internal `/api/hls-stream/...`)

## Platform yang Aktif

| Platform | Adapter | Default | Upstream |
|----------|---------|---------|----------|
| DramaBox | `shortdramavid.js` | ✅ Ya | `priv-api.anichin.bio` |
| PineDrama | `pinedrama.js` | — | `priv-api.anichin.bio` |

Keduanya memakai API key yang sama: env var `ANICHIN_API_KEY` (Replit Secret).

## API Endpoints Backend

Semua endpoint menerima `?platform=ID` — jika tidak diisi, fallback ke `DEFAULT_PLATFORM`.

| Method | Path | Keterangan |
|--------|------|------------|
| GET | /api/config | Daftar semua platform & provider |
| GET | /api/search?q=&provider=&platform= | Cari drama |
| GET | /api/drama/:provider/:id?platform= | Detail drama |
| GET | /api/allepisode/:provider/:id?platform= | Daftar lengkap episode |
| GET | /api/subtitles/:provider/:id?ep=&platform= | Subtitle satu episode |
| GET | /api/languages/:provider?platform= | Daftar bahasa tersedia |
| GET | /api/watch/:provider/:id?ep=&platform= | Metadata stream |
| GET | /api/hls-stream/:provider/:id?ep=&platform= | Manifest HLS server-side |
| GET | /api/browse/:provider?platform= | Trending + latest digabung |
| GET | /api/trending/:provider?platform= | Drama trending |
| GET | /api/latest/:provider?platform= | Drama terbaru |
| GET | /api/vip/:provider?platform= | Drama VIP |
| GET | /api/dubindo/:provider?platform= | Drama sulih suara Indonesia |
| GET | /api/foryou/:provider?page=N&platform= | Feed rekomendasi (pagination) |
| GET | /api/notifications?platform= | Status platform (selalu `[]` untuk platform aktif) |
| GET | /hls-proxy?url= | Relay segmen HLS (tidak perlu api_key) |

## Cara Menambah Platform Baru

Baca skill `add-streaming-platform` (`.agents/skills/add-streaming-platform/SKILL.md`)
sebelum mulai — skill itu adalah panduan otoritatif yang mencakup seluruh alur
termasuk pemetaan `providerPlatformMap` di frontend.

Ringkas:
1. Investigasi API upstream dengan curl — jangan tebak field name dari dokumentasi.
2. Buat `lib/providers/{nama}.js` dengan 13 fungsi kontrak yang persis sama.
3. Tambah entry ke `lib/config.js` → `PLATFORMS`. **Provider id harus unik
   secara global** (tidak boleh sama dengan provider platform lain).
4. Restart server — dropdown di UI otomatis memunculkan platform baru.
5. Smoke-test tiap endpoint dengan `?platform={id-baru}`.

Frontend (`public/`), routes (`server.js`), dan `lib/fetcher.js` **tidak perlu diubah**.

## Setup & Deploy

- **Jalankan lokal:** `npm start` (atau workflow Replit "Start application").
- **Deploy ke Firebase** (project id: `dramain-aja`):
  ```
  npx firebase login
  npx firebase deploy --only functions,hosting --project dramain-aja
  ```
  Secret `ANICHIN_API_KEY` di Firebase disetel via Secret Manager:
  ```
  npx firebase functions:secrets:set ANICHIN_API_KEY --project dramain-aja
  ```

## User Preferences
- Tidak menampilkan konten iklan dari evacuateenclose.com
- Kode harus mudah dipelihara dan mudah menambah platform baru
- Provider id harus unik secara global di seluruh PLATFORMS
