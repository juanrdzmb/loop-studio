/* E2E: selección LoopyCut conectada a la exportación.
 * El source contiene dos ciclos iguales de 4s y una cola roja de 1s. El companion
 * debe elegir el ciclo natural (~4.6s) y el MP4 final no debe incluir la cola roja. */
import { chromium } from "playwright-core";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

const EXE = `${process.env.HOME}/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome`;
const BASE = process.env.LOOP_STUDIO_URL || "http://localhost:3210";
const WORK = "/tmp/opencode/loopstudio-e2e";
fs.mkdirSync(WORK, { recursive: true });
const BASE_CYCLE = path.join(WORK, "loopycut_base.mp4");
const SOURCE = path.join(WORK, "loopycut_two_cycles_red_tail.mp4");
const OUT = path.join(WORK, "loopycut_auto_export.mp4");

try {
  const health = await fetch("http://127.0.0.1:8787/health");
  if (!health.ok) throw new Error(String(health.status));
} catch {
  console.error("FAIL companion no disponible en :8787 (arranca ./iniciar.sh o companion/start.sh)");
  process.exit(1);
}

if (!fs.existsSync(BASE_CYCLE)) {
  execFileSync("ffmpeg", [
    "-y", "-loglevel", "error",
    "-f", "lavfi", "-i", "testsrc2=size=1920x1080:rate=24:duration=4",
    "-c:v", "libx264", "-preset", "fast", "-crf", "18", "-pix_fmt", "yuv420p",
    BASE_CYCLE,
  ]);
}
if (!fs.existsSync(SOURCE)) {
  execFileSync("ffmpeg", [
    "-y", "-loglevel", "error",
    "-i", BASE_CYCLE, "-i", BASE_CYCLE,
    "-f", "lavfi", "-i", "color=c=red:size=1920x1080:rate=24:duration=1",
    "-filter_complex", "[0:v][1:v][2:v]concat=n=3:v=1:a=0[v]",
    "-map", "[v]", "-c:v", "libx264", "-preset", "fast", "-crf", "18", "-pix_fmt", "yuv420p",
    SOURCE,
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

await page.goto(`${BASE}/dual-studio`, { waitUntil: "networkidle" });
await page.locator('input[type="file"]').nth(0).setInputFiles(SOURCE);
const loopCard = page.getByTestId("visual-loop-16x9");
// Esperar a que la metadata del clip cargue y la tarjeta muestre la selección
// inicial ("9.0s seleccionados" viene de visualLoop16, creado en loadedmetadata):
// si se activa Natural antes, enableNaturalLoop no encuentra clip completo y no
// llega a pedir el análisis al companion.
await page.waitForFunction(
  () => {
    const card = document.querySelector('[data-testid="visual-loop-16x9"]');
    return Boolean(card?.textContent?.includes("seleccionados"));
  },
  null,
  { timeout: 30000 }
);
await loopCard.getByLabel("Modo de continuidad 16:9").selectOption("smooth");
await page.waitForFunction(
  () => {
    const card = document.querySelector('[data-testid="visual-loop-16x9"]');
    // "Buscando una unión natural…" es el estado de análisis activo: la tarjeta
    // ya muestra el clip completo mientras tanto, así que esperar solo a
    // "seleccionados" leería el fallback antes de que responda el companion.
    return Boolean(card?.textContent?.includes("seleccionados") && !card.textContent.includes("Buscando una unión natural"));
  },
  null,
  { timeout: 30000 }
);
const cardText = await loopCard.innerText();
const durationMatch = cardText.match(/([\d.]+)s seleccionados/);
const selectedDuration = Number(durationMatch?.[1] || 0);
ok("LoopyCut elige el ciclo detectado, no el clip completo", selectedDuration > 3.5 && selectedDuration < 5.5, `(${selectedDuration}s de 9s)`);

await page.getByText("Ajustes visuales y estabilización").click();
await page.getByLabel("Filtro visual 16:9").selectOption("original");
await page.getByLabel("Cámara 2.5D 16:9").selectOption("static");
await page.getByLabel("Partículas 16:9").selectOption("none");
ok("El modo automático nunca activa boomerang", await page.getByLabel("Modo de continuidad 16:9").inputValue() === "smooth");
await page.locator('input[type="checkbox"]').first().uncheck({ force: true });
await page.getByRole("button", { name: "30s", exact: true }).first().click();

await page.getByRole("button", { name: /Exportar Solo 16:9/ }).click();
await page.getByText("Confirma tu exportación").waitFor();
await page.getByRole("button", { name: /Sí, exportar ahora/ }).click();
const download = page.locator('a[download^="loop_16x9"]');
await download.waitFor({ timeout: 300000 });
const b64 = await page.evaluate(async () => {
  const anchor = document.querySelector('a[download^="loop_16x9"]');
  if (!anchor) return null;
  const response = await fetch(anchor.getAttribute("href"));
  const bytes = new Uint8Array(await response.arrayBuffer());
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary);
});
ok("Export automático completado", Boolean(b64));
fs.writeFileSync(OUT, Buffer.from(b64 || "", "base64"));

const chroma = execFileSync("ffprobe", [
  "-v", "error", "-f", "lavfi",
  "-i", `movie=${OUT},signalstats`,
  "-show_entries", "frame_tags=lavfi.signalstats.VAVG",
  "-of", "csv=p=0",
], { encoding: "utf8", maxBuffer: 8 * 1024 * 1024 });
const maxV = Math.max(...chroma.trim().split(/\s+/).map(Number).filter(Number.isFinite));
ok("La exportación respeta sourceEnd y excluye la cola roja", maxV < 200, `(VAVG máximo ${maxV.toFixed(1)})`);

const blackLog = execFileSync("bash", ["-c",
  `ffmpeg -loglevel info -i "$1" -vf "blackdetect=d=0.02:pix_th=0.10" -an -f null - 2>&1`,
  "bash", OUT,
], { encoding: "utf8", maxBuffer: 16 * 1024 * 1024 });
const blackHits = blackLog.match(/black_start:/g) || [];
ok("Sin pantallazos negros en las costuras automáticas", blackHits.length === 0, `(${blackHits.length} detecciones)`);
ok("Sin errores de página", pageErrors.length === 0, pageErrors.slice(0, 3).join(" | "));

await browser.close();
const failed = results.filter((result) => !result).length;
console.log(failed === 0 ? "\n✅ TODO OK" : `\n❌ ${failed} pruebas fallaron`);
process.exit(failed === 0 ? 0 : 1);
