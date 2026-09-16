# To-Do: Heft-Generator (Übungsblätter von der KI erstellen lassen)

**Status:** noch nicht begonnen – braucht vorher eine Entscheidung des Betreibers.
**Voraussetzung:** der Heft-Modus (v0.10.0-beta) läuft, siehe `docs/uebungshefte-konzept.md`.

## Ziel

Heute kann die App vorhandene Übungsblätter **auslesen und erklären**. Der Generator
soll den Schritt davor übernehmen: aus „Arche Noah" + „Zahlen bis 10" ein fertiges
Übungsblatt machen, das man ausdrucken oder direkt am Tablet bearbeiten kann.

## Gedachter Ablauf

1. Bibliothek → „📝 Heft erstellen lassen"
2. Auswahl: Geschichte (z.B. Arche Noah), Lernziel (z.B. Mengen bis 10), Anzahl Blätter
3. Optional: eigenen Bibeltext einfügen, statt die KI erzählen zu lassen
4. Die KI liefert pro Blatt: Überschrift, Aufgabenstellung, kindgerechte Erklärung,
   Hilfeschritte, Lösung
5. Blätter werden als ganz normales Übungsheft in der Bibliothek angelegt
6. Ausdrucken über die vorhandene Druckfunktion

## Technischer Entwurf

**Neue Dateien** (Konvention aus der CLAUDE.md):
- `js/actions/heftGenerator.js` – Auswahl entgegennehmen, KI aufrufen, Buch anlegen
- `js/render/heftGenerator.js` – die Auswahl-Ansicht
- beide in `js/main.js` importieren und in `sw.js` zur `APP_SHELL` hinzufügen

**Neuer API-Aufruf** in `js/api.js`, nach dem Muster von `generateBookQuiz()`
(reiner Text-Aufruf ohne Bild):

```js
app.api.generateWorksheets(story, learningGoal, count, personaId, ownBibleText)
// -> [{ heading, taskText, taskExplained, taskType, materials, helpSteps, solution }]
```

**Das Kernproblem: eine Seite braucht ein Bild.** Das gesamte Datenmodell ist
„eine Seite = ein Bild + Text" (`page.imgUrl`). Ein erzeugtes Blatt hat aber kein Foto.
Dafür gibt es im Projekt schon einen gelösten Präzedenzfall: `renderTextAsImageCanvas()`
in `js/actions/epubImport.js` zeichnet Text auf ein Canvas und erzeugt daraus über
`app.utils.createImageVariants()` ein ganz normales Seitenbild. Genau dieses Verfahren
sollte der Generator übernehmen – dann bleibt der Rest der App (Reader, Druck,
Fortschritt, Export) unverändert.

**Kein zweiter KI-Aufruf nötig:** die erzeugten Felder werden direkt als Variante in
die Seite geschrieben (`page.variants[personaId]`, Aufbau wie in
`app.utils.buildPageVariant()` für `bookType: 'workbook'`), `status: 'done'`. Das
Blatt muss also nicht nachträglich „ausgelesen" werden – ein Heft mit 12 Blättern
kostet damit **einen** Aufruf statt zwölf.

## Offene Punkte vor dem Start

1. **Wie sehen die Blätter aus?** Ein auf Canvas gezeichnetes Textblatt ist für
   „Male die Tiere an" nutzlos – da fehlen die Tiere. Realistisch sind zuerst
   Aufgabentypen, die ohne Bild auskommen: Zählen, Ankreuzen, Nachspuren von
   Buchstaben, Schwungübungen (als Linien aufs Canvas gezeichnet). Ausmalbilder
   bräuchten KI-Bildgenerierung – die steht ohnehin schon als eigener Punkt in der
   CLAUDE.md und wäre der nächste Schritt danach.
2. **Woher kommt der Bibeltext?** Die KI frei erzählen zu lassen ist bei
   Bibelinhalten unzuverlässig (siehe Konzeptpapier). Sicherer: Feld für eigenen
   Text, den die KI wörtlich übernehmen muss.
3. **Druckqualität.** Ein Canvas-Bild druckt schlechter als echter Text. Für
   ausdruckbare Hefte wäre eine eigene Druckansicht mit echtem HTML-Text besser als
   der Umweg über das Seitenbild – dann aber zwei Wege zum selben Inhalt.
4. **Kosten/Limit.** Ein Aufruf pro Heft ist unkritisch, auch im kostenlosen Tarif.
5. **Weitergabe an andere Familien.** Erst klären (Quellen, Lizenzen), siehe
   Konzeptpapier.

## Aufwand (grobe Einschätzung)

| Schritt | Umfang |
|---|---|
| API-Aufruf + Prompt | klein, Muster vorhanden (`generateBookQuiz`) |
| Auswahl-Ansicht | mittel, neue Ansicht inkl. Router-Eintrag in `js/nav.js` |
| Blätter auf Canvas zeichnen | mittel, Vorlage in `epubImport.js` vorhanden |
| Eigene Druckansicht (Punkt 3) | mittel, optional |
| KI-Bildgenerierung für Ausmalbilder | groß, eigenes Thema |

**Empfohlene Reihenfolge:** erst Aufgabentypen ohne Bild (Punkt 1), damit der Ablauf
komplett steht und benutzt werden kann. Bildgenerierung danach als eigener Schritt.
