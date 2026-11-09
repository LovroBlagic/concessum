// Naracija za video v2 (po uzoru na esidro-video-v3/tts.mjs): svaki blok ima svoje mjesto u videu.
// Glas: vlastita snimka video/v2/glas/<id>.wav (ili .m4a/.mp3) ako postoji, inače macOS „say” s hrvatskim glasom Lana.
// Ako je TTS dulji od svog prozora, brzina govora se automatski povećava (najviše MAX_BRZINA).
//
//   node video/v2/naracija.mjs            -> video/concessum_v2_naracija.mp4
//   node video/v2/naracija.mjs --samo-zvuk -> samo video/v2/glas_build/naracija.wav (za provjeru)
//   node video/v2/naracija.mjs --wav ~/Downloads/naracija.wav   -> cijela naracija iz video/naracija.html (već poravnata s videom)
//   --video <datoteka.mp4>                 -> drugi izvor slike (zadano video/concessum_v2.mp4)
//
// Tekst se može slobodno mijenjati. Brojke su napisane riječima jer ih TTS tako čita točno.
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const DIR = path.dirname(fileURLToPath(import.meta.url));
const opt = (k) => { const i = process.argv.indexOf("--" + k); return i >= 0 ? process.argv[i + 1] : null; };
const VIDEO = opt("video") || path.join(DIR, "..", "concessum_v2.mp4");
const CIJELA = opt("wav");
const IZLAZ = path.join(DIR, "..", "concessum_v2_naracija.mp4");
const GLAS = path.join(DIR, "glas"), B = path.join(DIR, "glas_build");
const GLAS_TTS = "Lana", BRZINA = 185, MAX_BRZINA = 210;
mkdirSync(B, { recursive: true });

// od / do = prozor u videu (sekunde) u koji glas mora stati
export const NARACIJA = [
  { id: "b01", od: 0.3, do: 10.9, tekst: "Svaki ugovor o koncesiji, vez, plaža ili luka, ima rok. Na ovom satu svaka točka je jedan od osamsto šesnaest ugovora koji ističu iduće godine." },
  { id: "b02", od: 11.2, do: 17.3, tekst: "Za javna dobra sada je dvadeset dva i petnaest. Ponoć je trideset prvi prosinca." },
  // 17,5–18,3: tišina u ponoć
  { id: "b03", od: 18.45, do: 24.9, tekst: "U toj jednoj ponoći ističe tristo dvanaest ugovora. Dvjesto ih je izdala Lučka uprava Dubrovnik." },
  { id: "b04", od: 25.2, do: 32.9, tekst: "Što bude nakon isteka? Za četrdeset sedam posto ugovora novi se nikad ne pojavi. To je signal za provjeru, ne dokaz." },
  { id: "b05", od: 33.2, do: 43.9, tekst: "Zakon o koncesijama traži da postupak počne šest mjeseci prije isteka. Za ugovore iz ponoći, tri od pet koraka već kasne." },
  { id: "b06", od: 44.2, do: 51.8, tekst: "Zato smo napravili Koncesum, sat za javna dobra, izgrađen na pet skupova s Portala otvorenih podataka." },
  { id: "b07", od: 52.2, do: 60.2, tekst: "Na karti ministarstvo i županije vide cijelu Hrvatsku: koliko ugovora ističe u šest i dvanaest mjeseci." },
  { id: "b08", od: 60.6, do: 78.7, tekst: "Trodimenzionalni sat premota iduće tri godine. Svaki bljesak je ugovor koji upravo ističe, a stup općine pada kako ostaje bez koncesija. Do studenog iduće godine istekne osamsto šesnaest ugovora, i jedan cijeli šest milijuna eura godišnje naknade." },
  { id: "b09", od: 79.1, do: 91.4, tekst: "Službenik općine klikne na ugovor. U registru piše samo koncesija na pomorskom dobru, a umjetna inteligencija prepoznaje hotelsku plažu uz resort i uspoređuje naknadu s medijanom." },
  { id: "b10", od: 91.8, do: 97.5, tekst: "Hodogram po Zakonu o koncesijama: od pet koraka, četiri već kasne." },
  { id: "b11", od: 97.8, do: 105.1, tekst: "Jednim klikom nastaje službeni dopis, a građani i novinari dobiju gotov zahtjev za pristup informacijama." },
  { id: "b12", od: 105.5, do: 118.6, tekst: "Profil općine spaja popis stanovništva, porezne stope i službene kontakte. Uz pretplatu na rokove, kalendar se sam osvježava, bez prijave i bez e-adrese." },
  { id: "b13", od: 119.0, do: 129.2, tekst: "Za reviziju i nadzor, ekran Rizici izdvaja neobično niske naknade, ugovore duže od trideset godina, i općine s najvećim fiskalnim rizikom." },
  { id: "b14", od: 129.6, do: 139.2, tekst: "Iste podatke može pitati i AI asistent. Koje koncesije u Dubrovniku ističu do kraja godine? Dvjesto tri, oko sto šezdeset četiri tisuće eura." },
  { id: "b15", od: 139.6, do: 156.8, tekst: "Ispod je pet otvorenih skupova s data točka gov točka hr, povezanih po OIB-u: registar koncesija, javnopravna tijela preko živog API-ja, popis stanovništva, adresar i porezne stope. Za dnevno osvježavanje treba strojno čitljiv izvoz registra." },
  { id: "b16", od: 157.1, do: 165.8, tekst: "Sljedeći koraci: obavijesti e-poštom, provjera objave natječaja u E O J N-u, sudski registar i katastar." },
  { id: "b17", od: 166.3, do: 179.5, tekst: "Prvog prosinca stiže podsjetnik: vrijeme je za odluku. Koncesum pokazuje sat, i navije budilicu. Na vrijeme." },
];

const trajanje = (f) => +execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", f]).toString();
const vlastiti = (id) => ["wav", "m4a", "mp3", "aiff"].map((e) => path.join(GLAS, `${id}.${e}`)).find(existsSync);

const dijelovi = [];
for (const n of CIJELA ? [] : NARACIJA) {
  const prozor = n.do - n.od;
  let f = vlastiti(n.id), izvor = "snimka", d;
  if (f) d = trajanje(f);
  else {
    izvor = "TTS"; f = path.join(B, `${n.id}.aiff`);
    for (let r = BRZINA; ; r += 5) {
      execFileSync("say", ["-v", GLAS_TTS, "-r", String(r), "-o", f, n.tekst]);
      d = trajanje(f);
      if (d <= prozor || r >= MAX_BRZINA) { izvor += ` ${r} wpm`; break; }
    }
  }
  const pre = d > prozor ? "  !!! PREDUGO za " + (d - prozor).toFixed(1) + " s" : "";
  console.log(`${n.id}  ${n.od.toFixed(1)}–${n.do.toFixed(1)} s  glas ${d.toFixed(1)} / ${prozor.toFixed(1)} s  (${izvor})${pre}`);
  dijelovi.push({ f, od: n.od });
}

// miks: svaki blok na svoje mjesto, ukupno 180 s
const ul = [], fl = [];
dijelovi.forEach((x, i) => { ul.push("-i", x.f); const ms = Math.round(x.od * 1000); fl.push(`[${i}:a]aresample=48000,aformat=channel_layouts=stereo,adelay=${ms}|${ms}[n${i}]`); });
fl.push(`${dijelovi.map((_, i) => `[n${i}]`).join("")}amix=inputs=${dijelovi.length}:normalize=0:duration=longest,apad,atrim=0:180,loudnorm=I=-16:TP=-1.5:LRA=11[a]`);
const wav = path.join(B, "naracija.wav");
if (CIJELA) {
  // vlastita snimka iz naracija.html: rez ispod 80 Hz, blaga kompresija, ista glasnoća kao TTS miks
  if (!existsSync(CIJELA)) throw new Error("nema datoteke " + CIJELA);
  execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-i", CIJELA, "-af",
    "aresample=48000,highpass=f=80,acompressor=threshold=-20dB:ratio=3:attack=5:release=150,aformat=channel_layouts=stereo,apad,atrim=0:180,loudnorm=I=-16:TP=-1.5:LRA=11",
    "-ar", "48000", wav]);
  console.log(`naracija: ${CIJELA} (${trajanje(CIJELA).toFixed(1)} s)`);
} else
execFileSync("ffmpeg", ["-y", "-loglevel", "error", ...ul, "-filter_complex", fl.join(";"), "-map", "[a]", "-ar", "48000", wav]);
console.log("zvuk:", wav);
if (process.argv.includes("--samo-zvuk")) process.exit(0);

// glazba (video/v2/glazba.mp3, ako postoji): ponavlja se s pretapanjem do 180 s, utiša se ispod glasa,
// a u ponoć (17,5–18,3 s) potpuna tišina
const GLAZBA = path.join(DIR, "glazba.mp3");
let zvuk = wav;
if (existsSync(GLAZBA)) {
  const gd = trajanje(GLAZBA), X = 6, kopija = Math.ceil((180 + X) / (gd - X));
  const ul = [], fl = [];
  for (let i = 0; i < kopija; i++) ul.push("-i", GLAZBA);
  let prev = "[0:a]";
  for (let i = 1; i < kopija; i++) { fl.push(`${prev}[${i}:a]acrossfade=d=${X}:c1=tri:c2=tri[x${i}]`); prev = `[x${i}]`; }
  const gk = kopija;                                  // indeks ulaza naracije
  ul.push("-i", wav);
  fl.push(`${prev}atrim=0:180,aresample=48000,aformat=channel_layouts=stereo,volume=1.0,afade=t=in:d=1.5,afade=t=out:st=176:d=4,volume=0:enable='between(t,17.5,18.3)'[g]`);
  fl.push(`[${gk}:a]asplit=2[n1][n2]`);
  fl.push(`[g][n1]sidechaincompress=threshold=0.04:ratio=8:attack=30:release=600:makeup=1[gd]`);
  fl.push(`[gd][n2]amix=inputs=2:normalize=0:duration=first,alimiter=limit=0.95[a]`);
  zvuk = path.join(B, "naracija_glazba.wav");
  execFileSync("ffmpeg", ["-y", "-loglevel", "error", ...ul, "-filter_complex", fl.join(";"), "-map", "[a]", "-ar", "48000", zvuk]);
  console.log(`glazba: ${gd.toFixed(1)} s × ${kopija}, pretapanje ${X} s, utišavanje ispod glasa`);
}
execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-i", VIDEO, "-i", zvuk, "-map", "0:v", "-map", "1:a", "-c:v", "copy", "-c:a", "aac", "-b:a", "192k", "-shortest", "-movflags", "+faststart", IZLAZ]);
console.log("GOTOVO:", IZLAZ);
writeFileSync(path.join(B, "naracija.txt"), NARACIJA.map((n) => `${n.id} [${n.od}–${n.do} s] ${n.tekst}`).join("\n"));
