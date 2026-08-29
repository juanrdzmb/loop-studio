/* E2E: Continuo calmado 9:16.
 * Comprueba el mapeo temporal 0,4x, que preview/export no produzcan negro en la
 * frontera y que los modos existentes sigan disponibles en la interfaz. */
import { chromium } from "playwright-core";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

const EXE = `${process.env.HOME}/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome`;
const BASE = process.env.LOOP_STUDIO_URL || "http://localhost:3210";
const WORK = "/tmp/opencode/loopstudio-e2e";
fs.mkdirSync(WORK, { recursive: true });

const SRC = process.env.LOOP_STUDIO_SRC || path.join(WORK, "src_calm_9x16.mp4");
const OUT = path.join(WORK, "export_calm_9x16.mp4");

if (!process.env.LOOP_STUDIO_SRC && !fs.existsSync(SRC)) {
  execFileSync("ffmpeg", [
    "-y", "-loglevel", "error",
    "-f", "lavfi", "-i", "testsrc2=size=1080x1920:rate=24:duration=3",
    "-c:v", "libx264", "-preset", "fast", "-crf", "18", "-pix_fmt", "yuv420p",
    SRC,
  ]);
}

const probe = JSON.parse(execFileSync("ffprobe", [
  "-v", "quiet", "-print_format", "json", "-show_streams", "-show_format", SRC,
]));
const sourceStream = probe.streams.find((stream) => stream.codec_type === "video");
const sourceDuration = Number(sourceStream?.duration || probe.format?.duration || 0);

const results = [];
function ok(name, condition, extra = "") {
  results.push(condition);
  console.log(`${condition ? "PASS" : "FAIL"} ${name} ${extra}`);
}

const browser = await chromium.launch({
  executablePath: fs.existsSync(EXE) ? EXE : undefined,
  args: ["--no-sandbox", "--disable-dev-shm-usage", "--use-gl=swiftshader", "--enable-unsafe-swiftshader"],
});
const page = await browser.newPage();
const pageErrors = [];
const sampleLifecycleWarnings = [];
page.on("pageerror", (error) => pageErrors.push(error.message));
page.on("console", (message) => {
  if (message.text().includes("VideoSample was garbage collected without first being closed")) {
    sampleLifecycleWarnings.push(message.text());
  }
});

await page.goto(`${BASE}/dual-studio`, { waitUntil: "networkidle" });
await page.locator('input[type="file"]').nth(1).setInputFiles(SRC);
await page.waitForFunction(
  () => !document.body.innerText.includes("cargando clip…"),
  null,
  { timeout: 30000 }
);

const details = page.getByText("Opciones avanzadas de continuidad").last();
await details.click();
const seamSelect = page.getByLabel("Modo de continuidad 9:16");
ok("Continuo calmado es el modo automático del clip completo", await seamSelect.inputValue() === "calm");
ok(
  "Los modos anteriores siguen disponibles",
  await seamSelect.locator('option[value="smooth"]').count() === 1
    && await seamSelect.locator('option[value="pingpong"]').count() === 1
    && await seamSelect.locator('option[value="cut"]').count() === 1
);

const rate = page.getByLabel("Velocidad de Continuo calmado 9:16");
ok("Velocidad calmada por defecto 0,40x", await rate.inputValue() === "0.4", `(${await rate.inputValue()}x)`);

await page.getByRole("button", { name: /Pausar/ }).last().click();
const targetDuration = Math.max(8, Math.ceil(sourceDuration / 0.4) + 1);
const durationInput = page.getByLabel("Duración personalizada del Short");
await durationInput.fill(String(targetDuration));
await durationInput.blur();

const cycleDuration = sourceDuration / 0.4;
const previewSeek = page.getByLabel("Posición del preview 9:16");
const previewStats = [];
for (const time of [cycleDuration - 0.06, cycleDuration, cycleDuration + 0.06]) {
  await previewSeek.fill(String(Math.min(targetDuration, Math.max(0, time))));
  await page.waitForTimeout(120);
  previewStats.push(await page.getByTestId("preview-canvas-9x16").evaluate((canvas) => {
    const ctx = canvas.getContext("2d");
    const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    let nearBlack = 0;
    let luma = 0;
    const stride = 64;
    let samples = 0;
    for (let i = 0; i < data.length; i += 4 * stride) {
      const y = 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2];
      luma += y;
      if (y < 8) nearBlack++;
      samples++;
    }
    return { meanLuma: luma / samples, nearBlackRatio: nearBlack / samples };
  }));
}
ok(
  "Preview sin destello negro en la frontera",
  previewStats.every(({ meanLuma, nearBlackRatio }) => meanLuma > 12 && nearBlackRatio < 0.92),
  JSON.stringify(previewStats)
);

await page.locator('select').nth(4).selectOption("original");
await page.locator('select').nth(5).selectOption("static");
await page.locator('select').nth(6).selectOption("none");
await page.locator('input[type="checkbox"]').first().uncheck({ force: true });

await page.getByRole("button", { name: /Exportar Solo 9:16/ }).click();
await page.getByText("Confirma tu exportación").waitFor();
await page.getByRole("button", { name: /Sí, exportar ahora/ }).click();
const download = page.locator('a[download^="loop_9x16"]');
await download.waitFor({ timeout: 300000 });
const b64 = await page.evaluate(async () => {
  const anchor = document.querySelector('a[download^="loop_9x16"]');
  if (!anchor) return null;
  const response = await fetch(anchor.getAttribute("href"));
  const bytes = new Uint8Array(await response.arrayBuffer());
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary);
});
ok("Export calmado completado", Boolean(b64));
fs.writeFileSync(OUT, Buffer.from(b64 || "", "base64"));

const outProbe = JSON.parse(execFileSync("ffprobe", [
  "-v", "quiet", "-print_format", "json", "-show_streams", OUT,
]));
const outStream = outProbe.streams.find((stream) => stream.codec_type === "video");
ok(
  "Duración y resolución del Short correctas",
  outStream.width === 1080 && outStream.height === 1920
    && Math.abs(Number(outStream.duration || 0) - targetDuration) < 0.5,
  `(${outStream.width}x${outStream.height}, ${Number(outStream.duration || 0).toFixed(2)}s)`
);

const blackLog = execFileSync("bash", ["-c",
  `ffmpeg -loglevel info -i "$1" -vf "blackdetect=d=0.02:pix_th=0.10" -an -f null - 2>&1`,
  "bash", OUT,
], { encoding: "utf8", maxBuffer: 16 * 1024 * 1024 });
const blackHits = blackLog.match(/black_start:/g) || [];
ok("Export sin pantallazos negros", blackHits.length === 0, `(${blackHits.length} detecciones)`);

if (!process.env.LOOP_STUDIO_SRC) {
  const outFrame = path.join(WORK, "calm_out_frame.png");
  const srcFrame = path.join(WORK, "calm_src_frame.png");
  execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-ss", "2.5", "-i", OUT, "-frames:v", "1", outFrame]);
  execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-ss", "1.0", "-i", SRC, "-frames:v", "1", srcFrame]);
  const psnrLog = execFileSync("bash", ["-c",
    `ffmpeg -loglevel info -i "$1" -i "$2" -filter_complex psnr -f null - 2>&1`,
    "bash", outFrame, srcFrame,
  ], { encoding: "utf8", maxBuffer: 32 * 1024 * 1024 });
  const psnr = Number((psnrLog.match(/average:([\d.]+|inf)/) || [])[1]);
  ok("El mapeo 0,4x coincide (2,5s de salida = 1s de fuente)", psnr > 24, `(${psnr} dB)`);
}

ok("Sin errores de página", pageErrors.length === 0, pageErrors.slice(0, 3).join(" | "));
ok("Sin VideoSample huérfanos", sampleLifecycleWarnings.length === 0, sampleLifecycleWarnings.slice(0, 2).join(" | "));

await browser.close();
const failed = results.filter((result) => !result).length;
console.log(failed === 0 ? "\n✅ TODO OK" : `\n❌ ${failed} pruebas fallaron`);
process.exit(failed === 0 ? 0 : 1);
