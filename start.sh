#!/usr/bin/env bash
# Loop Studio — arranca la app web + el companion juntos
set -e
cd "$(dirname "$0")"

echo "🌀 Loop Studio"
echo "──────────────"

# Companion (si falla, la app sigue funcionando sin la pestaña Video+Canción)
if [ -d companion ]; then
  (cd companion && ./start.sh > /tmp/loop-studio-companion.log 2>&1 &)
  echo "✓ Companion iniciando en http://localhost:8787 (log: /tmp/loop-studio-companion.log)"
fi

# App web
echo "✓ App web en http://localhost:3000"
npm run dev
