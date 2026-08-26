"""
Planificador de capas: atmósfera visual (blend screen), ambiente (LPF),
SFX en valles RMS de la canción, marca de agua dinámica.

Herramientas: librosa (RMS), ffmpeg (blend/overlay/amix), Pillow (patrón).
Para videos largos se rota la atmósfera cada ~90 s con fundido (sin corte).
"""

from __future__ import annotations


import numpy as np

from catalog import (
    AMBIENCE,
    LONG_ROTATION,
    OVERLAYS,
    SFX,
    ambience_path,
    first_existing_overlay,
    overlay_path,
    sfx_path,
)
from vision import REASONS, analyze_loop_look, pick_overlay, pick_sfx_palette
from watermark import drawtext_filter


def _probe_wh(path: str) -> tuple[int, int]:
    import json
    import subprocess

    out = subprocess.run(
        [
            "ffprobe", "-v", "error", "-select_streams", "v:0",
            "-show_entries", "stream=width,height", "-of", "json", path,
        ],
        capture_output=True, text=True, check=True,
    )
    st = json.loads(out.stdout)["streams"][0]
    return int(st["width"]), int(st["height"])


def analyze_rms_valleys(
    audio_path: str,
    start: float,
    end: float,
    block_sec: float | None = None,
    max_hits: int = 12,
    sfx_ids: list[str] | None = None,
) -> list[dict]:
    """
    Detecta momentos de atenuación real/breakdown de la música calculando el perfil
    RMS suavizado en dB respecto a la mediana del track (P50). Si la energía cae al
    menos 4.0 dB por debajo de P50, se alinea con el beat/onset más cercano y se
    espacian con un cooldown mínimo para evitar saturación de efectos.
    """
    import librosa
    from scipy.signal import find_peaks

    dur = max(0.5, end - start)
    y, sr = librosa.load(audio_path, sr=22050, mono=True, offset=start, duration=dur)
    hop = 512
    rms = librosa.feature.rms(y=y, hop_length=hop, frame_length=2048)[0]
    if len(rms) == 0:
        return []

    rms_db = librosa.amplitude_to_db(rms, ref=np.max)
    times = librosa.frames_to_time(np.arange(len(rms)), sr=sr, hop_length=hop)
    onsets = librosa.onset.onset_detect(y=y, sr=sr, hop_length=hop, units="time")

    # Suavizado sobre ventana de ~1.5s
    win_size = max(5, int(round(1.5 * sr / hop)))
    if win_size % 2 == 0:
        win_size += 1
    window = np.hanning(win_size)
    window /= window.sum()
    smoothed_db = np.convolve(rms_db, window, mode="same")

    p50 = float(np.median(smoothed_db))
    thresh = p50 - 4.0

    ids = [sid for sid in (sfx_ids or []) if sfx_path(sid)]
    if not ids:
        ids = [sid for sid in ("bamboo", "cave", "sword", "katana") if sfx_path(sid)]
    if not ids:
        return []

    if dur < 30.0:
        max_allowed_hits = 1
        min_gap_sec = 15.0
    elif dur < 60.0:
        max_allowed_hits = 2
        min_gap_sec = 25.0
    elif dur < 180.0:
        max_allowed_hits = 4
        min_gap_sec = 35.0
    else:
        max_allowed_hits = min(max_hits, max(2, int(dur // 45)))
        min_gap_sec = 45.0

    dist_frames = max(1, int(round(min_gap_sec * sr / hop)))
    valid_mask = (
        (times >= 4.0) & (times <= dur - 4.0)
        if dur >= 12.0
        else (times >= 1.0) & (times <= dur - 1.0)
    )

    # Buscamos valles en smoothed_db (picos de -smoothed_db con altura >= -thresh)
    peaks, _ = find_peaks(
        -smoothed_db,
        height=-thresh,
        distance=dist_frames,
        prominence=1.2,
    )
    valid_peaks = [p for p in peaks if valid_mask[p]]
    if not valid_peaks:
        return []

    chosen_peaks = valid_peaks[:max_allowed_hits]
    hits: list[dict] = []
    for idx, p in enumerate(chosen_peaks):
        t_best = float(times[p])
        val_db = float(smoothed_db[p])
        diff_db = round(p50 - val_db, 1)

        kind = f"Breakdown -{diff_db}dB"
        if len(onsets):
            j = int(np.argmin(np.abs(onsets - t_best)))
            if abs(float(onsets[j]) - t_best) <= 0.4:
                t_best = float(onsets[j])
                kind = f"Breakdown -{diff_db}dB (onset)"

        sid = ids[idx % len(ids)]
        hits.append({
            "id": sid,
            "label": SFX[sid]["label"],
            "time": round(t_best, 2),
            "gain": SFX[sid]["gain"],
            "reason": kind,
        })
    return hits


def tile_sfx(hits: list[dict], cycle: float, target: float) -> list[dict]:
    """Repite los valles de un ciclo de canción a lo largo de target segundos."""
    if cycle <= 1 or not hits:
        return [h for h in hits if h["time"] < target]
    out: list[dict] = []
    k = 0
    while k * cycle < target and len(out) < 16:
        for h in hits:
            t = h["time"] + k * cycle
            if 2 <= t <= target - 2:
                out.append({**h, "time": round(t, 2)})
            if len(out) >= 16:
                break
        k += 1
    return out


def build_plan(
    audio_path: str,
    *,
    audio_start: float,
    audio_end: float,
    target: float,
    atmosphere: str = "auto",
    sfx_on: bool = True,
    intensity: float = 0.45,
    watermark: bool = True,
    video_path: str | None = None,
    video_start: float = 0.0,
    video_end: float = 0.0,
) -> dict:
    cycle = max(0.5, audio_end - audio_start)
    intensity = max(0.15, min(0.8, intensity))

    look = None
    if video_path and video_end > video_start + 0.2:
        try:
            look = analyze_loop_look(video_path, video_start, video_end)
        except Exception:
            look = None

    auto = atmosphere == "auto" or atmosphere not in OVERLAYS
    if atmosphere == "off":
        overlay_id = None
    elif not auto and overlay_path(atmosphere):
        overlay_id = atmosphere
    elif look:
        overlay_id = pick_overlay(look)
    else:
        overlay_id = first_existing_overlay()

    palette = pick_sfx_palette(look) if look else [
        sid for sid in ("bamboo", "cave", "sword", "katana") if sfx_path(sid)
    ]

    ambience_id = None
    if overlay_id:
        ambience_id = OVERLAYS[overlay_id].get("ambience")
        if ambience_id and not ambience_path(ambience_id):
            ambience_id = next((k for k in AMBIENCE if ambience_path(k)), None)

    chapters: list[dict] = []
    if overlay_id and target >= 180:
        usable = [oid for oid in LONG_ROTATION if overlay_path(oid)]
        if overlay_id in usable:
            usable = [overlay_id] + [x for x in usable if x != overlay_id]
        chap = 90.0
        t = 0.0
        i = 0
        while t < target - 1:
            t1 = min(target, t + chap)
            oid = usable[i % len(usable)] if usable else overlay_id
            chapters.append({
                "start": round(t, 2),
                "end": round(t1, 2),
                "overlay": oid,
                "label": OVERLAYS[oid]["label"],
            })
            t = t1
            i += 1
    elif overlay_id:
        chapters = [{
            "start": 0,
            "end": round(target, 2),
            "overlay": overlay_id,
            "label": OVERLAYS[overlay_id]["label"],
        }]

    hits: list[dict] = []
    if sfx_on:
        raw = analyze_rms_valleys(audio_path, audio_start, audio_end, sfx_ids=palette)
        hits = tile_sfx(raw, cycle, target)

    opacity = None
    if overlay_id:
        base = OVERLAYS[overlay_id]["opacity"]
        opacity = round(base * (0.55 + intensity), 3)

    look_out = None
    if look:
        reason = ""
        if auto and overlay_id:
            reason = REASONS.get(overlay_id, look.get("overlayReason") or "el aspecto del clip")
        look_out = {
            "brightness": look["brightness"],
            "hue": look["hue"],
            "sat": look["sat"],
            "motion": look["motion"],
            "warm": look["warm"],
            "overlayReason": reason,
        }

    return {
        "overlay": overlay_id,
        "overlayLabel": OVERLAYS[overlay_id]["label"] if overlay_id else None,
        "blend": OVERLAYS[overlay_id]["blend"] if overlay_id else None,
        "opacity": opacity,
        "ambience": ambience_id,
        "ambienceLabel": AMBIENCE[ambience_id]["label"] if ambience_id else None,
        "ambienceVolume": 0.12 + 0.06 * intensity,
        "lowpassHz": 2800,
        "sfx": hits,
        "chapters": chapters,
        "watermark": watermark,
        "intensity": intensity,
        "target": target,
        "cycle": round(cycle, 3),
        "look": look_out,
        "sfxPalette": palette,
    }


def _even(n: int) -> int:
    return max(2, n - (n % 2))


def _probe_fps(path: str) -> float:
    import json
    import subprocess

    out = subprocess.run(
        [
            "ffprobe", "-v", "error", "-select_streams", "v:0",
            "-show_entries", "stream=r_frame_rate,avg_frame_rate", "-of", "json", path,
        ],
        capture_output=True, text=True,
    )
    try:
        st = json.loads(out.stdout)["streams"][0]
        raw = st.get("avg_frame_rate") or st.get("r_frame_rate") or "24/1"
        a, b = raw.split("/")
        fps = float(a) / max(1.0, float(b))
        return fps if 1.0 <= fps <= 120.0 else 24.0
    except Exception:
        return 24.0


def _yt_maxrate(w: int, h: int, fps: float) -> int:
    """YouTube recommended SDR ceiling — extra bits get thrown away on re-encode."""
    hi = fps >= 48
    long = max(w, h)
    if long >= 2000:
        return 45_000_000 if not hi else 68_000_000
    if long >= 1080:
        return 8_000_000 if not hi else 12_000_000
    return 5_000_000 if not hi else 7_500_000


def _run_ffmpeg(
    cmd: list[str],
    *,
    timeout: int,
    target: float,
    on_progress=None,
) -> None:
    import subprocess
    import time

    argv = cmd[:-1] + ["-progress", "pipe:1", "-nostats", cmd[-1]]
    proc = subprocess.Popen(
        argv, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True,
    )
    last = -1
    deadline = time.time() + timeout
    assert proc.stdout is not None
    while True:
        if time.time() > deadline:
            proc.kill()
            raise RuntimeError("ffmpeg timed out")
        line = proc.stdout.readline()
        if not line:
            if proc.poll() is not None:
                break
            continue
        line = line.strip()
        if line.startswith("out_time_ms=") and on_progress:
            try:
                ms = int(line.split("=", 1)[1])
                pct = int(min(99, max(0, 100.0 * (ms / 1_000_000.0) / max(0.2, target))))
                if pct != last:
                    on_progress(pct, "encoding")
                    last = pct
            except ValueError:
                pass
    err = proc.stderr.read() if proc.stderr else ""
    rc = proc.wait()
    if rc != 0:
        raise RuntimeError((err or "ffmpeg error")[-1200:])


def render_composed(
    *,
    video_seg: str,
    audio_path: str,
    audio_start: float,
    audio_end: float,
    target: float,
    plan: dict,
    out_path: str,
    preview: bool = False,
    timeout: int = 1800,
    on_progress=None,
    aspect: str = "landscape",
) -> None:
    """Loop video + song + atmosphere + SFX + watermark. YouTube-safe encode."""
    shorts = aspect in ("shorts", "9:16", "vertical")
    w, h = _probe_wh(video_seg)
    fps = _probe_fps(video_seg)

    if shorts:
        w, h = 1080, 1920
        target = min(30.0, max(20.0, target))
    elif preview:
        scale = min(1.0, 960 / max(w, 1))
        w, h = _even(int(w * scale)), _even(int(h * scale))
        target = min(target, 20.0)

    oid = plan.get("overlay")
    opacity = float(plan.get("opacity") or 0.3)
    blend = plan.get("blend") or "screen"
    aid = plan.get("ambience")
    sfx_list = list(plan.get("sfx") or [])
    if preview or shorts:
        sfx_list = [s for s in sfx_list if s["time"] < target]
    wm_on = bool(plan.get("watermark", True))
    amb_vol = float(plan.get("ambienceVolume") or 0.14)
    lpf = int(plan.get("lowpassHz") or 2800)

    inputs: list[str] = ["-y", "-v", "error", "-stream_loop", "-1", "-i", video_seg]
    # 0 = video
    idx = 1
    ov_idx = None
    if oid and overlay_path(oid):
        inputs += ["-stream_loop", "-1", "-i", overlay_path(oid)]
        ov_idx = idx
        idx += 1
    au_idx = idx
    if audio_start > 0.001:
        inputs += ["-stream_loop", "-1", "-ss", f"{audio_start:.4f}", "-i", audio_path]
    else:
        inputs += ["-stream_loop", "-1", "-i", audio_path]
    idx += 1
    amb_idx = None
    if aid and ambience_path(aid):
        inputs += ["-stream_loop", "-1", "-i", ambience_path(aid)]
        amb_idx = idx
        idx += 1
    sfx_indices: list[tuple[int, dict]] = []
    for s in sfx_list:
        p = sfx_path(s["id"])
        if not p:
            continue
        inputs += ["-i", p]
        sfx_indices.append((idx, s))
        idx += 1

    # --- video ---
    if shorts:
        cover = (
            f"scale={w}:{h}:force_original_aspect_ratio=increase:flags=bicubic,"
            f"crop={w}:{h},setsar=1,setpts=PTS-STARTPTS"
        )
        vf = [f"[0:v]{cover}[base]"]
    else:
        vf = [f"[0:v]scale={w}:{h}:flags=bicubic,setsar=1,setpts=PTS-STARTPTS[base]"]
    last = "base"
    if ov_idx is not None:
        vf.append(
            f"[{ov_idx}:v]scale={w}:{h}:force_original_aspect_ratio=increase,"
            f"crop={w}:{h},setsar=1,format=gbrp,setpts=PTS-STARTPTS[ov]"
        )
        vf.append("[base]format=gbrp[basef]")
        vf.append(
            f"[basef][ov]blend=all_mode={blend}:all_opacity={opacity:.3f},"
            f"format=yuv420p[blended]"
        )
        last = "blended"
    if wm_on:
        vf.append(f"[{last}]{drawtext_filter(shorts=shorts)},format=yuv420p[outv]")
    else:
        vf.append(f"[{last}]format=yuv420p[outv]")
    last = "outv"

    # --- audio ---
    af: list[str] = [
        f"[{au_idx}:a]aresample=48000,aformat=sample_fmts=fltp:channel_layouts=stereo,volume=1.0[music]"
    ]
    mix = ["[music]"]
    if amb_idx is not None:
        af.append(
            f"[{amb_idx}:a]aresample=48000,aformat=sample_fmts=fltp:channel_layouts=stereo,"
            f"lowpass=f={lpf},volume={amb_vol:.3f}[amb]"
        )
        mix.append("[amb]")
    for i, s in sfx_indices:
        ms = int(max(0, s["time"]) * 1000)
        g = float(s.get("gain") or 0.35)
        af.append(
            f"[{i}:a]aresample=48000,aformat=sample_fmts=fltp:channel_layouts=stereo,"
            f"adelay={ms}|{ms},volume={g:.3f}[sfx{i}]"
        )
        mix.append(f"[sfx{i}]")
    n = len(mix)
    if n == 1:
        af.append("[music]loudnorm=I=-14:TP=-1.0:LRA=11,alimiter=limit=0.98[outa]")
    else:
        af.append(
            f"{''.join(mix)}amix=inputs={n}:duration=first:dropout_transition=0:normalize=0,"
            f"loudnorm=I=-14:TP=-1.0:LRA=11,alimiter=limit=0.98[outa]"
        )

    fc = ";".join(vf + af)
    gop = max(24, int(round(fps * 2)))
    keymin = max(12, int(round(fps)))
    maxrate = 10_000_000 if shorts else _yt_maxrate(w, h, fps)
    if preview:
        vflags = [
            "-c:v", "libx264", "-preset", "veryfast", "-crf", "20",
            "-pix_fmt", "yuv420p", "-profile:v", "high",
        ]
        a_br = "192k"
    else:
        vflags = [
            "-c:v", "libx264", "-preset", "fast", "-crf", "17",
            "-maxrate", str(maxrate), "-bufsize", str(maxrate * 2),
            "-pix_fmt", "yuv420p", "-profile:v", "high",
            "-g", str(gop), "-keyint_min", str(keymin), "-bf", "2",
            "-sc_threshold", "0",
        ]
        a_br = "320k"
    cmd = [
        "ffmpeg", *inputs,
        "-filter_complex", fc,
        "-map", "[outv]", "-map", "[outa]",
        "-t", f"{target:.4f}",
        *vflags,
        "-c:a", "aac", "-b:a", a_br, "-ar", "48000",
        "-map_metadata", "-1", "-map_chapters", "-1",
        "-fflags", "+bitexact", "-flags:v", "+bitexact", "-flags:a", "+bitexact",
        "-metadata", "encoder=",
        "-metadata:s:v:0", "handler_name=",
        "-metadata:s:a:0", "handler_name=",
        "-movflags", "+faststart",
        out_path,
    ]
    if on_progress:
        on_progress(1, "encoding")
    _run_ffmpeg(cmd, timeout=timeout, target=target, on_progress=on_progress)
    if on_progress:
        on_progress(100, "done")
