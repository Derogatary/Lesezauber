// Sicherer ZIP-Leser fuer Reader-Pakete aus dem Autorenstudio (nur Lesen, keine Abhaengigkeit).
//
// Unterstuetzt NUR: Methode 0 (gespeichert) und 8 (Deflate, ueber DecompressionStream('deflate-raw')),
// Data-Descriptors (Flag 3), UTF-8-Namen. Alles andere wird VOR dem Entpacken abgewiesen:
//   - verschluesselte Eintraege (Flag 0 / 6 / 13), andere Methoden
//   - ZIP64 (EOCD-Marker 0xFFFF/0xFFFFFFFF, ZIP64-Locator, ZIP64-Extra-Feld). Das Studio schreibt nie ZIP64:
//     seine Obergrenze (200 MiB) haelt jeden Offset weit unter 4 GiB. Ein ZIP64-Paket ist also kein Studio-Paket.
//   - mehrteilige Archive, Archiv-Kommentar, Verzeichnis-Eintraege
//   - absolute Pfade, "..", Backslash, Steuerzeichen, doppelte Namen (auch nur durch Gross/Klein-Unterschied)
//   - Namen ausserhalb der festen Formen (manifest.json, export.json, book.json, chapters/<id>.json,
//     assets/<sha256>.<png|jpg|webp>) -> UNEXPECTED_ENTRY
//   - ueberlappende oder aus dem Archiv herauszeigende Eintraege (Overlap-Bomben)
// Grenzen (alle VOR bzw. WAEHREND des Entpackens erzwungen; Deflate wird gezaehlt und bei Ueberschreitung
// der deklarierten Groesse abgebrochen, nicht erst danach geprueft). CRC32 jedes Eintrags wird geprueft.

export class ZipReadError extends Error {
  constructor(code, detail) { super(detail ? `${code}: ${detail}` : code); this.name = 'ZipReadError'; this.code = code; }
}
const fail = (code, detail) => { throw new ZipReadError(code, detail); };

export const ZIP_LIMITS = Object.freeze({
  maxCompressedTotal: 200 * 1024 * 1024,   // Dateigroesse des Pakets (= Studio-Export-Grenze)
  maxUncompressedTotal: 250 * 1024 * 1024, // Summe aller entpackten Eintraege (= verifyPayload-Grenze)
  maxEntries: 2000,
  maxRatio: 100,                           // entpackt : gepackt je Deflate-Eintrag
  ratioFloor: 64 * 1024,                   // unterhalb dieser Groesse zaehlt das Verhaeltnis nicht (Gesamtgrenzen genuegen)
  maxImageBytes: 20 * 1024 * 1024,         // = verifyPayload je Bild
  maxManifestBytes: 16 * 1024 * 1024,
  maxJsonBytes: 8 * 1024 * 1024,           // book.json, export.json, chapters/*.json
  maxCentralDirectory: 1024 * 1024,
  maxExtraField: 256,
});

const NAME_SHAPES = [
  [/^manifest\.json$/u, 'maxManifestBytes'],
  [/^(?:book|export)\.json$/u, 'maxJsonBytes'],
  [/^chapters\/[A-Za-z0-9][A-Za-z0-9_-]{0,79}\.json$/u, 'maxJsonBytes'],
  [/^assets\/[a-f0-9]{64}\.(?:png|jpg|webp)$/u, 'maxImageBytes'],
];

/** Gibt die Groessengrenze (Schluessel in ZIP_LIMITS) fuer einen erlaubten Namen zurueck. */
export function checkEntryName(name) {
  if (typeof name !== 'string' || name.length === 0 || name.length > 180) fail('UNSAFE_ZIP_NAME', 'Laenge');
  // eslint-disable-next-line no-control-regex
  if (name.startsWith('/') || /^[A-Za-z]:/u.test(name) || name.includes('\\') || /[\u0000-\u001f\u007f]/u.test(name) ||
      name.split('/').some(part => part === '..' || part === '.' || part === '')) fail('UNSAFE_ZIP_NAME', 'Pfad');
  for (const [shape, limitKey] of NAME_SHAPES) if (shape.test(name)) return limitKey;
  return fail('UNEXPECTED_ENTRY', 'Name nicht im Paketformat');
}

// ---- CRC32 ------------------------------------------------------------------------------------------------
const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; table[n] = c >>> 0; }
  return table;
})();
export function crc32(bytes) {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

const SIG_EOCD = 0x06054b50, SIG_CEN = 0x02014b50, SIG_LOC = 0x04034b50, SIG_DESC = 0x08074b50, SIG_ZIP64_LOC = 0x07064b50;
const FLAG_ENCRYPTED = 0x0001, FLAG_DESCRIPTOR = 0x0008, FLAG_STRONG = 0x0040, FLAG_UTF8 = 0x0800, FLAG_MASKED = 0x2000;
const utf8 = new TextDecoder('utf-8', {fatal: true});

async function bytesAt(file, from, to) {
  if (from < 0 || to < from || to > file.size) fail('ZIP_CORRUPT', 'Bereich ausserhalb');
  return new Uint8Array(await file.slice(from, to).arrayBuffer());
}

/** Entpackt EINEN Deflate-Eintrag mit hartem Ausgabelimit (Bomben-Schutz waehrend des Entpackens). */
async function inflateRaw(file, start, compressedSize, expectedSize, budget) {
  if (typeof DecompressionStream !== 'function') fail('DEFLATE_UNSUPPORTED', 'Dieser Browser kann das Paket nicht entpacken');
  let stream;
  try { stream = file.slice(start, start + compressedSize).stream().pipeThrough(new DecompressionStream('deflate-raw')); }
  catch { fail('DEFLATE_UNSUPPORTED', 'deflate-raw nicht verfuegbar'); }
  const out = new Uint8Array(expectedSize);
  let used = 0;
  const reader = stream.getReader();
  try {
    for (;;) {
      let step;
      try { step = await reader.read(); } catch { fail('INFLATE_FAILED', 'Deflate-Daten defekt'); }
      if (step.done) break;
      if (used + step.value.length > expectedSize) { await reader.cancel().catch(() => {}); fail('SIZE_MISMATCH', 'mehr Daten als deklariert'); }
      if (budget.remaining < step.value.length) { await reader.cancel().catch(() => {}); fail('ZIP_TOO_LARGE', 'entpackt'); }
      budget.remaining -= step.value.length;
      out.set(step.value, used);
      used += step.value.length;
    }
  } finally { try { reader.releaseLock(); } catch { /* ignore */ } }
  if (used !== expectedSize) fail('SIZE_MISMATCH', 'weniger Daten als deklariert');
  return out;
}

/**
 * Liest ein Blob/File (oder Uint8Array) und liefert {entries: Map(name -> Uint8Array), order: [name]}.
 * Wirft ZipReadError mit stabilem `code`. Es wird NICHTS gespeichert und kein Netzwerk benutzt.
 */
export async function readZip(input, limits = ZIP_LIMITS) {
  const lim = {...ZIP_LIMITS, ...limits};
  const file = input instanceof Uint8Array ? new Blob([input]) : input;
  if (!file || typeof file.size !== 'number' || typeof file.slice !== 'function') fail('ZIP_INVALID', 'keine Datei');
  if (file.size < 22) fail('ZIP_INVALID', 'zu klein');
  if (file.size > lim.maxCompressedTotal) fail('ZIP_TOO_LARGE', 'Datei');

  // Ende des Verzeichnisses (EOCD): immer die letzten 22 Bytes, weil wir keinen Archiv-Kommentar zulassen.
  const tailStart = Math.max(0, file.size - 22 - 20);
  const tail = await bytesAt(file, tailStart, file.size);
  const eocdAt = tail.length - 22;
  const tv = new DataView(tail.buffer);
  if (tv.getUint32(eocdAt, true) !== SIG_EOCD) fail('ZIP_INVALID', 'Abschluss fehlt oder Kommentar/Anhang vorhanden');
  if (tail.length >= 42 && tv.getUint32(eocdAt - 20, true) === SIG_ZIP64_LOC) fail('ZIP64_UNSUPPORTED', 'ZIP64-Locator');
  if (tv.getUint16(eocdAt + 20, true) !== 0) fail('ZIP_INVALID', 'Archiv-Kommentar nicht erlaubt');
  const diskNo = tv.getUint16(eocdAt + 4, true), cdDisk = tv.getUint16(eocdAt + 6, true);
  const countDisk = tv.getUint16(eocdAt + 8, true), count = tv.getUint16(eocdAt + 10, true);
  const cdSize = tv.getUint32(eocdAt + 12, true), cdOffset = tv.getUint32(eocdAt + 16, true);
  if (count === 0xffff || cdSize === 0xffffffff || cdOffset === 0xffffffff) fail('ZIP64_UNSUPPORTED', 'EOCD-Marker');
  if (diskNo !== 0 || cdDisk !== 0) fail('ZIP_INVALID', 'mehrteilig');
  if (countDisk !== count || count === 0) fail('ZIP_INVALID', 'Eintragszahl');
  if (count > lim.maxEntries) fail('ZIP_TOO_MANY_ENTRIES', String(count));
  const cdEnd = file.size - 22;
  if (cdSize > lim.maxCentralDirectory || cdOffset + cdSize !== cdEnd) fail('ZIP_INVALID', 'Verzeichnis');

  const dir = await bytesAt(file, cdOffset, cdEnd);
  const dv = new DataView(dir.buffer);
  const parsed = [];
  const seen = new Set();
  let pos = 0, declaredTotal = 0;
  for (let i = 0; i < count; i++) {
    if (pos + 46 > dir.length || dv.getUint32(pos, true) !== SIG_CEN) fail('ZIP_CORRUPT', 'Verzeichniseintrag');
    const flags = dv.getUint16(pos + 8, true), method = dv.getUint16(pos + 10, true);
    const crc = dv.getUint32(pos + 16, true), compressed = dv.getUint32(pos + 20, true), size = dv.getUint32(pos + 24, true);
    const nameLen = dv.getUint16(pos + 28, true), extraLen = dv.getUint16(pos + 30, true), commentLen = dv.getUint16(pos + 32, true);
    const diskStart = dv.getUint16(pos + 34, true), localOffset = dv.getUint32(pos + 42, true);
    if (pos + 46 + nameLen + extraLen + commentLen > dir.length) fail('ZIP_CORRUPT', 'Verzeichniseintrag Laenge');
    if (flags & (FLAG_ENCRYPTED | FLAG_STRONG | FLAG_MASKED)) fail('ZIP_ENCRYPTED', 'verschluesselter Eintrag');
    if (method !== 0 && method !== 8) fail('ZIP_METHOD_UNSUPPORTED', String(method));
    if (diskStart !== 0) fail('ZIP_INVALID', 'mehrteilig');
    if (compressed === 0xffffffff || size === 0xffffffff || localOffset === 0xffffffff) fail('ZIP64_UNSUPPORTED', 'Eintrag');
    if (extraLen > lim.maxExtraField) fail('ZIP_INVALID', 'Extra-Feld zu lang');
    if (commentLen !== 0) fail('ZIP_INVALID', 'Eintragskommentar nicht erlaubt');
    const extra = dir.subarray(pos + 46 + nameLen, pos + 46 + nameLen + extraLen);
    for (let e = 0; e + 4 <= extra.length;) {
      const id = extra[e] | (extra[e + 1] << 8), len = extra[e + 2] | (extra[e + 3] << 8);
      if (id === 0x0001) fail('ZIP64_UNSUPPORTED', 'ZIP64-Extra-Feld');
      e += 4 + len;
    }
    let name;
    try { name = utf8.decode(dir.subarray(pos + 46, pos + 46 + nameLen)); } catch { fail('UNSAFE_ZIP_NAME', 'kein UTF-8'); }
    const limitKey = checkEntryName(name);
    const folded = name.toLowerCase();
    if (seen.has(folded)) fail('DUPLICATE_ZIP_NAME', 'doppelter Name');
    seen.add(folded);
    // Groessen- und Verhaeltnisgrenzen aus dem Verzeichnis, VOR jedem Entpacken.
    if (size > lim[limitKey]) fail('ZIP_ENTRY_TOO_LARGE', limitKey);
    if (method === 0 && compressed !== size) fail('ZIP_INVALID', 'gespeichert, aber Groessen verschieden');
    if (method === 8) {
      if (size > 0 && compressed === 0) fail('ZIP_RATIO', 'Deflate ohne Daten');
      if (size > lim.ratioFloor && size / compressed > lim.maxRatio) fail('ZIP_RATIO', 'Kompressionsverhaeltnis');
    }
    declaredTotal += size;
    if (declaredTotal > lim.maxUncompressedTotal) fail('ZIP_TOO_LARGE', 'entpackt');
    parsed.push({name, flags, method, crc, compressed, size, localOffset});
    pos += 46 + nameLen + extraLen + commentLen;
  }
  if (pos !== dir.length) fail('ZIP_CORRUPT', 'Reste im Verzeichnis');

  // Lokale Header pruefen, Datenbereiche bestimmen, Ueberlappung ausschliessen.
  for (const entry of parsed) {
    if (entry.localOffset + 30 > cdOffset) fail('ZIP_CORRUPT', 'Offset');
    const head = await bytesAt(file, entry.localOffset, entry.localOffset + 30);
    const hv = new DataView(head.buffer);
    if (hv.getUint32(0, true) !== SIG_LOC) fail('ZIP_CORRUPT', 'lokaler Header');
    const lflags = hv.getUint16(6, true), lmethod = hv.getUint16(8, true);
    const lNameLen = hv.getUint16(26, true), lExtraLen = hv.getUint16(28, true);
    if (lflags & (FLAG_ENCRYPTED | FLAG_STRONG | FLAG_MASKED)) fail('ZIP_ENCRYPTED', 'lokal');
    if (lmethod !== entry.method || (lflags & FLAG_DESCRIPTOR) !== (entry.flags & FLAG_DESCRIPTOR)) fail('ZIP_CORRUPT', 'lokal/Verzeichnis ungleich');
    if (lExtraLen > lim.maxExtraField) fail('ZIP_INVALID', 'Extra-Feld zu lang');
    const nameEnd = entry.localOffset + 30 + lNameLen;
    if (nameEnd + lExtraLen > cdOffset) fail('ZIP_CORRUPT', 'lokaler Header Laenge');
    let localName;
    try { localName = utf8.decode(await bytesAt(file, entry.localOffset + 30, nameEnd)); } catch { fail('UNSAFE_ZIP_NAME', 'lokal kein UTF-8'); }
    if (localName !== entry.name) fail('ZIP_CORRUPT', 'lokaler Name weicht ab');
    if (!(entry.flags & FLAG_DESCRIPTOR)) {
      if (hv.getUint32(14, true) !== entry.crc || hv.getUint32(18, true) !== entry.compressed || hv.getUint32(22, true) !== entry.size)
        fail('ZIP_CORRUPT', 'lokale Werte weichen ab');
    }
    entry.dataStart = nameEnd + lExtraLen;
    entry.dataEnd = entry.dataStart + entry.compressed;
    entry.rangeEnd = entry.dataEnd;
    if (entry.dataEnd > cdOffset) fail('ZIP_CORRUPT', 'Daten ragen ins Verzeichnis');
    if (entry.flags & FLAG_DESCRIPTOR) {
      // Descriptor: optional mit Signatur; die Werte MUESSEN dem Verzeichnis entsprechen (CRC, gepackt, entpackt).
      const raw = await bytesAt(file, entry.dataEnd, Math.min(cdOffset, entry.dataEnd + 16));
      const rv = new DataView(raw.buffer);
      const withSig = raw.length >= 16 && rv.getUint32(0, true) === SIG_DESC;
      const base = withSig ? 4 : 0;
      if (raw.length < base + 12) fail('ZIP_CORRUPT', 'Data-Descriptor fehlt');
      if (rv.getUint32(base, true) !== entry.crc || rv.getUint32(base + 4, true) !== entry.compressed ||
          rv.getUint32(base + 8, true) !== entry.size) fail('ZIP_CORRUPT', 'Data-Descriptor weicht ab');
      entry.rangeEnd = entry.dataEnd + base + 12;
    }
  }
  const byOffset = [...parsed].sort((a, b) => a.localOffset - b.localOffset);
  for (let i = 1; i < byOffset.length; i++)
    if (byOffset[i].localOffset < byOffset[i - 1].rangeEnd) fail('ZIP_CORRUPT', 'ueberlappende Eintraege');

  // Entpacken + CRC.
  const budget = {remaining: lim.maxUncompressedTotal};
  const entries = new Map();
  for (const entry of parsed) {
    let data;
    if (entry.method === 0) {
      if (budget.remaining < entry.size) fail('ZIP_TOO_LARGE', 'entpackt');
      budget.remaining -= entry.size;
      data = await bytesAt(file, entry.dataStart, entry.dataEnd);
    } else {
      data = await inflateRaw(file, entry.dataStart, entry.compressed, entry.size, budget);
    }
    if (data.length !== entry.size) fail('SIZE_MISMATCH', 'Groesse');
    if (crc32(data) !== entry.crc) fail('CRC_MISMATCH', 'Pruefsumme stimmt nicht');
    entries.set(entry.name, data);
  }
  return {entries, order: parsed.map(entry => entry.name)};
}
