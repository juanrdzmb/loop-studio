/* E2E: partículas continuas + estabilización en la exportación.
 * 1. Lluvia sobre fondo negro, Short 12 s desde un clip de 4 s (3 ciclos):
 *    con remux-tiling el frame de inicio de cada copia sería IDÉNTICO al
 *    primero (partículas reiniciadas); con render continuo las partículas
 *    avanzan y el frame difiere. Se mide con PSNR.
 * 2. Clip con vibración sinusoidal conocida (±6 px a 3 Hz): la exportación
 *    debe dejar un residual de alta frecuencia ≤60 % del original.
 * Requiere el servidor en :3210. */
import { chromium } from "playwright-core";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

const EXE = `${process.env.HOME}/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome`;
const BASE = process.env.LOOP_STUDIO_URL || "http://localhost:3210";
const WORK = "/tmp/opencode/loopstudio-e2e";
fs.mkdirSync(WORK, { recursive: true });

const RAIN = path.join(WORK, "rain_source.mp4");
const JITTER = path.join(WORK, "jitter_source.mp4");
const SONG = path.join(WORK, "song_12s.m4a");
const OUT_RAIN = path.join(WORK, "export_rain_continuous.mp4");
const OUT_JITTER = path.join(WORK, "export_jitter.mp4");
const TARGET = 12;

execFileSync("ffmpeg", ["-y", "-loglevel", "error",
  "-f", "lavfi", "-i", "color=c=0x07070d:s=1080x1920:rate=24:duration=4",
  "-c:v", "libx264", "-preset", "fast", "-crf", "18", "-pix_fmt", "yuv420p", RAIN]);
execFileSync("ffmpeg", ["-y", "-loglevel", "error",
  "-f", "lavfi", "-i", "testsrc2=size=1104x1920:rate=24",
  "-frames:v", "1", path.join(WORK, "jitter_base.png")]);
execFileSync("ffmpeg", ["-y", "-loglevel", "error",
  "-loop", "1", "-i", path.join(WORK, "jitter_base.png"),
  "-vf", "crop=1080:1920:'12+2*sin(2*PI*6*t)':0",
  "-t", "4", "-r", "24",
  "-c:v", "libx264", "-preset", "fast", "-crf", "18", "-pix_fmt", "yuv420p", JITTER]);
execFileSync("ffmpeg", ["-y", "-loglevel", "error",
  "-f", "lavfi", "-i", "aevalsrc=0.25*sin(440*2*PI*t):s=48000:d=12",
  "-c:a", "aac", "-b:a", "192k", SONG]);

const results = [];
const ok = (name, cond, extra = "") => {
  results.push(Boolean(cond));
  console.log(`${cond ? "PASS" : "FAIL"} ${name} ${extra}`);
};

const browser = await chromium.launch({
  executablePath: fs.existsSync(EXE) ? EXE : undefined,
  args: ["--no-sandbox", "--disable-dev-shm-usage", "--use-gl=swiftshader", "--enable-unsafe-swiftshader"],
});
const page = await browser.newPage();
const pageErrors = [];
page.on("pageerror", (error) => pageErrors.push(error.message));

async function exportShort9x16(src, out, particles) {
  await page.goto(`${BASE}/dual-studio`, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: /📱 Short 9:16/ }).click();
  await page.locator('input[type="file"]').nth(0).setInputFiles(src);
  await page.waitForFunction(() => !document.body.innerText.includes("cargando clip…"), null, { timeout: 30000 });
  await page.getByLabel("Modo de continuidad 9:16").selectOption("cut");
  await page.getByText("Ajustes visuales y estabilización").click();
  await page.getByLabel("Filtro visual 9:16").selectOption("original");
  await page.getByLabel("Cámara 2.5D 9:16").selectOption("static");
  await page.getByLabel("Partículas 9:16").selectOption(particles);
  const durationInput = page.getByLabel("Duración personalizada del Short");
  await durationInput.fill(String(TARGET));
  await durationInput.blur();
  await page.locator('input[type="file"]').nth(1).setInputFiles(SONG);
  await page.waitForTimeout(2500);
  await page.getByRole("button", { name: /Exportar Solo 9:16/ }).click();
  await page.getByText("Confirma tu exportación").waitFor();
  await page.getByRole("button", { name: /Sí, exportar ahora/ }).click();
  await page.waitForSelector('a[download^="loop_9x16"]', { timeout: 600000 });
  const b64 = await page.evaluate(async () => {
    const anchor = document.querySelector('a[download^="loop_9x16"]');
    const response = await fetch(anchor.getAttribute("href"));
    const bytes = new Uint8Array(await response.arrayBuffer());
    let binary = "";
    for (let i = 0; i < bytes.length; i += 0x8000) {
      binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    }
    return btoa(binary);
  });
  fs.writeFileSync(out, Buffer.from(b64, "base64"));
}

function framePsnr(fileA, fileB, timeA, timeB) {
  execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-ss", String(timeA), "-i", fileA, "-frames:v", "1", "/tmp/pc_a.png"]);
  execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-ss", String(timeB), "-i", fileB, "-frames:v", "1", "/tmp/pc_b.png"]);
  const log = execFileSync("bash", ["-c", 'ffmpeg -loglevel info -i "$1" -i "$2" -filter_complex psnr -f null - 2>&1', "bash", "/tmp/pc_a.png", "/tmp/pc_b.png"], { encoding: "utf8" });
  return Number((log.match(/average:([\d.]+|inf)/) || [])[1] || 0);
}

// ── 1. Lluvia continua ──
await exportShort9x16(RAIN, OUT_RAIN, "cinematic_rain");
const rainProbe = JSON.parse(execFileSync("ffprobe", ["-v", "quiet", "-print_format", "json", "-show_streams", "-show_format", OUT_RAIN]));
const rainStream = rainProbe.streams.find((s) => s.codec_type === "video");
ok("Lluvia: export 12s completado", Math.abs(Number(rainProbe.format.duration) - TARGET) < 0.3, `${rainProbe.format.duration}s ${rainStream.width}x${rainStream.height}`);
ok("Lluvia: audio inline presente", rainProbe.streams.some((s) => s.codec_type === "audio"));
const psnrAcrossBoundary = framePsnr(OUT_RAIN, OUT_RAIN, 0.08, 4 + 0.08);
ok("Partículas continuas: el inicio del ciclo 2 NO repite el ciclo 1", psnrAcrossBoundary < 30, `(PSNR ${psnrAcrossBoundary.toFixed(1)} dB; tiled daría >40 dB)`);
const psnrWithinCycle = framePsnr(OUT_RAIN, OUT_RAIN, 1.08, 1.58);
ok("La lluvia avanza dentro del ciclo (0.5 s apart)", psnrWithinCycle < 40, `(PSNR ${psnrWithinCycle.toFixed(1)} dB; lluvia congelada daría >45 dB)`);

// ── 2. Reducción de vibración ──
await exportShort9x16(JITTER, OUT_JITTER, "none");
const jitterStatus = await page.evaluate(() => document.querySelector('[data-testid="stabilization-status-16x9"], [data-testid="stabilization-status-9x16"]')?.textContent || "");
ok("Jitter: la estabilización automática se activó", jitterStatus.includes("Microvibración corregida"), `("${jitterStatus}")`);
const jitterProbe = JSON.parse(execFileSync("ffprobe", ["-v", "quiet", "-print_format", "json", "-show_format", OUT_JITTER]));
ok("Jitter: export 12s completado", Math.abs(Number(jitterProbe.format.duration) - TARGET) < 0.3, `${jitterProbe.format.duration}s`);

const pyScript = `
import cv2, numpy as np, sys
def hf_rms(path, start):
    cap = cv2.VideoCapture(path)
    cap.set(cv2.CAP_PROP_POS_MSEC, start * 1000)
    ret, prev = cap.read()
    prev = cv2.GaussianBlur(cv2.cvtColor(prev, cv2.COLOR_BGR2GRAY).astype(np.float32), (5,5), 0)
    xs = []
    while True:
        ret, cur = cap.read()
        if not ret: break
        cur = cv2.GaussianBlur(cv2.cvtColor(cur, cv2.COLOR_BGR2GRAY).astype(np.float32), (5,5), 0)
        (dx, dy), resp = cv2.phaseCorrelate(prev, cur)
        xs.append((dx, dy, resp))
        prev = cur
    cap.release()
    s = np.array(xs)
    pad = np.pad(s[:, :2], ((3,3),(0,0)), mode="edge")
    smooth = np.mean(np.stack([pad[i:i+len(s)] for i in range(7)]), axis=0)
    hf = s[:, :2] - smooth
    rms = np.sqrt((hf**2).mean(axis=0))
    return float(rms[0]), float(np.median(s[:, 2]))
sx, sc = hf_rms(sys.argv[1], 0.2)
ex, ec = hf_rms(sys.argv[2], 0.2)
print(f"{sx:.3f} {ex:.3f} {sc:.3f} {ec:.3f}")
`;
fs.writeFileSync("/tmp/hf_rms.py", pyScript);
const measured = execFileSync("bash", ["-c",
  'companion/.venv/bin/python /tmp/hf_rms.py "$1" "$2"', "bash", JITTER, OUT_JITTER],
  { encoding: "utf8", cwd: process.cwd() }).trim().split(/\s+/).map(Number);
const [srcRms, expRms, srcConf, expConf] = measured;
ok("Jitter: mediciones con confianza de fase", srcConf > 0.5 && expConf > 0.5, `(conf source ${srcConf.toFixed(2)}, export ${expConf.toFixed(2)})`);
ok("Jitter: residual de alta frecuencia reducido ≥40%", expRms < srcRms * 0.6, `(source ${srcRms.toFixed(2)} px → export ${expRms.toFixed(2)} px)`);

ok("Sin errores de página", pageErrors.length === 0, pageErrors.slice(0, 2).join(" | "));

await browser.close();
const failed = results.filter((r) => !r).length;
console.log(failed === 0 ? "\n✅ TODO OK" : `\n❌ ${failed} pruebas fallaron`);
process.exit(failed ? 1 : 0);
