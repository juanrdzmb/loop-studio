# 🌀 Loop Studio

Estudio de loops que corre 100 % en tu máquina: **GIFs pixel art con loop perfecto**, **slowed + reverb con efectos profesionales**, **combinación GIF + música → MP4** y **videos con loop perfecto sincronizados con canciones**.

Nada sale de tu equipo: todo el procesamiento de video/audio ocurre en el navegador (WebCodecs + Web Audio API). Solo la pestaña "Video + Canción" usa un pequeño companion local en Python para detección de loops con [PyMusicLooper](https://github.com/arkrow/PyMusicLooper) y [LoopyCut](https://github.com/carmelosantana/loopycut-cli).

## 🚀 Arranque rápido

### 1. App web (siempre)
```bash
cd ~/Proyectos/loop-studio
npm install          # solo la primera vez
npm run dev          # → http://localhost:3000
```

### 2. Companion (solo para la pestaña "Video + Canción")
```bash
cd ~/Proyectos/loop-studio/companion
./start.sh           # → http://localhost:8787 (crea el venv e instala deps solo la primera vez)
```
La app detecta el companion automáticamente: si está apagado, la pestaña "Video + Canción" te lo indica; todo lo demás funciona sin él.

### Todo de una vez
```bash
./start.sh           # arranca app + companion juntos
```

## 📖 Las 4 herramientas

| Pestaña | Qué hace | Necesita companion |
|---|---|---|
| **GIF Studio** (`/`) | Recorta un video, elige modo de loop (Normal / Boomerang / Crossfade / Auto-MSE), estilo pixel art (Game Boy, NES, Anime Lo-Fi, 8-Bit…) con **preview exacto** y descarga el GIF | ❌ Todo en tu navegador |
| **Slowed + Reverb** (`/slowed-reverb`) | Ralentiza canciones con reverb de placa Dattorro, bass boost, rotación 8D, crackle de vinilo, ancho estéreo — todo en tiempo real. Exporta WAV | ❌ Todo en tu navegador |
| **Combinar → MP4** (`/combinar`) | Tu GIF ya editado + la canción slowed → **MP4 (H.264 + AAC)** listo para YouTube, renderizado con WebCodecs | ❌ Todo en tu navegador |
| **Video + Canción** (`/video-loop`) | Elige un loop de video (con **mini-preview en hover**), decide la duración final en minutos, escucha los loops de la canción en la **waveform interactiva**, recórtala a mano o usa la canción completa → **MP4 limpio con ffmpeg** | ✅ Sí |

## 🎬 Flujo recomendado: GIF pixel art con música

1. **GIF Studio**: sube el video → recorta → elige loop y estilo → mira el **preview exacto** → Generar GIF
2. **Slowed + Reverb**: sube la canción → ajusta velocidad/reverb en vivo → Exportar WAV
3. **Combinar → MP4**: tu GIF llega ya editado (no se re-procesa) + el WAV → preview conjunto → Generar MP4 → subir a YouTube

## 🎥 Flujo recomendado: video largo con canción (loop perfecto)

1. Arranca el **companion** (`companion/start.sh`)
2. **Video + Canción**: sube tu video → "Detectar loops automáticos" (LoopyCut, tarda segundos) → **pasa el cursor por las tarjetas para ver cada loop en bucle** → elige
3. Sube la canción y elige cómo obtener el audio:
   - **🎵 Loop detectado**: di cuántos **minutos** quieres que dure el video final; PyMusicLooper busca loops de esa duración alineados a beats. **Clic en la onda** para escuchar cada loop.
   - **✂️ Recortar a mano**: arrastra sobre la onda y quédate con el trozo que quieras.
   - **🎶 Canción completa**: el fragmento de video se repite hasta cubrirla.
4. Elige cómo unirlos — **corte directo o crossfade** · **repetir el video o estirarlo** — el **preview ya muestra el resultado** con audio antes de generar
5. Generar MP4 → descargar

## ✨ Detalles técnicos

- **Preview exacto del GIF**: el preview usa el mismo pipeline que la exportación (extracción → loop → estilo → cuantización), así que lo que ves es pixel-perfect al resultado.
- **Cuantización global**: una sola paleta para todo el GIF (sin parpadeo de color entre frames) + dithering Bayer adaptativo que suaviza degradados.
- **Extracción de frames rápida**: mediabunny + WebCodecs decodifican cada paquete una sola vez (~10× más rápido que seek por frame), con fallback automático a `<video>`.
- **Reverb de placa Dattorro** (AudioWorklet, dominio público): red de delay/feedback modulada, el estándar de oro algorítmico. El preview en vivo y el export WAV usan el mismo motor.
- **Detección de loops veloz**: LoopyCut analiza frames reducidos con stride adaptativo y ventana configurable (por defecto los primeros 120 s, editable en la UI) — segundos en vez de minutos.
- **Render MP4**: el companion usa ffmpeg (H.264 + AAC, `+faststart`); la pestaña Combinar usa WebCodecs vía mediabunny acelerado por hardware.

## 🧪 Pruebas

```bash
npm run lint
npm run build
# Con la app y el companion corriendo:
node scripts/e2e.mjs           # flujo GIF completo (9 pruebas)
node scripts/e2e-live.mjs      # controles en vivo de audio (8)
node scripts/e2e-session.mjs   # GIF editado → Combinar sin re-editar (12)
node scripts/e2e-videoloop.mjs # Video + Canción (requiere companion) (8)
```
Los scripts usan Chromium de Playwright y generan sus medios de prueba en `/tmp/opencode/loop-e2e`.

## 🧰 Requisitos

- **Node.js 20+** (app web)
- **ffmpeg** en PATH (companion)
- Para "Video + Canción": **uv** (instala solo) → `curl -LsSf https://astral.sh/uv/install.sh | sh`, luego `companion/start.sh` instala el resto automáticamente
- Navegador con WebCodecs (Chrome/Edge) para la extracción rápida de frames y el render de Combinar; hay fallback para otros navegadores

## 📁 Estructura

```
loop-studio/
├── src/
│   ├── app/                  # 4 páginas (GIF, Slowed, Combinar, Video+Canción)
│   ├── components/           # UI compartida + previews en vivo + waveform
│   └── lib/                  # pipelines (frames, loops, estilos, GIF, MP4, audio)
├── public/
│   └── dattorro.worklet.js   # placa de reverb Dattorro (AudioWorklet)
├── companion/                # servidor Python local (PyMusicLooper + LoopyCut + ffmpeg)
│   ├── server.py             # API: /health /analyze/music /analyze/video /render
│   ├── start.sh
│   └── loopycut/             # clon de carmelosantana/loopycut-cli (vendido)
├── scripts/                  # pruebas E2E (playwright-core + Chromium local)
└── start.sh                  # arranca app + companion
```

### API del companion (localhost:8787)

| Endpoint | Método | Descripción |
|---|---|---|
| `/health` | GET | Estado y herramientas disponibles |
| `/analyze/music` | POST | PyMusicLooper: candidatos de loop (`min_duration`, `max_duration`, `candidates`) |
| `/analyze/video` | POST | LoopyCut en frames reducidos: candidatos de loop (`window_sec`, `downsample`, `similarity`) |
| `/render` | POST | ffmpeg: une el loop de video con el segmento de canción → MP4 |

## 📄 Créditos

- [PyMusicLooper](https://github.com/arkrow/PyMusicLooper) (MIT) — detección de loop points en música
- [LoopyCut](https://github.com/carmelosantana/loopycut-cli) (CC-BY-4.0) — detección de loop visual por SSIM
- [fadeloop](https://github.com/flatpickles/fadeloop) — algoritmo de crossfade loop
- [DattorroReverbNode](https://github.com/khoin/DattorroReverbNode) (dominio público) — motor de reverb placa Dattorro del Slowed + Reverb
- [mediabunny](https://github.com/Vanilagy/mediabunny) · [gifenc](https://github.com/mattdesl/gifenc) · [pixelit](https://github.com/giventofly/pixelit) (algoritmo)
