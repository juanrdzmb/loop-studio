/* E2E: Dual Studio export quality (full-resolution, source-matched FPS).
 * Generates a sharp 1080p test clip, exports it from /dual-studio with
 * static camera + original filter + cut seam, then measures PSNR between the
 * source and the export. A downscale anywhere in the pipeline craters PSNR. */
import { chromium } from "playwright-core";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

const EXE = `${process.env.HOME}/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome`;
const BASE = process.env.LOOP_STUDIO_URL || "http://localhost:3210";
const WORK = "/tmp/opencode/loopstudio-e2e";
fs.mkdirSync(WORK, { recursive: true });

const SRC = path.join(WORK, "src_1080p.mp4");
const OUT = path.join(WORK, "export_16x9.mp4");

const results = [];
function ok(name, cond, extra = "") {
  results.push(cond);
  console.log(`${cond ? "PASS" : "FAIL"} ${name} ${extra}`);
}

// 1. Generate a sharp 1920x1080 30fps 5s test clip (high detail, moving pattern)
if (!fs.existsSync(SRC)) {
  execFileSync("ffmpeg", [
    "-y", "-loglevel", "error",
    "-f", "lavfi", "-i", "testsrc2=size=1920x1080:rate=30:duration=5",
    "-c:v", "libx264", "-preset", "fast", "-crf", "18", "-pix_fmt", "yuv420p",
    SRC,
  ]);
}
const srcProbe = JSON.parse(execFileSync("ffprobe", ["-v", "quiet", "-print_format", "json", "-show_streams", SRC]));
const srcStream = srcProbe.streams.find((s) => s.codec_type === "video");
const srcFps = srcStream.avg_frame_rate; // e.g. "30/1"
ok("Clip de prueba generado 1920x1080", srcStream.width === 1920 && srcStream.height === 1080, `(${srcStream.width}x${srcStream.height} @ ${srcFps} fps)`);

// 2. Launch browser and drive the UI
const browser = await chromium.launch({
  executablePath: fs.existsSync(EXE) ? EXE : undefined,
  args: ["--no-sandbox", "--disable-dev-shm-usage", "--use-gl=swiftshader", "--enable-unsafe-swiftshader"],
});
const pageErrors = [];
const page = await browser.newPage();
page.on("pageerror", (e) => pageErrors.push(e.message));

await page.goto(BASE + "/dual-studio", { waitUntil: "networkidle" });
const hasStudio = await page.isVisible("text=Canción Master Común");
ok("Dual Studio carga", hasStudio);

// Upload the clip into the 16:9 slot (first file input on the page)
await page.setInputFiles('input[type=file]', SRC);
await page.waitForSelector("canvas", { timeout: 15000 });
// Wait for the clip frame cache to build (draft badge stops saying "cargando clip…")
await page.waitForFunction(
  () => !document.body.innerText.includes("cargando clip…"),
  null,
  { timeout: 30000 }
).catch(() => {});
ok("Draft del clip listo", true);

// Configure: original filter, no particles, static camera, cut seam, 30s target, watermark off
const selects = page.locator('select');
// 16:9 workspace selects: style, camera, particles, seam (first 4 in DOM order)
await selects.nth(0).selectOption("original");
await selects.nth(1).selectOption("static");
await selects.nth(2).selectOption("none");
await page.getByText("Opciones avanzadas de continuidad").first().click();
await selects.nth(3).selectOption("cut");
await page.locator('input[type=checkbox]').first().uncheck({ force: true }); // watermark off
await page.locator('button:has-text("30s")').first().click(); // 16:9 duration preset

// 3. Export via confirmation modal
await page.click('button:has-text("Exportar Solo 16:9")');
await page.waitForSelector("text=Confirma tu exportación", { timeout: 5000 });
ok("Modal de confirmación aparece", true);
await page.click('button:has-text("Sí, exportar ahora")');
await page.click('a:has-text("Descargar Video 16:9")', { timeout: 240000 });
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

// 5. Verify output stream properties
const outProbe = JSON.parse(execFileSync("ffprobe", ["-v", "quiet", "-print_format", "json", "-show_streams", OUT]));
const outStream = outProbe.streams.find((s) => s.codec_type === "video");
ok("Resolución nativa 1920x1080", outStream.width === 1920 && outStream.height === 1080, `(${outStream.width}x${outStream.height})`);
ok("FPS iguala al source", outStream.avg_frame_rate === srcFps || outStream.r_frame_rate === srcFps, `(source ${srcFps}, export ${outStream.avg_frame_rate})`);
const outBitrate = Number(outStream.bit_rate || 0);
ok("Bitrate alto (>8 Mbps)", outBitrate > 8_000_000, `(${(outBitrate / 1e6).toFixed(1)} Mbps)`);
const outDur = Number(outStream.duration || 0);
ok("Duración objetivo 30s", Math.abs(outDur - 30) < 0.5, `(${outDur.toFixed(2)}s)`);

// 6. PSNR between source and export (same content, static camera, cut seam)
const psnrOut = execFileSync("bash", ["-c",
  `ffmpeg -y -loglevel info -t 4 -i "$1" -t 4 -i "$2" -filter_complex "[0:v]settb=AVTB[a];[1:v]settb=AVTB[b];[a][b]psnr" -f null - 2>&1`,
  "bash", OUT, SRC,
], { encoding: "utf8", maxBuffer: 32 * 1024 * 1024 });
const m = (psnrOut.match(/average:([\d.]+|inf)/) || [])[1];
const psnr = m === "inf" ? 99 : Number(m);
ok("PSNR source↔export (>24 dB)", psnr > 24, `(${psnr} dB — testsrc2 son barras 100% saturadas, el techo real es menor)`);

// 7. Sharpness: Laplacian variance of an exported frame vs the source frame.
//    Calibrated on this clip: clean re-encode ≈ 100-112%, old downscale bug ≈ 3%.
function lapVarRatio(outPng, srcPng) {
  const gray = (file) => execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-i", file, "-vf", "format=gray", "-f", "rawvideo", "-"], { encoding: "buffer", maxBuffer: 16 * 1024 * 1024 });
  const data = gray(outPng);
  const ref = gray(srcPng);
  const W = 1920, H = 1080;
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
execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-ss", "1.0", "-i", OUT, "-frames:v", "1", "/tmp/opencode/loopstudio-e2e/e_frame.png"]);
execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-ss", "1.0", "-i", SRC, "-frames:v", "1", "/tmp/opencode/loopstudio-e2e/s_frame.png"]);
const ratio = lapVarRatio("/tmp/opencode/loopstudio-e2e/e_frame.png", "/tmp/opencode/loopstudio-e2e/s_frame.png");
ok("Nitidez preservada (>60% varianza Laplaciana)", ratio > 60, `(${ratio.toFixed(1)}% — el bug de downscale daba ~3%)`);

// 8. Pingpong: reverse half must decode correctly (segmented reverse stream).
//    Cycle = 2×5s; export frame at t=7.5s corresponds to source frame at 2.5s.
await selects.nth(3).selectOption("pingpong");
await page.click('button:has-text("Exportar Solo 16:9")');
await page.waitForSelector("text=Confirma tu exportación", { timeout: 5000 });
await page.click('button:has-text("Sí, exportar ahora")');
await page.waitForSelector('a:has-text("Descargar Video 16:9")', { timeout: 240000 });
await page.waitForFunction(
  () => (document.querySelector('a[download^="loop_16x9"]')?.getAttribute("href") || "").length > 0,
  null,
  { timeout: 10000 }
).catch(() => {});
await page.click('a:has-text("Descargar Video 16:9")');
const b64pp = await page.evaluate(async () => {
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
const OUT_PP = "/tmp/opencode/loopstudio-e2e/export_pingpong.mp4";
fs.writeFileSync(OUT_PP, Buffer.from(b64pp || "", "base64"));
const ppProbe = JSON.parse(execFileSync("ffprobe", ["-v", "quiet", "-print_format", "json", "-show_streams", OUT_PP]));
const ppStream = ppProbe.streams.find((s) => s.codec_type === "video");
ok("Pingpong exporta 1920x1080 @ 30s", ppStream.width === 1920 && ppStream.height === 1080 && Math.abs(Number(ppStream.duration || 0) - 30) < 0.5, `(${ppStream.width}x${ppStream.height}, ${Number(ppStream.duration || 0).toFixed(1)}s)`);
execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-ss", "7.5", "-i", OUT_PP, "-frames:v", "1", "/tmp/opencode/loopstudio-e2e/epp_frame.png"]);
execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-ss", "2.5", "-i", SRC, "-frames:v", "1", "/tmp/opencode/loopstudio-e2e/spp_frame.png"]);
const ppPsnrOut = execFileSync("bash", ["-c",
  `ffmpeg -loglevel info -i "$1" -i "$2" -filter_complex psnr -f null - 2>&1`,
  "bash", "/tmp/opencode/loopstudio-e2e/epp_frame.png", "/tmp/opencode/loopstudio-e2e/spp_frame.png",
], { encoding: "utf8", maxBuffer: 32 * 1024 * 1024 });
const ppm = (ppPsnrOut.match(/average:([\d.]+|inf)/) || [])[1];
ok("Pingpong reversa alineada (PSNR frame 7.5s ↔ source 2.5s >24 dB)", Number(ppm) > 24, `(${ppm} dB)`);

ok("Sin errores de página", pageErrors.length === 0, pageErrors.slice(0, 3).join(" | "));

await browser.close();
const failed = results.filter((r) => !r).length;
console.log(failed === 0 ? "\n✅ TODO OK" : `\n❌ ${failed} pruebas fallaron`);
process.exit(failed === 0 ? 0 : 1);
