/* E2E: flujo completo GIF editado → Combinar sin re-edición → MP4 */
import { chromium } from "playwright-core";
import fs from "node:fs";
import { execSync } from "node:child_process";

const EXE = `${process.env.HOME}/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome`;
const BASE = process.env.LOOP_STUDIO_URL || "http://localhost:3000";
const MEDIA = "/tmp/opencode/loop-e2e";

const browser = await chromium.launch({
  executablePath: EXE,
  args: ["--no-sandbox", "--disable-dev-shm-usage"],
});
const results = [];
function ok(name, cond, extra = "") {
  results.push(cond);
  console.log(`${cond ? "PASS" : "FAIL"} ${name} ${extra}`);
}

const page = await browser.newPage();
page.on("pageerror", (e) => console.log("pageerror:", e.message));

// ---------- 1) GIF Studio: generar con estilo Game Boy ----------
await page.goto(BASE + "/", { waitUntil: "networkidle" });
await page.setInputFiles('input[type=file]', `${MEDIA}/sample.mp4`);
await page.waitForSelector("text=Preview exacto del GIF", { timeout: 15000 });
await page.click('button:has-text("Game Boy")');
// Esperar el ciclo completo: overlay de carga aparece y luego desaparece
await page.waitForSelector(".animate-pulse", { timeout: 10000 }).catch(() => {});
await page.waitForSelector(".animate-pulse", { state: "detached", timeout: 60000 });
await page.waitForTimeout(300);

// Preview exacto: el canvas debe medir lo mismo que el ancho del GIF (480)
const canvasW = await page.evaluate(() => {
  const c = document.querySelector("canvas");
  return c ? c.width : 0;
});
ok("Preview usa resolución EXACTA del GIF (480px)", canvasW === 480, `(${canvasW}px)`);

// El preview debe estar cuantizado: pocos colores, todos verde Game Boy
const colorStats = await page.evaluate(() => {
  const c = document.querySelector("canvas");
  const d = c.getContext("2d").getImageData(0, 0, c.width, c.height).data;
  const set = new Set();
  for (let i = 0; i < d.length; i += 4) set.add((d[i] << 16) | (d[i + 1] << 8) | d[i + 2]);
  let greenish = 0;
  for (const c16 of set) {
    const r = (c16 >> 16) & 255, g = (c16 >> 8) & 255, b = c16 & 255;
    if (g >= r && g >= b && r < 200) greenish++;
  }
  return { total: set.size, greenish };
});
ok(
  "Preview cuantizado a paleta Game Boy (verdes)",
  colorStats.total <= 16 && colorStats.greenish === colorStats.total,
  `(${colorStats.total} colores, ${colorStats.greenish} verdes)`
);

await page.click('button:has-text("✨ Generar GIF")');
await page.waitForSelector("text=GIF listo", { timeout: 120000 });
ok("GIF generado", true);

// ---------- 2) Navegación client-side a Combinar ----------
await page.click('a:has-text("Combinar con audio")');
await page.waitForSelector("text=Tu GIF ya editado ✓", { timeout: 10000 });
ok("Combinar muestra el GIF de la sesión", true);

const noReedit = await page.evaluate(() => !document.body.innerText.includes("Ajustes del loop"));
ok("NO pide re-editar (sin timeline ni estilos)", noReedit);

const label = await page.textContent("text=/480×480|480×\\d+ · \\d+ fps/");
ok("Etiqueta con ajustes exactos", !!label, label?.trim().slice(0, 50));

// ---------- 3) Audio + controles avanzados en vivo ----------
await page.setInputFiles('input[type=file]', `${MEDIA}/song.mp3`);
await page.waitForSelector("text=Escucha y ajusta el audio en vivo", { timeout: 20000 });
ok("Panel de audio en vivo aparece", true);

// Activar slowed + escuchar + mover bass en vivo
await page.check('input[type=checkbox]');
await page.click('button:has-text("▶ Escuchar audio")');
await page.waitForTimeout(900);
await page.locator('label:has-text("Bass boost") input[type=range]').fill("8");
await page.locator('label:has-text("Rotación 8D (velocidad)") input[type=range]').fill("0.2");
await page.waitForTimeout(400);
ok("Sliders avanzados (bass/8D) en vivo sin errores", true);
await page.click('button:has-text("⏸ Pausar audio")');

// ---------- 4) Preview conjunto con frames de sesión ----------
await page.waitForSelector("text=Previsualizar tu GIF + audio en tiempo real", { timeout: 15000 });
await page.click('button:has-text("▶ Reproducir juntos")');
await page.waitForTimeout(900);
const h1 = await page.evaluate(() => {
  const c = document.querySelector("canvas");
  const d = c.getContext("2d").getImageData(0, 0, c.width, c.height).data;
  let s = 0;
  for (let i = 0; i < d.length; i += 997) s += d[i];
  return s;
});
await page.waitForTimeout(600);
const h2 = await page.evaluate(() => {
  const c = document.querySelector("canvas");
  const d = c.getContext("2d").getImageData(0, 0, c.width, c.height).data;
  let s = 0;
  for (let i = 0; i < d.length; i += 997) s += d[i];
  return s;
});
ok("Preview conjunto anima con frames de sesión", h1 !== h2);

// ---------- 5) Generar MP4 y descargar ----------
await page.click('button:has-text("⏹ Detener")');
await page.click('button:has-text("🎬 Generar MP4")');
await page.waitForSelector("text=Video listo", { timeout: 180000 });
ok("MP4 compuesto desde el GIF de sesión", true);

const [dl] = await Promise.all([
  page.waitForEvent("download", { timeout: 30000 }),
  page.click('button:has-text("Descargar MP4")'),
]);
const mp4 = `${MEDIA}/out-session.mp4`;
await dl.saveAs(mp4);
const size = fs.statSync(mp4).size;
ok("MP4 descargado", size > 50000, `(${(size / 1024).toFixed(0)} KB)`);

// Verificar códecs y que el video es el GIF Game Boy (dimensiones 480x270)
const probe = execSync(
  `ffprobe -v error -select_streams v -show_entries stream=codec_name,width,height -of compact "${mp4}"`
).toString().trim();
ok(
  "MP4 válido (H.264 480px)",
  probe.includes("codec_name=h264") && probe.includes("width=480"),
  probe.split("\n")[0]
);

await page.screenshot({ path: `${MEDIA}/session-flow.png` });
await browser.close();

const failed = results.filter((r) => !r).length;
console.log(`\n${results.length - failed}/${results.length} pruebas pasaron`);
process.exit(failed ? 1 : 0);
