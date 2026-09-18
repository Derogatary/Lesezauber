import { app } from '../core.js';

// ================= SchreibZauber: Sprechblasen (Ausbaustufe 5 - Comic) =================
// Comic-Gegenstück zu js/studio/studioLayout.js: DORT baut buildOverlayHtml()
// den Fließtext einer Doppelseite in eine positionierte HTML-Ebene um, HIER
// macht buildBalloonsHtml() dasselbe für die Sprechblasen einer Comic-Seite.
// Gleiche Grundregel wie überall im Projekt (Konzept A.5 Prinzip 6): der
// Text wird NIE ins Bild gebrannt, nur als absolut positionierte,
// sanitierte HTML-Ebene darüber gelegt - genutzt von der Wizard-Vorschau
// (js/render/studioLayout.js) UND von einem künftigen Comic-Druck.
//
// WICHTIG (siehe docs/KONZEPT-Comic.md Abschnitt 5, "Gefundener Prompt-
// Fehler"): der Bild-Prompt selbst darf das Wort "Sprechblase" NICHT mehr
// enthalten (siehe js/studio/imageFormats.js textZone) - hier auf der
// Overlay-Seite ist das natürlich unproblematisch, hier zeichnet kein
// Bildmodell mehr mit.

// NEU: einfaches Positionsraster statt freiem Ziehen (kein Drag&Drop) -
// zwei Spalten, mehrere Zeilen, abwechselnd links/rechts. Reicht für die
// meisten Panels (2-4 Sprechende) und bleibt in Stufe 7 trotzdem frei
// nachjustierbar (x/y/Breite sind ganz normale Prozent-Regler).
function defaultBalloonPosition(index) {
    const col = index % 2;
    const row = Math.floor(index / 2);
    return {
        x: col === 0 ? 6 : 54,
        y: 6 + row * 26,
        w: 40,
        tail: col === 0 ? 'unten-links' : 'unten-rechts'
    };
}

// Baut aus der KI-Dialogliste (Stufe 3, siehe app.studio.applyComicScript())
// fertige balloons-Einträge mit einer Startposition. Leere Zeilen werden
// verworfen, damit kein leerer Sprechblasen-Rahmen entsteht.
function fromDialogue(dialogueList) {
    return (dialogueList || []).map((d, i) => {
        const pos = defaultBalloonPosition(i);
        return {
            id: app.studio.genId('balloon'),
            speaker: (d.speaker || '').trim(),
            text: (d.line || d.text || '').trim(),
            x: pos.x, y: pos.y, w: pos.w, tail: pos.tail
        };
    }).filter(b => b.text);
}

// EIN Dreieck aus der CSS-Rahmen-Technik (border:transparent + eine Seite
// gefärbt) - kein zweites Overlay für einen Umriss, ein simpler
// Schlagschatten sorgt trotzdem für eine erkennbare Kante.
function tailHtml(tail) {
    const base = 'position:absolute; width:0; height:0; border:10px solid transparent; filter:drop-shadow(0 2px 1px rgba(0,0,0,0.18));';
    const byDirection = {
        'unten-links': `${base} bottom:-14px; left:16px; border-top-color:#fff;`,
        'unten-rechts': `${base} bottom:-14px; right:16px; border-top-color:#fff;`,
        'oben-links': `${base} top:-14px; left:16px; border-bottom-color:#fff;`,
        'oben-rechts': `${base} top:-14px; right:16px; border-bottom-color:#fff;`
    };
    return `<div style="${byDirection[tail] || byDirection['unten-links']}"></div>`;
}

function balloonHtml(b) {
    return `<div style="position:absolute; left:${b.x}%; top:${b.y}%; width:${b.w}%; background:#fff; border:2px solid #1e293b; border-radius:1.1em; padding:0.5em 0.8em; font-size:0.85em; line-height:1.3; color:#1e293b; box-shadow:0 2px 6px rgba(0,0,0,0.2);">
        ${b.speaker ? `<div style="font-weight:700; font-size:0.75em; color:#4f46e5; margin-bottom:0.15em;">${app.utils.sanitize(b.speaker)}</div>` : ''}
        <div>${app.utils.sanitize(b.text)}</div>
        ${tailHtml(b.tail)}
    </div>`;
}

// Der eigentliche Baustein, analog zu app.studio.layout.buildOverlayHtml() -
// baut ALLE Sprechblasen einer Doppelseite auf einmal.
function buildBalloonsHtml(balloons) {
    return (balloons || []).map(balloonHtml).join('');
}

app.studio.balloons = {
    defaultBalloonPosition,
    fromDialogue,
    buildBalloonsHtml
};

Object.assign(app.studio, {
    // Stufe 7 (Comic) - eine leere Sprechblase von Hand hinzufügen, für
    // Fälle, in denen das Skript übersprungen oder von Hand nachgebessert
    // wird (gleiche Haltung wie addSpread(): "die KI ist Vorschlag, nie Zwang").
    addBalloon(spreadIndex) {
        const project = app.studio.projects[app.state.currentStudioProjectId];
        const spread = project && project.spreads[spreadIndex];
        if (!spread) return;
        const pos = defaultBalloonPosition(spread.balloons.length);
        spread.balloons.push({ id: app.studio.genId('balloon'), speaker: '', text: '', ...pos });
        app.dbOps.saveProject(project);
        app.render.studioWizard(7);
    },

    // patch: Teilmenge von { speaker, text, x, y, w, tail } - ein onchange
    // schickt dadurch immer nur das gerade geänderte Feld (gleiches Muster
    // wie app.studio.updateSpreadLayout()).
    updateBalloon(spreadIndex, balloonId, patch) {
        const project = app.studio.projects[app.state.currentStudioProjectId];
        const spread = project && project.spreads[spreadIndex];
        const balloon = spread && spread.balloons.find(b => b.id === balloonId);
        if (!balloon) return;
        Object.assign(balloon, patch);
        app.dbOps.saveProject(project);
        app.render.studioWizard(7);
    },

    deleteBalloon(spreadIndex, balloonId) {
        const project = app.studio.projects[app.state.currentStudioProjectId];
        const spread = project && project.spreads[spreadIndex];
        if (!spread) return;
        spread.balloons = spread.balloons.filter(b => b.id !== balloonId);
        app.dbOps.saveProject(project);
        app.render.studioWizard(7);
    }
});
