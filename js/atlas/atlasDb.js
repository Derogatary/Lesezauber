import { app } from '../core.js';

// ================= IndexedDB Speicher-Engine =================
// Jedes Buch ist ein eigener Datensatz (statt wie früher die gesamte
// Bibliothek als ein großer JSON-Text). Vorteil: viel höheres
// Speicherlimit (statt ~5-10 MB bei localStorage), und das Speichern einer
// einzelnen Seite schreibt nur noch dieses eine Buch, nicht mehr die
// komplette Bibliothek neu.
// NEU (v0.47.0-beta): eigene Datenbank, getrennt von LeseZaubers
// "LeseZauberDB" (js/db.js) - Buchatlas-Bücher haben ein anderes
// Seitenformat und sollen weder in der LeseZauber-Bibliothek noch in
// deren Sicherungsdatei auftauchen.
// FIX: Die Migrationen der eigenständigen Buchatlas-Fassung ("alte
// LeseZauberDB übernehmen", "lz_library aus localStorage übernehmen") sind
// hier bewusst entfernt - innerhalb von LeseZauber hätten sie beim ersten
// Start sämtliche LeseZauber-Kinderbücher in den Buchatlas kopiert.
const DB_NAME = 'BuchatlasDB';
const DB_VERSION = 1;
const STORE_NAME = 'books';

let dbPromise = null;

function openDatabase() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);

        request.onupgradeneeded = (event) => {
            const db = event.target.result;
            if (!db.objectStoreNames.contains(STORE_NAME)) {
                db.createObjectStore(STORE_NAME, { keyPath: 'id' });
            }
        };

        request.onsuccess = (event) => resolve(event.target.result);
        request.onerror = (event) => reject(event.target.error);
    });
    return dbPromise;
}

async function getAllBooksFromDB() {
    const db = await openDatabase();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readonly');
        const request = tx.objectStore(STORE_NAME).getAll();
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

async function putBookInDB(book) {
    const db = await openDatabase();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        tx.objectStore(STORE_NAME).put(book);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
    });
}

async function deleteBookFromDB(id) {
    const db = await openDatabase();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        tx.objectStore(STORE_NAME).delete(id);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
    });
}

Object.assign(app.atlas.dbOps, {
    // Wird einmal beim App-Start aufgerufen (siehe Ende dieser Datei).
    // Füllt app.atlas.library, das der Rest des Codes danach ganz normal
    // synchron liest und beschreibt.
    async init() {
        try {
            const books = await getAllBooksFromDB();
            app.atlas.library = {};
            books.forEach(book => { app.atlas.library[book.id] = book; });
        } catch (e) {
            console.error('Bibliothek konnte nicht geladen werden:', e);
            app.atlas.library = {};
            app.atlas.ui.toast('Buchatlas-Bibliothek konnte nicht geladen werden.', '⚠️');
        }
    },

    saveBook(book) {
        app.atlas.library[book.id] = book;
        // Läuft im Hintergrund; der Rest der App muss darauf nicht warten,
        // da app.atlas.library (oben) sofort aktuell ist.
        putBookInDB(book).catch(e => {
            console.error('Speichern fehlgeschlagen:', e);
            app.atlas.ui.toast('Speichern fehlgeschlagen.', '⚠️');
        });
    },

    // Reine Lösch-Logik OHNE Navigation/Toast - für Einzellöschungen bitte
    // deleteBook() (unten) nutzen, das ist nur für Fälle gedacht, in denen
    // mehrere Bücher auf einmal gelöscht werden (z.B. Mehrfachauswahl in
    // der Bibliothek) und die Navigation/Meldung nur EINMAL am Ende
    // passieren soll, nicht einmal pro gelöschtem Buch.
    removeBookRecord(bookId) {
        delete app.atlas.library[bookId];
        deleteBookFromDB(bookId).catch(e => {
            console.error('Löschen konnte nicht gespeichert werden:', e);
        });
    },

    deleteBook(bookId) {
        this.removeBookRecord(bookId);
        app.atlas.nav.go('lib');
        app.atlas.ui.toast('Buch gelöscht', '🗑️');
    }
});

// NEU (v0.47.0-beta): im Hintergrund laden, ohne den LeseZauber-Start
// aufzuhalten - app.atlas.nav.show() rendert die Buchatlas-Bibliothek neu,
// sobald "ready" erfüllt ist (falls sie schon vorher geöffnet wurde).
app.atlas.dbOps.ready = app.atlas.dbOps.init();
