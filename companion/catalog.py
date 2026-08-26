"""Catálogo de overlays, ambientes y SFX locales (carpeta assets/)."""

from __future__ import annotations

import os
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
ASSETS = ROOT / "assets"
OVERLAY_DIR = ASSETS / "overlays"
AMB_DIR = ASSETS / "audio_ambience"

# blend=screen: overlays sobre negro (humo, partículas, lluvia, fuego)
OVERLAYS: dict[str, dict] = {
    "fog": {
        "file": "fog.mp4",
        "label": "Niebla",
        "blend": "screen",
        "opacity": 0.32,
        "ambience": "night",
    },
    "smoke": {
        "file": "smoke.mp4",
        "label": "Humo",
        "blend": "screen",
        "opacity": 0.28,
        "ambience": "cold",
    },
    "rain": {
        "file": "rain.mp4",
        "label": "Lluvia",
        "blend": "screen",
        "opacity": 0.34,
        "ambience": "rain",
    },
    "particles": {
        "file": "particles.mp4",
        "label": "Partículas",
        "blend": "screen",
        "opacity": 0.30,
        "ambience": "wind",
    },
    "spark": {
        "file": "particulas 3.mp4",
        "label": "Chispas",
        "blend": "screen",
        "opacity": 0.26,
        "ambience": "wind",
    },
    "fire": {
        "file": "Fire.mp4",
        "label": "Fuego",
        "blend": "screen",
        "opacity": 0.22,
        "ambience": "fire",
    },
}

AMBIENCE: dict[str, dict] = {
    "night": {"file": "night_ambience.mp3", "label": "Noche"},
    "cold": {"file": "Cold_night.mp3", "label": "Noche fría"},
    "sea": {"file": "sea.mp3", "label": "Mar"},
    "wind": {"file": "wind.mp3", "label": "Viento"},
    "rain": {"file": "rain.mp3", "label": "Lluvia"},
    "fire": {"file": "camp_fire.mp3", "label": "Hoguera"},
    "peace": {"file": "paceful.mp3", "label": "Calma"},
    "bamboo": {"file": "bamboo.mp3", "label": "Bambú"},
    "cave": {"file": "drop cave .mp3", "label": "Cueva"},
    "farm": {"file": "farm_relax.mp3", "label": "Campo"},
}

# Están en audio_ambience/ (audio_sfx/ está vacío)
SFX: dict[str, dict] = {
    "thunder": {"file": "thunder.mp3", "label": "Trueno", "gain": 0.42},
    "sword": {"file": "sword.mp3", "label": "Espada", "gain": 0.32},
    "katana": {"file": "katana.mp3", "label": "Katana", "gain": 0.32},
}

# Rotación para videos largos (sin corte brusco: el render funde entre capítulos)
LONG_ROTATION = ["fog", "smoke", "particles", "rain"]


def overlay_path(oid: str) -> str | None:
    meta = OVERLAYS.get(oid)
    if not meta:
        return None
    p = OVERLAY_DIR / meta["file"]
    return str(p) if p.is_file() else None


def ambience_path(aid: str) -> str | None:
    meta = AMBIENCE.get(aid)
    if not meta:
        return None
    p = AMB_DIR / meta["file"]
    return str(p) if p.is_file() else None


def sfx_path(sid: str) -> str | None:
    meta = SFX.get(sid)
    if not meta:
        return None
    p = AMB_DIR / meta["file"]
    return str(p) if p.is_file() else None


def available_overlays() -> list[dict]:
    out = [{"id": "auto", "label": "Automático"}, {"id": "off", "label": "Sin atmósfera"}]
    for oid, m in OVERLAYS.items():
        if overlay_path(oid):
            out.append({"id": oid, "label": m["label"]})
    return out


def first_existing_overlay() -> str | None:
    for oid in ("fog", "smoke", "particles", "rain", "fire"):
        if overlay_path(oid):
            return oid
    return None
