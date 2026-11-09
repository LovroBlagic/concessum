# Concessum

**Koje koncesije u Hrvatskoj uskoro ističu, što je stvarna namjena svake koncesije na terenu, koliki je fiskalni rizik za proračune općina i gdje istekle koncesije ostaju bez nastavka.**
Registar koncesija (FINA) povezan je s **5 otvorenih skupova podataka s Portala otvorenih podataka (`data.gov.hr`)** preko OIB-a i JLS šifri u alat za upravljanje rokovima, AI procjenu stvarne namjene koncesije, reviziju cjenovnih anomalija i automatsku pripremu službenih dopisa.

- **Aplikacija:** https://concessum.vercel.app
- **Izvorni kod:** https://github.com/LovroBlagic/concessum
- **Otvoreni izvoz obrađenih podataka:** https://concessum.vercel.app/data/koncesije.csv
- Datathon Portala otvorenih podataka 2026, izazov **C) Gospodarstvo i učinkovito upravljanje**

## Problem

Kad koncesija istekne prije nego što je proveden novi postupak (koji po Zakonu o koncesijama traje 6 do 9 mjeseci), javno se dobro (vez, hotelska plaža, luka, komunalna usluga) koristi bez ugovora, naknada se ne naplaćuje, a korisnik ne zna hoće li moći nastaviti. Uz to, u Registru koncesija tisuće su ugovora upisane generičkim nazivom (*„Koncesija na pomorskom dobru“*, *„Koncesija za luku“*), pa bez povezivanja s profilom tvrtke i davatelja nije vidljivo radi li se o plaži ispred resorta, benzinskoj postaji na obali, uzgajalištu ribe ili podmorskom kabelu.

| Stanje na dan 8. 11. 2026. (24.667 jedinstvenih ugovora) | |
|---|---|
| Aktivni ugovori (s obradom općinskih + lučkih uprava preko OIB-a JPT-a) | **5.252** (97,3 % smješteno na JLS) |
| Ističe u idućih 6 / 12 mjeseci | **532 / 839** |
| Ugovorena fiksna godišnja naknada ugovora koji ističu u 12 mj. | **≈ 1,85 mil. €** (+ varijabilne naknade na % prihoda) |
| Isteklih ugovora (bez zdravstva) za koje nije sklopljen novi ugovor iste vrste | **53,9 %** (7.571 od 14.035) |
| Aktivni ugovori sa simboličnom naknadom (<15 % medijana kategorije, bez varijabilne naknade) | **380 ugovora** |
| Primjer: Grad Dubrovnik do 31. 12. 2026. | **203 ugovora**, 164 tis. € fiksne naknade |

## Kome je namijenjeno

- **Službenici gradova, općina i lučkih uprava** (davatelji koncesija): rokovi ugovora, **5-koračni zakonski hodogram pripreme natječaja** s izvozom u kalendar (`.ics`) i generator službenog dopisa za pokretanje postupka.
- **Županije, ministarstva i Državna revizija** (nadzor): ekran **Rizici i revizija** otkriva općine koje sustavno ne obnavljaju koncesije, cjenovne anomalije (<15 % medijana namjene), dugoročne ugovore (>30 god.) i koncentraciju koncesija po OIB-u.
- **Koncesionari i investitori:** pregled kada ističu ugovori u njihovom sektoru, koliki je medijan naknade za istu namjenu u RH i puni portfelj ugovora po OIB-u.
- **Novinari, udruge i građani:** **✨ AI sažetak i procjena stvarne namjene** svake koncesije te 1-klik generator **Zahtjeva za pristup informacijama (ZPPI)** adresiranog na službenika za informiranje nadležnog tijela iz `jpt.gov.hr`.

## Funkcionalnosti

| Ekran | Što radi |
|---|---|
| **Karta** | Koropletna karta svih općina po 5 pokazatelja (udio bez nastavka, broj koji ističe, **naknada koja ističe**, aktivne, istekle bez nastavka) i filter po sektoru. Uz kartu je poredak općina, a klik na općinu otvara njezin profil. |
| **Što ističe** | Ugovori koji ističu u 6/12/24/36 mjeseci, po mjesecima i sektorima. Klik na stupac filtrira tablicu na taj mjesec, a klik na bilo koji ugovor otvara **✨ AI sažetak koncesije i zakonski hodogram**. |
| **Rizici i revizija** | Sustav ranog upozorenja i revizije javnog dobra: filteri za **anomalije niske naknade** (<15 % medijana kategorije bez varijabilne naknade), **dugoročne ugovore (>30 g.)**, ugovore **bez upisane naknade**, ljestvica **koncentracije koncesionara po OIB-u** i graf **fiskalnog rizika općina (€ po stanovniku vs. stopa poreza na dohodak)**. |
| **Profil općine** | Pokazatelji općine u odnosu na prosjek RH, povezani podaci s `data.gov.hr` (stanovništvo DZS 2021., stope poreza na dohodak Porezne uprave, kontakti JPT-a i službeni web iz Adresara), ishod isteklih ugovora po sektoru i tablica svih ugovora s AI namjenom i cjelovitim OIB portfeljem. |
| **Metodologija** | Kako se podaci iz 5 izvora spajaju preko OIB-a i JLS-a, kako radi AI klasifikacija stvarne namjene i koja su ograničenja. |

**Za lakše korištenje:**
- **Tražilica općine u zaglavlju.** Prepoznaje i nepotpun naziv („dubrov“ vodi na Dubrovnik).
- **Kratke upute** pri prvom otvaranju.
- **Objašnjenje uz svaki pokazatelj.**
- **Pamti zadnju gledanu općinu.**
- **Preuzmi CSV.** Datoteka se izravno otvara u hrvatskom Excelu (`;` kao razdjelnik, UTF-8 s BOM-om).
- **Pretplata na rokove.** Dvije vrste kalendara sa stalnom adresom: **po davatelju** („moji ugovori“, `/data/kalendar/davatelj/<OIB>.ics`, 351 davatelj) za onoga tko vodi postupak, i **po općini** (`/data/kalendar/<id>.ics`, 477 općina) kao pregled svih ugovora na području. Razlika je bitna: općine same dodjeljuju tek 12 % aktivnih koncesija na svom području (Grad Dubrovnik 13 od 349), ostalo lučke uprave, županije i ministarstva. Službenik kalendar jednom doda u Google, Outlook (Microsoft 365) ili Apple kalendar, a novi rokovi pojavljuju se sami nakon svakog osvježavanja podataka. Ugovori koji ističu istog dana su jedan događaj s popisom i naknadom; 6 mjeseci ranije stoji događaj „pripremiti postupak“. Bez prijave i bez e-adrese, pa nema ni osobnih podataka korisnika.
- **Preuzmi rokove (.ics).** Jednokratna kopija rokova s popisa, s podsjetnikom 6 mjeseci i mjesec dana prije isteka.
- **Ispiši izvještaj.** Profil općine sprema se kao PDF, spreman za vijeće.
- **Radi na mobitelu**, ima svijetlu i tamnu temu, a grafovi imaju tekstualne opise za čitače zaslona.

### ✨ AI sažetak koncesije, zakonski hodogram i generator dopisa (klik na bilo koji ugovor)

Klikom na bilo koji redak u tablicama otvara se dijaloški okvir ugovora s tri modula:
1. **✨ AI sažetak i procjena stvarne namjene:** Iz kombinacije djelatnosti koncesionara (15 poslovnih arhetipova), nacionalnog OIB portfelja ugovora, vrste davatelja iz `jpt.gov.hr` (lučka uprava vs. županija/ministarstvo/grad), lokacije i modela naknade (fiksna + varijabilna naknada na % prihoda) klasificira ugovor u **26 stvarnih namjena** (npr. *Hotelska ili kamping plaža i obalni pojas uz resort*, *Pomorska benzinska postaja (opskrba plovila gorivom)*, *Pomorska agencija i prihvat kruzera*, *Podmorska infrastruktura (kabeli, cjevovodi i ispusti)*) te uspoređuje naknadu s **medijanom iste kategorije u RH**.
2. **Zakonski hodogram postupka (Zakon o koncesijama, NN 69/17, 107/20):** Automatski računa 5 zakonskih koraka unatrag od datuma isteka (*T-9 mj. Stručno povjerenstvo → T-6 mj. Studija opravdanosti → T-4 mj. Odluka predstavničkog tijela → T-3 mj. Objava u EOJN RH → T-1 mj. Odluka o odabiru i mirovanje*), označava koji su koraci već u kašnjenju i omogućuje preuzimanje cijelog hodograma u kalendar (`.ics`).
3. **Generator službenog dopisa i ZPPI zahtjeva (1-klik):**
   - **Za službenike (priprema postupka):** Generira nacrt službenog dopisa za osnivanje stručnog povjerenstva s pravnim temeljem i podacima ugovora.
   - **Za građane i novinare (ZPPI):** Generira formalni *Zahtjev za pristup informacijama* (čl. 18. ZPPI-ja, NN 25/13, 85/15, 69/22) s automatski popunjenom službenom e-mail adresom davatelja koncesije ili općine iz Popisa javnopravnih tijela (`jpt.gov.hr`) i izravnim otvaranjem u klijentu e-pošte.

## Korišteni skupovi podataka (5 skupova s `data.gov.hr` + geoBoundaries)

| Skup | Izdavatelj | Ključ povezivanja | Izvor |
|---|---|---|---|
| **1. Informacije o ugovorenim koncesijama (Registar koncesija)** | FINA / Ministarstvo financija | `OIB_DAVAT`, `OIB_KORIS`, `LOKACIJA` | [data.gov.hr](https://data.gov.hr/ckan/dataset/informacije-o-ugovorenim-koncesijama) → [servisi.fina.hr/regkonc](https://servisi.fina.hr/regkonc/) |
| **2. Popis javnopravnih tijela (JPT)** | Ministarstvo pravosuđa, uprave i digitalne transformacije (MPUDT) | `OIB` davatelja i općine → sjedište, e-mail službenika za informiranje | [data.gov.hr](https://data.gov.hr/ckan/dataset/popis-javnopravnih-tijela) (`jpt.gov.hr` API) |
| **3. Popis stanovništva, kućanstava i stanova 2021.** | Državni zavod za statistiku (DZS) | Naziv i status JLS-a (556 gradova i općina) → izračun naknade per capita | [data.gov.hr](https://data.gov.hr/ckan/dataset/statistika-u-nizu-popis-stanovnistva-kucanstava-i-stanova-2021) |
| **4. Adresar tijela javne vlasti** | MPUDT / Središnji državni ured za razvoj digitalnog društva | OIB i naziv JLS-a → službena web-stranica i kontakti | [data.gov.hr](https://data.gov.hr/ckan/dataset/adresar-tijela-javne-vlasti) |
| **5. Odluke JLS – stope godišnjeg poreza na dohodak (2025./2026.)** | Porezna uprava / Ministarstvo financija | Naziv JLS-a (556/556) → niža i viša stopa poreza na dohodak (fiskalni kontekst) | [data.gov.hr](https://data.gov.hr/ckan/dataset/https-porezna-uprava-gov-hr-hr-odluke-jls-4009) |
| **6. geoBoundaries HRV ADM2** | William & Mary geoLab | `shapeName` / `shapeID` granice općina i gradova (CC BY 4.0) | [geoboundaries.org](https://www.geoboundaries.org/) |

Podaci s Portala koriste se uz navođenje izvora sukladno Pravilniku o vrstama i sadržaju dozvola za ponovnu uporabu informacija (NN 67/17). Skripta `python3 izvori.py` dohvaća metapodatke svih 5 skupova preko CKAN API-ja (`izvori.json`) i gradi povezani registar JPT-a i JLS-ova (`otvoreni_izvori.json`).

## Arhitektura

Statična web aplikacija bez poslužitelja i baze: cijeli cjevovod obrade koristi isključivo standardnu biblioteku Pythona 3 (bez vanjskih ovisnosti) i objavljuje statične datoteke. Detalji, standardi, mogućnosti integracije i preduvjeti opisani su u [docs/ARHITEKTURA.md](docs/ARHITEKTURA.md).

```
data.gov.hr (5 skupova: FINA Registar, MPUDT JPT OIB API, DZS Popis 2021, Adresar TJV, Porezna JLS)
geoBoundaries HRV ADM2 (GeoJSON)
                                           │
                                           ▼
        izvori.py    (CKAN API provjera + spajanje JPT/DZS/Porezna/Adresar -> otvoreni_izvori.json)
        obrada.py    (smještanje 97,3 % ugovora na JLS preko lokacije i OIB-a JPT-a, ishod nakon isteka)
        izvoz_web.py (AI procjena 26 stvarnih namjena, fiksne + varijabilne naknade, OIB portfelji, rizici)
                                           │
                                           ▼
                   app/data/  podaci.js · granice.js · koncesije.csv · kalendar/*.ics
                         │                                  │
             web aplikacija (Vercel, CDN)      mcp/server.py (5 alata za AI asistente)
```

## Pokretanje

```bash
# aplikacija (bez build koraka)
python3 -m http.server 8766 --directory app        # http://localhost:8766

# cjevovod obrade podataka (samo Python 3 standardna biblioteka, bez vanjskih paketa)
python3 izvori.py                 # provjera 5 izvora na data.gov.hr -> izvori.json, otvoreni_izvori.json
python3 obrada.py koncesije.txt   # -> koncesije.json, opcine.geojson (97,3 % smješteno na JLS)
python3 izvoz_web.py              # -> app/data/podaci.js, granice.js, koncesije.csv, kalendar/<shapeID>.ics, kalendar/davatelj/<OIB>.ics
```

## MCP server (AI asistent)

`mcp/server.py` je [Model Context Protocol](https://modelcontextprotocol.io) server: JSON-RPC 2.0 preko stdio, samo standardna biblioteka Pythona. Koristi iste obogaćene podatke kao aplikacija.

| Alat | Što vraća |
|---|---|
| `istjece_uskoro(opcina?, do?, sektor?, limit?)` | Ugovori koji ističu do datuma, po mjesecima i sektorima, s fiksnom/varijabilnom naknadom i AI procjenom stvarne namjene |
| `profil_opcine(opcina)` | Pokazatelji općine u odnosu na RH, povezani otvoreni podaci JLS-a (DZS stanovništvo, stope poreza na dohodak, e-mail službenika za informiranje) i sljedeći istekovi |
| `bez_nastavka(opcina?, sektor?, limit?)` | Popis isteklih bez nastavka ili poredak općina |
| `trazi_koncesionara(upit, limit?)` | Koncesionari grupirani po OIB-u: tip subjekta, stvarne namjene, ugovori, općine, naknada i sljedeći istek |
| `revizija_rizika(opcina?, vrsta_rizika?, limit?)` | Sustav ranog upozorenja: cjenovne anomalije (<15 % medijana kategorije), dugoročni ugovori (>30 g.), ugovori bez naknade, koncentracija po OIB-u i fiskalni rizik po stanovniku |

```bash
python3 mcp/test_server.py                                         # test svih 5 MCP alata
claude mcp add concessum -- python3 "$(pwd)/mcp/server.py"   # Claude Code
```

Za Claude Desktop dodajte u `claude_desktop_config.json`:

```json
{ "mcpServers": { "concessum": { "command": "python3", "args": ["/puna/putanja/mcp/server.py"] } } }
```

## Videi

| Datoteka | Sadržaj |
|---|---|
| `video/koncesijski_sat.mp4` (+ `_whatsapp`) | Promo, 30 s, bez zvuka (izvor `video/motion.html`) |
| `video/koncesijski_sat_showcase_60s.mp4` (+ `_whatsapp`) | Obilazak aplikacije, 60 s (izvor `video/showcase/`) |

## Korišteni alati i biblioteke

| Alat | Namjena | Licenca |
|---|---|---|
| [Apache ECharts](https://echarts.apache.org) 5.5 | Karta i grafovi | Apache-2.0 |
| Python 3 standardna biblioteka (`csv`, `json`, `difflib`, `urllib`) | Cjevovod obrade podataka, AI klasifikator namjena i MCP server bez vanjskih ovisnosti | PSF |
| [Playwright](https://playwright.dev), [FFmpeg](https://ffmpeg.org) | Snimke ekrana i render videa | Apache-2.0, LGPL/GPL |
| [Vercel](https://vercel.com) | Statični hosting | (usluga) |
| **Claude Code (Anthropic)** – AI asistent za programiranje | Pomoć pri pisanju koda, dokumentacije i videa; tim je pregledao i provjerio rezultate | (usluga) |

## Daljnji razvoj

1. **Automatsko osvježavanje.** Dnevno preuzimanje registra i ponovna obrada (GitHub Actions). Za to je potreban strojno dostupan izvoz bez reCAPTCHA-e, vidi [Preduvjeti](docs/ARHITEKTURA.md#preduvjeti).
2. **Obavijesti e-poštom.** Uz postojeću pretplatu na kalendar, i skupna poruka e-poštom (6, 3 i 1 mjesec prije isteka) za korisnike koji ne koriste kalendar. Treba bazu pretplatnika, potvrdu adrese i odjavu (GDPR).
3. **Novi izvori.** Elektronički oglasnik javne nabave (je li natječaj za istek već objavljen), Sudski registar preko OIB-a koncesionara (aktivnost tvrtke) i DZS (broj stanovnika, za usporedbu po glavi).
4. **Točna lokacija.** Povezivanje s katastrom ili registrom pomorskog dobra, da „bez nastavka“ znači određeni prostor, a ne samo općinu.

## Licenca

Kod: [MIT](LICENSE). Obrađeni podaci (`app/data/`) izvedeni su iz 5 otvorenih skupova s Portala otvorenih podataka RH (`data.gov.hr`) pod Otvorenom dozvolom i iz geoBoundaries (CC BY 4.0); izvore treba navesti pri ponovnoj uporabi.
