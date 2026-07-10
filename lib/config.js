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
  goodshort: {
    id: "goodshort",
    label: "GoodShort",
    adapterPath: "./lib/providers/goodshort.js",
    providers: [
      { id: "goodshort", label: "GoodShort" },
    ],
  },
  shortmax: {
    id: "shortmax",
    label: "ShortMax",
    adapterPath: "./lib/providers/shortmax.js",
    providers: [
      { id: "shortmax", label: "ShortMax" },
    ],
  },
  reelshort: {
    id: "reelshort",
    label: "ReelShort",
    adapterPath: "./lib/providers/reelshort.js",
    providers: [
      { id: "reelshort", label: "ReelShort" },
    ],
  },
  dramabite: {
    id: "dramabite",
    label: "DramaBite",
    adapterPath: "./lib/providers/dramabite.js",
    providers: [
      { id: "dramabite", label: "DramaBite" },
    ],
  },
};

const DEFAULT_PLATFORM = "dramabox";

module.exports = { PLATFORMS, DEFAULT_PLATFORM };
