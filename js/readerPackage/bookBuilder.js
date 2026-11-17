// Baut aus einem GEPRUEFTEN Reader-Paket (packageLoader.js) einen normalen LeseZauber-Buchdatensatz.
// Rein (kein DOM, kein IndexedDB, kein Netzwerk): Bilder kommen fertig als Data-URLs herein, damit Tests ohne Browser laufen.
//
// Abbildung auf das bestehende Datenmodell (siehe CLAUDE.md "Datenmodell"):
//   Buch      id = localId (lz_<manifestSha256>), bookType 'story', origin 'scan' (bewusst: Video-Export bleibt hinter der
//             Passwort-Bremse, weil die Vorschau nicht weitergegeben werden soll), readerPackage = Herkunft/Herkunftsnachweis
//   Titelseite  eine Seite mit Cover (oder Platzhalter) und dem Buchtitel
//   Kapitel   -> Seiten: aufeinanderfolgende Segmente werden bis ~PAGE_CHARS Zeichen zu EINER Seite zusammengefasst
//             (Segment-IDs bleiben je Seite in page.readerPackage.segmentIds); erste Kapitelseite traegt chapterTitle
//   Bilder    Kapitelbilder in Reihenfolge der Seiten; Alt-Text wird als Bildbeschreibung (variants.desc) hinterlegt;
//             Ueberzaehlige Bilder bekommen eigene Seiten (Text = Alt-Text)
// Alle Personas bekommen dieselbe Variante: ohne das wuerde der Reader fehlende Erzaehler per KI nachholen wollen
// (Netzwerk). Zusaetzlich page.noAnalysis = true: keine Auslese-/Vorbereitungs-Anfrage fuer diese Seiten.
export const PAGE_CHARS = 1000;
export const PREVIEW_NOTICE = 'Vorschau aus dem Autorenstudio – nicht veröffentlichen';

function groupSegments(segments, maxChars = PAGE_CHARS) {
  const groups = [];
  let current = [];
  let size = 0;
  for (const segment of segments) {
    if (current.length && size + segment.text.length + 1 > maxChars) { groups.push(current); current = []; size = 0; }
    current.push(segment);
    size += segment.text.length + 1;
  }
  if (current.length) groups.push(current);
  return groups;
}

/**
 * @param {object} pkg Ergebnis von loadReaderPackage()
 * @param {object} opts {personaIds: string[], images: Map<assetId,{full,thumb}>, placeholder: (title)=>{full,thumb}|null,
 *                       profileId, now}
 */
export function buildLibraryBook(pkg, {personaIds, images, placeholder, profileId = 'default', now = Date.now()}) {
  const {manifest, book, chapterSidecars, summary} = pkg;
  if (!Array.isArray(personaIds) || personaIds.length === 0) throw new Error('personaIds fehlt');
  const assetById = new Map(manifest.assets.map(a => [a.id, a]));
  const variantsFor = (text, desc = null) => Object.fromEntries(personaIds.map(id =>
    [id, {text, erstleserText: text, desc, quizQ: null, quizA: null}]));
  const pages = [];
  let nextId = 1;
  const addPage = (fields) => {
    const page = {id: nextId++, status: 'done', noAnalysis: true, ...fields};
    pages.push(page);
    return page;
  };
  const imageOf = (assetId, fallbackTitle) => {
    const own = assetId ? images.get(assetId) : null;
    return own || (placeholder ? placeholder(fallbackTitle) : null) || {full: undefined, thumb: undefined};
  };

  // Titelseite (Cover oder Platzhalter)
  const cover = book.coverAssetId;
  const coverImage = imageOf(cover, book.title);
  const titlePage = addPage({
    imgUrl: coverImage.full, thumbUrl: coverImage.thumb,
    variants: variantsFor(book.title, cover ? assetById.get(cover)?.alt ?? null : null),
    readerPackage: {role: 'title'},
  });

  for (const chapter of manifest.chapters) {
    const side = chapterSidecars.get(chapter.id);
    const chapterImages = side.images.map(i => i.assetId);
    const groups = groupSegments(chapter.segments);
    const placeholderImage = placeholder ? placeholder(chapter.title) : null;
    groups.forEach((group, n) => {
      const assetId = chapterImages[n];
      const image = assetId ? imageOf(assetId, chapter.title) : (placeholderImage || {});
      const text = group.map(s => s.text).join('\n');
      addPage({
        imgUrl: image.full, thumbUrl: image.thumb,
        ...(n === 0 ? {chapterTitle: chapter.title} : {}),
        variants: variantsFor(text, assetId ? assetById.get(assetId)?.alt ?? null : null),
        readerPackage: {chapterId: chapter.id, segmentIds: group.map(s => s.id)},
      });
    });
    // Bilder ohne eigene Textseite: eigene Seite, vorgelesen wird der Alt-Text.
    for (let n = groups.length; n < chapterImages.length; n++) {
      const asset = assetById.get(chapterImages[n]);
      const image = imageOf(chapterImages[n], chapter.title);
      addPage({
        imgUrl: image.full, thumbUrl: image.thumb,
        ...(groups.length === 0 && n === 0 ? {chapterTitle: chapter.title} : {}),
        variants: variantsFor(asset?.alt || chapter.title),
        readerPackage: {chapterId: chapter.id, segmentIds: [], imageOnly: true},
      });
    }
  }

  const localId = 'lz_' + summary.manifestSha256;
  return {
    id: localId, title: book.title, author: 'Autorenstudio (Vorschau)', created: now, profileId, lastReadIdx: 0,
    bookType: 'story', origin: 'scan',
    coverPageId: titlePage.id, titlePageId: titlePage.id,
    readerPackage: {
      formatVersion: 1, packageId: manifest.packageId, bookId: manifest.bookId, decisionId: summary.decisionId,
      audience: manifest.audience, snapshotNo: summary.snapshotNo, sourceSha256: summary.sourceSha256,
      manifestSha256: summary.manifestSha256, importedAt: now, language: manifest.language,
      chapterCount: summary.chapters, imageCount: summary.images, notice: PREVIEW_NOTICE,
    },
    pages,
  };
}

/** Eintraege fuer readerImportPlan.planReaderImport aus der Bibliothek (nur Metadaten, nie Text/Profile/Audio). */
export function readerLibraryIndex(library) {
  return Object.values(library || {}).filter(b => b && b.readerPackage && typeof b.readerPackage === 'object').map(b => ({
    localId: b.id, packageId: b.readerPackage.packageId, bookId: b.readerPackage.bookId,
    sourceSha256: b.readerPackage.sourceSha256, manifestSha256: b.readerPackage.manifestSha256,
    lastPosition: Number.isSafeInteger(b.lastReadIdx) && b.lastReadIdx >= 0 ? b.lastReadIdx : null,
  }));
}

export const isReaderPreviewBook = book => !!(book && book.readerPackage && book.readerPackage.audience === 'PRIVATE_READER_PREVIEW');
