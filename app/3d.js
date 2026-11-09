/* Concessum — 3D sat: izdignuta karta općina i vrtlog isteka (three.js, lokalno u vendor/three). */
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
const TRAJANJE_S = 14;      // koliko sekundi traje premotavanje
const MJESECI = ["SIJEČANJ", "VELJAČA", "OŽUJAK", "TRAVANJ", "SVIBANJ", "LIPANJ", "SRPANJ", "KOLOVOZ", "RUJAN", "LISTOPAD", "STUDENI", "PROSINAC"];
const tihoKretanje = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

const B = {
  mirno: new THREE.Color("#7fa8c6"), uskoro: new THREE.Color("#f2b65a"), hitno: new THREE.Color("#ff6a3d"),
  isteklo: new THREE.Color("#3a3f47"), prazno: new THREE.Color("#1c232c"), iskra: new THREE.Color("#ff8a4d"),
};
const bojaZaMjesece = (m, out) => {
  if (m < 6) return out.copy(B.hitno);
  if (m < 24) return out.copy(B.hitno).lerp(B.uskoro, (m - 6) / 18);
  return out.copy(B.uskoro).lerp(B.mirno, Math.min(1, (m - 24) / 36));
};

// ---------- podaci: aktivni ugovori i mjeseci do isteka ----------
const AKT = C.U.filter((u) => u.do >= C.DANAS).map((u) => ({ u, m: (u.do - C.DANAS) / MJ_MS }));
const poRoku = AKT.slice().sort((a, b) => a.m - b.m);
const kumNak = []; { let s = 0; for (const a of poRoku) { s += a.u.nak || 0; kumNak.push(s); } }
const istekloDo = (t) => { let lo = 0, hi = poRoku.length; while (lo < hi) { const k = (lo + hi) >> 1; if (poRoku[k].m < t) lo = k + 1; else hi = k; } return lo; };

let pokrenut = false, renderer, scene, camera, controls, composer, bloom, sat = new THREE.Clock();
let nacin = "karta", t = 0, svira = false;
const karta = { grupa: null, opcine: [], iskre: null }, vrtlog = { grupa: null, tocke: null, prsten: null, puls: 0 };

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
  controls = new OrbitControls(camera, platno);
  controls.enableDamping = true; controls.maxPolarAngle = Math.PI * 0.47; controls.minDistance = 8; controls.maxDistance = 120;
  controls.autoRotate = !tihoKretanje; controls.autoRotateSpeed = 0.35;

  scene.add(new THREE.HemisphereLight("#9fb6cc", "#0a0d12", 0.9));
  const sunce = new THREE.DirectionalLight("#ffffff", 1.6); sunce.position.set(-20, 40, 25); scene.add(sunce);
  const kontra = new THREE.DirectionalLight("#ff8a4d", 0.5); kontra.position.set(25, 10, -30); scene.add(kontra);

  composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.9, 0.55, 0.62);
  composer.addPass(bloom);
  composer.addPass(new OutputPass());

  izgradiKartu();
  izgradiVrtlog();
  postaviNacin(nacin);

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
    if (nacin !== "karta") return;
    const r = platno.getBoundingClientRect();
    mis.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(mis, camera);
    const hit = ray.intersectObjects(karta.opcine.map((o) => o.mesh))[0];
    nadOpcinom = hit ? hit.object.userData.o : null;
    platno.style.cursor = nadOpcinom ? "pointer" : "";
    const info = $("#tri-info");
    info.hidden = !nadOpcinom;
    if (nadOpcinom) {
      const o = nadOpcinom, ost = o.roks.length - o.idx;
      info.innerHTML = `<b>${C.nazivOpcine[o.id] || o.id}</b><br>${C.fmt.format(ost)} aktivnih od ${C.fmt.format(o.roks.length)} danas` +
        (o.roks.length ? ` · sljedeći istek ${o.idx < o.roks.length ? "za " + Math.max(0, Math.round(o.roks[o.idx] - t)) + " mj." : "–"}` : "") + `<br><i>klik za profil općine</i>`;
    }
  });
  platno.addEventListener("click", () => { if (nadOpcinom) location.hash = "#opcina/" + nadOpcinom.id; });

  renderer.setAnimationLoop(petlja);
}

// ---------- KARTA STUPOVA ----------
function izgradiKartu() {
  const g = new THREE.Group(); g.rotation.x = -Math.PI / 2;
  const lon0 = 16.45, lat0 = 44.45, K = 9, kx = Math.cos(lat0 * Math.PI / 180) * K;
  const pr = ([lon, lat]) => new THREE.Vector2((lon - lon0) * kx, (lat - lat0) * K);
  const poOpc = {};
  for (const a of AKT) if (a.u.opc) (poOpc[a.u.opc] = poOpc[a.u.opc] || []).push(a.m);
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
    const roks = (poOpc[f.properties.name] || []).sort((a, b) => a - b);
    const mat = new THREE.MeshStandardMaterial({ color: B.prazno.clone(), roughness: 0.5, metalness: 0.15, emissive: new THREE.Color("#000"), emissiveIntensity: 1 });
    const mesh = new THREE.Mesh(geo, mat);
    geo.computeBoundingBox();
    const c = new THREE.Vector3(); geo.boundingBox.getCenter(c);
    const o = { id: f.properties.name, mesh, roks, idx: 0, puls: 0, centar: c, visina: 0.12, cilj: 0.12, maxN };
    mesh.userData.o = o;
    karta.opcine.push(o); g.add(mesh);
    // tanki rub općine
    const rub = new THREE.LineSegments(new THREE.EdgesGeometry(geo, 30), new THREE.LineBasicMaterial({ color: "#0a0d12", transparent: true, opacity: 0.55 }));
    mesh.add(rub);
  }
  // iskre
  const N = 5000, pos = new Float32Array(N * 3), col = new Float32Array(N * 3);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  geo.setAttribute("color", new THREE.BufferAttribute(col, 3));
  const iskre = new THREE.Points(geo, new THREE.PointsMaterial({ size: 0.42, map: krug(), vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true }));
  karta.iskre = { obj: iskre, pos, col, vel: new Float32Array(N * 3), zivot: new Float32Array(N), sljedeca: 0, N };
  iskre.frustumCulled = false;
  karta.grupa = new THREE.Group();
  karta.grupa.add(g, iskre);
  // tlo
  const tlo = new THREE.Mesh(new THREE.CircleGeometry(60, 64), new THREE.MeshStandardMaterial({ color: "#0d1218", roughness: 1 }));
  tlo.rotation.x = -Math.PI / 2; tlo.position.y = -0.02; karta.grupa.add(tlo);
  const mreza = new THREE.PolarGridHelper(55, 12, 8, 64, "#1b2430", "#141b24"); mreza.position.y = 0; karta.grupa.add(mreza);
  scene.add(karta.grupa);
}

function emitiraj(x, y, z, n) {
  const s = karta.iskre;
  for (let k = 0; k < n; k++) {
    const i = s.sljedeca; s.sljedeca = (s.sljedeca + 1) % s.N;
    s.pos[i * 3] = x + (Math.random() - 0.5) * 0.6; s.pos[i * 3 + 1] = y; s.pos[i * 3 + 2] = z + (Math.random() - 0.5) * 0.6;
    s.vel[i * 3] = (Math.random() - 0.5) * 2.2; s.vel[i * 3 + 1] = 4 + Math.random() * 6; s.vel[i * 3 + 2] = (Math.random() - 0.5) * 2.2;
    s.zivot[i] = 1;
  }
}

const tmpC = new THREE.Color();
function azurirajKartu(dt) {
  for (const o of karta.opcine) {
    // ugovori koji su istekli od zadnjeg okvira: puls i iskre
    let novih = 0;
    while (o.idx < o.roks.length && o.roks[o.idx] < t) { o.idx++; novih++; }
    if (o.idx > 0 && o.roks.length && t < o.roks[o.idx - 1]) { o.idx = 0; while (o.idx < o.roks.length && o.roks[o.idx] < t) o.idx++; }
    const ost = o.roks.length - o.idx;
    if (novih && svira) {
      o.puls = 1;
      // središte u svjetskim koordinatama: (x, visina, -y)
      emitiraj(o.centar.x, o.visina + 0.2, -o.centar.y, Math.min(40, 6 + novih * 6));
    }
    o.cilj = o.roks.length ? 0.15 + 9 * Math.sqrt(ost / o.maxN) : 0.12;
    o.visina += (o.cilj - o.visina) * Math.min(1, dt * 5);
    o.mesh.scale.z = o.visina;
    const mat = o.mesh.material;
    if (!o.roks.length) mat.color.copy(B.prazno);
    else if (!ost) mat.color.copy(B.isteklo);
    else {
      // boja = udio preostalih ugovora koji ističu u idućih 12 mj. (mirno → jantarno → crveno)
      let j = o.idx; while (j < o.roks.length && o.roks[j] < t + 12) j++;
      const s = Math.min(1, ((j - o.idx) / ost) * 2.5);
      if (s < 0.5) mat.color.copy(B.mirno).lerp(B.uskoro, s * 2); else mat.color.copy(B.uskoro).lerp(B.hitno, (s - 0.5) * 2);
    }
    o.puls = Math.max(0, o.puls - dt * 1.8);
    mat.emissive.copy(B.hitno).multiplyScalar(o.puls * 1.4);
  }
  const s = karta.iskre;
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

// ---------- VRTLOG ISTEKA ----------
const radijus = (m) => 2.2 + 3.1 * Math.log2(1 + Math.max(0, m) / 2);
function izgradiVrtlog() {
  const g = new THREE.Group();
  const N = AKT.length, pos = new Float32Array(N * 3), col = new Float32Array(N * 3);
  const sektori = Object.keys(C.sektorNaziv);
  const hash = (i) => { const x = Math.sin(i * 12.9898 + 78.233) * 43758.5453; return x - Math.floor(x); };
  vrtlog.kut = AKT.map((a, i) => (sektori.indexOf(a.u.sektor) / sektori.length) * Math.PI * 2 + hash(i) * 0.55);
  vrtlog.visina = AKT.map((a, i) => (hash(i + 7) - 0.5));
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  geo.setAttribute("color", new THREE.BufferAttribute(col, 3));
  vrtlog.tocke = new THREE.Points(geo, new THREE.PointsMaterial({ size: 0.36, map: krug(), vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
  vrtlog.tocke.frustumCulled = false;
  g.add(vrtlog.tocke);
  // horizont DANAS
  vrtlog.prsten = new THREE.Mesh(new THREE.TorusGeometry(2.2, 0.07, 16, 128), new THREE.MeshBasicMaterial({ color: B.hitno.clone() }));
  vrtlog.prsten.rotation.x = Math.PI / 2; g.add(vrtlog.prsten);
  const jezgra = new THREE.Mesh(new THREE.CircleGeometry(2.1, 64), new THREE.MeshBasicMaterial({ color: "#000" }));
  jezgra.rotation.x = -Math.PI / 2; jezgra.position.y = 0.01; g.add(jezgra);
  // prstenovi brojčanika: +6, +12, +24, +60 mj., i 12 crtica kao na satu
  vrtlog.oznake = [6, 12, 24, 60, 120].map((m) => {
    const pts = []; for (let k = 0; k <= 128; k++) { const a = k / 128 * Math.PI * 2; pts.push(new THREE.Vector3(Math.cos(a), 0, Math.sin(a))); }
    const l = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: m === 6 ? "#5a2a1c" : "#1f2a36", transparent: true, opacity: 0.9 }));
    l.userData.m = m; g.add(l); return l;
  });
  const crtice = [];
  for (let k = 0; k < 12; k++) { const a = k / 12 * Math.PI * 2; crtice.push(new THREE.Vector3(Math.cos(a) * 2.6, 0, Math.sin(a) * 2.6), new THREE.Vector3(Math.cos(a) * 3.3, 0, Math.sin(a) * 3.3)); }
  g.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(crtice), new THREE.LineBasicMaterial({ color: "#ff6a3d" })));
  vrtlog.grupa = g;
  scene.add(g);
}

function azurirajVrtlog(dt) {
  const { pos, color } = { pos: vrtlog.tocke.geometry.attributes.position.array, color: vrtlog.tocke.geometry.attributes.color.array };
  const vrti = svira ? t * 0.9 : 0;
  let progutano = 0;
  for (let i = 0; i < AKT.length; i++) {
    const m = AKT[i].m - t;
    let r, svj = 1;
    if (m >= 0) r = radijus(m);
    else { const k = Math.min(1, -m / 1.2); r = 2.2 * (1 - k); svj = 1 - k; if (k < 1) progutano++; }
    const a = vrtlog.kut[i] + Math.log2(1 + Math.max(0, m)) * 0.9 - vrti * 0.05;
    pos[i * 3] = Math.cos(a) * r;
    pos[i * 3 + 1] = vrtlog.visina[i] * (0.25 + r * 0.06) + (m < 0 ? (1 - svj) * -1.5 : 0);
    pos[i * 3 + 2] = Math.sin(a) * r;
    bojaZaMjesece(Math.max(0, m), tmpC);
    if (m < 0) tmpC.copy(B.hitno).lerp(new THREE.Color("#fff"), 0.4);
    tmpC.multiplyScalar(svj * (m >= 0 && m < 6 ? 1.6 : 1));
    color[i * 3] = tmpC.r; color[i * 3 + 1] = tmpC.g; color[i * 3 + 2] = tmpC.b;
  }
  vrtlog.tocke.geometry.attributes.position.needsUpdate = true;
  vrtlog.tocke.geometry.attributes.color.needsUpdate = true;
  if (progutano && svira) vrtlog.puls = Math.min(1.5, vrtlog.puls + progutano * 0.02);
  vrtlog.puls = Math.max(0, vrtlog.puls - dt * 1.2);
  vrtlog.prsten.material.color.copy(B.hitno).multiplyScalar(1 + vrtlog.puls * 2.5);
  vrtlog.prsten.scale.setScalar(1 + vrtlog.puls * 0.06);
  // prstenovi brojčanika „putuju“ prema središtu kako vrijeme teče
  for (const l of vrtlog.oznake) { const r = radijus(l.userData.m - t); l.scale.setScalar(r); l.visible = l.userData.m - t > 0; }
}

// ---------- zajedničko ----------
function krug() {
  const c = document.createElement("canvas"); c.width = c.height = 64;
  const x = c.getContext("2d"), gr = x.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, "rgba(255,255,255,1)"); gr.addColorStop(0.35, "rgba(255,255,255,.75)"); gr.addColorStop(1, "rgba(255,255,255,0)");
  x.fillStyle = gr; x.fillRect(0, 0, 64, 64);
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; return tex;
}

function postaviNacin(n) {
  nacin = n;
  karta.grupa.visible = n === "karta"; vrtlog.grupa.visible = n === "vrtlog";
  document.querySelectorAll("[data-tri]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.tri === n)));
  $("#tri-info").hidden = true;
  if (n === "karta") {
    camera.position.set(4, 34, 40); controls.target.set(0, 0, -2);
    bloom.strength = 0.55; bloom.threshold = 0.7; scene.fog.near = 70; scene.fog.far = 140;
    $("#tri-opis").textContent = "Visina stupa je broj aktivnih ugovora u općini, a boja udio ugovora koji ističu u idućih 12 mjeseci. Pokrenite vrijeme: kad ugovor istekne, općina bljesne i stup se spusti.";
  } else {
    camera.position.set(0, 20, 26); controls.target.set(0, 0, 0);
    bloom.strength = 1.15; bloom.threshold = 0.35; scene.fog.near = 200; scene.fog.far = 400;
    $("#tri-opis").textContent = `Svaka točka je jedan od ${C.fmt.format(AKT.length)} aktivnih ugovora. Udaljenost od središta je vrijeme do isteka, a krug u sredini je DANAS. Pokrenite vrijeme i gledajte kako ugovori upadaju u rok.`;
  }
  controls.update();
}

function hud() {
  const d = C.plusMj(C.DANAS, Math.floor(t));
  $("#tri-datum").textContent = t < 0.05 ? "DANAS" : `${MJESECI[d.getMonth()]} ${d.getFullYear()}.`;
  const n = istekloDo(t);
  $("#tri-isteklo").textContent = C.fmt.format(n);
  $("#tri-novac").textContent = C.eur(n ? kumNak[n - 1] : 0);
  $("#tri-napredak").style.width = (t / RASPON * 100) + "%";
}

function petlja() {
  if (document.body.dataset.ruta !== "3d") return;
  const dt = Math.min(0.05, sat.getDelta());
  if (svira) {
    t = Math.min(RASPON, t + dt * RASPON / TRAJANJE_S);
    if (t >= RASPON) { svira = false; $("#tri-play").textContent = "▶ Premotaj 3 godine"; }
  }
  if (nacin === "karta") azurirajKartu(dt); else azurirajVrtlog(dt);
  hud();
  controls.update();
  composer.render();
}

// ---------- kontrole ----------
document.querySelectorAll("[data-tri]").forEach((b) => { b.onclick = () => postaviNacin(b.dataset.tri); });
$("#tri-play").onclick = () => {
  if (t >= RASPON) t = 0;
  svira = !svira;
  $("#tri-play").textContent = svira ? "❚❚ Pauza" : "▶ Nastavi";
};
$("#tri-reset").onclick = () => {
  svira = false; t = 0; $("#tri-play").textContent = "▶ Premotaj 3 godine";
  for (const o of karta.opcine) { o.idx = 0; o.puls = 0; }
};
// tipkovnica za snimanje videa: razmaknica = play/pauza, R = na danas, 1/2 = način
window.addEventListener("keydown", (e) => {
  if (document.body.dataset.ruta !== "3d" || e.target.closest("input, select, textarea")) return;
  if (e.code === "Space") { e.preventDefault(); $("#tri-play").click(); }
  else if (e.key === "r" || e.key === "R") $("#tri-reset").click();
  else if (e.key === "1") postaviNacin("karta");
  else if (e.key === "2") postaviNacin("vrtlog");
});

const naRuti = () => { if (document.body.dataset.ruta === "3d") { pokreni(); sat.getDelta(); } };
window.addEventListener("hashchange", () => setTimeout(naRuti, 0));
naRuti();
// ?vrtlog u adresi otvara drugi način (za snimanje)
if (pokrenut && /vrtlog/.test(location.hash)) postaviNacin("vrtlog");
