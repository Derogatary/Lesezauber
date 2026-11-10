import { app } from '../core.js';
import './studioPrompts.js';

// ================= SchreibZauber: KI-Aufrufe =================
// Die Werkstatt nutzt dieselbe Modellrotation wie der Reader.
const MISTRAL_MODEL = 'mistral-small-latest';

// Gleiche Aufräum-Logik wie js/api.js: manche Modelle wrappen die
// JSON-Antwort trotz Anweisung in ```json ... ``` Markdown-Blöcke.
function parseModelJson(rawText) {
    const cleaned = (rawText || '{}').replace(/^```(json)?\n?/, '').replace(/\n?```$/, '').trim();
    return JSON.parse(cleaned);
}

async function callGeminiText(prompt) {
    const data = await app.api.generateGeminiContent({
        safetySettings: app.api.safetySettingsKids,
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.7, responseMimeType: 'application/json' }
    });
    const { text, finishReason } = app.api.geminiTextResult(data);
    if (!text || finishReason === 'MAX_TOKENS') throw new Error('Gemini hat kein vollständiges Ergebnis geliefert.');
    return parseModelJson(text);
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

        // NEU (v0.46.0-beta): frei geschriebene Teile eines Bild-Prompts ins
        // Englische übersetzen (für Leonardo & Co., js/studio/imageTargets.js).
        // Rückgabe: { scene, style, zone, characters: [..] } - gleiche Form wie rein.
        async translateImagePromptParts(parts) {
            const prompt = `Übersetze die Werte dieses JSON-Objekts ins Englische, für einen Bild-Prompt einer Kinderbuch-Illustration. Namen von Figuren NICHT übersetzen. Leere Werte leer lassen. Antworte NUR mit dem JSON-Objekt in exakt derselben Struktur (gleiche Schlüssel, characters als Array gleicher Länge).\n\n${JSON.stringify(parts)}`;
            return callTextWithFallback(prompt, 'Gemini nicht erreichbar - Mistral eingesprungen (Übersetzung)');
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
