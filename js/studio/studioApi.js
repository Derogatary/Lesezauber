import { app } from '../core.js';
import './studioPrompts.js';

// ================= SchreibZauber: KI-Aufrufe =================
// js/api.js bleibt für die Lese-Seite zuständig (Konzept D.4) - die
// Werkstatt bekommt bewusst EIGENE Aufruf-Funktionen. Sie nutzen aber
// dieselben, vom Nutzer in den Einstellungen hinterlegten Keys und
// dieselbe Gemini-zuerst-dann-Mistral-Fallback-Logik wie js/api.js, damit
// sich die Werkstatt genauso verhält wie der Rest der App (kein zweiter
// API-Key, kein anderes Fehlerbild).

// Gleiche Modell-Liste wie js/api.js, bewusst hier dupliziert statt
// importiert - beide Dateien sollen unabhängig voneinander änderbar
// bleiben (siehe Konzept D.4), ein Modellwechsel bleibt trotzdem in jeder
// Datei nur eine Zeile.
// FIX (Sept. 2026, siehe ausführliche Begründung in js/api.js): Rotation
// über mehrere Modelle statt eines einzelnen - jedes hat sein eigenes
// Tageskontingent (~20 Anfragen bei den "vollen" Flash-Modellen laut
// Nutzer-Screenshot), absteigend nach Modellgüte, gemini-3.1-flash-lite
// als letzte, großzügigste Reserve (~500/Tag) vor dem Mistral-Fallback.
const GEMINI_MODELS = [
    'gemini-3.8-flash',
    'gemini-3.7-flash',
    'gemini-3.6-flash',
    'gemini-3.5-flash',
    'gemini-3.1-flash-lite'
];
const MISTRAL_MODEL = 'mistral-small-latest';

// Gleiche Aufräum-Logik wie js/api.js: manche Modelle wrappen die
// JSON-Antwort trotz Anweisung in ```json ... ``` Markdown-Blöcke.
function parseModelJson(rawText) {
    const cleaned = (rawText || '{}').replace(/^```(json)?\n?/, '').replace(/\n?```$/, '').trim();
    return JSON.parse(cleaned);
}

// NEU (Modell-Rotation, siehe ausführliche Begründung in js/api.js): probiert
// GEMINI_MODELS der Reihe nach, sobald eins mit HTTP 429 antwortet. Jeder
// andere Fehler bricht sofort ab - ein anderes Modell hätte dasselbe Problem.
async function withGeminiModelRotation(callModel) {
    for (const model of GEMINI_MODELS) {
        try {
            return await callModel(model);
        } catch (e) {
            if (e.message !== 'RATE_LIMITED') throw e;
            console.warn(`${model}: Ratenbegrenzung erreicht, versuche nächstes Modell`);
        }
    }
    throw new Error('Gemini-Limit bei allen Modellen erreicht (429)');
}

async function callGeminiText(prompt) {
    if (!app.settings.apiKey) throw new Error('API_KEY_MISSING');

    const textResult = await withGeminiModelRotation(async (model) => {
        const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
            method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': app.settings.apiKey },
            // NEU (Release-Prüfung A4): strenge Filterstufe, siehe js/api.js.
            body: JSON.stringify({ safetySettings: app.api.safetySettingsKids, contents: [{ parts: [{ text: prompt }] }], generationConfig: { temperature: 0.7 } })
        });

        if (!res.ok) {
            if (res.status === 400) throw new Error('Falscher API-Key (400)');
            if (res.status === 403) throw new Error('API-Key ungültig (403)');
            if (res.status === 429) throw new Error('RATE_LIMITED');
            throw new Error(`Gemini-Fehler ${res.status}`);
        }

        const data = await res.json();
        return data.candidates?.[0]?.content?.parts?.[0]?.text || '{}';
    });

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

// NEU (Stufe 2, um Ausbaustufe 4 - Arbeitsheft erweitert): gemeinsame
// Gemini-zuerst-dann-Mistral-Fallback-Logik war bisher in
// generateManuscript() fest eingebaut - jetzt als eigene Funktion mit
// parametrisierbarer Toast-Meldung, damit suggestCharacters()/
// suggestSketches() (Stufe 2) UND die drei Arbeitsheft-Aufrufe Progression/
// Kapitel-Aufgaben/Niveau-Variante (Ausbaustufe 4) sie mitbenutzen können,
// statt den Fallback fünfmal zu duplizieren.
async function callTextWithFallback(prompt, fallbackToastMsg) {
    try {
        return await callGeminiText(prompt);
    } catch (geminiError) {
        if (!app.settings.mistralApiKey) throw geminiError;

        console.warn('Gemini fehlgeschlagen, versuche Mistral-Fallback:', geminiError.message);
        try {
            const result = await callMistralText(prompt);
            app.ui.toast(fallbackToastMsg, '🔄');
            return result;
        } catch (mistralError) {
            console.error('Auch Mistral-Fallback fehlgeschlagen:', mistralError);
            throw geminiError;
        }
    }
}

Object.assign(app.studio, {
    api: {
        // brief/spec: siehe js/studio/studioCore.js (createDefaultProject).
        // Rückgabe: { title, spreads: [{text, pageTurnHook}] }
        async generateManuscript(brief, spec) {
            const prompt = app.studio.prompts.buildManuscriptPrompt(brief, spec);
            return callTextWithFallback(prompt, 'Gemini nicht erreichbar - Mistral eingesprungen');
        },

        // NEU (Ausbaustufe 5): Comic-Gegenstück zu generateManuscript() -
        // Rückgabe: { title, spreads: [{text, pageTurnHook, dialogue: [{speaker, line}]}] }
        async generateComicScript(brief, spec) {
            const prompt = app.studio.prompts.buildComicScriptPrompt(brief, spec);
            return callTextWithFallback(prompt, 'Gemini nicht erreichbar - Mistral eingesprungen (Skript)');
        },

        // Stufe 4 – Figuren-Steckbriefe aus dem Manuskript ableiten.
        // Rückgabe: { characters: [{name, role, age, kind, look, clothing, colors, quirk}] }
        async suggestCharacters(project) {
            const prompt = app.studio.prompts.buildSuggestCharactersPrompt(project);
            return callTextWithFallback(prompt, 'Gemini nicht erreichbar - Mistral eingesprungen (Figuren)');
        },

        // Stufe 5 – Bildideen (Stichworte) fürs Storyboard, AUSDRÜCKLICH
        // ohne Bildaufruf (Konzept D.4). Rückgabe: { sketches: ["...", ...] }
        async suggestSketches(project) {
            const prompt = app.studio.prompts.buildSuggestSketchesPrompt(project);
            return callTextWithFallback(prompt, 'Gemini nicht erreichbar - Mistral eingesprungen (Bildideen)');
        },

        // NEU: Stufe 1 – restliche Felder (Titel/Ton/Botschaft/Autor/Verlag/
        // Klappentext) direkt per API aus dem Thema ableiten, statt nur über
        // den kostenlosen Master-Prompt-Copy-Paste-Weg. Rückgabe:
        // { title, tone, message, authorBio, publisher, blurb }
        async suggestBrief(topic, audienceAge, readingLevel) {
            const prompt = app.studio.prompts.buildSuggestBriefPrompt(topic, audienceAge, readingLevel);
            return callTextWithFallback(prompt, 'Gemini nicht erreichbar - Mistral eingesprungen (Ausfüllen)');
        },

        // NEU (Ausbaustufe 4 - Arbeitsheft): Stufe 4' – Progression.
        // Rückgabe: { chapters: [{title, goal, pages: [{goal, kind}]}] }
        async generateWorksheetPlan(worksheet) {
            const prompt = app.studio.prompts.buildProgressionPrompt(worksheet);
            return callTextWithFallback(prompt, 'Gemini nicht erreichbar - Mistral eingesprungen (Progression)');
        },

        // Stufe 5' – Aufgabenbaukasten (Arbeitsheft), ein Aufruf pro
        // Kapitel. Rückgabe: { pages: [{tasks: [...]}] }
        async generateChapterTasks(worksheet, chapter) {
            const prompt = app.studio.prompts.buildChapterTasksPrompt(worksheet, chapter);
            return callTextWithFallback(prompt, 'Gemini nicht erreichbar - Mistral eingesprungen (Aufgaben)');
        },

        // Differenzierung (Arbeitsheft): dieselbe Aufgabe auf einem anderen
        // Niveau. Rückgabe: {instruction, explanation, data, solution}
        async generateTaskLevel(worksheet, chapter, task, targetLevel) {
            const prompt = app.studio.prompts.buildTaskLevelPrompt(worksheet, chapter, task, targetLevel);
            return callTextWithFallback(prompt, 'Gemini nicht erreichbar - Mistral eingesprungen (Niveau)');
        }
    }
});
