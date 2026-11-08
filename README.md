# Koncesijski sat

**Koje koncesije u Hrvatskoj uskoro ističu, koliko naknade o tome ovisi i gdje istekle koncesije ostaju bez nastavka.**
Registar koncesija (FINA) pretvoren je iz popisa od 25 tisuća redaka u alat koji općinama i nadzornim tijelima unaprijed pokazuje koje rokove moraju pratiti.

- **Aplikacija:** https://koncesijski-sat.vercel.app
- **Izvorni kod:** https://github.com/LovroBlagic/koncesijski-sat
- **Otvoreni izvoz obrađenih podataka:** https://koncesijski-sat.vercel.app/data/koncesije.csv
- Datathon Portala otvorenih podataka 2026, izazov **C) Gospodarstvo i učinkovito upravljanje**

## Problem

Kad koncesija istekne prije nego što je proveden novi postupak, javno se dobro (vez, plaža, luka, komunalna usluga) koristi bez ugovora, naknada se ne naplaćuje, a korisnik ne zna hoće li moći nastaviti. Registar koncesija sadrži sve rokove, ali nema pregled po općini i vremenu, pa ih svaki davatelj prati ručno.

| Stanje na dan 8. 11. 2026. | |
|---|---|
| Aktivni ugovori | 5.114 |
| Ističe u idućih 6 / 12 mjeseci | 521 / 816 |
| Ugovorena fiksna godišnja naknada ugovora koji ističu u 12 mj. | ≈ 1,65 mil. € |
| Isteklih ugovora (bez zdravstva) za koje nije sklopljen novi ugovor iste vrste | 54 % (7.483 od 13.945) |
| Primjer: Grad Dubrovnik do 31. 12. 2026. | 203 ugovora, 164 tis. € godišnje naknade |

## Kome je namijenjeno

- **Službenici gradova i općina** (davatelji koncesija): rokovi njihovih ugovora, priprema natječaja, izvještaj za vijeće.
- **Županije i ministarstva** (nadzor): koje općine sustavno ne obnavljaju koncesije.
- **Koncesionari:** kada im ističe ugovor i koliko ugovora ističe u njihovom sektoru.
- **Novinari, udruge i građani:** transparentnost upravljanja javnim dobrom.

## Funkcionalnosti

| Ekran | Što radi |
|---|---|
| **Karta** | Koropletna karta svih općina po 5 pokazatelja (udio bez nastavka, broj koji ističe, **naknada koja ističe**, aktivne, istekle bez nastavka) i filter po sektoru. Uz kartu je poredak općina, a klik na općinu otvara njezin profil. |
| **Što ističe** | Ugovori koji ističu u 6/12/24/36 mjeseci, po mjesecima i sektorima. Klik na stupac filtrira tablicu na taj mjesec, a tablica ima pretragu. |
| **Profil općine** | Brojke usporedive s prosjekom RH, automatski sažetak napisan običnim jezikom, ugovori kroz vrijeme, ishod isteklih ugovora po sektoru i tablica svih ugovora s naknadom. |
| **Metodologija** | Kako se podaci obrađuju i koja su ograničenja. |

**Za lakše korištenje:**
- **Tražilica općine u zaglavlju.** Prepoznaje i nepotpun naziv („dubrov“ vodi na Dubrovnik).
- **Kratke upute** pri prvom otvaranju.
- **Objašnjenje uz svaki pokazatelj.**
- **Pamti zadnju gledanu općinu.**
- **Preuzmi CSV.** Datoteka se izravno otvara u hrvatskom Excelu (`;` kao razdjelnik, UTF-8 s BOM-om).
- **Dodaj u kalendar (.ics).** Svaki rok postaje događaj u Outlooku ili Google kalendaru, s podsjetnikom 6 mjeseci i mjesec dana prije isteka.
- **Ispiši izvještaj.** Profil općine sprema se kao PDF, spreman za vijeće.
- **Radi na mobitelu**, ima svijetlu i tamnu temu, a grafovi imaju tekstualne opise za čitače zaslona.

**AI asistent (MCP server):** iste podatke može pitati Claude ili bilo koji drugi MCP klijent, npr. *„Koje koncesije u Dubrovniku ističu do kraja godine?“* Pogledajte [MCP server](#mcp-server-ai-asistent).

## Korišteni skupovi podataka

| Skup | Izdavatelj | Dozvola | Izvor |
|---|---|---|---|
| Informacije o ugovorenim koncesijama (Registar koncesija) | Financijska agencija (FINA) / Ministarstvo financija | Otvorena dozvola (OD) | [data.gov.hr](https://data.gov.hr/ckan/dataset/informacije-o-ugovorenim-koncesijama) → [servisi.fina.hr/regkonc](https://servisi.fina.hr/regkonc/) |
| geoBoundaries HRV ADM2 (granice općina i gradova) | William & Mary geoLab | CC BY 4.0 | [geoboundaries.org](https://www.geoboundaries.org/) |

Podaci iz Registra koriste se uz navođenje izvora, sukladno Pravilniku o vrstama i sadržaju dozvola za ponovnu uporabu informacija (NN 67/17). `python3 izvori.py` provjerava metapodatke, dozvolu i datum izmjene skupa preko CKAN API-ja Portala.

## Arhitektura

Statična web aplikacija bez poslužitelja i baze: podaci se obrade jednom (Python) i objave kao statične datoteke. Detalji, standardi, mogućnosti integracije i preduvjeti opisani su u [docs/ARHITEKTURA.md](docs/ARHITEKTURA.md).

```
data.gov.hr (CKAN) ─► FINA Registar (CSV) ─┐
geoBoundaries (GeoJSON) ───────────────────┤
                                           ▼
                obrada.py  (smještanje na općinu, ishod nakon isteka)
                izvoz_web.py (sektori, naknade, pojednostavljene granice, CSV)
                                           ▼
           app/data/  podaci.js · granice.js · koncesije.csv
                 │                                  │
     web aplikacija (Vercel, CDN)      mcp/server.py (AI asistenti)
```

## Pokretanje

```bash
# aplikacija (bez build koraka)
python3 -m http.server 8766 --directory app        # http://localhost:8766

# obrada podataka
pip install pandas rapidfuzz
python3 izvori.py                 # provjera izvora na Portalu -> izvori.json
python3 obrada.py koncesije.txt   # -> koncesije.json, opcine.geojson
python3 izvoz_web.py              # -> app/data/podaci.js, granice.js, koncesije.csv
```

`koncesije.txt` je izvoz „Preuzmi sve podatke“ s servisi.fina.hr/regkonc (windows-1250, `;`). Status ugovora (aktivna, ističe, istekla) aplikacija računa prema današnjem datumu u pregledniku, pa ostaje točan i bez ponovne obrade.

Objava: repozitorij je povezan s Vercelom i svaki push na `main` objavljuje mapu `app/` (vidi `vercel.json`).

## MCP server (AI asistent)

`mcp/server.py` je [Model Context Protocol](https://modelcontextprotocol.io) server: JSON-RPC 2.0 preko stdio, samo standardna biblioteka Pythona. Koristi iste podatke kao aplikacija.

| Alat | Što vraća |
|---|---|
| `istjece_uskoro(opcina?, do?, sektor?, limit?)` | Ugovori koji ističu do datuma, po mjesecima i sektorima, s naknadom |
| `profil_opcine(opcina)` | Pokazatelji općine u odnosu na RH i sljedeći istekovi |
| `bez_nastavka(opcina?, sektor?, limit?)` | Popis isteklih bez nastavka ili poredak općina |
| `trazi_koncesionara(upit, limit?)` | Koncesionari po nazivu: ugovori, općine, naknada, sljedeći istek |

```bash
python3 mcp/test_server.py                                         # test protokola
claude mcp add koncesijski-sat -- python3 "$(pwd)/mcp/server.py"   # Claude Code
```

Za Claude Desktop dodajte u `claude_desktop_config.json`:

```json
{ "mcpServers": { "koncesijski-sat": { "command": "python3", "args": ["/puna/putanja/mcp/server.py"] } } }
```

## Videi

| Datoteka | Sadržaj |
|---|---|
| `video/koncesijski_sat.mp4` (+ `_whatsapp`) | Promo, 30 s, bez zvuka (izvor `video/motion.html`) |
| `video/koncesijski_sat_showcase_60s.mp4` (+ `_whatsapp`) | Obilazak aplikacije, 60 s (izvor `video/showcase/`) |

```bash
npm i playwright-core   # + Chromium za Playwright i ffmpeg
node video/render.cjs                                                                      # promo
python3 -m http.server 8766 --directory app & node video/showcase/capture.cjs              # snimke ekrana
node video/render.cjs --html showcase/showcase.html --izlaz koncesijski_sat_showcase_60s.mp4
```

## Korišteni alati i biblioteke

| Alat | Namjena | Licenca |
|---|---|---|
| [Apache ECharts](https://echarts.apache.org) 5.5 | Karta i grafovi | Apache-2.0 |
| [pandas](https://pandas.pydata.org) | Obrada podataka | BSD-3-Clause |
| [RapidFuzz](https://github.com/rapidfuzz/RapidFuzz) | Prepoznavanje naziva općina s tipfelerima | MIT |
| [Playwright](https://playwright.dev), [FFmpeg](https://ffmpeg.org) | Snimke ekrana i render videa | Apache-2.0, LGPL/GPL |
| [Vercel](https://vercel.com) | Statični hosting | (usluga) |
| **Claude Code (Anthropic)** – AI asistent za programiranje | Pomoć pri pisanju koda, dokumentacije i videa; tim je pregledao i provjerio rezultate | (usluga) |

## Daljnji razvoj

1. **Automatsko osvježavanje.** Dnevno preuzimanje registra i ponovna obrada (GitHub Actions). Za to je potreban strojno dostupan izvoz bez reCAPTCHA-e, vidi [Preduvjeti](docs/ARHITEKTURA.md#preduvjeti).
2. **Obavijesti e-poštom.** Davatelj se pretplati na svoju općinu i dobije upozorenje 6 mjeseci prije isteka.
3. **Novi izvori.** Elektronički oglasnik javne nabave (je li natječaj za istek već objavljen), Sudski registar preko OIB-a koncesionara (aktivnost tvrtke) i DZS (broj stanovnika, za usporedbu po glavi).
4. **Točna lokacija.** Povezivanje s katastrom ili registrom pomorskog dobra, da „bez nastavka“ znači određeni prostor, a ne samo općinu.

## Licenca

Kod: [MIT](LICENSE). Obrađeni podaci (`app/data/`) izvedeni su iz Registra koncesija pod Otvorenom dozvolom i iz geoBoundaries (CC BY 4.0); izvore treba navesti pri ponovnoj uporabi.
