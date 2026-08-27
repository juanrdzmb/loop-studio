#!/usr/bin/env bash
# ==============================================================================
# 🌀 Loop Studio - Lanzador Maestro Todo-en-Uno (Frontend + Companion)
# Inicia automáticamente la Web App (:3000) y el Companion Python (:8787)
# ==============================================================================

set -e
PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$PROJECT_DIR"
export PATH="$HOME/.local/bin:$PATH"

echo "========================================================"
echo "  🌀 Iniciando Loop Studio Todo-en-Uno 🌀"
echo "========================================================"
echo "  Herramientas activas:"
echo "   [1] 🌀 GIF Studio (Perfect Loops)"
echo "   [2] 📻 Slowed + Reverb (Efectos de Audio)"
echo "   [3] 🎬 Combine -> MP4"
echo "   [4] 🎥 Video + Song (Companion Local Online)"
echo "   [5] ✨ Manga Motion 2.5D (HD 60 FPS)"
echo "========================================================"
echo ""

# Limpiar puertos ocupados previos si existen
fuser -k 8787/tcp 2>/dev/null || true

# 1. Asegurar entorno de Python Companion
echo "🐍 Verificando Companion local (PyMusicLooper + FFmpeg)..."
if [ ! -d "companion/.venv" ]; then
    echo "📦 Configurando entorno virtual del Companion..."
    cd companion
    if command -v uv > /dev/null; then
        uv venv .venv --python 3.12 2>/dev/null || uv venv .venv
        uv pip install --python .venv/bin/python -q -r requirements.txt
    else
        python3 -m venv .venv
        .venv/bin/pip install -q -r requirements.txt
    fi
    cd "$PROJECT_DIR"
fi

# 2. Iniciar Companion en segundo plano
echo "🚀 Levantando Companion en http://localhost:8787 ..."
(
    cd companion
    .venv/bin/python -m uvicorn server:app --host 127.0.0.1 --port 8787 --log-level warning
) &
COMPANION_PID=$!

# Función para cerrar todo al salir con Ctrl+C
cleanup() {
    echo ""
    echo "🛑 Cerrando Loop Studio y Companion..."
    kill $COMPANION_PID 2>/dev/null || true
    exit 0
}
trap cleanup SIGINT SIGTERM EXIT

# Esperar a que el companion esté online
for i in {1..10}; do
    if curl -s http://127.0.0.1:8787/health > /dev/null; then
        echo "🟢 Companion Online correctamente."
        break
    fi
    sleep 0.5
done

# 3. Asegurar dependencias de Node.js
if [ ! -d "node_modules" ]; then
    echo "📦 Instalando dependencias de Node.js..."
    npm install
fi

# 4. Abrir navegador automáticamente
(
    sleep 2
    if command -v xdg-open > /dev/null; then
        xdg-open "http://localhost:3000" 2>/dev/null || true
    elif command -v open > /dev/null; then
        open "http://localhost:3000" 2>/dev/null || true
    fi
) &

# 5. Iniciar Next.js App
echo "🌐 Servidor Web disponible en http://localhost:3000"
echo "Presiona Ctrl+C para detener todos los servicios."
echo ""
npm run dev
