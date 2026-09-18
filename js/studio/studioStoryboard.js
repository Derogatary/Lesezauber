import { app } from '../core.js';

// ================= SchreibZauber: Das Daumenkino (Stufe 2, Stufe 5 im Wizard) =================
// Konzept C.2, "Warum Stufe 5 vor Stufe 6 nicht übersprungen werden darf":
// hier wird nur die BILDIDEE je Doppelseite festgelegt (spread.sketchPrompt)
// und die Reihenfolge/Anzahl der Doppelseiten justiert - AUSDRÜCKLICH ohne
// einen einzigen echten Bildaufruf. Das eigentliche Bild entsteht erst in
// Stufe 6 (studioImages.js). Platzhalter dürfen sich hier jederzeit
// aktualisieren (kostenlos, siehe app.studio.regenerateSpreadPlaceholder in
// studioCore.js), echte Bilder NICHT.

function currentProject() {
    return app.studio.projects[app.state.currentStudioProjectId] || null;
}

function reindex(project) {
    project.spreads.forEach((s, i) => { s.index = i; });
}

Object.assign(app.studio, {
    // Bildidee von Hand eintragen/ändern - aktualisiert den Platzhalter
    // gleich mit, damit man sofort sieht, wie sich die Bildidee auf das
    // (noch unfertige) Bild auswirkt.
    async updateSketchPrompt(spreadIndex, sketchPrompt) {
        const project = currentProject();
        const spread = project && project.spreads[spreadIndex];
        if (!spread) return;
        spread.sketchPrompt = sketchPrompt;
        app.dbOps.saveProject(project);
        await app.studio.regenerateSpreadPlaceholder(spreadIndex);
        app.render.studioWizard();
    },

    // Welche Figuren kommen auf dieser Doppelseite vor (Konzept D.5 #4 -
    // NUR die referenzierten Figuren werden später als Bild-Referenz
    // mitgeschickt, keine ungefragten Nebenfiguren). Checkbox-Klick schaltet
    // die ID um.
    toggleSpreadCharacter(spreadIndex, characterId) {
        const project = currentProject();
        const spread = project && project.spreads[spreadIndex];
        if (!spread) return;
        const ids = spread.characterIds || [];
        spread.characterIds = ids.includes(characterId) ? ids.filter(id => id !== characterId) : [...ids, characterId];
        app.dbOps.saveProject(project);
        app.render.studioWizard();
    },

    // "verschieben" (Konzept C.2 Stufe 5) - Tausch mit dem Nachbarn statt
    // echtem Drag&Drop: robuster auf dem Handy, ohne eine Drag-Bibliothek
    // einzubinden, die die App sonst nirgends braucht.
    moveSpreadUp(spreadIndex) {
        const project = currentProject();
        if (!project || spreadIndex <= 0 || !project.spreads[spreadIndex]) return;
        [project.spreads[spreadIndex - 1], project.spreads[spreadIndex]] = [project.spreads[spreadIndex], project.spreads[spreadIndex - 1]];
        reindex(project);
        app.dbOps.saveProject(project);
        app.render.studioWizard();
    },

    moveSpreadDown(spreadIndex) {
        const project = currentProject();
        if (!project || !project.spreads[spreadIndex] || spreadIndex >= project.spreads.length - 1) return;
        [project.spreads[spreadIndex], project.spreads[spreadIndex + 1]] = [project.spreads[spreadIndex + 1], project.spreads[spreadIndex]];
        reindex(project);
        app.dbOps.saveProject(project);
        app.render.studioWizard();
    },

    // "zusammenfassen" (Konzept C.2 Stufe 5) - zwei Doppelseiten werden zu
    // einer. Text und Bildidee werden aneinandergehängt, der Umblätter-Moment
    // der zweiten (die ja jetzt das Ende der zusammengefassten Seite ist)
    // bleibt erhalten, Figuren-Referenzen werden vereinigt. Ein bereits
    // fertiges echtes Bild einer der beiden Seiten würde nicht mehr zum neuen,
    // längeren Text passen - deshalb wird der Bildstatus zurückgesetzt und
    // ein frischer Platzhalter gezeichnet, kein automatischer echter
    // Bildaufruf (gleiche Zurückhaltung wie überall in Stufe 2).
    async mergeSpreadWithNext(spreadIndex) {
        const project = currentProject();
        if (!project || !project.spreads[spreadIndex] || !project.spreads[spreadIndex + 1]) return;
        if (!confirm(`Doppelseite ${spreadIndex + 1} und ${spreadIndex + 2} zu einer zusammenfassen?`)) return;

        const first = project.spreads[spreadIndex];
        const second = project.spreads[spreadIndex + 1];

        first.text = [first.text, second.text].filter(Boolean).join(' ');
        first.sketchPrompt = [first.sketchPrompt, second.sketchPrompt].filter(Boolean).join(' + ');
        first.pageTurnHook = second.pageTurnHook || first.pageTurnHook;
        first.characterIds = Array.from(new Set([...(first.characterIds || []), ...(second.characterIds || [])]));
        first.imgUrl = null; first.thumbUrl = null; first.imageMeta = null;
        first.imageStatus = 'idle'; first.imageStale = false; first.imagePrompt = '';

        project.spreads.splice(spreadIndex + 1, 1);
        reindex(project);
        app.dbOps.saveProject(project);

        await app.studio.regenerateSpreadPlaceholder(spreadIndex);
        app.ui.toast('Doppelseiten zusammengefasst', '🔗');
        app.render.studioWizard();
    },

    // KI schlägt für JEDE Doppelseite eine Bildidee vor (Konzept D.4
    // "suggestSketches") - AUSDRÜCKLICH ohne Bildaufruf, reiner Text.
    // Überschreibt bereits von Hand eingetragene Bildideen nach Rückfrage,
    // damit ein versehentlicher Klick nichts unwiderruflich wegwirft.
    async suggestSketches() {
        const project = currentProject();
        if (!project || project.spreads.length === 0) return;
        const hasExisting = project.spreads.some(s => s.sketchPrompt && s.sketchPrompt.trim());
        if (hasExisting && !confirm('Es gibt bereits Bildideen für dieses Werk. Von der KI neu vorschlagen und die aktuellen ersetzen?')) {
            return;
        }

        app.ui.showLoader('Bildideen werden vorgeschlagen...', 'Die KI denkt sich Bildmotive aus');
        app.state.apiBusy = true;
        try {
            const result = await app.studio.api.suggestSketches(project);
            const sketches = Array.isArray(result.sketches) ? result.sketches : [];
            project.spreads.forEach((s, i) => {
                if (sketches[i]) s.sketchPrompt = sketches[i];
            });
            project.costLog.textCalls += 1;
            app.dbOps.saveProject(project);

            // Platzhalter aller betroffenen Seiten mit der neuen Bildidee
            // nachziehen - nacheinander, gleiches Muster wie applyManuscript()
            // in studioCore.js.
            for (let i = 0; i < project.spreads.length; i++) {
                if (sketches[i]) await app.studio.regenerateSpreadPlaceholder(i);
            }
            app.ui.toast('Bildideen vorgeschlagen', '✨');
            app.render.studioWizard();
        } catch (e) {
            console.error('Bildideen konnten nicht vorgeschlagen werden:', e);
            const msg = e.message === 'API_KEY_MISSING'
                ? 'Bitte zuerst einen Gemini-API-Key in den Einstellungen eintragen.'
                : e.message;
            app.ui.toast(msg, '❌');
        } finally {
            app.state.apiBusy = false;
            app.ui.hideLoader();
        }
    }
});
