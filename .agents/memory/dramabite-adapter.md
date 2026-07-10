---
name: DramaBite adapter notes
description: Quirks of the DramaBite upstream (priv-api.anichin.bio) worth knowing before touching its adapter or trusting its docs
---

DramaBite (`priv-api.anichin.bio/api/dramabite/*`) dites konsisten (2026-07-10):
auth header `X-API-Key` maupun query `api_key` sama-sama bekerja, parameter
pencarian `query=`, `locked:false` konsisten di semua endpoint episode untuk
semua judul yang dicoba.

**Why documented endpoint ≠ real upstream:** dokumentasi yang diberikan user
menyebut endpoint `/homepage`, tapi upstream nyata menolaknya dengan
`{"error":"invalid action \"homepage\""}`. Jangan percaya daftar endpoint dari
dokumentasi pihak ketiga tanpa curl langsung ke upstream — selalu verifikasi
endpoint-per-endpoint sebelum menulis adapter.

**How to apply:** kalau ada provider anichin.bio lain di masa depan yang
disebut punya endpoint tertentu di dokumentasi, curl dulu sebelum
mengasumsikan itu ada. Untuk DramaBite, `latest()` di adapter fallback ke
`foryou()` karena `/homepage` tidak nyata.

Perbedaan struktural dari ReelShort/ShortMax: DramaBite TIDAK punya endpoint
`/hls` terpisah yang redirect ke CDN — `/dramabite/allepisode` dan
`/dramabite/episode` langsung mengembalikan `videoUrl` absolut ke manifest
`.m3u8` di `cdn-video.miniepisode.media` (HTTP 200 langsung, tanpa redirect).
Tapi segmen di dalam manifest itu tetap PATH RELATIF, jadi mekanisme generik
resolve-relatif-terhadap-`upstream.url` yang sudah ada di `server.js` (dibuat
untuk ReelShort) tetap dipakai tanpa perubahan tambahan — pola ini kemungkinan
akan berulang untuk provider anichin.bio berikutnya.
