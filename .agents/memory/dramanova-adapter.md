---
name: DrамаNova adapter quirks
description: Perbedaan penting adapter DrамаNova vs adapter platform lain (auth header, no allepisode, MP4 BytePlus)
---

## Aturan & keputusan

**Auth via header, bukan query param.**
DrамаNova menggunakan `X-API-Key: <key>` di HTTP header, bukan `?api_key=KEY`
di URL seperti DramaBox/GoodShort/dll. `buildUrl()` di adapter ini TIDAK
menyisipkan key di URL. Key dikirim lewat `options.headers` ke `fetchJSON()`.
**Why:** upstream `/api/dramanova/*` menolak query-param auth; hanya header yang
diterima. Jangan ubah ke query param.
**How to apply:** Selalu gunakan `authOpts()` helper yang mengembalikan
`{ headers: { "X-API-Key": apiKey() } }` di setiap call `fetchJSON`.

**Tidak ada endpoint `/allepisode`.**
`allepisode()` mengambil data dari `/detail` (field `episodes[]`). Episode dalam
`detail.episodes` memiliki `{ number, title, videoUrl (selalu kosong ""), locked }`.
`videoUrl` kosong di sini normal — URL asli hanya tersedia via `/episode?id=&ep=`.
**Why:** upstream tidak menyediakan endpoint `/allepisode` terpisah.
**How to apply:** Jangan buat request ke `/dramanova/allepisode` — endpoint itu
tidak ada dan akan mengembalikan error.

**MP4 BytePlus CDN — `auth_key` aman dikirim ke browser.**
`stream()` memanggil `/episode` dan mengembalikan `videoUrl` langsung ke client
dengan `streamType: "mp4"`. URL mengandung `auth_key` (CDN signing param dari
`ps2.bytedrama.com`) yang memang ditujukan untuk browser — ini bukan API key
server. Tidak perlu proxy `/hls-stream` atau `/hls-proxy`.
**Why:** Berbeda dari HLS platform yang memakai api_key di manifest, CDN signing
key BytePlus adalah credential per-resource untuk browser, bukan secret server.
**How to apply:** Tidak perlu tambah DrамаNova ke `HLS_ALLOWED_HOSTS`.
`hlsManifestUrl()` di adapter ini melempar error eksplisit jika dipanggil.

**Logo: `.webp` bukan `.jpg`.**
File logo disimpan sebagai `public/img/platforms/dramanova.webp` (bukan `.jpg`).
Entry di `PLATFORM_VISUALS` di `home.js` harus pakai ekstensi `.webp`.
