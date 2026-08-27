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
) -> tuple[float, list[tuple[float, float, float]]]:
    """
    Calcula el flujo óptico denso entre fotogramas consecutivos y
    detecta el periodo fundamental en segundos de la animación/movimiento de cámara 2.5D.
    """
    n = len(smalls)
    if n < 6 or fps <= 0:
        return 0.0, []

    grays = [cv2.cvtColor(f, cv2.COLOR_RGB2GRAY) for f in smalls]
    flows: list[tuple[float, float, float]] = []

    for i in range(n - 1):
        prev = grays[i]
        curr = grays[i + 1]
        flow = cv2.calcOpticalFlowFarneback(
            prev, curr, None, 0.5, 3, 15, 3, 5, 1.2, 0
        )
        vx = float(np.mean(flow[..., 0]))
        vy = float(np.mean(flow[..., 1]))
        mag = float(np.sqrt(vx**2 + vy**2))
        flows.append((vx, vy, mag))

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
    flows: list[tuple[float, float, float]],
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
    dur = max(0.1, end_t - start_t)
    if not smalls or fps <= 0 or stride < 1:
        return 0.0, "Toma Continua"

    i = max(0, min(len(smalls) - 1, int(round(start_t * fps / stride))))
    j = max(0, min(len(smalls) - 1, int(round(end_t * fps / stride))))

    if i == j:
        return 0.0, "Toma Continua"

    # 1. Similitud visual en fotogramas inicio/fin
    a = cv2.cvtColor(smalls[i], cv2.COLOR_RGB2GRAY).astype(np.float32)
    b = cv2.cvtColor(smalls[j], cv2.COLOR_RGB2GRAY).astype(np.float32)
    mad = float(np.mean(np.abs(a - b)))
    visual_pct = max(0.0, min(100.0, 100.0 * (1.0 - mad / 28.0)))

    # 2. Coincidencia de vector de velocidad de cámara
    motion_pct = 100.0
    if flows and i < len(flows) and j < len(flows):
        v1 = flows[i]
        v2 = flows[j]
        dv = np.sqrt((v1[0] - v2[0]) ** 2 + (v1[1] - v2[1]) ** 2)
        motion_pct = max(0.0, min(100.0, 100.0 * (1.0 - dv / 3.5)))

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

    final_score = round(0.45 * visual_pct + 0.35 * motion_pct + 0.20 * harmonic_pct, 1)
    return float(max(10.0, min(99.9, final_score))), label
