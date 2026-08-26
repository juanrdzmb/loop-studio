/* E2E: preview en vivo del loop en GIF Studio */
import { chromium } from "playwright-core";

const EXE = `${process.env.HOME}/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome`;
const BASE = process.env.LOOP_STUDIO_URL || "http://localhost:3000";
const MEDIA = "/tmp/opencode/loop-e2e";

const browser = await chromium.launch({
  executablePath: EXE,
  args: ["--no-sandbox", "--disable-dev-shm-usage"],
});
const page = await browser.newPage();
page.on("pageerror", (e) => console.log("pageerror:", e.message));

await page.goto(BASE + "/", { waitUntil: "networkidle" });
await page.setInputFiles('input[type=file]', `${MEDIA}/sample.mp4`);
await page.waitForSelector("text=Así quedará tu GIF", { timeout: 15000 });
await page.waitForSelector("text=/frames · ciclo/", { timeout: 30000 });
const info1 = (await page.locator("p:has-text('frames · ciclo')").textContent())?.trim();
console.log("INFO preview normal:", info1);

// El canvas anima: capturar píxeles en dos momentos
async function canvasHash() {
  return page.evaluate(() => {
    const c = document.querySelector("canvas");
    const ctx = c.getContext("2d");
    const d = ctx.getImageData(0, 0, c.width, c.height).data;
    let sum = 0;
    for (let i = 0; i < d.length; i += 997) sum += d[i];
    return sum;
  });
}
const h1 = await canvasHash();
await page.waitForTimeout(700);
const h2 = await canvasHash();
console.log("ANIMA:", h1 !== h2 ? "SÍ" : "NO", `(${h1} vs ${h2})`);

// Cambiar a boomerang → debe recalcular (info cambia: más frames)
await page.click('button:has-text("Boomerang")');
await page.waitForTimeout(2500); // debounce + proceso
const info2 = (await page.locator("p:has-text('frames · ciclo')").textContent())?.trim();
console.log("INFO preview boomerang:", info2);
const boomerangFrames = parseInt(info2?.match(/(\d+) frames/)?.[1] ?? "0");
const normalFrames = parseInt(info1?.match(/(\d+) frames/)?.[1] ?? "0");
console.log(
  "BOOMERANG DUPLICA FRAMES:",
  boomerangFrames > normalFrames ? `SÍ (${normalFrames}→${boomerangFrames})` : "NO"
);

// Cambiar estilo a Game Boy y verificar que sigue animando
await page.click('button:has-text("Game Boy")');
await page.waitForTimeout(2500);
const h3 = await canvasHash();
await page.waitForTimeout(600);
const h4 = await canvasHash();
console.log("ANIMA tras cambio de estilo:", h3 !== h4 ? "SÍ" : "NO");

// Pausar/reanudar
await page.click('button:has-text("Pausar")');
const hp1 = await canvasHash();
await page.waitForTimeout(500);
const hp2 = await canvasHash();
console.log("PAUSA congela:", hp1 === hp2 ? "SÍ" : "NO");
await page.click('button:has-text("Reproducir")');

await page.screenshot({ path: `${MEDIA}/preview.png` });
await browser.close();
console.log("E2E preview terminado");
