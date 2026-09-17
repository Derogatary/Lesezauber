import { app } from '../core.js';

// NEU (Heft-Generator, Auftrag 11 - baut auf app.api.generateWorksheets() aus
// Auftrag 10 auf): zeichnet EIN erzeugtes Übungsblatt auf Canvas - dieselbe
// Technik wie renderTextAsImageCanvas() in js/actions/epubImport.js, aber mit
// weißem statt gelblichem Hintergrund (bessere Druckqualität), großer
// kindgerechter Schrift und viel Zeilenabstand im Übungsfeld zum
// Selberschreiben/Nachspuren. Siehe docs/KONZEPT-Uebungshefte.md, Teil 2.
function drawWorksheetCanvas(sheet) {
    const width = 1200, height = 1600;
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');

    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, width, height);
    ctx.fillStyle = '#1e293b';
    ctx.textBaseline = 'top';

    // Großzügiger Rand auf allen Seiten - das Blatt soll sich auch
    // ausdrucken lassen (siehe Konzept, "Offene Punkte", Druckqualität).
    const marginX = 100;
    const maxWidth = width - marginX * 2;

    function wrapLine(text, font) {
        ctx.font = font;
        const words = (text || '').split(/\s+/).filter(Boolean);
        const lines = [];
        let line = '';
        words.forEach(word => {
            const test = line + word + ' ';
            if (ctx.measureText(test).width > maxWidth && line !== '') {
                lines.push(line.trim());
                line = word + ' ';
            } else {
                line = test;
            }
        });
        if (line.trim()) lines.push(line.trim());
        return lines;
    }

    let y = 90;

    // Überschrift
    const headingFont = 'bold 56px sans-serif';
    wrapLine(sheet.heading, headingFont).forEach(line => {
        ctx.font = headingFont;
        ctx.fillText(line, marginX, y);
        y += 68;
    });
    y += 25;

    // Aufgabenstellung
    const taskFont = '38px sans-serif';
    wrapLine(sheet.taskText, taskFont).forEach(line => {
        ctx.font = taskFont;
        ctx.fillText(line, marginX, y);
        y += 50;
    });
    y += 50;

    // Übungsfeld ("body") - deutlich größer und mit viel Zeilenabstand, weil
    // hier tatsächlich mit dem Stift gearbeitet wird (Zählen, Ankreuzen,
    // Nachspuren, Schreiben). Monospace hält die Zeichenreihen (Emojis,
    // Kästchen, Punktlinien) sauber ausgerichtet.
    const bodyFont = '48px monospace';
    const bodyLineHeight = 95;
    (sheet.body || []).forEach(rawLine => {
        if (!rawLine || !rawLine.trim()) {
            y += bodyLineHeight;
            return;
        }
        wrapLine(rawLine, bodyFont).forEach(line => {
            ctx.font = bodyFont;
            ctx.fillText(line, marginX, y);
            y += bodyLineHeight;
        });
    });

    return canvas;
}

Object.assign(app.actions, {
    // Öffnet die Auswahl-Ansicht (js/render/workbookGenerator.js) mit
    // leerem Formular - ein vorheriger Entwurf wird verworfen, damit man
    // nicht versehentlich in einem alten Vorschlag weiterarbeitet.
    openWorkbookGenerator() {
        if (!app.settings.apiKey) {
            app.ui.toast('Bitte zuerst API Key eintragen!', '🔑');
            app.nav.go('settings');
            return;
        }
        app.state.workbookGeneratorDraft = null;
        app.nav.go('workbookGenerator');
    },

    // Liest das Formular aus, ruft app.api.generateWorksheets() auf und legt
    // das Ergebnis als Entwurf ab - noch KEIN Buch. Der Nutzer kann einzelne
    // Blätter erst abwählen (app.actions.toggleWorksheetSelected), bevor
    // daraus ein Heft wird (app.actions.createWorkbookFromDraft).
    async generateWorksheetDraft() {
        const story = document.getElementById('heftGenStory').value.trim();
        const learningGoal = document.getElementById('heftGenGoal').value.trim();
        const count = parseInt(document.getElementById('heftGenCount').value, 10) || 6;
        const ownText = document.getElementById('heftGenOwnText').value.trim() || null;

        if (!story || !learningGoal) {
            app.ui.toast('Bitte Thema und Lernziel eintragen.', '⚠️');
            return;
        }

        app.ui.showLoader('Blätter werden vorgeschlagen...', 'Die KI überlegt sich passende Übungen');
        try {
            const result = await app.api.generateWorksheets({ story, learningGoal, count, ownText });
            app.state.workbookGeneratorDraft = {
                title: result.title,
                skipped: result.skipped,
                // "selected" ist reine UI-Auswahl (Standard: alle an) - erst
                // beim Anlegen des Buches ausgewertet, siehe
                // createWorkbookFromDraft().
                sheets: result.sheets.map(sheet => ({ ...sheet, selected: true }))
            };
            app.render.workbookGenerator();
        } catch (err) {
            console.error('Heft-Generator fehlgeschlagen:', err);
            app.ui.toast(err.message || 'Blätter konnten nicht erstellt werden.', '❌');
        } finally {
            app.ui.hideLoader();
        }
    },

    // Einzelnes vorgeschlagenes Blatt ab-/anwählen, bevor das Heft angelegt
    // wird (z.B. weil eine Aufgabe nicht passt oder zu einfach/schwer ist).
    toggleWorksheetSelected(index) {
        const draft = app.state.workbookGeneratorDraft;
        if (!draft || !draft.sheets[index]) return;
        draft.sheets[index].selected = !draft.sheets[index].selected;
        app.render.workbookGenerator();
    },

    // Verwirft den Entwurf und zeigt wieder das leere Formular - z.B. wenn
    // die Vorschläge nicht gefallen und mit anderen Angaben neu generiert
    // werden soll.
    resetWorkbookGeneratorDraft() {
        app.state.workbookGeneratorDraft = null;
        app.render.workbookGenerator();
    },

    // Zeichnet die ausgewählten Blätter auf Canvas (drawWorksheetCanvas()
    // oben) und legt daraus ein ganz normales Übungsheft in der Bibliothek
    // an. Die Seiten sehen danach genauso aus wie ausgelesene (imgUrl +
    // thumbUrl + fertige Variante, status 'done') - Reader, Druck,
    // Fortschritt und Kontrolle laufen deshalb unverändert.
    createWorkbookFromDraft() {
        const draft = app.state.workbookGeneratorDraft;
        const chosen = draft ? draft.sheets.filter(s => s.selected) : [];
        if (!chosen.length) {
            app.ui.toast('Bitte mindestens ein Blatt auswählen.', '⚠️');
            return;
        }

        const personaId = app.settings.persona;
        const id = 'book_' + Date.now();
        const pages = chosen.map((sheet, i) => {
            const canvas = drawWorksheetCanvas(sheet);
            const { full, thumb } = app.utils.createImageVariants(canvas, canvas.width, canvas.height);
            return {
                id: Date.now() + i,
                imgUrl: full,
                thumbUrl: thumb,
                status: 'done',
                // Kein zweiter Auslese-Aufruf nötig - die Variante steht
                // schon aus dem Generator-Aufruf fest (siehe
                // docs/KONZEPT-Uebungshefte.md, "Kein zweiter KI-Aufruf nötig").
                // Die Feldnamen der Blätter sind absichtlich identisch mit
                // dem Auslese-Schema, buildPageVariant() braucht deshalb
                // keinen Sonderfall.
                variants: { [personaId]: app.utils.buildPageVariant(sheet, {}, 'workbook') }
            };
        });

        const newBook = {
            id,
            title: draft.title,
            author: 'Heft-Generator',
            created: Date.now(),
            profileId: app.utils.resolveCreationProfileId(),
            bookType: 'workbook',
            pages
        };
        app.dbOps.saveBook(newBook);
        app.state.currentBookId = id;
        app.state.workbookGeneratorDraft = null;
        app.ui.toast('Heft angelegt!', '📝');
        app.nav.go('book');
    }
});
