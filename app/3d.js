/* Concessum — 3D sat: izdignuta karta općina koja kroz 3 godine pokazuje kako ugovori ističu (three.js, lokalno u vendor/three). */
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";

const C = window.CONCESSUM;
const $ = (s) => document.querySelector(s);
const MJ_MS = 30.4375 * 864e5;
const RASPON = 36;          // mjeseci koje premotavamo
const TRAJANJE_S = 24;      // koliko sekundi traje premotavanje (sporije, da se stigne pratiti)
const MJESECI = ["SIJEČANJ", "VELJAČA", "OŽUJAK", "TRAVANJ", "SVIBANJ", "LIPANJ", "SRPANJ", "KOLOVOZ", "RUJAN", "LISTOPAD", "STUDENI", "PROSINAC"];
const MJ_KR = ["SIJ", "VELJ", "OŽU", "TRA", "SVI", "LIP", "SRP", "KOL", "RUJ", "LIS", "STU", "PRO"];
const tihoKretanje = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const kratkiNaziv = (id) => (C.nazivOpcine[id] || id).replace(/^(Grad|Općina) /, "");

const B = {
  mirno: new THREE.Color("#7fa8c6"), uskoro: new THREE.Color("#f2b65a"), hitno: new THREE.Color("#ff6a3d"),
  isteklo: new THREE.Color("#3a3f47"), prazno: new THREE.Color("#1c232c"), iskra: new THREE.Color("#ff8a4d"),
};

// ---------- podaci: aktivni ugovori i mjeseci do isteka ----------
const AKT = C.U.filter((u) => u.do >= C.DANAS).map((u) => ({ u, m: (u.do - C.DANAS) / MJ_MS }));
const poRoku = AKT.slice().sort((a, b) => a.m - b.m);
const kumNak = []; { let s = 0; for (const a of poRoku) { s += a.u.nak || 0; kumNak.push(s); } }
const istekloDo = (t) => { let lo = 0, hi = poRoku.length; while (lo < hi) { const k = (lo + hi) >> 1; if (poRoku[k].m < t) lo = k + 1; else hi = k; } return lo; };
const nakDo = (t) => { const n = istekloDo(t); return n ? kumNak[n - 1] : 0; };
// povijesni udio isteklih ugovora bez nastavka (isti pokazatelj kao na karti)
const zreli = C.U.filter((u) => u.nast), udioBez = zreli.length ? zreli.filter((u) => u.nast === 3).length / zreli.length : 0;
const pct = (x) => Math.round(x * 100) + " %";
const datumZa = (m) => C.hrDat(C.plusMj(C.DANAS, m));

// Natpisi koji objašnjavaju što se upravo događa (brojke su iz podataka)
const NATPISI = [
  { do: 0.01, tekst: () => `Danas je aktivno <b>${C.fmt.format(AKT.length)}</b> ugovora o koncesiji. Pritisnite ▶ i pogledajte što ističe u iduće 3 godine.` },
  { do: 6, tekst: () => `<b>Prvih 6 mjeseci:</b> ističe <b>${C.fmt.format(istekloDo(6))}</b> ugovora. Za njih bi novi natječaj već sada trebao biti u tijeku.` },
  { do: 12, tekst: () => `<b>Do ${datumZa(12)}</b> ističe <b>${C.fmt.format(istekloDo(12))}</b> ugovora s <b>${C.eur(nakDo(12))}</b> godišnje naknade.` },
  { do: 24, tekst: () => `<b>Svaki bljesak</b> je ugovor koji je upravo istekao. Stup se spušta jer općina ima sve manje aktivnih koncesija.` },
  { do: 35.99, tekst: () => `Povijesno <b>${pct(udioBez)}</b> isteklih ugovora ostane <b>bez novog ugovora</b>, a s njima nestaje i naknada.` },
  { do: Infinity, tekst: () => `<b>Za 3 godine</b> istekne <b>${C.fmt.format(istekloDo(RASPON))}</b> ugovora i <b>${C.eur(nakDo(RASPON))}</b> godišnje naknade. Kliknite općinu za njezin profil.` },
];

let pokrenut = false, renderer, scene, camera, controls, composer, bloom, sat = new THREE.Clock();
let t = 0, svira = false, zadnjiNatpis = -1, feed = [], feedPromjena = false, feedSat = 0;
const opcine = [], oznake = [];
let iskre = null;

function pokreni() {
  if (pokrenut) return;
  pokrenut = true;
  const platno = $("#tri-platno"), pozornica = $("#tri-pozornica");
  renderer = new THREE.WebGLRenderer({ canvas: platno, antialias: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio));
  scene = new THREE.Scene();
  scene.background = new THREE.Color("#0a0d12");
  scene.fog = new THREE.Fog("#0a0d12", 70, 140);
  camera = new THREE.PerspectiveCamera(42, 1, 0.1, 400);
  camera.position.set(4, 34, 40);
  controls = new OrbitControls(camera, platno);
  controls.target.set(0, 0, -2);
  controls.enableDamping = true; controls.maxPolarAngle = Math.PI * 0.47; controls.minDistance = 8; controls.maxDistance = 120;
  controls.autoRotate = !tihoKretanje; controls.autoRotateSpeed = 0.2;

  scene.add(new THREE.HemisphereLight("#9fb6cc", "#0a0d12", 0.9));
  const sunce = new THREE.DirectionalLight("#ffffff", 1.6); sunce.position.set(-20, 40, 25); scene.add(sunce);
  const kontra = new THREE.DirectionalLight("#ff8a4d", 0.5); kontra.position.set(25, 10, -30); scene.add(kontra);

  composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.55, 0.5, 0.7);
  composer.addPass(bloom);
  composer.addPass(new OutputPass());

  izgradiKartu();
  izgradiOznake();
  controls.update();

  const uskladi = () => {
    const w = pozornica.clientWidth, h = pozornica.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false); composer.setSize(w, h); bloom.setSize(w, h);
    camera.aspect = w / h; camera.updateProjectionMatrix();
  };
  new ResizeObserver(uskladi).observe(pozornica); uskladi();

  // hover i klik na općinu
  const ray = new THREE.Raycaster(), mis = new THREE.Vector2();
  let nadOpcinom = null;
  platno.addEventListener("pointermove", (e) => {
    const r = platno.getBoundingClientRect();
    mis.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(mis, camera);
    const hit = ray.intersectObjects(opcine.map((o) => o.mesh))[0];
    nadOpcinom = hit ? hit.object.userData.o : null;
    platno.style.cursor = nadOpcinom ? "pointer" : "";
    const info = $("#tri-info");
    info.hidden = !nadOpcinom;
    if (nadOpcinom) {
      const o = nadOpcinom, ost = o.roks.length - o.idx;
      info.innerHTML = `<b>${C.nazivOpcine[o.id] || o.id}</b><br>${C.fmt.format(ost)} aktivnih ugovora` +
        (t > 0.01 ? ` (danas ${C.fmt.format(o.roks.length)})` : "") +
        (ost ? ` · sljedeći istek za ${Math.max(0, Math.round(o.roks[o.idx].m - t))} mj.` : "") + `<br><i>klik za profil općine</i>`;
    }
  });
  platno.addEventListener("click", () => { if (nadOpcinom) location.hash = "#opcina/" + nadOpcinom.id; });

  renderer.setAnimationLoop(petlja);
}

// ---------- KARTA STUPOVA ----------
function izgradiKartu() {
  const g = new THREE.Group(); g.rotation.x = -Math.PI / 2;   // lokalni z (visina) postaje svjetski y
  const lon0 = 16.45, lat0 = 44.45, K = 9, kx = Math.cos(lat0 * Math.PI / 180) * K;
  const pr = ([lon, lat]) => new THREE.Vector2((lon - lon0) * kx, (lat - lat0) * K);
  const poOpc = {};
  for (const a of AKT) if (a.u.opc) (poOpc[a.u.opc] = poOpc[a.u.opc] || []).push({ m: a.m, nak: a.u.nak || 0 });
  const maxN = Math.max(...Object.values(poOpc).map((l) => l.length));

  for (const f of C.G.features) {
    const shapes = [];
    for (const poly of f.geometry.coordinates) {
      const prsten = (r) => { const p = r.map(pr); if (p.length > 1 && p[0].equals(p[p.length - 1])) p.pop(); return p; };
      const sh = new THREE.Shape(prsten(poly[0]));
      for (const rupa of poly.slice(1)) sh.holes.push(new THREE.Path(prsten(rupa)));
      shapes.push(sh);
    }
    const geo = new THREE.ExtrudeGeometry(shapes, { depth: 1, bevelEnabled: false });
    const roks = (poOpc[f.properties.name] || []).sort((a, b) => a.m - b.m);
    const mat = new THREE.MeshStandardMaterial({ color: B.prazno.clone(), roughness: 0.5, metalness: 0.15, emissive: new THREE.Color("#000"), emissiveIntensity: 1 });
    const mesh = new THREE.Mesh(geo, mat);
    geo.computeBoundingBox();
    const c = new THREE.Vector3(); geo.boundingBox.getCenter(c);
    const o = { id: f.properties.name, mesh, roks, idx: 0, puls: 0, centar: c, visina: 0.12, maxN };
    mesh.userData.o = o;
    opcine.push(o); g.add(mesh);
    mesh.add(new THREE.LineSegments(new THREE.EdgesGeometry(geo, 30), new THREE.LineBasicMaterial({ color: "#0a0d12", transparent: true, opacity: 0.55 })));
  }
  // iskre
  const N = 5000, pos = new Float32Array(N * 3), col = new Float32Array(N * 3);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  geo.setAttribute("color", new THREE.BufferAttribute(col, 3));
  const obj = new THREE.Points(geo, new THREE.PointsMaterial({ size: 0.42, map: krug(), vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
  obj.frustumCulled = false;
  iskre = { obj, pos, col, vel: new Float32Array(N * 3), zivot: new Float32Array(N), sljedeca: 0, N };
  scene.add(g, obj);
  // tlo
  const tlo = new THREE.Mesh(new THREE.CircleGeometry(60, 64), new THREE.MeshStandardMaterial({ color: "#0d1218", roughness: 1 }));
  tlo.rotation.x = -Math.PI / 2; tlo.position.y = -0.02; scene.add(tlo);
  scene.add(new THREE.PolarGridHelper(55, 12, 8, 64, "#1b2430", "#141b24"));
}

// Oznake najvećih jedinica: ime i broj preostalih ugovora, lebde iznad stupa
function izgradiOznake() {
  const sloj = $("#tri-oznake");
  opcine.filter((o) => o.roks.length).sort((a, b) => b.roks.length - a.roks.length).slice(0, 8).forEach((o) => {
    const el = document.createElement("div");
    el.className = "tri-oznaka";
    sloj.appendChild(el);
    oznake.push({ o, el, zadnje: -1 });
  });
}

function emitiraj(x, y, z, n) {
  const s = iskre;
  for (let k = 0; k < n; k++) {
    const i = s.sljedeca; s.sljedeca = (s.sljedeca + 1) % s.N;
    s.pos[i * 3] = x + (Math.random() - 0.5) * 0.6; s.pos[i * 3 + 1] = y; s.pos[i * 3 + 2] = z + (Math.random() - 0.5) * 0.6;
    s.vel[i * 3] = (Math.random() - 0.5) * 2.2; s.vel[i * 3 + 1] = 4 + Math.random() * 6; s.vel[i * 3 + 2] = (Math.random() - 0.5) * 2.2;
    s.zivot[i] = 1;
  }
}

const tmpC = new THREE.Color();
function azurirajKartu(dt) {
  for (const o of opcine) {
    // ugovori koji su istekli od zadnjeg okvira: puls, iskre i stavka u popisu isteka
    let novih = 0, nak = 0;
    while (o.idx < o.roks.length && o.roks[o.idx].m < t) { nak += o.roks[o.idx].nak; o.idx++; novih++; }
    const ost = o.roks.length - o.idx;
    if (novih && svira) {
      o.puls = 1;
      emitiraj(o.centar.x, o.visina + 0.2, -o.centar.y, Math.min(40, 6 + novih * 6));
      feed.unshift({ t, naziv: kratkiNaziv(o.id), n: novih, nak, nula: ost === 0 });
      feedPromjena = true;
    }
    const cilj = o.roks.length ? 0.15 + 9 * Math.sqrt(ost / o.maxN) : 0.12;
    o.visina += (cilj - o.visina) * Math.min(1, dt * 5);
    o.mesh.scale.z = o.visina;
    const mat = o.mesh.material;
    if (!o.roks.length) mat.color.copy(B.prazno);
    else if (!ost) mat.color.copy(B.isteklo);
    else {
      // boja = udio preostalih ugovora koji ističu u idućih 12 mj. (mirno → jantarno → crveno)
      let j = o.idx; while (j < o.roks.length && o.roks[j].m < t + 12) j++;
      const s = Math.min(1, ((j - o.idx) / ost) * 2.5);
      if (s < 0.5) mat.color.copy(B.mirno).lerp(B.uskoro, s * 2); else mat.color.copy(B.uskoro).lerp(B.hitno, (s - 0.5) * 2);
    }
    o.puls = Math.max(0, o.puls - dt * 1.8);
    mat.emissive.copy(B.hitno).multiplyScalar(o.puls * 1.4);
  }
  const s = iskre;
  for (let i = 0; i < s.N; i++) {
    if (s.zivot[i] <= 0) { s.col[i * 3] = s.col[i * 3 + 1] = s.col[i * 3 + 2] = 0; continue; }
    s.zivot[i] -= dt * 0.7;
    s.vel[i * 3 + 1] -= 6 * dt;
    s.pos[i * 3] += s.vel[i * 3] * dt; s.pos[i * 3 + 1] += s.vel[i * 3 + 1] * dt; s.pos[i * 3 + 2] += s.vel[i * 3 + 2] * dt;
    const l = Math.max(0, s.zivot[i]);
    tmpC.copy(B.iskra).lerp(B.uskoro, 1 - l).multiplyScalar(l * 1.6);
    s.col[i * 3] = tmpC.r; s.col[i * 3 + 1] = tmpC.g; s.col[i * 3 + 2] = tmpC.b;
  }
  s.obj.geometry.attributes.position.needsUpdate = true;
  s.obj.geometry.attributes.color.needsUpdate = true;
}

const v3 = new THREE.Vector3();
function azurirajOznake() {
  const pozornica = $("#tri-pozornica"), w = pozornica.clientWidth, h = pozornica.clientHeight;
  for (const z of oznake) {
    const o = z.o, ost = o.roks.length - o.idx;
    v3.set(o.centar.x, o.visina + 0.4, -o.centar.y).project(camera);
    const vidljivo = v3.z < 1 && Math.abs(v3.x) < 1.05 && Math.abs(v3.y) < 1.05;
    z.el.style.opacity = vidljivo ? "" : "0";
    z.el.style.transform = `translate(${(v3.x + 1) / 2 * w}px, ${(1 - v3.y) / 2 * h}px) translate(-50%, -100%)`;
    if (ost !== z.zadnje) {
      z.zadnje = ost;
      z.el.innerHTML = `${kratkiNaziv(o.id)} <b>${C.fmt.format(ost)}</b>`;
      z.el.classList.toggle("pala", ost < o.roks.length);
    }
  }
}

function krug() {
  const c = document.createElement("canvas"); c.width = c.height = 64;
  const x = c.getContext("2d"), gr = x.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, "rgba(255,255,255,1)"); gr.addColorStop(0.35, "rgba(255,255,255,.75)"); gr.addColorStop(1, "rgba(255,255,255,0)");
  x.fillStyle = gr; x.fillRect(0, 0, 64, 64);
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; return tex;
}

// ---------- HUD ----------
function hud(dt) {
  const d = C.plusMj(C.DANAS, Math.floor(t));
  $("#tri-datum").textContent = t < 0.01 ? "DANAS" : `${MJESECI[d.getMonth()]} ${d.getFullYear()}.`;
  const n = istekloDo(t);
  $("#tri-isteklo").textContent = C.fmt.format(n);
  $("#tri-novac").textContent = C.eur(nakDo(t));
  $("#tri-napredak").style.width = (t / RASPON * 100) + "%";

  const k = NATPISI.findIndex((x) => t < x.do);
  if (k !== zadnjiNatpis) {
    zadnjiNatpis = k;
    const el = $("#tri-natpis");
    el.classList.remove("ulaz"); void el.offsetWidth;   // ponovno pokreni animaciju ulaza
    el.innerHTML = NATPISI[k].tekst();
    el.classList.add("ulaz");
  }

  feedSat += dt;
  if (feedPromjena && feedSat > 0.25) {
    feedSat = 0; feedPromjena = false;
    feed.sort((a, b) => b.t - a.t || b.n - a.n);
    feed = feed.slice(0, 6);
    $("#tri-feed").hidden = !feed.length;
    $("#tri-feed-lista").innerHTML = feed.map((f) => {
      const dm = C.plusMj(C.DANAS, Math.floor(f.t));
      return `<li><span class="tri-feed-mj">${MJ_KR[dm.getMonth()]} ${String(dm.getFullYear()).slice(2)}.</span>` +
        `<span><b>${f.naziv}</b> −${f.n} ${f.n % 10 === 1 && f.n % 100 !== 11 ? "ugovor" : "ugovora"}` +
        `${f.nak ? ` · ${C.eur(f.nak)}` : ""}${f.nula ? ` · <em>nema više koncesija</em>` : ""}</span></li>`;
    }).join("");
  }
}

function petlja() {
  if (document.body.dataset.ruta !== "3d") return;
  const dt = Math.min(0.05, sat.getDelta());
  if (svira) {
    t = Math.min(RASPON, t + dt * RASPON / TRAJANJE_S);
    if (t >= RASPON) { svira = false; $("#tri-play").textContent = "↻ Ponovi"; }
  }
  azurirajKartu(dt);
  controls.update();
  azurirajOznake();
  hud(dt);
  composer.render();
}

// ---------- kontrole ----------
function naDanas() {
  svira = false; t = 0; feed = []; feedPromjena = true;
  $("#tri-play").textContent = "▶ Premotaj 3 godine";
  for (const o of opcine) { o.idx = 0; o.puls = 0; }
}
$("#tri-play").onclick = () => {
  if (t >= RASPON) naDanas();
  svira = !svira;
  $("#tri-play").textContent = svira ? "❚❚ Pauza" : "▶ Nastavi";
};
$("#tri-reset").onclick = naDanas;
// tipkovnica za snimanje videa: razmaknica = play/pauza, R = na danas
window.addEventListener("keydown", (e) => {
  if (document.body.dataset.ruta !== "3d" || e.target.closest("input, select, textarea, button")) return;
  if (e.code === "Space") { e.preventDefault(); $("#tri-play").click(); }
  else if (e.key === "r" || e.key === "R") naDanas();
});

const naRuti = () => { if (document.body.dataset.ruta === "3d") { pokreni(); sat.getDelta(); } };
window.addEventListener("hashchange", () => setTimeout(naRuti, 0));
naRuti();
