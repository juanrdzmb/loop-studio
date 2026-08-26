export interface TrimRange {
  start: number;
  end: number;
}

export type LoopMode = "normal" | "boomerang" | "crossfade" | "auto";

export type DitherMode = "none" | "bayer";

export type StylePresetId =
  | "none"
  | "retro8bit"
  | "anime"
  | "gameboy"
  | "nes"
  | "mono"
  | "custom";

export interface StyleSettings {
  preset: StylePresetId;
  /** Tamaño del píxel en px del lienzo final (1 = sin pixelar) */
  pixelSize: number;
  /** Número de colores de la paleta generada (para custom) */
  colorCount: number;
  /** Paleta fija opcional (presets con paleta cerrada) */
  fixedPalette: number[][] | null;
  dither: DitherMode;
}

export interface GifSettings {
  fps: number;
  width: number;
  loopMode: LoopMode;
  /** % del clip usado para fundido final→inicio en modo crossfade */
  fadePercent: number;
}

export interface ExtractOptions {
  start: number;
  end: number;
  fps: number;
  width: number;
}

/** Frame como RGBA plano */
export interface RawFrame {
  data: Uint8ClampedArray;
  width: number;
  height: number;
}
