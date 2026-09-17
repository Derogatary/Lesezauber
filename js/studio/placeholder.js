import { app } from '../core.js';
import './imageFormats.js';

// NEU: Erzeugt ein Platzhalter-Bild in EXAKT der Größe, die später das echte
// Bild hat. Warum das wichtig ist: So lässt sich das komplette Buch (Layout,
// Textplatzierung, Blättern, Druckvorschau) fertig bauen und beurteilen,
// BEVOR ein einziger - kostenpflichtiger - Bildaufruf passiert. Wird der
// Platzhalter später ersetzt, springt nichts, weil die Maße identisch sind.
//
// Der Platzhalter sieht bewusst NICHT nach Kunst aus (Schraffur, Rahmen,
// Beschriftung), damit er im fertigen Werk nie versehentlich stehenbleibt.

// Feste Farbpaare (Hintergrund / Linien), damit aufeinanderfolgende Seiten
// unterscheidbar sind - rein optische Orientierungshilfe im Daumenkino.
const TINTS = [
    ['#eef2ff', '#a5b4fc'], ['#fef3c7', '#fcd34d'], ['#dcfce7', '#86efac'],
    ['#fae8ff', '#e9a5f1'], ['#e0f2fe', '#7dd3fc'], ['#ffe4e6', '#fda4af']
];

// FIX: Lange Formatnamen liefen vorher aus dem Bild heraus. Schrift so weit
// verkleinern, bis der Titel in die verfügbare Breite passt.
function fitFont(ctx, text, maxWidth, startPx, weight = 'bold') {
    let px = startPx;
    ctx.font = `${weight} ${px}px system-ui, sans-serif`;
    while (ctx.measureText(text).width > maxWidth && px > startPx * 0.45) {
        px -= startPx * 0.05;
        ctx.font = `${weight} ${px}px system-ui, sans-serif`;
    }
}

// Text auf dem Canvas umbrechen - canvas kann das nicht von selbst.
function wrapText(ctx, text, maxWidth) {
    const lines = [];
    let line = '';
    for (const word of String(text).split(/\s+/)) {
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

app.studio = app.studio || {};
app.studio.placeholder = {
    // formatId: Schlüssel aus imageFormats.js
    // options: { title, note, index, showTextZone }
    // Rückgabe: { full, thumb, meta } - dieselbe Form wie bei einem echten
    // Bild, damit der restliche Code keinen Unterschied kennt.
    create(formatId, options = {}) {
        const fmt = app.studio.formats.get(formatId);
        if (!fmt) return null;

        try {
            const { genW: w, genH: h } = fmt;
            const canvas = document.createElement('canvas');
            canvas.width = w;
            canvas.height = h;
            const ctx = canvas.getContext('2d');

            const [bg, fg] = TINTS[(options.index ?? 0) % TINTS.length];
            // FIX: Maßeinheit über das geometrische Mittel statt über die kürzere
            // Seite. Bei sehr breiten Formaten (Kopfleiste 4:1) wurde die Schrift
            // sonst unlesbar klein, weil sie an der geringen Höhe hing.
            const unit = Math.sqrt(w * h) / 100;
            const isWide = w / h >= 2.5;   // Kopfleisten brauchen ein flaches Layout

            // Grundfläche
            ctx.fillStyle = bg;
            ctx.fillRect(0, 0, w, h);

            // Diagonale Schraffur - das klare "das ist noch kein Bild"-Signal
            ctx.strokeStyle = fg;
            ctx.globalAlpha = 0.35;
            ctx.lineWidth = unit * 0.4;
            const step = unit * 6;
            for (let x = -h; x < w; x += step) {
                ctx.beginPath();
                ctx.moveTo(x, 0);
                ctx.lineTo(x + h, h);
                ctx.stroke();
            }
            ctx.globalAlpha = 1;

            // Rahmen
            ctx.strokeStyle = fg;
            ctx.lineWidth = unit * 0.8;
            ctx.strokeRect(unit, unit, w - unit * 2, h - unit * 2);

            // Textzone markieren: dieselbe Zone, die der Bild-Prompt später
            // freihalten lässt. So sieht man beim Layouten sofort, ob der
            // Text an der geplanten Stelle überhaupt Platz hat.
            // FIX: Die Zone endet jetzt oberhalb der Fußzeile (vorher lief die
            // Beschriftung "PLATZHALTER" mitten durch die gestrichelte Linie).
            if (options.showTextZone !== false && fmt.textZone !== 'keine' && !isWide) {
                const zoneH = h * 0.28;
                const zoneY = h - zoneH - unit * 8;
                ctx.setLineDash([unit * 2, unit * 1.5]);
                ctx.lineWidth = unit * 0.5;
                ctx.strokeStyle = '#475569';
                ctx.globalAlpha = 0.5;
                ctx.strokeRect(unit * 4, zoneY, w - unit * 8, zoneH);
                ctx.globalAlpha = 1;
                ctx.setLineDash([]);

                ctx.fillStyle = '#475569';
                ctx.font = `${unit * 3}px system-ui, sans-serif`;
                ctx.textAlign = 'left';
                ctx.fillText(`Textzone: ${fmt.textZone}`, unit * 5, zoneY - unit * 1.5);
            }

            // Beschriftung in der Mitte: Zweck, echte Maße, Seitenverhältnis
            ctx.textAlign = 'center';
            ctx.fillStyle = '#1e293b';

            if (isWide) {
                // Flaches Format: alles auf zwei Zeilen, mittig - eine Bildidee
                // hätte hier ohnehin keinen Platz.
                const titelBreit = options.title || fmt.label;
                fitFont(ctx, titelBreit, w * 0.86, unit * 5);
                ctx.fillText(titelBreit, w / 2, h * 0.45);
                ctx.font = `${unit * 3.4}px system-ui, sans-serif`;
                ctx.fillStyle = '#475569';
                ctx.fillText(`${w} × ${h} px · ${fmt.aspect} · PLATZHALTER`, w / 2, h * 0.72);
            } else {
                const titel = options.title || fmt.label;
                fitFont(ctx, titel, w * 0.86, unit * 6);
                ctx.fillText(titel, w / 2, h * 0.34);

                ctx.font = `${unit * 4}px system-ui, sans-serif`;
                ctx.fillStyle = '#475569';
                ctx.fillText(`${w} × ${h} px · ${fmt.aspect}`, w / 2, h * 0.42);

                // Bildidee aus dem Storyboard, falls vorhanden - der Platzhalter
                // trägt damit die Anweisung fürs spätere echte Bild bei sich.
                if (options.note) {
                    ctx.font = `italic ${unit * 3.4}px system-ui, sans-serif`;
                    ctx.fillStyle = '#334155';
                    const lines = wrapText(ctx, options.note, w * 0.72).slice(0, 3);
                    lines.forEach((l, i) => ctx.fillText(l, w / 2, h * 0.5 + i * unit * 4.6));
                }

                // Fuß: unmissverständlich als Platzhalter gekennzeichnet
                ctx.font = `bold ${unit * 3}px system-ui, sans-serif`;
                ctx.fillStyle = '#64748b';
                ctx.fillText('PLATZHALTER – wird später ersetzt', w / 2, h - unit * 3);
            }

            // Bewusst dieselbe Verkleinerungs-Funktion wie bei Fotos/KI-Bildern:
            // ein Platzhalter durchläuft exakt denselben Weg wie ein echtes Bild.
            const variants = app.utils.createImageVariants(canvas, w, h);

            return {
                full: variants.full,
                thumb: variants.thumb,
                meta: { formatId, width: w, height: h, source: 'placeholder', created: Date.now() }
            };
        } catch (e) {
            console.error('Platzhalter konnte nicht erzeugt werden:', e);
            app.ui?.toast?.('Platzhalter konnte nicht erzeugt werden.', '⚠️');
            return null;
        }
    },

    // Prüft, ob ein Bild noch ein Platzhalter ist. Läuft ÜBER das meta-Feld,
    // nicht über eine Bildanalyse - deshalb muss jede Bildquelle "source"
    // korrekt setzen (siehe imageSource.js).
    isPlaceholder(meta) {
        return meta?.source === 'placeholder';
    }
};
