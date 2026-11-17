// Liest und PRUEFT ein Reader-Paket des Autorenstudios (AS53) komplett im Speicher. Schreibt nichts, kein Netzwerk.
// Reihenfolge: sicherer ZIP-Leser (Limits, Namen, CRC) -> export.json-Quittung (sha256 je Datei) -> Manifest-Hash
// (Datei-sha256 == manifestHash == export.json.manifestSha256) -> readerPackageV1 (verifyPayload) -> Begleitdateien
// (book.json, chapters/<id>.json) gegen das Manifest -> Magic-Bytes/Abmessungen der Bilder.
// Ergebnis ist ein reines Objekt; erst der Aufrufer (js/actions/readerPackageImport.js) speichert nach Bestaetigung.
import {readZip, ZipReadError} from './zipReader.js';
import {inspectImage} from './imageInfo.js';
import {sha256Hex, manifestHash, validateManifest, verifyPayload, ReaderPackageError} from './readerPackageV1.js';

export const READER_PACKAGE_FORMAT = 'editionboysen-reader-package/1';
export const READER_BOOK_FORMAT = 'editionboysen-reader-book/1';
export const READER_CHAPTER_FORMAT = 'editionboysen-reader-chapter/1';
export const READER_EXPORT_FORMAT = 'editionboysen-reader-export/1';
export const READER_AUDIENCE = 'PRIVATE_READER_PREVIEW';
const IMAGE_ROLES = ['illustration', 'szene', 'karte', 'hintergrund'];
const ID = /^[A-Za-z0-9][A-Za-z0-9_-]{0,79}$/u;
const SHA = /^[a-f0-9]{64}$/u;
// eslint-disable-next-line no-control-regex
const CONTROL = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u;
const dec = new TextDecoder('utf-8', {fatal: true});

const fail = code => { throw new ReaderPackageError(code); };
const check = (test, code) => { if (!test) fail(code); };
const isRecord = v => v !== null && typeof v === 'object' && !Array.isArray(v);
const onlyKeys = (v, keys) => isRecord(v) && Object.keys(v).every(k => keys.includes(k)) && keys.every(k => Object.hasOwn(v, k));
const str = (v, max) => typeof v === 'string' && v.length > 0 && v.length <= max && !CONTROL.test(v);
const sameList = (a, b) => Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((x, i) => x === b[i]);

function parseJson(bytes, code) {
  try { return JSON.parse(dec.decode(bytes)); } catch { return fail(code); }
}

/**
 * @param {Blob|File|Uint8Array} file das ZIP
 * @returns {Promise<{manifest, files: Map<string,Uint8Array>, book, chapterSidecars: Map, receipt, summary}>}
 * Wirft ZipReadError oder ReaderPackageError (stabiler `.code`).
 */
export async function loadReaderPackage(file, zipLimits) {
  const {entries} = await readZip(file, zipLimits);
  for (const required of ['manifest.json', 'export.json', 'book.json']) if (!entries.has(required)) fail('MISSING_FILE');

  // --- Manifest + Hash ---
  const manifestBytes = entries.get('manifest.json');
  const manifest = parseJson(manifestBytes, 'INVALID_MANIFEST_JSON');
  validateManifest(manifest); // vor allem anderen (Struktur, IDs, Pfade)
  const manifestSha256 = await sha256Hex(manifestBytes);
  check(manifestSha256 === await manifestHash(manifest), 'MANIFEST_NOT_CANONICAL');

  // --- Quittung export.json ---
  const receipt = parseJson(entries.get('export.json'), 'INVALID_RECEIPT');
  check(onlyKeys(receipt, ['format', 'packageId', 'manifestSha256', 'sourceSha256', 'decision', 'note', 'files']) &&
    receipt.format === READER_EXPORT_FORMAT && receipt.packageId === manifest.packageId &&
    receipt.manifestSha256 === manifestSha256 && receipt.sourceSha256 === manifest.source.sha256 &&
    str(receipt.note, 1000) && Array.isArray(receipt.files), 'RECEIPT_MISMATCH');
  check(onlyKeys(receipt.decision, ['id', 'audience', 'snapshotNo', 'createdAt']) && ID.test(receipt.decision.id) &&
    receipt.decision.audience === READER_AUDIENCE && receipt.decision.id === manifest.decision.ref &&
    receipt.packageId === 'eb-' + receipt.decision.id && receipt.decision.snapshotNo === manifest.source.revision &&
    str(receipt.decision.createdAt, 64), 'RECEIPT_MISMATCH');
  const listed = new Map();
  for (const item of receipt.files) {
    check(onlyKeys(item, ['path', 'sha256', 'byteSize']) && typeof item.path === 'string' && SHA.test(item.sha256) &&
      Number.isSafeInteger(item.byteSize) && item.byteSize >= 0 && !listed.has(item.path), 'RECEIPT_MISMATCH');
    listed.set(item.path, item);
  }
  // Menge der Quittung == alle Eintraege ausser export.json (kein zusaetzlicher, kein fehlender Eintrag).
  check(listed.size === entries.size - 1 && [...entries.keys()].every(n => n === 'export.json' || listed.has(n)), 'EXTRA_OR_MISSING_FILE');
  for (const [path, item] of listed) {
    const bytes = entries.get(path);
    check(bytes && bytes.length === item.byteSize, 'RECEIPT_MISMATCH');
    check(await sha256Hex(bytes) === item.sha256, 'DIGEST_MISMATCH');
  }

  // --- book.json ---
  const book = parseJson(entries.get('book.json'), 'INVALID_BOOK_JSON');
  check(onlyKeys(book, ['format', 'packageId', 'bookId', 'title', 'language', 'snapshotNo', 'coverAssetId', 'chapterCount', 'imageCount']) &&
    book.format === READER_BOOK_FORMAT && book.packageId === manifest.packageId && book.bookId === manifest.bookId &&
    str(book.title, 300) && book.language === manifest.language && book.snapshotNo === manifest.source.revision &&
    book.chapterCount === manifest.chapters.length && book.imageCount === manifest.assets.length &&
    (book.coverAssetId === null || (typeof book.coverAssetId === 'string' && manifest.assets.some(a => a.id === book.coverAssetId))),
  'INVALID_BOOK_JSON');

  // --- Kapitel-Begleitdateien: genau eine je Manifest-Kapitel ---
  const chapterSidecars = new Map();
  const expectedChapterFiles = new Set(manifest.chapters.map(c => `chapters/${c.id}.json`));
  for (const name of entries.keys()) if (name.startsWith('chapters/')) check(expectedChapterFiles.has(name), 'EXTRA_OR_MISSING_FILE');
  const assetIds = new Set(manifest.assets.map(a => a.id));
  manifest.chapters.forEach((chapter, index) => {
    const bytes = entries.get(`chapters/${chapter.id}.json`);
    check(bytes, 'EXTRA_OR_MISSING_FILE');
    const side = parseJson(bytes, 'INVALID_CHAPTER_JSON');
    check(onlyKeys(side, ['format', 'chapterId', 'position', 'revision', 'revisionSha256', 'title', 'segmentIds', 'images', 'audio']) &&
      side.format === READER_CHAPTER_FORMAT && side.chapterId === chapter.id && side.position === index + 1 &&
      side.revision === chapter.revision && SHA.test(side.revisionSha256) && side.title === chapter.title &&
      sameList(side.segmentIds, chapter.segments.map(s => s.id)) && Array.isArray(side.images) && side.images.length <= 100 &&
      (side.audio === null || isRecord(side.audio)), 'INVALID_CHAPTER_JSON');
    for (const image of side.images) {
      check(onlyKeys(image, ['assetId', 'role']) && assetIds.has(image.assetId) && chapter.assetIds.includes(image.assetId) &&
        IMAGE_ROLES.includes(image.role), 'INVALID_CHAPTER_JSON');
    }
    chapterSidecars.set(chapter.id, side);
  });

  // --- Bilddateien: nur die Pfade des Manifests, Hashes (verifyPayload) und Magic Bytes ---
  const files = new Map();
  const assetPaths = new Set(manifest.assets.map(a => a.path));
  for (const name of entries.keys()) if (name.startsWith('assets/')) check(assetPaths.has(name), 'EXTRA_OR_MISSING_FILE');
  for (const asset of manifest.assets) {
    const bytes = entries.get(asset.path);
    check(bytes, 'EXTRA_OR_MISSING_FILE');
    files.set(asset.path, bytes);
  }
  const receiptVerified = await verifyPayload(manifest, files); // Struktur, Groessen, sha256 aller Bilder UND Segmenttexte
  const images = new Map();
  for (const asset of manifest.assets) {
    let info;
    try { info = inspectImage(files.get(asset.path)); } catch { fail('IMAGE_INVALID'); }
    check(info.mime === asset.mime, 'IMAGE_INVALID');
    images.set(asset.id, info);
  }

  const textChars = manifest.chapters.reduce((sum, c) => sum + c.segments.reduce((s, x) => s + x.text.length, 0), 0);
  const summary = Object.freeze({
    title: book.title, packageId: manifest.packageId, bookId: manifest.bookId, audience: manifest.audience,
    decisionId: receipt.decision.id, snapshotNo: receipt.decision.snapshotNo, language: manifest.language,
    chapters: receiptVerified.chapters, segments: receiptVerified.segments, images: receiptVerified.assets,
    textChars, imageBytes: receiptVerified.byteLength, manifestSha256, sourceSha256: manifest.source.sha256,
    createdAt: receipt.decision.createdAt,
  });
  return {manifest, files, book, chapterSidecars, receipt, images, summary};
}

export {ZipReadError, ReaderPackageError};
