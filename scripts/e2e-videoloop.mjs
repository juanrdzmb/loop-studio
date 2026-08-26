/* E2E: pestaña Video + Canción con companion (PyMusicLooper + LoopyCut) */
import { chromium } from "playwright-core";
import fs from "node:fs";
import { execSync } from "node:child_process";

const EXE = `${process.env.HOME}/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome`;
const BASE = "http://localhost:3100";
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

await page.goto(BASE + "/video-loop", { waitUntil: "networkidle" });
await page.waitForSelector("text=Companion activo", { timeout: 10000 });
ok("Badge de companion activo", true);

// 1) Video + análisis LoopyCut
await page.setInputFiles('input[type=file]', `${MEDIA}/sample.mp4`);
await page.click('button:has-text("Detectar loops automáticos")');
await page.waitForSelector("text=Calidad", { timeout: 120000 });
const vidCands = await page.locator("button:has-text('Calidad')").count();
ok("Candidatos de video (LoopyCut)", vidCands > 0, `(${vidCands})`);
await page.locator("button:has-text('Calidad')").first().click();

// 2) Canción + análisis PyMusicLooper
await page.setInputFiles('input[type=file]', `${MEDIA}/testsong.mp3`);
await page.waitForSelector("button:has-text('Detectar loops (PyMusicLooper)')", { timeout: 15000 });
await page.click('button:has-text("Detectar loops (PyMusicLooper)")');
await page.waitForSelector("text=Score", { timeout: 180000 });
const audCands = await page.locator("button:has-text('Score')").count();
ok("Candidatos de música (PyMusicLooper)", audCands > 0, `(${audCands})`);
await page.locator("button:has-text('Score')").first().click();

// 3) Modo crossfade + repeat
await page.click('button:has-text("Crossfade")');
await page.waitForSelector("text=Fundido:", { timeout: 5000 });
ok("Selector de modos visible", true);

// 4) Preview conjunto anima
await page.waitForSelector("text=/Video en loop/", { timeout: 30000 });
await page.click('button:has-text("▶ Reproducir juntos")');
await page.waitForTimeout(900);
const h1 = await page.evaluate(() => {
  const cs = document.querySelectorAll("canvas");
  const c = cs[cs.length - 1]; // canvas del preview (el primero es la waveform)
  const d = c.getContext("2d").getImageData(0, 0, c.width, c.height).data;
  let s = 0;
  for (let i = 0; i < d.length; i += 997) s += d[i];
  return s;
});
await page.waitForTimeout(600);
const h2 = await page.evaluate(() => {
  const cs = document.querySelectorAll("canvas");
  const c = cs[cs.length - 1];
  const d = c.getContext("2d").getImageData(0, 0, c.width, c.height).data;
  let s = 0;
  for (let i = 0; i < d.length; i += 997) s += d[i];
  return s;
});
ok("Preview conjunto anima", h1 !== h2);

// 5) Generar MP4 y verificar
await page.click('button:has-text("⏹ Detener")');
await page.click('button:has-text("Generar MP4")');
await page.waitForSelector("text=Loop perfecto listo", { timeout: 300000 });
ok("MP4 renderizado por el companion", true);

const [dl] = await Promise.all([
  page.waitForEvent("download", { timeout: 30000 }),
  page.click('button:has-text("Descargar MP4")'),
]);
const mp4 = `${MEDIA}/out-final-videoloop.mp4`;
await dl.saveAs(mp4);
ok("MP4 descargado", fs.statSync(mp4).size > 100000);

const probe = execSync(
  `ffprobe -v error -show_entries stream=codec_name -show_entries format=duration -of compact "${mp4}"`
).toString();
const durMatch = probe.match(/duration=([\d.]+)/);
const dur = durMatch ? parseFloat(durMatch[1]) : 0;
ok(
  "MP4 válido (h264 + aac, duración 10-30s)",
  probe.includes("h264") && probe.includes("aac") && dur >= 10 && dur <= 30,
  probe.replace(/\n/g, " ").trim().slice(0, 60)
);

await page.screenshot({ path: `${MEDIA}/videoloop.png` });
await browser.close();

const failed = results.filter((r) => !r).length;
console.log(`\n${results.length - failed}/${results.length} pruebas pasaron`);
process.exit(failed ? 1 : 0);
