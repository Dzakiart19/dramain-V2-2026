# DramaStream

Web app streaming drama pendek tanpa iklan.

## Stack
- **Backend**: Node.js + Express
- **Frontend**: HTML/CSS/Vanilla JS + HLS.js
- **Video**: HLS (.m3u8) streaming via hls.js

## Struktur Folder

```
/
├── server.js              # Express server — routes API backend
├── lib/
│   ├── config.js          # Daftar platform & provider aktif
│   ├── fetcher.js         # HTTP client dengan retry & timeout
│   └── providers/
│       └── shortdramavid.js  # Adapter platform ShortDramaVid
├── public/
│   ├── index.html         # Halaman home + search
│   ├── watch.html         # Halaman player video
│   ├── style.css
│   ├── app.js             # JS frontend halaman home
│   └── watch.js           # JS frontend halaman player
└── package.json
```

## Cara Menambah Platform Baru

1. Buat file `lib/providers/{nama-platform}.js`
   — Ekspor fungsi wajib: `search`, `detail`, `stream`, `browse`, `notifications`
   — Ekspor fungsi tambahan yang juga dipakai route saat ini: `trending`, `latest`, `vip`, `dubindo`, `foryou`
   — Kalau sebuah fungsi tidak relevan untuk platform baru, tetap ekspor versi yang mengembalikan array/objek kosong agar route terkait tidak crash
2. Tambah entry di `lib/config.js` → `PLATFORMS`
3. Restart server — selesai, tidak perlu ubah file lain.

## API Endpoints Backend

| Method | Path | Keterangan |
|--------|------|------------|
| GET | /api/config | Daftar platform & provider |
| GET | /api/search?q=&provider= | Cari drama |
| GET | /api/drama/:provider/:id | Detail drama |
| GET | /api/watch/:provider/:id?ep= | URL stream HLS |
| GET | /api/browse/:provider | Browse drama (gabungan trending + latest) |
| GET | /api/trending/:provider | Drama trending |
| GET | /api/latest/:provider | Drama terbaru |
| GET | /api/vip/:provider | Drama VIP |
| GET | /api/dubindo/:provider | Drama sulih suara Indonesia |
| GET | /api/foryou/:provider?page=N | Feed rekomendasi (pagination) |
| GET | /api/more/:provider?q= | Cari lebih banyak (dipakai tombol "Muat Lebih") |
| GET | /api/notifications | Status platform |
| GET | /hls-proxy?url= | Relay manifest & segmen HLS (hindari CORS) |

**Catatan:** endpoint `languages`, `allepisode`, `subtitles`, `hls` yang ada di situs asal (shortdramavid.xyz) TIDAK diimplementasikan karena tidak eksis sebagai endpoint JSON publik (selalu fallback ke SPA/404). Daftar episode lengkap sudah tersedia dari `/api/drama/:provider/:id` (detail), dan sumber video didapat dari `/api/watch/:provider/:id`.

## User Preferences
- Tidak menampilkan konten iklan dari evacuateenclose.com
- Kode harus mudah dipelihara dan mudah menambah platform baru
