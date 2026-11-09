"""Koncesijski sat: obrada Registra koncesija (FINA) i spajanje s 5 izvora s data.gov.hr.

Ulaz:
  - koncesije.txt (CSV iz servisi.fina.hr/regkonc, ';', windows-1250 ili UTF-8)
  - geo.geojson (geoBoundaries HRV ADM2)
  - otvoreni_izvori.json (izlaz izvori.py: JPT po OIB-u, DZS Popis 2021., Adresar, Porezna uprava)
Izlaz:
  - koncesije.json, opcine.geojson
"""
import csv, json, os, re, sys, unicodedata
from datetime import date, datetime
from difflib import SequenceMatcher

DANAS = date.today().isoformat()


def plus_mj(iso_dat, m):
    if not iso_dat:
        return None
    d = date.fromisoformat(iso_dat)
    y, mm = divmod(d.month - 1 + m, 12)
    import calendar
    return date(d.year + y, mm + 1, min(d.day, calendar.monthrange(d.year + y, mm + 1)[1])).isoformat()


GRANICA_6M = plus_mj(DANAS, 6)
GRANICA_12M = plus_mj(DANAS, 12)
GRANICA_24M = plus_mj(DANAS, 24)
GRANICA_ZRELE = plus_mj(DANAS, -12)


def norm(s):
    s = (s or "").upper().strip()
    s = s.split(",")[0]                         # "BAKAR, RAŠA, RIJEKA" -> prva lokacija
    s = re.sub(r"^(GRAD|OPĆINA|OPCINA|OPIĆINA|OPICINA|OTOK)\s+", "", s)
    s = re.split(r"\s*-\s*", s)[0]              # "PULA - POLA", "MALINSKA-DUBAŠNICA"
    s = s.replace("Đ", "D")
    s = unicodedata.normalize("NFKD", s).encode("ascii", "ignore").decode()
    return re.sub(r"[^A-Z ]", "", s).strip()


# geoBoundaries HRV ADM2 ima otoke Krk i Lošinj kao cjeline te nekoliko tipfelera u nazivima općina
ALIAS = {
    "MALI LOSINJ": "LOSINJ",
    "BASKA": "KRK", "PUNAT": "KRK", "DOBRINJ": "KRK", "VRBNIK": "KRK", "OMISALJ": "KRK", "MALINSKA": "KRK",
    "HRVATSKA DUBICA": "HVRATSKA DUBICA",
    "MURTER": "MUTER",
    "VELIKA PISANICA": "VELIKI PISANICA",
    "MAGADENOVAC": "MAGDENOVAC",
    "DONJI KUKURUZARI": "DONJI KUKUZARI",
    "IVANIC": "IVANIC GRAD",
}

ZUPANIJE_RIJECI = ("ZUPANIJA", "REPUBLIKA HRVATSKA", "CIJELA", "JADRANSKO MORE")

KORIJEN = os.path.dirname(os.path.abspath(__file__))
otv_put = os.path.join(KORIJEN, "otvoreni_izvori.json")
JPT_OIB = json.load(open(otv_put, encoding="utf-8")).get("jpt_po_oibu", {}) if os.path.exists(otv_put) else {}


def parse_datum(s):
    s = (s or "").strip().rstrip(".")
    m = re.match(r"^(\d\d)\.(\d\d)\.(\d{4})$", s)
    if not m:
        return None
    dd, mm, yyyy = int(m.group(1)), int(m.group(2)), int(m.group(3))
    try:
        return date(yyyy, mm, dd).isoformat()
    except ValueError:
        return None


# 1. Učitavanje i uklanjanje duplikata
ULAZ = sys.argv[1] if len(sys.argv) > 1 else os.path.join(KORIJEN, "koncesije.txt")
try:
    open(ULAZ, encoding="utf-8").read(); KOD = "utf-8"
except UnicodeDecodeError:
    KOD = "cp1250"

videno = set()
zapisi = []
with open(ULAZ, encoding=KOD) as f:
    r = csv.reader(f, delimiter=";")
    next(r)
    for p in r:
        if len(p) < 8:
            continue
        kljuc_dup = tuple(p[:8]) + (";".join(p[8:]),)
        if kljuc_dup in videno:
            continue
        videno.add(kljuc_dup)
        od_iso = parse_datum(p[6])
        do_iso = parse_datum(p[7])
        st = "aktivna"
        if do_iso:
            if do_iso < DANAS:
                st = "istekla"
            elif do_iso < GRANICA_6M:
                st = "istjece_6m"
            elif do_iso < GRANICA_12M:
                st = "istjece_12m"
            elif do_iso < GRANICA_24M:
                st = "istjece_24m"
        vrsta = p[5]
        zapisi.append({
            "davatelj": p[0],
            "oib_davatelja": p[1],
            "lokacija": p[2],
            "koncesionar": p[3],
            "oib_koncesionara": p[4],
            "vrsta": vrsta,
            "od": od_iso,
            "do": do_iso,
            "status": st,
            "pomorsko": bool(re.search(r"pomorsk|plaž|luk", vrsta, re.I)),
            "opcina_id": None,
            "nastavak": None,
        })

# 2. Smještanje na općinu (LOKACIJA -> OIB_DAVAT u jpt.gov.hr -> naziv davatelja)
geo = json.load(open(os.path.join(KORIJEN, "geo.geojson"), encoding="utf-8"))
indeks = {}
for ft in geo["features"]:
    indeks.setdefault(norm(ft["properties"]["shapeName"]), ft["properties"]["shapeID"])
_kljucevi = list(indeks)
_cache_kljuc = {}


def _trazi_kljuc(tekst):
    k = norm(tekst)
    k = ALIAS.get(k, k)
    if not k or any(z in k for z in ZUPANIJE_RIJECI):
        return None
    if k in _cache_kljuc:
        return _cache_kljuc[k]
    if k in indeks:
        _cache_kljuc[k] = indeks[k]
        return indeks[k]
    naj_omjer, naj_k = 0.0, None
    for kand in _kljucevi:
        omjer = SequenceMatcher(None, k, kand).ratio()
        if omjer >= 0.88 and omjer > naj_omjer:
            naj_omjer, naj_k = omjer, kand
    rez = indeks[naj_k] if naj_k else None
    _cache_kljuc[k] = rez
    return rez


_cache_nadji = {}
for z in zapisi:
    trojka = (z["lokacija"], z["oib_davatelja"], z["davatelj"])
    if trojka not in _cache_nadji:
        oid = _trazi_kljuc(z["lokacija"])
        if not oid:
            jpt = JPT_OIB.get((z["oib_davatelja"] or "").strip())
            if jpt and jpt.get("vrsta") in ("Grad", "Općina", "Grad Zagreb", "Lučka uprava", "Javna ustanova (priroda/lokalno)"):
                oid = _trazi_kljuc(jpt.get("grad_opcina") or "")
        if not oid:
            dav_cist = re.sub(r"^(ŽUPANIJSKA\s+)?LUČKA UPRAVA\s+", "", (z["davatelj"] or "").upper())
            oid = _trazi_kljuc(dav_cist)
        _cache_nadji[trojka] = oid
    z["opcina_id"] = _cache_nadji[trojka]

# 3. Nastavak nakon isteka:
#    obnovljena   = isti davatelj, vrsta i koncesionar sklope novi ugovor u roku (-1 mj. do +12 mj.)
#    zamjena      = isti davatelj, vrsta i lokacija imaju novi ugovor s drugim koncesionarom u roku
#    bez_nastavka = ni jedno ni drugo
grupe = {}
for idx_z, z in enumerate(zapisi):
    grupe.setdefault((z["oib_davatelja"], z["vrsta"], z["lokacija"]), []).append((idx_z, z))

for idx_z, z in enumerate(zapisi):
    do_iso = z["do"]
    if z["status"] != "istekla" or not do_iso or do_iso >= GRANICA_ZRELE or "zdravstven" in z["vrsta"].lower():
        continue
    od_min = plus_mj(do_iso, -1)
    od_max = plus_mj(do_iso, 12)
    kand = [
        drugi for j, drugi in grupe[(z["oib_davatelja"], z["vrsta"], z["lokacija"])]
        if j != idx_z and drugi["od"] and od_min <= drugi["od"] <= od_max
    ]
    if any(k["oib_koncesionara"] == z["oib_koncesionara"] for k in kand):
        z["nastavak"] = "obnovljena"
    elif kand:
        z["nastavak"] = "zamjena"
    else:
        z["nastavak"] = "bez_nastavka"

# 4. Izvoz
json.dump(zapisi, open(os.path.join(KORIJEN, "koncesije.json"), "w", encoding="utf-8"), ensure_ascii=False)

po_opc_list = {}
for z in zapisi:
    if z["opcina_id"]:
        po_opc_list.setdefault(z["opcina_id"], []).append(z)

po_opc = {}
for oid, g in po_opc_list.items():
    zr = [x for x in g if x["nastavak"] is not None]
    bez = sum(1 for x in zr if x["nastavak"] == "bez_nastavka")
    po_opc[oid] = dict(
        opcina_id=oid,
        ukupno=len(g),
        aktivne=sum(1 for x in g if x["status"] != "istekla"),
        istjece_12m=sum(1 for x in g if x["status"] in ("istjece_6m", "istjece_12m")),
        istekle=sum(1 for x in g if x["status"] == "istekla"),
        bez_nastavka=bez,
        udio_bez_nastavka=round(bez / len(zr), 3) if zr else None,
    )

for ft in geo["features"]:
    ft["properties"].update(po_opc.get(ft["properties"]["shapeID"], {}))
json.dump(geo, open(os.path.join(KORIJEN, "opcine.geojson"), "w", encoding="utf-8"), ensure_ascii=False)

smjesteno = sum(1 for z in zapisi if z["opcina_id"]) / len(zapisi)
print(f"Učitano {len(zapisi)} ugovora, smješteno na općinu {smjesteno:.1%}")
