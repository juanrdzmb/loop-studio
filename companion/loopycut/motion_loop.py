"""
Manga Motion 2.5D Aware Loop Periodicity & Optical Flow Matcher
Analiza el movimiento de cámara en videos para detectar ciclos armónicos completos
(zoom, paneo, inclinación) y encontrar puntos de corte que formen un loop perfecto sin saltos.
"""

from __future__ import annotations
import cv2
import numpy as np


def compute_motion_periodicity(
    smalls: list[np.ndarray], fps: float, stride: int
) -> tuple[float, list[tuple[float, float, float, float]]]:
    """
    Calcula el flujo óptico denso entre fotogramas consecutivos y
    detecta el periodo fundamental en segundos de la animación/movimiento de cámara 2.5D.
    """
    n = len(smalls)
    if n < 6 or fps <= 0:
        return 0.0, []

    grays = [cv2.cvtColor(f, cv2.COLOR_RGB2GRAY) for f in smalls]
    flows: list[tuple[float, float, float, float]] = []

    for i in range(n - 1):
        prev = grays[i]
        curr = grays[i + 1]
        flow = cv2.calcOpticalFlowFarneback(
            prev, curr, None, 0.5, 3, 15, 3, 5, 1.2, 0
        )
        backward = cv2.calcOpticalFlowFarneback(
            curr, prev, None, 0.5, 3, 15, 3, 5, 1.2, 0
        )
        # La mediana ignora mejor personajes/partículas que se mueven de forma
        # independiente que la media global usada anteriormente.
        vx = float(np.median(flow[..., 0]))
        vy = float(np.median(flow[..., 1]))
        mag = float(np.sqrt(vx**2 + vy**2))
        back_x = float(np.median(backward[..., 0]))
        back_y = float(np.median(backward[..., 1]))
        fb_error = float(np.hypot(vx + back_x, vy + back_y))
        consistency = max(0.0, min(1.0, 1.0 - fb_error / 2.5))
        flows.append((vx, vy, mag, consistency))

    if flows:
        flows.append(flows[-1])

    # Matriz de distancia visual promedio
    dists = np.zeros((n, n), dtype=np.float32)
    for i in range(n):
        for j in range(i + 1, n):
            dists[i, j] = float(np.mean(np.abs(grays[i].astype(np.float32) - grays[j].astype(np.float32))))
            dists[j, i] = dists[i, j]

    max_lag = min(n - 2, int(round(15.0 * fps / max(1, stride))))
    min_lag = max(2, int(round(1.5 * fps / max(1, stride))))

    if max_lag <= min_lag:
        return 0.0, flows

    diag_profile = np.zeros(max_lag + 1, dtype=np.float32)
    for lag in range(1, max_lag + 1):
        vals = [dists[i, i + lag] for i in range(n - lag)]
        diag_profile[lag] = float(np.mean(vals)) if vals else 999.0

    valid_range = diag_profile[min_lag : max_lag + 1]
    if len(valid_range) > 0:
        best_idx = min_lag + int(np.argmin(valid_range))
        period_sec = float((best_idx * stride) / fps)
        return period_sec, flows

    return 0.0, flows


def evaluate_motion_loop(
    start_t: float,
    end_t: float,
    smalls: list[np.ndarray],
    flows: list[tuple[float, float, float, float]],
    fps: float,
    stride: int,
    period_sec: float,
) -> tuple[float, str]:
    """
    Evalúa la coherencia de un candidato a loop considerando:
    1. Similitud de imagen en la costura (MAD en gris).
    2. Coincidencia de vector de velocidad de cámara (Delta v).
    3. Ajuste al ciclo armónico 2.5D (period_sec).
    Retorna (score_pct, label_tag).
    """
    result = evaluate_motion_loop_v2(
        start_t,
        end_t,
        smalls,
        flows,
        fps,
        stride,
        period_sec,
    )
    return float(result["score"]), str(result["label"])


def evaluate_motion_loop_v2(
    start_t: float,
    end_t: float,
    smalls: list[np.ndarray],
    flows: list[tuple[float, float, float, float]],
    fps: float,
    stride: int,
    period_sec: float,
) -> dict:
    """Evalúa una costura con imagen, ventana de movimiento y riesgo de corte."""
    dur = max(0.1, end_t - start_t)
    if not smalls or fps <= 0 or stride < 1:
        return {
            "score": 0.0,
            "label": "Toma Continua",
            "quality": "review",
            "metrics": {
                "seam_visual": 0.0,
                "motion_match": 0.0,
                "scene_cut_risk": 1.0,
                "confidence": 0.0,
                "flow_consistency": 0.0,
            },
        }

    i = max(0, min(len(smalls) - 1, int(round(start_t * fps / stride))))
    j = max(0, min(len(smalls) - 1, int(round(end_t * fps / stride))))

    if i == j:
        return {
            "score": 0.0,
            "label": "Toma Continua",
            "quality": "review",
            "metrics": {
                "seam_visual": 0.0,
                "motion_match": 0.0,
                "scene_cut_risk": 1.0,
                "confidence": 0.0,
                "flow_consistency": 0.0,
            },
        }

    # 1. Similitud visual en fotogramas inicio/fin
    a = cv2.cvtColor(smalls[i], cv2.COLOR_RGB2GRAY).astype(np.float32)
    b = cv2.cvtColor(smalls[j], cv2.COLOR_RGB2GRAY).astype(np.float32)
    mad = float(np.mean(np.abs(a - b)))
    mad_pct = max(0.0, min(100.0, 100.0 * (1.0 - mad / 28.0)))
    hist_a = cv2.calcHist([a.astype(np.uint8)], [0], None, [32], [0, 256])
    hist_b = cv2.calcHist([b.astype(np.uint8)], [0], None, [32], [0, 256])
    cv2.normalize(hist_a, hist_a)
    cv2.normalize(hist_b, hist_b)
    hist_corr = max(0.0, min(1.0, float(cv2.compareHist(hist_a, hist_b, cv2.HISTCMP_CORREL))))
    visual_pct = 0.78 * mad_pct + 22.0 * hist_corr

    # 2. Coincidencia de vector de velocidad de cámara
    motion_pct = 70.0
    flow_consistency = 0.5
    if flows:
        radius = max(1, int(round(0.25 * fps / max(1, stride))))
        start_window = flows[i : min(len(flows), i + radius + 1)]
        end_window = flows[max(0, min(len(flows), j) - radius) : min(len(flows), j + 1)]
        if start_window and end_window:
            start_vx = float(np.median([flow[0] for flow in start_window]))
            start_vy = float(np.median([flow[1] for flow in start_window]))
            end_vx = float(np.median([flow[0] for flow in end_window]))
            end_vy = float(np.median([flow[1] for flow in end_window]))
            delta_v = float(np.hypot(start_vx - end_vx, start_vy - end_vy))
            start_mag = float(np.hypot(start_vx, start_vy))
            end_mag = float(np.hypot(end_vx, end_vy))
            scale = max(1.2, start_mag + end_mag + 0.75)
            motion_pct = max(0.0, min(100.0, 100.0 * (1.0 - delta_v / scale)))
            flow_consistency = float(
                np.median([flow[3] if len(flow) > 3 else 0.5 for flow in start_window + end_window])
            )

    # Un candidato pegado a un cambio de plano o flash no puede declararse
    # perfecto aunque sus endpoints se parezcan por casualidad.
    adjacent_diffs = [
        float(np.mean(cv2.absdiff(
            cv2.cvtColor(smalls[k - 1], cv2.COLOR_RGB2GRAY),
            cv2.cvtColor(smalls[k], cv2.COLOR_RGB2GRAY),
        )))
        for k in range(1, len(smalls))
    ]
    baseline_diff = float(np.median(adjacent_diffs)) if adjacent_diffs else 1.0
    boundary_values = []
    if i > 0:
        boundary_values.append(adjacent_diffs[i - 1])
    if 0 < j < len(smalls):
        boundary_values.append(adjacent_diffs[j - 1])
    boundary_diff = max(boundary_values) if boundary_values else baseline_diff
    scene_cut_risk = max(
        0.0,
        min(1.0, (boundary_diff - max(18.0, baseline_diff * 1.8)) / max(18.0, baseline_diff * 2.8)),
    )

    # 3. Ajuste a ciclo armónico 2.5D
    harmonic_pct = 85.0
    label = "🎯 Toma Continua Fluida"

    if period_sec > 0.8:
        multiples = [dur / (k * period_sec) for k in (1, 2, 3)]
        closest_mult = min(multiples, key=lambda m: abs(m - 1.0))
        delta_cycle = abs(closest_mult - 1.0)

        if delta_cycle < 0.08:
            harmonic_pct = 100.0
            k_cycles = round(dur / period_sec)
            if k_cycles == 1:
                label = "🌟 Ciclo 2.5D Completo (100% Sincronizado)"
            else:
                label = f"🔄 Ciclo 2.5D ({k_cycles}x Armónico)"
        elif delta_cycle < 0.20:
            harmonic_pct = 90.0
            label = "✨ Movimiento Armónico 2.5D"
        else:
            harmonic_pct = max(60.0, 100.0 * (1.0 - delta_cycle))

    confidence = max(
        0.0,
        min(
            1.0,
            (0.50 * visual_pct + 0.35 * motion_pct + 15.0 * flow_consistency) / 100.0
            * (1.0 - scene_cut_risk * 0.72),
        ),
    )
    final_score = (
        0.48 * visual_pct
        + 0.30 * motion_pct
        + 0.14 * harmonic_pct
        + 8.0 * flow_consistency
        - 22.0 * scene_cut_risk
    )
    final_score = float(max(10.0, min(99.9, round(final_score, 1))))
    if final_score >= 85.0 and confidence >= 0.78 and scene_cut_risk < 0.25:
        quality = "excellent"
    elif final_score >= 68.0 and confidence >= 0.52 and scene_cut_risk < 0.60:
        quality = "good"
    else:
        quality = "review"

    return {
        "score": final_score,
        "label": label,
        "quality": quality,
        "metrics": {
            "seam_visual": round(float(visual_pct), 1),
            "motion_match": round(float(motion_pct), 1),
            "scene_cut_risk": round(float(scene_cut_risk), 3),
            "confidence": round(float(confidence), 3),
            "flow_consistency": round(float(flow_consistency), 3),
        },
    }
