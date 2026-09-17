import { app } from '../core.js';
import './studioPrompts.js';

// ================= SchreibZauber: KI-Aufrufe =================
// js/api.js bleibt für die Lese-Seite zuständig (Konzept D.4) - die
// Werkstatt bekommt bewusst EIGENE Aufruf-Funktionen. Sie nutzen aber
// dieselben, vom Nutzer in den Einstellungen hinterlegten Keys und
// dieselbe Gemini-zuerst-dann-Mistral-Fallback-Logik wie js/api.js, damit
// sich die Werkstatt genauso verhält wie der Rest der App (kein zweiter
// API-Key, kein anderes Fehlerbild).

// Gleiche Modell-Konstante wie js/api.js, bewusst hier dupliziert statt
// importiert - beide Dateien sollen unabhängig voneinander änderbar
// bleiben (siehe Konzept D.4), ein Modellwechsel bleibt trotzdem in jeder
// Datei nur eine Zeile.
const GEMINI_MODEL = 'gemini-3.6-flash';
const MISTRAL_MODEL = 'mistral-small-latest';

// Gleiche Aufräum-Logik wie js/api.js: manche Modelle wrappen die
// JSON-Antwort trotz Anweisung in ```json ... ``` Markdown-Blöcke.
function parseModelJson(rawText) {
    const cleaned = (rawText || '{}').replace(/^```(json)?\n?/, '').replace(/\n?```$/, '').trim();
    return JSON.parse(cleaned);
}

async function callGeminiText(prompt) {
    if (!app.settings.apiKey) throw new Error('API_KEY_MISSING');

    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${app.settings.apiKey}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { temperature: 0.7 } })
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

async function callMistralText(prompt) {
    if (!app.settings.mistralApiKey) throw new Error('MISTRAL_KEY_MISSING');

    const res = await fetch('https://api.mistral.ai/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${app.settings.mistralApiKey}` },
        body: JSON.stringify({ model: MISTRAL_MODEL, messages: [{ role: 'user', content: prompt }] })
    });

    if (!res.ok) throw new Error(`Mistral-Fehler ${res.status}`);

    const data = await res.json();
    const textResult = data.choices?.[0]?.message?.content || '{}';
    return parseModelJson(textResult);
}

Object.assign(app.studio, {
    api: {
        // brief/spec: siehe js/studio/studioCore.js (createDefaultProject).
        // Rückgabe: { title, spreads: [{text, pageTurnHook}] }
        async generateManuscript(brief, spec) {
            const prompt = app.studio.prompts.buildManuscriptPrompt(brief, spec);

            try {
                return await callGeminiText(prompt);
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
        }
    }
});
