# Loop Studio

Loop Studio es una suite creativa 100% local para producir loops continuos, masters 16:9, Shorts 9:16 y montajes multiclip al beat. El vídeo y el audio se procesan en el navegador con WebCodecs; el companion Python es opcional.

La portada en `/` te lleva al flujo correcto según el material: **Dual Studio** para una toma que debe vivir en loop y **Edit Studio** para varias tomas que deben construir un montaje.

Repositorio: https://github.com/juanrdzmb/loop-studio

---

## 🛠️ Herramientas Integradas

| Herramienta | Ruta | Características Principales |
|---|---|---|
| **Inicio** | `/` | Mesa de entrada y selector de flujo. |
| ⚡ **Dual Studio** | `/dual-studio` | Un clip → master 16:9 + Short 9:16, continuidad, playlist, SFX y pack de publicación. |
| ✂️ **Edit Studio** | `/edit-studio` | Montaje multiclip 9:16 al beat, asistencia local, transiciones, acabado y export MP4. |
| 🌀 **GIF Studio** | `/gif-studio` | Recorta clips, detecta bucles y genera pixel-art y GIFs. |
| 📻 **Slowed + Reverb** | `/slowed-reverb` | Motor de audio con reverb Dattorro, vinilo, 8D, pitch y exportación WAV/MP3. |
| 🎬 **Combine → MP4** | `/combinar` | Une cualquier video/GIF con tu pista de audio sintetizada en MP4. |
| ✨ **Manga Motion Lab** | `/manga-motion` | Control manual de cámara, partículas, tipografía manga y capas de profundidad 2.5D. |
| 🎥 **Video + Song** | `/video-loop` | Flujo legacy compatible con el companion Python. |

---

## 🚀 Cómo Iniciar la Aplicación (1-Click)

Solo necesitas tener instalado **Node.js 20.9 o superior** y **npm**.

### Opción 1: Lanzador Rápido (Recomendado)
```bash
./iniciar.sh
```

Este comando comprobará dependencias, iniciará el servidor en `http://localhost:3000` y abrirá tu navegador automáticamente.

### Opción 2: Modo Manual
```bash
npm install
npm run dev
```
Luego abre en tu navegador: [http://localhost:3000](http://localhost:3000)

---

## ✨ Novedades en Manga Motion Studio 2.5D
* **Soporte para Imágenes y Videos**: Sube ilustraciones o clips de video para aplicarles efectos manga con seamless crossfade.
* **8 Modos de Cámara Cinemática**: Plano Holandés, Latigazo Anime, Efecto Vértigo, Vórtice Espiral, Escaneo Diagonal, etc.
* **Control de Volumen en Tiempo Real**: Deslizadores directos de volumen sin cortes de sonido.
* **Planos de Profundidad 2.5D & Transiciones Anime**: Textos que entran con *Corte de Katana (Slash)*, *Impacto Shonen* o *Tinta Sumi-e* sincronizados con la cámara.
* **Filtros Manga Optimizados**: Screentone, Seinen B&W, Cyberpunk, 90s Retro y Lo-Fi acelerados por GPU a 60 FPS.
