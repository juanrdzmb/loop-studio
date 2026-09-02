/* E2E smoke test para Loop Studio */
import { chromium } from "playwright-core";
import { execFileSync } from "node:child_process";
import fs from "node:fs";

const EXE = `${process.env.HOME}/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome`;
const BASE = process.env.LOOP_STUDIO_URL || "http://localhost:3000";
const MEDIA = "/tmp/opencode/loop-e2e";
const SAMPLE_VIDEO = `${MEDIA}/sample.mp4`;
const SAMPLE_AUDIO = `${MEDIA}/song.mp3`;

fs.mkdirSync(MEDIA, { recursive: true });
execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-f", "lavfi", "-i", "testsrc2=size=640x360:rate=24:duration=3", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-movflags", "+faststart", SAMPLE_VIDEO]);
execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-f", "lavfi", "-i", "sine=frequency=330:sample_rate=48000:duration=8", "-c:a", "libmp3lame", "-b:a", "128k", SAMPLE_AUDIO]);

const results = [];
function ok(name, cond, extra = "") {
  results.push({ name, pass: !!cond, extra });
  console.log(`${cond ? "PASS" : "FAIL"} ${name} ${extra}`);
}

const browser = await chromium.launch({
  executablePath: EXE,
  args: [
    "--no-sandbox",
    "--disable-dev-shm-usage",
    "--use-gl=swiftshader",
    "--enable-unsafe-swiftshader",
  ],
});

// ---------- Portada: elección de flujo ----------
{
  const page = await browser.newPage();
  await page.goto(BASE + "/", { waitUntil: "networkidle" });
  const heading = await page.getByRole("heading", { level: 1 }).textContent();
  ok("Portada orienta al flujo principal", heading?.includes("dirigido"), heading?.trim());
  ok("Portada enlaza Dual Studio", await page.getByRole("link", { name: /Crear loop en dos formatos/ }).isVisible());
  ok("Portada enlaza Edit Studio", await page.getByRole("link", { name: /Montar un Short/ }).isVisible());
  ok("Portada enlaza GIF Studio", await page.getByRole("link", { name: /GIF Studio/ }).first().isVisible());
  await page.screenshot({ path: `${MEDIA}/home.png`, fullPage: true });
  await page.close();
}

// ---------- Página 1: GIF Studio ----------
{
  const page = await browser.newPage();
  page.on("pageerror", (e) => console.log("pageerror:", e.message));
  await page.goto(BASE + "/gif-studio", { waitUntil: "networkidle" });

  await page.setInputFiles('input[type=file]', SAMPLE_VIDEO);
  await page.waitForSelector("video", { timeout: 10000 });
  // Esperar metadata (aparece el timeline)
  await page.waitForFunction(() => document.body.innerText.includes("Recorte"), null, { timeout: 10000 });

  // Cambiar preset a anime y generar
  await page.click('button:has-text("Anime Lo-Fi")');
  await page.click('button:has-text("Generar GIF")');
  await page.waitForSelector("text=GIF listo", { timeout: 120000 });
  const sizeTxt = await page.textContent("text=/KB/");
  ok("GIF generado en /gif-studio", true, sizeTxt?.trim());

  const imgOk = await page.evaluate(() => {
    const img = document.querySelector('img[alt="GIF generado"]');
    return img && img.naturalWidth > 0;
  });
  ok("El GIF renderiza con dimensiones válidas", imgOk);
  await page.screenshot({ path: `${MEDIA}/studio.png` });
  await page.close();
}

// ---------- Página 2: Slowed + Reverb ----------
{
  const page = await browser.newPage();
  await page.goto(BASE + "/slowed-reverb", { waitUntil: "networkidle" });
  await page.setInputFiles('input[type=file]', SAMPLE_AUDIO);
  await page.waitForSelector("text=song.mp3", { timeout: 15000 });
  ok("Audio cargado en slowed-reverb", true);

  await page.click('button:has-text("Profundo")');
  const speedVal = await page.evaluate(() => {
    const labels = [...document.querySelectorAll("label")];
    const l = labels.find((x) => x.textContent?.includes("Velocidad"));
    return l?.querySelector("strong")?.textContent ?? "";
  });
  ok("Preset Profundo aplica", speedVal.startsWith("0.82x"), speedVal);

  // Play/pause rápido
  await page.click('button:has-text("Escuchar")');
  await page.waitForTimeout(800);
  await page.click('button:has-text("Pausar")');
  ok("Preview reproduce/pausa", true);

  // Exportar WAV (captura la descarga)
  const [download] = await Promise.all([
    page.waitForEvent("download", { timeout: 30000 }),
    page.click('button:has-text("Exportar WAV")'),
  ]);
  const wavPath = `${MEDIA}/out-slowed.wav`;
  await download.saveAs(wavPath);
  const stat = fs.statSync(wavPath);
  ok("WAV exportado", stat.size > 40000, `(${stat.size} bytes)`);
  await page.close();
}

// ---------- Página 3: Combinar ----------
{
  const page = await browser.newPage();
  await page.goto(BASE + "/combinar", { waitUntil: "networkidle" });

  // Dropzones secuenciales: cada una desaparece al cargar su archivo
  await page.setInputFiles('input[type=file]', SAMPLE_VIDEO);
  await page.waitForSelector("text=Ajustes del loop", { timeout: 15000 });
  await page.setInputFiles('input[type=file]', SAMPLE_AUDIO);
  await page.waitForSelector("text=Duración del audio", { timeout: 20000 });

  // Duración personalizada de 6s para que el encode sea rápido
  await page.check('input[type=radio] >> nth=1');
  await page.fill('input[type=number]', '6');

  await page.click('button:has-text("Generar MP4")');
  await page.waitForSelector("text=Video listo", { timeout: 180000 });
  const mbTxt = await page.textContent("text=/MB|KB/");
  ok("MP4 compuesto", true, mbTxt?.trim());

  const vidOk = await page.evaluate(() => {
    const v = document.querySelector("video");
    return v && v.readyState >= 1 && v.videoWidth > 0;
  });
  ok("El MP4 carga metadatos de video", vidOk);
  await page.screenshot({ path: `${MEDIA}/combinar.png` });

  const [dl] = await Promise.all([
    page.waitForEvent("download", { timeout: 30000 }),
    page.click('button:has-text("Descargar MP4")'),
  ]);
  const mp4Path = `${MEDIA}/out-combined.mp4`;
  await dl.saveAs(mp4Path);
  ok("MP4 descargado", fs.statSync(mp4Path).size > 50000);
  await page.close();
}

await browser.close();

const failed = results.filter((r) => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} pruebas pasaron`);
if (!failed.length) fs.rmSync(MEDIA, { recursive: true, force: true });
process.exit(failed.length ? 1 : 0);
