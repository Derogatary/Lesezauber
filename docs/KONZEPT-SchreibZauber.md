# 🪄 Konzept: SchreibZauber – Schreib- und Generierungs-Tab für LeseZauber Pro

**Stand:** 16.09.2026 · **Status:** Konzept · **Bezug:** `CLAUDE.md`, `README.md`

> **Ergänzendes Dokument:** [`KONZEPT-Bildquellen.md`](KONZEPT-Bildquellen.md) bewertet die
> kostenlosen und kostenpflichtigen Wege, an die Bilder zu kommen, und beschreibt das
> bereits gebaute Platzhalter-Fundament (`js/studio/`) samt Austausch-Mechanik.
>
> **Ergänzendes Dokument:** [`KONZEPT-Comic.md`](KONZEPT-Comic.md) - der Comic/Heft-Werktyp
> (Stufe 5) teilt Prompt-Lektionen und die Panel-Layout-Bibliothek mit dem dort
> beschriebenen, separaten Illustrations-Vorhaben für vorhandene EPUB-Kapitel.

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
- Comic: **nicht** negativ formulieren ("Keine Sprechblasen zeichnen" hat im
  Testlauf zu `docs/KONZEPT-Comic.md` genau eine gemalte Sprechblase erzeugt -
  Bildmodelle reagieren auf erwähnte Begriffe, nicht zuverlässig auf Verneinungen).
  Stattdessen rein visuell beschreiben: „Oben/unten ein unbedeckter
  Hintergrundbereich ohne Figuren/Objekte/Details, ca. ein Fünftel der Bildfläche.“
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
| ~~**4 – Arbeitsheft**~~ | ✅ **gebaut** (Branch `claude/schreibzauber-stufe4-arbeitsheft`, noch nicht in `main`) - Lernziel, Progression, Aufgabenbaukasten (5 von 9 Typen), Differenzierung, Lösungsteil, s/w-Druck | Übungshefte passend zum aktuellen Schulstoff |
| ~~**5 – Comic**~~ | ✅ **gebaut** (siehe "Stand nach Stufe 5" unten) - echte Panel-Layouts (1-4/Seite), Sprechblasen pro Panel, Geräuschwörter, comicfähiger Druck (seit v0.28.0-beta) | Eigene Comic-Hefte, ausdruckbar |
| **6 – Politur** | ⚠️ **teilweise gebaut** (siehe "Stand nach Stufe 5" unten) - Vorlagen und projektübergreifende Figuren fertig, zweite Einstiegsseite `schreiben.html` + eigenes Manifest bewusst NICHT umgesetzt | Fühlt sich wie eine eigene App an |

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

## Nachtrag: KDP-Druckvorgaben recherchiert (Sept. 2026, vor dem Bau von Ausbaustufe 3)

Wie oben angekündigt vor dem Bau des Doppelseiten-Drucks recherchiert (Webrecherche, Stand
September 2026, keine eigene Testeinreichung bei KDP). Ergebnis - jetzt konkret, nicht mehr
"vermutet":

- **Auflösung:** mindestens 300 dpi bei der finalen Druckgröße. Unterhalb davon lehnt KDP
  entweder ab oder das Ergebnis wirkt sichtbar verpixelt - bei den großformatigen,
  randabfallenden Bildern eines Bilderbuchs besonders auffällig.
- **Farbraum:** KDP empfiehlt CMYK (das Druckverfahren selbst arbeitet in CMYK); viele
  Selfpublisher liefern trotzdem RGB, KDP konvertiert dann selbst - Ergebnis kann sich in
  Nuancen leicht vom Bildschirm unterscheiden.
- **Bleed (Beschnittzugabe):** 0,125 Zoll (≈ 3 mm) auf allen Seiten, an denen ein Bild bis zum
  Papierrand reichen soll - das Dokument muss also 3 mm größer angelegt werden als das
  spätere Trimm-Format, und randnahe Bildinhalte müssen diese Zugabe mit abdecken.
- **Sicherheitsabstand für Text:** mindestens 0,25 Zoll (≈ 6,4 mm) vom Trimm-Rand entfernt -
  wichtig für die Textzonen-Platzierung in Stufe 7 ("Das Layout").
- **Seitenformat der Einreichung:** KDP erwartet **Einzelseiten**, keine Doppelseiten-Spreads
  als eine PDF-Seite. Eine im Bilderbuch als EIN Bild angelegte Doppelseite muss für eine
  KDP-Einreichung also in zwei Einzelseiten (links/rechts) aufgeteilt werden, deren
  Bildinhalt über den Bundsteg hinweg optisch zusammenpasst.
- **Format/Dateityp:** eingebettete Schriften, PDF ohne Bleed lässt KDP auch aus DOC/DOCX/RTF
  konvertieren - mit Bleed (also praktisch bei jedem Bilderbuch mit randabfallenden Bildern)
  wird ein fertiges PDF erwartet.
- **ISBN:** vergibt KDP beim Veröffentlichen kostenlos selbst (keine eigene Beschaffung nötig) -
  die genaue Pflicht-Platzierung auf dem Umschlag (Barcode-Zone hinten unten) wurde in dieser
  Recherche nicht bis ins letzte Detail (exakte mm-Zone/Freifläche) verifiziert.

**Konsequenz für Ausbaustufe 3 (siehe "Stand nach Stufe 3" unten):** Der zunächst gebaute
Doppelseiten-Druck lieferte einen soliden Export fürs eigene/private Ausdrucken bzw.
"als PDF speichern" - bewusst noch nicht KDP-fertig. Was für eine echte KDP-Einreichung
zusätzlich fehlte, war konkret benennbar (statt vage "muss noch geprüft werden"):
1. echter 3 mm-Übermaßzuschlag statt nur eines optischen Randabfallend/Mit-Rand-Umschalters,
2. ~~Aufteilung jeder Doppelseite in zwei einzelne Trimm-Seiten für die Einreichung~~ -
   **gegenstandslos:** eine "Doppelseite" ist in dieser Architektur von Anfang an bereits EINE
   physische Druckseite (bei "A5 quer" ein Querformat-Blatt, sonst ein Hochformat-Blatt), kein
   zwei Buchseiten überspannendes Bild. Es gibt nichts aufzuteilen - diese Vorab-Vermutung hat
   sich beim tatsächlichen Bau als falsch herausgestellt.
3. Umschlag-Vorlage mit ISBN-Barcode-Freifläche.

**Mit v0.29.0-beta umgesetzt:** Punkt 1 (`app.studio.printSpreadsKdp()` in
`js/studio/studioPrint.js`, echte 3mm-Beschnittzugabe + 6,4mm Sicherheitsabstand als
tatsächliche Seitenvergrößerung, nur für die KDP-eigenen Metrik-Trimm-Formate "A5/A4 hoch") -
Details siehe CHANGELOG.md v0.29.0-beta.

**Bewusst weiterhin nicht gebaut (Punkt 3):** ein eigener Umschlag-Generator. Der KDP-Umschlag
(Vorder-/Rückseite + Buchrücken in einer PDF, Rückenbreite abhängig von der finalen
Seitenzahl/Papierart, ISBN-Barcode-Freifläche) ist eine andere Aufgabe als das Innenteil - KDP
stellt dafür einen eigenen, kostenlosen Cover-Ersteller bereit, der die Rückenbreite korrekt
berechnet. Das ohne eine echte Testeinreichung nachzubauen wäre reines Raten der
Rückenbreiten-Formel; im UI-Hinweistext wird stattdessen auf das KDP-eigene Werkzeug
verwiesen. **Klarstellung, weil das beim Nutzer für Verwirrung sorgte:** "Kindle Create" ist
NICHT dieses Werkzeug - das ist Amazons kostenloses Programm für **E-Books** (Kindle-Format),
es baut kein druckfertiges Taschenbuch-Innenteil und kennt weder Bleed noch Trimm-Formate.

**Mit v0.30.0-beta teilweise gelöst:** die ursprüngliche Annahme "120-180 dpi wegen zu kleiner
Bildmaße (`genW`/`genH`)" war so nicht korrekt - der Gemini-Bildaufruf bekommt GAR KEINE
Pixelmaße geschickt, `genW`/`genH` gehen nie an die API. Der eigentliche Engpass war eine ganz
andere, app-weite Stelle: `app.utils.createImageVariants()` (`js/utils.js`) kappt JEDES Bild in
der App (nicht nur SchreibZauber) auf maximal 1600px Breite. Der neue Umschalter
"📐 Hochauflösend für den Druck" (`project.spec.highResPrint`, Stufe 2) umgeht diese Kappung
NUR für SchreibZauber-Druckbilder und skaliert per Interpolation hoch, falls die Bildquelle
selbst kleiner ist - siehe CHANGELOG.md v0.30.0-beta, für die Details. Ob das
tatsächlich (nahe) an 300 dpi herankommt, hängt jetzt von der ECHTEN, bisher unbekannten
nativen Auflösung des Gemini-Bildmodells ab - dazu gibt es keine belastbare Zahl ohne eine
echte Testgenerierung mit eingeschaltetem Umschalter.

**Mit v0.30.2-beta ergänzt:** der von KDP je nach Gesamtseitenzahl vorgeschriebene zusätzliche
Bundsteg-Innenrand ("gutter margin") wird jetzt modelliert (`kdpGutterMm()`) - da die App nicht
zwischen linker/rechter (Recto/Verso-)Seite unterscheidet, wird der jeweils GRÖSSERE Wert
(Bundsteg vs. normaler Sicherheitsabstand) auf BEIDE Seiten angewendet, siehe CHANGELOG.md.
Gleichzeitig wurde der Sicherheitsabstand selbst korrigiert (0,375" MIT Bleed statt der zuvor
angenommenen pauschalen 0,25"). Neu entdeckt: KDP verlangt bei Standardfarbe mindestens 72,
bei Premiumfarbe mindestens 24 Seiten - der Bauplan bietet aktuell maximal 40, ein Hinweis
dazu steht jetzt im UI-Text. Vor einer echten Veröffentlichung bleibt eine KDP-Testbestellung
weiterhin dringend empfohlen.

---

## Nachtrag: KDP-Farbstufen konkretisiert + Seitenlayout-Ideen (22.09.2026, Nutzerfrage "Standard-/Premiumfarbe, welcher Aufbau?")

Websuche (Stand 22.09.2026) hat die Farbstufen-Eckdaten aus dem Nachtrag oben ("mindestens
72 bzw. 24 Seiten") um Papier/Druckverfahren ergänzt:

| | Standardfarbe | Premiumfarbe |
|---|---|---|
| Mindest-Seitenzahl | 72 | 24 |
| Papier | 50-61 lb (74-90 g/m²), weiß | 60-71 lb (88-105 g/m²), weiß, etwas kräftiger |
| Druck | Tintenstrahl | Tintenstrahl, kräftigere/sattere Farbwiedergabe |
| Für uns relevant | praktisch nie (Bilderbücher haben selten 72+ Seiten) | die einzig sinnvolle Wahl für ein KI-Bilderbuch |

**Absolute KDP-Untergrenze, unabhängig von der Farbstufe: 24 Seiten** (ein dünnerer
Buchblock lässt sich nicht klebebinden). **FIX (22.09.2026):** Die Bauplan-Auswahl
(`index.html` `#studioTotalPages`) bot bisher fälschlich **16 Seiten** als kleinste Option
an - damit wäre KEINE KDP-Einreichung durchgekommen, auch nicht mit Premiumfarbe (deren
Minimum liegt zufällig ebenfalls bei 24). Option entfernt, verbleibende Wahl jetzt 24/32/40.

**Drei weitere Ideen aus derselben Unterhaltung, bewusst NUR dokumentiert, NICHT
umgesetzt** (brauchen erst eine Nutzerentscheidung, ob überhaupt Richtung einer echten
Veröffentlichung weitergebaut werden soll - vor Beginn hier nachlesen, damit die Abwägung
nicht neu geführt werden muss):

1. **Quadratisches Trimm-Format 8,5×8,5 Zoll (≈21,6×21,6 cm) ergänzen.** Laut Recherche das
   bei Amazon-KDP-Bilderbüchern gängigste Format (randabfallende Illustrationen wirken darauf
   am besten) - `KDP_ALLOWED_TRIMS`/`TRIM_PAPER_MM` (`js/studio/studioPrint.js`) kennen
   bisher nur "A5 hoch"/"A4 hoch".
2. **Seiten-Layout-Varianten statt fester "ein Bild + eine Textzone pro Doppelseite"-Regel.**
   Echte Bilderbücher wechseln ständig: mal Vollbild ganz ohne Text, mal kleines Bild oben +
   Text darunter (oder umgekehrt). Kleinerer, risikoarmer erster Schritt, falls gewünscht: ein
   Auswahlfeld pro Doppelseite in Stufe 7 ("Das Layout") - "Vollbild ohne Text" / "Bild + Text
   oben" / "Bild + Text unten" - nutzt die bestehenden `textZones` (`imageFormats.js`), macht
   "kein Text auf dieser Seite" aber zu einer bewussten Wahl statt einer festen Regel.
3. **Echte, über zwei gegenüberliegende Buchseiten reichende Bilder** (ein Motiv über den
   Bundsteg hinweg, wie in vielen klassischen Bilderbüchern). Wichtige Klarstellung dazu (siehe
   Nachtrag oben, v0.29.0-beta): eine "Doppelseite" ist in unserer Architektur bereits JETZT
   eine einzelne physische Druckseite, kein zwei Seiten überspannendes Bild - das wäre ein
   grundlegend NEUES Konzept (ein Breitformat-Bild pro Aufruf statt eines Seitenformats, exaktes
   Zerschneiden genau an der Bundsteg-Mitte, wichtige Bildinhalte dürfen dabei nicht in den
   ca. 1cm verschwinden, der im Falz verloren geht). Mit KI-Einzelbild-Erzeugung pro Seite (ein
   Aufruf weiß nichts von der Nachbarseite) zusätzlich erschwert - kein Referenzmechanismus
   dafür vorhanden. Deutlich größerer Schritt als Punkt 2, erst angehen, wenn Punkt 2 sich
   bewährt hat und eine echte Veröffentlichung wirklich ansteht.

---

# TEIL G – Offene Fragen an den Nutzer

Diese Punkte sollten vor Umsetzungsbeginn geklärt werden:

1. **Bild-API freigeschaltet? - noch offen, braucht eine Antwort vom Betreiber.**
   Ist der bestehende Google-Account abrechnungsfähig? Erklärung, weil die Frage zunächst
   unklar war: Die heutige App nutzt Gemini nur zum *Analysieren* vorhandener Fotos - dafür
   reicht der bestehende kostenlose API-Key. Stufe 2 (Bilder) will Gemini dagegen neue Bilder
   *erzeugen* - dafür verlangt Google in der Regel eine hinterlegte Zahlungsmethode am
   Google-Cloud-Projekt, auch wenn der Preis pro Bild klein ist (~0,04 $, siehe
   `docs/KONZEPT-Comic.md`). **Zu prüfen:** Hat das Google-Konto hinter dem aktuellen
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

## Stand nach Stufe 1 (Fundament) - was steht, wo docken Stufe 2+3 und Stufe 4 an

Stufe 1 ist gebaut und gemerged. Umgesetzt genau wie oben in TEIL E beschrieben:
Projekt-Datenmodell, DB v4 (Object Store `projects`), Werkstatt-Übersicht,
Idee → Bauplan → Geschichte, Platzhalter-Bilder über die bereits vorhandene
Bildquellen-Schicht, Export "ins Regal" - **ohne einen einzigen Bildaufruf**.
`js/studio/imageFormats.js`, `placeholder.js`, `imageSource.js` sind jetzt in
`js/main.js`/`sw.js` verdrahtet (waren vorher bewusst nur vorbereitet, siehe
D.6a). Alle Werkstatt-Module sind **statisch** in `main.js` importiert, nicht
lazy per `import()` wie in D.2 skizziert - für die kleinen, reinen
Canvas-/Fetch-Module in Stufe 1 war das nicht nötig; lohnt sich erst, wenn ein
späterer Schritt echte Bild-Bibliotheken nachlädt.

**Was die parallelen Werktyp-Pfade jetzt vorfinden:**

- `app.studio.projects[id]` trägt bereits das VOLLSTÄNDIGE Schema aus D.1
  (`style`, `characters`, `spreads[].imagePrompt/characterIds/layout/balloons`,
  `worksheet`), auch wenn Stufe 1 nur `brief`/`spec`/`spreads[].text` und
  `pageTurnHook` füllt. Stufe 2+3 und Stufe 4 müssen das Schema NICHT migrieren,
  nur die für sie leeren Felder befüllen.
- `app.studio.imageSource.request('placeholder', spec)` liefert bei jeder
  Doppelseite bereits `meta.prompt` mit - der Bildprompt existiert also schon,
  bevor je ein echter Bildaufruf passiert ist (siehe `docs/KONZEPT-Bildquellen.md`
  Abschnitt 4). Eine echte Bildquelle (`gemini`/`pollinations`) muss in
  `js/studio/imageSource.js` nur als weiterer Eintrag in `providers` ergänzt
  werden - kein anderer Code ändert sich, und "alle Platzhalter ersetzen" bleibt
  ein Durchlauf über `spread.imageMeta.source === 'placeholder'`.
- `app.studio.prompts.guardrailsBlock()` (in `studioPrompts.js`) ist der EINE
  wiederverwendbare Baustein für die Veröffentlichungs-Leitplanken aus
  Entscheidung 6. Jeder neue Prompt (Figurenblatt, Bildidee, Comic-Panel,
  Arbeitsheft-Aufgabe) sollte ihn 1:1 mit einbauen, statt die Regeln erneut zu
  formulieren.
- `app.studio.computeSpec(totalPages, audienceAge)` und `trimToFormat(trim)`
  (in `studioCore.js`) sind die einzigen Stellen, die Umfangsplanung und
  Papierform kennen - Stufe 3 (Layout & Druck) sollte hier andocken statt
  eigene Umrechnungen zu bauen.
- Stufe 4 (Arbeitsheft) legt eigene Projekte mit `type: 'workbook'` an - dafür
  muss in `app.studio.projectTypes` (studioCore.js) nur `available: true`
  gesetzt und ein eigener Wizard-Zweig (analog `js/render/studioWizard.js`)
  sowie ein eigener Export (analog `js/studio/studioExport.js`, aber mit
  `bookType: 'workbook'` und den Übungsheft-Variantenfeldern aus `CLAUDE.md`)
  gebaut werden. `project.worksheet` ist dafür bereits reserviert.
- `app.studio.export.toLibraryBook()` ist bewusst idempotent
  (`project.exportedBookId`) - ein späteres "Bild jetzt generieren" direkt am
  fertigen Buch kann darüber (bzw. über das neue `book.studioProjectId`) zum
  Projekt zurückfinden, ohne eine Dublette anzulegen.

Bewusst NICHT in Stufe 1 enthalten (folgt mit den jeweiligen Ausbaustufen):
Figuren-Bibel/Figurenblatt, Storyboard-Sketch-Vorschläge der KI, echte
Bildgenerierung, Stilkarte-Auswahl in der UI, Druckansicht, Comic/Arbeitsheft-
Wizard. Der Prompt-Kopier-Weg (`copyPrompt()`) ist zwar technisch nutzbar,
aber in der Stufe-1-UI noch nicht verdrahtet - dafür fehlt bislang eine echte
Bildidee pro Doppelseite (kommt erst mit dem Storyboard-Schritt in Stufe 2).

---

## Stand nach Stufe 4 (Arbeitsheft) - was steht, was fehlt noch

Stufe 4 ist gebaut und in diesem Integrationspass (Welle 5) zusammen mit
Stufe 2 zusammengeführt - beide liefen als zwei parallele, unabhängige
Sitzungen auf demselben `main`-Stand (siehe CLAUDE.md "Arbeitsschritt-
Varianten bei mehreren parallelen Aufträgen"). Umgesetzt genau entlang TEIL C.4: der
normale 8-Stufen-Wizard wird für `project.type === 'workbook'` komplett durch
einen eigenen Dreier-Ablauf ersetzt (Stufe 3' Lernziel -> Stufe 4' Progression
-> Stufe 5' Aufgabenbaukasten, `project.stage` zählt dabei wie beim
Bilderbuch-Pfad wieder bei 1 los).

**Neue Dateien** (analog zum in D.2 skizzierten Plan):
- `js/studio/worksheet.js` - Projekt-CRUD für Lernziel/Kapitel/Seiten/
  Aufgaben, Differenzierung, Export "ins Regal"
- `js/studio/worksheetCanvas.js` - eigenständiges Canvas-Druckbild pro Seite
  bzw. für die Lösungsseite(n) - **keine** Wiederverwendung von
  `js/actions/workbookGenerator.js` (anderer Weg zum selben `bookType`, siehe
  dortiger Kommentar)
- `js/render/studioWorkbookWizard.js` - die drei Stufen als eigene Ansicht,
  analog `js/render/studioWizard.js`

**Ergänzt statt neu gebaut:**
- `js/studio/studioPrompts.js`/`studioApi.js` bekamen die Arbeitsheft-Prompts/
  -Aufrufe dazu (Progression, Kapitel-Aufgaben, Niveau-Variante) - genau die
  Stellen, die D.4 dafür schon vorgesehen hatte (`generateWorksheetPlan`/
  `generateTasks`)
- `app.utils.buildPageVariant()` (js/utils.js) wurde **nicht** verändert -
  der `bookType: 'workbook'`-Zweig war laut CLAUDE.md-Datenmodell schon
  vollständig für `taskText`/`taskExplained`/`taskType`/`materials`/
  `helpSteps`/`solution` vorbereitet, der Export ruft ihn nur auf
- `project.worksheet` (Konzept D.1) ist jetzt befüllt: `{goal, grade,
  subject, chapters: [{id, title, goal, pages: [{id, goal, kind, tasks: [{id,
  type, instruction, explanation, data, solution, activeLevel, altLevels}]}]}]}`
  - `kind: 'neu'|'wiederholung'` und `activeLevel`/`altLevels` sind
  Ergänzungen gegenüber dem knappen Beispiel in D.1, aber im selben Feld
  verankert (`chapters[].pages[].tasks[]`)

**Aufgabentypen: 5 von 9 aus der Tabelle in C.4 umgesetzt** - bewusst
weniger als alle neun (siehe Auftrag: "lieber 2-3 Typen fertig als alle neun
halbfertig"). Fertig: Lückentext ✏️, Ankreuzen ☑️, Rechnen ➕, Zuordnen 🔗
(als "schreib den passenden Buchstaben in die Lücke" statt Linien-Ziehen -
druckt sich auf Papier sauberer als eine gezeichnete Verbindungslinie),
Frei schreiben 📝. Alle fünf sind **reine Text-/Schreibaufgaben ohne jeden
Bildbedarf** - erfüllt die Druckregel (s/w-tauglich, viel Schreibfläche)
ohne eine einzige Bildgenerierung oder einen Platzhalter-Aufruf.

**Nachtrag v0.38.0-beta: Suchsel 🔍 als sechster Typ gebaut** (`js/studio/wordSearch.js`) -
die KI liefert nur die Wörter, Gitter und Lösung (Zeile/Spalte/Richtung) erzeugt die App
selbst, nur waagerecht/senkrecht, 6×6 bis 10×10, reproduzierbar über einen Seed
("🔀 Neu mischen" ohne KI-Aufruf). Details: CHANGELOG.md v0.38.0-beta.

**Noch nicht umgesetzt** (bewusst zurückgestellt, keine der fünf Typen
braucht sie): Nachspuren 〰️ (braucht eine Kontur-/Rasterschrift-Technik),
Ausmalen nach Regel 🎨 und Schneiden & Kleben ✂️ (brauchen ein echtes
Ausmalbild/Clipart), Suchsel/Rätsel 🔍 (braucht einen Buchstabengitter-
Generator - eigener kleiner Algorithmus, kein Bildbedarf, aber eigener
Aufwand). Sobald diese vier drankommen, ist `js/studio/imageSource.js` mit
der `'placeholder'`-Quelle bzw. später einer echten Clipart-Anbindung
(siehe `docs/KONZEPT-Bildquellen.md`, Abschnitt 1.5/5 Punkt 4) der richtige
Andockpunkt für Ausmalen/Schneiden - `worksheetIllu` ist im Formatkatalog
(`imageFormats.js`) dafür bereits reserviert.

**Differenzierung:** pro Aufgabe ⭐/⭐⭐/⭐⭐⭐ - Niveau 2 (Standard) ist immer
das direkt generierte Ergebnis, ⭐/⭐⭐⭐ werden **nur auf Klick** nachgeneriert
(`task.altLevels[1|3]`, ein KI-Aufruf pro erstmals angesehenem Niveau) statt
alle drei Niveaus vorab für jede Aufgabe zu erzeugen - gleiche Kostenlogik
wie beim Storyboard-vor-Bildern-Prinzip aus C.2.

**Selbstkontrolle:** der Lösungsteil am Heftende braucht **keinen eigenen
KI-Aufruf** - jede Aufgabe trägt ihre Lösung schon seit der Aufgaben-
Erzeugung (Stufe 5'), der Export sammelt sie nur ein und zeichnet sie als
zusätzliche Buchseite(n) (`taskType: 'loesung'`).

---

## Stand nach Stufe 2 (Bilder) - was steht, wo dockt Stufe 3 (Layout & Druck) an

Stufe 2 ist gebaut und in diesem Integrationspass (Welle 5) zusammen mit Stufe 4
zusammengeführt - beide liefen als zwei parallele, unabhängige Sitzungen auf
demselben `main`-Stand (siehe CLAUDE.md "Arbeitsschritt-Varianten bei mehreren
parallelen Aufträgen"). Umgesetzt genau die vier in TEIL E für Stufe 2 genannten
Bausteine, alle über die bereits vorhandene Bildquellen-Schicht (`imageSource.js`)
und damit **weiterhin komplett ohne einen einzigen kostenpflichtigen Bildaufruf**,
solange die Bestätigung in den Einstellungen nicht gesetzt ist:

- **Stilkarte** (`project.style`) - eigenes Formular in der neuen Wizard-Stufe 4
  ("Die Figuren"), `app.studio.buildStyleText()` (studioCore.js) baut daraus den
  Textblock, der in JEDEN Bild-Prompt einfließt (Figurenblatt UND Doppelseite).
- **Figuren-Bibel** (`project.characters[]`) - Steckbrief-Formular (Name, Rolle,
  Alter, Art, Aussehen, Kleidung, drei Farbwerte, Eigenart) plus Figurenblatt-Bild
  im Format `characterSheet`. Zusätzlich `app.studio.suggestCharacters()` - leitet
  Vorschläge aus dem bereits geschriebenen Manuskript ab (reiner Text, kein
  Bildaufruf), Figurenblatt-Bild entsteht danach weiterhin einzeln.
- **Storyboard/Daumenkino** = neue Wizard-Stufe 5 (`js/studio/studioStoryboard.js`,
  `js/render/studioStoryboard.js`): Miniatur-Raster mit Text-Auszug + Bildidee
  (`spread.sketchPrompt`), verschieben (Tausch mit Nachbar statt Drag&Drop - robuster
  auf dem Handy), zusammenfassen, löschen (bestehendes `deleteSpread()` wiederverwendet).
  `app.studio.suggestSketches()` schlägt Bildideen für alle Doppelseiten auf einmal vor,
  ausdrücklich als reiner Text-Aufruf ohne Bildgenerierung (Konzept D.4).
- **Bildgenerierung** = neue Wizard-Stufe 6 (`js/studio/studioImages.js`,
  `js/render/studioImages.js`): `app.studio.generateSpreadImage()` erzeugt EIN Bild
  einer Doppelseite, einzeln anstoßbar, nie automatisch fürs ganze Buch (gleiche
  Zurückhaltung wie beim Persona-System). "Figur veraltet": ändert sich ein
  Figurenblatt NACH bereits generierten (nicht-Platzhalter-)Seiten, werden nur
  `spread.imageStale` gesetzt und ein "🔄 Neu zeichnen"-Knopf angeboten - KEINE
  automatische Neugenerierung (`regenerateCharacterSheet()` in studioCharacters.js).
  `app.studio.replaceAllPlaceholders()` läuft über alle Seiten mit
  `imageMeta.source === 'placeholder'` und schickt GENAU den dort bereits
  gespeicherten Prompt (`spread.imagePrompt`) an die echte Quelle - kein neu
  erdachter Prompt (`spec.rawPrompt` in `imageSource.js`).
- **Kostenzähler** (`project.costLog`) - `app.studio.trackImageCost()` (studioCore.js)
  zählt NUR echte Bildaufrufe (Quelle `'gemini'`, GESCHÄTZT 0,07 $/Bild wie in C.2),
  der kostenlose Platzhalter bleibt bei 0. Sichtbar in der Werkstatt-Übersicht
  (`js/render/studioLibrary.js`) und in der Bilder-Stufe selbst.

**Die echte Bildgenerierung ist gebaut, aber bewusst nicht scharf**: `imageSource.js`
hat jetzt einen `gemini`-Eintrag in `providers` (Modell `gemini-3.1-flash-image`,
Referenzbilder der auf der Seite vorkommenden Figuren als `inlineData`-Teile, siehe
D.5 #1/#4). `app.studio.resolveImageSourceId()` (studioCore.js) ist die EINZIGE
Weiche, die je `'gemini'` statt `'placeholder'` zurückgibt - und das nur, wenn
`app.settings.studioImageGenEnabled` gesetzt ist. Diese Einstellung (Einstellungen →
"🪄 Echte KI-Bilder in der Werkstatt", `app.settingsConfig.toggleStudioImageGen()`)
ist standardmäßig AUS und verlangt beim Einschalten eine Bestätigung per `confirm()`
(Kostenhinweis + Zahlungsmethode-Hinweis) - **die Zahlungsmethode-Frage aus TEIL G
Punkt 1 war beim Bau dieser Stufe weiterhin nicht beantwortet.** Sobald sie es ist,
reicht das Einschalten dieser einen Einstellung, kein Code muss dafür angefasst werden.

`app.studio.prompts.guardrailsBlock()` steckt jetzt zusätzlich in JEDEM Bild-Prompt
(`imageSource.js buildPrompt()`, wörtlich unverändert übernommen wie in den beiden
neuen Text-Prompts `buildSuggestCharactersPrompt()`/`buildSuggestSketchesPrompt()`
in `studioPrompts.js`) - nicht nur in Text-Prompts wie bisher.

**Was die Wizard-Stufen jetzt bedeuten** (Konzept C.2 nennt 8 Stufen, die App-Stufen
1-6 sind jetzt gebaut): 1 Idee, 2 Bauplan, 3 Geschichte, 4 Figuren (Stilkarte +
Figuren-Bibel), 5 Daumenkino/Storyboard, 6 Bilder. `project.stage` bleibt wie in
Stufe 1 "wie weit am WEITESTEN gekommen", `app.studio.advanceStage(n)` ist der neue,
generische Weiterschalter für die Stufen 4/5/6 (kein Pflichtfeld wie bei
Idee/Bauplan, "die KI ist Vorschlag, nie Zwang" gilt auch hier - leer weiterschalten
ist erlaubt). "Ins Regal stellen" bleibt bewusst überall erreichbar (Stufe 3 UND 6),
nicht erst nach Stufe 6 gesperrt - ein reiner Text-Bilderbuch-Export ohne eigene
Bilder soll weiterhin möglich bleiben (Stufe 1 sollte ja gerade OHNE Bilder
vollständig sein).

**Was die nächste Sitzung (Stufe 3 - Layout & Druck) vorfindet:**
- `project.spreads[].imagePrompt`/`imageMeta`/`imgUrl`/`thumbUrl` sind jetzt
  tatsächlich befüllt (nicht mehr nur reserviert wie nach Stufe 1) - Layout kann auf
  echten (oder Platzhalter-)Bildern aufbauen.
- `project.spreads[].layout` (`textPos`, `fontScale`, `syllableColors`) existiert
  bereits seit Stufe 1 mit Standardwerten, ist aber noch nirgends editierbar - das
  ist genau die Lücke, die Stufe 3 füllt.
- `app.studio.computeSpec()`/`trimToFormat()` (studioCore.js) bleiben weiterhin die
  einzigen Stellen, die Umfangsplanung und Papierform kennen - Stufe 3 sollte hier
  andocken statt eigene Umrechnungen zu bauen (unverändert seit Stufe 1).
- KDP-taugliche Exportformate (300 dpi, Bleed, PDF) aus dem Nachtrag "Veröffentlichung
  von Anfang an mitdenken" sind weiterhin offen und noch nicht verifiziert (TEIL F).

Bewusst NICHT in Stufe 2 enthalten (folgt mit den jeweiligen Ausbaustufen): Layout/
Textplatzierung auf dem fertigen Bild, Silbenfarben-Darstellung, Erstleser-Regelprofil
fürs Bild, Doppelseiten-Druck, "🎲 Nochmal"-Varianten (D.5 #5, max. 3 Alternativen
pro Seite), Seed-artige Wiederverwendung des vorherigen Bilds derselben Figur als
zusätzliche Referenz (D.5 #3) - beides wären sinnvolle Ergänzungen, aber kein
Blocker für ein vollständiges erstes selbst gemachtes Bilderbuch.

---

## Stand nach Stufe 5 (Comic) - was steht, was ist bewusst offen geblieben

Auf Nutzerauftrag gebaut, NACHDEM Stufe 5/6 laut TEIL E ursprünglich zurückgestellt waren.
Die erste Fassung (v0.24.0-beta: eine Seite = ein Bild + lose schwebende Sprechblasen) wurde
nach echtem Test-Feedback verworfen und durch eine Panel-Fassung ersetzt (v0.26.0-beta,
"sonst ist es einfach ein Bilderbuch") - dieser Abschnitt beschreibt den AKTUELLEN
(Panel-)Stand, Details zu den Entscheidungen stehen in `CHANGELOG.md`,
Einträge v0.24.0-beta und v0.26.0-beta.

- Werktyp `'comic'` (`app.studio.projectTypes`) läuft durch DASSELBE 8-Stufen-Gerüst wie das
  Bilderbuch (Konzept C.1) - nur Stufe 3 (Panel-Skript statt Fließtext, `generateComicScript()`/
  `applyComicScript()`), Stufe 6 (ein Bildaufruf PRO PANEL statt pro Seite,
  `generateComicPage()` in `studioImages.js`) und Stufe 7 (Panel-Raster + Sprechblasen-Editor
  statt Textposition, `js/studio/studioBalloons.js` + `js/studio/studioComicPanels.js`)
  unterscheiden sich.
- **Echte Panels:** `spread.panels[]` (1-4 pro Seite, vom Skript vorgeschlagen, in Stufe 3 auch
  von Hand hinzufügbar/löschbar) - jedes Panel hat eine eigene Bildidee (`panel.visual`), ein
  eigenes generiertes Bild (`panel.imgUrl`, Format `comicPanel`, 4:3) und eigene Sprechblasen
  (`panel.balloons[]`, Koordinaten relativ zur PANEL-Fläche). `js/studio/studioComicPanels.js`
  setzt die Panel-Bilder per Canvas zu einer fertigen Seite zusammen (`compositePage()`) - eine
  kleine, feste Auswahl an Layout-Vorlagen für 1/2/3/4 Panels (Regionen in 0-1-Koordinaten +
  Gutter dazwischen), bewusst NICHT die im Konzept angedachte 10-15-Vorlagen-Bibliothek mit
  Wichtigkeits-Tagging (Abschnitt 6 in `docs/KONZEPT-Comic.md`, dort selbst noch nicht
  entworfen).
- **Figuren-Konsistenz PRO PANEL:** sprechende Namen kommen zuerst nur als Text aus dem Skript
  (Stufe 3, vor der Figuren-Bibel in Stufe 4) - `characterRefsForPanel()` gleicht sie
  automatisch per Namen mit `project.characters` ab, sobald die existieren, statt eine eigene
  manuelle Zuordnungs-UI zu bauen. Ein Panel bekommt dadurch NUR die Figuren als Bild-Referenz,
  die darin tatsächlich sprechen - noch genauer als beim ursprünglichen Seiten-weiten Ansatz.
- **Sprechblasen sind KEINE Erstell-Entscheidung, sondern ein Umschalter beim Lesen (seit
  v0.27.0-beta - siehe dortiger CHANGELOG.md-Eintrag für die Vorgeschichte).** `toLibraryBook()`
  erzeugt beim "Ins Regal stellen" für jede Comic-Seite IMMER beide Bildfassungen: die
  "saubere" Komposition (`app.studio.comicPanels.compositePage()`) landet in `page.
  comicCleanImgUrl`/`comicCleanThumbUrl`, die Fassung MIT eingebrannten Sprechblasen
  (`bakePageWithBalloons()` - zweite bewusste Ausnahme von "Text nie ins Bild brennen", weil
  das bei echten Comics/Mangas genau so gemacht wird) bleibt wie gewohnt `imgUrl`/`thumbUrl`,
  damit alle generischen Reader-Codepfade unverändert lauffähig bleiben. Ein neuer
  Reader-Umschalter ("🗨️ Sprechblasen", nur sichtbar bei vorhandener `comicCleanImgUrl`) ruft
  `app.actions.toggleComicBubblesInReader()` auf, die den flüchtigen `app.state.
  comicBubblesOff` setzt (wie `readingPersonaId` - nicht gespeichert, jedes Öffnen zeigt wieder
  Sprechblasen). `app.utils.resolveDisplayImageUrl(page)` ist die EINE Stelle, die je nach
  Umschalter `imgUrl` oder `comicCleanImgUrl` liefert - genutzt vom normalen Reader-Bild, dem
  Vollbild-Vorlesemodus UND "Frag den Zauberer", damit alle drei dasselbe Bild zeigen/befragen.
  Der Klartext für Vorlesen/Suche (`spreadReadableText()`) bleibt für beide Bildfassungen
  identisch.
- **Geräuschwörter bekommen einen eigenen, separaten Umschalter** `project.
  comicShowSoundEffects` (Checkbox in Stufe 3, Standard AUS - laut Nutzer "weniger wichtig"),
  UNABHÄNGIG vom Sprechblasen-Umschalter oben. Die Skript-Generierung schlägt pro Panel
  optional ein Geräuschwort vor (`panel.soundEffect`, meist leer), von Hand editierbar.
  `bakePageWithBalloons(spread, {showSoundEffects})` zeichnet es nur, wenn der Umschalter an
  UND das Panel eins hat - siehe `drawSoundEffect()` in `studioComicPanels.js`.
- Bild-Prompt-Fix aus `docs/KONZEPT-Comic.md` Abschnitt 5 übernommen: die Comic-Textzone
  (`imageFormats.js`) beschreibt jetzt rein visuell ("unbedeckter Hintergrund ohne Figuren/
  Objekte/Details"), OHNE das Wort "Sprechblase" zu nennen - der dortige Testlauf hatte
  gezeigt, dass die reine Erwähnung des Begriffs eine gemalte Sprechblase auslöst.
- **Bewusst nur "Comic" (amerikanisch/europäisch), nicht Webtoon/Manga.** Recherche zu anderen
  Comic-Readern (ComiXology Guided View, Webtoon-Vertikalscroll, Manga-Reader) zeigt: das sind
  technisch/gestalterisch eigene Formate. Auf Nutzerwunsch zuerst nur der teurere,
  Panel-basierte westliche Stil - Webtoon/Manga wären eigene, spätere Ausbaustufen mit eigener
  Layout-Logik (anderes Seitenverhältnis/Leserichtung), kein Aufsatz auf diesem Panel-System.
- **Comic-Druck ist seit v0.28.0-beta gebaut** (`studioPrint.js`) - eigener, von der
  Reader-Umschaltung UNABHÄNGIGER "Sprechblasen mit einbrennen"-Umschalter direkt im
  Druckblock (Standard AN, druckt die fertig geletterte Panel-Seite über
  `bakePageWithBalloons()`; AUS druckt die "saubere" Fassung über `compositePage()`, z.B. für
  eine spätere Übersetzung/eigenes Lettering von Hand). Details: siehe CHANGELOG.md,
  Eintrag v0.28.0-beta.
- **Bewusst NICHT umgesetzt:**
  - **Freies Ziehen (Drag&Drop)** der Sprechblasen - Stufe 7 bietet stattdessen X/Y/Breite als
    Prozent-Regler, reicht für die üblichen 1-3 Sprechblasen pro Panel.

**Was eine spätere Sitzung vorfindet:** `app.studio.comicPanels` (Layout/Zusammensetzen/
Einbrennen, jetzt auch vom Druck in `studioPrint.js` genutzt) und `app.studio.balloons`
(Sprechblasen-CRUD/Vorschau-HTML) sind die Andockpunkte für eine künftige Webtoon/
Manga-Ausbaustufe.

### Stufe 6 (Politur) - zwei von drei Punkten umgesetzt

- **Vorlagen:** zwei feste Kurz-Vorlagen ("Gute-Nacht-Geschichte"/"Geburtstagsbuch") füllen in
  Stufe 1 nur das Formular vor, speichern nichts (`STUFE1_TEMPLATES`, `js/render/studioWizard.js`).
- **Projektübergreifende Figuren:** "Figur aus anderem Werk übernehmen" in Stufe 4 - kopiert
  eine Figur samt Figurenblatt aus JEDEM anderen Projekt mit neuer ID
  (`app.studio.listOtherProjectsCharacters()`/`importCharacterFromOtherProject()`,
  `js/studio/studioCharacters.js`).
- **Bewusst NICHT umgesetzt: zweite Einstiegsseite `schreiben.html` + eigenes Manifest.** Die
  App ist eine einzige monolithische `index.html` mit allen Ansichten als `<main>`-Blöcken,
  kein Build-Tool, keine HTML-Includes. Eine echte zweite, schlanke Einstiegsseite hätte
  entweder die komplette `index.html` dauerhaft duplizieren müssen (unwartbar) oder eine
  Aufteilung in gemeinsame Partials erfordert - eine eigene, deutlich größere
  Architekturänderung für den rein kosmetischen Nutzen eines zweiten Homescreen-Icons. Ein
  künftiger Anlauf bräuchte zuerst eine Entscheidung, wie die App strukturell in
  gemeinsame/eigenständige Teile zerlegt würde - das ist keine Detailfrage von Stufe 6 mehr,
  sondern eine eigene Grundsatzfrage.

---

## Stand nach Stufe 3 (Layout & Druck) - was steht, was ist bewusst offen geblieben

Ausbaustufe 3 ist gebaut, genau die vier in TEIL E genannten Bausteine (Textplatzierung,
Silbenfarben, Erstleser-Regelprofil, Doppelseiten-Druck), plus die in TEIL F vorab verlangte
KDP-Recherche (siehe Nachtrag oben). Diese Sitzung lief NICHT parallel zu einer zweiten
SchreibZauber-Sitzung (Stufe 5/6 blieben laut Auftrag gesperrt), deshalb hier keine
Integrationspass-Besonderheiten wie bei Welle 5.

**Wizard-Stufe 7 "Das Layout"** (`js/studio/studioLayout.js` + `js/render/studioLayout.js`):
- `spread.layout` (`textPos`/`fontScale`/`syllableColors`) - existierte als Datenfeld bereits
  seit Stufe 1 mit Standardwerten (siehe `studioCore.js`, `createDefaultProject()`/
  `addSpread()`/`applyManuscript()` - **unverändert gelassen**, wie im Auftrag verlangt) - ist
  jetzt über drei Regler pro Doppelseite editierbar: Textposition (oben/unten/links/rechts),
  Schriftgröße (80-150%), Silbenfarben (An/Aus).
- `app.studio.layout.buildOverlayHtml(text, layout, readingLevel, baseSize, unit)` ist die EINE
  Stelle, die aus Manuskripttext + Layout-Feldern eine fertige, sanitierte HTML-Textebene baut -
  genutzt sowohl von der Live-Vorschau im Wizard-Kärtchen als auch vom Druck
  (`studioPrint.js`), damit beide garantiert dasselbe zeigen. Der Text liegt dabei als absolut
  positioniertes `<div>` ÜBER dem (unveränderten) Bild, nie im Bild selbst - dieselbe Regel wie
  überall sonst im Projekt (Konzept A.5 Prinzip 6, D.4, Comic-Sprechblasen).
- **Silbenfarben-Heuristik** (`splitSyllables()`): eine zusammenhängende Vokalfolge (deckt
  Diphthonge wie "au"/"ei"/"ie" automatisch mit ab) zählt als ein Silbenkern; bei mehreren
  Konsonanten zwischen zwei Kernen bleibt nur der/die letzte(n) - inklusive der unzertrennlichen
  Verbindungen "ch"/"sch"/"ph"/"th" - bei der folgenden Silbe, der Rest bei der vorigen. Kein
  Wörterbuch, keine KI, rein regelbasiert - reicht laut Auftrag für selbst geschriebene
  Kinderbuchtexte (an den üblichen Lehrbuchbeispielen wie "Fenster"→"Fens-ter",
  "Kirche"→"Kir-che", "waschen"→"wa-schen" geprüft, kein Anspruch auf Vollständigkeit bei
  Fremdwörtern/Komposita-Fugen-s). Zwei fest verdrahtete, alternierende Farben, die Abfolge
  läuft über den GESAMTEN Seitentext durch (nicht pro Wort neu bei Farbe 1 beginnend).
- **Erstleser-Regelprofil** ("Sinnschritte", Konzept A.2): bei `project.brief.readingLevel ===
  'erstleser'` wird der Text automatisch an Satzgrenzen (. ! ?) in eigene Zeilen zerlegt - "ein
  Satz = eine Zeile". Bei `'vorlesen'`/`'selbstleser'` bleibt der Text ein durchgehender Block.
  Das ist an `readingLevel` gekoppelt (globale Werkstatt-Einstellung aus Stufe 1), unabhängig
  vom PRO-SEITE einstellbaren `syllableColors`-Schalter.
- **Bekannte Lücke, bewusst nicht in dieser Stufe behoben:** Die vom Bild-Prompt freigehaltene
  "ruhige Fläche" (`imageSource.js buildPrompt()`, `fmt.textZone`) hängt am BILDFORMAT (z.B.
  "unteres Viertel" bei `spreadLandscape`), nicht an der hier neu editierbaren
  `spread.layout.textPos`. Wählt man "oben"/"links"/"rechts", kann die HTML-Textebene also über
  einem Bildbereich liegen, der nicht extra freigehalten wurde - der halbtransparente weiße
  Textkasten (siehe `textPosStyle()`) fängt das optisch ab, ist aber ein Kompromiss. Eine echte
  Behebung müsste `imageSource.js`/die Bild-Prompts anfassen (Stufe 2-Gebiet) und war laut
  Auftrag ausdrücklich nicht Teil dieser Sitzung.

**Doppelseiten-Druck** (`js/studio/studioPrint.js`, `app.studio.printSpreads(bleed)`):
- Eigene Funktion (kein Umbau von `app.actions.printBook()`), orientiert an dessen Konventionen
  (`window.open()` → `document.write()` → `setTimeout(print)`), aber mit eigenen Druckregeln:
  Papierformat aus dem Bauplan (`project.spec.trim` → A5 quer 210×148mm / A5 hoch 148×210mm /
  A4 hoch 210×297mm über `@page { size }`), Wahl zwischen randabfallendem Bild
  (`object-fit: cover`) und Bild mit 8mm weißem Rand (`object-fit: contain`, Standard - sicherer
  für Heimdrucker ohne echten Randlos-Druck), Textzone über `buildOverlayHtml()` freigehalten,
  simple Titelseite (Werktitel + Profil-Name als Autor) vorangestellt.
- **Bewusst NICHT KDP-fertig** - siehe die drei konkreten Folgepunkte im KDP-Nachtrag oben
  (echter 3mm-Bleed-Übermaßzuschlag statt nur optischem Randabfallend/Mit-Rand-Umschalter,
  Aufteilung jeder Doppelseite in zwei KDP-Einzelseiten, Umschlag mit ISBN-Freifläche). Der Text
  in Stufe 7 und die Zusammenfassung im Konzept-Nachtrag verweisen ausdrücklich dorthin, statt
  stillschweigend so zu tun, als sei der Export bereits einreichungsfertig.

**Was eine spätere Sitzung vorfindet:**
- `app.studio.layout` (Namespace) und `app.studio.printSpreads()` sind die Andockpunkte für
  einen künftigen "echten" KDP-Export - der müsste laut obigem Nachtrag hauptsächlich eine
  zweite `printSpreads()`-Variante (oder einen Modus-Parameter) ergänzen, der Bleed als echtes
  Übermaß statt als optischen Schalter behandelt und jede Doppelseite in zwei Einzelseiten
  aufteilt - `buildOverlayHtml()` selbst bräuchte dafür keine Änderung.
- Stufe 5 (Comic) ist inzwischen ebenfalls gebaut, siehe "Stand nach Stufe 5" oben. Stufe 6
  (Politur) bleibt wie in TEIL E beschrieben zurückgestellt.

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

Amazon-KDP-Druckvorgaben (recherchiert für Ausbaustufe 3, Sept. 2026):
- [Picture Book Illustration Specs for Print-on-Demand – ebookpbook](https://www.ebookpbook.com/2026/04/23/childrens-picture-book-illustration-specs/)
- [Set Trim Size, Bleed, and Margins – Kindle Direct Publishing (offizielle KDP-Hilfe)](https://kdp.amazon.com/en_US/help/topic/GVBQ3CMEQW3W2VL6)
- [Paperback Submission Guidelines – Kindle Direct Publishing (offizielle KDP-Hilfe)](https://kdp.amazon.com/en_US/help/topic/G201857950)
- [Children's Book Trim Sizes: Complete Chart + KDP Bleed Guide – kidillus](https://kidillus.com/learn/book-trim-sizes-bleed-margins)
