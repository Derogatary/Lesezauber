import { app } from '../core.js';
import './studioPrompts.js';

// ================= SchreibZauber: KI-Aufrufe =================
// Die Werkstatt nutzt dieselbe Modellrotation wie der Reader.

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

Object.assign(app.studio, {
    api: {
        // brief/spec: siehe js/studio/studioCore.js (createDefaultProject).
        // Rückgabe: { title, spreads: [{text, pageTurnHook}] }
        async generateManuscript(brief, spec) {
            const prompt = app.studio.prompts.buildManuscriptPrompt(brief, spec);
            return callGeminiText(prompt);
        },

        // NEU (Ausbaustufe 5): Comic-Gegenstück zu generateManuscript() -
        // Rückgabe: { title, spreads: [{text, pageTurnHook, dialogue: [{speaker, line}]}] }
        async generateComicScript(brief, spec) {
            const prompt = app.studio.prompts.buildComicScriptPrompt(brief, spec);
            return callGeminiText(prompt);
        },

        // Stufe 4 – Figuren-Steckbriefe aus dem Manuskript ableiten.
        // Rückgabe: { characters: [{name, role, age, kind, look, clothing, colors, quirk}] }
        async suggestCharacters(project) {
            const prompt = app.studio.prompts.buildSuggestCharactersPrompt(project);
            return callGeminiText(prompt);
        },

        // Stufe 5 – Bildideen (Stichworte) fürs Storyboard, AUSDRÜCKLICH
        // ohne Bildaufruf (Konzept D.4). Rückgabe: { sketches: ["...", ...] }
        async suggestSketches(project) {
            const prompt = app.studio.prompts.buildSuggestSketchesPrompt(project);
            return callGeminiText(prompt);
        },

        // NEU (v0.46.0-beta): frei geschriebene Teile eines Bild-Prompts ins
        // Englische übersetzen (für Leonardo & Co., js/studio/imageTargets.js).
        // Rückgabe: { scene, style, zone, characters: [..] } - gleiche Form wie rein.
        async translateImagePromptParts(parts) {
            const prompt = `Übersetze die Werte dieses JSON-Objekts ins Englische, für einen Bild-Prompt einer Kinderbuch-Illustration. Namen von Figuren NICHT übersetzen. Leere Werte leer lassen. Antworte NUR mit dem JSON-Objekt in exakt derselben Struktur (gleiche Schlüssel, characters als Array gleicher Länge).\n\n${JSON.stringify(parts)}`;
            return callGeminiText(prompt);
        },

        // NEU: Stufe 1 – restliche Felder (Titel/Ton/Botschaft/Autor/Verlag/
        // Klappentext) direkt per API aus dem Thema ableiten, statt nur über
        // den kostenlosen Master-Prompt-Copy-Paste-Weg. Rückgabe:
        // { title, tone, message, authorBio, publisher, blurb }
        async suggestBrief(topic, audienceAge, readingLevel) {
            const prompt = app.studio.prompts.buildSuggestBriefPrompt(topic, audienceAge, readingLevel);
            return callGeminiText(prompt);
        },

        // NEU (Ausbaustufe 4 - Arbeitsheft): Stufe 4' – Progression.
        // Rückgabe: { chapters: [{title, goal, pages: [{goal, kind}]}] }
        async generateWorksheetPlan(worksheet) {
            const prompt = app.studio.prompts.buildProgressionPrompt(worksheet);
            return callGeminiText(prompt);
        },

        // Stufe 5' – Aufgabenbaukasten (Arbeitsheft), ein Aufruf pro
        // Kapitel. Rückgabe: { pages: [{tasks: [...]}] }
        async generateChapterTasks(worksheet, chapter) {
            const prompt = app.studio.prompts.buildChapterTasksPrompt(worksheet, chapter);
            return callGeminiText(prompt);
        },

        // Differenzierung (Arbeitsheft): dieselbe Aufgabe auf einem anderen
        // Niveau. Rückgabe: {instruction, explanation, data, solution}
        async generateTaskLevel(worksheet, chapter, task, targetLevel) {
            const prompt = app.studio.prompts.buildTaskLevelPrompt(worksheet, chapter, task, targetLevel);
            return callGeminiText(prompt);
        }
    }
});
