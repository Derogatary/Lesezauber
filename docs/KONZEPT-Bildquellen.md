# 🖼️ Bildquellen für SchreibZauber – kostenlose Wege, Platzhalter, Austausch

**Stand:** 16.09.2026 · **Ergänzt:** [`KONZEPT-SchreibZauber.md`](KONZEPT-SchreibZauber.md)

Beantwortet zwei Fragen: **Gibt es kostenlose Möglichkeiten, die Bilder zu erzeugen?**
Und: **Wie sehen Platzhalter aus, die später sauber ausgetauscht werden können?**

---

## 0. Kurzantwort

- **Ja, es gibt kostenlose Wege** – aber keiner davon ist gleichzeitig *gratis*, *gut*,
  *figurenkonsistent* und *vollautomatisch*. Man muss sich aussuchen, worauf man verzichtet.
- **Der beste kostenlose Weg für echte KI-Bilder** ist der **Prompt-Export**: die App baut den
  fertigen Prompt, man erzeugt das Bild kostenlos im Google-AI-Studio oder in der Gemini-App
  und lädt es zurück in die App. Ein Klick mehr pro Bild, dafür 0 €.
- **Der beste Weg überhaupt für eine Familie** ist vermutlich gar keine KI: **das Kind malt,
  das Handy fotografiert.** Konsistenz ist automatisch gelöst, Kosten null, Wert unschlagbar.
- **Platzhalter sind unabhängig davon richtig** – sie sind jetzt gebaut und einsatzbereit.

Zur Einordnung, weil es oft verwechselt wird: **Konnektoren** (die Anbindungen, über die
Claude im Chat externe Dienste erreicht) helfen der App hier nicht. LeseZauber läuft im
Browser der Familie und muss selbst an die Bilder kommen. Und ich selbst kann keine
Rasterbilder malen – ich kann Prompts formulieren, Platzhalter per Canvas erzeugen, den
Austausch-Code schreiben und eine Bild-API ansteuern, sobald ein Key dafür existiert.

---

## 1. Die Optionen im Vergleich

| Weg | Kosten | Bildqualität | Figuren bleiben gleich | Automatisch | Ohne Server nutzbar |
|---|---|---|---|---|---|
| **Platzhalter** (gebaut) | 0 € | – (kein Bild) | – | ✅ | ✅ |
| **Eigene Bilder / Kinderzeichnung** | 0 € | ⭐⭐⭐ (auf ihre Art) | ✅ perfekt | ❌ | ✅ |
| **Prompt-Export → AI Studio → Upload** | 0 € | ⭐⭐⭐ | ✅ (Referenzbild anhängbar) | ❌ | ✅ |
| **Freie Cliparts / Bilddatenbanken** | 0 € | ⭐⭐ | ❌ | ✅ | ✅ |
| **Pollinations.ai** | „kostenlos", mit Haken | ⭐⭐–⭐⭐⭐ | ✅ möglich | ✅ | ⚠️ |
| **Gemini Bild-API direkt** | ~0,07 $/Bild | ⭐⭐⭐ | ✅ am besten | ✅ | ✅ |
| **Lokal im Browser (WebGPU)** | 0 € | ⭐⭐ | ⚠️ schwierig | ✅ | ✅, aber nur am PC |
| **Hugging Face Inference** | faktisch nein | ⭐⭐⭐ | ⚠️ | ✅ | ⚠️ |

### 1.1 Prompt-Export – der empfohlene kostenlose Weg

Die App kennt den Prompt ohnehin schon (`app.studio.imageSource.buildPrompt()`), egal welche
Quelle am Ende benutzt wird. Daraus wird ein Mini-Workflow:

1. In der Werkstatt auf „📋 Prompt kopieren" tippen
2. Google AI Studio oder die Gemini-App öffnen, einfügen, ggf. das Figurenblatt anhängen
3. Bild herunterladen
4. In der App auf „🖼️ Bild einsetzen" tippen und die Datei wählen

Beide Enden sind jetzt fertig: der Kopier-Teil (`app.studio.imageSource.copyPrompt()`)
und der Rückweg (`providers.upload` in `js/studio/imageSource.js`). Kosten: 0 €. Nachteil:
vier Handgriffe pro Bild, also ~50 Handgriffe pro Bilderbuch. Für ein Buch pro Monat völlig
in Ordnung, für Serienproduktion nicht.

### 1.2 Pollinations.ai – attraktiv, aber nicht mehr das, was im Netz steht

Pollinations ist ein Dienst, der viele Bildmodelle unter einer einfachen URL bündelt –
inklusive `google/gemini-3.1-flash-image` und `black-forest-labs/flux.1-schnell`. Ein Aufruf
sieht so aus:

```
https://gen.pollinations.ai/image/<prompt>?model=black-forest-labs/flux.1-schnell&width=1536&height=1024&seed=42
```

Über einen POST mit mehreren `image=@…`-Teilen lassen sich sogar **Referenzbilder** mitgeben –
genau das, was die Figurenkonsistenz braucht.

**Aber** – und das steht in vielen älteren Anleitungen noch falsch drin: der Dienst ist
inzwischen auf ein Guthaben-System („Pollen") umgestellt. Laut aktueller API-Doku:

- Schlüsselloser Zugriff ist bestenfalls geduldet und stark gedrosselt
- Einfache öffentliche Schlüssel (`pk_`) sind **ausdrücklich als veraltet markiert**
  und auf *1 Pollen pro IP und Stunde* begrenzt – für ein Buch mit 13 Bildern unbrauchbar
- Geheime Schlüssel (`sk_`) dürfen laut Doku **niemals** in eine Browser-App
- Der offiziell vorgesehene Weg für Browser-Apps ist eine OAuth-Anmeldung, bei der der Nutzer
  sein eigenes Guthaben freigibt. Es gibt eine kostenlose Grundmenge („Quest Pollen")

Dazu drei Punkte, die für ein Kinder-Familienprojekt zählen:
- Prompt und Ergebnis laufen über einen **Drittanbieter**, nicht über Google
- Die kostenlose Stufe kann ein **Wasserzeichen** tragen
- Verfügbarkeit und Limits eines Gratis-Dienstes können sich jederzeit ändern

**Bewertung:** als *optionale Zusatzquelle* interessant, als Fundament zu wackelig.
**Wichtig:** Ich konnte den Dienst aus dieser Umgebung heraus **nicht live testen** – der
Netzwerk-Proxy hier blockiert ihn (403). Ob der schlüssellose Aufruf noch funktioniert,
müsste im Browser auf deinem Gerät geprüft werden, bevor irgendetwas darauf aufbaut.

### 1.3 Gemini Bild-API – der Weg für den Dauerbetrieb

Gleicher Key wie bisher, bestes Ergebnis, bis zu ~14 Referenzbilder für Figuren- und
Objekttreue. Rund 0,07 $ pro Bild bei 1K-Auflösung, also grob **3 $ für ein 32-seitiges
Bilderbuch** inklusive Korrekturschleifen. Nach aktuellem Stand ist der Bild-Endpunkt
allerdings **nicht** im kostenlosen Kontingent – der Account muss abrechnungsfähig sein.
Das ist der einzige Punkt, der noch geklärt werden muss.

### 1.4 Was sich nicht lohnt

- **Hugging Face**: nur noch ~0,10 $ Startguthaben, danach Durchleitung zu Anbieterpreisen.
  Kein echter Gratis-Weg mehr.
- **Lokal im Browser (WebGPU/Stable Diffusion)**: 0 € und maximal privat, aber 1–2 GB
  Modell-Download, kein iOS-Safari, und auf einem Handy dauert ein Bild Minuten.
  Auf dem PC irgendwann einen zweiten Blick wert, als Haupt-Weg ungeeignet.

### 1.5 Sonderfall Arbeitsheft

Für Arbeitshefte braucht man meistens **Clipart, keine Illustrationskunst**: ein Apfel,
eine Schere, fünf Punkte. Dafür reichen freie Bilddatenbanken (z. B. Openclipart) völlig aus –
kostenlos, rechtlich sauber, sofort verfügbar und in Graustufen druckbar. Die teure
Bildgenerierung lohnt hier fast nie.

---

## 2. Die Entscheidung: Platzhalter zuerst

Unabhängig davon, welcher Weg gewinnt, ist die Reihenfolge klar: **erst Platzhalter, dann
Bilder.** Gründe:

1. Das komplette Werk – Text, Aufteilung, Layout, Blättern, Druckvorschau – lässt sich damit
   fertig bauen und beurteilen, **bevor** ein einziger kostenpflichtiger Aufruf passiert.
2. Es entkoppelt die Entscheidung: die Werkstatt kann gebaut werden, während die Frage nach
   dem Bildanbieter noch offen ist.
3. Es entspricht exakt dem Verlagsworkflow: Storyboard und Dummy bestehen auch nur aus
   Kästchen, bevor jemand teure Illustrationen anfertigt.

---

## 3. Was jetzt gebaut wurde

Drei kleine Module unter `js/studio/`. Sie sind **noch nicht in `main.js` verdrahtet** – sie
sind das Fundament, auf dem die Werkstatt aufsetzt, und laufen einzeln testbar.

| Datei | Inhalt |
|---|---|
| `imageFormats.js` | Der **Formatkatalog**: acht Bildformate mit fester Zielgröße, Seitenverhältnis, Textzone und Zweck. Der einzige Ort, an dem Maße stehen. |
| `placeholder.js` | Erzeugt aus einem Format ein **Platzhalter-Bild in exakt der Zielgröße** – mit Schraffur, Maßangabe, Bildidee und eingezeichneter Textzone. |
| `imageSource.js` | Die **Austausch-Schicht**: einheitlicher Prompt-Bauplan plus Quellen `placeholder` und `upload`, dazu `copyPrompt()` für den Prompt-Export-Weg. Hier docken später `gemini` und `pollinations` an. |

**Der Formatkatalog:**

| ID | Zweck | Größe | Verhältnis |
|---|---|---|---|
| `cover` | Titelbild | 1024 × 1344 | 3:4 |
| `spreadLandscape` | Bilderbuch-Doppelseite | 1536 × 1024 | 3:2 |
| `pagePortrait` | Bilderbuch-Einzelseite | 1024 × 1344 | 3:4 |
| `characterSheet` | Figurenblatt (Referenz) | 1024 × 1024 | 1:1 |
| `comicPage` | Comic-Seite | 1024 × 1344 | 3:4 |
| `comicPanel` | Comic-Einzelpanel | 1024 × 768 | 4:3 |
| `worksheetIllu` | Arbeitsheft-Bild / Ausmalbild | 768 × 768 | 1:1 |
| `worksheetBanner` | Arbeitsheft-Kopfleiste | 1024 × 256 | 4:1 |

Alle Maße sind **Vielfache von 16** – mehrere Bildmodelle lehnen andere Größen ab oder runden
still, was zu minimal abweichenden Seitenverhältnissen führen würde.

**Ansehen:** [`docs/platzhalter-vorschau.html`](platzhalter-vorschau.html) zeigt alle acht
Formate in Originalgröße samt gespeichertem Prompt. Die Seite braucht einen lokalen Server
(`python3 -m http.server 8000`, dann `http://localhost:8000/docs/platzhalter-vorschau.html`)
oder läuft direkt über die GitHub-Pages-Adresse.

---

## 4. Wie der spätere Austausch funktioniert

Der ganze Trick ist, dass **jede Bildquelle dieselbe Form zurückgibt**:

```js
{ full, thumb, meta: { formatId, width, height, source, prompt, created } }
```

`meta.source` ist der Merker: `'placeholder'`, `'upload'` – später `'gemini'`, `'pollinations'`.
Und `meta.prompt` wird **auch beim Platzhalter schon mitgespeichert**. Damit gilt:

1. Ein Bild anfordern ist immer derselbe Aufruf:
   ```js
   const bild = await app.studio.imageSource.request('placeholder', {
       formatId: 'spreadLandscape', sketch: 'Der Fuchs rennt durch hohes Gras',
       style: 'weiches Aquarell', characters: [fips], index: 3
   });
   ```
2. Eine neue Quelle dazubauen heißt: **eine Funktion** in `providers` ergänzen. Kein anderer
   Code ändert sich.
3. Umstellen auf echte Bilder heißt: `'placeholder'` → `'gemini'`. Eine Zeichenkette.
4. „Alle Platzhalter ersetzen" ist dadurch ein einfacher Durchlauf: alle Seiten mit
   `meta.source === 'placeholder'` einsammeln, den **bereits gespeicherten Prompt** erneut
   abschicken – diesmal an die echte Quelle. Der Prompt muss nie neu erdacht werden.

Weil die Maße identisch sind, springt beim Austausch nichts: gleiche Zielgröße, gleiches
Seitenverhältnis, gleiche Textzone.

---

## 5. Offene Punkte

1. **Gemini-Bild-API abrechnungsfähig?** Der einzige echte Blocker für den Vollautomatik-Weg.
   Braucht eine Antwort vom Betreiber, siehe `KONZEPT-SchreibZauber.md` TEIL G.
2. **Pollinations im Browser testen** – funktioniert der schlüssellose Aufruf noch, und wenn
   ja, in welchem Umfang? **Weiterhin nicht prüfbar** – der Netzwerk-Proxy dieser
   Entwicklungsumgebung blockiert `image.pollinations.ai`/`gen.pollinations.ai` durchgehend
   (403, zweimal bestätigt: per `curl` und per echtem Headless-Chrome-Aufruf). Das ist eine
   Beschränkung dieser Umgebung, keine Aussage über den Dienst selbst – der Test muss auf
   einem Gerät ohne diesen Proxy passieren (z.B. im normalen Familien-Browser).
3. ~~**Kopier-Knopf für den Prompt-Export**~~ **✅ erledigt.** `app.studio.imageSource
   .copyPrompt(prompt)` kopiert über die Clipboard-API mit `execCommand`-Rückfall für
   Kontexte ohne `navigator.clipboard` (z.B. reines `http://`). Fehler werden wie überall
   in der App per `console.error()` + Toast gemeldet, nie stumm verschluckt. Live zu sehen
   in [`docs/platzhalter-vorschau.html`](platzhalter-vorschau.html) – dort hat jede Karte
   jetzt einen „📋 Prompt kopieren"-Knopf.
4. **Clipart-Quelle fürs Arbeitsheft** – lohnt eine eigene kleine Recherche, sobald
   Ausbaustufe 4 drankommt.

---

## Quellen

- [Pollinations API-Dokumentation (APIDOCS.md)](https://github.com/pollinations/pollinations/blob/main/APIDOCS.md) – Endpunkte, Modelle, Schlüssel-Typen, Limits
- [Pollinations: Connect User Wallets (BYOP)](https://github.com/pollinations/pollinations/blob/main/BRING_YOUR_OWN_POLLEN.md)
- [Gemini Developer API pricing](https://ai.google.dev/gemini-api/docs/pricing)
- [Gemini 3.1 Flash Image – Google Cloud Documentation](https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/gemini/3-1-flash-image)
- [Generating Consistent Imagery with Gemini – Google Codelabs](https://codelabs.developers.google.com/gemini-consistent-imagery-notebook)
- [Hugging Face Inference Providers](https://huggingface.co/docs/inference-providers/index)
- [Hugging Face Inference API Free Tier Limits & Pricing 2026](https://klymentiev.com/blog/huggingface-inference-api)
