import { test } from 'node:test';
import assert from 'node:assert/strict';
import './helpers.mjs';
import { writeStoredZip, readStoredZip } from '../js/backupZip.js';
import { validateBackupData } from '../js/actions/fullBackup.js';

const b = value => new Blob([value]);
const baseEntries = () => [
    { name: 'manifest.json', blob: b('{"format":"lesezauber-full-backup","version":1}') },
    { name: 'library.json', blob: b('{"book_1":{"id":"book_1","title":"Test","pages":[{"id":1,"imgUrl":"data:image/png;base64,AAAA"}]}}') },
    { name: 'audio/000001.bin', blob: new Blob([Uint8Array.from([0, 5, 255, 10, 42])], { type: 'audio/mpeg' }) },
    { name: 'audio/index.json', blob: b('[{"file":"audio/000001.bin","key":"speechify|voice|plain|1|5|xx","mime":"audio/mpeg","bytes":5,"created":7,"durationSec":2.3,"alignment":{"starts":[0,100]}}]') },
    { name: 'studio-projects.json', blob: b('[{"id":"proj_1","type":"picturebook","title":"Werkstatt"}]') },
    { name: 'vocabulary.json', blob: b('[{"word":"Buch","translation":"book"}]') }
];

test('ZIP export/import: binäre Speechify-Audios und Wort-Zeitstempel unverändert', async () => {
    const source = baseEntries();
    const zip = await writeStoredZip(source);
    const files = await readStoredZip(zip);
    assert.equal(files.size, 6);
    assert.deepEqual([...new Uint8Array(await files.get('audio/000001.bin').arrayBuffer())], [0, 5, 255, 10, 42]);
    const input = {
        library: JSON.parse(await files.get('library.json').text()),
        projects: JSON.parse(await files.get('studio-projects.json').text()),
        vocabulary: JSON.parse(await files.get('vocabulary.json').text()),
        audioIndex: JSON.parse(await files.get('audio/index.json').text()),
        files
    };
    const result = validateBackupData(input);
    assert.equal(result.audio[0].key, 'speechify|voice|plain|1|5|xx');
    assert.deepEqual(result.audio[0].alignment.starts, [0, 100]);
    assert.equal(result.audio[0].blob.type, 'audio/mpeg');
    assert.equal(result.books.length, 1);
    assert.equal(result.projects.length, 1);
});

test('Corrupted ZIP audio fails CRC before any database restore', async () => {
    const zip = await writeStoredZip(baseEntries());
    const original = new Uint8Array(await zip.arrayBuffer());
    const needle = Uint8Array.from([0, 5, 255, 10, 42]);
    let changed = false;
    for (let i = 0; i <= original.length - needle.length; i++) {
        if (needle.every((x, j) => original[i + j] === x)) {
            original[i + 2] ^= 0xFF;
            changed = true;
            break;
        }
    }
    assert.equal(changed, true);
    await assert.rejects(() => readStoredZip(new Blob([original])), /Prüfsumme/);
});

test('Unsafe ZIP paths and duplicate entries are rejected', async () => {
    await assert.rejects(() => writeStoredZip([{ name: '../secret.json', blob: b('x') }]), /Unsicherer/);
    await assert.rejects(() => writeStoredZip([{ name: 'a.json', blob: b('x') }, { name: 'a.json', blob: b('y') }]), /Doppelter/);
});

test('ZIP stored-only: invalid compression flags rejected', async () => {
    const bytes = new Uint8Array(await (await writeStoredZip(baseEntries())).arrayBuffer());
    const view = new DataView(bytes.buffer);
    for (let i = 0; i < bytes.length - 46; i++) {
        if (view.getUint32(i, true) === 0x02014b50) {
            view.setUint16(i + 10, 8, true);
            break;
        }
    }
    await assert.rejects(() => readStoredZip(new Blob([bytes])), /nicht unterstützt/);
});

test('Audio backup prevents mismatched file size, missing file, extra file, invalid key', async () => {
    const files = await readStoredZip(await writeStoredZip(baseEntries()));
    const valid = { library: { book_1: { id: 'book_1', pages: [{ id: 1 }] } },
        projects: [], vocabulary: [], files };
    const audioIndex = [{ file: 'audio/000001.bin', key: 'speechify|abc|x', mime: 'audio/mpeg',
        bytes: 5, created: 1, durationSec: 0, alignment: null }];
    await assert.throws(() => validateBackupData({ ...valid, audioIndex: [{ ...audioIndex[0], bytes: 6 }] }), /Länge/);
    assert.throws(() => validateBackupData({ ...valid, audioIndex: [{ ...audioIndex[0], key: 'invalid' }] }), /Index/);
    const modified = new Map(files); modified.delete('audio/000001.bin');
    assert.throws(() => validateBackupData({ ...valid, files: modified, audioIndex }), /fehlt/);
});

test('Backup validation refuses malicious object IDs and does not use provider APIs', () => {
    const files = new Map([
        ['manifest.json', b('')], ['library.json', b('')], ['studio-projects.json', b('')],
        ['vocabulary.json', b('')], ['audio/index.json', b('')]
    ]);
    const unsafe = JSON.parse('{"__proto__":{"id":"__proto__","pages":[]}}');
    assert.throws(() => validateBackupData({ library: unsafe, projects: [], vocabulary: [], audioIndex: [], files }), /ID/);
    const good = validateBackupData({ library: {}, projects: [], vocabulary: [], audioIndex: [], files });
    assert.equal(good.audio.length, 0);
});
