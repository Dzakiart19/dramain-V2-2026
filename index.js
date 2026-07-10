/**
 * Entry point Firebase Cloud Functions (2nd gen) — membungkus app Express
 * yang sama dipakai di Replit (./server.js, ./lib/**) supaya tidak ada
 * logika ganda antara jalur Replit dan jalur Firebase. Firebase Hosting
 * me-rewrite semua request ke fungsi `app` ini (lihat firebase.json).
 *
 * File ini HANYA dipakai oleh runtime Firebase Functions — tidak disentuh
 * oleh workflow Replit (yang menjalankan `node server.js` langsung).
 *
 * Secret ANICHIN_API_KEY dibaca dari Firebase Secret Manager (bukan
 * .env) lewat `defineSecret` + opsi `secrets`. Firebase mengisi
 * process.env.ANICHIN_API_KEY otomatis di runtime saat secret dibind,
 * jadi lib/providers/shortdramavid.js (yang membaca process.env
 * langsung) tetap berfungsi tanpa perlu diubah.
 */
const { onRequest } = require("firebase-functions/v2/https");
const { defineSecret } = require("firebase-functions/params");

const anichinApiKey = defineSecret("ANICHIN_API_KEY");
const app = require("./server");

exports.app = onRequest(
  {
    secrets: [anichinApiKey],
    region: "asia-southeast2",
    memory: "256MiB",
    timeoutSeconds: 60,
  },
  app
);
