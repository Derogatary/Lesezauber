import { app } from '../core.js';

// ================= SchreibZauber: Das Layout (Ausbaustufe 3, Stufe 7 im Wizard) =================
// docs/KONZEPT-SchreibZauber.md, TEIL C.2 Stufe 7 "Das Layout": Textposition,
// Schriftgröße und Silbenfarben pro Doppelseite. `spread.layout` existiert
// als Datenfeld bereits seit Stufe 1 (Default kommt aus studioCore.js,
// createDefaultProject()/addSpread()/applyManuscript() - hier NICHT
// verändern) - dieses Modul macht es erstmals EDITIERBAR und liefert den
// EINEN Baustein, der den Text als HTML-Ebene über dem Bild positioniert,
// egal ob im Wizard-Vorschaukärtchen (js/render/studioLayout.js) oder im
// Doppelseiten-Druck (js/studio/studioPrint.js) - beide rufen
// app.studio.layout.buildOverlayHtml() auf, damit Vorschau und Druck
// garantiert dasselbe Ergebnis zeigen.
//
// WICHTIG (Konzept A.5 Prinzip 6 / D.4 "Text erscheint NICHT im Bild"):
// der Text wird hier NIE ins Canvas/Bild gebrannt, nur als absolut
// positionierte HTML-Ebene über dem (unverändert bleibenden) Bild gelegt -
// bleibt dadurch änderbar, vorlesbar und durchsuchbar.

// NEU: Grenzen für den Schriftgröße-Regler - großzügig genug für
// Erstleser (siehe Konzept A.2 "Fibelschrift, große Schriftgröße"), aber
// nach oben gedeckelt, damit der Text nicht über den Bildrand hinausläuft.
const FONT_SCALE_MIN = 0.8;
const FONT_SCALE_MAX = 1.5;

// NEU: zwei fest verdrahtete, alternierende Farben für die Silbenmethode
// (Konzept A.2 "Silben abwechselnd farbig - die bekannteste deutsche
// Leselernhilfe"). Bewusst NICHT aus dem Tailwind-@theme-Block gelesen:
// dieselben Werte werden unverändert auch im Druck-Popup gebraucht
// (js/studio/studioPrint.js), das ein eigenes <head> ohne Tailwind hat.
const SYLLABLE_COLORS = ['#4338ca', '#be185d'];

function clampFontScale(value) {
    const n = Number(value);
    if (!Number.isFinite(n)) return 1;
    return Math.min(FONT_SCALE_MAX, Math.max(FONT_SCALE_MIN, n));
}

// NEU: einfache, für deutsche Kinderbuchtexte "brauchbare" Silbentrennung
// (Auftrag: "keine sprachwissenschaftlich exakte Trennung nötig"), keine
// KI, kein Wörterbuch - reine Heuristik auf EIN Wort (nur Buchstaben)
// angewandt:
// - eine zusammenhängende Vokalfolge (deckt Diphthonge wie "au"/"ei"/"ie"
//   automatisch mit ab, ohne sie einzeln aufzählen zu müssen) zählt als
//   EIN Silbenkern
// - ein einzelner Konsonant zwischen zwei Kernen wandert komplett zur
//   FOLGENDEN Silbe ("Blu-me")
// - bei mehreren Konsonanten bleibt nur der/die letzte(n) - inkl. der
//   unzertrennlichen Verbindungen "ch"/"sch"/"ph"/"th" am Ende des
//   Konsonantenblocks - bei der folgenden Silbe, der Rest bleibt bei der
//   vorigen ("Fens-ter", "Kir-che", "wa-schen")
// Getestet gegen die üblichen Lehrbuch-Beispiele (Blume, Mutter, Sonne,
// müssen, Fenster, Winter, Kirche, waschen) - trifft dort jeweils die
// tatsächliche Trennung. Kein Anspruch auf Vollständigkeit (Fremdwörter,
// Fugen-s in Komposita etc. können danebenliegen), aber für selbst
// geschriebene Kinderbuchtexte ausreichend.
function splitSyllables(word) {
    if (!word) return [word];
    const nuclei = [];
    const re = /[aeiouyäöü]+/gi;
    let m;
    while ((m = re.exec(word))) {
        nuclei.push({ start: m.index, end: m.index + m[0].length });
    }
    if (nuclei.length <= 1) return [word];

    const syllables = [];
    let cursor = 0;
    for (let i = 0; i < nuclei.length; i++) {
        const nucleus = nuclei[i];
        if (i === nuclei.length - 1) {
            syllables.push(word.slice(cursor));
            break;
        }
        const next = nuclei[i + 1];
        const cluster = word.slice(nucleus.end, next.start);
        const lower = cluster.toLowerCase();
        let keepWithNext = cluster.length <= 1 ? cluster : cluster.slice(-1);
        if (lower.endsWith('sch') && cluster.length >= 3) keepWithNext = cluster.slice(-3);
        else if ((lower.endsWith('ch') || lower.endsWith('ph') || lower.endsWith('th')) && cluster.length >= 2) keepWithNext = cluster.slice(-2);
        const staysHere = cluster.slice(0, cluster.length - keepWithNext.length);
        syllables.push(word.slice(cursor, nucleus.end) + staysHere);
        cursor = nucleus.end + staysHere.length;
    }
    return syllables.filter(Boolean);
}

// NEU: baut aus einem Textabschnitt sanitiertes HTML mit abwechselnd
// gefärbten Silben-<span>s. startIdx/Rückgabe nextIdx lassen die
// Farbfolge über mehrere Sinnschritt-Zeilen hinweg (siehe buildTextLines)
// durchlaufen, statt bei jeder neuen Zeile wieder bei Farbe 1 anzufangen -
// "abwechselnd" bezieht sich auf den ganzen Seitentext, nicht pro Wort.
function buildSyllableSpansHtml(text, startIdx = 0) {
    let colorIdx = startIdx;
    let out = '';
    const re = /([A-Za-zÀ-ÖØ-öø-ÿ]+)|([^A-Za-zÀ-ÖØ-öø-ÿ]+)/g;
    let match;
    while ((match = re.exec(text))) {
        if (match[1]) {
            splitSyllables(match[1]).forEach((syl) => {
                const color = SYLLABLE_COLORS[colorIdx % 2];
                colorIdx += 1;
                out += `<span style="color:${color}">${app.utils.sanitize(syl)}</span>`;
            });
        } else {
            out += app.utils.sanitize(match[2]);
        }
    }
    return { html: out, nextIdx: colorIdx };
}

// NEU: "Sinnschritte" (Konzept A.2 - "ein Satz = eine Zeile, Zeilenumbruch
// nie mitten in einer Sinneinheit"), Teil des Erstleser-Regelprofils. Nur
// aktiv bei readingLevel 'erstleser' - alle anderen Lesesituationen zeigen
// den Text unverändert als einen Block (Zeilenumbruch macht dann die
// normale Textreflow-Logik des Browsers/Drucks). Grobe Satzgrenzen-
// Erkennung an . ! ? - reicht laut Auftrag für selbst geschriebene
// Kinderbuchtexte, kein Anspruch auf exakte Satzerkennung (z.B. "Dr.").
function buildTextLines(text, readingLevel) {
    const trimmed = (text || '').trim();
    if (!trimmed) return [];
    if (readingLevel !== 'erstleser') return [trimmed];

    const parts = trimmed.split(/([.!?]+)\s*/).filter((p) => p !== '');
    const lines = [];
    for (let i = 0; i < parts.length; i += 2) {
        const line = `${parts[i] || ''}${parts[i + 1] || ''}`.trim();
        if (line) lines.push(line);
    }
    return lines.length ? lines : [trimmed];
}

// NEU: EIN Ort für die Zonen-Positionierung (Konzept: "Textposition pro
// Seite: oben/unten/links/rechts"). Rein Inline-CSS statt Tailwind-Klassen,
// weil dieselbe Funktion auch im Druck-Popup läuft (eigenes <head>, kein
// Tailwind geladen dort, siehe studioPrint.js). Ein halbtransparenter
// weißer Untergrund sorgt dafür, dass der Text auch dann lesbar bleibt,
// wenn die vom Bild-Prompt freigehaltene Zone (siehe imageSource.js
// buildPrompt(), fmt.textZone) nicht exakt zur hier gewählten Position
// passt - siehe docs/KONZEPT-SchreibZauber.md "Stand nach Stufe 3" für
// diese bekannte Lücke.
function textPosStyle(textPos) {
    const base = 'position:absolute; background:rgba(255,255,255,0.82); border-radius:0.6em; padding:0.5em 0.8em; line-height:1.35; box-shadow:0 1px 3px rgba(0,0,0,0.15);';
    switch (textPos) {
        case 'oben':
            return `${base} top:4%; left:6%; right:6%; text-align:center;`;
        case 'links':
            return `${base} top:10%; bottom:10%; left:4%; width:42%; display:flex; flex-direction:column; justify-content:center; text-align:left;`;
        case 'rechts':
            return `${base} top:10%; bottom:10%; right:4%; width:42%; display:flex; flex-direction:column; justify-content:center; text-align:left;`;
        case 'unten':
        default:
            return `${base} bottom:4%; left:6%; right:6%; text-align:center;`;
    }
}

// Der eigentliche Baustein: Manuskripttext einer Doppelseite -> fertige,
// bereits sanitierte HTML-Textebene (inkl. Positionierung/Schriftgröße
// als Inline-Style) - NIE ins Bild gebrannt, immer eine Ebene darüber.
// baseSize/unit: der Aufrufer bestimmt die "1x"-Schriftgröße (Vorschau im
// Wizard-Kärtchen braucht eine andere Einheit als der mm-genaue Druck),
// fontScale (0.8-1.5) skaliert nur relativ dazu.
function buildOverlayHtml(text, layout, readingLevel, baseSize, unit) {
    const lines = buildTextLines(text, readingLevel);
    if (lines.length === 0) return '';

    const scale = clampFontScale(layout?.fontScale);
    let colorCursor = 0;
    const bodyHtml = lines.map((line) => {
        if (layout?.syllableColors) {
            const { html, nextIdx } = buildSyllableSpansHtml(line, colorCursor);
            colorCursor = nextIdx;
            return `<div>${html}</div>`;
        }
        return `<div>${app.utils.sanitize(line)}</div>`;
    }).join('');

    const style = `${textPosStyle(layout?.textPos)} font-size:${(baseSize * scale).toFixed(2)}${unit}; color:#1e293b;`;
    return `<div style="${style}">${bodyHtml}</div>`;
}

app.studio.layout = {
    FONT_SCALE_MIN,
    FONT_SCALE_MAX,
    splitSyllables,
    buildOverlayHtml
};

Object.assign(app.studio, {
    // Stufe 7 - Layout EINER Doppelseite ändern. patch ist eine Teilmenge
    // von { textPos, fontScale, syllableColors } - ein onchange schickt
    // dadurch immer nur das gerade geänderte Feld, der Rest bleibt wie er
    // war (siehe render/studioLayout.js).
    updateSpreadLayout(spreadIndex, patch) {
        const project = app.studio.projects[app.state.currentStudioProjectId];
        const spread = project && project.spreads[spreadIndex];
        if (!spread) return;
        spread.layout = { ...spread.layout, ...patch };
        app.dbOps.saveProject(project);
        app.render.studioWizard(7);
    }
});
