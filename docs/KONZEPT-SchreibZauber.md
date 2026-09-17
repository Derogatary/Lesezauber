# 🪄 Konzept: SchreibZauber – Schreib- und Generierungs-Tab für LeseZauber Pro

**Stand:** 16.09.2026 · **Status:** Konzept · **Bezug:** `CLAUDE.md`, `README.md`

> **Ergänzendes Dokument:** [`KONZEPT-Bildquellen.md`](KONZEPT-Bildquellen.md) bewertet die
> kostenlosen und kostenpflichtigen Wege, an die Bilder zu kommen, und beschreibt das
> bereits gebaute Platzhalter-Fundament (`js/studio/`) samt Austausch-Mechanik.

> **Nachtrag (Sept. 2026, entschieden):** Die Werke sollen **auf Veröffentlichung ausgelegt**
> sein (z.B. Amazon KDP), nicht nur auf reine Privatnutzung - private Nutzung durch die
> eigenen Kinder bleibt der Alltagsfall, aber Stufe 1 und Stufe 3 müssen von Anfang an so
> gebaut sein, dass eine spätere Veröffentlichung nicht an nachträglich fehlenden
> Leitplanken/Exportformaten scheitert. Details: TEIL F unten.

Dieses Dokument beschreibt, wie LeseZauber Pro um einen Bereich erweitert wird, in dem
eigene Werke **geschrieben und illustriert** werden: Bilderbücher, Erstlesebücher,
Comics/Hefte und Kinder-Arbeitshefte. Es beantwortet drei Fragen:

1. Wie entstehen solche Werke **professionell** (Verlags- und Redaktions-Workflows)?
2. Wie lässt sich dieser Workflow in einer reinen Browser-App **nachbauen**?
3. Wird das ein **weiterer Tab** oder eine **getrennte App**?

---

## 0. Kernempfehlung in fünf Sätzen

1. **Ein Repo, eine Code-Basis, ein Datenspeicher** – aber ein klar abgetrennter Bereich
   („SchreibZauber“) mit eigenen Ansichten, eigenem Namespace und eigenem Object Store.
2. Der Erstell-Code wird **erst beim Betreten des Bereichs nachgeladen** (lazy, wie PDF.js),
   damit reine Leser:innen nichts vom zusätzlichen Gewicht merken.
3. Ein fertiges Werk landet am Ende als **ganz normales Buch in der bestehenden Bibliothek** –
   Vorlesen, Personas, Vokabeltrainer, Quiz, Druck funktionieren dann ohne eine Zeile Extra-Code.
4. Der Assistent **imitiert den echten Verlagsworkflow** (Exposé → Umfangsplanung → Text-Breakdown
   → Figurenblatt → Storyboard → Illustration → Layout → Druckvorstufe), nur kindgerecht benannt
   und mit KI als „Mitarbeiter“ statt als Automat. Jede Stufe ist eine Freigabe-Station.
5. **Optionale Ausbaustufe:** eine zweite Einstiegsseite `schreiben.html` mit eigenem Manifest –
   zwei App-Icons auf dem Homescreen, aber weiterhin eine einzige Code-Basis und ein
   gemeinsamer Datenspeicher. Das ist der beste Kompromiss zwischen „eigene App“ und „Wartbarkeit“.
   *(Icon-Idee, Sept. 2026: ein magischer Stift/Federkiel, passend zu LeseZauber Pros
   bestehendem Icon-Stil - reine Bildgestaltung, kein technisches Thema.)*

---

# TEIL A – Wie Profis arbeiten

Grundlage: Verlagspraxis für Bilderbücher, Comic-Produktion und Schulbuch-/Arbeitsheft-Redaktion
(Quellen am Ende). Wir übernehmen bewusst nicht nur die *Reihenfolge*, sondern auch die
*Zwischenprodukte* – denn genau die sind der Grund, warum professionelle Bücher funktionieren.

## A.1 Bilderbuch (klassischer Verlagsworkflow)

| # | Phase | Zwischenprodukt | Warum das existiert |
|---|---|---|---|
| 1 | **Idee / Exposé** | Einseitiges Exposé: Zielgruppe, Alter, Thema, Ton, Kernbotschaft | Das Alter legt alles Weitere fest (Wortzahl, Satzlänge, Bildanteil) |
| 2 | **Manuskript** | Fließtext, lektoriert | Text zuerst – Bilder illustrieren eine Geschichte, nicht umgekehrt |
| 3 | **Umfangsplanung** | Seitenzahl | Druckbogen: Seitenzahl muss durch **16 teilbar** sein. Standard: **32 Seiten** |
| 4 | **Text-Breakdown** | Text auf Doppelseiten verteilt | Von 32 Seiten gehen ~8 für Umschlag, Vorsatz, Titelei und Impressum ab → **12–14 Doppelseiten Geschichte**, ca. **500–600 Wörter**, ca. **4 kurze Sätze pro Doppelseite** |
| 5 | **Page-Turn-Dramaturgie** | markierte Umblätter-Momente | Jede Doppelseite endet mit einem Zug zum Weiterblättern (Frage, Cliffhanger, Überraschung). Das ist *die* handwerkliche Besonderheit des Bilderbuchs |
| 6 | **Figurenentwicklung** | **Character Sheet / Model Sheet**: Figur von vorn/seitlich/hinten, Mimik-Reihe, Größenvergleich, Farbwerte | Der einzige Garant dafür, dass die Figur auf Seite 3 und Seite 27 dieselbe ist |
| 7 | **Thumbnails / Scamps** | 16 winzige Rechtecke auf einem Blatt | Komposition und Rhythmus billig prüfen: im Thumbnail kostet eine Korrektur Minuten, in der Reinzeichnung Stunden |
| 8 | **Storyboard / Dummy** | gefaltetes Roh-Buch zum Durchblättern | **Der zentrale Freigabe-Checkpoint** zwischen Autor:in, Illustration und Herstellung |
| 9 | **Roughs → Reinzeichnung → Kolorierung** | finale Illustrationen | Erst hier fließt das teure Handwerk |
| 10 | **Layout & Typografie** | Satzspiegel, Schriftwahl, Textplatzierung | Text liegt in ruhigen Bildzonen, nie über Gesichtern, nie im Bund |
| 11 | **Cover** | oft schon früh | Wird für Vertrieb/Vorschau vor dem Innenteil gebraucht |
| 12 | **Druckvorstufe** | druckfähiges PDF | Beschnitt (3–5 mm), Bundsteg, 300 dpi, CMYK |
| 13 | **Korrekturfahnen** | Freigabe | Letzte Schleife vor Druck |

**Zeitgerüst im Profi-Betrieb:** Figurendesign 1–2 Wochen, Storyboard 1–2 Wochen,
Skizzen inkl. Korrekturen 2–4 Wochen, finale Illustration 6–12 Wochen, Layout 1–2 Wochen.
→ **Erkenntnis für uns:** 80 % der Qualität entsteht *vor* dem ersten fertigen Bild.
Genau deshalb darf unsere App nicht „Knopf drücken → Buch“ machen.

## A.2 Erstlesebuch – die Sonderregeln für Leseanfänger

Zusätzlich zum Bilderbuch-Workflow greift eine eigene Regelschicht:

- **Fibelschrift**, große Schriftgröße, großer Zeilenabstand
- **Silbenmethode**: Silben abwechselnd farbig – die bekannteste deutsche Leselernhilfe
- **Sinnschritte**: ein Satz = eine Zeile, Zeilenumbruch nie mitten in einer Sinneinheit
- **Wortschatz-Kontrolle**: begrenzter Grundwortschatz, kaum Fremdwörter, wenige Nebensätze
- **Lesestufen** (1./2./3. Klasse) mit definierter Satzlänge und Wortanzahl

→ Das passt exakt zum bereits existierenden **Erstleser-Modus** der App und ist der Grund,
warum Erstlesebuch kein eigener Werktyp sein muss, sondern ein **Regelprofil**.

## A.3 Comic / Heft

1. **Script** – Panel für Panel: Panelbeschreibung + Dialog, getrennt notiert
2. **Model Sheets** – wie beim Bilderbuch, Konsistenz ist im Comic noch kritischer
3. **Thumbnails / Layouts** – Panelaufteilung, Leserichtung (Z-förmig), Pacing über Panelgrößen
4. **Pencils → Inks → Colors**
5. **Lettering zuletzt** – und die Zeichnung lässt von Anfang an **Platz für Sprechblasen**
6. Druckvorstufe

→ **Erkenntnis für uns:** Sprechblasen dürfen **nicht** ins generierte Bild hineingeneriert
werden (KI schreibt unzuverlässig, Text ist dann nicht mehr änderbar und nicht vorlesbar).
Stattdessen: Bild ohne Text generieren, mit bewusst freigehaltener Zone, Sprechblasen als
**HTML/SVG-Overlay** darüber. Damit bleiben Blasen editierbar, vorlesbar und durchsuchbar.

## A.4 Kinder-Arbeitsheft / Lernheft (Bildungsverlag)

Ein völlig anderer Workflow – hier steuert nicht die Dramaturgie, sondern das Lernziel:

| # | Phase | Zwischenprodukt |
|---|---|---|
| 1 | **Curriculum-Analyse** | Welche Kompetenz, welche Klassenstufe, welcher Lehrplan |
| 2 | **Lernziele** | messbar formuliert, ein Ziel pro Kapitel („Das Kind kann …“) |
| 3 | **Stoffverteilung / Progression** | vom Bekannten zum Neuen, Spiralprinzip, Wiederholungsschleifen |
| 4 | **Aufgabentypologie** | Zuordnen, Nachspuren, Ausmalen, Lückentext, Ankreuzen, Rätsel, Schneiden/Kleben, freies Schreiben – bewusst gemischt |
| 5 | **Scaffolding & Differenzierung** | drei Niveaus (Basis / Standard / Fordern), Musteraufgabe „So geht's“, Wortspeicher als Hilfe |
| 6 | **Layout-Raster & Piktogramme** | feste Zonen pro Seite; Icon-System (✂️ ausschneiden, ✏️ schreiben, 🎨 ausmalen, 👂 zuhören) – Kinder erkennen die Aufgabenart, bevor sie lesen können |
| 7 | **Lösungsteil** | Selbstkontrolle, damit Kind allein arbeiten kann |
| 8 | **Erprobung & Redaktion** | Test im Unterricht, Korrekturschleifen, ggf. Zulassungsgutachten |
| 9 | **Druck** | s/w-tauglich, korrekte Lineatur, als Kopiervorlage nutzbar |

→ **Erkenntnis für uns:** Ein Arbeitsheft braucht einen **Aufgaben-Baukasten** mit festen
Aufgabentypen und eine **Lösungsseite**, nicht einen Fließtext-Generator. Und: es muss
**auf s/w-Papier funktionieren**, weil es ausgedruckt und beschrieben wird.

## A.5 Das Destillat – sieben Prinzipien, die ins Produkt wandern

1. **Text vor Bild.** Immer. Bilder illustrieren eine fertige Geschichte.
2. **Umfang vor Inhalt.** Erst Seitenzahl/Doppelseiten festlegen, dann füllen.
3. **Figurenblatt vor Illustration.** Ohne Referenz keine Konsistenz.
4. **Billig scheitern.** Storyboard/Thumbnail-Stufe, bevor teure Bilder entstehen.
5. **Freigabe-Stationen.** Nach jeder Phase entscheidet ein Mensch, nicht die KI.
6. **Text bleibt Text.** Nie in Bilder hineingeneriert – sonst nicht vorlesbar, nicht änderbar.
7. **Jedes Werk hat eine Regelschicht** (Alter/Lesestufe/Lernziel), die alle Prompts steuert.

---

# TEIL B – Weiterer Tab oder getrennte App?

## B.1 Die Argumente

**Für eine getrennte App:**
- Andere Nutzungssituation (Erstellen am Tisch vs. Lesen im Bett)
- Andere Kostenstruktur – Bildgenerierung kostet im Gegensatz zur bisherigen Analyse echtes Geld
- LeseZauber bleibt schlank und schnell
- Klarere Erwartung: „Das hier ist ein Werkzeug, kein Lesegerät“

**Gegen eine getrennte App:**
- **Doppelter Code**: DB-Engine, Profile, Personas, TTS, Sanitizing, Backup, Bild-Utils, UI-Toasts –
  alles zweimal pflegen. Für ein Ein-Personen-Projekt ohne Build-Pipeline der größte Risikofaktor.
- **Bruch in der Nutzung**: Das fertige Buch müsste exportiert und in die andere App importiert
  werden, nur um es vorlesen zu lassen. Genau das will man nicht.
- **Zwei PWAs** = zwei Service Worker, zwei Caches, zwei API-Key-Eingaben, zwei Backups.
- Zwei Repos = zweimal `CACHE_NAME` hochzählen, zweimal Tailwind bauen, doppelte Fehlerquelle.

## B.2 Empfehlung: „Eine App, zwei Türen“

**Eine Code-Basis, ein Origin, ein IndexedDB – aber zwei Eingänge und ein sauber getrennter Bereich.**

Konkret in drei Stufen:

1. **Stufe 1 (MVP):** SchreibZauber ist ein Bereich *innerhalb* von LeseZauber.
   Einstieg über einen Button im Bibliotheks-Header (neben ⚙️ und 🎓).
   Neue Ansichten `viewStudio*`, neuer Namespace `app.studio`, neuer Object Store `projects`.
2. **Stufe 2:** Alle Studio-Module werden **lazy geladen** (gleiches Muster wie PDF.js/JSZip):
   Wer nie schreibt, lädt den Code nie.
3. **Stufe 3 (optional):** Zweite Einstiegsseite `schreiben.html` + `manifest-schreiben.json`
   mit `"start_url": "./schreiben.html"`, eigenem Namen („SchreibZauber“) und eigenem Icon.
   Ergebnis: **zwei installierbare App-Icons auf dem Homescreen**, gefühlt zwei Apps –
   aber gleicher Origin, also **gemeinsame IndexedDB**: Ein im SchreibZauber fertiggestelltes
   Buch taucht in LeseZauber ohne Import sofort auf. Und trotzdem nur *ein* Repo,
   *ein* Service Worker, *ein* Tailwind-Build.

Das ist der eigentliche Trick: Die Trennung, die der Nutzer will, ist eine **Trennung der
Oberfläche**, nicht des Codes. Getrennte Repos würden nur Wartungsschmerz erzeugen.

> **Namensvorschlag:** Produktfamilie „LeseZauber“ mit den Bereichen
> **📖 LeseZauber** (lesen) und **🪄 SchreibZauber** (machen).

---

# TEIL C – Produktkonzept SchreibZauber

## C.1 Drei Werktypen, ein Gerüst

| Werktyp | Profi-Vorbild | Ergebnis |
|---|---|---|
| **📕 Bilderbuch** | Verlags-Bilderbuch, 32 Seiten | Doppelseiten mit Illustration + wenig Text, vorlesbar |
| **💥 Comic / Heft** | Comic-Produktion, Script→Panels→Lettering | Panelseiten mit Sprechblasen als Overlay |
| **📝 Arbeitsheft** | Schulbuchverlag-Redaktion | Aufgabenseiten + Lösungsteil, druck- und s/w-tauglich |

Alle drei durchlaufen dasselbe 8-Stufen-Gerüst, nur mit unterschiedlichen Regeln und
unterschiedlichem Seitenbaukasten. Ein **Erstlesebuch** ist kein vierter Typ, sondern
das Bilderbuch mit dem Regelprofil „Leseanfänger“ (Silbenfarben, Fibelschrift, Sinnschritte).

## C.2 Die Werkstatt – acht Stufen, kindgerecht benannt

Die Reihenfolge ist 1:1 der Verlagsworkflow aus Teil A. Jede Stufe erzeugt ein
gespeichertes Zwischenprodukt und endet mit einer **menschlichen Freigabe**.
Rücksprung ist immer erlaubt; eine Stufe lässt sich auch komplett von Hand ausfüllen –
die KI ist Vorschlag, nie Zwang.

| Stufe | Profi-Begriff | In der App | Ergebnis im Datenmodell |
|---|---|---|---|
| **1. Die Idee** | Exposé | Wer liest das? Wie alt? Worum geht's? Was soll hängenbleiben? | `brief` |
| **2. Der Bauplan** | Umfangsplanung | Seitenzahl wählen (16/24/32, Vorgabe 32) → App rechnet Doppelseiten aus und zeigt das Wort-Budget an | `spec` |
| **3. Die Geschichte** | Manuskript + Text-Breakdown | KI schreibt den Text und verteilt ihn direkt auf Doppelseiten; Umblätter-Momente werden markiert | `manuscript`, `spreads[].text` |
| **4. Die Figuren** | Character Sheet | Pro Figur ein Steckbrief (Aussehen, Kleidung, Farben, Eigenart) + **ein generiertes Figurenblatt** als Referenzbild | `characters[]` |
| **5. Das Daumenkino** | Thumbnails / Storyboard | Miniatur-Raster aller Doppelseiten: Text + Bildidee als Stichwort, noch **ohne** echte Bilder. Verschieben, zusammenfassen, löschen | `spreads[].sketchPrompt` |
| **6. Die Bilder** | Reinzeichnung | Jetzt erst werden Bilder generiert – einzeln, mit Figurenblatt als Referenz, mit sichtbarem Kostenzähler | `spreads[].imgUrl` |
| **7. Das Layout** | Satz & Typografie | Textposition pro Seite (oben/unten/links/rechts), Schriftgröße, Silbenfarben, Sprechblasen-Platzierung | `spreads[].layout` |
| **8. Fertig!** | Druckvorstufe + Auslieferung | „Ins Regal stellen“ (→ echtes LeseZauber-Buch) und/oder „Drucken/PDF“ | Buch in `app.library` |

### Warum Stufe 5 vor Stufe 6 nicht übersprungen werden darf

Das ist der wichtigste didaktische *und* wirtschaftliche Punkt des ganzen Konzepts:
Ein 32-seitiges Bilderbuch hat 12–14 Doppelseiten. Wird jedes Bild einmal generiert und
zweimal korrigiert, sind das ~40 Bildaufrufe. Beim aktuellen Preis von grob **0,07 $ pro Bild**
(1K-Auflösung) sind das ~3 $ pro Buch – akzeptabel. Ohne Storyboard-Stufe, mit Neugenerierung
des ganzen Buchs bei jeder Textänderung, wird daraus schnell das Fünffache.
**Das Storyboard ist die Kostenbremse**, genau wie im Verlag.

## C.3 Die Figuren-Bibel (Story Bible)

Ein eigener, dauerhaft gespeicherter Bereich pro Projekt – und optional projektübergreifend,
damit dieselbe Lieblingsfigur in mehreren Heften auftauchen kann.

Pro Figur:
- **Steckbrief** (Text): Name, Alter, Art (Kind/Tier/Fantasiewesen), Aussehen, Kleidung,
  drei Farbwerte, eine unverwechselbare Eigenart („trägt immer eine rote Mütze“)
- **Figurenblatt** (Bild): eine generierte Ansicht mit mehreren Posen/Mimiken
- **Stilkarte** pro Projekt: Aquarell / Buntstift / Comic / Cut-Out / 3D-freundlich,
  Farbstimmung, Linienstärke

Beides wird bei **jeder** Bildgenerierung mitgeschickt: Figurenblatt als Referenzbild,
Steckbrief + Stilkarte als Text. Das aktuelle Gemini-Bildmodell nimmt mehrere Referenzbilder
(Größenordnung: bis ~4 Figuren-Referenzen und ~10 Objekt-Referenzen) entgegen – genau das
Werkzeug, das der Character-Sheet-Schritt der Profis braucht.

**Regel:** Ändert sich das Figurenblatt, werden bereits generierte Seiten **nicht** automatisch
neu erzeugt. Sie werden nur als „Figur veraltet“ markiert, mit einem Knopf „neu zeichnen“.
(Gleiche Philosophie wie beim bestehenden Persona-System: keine stillen Massen-API-Aufrufe.)

## C.4 Arbeitsheft-Modus im Detail

Statt Stufe 3–5 „Geschichte/Figuren/Daumenkino“ läuft hier:

- **Stufe 3': Lernziel** – Klassenstufe, Fach, Kompetenz („Zahlenraum bis 20“, „Wörter mit ie“),
  formuliert als „Das Kind kann …“
- **Stufe 4': Progression** – die KI schlägt eine Kapitelfolge vor (vom Leichten zum Schweren,
  mit Wiederholungsseiten). Ergebnis ist eine Liste von Seitenzielen.
- **Stufe 5': Aufgabenbaukasten** – pro Seite werden 1–3 Aufgaben aus festen Typen gewählt:

  | Typ | Icon | Generierbar als |
  |---|---|---|
  | Zuordnen (Linien ziehen) | 🔗 | zwei Spalten mit Begriffen/Bildern |
  | Lückentext | ✏️ | Satz mit `___` + Wortspeicher |
  | Ankreuzen | ☑️ | Frage + 3 Antworten |
  | Nachspuren | 〰️ | Wort in Konturschrift |
  | Ausmalen nach Regel | 🎨 | Ausmalbild + Regel („alle 5er rot“) |
  | Rechnen | ➕ | Aufgabenraster |
  | Suchsel / Rätsel | 🔍 | Buchstabengitter |
  | Schneiden & Kleben | ✂️ | Schnipselreihe + Zielfeld |
  | Frei schreiben | 📝 | Impuls + Lineatur |

- **Differenzierung**: jede Seite kann in drei Niveaus erzeugt werden (⭐ / ⭐⭐ / ⭐⭐⭐)
- **Selbstkontrolle**: automatisch erzeugter **Lösungsteil** am Heftende
- **Druckregel**: Arbeitsheftseiten werden **s/w-tauglich** und mit ausreichend Schreibfläche
  layoutet; Bilder nur als Dekoration oder Ausmalvorlage, nie als Informationsträger, der in
  Graustufen verschwindet.

## C.5 Was am Ende herauskommt

Drei Ausgabewege, alle ohne Server:

1. **„Ins Regal stellen“** – das Projekt wird in ein normales LeseZauber-Buch umgewandelt
   (`pages[]` mit `variants`, Cover gesetzt). Ab dann greifen Vorlesen, Persona-Wechsel,
   Wort-Hervorhebung, Vokabeltrainer, Buch-Quiz und Vollbild-Modus **ohne Zusatzcode**.
   *Das ist der größte Hebel des gesamten Konzepts.*
2. **Drucken / PDF** – über die bestehende Druckansicht, erweitert um Doppelseiten-Layout,
   Beschnittzugabe und Bundsteg-Reserve. Ein Bilderbuch für den heimischen Drucker,
   ein Arbeitsheft als Kopiervorlage.
3. **Projekt-Datei** – Export/Import wie bei Büchern, damit ein Werk auf ein anderes Gerät
   (oder an Oma) wandern kann.

---

# TEIL D – Technische Umsetzung

Alles folgt den bestehenden Konventionen aus `CLAUDE.md`: deutsche Kommentare, `// NEU:`-Marker,
`app.utils.sanitize()` vor jedem `innerHTML`, keine stillen Fehler, neue Datei statt
aufgeblähter Bestandsdatei.

## D.1 Datenmodell

Ein **Projekt** ist bewusst NICHT dasselbe wie ein Buch. Ein Buch ist das Ergebnis,
ein Projekt ist die Werkstatt drumherum.

```js
// app.studio.projects[projectId]
{
  id, type: 'picturebook' | 'comic' | 'workbook',
  title, created, updated, profileId,
  stage: 1..8,                       // aktuelle Stufe der Werkstatt

  brief: {                           // Stufe 1 – Exposé
    audienceAge: '3-5' | '6-7' | '8-10',
    readingLevel: 'vorlesen' | 'erstleser' | 'selbstleser',
    topic, tone, message,
    language: 'de'
  },

  spec: {                            // Stufe 2 – Bauplan
    totalPages: 32,                  // 16 / 24 / 32 / 40 (durch 16 bzw. 8 teilbar)
    storySpreads: 13,                // automatisch: (totalPages - 8) / 2
    wordBudget: 550,                 // Richtwert aus audienceAge
    trim: 'a5-quer' | 'a5-hoch' | 'a4-hoch'
  },

  style: {                           // Stilkarte – steuert JEDE Bildgenerierung
    look: 'aquarell' | 'buntstift' | 'comic' | 'cutout',
    palette: ['#...', '#...'],
    lineWeight: 'weich' | 'kraeftig',
    extraPrompt: ''
  },

  characters: [{                     // Stufe 4 – Figuren-Bibel
    id, name, role,
    sheetText,                       // Steckbrief für den Prompt
    sheetImgUrl,                     // generiertes Figurenblatt (WebP)
    sheetThumbUrl
  }],

  spreads: [{                        // Stufen 3, 5, 6, 7
    id,
    index,
    text,                            // Manuskripttext dieser Doppelseite
    pageTurnHook,                    // markierter Umblätter-Moment
    sketchPrompt,                    // Bildidee aus dem Storyboard (Stufe 5)
    imagePrompt,                     // ausformulierter Prompt (Stufe 6)
    imgUrl, thumbUrl,                // generiertes Bild, WebP, zwei Größen
    imageStatus: 'idle'|'queued'|'generating'|'done'|'error',
    characterIds: [],                // welche Figuren-Referenzen mitgeschickt werden
    layout: { textPos: 'unten', fontScale: 1, syllableColors: false },
    balloons: [                      // nur Comic: Text bleibt HTML, nie im Bild
      { id, x, y, w, tail: 'links-unten', speakerId, text }
    ]
  }],

  worksheet: {                       // nur Arbeitsheft
    goal, grade, subject,
    chapters: [{ title, goal, pages: [{ tasks: [{ type, level, data, solution }] }] }]
  },

  costLog: { imageCalls: 0, textCalls: 0, estimatedUsd: 0 }
}
```

**Bewusste Entscheidungen:**
- Bilder werden wie bisher als **WebP in zwei Größen** abgelegt (`app.utils.createImageVariants`),
  damit ein Projekt den Speicher nicht sprengt.
- `imageStatus` sitzt pro Doppelseite, damit Fehler einzeln nachgeholt werden können –
  exakt das Muster, das sich beim Seiten-`status` im Scanner bewährt hat.
- `costLog` ist Pflicht, nicht Deko: Bildgenerierung ist der erste Teil der App, der
  spürbar Geld kostet.

## D.2 Neue Dateien

```
js/studio/
  studioCore.js        app.studio-Namespace, Projekt-CRUD, Stufen-Logik
  studioApi.js         KI-Aufrufe: Manuskript, Breakdown, Figurenblatt, Bildgenerierung
  studioPrompts.js     ALLE Prompt-Bausteine an einem Ort (Regelprofile je Alter/Typ)
  studioExport.js      Projekt → LeseZauber-Buch, Druckansicht, Projekt-Datei
  worksheet.js         Aufgabenbaukasten + Lösungsteil
  balloons.js          Sprechblasen-Overlay (Comic)

js/render/
  studioLibrary.js     Projektübersicht („Meine Werkstatt“)
  studioWizard.js      Die 8 Stufen als Ansicht
  studioStoryboard.js  Daumenkino-Raster
  studioSpread.js      Einzelne Doppelseite bearbeiten
```

`js/main.js` bekommt **einen** zusätzlichen Import (`./studio/studioCore.js`); alles Weitere
lädt `studioCore.js` per dynamischem `import()` beim ersten Öffnen der Werkstatt nach –
gleiches Muster wie PDF.js/JSZip. Damit bleibt der Kaltstart für Leser:innen unverändert.

## D.3 Speicher

`js/db.js`: **`DB_VERSION` auf 3 erhöhen**, neuer Object Store `projects` (`keyPath: 'id'`)
in `onupgradeneeded` anlegen. Bestehende Bücher und Vokabeln bleiben unangetastet
(die Migration von Version 2 auf 3 fügt nur hinzu, löscht nichts).
`app.dbOps` bekommt `saveProject()` / `deleteProject()` / Laden in `init()`.

## D.4 KI-Aufrufe

`js/api.js` bleibt für die Lese-Seite zuständig; die Werkstatt bekommt eigene Funktionen
in `studioApi.js`, die aber dieselben Keys und dieselbe Fallback-Logik nutzen.

**Textaufrufe** (gleiche Bauart wie `generateBookQuiz`, reines JSON zurück):
- `generateManuscript(brief, spec)` → Fließtext + direkte Aufteilung auf Doppelseiten
- `refineSpread(spreadText, rule)` → einzelne Seite umschreiben („kürzer“, „lustiger“, „Silben“)
- `suggestCharacters(manuscript)` → Figuren-Steckbriefe aus dem Text ableiten
- `suggestSketches(spreads, characters)` → Bildideen fürs Storyboard (**ohne** Bildaufrufe!)
- `generateWorksheetPlan(goal, grade)` / `generateTasks(pageGoal, level)`

**Bildaufrufe** – neu für dieses Projekt:
- Modell: `gemini-3.1-flash-image` (Stand 09/2026; wie bei `GEMINI_MODEL` als **eine Konstante**
  ganz oben in der Datei, damit ein Modellwechsel eine Zeile ist)
- Aufruf über `generateContent` mit Bild-Ausgabe, Seitenverhältnis über die Bild-Konfiguration
  (Bilderbuch quer 4:3 oder 3:2, Comic-Seite hoch 3:4, Figurenblatt 1:1)
- Referenzbilder: Figurenblatt/Stilreferenz werden als zusätzliche `inlineData`-Teile mitgeschickt
- **Wichtig:** Der Bild-Endpunkt ist nach aktuellem Stand **nicht** im kostenlosen Kontingent.
  Vor dem Bau ist zu prüfen, ob der bestehende Key abrechnungsfähig ist. Bis dahin muss die
  Werkstatt auch **ohne Bildgenerierung** vollständig nutzbar sein (siehe D.6).

**Prompt-Leitplanken** (in `studioPrompts.js`, an *jedem* Aufruf beteiligt):
- Zielgruppe ist immer explizit: Alter, Lesestufe, Sprache
- Harte Inhaltsregeln: keine Gewalt, keine Angstbilder, keine realen Personen,
  keine Markennamen, keine Schrift im Bild
- Bilderbuch: „Text erscheint NICHT im Bild. Lass in der Zone `<textPos>` eine ruhige,
  kontrastarme Fläche frei.“
- Comic: „Keine Sprechblasen zeichnen. Freiraum oben/unten für Blasen lassen.“
- Arbeitsheft: „Klare Konturen, wenig Fläche, funktioniert in Graustufen.“

## D.5 Bild-Konsistenz – die eigentliche technische Kernfrage

Reihenfolge der Maßnahmen, von wichtig nach ergänzend:

1. **Figurenblatt zuerst generieren** (einmal pro Figur) und als Referenzbild an *jede*
   Seitengenerierung anhängen.
2. **Stilkarte als wörtlich identischer Textblock** in jedem Prompt – kein freies Umformulieren.
3. **Seed-artige Wiederverwendung:** Für eine neue Seite zusätzlich das zuletzt akzeptierte
   Bild derselben Figur als zweite Referenz mitgeben („so sah sie auf der Seite davor aus“).
4. **Nur die Figuren referenzieren, die auf der Seite vorkommen** (`characterIds`) –
   sonst drängen sich ungefragt Nebenfiguren ins Bild.
5. **Varianten statt Neustart:** Ein „🎲 Nochmal“-Knopf erzeugt maximal 3 Alternativen pro Seite,
   die nebeneinander stehen. Gewählt wird von Hand. Das begrenzt Kosten und erzwingt Kuratierung.

## D.6 Kosten, Kontrolle und der bildfreie Notbetrieb

- **Sichtbarer Zähler** in der Werkstatt: „Bilder erzeugt: 14 · geschätzt ca. 0,95 $“
- **Budgetgrenze pro Projekt** in den Einstellungen (Vorgabe z. B. 50 Bilder), danach Nachfrage
- **Kein Auto-Generieren.** Die bestehende Hintergrund-Vorbereitung (`backgroundPregen.js`)
  wird **nicht** auf Bilder ausgeweitet – Textvarianten sind billig, Bilder nicht.
- **Notbetrieb ohne Bild-API:** Jede Doppelseite funktioniert auch mit
  (a) einem **Platzhalter** in exakt der späteren Zielgröße (bereits gebaut, siehe D.6a),
  (b) einem selbst fotografierten/gemalten und hochgeladenen Bild – das Kind malt, das Handy
  fotografiert, die App setzt es ein (pädagogisch sogar die schönere Variante), oder
  (c) dem **Prompt-Export**: die App baut den Prompt, erzeugt wird kostenlos im AI Studio,
  das Ergebnis kommt per Upload zurück.
  So ist die Werkstatt ab Tag eins nutzbar, auch wenn die Bildgenerierung noch nicht freigeschaltet ist.

## D.6a Bildquellen-Schicht (bereits gebaut)

Damit die Frage „welcher Bildanbieter?" die Werkstatt nicht blockiert, liegt zwischen
„ich brauche ein Bild" und „woher kommt es" eine Adapter-Schicht. Der übrige Code kennt
nur `app.studio.imageSource.request(quelle, spec)` und bekommt immer dieselbe Form
`{ full, thumb, meta }` zurück.

Vorhanden unter `js/studio/` (noch nicht in `main.js` verdrahtet):

- `imageFormats.js` – Formatkatalog: acht Bildformate mit fester Zielgröße, Seitenverhältnis
  und Textzone. Der einzige Ort, an dem Maße stehen.
- `placeholder.js` – Platzhalter in exakt der Zielgröße, mit eingezeichneter Textzone und
  mitgeführter Bildidee.
- `imageSource.js` – einheitlicher Prompt-Bauplan plus die Quellen `placeholder` und `upload`.

Weil `meta.prompt` **auch beim Platzhalter** gespeichert wird, ist „alle Platzhalter ersetzen"
später ein einfacher Durchlauf über alle Seiten mit `meta.source === 'placeholder'` – der
Prompt muss nie neu erdacht werden. Anbietervergleich und Austausch-Mechanik im Detail:
[`KONZEPT-Bildquellen.md`](KONZEPT-Bildquellen.md).

## D.7 Druck und Export

- Doppelseiten-Druckansicht mit `@page`-Regeln, Beschnittzugabe und Bundsteg-Reserve
- Arbeitsheft: reine s/w-Ausgabe, eine Aufgabenseite pro Blatt, Lösungsteil am Ende
- Comic: Blasen werden als HTML-Overlay mitgedruckt (kein Bildeinbrennen nötig)
- Bestehende `actions/backup.js` wird um Projekte erweitert, damit ein Backup wirklich alles enthält

## D.8 Pflichtschritte bei der Umsetzung (aus `CLAUDE.md`)

- Tailwind **nach jeder Klassenänderung** neu bauen
- `sw.js`: `CACHE_NAME` hochzählen **und** alle neuen Dateien in `APP_SHELL` eintragen
- Alle vier Sanity-Checks vor jedem Commit laufen lassen
- Version hochzählen: dieses Feature ist ein Minor-Sprung (→ `v0.10.0-beta` beim MVP)

---

# TEIL E – Ausbaustufen

| Stufe | Inhalt | Ergebnis für die Familie |
|---|---|---|
| **1 – Fundament** | Projekt-Datenmodell, DB v3, Werkstatt-Übersicht, Stufen 1–3 (Idee, Bauplan, Geschichte), Platzhalter-Bilder, Prompt-Kopier-Knopf, Export „ins Regal“ mit Textseiten | Man kann eine eigene Geschichte schreiben lassen, aufteilen, vorlesen lassen. **Ohne einen einzigen Bildaufruf.** |
| **2 – Bilder** | Stilkarte, Figuren-Bibel, Figurenblatt, Storyboard, Bildgenerierung pro Doppelseite, Kostenzähler | Das erste richtige, selbst gemachte Bilderbuch |
| **3 – Layout & Druck** | Textplatzierung, Silbenfarben, Erstleser-Regelprofil, Doppelseiten-Druck | Ein Buch, das man ausdrucken und verschenken kann |
| **4 – Arbeitsheft** | Lernziel, Progression, Aufgabenbaukasten, Differenzierung, Lösungsteil, s/w-Druck | Übungshefte passend zum aktuellen Schulstoff |
| **5 – Comic** | Panel-Layouts, Sprechblasen-Overlay, Comic-Stilregeln | Eigene Comic-Hefte |
| **6 – Politur** | Zweite Einstiegsseite `schreiben.html` + eigenes Manifest, projektübergreifende Figuren, Vorlagen („Gute-Nacht-Geschichte“, „Geburtstagsbuch“) | Fühlt sich wie eine eigene App an |

Jede Stufe ist für sich benutzbar und lieferbar. Stufe 1 hat den besten Nutzen-pro-Aufwand
und sollte zuerst gebaut werden.

---

# TEIL F – Risiken und bewusste Grenzen

| Risiko | Umgang |
|---|---|
| **Bildgenerierung kostet Geld** (anders als bisher alles) | Kostenzähler, Budgetgrenze, kein Auto-Generieren, vollwertiger Notbetrieb ohne Bilder |
| **Figuren sehen auf jeder Seite anders aus** | Figurenblatt-Referenz + Stilkarte + Vorseiten-Referenz; im Zweifel weniger Figuren pro Seite |
| **Speicherplatz** – ein illustriertes Projekt ist groß | WebP in zwei Größen, Storyboard ohne Bilder, Speicheranzeige (existiert bereits) einbeziehen |
| **KI schreibt Schrift ins Bild** | Prompt-Leitplanke + Text grundsätzlich als HTML-Ebene, nie im Bild |
| **App wird zu groß / Start zu langsam** | Studio-Module komplett lazy laden |
| **Unpassende Inhalte** | Harte Prompt-Leitplanken, Zielalter in jedem Aufruf, Vorschau-Freigabe durch Erwachsene vor „Ins Regal stellen“ |
| **Urheberrecht** | Keine realen Figuren/Marken im Prompt zulassen - **verschärft seit der Veröffentlichungsabsicht** (s.u.), nicht nachträglich in Stufe 1 nachrüstbar |
| **Scope-Falle** | Reihenfolge der Ausbaustufen einhalten. Stufe 1 ohne Bilder ist ein vollständiges Feature, kein Torso |

**Bewusst NICHT vorgesehen** (passt nicht zur Server-losen Architektur):
- **Automatisierte** Buchbestellung/Print-on-Demand-**Anbindung** (kein API-Upload zu KDP o.ä.
  - das bräuchte einen Server/Account-Flow außerhalb der reinen Client-Architektur). Ein
  **manueller** druckfertiger Export für die eigenhändige Einreichung bei KDP ist dagegen
  jetzt Ziel, siehe unten
- Geteilte Projekte / gemeinsames Bearbeiten über mehrere Geräte in Echtzeit
- Vertonung als Audiodatei (braucht eine Sprach-API mit Dateiausgabe, siehe README)

---

## Nachtrag: Veröffentlichung von Anfang an mitdenken (entschieden, Sept. 2026)

Bisher ging dieses Konzept von reiner Privatnutzung aus. Jetzt: Werke sollen veröffentlichbar
sein (z.B. Amazon KDP als Self-Publishing), private Nutzung bleibt der Alltagsfall daneben.

**Amazon KDP verlangt seit 2025/26 verschärft durchgesetzt eine Offenlegung**, ob Text,
Bilder oder Übersetzungen von KI erzeugt wurden - auch bei starker Nacharbeit. Die Kette bei
Nicht-Offenlegung eskaliert (Hinweis → Aussetzung → Entfernung → Konto-Vermerk → im
Wiederholungsfall Sperre). Die Offenlegung selbst ist intern bei Amazon, erscheint nicht auf
der Produktseite und beeinflusst laut Amazon weder Tantiemen noch Ranking - **kein
Hindernis**, aber eine Pflichtangabe, die ehrlich "ja" lauten muss (Text UND Bilder sind hier
KI-generiert).

**Zwei konkrete Konsequenzen für die Planung:**
- **Stufe 1 (Prompt-Leitplanken) muss von Anfang an strenger sein.** Keine bekannten
  Figuren/Marken/Stile, die bei Veröffentlichung zum Problem würden - das lässt sich nicht
  sauber nachrüsten, wenn Stufe 1 erst auf "nur privat" ausgelegt gebaut wird.
- **Stufe 3 (Layout & Druck) sollte gleich druckfertige Exportformate mitdenken**, nicht nur
  "für den eigenen Drucker reicht's". KDP hat konkrete technische Vorgaben für
  Print-on-Demand-Bilderbücher (i.d.R. 300 dpi, Randabstand/Bleed, PDF-Exportformat, ISBN -
  die KDP kostenlos vergibt). Diese Eckdaten vor dem Bau von Stufe 3 einmal aktuell
  verifizieren, sie waren zum Zeitpunkt dieses Nachtrags nicht abschließend prüfbar.

**Die Reihenfolge der Ausbaustufen ändert sich dadurch NICHT** - Stufe 1 zuerst, ohne Bilder,
bleibt richtig. Nur der Anspruch an Stufe 1 und 3 steigt von Anfang an.

---

# TEIL G – Offene Fragen an den Nutzer

Diese Punkte sollten vor Umsetzungsbeginn geklärt werden:

1. **Bild-API freigeschaltet? - noch offen, braucht eine Antwort vom Betreiber.**
   Ist der bestehende Google-Account abrechnungsfähig? Erklärung, weil die Frage zunächst
   unklar war: Die heutige App nutzt Gemini nur zum *Analysieren* vorhandener Fotos - dafür
   reicht der bestehende kostenlose API-Key. Stufe 2 (Bilder) will Gemini dagegen neue Bilder
   *erzeugen* - dafür verlangt Google in der Regel eine hinterlegte Zahlungsmethode am
   Google-Cloud-Projekt, auch wenn der Preis pro Bild klein ist (~0,04 $, siehe
   `COMIC-ADAPTION-TODO.md`). **Zu prüfen:** Hat das Google-Konto hinter dem aktuellen
   API-Key eine Zahlungsmethode hinterlegt? Falls nein/unsicher: kein Blocker - Stufe 1
   (ohne Bilder) bauen und Kinderzeichnungen fotografieren, das ist ohnehin charmanter.
2. ~~**Zwei Icons oder eines?**~~ **✅ beantwortet (Sept. 2026): beides, als Stufen.** Stufe 1-5
   als Tab/Button in LeseZauber, Stufe 6 optional das zweite Homescreen-Icon
   (Icon-Idee: magischer Stift/Federkiel) - siehe Kernempfehlung Punkt 5 oben.
3. ~~**Welcher Werktyp zuerst?**~~ **✅ beantwortet (Sept. 2026): keine feste Reihenfolge -
   nach Stufe 1 parallel.** Statt "erst Bilderbuch, dann Arbeitsheft" sollen die
   Werktyp-Pfade mit mehreren gleichzeitigen Claude-Code-Sitzungen parallel entwickelt
   werden. Funktioniert mit dieser Architektur gut: `js/actions/<name>.js` +
   `js/render/<name>.js` pro Feature hält Parallel-Arbeit konfliktarm (praktisch erprobt
   beim Zusammenführen von acht parallelen Zweigen dieses Projekts - die wenigen
   Berührungspunkte waren `main.js`-Imports, `sw.js`-Dateiliste, `index.html`-Navigation,
   alle klein und mechanisch lösbar). **Bedingung:** Stufe 1 (Fundament: Datenmodell, DB v3,
   Werkstatt-Übersicht) zuerst fertig bauen und mergen, *bevor* parallele Sitzungen für
   Stufe 2+3 (Bilderbuch-Pfad) und Stufe 4 (Arbeitsheft-Pfad) starten - beide Pfade bauen
   auf Stufe 1 auf, nicht aufeinander, sonst laufen sie schnell auseinander.
4. **Budgetgrenze - teilweise beantwortet (Sept. 2026).** Der Betrag selbst wird persönlich
   beim jeweiligen Anbieter gedeckelt (Google Cloud/ElevenLabs/OpenAI-Ausgabenlimit), nicht
   in der App - die App kann ohne Server ohnehin keine harte Grenze durchsetzen. **Neue Idee
   daraus, aufgenommen:** ein Tarif-Lock, der vor einem *versehentlichen* Wechsel in eine
   teurere Preisstufe warnt (z.B. eine teurere Stimmen-Kategorie oder Bildqualität) - siehe
   `docs/ROADMAP.md`, Kleine Ideen. Betrifft nicht nur SchreibZauber, sondern auch die
   bestehenden TTS-Einstellungen.

Verbleibend offen: nur noch 1 (Zahlungsmethode am Google-Konto).

---

## Quellen

Bilderbuch- und Verlagsworkflow:
- [Wie entsteht ein Kinderbuch?](https://www.kinderbuchillustration.ch/wie-entsteht-ein-kinderbuch)
- [Bilderbuch-Doppelseiten – Schau Genau](https://schau-wie-schlau.ch/buchaufbau/bilderbuch-doppelseiten/)
- [In vier Schritten zum Bilderbuch – Autorenwelt](https://www.autorenwelt.de/blog/federwelt/vier-schritten-zum-bilderbuch)
- [Die optimale Textlänge bei Kinderbüchern – Autorenwelt](https://www.autorenwelt.de/blog/federwelt/die-optimale-textlaenge-bei-kinderbuechern)
- [Seitenzahl durch 16 teilbar – schriftgestaltung.com](https://schriftgestaltung.com/schriftlexikon/schriftgeschichte/seitenzahl.html)
- [Titelei: die wichtigsten Tipps – BoD](https://blog.bod.de/wissen/titelei-die-wichtigsten-tipps/)
- [Anatomy of a 32 Page Picture Book – Frayne House Press](https://champandnessie.com/2019/11/06/anatomy-of-a-32-page-picture-book/)
- [Process, Creation and Audience: the 32 page picture book – Books For Keeps](https://booksforkeeps.co.uk/article/process-creation-and-audience-the-32-page-picture-book/)
- [The Step-by-Step Illustration Workflow for Picture Books – Prepress Pro](https://www.prepresspro.com/blog/step-by-step-illustration-workflow-for-picture-books/)
- [Storyboarding for Children's Books – US Illustrations](https://www.usillustrations.com/blog/the-art-of-storyboarding-for-childrens-books-tips-and-techniques)
- [How to Illustrate a Children's Book – US Illustrations](https://www.usillustrations.com/blog/how-to-illustrate-childrens-book)
- [Children's Book Template – Reedsy](https://blog.reedsy.com/guide/how-to-self-publish-a-childrens-book/children-book-template/)

Comic-Produktion:
- [Overview Of The Comic Creation Process – Making Comics](https://makingcomics.com/2014/01/16/overview-comic-creation-process/)
- [How Comic Books Are Made — From Script to Print](https://www.comicory.com/blog/how-comic-books-are-made)
- [Comic Book Creation Process – Dauntless Stories](https://dauntlessstories.com/comic-book-creation-process/)

Arbeitsheft / Lehrmittel-Redaktion:
- [Arbeitshefte für die Grundschule – Cornelsen](https://www.cornelsen.de/sortiment/arbeitshefte/grundschule)
- [Arbeitshefte Grundschule – Auer Verlag](https://www.auer-verlag.de/arbeitshefte)
- [Arbeitshefte mit wenigen Klicks erstellen und drucken – bildungsklick](https://bildungsklick.de/schule/detail/arbeitshefte-mit-wenigen-klicks-erstellen-und-drucken)
- [Silbenmethode für Erstleser – Hugendubel](https://www.hugendubel.de/de/category/95966/silbenmethode.html)
- [Instructional Scaffolding – Wikipedia](https://en.wikipedia.org/wiki/Instructional_scaffolding)
- [Scaffolding Template for Differentiated Instruction – Teaching Channel](https://www.teachingchannel.com/k12-hub/downloadable/scaffolding-template-for-differentiated-instruction/)
- [Scaffolding Instruction for All Students (NYSED)](https://www.nysed.gov/sites/default/files/programs/curriculum-instruction/grade7mathscaffoldingguide.pdf)

Bildgenerierung (technisch):
- [Gemini Developer API pricing](https://ai.google.dev/gemini-api/docs/pricing)
- [Gemini 3.1 Flash Image – Google Cloud Documentation](https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/gemini/3-1-flash-image)
- [Generate images with Gemini – Google Cloud Documentation](https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/capabilities/image-generation)
- [Generating Consistent Imagery with Gemini – Google Codelabs](https://codelabs.developers.google.com/gemini-consistent-imagery-notebook)
