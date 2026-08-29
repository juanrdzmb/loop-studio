/**
 * Editorial wordmark for Silent Vigil — tracked small-caps, bottom-safe, never a giant center stamp.
 */

let fontLoad: Promise<void> | null = null;

export const WATERMARK_MARK = "SILENT VIGIL";
export const WATERMARK_SUB = "MUSIC";

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
      const loaded = await Promise.all([light.load(), medium.load()]);
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
  }
) {
  const raw = (opts.text || WATERMARK_MARK).trim();
  if (!raw) return;
  const opacity = Math.max(0, Math.min(1, opts.opacity ?? 0.28));
  if (opacity <= 0) return;

  const shorts = opts.shorts ?? opts.height > opts.width;
  const minSide = Math.min(opts.width, opts.height);
  const mark = raw.toUpperCase();
  const isBrand = mark === WATERMARK_MARK || mark === "SILENT VM" || mark === "SILENT VIGIL MUSIC";
  const line = isBrand ? WATERMARK_MARK : mark;
  const showSub = isBrand;

  const fontSize = Math.max(13, Math.round(minSide * (shorts ? 0.018 : 0.022)));
  const tracking = fontSize * 0.28;
  const subSize = Math.max(8, Math.round(fontSize * 0.42));
  const cx = opts.width / 2;
  const baseline = shorts ? opts.height * 0.875 : opts.height - Math.max(36, opts.height * 0.055);

  ctx.save();
  ctx.textBaseline = "middle";
  ctx.font = `300 ${fontSize}px "SilentVigil", Montserrat, "Segoe UI", sans-serif`;

  const widths = Array.from(line).map((c) => ctx.measureText(c).width);
  const markW =
    widths.reduce((a, b) => a + b, 0) + tracking * Math.max(0, line.length - 1);
  const ruleW = Math.min(opts.width * 0.22, Math.max(markW * 0.55, fontSize * 6));

  ctx.strokeStyle = `rgba(255,255,255,${opacity * 0.55})`;
  ctx.lineWidth = Math.max(1, fontSize * 0.045);
  ctx.beginPath();
  ctx.moveTo(cx - ruleW / 2, baseline - fontSize * 0.95);
  ctx.lineTo(cx + ruleW / 2, baseline - fontSize * 0.95);
  ctx.stroke();

  ctx.shadowColor = "rgba(0,0,0,0.72)";
  ctx.shadowBlur = Math.round(fontSize * 0.35);
  ctx.shadowOffsetY = 1;
  ctx.fillStyle = `rgba(255,255,255,${opacity})`;
  drawTracked(ctx, line, cx, baseline, tracking);

  if (showSub) {
    ctx.shadowBlur = Math.round(subSize * 0.3);
    ctx.font = `500 ${subSize}px "SilentVigil", Montserrat, "Segoe UI", sans-serif`;
    ctx.fillStyle = `rgba(255,255,255,${opacity * 0.78})`;
    drawTracked(ctx, WATERMARK_SUB, cx, baseline + fontSize * 0.72, subSize * 0.55);
  }

  ctx.restore();
}
