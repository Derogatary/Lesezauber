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
