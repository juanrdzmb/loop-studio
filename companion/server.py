"""
Loop Studio Companion — servidor local que expone PyMusicLooper, LoopyCut y ffmpeg.

Uso:  ./start.sh   (o: .venv/bin/python -m uvicorn server:app --port 8787)
Docs:  http://localhost:8787/health
"""

import io
import json
import os
import shutil
import subprocess
import sys
import tempfile
import contextlib
import threading
import time
import uuid
from pathlib import Path

from fastapi import FastAPI, File, Form, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse, JSONResponse, FileResponse


def _studio_out() -> Path:
    raw = os.environ.get("LOOP_STUDIO_OUT")
    if raw:
        return Path(raw).expanduser()
    # Prefer ~/Vídeos/Dark/Youtube/export (standard Spanish XDG), fallback to ~/Videos/...
    p = Path.home() / "Vídeos" / "Dark" / "Youtube" / "export"
    if not p.parent.parent.exists() and (Path.home() / "Videos").exists():
        p = Path.home() / "Videos" / "Dark" / "Youtube" / "export"
    return p

def _archive_render(src: str, *, shorts: bool, preview: bool) -> str | None:
    if preview or not src or not os.path.isfile(src):
        return None
    dest_dir = _studio_out() / ("shorts" if shorts else "16x9")
    dest_dir.mkdir(parents=True, exist_ok=True)
    stamp = time.strftime("%Y-%m-%d_%H%M%S")
    name = f"{stamp}_{'9x16' if shorts else '16x9'}.mp4"
    dest = dest_dir / name
    shutil.copy2(src, dest)
    return str(dest)


BASE = os.path.dirname(os.path.abspath(__file__))
LOOPYCUT_DIR = os.path.join(BASE, "loopycut")
if os.path.isdir(LOOPYCUT_DIR):
    sys.path.insert(0, LOOPYCUT_DIR)

app = FastAPI(title="Loop Studio Companion", version="1.0.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # servidor local; el navegador es el único cliente
    allow_methods=["*"],
    allow_headers=["*"],
)


def _which(name: str) -> str | None:
    """Busca un ejecutable en PATH y en ~/.local/bin (instalaciones de uv)."""
    p = shutil.which(name)
    if p:
        return p
    fallback = os.path.expanduser(f"~/.local/bin/{name}")
    return fallback if os.path.isfile(fallback) else None


def _run(cmd: list[str], timeout: int = 600) -> subprocess.CompletedProcess:
    return subprocess.run(
        cmd, capture_output=True, text=True, timeout=timeout, check=True
    )


def _ffprobe_info(path: str) -> dict:
    out = _run([
        "ffprobe", "-v", "error",
        "-show_entries", "stream=sample_rate,duration:format=duration",
        "-of", "json", path,
    ]).stdout
    data = json.loads(out)
    info = {"duration": 0.0, "sample_rate": 44100}
    if data.get("format", {}).get("duration"):
        info["duration"] = float(data["format"]["duration"])
    for st in data.get("streams", []):
        if st.get("sample_rate"):
            info["sample_rate"] = int(st["sample_rate"])
        if st.get("duration"):
            info["duration"] = max(info["duration"], float(st["duration"]))
    return info


def _save_upload(upload: UploadFile, suffix: str) -> str:
    fd, path = tempfile.mkstemp(suffix=suffix)
    with os.fdopen(fd, "wb") as f:
        while chunk := upload.file.read(1 << 20):
            f.write(chunk)
    return path


@app.get("/")
def root():
    return {"app": "Loop Studio Companion", "health": "/health"}


@app.get("/health")
def health():
    pm = _which("pymusiclooper")
    pm_version = None
    if pm:
        try:
            out = _run([pm, "--version"], timeout=30)
            pm_version = out.stdout.strip() or out.stderr.strip().splitlines()[-1]
        except Exception:
            pm_version = "desconocida"
    loopycut = os.path.isdir(LOOPYCUT_DIR)
    ffmpeg = _which("ffmpeg") is not None
    librosa_ok = False
    try:
        import librosa  # noqa: F401
        librosa_ok = True
    except Exception:
        pass
    return {
        "ok": bool(pm and ffmpeg),
        "pymusiclooper": bool(pm),
        "pymusiclooper_version": pm_version,
        "loopycut": loopycut,
        "ffmpeg": ffmpeg,
        "librosa": librosa_ok,
    }


@app.get("/assets")
def list_assets():
    from catalog import available_overlays, available_visual_styles
    return {
        "overlays": available_overlays(),
        "visualStyles": available_visual_styles(),
    }

@app.get("/characters")
def list_cast():
    from characters import list_characters
    return {"characters": list_characters()}


@app.post("/identify/character")
async def identify_character_ep(
    video: UploadFile = File(...),
    video_start: float = Form(0.0),
    video_end: float = Form(0.0),
    filename: str = Form(""),
):
    path = _save_upload(video, os.path.splitext(video.filename or "v.mp4")[1] or ".mp4")
    try:
        from characters import identify_character
        return identify_character(
            path,
            start=max(0.0, video_start),
            end=max(0.0, video_end),
            filename=filename or (video.filename or ""),
        )
    except Exception as e:
        return JSONResponse({"error": f"identificar falló: {e}"}, 500)
    finally:
        try:
            os.unlink(path)
        except OSError:
            pass


@app.post("/youtube/pack")
async def youtube_pack_ep(
    character: str = Form("guts"),
    song: str = Form(""),
    artist: str = Form(""),
    minutes: float = Form(1.0),
    atmosphere: str = Form(""),
):
    from characters import build_youtube_pack
    return build_youtube_pack(
        character,
        song=song or None,
        artist=artist or None,
        minutes=max(0.1, minutes),
        atmosphere=atmosphere or None,
    )



@app.post("/plan/layers")
async def plan_layers(
    audio: UploadFile = File(...),
    audio_start: float = Form(0.0),
    audio_end: float = Form(0.0),
    target: float = Form(60.0),
    atmosphere: str = Form("auto"),
    visual_style: str = Form("anime_lofi"),
    pixel_size: int = Form(1),
    sfx_on: str = Form("1"),
    intensity: float = Form(0.45),
    watermark: str = Form("1"),
    video: UploadFile | None = File(None),
    video_start: float = Form(0.0),
    video_end: float = Form(0.0),
):
    paths: list[str] = []
    path = _save_upload(audio, os.path.splitext(audio.filename or "a.mp3")[1] or ".mp3")
    paths.append(path)
    video_path = None
    if video and video.filename:
        video_path = _save_upload(video, os.path.splitext(video.filename)[1] or ".mp4")
        paths.append(video_path)
    try:
        info = _ffprobe_info(path)
        end = audio_end if audio_end > audio_start else info["duration"]
        from layers import build_plan
        kwargs = {}
        if video_path:
            kwargs["video_path"] = video_path
            kwargs["video_start"] = video_start
            kwargs["video_end"] = video_end
        plan = build_plan(
            path,
            audio_start=max(0.0, audio_start),
            audio_end=end,
            target=max(8.0, target),
            atmosphere=atmosphere,
            visual_style=visual_style,
            pixel_size=pixel_size,
            sfx_on=sfx_on not in ("0", "false", "off"),
            intensity=intensity,
            watermark=watermark not in ("0", "false", "off"),
            **kwargs,
        )
        return plan
    except Exception as e:
        return JSONResponse({"error": f"plan falló: {e}"}, 500)
    finally:
        for p in paths:
            try:
                os.unlink(p)
            except OSError:
                pass


@app.post("/analyze/music")
async def analyze_music(
    audio: UploadFile = File(...),
    # Importante: Form() — si no, FastAPI los trata como query params y
    # ignora los campos multipart que envía la app.
    min_duration: float = Form(0.0),
    max_duration: float = Form(0.0),
    candidates: int = Form(8),
):
    pm = _which("pymusiclooper")
    if not pm:
        return JSONResponse({"error": "pymusiclooper no está instalado"}, 503)

    path = _save_upload(audio, os.path.splitext(audio.filename or "song.mp3")[1] or ".mp3")
    try:
        info = _ffprobe_info(path)
        cmd = [pm, "export-points", "--path", path, "--alt-export-top", str(candidates)]
        if min_duration > 0:
            cmd += ["--min-loop-duration", str(min_duration)]
        if max_duration > 0:
            cmd += ["--max-loop-duration", str(max_duration)]
        out = _run(cmd, timeout=900).stdout

        cands = []
        for line in out.splitlines():
            parts = line.split()
            if len(parts) < 5:
                continue
            try:
                s, e = int(parts[0]), int(parts[1])
                score = float(parts[4])
            except ValueError:
                continue
            sr = info["sample_rate"]
            start, end = s / sr, e / sr
            cands.append({
                "start": round(start, 3),
                "end": round(end, 3),
                "duration": round(end - start, 3),
                "score": round(min(score, 1.0) * 100, 1),
            })
        cands.sort(key=lambda c: c["score"], reverse=True)
        return {"candidates": cands, "duration": round(info["duration"], 3)}
    finally:
        os.unlink(path)




@app.post("/analyze/video")
async def analyze_video(
    video: UploadFile = File(...),
    length: float = Form(0.0),        # 0 = auto
    downsample: int = Form(2),
    similarity: int = Form(90),
    window_sec: float = Form(120.0),  # analiza como máx. los primeros N segundos (0 = todo)
):
    if not os.path.isdir(LOOPYCUT_DIR):
        return JSONResponse({"error": "LoopyCut no está instalado"}, 503)

    path = _save_upload(video, os.path.splitext(video.filename or "v.mp4")[1] or ".mp4")
    try:
        import cv2

        cap = cv2.VideoCapture(path)
        if not cap.isOpened():
            return JSONResponse({"error": "No se pudo abrir el video"}, 500)
        fps = cap.get(cv2.CAP_PROP_FPS) or 24.0
        total = int(cap.get(cv2.CAP_PROP_FRAME_COUNT) or 0)
        if total <= 0:
            cap.release()
            return JSONResponse({"error": "Video sin frames legibles"}, 500)
        limit_frames = total if window_sec <= 0 else min(total, int(window_sec * fps))

        # Analiza ≤320 frames reducidos a 192px: las comparaciones combinadas de
        # LoopyCut son O(n²) a resolución completa (~28k pares × full-res ≈ minutos).
        # A escala reducida el SSIM global da el mismo ranking ~100× más rápido.
        stride = max(1, max(int(downsample), -(-limit_frames // 320)))
        smalls = []
        idx = 0
        while idx < limit_frames:
            ret, frame = cap.read()
            if not ret:
                break
            if idx % stride == 0:
                h, w = frame.shape[:2]
                nh = max(2, int(round(h * 192 / w / 2)) * 2)
                smalls.append(
                    cv2.cvtColor(cv2.resize(frame, (192, nh)), cv2.COLOR_BGR2RGB)
                )
            idx += 1
        duration = total / fps
        cap.release()

        err_capture = io.StringIO()
        with contextlib.redirect_stderr(err_capture):
            from frame_analyzer import FrameAnalyzer
            from loop_detector import LoopDetector

            fa = FrameAnalyzer(similarity_threshold=similarity / 100.0)
            ld = LoopDetector(fa)
            similar = fa.find_similar_frames(smalls, method="combined")[:2000] if len(smalls) > 1 else []
            cands_raw = ld._analyze_loop_candidates(
                similar,
                smalls,
                fps,
                desired_length=length if length > 0 else "auto",
                frame_offset=0,
                downsample_factor=stride,
            )
            loops = ld._rank_loop_candidates(
                cands_raw, desired_length=length if length > 0 else "auto"
            )

        cands = []
        for l in loops:
            start = float(l["start_time"])
            end = float(l["end_time"])
            cands.append({
                "start": round(start, 3),
                "end": round(end, 3),
                "duration": round(float(l["duration"]), 3),
                "score": _seam_pct(smalls, start, end, fps, stride),
            })
        full_cand = {
            "start": 0.0,
            "end": round(duration, 3),
            "duration": round(duration, 3),
            "score": 100.0,
            "label": "Full clip (seamless crossfade)",
        }
        longer = [c for c in cands if c["duration"] >= 3.0]
        if not longer:
            longer = [c for c in cands if c["duration"] >= 1.2]
        cands = [full_cand] + _dedup_loops(longer or cands)[:7]
        return {
            "candidates": cands,
            "duration": round(duration, 3),
            "fps": round(float(fps), 3),
        }
    except Exception as e:
        return JSONResponse({"error": f"análisis falló: {e}"}, 500)
    finally:
        os.unlink(path)


def _loop_segment(v_path: str, v_start: float, v_end: float, seg_path: str) -> float:
    """Recorta el loop de video manteniendo el inicio limpio y natural (sin fundido fantasma en t=0)."""
    v_dur = round(v_end - v_start, 6)
    vf = "setpts=PTS-STARTPTS,format=yuv420p[out]"
    seg_dur = v_dur
    _run([
        "ffmpeg", "-y", "-v", "error",
        "-ss", str(v_start), "-to", str(v_end), "-i", v_path,
        "-filter_complex", vf,
        "-map", "[out]",
        "-c:v", "libx264", "-preset", "veryfast", "-crf", "16",
        "-pix_fmt", "yuv420p", "-an",
        "-map_metadata", "-1", "-fflags", "+bitexact",
        "-metadata", "encoder=",
        seg_path,
    ], timeout=900)
    return seg_dur

def _seam_pct(smalls: list, start_t: float, end_t: float, fps: float, stride: int) -> float:
    """Calidad del corte: qué tan distintos son inicio y fin (0–99.9).

    LoopyCut marca ~1.0 a casi todo lo que pasa el umbral y luego suma un
    bonus de duración: al clamp a 100% todas las tarjetas salían iguales.
    Aquí usamos el MAD en gris de los frames inicio/fin.
    """
    import cv2
    import numpy as np

    if not smalls or fps <= 0 or stride < 1:
        return 0.0
    i = int(round(start_t * fps / stride))
    j = int(round(end_t * fps / stride))
    i = max(0, min(len(smalls) - 1, i))
    j = max(0, min(len(smalls) - 1, j))
    if i == j:
        return 0.0
    a = cv2.cvtColor(smalls[i], cv2.COLOR_RGB2GRAY).astype(np.float32)
    b = cv2.cvtColor(smalls[j], cv2.COLOR_RGB2GRAY).astype(np.float32)
    mad = float(np.mean(np.abs(a - b)))
    return round(max(0.0, min(99.9, 100.0 * (1.0 - mad / 28.0))), 1)


def _dedup_loops(cands: list[dict]) -> list[dict]:
    """Quita ventanas que se pisan (mismo plano recortado 8 veces)."""
    kept: list[dict] = []
    for c in sorted(cands, key=lambda x: (-x["score"], -x["duration"])):
        overlap = False
        for k in kept:
            inter = min(c["end"], k["end"]) - max(c["start"], k["start"])
            union = max(c["end"], k["end"]) - min(c["start"], k["start"])
            if union > 0 and inter / union > 0.45:
                overlap = True
                break
        if not overlap:
            kept.append(c)
    return kept


def _loop_audio(a_path: str, a_start: float, a_end: float, seg_path: str) -> float:
    """Ciclo de canción con final fundido al inicio, para repetir sin corte seco."""
    a_dur = round(a_end - a_start, 6)
    fade = min(2.0, max(0.8, a_dur * 0.05))
    if a_dur < fade * 3:
        _run([
            "ffmpeg", "-y", "-v", "error",
            "-ss", str(a_start), "-to", str(a_end), "-i", a_path,
            "-af", "aformat=sample_fmts=fltp:channel_layouts=stereo,aresample=48000",
            "-c:a", "pcm_s16le",
            seg_path,
        ], timeout=600)
        return a_dur
    af = (
        f"aformat=sample_fmts=fltp:channel_layouts=stereo,aresample=48000,asplit=3[beg][mid][end];"
        f"[beg]atrim=start=0:end={fade:.4f},asetpts=PTS-STARTPTS[b];"
        f"[end]atrim=start={a_dur - fade:.4f}:end={a_dur:.4f},asetpts=PTS-STARTPTS[e];"
        f"[mid]atrim=start={fade:.4f}:end={a_dur - fade:.4f},asetpts=PTS-STARTPTS[m];"
        f"[e][b]acrossfade=d={fade:.4f}:c1=tri:c2=tri[x];"
        f"[m][x]concat=n=2:v=0:a=1[out]"
    )
    _run([
        "ffmpeg", "-y", "-v", "error",
        "-ss", str(a_start), "-to", str(a_end), "-i", a_path,
        "-filter_complex", af,
        "-map", "[out]",
        "-c:a", "pcm_s16le",
        seg_path,
    ], timeout=600)
    return a_dur - fade



def _file_response(out_path: str) -> StreamingResponse:
    def iter_file():
        with open(out_path, "rb") as f:
            while chunk := f.read(1 << 20):
                yield chunk

    import threading
    import time

    def _cleanup():
        time.sleep(90)
        try:
            os.unlink(out_path)
        except OSError:
            pass

    threading.Thread(target=_cleanup, daemon=True).start()
    return StreamingResponse(
        iter_file(),
        media_type="video/mp4",
        headers={"Content-Disposition": 'attachment; filename="loop-perfecto.mp4"'},
    )


def _execute_render(v_path: str, a_path: str, p: dict, on_progress=None) -> str:
    v_start = float(p["videoStart"])
    v_end = float(p["videoEnd"])
    a_start = float(p["audioStart"])
    a_end = float(p["audioEnd"])
    preview = bool(p.get("preview"))
    aspect = str(p.get("aspect") or "landscape")
    target = float(p.get("targetDuration") or (a_end - a_start))
    if aspect in ("shorts", "9:16", "vertical"):
        target = min(30.0, max(20.0, target if target >= 20 else 25.0))
    elif preview:
        target = min(target, 20.0)
    plan = p.get("plan") or {}
    v_dur = v_end - v_start
    a_dur = a_end - a_start
    if v_dur <= 0.1 or a_dur <= 0.1 or target <= 0.5:
        raise ValueError("durations too short")

    out_fd, out_path = tempfile.mkstemp(suffix=".mp4")
    os.close(out_fd)
    seg_fd, seg_path = tempfile.mkstemp(suffix=".mp4")
    os.close(seg_fd)
    a_seg_path = None
    try:
        if on_progress:
            on_progress(6, "Seamless video loop")
        _loop_segment(v_path, v_start, v_end, seg_path)
        audio_for_render = a_path
        rs, re = a_start, a_end
        if target > a_dur + 0.05:
            if on_progress:
                on_progress(16, "Seamless song loop")
            afd, a_seg_path = tempfile.mkstemp(suffix=".wav")
            os.close(afd)
            re = _loop_audio(a_path, a_start, a_end, a_seg_path)
            rs = 0.0
            audio_for_render = a_seg_path
        if on_progress:
            on_progress(24, "encoding")

        def mapped(pct: int, stage: str) -> None:
            if on_progress:
                on_progress(24 + int(max(0, min(100, pct)) * 0.75), stage)

        from layers import render_composed
        render_composed(
            video_seg=seg_path,
            audio_path=audio_for_render,
            audio_start=rs,
            audio_end=re,
            target=target,
            plan=plan,
            out_path=out_path,
            preview=preview,
            timeout=180 if aspect in ("shorts", "9:16", "vertical") else (300 if preview else 2400),
            on_progress=mapped if on_progress else None,
            aspect=aspect,
        )
        _archive_render(out_path, shorts=aspect in ("shorts", "9:16", "vertical"), preview=preview)
        return out_path
    except Exception:
        try:
            os.unlink(out_path)
        except OSError:
            pass
        raise
    finally:
        for pth in (seg_path, a_seg_path):
            if not pth:
                continue
            try:
                os.unlink(pth)
            except OSError:
                pass


_JOBS: dict[str, dict] = {}


def _job_set(jid: str, **kw) -> None:
    row = _JOBS.setdefault(
        jid, {"pct": 0, "stage": "", "done": False, "error": None, "path": None}
    )
    row.update(kw)


@app.post("/render")
async def render(
    video: UploadFile = File(...),
    audio: UploadFile = File(...),
    params: str = Form("{}"),
):
    if _which("ffmpeg") is None:
        return JSONResponse({"error": "ffmpeg is not installed"}, 503)
    p = json.loads(params or "{}")
    v_path = _save_upload(video, os.path.splitext(video.filename or "v.mp4")[1] or ".mp4")
    a_path = _save_upload(audio, os.path.splitext(audio.filename or "a.mp3")[1] or ".mp3")
    try:
        out_path = _execute_render(v_path, a_path, p)
        return _file_response(out_path)
    except ValueError as e:
        return JSONResponse({"error": str(e)}, 400)
    except subprocess.CalledProcessError as e:
        err = (e.stderr or "")[-800:]
        return JSONResponse({"error": f"ffmpeg failed: {err}"}, 500)
    except Exception as e:
        return JSONResponse({"error": f"render failed: {e}"}, 500)
    finally:
        for pth in (v_path, a_path):
            try:
                os.unlink(pth)
            except OSError:
                pass


@app.post("/render/start")
async def render_start(
    video: UploadFile = File(...),
    audio: UploadFile = File(...),
    params: str = Form("{}"),
):
    if _which("ffmpeg") is None:
        return JSONResponse({"error": "ffmpeg is not installed"}, 503)
    p = json.loads(params or "{}")
    v_path = _save_upload(video, os.path.splitext(video.filename or "v.mp4")[1] or ".mp4")
    a_path = _save_upload(audio, os.path.splitext(audio.filename or "a.mp3")[1] or ".mp3")
    jid = uuid.uuid4().hex[:12]
    _job_set(jid, pct=2, stage="queued", done=False)

    def work() -> None:
        try:
            def prog(pct: int, stage: str) -> None:
                _job_set(jid, pct=int(pct), stage=stage)

            out_path = _execute_render(v_path, a_path, p, on_progress=prog)
            _job_set(jid, pct=100, stage="done", done=True, path=out_path)
        except Exception as e:
            _job_set(jid, done=True, error=str(e)[-800:])
        finally:
            for pth in (v_path, a_path):
                try:
                    os.unlink(pth)
                except OSError:
                    pass

    threading.Thread(target=work, daemon=True).start()
    return {"id": jid}


@app.get("/render/status/{jid}")
def render_status(jid: str):
    row = _JOBS.get(jid)
    if not row:
        return JSONResponse({"error": "unknown job"}, 404)
    return {
        "id": jid,
        "pct": row.get("pct", 0),
        "stage": row.get("stage") or "",
        "done": bool(row.get("done")),
        "error": row.get("error"),
    }


@app.get("/render/file/{jid}")
def render_file(jid: str):
    row = _JOBS.get(jid)
    if not row or not row.get("done") or not row.get("path"):
        return JSONResponse({"error": "not ready"}, 404)
    if row.get("error"):
        return JSONResponse({"error": row["error"]}, 500)
    return _file_response(row["path"])


@app.post("/export/image")
async def export_image(
    kind: str = Form("thumbs"),
    file: UploadFile = File(...),
):
    folder = "covers" if kind in ("covers", "album", "cover") else "thumbs"
    dest_dir = _studio_out() / folder
    dest_dir.mkdir(parents=True, exist_ok=True)
    ext = os.path.splitext(file.filename or "img.jpg")[1] or ".jpg"
    if ext.lower() not in {".jpg", ".jpeg", ".png", ".webp"}:
        ext = ".jpg"
    name = f"{time.strftime('%Y-%m-%d_%H%M%S')}{ext}"
    dest = dest_dir / name
    data = await file.read()
    dest.write_bytes(data)
    return {"ok": True, "path": str(dest)}


