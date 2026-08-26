/* E2E: Video + Canción (loops, atmósfera, preview 20s, render) */
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

await page.goto(BASE + "/video-loop", { waitUntil: "networkidle" });
await page.waitForSelector("text=Companion activo", { timeout: 10000 });
ok("Badge de companion activo", true);

await page.setInputFiles("input[type=file]", `${MEDIA}/sample.mp4`);
await page.click('button:has-text("Encontrar loops suaves")');
await page.waitForSelector("text=Calidad", { timeout: 120000 });
const vidCands = await page.locator("button:has-text('Calidad')").count();
ok("Candidatos de video", vidCands > 0, `(${vidCands})`);
await page.locator("button:has-text('Calidad')").first().click();

await page.setInputFiles("input[type=file]", `${MEDIA}/testsong.mp3`);
await page.waitForSelector("text=Toda la canción", { timeout: 20000 });
ok("Canción cargada (modo completa)", true);

// duración corta para el test
const num = page.locator('input[type=number]').nth(1);
await num.fill("0.25");
ok("Duración objetivo en minutos", true);

await page.waitForSelector("text=Atmósfera", { timeout: 10000 });
ok("Panel de atmósfera visible", true);

await page.click('button:has-text("Ver cómo quedaría")');
await page.waitForSelector("text=Preview aproximado", { timeout: 180000 });
ok("Preview de 20s generado", true);

await page.click('button:has-text("Generar video")');
await page.waitForSelector("text=Listo", { timeout: 300000 });
ok("MP4 renderizado", true);

const [dl] = await Promise.all([
  page.waitForEvent("download", { timeout: 30000 }),
  page.click('button:has-text("Descargar MP4")'),
]);
const mp4 = `${MEDIA}/out-final-videoloop.mp4`;
await dl.saveAs(mp4);
ok("MP4 descargado", fs.statSync(mp4).size > 50000);

const probe = execSync(
  `ffprobe -v error -show_entries stream=codec_name -show_entries format=duration -of compact "${mp4}"`
).toString();
const dur = parseFloat((probe.match(/duration=([\d.]+)/) || [0, "0"])[1]);
ok(
  "MP4 h264+aac con duración pedida (~15s)",
  probe.includes("h264") && probe.includes("aac") && dur >= 12 && dur <= 20,
  probe.replace(/\n/g, " ").trim().slice(0, 70)
);

await page.screenshot({ path: `${MEDIA}/videoloop.png` });
await browser.close();

const failed = results.filter((r) => !r).length;
console.log(`\n${results.length - failed}/${results.length} pruebas pasaron`);
process.exit(failed ? 1 : 0);
