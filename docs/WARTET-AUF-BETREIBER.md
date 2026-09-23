# ⏳ Wartet auf den Betreiber

**Stand: v0.39.0-beta, September 2026**

Diese Punkte wurden aus [`docs/TODO-GESAMT.md`](TODO-GESAMT.md) hierher verschoben, weil
Claude sie **nicht allein erledigen kann**. Es fehlt jeweils etwas, das nur du hast: ein Konto,
ein echtes Gerät, eine Beobachtung aus dem Familienalltag oder eine Entscheidung. Die TODO-Liste
enthält damit nur noch Punkte, an denen direkt gebaut werden kann.

**So funktioniert es:** Sobald du bei einem Punkt die Spalte „Was fehlt“ erledigt hast, sag
Claude Bescheid. Der Punkt wandert dann zurück in die TODO-Liste oder wird direkt umgesetzt.

---

## 🚦 Grundsatzentscheidung: privat bleiben oder öffentlich veröffentlichen?

Aus der Release-Prüfung ([`RELEASE-CHECKLISTE.md`](RELEASE-CHECKLISTE.md)): Die Gemini-Nutzungsbedingungen
verbieten Apps, die sich an unter 18-Jährige richten, und verlangen für EU-Nutzer bezahlte Zugänge.
Vor jedem Schritt Richtung öffentlicher Veröffentlichung musst du entscheiden, ob die App privat
bleibt und, falls nicht, welcher KI-Anbieter Kinder-Apps erlaubt und wer die KI-Kosten trägt.
Dafür braucht es rechtliche bzw. Datenschutz-Beratung, das kann Claude nicht ersetzen.

## 🧪 Mit echten Keys/Geräten ausprobieren

Das ist gebaut, aber ohne echte Anbieter-Keys getestet (in der Entwicklungsumgebung gibt es
keine Keys, Anfragen wurden dort nur simuliert).

| Punkt | Was fehlt | Worauf achten |
|---|---|---|
| **KI-Stimme in der Birkenbihl-Zielsprache** (v0.38.0-beta) | Einmal mit deiner KI-Stimme im Birkenbihl-Tab auf 🔊 tippen | Vor allem **Speechify**: spricht eine deutsche Stimme englischen/französischen Text sauber? Falls nein, Claude Bescheid geben, dann wird dort eine passende Stimme je Sprache hinterlegt |
| **Ganzes Buch übersetzen** (v0.39.0-beta) | Ein kurzes Buch (5-10 Seiten) übersetzen lassen | Klingt die Übersetzung natürlich? Bleiben die Erzähler-Varianten unterschiedlich? Liest die Stimme in der richtigen Sprache vor? |
| **Zwischenruf der Erzähler** (v0.39.0-beta) | Eine neue Seite scannen und die Erzähler durchtippen | Sind die Zwischenrufe kindgerecht und abwechslungsreich, oder nerven sie beim automatischen Vorlesen? (Ältere Seiten haben noch keinen - die bekommen ihn erst beim Neu-Auslesen) |
| **KDP: Quadratformat, Seitenaufbau, Panorama** (v0.39.0-beta) | Einen KDP-Innenteil als PDF speichern und im KDP-Vorschauer hochladen | Meldet der Vorschauer Fehler bei Beschnitt/Rand? Liegt das Panorama wirklich auf gegenüberliegenden Seiten? Vor einer echten Veröffentlichung zusätzlich eine Testbestellung |

## 🖼️ Braucht die Bild-API (Zahlungsmethode am Google-Konto)

Die echte Gemini-Bildgenerierung verlangt in der Regel eine hinterlegte Zahlungsmethode, siehe
[`KONZEPT-SchreibZauber.md`](KONZEPT-SchreibZauber.md) TEIL G Punkt 1. Kostenlos geht es
inzwischen auch über Pollinations (v0.37.0-beta), allerdings ohne Referenzbilder.

| Punkt | Aufwand | Was fehlt |
|---|---|---|
| **Comic: zweiter Testlauf mit korrigiertem Prompt** | **S** | Ein Testbild hat zwei Prompt-Probleme aufgedeckt, der korrigierte Wortlaut ist noch nicht erprobt. Du müsstest ein Testbild erzeugen (Gemini mit Zahlungsmethode, oder Pollinations) und das Ergebnis zeigen - Details [`KONZEPT-Comic.md`](KONZEPT-Comic.md) |
| **Heft-Generator: Ausmalbilder per KI** | **L** | Braucht funktionierende Bildgenerierung UND eine Entscheidung, ob Ausmalbilder überhaupt gewünscht sind (s/w-Konturen, Kosten pro Bild). Konzept: [`KONZEPT-Comic.md`](KONZEPT-Comic.md), [`KONZEPT-Bildquellen.md`](KONZEPT-Bildquellen.md) |

## 👀 Beobachtung aus dem Alltag

| Punkt | Was fehlt |
|---|---|
| **Kontroll-Funktion im Alltag** | Wie zuverlässig beurteilt Gemini die Fotos bearbeiteter Blätter? Einfach ein paar Wochen nutzen und merken, wie oft „unklar“ kommt. Bei zu vielen wäre eine Foto-Hilfe (Rahmen, Helligkeitshinweis) der nächste Schritt |
| **Scroll-Verhalten am Bildschirmrand (Desktop)** | Bisher nicht nachstellbar - bitte einen Screenshot oder eine kurze Beschreibung, wann genau es passiert (Browser, Fenstergröße) |
| **Zoom/Unschärfe im Fenstermodus** | Ebenfalls nicht nachstellbar - Screenshot + Browser/Gerät |

## 📱 Braucht deine Konten / volle Internetverbindung

| Punkt | Was fehlt |
|---|---|
| **Native Android-App (TWA)** | Weg ist gewählt, Paket-ID `app.lesezauber.pro`, Signierschlüssel und `.well-known/assetlinks.json` liegen bereit. Offen: `bubblewrap init`/`build` auf deinem Rechner ausführen (braucht volle Internetverbindung, in der Claude-Umgebung gesperrt) und ein Google-Play-Console-Konto einrichten (einmalig 25 $). Siehe CHANGELOG.md v0.30.3-beta. Nebeneffekt: ein natives Paket könnte Vorlesen bei gesperrtem Bildschirm weiterlaufen lassen |

## 🗄️ Bewusst zurückgestellt (bräuchten einen eigenen Server)

Nicht vergessen, sondern mit Absicht auf Eis: Ein Server würde das Grundprinzip „komplett im
Browser, keine eigene Infrastruktur“ umdrehen. Seit den KI-Stimmen liegen mehr Keys im Browser
als früher, die Abwägung bleibt trotzdem dieselbe.

| Punkt | Aufwand |
|---|---|
| API-Keys über ein Backend absichern | **XL** |
| Automatische Cloud-Synchronisierung | **XL** |
| Echte Multi-Geräte-Accounts mit Login | **XL** |
