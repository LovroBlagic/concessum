// Renderira kompoziciju (HTML s window.renderFrame) u PNG kadrove (1920x1080, 30 fps) i spaja ih ffmpegom u MP4 bez zvuka.
// Upotreba:
//   node video/render.cjs                                         -> video/koncesijski_sat.mp4 (30 s promo)
//   node video/render.cjs --html showcase/showcase.html --izlaz showcase_60s.mp4
//   node video/render.cjs --html showcase/showcase.html --kadrovi 5,12.5,30   -> samo te sekunde kao PNG
// Trajanje se čita iz window.TRAJANJE. Treba: playwright-core (PW_PATH ili lokalno) i ffmpeg u PATH-u.
const path = require("path"), fs = require("fs"), { execFileSync } = require("child_process");
const { chromium } = require(process.env.PW_PATH || "playwright-core");

const FPS = 30, DIR = __dirname;
const arg = process.argv.slice(2), opt = (k, d) => { const i = arg.indexOf("--" + k); return i >= 0 ? arg[i + 1] : d; };
(async () => {
  const html = path.join(DIR, opt("html", "motion.html"));
  const kadrovi = opt("kadrovi") ? opt("kadrovi").split(",").map(Number) : null;
  const ime = path.basename(html, ".html");
  const izlaz = path.join(DIR, kadrovi ? `provjera_${ime}` : `frames_${ime}`);
  fs.rmSync(izlaz, { recursive: true, force: true }); fs.mkdirSync(izlaz, { recursive: true });

  const b = await chromium.launch({ args: ["--allow-file-access-from-files"] });
  const p = await b.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
  await p.goto("file://" + html + "?render=1");
  await p.waitForFunction(() => typeof window.renderFrame === "function");
  await p.evaluate(async () => { await document.fonts.ready; await Promise.all([...document.images].map((i) => i.decode().catch(() => {}))); });
  const trajanje = await p.evaluate(() => window.TRAJANJE);

  const lista = kadrovi ? kadrovi.map((s) => Math.round(s * FPS)) : [...Array(trajanje * FPS).keys()];
  const t0 = Date.now();
  for (const [i, f] of lista.entries()) {
    await p.evaluate((f) => window.renderFrame(f), f);
    const n = kadrovi ? `t${(f / FPS).toFixed(2).padStart(5, "0")}.png` : `f${String(f).padStart(4, "0")}.png`;
    await p.screenshot({ path: path.join(izlaz, n), type: "png" });
    if (!kadrovi && i % 150 === 0) console.log(`kadar ${f}/${lista.length} (${((Date.now() - t0) / 1000).toFixed(0)} s)`);
  }
  await b.close();
  if (kadrovi) return console.log("kadrovi u", izlaz);

  const mp4 = path.join(DIR, opt("izlaz", "koncesijski_sat.mp4"));
  execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-framerate", String(FPS), "-i", path.join(izlaz, "f%04d.png"),
    "-c:v", "libx264", "-preset", "slow", "-crf", "17", "-pix_fmt", "yuv420p", "-movflags", "+faststart", "-an", mp4], { stdio: "inherit" });
  fs.rmSync(izlaz, { recursive: true, force: true });
  console.log("gotovo:", mp4);
})();
