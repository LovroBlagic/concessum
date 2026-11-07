// Snima stvarne ekrane aplikacije (oštro, 2x) za showcase video + manifest s položajima elemenata.
// Treba pokrenut server: python3 -m http.server 8766 --directory app
const path = require("path"), fs = require("fs");
const { chromium } = require(process.env.PW_PATH || "playwright-core");
const URL = "http://localhost:8766/";
const OUT = path.join(__dirname, "shots");
fs.rmSync(OUT, { recursive: true, force: true }); fs.mkdirSync(OUT, { recursive: true });
const M = {};

(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2, colorScheme: "dark" });
  const p = await ctx.newPage();
  const cekaj = (ms = 900) => p.waitForTimeout(ms);
  // viewport visok kao dokument -> jedan screenshot = cijela stranica, bez resize efekata
  async function visina() {
    const h = await p.evaluate(() => Math.max(900, document.documentElement.scrollHeight));
    await p.setViewportSize({ width: 1440, height: h }); await cekaj(500); return h;
  }
  async function rects(sel) {
    return p.evaluate((sel) => Object.fromEntries(Object.entries(sel).map(([k, s]) => {
      const e = document.querySelector(s); if (!e) return [k, null];
      const r = e.getBoundingClientRect(); return [k, [Math.round(r.x), Math.round(r.y + scrollY), Math.round(r.width), Math.round(r.height)]];
    })), sel);
  }
  async function snimi(ime, sel = {}, extra = {}) {
    const h = await p.evaluate(() => document.documentElement.scrollHeight);
    await p.screenshot({ path: path.join(OUT, ime + ".png") });
    M[ime] = { h: Math.max(900, h), r: await rects(sel), ...extra };
    console.log("snimljeno", ime, M[ime].h);
  }
  const mapPx = (lonlat) => p.evaluate((ll) => {
    const el = document.getElementById("graf-karta"), c = echarts.getInstanceByDom(el), r = el.getBoundingClientRect();
    const [x, y] = c.convertToPixel({ seriesIndex: 0 }, ll); return [Math.round(r.x + x), Math.round(r.y + y + scrollY)];
  }, lonlat);
  const KSEL = { kpi: "#kpi", karta: "#graf-karta", kartaKartica: ".karta-kartica", poredak: ".poredak", pok: "#f-pokazatelj", sektor: "#f-sektor",
    nav: ".nav", navSat: '[data-ruta="sat"]', navOpc: '[data-ruta="opcina"]', navMet: '[data-ruta="metodologija"]', prvi: "#poredak li:first-child" };

  // ---------- KARTA ----------
  await p.goto(URL + "#karta"); await cekaj(1500); await visina(); await cekaj(800);
  await snimi("k1", KSEL);
  const dubLL = await p.evaluate(() => {
    const f = GRANICE.features.find((f) => f.properties.naziv === "Grad Dubrovnik");
    const ring = f.geometry.coordinates.map((q) => q[0]).sort((a, b) => b.length - a.length)[0];
    return [ring.reduce((s, c) => s + c[0], 0) / ring.length, ring.reduce((s, c) => s + c[1], 0) / ring.length];
  });
  const dub = [691, 814]; void dubLL; const _x = 0, split = await mapPx([16.45, 43.52]);
  await p.mouse.move(split[0], split[1]); await cekaj(700);
  await snimi("k2", KSEL, { mis: split });
  await p.mouse.move(5, 5); await cekaj(300);
  await p.selectOption("#f-pokazatelj", "istjece12"); await cekaj(1200);
  await snimi("k3", KSEL);
  await p.selectOption("#f-sektor", "pomorsko"); await cekaj(1200);
  await snimi("k4", KSEL);
  await p.selectOption("#f-sektor", ""); await cekaj(1000);
  await snimi("k5", KSEL, { dub });   // istjece12, svi sektori

  // ---------- PROFIL (klik na Dubrovnik) ----------
  await p.mouse.click(dub[0], dub[1]); await cekaj(1500);
  const hash = await p.evaluate(() => location.hash); console.log("nakon klika:", hash);
  if (!hash.startsWith("#opcina/41942358B7271748669279")) { await p.goto(URL + "#opcina/41942358B7271748669279"); await cekaj(1500); } await visina(); await cekaj(900);
  const PSEL = { kpi: "#opcina-kpi", sazetak: "#opcina-sazetak", vrijeme: "#graf-opcina-vrijeme", nastavak: "#graf-opcina-nastavak",
    tablica: "#tablica-opcina", sel: "#f-opcina", naslov: "#h-opcina", thKon: '#tablica-opcina [data-sort="kon"]', trazi: "#f-trazi", nav: ".nav" };
  await snimi("p1", PSEL);
  await p.click('#tablica-opcina [data-sort="kon"]'); await cekaj(700);
  await snimi("p2", PSEL);
  // druga općina preko izbornika
  await p.selectOption("#f-opcina", { label: "Grad Rijeka" }); await cekaj(1500); await visina(); await cekaj(900);
  await snimi("p3", PSEL);

  // ---------- ŠTO ISTIČE ----------
  await p.setViewportSize({ width: 1440, height: 900 });
  await p.goto(URL + "#sat"); await cekaj(1500); await visina(); await cekaj(900);
  const SSEL = { graf: "#graf-sat", razd: "#f-razdoblje", trazi: "#f-trazi", tablica: "#tablica-sat", naslovT: "#tablica-sat-naslov", kartica: "#ekran-sat .kartica", nav: ".nav", sektor: "#f-sektor" };
  await snimi("s1", SSEL);
  await p.selectOption("#f-razdoblje", "24"); await cekaj(1300); await visina(); await cekaj(600);
  await snimi("s2", SSEL);
  const bar = await p.evaluate(() => {
    const el = document.getElementById("graf-sat"), c = echarts.getInstanceByDom(el), r = el.getBoundingClientRect();
    const x = c.convertToPixel({ xAxisIndex: 0 }, 1), y = c.convertToPixel({ yAxisIndex: 0 }, 60);
    return [Math.round(r.x + x), Math.round(r.y + y + scrollY)];
  });
  await p.mouse.move(bar[0], bar[1]); await cekaj(700);
  await snimi("s3", SSEL, { bar });       // tooltip na stupcu
  await p.mouse.click(bar[0], bar[1]); await cekaj(1000); await p.mouse.move(5, 5); await visina(); await cekaj(700);
  await snimi("s4", SSEL, { bar });       // tablica filtrirana na mjesec
  await p.click("#sat-ponisti"); await cekaj(800);
  const rijec = "taksi";
  for (let i = 1; i <= rijec.length; i++) {
    await p.fill("#f-trazi", rijec.slice(0, i)); await cekaj(450); await visina(); await cekaj(300);
    await snimi("s5_" + i, SSEL);
  }

  // ---------- METODOLOGIJA ----------
  await p.setViewportSize({ width: 1440, height: 900 });
  await p.goto(URL + "#metodologija"); await cekaj(800); await visina();
  await snimi("m1", { naslov: "#h-met", nav: ".nav" });

  // ---------- SVIJETLA TEMA ----------
  const ctx2 = await b.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2, colorScheme: "light" });
  const p2 = await ctx2.newPage();
  await p2.goto(URL + "#karta"); await p2.waitForTimeout(1600);
  await p2.screenshot({ path: path.join(OUT, "svijetlo.png") });
  M.svijetlo = { h: 900, r: {} };

  // ---------- MOBITEL ----------
  for (const [ime, h] of [["mob_karta", "#karta"], ["mob_opcina", "#opcina/41942358B7271748669279"], ["mob_sat", "#sat"]]) {
    const c = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, colorScheme: "dark", isMobile: true, hasTouch: true });
    const m = await c.newPage(); await m.goto(URL + h); await m.waitForTimeout(1600);
    const hh = await m.evaluate(() => document.documentElement.scrollHeight);
    await m.screenshot({ path: path.join(OUT, ime + ".png"), fullPage: true });
    M[ime] = { h: hh, r: {} }; console.log("snimljeno", ime, hh);
    await c.close();
  }
  await b.close();
  fs.writeFileSync(path.join(OUT, "manifest.js"), "window.MANIFEST=" + JSON.stringify(M) + ";\n");
})();
