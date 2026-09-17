import { app } from './core.js';

// gemini-2.5-flash läuft im Oktober 2026 aus. Von Google empfohlener
// Nachfolger: gemini-3.6-flash - Stand jetzt weiterhin im kostenlosen
// Tarif verfügbar. Ändert sich das wieder, reicht ein Update dieser
// einen Zeile.
const GEMINI_MODEL = 'gemini-3.6-flash';

// Mistral als optionaler Fallback, falls Gemini mal ausfällt oder das
// Tageslimit erreicht ist. Wird nur genutzt, wenn ein Mistral-Key in den
// Einstellungen hinterlegt ist - sonst verhält sich die App exakt wie vorher.
const MISTRAL_MODEL = 'mistral-small-latest';

// NEU: nimmt jetzt eine explizite personaId statt immer die globale
// Einstellung zu lesen - so kann man beim Lesen eine andere Persona
// wählen, ohne die Standard-Einstellung für neue Scans zu verändern.
function personaInstruction(personaId) {
    const found = app.personas.find(p => p.id === personaId);
    return found ? found.instruction : 'Du bist freundlich und neutral.';
}

function buildAnalyzePrompt(isCover, personaId, knownText, forceToc) {
    // NEU: Ist der Text der Seite schon bekannt (z.B. aus der Textebene
    // eines PDFs), muss die KI ihn nicht per OCR erraten - das vermeidet
    // Erkennungsfehler beim eigentlichen Lesetext.
    const knownTextBlock = knownText
        ? `\nDer exakte Text dieser Seite ist bereits bekannt (aus der Textebene, NICHT per Bilderkennung raten):\n"${knownText}"\nNutze GENAU diesen Wortlaut UNVERÄNDERT nur für "originalText". Das Feld "simplifiedText" MUSS trotzdem eine eigene, wirklich vereinfachte Version mit Emojis sein - NICHT einfach der bekannte Text unverändert kopiert, genau wie bei jeder anderen Seite auch.\n`
        : '';

    // NEU: der Nutzer kann eine Seite explizit als Inhaltsverzeichnis
    // markieren (siehe app.actions.setPageRole) - dann wird die Erkennung
    // erzwungen statt der Standard-Formulierung, die bei ungewöhnlichem
    // Layout sonst leicht null zurückliefert.
    const tocInstruction = forceToc
        ? `Diese Seite wurde vom Nutzer als Inhaltsverzeichnis markiert - extrahiere UNBEDINGT die Kapitelüberschriften in 'tocEntries' (Array, OHNE Seitenzahlen), auch bei ungewöhnlichem Layout.`
        : `Falls diese Seite ein Inhaltsverzeichnis/eine Kapitelübersicht ist: Array der Kapitelüberschriften in gedruckter Reihenfolge, OHNE Seitenzahlen (z.B. ['Der Anfang', 'Das Abenteuer', 'Die Rückkehr']). Sonst null.`;

    return `Rolle: ${personaInstruction(personaId)}
${knownTextBlock}
Analysiere die Kinderbuch-Seite. Antworte AUSSCHLIESSLICH in validem JSON-Format! Verwende keine Markdown-Blöcke.
Nutze exakt dieses Schema:
{
  "originalText": "Der exakte gedruckte Text (Wenn leer: 'Kein Text.')",
  "simplifiedText": "GENAU der Originaltext mit GLEICHEM Satzbau - ersetze NUR 2-4 einzelne Nomen direkt an ihrer Stelle durch ein passendes Emoji. KEINE Umformulierung, KEINE Vereinfachung des Satzbaus, KEINE neuen/anderen Sätze - nur die Emoji-Ersetzung.",
  "vocabulary": [{"word": "Beispiel-Nomen", "emoji": "🌳"}],
  "hasIllustration": true oder false - true NUR wenn die Seite eine echte Illustration/Zeichnung/Foto zeigt, false bei einer reinen Textseite ohne Bild,
  "imageDescription": "Falls hasIllustration=true: die Illustration in 2 Sätzen passend zur Rolle beschreiben. Falls hasIllustration=false: null",
  "quizQuestion": "Falls hasIllustration=true: leichte Frage ZUM BILD. Falls hasIllustration=false: leichte Frage zum Textinhalt dieser Seite.",
  "quizAnswer": "Die kurze Antwort darauf.",
  "chapterTitle": "Falls diese Seite sichtbar ein NEUES Kapitel beginnt (eigene Kapitelüberschrift, z.B. 'Kapitel 3: Der geheime Wald'): die Überschrift GENAU wie gedruckt. Sonst null - die meisten Seiten sind KEIN Kapitelanfang.",
  "tocEntries": "${tocInstruction}",
  "speechText": "NUR fürs Vorlesen, NICHT für die Anzeige: GENAU der Text aus 'originalText', WORTGLEICH und mit gleicher Satzstellung, aber an ein paar wenigen, wirklich passenden Stellen mit Sprech-Anweisungen mitten im Satz in eckigen Klammern angereichert (z.B. [flüstert], [lacht], [aufgeregt], [seufzt], [gähnt]), passend zur Rolle (${personaInstruction(personaId)}) und zur Stimmung der jeweiligen Stelle. KEIN Wort am eigentlichen Text ändern, hinzufügen oder weglassen - nur Tags EINFÜGEN. Sparsam einsetzen, nicht bei jedem Satz. Gibt der Text keinen erkennbaren Anlass für Emotionen her: identisch zu 'originalText'."
  ${isCover ? ', "title": "Der auf dieser Seite gedruckte Buchtitel, so genau wie erkennbar (auch bei kunstvoller/kursiver Schrift genau hinschauen) - nur null, falls WIRKLICH kein Titel zu sehen ist", "author": "Der gedruckte Autorenname - nur null, falls wirklich keiner zu sehen ist", "publisher": "Der erkennbare Verlagsname (z.B. aus Logo/Impressum auf dieser Seite) - nur null, falls wirklich keiner zu sehen ist", "series": "Der Name der Buchreihe, falls auf dieser Seite als Reihenbezeichnung erkennbar (z.B. Bildermaus) - nur null, falls keine erkennbar ist"' : ''}
}
Das Feld "vocabulary" listet GENAU die Nomen (in Grundform, z.B. "Baum" statt "Bäume"), die du in "simplifiedText" durch ein Emoji ersetzt hast, zusammen mit dem jeweils verwendeten Emoji.`;
}

// NEU: eigener Prompt für Übungshefte (bookType 'workbook'). Der normale
// Analyse-Prompt oben ist auf eine ERZÄHL-Seite zugeschnitten und ersetzt
// Nomen durch Emojis - bei einer Arbeitsanweisung ("Male alle Dreiecke an")
// wäre genau das schädlich, das Kind soll die Anweisung ja verstehen.
// Deshalb hier ein komplett eigenes Schema: Aufgabe, kindgerechte
// Erklärung, Hilfeschritte, Lösung.
function buildWorkbookPrompt(isCover, personaId, knownText) {
    const knownTextBlock = knownText
        ? `\nDer exakte Text dieser Seite ist bereits bekannt (aus der Textebene, NICHT per Bilderkennung raten):\n"${knownText}"\nNutze GENAU diesen Wortlaut UNVERÄNDERT nur für "taskText". "taskExplained" MUSS trotzdem eine eigene, kindgerechte Erklärung sein.\n`
        : '';

    return `Rolle: ${personaInstruction(personaId)}
${knownTextBlock}
Du hilfst einem Vorschulkind (ca. 4-6 Jahre), das noch NICHT lesen kann, bei einem Übungsblatt/Arbeitsblatt. Ein Erwachsener oder die App liest dem Kind alles vor.
Analysiere das abgebildete Übungsblatt. Antworte AUSSCHLIESSLICH in validem JSON-Format! Verwende keine Markdown-Blöcke.
Nutze exakt dieses Schema:
{
  "taskText": "Die Aufgabenstellung EXAKT so, wie sie auf dem Blatt gedruckt steht (wenn keine gedruckt ist: 'Keine Aufgabe gedruckt.')",
  "taskExplained": "Erkläre dem Kind in 1-2 sehr kurzen, einfachen Sätzen, was es tun soll. Sprich das Kind direkt an ('Male ...', 'Suche ...'). WICHTIG: ersetze KEINE Wörter durch Emojis - das Kind muss die Anweisung verstehen. Höchstens 1-2 Emojis am Satzende.",
  "taskType": "Genau EINER dieser Werte: ausmalen, verbinden, zaehlen, nachspuren, ankreuzen, schreiben, zuordnen, suchen, sonstiges",
  "materials": "Was das Kind dafür braucht, sehr kurz (z.B. 'Buntstifte') - oder null",
  "pageDescription": "Was auf dem Blatt zu sehen ist (Bilder, Formen, Linien, Kästchen) in 1-2 Sätzen, so dass sich ein Kind, das das Blatt vor sich hat, wiederfindet. Falls nichts Bildhaftes zu sehen ist: null",
  "helpSteps": ["3 bis 5 kurze Schritte in Du-Form, EIN einzelner Handgriff pro Schritt, in der Reihenfolge des Bearbeitens"],
  "solution": "Die Lösung bzw. woran man erkennt, dass es richtig ist. Bei freien Aufgaben (z.B. frei ausmalen): 'Hier gibt es kein richtig oder falsch.'",
  "vocabulary": [{"word": "Dreieck", "emoji": "🔺"}]${isCover ? ',\n  "title": "Der auf dieser Seite gedruckte Titel des Hefts - nur null, falls wirklich keiner zu sehen ist", "author": "Der gedruckte Autor/Herausgeber - nur null, falls wirklich keiner zu sehen ist"' : ''}
}
"vocabulary" enthält höchstens 4 Lernwörter (Nomen in Grundform) vom Blatt mit passendem Emoji, für den Vokabeltrainer. Keine gefunden: leeres Array.
SEHR WICHTIG: Erfinde nichts dazu. Was du auf dem Blatt nicht sicher erkennst, darfst du nicht raten - schreibe bei "solution" dann "Das kann ich hier nicht sicher erkennen." Eine falsche Lösung verunsichert das Kind mehr, als gar keine zu haben.`;
}

// NEU: Prompt für die Kontrolle eines BEARBEITETEN Blattes. Die KI kennt
// dabei die Aufgabe und die erwartete Lösung aus der vorherigen Analyse -
// sie muss also nicht erraten, worum es geht, sondern nur noch vergleichen.
// Die Regeln am Ende sind der wichtigste Teil: ein Kind, dem fälschlich
// gesagt wird, es habe sich vertan, verliert die Lust an der Sache. Lieber
// "unklar" als ein falscher Tadel.
function buildCheckPrompt(variant, personaId) {
    const solution = variant.solution || 'Keine Lösung hinterlegt - beurteile nur, ob die Aufgabe erkennbar bearbeitet wurde.';
    const explained = variant.erstleserText || variant.text || '';

    return `Rolle: ${personaInstruction(personaId)}

Ein Kind (ca. 4-6 Jahre, kann noch NICHT lesen) hat ein Übungsblatt bearbeitet und zeigt es dir jetzt als Foto. Du siehst also das BEARBEITETE Blatt mit dem, was das Kind gemalt, verbunden, angekreuzt oder geschrieben hat.

Die Aufgabe lautete: "${variant.text || ''}"
So wurde sie dem Kind erklärt: "${explained}"
Erwartete Lösung: "${solution}"

Schau dir an, was das Kind gemacht hat, und antworte AUSSCHLIESSLICH in validem JSON-Format! Verwende keine Markdown-Blöcke.
Nutze exakt dieses Schema:
{
  "verdict": "Genau EINER dieser Werte: richtig, fast, nochmal, unklar",
  "praise": "Ein kurzer, warmer Satz an das Kind. Benenne IMMER zuerst etwas Gutes - auch dann, wenn noch etwas fehlt.",
  "feedback": "1-2 kurze Sätze in Du-Form: was du auf dem Blatt siehst und was gegebenenfalls noch fehlt. Kindgerecht und freundlich. Das Wort 'falsch' benutzt du NICHT.",
  "hints": ["1 bis 3 kurze Tipps, was das Kind als Nächstes tun kann. Bei verdict 'richtig' ein leeres Array. Verrate nicht einfach die ganze Lösung, gib nur einen Schubs in die richtige Richtung."]
}

Diese Regeln sind wichtiger als alles andere:
- Kannst du auf dem Foto nicht sicher erkennen, was das Kind gemacht hat (unscharf, zu dunkel, abgeschnitten, Blatt nicht erkennbar, gar nichts bearbeitet)? Dann verdict "unklar" und sage im feedback freundlich, dass du das Bild nicht gut erkennen kannst. RATE NICHT.
- Im Zweifel immer "fast" statt "nochmal".
- Bei freien Aufgaben, bei denen es kein richtig oder falsch gibt (z.B. frei ausmalen), ist alles richtig, was bearbeitet wurde: verdict "richtig".
- Sprich das Kind direkt an, nie über das Kind.`;
}

// Gemeinsame Aufräum-Logik für beide Anbieter: manche Modelle wrappen die
// JSON-Antwort trotz Anweisung in ```json ... ``` Markdown-Blöcke.
function parseModelJson(rawText) {
    const cleaned = (rawText || '{}').replace(/^```(json)?\n?/, '').replace(/\n?```$/, '').trim();
    return JSON.parse(cleaned);
}

async function callGeminiAnalyze(prompt, base64Image) {
    if (!app.settings.apiKey) throw new Error('API_KEY_MISSING');

    const payload = {
        contents: [{ parts: [{ text: prompt }, { inlineData: { mimeType: 'image/webp', data: base64Image } }] }],
        generationConfig: { temperature: 0.2 }
    };

    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${app.settings.apiKey}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload)
    });

    if (!res.ok) {
        if (res.status === 400) throw new Error('Falscher API-Key (400)');
        if (res.status === 403) throw new Error('API-Key ungültig (403)');
        if (res.status === 429) throw new Error('Gemini-Limit erreicht (429)');
        throw new Error(`Gemini-Fehler ${res.status}`);
    }

    const data = await res.json();
    const textResult = data.candidates?.[0]?.content?.parts?.[0]?.text || '{}';
    return parseModelJson(textResult);
}

async function callMistralAnalyze(prompt, base64Image) {
    if (!app.settings.mistralApiKey) throw new Error('MISTRAL_KEY_MISSING');

    const res = await fetch('https://api.mistral.ai/v1/chat/completions', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${app.settings.mistralApiKey}`
        },
        body: JSON.stringify({
            model: MISTRAL_MODEL,
            messages: [{
                role: 'user',
                content: [
                    { type: 'text', text: prompt },
                    { type: 'image_url', image_url: `data:image/webp;base64,${base64Image}` }
                ]
            }]
        })
    });

    if (!res.ok) throw new Error(`Mistral-Fehler ${res.status}`);

    const data = await res.json();
    const textResult = data.choices?.[0]?.message?.content || '{}';
    return parseModelJson(textResult);
}

// NEU: reiner Text-Aufruf (kein Bild) fürs Buch-Quiz, genutzt vom
// Gemini/Mistral-Fallback-Paar unten.
async function callMistralText(prompt) {
    if (!app.settings.mistralApiKey) throw new Error('MISTRAL_KEY_MISSING');

    const res = await fetch('https://api.mistral.ai/v1/chat/completions', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${app.settings.mistralApiKey}`
        },
        body: JSON.stringify({
            model: MISTRAL_MODEL,
            messages: [{ role: 'user', content: prompt }]
        })
    });

    if (!res.ok) throw new Error(`Mistral-Fehler ${res.status}`);

    const data = await res.json();
    const textResult = data.choices?.[0]?.message?.content || '[]';
    return parseModelJson(textResult);
}

Object.assign(app.api, {
    // personaId ist jetzt optional - ohne Angabe wird wie bisher die
    // globale Standard-Persona genutzt (bestehende Aufrufe funktionieren
    // unverändert weiter). forceToc ebenfalls optional - siehe
    // app.actions.setPageRole('tocPageId', ...).
    // NEU: bookType entscheidet zusätzlich, welcher Prompt genutzt wird. Ohne
    // Angabe bleibt es beim bisherigen Geschichten-Prompt - alle alten Aufrufe
    // verhalten sich dadurch unverändert.
    async analyze(base64Image, isCover, personaId = app.settings.persona, knownText = null, forceToc = false, bookType = 'story') {
        const prompt = bookType === 'workbook'
            ? buildWorkbookPrompt(isCover, personaId, knownText)
            : buildAnalyzePrompt(isCover, personaId, knownText, forceToc);

        try {
            return await callGeminiAnalyze(prompt, base64Image);
        } catch (geminiError) {
            if (!app.settings.mistralApiKey) throw geminiError;

            console.warn('Gemini fehlgeschlagen, versuche Mistral-Fallback:', geminiError.message);
            try {
                const result = await callMistralAnalyze(prompt, base64Image);
                app.ui.toast('Gemini nicht erreichbar - Mistral eingesprungen', '🔄');
                return result;
            } catch (mistralError) {
                console.error('Auch Mistral-Fallback fehlgeschlagen:', mistralError);
                throw geminiError;
            }
        }
    },

    async answerQuestion(base64Image, question) {
        const prompt = `Beantworte die Frage eines Kindes basierend auf dem Bild in einem prägnanten Satz: "${question}"`;

        try {
            if (!app.settings.apiKey) throw new Error('API_KEY_MISSING');
            const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${app.settings.apiKey}`, {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ contents: [{ parts: [{ text: prompt }, { inlineData: { mimeType: 'image/webp', data: base64Image } }] }] })
            });
            if (!res.ok) throw new Error('API Fehler');
            const data = await res.json();
            return data.candidates?.[0]?.content?.parts?.[0]?.text || 'Das weiß ich leider nicht.';
        } catch (geminiError) {
            if (!app.settings.mistralApiKey) throw new Error('Verbindungsfehler');
            try {
                const res = await fetch('https://api.mistral.ai/v1/chat/completions', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${app.settings.mistralApiKey}` },
                    body: JSON.stringify({
                        model: MISTRAL_MODEL,
                        messages: [{ role: 'user', content: [{ type: 'text', text: prompt }, { type: 'image_url', image_url: `data:image/webp;base64,${base64Image}` }] }]
                    })
                });
                if (!res.ok) throw new Error('Mistral Fehler');
                const data = await res.json();
                return data.choices?.[0]?.message?.content || 'Das weiß ich leider nicht.';
            } catch (mistralError) {
                throw new Error('Verbindungsfehler');
            }
        }
    },

    // NEU: Verständnisfragen zum GESAMTEN Buch (reiner Text-Aufruf, kein
    // Bild) - fasst den Text aller Seiten zusammen und lässt die KI daraus
    // ein paar Fragen zur Geschichte als Ganzes erstellen.
    async generateBookQuiz(compiledText, personaId) {
        if (!app.settings.apiKey) throw new Error('API_KEY_MISSING');

        const prompt = `Rolle: ${personaInstruction(personaId)}
Hier ist der komplette Text eines Kinderbuchs, Seite für Seite:

${compiledText}

Erstelle GENAU 4 Verständnisfragen zum GESAMTEN Buch (nicht zu einzelnen Bildern) - z.B. zur Reihenfolge der Ereignisse, zu Hauptfiguren, oder wie die Geschichte endet. Halte die Fragen einfach genug für ein Kind im Vorlesealter.
Antworte AUSSCHLIESSLICH als valides JSON-Array ohne Markdown-Blöcke, exakt in diesem Format:
[
  {"question": "...", "answer": "..."},
  {"question": "...", "answer": "..."}
]`;

        // FIX: bisher als einziger API-Aufruf ohne Mistral-Fallback - fiel
        // Gemini aus, ging das Buch-Quiz gar nicht, obwohl das README den
        // Fallback allgemein verspricht. Jetzt wie analyze() gehandhabt.
        try {
            const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${app.settings.apiKey}`, {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { temperature: 0.3 } })
            });

            if (!res.ok) throw new Error(`Gemini-Fehler ${res.status}`);
            const data = await res.json();
            const textResult = data.candidates?.[0]?.content?.parts?.[0]?.text || '[]';
            return parseModelJson(textResult);
        } catch (geminiError) {
            if (!app.settings.mistralApiKey) throw geminiError;

            console.warn('Gemini fehlgeschlagen, versuche Mistral-Fallback:', geminiError.message);
            try {
                const result = await callMistralText(prompt);
                app.ui.toast('Gemini nicht erreichbar - Mistral eingesprungen', '🔄');
                return result;
            } catch (mistralError) {
                console.error('Auch Mistral-Fallback fehlgeschlagen:', mistralError);
                throw geminiError;
            }
        }
    },

    // NEU: Kontrolle eines bearbeiteten Übungsblattes. Nutzt dieselben
    // Anbieter-Funktionen wie analyze() (inkl. Mistral-Fallback), nur mit
    // einem anderen Prompt und dem Foto des bearbeiteten Blattes.
    async checkWorkedPage(base64Image, variant, personaId = app.settings.persona) {
        const prompt = buildCheckPrompt(variant, personaId);

        try {
            return await callGeminiAnalyze(prompt, base64Image);
        } catch (geminiError) {
            if (!app.settings.mistralApiKey) throw geminiError;
            console.warn('Gemini-Kontrolle fehlgeschlagen, versuche Mistral-Fallback:', geminiError.message);
            try {
                const result = await callMistralAnalyze(prompt, base64Image);
                app.ui.toast('Gemini nicht erreichbar - Mistral eingesprungen', '🔄');
                return result;
            } catch (mistralError) {
                console.error('Auch Mistral-Fallback fehlgeschlagen:', mistralError);
                throw geminiError;
            }
        }
    }
});
