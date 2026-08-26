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
        "label": "Fog",
        "blend": "screen",
        "opacity": 0.32,
        "ambience": "night",
    },
    "smoke": {
        "file": "smoke.mp4",
        "label": "Smoke",
        "blend": "screen",
        "opacity": 0.28,
        "ambience": "cold",
    },
    "rain": {
        "file": "rain.mp4",
        "label": "Rain",
        "blend": "screen",
        "opacity": 0.34,
        "ambience": "rain",
    },
    "particles": {
        "file": "particles.mp4",
        "label": "Particles",
        "blend": "screen",
        "opacity": 0.30,
        "ambience": "wind",
    },
    "spark": {
        "file": "particulas 3.mp4",
        "label": "Sparks",
        "blend": "screen",
        "opacity": 0.26,
        "ambience": "wind",
    },
    "fire": {
        "file": "Fire.mp4",
        "label": "Fire",
        "blend": "screen",
        "opacity": 0.22,
        "ambience": "fire",
    },
}

AMBIENCE: dict[str, dict] = {
    "night": {"file": "night_ambience.mp3", "label": "Night"},
    "cold": {"file": "Cold_night.mp3", "label": "Cold night"},
    "sea": {"file": "sea.mp3", "label": "Sea"},
    "wind": {"file": "wind.mp3", "label": "Wind"},
    "rain": {"file": "rain.mp3", "label": "Rain"},
    "fire": {"file": "camp_fire.mp3", "label": "Campfire"},
    "peace": {"file": "paceful.mp3", "label": "Calm"},
    "bamboo": {"file": "bamboo.mp3", "label": "Bamboo"},
    "cave": {"file": "drop cave .mp3", "label": "Cave"},
    "farm": {"file": "farm_relax.mp3", "label": "Farm"},
}

# Live in audio_ambience/ (audio_sfx/ is empty)
SFX: dict[str, dict] = {
    "thunder": {"file": "thunder.mp3", "label": "Thunder", "gain": 0.08},
    "katana": {"file": "katana.mp3", "label": "Katana", "gain": 0.06},
    "sword": {"file": "sword.mp3", "label": "Sword", "gain": 0.06},
    "bamboo": {"file": "bamboo.mp3", "label": "Bamboo", "gain": 0.09},
    "cave": {"file": "drop cave .mp3", "label": "Cave Drop", "gain": 0.10},
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
    out = [{"id": "auto", "label": "Auto"}, {"id": "off", "label": "No atmosphere"}]
    for oid, m in OVERLAYS.items():
        if overlay_path(oid):
            out.append({"id": oid, "label": m["label"]})
    return out


def first_existing_overlay() -> str | None:
    for oid in ("fog", "smoke", "particles", "rain", "fire"):
        if overlay_path(oid):
            return oid
    return None
