"""Marca de agua: 'Silent Vigil Music' recorre el borde, sin © ni patrón central."""

from __future__ import annotations

import os

BRAND = "Silent Vigil Music"

FONT_CANDIDATES = [
    "/usr/share/fonts/julietaula-montserrat-fonts/Montserrat-Light.otf",
    "/usr/share/fonts/julietaula-montserrat-fonts/Montserrat-Medium.otf",
    "/usr/share/fonts/julietaula-montserrat-fonts/Montserrat-Regular.otf",
    "/usr/share/fonts/liberation-sans-fonts/LiberationSans-Regular.ttf",
    "/usr/share/fonts/dejavu-sans-fonts/DejaVuSans.ttf",
]


def brand_fontfile() -> str | None:
    for p in FONT_CANDIDATES:
        if os.path.isfile(p):
            return p
    return None


def drawtext_filter() -> str:
    """Texto en el borde superior: esquina izquierda ↔ derecha. No cruza el centro."""
    font = brand_fontfile()
    fontopt = ""
    if font:
        escaped = font.replace("\\", "/").replace(":", r"\:")
        fontopt = f":fontfile={escaped}"
    return (
        f"drawtext=text='{BRAND}'{fontopt}"
        f":fontsize=h/36:fontcolor=white@0.32"
        f":shadowcolor=black@0.55:shadowx=1:shadowy=1"
        f":x='16+(w-tw-32)*abs(mod(t/18\\,2)-1)'"
        f":y='14'"
    )
