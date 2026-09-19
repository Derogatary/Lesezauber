import { app } from '../core.js';
import './imageFormats.js';

// ================= SchreibZauber: Comic-Panel-Layout & Zusammensetzen =================
// Antwort auf Nutzer-Feedback: "Wenn es einfach nur eine Bilderreihenfolge
// ist, ist es ja einfach ein Bilderbuch." Eine Comic-Seite besteht deshalb
// jetzt aus 1-4 EINZELN generierten Panel-Bildern (spread.panels[], siehe
// studioCore.js applyComicScript()), die HIER zu einer fertigen Seite
// zusammengesetzt werden - inklusive Panel-Rahmen und Weißraum dazwischen,
// wie bei einem echten (amerikanischen/europäischen) Comic. Webtoon/Manga
// wären eigene Layout-Logiken (anderes Seitenverhältnis, anderer
// Lesefluss) - laut Auftrag bewusst NICHT jetzt, erst wenn der
// Comic-Pfad steht.
//
// Bewusst NUR eine kleine, feste Auswahl an Seitenlayouts (1-4 Panels)
// statt der im Konzept angedachten 10-15 Vorlagen mit Wichtigkeits-Tagging
// (docs/KONZEPT-Comic.md Abschnitt 6, DORT selbst noch nicht entworfen) -
// deckt die allermeisten Kinderbuch-Comic-Seiten ab, ohne dieses größere,
// noch offene Konzept vorwegzunehmen.

const GUTTER_FRACTION = 0.015; // Weißraum zwischen Panels, relativ zur Seitenbreite/-höhe

// Jede Region in 0..1-Koordinaten relativ zur GANZEN Seite.
const LAYOUTS = {
    1: [{ x: 0, y: 0, w: 1, h: 1 }],
    2: [{ x: 0, y: 0, w: 1, h: 0.5 }, { x: 0, y: 0.5, w: 1, h: 0.5 }],
    3: [
        { x: 0, y: 0, w: 1, h: 0.55 },
        { x: 0, y: 0.55, w: 0.5, h: 0.45 },
        { x: 0.5, y: 0.55, w: 0.5, h: 0.45 }
    ],
    4: [
        { x: 0, y: 0, w: 0.5, h: 0.5 }, { x: 0.5, y: 0, w: 0.5, h: 0.5 },
        { x: 0, y: 0.5, w: 0.5, h: 0.5 }, { x: 0.5, y: 0.5, w: 0.5, h: 0.5 }
    ]
};

function layoutFor(panelCount) {
    const n = Math.min(Math.max(panelCount, 1), 4);
    return LAYOUTS[n];
}

function loadImageFromUrl(src) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = () => reject(new Error('Panel-Bild konnte nicht geladen werden.'));
        img.src = src;
    });
}

// "cover"-Zuschnitt - dasselbe Prinzip wie beim randabfallenden Druck
// (object-fit:cover): jedes Panel-Bild wird immer im selben Format
// ("comicPanel", 4:3) erzeugt, unabhängig von seiner späteren Zielform,
// und hier passend zugeschnitten statt verzerrt gestreckt.
function drawCover(ctx, img, x, y, w, h) {
    const scale = Math.max(w / img.naturalWidth, h / img.naturalHeight);
    const sw = w / scale, sh = h / scale;
    const sx = (img.naturalWidth - sw) / 2, sy = (img.naturalHeight - sh) / 2;
    ctx.drawImage(img, sx, sy, sw, sh, x, y, w, h);
}

// Baut aus den einzelnen Panel-Bildern EIN Seitenbild (Canvas), OHNE
// Sprechblasen - das bleibt die "saubere" Fassung (siehe
// bakePageWithBalloons() unten für die Fassung MIT Text).
// NEU (KDP-Hochauflösend-Umschalter): targetWidth (optional) überschreibt die
// sonst feste Canvas-Breite aus dem Formatkatalog (genW) - die Höhe bleibt
// im selben Seitenverhältnis wie comicPage (siehe imageFormats.js). Ein
// größerer Ziel-Canvas kostet HIER nichts Zusätzliches (reines
// Zusammensetzen bereits vorhandener Panel-Bilder), im Gegensatz zu einer
// höheren Bildgenerierungs-Auflösung.
async function compositeCanvas(spread, targetWidth) {
    const fmt = app.studio.formats.get('comicPage');
    const w = targetWidth || fmt.genW;
    const h = targetWidth ? Math.round(targetWidth * fmt.genH / fmt.genW) : fmt.genH;
    const layout = layoutFor(spread.panels.length);

    const canvas = document.createElement('canvas');
    canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, w, h);

    for (let i = 0; i < spread.panels.length; i++) {
        const panel = spread.panels[i];
        const region = layout[i];
        if (!region || !panel.imgUrl) continue;
        const img = await loadImageFromUrl(panel.imgUrl);
        const gutterX = GUTTER_FRACTION * w, gutterY = GUTTER_FRACTION * h;
        const rx = region.x * w + gutterX / 2, ry = region.y * h + gutterY / 2;
        const rw = region.w * w - gutterX, rh = region.h * h - gutterY;
        drawCover(ctx, img, rx, ry, rw, rh);
        ctx.strokeStyle = '#1e293b';
        ctx.lineWidth = w * 0.004;
        ctx.strokeRect(rx, ry, rw, rh);
    }
    return canvas;
}

// Zusammengesetzte Seite als fertiges { imgUrl, thumbUrl } (WebP, zwei
// Größen) - dieselbe Verkleinerungsfunktion wie bei jedem anderen Bild
// (app.utils.createImageVariants), damit Speicherverbrauch/Format
// konsistent bleiben.
async function compositePage(spread, targetWidth) {
    if (!spread.panels.every(p => p.imgUrl)) return null;
    const canvas = await compositeCanvas(spread, targetWidth);
    return app.utils.createImageVariants(canvas, canvas.width, canvas.height);
}

// ===== Sprechblasen fest ins Bild zeichnen (Canvas) =====
// Zweite, bewusste Ausnahme von der sonst überall geltenden Regel "Text nie
// ins Bild brennen" (siehe js/studio/studioLayout.js/studioBalloons.js) -
// bei echten Comics/Mangas SIND die Sprechblasen Teil der Kunst, genau wie
// bei den Vorbildern (siehe docs/KONZEPT-Comic.md, ComiXology/Manga-
// Reader-Recherche). Der reine Dialogtext bleibt ZUSÄTZLICH als Klartext
// erhalten (spreadReadableText() in studioExport.js), damit Vorlesen und
// eine spätere Übersetzung weiterhin ohne Neuzeichnen funktionieren - siehe
// die "clean vs. mit Sprechblase"-Umschaltung beim Export.

function wrapCanvasText(ctx, text, maxWidth) {
    const words = String(text || '').split(/\s+/).filter(Boolean);
    const lines = [];
    let line = '';
    words.forEach(word => {
        const test = line ? `${line} ${word}` : word;
        if (ctx.measureText(test).width > maxWidth && line) {
            lines.push(line);
            line = word;
        } else {
            line = test;
        }
    });
    if (line) lines.push(line);
    return lines;
}

function roundRectPath(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
}

function drawTail(ctx, tail, bx, by, bw, bh, size) {
    const t = tail || 'unten-links';
    ctx.beginPath();
    if (t === 'unten-links') {
        ctx.moveTo(bx + size, by + bh); ctx.lineTo(bx + size * 2.4, by + bh); ctx.lineTo(bx + size * 0.6, by + bh + size * 1.4);
    } else if (t === 'unten-rechts') {
        ctx.moveTo(bx + bw - size * 2.4, by + bh); ctx.lineTo(bx + bw - size, by + bh); ctx.lineTo(bx + bw - size * 0.6, by + bh + size * 1.4);
    } else if (t === 'oben-links') {
        ctx.moveTo(bx + size, by); ctx.lineTo(bx + size * 2.4, by); ctx.lineTo(bx + size * 0.6, by - size * 1.4);
    } else {
        ctx.moveTo(bx + bw - size * 2.4, by); ctx.lineTo(bx + bw - size, by); ctx.lineTo(bx + bw - size * 0.6, by - size * 1.4);
    }
    ctx.closePath();
    ctx.fillStyle = '#ffffff';
    ctx.fill();
    ctx.stroke();
}

// balloon.x/y/w sind PROZENT relativ zur PANEL-Fläche (nicht zur ganzen
// Seite) - region ist die 0..1-Fläche dieses Panels auf der Gesamtseite
// (siehe layoutFor()), w/h die Seitenmaße in Pixeln.
function drawBalloon(ctx, balloon, region, w, h) {
    const px = region.x * w, py = region.y * h, pw = region.w * w, ph = region.h * h;
    const bx = px + (balloon.x / 100) * pw;
    const by = py + (balloon.y / 100) * ph;
    const bw = (balloon.w / 100) * pw;

    const fontSize = Math.max(16, w * 0.02);
    ctx.font = `${fontSize}px system-ui, sans-serif`;
    const innerWidth = bw - fontSize * 1.6;
    const lines = wrapCanvasText(ctx, balloon.text, innerWidth);
    const lineHeight = fontSize * 1.35;
    const speakerHeight = balloon.speaker ? fontSize * 1.3 : 0;
    const bh = speakerHeight + lines.length * lineHeight + fontSize * 0.8;

    ctx.lineWidth = fontSize * 0.1;
    ctx.strokeStyle = '#1e293b';
    drawTail(ctx, balloon.tail, bx, by, bw, bh, fontSize * 0.9);

    ctx.fillStyle = '#ffffff';
    roundRectPath(ctx, bx, by, bw, bh, fontSize * 0.7);
    ctx.fill();
    ctx.stroke();

    let ty = by + fontSize * 0.9;
    if (balloon.speaker) {
        ctx.font = `bold ${fontSize * 0.78}px system-ui, sans-serif`;
        ctx.fillStyle = '#4f46e5';
        ctx.fillText(balloon.speaker, bx + fontSize * 0.8, ty);
        ty += speakerHeight;
    }
    ctx.font = `${fontSize}px system-ui, sans-serif`;
    ctx.fillStyle = '#1e293b';
    lines.forEach(line => {
        ctx.fillText(line, bx + fontSize * 0.8, ty);
        ty += lineHeight;
    });
}

// NEU: Geräuschwort (Manga-/Comic-Lautmalerei, z.B. "BUMM") - eigener,
// auffälliger Stil (schräg, dick, gelb mit dunklem Umriss), grob in der
// oberen rechten Ecke des Panels platziert. Keine automatische
// Kollisionsvermeidung mit Sprechblasen - bei sehr vollen Panels kann es zu
// Überlappung kommen, das Geräuschwort ist bewusst die niedriger
// priorisierte, optionale Ebene (siehe project.comicShowSoundEffects).
function drawSoundEffect(ctx, text, region, w, h) {
    const px = region.x * w, py = region.y * h, pw = region.w * w, ph = region.h * h;
    const fontSize = Math.max(22, pw * 0.11);
    ctx.save();
    ctx.translate(px + pw * 0.7, py + ph * 0.22);
    ctx.rotate(-0.12);
    ctx.font = `italic 900 ${fontSize}px system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.lineWidth = fontSize * 0.16;
    ctx.strokeStyle = '#1e293b';
    ctx.fillStyle = '#fde047';
    ctx.strokeText(text, 0, 0);
    ctx.fillText(text, 0, 0);
    ctx.restore();
}

// Baut die komplette, fertige Comic-Seite MIT eingebrannten Sprechblasen
// (IMMER, siehe js/studio/studioExport.js toLibraryBook() - Sprechblasen
// sind keine Export-Entscheidung mehr, deren Sichtbarkeit wird im Reader
// umgeschaltet) und optional den Geräuschwörtern (options.showSoundEffects,
// siehe project.comicShowSoundEffects) - dieselbe zusammengesetzte Seite
// wie compositePage(), nur zusätzlich überzeichnet.
async function bakePageWithBalloons(spread, options = {}) {
    if (!spread.panels.every(p => p.imgUrl)) return null;
    const canvas = await compositeCanvas(spread, options.targetWidth);
    const w = canvas.width, h = canvas.height;
    const ctx = canvas.getContext('2d');
    const layout = layoutFor(spread.panels.length);
    spread.panels.forEach((panel, i) => {
        const region = layout[i];
        if (!region) return;
        if (options.showSoundEffects && panel.soundEffect) drawSoundEffect(ctx, panel.soundEffect, region, w, h);
        (panel.balloons || []).forEach(b => drawBalloon(ctx, b, region, w, h));
    });
    return app.utils.createImageVariants(canvas, w, h);
}

app.studio.comicPanels = {
    layoutFor,
    compositePage,
    bakePageWithBalloons
};
