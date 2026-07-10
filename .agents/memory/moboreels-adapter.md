---
name: MoboReels adapter notes
description: Quirks dan keputusan desain adapter MoboReels (priv-api.anichin.bio/api/moboreels)
---

## Perbedaan utama vs DramaBox/PineDrama

- **Tidak ada endpoint `allepisode` terpisah** — daftar episode diambil dari field `episodes[]` di response `/detail`. `allepisode()` memanggil `/detail` langsung.
- **Stream type MP4** — `cdnvideo.cdreader.com`, bukan HLS. `stream()` return `streamType:"mp4"`, tidak perlu HLS proxy.
- **`videoUrl` mengandung CDN signed params** (`t`, `us`, `sign`) yang expire — tidak mengandung `api_key` backend (aman dikirim ke browser), tapi harus selalu di-fetch baru, jangan cache.
- **`totalEpisodes` tidak ada di detail response** — gunakan `episodes[].length` sebagai sumber kebenaran.
- **`episodes` di trending selalu `0`** — jumlah episode hanya diketahui setelah fetch detail.

## Endpoint yang tidak ada
`latest`, `vip`, `dubindo`, `subtitles`, `hls` — semua return `[]` atau throw.  
`latest` fallback ke `foryou page 1`.

## Bug yang pernah terjadi
**Duration normalization** di `allepisode()`: ekspresi `e.duration ?? e.duration_ms ? ... : 0` salah precedence — `??` lebih tinggi dari `?:` sehingga kondisi ternary dievaluasi dari `(e.duration ?? e.duration_ms)`, bukan dari `e.duration ?? (e.duration_ms ? ...)`.

**Why:** JavaScript `??` precedence > ternary `?:`.

**How to apply:** Gunakan explicit `null != e.duration ? Number(e.duration) : (e.duration_ms != null ? Math.round(...) : 0)` — jangan campur `??` dengan ternary di ekspresi yang sama tanpa kurung eksplisit.

## CDN host
`cdnvideo.cdreader.com` — tidak perlu masuk `HLS_ALLOWED_HOSTS` karena platform MP4 (tidak lewat `/hls-proxy`).
