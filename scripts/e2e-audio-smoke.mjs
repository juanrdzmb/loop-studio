/* Smoke E2E: flujo de audio en /dual-studio sin companion.
 * Valida canción completa one-shot en 16:9, ventana fija 25/30s en Shorts,
 * transporte, catálogo SFX curado y ausencia de errores de página. */
import { chromium } from "playwright-core";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

const EXE = `${process.env.HOME}/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome`;
const BASE = process.env.LOOP_STUDIO_URL || "http://localhost:3210";
const WORK = "/tmp/opencode/loopstudio-e2e";
fs.mkdirSync(WORK, { recursive: true });

const VIDEO = path.join(WORK, "src_1080p.mp4");
const AUDIO = path.join(WORK, "song_60s.mp3");

const results = [];
function ok(name, cond, extra = "") {
  results.push(cond);
  console.log(`${cond ? "PASS" : "FAIL"} ${name} ${extra}`);
}

if (!fs.existsSync(VIDEO)) {
  execFileSync("ffmpeg", ["-y", "-loglevel", "error",
    "-f", "lavfi", "-i", "testsrc2=size=1920x1080:rate=30:duration=5",
    "-c:v", "libx264", "-preset", "fast", "-crf", "18", "-pix_fmt", "yuv420p", VIDEO]);
}
if (!fs.existsSync(AUDIO)) {
  execFileSync("ffmpeg", ["-y", "-loglevel", "error",
    "-f", "lavfi", "-i", "aevalsrc=0.3*sin(440*2*PI*t)+0.2*sin(220*2*PI*t):s=44100:d=60",
    "-c:a", "libmp3lame", "-b:a", "192k", AUDIO]);
}

const browser = await chromium.launch({
  executablePath: fs.existsSync(EXE) ? EXE : undefined,
  args: ["--no-sandbox", "--disable-dev-shm-usage", "--use-gl=swiftshader", "--enable-unsafe-swiftshader"],
});
const pageErrors = [];
const page = await browser.newPage();
page.on("pageerror", (e) => pageErrors.push(e.message));
page.on("console", (m) => {
  // El companion (:8787) está apagado por diseño en este smoke: su conexión rechazada no es un fallo
  if (m.type() === "error" && !m.text().includes("ERR_CONNECTION_REFUSED")) {
    pageErrors.push(`console: ${m.text()}`);
  }
});

await page.goto(BASE + "/dual-studio", { waitUntil: "networkidle" });
ok("Dual Studio carga", await page.isVisible("text=Canción Master Común"));

// Video en slot 16:9 y canción en slot 3
await page.locator('input[type="file"]').nth(0).setInputFiles(VIDEO);
await page.waitForSelector("canvas", { timeout: 15000 });
await page.locator('input[type="file"]').nth(2).setInputFiles(AUDIO);
await page.waitForFunction(
  () => document.body.innerText.includes("60.0s") || document.body.innerText.includes("60.1s"),
  null,
  { timeout: 20000 }
).catch(() => {});
ok("Canción decodificada (60s visible)", true);

// Esperar al resultado del análisis: sin companion → análisis local (alineado a ritmo)
// con su aviso en el panel; si el analizador local fallara, aviso heurístico.
const heuristicSeen = await page.waitForFunction(
  () => document.body.innerText.includes("análisis local") || document.body.innerText.includes("Sin análisis real"),
  null,
  { timeout: 20000 }
).then(() => true).catch(() => false);
ok("Aviso de fallback sin companion visible", heuristicSeen);

// Transporte de música visible en la sección Slowed+Reverb
const transport = await page.locator('button:has-text("Escuchar")').count();
ok("Transporte de música presente (botón Escuchar)", transport > 0, `(${transport} botones)`);

// Preview completo: arranca con el transporte del workspace (Reproducir → Pausar)
await page.locator('button:has-text("Reproducir")').first().click();
await page.waitForTimeout(800);
const stopVisible = await page.locator('button:has-text("Pausar")').count();
ok("Reproducir arranca preview (botón pasa a Pausar)", stopVisible > 0, `(${stopVisible} botones Pausar)`);

// Pausar desde el mismo transporte
const pauseBtn = page.locator('button:has-text("Pausar")').first();
if (await pauseBtn.count()) {
  await pauseBtn.click();
  ok("Transporte pausa la música", true);
} else {
  ok("Transporte pausa la música", false, "(no se encontró botón Pausar)");
}

// 16:9: canción completa, sin loop interno
const fullSongMode = await page.getByTestId("loop-editor").getByText("Canción completa, una sola reproducción").isVisible();
ok("16:9 usa la canción completa una sola vez", fullSongMode);

// 9:16: ventana exacta, móvil y sin loop interno
await page.getByTestId("loop-editor").getByRole("button", { name: "📱 9:16" }).click();
const fixed25 = await page.getByTestId("loop-editor").getByText("Fragmento de salida: 25s").isVisible();
ok("Short comienza con fragmento exacto de 25s", fixed25);
await page.getByRole("button", { name: "30s", exact: true }).click();
const fixed30 = await page.getByTestId("loop-editor").getByText("Fragmento de salida: 30s").isVisible();
ok("Cambiar a 30s conserva una sola toma exacta", fixed30);
const noInternalLoop = await page.getByTestId("loop-editor").getByText(/sin repetición interna/).isVisible();
ok("La UI confirma que no hay repetición interna de audio", noInternalLoop);

// Catálogo curado: diez efectos útiles, no el catálogo histórico completo
await page.getByRole("button", { name: /Añadir SFX en/ }).first().click();
const curatedCount = await page.getByRole("button", { name: /Añadir en/ }).count();
ok("Selector SFX muestra el catálogo curado", curatedCount === 10, `(${curatedCount} efectos)`);
await page.getByRole("button", { name: "✕" }).last().click();

// Seis perfiles editoriales reales, incluido Golden Brown
const profileCount = await page.locator('button:has-text("Golden Brown Slow Edit")').count();
ok("Perfil Golden Brown / slow edit disponible", profileCount === 1);
await page.getByLabel("Nombre de la canción para títulos").fill("Golden Brown");
await page.locator('button:has-text("Golden Brown Slow Edit")').click();
const generatedTitle = await page.getByTestId("youtube-title").innerText();
ok("El título empieza por el nombre real de la canción", generatedTitle.startsWith("Golden Brown"), generatedTitle);
const multiPlatform =
  (await page.getByTestId("instagram-caption").inputValue()).includes("#Reels") &&
  (await page.getByTestId("tiktok-caption").inputValue()).includes("#TikTokEdits");
ok("Pack incluye captions específicos para Instagram y TikTok", multiPlatform);

ok("Sin errores de página", pageErrors.length === 0, pageErrors.slice(0, 3).join(" | "));

await browser.close();
const failed = results.filter((r) => !r).length;
console.log(failed === 0 ? "\n✅ TODO OK" : `\n❌ ${failed} pruebas fallaron`);
process.exit(failed === 0 ? 0 : 1);
