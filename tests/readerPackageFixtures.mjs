// Test-Hilfen fuer die Reader-Paket-Tests: baut ein synthetisches Paket im Format des Autorenstudios (AS53)
// und einen flexiblen ZIP-Schreiber, mit dem sich boesartige ZIPs gezielt basteln lassen. Nur erfundene Daten.
import { createHash } from 'node:crypto';
import { deflateRawSync } from 'node:zlib';
import { crc32 } from '../js/readerPackage/zipReader.js';
import { canonicalManifest } from '../js/readerPackage/readerPackageV1.js';

export const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');
const enc = new TextEncoder();

export function png(w = 4, h = 3, pad = 0) {
    const b = new Uint8Array(33 + pad);
    b.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52]);
    new DataView(b.buffer).setUint32(16, w); new DataView(b.buffer).setUint32(20, h);
    return b;
}
export function jpeg(w = 5, h = 4) {
    const head = [0xff, 0xd8, 0xff, 0xe0, 0, 4, 0, 0, 0xff, 0xc0, 0, 17, 8, h >> 8, h & 255, w >> 8, w & 255, 3, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0xff, 0xd9];
    return Uint8Array.from(head);
}

// ---- flexibler ZIP-Schreiber ----------------------------------------------------------------------------
// entry: {name, bytes, method?:0|8, flags?, crc?, descriptor?:bool|'nosig', localSize?, extra?, lieSize?, lieCompressed?}
export function buildZip(entries, opts = {}) {
    const parts = []; const central = []; let offset = 0;
    for (const e of entries) {
        const name = enc.encode(e.name);
        const method = e.method ?? 0;
        const raw = e.bytes;
        const data = e.rawData ?? (method === 8 ? new Uint8Array(deflateRawSync(raw, { level: 9 })) : raw);
        const crc = e.crc ?? crc32(raw);
        const size = e.lieSize ?? raw.length;
        const compressed = e.lieCompressed ?? data.length;
        const flags = (e.flags ?? 0x0800) | (e.descriptor ? 0x0008 : 0);
        const extra = e.extra ?? new Uint8Array(0);
        const local = new Uint8Array(30 + name.length + extra.length);
        const lv = new DataView(local.buffer);
        lv.setUint32(0, 0x04034b50, true); lv.setUint16(4, 20, true); lv.setUint16(6, flags, true); lv.setUint16(8, method, true);
        if (!e.descriptor) { lv.setUint32(14, crc, true); lv.setUint32(18, compressed, true); lv.setUint32(22, size, true); }
        lv.setUint16(26, name.length, true); lv.setUint16(28, extra.length, true);
        local.set(name, 30); local.set(extra, 30 + name.length);
        const start = e.forceOffset ?? offset;
        parts.push(local, data);
        offset += local.length + data.length;
        if (e.descriptor) {
            const withSig = e.descriptor !== 'nosig';
            const d = new Uint8Array(withSig ? 16 : 12); const dv = new DataView(d.buffer); let at = 0;
            if (withSig) { dv.setUint32(0, 0x08074b50, true); at = 4; }
            dv.setUint32(at, e.descCrc ?? crc, true); dv.setUint32(at + 4, e.descCompressed ?? compressed, true); dv.setUint32(at + 8, e.descSize ?? size, true);
            parts.push(d); offset += d.length;
        }
        const cd = new Uint8Array(46 + name.length + extra.length); const cv = new DataView(cd.buffer);
        cv.setUint32(0, 0x02014b50, true); cv.setUint16(4, 20, true); cv.setUint16(6, 20, true); cv.setUint16(8, flags, true);
        cv.setUint16(10, method, true); cv.setUint32(16, crc, true); cv.setUint32(20, compressed, true); cv.setUint32(24, size, true);
        cv.setUint16(28, name.length, true); cv.setUint16(30, extra.length, true); cv.setUint32(42, start, true);
        cd.set(name, 46); cd.set(extra, 46 + name.length);
        central.push(cd);
    }
    const cdSize = central.reduce((s, c) => s + c.length, 0);
    const end = new Uint8Array(22 + (opts.comment ? opts.comment.length : 0)); const ev = new DataView(end.buffer);
    ev.setUint32(0, 0x06054b50, true);
    ev.setUint16(8, opts.count ?? entries.length, true); ev.setUint16(10, opts.count ?? entries.length, true);
    ev.setUint32(12, cdSize, true); ev.setUint32(16, offset, true);
    if (opts.comment) { ev.setUint16(20, opts.comment.length, true); end.set(opts.comment, 22); }
    if (opts.eocd) opts.eocd(ev);
    const all = [...parts, ...central, end];
    const out = new Uint8Array(all.reduce((s, p) => s + p.length, 0)); let at = 0;
    for (const p of all) { out.set(p, at); at += p.length; }
    return out;
}

// ---- synthetisches Paket im AS53-Format ----------------------------------------------------------------
export function makePackage({ title = 'Erfundenes Testbuch', decisionId = 'dec1', snapshotNo = 1, bookId = 'book1', chapters, withCover = true, tweak, assetBytes = {} } = {}) {
    const assets = new Map(); // assetId -> {bytes, mime, ext}
    const cover = png(8, 6, 3);
    const il1 = jpeg(10, 8);
    if (withCover) assets.set('asset-cover', { bytes: cover, mime: 'image/png', ext: 'png' });
    assets.set('asset-il1', { bytes: il1, mime: 'image/jpeg', ext: 'jpg' });
    const chapterDefs = chapters ?? [
        { id: 'ch1', title: 'Erstes Kapitel', lines: ['Ein erfundener Satz eins.', 'Ein erfundener Satz zwei.'], images: ['asset-il1', 'asset-il1b'] },
        { id: 'ch2', title: 'Zweites Kapitel', lines: ['Noch ein erfundener Satz.'], images: [] },
    ];
    assets.set('asset-il1b', { bytes: png(2, 2, 9), mime: 'image/png', ext: 'png' });
    for (const [id, bytes] of Object.entries(assetBytes)) assets.get(id).bytes = bytes; // z.B. ein getarntes Nicht-Bild, Hashes bleiben konsistent
    const manifestChapters = chapterDefs.map((c, index) => ({
        id: c.id, revision: 1, title: c.title,
        segments: c.lines.map((text, n) => ({ id: `${c.id}-${n + 1}`, text, sha256: sha(enc.encode(text)) })),
        assetIds: [...new Set([...(index === 0 && withCover ? ['asset-cover'] : []), ...c.images])],
    }));
    const manifestAssets = [...assets].filter(([id]) => manifestChapters.some(c => c.assetIds.includes(id))).map(([id, a]) => ({
        id, path: `assets/${sha(a.bytes)}.${a.ext}`, sha256: sha(a.bytes), mime: a.mime, rightsRef: 'rights-freigegeben', alt: `Alt ${id}`,
    }));
    const manifest = {
        format: 'editionboysen-reader-package/1', packageId: 'eb-' + decisionId, bookId,
        source: { revision: snapshotNo, sha256: 'b'.repeat(64) }, audience: 'PRIVATE_READER_PREVIEW',
        decision: { ref: decisionId, scope: 'PRIVATE_READER_PREVIEW' }, language: 'de',
        readingOrder: manifestChapters.map(c => c.id), chapters: manifestChapters, assets: manifestAssets, audio: [],
    };
    if (tweak?.manifest) tweak.manifest(manifest);
    const manifestBytes = enc.encode(canonicalManifest(manifest));
    const manifestSha = sha(manifestBytes);
    const json = (v) => enc.encode(JSON.stringify(v, null, 2) + '\n');
    const book = { format: 'editionboysen-reader-book/1', packageId: manifest.packageId, bookId, title, language: 'de', snapshotNo,
        coverAssetId: withCover ? 'asset-cover' : null, chapterCount: manifestChapters.length, imageCount: manifestAssets.length };
    const sidecars = chapterDefs.map((c, index) => ({ path: `chapters/${c.id}.json`, bytes: json({
        format: 'editionboysen-reader-chapter/1', chapterId: c.id, position: index + 1, revision: 1, revisionSha256: 'c'.repeat(64),
        title: c.title, segmentIds: manifestChapters[index].segments.map(s => s.id),
        images: c.images.map(assetId => ({ assetId, role: 'illustration' })), audio: null }) }));
    if (tweak?.book) tweak.book(book);
    const files = [
        { name: 'manifest.json', bytes: manifestBytes, method: 8 },
        { name: 'book.json', bytes: json(book), method: 8 },
        ...sidecars.map(s => ({ name: s.path, bytes: s.bytes, method: 8 })),
        ...manifestAssets.map(a => ({ name: a.path, bytes: [...assets.values()].find(x => `assets/${sha(x.bytes)}.${x.ext}` === a.path).bytes, method: 0 })),
    ];
    const receipt = { format: 'editionboysen-reader-export/1', packageId: manifest.packageId, manifestSha256: manifestSha, sourceSha256: manifest.source.sha256,
        decision: { id: decisionId, audience: 'PRIVATE_READER_PREVIEW', snapshotNo, createdAt: '2026-11-17T10:00:00.000Z' },
        note: 'Private Vorschau.', files: files.map(f => ({ path: f.name, sha256: sha(f.bytes), byteSize: f.bytes.length })) };
    if (tweak?.receipt) tweak.receipt(receipt);
    const entries = [files[0], { name: 'export.json', bytes: json(receipt), method: 8 }, ...files.slice(1)];
    if (tweak?.entries) tweak.entries(entries);
    return { entries, zip: () => buildZip(entries), manifest, manifestSha, receipt, files };
}
