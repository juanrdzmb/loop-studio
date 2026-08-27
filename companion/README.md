# Loop Studio Companion

Servidor local (puerto **8787**) que usa la pestaña **Video + Canción**:
detecta loops, identifica al personaje, arma el pack de YouTube y renderiza el MP4.

## Instalación (una vez)

```bash
# uv gestiona Python 3.12 aislado
curl -LsSf https://astral.sh/uv/install.sh | sh
source ~/.bashrc

# detector de loops de música (CLI)
uv tool install pymusiclooper

# ffmpeg
sudo apt install ffmpeg   # Debian/Fedora: dnf install ffmpeg

cd companion
./start.sh                # crea .venv e instala requirements.txt
```

## Uso

```bash
./start.sh
# → http://localhost:8787/health
```

La app muestra «Companion activo» cuando responde.

## API

| Endpoint | Qué hace |
|---|---|
| `GET /health` | pymusiclooper, loopycut, ffmpeg, librosa |
| `GET /assets` | overlays de atmósfera disponibles |
| `GET /characters` | los 4 protagonistas y si hay ensayo/fotos |
| `POST /identify/character` | video + rango → quién sale (estilo, nombre, `docs/refs/`) |
| `POST /youtube/pack` | `character`, `song`, `minutes` → título, descripción, tags, playlist |
| `POST /analyze/music` | PyMusicLooper |
| `POST /analyze/video` | LoopyCut (calidad = diferencia inicio/fin, no un 100 % inflado) |
| `POST /plan/layers` | atmósfera + SFX (opcional: vídeo para elegir overlay) |
| `POST /render` | ffmpeg: loop fundido + canción fundida + capas + marca de agua |

`params` de `/render`:

```json
{
  "videoStart": 0.5, "videoEnd": 3.5,
  "audioStart": 0, "audioEnd": 180,
  "targetDuration": 360,
  "preview": false,
  "plan": { "overlay": "fog", "watermark": true, "sfx": [] }
}
```

Si `targetDuration` es mayor que la canción, el companion funde final→inicio y la repite.

## Créditos

- [PyMusicLooper](https://github.com/arkrow/PyMusicLooper) (MIT)
- [LoopyCut](https://github.com/carmelosantana/loopycut-cli) (CC-BY-4.0)
