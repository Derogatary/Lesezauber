import { app } from '../core.js';

// ================= SchreibZauber: "Ins Regal stellen" =================
// Der größte Hebel des ganzen Konzepts (siehe docs/KONZEPT-SchreibZauber.md
// D.5): ein fertiges Werk wird ein ganz normales Buch in app.library.
// Ab dann funktionieren Vorlesen, Personas, Vokabeltrainer, Buch-Quiz,
// Fortschritt und Vollbild-Modus OHNE eine einzige Zeile Extra-Code - der
// Reader kennt den Unterschied zwischen "selbst geschrieben" und "gescannt"
// gar nicht.
//
// Stufe 1 exportiert IMMER als bookType 'story' (Bilderbuch zum Vorlesen) -
// der Arbeitsheft-Pfad (Stufe 4) bekommt einen eigenen Export, sobald er
// gebaut wird, weil ein Übungsheft-Buch andere Variantenfelder braucht
// (siehe js/utils.js buildPageVariant).

Object.assign(app.studio, {
    export: {
        // Erzeugt (oder aktualisiert) das Bibliotheksbuch aus einem Projekt.
        // Wird project.exportedBookId bereits gesetzt und existiert das
        // Buch noch, werden dessen Seiten ersetzt statt eine Dublette
        // anzulegen - so kostet ein erneutes "Ins Regal stellen" nach einer
        // Textänderung keine zweite Kopie.
        toLibraryBook(project) {
            const existing = project.exportedBookId ? app.library[project.exportedBookId] : null;
            const bookId = existing ? existing.id : ('book_' + Date.now());
            const author = app.profiles.find(p => p.id === project.profileId)?.name || 'Ich';
            const personaId = app.settings.persona;

            const pages = project.spreads.map((spread, i) => ({
                id: existing?.pages[i]?.id ?? (Date.now() + i),
                imgUrl: spread.imgUrl,
                thumbUrl: spread.thumbUrl,
                status: 'done',
                variants: {
                    // Stufe 1 erzeugt noch keine zweite, echte
                    // Erstleser-Variante - der Manuskripttext wurde je nach
                    // brief.readingLevel bereits passend geschrieben (siehe
                    // studioPrompts.js), erstleserText ist deshalb bewusst
                    // identisch zu text statt ein zweiter KI-Durchlauf.
                    [personaId]: {
                        text: spread.text,
                        erstleserText: spread.text,
                        desc: null,
                        // Kein Rätsel zu einer selbst erdachten Doppelseite -
                        // der Auto-Vorlese-Modus überspringt leere Fragen
                        // ohnehin (gleiches Verhalten wie beim Heft-Modus,
                        // siehe js/utils.js buildPageVariant).
                        quizQ: null, quizA: null
                    }
                }
            }));

            const book = existing || {
                id: bookId,
                created: Date.now(),
                profileId: project.profileId || app.utils.resolveCreationProfileId(),
                lastReadIdx: 0
            };
            book.title = project.title || 'Unbenanntes Werk';
            book.author = author;
            book.bookType = 'story';
            // NEU: informative Rückverknüpfung zum Werkstatt-Projekt - rein
            // deklarativ, kein anderer Code liest dieses Feld in Stufe 1,
            // aber spätere Stufen (z.B. "Bild jetzt generieren" direkt aus
            // dem fertigen Buch heraus) können darüber zum Projekt zurück.
            book.studioProjectId = project.id;
            book.pages = pages;
            book.coverPageId = pages[0]?.id || null;

            app.dbOps.saveBook(book);
            return book;
        }
    }
});
