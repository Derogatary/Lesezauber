import { app } from '../core.js';

// NEU (v0.47.0-beta, Wiedereingliederung): kein eigenes Modell und keine
// Netlify-Function mehr - Buchatlas nutzt den Gemini-Key aus den LeseZauber-
// Einstellungen und dieselbe Modell-Liste (app.api.geminiModels, js/api.js),
// absteigend nach Modellgüte. Meldet ein Modell 429 (sein eigenes
// Tageskontingent ist aufgebraucht), kommt sofort das nächste dran - erst
// wenn ALLE limitiert sind, wird wie bisher mit Backoff gewartet.

// Gemeinsame Aufräum-Logik: manche Modelle wrappen die JSON-Antwort trotz
// Anweisung in ```json ... ``` Markdown-Blöcke.
function parseModelJson(rawText) {
    const cleaned = (rawText || '{}').replace(/^```(json)?\n?/, '').replace(/\n?```$/, '').trim();
    return JSON.parse(cleaned);
}

// Feste Wartezeit zwischen zwei Calls (Gratis-Tarif: wenige Anfragen/Minute).
const BASE_PACING_MS = 4500;
const MIN_PACING_MS = 800;

// Wie in js/api.js: Buchinhalte mit mittlerer Filterstufe. Buchatlas ist
// für Romane gedacht (auch Fantasy mit Monstern/Kämpfen) - strenger würde
// dort ständig blockieren. Das Feld hängt fetchGeminiWithRetry() an jeden Body.
function withSafety(options) {
    try {
        const body = JSON.parse(options.body);
        body.safetySettings = app.api.safetySettingsBook;
        return { ...options, body: JSON.stringify(body) };
    } catch (e) {
        console.error('Buchatlas: Anfrage-Body nicht lesbar, Sicherheitsfilter fehlen:', e);
        return options;
    }
}

// ================= Automatischer Retry mit Backoff =================
// Ersetzt den früheren einfachen fetch()-Aufruf für ALLE drei Gemini-
// Funktionen unten. Bei vorübergehenden Fehlern (429 Rate-Limit, 5xx
// Serverfehler, Netzwerkaussetzer) wird automatisch mit wachsender Pause
// erneut versucht - der aufrufende Code (z.B. die Übersetzungs- oder OCR-
// Schleife) merkt davon nichts und muss selbst keine Retry-Logik haben.
// Bei einem endgültigen Fehler (z.B. falscher API-Key, 400er) wird SOFORT
// geworfen, ohne unnötige Wiederholungen - der Aufrufer fängt das pro
// Seite/Bild einzeln ab (try/catch in den jeweiligen Schleifen), sodass
// EIN fehlgeschlagenes Element nicht den ganzen Vorgang abbricht, sondern
// nur diese eine Seite übersprungen wird.
const MAX_RETRIES = 4; // zählt nur ECHTE Wartezyklen, nicht das kostenlose Wechseln zwischen Modellen
const MAX_BACKOFF_MS = 60000; // länger warten wir automatisch nicht - danach lieber sauber fehlschlagen
const MAX_LOOP_ITERATIONS = 200; // Sicherheitsnetz gegen eine theoretische Endlosschleife

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function backoffDelay(attempt) {
    // 4s, 8s, 16s, 32s, gedeckelt bei 60s, plus etwas Zufall (Jitter) -
    // falls mehrere Tabs/Aufrufe gleichzeitig laufen, fragen nicht alle
    // exakt zur selben Millisekunde erneut an.
    const base = Math.min(4000 * Math.pow(2, attempt), MAX_BACKOFF_MS);
    return base + Math.random() * 1000;
}

// Manche Gemini-429-Antworten enthalten einen konkreten Vorschlag, wie
// lange zu warten ist (error.details[].retryDelay, z.B. "31s"). Wenn
// vorhanden, nutzen wir diesen statt unserer eigenen Schätzung.
async function parseServerRetryDelayMs(res) {
    try {
        const body = await res.clone().json();
        const details = body?.error?.details || [];
        const retryInfo = details.find(d => (d['@type'] || '').includes('RetryInfo'));
        const seconds = parseFloat(retryInfo?.retryDelay || '');
        return isNaN(seconds) ? null : seconds * 1000;
    } catch (e) {
        return null; // Antwort war kein JSON oder ohne RetryInfo - kein Beinbruch
    }
}

// NEU (v0.47.0-beta): "action" statt kompletter URL - das Modell wählt die
// Rotation. Key im Header x-goog-api-key (nie ?key= in der URL, siehe
// CLAUDE.md), Sicherheitsfilter über withSafety().
async function fetchGeminiWithRetry(action, options) {
    const apiKey = app.settings.apiKey;
    if (!apiKey) throw new Error('API_KEY_MISSING');
    const models = app.api.geminiModels || [];
    const finalOptions = withSafety({
        ...options,
        headers: { ...(options.headers || {}), 'x-goog-api-key': apiKey }
    });
    let waitAttempt = 0;
    let modelIdx = 0;

    for (let iteration = 0; iteration < MAX_LOOP_ITERATIONS; iteration++) {
        const model = models[modelIdx];
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:${action}`;
        let res;
        try {
            res = await fetch(url, finalOptions);
        } catch (networkErr) {
            if (waitAttempt >= MAX_RETRIES) throw networkErr;
            const delay = backoffDelay(waitAttempt);
            app.atlas.ui.setProgress(`Verbindungsproblem - erneuter Versuch in ${Math.round(delay / 1000)}s...`);
            await sleep(delay);
            waitAttempt++;
            continue;
        }

        if (res.ok) return res;

        if (res.status === 429) {
            // Erst die übrigen Modelle durchprobieren (jedes hat sein eigenes
            // Tageskontingent) - kostet keine Wartezeit.
            if (modelIdx < models.length - 1) {
                console.warn(`Buchatlas: ${model} limitiert, versuche nächstes Modell`);
                modelIdx++;
                continue;
            }
            // Alle limitiert - jetzt hilft nur Warten, dann wieder von vorn
            // (Minuten-Limits erholen sich schnell, das beste Modell zuerst).
            if (waitAttempt >= MAX_RETRIES) throw new Error('Gemini-Fehler 429');
            const serverDelay = await parseServerRetryDelayMs(res);
            const delay = Math.min(serverDelay ?? backoffDelay(waitAttempt), MAX_BACKOFF_MS);
            app.atlas.ui.setProgress(`Rate-Limit bei allen Modellen - automatischer neuer Versuch in ${Math.round(delay / 1000)}s...`);
            await sleep(delay);
            waitAttempt++;
            modelIdx = 0;
            continue;
        }

        if (res.status >= 500) {
            if (waitAttempt >= MAX_RETRIES) throw new Error(`Gemini-Fehler ${res.status}`);
            const delay = backoffDelay(waitAttempt);
            app.atlas.ui.setProgress(`Serverfehler ${res.status} - automatischer neuer Versuch in ${Math.round(delay / 1000)}s...`);
            await sleep(delay);
            waitAttempt++;
            continue;
        }

        throw new Error(`Gemini-Fehler ${res.status}`);
    }

    throw new Error('Zu viele Versuche - abgebrochen.');
}

// ================= Nutzungs-Zähler =================
// Gemini liefert in jeder Antwort mit, wie viele Tokens der Call verbraucht
// hat (usageMetadata). Wird hier gesammelt und in localStorage persistiert
// - rein informativ fürs Zeit-/Kontingent-Gefühl, beeinflusst nichts an
// der eigentlichen Funktionalität. Kein Kosten-Betrag (Preise ändern sich,
// hängen vom genutzten Kontingent/Tarif ab) - nur Rohzahlen.
// Eigener Schlüssel, getrennt von LeseZaubers Kostenanzeige (js/costMeter.js)
const USAGE_STORAGE_KEY = 'lz_atlas_api_usage';

function loadUsageStats() {
    try {
        const stored = JSON.parse(localStorage.getItem(USAGE_STORAGE_KEY) || 'null');
        if (stored && typeof stored.calls === 'number') return stored;
    } catch (e) {
        // Beschädigter Eintrag - einfach neu anfangen
    }
    return { calls: 0, promptTokens: 0, responseTokens: 0, since: Date.now() };
}

let usageStats = loadUsageStats();

function recordApiUsage(data) {
    const usage = data?.usageMetadata;
    usageStats.calls++;
    if (usage) {
        usageStats.promptTokens += usage.promptTokenCount || 0;
        usageStats.responseTokens += usage.candidatesTokenCount || 0;
    }
    localStorage.setItem(USAGE_STORAGE_KEY, JSON.stringify(usageStats));
}

Object.assign(app.atlas.api, {
    // Nutzungsstatistik fürs Einstellungen-Panel - reine Rohzahlen (Calls,
    // Prompt-/Antwort-Tokens seit dem letzten Zurücksetzen), keine
    // Kostenschätzung (Preise/Freikontingente ändern sich, das wäre schnell
    // veraltet oder falsch).
    getUsageStats() {
        return { ...usageStats };
    },

    resetUsageStats() {
        usageStats = { calls: 0, promptTokens: 0, responseTokens: 0, since: Date.now() };
        localStorage.setItem(USAGE_STORAGE_KEY, JSON.stringify(usageStats));
    },

    // Es gibt genau einen Key (den aus den LeseZauber-Einstellungen) - die
    // Modell-Rotation ersetzt die frühere Rotation über mehrere Keys.
    getKeyCount() {
        return 1;
    },

    getPacingDelayMs() {
        return Math.max(MIN_PACING_MS, BASE_PACING_MS);
    },

    // Buch-Wiki - liest den kompletten Buchtext und extrahiert daraus a)
    // eine Kapitelübersicht mit Zusammenfassungen und b) alle
    // wiederkehrenden Personen, Orte, Fähigkeiten, Systeme etc. als
    // strukturierte Liste. Ein einziger Call über den ganzen Text statt
    // Seite-für-Seite, damit dasselbe Element nicht mehrfach mit leicht
    // unterschiedlichen Beschreibungen auftaucht - die Zusammenführung
    // übernimmt das Modell direkt.
    async generateBookWiki(compiledText) {
        const prompt = `Hier ist der komplette Text eines Buchs, Seite für Seite:

${compiledText}

Erstelle daraus ZWEI Dinge:

1. KAPITELÜBERSICHT: Erkenne die Kapitelgrenzen im Text (an Überschriften wie "Kapitel 3"/"Chapter 3", oder falls keine expliziten Überschriften vorhanden sind, an deutlichen Szenen-/Zeit-/Ortssprüngen). Fasse jedes Kapitel in 2-4 Sätzen zusammen (die wichtigsten Ereignisse, keine Nacherzählung von Nebensächlichkeiten).

2. WIKI-EINTRÄGE: Liste ALLE wiederkehrenden oder wichtigen Elemente der Geschichte auf, jeweils mit einer Kategorie ("type"):
- "person": Personen, Tiere, wichtige Figuren
- "ort": Orte, Länder, Gebäude, Reiche
- "monster": Kreaturen, Gegner, Bestien (nur falls vorhanden)
- "faehigkeit": Einzelne Fähigkeiten, Zaubersprüche, Skills, Techniken einer Figur
- "system": Übergeordnete Regel-/Spielsysteme der Welt (z.B. Level-/Status-/Magie-System, Klassen, Ränge - typisch für LitRPG/Progression-Fantasy)
- "konzept": Sonstige wichtige Konzepte, Regeln, Fraktionen, Organisationen oder Begriffe der Welt
- "sonstiges": Wichtiges, das in keine der obigen Kategorien passt (z.B. bedeutsame Gegenstände/Artefakte)

Nutze eine Kategorie NUR, wenn sie tatsächlich zur Geschichte passt - bei einem Buch ohne Monster/Magie/Systeme bleiben diese Kategorien einfach leer, das ist normal und richtig so.

Regeln:
- Jedes Element erscheint NUR EINMAL, auch wenn es auf mehreren Seiten vorkommt - fasse alle Informationen in EINER Beschreibung zusammen.
- Nutze für "name" die im Text am häufigsten verwendete Bezeichnung.
- "description": 1-3 sachliche Sätze - was/wer es ist und wie es sich in der Geschichte entwickelt bzw. eingesetzt wird.
- "pages": Array der Seitenzahlen (als Zahlen), auf denen es erwähnt wird oder auftaucht.
- Ignoriere unwichtige Randdetails, die nur beiläufig einmal erwähnt werden.

Antworte AUSSCHLIESSLICH als valides JSON-Objekt ohne Markdown-Blöcke, exakt in diesem Format:
{
  "chapters": [
    {"title": "Kapitel 1", "startPage": 1, "endPage": 8, "summary": "..."}
  ],
  "entities": [
    {"name": "...", "type": "person", "description": "...", "pages": [1, 3]}
  ]
}`;

        const res = await fetchGeminiWithRetry('generateContent', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            // maxOutputTokens explizit hochgesetzt - bei langen Romanen mit
            // vielen Kapiteln und Einträgen kann die JSON-Antwort groß werden,
            // ein abgeschnittenes JSON wäre sonst nicht mehr parsbar.
            body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { temperature: 0.2, maxOutputTokens: 8192 } })
        });

        const data = await res.json();
        recordApiUsage(data);
        const textResult = data.candidates?.[0]?.content?.parts?.[0]?.text || '{"chapters":[],"entities":[]}';
        const parsed = parseModelJson(textResult);
        return {
            chapters: Array.isArray(parsed.chapters) ? parsed.chapters : [],
            entities: Array.isArray(parsed.entities) ? parsed.entities : []
        };
    },

    // übersetzt einen Textabschnitt (eine "Seite"/ein Kapitel aus dem
    // Text-Import) in die Zielsprache. Bekommt optional ein Glossar aus dem
    // Buch-Wiki mit (Namen/Orte + Kurzbeschreibung), damit wiederkehrende
    // Eigennamen über das ganze Buch hinweg konsistent übersetzt werden,
    // statt bei jeder Seite isoliert neu entschieden zu werden.
    async translatePage(text, targetLang, glossary) {
        const prompt = `Übersetze den folgenden Textabschnitt eines Buchs möglichst genau und stilistisch passend nach ${targetLang}. Erfinde nichts hinzu, lass nichts weg, übersetze NUR - kein Kommentar, keine Erklärung.
${glossary ? `\nNutze für folgende wiederkehrende Namen/Begriffe IMMER dieselbe Übersetzung/Schreibweise, damit der Text über alle Seiten hinweg konsistent bleibt:\n${glossary}\n` : ''}
Text:
"""
${text}
"""

Antworte AUSSCHLIESSLICH mit der reinen Übersetzung - keine Anführungszeichen drumherum, kein Markdown, kein Kommentar davor oder danach.`;

        const res = await fetchGeminiWithRetry('generateContent', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { temperature: 0.3, maxOutputTokens: 8192 } })
        });

        const data = await res.json();
        recordApiUsage(data);
        const raw = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
        // Falls das Modell die Übersetzung trotz Anweisung in Anführungszeichen
        // packt, diese am Rand entfernen - der Rest bleibt unangetastet.
        return raw.trim().replace(/^["“„]+/, '').replace(/["“”]+$/, '').trim();
    },

    // Rückübersetzungs-Stichprobe (siehe actions/bookTranslate.js): übersetzt
    // einen bereits übersetzten Textabschnitt zurück in die Sprache eines
    // kurzen Referenzausschnitts (des Originals) - so wie professionelle
    // Übersetzungs-QA das stichprobenartig macht, um zu sehen, ob die
    // Bedeutung erhalten blieb. Wird NUR für ein paar Beispielseiten
    // aufgerufen, nicht fürs ganze Buch (würde nochmal so viel kosten wie
    // die Übersetzung selbst).
    async backTranslateSample(translatedText, originalSample) {
        const prompt = `Hier ist ein kurzer Referenztext, NUR um die Ausgangssprache zu erkennen (diesen Text NICHT übersetzen, nur zur Sprach-Erkennung nutzen):
"""
${originalSample}
"""

Übersetze jetzt den folgenden, bereits übersetzten Text zurück in die Sprache des Referenztextes oben - möglichst wörtlich und nah am Ausgangstext, für einen Qualitätsvergleich (nicht stilistisch schön, sondern genau):
"""
${translatedText}
"""

Antworte AUSSCHLIESSLICH mit der reinen Rückübersetzung - keine Anführungszeichen, kein Kommentar.`;

        const res = await fetchGeminiWithRetry('generateContent', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { temperature: 0.2, maxOutputTokens: 4096 } })
        });

        const data = await res.json();
        recordApiUsage(data);
        const raw = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
        return raw.trim().replace(/^["“„]+/, '').replace(/["“”]+$/, '').trim();
    },

    // OCR: liest den sichtbaren Text aus einem Bild aus (z.B. fotografierte
    // Buchseite oder eine gescannte PDF-Seite ohne eigene Textebene). Reine
    // Transkription - keine Interpretation, keine Zusammenfassung. Wird
    // NUR für Seiten/Bilder ohne bereits vorhandenen digitalen Text
    // aufgerufen (siehe actions/fileImport.js) - Seiten mit echter
    // Textebene laufen weiterhin über den schnelleren, kostenlosen
    // Text-Extraktions-Weg statt hierüber.
    async ocrImage(base64Data, mimeType = 'image/jpeg') {
        const prompt = 'Transkribiere den gesamten sichtbaren Text in diesem Bild exakt und vollständig. Keine Interpretation, keine Zusammenfassung, keine Kommentare - nur der reine Text, so wie er im Bild steht. Zeilenumbrüche/Absätze möglichst beibehalten. Falls kein lesbarer Text im Bild ist, antworte mit einem leeren String.';

        const res = await fetchGeminiWithRetry('generateContent', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{
                    parts: [
                        { text: prompt },
                        { inline_data: { mime_type: mimeType, data: base64Data } }
                    ]
                }],
                generationConfig: { temperature: 0.1, maxOutputTokens: 4096 }
            })
        });

        const data = await res.json();
        recordApiUsage(data);
        return (data.candidates?.[0]?.content?.parts?.[0]?.text || '').trim();
    },

    // Für den Namens-Konsistenz-Check (siehe actions/bookTranslate.js):
    // übersetzt NUR die Eigennamen aus dem Wiki einmalig in die
    // Zielsprache (nicht pro Seite - ein einziger, kleiner Call), damit
    // wir danach client-seitig OHNE weitere API-Calls prüfen können, ob
    // die erwartete Zielsprachen-Schreibweise auf den passenden Seiten
    // tatsächlich auftaucht.
    async translateGlossaryTerms(names, targetLang) {
        if (!names || names.length === 0) return [];

        const prompt = `Übersetze die folgenden Eigennamen/Begriffe so, wie sie in einer Buchübersetzung nach ${targetLang} tatsächlich geschrieben würden (manche Eigennamen bleiben dabei unverändert - das ist normal und richtig):

${names.map((n, i) => `${i + 1}. ${n}`).join('\n')}

Antworte AUSSCHLIESSLICH als JSON-Array mit GENAU ${names.length} Einträgen, in exakt derselben Reihenfolge wie oben, ohne Nummerierung, ohne Markdown-Block:
["...", "..."]`;

        const res = await fetchGeminiWithRetry('generateContent', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { temperature: 0.1, maxOutputTokens: 2048 } })
        });

        const data = await res.json();
        recordApiUsage(data);
        const textResult = data.candidates?.[0]?.content?.parts?.[0]?.text || '[]';
        const parsed = parseModelJson(textResult);
        return Array.isArray(parsed) ? parsed : [];
    }
});
