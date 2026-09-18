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

// NEU (überarbeitet für echte Panels, siehe js/studio/studioComicPanels.js):
// x/y/w sind Prozent relativ zur FLÄCHE DES EINZELNEN PANELS, nicht mehr
// zur ganzen Seite - ein Panel ist kleiner als eine Bilderbuch-Doppelseite
// und hat meist nur 0-3 Sprechblasen. Einfaches von-oben-gestapeltes
// Zickzack-Raster statt eines Links/Rechts-Spaltenrasters, reicht für den
// Regelfall und bleibt in Stufe 7 trotzdem frei nachjustierbar (X/Y/Breite
// sind ganz normale Prozent-Regler, kein Drag&Drop).
function defaultBalloonPosition(index) {
    const isEven = index % 2 === 0;
    return {
        x: isEven ? 4 : 32,
        y: 4 + index * 24,
        w: 60,
        tail: isEven ? 'unten-links' : 'unten-rechts'
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
    // NEU: Sprechblasen gehören jetzt zum PANEL (spread.panels[i].balloons),
    // nicht mehr zur ganzen Seite - siehe js/studio/studioComicPanels.js für
    // den Hintergrund. addBalloon() bleibt für Fälle, in denen das Skript
    // übersprungen oder von Hand nachgebessert wird (gleiche Haltung wie
    // addSpread(): "die KI ist Vorschlag, nie Zwang").
    addBalloon(spreadIndex, panelIndex) {
        const project = app.studio.projects[app.state.currentStudioProjectId];
        const panel = project && project.spreads[spreadIndex]?.panels[panelIndex];
        if (!panel) return;
        const pos = defaultBalloonPosition(panel.balloons.length);
        panel.balloons.push({ id: app.studio.genId('balloon'), speaker: '', text: '', ...pos });
        app.dbOps.saveProject(project);
        app.render.studioWizard();
    },

    // patch: Teilmenge von { speaker, text, x, y, w, tail } - ein onchange
    // schickt dadurch immer nur das gerade geänderte Feld (gleiches Muster
    // wie app.studio.updateSpreadLayout()).
    updateBalloon(spreadIndex, panelIndex, balloonId, patch) {
        const project = app.studio.projects[app.state.currentStudioProjectId];
        const panel = project && project.spreads[spreadIndex]?.panels[panelIndex];
        const balloon = panel && panel.balloons.find(b => b.id === balloonId);
        if (!balloon) return;
        Object.assign(balloon, patch);
        app.dbOps.saveProject(project);
        app.render.studioWizard();
    },

    deleteBalloon(spreadIndex, panelIndex, balloonId) {
        const project = app.studio.projects[app.state.currentStudioProjectId];
        const panel = project && project.spreads[spreadIndex]?.panels[panelIndex];
        if (!panel) return;
        panel.balloons = panel.balloons.filter(b => b.id !== balloonId);
        app.dbOps.saveProject(project);
        app.render.studioWizard();
    },

    // Eigene Bildidee für ein von Hand hinzugefügtes/geändertes Panel.
    updatePanelVisual(spreadIndex, panelIndex, visual) {
        const project = app.studio.projects[app.state.currentStudioProjectId];
        const panel = project && project.spreads[spreadIndex]?.panels[panelIndex];
        if (!panel) return;
        panel.visual = visual;
        app.dbOps.saveProject(project);
    },

    // NEU: Geräuschwort von Hand setzen/ändern (siehe project.comicShowSoundEffects).
    updatePanelSoundEffect(spreadIndex, panelIndex, soundEffect) {
        const project = app.studio.projects[app.state.currentStudioProjectId];
        const panel = project && project.spreads[spreadIndex]?.panels[panelIndex];
        if (!panel) return;
        panel.soundEffect = soundEffect;
        app.dbOps.saveProject(project);
    },

    // Ein leeres Panel von Hand anhängen (max. 4 pro Seite, siehe
    // js/studio/studioComicPanels.js LAYOUTS).
    addPanel(spreadIndex) {
        const project = app.studio.projects[app.state.currentStudioProjectId];
        const spread = project && project.spreads[spreadIndex];
        if (!spread) return;
        if (spread.panels.length >= 4) {
            app.ui.toast('Mehr als 4 Panels pro Seite werden nicht unterstützt.', 'ℹ️');
            return;
        }
        spread.panels.push({ id: app.studio.genId('panel'), visual: '', soundEffect: '', imgUrl: null, thumbUrl: null, imageStatus: 'idle', balloons: [] });
        app.dbOps.saveProject(project);
        app.render.studioWizard();
    },

    deletePanel(spreadIndex, panelIndex) {
        const project = app.studio.projects[app.state.currentStudioProjectId];
        const spread = project && project.spreads[spreadIndex];
        if (!spread || spread.panels.length <= 1) {
            app.ui.toast('Eine Seite braucht mindestens ein Panel.', 'ℹ️');
            return;
        }
        spread.panels.splice(panelIndex, 1);
        app.dbOps.saveProject(project);
        app.render.studioWizard();
    }
});
