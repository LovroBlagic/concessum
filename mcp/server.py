#!/usr/bin/env python3
"""Koncesijski sat – MCP server (Model Context Protocol, stdio, bez vanjskih ovisnosti).

AI asistent (Claude Desktop, Claude Code ili bilo koji MCP klijent) preko ovog servera može
odgovarati na pitanja o koncesijama običnim jezikom, nad istim obrađenim podacima kao web aplikacija
(app/data/podaci.js i app/data/granice.js, izlaz izvoz_web.py).

Pokretanje (Claude Code):   claude mcp add koncesijski-sat -- python3 /put/do/mcp/server.py
Ručni test:                 python3 mcp/test_server.py
"""
import json, os, re, sys, unicodedata
from datetime import date, timedelta

PROTOKOL = "2025-06-18"
KORIJEN = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "app", "data")
NAST = {0: None, 1: "obnovljena", 2: "zamjena", 3: "bez_nastavka"}
MIN_ZRELIH = 5


# ---------------------------------------------------------------- podaci
def _js(ime, prefiks):
    t = open(os.path.join(KORIJEN, ime), encoding="utf-8").read().strip()
    return json.loads(t[len(prefiks):].rstrip(";"))

P = _js("podaci.js", "window.PODACI=")
G = _js("granice.js", "window.GRANICE=")
NAZIV = {f["properties"]["name"]: f["properties"]["naziv"] for f in G["features"]}
SEKTOR = dict(P["sektori"])


def _d(s):
    return date.fromisoformat(s) if s else None

UGOVORI = []
for r in P["ugovori"]:
    oid = P["opcine"][r[3]] if r[3] >= 0 else None
    UGOVORI.append(dict(
        davatelj=P["davatelji"][r[0]], koncesionar=P["koncesionari"][r[1]], vrsta=P["vrste"][r[2]],
        sektor=P["vrsteSektor"][r[2]], opcina_id=oid, opcina=NAZIV.get(oid), lokacija=r[7],
        od=_d(r[4]), do=_d(r[5]), nastavak=NAST[r[6]], naknada=r[8] if len(r) > 8 else None))


def norm(s):
    s = unicodedata.normalize("NFKD", (s or "").lower()).encode("ascii", "ignore").decode()
    s = re.sub(r"^(grad|opcina)\s+", "", s.strip())
    return re.sub(r"[^a-z0-9 ]", "", s).strip()

_PO_NAZIVU = {}
for oid, n in NAZIV.items():
    _PO_NAZIVU.setdefault(norm(n), []).append(oid)


def nadji_opcinu(upit):
    """'Dubrovnik', 'grad dubrovnik', 'Dubrovnika' -> shapeID; točan naziv, pa najkraći koji počinje upitom."""
    k = norm(upit)
    if not k:
        return None
    if k in _PO_NAZIVU:
        return sorted(_PO_NAZIVU[k], key=lambda o: not NAZIV[o].startswith("Grad"))[0]
    for duljina in (len(k), max(4, len(k) - 2)):          # i padeži: "Dubrovniku" -> "dubrovni"
        kand = [o for o, n in NAZIV.items() if norm(n).startswith(k[:duljina])]
        if kand:
            return min(kand, key=lambda o: len(NAZIV[o]))
    return None


def danas():
    return date.today()


def plus_mj(d, m):
    y, mm = divmod(d.month - 1 + m, 12)
    import calendar
    return date(d.year + y, mm + 1, min(d.day, calendar.monthrange(d.year + y, mm + 1)[1]))


def ugovor_out(u):
    return {k: (v.isoformat() if isinstance(v, date) else v) for k, v in u.items()
            if k not in ("opcina_id",) and v not in (None, "")} | {"sektor": SEKTOR[u["sektor"]]}


def agregat(lista):
    d0, d6, d12 = danas(), plus_mj(danas(), 6), plus_mj(danas(), 12)
    a = dict(ukupno=0, aktivnih=0, istjece_6mj=0, istjece_12mj=0, naknada_istjece_12mj_eur=0,
             isteklih_ocijenjeno=0, bez_nastavka=0, naknada_bez_nastavka_eur=0)
    for u in lista:
        a["ukupno"] += 1
        n = u["naknada"] or 0
        if u["do"] >= d0:
            a["aktivnih"] += 1
            if u["do"] < d12:
                a["istjece_12mj"] += 1; a["naknada_istjece_12mj_eur"] += n
            if u["do"] < d6:
                a["istjece_6mj"] += 1
        if u["nastavak"]:
            a["isteklih_ocijenjeno"] += 1
            if u["nastavak"] == "bez_nastavka":
                a["bez_nastavka"] += 1; a["naknada_bez_nastavka_eur"] += n
    z = a["isteklih_ocijenjeno"]
    a["udio_bez_nastavka"] = round(a["bez_nastavka"] / z, 3) if z else None
    return a


def _sektor_kod(s):
    if not s:
        return None
    k = norm(s)
    for kod, naziv in SEKTOR.items():
        if k in (kod, norm(naziv)) or norm(naziv).startswith(k):
            return kod
    raise ValueError(f"Nepoznat sektor '{s}'. Mogući: {', '.join(SEKTOR)}")


def _opcina_ili_greska(upit):
    oid = nadji_opcinu(upit)
    if not oid:
        raise ValueError(f"Nije pronađena općina ili grad '{upit}'.")
    return oid


# ---------------------------------------------------------------- alati
def istjece_uskoro(opcina=None, do=None, sektor=None, limit=50):
    kraj = date.fromisoformat(do) if do else plus_mj(danas(), 12)
    sk = _sektor_kod(sektor)
    oid = _opcina_ili_greska(opcina) if opcina else None
    lista = sorted((u for u in UGOVORI if danas() <= u["do"] <= kraj
                    and (not oid or u["opcina_id"] == oid) and (not sk or u["sektor"] == sk)),
                   key=lambda u: u["do"])
    po_mj, po_sek = {}, {}
    for u in lista:
        m = u["do"].strftime("%Y-%m"); po_mj[m] = po_mj.get(m, 0) + 1
        s = SEKTOR[u["sektor"]]; po_sek[s] = po_sek.get(s, 0) + 1
    return dict(opcina=NAZIV.get(oid) if oid else "cijela Hrvatska", od=danas().isoformat(), do=kraj.isoformat(),
                sektor=SEKTOR.get(sk) if sk else "svi", broj_ugovora=len(lista),
                godisnja_fiksna_naknada_eur=sum(u["naknada"] or 0 for u in lista),
                po_mjesecima=po_mj, po_sektorima=dict(sorted(po_sek.items(), key=lambda x: -x[1])),
                ugovori=[ugovor_out(u) for u in lista[:limit]], prikazano=min(limit, len(lista)))


def profil_opcine(opcina):
    oid = _opcina_ili_greska(opcina)
    sve = [u for u in UGOVORI if u["opcina_id"] == oid]
    a, rh = agregat(sve), agregat(UGOVORI)
    sljedeci = sorted((u for u in sve if u["do"] >= danas()), key=lambda u: u["do"])[:5]
    sek = {}
    for u in sve:
        sek[SEKTOR[u["sektor"]]] = sek.get(SEKTOR[u["sektor"]], 0) + 1
    return dict(opcina=NAZIV[oid], pokazatelji=a, prosjek_rh_udio_bez_nastavka=rh["udio_bez_nastavka"],
                ugovori_po_sektoru=dict(sorted(sek.items(), key=lambda x: -x[1])),
                sljedeci_istekovi=[ugovor_out(u) for u in sljedeci],
                napomena="Udio bez nastavka računa se samo za ugovore istekle prije više od 12 mjeseci, bez zdravstva; "
                          "naknada je ugovorena fiksna godišnja naknada (donja granica prihoda).",
                poveznica=f"https://koncesijski-sat.vercel.app/#opcina/{oid}")


def bez_nastavka(opcina=None, sektor=None, limit=30):
    sk = _sektor_kod(sektor)
    if opcina:
        oid = _opcina_ili_greska(opcina)
        lista = sorted((u for u in UGOVORI if u["opcina_id"] == oid and u["nastavak"] == "bez_nastavka"
                        and (not sk or u["sektor"] == sk)), key=lambda u: u["do"], reverse=True)
        return dict(opcina=NAZIV[oid], broj=len(lista),
                    godisnja_naknada_eur=sum(u["naknada"] or 0 for u in lista),
                    ugovori=[ugovor_out(u) for u in lista[:limit]], prikazano=min(limit, len(lista)))
    po = {}
    for u in UGOVORI:
        if u["opcina_id"] and (not sk or u["sektor"] == sk):
            po.setdefault(u["opcina_id"], []).append(u)
    red = []
    for oid, l in po.items():
        a = agregat(l)
        if a["isteklih_ocijenjeno"] >= MIN_ZRELIH:
            red.append(dict(opcina=NAZIV[oid], udio_bez_nastavka=a["udio_bez_nastavka"], bez_nastavka=a["bez_nastavka"],
                            isteklih_ocijenjeno=a["isteklih_ocijenjeno"], naknada_bez_nastavka_eur=a["naknada_bez_nastavka_eur"]))
    red.sort(key=lambda x: (-x["udio_bez_nastavka"], -x["isteklih_ocijenjeno"]))
    return dict(sektor=SEKTOR.get(sk) if sk else "svi", prosjek_rh=agregat([u for u in UGOVORI if not sk or u["sektor"] == sk])["udio_bez_nastavka"],
                opcina_s_podatkom=len(red), poredak=red[:limit])


def trazi_koncesionara(upit, limit=30):
    k = norm(upit)
    if len(k) < 3:
        raise ValueError("Upit mora imati barem 3 znaka.")
    lista = [u for u in UGOVORI if k in norm(u["koncesionar"])]
    grupe = {}
    for u in lista:
        g = grupe.setdefault(u["koncesionar"], dict(koncesionar=u["koncesionar"], ugovora=0, aktivnih=0,
                                                    godisnja_naknada_aktivnih_eur=0, opcine=set(), sljedeci_istek=None))
        g["ugovora"] += 1
        if u["do"] >= danas():
            g["aktivnih"] += 1; g["godisnja_naknada_aktivnih_eur"] += u["naknada"] or 0
            if not g["sljedeci_istek"] or u["do"].isoformat() < g["sljedeci_istek"]:
                g["sljedeci_istek"] = u["do"].isoformat()
        if u["opcina"]:
            g["opcine"].add(u["opcina"])
    out = sorted(grupe.values(), key=lambda g: (-g["aktivnih"], -g["ugovora"]))
    for g in out:
        g["opcine"] = sorted(g["opcine"])
    return dict(upit=upit, pronadeno_koncesionara=len(out), pronadeno_ugovora=len(lista), koncesionari=out[:limit])


S_OPC = {"type": "string", "description": "Naziv općine ili grada, npr. 'Dubrovnik' ili 'Općina Baška Voda'."}
S_SEK = {"type": "string", "description": "Sektor: " + ", ".join(f"{k} ({n})" for k, n in SEKTOR.items())}
S_LIM = lambda d: {"type": "integer", "minimum": 1, "maximum": 500, "default": d, "description": "Najviše stavki u popisu."}
ALATI = {
    "istjece_uskoro": (istjece_uskoro, "Ugovori o koncesiji koji ističu od danas do zadanog datuma (zadano: 12 mjeseci), "
                       "za cijelu Hrvatsku ili jednu općinu, s brojem po mjesecima i sektorima i godišnjom naknadom koja ističe.",
                       {"opcina": S_OPC, "do": {"type": "string", "format": "date", "description": "Krajnji datum, YYYY-MM-DD."},
                        "sektor": S_SEK, "limit": S_LIM(50)}, []),
    "profil_opcine": (profil_opcine, "Profil općine ili grada: aktivni ugovori, što ističe u 6/12 mjeseci, naknada u riziku, "
                      "udio isteklih koncesija bez nastavka u usporedbi s prosjekom RH i sljedeći istekovi.",
                      {"opcina": S_OPC}, ["opcina"]),
    "bez_nastavka": (bez_nastavka, "Koncesije istekle bez nastavka (nije sklopljen novi ugovor iste vrste u roku 12 mjeseci). "
                     "S općinom: popis takvih ugovora. Bez općine: poredak općina po udjelu bez nastavka.",
                     {"opcina": S_OPC, "sektor": S_SEK, "limit": S_LIM(30)}, []),
    "trazi_koncesionara": (trazi_koncesionara, "Pretraga koncesionara po nazivu: broj ugovora, aktivni ugovori, općine, "
                           "godišnja naknada i sljedeći istek.",
                           {"upit": {"type": "string", "description": "Dio naziva koncesionara, npr. 'Jadrolinija'."}, "limit": S_LIM(30)},
                           ["upit"]),
}


# ---------------------------------------------------------------- JSON-RPC preko stdio
def odgovor(id_, rezultat=None, greska=None):
    poruka = {"jsonrpc": "2.0", "id": id_}
    poruka.update({"error": greska} if greska else {"result": rezultat})
    sys.stdout.write(json.dumps(poruka, ensure_ascii=False) + "\n"); sys.stdout.flush()


def obradi(m):
    metoda, id_, par = m.get("method"), m.get("id"), m.get("params") or {}
    if id_ is None:                     # obavijest (npr. notifications/initialized): bez odgovora
        return
    if metoda == "initialize":
        return odgovor(id_, {"protocolVersion": par.get("protocolVersion", PROTOKOL),
                             "capabilities": {"tools": {}},
                             "serverInfo": {"name": "koncesijski-sat", "version": "1.0.0"},
                             "instructions": "Podaci iz Registra koncesija (FINA, data.gov.hr). Iznosi su ugovorene fiksne "
                                             "godišnje naknade u EUR. Datumi su ISO. Navedi izvor u odgovoru."})
    if metoda == "ping":
        return odgovor(id_, {})
    if metoda == "tools/list":
        return odgovor(id_, {"tools": [{"name": n, "description": d,
                                        "inputSchema": {"type": "object", "properties": p, "required": r}}
                                       for n, (_, d, p, r) in ALATI.items()]})
    if metoda == "tools/call":
        ime, arg = par.get("name"), par.get("arguments") or {}
        if ime not in ALATI:
            return odgovor(id_, greska={"code": -32602, "message": f"Nepoznat alat: {ime}"})
        try:
            r = ALATI[ime][0](**arg)
            return odgovor(id_, {"content": [{"type": "text", "text": json.dumps(r, ensure_ascii=False, indent=1)}],
                                 "structuredContent": r, "isError": False})
        except (ValueError, TypeError) as e:
            return odgovor(id_, {"content": [{"type": "text", "text": str(e)}], "isError": True})
    odgovor(id_, greska={"code": -32601, "message": f"Nepoznata metoda: {metoda}"})


def main():
    for linija in sys.stdin:
        linija = linija.strip()
        if not linija:
            continue
        try:
            m = json.loads(linija)
        except json.JSONDecodeError:
            odgovor(None, greska={"code": -32700, "message": "Neispravan JSON"}); continue
        obradi(m)


if __name__ == "__main__":
    main()
