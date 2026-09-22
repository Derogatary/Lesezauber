import { app } from '../core.js';

// ================= SchreibZauber: Arbeitsheft-Druckbild (Stufe 4) =================
// Zeichnet EINE Arbeitsheftseite (bzw. die Lösungsseite am Heftende) auf
// Canvas, damit sie wie jede andere Buchseite ein imgUrl/thumbUrl bekommt
// und im Reader ohne Sonderfall angezeigt werden kann.
//
// WICHTIG: das ist eine EIGENE, unabhängige Umsetzung - keine Wiederver-
// wendung von js/actions/workbookGenerator.js (siehe dortiger Kommentar:
// "andere Datei, anderer Zweck" - dieser Auftrag soll genau diese Datei
// NICHT anfassen oder ihre Logik duplizieren). Die grobe TECHNIK (Canvas,
// weißer Hintergrund, Zeilenumbruch von Hand) ist zwangsläufig ähnlich -
// beide zeichnen am Ende schwarzen Text auf weißem Grund -, der Code selbst
// ist neu geschrieben für das hier andere Datenmodell (mehrere Aufgaben pro
// Seite, Sterne-Niveau, Lösungsseite).
//
// Druckregel (Konzept C.4/CLAUDE.md-Auftrag): rein s/w-tauglich, viel
// Schreibfläche, KEIN Bild nötig - alle fünf in dieser Ausbaustufe gebauten
// Aufgabentypen (Lückentext, Ankreuzen, Rechnen, Zuordnen, Frei schreiben)
// sind reine Text-/Schreibaufgaben. Deshalb kommt hier bewusst kein
// app.studio.imageSource ins Spiel.

const PAGE_W = 1200, PAGE_H = 1600;
const MARGIN_X = 90;
const MAX_WIDTH = PAGE_W - MARGIN_X * 2;

// NEU: Icon-System aus Konzept A.4 Punkt 6 ("Kinder erkennen die Aufgaben-
// art, bevor sie lesen können") - dieselben Symbole wie in
// js/studio/worksheet.js TASK_TYPES, hier nochmal lokal gehalten, damit
// dieses Modul nicht extra von worksheet.js abhängen muss (beide Dateien
// werden ohnehin gemeinsam von main.js geladen, aber lose Kopplung ist
// hier bewusst - reine Anzeige-Konstante, kein Verhalten).
const TASK_ICON = {
    luecke: '✏️', ankreuzen: '☑️', rechnen: '➕', zuordnen: '🔗', frei: '📝', suchsel: '🔍'
};
const STAR_FOR_LEVEL = { 1: '⭐', 2: '⭐⭐', 3: '⭐⭐⭐' };
// NEU (Suchsel): Kästchengröße des Buchstabengitters - 10 Kästchen (Maximum,
// siehe js/studio/wordSearch.js) = 560px, passt bequem in die Seitenbreite.
const GRID_CELL = 56;

function makeCanvas() {
    const canvas = document.createElement('canvas');
    canvas.width = PAGE_W;
    canvas.height = PAGE_H;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, PAGE_W, PAGE_H);
    ctx.fillStyle = '#0f172a'; // fast Schwarz statt reinem #000 - etwas weicher, bleibt aber s/w-druckfest
    ctx.textBaseline = 'top';
    return { canvas, ctx };
}

function wrapLine(ctx, text, font, maxWidth = MAX_WIDTH) {
    ctx.font = font;
    const words = (text || '').split(/\s+/).filter(Boolean);
    const lines = [];
    let line = '';
    words.forEach(word => {
        const test = line + word + ' ';
        if (ctx.measureText(test).width > maxWidth && line !== '') {
            lines.push(line.trim());
            line = word + ' ';
        } else {
            line = test;
        }
    });
    if (line.trim()) lines.push(line.trim());
    return lines;
}

// Baut aus EINER Aufgabe sowohl die auf Canvas gezeichneten Zeilen als auch
// eine reine Text-Fassung (für generatedSheet.body, siehe printBook() in
// js/actions/backup.js - druckt dann scharfen Text statt des Canvas-Bilds).
// Beide Darstellungen entstehen bewusst aus DERSELBEN Zeilen-Liste, damit
// Bildschirm und Ausdruck nie auseinanderlaufen (gleiches Prinzip wie
// drawWorksheetCanvas() in workbookGenerator.js, nur unabhängig gebaut).
function taskToLines(task) {
    const icon = TASK_ICON[task.type] || '📝';
    const lines = [`${icon} ${task.instruction || ''}`];
    const data = task.data || {};

    if (task.type === 'luecke') {
        lines.push(data.sentence || '');
        if (Array.isArray(data.wordBank) && data.wordBank.length) {
            lines.push(`Wortspeicher: ${data.wordBank.join('  ·  ')}`);
        }
    } else if (task.type === 'ankreuzen') {
        lines.push(data.question || '');
        (data.options || []).forEach(opt => lines.push(`☐  ${opt}`));
    } else if (task.type === 'rechnen') {
        (data.problems || []).forEach(p => lines.push(p));
    } else if (task.type === 'zuordnen') {
        const left = data.left || [], right = data.right || [];
        const n = Math.max(left.length, right.length);
        for (let i = 0; i < n; i++) {
            const l = left[i] ? `${i + 1}. ${left[i]}  ___` : '';
            const r = right[i] ? `${String.fromCharCode(97 + i)})  ${right[i]}` : '';
            // Feste Tabulatur-Breite über Leerzeichen - Canvas kennt kein
            // echtes Tabstop, aber bei Monospace-Schrift reicht das für ein
            // sauberes Zwei-Spalten-Bild.
            lines.push(`${l.padEnd(24, ' ')}${r}`);
        }
    } else if (task.type === 'suchsel') {
        // NEU (Suchsel): Gitter als Monospace-Zeilen mit Abstand zwischen den
        // Buchstaben - gleiche Zeilen-Liste für Canvas UND generatedSheet.body,
        // also druckt auch printBook() ein sauberes Gitter. "Finde:" steht
        // unter dem Gitter, damit das Kind die Wörter abhaken kann.
        // Marker wie ___LINE___: auf dem Canvas als Kästchengitter mit großen
        // Buchstaben gezeichnet (siehe drawArbeitsheftPage), im Text als
        // Buchstabenreihe.
        (data.grid || []).forEach(row => lines.push(`___GRIDROW___${row}`));
        if ((data.grid || []).length) lines.push(''); // Luft zwischen Gitter und Wortliste
        if (Array.isArray(data.words) && data.words.length) {
            lines.push(`Finde: ${data.words.map(w => `☐ ${w}`).join('   ')}`);
        }
    } else if (task.type === 'frei') {
        lines.push(data.prompt || '');
        const lineCount = Math.max(2, Math.min(8, data.lines || 4));
        for (let i = 0; i < lineCount; i++) lines.push('___LINE___'); // Platzhalter, wird beim Zeichnen als Schreiblinie erkannt
    }

    lines.push(''); // Abstand zur nächsten Aufgabe
    return lines;
}

// NEU: zeichnet eine ganze Arbeitsheftseite (Kapitelkopf + 1-3 Aufgaben).
// `tasks` sind bereits die AKTIVEN Inhalte des gewählten Niveaus (siehe
// resolveTaskContent() in worksheet.js) - dieses Modul weiß nichts von
// Niveau-Varianten, nur vom fertig aufgelösten Text.
function drawArbeitsheftPage({ chapterTitle, pageGoal, pageNumber, tasks }) {
    const { canvas, ctx } = makeCanvas();
    let y = 80;
    const bodyLines = []; // für generatedSheet.body

    // Kopfzeile: Kapitel + Seitenziel, klein und dezent - der eigentliche
    // Blickfang sind die Aufgaben, nicht die Überschrift (anders als beim
    // Bilderbuch-Cover).
    const headingFont = 'bold 40px sans-serif';
    ctx.font = headingFont;
    ctx.fillText(chapterTitle, MARGIN_X, y);
    y += 50;
    if (pageGoal) {
        ctx.font = 'italic 26px sans-serif';
        ctx.fillStyle = '#475569';
        wrapLine(ctx, pageGoal, 'italic 26px sans-serif').forEach(line => {
            ctx.fillText(line, MARGIN_X, y);
            y += 32;
        });
        ctx.fillStyle = '#0f172a';
    }
    y += 20;
    ctx.strokeStyle = '#cbd5e1';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(MARGIN_X, y); ctx.lineTo(PAGE_W - MARGIN_X, y); ctx.stroke();
    y += 40;

    const taskFont = '32px sans-serif';
    const bodyFont = '34px monospace';
    const lineHeight = 46;

    tasks.forEach((task, idx) => {
        // Sterne-Niveau oben rechts am Aufgabenblock - rein informativ fürs
        // Kind/den Erwachsenen, keine Wertung (siehe CLAUDE.md: Kindern
        // gegenüber nie hart formulieren - hier ist es aber nur ein
        // neutraler Schwierigkeitsgrad, keine Rückmeldung zu einer Antwort).
        const stars = STAR_FOR_LEVEL[task.level] || STAR_FOR_LEVEL[2];
        ctx.font = '28px sans-serif';
        const starsWidth = ctx.measureText(stars).width;
        ctx.fillText(stars, PAGE_W - MARGIN_X - starsWidth, y);

        const lines = taskToLines(task);
        lines.forEach((rawLine, lineIdx) => {
            if (rawLine === '') { y += lineHeight * 0.6; bodyLines.push(''); return; }
            if (rawLine.startsWith('___GRIDROW___')) {
                // NEU (Suchsel): eine Gitterzeile als Kästchen - große,
                // fette Druckbuchstaben, damit Kinder sie gut einkreisen können.
                const letters = rawLine.slice('___GRIDROW___'.length).split('');
                const cell = GRID_CELL;
                ctx.lineWidth = 2;
                ctx.strokeStyle = '#94a3b8';
                ctx.font = 'bold 36px sans-serif';
                ctx.textAlign = 'center';
                letters.forEach((ch, i) => {
                    const x = MARGIN_X + i * cell;
                    ctx.strokeRect(x, y, cell, cell);
                    ctx.fillText(ch, x + cell / 2, y + (cell - 36) / 2 + 2);
                });
                ctx.textAlign = 'left';
                ctx.strokeStyle = '#cbd5e1';
                y += cell;
                bodyLines.push(letters.join(' '));
                return;
            }
            if (rawLine === '___LINE___') {
                // Schreiblinie fürs freie Schreiben - ausreichend
                // Schreibfläche ist die ausdrückliche Druckregel dieser
                // Ausbaustufe.
                ctx.beginPath();
                ctx.moveTo(MARGIN_X, y + 34);
                ctx.lineTo(PAGE_W - MARGIN_X, y + 34);
                ctx.stroke();
                y += lineHeight;
                bodyLines.push('_______________________________________________');
                return;
            }
            const font = lineIdx === 0 ? `bold ${taskFont}` : bodyFont;
            wrapLine(ctx, rawLine, font).forEach(wrapped => {
                ctx.font = font;
                ctx.fillText(wrapped, MARGIN_X, y);
                y += lineHeight;
                bodyLines.push(wrapped);
            });
        });
        y += 20;
    });

    // Fußzeile: Seitenzahl - klein, damit Kinder ihr Heft sortiert halten
    // können, ohne den Druck optisch zu dominieren.
    ctx.font = '22px sans-serif';
    ctx.fillStyle = '#94a3b8';
    ctx.fillText(`Seite ${pageNumber}`, MARGIN_X, PAGE_H - 50);
    ctx.fillStyle = '#0f172a';

    return { canvas, heading: chapterTitle, body: bodyLines };
}

// NEU: Lösungsseite(n) am Heftende (Konzept C.4 "Selbstkontrolle"). Wird
// automatisch aus den bereits generierten task.solution-Feldern gebaut -
// dafür ist KEIN eigener KI-Aufruf nötig, die Lösung stand schon beim
// Erzeugen der Aufgabe fest (siehe worksheet.js generateChapterTasks()).
function drawSolutionPage({ entries, partNumber, totalParts }) {
    const { canvas, ctx } = makeCanvas();
    let y = 80;
    const bodyLines = [];

    const headingText = totalParts > 1 ? `Lösungen (${partNumber}/${totalParts})` : 'Lösungen';
    ctx.font = 'bold 44px sans-serif';
    ctx.fillText(headingText, MARGIN_X, y);
    y += 60;
    ctx.font = '24px sans-serif';
    ctx.fillStyle = '#475569';
    ctx.fillText('Zum Selbstkontrollieren - kein Muss, aber schön zum Nachschauen!', MARGIN_X, y);
    ctx.fillStyle = '#0f172a';
    y += 55;

    const labelFont = 'bold 30px sans-serif';
    const solutionFont = '30px monospace';

    entries.forEach(entry => {
        wrapLine(ctx, entry.label, labelFont).forEach(line => {
            ctx.font = labelFont;
            ctx.fillText(line, MARGIN_X, y);
            y += 38;
            bodyLines.push(line);
        });
        const solutionText = entry.solution && entry.solution.trim() ? entry.solution : '(freies Schreiben - es gibt keine feste Lösung)';
        wrapLine(ctx, solutionText, solutionFont).forEach(line => {
            ctx.font = solutionFont;
            ctx.fillText(line, MARGIN_X + 30, y);
            y += 40;
            bodyLines.push(`  ${line}`);
        });
        y += 20;
        bodyLines.push('');
    });

    return { canvas, heading: headingText, body: bodyLines };
}

Object.assign(app.studio, {
    worksheetCanvas: { drawArbeitsheftPage, drawSolutionPage }
});
