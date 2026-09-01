/* E2E del montaje asistido: análisis local, borrador reversible, comparación y aplicación.
 * Requiere servidor en :3210. */
import { chromium } from "playwright-core";
import { execFileSync } from "node:child_process";
import fs from "node:fs";

const BASE = process.env.LOOP_STUDIO_URL || "http://localhost:3210";
const EXE = `${process.env.HOME}/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome`;
const WORK = "/tmp/opencode/loopstudio-edit-assist-e2e";
fs.mkdirSync(WORK, { recursive: true });
const IMAGES = ["plano-a.jpg", "plano-b.jpg", "plano-c.jpg"].map((name) => `${WORK}/${name}`);
const COLORS = ["0x35143f", "0x10364a", "0x5a3012"];
const SONG = `${WORK}/assist-song.wav`;
for (let index = 0; index < IMAGES.length; index++) {
  execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-f", "lavfi", "-i", `color=c=${COLORS[index]}:s=1080x1920`, "-vf", `drawbox=x=${150 + index * 170}:y=${300 + index * 220}:w=260:h=520:color=white:t=18`, "-frames:v", "1", IMAGES[index]]);
}
execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-f", "lavfi", "-i", "sine=frequency=220:sample_rate=48000:duration=35", SONG]);

const browser = await chromium.launch({
  executablePath: fs.existsSync(EXE) ? EXE : undefined,
  args: ["--no-sandbox", "--disable-dev-shm-usage", "--use-gl=swiftshader", "--enable-unsafe-swiftshader"],
});
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
const errors = [];
page.on("pageerror", (error) => errors.push(error.message));
await page.goto(`${BASE}/edit-studio`, { waitUntil: "networkidle" });
await page.getByRole("button", { name: /^Medios$/ }).click();
await page.locator('label:has-text("+ Importar") input[type="file"]').setInputFiles(IMAGES);
await page.getByRole("button", { name: /^Medios$/ }).click();
await page.getByText("plano-c.jpg", { exact: true }).waitFor();
await page.locator('label:has-text("Seleccionar canción") input[type="file"]').setInputFiles(SONG);
await page.getByText("assist-song.wav", { exact: true }).waitFor();
await page.waitForTimeout(100);
await page.getByRole("button", { name: /^Montaje$/ }).click();

const before = await page.evaluate(() => localStorage.getItem("loop-studio:edit-project:v1"));
if (!before) throw new Error("El proyecto inicial no se guardó");
await page.getByTestId("edit-assist-start").click();
await page.getByTestId("edit-assist-review").waitFor({ timeout: 30_000 });
if (await page.getByTestId("edit-assist-preset").locator("option").count() !== 6) {
  throw new Error("El asistente no ofrece las seis gramáticas de montaje");
}
if (await page.evaluate(() => localStorage.getItem("loop-studio:edit-project:v1")) !== before) {
  throw new Error("El análisis modificó el proyecto antes de aceptar el borrador");
}
await page.getByText("Vista borrador", { exact: true }).waitFor();
const draftClipCount = await page.getByTestId("edit-timeline-clip").count();
await page.getByTestId("edit-timeline-clip").first().click();
await page.getByLabel("Nombre de toma").fill("BORRADOR EDITABLE");
await page.getByRole("button", { name: /^Montaje$/ }).click();
await page.getByTestId("edit-assist-preview-current").click();
await page.getByText("Vista borrador", { exact: true }).waitFor({ state: "hidden" });
if (await page.getByTestId("edit-timeline-clip").count() !== JSON.parse(before).clips.length) {
  throw new Error("La timeline Actual no coincide con el proyecto persistido");
}
if ((await page.getByTestId("edit-timeline-clip").first().textContent())?.includes("BORRADOR EDITABLE")) {
  throw new Error("Una edición del borrador contaminó la vista Actual");
}
await page.getByTestId("edit-assist-preview-draft").click();
await page.getByText("Vista borrador", { exact: true }).waitFor();
if (await page.getByTestId("edit-timeline-clip").count() !== draftClipCount) {
  throw new Error("La timeline Borrador no coincide con el canvas del borrador");
}
if (!(await page.getByTestId("edit-timeline-clip").first().textContent())?.includes("BORRADOR EDITABLE")) {
  throw new Error("El inspector no editó la timeline activa del borrador");
}
const selectedPreset = await page.getByTestId("edit-assist-preset").inputValue();
await page.getByTestId("edit-assist-preset").selectOption(selectedPreset === "hypnoticPortrait" ? "flashStorm" : "hypnoticPortrait");
await page.getByTestId("edit-assist-discard").click();
if (await page.evaluate(() => localStorage.getItem("loop-studio:edit-project:v1")) !== before) {
  throw new Error("Descartar el borrador alteró el proyecto actual");
}

await page.getByTestId("edit-assist-start").click();
await page.getByTestId("edit-assist-review").waitFor({ timeout: 30_000 });
await page.getByTestId("edit-assist-accept").click();
await page.waitForFunction((previous) => localStorage.getItem("loop-studio:edit-project:v1") !== previous, before);
const after = JSON.parse(await page.evaluate(() => localStorage.getItem("loop-studio:edit-project:v1")));
const initial = JSON.parse(before);
if (after.clips.length <= initial.clips.length) throw new Error("El borrador aplicado no creó la estructura de montaje");
if (!after.clips.every((clip) => clip.id.startsWith("assist-"))) throw new Error("La timeline aplicada no procede del asistente");
if (after.textCues.length !== 0) throw new Error("El asistente inventó texto que el usuario no escribió");
const appliedSfx = JSON.parse(await page.evaluate(() => localStorage.getItem("loop-studio:edit-sfx:v1") || "[]"));
if (appliedSfx.length < 1 || appliedSfx.length > 3) throw new Error("Las sugerencias de SFX no se aplicaron de forma contenida");
if (errors.length) throw new Error(errors.join(" | "));

console.log(`✓ Montaje asistido: borrador reversible, comparación, alternativa y aplicación (${after.clips.length} tomas)`);
await browser.close();
