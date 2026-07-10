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
   — Ekspor fungsi: `search`, `detail`, `stream`, `browse`, `notifications`
2. Tambah entry di `lib/config.js` → `PLATFORMS`
3. Restart server — selesai, tidak perlu ubah file lain.

## API Endpoints Backend

| Method | Path | Keterangan |
|--------|------|------------|
| GET | /api/config | Daftar platform & provider |
| GET | /api/search?q=&provider= | Cari drama |
| GET | /api/drama/:provider/:id | Detail drama |
| GET | /api/watch/:provider/:id?ep= | URL stream HLS |
| GET | /api/browse/:provider?q= | Browse drama |
| GET | /api/notifications | Status platform |

## User Preferences
- Tidak menampilkan konten iklan dari evacuateenclose.com
- Kode harus mudah dipelihara dan mudah menambah platform baru
