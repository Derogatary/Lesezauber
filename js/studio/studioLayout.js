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
    // NEU (KDP-Seitenlayout-Varianten): "Bild + Text oben/unten" - der Text
    // liegt NICHT über dem Bild, sondern in einem eigenen weißen Streifen
    // (BAND_PCT der Seitenhöhe), das Bild rückt in den Rest (siehe
    // imageRegion() unten). Deshalb hier kein halbtransparenter Kasten,
    // sondern schlichter Text auf dem weißen Seitenhintergrund.
    const bandBase = 'position:absolute; left:6%; right:6%; display:flex; flex-direction:column; justify-content:center; text-align:center; line-height:1.35;';
    if (textPos === 'band-unten') return `${bandBase} top:${100 - BAND_PCT + 3}%; bottom:3%;`;
    if (textPos === 'band-oben') return `${bandBase} top:3%; bottom:${100 - BAND_PCT + 3}%;`;
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
    // NEU (KDP-Seitenlayout-Varianten): "Vollbild ohne Text" - bewusst
    // gewählte Bildseite ohne Textebene (Text bleibt trotzdem im Reader
    // vorlesbar, siehe studioExport.js - nur im Druck/in der Vorschau fehlt er).
    if (layout?.textPos === 'ohne') return '';
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

    const style = `${textPosStyle(effectiveTextPos(layout))} font-size:${(baseSize * scale).toFixed(2)}${unit}; color:#1e293b;`;
    return `<div style="${style}">${bodyHtml}</div>`;
}

// ================= NEU: KDP-Seitenlayout-Varianten + Panorama =================
// docs/KONZEPT-SchreibZauber.md, Nachtrag "KDP-Farbstufen konkretisiert +
// Seitenlayout-Ideen" Punkt 2 und 3 - seit v0.39.0-beta umgesetzt.
//
// textPos kennt jetzt zusätzlich zu oben/unten/links/rechts (Text als Kasten
// ÜBER dem Bild):
//   'band-oben'/'band-unten' - Text in eigenem weißen Streifen, Bild darüber
//                              bzw. darunter (klassisches "Bild + Text"-Layout)
//   'ohne'                   - Vollbild ohne Text (bewusst stille Bildseite)
// layout.panorama (bool): EIN Breitbild über ZWEI gegenüberliegende Buchseiten
// (über den Bundsteg hinweg). Nur bei Hochformat-/Quadrat-Büchern, weil dort
// eine Doppelseite im Druck genau EINE Buchseite ist (siehe CHANGELOG
// v0.29.0-beta) - das Panorama belegt dann zwei davon.

// Höhe des Textstreifens in Prozent der Seitenhöhe.
const BAND_PCT = 28;
const TEXT_POS_OPTIONS = [
    { id: 'unten', label: 'Text über dem Bild: unten' },
    { id: 'oben', label: 'Text über dem Bild: oben' },
    { id: 'links', label: 'Text über dem Bild: links' },
    { id: 'rechts', label: 'Text über dem Bild: rechts' },
    { id: 'band-unten', label: 'Bild oben, Text darunter (eigener Streifen)' },
    { id: 'band-oben', label: 'Text oben, Bild darunter (eigener Streifen)' },
    { id: 'ohne', label: 'Vollbild ohne Text' }
];
const BAND_POSITIONS = ['band-oben', 'band-unten'];
const PANORAMA_TRIMS = ['a5-hoch', 'a4-hoch', 'quadrat'];

function isBand(layout) {
    return BAND_POSITIONS.includes(layout?.textPos);
}

// Panorama + Streifen passt nicht zusammen (der Streifen würde das Breitbild
// zerteilen) - beim Panorama gilt ein Streifen deshalb als Kasten oben/unten.
function effectiveTextPos(layout) {
    const pos = layout?.textPos || 'unten';
    if (layout?.panorama && isBand(layout)) return pos === 'band-oben' ? 'oben' : 'unten';
    return pos;
}

// Welcher Teil der Seite gehört dem Bild? Prozent vom oberen/unteren Rand;
// fit 'contain' bei Streifen-Layouts, damit das Bild in der kleineren Fläche
// nicht beschnitten wird (es bekommt stattdessen etwas weißen Rand - wirkt
// wie ein bewusst gerahmtes Bild).
function imageRegion(layout) {
    if (layout?.panorama || !isBand(layout)) return { top: 0, bottom: 0, fit: null };
    return layout.textPos === 'band-unten'
        ? { top: 0, bottom: BAND_PCT, fit: 'contain' }
        : { top: BAND_PCT, bottom: 0, fit: 'contain' };
}

// Auf welcher der beiden Panorama-Hälften liegt der Text? 'rechts' -> rechte
// Seite, alles andere links (Lesefluss beginnt links).
function panoramaTextSide(layout) {
    return effectiveTextPos(layout) === 'rechts' ? 'right' : 'left';
}

function panoramaAllowed(project) {
    return project && project.type !== 'comic' && PANORAMA_TRIMS.includes(project.spec?.trim);
}

// Physische Seitenfolge im Druck: Seite 1 = Titelseite (rechte Buchseite,
// wie in jedem gedruckten Buch). Ein Panorama muss auf einer GERADEN Seite
// (links) beginnen, sonst landen seine zwei Hälften auf Vorder- und
// Rückseite desselben Blatts statt nebeneinander - dann wird davor eine
// Leerseite eingeschoben. Liefert pro Doppelseite {startPage, pages,
// blankBefore} - von Druck UND Layout-Vorschau benutzt, damit beide
// dieselbe Rechnung zeigen.
function planPhysicalPages(project) {
    let next = 2; // Seite 1 ist die Titelseite
    return (project.spreads || []).map(spread => {
        const panorama = !!(spread.layout?.panorama && panoramaAllowed(project));
        let blankBefore = false;
        if (panorama && next % 2 === 1) { blankBefore = true; next += 1; }
        const entry = { startPage: next, pages: panorama ? 2 : 1, blankBefore, panorama };
        next += entry.pages;
        return entry;
    });
}

app.studio.layout = {
    FONT_SCALE_MIN,
    FONT_SCALE_MAX,
    TEXT_POS_OPTIONS,
    splitSyllables,
    buildOverlayHtml,
    isBand,
    effectiveTextPos,
    imageRegion,
    panoramaTextSide,
    panoramaAllowed,
    planPhysicalPages
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
        const before = spread.layout || {};
        spread.layout = { ...before, ...patch };
        // NEU (KDP-Seitenlayout-Varianten): Wechsel zwischen "Text über dem
        // Bild", "eigener Streifen" und "ohne Text" ändert, welche Fläche das
        // Bild freihalten sollte - das vorhandene Bild passt dann evtl. nicht
        // mehr optimal. Nur markieren (imageStale, wie bei Textänderungen),
        // NICHT automatisch neu erzeugen - das würde Bild-Kontingent kosten.
        const zoneChanged = patch.textPos && patch.textPos !== before.textPos;
        if (zoneChanged && spread.imageMeta?.source === 'placeholder') {
            // Ein Platzhalter kostet nichts - sofort passend neu zeichnen
            // (inkl. neuem gespeichertem Prompt für "alle Platzhalter ersetzen").
            app.dbOps.saveProject(project);
            app.studio.regenerateSpreadPlaceholder(spreadIndex);
            return;
        }
        if (zoneChanged && spread.imgUrl) spread.imageStale = true;
        app.dbOps.saveProject(project);
        app.render.studioWizard(7);
    },

    // NEU (KDP-Panorama): Doppelseite als EIN Breitbild über zwei Buchseiten.
    // Das Seitenverhältnis des Bildes ändert sich dadurch komplett - das
    // bisherige Bild wird deshalb als veraltet markiert und muss in Stufe 6
    // neu erzeugt werden (Hinweis per Toast, kein automatischer Bildaufruf).
    toggleSpreadPanorama(spreadIndex, value) {
        const project = app.studio.projects[app.state.currentStudioProjectId];
        const spread = project && project.spreads[spreadIndex];
        if (!spread) return;
        if (value && !panoramaAllowed(project)) {
            app.ui.toast('Panorama-Bilder gibt es nur bei Hochformat- oder Quadrat-Büchern (Bauplan, Stufe 2).', 'ℹ️');
            app.render.studioWizard(7);
            return;
        }
        spread.layout = { ...spread.layout, panorama: !!value };
        if (spread.imageMeta?.source === 'placeholder') {
            // Platzhalter: kostenlos im neuen Format neu zeichnen.
            app.dbOps.saveProject(project);
            app.studio.regenerateSpreadPlaceholder(spreadIndex);
            return;
        }
        if (spread.imgUrl) {
            spread.imageStale = true;
            app.ui.toast('Das Bild hat jetzt ein anderes Format - bitte in Stufe 6 "Bilder" neu erzeugen.', '🖼️');
        }
        app.dbOps.saveProject(project);
        app.render.studioWizard(7);
    },

    // NEU: Silbenfarben waren ursprünglich ein Regler PRO Doppelseite,
    // obwohl sich die Einstellung in der Praxis nie innerhalb eines Buches
    // ändert (Nutzer-Feedback: "man ändert die Einstellung ja nicht im
    // Buch") - jetzt EIN Umschalter fürs ganze Werk, der einfach auf alle
    // Doppelseiten gleichzeitig schreibt. Die Datenstruktur bleibt bewusst
    // pro Doppelseite (spread.layout.syllableColors), damit
    // buildOverlayHtml()/der Druck (studioPrint.js) unverändert bleiben -
    // nur die Bedienung ist jetzt eine einzige Stelle statt vieler.
    setBookSyllableColors(value) {
        const project = app.studio.projects[app.state.currentStudioProjectId];
        if (!project) return;
        project.spreads.forEach(s => { s.layout = { ...s.layout, syllableColors: !!value }; });
        app.dbOps.saveProject(project);
        app.render.studioWizard(7);
    }
});
