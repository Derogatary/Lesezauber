import { app } from '../core.js';

// NEU: der Reader zeigt je nach Buchart andere Beschriftungen. Bei einem
// Übungsheft liest man keine "Geschichte vereinfacht", sondern bekommt
// eine Aufgabe erklärt - dieselben drei Tabs, andere Bedeutung.
function applyBookTypeLabels(isWorkbook) {
    const set = (id, html) => {
        const el = document.getElementById(id);
        if (el) el.innerHTML = html;
    };

    if (isWorkbook) {
        set('tabOriginal', '📋 Aufgabe');
        set('tabErstleser', '🎈 Einfach erklärt');
        set('tabQuiz', '🧩 Hilfe & Lösung');
        set('readerOriginalHeading', 'Aufgabe auf dem Blatt');
        set('readerErstleserHeading', 'Was du tun sollst');
        set('readerErstleserSub', 'Kindgerecht erklärt');
        set('chatCardHeading', '💬 Frag den Zauberer zu deiner Aufgabe');
    } else {
        set('tabOriginal', '📖 Original');
        set('tabErstleser', '🎈 Erstleser (5J)');
        set('tabQuiz', '🧙‍♂️ Frag KI');
        set('readerOriginalHeading', 'Gedruckter Text');
        set('readerErstleserHeading', 'Vereinfacht für Kinder');
        set('readerErstleserSub', 'Mit Emojis für schwierige Wörter');
        set('chatCardHeading', '💬 Frag den Zauberer zum Bild');
    }

    // Rätselfragen beim Auto-Vorlesen gibt es nur bei Geschichten.
    document.getElementById('autoQuizToggleRow')?.classList.toggle('hidden', isWorkbook);
    document.getElementById('pageQuizCard')?.classList.toggle('hidden', isWorkbook);
}

// NEU: "Kino-Modus" (siehe docs/KONZEPT-Video.md, Abschnitt 3, Stufe 1) -
// Kreuzblende beim Seitenwechsel plus Ken-Burns-Zoom im Vollbild-Vorlese-
// Modus. Zwei übereinanderliegende <img> (#focusImg/#focusImgB) wechseln
// sich als "vorne"/"hinten" ab: das neue Bild bekommt eine neu gestartete
// Zoom-Animation und wird per Opacity über das alte (unverändert stehen
// bleibende) Bild geblendet - reines CSS, keine neue Abhängigkeit. Wird nur
// bei einem tatsächlichen Seitenwechsel bzw. beim Öffnen des Kino-Modus
// aufgerufen (siehe app.render.focusMode()), nicht bei jedem Play/Pause.
function updateFocusImage(page, pageIdx) {
    const imgA = document.getElementById('focusImg');
    const imgB = document.getElementById('focusImgB');
    if (!imgA || !imgB) return;

    // FIX: respektiert sowohl die Einstellung als auch die
    // Betriebssystem-Vorgabe "reduzierte Bewegung" - dann harter Schnitt
    // ohne Zoom/Überblendung statt der CSS-Animation (siehe css/style.css).
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const effectsOn = app.settings.focusEffectsEnabled && !reduceMotion;

    if (!app.state._focusFrontImg) app.state._focusFrontImg = imgA;
    const front = app.state._focusFrontImg;
    const back = front === imgA ? imgB : imgA;

    const displayUrl = app.utils.resolveDisplayImageUrl(page);
    // Kein tatsächlicher Wechsel (z.B. erneuter Aufruf ohne Seitenwechsel) -
    // nichts zu tun, sonst würde bei jedem Aufruf unnötig neu geblendet.
    if (front.src === displayUrl) return;

    back.src = displayUrl;
    back.style.zIndex = '2';
    front.style.zIndex = '1';

    back.classList.remove('focus-kb-0', 'focus-kb-1', 'focus-kb-2', 'focus-kb-3');
    void back.offsetWidth; // Reflow erzwingen, damit die Animation neu startet
    if (effectsOn) back.classList.add(`focus-kb-${pageIdx % 4}`);

    back.style.transition = effectsOn ? 'opacity 1.1s ease-in-out' : 'none';
    back.style.opacity = '0';
    void back.offsetWidth;
    back.style.opacity = '1';

    app.state._focusFrontImg = back;
}

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

        // NEU: Buchart bestimmt Beschriftungen, Hilfe-Karte und Vorlese-Verhalten
        const isWorkbook = app.utils.resolveBookType(book) === 'workbook';
        applyBookTypeLabels(isWorkbook);

        document.getElementById('readerPageCounter').innerText = `${isWorkbook ? 'Blatt' : 'Seite'} ${pageIdx + 1} / ${book.pages.length}`;
        document.getElementById('readerImg').src = app.utils.resolveDisplayImageUrl(page);

        // NEU (Ausbaustufe 5, Panels): Sprechblasen-Umschalter nur zeigen,
        // wenn diese Seite überhaupt eine "saubere" Zweitfassung hat (siehe
        // js/studio/studioExport.js) - bei jedem anderen Buch bleibt die
        // Reader-Oberfläche unverändert.
        const bubbleRow = document.getElementById('comicBubbleToggleRow');
        if (bubbleRow) {
            bubbleRow.classList.toggle('hidden', !page.comicCleanImgUrl);
            const cb = document.getElementById('toggleComicBubbles');
            if (cb) cb.checked = !app.state.comicBubblesOff;
        }

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

            // NEU: Schritt-für-Schritt-Hilfe und Lösung (nur im Heft-Modus)
            app.render.workbookHelp(isWorkbook ? variant : null);
        } else if (page.status === 'pending' || page.status === 'error') {
            // Seite wurde noch nie analysiert - das übernimmt der
            // bestehende "Alle analysieren"-Button in der Buchansicht,
            // hier nur ein Hinweis.
            const notYet = isWorkbook ? 'Dieses Blatt wurde noch nicht ausgelesen.' : 'Diese Seite wurde noch nicht analysiert.';
            document.getElementById('readerOriginalText').innerText = notYet;
            document.getElementById('readerErstleserText').innerText = notYet;
            document.getElementById('imageDescCard')?.classList.add('hidden');
            document.getElementById('readerImageDesc').innerText = '';
            document.getElementById('readerQuizQ').innerText = '';
            document.getElementById('readerQuizA').innerText = '';
            app.render.workbookHelp(null);
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
            app.render.workbookHelp(null);
            app.actions.analyzePage(pageIdx, false, app.state.readingPersonaId).catch(() => {});
        }

        document.getElementById('chatHistory').innerHTML = '';
        // Den zuletzt gewählten Tab beibehalten statt immer auf "Original"
        // zurückzuspringen - nötig, damit der Auto-Vorlese-Modus beim
        // Seitenwechsel im gleichen Tab (z.B. Erstleser) weiterläuft.
        app.readerUI.setTab(app.state.activeTab);

        const autoBtn = document.getElementById('btnAutoRead');
        if (autoBtn) {
            autoBtn.innerHTML = app.state.autoReadActive ? '⏸ Vorlesen stoppen' : app.tts.autoReadLabel();
        }

        // NEU: Verständnisfragen-Bereich nur auf der letzten Seite zeigen -
        // und nur bei Geschichten: "Fragen zur Geschichte" passen nicht zu
        // einem Heft voller Einzelaufgaben.
        const isLastPage = pageIdx === book.pages.length - 1 && !isWorkbook;
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

        // NEU: Kontroll-Bereich (Foto des bearbeiteten Blattes). Braucht eine
        // ausgelesene Seite - ohne Aufgabe/Lösung kann die KI nichts vergleichen.
        app.render.checkWork(page, isWorkbook && !!variant);

        // NEU: Erledigt-Knopf und Belohnungs-Banner aktualisieren
        app.render.pageDone();
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

        updateFocusImage(page, app.state.currentPageIdx);

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
