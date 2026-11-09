/* Koncesijski sat — statična aplikacija s AI sažetkom ugovora, OIB portfeljima i 5 izvora s data.gov.hr. */
(function () {
  "use strict";
  const P = window.PODACI, G = window.GRANICE;
  const $ = (s) => document.querySelector(s);
  const fmt = new Intl.NumberFormat("hr-HR");
  const fmtDec = new Intl.NumberFormat("hr-HR", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  const pct = (x) => x == null ? "–" : (x * 100).toLocaleString("hr-HR", { maximumFractionDigits: 0 }) + " %";
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const eurC = new Intl.NumberFormat("hr-HR", { notation: "compact", maximumFractionDigits: 1 });
  const eur = (x) => x == null ? "–" : (x >= 1e4 ? eurC.format(x) : fmt.format(Math.round(x))) + " €";
  const eurPun = (x) => x == null ? "" : fmt.format(Math.round(x)) + " €";
  const spremi = (k, v) => { try { localStorage.setItem("ks-" + k, v); } catch (e) { /* privatni prozor */ } };
  const ucitaj = (k) => { try { return localStorage.getItem("ks-" + k); } catch (e) { return null; } };
  const MJ = ["sij", "velj", "ožu", "tra", "svi", "lip", "srp", "kol", "ruj", "lis", "stu", "pro"];
  const MIN_ZRELIH = 5;

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

  // ---------- priprema podataka i OIB portfelja ----------
  const nazivOpcine = {};
  G.features.forEach((f) => { nazivOpcine[f.properties.name] = f.properties.naziv; });
  const sektorNaziv = Object.fromEntries(P.sektori);
  const namjene = P.namjene || [];
  const tipoviSubjekata = P.tipoviSubjekata || [];
  const davMeta = P.davateljiMeta || [];
  const korMeta = P.koncesionariMeta || [];
  const opcMeta = P.opcineMeta || {};

  const U = P.ugovori.map((r, i) => {
    const doD = parse(r[5]), odD = parse(r[4]);
    const km = korMeta[r[1]] || [null, 13, r[1]];
    const dm = davMeta[r[0]] || [null, "Javnopravno tijelo", null, null];
    const nam = namjene[r[9]] || ["ostalo", "Lokalna koncesija", "📋", "", 0];
    return {
      i,
      di: r[0], davIdx: r[0], dav: P.davatelji[r[0]], davOib: dm[0], davVrsta: dm[1], davZup: dm[2], davEmail: dm[3],
      korIdx: r[1], kon: P.koncesionari[r[1]], korOib: km[0], korTipIdx: km[1], korTip: tipoviSubjekata[km[1]] || "Subjekt", kanonskiIdx: km[2],
      vrsta: P.vrste[r[2]], sektor: P.vrsteSektor[r[2]],
      opc: r[3] >= 0 ? P.opcine[r[3]] : null,
      od: odD, do: doD, nast: r[6], lok: r[7], nak: r[8],
      namIdx: r[9], namKod: nam[0], namNaziv: nam[1], namIkona: nam[2], namOpis: nam[3], namMedijan: nam[4],
      varNak: r[10] || null, rizik: r[11] || 0,
      st: doD < DANAS ? "istekla" : doD < M6 ? "hitno" : doD < M24 ? "istjece" : "aktivna",
    };
  });

  // Grupiranje koncesionara po OIB-u (kanonskiIdx) kroz cijelu RH
  const portfelj = {};
  for (const u of U) {
    const k = u.kanonskiIdx;
    let p = portfelj[k];
    if (!p) {
      p = portfelj[k] = {
        kanonskiIdx: k, naziv: P.koncesionari[k], oib: u.korOib, tip: u.korTip,
        ukupno: 0, aktivnih: 0, nakAkt: 0, nakUk: 0, obn: 0, zr: 0,
        opcine: new Set(), sektori: new Set(), namjeneSet: new Set(), ugovori: [],
      };
    }
    p.ukupno++;
    p.nakUk += u.nak || 0;
    if (u.do >= DANAS) { p.aktivnih++; p.nakAkt += u.nak || 0; }
    if (u.nast) { p.zr++; if (u.nast === 1) p.obn++; }
    if (u.opc && nazivOpcine[u.opc]) p.opcine.add(nazivOpcine[u.opc]);
    p.sektori.add(sektorNaziv[u.sektor]);
    p.namjeneSet.add(`${u.namIkona} ${u.namNaziv}`);
    p.ugovori.push(u);
  }

  // ---------- odbrojavanje: boja = vrijeme do isteka ----------
  const RAZRED = { hitno: "r-hitno", istjece: "r-uskoro", aktivna: "r-mirno", istekla: "r-isteklo" };
  const potroseno = (u) => {
    if (u.do < DANAS) return 100;
    if (!u.od || u.do <= u.od) return 0;
    return Math.max(2, Math.min(99, Math.floor((DANAS - u.od) / (u.do - u.od) * 100)));
  };
  const brojcanik = (u, velik) => `<span class="sat ${RAZRED[u.st]}${velik ? " sat-velik" : ""}" style="--p:${potroseno(u)}%" ` +
    `title="Potrošeno ${potroseno(u)} % trajanja ugovora" aria-hidden="true"></span>`;
  const rokHtml = (u) => `<span class="rok">${brojcanik(u)}<span><span class="rok-za ${RAZRED[u.st]}">${za(u.do)}</span>` +
    `<span class="rok-dat">${hrDat(u.do)}</span></span></span>`;

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
  const S = {
    sektor: "", namjena: "", pokazatelj: "udio", razdoblje: 12, trazi: "",
    mjesec: null, opcina: null, rizikVrsta: 1, sort: { opc: ["do", -1] },
  };
  const filt = (u) => (!S.sektor || u.sektor === S.sektor) && (S.namjena === "" || u.namIdx === +S.namjena);
  let satLista = [], satNaslov = "istjece", opcLista = [], revLista = [];

  // ---------- filteri ----------
  const fs = $("#f-sektor");
  fs.innerHTML = `<option value="">Svi sektori</option>` + P.sektori
    .map(([k, n]) => `<option value="${k}">${esc(n)}</option>`).join("");
  fs.onchange = () => { S.sektor = fs.value; S.mjesec = null; prikazi(); };

  const fn = $("#f-namjena");
  const namBroj = {};
  U.forEach((u) => { namBroj[u.namIdx] = (namBroj[u.namIdx] || 0) + 1; });
  const namSort = namjene.map((n, idx) => [idx, n[1], n[2], namBroj[idx] || 0]).filter((x) => x[3] > 0).sort((a, b) => b[3] - a[3]);
  fn.innerHTML = `<option value="">Sve stvarne namjene (${namSort.length})</option>` +
    namSort.map(([idx, naziv, ikona, br]) => `<option value="${idx}">${ikona} ${esc(naziv)} (${fmt.format(br)})</option>`).join("");
  fn.onchange = () => { S.namjena = fn.value; S.mjesec = null; prikazi(); };

  $("#f-pokazatelj").onchange = (e) => { S.pokazatelj = e.target.value; prikazi(); };
  $("#f-razdoblje").onchange = (e) => { S.razdoblje = +e.target.value; S.mjesec = null; prikazi(); };
  let tId;
  $("#f-trazi").oninput = (e) => {
    clearTimeout(tId);
    tId = setTimeout(() => { S.trazi = e.target.value.trim().toLowerCase(); prikazi(); }, 150);
  };
  $("#sat-ponisti").onclick = () => { S.mjesec = null; prikazi(); };
  const trazi = (u) => !S.trazi || (
    u.kon + " " + (u.korOib || "") + " " + u.dav + " " + (u.davOib || "") + " " +
    u.vrsta + " " + u.namNaziv + " " + u.korTip + " " + u.lok + " " + (nazivOpcine[u.opc] || "")
  ).toLowerCase().includes(S.trazi);

  const opcSel = $("#f-opcina");
  const opcSortirane = Object.keys(nazivOpcine).sort((a, b) => nazivOpcine[a].replace(/^(Grad|Općina) /, "")
    .localeCompare(nazivOpcine[b].replace(/^(Grad|Općina) /, ""), "hr"));
  opcSel.innerHTML = opcSortirane.map((k) => `<option value="${k}">${esc(nazivOpcine[k])}</option>`).join("");
  opcSel.onchange = () => { location.hash = "#opcina/" + opcSel.value; };

  // ---------- agregati ----------
  function agregat(lista, opcId) {
    const a = { uk: 0, akt: 0, i12: 0, i6: 0, ist: 0, zr: 0, bez: 0, obn: 0, zam: 0, n12: 0, nakt: 0, nbez: 0, riz: 0 };
    for (const u of lista) {
      a.uk++;
      const n = u.nak || 0;
      if (u.do >= DANAS) {
        a.akt++; a.nakt += n;
        if (u.do < M12) { a.i12++; a.n12 += n; }
        if (u.do < M6) a.i6++;
        if (u.rizik) a.riz++;
      } else a.ist++;
      if (u.nast) {
        a.zr++;
        if (u.nast === 3) { a.bez++; a.nbez += n; }
        else if (u.nast === 1) a.obn++;
        else a.zam++;
      }
    }
    a.udio = a.zr ? a.bez / a.zr : null;
    const st = opcId && opcMeta[opcId] ? opcMeta[opcId].stanovnika : null;
    a.stanovnika = st;
    a.nakSt = st && a.nakt ? a.nakt / st : null;
    a.nak12St = st && a.n12 ? a.n12 / st : null;
    return a;
  }
  function poOpcini() {
    const m = {};
    for (const u of U) if (u.opc && filt(u)) (m[u.opc] = m[u.opc] || []).push(u);
    const r = {};
    for (const k in m) r[k] = agregat(m[k], k);
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
    el.innerHTML = stavke.map(([v, op, kl, obj]) =>
      `<div class="kpi ${kl || ""}"${obj ? ` title="${esc(obj)}"` : ""}><div class="kpi-vr">${v}</div><div class="kpi-op">${op}</div>${obj ? `<div class="kpi-obj">${esc(obj)}</div>` : ""}</div>`
    ).join("");
  }
  // Fitilj: jedna traka od DANAS do +12 mj. s brojem ugovora koji ističu u 6 i u 12 mjeseci
  const fitiljHtml = (a) =>
    `<div class="kpi fitilj" title="Ugovori kojima rok istječe u idućih 6, odnosno 12 mjeseci. Za njih novi postupak prema Zakonu o koncesijama treba biti u pripremi ili već u tijeku.">` +
    `<div class="fitilj-brojevi"><div><div class="kpi-vr">${fmt.format(a.i6)}</div><div class="kpi-op">ističe u 6 mjeseci</div></div>` +
    `<div><div class="kpi-vr">${fmt.format(a.i12)}</div><div class="kpi-op">ističe u 12 mjeseci</div></div></div>` +
    `<div class="fitilj-staza" aria-hidden="true"><i></i></div>` +
    `<div class="fitilj-oznake" aria-hidden="true"><b>Danas · ${hrDat(DANAS)}</b><span>+6 mj.</span><span>+12 mj.</span></div></div>`;
  function kpiRok(el, a, akt, novac, udio) {
    kpi(el, [akt]);
    el.insertAdjacentHTML("beforeend", fitiljHtml(a));
    const ostalo = document.createElement("div"); kpi(ostalo, [novac, udio]);
    el.insertAdjacentHTML("beforeend", ostalo.innerHTML);
  }
  function kpiGlobal() {
    const a = agregat(U.filter(filt));
    kpiRok($("#kpi"), a,
      [fmt.format(a.akt), "aktivnih ugovora", "", "Ugovori kojima rok još nije istekao."],
      [eur(a.n12), "godišnje naknade ističe u 12 mj.", "novac", "Ugovorena fiksna godišnja naknada ugovora koji ističu; bez novog ugovora taj prihod prestaje."],
      [pct(a.udio), "isteklih bez nastavka", "isteklo", "Od ugovora isteklih prije više od godinu dana (bez zdravstva), udio koji nije obnovljen niti zamijenjen."]);
  }
  // Logo: luk pokazuje udio aktivnih ugovora koji ističu u idućih 12 mjeseci (cijela RH)
  { const a = agregat(U); document.documentElement.style.setProperty("--udio-logo", (a.akt ? Math.round(a.i12 / a.akt * 100) : 0) + "%"); }

  // ---------- KARTA ----------
  const SK_ROK = () => [css("--t-staza"), css("--t-uskoro"), css("--t-hitno"), "#6e1a12"];
  const SK_MIRNO = () => [css("--t-staza"), css("--t-mirno-2"), css("--t-mirno"), "#1f3a4f"];
  const POK = {
    udio: { naslov: "Udio isteklih koncesija bez nastavka", opis: `Od ugovora isteklih prije više od 12 mjeseci (bez zdravstva): koliko ih nije obnovljeno niti zamijenjeno novim ugovorom iste vrste. Sivo: manje od ${MIN_ZRELIH} takvih ugovora.`, v: (a) => a.zr >= MIN_ZRELIH ? a.udio : null, f: pct, boje: SK_ROK },
    istjece12: { naslov: "Koncesije koje ističu u idućih 12 mjeseci", opis: "Broj ugovora kojima istječe rok u sljedećih godinu dana: tu bi davatelj već trebao pripremati novi postupak.", v: (a) => a.i12 || null, f: fmt.format, boje: SK_ROK },
    naknada12: { naslov: "Godišnja naknada koja ističe u 12 mjeseci", opis: "Zbroj ugovorene fiksne godišnje naknade (EUR) za ugovore koji ističu u sljedećih godinu dana.", v: (a) => a.n12 || null, f: eur, boje: SK_ROK },
    naknadaSt: { naslov: "Aktivna godišnja naknada po stanovniku (DZS Popis 2021.)", opis: "Ugovorena fiksna godišnja naknada aktivnih koncesija podijeljena s brojem stanovnika općine/grada prema Popisu 2021. (data.gov.hr / DZS).", v: (a) => a.nakSt ? Math.round(a.nakSt * 10) / 10 : null, f: (v) => v == null ? "–" : fmtDec.format(v) + " €/st.", boje: SK_MIRNO },
    aktivne: { naslov: "Aktivne koncesije", opis: "Broj ugovora koji danas vrijede.", v: (a) => a.akt || null, f: fmt.format, boje: SK_MIRNO },
    bez: { naslov: "Istekle koncesije bez nastavka (broj)", opis: "Broj ugovora isteklih prije više od 12 mjeseci za koje nije pronađen novi ugovor iste vrste u općini (bez zdravstva).", v: (a) => a.bez || null, f: fmt.format, boje: SK_ROK },
    rizik: { naslov: "Aktivni ugovori s cjenovnim odmakom ili rizikom", opis: "Broj aktivnih ugovora u općini kod kojih je fiksna naknada < 15 % medijana iste stvarne namjene (bez varijabilne naknade), rok > 30 god. ili nedostaje upis naknade.", v: (a) => a.riz || null, f: fmt.format, boje: SK_ROK },
  };
  function karta() {
    const po = poOpcini(), p = POK[S.pokazatelj];
    const dodNaslov = (S.sektor ? ` · ${sektorNaziv[S.sektor]}` : "") + (S.namjena !== "" ? ` · ${namjene[+S.namjena][2]} ${namjene[+S.namjena][1]}` : "");
    $("#karta-naslov").textContent = p.naslov + dodNaslov;
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
        const m = opcMeta[d.name];
        if (!a) return `<b>${n}</b><br>nema ugovora za odabrani filter`;
        const stRed = m && m.stanovnika ? `<br>stanovnika (DZS 2021.): ${fmt.format(m.stanovnika)} · porez na dohodak: ${m.porezNiza || "–"}% / ${m.porezVisa || "–"}%` : "";
        return `<b>${n}</b><br>${p.naslov}: <b>${isNaN(d.value) ? "–" : p.f(d.value)}</b><br>` +
          `aktivne ${fmt.format(a.akt)} (${eur(a.nakt)}/god.) · ističe u 12 mj. ${fmt.format(a.i12)} (${eur(a.n12)}/god.)<br>` +
          `istekle bez nastavka ${fmt.format(a.bez)} / ${fmt.format(a.zr)}${stRed}<br><i>klik za profil općine</i>`;
      } },
      visualMap: { min: 0, max, calculable: true, left: 8, bottom: 8, inRange: { color: p.boje() },
        textStyle: { color: css("--tekst-2") }, itemHeight: 120, formatter: (v) => p.f(v) },
      series: [{ type: "map", map: "hr", roam: true, scaleLimit: { min: 1, max: 12 }, nameProperty: "name", data,
        itemStyle: { areaColor: css("--rub"), borderColor: css("--povrsina"), borderWidth: 0.5 },
        emphasis: { label: { show: false }, itemStyle: { areaColor: css("--naglasak"), borderColor: css("--tekst") } },
        select: { disabled: true }, label: { show: false } }],
    }, true);
    g.off("click"); g.on("click", (e) => { location.hash = "#opcina/" + e.name; });
    $("#graf-karta").setAttribute("aria-label", `Karta općina: ${p.naslov}. Isti podaci su u popisu „Poredak općina“.`);

    const red = data.filter((d) => !isNaN(d.value)).sort((x, y) => y.value - x.value || y.a.zr - x.a.zr || y.a.uk - x.a.uk);
    $("#poredak-opis").textContent = `${red.length} općina i gradova s podatkom, od najvećeg.`;
    $("#poredak").innerHTML = red.slice(0, 150).map((d, i) =>
      `<li><a href="#opcina/${d.name}"><span class="rb">${i + 1}.</span><span>${esc(nazivOpcine[d.name])}</span><span class="vr">${p.f(d.value)}</span>` +
      `<span class="pod">${S.pokazatelj === "udio" ? `${d.a.bez} od ${d.a.zr} isteklih` : S.pokazatelj === "naknada12" ? `${d.a.i12} ugovora ističe u 12 mj.` : S.pokazatelj === "naknadaSt" ? `${eur(d.a.nakt)} ukupno · ${fmt.format(d.a.stanovnika || 0)} st.` : `${d.a.akt} aktivnih · ${d.a.uk} ukupno`}</span></a></li>`).join("");
  }

  // ---------- Pomoćne funkcije za redak tablice s AI oznakom ----------
  function oznakaRizikaHtml(u) {
    const ozn = [];
    if (u.rizik & 1) ozn.push(`<span class="rizik-oznaka" title="Fiksna naknada je manja od 15 % medijana istovrsnih ugovora u RH (${eurPun(u.namMedijan)}) bez varijabilne naknade">⚠️ Cjenovni odmak</span>`);
    if (u.rizik & 2) ozn.push(`<span class="rizik-oznaka" title="Ugovor sklopljen na razdoblje dulje od 30 godina">⏳ Rok &gt; 30 god.</span>`);
    if ((u.rizik & 4) && u.do >= DANAS) ozn.push(`<span class="rizik-oznaka" title="U registru nije navedena ni fiksna ni varijabilna naknada">❓ Bez naknade</span>`);
    return ozn.join(" ");
  }

  function celijaKoncesionara(u) {
    const pf = portfelj[u.kanonskiIdx];
    const brTekst = pf && pf.ukupno > 1 ? ` · <b>${pf.ukupno} ugovora u RH</b> (${pf.opcine.size} JLS)` : "";
    return `<strong>${esc(u.kon)}</strong><span class="pod-tekst">${esc(u.korTip)}${u.korOib ? ` · OIB ${esc(u.korOib)}` : ""}${brTekst}</span>`;
  }

  function celijaVrsteAi(u) {
    return `${esc(u.vrsta)}<br><span class="ai-oznaka" title="${esc(u.namOpis)}">${u.namIkona} AI: ${esc(u.namNaziv)}</span>`;
  }

  function celijaNaknade(u) {
    return `${u.nak != null ? `<strong>${eurPun(u.nak)}</strong>` : `<span class="opis">nije upisano</span>`}` +
      (u.varNak ? `<span class="var-nak">${esc(u.varNak)}</span>` : "") +
      (u.rizik ? `<br>${oznakaRizikaHtml(u)}` : "");
  }

  function veziKlikRedaka(tablicaEl) {
    tablicaEl.querySelectorAll("tr[data-ugovor]").forEach((tr) => {
      tr.onclick = (e) => {
        if (e.target.closest("a")) return;
        otvoriModalUgovora(U[+tr.dataset.ugovor]);
      };
    });
  }

  // Pozadinski pojasevi: prvih 6 mjeseci (hitno) i 6–12 mj., s crtom DANAS na početku
  function pojaseviRoka(labele) {
    const band = (od, do_, boja, tekst) => [{ xAxis: labele[od], itemStyle: { color: boja }, label: { show: true, position: "insideTop", formatter: tekst, color: css("--tekst-2"), fontFamily: "Barlow Condensed", fontWeight: 600, fontSize: 13 } }, { xAxis: labele[do_] }];
    const mix = (v, a) => `color-mix(in srgb, ${css(v)} ${a}%, transparent)`;
    const p = [];
    if (labele.length) p.push(band(0, Math.min(5, labele.length - 1), mix("--t-hitno", 9), "< 6 mj."));
    if (labele.length > 6) p.push(band(6, Math.min(11, labele.length - 1), mix("--t-uskoro", 10), "6–12 mj."));
    return {
      markArea: { silent: true, data: p },
      markLine: { silent: true, symbol: "none", data: [{ xAxis: labele[0] }],
        lineStyle: { color: css("--t-hitno"), width: 2, type: "solid" },
        label: { formatter: "DANAS", position: "end", color: css("--t-hitno"), fontFamily: "Barlow Condensed", fontWeight: 700 } },
    };
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
      series: sektori.filter((s) => mat[s].some((x) => x)).map((s, idx) => ({
        id: s, name: sektorNaziv[s], type: "bar", stack: "a", data: mat[s], barMaxWidth: 36,
        itemStyle: { color: SEKTOR_BOJE[s], borderRadius: 0 },
        emphasis: { focus: "series" },
        ...(idx === 0 ? pojaseviRoka(labele) : {}),
      })),
    }, true);
    g.off("click"); g.on("click", (e) => { S.mjesec = kljuc(mjeseci[e.dataIndex]); prikazi(); });
    $("#graf-sat").setAttribute("aria-label", `Stupčasti graf: ${lista.length} ugovora ističe u idućih ${N} mjeseci, po mjesecima i sektorima.`);

    let red = lista.slice().sort((a, b) => a.do - b.do);
    if (S.mjesec != null) red = red.filter((u) => kljuc(u.do) === S.mjesec);
    const mjTxt = S.mjesec != null ? ` u ${MJ[S.mjesec % 12]} ${Math.floor(S.mjesec / 12)}.` : ` u idućih ${N} mjeseci`;
    const nSum = red.reduce((s, u) => s + (u.nak || 0), 0);
    $("#tablica-sat-naslov").textContent = `${fmt.format(red.length)} ugovora ističe${mjTxt} · ${eur(nSum)} godišnje fiksne naknade`;
    satLista = red; satNaslov = `istjece${S.mjesec != null ? "_" + MJ[S.mjesec % 12] + Math.floor(S.mjesec / 12) : "_" + N + "mj"}`;
    $("#sat-ponisti").hidden = S.mjesec == null;
    const LIM = 350;
    const tabEl = $("#tablica-sat");
    tabEl.innerHTML = `<thead><tr><th>Ističe</th><th>Općina / lokacija</th><th>Koncesionar i profil</th><th>Vrsta i ✨ AI stvarna namjena</th><th class="br">Naknada / god.</th><th>Davatelj (JPT)</th><th>Uvid</th></tr></thead><tbody>` +
      red.slice(0, LIM).map((u) => `<tr class="red-klik" data-ugovor="${u.i}"><td class="dat">${rokHtml(u)}</td>` +
        `<td>${u.opc ? `<a href="#opcina/${u.opc}">${esc(nazivOpcine[u.opc])}</a>` : "–"}<br><span class="opis">${esc(u.lok)}</span></td>` +
        `<td>${celijaKoncesionara(u)}</td><td>${celijaVrsteAi(u)}</td><td class="br">${celijaNaknade(u)}</td>` +
        `<td>${esc(u.dav)}<span class="pod-tekst">${esc(u.davVrsta)}</span></td>` +
        `<td><button type="button" class="gumb gumb-mali">✨ AI sažetak</button></td></tr>`).join("") + "</tbody>";
    veziKlikRedaka(tabEl);
    $("#tablica-sat-napomena").textContent = red.length > LIM ? `Prikazano prvih ${LIM} od ${fmt.format(red.length)}; preuzmite CSV za sve ili suzite pretragu.` : "";
  }

  // ---------- OPĆINA ----------
  function opcina() {
    if (!S.opcina || !nazivOpcine[S.opcina]) {
      const po = poOpcini(), zadnja = ucitaj("opcina");
      S.opcina = zadnja && nazivOpcine[zadnja] ? zadnja : Object.keys(po).sort((a, b) => po[b].i12 - po[a].i12)[0];
      history.replaceState(null, "", "#opcina/" + S.opcina);
    }
    const id = S.opcina, naziv = nazivOpcine[id], m = opcMeta[id] || {};
    opcSel.value = id; spremi("opcina", id);
    $("#h-opcina").textContent = naziv;
    document.title = `${naziv} · Koncesijski sat`;
    const sve = U.filter((u) => u.opc === id && filt(u));
    const a = agregat(sve, id), rh = agregat(U.filter(filt));

    // Traka povezanih otvorenih podataka (5 izvora s data.gov.hr)
    const metaStavke = [];
    if (m.zupanija) metaStavke.push(`<span class="jls-stavka">📍 Županija: <b>${esc(m.zupanija)}</b></span>`);
    if (m.oib) metaStavke.push(`<span class="jls-stavka">🏛️ OIB JLS: <b>${esc(m.oib)}</b> (JPT ${esc(m.oznaka || "–")}) <span class="jls-izvor">jpt.gov.hr</span></span>`);
    if (m.stanovnika) metaStavke.push(`<span class="jls-stavka">👥 Stanovništvo: <b>${fmt.format(m.stanovnika)}</b> <span class="jls-izvor">DZS 2021.</span></span>`);
    if (a.nakSt != null) metaStavke.push(`<span class="jls-stavka">💶 Aktivna naknada: <b>${fmtDec.format(a.nakSt)} €/st.</b></span>`);
    if (m.porezNiza != null) metaStavke.push(`<span class="jls-stavka">📊 Porez na dohodak 2026.: <b>${m.porezNiza} % / ${m.porezVisa} %</b> <span class="jls-izvor">Porezna uprava</span></span>`);
    if (m.web) {
      const url = m.web.startsWith("http") ? m.web : "https://" + m.web;
      metaStavke.push(`<span class="jls-stavka">🌐 <a href="${esc(url)}" target="_blank" rel="noopener">${esc(m.web.replace(/^https?:\/\//, ""))}</a> <span class="jls-izvor">Adresar</span></span>`);
    }
    if (m.email) metaStavke.push(`<span class="jls-stavka">✉️ <a href="mailto:${esc(m.email)}">${esc(m.email)}</a></span>`);
    $("#opcina-meta").innerHTML = metaStavke.join("");

    kpiRok($("#opcina-kpi"), a,
      [fmt.format(a.akt), "aktivnih ugovora", "", `Ukupna aktivna fiksna naknada: ${eur(a.nakt)}/god.`],
      [eur(a.n12), "godišnje naknade ističe u 12 mj.", "novac", a.nak12St ? `To iznosi ${fmtDec.format(a.nak12St)} € po stanovniku u idućih 12 mj.` : "Ugovorena fiksna godišnja naknada ugovora koji ističu u idućih 12 mjeseci."],
      [pct(a.udio), `isteklih bez nastavka (RH ${pct(rh.udio)})`, "isteklo", "Od ugovora isteklih prije više od godinu dana (bez zdravstva), udio koji nije obnovljen niti zamijenjen."]);

    // Pametni AI sažetak općine
    const rec = [];
    if (!a.uk) rec.push("U registru nema ugovora smještenih u ovu jedinicu" + (S.sektor || S.namjena !== "" ? " za odabrani filter." : "."));
    else {
      const prvi = sve.filter((u) => u.do >= DANAS).sort((x, y) => x.do - y.do)[0];
      if (prvi) rec.push(`<strong>✨ AI sažetak jedinice:</strong> Sljedeći ugovor koji ističe je <b>${esc(prvi.kon)}</b> (${prvi.namIkona} <em>${esc(prvi.namNaziv)}</em>), <b>${hrDat(prvi.do)}</b> (${za(prvi.do)}).`);
      else rec.push(`<strong>✨ AI sažetak jedinice:</strong> Trenutačno nema aktivnih ugovora.`);

      // Dominantne AI stvarne namjene u općini
      const poNam = {};
      sve.forEach((u) => { poNam[u.namIdx] = (poNam[u.namIdx] || 0) + 1; });
      const topNam = Object.entries(poNam).sort((x, y) => y[1] - x[1]).slice(0, 3);
      if (topNam.length) {
        const opisNam = topNam.map(([idx, br]) => `${namjene[idx][2]} <b>${esc(namjene[idx][1].toLowerCase())}</b> (${br})`).join(", ");
        rec.push(`Prema AI klasifikaciji stvarne namjene, u ovoj jedinici najzastupljeniji su: ${opisNam}.`);
      }

      if (a.zr >= MIN_ZRELIH) {
        const r = a.udio - rh.udio;
        rec.push(`Od ${fmt.format(a.zr)} zrelih isteklih ugovora <b>${fmt.format(a.bez)} nije dobilo nastavak (${pct(a.udio)})</b>, što je ` +
          (Math.abs(r) < 0.05 ? "blizu prosjeka RH." : r > 0 ? `<b>${Math.round(r * 100)} postotnih bodova više</b> od prosjeka RH.` : `${Math.round(-r * 100)} postotnih bodova manje od prosjeka RH.`));
      }
      if (a.i12) rec.push(`U idućih 12 mjeseci ističe <b>${fmt.format(a.i12)}</b> ugovora s ukupno <b>${eur(a.n12)}</b> godišnje fiksne naknade` + (a.nak12St ? ` (<b>${fmtDec.format(a.nak12St)} €/st.</b>).` : "."));
      if (a.nbez && m.porezVisa) {
        rec.push(`Istekli ugovori bez nastavka nosili su <b>${eur(a.nbez)}</b> godišnje naknade, dok jedinica primjenjuje stopu poreza na dohodak od <b>${m.porezNiza} % / ${m.porezVisa} %</b>.`);
      }
    }
    $("#opcina-sazetak").innerHTML = rec.join(" ");

    // Kroz vrijeme
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
        { name: "počinje", type: "bar", data: poc, itemStyle: { color: css("--t-mirno") } },
        { name: "ističe", type: "bar", data: ist, itemStyle: { color: css("--t-uskoro") },
          markLine: { symbol: "none", silent: true, label: { formatter: "DANAS", color: css("--t-hitno"), fontFamily: "Barlow Condensed", fontWeight: 700 }, lineStyle: { color: css("--t-hitno"), width: 2, type: "solid" },
            data: [{ xAxis: String(DANAS.getFullYear()) }] } },
      ],
    }, true);

    // Nastavak po sektoru
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

    // Tablica općine
    const [kol, smjer] = S.sort.opc;
    const kljucevi = { do: (u) => +u.do, od: (u) => +(u.od || 0), kon: (u) => u.kon, vrsta: (u) => u.namNaziv, nak: (u) => u.nak || 0 };
    const red = sve.filter(trazi).sort((x, y) => { const p = kljucevi[kol](x), q = kljucevi[kol](y); return (p > q ? 1 : p < q ? -1 : 0) * smjer; });
    const th = (k, t) => `<th${kol === k ? ` aria-sort="${smjer > 0 ? "ascending" : "descending"}"` : ""}><button type="button" data-sort="${k}">${t}${kol === k ? (smjer > 0 ? " ▲" : " ▼") : ""}</button></th>`;
    const LIM = 500;
    const tabEl = $("#tablica-opcina");
    tabEl.innerHTML = `<thead><tr>${th("do", "Ističe")}${th("od", "Od")}<th>Status</th>${th("kon", "Koncesionar i profil")}${th("vrsta", "Vrsta i ✨ AI stvarna namjena")}${th("nak", "Naknada / god.")}<th>Nakon isteka</th><th>Davatelj</th><th>Uvid</th></tr></thead><tbody>` +
      red.slice(0, LIM).map((u) => `<tr class="red-klik" data-ugovor="${u.i}"><td class="dat">${rokHtml(u)}</td><td class="dat">${hrDat(u.od)}</td>` +
        `<td><span class="oznaka st-${u.st}">${ST_TXT[u.st]}</span></td>` +
        `<td>${celijaKoncesionara(u)}</td><td>${celijaVrsteAi(u)}</td><td class="br">${celijaNaknade(u)}</td>` +
        `<td>${u.nast ? `<span class="oznaka ${NAST_KL[u.nast]}">${NAST[u.nast]}</span>` : ""}</td>` +
        `<td>${esc(u.dav)}<span class="pod-tekst">${esc(u.davVrsta)}</span></td>` +
        `<td><button type="button" class="gumb gumb-mali">✨ AI sažetak</button></td></tr>`).join("") + "</tbody>";
    veziKlikRedaka(tabEl);
    opcLista = red;
    $("#tablica-opcina-napomena").textContent = red.length > LIM ? `Prikazano ${LIM} od ${fmt.format(red.length)}.` : `${fmt.format(red.length)} ugovora.`;
    tabEl.querySelectorAll("[data-sort]").forEach((b) => b.onclick = () => {
      const k = b.dataset.sort; S.sort.opc = [k, kol === k ? -smjer : (k === "kon" || k === "vrsta" ? 1 : -1)]; opcina();
      $(`#tablica-opcina [data-sort="${k}"]`).focus();
    });
  }

  // ---------- RIZICI I REVIZIJA ----------
  function revizija() {
    const bit = S.rizikVrsta;
    const lista = U.filter((u) => {
      if (!filt(u) || !trazi(u)) return false;
      if (bit === 1) return (u.rizik & 1) && u.do >= DANAS;
      if (bit === 2) return (u.rizik & 2) !== 0;
      if (bit === 4) return (u.rizik & 4) && u.do >= DANAS;
      return u.rizik !== 0 && u.do >= DANAS;
    }).sort((a, b) => (a.nak || 0) - (b.nak || 0) || a.do - b.do);
    revLista = lista;

    const LIM = 250;
    const tabEl = $("#tablica-revizija");
    tabEl.innerHTML = `<thead><tr><th>Rizik / odmak</th><th>Općina / lokacija</th><th>Koncesionar i profil</th><th>Vrsta i ✨ AI stvarna namjena</th><th class="br">Ugovorena naknada</th><th class="br">Medijan skupine</th><th>Ističe</th><th>Uvid</th></tr></thead><tbody>` +
      lista.slice(0, LIM).map((u) => `<tr class="red-klik" data-ugovor="${u.i}">` +
        `<td>${oznakaRizikaHtml(u)}</td>` +
        `<td>${u.opc ? `<a href="#opcina/${u.opc}">${esc(nazivOpcine[u.opc])}</a>` : "–"}<br><span class="opis">${esc(u.lok)}</span></td>` +
        `<td>${celijaKoncesionara(u)}</td><td>${celijaVrsteAi(u)}</td>` +
        `<td class="br"><strong>${u.nak != null ? eurPun(u.nak) : "nije upisano"}</strong>${u.varNak ? `<span class="var-nak">${esc(u.varNak)}</span>` : ""}</td>` +
        `<td class="br">${eurPun(u.namMedijan)}/god.</td>` +
        `<td class="dat">${rokHtml(u)}</td>` +
        `<td><button type="button" class="gumb gumb-mali">✨ AI &amp; ZPPI</button></td></tr>`).join("") + "</tbody>";
    veziKlikRedaka(tabEl);
    $("#tablica-revizija-napomena").textContent = `Pronađeno ${fmt.format(lista.length)} ugovora prema odabranom kriteriju revizije (prikazano prvih ${Math.min(LIM, lista.length)}).`;

    // Najveći koncesionari u RH (po OIB-u)
    const topKor = Object.values(portfelj)
      .filter((p) => p.aktivnih > 0 && p.ugovori.some((u) => filt(u) && trazi(u)))
      .sort((a, b) => b.nakAkt - a.nakAkt || b.aktivnih - a.aktivnih)
      .slice(0, 60);
    const tabKor = $("#tablica-koncesionari");
    tabKor.innerHTML = `<thead><tr><th>Koncesionar (OIB portfelj)</th><th>AI djelatnost i namjene</th><th class="br">Aktivni (ukupno)</th><th class="br">Općine</th><th class="br">Aktivna naknada</th></tr></thead><tbody>` +
      topKor.map((p) => {
        const prviAkt = p.ugovori.find((u) => u.do >= DANAS) || p.ugovori[0];
        const namTxt = Array.from(p.namjeneSet).slice(0, 2).join(", ");
        return `<tr class="red-klik" data-ugovor="${prviAkt.i}">` +
          `<td><strong>${esc(p.naziv)}</strong><span class="pod-tekst">${p.oib ? `OIB ${esc(p.oib)}` : "Fizička osoba / obrt"}</span></td>` +
          `<td>${esc(p.tip)}<span class="pod-tekst">${esc(namTxt)}</span></td>` +
          `<td class="br"><b>${p.aktivnih}</b> (${p.ukupno})</td>` +
          `<td class="br">${p.opcine.size}</td>` +
          `<td class="br"><strong>${eur(p.nakAkt)}</strong></td></tr>`;
      }).join("") + "</tbody>";
    veziKlikRedaka(tabKor);

    // Općine s najvećim fiskalnim rizikom u 12 mj.
    const po = poOpcini();
    const fiskLista = Object.entries(po)
      .filter(([oid, a]) => a.n12 > 0 && a.stanovnika)
      .sort((x, y) => (y[1].nak12St || 0) - (x[1].nak12St || 0))
      .slice(0, 60);
    $("#tablica-fiskalni-rizik").innerHTML = `<thead><tr><th>Općina / grad</th><th class="br">Ističe u 12 mj. (€/st.)</th><th class="br">Ukupno ističe u 12 mj.</th><th class="br">Bez nastavka</th><th class="br">Porez na dohodak</th></tr></thead><tbody>` +
      fiskLista.map(([oid, a]) => {
        const m = opcMeta[oid] || {};
        return `<tr><td><a href="#opcina/${oid}"><strong>${esc(nazivOpcine[oid])}</strong></a><span class="pod-tekst">${fmt.format(a.stanovnika)} st. (DZS 2021.)</span></td>` +
          `<td class="br"><strong>${fmtDec.format(a.nak12St)} €/st.</strong></td>` +
          `<td class="br">${eur(a.n12)} (${a.i12} ug.)</td>` +
          `<td class="br">${a.zr >= MIN_ZRELIH ? pct(a.udio) : "–"}</td>` +
          `<td class="br">${m.porezNiza ? `${m.porezNiza}% / ${m.porezVisa}%` : "–"}</td></tr>`;
      }).join("") + "</tbody>";
  }

  document.querySelectorAll("#ekran-revizija .pilula").forEach((b) => {
    b.onclick = () => {
      S.rizikVrsta = +b.dataset.rizik;
      document.querySelectorAll("#ekran-revizija .pilula").forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
      revizija();
    };
  });

  // ---------- MODAL UGOVORA: AI SAŽETAK, OIB PORTFELJ, HODOGRAM I GENERATOR DOPISA ----------
  const modal = $("#modal-ugovor");
  let trenutniUgovor = null;
  let trenutniModDopisa = "sluzbenik";

  function zakonskiKoraci(u) {
    return [
      { mj: -6, naslov: "1. Imenovanje stručnog povjerenstva i studija opravdanosti", opis: "Čl. 18.–21. Zakona o koncesijama (NN 69/17): analiza tržišta, opravdanost davanja koncesije i imenovanje povjerenstva." },
      { mj: -4, naslov: "2. Procjena vrijednosti koncesije i dokumentacija za nadmetanje", opis: "Čl. 22.–27. ZOK-a: izračun procijenjene vrijednosti, minimalne fiksne/varijabilne naknade i uvjeta sposobnosti." },
      { mj: -3, naslov: "3. Objava obavijesti o namjeri davanja koncesije u EOJN RH", opis: "Čl. 29.–35. ZOK-a: javna objava u Elektroničkom oglasniku javne nabave RH (rok za dostavu ponuda min. 30 dana)." },
      { mj: -1, naslov: "4. Odluka o davanju koncesije i rok mirovanja (15 dana)", opis: "Čl. 49.–53. ZOK-a: donošenje odluke predstavničkog tijela / davatelja i čekanje isteka roka mirovanja." },
      { mj: 0, naslov: "5. Potpis ugovora o koncesiji i upis u Registar koncesija (FINA)", opis: "Čl. 54.–59. ZOK-a: sklapanje novog ugovora prije isteka postojećeg i dostava podataka u Registar koncesija u roku 10 dana." },
    ].map((k) => {
      const dat = plusMj(u.do, k.mj);
      return { ...k, datum: dat, kasni: dat < DANAS && u.do >= DANAS };
    });
  }

  function generirajAiSazetakHtml(u) {
    const pf = portfelj[u.kanonskiIdx];
    const p1 = `<p>Iako je u Registru koncesija ugovor formalno zaveden pod vrstom <b>„${esc(u.vrsta)}“</b> na lokaciji <b>${esc(u.lok || nazivOpcine[u.opc] || "RH")}</b>, analiza profila koncesionara (<b>${esc(u.kon)}</b> – <em>${esc(u.korTip)}</em>) i nadležnosti davatelja (<b>${esc(u.dav)}</b> – <em>${esc(u.davVrsta)}</em>) upućuje na to da je stvarni predmet ugovora u naravi: <strong>${u.namIkona} ${esc(u.namNaziv)}</strong>.</p>`;
    const p2 = `<p>${esc(u.namOpis)}</p>`;

    // Usporedba naknade s medijanom skupine
    let finTxt = "";
    if (u.nak != null && u.namMedijan > 0) {
      const omjer = u.nak / u.namMedijan;
      const usp = omjer >= 1.5
        ? `što je <b>${fmtDec.format(omjer)}× više</b> od medijana istovrsnih ugovora u RH (${eurPun(u.namMedijan)}/god.)`
        : omjer <= 0.25
        ? `što iznosi svega <b>${Math.round(omjer * 100)} % medijana</b> istovrsnih ugovora u RH (${eurPun(u.namMedijan)}/god.)`
        : `što je u okviru medijana istovrsnih ugovora u RH (${eurPun(u.namMedijan)}/god.)`;
      finTxt = `Ugovorena fiksna naknada iznosi <b>${eurPun(u.nak)} godišnje</b> (${usp})` +
        (u.varNak ? `, uz ugovoreni varijabilni dio naknade (<b>${esc(u.varNak)}</b>).` : `, bez evidentiranog varijabilnog dijela naknade u registru.`);
    } else if (u.varNak) {
      finTxt = `Ugovor nema iskazanu fiksnu naknadu u eurima, već se naplaćuje kroz varijabilni model (<b>${esc(u.varNak)}</b>).`;
    } else {
      finTxt = `U javnom izvozu registra za ovaj ugovor nije naveden iznos godišnje naknade (medijan za ovu namjenu u RH iznosi <b>${eurPun(u.namMedijan)}/god.</b>).`;
    }

    // Portfelj i trajanje
    const trajGod = u.od && u.do ? Math.max(1, Math.round((u.do - u.od) / (365.25 * 864e5))) : null;
    const pfTxt = pf && pf.ukupno > 1
      ? `Prema povezivanju preko OIB-a, ovaj koncesionar u Hrvatskoj ima ukupno <b>${fmt.format(pf.ukupno)} ugovora</b> (${fmt.format(pf.aktivnih)} aktivnih) u <b>${pf.opcine.size} gradova/općina</b>, s ukupnom aktivnom fiksnom naknadom od <b>${eurPun(pf.nakAkt)}/god.</b>`
      : `Koncesionar u Registru ima evidentiran isključivo ovaj ugovor.`;
    const rokTxt = u.do >= DANAS
      ? `Ugovor je sklopljen${trajGod ? ` na <b>${trajGod} god.</b> i` : ","} ističe <b>${hrDat(u.do)} (${za(u.do)})</b>.`
      : `Ugovor je istekao <b>${hrDat(u.do)} (${za(u.do)})</b>${u.nast === 3 ? " te u Registru nije pronađen nasljedni ugovor iste vrste na toj lokaciji (<b>bez nastavka</b>)." : u.nast === 1 ? " te je uredno obnovljen novim ugovorom." : "."}`;

    return p1 + p2 + `<p>${finTxt} ${pfTxt} ${rokTxt}</p>`;
  }

  function sastaviTekstDopisa(u, mod) {
    const opcNaziv = (u.opc && nazivOpcine[u.opc]) || u.lok || u.dav;
    const m = (u.opc && opcMeta[u.opc]) || {};
    const emailPrima = u.davEmail || m.email || "pisarnica@...";
    const koraci = zakonskiKoraci(u);
    if (mod === "sluzbenik") {
      return [
        `PREDMET: Pokretanje pripremnih radnji za postupak davanja koncesije prije isteka ugovora`,
        `Davatelj: ${u.dav}${u.davOib ? ` (OIB: ${u.davOib})` : ""}`,
        `Jedinica / lokacija: ${opcNaziv} (${u.lok})`,
        ``,
        `Poštovani,`,
        ``,
        `prema podacima iz Nacionalnog registra koncesija (FINA / Ministarstvo financija), dana ${hrDat(u.do)} (${za(u.do)}) istječe ugovor o koncesiji:`,
        `- Koncesionar: ${u.kon}${u.korOib ? ` (OIB: ${u.korOib})` : ""}`,
        `- Vrsta koncesije: ${u.vrsta} (AI procjena u naravi: ${u.namNaziv})`,
        `- Trajanje postojećeg ugovora: ${hrDat(u.od)} – ${hrDat(u.do)}`,
        `- Ugovorena godišnja naknada: ${u.nak != null ? eurPun(u.nak) : "nije navedena"}${u.varNak ? " " + u.varNak : ""}`,
        ``,
        `Sukladno čl. 18.–29. Zakona o koncesijama (NN 69/17, 107/20), predlaže se pravodobno pokretanje postupka prema sljedećem hodogramu:`,
        ...koraci.map((k) => `  • Do ${hrDat(k.datum)}: ${k.naslov}`),
        ``,
        `Pravodobnim provođenjem postupka sprječava se neovlašteno korištenje javnog dobra bez ugovora i osigurava kontinuitet proračunskog prihoda.`,
        ``,
        `Izvor podataka: Koncesijski sat (data.gov.hr – Registar koncesija & Popis javnopravnih tijela).`,
      ].join("\n");
    }
    return [
      `Prima: ${u.dav} (${emailPrima})`,
      `PREDMET: Zahtjev za pristup informacijama (čl. 18. ZPPI, NN 25/13, 85/15, 69/22) – Koncesija: ${u.kon}`,
      ``,
      `Poštovani,`,
      ``,
      `temeljem članka 18. Zakona o pravu na pristup informacijama (NN 25/13, 85/15, 69/22), molim Vas dostavu sljedećih informacija vezanih uz ugovor o koncesiji evidentiran u Registru koncesija Ministarstva financija:`,
      `- Davatelj: ${u.dav}${u.davOib ? ` (OIB: ${u.davOib})` : ""}`,
      `- Koncesionar: ${u.kon}${u.korOib ? ` (OIB: ${u.korOib})` : ""}`,
      `- Vrsta i lokacija: ${u.vrsta}, lokacija ${u.lok} (${opcNaziv})`,
      `- Razdoblje važenja: ${hrDat(u.od)} – ${hrDat(u.do)} (${u.do >= DANAS ? "ističe " + za(u.do) : "istekao " + za(u.do)})`,
      `- Evidentirana fiksna naknada: ${u.nak != null ? eurPun(u.nak) + "/god." : "nije navedena u registru"}${u.varNak ? " (" + u.varNak + ")" : ""}`,
      ``,
      `Molim Vas informaciju:`,
      u.do >= DANAS
        ? `1. Je li imenovano stručno povjerenstvo i izrađena studija opravdanosti za novi postupak davanja koncesije nakon isteka roka ${hrDat(u.do)}?`
        : `1. Koristi li se predmetno javno dobro nakon isteka ugovora (${hrDat(u.do)}) te na temelju koje pravne osnove, s obzirom na to da u Registru koncesija nije evidentiran novi ugovor?`,
      `2. Koliki je ukupni iznos fiksne i varijabilne koncesijske naknade naplaćen po ovom ugovoru u protekle tri godine?`,
      ``,
      `Odgovor molim dostaviti elektroničkom poštom na ovu adresu u zakonskom roku od 15 dana.`,
      ``,
      `S poštovanjem,`,
      `[Ime i prezime / Naziv podnositelja]`,
    ].join("\n");
  }

  function osvjeziDopisModal() {
    if (!trenutniUgovor) return;
    const u = trenutniUgovor;
    const tekst = sastaviTekstDopisa(u, trenutniModDopisa);
    $("#m-dopis-tekst").value = tekst;
    const m = (u.opc && opcMeta[u.opc]) || {};
    const email = u.davEmail || m.email || "";
    const subj = trenutniModDopisa === "sluzbenik"
      ? `Priprema postupka koncesije - ${u.kon} (${hrDat(u.do)})`
      : `Zahtjev za pristup informacijama - koncesija ${u.kon}`;
    $("#m-dopis-mailto").href = `mailto:${encodeURIComponent(email)}?subject=${encodeURIComponent(subj)}&body=${encodeURIComponent(tekst)}`;
    $("#m-dopis-status").textContent = email ? `Službeni e-mail iz jpt.gov.hr: ${email}` : "";
  }

  function otvoriModalUgovora(u) {
    trenutniUgovor = u;
    const pf = portfelj[u.kanonskiIdx];
    const m = (u.opc && opcMeta[u.opc]) || {};
    $("#m-oznake").innerHTML =
      `<span class="oznaka st-${u.st}">${ST_TXT[u.st]} · ${za(u.do)}</span>` +
      `<span class="oznaka">${esc(sektorNaziv[u.sektor])}</span>` +
      (u.nast ? `<span class="oznaka ${NAST_KL[u.nast]}">${NAST[u.nast]}</span>` : "") +
      oznakaRizikaHtml(u);
    $("#m-naslov").textContent = `${u.kon} — ${u.namNaziv}`;
    const dana = Math.round((u.do - DANAS) / 864e5);
    $("#m-odbrojavanje").innerHTML = `${brojcanik(u, true)}<div><div class="odbrojavanje-vr ${RAZRED[u.st]}">` +
      (dana >= 0 ? (dana === 0 ? "Ističe danas" : `Ističe za ${fmt.format(dana)} ${dana % 10 === 1 && dana % 100 !== 11 ? "dan" : "dana"}`) : `Isteklo prije ${fmt.format(-dana)} dana`) +
      `</div><div class="odbrojavanje-op">${hrDat(u.do)} · potrošeno ${potroseno(u)} % trajanja ugovora${u.od ? ` (od ${hrDat(u.od)})` : ""}</div></div>`;
    $("#m-podnaslov").textContent = `Službena vrsta u registru: ${u.vrsta} · Lokacija: ${u.lok} (${(u.opc && nazivOpcine[u.opc]) || "RH"}) · Trajanje: ${hrDat(u.od)} – ${hrDat(u.do)}`;
    $("#m-ai-bedz").textContent = `${u.namIkona} ${u.namNaziv}`;
    $("#m-ai-tekst").innerHTML = generirajAiSazetakHtml(u);

    // Kartica koncesionara (OIB portfelj)
    $("#m-korisnik-kartica").innerHTML =
      `<h3>🏢 Profil i portfelj koncesionara (OIB)</h3>` +
      `<div class="mini-red"><span>Naziv:</span><b>${esc(u.kon)}</b></div>` +
      `<div class="mini-red"><span>OIB subjekta:</span><b>${u.korOib ? esc(u.korOib) : "Zaštićeno (fizička osoba / obrt)"}</b></div>` +
      `<div class="mini-red"><span>AI profil djelatnosti:</span><b>${esc(u.korTip)}</b></div>` +
      `<div class="mini-red"><span>Ugovori u RH (po OIB-u):</span><b>${fmt.format(pf.ukupno)} ukupno (${fmt.format(pf.aktivnih)} aktivnih)</b></div>` +
      `<div class="mini-red"><span>Aktivna fiksna naknada u RH:</span><b>${eurPun(pf.nakAkt) || "0 €"} / god.</b></div>` +
      `<div class="mini-red"><span>Općine i gradovi (${pf.opcine.size}):</span><span>${esc(Array.from(pf.opcine).slice(0, 5).join(", "))}${pf.opcine.size > 5 ? "…" : ""}</span></div>` +
      (pf.ukupno > 1 ? `<div style="margin-top:8px"><button type="button" class="gumb gumb-mali" id="m-filtriraj-kor">🔎 Prikaži svih ${pf.ukupno} ugovora ovog koncesionara</button></div>` : "");

    const btnKor = $("#m-filtriraj-kor");
    if (btnKor) {
      btnKor.onclick = () => {
        modal.close();
        S.trazi = (u.korOib || u.kon).toLowerCase();
        $("#f-trazi").value = u.korOib || u.kon;
        location.hash = "#sat";
        S.razdoblje = 36; $("#f-razdoblje").value = "36";
        prikazi();
      };
    }

    // Kartica davatelja (jpt.gov.hr + općina)
    $("#m-davatelj-kartica").innerHTML =
      `<h3>🏛️ Davatelj i područje (data.gov.hr)</h3>` +
      `<div class="mini-red"><span>Davatelj:</span><b>${esc(u.dav)}</b></div>` +
      `<div class="mini-red"><span>OIB i vrsta (jpt.gov.hr):</span><b>${esc(u.davOib || "–")} · ${esc(u.davVrsta)}</b></div>` +
      `<div class="mini-red"><span>Općina / grad:</span><b>${u.opc ? `<a href="#opcina/${u.opc}" id="m-skok-opc">${esc(nazivOpcine[u.opc])}</a>` : esc(u.lok)}</b></div>` +
      `<div class="mini-red"><span>Stanovništvo (DZS 2021.):</span><b>${m.stanovnika ? fmt.format(m.stanovnika) + " st." : "–"}</b></div>` +
      `<div class="mini-red"><span>Porez na dohodak JLS (2026.):</span><b>${m.porezNiza ? `${m.porezNiza} % / ${m.porezVisa} %` : "–"}</b></div>` +
      `<div class="mini-red"><span>Službeni e-mail (jpt.gov.hr):</span><b>${esc(u.davEmail || m.email || "–")}</b></div>`;

    const skokOpc = $("#m-skok-opc");
    if (skokOpc) skokOpc.onclick = () => modal.close();

    // Zakonski hodogram
    const koraci = zakonskiKoraci(u);
    // Vremenska crta od −7 mj. do isteka (+1 mj.), s crtom DANAS ako je unutar raspona
    const t0 = plusMj(u.do, -7), t1 = plusMj(u.do, 1), pos = (d) => Math.max(0, Math.min(100, (d - t0) / (t1 - t0) * 100));
    const danasPos = (DANAS - t0) / (t1 - t0) * 100;
    $("#m-hod-crta").innerHTML = koraci.map((k, idx) =>
      `<span class="tocka${k.kasni ? " kasni" : ""}" style="left:${pos(k.datum)}%" title="${esc(k.naslov)}"><span>${idx + 1} · ${MJ[k.datum.getMonth()]}</span></span>`).join("") +
      (danasPos >= 0 && danasPos <= 100 ? `<span class="danas" style="left:${danasPos}%"><span>DANAS</span></span>` : "");
    $("#m-hod-crta").hidden = u.do < DANAS;
    $("#m-hodogram").innerHTML = koraci.map((k) =>
      `<li class="${k.kasni ? "kasni" : ""}">` +
      `<strong>${hrDat(k.datum)}</strong>` +
      `<div><b>${esc(k.naslov)}</b><span class="pod-tekst">${esc(k.opis)}</span></div>` +
      `<span class="oznaka ${k.kasni ? "st-hitno" : "st-aktivna"}">${k.kasni ? `trebalo započeti ${za(k.datum)}` : za(k.datum)}</span></li>`
    ).join("");

    osvjeziDopisModal();
    if (typeof modal.showModal === "function") modal.showModal();
    else modal.removeAttribute("hidden");
  }

  $("#m-zatvori").onclick = () => modal.close();
  modal.addEventListener("click", (e) => { if (e.target === modal) modal.close(); });
  $("#m-tip-sluzbenik").onclick = () => {
    trenutniModDopisa = "sluzbenik";
    $("#m-tip-sluzbenik").setAttribute("aria-pressed", "true");
    $("#m-tip-zppi").setAttribute("aria-pressed", "false");
    osvjeziDopisModal();
  };
  $("#m-tip-zppi").onclick = () => {
    trenutniModDopisa = "zppi";
    $("#m-tip-zppi").setAttribute("aria-pressed", "true");
    $("#m-tip-sluzbenik").setAttribute("aria-pressed", "false");
    osvjeziDopisModal();
  };
  $("#m-dopis-kopiraj").onclick = () => {
    navigator.clipboard.writeText($("#m-dopis-tekst").value);
    $("#m-dopis-status").textContent = "✓ Tekst dopisa kopiran u međuspremnik!";
  };
  $("#m-hodogram-ics").onclick = () => {
    if (trenutniUgovor) icsHodogram(trenutniUgovor);
  };
  $("#opcina-dopis").onclick = () => {
    const sve = U.filter((u) => u.opc === S.opcina && filt(u));
    const kandidat = sve.filter((u) => u.do >= DANAS).sort((a, b) => a.do - b.do)[0] || sve[0];
    if (kandidat) otvoriModalUgovora(kandidat);
  };

  // ---------- preuzimanja: CSV (Excel) i kalendar (.ics) ----------
  const lokalniIso = (d) => d ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}` : "";
  function preuzmi(ime, sadrzaj, tip) {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([sadrzaj], { type: tip }));
    a.download = ime; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }
  const slug = (t) => String(t || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/đ/g, "d").replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
  function csv(lista, ime) {
    const q = (v) => { v = v == null ? "" : String(v); return /[;"\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v; };
    const glava = ["Ističe", "Počinje", "Općina", "Lokacija", "Koncesionar", "OIB koncesionara (pravne osobe)", "Tip koncesionara", "Vrsta u registru", "AI procjena stvarne namjene", "Sektor", "Godišnja fiksna naknada (EUR)", "Varijabilna naknada", "Nakon isteka", "Davatelj", "OIB davatelja", "Vrsta davatelja (JPT)"];
    const redci = lista.map((u) => [
      lokalniIso(u.do), lokalniIso(u.od), nazivOpcine[u.opc] || "", u.lok,
      u.kon, u.korOib || "", u.korTip, u.vrsta, u.namNaziv, sektorNaziv[u.sektor],
      u.nak == null ? "" : String(u.nak).replace(".", ","), u.varNak || "", NAST[u.nast] || "",
      u.dav, u.davOib || "", u.davVrsta || "",
    ]);
    preuzmi(ime + ".csv", "\ufeff" + [glava, ...redci].map((r) => r.map(q).join(";")).join("\r\n"), "text/csv;charset=utf-8");
  }
  function presavij(l) { return l.length <= 70 ? l : l.match(/.{1,70}/g).join("\r\n "); }
  function ics(lista, ime) {
    const st = (d) => lokalniIso(d).replace(/-/g, "");
    const t = (x) => String(x).replace(/[\\;,]/g, (c) => "\\" + c).replace(/\n/g, " ");
    const sad = new Date().toISOString().replace(/[-:]/g, "").slice(0, 15) + "Z";
    const ev = lista.filter((u) => u.do >= DANAS).map((u) => [
      "BEGIN:VEVENT", `UID:ks-${u.i}@koncesijski-sat`, `DTSTAMP:${sad}`,
      `DTSTART;VALUE=DATE:${st(u.do)}`, `DTEND;VALUE=DATE:${st(new Date(u.do.getTime() + 864e5))}`,
      `SUMMARY:${t("Ističe koncesija: " + u.kon + " (" + u.namNaziv + ")")}`,
      `DESCRIPTION:${t(`AI namjena: ${u.namNaziv}. Službena vrsta: ${u.vrsta}. Lokacija: ${u.lok}. Davatelj: ${u.dav}.` + (u.nak ? ` Godišnja fiksna naknada: ${eurPun(u.nak)}.` : "") + (u.varNak ? ` Varijabilna: ${u.varNak}.` : "") + " Izvor: Registar koncesija (FINA), Koncesijski sat.")}`,
      "BEGIN:VALARM", "ACTION:DISPLAY", `DESCRIPTION:${t("Za 6 mjeseci ističe koncesija (vrijeme za imenovanje povjerenstva): " + u.kon)}`, "TRIGGER:-P182D", "END:VALARM",
      "BEGIN:VALARM", "ACTION:DISPLAY", `DESCRIPTION:${t("Za mjesec dana ističe koncesija: " + u.kon)}`, "TRIGGER:-P30D", "END:VALARM",
      "END:VEVENT"].join("\r\n"));
    if (!ev.length) { alert("Nema ugovora koji tek ističu."); return; }
    const tekst = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Koncesijski sat//HR", "CALSCALE:GREGORIAN", "X-WR-CALNAME:Rokovi koncesija", ...ev, "END:VCALENDAR"].join("\r\n");
    preuzmi(ime + ".ics", tekst.split("\r\n").map(presavij).join("\r\n"), "text/calendar;charset=utf-8");
  }
  function icsHodogram(u) {
    const st = (d) => lokalniIso(d).replace(/-/g, "");
    const t = (x) => String(x).replace(/[\\;,]/g, (c) => "\\" + c).replace(/\n/g, " ");
    const sad = new Date().toISOString().replace(/[-:]/g, "").slice(0, 15) + "Z";
    const koraci = zakonskiKoraci(u);
    const ev = koraci.map((k, idx) => [
      "BEGIN:VEVENT", `UID:ks-hodogram-${u.i}-${idx}@koncesijski-sat`, `DTSTAMP:${sad}`,
      `DTSTART;VALUE=DATE:${st(k.datum)}`, `DTEND;VALUE=DATE:${st(new Date(k.datum.getTime() + 864e5))}`,
      `SUMMARY:${t(`[Hodogram koncesije] ${k.naslov} – ${u.kon}`)}`,
      `DESCRIPTION:${t(`${k.opis} | Koncesionar: ${u.kon} | AI namjena: ${u.namNaziv} | Davatelj: ${u.dav}`)}`,
      "END:VEVENT",
    ].join("\r\n"));
    const tekst = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Koncesijski sat//HR", "CALSCALE:GREGORIAN", "X-WR-CALNAME:Hodogram koncesije", ...ev, "END:VCALENDAR"].join("\r\n");
    preuzmi(`hodogram_${slug(u.kon)}_${lokalniIso(u.do)}.ics`, tekst.split("\r\n").map(presavij).join("\r\n"), "text/calendar;charset=utf-8");
  }

  $("#sat-csv").onclick = () => csv(satLista, "koncesije_" + satNaslov);
  $("#sat-ics").onclick = () => ics(satLista, "koncesije_" + satNaslov);
  $("#opcina-csv").onclick = () => csv(opcLista, "koncesije_" + slug(nazivOpcine[S.opcina]));
  $("#opcina-ics").onclick = () => ics(opcLista, "rokovi_" + slug(nazivOpcine[S.opcina]));
  $("#revizija-csv").onclick = () => csv(revLista, "koncesije_revizija_rizika");
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
        .sort((a, b) => nazivOpcine[a].length - nazivOpcine[b].length)[0];
    if (!id) { brza.setCustomValidity("Nema takve općine ili grada"); brza.reportValidity(); return false; }
    brza.setCustomValidity(""); brza.value = ""; brza.blur();
    location.hash = "#opcina/" + id; return true;
  }
  brza.addEventListener("change", () => { if (nazivUId[brza.value.trim().toLowerCase()]) idiNaOpcinu(); });
  brza.addEventListener("input", () => brza.setCustomValidity(""));
  $("#brza-forma").addEventListener("submit", (e) => { e.preventDefault(); idiNaOpcinu(); });

  // ---------- kratke upute ----------
  if (ucitaj("upute") !== "skriveno") $("#upute").hidden = false;
  $("#upute-zatvori").onclick = () => { $("#upute").hidden = true; spremi("upute", "skriveno"); };

  // ---------- metodologija ----------
  $("#m-smjesteno").textContent = pct(U.filter((u) => u.opc).length / U.length);
  $("#m-generirano").textContent = `Podaci obrađeni ${P.generirano}; ${fmt.format(U.length)} ugovora, ${P.davatelji.length} davatelja (povezano s jpt.gov.hr), ${fmt.format(Object.keys(portfelj).length)} jedinstvenih koncesionara po OIB-u.`;

  // ---------- podaci za 3D prikaz (3d.js, ES modul) ----------
  window.CONCESSUM = { U, G, nazivOpcine, sektorNaziv, DANAS, plusMj, hrDat, fmt, eur };

  // ---------- usmjeravanje ----------
  let ruta = "karta";
  function prikazi() {
    kpiGlobal();
    if (ruta === "karta") karta();
    else if (ruta === "sat") sat();
    else if (ruta === "opcina") opcina();
    else if (ruta === "revizija") revizija();
    uskladi();                       // odmah, ekran je već prikazan pa je širina poznata
    requestAnimationFrame(uskladi);   // i nakon iscrtavanja, za svaki slučaj
  }
  function usmjeri() {
    const [r, arg] = location.hash.replace(/^#/, "").split("/");
    ruta = ["karta", "sat", "opcina", "revizija", "3d", "metodologija"].includes(r) ? r : "karta";
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
