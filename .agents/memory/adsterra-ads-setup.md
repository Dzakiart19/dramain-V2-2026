---
name: Adsterra ads setup
description: Semua unit iklan Adsterra aktif — domain, key per slot, dan titik-titik trigger directlink.
---

## Domain invoke.js
Semua banner dan native unit sekarang memakai domain **`turbulentrefreshments.com`** (bukan `highperformanceformat.com` atau `effectivecpmnetwork.com` lama).

## Banner slots (dirender async via `ads-adsterra.js` → iframe terisolasi)

### index.html (Home)
| Ukuran | Key | Tampil di |
|---|---|---|
| 728×90 | `4c112354178bbc24e39d6c7e2dbb09d6` | Desktop only (atas konten) |
| 320×50 | `ba8536d86edbb4e28bcc8cb32b37c074` | Mobile only (atas konten) |
| 728×90 | `4c112354178bbc24e39d6c7e2dbb09d6` | Desktop only (tengah, setelah baris konten) |
| 300×250 | `e3faf41c09046f72483f6d2eafded156` | Semua device (bawah halaman) |
| Native | `0eb91f935a13464cd586f8674a5e5fa9` | `container-0eb91f935a13464cd586f8674a5e5fa9` |

### watch.html (Player)
| Ukuran | Key | Tampil di |
|---|---|---|
| 468×60 | `729bb31e0b9f7bb8378c26ce85b7df77` | Desktop only (bawah player) |
| 320×50 | `ba8536d86edbb4e28bcc8cb32b37c074` | Mobile only (bawah player) |
| 300×250 | `e3faf41c09046f72483f6d2eafded156` | Semua device (antara episode list & skyscraper) |
| 160×600 | `9c6a7735297d37e5defb1553a70d45b0` | Desktop only (bawah episode list) |
| 160×300 | `5b3a5731971726ff611dc9559bea72aa` | Mobile only (bawah episode list) |
| Native | `0eb91f935a13464cd586f8674a5e5fa9` | `container-0eb91f935a13464cd586f8674a5e5fa9` |

## Direct Link
URL: `https://turbulentrefreshments.com/rxcmrgifsa?key=8d07e6464742bfb5835760dcf7a772a4`

Cooldown: **3 detik** (mencegah double-fire satu intent). `window.open()` dipanggil synchronous di dalam click handler.

**Trigger points (semua halaman):**
- Klik kartu drama (home — semua baris + search)
- Klik tombol "Putar" di hero
- Klik kartu "Lanjutkan Menonton"
- Klik "Tonton Sekarang" di modal detail
- Klik tombol episode (watch page)
- Klik area video (pause/play — user gesture sinkron, popup tidak diblok)
- `fullscreenchange` saat masuk fullscreen (best-effort — browser tertentu bisa memblok karena bukan click langsung)

**Why:** `window.open()` harus sinkron di dalam click handler — jika ada `await` sebelumnya atau dipanggil dari event non-gesture (seperti `pause`, `visibilitychange`), popup blocker akan membunuhnya secara diam-diam.

## Tidak ada banner auto-refresh
Banner dirender sekali saat halaman load. Tidak ada `setInterval` refresh — Adsterra mengelola rotasi dari sisi mereka via iframe.
