"use client";

import type { RawFrame } from "./types";

/** Resultado de un GIF generado, compartido entre pestañas */
export interface GifSessionResult {
  /** URL del blob para previsualizarlo */
  blobUrl: string;
  /** Frames RGBA exactamente como se codificaron */
  frames: RawFrame[];
  fps: number;
  width: number;
  height: number;
  /** Resumen legible para mostrar en UI */
  label: string;
}

/**
 * Almacén en memoria para pasar archivos/ajustes entre pestañas durante
 * la navegación del lado cliente. Se pierde al recargar (intencional).
 */
export const studioStore = {
  /** Video fuente elegido en GIF Studio */
  videoFile: null as File | null,
  /** Audio renderizado o subido para combinar */
  audioFile: null as File | null,
  /** GIF YA generado y editado: Combinar lo usa sin re-procesar */
  gifResult: null as GifSessionResult | null,
};

export function setVideoForSession(f: File | null) {
  studioStore.videoFile = f;
}

export function setAudioForSession(f: File | null) {
  studioStore.audioFile = f;
}

export function setGifResult(r: GifSessionResult | null) {
  if (studioStore.gifResult) URL.revokeObjectURL(studioStore.gifResult.blobUrl);
  studioStore.gifResult = r;
}
