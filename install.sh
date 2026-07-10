#!/usr/bin/env bash
# install.sh — Instal semua dependency Dramain Aja dalam satu kali jalan:
#   1. Dependency aplikasi (satu package.json untuk Replit & Firebase Functions
#      sekaligus — lihat server.js vs index.js)
#   2. Firebase CLI (lokal ke proyek ini, dipanggil lewat `npx firebase`)
#
# Pakai:
#   chmod +x install.sh   (sekali saja, kalau belum executable)
#   ./install.sh
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT_DIR"

echo "==> [1/2] Instal dependency aplikasi (Express + Firebase Functions SDK)"
npm install

echo "==> [2/2] Instal Firebase CLI (devDependency lokal, dipakai lewat 'npx firebase')"
npm install --no-save firebase-tools

echo ""
echo "Selesai. Semua dependency sudah terinstall."
echo ""
echo "Jalankan aplikasi secara lokal (Express murni, tanpa Firebase):"
echo "  npm start"
echo ""
echo "Deploy ke Firebase (perlu login dulu — sekali saja per environment):"
echo "  npx firebase login"
echo "  npx firebase deploy --only functions,hosting --project dramain-aja"
