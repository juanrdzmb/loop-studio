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

VISUAL_STYLES: dict[str, dict] = {
    "clean": {
        "id": "clean",
        "label": "🖼️ Original Limpio (1080p)",
        "hint": "Colores originales sin filtros + nitidez 1080p",
        "filter": "unsharp=5:5:0.6:3:3:0.0",
    },
    "seinen_bw": {
        "id": "seinen_bw",
        "label": "🖋️ Seinen B&W",
        "hint": "Tinta manga de alto contraste tradicional (Berserk/Vagabond)",
        "filter": "format=gray,eq=contrast=1.65:brightness=-0.04,unsharp=5:5:1.2:3:3:0.0",
    },
    "retro_90s": {
        "id": "retro_90s",
        "label": "📼 Retro 90s Anime",
        "hint": "Saturación celuloid analógica (Evangelion / Cowboy Bebop)",
        "filter": (
            "eq=contrast=1.18:brightness=-0.02:saturation=1.35,"
            "colorbalance=rs=0.08:gs=0.0:bs=-0.06:rm=0.1:gm=0.02:bm=-0.08,"
            "noise=alls=14:allf=t+u,"
            "vignette=PI/4.2"
        ),
    },
    "dark_fantasy": {
        "id": "dark_fantasy",
        "label": "🌑 Dark Fantasy",
        "hint": "Sombras de acero frío y atmósfera sombría (Dark Souls/Berserk)",
        "filter": (
            "eq=contrast=1.28:brightness=-0.05:saturation=0.82,"
            "colorbalance=rs=-0.04:gs=-0.02:bs=0.08:rm=-0.02:gm=0.0:bm=0.06:rh=0.02:gh=0.02:bh=0.04,"
            "vignette=PI/3.5,"
            "noise=alls=12:allf=t+u"
        ),
    },
    "cyberpunk_neon": {
        "id": "cyberpunk_neon",
        "label": "🌆 Cyberpunk Glow",
        "hint": "Neón vibrante magenta, cyan y alto contraste anime",
        "filter": (
            "eq=contrast=1.35:brightness=-0.02:saturation=1.65,"
            "colorbalance=rs=0.15:gs=-0.08:bs=0.22:rm=0.18:gm=-0.05:bm=0.25:rh=0.08:gh=-0.04:bh=0.15,"
            "vignette=PI/4.0"
        ),
    },
    "screentone": {
        "id": "screentone",
        "label": "📰 Screentone Halftone",
        "hint": "Trama Shonen clásica de imprenta manga",
        "filter": "format=gray,eq=contrast=1.85:brightness=-0.06,unsharp=7:7:1.5:3:3:0.0",
    },
    "vintage_sepia": {
        "id": "vintage_sepia",
        "label": "📜 Pergamino Sepia",
        "hint": "Tono pergamino samurái antiguo y cálido",
        "filter": "colorchannelmixer=.393:.769:.189:0:.349:.686:.168:0:.272:.534:.131,eq=contrast=1.18:brightness=-0.03,vignette=PI/3.8",
    },
    "anime_lofi": {
        "id": "anime_lofi",
        "label": "🌅 Lo-Fi Sunset",
        "hint": "Resplandor dorado suave, grano sutil y atardecer cálido",
        "filter": (
            "eq=contrast=1.12:brightness=-0.02:saturation=1.28,"
            "colorbalance=rs=0.08:gs=0.03:bs=-0.04:rm=0.1:gm=0.04:bm=-0.06:rh=0.05:gh=0.02:bh=-0.03,"
            "vignette=PI/4.5,"
            "noise=alls=10:allf=t+u,"
            "unsharp=5:5:0.6:3:3:0.0"
        ),
    },
    "golden_sunset": {
        "id": "golden_sunset",
        "label": "🌇 Golden Hour",
        "hint": "Crepúsculo ambarino épico para momentos de clímax",
        "filter": (
            "eq=contrast=1.14:brightness=-0.01:saturation=1.34,"
            "colorbalance=rs=0.12:gs=0.04:bs=-0.08:rm=0.14:gm=0.05:bm=-0.1:rh=0.08:gh=0.03:bh=-0.06,"
            "vignette=PI/4.2,"
            "noise=alls=8:allf=t+u,"
            "unsharp=5:5:0.5:3:3:0.0"
        ),
    },
}


def visual_style_filter(style_id: str) -> str:
    meta = VISUAL_STYLES.get(style_id) or VISUAL_STYLES["anime_lofi"]
    return meta["filter"]


def available_visual_styles() -> list[dict]:
    return [
        {"id": k, "label": v["label"], "hint": v["hint"]}
        for k, v in VISUAL_STYLES.items()
    ]
