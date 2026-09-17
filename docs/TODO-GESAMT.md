# ✅ Gesamt-To-Do (alle Zweige zusammengeführt)

**Stand: v0.12.0-beta, September 2026**

In dieser Version sind alle bis dahin getrennt entwickelten Entwicklungszweige in einem
Stand vereint. Jeder Zweig hatte seine eigene To-Do-Liste - diese Datei führt sie zusammen,
damit nicht mehr an fünf Stellen nachgeschaut werden muss.

> **Diese Datei ist die Übersicht, nicht der Detailplan.** Wo es ein ausgearbeitetes Konzept
> gibt, steht hier nur eine Zeile plus Verweis. Vor der Arbeit an einem Punkt immer erst das
> verlinkte Dokument lesen - dort stehen Begründungen und bereits verworfene Wege.

## Wo was steht

| Datei | Inhalt |
|---|---|
| `docs/TODO-GESAMT.md` (hier) | Übersicht über **alle** offenen Punkte |
| `docs/ROADMAP.md` | Nächste größere Schritte rund um Vorlesen/Stimmen, inkl. Kostenübersicht |
| `docs/konzept-video-und-multiformat.md` | Sprach-API, Video/MP4, Hörbuch, Comic - das große Konzeptpapier |
| `docs/KONZEPT-SchreibZauber.md` | Eigener Schreib-/Generierungs-Bereich für selbst erstellte Werke |
| `docs/KONZEPT-Bildquellen.md` | Woher Bilder für selbst erstellte Werke kommen |
| `docs/uebungshefte-konzept.md` | Hintergrund zum Heft-Modus (umgesetzt) |
| `docs/todo-heft-generator.md` | Übungsblätter von der KI **erstellen** lassen (offen) |
| `COMIC-ADAPTION-TODO.md` | Comic-Adaption: Diskussionsstand, Kosten, lokale GPU-Option |

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

---

## 2. Offene Entscheidungen (blockieren jeweils den nächsten Schritt)

Diese Punkte sind **nicht** technisch offen, sondern brauchen eine Ansage des Betreibers:

1. **Video-Export: ein Video pro Seite oder eins pro Buch?** (Details: `docs/ROADMAP.md`)
2. **ElevenLabs v3 (bezahlt) für Emotions-Tags?** - ohne Bezahltarif keine Audio-Tags
3. **Reicht der Stimmen-Speicher mit 100 MB?** - mehr Platz für Stimmen heißt weniger für Bücher
4. **Welcher Anbieter wird der Familien-Standard?** - davon hängt ab, ob sich Arbeit an exakten
   Wort-Zeitstempeln (nur ElevenLabs) oder an Emotions-Tags (Gemini) lohnt
5. **SchreibZauber: eigener Tab oder eigene App?** (Details: `docs/KONZEPT-SchreibZauber.md`)
6. **Weitergabe erzeugter Hefte an andere Familien** - erst Quellen und Lizenzen klären

---

## 3. Große Brocken (je eigenes Konzept vorhanden)

| Vorhaben | Stand | Konzept |
|---|---|---|
| 🎬 **Video-Export** (Seite + KI-Stimme als Videodatei) | Vorarbeit erledigt, nur das Zusammensetzen fehlt | `docs/ROADMAP.md`, `docs/konzept-video-und-multiformat.md` |
| 🪄 **SchreibZauber** (eigene Bilderbücher/Comics/Arbeitshefte schreiben) | Konzept fertig, Platzhalter-Fundament liegt in `js/studio/` | `docs/KONZEPT-SchreibZauber.md` |
| 📝 **Heft-Generator** (Übungsblätter erstellen lassen) | Entwurf fertig, nicht begonnen | `docs/todo-heft-generator.md` |
| 🎨 **KI-generierte Illustrationen** (Comic-Stil, für Text-only-EPUB-Kapitel) | Konzeptphase, Testbild gemacht | `COMIC-ADAPTION-TODO.md` |
| 🎭 **Emotionen/Sprech-Anweisungen mitten im Satz** (Audio-Tags) | Konzept steht, Persona-Sprechstil wirkt bereits | `docs/ROADMAP.md` |
| 📱 **Native Android-App via Capacitor** | Idee, verpackt den Code weitgehend unverändert | `docs/ROADMAP.md` |

**Beim Video-Export ist das Wichtigste schon da:** `app.ttsNeural.renderPageSegments()` liefert
Bild, Ton, Länge und Wort-Zeitpunkte. Offen ist nur noch das Zusammensetzen im Browser
(Canvas + `MediaRecorder`) - und Entscheidung 1 oben.

**`js/studio/*` ist bewusst noch nicht in `js/main.js` eingebunden** und steht deshalb auch
nicht in der `APP_SHELL` von `sw.js`. Beides gehört zum ersten Schritt, sobald SchreibZauber
tatsächlich verdrahtet wird.

---

## 4. Kleinere Punkte

- **Mitmachmodus mit KI-Stimme** - läuft heute immer über die Gerätestimme. Über Pausen-Tags
  lösbar, ohne Mehrkosten (siehe `docs/ROADMAP.md`, Punkt 3)
- **Lange Texte stückeln** - über `MAX_NEURAL_CHARS = 4000` (EPUB-Kapitel) fällt es auf die
  Gerätestimme zurück
- **Vorlese-Aufbereitung des erkannten Texts** - Trennstriche am Zeilenende zusammenziehen,
  Abkürzungen ausschreiben; nur fürs Ohr, Anzeige bleibt unangetastet. Klein und risikoarm
- **Mehr Stimmen freischalten** - in `js/ttsProviders.js` ist nur eine Vorauswahl eingetragen
- **Stimme pro Profil** - jedes Kind eine eigene Vorlese-Stimme
- **„Buch hörfertig machen"** - alle Seiten vorab in den Stimmen-Speicher legen
- **Kosten-Anzeige** - lokal mitzählen, wie viele Zeichen im Monat an den Anbieter gingen
- **Kontroll-Funktion im Alltag beobachten** - wie zuverlässig beurteilt Gemini die Fotos
  bearbeiteter Blätter? Bei zu vielen „unklar" wäre eine Foto-Hilfe (Rahmen, Helligkeitshinweis)
  der nächste Schritt

---

## 5. Diagnose / noch nicht reproduziert

- Scroll-Verhalten am Bildschirmrand (Desktop)
- Zoom/Unschärfe im Fenstermodus

Beides ist bisher nicht nachstellbar - braucht vermutlich einen Screenshot vom Nutzer.

---

## 6. Bewusst zurückgestellt (bräuchte einen eigenen Server)

- API-Keys über ein Backend absichern
- Automatische Cloud-Synchronisierung (statt manuellem Export/Import)
- Echte Multi-Geräte-Accounts mit Login

Seit den KI-Stimmen liegen **mehr** Keys im Browser als vorher - die Abwägung bleibt aber
dieselbe: Ein Server würde die gesamte Architektur des Projekts umdrehen.
