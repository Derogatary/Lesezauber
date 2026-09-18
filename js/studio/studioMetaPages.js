import { app } from '../core.js';
import './imageFormats.js';

// ================= SchreibZauber: Meta-Seiten (Titel/Klappentext/Autor) =================
// Bugreport: ein "Ins Regal gestelltes" Werk bestand bisher NUR aus den
// Geschichte-Doppelseiten - kein Cover, kein Klappentext, keine Autorenseite,
// obwohl der Reader (siehe CLAUDE.md Datenmodell, titlePageId/backCoverPageId/
// authorBioPageId) das für gescannte Bücher längst alles kann. Dieses Modul
// baut die drei fehlenden Seiten NACHTRÄGLICH aus project.brief/project.meta
// (Stufe 1, siehe js/studio/studioCore.js saveBrief()) - mit einem
// freundlichen Platzhaltertext für jedes leer gelassene Feld, statt eine
// Seite wegzulassen oder eine Lücke zu zeigen (Auftrag: "Platzhalter für
// nicht gegebene Infos"). app.studio.export (studioExport.js) ruft
// buildMetaPages() einmal auf und fügt die drei Seiten selbst ins Buch ein.
//
// Bewusst über Canvas gezeichnet, genau wie die Platzhalter (placeholder.js)
// und die Heft-Generator-Blätter (workbookGenerator.js) - dasselbe "eine
// Seite = ein Bild + Text"-Modell, keine Extra-Behandlung im Reader nötig.

function wrapLines(ctx, text, maxWidth) {
    const lines = [];
    let line = '';
    for (const word of String(text || '').split(/\s+/).filter(Boolean)) {
        const test = line ? `${line} ${word}` : word;
        if (ctx.measureText(test).width > maxWidth && line) {
            lines.push(line);
            line = word;
        } else {
            line = test;
        }
    }
    if (line) lines.push(line);
    return lines;
}

// Ein Textblock, mittig gesetzt, mit automatischem Zeilenumbruch UND
// Schriftverkleinerung, falls er sonst nicht auf die Seite passen würde -
// bei sehr langen eigenen Klappentexten/Steckbriefen soll nichts abgeschnitten
// werden, lieber etwas kleiner drucken.
function fitParagraph(ctx, text, maxWidth, maxLines, startPx) {
    let px = startPx;
    let lines;
    do {
        ctx.font = `${px}px system-ui, sans-serif`;
        lines = wrapLines(ctx, text, maxWidth);
        px -= 2;
    } while (lines.length > maxLines && px > startPx * 0.5);
    return { lines: lines.slice(0, maxLines), px: px + 2 };
}

// Gemeinsames Gerüst aller drei Seiten: Fläche, optionale Kopfzeile
// (Eyebrow), großer Titel, Fließtext, kleine Fußzeile - reine Textseite,
// kein Bild-Motiv (dafür sind die Doppelseiten selbst da).
function drawTextPage({ w, h, bg, accent, eyebrow, heading, body, footer }) {
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    const unit = Math.sqrt(w * h) / 100;

    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = accent;
    ctx.globalAlpha = 0.6;
    ctx.lineWidth = unit * 0.6;
    ctx.strokeRect(unit * 3, unit * 3, w - unit * 6, h - unit * 6);
    ctx.globalAlpha = 1;

    const maxWidth = w * 0.78;
    ctx.textAlign = 'center';
    let y = h * 0.18;

    if (eyebrow) {
        ctx.font = `bold ${unit * 3}px system-ui, sans-serif`;
        ctx.fillStyle = accent;
        ctx.fillText(eyebrow.toUpperCase(), w / 2, y);
        y += unit * 6;
    }

    if (heading) {
        const { lines, px } = fitParagraph(ctx, heading, maxWidth, 3, unit * 7);
        ctx.font = `bold ${px}px system-ui, sans-serif`;
        ctx.fillStyle = '#1e293b';
        lines.forEach((l) => { ctx.fillText(l, w / 2, y); y += px * 1.25; });
        y += unit * 3;
    }

    if (body) {
        const { lines, px } = fitParagraph(ctx, body, maxWidth, 14, unit * 3.6);
        ctx.font = `${px}px system-ui, sans-serif`;
        ctx.fillStyle = '#334155';
        lines.forEach((l) => { ctx.fillText(l, w / 2, y); y += px * 1.5; });
    }

    if (footer) {
        ctx.font = `italic ${unit * 2.8}px system-ui, sans-serif`;
        ctx.fillStyle = '#64748b';
        ctx.fillText(footer, w / 2, h - unit * 6);
    }

    return canvas;
}

function canvasToPageImage(canvas, w, h) {
    const variants = app.utils.createImageVariants(canvas, w, h);
    return { imgUrl: variants.full, thumbUrl: variants.thumb };
}

app.studio = app.studio || {};
Object.assign(app.studio, {
    // Baut die drei Meta-Seiten fürs "Ins Regal stellen" (studioExport.js).
    // author: bereits aufgelöster Anzeigename (siehe toLibraryBook()).
    // Rückgabe: { title, backCover, authorBio }, jeweils { imgUrl, thumbUrl, text }.
    buildMetaPages(project, author) {
        const fmt = app.studio.formats.get('cover');
        const { genW: w, genH: h } = fmt;
        const meta = project.meta || { authorBio: '', publisher: '', blurb: '' };
        const accent = project.style?.palette?.[0] || '#4f46e5';

        // 1) Titelseite - bewusst schmucklos (nur Titel/Autor), der eigentliche
        // "Buchvorstellung"-Satz (Titel/Autor/Verlag) wird beim Vorlesen ohnehin
        // automatisch aus book.title/author/publisher gebaut (js/tts.js
        // _buildBookIntro()) - diese Seite muss den Text also nicht wiederholen.
        const titleCanvas = drawTextPage({
            w, h, bg: '#fefefe', accent,
            eyebrow: '',
            heading: project.title || 'Unbenanntes Werk',
            body: `von ${author}`,
            footer: meta.publisher ? meta.publisher : ''
        });

        // 2) Rückseite/Klappentext - ohne eigenen Text ein Anreißer aus
        // Botschaft/Thema (Stufe 1), NIE komplett leer.
        const blurbText = meta.blurb
            || project.brief?.message
            || (project.brief?.topic ? `Eine Geschichte über: ${project.brief.topic}` : 'Eine selbst geschriebene Geschichte zum Vorlesen.');
        const backCoverCanvas = drawTextPage({
            w, h, bg: '#fff7ed', accent: '#c2410c',
            eyebrow: "Darum geht's",
            heading: '',
            body: blurbText,
            footer: ''
        });

        // 3) Autorenseite - ohne eigenen Steckbrief ein neutraler Standardtext.
        // Verlagsangabe wandert HIER ins Impressum statt in book.publisher,
        // wenn sie fehlt ("Selbstverlag" als book.publisher würde beim
        // Vorlesen unschön "Aus dem Selbstverlag-Verlag" ergeben, siehe
        // studioExport.js) - book.publisher bleibt deshalb nur bei einer
        // wirklich angegebenen Verlagsangabe gesetzt.
        const authorBioText = meta.authorBio
            || `${author} hat sich diese Geschichte ausgedacht und mit LeseZauber Pro geschrieben.`;
        const imprintLine = meta.publisher ? `Verlag: ${meta.publisher}` : 'Im Selbstverlag mit LeseZauber Pro erstellt.';
        const authorBioCanvas = drawTextPage({
            w, h, bg: '#f0fdf4', accent: '#15803d',
            eyebrow: 'Über die Autorin / den Autor',
            heading: author,
            body: authorBioText,
            footer: imprintLine
        });

        return {
            title: { ...canvasToPageImage(titleCanvas, w, h), text: '' },
            backCover: { ...canvasToPageImage(backCoverCanvas, w, h), text: blurbText },
            authorBio: { ...canvasToPageImage(authorBioCanvas, w, h), text: `${authorBioText}\n\n${imprintLine}` }
        };
    }
});
