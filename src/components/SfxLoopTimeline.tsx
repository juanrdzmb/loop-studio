"use client";

import React, { useState, useRef, useEffect, useCallback } from "react";
import {
  SEINEN_SFX_CATALOG,
  CURATED_SFX_CATALOG,
  CURATED_SFX_CATEGORIES,
  SeinenSfxItem,
  LoopSfxCue,
  playSeinenSfxCue,
  stopActiveSfxPreview,
} from "@/lib/seinenSfxLibrary";
import { decodeAudioDataAsync } from "@/lib/mangaAudioEngine";

interface SfxLoopTimelineProps {
  loopDuration: number;
  currentTime: number;
  /**
   * Live clock from the parent's RAF loop (a ref). When provided, SFX cues are
   * triggered from this clock every animation frame (<16ms precision) instead of
   * the throttled `currentTime` prop (~100ms precision).
   */
  timeRef?: { current: number };
  isPlaying: boolean;
  onTogglePlay?: () => void;
  cues: LoopSfxCue[];
  onCuesChange: (cues: LoopSfxCue[]) => void;
  onSeekRequest?: (time: number) => void;
  audioContext?: AudioContext | null;
  /**
   * Live handle to the parent's shared AudioContext (a ref, filled outside render).
   * Lets several timelines share one context without creating extra AudioContexts.
   */
  audioContextRef?: { current: AudioContext | null };
  hasMedia?: boolean;
  activeFormatFilter?: "all" | "16x9" | "9x16";
  onFormatFilterChange?: (format: "all" | "16x9" | "9x16") => void;
}

export default function SfxLoopTimeline({
  loopDuration,
  currentTime,
  timeRef,
  isPlaying,
  onTogglePlay,
  cues,
  onCuesChange,
  onSeekRequest,
  audioContext,
  audioContextRef,
  hasMedia = true,
  activeFormatFilter = "all",
  onFormatFilterChange,
}: SfxLoopTimelineProps) {
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [selectedCueId, setSelectedCueId] = useState<string | null>(null);
  const [isAddingModalOpen, setIsAddingModalOpen] = useState(false);
  const [addingTime, setAddingTime] = useState<number>(0);
  const [addingFormat, setAddingFormat] = useState<"all" | "16x9" | "9x16">("all");
  const [searchQuery, setSearchQuery] = useState("");
  const timelineRef = useRef<HTMLDivElement | null>(null);

  // Local audio context for preview testing if parent didn't supply one
  const localAudioCtxRef = useRef<AudioContext | null>(null);
  const getAudioContext = useCallback(() => {
    if (audioContext) return audioContext;
    if (audioContextRef?.current) return audioContextRef.current;
    if (!localAudioCtxRef.current) {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      localAudioCtxRef.current = new AudioCtx();
    }
    return localAudioCtxRef.current;
  }, [audioContext, audioContextRef]);

  // Track playback time to trigger sounds in real-time
  const lastTriggeredTimeRef = useRef<number>(-1);

  const triggerCuesBetween = useCallback(
    (prevT: number, curT: number) => {
      if (!hasMedia || !isPlaying || cues.length === 0 || loopDuration <= 0.1) return;

      const delta = curT - prevT;
      const wrapped = delta < 0 && loopDuration - prevT + curT <= 1.5;
      // Ignore scrubbing/seek jumps: only re-anchor, never blast queued cues
      if (delta > 1.5 || (delta < 0 && !wrapped)) return;

      // Filter cues by active preview format (matches the export filter)
      const activeCues = cues.filter(
        (c) => !c.targetFormat || c.targetFormat === "all" || activeFormatFilter === "all" || c.targetFormat === activeFormatFilter
      );

      for (const cue of activeCues) {
        const cueT = cue.time;
        let shouldTrigger = false;

        if (wrapped && (cueT >= prevT || cueT <= curT)) {
          // Solo dispara los cues realmente cruzados al volver de final→inicio.
          // Antes `wrapped` activaba TODOS y creaba una ráfaga al cerrar el preview.
          shouldTrigger = true;
        } else if (prevT < cueT && cueT <= curT) {
          // Normal forward playback
          shouldTrigger = true;
        }

        if (shouldTrigger) {
          const ctx = getAudioContext();
          void playSeinenSfxCue(ctx, cue);
        }
      }
    },
    [hasMedia, isPlaying, cues, loopDuration, activeFormatFilter, getAudioContext]
  );

  // Precise trigger loop: uses the parent's live RAF clock when available
  useEffect(() => {
    if (!timeRef) return;
    let raf = 0;
    const tick = () => {
      const curT = timeRef.current;
      triggerCuesBetween(lastTriggeredTimeRef.current, curT);
      lastTriggeredTimeRef.current = curT;
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [timeRef, triggerCuesBetween]);

  // Fallback: trigger from the throttled currentTime prop (when no live clock is provided)
  useEffect(() => {
    if (timeRef) return;
    if (!hasMedia || !isPlaying || cues.length === 0 || loopDuration <= 0.1) {
      lastTriggeredTimeRef.current = currentTime;
      return;
    }
    triggerCuesBetween(lastTriggeredTimeRef.current, currentTime);
    lastTriggeredTimeRef.current = currentTime;
  }, [currentTime, isPlaying, cues, loopDuration, hasMedia, timeRef, triggerCuesBetween]);

  // Clean up local audio context on unmount
  useEffect(() => {
    return () => {
      stopActiveSfxPreview();
      if (localAudioCtxRef.current && localAudioCtxRef.current.state !== "closed") {
        void localAudioCtxRef.current.close().catch(() => {});
      }
    };
  }, []);

  const safeDuration = Math.max(0.5, loopDuration);
  const effectiveCurrentTime = hasMedia ? currentTime % safeDuration : 0;

  // Handle timeline track click to place or move
  const handleTimelineClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!hasMedia) return;
    if (!timelineRef.current) return;
    const rect = timelineRef.current.getBoundingClientRect();
    const clickX = Math.max(0, Math.min(rect.width, e.clientX - rect.left));
    const ratio = clickX / rect.width;
    const targetT = parseFloat((ratio * safeDuration).toFixed(2));

    setAddingTime(targetT);
    setAddingFormat(activeFormatFilter);
    setIsAddingModalOpen(true);
    if (onSeekRequest) {
      onSeekRequest(targetT);
    }
  };

  const handleAddQuickCue = (item: SeinenSfxItem, customFile?: File, customBuf?: AudioBuffer) => {
    const newCue: LoopSfxCue = {
      id: "cue_" + Math.random().toString(36).substring(2, 9),
      sfxId: item.id,
      time: addingTime,
      volume: 1.0,
      targetFormat: addingFormat,
      name: customFile ? customFile.name : item.name,
      customBuffer: customBuf,
      customFileName: customFile?.name,
    };
    onCuesChange([...cues, newCue].sort((a, b) => a.time - b.time));
    setSelectedCueId(newCue.id);
    setIsAddingModalOpen(false);

    // Play test preview immediately
    const ctx = getAudioContext();
    void playSeinenSfxCue(ctx, newCue);
  };

  const handleCustomFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const arr = await file.arrayBuffer();
      const buf = await decodeAudioDataAsync(arr);
      const customItem: SeinenSfxItem = {
        id: "custom_" + Date.now(),
        name: file.name.replace(/\.[^/.]+$/, ""),
        category: "custom",
        categoryLabel: "Personalizado",
        icon: "📁",
        desc: "Efecto de sonido subido por el usuario",
        defaultGain: 1.0,
      };
      handleAddQuickCue(customItem, file, buf);
    } catch (err) {
      alert("No se pudo decodificar el archivo de audio. Usa formato .wav o .mp3.");
      console.error(err);
    }
  };

  const handleDeleteCue = (cueId: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    onCuesChange(cues.filter((c) => c.id !== cueId));
    if (selectedCueId === cueId) setSelectedCueId(null);
  };

  const handleUpdateCueVolume = (cueId: string, vol: number) => {
    onCuesChange(
      cues.map((c) => (c.id === cueId ? { ...c, volume: parseFloat(vol.toFixed(2)) } : c))
    );
  };

  const handleUpdateCueFormat = (cueId: string, format: "all" | "16x9" | "9x16") => {
    onCuesChange(
      cues.map((c) => (c.id === cueId ? { ...c, targetFormat: format } : c))
    );
  };

  const handleUpdateCueTime = (cueId: string, newTime: number) => {
    const bounded = Math.max(0, Math.min(safeDuration, newTime));
    onCuesChange(
      cues.map((c) => (c.id === cueId ? { ...c, time: parseFloat(bounded.toFixed(2)) } : c)).sort((a, b) => a.time - b.time)
    );
  };

  const handleTestPreviewCue = (cue: LoopSfxCue, e?: React.MouseEvent) => {
    e?.stopPropagation();
    const ctx = getAudioContext();
    void playSeinenSfxCue(ctx, cue, undefined, true);
  };

  const handleTestPreviewItem = (item: SeinenSfxItem, e?: React.MouseEvent) => {
    e?.stopPropagation();
    const ctx = getAudioContext();
    const tempCue: LoopSfxCue = { id: "test", sfxId: item.id, time: 0, volume: 1.0 };
    void playSeinenSfxCue(ctx, tempCue, undefined, true);
  };

  const filteredCatalog = CURATED_SFX_CATALOG.filter((item) => {
    const matchesCat = selectedCategory === "all" || item.category === selectedCategory;
    const matchesQuery =
      searchQuery.trim() === "" ||
      item.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.desc.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesCat && matchesQuery;
  });

  const selectedCue = cues.find((c) => c.id === selectedCueId);

  // Filter cues according to active format filter tab
  const displayedCues = cues.filter((c) => {
    if (activeFormatFilter === "all") return true;
    return !c.targetFormat || c.targetFormat === "all" || c.targetFormat === activeFormatFilter;
  });

  return (
    <div data-testid={`sfx-timeline-${activeFormatFilter}`} className="flex flex-col gap-3 p-4 rounded-2xl bg-zinc-950/90 border border-zinc-800 shadow-xl text-zinc-100">
      {/* Header with Title, Play Button, Format Selector and Add Button */}
      <div className="flex items-center justify-between flex-wrap gap-2.5">
        <div className="flex items-center gap-2.5">
          {/* Play/Pause Button */}
          {onTogglePlay && (
            <button
              type="button"
              onClick={onTogglePlay}
              disabled={!hasMedia}
              className={`w-8 h-8 rounded-xl flex items-center justify-center text-sm shadow transition-all ${
                !hasMedia
                  ? "bg-zinc-800 text-zinc-600 cursor-not-allowed"
                  : isPlaying
                  ? "bg-amber-500 text-zinc-950 hover:bg-amber-400 font-bold"
                  : "bg-zinc-800 hover:bg-zinc-700 text-white"
              }`}
              title={isPlaying ? "Pausar previsualización" : "Reproducir previsualización"}
            >
              {isPlaying && hasMedia ? "⏸️" : "▶️"}
            </button>
          )}

          <div>
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              SFX sincronizados
            </h3>
            <p className="text-[11px] text-zinc-400">
              {hasMedia
                ? "Coloca un SFX en un segundo exacto del video exportado (no se repite solo)."
                : "⏸️ Esperando video — Sube un clip para activar la línea de tiempo."}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {/* Target Video Filter Tab Switcher */}
          {onFormatFilterChange && (
            <div className="flex items-center p-1 rounded-xl bg-zinc-900 border border-zinc-800 text-[11px]">
              <button
                type="button"
                onClick={() => onFormatFilterChange("all")}
                className={`px-2.5 py-1 rounded-lg font-semibold transition-all ${
                  activeFormatFilter === "all"
                    ? "bg-zinc-700 text-white shadow"
                    : "text-zinc-400 hover:text-white"
                }`}
              >
                ⚡ Ambos
              </button>
              <button
                type="button"
                onClick={() => onFormatFilterChange("16x9")}
                className={`px-2.5 py-1 rounded-lg font-semibold transition-all ${
                  activeFormatFilter === "16x9"
                    ? "bg-fuchsia-600 text-white shadow"
                    : "text-zinc-400 hover:text-white"
                }`}
              >
                🖥️ 16:9
              </button>
              <button
                type="button"
                onClick={() => onFormatFilterChange("9x16")}
                className={`px-2.5 py-1 rounded-lg font-semibold transition-all ${
                  activeFormatFilter === "9x16"
                    ? "bg-amber-600 text-white shadow"
                    : "text-zinc-400 hover:text-white"
                }`}
              >
                📱 9:16
              </button>
            </div>
          )}

          {/* Quick Add Button */}
          <button
            type="button"
            disabled={!hasMedia}
            onClick={() => {
              if (!hasMedia) return;
              setAddingTime(parseFloat(effectiveCurrentTime.toFixed(2)));
              setAddingFormat(activeFormatFilter);
              setIsAddingModalOpen(true);
            }}
            className={`px-3 py-1.5 rounded-xl font-bold text-xs flex items-center gap-1.5 shadow-lg transition-all ${
              !hasMedia
                ? "bg-zinc-800 text-zinc-500 cursor-not-allowed border border-zinc-700"
                : "bg-gradient-to-r from-amber-500 to-red-600 hover:from-amber-400 hover:to-red-500 text-zinc-950 shadow-amber-950/40 hover:scale-105 active:scale-95 cursor-pointer"
            }`}
          >
            <span>➕</span>
              <span>Añadir SFX en {effectiveCurrentTime.toFixed(1)}s</span>
          </button>
        </div>
      </div>

      {/* Interactive Timeline Track */}
      <div className="relative flex flex-col gap-1 select-none">
        {/* Time ruler indicators */}
        <div className="flex justify-between text-[10px] font-mono text-zinc-500 px-1">
          <span>0.0s</span>
          <span>{(safeDuration * 0.25).toFixed(1)}s</span>
          <span>{(safeDuration * 0.5).toFixed(1)}s</span>
          <span>{(safeDuration * 0.75).toFixed(1)}s</span>
          <span>{safeDuration.toFixed(1)}s (export)</span>
        </div>

        {/* Main Track Bar */}
        <div
          ref={timelineRef}
          data-testid={`sfx-track-${activeFormatFilter}`}
          onClick={handleTimelineClick}
          className={`relative h-14 w-full rounded-xl border border-zinc-700/80 overflow-hidden shadow-inner ${
            hasMedia ? "bg-zinc-900/90 cursor-crosshair" : "bg-zinc-950/60 opacity-60 cursor-not-allowed"
          }`}
        >
          {/* Subtle Grid ticks */}
          <div className="absolute inset-0 grid grid-cols-8 pointer-events-none opacity-20">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="border-r border-zinc-500 h-full" />
            ))}
          </div>

          {/* Loop Progress Highlight */}
          {hasMedia && isPlaying && (
            <div
              className="absolute top-0 bottom-0 left-0 bg-gradient-to-r from-red-600/20 via-amber-500/20 to-transparent pointer-events-none transition-all duration-75"
              style={{ width: `${(effectiveCurrentTime / safeDuration) * 100}%` }}
            />
          )}

          {/* Glowing Playhead Line */}
          {hasMedia && (
            <div
              className="absolute top-0 bottom-0 w-0.5 bg-cyan-400 shadow-[0_0_12px_#00f0ff] z-20 pointer-events-none"
              style={{ left: `${(effectiveCurrentTime / safeDuration) * 100}%` }}
            >
              <div className="w-2.5 h-2.5 -ml-1 -top-1 absolute bg-cyan-300 rounded-full shadow" />
            </div>
          )}

          {/* Render All SFX Markers on Timeline */}
          {hasMedia &&
            displayedCues.map((cue) => {
              const leftPct = (cue.time / safeDuration) * 100;
              const sfxDef = SEINEN_SFX_CATALOG.find((s) => s.id === cue.sfxId);
              const icon = sfxDef?.icon || "🔊";
              const isSelected = cue.id === selectedCueId;
              const formatTag = cue.targetFormat === "16x9" ? "16:9" : cue.targetFormat === "9x16" ? "9:16" : "ALL";

              return (
                <div
                  key={cue.id}
                  onClick={(e) => {
                    e.stopPropagation();
                    setSelectedCueId(cue.id);
                    if (onSeekRequest) onSeekRequest(cue.time);
                  }}
                  className={`absolute top-1 bottom-1 -ml-4 w-9 rounded-lg flex flex-col items-center justify-center cursor-pointer transition-all z-10 ${
                    isSelected
                      ? "bg-amber-400 text-zinc-950 ring-2 ring-white scale-110 shadow-lg shadow-amber-500/50"
                      : "bg-zinc-800/95 hover:bg-zinc-700 text-white border border-white/20 hover:scale-105"
                  }`}
                  style={{ left: `${leftPct}%` }}
                  title={`${cue.name || sfxDef?.name || "SFX"} (${cue.time}s - Formato: ${formatTag})`}
                >
                  <span className="text-xs leading-none">{icon}</span>
                  <span className="text-[8px] font-mono font-extrabold uppercase leading-tight mt-0.5 px-1 rounded bg-black/40">
                    {formatTag}
                  </span>
                </div>
              );
            })}

          {!hasMedia && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none text-zinc-500 text-xs">
              Sube un video 16:9 o 9:16 arriba para activar la línea de tiempo
            </div>
          )}

          {hasMedia && displayedCues.length === 0 && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none text-zinc-500 text-xs">
              Haz clic en cualquier segundo para colocar un efecto de sonido
            </div>
          )}
        </div>
      </div>

      {/* Selected Marker Editor Bar */}
      {selectedCue && (
        <div className="flex items-center justify-between flex-wrap gap-3 p-3 rounded-xl bg-zinc-900 border border-amber-500/30 text-xs animate-in fade-in">
          <div className="flex items-center gap-2">
            <span className="text-base">
              {SEINEN_SFX_CATALOG.find((s) => s.id === selectedCue.sfxId)?.icon || "🔊"}
            </span>
            <div className="flex flex-col">
              <span className="font-bold text-amber-400">
                {selectedCue.name || SEINEN_SFX_CATALOG.find((s) => s.id === selectedCue.sfxId)?.name || "SFX"}
              </span>
              <span className="text-[10px] text-zinc-400">
                Momento: <span className="font-mono text-white">{selectedCue.time.toFixed(2)}s</span>
              </span>
            </div>
          </div>

          <div className="flex items-center gap-3 flex-wrap">
            {/* Solo se elige formato en una timeline compartida. Dual Studio usa una por formato. */}
            {onFormatFilterChange ? <div className="flex items-center gap-1">
              <span className="text-[11px] text-zinc-400">Aplica a:</span>
              <select
                value={selectedCue.targetFormat || "all"}
                onChange={(e) => handleUpdateCueFormat(selectedCue.id, e.target.value as "all" | "16x9" | "9x16")}
                className="px-2 py-1 rounded bg-zinc-950 border border-zinc-700 text-white text-[11px]"
              >
                <option value="all">⚡ Ambos Videos</option>
                <option value="16x9">🖥️ Solo 16:9</option>
                <option value="9x16">📱 Solo 9:16</option>
              </select>
            </div> : (
              <span className="rounded-lg bg-zinc-950 px-2 py-1 text-[10px] font-bold text-zinc-400">
                {activeFormatFilter === "16x9" ? "Solo 16:9" : "Solo 9:16"}
              </span>
            )}

            <div className="flex items-center gap-1.5">
              <span className="text-[11px] text-zinc-400">Tiempo:</span>
              <input
                type="range"
                min="0"
                max={safeDuration}
                step="0.05"
                value={selectedCue.time}
                onChange={(e) => handleUpdateCueTime(selectedCue.id, parseFloat(e.target.value))}
                className="w-20 accent-amber-400 cursor-pointer"
              />
              <input
                type="number"
                min={0}
                max={safeDuration}
                step={0.1}
                value={Number(selectedCue.time.toFixed(2))}
                onChange={(e) => handleUpdateCueTime(selectedCue.id, parseFloat(e.target.value) || 0)}
                className="w-16 px-1 py-0.5 rounded bg-zinc-950 border border-zinc-700 font-mono text-[11px] text-white"
              />
              <span className="font-mono text-[11px] text-zinc-500">s</span>
            </div>
            <label className="flex items-center gap-1.5 text-[11px] text-zinc-300 cursor-pointer">
              <input
                type="checkbox"
                checked={Boolean(selectedCue.repeatEachCycle)}
                onChange={(e) =>
                  onCuesChange(
                    cues.map((c) =>
                      c.id === selectedCue.id ? { ...c, repeatEachCycle: e.target.checked } : c
                    )
                  )
                }
                className="accent-amber-400"
              />
              Repetir cada ciclo del clip
            </label>

            {/* Volume Gain Slider */}
            <div className="flex items-center gap-1.5">
              <span className="text-[11px] text-zinc-400">Vol:</span>
              <input
                type="range"
                min="0"
                max="2"
                step="0.05"
                value={selectedCue.volume}
                onChange={(e) => handleUpdateCueVolume(selectedCue.id, parseFloat(e.target.value))}
                className="w-16 accent-amber-400 cursor-pointer"
              />
              <span className="font-mono text-[11px] w-7">
                {Math.round(selectedCue.volume * 100)}%
              </span>
            </div>

            {/* Test Preview Button */}
            <button
              type="button"
              onClick={(e) => handleTestPreviewCue(selectedCue, e)}
              className="px-2.5 py-1 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-white font-medium flex items-center gap-1 transition-all"
            >
              <span>🔊</span>
              <span>Probar</span>
            </button>

            {/* Delete Button */}
            <button
              type="button"
              onClick={(e) => handleDeleteCue(selectedCue.id, e)}
              className="px-2 py-1 rounded-lg bg-red-950/60 hover:bg-red-900 border border-red-800/60 text-red-300 hover:text-white transition-all"
              title="Eliminar este efecto"
            >
              🗑️
            </button>
          </div>
        </div>
      )}

      {/* List of active cues */}
      {displayedCues.length > 0 && (
        <div className="flex items-center gap-1.5 overflow-x-auto py-1 no-scrollbar text-xs">
          <span className="text-[11px] text-zinc-400 shrink-0 mr-1">Efectos:</span>
          {displayedCues.map((c) => {
            const def = SEINEN_SFX_CATALOG.find((s) => s.id === c.sfxId);
            const isSel = c.id === selectedCueId;
            const formatBadge = c.targetFormat === "16x9" ? "16:9" : c.targetFormat === "9x16" ? "9:16" : "DUAL";

            return (
              <div
                key={c.id}
                data-testid="sfx-active-cue"
                onClick={() => {
                  setSelectedCueId(c.id);
                  if (onSeekRequest) onSeekRequest(c.time);
                }}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg shrink-0 cursor-pointer border transition-all ${
                  isSel
                    ? "bg-amber-500/20 border-amber-500 text-amber-200"
                    : "bg-zinc-900 border-zinc-800 text-zinc-300 hover:border-zinc-700"
                }`}
              >
                <span>{def?.icon || "🔊"}</span>
                <span className="font-medium truncate max-w-[100px]">{c.name || def?.name}</span>
                <span className="font-mono text-[9px] px-1 py-0.2 rounded bg-zinc-800 text-amber-300">
                  {formatBadge}
                </span>
                <span className="font-mono text-[10px] text-zinc-400">@{c.time.toFixed(1)}s</span>
                <button
                  type="button"
                  onClick={(e) => handleTestPreviewCue(c, e)}
                  className="hover:scale-110 active:scale-95 text-zinc-400 hover:text-white"
                  title="Escuchar"
                >
                  ▶️
                </button>
                <button
                  type="button"
                  onClick={(e) => handleDeleteCue(c.id, e)}
                  className="hover:scale-110 active:scale-95 text-zinc-500 hover:text-red-400 ml-0.5"
                  title="Eliminar"
                >
                  ×
                </button>
              </div>
            );
          })}
        </div>
      )}

      {/* Adding Modal / Sound Selector Drawer */}
      {isAddingModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in">
          <div className="bg-zinc-900 border border-zinc-700 rounded-2xl w-full max-w-2xl max-h-[85vh] flex flex-col shadow-2xl overflow-hidden">
            {/* Modal Header */}
            <div className="flex items-center justify-between p-4 border-b border-zinc-800 bg-zinc-950">
              <div className="flex items-center gap-2">
                <span className="text-xl">🗡️</span>
                <div>
                  <h4 className="font-bold text-white text-sm">
                    Elige un efecto de sonido
                  </h4>
                  <p className="text-[11px] text-zinc-400">
                    Se insertará en el segundo <span className="font-mono text-amber-400 font-bold">{addingTime.toFixed(2)}s</span> del video exportado.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  stopActiveSfxPreview();
                  setIsAddingModalOpen(false);
                }}
                className="w-8 h-8 rounded-full bg-zinc-800 hover:bg-zinc-700 text-zinc-300 flex items-center justify-center cursor-pointer"
              >
                ✕
              </button>
            </div>

            {/* Video Target Format Selector inside Modal */}
            {onFormatFilterChange && <div className="p-3 border-b border-zinc-800 bg-zinc-950/80 flex items-center justify-between flex-wrap gap-2 text-xs">
              <span className="text-zinc-300 font-semibold">🎯 ¿A qué video aplicarás este sonido?</span>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setAddingFormat("all")}
                  className={`px-2.5 py-1 rounded-lg font-bold text-xs transition-all ${
                    addingFormat === "all"
                      ? "bg-zinc-700 text-white ring-1 ring-white/30"
                      : "bg-zinc-900 text-zinc-400 hover:text-white"
                  }`}
                >
                  ⚡ Ambos Videos
                </button>
                <button
                  type="button"
                  onClick={() => setAddingFormat("16x9")}
                  className={`px-2.5 py-1 rounded-lg font-bold text-xs transition-all ${
                    addingFormat === "16x9"
                      ? "bg-fuchsia-600 text-white ring-1 ring-fuchsia-400"
                      : "bg-zinc-900 text-zinc-400 hover:text-white"
                  }`}
                >
                  🖥️ Solo 16:9
                </button>
                <button
                  type="button"
                  onClick={() => setAddingFormat("9x16")}
                  className={`px-2.5 py-1 rounded-lg font-bold text-xs transition-all ${
                    addingFormat === "9x16"
                      ? "bg-amber-600 text-white ring-1 ring-amber-400"
                      : "bg-zinc-900 text-zinc-400 hover:text-white"
                  }`}
                >
                  📱 Solo 9:16
                </button>
              </div>
            </div>}

            {/* Category Tabs and Search */}
            <div className="p-3 border-b border-zinc-800 bg-zinc-950/60 flex flex-col gap-2">
              <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar">
                {CURATED_SFX_CATEGORIES.map((cat) => (
                  <button
                    key={cat.id}
                    type="button"
                    onClick={() => setSelectedCategory(cat.id)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-semibold shrink-0 transition-all ${
                      selectedCategory === cat.id
                        ? "bg-amber-500 text-zinc-950 shadow-md"
                        : "bg-zinc-800 text-zinc-300 hover:bg-zinc-700"
                    }`}
                  >
                    {cat.label}
                  </button>
                ))}
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="text"
                  placeholder="Buscar: katana, espada, lluvia, impacto…"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full px-3 py-1.5 rounded-xl bg-zinc-800/90 border border-zinc-700 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-amber-400"
                />

                {/* Custom SFX File Upload Button */}
                <label className="shrink-0 px-3 py-1.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-xs font-medium cursor-pointer text-zinc-200 flex items-center gap-1.5">
                  <span>📁</span>
                  <span>Subir SFX</span>
                  <input
                    type="file"
                    accept="audio/*"
                    onChange={handleCustomFileUpload}
                    className="hidden"
                  />
                </label>
              </div>
            </div>

            {/* Catalog Grid */}
            <div className="p-4 overflow-y-auto max-h-[50vh] grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {filteredCatalog.map((item) => (
                <div
                  key={item.id}
                  className="p-3 rounded-xl bg-zinc-950 border border-zinc-800 hover:border-amber-500/50 hover:bg-zinc-900/80 transition-all flex flex-col justify-between gap-2 group"
                >
                  <div className="flex items-start gap-2.5">
                    <span className="text-2xl shrink-0 p-1.5 rounded-lg bg-zinc-900 border border-zinc-800">
                      {item.icon}
                    </span>
                    <div className="flex flex-col">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="font-bold text-xs text-white group-hover:text-amber-300 transition-colors">
                          {item.name}
                        </span>
                        <span className="text-[9px] font-bold px-1.5 py-0.2 rounded bg-zinc-800 text-zinc-400">
                          {item.categoryLabel}
                        </span>
                      </div>
                      <p className="text-[11px] text-zinc-400 line-clamp-2 mt-0.5">
                        {item.desc}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center justify-between pt-1 border-t border-zinc-800/80">
                    <button
                      type="button"
                      onClick={(e) => handleTestPreviewItem(item, e)}
                      className="px-2.5 py-1 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-[11px] font-medium flex items-center gap-1 transition-all"
                    >
                      <span>🔊</span>
                      <span>Escuchar</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => handleAddQuickCue(item)}
                      className="px-3 py-1 rounded-lg bg-amber-500 hover:bg-amber-400 text-zinc-950 text-[11px] font-bold shadow transition-all"
                    >
                      Añadir en {addingTime.toFixed(1)}s
                    </button>
                  </div>
                </div>
              ))}

              {filteredCatalog.length === 0 && (
                <div className="col-span-2 py-8 text-center text-zinc-500 text-xs">
                  No se encontraron efectos con ese criterio de búsqueda.
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
