import { app } from '../core.js';

// ================= SchreibZauber: Die Bilder (Stufe 2, Stufe 6 im Wizard) =================
// Erst hier - NACH dem Storyboard (Stufe 5) - entsteht pro Doppelseite ein
// echtes Bild, einzeln anstoßbar, NIE automatisch fürs ganze Buch auf
// einmal (Konzept C.2, "Warum Stufe 5 vor Stufe 6 nicht übersprungen werden
// darf" - dieselbe Zurückhaltung wie beim bestehenden Persona-System, siehe
// CLAUDE.md). Ob dabei wirklich die Gemini-Bild-API, die kostenlose
// Pollinations-Quelle (NEU) oder weiterhin der Platzhalter läuft,
// entscheidet AUSSCHLIESSLICH app.studio.resolveImageSourceId()
// (studioCore.js) anhand der ausdrücklichen Bestätigung in den
// Einstellungen - dieses Modul fragt nie selbst danach, welche Quelle
// erlaubt ist, und arbeitet überall mit der zurückgegebenen sourceId statt
// eine Quelle selbst fest zu verdrahten.
//
// NEU (Ausbaustufe 5, Panels): beim Comic erzeugt dieses Modul NICHT ein
// Bild pro Seite, sondern eins PRO PANEL (siehe generateComicPage() unten) -
// mehr Bildaufrufe, aber erst das ergibt eine echte Panel-Anordnung statt
// einer bloßen Bilderreihenfolge (Nutzer-Feedback: "sonst ist es einfach
// ein Bilderbuch"). Bewusst so entschieden, auch mit höheren Kosten.

function currentProject() {
    return app.studio.projects[app.state.currentStudioProjectId] || null;
}

// NEU: Referenzbilder für die echte Bildgenerierung - NUR die Figurenblätter
// der auf dieser Seite vorkommenden Figuren (Konzept D.5 #1/#4), und nur,
// wenn schon eins existiert (eine Figur ohne Figurenblatt liefert einfach
// keine Referenz, kein Fehler).
function characterImagesFor(project, spread) {
    return app.studio.characterRefsFor(project, spread)
        .map(c => c.sheetImgUrl)
        .filter(Boolean);
}

function characterImagesForPanel(project, panel) {
    return app.studio.characterRefsForPanel(project, panel)
        .map(c => c.sheetImgUrl)
        .filter(Boolean);
}

Object.assign(app.studio, {
    // Bild EINER Doppelseite (Bilderbuch/Arbeitsheft) neu erzeugen - der
    // zentrale Knopf der Stufe 6. sketchPrompt (Stufe 5) ist die bevorzugte
    // Bildidee, fällt auf den Manuskripttext zurück, falls das Storyboard
    // übersprungen wurde. Beim Comic übernimmt stattdessen
    // generateComicPage() unten (eigenes Panel-Vorgehen).
    async generateSpreadImage(spreadIndex) {
        const project = currentProject();
        const spread = project && project.spreads[spreadIndex];
        if (!spread) return;
        if (project.type === 'comic') {
            await app.studio.generateComicPage(spreadIndex);
            return;
        }

        const sourceId = app.studio.resolveImageSourceId();
        app.ui.showLoader('Bild wird erzeugt...', sourceId !== 'placeholder' ? 'Das kann einige Sekunden dauern' : 'Platzhalter wird gezeichnet');
        app.state.apiBusy = true;
        try {
            const result = await app.studio.imageSource.request(sourceId, {
                // NEU (KDP-Panorama): Format pro Doppelseite statt pro Buch.
                formatId: app.studio.spreadFormatId(project, spread),
                sketch: app.studio.spreadSceneHint(spread),
                style: app.studio.buildStyleText(project.style),
                characters: app.studio.characterRefsFor(project, spread),
                characterImages: characterImagesFor(project, spread),
                title: `Doppelseite ${spreadIndex + 1}`,
                index: spreadIndex,
                // NEU: dieselbe Zone anfragen, die spread.layout gerade
                // benutzt (beim Anlegen der Doppelseite zufällig verteilt,
                // siehe pickAutoTextPos() in studioCore.js, oder seither vom
                // Nutzer in Stufe 7 von Hand geändert) - Bild und Textebene
                // fragen so garantiert nach derselben freien Fläche.
                textPos: spread.layout?.textPos,
                // NEU (KDP-Hochauflösend-Umschalter): siehe
                // app.studio.printTargetWidth() in studioCore.js.
                targetWidth: app.studio.printTargetWidth(project)
            });
            if (!result) return;

            spread.imgUrl = result.full;
            spread.thumbUrl = result.thumb;
            spread.imageMeta = result.meta;
            spread.imagePrompt = result.meta.prompt || '';
            spread.imageStatus = 'done';
            spread.imageStale = false;
            app.studio.trackImageCost(project, result.meta);

            app.dbOps.saveProject(project);
            app.render.studioWizard(6);
        } catch (e) {
            console.error('Doppelseiten-Bild konnte nicht erzeugt werden:', e);
            spread.imageStatus = 'error';
            app.dbOps.saveProject(project);
            const msg = e.message === 'API_KEY_MISSING'
                ? 'Bitte zuerst einen Gemini-API-Key in den Einstellungen eintragen.'
                : e.message;
            app.ui.toast(`Bild fehlgeschlagen: ${msg}`, '❌');
            app.render.studioWizard(6);
        } finally {
            app.state.apiBusy = false;
            app.ui.hideLoader();
        }
    },

    // NEU (Ausbaustufe 5, Panels): erzeugt JEDES Panel einer Comic-Seite
    // einzeln (eigener Bildaufruf pro Panel, siehe Dateikopf) und setzt sie
    // danach zu EINER Seite zusammen (js/studio/studioComicPanels.js). Läuft
    // über dieselbe resolveImageSourceId()-Weiche wie jedes andere Bild -
    // ohne bestätigte Bildgenerierung bleibt es beim kostenlosen Platzhalter
    // pro Panel (dann reicht auch regenerateComicPanelPlaceholders() in
    // studioCore.js, diese Funktion hier ist für die ECHTE/gemischte Lage).
    async generateComicPage(spreadIndex) {
        const project = currentProject();
        const spread = project && project.spreads[spreadIndex];
        if (!spread) return;

        const sourceId = app.studio.resolveImageSourceId();
        app.state.apiBusy = true;
        try {
            for (let i = 0; i < spread.panels.length; i++) {
                const panel = spread.panels[i];
                app.ui.showLoader('Panels werden gezeichnet...', `${i + 1} von ${spread.panels.length}${sourceId !== 'placeholder' ? ' - das kann einige Sekunden dauern' : ''}`);
                // NEU (Pollinations-Quelle): Pause VOR jedem weiteren Panel
                // außer dem ersten - ohne eigenen Account erlaubt Pollinations
                // nur ~1 Anfrage alle 15 Sekunden (siehe imageSource.js).
                if (i > 0 && sourceId === 'pollinations') {
                    await new Promise(r => setTimeout(r, app.studio.imageSource.pollinationsThrottleMs));
                }
                const result = await app.studio.imageSource.request(sourceId, {
                    formatId: 'comicPanel',
                    sketch: panel.visual || app.studio.spreadSceneHint(spread),
                    style: app.studio.buildStyleText(project.style),
                    characters: app.studio.characterRefsForPanel(project, panel),
                    characterImages: characterImagesForPanel(project, panel),
                    title: `Seite ${spreadIndex + 1}, Panel ${i + 1}`,
                    index: spreadIndex * 10 + i
                });
                if (!result) continue;
                panel.imgUrl = result.full;
                panel.thumbUrl = result.thumb;
                panel.imagePrompt = result.meta.prompt || '';
                panel.imageStatus = 'done';
                // NEU (v0.45.0-beta): Herkunft merken (Anzeige beim manuellen Austausch)
                panel.imageSource = result.meta.source;
                app.studio.trackImageCost(project, result.meta);
            }

            // NEU (KDP-Hochauflösend-Umschalter): siehe
            // app.studio.printTargetWidth() in studioCore.js.
            const composited = await app.studio.comicPanels.compositePage(spread, app.studio.printTargetWidth(project));
            if (composited) {
                spread.imgUrl = composited.full;
                spread.thumbUrl = composited.thumb;
                spread.imageStatus = 'done';
            }
            app.dbOps.saveProject(project);
            app.render.studioWizard(6);
        } catch (e) {
            console.error('Comic-Seite konnte nicht erzeugt werden:', e);
            const msg = e.message === 'API_KEY_MISSING'
                ? 'Bitte zuerst einen Gemini-API-Key in den Einstellungen eintragen.'
                : e.message;
            app.ui.toast(`Panel fehlgeschlagen: ${msg}`, '❌');
            app.dbOps.saveProject(project);
            app.render.studioWizard(6);
        } finally {
            app.state.apiBusy = false;
            app.ui.hideLoader();
        }
    },

    // "Alle Platzhalter ersetzen" (docs/KONZEPT-Bildquellen.md Abschnitt 4 /
    // docs/KONZEPT-SchreibZauber.md D.6a): ein reiner Durchlauf über alle
    // Seiten/Panels mit source 'placeholder', mit dem BEREITS gespeicherten
    // Prompt - der Prompt wird nicht neu erdacht, nur an die jetzt echte
    // Quelle geschickt (spec.rawPrompt, siehe imageSource.js). Nur möglich,
    // wenn die echte Bildgenerierung ausdrücklich bestätigt ist.
    async replaceAllPlaceholders() {
        const project = currentProject();
        if (!project) return;
        const sourceId = app.studio.resolveImageSourceId();
        if (sourceId === 'placeholder') {
            app.ui.toast('Echte Bildgenerierung ist noch nicht in den Einstellungen bestätigt.', 'ℹ️');
            return;
        }

        if (project.type === 'comic') {
            await replaceAllComicPanelPlaceholders(project, sourceId);
            return;
        }

        const targets = project.spreads
            .map((s, i) => ({ s, i }))
            .filter(({ s }) => s.imageMeta?.source === 'placeholder' && s.imagePrompt);
        if (targets.length === 0) {
            app.ui.toast('Keine Platzhalter zum Ersetzen gefunden.', 'ℹ️');
            return;
        }
        // NEU (Pollinations-Quelle): kostet nichts, dafür ohne eigenen
        // Account nur ~1 Bild alle 15 Sekunden - das darf die Abfrage vorher
        // ehrlich sagen, statt einen Geldbetrag zu nennen, der gar nicht anfällt.
        const confirmMsg = sourceId === 'gemini'
            ? `${targets.length} Platzhalter durch echte KI-Bilder ersetzen? Das kostet ca. ${(targets.length * app.studio.GEMINI_IMAGE_PRICE_USD).toFixed(2)} $ (grobe Schätzung).`
            : `${targets.length} Platzhalter durch kostenlose KI-Bilder (Pollinations) ersetzen? Das dauert wegen des Anfrage-Limits ca. ${Math.ceil(targets.length * app.studio.imageSource.pollinationsThrottleMs / 60000)} Minute(n).`;
        if (!confirm(confirmMsg)) return;

        app.ui.showLoader('Bilder werden erzeugt...', `0 von ${targets.length}`);
        app.state.apiBusy = true;
        let done = 0, failed = 0;
        try {
            for (const { s, i } of targets) {
                app.ui.showLoader('Bilder werden erzeugt...', `${done + failed} von ${targets.length}`);
                // NEU (Pollinations-Quelle): siehe Kommentar oben bei
                // generateComicPage() - dieselbe Pause vor jedem weiteren Bild.
                if (done + failed > 0 && sourceId === 'pollinations') {
                    await new Promise(r => setTimeout(r, app.studio.imageSource.pollinationsThrottleMs));
                }
                try {
                    const result = await app.studio.imageSource.request(sourceId, {
                        // NEU (KDP-Panorama): Format pro Doppelseite.
                        formatId: app.studio.spreadFormatId(project, s),
                        rawPrompt: s.imagePrompt,
                        characterImages: characterImagesFor(project, s),
                        index: i,
                        // NEU (KDP-Hochauflösend-Umschalter): siehe
                        // app.studio.printTargetWidth() in studioCore.js.
                        targetWidth: app.studio.printTargetWidth(project)
                    });
                    if (result) {
                        s.imgUrl = result.full;
                        s.thumbUrl = result.thumb;
                        s.imageMeta = result.meta;
                        s.imageStatus = 'done';
                        s.imageStale = false;
                        app.studio.trackImageCost(project, result.meta);
                        done += 1;
                    } else {
                        failed += 1;
                    }
                } catch (e) {
                    console.error(`Platzhalter auf Doppelseite ${i + 1} konnte nicht ersetzt werden:`, e);
                    failed += 1;
                }
                app.dbOps.saveProject(project);
            }
        } finally {
            app.state.apiBusy = false;
            app.ui.hideLoader();
        }

        app.ui.toast(`${done} Bild(er) erzeugt${failed ? `, ${failed} fehlgeschlagen` : ''}`, failed ? '⚠️' : '🎉');
        app.render.studioWizard(6);
    }
});

// NEU (Ausbaustufe 5, Panels): Comic-Gegenstück zu "alle Platzhalter
// ersetzen" - läuft über ALLE Panels ALLER Seiten (nicht über Seiten
// direkt), setzt betroffene Seiten danach neu zusammen.
async function replaceAllComicPanelPlaceholders(project, sourceId) {
    const targets = [];
    project.spreads.forEach((spread, spreadIndex) => {
        spread.panels.forEach((panel, panelIndex) => {
            // FIX (v0.45.0-beta): selbst eingesetzte Panels (manueller Austausch) nicht überschreiben
            if (panel.imgUrl && panel.imagePrompt && panel.imageSource !== 'upload') targets.push({ spread, panel, spreadIndex, panelIndex });
        });
    });
    if (targets.length === 0) {
        app.ui.toast('Keine Platzhalter zum Ersetzen gefunden.', 'ℹ️');
        return;
    }
    // NEU (Pollinations-Quelle): siehe replaceAllPlaceholders() oben - gleiche
    // ehrliche Ansage (Zeit statt Geld) für den kostenlosen Pfad.
    const confirmMsg = sourceId === 'gemini'
        ? `${targets.length} Panel-Platzhalter durch echte KI-Bilder ersetzen? Das kostet ca. ${(targets.length * app.studio.GEMINI_IMAGE_PRICE_USD).toFixed(2)} $ (grobe Schätzung).`
        : `${targets.length} Panel-Platzhalter durch kostenlose KI-Bilder (Pollinations) ersetzen? Das dauert wegen des Anfrage-Limits ca. ${Math.ceil(targets.length * app.studio.imageSource.pollinationsThrottleMs / 60000)} Minute(n).`;
    if (!confirm(confirmMsg)) return;

    app.ui.showLoader('Panels werden erzeugt...', `0 von ${targets.length}`);
    app.state.apiBusy = true;
    let done = 0, failed = 0;
    const touchedSpreads = new Set();
    try {
        for (const { spread, panel, spreadIndex } of targets) {
            app.ui.showLoader('Panels werden erzeugt...', `${done + failed} von ${targets.length}`);
            if (done + failed > 0 && sourceId === 'pollinations') {
                await new Promise(r => setTimeout(r, app.studio.imageSource.pollinationsThrottleMs));
            }
            try {
                const result = await app.studio.imageSource.request(sourceId, {
                    formatId: 'comicPanel',
                    rawPrompt: panel.imagePrompt,
                    characterImages: characterImagesForPanel(project, panel),
                    index: spreadIndex
                });
                if (result) {
                    panel.imgUrl = result.full;
                    panel.thumbUrl = result.thumb;
                    panel.imageSource = result.meta.source; // NEU (v0.45.0-beta)
                    app.studio.trackImageCost(project, result.meta);
                    touchedSpreads.add(spread);
                    done += 1;
                } else {
                    failed += 1;
                }
            } catch (e) {
                console.error('Panel-Platzhalter konnte nicht ersetzt werden:', e);
                failed += 1;
            }
        }
        for (const spread of touchedSpreads) {
            // NEU (KDP-Hochauflösend-Umschalter): siehe
            // app.studio.printTargetWidth() in studioCore.js.
            const composited = await app.studio.comicPanels.compositePage(spread, app.studio.printTargetWidth(project));
            if (composited) {
                spread.imgUrl = composited.full;
                spread.thumbUrl = composited.thumb;
            }
        }
        app.dbOps.saveProject(project);
    } finally {
        app.state.apiBusy = false;
        app.ui.hideLoader();
    }

    app.ui.toast(`${done} Panel(s) erzeugt${failed ? `, ${failed} fehlgeschlagen` : ''}`, failed ? '⚠️' : '🎉');
    app.render.studioWizard(6);
}
