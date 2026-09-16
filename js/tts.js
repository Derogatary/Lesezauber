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
    // NEU: wird bei jedem speak()/speakMitmach()-Start hochgezählt - lässt
    // eine noch laufende speakMitmach()-Häppchen-Kette (setTimeout-basierte
    // Pausen laufen NICHT über synth.cancel() mit) erkennen, dass sie
    // veraltet ist, und sich sauber selbst beenden.
    speakGeneration: 0,
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

    speak(text, onEnd, highlightElementId) {
        if (!this.synth || !text) return;
        this.speakGeneration++;
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

    // NEU: Mitmachmodus - liest (anders als das normale Vorlesen) bewusst
    // den ERSTLESER-Text vor, in dem einzelne Nomen komplett durch ein
    // Emoji ersetzt sind, und legt vor jedem Emoji eine echte Sprechpause
    // ein (nicht nur das kurze Komma aus stripEmojiForSpeech), damit das
    // Kind das Wort selbst raten/mitsprechen kann, bevor es weitergeht.
    // Das Emoji wird während der Pause optisch hervorgehoben (siehe
    // .mitmach-emoji.mitmach-active in style.css).
    speakMitmach(erstleserText, onEnd, highlightElementId) {
        if (!this.synth || !erstleserText) { if (onEnd) onEnd(); return; }
        const myGen = ++this.speakGeneration;
        this.synth.cancel();

        const parts = app.utils.splitBySpeechEmoji(erstleserText);
        const container = highlightElementId ? document.getElementById(highlightElementId) : null;

        // Kompletten Text (inkl. Emojis) sofort anzeigen, in Wort-Spans
        // pro Text-Häppchen für die laufende Hervorhebung.
        if (container) {
            container.innerHTML = parts.map((part, i) => {
                if (part.type === 'emoji') {
                    return `<span class="mitmach-emoji" data-emoji-idx="${i}">${part.value}</span>`;
                }
                let idx = 0;
                return part.value.split(/(\s+)/).map(token => {
                    const start = idx;
                    idx += token.length;
                    if (token === '' || /^\s+$/.test(token)) return token;
                    return `<span class="speech-word" data-segment="${i}" data-start="${start}">${app.utils.sanitize(token)}</span>`;
                }).join('');
            }).join('');
        }

        const rate = app.settings.speechRate || 0.9;
        const voices = this.synth.getVoices();
        const chosen = app.settings.voiceUri ? voices.find(v => v.voiceURI === app.settings.voiceUri) : null;

        const speakPart = (i) => {
            if (myGen !== this.speakGeneration) return;
            if (i >= parts.length) { if (onEnd) onEnd(); return; }
            const part = parts[i];

            if (part.type === 'emoji') {
                const emojiEl = container?.querySelector(`[data-emoji-idx="${i}"]`);
                emojiEl?.classList.add('mitmach-active');
                setTimeout(() => {
                    emojiEl?.classList.remove('mitmach-active');
                    speakPart(i + 1);
                }, 1800);
                return;
            }

            if (!part.value.trim()) { speakPart(i + 1); return; }

            const utter = new SpeechSynthesisUtterance(part.value);
            utter.rate = rate;
            if (chosen) { utter.voice = chosen; utter.lang = chosen.lang; } else { utter.lang = 'de-DE'; }

            if (container) {
                utter.onboundary = (event) => {
                    if (event.name !== 'word') return;
                    const spans = container.querySelectorAll(`.speech-word[data-segment="${i}"]`);
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

            utter.onend = () => speakPart(i + 1);
            this.synth.speak(utter);
        };

        speakPart(0);
    },

    // FIX: im Vollbild-Modus liegt der überlagernde Text im eigenen
    // "focusText"-Element (siehe viewFocus in index.html), nicht in den
    // (dahinter verdeckten) normalen Reader-Textfeldern - sonst würde die
    // Wort-Hervorhebung unsichtbar im Hintergrund laufen.
    _currentTextElementId() {
        if (app.state.focusMode) return 'focusText';
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

        // NEU: im Mitmachmodus den Erstleser-Text mit Rate-Pausen vorlesen,
        // aber nur wenn er auch existiert - sonst wie gewohnt Originaltext.
        // Wechselt auch sichtbar zum Erstleser-Tab, damit die Emoji-Pausen
        // dort zu sehen sind, wo sie inhaltlich hingehören.
        if (app.state.mitmachModus && variant.erstleserText) {
            app.readerUI.setTab('erstleser');
            this.speakMitmach(variant.erstleserText, null, this._currentTextElementId());
        } else {
            this.speak(variant.text, null, this._currentTextElementId());
        }
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
        // NEU: bricht auch eine laufende speakMitmach()-Häppchen-Kette ab -
        // deren Emoji-Pausen laufen über setTimeout, nicht über synth, und
        // würden sonst nach dem Stoppen trotzdem weiterlaufen.
        this.speakGeneration++;
        if (this.synth) this.synth.cancel();
        const btn = document.getElementById('btnAutoRead');
        if (btn) btn.innerHTML = '▶️ Buch automatisch vorlesen';
        const focusBtn = document.getElementById('focusPlayBtn');
        if (focusBtn) focusBtn.innerText = '▶️';
    },

    // FIX: keine gesprochene Seitenzahl mehr (führte zu falscher Betonung
    // wie "neunte" statt "neun", und App-Seite/Buch-Seite stimmen ohnehin
    // nicht zwingend überein - der sichtbare Seitenzähler im Header bleibt
    // unverändert). Liest den Originaltext (außer im Mitmachmodus, siehe
    // unten), dann Bildbeschreibung, optional Rätselfrage.
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
                const intro = IMAGE_INTROS[Math.floor(Math.random() * IMAGE_INTROS.length)];
                this.speak(intro, () => {
                    if (!app.state.autoReadActive) return;
                    this.speak(variant.desc, maybeAskQuiz);
                });
            } else {
                maybeAskQuiz();
            }
        };

        const startPageText = () => {
            // NEU: im Mitmachmodus den Erstleser-Text mit Rate-Pausen
            // vorlesen, aber nur wenn er auch existiert - sonst wie gewohnt
            // Originaltext. Wechselt auch sichtbar zum Erstleser-Tab, damit
            // die Emoji-Pausen dort zu sehen sind, wo sie hingehören.
            if (app.state.mitmachModus && variant.erstleserText) {
                app.readerUI.setTab('erstleser');
                this.speakMitmach(variant.erstleserText, describeImage, this._currentTextElementId());
            } else {
                this.speak(variant.text, describeImage, this._currentTextElementId());
            }
        };

        // NEU: Metadaten-Ansage (Buchtitel/Autor/Verlag/Reihe auf der ersten
        // Seite, neue Kapitelüberschrift, Inhaltsverzeichnis) VOR dem
        // eigentlichen Seitentext, mit kurzer Pause danach.
        const announcements = this._buildMetadataAnnouncements(book, page, app.state.currentPageIdx);
        if (announcements.length === 0) {
            startPageText();
        } else {
            const announceNext = (i) => {
                if (!app.state.autoReadActive) return;
                if (i >= announcements.length) { startPageText(); return; }
                this.speak(announcements[i], () => {
                    if (!app.state.autoReadActive) return;
                    setTimeout(() => announceNext(i + 1), 500);
                });
            };
            announceNext(0);
        }
    },

    // NEU: baut die Ansage-Sätze für Buch-/Kapitel-Metadaten, die die KI
    // beim Analysieren erkannt hat (siehe js/api.js Schema-Felder
    // "title"/"author"/"publisher"/"series"/"chapterTitle"/"tocEntries").
    // Nur für den automatischen Vorlesemodus gedacht - beim einzelnen
    // 🔊-Button wäre die Wiederholung bei jedem erneuten Antippen nervig.
    _buildMetadataAnnouncements(book, page, pageIdx) {
        const announcements = [];

        // Buchvorstellung nur auf der allerersten Seite, und nur, wenn
        // überhaupt ein erkannter Titel vorliegt (kein "Neues Buch" mehr).
        if (pageIdx === 0 && book.title && book.title !== 'Neues Buch') {
            let intro = `Der Titel des Buchs ist ${book.title}.`;
            if (book.author && book.author !== 'Unbekannt') intro += ` Geschrieben von ${book.author}.`;
            if (book.publisher) intro += ` Aus dem ${book.publisher}-Verlag.`;
            if (book.series) intro += ` Gehört zur ${book.series}-Reihe.`;
            announcements.push(intro);
        }

        // NEU: als Rückseite/Klappentext markierte Seite (siehe
        // app.actions.setPageRole) - nur eine kurze Einleitung, der
        // eigentliche Klappentext wird direkt danach ganz normal als
        // Seitentext vorgelesen (keine Dopplung nötig, spart Aufbau von
        // Spannung ohne separates KI-Feld).
        if (book.backCoverPageId && page.id === book.backCoverPageId) {
            announcements.push("Darum geht's:");
        }

        if (page.chapterTitle) {
            announcements.push(pageIdx === 0
                ? `Das Kapitel heißt: ${page.chapterTitle}.`
                : `Das nächste Kapitel heißt: ${page.chapterTitle}.`);
        }

        if (Array.isArray(page.tocEntries) && page.tocEntries.length > 0) {
            const parts = page.tocEntries.map((entry, i) => `das ${app.utils.germanOrdinal(i + 1)} Kapitel ist ${entry}`);
            announcements.push(parts.join(', ') + '.');
        }

        return announcements;
    }
});
