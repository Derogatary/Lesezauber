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

            // NEU: Titel-/Rückseite/Autorenseite (Bugreport: "fehlende
            // Meta-Seiten") - IDs starten ab existing?.pages.length, damit sie
            // bei einem erneuten "Ins Regal stellen" stabil bleiben und nicht
            // mit den Doppelseiten-IDs kollidieren (siehe unten).
            const meta = app.studio.buildMetaPages(project, author);
            const baseTime = Date.now();
            // Bei einem erneuten "Ins Regal stellen" nur die BISHERIGEN
            // Doppelseiten-IDs wiederverwenden (nicht Titel-/Rück-/
            // Autorenseite, die haben ihre eigenen, festen IDs oben/unten) -
            // sonst würde jede Aktualisierung des Buchs die Seiten-IDs
            // verschieben und z.B. den Lesefortschritt (progress/check, an
            // die Seiten-ID gebunden) durcheinanderbringen.
            const existingSpreadPages = (existing?.pages || []).filter(p =>
                p.id !== existing?.titlePageId && p.id !== existing?.backCoverPageId && p.id !== existing?.authorBioPageId
            );
            const titlePage = {
                id: existing?.titlePageId ?? (baseTime - 1),
                imgUrl: meta.title.imgUrl, thumbUrl: meta.title.thumbUrl,
                status: 'done',
                variants: { [personaId]: { text: meta.title.text, erstleserText: meta.title.text, desc: null, quizQ: null, quizA: null } }
            };

            const spreadPages = project.spreads.map((spread, i) => ({
                id: existingSpreadPages[i]?.id ?? (baseTime + i),
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

            const backCoverPage = {
                id: existing?.backCoverPageId ?? (baseTime + project.spreads.length + 1),
                imgUrl: meta.backCover.imgUrl, thumbUrl: meta.backCover.thumbUrl,
                status: 'done',
                variants: { [personaId]: { text: meta.backCover.text, erstleserText: meta.backCover.text, desc: null, quizQ: null, quizA: null } }
            };
            const authorBioPage = {
                id: existing?.authorBioPageId ?? (baseTime + project.spreads.length + 2),
                imgUrl: meta.authorBio.imgUrl, thumbUrl: meta.authorBio.thumbUrl,
                status: 'done',
                variants: { [personaId]: { text: meta.authorBio.text, erstleserText: meta.authorBio.text, desc: null, quizQ: null, quizA: null } }
            };

            const pages = [titlePage, ...spreadPages, backCoverPage, authorBioPage];

            const book = existing || {
                id: bookId,
                created: Date.now(),
                profileId: project.profileId || app.utils.resolveCreationProfileId(),
                lastReadIdx: 0
            };
            book.title = project.title || 'Unbenanntes Werk';
            book.author = author;
            book.bookType = 'story';
            // NEU: selbst geschrieben - erst dadurch wird der Video-Export
            // überhaupt angeboten (siehe app.utils.resolveBookOrigin und
            // docs/KONZEPT-Video.md, Abschnitt 7 zum Urheberrecht).
            book.origin = 'authored';
            // NEU: informative Rückverknüpfung zum Werkstatt-Projekt - rein
            // deklarativ, kein anderer Code liest dieses Feld in Stufe 1,
            // aber spätere Stufen (z.B. "Bild jetzt generieren" direkt aus
            // dem fertigen Buch heraus) können darüber zum Projekt zurück.
            book.studioProjectId = project.id;
            book.pages = pages;
            book.coverPageId = titlePage.id;
            book.titlePageId = titlePage.id;
            book.backCoverPageId = backCoverPage.id;
            book.authorBioPageId = authorBioPage.id;
            // NEU: NUR bei einer wirklich angegebenen Verlagsangabe setzen -
            // ein Platzhalter wie "Selbstverlag" würde beim automatischen
            // Vorlesen unschön "Aus dem Selbstverlag-Verlag" ergeben (siehe
            // js/tts.js _buildBookIntro()). Der Selbstverlags-Hinweis steht
            // stattdessen als Text auf der Autorenseite (studioMetaPages.js).
            if (project.meta?.publisher) book.publisher = project.meta.publisher;
            // NEU: Reihen-Tag - macht das Buch über die bereits vorhandene
            // Bibliothekssuche ("Titel, Autor, Verlag, Reihe...") und den
            // Reihen-Chip auf der Bücherkarte (render/library.js) auffindbar.
            if (project.seriesName) book.series = project.seriesName;

            app.dbOps.saveBook(book);
            return book;
        }
    }
});
