---
name: HLS proxy redirect + relative URI handling
description: Generic pattern needed when a new HLS provider redirects to a CDN and/or uses relative segment paths in its manifest
---

Beberapa provider HLS (upstream via `priv-api.anichin.bio` atau lainnya) tidak
selalu mengembalikan manifest `.m3u8` langsung sebagai body — endpointnya bisa
me-redirect (302) ke domain CDN lain, dan segmen di dalam manifest hasil
redirect itu bisa berupa PATH RELATIF (bukan URL absolut). Contoh nyata:
ReelShort — `/reelshort/hls` redirect ke `v-mps.crazymaplestudios.com`, isi
manifestnya berupa nama file relatif tanpa scheme/host.

**Why:** rewriter manifest yang cuma mengecek baris `http://`/`https://` (pola
lama dari ShortMax/GoodShort yang segmennya sudah absolut) akan melewatkan
baris relatif tanpa proxy — browser lalu mencoba fetch relatif ke origin server
sendiri dan playback gagal total. Selain itu, mengikuti redirect dengan
`fetch()` default (`redirect:"follow"`) tanpa validasi ulang tiap hop membuka
SSRF/allowlist bypass: host pertama yang lolos allowlist bisa redirect ke host
privat/asing yang seharusnya diblokir.

**How to apply:** saat menambah provider HLS baru di proyek ini
(`server.js` — route `/api/hls-stream` dan `/hls-proxy`):
1. Selalu resolve baris manifest yang relatif terhadap `upstream.url` (URL
   akhir setelah redirect) sebelum di-encode ke `/hls-proxy?url=...` — jangan
   asumsikan segmen selalu absolut.
2. Gunakan `fetchWithValidatedRedirects()` (bukan `fetch()` polos) untuk semua
   fetch upstream yang bisa redirect — fungsi ini follow redirect manual dan
   revalidasi SSRF guard + CDN allowlist di setiap hop.
3. Tambahkan domain CDN final (setelah redirect) ke `HLS_ALLOWED_HOSTS` di
   `server.js`, bukan hanya domain API awal.
4. Untuk master playlist / tag dengan atribut URI (`#EXT-X-KEY`, `#EXT-X-MAP`,
   `#EXT-X-MEDIA`), rewrite `URI="..."` di dalamnya juga — bukan cuma baris
   non-comment.
