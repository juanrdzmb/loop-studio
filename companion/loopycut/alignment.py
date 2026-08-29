"""
Smart Forward Loop — estimación de alineación global IN -> OUT.

Detecta una pequeña transformación global entre frame inicial y final
del candidato elegido para ocultar la costura con crossfade compensado.

Usa phaseCorrelate (traslación subpixel) + intento ECC euclidiano
para scale/rotación. Todo sobre thumbnails 128-192px; después se escala
dx/dy a resolución real. Nunca añade dependencias pesadas.

Contrato de salida:
    {dx, dy, scale, rotation, confidence}  o None si inestable.
Clamps:
    |dx| <= 4% W, |dy| <= 4% H, scale ∈ [0.98,1.02], rot ∈ [-1.5°,+1.5°]
"""

from __future__ import annotations

import cv2
import numpy as np


def _to_gray_float(img: np.ndarray) -> np.ndarray:
    # img may be RGB (192px) or BGR — accept both
    if img.ndim == 3:
        # smalls from server are RGB; but handle any
        try:
            gray = cv2.cvtColor(img, cv2.COLOR_RGB2GRAY)
        except Exception:
            gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    else:
        gray = img
    return gray.astype(np.float32)


def estimate_global_alignment(
    start_thumb: np.ndarray,
    end_thumb: np.ndarray,
    orig_w: int = 1920,
    orig_h: int = 1080,
) -> dict | None:
    """
    Estima transformación end -> start (cómo mover IN para que coincida con OUT).
    Entradas son thumbs RGB (como en server.py smalls).
    Retorna dict con dx,dy en píxeles de la resolución original, scale y rotation.
    Si no hay confianza suficiente, retorna None.
    """
    try:
        if start_thumb is None or end_thumb is None:
            return None
        if start_thumb.shape[0] < 8 or start_thumb.shape[1] < 8:
            return None

        # Trabajar en gris flotante normalizado
        a_gray = _to_gray_float(start_thumb)
        b_gray = _to_gray_float(end_thumb)

        # Normalizar a 0-1 para phaseCorrelate / ECC
        # phaseCorrelate prefiere flotantes sin normalizar excesivamente; usamos directa
        # pero ECC quiere 0-1.
        thumb_w = int(a_gray.shape[1])
        thumb_h = int(a_gray.shape[0])

        # phaseCorrelate sobre tamaño original del thumb (192px) — rápido (<1ms)
        # Necesita flotante 32; ventana Hann mejora robustez
        win = cv2.createHanningWindow((thumb_w, thumb_h), cv2.CV_32F) if hasattr(cv2, "createHanningWindow") else None
        try:
            if win is not None:
                shift, response = cv2.phaseCorrelate(a_gray, b_gray, win)
            else:
                shift, response = cv2.phaseCorrelate(a_gray, b_gray)
        except Exception:
            return None

        dx_thumb, dy_thumb = float(shift[0]), float(shift[1])
        resp = float(response) if np.isfinite(response) else 0.0

        # Escalar traslación a resolución original si conocemos W/H de origen.
        # thumbs fueron hechos con resize a ancho fijo 192; altura proporcional.
        # Aproximamos escala por thumb_w vs orig_w.
        # Si orig_w no coincide con thumb_w exacto, usamos ratio por ancho.
        # Pedimos orig_w/h externos; si no, usamos thumb directo.
        scale_x = orig_w / max(1, thumb_w) if orig_w > thumb_w else 1.0
        scale_y = orig_h / max(1, thumb_h) if orig_h > thumb_h else 1.0

        dx = dx_thumb * scale_x
        dy = dy_thumb * scale_y

        # Clamp traducción a 4%
        max_dx = orig_w * 0.04
        max_dy = orig_h * 0.04
        if abs(dx) > max_dx or abs(dy) > max_dy:
            # Si phaseCorrelate sugiere salto grande, no es costura útil
            if resp < 0.55:
                return None
            dx = float(np.clip(dx, -max_dx, max_dx))
            dy = float(np.clip(dy, -max_dy, max_dy))

        # Inicializar resto
        scale = 1.0
        rotation = 0.0

        # Intentar refinar con ECC euclidiano para scale/rot si hay confianza base
        # Solo si la traslación ya sugiere solapamiento razonable y response no muy baja
        if resp >= 0.35 and abs(dx) < max_dx * 0.9 and abs(dy) < max_dy * 0.9:
            try:
                # Re-muestrear a 128 ancho para ECC estable y rápido
                ecc_w = 128
                ecc_h = max(8, int(round(thumb_h * ecc_w / max(1, thumb_w))))
                a_ecc = cv2.resize(a_gray, (ecc_w, ecc_h), interpolation=cv2.INTER_LINEAR)
                b_ecc = cv2.resize(b_gray, (ecc_w, ecc_h), interpolation=cv2.INTER_LINEAR)
                # ECC trabaja mejor con flotantes 0-1
                a_ecc = (a_ecc / 255.0).astype(np.float32)
                b_ecc = (b_ecc / 255.0).astype(np.float32)

                warp = np.eye(2, 3, dtype=np.float32)
                criteria = (cv2.TERM_CRITERIA_EPS | cv2.TERM_CRITERIA_COUNT, 30, 1e-4)
                # MOTION_EUCLIDEAN = rot + translation (sin escala); intentamos affine parcial si disponible
                # Probar primero EUCLIDEAN, luego si scale significativa usar AFFINE
                cc, warp = cv2.findTransformECC(a_ecc, b_ecc, warp, cv2.MOTION_EUCLIDEAN, criteria, None, 5)
                # Extraer rot
                # warp = [[cos*1 -sin*1 tx], [sin*1 cos*1 ty]]  (scale=1 en euclidean)
                cos_r = float(warp[0, 0])
                sin_r = float(warp[1, 0])
                rot_rad = float(np.arctan2(sin_r, cos_r))
                rot_deg = float(np.degrees(rot_rad))
                # clamp rot
                if abs(rot_deg) <= 1.5 + 0.2:
                    rotation = float(np.clip(rot_deg, -1.5, 1.5))
                # ECC euclidean no da escala; intentar affine solo si resp muy alta y aún sin scale
                if abs(resp) > 0.55:
                    try:
                        warp2 = np.eye(2, 3, dtype=np.float32)
                        cc2, warp2 = cv2.findTransformECC(a_ecc, b_ecc, warp2, cv2.MOTION_AFFINE, criteria, None, 3)
                        # affine: extraer escala aproximada
                        sc_x = float(np.sqrt(warp2[0, 0] ** 2 + warp2[0, 1] ** 2))
                        sc_y = float(np.sqrt(warp2[1, 0] ** 2 + warp2[1, 1] ** 2))
                        sc = float((sc_x + sc_y) * 0.5)
                        if 0.98 <= sc <= 1.02:
                            scale = sc
                            # si affine da rot, preferir ese rot refinado
                            rot2 = float(np.degrees(np.arctan2(warp2[1, 0], warp2[0, 0])))
                            if abs(rot2) <= 1.5:
                                rotation = float(np.clip(rot2, -1.5, 1.5))
                    except Exception:
                        pass
                # ECC confidence: cc es correlación mejorada
                # Si ECC reporta baja correlación, no usar rot/scale derivados de él
                if cc < 0.45:
                    rotation = 0.0
                    scale = 1.0
            except Exception:
                # ECC falló → mantener solo traslación por phaseCorrelate
                pass

        # Confianza final combinada: response de phaseCorrelate atenuada por magnitud de corrección
        # Ajustes grandes penalizan confianza
        motion_penalty = min(1.0, (abs(dx) / max_dx + abs(dy) / max_dy) * 0.5 + abs(rotation) / 1.5 * 0.3 + abs(scale - 1) / 0.02 * 0.2)
        confidence = float(max(0.0, min(1.0, resp * (1.0 - motion_penalty * 0.35))))

        if confidence < 0.30:
            # incluso traslación pequeña con confianza muy baja no ayuda
            if abs(dx) < 2 and abs(dy) < 2 and scale == 1.0 and rotation == 0.0:
                # traslación casi nula puede quedarse aunque confianza media-baja
                confidence = max(confidence, 0.32)
            else:
                return None

        # Redondear para contrato estable
        return {
            "dx": round(float(dx), 2),
            "dy": round(float(dy), 2),
            "scale": round(float(scale), 4),
            "rotation": round(float(rotation), 3),
            "confidence": round(float(confidence), 3),
        }
    except Exception:
        return None
