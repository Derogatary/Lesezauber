import { app } from '../core.js';

Object.assign(app.render, {
    reader(pageIdx) {
        const book = app.library[app.state.currentBookId];
        const page = book?.pages[pageIdx];
        if (!page) { app.nav.go('book'); return; }

        // merkt sich die zuletzt geöffnete Seite fürs "Weiterlesen" -
        // inkl. Zeitstempel, damit die Bibliothek das zuletzt gelesene
        // Buch über alle Bücher hinweg ermitteln kann.
        book.lastReadIdx = pageIdx;
        book.lastReadAt = Date.now();
        app.dbOps.saveBook(book);

        // NEU: Lese-Serie (Streak) für das aktuelle Profil aktualisieren
        app.utils.recordReadToday();

        document.getElementById('readerPageCounter').innerText = `Seite ${pageIdx + 1} / ${book.pages.length}`;
        document.getElementById('readerImg').src = page.imgUrl;

        // NEU: Vor/Zurück-Buttons an den Buchgrenzen deaktivieren
        const prevBtn = document.getElementById('prevPageBtn');
        const nextBtn = document.getElementById('nextPageBtn');
        if (prevBtn) prevBtn.disabled = pageIdx === 0;
        if (nextBtn) nextBtn.disabled = pageIdx === book.pages.length - 1;

        // Persona-Auswahl fürs Lesen befüllen - Haken zeigt, welche
        // Personas für DIESE Seite schon vorbereitet sind (kein erneutes
        // Warten nötig), statt erst beim Auswählen zu merken.
        const personaSelect = document.getElementById('readerPersonaSelect');
        if (personaSelect) {
            personaSelect.innerHTML = app.personas.map(p => {
                const ready = app.utils.resolvePageVariant(page, p.id) !== null;
                const marker = ready ? '✓ ' : '';
                return `<option value="${p.id}" ${p.id === app.state.readingPersonaId ? 'selected' : ''}>${marker}${app.utils.sanitize(p.label)}</option>`;
            }).join('');
        }

        const variant = app.utils.resolvePageVariant(page, app.state.readingPersonaId);

        if (variant) {
            document.getElementById('readerOriginalText').innerText = variant.text || 'Kein Text extrahiert.';
            document.getElementById('readerErstleserText').innerText = variant.erstleserText || variant.text || 'Kein Text extrahiert.';

            // FIX: bei reinen Textseiten (kein variant.desc) die ganze
            // Bildbeschreibungs-Karte ausblenden, statt eine sinnlose
            // "Keine Beschreibung verfügbar."-Meldung zu zeigen.
            const descCard = document.getElementById('imageDescCard');
            if (descCard) descCard.classList.toggle('hidden', !variant.desc);
            document.getElementById('readerImageDesc').innerText = variant.desc || '';

            document.getElementById('readerQuizQ').innerText = variant.quizQ || 'Welches Tier siehst du?';
            document.getElementById('readerQuizA').innerText = variant.quizA || 'Schau genau hin!';
        } else if (page.status === 'pending' || page.status === 'error') {
            // Seite wurde noch nie analysiert - das übernimmt der
            // bestehende "Alle analysieren"-Button in der Buchansicht,
            // hier nur ein Hinweis.
            document.getElementById('readerOriginalText').innerText = 'Diese Seite wurde noch nicht analysiert.';
            document.getElementById('readerErstleserText').innerText = 'Diese Seite wurde noch nicht analysiert.';
            document.getElementById('imageDescCard')?.classList.add('hidden');
            document.getElementById('readerImageDesc').innerText = '';
            document.getElementById('readerQuizQ').innerText = '';
            document.getElementById('readerQuizA').innerText = '';
        } else {
            // Seite ist für eine ANDERE Persona schon fertig, aber noch
            // nicht für die gerade gewählte - jetzt gezielt nachholen.
            const personaLabel = app.personas.find(p => p.id === app.state.readingPersonaId)?.label || '';
            document.getElementById('readerOriginalText').innerText = `Wird für "${personaLabel}" erstellt...`;
            document.getElementById('readerErstleserText').innerText = '...';
            document.getElementById('imageDescCard')?.classList.add('hidden');
            document.getElementById('readerImageDesc').innerText = '';
            document.getElementById('readerQuizQ').innerText = '';
            document.getElementById('readerQuizA').innerText = '';
            app.actions.analyzePage(pageIdx, false, app.state.readingPersonaId).catch(() => {});
        }

        document.getElementById('chatHistory').innerHTML = '';
        // Den zuletzt gewählten Tab beibehalten statt immer auf "Original"
        // zurückzuspringen - nötig, damit der Auto-Vorlese-Modus beim
        // Seitenwechsel im gleichen Tab (z.B. Erstleser) weiterläuft.
        app.readerUI.setTab(app.state.activeTab);

        const autoBtn = document.getElementById('btnAutoRead');
        if (autoBtn) {
            autoBtn.innerHTML = app.state.autoReadActive ? '⏸ Vorlesen stoppen' : '▶️ Buch automatisch vorlesen';
        }

        // NEU: Verständnisfragen-Bereich nur auf der letzten Seite zeigen
        const isLastPage = pageIdx === book.pages.length - 1;
        const quizSection = document.getElementById('bookQuizSection');
        if (quizSection) {
            quizSection.classList.toggle('hidden', !isLastPage);
            if (isLastPage) {
                const generateBtn = document.getElementById('bookQuizGenerateBtn');
                if (book.bookQuiz) {
                    if (generateBtn) generateBtn.classList.add('hidden');
                    app.render.bookQuiz();
                } else {
                    if (generateBtn) generateBtn.classList.remove('hidden');
                    const container = document.getElementById('bookQuizContainer');
                    if (container) container.innerHTML = '';
                }
            }
        }
    },

    // NEU: aktualisiert die Vollbild-Vorlese-Ansicht (Bild, Seitenzähler,
    // Play/Pause-Symbol, Text). Der Text wird hier nur als schlichter Text
    // gesetzt - die Wort-Hervorhebung übernimmt app.tts.speak() über das
    // gleiche "focusText"-Element, sobald vorgelesen wird (siehe
    // app.tts._currentTextElementId()).
    focusMode() {
        const book = app.library[app.state.currentBookId];
        const page = book?.pages[app.state.currentPageIdx];
        if (!page) return;

        const img = document.getElementById('focusImg');
        if (img) img.src = page.imgUrl;

        const counter = document.getElementById('focusPageCounter');
        if (counter) counter.innerText = `${app.state.currentPageIdx + 1} / ${book.pages.length}`;

        const btn = document.getElementById('focusPlayBtn');
        if (btn) btn.innerText = app.state.autoReadActive ? '⏸️' : '▶️';

        const textEl = document.getElementById('focusText');
        if (textEl) {
            const variant = app.utils.resolvePageVariant(page, app.state.readingPersonaId);
            textEl.innerText = variant?.text || (page.status === 'pending' || page.status === 'error'
                ? 'Diese Seite wurde noch nicht analysiert.'
                : 'Wird vorbereitet...');
        }
    },

    // NEU: rendert die gecachten Verständnisfragen zum gesamten Buch
    bookQuiz() {
        const book = app.library[app.state.currentBookId];
        const container = document.getElementById('bookQuizContainer');
        if (!container || !book?.bookQuiz) return;

        container.innerHTML = book.bookQuiz.questions.map((qa, i) => `
            <div class="bg-white p-3 rounded-xl border border-slate-200 space-y-2">
                <p class="text-sm font-bold text-slate-800">${i + 1}. ${app.utils.sanitize(qa.question)}</p>
                <button onclick="document.getElementById('bookQuizA${i}').classList.toggle('hidden')" class="text-xs bg-amber-100 text-amber-800 px-3 py-1.5 rounded-lg font-bold hover:bg-amber-200 transition">
                    Antwort verraten
                </button>
                <p id="bookQuizA${i}" class="text-sm text-emerald-700 font-medium bg-emerald-50 p-2 rounded-lg border border-emerald-100 hidden">${app.utils.sanitize(qa.answer)}</p>
            </div>
        `).join('');
    }
});
