// QA capture helper: drives headless Edge (puppeteer-core) against the local dev server.
// usage:
//   node scripts/qa/shot.mjs --url /pro --width 1440 --height 900 --out shots/pro.png [--full]
//     [--wait 1500] [--print] [--eval "document.title"] [--steps '<json array>']
// steps (JSON array, executed in order):
//   {"click":"css"} {"hover":"css"} {"focus":"css"} {"type":["css","text"]} {"fill":["css","text"]}
//   {"select":["css","value"]} {"press":"Tab"} {"tabs":5} {"wait":500} {"scroll":1200} {"scrollTo":"css"}
//   {"eval":"js expression"} {"shot":"path.png"} {"shotFull":"path.png"} {"viewport":[390,812]} {"reload":true}
//   {"media":"print"} {"offline":true} {"online":true} {"clip":["css","path.png"]}
// Prints a JSON object {evals:[...], errors:[...consoleErrors]} to stdout at the end.
import puppeteer from "puppeteer-core";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";

const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(`--${k}`); return i >= 0 ? args[i + 1] : d; };
const flag = (k) => args.includes(`--${k}`);
const base = opt("base", "http://localhost:3400");
let path = opt("url", "/") || "/";
// Git Bash rewrites "/pro" into a Windows path; recover the route from the last segment when that happens.
if (/^[A-Za-z]:/.test(path)) path = "/" + path.split(/[\/]/).pop().replace(/^index$/, "");
if (!path.startsWith("/")) path = "/" + path;
const url = base + path;
const width = Number(opt("width", 1440));
const height = Number(opt("height", 900));
const out = opt("out", "");
const wait = Number(opt("wait", 1500));
const steps = JSON.parse(opt("steps", "[]"));
const evalExpr = opt("eval", "");
const EDGE = process.env.EDGE_PATH || "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";

// Edge on Windows re-spawns itself and the launcher exits 0, which breaks puppeteer.launch().
// So we spawn Edge with a debugging port ourselves and connect to it.
import { spawn } from "node:child_process";
const profile = resolve(process.env.TEMP || "C:\Temp", `relab-qa-${process.pid}`);
const port = 9300 + (process.pid % 900);
const child = spawn(EDGE, [
  "--headless=new", "--disable-gpu", "--hide-scrollbars", "--no-first-run", "--disable-extensions", "--lang=ko-KR",
  `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, "about:blank",
], { detached: true, stdio: "ignore", windowsHide: true });
child.unref();
let browser = null;
for (let i = 0; i < 60 && !browser; i++) {
  try {
    const r = await fetch(`http://127.0.0.1:${port}/json/version`);
    if (r.ok) browser = await puppeteer.connect({ browserURL: `http://127.0.0.1:${port}`, defaultViewport: null });
  } catch { await new Promise((res) => setTimeout(res, 500)); }
}
if (!browser) { console.error("Edge did not expose a debugging port"); process.exit(2); }
const page = await browser.newPage();
try {
await page.setViewport({ width, height, deviceScaleFactor: 1, isMobile: width < 768, hasTouch: width < 768 });
const errors = [];
page.on("console", (m) => { if (m.type() === "error") errors.push(m.text().slice(0, 300)); });
page.on("pageerror", (e) => errors.push("pageerror: " + String(e).slice(0, 300)));
if (flag("offline")) await page.setOfflineMode(true);
await page.goto(url, { waitUntil: "networkidle2", timeout: 60000 });
await new Promise((r) => setTimeout(r, wait));
if (flag("print")) await page.emulateMediaType("print");

const evals = [];
const ensureDir = (p) => { try { mkdirSync(dirname(resolve(p)), { recursive: true }); } catch {} };
for (const s of steps) {
  try {
    if (s.click) await page.click(s.click);
    else if (s.hover) await page.hover(s.hover);
    else if (s.focus) await page.focus(s.focus);
    else if (s.type) { await page.click(s.type[0], { clickCount: 3 }); await page.keyboard.type(String(s.type[1])); }
    else if (s.fill) { await page.$eval(s.fill[0], (el, v) => { const set = Object.getOwnPropertyDescriptor(el.__proto__, "value").set; set.call(el, v); el.dispatchEvent(new Event("input", { bubbles: true })); el.dispatchEvent(new Event("change", { bubbles: true })); }, String(s.fill[1])); }
    else if (s.select) await page.select(s.select[0], String(s.select[1]));
    else if (s.press) await page.keyboard.press(s.press);
    else if (s.tabs) { for (let i = 0; i < s.tabs; i++) await page.keyboard.press("Tab"); }
    else if (s.wait) await new Promise((r) => setTimeout(r, s.wait));
    else if (s.scroll !== undefined) await page.evaluate((y) => window.scrollTo(0, y), s.scroll);
    else if (s.scrollTo) await page.$eval(s.scrollTo, (el) => el.scrollIntoView({ block: "start" }));
    else if (s.eval) evals.push(await page.evaluate(s.eval));
    else if (s.shot) { ensureDir(s.shot); await page.screenshot({ path: s.shot }); }
    else if (s.shotFull) { ensureDir(s.shotFull); await page.screenshot({ path: s.shotFull, fullPage: true }); }
    else if (s.clip) { const el = await page.$(s.clip[0]); if (el) { ensureDir(s.clip[1]); await el.screenshot({ path: s.clip[1] }); } else evals.push({ clipMissing: s.clip[0] }); }
    else if (s.viewport) await page.setViewport({ width: s.viewport[0], height: s.viewport[1], deviceScaleFactor: 1 });
    else if (s.reload) { await page.reload({ waitUntil: "networkidle2" }); await new Promise((r) => setTimeout(r, wait)); }
    else if (s.media) await page.emulateMediaType(s.media);
    else if (s.offline) await page.setOfflineMode(true);
    else if (s.online) await page.setOfflineMode(false);
  } catch (e) { evals.push({ stepError: JSON.stringify(s).slice(0, 120), message: String(e).slice(0, 200) }); }
}
if (evalExpr) evals.push(await page.evaluate(evalExpr));
if (out) { ensureDir(out); await page.screenshot({ path: out, fullPage: flag("full") }); }
console.log(JSON.stringify({ url, width, height, out: out || null, evals, errors }, null, 1));
} finally { try { await browser.close(); } catch {} }
