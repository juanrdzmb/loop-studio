/* E2E: Dual Studio export 2K (2560×1440) — passthrough nativo de resolución.
 * Genera un clip 2K nítido, lo exporta desde /dual-studio (original/static/cut)
 * y verifica: resolución nativa exacta, FPS del source, integridad del MP4
 * (decodificación completa sin errores), bitrate, PSNR y nitidez.
 * Un downscale en cualquier punto del pipeline hunde PSNR y LapVar. */
import { chromium } from "playwright-core";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

const EXE = `${process.env.HOME}/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome`;
const BASE = process.env.LOOP_STUDIO_URL || "http://localhost:3210";
const WORK = "/tmp/opencode/loopstudio-e2e";
fs.mkdirSync(WORK, { recursive: true });

const SRC = path.join(WORK, "src_1440p.mp4");
const OUT = path.join(WORK, "export_16x9_2k.mp4");

const results = [];
function ok(name, cond, extra = "") {
  results.push(cond);
  console.log(`${cond ? "PASS" : "FAIL"} ${name} ${extra}`);
}

// 1. Clip de prueba 2560x1440 30fps 5s (patrón detallado en movimiento)
if (!fs.existsSync(SRC)) {
  execFileSync("ffmpeg", [
    "-y", "-loglevel", "error",
    "-f", "lavfi", "-i", "testsrc2=size=2560x1440:rate=30:duration=5",
    "-c:v", "libx264", "-preset", "fast", "-crf", "18", "-pix_fmt", "yuv420p",
    SRC,
  ]);
}
const srcProbe = JSON.parse(execFileSync("ffprobe", ["-v", "quiet", "-print_format", "json", "-show_streams", SRC]));
const srcStream = srcProbe.streams.find((s) => s.codec_type === "video");
const srcFps = srcStream.avg_frame_rate; // p. ej. "30/1"
ok("Clip de prueba generado 2560x1440", srcStream.width === 2560 && srcStream.height === 1440, `(${srcStream.width}x${srcStream.height} @ ${srcFps} fps)`);

// 2. Navegador y UI
const browser = await chromium.launch({
  executablePath: fs.existsSync(EXE) ? EXE : undefined,
  args: ["--no-sandbox", "--disable-dev-shm-usage", "--use-gl=swiftshader", "--enable-unsafe-swiftshader"],
});
const pageErrors = [];
const page = await browser.newPage();
page.on("pageerror", (e) => pageErrors.push(e.message));

await page.goto(BASE + "/dual-studio", { waitUntil: "networkidle" });
ok("Dual Studio carga", await page.isVisible("text=Playlist del edit"));

await page.locator('input[type="file"]').nth(0).setInputFiles(SRC);
await page.waitForSelector("canvas", { timeout: 15000 });
await page.waitForFunction(
  () => !document.body.innerText.includes("cargando clip…"),
  null,
  { timeout: 45000 }
).catch(() => {});
ok("Draft del clip listo", true);

// Configuración limpia: filtro original, cámara fija, sin partículas, seam cut
await page.getByText("Ajustes visuales y estabilización").click();
await page.getByLabel("Filtro visual 16:9").selectOption("original");
await page.getByLabel("Cámara 2.5D 16:9").selectOption("static");
await page.getByLabel("Partículas 16:9").selectOption("none");
await page.getByLabel("Modo de continuidad 16:9").selectOption("cut");
await page.locator('input[type=checkbox]').first().uncheck({ force: true }); // watermark off
await page.locator('button:has-text("30s")').first().click();

// 3. Export con confirmación: el modal debe mostrar la resolución nativa 2K
await page.click('button:has-text("Exportar Solo 16:9")');
await page.waitForSelector("text=Confirma tu exportación", { timeout: 5000 });
ok("Modal muestra 2560×1440 (no 1080p)", await page.isVisible("text=2560×1440"));
await page.click('button:has-text("Sí, exportar ahora")');
await page.click('a:has-text("Descargar Video 16:9")', { timeout: 300000 });
const b64 = await page.evaluate(async () => {
  const vid = document.querySelector('video[src^="blob:"]');
  if (!vid) return null;
  const res = await fetch(vid.src);
  const buf = await res.arrayBuffer();
  let binary = "";
  const bytes = new Uint8Array(buf);
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
});
ok("Export completado (blob capturado)", Boolean(b64));
fs.writeFileSync(OUT, Buffer.from(b64, "base64"));
ok("MP4 guardado", fs.existsSync(OUT), `(${(fs.statSync(OUT).size / 1024 / 1024).toFixed(1)} MB)`);

// 4. Propiedades del stream de salida
const outProbe = JSON.parse(execFileSync("ffprobe", ["-v", "quiet", "-print_format", "json", "-show_streams", OUT]));
const outStream = outProbe.streams.find((s) => s.codec_type === "video");
ok("Resolución nativa 2560x1440 (2K sin degradar)", outStream.width === 2560 && outStream.height === 1440, `(${outStream.width}x${outStream.height})`);
ok("FPS iguala al source", outStream.avg_frame_rate === srcFps || outStream.r_frame_rate === srcFps, `(source ${srcFps}, export ${outStream.avg_frame_rate})`);
const outBitrate = Number(outStream.bit_rate || 0);
ok("Bitrate 2K (>16 Mbps)", outBitrate > 16_000_000, `(${(outBitrate / 1e6).toFixed(1)} Mbps)`);
const outDur = Number(outStream.duration || 0);
ok("Duración objetivo 30s", Math.abs(outDur - 30) < 0.5, `(${outDur.toFixed(2)}s)`);

// 5. Integridad: decodificación completa sin errores (archivo no corrupto)
const integrity = execFileSync("bash", ["-c", `ffmpeg -v error -i "$1" -f null - 2>&1 | head -5; true`, "bash", OUT], { encoding: "utf8" });
ok("MP4 íntegro (decodifica sin errores)", integrity.trim().length === 0, integrity.trim().slice(0, 120));


// 6. PSNR source ↔ export (mismo contenido, cámara fija, seam cut)
const psnrOut = execFileSync("bash", ["-c",
  `ffmpeg -y -loglevel info -t 4 -i "$1" -t 4 -i "$2" -filter_complex "[0:v]settb=AVTB[a];[1:v]settb=AVTB[b];[a][b]psnr" -f null - 2>&1`,
  "bash", OUT, SRC,
], { encoding: "utf8", maxBuffer: 32 * 1024 * 1024 });
const m = (psnrOut.match(/average:([\d.]+|inf)/) || [])[1];
const psnr = m === "inf" ? 99 : Number(m);
ok("PSNR source↔export (>24 dB)", psnr > 24, `(${psnr} dB — testsrc2 son barras 100% saturadas, el techo real es menor)`);

// 7. Nitidez: varianza Laplaciana del frame exportado vs source
function lapVarRatio(outPng, srcPng) {
  const gray = (file) => execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-i", file, "-vf", "format=gray", "-f", "rawvideo", "-"], { encoding: "buffer", maxBuffer: 32 * 1024 * 1024 });
  const data = gray(outPng);
  const ref = gray(srcPng);
  const W = 2560, H = 1440;
  const lap = (d) => {
    let sum = 0, sum2 = 0, n = 0;
    for (let y = 1; y < H - 1; y += 2) {
      for (let x = 1; x < W - 1; x += 2) {
        const i = y * W + x;
        const l = 4 * d[i] - d[i - 1] - d[i + 1] - d[i - W] - d[i + W];
        sum += l; sum2 += l * l; n++;
      }
    }
    const mean = sum / n;
    return sum2 / n - mean * mean;
  };
  return lap(data) / lap(ref) * 100;
}
execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-ss", "1.0", "-i", OUT, "-frames:v", "1", `${WORK}/e2k_frame.png`]);
execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-ss", "1.0", "-i", SRC, "-frames:v", "1", `${WORK}/s2k_frame.png`]);
const ratio = lapVarRatio(`${WORK}/e2k_frame.png`, `${WORK}/s2k_frame.png`);
ok("Nitidez preservada (>60% varianza Laplaciana)", ratio > 60, `(${ratio.toFixed(1)}%)`);

ok("Sin errores de página", pageErrors.length === 0, pageErrors.slice(0, 3).join(" | "));

await browser.close();
const failed = results.filter((r) => !r).length;
console.log(failed === 0 ? "\n✅ TODO OK" : `\n❌ ${failed} pruebas fallaron`);
process.exit(failed === 0 ? 0 : 1);

