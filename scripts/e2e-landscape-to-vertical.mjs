/* Regresión: una fuente horizontal exportada a 9:16 debe recortarse con `cover`,
 * nunca estirarse en el canvas intermedio. Requiere el servidor en marcha. */
import { chromium } from "playwright-core";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

const EXE = `${process.env.HOME}/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome`;
const BASE = process.env.LOOP_STUDIO_URL || "http://localhost:3210";
const WORK = "/tmp/opencode/loopstudio-e2e-aspect";
fs.mkdirSync(WORK, { recursive: true });
const SRC = path.join(WORK, "landscape.mp4");
const OUT = path.join(WORK, "vertical.mp4");
const EXPECTED = path.join(WORK, "expected.png");
const ACTUAL = path.join(WORK, "actual.png");

execFileSync("ffmpeg", [
  "-y", "-loglevel", "error",
  "-f", "lavfi", "-i", "testsrc2=size=1920x1080:rate=24:duration=4",
  "-c:v", "libx264", "-preset", "fast", "-crf", "18", "-pix_fmt", "yuv420p", SRC,
]);

const checks = [];
const ok = (name, value, detail = "") => {
  checks.push(Boolean(value));
  console.log(`${value ? "PASS" : "FAIL"} ${name} ${detail}`);
};

const browser = await chromium.launch({
  executablePath: fs.existsSync(EXE) ? EXE : undefined,
  args: ["--no-sandbox", "--disable-dev-shm-usage", "--use-gl=swiftshader", "--enable-unsafe-swiftshader"],
});
const page = await browser.newPage();
const pageErrors = [];
page.on("pageerror", (error) => pageErrors.push(error.message));

await page.goto(`${BASE}/dual-studio`, { waitUntil: "networkidle" });
await page.getByRole("button", { name: /📱 Short 9:16/ }).click();
await page.locator('input[type="file"]').nth(0).setInputFiles(SRC);
await page.waitForFunction(() => !document.body.innerText.includes("cargando clip…"), null, { timeout: 30000 });
await page.getByLabel("Modo de continuidad 9:16").selectOption("cut");
await page.getByText("Ajustes visuales y estabilización").click();
await page.getByLabel("Filtro visual 9:16").selectOption("original");
await page.getByLabel("Cámara 2.5D 9:16").selectOption("static");
await page.getByLabel("Partículas 9:16").selectOption("none");
const stabilization = page.getByRole("checkbox", { name: /Aplicar corrección conservadora/ });
if (await stabilization.count() && await stabilization.isEnabled()) await stabilization.uncheck();
await page.getByRole("button", { name: "15s", exact: true }).click();

await page.getByRole("button", { name: /Exportar Solo 9:16/ }).click();
await page.getByText("Confirma tu exportación").waitFor();
await page.getByRole("button", { name: /Sí, exportar ahora/ }).click();
await page.waitForSelector('a[download^="loop_9x16"]', { timeout: 300000 });
const base64 = await page.evaluate(async () => {
  const anchor = document.querySelector('a[download^="loop_9x16"]');
  const response = await fetch(anchor.getAttribute("href"));
  const bytes = new Uint8Array(await response.arrayBuffer());
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary);
});
fs.writeFileSync(OUT, Buffer.from(base64, "base64"));

const probe = JSON.parse(execFileSync("ffprobe", ["-v", "quiet", "-print_format", "json", "-show_streams", "-show_format", OUT]));
const stream = probe.streams.find((item) => item.codec_type === "video");
ok("Salida 9:16 nativa", stream.width === 1080 && stream.height === 1920, `${stream.width}×${stream.height}`);
ok("FPS 24 conservado", stream.avg_frame_rate === "24/1", stream.avg_frame_rate);
ok("Duración Short exacta", Math.abs(Number(probe.format.duration) - 15) < 0.25, `${probe.format.duration}s`);

execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-ss", "1", "-i", SRC, "-vf", "crop=608:1080:656:0,scale=1080:1920:flags=lanczos", "-frames:v", "1", EXPECTED]);
execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-ss", "1", "-i", OUT, "-frames:v", "1", ACTUAL]);
const psnrLog = execFileSync("bash", ["-c", 'ffmpeg -loglevel info -i "$1" -i "$2" -filter_complex psnr -f null - 2>&1', "bash", ACTUAL, EXPECTED], { encoding: "utf8" });
const psnr = Number((psnrLog.match(/average:([\d.]+)/) || [])[1] || 0);
ok("Recorte cover sin estiramiento", psnr > 22, `${psnr.toFixed(2)} dB`);
ok("Sin errores de página", pageErrors.length === 0, pageErrors.slice(0, 2).join(" | "));

await browser.close();
const failures = checks.filter((value) => !value).length;
console.log(failures ? `\n❌ ${failures} pruebas fallaron` : "\n✅ TODO OK");
process.exit(failures ? 1 : 0);
