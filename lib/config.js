/**
 * Platform configuration.
 *
 * Cara menambah platform baru:
 * 1. Buat file adapter di lib/providers/{nama-platform}.js
 *    — ekspor: search, detail, stream, browse, notifications
 * 2. Tambahkan entry baru di PLATFORMS di bawah ini
 * 3. Restart server — selesai, tidak ada file lain yang perlu diubah.
 *
 * Cara menambah provider baru ke platform yang sudah ada:
 * 1. Tambahkan { id, label } ke array providers platform tersebut
 * 2. Restart server.
 */

const PLATFORMS = {
  dramabox: {
    id: "dramabox",
    label: "DramaBox",
    adapterPath: "./lib/providers/shortdramavid.js",
    providers: [
      { id: "dramabox", label: "DramaBox" },
    ],
  },
  pinedrama: {
    id: "pinedrama",
    label: "PineDrama",
    adapterPath: "./lib/providers/pinedrama.js",
    providers: [
      { id: "pinedrama", label: "PineDrama" },
    ],
  },
};

const DEFAULT_PLATFORM = "dramabox";

module.exports = { PLATFORMS, DEFAULT_PLATFORM };
