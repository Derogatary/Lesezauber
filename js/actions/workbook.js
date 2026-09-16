import { app } from '../core.js';

// ================= Heft-Modus (Übungshefte) =================
// Ein Buch ist entweder eine "Geschichte" (Bilderbuch zum Vorlesen, das
// bisherige Verhalten) oder ein "Übungsheft" (Arbeitsblätter zum
// Mitmachen). Die Art steckt in book.bookType und entscheidet, welchen
// Prompt die KI bekommt (js/api.js) und was der Reader anzeigt.

function typeLabel(typeId) {
    const found = app.bookTypes.find(t => t.id === typeId);
    return found ? `${found.icon} ${found.label}` : typeId;
}

Object.assign(app.actions, {
    // Art für das NÄCHSTE neu angelegte Buch (Kamera, Galerie, PDF, EPUB).
    // Muss vor dem Anlegen feststehen, weil die erste Seite direkt nach
    // dem Foto analysiert wird.
    setNewBookType(typeId) {
        if (!app.bookTypes.some(t => t.id === typeId)) return;
        app.state.newBookType = typeId;
        app.render.newBookTypeButtons();
        app.ui.toast(`Neue Bücher werden als ${typeLabel(typeId)} angelegt`, 'ℹ️');
    },

    // Art eines BESTEHENDEN Buches ändern. Schon ausgelesene Seiten passen
    // danach nicht mehr (ein Erzähltext ist keine Aufgabenstellung), das
    // Neu-Auslesen ist aber eine eigene Entscheidung - es kostet pro Seite
    // einen KI-Aufruf.
    setBookType(typeId) {
        const book = app.library[app.state.currentBookId];
        if (!book) return;
        if (!app.bookTypes.some(t => t.id === typeId)) return;

        const currentType = app.utils.resolveBookType(book);
        if (currentType === typeId) return;

        if (!confirm(`"${book.title}" ab jetzt als ${typeLabel(typeId)} behandeln?`)) return;

        const analyzed = book.pages.filter(p =>
            (p.variants && Object.keys(p.variants).length > 0) || p.text
        );

        if (analyzed.length > 0) {
            const resetThem = confirm(
                `${analyzed.length} Seite(n) wurden bereits als ${typeLabel(currentType)} ausgelesen.\n\n` +
                `OK = Seiten zum Neu-Auslesen freigeben (die alten Texte werden dabei ersetzt, jede Seite kostet erneut einen KI-Aufruf)\n` +
                `Abbrechen = alte Texte vorerst behalten`
            );
            if (resetThem) {
                analyzed.forEach(p => {
                    delete p.variants;
                    // Auch die flachen Felder alter Bücher leeren, sonst
                    // liefert resolvePageVariant() weiter den alten Text.
                    p.text = ''; p.erstleserText = ''; p.desc = ''; p.quizQ = ''; p.quizA = '';
                    p.status = 'pending';
                });
            }
        }

        // Ein Buch-Quiz ("Fragen zur Geschichte") ergibt für ein Übungsheft
        // keinen Sinn mehr - sonst taucht es auf der letzten Heftseite auf.
        if (typeId === 'workbook') delete book.bookQuiz;

        book.bookType = typeId;
        app.dbOps.saveBook(book);
        app.ui.toast(`Ist jetzt ein ${typeLabel(typeId)}`, '✅');
        app.render.book(book.id);
    },

    // Lösung im Heft-Modus aufdecken - bewusst ein extra Tipp, damit das
    // Kind nicht schon beim Öffnen der Hilfe die Antwort sieht.
    toggleWorkbookSolution() {
        const solution = document.getElementById('workbookSolution');
        const btn = document.getElementById('workbookSolutionBtn');
        if (!solution) return;
        const wasHidden = solution.classList.contains('hidden');
        solution.classList.toggle('hidden', !wasHidden);
        if (btn) btn.innerText = wasHidden ? 'Lösung wieder verstecken' : 'Lösung zeigen';
    }
});
