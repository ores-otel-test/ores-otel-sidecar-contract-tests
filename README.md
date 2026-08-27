# ores-otel-sidecar-contract-tests

Black-box HTTP and browser-automation contract tests for ores-otel-sidecar.

External / end-user tests. They do not import product crates.

## Python (urllib)

```sh
python -m unittest discover -s tests -v
SIDECAR_URL=http://127.0.0.1:9090 python -m unittest discover -s tests -v
```

## Browsers (Playwright, Puppeteer, Selenium)

All three drive system Chrome/Chromium against the live probe listener. They skip when `SIDECAR_URL` is unset.

```sh
npm ci
export SIDECAR_URL=http://127.0.0.1:9090
npm test                  # playwright + puppeteer + selenium
npm run test:playwright
npm run test:puppeteer
npm run test:selenium
```

Set `CHROME_BIN` if Chrome is not on a default path.
