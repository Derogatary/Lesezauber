import { app } from '../core.js';

// ================= SchreibZauber: Bilder manuell austauschen (v0.45.0-beta) =================
// NEU (Nutzerwunsch: "Knopf, um den gesamten Prompt des Bildes, auch die
// Hintergrund-Einstellungen, rauszukopieren - für jedes einzelne Bild, um es
// manuell einzufügen ... eine Seite mit allen Seiten, wo man sie direkt
// austauschen kann"). Der kostenlose "Prompt-Export"-Weg aus
// docs/KONZEPT-Bildquellen.md, jetzt als durchgehender Arbeitsablauf:
//   1. Prompt kopieren (vollständig: Bildinhalt, Stilkarte mit Farbpalette und
//      Zusatz-Stil, Figuren-Beschreibungen, Seitenverhältnis + Pixelgröße,
//      freie Textfläche, Kinder-Leitplanken, Hinweis auf Referenzbilder).
//   2. Im Gemini-Chat/AI Studio/ChatGPT einfügen, dazu die Figurenblätter als
//      Referenzbilder anhängen (Download-Knöpfe in der Liste).
//   3. Das fertige Bild zurück: aus der Zwischenablage einfügen (Knopf oder
//      Strg+V), Datei wählen oder per Drag & Drop.
// Der Prompt wird bei jedem Kopieren FRISCH gebaut (statt spread.imagePrompt),
// damit spätere Änderungen an Stilkarte/Figuren/Textposition drin sind.
//
// Ein "Eintrag" (item) ist eins von: { kind: 'character', characterId }
//   { kind: 'spread', spreadIndex }   { kind: 'panel', spreadIndex, panelIndex }

function currentProject() {
    return app.studio.projects[app.state.currentStudioProjectId] || null;
}

function formatSizeLine(formatId) {
    const fmt = app.studio.formats.get(formatId);
    return fmt ? `Bildgröße: ${fmt.genW} × ${fmt.genH} Pixel (Seitenverhältnis ${fmt.aspect}).` : '';
}

// Welche Bild-Anfrage gehört zu diesem Eintrag? Gleiche Angaben wie bei der
// automatischen Erzeugung (studioImages.js/studioCharacters.js), damit der
// kopierte Prompt exakt dem entspricht, was die App selbst schicken würde.
function specFor(project, item) {
    if (item.kind === 'character') {
        const c = project.characters.find(x => x.id === item.characterId);
        if (!c) return null;
        return {
            formatId: 'characterSheet',
            sketch: `Ganzkörper-Referenzbild von ${c.name} in mehreren kleinen Posen/Mimiken auf einem Blatt (Character Sheet). ${c.sheetText || ''}`,
            style: app.studio.buildStyleText(project.style),
            characters: [],
            refs: []
        };
    }
    const spread = project.spreads[item.spreadIndex];
    if (!spread) return null;
    if (item.kind === 'panel') {
        const panel = spread.panels?.[item.panelIndex];
        if (!panel) return null;
        const chars = app.studio.characterRefsForPanel(project, panel);
        return {
            formatId: 'comicPanel',
            sketch: panel.visual || app.studio.spreadSceneHint(spread),
            style: app.studio.buildStyleText(project.style),
            characters: chars,
            refs: chars.filter(c => c.sheetImgUrl)
        };
    }
    const chars = app.studio.characterRefsFor(project, spread);
    return {
        formatId: app.studio.spreadFormatId(project, spread),
        sketch: app.studio.spreadSceneHint(spread),
        style: app.studio.buildStyleText(project.style),
        characters: chars,
        textPos: spread.layout?.textPos,
        refs: chars.filter(c => c.sheetImgUrl)
    };
}

Object.assign(app.studio, {
    // Alle Bilder eines Projekts in Arbeits-Reihenfolge: erst die Figurenblätter
    // (sie sind die Vorlage für alle anderen), dann Seite für Seite.
    manualImageItems(project = currentProject()) {
        if (!project) return [];
        const items = (project.characters || [])
            .filter(c => c.name && c.name.trim())
            .map(c => ({
                kind: 'character', characterId: c.id,
                key: `c:${c.id}`,
                label: `Figurenblatt · ${c.name}`,
                imgUrl: c.sheetThumbUrl || c.sheetImgUrl || '',
                source: c.sheetMeta?.source || (c.sheetImgUrl ? 'placeholder' : '')
            }));
        (project.spreads || []).forEach((spread, spreadIndex) => {
            if (spread.panels?.length) {
                spread.panels.forEach((panel, panelIndex) => items.push({
                    kind: 'panel', spreadIndex, panelIndex,
                    key: `p:${spreadIndex}:${panelIndex}`,
                    label: `Seite ${spreadIndex + 1} · Panel ${panelIndex + 1}`,
                    imgUrl: panel.thumbUrl || panel.imgUrl || '',
                    source: panel.imageSource || (panel.imgUrl ? 'placeholder' : '')
                }));
            } else {
                items.push({
                    kind: 'spread', spreadIndex,
                    key: `s:${spreadIndex}`,
                    label: `Doppelseite ${spreadIndex + 1}`,
                    imgUrl: spread.thumbUrl || spread.imgUrl || '',
                    source: spread.imageMeta?.source || (spread.imgUrl ? 'placeholder' : '')
                });
            }
        });
        return items;
    },

    parseManualItemKey(key) {
        const [k, a, b] = String(key).split(':');
        if (k === 'c') return { kind: 'character', characterId: a };
        if (k === 's') return { kind: 'spread', spreadIndex: Number(a) };
        if (k === 'p') return { kind: 'panel', spreadIndex: Number(a), panelIndex: Number(b) };
        return null;
    },

    // Der vollständige, frisch gebaute Prompt zum Kopieren.
    manualPromptFor(project, item) {
        const spec = specFor(project, item);
        if (!spec) return '';
        const refNames = spec.refs.map(c => c.name);
        return [
            app.studio.imageSource.buildPrompt(spec),
            formatSizeLine(spec.formatId),
            refNames.length
                ? `Angehängte Referenzbilder: die Figurenblätter von ${refNames.join(', ')} - Aussehen, Kleidung und Farben dieser Figuren exakt übernehmen.`
                : ''
        ].filter(Boolean).join('\n\n');
    },

    manualRefsFor(project, item) {
        return specFor(project, item)?.refs || [];
    },

    // Ein eigenes Bild (Datei/Blob) für einen Eintrag einsetzen.
    async applyManualImage(key, file, promptUsed) {
        const project = currentProject();
        const item = app.studio.parseManualItemKey(key);
        const spec = project && item && specFor(project, item);
        if (!spec) return false;
        if (!file || !/^image\//.test(file.type || '')) {
            app.ui.toast('Das ist kein Bild.', '⚠️');
            return false;
        }
        const targetWidth = item.kind === 'character' ? undefined : app.studio.printTargetWidth(project);
        const result = await app.studio.imageSource.request('upload', { formatId: spec.formatId, file, targetWidth });
        if (!result) return false;
        // Den Prompt mitspeichern, mit dem das Bild entstanden ist (Nachvollziehbarkeit,
        // und damit "alle Platzhalter ersetzen" es nicht mehr als Platzhalter sieht).
        result.meta.prompt = promptUsed || app.studio.manualPromptFor(project, item);

        if (item.kind === 'character') {
            const c = project.characters.find(x => x.id === item.characterId);
            const hadPrevious = !!c.sheetImgUrl && c.sheetMeta?.source && c.sheetMeta.source !== 'placeholder';
            c.sheetImgUrl = result.full;
            c.sheetThumbUrl = result.thumb;
            c.sheetMeta = result.meta;
            // Wie beim automatischen Figurenblatt: echte Bilder mit dieser Figur
            // als "Figur veraltet" markieren, nichts automatisch neu zeichnen.
            if (hadPrevious) {
                project.spreads.forEach(s => {
                    if ((s.characterIds || []).includes(c.id) && s.imageMeta?.source && s.imageMeta.source !== 'placeholder') s.imageStale = true;
                });
            }
        } else if (item.kind === 'panel') {
            const spread = project.spreads[item.spreadIndex];
            const panel = spread.panels[item.panelIndex];
            panel.imgUrl = result.full;
            panel.thumbUrl = result.thumb;
            panel.imagePrompt = result.meta.prompt;
            panel.imageSource = 'upload';
            panel.imageStatus = 'done';
            const composited = await app.studio.comicPanels.compositePage(spread, app.studio.printTargetWidth(project));
            if (composited) {
                spread.imgUrl = composited.full;
                spread.thumbUrl = composited.thumb;
                spread.imageStatus = 'done';
            }
        } else {
            const spread = project.spreads[item.spreadIndex];
            spread.imgUrl = result.full;
            spread.thumbUrl = result.thumb;
            spread.imageMeta = result.meta;
            spread.imagePrompt = result.meta.prompt;
            spread.imageStatus = 'done';
            spread.imageStale = false;
        }
        app.dbOps.saveProject(project);
        return true;
    }
});
