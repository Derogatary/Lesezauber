import { app } from './core.js';

// Neue Erzähler-Persona hinzufügen?
// Einfach hier einen Eintrag ergänzen - taucht automatisch im
// Einstellungen-Dropdown auf UND wird von der KI genutzt.
// Weder HTML noch api.js müssen dafür angefasst werden.
app.personas = [
    { id: 'standard',  label: 'Standard (Neutral & Freundlich)', instruction: 'Du bist freundlich und neutral.' },
    { id: 'papa',      label: 'Lustiger Papa',                   instruction: 'Du bist ein lustiger, gemütlicher Papa.' },
    { id: 'professor', label: 'Weiser Professor',                instruction: 'Du bist ein weiser Professor.' },
    { id: 'freund',    label: 'Beste Freundin',                  instruction: 'Du bist die beste Freundin, sehr motivierend.' },
    { id: 'fee',       label: 'Gute-Nacht-Fee',                  instruction: 'Du bist eine sanfte Gute-Nacht-Fee.' }
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
