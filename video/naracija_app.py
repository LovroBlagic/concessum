"""Aplikacija za snimanje naracije vlastitim glasom (prema alatu iz eSidra i eVijećnice): video/naracija.html

Blokovi, vremena i tekst čitaju se iz za_snimanje/TEKST-ZA-SNIMANJE.txt („[b01]  0:00,3 – 0:10,9“ + tekst).
Stranica pušta video/concessum_v2_glazba.mp4 ispod svakog bloka, vodi tempo kroz tekst, snima blok
i izvozi jedan naracija.wav poravnat s videom.

    python3 video/naracija_app.py                       ->  video/naracija.html
    cd video && npx -y http-server -p 8765 -s           ->  http://localhost:8765/naracija.html
    (mikrofon radi samo na localhostu ili https; python -m http.server ne zna premotavati video)
    node video/v2/naracija.mjs --wav ~/Downloads/naracija.wav   ->  video/concessum_v2_naracija.mp4
"""
import json
import re
from pathlib import Path

DIR = Path(__file__).resolve().parent
TEKST = DIR.parent / "za_snimanje" / "TEKST-ZA-SNIMANJE.txt"
VIDEO = "concessum_v2_glazba.mp4"
TOTAL = 180.0

NASLOVI = {
    "b01": ("Sat se puni točkama", "Uvod"), "b02": ("22:15 i ponoć", "Uvod"), "b03": ("Ponoć: 312 ugovora", "Uvod"),
    "b04": ("Bez nastavka: 47 %", "Uvod"), "b05": ("Hodogram na satu", "Uvod"), "b06": ("Concessum", "Uvod"),
    "b07": ("Karta", "Aplikacija"), "b08": ("3D sat", "Aplikacija"), "b09": ("Ugovor i AI sažetak", "Aplikacija"),
    "b10": ("Hodogram ugovora", "Aplikacija"), "b11": ("Dopis i ZPPI", "Aplikacija"), "b12": ("Profil općine", "Aplikacija"),
    "b13": ("Rizici i revizija", "Aplikacija"), "b14": ("AI asistent (MCP)", "Mehanizam"), "b15": ("Pet izvora", "Mehanizam"),
    "b16": ("Sljedeći koraci", "Kraj"), "b17": ("Budilica", "Kraj"),
}


def sek(t):
    m, s = t.split(":")
    return int(m) * 60 + float(s.replace(",", "."))


def blokovi():
    out, cur = [], None
    for line in TEKST.read_text(encoding="utf-8").splitlines():
        m = re.match(r"\[(b\d\d)\]\s+(\d+:\d+(?:,\d+)?)\s*[–-]\s*(\d+:\d+(?:,\d+)?)", line)
        if m:
            bid, a, b = m.groups()
            naslov, poglavlje = NASLOVI.get(bid, (bid, ""))
            cur = {"id": bid, "title": naslov, "chapter": poglavlje, "start": round(sek(a), 2),
                   "dur": round(sek(b) - sek(a), 2), "text": ""}
            out.append(cur)
        elif cur is not None and line.strip():
            cur["text"] = (cur["text"] + " " + line.strip()).strip()
        elif cur is not None and cur["text"]:
            cur = None
    return out


def main():
    data = {"total": TOTAL, "scenes": blokovi()}
    assert len(data["scenes"]) == 17 and all(s["text"] for s in data["scenes"]), "očekivano 17 blokova s tekstom"
    tpl = (DIR / "naracija_template.html").read_text(encoding="utf-8")
    # ?v= po vremenu izmjene videa: preglednik ne pušta staru verziju iz predmemorije
    v = DIR / VIDEO
    ver = int(v.stat().st_mtime) if v.exists() else 0
    tpl = tpl.replace(f'src="{VIDEO}"', f'src="{VIDEO}?v={ver}"')
    (DIR / "naracija.html").write_text(tpl.replace("__DATA__", json.dumps(data, ensure_ascii=False)), encoding="utf-8")
    for s in data["scenes"]:
        print(f"{s['id']} {s['start']:>6.1f} +{s['dur']:<5} {s['title'][:26]:26} {len(s['text'].split())} riječi")
    print("-> video/naracija.html")


if __name__ == "__main__":
    main()
