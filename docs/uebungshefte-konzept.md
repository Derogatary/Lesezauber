# Bibel-Übungshefte zur Schulvorbereitung – Konzept

**Stand:** v0.10.0-beta · Grundlage für die Weiterarbeit, noch keine fertige Planung.

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

## Was die App heute dafür kann (v0.10.0-beta)

| Baustein | Wo | Anmerkung |
|---|---|---|
| Blätter erfassen | Foto, Galerie, PDF, EPUB | PDF mit Textebene liefert die Aufgabenstellung wortgenau (`pdfSourceText`), ohne OCR-Raterei |
| Aufgabe auslesen | `js/api.js` → `buildWorkbookPrompt()` | eigener Prompt: Aufgabentext, kindgerechte Erklärung, Material, 3–5 Hilfeschritte, Lösung |
| Vorlesen & Helfen | `js/tts.js` → `_readWorkbookTask()` | liest Aufgabe + Erklärung + Hilfeschritte mit Pausen, blättert danach **nicht** weiter |
| Nachfragen | „Frag den Zauberer" im Reader | Kind/Eltern können zum abfotografierten Blatt frei nachfragen |
| Lösung | Hilfe-&-Lösung-Tab | absichtlich ein extra Tipp, klappt beim Seitenwechsel wieder zu |
| Fortschritt | `js/actions/progress.js` | Häkchen + Sticker pro Aufgabe, **pro Kind-Profil**, Pokal für ein komplettes Heft |
| Ausdrucken | 🖨️ in der Buchansicht | druckt bei Übungsheften auch Erklärung und Hilfeschritte mit |
| Mehrere Kinder | Profile | jedes Kind hat seinen eigenen Stand im selben Heft |

## Was sie (noch) nicht kann

- **Hefte selbst erzeugen.** Blätter müssen vorhanden sein (selbst gestaltet, gekauft,
  ausgedruckt). Siehe `docs/todo-heft-generator.md`.
- **Zuhören.** Die App spricht, hört aber nicht. „Kind antwortet mündlich, App prüft"
  geht heute nicht (keine Spracherkennung im Projekt).
- **Kontrollieren, was das Kind gemalt/geschrieben hat.** Ein abfotografiertes
  bearbeitetes Blatt könnte die KI zwar beurteilen – dafür gibt es bisher keinen
  Ablauf in der App.
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

## Offene Fragen

- Sollen die Hefte nur für die eigenen Kinder sein oder auch für andere Familien?
  Davon hängt ab, wie streng die Quellenfrage behandelt werden muss.
- Woher kommt der Bibeltext: eigene Nacherzählung, gemeinfreie Übersetzung, oder eine
  vorhandene Kinderbibel, die abfotografiert wird?
- Soll ein Heft einem festen Lehrplan folgen (Woche 1 bis Woche 12) oder frei nach
  Lust und Laune bearbeitet werden? Ein Lehrplan bräuchte eine Reihenfolge-Sperre,
  die es heute nicht gibt.
- Sollen bearbeitete Blätter abfotografiert und von der KI kontrolliert werden?
