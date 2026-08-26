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

from fastapi import FastAPI, File, Form, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse, JSONResponse

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
    return {
        "ok": bool(pm and ffmpeg),
        "pymusiclooper": bool(pm),
        "pymusiclooper_version": pm_version,
        "loopycut": loopycut,
        "ffmpeg": ffmpeg,
    }


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
        for l in loops[:8]:
            cands.append({
                "start": round(float(l["start_time"]), 3),
                "end": round(float(l["end_time"]), 3),
                "duration": round(float(l["duration"]), 3),
                "score": round(min(max(float(l.get("final_score", 0)), 0.0), 1.0) * 100, 1),
            })
        cands.sort(key=lambda c: c["score"], reverse=True)
        return {
            "candidates": cands,
            "duration": round(duration, 3),
            "fps": round(float(fps), 3),
        }
    except Exception as e:
        return JSONResponse({"error": f"análisis falló: {e}"}, 500)
    finally:
        os.unlink(path)


@app.post("/render")
async def render(
    video: UploadFile = File(...),
    audio: UploadFile = File(...),
    params: str = Form("{}"),
):
    if _which("ffmpeg") is None:
        return JSONResponse({"error": "ffmpeg no está instalado"}, 503)

    p = json.loads(params or "{}")
    v_start = float(p["videoStart"])
    v_end = float(p["videoEnd"])
    a_start = float(p["audioStart"])
    a_end = float(p["audioEnd"])
    video_mode = p.get("videoMode", "cut")          # cut | crossfade
    crossfade = float(p.get("crossfadeSec", 0.5))
    sync_mode = p.get("syncMode", "repeat")          # repeat | speed

    v_dur = v_end - v_start
    a_dur = a_end - a_start
    if v_dur <= 0.1 or a_dur <= 0.1:
        return JSONResponse({"error": "duraciones de loop demasiado cortas"}, 400)

    v_path = _save_upload(video, os.path.splitext(video.filename or "v.mp4")[1] or ".mp4")
    a_path = _save_upload(audio, os.path.splitext(audio.filename or "a.mp3")[1] or ".mp3")
    out_fd, out_path = tempfile.mkstemp(suffix=".mp4")
    os.close(out_fd)
    seg_fd, seg_path = tempfile.mkstemp(suffix=".mp4")
    os.close(seg_fd)

    try:
        v_dur = round(v_end - v_start, 6)

        # --- Pasada 1: segmento de video del loop (con crossfade opcional) ---
        # NOTA: -ss/-to ya recortan la entrada; los tiempos del filtro son
        # RELATIVOS al segmento (empiezan en 0) para no recortar dos veces.
        if video_mode == "crossfade" and v_dur > crossfade * 2.5:
            f = min(crossfade, v_dur / 3)
            # fadeloop: el final del segmento se funde hacia su inicio;
            # la salida dura v_dur - f (el fundido reemplaza los últimos f seg)
            vf = (
                f"split[m][t];"
                f"[t]trim=start={v_dur - f},setpts=PTS-STARTPTS[t1];"
                f"[m]trim=end={v_dur - f},setpts=PTS-STARTPTS[m1];"
                f"[m1][t1]xfade=transition=fade:duration={f}:offset={max(0.05, v_dur - 2 * f)}[out]"
            )
            seg_dur = v_dur - f
        else:
            vf = "setpts=PTS-STARTPTS[out]"
            seg_dur = v_dur

        _run([
            "ffmpeg", "-y", "-v", "error",
            "-ss", str(v_start), "-to", str(v_end), "-i", v_path,
            "-filter_complex", vf,
            "-map", "[out]",
            "-c:v", "libx264", "-preset", "veryfast", "-crf", "16",
            "-pix_fmt", "yuv420p", "-an",
            seg_path,
        ], timeout=900)
        # --- Pasada 2: repetir segmento + loop de audio, duración = loop de audio ---
        if sync_mode == "speed":
            # 1 pasada de video ajustada a la duración del loop de audio
            reps = 1
            factor = a_dur / seg_dur  # >1 ralentiza el video para que dure a_dur
            speed_filter = ["-vf", f"setpts=PTS*{factor:.6f}"]
        else:
            reps = max(1, int(target_reps := round(a_dur / seg_dur)) +
                       (1 if a_dur % seg_dur > 0.05 else 0))
            speed_filter = []

        _run([
            "ffmpeg", "-y", "-v", "error",
            "-stream_loop", str(reps - 1), "-i", seg_path,
            "-stream_loop", "200", "-ss", str(a_start), "-to", str(a_end), "-i", a_path,
            *speed_filter,
            "-t", f"{a_dur:.6f}",
            "-map", "0:v", "-map", "1:a",
            "-c:v", "libx264", "-preset", "veryfast", "-crf", "18",
            "-pix_fmt", "yuv420p",
            "-c:a", "aac", "-b:a", "192k",
            "-movflags", "+faststart",
            "-shortest",
            out_path,
        ], timeout=1800)

        def iter_file():
            with open(out_path, "rb") as f:
                while chunk := f.read(1 << 20):
                    yield chunk

        return StreamingResponse(
            iter_file(),
            media_type="video/mp4",
            headers={"Content-Disposition": 'attachment; filename="loop-perfecto.mp4"'},
        )
    except subprocess.CalledProcessError as e:
        return JSONResponse({"error": f"ffmpeg falló: {e.stderr[-800:]}"}, 500)
    finally:
        for pth in (v_path, a_path, seg_path):
            try:
                os.unlink(pth)
            except OSError:
                pass
        # out_path se borra tras enviar la respuesta (tarea en segundo plano)
        import threading

        def _cleanup():
            import time
            time.sleep(60)
            try:
                os.unlink(out_path)
            except OSError:
                pass

        threading.Thread(target=_cleanup, daemon=True).start()
