#!/usr/bin/env python3
"""Regression check for the companion's visual-loop candidate contract."""

from __future__ import annotations

import subprocess
import sys
import tempfile
import json
import socket
import time
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
PYTHON = ROOT / "companion" / ".venv" / "bin" / "python"


def make_two_cycle_clip(path: Path) -> None:
    subprocess.run(
        [
            "ffmpeg",
            "-y",
            "-loglevel",
            "error",
            "-f",
            "lavfi",
            "-i",
            "testsrc2=duration=4:size=320x180:rate=15",
            "-filter_complex",
            "[0:v]split=2[a][b];[a]setpts=PTS-STARTPTS[a0];"
            "[b]setpts=PTS-STARTPTS[b0];[a0][b0]concat=n=2:v=1:a=0[out]",
            "-map",
            "[out]",
            "-c:v",
            "libx264",
            "-pix_fmt",
            "yuv420p",
            str(path),
        ],
        check=True,
    )


def main() -> None:
    with tempfile.TemporaryDirectory(prefix="loop-studio-video-test-") as tmp:
        clip = Path(tmp) / "two-cycles.mp4"
        make_two_cycle_clip(clip)
        with socket.socket() as sock:
            sock.bind(("127.0.0.1", 0))
            port = sock.getsockname()[1]
        server = subprocess.Popen(
            [str(PYTHON), "-m", "uvicorn", "server:app", "--host", "127.0.0.1", "--port", str(port)],
            cwd=ROOT / "companion",
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
        try:
            for _ in range(50):
                health = subprocess.run(
                    ["curl", "-fsS", "--max-time", "1", f"http://127.0.0.1:{port}/health"],
                    capture_output=True,
                )
                if health.returncode == 0:
                    break
                time.sleep(0.1)
            response = subprocess.run(
                [
                    "curl",
                    "-fsS",
                    "-X",
                    "POST",
                    "-F",
                    f"video=@{clip}",
                    "-F",
                    "downsample=2",
                    "-F",
                    "window_sec=0",
                    f"http://127.0.0.1:{port}/analyze/video",
                ],
                check=True,
                capture_output=True,
                text=True,
            )
            data = json.loads(response.stdout)
        finally:
            server.terminate()
            server.wait(timeout=5)
        candidates = data["candidates"]
        assert candidates, data
        assert all(c.get("kind") in {"detected", "full"} for c in candidates), candidates
        assert candidates[0]["kind"] == "detected", candidates
        assert abs(float(candidates[0]["duration"]) - 4.0) < 0.25, candidates[0]
        full = next(c for c in candidates if c["kind"] == "full")
        assert float(full["score"]) < 100.0, full
        print("PASS companion visual-loop ranking and contract")


if __name__ == "__main__":
    main()
