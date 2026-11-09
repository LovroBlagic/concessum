// Snima stvarne animacije sučelja (CDP screencast) u isječke za video v2.
// Svaki isječak: niz JPEG kadrova s vremenskim oznakama -> MP4 30 fps (svi kadrovi ključni, za točno premotavanje).
// Sat preglednika kreće od 8. 11. 2026. 10:00 i teče normalno. Imena obrtnika / fizičkih osoba se mute.
// Treba: server s aplikacijom na 8766, playwright-core, Chrome (CHROME=...), ffmpeg.
// Upotreba: node video/v2/snimi.cjs [ime_isjecka ...]
const path = require("path"), fs = require("fs"), { execFileSync } = require("child_process");
const { chromium } = require(process.env.PW_PATH || "playwright-core");
const URL = "http://localhost:8766/";
const OUT = path.join(__dirname, "isjecci");
fs.mkdirSync(OUT, { recursive: true });
const W = 1600, H = 900;
const DBK = "#opcina/41942358B7271748669279";

const ZAMUTI = () => {
  try { localStorage.setItem("ks-upute", "skriveno"); } catch (e) {}
  const PRIV = /\bVL\.|\bOBRT\b|\bvl\./;
  const JAVNO = /D\.\s?O\.\s?O|D\.\s?D|J\.\s?D|GRAD|OPĆIN|ŽUPANIJ|UPRAV|LUČK|UDRUG|KLUB|DRUŠTV|USTANOV|ZAVOD|REPUBLIK|HRVATSK|MINISTAR|SAVEZ|ZADRUG|FOND|AGENCIJ|LUKA|TRGOVAČK|\bTD\b/;
  const radi = () => {
    document.querySelectorAll("td, .mini-kartica, #m-naslov, #m-podnaslov").forEach((el) => { if (el.children.length < 4 && PRIV.test(el.textContent)) el.style.filter = "blur(6px)"; });
    document.querySelectorAll("b, strong, em").forEach((el) => { const x = el.textContent.trim();
      if (PRIV.test(x) || (/^[A-ZČĆŽŠĐ][A-ZČĆŽŠĐ.\- ]{4,}$/.test(x) && x.split(/\s+/).length >= 2 && !JAVNO.test(x))) el.style.filter = "blur(6px)"; });
  };
  const kreni = () => { radi(); new MutationObserver(radi).observe(document.body, { childList: true, subtree: true }); };
  if (document.body) kreni(); else document.addEventListener("DOMContentLoaded", kreni);
};

const ISJECCI = {
  // Karta: KPI se odbroje, fitilj izgori, pa karta i poredak (hover istakne općinu)
  async karta(p, c) {
    await p.goto(URL + "#karta"); await c(4500);
    await p.mouse.move(800, 300, { steps: 25 }); await c(800);
    await p.mouse.wheel(0, 520); await c(1800);
    const li = await p.$("#poredak li:nth-child(2)");
    if (li) { const b = await li.boundingBox(); await p.mouse.move(b.x + 60, b.y + b.height / 2, { steps: 30 }); await c(2200); }
    const li2 = await p.$("#poredak li:nth-child(5)");
    if (li2) { const b = await li2.boundingBox(); await p.mouse.move(b.x + 60, b.y + b.height / 2, { steps: 20 }); await c(2000); }
  },
  // 3D sat: premotavanje 3 godine
  async tri(p, c) {
    await p.goto(URL + "#3d"); await c(3500);
    await p.click("#tri-play"); await c(16000);
  },
  // Što ističe -> ugovor: AI sažetak, hodogram, dopis i ZPPI
  async ugovor(p, c) {
    await p.goto(URL + "#sat"); await c(3200);
    await p.click("#f-trazi"); await p.keyboard.type("liburnia", { delay: 110 }); await c(1500);
    const red = await p.$("#tablica-sat tbody tr[data-ugovor]");
    const b = await red.boundingBox(); await p.mouse.move(b.x + 300, b.y + b.height / 2, { steps: 20 }); await c(500);
    await red.click(); await c(5200);
    for (let i = 0; i < 8; i++) { await p.evaluate(() => { const m = document.querySelector("#modal-ugovor .modal-tijelo") || document.querySelector("#modal-ugovor"); m.scrollBy({ top: 90, behavior: "smooth" }); }); await c(260); }
    await p.evaluate(() => document.getElementById("m-hodogram-kartica").scrollIntoView({ behavior: "smooth", block: "start" })); await c(5200);
    await p.evaluate(() => document.getElementById("m-dopis-tekst").scrollIntoView({ behavior: "smooth", block: "center" })); await c(2600);
    await p.click("#m-tip-zppi"); await c(3000);
  },
  // Profil Dubrovnika i pretplata na rokove
  async profil(p, c) {
    await p.goto(URL + DBK); await c(3500);
    for (let i = 0; i < 6; i++) { await p.mouse.wheel(0, 130); await c(330); }
    await c(1500);
    await p.evaluate(() => scrollTo({ top: 0, behavior: "smooth" })); await c(1500);
    await p.click("#opcina-pretplata"); await c(3500);
  },
  // Rizici i revizija
  async revizija(p, c) {
    await p.goto(URL + "#revizija"); await c(3500);
    await p.click('[data-rizik="2"]'); await c(2200);
    await p.click('[data-rizik="1"]'); await c(1800);
    await p.evaluate(() => document.querySelector("#ekran-revizija .dva-stupca").scrollIntoView({ behavior: "smooth", block: "start" })); await c(4000);
  },
};

(async () => {
  const imena = process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(ISJECCI);
  const b = await chromium.launch({ executablePath: process.env.CHROME || undefined, args: ["--use-angle=metal", "--enable-gpu"] });
  for (const ime of imena) {
    const ctx = await b.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1.5, colorScheme: "dark" });
    await ctx.addInitScript(ZAMUTI);
    const p = await ctx.newPage();
    await p.clock.install({ time: new Date("2026-11-08T10:00:00") }); await p.clock.resume();
    const dir = path.join(OUT, ime + "_k"); fs.rmSync(dir, { recursive: true, force: true }); fs.mkdirSync(dir);
    const cdp = await ctx.newCDPSession(p);
    const kadrovi = [];
    cdp.on("Page.screencastFrame", async (e) => {
      const n = kadrovi.length; fs.writeFileSync(path.join(dir, `k${String(n).padStart(5, "0")}.jpg`), Buffer.from(e.data, "base64"));
      kadrovi.push(e.metadata.timestamp);
      cdp.send("Page.screencastFrameAck", { sessionId: e.sessionId }).catch(() => {});
    });
    const c = (ms) => p.waitForTimeout(ms);
    await p.goto("about:blank");
    await cdp.send("Page.startScreencast", { format: "jpeg", quality: 92, maxWidth: W * 1.5, maxHeight: H * 1.5, everyNthFrame: 1 });
    const t0 = Date.now() / 1000;
    await ISJECCI[ime](p, c);
    await c(400);
    await cdp.send("Page.stopScreencast");
    await ctx.close();
    // concat s trajanjima -> 30 fps
    const lista = kadrovi.map((ts, i) => `file 'k${String(i).padStart(5, "0")}.jpg'\nduration ${((kadrovi[i + 1] ?? ts + 1 / 30) - ts).toFixed(4)}`).join("\n")
      + `\nfile 'k${String(kadrovi.length - 1).padStart(5, "0")}.jpg'\n`;
    fs.writeFileSync(path.join(dir, "popis.txt"), lista);
    const mp4 = path.join(OUT, ime + ".mp4");
    execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-f", "concat", "-safe", "0", "-i", path.join(dir, "popis.txt"),
      "-vf", `fps=30,scale=${W * 1.5}:${H * 1.5}:flags=lanczos,format=yuv420p`, "-c:v", "libx264", "-preset", "fast", "-crf", "16", "-g", "1", mp4]);
    const tr = execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", mp4]).toString().trim();
    console.log(`${ime}: ${kadrovi.length} kadrova, ${tr} s, ${(kadrovi.length / (Date.now() / 1000 - t0)).toFixed(1)} fps`);
  }
  await b.close();
})();
