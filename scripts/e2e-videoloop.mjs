/* E2E: Video + Song (loops, atmosphere, 20s preview, render) */
import { chromium } from "playwright-core";
import fs from "node:fs";
import { execSync } from "node:child_process";

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

const page = await browser.newPage();
page.on("pageerror", (e) => console.log("pageerror:", e.message));

await page.goto(BASE + "/video-loop", { waitUntil: "networkidle" });
await page.waitForSelector("text=Companion online", { timeout: 10000 });
ok("Companion online badge", true);

await page.setInputFiles("input[type=file]", `${MEDIA}/sample.mp4`);
await page.waitForSelector("text=Full clip", { timeout: 10000 });
ok("Video loaded (full seamless crossfade default)", true);

await page.click('button:has-text("A detected video loop")');
await page.click('button:has-text("Find seamless loops")');
await page.waitForSelector("text=Quality", { timeout: 120000 });
const vidCands = await page.locator("button:has-text('Quality')").count();
ok("Video candidates", vidCands > 0, `(${vidCands})`);
await page.locator("button:has-text('Quality')").first().click();
await page.setInputFiles("input[type=file]", `${MEDIA}/testsong.mp3`);
await page.waitForSelector("text=Full song", { timeout: 20000 });
ok("Song loaded (full song)", true);

const num = page.locator("input[type=number]").nth(1);
await num.fill("0.25");
ok("Target length in minutes", true);

await page.waitForSelector("text=Atmosphere", { timeout: 10000 });
ok("Atmosphere panel visible", true);

await page.click('button:has-text("Preview how it would look")');
await page.waitForSelector("text=Rough preview", { timeout: 180000 });
ok("20s preview generated", true);

await page.click('button:has-text("Generate YouTube video")');
await page.waitForSelector("text=YouTube 16:9 ready", { timeout: 300000 });
ok("MP4 rendered", true);

const [dl] = await Promise.all([
  page.waitForEvent("download", { timeout: 30000 }),
  page.click('button:has-text("Download 16:9 MP4")'),
]);
const mp4 = `${MEDIA}/out-final-videoloop.mp4`;
await dl.saveAs(mp4);
ok("MP4 downloaded", fs.statSync(mp4).size > 50000);

const probe = execSync(
  `ffprobe -v error -show_entries stream=codec_name -show_entries format=duration -of compact "${mp4}"`
).toString();
const dur = parseFloat((probe.match(/duration=([\d.]+)/) || [0, "0"])[1]);
ok(
  "MP4 h264+aac ~15s",
  probe.includes("h264") && probe.includes("aac") && dur >= 12 && dur <= 20,
  probe.replace(/\n/g, " ").trim().slice(0, 70)
);

await page.screenshot({ path: `${MEDIA}/videoloop.png` });
await browser.close();

const failed = results.filter((r) => !r).length;
console.log(`\n${results.length - failed}/${results.length} tests passed`);
process.exit(failed ? 1 : 0);
