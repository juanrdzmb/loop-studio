<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Loop Studio

Suite 100% local para loops de video estilo Manga Motion 2.5D. Next.js 16 + React 19 + Tailwind 4. Todo el render de video/audio corre en el navegador vía **mediabunny** (WebCodecs); el backend Python ("companion") es opcional.

## Comandos

```bash
npm run dev            # app en :3000 (sin companion)
./iniciar.sh           # app :3000 + companion Python :8787 (instala .venv solo si falta)
npm run build          # build producción (usar antes de empezar para probar con `next start`)
npx tsc --noEmit       # typecheck
npm run lint           # eslint — estado actual: 0 errores (los warnings son de páginas legacy)
node scripts/e2e-dual-studio-export.mjs   # e2e de calidad de export 16:9 (requiere server arriba)
node scripts/e2e-dual-studio-export-2k.mjs   # e2e export 2K 2560×1440 nativo (resolución, integridad, PSNR)
node scripts/e2e-dual-studio-export-vertical.mjs   # e2e export 9:16 pingpong + botón Cancelar
node scripts/e2e-audio-smoke.mjs   # smoke sin companion (tema completo + Short 25/30 + metadatos/SFX)
node scripts/e2e-audio-playlist.mjs   # playlist múltiple, efecto por pista y play fiable a un clic
node scripts/e2e-audio-sfx-export.mjs   # e2e Short one-shot + master 48 kHz + SFX a 10 s
node scripts/e2e-visual-loop-auto.mjs   # e2e LoopyCut sourceStart/sourceEnd (requiere companion)
node scripts/e2e-extend-loop.mjs   # e2e modo Extender 9:16 (clip 6s estirado a Short 15s, rate 0.4x)
node scripts/e2e-landscape-to-vertical.mjs   # e2e fuente 1920x1080 → Short 9:16 por cover (sin deformar, FPS 24)
node scripts/test_extend_rate.mjs   # tests puros de la matemática del modo Extender
node scripts/test_pingpong_loop.mjs   # tests puros del boomerang suave (cadencia, transición, ciclo exacto)
node scripts/test_video_stabilization.mjs   # tests puros de la estabilización de microvibración
node scripts/e2e-particles-continuous.mjs   # e2e partículas continuas en el tiling + estabilización (requiere server :3210)
node scripts/test_audio_repetitions.mjs   # tests puros de N vueltas de audio (duración exacta, −1 dBFS)
node scripts/test_audio_playlist.mjs   # orden, resampling 48 kHz, fundidos y duración de playlist
node scripts/test_youtube_pack.mjs   # tests puros del copy de publicación
node scripts/diag-audio-upload.mjs   # diagnóstico: bloqueo/memoria al subir canciones en dual-studio (requiere server)
node scripts/e2e-real-sample-export.mjs   # export Natural del ejemplo real Prueba.mp4
node scripts/e2e-edit-studio.mjs   # multiclip, beat, capas de efecto, música y export de Edit Studio
companion/.venv/bin/python scripts/test_companion_video_loop.py   # ranking/contrato LoopyCut
```

Orden de verificación: `npx tsc --noEmit` → `npm run lint` → `npm run build`. No hay unit tests; la verificación funcional son los scripts e2e en `scripts/` (playwright-core). `npm run test:e2e` solo ejecuta `e2e.mjs`; los demás se corren individualmente.

## Páginas (src/app/)

- **`/dual-studio`** — el estudio principal que usa el dueño del proyecto: slots 16:9 + 9:16, continuidad LoopyCut, playlist con slowed+reverb por pista, SFX por formato, export individual o batch. Es el archivo más activo (~4900 líneas).
- **`/edit-studio`** — montaje multiclip al beat: timeline, transiciones, textos, música, SFX, partículas y export MP4. Complementa a dual-studio para edits con varias tomas.
- `/manga-motion` — estudio alternativo (textos manga, katana). Comparte el mismo motor de export.
- `/video-loop` — legacy, depende 100% del companion Python; solo tocar si se pide explícitamente.
- `/combinar`, `/slowed-reverb` — utilidades del flujo GIF. `loopProcessor.ts`/`loopStrategy.ts` son de GIF Studio, no de dual-studio.

### Edit Studio (`/edit-studio`) — 9:16 Shorts

Montaje multiclip vertical al beat para Shorts (9:16 fijo, 1080×1920). Timeline arrastrable con rail de beat, waveform y 7 transiciones + 8 movimientos por toma + velocidad con curva. Librerías:
- `src/lib/editStudio.ts` — `EditProject` (9:16 fijo, `fps 30|60`, BPM 128 default), `EditTimelineClip` con `transition` (`cut|punch|shake|zoom|flash|whip|crossfade`), `motion` (`static|push|drift|whip|vertigo|spiral|scan|impact`), `motionIntensity` 0..100, `playbackRate` 0.5..2.0 y `velocityCurve` (`linear|easeIn|easeOut|punch`); helpers `editSourceTimeAt`/`applyVelocityCurve` (warping 0→1 con rate), `normalizeEditClip`, `editClipAtTime`, `buildBeatMarkers`/`snapEditTime`, `applyEditRhythmPreset` (reference 18s + build→drop con mapping punch/shake/zoom y motion push/drift/whip/impact) y `editOutputSize`.
- `src/lib/editStudioRender.ts` — `cameraForEditMotion` mapea 8 `EditMotion` a `CameraMovement`; `buildEditFrameConfig` usa `motionIntensity` por toma; `composeEditTransition` maneja 7 transiciones (cut/punch/zoom/shake/flash/whip/crossfade) con zoom punch + hitstop ghost, shake cromatismo leve, whip con trail y flash screen; `drawEditTextCue` con punch scale 0.82→1.06 + shake 2px en ventana 0.14s.
- `src/lib/editStudioExport.ts` — `exportEditStudioVideo` usa `editSourceTimeAt` por frame (no lineal), congela 3 frames en `punch` para hitstop, decodifica secuencial con `samplesAtTimestamps` y fallback de frames faltantes, pinta `renderMangaMotionFrame` + transición + texto punch + watermark, mezcla música 48kHz con limiter -1dB y SFX offline; cancela vía AbortSignal.
- `src/lib/editAudioAnalysis.ts` — `estimateBpmFromBuffer` (autocorrelación + snap a BPM comunes 60-200) y `getWaveformPeaks`/`getTimelineWaveformPeaks` (RMS+pico normalizado, buckets ≈ pxPerSecond*0.5) para waveform detrás del rail y `Detectar BPM`.

Particularidades: `ClipFrameCache` (540px, 18fps, 88MB) para preview RAF velocity-aware (`editSourceTimeAt`); export re-decoodifica a 1080×1920 nativo (siempre 9:16, `format` legacy migrado). Texto en coords 0..1, proyecto `.loop-edit.json` versionado con migración de `motionIntensity`/`playbackRate`/`velocityCurve`. Timeline muestra waveform fuchsia 22px + beats (barra cada 4 beats más gruesa), `Detectar BPM` y bulk `Punch/Shake/Cut` + `Push/Impact/Whip` + slider Energía global que propaga `motionIntensity` a todas las tomas.

Todos los archivos están trackeados en git. Las piezas core (`dual-studio/`, `edit-studio/`, componentes y librerías auxiliares) se commitean junto con la app.

## Motor de export (`src/lib/mangaMotionExport.ts`) — invariantes

Pipeline: decodifica el clip en streaming con WebCodecs → pinta UN ciclo con `renderMangaMotionFrame` → encode MP4 → remux-tile de paquetes H.264 hasta la duración objetivo (el remux no re-comprime; exportar 10 min cuesta ~lo mismo que el ciclo).

- **Nunca cachear frames completos con presupuesto de memoria**: hubo un bug donde un caché de 220 MB reescalaba el source a ~800×454 y arruinaba el 1080p (nitidez ~3%). El render actual es streaming a resolución nativa; el pingpong decodifica en segmentos invertidos (~150 MB). Si necesitas cachear, acota por segmento, no por clip.
- El fundido "smooth" conserva sólo el primer frame compuesto como JPEG (~0,3 MB) y lo decodifica bajo demanda; nunca retener ImageBitmaps full-res persistentes.
- Todo `await` crítico del export pasa por el watchdog `gate()` (`createExportWatchdog`): 15 s en el bucle de pintado (decode/encode por frame), 45 s en audio/finalize; el watchdog registra cada promesa gated por separado (un slot único huérfanaba la primera si dos `gate()` se solapaban). Un atasco lanza `ExportStallError` → el ciclo se re-renderiza automáticamente con la ruta de seeks (`renderCycleSeekBased`, encoder nuevo y limpio). Los `Output.cancel()` del camino de error van con techo de 3 s (`cancelOutputBounded`): la mutex del Output puede estar retenida por el mismo atasco y esperarla colgaría el catch tragándose el error. El export acepta `signal` (AbortSignal) → `ExportCancelledError`; la UI tiene botón Cancelar.
- **Errores de export visibles en la sección de export** (`dual-studio`): los 3 handlers (16:9, 9:16, batch) setean `exportError` + `exportStatusText` con "❌" en el catch — un bloque rojo dentro de la sección muestra el fallo y cómo reintentar. El banner rojo superior (`error`) sigue, pero puede quedar fuera del viewport: antes el usuario solo veía desaparecer el progreso. Cancelación = "⏹" sin bloque rojo. El fallo de guardado en disco no aborta el export: `saveExportMediaResult` (companion) devuelve `{path, error}` y la página pinta un aviso ámbar ("Companion no disponible…") manteniendo la descarga disponible.
- Los `VideoSample` se cierran SIEMPRE (try/finally por segmento y por frame): un sample sin close() dispara el aviso de GC de mediabunny y fuga memoria.
- El canvas de salida del export NO lleva `willReadFrequently` (solo recibe draws); forzaría raster CPU y ralentizaría los filtros.
- `keyFrameInterval` debe ser la duración del ciclo (1 keyframe por ciclo): así cada copia del tiling arranca en un IDR. `keyFrameInterval: 1` infla el archivo sin beneficio.
- Bitrate explícito (`new Quality({ bitrate })`): `QUALITY_HIGH` sin bitrate cae a ~6 Mbps en 1080p si el códec no soporta modo quantizer. El encoder del ciclo usa `latencyMode: "quality"`, `bitrateMode: "variable"` y cuantizador por códec con fallback por bitrate: AVC/HEVC 18, VP9 22, AV1 84. Bitrates de referencia 1080p: 12/16 Mbps (≤30 fps / >30 fps); 2K 1440p: 24/36 Mbps; 4K: 45/60 Mbps.
- **FPS fraccional conservado**: `detectSourceFps` mide la rate real por paquetes y la ancla a rates comunes (23.976, 24, 25, 29.97, 30, 48, 50, 59.94, 60) si está a ≤1.5 de una; nunca redondear a entero ni hardcodear 30.
- **Canvas fuente a resolución nativa**: el canvas intermedio usa `rawW/rawH` del vídeo (no el tamaño de salida); el recorte horizontal→9:16 se hace UNA sola vez por `cover` al pintar. Poner el canvas fuente a 9:16 antes de recortar deforma la imagen. Regresión: `e2e-landscape-to-vertical.mjs`.
- **Boomerang suave (`src/lib/pingPongLoop.ts`)**: velocidad constante en ambos tramos — la fuente NUNCA acelera ni se pausa. `getSmoothPingPongFrameState` centraliza tiempo/mezcla/dirección para preview y export; cerca de cada extremo se mezcla cosenoidalmente el frame estable del giro (`endpointMix` ≤0.55, 0.42 con movimiento alto) decodificado aparte (`decodePingPongEndpointFrames`, cerrados en `finally`). Transición adaptativa: 0.32 s movimiento bajo / 0.24 medio / 0.18 alto. `computeVisualCrossfadeDuration` devuelve 0 para pingpong (el giro ya está amortiguado; un segundo fundido sería doble transición). `calculateOrganicPingPongTime` se conserva por compatibilidad pero delega en la nueva función. Tests: `test_pingpong_loop.mjs`.
- **Estabilización de microvibración (`src/lib/videoStabilization.ts`)**: al cargar un clip se analiza con flujo óptico Lucas–Kanade sobre el cache del preview (`analyzeClipFrameStabilization`); separa jitter rápido de paneos con suavizado gaussiano (±0.35 s) y corrige solo la diferencia. La confianza por frame es el **condicionamiento del sistema LK** (`det/(xx·yy)`): la isotropía `4·det/(xx+yy)²` penalizaba bordes axis-aligned (testsrc2 → 0.66) y el `fit` (residual/diferencia temporal) colapsa a 0 con movimiento interno real, así que ninguno de los dos sirve como puerta; el `fit` se conserva solo como diagnóstico. Se activa si confianza ≥0.75, recorte ≤2 % (`cropScale` ≤1.02) y corrección ≤1.25 % por eje; preview y export comparten `sourceTransformAt`. El usuario puede desactivarla por formato (panel "Corrección de microvibración"). Tests: `test_video_stabilization.mjs`; e2e con fixture sintético ±2 px @6 Hz: `e2e-particles-continuous.mjs`.
- FPS del export = fps real del source vía `track.computePacketStats().averagePacketRate` (no hardcodear 30).
- Resolución de export = passthrough nativo (`resolveOutputSize` en `mangaMotionExport.ts`): lo que se sube es lo que sale (1080p→1080p, 2K 2560×1440→nativo, 4K→4K). La salida es el recorte nativo que el fit `cover` muestra del source según el aspecto configurado (fuentes con otro aspecto recortan, nunca estiran); suelo 1080p (fuentes pequeñas se normalizan a HD como siempre) y techo 4K (los encoders HW no garantizan más). 9:16 conserva 1080×1920 para fuentes horizontales recortadas (el recorte real es ≤1080p) y pasa a nativo con sources verticales ≥2K. `getFirstEncodableVideoCodec` se llama con `{width, height}` reales para que el códec elegido soporte la resolución. Regresión: `e2e-dual-studio-export-2k.mjs`.
- El audio master se procesa fuera con `buildProcessedOneShotBuffer` y entra con la duración final exacta; los SFX se mezclan a 48 kHz en `OfflineAudioContext` (`renderSfxCuesToOffline`) respetando `LoopSfxCue.targetFormat`. Un peak guard reduce todo el master si música+SFX superarían 0 dBFS y mediabunny codifica a 384 kbps.

### Color grading y film grain (`mangaMotionEngine.ts`)

`ColorGradeConfig` expone 8 parámetros (−100..100): `exposure`, `contrast`, `saturation`, `temperature`, `tint`, `fade` (negros lavados), `bloom`, `grain`. Se aplican en el pipeline del canvas como operaciones de píxel directas (nunca CSS) para que export y preview sean idénticos. El grain usa un patrón procedural de ruido (Seed 0x51f15e, 96×96) repetido (`getFilmGrainPattern`) que se escala con el parámetro `grain`. `DEFAULT_COLOR_GRADE` tiene todos a 0. Los presets visuales (Dark Fantasy, Retro 90s, Golden hour…) ahora se implementan como `ColorGradeConfig` en lugar de cadenas separadas; los contrastes se suavizaron ≤135 % y se eliminó `hue-rotate` de Dark Fantasy.

### Sistema de partículas (`mangaMotionEngine.ts`)

Tres nuevos tipos: `cinematic_dust` (polvo de lente), `snow_ash` (nieve y ceniza), `light_leaks` (fugas de luz). `ParticleControlOptions` expone 8 parámetros (tamaño, opacidad, viento, turbulencia, color, blendMode, blur, seed + loopDuration) que la UI puede manipular sin re-inicializar el sistema. El blend mode acepta `source-over`, `screen`, `lighter` y `soft-light`.

Particularidades cinemáticas:
- `cinematic_rain` fija velocidad al spawn (`vx0/vy0`) sin `Math.random()` por frame; streak alineado al vector real; densidad ligada a intensidad (48-120 gotas).
- `dark_ink_fog` / `cinematic_dust` / `light_leaks` usan movimiento en Lissajous (sin/cos lento) con opacidad permanente para nubes de tinta/polvo/luz.
- `snow_ash` (nieve) usa parábola descendente con deriva por viento.
- `embers_fire` / `golden_sparks` ascienden con onda senoidal lateral.

Cada canvas/slot tiene su propia instancia de `PhysicsParticleSystem`. El parámetro `dtScale` en `update()` normaliza las velocidades de streak al framerate real (1.0 = 60 fps, 0.5 = 30 fps) para que el export coincida con el preview. `resolveParticleRenderPlan` (`src/lib/particleLoop.ts`) decide cuántas copias visuales renderizar antes de remuxear (max 3 superciclos, 30 s tope) para que las partículas no reinicien en cada frontera de tiling corto.

### Watermark (`watermark.ts`)

`WatermarkStyleOptions` permite controlar posición (`bottom-center` | `bottom-left` | `bottom-right` | `top-center`), escala, tracking, color, ruleScale y offsetX/Y. `drawProfessionalWatermark` renderiza la firma en el canvas con sombreado y alineación tipográfica. `drawThumbnailChannelMark` se conserva para previsualizaciones rápidas. La fuente se precarga con `ensureWatermarkFont`.

### Extend Playback híbrido (`extendPlayback.ts`)

`resolveExtendPlaybackPlan` calcula el rate, ciclo y repeticiones. `DEFAULT_EXTEND_MIN_PLAYBACK_RATE = 0.65` es el suelo configurable (antes era piso fijo 0.15 global). El plan incluye `sourceDuration`, `targetDuration`, `minRate`, `rate`, `cycleDuration` y `repeatCount`. Tests: `test_extend_rate.mjs` validan el suelo por defecto y la transición a smooth cuando target ≤ clip.

## Continuidad visual automática (LoopyCut) — Smart Forward Loop

- `companion /analyze/video` devuelve candidatos con contrato `kind`, `fade_sec`, `reason` y opcional `alignment{dx,dy,scale,rotation,confidence}` (motion-compensated, estimado en thumbs 192px vía phaseCorrelate + ECC refinado, clamp traslación 4%, scale 0.98-1.02, rot ±1.5°); el clip completo ya no recibe score 100 artificial. `pickVisualLoop` (cliente y servidor comparten fórmula) equilibra **seam + cobertura + duración**: seam pesa 0.62, cobertura pesa 26, con bonus por cobertura (90-100% +12, 80-90 +8, 70-80 +4, 60-70 0, 50-60 -10, 40-50 -8, <40% -32) y penalización por duración absoluta modulada por `sourceDuration` (<5 s: -38 si >13 s / -22 si 9-13 s / -2 si ≤9 s; 5-7 s: -22/-14/0; 7-9 s: -8/0; 9-12 s: -3/0). Nunca <3 s; <5 s con cobertura <45% y seam <90 se rechaza si existe alternativa ≥50%. El clip completo **compite realmente** con su propio `finalScore`; si ningún recorte supera su `seam+variedad`, gana el full con fundido conservador 0.45-0.70 s. Diagnóstico en dev: `[SmartLoop] source …` lista `cov/mix/penalización/final` por candidato.
- `recommendVisualLoopForClip` se usa en 16:9 y rechaza análisis cuya duración no coincide con los metadatos del navegador. **9:16 siempre usa el clip completo** (`sourceStart=0`, `sourceEnd` omitido), sin recortes LoopyCut; preview, seek y export comparten ese rango, pero la transición final→inicio usa el mismo crossfade cinemático (y alignment si hay companion). El modo automático siempre es `smooth` forward-only; `pingpong` es manual y nunca se elige automáticamente.
- **Modo "Extender" (`seamMode: "extend"`)**: forward-only ralentizado para cubrir clips cortos con canciones largas sin rebobinar (el usuario lo pidió tras encontrar antinatural el boomerang en clips de 6-10 s). La velocidad se deriva SIEMPRE en el motor: `rate = clip / max(clip, targetDuration)` clamped a `[0.15, 1.0]` (`resolveExtendPlaybackRate` en `mangaMotionExport.ts`; piso 0.15 evita congelar el movimiento). `config.duration` es la duración objetivo tanto en preview RAF como en export, así el ciclo = `clip / rate` cubre la canción completa; si el target es mayor que `clip/rate` (piso activo), el tiling repite el ciclo con el crossfade cinemático ya horneado al final de cada copia. Si `target <= clip`, rate = 1× y el comportamiento es idéntico a `smooth`. Preview, seek (`sourceTimeForExport` con 6º parámetro `targetDuration`) y export comparten la misma rate derivada — no hay estado nuevo en la página. UI: los selects de continuidad 16:9/9:16 exponen "⏳ Extender" y debajo un panel compacto con la velocidad efectiva (`0.40× · el clip cubre el Short sin rebobinar.`). Los selects tienen `aria-label="Modo de continuidad 16:9|9:16"` y los canvas de preview `data-testid="preview-canvas-16x9|9x16"` (los usan los e2e). `e2e-calm-loop.mjs` está desactualizado (referencia un slider "Velocidad de Continuo calmado" que ya no existe en la UI).
- Crossfade cinemático: `alpha = 0.5 - 0.5*cos(PI*progress)`, `fade_sec` 0.25-1.0s (recomendado 0.30s seams perfectas, 0.55s aceptables, fallback 0.70s), `alignmentAmount = 1 - smoothstep(progress)` para que IN arranque corregido y vuelva a identidad al cierre. Helpers centralizados en `src/lib/forwardLoop.ts:getForwardLoopFrameState` — preview y export comparten la misma matemática (Preview = Export, monotonic forward, partículas `effectTime` monótono nunca invertido).
- El fundido visual termina en el primer frame compuesto exacto para que el siguiente tile no salte hacia atrás. El boomerang ya NO usa easing localizado: es velocidad constante con el giro amortiguado mezclando el frame extremo (ver boomerang suave más arriba).
- Tests de ranking: `node scripts/test_visual_loop_ranking.mjs` y `companion/.venv/bin/python scripts/test_visual_loop_ranking.py` cubren A-D (16 s vs 4.5 s, cola roja 9 s, micro-loop 3 s). Contrato LoopyCut: `companion/.venv/bin/python scripts/test_companion_video_loop.py`. E2E de integración y exclusión de frames fuera del rango: `node scripts/e2e-visual-loop-auto.mjs` (requiere companion en :8787).

## Música por formato (one-shot, sin loops internos)

- **Playlist secuencial (`src/lib/audioPlaylist.ts`)**: dual-studio acepta varias canciones de una vez, permite reordenar/eliminar y aplica Original/Suave/Clásico/Profundo por pista. Cada preset se cachea por `AudioBuffer`; `audioPlaylistMix.ts` remuestrea el master a 48 kHz, une con fundidos de potencia constante de hasta 0.75 s y limita a −1 dBFS. El vídeo dura exactamente el master combinado y repite sólo la imagen. El transporte invalida `resume()` obsoletos y, tras cambiar de buffer, hace `setBuffer → play` en el mismo comando lógico: un clic siempre debe sonar. Tests: `test_audio_playlist.mjs`, `e2e-audio-playlist.mjs`.

- **Editor ÚNICO (`AudioLoopPanel`, sección 3 de dual-studio)**: el toggle 🖥️/📱 llama `switchAudibleFormat` y edita lo que se oye. En 9:16 ofrece **✨ Recomendar** y **✂️ Recortar** sobre una ventana de 5–60 s; el drag usa imán a medio beat (`snapSec` de `estimateBeatPeriodSec`). La duración mínima cubre siempre el clip visual completo.
- **Audio simplificado a presets**: dual-studio arranca en audio Original y solo expone Suave, Clásico y Profundo; los sliders avanzados ya no forman parte del flujo visible. Valores actuales (en `REVERB_PRESETS`, `audioEngine.ts`): Suave 0.92×/reverb 14 %/decay 1.4 s/pre-delay 18 ms/low-pass 16 kHz; Clásico 0.87×/22 %/2.0 s/24 ms/14 kHz; Profundo 0.82×/30 %/2.7 s/30 ms/12 kHz. `ReverbSettings` acepta `preDelayMs` y `damping` (opcionales, compatibilidad preservada); el worklet Dattorro mezcla dry/wet en potencia constante y tras el master hay un limitador a −1 dBFS (threshold −1, ratio 20) antes del panner. El cambio de master en preview usa crossfade por fuente para no introducir clicks.
- **16:9 = tema completo o 2–5 vueltas**: por defecto `buildProcessedOneShotBuffer` procesa el tema una vez. `repeatOneShotMasterWithCrossfade` (ahora en `src/lib/audioRepeat.ts`, reexportado por `mangaAudioEngine.ts`) interpreta N como N vueltas TOTALES: construye un período con fundido de potencia constante y repite hasta longitud EXACTA `N × master` — los solapamientos nunca acortan el resultado. El pico se limita a −1 dBFS (`SAFE_MASTER_PEAK`), igual que `copyOneShotMaster`. Tests: `test_audio_repetitions.mjs`.
- **9:16 = ventana exacta**: `sourceWindowForOutput(target, slowed, settings)` calcula cuánto source consume la duración elegida (5–60 s); `clampOneShotWindow` mantiene esa ventana dentro de la canción. El output nunca repite audio internamente y añade solo fades de borde de 15 ms contra clicks.
- Companion/pymusiclooper y `analyzeLocalLoops` solo sugieren **puntos de entrada** del Short; sus duraciones candidatas no gobiernan el output. `pickBestAudioLoop(...preferTime: drop)` sigue eligiendo el start recomendado. Sin companion, el análisis local mantiene el flujo completo.
- **Preview = export**: ambos usan el master de `buildProcessedOneShotBuffer`. `LoopBufferPlayer` lo reproduce y solo vuelve al principio cuando se reinicia el preview completo del vídeo. El volumen no se hornea en preview (GainNode en vivo); export reutiliza el master ya listo mediante `copyOneShotMaster` y aplica el volumen elegido (si aún se está procesando, lo reconstruye antes de exportar).
- E2E de UI/fallback: `node scripts/e2e-audio-smoke.mjs`. E2E de MP4 con audio+SFX: `node scripts/e2e-audio-sfx-export.mjs` (25 s exactos, 48 kHz, ≥256 kbps, sin silencios internos y cue a 10 s).
- **SFX curados en dual-studio**: la interfaz solo lista y precarga `CURATED_SFX_CATALOG` (10 impactos/ambientes útiles); el catálogo completo se conserva para cues legacy y otras páginas. Cada cue guarda segundo, volumen y formato, y la mezcla offline usa esos mismos valores.
- **Pack de publicación**: tras subir el clip se elige de forma visible su universo creativo; `youtubePackEngine` usa ese perfil y el nombre real de la canción para generar variantes concisas de título/copy en inglés para YouTube, Instagram y TikTok. Contrato: título con canción/personaje/serie en los primeros 70 caracteres y tope absoluto de 100; descripción con hook + línea factual (canción/efecto/serie) + CTA + 3–5 hashtags; tags ≤8 solo nombres/serie/canción; captions diferenciados por plataforma (Instagram lleva #Reels, TikTok #AnimeEdit + #TikTokEdits) sin afirmar que existe otra versión publicada. Tests: `test_youtube_pack.mjs`. Perfiles actuales: Guts/Berserk, Vinland Saga, The Climber, Vagabond, Knight/medieval love y Golden Brown/slow edit. Las portadas parten del medio limpio y añaden siempre una firma de canal mínima en la esquina, sin controles ni rótulos del preview.
- **Partículas**: cada slot/canvas usa SU instancia de `PhysicsParticleSystem` (parámetro opcional de `renderMangaMotionFrame`; la singleton `globalParticles` es solo default de compatibilidad). El movimiento va normalizado por `dtScale` (1.0 = un frame a 60 fps): preview y export corren a la misma velocidad real. Compartir la singleton entre slots con tipos distintos provocaba `init()` (reset aleatorio) cada frame y partículas "rotas". `cinematic_rain` fija la velocidad por gota al spawn (`vx0/vy0`, sin `Math.random()` por frame), dibuja el streak alineado al vector de velocidad real y liga la densidad (≈48-120 gotas, con tope por canvas) al slider de Intensidad; `init()` acepta intensidad opcional.
- **Tramo inverso del pingpong = decode SECUENCIAL por segmento**: `renderCycleStreaming` decodifica cada segmento (~256 MB de budget) HACIA ADELANTE con `sink.samples(start, end)` — la ruta optimizada de mediabunny para acceso secuencial — y pinta el buffer al revés (mapeo por `sample.timestamp` con puntero descendente). Pedir el run entero con `samplesAtTimestamps` en orden descendente no es monótono → mediabunny cae al camino de 1 seek por frame → el decodificador HW se atasca justo en el giro (~43%) → watchdog → export abortado. El drenaje de cada segmento emite progreso con `phase: "decode"` ("Preparando tramo inverso…"); con drains rápidos React lo agrupa y no llega a pintarse — es red de seguridad para atascos reales. El run ascendente sigue usando `samplesAtTimestamps` (monótono = pipeline optimizado).
- **Run ascendente NUNCA pinta sobre canvas vacío**: si los primeros timestamps pedidos caen antes del primer PTS del source (edit lists/offsets de contenedor), `samplesAtTimestamps` devuelve `null` y el frame compuesto salía casi negro (fondo `#09090b`); el tiling replicaba ese frame 0 en cada frontera de ciclo → "pantallazo negro" (~11 s en pingpong 9:16). Fix: el run ascendente drena hasta el primer sample real y lo usa para todos los índices previos; si no consigue ninguno, lanza error (no genera video negro en silencio). Verificado con `blackdetect` en el e2e vertical.
- **Progreso de export monótono**: `onProgress` de `exportMangaMotionVideo` lleva un `progressFloor` (clamp): los reintentos internos nunca hacen retroceder la barra en la UI; el texto de etapa explica qué pasa.
- **Priming del primer frame en `renderCycleSeekBased`**: la ruta de fallback con HTMLVideoElement + seek hacía `drawImage(video,…)` en la primera iteración antes de que el navegador decodificara el fotograma → el canvas quedaba con fondo `#09090b` → headshot negro → crossfade de cada ciclo desvanecía a negro. Fix: `seekTo(srcTimes[0])` + doble RAF + `drawImage` de priming antes del bucle principal, asegurando que el primer frame esté decodificado antes de pintar.
- **Validación de headshot anti-negro**: `finishFrame` captura un JPEG del frame 0 como referencia para el crossfade. Si el JPEG pesa < 5 KB (frame negro/vacío en 1080p), se descarta y se recaptura en el frame 1. Esto evita que un headshot corrupto tiña de negro cada frontera de ciclo en el tiling.
- **Smart Forward Loop**: `src/lib/forwardLoop.ts:getForwardLoopFrameState` centraliza `primaryTime/secondaryTime/mix/alignment` para preview y export (forward-only jamás desciende, crossfade 0.25-1.0s cosine, alignment progresivo `1-smoothstep(progress)`). `MangaExportOptions.sourceAlignment` y `VisualLoopSelection.alignment` llevan la transformación global; 9:16 usa full-clip + mismo crossfade (sin recorte automático).

## Convenciones React en las páginas (lint es error-level)

- El loop RAF de 60fps lee **refs** (`elapsed16Ref`, `configRef`, `seamMode16x9Ref`…), nunca state — evita stale closures. Sincroniza con `useEffect(() => { ref.current = state }, [state])`.
- **No leer `.current` durante el render** (react-hooks/refs): pasar refs como props (`timeRef`, `audioContextRef`) y consumirlas en efectos/handlers.
- **No hacer setState síncrono en mount effects** (react-hooks/purity / cascading renders).
- `SfxLoopTimeline` dispara cues desde `timeRef` (reloj RAF del padre, <16 ms) con ancla anti-blast en seeks (delta > 1.5 s solo re-ancla).
- **Arbitraje de audio en dual-studio**: solo una fuente musical suena (los previews principales 16:9/9:16). `stopAudioExcept("main16" | "main9")` pausa el otro formato vía estado (nunca `player.pause()` fuera de banda, desincronizaría el effect). Cambiar el inicio del Short mientras suena hace swap del master con `setBuffer`, conservando posición relativa.
- **Audio por formato independiente y transferencia automática**: cada formato tiene su `LoopBufferPlayer` + master one-shot propio (completo 16:9, ventana fija 9:16; volumen/posición independientes). `switchAudibleFormat` transfiere la reproducción al cambiar de formato audible; `handleSetLayout` sincroniza layout y formato audible. Los players se crean en el upload (dentro del gesto del usuario — sin él, `AudioContext.resume()` puede fallar y el formato queda mudo). Los seeks (`handleSeek16x9/9x16`) funcionan sin video y el reloj RAF avanza sin clip: el transporte de la sección de música sirve como "Estudio de canción" sin video.
- UI en español; textos de estado/mensajes de error en español también.
- **Upload = canvas limpio y pausado**: al subir un video, estilo, partículas, continuidad y cámara se resetean a `original`, `none`, `cut`, `static`; watermark apagado y preview en pausa. `loadClipCache` pausa AL INICIO del upload (no cuando el cache termina): si el usuario pulsa Reproducir mientras el borrador se prepara, su play explícito se respeta al terminar el cache. No se ejecuta LoopyCut hasta que el usuario activa Natural. El recorte manual de inicio/fin es fuente de verdad y Natural nunca lo acorta. La UI muestra un solo formato a la vez mediante pestañas 16:9/Short. **Selector único de continuidad** visible por formato: "■ Sin loop", "✨ Natural · recomendado", "↔ Boomerang suave" y "⏳ Extender" (los selects duplicados y el desplegable "Opciones avanzadas de continuidad" ya no existen); filtro, cámara, partículas y el toggle de estabilización viven plegados en "Ajustes visuales y estabilización"; SFX, watermark y pack de publicación viven en Extras plegados.

## E2E / testing quirks

- Playwright usa el binario `$HOME/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome`; headless requiere `--no-sandbox --use-gl=swiftshader --enable-unsafe-swiftshader` para WebCodecs (avc/vp9/av1 encode disponible; hevc no).
- Los resultados de export son blobs `<a download>`: `waitForEvent("download")` NO dispara en este setup — capturar el MP4 con `page.evaluate(fetch(blobUrl) → arrayBuffer → base64)` y escribirlo desde Node.
- La verificación de calidad usa ffmpeg/ffprobe del sistema (PSNR, varianza Laplaciana). Calibración del clip testsrc2 1080p30: re-encode limpio ≈100–112% LapVar, bug de downscale ≈3%, export actual ≈80%.
- Un `.next/types` obsoleto puede hacer que `npx tsc --noEmit` señale temporalmente el export nombrado legacy `getVisualStyleCss` de `/video-loop`. `npm run build` regenera esos tipos; repetir después el typecheck debe quedar limpio. No editar `/video-loop` para parchear un artefacto generado.
- Arrancar servidores de fondo con `( setsid npx next start -p 3210 ... & )` y `workdir` explícito; el shell matará procesos hijos colgados de otro modo.
- **Checks PSNR de alineación temporal: usar múltiplos exactos de 1/fps**. Un seek a mitad de frame (p. ej. 6.25 s a 30 fps = frame 187.5) deja el resultado a merced de qué lado de la frontera aterrice ffmpeg y vuelve el test intermitente (18 vs 24 dB). El e2e vertical usa 1.30D ↔ 0.70D exactos; el horizontal 7.5 ↔ 2.5.
- **Esperar a que el preview pinte el clip** antes de medir el canvas: hasta que el cache del draft termina, el canvas solo tiene fondo `#09090b` + HUD "cargando clip…" (meanLuma ~9.5), que un check de destello negro confundiría con un bug. `e2e-extend-loop.mjs` espera luma > 50.
- **Activar Natural solo con la selección inicial cargada**: `enableNaturalLoop` solo pide análisis al companion si ya existe la selección "Clip completo" (`visualLoop16` se crea en `loadedmetadata`). `e2e-visual-loop-auto.mjs` espera a que la tarjeta muestre "seleccionados" antes del `selectOption("smooth")`, y espera a que desaparezca "Buscando una unión natural…" (el estado de análisis ya no se llama "Analizando…").
- Los e2e usan `getByLabel("Filtro visual 16:9|9:16")`, `"Cámara 2.5D …"`, `"Partículas …"` y `"Modo de continuidad …"` — los selects posicionales `nth()` rompieron al plegar los ajustes en `<details>` (hay que hacer click primero en "Ajustes visuales y estabilización").

## Companion (opcional, `companion/`)

Servidor FastAPI en :8787 (`./companion/start.sh` o `./iniciar.sh`). Lo usan `/video-loop`, LoopyCut visual (`/analyze/video`), sugerencias musicales (`analyzeMusic` → pymusiclooper) y el guardado automático en `~/Vídeos/Dark/`. Sin companion, dual-studio sigue exportando: usa el clip visual completo con fundido conservador, genera puntos musicales locales y descarga el resultado, pero no lo guarda automáticamente en `~/Vídeos/Dark/`.

### Nuevos endpoints

- **`POST /analyze/stabilization`** — análisis avanzado de microvibración con esquinas Shi–Tomasi, LK piramidal con validación forward/backward, transformación de similitud robusta por RANSAC y suavizado gaussiano de trayectoria. Devuelve `keyframes[]`, `crop_scale`, `jitter_rms_px`, `confidence`, `auto_enabled`. Implementación en `companion/stabilization.py`.
- **`POST /transcode/browser`** — convierte vídeos que WebCodecs no puede abrir (MOV, AVI, etc.) a MP4 H.264/AAC local con ffmpeg. Devuelve el archivo transcodificado como respuesta binaria.

### LoopyCut v2 (`motion_loop.py`)

`evaluate_motion_loop_v2` reemplaza `evaluate_motion_loop` con un cálculo más robusto:
- **Flujo óptico**: mediana en vez de media global, flujo backward para medir consistencia temporal (`fb_error`), añadiendo `flow_consistency` al tuple.
- **Similitud visual**: combinación ponderada MAD (78 %) + correlación de histogramas (22 %) para resistir cambios de iluminación.
- **Movimiento**: ventana de ±0.25 s alrededor del punto de costura (mediana del vector), evitando outliers de un solo frame.
- **Riesgo de corte**: `scene_cut_risk` mide MAD entre frames adyacentes en los bordes del candidato; si supera `baseline_diff * 1.8` se penaliza fuerte (−22 puntos en score final).
- **Confianza**: integra visual + motion + flow_consistency, modulada por `(1 - scene_cut_risk * 0.72)`.
- **Quality tiers**: `excellent` (≥85, confidence ≥0.78, cut_risk <0.25), `good` (≥68, ≥0.52, <0.60), `review`.
- La alineación (phaseCorrelate + ECC) se estima ahora ANTES del ranking y su confianza contribuye (15 %) a la métrica final, no solo como metadato.
