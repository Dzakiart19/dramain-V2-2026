---
name: ShortMax locked-status quirk
description: Upstream ShortMax /detail endpoint reports incorrect locked status; allepisode/episode are the real source of truth
---

Upstream `priv-api.anichin.bio` untuk provider ShortMax memiliki inkonsistensi:
`/shortmax/detail` menandai mayoritas episode sebagai `locked:true`, tapi
`/shortmax/allepisode` dan `/shortmax/episode` (endpoint yang benar-benar dipakai
untuk resolve playback) selalu mengembalikan `locked:false` dengan URL video
lengkap — dikonfirmasi konsisten di banyak judul.

**Why:** jika adapter memakai `locked` dari `/detail` sebagai source of truth,
UI akan menampilkan sebagian besar episode sebagai terkunci padahal semuanya
sebenarnya bisa diputar penuh — false negative yang merusak UX tanpa alasan.

**How to apply:** adapter provider apa pun yang memakai upstream ini (contoh:
`lib/providers/shortmax.js`) harus mengambil status `locked` dari
`allepisode()`/`episode()`, bukan dari field mentah `/detail`. Jika endpoint
`allepisode()` gagal, boleh fallback ke jumlah episode `/detail` untuk hitung
`totalEpisodes`, tapi tetap jangan percaya field `locked` dari `/detail`.
