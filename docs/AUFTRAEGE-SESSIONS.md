# 📋 Aufträge für einzelne Claude-Code-Sitzungen

**Stand: v0.13.0-beta, September 2026**

Diese Datei schneidet die offenen Punkte aus [`docs/TODO-GESAMT.md`](TODO-GESAMT.md) in
**in sich abgeschlossene Aufträge**, die jeweils an eine eigene Claude-Code-Sitzung
gegeben werden können. Jeder Auftrag ist ein fertiger Text zum Kopieren - er nennt das
Ziel, die betroffenen Dateien, die Grenzen ("nicht tun") und den Branch.

> **Die Aufträge sind bewusst so geschnitten, dass parallel laufende Sitzungen möglichst
> nicht in dieselbe Datei schreiben.** Wo das nicht geht, sind mehrere To-do-Punkte in
> einem Auftrag zusammengefasst (z.B. alles, was `js/ttsProviders.js` anfasst).

Die inhaltliche Quelle bleibt `docs/TODO-GESAMT.md` und die verlinkten Konzeptpapiere -
diese Datei ist nur die Aufteilung in Arbeitspakete.

---

## Stand (Oktober 2026)

**Welle 0 und Welle 1 sind in `main`.** Aktuelle Version: `v0.14.0-beta`.

| # | Auftrag | Stand |
|---|---|---|
| 1 | Vorlese-Aufbereitung | ✅ in `main` |
| 2 | Stimmen-Speicher + „Buch hörfertig machen" | ✅ in `main` |
| 3 | TTS-Anbieter-Paket | ✅ in `main` |
| 4 | Stimme pro Profil + Kinder-/Elternbereich | ✅ in `main` |
| 5 | Kosten-Anzeige | ✅ in `main` |
| 6 | Kino-Modus vollenden | ✅ in `main` |
| 7 | Hörbuch-Export | ✅ in `main` |
| 8 | Emotionen / Audio-Tags | ✅ in `main` |
| 12 | SchreibZauber Stufe 1 | ✅ in `main` (DB-Version 3 → 4) |
| 13 | Integrations-Pass | ✅ gelaufen, Vorlage für jedes Wellen-Ende |
| 9, 10, 11, 14, 15 | Welle 2 und später | ⬜ offen |

**Auftrag 4 lag doppelt vor.** Zwei Sitzungen hatten denselben Auftrag bearbeitet
(`-hgcao9` und `-miityv`). Gemergt wurde `-hgcao9`: gleicher Funktionsumfang, aber mit der
zentralen Hilfsfunktion `isSettingsLockedForActiveProfile()` und Sicherheitsnetzen in den
Aktionen selbst statt nur ausgegrauter Bedienelemente. Zwei Details aus `-miityv` wurden
nachgezogen (Rückfall für `__all__`, Erklärung direkt an den API-Key-Feldern).

### Beim Zusammenführen gefundene Fehler

Alle drei hätte keine der beteiligten Sitzungen allein finden können - sie entstehen erst
im vereinten Stand:

1. **Die Abkürzungs-Ersetzung beim Vorlesen hat nie gegriffen.** Alle acht Muster in
   `_SPEECH_ABBREVIATIONS` endeten auf `\.\b`; hinter dem Punkt einer Abkürzung steht aber
   ein Leerzeichen, also gibt es dort nie eine Wortgrenze. „z.B." wurde weiterhin
   buchstabiert. Jetzt `(?=\s|$)` statt `\b`.
2. **„Buch hörfertig machen" bereitete die falsche Text-Fassung vor.** Seit den Audio-Tags
   geht bei Anbietern mit `supportsTags` die getaggte Fassung an die Synthese, und der
   Cache-Schlüssel hängt am Text. Vorbereitet wurde die eine Fassung, gebraucht die andere -
   das Buch war trotz „hörfertig" nicht fertig und jede Seite kostete doppelt.
3. **Der getaggte Text lief als einziger ohne Vorlese-Aufbereitung in die Synthese.**
   Ausgerechnet bei den Anbietern mit Emotionen wären Trennstriche und Abkürzungen
   ungeglättet geblieben.

Dazu eine Reihenfolge-Falle, die beim Auflösen eines Konflikts auffiel: In `tts._prepare()`
muss `prepareTextForSpeech()` **vor** `stripSpeechTags()` laufen. Umgekehrt hätte das
Zusammenziehen der Leerräume den Zeilenumbruch schon entfernt, und aus „Kinder-\nwagen"
wäre „Kinder- wagen" geworden statt „Kinderwagen".

---

## Der Merge-Rhythmus

**Die Welle ist die Einheit fürs Starten, nicht fürs Mergen.** Das Verwechseln der beiden
hat Welle 0 teuer gemacht: fünf Branches lagen nebeneinander, drei haben unabhängig
voneinander in `js/render/settings.js` geschrieben, und keine Sitzung hat den
zusammengeführten Stand je gesehen - genau dafür musste Auftrag 13 nachträglich erfunden
werden.

Der Gewinn beim frühen Mergen liegt nicht bei der laufenden Welle - deren Sitzungen sind
ohnehin schon von der alten `main` abgezweigt. Er liegt bei der **nächsten**: die startet
dann von einer `main`, die alles Vorherige enthält.

Die fünf Regeln:

1. **Branch fertig → geprüft → sofort nach `main`.** In der Reihenfolge „kleinste
   Berührungsfläche zuerst" (siehe unten), aber **ohne auf Geschwister zu warten**.
2. **Am Ende jeder Welle ein Integrations-Pass** über den zusammengeführten Stand:
   Sanity-Checks, die Oberfläche einmal als Ganzes ansehen, Version hochzählen. Auftrag 13
   ist dafür die Vorlage - **kein einmaliger Job, sondern das Wellen-Ende-Ritual**. Beim
   nächsten Mal derselbe Text, nur die Liste der gemergten Branches austauschen.
3. **Die nächste Welle erst starten, wenn `main` alles aus der vorherigen enthält.** Sonst
   bauen die Sitzungen auf unterschiedlichen Grundlagen auf - exakt die Warnung aus TEIL G
   von `KONZEPT-SchreibZauber.md`.
4. **`main` muss jederzeit auslieferbar bleiben.** Das Deployment ist manuelles Hochladen
   des Ordnerinhalts - ein halb gemergter Stand wird sonst versehentlich zu GitHub Pages.
   Der Moment zum Hochladen ist das Wellen-Ende nach dem Integrations-Pass, nicht mittendrin.
5. **Langläufer holen sich `main` regelmäßig herein**, nicht umgekehrt: im Feature-Branch
   `git merge origin/main`, etwa einmal pro gemergtem Geschwister-Branch. Betrifft vor
   allem Auftrag 12 (SchreibZauber Stufe 1, Aufwand **L**) - sonst wird der Merge nach drei
   Wochen zum Abenteuer.

**Warum das gerade für Welle 1 zählt:** Auftrag 12 läuft Wochen, 4 und 8 sind in Tagen
fertig. Auf die ganze Welle zu warten hieße, zwei fertige Funktionen wochenlang ungenutzt
liegen zu lassen - und alles danach verschiebt sich mit.

### Merge-Reihenfolge innerhalb einer Welle

Wenn doch mehrere Branches gleichzeitig fertig sind: von der kleinsten zur größten
Berührungsfläche. Zuerst, was nur eigene Dateien anfasst; zuletzt, was in gemeinsame
Dateien wie `js/render/settings.js`, `js/state.js` oder `js/settingsConfig.js` schreibt.
In Welle 0 war das `tts-textaufbereitung` → `tts-cache-und-hoerfertig` →
`tts-anbieter-paket` → `kino-modus-vollenden` → `kosten-anzeige`.

Drei Dinge tauchen bei **jedem** Merge auf:

- **`css/tailwind.css`** ist eine Bauartefakt-Datei. Konflikte dort **nicht von Hand lösen** -
  irgendeine Seite nehmen und nach dem letzten Merge einmal neu bauen:
  `npx @tailwindcss/cli -i ./css/tailwind-input.css -o ./css/tailwind.css --minify`
- **`sw.js` (`CACHE_NAME`)** - immer die höhere Nummer nehmen, am Ende einmal auf einen
  Wert über allen gemergten setzen. Und prüfen, dass **alle** neuen Dateien in `APP_SHELL`
  stehen *und* in `js/main.js` importiert werden; ohne Import lädt eine Datei nie.
- **`docs/TODO-GESAMT.md`** - jede Sitzung hakt ihren Punkt ab. Konflikte hier sind harmlos,
  aber die Datei sollte am Wellen-Ende einmal ganz gelesen werden.

---

## Die neue Reihenfolge

| Welle | Aufträge | Parallel? | Bedingung |
|---|---|---|---|
| ~~**0**~~ | ~~Branches 1,2,3,5,6,7 mergen, dann **13** (Integrations-Pass)~~ | - | ✅ **erledigt**, alles in `main` |
| ~~**1**~~ | ~~**4** (Profil-Rollen) · **8** (Audio-Tags) · **12** (SchreibZauber Stufe 1)~~ | - | ✅ **erledigt**, alles in `main` |
| **2 - jetzt** | **9** (Texte stückeln + Mitmachmodus) · **10** (Heft-Generator API) | ✅ zwei gleichzeitig | **8** ist in `main`, beide startbar |
| **3** | **11** (Heft-Generator Ansicht) · **14** (Video-Renderer, Einzelseite) | ✅ zwei gleichzeitig | 11 nach 10 · 14 ist durch Welle 0 bereits frei |
| **4** | **15** (Video-Export fürs ganze Buch) | allein | nach **14** |
| **5** | SchreibZauber Stufe 2+3 (Bilderbuch) ∥ Stufe 4 (Arbeitsheft) | ✅ zwei gleichzeitig | **12** ist gemerged - startbar |

**Warum 12 (SchreibZauber Stufe 1) schon in Welle 1 startet:** Es ist der längste Weg im
ganzen Projekt und blockiert vier weitere Stufen. Es fasst fast nur neue Dateien an
(`js/studio/*`, neue Ansicht) plus `js/db.js`, `js/nav.js`, `js/main.js` - und kollidiert
damit kaum mit 4 oder 8. „Allein laufen lassen" heißt: **keine zweite SchreibZauber-Sitzung
daneben**, nicht „gar nichts sonst".

**Warum 8 (Audio-Tags) vor 10 (Heft-Generator) kommt:** Beide ändern `js/api.js`. Auftrag 8
fasst dabei den zentralen Analyse-Prompt an, 10 hängt nur eine neue Funktion daneben - in
dieser Reihenfolge ist der spätere Merge die triviale Seite. Außerdem hängt 9 an 8, und
das ist der längere der beiden Stränge.

**Wo die Wellen nicht eingehalten werden müssen:** Wenn Zeit für nur eine Sitzung da ist,
ist **4 (Profil-Rollen)** der beste Einzelgriff - er ist klein, betrifft den Alltag mit den
Kindern direkt und ist Voraussetzung für SchreibZauber Stufe 6.

## Übersicht aller Aufträge

| # | Auftrag | Bereich | Aufwand | Branch |
|---|---|---|---|---|
| 1 | Vorlese-Aufbereitung des erkannten Texts | Vorlesen | **S** | ✅ `claude/tts-textaufbereitung` |
| 2 | Stimmen-Speicher 300 MB + „Buch hörfertig machen" | Vorlesen | **S** | ✅ `claude/tts-cache-und-hoerfertig` |
| 3 | TTS-Anbieter-Paket (Speechify, mehr Stimmen, Tarif-Lock) | Vorlesen | **S** | ✅ `claude/tts-anbieter-paket` |
| 4 | Stimme pro Profil + Kinder-/Elternbereich | Plattform | **S+M** | ✅ in `main` |
| 5 | Kosten-Anzeige | Vorlesen | **S** | ✅ `claude/kosten-anzeige` |
| 6 | Kino-Modus vollenden (Ken-Burns + Kreuzblende) | Video | **S** | ✅ `claude/kino-modus-vollenden` |
| 7 | Hörbuch-Export | Video | **M** | ✅ in Welle 0 |
| 8 | Emotionen / Audio-Tags | Vorlesen | **M** | ✅ in `main` |
| 9 | Lange Texte stückeln + Mitmachmodus mit KI-Stimme | Vorlesen | **M** | `claude/tts-stueckeln-mitmachmodus` |
| 10 | Heft-Generator: API-Aufruf + Prompt | Übungshefte | **S** | `claude/heft-generator-api` |
| 11 | Heft-Generator: Auswahl-Ansicht + Canvas | Übungshefte | **M** | ✅ `claude/aufgabe-11-heft-generierung-sju4rb` |
| 12 | SchreibZauber Stufe 1 - Fundament | Eigene Werke | **L** | ✅ in `main` |
| 13 | Integrations-Pass nach dem Merge + v0.13.0-beta | Plattform | **S** | ✅ in Welle 0 gelaufen - **Vorlage für jedes Wellen-Ende** |
| 14 | Video-Export Weg B, Teil 1: Renderer-Kern | Video | **M** | `claude/video-renderer-kern` |
| 15 | Video-Export Weg B, Teil 2: ganzes Buch + Regie | Video | **M** | `claude/video-buch-export` |

---

## 1 · Vorlese-Aufbereitung des erkannten Texts (S - bester Einstieg)

```
Arbeite im Repo Lesezauber (LeseZauber Pro). Lies zuerst CLAUDE.md im Root und
docs/ROADMAP.md, Abschnitt zur Vorlese-Aufbereitung.

Aufgabe: Eine neue Aufbereitungsfunktion für den Text, der an die Sprachausgabe geht.
Ziel ist, dass jede Stimme (Gerätestimme UND KI-Stimme) sauberer klingt - die Anzeige
im Reader bleibt dabei unverändert.

Zu tun:
- Neue Funktion neben app.utils.stripEmojiForSpeech() in js/utils.js, z.B.
  app.utils.prepareTextForSpeech(text). Sie soll mindestens:
  - Trennstrich + Zeilenumbruch zusammenziehen ("Kinder-\nwagen" -> "Kinderwagen"),
    aber echte Bindestrich-Komposita ("Ost-West") NICHT zerstören
  - harte Zeilenumbrüche innerhalb eines Satzes zu Leerzeichen machen
  - gängige Abkürzungen ausschreiben (z.B. -> "zum Beispiel", usw., ca., Nr., u.a., d.h.)
  - mehrfache Leerzeichen/Leerzeilen normalisieren
- Die Funktion an den Stellen einhängen, an denen Text zur Sprachausgabe geht:
  js/tts.js und js/ttsNeural.js. Wichtig: die Wort-Hervorhebung darf nicht verrutschen -
  prüfe, wie buildSpeechHighlightHtml() und _wordStartTimes() den Text erwarten, und
  wende die Aufbereitung an derselben Stelle wie stripEmojiForSpeech() an.
- Deutsche Kommentare, jede geänderte Stelle mit // NEU: bzw. // FIX: und WARUM.

Nicht tun: Anzeigetext im Reader verändern, Datenmodell anfassen, gespeicherte
Seitentexte umschreiben.

Abschluss: die vier Sanity-Checks aus CLAUDE.md laufen lassen,
sw.js CACHE_NAME hochzählen, committen und auf den Branch
claude/tts-textaufbereitung pushen (git push -u origin claude/tts-textaufbereitung).
Keinen Pull Request anlegen.
```

---

## 2 · Stimmen-Speicher 300 MB + „Buch hörfertig machen" (S)

```
Arbeite im Repo Lesezauber (LeseZauber Pro). Lies zuerst CLAUDE.md im Root, dann
js/db.js und js/ttsNeural.js.

Zwei zusammengehörige Aufgaben rund um den Stimmen-Zwischenspeicher (ttsCache):

(a) TTS_CACHE_MAX_BYTES in js/db.js von 100 MB auf 300 MB erhöhen. Die
    Eviction-Logik existiert bereits und darf unverändert bleiben. Prüfe, ob die
    Zahl irgendwo in der Oberfläche oder in den Einstellungen als Text steht und
    dort mitgezogen werden muss.

(b) Neuer Knopf "Buch hörfertig machen": legt alle Seiten des aktuell geöffneten
    Buchs vorab in den ttsCache, damit danach ohne Wartezeit und offline vorgelesen
    werden kann.
    - Neue Datei js/actions/prepareAudio.js, in js/main.js importieren
    - Nur sichtbar/aktiv, wenn app.settings.ttsProvider !== 'device' (mit der
      Gerätestimme gibt es nichts vorzubereiten)
    - Seiten nacheinander, nicht parallel; Fortschrittsanzeige per app.ui.toast()
      oder kleinem Balken; abbrechbar
    - Seiten mit excluded=true überspringen; bereits gecachte Seiten NICHT erneut
      synthetisieren (jede Aufnahme kostet Kontingent - das ist eine harte Regel
      des Projekts)
    - Fehler nie stumm verschlucken: console.error + Toast, und auf die nächste
      Seite weitergehen statt abzubrechen
    - Nur die aktuell gewählte Persona vorbereiten, nicht alle Personas

Nicht tun: zusätzliche Synthese-Aufrufe an anderer Stelle einbauen, den
Abspielweg in js/tts.js umbauen.

Abschluss: Tailwind neu bauen, falls du neue Klassen benutzt hast
(npx @tailwindcss/cli -i ./css/tailwind-input.css -o ./css/tailwind.css --minify),
die vier Sanity-Checks aus CLAUDE.md laufen lassen, sw.js CACHE_NAME hochzählen
und neue Dateien in APP_SHELL eintragen. Committen und auf den Branch
claude/tts-cache-und-hoerfertig pushen. Keinen Pull Request anlegen.
```

---

## 3 · TTS-Anbieter-Paket: Speechify, mehr Stimmen, Tarif-Lock (S)

```
Arbeite im Repo Lesezauber (LeseZauber Pro). Lies zuerst CLAUDE.md im Root, dann
js/ttsProviders.js komplett und docs/ROADMAP.md.

Drei Punkte, die alle dieselbe Datei betreffen und deshalb zusammen erledigt werden:

(a) Speechify als 5. Anbieter ergänzen. Begründung laut Entscheidung:
    ~6-10 $/Mio. Zeichen statt ElevenLabs' ~100 $/Mio., ebenfalls exakte
    Wort-Zeitstempel, Deutsch unterstützt. Neuer Eintrag in app.ttsProviders.list
    nach dem Muster der bestehenden Anbieter (id, label, Stimmenliste, Key-Feld,
    Synthese-Aufruf, Wort-Zeitstempel). Recherchiere die aktuelle API-Doku, bevor
    du den Aufruf schreibst - rate die Endpunkte nicht.

(b) Mehr Stimmen freischalten: in der Datei ist bisher nur eine Vorauswahl
    eingetragen (Gemini hat ~30, OpenAI 11+). Ergänze die fehlenden Stimmen mit
    kurzen, deutschen Beschreibungs-Labels im Stil der vorhandenen Einträge.
    Die Reihenfolge soll die bisher bewährten Stimmen oben lassen.

(c) Tarif-Lock: neues Feld costTier je Stimme/Modell (z.B. 'free' | 'cheap' |
    'expensive'). Beim Wechsel auf eine teurere Stufe erscheint ein
    Bestätigungsdialog mit Hinweis auf die ungefähren Kosten. Das schützt vor
    Versehen, nicht vor Absicht - kein Passwort, keine Sperre. Der eigentliche
    Betrag bleibt beim Anbieter gedeckelt, nicht in der App.

Die Oberfläche der Einstellungen baut sich aus app.ttsProviders.list automatisch
auf - prüfe, ob das nach deinen Änderungen noch stimmt, und passe die Stelle an,
die die Liste rendert, falls costTier dort angezeigt werden soll.

Nicht tun: den Standard-Anbieter ändern (bleibt 'device'), die Fallback-Kette auf
die Gerätestimme anfassen.

Abschluss: Tailwind neu bauen, die vier Sanity-Checks aus CLAUDE.md laufen lassen,
sw.js CACHE_NAME hochzählen. Committen und auf den Branch
claude/tts-anbieter-paket pushen. Keinen Pull Request anlegen.
```

---

## 4 · Stimme pro Profil + Kinder-/Elternbereich (S + M)

```
Arbeite im Repo Lesezauber (LeseZauber Pro). Lies zuerst CLAUDE.md im Root, dann
js/profiles.js, js/state.js und den Einstellungs-Teil von index.html.

Zwei Punkte, die beide am Profil-Datensatz hängen und deshalb zusammengehören:

(a) Stimme pro Profil statt global. app.settings.ttsVoices (und ggf.
    ttsProvider) werden heute global in localStorage gehalten. Sie sollen pro
    Profil gespeichert werden, mit sauberer Migration: bestehende globale
    Einstellung wird beim ersten Start als Wert für alle vorhandenen Profile
    übernommen, damit niemand seine Auswahl verliert. Den Sonderfilter '__all__'
    aus js/profiles.js dabei mitdenken - er ist kein echtes Profil.

(b) Profil-Rollen (Kinder-/Elternbereich). Profile speichern heute nur {id, name}.
    Neues Feld role: 'child' | 'adult', Default 'child' für bestehende Profile
    (fehlendes Feld muss wie 'child' behandelt werden - lies es über eine
    Hilfsfunktion, nie direkt). Für Kinderprofile sind teure bzw. heikle
    Einstellungen gesperrt: TTS-Anbieter-Wechsel, API-Key-Felder,
    Stimmen-Speicher-Verwaltung. Die Sperre ist ein Kinderschutz, keine
    Sicherheitsfunktion - sichtbar ausgegraut mit kurzer Erklärung reicht,
    kein Passwort.

Nicht tun: ein Login/Konto-System bauen (das Projekt ist bewusst serverlos),
API-Keys verschlüsseln (bekannte, akzeptierte Grenze laut CLAUDE.md).

Abschluss: Tailwind neu bauen, die vier Sanity-Checks aus CLAUDE.md laufen lassen,
sw.js CACHE_NAME hochzählen. Committen und auf den Branch
claude/profil-rollen-und-stimme pushen. Keinen Pull Request anlegen.
```

---

## 5 · Kosten-Anzeige (S)

```
Arbeite im Repo Lesezauber (LeseZauber Pro). Lies zuerst CLAUDE.md im Root, dann
js/ttsNeural.js, js/ttsProviders.js und js/api.js.

Aufgabe: Eine rein lokale Kosten-/Verbrauchsanzeige. Sie soll mitzählen, wie viele
Zeichen im laufenden Monat tatsächlich an einen TTS-Anbieter gegangen sind, und
daraus einen geschätzten Betrag anzeigen.

Zu tun:
- Neue Datei js/costMeter.js (oder js/actions/costMeter.js), in js/main.js
  importieren. Zählerstand in localStorage, pro Anbieter und pro Kalendermonat.
- Nur echte Synthese zählen - Treffer aus dem ttsCache kosten nichts und dürfen
  NICHT mitgezählt werden. Such die eine Stelle in js/ttsNeural.js, an der nach
  einem Cache-Fehlschlag wirklich synthetisiert wird, und häng den Zähler dort ein.
- Preis pro Mio. Zeichen je Anbieter als Konstante mit Quellenkommentar und
  Datum; die Anzeige muss klar als Schätzung gekennzeichnet sein
  ("ungefähr", "ohne Gewähr", verbindlich ist die Abrechnung des Anbieters).
- Anzeige in den Einstellungen unter dem Stimmen-Bereich, plus ein Knopf
  "Zähler zurücksetzen".
- Optional, wenn es ohne Zusatzaufwand geht: auch die Gemini-Textaufrufe aus
  js/api.js mitzählen (getrennt ausweisen).

Nicht tun: irgendeine Abrechnungs-API des Anbieters abfragen, den Zähler als
Sperre benutzen (das macht der Tarif-Lock in einem anderen Auftrag).

Abschluss: Tailwind neu bauen, die vier Sanity-Checks aus CLAUDE.md laufen lassen,
sw.js CACHE_NAME hochzählen, neue Datei in APP_SHELL eintragen. Committen und auf
den Branch claude/kosten-anzeige pushen. Keinen Pull Request anlegen.
```

---

## 6 · Kino-Modus vollenden: Ken-Burns + Kreuzblende (S)

```
Arbeite im Repo Lesezauber (LeseZauber Pro). Lies zuerst CLAUDE.md im Root, dann
docs/KONZEPT-Video.md Abschnitt 3 ("Kino-Modus", Stufe 1) und js/actions/focusMode.js
sowie den Vollbild-Block in index.html.

Wichtig vorab: Der Textteil des Kino-Modus (Text mit Wort-Hervorhebung im Vollbild)
ist seit v0.12.0 ERLEDIGT. Das Konzeptpapier führt ihn an einer Stelle noch als offen -
das stimmt nicht mehr. Offen sind nur noch zwei optische Punkte:

(a) Ken-Burns-Effekt: langsamer Zoom/Schwenk über das Seitenbild im
    Vollbild-Vorlese-Modus. Reines CSS (transform/scale + translate, lange
    Dauer, ease). Richtung leicht variieren, damit es über mehrere Seiten
    nicht mechanisch wirkt.

(b) Kreuzblende beim Seitenwechsel statt hartem Schnitt.

Randbedingungen:
- prefers-reduced-motion respektieren: dann keine Bewegung, harter Schnitt.
- Die Wort-Hervorhebung darf nicht ruckeln oder verrutschen - sie läuft über
  requestAnimationFrame bzw. das boundary-Event; die Animationen dürfen ihr
  nicht ins Gehege kommen.
- Ein Schalter in den Einstellungen zum Abschalten wäre sinnvoll, wenn es ohne
  großen Aufwand geht.
- Nur der Vollbild-Modus, der normale Reader bleibt unverändert.

Nicht tun: Video-Export anfangen (eigener Auftrag), MediaRecorder oder
ffmpeg.wasm einbauen - beide Wege sind laut Konzept bewusst verworfen.

Abschluss: Tailwind neu bauen (npx @tailwindcss/cli -i ./css/tailwind-input.css
-o ./css/tailwind.css --minify), die vier Sanity-Checks aus CLAUDE.md laufen
lassen, sw.js CACHE_NAME hochzählen. Außerdem in docs/KONZEPT-Video.md den
Nachtrag ergänzen, dass Stufe 1 damit vollständig ist. Committen und auf den
Branch claude/kino-modus-vollenden pushen. Keinen Pull Request anlegen.
```

---

## 7 · Hörbuch-Export (M) - *nach Nr. 6*

```
Arbeite im Repo Lesezauber (LeseZauber Pro). Lies zuerst CLAUDE.md im Root, dann
docs/KONZEPT-Video.md - besonders Abschnitt 2 (Audio-Asset-Layer, inkl. Nachtrag)
und Abschnitt 8, Schritt 3.

Aufgabe: Hörbuch-Export. Laut Konzept "fast geschenkt", weil die Bausteine schon
stehen: app.ttsNeural.renderAudio() und renderPageSegments() liefern Blob, MIME,
Dauer und Wort-Zeitpunkte.

Zu tun:
- Neue Datei js/actions/audiobookExport.js, in js/main.js importieren.
- Ein ganzes Buch als eine Audiodatei ausgeben: Seiten der Reihe nach über
  renderPageSegments() holen, in der dokumentierten Reihenfolge
  (Text -> Bildbeschreibung -> Quiz), wobei der Nutzer Bildbeschreibung und Quiz
  ab- bzw. zuschalten kann.
- Zusammenfügen der Segmente im Browser ohne neue schwere Abhängigkeit prüfen:
  bei gleichem Codec reicht ggf. ein simples Blob-Concat, sonst über
  AudioContext/OfflineAudioContext zu WAV rendern. Entscheide begründet und
  schreib die Begründung als Kommentar an die Stelle.
- Fortschrittsanzeige mit Abbruchmöglichkeit, Ergebnis per Download-Link.
- Seiten mit excluded=true überspringen.
- Mit ttsProvider === 'device' ist das unmöglich (SpeechSynthesis gibt keine
  Datei heraus) - dann eine verständliche Meldung zeigen, nicht abstürzen.
- Bereits gecachte Aufnahmen wiederverwenden, nie doppelt synthetisieren.

Nicht tun: Video/MP4 anfangen (eigener Auftrag), den Abspielweg umbauen.

Abschluss: die vier Sanity-Checks aus CLAUDE.md, Tailwind neu bauen, sw.js
CACHE_NAME hochzählen und die neue Datei in APP_SHELL eintragen. In
docs/KONZEPT-Video.md Abschnitt 8 den Stand nachziehen. Committen und auf den
Branch claude/hoerbuch-export pushen. Keinen Pull Request anlegen.
```

---

## 8 · Emotionen / Audio-Tags (M) - *nach dem Merge von Nr. 3*

```
Arbeite im Repo Lesezauber (LeseZauber Pro). Lies zuerst CLAUDE.md im Root, dann
docs/ROADMAP.md (Abschnitt Emotionen/Audio-Tags), js/api.js, js/utils.js und
js/ttsProviders.js.

Vorbedingung, damit du nichts doppelt baust: js/ttsProviders.js wurde gerade
überarbeitet (Speechify als 5. Anbieter, erweiterte Stimmenlisten, costTier je
Anbieter für den Tarif-Lock). Ein Feld supportsTags gibt es dort NOCH NICHT, und
ELEVEN_MODEL steht noch auf 'eleven_multilingual_v2'. Lies die Datei, bevor du
etwas ergänzt.

Der Weg ist bereits entschieden, nicht neu diskutieren:
- Ein zusätzliches Feld speechText wird IMMER gleich mitgeneriert, im selben
  KI-Aufruf - kein zweiter API-Call.
- Neues Flag supportsTags je Anbieter in js/ttsProviders.js, neben dem
  vorhandenen supportsStyle und costTier. Anbieter ohne Tag-Unterstützung
  bekommen den Text ohne Tags.
- Bei ElevenLabs ELEVEN_MODEL auf eleven_v3 umstellen - kostet seit GA
  (März 2026) nicht mehr als v2.

Zu tun:
- Analyse-Prompt in js/api.js um speechText erweitern (Vorlesefassung mit
  Sprech-Anweisungen/Emotions-Tags mitten im Satz).
- app.utils.buildPageVariant() in js/utils.js um das Feld erweitern - das ist die
  EINE Stelle für die Varianten-Umrechnung, nicht an beiden Aufrufstellen
  (scanner.js und backgroundPregen.js) doppeln.
- In js/tts.js / js/ttsNeural.js: speechText nutzen, wenn vorhanden UND der
  Anbieter supportsTags hat; sonst wie bisher den normalen Text. Alte Seiten
  ohne speechText müssen unverändert funktionieren - lies Varianten immer über
  app.utils.resolvePageVariant() / resolveAnyVariant().
- Anzeige im Reader bleibt der normale Text; Tags dürfen niemals sichtbar werden
  und niemals vorgelesen werden, wenn der Anbieter sie nicht versteht.
- Die Wort-Hervorhebung muss weiter passen: die Tags zählen nicht als Wörter.
  Prüfe _wordStartTimes() entsprechend. Beachte, dass dort inzwischen auch die
  neue Vorlese-Aufbereitung aus app.utils.prepareTextForSpeech() mitläuft -
  Tags dürfen von ihr nicht zerlegt werden.
- Der ttsCache muss Aufnahmen mit und ohne Tags auseinanderhalten, sonst spricht
  eine alte gecachte Aufnahme weiter ohne Emotion. Sieh dir den Cache-Schlüssel
  in js/ttsNeural.js an.

Nicht tun: einen zweiten API-Aufruf für die Vorlesefassung einbauen, den
Kontroll-Prompt für bearbeitete Blätter anfassen, am Tarif-Lock oder an der
Kosten-Anzeige etwas ändern.

Abschluss: die vier Sanity-Checks aus CLAUDE.md, Tailwind neu bauen, sw.js
CACHE_NAME hochzählen. Committen und auf den Branch claude/audio-tags pushen.
Keinen Pull Request anlegen.
```

---

## 9 · Lange Texte stückeln + Mitmachmodus mit KI-Stimme (M) - *nach Nr. 8*

```
Arbeite im Repo Lesezauber (LeseZauber Pro). Lies zuerst CLAUDE.md im Root
(besonders den Abschnitt "KI-Stimmen"), dann js/ttsNeural.js und js/tts.js.

Zwei Punkte, die beide tief im Wiedergabe-Weg sitzen und deshalb zusammengehören:

(a) Lange Texte stückeln. Über MAX_NEURAL_CHARS = 4000 (js/ttsNeural.js, praktisch
    nur EPUB-Kapitel) fällt die App heute auf die Gerätestimme zurück. Stattdessen:
    an Satzenden in Stücke von ~800 Zeichen zerlegen, nacheinander synthetisieren
    und abspielen, die Wort-Offsets der Folgestücke um die Dauer der vorherigen
    verschieben, damit die Hervorhebung durchläuft. Der ttsCache muss pro Stück
    greifen. Beachte den _token-Zähler: stop() erhöht ihn, und jede asynchrone
    Fortsetzung muss vorher prüfen, ob sie noch aktuell ist - sonst spricht ein
    abgebrochenes Kapitel verspätet doch noch los.

(b) Mitmachmodus mit KI-Stimme. Der Mitmachmodus (Sprechpause vor jedem durch ein
    Emoji ersetzten Wort) läuft heute bewusst immer über die Gerätestimme. Lösung
    laut Konzept: über Pausen-Tags in EINER Aufnahme - Gemini kennt [pause],
    Chirp 3 kann es über markup. Keine Mehrkosten, weil es eine Aufnahme bleibt.
    Text zu stückeln wäre die teure Alternative und ist ausdrücklich zweite Wahl.
    Anbieter ohne Pausen-Unterstützung bleiben wie bisher auf der Gerätestimme -
    das ist kein Fehler, sondern der geplante Rückfall.

Harte Projektregeln, die hier gelten:
- Nie ohne Ton enden: jeder Fehler fällt auf app.tts.speakWithDevice() zurück.
- Ohne triftigen Grund keine zusätzlichen Synthese-Aufrufe.
- Ein einziges <audio>-Element für die ganze App (iOS).

Abschluss: die vier Sanity-Checks aus CLAUDE.md, sw.js CACHE_NAME hochzählen.
Committen und auf den Branch claude/tts-stueckeln-mitmachmodus pushen.
Keinen Pull Request anlegen.
```

---

## 10 · Heft-Generator: API-Aufruf + Prompt (S)

```
Arbeite im Repo Lesezauber (LeseZauber Pro). Lies zuerst CLAUDE.md im Root und
docs/KONZEPT-Uebungshefte.md komplett - der Heft-MODUS ist fertig, offen ist nur
das ERZEUGEN von Blättern.

Aufgabe: den ersten, kleinsten Schritt des Heft-Generators - den API-Aufruf samt
Prompt. Noch keine Oberfläche, noch kein Canvas.

Zu tun:
- Neue Funktion in js/api.js nach dem Muster von generateBookQuiz(),
  inkl. Mistral-Fallback wie dort.
- Ganz wichtig laut Konzept: EIN Heft = EIN Aufruf, nicht ein Aufruf pro Blatt.
  Die KI liefert also eine Liste von Blättern in einem Rutsch, als JSON.
- Zuerst nur Aufgabentypen OHNE Bild: Zählen, Ankreuzen, Nachspuren,
  Schwungübungen, einfache Buchstaben-/Zahlenaufgaben. "Male die Tiere an" ist
  bewusst ausgeschlossen - auf ein Canvas gezeichneter Text hat keine Tiere;
  Ausmalbilder setzen die Bildgenerierung voraus und kommen später.
- Das Ergebnis soll zum bestehenden Heft-Datenmodell passen (bookType 'workbook':
  text = Aufgabenstellung, erstleserText = kindgerechte Erklärung, desc,
  taskType, materials, helpSteps, solution). Sieh dir app.utils.buildPageVariant()
  an und halte dich exakt an diese Felder.
- Eingabeparameter: Thema, Altersstufe/Schwierigkeit, Anzahl Blätter.
- Ein paar Beispiel-Aufrufe im Kommentar dokumentieren, damit der nächste Schritt
  (Auswahl-Ansicht) direkt andocken kann.
- Antwort sauber validieren: fehlende oder kaputte Felder abfangen, console.error
  plus app.ui.toast(), nie stumm verschlucken.

Nicht tun: neue Ansicht oder Router-Eintrag bauen (eigener Auftrag), Blätter auf
Canvas zeichnen (eigener Auftrag), den Kontroll-Prompt für bearbeitete Blätter
anfassen.

Abschluss: die vier Sanity-Checks aus CLAUDE.md, sw.js CACHE_NAME hochzählen.
In docs/KONZEPT-Uebungshefte.md den Stand nachziehen. Committen und auf den
Branch claude/heft-generator-api pushen. Keinen Pull Request anlegen.
```

---

## 11 · Heft-Generator: Auswahl-Ansicht + Blätter auf Canvas (M) - *nach Nr. 10*

```
Arbeite im Repo Lesezauber (LeseZauber Pro). Lies zuerst CLAUDE.md im Root und
docs/KONZEPT-Uebungshefte.md. Voraussetzung: der Heft-Generator-API-Aufruf in
js/api.js existiert bereits (Branch claude/heft-generator-api) - bau darauf auf,
nicht daneben.

Zwei Schritte:

(a) Auswahl-Ansicht. Neue <main id="view...">-Ansicht in index.html plus
    Router-Eintrag in js/nav.js. Der Nutzer wählt Thema, Altersstufe/Schwierigkeit
    und Anzahl Blätter, bekommt die von der KI vorgeschlagenen Blätter als Liste
    zur Ansicht und kann einzelne abwählen, bevor das Heft angelegt wird.
    Dazu js/render/workbookGenerator.js und js/actions/workbookGenerator.js,
    beide in js/main.js importieren.

(b) Blätter auf Canvas zeichnen. Vorlage ist renderTextAsImageCanvas() in
    js/actions/epubImport.js - genau dieselbe Technik, nicht neu erfinden.
    Ergebnis sind WebP-Bilder in zwei Größen (imgUrl + thumbUrl) wie bei jedem
    importierten Blatt, damit Reader, Heft-Modus und Kontrolle unverändert
    funktionieren. Die Variantendaten aus dem API-Aufruf direkt mit ablegen,
    damit für erzeugte Blätter kein erneuter Analyse-Aufruf nötig ist.
    Große, kindgerechte Schrift, viel Platz zum Schreiben, ausreichend Rand
    zum Ausdrucken.

Das erzeugte Heft ist danach ein ganz normales Buch mit bookType 'workbook' -
lies die Buchart immer über app.utils.resolveBookType(book).

Nicht tun: eine eigene Druckansicht bauen (optionaler Folgeschritt),
Bildgenerierung anfangen.

Abschluss: Tailwind neu bauen (Pflicht - neue Ansicht = neue Klassen), die vier
Sanity-Checks aus CLAUDE.md, sw.js CACHE_NAME hochzählen und alle neuen Dateien
in APP_SHELL eintragen. Committen und auf den Branch
claude/heft-generator-ansicht pushen. Keinen Pull Request anlegen.
```

---

## 12 · SchreibZauber Stufe 1 - Fundament (L) - *keine zweite SchreibZauber-Sitzung daneben*

```
Arbeite im Repo Lesezauber (LeseZauber Pro). Lies zuerst CLAUDE.md im Root, dann
docs/KONZEPT-SchreibZauber.md KOMPLETT (inkl. TEIL G) und docs/KONZEPT-Bildquellen.md.
Ohne diese Dokumente nicht anfangen - dort stehen bereits gefallene Entscheidungen
und verworfene Wege, die nicht neu diskutiert werden sollen.

Aufgabe: SchreibZauber Stufe 1 (Fundament) - und NUR Stufe 1.

Umfang laut Konzept:
- Datenmodell für eigene Werke, DB-Version erhöhen (heute DB_VERSION = 3 in
  js/db.js) und onupgradeneeded erweitern
- Werkstatt-Übersicht als neue Ansicht inkl. Router-Eintrag in js/nav.js
- Ablauf Idee -> Bauplan -> Geschichte
- Platzhalter-Bilder (js/studio/placeholder.js liegt bereits im Repo)
- Export "ins Regal", also als normales Buch in die bestehende Bibliothek

Zwei Punkte, die das Konzept ausdrücklich betont:
1. Stufe 1 läuft OHNE einen einzigen Bildaufruf - das ist Absicht und laut
   Konzept das beste Nutzen-pro-Aufwand-Verhältnis. Stufe 1 ohne Bilder ist ein
   vollständiges Feature, kein Torso. Nicht vorgreifen.
2. js/studio/* (imageFormats.js, imageSource.js, placeholder.js) liegt schon im
   Repo, ist aber absichtlich noch NICHT in js/main.js eingebunden und steht
   deshalb auch nicht in der APP_SHELL von sw.js. Beides einzubinden gehört zum
   ersten Schritt dieser Aufgabe.

Außerdem Entscheidung 6 beachten: Die Prompt-Leitplanken müssen von Anfang an auf
Veröffentlichung ausgelegt sein (z.B. Amazon KDP) - das ist nachträglich nicht
sauber nachrüstbar.

Diese Aufgabe ist die Grundlage für die späteren Werktyp-Pfade (Bilderbuch
Stufe 2+3, Arbeitsheft Stufe 4), die danach parallel entwickelt werden sollen.
Halte die Schnittstellen deshalb bewusst so, dass beide Pfade darauf aufbauen
können, ohne aufeinander zu warten. Schreib am Ende in docs/KONZEPT-SchreibZauber.md
kurz auf, welche Bausteine jetzt stehen und wo die beiden Pfade andocken.

Weil dieser Auftrag Wochen läuft, während andere Sitzungen nach main mergen:
hol dir main regelmäßig in deinen Branch herein (git merge origin/main), etwa
immer dann, wenn ein anderer Branch gemerged wurde. Nicht umgekehrt - und nicht
erst am Ende, sonst wird der Merge zum Abenteuer.

Wenn der Umfang größer wird als erwartet: lieber einen sauber lieferbaren
Teilstand melden und nachfragen, als Stufe 2 anzufangen.

Abschluss: Tailwind neu bauen, die vier Sanity-Checks aus CLAUDE.md, sw.js
CACHE_NAME hochzählen, alle neuen Dateien in APP_SHELL eintragen. Committen und
auf den Branch claude/schreibzauber-stufe1 pushen. Keinen Pull Request anlegen.
```

---

## 13 · Integrations-Pass nach dem Merge + v0.13.0-beta (S) - *zuerst, allein*

```
Arbeite im Repo Lesezauber (LeseZauber Pro). Lies zuerst CLAUDE.md im Root.

Vorgeschichte: Fünf getrennte Sitzungen wurden gerade nach main gemerged -
Vorlese-Aufbereitung, Stimmen-Speicher/"Buch hörfertig machen", TTS-Anbieter-Paket
(Speechify, mehr Stimmen, Tarif-Lock), Kino-Modus (Ken-Burns/Kreuzblende) und
Kosten-Anzeige. Jede Sitzung hat für sich funktioniert; keine hat den
zusammengeführten Stand gesehen. Genau das ist deine Aufgabe.

Zu tun:
1. Die vier Sanity-Checks aus CLAUDE.md über den zusammengeführten Stand laufen
   lassen (Syntax, getElementById-IDs, onclick-Aufrufe, sw.js-Dateiliste). Der
   bekannte Fehlalarm "FEHLT: actions.xyz" aus einem Kommentar in main.js darf
   stehen bleiben.
2. sw.js prüfen: CACHE_NAME muss höher sein als in JEDEM der gemergten Branches,
   und alle neuen Dateien müssen in APP_SHELL stehen - mindestens
   js/actions/prepareAudio.js und js/costMeter.js. Prüfe auch, ob jede neue Datei
   in js/main.js importiert wird; ohne Import lädt sie nie.
3. css/tailwind.css einmal frisch bauen:
   npx @tailwindcss/cli -i ./css/tailwind-input.css -o ./css/tailwind.css --minify
   (die Datei ist ein Bauartefakt - was beim Merge dort entstanden ist, wird
   überschrieben, das ist richtig so)
4. Die Einstellungs-Seite durchsehen. Drei Sitzungen haben unabhängig
   voneinander Blöcke in js/render/settings.js ergänzt: Tarif-Lock, Kosten-Anzeige
   und der Kino-Modus-Schalter. Prüfe, ob die Reihenfolge noch Sinn ergibt, ob
   nichts doppelt erklärt wird und ob die Abschnitte eine erkennbare Gliederung
   haben. Das ist ausdrücklich Teil der Aufgabe - niemand hat die Seite bisher
   als Ganzes gesehen.
5. Zusammenspiel prüfen, das keine Einzelsitzung testen konnte:
   - "Buch hörfertig machen" (Auftrag 2) muss die Kosten-Anzeige (Auftrag 5)
     korrekt hochzählen - aber NUR für Seiten, die wirklich synthetisiert werden,
     nicht für Treffer aus dem ttsCache.
   - Der Tarif-Lock (Auftrag 3) darf beim Wechsel auf Speechify oder ElevenLabs
     greifen, ohne die Kosten-Anzeige durcheinanderzubringen.
   - Die Vorlese-Aufbereitung (Auftrag 1) darf die Wort-Hervorhebung im
     Kino-Modus (Auftrag 6) nicht verschieben.
6. Version auf v0.13.0-beta hochzählen (Anzeige im App-Header in index.html).
   README.md und docs/TODO-GESAMT.md entsprechend nachziehen: die in dieser Welle
   erledigten Punkte aus den offenen Listen streichen und unten bei den fertigen
   Punkten eintragen, damit nichts doppelt eingeplant wird.

Melde am Ende klar, was du gefunden und was du repariert hast. Wenn ein Problem
größer ist als ein Aufräum-Griff, NICHT auf eigene Faust umbauen - beschreiben
und nachfragen.

Nicht tun: neue Funktionen bauen, Features aus den gemergten Branches umdesignen.

Abschluss: Sanity-Checks müssen sauber sein, committen und auf den Branch
claude/integration-v0130 pushen. Keinen Pull Request anlegen.
```

---

## 14 · Video-Export Weg B, Teil 1: Renderer-Kern an einer Einzelseite (M)

```
Arbeite im Repo Lesezauber (LeseZauber Pro). Lies zuerst CLAUDE.md im Root und
docs/KONZEPT-Video.md KOMPLETT - besonders Abschnitt 4.6 (konkreter Bauplan
Weg B) und Abschnitt 8 (empfohlene Reihenfolge). Ohne dieses Dokument nicht
anfangen.

Entscheidungslage, die NICHT neu diskutiert wird:
- Weg B (Canvas + WebCodecs + kleiner Muxer) ist der einzige Weg. Weg A
  (MediaRecorder, Echtzeit-Aufnahme) und Weg C (ffmpeg.wasm, 25-30 MB
  Zusatz-Download) sind ausdrücklich verworfen - nicht neu aufrollen.
- Export gibt es nur für Bücher mit origin: 'authored', damit niemand
  versehentlich ein fremdes Bilderbuch als Video weitergibt.
- Der Renderer bekommt IMMER einen Seitenbereich [von, bis]. Eine einzelne Seite
  ist der Bereich [i, i]. Genau deshalb ist dieser Auftrag hier auf eine
  Einzelseite beschränkt und der nächste liefert das ganze Buch, ohne dass etwas
  umgebaut werden muss.

Aufgabe: der Renderer-Kern, getestet an EINER Seite.

Zu tun:
- Muxer-Bibliothek nach js/vendor/ legen (laut Konzept nur wenige KB). Wie bei
  PDF.js und JSZip: vendored, lazy geladen, NIE direkt bearbeiten.
- Neue Datei js/actions/videoExport.js, in js/main.js importieren.
- Fähigkeitsprüfung zuerst: gibt es VideoEncoder/AudioEncoder? Wenn nein, eine
  verständliche Meldung statt eines Absturzes - das Feature ist opt-in.
- Bild auf ein Canvas zeichnen, Ken-Burns-Bewegung dabei mitrendern (die
  CSS-Variante aus dem Kino-Modus ist die optische Vorlage, im Canvas muss sie
  aber gerechnet werden - schreib als Kommentar dazu, warum es zwei Umsetzungen
  gibt).
- Ton kommt aus app.ttsNeural.renderPageSegments() - Blob, Dauer und
  Wort-Zeitpunkte sind bereits vorhanden, nichts davon neu bauen und vor allem
  nichts neu synthetisieren, was schon im ttsCache liegt.
- Untertitel mit mitlaufender Wort-Hervorhebung ins Bild rendern, gesteuert von
  denselben Wort-Zeitpunkten.
- Fortschrittsanzeige und Abbruch. Der Export läuft lange - die Oberfläche darf
  nicht einfrieren.
- Ergebnis als Download-Link.

Nicht tun: das ganze Buch exportieren (das ist der nächste Auftrag), am
Abspielweg oder am Kino-Modus etwas ändern, eine Bibliothek per CDN einbinden
(das Projekt hat bewusst kein CDN).

Wenn sich unterwegs herausstellt, dass der Bauplan aus dem Konzept an einer
Stelle nicht aufgeht: aufschreiben und nachfragen, nicht still einen anderen Weg
nehmen.

Abschluss: die vier Sanity-Checks aus CLAUDE.md, Tailwind neu bauen, sw.js
CACHE_NAME hochzählen und alle neuen Dateien in APP_SHELL eintragen. In
docs/KONZEPT-Video.md den Stand nachziehen. Committen und auf den Branch
claude/video-renderer-kern pushen. Keinen Pull Request anlegen.
```

---

## 15 · Video-Export Weg B, Teil 2: ganzes Buch + Regie (M) - *nach Nr. 14*

```
Arbeite im Repo Lesezauber (LeseZauber Pro). Lies zuerst CLAUDE.md im Root und
docs/KONZEPT-Video.md, besonders Abschnitt 4.6. Voraussetzung: der Renderer-Kern
aus Auftrag 14 (Branch claude/video-renderer-kern) ist gemerged - bau darauf auf,
nicht daneben.

Aufgabe: aus dem Einzelseiten-Renderer den Buch-Export machen. Laut Entscheidung
(Sept. 2026) ist "das ganze Buch als ein Film" der Hauptfall; pro Seite fällt
gratis ab, weil der Renderer ohnehin einen Seitenbereich bekommt.

Zu tun:
- Seitenbereich [von, bis] durchlaufen, Seiten mit excluded=true überspringen.
- Regie-Logik: Übergänge zwischen den Seiten (Kreuzblende wie im Kino-Modus),
  Ken-Burns-Richtung je Seite variieren, kurze Pausen zwischen den Seiten.
- Titelseite und Rückseite berücksichtigen, falls per Seiten-Rollen markiert
  (titlePageId, backCoverPageId) - die App kennt diese Rollen bereits.
- Beide Varianten in der Oberfläche anbieten: "Diese Seite als Video" und
  "Ganzes Buch als Film". Sie haben verschiedene Zwecke - ein Buch-Film hat laut
  Konzept 120-240 MB und passt durch keinen E-Mail-Anhang, die Einzelseite ist
  die Einheit zum Verschicken. Sag dem Nutzer die ungefähre Größe VOR dem Start.
- Speicher im Auge behalten: ein ganzes Buch darf nicht komplett im
  Arbeitsspeicher liegen. Stückweise schreiben.
- Fortschritt pro Seite anzeigen, jederzeit abbrechbar, angefangene Daten
  aufräumen.
- Weiterhin nur für Bücher mit origin: 'authored'.

Nicht tun: neu synthetisieren, was schon im ttsCache liegt (ein Buch-Export mit
120 Seiten wäre sonst richtig teuer), den Kino-Modus anfassen.

Abschluss: die vier Sanity-Checks aus CLAUDE.md, Tailwind neu bauen, sw.js
CACHE_NAME hochzählen. In docs/KONZEPT-Video.md Abschnitt 8 den Stand nachziehen
und die Punkte in docs/TODO-GESAMT.md abhaken. Committen und auf den Branch
claude/video-buch-export pushen. Keinen Pull Request anlegen.
```

---

## Bewusst **nicht** als Sitzungs-Auftrag

| Punkt | Warum nicht |
|---|---|
| **Comic: zweiter Testlauf** (**S**) | Läuft in `tools/comic-gen/` lokal beim Betreiber, nicht in der App - braucht dessen API-Keys und dessen Urteil über das Ergebnis |
| **Kontroll-Funktion im Alltag beobachten** (**S**) | Reine Beobachtung mit den Kindern, kein Code |
| **Scroll-Verhalten am Bildschirmrand / Zoom-Unschärfe** | Nicht reproduzierbar - braucht erst einen Screenshot vom Nutzer |
| **SchreibZauber Stufe 2-6** | Erst nach Nr. 12 (Stufe 1 gebaut und gemerged), sonst laufen die Sitzungen auf unterschiedlichen Grundlagen auseinander (Entscheidung Sept. 2026, TEIL G) |
| **Die drei XL-Punkte** (Backend, Cloud-Sync, Accounts) | Bewusst zurückgestellt - würden die serverlose Architektur des Projekts umdrehen |
