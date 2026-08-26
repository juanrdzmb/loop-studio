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
        "aka": "The Black Swordsman",
        "playlist": "Silent Vigil · Struggler (Guts)",
        "hooks": ["The Black Swordsman", "Struggler", "Guts"],
        "hashtags": ["#slowedandreverb", "#berserk", "#guts", "#animeaesthetic", "#doomerwave"],
        "tags": [
            "slowed and reverb", "slowed + reverb", "slowed reverb",
            "anime aesthetic", "anime edit", "lofi",
            "songs to study", "sleep music", "sad songs slowed",
            "berserk", "guts", "black swordsman", "doomerwave",
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
        "playlist": "Silent Vigil · Echo of the Sword (Musashi)",
        "hooks": ["Vagabond", "Musashi", "Takezo"],
        "hashtags": ["#slowedandreverb", "#vagabond", "#musashi", "#animeaesthetic", "#samurai"],
        "tags": [
            "slowed and reverb", "slowed + reverb", "slowed reverb",
            "anime aesthetic", "anime edit", "lofi",
            "songs to study", "sleep music", "vagabond", "musashi",
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
        "playlist": "Silent Vigil · Architecture of Silence (Mori)",
        "hooks": ["The Climber", "K2", "Buntarō Mori"],
        "hashtags": ["#slowedandreverb", "#theclimber", "#animeaesthetic", "#lofi", "#doomer"],
        "tags": [
            "slowed and reverb", "slowed + reverb", "slowed reverb",
            "anime aesthetic", "anime edit", "lofi",
            "songs to study", "sleep music", "the climber", "kokou no hito",
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
    canned = {
        "guts": (
            "Slowed + reverb as a nervous-system brake. The Black Swordsman’s "
            "hypervigilance needs a room he can stay in — doomerwave, struggler, "
            "not invincible, just still here."
        ),
        "thorfinn": (
            "After revenge there is a cathedral of echo. Thorfinn’s redemption is "
            "a low-pass on trauma — Vinland as quiet, not conquest."
        ),
        "musashi": (
            "Takezo was high BPM. Musashi is the slowdown: from the farm arc to "
            "Reigandō, mastery is learning to sit in the reverb of what the sword did."
        ),
        "buntaro": (
            "Long reverb is hedgehog distance — close enough to feel, far enough not "
            "to bleed. On K2 the Immortal Climber dissolves; the outro is the man coming home."
        ),
    }
    text = canned.get(cid, "Slowed + reverb aesthetic loop.")
    return text if len(text) <= limit else text[: limit - 1]



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
        reason = f"filename mentions “{hit}”"
        if has_refs:
            reason += " + reference photos"
    elif has_refs:
        reason = "reference photos + drawing style"
    else:
        reason = "drawing style (frames)"


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
    label = song_l or meta["name"]

    if song_l:
        title = f"{song_l} (Slowed + Reverb) | {hook}"
    else:
        title = f"{meta['name']} (Slowed + Reverb) | {hook}"
    if len(title) > 70:
        title = title[:69].rsplit(" ", 1)[0]

    dur = f"{minutes:g} min" if minutes >= 1 else f"{int(minutes * 60)}s"
    mood = atmosphere if atmosphere and atmosphere not in ("auto", "off") else None
    blurb = _blurb(cid)

    first = (
        f"{label} (slowed + reverb) for late nights, study, and sleep. "
        f"{meta['series']} · {meta['name']} aesthetic loop."
    )
    tags = list(meta["tags"])
    if song_l:
        tags = [song_l.lower(), *tags]
    hashes = ["#slowedandreverb", "#animeaesthetic", "#lofi"]
    for h in meta["hashtags"]:
        if h not in hashes and len(hashes) < 5:
            hashes.append(h)

    desc = (
        f"{first}\n\n"
        f"0:00 {label} (Slowed + Reverb)\n\n"
        f"{blurb}\n\n"
        f"{dur} seamless loop"
        f"{f' · {mood} atmosphere' if mood else ''}.\n\n"
        f"Silent Vigil Music\n"
        f"Playlist: {meta['playlist']}\n\n"
        f"comment the next song\n\n"
        f"{' '.join(hashes)}"
    )

    shorts_hashes = ["#Shorts", "#slowedandreverb", "#animeaesthetic"]
    for h in meta["hashtags"]:
        if h not in shorts_hashes and len(shorts_hashes) < 5:
            shorts_hashes.append(h)
    shorts_title = f"{label} (Slowed + Reverb)"
    if len(shorts_title) > 55:
        shorts_title = shorts_title[:54].rsplit(" ", 1)[0]
    shorts_desc = (
        f"{label} slowed + reverb · {meta['name']} · {meta['series']}\n"
        f"full loop on the channel\n\n"
        f"{' '.join(shorts_hashes)}"
    )

    return {
        "character": cid,
        "name": meta["name"],
        "series": meta["series"],
        "title": title,
        "description": desc,
        "hashtags": hashes,
        "tags": tags,
        "tagsLine": ", ".join(tags),
        "playlist": meta["playlist"],
        "pinnedComment": (
            f"Today: {meta['name']} ({meta['series']}). "
            f"What song should I slow + reverb next?"
        ),
        "thumbnailTip": (
            "Thumbnail drives CTR. 1280×720, one clear subject, little text, "
            "readable on a phone. Use the frame picker below."
        ),
        "shortsTitle": shorts_title,
        "shortsDescription": shorts_desc,
        "shortsHashtags": shorts_hashes,
        "shortsTagsLine": ", ".join(
            ["shorts", "youtube shorts", "slowed and reverb", "anime aesthetic", meta["series"].lower(), meta["name"].lower()]
        ),
    }
