# 📝 Konzept: Übungshefte – Stand und Heft-Generator

**Stand:** v0.11.0-beta (Teil 1), v0.17.0-beta (Teil 2: fertig inkl. Druckqualität) ·
**Zusammengeführt aus** `uebungshefte-konzept.md` und `todo-heft-generator.md`,
September 2026.

Dieses Dokument hat zwei Teile, die zusammengehören:

- **Teil 1 – Was die App heute kann:** der Heft-Modus (auslesen, erklären, kontrollieren)
  ist **gebaut und im Einsatz**.
- **Teil 2 – Heft-Generator:** Übungsblätter von der KI **erstellen** lassen, statt nur
  vorhandene auszulesen. **Gebaut und im Einsatz:** der KI-Aufruf
  (`app.api.generateWorksheets()`), die Auswahl-Ansicht
  (`js/render/workbookGenerator.js`, `js/actions/workbookGenerator.js`), das
  Zeichnen der Blätter auf Canvas und - seit v0.17.0-beta - der Druck als echter
  Text statt über das Canvas-Bild (`page.generatedSheet`, siehe „Offene Punkte"
  unten). Offen ist nur noch KI-Bildgenerierung für Ausmalbilder, ein eigenes
  größeres Thema.

---

# TEIL 1 – Bibel-Übungshefte zur Schulvorbereitung (Stand)

## Idee

Übungshefte für Kinder von etwa 4 bis 6 Jahren, die **nicht** in Vorschule oder
Kindergarten gehen und trotzdem auf die Schule vorbereitet werden sollen. Der rote
Faden sind Bibelgeschichten: jede Geschichte liefert den Anlass für eine
Vorschulübung (Arche Noah → Tiere paarweise zuordnen, Schöpfung → Reihenfolge der
sieben Tage, usw.).

LeseZauber ist dafür kein reines Vorlesegerät mehr, sondern eine **Begleitung beim
Bearbeiten**: die App liest die Aufgabe vor, erklärt sie kindgerecht, hilft Schritt
für Schritt und verrät auf Wunsch die Lösung. Das Kind arbeitet dabei auf Papier,
das Tablet steht daneben.

## Was die App heute dafür kann

| Baustein | Wo | Anmerkung |
|---|---|---|
| Blätter erfassen | Foto, Galerie, PDF, EPUB | PDF mit Textebene liefert die Aufgabenstellung wortgenau (`pdfSourceText`), ohne OCR-Raterei |
| Aufgabe auslesen | `js/api.js` → `buildWorkbookPrompt()` | eigener Prompt: Aufgabentext, kindgerechte Erklärung, Material, 3–5 Hilfeschritte, Lösung |
| Vorlesen & Helfen | `js/tts.js` → `_readWorkbookTask()` | liest Aufgabe + Erklärung + Hilfeschritte mit Pausen, blättert danach **nicht** weiter |
| Nachfragen | „Frag den Zauberer" im Reader | Kind/Eltern können zum abfotografierten Blatt frei nachfragen |
| Lösung | Hilfe-&-Lösung-Tab | absichtlich ein extra Tipp, klappt beim Seitenwechsel wieder zu |
| Fortschritt | `js/actions/progress.js` | Häkchen + Sticker pro Aufgabe, **pro Kind-Profil**, Pokal für ein komplettes Heft |
| Kontrolle | `js/actions/checkWork.js` | Kind fotografiert das bearbeitete Blatt, KI vergleicht mit Aufgabe + Lösung und gibt vorgelesene Rückmeldung; bei "richtig" wird automatisch abgehakt |
| Fragen sprechen | 🎤 neben dem Frage-Feld | nutzt die Diktierfunktion der Bildschirmtastatur, keine eigene Spracherkennung |
| Ausdrucken | 🖨️ in der Buchansicht | druckt bei Übungsheften auch Erklärung und Hilfeschritte mit |
| Mehrere Kinder | Profile | jedes Kind hat seinen eigenen Stand im selben Heft |

## Was sie (noch) nicht kann

- **Hefte selbst erzeugen.** Blätter müssen vorhanden sein (selbst gestaltet, gekauft,
  ausgedruckt). Siehe Teil 2 unten.
- **Selbst zuhören.** Die App hat keine eigene Spracherkennung. Gesprochene Fragen
  laufen über die Mikrofon-Taste der Bildschirmtastatur (Gboard/iOS-Diktat), die ganz
  normal Text ins Feld schreibt. Das funktioniert, ist aber kein freihändiges Zuhören:
  das Kind muss die Taste selbst antippen, und Kinderstimmen werden schlechter erkannt
  als Erwachsenenstimmen.
- **Verlässlich bewerten.** Die Kontrolle (Foto des bearbeiteten Blattes) gibt es seit
  v0.11.0-beta, sie ist aber eine Hilfe und kein Lehrer: Gemini erkennt dünne
  Bleistiftlinien und Kinderschrift nicht immer. Der Prompt ist deshalb bewusst
  vorsichtig eingestellt – im Zweifel „fast" statt „nochmal", und lieber „das sehe ich
  nicht gut" als ein falscher Tadel. Ein Erwachsener sollte weiterhin mit draufschauen.
- **Hefte weitergeben.** Nur über die Export-Datei (Einstellungen → Exportieren).
  Die enthält alle Seitenbilder als Base64, wird also schnell groß.

## Vorschul-Lernziele und passende Bibelgeschichten

| Lernziel | Passende Geschichte | Mögliche Übung | Aufgabenart |
|---|---|---|---|
| Mengen & Zahlen bis 10 | Arche Noah | Tiere zählen, Paare finden | `zaehlen`, `zuordnen` |
| Reihenfolge / Erzählen | Schöpfung (7 Tage) | Bilder in die richtige Reihenfolge bringen | `zuordnen` |
| Farben & Muster | Josefs bunter Rock, Regenbogen | nach Vorlage ausmalen, Muster fortsetzen | `ausmalen` |
| Feinmotorik / Schwungübungen | Mose im Körbchen | den Weg des Körbchens nachspuren | `nachspuren` |
| Formen | Turmbau zu Babel | Kreise, Dreiecke, Vierecke im Turm suchen und anmalen | `suchen`, `ausmalen` |
| Groß / klein, Vergleiche | David und Goliath | größer/kleiner ankreuzen | `ankreuzen` |
| Lagewörter (in, auf, unter) | Jona und der große Fisch | ankreuzen, wo etwas ist | `ankreuzen` |
| Anlaute & erste Buchstaben | Namen: Noah, David, Jona | Anlaut-Bilder verbinden, Namen nachspuren | `verbinden`, `nachspuren` |
| Eins-zu-eins-Zuordnung | Der gute Hirte | jedem Schaf eine Blume zuordnen, das fehlende finden | `verbinden` |
| Teilen & Mengen aufteilen | Speisung der 5000 | Brote gerecht auf Körbe verteilen | `zuordnen` |
| Gefühle benennen | Barmherziger Samariter | Gesichter ausmalen, Gefühl ankreuzen | `ankreuzen` |
| Konzentration / Ausdauer | beliebig | Fehlersuche, Wimmelbild | `suchen` |

Die Werte in der letzten Spalte sind genau die `taskType`-Werte, die der Heft-Prompt
kennt (`js/api.js`) und für die der Reader eine Überschrift hat
(`js/render/workbook.js`). Eine neue Aufgabenart braucht an beiden Stellen einen
Eintrag.

## Empfohlener Aufbau eines Hefts

Für ein Heft, das ein Kind über mehrere Wochen begleitet:

1. **Titelblatt** – wird beim Auslesen automatisch als Titel/Autor erkannt und als Cover gesetzt.
2. **Pro Geschichte zwei Blätter:** ein Bildblatt zum Anschauen und Erzählen, ein Übungsblatt mit genau **einer** Aufgabe.
3. **Höchstens eine Aufgabe pro Blatt.** Mehrere Aufgaben auf einem Blatt kann die KI
   nicht sauber trennen – sie liest dann alles als eine einzige Aufgabenstellung.
4. **Abschlussblatt** als Belohnung (Urkunde zum Ausmalen). Ist es abgehakt, ist das
   Heft komplett und es gibt den Pokal.

Praktische Größe: 12–16 Blätter. Das entspricht 12–16 KI-Aufrufen beim Auslesen,
bleibt also gut im kostenlosen Tageskontingent.

## Ablauf heute (ohne Generator)

1. Blätter gestalten oder besorgen, als PDF oder Fotos bereitlegen.
2. In der Bibliothek **„Neu anlegen als: 📝 Übungsheft"** wählen.
3. Importieren (PDF ist am besten: die gedruckte Aufgabenstellung wird dann wörtlich
   übernommen statt per Bilderkennung geraten).
4. „Alle unanalysierten Seiten auslesen" – die KI erzeugt pro Blatt Erklärung,
   Hilfeschritte und Lösung.
5. **Selbst gegenlesen.** Mindestens die Lösungen einmal durchklicken, bevor das Kind
   damit arbeitet.
6. Kind arbeitet am Papier, Tablet liest vor und hilft, jede fertige Aufgabe wird
   abgehakt.

## Verlässlichkeit – der wichtigste Punkt

Die KI ist bei Bibelinhalten nicht zuverlässig: Namen, Zahlen und Abläufe werden
gerne „plausibel" nacherzählt statt korrekt wiedergegeben. Deshalb:

- **Den biblischen Text immer selbst vorgeben**, nie die KI frei erzählen lassen.
  Bei einem PDF mit Textebene wird der Text garantiert wortgetreu übernommen
  (`pdfSourceText` in `js/utils.js` → `buildPageVariant()`).
- Die KI macht nur die **Übung drumherum** (erklären, in Schritte zerlegen).
- Der Heft-Prompt weist sie ausdrücklich an, bei Unsicherheit
  „Das kann ich hier nicht sicher erkennen." zu antworten, statt zu raten. Kommt das
  bei einem Blatt, ist das ein Hinweis auf ein zu volles oder zu undeutliches Blatt.

## Wenn das Heft die eigene Familie verlässt

Sobald Hefte an andere Familien weitergegeben werden sollen, gelten andere Regeln als
für den Privatgebrauch:

- **Bibelübersetzungen sind urheberrechtlich geschützt** – Luther 2017,
  Einheitsübersetzung, BasisBibel, Gute Nachricht, Hoffnung für alle dürfen nicht
  einfach abgedruckt werden. Frei nutzbar sind ältere, gemeinfreie Fassungen
  (z.B. Luther 1912, Elberfelder 1905, Schlachter 1951). Vor der Weitergabe prüfen.
- **Ausmalbilder und Cliparts** aus dem Netz sind fast nie zur Weitergabe freigegeben.
  Sicher sind eigene Zeichnungen oder ausdrücklich lizenzfreie Quellen (CC0).
- Die App selbst gibt nichts weiter – jede Weitergabe ist eine bewusste Handlung
  (Export-Datei verschicken oder Heft ausdrucken).

---

# TEIL 2 – Heft-Generator (Übungsblätter von der KI erstellen lassen)

**Status:** fertig gebaut (v0.16.0-beta, Druckqualität nachgezogen in v0.17.0-beta) –
KI-Aufruf, Auswahl-Ansicht, Canvas-Zeichnen und Druck als echter Text laufen. Offen ist
nur noch KI-Bildgenerierung für Ausmalbilder (siehe „Offene Punkte" unten), ein eigenes
größeres Thema. **Voraussetzung:** Teil 1 (der Heft-Modus) läuft bereits.

## Ziel

Heute kann die App vorhandene Übungsblätter **auslesen und erklären** (Teil 1). Der
Generator soll den Schritt davor übernehmen: aus „Arche Noah" + „Zahlen bis 10" ein
fertiges Übungsblatt machen, das man ausdrucken oder direkt am Tablet bearbeiten kann.

## Gedachter Ablauf

1. Bibliothek → „📝 Heft erstellen lassen"
2. Auswahl: Geschichte (z.B. Arche Noah), Lernziel (z.B. Mengen bis 10), Anzahl Blätter
3. Optional: eigenen Bibeltext einfügen, statt die KI erzählen zu lassen
4. Die KI liefert pro Blatt: Überschrift, Aufgabenstellung, kindgerechte Erklärung,
   Hilfeschritte, Lösung
5. Blätter werden als ganz normales Übungsheft in der Bibliothek angelegt
6. Ausdrucken über die vorhandene Druckfunktion

## Technischer Entwurf

**Gebaute Dateien** (Konvention aus der CLAUDE.md):
- `js/actions/workbookGenerator.js` – Auswahl entgegennehmen, KI aufrufen, Blätter auf
  Canvas zeichnen, Buch anlegen
- `js/render/workbookGenerator.js` – die Auswahl-Ansicht (Formular bzw. Blätter-Liste
  zum Abwählen)
- beide in `js/main.js` importiert und in `sw.js` zur `APP_SHELL` hinzugefügt

**Der API-Aufruf (gebaut).** In `js/api.js`, nach dem Muster von `generateBookQuiz()` –
ein reiner Text-Aufruf ohne Bild, **ein Aufruf für das ganze Heft**:

```js
await app.api.generateWorksheets({
    story:        'Arche Noah',      // Thema/Geschichte (Pflicht)
    learningGoal: 'Mengen bis 10',   // Lernziel (Pflicht)
    count:        6,                 // Anzahl Blätter, 1-12 (Standard 6)
    personaId:    'standard',        // optional, sonst die eingestellte Persona
    ownText:      null               // optional: eigener Quelltext, den die KI
                                     // inhaltlich übernehmen muss
});
// -> {
//   title,     // Titel des Hefts
//   skipped,   // Anzahl aussortierter, unbrauchbarer Blätter
//   sheets: [{ heading, taskText, taskExplained, taskType, materials,
//              body, pageDescription, helpSteps, solution }]
// }
```

Abweichungen vom ursprünglichen Entwurf oben, bewusst so gebaut:

- **Ein Objekt statt fünf Einzelparameter.** Zwei optionale Textfelder
  hintereinander (`personaId`, `ownBibleText`) verwechselt man sonst zu leicht.
- **Neues Feld `body`** – die Zeilen, die tatsächlich auf das Blatt gedruckt
  werden (Reihen von Emojis zum Zählen, Kästchen zum Ankreuzen, Punktlinien zum
  Nachspuren). Beim Auslesen gibt es dafür kein Gegenstück, weil das Blatt dort
  ja schon existiert. Genau dieses Feld zeichnet später der Canvas-Schritt.
- **Die übrigen Feldnamen sind absichtlich identisch** mit dem Auslese-Schema
  (`buildWorkbookPrompt()`): ein erzeugtes Blatt läuft damit unverändert durch
  `app.utils.buildPageVariant(sheet, page, 'workbook')`.
- **Nur Aufgabenarten ohne Bildmaterial.** Der Prompt lässt ausschließlich
  `zaehlen`, `ankreuzen`, `nachspuren` und `schreiben` zu (Liste
  `GENERATOR_TASK_TYPES` in `js/api.js`, dort mit je einem Hinweis, wie so ein
  Blatt aus reinen Zeichen aufgebaut wird). Antwortet das Modell trotzdem mit
  einer anderen Art, hat es sich ein Blatt mit Bild ausgedacht – so ein Blatt
  wird verworfen und in `skipped` mitgezählt, statt leer im Heft zu landen.
  Kommt die Bildgenerierung dazu, wird diese Liste erweitert.
- **Bibeltreue:** ohne `ownText` weist der Prompt die KI ausdrücklich an, keine
  Namen, Zahlen, Orte oder Abläufe dazuzuerfinden; mit `ownText` ist dieser Text
  inhaltlich verbindlich.

**Das Kernproblem: eine Seite braucht ein Bild (gelöst).** Das gesamte Datenmodell ist
„eine Seite = ein Bild + Text" (`page.imgUrl`). Ein erzeugtes Blatt hat aber kein Foto.
`drawWorksheetCanvas()` in `js/actions/workbookGenerator.js` übernimmt dafür dieselbe
Technik wie `renderTextAsImageCanvas()` in `js/actions/epubImport.js` (Text auf Canvas
zeichnen, daraus über `app.utils.createImageVariants()` ein ganz normales Seitenbild
erzeugen) – nur mit weißem statt gelblichem Hintergrund (Druckqualität), großer
kindgerechter Schrift und viel Zeilenabstand im Übungsfeld zum Schreiben/Nachspuren.
Reader, Druck, Fortschritt und Kontrolle laufen dadurch unverändert weiter.

**Kein zweiter KI-Aufruf nötig:** die erzeugten Felder werden direkt als Variante in
die Seite geschrieben (`page.variants[personaId]`, Aufbau wie in
`app.utils.buildPageVariant()` für `bookType: 'workbook'`), `status: 'done'`. Das
Blatt muss also nicht nachträglich „ausgelesen" werden – ein Heft mit 12 Blättern
kostet damit **einen** Aufruf statt zwölf.

## Offene Punkte

1. ~~Wie sehen die Blätter aus?~~ **entschieden und gebaut:** nur `zaehlen`,
   `ankreuzen`, `nachspuren`, `schreiben` (Aufgabentypen ohne Bild). Ausmalbilder
   bräuchten KI-Bildgenerierung – siehe [`docs/KONZEPT-Comic.md`](KONZEPT-Comic.md)
   und [`docs/KONZEPT-Bildquellen.md`](KONZEPT-Bildquellen.md), wäre ein möglicher
   nächster Schritt danach.
2. **Woher kommt der Bibeltext?** Die KI frei erzählen zu lassen ist bei
   Bibelinhalten unzuverlässig (siehe „Verlässlichkeit" in Teil 1). Sicherer: Feld für
   eigenen Text, den die KI wörtlich übernehmen muss – dieses Feld steht im Formular
   (`heftGenOwnText`), bleibt aber weiterhin **manuell** einzutragen.
3. ~~**Druckqualität.**~~ **erledigt (v0.17.0-beta):** Der Bedenken war, eine eigene
   Druckansicht schaffe zwei Wege zum selben Inhalt. Stattdessen bekommt die Seite ein
   zusätzliches, persona-unabhängiges Feld `generatedSheet: { heading, body }`
   (gleiches Muster wie `pdfSourceText`) - `app.actions.printBook()` (bestehende
   Funktion, `js/actions/backup.js`) nutzt es, wenn vorhanden, statt des
   Canvas-Seitenbildes. Kein zweiter View, keine zwei Wege - nur eine zweite,
   schärfere Textquelle für denselben Druck-Weg.
4. **Kosten/Limit.** Ein Aufruf pro Heft ist unkritisch, auch im kostenlosen Tarif.
5. **Weitergabe an andere Familien / woher der Bibeltext kommt / fester Lehrplan oder
   frei?** - drei zusammengehörige Fragen, die vor allem für Teil-1-Nutzung *und* den
   Generator gelten:
   - Sollen Hefte nur für die eigenen Kinder sein oder auch für andere Familien? Davon
     hängt ab, wie streng die Quellenfrage behandelt werden muss (siehe „Wenn das Heft
     die eigene Familie verlässt" in Teil 1).
   - Woher kommt der Bibeltext konkret: eigene Nacherzählung, gemeinfreie Übersetzung,
     oder eine vorhandene Kinderbibel, die abfotografiert wird?
   - Soll ein Heft einem festen Lehrplan folgen (Woche 1 bis Woche 12) oder frei nach
     Lust und Laune bearbeitet werden? Ein Lehrplan bräuchte eine Reihenfolge-Sperre,
     die es heute nicht gibt.

## Aufwand (grobe Einschätzung)

| Schritt | Umfang |
|---|---|
| ~~API-Aufruf + Prompt~~ | **erledigt** – `app.api.generateWorksheets()` |
| ~~Auswahl-Ansicht~~ | **erledigt** – `js/render/workbookGenerator.js`, Router-Eintrag `workbookGenerator` in `js/nav.js` |
| ~~Blätter auf Canvas zeichnen~~ | **erledigt** – `drawWorksheetCanvas()` in `js/actions/workbookGenerator.js` |
| ~~Druckqualität (Punkt 3)~~ | **erledigt** – `page.generatedSheet`, genutzt von `app.actions.printBook()` |
| KI-Bildgenerierung für Ausmalbilder | groß, eigenes Thema |

**Nächster möglicher Schritt:** KI-Bildgenerierung für Ausmalbilder
(`zuordnen`/`ausmalen`/`verbinden`/`suchen` erweitern `GENERATOR_TASK_TYPES` in
`js/api.js`) – ein eigenständiges, größeres Thema, siehe `docs/KONZEPT-Comic.md` und
`docs/KONZEPT-Bildquellen.md`. Braucht erst Abstimmung mit dem Nutzer.
