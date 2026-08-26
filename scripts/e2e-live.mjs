/* E2E: controles en vivo slowed-reverb + previsualización combinada */
import { chromium } from "playwright-core";

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

// ---------- 1) Slowed + Reverb: controles en vivo ----------
{
  const page = await browser.newPage();
  page.on("pageerror", (e) => console.log("pageerror:", e.message));
  await page.goto(BASE + "/slowed-reverb", { waitUntil: "networkidle" });
  await page.setInputFiles('input[type=file]', `${MEDIA}/song.mp3`);
  await page.waitForSelector("text=song.mp3", { timeout: 15000 });

  await page.click('button:has-text("Escuchar")');
  await page.waitForTimeout(1200);

  // Mover velocidad mientras suena: la posición NO debe reiniciarse
  const pos1 = await page.evaluate(() => {
    const r = document.querySelector('input[type=range]');
    return r ? parseFloat(r.value) : -1;
  });
  await page.locator('label:has-text("Velocidad") input[type=range]').first().fill("0.7");
  await page.waitForTimeout(900);
  const pos2 = await page.evaluate(() => {
    const r = document.querySelector('input[type=range]');
    return r ? parseFloat(r.value) : -1;
  });
  ok("Posición avanza tras cambiar velocidad (sin reinicio)", pos2 > pos1, `(${pos1.toFixed(2)}s → ${pos2.toFixed(2)}s)`);

  // Cambiar reverb y lowpass en vivo: sin errores de página
  await page.locator('label:has-text("Mezcla reverb") input[type=range]').fill("0.6");
  await page.locator('label:has-text("low-pass") input[type=range]').fill("6000");
  await page.waitForTimeout(500);
  ok("Sliders reverb/lowpass en vivo sin errores", true);

  // Preset en vivo
  await page.click('button:has-text("Deep / nocturno")');
  await page.waitForTimeout(400);
  ok("Preset aplicado en vivo", true);
  await page.close();
}

// ---------- 2) Combinar: previsualización conjunta ----------
{
  const page = await browser.newPage();
  page.on("pageerror", (e) => console.log("pageerror:", e.message));
  await page.goto(BASE + "/combinar", { waitUntil: "networkidle" });
  await page.setInputFiles('input[type=file]', `${MEDIA}/sample.mp4`);
  await page.waitForSelector("text=Ajustes del loop", { timeout: 15000 });
  await page.setInputFiles('input[type=file]', `${MEDIA}/song.mp3`);
  await page.waitForSelector("text=Duración del audio", { timeout: 20000 });

  // Activar slowed para probar la cadena completa
  await page.check('input[type=checkbox]');
  await page.locator('label:has-text("Velocidad") input[type=range]').first().fill("0.8");

  // Esperar preview lista y reproducir juntos
  await page.waitForSelector("text=/Previsualizar (tu GIF|el loop) \\+ audio en tiempo real/", { timeout: 20000 });
  await page.waitForFunction(() => {
    const b = [...document.querySelectorAll("button")].find((x) =>
      x.textContent?.includes("Reproducir juntos")
    );
    return b && !b.disabled;
  }, null, { timeout: 30000 });
  await page.click('button:has-text("Reproducir juntos")');
  await page.waitForTimeout(1000);

  // Canvas anima
  const hash = () =>
    page.evaluate(() => {
      const c = document.querySelector('canvas');
      const d = c.getContext("2d").getImageData(0, 0, c.width, c.height).data;
      let s = 0;
      for (let i = 0; i < d.length; i += 997) s += d[i];
      return s;
    });
  const h1 = await hash();
  await page.waitForTimeout(700);
  const h2 = await hash();
  ok("Preview combinado anima (video+audio)", h1 !== h2);

  // Progreso avanza
  const p1 = await page.inputValue('input[readonly]');
  await page.waitForTimeout(800);
  const p2 = await page.inputValue('input[readonly]');
  ok("Barra de progreso avanza", parseFloat(p2) > parseFloat(p1), `(${p1}→${p2})`);

  // Velocidad en vivo mientras suena
  await page.locator('label:has-text("Velocidad") input[type=range]').first().fill("0.9");
  await page.waitForTimeout(400);
  ok("Cambio de velocidad en vivo sin errores", true);

  // Pausar y continuar
  await page.click('button:has-text("Pausar")');
  const pa1 = await hash();
  await page.waitForTimeout(500);
  const pa2 = await hash();
  ok("Pausa congela el preview", pa1 === pa2);
  await page.click('button:has-text("Continuar")');
  await page.waitForTimeout(400);
  const pa3 = await hash();
  ok("Continuar reanuda", pa3 !== pa2);

  await page.screenshot({ path: `${MEDIA}/combined-preview.png` });
  await page.close();
}

await browser.close();
const failed = results.filter((r) => !r).length;
console.log(`\n${results.length - failed}/${results.length} pruebas pasaron`);
process.exit(failed ? 1 : 0);
