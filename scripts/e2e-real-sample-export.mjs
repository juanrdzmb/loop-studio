/* E2E con el ejemplo real del usuario: master 10 s, Natural forward-only,
 * resolución/FPS/bitrate nativos, audio inline y costura final→inicio. */
import { chromium } from "playwright-core";
import { execFileSync } from "node:child_process";
import fs from "node:fs";

const BASE = process.env.LOOP_STUDIO_URL || "http://localhost:3210";
const EXE = `${process.env.HOME}/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome`;
const SRC = process.env.LOOP_STUDIO_SAMPLE || "/home/juanda/Vídeos/videos_loop/Prueba.mp4";
const WORK = "/tmp/opencode/loopstudio-real-sample";
const SONG = `${WORK}/prueba-audio.m4a`;
const OUT = `${WORK}/prueba-natural-export.mp4`;
fs.mkdirSync(WORK, { recursive: true });
execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-i", SRC, "-vn", "-c:a", "copy", SONG]);

const checks = [];
const ok = (name, condition, detail = "") => {
  checks.push(Boolean(condition));
  console.log(`${condition ? "PASS" : "FAIL"} ${name} ${detail}`);
};
const browser = await chromium.launch({
  executablePath: fs.existsSync(EXE) ? EXE : undefined,
  args: ["--no-sandbox", "--disable-dev-shm-usage", "--use-gl=swiftshader", "--enable-unsafe-swiftshader"],
});
const page = await browser.newPage();
const pageErrors = [];
page.on("pageerror", (error) => pageErrors.push(error.message));
await page.goto(`${BASE}/dual-studio`, { waitUntil: "networkidle" });
await page.locator('input[type="file"]').nth(0).setInputFiles(SRC);
await page.waitForFunction(() => !document.body.innerText.includes("cargando clip…"), null, { timeout: 45_000 });
await page.getByLabel("Añadir canciones a la playlist").setInputFiles(SONG);
await page.getByText("1 CANCIÓN").waitFor({ timeout: 45_000 });
await page.getByText("Ajustes visuales y estabilización").click();
await page.getByLabel("Filtro visual 16:9").selectOption("original");
await page.getByLabel("Cámara 2.5D 16:9").selectOption("static");
await page.getByLabel("Partículas 16:9").selectOption("none");
await page.getByLabel("Modo de continuidad 16:9").selectOption("smooth");
await page.getByRole("button", { name: /Exportar Solo 16:9/ }).click();
await page.getByText("Confirma tu exportación").waitFor();
await page.getByRole("button", { name: /Sí, exportar ahora/ }).click();
await page.waitForSelector('a[download^="loop_16x9"]', { timeout: 600_000 });
const b64 = await page.evaluate(async () => {
  const anchor = document.querySelector('a[download^="loop_16x9"]');
  const response = await fetch(anchor.getAttribute("href"));
  const bytes = new Uint8Array(await response.arrayBuffer());
  let binary = "";
  for (let index = 0; index < bytes.length; index += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
  }
  return btoa(binary);
});
fs.writeFileSync(OUT, Buffer.from(b64, "base64"));

const probe = JSON.parse(execFileSync("ffprobe", ["-v", "quiet", "-print_format", "json", "-show_streams", "-show_format", OUT]));
const video = probe.streams.find((stream) => stream.codec_type === "video");
ok("Ejemplo conserva 1920×1080", video.width === 1920 && video.height === 1080, `${video.width}×${video.height}`);
ok("Ejemplo conserva 24 fps", video.avg_frame_rate === "24/1" || video.r_frame_rate === "24/1", video.avg_frame_rate);
ok("Master dura lo que dura la canción", Math.abs(Number(probe.format.duration) - 10) < 0.25, `${probe.format.duration}s`);
ok("Audio AAC incluido", probe.streams.some((stream) => stream.codec_type === "audio"));
ok("Bitrate de vídeo ≥8 Mbps", Number(video.bit_rate || 0) >= 8_000_000, `${(Number(video.bit_rate || 0) / 1e6).toFixed(1)} Mbps`);

execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-ss", String(239 / 24), "-i", OUT, "-frames:v", "1", `${WORK}/end.png`]);
execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-ss", "0", "-i", OUT, "-frames:v", "1", `${WORK}/start.png`]);
const psnrLog = execFileSync("bash", ["-c", 'ffmpeg -loglevel info -i "$1" -i "$2" -filter_complex psnr -f null - 2>&1', "bash", `${WORK}/end.png`, `${WORK}/start.png`], { encoding: "utf8" });
const seamPsnr = Number((psnrLog.match(/average:([\d.]+|inf)/) || [])[1] || 0);
ok("Natural cierra cerca del frame inicial", seamPsnr > 22, `PSNR ${seamPsnr.toFixed(1)} dB`);
ok("Sin errores de página", pageErrors.length === 0, pageErrors.slice(0, 2).join(" | "));

await browser.close();
console.log(checks.every(Boolean) ? "\n✅ EJEMPLO REAL OK" : "\n❌ EJEMPLO REAL CON FALLOS");
process.exit(checks.every(Boolean) ? 0 : 1);
