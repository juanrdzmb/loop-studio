"use client";

import { useRef } from "react";
import type { AudioPlaylistTrack, PlaylistTimelineItem, PlaylistTrackEffect } from "@/lib/audioPlaylist";

const EFFECTS: Array<{ id: PlaylistTrackEffect; label: string; hint: string }> = [
  { id: "original", label: "Original", hint: "Sin procesar" },
  { id: "suave", label: "Suave", hint: "0.92×" },
  { id: "clasico", label: "Clásico", hint: "0.87×" },
  { id: "profundo", label: "Profundo", hint: "0.82×" },
];

function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60).toString().padStart(2, "0");
  return `${mins}:${secs}`;
}

export default function AudioPlaylistPanel({
  tracks,
  timeline,
  processing,
  progressLabel,
  onAdd,
  onEffectChange,
  onMove,
  onRemove,
}: {
  tracks: AudioPlaylistTrack[];
  timeline: PlaylistTimelineItem[];
  processing: boolean;
  progressLabel: string;
  onAdd: (files: File[]) => void;
  onEffectChange: (id: string, effect: PlaylistTrackEffect) => void;
  onMove: (id: string, direction: -1 | 1) => void;
  onRemove: (id: string) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const timelineById = new Map(timeline.map((item) => [item.id, item]));

  return (
    <section aria-label="Playlist de canciones" className="rounded-2xl border border-cyan-900/50 bg-zinc-900/80 p-4 shadow-lg">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-black text-white">🎵 Playlist del edit</h2>
          <p className="mt-0.5 text-[11px] text-zinc-400">
            El vídeo se repite mientras las canciones avanzan en este orden. Cada una conserva su propio efecto.
          </p>
        </div>
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={processing}
          className="rounded-xl bg-cyan-400 px-3 py-2 text-xs font-black text-zinc-950 transition hover:bg-cyan-300 disabled:cursor-wait disabled:opacity-50"
        >
          + Añadir canciones
        </button>
        <input
          ref={inputRef}
          aria-label="Añadir canciones a la playlist"
          type="file"
          accept="audio/*"
          multiple
          className="hidden"
          onChange={(event) => {
            const files = Array.from(event.target.files ?? []);
            event.target.value = "";
            if (files.length) onAdd(files);
          }}
        />
      </div>

      {processing && (
        <div role="status" className="mt-3 rounded-xl border border-cyan-800/50 bg-cyan-950/30 px-3 py-2 text-[11px] text-cyan-200">
          <span className="mr-2 inline-block animate-pulse">●</span>{progressLabel || "Preparando playlist…"}
        </div>
      )}

      <div className="mt-3 space-y-2">
        {tracks.map((track, index) => {
          const timing = timelineById.get(track.id);
          return (
            <article key={track.id} className="grid gap-2 rounded-xl border border-zinc-800 bg-zinc-950/70 p-3 sm:grid-cols-[minmax(0,1fr)_auto_auto] sm:items-center">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-cyan-950 font-mono text-[10px] font-bold text-cyan-300">{index + 1}</span>
                  <div className="min-w-0">
                    <p className="truncate text-xs font-bold text-zinc-100" title={track.name}>{track.name}</p>
                    <p className="text-[10px] text-zinc-500">
                      {timing ? `${formatTime(timing.start)}–${formatTime(timing.end)} · ${formatTime(timing.duration)}` : formatTime(track.buffer.duration)}
                    </p>
                  </div>
                </div>
              </div>
              <label className="flex items-center gap-2 text-[10px] text-zinc-500">
                Efecto
                <select
                  aria-label={`Efecto de ${track.name}`}
                  value={track.effect}
                  disabled={processing}
                  onChange={(event) => onEffectChange(track.id, event.target.value as PlaylistTrackEffect)}
                  className="rounded-lg border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-xs font-semibold text-zinc-100 outline-none focus:border-cyan-500"
                >
                  {EFFECTS.map((effect) => <option key={effect.id} value={effect.id}>{effect.label} · {effect.hint}</option>)}
                </select>
              </label>
              <div className="flex items-center justify-end gap-1">
                <button type="button" aria-label={`Subir ${track.name}`} title="Mover antes" disabled={index === 0 || processing} onClick={() => onMove(track.id, -1)} className="rounded-lg border border-zinc-800 px-2 py-1 text-zinc-400 hover:text-white disabled:opacity-25">↑</button>
                <button type="button" aria-label={`Bajar ${track.name}`} title="Mover después" disabled={index === tracks.length - 1 || processing} onClick={() => onMove(track.id, 1)} className="rounded-lg border border-zinc-800 px-2 py-1 text-zinc-400 hover:text-white disabled:opacity-25">↓</button>
                <button type="button" aria-label={`Eliminar ${track.name}`} title="Eliminar" disabled={processing} onClick={() => onRemove(track.id)} className="rounded-lg border border-red-950 px-2 py-1 text-red-400 hover:border-red-800 hover:text-red-200 disabled:opacity-25">✕</button>
              </div>
            </article>
          );
        })}
      </div>
      {tracks.length > 1 && !processing && (
        <p className="mt-3 text-[10px] text-zinc-500">
          Transiciones de potencia constante de hasta 0,75 s · duración final {formatTime(timeline.at(-1)?.end ?? 0)}.
        </p>
      )}
    </section>
  );
}
