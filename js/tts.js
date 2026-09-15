import { app } from './core.js';

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

    // NEU: "highlightElementId" ist optional - wird sie mitgegeben, wird
    // dort eine Wort-für-Wort-Hervorhebung angezeigt, synchron zum
    // Vorlesen (per SpeechSynthesis-"boundary"-Ereignis, von den meisten
    // Browsern unterstützt - ohne dieses Ereignis passiert einfach keine
    // Hervorhebung, der Rest funktioniert trotzdem normal weiter).
    speak(text, onEnd, highlightElementId) {
        if (!this.synth || !text) return;
        this.synth.cancel();

        let cleanText;
        if (highlightElementId) {
            const { clean, html } = app.utils.buildSpeechHighlightHtml(text);
            cleanText = clean;
            const el = document.getElementById(highlightElementId);
            if (el) el.innerHTML = html;
        } else {
            cleanText = app.utils.stripEmojiForSpeech(text);
        }

        const utter = new SpeechSynthesisUtterance(cleanText);
        // NEU: einstellbare Geschwindigkeit statt fest 0.9
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

    // Ermittelt, welches Textfeld gerade sichtbar ist (Original oder
    // Erstleser), für die Hervorhebung beim Vorlesen.
    _currentTextElementId() {
        return app.state.activeTab === 'erstleser' ? 'readerErstleserText' : 'readerOriginalText';
    },

    speakCurrentText() {
        if (app.state.autoReadActive) this.stopAutoRead();

        const book = app.library[app.state.currentBookId];
        if (!book) return;
        const page = book.pages[app.state.currentPageIdx];
        if (!page) return;

        const variant = app.utils.resolvePageVariant(page, app.state.readingPersonaId);
        if (!variant) return;

        const text = app.state.activeTab === 'erstleser' ? (variant.erstleserText || variant.text) : variant.text;
        this.speak(text, null, this._currentTextElementId());
    },

    // ================= Auto-Vorlese-Modus =================
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
        if (this.synth) this.synth.cancel();
        const btn = document.getElementById('btnAutoRead');
        if (btn) btn.innerHTML = '▶️ Buch automatisch vorlesen';
        const focusBtn = document.getElementById('focusPlayBtn');
        if (focusBtn) focusBtn.innerText = '▶️';
    },

    // Liest Seitenzahl an, dann den Text (mit Wort-Hervorhebung), dann die
    // Bildbeschreibung, optional die Rätselfrage+Antwort (kombinierter
    // Modus), bevor es zur nächsten Seite weitergeht.
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

        const text = app.state.activeTab === 'erstleser' ? (variant.erstleserText || variant.text) : variant.text;
        const pageNum = app.state.currentPageIdx + 1;

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

        // NEU: kombinierter Modus - nach der Bildbeschreibung zusätzlich
        // Rätselfrage stellen, kurze Pause zum Raten, dann Antwort vorlesen.
        const maybeAskQuiz = () => {
            if (!app.state.autoReadActive) return;
            if (app.state.autoReadWithQuiz && variant.quizQ) {
                this.speak(variant.quizQ, () => {
                    if (!app.state.autoReadActive) return;
                    setTimeout(() => {
                        if (!app.state.autoReadActive) return;
                        this.speak(variant.quizA, advanceToNext);
                    }, 4000); // Zeit zum Raten, bevor die Antwort kommt
                });
            } else {
                advanceToNext();
            }
        };

        const describeImage = () => {
            if (!app.state.autoReadActive) return;
            if (variant.desc) {
                this.speak('Ich beschreibe jetzt das Bild.', () => {
                    if (!app.state.autoReadActive) return;
                    this.speak(variant.desc, maybeAskQuiz);
                });
            } else {
                maybeAskQuiz();
            }
        };

        this.speak(`Seite ${pageNum}.`, () => {
            if (!app.state.autoReadActive) return;
            this.speak(text, describeImage, this._currentTextElementId());
        });
    }
});
