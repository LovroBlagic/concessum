# Video v2 – „Za javna dobra sada je 22:15” (predaja, 3:00)

Upute za nastavak rada na videu (čovjek ili Claude). Sve naredbe se pokreću iz korijena repozitorija.

## Što je gotovo

| Datoteka | Što je |
|---|---|
| `video/v2/v2.html` | Kompozicija videa (1920×1080, 30 fps, 180 s). Uvod sa satom (0–52 s) je HTML/canvas animacija, obilazak aplikacije (52–129 s) su stvarne snimke sučelja u 3D okviru, a zatim MCP, mehanizam (5 izvora), planirano i kraj. |
| `video/v2/snimi.cjs` | Snima stvarne animacije aplikacije (CDP screencast) u `video/v2/isjecci/<ime>.mp4`: `karta`, `tri` (3D sat), `ugovor` (AI, hodogram, dopis, ZPPI), `profil` (i pretplata), `revizija`. Imena obrtnika i fizičkih osoba se automatski mute. |
| `video/v2/naracija.mjs` | Postavlja naraciju na mjesto (17 blokova s vremenima), dodaje glazbu (ponavljanje s pretapanjem, utišavanje ispod glasa, tišina u ponoć) i daje `video/concessum_v2_naracija.mp4`. |
| `video/render.cjs` | Renderira bilo koju kompoziciju s `window.renderFrame` u MP4 (Playwright + ffmpeg). |
| `video/sat/sat.html` | Prvi video (v1, 182 s), iz kojeg v2 preuzima animacije sata. v2 ga ne učitava, nego je kopija preslikana na novi vremenski tijek. |
| `docs/NARACIJA-V2.md` | Tekst naracije s vremenima, za čitanje. |
| `docs/VIDEO-SCENARIJ.md` | Scenarij i provjerene brojke. |

Glazba (`video/v2/glazba.mp3`), snimljeni isječci (`video/v2/isjecci/`) i gotovi MP4 nisu u gitu (veliki su i dio nije naš). Nalaze se u zipu koji ste dobili; raspakirajte ga u korijen repozitorija.

## Preduvjeti

- macOS s Google Chromeom (`/Applications/Google Chrome.app`), Node 18+, Python 3, ffmpeg (`brew install ffmpeg`).
- `cd video && npm i --no-save playwright-core@1.48.2`.
- Za TTS: macOS `say` s hrvatskim glasom „Lana” (System Settings → Accessibility → Spoken Content).

```bash
export CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
python3 -m http.server 8766 --directory app &      # aplikacija za snimanje
```

## Naredbe

```bash
node video/v2/snimi.cjs                       # ponovno snimi sve isječke (ili: node video/v2/snimi.cjs ugovor)
node video/render.cjs --html v2/v2.html --kadrovi 20,55,90,135   # probni kadrovi -> video/provjera_v2/
node video/render.cjs --html v2/v2.html --izlaz concessum_v2.mp4  # cijeli video bez zvuka (~15 min)
node video/v2/naracija.mjs                    # glas + glazba -> video/concessum_v2_naracija.mp4
```

Snimke glasa: `video/v2/glas/b01.m4a` … `b17.m4a` (ili `.wav`/`.mp3`). Svaka postojeća snimka zamijeni TTS za taj blok, a skripta javi ako je preduga za svoj prozor.

## Snimanje naracije vlastitim glasom (video/naracija.html)

Alat po uzoru na eSidro i eVijećnicu: pušta video s glazbom ispod svakog bloka, vodi tempo kroz tekst, snima blokove b01–b17 (spremaju se u pregledniku) i izvozi jedan `naracija.wav` poravnat s videom.

```bash
python3 video/naracija_app.py                        # tekst i vremena iz za_snimanje/TEKST-ZA-SNIMANJE.txt -> video/naracija.html
cd video && npx -y http-server -p 8765 -s            # http://localhost:8765/naracija.html (mikrofon radi samo na localhostu)
node video/v2/naracija.mjs --wav ~/Downloads/naracija.wav   # -> video/concessum_v2_naracija.mp4 (glas + glazba)
```

Treba `video/concessum_v2.mp4` (slika) i `video/concessum_v2_glazba.mp4` (slika + glazba, za snimanje). Nisu u gitu.

## Kako je v2.html složen (važno za izmjene)

- **Vrijeme:** `staro(t)` preslikava novo vrijeme na vremenski tijek iz `sat.html` (tablica `MAPA`). Animacije sata, MCP-a, mehanizma i kraja crtaju se starim funkcijama s preslikanim vremenom, pa se tempo pojedinog dijela mijenja u `MAPA`, a ne u funkcijama.
- **Naslovi:** kartice teksta (`KARTICE`) i naslovi iznad aplikacije (`ISJ[].n`) koriste novo vrijeme.
- **Obilazak aplikacije:** tablica `ISJ`. Svaki isječak ima `a`, `b` (vrijeme u videu), `od` (početak u isječku), `zum` ([od, do, x, y, mjerilo] u koordinatama snimke 1600×900) i `n` (naslovi). Prijelaz između ekrana je 3D zakretanje okvira (`PRIJ`).
- **Sat preglednika:** pri snimanju je fiksiran na 8. 11. 2026., pa se brojke (816, 312, 47 %…) slažu s tekstom. Sve brojke u animaciji računaju se iz `app/data/podaci.js`.
- Ako se promijeni vremenski raspored, uskladite `od`/`do` u `naracija.mjs` i tablicu u `docs/NARACIJA-V2.md`.

## Što još nije napravljeno

- Snimka pravog glasa (tekst je u zipu i u `docs/NARACIJA-V2.md`); dotad se koristi TTS „Lana”.
- Glazba „Olson” (Boards of Canada) je zaštićena autorskim pravom. Za javnu objavu razmislite o glazbi s licencom.
- Aplikacija u AI sažetku profila općine (npr. Dubrovnik) prikazuje ime i prezime obrtnika. U videu je zamućeno, ali u aplikaciji bi to trebalo ukloniti.
