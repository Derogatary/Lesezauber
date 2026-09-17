# ✅ Gesamt-To-Do (alle Zweige zusammengeführt)

**Stand: v0.12.0-beta, September 2026**

In dieser Version sind alle bis dahin getrennt entwickelten Entwicklungszweige in einem
Stand vereint. Jeder Zweig hatte seine eigene To-Do-Liste - diese Datei führt sie zusammen,
**sortiert nach Bereich und Aufwand**, damit nicht mehr an fünf Stellen nachgeschaut werden muss.

> **Diese Datei ist die Übersicht, nicht der Detailplan.** Wo es ein ausgearbeitetes Konzept
> gibt, steht hier nur eine Zeile plus Verweis. Vor der Arbeit an einem Punkt immer erst das
> verlinkte Dokument lesen - dort stehen Begründungen und bereits verworfene Wege.

## Aufwands-Stufen

| Kürzel | Bedeutung |
|---|---|
| **S** | unter ~1 Stunde bis halber Tag - wenige Zeilen, Muster im Projekt vorhanden |
| **M** | ~1-5 Tage - neue Ansicht, neuer Ablauf, aber bekannte Bausteine |
| **L** | Wochen - mehrere Ausbaustufen, neues Datenmodell oder neue Abhängigkeit |
| **XL** | Eigenes Vorhaben - verlässt die reine Browser-Architektur |

Die Einschätzungen stammen aus den jeweiligen Konzeptpapieren, nicht aus dem Bauchgefühl;
wo dort eine Zahl steht, ist sie übernommen.

## Wo was steht

| Datei | Inhalt |
|---|---|
| `docs/TODO-GESAMT.md` (hier) | Übersicht über **alle** offenen Punkte, nach Bereich & Aufwand |
| `docs/ROADMAP.md` | Vorlesen/Stimmen im Detail, inkl. Kostenübersicht |
| `docs/KONZEPT-Video.md` | Sprach-API, Video/MP4, Hörbuch, Mehrformat-Ausspielung |
| `docs/KONZEPT-SchreibZauber.md` | Eigener Schreib-/Generierungs-Bereich für selbst erstellte Werke |
| `docs/KONZEPT-Bildquellen.md` | Woher Bilder für selbst erstellte Werke kommen |
| `docs/KONZEPT-Comic.md` | KI-generierte Illustrationen/Comic - EPUB-Illustration UND SchreibZauber-Werktyp |
| `docs/KONZEPT-Uebungshefte.md` | Heft-Modus (umgesetzt) + Heft-Generator (offen), ein Dokument |

---

## 🎯 Schnelle Treffer zuerst

Quer durch alle Bereiche: Das hier ist klein, risikoarm und sofort spürbar. Wer wenig Zeit
hat, fängt hier an - nichts davon fasst das Datenmodell an.

| # | Punkt | Bereich | Aufwand |
|---|---|---|---|
| 1 | Vorlese-Aufbereitung des erkannten Texts (Trennstriche, Abkürzungen) | Vorlesen | **S** |
| 2 | Kino-Modus vollenden: Ken-Burns-Zoom + Kreuzblende | Video | **S** |
| 3 | Stimmen-Speicher auf 300 MB erhöhen (eine Konstante) | Vorlesen | **S** |
| 4 | Speechify als 5. Anbieter ergänzen (günstiger als ElevenLabs, exakte Zeitstempel) | Vorlesen | **S** |
| 5 | Mehr Stimmen freischalten (je eine Zeile in `ttsProviders.js`) | Vorlesen | **S** |
| 6 | „Buch hörfertig machen" - alle Seiten vorab in den Stimmen-Speicher | Vorlesen | **S** |
| 7 | Stimme pro Profil statt global | Vorlesen | **S** |
| 8 | Kosten-Anzeige (lokal gezählte Zeichen pro Monat) | Vorlesen | **S** |
| 9 | Zweiter Comic-Testlauf mit korrigiertem Prompt | Eigene Werke | **S** |
| 10 | Tarif-Lock: Warnung vor Wechsel in teurere Preisstufe | Vorlesen | **S** |

**Nummer 1 ist der beste Einstieg:** Sie verbessert *jede* Stimme, Geräte- wie KI-Stimme,
lässt die Anzeige unangetastet und kann nichts kaputt machen.

---

## 🔊 Bereich: Vorlesen & Stimmen

Details: [`docs/ROADMAP.md`](ROADMAP.md)

| Punkt | Aufwand | Anmerkung |
|---|---|---|
| **Stimmen-Speicher auf 300 MB erhöhen** | **S** | ✅ entschieden - eine Konstante in `js/db.js` (`TTS_CACHE_MAX_BYTES`). Eviction-Logik existiert bereits |
| **Speechify als 5. Anbieter ergänzen** | **S** | ✅ entschieden - $6-10/Mio. Zeichen statt ElevenLabs' ~$100/Mio., ebenfalls exakte Wort-Zeitstempel, Deutsch unterstützt. Neuer Eintrag in `js/ttsProviders.js` |
| **Vorlese-Aufbereitung des erkannten Texts** | **S** | Eigene Funktion neben `app.utils.stripEmojiForSpeech()`; Trennstrich + Zeilenumbruch zusammenziehen, Abkürzungen ausschreiben. Nur fürs Ohr, Anzeige bleibt |
| **Mehr Stimmen freischalten** | **S** | In `js/ttsProviders.js` ist nur eine Vorauswahl eingetragen (Gemini hat 30, OpenAI 11+) |
| **„Buch hörfertig machen"** | **S** | Knopf, der alle Seiten vorab in den `ttsCache` legt - danach ohne Wartezeit und offline |
| **Stimme pro Profil** | **S** | `app.settings.ttsVoices` müsste pro Profil statt global gespeichert werden |
| **Kosten-Anzeige** | **S** | Rein lokal geschätzt mitzählen, wie viele Zeichen im Monat an den Anbieter gingen |
| **Tarif-Lock** | **S** | Neu, aus der SchreibZauber-Budget-Diskussion. `costTier`-Flag je Stimme/Modell, Bestätigungsdialog vor einem Wechsel auf eine teurere Option - schützt vor Versehen, nicht vor Absicht. Betrag bleibt beim Anbieter gedeckelt, nicht in der App |
| **Mitmachmodus mit KI-Stimme** | **M** | Läuft heute bewusst immer über die Gerätestimme. Über Pausen-Tags lösbar (Gemini `[pause]`, Chirp 3 über `markup`) - eine Aufnahme, keine Mehrkosten. Text stückeln wäre die teure Alternative |
| **Lange Texte stückeln** | **M** | Über `MAX_NEURAL_CHARS = 4000` (praktisch nur EPUB-Kapitel) fällt es auf die Gerätestimme zurück. An Satzenden in ~800-Zeichen-Stücke zerlegen, Wort-Offsets verschieben |
| **Emotionen / Audio-Tags** | **M** | ✅ entschieden, Weg klar: `speechText`-Feld immer mitgenerieren (kein Zusatz-Call), `supportsTags`-Flag je Anbieter. Bei ElevenLabs Modell auf `eleven_v3` umstellen - **kostet seit GA nicht mehr als v2** |

**Geprüft und verworfen (fürs Erste):** Audiodateien im Bibliotheks-Export mit sichern.
Würde einen neuen Exportweg mit Audio-Blobs brauchen (Export/Reimport nimmt heute nur Bild+Text
mit) - eigener, größerer Punkt, kein Teil der Speicher-Entscheidung oben.

---

## 🎬 Bereich: Video & Ausspielung

Details: [`docs/KONZEPT-Video.md`](KONZEPT-Video.md)

| Punkt | Aufwand | Anmerkung |
|---|---|---|
| **Kino-Modus vollenden** | **S** | Nur noch Ken-Burns-Zoom (reines CSS) und Kreuzblende beim Seitenwechsel. **Der Textteil ist seit v0.12.0 erledigt** - das Konzeptpapier führt ihn noch als offen, das stimmt nicht mehr |
| **Video-Export Weg B** (WebCodecs + Muxer) | **L** | „mittel, ~3-5 Tage inkl. Regie-Logik". **Durch die Entscheidung „pro Buch" der einzig sinnvolle Weg** - siehe unten. Muxer-Bibliothek nur wenige KB nach `js/vendor/` |
| ~~Weg A (`MediaRecorder`)~~ | — | **Für ganze Bücher ausgeschieden:** nimmt in Echtzeit auf, 8-10 Minuten mit sichtbarem Tab im Vordergrund. Höchstens noch Notnagel für Einzelseiten |
| ~~Weg C (ffmpeg.wasm)~~ | — | **Bewusst verworfen.** 25-30 MB Zusatz-Download und auf GitHub Pages nur mit Service-Worker-Trick. Nicht neu aufrollen |

**✅ Entschieden (Sept. 2026): beides, Schwerpunkt pro Buch.** Das ganze Buch als ein Film
ist der Hauptfall; pro Seite fällt fast gratis ab, weil der Renderer ohnehin einen
**Seitenbereich** bekommt (pro Seite = Bereich `[i, i]`).

Daraus folgen zwei Dinge:
- **Weg A scheidet für ganze Bücher aus** (Echtzeit-Aufnahme). Zielarchitektur ist Weg B.
- **Pro Seite bleibt die Einheit zum Verschicken** - ein Buch-Film hat 120-240 MB und passt
  durch keinen E-Mail-Anhang. Die beiden Varianten haben verschiedene Zwecke.

**Reihenfolge:** erst Kino-Modus (größter Effekt pro Aufwand), dann den Bereichs-Renderer -
getestet an einer Einzelseite, ausgeliefert fürs ganze Buch.

---

## 🪄 Bereich: Eigene Werke erstellen

Details: [`docs/KONZEPT-SchreibZauber.md`](KONZEPT-SchreibZauber.md), [`docs/KONZEPT-Bildquellen.md`](KONZEPT-Bildquellen.md), [`docs/KONZEPT-Comic.md`](KONZEPT-Comic.md)

Der größte Brocken im Projekt - dafür in Stufen geschnitten, die **einzeln lieferbar** sind.

| Punkt | Aufwand | Anmerkung |
|---|---|---|
| **Comic: zweiter Testlauf** | **S** | Ein Testbild hat zwei Prompt-Probleme aufgedeckt; der korrigierte Wortlaut ist noch nicht erprobt. Steht vor allem Weiteren |
| **SchreibZauber Stufe 1 - Fundament** | **L** | Datenmodell, **DB v3**, Werkstatt-Übersicht, Idee/Bauplan/Geschichte, Platzhalter-Bilder, Export „ins Regal". **Ohne einen einzigen Bildaufruf**, laut Konzept bestes Nutzen-pro-Aufwand-Verhältnis. **Prompt-Leitplanken jetzt von Anfang an auf Veröffentlichung auslegen** (Entscheidung 6) - nicht nachträglich nachrüstbar |
| **SchreibZauber Stufe 2 - Bilder** | **L** | Stilkarte, Figuren-Bibel, Storyboard, Bildgenerierung, Kostenzähler. Ab hier kostet es echtes Geld |
| **SchreibZauber Stufe 3 - Layout & Druck** | **M** | Textplatzierung, Silbenfarben, Doppelseiten-Druck. **Gleich druckfertige Exportformate mitdenken** (KDP-taugliche PDF/Auflösung/Bleed, Entscheidung 6) |
| **SchreibZauber Stufe 4 - Arbeitsheft** | **L** | Lernziel, Progression, Aufgabenbaukasten, Lösungsteil |
| **SchreibZauber Stufe 5 - Comic** | **L** | Panel-Layouts, Sprechblasen-Overlay |
| **SchreibZauber Stufe 6 - Politur** | **M** | Zweite Einstiegsseite `schreiben.html` (Icon-Idee: magischer Stift), projektübergreifende Figuren, Vorlagen. ✅ entschieden: kommt, keine reine Tab-Lösung auf Dauer |
| **Comic-Generator-Werkzeug** | **L** | Bewusst **kein** App-Feature: eigenes Node-Werkzeug lokal beim Betreiber (`tools/comic-gen/`), weil Browser nur CORS-fähige Bild-Anbieter erreichen |

**Zwei Fallen, die im Konzept ausdrücklich benannt sind:**
- **Reihenfolge einhalten.** Stufe 1 ohne Bilder ist ein vollständiges Feature, kein Torso.
- `js/studio/*` liegt schon im Repo, ist aber **absichtlich noch nicht in `js/main.js`
  eingebunden** und steht deshalb auch nicht in der `APP_SHELL` von `sw.js`. Beides gehört
  zum ersten Schritt von Stufe 1.

**✅ Entschieden (Sept. 2026): Werktyp-Pfade parallel statt sequenziell.** Kein "erst
Bilderbuch, dann Arbeitsheft" mehr - Stufe 2+3 (Bilderbuch) und Stufe 4 (Arbeitsheft) sollen
mit mehreren gleichzeitigen Claude-Code-Sitzungen parallel entwickelt werden, sobald Stufe 1
steht. **Bedingung:** Stufe 1 zuerst fertig bauen und mergen - beide Pfade bauen darauf auf,
nicht aufeinander, sonst laufen die Sitzungen auf unterschiedlichen Grundlagen auseinander.
Details: `docs/KONZEPT-SchreibZauber.md`, TEIL G.

---

## 📝 Bereich: Übungshefte & Lernen

Details: [`docs/KONZEPT-Uebungshefte.md`](KONZEPT-Uebungshefte.md)

Der Heft-**Modus** (Blätter auslesen, erklären, kontrollieren) ist fertig. Offen ist der
Schritt davor: Blätter **erzeugen**.

| Punkt | Aufwand | Anmerkung |
|---|---|---|
| **Kontroll-Funktion im Alltag beobachten** | **S** | Wie zuverlässig beurteilt Gemini die Fotos bearbeiteter Blätter? Bei zu vielen „unklar" wäre eine Foto-Hilfe (Rahmen, Helligkeitshinweis) der nächste Schritt |
| **Heft-Generator: API-Aufruf + Prompt** | **S** | Muster vorhanden (`generateBookQuiz`). Ein Heft = **ein** Aufruf, nicht einer pro Blatt |
| **Heft-Generator: Auswahl-Ansicht** | **M** | Neue Ansicht inkl. Router-Eintrag in `js/nav.js` |
| **Heft-Generator: Blätter auf Canvas zeichnen** | **M** | Vorlage vorhanden: `renderTextAsImageCanvas()` in `epubImport.js` |
| **Heft-Generator: eigene Druckansicht** | **M** | Optional. Ein Canvas-Bild druckt schlechter als echter Text - dafür gäbe es dann zwei Wege zum selben Inhalt |

**Wichtigste Einschränkung:** Ein auf Canvas gezeichnetes Textblatt ist für „Male die Tiere
an" nutzlos - da fehlen die Tiere. Zuerst also Aufgabentypen **ohne Bild** (Zählen,
Ankreuzen, Nachspuren, Schwungübungen). Ausmalbilder setzen die Bildgenerierung voraus.

---

## 📱 Bereich: App & Plattform

| Punkt | Aufwand | Anmerkung |
|---|---|---|
| **Kinder-/Elternbereich (Profil-Rollen)** | **M** | Neu, aus der Diskussion um den TTS-Anbieter entstanden. Profile speichern heute nur `{id, name}` - neues Feld `role: 'child' \| 'adult'` (Default `'child'`), sperrt teure Einstellungen (TTS-Anbieter, API-Keys) für Kinderprofile. Lohnt sich schon **vor** SchreibZauber Stufe 6 |
| **Native Android-App via Capacitor** | **M** | Verpackt den bestehenden Code weitgehend unverändert. Nebeneffekt laut Roadmap: Ein natives Paket könnte **Audio im Hintergrund** abspielen - im Browser hört das Vorlesen beim Sperren des Bildschirms auf |
| **API-Keys über ein Backend absichern** | **XL** | Braucht einen Server |
| **Automatische Cloud-Synchronisierung** | **XL** | Braucht einen Server |
| **Echte Multi-Geräte-Accounts mit Login** | **XL** | Braucht einen Server |

Die drei **XL**-Punkte sind **bewusst zurückgestellt**, nicht vergessen. Seit den KI-Stimmen
liegen mehr Keys im Browser als vorher - die Abwägung bleibt aber dieselbe: Ein Server würde
die gesamte Architektur des Projekts umdrehen.

---

## 🔍 Bereich: Diagnose (nicht reproduziert)

| Punkt | Aufwand | Anmerkung |
|---|---|---|
| Scroll-Verhalten am Bildschirmrand (Desktop) | **?** | Bisher nicht nachstellbar |
| Zoom/Unschärfe im Fenstermodus | **?** | Bisher nicht nachstellbar |

Beides braucht vermutlich einen Screenshot vom Nutzer - vorher lässt sich der Aufwand nicht
einschätzen.

---

## ⚖️ Offene Entscheidungen (blockieren jeweils den nächsten Schritt)

Diese Punkte sind **nicht** technisch offen, sondern brauchen eine Ansage des Betreibers:

Alle sechs sind inzwischen entschieden (Sept. 2026) - Details in `KONZEPT-Video.md`
(Punkt 1), `ROADMAP.md` (Punkte 2-4) bzw. `KONZEPT-SchreibZauber.md` (Punkte 5-6):

| # | Entscheidung | Ergebnis |
|---|---|---|
| ~~1~~ | ~~Video-Export: pro Seite oder pro Buch?~~ | **beides, Schwerpunkt pro Buch** (siehe Video-Bereich) |
| ~~2~~ | ~~ElevenLabs v3 (bezahlt) für Emotions-Tags?~~ | **kein Bezahltarif nötig** - v3 ist seit GA (März 2026) zum Preis von v2. Tags automatisch je Anbieter (`supportsTags`) |
| ~~3~~ | ~~Reicht der Stimmen-Speicher mit 100 MB?~~ | **auf 300 MB erhöht**, eine Konstante in `js/db.js` |
| ~~4~~ | ~~Welcher Anbieter wird der Familien-Standard?~~ | **kein fester Standard** - bleibt wählbar, Default Gerätestimme. Speechify als 5. Anbieter vorgemerkt (günstiger als ElevenLabs, ebenfalls exakte Zeitstempel) |
| ~~5~~ | ~~SchreibZauber: eigener Tab oder eigene App?~~ | **beides, als Stufen** - Stufe 1-5 als Tab, Stufe 6 optional zweites Icon (Vorschlag: magischer Stift), gleiche Code-Basis |
| ~~6~~ | ~~Weitergabe erzeugter Hefte/Werke~~ | **ja, auf Veröffentlichung auslegen** (z.B. Amazon KDP) - verschärft Stufe 1 (Prompt-Leitplanken) und Stufe 3 (druckfertiger Export) von Anfang an |

**Neu dazugekommen aus der Diskussion:** Kinder-/Elternbereich (Profil-Rollen) - siehe
Bereich „App & Plattform" unten.

---

## 1. In v0.12.0 fertig geworden

Diese Punkte standen früher auf den Listen und sind jetzt erledigt - nicht erneut einplanen:

- **Vollbild-Vorlese-Modus mit Text und Wort-Hervorhebung**
- **Zweiseitiges Layout für PC/Tablet** (Bild links, Text rechts; Option, greift ab Tablet-Breite)
- **Mitmachmodus** - Sprechpause vor jedem durch ein Emoji ersetzten Wort (Gerätestimme)
- **Strukturierte Metadaten-Ansage** - Titel/Autor/Verlag/Reihe, Kapitelüberschriften, Inhaltsverzeichnis
- **Manuelle Seiten-Rollen** - Titelseite/Rückseite/Inhaltsverzeichnis/„Über den Autor" markieren,
  einzelne Seiten vom Vorlesen ausnehmen
- **Heft-Modus** für Übungshefte inkl. **Kontrolle bearbeiteter Blätter** per Foto
- **Fortschritt und Belohnungen** (geschaffte Bücher/Hefte)
- **KI-Stimmen** (Gemini, Google Cloud Chirp 3 HD, ElevenLabs, OpenAI) inkl. Stimmen-Speicher
- **Mistral-Fallback fürs Buch-Quiz** (war der letzte Aufruf ohne Fallback)
- **Dark-Mode-Lücken** geschlossen, Einzelbuch-Reimport repariert
