import { app } from '../core.js';

Object.assign(app.actions, {
    cancelAnalysis() {
        app.state.cancelAnalysis = true;
        const sub = document.getElementById('processSub');
        if (sub) sub.innerText = 'Abbruch wird eingeleitet...';
    },

    cancelScanner() {
        this.stopCamera();
        const book = app.library[app.state.currentBookId];
        if (book && book.pages.length === 0) {
            app.dbOps.deleteBook(app.state.currentBookId);
            app.nav.go('lib');
        } else {
            app.nav.go('book');
        }
    },

    // NEU: Sicherheitsabfrage vor dem Löschen eines ganzen Buches - anders
    // als beim Löschen einer einzelnen Seite gibt es hier kein Rückgängig,
    // das sollte man nicht versehentlich per Klick auslösen können.
    confirmDeleteBook(bookId) {
        const book = app.library[bookId];
        if (!book) return;
        const confirmed = confirm(`"${book.title}" endgültig löschen? Das kann NICHT rückgängig gemacht werden.`);
        if (confirmed) {
            app.dbOps.deleteBook(bookId);
        }
    },

    createBook() {
        if (!app.settings.apiKey) {
            app.ui.toast('Bitte zuerst API Key eintragen!', '🔑');
            app.nav.go('settings');
            return;
        }
        // NEU: origin: 'scan' - abfotografiert, also KEIN Video-Export
        // (siehe app.utils.resolveBookOrigin und docs/KONZEPT-Video.md 7).
        const id = 'book_' + Date.now();
        // NEU: bookType entscheidet, ob die KI die Seiten als Erzähltext
        // oder als Übungsaufgabe auswertet - muss deshalb schon beim
        // Anlegen feststehen, nicht erst beim Lesen.
        const newBook = { id, title: 'Neues Buch', author: 'Unbekannt', created: Date.now(), profileId: app.utils.resolveCreationProfileId(), bookType: app.state.newBookType, origin: 'scan', pages: [] };
        app.dbOps.saveBook(newBook);
        app.state.currentBookId = id;
        app.render.book(id);
        this.startCamera();
    },

    async createBookFromUpload(e) {
        const files = Array.from(e.target.files);
        if (files.length === 0) return;

        if (!app.settings.apiKey) {
            app.ui.toast('Bitte zuerst API Key eintragen!', '🔑');
            app.nav.go('settings');
            e.target.value = '';
            return;
        }

        const id = 'book_' + Date.now();
        // NEU: bookType entscheidet, ob die KI die Seiten als Erzähltext
        // oder als Übungsaufgabe auswertet - muss deshalb schon beim
        // Anlegen feststehen, nicht erst beim Lesen.
        const newBook = { id, title: 'Neues Buch', author: 'Unbekannt', created: Date.now(), profileId: app.utils.resolveCreationProfileId(), bookType: app.state.newBookType, origin: 'scan', pages: [] };
        app.library[id] = newBook;
        app.state.currentBookId = id;

        files.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
        app.ui.showLoader('Importiere Bilder...', `Verarbeite 0 von ${files.length}`);

        let skipped = 0;
        for (let i = 0; i < files.length; i++) {
            try {
                const img = await app.utils.loadImageElement(files[i]);
                const { full, thumb } = app.utils.createImageVariants(img, img.naturalWidth, img.naturalHeight);
                newBook.pages.push({
                    id: Date.now() + i,
                    imgUrl: full,
                    thumbUrl: thumb,
                    status: 'pending',
                    text: '', erstleserText: '', desc: '', quizQ: '', quizA: ''
                });
            } catch (err) {
                // NEU: eine einzelne beschädigte/ungültige Datei darf nicht
                // den kompletten Mehrfach-Import abbrechen - überspringen
                // und mit den restlichen Dateien weitermachen.
                console.error(`Datei "${files[i].name}" übersprungen:`, err);
                skipped++;
            }
        }

        if (skipped > 0) {
            app.ui.toast(`${skipped} Datei(en) übersprungen (ungültiges Bild)`, '⚠️');
        }

        app.dbOps.saveBook(newBook);
        app.ui.hideLoader();
        // FIX: vorher wurde nur der Inhalt der Buchansicht aktualisiert,
        // ohne tatsächlich dorthin zu wechseln - man landete unsichtbar
        // wieder in der Bibliothek. app.nav.go() wechselt die Ansicht UND
        // rendert sie.
        app.nav.go('book');
        e.target.value = '';
    },

    appendPageToBook() {
        this.startCamera();
    },

    async startCamera() {
        app.nav.go('scanner');
        try {
            app.state.mediaStream = await navigator.mediaDevices.getUserMedia({
                video: { facingMode: 'environment' }, audio: false
            });
            document.getElementById('cameraVideo').srcObject = app.state.mediaStream;
        } catch (e) {
            app.ui.toast('Kamera-Zugriff verweigert', '❌');
            app.nav.go('book');
        }
    },

    stopCamera() {
        if (app.state.mediaStream) {
            app.state.mediaStream.getTracks().forEach(t => t.stop());
            app.state.mediaStream = null;
        }
    },

    capturePhoto() {
        const video = document.getElementById('cameraVideo');
        const nativeWidth = video.videoWidth || 1280;
        const nativeHeight = video.videoHeight || 720;

        // NEU: erzeugt direkt zwei WebP-Varianten (Lesegröße + kleine
        // Vorschau) statt einer einzelnen JPEG-Version in voller Größe.
        const { full, thumb } = app.utils.createImageVariants(video, nativeWidth, nativeHeight);

        this.stopCamera();

        const book = app.library[app.state.currentBookId];
        const pageIdx = book.pages.length;
        book.pages.push({
            id: Date.now(),
            imgUrl: full,
            thumbUrl: thumb,
            status: 'pending',
            text: '', erstleserText: '', desc: '', quizQ: '', quizA: ''
        });

        app.dbOps.saveBook(book);

        // Vorher blieb der Bildschirm nach dem Foto auf der (jetzt
        // ausgeschalteten) Kamera hängen. Jetzt geht es automatisch zurück
        // zur Buchansicht - von dort kann man über "+ Seite hinzufügen"
        // die nächste Seite fotografieren.
        app.nav.go('book');

        // Läuft im Hintergrund weiter. Das .catch() fängt einen möglichen
        // Fehler ab, der sonst unbehandelt in der Konsole gelandet wäre.
        this.analyzePage(pageIdx).catch(() => {});
    },

    // NEU: gezielt eine einzelne (fehlgeschlagene) Seite neu analysieren,
    // ohne den ganzen Batch-Lauf erneut zu starten.
    retryPage(idx) {
        this.analyzePage(idx).catch(() => {});
    },

    // NEU: personaId ist jetzt optional (Standard: globale Persona) - so
    // kann man beim Lesen gezielt eine andere Persona nachladen lassen,
    // ohne den bestehenden Aufruf (Batch, Kamera, Retry) zu verändern.
    async analyzePage(pageIdx, isBatch = false, personaId = app.settings.persona) {
        const book = app.library[app.state.currentBookId];
        const page = book.pages[pageIdx];
        if (!page || page.status === 'processing') return;

        // NEU: ausgeschlossene Seiten (siehe app.actions.togglePageExcluded)
        // werden nie analysiert - spart API-Kosten für Leerseiten/Impressum
        // etc. ohne Story-Inhalt.
        if (page.excluded) {
            if (!isBatch) app.ui.toast('Diese Seite ist ausgeschlossen und wird nicht analysiert.', '🚫');
            return;
        }

        page.status = 'processing';
        if (!isBatch) {
            app.state.apiBusy = true;
            app.render.book(book.id);
        }

        try {
            const b64 = page.imgUrl.split(',')[1];
            // NEU: explizite Titelseiten-Markierung (siehe app.actions.setPageRole)
            // hat Vorrang vor der bisherigen Standard-Annahme "Seite 1 ist die
            // Titelseite" - ohne Markierung bleibt das alte Verhalten unverändert.
            const isCover = book.titlePageId
                ? page.id === book.titlePageId
                : (pageIdx === 0 && (!book.title || book.title === 'Neues Buch'));
            const forceToc = !!book.tocPageId && page.id === book.tocPageId;
            // NEU: bei einem Übungsheft wird ein anderer Prompt genutzt -
            // die KI soll die Aufgabe erklären, nicht eine Geschichte
            // vereinfachen.
            const bookType = app.utils.resolveBookType(book);
            const result = await app.api.analyze(b64, isCover, personaId, page.pdfSourceText || null, forceToc, bookType);

            // NEU: Ergebnis landet unter der jeweiligen Persona, statt die
            // alten Felder zu überschreiben - so bleiben bereits erzeugte
            // Versionen anderer Personas erhalten.
            if (!page.variants) page.variants = {};
            page.variants[personaId] = app.utils.buildPageVariant(result, page, bookType);
            page.status = 'done';

            // NEU: gefundene Nomen+Emoji-Paare in den Vokabeltrainer übernehmen
            app.actions.recordVocabulary(result.vocabulary);

            if (isCover && result.title && result.title !== 'null') {
                book.title = result.title;
                book.author = result.author && result.author !== 'null' ? result.author : 'Unbekannt';
                if (result.publisher && result.publisher !== 'null') book.publisher = result.publisher;
                if (result.series && result.series !== 'null') book.series = result.series;
            }

            // NEU: Kapitelüberschrift bzw. Inhaltsverzeichnis für die
            // Metadaten-Ansage beim automatischen Vorlesen (siehe
            // app.tts._buildMetadataAnnouncements) - persona-unabhängig,
            // deshalb direkt auf der Seite statt in page.variants.
            page.chapterTitle = (result.chapterTitle && result.chapterTitle !== 'null') ? result.chapterTitle : null;
            page.tocEntries = Array.isArray(result.tocEntries) && result.tocEntries.length > 0 ? result.tocEntries : null;
        } catch (e) {
            page.status = 'error';
            app.ui.toast(e.message, '❌');
            throw e;
        } finally {
            app.dbOps.saveBook(book);
            // NEU: je nachdem, von wo aus die Analyse angestoßen wurde
            // (Buchübersicht oder direkt aus dem Reader heraus, z.B. beim
            // Nachladen einer neuen Persona), die passende Ansicht neu
            // zeichnen.
            if (!isBatch) {
                app.state.apiBusy = false;
                if (app.state.currentView === 'reader') {
                    app.render.reader(app.state.currentPageIdx);
                } else {
                    app.render.book(book.id);
                }
            }
        }
    },

    async analyzeAllPending() {
        const book = app.library[app.state.currentBookId];
        if (!book) return;

        // FIX: vorher wurde nur der reine Seiten-Status geprüft - eine
        // Seite, die für eine ANDERE Persona schon fertig war, wurde nie
        // als "fehlt für die aktuelle Persona" erkannt.
        const targetPersona = app.state.readingPersonaId || app.settings.persona;
        const pendingIndices = [];
        book.pages.forEach((p, i) => {
            // NEU: ausgeschlossene Seiten (siehe app.actions.togglePageExcluded)
            // nie automatisch mit-analysieren.
            if (p.excluded) return;
            if (p.status === 'pending' || p.status === 'error') {
                pendingIndices.push(i);
            } else if (p.status === 'done' && !app.utils.resolvePageVariant(p, targetPersona)) {
                pendingIndices.push(i);
            }
        });
        if (pendingIndices.length === 0) return;

        app.state.cancelAnalysis = false;
        app.state.apiBusy = true;
        app.ui.showLoader('Magie wirkt...', `Analysiere 1 von ${pendingIndices.length}`);

        let count = 1;
        for (let idx of pendingIndices) {
            if (app.state.cancelAnalysis) {
                app.ui.toast('Analyse abgebrochen', '⏹️');
                break;
            }

            const sub = document.getElementById('processSub');
            if (sub) sub.innerText = `Lese Seite ${count} von ${pendingIndices.length}`;

            try {
                await this.analyzePage(idx, true, targetPersona);
            } catch (err) {
                // NEU: ein 503 ("Service Unavailable") ist eine kurzzeitige
                // Überlastung bei Google selbst, nicht euer Kontingent -
                // dafür lohnt sich ein automatischer zweiter Versuch nach
                // kurzer Pause, statt gleich den ganzen Stapel abzubrechen.
                if (String(err.message).includes('503')) {
                    if (sub) sub.innerText = 'Google-Server kurz überlastet, versuche erneut...';
                    await new Promise(r => setTimeout(r, 5000));
                    try {
                        await this.analyzePage(idx, true, targetPersona);
                    } catch (retryErr) {
                        // FIX: zeigt jetzt den tatsächlichen Fehlergrund
                        // statt einer nichtssagenden generischen Meldung.
                        app.ui.toast(`Abbruch: ${retryErr.message}`, '⚠️');
                        break;
                    }
                } else {
                    app.ui.toast(`Abbruch: ${err.message}`, '⚠️');
                    break;
                }
            }

            if (count < pendingIndices.length && !app.state.cancelAnalysis) {
                if (sub) sub.innerText = `Warte auf API (Kostenlos-Modus)...`;
                // Erhöht von 4,5s auf 6,5s: bei ca. 10 Anfragen/Minute
                // Freikontingent lag die alte Pause zu nah am Limit -
                // führte zu Abbrüchen nach ca. 10 Seiten.
                await new Promise(r => setTimeout(r, 6500));
            }
            count++;
        }

        app.state.apiBusy = false;
        app.ui.hideLoader();
        app.render.book(book.id);
    }
});
