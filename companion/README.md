# Loop Studio Companion

Servidor Python local que da superpoderes a la pestaña **"Video + Canción"**:
detecta los puntos de loop perfectos de canciones (PyMusicLooper) y de videos
(LoopyCut, SSIM), y renderiza el MP4 final con ffmpeg.

## Instalación (una vez)

```bash
# 1) uv (gestiona Python aislado para PyMusicLooper)
curl -LsSf https://astral.sh/uv/install.sh | sh
source ~/.bashrc   # o reinicia la terminal

# 2) PyMusicLooper (usa su propio Python 3.12, aislado de tu sistema)
uv tool install pymusiclooper

# 3) ffmpeg si no lo tienes
sudo apt install ffmpeg   # Debian/Ubuntu

# 4) Dependencias del companion + LoopyCut (automático en el primer arranque)
cd ~/Proyectos/loop-studio/companion
./start.sh
```

## Uso

```bash
./start.sh
# → http://localhost:8787
```

Déjalo corriendo mientras usas la app. La pestaña "Video + Canción" muestra
"● Companion activo" cuando lo detecta.

## API

| Endpoint | Descripción |
|---|---|
| `GET /health` | Estado de pymusiclooper / loopycut / ffmpeg |
| `POST /analyze/music` | multipart: `audio`, `min_duration`, `max_duration` → candidatos de loop `{start, end, duration, score}` |
| `POST /analyze/video` | multipart: `video`, `length` (0=auto), `downsample`, `similarity` → candidatos de loop visual |
| `POST /render` | multipart: `video`, `audio`, `params` (JSON) → MP4 H.264/AAC |

`params` para `/render`:
```json
{
  "videoStart": 1.4, "videoEnd": 4.4,
  "audioStart": 7.5, "audioEnd": 18.9,
  "videoMode": "cut" | "crossfade",
  "crossfadeSec": 0.6,
  "syncMode": "repeat" | "speed"
}
```

## Créditos

- [PyMusicLooper](https://github.com/arkrow/PyMusicLooper) por arkrow (MIT)
- [LoopyCut](https://github.com/carmelosantana/loopycut-cli) por Carmelo Santana (CC-BY-4.0)
