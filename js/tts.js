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
        // FIX: hier wurde einfach abgebrochen. Beim automatischen Vorlesen
        // hängen aber mehrere speak()-Aufrufe als Kette aneinander (Text ->
        // Bildbeschreibung -> Rätselfrage -> nächste Seite). Fehlte ein
        // Baustein (z.B. eine Seite ohne Antworttext), wurde onEnd nie
        // aufgerufen und das Vorlesen blieb ohne Meldung stehen - der Knopf
        // zeigte weiter "stoppen", es passierte aber nichts mehr.
        if (!text) { if (onEnd) onEnd(); return; }
        this.stop();

        const clean = this._prepare(text, highlightElementId);
        // Gleicher Fall: Text bestand nur aus Emojis -> trotzdem weiterreichen.
        if (!clean) { if (onEnd) onEnd(); return; }

        if (app.ttsNeural.isActive()) {
            // Läuft asynchron (Netzwerk) und schaltet bei Problemen selbst
            // auf die Gerätestimme um.
            app.ttsNeural.speak(clean, onEnd, highlightElementId);
            return;
        }

        this.speakWithDevice(clean, onEnd, highlightElementId);
    },

    // NEU: stoppt beides - die Gerätestimme UND eine laufende KI-Aufnahme.
    // FIX: zählt zusätzlich die Generation hoch. Eine laufende
    // speakMitmach()-Häppchen-Kette hängt an setTimeout-Pausen, die von
    // synth.cancel() NICHT erfasst werden - ohne diesen Zähler liefe sie
    // nach dem Stoppen munter weiter.
    stop() {
        this.speakGeneration++;
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

    // NEU: Mitmachmodus - liest (anders als das normale Vorlesen) bewusst
    // den ERSTLESER-Text vor, in dem einzelne Nomen komplett durch ein
    // Emoji ersetzt sind, und legt vor jedem Emoji eine echte Sprechpause
    // ein (nicht nur das kurze Komma aus stripEmojiForSpeech), damit das
    // Kind das Wort selbst raten/mitsprechen kann, bevor es weitergeht.
    // Das Emoji wird während der Pause optisch hervorgehoben (siehe
    // .mitmach-emoji.mitmach-active in style.css).
    speakMitmach(erstleserText, onEnd, highlightElementId) {
        if (!this.synth || !erstleserText) { if (onEnd) onEnd(); return; }
        // FIX: über die gemeinsame stop()-Weiche abbrechen, damit auch eine
        // laufende KI-Stimme verstummt. stop() zählt die Generation selbst
        // hoch - die eigene wird deshalb DANACH gemerkt.
        this.stop();
        const myGen = this.speakGeneration;

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
        this.stop();
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

        // NEU: ausgeschlossene Seiten (siehe app.actions.togglePageExcluded,
        // z.B. Leerseiten/Impressum) werden übersprungen statt mit einer
        // Fehlermeldung abzubrechen.
        if (page.excluded) { advanceToNext(); return; }

        // NEU: die "Über den Autor"-Seite lässt sich vom Vorlesen ausnehmen
        // (siehe app.actions.toggleReadAuthorBioAloud), OHNE sie von der
        // Analyse auszuschließen - manuelles Ansehen bleibt möglich.
        if (book.authorBioPageId && page.id === book.authorBioPageId && book.readAuthorBioAloud === false) {
            advanceToNext();
            return;
        }

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
        if (nextPage && !nextPage.excluded) {
            const nextVariant = app.utils.resolvePageVariant(nextPage, app.state.readingPersonaId);
            if (nextVariant && nextVariant.text) app.ttsNeural.warmUp(nextVariant.text);
        }

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

        // NEU: als "Über den Autor"-Seite markiert (siehe app.actions.setPageRole)
        // - genau wie bei der Rückseite nur eine kurze Einleitung, der Text
        // selbst wird danach ganz normal als Seitentext vorgelesen. Wird
        // hier schon nicht erreicht, wenn app.actions.toggleReadAuthorBioAloud
        // auf "nicht vorlesen" steht (siehe _readCurrentThenAdvance).
        if (book.authorBioPageId && page.id === book.authorBioPageId) {
            announcements.push('Über den Autor:');
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
