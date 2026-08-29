# 🌀 Loop Studio (Todo-en-Uno)

Loop Studio es una suite integral 100% local para crear animaciones en bucle, videos estilo **Manga Motion 2.5D**, efectos de audio **Slowed + Reverb** y exportaciones en alta definición a **60 FPS** con aceleración por hardware.

Repositorio: https://github.com/juanrdzmb/loop-studio

---

## 🛠️ Herramientas Integradas

| Herramienta | Ruta | Características Principales |
|---|---|---|
| 🌀 **GIF Studio** | `/` | Recorta clips, detecta bucles continuos, genera pixel-art y GIFs perfectos. |
| 📻 **Slowed + Reverb** | `/slowed-reverb` | Motor de audio con reverb Dattorro, vinilo, 8D, pitch y exportación WAV/MP3. |
| 🎬 **Combine → MP4** | `/combinar` | Une cualquier video/GIF con tu pista de audio sintetizada en MP4. |
| 🎥 **Video + Song** | `/video-loop` | Crea videos largos y Shorts combinando videos con canciones en loop. |
| ✨ **Manga Motion 2.5D** | `/manga-motion` | **Estudio Anime & Manga**: Partículas HD, Katana Slash interactivo, Tipografía con traductor a Japonés, capas de profundidad 2.5D, 8 modos de cámara cinemática, detector de drops/clímax y renderizador HD 60 FPS directo en el navegador sin intermediarios. |

---

## 🚀 Cómo Iniciar la Aplicación (1-Click)

Solo necesitas tener instalado **Node.js (v18+)** y **npm**.

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
