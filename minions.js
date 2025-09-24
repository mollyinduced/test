const fs = require("fs");
const path = require("path");
const axios = require("axios");
const puppeteer = require("puppeteer-extra");
const StealthPlugin = require("puppeteer-extra-plugin-stealth");
const AdblockerPlugin = require("puppeteer-extra-plugin-adblocker");
const WebSocket = require("ws");

puppeteer.use(StealthPlugin());
puppeteer.use(AdblockerPlugin({ blockTrackers: true }));

// ---------- CONFIG ----------
const LOG_FILE = path.join(__dirname, "ws_log.txt");
// Middleman server (your server.js or cloudflared tunnel)
const MIDDLEMAN_URL = "ws://localhost:8087";

let controlWS = null;

// ---------- LOGGING ----------
function appendLog(line) {
  const timestamp = new Date().toISOString();
  const full = `[${timestamp}] ${line}\n`;
  fs.appendFileSync(LOG_FILE, full);
  console.log(full.trim());
}

// ---------- CONTROL WS ----------
function connectControlWS() {
  controlWS = new WebSocket(MIDDLEMAN_URL);

  controlWS.on("open", () => appendLog("[CTRL] Connected to middleman server"));
  controlWS.on("close", () => appendLog("[CTRL] Middleman connection closed"));
  controlWS.on("error", (err) => appendLog("[CTRL] Error: " + err.message));
}

function sendToControl(opcode, payload) {
  if (controlWS?.readyState === WebSocket.OPEN) {
    const buf = Buffer.from(payload);
    controlWS.send(buf);
  }
}

// ---------- HOOK ----------
async function injectHook(page) {
  try {
    await page.exposeFunction("nodeAppendLog", appendLog);
    await page.exposeFunction("sendToControl", (opcode, payload) =>
      sendToControl(opcode, payload)
    );

    await page.evaluate(() => {
      const OrigWS = window.WebSocket;
      window.WebSocket = function (url, protocols) {
        const ws = new OrigWS(url, protocols);

        ws.addEventListener("open", () => {
          window.nodeAppendLog(`[WS] Connected to: ${url}`);

          // send opcode 0 (server info)
          const enc = new TextEncoder();
          const buf = new Uint8Array(1 + url.length + 1);
          buf[0] = 0; // opcode
          enc.encodeInto(url, buf.subarray(1));
          buf[buf.length - 1] = 0;
          window.sendToControl(0, buf);
        });

        const origSend = ws.send;
        ws.send = function (data) {
          if (data instanceof ArrayBuffer) {
            const dv = new DataView(data);
            const opcode = dv.getUint8(0);

            if (opcode === 16) {
              // mouse move
              window.sendToControl(5, new Uint8Array(data));
            }
            if (opcode === 17) {
              // split
              window.sendToControl(3, new Uint8Array([3]));
            }
            if (opcode === 21) {
              // eject
              window.sendToControl(4, new Uint8Array([4]));
            }
          }
          return origSend.apply(this, arguments);
        };

        return ws;
      };
      window.WebSocket.prototype = OrigWS.prototype;

      window.nodeAppendLog("[HOOK] WebSocket hook installed.");
    });
  } catch (err) {
    appendLog(`❌ Failed to inject hook: ${err.message}`);
  }
}

// ---------- MAIN ----------
async function main() {
  appendLog("🚀 Starting headless Gota.io automation...");
  connectControlWS();

  // Step 1: Solve Cloudflare with FlareSolverr
  appendLog("🔎 Requesting FlareSolverr solution...");
  const flaresolverr = await axios.post("http://localhost:8191/v1", {
    cmd: "request.get",
    url: "https://gota.io/web",
    maxTimeout: 60000,
  });

  const solution = flaresolverr.data.solution;
  const cookies = solution.cookies;
  const userAgent = solution.userAgent;
  appendLog("✅ Got Cloudflare bypass session.");

  // Step 2: Launch Chromium (true headless, no rendering)
  const browser = await puppeteer.launch({
    headless: true,
    userDataDir: "./chromium-profile",
    defaultViewport: null,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-gpu",
      "--disable-dev-shm-usage",
      "--disable-software-rasterizer",
      "--blink-settings=imagesEnabled=false",
      "--window-size=1920,1080",
    ],
  });

  const page = await browser.newPage();
  await page.setUserAgent(userAgent);

  // Step 3: Import cookies
  const formattedCookies = cookies.map((c) => ({
    name: c.name,
    value: c.value,
    domain: c.domain,
    path: c.path || "/",
    httpOnly: c.httpOnly,
    secure: c.secure,
  }));
  await page.setCookie(...formattedCookies);
  appendLog("🍪 Imported cookies from FlareSolverr.");

  // Step 4: Navigate to game
  appendLog("🌍 Navigating to gota.io/web ...");
  await page.goto("https://gota.io/web", { waitUntil: "domcontentloaded" });

  appendLog("⏳ Waiting for game UI...");
  await page.waitForSelector("#btn-play", { timeout: 60000 });
  appendLog("✅ Game UI loaded.");

  // Step 5: Inject hook
  await injectHook(page);

  // Step 6: Auto-select Avalon and trigger start
  await page.evaluate(() => {
    function forceNorthAmerica() {
      const naTab = document.querySelector("#server-tab-na");
      if (naTab) naTab.click();
    }

    function waitForNAServers(callback) {
      const container = document.querySelector("#servers-body-na");
      if (!container) {
        window.nodeAppendLog("❌ NA server list not found!");
        return;
      }

      const observer = new MutationObserver(() => {
        const rows = container.querySelectorAll(".server-row");
        if (rows.length > 0) {
          observer.disconnect();
          callback(rows);
        }
      });
      observer.observe(container, { childList: true, subtree: true });
    }

    forceNorthAmerica();
    waitForNAServers((rows) => {
      window.nodeAppendLog(`✅ NA servers loaded: ${rows.length}`);
      const avalon = [...rows].find((r) =>
        r.textContent.toLowerCase().includes("avalon")
      );
      if (avalon) {
        avalon.click();
        window.nodeAppendLog("🎯 Selected Avalon server.");
        document.querySelector("#name-box").value = "MyBot";
        document.querySelector("#btn-play").click();
        window.nodeAppendLog("▶️ Clicked Play, spawning...");

        // Tell backend to start minions
        window.sendToControl(1, new Uint8Array([1]));
      } else {
        window.nodeAppendLog("⚠️ Avalon not found, staying idle.");
      }
    });
  });

  appendLog(
    "🤖 Headless automation running. Main account active, minions handled by backend only."
  );
}

main();
