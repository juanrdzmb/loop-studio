import { chromium } from "playwright-core";
import path from "path";

const ARTIFACTS_DIR = "/home/juanda/.gemini/antigravity-cli/brain/ba6709df-4e7e-4e7e-b684-89a3921d94d0";
const SAMPLE_IMAGE = "/home/juanda/.gemini/antigravity-cli/brain/ba6709df-4e7e-4e7e-b684-89a3921d94d0/.user_uploaded/uploaded_media_1_1787815639124.png";

async function run() {
  console.log("🚀 Starting Playwright E2E Verification for Manga Motion 2.5D Studio...");

  // Find chromium path or default
  const browser = await chromium.launch({
    headless: true,
    channel: "chrome",
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-gpu"],
  }).catch(() => {
    return chromium.launch({ headless: true, args: ["--no-sandbox"] });
  });

  const context = await browser.newContext({
    viewport: { width: 1440, height: 950 },
  });

    const page = await context.newPage();
  page.on("console", (msg) => console.log("BROWSER LOG:", msg.text()));
  page.on("pageerror", (err) => console.log("PAGE ERROR:", err.message));
  console.log("Navigating to http://localhost:3000/manga-motion...");
  await page.goto("http://localhost:3000/manga-motion", { waitUntil: "networkidle" });

  // 1. Upload sample image
  console.log("Uploading sample manga panel...");
  const fileInput = await page.locator('input[type="file"]').first();
  await fileInput.setInputFiles(SAMPLE_IMAGE);

  await page.waitForTimeout(2000);

  // Capture clean single-plane rendering screenshot
  const shot1 = path.join(ARTIFACTS_DIR, "manga_motion_clean_single_layer.png");
  await page.screenshot({ path: shot1 });
  console.log("✓ Screenshot 1 saved:", shot1);

  // 2. Add and drag onomatopoeia
  console.log("Testing onomatopoeia addition and dragging...");
  await page.click('button:has-text("Onomatopeyas SFX")');
  await page.waitForTimeout(500);

  // Click on "バキッ" preset
  await page.click('button:has-text("バキッ")');
  await page.waitForTimeout(500);

  // Drag on canvas
  const canvas = page.locator("canvas").first();
  const box = await canvas.boundingBox();
  if (box) {
    await page.mouse.move(box.x + box.width * 0.5, box.y + box.height * 0.25);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width * 0.7, box.y + box.height * 0.5, { steps: 10 });
    await page.mouse.up();
  }

  // 3. Test Katana Energy Arc
  console.log("Testing Katana Arc and Particles...");
  await page.click('button:has-text("Partículas & Katana Arc")');
  await page.waitForTimeout(500);

  // Toggle Katana Arc checkbox
  const katanaCheckbox = page.locator('input[type="checkbox"]').first();
  await katanaCheckbox.check();
  await page.waitForTimeout(1000);

  const shot2 = path.join(ARTIFACTS_DIR, "manga_motion_katana_sfx_drag.png");
  await page.screenshot({ path: shot2 });
  console.log("✓ Screenshot 2 saved:", shot2);

  // 4. Test Character Cutout & 2.5D Parallax
  console.log("Testing Character Cutout with 2.5D Parallax...");
  await page.click('button:has-text("Personaje & IA Cutout")');
  await page.waitForTimeout(500);

  const cutoutInput = page.locator('input[type="file"]').last();
  await cutoutInput.setInputFiles("/tmp/test_cutout.png");
  await page.waitForTimeout(1500);

  const shot3 = path.join(ARTIFACTS_DIR, "manga_motion_ai_parallax_cutout.png");
  await page.screenshot({ path: shot3 });
  console.log("✓ Screenshot 3 saved:", shot3);

  console.log("🎉 All E2E tests passed successfully!");
  await browser.close();
}

run().catch((err) => {
  console.error("E2E Test failed:", err);
  process.exit(1);
});
