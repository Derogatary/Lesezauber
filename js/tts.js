import { app } from './core.js';

// NEU: Abwechslung statt immer derselben Ansage vor der Bildbeschreibung
const IMAGE_INTROS = [
    'Schau mal, was hier zu sehen ist.',
    'Auf diesem Bild passiert Folgendes.',
    'Hier siehst du:',
    'Das Bild zeigt:',
    'Guck mal genau hin:'
];

Object.assign(app.tts, {
    synth: window.speechSynthesis,
    loadVoices() {
        if (!this.synth) return;
        const voices = this.synth.getVoices()
            .slice()
            .sort((a, b) => a.lang.localeCompare(b.lang) || a.name.localeCompare(b.name));
        const select = document.getElementById('selectVoice');
        if (!select) return;
        select.innerHTML = '<option value="">Standard (Deutsch)</option>';
        voices.forEach(v => {
            const opt = document.createElement('option');
            opt.value = v.voiceURI;
            opt.textContent = `${v.name} (${v.lang})`;
            if (v.voiceURI === app.settings.voiceUri) opt.selected = true;
            select.appendChild(opt);
        });
    },

    // NEU: bereitet den Text fürs Vorlesen auf - Emojis raus (sonst
    // versucht die Stimme, sie auszusprechen) und, falls ein Textfeld
    // angegeben ist, ein <span> pro Wort für die Hervorhebung. Beide
    // Sprechwege (Gerät und KI-Stimme) nutzen danach denselben Text, damit
    // die Hervorhebung in beiden Fällen zu den Zeichenpositionen passt.
    _prepare(text, highlightElementId) {
        if (!highlightElementId) return app.utils.stripEmojiForSpeech(text);

        const { clean, html } = app.utils.buildSpeechHighlightHtml(text);
        const el = document.getElementById(highlightElementId);
        if (el) el.innerHTML = html;
        return clean;
    },

    // NEU: zentrale Weiche zwischen Gerätestimme und KI-Stimme. Alles
    // andere im Code ruft weiterhin einfach app.tts.speak(...) auf und muss
    // nicht wissen, welcher Anbieter gerade eingestellt ist.
    speak(text, onEnd, highlightElementId) {
        if (!text) return;
        this.stop();

        const clean = this._prepare(text, highlightElementId);
        if (!clean) return;

        if (app.ttsNeural.isActive()) {
            // Läuft asynchron (Netzwerk) und schaltet bei Problemen selbst
            // auf die Gerätestimme um.
            app.ttsNeural.speak(clean, onEnd, highlightElementId);
            return;
        }

        this.speakWithDevice(clean, onEnd, highlightElementId);
    },

    // NEU: stoppt beides - die Gerätestimme UND eine laufende KI-Aufnahme.
    stop() {
        if (this.synth) this.synth.cancel();
        app.ttsNeural.stop();
    },

    // Die eingebaute Stimme des Geräts. Erwartet bereits aufbereiteten
    // Text aus _prepare() (emoji-frei, Hervorhebung steht schon im DOM).
    speakWithDevice(cleanText, onEnd, highlightElementId) {
        // Sehr seltener Fall (alter/eingeschränkter Browser): Ohne
        // Sprachausgabe würde das Auto-Vorlesen sonst stumm im
        // Sekundentakt durchs ganze Buch blättern - deshalb hier abbrechen
        // statt einfach weiterzureichen.
        if (!this.synth) {
            console.error('Dieses Gerät bietet keine Sprachausgabe (SpeechSynthesis).');
            app.ui.toast('Dieses Gerät kann keinen Text vorlesen.', '⚠️');
            if (app.state.autoReadActive) this.stopAutoRead();
            return;
        }
        if (!cleanText) {
            if (onEnd) onEnd();
            return;
        }
        this.synth.cancel();

        const utter = new SpeechSynthesisUtterance(cleanText);
        utter.rate = app.settings.speechRate || 0.9;

        if (app.settings.voiceUri) {
            const voices = this.synth.getVoices();
            const chosen = voices.find(v => v.voiceURI === app.settings.voiceUri);
            if (chosen) {
                utter.voice = chosen;
                utter.lang = chosen.lang;
            } else {
                utter.lang = 'de-DE';
            }
        } else {
            utter.lang = 'de-DE';
        }

        if (highlightElementId) {
            const container = document.getElementById(highlightElementId);
            utter.onboundary = (event) => {
                if (event.name !== 'word' || !container) return;
                const spans = container.querySelectorAll('.speech-word');
                let target = null;
                spans.forEach(span => {
                    if (parseInt(span.dataset.start, 10) <= event.charIndex) target = span;
                });
                spans.forEach(span => span.classList.remove('speech-highlight'));
                if (target) {
                    target.classList.add('speech-highlight');
                    target.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
                }
            };
        }

        if (onEnd) utter.onend = onEnd;
        this.synth.speak(utter);
    },

    // NEU: feste Ansage je Seite statt Zufall. Bei einer KI-Stimme wird
    // jede gesprochene Zeile zwischengespeichert - eine zufällige Ansage
    // hätte pro Seite bis zu fünf verschiedene Aufnahmen erzeugt. Aus der
    // Seiten-ID abgeleitet bleibt die Abwechslung zwischen den Seiten
    // erhalten, dieselbe Seite klingt aber immer gleich.
    _introForPage(page) {
        const id = String((page && page.id) || '');
        let sum = 0;
        for (let i = 0; i < id.length; i++) sum += id.charCodeAt(i);
        return IMAGE_INTROS[sum % IMAGE_INTROS.length];
    },

    _currentTextElementId() {
        return app.state.activeTab === 'erstleser' ? 'readerErstleserText' : 'readerOriginalText';
    },

    // FIX: beim Vorlesen wird jetzt IMMER der Originaltext gesprochen,
    // unabhängig vom gerade angezeigten Tab. Im Erstleser-Text wurden
    // Nomen komplett durch Emojis ERSETZT (nicht ergänzt) - würde man den
    // vorlesen, fehlten hörbar Wörter im Satz. Die Hervorhebung läuft
    // trotzdem im gerade sichtbaren Textfeld mit.
    speakCurrentText() {
        if (app.state.autoReadActive) this.stopAutoRead();

        const book = app.library[app.state.currentBookId];
        if (!book) return;
        const page = book.pages[app.state.currentPageIdx];
        if (!page) return;

        const variant = app.utils.resolvePageVariant(page, app.state.readingPersonaId);
        if (!variant) return;

        this.speak(variant.text, null, this._currentTextElementId());
    },

    toggleAutoRead() {
        if (app.state.autoReadActive) {
            this.stopAutoRead();
        } else {
            this.startAutoRead();
        }
    },

    startAutoRead() {
        app.state.autoReadActive = true;
        this._readCurrentThenAdvance();
    },

    stopAutoRead() {
        app.state.autoReadActive = false;
        this.stop();
        const btn = document.getElementById('btnAutoRead');
        if (btn) btn.innerHTML = '▶️ Buch automatisch vorlesen';
        const focusBtn = document.getElementById('focusPlayBtn');
        if (focusBtn) focusBtn.innerText = '▶️';
    },

    // FIX: keine gesprochene Seitenzahl mehr (führte zu falscher Betonung
    // wie "neunte" statt "neun", und App-Seite/Buch-Seite stimmen ohnehin
    // nicht zwingend überein - der sichtbare Seitenzähler im Header bleibt
    // unverändert). Liest jetzt IMMER den Originaltext (siehe
    // speakCurrentText), dann Bildbeschreibung, optional Rätselfrage.
    _readCurrentThenAdvance() {
        if (!app.state.autoReadActive) return;

        const book = app.library[app.state.currentBookId];
        if (!book) { this.stopAutoRead(); return; }
        const page = book.pages[app.state.currentPageIdx];
        if (!page) { this.stopAutoRead(); return; }

        const variant = app.utils.resolvePageVariant(page, app.state.readingPersonaId);
        if (!variant) {
            this.stopAutoRead();
            app.ui.toast('Seite noch nicht bereit zum Vorlesen.', 'ℹ️');
            return;
        }

        const btn = document.getElementById('btnAutoRead');
        if (btn) btn.innerHTML = '⏸ Vorlesen stoppen';
        const focusBtn = document.getElementById('focusPlayBtn');
        if (focusBtn) focusBtn.innerText = '⏸️';

        // NEU: Bei einer KI-Stimme dauert das Erzeugen der Audiodatei ein
        // paar Sekunden. Während diese Seite vorgelesen wird, entsteht die
        // nächste schon im Hintergrund - so bleibt beim Umblättern keine
        // Stille. Ohne KI-Stimme passiert hier nichts.
        const nextPage = book.pages[app.state.currentPageIdx + 1];
        if (nextPage) {
            const nextVariant = app.utils.resolvePageVariant(nextPage, app.state.readingPersonaId);
            if (nextVariant && nextVariant.text) app.ttsNeural.warmUp(nextVariant.text);
        }

        const advanceToNext = () => {
            const isLastPage = app.state.currentPageIdx >= book.pages.length - 1;
            if (isLastPage) {
                this.stopAutoRead();
                app.ui.toast('Buch zu Ende vorgelesen 🎉', '📖');
                return;
            }
            app.state.currentPageIdx++;
            app.render.reader(app.state.currentPageIdx);
            if (app.state.focusMode) app.render.focusMode();
            setTimeout(() => this._readCurrentThenAdvance(), 600);
        };

        // Kombinierter Modus: Rätselfrage sichtbar UND hörbar, mit Pause
        // zum Raten, bevor die Antwort kommt.
        const maybeAskQuiz = () => {
            if (!app.state.autoReadActive) return;
            if (app.state.autoReadWithQuiz && variant.quizQ) {
                // NEU: zum Quiz-Tab wechseln, damit Frage/Antwort auch
                // sichtbar sind, nicht nur hörbar.
                app.readerUI.setTab('quiz');
                this.speak(variant.quizQ, () => {
                    if (!app.state.autoReadActive) return;
                    setTimeout(() => {
                        if (!app.state.autoReadActive) return;
                        const answerEl = document.getElementById('readerQuizA');
                        if (answerEl) answerEl.classList.remove('hidden');
                        this.speak(variant.quizA, advanceToNext);
                    }, 4000);
                });
            } else {
                advanceToNext();
            }
        };

        const describeImage = () => {
            if (!app.state.autoReadActive) return;
            if (variant.desc) {
                // FIX: Ansage und Bildbeschreibung laufen jetzt in EINEM
                // Sprechvorgang. Vorher waren es zwei - bei einer KI-Stimme
                // also zwei API-Aufrufe und zwei Aufnahmen pro Seite. Klingt
                // nebenbei natürlicher, weil die Pause dazwischen wegfällt.
                this.speak(`${this._introForPage(page)} ${variant.desc}`, maybeAskQuiz);
            } else {
                maybeAskQuiz();
            }
        };

        this.speak(variant.text, describeImage, this._currentTextElementId());
    }
});
