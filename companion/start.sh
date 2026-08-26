#!/usr/bin/env bash
# Loop Studio Companion — arranca el servidor local en http://localhost:8787
set -e
cd "$(dirname "$0")"

export PATH="$HOME/.local/bin:$PATH"
export LOOP_STUDIO_OUT="${LOOP_STUDIO_OUT:-$HOME/Música/Dark/Youtube/export}"
if [ ! -f .venv/bin/python ]; then
  echo "⚠️  Creando entorno virtual (primera vez)..."
  uv venv .venv --python 3.12
fi
uv pip install --python .venv/bin/python -q -r requirements.txt

echo "🌀 Loop Studio Companion en http://localhost:8787"
echo "   Health check: http://localhost:8787/health"
.venv/bin/python -m uvicorn server:app --host 127.0.0.1 --port 8787
