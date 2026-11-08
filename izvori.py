#!/usr/bin/env python3
"""Provjera izvora preko CKAN API-ja Portala otvorenih podataka (data.gov.hr).

Za svaki korišteni skup ispisuje izdavatelja, dozvolu, datum zadnje izmjene i poveznice na resurse,
te upozorava ako je lokalna kopija starija od zadnje izmjene na Portalu. Izlaz: izvori.json.

    python3 izvori.py

Napomena: FINA-in „Preuzmi sve podatke“ (servisi.fina.hr/regkonc) zaštićen je reCAPTCHA-om, pa se sam CSV
ne može preuzeti automatski – koncesije.txt preuzima se ručno. Vidi docs/ARHITEKTURA.md, „Preduvjeti“.
"""
import json, os, ssl, sys, urllib.parse, urllib.request
from datetime import datetime, timezone

CKAN = "https://data.gov.hr/ckan/api/3/action/"
SKUPOVI = {
    # naziv skupa na Portalu -> lokalna datoteka
    "informacije-o-ugovorenim-koncesijama": "koncesije.txt",
}
OSTALI = [  # izvori izvan Portala
    {"naziv": "geoBoundaries – Croatia ADM2 (granice općina i gradova)", "izdavatelj": "William & Mary geoLab",
     "dozvola": "CC BY 4.0", "poveznica": "https://www.geoboundaries.org/countryDownloads.html", "lokalno": "geo.geojson"},
]


def _ssl():
    """python.org Python na macOS-u nema sistemske certifikate; koristi certifi ili /etc/ssl/cert.pem."""
    try:
        import certifi
        return ssl.create_default_context(cafile=certifi.where())
    except ImportError:
        return ssl.create_default_context(cafile="/etc/ssl/cert.pem") if os.path.exists("/etc/ssl/cert.pem") else None


def ckan(akcija, **par):
    url = CKAN + akcija + "?" + urllib.parse.urlencode(par)
    with urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": "koncesijski-sat"}), timeout=30, context=_ssl()) as r:
        return json.load(r)["result"]


def main():
    izlaz = []
    for ime, lokalno in SKUPOVI.items():
        p = ckan("package_show", id=ime)
        izmjena = p.get("metadata_modified")
        zapis = {"naziv": p["title"], "izdavatelj": (p.get("organization") or {}).get("title"),
                 "dozvola": p.get("license_title"), "portal": f"https://data.gov.hr/ckan/dataset/{p['name']}",
                 "zadnja_izmjena_na_portalu": izmjena, "lokalno": lokalno,
                 "resursi": [{"naziv": r.get("name"), "format": r.get("format"), "url": r.get("url")} for r in p["resources"]]}
        if os.path.exists(lokalno):
            lok = datetime.fromtimestamp(os.path.getmtime(lokalno), timezone.utc)
            zapis["lokalna_kopija"] = lok.isoformat(timespec="seconds")
            if izmjena and datetime.fromisoformat(izmjena).replace(tzinfo=timezone.utc) > lok:
                zapis["upozorenje"] = "Skup je na Portalu izmijenjen nakon preuzimanja lokalne kopije."
        izlaz.append(zapis)
    izlaz += OSTALI
    json.dump(izlaz, open("izvori.json", "w", encoding="utf-8"), ensure_ascii=False, indent=2)
    for z in izlaz:
        print(f"- {z['naziv']} | {z['izdavatelj']} | {z['dozvola']}")
        for r in z.get("resursi", []):
            print(f"    {r['format']}: {r['url']}")
        if "upozorenje" in z:
            print("    ! " + z["upozorenje"])
    print("zapisano: izvori.json")


if __name__ == "__main__":
    try:
        main()
    except OSError as e:
        sys.exit(f"Portal nije dostupan: {e}")
