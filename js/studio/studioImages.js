import { app } from '../core.js';

// ================= SchreibZauber: Die Bilder (Stufe 2, Stufe 6 im Wizard) =================
// Erst hier - NACH dem Storyboard (Stufe 5) - entsteht pro Doppelseite ein
// echtes Bild, einzeln anstoßbar, NIE automatisch fürs ganze Buch auf
// einmal (Konzept C.2, "Warum Stufe 5 vor Stufe 6 nicht übersprungen werden
// darf" - dieselbe Zurückhaltung wie beim bestehenden Persona-System, siehe
// CLAUDE.md). Ob dabei wirklich die Gemini-Bild-API oder weiterhin der
// kostenlose Platzhalter läuft, entscheidet AUSSCHLIESSLICH
// app.studio.resolveImageSourceId() (studioCore.js) anhand der
// ausdrücklichen Bestätigung in den Einstellungen - dieses Modul fragt nie
// selbst danach, ob "gemini" erlaubt ist.

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

Object.assign(app.studio, {
    // Bild EINER Doppelseite (neu) erzeugen - der zentrale Knopf der
    // Stufe 6. sketchPrompt (Stufe 5) ist die bevorzugte Bildidee, fällt auf
    // den Manuskripttext zurück, falls das Storyboard übersprungen wurde.
    async generateSpreadImage(spreadIndex) {
        const project = currentProject();
        const spread = project && project.spreads[spreadIndex];
        if (!spread) return;

        const sourceId = app.studio.resolveImageSourceId();
        app.ui.showLoader('Bild wird erzeugt...', sourceId === 'gemini' ? 'Das kann einige Sekunden dauern' : 'Platzhalter wird gezeichnet');
        app.state.apiBusy = true;
        try {
            const result = await app.studio.imageSource.request(sourceId, {
                formatId: app.studio.trimToFormat(project.spec.trim),
                sketch: spread.sketchPrompt || spread.text,
                style: app.studio.buildStyleText(project.style),
                characters: app.studio.characterRefsFor(project, spread),
                characterImages: characterImagesFor(project, spread),
                title: `Doppelseite ${spreadIndex + 1}`,
                index: spreadIndex
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

    // "Alle Platzhalter ersetzen" (docs/KONZEPT-Bildquellen.md Abschnitt 4 /
    // docs/KONZEPT-SchreibZauber.md D.6a): ein reiner Durchlauf über alle
    // Seiten mit meta.source === 'placeholder', mit dem BEREITS
    // gespeicherten Prompt (spread.imagePrompt) - der Prompt wird nicht neu
    // erdacht, nur an die jetzt echte Quelle geschickt (spec.rawPrompt,
    // siehe imageSource.js). Nur möglich, wenn die echte Bildgenerierung
    // ausdrücklich bestätigt ist - sonst gäbe es nichts zu "ersetzen".
    async replaceAllPlaceholders() {
        const project = currentProject();
        if (!project) return;
        if (app.studio.resolveImageSourceId() !== 'gemini') {
            app.ui.toast('Echte Bildgenerierung ist noch nicht in den Einstellungen bestätigt.', 'ℹ️');
            return;
        }

        const targets = project.spreads
            .map((s, i) => ({ s, i }))
            .filter(({ s }) => s.imageMeta?.source === 'placeholder' && s.imagePrompt);
        if (targets.length === 0) {
            app.ui.toast('Keine Platzhalter zum Ersetzen gefunden.', 'ℹ️');
            return;
        }
        if (!confirm(`${targets.length} Platzhalter durch echte KI-Bilder ersetzen? Das kostet ca. ${(targets.length * app.studio.GEMINI_IMAGE_PRICE_USD).toFixed(2)} $ (grobe Schätzung).`)) return;

        app.ui.showLoader('Bilder werden erzeugt...', `0 von ${targets.length}`);
        app.state.apiBusy = true;
        let done = 0, failed = 0;
        try {
            for (const { s, i } of targets) {
                app.ui.showLoader('Bilder werden erzeugt...', `${done + failed} von ${targets.length}`);
                try {
                    const result = await app.studio.imageSource.request('gemini', {
                        formatId: app.studio.trimToFormat(project.spec.trim),
                        rawPrompt: s.imagePrompt,
                        characterImages: characterImagesFor(project, s),
                        index: i
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
