/* E2E del flujo que fallaba con doble clic: playlist múltiple, efecto individual,
 * orden, eliminación y arranque real de Web Audio con un solo clic.
 * Requiere servidor en :3210. */
import { chromium } from "playwright-core";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const BASE = process.env.LOOP_STUDIO_URL || "http://localhost:3210";
const EXE = `${process.env.HOME}/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome`;
const WORK = "/tmp/opencode/loopstudio-playlist-e2e";
fs.mkdirSync(WORK, { recursive: true });
const first = path.join(WORK, "01 Primera.wav");
const second = path.join(WORK, "02 Segunda.wav");
execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-f", "lavfi", "-i", "sine=frequency=330:sample_rate=44100:duration=3", first]);
execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-f", "lavfi", "-i", "sine=frequency=550:sample_rate=48000:duration=4", second]);

const browser = await chromium.launch({
  executablePath: fs.existsSync(EXE) ? EXE : undefined,
  args: ["--no-sandbox", "--disable-dev-shm-usage", "--autoplay-policy=no-user-gesture-required"],
});
const page = await browser.newPage();
const errors = [];
page.on("pageerror", (error) => errors.push(error.message));
await page.addInitScript(() => {
  window.__playlistSourceStarts = 0;
  const original = AudioBufferSourceNode.prototype.start;
  AudioBufferSourceNode.prototype.start = function (...args) {
    window.__playlistSourceStarts++;
    return original.apply(this, args);
  };
});
await page.goto(`${BASE}/dual-studio`, { waitUntil: "networkidle" });
await page.getByLabel("Añadir canciones a la playlist").setInputFiles([first, second]);
await page.getByText("2 CANCIONES").waitFor({ timeout: 60_000 });
await page.getByRole("status").waitFor({ state: "detached", timeout: 60_000 }).catch(() => undefined);

const rows = page.getByRole("article");
if (await rows.count() !== 2) throw new Error("La playlist no mostró las dos canciones");
await page.getByLabel("Efecto de 02 Segunda.wav").selectOption("suave");
await page.getByText("2 CANCIONES").waitFor();
await page.getByRole("status").waitFor({ state: "detached", timeout: 60_000 }).catch(() => undefined);

await page.getByLabel("Subir 02 Segunda.wav").click();
const firstRowText = await rows.first().innerText();
if (!firstRowText.includes("02 Segunda.wav")) throw new Error("Mover pista hacia arriba no cambió el orden");

const before = await page.evaluate(() => window.__playlistSourceStarts);
await page.getByRole("button", { name: "▶ Reproducir", exact: true }).click();
await page.waitForFunction((initial) => window.__playlistSourceStarts > initial, before, { timeout: 10_000 });
await page.getByRole("button", { name: "⏸ Pausar", exact: true }).click();

await page.getByLabel("Eliminar 01 Primera.wav").click();
await page.getByText("1 CANCIÓN").waitFor({ timeout: 60_000 });
if (errors.length) throw new Error(`Errores de página: ${errors.join(" | ")}`);

console.log("✓ playlist UI: carga múltiple, efecto, orden, un clic de play, pausa y eliminación");
await browser.close();
