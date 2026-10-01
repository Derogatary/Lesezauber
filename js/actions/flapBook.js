import { app } from '../core.js';

// ================= 🪟 Klappenbücher (v0.51.0-beta, überarbeitet v0.52.0-beta) =================
// NEU (Nutzerwunsch: "vorher als Auswahl Klappenbuch, dann können Seiten als
// Klappen für Seiten zugeordnet werden").
// FIX v0.52.0-beta (Nutzer-Klarstellung): die Klappe wird als EIGENES,
// schon auf die Klappe zugeschnittenes Foto aufgenommen (beim Fotografieren
// bzw. beim Erstellen der PDF auf die Klappe begrenzt) und ganz normal wie
// eine Seite ausgelesen - kein Zwei-Bilder-Vergleich mehr (das frühere
// app.api.analyzeFlap ist entfernt).
//
// Ablauf:
// 1. Beim Anlegen "🪟 Klappenbuch" wählen (oder später in der Buchansicht
//    umschalten) -> book.flapBook = true.
// 2. Klappen-Foto im ⋮-Menü "Als Klappe zuordnen" -> Nummer der Hauptseite
//    -> page.flapOf = ID der Hauptseite. Sonst bleibt es eine normale Seite
//    (Analyse, Personas, Hintergrund-Vorbereitung, KI-Stimme wie immer).
// 3. Beim automatischen Vorlesen wird die Klappen-Seite NICHT als eigene
//    Seite gelesen, sondern innerhalb der Hauptseite (js/tts.js):
//    Text -> Bildbeschreibung -> je Klappe "Heb mal die Klappe hoch!" +
//    Klappen-Text + Klappen-Bildbeschreibung -> schwierige Wörter (Seite +
//    Klappen) -> Rätsel -> Zwischenruf.

Object.assign(app.state, {
    newBookFlaps: false
});

const FLAP_INTROS = ['Heb mal die Klappe hoch!', 'Und jetzt die nächste Klappe!', 'Noch eine Klappe - was ist wohl darunter?'];

function currentBook() {
    return app.library[app.state.currentBookId];
}

Object.assign(app.utils, {
    // Zusatzfelder für ein NEU angelegtes Buch (Kamera, Galerie, PDF, EPUB)
    newBookFlapFields() {
        return app.state.newBookFlaps && app.state.newBookType !== 'workbook' ? { flapBook: true } : {};
    },

    // Ist diese Seite eine zugeordnete Klappe (und das Buch ein Klappenbuch)?
    isFlapPage(book, page) {
        return !!(book && book.flapBook && page && page.flapOf && book.pages.some(p => p.id === page.flapOf));
    },

    // Fertig ausgelesene Klappen einer Hauptseite (in Seiten-Reihenfolge),
    // jeweils mit der Fassung des gewählten Erzählers.
    flapsForPage(book, page, personaId) {
        if (!book || !page || !book.flapBook || page.flapOf) return [];
        return book.pages
            .filter(p => p.flapOf === page.id && !p.excluded && p.status === 'done')
            .map(p => ({ page: p, variant: app.utils.resolvePageVariant(p, personaId) }))
            .filter(f => f.variant);
    },

    // Feste Einleitung je Klappe (gut für den KI-Stimmen-Zwischenspeicher)
    flapIntro(idx) {
        return FLAP_INTROS[Math.min(idx, FLAP_INTROS.length - 1)];
    },

    // NEU (v0.53.0-beta): Sprach-Teile einer Seite in Vorlese-Reihenfolge für
    // Hörbuch (app.ttsNeural.renderPageSegments) und Video
    // (js/actions/videoTimeline.js) - EINE Stelle, damit beide dieselbe
    // Reihenfolge haben wie das automatische Vorlesen (js/tts.js):
    //   Text -> Bildbeschreibung -> je Klappe Einleitung/Text/Bild -> Rätsel.
    // Jeder Teil: { kind, text, page, imgUrl, isPageText } - "kind" ist
    // eindeutig (flap0Text, flap1Desc ...), damit das Video den passenden
    // Ton-Abschnitt per kind wiederfindet; imgUrl ist bei Klappen das
    // Klappen-Foto (das Video wechselt dort das Bild); isPageText = hier darf
    // eine eigene Aufnahme (js/actions/voiceRecord.js) den Text ersetzen.
    pageSpeechParts(book, page, variant, personaId, { includeDescription = true, includeQuiz = false } = {}) {
        const parts = [{ kind: 'text', text: variant.text, page, imgUrl: page.imgUrl, isPageText: true }];
        if (includeDescription && variant.desc) parts.push({ kind: 'desc', text: variant.desc, page, imgUrl: page.imgUrl });
        app.utils.flapsForPage(book, page, personaId).forEach((f, i) => {
            const img = f.page.imgUrl;
            parts.push({ kind: `flap${i}Intro`, text: app.utils.flapIntro(i), page: f.page, imgUrl: img });
            if (f.variant.text && f.variant.text !== 'Kein Text.') {
                parts.push({ kind: `flap${i}Text`, text: f.variant.text, page: f.page, imgUrl: img, isPageText: true });
            }
            if (includeDescription && f.variant.desc) parts.push({ kind: `flap${i}Desc`, text: f.variant.desc, page: f.page, imgUrl: img });
        });
        if (includeQuiz && variant.quizQ) {
            parts.push({ kind: 'quizQ', text: variant.quizQ, page, imgUrl: page.imgUrl });
            if (variant.quizA) parts.push({ kind: 'quizA', text: variant.quizA, page, imgUrl: page.imgUrl });
        }
        return parts;
    },

    // Schwierige Wörter von Seite + Klappen zusammen, ohne Doppelte
    mergeDifficultWords(lists) {
        const seen = new Set();
        const out = [];
        lists.flat().forEach(w => {
            if (!w || !w.word || !w.explanation) return;
            const key = w.word.trim().toLowerCase();
            if (seen.has(key)) return;
            seen.add(key);
            out.push(w);
        });
        return out;
    }
});

Object.assign(app.actions, {
    // Schalter in "Neu anlegen als" (Bibliothek)
    toggleNewBookFlaps() {
        app.state.newBookFlaps = !app.state.newBookFlaps;
        app.render.newBookTypeButtons();
        app.ui.toast(app.state.newBookFlaps ? 'Neue Bücher werden als 🪟 Klappenbuch angelegt' : 'Neue Bücher ohne Klappen', 'ℹ️');
    },

    // Schalter in der Buchansicht (bestehendes Buch)
    toggleBookFlaps() {
        const book = currentBook();
        if (!book) return;
        const hasFlaps = book.pages.some(p => p.flapOf);
        if (book.flapBook && hasFlaps && !confirm('Klappenbuch ausschalten? Die Klappen werden dann wieder als eigene Seiten vorgelesen (die Zuordnung bleibt gespeichert).')) return;
        book.flapBook = !book.flapBook;
        app.dbOps.saveBook(book);
        app.render.book(book.id);
        app.ui.toast(book.flapBook ? '🪟 Klappenbuch: Klappen-Fotos über ⋮ → „Als Klappe zuordnen“' : 'Kein Klappenbuch mehr', 'ℹ️');
    },

    assignFlap(pageId) {
        const book = currentBook();
        const page = book?.pages.find(p => p.id === pageId);
        if (!page) return;
        const ownIdx = book.pages.indexOf(page);
        const answer = prompt('Zu welcher Seite gehört diese Klappe? (Nummer der Hauptseite)', String(ownIdx > 0 ? ownIdx : ''));
        if (answer === null) return;
        const baseIdx = parseInt(answer, 10) - 1;
        const base = book.pages[baseIdx];
        if (!base || base === page) {
            app.ui.toast('Diese Seitennummer gibt es nicht.', '⚠️');
            return;
        }
        if (base.flapOf) {
            app.ui.toast(`Seite ${baseIdx + 1} ist selbst eine Klappe - bitte die Hauptseite wählen.`, '⚠️');
            return;
        }
        if (book.pages.some(p => p.flapOf === page.id)) {
            app.ui.toast('Diese Seite hat selbst Klappen - sie kann keine Klappe sein.', '⚠️');
            return;
        }
        page.flapOf = base.id;
        app.dbOps.saveBook(book);
        app.render.book(book.id);
        app.ui.toast(`🪟 Klappe von Seite ${baseIdx + 1} - wird dort mit vorgelesen.`, '✅');
        // Noch nicht ausgelesen? Wie jede andere Seite auslesen.
        const analyzeIfNeeded = (cropped) => {
            if ((page.status === 'pending' || page.status === 'error') && !page.excluded && app.settings.apiKey) {
                app.actions.analyzePage(ownIdx).catch(() => {});
            } else if (cropped && page.status === 'done') {
                // Ausschnitt geändert -> Text passt evtl. nicht mehr
                app.actions.reanalyzePage(ownIdx, { skipConfirm: true });
            }
        };
        // NEU (v0.53.0-beta): direkt auf die Klappe zuschneiden (js/actions/pageCrop.js)
        if (!page.originalImgUrl && confirm('Das Foto jetzt auf die Klappe zuschneiden?\n\n(Nicht nötig, wenn es schon nur die Klappe zeigt.)' + (page.status === 'done' ? '\nDie Seite wird danach neu ausgelesen (eine KI-Anfrage).' : ''))) {
            app.actions.openPageCrop(page.id, { hint: 'Rahmen um die Klappe ziehen.', onDone: (applied) => analyzeIfNeeded(applied) });
        } else {
            analyzeIfNeeded(false);
        }
    },

    unassignFlap(pageId) {
        const book = currentBook();
        const page = book?.pages.find(p => p.id === pageId);
        if (!page) return;
        delete page.flapOf;
        app.dbOps.saveBook(book);
        app.render.book(book.id);
        app.ui.toast('Klappe gelöst - ist wieder eine eigene Seite.', '✅');
    },

    // Bild im Reader (und Vollbild) auf das Klappen-Foto umschalten -
    // null = zurück zur Hauptseite
    showFlapImage(flapPage) {
        const book = currentBook();
        const page = book?.pages[app.state.currentPageIdx];
        if (!page) return;
        const url = flapPage ? app.utils.resolveDisplayImageUrl(flapPage) : app.utils.resolveDisplayImageUrl(page);
        const img = document.getElementById('readerImg');
        if (img) img.src = url;
        if (app.state.focusMode && app.state._focusFrontImg) app.state._focusFrontImg.src = url;
        app.state.openFlapId = flapPage ? flapPage.id : null;
        app.render.readerFlaps?.();
    },

    // Knöpfe im Reader: Klappe aufklappen (Bild + Text + vorlesen) / zuklappen
    toggleReaderFlap(flapId) {
        const book = currentBook();
        const base = book?.pages[app.state.currentPageIdx];
        const flaps = app.utils.flapsForPage(book, base, app.state.readingPersonaId);
        const idx = flaps.findIndex(f => f.page.id === flapId);
        if (idx < 0) return;
        if (app.state.autoReadActive) app.tts.stopAutoRead();
        app.tts.stop();
        if (app.state.openFlapId === flapId) {
            this.showFlapImage(null);
            return;
        }
        this.showFlapImage(flaps[idx].page);
        app.tts.speakFlap(flaps[idx], idx, null);
    }
});

// FIX v0.52.0-beta: Klappen aus v0.51.0-beta (Zwei-Bilder-Vergleich) hatten
// excluded=true und ein eigenes "flap"-Feld - auf das neue Modell umstellen,
// damit sie wieder normal ausgelesen werden. Läuft beim Öffnen eines Buchs.
app.utils.migrateOldFlaps = function (book) {
    if (!book) return false;
    let changed = false;
    book.pages.forEach(p => {
        if (p.flapOf && p.flap) {
            delete p.flap;
            p.excluded = false;
            changed = true;
        }
    });
    return changed;
};
