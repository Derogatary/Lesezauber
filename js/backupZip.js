// LeseZauber full-backup ZIP v1. Standard ZIP "store" format (no compression).
// No network calls or dependencies. CRC32 covers every file on restore.
// Files are backed by Blobs so large audio clips need not become base64 strings.
const encoder = new TextEncoder();
const decoder = new TextDecoder('utf-8', { fatal: true });
const LIMIT_FILES = 24000;
const LIMIT_BYTES = 3_500_000_000; // no ZIP64, reject oversized archives

const crcTable = new Uint32Array(256);
for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    crcTable[n] = c >>> 0;
}
export function updateCrc32(state, bytes) {
    let c = state;
    for (const b of bytes) c = crcTable[(c ^ b) & 255] ^ (c >>> 8);
    return c >>> 0;
}
export async function crc32(blob) {
    let state = 0xFFFFFFFF;
    for (let off = 0; off < blob.size; off += 1024 * 1024) {
        const chunk = new Uint8Array(await blob.slice(off, off + 1024 * 1024).arrayBuffer());
        state = updateCrc32(state, chunk);
    }
    return (state ^ 0xFFFFFFFF) >>> 0;
}
function checkName(name) {
    if (typeof name !== 'string' || name.length > 220 ||
        !/^[a-zA-Z0-9][a-zA-Z0-9._\/-]*$/.test(name) ||
        name.startsWith('/') || name.includes('..') || name.includes('\\') ||
        name.split('/').some(s => !s)) throw new Error('Unsicherer ZIP-Dateiname');
}
function u16(view, at, val) { view.setUint16(at, val, true); }
function u32(view, at, val) { view.setUint32(at, val >>> 0, true); }
export async function writeStoredZip(entries) {
    if (!Array.isArray(entries) || !entries.length || entries.length > LIMIT_FILES)
        throw new Error('Ungültige Anzahl Backup-Dateien');
    const parts = [], central = [], names = new Set();
    let offset = 0;
    for (const item of entries) {
        checkName(item.name);
        if (names.has(item.name)) throw new Error('Doppelter ZIP-Dateiname');
        names.add(item.name);
        const data = item.blob instanceof Blob ? item.blob : new Blob([item.data ?? '']);
        const name = encoder.encode(item.name);
        if (name.length > 0xFFFF || data.size > LIMIT_BYTES || offset + data.size + name.length + 76 > LIMIT_BYTES)
            throw new Error('Backup zu groß für ZIP v1');
        const checksum = await crc32(data);
        const start = offset;
        const local = new Uint8Array(30 + name.length);
        const lv = new DataView(local.buffer);
        u32(lv, 0, 0x04034b50); u16(lv, 4, 20); u16(lv, 6, 0x0800);
        u16(lv, 8, 0); u32(lv, 14, checksum);
        u32(lv, 18, data.size); u32(lv, 22, data.size); u16(lv, 26, name.length);
        local.set(name, 30);
        parts.push(local, data);
        offset += local.length + data.size;
        const cd = new Uint8Array(46 + name.length);
        const cv = new DataView(cd.buffer);
        u32(cv, 0, 0x02014b50); u16(cv, 4, 20); u16(cv, 6, 20);
        u16(cv, 8, 0x0800); u16(cv, 10, 0); u32(cv, 16, checksum);
        u32(cv, 20, data.size); u32(cv, 24, data.size);
        u16(cv, 28, name.length); u32(cv, 42, start);
        cd.set(name, 46);
        central.push(cd);
    }
    const centralOffset = offset;
    for (const c of central) { parts.push(c); offset += c.length; }
    if (offset > LIMIT_BYTES) throw new Error('Backup zu groß');
    const end = new Uint8Array(22);
    const ev = new DataView(end.buffer);
    u32(ev, 0, 0x06054b50);
    u16(ev, 8, entries.length); u16(ev, 10, entries.length);
    u32(ev, 12, offset - centralOffset); u32(ev, 16, centralOffset);
    parts.push(end);
    return new Blob(parts, { type: 'application/zip' });
}
function readU16(v, at) { return v.getUint16(at, true); }
function readU32(v, at) { return v.getUint32(at, true); }
export async function readStoredZip(file) {
    if (!(file instanceof Blob) || file.size < 22 || file.size > LIMIT_BYTES)
        throw new Error('Ungültige ZIP-Größe');
    const tailOffset = Math.max(0, file.size - 65557);
    const tail = new Uint8Array(await file.slice(tailOffset).arrayBuffer());
    const tv = new DataView(tail.buffer);
    let endPos = -1;
    for (let i = tail.length - 22; i >= 0; i--) {
        if (readU32(tv, i) === 0x06054b50 && i + 22 + readU16(tv, i + 20) === tail.length) {
            endPos = i; break;
        }
    }
    if (endPos < 0) throw new Error('ZIP-Abschluss fehlt');
    if (readU16(tv, endPos + 4) || readU16(tv, endPos + 6)) throw new Error('Mehrteilige ZIP nicht unterstützt');
    const count = readU16(tv, endPos + 10), dirBytes = readU32(tv, endPos + 12), dirAt = readU32(tv, endPos + 16);
    if (!count || count > LIMIT_FILES || count !== readU16(tv, endPos + 8) ||
        dirAt + dirBytes !== tailOffset + endPos || dirBytes > 4 * 1024 * 1024)
        throw new Error('ZIP-Verzeichnis ungültig');
    const dir = new Uint8Array(await file.slice(dirAt, dirAt + dirBytes).arrayBuffer());
    const dv = new DataView(dir.buffer);
    let pos = 0;
    const results = new Map();
    for (let i = 0; i < count; i++) {
        if (pos + 46 > dir.length || readU32(dv, pos) !== 0x02014b50) throw new Error('ZIP-Verzeichniseintrag defekt');
        const flags = readU16(dv, pos + 8), method = readU16(dv, pos + 10);
        const checksum = readU32(dv, pos + 16);
        const compressed = readU32(dv, pos + 20), size = readU32(dv, pos + 24);
        const nlen = readU16(dv, pos + 28), extra = readU16(dv, pos + 30), comment = readU16(dv, pos + 32);
        const at = readU32(dv, pos + 42);
        if (method !== 0 || flags !== 0x0800 || compressed !== size || readU16(dv, pos + 34) ||
            pos + 46 + nlen + extra + comment > dir.length) throw new Error('ZIP-Eintrag nicht unterstützt');
        const name = decoder.decode(dir.slice(pos + 46, pos + 46 + nlen));
        checkName(name);
        if (results.has(name) || at + 30 + nlen > dirAt) throw new Error('ZIP-Einträge überlappen');
        const local = new Uint8Array(await file.slice(at, at + 30 + nlen).arrayBuffer());
        const lv = new DataView(local.buffer);
        if (readU32(lv, 0) !== 0x04034b50 || readU16(lv, 6) !== flags ||
            readU16(lv, 8) !== method || readU32(lv, 14) !== checksum ||
            readU32(lv, 18) !== size || readU32(lv, 22) !== size ||
            readU16(lv, 26) !== nlen || readU16(lv, 28) !== 0 ||
            decoder.decode(local.slice(30)) !== name) throw new Error('ZIP-Lokalheader ungleich Verzeichnis');
        const start = at + local.length;
        if (start + size > dirAt) throw new Error('ZIP-Datei beschädigt');
        const blob = file.slice(start, start + size);
        if (await crc32(blob) !== checksum) throw new Error('ZIP-Prüfsumme stimmt nicht: ' + name);
        results.set(name, blob);
        pos += 46 + nlen + extra + comment;
    }
    if (pos !== dir.length) throw new Error('ZIP-Verzeichnis hat Restdaten');
    return results;
}
