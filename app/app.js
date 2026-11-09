/* Koncesijski sat — statična aplikacija (ECharts, bez build koraka). */
(function () {
  "use strict";
  const P = window.PODACI, G = window.GRANICE;
  const $ = (s) => document.querySelector(s);
  const fmt = new Intl.NumberFormat("hr-HR");
  const pct = (x) => x == null ? "–" : (x * 100).toLocaleString("hr-HR", { maximumFractionDigits: 0 }) + " %";
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const eurC = new Intl.NumberFormat("hr-HR", { notation: "compact", maximumFractionDigits: 1 });
  const eur = (x) => x == null ? "–" : (x >= 1e4 ? eurC.format(x) : fmt.format(Math.round(x))) + " €";
  const eurPun = (x) => x == null ? "" : fmt.format(Math.round(x)) + " €";
  const spremi = (k, v) => { try { localStorage.setItem("ks-" + k, v); } catch (e) { /* privatni prozor */ } };
  const ucitaj = (k) => { try { return localStorage.getItem("ks-" + k); } catch (e) { return null; } };
  const MJ = ["sij", "velj", "ožu", "tra", "svi", "lip", "srp", "kol", "ruj", "lis", "stu", "pro"];
  const MIN_ZRELIH = 5; // općina treba barem toliko isteklih ugovora da udio ima smisla

  // ---------- datumi ----------
  const DANAS = new Date(); DANAS.setHours(0, 0, 0, 0);
  const plusMj = (d, m) => { const x = new Date(d); x.setMonth(x.getMonth() + m); return x; };
  const parse = (s) => s ? new Date(s + "T00:00:00") : null;
  const hrDat = (d) => d ? `${d.getDate()}. ${d.getMonth() + 1}. ${d.getFullYear()}.` : "–";
  const za = (d) => {
    const dana = Math.round((d - DANAS) / 864e5);
    if (dana < 0) return `prije ${fmt.format(-dana)} d.`;
    if (dana < 60) return dana === 0 ? "danas" : `za ${dana} d.`;
    return `za ${Math.round(dana / 30.4)} mj.`;
  };
  const M6 = plusMj(DANAS, 6), M12 = plusMj(DANAS, 12), M24 = plusMj(DANAS, 24);

  // ---------- priprema podataka ----------
  const nazivOpcine = {};
  G.features.forEach((f) => { nazivOpcine[f.properties.name] = f.properties.naziv; });
  const sektorNaziv = Object.fromEntries(P.sektori);
  const U = P.ugovori.map((r, i) => {
    const doD = parse(r[5]);
    return {
      i, di: r[0], dav: P.davatelji[r[0]], kon: P.koncesionari[r[1]], vrsta: P.vrste[r[2]],
      sektor: P.vrsteSektor[r[2]], opc: r[3] >= 0 ? P.opcine[r[3]] : null,
      od: parse(r[4]), do: doD, nast: r[6], lok: r[7], nak: r[8],
      st: doD < DANAS ? "istekla" : doD < M6 ? "hitno" : doD < M24 ? "istjece" : "aktivna",
    };
  });
  const NAST = ["", "obnovljena", "zamjena", "bez nastavka"];
  const NAST_KL = ["", "na-obnovljena", "na-zamjena", "na-bez"];
  const ST_TXT = { istekla: "istekla", hitno: "< 6 mj.", istjece: "< 24 mj.", aktivna: "aktivna" };

  // ---------- boje ----------
  const css = (v) => getComputedStyle(document.documentElement).getPropertyValue(v).trim();
  const SEKTOR_BOJE = {
    luke: "#2a6fdb", pomorsko: "#16a3b0", zdravstvo: "#c94f7c", komunalno: "#e08a1e", rudarstvo: "#7a5c3e",
    vode: "#5aa9e6", mediji: "#8e6bd1", poljoprivreda: "#4f9a3a", turizam: "#d4b106", promet: "#6b7280", ostalo: "#a3a3a3",
  };

  // ---------- stanje ----------
  const S = { sektor: "", pokazatelj: "udio", razdoblje: 12, trazi: "", mjesec: null, opcina: null, sort: { opc: ["do", -1] } };
  const filt = (u) => !S.sektor || u.sektor === S.sektor;
  let satLista = [], satNaslov = "istjece", opcLista = [];

  // ---------- filteri ----------
  const fs = $("#f-sektor");
  fs.innerHTML = `<option value="">Svi sektori</option>` + P.sektori
    .map(([k, n]) => `<option value="${k}">${esc(n)}</option>`).join("");
  fs.onchange = () => { S.sektor = fs.value; S.mjesec = null; prikazi(); };
  $("#f-pokazatelj").onchange = (e) => { S.pokazatelj = e.target.value; prikazi(); };
  $("#f-razdoblje").onchange = (e) => { S.razdoblje = +e.target.value; S.mjesec = null; prikazi(); };
  let tId; $("#f-trazi").oninput = (e) => { clearTimeout(tId); tId = setTimeout(() => { S.trazi = e.target.value.trim().toLowerCase(); prikazi(); }, 150); };
  $("#sat-ponisti").onclick = () => { S.mjesec = null; prikazi(); };
  const trazi = (u) => !S.trazi || (u.kon + " " + u.dav + " " + u.vrsta + " " + u.lok + " " + (nazivOpcine[u.opc] || "")).toLowerCase().includes(S.trazi);

  const opcSel = $("#f-opcina");
  const opcSortirane = Object.keys(nazivOpcine).sort((a, b) => nazivOpcine[a].replace(/^(Grad|Općina) /, "")
    .localeCompare(nazivOpcine[b].replace(/^(Grad|Općina) /, ""), "hr"));
  opcSel.innerHTML = opcSortirane.map((k) => `<option value="${k}">${esc(nazivOpcine[k])}</option>`).join("");
  opcSel.onchange = () => { location.hash = "#opcina/" + opcSel.value; };

  // ---------- agregati ----------
  function agregat(lista) {
    // n12 = godišnja fiksna naknada ugovora koji ističu u 12 mj.; nbez = naknada isteklih bez nastavka
    const a = { uk: 0, akt: 0, i12: 0, i6: 0, ist: 0, zr: 0, bez: 0, obn: 0, zam: 0, n12: 0, nakt: 0, nbez: 0 };
    for (const u of lista) {
      a.uk++;
      const n = u.nak || 0;
      if (u.do >= DANAS) { a.akt++; a.nakt += n; if (u.do < M12) { a.i12++; a.n12 += n; } if (u.do < M6) a.i6++; } else a.ist++;
      if (u.nast) { a.zr++; if (u.nast === 3) { a.bez++; a.nbez += n; } else if (u.nast === 1) a.obn++; else a.zam++; }
    }
    a.udio = a.zr ? a.bez / a.zr : null;
    return a;
  }
  function poOpcini() {
    const m = {};
    for (const u of U) if (u.opc && filt(u)) (m[u.opc] = m[u.opc] || []).push(u);
    const r = {};
    for (const k in m) r[k] = agregat(m[k]);
    return r;
  }

  // ---------- grafovi ----------
  echarts.registerMap("hr", G);
  const grafovi = {};
  // Graf u skrivenom ekranu ima širinu 0: ako mu se tada promijeni veličina, ECharts ga smanji na 100 px
  // i takav ostane kad se ekran ponovno prikaže (graf „nestane“). Zato se mijenja samo veličina vidljivih
  // grafova, a ResizeObserver uskladi graf čim mu spremnik dobije stvarnu veličinu.
  const vidljiv = (g) => { const el = g.getDom(); return el.clientWidth > 0 && el.clientHeight > 0; };
  const uskladi = () => Object.values(grafovi).forEach((g) => {
    if (vidljiv(g) && (g.getWidth() !== g.getDom().clientWidth || g.getHeight() !== g.getDom().clientHeight)) g.resize();
  });
  const graf = (id) => {
    if (grafovi[id]) return grafovi[id];
    const el = document.getElementById(id), g = echarts.init(el, null, { renderer: "canvas" });
    if (window.ResizeObserver) new ResizeObserver(() => { if (vidljiv(g)) g.resize(); }).observe(el);
    return (grafovi[id] = g);
  };
  window.addEventListener("resize", uskladi);
  const osnova = () => ({
    textStyle: { color: css("--tekst"), fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif" },
    tooltip: { backgroundColor: css("--povrsina"), borderColor: css("--rub"), textStyle: { color: css("--tekst") } },
  });
  const os = () => ({ axisLine: { lineStyle: { color: css("--rub") } }, axisLabel: { color: css("--tekst-2") }, splitLine: { lineStyle: { color: css("--rub") } } });

  // ---------- KPI ----------
  function kpi(el, stavke) {
    el.innerHTML = stavke.map(([v, op, kl, obj]) => `<div class="kpi ${kl || ""}"${obj ? ` title="${esc(obj)}"` : ""}><div class="kpi-vr">${v}</div><div class="kpi-op">${op}</div>${obj ? `<div class="kpi-obj">${esc(obj)}</div>` : ""}</div>`).join("");
  }
  function kpiGlobal() {
    const a = agregat(U.filter(filt));
    kpi($("#kpi"), [
      [fmt.format(a.akt), "aktivnih ugovora", "", "Ugovori kojima rok još nije istekao."],
      [fmt.format(a.i6), "ističe u 6 mjeseci", "hitno", "Za ove ugovore novi postupak treba biti u tijeku već sada."],
      [fmt.format(a.i12), "ističe u 12 mjeseci", "", "Vrijeme za pripremu novog natječaja."],
      [eur(a.n12), "godišnje naknade ističe u 12 mj.", "novac", "Ugovorena fiksna godišnja naknada ugovora koji ističu; bez novog ugovora taj prihod prestaje."],
      [pct(a.udio), "isteklih bez nastavka", "naglasak", "Od ugovora isteklih prije više od godinu dana (bez zdravstva), udio koji nije obnovljen niti zamijenjen."],
    ]);
  }

  // ---------- KARTA ----------
  const POK = {
    udio: { naslov: "Udio isteklih koncesija bez nastavka", opis: `Od ugovora isteklih prije više od 12 mjeseci (bez zdravstva): koliko ih nije obnovljeno niti zamijenjeno novim ugovorom iste vrste. Sivo: manje od ${MIN_ZRELIH} takvih ugovora.`, v: (a) => a.zr >= MIN_ZRELIH ? a.udio : null, f: pct, boje: ["#f3e9c6", "#e9a96b", "#d2541b", "#7f1d1d"] },
    istjece12: { naslov: "Koncesije koje ističu u idućih 12 mjeseci", opis: "Broj ugovora kojima istječe rok u sljedećih godinu dana: tu bi davatelj već trebao pripremati novi postupak.", v: (a) => a.i12 || null, f: fmt.format, boje: ["#fdf0c4", "#f0b545", "#c8412d", "#6e1a12"] },
    aktivne: { naslov: "Aktivne koncesije", opis: "Broj ugovora koji danas vrijede.", v: (a) => a.akt || null, f: fmt.format, boje: ["#d8f0ee", "#6cc0c0", "#0b6e74", "#073b3f"] },
    naknada12: { naslov: "Godišnja naknada koja ističe u 12 mjeseci", opis: "Zbroj ugovorene fiksne godišnje naknade (EUR) za ugovore koji ističu u sljedećih godinu dana: koliko prihoda ovisi o tome hoće li novi ugovor biti sklopljen na vrijeme.", v: (a) => a.n12 || null, f: eur, boje: ["#fdf0c4", "#f0b545", "#c8412d", "#6e1a12"] },
    bez: { naslov: "Istekle koncesije bez nastavka (broj)", opis: "Broj ugovora isteklih prije više od 12 mjeseci za koje nije pronađen novi ugovor iste vrste u općini (bez zdravstva).", v: (a) => a.bez || null, f: fmt.format, boje: ["#f3e9c6", "#e9a96b", "#d2541b", "#7f1d1d"] },
  };
  function karta() {
    const po = poOpcini(), p = POK[S.pokazatelj];
    $("#karta-naslov").textContent = p.naslov + (S.sektor ? ` · ${sektorNaziv[S.sektor]}` : "");
    $("#karta-opis").textContent = p.opis;
    const data = G.features.map((f) => {
      const a = po[f.properties.name];
      const v = a ? p.v(a) : null;
      return { name: f.properties.name, value: v == null ? NaN : v, a };
    });
    const vr = data.map((d) => d.value).filter((v) => !isNaN(v)).sort((x, y) => x - y);
    const max = S.pokazatelj === "udio" ? 1 : (vr[Math.floor(vr.length * 0.97)] || 1);
    const g = graf("graf-karta");
    g.setOption({
      ...osnova(),
      tooltip: { ...osnova().tooltip, trigger: "item", formatter: (d) => {
        const a = d.data && d.data.a, n = esc(nazivOpcine[d.name] || d.name);
        if (!a) return `<b>${n}</b><br>nema ugovora u registru`;
        return `<b>${n}</b><br>${p.naslov}: <b>${isNaN(d.value) ? "–" : p.f(d.value)}</b><br>` +
          `aktivne ${fmt.format(a.akt)} · ističe u 12 mj. ${fmt.format(a.i12)} (${eur(a.n12)}/god.)<br>istekle bez nastavka ${fmt.format(a.bez)} / ${fmt.format(a.zr)}<br><i>klik za profil općine</i>`;
      } },
      visualMap: { min: 0, max, calculable: true, left: 8, bottom: 8, inRange: { color: p.boje },
        textStyle: { color: css("--tekst-2") }, itemHeight: 120, formatter: (v) => p.f(v) },
      series: [{ type: "map", map: "hr", roam: true, scaleLimit: { min: 1, max: 12 }, nameProperty: "name", data,
        itemStyle: { areaColor: css("--rub"), borderColor: css("--povrsina"), borderWidth: 0.5 },
        emphasis: { label: { show: false }, itemStyle: { areaColor: css("--naglasak"), borderColor: css("--tekst") } },
        select: { disabled: true }, label: { show: false } }],
    }, true);
    g.off("click"); g.on("click", (e) => { location.hash = "#opcina/" + e.name; });
    $("#graf-karta").setAttribute("aria-label", `Karta općina: ${p.naslov}. Isti podaci su u popisu „Poredak općina“.`);

    // poredak
    const red = data.filter((d) => !isNaN(d.value)).sort((x, y) => y.value - x.value || y.a.zr - x.a.zr || y.a.uk - x.a.uk);
    $("#poredak-opis").textContent = `${red.length} općina i gradova s podatkom, od najvećeg.`;
    $("#poredak").innerHTML = red.slice(0, 150).map((d, i) =>
      `<li><a href="#opcina/${d.name}"><span class="rb">${i + 1}.</span><span>${esc(nazivOpcine[d.name])}</span><span class="vr">${p.f(d.value)}</span>` +
      `<span class="pod">${S.pokazatelj === "udio" ? `${d.a.bez} od ${d.a.zr} isteklih` : S.pokazatelj === "naknada12" ? `${d.a.i12} ugovora ističe u 12 mj.` : `${d.a.akt} aktivnih · ${d.a.uk} ukupno`}</span></a></li>`).join("");
  }

  // ---------- SAT ----------
  function sat() {
    const N = S.razdoblje, kraj = plusMj(DANAS, N);
    const mjeseci = [];
    for (let k = 0; k < N; k++) { const d = plusMj(new Date(DANAS.getFullYear(), DANAS.getMonth(), 1), k); mjeseci.push(d); }
    const kljuc = (d) => d.getFullYear() * 12 + d.getMonth();
    const k0 = kljuc(mjeseci[0]);
    const lista = U.filter((u) => u.do >= DANAS && u.do < kraj && filt(u) && trazi(u));
    const sektori = P.sektori.map(([k]) => k).filter((k) => !S.sektor || k === S.sektor);
    const mat = Object.fromEntries(sektori.map((s) => [s, new Array(N).fill(0)]));
    for (const u of lista) { const j = kljuc(u.do) - k0; if (j >= 0 && j < N) mat[u.sektor][j]++; }
    const g = graf("graf-sat");
    const labele = mjeseci.map((d) => `${MJ[d.getMonth()]} ${String(d.getFullYear()).slice(2)}.`);
    g.setOption({
      ...osnova(),
      tooltip: { ...osnova().tooltip, trigger: "axis", axisPointer: { type: "shadow" },
        formatter: (ps) => `<b>${ps[0].axisValue}</b><br>` + ps.filter((p) => p.value).map((p) => `${p.marker}${esc(sektorNaziv[p.seriesId])}: <b>${p.value}</b>`).join("<br>") +
          `<br>Ukupno: <b>${ps.reduce((s, p) => s + p.value, 0)}</b>` },
      legend: { type: "scroll", top: 0, textStyle: { color: css("--tekst-2") } },
      grid: { left: 40, right: 12, top: 36, bottom: 28 },
      xAxis: { type: "category", data: labele, ...os(), axisLabel: { color: css("--tekst-2"), hideOverlap: true } },
      yAxis: { type: "value", ...os(), minInterval: 1 },
      series: sektori.filter((s) => mat[s].some((x) => x)).map((s) => ({
        id: s, name: sektorNaziv[s], type: "bar", stack: "a", data: mat[s], barMaxWidth: 36,
        itemStyle: { color: SEKTOR_BOJE[s], borderRadius: 0, opacity: (j) => 1 },
        emphasis: { focus: "series" },
      })),
    }, true);
    g.off("click"); g.on("click", (e) => { S.mjesec = kljuc(mjeseci[e.dataIndex]); prikazi(); });
    $("#graf-sat").setAttribute("aria-label", `Stupčasti graf: ${lista.length} ugovora ističe u idućih ${N} mjeseci, po mjesecima i sektorima. Isti ugovori su u tablici ispod.`);

    // tablica
    let red = lista.slice().sort((a, b) => a.do - b.do);
    if (S.mjesec != null) red = red.filter((u) => kljuc(u.do) === S.mjesec);
    const mjTxt = S.mjesec != null ? ` u ${MJ[S.mjesec % 12]} ${Math.floor(S.mjesec / 12)}.` : ` u idućih ${N} mjeseci`;
    const nSum = red.reduce((s, u) => s + (u.nak || 0), 0);
    $("#tablica-sat-naslov").textContent = `${fmt.format(red.length)} ugovora ističe${mjTxt} · ${eur(nSum)} godišnje naknade`;
    satLista = red; satNaslov = `istjece${S.mjesec != null ? "_" + MJ[S.mjesec % 12] + Math.floor(S.mjesec / 12) : "_" + N + "mj"}`;
    $("#sat-ponisti").hidden = S.mjesec == null;
    const LIM = 400;
    $("#tablica-sat").innerHTML = `<thead><tr><th>Ističe</th><th>Općina / lokacija</th><th>Koncesionar</th><th>Vrsta</th><th class="br">Naknada / god.</th><th>Davatelj</th></tr></thead><tbody>` +
      red.slice(0, LIM).map((u) => `<tr><td class="dat"><span class="oznaka ${u.st === "hitno" ? "st-hitno" : "st-istjece"}">${za(u.do)}</span><br>${hrDat(u.do)}</td>` +
        `<td>${u.opc ? `<a href="#opcina/${u.opc}">${esc(nazivOpcine[u.opc])}</a>` : "–"}<br><span class="opis">${esc(u.lok)}</span></td>` +
        `<td>${esc(u.kon)}</td><td>${esc(u.vrsta)}</td><td class="br">${eurPun(u.nak)}</td><td>${esc(u.dav)}</td></tr>`).join("") + "</tbody>";
    $("#tablica-sat-napomena").textContent = red.length > LIM ? `Prikazano prvih ${LIM} od ${fmt.format(red.length)}; preuzmite CSV za sve ili suzite sektor, razdoblje ili pretragu.` : "";
  }

  // ---------- OPĆINA ----------
  function opcina() {
    if (!S.opcina || !nazivOpcine[S.opcina]) {
      // zadano: zadnja gledana općina, inače ona s najviše ugovora koji ističu u 12 mj.
      const po = poOpcini(), zadnja = ucitaj("opcina");
      S.opcina = zadnja && nazivOpcine[zadnja] ? zadnja : Object.keys(po).sort((a, b) => po[b].i12 - po[a].i12)[0];
      history.replaceState(null, "", "#opcina/" + S.opcina);
    }
    const id = S.opcina, naziv = nazivOpcine[id];
    opcSel.value = id; spremi("opcina", id);
    $("#h-opcina").textContent = naziv;
    document.title = `${naziv} · Koncesijski sat`;
    const sve = U.filter((u) => u.opc === id && filt(u));
    const a = agregat(sve), rh = agregat(U.filter(filt));
    kpi($("#opcina-kpi"), [
      [fmt.format(a.akt), "aktivnih ugovora", "", "Ugovori kojima rok još nije istekao."],
      [fmt.format(a.i6), "ističe u 6 mjeseci", "hitno", "Za ove ugovore novi postupak treba biti u tijeku već sada."],
      [fmt.format(a.i12), "ističe u 12 mjeseci", "", "Vrijeme za pripremu novog natječaja."],
      [eur(a.n12), "godišnje naknade ističe u 12 mj.", "novac", "Ugovorena fiksna godišnja naknada ugovora koji ističu u idućih 12 mjeseci."],
      [pct(a.udio), `isteklih bez nastavka (RH ${pct(rh.udio)})`, "naglasak", "Od ugovora isteklih prije više od godinu dana (bez zdravstva), udio koji nije obnovljen niti zamijenjen."],
    ]);

    // automatski sažetak iz brojki
    const rec = [];
    if (!a.uk) rec.push("U registru nema ugovora smještenih u ovu općinu" + (S.sektor ? " za odabrani sektor." : "."));
    else {
      const prvi = sve.filter((u) => u.do >= DANAS).sort((x, y) => x.do - y.do)[0];
      if (prvi) rec.push(`Sljedeći istek: <b>${esc(prvi.kon)}</b> (${esc(prvi.vrsta.replace(/^Koncesija (za |na )?/i, ""))}), ${hrDat(prvi.do)} – ${za(prvi.do).replace(/\.$/, "")}.`);
      else rec.push("Nema aktivnih ugovora.");
      if (a.zr >= MIN_ZRELIH) {
        const r = a.udio - rh.udio;
        rec.push(`Od ${fmt.format(a.zr)} isteklih ugovora ${fmt.format(a.bez)} nije dobilo nastavak (${pct(a.udio)}), što je ` +
          (Math.abs(r) < 0.05 ? "blizu prosjeka RH." : r > 0 ? `<b>${Math.round(r * 100)} postotnih bodova više</b> od prosjeka RH.` : `${Math.round(-r * 100)} postotnih bodova manje od prosjeka RH.`));
      } else if (a.zr) rec.push(`Premalo isteklih ugovora (${a.zr}) za pouzdan udio bez nastavka.`);
      const sekt = {}; sve.forEach((u) => { sekt[u.sektor] = (sekt[u.sektor] || 0) + 1; });
      const top = Object.entries(sekt).sort((x, y) => y[1] - x[1])[0];
      if (a.i12) rec.push(`U idućih 12 mjeseci ističe <b>${fmt.format(a.i12)}</b> ugovora s ukupno <b>${eur(a.n12)}</b> godišnje fiksne naknade.`);
      if (a.nbez) rec.push(`Ugovori istekli bez nastavka nosili su ${eur(a.nbez)} godišnje naknade.`);
      if (top && !S.sektor) rec.push(`Najviše ugovora je u sektoru ${sektorNaziv[top[0]].toLowerCase()} (${top[1]}).`);
    }
    $("#opcina-sazetak").innerHTML = rec.join(" ");

    // kroz vrijeme
    const g1 = graf("graf-opcina-vrijeme");
    const god0 = 2000, god1 = DANAS.getFullYear() + 6;
    const god = []; for (let y = god0; y <= god1; y++) god.push(y);
    const poc = god.map(() => 0), ist = god.map(() => 0);
    sve.forEach((u) => {
      if (u.od) { const j = u.od.getFullYear() - god0; if (j >= 0 && j < god.length) poc[j]++; }
      const j = u.do.getFullYear() - god0; if (j >= 0 && j < god.length) ist[j]++;
    });
    g1.setOption({
      ...osnova(),
      tooltip: { ...osnova().tooltip, trigger: "axis" },
      legend: { top: 0, textStyle: { color: css("--tekst-2") } },
      grid: { left: 36, right: 12, top: 32, bottom: 28 },
      xAxis: { type: "category", data: god, ...os() },
      yAxis: { type: "value", minInterval: 1, ...os() },
      series: [
        { name: "počinje", type: "bar", data: poc, itemStyle: { color: css("--naglasak") } },
        { name: "ističe", type: "bar", data: ist, itemStyle: { color: css("--naglasak-2") },
          markLine: { symbol: "none", silent: true, label: { formatter: "danas", color: css("--tekst-2") }, lineStyle: { color: css("--tekst-2"), type: "dashed" },
            data: [{ xAxis: String(DANAS.getFullYear()) }] } },
      ],
    }, true);
    $("#graf-opcina-vrijeme").setAttribute("aria-label", `Ugovori po godini početka i isteka, ${god0}.–${god1}. Svi ugovori su u tablici ispod.`);

    // nastavak po sektoru
    const g2 = graf("graf-opcina-nastavak");
    const ns = {}; sve.filter((u) => u.nast).forEach((u) => { (ns[u.sektor] = ns[u.sektor] || [0, 0, 0, 0])[u.nast]++; });
    const sk = Object.keys(ns).sort((x, y) => ns[x].reduce((s, v) => s + v) - ns[y].reduce((s, v) => s + v));
    g2.setOption({
      ...osnova(),
      tooltip: { ...osnova().tooltip, trigger: "axis", axisPointer: { type: "shadow" } },
      legend: { top: 0, textStyle: { color: css("--tekst-2") } },
      grid: { left: 8, right: 16, top: 32, bottom: 8, containLabel: true },
      xAxis: { type: "value", minInterval: 1, ...os() },
      yAxis: { type: "category", data: sk.map((s) => sektorNaziv[s]), ...os(), axisLabel: { color: css("--tekst-2"), width: 140, overflow: "truncate" } },
      series: [[1, "obnovljena", "--s-aktivna"], [2, "zamjena", "--naglasak"], [3, "bez nastavka", "--s-hitno"]].map(([k, n, c]) => ({
        name: n, type: "bar", stack: "a", data: sk.map((s) => ns[s][k]), itemStyle: { color: css(c) }, barMaxWidth: 28,
      })),
      graphic: sk.length ? [] : [{ type: "text", left: "center", top: "middle", style: { text: "Nema isteklih ugovora za ocjenu nastavka.", fill: css("--tekst-2"), fontSize: 13 } }],
    }, true);
    $("#graf-opcina-nastavak").setAttribute("aria-label", "Ishod isteklih ugovora po sektoru: " + sk.map((s) => `${sektorNaziv[s]}: obnovljeno ${ns[s][1]}, zamjena ${ns[s][2]}, bez nastavka ${ns[s][3]}`).join("; "));

    // tablica
    const [kol, smjer] = S.sort.opc;
    const kljucevi = { do: (u) => +u.do, od: (u) => +(u.od || 0), kon: (u) => u.kon, vrsta: (u) => u.vrsta, nak: (u) => u.nak || 0 };
    const red = sve.filter(trazi).sort((x, y) => { const p = kljucevi[kol](x), q = kljucevi[kol](y); return (p > q ? 1 : p < q ? -1 : 0) * smjer; });
    const th = (k, t) => `<th${kol === k ? ` aria-sort="${smjer > 0 ? "ascending" : "descending"}"` : ""}><button type="button" data-sort="${k}">${t}${kol === k ? (smjer > 0 ? " ▲" : " ▼") : ""}</button></th>`;
    const LIM = 500;
    $("#tablica-opcina").innerHTML = `<thead><tr>${th("do", "Ističe")}${th("od", "Od")}<th>Status</th>${th("kon", "Koncesionar")}${th("vrsta", "Vrsta")}${th("nak", "Naknada / god.")}<th>Nakon isteka</th><th>Davatelj</th></tr></thead><tbody>` +
      red.slice(0, LIM).map((u) => `<tr><td class="dat">${hrDat(u.do)}</td><td class="dat">${hrDat(u.od)}</td>` +
        `<td><span class="oznaka st-${u.st}">${ST_TXT[u.st]}</span></td><td>${esc(u.kon)}</td><td>${esc(u.vrsta)}</td><td class="br">${eurPun(u.nak)}</td>` +
        `<td>${u.nast ? `<span class="oznaka ${NAST_KL[u.nast]}">${NAST[u.nast]}</span>` : ""}</td><td>${esc(u.dav)}</td></tr>`).join("") + "</tbody>";
    opcLista = red;
    $("#tablica-opcina-napomena").textContent = red.length > LIM ? `Prikazano ${LIM} od ${fmt.format(red.length)}.` : `${fmt.format(red.length)} ugovora.`;
    $("#tablica-opcina").querySelectorAll("[data-sort]").forEach((b) => b.onclick = () => {
      const k = b.dataset.sort; S.sort.opc = [k, kol === k ? -smjer : (k === "kon" || k === "vrsta" ? 1 : -1)]; opcina();
      $(`#tablica-opcina [data-sort="${k}"]`).focus();
    });
  }

  // ---------- preuzimanja: CSV (Excel) i kalendar (.ics) ----------
  const datIso = (d) => d ? d.toISOString().slice(0, 10) : "";
  const lokalniIso = (d) => d ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}` : "";
  function preuzmi(ime, sadrzaj, tip) {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([sadrzaj], { type: tip }));
    a.download = ime; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }
  const slug = (t) => t.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/đ/g, "d").replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
  function csv(lista, ime) {
    const q = (v) => { v = v == null ? "" : String(v); return /[;"\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v; };
    const glava = ["Ističe", "Počinje", "Općina", "Lokacija", "Koncesionar", "Vrsta", "Sektor", "Godišnja fiksna naknada (EUR)", "Nakon isteka", "Davatelj"];
    const redci = lista.map((u) => [lokalniIso(u.do), lokalniIso(u.od), nazivOpcine[u.opc] || "", u.lok, u.kon, u.vrsta, sektorNaziv[u.sektor],
      u.nak == null ? "" : String(u.nak).replace(".", ","), NAST[u.nast] || "", u.dav]);
    // ; i BOM: hrvatski Excel otvara izravno, s ispravnim dijakriticima
    preuzmi(ime + ".csv", "\ufeff" + [glava, ...redci].map((r) => r.map(q).join(";")).join("\r\n"), "text/csv;charset=utf-8");
  }
  function ics(lista, ime) {
    const st = (d) => lokalniIso(d).replace(/-/g, "");
    const t = (x) => String(x).replace(/[\\;,]/g, (c) => "\\" + c).replace(/\n/g, " ");
    const sad = new Date().toISOString().replace(/[-:]/g, "").slice(0, 15) + "Z";
    const ev = lista.filter((u) => u.do >= DANAS).map((u) => [
      "BEGIN:VEVENT", `UID:ks-${u.i}@koncesijski-sat`, `DTSTAMP:${sad}`,
      `DTSTART;VALUE=DATE:${st(u.do)}`, `DTEND;VALUE=DATE:${st(new Date(u.do.getTime() + 864e5))}`,
      `SUMMARY:${t("Ističe koncesija: " + u.kon)}`,
      `DESCRIPTION:${t(`${u.vrsta}. Lokacija: ${u.lok}. Davatelj: ${u.dav}.` + (u.nak ? ` Godišnja naknada: ${eurPun(u.nak)}.` : "") + " Izvor: Registar koncesija (FINA), Koncesijski sat.")}`,
      // podsjetnici: 6 mjeseci (pripremiti natječaj) i 1 mjesec prije isteka
      "BEGIN:VALARM", "ACTION:DISPLAY", `DESCRIPTION:${t("Za 6 mjeseci ističe koncesija: " + u.kon)}`, "TRIGGER:-P182D", "END:VALARM",
      "BEGIN:VALARM", "ACTION:DISPLAY", `DESCRIPTION:${t("Za mjesec dana ističe koncesija: " + u.kon)}`, "TRIGGER:-P30D", "END:VALARM",
      "END:VEVENT"].join("\r\n"));
    if (!ev.length) { alert("Nema ugovora koji tek ističu."); return; }
    const presavij = (l) => l.length <= 70 ? l : l.match(/.{1,70}/g).join("\r\n ");   // RFC 5545: retci do 75 okteta
    const tekst = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Koncesijski sat//HR", "CALSCALE:GREGORIAN", "X-WR-CALNAME:Rokovi koncesija", ...ev, "END:VCALENDAR"].join("\r\n");
    preuzmi(ime + ".ics", tekst.split("\r\n").map(presavij).join("\r\n"), "text/calendar;charset=utf-8");
  }
  $("#sat-csv").onclick = () => csv(satLista, "koncesije_" + satNaslov);
  $("#sat-ics").onclick = () => ics(satLista, "koncesije_" + satNaslov);
  $("#opcina-csv").onclick = () => csv(opcLista, "koncesije_" + slug(nazivOpcine[S.opcina]));
  $("#opcina-ics").onclick = () => ics(opcLista, "rokovi_" + slug(nazivOpcine[S.opcina]));
  $("#opcina-ispis").onclick = () => window.print();

  // ---------- pretplata na kalendar (statični feed po općini, generira izvoz_web.py) ----------
  const JAVNO = /^(localhost|127\.0\.0\.1)$/.test(location.hostname) ? "https://koncesijski-sat.vercel.app" : location.origin;
  const GEN = parse(P.generirano);
  // Kalendar po općini = pregled svih ugovora na području; po davatelju = „moji ugovori“ (tko vodi postupak).
  // Općine same dodjeljuju tek ~12 % koncesija na svom području, ostalo lučke uprave, županije i ministarstva.
  const normNaziv = (t) => t.toLowerCase().replace(/^(grad|općina)\s+/, "").trim();
  function postaviVeze(put, naziv) {
    const https = `${JAVNO}/data/kalendar/${put}.ics`, webcal = https.replace(/^https?:/, "webcal:");
    const ime = encodeURIComponent("Rokovi koncesija · " + naziv);
    $("#pp-google").href = "https://calendar.google.com/calendar/render?cid=" + encodeURIComponent(webcal);
    $("#pp-m365").href = `https://outlook.office.com/calendar/0/addfromweb?url=${encodeURIComponent(https)}&name=${ime}`;
    $("#pp-outlook").href = `https://outlook.live.com/calendar/0/addfromweb?url=${encodeURIComponent(https)}&name=${ime}`;
    $("#pp-webcal").href = webcal;
    $("#pp-url").value = https;
    $("#pp-kopiraj").textContent = "Kopiraj";
  }
  $("#opcina-pretplata").onclick = () => {
    const id = S.opcina, naziv = nazivOpcine[id];
    const ovdje = U.filter((u) => u.opc === id && u.do >= GEN);
    $("#pretplata-opcina").textContent = naziv;
    $("#pretplata-sadrzaj").hidden = !ovdje.length; $("#pretplata-prazno").hidden = !!ovdje.length;
    if (!ovdje.length) { $("#pretplata").showModal(); return; }
    // davatelji s aktivnim ugovorima u ovoj općini, grupirani po stabilnom ključu (OIB)
    const dav = {};
    for (const u of ovdje) {
      const k = P.davateljiKal[u.di];
      (dav[k] = dav[k] || { k, ime: u.dav, ovdje: 0, ukupno: 0 }).ovdje++;
    }
    for (const u of U) { const d = dav[P.davateljiKal[u.di]]; if (d && u.do >= GEN) d.ukupno++; }
    const lista = Object.values(dav).sort((a, b) => b.ovdje - a.ovdje);
    const svoj = lista.find((d) => normNaziv(d.ime) === normNaziv(naziv));
    const opcije = [
      { put: id, naslov: "Svi ugovori na području – pregled", pod: `${fmt.format(ovdje.length)} aktivnih ugovora, svi davatelji · za gradonačelnika, vijeće, javnost`, ime: naziv },
      ...lista.map((d) => ({ put: "davatelj/" + d.k, naslov: d.ime, ime: d.ime,
        pod: `ugovori koje dodjeljuje: ${fmt.format(d.ovdje)} ovdje` + (d.ukupno > d.ovdje ? ` · ${fmt.format(d.ukupno)} ukupno na svim lokacijama` : "") + (d === svoj ? " · vaša općina kao davatelj" : "") })),
    ];
    const zadano = svoj ? 1 + lista.indexOf(svoj) : 0;
    $("#pretplata-opcije").innerHTML = opcije.map((o, i) =>
      `<label class="pretplata-opcija"><input type="radio" name="pp-izbor" value="${i}"${i === zadano ? " checked" : ""}>` +
      `<span><b>${esc(o.naslov)}</b><small>${esc(o.pod)}</small></span></label>`).join("");
    $("#pretplata-opcije").onchange = (e) => { const o = opcije[+e.target.value]; postaviVeze(o.put, o.ime); };
    postaviVeze(opcije[zadano].put, opcije[zadano].ime);
    $("#pretplata").showModal();
  };
  $("#pp-kopiraj").onclick = async () => {
    const polje = $("#pp-url");
    try { await navigator.clipboard.writeText(polje.value); } catch (e) { polje.select(); document.execCommand("copy"); }
    $("#pp-kopiraj").textContent = "Kopirano ✓";
  };
  $("#pp-url").onfocus = (e) => e.target.select();
  $("#pretplata").addEventListener("click", (e) => { if (e.target === e.currentTarget) e.currentTarget.close(); });   // klik izvan prozora

  // ---------- brza pretraga općine (zaglavlje) ----------
  const nazivUId = {};
  opcSortirane.forEach((k) => { nazivUId[nazivOpcine[k].toLowerCase()] = k; });
  $("#popis-opcina").innerHTML = opcSortirane.map((k) => `<option value="${esc(nazivOpcine[k])}">`).join("");
  const brza = $("#brza-opcina");
  function idiNaOpcinu() {
    const v = brza.value.trim().toLowerCase(); if (!v) return false;
    const id = nazivUId[v] || nazivUId["grad " + v] || nazivUId["općina " + v] ||
      opcSortirane.filter((k) => nazivOpcine[k].toLowerCase().replace(/^(grad|općina) /, "").startsWith(v))
        .sort((a, b) => nazivOpcine[a].length - nazivOpcine[b].length)[0];   // "dubrov" -> Dubrovnik, ne Dubrovačko primorje
    if (!id) { brza.setCustomValidity("Nema takve općine ili grada"); brza.reportValidity(); return false; }
    brza.setCustomValidity(""); brza.value = ""; brza.blur();
    location.hash = "#opcina/" + id; return true;
  }
  brza.addEventListener("change", () => { if (nazivUId[brza.value.trim().toLowerCase()]) idiNaOpcinu(); });
  brza.addEventListener("input", () => brza.setCustomValidity(""));
  $("#brza-forma").addEventListener("submit", (e) => { e.preventDefault(); idiNaOpcinu(); });

  // ---------- kratke upute (mogu se zatvoriti) ----------
  if (ucitaj("upute") !== "skriveno") $("#upute").hidden = false;
  $("#upute-zatvori").onclick = () => { $("#upute").hidden = true; spremi("upute", "skriveno"); };

  // ---------- metodologija ----------
  $("#m-smjesteno").textContent = pct(U.filter((u) => u.opc).length / U.length);
  $("#m-generirano").textContent = `Podaci obrađeni ${P.generirano}; ${fmt.format(U.length)} ugovora, ${P.davatelji.length} davatelja, ${fmt.format(P.koncesionari.length)} koncesionara.`;

  // ---------- usmjeravanje ----------
  let ruta = "karta";
  function prikazi() {
    kpiGlobal();
    if (ruta === "karta") karta();
    else if (ruta === "sat") sat();
    else if (ruta === "opcina") opcina();
    uskladi();                       // odmah, ekran je već prikazan pa je širina poznata
    requestAnimationFrame(uskladi);   // i nakon iscrtavanja, za svaki slučaj
  }
  function usmjeri() {
    const [r, arg] = location.hash.replace(/^#/, "").split("/");
    ruta = ["karta", "sat", "opcina", "metodologija"].includes(r) ? r : "karta";
    if (ruta === "opcina") S.opcina = arg || S.opcina;
    if (ruta !== "opcina") document.title = "Koncesijski sat";
    document.body.dataset.ruta = ruta;
    document.querySelectorAll(".ekran").forEach((e) => { e.hidden = e.id !== "ekran-" + ruta; });
    const dlg = document.getElementById("pretplata"); if (dlg && dlg.open) dlg.close();   // prozor ne ostaje otvoren preko drugog ekrana
    document.querySelectorAll("[data-ruta]").forEach((a) => a.dataset.ruta === ruta ? a.setAttribute("aria-current", "page") : a.removeAttribute("aria-current"));
    prikazi();
  }
  window.addEventListener("hashchange", () => { usmjeri(); window.scrollTo(0, 0); });
  window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", prikazi);
  usmjeri();
})();
