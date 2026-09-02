/* E2E del camino principal de Edit Studio: multiclip, ritmo, preview, atmósfera,
 * texto, audio y export. Requiere servidor en :3210. */
import { chromium } from "playwright-core";
import { execFileSync } from "node:child_process";
import fs from "node:fs";

const BASE = process.env.LOOP_STUDIO_URL || "http://localhost:3210";
const EXE = `${process.env.HOME}/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome`;
const WORK = "/tmp/opencode/loopstudio-edit-e2e";
fs.mkdirSync(WORK, { recursive: true });
const A = `${WORK}/plano-a.jpg`;
const B = `${WORK}/plano-b.jpg`;
const SONG = `${WORK}/edit-song.wav`;
const OUT = `${WORK}/edit-studio.mp4`;
execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-f", "lavfi", "-i", "color=c=0x3b143f:s=1080x1920", "-frames:v", "1", A]);
execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-f", "lavfi", "-i", "color=c=0x102f42:s=1080x1920", "-frames:v", "1", B]);
execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-f", "lavfi", "-i", "sine=frequency=220:sample_rate=48000:duration=4", SONG]);

const browser = await chromium.launch({
  executablePath: fs.existsSync(EXE) ? EXE : undefined,
  args: ["--no-sandbox", "--disable-dev-shm-usage", "--use-gl=swiftshader", "--enable-unsafe-swiftshader"],
});
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
const errors = [];
page.on("pageerror", (error) => errors.push(error.message));
await page.goto(`${BASE}/edit-studio`, { waitUntil: "networkidle" });
const guideFontSize = await page.getByText("La canción permite detectar BPM, golpes y el mejor tramo. También puedes montar solo con imagen.", { exact: true }).evaluate((element) => Number.parseFloat(getComputedStyle(element).fontSize));
if (guideFontSize < 14) throw new Error(`La guía sigue siendo demasiado pequeña (${guideFontSize}px)`);
await page.getByRole("button", { name: /^Medios$/ }).click();
await page.locator('label:has-text("+ Importar") input[type="file"]').setInputFiles([A, B]);
await page.getByTestId("edit-timeline-clip").nth(1).waitFor();
await page.getByTestId("edit-grammar-manga").click();
await page.screenshot({ path: `${WORK}/montage.png`, fullPage: false });
await page.getByText("Ajustar ritmo manualmente", { exact: true }).click();
await page.getByRole("button", { name: "Referencia 18 s" }).click();
await page.getByRole("button", { name: "▶ PLAY" }).click();
await page.getByRole("button", { name: "❚❚ PAUSA" }).waitFor();
await page.getByRole("button", { name: "❚❚ PAUSA" }).click();

const [previewBox, timelineBox] = await Promise.all([
  page.getByTestId("edit-preview-canvas").boundingBox(),
  page.getByTestId("edit-timeline-heading").boundingBox(),
]);
if (!previewBox || !timelineBox || previewBox.y < 0 || timelineBox.y < 0 || timelineBox.y > 1000) {
  throw new Error("Preview y timeline no permanecen visibles en el workspace de escritorio");
}
await page.getByTestId("edit-timeline-clip").nth(1).click();
await page.getByText("Transición, cámara y fuente", { exact: true }).click();
await page.getByRole("button", { name: /^● Tinta/ }).click();
await page.waitForTimeout(80);
await page.getByRole("button", { name: /^▥ Viñetas/ }).click();
await page.waitForTimeout(80);
await page.getByRole("button", { name: /^◫ Profundidad/ }).click();
await page.getByRole("button", { name: "Parallax 2.5D", exact: true }).click();
await page.getByLabel("Fuerza de transición").fill("72");
await page.screenshot({ path: `${WORK}/workspace.png`, fullPage: false });

const inspectorScroll = page.getByTestId("edit-inspector-scroll");
await inspectorScroll.evaluate((element) => { element.scrollTop = element.scrollHeight; });
await page.getByRole("button", { name: /^Acabado$/ }).click();
const finishScrollTop = await inspectorScroll.evaluate((element) => element.scrollTop);
if (finishScrollTop > 1) throw new Error(`Acabado abrió a mitad del inspector (${finishScrollTop}px)`);
await page.getByTestId("edit-finish-ink").click();
await page.screenshot({ path: `${WORK}/finish.png`, fullPage: false });
await page.getByText("05 / Atmósfera").click();
await page.locator("details").filter({ hasText: "05 / Atmósfera" }).locator("select").first().selectOption("cinematic_dust");
await page.getByText("06 / Textos y firma").click();
await page.getByRole("button", { name: "+ Texto en el cabezal" }).click();
await page.getByRole("button", { name: /^Medios$/ }).click();
await page.locator('label:has-text("Seleccionar canción") input[type="file"]').setInputFiles(SONG);
await page.getByText("edit-song.wav", { exact: true }).waitFor();

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
if (!probe.streams.some((stream) => stream.codec_type === "audio")) throw new Error("El edit salió sin audio");
if (errors.length) throw new Error(errors.join(" | "));

const mobile = await browser.newPage({ viewport: { width: 390, height: 844 } });
await mobile.goto(`${BASE}/edit-studio`, { waitUntil: "networkidle" });
if (await mobile.getByTestId("edit-preview-stage").evaluate((element) => getComputedStyle(element).position) !== "sticky") {
  throw new Error("El preview móvil no conserva su posición sticky");
}
const mobileOverflow = await mobile.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
if (mobileOverflow > 2) throw new Error(`Edit Studio desborda ${mobileOverflow}px en móvil`);
await mobile.screenshot({ path: `${WORK}/mobile.png`, fullPage: false });
await mobile.close();

await browser.close();
fs.rmSync(WORK, { recursive: true, force: true });
console.log(`✓ Edit Studio: multiclip, beat, play/pausa, partículas, texto, audio y export ${probe.format.duration}s`);
