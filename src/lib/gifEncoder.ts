import { GIFEncoder } from "gifenc";
import type { PreparedFrame } from "./gifPipeline";

/**
 * Codifica frames YA preparados (indexados + paleta por frame) a Blob GIF.
 * No re-cuantiza: lo que entra es lo que sale.
 */
export async function encodePrepared(
  prepared: PreparedFrame[],
  opts: { fps: number; width: number; height: number; onProgress?: (r: number) => void }
): Promise<Blob> {
  const delay = Math.round(1000 / opts.fps);
  const gif = GIFEncoder();
  for (let i = 0; i < prepared.length; i++) {
    const f = prepared[i];
    gif.writeFrame(f.index, opts.width, opts.height, { palette: f.palette, delay });
    opts.onProgress?.((i + 1) / prepared.length);
    if (i % 8 === 7) await new Promise((r) => setTimeout(r, 0));
  }
  gif.finish();
  const view = gif.bytesView();
  const bytes = new Uint8Array(view.byteLength);
  bytes.set(view);
  return new Blob([bytes], { type: "image/gif" });
}

/** Descarga genérica de un blob */
export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}
