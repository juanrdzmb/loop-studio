/* E2E mixto de Edit Studio: imágenes + clip corto + vídeo largo con cortes internos.
 * Comprueba que el montaje asistido detecta los cortes internos (ninguna toma los
 * atraviesa), elige una duración razonable acotada por la canción, respeta el orden
 * narrativo mayoritario y exporta con Tinta/Viñetas/Profundidad/Whip a 1080x1920
 * con audio y sin frames negros. Requiere servidor en :3210. */
import { chromium } from "playwright-core";
import { execFileSync } from "node:child_process";
import fs from "node:fs";

const BASE = process.env.LOOP_STUDIO_URL || "http://localhost:3210";
const EXE = `${process.env.HOME}/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome`;
const WORK = "/tmp/opencode/loopstudio-edit-mixed-e2e";
fs.mkdirSync(WORK, { recursive: true });
const IMAGES = ["fija-a.jpg", "fija-b.jpg", "fija-c.jpg"].map((name) => `${WORK}/${name}`);
const SHORT = `${WORK}/corto.mp4`;
const LONG = `${WORK}/largo-escenas.mp4`;
const SCENE_SECONDS = 3;
const SCENES = ["0x8a1f4d", "0x1f6a8a", "0x5a8a1f"];
const SONG = `${WORK}/mixed-song.wav`;
const OUT = `${WORK}/edit-mixed.mp4`;
const IMAGE_COLORS = ["0x6a2f1f", "0x2f1f6a", "0x1f6a2f"];

for (let index = 0; index < IMAGES.length; index++) {
  execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-f", "lavfi", "-i", `color=c=${IMAGE_COLORS[index]}:s=1080x1920`, "-vf", `drawbox=x=${120 + index * 180}:y=${260 + index * 240}:w=300:h=560:color=white:t=20`, "-frames:v", "1", IMAGES[index]]);
}
execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-f", "lavfi", "-i", "color=c=0x9a6a1f:s=1080x1920:d=1.2:r=30", "-vf", "drawbox=x=420:y=760:w=240:h=400:color=white:t=16", "-pix_fmt", "yuv420p", SHORT]);
const sceneInputs = SCENES.map((color) => ["-f", "lavfi", "-i", `color=c=${color}:s=1080x1920:d=${SCENE_SECONDS}:r=30`]).flat();
const sceneChain = SCENES.map((_, index) => `[${index}]drawbox=x=${180 + index * 160}:y=${300 + index * 300}:w=320:h=600:color=white:t=18[p${index}];`).join("")
  + "[p0][p1][p2]concat=n=3:v=1:a=0,format=yuv420p[v]";
execFileSync("ffmpeg", ["-y", "-loglevel", "error", ...sceneInputs, "-filter_complex", sceneChain, "-map", "[v]", LONG]);
execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-f", "lavfi", "-i", "sine=frequency=220:sample_rate=48000:duration=14", SONG]);

const browser = await chromium.launch({
  executablePath: fs.existsSync(EXE) ? EXE : undefined,
  args: ["--no-sandbox", "--disable-dev-shm-usage", "--use-gl=swiftshader", "--enable-unsafe-swiftshader"],
});
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
const errors = [];
page.on("pageerror", (error) => errors.push(error.message));
await page.goto(`${BASE}/edit-studio`, { waitUntil: "networkidle" });

// 1. Importar mezcla intercalada: imagen, corto, imagen, largo, imagen.
// Tras importar, la página salta a la pestaña Montaje: esperar por "attached"
// y por el recuento de tomas, no por visibilidad de la lista de medios.
await page.getByRole("button", { name: /^Medios$/ }).click();
await page.locator('label:has-text("+ Importar") input[type="file"]').setInputFiles([IMAGES[0], SHORT, IMAGES[1], LONG, IMAGES[2]]);
await page.getByText("largo-escenas.mp4", { exact: true }).waitFor({ state: "attached", timeout: 90_000 });
await page.waitForFunction(() => document.querySelectorAll('[data-testid="edit-timeline-clip"]').length === 5, undefined, { timeout: 90_000 });
await page.getByRole("button", { name: /^Medios$/ }).click();
await page.locator('label:has-text("Seleccionar canción") input[type="file"]').setInputFiles(SONG);
await page.getByText("mixed-song.wav", { exact: true }).waitFor({ state: "attached", timeout: 60_000 });

// 2. Crear el borrador asistido.
await page.getByRole("button", { name: /^Montaje$/ }).click();
const before = await page.evaluate(() => localStorage.getItem("loop-studio:edit-project:v1"));
if (!before) throw new Error("El proyecto inicial no se guardó");
await page.getByTestId("edit-assist-start").click();
await page.getByTestId("edit-assist-review").waitFor({ timeout: 120_000 });
if (await page.getByTestId("edit-assist-preset").locator("option").count() !== 6) {
  throw new Error("El asistente no ofrece las seis gramáticas de montaje");
}
if (await page.evaluate(() => localStorage.getItem("loop-studio:edit-project:v1")) !== before) {
  throw new Error("El análisis mixto modificó el proyecto antes de aceptar el borrador");
}
await page.getByText("Vista borrador", { exact: true }).waitFor();
const draftClipCount = await page.getByTestId("edit-timeline-clip").count();
if (draftClipCount < 4) throw new Error(`El borrador mixto generó pocas tomas (${draftClipCount})`);

// 3. Aplicar y validar la estructura contra los cortes internos del vídeo largo.
await page.getByTestId("edit-assist-accept").click();
await page.waitForFunction((previous) => localStorage.getItem("loop-studio:edit-project:v1") !== previous, before);
const project = JSON.parse(await page.evaluate(() => localStorage.getItem("loop-studio:edit-project:v1")));
const manifest = JSON.parse(await page.evaluate(() => localStorage.getItem("loop-studio:edit-assets:v1") ?? "[]"));
if (!project.clips.every((clip) => clip.id.startsWith("assist-"))) throw new Error("La timeline aplicada no procede del asistente");
if (project.textCues.length !== 0) throw new Error("El asistente inventó texto que el usuario no escribió");

const timelineSeconds = project.clips.reduce((total, clip) => total + clip.duration, 0);
if (timelineSeconds < 9.5 || timelineSeconds > 14.2) {
  throw new Error(`Duración del montaje fuera de rango razonable: ${timelineSeconds.toFixed(2)}s`);
}

const longAsset = manifest.find((asset) => asset.name === "largo-escenas.mp4");
if (!longAsset) throw new Error("El manifiesto no registró el vídeo largo");
const longClips = project.clips.filter((clip) => clip.assetId === longAsset.id);
if (longClips.length < 1) throw new Error("El borrador no usó ninguna toma del vídeo largo");
for (const clip of longClips) {
  const start = clip.sourceStart;
  const end = clip.sourceStart + clip.sourceDuration;
  const sceneIndex = Math.floor((start + end) / 2 / SCENE_SECONDS);
  const sceneStart = sceneIndex * SCENE_SECONDS;
  const sceneEnd = sceneStart + SCENE_SECONDS;
  if (sceneIndex < 0 || sceneIndex >= SCENES.length || start < sceneStart - 0.06 || end > sceneEnd + 0.06) {
    throw new Error(`La toma ${clip.label} atraviesa un corte interno: ${start.toFixed(2)}–${end.toFixed(2)}s`);
  }
}

const importOrder = new Map(manifest.map((asset, index) => [asset.id, index]));
let inversions = 0;
let previousIndex = -1;
for (const clip of project.clips) {
  const index = importOrder.get(clip.assetId);
  if (index === undefined) throw new Error(`La toma ${clip.label} referencia un medio sin manifiesto`);
  if (index < previousIndex) inversions++;
  previousIndex = index;
}
if (inversions > 2) throw new Error(`Orden narrativo con demasiadas inversiones: ${inversions}`);

// 4. Cubrir las cuatro transiciones nuevas sobre las primeras tomas.
const transitionPlan = [
  { index: 0, name: /^● Tinta/ },
  { index: 1, name: /^▥ Viñetas/ },
  { index: 2, name: /^◫ Profundidad/ },
  { index: 3, name: /^💨 Whip/ },
];
await page.getByTestId("edit-timeline-clip").nth(0).click();
await page.getByText("Transición, cámara y fuente", { exact: true }).click();
for (const step of transitionPlan) {
  await page.getByTestId("edit-timeline-clip").nth(step.index).click();
  await page.getByRole("button", { name: step.name }).click();
  await page.waitForTimeout(60);
}

// 5. Exportar y validar el MP4: 1080x1920, audio, duración y cero frames negros.
await page.getByRole("button", { name: /^Acabado$/ }).click();
await page.getByRole("button", { name: "EXPORTAR EDIT" }).click();
await page.getByText("Descargar de nuevo").waitFor({ timeout: 300_000 });
const b64 = await page.evaluate(async () => {
  const anchor = Array.from(document.querySelectorAll("a")).find((item) => item.textContent?.includes("Descargar de nuevo"));
  const response = await fetch(anchor.href);
  const bytes = new Uint8Array(await response.arrayBuffer());
  let binary = "";
  for (let index = 0; index < bytes.length; index += 0x8000) binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
  return btoa(binary);
});
fs.writeFileSync(OUT, Buffer.from(b64, "base64"));
const probe = JSON.parse(execFileSync("ffprobe", ["-v", "quiet", "-print_format", "json", "-show_streams", "-show_format", OUT]));
const video = probe.streams.find((stream) => stream.codec_type === "video");
if (video.width !== 1080 || video.height !== 1920) throw new Error(`Resolución inesperada ${video.width}x${video.height}`);
if (!probe.streams.some((stream) => stream.codec_type === "audio")) throw new Error("El edit mixto salió sin audio");
const outputSeconds = Number(probe.format.duration);
if (Math.abs(outputSeconds - timelineSeconds) > 0.6) {
  throw new Error(`Duración exportada ${outputSeconds.toFixed(2)}s != timeline ${timelineSeconds.toFixed(2)}s`);
}
const blackOut = execFileSync("bash", ["-c",
  `ffmpeg -loglevel info -i "$1" -vf "blackdetect=d=0.10:pix_th=0.10" -an -f null - 2>&1`,
  "bash", OUT,
], { encoding: "utf8", maxBuffer: 32 * 1024 * 1024 });
const blackHits = blackOut.match(/black_start:\s*[\d.]+\s*black_end:\s*[\d.]+\s*black_duration:\s*[\d.]+/g) || [];
if (blackHits.length) throw new Error(`Frames negros en el export: ${blackHits.slice(0, 2).join(" | ")}`);
if (errors.length) throw new Error(errors.join(" | "));

console.log(`✓ Edit Studio mixto: ${draftClipCount} tomas, ${longClips.length} del vídeo largo sin cruzar cortes, ${timelineSeconds.toFixed(1)}s, export ${outputSeconds.toFixed(1)}s sin frames negros`);
await browser.close();
