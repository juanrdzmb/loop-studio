# Loop Studio

I’m Juan. I built this to make **video + song loops** (slowed / reverb aesthetic) ready for YouTube — Silent Vigil Music — without sending anything to the cloud. It also makes pixel-art GIFs and combines a GIF with a WAV.

Everything runs on your machine. The browser handles GIF, Slowed + Reverb, and Combine. **Video + Song** talks to a local Python companion (`:8787`) for loop detection, character ID, atmosphere, and ffmpeg.

Repo: https://github.com/juanrdzmb/loop-studio

## What it does

| Tab | What I use it for | Companion |
|---|---|---|
| **GIF Studio** `/` | Trim, pick a loop, pixel style, download a GIF (preview = export) | No |
| **Slowed + Reverb** `/slowed-reverb` | Slow the track with Dattorro reverb, vinyl, 8D… export WAV | No |
| **Combine** `/combinar` | Finished GIF + WAV → MP4 in the browser | No |
| **Video + Song** `/video-loop` | Video loop + song to N minutes + fog/SFX/watermark + YouTube pack + thumbnail | Yes |

## Install

You need **Node 20+**, **ffmpeg**, and **uv** for Video + Song.

```bash
git clone https://github.com/juanrdzmb/loop-studio.git
cd loop-studio
npm install

curl -LsSf https://astral.sh/uv/install.sh | sh
source ~/.bashrc
uv tool install pymusiclooper
sudo apt install ffmpeg   # Fedora: sudo dnf install ffmpeg

chmod +x start.sh companion/start.sh
./start.sh
# App        → http://localhost:3000
# Companion  → http://localhost:8787/health
```

If port 8787 is busy, kill the old Python (`ss -ltnp | grep 8787`) and start the companion again. The badge must say **Companion online**.

## How I use Video + Song

1. Drop the clip → **Find seamless loops** → hover the cards → pick one. Quality is how well the end matches the start (not a fake 100%).
2. Drop the song. Default is the **full track**. If I ask for more minutes than it lasts, the companion **crossfades the end into the start** and repeats. If I ask for less, it just uses the slice.
3. Set minutes (`1m 3m 5m 10m 30m 1h`).
4. Atmosphere: Auto (looks at the clip) or I pick. **Preview 20s**, then **Generate**. A bar shows loop / encode progress.
5. Watermark **Silent Vigil Music** (Montserrat, no ©) travels the **top edge**.
6. The app guesses **Guts / Thorfinn / Musashi / Buntarō**. I can override. I copy title, description, tags, playlist, pinned comment — from `docs/` plus the formula that actually ranks.
7. **Grab 1280×720** for the YouTube thumbnail (CTR lives there more than in tags).
8. **Generate Short** → 9:16 **1080×1920**, 20 / 25 / 30 seconds (I use 25). Promo copy is separate: `#Shorts` in the description, not the title. That’s the teaser for the long loop.

No “cut vs speed vs crossfade”: the video always fades; the duration I type wins.

## YouTube copy (what I paste)

Winners in this niche look like:

- **Title** (front-load keywords, keep it under ~70 chars):  
  `Song Name (Slowed + Reverb) | The Black Swordsman`
- **Description first line** (search snippet):  
  `Song (slowed + reverb) — Berserk aesthetic loop for late nights, study, and sleep.`
- **Timestamp:** `0:00 Song (Slowed + Reverb)`
- **Hashtags:** 3–5 — `#slowedandreverb #animeaesthetic #lofi` + character
- **Tags:** `slowed and reverb`, `slowed + reverb`, `anime aesthetic`, `songs to study`, `sleep music`, plus series/character
- **Pinned comment:** a question (“What should I slow down next?”)
- **Thumbnail:** 1280×720, 16:9, JPG under 2 MB, one clear subject, little text

## Encode (quality for YouTube, no wasted bits)

YouTube re-encodes everything. I don’t crush the file. I give it a clean master at **their recommended ceiling**:

- H.264 High, yuv420p, native fps (no resample)
- CRF 17, `preset fast` (same look as slower presets, smaller than `veryfast`)
- GOP 2 seconds, 2 B-frames
- `-maxrate` / `-bufsize` at YouTube SDR targets (5 Mbps 720p / 8 Mbps 1080p / 12 Mbps 1080p60)
- AAC-LC 48 kHz **320 kbps** stereo
- `+faststart`

Preview stays `veryfast` / CRF 20 / 192k so the 20s check is quick.

## Files that stay local (not in git)

```
assets/overlays/          fog.mp4 smoke.mp4 rain.mp4 …
assets/audio_ambience/    night, wind, thunder.mp3, sword.mp3 …
docs/refs/guts|thorfinn|musashi|buntaro/   # jpg/png/webp — AVIF not needed
```

See `assets/README.md` and `docs/refs/README.md`. Without overlays, render still works (no fog). Without refs, character ID uses drawing style + filename.

## Make it yours

| Change | Where |
|---|---|
| Watermark brand | `companion/watermark.py` → `BRAND` |
| Overlays / SFX | `assets/` + `companion/catalog.py` |
| Cast | `companion/characters.py` → `CHARACTERS` |
| YouTube essays | replace `docs/*.md` |
| Face refs | `docs/refs/<id>/` |

`CHARACTERS` ids must match `docs/refs/<id>/` and a word in the essay filename.

## Tests

```bash
npm run lint
# app :3000 + companion :8787
node scripts/e2e-videoloop.mjs
```

## Credits

[PyMusicLooper](https://github.com/arkrow/PyMusicLooper) · [LoopyCut](https://github.com/carmelosantana/loopycut-cli) · [fadeloop](https://github.com/flatpickles/fadeloop) · [DattorroReverbNode](https://github.com/khoin/DattorroReverbNode) · [mediabunny](https://github.com/Vanilagy/mediabunny) · [gifenc](https://github.com/mattdesl/gifenc)
