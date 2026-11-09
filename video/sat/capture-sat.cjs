// Snima stvarne ekrane aplikacije za video „22:15” (sat.html, 1:21–2:21).
// Kadar je 1600x768 (unutrašnjost okvira preglednika u sat.html), sat preglednika fiksiran na 8. 11. 2026.
// Ćelije s imenima obrtnika / fizičkih osoba („VL.”, „OBRT”) se mute.
// Treba: server s aplikacijom na 8766 (python3 -m http.server 8766 --directory app), playwright-core i Chrome (CHROME=...).
const path = require("path"), fs = require("fs");
const { chromium } = require(process.env.PW_PATH || "playwright-core");
const URL = "http://localhost:8766/";
const OUT = path.join(__dirname, "shots");
fs.rmSync(OUT, { recursive: true, force: true }); fs.mkdirSync(OUT, { recursive: true });
const DBK = "#opcina/41942358B7271748669279";

(async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROME || undefined });
  const ctx = await b.newContext({ viewport: { width: 1600, height: 768 }, deviceScaleFactor: 1.5, colorScheme: "dark" });
  await ctx.addInitScript(() => { try { localStorage.setItem("ks-upute", "skriveno"); } catch (e) {} });
  const p = await ctx.newPage();
  await p.clock.setFixedTime(new Date("2026-11-08T10:00:00"));
  const cekaj = (ms = 900) => p.waitForTimeout(ms);
  const zamuti = () => p.evaluate(() => {
    const PRIV = /\bVL\.|\bOBRT\b|\bvl\./;
    document.querySelectorAll("td, .mini-kartica, #m-naslov, #m-podnaslov").forEach((el) => { if (el.children.length < 4 && PRIV.test(el.textContent)) el.style.filter = "blur(6px)"; });
    // imena osoba u AI sažecima: istaknuta imena velikim slovima koja nisu tvrtke ni javna tijela
    const JAVNO = /D\.\s?O\.\s?O|D\.\s?D|J\.\s?D|GRAD|OPĆIN|ŽUPANIJ|UPRAV|LUČK|UDRUG|KLUB|DRUŠTV|USTANOV|ZAVOD|REPUBLIK|HRVATSK|MINISTAR|SAVEZ|ZADRUG|FOND|AGENCIJ|LUKA|TRGOVAČK|\bTD\b/;
    document.querySelectorAll("b, strong, em").forEach((el) => { const x = el.textContent.trim();
      if (PRIV.test(x) || /^[A-ZČĆŽŠĐ][A-ZČĆŽŠĐ.\- ]{4,}$/.test(x) && (PRIV.test(x) || (x.split(/\s+/).length >= 2 && !JAVNO.test(x)))) el.style.filter = "blur(6px)"; });
  });
  async function snimi(ime) { await zamuti(); await cekaj(150); await p.screenshot({ path: path.join(OUT, ime + ".png") }); console.log("snimljeno", ime); }
  const centroid = (naziv) => p.evaluate((naziv) => {
    const f = GRANICE.features.find((f) => f.properties.naziv === naziv);
    const prs = f.geometry.type === "Polygon" ? [f.geometry.coordinates[0]] : f.geometry.coordinates.map((q) => q[0]);
    const ring = prs.sort((a, b) => b.length - a.length)[0];
    return [ring.reduce((s, c) => s + c[0], 0) / ring.length, ring.reduce((s, c) => s + c[1], 0) / ring.length];
  }, naziv);
  const mapPx = (ll) => p.evaluate((ll) => {
    const el = document.getElementById("graf-karta"), c = echarts.getInstanceByDom(el), r = el.getBoundingClientRect();
    const [x, y] = c.convertToPixel({ seriesIndex: 0 }, ll); return [Math.round(r.x + x), Math.round(r.y + y)];
  }, ll);
  const uModal = (sel) => p.evaluate((sel) => { const e = document.querySelector(sel); e.scrollIntoView({ block: "start" }); }, sel);

  // ---------- KARTA ----------
  await p.goto(URL + "#karta"); await cekaj(1800);
  await p.selectOption("#f-pokazatelj", "naknada12"); await cekaj(1400);
  await snimi("k1");
  const dub = await mapPx(await centroid("Grad Dubrovnik"));
  await p.mouse.move(dub[0], dub[1]); await cekaj(800);
  await snimi("k2");
  await p.mouse.move(5, 5);

  // ---------- PROFIL + PRETPLATA ----------
  await p.goto(URL + DBK); await cekaj(1800);
  await snimi("o1");
  await p.click("#opcina-pretplata"); await cekaj(900);
  await snimi("o2");
  await p.keyboard.press("Escape"); await cekaj(400);

  // ---------- ŠTO ISTIČE → UGOVOR (AI, hodogram, dopis) ----------
  await p.goto(URL + "#sat"); await cekaj(1800);
  await p.selectOption("#f-razdoblje", "12"); await cekaj(1000);
  await snimi("s1");
  await p.evaluate(() => { document.getElementById("f-trazi").scrollIntoView({ block: "start" }); scrollBy(0, -100); });
  const rijec = "liburnia";
  for (let i = 2; i <= rijec.length; i += 2) { await p.fill("#f-trazi", rijec.slice(0, i)); await cekaj(450); await snimi("s2_" + i / 2); }
  const red = await p.$("#tablica-sat tbody tr[data-ugovor]");
  console.log("redak:", red ? (await red.textContent()).slice(0, 140) : "NEMA");
  await red.click(); await cekaj(1200);
  await snimi("m1");                             // AI sažetak stvarne namjene
  await uModal("#m-hodogram-kartica"); await cekaj(500);
  await snimi("m2");                             // zakonski hodogram
  await uModal("#m-dopis-tekst"); await p.evaluate(() => document.querySelector(".modal-tijelo, #modal-ugovor").scrollBy?.(0, -160)); await cekaj(500);
  await snimi("m3");                             // službeni dopis
  await p.click("#m-tip-zppi"); await cekaj(500);
  await snimi("m4");                             // ZPPI
  await p.click("#m-zatvori"); await cekaj(400);

  // ---------- RIZICI I REVIZIJA ----------
  await p.fill("#f-trazi", ""); await cekaj(300);
  await p.goto(URL + "#revizija"); await cekaj(1800);
  await snimi("r1");
  await p.evaluate(() => { document.querySelector("#ekran-revizija .dva-stupca").scrollIntoView({ block: "start" }); scrollBy(0, -80); }); await cekaj(600);
  await snimi("r2");

  await b.close();
})();
