# Naracija za video v2 (3:00)

Video: `video/concessum_v2.mp4`. Tempo je oko 2,3 riječi u sekundi, mirno i jasno. Rečenica može kasniti pola sekunde, ali ne smije prijeći u sljedeći blok.
Sve brojke su iz podataka (stanje 8. 11. 2026.).

| Vrijeme | Na ekranu | Naracija |
|---|---|---|
| 0:00–0:11 | Sat se puni točkama | Svaki ugovor o koncesiji – vez, plaža, luka, kamenolom – ima rok. Na ovom satu svaka točka je jedan od 816 ugovora koji ističu u idućoj godini. |
| 0:11–0:25 | 22:15, ponoć, tišina, let u Dubrovnik | Za javna dobra sada je 22:15. Ponoć je 31. prosinca. *(stanka na tišini)* U toj jednoj ponoći ističe 312 ugovora – dvjesto ih je izdala Lučka uprava Dubrovnik. |
| 0:25–0:33 | Kazaljka se vrti unatrag, 47 % | A što bude nakon isteka? Za 47 posto ugovora u registru se novi nikad ne pojavi. To je signal za provjeru, ne dokaz. |
| 0:33–0:44 | Hodogram na satu | Zakon o koncesijama traži da postupak počne šest mjeseci prije isteka. Za ugovore iz ponoći tri od pet koraka već kasne. |
| 0:44–0:52 | Sat postaje logo, ulazi aplikacija | Zato smo napravili Concessum – sat za javna dobra, izgrađen na pet skupova s Portala otvorenih podataka. |
| 0:52–1:00 | Karta, fitilj | Ministarstvo i županije na karti vide cijelu Hrvatsku: koliko ugovora ističe u šest i dvanaest mjeseci i gdje ostaju bez nastavka. |
| 1:00–1:19 | 3D sat | 3D sat premota iduće tri godine. Svaki bljesak je ugovor koji upravo ističe, a stup općine pada kako ostaje bez koncesija. Do studenog iduće godine istekne 816 ugovora i 1,6 milijuna eura godišnje naknade. |
| 1:19–1:32 | Što ističe → ugovor → AI | Službenik općine klikne na ugovor. U registru piše samo „koncesija na pomorskom dobru”, a AI iz profila koncesionara prepoznaje hotelsku plažu uz resort i uspoređuje naknadu s medijanom u Hrvatskoj. |
| 1:32–1:38 | Hodogram ugovora | Hodogram po Zakonu o koncesijama pokazuje svih pet koraka. Za ovaj ugovor četiri već kasne. |
| 1:38–1:45 | Dopis i ZPPI | Jednim klikom nastaje službeni dopis za pokretanje postupka, a građani i novinari dobiju gotov zahtjev za pristup informacijama. |
| 1:45–1:59 | Profil općine, pretplata | Profil općine spaja popis stanovništva, porezne stope i službene kontakte. Uz pretplatu na rokove kalendar se sam osvježava – bez prijave i bez e-adrese. |
| 1:59–2:09 | Rizici i revizija | Za reviziju i nadzor, ekran Rizici izdvaja neobično niske naknade, ugovore duže od trideset godina i općine s najvećim fiskalnim rizikom. |
| 2:09–2:19 | MCP chat | Iste podatke može pitati i AI asistent. Koje koncesije u Dubrovniku ističu do kraja godine? Dvjesto tri ugovora, oko 164 tisuće eura. |
| 2:19–2:37 | Mehanizam, 5 izvora, preduvjeti | Ispod je pet otvorenih skupova s data.gov.hr, povezanih po OIB-u: registar koncesija, javnopravna tijela preko živog API-ja, popis stanovništva, adresar tijela i porezne stope. Za dnevno osvježavanje treba strojno čitljiv izvoz registra. |
| 2:37–2:46 | Planirano | Sljedeći koraci: obavijesti e-poštom, provjera objave natječaja u EOJN-u, sudski registar i katastar. |
| 2:46–3:00 | Budilica zvoni, logo | Prvog prosinca stiže podsjetnik: vrijeme je za odluku. Concessum pokazuje sat – i navije budilicu. Na vrijeme. |

## Snimanje i miksanje

- Snimite svaki blok zasebno, pa ga poravnajte na početak bloka. Tako se greška ne prenosi dalje.
- Glazba ispod glasa neka bude oko −18 dB, a u ponoć (0:17,5–0:18,3) potpuna tišina, i u glazbi i u glasu.
- Miksanje: `ffmpeg -i concessum_v2.mp4 -i naracija.wav -i glazba.mp3 -filter_complex "[2]volume=0.18,afade=t=out:st=177:d=3,volume=0:enable='between(t,17.5,18.3)'[g];[1][g]amix=inputs=2:duration=first[a]" -map 0:v -map "[a]" -c:v copy -c:a aac concessum_v2_zvuk.mp4`
