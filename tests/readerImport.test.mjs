// Import-Planung, Buchbau und atomarer Schreibzugriff (mit einer kleinen In-Memory-IndexedDB-Attrappe).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { loadReaderPackage } from '../js/readerPackage/packageLoader.js';
import { planReaderImport } from '../js/readerPackage/readerImportPlan.js';
import { buildLibraryBook, readerLibraryIndex, PREVIEW_NOTICE } from '../js/readerPackage/bookBuilder.js';
import { commitReaderBook, ReaderStoreError } from '../js/readerPackage/readerStore.js';
import { makePackage } from './readerPackageFixtures.mjs';

const PERSONAS = ['standard', 'papa'];
const img = (c) => ({ full: `data:image/webp;base64,${c}`, thumb: `data:image/webp;base64,${c}` });
const images = new Map([['asset-cover', img('AA')], ['asset-il1', img('BB')], ['asset-il1b', img('CC')]]);
const placeholder = () => img('PH');
async function importOf(opts, library = {}) {
    const pkg = await loadReaderPackage(makePackage(opts).zip());
    const plan = await planReaderImport(pkg.manifest, pkg.files, readerLibraryIndex(library));
    const book = buildLibraryBook(pkg, { personaIds: PERSONAS, images, placeholder, now: 1000 });
    return { pkg, plan, book };
}

test('Planung: ADD_BOOK, ALREADY_INSTALLED (idempotent), ADD_EDITION fuer neueren Stand', async () => {
    const first = await importOf({ decisionId: 'dec1', snapshotNo: 1 });
    assert.equal(first.plan.action, 'ADD_BOOK');
    const library = { [first.book.id]: { ...first.book, lastReadIdx: 3 } };
    const again = await importOf({ decisionId: 'dec1', snapshotNo: 1 }, library);
    assert.equal(again.plan.action, 'ALREADY_INSTALLED');
    assert.equal(again.plan.existingLocalId, first.book.id);
    assert.equal(again.plan.keepReadingPosition, 3);
    const newer = await importOf({ decisionId: 'dec2', snapshotNo: 2, chapters: [{ id: 'ch1', title: 'Neu', lines: ['Geaendert.'], images: [] }], withCover: false }, library);
    assert.equal(newer.plan.action, 'ADD_EDITION');
    assert.deepEqual([...newer.plan.previousEditionIds], [first.book.id]);
    assert.notEqual(newer.book.id, first.book.id);
});

test('Buchbau: Titelseite, Kapitelseiten, Bilder, alle Personas, keine KI-Auslese', async () => {
    const { book } = await importOf({});
    assert.match(book.id, /^lz_[a-f0-9]{64}$/);
    assert.equal(book.origin, 'scan'); // Video-Export bleibt hinter der Passwort-Bremse
    assert.equal(book.approvedForKids, undefined);
    assert.equal(book.readerPackage.audience, 'PRIVATE_READER_PREVIEW');
    assert.equal(book.readerPackage.notice, PREVIEW_NOTICE);
    // Titelseite + Kapitel1 (1 Textseite + 1 Bildseite fuer das zweite Bild) + Kapitel2
    assert.equal(book.pages.length, 4);
    assert.equal(book.coverPageId, book.pages[0].id);
    assert.equal(book.pages[0].imgUrl, images.get('asset-cover').full);
    assert.equal(book.pages[1].chapterTitle, 'Erstes Kapitel');
    assert.equal(book.pages[1].imgUrl, images.get('asset-il1').full);
    assert.equal(book.pages[1].variants.standard.desc, 'Alt asset-il1');
    assert.deepEqual(book.pages[1].readerPackage.segmentIds, ['ch1-1', 'ch1-2']);
    assert.equal(book.pages[2].readerPackage.imageOnly, true);
    assert.equal(book.pages[3].imgUrl, img('PH').full); // Kapitel ohne Bild -> Platzhalter
    assert.equal(new Set(book.pages.map(p => p.id)).size, book.pages.length);
    for (const page of book.pages) {
        assert.equal(page.status, 'done');
        assert.equal(page.noAnalysis, true);
        for (const persona of PERSONAS) assert.ok(page.variants[persona].text.length > 0);
    }
    assert.equal(book.pages[1].variants.papa.text, 'Ein erfundener Satz eins.\nEin erfundener Satz zwei.');
    // der Datensatz muss die Backup-Pruefung der App passieren (nur data:image-URLs, sichere IDs)
    await import('./helpers.mjs');
    const { cleanImportedBook } = await import('../js/actions/backup.js');
    const cleaned = cleanImportedBook(structuredClone(book));
    assert.equal(cleaned.pages.length, book.pages.length);
    assert.ok(cleaned.pages.every(p => typeof p.imgUrl === 'string'));
});

test('lange Kapitel werden auf mehrere Seiten verteilt, Segment-Reihenfolge bleibt', async () => {
    const lines = Array.from({ length: 30 }, (_, i) => `Erfundener Absatz Nummer ${i + 1} ` + 'x'.repeat(120));
    const { book } = await importOf({ chapters: [{ id: 'chA', title: 'Lang', lines, images: [] }], withCover: false });
    const chapterPages = book.pages.filter(p => p.readerPackage.chapterId === 'chA');
    assert.ok(chapterPages.length > 1);
    assert.deepEqual(chapterPages.flatMap(p => p.readerPackage.segmentIds), lines.map((_, i) => `chA-${i + 1}`));
    assert.equal(chapterPages.filter(p => p.chapterTitle).length, 1);
});

// ---- In-Memory-Attrappe der IndexedDB ------------------------------------------------------------------
function fakeDb(seed = {}) {
    const stores = new Map(Object.entries(seed).map(([name, list]) => [name, new Map(list.map(r => [r.id ?? r.key ?? r.word, structuredClone(r)]))]));
    const log = { scopes: [] };
    return {
        version: 5, stores, log,
        transaction(names, mode) {
            log.scopes.push({ names: [].concat(names), mode });
            const allowed = [].concat(names);
            const tx = { error: null, oncomplete: null, onabort: null, onerror: null, _requests: [] };
            const staged = [];
            let failed = null;
            tx.objectStore = (name) => {
                if (!allowed.includes(name)) throw new Error('NotFoundError: ' + name);
                return {
                    add(value) {
                        const request = { error: null, onerror: null };
                        const exists = stores.get(name).has(value.id) || staged.some(s => s.name === name && s.value.id === value.id);
                        if (exists) { request.error = { name: 'ConstraintError' }; failed = request.error; } else staged.push({ name, value: structuredClone(value) });
                        tx._requests.push(request);
                        return request;
                    },
                    put() { throw new Error('put() darf der Import nie benutzen'); },
                };
            };
            tx.abort = () => { failed = failed || { name: 'AbortError' }; };
            setTimeout(() => {
                for (const r of tx._requests) if (r.error) r.onerror?.();
                if (failed || tx._forceFail) { tx.error = failed || tx._forceFail; tx.onabort?.(); return; }
                for (const s of staged) stores.get(s.name).set(s.value.id, s.value);
                tx.oncomplete?.();
            }, 0);
            return tx;
        },
    };
}
const rows = (db, name) => [...db.stores.get(name).values()];
const snapshotOthers = (db) => JSON.stringify([...db.stores].filter(([n]) => n !== 'books').map(([n, m]) => [n, [...m.entries()]]));

test('Schreibzugriff: eine Transaktion nur auf "books", add() statt put(), Version bleibt 5, andere Stores unveraendert', async () => {
    const { book } = await importOf({});
    const db = fakeDb({ books: [], voiceRecordings: [{ key: 'b|1|mama', blob: 'x' }], projects: [{ id: 'p1' }], vocabulary: [{ word: 'Hund' }], ttsCache: [{ key: 'k' }] });
    const before = snapshotOthers(db);
    await commitReaderBook(db, book);
    assert.deepEqual(db.log.scopes, [{ names: ['books'], mode: 'readwrite' }]);
    assert.equal(db.version, 5);
    assert.deepEqual([...db.stores.keys()].sort(), ['books', 'projects', 'ttsCache', 'vocabulary', 'voiceRecordings']);
    assert.equal(rows(db, 'books').length, 1);
    assert.equal(snapshotOthers(db), before, 'Mikrofonaufnahmen, Projekte, Vokabeln, TTS-Cache unveraendert');
});

test('Schreibzugriff: bestehende Buecher inkl. Leseposition bleiben unberuehrt, ADD_EDITION behaelt die alte Ausgabe', async () => {
    const first = await importOf({ decisionId: 'dec1', snapshotNo: 1 });
    const user = { id: 'book_123', title: 'Mein Foto-Buch', pages: [{ id: 1, imgUrl: 'data:image/webp;base64,ZZ' }], lastReadIdx: 7, progress: {} };
    const db = fakeDb({ books: [user] });
    await commitReaderBook(db, { ...first.book, lastReadIdx: 2 });
    const library = Object.fromEntries(rows(db, 'books').map(b => [b.id, b]));
    const newer = await importOf({ decisionId: 'dec2', snapshotNo: 2 }, library);
    assert.equal(newer.plan.action, 'ADD_EDITION');
    await commitReaderBook(db, newer.book);
    assert.equal(rows(db, 'books').length, 3);
    assert.deepEqual(db.stores.get('books').get('book_123'), user);
    assert.equal(db.stores.get('books').get(first.book.id).lastReadIdx, 2);
});

test('Schreibzugriff: zweiter Import desselben Pakets -> ALREADY_INSTALLED, nichts ueberschrieben', async () => {
    const { book } = await importOf({});
    const db = fakeDb({ books: [] });
    await commitReaderBook(db, book);
    await assert.rejects(commitReaderBook(db, { ...book, title: 'anders', lastReadIdx: 9 }), err => err instanceof ReaderStoreError && err.code === 'ALREADY_INSTALLED');
    assert.equal(rows(db, 'books').length, 1);
    assert.equal(rows(db, 'books')[0].title, book.title);
});

test('Schreibzugriff: Speicher voll -> nichts geschrieben, verstaendliche Meldung', async () => {
    const { book } = await importOf({});
    const db = fakeDb({ books: [] });
    const original = db.transaction.bind(db);
    db.transaction = (n, m) => { const tx = original(n, m); tx._forceFail = { name: 'QuotaExceededError' }; return tx; };
    await assert.rejects(commitReaderBook(db, book), err => err.code === 'QUOTA');
    assert.equal(rows(db, 'books').length, 0);
});

test('Schreibzugriff: nur Vorschau-Buecher mit lz_-ID werden angenommen', async () => {
    const { book } = await importOf({});
    const db = fakeDb({ books: [] });
    await assert.rejects(commitReaderBook(db, { ...book, id: 'book_1' }), err => err.code === 'INVALID_BOOK');
    await assert.rejects(commitReaderBook(db, { ...book, readerPackage: { ...book.readerPackage, audience: 'PUBLIC' } }), err => err.code === 'INVALID_BOOK');
    assert.equal(db.log.scopes.length, 0);
});

test('Guard: kein Schema-Upgrade, kein Netzwerk, kein Zugriff auf Profile/Aufnahmen/Atlas im Import-Code', () => {
    const dbSrc = readFileSync(new URL('../js/db.js', import.meta.url), 'utf8');
    assert.match(dbSrc, /const DB_VERSION = 5;/);
    assert.equal((dbSrc.match(/createObjectStore\(/g) || []).length, 5);
    const strip = (src) => src.replace(/\/\/.*$/gm, '');
    const action = strip(readFileSync(new URL('../js/actions/readerPackageImport.js', import.meta.url), 'utf8'));
    for (const forbidden of [/fetch\(/, /XMLHttpRequest/, /WebSocket/, /sendBeacon/, /localStorage/, /voice/i, /indexedDB/i, /BuchatlasDB/, /app\.profiles/])
        assert.doesNotMatch(action, forbidden, String(forbidden));
    for (const file of ['zipReader', 'packageLoader', 'bookBuilder', 'readerStore', 'imageInfo', 'readerPackageV1', 'readerImportPlan']) {
        const src = strip(readFileSync(new URL(`../js/readerPackage/${file}.js`, import.meta.url), 'utf8'));
        assert.doesNotMatch(src, /fetch\(|XMLHttpRequest|WebSocket|sendBeacon|localStorage|indexedDB/, file);
    }
});

test('studio export receipt with its optional assets provenance list is accepted; malformed assets are refused', async () => {
    const H = 'a'.repeat(64);
    const good = [{ assetId: 'asset-cover', packageAssetId: 'asset-cover', sha256: H, sourceSha256: H, metadataRemoved: 0 }];
    await loadReaderPackage(makePackage({ tweak: { receipt: r => { r.assets = good; } } }).zip());
    await assert.rejects(loadReaderPackage(makePackage({ tweak: { receipt: r => { r.assets = [{ assetId: 'x' }]; } } }).zip()),
        e => e.code === 'RECEIPT_MISMATCH');
});

test('studio chapter sidecar images carry packageAssetId (merged duplicates): the manifest id wins, a stranger id is refused', async () => {
    const alias = (side) => { side.images = side.images.map(i => ({ assetId: 'studio-' + i.assetId, packageAssetId: i.assetId, role: i.role })); };
    const pkg = await loadReaderPackage(makePackage({ tweak: { sidecar: alias } }).zip());
    const book = buildLibraryBook(pkg, { personaIds: PERSONAS, images, placeholder, now: 1000 });
    assert.ok(book.pages.some(p => p.imgUrl === 'data:image/webp;base64,BB'), 'chapter image resolved through packageAssetId');
    await assert.rejects(loadReaderPackage(makePackage({ tweak: { sidecar: side => { side.images = side.images.map(i => ({ ...i, packageAssetId: 'nope' })); } } }).zip()),
        e => e.code === 'INVALID_CHAPTER_JSON');
});
