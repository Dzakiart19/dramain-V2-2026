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

1. Buat file `lib/providers/{nama-platform}.js`
   — Ekspor fungsi wajib (dipakai langsung oleh route di `server.js`):
     `search`, `detail`, `stream`, `browse`, `trending`, `latest`, `vip`,
     `dubindo`, `foryou`, `languages`, `allepisode`, `subtitles`,
     `hlsManifestUrl`, `notifications`
   — Kalau sebuah fungsi tidak relevan untuk platform baru, tetap ekspor
     versi yang mengembalikan array/objek kosong (atau, untuk
     `hlsManifestUrl`, fungsi yang melempar error jelas) agar route
     terkait tidak crash
2. Tambah entry di `lib/config.js` → `PLATFORMS`
3. Restart server — selesai, tidak perlu ubah file lain.

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

## User Preferences
- Tidak menampilkan konten iklan dari evacuateenclose.com
- Kode harus mudah dipelihara dan mudah menambah platform baru
