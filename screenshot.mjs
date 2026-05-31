// Puppeteer screenshot helper (per CLAUDE.md).
//   node screenshot.mjs http://localhost:3000 [label] [viewport]
// viewport: "desktop" (default, 1440px) | "mobile" (390px)
// Saves full-page PNG to ./temporary screenshots/screenshot-N[-label].png (auto-incremented).
import puppeteer from "puppeteer";
import { mkdir, readdir } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = dirname(fileURLToPath(import.meta.url));
const SHOT_DIR = join(ROOT, "temporary screenshots");

const url = process.argv[2] || "http://localhost:3000";
const label = process.argv[3] || "";
const viewport = (process.argv[4] || "desktop").toLowerCase();

const VIEWPORTS = {
  desktop: { width: 1440, height: 900, deviceScaleFactor: 1 },
  mobile: { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
};

async function nextIndex() {
  await mkdir(SHOT_DIR, { recursive: true });
  const files = await readdir(SHOT_DIR);
  let max = 0;
  for (const f of files) {
    const m = f.match(/^screenshot-(\d+)/);
    if (m) max = Math.max(max, parseInt(m[1], 10));
  }
  return max + 1;
}

const browser = await puppeteer.launch({ headless: "new", args: ["--no-sandbox"] });
try {
  const page = await browser.newPage();
  await page.setViewport(VIEWPORTS[viewport] || VIEWPORTS.desktop);
  await page.goto(url, { waitUntil: "networkidle0", timeout: 60000 });
  // Let fonts settle and intro animations finish.
  await new Promise((r) => setTimeout(r, 1200));

  const idx = await nextIndex();
  const parts = [`screenshot-${idx}`];
  if (label) parts.push(label);
  if (viewport !== "desktop") parts.push(viewport);
  const out = join(SHOT_DIR, parts.join("-") + ".png");

  await page.screenshot({ path: out, fullPage: true });
  console.log("Saved:", out);
} finally {
  await browser.close();
}
