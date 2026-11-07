/* Koncesijski sat — statična aplikacija (ECharts, bez build koraka). */
(function () {
  "use strict";
  const P = window.PODACI, G = window.GRANICE;
  const $ = (s) => document.querySelector(s);
  const fmt = new Intl.NumberFormat("hr-HR");
  const pct = (x) => x == null ? "–" : (x * 100).toLocaleString("hr-HR", { maximumFractionDigits: 0 }) + " %";
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
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
      i, dav: P.davatelji[r[0]], kon: P.koncesionari[r[1]], vrsta: P.vrste[r[2]],
      sektor: P.vrsteSektor[r[2]], opc: r[3] >= 0 ? P.opcine[r[3]] : null,
      od: parse(r[4]), do: doD, nast: r[6], lok: r[7],
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
    const a = { uk: 0, akt: 0, i12: 0, i6: 0, ist: 0, zr: 0, bez: 0, obn: 0, zam: 0 };
    for (const u of lista) {
      a.uk++;
      if (u.do >= DANAS) { a.akt++; if (u.do < M12) a.i12++; if (u.do < M6) a.i6++; } else a.ist++;
      if (u.nast) { a.zr++; if (u.nast === 3) a.bez++; else if (u.nast === 1) a.obn++; else a.zam++; }
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
  const graf = (id) => grafovi[id] || (grafovi[id] = echarts.init(document.getElementById(id), null, { renderer: "canvas" }));
  window.addEventListener("resize", () => Object.values(grafovi).forEach((g) => g.resize()));
  const osnova = () => ({
    textStyle: { color: css("--tekst"), fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif" },
    tooltip: { backgroundColor: css("--povrsina"), borderColor: css("--rub"), textStyle: { color: css("--tekst") } },
  });
  const os = () => ({ axisLine: { lineStyle: { color: css("--rub") } }, axisLabel: { color: css("--tekst-2") }, splitLine: { lineStyle: { color: css("--rub") } } });

  // ---------- KPI ----------
  function kpi(el, stavke) {
    el.innerHTML = stavke.map(([v, op, kl]) => `<div class="kpi ${kl || ""}"><div class="kpi-vr">${v}</div><div class="kpi-op">${op}</div></div>`).join("");
  }
  function kpiGlobal() {
    const a = agregat(U.filter(filt));
    kpi($("#kpi"), [
      [fmt.format(a.akt), "aktivnih ugovora"],
      [fmt.format(a.i6), "ističe u 6 mjeseci", "hitno"],
      [fmt.format(a.i12), "ističe u 12 mjeseci"],
      [pct(a.udio), "isteklih bez nastavka", "naglasak"],
      [fmt.format(a.uk), "ugovora u registru"],
    ]);
  }

  // ---------- KARTA ----------
  const POK = {
    udio: { naslov: "Udio isteklih koncesija bez nastavka", opis: `Od ugovora isteklih prije više od 12 mjeseci (bez zdravstva): koliko ih nije obnovljeno niti zamijenjeno novim ugovorom iste vrste. Sivo: manje od ${MIN_ZRELIH} takvih ugovora.`, v: (a) => a.zr >= MIN_ZRELIH ? a.udio : null, f: pct, boje: ["#f3e9c6", "#e9a96b", "#d2541b", "#7f1d1d"] },
    istjece12: { naslov: "Koncesije koje ističu u idućih 12 mjeseci", opis: "Broj ugovora kojima istječe rok u sljedećih godinu dana: tu bi davatelj već trebao pripremati novi postupak.", v: (a) => a.i12 || null, f: fmt.format, boje: ["#fdf0c4", "#f0b545", "#c8412d", "#6e1a12"] },
    aktivne: { naslov: "Aktivne koncesije", opis: "Broj ugovora koji danas vrijede.", v: (a) => a.akt || null, f: fmt.format, boje: ["#d8f0ee", "#6cc0c0", "#0b6e74", "#073b3f"] },
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
          `aktivne ${fmt.format(a.akt)} · ističe u 12 mj. ${fmt.format(a.i12)}<br>istekle bez nastavka ${fmt.format(a.bez)} / ${fmt.format(a.zr)}`;
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
      `<span class="pod">${S.pokazatelj === "udio" ? `${d.a.bez} od ${d.a.zr} isteklih` : `${d.a.akt} aktivnih · ${d.a.uk} ukupno`}</span></a></li>`).join("");
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
    $("#tablica-sat-naslov").textContent = `${fmt.format(red.length)} ugovora ističe${mjTxt}`;
    $("#sat-ponisti").hidden = S.mjesec == null;
    const LIM = 400;
    $("#tablica-sat").innerHTML = `<thead><tr><th>Ističe</th><th>Općina / lokacija</th><th>Koncesionar</th><th>Vrsta</th><th>Davatelj</th></tr></thead><tbody>` +
      red.slice(0, LIM).map((u) => `<tr><td class="dat"><span class="oznaka ${u.st === "hitno" ? "st-hitno" : "st-istjece"}">${za(u.do)}</span><br>${hrDat(u.do)}</td>` +
        `<td>${u.opc ? `<a href="#opcina/${u.opc}">${esc(nazivOpcine[u.opc])}</a>` : "–"}<br><span class="opis">${esc(u.lok)}</span></td>` +
        `<td>${esc(u.kon)}</td><td>${esc(u.vrsta)}</td><td>${esc(u.dav)}</td></tr>`).join("") + "</tbody>";
    $("#tablica-sat-napomena").textContent = red.length > LIM ? `Prikazano prvih ${LIM} od ${fmt.format(red.length)}; suzite sektor, razdoblje ili pretragu.` : "";
  }

  // ---------- OPĆINA ----------
  function opcina() {
    if (!S.opcina || !nazivOpcine[S.opcina]) {
      // zadano: općina s najviše ugovora koji ističu u 12 mj.
      const po = poOpcini();
      S.opcina = Object.keys(po).sort((a, b) => po[b].i12 - po[a].i12)[0];
      history.replaceState(null, "", "#opcina/" + S.opcina);
    }
    const id = S.opcina, naziv = nazivOpcine[id];
    opcSel.value = id;
    $("#h-opcina").textContent = naziv;
    document.title = `${naziv} · Koncesijski sat`;
    const sve = U.filter((u) => u.opc === id && filt(u));
    const a = agregat(sve), rh = agregat(U.filter(filt));
    kpi($("#opcina-kpi"), [
      [fmt.format(a.akt), "aktivnih ugovora"],
      [fmt.format(a.i6), "ističe u 6 mjeseci", "hitno"],
      [fmt.format(a.i12), "ističe u 12 mjeseci"],
      [pct(a.udio), `isteklih bez nastavka (RH ${pct(rh.udio)})`, "naglasak"],
      [fmt.format(a.uk), "ugovora u registru"],
    ]);

    // automatski sažetak iz brojki
    const rec = [];
    if (!a.uk) rec.push("U registru nema ugovora smještenih u ovu općinu" + (S.sektor ? " za odabrani sektor." : "."));
    else {
      const prvi = sve.filter((u) => u.do >= DANAS).sort((x, y) => x.do - y.do)[0];
      if (prvi) rec.push(`Sljedeći istek: <b>${esc(prvi.kon)}</b> (${esc(prvi.vrsta.replace(/^Koncesija (za |na )?/i, ""))}), ${hrDat(prvi.do)} – ${za(prvi.do)}.`);
      else rec.push("Nema aktivnih ugovora.");
      if (a.zr >= MIN_ZRELIH) {
        const r = a.udio - rh.udio;
        rec.push(`Od ${fmt.format(a.zr)} isteklih ugovora ${fmt.format(a.bez)} nije dobilo nastavak (${pct(a.udio)}), što je ` +
          (Math.abs(r) < 0.05 ? "blizu prosjeka RH." : r > 0 ? `<b>${Math.round(r * 100)} postotnih bodova više</b> od prosjeka RH.` : `${Math.round(-r * 100)} postotnih bodova manje od prosjeka RH.`));
      } else if (a.zr) rec.push(`Premalo isteklih ugovora (${a.zr}) za pouzdan udio bez nastavka.`);
      const sekt = {}; sve.forEach((u) => { sekt[u.sektor] = (sekt[u.sektor] || 0) + 1; });
      const top = Object.entries(sekt).sort((x, y) => y[1] - x[1])[0];
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
    const kljucevi = { do: (u) => +u.do, od: (u) => +(u.od || 0), kon: (u) => u.kon, vrsta: (u) => u.vrsta };
    const red = sve.filter(trazi).sort((x, y) => { const p = kljucevi[kol](x), q = kljucevi[kol](y); return (p > q ? 1 : p < q ? -1 : 0) * smjer; });
    const th = (k, t) => `<th${kol === k ? ` aria-sort="${smjer > 0 ? "ascending" : "descending"}"` : ""}><button type="button" data-sort="${k}">${t}${kol === k ? (smjer > 0 ? " ▲" : " ▼") : ""}</button></th>`;
    const LIM = 500;
    $("#tablica-opcina").innerHTML = `<thead><tr>${th("do", "Ističe")}${th("od", "Od")}<th>Status</th>${th("kon", "Koncesionar")}${th("vrsta", "Vrsta")}<th>Nakon isteka</th><th>Davatelj</th></tr></thead><tbody>` +
      red.slice(0, LIM).map((u) => `<tr><td class="dat">${hrDat(u.do)}</td><td class="dat">${hrDat(u.od)}</td>` +
        `<td><span class="oznaka st-${u.st}">${ST_TXT[u.st]}</span></td><td>${esc(u.kon)}</td><td>${esc(u.vrsta)}</td>` +
        `<td>${u.nast ? `<span class="oznaka ${NAST_KL[u.nast]}">${NAST[u.nast]}</span>` : ""}</td><td>${esc(u.dav)}</td></tr>`).join("") + "</tbody>";
    $("#tablica-opcina-napomena").textContent = red.length > LIM ? `Prikazano ${LIM} od ${fmt.format(red.length)}.` : `${fmt.format(red.length)} ugovora.`;
    $("#tablica-opcina").querySelectorAll("[data-sort]").forEach((b) => b.onclick = () => {
      const k = b.dataset.sort; S.sort.opc = [k, kol === k ? -smjer : (k === "kon" || k === "vrsta" ? 1 : -1)]; opcina();
      $(`#tablica-opcina [data-sort="${k}"]`).focus();
    });
  }

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
    requestAnimationFrame(() => Object.values(grafovi).forEach((g) => g.resize()));
  }
  function usmjeri() {
    const [r, arg] = location.hash.replace(/^#/, "").split("/");
    ruta = ["karta", "sat", "opcina", "metodologija"].includes(r) ? r : "karta";
    if (ruta === "opcina") S.opcina = arg || S.opcina;
    if (ruta !== "opcina") document.title = "Koncesijski sat";
    document.body.dataset.ruta = ruta;
    document.querySelectorAll(".ekran").forEach((e) => { e.hidden = e.id !== "ekran-" + ruta; });
    document.querySelectorAll("[data-ruta]").forEach((a) => a.dataset.ruta === ruta ? a.setAttribute("aria-current", "page") : a.removeAttribute("aria-current"));
    prikazi();
  }
  window.addEventListener("hashchange", () => { usmjeri(); window.scrollTo(0, 0); });
  window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", prikazi);
  usmjeri();
})();
