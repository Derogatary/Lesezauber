import { app } from './core.js';

// ================= IndexedDB Speicher-Engine =================
// Jedes Buch ist ein eigener Datensatz (statt wie früher die gesamte
// Bibliothek als ein großer JSON-Text). Vorteil: viel höheres
// Speicherlimit (statt ~5-10 MB bei localStorage), und das Speichern einer
// einzelnen Seite schreibt nur noch dieses eine Buch, nicht mehr die
// komplette Bibliothek neu.
const DB_NAME = 'LeseZauberDB';
const DB_VERSION = 1;
const STORE_NAME = 'books';

// Key, unter dem die Bibliothek in der alten (localStorage-basierten)
// Version dieser App gespeichert wurde - nur für die einmalige Migration
// bestehender Bücher nötig.
const OLD_LOCALSTORAGE_KEY = 'lz_library';

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

// Einmalige Migration: bestehende Bücher aus der alten localStorage-Version
// in IndexedDB übernehmen. Betrifft nur Leute, die die App schon vorher
// benutzt haben - für alle anderen passiert hier einfach nichts.
async function migrateFromLocalStorageIfNeeded() {
    const raw = localStorage.getItem(OLD_LOCALSTORAGE_KEY);
    if (!raw) return;

    try {
        const oldLibrary = JSON.parse(raw);
        const books = Object.values(oldLibrary);
        for (const book of books) {
            await putBookInDB(book);
        }
        console.log(`${books.length} Buch/Bücher aus altem Speicher übernommen.`);
    } catch (e) {
        console.error('Migration aus altem Speicher fehlgeschlagen:', e);
    } finally {
        // In jedem Fall aufräumen, damit nicht bei jedem Start erneut
        // versucht wird zu migrieren.
        localStorage.removeItem(OLD_LOCALSTORAGE_KEY);
    }
}

Object.assign(app.dbOps, {
    // Wird einmal beim App-Start aufgerufen (siehe main.js), BEVOR die
    // erste Ansicht gerendert wird. Füllt app.library, das der Rest des
    // Codes danach ganz normal synchron liest und beschreibt wie bisher.
    async init() {
        try {
            await migrateFromLocalStorageIfNeeded();
            const books = await getAllBooksFromDB();
            app.library = {};
            books.forEach(book => { app.library[book.id] = book; });
        } catch (e) {
            console.error('Bibliothek konnte nicht geladen werden:', e);
            app.library = {};
            app.ui.toast('Bibliothek konnte nicht geladen werden.', '⚠️');
        }
    },

    saveBook(book) {
        app.library[book.id] = book;
        // Läuft im Hintergrund; der Rest der App muss darauf nicht warten,
        // da app.library (oben) sofort aktuell ist.
        putBookInDB(book).catch(e => {
            console.error('Speichern fehlgeschlagen:', e);
            app.ui.toast('Speichern fehlgeschlagen.', '⚠️');
        });
    },

    deleteBook(bookId) {
        delete app.library[bookId];
        deleteBookFromDB(bookId).catch(e => {
            console.error('Löschen konnte nicht gespeichert werden:', e);
        });
        app.nav.go('lib');
        app.ui.toast('Buch gelöscht', '🗑️');
    }
});
