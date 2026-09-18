# ✅ Gesamt-To-Do (alle Zweige zusammengeführt)

**Stand: v0.18.0-beta, September 2026**

> **Hinweis zu den Versionsnummern unten:** Heft-Generator und Video-Export sind in
> getrennten Zweigen parallel entstanden und haben dabei unabhängig voneinander
> dieselben Nummern vergeben (beide „v0.16.0-beta"). Mit dem Integrationspass zu
> v0.18.0-beta sind beide zusammengeführt; die Nummern in den Tabellen sagen nur noch,
> in welchem Zweig ein Punkt fertig wurde, nicht mehr in welcher Reihenfolge.

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
| `docs/AUFTRAEGE-SESSIONS.md` | Dieselben Punkte als fertige Arbeitspakete für einzelne Claude-Code-Sitzungen (zum Kopieren) |
| `docs/ROADMAP.md` | Vorlesen/Stimmen im Detail, inkl. Kostenübersicht |
| `docs/KONZEPT-Video.md` | Sprach-API, Video/MP4, Hörbuch, Mehrformat-Ausspielung |
| `docs/KONZEPT-SchreibZauber.md` | Eigener Schreib-/Generierungs-Bereich für selbst erstellte Werke |
| `docs/KONZEPT-Bildquellen.md` | Woher Bilder für selbst erstellte Werke kommen |
| `docs/KONZEPT-Comic.md` | KI-generierte Illustrationen/Comic - EPUB-Illustration UND SchreibZauber-Werktyp |
| `docs/KONZEPT-Uebungshefte.md` | Heft-Modus + Heft-Generator (beide umgesetzt), ein Dokument |

---

## 🎯 Schnelle Treffer zuerst

Quer durch alle Bereiche: Das hier ist klein, risikoarm und sofort spürbar. Wer wenig Zeit
hat, fängt hier an - nichts davon fasst das Datenmodell an.

| # | Punkt | Bereich | Aufwand |
|---|---|---|---|
| ~~1~~ | ~~Vorlese-Aufbereitung des erkannten Texts (Trennstriche, Abkürzungen)~~ **erledigt (Sept. 2026)** | Vorlesen | **S** |
| ~~2~~ | ~~Kino-Modus vollenden: Ken-Burns-Zoom + Kreuzblende~~ **erledigt (v0.13.0-beta)** | Video | **S** |
| ~~3~~ | ~~Stimmen-Speicher auf 300 MB erhöhen (eine Konstante)~~ **erledigt (Sept. 2026)** | Vorlesen | **S** |
| ~~4~~ | ~~Speechify als 5. Anbieter ergänzen (günstiger als ElevenLabs, exakte Zeitstempel)~~ **erledigt (Sept. 2026)** | Vorlesen | **S** |
| ~~5~~ | ~~Mehr Stimmen freischalten (je eine Zeile in `ttsProviders.js`)~~ **erledigt (Sept. 2026)** | Vorlesen | **S** |
| ~~6~~ | ~~„Buch hörfertig machen" - alle Seiten vorab in den Stimmen-Speicher~~ **erledigt (Sept. 2026)** | Vorlesen | **S** |
| ~~7~~ | ~~Stimme pro Profil statt global~~ **erledigt (Sept. 2026)** | Vorlesen | **S** |
| ~~8~~ | ~~Kosten-Anzeige (lokal gezählte Zeichen pro Monat)~~ **erledigt (v0.13.0-beta)** | Vorlesen | **S** |
| 9 | Zweiter Comic-Testlauf mit korrigiertem Prompt | Eigene Werke | **S** |
| ~~10~~ | ~~Tarif-Lock: Warnung vor Wechsel in teurere Preisstufe~~ **erledigt (Sept. 2026)** | Vorlesen | **S** |

**Nummer 1 ist der beste Einstieg:** Sie verbessert *jede* Stimme, Geräte- wie KI-Stimme,
lässt die Anzeige unangetastet und kann nichts kaputt machen.

---

## 🔊 Bereich: Vorlesen & Stimmen

Details: [`docs/ROADMAP.md`](ROADMAP.md)

| Punkt | Aufwand | Anmerkung |
|---|---|---|
| ~~**Stimmen-Speicher auf 300 MB erhöhen**~~ | **S** | ✅ **erledigt (Sept. 2026)** - `TTS_CACHE_MAX_BYTES` in `js/db.js` auf 300 MB erhöht |
| ~~**Speechify als 5. Anbieter ergänzen**~~ | **S** | ✅ **erledigt (Sept. 2026)** - `speechifySynthesize`/`fetchSpeechifyVoices` in `js/ttsProviders.js`, Modell `simba-3.2` |
| ~~**Vorlese-Aufbereitung des erkannten Texts**~~ | **S** | ✅ **erledigt (Sept. 2026)** - `app.utils.prepareTextForSpeech()` in `js/utils.js`, eingehängt in `js/tts.js`/`js/ttsNeural.js` |
| ~~**Mehr Stimmen freischalten**~~ | **S** | ✅ **erledigt (Sept. 2026)** - `js/ttsProviders.js` hat jetzt alle 30 Gemini- und alle 13 OpenAI-Stimmen |
| ~~**„Buch hörfertig machen"**~~ | **S** | ✅ **erledigt (Sept. 2026)** - Knopf in der Buchansicht legt alle Seiten vorab in den `ttsCache` (`js/actions/prepareAudio.js`) |
| ~~**Stimme pro Profil**~~ | **S** | ✅ **erledigt (Sept. 2026)** - `app.profileTtsMap` in `js/profiles.js`, `getProfileTtsSettings()`/`setProfileTtsSettings()`, beim Profilwechsel über `syncActiveProfileTtsSettings()` eingespielt |
| ~~**Kosten-Anzeige**~~ | **S** | ✅ **erledigt (v0.13.0-beta)** - Rein lokal geschätzt mitgezählt, wie viele Zeichen im Monat an den Anbieter gingen (`js/costMeter.js`), zusätzlich getrennt die Gemini-Textaufrufe. Zählt nur echte Synthesen, keine Cache-Treffer |
| ~~**Tarif-Lock**~~ | **S** | ✅ **erledigt (Sept. 2026)** - `costTier`-Feld je Anbieter in `js/ttsProviders.js`, Bestätigungsdialog in `app.settingsConfig.changeTtsProvider()` vor einem Wechsel auf eine teurere Stufe. Betrag bleibt beim Anbieter gedeckelt, nicht in der App |
| ~~**Mitmachmodus mit KI-Stimme**~~ | **M** | ✅ **erledigt (Sept. 2026)** - `app.ttsNeural.speakMitmach()` ersetzt die Emoji-Stellen durch eine `[pause]`-Sprechanweisung und spricht den ganzen Text in EINEM Aufruf (keine Mehrkosten). Nur bei Anbietern mit `supportsTags` (Gemini, ElevenLabs) - Chirp 3/OpenAI/Speechify fallen weiterhin auf die Gerätestimme zurück |
| ~~**Lange Texte stückeln**~~ | **M** | ✅ **erledigt (Sept. 2026)** - `app.utils.splitTextIntoChunks()` zerlegt an Satzenden in ~800-Zeichen-Stücke, `app.ttsNeural._speakChunked()` spielt sie nacheinander ab (Cache pro Stück), Hervorhebung über `_startHighlightingRange()`. Ab `MAX_CHUNKED_CHARS = 20000` bleibt es beim Rückfall auf die Gerätestimme |
| ~~**Emotionen / Audio-Tags**~~ | **M** | ✅ **erledigt (Sept. 2026)** - `speechText`-Feld wird immer mitgeneriert (`js/api.js`, kein Zusatz-Call), `supportsTags`-Flag je Anbieter in `js/ttsProviders.js` (Gemini, ElevenLabs), ElevenLabs-Modell auf `eleven_v3` umgestellt (seit GA nicht teurer als v2) |

**Geprüft und verworfen (fürs Erste):** Audiodateien im Bibliotheks-Export mit sichern.
Würde einen neuen Exportweg mit Audio-Blobs brauchen (Export/Reimport nimmt heute nur Bild+Text
mit) - eigener, größerer Punkt, kein Teil der Speicher-Entscheidung oben.

---

## 🎬 Bereich: Video & Ausspielung

Details: [`docs/KONZEPT-Video.md`](KONZEPT-Video.md)

| Punkt | Aufwand | Anmerkung |
|---|---|---|
| ~~**Hörbuch-Export**~~ | **M** | ✅ **erledigt (v0.13.0-beta)** - ganzes Buch als eine Audiodatei (`js/actions/audiobookExport.js`), Bildbeschreibung/Quiz zuschaltbar, nutzt den `ttsCache` und synthetisiert nichts doppelt |
| ~~**Video-Export Weg B, Teil 1: Renderer-Kern**~~ | **M** | ✅ **erledigt (v0.15.0-beta)** - Canvas-Renderer (`js/render/cinema.js`), Zeitplan über einen Seitenbereich (`js/actions/videoTimeline.js`) und Film-Vorschau (`js/actions/videoPreview.js`). Bild mit Ken-Burns + Untertitel-Balken mit mitlaufender Wort-Hervorhebung, drei Formate. Noch stumm und ohne Datei. Entscheidungen dazu: [`KONZEPT-Video.md`, Abschnitt 4.7](KONZEPT-Video.md#47-stand-von-weg-b-was-teil-1-entschieden-und-gebaut-hat) |
| ~~**Video-Export Weg B, Teil 2: ganzes Buch + Regie**~~ | **M** | ✅ **erledigt (v0.16.0-beta)** - `js/actions/videoExport.js` + `js/vendor/mp4muxer/`: echte Tonspur aus dem `ttsCache`, `VideoEncoder`/`AudioEncoder` mit Codec-Leiter (H.264/AAC, sonst Rückfall), MP4 über OPFS, Fortschritt + Abbruch, Größenschätzung vorab. Regie: Kreuzblende, Seiten-Rollen, Pausen. Nur bei `origin: 'authored'` |
| ~~**Video: Restpunkte**~~ | **S** | ✅ **die drei wichtigen erledigt (Branch `claude/video-restpunkte`)** - Ton in der Vorschau (nur aus dem `ttsCache`, kein neuer Synthese-Aufruf), Ansage auf der Titelkarte, Quiz-Karte mit Denkpause. Offen bleiben nur noch `showSaveFilePicker()` (bewusst ausgelassen, siehe Konzept) und die höhere Bildauflösung (`videoUrl`, niedrigste Priorität, wegen möglicher Kollision mit den parallelen SchreibZauber-Bildsitzungen ausgelassen). Details am Ende von [`KONZEPT-Video.md` 4.7](KONZEPT-Video.md#47-stand-von-weg-b-was-gebaut-ist-und-was-dabei-entschieden-wurde) |
| ~~Weg A (`MediaRecorder`)~~ | — | **Für ganze Bücher ausgeschieden:** nimmt in Echtzeit auf, 8-10 Minuten mit sichtbarem Tab im Vordergrund. Höchstens noch Notnagel für Einzelseiten |
| ~~Weg C (ffmpeg.wasm)~~ | — | **Bewusst verworfen.** 25-30 MB Zusatz-Download und auf GitHub Pages nur mit Service-Worker-Trick. Nicht neu aufrollen |

**✅ Entschieden (Sept. 2026): beides, Schwerpunkt pro Buch.** Das ganze Buch als ein Film
ist der Hauptfall; pro Seite fällt fast gratis ab, weil der Renderer ohnehin einen
**Seitenbereich** bekommt (pro Seite = Bereich `[i, i]`).

Daraus folgen zwei Dinge:
- **Weg A scheidet für ganze Bücher aus** (Echtzeit-Aufnahme). Zielarchitektur ist Weg B.
- **Pro Seite bleibt die Einheit zum Verschicken** - ein Buch-Film hat 120-240 MB und passt
  durch keinen E-Mail-Anhang. Die beiden Varianten haben verschiedene Zwecke.

**✅ Kino-Modus (Sept. 2026 erledigt):** Ken-Burns-Zoom + Kreuzblende sind umgesetzt, siehe
Nachtrag in [`docs/KONZEPT-Video.md`](KONZEPT-Video.md#3-video-in-drei-ausbaustufen).

**✅ Bereichs-Renderer + Export (17./18.09.2026 erledigt):** Der Renderer bekommt von
Anfang an einen Seitenbereich; eine Einzelseite ist der Bereich `[i, i]` und läuft durch
denselben Code („🎬 Film" in der Buch-Ansicht = ganzes Buch, „🎬 Film-Vorschau dieser
Seite" im Reader). In der Vorschau sitzt der Knopf „🎞️ Als Videodatei speichern", der
genau diesen Bereich und das dort gewählte Format kodiert.
**Damit ist der Video-Bereich bis auf die Restpunkte oben durch.** Neu dabei:
`book.origin` (`'scan' | 'authored'`) - die Videodatei gibt es nur bei selbst
geschriebenen Büchern, alles ohne Feld gilt als `scan`.

---

## 🪄 Bereich: Eigene Werke erstellen

Details: [`docs/KONZEPT-SchreibZauber.md`](KONZEPT-SchreibZauber.md), [`docs/KONZEPT-Bildquellen.md`](KONZEPT-Bildquellen.md), [`docs/KONZEPT-Comic.md`](KONZEPT-Comic.md)

Der größte Brocken im Projekt - dafür in Stufen geschnitten, die **einzeln lieferbar** sind.

| Punkt | Aufwand | Anmerkung |
|---|---|---|
| **Comic: zweiter Testlauf** | **S** | Ein Testbild hat zwei Prompt-Probleme aufgedeckt; der korrigierte Wortlaut ist noch nicht erprobt. Steht vor allem Weiteren |
| ~~**SchreibZauber Stufe 1 - Fundament**~~ | **L** | ✅ **erledigt** - Datenmodell, **DB v4**, Werkstatt-Übersicht, Idee/Bauplan/Geschichte, Platzhalter-Bilder, Export „ins Regal". `js/studio/*` ist seither in `js/main.js`/`sw.js` verdrahtet |
| ~~**SchreibZauber Stufe 2 - Bilder**~~ | **L** | ✅ **erledigt** - Stilkarte, Figuren-Bibel (inkl. KI-Vorschlag), Storyboard/Daumenkino (inkl. KI-Bildideen, verschieben/zusammenfassen/löschen), Bildgenerierung pro Doppelseite, Kostenzähler. Läuft weiterhin komplett über die kostenlose Platzhalter-Quelle - die echte Gemini-Bildgenerierung ist gebaut (`imageSource.js`, Quelle `gemini`), aber bewusst hinter einer expliziten Bestätigung in den Einstellungen (`app.settingsConfig.toggleStudioImageGen`), bis die Zahlungsmethode-Frage aus `KONZEPT-SchreibZauber.md` TEIL G Punkt 1 beantwortet ist. Details: Abschnitt „Stand nach Stufe 2" im Konzept |
| **SchreibZauber Stufe 3 - Layout & Druck** | **M** | Textplatzierung, Silbenfarben, Doppelseiten-Druck. **Gleich druckfertige Exportformate mitdenken** (KDP-taugliche PDF/Auflösung/Bleed, Entscheidung 6) |
| ~~**SchreibZauber Stufe 4 - Arbeitsheft**~~ | **L** | ✅ **erledigt** - Lernziel/Progression/Aufgabenbaukasten als eigener Wizard-Zweig (`js/studio/worksheet.js`, `js/render/studioWorkbookWizard.js`), 5 von 9 Aufgabentypen umgesetzt (Lückentext/Ankreuzen/Rechnen/Zuordnen/Frei schreiben - alle ohne Bildbedarf), Differenzierung (⭐/⭐⭐/⭐⭐⭐, auf Abruf nachgeneriert), automatischer Lösungsteil am Heftende, Export „ins Regal" mit `bookType: 'workbook'`. Details/offene Rest-Typen: `docs/KONZEPT-SchreibZauber.md`, Abschnitt „Stand nach Stufe 4" |
| **SchreibZauber Stufe 5 - Comic** | **L** | Panel-Layouts, Sprechblasen-Overlay |
| **SchreibZauber Stufe 6 - Politur** | **M** | Zweite Einstiegsseite `schreiben.html` (Icon-Idee: magischer Stift), projektübergreifende Figuren, Vorlagen. ✅ entschieden: kommt, keine reine Tab-Lösung auf Dauer |
| **Comic-Generator-Werkzeug** | **L** | Bewusst **kein** App-Feature: eigenes Node-Werkzeug lokal beim Betreiber (`tools/comic-gen/`), weil Browser nur CORS-fähige Bild-Anbieter erreichen |

**✅ Bedingung erfüllt: Stufe 1 ist gebaut und in `main`.** Damit war die im Konzept
genannte Voraussetzung für die parallelen Werktyp-Pfade erfüllt - **Stufe 2 (Bilder) und
Stufe 4 (Arbeitsheft) sind beide fertig gebaut** und in diesem Integrationspass (Welle 5)
zusammengeführt. Andockpunkte für die nächste Ausbaustufe (Stufe 3 - Layout & Druck)
stehen in `docs/KONZEPT-SchreibZauber.md`, Abschnitte „Stand nach Stufe 1" und „Stand nach
Stufe 2" (`app.studio.projects[id]`-Schema, `imageSource.providers`, `guardrailsBlock()`,
`computeSpec()`/`trimToFormat()`, `projectTypes`). Einziger noch offener Punkt aus Stufe 2:
die Zahlungsmethode-Frage aus TEIL G, Punkt 1 - bis dahin bleibt die echte
Gemini-Bildgenerierung hinter der expliziten Bestätigung in den Einstellungen, die App
funktioniert vollständig mit der kostenlosen Platzhalter-Quelle. Stufe 4 war davon nicht
betroffen und ist bereits ohne Einschränkung nutzbar (keine Bildaufrufe nötig).

---

## 📝 Bereich: Übungshefte & Lernen

Details: [`docs/KONZEPT-Uebungshefte.md`](KONZEPT-Uebungshefte.md)

Der Heft-**Modus** (Blätter auslesen, erklären, kontrollieren) ist fertig. Der Schritt
davor - Blätter **erzeugen** (Heft-Generator) - ist seit v0.16.0-beta ebenfalls fertig,
bis auf die optionale eigene Druckansicht.

| Punkt | Aufwand | Anmerkung |
|---|---|---|
| **Kontroll-Funktion im Alltag beobachten** | **S** | Wie zuverlässig beurteilt Gemini die Fotos bearbeiteter Blätter? Bei zu vielen „unklar" wäre eine Foto-Hilfe (Rahmen, Helligkeitshinweis) der nächste Schritt |
| ~~**Heft-Generator: API-Aufruf + Prompt**~~ | **erledigt** | `app.api.generateWorksheets()` in `js/api.js` - ein Heft = **ein** Aufruf, nicht einer pro Blatt. Nur Aufgabenarten ohne Bildmaterial (zaehlen, ankreuzen, nachspuren, schreiben) |
| ~~**Heft-Generator: Auswahl-Ansicht**~~ | **erledigt** | `js/render/workbookGenerator.js` + `js/actions/workbookGenerator.js`, Router-Eintrag `workbookGenerator` in `js/nav.js` |
| ~~**Heft-Generator: Blätter auf Canvas zeichnen**~~ | **erledigt** | `drawWorksheetCanvas()` in `js/actions/workbookGenerator.js`, nach Vorlage von `renderTextAsImageCanvas()` in `epubImport.js` |
| ~~**Heft-Generator: Druckqualität**~~ | **erledigt** | `page.generatedSheet` (persona-unabhängig, wie `pdfSourceText`), genutzt von der bestehenden `app.actions.printBook()` - kein zweiter View nötig |
| **Heft-Generator: KI-Bildgenerierung für Ausmalbilder** | **L** | Eigenes größeres Thema, siehe `KONZEPT-Comic.md` + `KONZEPT-Bildquellen.md`. Braucht Abstimmung mit dem Nutzer |

**Wichtigste Einschränkung:** Ein auf Canvas gezeichnetes Textblatt ist für „Male die Tiere
an" nutzlos - da fehlen die Tiere. Zuerst also Aufgabentypen **ohne Bild** (Zählen,
Ankreuzen, Nachspuren, Schwungübungen). Ausmalbilder setzen die Bildgenerierung voraus.

---

## 📱 Bereich: App & Plattform

| Punkt | Aufwand | Anmerkung |
|---|---|---|
| ~~**Kinder-/Elternbereich (Profil-Rollen)**~~ | **M** | ✅ **erledigt (Sept. 2026)** - `profile.role: 'child' \| 'adult'` (Default `'child'`), gelesen über `app.utils.resolveProfileRole()`. `app.utils.isSettingsLockedForActiveProfile()` sperrt teure Einstellungen (TTS-Anbieter, API-Keys) für Kinderprofile in `js/profiles.js` |
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
| ~~4~~ | ~~Welcher Anbieter wird der Familien-Standard?~~ | **kein fester Standard** - bleibt wählbar, Default Gerätestimme. Speechify als 5. Anbieter eingebaut (günstiger als ElevenLabs, ebenfalls exakte Zeitstempel) |
| ~~5~~ | ~~SchreibZauber: eigener Tab oder eigene App?~~ | **beides, als Stufen** - Stufe 1-5 als Tab, Stufe 6 optional zweites Icon (Vorschlag: magischer Stift), gleiche Code-Basis |
| ~~6~~ | ~~Weitergabe erzeugter Hefte/Werke~~ | **ja, auf Veröffentlichung auslegen** (z.B. Amazon KDP) - verschärft Stufe 1 (Prompt-Leitplanken) und Stufe 3 (druckfertiger Export) von Anfang an |

**Aus der Diskussion entstanden und inzwischen erledigt:** Kinder-/Elternbereich
(Profil-Rollen) - siehe Bereich „App & Plattform" unten.

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
- **Stimmen-Speicher auf 300 MB erhöht** (`TTS_CACHE_MAX_BYTES` in `js/db.js`)
- **„Buch hörfertig machen"** - Knopf in der Buchansicht, legt alle Seiten vorab in den `ttsCache`
- **Mistral-Fallback fürs Buch-Quiz** (war der letzte Aufruf ohne Fallback)
- **Dark-Mode-Lücken** geschlossen, Einzelbuch-Reimport repariert
