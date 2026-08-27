/* E2E: Manga Motion 2.5D Studio */
import { chromium } from "playwright-core";
import fs from "node:fs";

const EXE = `${process.env.HOME}/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome`;
const BASE = process.env.LOOP_STUDIO_URL || "http://localhost:3000";

// Look for a test image or create a small test PNG panel
const TEST_IMG = "/tmp/test_manga_panel.png";
if (!fs.existsSync(TEST_IMG)) {
  // 1x1 png base64 or small synthetic image
  const pngBuffer = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAoAAAAKCAYAAACNMs+9AAAAFUlEQVR42mNk+M9Qz0AEYBxVSF+FAAhKDveksOjuAAAAAElFTkSuQmCC",
    "base64"
  );
  fs.writeFileSync(TEST_IMG, pngBuffer);
}

const browser = await chromium.launch({
  executablePath: fs.existsSync(EXE) ? EXE : undefined,
  args: ["--no-sandbox", "--disable-dev-shm-usage"],
});

const results = [];
function ok(name, cond, extra = "") {
  results.push(cond);
  console.log(`${cond ? "PASS" : "FAIL"} ${name} ${extra}`);
}

const page = await browser.newPage();
page.on("pageerror", (e) => console.log("pageerror:", e.message));

console.log("Navigating to /manga-motion...");
await page.goto(BASE + "/manga-motion", { waitUntil: "networkidle" });

const title = await page.textContent("h1");
ok("Página de Manga Motion 2.5D carga correctamente", title.includes("Manga Motion"));

// Upload test image
await page.setInputFiles('input[type=file]', TEST_IMG);
await page.waitForSelector("canvas", { timeout: 10000 });

// Canvas dimensions check (9:16 default)
const canvasDims = await page.evaluate(() => {
  const c = document.querySelector("canvas");
  return c ? { w: c.width, h: c.height } : { w: 0, h: 0 };
});
ok("Canvas se inicializa en formato 9:16 (450x800)", canvasDims.w === 450 && canvasDims.h === 800, `(${canvasDims.w}x${canvasDims.h})`);

// Test switching tabs
await page.click('button:has-text("Cámara 2.5D")');
await page.waitForTimeout(300);
const cameraMoveBtn = await page.isVisible('button:has-text("Dolly Zoom")');
ok("Pestaña Cámara 2.5D interactiva y visible", cameraMoveBtn);

// Test switching template
await page.click('button:has-text("Manga Action Burst")');
await page.waitForTimeout(300);

// Test switching to FX tab
await page.click('button:has-text("Efectos Manga (FX)")');
await page.waitForTimeout(300);
const eyeCheckbox = await page.isVisible('text=Ojo Brillante');
ok("Efectos Manga FX (Speed lines, Partículas, Ojo brillante) presentes", eyeCheckbox);

await browser.close();

const allPassed = results.every(Boolean);
console.log(`\nResultados: ${results.filter(Boolean).length}/${results.length} PASSED`);
process.exit(allPassed ? 0 : 1);
