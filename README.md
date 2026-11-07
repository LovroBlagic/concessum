# Koncesijski sat

Koje koncesije u Hrvatskoj uskoro ističu, i gdje istekle koncesije ostaju bez nastavka. Pregled po općinama iz Registra koncesija (FINA).

## Pokretanje aplikacije

Statična aplikacija (HTML + JS + ECharts, bez backenda i build koraka):

```bash
python3 -m http.server 8766 --directory app
# http://localhost:8766
```

Ekrani: **Karta** (koropletna karta + poredak općina, izbor pokazatelja i sektora), **Što ističe** (ugovori koji ističu po mjesecima + tablica s pretragom), **Profil općine** (`#opcina/<shapeID>`: brojke, sažetak, ugovori kroz vrijeme, ishod isteklih ugovora, svi ugovori), **Metodologija**.

## Obrada

```bash
pip install pandas rapidfuzz
python obrada.py koncesije.txt   # -> koncesije.json, opcine.geojson
python izvoz_web.py              # -> app/data/podaci.js, app/data/granice.js
```

`izvoz_web.py` grupira vrste koncesija u sektore, izbacuje ugovore s nemogućim datumom isteka i pojednostavljuje granice općina (Douglas-Peucker, ~100 m; 19 MB -> 0,8 MB). Status (aktivna / ističe / istekla) aplikacija računa u odnosu na današnji datum.

## Promo video (30 s, bez zvuka)

`video/koncesijski_sat.mp4` (1920×1080, 30 fps). Izvor je `video/motion.html`: svaki kadar se računa iz vremena, pa je render uvijek isti. Pregled u pregledniku: otvorite `video/motion.html` (reprodukcija) ili `motion.html?t=24` (jedan kadar).

```bash
npm i playwright-core   # treba i Chromium za Playwright te ffmpeg
node video/render.cjs   # -> video/koncesijski_sat.mp4
```

MCP dio u videu je ilustracija koncepta. MCP server još ne postoji; u videu je tako i označen.

## Showcase video (60 s, bez zvuka)

`video/koncesijski_sat_showcase_60s.mp4`: obilazak aplikacije sa stvarnim ekranima (karta, profil općine, što ističe, metodologija, svijetla tema, mobitel).

```bash
python3 -m http.server 8766 --directory app &
node video/showcase/capture.cjs     # snima ekrane i interakcije -> video/showcase/shots/
node video/render.cjs --html showcase/showcase.html --izlaz koncesijski_sat_showcase_60s.mp4
```

Kompozicija (`video/showcase/showcase.html`) ima vremensku crtu kamere, kursora, istaknutih dijelova i natpisa; položaji elemenata dolaze iz `shots/manifest.js`, pa nakon promjene izgleda aplikacije dovoljno je ponovno pokrenuti oba koraka.
