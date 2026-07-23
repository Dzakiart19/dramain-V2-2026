/**
 * Platform configuration.
 *
 * Cara menambah platform baru:
 * 1. Buat file adapter di lib/providers/{nama-platform}.js
 *    — ekspor 14 fungsi: search, detail, allepisode, subtitles, languages,
 *      stream, browse, trending, latest, vip, dubindo, foryou, notifications,
 *      hlsManifestUrl (lihat SKILL.md add-streaming-platform untuk kontrak lengkap)
 * 2. Tambahkan entry baru di PLATFORMS di bawah ini
 * 3. Tambah CDN hostname ke HLS_ALLOWED_HOSTS di server.js (jika platform HLS)
 * 4. Restart server — selesai, tidak ada file lain yang perlu diubah.
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
  moboreels: {
    id: "moboreels",
    label: "MoboReels",
    adapterPath: "./lib/providers/moboreels.js",
    providers: [
      { id: "moboreels", label: "MoboReels" },
    ],
  },
  dramawave: {
    id: "dramawave",
    label: "DramaWave",
    adapterPath: "./lib/providers/dramawave.js",
    providers: [
      { id: "dramawave", label: "DramaWave" },
    ],
  },
};

const DEFAULT_PLATFORM = "goodshort";

module.exports = { PLATFORMS, DEFAULT_PLATFORM };
