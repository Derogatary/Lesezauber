import { app } from '../core.js';

// ================= 🪟 Klappenbücher (v0.51.0-beta) =================
// NEU (Nutzerwunsch: "vorher als Auswahl Klappenbuch, dann können Seiten als
// Klappen für Seiten zugeordnet werden"). Ablauf:
// 1. Beim Anlegen "🪟 Klappenbuch" wählen (oder später in der Buchansicht
//    umschalten) -> book.flapBook = true.
// 2. Jede Seite einmal mit geschlossener und einmal mit geöffneter Klappe
//    fotografieren. Das Foto mit offener Klappe im ⋮-Menü "Als Klappe
//    zuordnen" -> Nummer der Hauptseite.
// 3. Die KI vergleicht beide Fotos in EINER Anfrage (app.api.analyzeFlap)
//    und beschreibt nur, was unter der Klappe NEU ist.
//
// Datenmodell an der Klappen-Seite:
//   page.flapOf  = ID der Hauptseite
//   page.excluded = true  -> bewusst: damit überspringen sie ALLE bestehenden
//                            Stellen (Analyse, Hintergrund-Vorbereitung,
//                            Auto-Vorlesen, Hörbuch, Video, Zähler), ohne dass
//                            jede einzeln angepasst werden muss
//   page.flap    = { status: 'pending'|'done'|'error', text, desc, generatedAt }
// Vorgelesen wird die Klappe beim Auto-Vorlesen der HAUPTSEITE (js/tts.js),
// nach Text und schwierigen Wörtern, vor der Bildbeschreibung.

Object.assign(app.state, {
    newBookFlaps: false
});

const FLAP_INTROS = ['Heb mal die Klappe hoch!', 'Und jetzt die nächste Klappe!', 'Noch eine Klappe - was ist wohl darunter?'];

function currentBook() {
    return app.library[app.state.currentBookId];
}

Object.assign(app.utils, {
    // Zusatzfelder für ein NEU angelegtes Buch (Kamera, Galerie, PDF, EPUB)
    newBookFlapFields() {
        return app.state.newBookFlaps && app.state.newBookType !== 'workbook' ? { flapBook: true } : {};
    },

    // Fertig ausgelesene Klappen einer Hauptseite, in Seiten-Reihenfolge
    flapsForPage(book, page) {
        if (!book || !page || !book.flapBook) return [];
        return book.pages.filter(p => p.flapOf === page.id && p.flap && p.flap.status === 'done' && (p.flap.text || p.flap.desc));
    },

    // Was beim Vorlesen einer Klappe gesagt wird (ein Sprechvorgang = eine
    // KI-Aufnahme). Feste Einleitungen, gut für den Zwischenspeicher.
    flapSpeech(flapPage, idx) {
        const intro = FLAP_INTROS[Math.min(idx, FLAP_INTROS.length - 1)];
        return [intro, flapPage.flap.text, flapPage.flap.desc].filter(Boolean).join(' ');
    }
});

Object.assign(app.actions, {
    // Schalter in "Neu anlegen als" (Bibliothek)
    toggleNewBookFlaps() {
        app.state.newBookFlaps = !app.state.newBookFlaps;
        app.render.newBookTypeButtons();
        app.ui.toast(app.state.newBookFlaps ? 'Neue Bücher werden als 🪟 Klappenbuch angelegt' : 'Neue Bücher ohne Klappen', 'ℹ️');
    },

    // Schalter in der Buchansicht (bestehendes Buch)
    toggleBookFlaps() {
        const book = currentBook();
        if (!book) return;
        const hasFlaps = book.pages.some(p => p.flapOf);
        if (book.flapBook && hasFlaps && !confirm('Klappenbuch ausschalten? Die zugeordneten Klappen werden beim Vorlesen dann nicht mehr vorgelesen (die Zuordnung bleibt gespeichert).')) return;
        book.flapBook = !book.flapBook;
        app.dbOps.saveBook(book);
        app.render.book(book.id);
        app.ui.toast(book.flapBook ? '🪟 Klappenbuch: Fotos mit offener Klappe über ⋮ → „Als Klappe zuordnen“' : 'Kein Klappenbuch mehr', 'ℹ️');
    },

    async assignFlap(pageId) {
        const book = currentBook();
        const page = book?.pages.find(p => p.id === pageId);
        if (!page) return;
        const ownIdx = book.pages.indexOf(page);
        const suggestion = ownIdx > 0 ? ownIdx : '';
        const answer = prompt(`Zu welcher Seite gehört diese Klappe? (Seitennummer der Seite mit GESCHLOSSENER Klappe)`, String(suggestion));
        if (answer === null) return;
        const baseIdx = parseInt(answer, 10) - 1;
        const base = book.pages[baseIdx];
        if (!base || base === page) {
            app.ui.toast('Diese Seitennummer gibt es nicht.', '⚠️');
            return;
        }
        if (base.flapOf) {
            app.ui.toast(`Seite ${baseIdx + 1} ist selbst eine Klappe - bitte die Hauptseite wählen.`, '⚠️');
            return;
        }
        page.flapOf = base.id;
        page.excluded = true;
        page.flap = { status: 'pending' };
        app.dbOps.saveBook(book);
        app.render.book(book.id);
        await this.analyzeFlapPage(pageId);
    },

    unassignFlap(pageId) {
        const book = currentBook();
        const page = book?.pages.find(p => p.id === pageId);
        if (!page) return;
        delete page.flapOf;
        delete page.flap;
        page.excluded = false;
        app.dbOps.saveBook(book);
        app.render.book(book.id);
        app.ui.toast('Klappe gelöst - ist wieder eine normale Seite.', '✅');
    },

    // Klappe (neu) auslesen: Hauptseite + Klappen-Foto in einer Anfrage
    async analyzeFlapPage(pageId) {
        const book = currentBook();
        const page = book?.pages.find(p => p.id === pageId);
        const base = page && book.pages.find(p => p.id === page.flapOf);
        if (!page || !base) {
            app.ui.toast('Die Hauptseite dieser Klappe gibt es nicht mehr.', '⚠️');
            return;
        }
        if (!app.settings.apiKey) {
            app.ui.toast('Klappe zugeordnet - zum Auslesen bitte erst den API Key eintragen.', '🔑');
            return;
        }
        app.state.apiBusy = true;
        app.ui.showLoader('Lese Klappe aus...', `Vergleiche Seite ${book.pages.indexOf(base) + 1} mit offener Klappe`);
        try {
            const result = await app.api.analyzeFlap(base.imgUrl.split(',')[1], page.imgUrl.split(',')[1], app.state.readingPersonaId || app.settings.persona);
            page.flap = { status: 'done', text: result.text, desc: result.desc, generatedAt: Date.now() };
            if (!result.text && !result.desc) app.ui.toast('Unter dieser Klappe hat die KI nichts Neues erkannt.', 'ℹ️');
            else app.ui.toast('Klappe ausgelesen 🪟', '✅');
        } catch (e) {
            console.error('Klappe konnte nicht ausgelesen werden:', e);
            page.flap = { status: 'error' };
            app.ui.toast(e.message === 'API_KEY_MISSING' ? 'Bitte zuerst API Key eintragen!' : `Klappe konnte nicht ausgelesen werden: ${e.message}`, '❌');
        } finally {
            app.state.apiBusy = false;
            app.ui.hideLoader();
            app.dbOps.saveBook(book);
            if (app.state.currentView === 'book') app.render.book(book.id);
        }
    },

    // Bild im Reader (und Vollbild) auf das Klappen-Foto umschalten -
    // null = zurück zur Hauptseite
    showFlapImage(flapPage) {
        const book = currentBook();
        const page = book?.pages[app.state.currentPageIdx];
        if (!page) return;
        const url = flapPage ? flapPage.imgUrl : app.utils.resolveDisplayImageUrl(page);
        const img = document.getElementById('readerImg');
        if (img) img.src = url;
        if (app.state.focusMode && app.state._focusFrontImg) app.state._focusFrontImg.src = url;
        app.state.openFlapId = flapPage ? flapPage.id : null;
        app.render.readerFlaps?.();
    },

    // Knöpfe im Reader: Klappe auf-/zuklappen und vorlesen
    toggleReaderFlap(flapId) {
        const book = currentBook();
        const flapPage = book?.pages.find(p => p.id === flapId);
        if (!flapPage) return;
        if (app.state.openFlapId === flapId) {
            app.tts.stop?.();
            this.showFlapImage(null);
            return;
        }
        this.showFlapImage(flapPage);
        const idx = app.utils.flapsForPage(book, book.pages[app.state.currentPageIdx]).indexOf(flapPage);
        app.tts.speak(app.utils.flapSpeech(flapPage, Math.max(0, idx)), null, 'readerFlapText');
    }
});
