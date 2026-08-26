import type { RawFrame } from "./types";

/** Convierte un RawFrame a ImageData sin problemas de tipado de buffers */
export function toImageData(frame: RawFrame): ImageData {
  const img = new ImageData(frame.width, frame.height);
  img.data.set(frame.data);
  return img;
}
