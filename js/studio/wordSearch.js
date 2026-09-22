import { app } from '../core.js';

// ================= SchreibZauber: Suchsel-Generator (Arbeitsheft) =================
// NEU: Aufgabentyp "Suchsel 🔍" aus Konzept C.4 (docs/KONZEPT-SchreibZauber.md,
// "Stand nach Stufe 4" - dort als "braucht einen Buchstabengitter-Generator,
// eigener kleiner Algorithmus, kein Bildbedarf" zurückgestellt).
//
// Die KI liefert nur die WÖRTER - das Gitter baut die App selbst. Grund:
// ein Sprachmodell zählt Buchstaben/Spalten unzuverlässig, ein von der KI
// "gezeichnetes" Gitter hätte regelmäßig Wörter, die gar nicht (oder nur
// halb) drinstehen. Hier ist garantiert, dass jedes gelistete Wort auch
// wirklich zu finden ist.
//
// Bewusst NUR waagerecht (links -> rechts) und senkrecht (oben -> unten):
// Zielgruppe Grundschule/Vorschule - diagonal oder rückwärts versteckte
// Wörter sind für Erstleser eher frustrierend als lehrreich (siehe CLAUDE.md:
// Kindern gegenüber nie zu hart).
//
// Deterministisch über einen Seed: dieselben Wörter + derselbe Seed ergeben
// IMMER dasselbe Gitter. Das Gitter wird trotzdem mitgespeichert (task.data.
// grid), damit Druck, Reader-Bild und Lösungsteil garantiert übereinstimmen,
// auch falls dieser Algorithmus später einmal geändert wird.

const MIN_SIZE = 6;
// Obergrenze: 10 Zeilen x 46px Zeilenhöhe passen noch mit einer zweiten
// Aufgabe auf eine Arbeitsheftseite (js/studio/worksheetCanvas.js, 1600px).
const MAX_SIZE = 10;
const MAX_WORDS = 8;
const FILLER = 'ABCDEFGHIJKLMNOPRSTUVWZ'; // ohne Q/X/Y - kommen in Kinderwörtern kaum vor und würden nur verwirren

// Kleiner, reproduzierbarer Zufallsgenerator (mulberry32) - Math.random()
// wäre nicht wiederholbar.
function seededRandom(seed) {
    let a = seed >>> 0;
    return () => {
        a = (a + 0x6D2B79F5) >>> 0;
        let t = a;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

// Wörter vereinheitlichen: Großbuchstaben (Druckschrift ist für Erstleser
// leichter), keine Leerzeichen/Satzzeichen, Doppelte raus. ß wird dabei von
// toUpperCase() zu "SS" - bei Druckbuchstaben so üblich.
function normalizeWords(words) {
    const seen = new Set();
    return (Array.isArray(words) ? words : [])
        .map(w => String(w || '').toUpperCase().replace(/[^A-ZÄÖÜ]/g, ''))
        .filter(w => w.length >= 2 && !seen.has(w) && seen.add(w));
}

function fits(grid, word, row, col, dir) {
    for (let i = 0; i < word.length; i++) {
        const r = dir === 'down' ? row + i : row;
        const c = dir === 'right' ? col + i : col;
        const cell = grid[r][c];
        if (cell && cell !== word[i]) return false;
    }
    return true;
}

// Baut das Gitter. Rückgabe: { words, size, grid: ['ABC...', ...], placements:
// [{word, row, col, dir}], skipped: [...] } - "skipped" sind Wörter, die zu
// lang waren oder keinen Platz mehr gefunden haben (sehr selten, nur bei
// vielen langen Wörtern).
function build(rawWords, seed = 1) {
    const normalized = normalizeWords(rawWords);
    // Mehr als MAX_WORDS Wörter werden nicht versteckt, aber gemeldet
    // (skipped) statt stumm weggelassen.
    const all = normalized.slice(0, MAX_WORDS);
    const skipped = [...all.filter(w => w.length > MAX_SIZE), ...normalized.slice(MAX_WORDS)];
    // Ohne Wörter (frisch von Hand angelegte Aufgabe) kein Zufallsgitter.
    if (all.length === 0) return { words: [], size: 0, grid: [], placements: [], skipped };
    // Lange Wörter zuerst platzieren - die kurzen finden danach leichter
    // noch eine Lücke.
    const words = all.filter(w => w.length <= MAX_SIZE).sort((a, b) => b.length - a.length);
    if (words.length === 0) return { words: [], size: 0, grid: [], placements: [], skipped };

    const longest = words.reduce((m, w) => Math.max(m, w.length), 0);
    const letters = words.reduce((s, w) => s + w.length, 0);
    const size = Math.max(MIN_SIZE, Math.min(MAX_SIZE, Math.max(longest + 1, Math.ceil(Math.sqrt(letters * 2.2)))));

    const rand = seededRandom(seed);
    const grid = Array.from({ length: size }, () => new Array(size).fill(''));
    const placements = [];

    words.forEach(word => {
        let placed = false;
        for (let attempt = 0; attempt < 200 && !placed; attempt++) {
            const dir = rand() < 0.5 ? 'right' : 'down';
            const row = Math.floor(rand() * (dir === 'down' ? size - word.length + 1 : size));
            const col = Math.floor(rand() * (dir === 'right' ? size - word.length + 1 : size));
            if (!fits(grid, word, row, col, dir)) continue;
            for (let i = 0; i < word.length; i++) {
                grid[dir === 'down' ? row + i : row][dir === 'right' ? col + i : col] = word[i];
            }
            placements.push({ word, row, col, dir });
            placed = true;
        }
        if (!placed) skipped.push(word);
    });

    // Umlaute nur dann als Füllbuchstaben, wenn ein Wort selbst einen hat -
    // sonst wäre jedes Ä im Gitter sofort ein verräterischer Hinweis.
    const umlauts = [...new Set(words.join('').replace(/[^ÄÖÜ]/g, ''))].join('');
    const filler = FILLER + umlauts;
    const rows = grid.map(row => row.map(cell => cell || filler[Math.floor(rand() * filler.length)]).join(''));

    // Wortliste für das Kind in der ursprünglichen (nicht nach Länge
    // sortierten) Reihenfolge, nur tatsächlich versteckte Wörter.
    // Lösung ebenfalls in der Reihenfolge der Wortliste, nicht nach Länge.
    placements.sort((a, b) => all.indexOf(a.word) - all.indexOf(b.word));
    return {
        words: placements.map(p => p.word),
        size,
        grid: rows,
        placements,
        skipped
    };
}

// Lösungstext für den Lösungsteil am Heftende - kindgerecht gezählt ab 1,
// damit ein Erwachsener beim Nachschauen schnell die Stelle findet.
function solutionText(placements) {
    return (placements || [])
        .map(p => `${p.word} (Zeile ${p.row + 1}, Spalte ${p.col + 1}, ${p.dir === 'right' ? 'waagerecht' : 'senkrecht'})`)
        .join(' · ');
}

// Komplettes, gespeichertes Datenobjekt für task.data - EINE Stelle, die
// sowohl beim KI-Import (sanitizeTaskData) als auch beim Bearbeiten von Hand
// (updateTaskData/reshuffleWordSearch) genutzt wird.
function buildTaskData(rawWords, seed = 1) {
    const result = build(rawWords, seed);
    return {
        words: result.words,
        seed,
        size: result.size,
        grid: result.grid,
        placements: result.placements,
        skipped: result.skipped
    };
}

Object.assign(app.studio, {
    wordSearch: { build, buildTaskData, solutionText, normalizeWords }
});
