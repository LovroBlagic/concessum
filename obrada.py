"""Koncesijski sat: obrada Registra koncesija (FINA) i spajanje s granicama općina.

Ulaz:  koncesije.txt (CSV iz servisi.fina.hr/regkonc, ';', UTF-8), geo.geojson (geoBoundaries HRV ADM2)
Izlaz: koncesije.json, opcine.geojson, sazetak.txt
"""
import csv, json, re, sys, unicodedata
from datetime import date, datetime
import pandas as pd
from rapidfuzz import fuzz

DANAS = pd.Timestamp(date.today())

NASLJEDNIK_MJESECI = 12    # novi ugovor mora početi najkasnije 12 mj. nakon isteka

def norm(s):
    s = (s or "").upper().strip()
    s = s.split(",")[0]                         # "BAKAR, RAŠA, RIJEKA" -> prva lokacija
    s = re.sub(r"^(GRAD|OPĆINA|OPCINA|OPIĆINA|OPICINA|OTOK)\s+", "", s)
    s = re.split(r"\s*-\s*", s)[0]              # "PULA - POLA", "MALINSKA-DUBAŠNICA"
    s = unicodedata.normalize("NFKD", s).encode("ascii", "ignore").decode()
    return re.sub(r"[^A-Z ]", "", s).strip()

# geoBoundaries HRV ADM2 ima otoke Krk, Cres i Lošinj kao cjeline, pa otočne općine
# smještamo na poligon otoka
ALIAS = {"MALI LOSINJ": "LOSINJ", "BASKA": "KRK", "PUNAT": "KRK", "DOBRINJ": "KRK",
         "VRBNIK": "KRK", "OMISALJ": "KRK"}

# 1. Učitavanje: uzimamo prvih 8 stupaca, koji su u svim redcima uredni
redci = []
with open(sys.argv[1] if len(sys.argv) > 1 else "koncesije.txt", encoding="utf-8") as f:
    r = csv.reader(f, delimiter=";")
    next(r)
    for p in r:
        if len(p) < 8:
            continue
        redci.append(p[:8] + [";".join(p[8:])])
df = pd.DataFrame(redci, columns=["davatelj", "oib_davatelja", "lokacija", "koncesionar",
                                  "oib_koncesionara", "vrsta", "od", "do", "naknada_raw"])
for c in ["od", "do"]:
    df[c] = pd.to_datetime(df[c].str.rstrip("."), format="%d.%m.%Y", errors="coerce")
df = df.drop_duplicates()
df["status"] = "aktivna"
df.loc[df["do"] < DANAS, "status"] = "istekla"
for m in (24, 12, 6):
    df.loc[(df["do"] >= DANAS) & (df["do"] < DANAS + pd.DateOffset(months=m)), "status"] = f"istjece_{m}m"
df["pomorsko"] = df["vrsta"].str.contains("pomorsk|plaž|luk", case=False, regex=True)

# 2. Smještanje na općinu: prvo LOKACIJA, pa naziv davatelja
geo = json.load(open("geo.geojson", encoding="utf-8"))
indeks = {}
for ft in geo["features"]:
    indeks.setdefault(norm(ft["properties"]["shapeName"]), ft["properties"]["shapeID"])
from rapidfuzz import process
_kljucevi = list(indeks)
def nadji(row):
    for kand in (row["lokacija"], row["davatelj"]):
        k = norm(kand)
        k = ALIAS.get(k, k)
        if not k:
            continue
        if k in indeks:
            return indeks[k]
        m = process.extractOne(k, _kljucevi, scorer=fuzz.ratio, score_cutoff=88)  # tipfeleri
        if m:
            return indeks[m[0]]
    return None
df["opcina_id"] = df.apply(nadji, axis=1)

# 3. Nastavak nakon isteka. Registar nema točnu lokaciju (samo općinu), pa razlikujemo:
#    obnovljena  = isti davatelj, vrsta i koncesionar sklope novi ugovor u roku
#    zamjena     = isti davatelj, vrsta i općina imaju bilo koji novi ugovor u roku
#    bez_nastavka = ni jedno ni drugo (najjači signal da je prostor ostao bez koncesije)
df = df.reset_index(drop=True)
grupe = {k: g for k, g in df.groupby(["oib_davatelja", "vrsta", "lokacija"])}
def nastavak(row):
    g = grupe[(row["oib_davatelja"], row["vrsta"], row["lokacija"])]
    kand = g[(g.index != row.name)
             & (g["od"] >= row["do"] - pd.DateOffset(months=1))
             & (g["od"] <= row["do"] + pd.DateOffset(months=NASLJEDNIK_MJESECI))]
    if (kand["oib_koncesionara"] == row["oib_koncesionara"]).any():
        return "obnovljena"
    return "zamjena" if len(kand) else "bez_nastavka"
# promatramo samo ugovore istekle prije više od 12 mjeseci, da je nastavak imao vremena
# zdravstvene koncesije su ukinute zakonom (4.293 u 2018. -> 1 u 2024.), pa njihov
# istek nije propust i iskrivio bi pokazatelj
zrele = ((df["status"] == "istekla")
         & (df["do"] < DANAS - pd.DateOffset(months=NASLJEDNIK_MJESECI))
         & ~df["vrsta"].str.contains("zdravstven", case=False))
df["nastavak"] = None
df.loc[zrele, "nastavak"] = df[zrele].apply(nastavak, axis=1)

# 4. Izvoz
out = df.drop(columns=["naknada_raw"]).copy()
for c in ["od", "do"]:
    out[c] = out[c].dt.strftime("%Y-%m-%d")
out.to_json("koncesije.json", orient="records", force_ascii=False)

po_opc = []
for oid, g in df[df.opcina_id.notna()].groupby("opcina_id"):
    zr = g[g.nastavak.notna()]
    po_opc.append(dict(opcina_id=oid, ukupno=len(g),
                       aktivne=int((g.status != "istekla").sum()),
                       istjece_12m=int(g.status.isin(["istjece_6m", "istjece_12m"]).sum()),
                       istekle=int((g.status == "istekla").sum()),
                       bez_nastavka=int((zr.nastavak == "bez_nastavka").sum()),
                       udio_bez_nastavka=round(float((zr.nastavak == "bez_nastavka").mean()), 3) if len(zr) else None))
po_opc = {p["opcina_id"]: p for p in po_opc}
for ft in geo["features"]:
    ft["properties"].update(po_opc.get(ft["properties"]["shapeID"], {}))
json.dump(geo, open("opcine.geojson", "w", encoding="utf-8"), ensure_ascii=False)
print(f"Učitano {len(df)} ugovora, smješteno na općinu {df.opcina_id.notna().mean():.1%}")
