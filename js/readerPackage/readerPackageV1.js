// PORT (AS-LZ-L1/L2, Autorenstudio -> Lesezauber): unveraenderte Kopie von mcp/src/readerPackageV1.mjs
// des Autorenstudio-Repos (Stand AS53, 2026-11-17). Verhalten bewusst identisch halten; einzige
// Aenderung: Endung .js und der Importpfad. Aenderungen NUR zusammen mit der Studio-Seite.
/** AS-LZ-01/L1: pure, offline ReaderPackageV1 validator. Synthetic pilot only.
 * This is NOT an authorization, license, ZIP, backup, or publication service.
 * The trusted Author-Studio BFF must independently attest source/release scope.
 */
const FORMAT = 'editionboysen-reader-package/1';
const ID = /^[A-Za-z0-9][A-Za-z0-9_-]{0,79}$/u;
const SHA = /^[a-f0-9]{64}$/u;
const MIME = Object.freeze({ 'image/png': '.png', 'image/jpeg': '.jpg', 'image/webp': '.webp', 'audio/mpeg': '.mp3', 'audio/ogg': '.ogg', 'audio/wav': '.wav' });
const enc = new TextEncoder();
export class ReaderPackageError extends Error {
  constructor(code) { super(code); this.name = 'ReaderPackageError'; this.code = code; }
}
const fail = code => { throw new ReaderPackageError(code); };
const obj = v => v !== null && typeof v === 'object' && !Array.isArray(v) && Object.getPrototypeOf(v) === Object.prototype;
const keys = (v, allowed) => obj(v) && Object.keys(v).every(k => allowed.includes(k));
const check = (test, code) => { if (!test) fail(code); };
const id = v => typeof v === 'string' && ID.test(v);
const sha = v => typeof v === 'string' && SHA.test(v);
const text = (v, max) => typeof v === 'string' && v.length > 0 && v.length <= max && !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(v);
const pathOk = (path, prefix, suffix) => typeof path === 'string' && path.length <= 180 &&
  path.startsWith(prefix) && path.endsWith(suffix) &&
  /^[A-Za-z0-9_-]+(?:\/[A-Za-z0-9_-]+)*\.[a-z0-9]{2,5}$/u.test(path) && !path.includes('..');
const unique = list => new Set(list).size === list.length;
const canonical = value => Array.isArray(value) ? '[' + value.map(canonical).join(',') + ']' :
  obj(value) ? '{' + Object.keys(value).sort().map(k => JSON.stringify(k) + ':' + canonical(value[k])).join(',') + '}' : JSON.stringify(value);
export const canonicalManifest = manifest => canonical(manifest);
export async function sha256Hex(bytes) {
  const input = typeof bytes === 'string' ? enc.encode(bytes) : bytes;
  check(input instanceof Uint8Array || input instanceof ArrayBuffer, 'INVALID_BYTES');
  const digest = await crypto.subtle.digest('SHA-256', input);
  return [...new Uint8Array(digest)].map(x => x.toString(16).padStart(2, '0')).join('');
}
export const manifestHash = async manifest => sha256Hex(canonicalManifest(manifest));

/** Structural validation of untrusted manifest: returns normalized counts, does not mutate any store. */
export function validateManifest(m) {
  check(keys(m, ['format','packageId','bookId','source','audience','decision','language','readingOrder','chapters','assets','audio']), 'INVALID_ENVELOPE');
  check(m.format === FORMAT && id(m.packageId) && id(m.bookId) && m.audience === 'PRIVATE_READER_PREVIEW', 'INVALID_ENVELOPE');
  check(keys(m.source, ['revision','sha256']) && Number.isSafeInteger(m.source.revision) && m.source.revision > 0 && sha(m.source.sha256), 'INVALID_SOURCE');
  check(keys(m.decision, ['ref','scope']) && id(m.decision.ref) && m.decision.scope === 'PRIVATE_READER_PREVIEW', 'MISSING_DECISION');
  // Presence of a decision reference is NOT proof of authorization: the trusted BFF checks it.
  check(typeof m.language === 'string' && /^[a-z]{2}(?:-[A-Z]{2})?$/u.test(m.language), 'INVALID_LANGUAGE');
  check(Array.isArray(m.chapters) && m.chapters.length > 0 && m.chapters.length <= 400, 'INVALID_CHAPTERS');
  check(Array.isArray(m.readingOrder) && m.readingOrder.length === m.chapters.length, 'INVALID_READING_ORDER');
  check(Array.isArray(m.assets) && m.assets.length <= 2500, 'INVALID_ASSETS');
  check(Array.isArray(m.audio) && m.audio.length <= 2500, 'INVALID_AUDIO');
  const chapterIds = [], segmentIds = [], paths = [], assetIds = [];
  let textChars = 0;
  for (const c of m.chapters) {
    check(keys(c, ['id','revision','title','segments','assetIds']) && id(c.id) && text(c.title, 300) &&
      Number.isSafeInteger(c.revision) && c.revision > 0 && Array.isArray(c.segments) && c.segments.length <= 4000 &&
      Array.isArray(c.assetIds) && c.assetIds.length <= 100, 'INVALID_CHAPTER');
    chapterIds.push(c.id);
    for (const s of c.segments) {
      check(keys(s, ['id','text','sha256']) && id(s.id) && text(s.text, 10000) && sha(s.sha256), 'INVALID_SEGMENT');
      segmentIds.push(s.id);
      textChars += s.text.length;
      check(textChars <= 3_000_000 && segmentIds.length <= 25000, 'PACKAGE_TOO_LARGE');
    }
  }
  check(unique(chapterIds) && unique(segmentIds), 'DUPLICATE_ID');
  check(unique(m.readingOrder) && m.readingOrder.every(x => chapterIds.includes(x)), 'INVALID_READING_ORDER');
  const referencedAssets = m.chapters.flatMap(c => c.assetIds);
  for (const a of m.assets) {
    check(keys(a, ['id','path','sha256','mime','rightsRef','alt']) && id(a.id) && sha(a.sha256) &&
      typeof a.mime === 'string' && a.mime.startsWith('image/') && MIME[a.mime] &&
      pathOk(a.path, 'assets/', MIME[a.mime]) && id(a.rightsRef) && text(a.alt, 500), 'INVALID_ASSET');
    assetIds.push(a.id); paths.push(a.path);
  }
  check(unique(assetIds) && referencedAssets.every(x => assetIds.includes(x)), 'MISSING_ASSET');
  check(m.assets.every(a => referencedAssets.includes(a.id)), 'ORPHAN_ASSET');
  const audioSegments = [];
  for (const a of m.audio) {
    check(keys(a, ['segmentId','path','sha256','mime','voiceRef']) && id(a.segmentId) && sha(a.sha256) &&
      typeof a.mime === 'string' && a.mime.startsWith('audio/') && MIME[a.mime] &&
      pathOk(a.path, 'audio/', MIME[a.mime]) && id(a.voiceRef), 'INVALID_AUDIO');
    check(segmentIds.includes(a.segmentId), 'INVALID_AUDIO');
    paths.push(a.path); audioSegments.push(a.segmentId);
  }
  check(unique(paths) && unique(audioSegments), 'DUPLICATE_ID');
  return Object.freeze({ chapters: chapterIds.length, segments: segmentIds.length, assets: m.assets.length, audio: m.audio.length });
}

/** Verify the pre-extracted, bounded files, NOT a ZIP decompression implementation. */
export async function verifyPayload(m, files) {
  const summary = validateManifest(m);
  check(files instanceof Map, 'INVALID_FILES');
  const refs = [...m.assets, ...m.audio];
  check(files.size === refs.length && files.size <= 5000, 'EXTRA_OR_MISSING_FILE');
  let total = 0;
  for (const asset of refs) {
    const bytes = files.get(asset.path);
    check(bytes instanceof Uint8Array && bytes.byteLength > 0 && bytes.byteLength <= 20 * 1024 * 1024, 'EXTRA_OR_MISSING_FILE');
    total += bytes.byteLength;
    check(total <= 250 * 1024 * 1024, 'PAYLOAD_TOO_LARGE');
    check(await sha256Hex(bytes) === asset.sha256, 'DIGEST_MISMATCH');
  }
  for (const c of m.chapters) for (const s of c.segments)
    check(await sha256Hex(s.text) === s.sha256, 'TEXT_DIGEST_MISMATCH');
  // A source snapshot SHA is an external reference, not derivable from reader text here.
  return Object.freeze({...summary, byteLength: total, manifestSha256: await manifestHash(m)});
}
