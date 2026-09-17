import { app } from '../core.js';

// ================= Lernfortschritt & Belohnungen =================
// Hält pro Kind-Profil fest, welche Seite bzw. welche Aufgabe schon
// erledigt ist. Die Häkchen liegen bewusst direkt am Seiten-Objekt
// (page.progress) und nicht in einem eigenen Speicher: so wandern sie
// automatisch mit Export/Import/Backup mit, und es braucht dafür keine
// neue IndexedDB-Version (Bücher werden ohnehin als ganzes Objekt
// gespeichert, zusätzliche Felder sind also gratis).
//
// page.progress sieht so aus:
//   { [profileId]: { done: true, doneAt: 1730000000000, sticker: '⭐' } }
// Fehlt das Feld ganz (alle Bücher vor dieser Funktion), gilt: nichts
// erledigt - genau richtig.

const STICKERS = ['⭐', '🌟', '🏅', '🎈', '🦄', '🚀', '🌈', '🍀', '🐝', '🌻'];
const MEDALS_KEY_PREFIX = 'lz_medals_';

// "__all__" ist nur ein Anzeigefilter, kein echtes Kind. Häkchen dürfen da
// niemals landen, sonst wären sie hinterher in keinem echten Profil zu
// sehen - resolveCreationProfileId() löst genau diesen Fall schon für
// neue Bücher, deshalb hier dieselbe Regel.
function progressProfileId() {
    return app.utils.resolveCreationProfileId();
}

function loadMedals(profileId) {
    try {
        const raw = localStorage.getItem(MEDALS_KEY_PREFIX + profileId);
        const parsed = raw ? JSON.parse(raw) : null;
        return Array.isArray(parsed) ? parsed : [];
    } catch (e) {
        console.error('Medaillen konnten nicht gelesen werden:', e);
        return [];
    }
}

function saveMedals(profileId, list) {
    try {
        localStorage.setItem(MEDALS_KEY_PREFIX + profileId, JSON.stringify(list));
    } catch (e) {
        console.error('Medaille konnte nicht gespeichert werden:', e);
        app.ui.toast('Belohnung konnte nicht gespeichert werden.', '⚠️');
    }
}

Object.assign(app.progress, {
    // Einziger sicherer Weg, den Erledigt-Status zu lesen - nie direkt
    // page.progress abfragen, sonst bricht es bei alten Büchern.
    isPageDone(page) {
        const entry = page && page.progress && page.progress[progressProfileId()];
        return !!(entry && entry.done);
    },

    // Der beim Abhaken gezogene Sticker (rein zur Belohnung/Deko).
    pageSticker(page) {
        const entry = page && page.progress && page.progress[progressProfileId()];
        return (entry && entry.sticker) || '⭐';
    },

    bookProgress(book) {
        const total = (book && book.pages) ? book.pages.length : 0;
        const done = total ? book.pages.filter(p => this.isPageDone(p)).length : 0;
        return {
            done,
            total,
            percent: total ? Math.round((done / total) * 100) : 0,
            complete: total > 0 && done === total
        };
    },

    hasMedal(bookId) {
        return loadMedals(progressProfileId()).includes(bookId);
    },

    medalCount() {
        return loadMedals(progressProfileId()).length;
    },

    // Seite/Aufgabe abhaken oder Häkchen wieder wegnehmen. Kinder tippen
    // auch mal daneben - deshalb ist beides jederzeit möglich, ohne
    // Sicherheitsabfrage.
    togglePageDone(pageIdx) {
        const book = app.library[app.state.currentBookId];
        if (!book) return;
        const page = book.pages[pageIdx];
        if (!page) return;

        const profileId = progressProfileId();
        if (!page.progress) page.progress = {};

        const wasDone = this.isPageDone(page);
        if (wasDone) {
            delete page.progress[profileId];
        } else {
            page.progress[profileId] = {
                done: true,
                doneAt: Date.now(),
                sticker: STICKERS[Math.floor(Math.random() * STICKERS.length)]
            };
        }
        app.dbOps.saveBook(book);

        const isWorkbook = app.utils.resolveBookType(book) === 'workbook';
        const status = this.bookProgress(book);
        const medals = loadMedals(profileId);
        const hadMedal = medals.includes(book.id);

        if (status.complete && !hadMedal) {
            medals.push(book.id);
            saveMedals(profileId, medals);
            app.ui.toast(isWorkbook ? 'Heft komplett geschafft!' : 'Buch komplett geschafft!', '🏆');
        } else if (!status.complete && hadMedal) {
            // Häkchen wieder weggenommen: dann muss auch die Medaille weg,
            // sonst stimmt die Zählung in der Bibliothek nicht mehr.
            saveMedals(profileId, medals.filter(id => id !== book.id));
        } else if (!wasDone) {
            app.ui.toast(isWorkbook ? 'Aufgabe erledigt!' : 'Seite geschafft!', this.pageSticker(page));
        }

        // Nur die gerade sichtbare Ansicht neu zeichnen.
        if (app.state.currentView === 'reader') {
            app.render.reader(app.state.currentPageIdx);
        } else if (app.state.currentView === 'book') {
            app.render.book(book.id);
        }
    }
});
