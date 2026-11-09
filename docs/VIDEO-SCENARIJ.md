# Video: „Za javna dobra sada je 22:15”

Scenarij za video prezentaciju (3 min, bez glasa, samo tekst i glazba, samo snimke aplikacije i HTML animacije).
Izvor animacije je `video/sat/sat.html`, a snimke aplikacije snima `video/sat/capture-sat.cjs`.
Sve brojke provjerene su u `app/data/podaci.js`, s „danas” = 8. 11. 2026.

## Ideja

Svih **816 ugovora koji ističu u idućih 12 mjeseci** je točka na **jednom satu**. Jedan sat na brojčaniku je jedan mjesec, a ponoć je 31. 12. 2026. Na dan 8. 11. 2026. do ponoći ima još 53 dana, pa sat pokazuje **22:15**.

**Trenutak koji se pamti.** Kazaljka klizi do ponoći, a brojač dana pada na 0. Zatim **jedan takt potpune tišine**. Grozd na broju 12 bljesne: **„312 ugovora ističe u istoj ponoći.”** Od toga 200 točaka odleti na kartu i sleti u Dubrovnik.

**Zakon na istom satu.** Na brojčaniku se iscrta zakonski hodogram za te ugovore: postupak počinje 6 mjeseci prije isteka. Kazaljka na 22:15 već je prošla 3 od 5 koraka.

**Završetak se nadovezuje na početak.** Kazaljka se pomakne do koraka 4 hodograma i u kalendaru stigne podsjetnik iz aplikacije.

Žiri to može prepričati jednom rečenicom: *„Za javna dobra je 22:15, a u ponoć 31. 12. ističe 312 koncesija odjednom.”*

## Scenarij (182 s)

**A** = snimka aplikacije, **H** = HTML animacija, **P** = maketa planiranog, označena „PLANIRANO · u razvoju”.

| s | Scena | Tekst na ekranu | Slika | Izvor |
|---|---|---|---|---|
| 0–7 | Otkucaj | „Svaki ugovor o koncesiji ima rok.” | Obod brojčanika iscrta se jednim potezom, jedna točka pulsira. | H |
| 7–17 | Sat se puni | „1 sat = 1 mjesec …” → „816 ugovora · ≈1,65 mil. € godišnje naknade” | 816 stvarnih točaka sleti na obod: položaj = istek, veličina = naknada, boja = sektor. | H |
| 17–25 | 22:15 | „Za javna dobra sada je 22:15.” → „Ponoć = 31. 12. 2026. · još 53 dana” | Kazaljka na 22:15. | H |
| 25–37 | Ponoć | brojač 53 → 0 · **tišina** · „312 ugovora ističe u istoj ponoći.” · „200 izdala Lučka uprava Dubrovnik · medijan 398 €/god.” | Grozd bljesne, 200 točaka odleti u Dubrovnik na karti. | H |
| 37–49 | Nakon ponoći | „Nakon isteka: novi ugovor – ili tišina.” → „47 % isteklih: u registru nema novog ugovora iste vrste.” (5.206 od 11.082) | Kazaljka se vrti unatrag kroz godine; udio se broji uživo. | H |
| 49–57 | Pošteno | definicija „bez nastavka” → „Signal za provjeru, ne dokaz nepravilnosti.” | Kartica, sat zamućen. | H |
| 57–67 | Tko gleda na sat | Općina i lučka uprava · Ministarstvo i Državna revizija · Koncesionar · Građani i novinari (ZPPI) | Četiri pločice se stope u logo. | H |
| 67–81 | Hodogram na satu | „Zakon: postupak počinje 6 mjeseci prije isteka.” → „Za 312 ugovora iz ponoći: 3 od 5 koraka već kasne.” | Unutarnji prsten od −6 mj. do ponoći, prošli dio crven; 5 koraka (povjerenstvo, procjena, objava u EOJN, odluka, novi ugovor). | H |
| 81–88 | Karta | „Svaka općina ima svoje vrijeme.” | Karta, pokazatelj „Naknada koja ističe”, hover Dubrovnik. | A |
| 88–96 | Profil i pretplata | „Pretplata na rokove: kalendar koji se sam osvježava.” | Profil Grada Dubrovnika s podacima DZS/Porezne/JPT, zatim prozor „Pretplata na rokove”. | A |
| 96–110 | AI namjena | „Klik na ugovor …” → „✨ AI otkriva stvarnu namjenu.” | Pretraga „liburnia”, klik na redak, AI sažetak: „Koncesija na pomorskom dobru” → hotelska plaža uz resort. | A |
| 110–120 | Hodogram ugovora | „Hodogram za taj ugovor: 4 od 5 rokova je prošlo.” | Zakonski hodogram u prozoru ugovora (Liburnia, istek 1. 12. 2026.). | A |
| 120–128 | Dopis i ZPPI | „Gotov dopis službeniku – ili ZPPI zahtjev za građane.” | Generator dopisa, zatim ZPPI s adresom iz `jpt.gov.hr`. | A |
| 128–141 | Rizici i revizija | „Rizici i revizija …” → „Fiskalni rizik: koliko € po stanovniku ističe u 12 mjeseci.” | Tablica anomalija, zatim koncesionari po OIB-u i fiskalni rizik općina. | A |
| 141–151 | MCP | „Pitajte običnim jezikom.” | Chat sa stvarnim izlazom `istjece_uskoro` (203 ugovora, 163.797 €); 5 alata. | H (stvarni izlaz) |
| 151–165 | Mehanizam | „5 skupova s data.gov.hr, povezanih po OIB-u.” → „Jedan redak: Opatija → AI namjena → naknada” → Preduvjeti T/O/P | Zupčanici: Registar koncesija, Javnopravna tijela (živi API), Popis 2021., Adresar tijela, Porez na dohodak, granice općina, web + MCP. | H |
| 165–173 | PLANIRANO | „Sljedeći zupčanici” | Dnevno osvježavanje, e-mail obavijesti, EOJN, Sudski registar, katastar. | P |
| 173–182 | Budilica | podsjetnik „[Hodogram koncesije] 4. Odluka o davanju koncesije …” → „Concessum pokazuje sat – i navije budilicu.” | Kazaljka 22:15 → 23:00 (1. 12. 2026.), obavijest, logo i URL. | H |

## Brojke i izvori (danas = 8. 11. 2026.)

- 816 ističe u 12 mj., 1.647.156 € fiksne naknade; 5.114 aktivnih; 521 u 6 mj.
- 312 ugovora ističe 31. 12. 2026.; 200 ih je izdala Lučka uprava Dubrovnik (medijan 398 €/god.).
- 47 % = 5.206 od 11.082 isteklih prije više od 12 mj. (bez zdravstva, taksija i pogrebnih poslova).
- Hodogram (`app.js`, `zakonskiKoraci`): koraci −6, −4, −3, −1 i 0 mjeseci. Za 31. 12. 2026. koraci 1–3 su prije 8. 11., korak 4 pada na 1. 12. 2026.
- Liburnia Riviera Hoteli d.d., Opatija: „Koncesija na pomorskom dobru” → AI: hotelska / kamp plaža uz resort; 23.461 €/god.; istek 1. 12. 2026.; 4 od 5 koraka hodograma su prošla.
- Grad Dubrovnik do 31. 12. 2026.: 203 ugovora, 163.797 € (MCP `istjece_uskoro`).

## Što još treba

- Glazba (CC0 ili royalty-free), s tišinom na 0:28: `ffmpeg -i concessum_nacrt.mp4 -i glazba.mp3 -c:v copy -c:a aac -af "afade=t=in:d=1,afade=t=out:st=179:d=3,volume=0:enable='between(t,28,29)'" -shortest concessum_video.mp4`
- Imena obrtnika na snimkama se mute u `capture-sat.cjs`, ali aplikacija sama prikazuje imena fizičkih osoba u AI sažetku profila općine (npr. Dubrovnik). To treba riješiti u aplikaciji.
