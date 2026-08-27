import { existsSync } from "node:fs";

const CANDIDATES = [
  process.env.CHROME_BIN,
  "/usr/bin/google-chrome-stable",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium-browser",
  "/usr/bin/chromium",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
].filter(Boolean);

export function chromePath() {
  const found = CANDIDATES.find((path) => existsSync(path));
  if (!found) {
    throw new Error(
      "Chrome/Chromium not found. Set CHROME_BIN or install Google Chrome.",
    );
  }
  return found;
}

export const HEADLESS_ARGS = [
  "--headless=new",
  "--disable-gpu",
  "--no-sandbox",
  "--disable-dev-shm-usage",
  "--disable-extensions",
];
