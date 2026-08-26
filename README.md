# Loop Studio

Soy Juan. Monté esto para hacer **loops de video + canción slowed/reverb** listos para YouTube (marca Silent Vigil Music) sin subir nada a la nube. También sirve para GIFs pixel art y para combinar un GIF con el WAV.

Todo corre en tu máquina. El navegador hace GIF, slowed y Combinar. La pestaña **Video + Canción** habla con un companion local en Python (`:8787`) para detectar loops, personaje, atmósfera y renderizar con ffmpeg.

Repo: https://github.com/juanrdzmb/loop-studio

## Qué hace

| Pestaña | Para qué la uso | Companion |
|---|---|---|
| **GIF Studio** `/` | Recorto, elijo el loop, aplico estilo pixel y bajo el GIF (el preview es el mismo pipeline que el export) | No |
| **Slowed + Reverb** `/slowed-reverb` | Bajo el tempo con reverb Dattorro, vinilo, 8D… exporto WAV | No |
| **Combinar** `/combinar` | GIF ya editado + WAV → MP4 en el navegador | No |
| **Video + Canción** `/video-loop` | Loop de video + canción a N minutos + niebla/SFX/marca + pack de YouTube | Sí |

## Instalar

Necesitas **Node 20+**, **ffmpeg** y, para Video + Canción, **uv**.

```bash
git clone https://github.com/juanrdzmb/loop-studio.git
cd loop-studio
npm install

# companion (una vez)
curl -LsSf https://astral.sh/uv/install.sh | sh
source ~/.bashrc
uv tool install pymusiclooper
# Debian/Ubuntu:
sudo apt install ffmpeg
# Fedora:
# sudo dnf install ffmpeg

chmod +x start.sh companion/start.sh
```

Arranque:

```bash
./start.sh
# App    → http://localhost:3000
# Companion → http://localhost:8787/health
```

O por separado: `npm run dev` y `companion/start.sh`.

Si el 8787 está ocupado, mata el Python viejo (`ss -ltnp | grep 8787`) y vuelve a lanzar el companion. El badge de la pestaña tiene que decir **Companion activo**.

## Cómo lo uso (Video + Canción)

1. Subo el clip. Pulso **Encontrar loops suaves**. Paso el cursor por las tarjetas (calidad = qué tan bien encaja el final con el inicio; ya no sale todo a 100 %).
2. Subo la canción. Por defecto va **entera**. Si pido más minutos de los que dura, el companion **funde el final con el inicio** y la repite. Si pido menos, no la corta en loop: usa el trozo.
3. Pongo los minutos (`1m 3m 5m 10m 30m 1h`).
4. Atmósfera: automático (mira el clip: fuego, niebla, lluvia…) o la elijo yo. **Ver cómo quedaría (20 s)** y luego **Generar**.
5. La marca **Silent Vigil Music** (Montserrat, sin ©) recorre el **borde superior**.
6. Al subir el video detecta si es **Guts, Thorfinn, Musashi o Buntarō**. Puedo corregirlo. Ahí mismo copio título, descripción, tags, playlist y comentario anclado — salen de los ensayos en `docs/`.

No hay “corte vs speed vs crossfade”: el video siempre se funde; la duración que pido manda.

## Archivos que no van al git (los pongo yo en local)

```
assets/
  overlays/          fog.mp4 smoke.mp4 rain.mp4 particles.mp4 Fire.mp4 …
  audio_ambience/    night, wind, rain, thunder.mp3, sword.mp3, katana.mp3 …
docs/refs/
  guts/ thorfinn/ musashi/ buntaro/    # capturas jpg/png/webp (no hace falta AVIF)
```

`assets/README.md` y `docs/refs/README.md` dicen los nombres. Sin overlays, el render funciona igual, solo que sin niebla. Sin fotos en `refs/`, el personaje se adivina por el dibujo y el nombre del archivo; con fotos acierta más.

## Adaptarlo a tu canal

No está atado a Silent Vigil. Cambia esto y es tuyo:

| Quieres… | Dónde |
|---|---|
| Otra marca de agua | `companion/watermark.py` → `BRAND` y la fuente |
| Otros overlays / SFX | `assets/` + `companion/catalog.py` (`OVERLAYS`, `AMBIENCE`, `SFX`) |
| Otros protagonistas | `companion/characters.py` → dict `CHARACTERS` (id, series, hashtags, `filename_keys`) |
| Otros ensayos para YouTube | sustituye los `.md` de `docs/` (el pack lee el texto al vuelo) |
| Otras caras de referencia | `docs/refs/<id>/*.jpg` — jpg/png/webp, da igual el peso |
| Otro puerto | app `npm run dev -- -p …`; companion en `companion/start.sh` |

Los ids de `CHARACTERS` tienen que coincidir con la carpeta `docs/refs/<id>/` y con una palabra en el nombre del `.md` (`Guts.md`, `Thorfinn.md`, `Miyamoto Musashi.md`, `Buntarō Mori.md`).

## Cómo detecto al personaje

1. Nombre del archivo (`guts`, `berserk`, `thorfinn`, `vinland`, `musashi`, `vagabond`, `buntaro`, `climber`, `k2`…).
2. Histograma frente a `docs/refs/<id>/`.
3. Estilo del fotograma: tinta (Vagabond), nieve (The Climber), oscuro/armadura (Berserk), frío (Vinland).

Siempre elige uno de los cuatro. Si se equivoca, lo cambio a mano en la UI.

## Pack de YouTube (lo que copio al subir)

Sigo lo que funciona ahora en el nicho slowed + reverb / aesthetic:

- Título corto, keywords delante: `Tema (Slowed + Reverb) | The Black Swordsman`
- Descripción: *slowed reverb + serie + study/sleep* en las dos primeras líneas, luego un recorte del ensayo, CTA, playlist, 3–5 hashtags
- Thumbnail: un fotograma limpio, poco texto
- Comentario anclado: una pregunta
- La música entra al segundo 0 (el render no lleva intro)

## Pruebas

```bash
npm run lint
npm run build
# app en :3000 y companion en :8787
node scripts/e2e.mjs
node scripts/e2e-live.mjs
node scripts/e2e-session.mjs
node scripts/e2e-videoloop.mjs
```

Los e2e fabrican clips en `/tmp/opencode/loop-e2e`.

## Detalles que me importan

- GIF: una paleta global + dither Bayer (sin pixelar el modo Original).
- Slowed: seek en el dominio de la fuente, Dattorro en worklet, no re-decodifica el buffer.
- Video loop: LoopyCut a resolución baja; la **calidad** es la diferencia real inicio/fin.
- Capas: ffmpeg `blend=screen`, ambiente con low-pass, SFX en valles RMS (librosa) y tipo de SFX según el look del clip.
- Canción más corta que el target: acrossfade final→inicio y `stream_loop` (sin `-shortest`, que cortaba el vídeo).

## Requisitos

- Node 20+, Chrome/Edge (WebCodecs; hay fallback)
- ffmpeg, uv, Python 3.12 (lo crea `companion/start.sh`)
- Font de marca: Montserrat Light en el sistema (`/usr/share/fonts/julietaula-montserrat-fonts/`); si no, Liberation Sans

## Créditos

[PyMusicLooper](https://github.com/arkrow/PyMusicLooper) · [LoopyCut](https://github.com/carmelosantana/loopycut-cli) · [fadeloop](https://github.com/flatpickles/fadeloop) · [DattorroReverbNode](https://github.com/khoin/DattorroReverbNode) · [mediabunny](https://github.com/Vanilagy/mediabunny) · [gifenc](https://github.com/mattdesl/gifenc)
