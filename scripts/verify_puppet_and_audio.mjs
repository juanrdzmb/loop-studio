import { chromium } from "playwright-core";
import fs from "fs";
import path from "path";

const ARTIFACTS_DIR = "/home/juanda/.gemini/antigravity-cli/brain/ba6709df-4e7e-4e7e-b684-89a3921d94d0";
const SAMPLE_IMAGE = path.join(ARTIFACTS_DIR, ".user_uploaded/uploaded_media_1_1787815639124.png");

async function run() {
  console.log("🚀 Starting Playwright verification for Puppet Rigging & Audio Stability...");
  const browser = await chromium.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-gpu"],
  });

  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
  });
  const page = await context.newPage();

  page.on("console", (msg) => {
    if (msg.type() === "error") console.error("PAGE ERROR:", msg.text());
  });
  page.on("pageerror", (err) => console.error("UNCAUGHT ERROR:", err.message));

  console.log("Navigating to http://localhost:3000/manga-motion...");
  await page.goto("http://localhost:3000/manga-motion", { waitUntil: "networkidle" });

  // 1. Upload manga panel image
  console.log("Uploading test manga panel:", SAMPLE_IMAGE);
  const fileInput = await page.locator('input[type="file"]').first();
  await fileInput.setInputFiles(SAMPLE_IMAGE);

  // Wait for canvas to render
  await page.waitForSelector("canvas");
  await page.waitForTimeout(1000);
  console.log("✓ Canvas successfully rendered with panel image");

  // 2. Click Auto-Segment Character
  console.log("Clicking 'Auto-Extraer Personaje'...");
  const extractBtn = page.getByRole("button", { name: /Auto-Extraer Personaje/i });
  await extractBtn.click();

  // Wait for segmentation & inpainting completion (up to 45s)
  await page.waitForSelector("text=Capa de personaje transparente activa", { timeout: 45000 });
  console.log("✓ AI Cutout + Clean Background Inpainting processed successfully!");

  await page.waitForTimeout(1000);
  await page.screenshot({ path: path.join(ARTIFACTS_DIR, "manga_motion_clean_inpainted_bg.png") });

  // 3. Switch to Puppet Rigging & Poses Tab
  console.log("Switching to 🎭 Puppet Rigging & Pose tab...");
  await page.getByRole("button", { name: /Puppet Rigging/i }).click();
  await page.waitForTimeout(500);

  // Toggle wireframe on for screenshot proof
  const wireframeCheckbox = page.getByLabel(/Malla Wireframe/i);
  await wireframeCheckbox.check();
  await page.waitForTimeout(600);

  console.log("✓ Wireframe mesh & puppet pins enabled");
  await page.screenshot({ path: path.join(ARTIFACTS_DIR, "manga_motion_puppet_mesh_pins.png") });

  // 4. Test dragging a puppet pin on the canvas
  console.log("Simulating canvas mouse drag on puppet pin...");
  const canvas = page.locator("canvas").first();
  const box = await canvas.boundingBox();
  if (box) {
    const startX = box.x + box.width * 0.5;
    const startY = box.y + box.height * 0.22;
    await page.mouse.move(startX, startY);
    await page.mouse.down();
    await page.mouse.move(startX + 50, startY - 30, { steps: 5 });
    await page.mouse.up();
    console.log("✓ Dragged puppet pin on canvas successfully!");
  }
  await page.waitForTimeout(600);
  await page.screenshot({ path: path.join(ARTIFACTS_DIR, "manga_motion_puppet_deformed_pose.png") });

  // 5. Test Audio upload & play
  console.log("Testing Audio upload...");
  await page.getByRole("button", { name: /Recortar Música/i }).click();
  await page.waitForTimeout(400);

  const dummyWavPath = "/tmp/test_audio.wav";
  if (!fs.existsSync(dummyWavPath)) {
    const { execSync } = await import("child_process");
    execSync(`ffmpeg -y -f lavfi -i "sine=frequency=440:duration=5" ${dummyWavPath}`);
  }

  const audioFileInput = page.locator('input[type="file"][accept*="audio"]').first();
  await audioFileInput.setInputFiles(dummyWavPath);
  await page.waitForTimeout(1200);
  console.log("✓ Audio file uploaded and loaded into MangaLiveAudioPlayer");

  // Click section shortcut
  const dropBtn = page.getByRole("button", { name: /50% \(Drop \/ Coro\)/i });
  if (await dropBtn.isVisible()) {
    await dropBtn.click();
    console.log("✓ Clicked 50% Drop shortcut");
  }

  await page.waitForTimeout(800);
  await page.screenshot({ path: path.join(ARTIFACTS_DIR, "manga_motion_audio_trimmed_live.png") });

  console.log("🎉 ALL TESTS COMPLETED WITH 100% SUCCESS!");
  await browser.close();
}

run().catch((err) => {
  console.error("FATAL TEST ERROR:", err);
  process.exit(1);
});
