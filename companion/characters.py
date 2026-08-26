"""4 protagonistas: detectar quién sale en el clip y armar el pack de YouTube.

Fuente de copy: docs/*.md (los ensayos). Detección sin torch:
fotogramas (OpenCV) + nombre del archivo + fotos opcionales en docs/refs/<id>/.
"""

from __future__ import annotations

import re
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parent.parent
DOCS = ROOT / "docs"
REFS = DOCS / "refs"

CHARACTERS: dict[str, dict] = {
    "guts": {
        "id": "guts",
        "name": "Guts",
        "series": "Berserk",
        "aka": "El Espadachín Negro",
        "playlist": "Silent Vigil · Struggler (Guts)",
        "hooks": ["The Black Swordsman", "Struggler", "Guts"],
        "hashtags": ["#slowedandreverb", "#berserk", "#guts", "#animeaesthetic", "#doomerwave"],
        "tags": [
            "slowed reverb", "slowed and reverb", "berserk", "guts",
            "black swordsman", "doomerwave", "anime mix", "study music",
            "sleep music", "lofi anime", "corecore",
        ],
        "filename_keys": (
            "guts", "berserk", "griffith", "casca", "struggler",
            "espadachin", "blackswordsman", "black-swordsman",
        ),
    },
    "thorfinn": {
        "id": "thorfinn",
        "name": "Thorfinn",
        "series": "Vinland Saga",
        "aka": "Thorfinn Karlsefni",
        "playlist": "Silent Vigil · Vinland (Thorfinn)",
        "hooks": ["Vinland", "Thorfinn", "Redemption"],
        "hashtags": ["#slowedandreverb", "#vinlandsaga", "#thorfinn", "#animeaesthetic", "#corecore"],
        "tags": [
            "slowed reverb", "vinland saga", "thorfinn", "karlsefni",
            "askeladd", "corecore", "anime mix", "study music",
            "sleep music", "lofi anime",
        ],
        "filename_keys": (
            "thorfinn", "vinland", "askeladd", "karlsefni", "vinlandsaga",
        ),
    },
    "musashi": {
        "id": "musashi",
        "name": "Miyamoto Musashi",
        "series": "Vagabond",
        "aka": "Takezo",
        "playlist": "Silent Vigil · El eco de la espada (Musashi)",
        "hooks": ["Vagabond", "Musashi", "Takezo"],
        "hashtags": ["#slowedandreverb", "#vagabond", "#musashi", "#animeaesthetic", "#samurai"],
        "tags": [
            "slowed reverb", "vagabond", "miyamoto musashi", "takezo",
            "samurai", "ink", "study music", "sleep music", "lofi anime",
        ],
        "filename_keys": (
            "musashi", "miyamoto", "vagabond", "takezo", "inoue", "gorin",
        ),
    },
    "buntaro": {
        "id": "buntaro",
        "name": "Buntarō Mori",
        "series": "The Climber",
        "aka": "Katou Buntarou",
        "playlist": "Silent Vigil · Arquitectura del silencio (Mori)",
        "hooks": ["The Climber", "K2", "Buntarō Mori"],
        "hashtags": ["#slowedandreverb", "#theclimber", "#kokounohito", "#animeaesthetic", "#doomer"],
        "tags": [
            "slowed reverb", "the climber", "kokou no hito", "buntaro mori",
            "k2", "alpinismo", "doomer", "study music", "sleep music",
        ],
        "filename_keys": (
            "buntaro", "buntarou", "buntarō", "mori", "climber",
            "kokou", "k2", "katou", "sakamoto",
        ),
    },
}


def list_characters() -> list[dict]:
    out = []
    for cid, m in CHARACTERS.items():
        out.append({
            "id": cid,
            "name": m["name"],
            "series": m["series"],
            "aka": m["aka"],
            "playlist": m["playlist"],
            "hasEssay": _essay_path(cid) is not None,
            "hasRefs": _ref_paths(cid),
        })
    return out


def _essay_path(cid: str) -> Path | None:
    keys = {
        "guts": ("guts",),
        "thorfinn": ("thorfinn",),
        "musashi": ("musashi", "miyamoto"),
        "buntaro": ("buntar", "mori"),
    }[cid]
    if not DOCS.is_dir():
        return None
    for q in DOCS.glob("*.md"):
        stem = q.stem.lower()
        if any(k in stem for k in keys):
            return q
    return None


def _ref_paths(cid: str) -> bool:
    d = REFS / cid
    if not d.is_dir():
        return False
    return any(p.suffix.lower() in {".jpg", ".jpeg", ".png", ".webp"} for p in d.iterdir())


def load_essay(cid: str) -> str:
    p = _essay_path(cid)
    if not p:
        return ""
    raw = p.read_text(encoding="utf-8", errors="replace")
    raw = raw.replace("\\+", "+")
    keep: list[str] = []
    for line in raw.splitlines():
        t = line.strip()
        if not t or t.startswith("#") or t.startswith("|"):
            continue
        t = re.sub(r"[#*_`]+", "", t).strip()
        if len(t) < 40:
            continue
        keep.append(t)
    return re.sub(r"\s+", " ", " ".join(keep)).strip()


def _blurb(cid: str, limit: int = 380) -> str:
    text = load_essay(cid)
    if not text:
        meta = CHARACTERS[cid]
        return f"{meta['name']} ({meta['series']}). Slowed + Reverb para quedarte en la escena."
    parts = [s.strip() for s in re.split(r"(?<=[.!?])\s+", text) if len(s.strip()) > 90]
    body: list[str] = []
    for s in parts:
        if s.count(":") >= 1 and len(s) < 140:
            continue
        if re.match(r"^\d+\.", s):
            continue
        body.append(s)
        if sum(len(x) for x in body) > 240:
            break
    out = " ".join(body or parts[:2]).strip()
    if len(out) > limit:
        out = out[: limit - 1].rsplit(" ", 1)[0] + "…"
    return out


def _sample_frames(video_path: str, start: float, end: float, n: int = 8):
    import cv2

    cap = cv2.VideoCapture(video_path)
    if not cap.isOpened():
        return []
    try:
        if end <= start:
            end = start + 8.0
        span = max(0.2, end - start)
        times = [start + (i + 0.5) * span / n for i in range(n)]
        frames = []
        for t in times:
            cap.set(cv2.CAP_PROP_POS_MSEC, max(0.0, t) * 1000.0)
            ok, frame = cap.read()
            if ok and frame is not None:
                h, w = frame.shape[:2]
                if w > 1:
                    frames.append(cv2.resize(frame, (160, max(1, int(h * 160 / w)))))
        return frames
    finally:
        cap.release()


def _frame_stats(frames: list) -> dict:
    import cv2

    brights, sats, warms, contrasts = [], [], [], []
    gray_r, snow_r, dark_r, cool_r, edges = [], [], [], [], []
    for f in frames:
        hsv = cv2.cvtColor(f, cv2.COLOR_BGR2HSV)
        h, s, v = cv2.split(hsv)
        b, _g, r = cv2.split(f)
        brights.append(float(v.mean()) / 255.0)
        sats.append(float(s.mean()))
        warms.append(float(r.mean()) - float(b.mean()))
        contrasts.append(float(v.std()) / 255.0)
        gray_r.append(float((s < 30).mean()))
        snow_r.append(float(((v > 200) & (s < 40)).mean()))
        dark_r.append(float((v < 50).mean()))
        cool_r.append(float(((h >= 80) & (h <= 140)).mean()))
        edges.append(float(cv2.Canny(v, 80, 160).mean()) / 255.0)
    return {
        "brightness": float(np.mean(brights)),
        "sat": float(np.mean(sats)),
        "warm": float(np.mean(warms)),
        "contrast": float(np.mean(contrasts)),
        "gray": float(np.mean(gray_r)),
        "snow": float(np.mean(snow_r)),
        "dark": float(np.mean(dark_r)),
        "cool": float(np.mean(cool_r)),
        "edge": float(np.mean(edges)),
    }


def _style_scores(st: dict) -> dict[str, float]:
    """Priores de arte: tinta Vagabond, nieve The Climber, oscuro Berserk, frío Vinland."""
    guts = (
        1.4 * st["dark"]
        + 1.1 * st["contrast"]
        + 0.6 * max(0.0, st["warm"] / 40.0)
        + 0.4 * (1.0 - st["gray"])
        - 0.8 * st["snow"]
        - 0.5 * st["gray"]
    )
    thorfinn = (
        1.2 * st["cool"]
        + 0.8 * (1.0 - abs(st["brightness"] - 0.45))
        + 0.4 * (st["sat"] / 80.0)
        - 0.7 * st["gray"]
        - 0.4 * st["snow"]
        - 0.3 * st["dark"]
    )
    musashi = (
        1.6 * st["gray"]
        + 1.1 * st["edge"]
        + 0.6 * (1.0 - min(1.0, st["sat"] / 60.0))
        - 0.8 * st["snow"]
        - 0.4 * max(0.0, st["warm"] / 40.0)
    )
    buntaro = (
        1.6 * st["snow"]
        + 0.9 * max(0.0, st["brightness"] - 0.45)
        + 0.5 * st["cool"]
        - 0.7 * st["gray"]
        - 0.3 * st["dark"]
    )
    return {
        "guts": float(guts),
        "thorfinn": float(thorfinn),
        "musashi": float(musashi),
        "buntaro": float(buntaro),
    }


def _filename_hit(name: str) -> str | None:
    slug = re.sub(r"[^a-z0-9]+", "", (name or "").lower())
    for cid, meta in CHARACTERS.items():
        if any(k.replace("-", "") in slug for k in meta["filename_keys"]):
            return cid
    return None


def _hist(img):
    import cv2

    hsv = cv2.cvtColor(img, cv2.COLOR_BGR2HSV)
    h = cv2.calcHist([hsv], [0, 1], None, [18, 16], [0, 180, 0, 256])
    cv2.normalize(h, h)
    return h


def _ref_scores(frames: list) -> dict[str, float]:
    import cv2

    scores = {cid: 0.0 for cid in CHARACTERS}
    if not frames:
        return scores
    f_hists = [_hist(f) for f in frames]
    for cid in CHARACTERS:
        folder = REFS / cid
        if not folder.is_dir():
            continue
        refs = [
            p for p in folder.iterdir()
            if p.suffix.lower() in {".jpg", ".jpeg", ".png", ".webp"}
        ]
        if not refs:
            continue
        best = []
        for rp in refs:
            img = cv2.imread(str(rp))
            if img is None:
                continue
            rh = _hist(img)
            best.append(max(float(cv2.compareHist(rh, fh, cv2.HISTCMP_CORREL)) for fh in f_hists))
        if best:
            scores[cid] = float(np.mean(best))
    return scores


def identify_character(
    video_path: str,
    *,
    start: float = 0.0,
    end: float = 0.0,
    filename: str = "",
) -> dict:
    frames = _sample_frames(video_path, start, end if end > start else start + 8.0)
    style = {cid: 0.0 for cid in CHARACTERS}
    stats = None
    if frames:
        stats = _frame_stats(frames)
        style = _style_scores(stats)
    refs = _ref_scores(frames)
    has_refs = any(v > 0 for v in refs.values())

    scores = {}
    for cid in CHARACTERS:
        if has_refs:
            scores[cid] = 0.65 * refs[cid] + 0.35 * style[cid]
        else:
            scores[cid] = style[cid]

    hit = _filename_hit(filename)
    if hit:
        scores[hit] = scores.get(hit, 0.0) + 1.4
        reason = f"el archivo menciona «{hit}»"
        if has_refs:
            reason += " + fotos de referencia"
    elif has_refs:
        reason = "fotos de referencia + estilo del dibujo"
    else:
        reason = "estilo del dibujo (fotogramas)"

    winner = max(scores, key=scores.get)
    ranked = sorted(scores.items(), key=lambda kv: kv[1], reverse=True)
    margin = ranked[0][1] - ranked[1][1] if len(ranked) > 1 else ranked[0][1]
    confidence = int(max(22, min(96, 48 + margin * 28)))

    look = None
    if stats:
        look = {k: round(float(v), 3) for k, v in stats.items()}

    return {
        "id": winner,
        "name": CHARACTERS[winner]["name"],
        "series": CHARACTERS[winner]["series"],
        "confidence": confidence,
        "reason": reason,
        "scores": {k: round(float(v), 3) for k, v in ranked},
        "look": look,
        "alternatives": [
            {"id": k, "name": CHARACTERS[k]["name"], "score": round(float(v), 3)}
            for k, v in ranked
        ],
    }


def _song_label(raw: str | None) -> str | None:
    if not raw:
        return None
    name = Path(raw).stem
    name = re.sub(r"^[\d_\-.\s]+", "", name)
    name = name.replace("_", " ").replace("-", " ").strip()
    name = re.sub(r"\s+", " ", name)
    if len(name) < 2:
        return None
    return name[:80]


def build_youtube_pack(
    character_id: str,
    *,
    song: str | None = None,
    minutes: float = 1.0,
    atmosphere: str | None = None,
) -> dict:
    cid = character_id if character_id in CHARACTERS else "guts"
    meta = CHARACTERS[cid]
    hook = meta["hooks"][0]
    song_l = _song_label(song)

    if song_l:
        title = f"{song_l} (Slowed + Reverb) | {hook}"
    else:
        title = f"{meta['name']} | {hook} (Slowed + Reverb)"
    if len(title) > 70:
        title = title[:69].rsplit(" ", 1)[0]

    dur = f"{minutes:g} min" if minutes >= 1 else f"{int(minutes * 60)} s"
    atmo = f"Atmósfera: {atmosphere}. " if atmosphere and atmosphere not in ("auto", "off") else ""
    blurb = _blurb(cid)

    first = (
        f"Slowed + Reverb · {meta['series']} · {meta['name']} · "
        f"anime aesthetic / study / sleep"
    )
    desc = (
        f"{first}\n\n"
        f"{blurb}\n\n"
        f"{atmo}Loop de {dur} — el corte del video se funde solo; "
        f"si la canción es más corta, el final se une con el inicio.\n\n"
        f"Silent Vigil Music\n"
        f"Playlist: {meta['playlist']}\n\n"
        f"¿Qué tema bajo al siguiente?\n\n"
        f"{' '.join(meta['hashtags'])}"
    )

    pinned = (
        f"Hoy: {meta['name']} ({meta['series']}). "
        f"¿Qué canción quieres en slowed + reverb?"
    )

    return {
        "character": cid,
        "name": meta["name"],
        "series": meta["series"],
        "title": title,
        "description": desc,
        "hashtags": meta["hashtags"],
        "tags": meta["tags"],
        "tagsLine": ", ".join(meta["tags"]),
        "playlist": meta["playlist"],
        "pinnedComment": pinned,
        "thumbnailTip": (
            "Un solo fotograma limpio del personaje, poco texto, alto contraste. "
            "El thumbnail es el SEO visual de este nicho."
        ),
    }
