"""Look del clip: OpenCV + PySceneDetect → overlay y paleta de SFX.

El vídeo decide qué atmósfera/SFX; la música (RMS/onsets) decide cuándo.
"""

from __future__ import annotations

import numpy as np

from catalog import overlay_path, sfx_path

REASONS = {
    "fog": "oscuro y poco saturado",
    "smoke": "oscuro y apagado",
    "rain": "tonos fríos y húmedos",
    "fire": "tonos cálidos",
    "particles": "mucho movimiento",
    "spark": "destellos y movimiento",
}

# Más específico primero: en empate de score gana el primero.
SCORE_KEYS = ("fire", "spark", "rain", "particles", "fog", "smoke")


def _uniform_times(start: float, end: float, n: int = 8) -> list[float]:
    span = max(0.001, end - start)
    return [start + i * span / n for i in range(n)]


def _scene_mids(video_path: str, start: float, end: float) -> list[float] | None:
    try:
        from scenedetect import ContentDetector, detect
    except ImportError:
        return None
    try:
        scenes = detect(video_path, ContentDetector())
    except Exception:
        return None
    mids: list[float] = []
    for a, b in scenes:
        s0, s1 = a.get_seconds(), b.get_seconds()
        if s1 > start and s0 < end:
            mids.append((max(s0, start) + min(s1, end)) / 2.0)
    if len(mids) <= 1:
        return None
    return mids[:8]


def _read_frame(cap, t: float):
    import cv2

    cap.set(cv2.CAP_PROP_POS_MSEC, max(0.0, t) * 1000.0)
    ok, frame = cap.read()
    return frame if ok and frame is not None else None


def _score(brightness: float, hue: float, sat: float, motion: float, warm: float) -> dict[str, float]:
    scores = {k: 0.0 for k in SCORE_KEYS}
    if warm > 15 and 0.25 <= brightness <= 0.75:
        scores["fire"] = 1.0
    if 90 <= hue <= 140 and sat > 40 and brightness < 0.55:
        scores["rain"] = 1.0
    if brightness < 0.35 and sat < 50 and motion < 12:
        scores["fog"] = 1.0
    if brightness < 0.45 and sat < 70:
        scores["smoke"] = 1.0
    if motion > 22 and warm > 10:
        scores["spark"] = 1.0
    if motion > 18:
        scores["particles"] = 1.0
    if max(scores.values()) <= 0:
        scores["fog" if brightness < 0.4 else "particles"] = 0.5
    return scores


def analyze_loop_look(video_path: str, start: float, end: float) -> dict | None:
    if end <= start:
        return None
    import cv2

    cap = cv2.VideoCapture(video_path)
    try:
        if not cap.isOpened():
            return None
        times = _scene_mids(video_path, start, end) or _uniform_times(start, end, 8)
        prev = None
        brights: list[float] = []
        hues: list[float] = []
        sats: list[float] = []
        warms: list[float] = []
        motions: list[float] = []
        for t in times:
            frame = _read_frame(cap, t)
            if frame is None:
                continue
            h, w = frame.shape[:2]
            if w < 1 or h < 1:
                continue
            small = cv2.resize(frame, (160, max(1, int(h * 160 / w))))
            hsv = cv2.cvtColor(small, cv2.COLOR_BGR2HSV)
            hues.append(float(hsv[:, :, 0].mean()))
            sats.append(float(hsv[:, :, 1].mean()))
            brights.append(float(hsv[:, :, 2].mean()) / 255.0)
            b, _g, r = cv2.split(small)
            warms.append(float(r.mean()) - float(b.mean()))
            if prev is not None:
                motions.append(float(np.mean(cv2.absdiff(small, prev))))
            prev = small
        if not brights:
            return None
        brightness = float(np.mean(brights))
        hue = float(np.mean(hues))
        sat = float(np.mean(sats))
        warm = float(np.mean(warms))
        motion = float(np.mean(motions)) if motions else 0.0
        scores = _score(brightness, hue, sat, motion, warm)
        look = {
            "brightness": round(brightness, 4),
            "hue": round(hue, 2),
            "sat": round(sat, 2),
            "motion": round(motion, 2),
            "warm": round(warm, 2),
            "scores": scores,
        }
        oid = pick_overlay(look)
        look["overlayReason"] = REASONS.get(oid or "", "el aspecto del clip")
        return look
    finally:
        cap.release()


def pick_overlay(look: dict) -> str | None:
    scores = look.get("scores") or {}
    candidates = {k: float(scores.get(k, 0)) for k in SCORE_KEYS if overlay_path(k)}
    if not candidates:
        return None
    return max(candidates, key=candidates.get)


def pick_sfx_palette(look: dict) -> list[str]:
    oid = pick_overlay(look)
    warm = float(look.get("warm") or 0)
    motion = float(look.get("motion") or 0)
    if oid in ("rain", "fog"):
        wanted = ["thunder"]
    elif oid in ("fire", "spark") or (warm > 15 and motion > 18):
        wanted = ["katana", "sword", "thunder"]
    elif oid == "particles":
        wanted = ["sword", "katana", "thunder"]
    else:
        wanted = ["thunder"]
    return [sid for sid in wanted if sfx_path(sid)]
