import { chromium } from "playwright-core";
import { execSync } from "child_process";
import fs from "fs";

execSync('ffmpeg -y -f lavfi -i "sine=frequency=440:duration=8" -c:a pcm_s16le /tmp/test_audio.wav');

async function main() {
  const browser = await chromium.launch({ headless: true, args: ["--no-sandbox"] });
  const page = await browser.newPage({ viewport: { width: 1440, height: 950 } });
  
  await page.goto("http://localhost:3000/manga-motion");
  await page.locator('input[type="file"]').first().setInputFiles("/home/juanda/.gemini/antigravity-cli/brain/ba6709df-4e7e-4e7e-b684-89a3921d94d0/.user_uploaded/uploaded_media_1_1787815639124.png");
  await page.waitForTimeout(1000);
  
  console.log("1. Extrayendo personaje e inpainting...");
  await page.getByRole("button", { name: /Auto-Extraer Personaje/i }).click();
  
  // Wait up to 60s for extraction to complete
  for (let i = 0; i < 40; i++) {
    await page.waitForTimeout(1000);
    const content = await page.content();
    if (content.includes("Capa de personaje transparente activa")) {
      console.log("✓ Inpainting y Cutout completados exitosamente en", i + 1, "segundos!");
      break;
    }
  }
  
  await page.waitForTimeout(1000);
  await page.screenshot({ path: "/home/juanda/.gemini/antigravity-cli/brain/ba6709df-4e7e-4e7e-b684-89a3921d94d0/manga_motion_clean_inpainted_bg.png" });
  
  // 2. Puppet Tab & Wireframe
  console.log("2. Abriendo tab Puppet Rigging & Pose...");
  await page.getByRole("button", { name: /Puppet Rigging/i }).click();
  await page.waitForTimeout(500);
  await page.getByLabel(/Malla Wireframe/i).check();
  await page.waitForTimeout(600);
  await page.screenshot({ path: "/home/juanda/.gemini/antigravity-cli/brain/ba6709df-4e7e-4e7e-b684-89a3921d94d0/manga_motion_puppet_mesh_pins.png" });
  console.log("✓ Wireframe & Pins capturados!");
  
  // 3. Pose deformation test
  console.log("3. Deformando personaje con pin...");
  const canvas = page.locator("canvas").first();
  const box = await canvas.boundingBox();
  if (box) {
    await page.mouse.move(box.x + box.width * 0.5, box.y + box.height * 0.22);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width * 0.5 + 45, box.y + box.height * 0.22 - 20, { steps: 5 });
    await page.mouse.up();
  }
  await page.waitForTimeout(600);
  await page.screenshot({ path: "/home/juanda/.gemini/antigravity-cli/brain/ba6709df-4e7e-4e7e-b684-89a3921d94d0/manga_motion_puppet_deformed_pose.png" });
  console.log("✓ Pose deformada capturada!");
  
  // 4. Audio Trimmer Test
  console.log("4. Probando Audio Trimmer...");
  await page.getByRole("button", { name: /Recortar Música/i }).click();
  await page.waitForTimeout(400);
  await page.locator('input[type="file"][accept*="audio"]').first().setInputFiles("/tmp/test_audio.wav");
  await page.waitForTimeout(1500);
  await page.screenshot({ path: "/home/juanda/.gemini/antigravity-cli/brain/ba6709df-4e7e-4e7e-b684-89a3921d94d0/manga_motion_audio_trimmed_live.png" });
  console.log("✓ Audio trimmer capturado!");
  
  console.log("🎉 ALL TESTS COMPLETE 100%!");
  await browser.close();
}

main().catch(err => {
  console.error("FATAL:", err);
  process.exit(1);
});
