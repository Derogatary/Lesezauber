// PORT (AS-LZ-L1/L2, Autorenstudio -> Lesezauber): unveraenderte Kopie von mcp/src/readerImportPlan.mjs
// des Autorenstudio-Repos (Stand AS53, 2026-11-17). Verhalten bewusst identisch halten; einzige
// Aenderung: Endung .js und der Importpfad. Aenderungen NUR zusammen mit der Studio-Seite.
/** AS-LZ-L2 synthetic-only import planner.
 * Pure planning: no IndexedDB/ZIP/network writes or authenticated author decision.
 * verifyPayload rehashes every supplied file before planning. The caller must
 * separately verify rights/author decisions and commit atomically in the reader.
 */
import {verifyPayload, ReaderPackageError} from './readerPackageV1.js';

const ID = /^[A-Za-z0-9][A-Za-z0-9_-]{0,79}$/u;
const SHA = /^[a-f0-9]{64}$/u;
const fail = code => { throw new ReaderPackageError(code); };
const validId = x => typeof x === 'string' && ID.test(x);
const validSha = x => typeof x === 'string' && SHA.test(x);
const isRecord = x => x !== null && typeof x === 'object' && !Array.isArray(x) && Object.getPrototypeOf(x) === Object.prototype;
const sameFields = (x, names) => isRecord(x) && Object.keys(x).length === names.length && names.every(name => Object.hasOwn(x, name));
const oldFields = ['localId','packageId','bookId','sourceSha256','manifestSha256','lastPosition'];
const normalize = (entry) => {
  if (!sameFields(entry, oldFields) || !validId(entry.packageId) || !validId(entry.bookId) ||
      !validSha(entry.sourceSha256) || !validSha(entry.manifestSha256) ||
      typeof entry.localId !== 'string' || entry.localId.length > 160 || !/^lz_[a-f0-9]{64}$/u.test(entry.localId) ||
      (entry.lastPosition !== null && !(Number.isSafeInteger(entry.lastPosition) && entry.lastPosition >= 0))) fail('INVALID_LIBRARY_INDEX');
  return entry;
};

/** Returns a frozen PLAN, never mutates an existing reader library.
 * Existing entries are privacy-minimal metadata; text, profiles and audio cache
 * must not be supplied. The read/commit boundary must be owned by the app.
 */
export async function planReaderImport(manifest, files, existingEntries) {
  const receipt = await verifyPayload(manifest, files);
  if (!Array.isArray(existingEntries) || existingEntries.length > 2000) fail('INVALID_LIBRARY_INDEX');
  const entries = existingEntries.map(normalize);
  if (new Set(entries.map(x => x.localId)).size !== entries.length ||
      new Set(entries.map(x => x.packageId)).size !== entries.length) fail('INVALID_LIBRARY_INDEX');
  const previous = entries.find(x => x.packageId === manifest.packageId);
  if (previous) {
    if (previous.bookId !== manifest.bookId || previous.sourceSha256 !== manifest.source.sha256 ||
        previous.manifestSha256 !== receipt.manifestSha256) fail('PACKAGE_ID_CONFLICT');
    return Object.freeze({action:'ALREADY_INSTALLED', existingLocalId:previous.localId,
      keepReadingPosition:previous.lastPosition, receipt, mutations:0});
  }
  const localId = 'lz_' + receipt.manifestSha256;
  if (entries.some(x => x.localId === localId)) fail('LOCAL_ID_CONFLICT');
  const priorEditions = entries.filter(x => x.bookId === manifest.bookId);
  const newEntry = Object.freeze({localId,packageId:manifest.packageId,bookId:manifest.bookId,
    sourceSha256:manifest.source.sha256,manifestSha256:receipt.manifestSha256,lastPosition:null});
  return Object.freeze({action:priorEditions.length ? 'ADD_EDITION' : 'ADD_BOOK',
    newEntry, previousEditionIds:Object.freeze(priorEditions.map(x => x.localId)),
    receipt, mutations:0});
}
