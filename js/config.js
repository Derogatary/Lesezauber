import { app } from './core.js';

// Neue Erzähler-Persona hinzufügen?
// Einfach hier einen Eintrag ergänzen - taucht automatisch im
// Einstellungen-Dropdown auf UND wird von der KI genutzt.
// Weder HTML noch api.js müssen dafür angefasst werden.
//
// Zwei verschiedene Anweisungen pro Persona:
// - instruction: wie die KI den Text SCHREIBT (Wortwahl, Tonfall im Text)
// - ttsStyle:    wie die KI-Stimme ihn SPRICHT (Tempo, Lautstärke, Gefühl)
// NEU: ttsStyle ist optional - fehlt es, wird instruction genutzt. Wirkt
// nur bei Anbietern, die Sprech-Anweisungen verstehen (Gemini, OpenAI),
// und nur wenn in den Einstellungen "Stimme an Erzähler-Persona anpassen"
// eingeschaltet ist.
app.personas = [
    {
        id: 'standard', label: 'Standard (Neutral & Freundlich)',
        instruction: 'Du bist freundlich und neutral.',
        ttsStyle: 'Sprich freundlich, klar und in ruhigem Tempo, wie beim Vorlesen am Abend.'
    },
    {
        id: 'papa', label: 'Lustiger Papa',
        instruction: 'Du bist ein lustiger, gemütlicher Papa.',
        ttsStyle: 'Sprich gemütlich und warm, mit einem Schmunzeln in der Stimme und kleinen spielerischen Betonungen.'
    },
    {
        id: 'professor', label: 'Weiser Professor',
        instruction: 'Du bist ein weiser Professor.',
        ttsStyle: 'Sprich bedächtig und deutlich, mit ruhiger, tiefer Stimme und kleinen Pausen vor wichtigen Wörtern.'
    },
    {
        id: 'freund', label: 'Beste Freundin',
        instruction: 'Du bist die beste Freundin, sehr motivierend.',
        ttsStyle: 'Sprich lebhaft und begeistert, als würdest du einer Freundin etwas Spannendes erzählen.'
    },
    {
        id: 'fee', label: 'Gute-Nacht-Fee',
        instruction: 'Du bist eine sanfte Gute-Nacht-Fee.',
        ttsStyle: 'Sprich sehr sanft, leise und langsam, fast flüsternd, mit langen ruhigen Pausen - zum Einschlafen.'
    }
];

// NEU: Buchart. "Geschichte" ist das klassische Vorlesebuch (unverändertes
// Verhalten), "Übungsheft" sind Arbeitsblätter zum Mitmachen - dort fragt
// die KI nach Aufgabenstellung/Hilfe/Lösung statt nach Erzähltext und
// Rätselfrage. Eine neue Art hier zu ergänzen reicht NICHT aus, sie
// braucht auch einen eigenen Prompt in js/api.js - anders als bei den
// Personas ist das also kein reiner Konfigurations-Eintrag.
app.bookTypes = [
    { id: 'story',    label: 'Geschichte', icon: '📖', hint: 'Bilderbuch zum Vorlesen' },
    { id: 'workbook', label: 'Übungsheft', icon: '📝', hint: 'Arbeitsblätter zum Mitmachen' }
];
