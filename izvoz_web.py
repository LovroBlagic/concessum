"""Koncesijski sat: izvoz za web aplikaciju.

Ulaz:  koncesije.json, opcine.geojson (izlaz obrada.py)
Izlaz: app/data/podaci.js (ugovori, kompaktno), app/data/granice.js (pojednostavljene granice)
"""
import json, os, re
from datetime import date

OUT = os.path.join(os.path.dirname(__file__) or ".", "app", "data")
os.makedirs(OUT, exist_ok=True)
TOL = 0.0012      # Douglas-Peucker tolerancija u stupnjevima (~100 m)
DEC = 4           # zaokruživanje koordinata

# Sektori: grupiranje ~150 vrsta koncesija u čitljive skupine
SEKTORI = [
    ("luke", "Luke", r"luk|lučk"),
    ("pomorsko", "Pomorsko dobro i marikultura", r"pomorsk|plaž|morsk|školjk"),
    ("zdravstvo", "Zdravstvo", r"zdravstven"),
    ("komunalno", "Komunalne djelatnosti", r"komunal|dimnjač|pogreb|taksi|otpad|fekali|groblj|parkir|tržnic|rasvjet|prijevoz|javn[ei]h? površin|nužnik|dezinf|deratiz|nerazvrstan|ukrašavanj|reklam|oglasn|mirovanj"),
    ("rudarstvo", "Rudarstvo i ugljikovodici", r"eksploata|istraž|ugljikovodik|nafte|plin|kamen|pijes|šljun|mineral|glin|rudn"),
    ("vode", "Vode", r"vod[aeo]|vodn|izvor|termal|mineraln"),
    ("mediji", "Radio i televizija", r"radij|televizij|elektroničk.{0,20}medij"),
    ("poljoprivreda", "Poljoprivreda, šume i lov", r"poljoprivred|šum|lov|ribolov|zemljišt"),
    ("promet", "Ceste i telekomunikacije", r"cest|telekomunik|pokretn|žičar"),
    ("turizam", "Turizam, kultura i igre na sreću", r"turist|kultur|muzej|ronj|igara na sreću|casin|sport|sajm"),
    ("ostalo", "Ostalo", r".*"),
]

def sektor(vrsta):
    v = vrsta.lower()
    for kod, _, rx in SEKTORI:
        if re.search(rx, v):
            return kod
    return "ostalo"

def datum(s):
    if not s or not re.match(r"^(19|20)\d\d-", s):   # npr. "0039-02-05" je tipfeler u registru
        return None
    return s

# ---------- ugovori ----------
uk = json.load(open("koncesije.json", encoding="utf-8"))
tablice = {"davatelj": [], "koncesionar": [], "vrsta": [], "opcina": []}
indeksi = {k: {} for k in tablice}
def idx(t, v):
    v = v or ""
    if v not in indeksi[t]:
        indeksi[t][v] = len(tablice[t])
        tablice[t].append(v)
    return indeksi[t][v]

NAST = {None: 0, "obnovljena": 1, "zamjena": 2, "bez_nastavka": 3}
redci = []
for r in uk:
    od, do = datum(r["od"]), datum(r["do"])
    if do is None:
        continue
    redci.append([
        idx("davatelj", r["davatelj"]),
        idx("koncesionar", r["koncesionar"]),
        idx("vrsta", r["vrsta"]),
        idx("opcina", r["opcina_id"]) if r["opcina_id"] else -1,
        od or "", do,
        NAST[r["nastavak"]],
        r["lokacija"],
    ])
vrste_sektor = [sektor(v) for v in tablice["vrsta"]]

podaci = dict(
    generirano=date.today().isoformat(),
    sektori=[[k, n] for k, n, _ in SEKTORI],
    vrste=tablice["vrsta"], vrsteSektor=vrste_sektor,
    davatelji=tablice["davatelj"], koncesionari=tablice["koncesionar"],
    opcine=tablice["opcina"],
    stupci=["davatelj", "koncesionar", "vrsta", "opcina", "od", "do", "nastavak", "lokacija"],
    ugovori=redci,
)
with open(os.path.join(OUT, "podaci.js"), "w", encoding="utf-8") as f:
    f.write("window.PODACI=")
    json.dump(podaci, f, ensure_ascii=False, separators=(",", ":"))
    f.write(";\n")

# ---------- granice ----------
def dp(pts, tol):
    """Douglas-Peucker, iterativno."""
    if len(pts) < 3:
        return pts
    keep = [False] * len(pts)
    keep[0] = keep[-1] = True
    stack = [(0, len(pts) - 1)]
    t2 = tol * tol
    while stack:
        a, b = stack.pop()
        ax, ay = pts[a]; bx, by = pts[b]
        dx, dy = bx - ax, by - ay
        L = dx * dx + dy * dy
        best, bi = -1, -1
        for i in range(a + 1, b):
            px, py = pts[i]
            if L == 0:
                d = (px - ax) ** 2 + (py - ay) ** 2
            else:
                t = max(0, min(1, ((px - ax) * dx + (py - ay) * dy) / L))
                d = (px - ax - t * dx) ** 2 + (py - ay - t * dy) ** 2
            if d > best:
                best, bi = d, i
        if best > t2:
            keep[bi] = True
            stack += [(a, bi), (bi, b)]
    return [p for p, k in zip(pts, keep) if k]

def ring(r):
    s = dp(r, TOL)
    s = [[round(x, DEC), round(y, DEC)] for x, y in s]
    out = [s[0]]
    for p in s[1:]:
        if p != out[-1]:
            out.append(p)
    return out if len(out) >= 4 else None

def poly(p):
    rs = [ring(r) for r in p]
    if rs[0] is None:
        return None
    return [rs[0]] + [r for r in rs[1:] if r]

geo = json.load(open("opcine.geojson", encoding="utf-8"))
feats = []
for ft in geo["features"]:
    g = ft["geometry"]
    polys = [g["coordinates"]] if g["type"] == "Polygon" else g["coordinates"]
    polys = [q for q in (poly(p) for p in polys) if q]
    if not polys:   # sitni otok: zadrži barem najveći poligon nepojednostavljen
        polys = [g["coordinates"]] if g["type"] == "Polygon" else [g["coordinates"][0]]
    naziv = ft["properties"]["shapeName"]
    feats.append({"type": "Feature",
                  "properties": {"name": ft["properties"]["shapeID"], "naziv": naziv},
                  "geometry": {"type": "MultiPolygon", "coordinates": polys}})
with open(os.path.join(OUT, "granice.js"), "w", encoding="utf-8") as f:
    f.write("window.GRANICE=")
    json.dump({"type": "FeatureCollection", "features": feats}, f, ensure_ascii=False, separators=(",", ":"))
    f.write(";\n")

from collections import Counter
print("ugovora:", len(redci), "| sektori:", Counter(vrste_sektor[r[2]] for r in redci).most_common())
for fn in ("podaci.js", "granice.js"):
    print(fn, round(os.path.getsize(os.path.join(OUT, fn)) / 1e6, 2), "MB")
