#!/bin/bash
set -e

echo "================================================"
echo "  DRAMAIN AJA — Deploy to Firebase Hosting"
echo "================================================"
echo "  Backend (Express + HLS proxy) tetap di Replit."
echo "  Firebase Hosting hanya melayani file statis public/."
echo "================================================"

# ── Cek REPLIT_BACKEND_URL secret ────────────────────────────────────────────
if [ -z "$REPLIT_BACKEND_URL" ]; then
  echo ""
  echo "  ❌ ERROR: Secret REPLIT_BACKEND_URL belum diset."
  echo ""
  echo "  Cara set:"
  echo "  1. Buka tab Secrets di Replit (ikon kunci 🔑)"
  echo "  2. Tambah key : REPLIT_BACKEND_URL"
  echo "  3. Value      : URL Replit kamu, contoh:"
  echo "                  https://dramain-aja.username.replit.app"
  echo ""
  echo "  URL itu adalah deployment Replit yang menjalankan node server.js."
  echo "  Kalau belum deploy Replit dulu, publish lewat tombol Deploy di Replit,"
  echo "  baru jalankan script ini."
  echo ""
  exit 1
fi

echo ""
echo "[1/3] Backend URL : $REPLIT_BACKEND_URL"

# ── Patch config.js sementara ─────────────────────────────────────────────────
CONFIG="public/config.js"
cp "$CONFIG" "${CONFIG}.bak"

# Selalu kembalikan config.js ke placeholder setelah script selesai,
# bahkan bila deploy gagal atau di-Ctrl+C.
restore_config() {
  if [ -f "${CONFIG}.bak" ]; then
    mv "${CONFIG}.bak" "$CONFIG"
    echo "      config.js dikembalikan ke placeholder."
  fi
}
trap restore_config EXIT

# Escape karakter khusus (/, &, \) di URL sebelum dipakai sebagai replacement sed
ESCAPED_URL=$(printf '%s' "$REPLIT_BACKEND_URL" | sed 's|[&/\]|\\&|g')
sed -i "s|__REPLIT_BACKEND_URL__|${ESCAPED_URL}|g" "$CONFIG"
echo "[2/3] config.js sudah di-patch dengan URL backend."

# ── Deploy ke Firebase Hosting ────────────────────────────────────────────────
echo "[3/3] Deploying ke Firebase Hosting (--only hosting)..."
npx firebase deploy --only hosting --project dramain-aja

echo ""
echo "================================================"
echo "  Deploy selesai!"
echo "  Live di : https://dramain-aja.web.app"
echo "  Backend : $REPLIT_BACKEND_URL"
echo "================================================"
