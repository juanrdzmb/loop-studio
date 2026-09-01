/**
 * Editorial wordmark for Silent Vigil — tracked small-caps, bottom-safe, never a giant center stamp.
 */

let fontLoad: Promise<void> | null = null;

export const WATERMARK_MARK = "SILENT VIGIL";
export const WATERMARK_SUB = "MUSIC";

export type WatermarkPosition = "bottom-center" | "bottom-left" | "bottom-right" | "top-center";

export type WatermarkStyleOptions = {
  position?: WatermarkPosition;
  /** Escala relativa al wordmark vigente. */
  scale?: number;
  /** Multiplicador del tracking vigente. */
  tracking?: number;
  color?: string;
  ruleScale?: number;
  /** Desplazamientos normalizados respecto al ancho/alto. */
  offsetX?: number;
  offsetY?: number;
};

export function ensureWatermarkFont(): Promise<void> {
  if (typeof document === "undefined") return Promise.resolve();
  if (fontLoad) return fontLoad;
  fontLoad = (async () => {
    try {
      const light = new FontFace("SilentVigil", "url(/fonts/Montserrat-Light.otf)", {
        weight: "300",
        style: "normal",
        display: "swap",
      });
      const medium = new FontFace("SilentVigil", "url(/fonts/Montserrat-Medium.otf)", {
        weight: "500",
        style: "normal",
        display: "swap",
      });
      const black = new FontFace("SilentVigil", "url(/fonts/Montserrat-Black.otf)", {
        weight: "900",
        style: "normal",
        display: "swap",
      });
      const blackItalic = new FontFace("SilentVigil", "url(/fonts/Montserrat-BlackItalic.otf)", {
        weight: "900",
        style: "italic",
        display: "swap",
      });
      const loaded = await Promise.all([light.load(), medium.load(), black.load(), blackItalic.load()]);
      for (const face of loaded) document.fonts.add(face);
    } catch (err) {
      console.warn("Watermark font failed to load, using system fallback:", err);
    }
  })();
  return fontLoad;
}

function drawTracked(
  ctx: CanvasRenderingContext2D,
  text: string,
  centerX: number,
  y: number,
  tracking: number
) {
  const chars = Array.from(text);
  if (chars.length === 0) return;
  const widths = chars.map((c) => ctx.measureText(c).width);
  const total = widths.reduce((a, b) => a + b, 0) + tracking * Math.max(0, chars.length - 1);
  let x = centerX - total / 2;
  const prevAlign = ctx.textAlign;
  ctx.textAlign = "left";
  for (let i = 0; i < chars.length; i++) {
    ctx.fillText(chars[i], x, y);
    x += widths[i] + tracking;
  }
  ctx.textAlign = prevAlign;
}

export function drawProfessionalWatermark(
  ctx: CanvasRenderingContext2D,
  opts: {
    text?: string;
    width: number;
    height: number;
    opacity?: number;
    shorts?: boolean;
    style?: WatermarkStyleOptions;
  }
) {
  const raw = (opts.text || WATERMARK_MARK).trim();
  if (!raw) return;
  const opacity = Math.max(0, Math.min(1, opts.opacity ?? 0.28));
  if (opacity <= 0) return;

  const shorts = opts.shorts ?? opts.height > opts.width;
  const minSide = Math.min(opts.width, opts.height);
  const style = opts.style ?? {};
  const scaleFactor = Math.max(0.6, Math.min(1.8, style.scale ?? 1));
  const trackingFactor = Math.max(0.5, Math.min(1.8, style.tracking ?? 1));
  const ruleScale = Math.max(0.5, Math.min(1.8, style.ruleScale ?? 1));
  const mark = raw.toUpperCase();
  const isBrand = mark === WATERMARK_MARK || mark === "SILENT VM" || mark === "SILENT VIGIL MUSIC";
  const line = isBrand ? WATERMARK_MARK : mark;
  const showSub = isBrand;

  const baseFontSize = Math.max(13, Math.round(minSide * (shorts ? 0.018 : 0.022)));
  const fontSize = Math.max(9, Math.round(baseFontSize * scaleFactor));
  const tracking = fontSize * 0.28 * trackingFactor;
  const subSize = Math.max(8, Math.round(fontSize * 0.42));
  const position = style.position ?? "bottom-center";
  const offsetX = Math.max(-0.2, Math.min(0.2, style.offsetX ?? 0)) * opts.width;
  const offsetY = Math.max(-0.2, Math.min(0.2, style.offsetY ?? 0)) * opts.height;

  const color = /^#[0-9a-f]{6}$/i.test(style.color ?? "") ? style.color! : "#ffffff";
  const red = Number.parseInt(color.slice(1, 3), 16);
  const green = Number.parseInt(color.slice(3, 5), 16);
  const blue = Number.parseInt(color.slice(5, 7), 16);

  ctx.save();
  ctx.textBaseline = "middle";
  ctx.font = `300 ${fontSize}px "SilentVigil", Montserrat, "Segoe UI", sans-serif`;

  const widths = Array.from(line).map((c) => ctx.measureText(c).width);
  const markW =
    widths.reduce((a, b) => a + b, 0) + tracking * Math.max(0, line.length - 1);
  const ruleW = Math.min(opts.width * 0.36, Math.max(markW * 0.55, fontSize * 6) * ruleScale);
  const sideMargin = Math.max(fontSize * 1.8, minSide * 0.035);
  const cx = (
    position === "bottom-left"
      ? sideMargin + markW / 2
      : position === "bottom-right"
        ? opts.width - sideMargin - markW / 2
        : opts.width / 2
  ) + offsetX;
  const defaultBottom = shorts
    ? opts.height * 0.875
    : opts.height - Math.max(36, opts.height * 0.055);
  const baseline = (position === "top-center" ? Math.max(fontSize * 2.3, opts.height * 0.08) : defaultBottom) + offsetY;

  ctx.strokeStyle = `rgba(${red},${green},${blue},${opacity * 0.55})`;
  ctx.lineWidth = Math.max(1, fontSize * 0.045);
  ctx.beginPath();
  ctx.moveTo(cx - ruleW / 2, baseline - fontSize * 0.95);
  ctx.lineTo(cx + ruleW / 2, baseline - fontSize * 0.95);
  ctx.stroke();

  ctx.shadowColor = "rgba(0,0,0,0.72)";
  ctx.shadowBlur = Math.round(fontSize * 0.35);
  ctx.shadowOffsetY = 1;
  ctx.fillStyle = `rgba(${red},${green},${blue},${opacity})`;
  drawTracked(ctx, line, cx, baseline, tracking);

  if (showSub) {
    ctx.shadowBlur = Math.round(subSize * 0.3);
    ctx.font = `500 ${subSize}px "SilentVigil", Montserrat, "Segoe UI", sans-serif`;
    ctx.fillStyle = `rgba(${red},${green},${blue},${opacity * 0.78})`;
    drawTracked(ctx, WATERMARK_SUB, cx, baseline + fontSize * 0.72, subSize * 0.55);
  }

  ctx.restore();
}

/** Firma fija para portadas: conserva el lenguaje del watermark sin invadir el frame. */
export function drawThumbnailChannelMark(
  ctx: CanvasRenderingContext2D,
  opts: { width: number; height: number; text?: string }
) {
  const line = (opts.text || WATERMARK_MARK).trim().toUpperCase() || WATERMARK_MARK;
  const minSide = Math.min(opts.width, opts.height);
  const fontSize = Math.max(12, Math.round(minSide * 0.018));
  const tracking = fontSize * 0.24;
  const subSize = Math.max(7, Math.round(fontSize * 0.42));
  const margin = Math.max(24, Math.round(minSide * 0.035));

  ctx.save();
  ctx.textBaseline = "middle";
  ctx.font = `300 ${fontSize}px "SilentVigil", Montserrat, "Segoe UI", sans-serif`;
  const widths = Array.from(line).map((char) => ctx.measureText(char).width);
  const markWidth = widths.reduce((sum, width) => sum + width, 0) + tracking * Math.max(0, line.length - 1);
  const centerX = opts.width - margin - markWidth / 2;
  const baseline = opts.height - margin;

  ctx.strokeStyle = "rgba(255,255,255,0.42)";
  ctx.lineWidth = Math.max(1, fontSize * 0.04);
  ctx.beginPath();
  ctx.moveTo(opts.width - margin - markWidth, baseline - fontSize * 0.95);
  ctx.lineTo(opts.width - margin, baseline - fontSize * 0.95);
  ctx.stroke();

  ctx.shadowColor = "rgba(0,0,0,0.78)";
  ctx.shadowBlur = Math.max(2, fontSize * 0.3);
  ctx.shadowOffsetY = 1;
  ctx.fillStyle = "rgba(255,255,255,0.78)";
  drawTracked(ctx, line, centerX, baseline, tracking);
  ctx.font = `500 ${subSize}px "SilentVigil", Montserrat, "Segoe UI", sans-serif`;
  ctx.fillStyle = "rgba(255,255,255,0.58)";
  drawTracked(ctx, WATERMARK_SUB, centerX, baseline + fontSize * 0.68, subSize * 0.5);
  ctx.restore();
}
