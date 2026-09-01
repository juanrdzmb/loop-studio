/* E2E de reconexión: un reload pierde los File runtime, pero conserva
 * timeline/IDs y permite recuperar los medios en una selección masiva o
 * subiendo una carpeta completa. Quitar un medio pendiente elimina sus
 * tomas y libera el bloqueo de export. */
import { chromium } from "playwright-core";
import { execFileSync } from "node:child_process";
import fs from "node:fs";

const BASE = process.env.LOOP_STUDIO_URL || "http://localhost:3210";
const EXE = `${process.env.HOME}/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome`;
const WORK = "/tmp/opencode/loopstudio-edit-relink-e2e";
fs.mkdirSync(WORK, { recursive: true });
const FILES = ["panel-uno.jpg", "panel-dos.jpg"].map((name) => `${WORK}/${name}`);
execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-f", "lavfi", "-i", "color=c=0x51214f:s=1080x1920", "-frames:v", "1", FILES[0]]);
execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-f", "lavfi", "-i", "color=c=0x173e50:s=1080x1920", "-frames:v", "1", FILES[1]]);

const browser = await chromium.launch({
  executablePath: fs.existsSync(EXE) ? EXE : undefined,
  args: ["--no-sandbox", "--disable-dev-shm-usage", "--use-gl=swiftshader", "--enable-unsafe-swiftshader"],
});
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
page.on("pageerror", (error) => errors.push(error.message));
await page.goto(`${BASE}/edit-studio`, { waitUntil: "networkidle" });
await page.getByRole("button", { name: /^Medios$/ }).click();
await page.locator('label:has-text("+ Importar") input[type="file"]').setInputFiles(FILES);
await page.getByRole("button", { name: /^Medios$/ }).click();
await page.getByText("panel-dos.jpg", { exact: true }).waitFor();
const before = await page.evaluate(() => localStorage.getItem("loop-studio:edit-project:v1"));
const manifest = await page.evaluate(() => localStorage.getItem("loop-studio:edit-assets:v1"));
if (!before || !manifest || JSON.parse(manifest).length !== 2) throw new Error("No se persistió el manifiesto de medios");

await page.reload({ waitUntil: "networkidle" });
await page.getByRole("button", { name: /^Medios$/ }).click();
await page.getByText(/Pendiente · se conserva su ID/).first().waitFor();
await page.locator('label:has-text("Reconectar 2") input[type="file"]').setInputFiles(FILES);
await page.waitForFunction(() => !document.body.textContent?.includes("Pendiente · se conserva su ID"));
const after = await page.evaluate(() => localStorage.getItem("loop-studio:edit-project:v1"));
if (after !== before) throw new Error("Reconectar cambió la estructura o los IDs de la timeline");
if (await page.getByTestId("edit-timeline-clip").count() !== 2) throw new Error("Reconectar duplicó o eliminó tomas");
if (errors.length) throw new Error(errors.join(" | "));

// Fase 2: reconectar subiendo una CARPETA completa (con archivos ajenos dentro).
const FOLDER = `${WORK}/carpeta-proyecto`;
fs.mkdirSync(FOLDER, { recursive: true });
fs.copyFileSync(FILES[0], `${FOLDER}/panel-uno.jpg`);
fs.copyFileSync(FILES[1], `${FOLDER}/panel-dos.jpg`);
fs.writeFileSync(`${FOLDER}/notas-leeme.txt`, "no es medio");
await page.reload({ waitUntil: "networkidle" });
await page.getByRole("button", { name: /^Medios$/ }).click();
await page.getByText(/Pendiente · se conserva su ID/).first().waitFor();
await page.locator('label:has-text("+ Carpeta") input[type="file"]').setInputFiles(FOLDER);
await page.waitForFunction(() => !document.body.textContent?.includes("Pendiente · se conserva su ID"), undefined, { timeout: 30_000 });
const viaFolder = await page.evaluate(() => localStorage.getItem("loop-studio:edit-project:v1"));
if (viaFolder !== before) throw new Error("Reconectar por carpeta cambió la estructura o los IDs de la timeline");
if (await page.getByTestId("edit-timeline-clip").count() !== 2) throw new Error("Reconectar por carpeta duplicó o eliminó tomas");
if (errors.length) throw new Error(errors.join(" | "));

// Fase 3: quitar medios pendientes con × libera el bloqueo de export.
await page.reload({ waitUntil: "networkidle" });
await page.getByRole("button", { name: /^Medios$/ }).click();
await page.getByText(/Pendiente · se conserva su ID/).first().waitFor();
let bodyText = await page.evaluate(() => document.body.textContent ?? "");
if (!bodyText.includes("antes de exportar")) throw new Error("El bloqueo de export por medios pendientes no aparece");
await page.getByRole("button", { name: "Quitar panel-uno.jpg" }).click();
await page.waitForFunction(() => !document.body.textContent?.includes("panel-uno.jpg"));
if (await page.getByTestId("edit-timeline-clip").count() !== 1) throw new Error("Quitar un medio pendiente no eliminó exactamente su toma");
await page.getByRole("button", { name: "Quitar panel-dos.jpg" }).click();
await page.waitForFunction(() => !document.body.textContent?.includes("antes de exportar"));
bodyText = await page.evaluate(() => document.body.textContent ?? "");
if (bodyText.includes("Reconectar 1") || bodyText.includes("Reconectar 2")) throw new Error("Siguen apareciendo pendientes tras quitarlos");
if (await page.getByTestId("edit-timeline-clip").count() !== 0) throw new Error("Quitar ambos pendientes debería dejar la timeline vacía");
if (errors.length) throw new Error(errors.join(" | "));

console.log("✓ Edit Studio: reconexión masiva y por carpeta conserva IDs; quitar pendientes desbloquea");
await browser.close();
