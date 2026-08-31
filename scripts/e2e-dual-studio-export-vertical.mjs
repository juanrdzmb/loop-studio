/* E2E: Dual Studio export 9:16 vertical (pingpong, el caso que se colgaba en 46%).
 * Genera un clip vertical 1080x1920, lo exporta desde /dual-studio con seam pingpong
 * y verifica resolución nativa, fps, duración, bitrate, PSNR y nitidez.
 * También valida el botón Cancelar (abort no deja la herramienta bloqueada). */
import { chromium } from "playwright-core";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

const EXE = `${process.env.HOME}/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome`;
const BASE = process.env.LOOP_STUDIO_URL || "http://localhost:3210";
const WORK = "/tmp/opencode/loopstudio-e2e";
fs.mkdirSync(WORK, { recursive: true });

const SRC = process.env.LOOP_STUDIO_SRC || path.join(WORK, "src_9x16.mp4");
const OUT = path.join(WORK, "export_9x16.mp4");

const results = [];
function ok(name, cond, extra = "") {
  results.push(cond);
  console.log(`${cond ? "PASS" : "FAIL"} ${name} ${extra}`);
}

// 1. Clip vertical de prueba 1080x1920 30fps 5s
if (!fs.existsSync(SRC)) {
  execFileSync("ffmpeg", [
    "-y", "-loglevel", "error",
    "-f", "lavfi", "-i", "testsrc2=size=1080x1920:rate=30:duration=5",
    "-c:v", "libx264", "-preset", "fast", "-crf", "18", "-pix_fmt", "yuv420p",
    SRC,
  ]);
}
const srcProbe = JSON.parse(execFileSync("ffprobe", ["-v", "quiet", "-print_format", "json", "-show_streams", "-show_format", SRC]));
const srcStream = srcProbe.streams.find((s) => s.codec_type === "video");
const srcFps = srcStream.avg_frame_rate;
const srcDuration = Number(srcProbe.format?.duration || 5);
ok("Clip vertical generado 1080x1920", srcStream.width === 1080 && srcStream.height === 1920, `(${srcStream.width}x${srcStream.height} @ ${srcFps} fps)`);

// 2. Browser + UI
const browser = await chromium.launch({
  executablePath: fs.existsSync(EXE) ? EXE : undefined,
  args: ["--no-sandbox", "--disable-dev-shm-usage", "--use-gl=swiftshader", "--enable-unsafe-swiftshader"],
});
const pageErrors = [];
const sampleLifecycleWarnings = [];
const page = await browser.newPage();
page.on("pageerror", (e) => pageErrors.push(e.message));
page.on("console", (message) => {
  if (message.text().includes("VideoSample was garbage collected without first being closed")) {
    sampleLifecycleWarnings.push(message.text());
  }
});

await page.goto(BASE + "/dual-studio", { waitUntil: "networkidle" });
const hasStudio = await page.isVisible("text=Playlist del edit");
ok("Dual Studio carga", hasStudio);

await page.getByRole("button", { name: /📱 Short 9:16/ }).click();
// En la pestaña Short solo aparecen el clip activo y la canción.
await page.locator('input[type="file"]').nth(0).setInputFiles(SRC);
await page.waitForSelector("canvas", { timeout: 15000 });
const draftReady = await page.waitForFunction(
  () => !document.body.innerText.includes("cargando clip…"),
  null,
  { timeout: 30000 }
).then(() => true).catch(() => false);
ok("Draft del clip 9:16 listo", draftReady);
const fullClipCard = page.getByTestId("visual-loop-9x16");
await fullClipCard.getByText(/s seleccionados/).waitFor({ timeout: 10000 });
const fullClipText = await fullClipCard.innerText();
ok("Short conserva el clip completo, sin micro-recorte", /\d+\.\d+s seleccionados/.test(fullClipText), fullClipText.replace(/\n/g, " · "));

// Configure 9:16 workspace: original, static, none, pingpong
await page.getByText("Ajustes visuales y estabilización").click();
await page.getByLabel("Filtro visual 9:16").selectOption("original");
await page.getByLabel("Cámara 2.5D 9:16").selectOption("static");
await page.getByLabel("Partículas 9:16").selectOption("none");
await page.getByLabel("Modo de continuidad 9:16").selectOption("pingpong");
await page.locator('input[type="checkbox"]').first().uncheck({ force: true }); // watermark off
// 9:16 duration presets: pick 30s (last group of duration buttons contains "30s")
const durationButtons = page.locator('button:text-is("30s")');
await durationButtons.last().click();
const customShortDuration = page.getByLabel("Duración personalizada del Short");
await customShortDuration.fill("17");
await customShortDuration.blur();
ok("Short admite duración personalizada", await customShortDuration.inputValue() === "17");
await durationButtons.last().click();

// 3. Export 9:16 via confirmation modal
await page.click('button:has-text("Exportar Solo 9:16")');
await page.waitForSelector("text=Confirma tu exportación", { timeout: 5000 });
ok("Modal de confirmación aparece", true);
await page.click('button:has-text("Sí, exportar ahora")');

// Wait for the 9:16 result anchor (blob href) — captures the export itself
await page.waitForSelector('a[download^="loop_9x16"]', { timeout: 300000 });
await page.waitForFunction(
  () => (document.querySelector('a[download^="loop_9x16"]')?.getAttribute("href") || "").startsWith("blob:"),
  null,
  { timeout: 10000 }
);
const b64 = await page.evaluate(async () => {
  const a = document.querySelector('a[download^="loop_9x16"]');
  if (!a) return null;
  const res = await fetch(a.getAttribute("href"));
  const buf = await res.arrayBuffer();
  let binary = "";
  const bytes = new Uint8Array(buf);
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
});
ok("Export 9:16 completado (blob capturado)", Boolean(b64));
fs.writeFileSync(OUT, Buffer.from(b64 || "", "base64"));
ok("MP4 guardado", fs.existsSync(OUT), `(${(fs.statSync(OUT).size / 1024 / 1024).toFixed(1)} MB)`);

// 4. Output stream properties
const outProbe = JSON.parse(execFileSync("ffprobe", ["-v", "quiet", "-print_format", "json", "-show_streams", OUT]));
const outStream = outProbe.streams.find((s) => s.codec_type === "video");
ok("Resolución nativa 1080x1920", outStream.width === 1080 && outStream.height === 1920, `(${outStream.width}x${outStream.height})`);
ok("FPS iguala al source", outStream.avg_frame_rate === srcFps || outStream.r_frame_rate === srcFps, `(source ${srcFps}, export ${outStream.avg_frame_rate})`);
const outBitrate = Number(outStream.bit_rate || 0);
ok("Bitrate alto (>8 Mbps)", outBitrate > 8_000_000, `(${(outBitrate / 1e6).toFixed(1)} Mbps)`);
const outDur = Number(outStream.duration || 0);
ok("Duración objetivo 30s", Math.abs(outDur - 30) < 0.5, `(${outDur.toFixed(2)}s)`);

// 5. Pingpong alignment: en el cuarto tras el giro, t = 1.30D debe volver a 0.70D.
// Ambos tiempos se eligen como múltiplos exactos de 1/30 s: un seek a mitad de
// frame (p. ej. 6.25 s = frame 187.5) deja el PSNR a merced de qué lado de la
// frontera aterrice ffmpeg y vuelve la prueba intermitente.
const reverseOutputTime = srcDuration * 1.3;
const expectedSourceTime = srcDuration * 0.7;
execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-ss", String(reverseOutputTime), "-i", OUT, "-frames:v", "1", `${WORK}/ev_frame.png`]);
execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-ss", String(expectedSourceTime), "-i", SRC, "-frames:v", "1", `${WORK}/sv_frame.png`]);
const psnrOut = execFileSync("bash", ["-c",
  `ffmpeg -loglevel info -i "$1" -i "$2" -filter_complex psnr -f null - 2>&1`,
  "bash", `${WORK}/ev_frame.png`, `${WORK}/sv_frame.png`,
], { encoding: "utf8", maxBuffer: 32 * 1024 * 1024 });
const m = (psnrOut.match(/average:([\d.]+|inf)/) || [])[1];
ok("Pingpong reversa alineada (PSNR >24 dB)", Number(m) > 24, `(${m} dB; ${reverseOutputTime.toFixed(2)}s ↔ ${expectedSourceTime.toFixed(2)}s)`);

// 5b. Sin frames negros: el bug del "pantallazo negro" aparecía justo en cada frontera
// de ciclo (~10s aquí) cuando el primer PTS del source era > 0 y el frame 0 del ciclo
// se componía sobre un canvas transparente. blackdetect debe dar cero detecciones.
const blackOut = execFileSync("bash", ["-c",
  `ffmpeg -loglevel info -i "$1" -vf "blackdetect=d=0.02:pix_th=0.10" -an -f null - 2>&1`,
  "bash", OUT,
], { encoding: "utf8", maxBuffer: 32 * 1024 * 1024 });
const blackHits = blackOut.match(/black_start:\s*[\d.]+\s*black_end:\s*[\d.]+\s*black_duration:\s*[\d.]+/g) || [];
ok("Sin frames negros en las fronteras de ciclo (blackdetect)", blackHits.length === 0, blackHits.slice(0, 2).join(" | ") || "0 detecciones");

// 6. Cancel button: start another export, cancel it, tool must stay responsive
await page.click('button:has-text("Exportar Solo 9:16")');
await page.waitForSelector("text=Confirma tu exportación", { timeout: 5000 });
await page.click('button:has-text("Sí, exportar ahora")');
await page.waitForSelector('button:has-text("Cancelar")', { timeout: 10000 });
await page.click('button:has-text("Cancelar")');
await page.waitForFunction(
  () => document.body.innerText.includes("cancelada"),
  null,
  { timeout: 20000 }
).catch(() => {});
const cancelMsg = await page.evaluate(() => document.body.innerText.includes("cancelada"));
const canClick = await page.locator('button:has-text("Exportar Solo 9:16")').isEnabled();
ok("Export cancelable (mensaje + botones reactivos)", cancelMsg && canClick, `(mensaje: ${cancelMsg}, botón activo: ${canClick})`);

ok("Sin errores de página", pageErrors.length === 0, pageErrors.slice(0, 3).join(" | "));
ok(
  "Sin samples de vídeo sin cerrar en consola",
  sampleLifecycleWarnings.length === 0,
  sampleLifecycleWarnings.slice(0, 2).join(" | ") || "0 avisos"
);

await browser.close();
const failed = results.filter((r) => !r).length;
console.log(failed === 0 ? "\n✅ TODO OK" : `\n❌ ${failed} pruebas fallaron`);
process.exit(failed === 0 ? 0 : 1);
