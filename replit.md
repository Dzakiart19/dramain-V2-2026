# Dramain Aja

Web app streaming drama pendek tanpa iklan, dengan UI bergaya Netflix
(dark, ikon monokrom, baris kategori horizontal, auto-play episode).

## Stack
- **Backend**: Node.js + Express
- **Frontend**: HTML/CSS/Vanilla JS (ES modules) + HLS.js
- **Video**: HLS (.m3u8) streaming via hls.js

## Struktur Folder

```
/
├── server.js              # Express server — routes API backend
├── lib/
│   ├── config.js          # Daftar platform & provider aktif
│   ├── fetcher.js         # HTTP client dengan retry & timeout
│   └── providers/
│       └── shortdramavid.js  # Adapter platform DramaBox (upstream: anichin.bio)
├── public/
│   ├── index.html         # Halaman home (hero + baris kategori + pencarian)
│   ├── watch.html         # Halaman player video (auto-play episode berikutnya)
│   ├── style.css          # Satu file tema Netflix-style, terorganisir per komponen
│   └── js/
│       ├── api.js         # Wrapper fetch API ke backend
│       ├── icons.js       # Semua ikon monokrom (inline SVG) — tidak ada emoji
│       ├── utils.js       # Helper kecil (escape HTML, toast, skeleton)
│       ├── home.js        # Logika halaman home: hero, baris kategori, search, modal
│       └── watch.js       # Logika halaman player: episode, auto-play, HLS
└── package.json
```

Setiap kategori beranda (Trending, Terbaru, Dub Indo, VIP, Untuk Anda)
dideklarasikan sebagai satu entri terpisah di `public/js/home.js` (array
`ROWS` + `loadForYou`), masing-masing memuat datanya sendiri dari
endpoint API-nya sendiri — menambah kategori baru tidak menyentuh baris
lain.

## Cara Menambah Platform Baru

Panduan lengkap & konsisten ada di skill `add-streaming-platform`
(`.agents/skills/add-streaming-platform/SKILL.md`) — baca itu dulu sebelum
menambah platform baru. Ringkas:

1. Investigasi API upstream baru langsung (curl), jangan tebak dari dokumen.
2. Buat `lib/providers/{nama-platform}.js` dengan kontrak fungsi yang persis
   sama seperti `lib/providers/shortdramavid.js` (lihat daftar fungsi wajib
   di skill tersebut) — kalau sebuah fitur tidak ada di API baru, tetap
   ekspor versi kosong/aman agar route generik di `server.js` tidak crash.
3. Tambah entry di `lib/config.js` → `PLATFORMS`.
4. Restart server dan smoke-test tiap endpoint dengan platform baru.

Frontend (`public/`) dan route di `server.js` sudah platform-agnostic —
tidak perlu diubah untuk menambah platform baru.

## API Endpoints Backend

| Method | Path | Keterangan |
|--------|------|------------|
| GET | /api/config | Daftar platform & provider |
| GET | /api/search?q=&provider= | Cari drama |
| GET | /api/drama/:provider/:id | Detail drama (episode diambil dari allepisode) |
| GET | /api/allepisode/:provider/:id | Daftar lengkap episode |
| GET | /api/subtitles/:provider/:id?ep= | Subtitle satu episode |
| GET | /api/languages/:provider | Daftar bahasa tersedia |
| GET | /api/watch/:provider/:id?ep= | Metadata stream (videoUrl → route internal) |
| GET | /api/hls-stream/:provider/:id?ep= | Manifest HLS (fetch upstream server-side, key tidak pernah ke client) |
| GET | /api/browse/:provider | Browse drama (gabungan trending + latest) |
| GET | /api/trending/:provider | Drama trending |
| GET | /api/latest/:provider | Drama terbaru |
| GET | /api/vip/:provider | Drama VIP |
| GET | /api/dubindo/:provider | Drama sulih suara Indonesia |
| GET | /api/foryou/:provider?page=N | Feed rekomendasi (pagination) |
| GET | /api/more/:provider?q= | Cari lebih banyak (dipakai tombol "Muat Lebih") |
| GET | /api/notifications | Status platform (fallback ke shortdramavid.xyz, opsional) |
| GET | /hls-proxy?url= | Relay segmen HLS (hindari CORS) |

**Sumber data asli:** `https://priv-api.anichin.bio/api/{provider}/{action}` — butuh `ANICHIN_API_KEY` (Replit Secret) di setiap request, HANYA dipanggil server-side (lihat `lib/providers/shortdramavid.js`). Key tidak pernah dikirim ke browser: route `/api/hls-stream` mengambil manifest upstream lalu me-rewrite URL segmen ke `/hls-proxy` (yang tidak butuh key), dan semua pesan error di-redact dari secret sebelum diteruskan ke client. Endpoint `notifications` tidak ada di API asli sehingga tetap fallback ke shortdramavid.xyz (gagal pun tidak masalah, hanya info status platform).

## Setup & Deploy

- **Instal semua dependency (root + Firebase Functions + Firebase CLI) sekali jalan:**
  ```
  ./install.sh
  ```
- **Jalankan lokal:** `npm start` (workflow Replit "Start application" juga memanggil ini).
- **Deploy ke Firebase** (project id: `dramain-aja`):
  ```
  npx firebase login                         # sekali per environment
  npx firebase deploy --only functions,hosting --project dramain-aja
  ```
  Arsitektur: satu `package.json` di root melayani dua entry point —
  `server.js` (dipakai Replit lewat `npm start`, langsung `app.listen`) dan
  `index.js` (dipakai Firebase Functions, membungkus Express app yang sama
  lewat `onRequest`, TIDAK pernah listen sendiri). Firebase Hosting
  di-`rewrite` penuh ke Cloud Function `app` itu (lihat `firebase.json`,
  `functions.source` = root proyek supaya `server.js` & `lib/**` ikut
  ter-deploy). Tidak ada logika yang diduplikasi antara jalur Replit dan
  jalur Firebase.

  Secret `ANICHIN_API_KEY` di Firebase **wajib** disetel lewat Secret
  Manager (bukan `.env`), supaya konsisten dengan aturan "key hanya
  dipakai server-side" di seluruh proyek ini:
  ```
  npx firebase functions:secrets:set ANICHIN_API_KEY --project dramain-aja
  ```

## User Preferences
- Tidak menampilkan konten iklan dari evacuateenclose.com
- Kode harus mudah dipelihara dan mudah menambah platform baru
