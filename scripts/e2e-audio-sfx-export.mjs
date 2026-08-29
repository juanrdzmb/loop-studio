/* E2E: master de Short one-shot + SFX sincronizado.
 * Comprueba duración exacta, AAC/Opus a 48 kHz, bitrate de audio, continuidad
 * (sin silencios internos) y que un impacto colocado en 10s llega al MP4. */
import { chromium } from "playwright-core";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

const EXE = `${process.env.HOME}/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome`;
const BASE = process.env.LOOP_STUDIO_URL || "http://localhost:3210";
const WORK = "/tmp/opencode/loopstudio-e2e";
fs.mkdirSync(WORK, { recursive: true });

const VIDEO = path.join(WORK, "audio_sfx_vertical.mp4");
const AUDIO = path.join(WORK, "continuous_song_40s.mp3");
const OUT = path.join(WORK, "audio_sfx_export.mp4");

if (!fs.existsSync(VIDEO)) {
  execFileSync("ffmpeg", [
    "-y", "-loglevel", "error",
    "-f", "lavfi", "-i", "testsrc2=size=1080x1920:rate=30:duration=4",
    "-c:v", "libx264", "-preset", "fast", "-crf", "18", "-pix_fmt", "yuv420p",
    VIDEO,
  ]);
}
if (!fs.existsSync(AUDIO)) {
  execFileSync("ffmpeg", [
    "-y", "-loglevel", "error",
    "-f", "lavfi", "-i", "sine=frequency=330:sample_rate=48000:duration=40",
    "-af", "volume=0.08",
    "-c:a", "libmp3lame", "-b:a", "192k",
    AUDIO,
  ]);
}

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
page.on("pageerror", (error) => pageErrors.push(error.message));
page.on("console", (message) => {
  if (message.type() === "error" && !message.text().includes("ERR_CONNECTION_REFUSED")) {
    pageErrors.push(`console: ${message.text()}`);
  }
});

await page.goto(`${BASE}/dual-studio`, { waitUntil: "networkidle" });
await page.getByRole("button", { name: /📱 Short 9:16/ }).click();
await page.locator('input[type="file"]').nth(0).setInputFiles(VIDEO);
await page.locator('input[type="file"]').nth(1).setInputFiles(AUDIO);
await page.getByLabel("Duración personalizada del Short").fill("25");
await page.getByLabel("Duración personalizada del Short").blur();
await page.getByTestId("loop-editor").getByText("Fragmento de salida: 25s").waitFor();

await page.getByText("🧰 Extras · efectos de sonido").click();
const track = page.getByTestId("sfx-track-9x16");
const box = await track.boundingBox();
if (!box) throw new Error("No se pudo medir la timeline SFX 9:16");
await track.click({ position: { x: box.width * 0.4, y: box.height / 2 } });
await page.getByRole("button", { name: "Añadir en 10.0s" }).nth(4).click();
const cueVisible = await page.getByTestId("sfx-timeline-9x16").getByTestId("sfx-active-cue").count();
ok("SFX colocado en la timeline del Short", cueVisible === 1, `(${cueVisible} cue)`);

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
ok("Export con música y SFX completado", Boolean(b64));
fs.writeFileSync(OUT, Buffer.from(b64 || "", "base64"));

const probe = JSON.parse(execFileSync("ffprobe", [
  "-v", "quiet", "-print_format", "json", "-show_streams", "-show_format", OUT,
], { encoding: "utf8" }));
const audioStream = probe.streams.find((stream) => stream.codec_type === "audio");
const duration = Number(probe.format.duration || 0);
ok("Short conserva 25s exactos", Math.abs(duration - 25) < 0.25, `(${duration.toFixed(2)}s)`);
ok("Master de audio exportado a 48 kHz", Number(audioStream?.sample_rate) === 48000, `(${audioStream?.sample_rate || "sin pista"} Hz)`);
const audioBitrate = Number(audioStream?.bit_rate || 0);
ok("Bitrate de audio apto para YouTube", audioBitrate >= 256000, `(${Math.round(audioBitrate / 1000)} kbps)`);

const silenceLog = execFileSync("bash", ["-c",
  `ffmpeg -loglevel info -i "$1" -af "silencedetect=noise=-55dB:d=0.08" -vn -f null - 2>&1`,
  "bash", OUT,
], { encoding: "utf8", maxBuffer: 8 * 1024 * 1024 });
const internalSilence = [...silenceLog.matchAll(/silence_start:\s*([\d.]+)/g)]
  .map((match) => Number(match[1]))
  .some((start) => start > 0.1 && start < 24.8);
ok("Sin cortes ni silencios internos en la música", !internalSilence);

function maxVolumeAt(start, length) {
  const log = execFileSync("bash", ["-c",
    `ffmpeg -loglevel info -ss "$1" -t "$2" -i "$3" -af volumedetect -vn -f null - 2>&1`,
    "bash", String(start), String(length), OUT,
  ], { encoding: "utf8", maxBuffer: 4 * 1024 * 1024 });
  return Number((log.match(/max_volume:\s*(-?[\d.]+) dB/) || [])[1]);
}
const baselineDb = maxVolumeAt(8, 0.7);
const impactDb = maxVolumeAt(10, 0.7);
ok("El SFX aparece en el segundo 10", impactDb > baselineDb + 2, `(base ${baselineDb} dB, impacto ${impactDb} dB)`);
ok("Sin errores de página", pageErrors.length === 0, pageErrors.slice(0, 3).join(" | "));

await browser.close();
const failed = results.filter((result) => !result).length;
console.log(failed === 0 ? "\n✅ TODO OK" : `\n❌ ${failed} pruebas fallaron`);
process.exit(failed === 0 ? 0 : 1);
