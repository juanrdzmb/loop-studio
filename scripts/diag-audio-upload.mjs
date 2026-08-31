/* Diagnóstico: bloqueo del hilo principal al subir canciones en /dual-studio.
 * No forma parte de la suite e2e: script de medición puntual. */
import { chromium } from "playwright-core";
import fs from "node:fs";
import { execFileSync } from "node:child_process";

const EXE = `${process.env.HOME}/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome`;
const BASE = process.env.LOOP_STUDIO_URL || "http://localhost:3210";
const WORK = "/tmp/opencode/loopstudio-e2e";
fs.mkdirSync(WORK, { recursive: true });

function ensureFixture(file, args) {
  if (!fs.existsSync(file)) execFileSync("ffmpeg", ["-y", "-loglevel", "error", ...args, file]);
}
const SONG = `${WORK}/song_normal_3m.mp3`;
const SONG_LONG = `${WORK}/song_long_30m.mp3`;
const SONG_WAV = `${WORK}/song_wav_20m.wav`;
const VIDEO = `${WORK}/video_5s.mp4`;
ensureFixture(SONG, ["-f", "lavfi", "-i", "aevalsrc=0.3*sin(440*2*PI*t)|0.3*sin(330*2*PI*t):s=44100:d=210", "-c:a", "libmp3lame", "-b:a", "192k"]);
ensureFixture(SONG_LONG, ["-f", "lavfi", "-i", "aevalsrc=0.3*sin(440*2*PI*t)|0.3*sin(330*2*PI*t):s=44100:d=1800", "-c:a", "libmp3lame", "-b:a", "192k"]);
ensureFixture(SONG_WAV, ["-f", "lavfi", "-i", "aevalsrc=0.3*sin(440*2*PI*t)|0.3*sin(330*2*PI*t):s=44100:d=1200"]);
ensureFixture(VIDEO, ["-f", "lavfi", "-i", "testsrc2=size=1280x720:rate=30:duration=5", "-c:v", "libx264", "-preset", "fast", "-crf", "20", "-pix_fmt", "yuv420p"]);

const scenarios = [
  { name: "MP3 3.5min", files: [SONG] },
  { name: "MP3 30min", files: [SONG_LONG] },
  { name: "WAV 20min", files: [SONG_WAV] },
  { name: "3x MP3 3.5min", files: [SONG, SONG, SONG] },
  { name: "full-session+MP3 3.5min", files: [SONG], withVideo: true, smooth: true, play: true, full: true },
];

const browser = await chromium.launch({
  executablePath: fs.existsSync(EXE) ? EXE : undefined,
  args: ["--no-sandbox", "--disable-dev-shm-usage", "--use-gl=swiftshader", "--enable-unsafe-swiftshader"],
});

const cdp = {};
async function newPage() {
  const context = await browser.newContext();
  const page = await context.newPage();
  page.on("crash", () => console.log("  !! PAGE CRASH"));
  page.on("pageerror", (e) => console.log("  pageerror:", e.message));
  cdp[page] = await context.newCDPSession(page);
  await cdp[page].send("Performance.enable");
  return page;
}
async function heapMB(page) {
  const { metrics } = await cdp[page].send("Performance.getMetrics");
  const js = metrics.find((m) => m.name === "JSHeapUsedSize")?.value ?? 0;
  return Math.round(js / 1048576);
}

for (const scenario of scenarios) {
  const page = await newPage();
  await page.goto(BASE + "/dual-studio", { waitUntil: "networkidle" });

  if (scenario.withVideo) {
    await page.locator('input[type="file"]').nth(0).setInputFiles(`${WORK}/video_5s.mp4`);
    await page.waitForFunction(() => !document.body.innerText.includes("cargando clip…"), null, { timeout: 45_000 });
    if (scenario.smooth) {
      await page.getByTestId("visual-loop-16x9").getByLabel("Modo de continuidad 16:9").selectOption("smooth");
      await page.waitForFunction(() => !document.body.innerText.includes("Buscando una unión natural"), null, { timeout: 20_000 }).catch(() => {});
    }
    if (scenario.full) {
      // Sesión completa: Short en el otro slot + filtro + cámara + partículas + estabilización activa
      await page.getByRole("button", { name: /📱 Short 9:16/ }).click();
      await page.locator('input[type="file"]').nth(0).setInputFiles(`${WORK}/video_5s.mp4`);
      await page.waitForFunction(() => !document.body.innerText.includes("cargando clip…"), null, { timeout: 45_000 });
      await page.getByRole("button", { name: "🖥️ Video 16:9" }).click();
      await page.getByText("Ajustes visuales y estabilización").first().click();
      await page.getByLabel("Filtro visual 16:9").selectOption("dark_fantasy");
      await page.getByLabel("Cámara 2.5D 16:9").selectOption("slow_push");
      await page.getByLabel("Partículas 16:9").selectOption("cinematic_dust");
    }
    if (scenario.play) {
      await page.locator('button:has-text("Reproducir")').first().click();
      await page.waitForTimeout(1500);
    }
  }

  // Sonda de bloqueo del hilo principal: cada 200 ms pedimos performance.now();
  // si la respuesta tarda, el hilo estuvo bloqueado ese tiempo como mínimo.
  let maxBlock = 0;
  let probing = true;
  (async () => {
    while (probing) {
      const t0 = Date.now();
      try { await page.evaluate(() => performance.now()); } catch { break; }
      const gap = Date.now() - t0;
      if (gap > maxBlock) maxBlock = gap;
      await new Promise((r) => setTimeout(r, 200));
    }
  })();

  const heapBefore = await heapMB(page);
  const t0 = Date.now();
  const labelLog = [];

  await page.getByLabel("Añadir canciones a la playlist").setInputFiles(scenario.files);

  // Esperar a que termine el procesado (el estado "Procesando…" desaparece) o timeout 120s
  let done = false;
  let stuckLabel = "";
  let lastLabel = "";
  const deadline = Date.now() + 120_000;
  while (Date.now() < deadline) {
    stuckLabel = await page.evaluate(() => {
      const el = document.querySelector('[aria-label="Playlist de canciones"] [role="status"]');
      return el ? el.textContent?.trim() ?? "" : "";
    });
    const visible = await page.evaluate(() => !!document.querySelector('[aria-label="Playlist de canciones"] [role="status"]'));
    if (stuckLabel && stuckLabel !== lastLabel) {
      lastLabel = stuckLabel;
      labelLog.push(`+${((Date.now() - t0) / 1000).toFixed(1)}s ${stuckLabel}`);
    }
    if (!visible) { done = true; break; }
    await new Promise((r) => setTimeout(r, 300));
  }
  probing = false;
  const elapsed = Date.now() - t0;
  const heapAfter = await heapMB(page);
  const tracks = await page.locator('[aria-label="Playlist de canciones"] article').count();
  console.log(
    `${scenario.name}: done=${done} total=${(elapsed / 1000).toFixed(1)}s maxBlock=${(maxBlock / 1000).toFixed(2)}s heap ${heapBefore}→${heapAfter}MB tracks=${tracks} labels=[${labelLog.join(" | ")}]`
  );
  await page.close();
}

await browser.close();

