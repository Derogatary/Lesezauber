import { app } from './core.js';

// ================= IndexedDB Speicher-Engine =================
// Jedes Buch ist ein eigener Datensatz (statt wie früher die gesamte
// Bibliothek als ein großer JSON-Text). Vorteil: viel höheres
// Speicherlimit (statt ~5-10 MB bei localStorage), und das Speichern einer
// einzelnen Seite schreibt nur noch dieses eine Buch, nicht mehr die
// komplette Bibliothek neu.
const DB_NAME = 'LeseZauberDB';
// NEU: Version 4 - zusätzlicher Speicher für SchreibZauber-Werke (siehe
// js/studio/studioCore.js). Bereits vorhandene Bücher/Vokabeln/Stimmen
// bleiben beim Upgrade unangetastet erhalten - die Migration fügt nur
// den neuen Store hinzu, löscht nichts.
const DB_VERSION = 4;
const STORE_NAME = 'books';
const VOCAB_STORE_NAME = 'vocabulary';
const TTS_STORE_NAME = 'ttsCache';
const PROJECTS_STORE_NAME = 'projects';

// Obergrenze für zwischengespeicherte Sprachaufnahmen. Beim Überschreiten
// werden die ältesten gelöscht - sonst wächst der Speicher bei einer
// vielgenutzten Bibliothek unbegrenzt.
// FIX: Anzahl allein reicht als Grenze nicht. Gemini liefert
// unkomprimiertes WAV (ca. 1 MB je Buchseite), die anderen Anbieter MP3
// (ca. 40 KB) - 600 Gemini-Aufnahmen wären mehrere hundert MB gewesen und
// hätten auf dem Handy den Platz für die Bücher selbst verdrängt. Deshalb
// zusätzlich eine Größengrenze, die in der Praxis zuerst greift.
const TTS_CACHE_MAX_ENTRIES = 600;
const TTS_CACHE_MAX_BYTES = 100 * 1024 * 1024;

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
            if (!db.objectStoreNames.contains(VOCAB_STORE_NAME)) {
                db.createObjectStore(VOCAB_STORE_NAME, { keyPath: 'word' });
            }
            // NEU: Zwischenspeicher für KI-Stimmen. Der Index auf "created"
            // wird nur fürs Aufräumen der ältesten Einträge gebraucht.
            if (!db.objectStoreNames.contains(TTS_STORE_NAME)) {
                const ttsStore = db.createObjectStore(TTS_STORE_NAME, { keyPath: 'key' });
                ttsStore.createIndex('created', 'created');
            }
            // NEU: SchreibZauber-Werke (Werkstatt-Projekte) - siehe
            // docs/KONZEPT-SchreibZauber.md. Ein eigener Store, kein Teil
            // von "books": ein Projekt ist die Werkstatt drumherum, kein
            // fertiges Buch (das entsteht erst beim "Ins Regal stellen").
            if (!db.objectStoreNames.contains(PROJECTS_STORE_NAME)) {
                db.createObjectStore(PROJECTS_STORE_NAME, { keyPath: 'id' });
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

// NEU: Vokabel-Speicherfunktionen (gleiches Muster wie bei Büchern)
async function getAllVocabFromDB() {
    const db = await openDatabase();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(VOCAB_STORE_NAME, 'readonly');
        const request = tx.objectStore(VOCAB_STORE_NAME).getAll();
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

async function putVocabInDB(entry) {
    const db = await openDatabase();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(VOCAB_STORE_NAME, 'readwrite');
        tx.objectStore(VOCAB_STORE_NAME).put(entry);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
    });
}

// NEU: Zwischenspeicher für KI-Stimmen. Jede erzeugte Sprachaufnahme
// kostet Geld bzw. Kontingent - dieselbe Seite ein zweites Mal vorlesen
// soll deshalb nichts mehr kosten und sofort starten.
async function getTtsFromDB(key) {
    const db = await openDatabase();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(TTS_STORE_NAME, 'readonly');
        const request = tx.objectStore(TTS_STORE_NAME).get(key);
        request.onsuccess = () => resolve(request.result || null);
        request.onerror = () => reject(request.error);
    });
}

async function putTtsInDB(entry) {
    const db = await openDatabase();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(TTS_STORE_NAME, 'readwrite');
        tx.objectStore(TTS_STORE_NAME).put(entry);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
    });
}

// Älteste Einträge löschen, sobald Anzahl ODER Gesamtgröße die Grenze
// überschreiten. Läuft von der neuesten zur ältesten Aufnahme und behält,
// was ins Budget passt - alles dahinter fliegt raus.
async function pruneTtsCache() {
    const db = await openDatabase();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(TTS_STORE_NAME, 'readwrite');
        const store = tx.objectStore(TTS_STORE_NAME);

        let keptCount = 0;
        let keptBytes = 0;

        // 'prev' = neueste zuerst
        const cursorRequest = store.index('created').openCursor(null, 'prev');
        cursorRequest.onsuccess = (event) => {
            const cursor = event.target.result;
            if (!cursor) return;

            const bytes = cursor.value.bytes || 0;
            if (keptCount + 1 > TTS_CACHE_MAX_ENTRIES || keptBytes + bytes > TTS_CACHE_MAX_BYTES) {
                cursor.delete();
            } else {
                keptCount++;
                keptBytes += bytes;
            }
            cursor.continue();
        };

        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
    });
}

// NEU: SchreibZauber-Projekte (gleiches Muster wie Bücher)
async function getAllProjectsFromDB() {
    const db = await openDatabase();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(PROJECTS_STORE_NAME, 'readonly');
        const request = tx.objectStore(PROJECTS_STORE_NAME).getAll();
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

async function putProjectInDB(project) {
    const db = await openDatabase();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(PROJECTS_STORE_NAME, 'readwrite');
        tx.objectStore(PROJECTS_STORE_NAME).put(project);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
    });
}

async function deleteProjectFromDB(id) {
    const db = await openDatabase();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(PROJECTS_STORE_NAME, 'readwrite');
        tx.objectStore(PROJECTS_STORE_NAME).delete(id);
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
        localStorage.removeItem(OLD_LOCALSTORAGE_KEY);
    }
}

Object.assign(app.dbOps, {
    // Wird einmal beim App-Start aufgerufen (siehe main.js), BEVOR die
    // erste Ansicht gerendert wird. Füllt app.library und app.vocabulary,
    // die der Rest des Codes danach ganz normal synchron liest/beschreibt.
    async init() {
        try {
            await migrateFromLocalStorageIfNeeded();

            const books = await getAllBooksFromDB();
            app.library = {};
            books.forEach(book => { app.library[book.id] = book; });

            const vocab = await getAllVocabFromDB();
            app.vocabulary = {};
            vocab.forEach(entry => { app.vocabulary[entry.word] = entry; });

            // NEU: SchreibZauber-Werke laden - app.studio.projects existiert
            // bereits als leeres Objekt (siehe js/studio/studioCore.js),
            // hier wird es wie app.library befüllt.
            const projects = await getAllProjectsFromDB();
            app.studio.projects = {};
            projects.forEach(project => { app.studio.projects[project.id] = project; });
        } catch (e) {
            console.error('Bibliothek konnte nicht geladen werden:', e);
            app.library = {};
            app.vocabulary = {};
            app.studio.projects = {};
            app.ui.toast('Bibliothek konnte nicht geladen werden.', '⚠️');
        }
    },

    saveBook(book) {
        app.library[book.id] = book;
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
    },

    // NEU: SchreibZauber-Projekt speichern/löschen - gleiches Muster wie
    // saveBook()/deleteBook(). Die Navigation nach dem Löschen übernimmt
    // der Aufrufer (app.studio.deleteProject), da ein Projekt anders als
    // ein Buch aus mehreren Ansichten heraus gelöscht werden kann.
    saveProject(project) {
        app.studio.projects[project.id] = project;
        putProjectInDB(project).catch(e => {
            console.error('Werk konnte nicht gespeichert werden:', e);
            app.ui.toast('Werk konnte nicht gespeichert werden.', '⚠️');
        });
    },

    deleteProject(projectId) {
        delete app.studio.projects[projectId];
        deleteProjectFromDB(projectId).catch(e => {
            console.error('Werk konnte nicht gelöscht werden:', e);
        });
    },

    // NEU: eine Vokabel speichern/aktualisieren
    saveVocabEntry(entry) {
        app.vocabulary[entry.word] = entry;
        putVocabInDB(entry).catch(e => {
            console.error('Vokabel konnte nicht gespeichert werden:', e);
        });
    },

    // NEU: gespeicherte KI-Sprachaufnahme holen. Fehler sind hier bewusst
    // kein Drama - dann wird die Aufnahme eben neu erzeugt.
    async getTtsAudio(key) {
        try {
            return await getTtsFromDB(key);
        } catch (e) {
            console.error('Stimmen-Speicher konnte nicht gelesen werden:', e);
            return null;
        }
    },

    async saveTtsAudio(entry) {
        try {
            await putTtsInDB(entry);
            await pruneTtsCache();
        } catch (e) {
            // Häufigster Fall: Gerätespeicher voll. Das Vorlesen selbst
            // funktioniert trotzdem, nur eben ohne Zwischenspeicher.
            console.error('Stimme konnte nicht zwischengespeichert werden:', e);
        }
    },

    // Für die Anzeige in den Einstellungen (Anzahl + belegter Platz).
    async getTtsCacheStats() {
        try {
            const db = await openDatabase();
            return await new Promise((resolve, reject) => {
                const tx = db.transaction(TTS_STORE_NAME, 'readonly');
                // FIX: per Cursor zählen statt getAll() - sonst würden zum
                // reinen Anzeigen der Belegung alle Audiodateien auf einmal
                // geladen.
                const cursorRequest = tx.objectStore(TTS_STORE_NAME).openCursor();
                let count = 0;
                let bytes = 0;
                cursorRequest.onsuccess = (event) => {
                    const cursor = event.target.result;
                    if (!cursor) return;
                    count++;
                    bytes += cursor.value.bytes || 0;
                    cursor.continue();
                };
                tx.oncomplete = () => resolve({ count, bytes });
                tx.onerror = () => reject(tx.error);
            });
        } catch (e) {
            console.error('Stimmen-Speicher konnte nicht gelesen werden:', e);
            return { count: 0, bytes: 0 };
        }
    },

    async clearTtsCache() {
        try {
            const db = await openDatabase();
            await new Promise((resolve, reject) => {
                const tx = db.transaction(TTS_STORE_NAME, 'readwrite');
                tx.objectStore(TTS_STORE_NAME).clear();
                tx.oncomplete = () => resolve();
                tx.onerror = () => reject(tx.error);
            });
            app.ui.toast('Gespeicherte Stimmen gelöscht', '🗑️');
        } catch (e) {
            console.error('Stimmen-Speicher konnte nicht geleert werden:', e);
            app.ui.toast('Stimmen-Speicher konnte nicht geleert werden.', '⚠️');
        }
        app.render.settings();
    }
});
