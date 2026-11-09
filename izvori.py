#!/usr/bin/env python3
"""Dohvat i provjera otvorenih podataka preko CKAN API-ja Portala otvorenih podataka (data.gov.hr).

Povezuje 5 skupova s Portala otvorenih podataka (data.gov.hr):
1. informacije-o-ugovorenim-koncesijama (FINA / Ministarstvo financija) – Registar koncesija
2. popis-javnopravnih-tijela (MPUDT, živi JSON API jpt.gov.hr) – 4.679 javnopravnih tijela po OIB-u
3. statistika-u-nizu-popis-stanovnistva-kucanstava-i-stanova-2021 (DZS) – broj stanovnika po JLS-u
4. adresar-tijela-javne-vlasti (MPUDT / SDU) – službene web-stranice gradova i općina (XML)
5. https-porezna-uprava-gov-hr-hr-odluke-jls-4009 (Porezna uprava) – stope poreza na dohodak JLS-ova (2025./2026.)

Za svaki skup dohvaća metapodatke preko CKAN API-ja (`package_show`), preuzima resurse (uz lokalnu
predmemoriju) te gradi `izvori.json` (metapodaci i licencije) i `otvoreni_izvori.json` (objedinjeni
registar javnopravnih tijela po OIB-u i pokazatelji svih 556 gradova i općina).
"""
import hashlib, json, os, re, ssl, sys, unicodedata, urllib.parse, urllib.request, xml.etree.ElementTree as ET, zipfile
from datetime import datetime, timezone
from pathlib import Path

KORIJEN = Path(__file__).resolve().parent
CACHE = KORIJEN / ".cache_datagovhr"
SHARED_RAW = KORIJEN.parent / "drustvo_i_javne_usluge" / "data" / "datagovhr" / "raw"
SHARED_CAT = KORIJEN.parent / "data_gov_hr" / "catalogue.json"
CKAN = "https://data.gov.hr/ckan/api/3/action/"

SKUPOVI = [
    ("informacije-o-ugovorenim-koncesijama", "koncesije.txt", None,
     "Glavni skup: ugovorene koncesije, OIB davatelja i koncesionara, rokovi, fiksne i varijabilne naknade."),
    ("popis-javnopravnih-tijela", "jpt.json", r"PopisOznakaNaDanasnjiDan",
     "Živi JSON API (jpt.gov.hr): OIB, matična oznaka, vrsta tijela, županija, sjedište i službeni e-mail davatelja."),
    ("statistika-u-nizu-popis-stanovnistva-kucanstava-i-stanova-2021", "popis2021.xlsx", r"po_gradovima_opcinama\.xlsx",
     "Popis 2021. (DZS): broj stanovnika po gradovima i općinama za izračun koncesijske naknade po stanovniku."),
    ("adresar-tijela-javne-vlasti", "adresar.xml", r"\.xml",
     "Adresar tijela javne vlasti: službene web-stranice gradova i općina."),
    ("https-porezna-uprava-gov-hr-hr-odluke-jls-4009", "porez_jls.xlsx", r"usporedba-2025-i-2026",
     "Porezna uprava: niža i viša stopa poreza na dohodak po gradovima i općinama za 2025. i 2026."),
]

OSTALI = [
    {"naziv": "geoBoundaries – Croatia ADM2 (granice općina i gradova)", "izdavatelj": "William & Mary geoLab",
     "dozvola": "CC BY 4.0", "poveznica": "https://www.geoboundaries.org/countryDownloads.html", "lokalno": "geo.geojson",
     "uloga": "Poligoni granica općina i gradova za kartografski prikaz."},
]


def _ssl():
    try:
        import certifi
        return ssl.create_default_context(cafile=certifi.where())
    except ImportError:
        return ssl.create_default_context(cafile="/etc/ssl/cert.pem") if os.path.exists("/etc/ssl/cert.pem") else None


def _sha1_prefix(url):
    return hashlib.sha1(url.encode()).hexdigest()[:16]


def dohvati_url(url, ext="", lokalno_ime=None):
    """Dohvaća datoteku s URL-a ili iz lokalne predmemorije."""
    CACHE.mkdir(parents=True, exist_ok=True)
    h = _sha1_prefix(url)
    kandidati = [
        CACHE / (lokalno_ime or f"{h}{ext}"),
        SHARED_RAW / f"{h}{ext}",
    ]
    for p in kandidati:
        if p.exists() and p.stat().st_size > 0:
            return p
    req = urllib.request.Request(url, headers={"User-Agent": "koncesijski-sat/1.0 (open data datathon)"})
    with urllib.request.urlopen(req, timeout=30, context=_ssl()) as r:
        data = r.read()
    izlaz = kandidati[0]
    izlaz.write_bytes(data)
    return izlaz


def ckan_package_show(ime):
    """Dohvaća metapodatke skupa preko CKAN API-ja (uz fallback na lokalni katalog)."""
    url = f"{CKAN}package_show?{urllib.parse.urlencode({'id': ime})}"
    h = _sha1_prefix(url)
    for p in (CACHE / f"{h}.json", SHARED_RAW / f"{h}.json"):
        if p.exists():
            d = json.loads(p.read_text(encoding="utf-8"))
            if d.get("success"):
                return d["result"]
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "koncesijski-sat/1.0"})
        with urllib.request.urlopen(req, timeout=20, context=_ssl()) as r:
            d = json.load(r)
            CACHE.mkdir(parents=True, exist_ok=True)
            (CACHE / f"{h}.json").write_text(json.dumps(d, ensure_ascii=False), encoding="utf-8")
            return d["result"]
    except OSError:
        if SHARED_CAT.exists():
            for zapis in json.loads(SHARED_CAT.read_text(encoding="utf-8")):
                if zapis.get("name") == ime:
                    return {
                        "id": zapis.get("id"), "name": zapis["name"], "title": zapis["title"],
                        "organization": {"title": zapis.get("org")},
                        "license_title": zapis.get("license"),
                        "metadata_modified": zapis.get("modified"),
                        "resources": zapis.get("resources", []),
                    }
        raise


# ---------- minimalni čitač XLSX datoteka (standardna biblioteka) ----------
M = "{http://schemas.openxmlformats.org/spreadsheetml/2006/main}"
REL = "{http://schemas.openxmlformats.org/officeDocument/2006/relationships}"


class Xlsx:
    def __init__(self, src):
        self.z = zipfile.ZipFile(src)
        self.ss = []
        if "xl/sharedStrings.xml" in self.z.namelist():
            for _, el in ET.iterparse(self.z.open("xl/sharedStrings.xml")):
                if el.tag == M + "si":
                    self.ss.append("".join(t.text or "" for t in el.iter(M + "t")))
                    el.clear()
        rels = {r.get("Id"): r.get("Target") for r in ET.fromstring(self.z.read("xl/_rels/workbook.xml.rels"))}
        self.sheets = {s.get("name"): "xl/" + rels[s.get(REL + "id")].lstrip("/").removeprefix("xl/")
                       for s in ET.fromstring(self.z.read("xl/workbook.xml")).iter(M + "sheet")}

    def rows(self, name):
        for _, r in ET.iterparse(self.z.open(self.sheets[name])):
            if r.tag != M + "row":
                continue
            row = {}
            for c in r.findall(M + "c"):
                t, v = c.get("t"), c.find(M + "v")
                if t == "inlineStr":
                    val = "".join(x.text or "" for x in c.iter(M + "t"))
                elif v is None:
                    continue
                else:
                    val = self.ss[int(v.text)] if t == "s" else v.text
                n = 0
                for ch in re.match(r"[A-Z]+", c.get("r")).group():
                    n = n * 26 + ord(ch) - 64
                row[n - 1] = val
            r.clear()
            yield [row.get(j) for j in range(max(row) + 1)] if row else []


def fold(s):
    s = unicodedata.normalize("NFKD", (s or "").replace("đ", "d").replace("Đ", "D"))
    return re.sub(r"\s+", " ", "".join(c for c in s if not unicodedata.combining(c))).upper().strip()


def unit_key(s):
    s = fold(s)
    s = re.sub(r"^(GRAD|OPCINA|OPICINA|OTOK)\s+", "", s)
    return re.sub(r"[^A-Z0-9]+", " ", s).strip()


def norm_key(s):
    s = fold(s)
    s = re.sub(r"^(GRAD|OPCINA|OPICINA|OTOK)\s+", "", s)
    s = re.split(r"\s*-\s*", s)[0]
    return re.sub(r"[^A-Z0-9 ]", "", s).strip()


def county_key(s):
    return re.sub(r"\s*ZUPANIJA\s*", " ", fold(s)).strip()


def kratka_vrsta_jpt(vrsta, naziv):
    v = (vrsta or "").lower()
    n = (naziv or "").upper()
    if "grad zagreb" in v or n == "GRAD ZAGREB":
        return "Grad Zagreb"
    if v.endswith("grad"):
        return "Grad"
    if v.endswith("općina"):
        return "Općina"
    if v.endswith("županija"):
        return "Županija"
    if "tijelo državne uprave" in v or "ministarstvo" in n or "vlada" in n:
        return "Ministarstvo / državno tijelo"
    if "lučka uprava" in n.lower():
        return "Lučka uprava"
    if "nacionalni park" in n.lower() or "park prirode" in n.lower() or "javna ustanova" in n.lower():
        return "Javna ustanova (priroda/lokalno)"
    if "agencija" in n.lower() or "zavod" in n.lower() or "fond" in n.lower():
        return "Državna agencija / zavod"
    return "Javnopravno tijelo"


def izgradi_otvorene_izvore(putanje):
    """Spaja JPT (OIB), DZS Popis 2021., Adresar i Poreznu upravu u jedinstveni `otvoreni_izvori.json`."""
    jpt_lista = json.loads(putanje["popis-javnopravnih-tijela"].read_text(encoding="utf-8"))
    jpt_po_oibu = {}
    jls_jedinice = {}

    for b in jpt_lista:
        oib = (b.get("OIB") or "").strip()
        vrsta = b.get("VrstaJPT") or ""
        naziv = (b.get("Naziv") or "").strip()
        zup = re.sub(r"\s+", " ", (b.get("Zupanija") or "")).strip()
        grad_opc = (b.get("GradOpcina") or "").strip()
        email = (b.get("Email") or [None])[0]
        osnivac = (b.get("Osnivaci") or [{}])[0].get("Naziv") if b.get("Osnivaci") else None
        if oib:
            jpt_po_oibu[oib] = {
                "oib": oib,
                "oznaka": b.get("Oznaka"),
                "naziv": naziv,
                "vrsta": kratka_vrsta_jpt(vrsta, naziv),
                "grad_opcina": grad_opc,
                "zupanija": zup,
                "email": email,
                "osnivac": osnivac,
            }
        if vrsta.startswith("Jedinica lokalne") and not vrsta.endswith("Županija"):
            tip = "općina" if vrsta.endswith("Općina") else "grad"
            kratko = re.sub(r"^(GRAD|OPĆINA)\s+", "", naziv) if naziv != "GRAD ZAGREB" else "ZAGREB"
            ck = "GRAD ZAGREB" if naziv == "GRAD ZAGREB" else county_key(zup)
            jls_jedinice[(ck, tip, unit_key(kratko))] = {
                "oznaka": b.get("Oznaka"),
                "oib": oib,
                "naziv": naziv,
                "kratko": kratko,
                "tip": tip,
                "zupanija": "Grad Zagreb" if naziv == "GRAD ZAGREB" else zup.title().replace("I ", "i ").replace("-G", "-g"),
                "stanovnika": None,
                "web": None,
                "email": email,
                "porez_niza_2026": None,
                "porez_visa_2026": None,
                "porez_niza_2025": None,
                "porez_visa_2025": None,
            }

    # 2. DZS Popis 2021.
    pop = Xlsx(putanje["statistika-u-nizu-popis-stanovnistva-kucanstava-i-stanova-2021"])
    for r in pop.rows("1."):
        if len(r) > 5 and r[0] == "Grad Zagreb" and r[1] is None and str(r[5] or "").isdigit():
            r = [r[0], "Grad", None, None, "Zagreb", r[5]]
        if len(r) > 5 and r[1] in ("Grad", "Općina") and r[4] and str(r[5] or "").isdigit():
            tip = "grad" if r[1] == "Grad" else "općina"
            ck = "GRAD ZAGREB" if fold(r[0]) == "GRAD ZAGREB" else county_key(r[0])
            u = jls_jedinice.get((ck, tip, unit_key(r[4])))
            if u:
                u["stanovnika"] = int(r[5])

    # 3. Adresar tijela javne vlasti (XML)
    root = ET.parse(putanje["adresar-tijela-javne-vlasti"]).getroot()
    po_imenu = {}
    for rec in root.iter("RECORD"):
        inst, web = rec.findtext("Institucija"), rec.findtext("WebSjediste")
        m = re.match(r"(Grad|Općina)\s+(.+)", inst or "")
        if m and web and (rec.findtext("PodrucjeDjelovanja") or "").startswith("Lokalna"):
            po_imenu.setdefault(("grad" if m.group(1) == "Grad" else "općina", unit_key(m.group(2))), []).append(web.strip())
    for (_, tip, kljuc), u in jls_jedinice.items():
        webs = po_imenu.get((tip, kljuc), [])
        if len(webs) >= 1:
            u["web"] = webs[0]

    # 4. Porezna uprava – stope poreza na dohodak 2025. i 2026.
    px = Xlsx(putanje["https-porezna-uprava-gov-hr-hr-odluke-jls-4009"])
    porez_po_kljucu = {}
    for r in px.rows(next(iter(px.sheets))):
        if len(r) >= 6 and r[1] and re.match(r"[\d.]+$", str(r[2] or "")):
            st = (
                round(float(r[2]) * 100, 1),
                round(float(r[3]) * 100, 1),
                round(float(r[4]) * 100, 1),
                round(float(r[5]) * 100, 1),
            )
            porez_po_kljucu[unit_key(r[1])] = st
            porez_po_kljucu[norm_key(r[1])] = st
    for (_, _, kljuc), u in jls_jedinice.items():
        st = porez_po_kljucu.get(kljuc) or porez_po_kljucu.get(norm_key(u["kratko"]))
        if st:
            u["porez_niza_2026"], u["porez_visa_2026"], u["porez_niza_2025"], u["porez_visa_2025"] = st

    izlaz = {
        "generirano": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "jpt_po_oibu": jpt_po_oibu,
        "jls": list(jls_jedinice.values()),
    }
    (KORIJEN / "otvoreni_izvori.json").write_text(json.dumps(izlaz, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"otvoreni_izvori.json: {len(jpt_po_oibu)} JPT tijela po OIB-u, {len(jls_jedinice)} JLS jedinica "
          f"(stanovnika: {sum(1 for u in jls_jedinice.values() if u['stanovnika'])}, "
          f"porezne stope: {sum(1 for u in jls_jedinice.values() if u['porez_visa_2026'])})")


def main():
    izlaz = []
    putanje = {}
    for ime, lokalno, uzorak, uloga in SKUPOVI:
        p = ckan_package_show(ime)
        izmjena = p.get("metadata_modified")
        resursi = [{"naziv": r.get("name"), "format": r.get("format"), "url": r.get("url")} for r in p.get("resources", [])]
        zapis = {
            "id_skupa": p.get("id"),
            "naziv": p["title"],
            "izdavatelj": (p.get("organization") or {}).get("title"),
            "dozvola": p.get("license_title") or "Otvorena dozvola (OD)",
            "portal": f"https://data.gov.hr/ckan/dataset/{p['name']}",
            "zadnja_izmjena_na_portalu": izmjena,
            "uloga": uloga,
            "lokalno": lokalno,
            "resursi": resursi[:4],
        }
        if uzorak:
            odabrani = next((r for r in p.get("resources", [])
                             if re.search(uzorak, (r.get("url") or "") + " " + (r.get("name") or ""))), None)
            if odabrani and odabrani.get("url"):
                ext = "." + lokalno.split(".")[-1]
                put = dohvati_url(odabrani["url"], ext=ext)
                putanje[ime] = put
                zapis["preuzeti_resurs"] = odabrani["url"]
                zapis["sha256"] = hashlib.sha256(put.read_bytes()).hexdigest()
        elif (KORIJEN / lokalno).exists():
            lok = datetime.fromtimestamp((KORIJEN / lokalno).stat().st_mtime, timezone.utc)
            zapis["lokalna_kopija"] = lok.isoformat(timespec="seconds")
        izlaz.append(zapis)

    izlaz += OSTALI
    (KORIJEN / "izvori.json").write_text(json.dumps(izlaz, ensure_ascii=False, indent=2), encoding="utf-8")
    for z in izlaz:
        print(f"- {z['naziv']} | {z['izdavatelj']} | {z['dozvola']}")
    if len(putanje) >= 4:
        izgradi_otvorene_izvore(putanje)
    print("zapisano: izvori.json")


if __name__ == "__main__":
    main()
