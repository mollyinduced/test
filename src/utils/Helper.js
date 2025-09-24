// utils/Helper.js
const fs = require("fs");
const path = require("path");
const http = require("http");
const https = require("https");
const puppeteer = require("puppeteer");
const Logger = require("./Logger.js");
const config = require("../config/config");
const { HttpsProxyAgent } = require("https-proxy-agent");
const { SocksProxyAgent } = require("socks-proxy-agent");

// node-fetch import wrapper
const fetch = (...args) =>
  import("node-fetch").then(({ default: fetch }) => fetch(...args));

const FLARESOLVERR_ENDPOINT = "http://localhost:8191/v1";

class Helper {
  static createServer() {
    if (config.server.useHttps) {
      const keyPath = path.join(__dirname, "../certs/key.pem");
      const certPath = path.join(__dirname, "../certs/cert.pem");
      const key = fs.readFileSync(keyPath);
      const cert = fs.readFileSync(certPath);
      return https.createServer({ key, cert });
    } else {
      return http.createServer();
    }
  }

  static async getFlareSolverrSession(url) {
    Logger.info("Requesting FlareSolverr session...");
    try {
      const res = await fetch(FLARESOLVERR_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cmd: "request.get",
          url,
          maxTimeout: 60000,
        }),
      });

      const json = await res.json();
      if (json.status !== "ok" || !json.solution) {
        Logger.error("FlareSolverr returned no solution");
        return null;
      }

      Logger.info(
        `FlareSolverr solved Cloudflare with ${json.solution.cookies.length} cookies.`
      );
      return json; // return full JSON
    } catch (err) {
      Logger.error("FlareSolverr session error: " + err.message);
      return null;
    }
  }

  static async getGameConfig() {
    const session = await this.getFlareSolverrSession("https://gota.io/game.json");
    if (!session) return { version: "Gota Web 3.8.4.6" };

    try {
      if (session.solution?.response?.trim().startsWith("{")) {
        const json = JSON.parse(session.solution.response);
        Logger.info(`Fetched game.json version: ${json.version}`);
        return json;
      } else {
        Logger.warn("game.json returned HTML, using fallback version.");
        return { version: "Gota Web 3.8.4.6" };
      }
    } catch (err) {
      Logger.error("Error parsing game.json: " + err.message);
      return { version: "Gota Web 3.8.4.6" };
    }
  }

  static async getBrowserSession(url = "https://gota.io/web/") {
    Logger.info("Launching Chromium session...");
    const browser = await puppeteer.launch({
      headless: config.server.useHeadless ?? true,
      args: ["--disable-blink-features=AutomationControlled"],
    });

    const page = await browser.newPage();
    await page.goto(url, { waitUntil: "networkidle2" });

    const cookies = await page.cookies();
    const ua = await page.evaluate(() => navigator.userAgent);

    Logger.info(`Chromium UA: ${ua}`);
    return { userAgent: ua, cookies, browser, page };
  }

  static randomString(length) {
    const chars =
      "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
    let result = "";
    for (let i = 0; i < length; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
  }

  static async initializeProxies() {
    this.proxies = [];
    if (config.proxy.scrape) {
      await this.scrapeProxies();
    } else {
      this.loadProxiesFromFile();
    }
  }

  static async scrapeProxies() {
    const { protocol, timeout } = config.proxy;
    try {
      const response = await fetch(
        `https://api.proxyscrape.com/v2/?request=displayproxies&protocol=${protocol}&timeout=${timeout}&country=all&ssl=all&anonymity=all`
      );
      if (!response.ok) throw new Error(`Proxy scrape failed: ${response.statusText}`);
      const data = await response.text();
      this.proxies = data.split("\n").filter((p) => p.trim() !== "");
      Logger.info(`Scraped ${this.proxies.length} proxies.`);
    } catch (err) {
      Logger.error(`Error scraping proxies: ${err.message}`);
      this.loadProxiesFromFile();
    }
  }

  static loadProxiesFromFile() {
    const filePath = path.join(__dirname, "../proxies.txt");
    try {
      const data = fs.readFileSync(filePath, "utf-8");
      this.proxies = data.split("\n").filter((p) => p.trim() !== "");
      Logger.info(`Loaded ${this.proxies.length} proxies from proxies.txt.`);
    } catch (err) {
      Logger.error(`Error reading proxies from file: ${err.message}`);
    }
  }

  static getProxy() {
    if (!this.proxies || this.proxies.length === 0) {
      Logger.error("No proxies available.");
      return null;
    }
    const protocol = config.proxy.protocol;
    const proxy = this.proxies.shift();
    this.proxies.push(proxy);
    switch (protocol) {
      case "http":
      case "https":
        return new HttpsProxyAgent(`${protocol}://${proxy}`);
      case "socks4":
      case "socks5":
        return new SocksProxyAgent(`${protocol}://${proxy}`);
      default:
        return new HttpsProxyAgent(`${protocol}://${proxy}`);
    }
  }
}

module.exports = Helper;
