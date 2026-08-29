"use client";

import { useState } from "react";
import type { LoopCandidate } from "@/lib/companion";
import SongLoopWaveform from "@/components/SongLoopWaveform";

interface Props {
  audioBuffer: AudioBuffer;
  candidates: LoopCandidate[];
  /** Recorte del formato activo (el panel edita el formato que está sonando) */
  selected: LoopCandidate | null;
  onSelect: (c: LoopCandidate) => void;
  /** Re-análisis para el formato activo */
  onAnalyze: () => void;
  analyzing: boolean;
  targetSeconds: number;
  /** Formato audible activo */
  activeFormat: "16x9" | "9x16";
  onFormatChange: (f: "16x9" | "9x16") => void;
  /** Explicación de la fuente de los candidatos (companion/local/heurístico) */
  sourceHint: string;
  /** Rejilla de imán del drag (medio beat). undefined = sin imán */
  snapSec?: number;
  /** 16:9 usa el tema completo; 9:16 mueve una ventana de duración fija. */
  selectionMode: "full-song" | "fixed-window";
  /** Duración consumida en la canción fuente (cambia con el speed de slowed). */
  sourceWindowSeconds?: number;
  /** Vueltas del tema en 16:9; 1 conserva la reproducción única. */
  fullSongRepetitions?: number;
}

function fmt(t: number): string {
  const m = Math.floor(t / 60);
  const s = Math.floor(t % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

type EditorMode = "recommend" | "trim";

/**
 * Editor ÚNICO del loop de la canción (compartido por 16:9 y 9:16: editas lo que oyes).
 * Dos modos:
 *  - "Recomendar": chips con los mejores recortes detectados (companion o análisis local).
 *  - "Recortar": drag sobre la onda, imantado al beat.
 * El preview principal suena ya con efectos y costura: lo que oyes es lo que se exporta.
 */
export default function AudioLoopPanel({
  audioBuffer,
  candidates,
  selected,
  onSelect,
  onAnalyze,
  analyzing,
  targetSeconds,
  activeFormat,
  onFormatChange,
  sourceHint,
  snapSec,
  selectionMode,
  sourceWindowSeconds,
  fullSongRepetitions = 1,
}: Props) {
  const [mode, setMode] = useState<EditorMode>("recommend");
  const targetLabel =
    targetSeconds >= 60 ? `${(targetSeconds / 60).toFixed(0)} min` : `${targetSeconds}s`;
  const isFullSong = selectionMode === "full-song";

  return (
    <div data-testid="loop-editor" className="p-4 rounded-xl bg-zinc-950 border border-zinc-800/80 flex flex-col gap-3 text-xs">
      {/* Cabecera: título + toggle de formato + analizar */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <span className="font-semibold text-zinc-200">🎵 Música por formato</span>
        <div className="flex items-center gap-1.5">
          <div className="flex items-center rounded-lg bg-zinc-900 border border-zinc-800 p-0.5">
            <button
              type="button"
              onClick={() => onFormatChange("16x9")}
              className={`px-2.5 py-1 rounded-md font-bold text-[11px] cursor-pointer transition-all ${
                activeFormat === "16x9"
                  ? "bg-fuchsia-600 text-white shadow"
                  : "text-zinc-400 hover:text-white"
              }`}
              title="Editar el loop del formato 16:9 (también lo hace audible)"
            >
              🖥️ 16:9
            </button>
            <button
              type="button"
              onClick={() => onFormatChange("9x16")}
              className={`px-2.5 py-1 rounded-md font-bold text-[11px] cursor-pointer transition-all ${
                activeFormat === "9x16"
                  ? "bg-amber-500 text-zinc-950 shadow"
                  : "text-zinc-400 hover:text-white"
              }`}
              title="Editar el loop del formato 9:16 (también lo hace audible)"
            >
              📱 9:16
            </button>
          </div>
          {!isFullSong && mode === "recommend" && (
            <button
              type="button"
              onClick={onAnalyze}
              disabled={analyzing}
              className={`px-2.5 py-1 rounded-lg font-bold text-[11px] ${
                analyzing ? "bg-zinc-800 text-zinc-500" : "bg-fuchsia-600 hover:bg-fuchsia-500 text-white"
              }`}
            >
              {analyzing ? "Analizando…" : "Analizar de nuevo"}
            </button>
          )}
        </div>
      </div>

      {isFullSong ? (
        <div className="rounded-xl border border-fuchsia-500/30 bg-fuchsia-950/20 p-4">
          <p className="text-sm font-bold text-white">
            🖥️ {fullSongRepetitions > 1 ? `Canción completa · ${fullSongRepetitions} vueltas` : "Canción completa, una sola reproducción"}
          </p>
          <p className="mt-1 text-[11px] leading-relaxed text-zinc-400">
            {fullSongRepetitions > 1
              ? "Las vueltas se unen con un fundido musical corto; el vídeo termina al acabar la última."
              : "El 16:9 dura lo mismo que el master procesado. No se recorta, no se repite la música dentro del vídeo y no se crea ninguna costura de audio."}
          </p>
          <p className="mt-2 font-mono text-xs text-fuchsia-300">
            {fmt(0)} → {fmt(audioBuffer.duration)} · fuente completa
          </p>
        </div>
      ) : (
        <>
      <div className="flex items-center gap-1.5">
        <button
          type="button"
          onClick={() => setMode("recommend")}
          className={`px-3 py-1.5 rounded-lg font-bold cursor-pointer transition-all ${
            mode === "recommend"
              ? "bg-cyan-500 text-zinc-950 shadow font-black"
              : "bg-zinc-900 text-zinc-400 hover:text-white"
          }`}
        >
          ✨ Recomendar
        </button>
        <button
          type="button"
          onClick={() => setMode("trim")}
          className={`px-3 py-1.5 rounded-lg font-bold cursor-pointer transition-all ${
            mode === "trim"
              ? "bg-cyan-500 text-zinc-950 shadow font-black"
              : "bg-zinc-900 text-zinc-400 hover:text-white"
          }`}
        >
          ✂️ Recortar
        </button>
        <span className="text-[10px] text-zinc-500 ml-1">
          {mode === "recommend"
            ? "Elige un momento sugerido; la duración no cambia"
            : "Arrastra la ventana fija por la canción (imantada al beat)"}
        </span>
      </div>

      {/* Waveform + chips */}
      <SongLoopWaveform
        audioBuffer={audioBuffer}
        candidates={candidates}
        selected={selected}
        onSelect={onSelect}
        trimMode={mode === "trim"}
        autoAudition={false}
        snapSec={mode === "trim" ? snapSec : undefined}
        fixedDurationSec={sourceWindowSeconds}
      />

      {mode === "recommend" && (
        <div className="flex flex-col gap-1.5">
          {candidates.length > 0 ? (
            <div className="flex flex-wrap gap-1.5">
              {candidates.slice(0, 6).map((c, i) => {
                const on =
                  selected &&
                  Math.abs(selected.start - c.start) < 0.05 &&
                  Math.abs(selected.end - c.end) < 0.05;
                return (
                  <button
                    key={`${c.start}-${c.end}-${i}`}
                    type="button"
                    onClick={() => onSelect(c)}
                    className={`px-2.5 py-1 rounded-lg text-[10px] font-bold cursor-pointer ${
                      on ? "bg-cyan-500 text-zinc-950" : "bg-zinc-800 text-zinc-300 hover:bg-zinc-700"
                    }`}
                    title={c.label}
                  >
                    {fmt(c.start)}–{fmt(c.end)}
                    {c.score ? ` · ${Math.round(c.score)}` : ""}
                  </button>
                );
              })}
            </div>
          ) : (
            <p className="text-[10px] text-zinc-500">
              {analyzing
                ? "Analizando la canción para encontrar los mejores recortes…"
                : "Sin sugerencias todavía: usa «Analizar de nuevo» o mueve el fragmento a mano."}
            </p>
          )}
          <p className="text-[10px] text-zinc-500">{sourceHint}</p>
        </div>
      )}

      {/* Resumen del recorte activo */}
      {selected && (
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <p className="text-sm font-bold text-white">
            Fragmento de salida: {targetLabel}
            <span className="ml-2 text-[11px] font-mono font-normal text-zinc-400">
              {fmt(selected.start)} → {fmt(selected.end)}
            </span>
          </p>
          <p className="text-[11px] text-zinc-400">
            Una sola toma · sin repetición interna · bordes protegidos contra clics
          </p>
        </div>
      )}
        </>
      )}
    </div>
  );
}
