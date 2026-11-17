// Atomarer Schreibzugriff fuer importierte Reader-Pakete.
// Garantien (per Test abgesichert, tests/readerStore.test.mjs):
//  - EINE Transaktion, Geltungsbereich NUR der Store 'books'. Kinderprofile (localStorage), Mikrofonaufnahmen
//    (voiceRecordings), BuchatlasDB, ttsCache, projects, vocabulary und Lesepositionen anderer Buecher werden weder
//    gelesen noch geschrieben.
//  - store.add(), nie put(): ein vorhandener Datensatz mit gleicher ID wird nie ueberschrieben (ConstraintError ->
//    ALREADY_INSTALLED). Die ID ist 'lz_' + manifestSha256, also je Paketinhalt eindeutig (Idempotenz).
//  - Buch + Kapitel (Seiten) + Bilder (als Data-URLs der Seiten) liegen in EINEM Datensatz: entweder alles oder nichts.
//  - ADD_EDITION: die alte Ausgabe bleibt unveraendert als eigener Datensatz bestehen; sie wird nicht angefasst.
//  - Kein Schema-Upgrade: die DB-Version bleibt 5, es entsteht kein neuer Object Store.
export const BOOKS_STORE = 'books';

export class ReaderStoreError extends Error {
  constructor(code, message) { super(message || code); this.name = 'ReaderStoreError'; this.code = code; }
}

export function commitReaderBook(db, book) {
  return new Promise((resolve, reject) => {
    if (!book || typeof book.id !== 'string' || !/^lz_[a-f0-9]{64}$/u.test(book.id) || !book.readerPackage ||
        book.readerPackage.audience !== 'PRIVATE_READER_PREVIEW') {
      reject(new ReaderStoreError('INVALID_BOOK')); return;
    }
    let tx;
    try { tx = db.transaction([BOOKS_STORE], 'readwrite'); } catch (e) { reject(e); return; }
    let failure = null;
    try {
      const request = tx.objectStore(BOOKS_STORE).add(book);
      // Kein preventDefault: ein Fehler der Anfrage bricht die Transaktion ab (onabort liefert dann `failure`).
      request.onerror = () => {
        const error = request.error;
        failure = error && error.name === 'ConstraintError' ? new ReaderStoreError('ALREADY_INSTALLED')
          : (error || new ReaderStoreError('WRITE_FAILED'));
      };
    } catch (e) { try { tx.abort(); } catch { /* ignore */ } reject(e); return; }
    tx.oncomplete = () => resolve({id: book.id});
    tx.onabort = () => {
      const error = failure || tx.error || new ReaderStoreError('WRITE_ABORTED');
      reject(error && error.name === 'QuotaExceededError'
        ? new ReaderStoreError('QUOTA', 'Gerätespeicher voll – nichts wurde importiert.') : error);
    };
    tx.onerror = () => {}; // onabort liefert den Fehler
  });
}
