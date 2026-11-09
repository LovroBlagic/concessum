"""Koncesijski sat: izvoz za web aplikaciju.

Ulaz:  koncesije.json, opcine.geojson (izlaz obrada.py), koncesije.txt (izvorni CSV, za iznos naknade)
Izlaz: app/data/podaci.js (ugovori, kompaktno), app/data/granice.js (pojednostavljene granice),
       app/data/koncesije.csv (otvoreni izvoz obrađenih podataka, UTF-8)
"""
import csv, json, os, re
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

# ---------- naknade iz izvornog CSV-a ----------
# UGOV_IZN_JEDNOGOD_NAK_U_EUR = ugovoreni iznos jednogodišnje FIKSNE naknade (EUR); varijabilni dio
# (postotak prihoda i sl.) nema iznos u registru, pa je ovo donja granica stvarne naknade.
def iso(d):
    m = re.match(r"(\d\d)\.(\d\d)\.(\d{4})", d.strip())
    return f"{m[3]}-{m[2]}-{m[1]}" if m else None
def iznos(s):
    try:
        return float(s.strip().replace(".", "").replace(",", "."))
    except ValueError:
        return None
def kodiranje(fn):
    """FINA izvoz je windows-1250; podržimo i UTF-8."""
    try:
        open(fn, encoding="utf-8").read(); return "utf-8"
    except UnicodeDecodeError:
        return "cp1250"
NAKNADA = {}
with open("koncesije.txt", encoding=kodiranje("koncesije.txt")) as f:
    r = csv.reader(f, delimiter=";"); next(r)
    for p in r:
        if len(p) > 10 and p[8] == "Fiksna naknada" and p[10] == "EUR":
            v = iznos(p[9])
            if v is not None:
                NAKNADA.setdefault((p[1], p[4], p[2], iso(p[6]), iso(p[7])), v)

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
        round(NAKNADA[k]) if (k := (r["oib_davatelja"], r["oib_koncesionara"], r["lokacija"], r["od"], r["do"])) in NAKNADA else None,
    ])
vrste_sektor = [sektor(v) for v in tablice["vrsta"]]

# stabilni ključ davatelja za adresu kalendara: OIB (davatelji su javna tijela), inače sažetak naziva.
# Indeks u tablici se mijenja pri svakoj obradi, a adresa pretplate mora ostati ista.
import hashlib
dav_oib = {}
for r in uk:
    dav_oib.setdefault(indeksi["davatelj"].get(r["davatelj"] or ""), (r.get("oib_davatelja") or "").strip())
dav_kljuc = [dav_oib.get(i) if re.fullmatch(r"\d{11}", dav_oib.get(i) or "") else "n" + hashlib.sha1(n.encode()).hexdigest()[:10]
             for i, n in enumerate(tablice["davatelj"])]

podaci = dict(
    generirano=date.today().isoformat(),
    sektori=[[k, n] for k, n, _ in SEKTORI],
    vrste=tablice["vrsta"], vrsteSektor=vrste_sektor,
    davatelji=tablice["davatelj"], koncesionari=tablice["koncesionar"],
    opcine=tablice["opcina"], davateljiKal=dav_kljuc,
    stupci=["davatelj", "koncesionar", "vrsta", "opcina", "od", "do", "nastavak", "lokacija", "naknada"],
    ugovori=redci,
)
with open(os.path.join(OUT, "podaci.js"), "w", encoding="utf-8") as f:
    f.write("window.PODACI=")
    json.dump(podaci, f, ensure_ascii=False, separators=(",", ":"))
    f.write(";\n")

# ---------- otvoreni izvoz (CSV) ----------
naziv_opc = {ft["properties"]["shapeID"]: ft["properties"]["shapeName"]
             for ft in json.load(open("opcine.geojson", encoding="utf-8"))["features"]}
NAST_TXT = ["", "obnovljena", "zamjena", "bez_nastavka"]
sekt_naziv = {k: n for k, n, _ in SEKTORI}
with open(os.path.join(OUT, "koncesije.csv"), "w", encoding="utf-8-sig", newline="") as f:
    w = csv.writer(f)
    w.writerow(["davatelj", "koncesionar", "vrsta", "sektor", "opcina_id", "opcina", "lokacija",
                "pocetak", "istek", "nastavak_nakon_isteka", "godisnja_fiksna_naknada_eur"])
    for x in redci:
        oid = tablice["opcina"][x[3]] if x[3] >= 0 else ""
        w.writerow([tablice["davatelj"][x[0]], tablice["koncesionar"][x[1]], tablice["vrsta"][x[2]],
                    sekt_naziv[vrste_sektor[x[2]]], oid, naziv_opc.get(oid, ""), x[7], x[4], x[5],
                    NAST_TXT[x[6]], "" if x[8] is None else x[8]])

# ---------- kalendari za pretplatu (iCalendar, RFC 5545), jedan po općini ----------
# Službenik se jednom pretplati (webcal://…/data/kalendar/<shapeID>.ics); kalendar sam povlači nove rokove
# nakon svake obrade. Ugovori koji ističu istog dana grupiraju se u jedan događaj, a 6 mjeseci prije svakog
# datuma dodaje se događaj „pripremiti postupak“ (Google kalendar u pretplatama ne prenosi podsjetnike).
import calendar, shutil
from collections import Counter
from datetime import datetime, timezone
WEB = "https://koncesijski-sat.vercel.app"
KAL = os.path.join(OUT, "kalendar")
shutil.rmtree(KAL, ignore_errors=True); os.makedirs(KAL)
DANAS = date.today()
STAMP = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")

def minus_mj(d, m):
    y, mm = divmod(d.month - 1 - m, 12)
    return date(d.year + y, mm + 1, min(d.day, calendar.monthrange(d.year + y, mm + 1)[1]))

def ics_tekst(t):
    return t.replace("\\", "\\\\").replace(";", "\\;").replace(",", "\\,").replace("\n", "\\n")

def presavij(linija):
    """Retci najviše 75 okteta; nastavak počinje razmakom (RFC 5545, 3.1)."""
    b = linija.encode("utf-8"); out = []
    while len(b) > (75 if not out else 74):      # nastavak ima vodeći razmak, pa 74 + 1
        i = 75 if not out else 74
        while (b[i] & 0xC0) == 0x80:      # ne rezati usred UTF-8 znaka
            i -= 1
        out.append(b[:i]); b = b[i:]
    out.append(b)
    return "\r\n ".join(x.decode("utf-8") for x in out)

def kon(n):      # 1 koncesija, 2–4 koncesije, 5+ koncesija
    return "koncesije" if n % 10 in (2, 3, 4) and n % 100 not in (12, 13, 14) else "koncesija"

def ugo(n):      # 1 ugovor, 2+ ugovora
    return "ugovor" if n % 10 == 1 and n % 100 != 11 else "ugovora"

def eur(x):
    return f"{x:,.0f}".replace(",", ".") + " €"

def dogadaj(uid, dan, naslov, opis, url):
    return ["BEGIN:VEVENT", f"UID:{uid}@koncesijski-sat", f"DTSTAMP:{STAMP}",
            f"DTSTART;VALUE=DATE:{dan:%Y%m%d}", f"DTEND;VALUE=DATE:{dan + timedelta(days=1):%Y%m%d}",
            f"SUMMARY:{ics_tekst(naslov)}", f"DESCRIPTION:{ics_tekst(opis)}", f"URL:{url}",
            "TRANSP:TRANSPARENT",
            "BEGIN:VALARM", "ACTION:DISPLAY", f"DESCRIPTION:{ics_tekst(naslov)}", "TRIGGER:-P7D", "END:VALARM",
            "END:VEVENT"]

from datetime import timedelta
UKUPNO = {"kalendara": 0, "dogadaja": 0}

def zapisi_kalendar(put, naziv, opis_kal, po_dat, url, url_opis, kratko, stavka):
    """Jedan feed: ugovori istog datuma grupirani u događaj + „pripremiti postupak“ 6 mj. ranije."""
    redovi = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Koncesijski sat//HR", "CALSCALE:GREGORIAN", "METHOD:PUBLISH",
              f"X-WR-CALNAME:{ics_tekst('Rokovi koncesija · ' + naziv)}",
              f"X-WR-CALDESC:{ics_tekst(opis_kal + ' Iz Registra koncesija (FINA, data.gov.hr). Osvježava se nakon svake obrade podataka. ' + url)}",
              "X-WR-TIMEZONE:Europe/Zagreb", "REFRESH-INTERVAL;VALUE=DURATION:P1D", "X-PUBLISHED-TTL:P1D"]
    for dan, lista in sorted(po_dat.items()):
        lista.sort(key=lambda x: -(x[8] or 0))
        n, nak = len(lista), sum(x[8] or 0 for x in lista)
        stavke = [stavka(x) + (f", {eur(x[8])}/god." if x[8] else "") for x in lista[:40]]
        if n > 40:
            stavke.append(f"… i još {n - 40} (cijeli popis u aplikaciji)")
        kljuc = hashlib.sha1(f"{put}|{dan}".encode()).hexdigest()[:16]
        prvi = tablice["koncesionar"][lista[0][1]]
        naslov = f"Ističe koncesija: {prvi}" if n == 1 else f"Ističe {n} {kon(n)} · {kratko}"
        opis = (f"{n} {ugo(n)} o koncesiji ističe {dan.day}. {dan.month}. {dan.year}." +
                (f" Godišnja fiksna naknada: {eur(nak)}." if nak else "") + "\n\n" + "\n".join(stavke) +
                f"\n\n{url_opis}: {url}\nIzvor: Registar koncesija (FINA), obrada Koncesijski sat {DANAS.day}. {DANAS.month}. {DANAS.year}.")
        redovi += dogadaj("istek-" + kljuc, dan, naslov, opis, url); UKUPNO["dogadaja"] += 1
        prip = minus_mj(dan, 6)
        if prip >= DANAS:
            redovi += dogadaj("priprema-" + kljuc, prip,
                              f"Pripremiti postupak: za 6 mj. ističe {n} {kon(n)}" + (f" ({prvi})" if n == 1 else f" · {kratko}"),
                              f"{dan.day}. {dan.month}. {dan.year}. ističe {n} {ugo(n)} o koncesiji. "
                              "Novi postupak dodjele treba pokrenuti na vrijeme, da prostor ili usluga ne ostanu bez ugovora.\n\n" +
                              "\n".join(stavke) + f"\n\n{url_opis}: {url}", url)
            UKUPNO["dogadaja"] += 1
    redovi.append("END:VCALENDAR")
    os.makedirs(os.path.dirname(put), exist_ok=True)
    with open(put, "w", encoding="utf-8", newline="") as f:
        f.write("\r\n".join(presavij(r) for r in redovi) + "\r\n")
    UKUPNO["kalendara"] += 1

buduci = [x for x in redci if date.fromisoformat(x[5]) >= DANAS]
kon_ = lambda x: tablice["koncesionar"][x[1]]
vrs_ = lambda x: tablice["vrsta"][x[2]]

# 1) po općini – pregled svih ugovora na području, s davateljem uz svaki
po_opc = {}
for x in buduci:
    if x[3] >= 0:
        po_opc.setdefault(tablice["opcina"][x[3]], {}).setdefault(date.fromisoformat(x[5]), []).append(x)
for oid, po_dat in po_opc.items():
    naziv = naziv_opc.get(oid, oid)
    zapisi_kalendar(os.path.join(KAL, oid + ".ics"), naziv, f"Svi ugovori o koncesiji na području: {naziv} (pregled, svi davatelji).",
                    po_dat, f"{WEB}/#opcina/{oid}", "Profil općine", naziv.replace("Grad ", "").replace("Općina ", ""),
                    lambda x: f"• {kon_(x)} – {vrs_(x)} ({x[7]}) · davatelj: {tablice['davatelj'][x[0]]}")
n_opc = UKUPNO["kalendara"]

# 2) po davatelju – „moji ugovori“: sve što davatelj dodjeljuje, na svim lokacijama
po_dav = {}
for x in buduci:
    po_dav.setdefault(dav_kljuc[x[0]], {}).setdefault(date.fromisoformat(x[5]), []).append(x)
for kl, po_dat in po_dav.items():
    imena = Counter(tablice["davatelj"][x[0]] for l in po_dat.values() for x in l)
    naziv = imena.most_common(1)[0][0]
    zapisi_kalendar(os.path.join(KAL, "davatelj", kl + ".ics"), naziv, f"Ugovori o koncesiji koje dodjeljuje {naziv}.",
                    po_dat, f"{WEB}/#sat", "Što ističe", naziv,
                    lambda x: f"• {kon_(x)} – {vrs_(x)} ({x[7]}{', ' + naziv_opc[tablice['opcina'][x[3]]] if x[3] >= 0 and tablice['opcina'][x[3]] in naziv_opc else ''})")
print(f"kalendara: {n_opc} po općini + {UKUPNO['kalendara'] - n_opc} po davatelju, događaja: {UKUPNO['dogadaja']}")

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
print("s naknadom:", sum(1 for x in redci if x[8] is not None))
for fn in ("podaci.js", "granice.js", "koncesije.csv"):
    print(fn, round(os.path.getsize(os.path.join(OUT, fn)) / 1e6, 2), "MB")
