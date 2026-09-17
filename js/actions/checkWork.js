import { app } from '../core.js';

// ================= Kontrolle bearbeiteter Übungsblätter =================
// Das Kind bearbeitet das Blatt auf Papier, fotografiert es und bekommt
// eine Rückmeldung vorgelesen. Die KI kennt Aufgabe und Lösung bereits aus
// der vorherigen Analyse (page.variants), muss also nur noch vergleichen.
//
// Gespeichert wird pro Seite und Profil:
//   page.check = { [profileId]: { verdict, praise, feedback, hints,
//                                 thumbUrl, checkedAt } }
// Absichtlich NUR die kleine Vorschau (ca. 300px) und nicht das volle Foto:
// sonst wächst jedes Heft mit jeder Kontrolle um ein weiteres großes Bild.

Object.assign(app.actions, {
    // Öffnet direkt die Kamera (auf dem Handy/Tablet), am PC den Dateidialog.
    triggerCheckPhoto() {
        if (!app.settings.apiKey) {
            app.ui.toast('Bitte zuerst API Key eintragen!', '🔑');
            app.nav.go('settings');
            return;
        }
        document.getElementById('checkPhotoInput').click();
    },

    async checkWorkedPage(e) {
        const file = e.target.files && e.target.files[0];
        e.target.value = ''; // gleiches Foto soll erneut wählbar sein
        if (!file) return;

        const book = app.library[app.state.currentBookId];
        const pageIdx = app.state.currentPageIdx;
        const page = book && book.pages[pageIdx];
        if (!page) return;

        const variant = app.utils.resolvePageVariant(page, app.state.readingPersonaId);
        if (!variant) {
            app.ui.toast('Dieses Blatt wurde noch nicht ausgelesen - Kontrolle geht erst danach.', 'ℹ️');
            return;
        }

        app.ui.showLoader('Ich schaue mir dein Blatt an...', 'Einen Moment bitte');
        app.state.apiBusy = true;

        try {
            const img = await app.utils.loadImageElement(file);
            const { full, thumb } = app.utils.createImageVariants(img, img.naturalWidth, img.naturalHeight);
            const b64 = full.split(',')[1];

            const result = await app.api.checkWorkedPage(b64, variant, app.state.readingPersonaId);

            const allowedVerdicts = ['richtig', 'fast', 'nochmal', 'unklar'];
            const verdict = allowedVerdicts.includes(result.verdict) ? result.verdict : 'unklar';

            const profileId = app.utils.resolveCreationProfileId();
            if (!page.check) page.check = {};
            page.check[profileId] = {
                verdict,
                praise: result.praise || '',
                feedback: result.feedback || '',
                hints: Array.isArray(result.hints) ? result.hints.filter(Boolean) : [],
                thumbUrl: thumb,
                checkedAt: Date.now()
            };
            app.dbOps.saveBook(book);

            // Alles richtig? Dann gleich abhaken - der Weg über den
            // Erledigt-Knopf wäre für ein Kind ein unnötiger zweiter Schritt.
            // Nur, wenn die Aufgabe nicht ohnehin schon abgehakt ist
            // (togglePageDone würde das Häkchen sonst wieder wegnehmen).
            if (verdict === 'richtig' && !app.progress.isPageDone(page)) {
                app.progress.togglePageDone(pageIdx);
            } else {
                app.render.reader(pageIdx);
            }

            // Vorlesen, denn das Kind kann die Rückmeldung nicht selbst lesen.
            app.tts.speakCheckResult(page.check[profileId]);
        } catch (err) {
            console.error('Kontrolle fehlgeschlagen:', err);
            app.ui.toast(`Kontrolle fehlgeschlagen: ${err.message}`, '❌');
        } finally {
            app.state.apiBusy = false;
            app.ui.hideLoader();
        }
    },

    // Rückmeldung erneut vorlesen (🔊 an der Ergebniskarte)
    speakCheckResult() {
        const book = app.library[app.state.currentBookId];
        const page = book && book.pages[app.state.currentPageIdx];
        const check = page && app.utils.resolvePageCheck(page);
        if (!check) return;
        app.tts.speakCheckResult(check);
    },

    // Ergebnis verwerfen, damit das Kind es nochmal versuchen kann, ohne
    // dass die alte Rückmeldung darunter stehen bleibt.
    clearCheckResult() {
        const book = app.library[app.state.currentBookId];
        const page = book && book.pages[app.state.currentPageIdx];
        if (!page || !page.check) return;

        delete page.check[app.utils.resolveCreationProfileId()];
        app.dbOps.saveBook(book);
        app.render.reader(app.state.currentPageIdx);
    }
});
