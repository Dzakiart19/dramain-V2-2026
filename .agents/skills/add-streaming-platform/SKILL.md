---
name: add-streaming-platform
description: Add a new streaming platform/provider adapter to the Dramain Aja app (Node/Express short-drama streamer). Use when the user asks to add a new drama platform, a new provider, or a new upstream data source to this project.
---

# Add Streaming Platform (Dramain Aja)

Dramain Aja menggunakan pola **adapter per platform**. `server.js` tidak
pernah bicara langsung ke upstream API — ia hanya memanggil fungsi adapter
yang sudah terdefinisi. Frontend sudah platform-agnostic: ia membaca daftar
platform dari `/api/config` dan menyertakan `?platform=ID` di setiap request.

Menambah platform = tulis satu adapter + satu entry di config. Tidak ada file
lain yang perlu diubah.

---

## Konsep penting sebelum mulai

### Platform vs Provider

| Konsep | Contoh | Dikelola di |
|--------|--------|-------------|
| **Platform** | `dramabox`, `pinedrama` | `lib/config.js` → `PLATFORMS` |
| **Provider** | `dramabox`, `pinedrama` | array `providers` di tiap platform |

Satu platform → satu adapter file. Satu adapter bisa melayani beberapa
provider jika upstream API mendukung path-segment berbeda (misalnya
`/api/dramacool/trending` vs `/api/dramabox/trending` dari upstream yang sama).

**Provider id harus unik secara global** di seluruh `PLATFORMS`. Frontend
membangun `providerPlatformMap` (provider → platform) dari `/api/config`, dan
jika dua platform memakai provider id yang sama, pemetaan akan silently salah.

### Parameter `?platform=` adalah wajib

Setiap route di `server.js` menerima `?platform=ID` untuk memilih adapter.
Tanpa itu, server jatuh ke `DEFAULT_PLATFORM`. Frontend (`home.js`,
`watch.js`) sudah selalu mengirim parameter ini — pastikan semua link dan URL
yang dibangun di kode ikut menyertakannya.

### Persistensi platform (localStorage)

`home.js` menyimpan provider terakhir dipilih user ke `localStorage` dengan
key `dramain_provider`. Saat `init()` berjalan (termasuk saat user kembali
dari halaman watch), nilai ini dibaca dan di-restore — user tidak direset ke
platform default secara paksa.

Saat platform baru ditambahkan, tidak ada yang perlu diubah di logika ini —
ia bekerja selama provider id ada di `providerPlatformMap` yang dibangun dari
`/api/config`. Jika sebuah platform dihapus dari config, `init()` akan
mendeteksi bahwa saved provider tidak ada di map dan fallback ke default
secara graceful.

### Tipe stream

Ada dua tipe video yang sudah didukung frontend:

| Nilai `streamType` | Cara putar | Kapan dipakai |
|--------------------|-----------|---------------|
| `"hls"` (default) | HLS.js via `/api/hls-stream/` | Upstream mengembalikan `.m3u8` yang butuh API key |
| `"mp4"` | `<video src>` native, URL langsung | Upstream mengembalikan URL MP4 publik tanpa secret |

`watch.js` membaca `data.streamType` dari `/api/watch` dan memilih player
yang tepat. Tidak perlu ubah frontend untuk tipe stream baru selama masuk
salah satu dari dua ini.

---

## Step 1 — Investigasi API upstream

Sebelum menulis kode apapun, konfirmasi dengan request nyata (curl / fetch).
Jangan tebak dari dokumentasi:

- **Base URL** dan metode auth (API key di query param, header, atau tidak ada).
- **Format response** — JSON langsung atau dibungkus `{ items: [...] }` /
  `{ data: [...] }`.
- **Field name** untuk id, title, cover, description, episode count.
- **Detail vs episode list** — apakah satu endpoint atau dua endpoint terpisah?
  (DramaBox memisahkan keduanya, dan field `episodes` di `detail` tidak selalu
  sinkron nomornya — selalu crosscheck dengan `allepisode`).
- **Episode lock** — bagaimana episode premium/terkunci ditandai.
- **Resolve video** — apakah upstream mengembalikan URL MP4 langsung di objek
  episode, atau membutuhkan request terpisah yang mengembalikan manifest `.m3u8`
  yang mengandung API key?

Jika platform butuh secret (API key, token), gunakan environment-secrets flow —
**tidak pernah hardcode di adapter file**.

---

## Step 2 — Buat adapter file

Buat `lib/providers/{nama-platform}.js`. File ini **wajib** mengekspor
persis 13 fungsi berikut (lihat `lib/providers/shortdramavid.js` sebagai
referensi implementasi lengkap):

```js
module.exports = {
  search,          // (q, provider) => Array<DramaSummary>
  detail,          // (provider, id) => DramaDetail
  allepisode,      // (provider, id) => { bookId, bookName, cover, totalEpisodes, episodes }
  subtitles,       // (provider, id, ep) => Array
  languages,       // (provider) => { default, languages }
  stream,          // (provider, id, ep) => { videoUrl, locked, episodeNumber, qualityList, streamType? }
  browse,          // (provider) => Array<DramaSummary>
  trending,        // (provider) => Array<DramaSummary>
  latest,          // (provider) => Array<DramaSummary>
  vip,             // (provider) => Array<DramaSummary>
  dubindo,         // (provider) => Array<DramaSummary>
  foryou,          // (provider, page) => { items, page, perPage, total, hasMore }
  notifications,   // () => Array
  hlsManifestUrl,  // (provider, id, ep) => string (server-side only)
};
```

Jika sebuah fitur tidak ada di API upstream, tetap ekspor fungsinya —
kembalikan array kosong / object kosong yang sesuai kontrak, atau untuk
`hlsManifestUrl` lempar error yang jelas. Jangan hapus atau jadikan kondisional;
kontrak harus utuh agar route generik di `server.js` tidak crash.

### Shape yang wajib diikuti

`DramaSummary` (dipakai oleh search / trending / latest / vip / dubindo / foryou / browse):
```js
{ id, title, cover, provider, episodes /* angka jumlah */, description }
```

`DramaDetail` (dipakai oleh `detail`):
```js
{ id, title, cover, description, totalEpisodes, episodes /* array */, provider }
```

Item episode (dari `allepisode`, di-reuse oleh `detail`):
```js
{ number, title, locked, duration /* detik */ }
```

Return `stream()`:
```js
{
  videoUrl,        // string — path internal atau URL publik (lihat aturan keamanan)
  locked,          // boolean
  episodeNumber,   // number
  qualityList,     // Array — boleh kosong
  streamType,      // "hls" | "mp4" — opsional, default dianggap "hls" oleh frontend
}
```

Buat satu normalizer internal (lihat `normalizeSearchItem` di referensi) yang
dipanggil oleh semua fungsi list — jangan ulangi field-mapping di tiap fungsi.

### Aturan keamanan API key (tidak bisa dikompromikan)

- Baca secret **hanya** dari `process.env`, tidak pernah hardcode.
- Helper `buildUrl()` boleh menyisipkan key di URL upstream — itu fine karena
  URL tersebut hanya di-fetch di sisi server.
- **`stream()` tidak boleh mengembalikan URL mentah yang mengandung API key.**
  - Jika upstream pakai HLS + API key: kembalikan path internal
    `/api/hls-stream/:provider/:id?ep=N&platform=PLATFORM`. Route ini sudah ada
    di `server.js` — ia fetch manifest server-side via `hlsManifestUrl()`, lalu
    rewrite setiap URL segmen ke `/hls-proxy` (bebas key). Jangan buat route baru.
  - Jika upstream pakai MP4 publik tanpa secret (seperti PineDrama via TikTok CDN):
    URL boleh dikembalikan langsung, set `streamType: "mp4"`.
- Pesan error tidak boleh membawa URL mentah ke client. Gunakan `fetchJSON` dari
  `lib/fetcher.js` (sudah redact `api_key`/`token`/`secret`/`password`) dan
  `redactSecrets()` di `server.js` — jangan duplikasi logika ini.

---

## Step 3 — Daftarkan di config

Tambah entry ke `lib/config.js`:

```js
const PLATFORMS = {
  dramabox:  { /* existing */ },
  pinedrama: { /* existing */ },

  // Platform baru:
  namaplatform: {
    id: "namaplatform",              // harus unik secara global di PLATFORMS
    label: "Nama Tampilan",
    adapterPath: "./lib/providers/namaplatform.js",
    providers: [
      { id: "namaplatform", label: "Nama Tampilan" },
      // tambah lebih jika satu adapter melayani beberapa sub-catalog
    ],
  },
};
```

**Aturan provider id unik:** id di dalam array `providers` tidak boleh sama
dengan provider id manapun di platform lain. Frontend memetakan provider→platform
secara flat — duplikat menyebabkan platform yang salah dipilih secara senyap.

Setelah config diubah, restart server. Dropdown di UI **otomatis** memunculkan
provider baru — tidak perlu ubah frontend.

---

## Step 4 — Smoke-test setiap endpoint

Restart workflow, lalu curl atau buka di browser dengan `?platform={id-baru}`:

```
/api/config
/api/trending/{provider}?platform={id}
/api/latest/{provider}?platform={id}
/api/vip/{provider}?platform={id}
/api/dubindo/{provider}?platform={id}
/api/foryou/{provider}?page=1&platform={id}
/api/search?q=love&provider={provider}&platform={id}
/api/drama/{provider}/{some-id}?platform={id}
/api/allepisode/{provider}/{some-id}?platform={id}
/api/watch/{provider}/{some-id}?ep=1&platform={id}
```

Untuk platform HLS, juga test:
```
/api/hls-stream/{provider}/{some-id}?ep=1&platform={id}
```

Pastikan:
- Tidak ada `api_key` muncul di response JSON manapun.
- URL HLS segment sudah di-rewrite ke `/hls-proxy?url=...`.
- Untuk platform MP4, `stream()` mengembalikan `streamType: "mp4"` dan URL
  bisa dibuka langsung di browser tanpa proxy.

---

## Yang tidak perlu diubah

| File | Kenapa |
|------|--------|
| `public/` (semua frontend) | Platform-agnostic — dropdown diisi dari `/api/config`, `?platform=` sudah dikirim otomatis |
| `server.js` | Route sudah generic via `getAdapter(platform)` — tambah route baru hanya jika platform punya fitur benar-benar baru yang belum ada route-nya |
| `lib/fetcher.js` | HTTP client shared dengan retry/timeout/redaction — reuse, jangan buat wrapper baru |

---

## Referensi implementasi

| Platform | Adapter | Tipe stream | Catatan |
|----------|---------|-------------|---------|
| DramaBox | `lib/providers/shortdramavid.js` | HLS | Referensi utama — baca end-to-end sebelum mulai |
| PineDrama | `lib/providers/pinedrama.js` | MP4 | Contoh platform tanpa HLS, fallback graceful untuk vip/dubindo/subtitles |
