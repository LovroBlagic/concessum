#!/usr/bin/env python3
"""Pokreće MCP server kao podproces i prolazi kroz protokol kao što to radi MCP klijent."""
import json, os, subprocess, sys

srv = subprocess.Popen([sys.executable, os.path.join(os.path.dirname(os.path.abspath(__file__)), "server.py")],
                       stdin=subprocess.PIPE, stdout=subprocess.PIPE, text=True, encoding="utf-8")
n = 0
def zovi(metoda, params=None, obavijest=False):
    global n
    m = {"jsonrpc": "2.0", "method": metoda, "params": params or {}}
    if not obavijest:
        n += 1; m["id"] = n
    srv.stdin.write(json.dumps(m) + "\n"); srv.stdin.flush()
    return None if obavijest else json.loads(srv.stdout.readline())

r = zovi("initialize", {"protocolVersion": "2025-06-18", "capabilities": {}, "clientInfo": {"name": "test", "version": "0"}})
assert r["result"]["serverInfo"]["name"] == "koncesijski-sat"
zovi("notifications/initialized", obavijest=True)
alati = [t["name"] for t in zovi("tools/list")["result"]["tools"]]
print("alati:", alati)

def alat(ime, **arg):
    r = zovi("tools/call", {"name": ime, "arguments": arg})["result"]
    assert not r["isError"], r
    return r["structuredContent"]

a = alat("istjece_uskoro", opcina="Dubrovnik", do="2026-12-31")
print(f"istjece_uskoro(Dubrovnik, 2026-12-31): {a['broj_ugovora']} ugovora, {a['godisnja_fiksna_naknada_eur']:,} EUR, po sektorima {a['po_sektorima']}")
p = alat("profil_opcine", opcina="dubrovniku")
print("profil_opcine(dubrovniku):", p["opcina"], {k: p["pokazatelji"][k] for k in ("aktivnih", "istjece_12mj", "naknada_istjece_12mj_eur", "udio_bez_nastavka")})
b = alat("bez_nastavka", sektor="pomorsko", limit=3)
print("bez_nastavka(pomorsko) top 3:", [(x["opcina"], x["udio_bez_nastavka"]) for x in b["poredak"]], "prosjek", b["prosjek_rh"])
t = alat("trazi_koncesionara", upit="valamar", limit=2)
print("trazi_koncesionara(valamar):", [(x["koncesionar"], x["tip_koncesionara"], x["aktivnih"], x["sljedeci_istek"]) for x in t["koncesionari"]])
rev = alat("revizija_rizika", limit=3)
print("revizija_rizika(RH):", rev["pronadeno_riznicnih_ugovora"], "top anomalija:", rev["ugovori"][0]["koncesionar"], rev["ugovori"][0]["ai_stvarna_namjena"])
g = zovi("tools/call", {"name": "profil_opcine", "arguments": {"opcina": "Atlantida"}})["result"]
assert g["isError"]; print("greška za nepostojeću općinu:", g["content"][0]["text"])
srv.stdin.close(); srv.wait()
print("OK")
