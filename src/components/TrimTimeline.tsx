"use client";

import { useCallback } from "react";
import type { TrimRange } from "@/lib/types";

interface Props {
  duration: number;
  start: number;
  end: number;
  currentTime?: number;
  onChange: (range: TrimRange) => void;
}

function fmt(t: number): string {
  const m = Math.floor(t / 60);
  const s = Math.floor(t % 60);
  const cs = Math.floor((t % 1) * 100);
  return `${m}:${String(s).padStart(2, "0")}.${String(cs).padStart(2, "0")}`;
}

/** Timeline de doble aguja para recortar el clip */
export default function TrimTimeline({ duration, start, end, currentTime, onChange }: Props) {
  const setStart = useCallback(
    (v: number) => onChange({ start: Math.min(v, end - 0.2), end }),
    [end, onChange]
  );
  const setEnd = useCallback(
    (v: number) => onChange({ start, end: Math.max(v, start + 0.2) }),
    [start, onChange]
  );

  const pct = (t: number) => `${(t / duration) * 100}%`;
  const playPct = currentTime != null && duration > 0 ? pct(Math.min(currentTime, duration)) : null;

  return (
    <div className="w-full select-none">
      <div className="flex justify-between text-xs text-zinc-400 mb-1">
        <span>Inicio {fmt(start)}</span>
        <span>
          Duración {(end - start).toFixed(2)}s · Video {fmt(duration)}
        </span>
        <span>Fin {fmt(end)}</span>
      </div>

      <div className="relative h-10">
        {/* pista */}
        <div className="absolute top-1/2 -translate-y-1/2 w-full h-2 rounded bg-zinc-700" />
        {/* región seleccionada */}
        <div
          className="absolute top-1/2 -translate-y-1/2 h-2 rounded bg-fuchsia-500"
          style={{ left: pct(start), width: `${((end - start) / duration) * 100}%` }}
        />
        {/* marcador de reproducción */}
        {playPct && (
          <div
            className="absolute top-0 bottom-0 w-0.5 bg-white/80 pointer-events-none"
            style={{ left: playPct }}
          />
        )}
        <input
          type="range"
          aria-label="Inicio del recorte"
          min={0}
          max={duration}
          step={0.01}
          value={start}
          onChange={(e) => setStart(parseFloat(e.target.value))}
          className="range-thumb absolute inset-x-0 top-1/2 -translate-y-1/2 w-full appearance-none bg-transparent pointer-events-none [&::-webkit-slider-thumb]:pointer-events-auto [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-8 [&::-webkit-slider-thumb]:rounded [&::-webkit-slider-thumb]:bg-fuchsia-400 [&::-webkit-slider-thumb]:cursor-grab [&::-moz-range-thumb]:pointer-events-auto [&::-moz-range-thumb]:w-4 [&::-moz-range-thumb]:h-8 [&::-moz-range-thumb]:rounded [&::-moz-range-thumb]:bg-fuchsia-400 [&::-moz-range-thumb]:border-0"
        />
        <input
          type="range"
          aria-label="Fin del recorte"
          min={0}
          max={duration}
          step={0.01}
          value={end}
          onChange={(e) => setEnd(parseFloat(e.target.value))}
          className="range-thumb absolute inset-x-0 top-1/2 -translate-y-1/2 w-full appearance-none bg-transparent pointer-events-none [&::-webkit-slider-thumb]:pointer-events-auto [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-8 [&::-webkit-slider-thumb]:rounded [&::-webkit-slider-thumb]:bg-cyan-400 [&::-webkit-slider-thumb]:cursor-grab [&::-moz-range-thumb]:pointer-events-auto [&::-moz-range-thumb]:w-4 [&::-moz-range-thumb]:h-8 [&::-moz-range-thumb]:rounded [&::-moz-range-thumb]:bg-cyan-400 [&::-moz-range-thumb]:border-0"
        />
      </div>

      <div className="flex gap-2 mt-3">
        <button
          onClick={() => onChange({ start: 0, end })}
          className="text-xs px-2 py-1 rounded bg-zinc-800 hover:bg-zinc-700"
        >
          ⇤ Inicio en 0
        </button>
        <button
          onClick={() => onChange({ start, end: duration })}
          className="text-xs px-2 py-1 rounded bg-zinc-800 hover:bg-zinc-700"
        >
          Fin al final ⇥
        </button>
      </div>
    </div>
  );
}
