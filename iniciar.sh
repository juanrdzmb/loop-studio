#!/usr/bin/env bash
# ==============================================================================
# Loop Studio - Lanzador Universal Todo-en-Uno
# Abre todas las herramientas (GIF Studio, Slowed+Reverb, Video+Song, Manga Motion)
# ==============================================================================

set -e
PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$PROJECT_DIR"

echo "========================================================"
echo "  🌀 Iniciando Loop Studio (Todo-en-Uno) 🌀"
echo "========================================================"
echo "  Herramientas integradas:"
echo "   [1] 🌀 GIF Studio (Perfect Loops)"
echo "   [2] 📻 Slowed + Reverb (Efectos de Audio)"
echo "   [3] 🎬 Combine -> MP4"
echo "   [4] 🎥 Video + Song"
echo "   [5] ✨ Manga Motion 2.5D (HD 60 FPS)"
echo "========================================================"
echo ""

# Verificar dependencias
if [ ! -d "node_modules" ]; then
    echo "📦 Instalando dependencias de Node.js..."
    npm install
fi

# Iniciar servidor Next.js
PORT=3000
echo "🚀 Levantando servidor en http://localhost:$PORT ..."

# Intentar abrir el navegador en segundo plano tras 2 segundos
(
    sleep 2
    if command -v xdg-open > /dev/null; then
        xdg-open "http://localhost:$PORT" 2>/dev/null || true
    elif command -v open > /dev/null; then
        open "http://localhost:$PORT" 2>/dev/null || true
    fi
) &

npm run dev
