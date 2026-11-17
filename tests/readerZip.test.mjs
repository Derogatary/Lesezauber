import test from 'node:test';
import assert from 'node:assert/strict';
import { readZip, checkEntryName, ZipReadError, ZIP_LIMITS } from '../js/readerPackage/zipReader.js';
import { loadReaderPackage } from '../js/readerPackage/packageLoader.js';
import { inspectImage } from '../js/readerPackage/imageInfo.js';
import { ReaderPackageError } from '../js/readerPackage/readerPackageV1.js';
import { buildZip, makePackage, png, jpeg, sha } from './readerPackageFixtures.mjs';

const enc = new TextEncoder();
const rejects = (promise, code) => assert.rejects(promise, err => (err instanceof ZipReadError || err instanceof ReaderPackageError) && err.code === code,
    `erwartet ${code}`);
const one = (name, bytes = enc.encode('{}'), extra = {}) => buildZip([{ name, bytes, method: 8, ...extra }]);

test('gueltiges Studio-Paket wird gelesen und geprueft', async () => {
    const pkg = makePackage({ title: 'Erfundenes Testbuch' });
    const loaded = await loadReaderPackage(pkg.zip());
    assert.equal(loaded.summary.title, 'Erfundenes Testbuch');
    assert.equal(loaded.summary.chapters, 2);
    assert.equal(loaded.summary.images, 3);
    assert.equal(loaded.summary.audience, 'PRIVATE_READER_PREVIEW');
    assert.equal(loaded.summary.decisionId, 'dec1');
    assert.equal(loaded.summary.manifestSha256, pkg.manifestSha);
    assert.equal(loaded.files.size, 3);
});

test('Namen: Traversal, absolut, Backslash, Steuerzeichen', async () => {
    for (const name of ['../evil.json', 'assets/../manifest.json', '/etc/passwd', 'C:/x.json', 'chapters\\a.json', 'a\u0000b.json', './manifest.json', 'chapters//a.json'])
        assert.throws(() => checkEntryName(name), err => err.code === 'UNSAFE_ZIP_NAME', name);
    await rejects(readZip(one('../manifest.json')), 'UNSAFE_ZIP_NAME');
    await rejects(readZip(one('chapters\\x.json')), 'UNSAFE_ZIP_NAME');
});

test('unbekannter Eintrag (Name ausserhalb der festen Formen)', async () => {
    await rejects(readZip(one('readme.txt')), 'UNEXPECTED_ENTRY');
    await rejects(readZip(one('assets/evil.exe')), 'UNEXPECTED_ENTRY');
    await rejects(readZip(one('chapters/')), 'UNSAFE_ZIP_NAME'); // Verzeichnis-Eintrag
    await rejects(readZip(one('assets/' + 'A'.repeat(64) + '.png')), 'UNEXPECTED_ENTRY'); // nur Kleinbuchstaben-Hex
});

test('doppelte Namen (auch nur durch Gross/Klein)', async () => {
    const e = { bytes: enc.encode('{}'), method: 0 };
    await rejects(readZip(buildZip([{ name: 'manifest.json', ...e }, { name: 'manifest.json', ...e }])), 'DUPLICATE_ZIP_NAME');
    await rejects(readZip(buildZip([{ name: 'book.json', ...e }, { name: 'BOOK.json', ...e }])), 'UNEXPECTED_ENTRY');
    const hex = 'a'.repeat(64);
    await rejects(readZip(buildZip([{ name: `assets/${hex}.png`, ...e }, { name: `assets/${hex}.png`, ...e }])), 'DUPLICATE_ZIP_NAME');
});

test('Kompressionsbombe: Verhaeltnis > 100:1 wird vor dem Entpacken abgelehnt', async () => {
    const zeros = new Uint8Array(5 * 1024 * 1024); // 5 MiB Nullen -> wenige KB gepackt
    await rejects(readZip(one('manifest.json', zeros)), 'ZIP_RATIO');
});

test('Bombe mit gelogener Groesse: Entpacken bricht bei Ueberschreitung ab', async () => {
    const zeros = new Uint8Array(2 * 1024 * 1024);
    const zip = buildZip([{ name: 'book.json', bytes: zeros, method: 8, lieSize: 1000, lieCompressed: undefined }]);
    // deklariert 1000 Bytes (Verhaeltnis unter Schwelle), tatsaechlich 2 MiB
    await rejects(readZip(zip), 'SIZE_MISMATCH');
});

test('Gesamtgrenzen und Eintragszahl (mit kleinen Testlimits)', async () => {
    const e = (n) => ({ name: `chapters/c${n}.json`, bytes: enc.encode('{"a":1}'), method: 0 });
    const zip = buildZip([e(1), e(2), e(3)]);
    await rejects(readZip(zip, { maxEntries: 2 }), 'ZIP_TOO_MANY_ENTRIES');
    await rejects(readZip(zip, { maxUncompressedTotal: 10 }), 'ZIP_TOO_LARGE');
    await rejects(readZip(zip, { maxCompressedTotal: 50 }), 'ZIP_TOO_LARGE');
    await rejects(readZip(zip, { maxJsonBytes: 3 }), 'ZIP_ENTRY_TOO_LARGE');
    assert.equal(ZIP_LIMITS.maxCompressedTotal, 200 * 1024 * 1024);
    assert.equal(ZIP_LIMITS.maxUncompressedTotal, 250 * 1024 * 1024);
    assert.equal(ZIP_LIMITS.maxEntries, 2000);
    assert.equal(ZIP_LIMITS.maxRatio, 100);
});

test('falsche CRC32', async () => {
    await rejects(readZip(one('book.json', enc.encode('{"a":1}'), { crc: 0x12345678 })), 'CRC_MISMATCH');
    await rejects(readZip(buildZip([{ name: 'book.json', bytes: enc.encode('{"a":1}'), method: 0, crc: 1 }])), 'CRC_MISMATCH');
});

test('verschluesselt, ZIP64, unbekannte Methode, Kommentar, Anhang', async () => {
    await rejects(readZip(one('book.json', enc.encode('{}'), { flags: 0x0801 })), 'ZIP_ENCRYPTED');
    await rejects(readZip(buildZip([{ name: 'book.json', bytes: enc.encode('{}'), method: 12 }])), 'ZIP_METHOD_UNSUPPORTED');
    await rejects(readZip(buildZip([{ name: 'book.json', bytes: enc.encode('{}'), method: 0 }], { eocd: v => v.setUint32(16, 0xffffffff, true) })), 'ZIP64_UNSUPPORTED');
    await rejects(readZip(buildZip([{ name: 'book.json', bytes: enc.encode('{}'), method: 0, extra: Uint8Array.from([1, 0, 0, 0]) }])), 'ZIP64_UNSUPPORTED');
    await rejects(readZip(buildZip([{ name: 'book.json', bytes: enc.encode('{}'), method: 0 }], { comment: enc.encode('x') })), 'ZIP_INVALID');
    const ok = buildZip([{ name: 'book.json', bytes: enc.encode('{}'), method: 0 }]);
    const trailing = new Uint8Array(ok.length + 3); trailing.set(ok);
    await rejects(readZip(trailing), 'ZIP_INVALID');
});

test('Data-Descriptor: korrekt wird gelesen, falsche Werte werden abgelehnt', async () => {
    const body = enc.encode('{"ok":true}');
    for (const descriptor of [true, 'nosig']) {
        const { entries } = await readZip(buildZip([{ name: 'book.json', bytes: body, method: 8, descriptor }]));
        assert.equal(new TextDecoder().decode(entries.get('book.json')), '{"ok":true}');
    }
    await rejects(readZip(buildZip([{ name: 'book.json', bytes: body, method: 8, descriptor: true, descSize: 5 }])), 'ZIP_CORRUPT');
    await rejects(readZip(buildZip([{ name: 'book.json', bytes: body, method: 0, descriptor: true, descCrc: 7 }])), 'ZIP_CORRUPT');
});

test('ueberlappende Eintraege (Datenbereich ragt in den naechsten Eintrag)', async () => {
    const e = { bytes: enc.encode('{"a":1}'), method: 8 };
    await rejects(readZip(buildZip([{ name: 'book.json', ...e, lieCompressed: 200 }, { name: 'export.json', ...e }])), 'ZIP_CORRUPT');
});

test('Bilder: Magic Bytes und Abmessungen', () => {
    assert.deepEqual(inspectImage(png(4, 3)), { mime: 'image/png', width: 4, height: 3 });
    assert.deepEqual(inspectImage(jpeg(5, 4)), { mime: 'image/jpeg', width: 5, height: 4 });
    assert.throws(() => inspectImage(enc.encode('GIF89a......')), err => err.code === 'IMAGE_INVALID');
    assert.throws(() => inspectImage(enc.encode('<svg xmlns="http://www.w3.org/2000/svg"/>')), err => err.code === 'IMAGE_INVALID');
    assert.throws(() => inspectImage(png(20000, 20000)), err => err.code === 'IMAGE_INVALID'); // Pixel-Bombe
    assert.throws(() => inspectImage(png(0, 5)), err => err.code === 'IMAGE_INVALID');
});

test('Paket: falscher sha256 eines Bildes (CRC passt, Quittung nicht)', async () => {
    const pkg = makePackage({ tweak: { entries: (entries) => {
        const i = entries.findIndex(e => e.name.startsWith('assets/') && e.name.endsWith('.png'));
        const evil = png(4, 3, 10); entries[i] = { ...entries[i], bytes: evil }; // Name/Quittung bleiben, Inhalt anders
    } } });
    await rejects(loadReaderPackage(pkg.zip()), 'RECEIPT_MISMATCH');
    const pkg2 = makePackage({ tweak: { entries: (entries) => {
        const i = entries.findIndex(e => e.name.startsWith('assets/') && e.name.endsWith('.png'));
        const same = entries[i].bytes.slice(); same[same.length - 1] ^= 1; // gleiche Laenge, anderer Inhalt, CRC wird neu berechnet
        entries[i] = { ...entries[i], bytes: same };
    } } });
    await rejects(loadReaderPackage(pkg2.zip()), 'DIGEST_MISMATCH');
});

test('Paket: Manifest-Hash passt nicht zur Quittung', async () => {
    const pkg = makePackage({ tweak: { receipt: r => { r.manifestSha256 = 'd'.repeat(64); } } });
    await rejects(loadReaderPackage(pkg.zip()), 'RECEIPT_MISMATCH');
});

test('Paket: Manifest nicht kanonisch (Bytes != kanonisches JSON)', async () => {
    const pkg = makePackage();
    const i = pkg.entries.findIndex(e => e.name === 'manifest.json');
    const pretty = enc.encode(JSON.stringify(pkg.manifest, null, 2));
    pkg.entries[i] = { name: 'manifest.json', bytes: pretty, method: 8 };
    // Quittung neu rechnen, damit nur die Kanonik verletzt ist
    const j = pkg.entries.findIndex(e => e.name === 'export.json');
    const r = JSON.parse(new TextDecoder().decode(pkg.entries[j].bytes));
    r.manifestSha256 = sha(pretty); r.files.find(f => f.path === 'manifest.json').sha256 = sha(pretty); r.files.find(f => f.path === 'manifest.json').byteSize = pretty.length;
    pkg.entries[j] = { name: 'export.json', bytes: enc.encode(JSON.stringify(r)), method: 8 };
    await rejects(loadReaderPackage(buildZip(pkg.entries)), 'MANIFEST_NOT_CANONICAL');
});

test('Paket: Zielgruppe ausser PRIVATE_READER_PREVIEW wird abgelehnt', async () => {
    const pkg = makePackage({ tweak: { manifest: m => { m.audience = 'PUBLIC'; } } });
    await rejects(loadReaderPackage(pkg.zip()), 'INVALID_ENVELOPE');
});

test('Paket: Bild gibt sich als PNG aus, ist aber SVG (Magic Bytes; Hashes und Quittung sind konsistent)', async () => {
    const fake = enc.encode('<svg xmlns="http://www.w3.org/2000/svg" width="4" height="4"><script>1</script></svg>');
    const pkg = makePackage({ assetBytes: { 'asset-il1b': fake } });
    await rejects(loadReaderPackage(pkg.zip()), 'IMAGE_INVALID');
    const lying = makePackage({ assetBytes: { 'asset-il1b': jpeg(3, 3) } }); // echtes JPEG, Manifest sagt image/png
    await rejects(loadReaderPackage(lying.zip()), 'IMAGE_INVALID');
});

test('Paket: zusaetzliche Datei im ZIP und fehlende Datei', async () => {
    const extra = makePackage({ tweak: { entries: e => e.push({ name: 'chapters/zzz.json', bytes: enc.encode('{}'), method: 0 }) } });
    await rejects(loadReaderPackage(extra.zip()), 'EXTRA_OR_MISSING_FILE');
    const missing = makePackage({ tweak: { entries: e => { e.splice(e.findIndex(x => x.name === 'book.json'), 1); } } });
    await rejects(loadReaderPackage(missing.zip()), 'MISSING_FILE');
    const noReceipt = makePackage({ tweak: { entries: e => { e.splice(e.findIndex(x => x.name === 'export.json'), 1); } } });
    await rejects(loadReaderPackage(noReceipt.zip()), 'MISSING_FILE');
});

test('Paket: book.json/Zaehler passen nicht', async () => {
    const pkg = makePackage({ tweak: { book: b => { b.chapterCount = 99; } } });
    await rejects(loadReaderPackage(pkg.zip()), 'INVALID_BOOK_JSON');
});
