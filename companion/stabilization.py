"""Estabilización local avanzada para Loop Studio.

Mide el movimiento global con esquinas Shi–Tomasi, LK piramidal con validación
forward/backward y una transformación de similitud robusta por RANSAC. Solo
elimina la componente rápida de la trayectoria: un paneo suave se conserva.
"""

from __future__ import annotations

import math
from dataclasses import dataclass

import cv2
import numpy as np


def _clamp(value: float, low: float, high: float) -> float:
    return max(low, min(high, value))


def _percentile(values: list[float], ratio: float) -> float:
    if not values:
        return 0.0
    return float(np.percentile(np.asarray(values, dtype=np.float64), ratio * 100.0))


@dataclass
class _PathSample:
    time: float
    x: float
    y: float
    rotation: float
    log_scale: float
    confidence: float
    segment: int


def _scene_cut(previous: np.ndarray, current: np.ndarray) -> bool:
    mad = float(np.mean(cv2.absdiff(previous, current)))
    prev_hist = cv2.calcHist([previous], [0], None, [32], [0, 256])
    curr_hist = cv2.calcHist([current], [0], None, [32], [0, 256])
    cv2.normalize(prev_hist, prev_hist)
    cv2.normalize(curr_hist, curr_hist)
    correlation = float(cv2.compareHist(prev_hist, curr_hist, cv2.HISTCMP_CORREL))
    return mad > 54.0 or (mad > 34.0 and correlation < 0.35)


def _estimate_similarity(
    previous: np.ndarray,
    current: np.ndarray,
) -> tuple[float, float, float, float, float] | None:
    height, width = previous.shape[:2]
    mask = np.zeros_like(previous)
    margin_x = max(4, round(width * 0.04))
    margin_y = max(4, round(height * 0.04))
    mask[margin_y : height - margin_y, margin_x : width - margin_x] = 255
    points = cv2.goodFeaturesToTrack(
        previous,
        maxCorners=320,
        qualityLevel=0.012,
        minDistance=7,
        blockSize=7,
        mask=mask,
    )
    if points is None or len(points) < 16:
        return None

    lk = dict(winSize=(21, 21), maxLevel=3, criteria=(cv2.TERM_CRITERIA_EPS | cv2.TERM_CRITERIA_COUNT, 30, 0.01))
    forward, forward_status, _ = cv2.calcOpticalFlowPyrLK(previous, current, points, None, **lk)
    if forward is None or forward_status is None:
        return None
    backward, backward_status, _ = cv2.calcOpticalFlowPyrLK(current, previous, forward, None, **lk)
    if backward is None or backward_status is None:
        return None

    fb_error = np.linalg.norm(points.reshape(-1, 2) - backward.reshape(-1, 2), axis=1)
    valid = (
        (forward_status.reshape(-1) == 1)
        & (backward_status.reshape(-1) == 1)
        & np.isfinite(fb_error)
        & (fb_error <= 1.35)
    )
    old = points.reshape(-1, 2)[valid]
    new = forward.reshape(-1, 2)[valid]
    if len(old) < 12:
        return None

    matrix, inliers = cv2.estimateAffinePartial2D(
        old,
        new,
        method=cv2.RANSAC,
        ransacReprojThreshold=2.0,
        maxIters=2000,
        confidence=0.995,
        refineIters=10,
    )
    if matrix is None or not np.all(np.isfinite(matrix)):
        return None

    a = float(matrix[0, 0])
    c = float(matrix[1, 0])
    scale = math.hypot(a, c)
    rotation = math.degrees(math.atan2(c, a))
    tx = float(matrix[0, 2])
    ty = float(matrix[1, 2])
    if not (0.97 <= scale <= 1.03):
        return None
    if abs(rotation) > 3.0 or abs(tx) > width * 0.08 or abs(ty) > height * 0.08:
        return None

    inlier_ratio = float(np.mean(inliers)) if inliers is not None and len(inliers) else 0.0
    track_factor = _clamp(len(old) / 90.0, 0.0, 1.0)
    fb_factor = 1.0 - _clamp(float(np.median(fb_error[valid])) / 1.35, 0.0, 1.0)
    confidence = _clamp(0.55 * inlier_ratio + 0.25 * track_factor + 0.20 * fb_factor, 0.0, 1.0)
    return tx / width, ty / height, rotation, math.log(max(1e-6, scale)), confidence


def analyze_stabilization(path: str, max_samples: int = 360) -> dict:
    cap = cv2.VideoCapture(path)
    if not cap.isOpened():
        raise ValueError("No se pudo abrir el vídeo")

    try:
        fps = float(cap.get(cv2.CAP_PROP_FPS) or 24.0)
        frame_count = int(cap.get(cv2.CAP_PROP_FRAME_COUNT) or 0)
        source_width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH) or 0)
        source_height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT) or 0)
        if frame_count <= 0 or source_width < 2 or source_height < 2:
            raise ValueError("Vídeo sin frames legibles")

        target_fps = min(15.0, max(6.0, fps))
        stride_for_rate = max(1, int(round(fps / target_fps)))
        stride_for_budget = max(1, math.ceil(frame_count / max(24, max_samples)))
        stride = max(stride_for_rate, stride_for_budget)
        analysis_fps = fps / stride
        analysis_width = min(480, source_width)
        analysis_height = max(32, int(round(source_height * analysis_width / source_width)))

        frames: list[tuple[float, np.ndarray]] = []
        index = 0
        while True:
            ok, frame = cap.read()
            if not ok:
                break
            if index % stride == 0:
                resized = cv2.resize(frame, (analysis_width, analysis_height), interpolation=cv2.INTER_AREA)
                gray = cv2.cvtColor(resized, cv2.COLOR_BGR2GRAY)
                frames.append((index / fps, gray))
            index += 1
    finally:
        cap.release()

    if len(frames) < 5:
        return {
            "version": 2,
            "source": "companion-opencv",
            "auto_enabled": False,
            "confidence": 0.0,
            "crop_scale": 1.0,
            "jitter_rms_px": 0.0,
            "analysis_fps": round(analysis_fps, 3),
            "source_width": source_width,
            "source_height": source_height,
            "keyframes": [],
            "reason": "No hay suficientes fotogramas para medir microvibración.",
        }

    path_x = 0.0
    path_y = 0.0
    path_rotation = 0.0
    path_log_scale = 0.0
    segment = 0
    samples = [_PathSample(frames[0][0], 0.0, 0.0, 0.0, 0.0, 1.0, segment)]

    for index in range(1, len(frames)):
        time_value, current = frames[index]
        previous = frames[index - 1][1]
        if _scene_cut(previous, current):
            segment += 1
            path_x = path_y = path_rotation = path_log_scale = 0.0
            samples.append(_PathSample(time_value, 0.0, 0.0, 0.0, 0.0, 0.0, segment))
            continue

        motion = _estimate_similarity(previous, current)
        if motion is None:
            samples.append(
                _PathSample(time_value, path_x, path_y, path_rotation, path_log_scale, 0.0, segment)
            )
            continue
        dx, dy, rotation, log_scale, confidence = motion
        path_x += dx
        path_y += dy
        path_rotation += rotation
        path_log_scale += log_scale
        samples.append(
            _PathSample(time_value, path_x, path_y, path_rotation, path_log_scale, confidence, segment)
        )

    radius_sec = 0.42
    sigma_sec = 0.16
    segment_bounds: dict[int, tuple[float, float]] = {}
    for item in samples:
        start, end = segment_bounds.get(item.segment, (item.time, item.time))
        segment_bounds[item.segment] = (min(start, item.time), max(end, item.time))

    keyframes: list[dict] = []
    correction_magnitudes: list[float] = []
    max_norm = 0.0
    max_rotation = 0.0
    max_scale_delta = 0.0
    for sample in samples:
        weights = []
        neighbours = []
        for candidate in samples:
            if candidate.segment != sample.segment:
                continue
            distance = abs(candidate.time - sample.time)
            if distance > radius_sec:
                continue
            weight = math.exp(-0.5 * (distance / sigma_sec) ** 2)
            weights.append(weight)
            neighbours.append(candidate)
        total_weight = sum(weights) or 1.0
        smooth_x = sum(item.x * weight for item, weight in zip(neighbours, weights)) / total_weight
        smooth_y = sum(item.y * weight for item, weight in zip(neighbours, weights)) / total_weight
        smooth_rotation = sum(item.rotation * weight for item, weight in zip(neighbours, weights)) / total_weight
        smooth_log_scale = sum(item.log_scale * weight for item, weight in zip(neighbours, weights)) / total_weight

        segment_start, segment_end = segment_bounds[sample.segment]
        edge_distance = min(sample.time - segment_start, segment_end - sample.time)
        edge_gain = _clamp(edge_distance / radius_sec, 0.0, 1.0)
        dx = _clamp((smooth_x - sample.x) * edge_gain, -0.0125, 0.0125)
        dy = _clamp((smooth_y - sample.y) * edge_gain, -0.0125, 0.0125)
        rotation = _clamp((smooth_rotation - sample.rotation) * edge_gain, -0.6, 0.6)
        local_scale = math.exp((smooth_log_scale - sample.log_scale) * edge_gain)
        local_scale = _clamp(local_scale, 0.995, 1.005)

        max_norm = max(max_norm, abs(dx), abs(dy))
        max_rotation = max(max_rotation, abs(rotation))
        max_scale_delta = max(max_scale_delta, abs(local_scale - 1.0))
        translation_px = math.hypot(dx * source_width, dy * source_height)
        rotation_px = math.radians(abs(rotation)) * min(source_width, source_height) * 0.35
        scale_px = abs(local_scale - 1.0) * min(source_width, source_height) * 0.5
        correction_magnitudes.append(math.sqrt(translation_px**2 + rotation_px**2 + scale_px**2))
        keyframes.append(
            {
                "time": round(sample.time, 5),
                "dx": round(dx, 7),
                "dy": round(dy, 7),
                "rotation": round(rotation, 5),
                "scale": round(local_scale, 7),
                "confidence": round(sample.confidence, 4),
            }
        )

    valid_confidences = [sample.confidence for sample in samples[1:] if sample.confidence > 0]
    confidence = _percentile(valid_confidences, 0.5)
    jitter_rms = math.sqrt(sum(value * value for value in correction_magnitudes) / max(1, len(correction_magnitudes)))
    required_scale = 1.0 + 2.0 * max_norm + math.radians(max_rotation) * 0.55 + max_scale_delta
    crop_scale = _clamp(required_scale, 1.0, 1.02)
    correction_is_safe = required_scale <= 1.0201
    enough_tracks = len(valid_confidences) >= max(4, len(samples) // 5)
    auto_enabled = confidence >= 0.58 and jitter_rms >= 0.25 and correction_is_safe and enough_tracks

    if confidence < 0.58 or not enough_tracks:
        reason = "Movimiento ambiguo: se mantiene la estabilización básica del navegador."
    elif jitter_rms < 0.25:
        reason = "El clip ya se ve estable; no necesita corrección avanzada."
    elif not correction_is_safe:
        reason = "La corrección avanzada exigiría más de 2% de recorte; se conserva el encuadre."
    else:
        reason = f"Microvibración avanzada corregida ({jitter_rms:.1f} px, recorte {(crop_scale - 1) * 100:.1f}%)."

    return {
        "version": 2,
        "source": "companion-opencv",
        "auto_enabled": bool(auto_enabled),
        "confidence": round(confidence, 4),
        "crop_scale": round(crop_scale, 6),
        "jitter_rms_px": round(jitter_rms, 4),
        "analysis_fps": round(analysis_fps, 3),
        "source_width": source_width,
        "source_height": source_height,
        "keyframes": keyframes,
        "reason": reason,
    }
