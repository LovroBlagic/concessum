"""Koncesijski sat: izvoz za web aplikaciju s AI klasifikacijom namjene, OIB povezivanjem i detekcijom rizika.

Ulaz:  koncesije.json, opcine.geojson (izlaz obrada.py), koncesije.txt (izvorni CSV), otvoreni_izvori.json (izlaz izvori.py)
Izlaz: app/data/podaci.js (ugovori, AI namjene, OIB portfelji, metapodaci općina i davatelja),
       app/data/granice.js (pojednostavljene granice s ispravljenim nazivima),
       app/data/koncesije.csv (otvoreni izvoz obrađenih podataka, UTF-8)
"""
import csv, json, os, re, statistics, unicodedata
from datetime import date

KORIJEN = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(KORIJEN, "app", "data")
os.makedirs(OUT, exist_ok=True)
TOL = 0.0012      # Douglas-Peucker tolerancija u stupnjevima (~100 m)
DEC = 4           # zaokruživanje koordinata

# Sektori: grupiranje ~160 vrsta koncesija u čitljive skupine
SEKTORI = [
    ("luke", "Luke", r"luk|lučk"),
    ("pomorsko", "Pomorsko dobro i marikultura", r"pomorsk|plaž|morsk|školjk"),
    ("zdravstvo", "Zdravstvo", r"zdravstven"),
    ("komunalno", "Komunalne djelatnosti", r"komunal|dimnjač|pogreb|taksi|otpad|fekali|groblj|parkir|tržnic|rasvjet|prijevoz|javn[ei]h? površin|nužnik|dezinf|deratiz|nerazvrstan|ukrašavanj|reklam|oglasn|mirovanj"),
    ("rudarstvo", "Rudarstvo i ugljikovodici", r"eksploata|istraž|ugljikovodik|nafte|plin|kamen|pijes|šljun|mineral|glin|rudn"),
    ("vode", "Vode", r"vod[aeo]|vodn|izvor|termal|mineraln"),
    ("mediji", "Radio i televizija", r"radij|televizij|elektroničk.{0,20}medij"),
    ("poljoprivreda", "Poljoprivreda, šume i lov", r"poljoprivred|šum|lov|ribolov|zemljišt"),
    ("promet", "Ceste i telekomunikacije", r"cest|telekomunik|pokretn|žičar"),
    ("turizam", "Turizam, kultura i igre na sreću", r"turist|kultur|muzej|ronj|igara na sreću|casin|sport|sajm"),
    ("ostalo", "Ostalo", r".*"),
]

# Tipovi subjekata koncesionara (za AI sažetak i portfelj)
TIPOVI_SUBJEKATA = [
    "Hotelsko-turistička kuća / resort",          # 0
    "Naftna i energetska kompanija",              # 1
    "Marina / nautički centar",                   # 2
    "Putnička agencija / brodar",                 # 3
    "Komunalno i ekološko društvo",               # 4
    "Javno infrastrukturno poduzeće",             # 5
    "Marikultura i ribarstvo",                    # 6
    "Rudarstvo i mineralne sirovine",             # 7
    "Brodogradilište / pomorski servis",          # 8
    "Sportski klub / udruga građana",             # 9
    "Zdravstvena ustanova / ordinacija",          # 10
    "Medijski nakladnik (radio/TV)",              # 11
    "Ugostiteljski / trgovački subjekt",          # 12
    "Trgovačko društvo (d.o.o. / d.d.)",          # 13
    "Obrt ili fizička osoba",                     # 14
]

# 26 AI kategorija stvarne namjene ugovora: (kod, kratki_naziv, ikona, ai_objasnjenje)
NAMJENE_DEF = [
    ("hotel_plaza", "Hotelska / kamp plaža uz resort", "🏖️",
     "Koncesionar je hotelsko-turistička tvrtka ili kamp, pa se općenita koncesija na pomorskom dobru u naravi odnosi na uređenu plažu, kupalište, sunčalište i obalni pojas neposredno ispred hotela, kampa ili turističkog naselja."),
    ("marina", "Marina za nautički turizam", "⚓",
     "Koncesionar upravlja lukom posebne namjene – marinom za nautički turizam (komercijalni vezovi na pontonima, priključci, čuvanje i prateće usluge za jahte i jedrilice)."),
    ("sportska_lucica", "Sportska lučica (klub / udruga)", "⛵",
     "Koncesionar je sportsko-ribolovno društvo ili jedriličarski klub, pa se koncesija odnosi na lučicu posebne namjene s vezovima za članove udruge i sportske aktivnosti."),
    ("bunker_gorivo", "Obalna benzinska postaja za plovila", "⛽",
     "Koncesionar je naftni ili energetski distributer, pa se koncesija u luci ili na pomorskom dobru odnosi na obalnu postaju za opskrbu brodova i jahti gorivom (bunker stanicu)."),
    ("energetska_obala", "Industrijski energetski terminal / cjevovod", "🏭",
     "Koncesija obuhvaća industrijsku luku posebne namjene, terminal za prekrcaj energenata ili podmorske cjevovode uz rafineriju/skladište."),
    ("putnicki_prihvat", "Linijski promet i prihvat kruzera / izletnika", "🚢",
     "Koncesionar je brodar ili putnička agencija (DMC); u javnim lukama radi se o sporednoj lučkoj djelatnosti prihvata, ukrcaja i transfera putnika s kruzera i izletničkih brodova."),
    ("lucka_ekologija", "Prihvat brodskog otpada i DDD u luci", "♻️",
     "Koncesionar je specijalizirana tvrtka za sanitarnu zaštitu i ekologiju; koncesija u luci odnosi se na prihvat brodskog otpada, zauljenih voda, sprječavanje onečišćenja mora ili DDD poslove."),
    ("lucka_opskrba", "Prekrcaj tereta, shipchandler i lučki servisi", "📦",
     "Gospodarska djelatnost u javnoj ili teretnoj luci: opskrba brodova namirnicama i opremom (shipchandler), kontrola tereta, tegljenje, peljarenje ili prekrcaj robe."),
    ("brodogradiliste", "Brodogradilište, navoz i remont plovila", "🛠️",
     "Luka posebne namjene ili dio lučkog područja namijenjen gradnji, izvlačenju (travel-lift/navoz), remontu i servisiranju plovila."),
    ("marikultura", "Uzgajalište morske ribe i školjkaša", "🐟",
     "Koncesija na pomorskom dobru za akvakulturu: kavezno uzgajalište bijele ili plave ribe na moru ili park za uzgoj školjkaša (dagnje, kamenice) s operativnim vezom."),
    ("pomorska_infra", "Podmorska javna infrastruktura (ispust/kabel)", "🔌",
     "Posebna upotreba pomorskog dobra za javnu komunalnu, energetsku ili komunikacijsku mrežu: podmorski ispust odvodnje, vodovod, podmorski energetski/optički kabel ili oceanografska postaja."),
    ("plazni_ugostitelj", "Plažni objekt (beach bar, terasa, kiosk)", "🍹",
     "Koncesija na plaži ili rivi za ugostiteljski objekt (beach bar, terasa restorana/kafića), kiosk ili prateću turističko-trgovačku ponudu uz obalu."),
    ("plaza_rekreacija", "Uređena plaža, ležaljke i rekreativna plovila", "🏖️",
     "Gospodarsko korištenje uređene ili prirodne plaže: iznajmljivanje ležaljki i suncobrana, pedaline, kajaci, SUP daske, vodeni park ili manji plažni sadržaji."),
    ("lucka_djelatnost", "Sporedna gospodarska djelatnost u luci", "⚓",
     "Koncesija koju dodjeljuje lučka uprava za obavljanje pratećih gospodarskih usluga unutar lučkog područja (servis opreme, privez, čuvanje plovila ili uslužne djelatnosti)."),
    ("taksi", "Autotaksi prijevoz putnika", "🚕",
     "Koncesija grada ili općine za obavljanje autotaksi prijevoza putnika i korištenje javnih taksi-stajališta na području jedinice lokalne samouprave."),
    ("dimnjacar", "Dimnjačarska služba po rajonima", "🏠",
     "Komunalna koncesija za obveznu kontrolu, čišćenje i ispitivanje dimovodnih objekata i uređaja za loženje na definiranom dimnjačarskom području općine ili grada."),
    ("pogrebno", "Pogrebni poslovi i prijevoz pokojnika", "⚱️",
     "Komunalna koncesija za obavljanje pogrebnih poslova, održavanje groblja ili prijevoz pokojnika na području općine ili grada."),
    ("septicke", "Crpljenje i odvoz iz septičkih jama", "🚛",
     "Komunalna koncesija za crpljenje, odvoz i zbrinjavanje fekalija iz septičkih i sabirnih jama u naseljima bez javne kanalizacije."),
    ("otpad", "Skupljanje i zbrinjavanje otpada", "🗑️",
     "Koncesija za javnu uslugu skupljanja, odvoza i oporabe komunalnog, ambalažnog ili posebnog otpada."),
    ("parking", "Naplata parkiranja i premještanje vozila", "🅿️",
     "Koncesija za organizaciju i naplatu parkiranja na javnim parkiralištima ili obavljanje poslova premještanja nepropisno parkiranih vozila (pauk-služba)."),
    ("javne_povrsine", "Javne površine, tržnice i oglasni panoi", "🪧",
     "Koncesija za postavljanje reklamnih i oglasnih panoa (billboarda), upravljanje tržnicom na malo ili korištenje javnih gradskih površina."),
    ("distribucija_energije", "Distribucija plina, topline ili javna rasvjeta", "⚡",
     "Energetska i komunalna koncesija za distribuciju prirodnog plina na lokalnoj mreži, opskrbu toplinskom energijom ili energetsku obnovu javne rasvjete."),
    ("javni_prijevoz_tk", "Javni prijevoz putnika, žičara ili TK mreža", "🚌",
     "Koncesija za javni linijski prijevoz putnika (autobusni/obalni), upravljanje žičarom ili uporabu radijskih frekvencija u javnim telekomunikacijama."),
    ("ugljikovodici", "Istraživanje i eksploatacija nafte, plina ili geotermala", "🛢️",
     "Državna koncesija / dozvola za istraživanje i eksploataciju ugljikovodika (nafte i prirodnog plina) ili geotermalnih voda u energetskim poljima."),
    ("kamenolom_rudnik", "Kamenolom ili eksploatacijsko polje sirovina", "🪨",
     "Rudarska koncesija za eksploataciju mineralnih sirovina: tehničko-građevni i arhitektonski kamen, građevni pijesak i šljunak, ciglarska glina ili karbonatne sirovine."),
    ("javna_vodoopskrba", "Zahvaćanje voda za javnu vodoopskrbu", "🚰",
     "Vodopravna koncesija javnom isporučitelju vodnih usluga za zahvaćanje podzemnih ili izvorskih voda radi distribucije pitke vode građanima."),
    ("punjenje_vode", "Crpljenje izvorske i mineralne vode za tržište", "🍾",
     "Koncesija za crpljenje prirodne izvorske, mineralne ili termalne vode radi punjenja u boce i komercijalne prodaje na tržištu."),
    ("hidroenergija", "Korištenje vodne snage za hidroelektrane", "🌊",
     "Koncesija za korištenje vodne snage vodotoka i akumulacija radi proizvodnje električne energije u velikim ili malim hidroelektranama."),
    ("voda_poljoprivreda", "Zahvaćanje voda za navodnjavanje i ribnjake", "🌾",
     "Koncesija za zahvaćanje površinskih ili podzemnih voda za melioracijsko navodnjavanje poljoprivrednih površina ili slatkovodne ribnjake."),
    ("tehnoloska_voda", "Zahvaćanje voda za industriju i hlađenje", "💧",
     "Koncesija za zahvaćanje voda za tehnološke, rashladne ili proizvodne potrebe u industrijskim pogonima, toplanama i turizmu."),
    ("mediji_rtv", "Emitiranje radijskog ili televizijskog programa", "📻",
     "Koncesija Agencije za elektroničke medije (AEM) za obavljanje djelatnosti radija ili televizije na lokalnoj, županijskoj ili nacionalnoj razini."),
    ("loviste", "Pravo lova u državnom lovištu", "🦌",
     "Koncesija Ministarstva poljoprivrede za pravo lova i uzgoj divljači u lovištima u vlasništvu Republike Hrvatske."),
    ("poljoprivredno_zemljiste", "Korištenje državnog poljoprivrednog zemljišta", "🚜",
     "Dugogodišnja koncesija za gospodarsko korištenje poljoprivrednog zemljišta u vlasništvu Republike Hrvatske."),
    ("igre_na_srecu", "Priređivanje igara na sreću (kasina / automat-klubovi)", "🎰",
     "Koncesija Ministarstva financija za priređivanje posebnih igara na sreću u kasinima ili automat-klubovima."),
    ("kulturno_dobro", "Gospodarsko korištenje kulturnog dobra", "🏛️",
     "Koncesija za gospodarsko korištenje zaštićenog kulturnog dobra, povijesne građevine ili muzejske zbirke."),
    ("ordinacija", "Ordinacija primarne zdravstvene zaštite (HZZO)", "🏥",
     "Koncesija županije ili Grada Zagreba za obavljanje javne zdravstvene službe (obiteljska, dentalna, pedijatrijska ili ginekološka ordinacija u mreži HZZO-a; sustav je zakonski preoblikovan)."),
    ("zdrav_njega", "Zdravstvena njega i rehabilitacija u kući", "🩺",
     "Koncesija za obavljanje djelatnosti zdravstvene njege i fizikalne terapije u kući pacijenta u mreži javne zdravstvene službe."),
    ("ostalo_komunalno", "Lokalna komunalna ili uslužna koncesija", "📋",
     "Ugovor o koncesiji za obavljanje lokalnih komunalnih, uslužnih ili infrastrukturnih poslova prema odluci davatelja."),
]
NAMJENA_IDX = {kod: i for i, (kod, _, _, _) in enumerate(NAMJENE_DEF)}

# Popravak tipfelera iz geoBoundaries HRV ADM2
ISPRAVAK_NAZIVA = {
    "Općina Hvratska Dubica": "Općina Hrvatska Dubica",
    "Opicina Muter-Kornati": "Općina Murter-Kornati",
    "Opicina Pirovac": "Općina Pirovac",
    "Općina Veliki Pisanica": "Općina Velika Pisanica",
    "Općina Magdenovac": "Općina Magadenovac",
    "Općina Donji Kukuzari": "Općina Donji Kukuruzari",
    "Grad Ivanić Grad": "Grad Ivanić-Grad",
    "Otok Losinj": "Grad Mali Lošinj (Lošinj)",
    "Otok Krk": "Otok Krk (Grad Krk i općine)",
}


def sektor(vrsta):
    v = vrsta.lower()
    for kod, _, rx in SEKTORI:
        if re.search(rx, v):
            return kod
    return "ostalo"


def datum(s):
    if not s or not re.match(r"^(19|20)\d\d-", s):
        return None
    return s


def odredi_tip_subjekta(kor_naziv, vrsta_konc):
    k = (kor_naziv or "").upper()
    v = (vrsta_konc or "").lower()
    if any(w in k for w in ["ORDINACIJ", "POLIKLINIK", "LJEKARN", "ZDRAVSTVEN", "DOM ZDRAVLJA", "DR. MED", "DENT."]) or "zdravstven" in v:
        return 10
    if any(w in k for w in ["HOTEL", "VALAMAR", "MAISTRA", "PLAVA LAGUNA", "LIBURNIA RIVIERA", "TURISTHOTEL", "IMPERIAL RIVIERA", "ARENA HOSPITALITY", "SUNČANI HVAR", "JADRANKA TURIZAM", "AMINESS", "FALKENSTEINER", "SOLARIS", "KAMP", "CAMP", "RESORT", "LAGUNA NOVIGRAD", "ISTRATURIST", "RIVIJERA", "HTP ", "HUP-ZAGREB", "ADRIATIC LUXURY", "MASLINICA D.O.O.", "ILIRIJA D.D.", "MODRA ŠPILJA", "JADRAN D.D.", "MEDORA", "RADISSON", "LAUS", "PUNTA SKALA", "VALALTA", "KOVAČINE", "MON PERIN", "HADRIA", "TURIZAM"]):
        return 0
    if any(w in k for w in ["INA ", "INA-", "INA,", "CRODUX", "LUKOIL", "ADRIA OIL", "PETROL", "TIFON", "JANAF", "PLINACRO", "LNG ", "VERMILION", "ASPECT CROATIA", "APIOS", "GEOTERMAL"]):
        return 1
    if any(w in k for w in ["ACI D.D", "ACI ", "MARINA ", "NAUTIKA", "NAUTIČKI", "NAUTICKI", "YACHT", "JAHT", "LUČICA", "LUCICA", "TEHNOMONT MARINA", "OLIVE ISLAND", "FRAPA", "DOGANSA", "BAOTIĆ", "D-MARIN", "MITAN MARINA"]):
        return 2
    if any(w in k for w in ["TRAVEL", "TOURS", "TOURIST", "TURISTIČKA AGENCIJA", "PUTNIČKA AGENCIJA", "DESTINATION MANAGEMENT", "DMC", "GULLIVER", "ATLAS", "EXCURSION", "CRUISE", "KRUZER", "JADROLINIJA", "KRILO", "TP LINE", "CATAMARAN", "RAPSKA PLOVIDBA", "MSC "]):
        return 3
    if any(w in k for w in ["VODOVOD", "ODVODNJA", "KANALIZACIJ", "VODOOPSKRB", "HEP", "OPERATOR PRIJENOSNOG", "OPERATOR DISTRIBUCIJSKOG", "TELEKOM", "HT ", "HIDROMETEOROLOŠKI", "HRVATSKE VODE", "HRVATSKE CESTE", "HRVATSKE ŠUME", "PONIKVE", "PRAGRANDE"]):
        return 5
    if any(w in k for w in ["CIAN", "DEZINSEKCIJA", "IND-EKO", "CIKLON", "EKO-", "EKO ", "SANITAR", "ČISTOĆA", "CISTOCA", "OTPAD", "KOMUNAL", "GRABOV RAT", "MAKARSKA OBALA", "RIJEKATANK", "SORDES", "DIMNJAČAR", "POGREB"]):
        return 4
    if any(w in k for w in ["CROMARIS", "MARIKULTURA", "ŠKOLJK", "SKOLJK", "KALI TUNA", "PELAGOS", "RIBARSKA", "RIBARSTVO", "SARDINA", "UZGOJ RIBE", "AKVAKULTUR", "SEASHELL", "OSTRIGA"]):
        return 6
    if any(w in k for w in ["KAMEN", "HOLCIM", "CEMEX", "NEXE", "PIJESAK", "ŠLJUNAK", "RUDA", "MINERAL", "OPEKA", "IGM ", "RADLOVAC"]):
        return 7
    if any(w in k for w in ["BRODOGRAD", "SHIPYARD", "REMONT", "ULJANIK", "3. MAJ", "BRODOTROGIR", "LENAC", "TEHNOMONT", "NAVAR", "SERVIS PLOVILA", "RADEŽ", "GREBEN", "ISKRA ", "BRODOSPAS", "POMORSKI SERVIS"]):
        return 8
    if any(w in k for w in ["ŠPORTSK", "SPORTSK", "JEDRILIČAR", "JEDRILICAR", "RIBOLOV", "ŠRD", "PŠRD", "KŠR", "KLUB", "DRUŠTVO", "UDRUGA", "SAVEZ", "LOVAČK"]):
        return 9
    if any(w in k for w in ["RADIO ", "TELEVIZIJA", "TV ", "MEDIJI", "ANTENA ", "HRT"]):
        return 11
    if any(w in k for w in ["CAFFE", "CAFE", "BAR", "BISTRO", "RESTORAN", "KONOBA", "PIZZERIA", "FAST FOOD", "UGOSTITELJ", "PEKARA", "TRGOVINA", "KONZUM", "STUDENAC", "TISAK", "CASINO", "AUTOMAT"]):
        return 12
    if re.search(r"\b(D\.?\s*O\.?\s*O|D\.?\s*D|J\.?\s*D\.?\s*O\.?\s*O|K\.?\s*D|G\.?\s*I\.?\s*U|KFT|PODRUŽNICA|ZADRUGA|USTANOVA|GRAD |OPĆINA )\b", k):
        return 13
    return 14


def klasificiraj_namjenu(dav, kor, vrsta, lok):
    d, k, v, l = (dav or "").upper(), (kor or "").upper(), (vrsta or "").lower(), (lok or "").upper()
    if "zdravstven" in v or any(w in k for w in ["ORDINACIJ", "POLIKLINIK", "LJEKARN", "ZDRAVSTVENU NJEGU", "DOM ZDRAVLJA"]):
        if "njegu u kući" in k.lower() or "njega u kuci" in k.lower():
            return "zdrav_njega"
        return "ordinacija"
    if any(w in v for w in ["pomorsk", "luku", "luka", "lučk", "plaž", "morsk", "školjk"]):
        if "uzgoj" in v or "školjk" in v or "marikultur" in v or any(w in k for w in ["CROMARIS", "MARIKULTURA", "ŠKOLJK", "SKOLJK", "KALI TUNA", "PELAGOS", "RIBARSKA", "RIBARSTVO", "SARDINA", "UZGOJ RIBE", "AKVAKULTUR", "SEASHELL", "OSTRIGA"]):
            return "marikultura"
        if any(w in k for w in ["HOTEL", "VALAMAR", "MAISTRA", "PLAVA LAGUNA", "LIBURNIA RIVIERA", "TURISTHOTEL", "IMPERIAL RIVIERA", "ARENA HOSPITALITY", "SUNČANI HVAR", "JADRANKA TURIZAM", "AMINESS", "FALKENSTEINER", "SOLARIS", "KAMP", "CAMP", "RESORT", "LAGUNA NOVIGRAD", "ISTRATURIST", "RIVIJERA", "HTP ", "HUP-ZAGREB", "ADRIATIC LUXURY", "MASLINICA D.O.O.", "ILIRIJA D.D.", "MODRA ŠPILJA", "JADRAN D.D.", "MEDORA", "RADISSON", "LAUS", "PUNTA SKALA", "VALALTA", "KOVAČINE", "MON PERIN", "HADRIA"]):
            return "hotel_plaza"
        if any(w in k for w in ["INA ", "INA-", "INA,", "CRODUX", "LUKOIL", "ADRIA OIL", "PETROL", "TIFON", "JANAF", "PLINACRO", "LNG ", "APIOS"]):
            if "KOSTRENA" in l or "OMIŠALJ" in l or "JANAF" in k or "LNG " in k:
                return "energetska_obala"
            return "bunker_gorivo"
        if any(w in k for w in ["ACI D.D", "ACI ", "MARINA ", "NAUTIKA", "NAUTIČKI", "NAUTICKI", "YACHT", "JAHT", "LUČICA", "LUCICA", "TEHNOMONT MARINA", "OLIVE ISLAND", "FRAPA", "DOGANSA", "BAOTIĆ", "D-MARIN", "MITAN MARINA"]):
            return "marina"
        if any(w in k for w in ["ŠPORTSK", "SPORTSK", "JEDRILIČAR", "JEDRILICAR", "RIBOLOV", "ŠRD", "PŠRD", "KŠR", "KLUB", "DRUŠTVO ZA ŠPORT", "PLIVAČK", "VATERPOL", "VESLAČK", "RONILAČK"]):
            return "sportska_lucica"
        if any(w in k for w in ["BRODOGRAD", "SHIPYARD", "REMONT", "ULJANIK", "3. MAJ", "BRODOTROGIR", "LENAC", "TEHNOMONT", "NAVAR", "SERVIS PLOVILA", "RADEŽ", "GREBEN", "ISKRA "]):
            return "brodogradiliste"
        if any(w in k for w in ["TRAVEL", "TOURS", "TOURIST", "TURISTIČKA AGENCIJA", "PUTNIČKA AGENCIJA", "DESTINATION MANAGEMENT", "DMC", "GULLIVER", "ATLAS", "EXCURSION", "CRUISE", "KRUZER", "JADROLINIJA", "KRILO", "TP LINE", "CATAMARAN", "RAPSKA PLOVIDBA", "MSC ", "PLATANUS", "AVIOPRIJEVOZNIK"]):
            return "putnicki_prihvat"
        if any(w in k for w in ["CIAN", "DEZINSEKCIJA", "IND-EKO", "CIKLON", "EKO-", "SANITAR", "ČISTOĆA", "CISTOCA", "OTPAD", "RIJEKATANK", "SORDES"]):
            return "lucka_ekologija"
        if any(w in k for w in ["OPSKRBA BRODOVA", "SHIP SUPPLY", "ROTO DINAMIC", "AMEC", "SAYBOLT", "CARGO CONTROL", "SAVJETODAVNI SERVIS", "PELJAR", "PILOT", "TEGLJENJ", "BRODOSPAS", "POMORSKI SERVIS", "SGS ADRIATICA", "LUKA D.D.", "LUKA RIJEKA", "LUKA PLOČE", "LUKA ZADAR", "LUKA SPLIT", "LUKA ŠIBENIK", "JADRANSKA VRATA"]):
            return "lucka_opskrba"
        if any(w in k for w in ["VODOVOD", "ODVODNJA", "KANALIZACIJ", "VODOOPSKRB", "HEP", "OPERATOR PRIJENOSNOG", "OPERATOR DISTRIBUCIJSKOG", "TELEKOM", "HT ", "HIDROMETEOROLOŠKI", "HRVATSKE VODE", "HRVATSKE CESTE", "GRAD ", "OPĆINA ", "ŽUPANIJ", "JAVNA USTANOVA", "PONIKVE", "PRAGRANDE"]) or "kabel" in v or "posebna upotreba" in v:
            return "pomorska_infra"
        if "ugostitelj" in v or any(w in k for w in ["CAFFE", "CAFE", "BAR", "BISTRO", "RESTORAN", "KONOBA", "PIZZERIA", "FAST FOOD", "UGOSTITELJ", "PEKARA", "SLADOLED", "TRGOVINA", "KONZUM", "STUDENAC", "TISAK"]):
            return "plazni_ugostitelj"
        if "luku" in v or "lučk" in v:
            return "lucka_djelatnost"
        return "plaza_rekreacija"
    if "taksi" in v or "taxi" in v:
        return "taksi"
    if "dimnjač" in v:
        return "dimnjacar"
    if "pogreb" in v or "groblj" in v:
        return "pogrebno"
    if "fekali" in v or "septičk" in v:
        return "septicke"
    if "otpad" in v or "čistoć" in v:
        return "otpad"
    if "parkir" in v or "premještanja" in v:
        return "parking"
    if "tržnic" in v or ("javn" in v and "površin" in v) or "reklam" in v or "oglas" in v or "ukrašav" in v:
        return "javne_povrsine"
    if "rasvjet" in v or "energetsk" in v or "toplin" in v or ("plin" in v and ("distribucij" in v or "opskrb" in v)):
        return "distribucija_energije"
    if "prijevoz" in v or "žičar" in v or "cest" in v or "telekomunikacij" in v:
        return "javni_prijevoz_tk"
    if "ugljikovodik" in v or "nafte" in v or "geotermal" in v:
        return "ugljikovodici"
    if any(w in v for w in ["kamen", "pijes", "šljun", "mineral", "glin", "eksploatacij", "istražn"]):
        return "kamenolom_rudnik"
    if any(w in v for w in ["vod", "izvor", "termal"]):
        if "vodoopskrb" in v:
            return "javna_vodoopskrba"
        if "prodaje na tržištu" in v or any(w in k for w in ["JAMNICA", "STUDENAC", "PRIRODNA VODA", "COCA-COLA", "KALNIČKE", "CETINA"]):
            return "punjenje_vode"
        if "elektr" in v or "HEP" in k:
            return "hidroenergija"
        if "navodnjavanj" in v or "uzgoj riba" in v:
            return "voda_poljoprivreda"
        return "tehnoloska_voda"
    if "radij" in v or "televizij" in v or "medij" in v:
        return "mediji_rtv"
    if "lov" in v:
        return "loviste"
    if "poljoprivred" in v or "zemljišt" in v or "šum" in v:
        return "poljoprivredno_zemljiste"
    if "igara na sreću" in v or "automat" in v or "casin" in v:
        return "igre_na_srecu"
    if "muzej" in v or "kultur" in v:
        return "kulturno_dobro"
    return "ostalo_komunalno"


# ---------- naknade (fiksne + varijabilne) iz izvornog CSV-a ----------
def iso(d):
    m = re.match(r"(\d\d)\.(\d\d)\.(\d{4})", (d or "").strip())
    return f"{m[3]}-{m[2]}-{m[1]}" if m else None


def iznos(s):
    try:
        return float((s or "").strip().replace(".", "").replace(",", "."))
    except ValueError:
        return None


def kodiranje(fn):
    try:
        open(fn, encoding="utf-8").read(); return "utf-8"
    except UnicodeDecodeError:
        return "cp1250"


NAKNADA = {}
VAR_NAKNADA = {}
ulaz_txt = os.path.join(KORIJEN, "koncesije.txt")
with open(ulaz_txt, encoding=kodiranje(ulaz_txt)) as f:
    r = csv.reader(f, delimiter=";"); next(r)
    for p in r:
        if len(p) < 8:
            continue
        klj = (p[1], p[4], p[2], iso(p[6]), iso(p[7]))
        if len(p) > 10 and p[8] == "Fiksna naknada" and p[10] == "EUR":
            v = iznos(p[9])
            if v is not None:
                NAKNADA.setdefault(klj, v)
        if len(p) > 15:
            # Varijabilna naknada u stupcima 12..15
            var_dio = None
            if p[12] == "Varijabilna naknada":
                koef, vr_koef = (p[14] or "").strip(), (p[15] or "").strip().lower()
                if koef and "postotak" in vr_koef and re.match(r"^[\d,]+$", koef):
                    var_dio = f"+ {koef} % prihoda"
                else:
                    var_dio = "+ varijabilni dio"
            elif p[14] == "Varijabilna naknada":
                var_dio = "+ varijabilni dio"
            if var_dio:
                VAR_NAKNADA.setdefault(klj, var_dio)

# ---------- otvoreni izvori (JPT po OIB-u i JLS pokazatelji) ----------
otv_put = os.path.join(KORIJEN, "otvoreni_izvori.json")
OTVORENI = json.load(open(otv_put, encoding="utf-8")) if os.path.exists(otv_put) else {"jpt_po_oibu": {}, "jls": []}
JPT_OIB = OTVORENI.get("jpt_po_oibu", {})
JLS_LISTA = OTVORENI.get("jls", [])

# ---------- ugovori ----------
uk = json.load(open(os.path.join(KORIJEN, "koncesije.json"), encoding="utf-8"))
tablice = {"davatelj": [], "koncesionar": [], "vrsta": [], "opcina": []}
indeksi = {k: {} for k in tablice}
dav_oib_po_idx = {}
kor_oib_po_idx = {}
kor_vrsta_uzorak = {}


def idx(t, v):
    v = v or ""
    if v not in indeksi[t]:
        indeksi[t][v] = len(tablice[t])
        tablice[t].append(v)
    return indeksi[t][v]


NAST = {None: 0, "obnovljena": 1, "zamjena": 2, "bez_nastavka": 3}
privremeni_redci = []
naknade_po_namjeni = {}

for r in uk:
    od, do = datum(r["od"]), datum(r["do"])
    if do is None:
        continue
    d_i = idx("davatelj", r["davatelj"])
    k_i = idx("koncesionar", r["koncesionar"])
    v_i = idx("vrsta", r["vrsta"])
    o_i = idx("opcina", r["opcina_id"]) if r["opcina_id"] else -1

    if d_i not in dav_oib_po_idx and r.get("oib_davatelja"):
        dav_oib_po_idx[d_i] = r["oib_davatelja"].strip()
    if k_i not in kor_oib_po_idx and r.get("oib_koncesionara"):
        kor_oib_po_idx[k_i] = r["oib_koncesionara"].strip()
    kor_vrsta_uzorak.setdefault(k_i, r["vrsta"])

    klj = (r["oib_davatelja"], r["oib_koncesionara"], r["lokacija"], r["od"], r["do"])
    nak = round(NAKNADA[klj]) if klj in NAKNADA else None
    var_n = VAR_NAKNADA.get(klj)
    nam_kod = klasificiraj_namjenu(r["davatelj"], r["koncesionar"], r["vrsta"], r["lokacija"])
    nam_i = NAMJENA_IDX[nam_kod]
    if nak is not None and nak > 0:
        naknade_po_namjeni.setdefault(nam_i, []).append(nak)

    privremeni_redci.append([
        d_i, k_i, v_i, o_i,
        od or "", do,
        NAST[r["nastavak"]],
        r["lokacija"],
        nak,
        nam_i,
        var_n,
    ])

# Medijan naknade po AI namjeni i izračun zastavica rizika (anomalija)
medijan_namjene = {
    i: round(statistics.median(lista)) if lista else 0
    for i in range(len(NAMJENE_DEF))
    for lista in [naknade_po_namjeni.get(i, [])]
}
IZUZETE_NAMJENE_CIJENA = {
    NAMJENA_IDX["ordinacija"], NAMJENA_IDX["zdrav_njega"],
    NAMJENA_IDX["sportska_lucica"], NAMJENA_IDX["pomorska_infra"],
}

redci = []
for x in privremeni_redci:
    nak, nam_i, var_n, od_s, do_s = x[8], x[9], x[10], x[4], x[5]
    med = medijan_namjene.get(nam_i, 0)
    rizik = 0
    # 1 = Cjenovni odmak (fiksna naknada < 15 % medijana skupine i < 300 EUR, bez varijabilne naknade)
    if (nam_i not in IZUZETE_NAMJENE_CIJENA and nak is not None and med >= 1000
            and nak < max(250, med * 0.15) and not var_n):
        rizik |= 1
    # 2 = Izrazito dug rok (> 30 godina)
    if od_s and do_s:
        trajanje_god = int(do_s[:4]) - int(od_s[:4])
        if trajanje_god > 30:
            rizik |= 2
    # 4 = Bez upisane fiksne i varijabilne naknade (izvan zdravstva i javne infrastrukture)
    if nam_i not in IZUZETE_NAMJENE_CIJENA and nak is None and not var_n:
        rizik |= 4
    x.append(rizik)
    redci.append(x)

vrste_sektor = [sektor(v) for v in tablice["vrsta"]]

# stabilni ključ davatelja za adresu kalendara: OIB (davatelji su javna tijela), inače sažetak naziva.
import hashlib
dav_kljuc = [
    dav_oib_po_idx.get(i) if re.fullmatch(r"\d{11}", dav_oib_po_idx.get(i) or "")
    else "n" + hashlib.sha1(n.encode()).hexdigest()[:10]
    for i, n in enumerate(tablice["davatelj"])
]

# Metapodaci davatelja (preko OIB_DAVAT u jpt.gov.hr)
davatelji_meta = []
for i, naziv_d in enumerate(tablice["davatelj"]):
    oib_d = dav_oib_po_idx.get(i, "")
    jpt = JPT_OIB.get(oib_d, {})
    davatelji_meta.append([
        oib_d or None,
        jpt.get("vrsta") or ("Lučka uprava" if "LUČKA UPRAVA" in naziv_d.upper() else "Javnopravno tijelo"),
        jpt.get("zupanija") or None,
        jpt.get("email") or None,
    ])

# Metapodaci koncesionara (OIB grupiranje + zaštita OIB-a fizičkih osoba/obrta)
prvi_idx_po_oibu = {}
koncesionari_meta = []
for i, naziv_k in enumerate(tablice["koncesionar"]):
    oib_k = kor_oib_po_idx.get(i, "")
    tip_s = odredi_tip_subjekta(naziv_k, kor_vrsta_uzorak.get(i, ""))
    kanonski = prvi_idx_po_oibu.setdefault(oib_k, i) if oib_k else i
    # OIB objavljujemo samo za pravne osobe (tvrtke, ustanove, udruge), ne za fizičke osobe/obrte (GDPR)
    javni_oib = oib_k if (oib_k and tip_s != 14) else None
    koncesionari_meta.append([javni_oib, tip_s, kanonski])

# ---------- granice i povezivanje općina s DZS 2021., JPT, Adresara i Poreznom upravom ----------
def norm_opc(s):
    s = unicodedata.normalize("NFKD", (s or "").replace("đ", "d").replace("Đ", "D"))
    s = re.sub(r"\s+", " ", "".join(c for c in s if not unicodedata.combining(c))).upper().strip()
    s = re.sub(r"^(GRAD|OPCINA|OPICINA|OTOK)\s+", "", s)
    s = re.split(r"\s*-\s*", s)[0]
    return re.sub(r"[^A-Z0-9 ]", "", s).strip()


jls_po_kljucu = {}
krk_opcine_k = {"KRK", "BASKA", "DOBRINJ", "MALINSKA", "OMISALJ", "PUNAT", "VRBNIK"}
krk_stanovnika = 0
for u in JLS_LISTA:
    k = norm_opc(u["kratko"])
    if k in krk_opcine_k and u.get("stanovnika"):
        krk_stanovnika += u["stanovnika"]
    jls_po_kljucu.setdefault((u["tip"], k), u)
    jls_po_kljucu.setdefault(k, u)

geo = json.load(open(os.path.join(KORIJEN, "opcine.geojson"), encoding="utf-8"))
opcine_meta = {}
naziv_opc = {}

for ft in geo["features"]:
    sid = ft["properties"]["shapeID"]
    izvorni_naziv = ft["properties"]["shapeName"]
    cisti_naziv = ISPRAVAK_NAZIVA.get(izvorni_naziv, izvorni_naziv)
    naziv_opc[sid] = cisti_naziv
    k = norm_opc(cisti_naziv)
    if izvorni_naziv == "Otok Losinj":
        k = "MALI LOSINJ"
    elif izvorni_naziv == "Otok Krk":
        k = "KRK"
    tip = "grad" if cisti_naziv.startswith("Grad") else "općina"
    u = jls_po_kljucu.get((tip, k)) or jls_po_kljucu.get(k)
    if u:
        opcine_meta[sid] = {
            "oib": u.get("oib"),
            "oznaka": u.get("oznaka"),
            "zupanija": u.get("zupanija"),
            "stanovnika": krk_stanovnika if izvorni_naziv == "Otok Krk" else u.get("stanovnika"),
            "web": u.get("web"),
            "email": u.get("email"),
            "porezNiza": u.get("porez_niza_2026"),
            "porezVisa": u.get("porez_visa_2026"),
        }

namjene_izvoz = [
    [kod, naziv, ikona, opis, medijan_namjene.get(i, 0)]
    for i, (kod, naziv, ikona, opis) in enumerate(NAMJENE_DEF)
]

podaci = dict(
    generirano=date.today().isoformat(),
    sektori=[[k, n] for k, n, _ in SEKTORI],
    namjene=namjene_izvoz,
    tipoviSubjekata=TIPOVI_SUBJEKATA,
    vrste=tablice["vrsta"],
    vrsteSektor=vrste_sektor,
    davatelji=tablice["davatelj"],
    davateljiMeta=davatelji_meta,
    davateljiKal=dav_kljuc,
    koncesionari=tablice["koncesionar"],
    koncesionariMeta=koncesionari_meta,
    opcine=tablice["opcina"],
    opcineMeta=opcine_meta,
    stupci=["davatelj", "koncesionar", "vrsta", "opcina", "od", "do", "nastavak", "lokacija", "naknada", "namjena", "varNaknada", "rizik"],
    ugovori=redci,
)
with open(os.path.join(OUT, "podaci.js"), "w", encoding="utf-8") as f:
    f.write("window.PODACI=")
    json.dump(podaci, f, ensure_ascii=False, separators=(",", ":"))
    f.write(";\n")

# ---------- otvoreni izvoz (CSV) ----------
NAST_TXT = ["", "obnovljena", "zamjena", "bez_nastavka"]
sekt_naziv = {k: n for k, n, _ in SEKTORI}
with open(os.path.join(OUT, "koncesije.csv"), "w", encoding="utf-8-sig", newline="") as f:
    w = csv.writer(f)
    w.writerow([
        "davatelj", "oib_davatelja", "vrsta_davatelja_jpt", "koncesionar", "tip_koncesionara",
        "vrsta", "sektor", "ai_procjena_namjene", "opcina_id", "opcina", "lokacija",
        "pocetak", "istek", "nastavak_nakon_isteka", "godisnja_fiksna_naknada_eur", "varijabilna_naknada",
    ])
    for x in redci:
        oid = tablice["opcina"][x[3]] if x[3] >= 0 else ""
        dm = davatelji_meta[x[0]]
        km = koncesionari_meta[x[1]]
        w.writerow([
            tablice["davatelj"][x[0]], dm[0] or "", dm[1] or "",
            tablice["koncesionar"][x[1]], TIPOVI_SUBJEKATA[km[1]],
            tablice["vrsta"][x[2]], sekt_naziv[vrste_sektor[x[2]]],
            NAMJENE_DEF[x[9]][1],
            oid, naziv_opc.get(oid, ""), x[7], x[4], x[5],
            NAST_TXT[x[6]], "" if x[8] is None else x[8], x[10] or "",
        ])


# ---------- kalendari za pretplatu (iCalendar, RFC 5545), jedan po općini ----------
# Službenik se jednom pretplati (webcal://…/data/kalendar/<shapeID>.ics); kalendar sam povlači nove rokove
# nakon svake obrade. Ugovori koji ističu istog dana grupiraju se u jedan događaj, a 6 mjeseci prije svakog
# datuma dodaje se događaj „pripremiti postupak“ (Google kalendar u pretplatama ne prenosi podsjetnike).
import calendar, shutil
from collections import Counter
from datetime import datetime, timezone
WEB = "https://koncesijski-sat.vercel.app"
KAL = os.path.join(OUT, "kalendar")
shutil.rmtree(KAL, ignore_errors=True); os.makedirs(KAL)
DANAS = date.today()
STAMP = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")

def minus_mj(d, m):
    y, mm = divmod(d.month - 1 - m, 12)
    return date(d.year + y, mm + 1, min(d.day, calendar.monthrange(d.year + y, mm + 1)[1]))

def ics_tekst(t):
    return t.replace("\\", "\\\\").replace(";", "\\;").replace(",", "\\,").replace("\n", "\\n")

def presavij(linija):
    """Retci najviše 75 okteta; nastavak počinje razmakom (RFC 5545, 3.1)."""
    b = linija.encode("utf-8"); out = []
    while len(b) > (75 if not out else 74):      # nastavak ima vodeći razmak, pa 74 + 1
        i = 75 if not out else 74
        while (b[i] & 0xC0) == 0x80:      # ne rezati usred UTF-8 znaka
            i -= 1
        out.append(b[:i]); b = b[i:]
    out.append(b)
    return "\r\n ".join(x.decode("utf-8") for x in out)

def kon(n):      # 1 koncesija, 2–4 koncesije, 5+ koncesija
    return "koncesije" if n % 10 in (2, 3, 4) and n % 100 not in (12, 13, 14) else "koncesija"

def ugo(n):      # 1 ugovor, 2+ ugovora
    return "ugovor" if n % 10 == 1 and n % 100 != 11 else "ugovora"

def eur(x):
    return f"{x:,.0f}".replace(",", ".") + " €"

def dogadaj(uid, dan, naslov, opis, url):
    return ["BEGIN:VEVENT", f"UID:{uid}@koncesijski-sat", f"DTSTAMP:{STAMP}",
            f"DTSTART;VALUE=DATE:{dan:%Y%m%d}", f"DTEND;VALUE=DATE:{dan + timedelta(days=1):%Y%m%d}",
            f"SUMMARY:{ics_tekst(naslov)}", f"DESCRIPTION:{ics_tekst(opis)}", f"URL:{url}",
            "TRANSP:TRANSPARENT",
            "BEGIN:VALARM", "ACTION:DISPLAY", f"DESCRIPTION:{ics_tekst(naslov)}", "TRIGGER:-P7D", "END:VALARM",
            "END:VEVENT"]

from datetime import timedelta
UKUPNO = {"kalendara": 0, "dogadaja": 0}

def zapisi_kalendar(put, naziv, opis_kal, po_dat, url, url_opis, kratko, stavka):
    """Jedan feed: ugovori istog datuma grupirani u događaj + „pripremiti postupak“ 6 mj. ranije."""
    redovi = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Koncesijski sat//HR", "CALSCALE:GREGORIAN", "METHOD:PUBLISH",
              f"X-WR-CALNAME:{ics_tekst('Rokovi koncesija · ' + naziv)}",
              f"X-WR-CALDESC:{ics_tekst(opis_kal + ' Iz Registra koncesija (FINA, data.gov.hr). Osvježava se nakon svake obrade podataka. ' + url)}",
              "X-WR-TIMEZONE:Europe/Zagreb", "REFRESH-INTERVAL;VALUE=DURATION:P1D", "X-PUBLISHED-TTL:P1D"]
    for dan, lista in sorted(po_dat.items()):
        lista.sort(key=lambda x: -(x[8] or 0))
        n, nak = len(lista), sum(x[8] or 0 for x in lista)
        stavke = [stavka(x) + (f", {eur(x[8])}/god." if x[8] else "") for x in lista[:40]]
        if n > 40:
            stavke.append(f"… i još {n - 40} (cijeli popis u aplikaciji)")
        kljuc = hashlib.sha1(f"{put}|{dan}".encode()).hexdigest()[:16]
        prvi = tablice["koncesionar"][lista[0][1]]
        naslov = f"Ističe koncesija: {prvi}" if n == 1 else f"Ističe {n} {kon(n)} · {kratko}"
        opis = (f"{n} {ugo(n)} o koncesiji ističe {dan.day}. {dan.month}. {dan.year}." +
                (f" Godišnja fiksna naknada: {eur(nak)}." if nak else "") + "\n\n" + "\n".join(stavke) +
                f"\n\n{url_opis}: {url}\nIzvor: Registar koncesija (FINA), obrada Koncesijski sat {DANAS.day}. {DANAS.month}. {DANAS.year}.")
        redovi += dogadaj("istek-" + kljuc, dan, naslov, opis, url); UKUPNO["dogadaja"] += 1
        prip = minus_mj(dan, 6)
        if prip >= DANAS:
            redovi += dogadaj("priprema-" + kljuc, prip,
                              f"Pripremiti postupak: za 6 mj. ističe {n} {kon(n)}" + (f" ({prvi})" if n == 1 else f" · {kratko}"),
                              f"{dan.day}. {dan.month}. {dan.year}. ističe {n} {ugo(n)} o koncesiji. "
                              "Novi postupak dodjele treba pokrenuti na vrijeme, da prostor ili usluga ne ostanu bez ugovora.\n\n" +
                              "\n".join(stavke) + f"\n\n{url_opis}: {url}", url)
            UKUPNO["dogadaja"] += 1
    redovi.append("END:VCALENDAR")
    os.makedirs(os.path.dirname(put), exist_ok=True)
    with open(put, "w", encoding="utf-8", newline="") as f:
        f.write("\r\n".join(presavij(r) for r in redovi) + "\r\n")
    UKUPNO["kalendara"] += 1

buduci = [x for x in redci if date.fromisoformat(x[5]) >= DANAS]
kon_ = lambda x: tablice["koncesionar"][x[1]]
vrs_ = lambda x: tablice["vrsta"][x[2]]

# 1) po općini – pregled svih ugovora na području, s davateljem uz svaki
po_opc = {}
for x in buduci:
    if x[3] >= 0:
        po_opc.setdefault(tablice["opcina"][x[3]], {}).setdefault(date.fromisoformat(x[5]), []).append(x)
for oid, po_dat in po_opc.items():
    naziv = naziv_opc.get(oid, oid)
    zapisi_kalendar(os.path.join(KAL, oid + ".ics"), naziv, f"Svi ugovori o koncesiji na području: {naziv} (pregled, svi davatelji).",
                    po_dat, f"{WEB}/#opcina/{oid}", "Profil općine", naziv.replace("Grad ", "").replace("Općina ", ""),
                    lambda x: f"• {kon_(x)} – {vrs_(x)} ({x[7]}) · davatelj: {tablice['davatelj'][x[0]]}")
n_opc = UKUPNO["kalendara"]

# 2) po davatelju – „moji ugovori“: sve što davatelj dodjeljuje, na svim lokacijama
po_dav = {}
for x in buduci:
    po_dav.setdefault(dav_kljuc[x[0]], {}).setdefault(date.fromisoformat(x[5]), []).append(x)
for kl, po_dat in po_dav.items():
    imena = Counter(tablice["davatelj"][x[0]] for l in po_dat.values() for x in l)
    naziv = imena.most_common(1)[0][0]
    zapisi_kalendar(os.path.join(KAL, "davatelj", kl + ".ics"), naziv, f"Ugovori o koncesiji koje dodjeljuje {naziv}.",
                    po_dat, f"{WEB}/#sat", "Što ističe", naziv,
                    lambda x: f"• {kon_(x)} – {vrs_(x)} ({x[7]}{', ' + naziv_opc[tablice['opcina'][x[3]]] if x[3] >= 0 and tablice['opcina'][x[3]] in naziv_opc else ''})")
print(f"kalendara: {n_opc} po općini + {UKUPNO['kalendara'] - n_opc} po davatelju, događaja: {UKUPNO['dogadaja']}")

# ---------- granice ----------
def dp(pts, tol):
    if len(pts) < 3:
        return pts
    keep = [False] * len(pts)
    keep[0] = keep[-1] = True
    stack = [(0, len(pts) - 1)]
    t2 = tol * tol
    while stack:
        a, b = stack.pop()
        ax, ay = pts[a]; bx, by = pts[b]
        dx, dy = bx - ax, by - ay
        L = dx * dx + dy * dy
        best, bi = -1, -1
        for i in range(a + 1, b):
            px, py = pts[i]
            if L == 0:
                d = (px - ax) ** 2 + (py - ay) ** 2
            else:
                t = max(0, min(1, ((px - ax) * dx + (py - ay) * dy) / L))
                d = (px - ax - t * dx) ** 2 + (py - ay - t * dy) ** 2
            if d > best:
                best, bi = d, i
        if best > t2:
            keep[bi] = True
            stack += [(a, bi), (bi, b)]
    return [p for p, k in zip(pts, keep) if k]


def ring(r):
    s = dp(r, TOL)
    s = [[round(x, DEC), round(y, DEC)] for x, y in s]
    out = [s[0]]
    for p in s[1:]:
        if p != out[-1]:
            out.append(p)
    return out if len(out) >= 4 else None


def poly(p):
    rs = [ring(r) for r in p]
    if rs[0] is None:
        return None
    return [rs[0]] + [r for r in rs[1:] if r]


feats = []
for ft in geo["features"]:
    g = ft["geometry"]
    polys = [g["coordinates"]] if g["type"] == "Polygon" else g["coordinates"]
    polys = [q for q in (poly(p) for p in polys) if q]
    if not polys:
        polys = [g["coordinates"]] if g["type"] == "Polygon" else [g["coordinates"][0]]
    sid = ft["properties"]["shapeID"]
    feats.append({
        "type": "Feature",
        "properties": {"name": sid, "naziv": naziv_opc[sid]},
        "geometry": {"type": "MultiPolygon", "coordinates": polys},
    })
with open(os.path.join(OUT, "granice.js"), "w", encoding="utf-8") as f:
    f.write("window.GRANICE=")
    json.dump({"type": "FeatureCollection", "features": feats}, f, ensure_ascii=False, separators=(",", ":"))
    f.write(";\n")

from collections import Counter
print("ugovora:", len(redci), "| sektori:", Counter(vrste_sektor[r[2]] for r in redci).most_common(5))
print("s fiksnom naknadom:", sum(1 for x in redci if x[8] is not None),
      "| s varijabilnom:", sum(1 for x in redci if x[10] is not None),
      "| općina s DZS/JPT metapodacima:", len(opcine_meta))
for fn in ("podaci.js", "granice.js", "koncesije.csv"):
    print(fn, round(os.path.getsize(os.path.join(OUT, fn)) / 1e6, 2), "MB")
