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

function buildAnalyzePrompt(isCover, personaId, knownText) {
    // NEU: Ist der Text der Seite schon bekannt (z.B. aus der Textebene
    // eines PDFs), muss die KI ihn nicht per OCR erraten - das vermeidet
    // Erkennungsfehler beim eigentlichen Lesetext.
    const knownTextBlock = knownText
        ? `\nDer exakte Text dieser Seite ist bereits bekannt (aus der Textebene, NICHT per Bilderkennung raten):\n"${knownText}"\nNutze GENAU diesen Wortlaut UNVERÄNDERT nur für "originalText". Das Feld "simplifiedText" MUSS trotzdem eine eigene, wirklich vereinfachte Version mit Emojis sein - NICHT einfach der bekannte Text unverändert kopiert, genau wie bei jeder anderen Seite auch.\n`
        : '';

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
  "quizAnswer": "Die kurze Antwort darauf."
  ${isCover ? ', "title": "Der auf dieser Seite gedruckte Buchtitel, so genau wie erkennbar (auch bei kunstvoller/kursiver Schrift genau hinschauen) - nur null, falls WIRKLICH kein Titel zu sehen ist", "author": "Der gedruckte Autorenname - nur null, falls wirklich keiner zu sehen ist"' : ''}
}
Das Feld "vocabulary" listet GENAU die Nomen (in Grundform, z.B. "Baum" statt "Bäume"), die du in "simplifiedText" durch ein Emoji ersetzt hast, zusammen mit dem jeweils verwendeten Emoji.`;
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

Object.assign(app.api, {
    // personaId ist jetzt optional - ohne Angabe wird wie bisher die
    // globale Standard-Persona genutzt (bestehende Aufrufe funktionieren
    // unverändert weiter).
    async analyze(base64Image, isCover, personaId = app.settings.persona, knownText = null) {
        const prompt = buildAnalyzePrompt(isCover, personaId, knownText);

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

        const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${app.settings.apiKey}`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { temperature: 0.3 } })
        });

        if (!res.ok) throw new Error(`Gemini-Fehler ${res.status}`);
        const data = await res.json();
        const textResult = data.candidates?.[0]?.content?.parts?.[0]?.text || '[]';
        return parseModelJson(textResult);
    }
});
