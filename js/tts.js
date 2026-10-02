import { app } from './core.js';

// NEU: Pause zwischen zwei Hilfeschritten im Heft-Modus. Das Kind soll
// den Schritt tatsächlich ausführen können, bevor der nächste kommt -
// ohne Pause rasselt die App die ganze Anleitung am Stück herunter.
const WORKBOOK_STEP_PAUSE_MS = 3500;

// Laufende Nummer der aktuellen Schritt-Kette. Zwischen zwei Schritten
// liegt ein setTimeout - ohne diese Nummer würde ein bereits gestoppter
// Ablauf nach der Pause einfach weitersprechen (synth.cancel() beendet
// nur das, was GERADE gesprochen wird, nicht den wartenden Timer).
let stepRunId = 0;

// NEU (Nutzer-Feedback "Pause zwischen Wort und Erklärung relativ groß"):
// vorher 600 ms (plus Ladezeit der KI-Stimme, die jetzt vorab entsteht)
const WORD_EXPLAIN_PAUSE_MS = 200;

// Bedenkzeit zwischen Rätselfrage und Antwort beim automatischen Vorlesen
const QUIZ_THINK_PAUSE_MS = 3000;

// NEU: Abwechslung statt immer derselben Ansage vor der Bildbeschreibung
// FIX (v0.51.0-beta): ohne Doppelpunkte - seit der Doppelpunkt-Sprechpause
// (app.utils.stripEmojiForSpeech) klang "Das Bild zeigt:" wie ein
// abgeschlossener Satz ("Das Bild zeigt.").
const IMAGE_INTROS = [
    'Schau mal, was hier zu sehen ist.',
    'Auf diesem Bild passiert Folgendes.',
    'Schauen wir uns das Bild an.',
    'Und jetzt zum Bild.',
    'Guck mal genau hin!'
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

    // NEU: bereitet den Text fürs Vorlesen auf - erst Trennstriche/
    // Zeilenumbrüche/Abkürzungen glätten (prepareTextForSpeech, klingt für
    // JEDE Stimme sauberer, siehe docs/ROADMAP.md), dann Emojis raus (sonst
    // versucht die Stimme, sie auszusprechen) und, falls ein Textfeld
    // angegeben ist, ein <span> pro Wort für die Hervorhebung. Die
    // Glättung muss VOR der Wort-Hervorhebung laufen, sonst würden
    // Zeilenumbrüche/Trennstriche als eigene "Wörter" hervorgehoben, obwohl
    // sie nie ausgesprochen werden. Beide Sprechwege (Gerät und KI-Stimme)
    // nutzen danach denselben Text, damit die Hervorhebung in beiden
    // Fällen zu den Zeichenpositionen passt. Die Reader-Anzeige selbst
    // bleibt unangetastet - hier wird nur die Kopie fürs Vorlesen gebaut.
    _prepare(text, highlightElementId) {
        // NEU (Audio-Tags): Sicherheitsnetz - hier läuft immer die TAG-FREIE
        // Fassung durch (die getaggte geht nur direkt in ttsNeural.speak(),
        // siehe speak() unten). Landet trotzdem versehentlich ein [Tag] im
        // normalen Text, würde es sonst buchstäblich angezeigt und vorgelesen.
        //
        // REIHENFOLGE IST WICHTIG: erst glätten, dann Tags entfernen.
        // stripSpeechTags() zieht alle Leerräume zu einfachen Leerzeichen
        // zusammen - liefe es zuerst, wäre der Zeilenumbruch in
        // "Kinder-\nwagen" schon weg und prepareTextForSpeech() könnte den
        // Trennstrich nicht mehr auflösen ("Kinder- wagen" statt
        // "Kinderwagen"). Nachgeprüft beim Zusammenführen der beiden Zweige.
        // NEU (übersetzte Bücher): prepareTextForSpeech() kennt nur deutsche
        // Abkürzungen ("z.B." -> "zum Beispiel") - bei einem fremdsprachigen
        // Buch würde es fremde Wörter verfälschen, also dort weglassen.
        const prepared = this._foreignLang()
            ? app.utils.stripSpeechTags(text)
            : app.utils.stripSpeechTags(app.utils.prepareTextForSpeech(text));
        if (!highlightElementId) return app.utils.stripEmojiForSpeech(prepared);

        const { clean, html } = app.utils.buildSpeechHighlightHtml(prepared);
        const el = document.getElementById(highlightElementId);
        if (el) el.innerHTML = html;
        return clean;
    },

    // NEU (Audio-Tags): wählt zwischen der um Sprech-Anweisungen
    // angereicherten Vorlesefassung (variant.speechText) und dem normalen
    // Text - nur wenn der gerade aktive Anbieter Tags überhaupt versteht
    // (supportsTags in js/ttsProviders.js). Die Gerätestimme und Anbieter
    // ohne Tag-Unterstützung bekommen NIE die getaggte Fassung, sonst
    // läsen sie buchstäblich "eckige Klammer lacht" vor. Ältere Seiten ohne
    // speechText liefern hier immer tagged=null - unverändertes Verhalten.
    _pickSpeechVariant(variant) {
        const plain = variant.text;
        if (!variant.speechText || variant.speechText === plain) return { plain, tagged: null };
        // NEU (übersetzte Bücher): die Fremdsprachen-Route nutzt keine
        // Audio-Tags (siehe app.ttsNeural.speakForeign()).
        if (this._foreignLang()) return { plain, tagged: null };

        const provider = app.ttsProviders.current();
        if (app.ttsNeural.isActive() && provider.supportsTags) {
            return { plain, tagged: variant.speechText };
        }
        return { plain, tagged: null };
    },

    // NEU: zentrale Weiche zwischen Gerätestimme und KI-Stimme. Alles
    // andere im Code ruft weiterhin einfach app.tts.speak(...) auf und muss
    // nicht wissen, welcher Anbieter gerade eingestellt ist.
    // NEU (Audio-Tags): optionales viertes Argument taggedText - die
    // getaggte Fassung von "text" (siehe _pickSpeechVariant), die NUR an
    // eine KI-Stimme mit supportsTags geht. Die Hervorhebung baut IMMER auf
    // dem normalen "text" auf, damit Klammer-Tags nicht als eigene Wörter
    // mitgezählt werden.
    // NEU (übersetzte Bücher, v0.39.0-beta): Sprachcode (z.B. "en-GB"), wenn
    // das gerade geöffnete Buch eine Übersetzung ist (book.language, siehe
    // js/actions/bookTranslate.js), sonst null = Deutsch wie bisher.
    _foreignLang() {
        return app.utils.bookSpeechLang(app.library[app.state.currentBookId]);
    },

    speak(text, onEnd, highlightElementId, taggedText) {
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

        // NEU (übersetzte Bücher): fremdsprachiges Buch -> eigene Sprach-Route
        // (KI-Stimme ohne deutsche Persona-Färbung, sonst Gerätestimme mit
        // passendem Sprachcode - speakForeign() entscheidet das selbst).
        const foreignLang = this._foreignLang();
        if (foreignLang) {
            app.ttsNeural.speakForeign(clean, foreignLang, onEnd, highlightElementId);
            return;
        }

        if (app.ttsNeural.isActive()) {
            // Läuft asynchron (Netzwerk) und schaltet bei Problemen selbst
            // auf die Gerätestimme um.
            const cleanTagged = taggedText ? app.utils.stripEmojiForSpeech(taggedText) : null;
            app.ttsNeural.speak(clean, onEnd, highlightElementId, cleanTagged || null);
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
    // NEU (Birkenbihl-Methode): optionales viertes Argument langOverride -
    // BCP-47-Sprachcode (z.B. "en-GB"), wenn NICHT die konfigurierte
    // deutsche Stimme gesprochen werden soll, sondern eine echte Fremd-
    // sprache (siehe app.actions.speakBirkenbihlTarget(), js/actions/
    // birkenbihl.js). Ohne Angabe unverändertes Verhalten - alle
    // bestehenden Aufrufe bleiben deutsch wie bisher. Mit Angabe wird
    // bewusst KEINE app.settings.voiceUri-Stimme genutzt (die ist für
    // Deutsch gewählt) - der Browser sucht sich selbst eine zur Sprache
    // passende Systemstimme, wenn nur utter.lang gesetzt ist.
    speakWithDevice(cleanText, onEnd, highlightElementId, langOverride) {
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

        if (langOverride) {
            // Bewusst KEIN utter.voice setzen - siehe Kommentar oben.
            utter.lang = langOverride;
        } else if (app.settings.voiceUri) {
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

        // NEU (Nutzer-Feedback "Hervorhebung nicht zeitgenau"): viele
        // Android-Stimmen (u.a. Google) melden KEINE Wortgrenzen (boundary-
        // Event) - dann blieb die Hervorhebung einfach stehen. Kommt nach
        // dem Start 0,9 s lang keine Wortgrenze, läuft sie stattdessen nach
        // geschätzter Sprechdauer mit (gleiche Schätzung wie bei den
        // KI-Stimmen, app.utils.estimateWordStartTimes). Meldet die Stimme
        // doch noch Wortgrenzen, übernehmen wieder die echten.
        let gotBoundary = false;
        let fallbackTimer = null;
        const stopFallback = () => { if (fallbackTimer) { clearInterval(fallbackTimer); fallbackTimer = null; } };
        if (highlightElementId) {
            const container = document.getElementById(highlightElementId);
            utter.onstart = () => {
                const startedAt = performance.now();
                setTimeout(() => {
                    if (gotBoundary || !container || !this.synth.speaking) return;
                    const spans = Array.from(container.querySelectorAll('.speech-word'));
                    if (!spans.length) return;
                    const charStarts = spans.map(sp => parseInt(sp.dataset.start, 10) || 0);
                    const pieces = charStarts.map((st, i) => cleanText.slice(st, i + 1 < charStarts.length ? charStarts[i + 1] : cleanText.length));
                    const times = app.utils.estimateWordStartTimes(pieces, app.utils.estimateSpeechDurationSec(cleanText, utter.rate));
                    let last = -1;
                    fallbackTimer = setInterval(() => {
                        if (gotBoundary || !this.synth.speaking) { stopFallback(); return; }
                        const t = (performance.now() - startedAt) / 1000;
                        let cur = -1;
                        for (let i = 0; i < times.length; i++) { if (times[i] <= t) cur = i; else break; }
                        if (cur !== last && cur >= 0) {
                            last = cur;
                            spans.forEach(sp => sp.classList.remove('speech-highlight'));
                            spans[cur].classList.add('speech-highlight');
                            spans[cur].scrollIntoView({ block: 'nearest', behavior: 'smooth' });
                        }
                    }, 100);
                }, 900);
            };
            utter.onboundary = (event) => {
                if (event.name !== 'word' || !container) return;
                gotBoundary = true;
                stopFallback();
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

        utter.onend = () => { stopFallback(); if (onEnd) onEnd(); };
        utter.onerror = () => stopFallback();
        this.synth.speak(utter);
    },

    // NEU (v0.52.0-beta, Klappenbücher): eine Klappe vorlesen - Einleitung,
    // Klappen-Text (über _speakPageText, also auch mit eigener Aufnahme und
    // demselben KI-Stimmen-Zwischenspeicher wie die Klappen-Seite selbst),
    // dann die Bildbeschreibung der Klappe. flap = { page, variant } aus
    // app.utils.flapsForPage(). opts.target(part) liefert die Element-ID für
    // die Hervorhebung ('text' | 'desc'), opts.isActive() bricht ab.
    speakFlap(flap, idx, onEnd, opts = {}) {
        const target = opts.target || (() => 'readerFlapText');
        const isActive = opts.isActive || (() => app.state.openFlapId === flap.page.id);
        const v = flap.variant;
        const sayDesc = () => {
            if (!isActive()) return;
            if (v.desc) this.speak(v.desc, () => { if (isActive() && onEnd) onEnd(); }, target('desc'));
            else if (onEnd) onEnd();
        };
        const sayText = () => {
            if (!isActive()) return;
            if (v.text && v.text !== 'Kein Text.') {
                const { plain, tagged } = this._pickSpeechVariant(v);
                this._speakPageText(flap.page, plain, tagged, () => setTimeout(sayDesc, 300), target('text'));
            } else {
                sayDesc();
            }
        };
        this.speak(app.utils.flapIntro(idx), () => setTimeout(sayText, 200), target('text'));
    },

    // NEU (Nutzer-Feedback): kurze Ansage, bevor schwierige Wörter erklärt
    // werden - feste Sätze (gut für den KI-Stimmen-Zwischenspeicher).
    _wordsAnnouncement(count) {
        return count === 1
            ? 'Jetzt erkläre ich dir noch ein schwieriges Wort.'
            : 'Jetzt erkläre ich dir noch ein paar schwierige Wörter.';
    },

    // NEU: "🔊 Wird vorgelesen"-Karte zeigen und die Element-ID für die
    // Wort-Hervorhebung zurückgeben. Im Vollbild-Modus wird stattdessen der
    // dortige Text (focusText) ersetzt.
    _showSpeakCaption(label) {
        if (app.state.focusMode) return 'focusText';
        const box = document.getElementById('readerSpeakCaption');
        if (!box) return null;
        document.getElementById('readerSpeakCaptionLabel').innerText = label;
        box.classList.remove('hidden');
        // die Hervorhebung im fertig gelesenen Seitentext stehen zu lassen
        // wäre irreführend
        document.querySelectorAll('#readerOriginalText .speech-highlight, #readerErstleserText .speech-highlight')
            .forEach(el => el.classList.remove('speech-highlight'));
        box.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
        return 'readerSpeakCaptionText';
    },

    hideSpeakCaption() {
        document.getElementById('readerSpeakCaption')?.classList.add('hidden');
    },

    // NEU: bei einer KI-Stimme die Aufnahmen für Wort-Ansage, Wörter,
    // Erklärungen, Bildbeschreibung, Rätsel und Zwischenruf schon erzeugen,
    // während der Seitentext läuft - nacheinander (Anbieter mit
    // Anfrage-Limit), nur was beim automatischen Vorlesen gleich ohnehin
    // gesprochen wird. Ohne KI-Stimme passiert nichts.
    async _warmUpPageSegments(page, variant, words, flaps = []) {
        if (!app.ttsNeural.isActive()) return;
        const texts = [];
        if (words.length) {
            texts.push(this._wordsAnnouncement(words.length));
            words.forEach(w => texts.push(w.word, w.explanation));
        }
        // Klappen: Einleitung, Klappen-Text (gleicher Schlüssel wie beim
        // Vorlesen der Klappen-Seite selbst) und Klappen-Bildbeschreibung
        flaps.forEach((f, i) => {
            texts.push(app.utils.flapIntro(i));
            if (f.variant.text && f.variant.text !== 'Kein Text.') texts.push(this._pickSpeechVariant(f.variant).tagged || f.variant.text);
            if (f.variant.desc) texts.push(f.variant.desc);
        });
        if (variant.desc) texts.push(this._descWithIntro(page, variant.desc));
        if (app.state.autoReadWithQuiz && variant.quizQ) texts.push(variant.quizQ, variant.quizA);
        if (variant.personaComment) texts.push(variant.personaComment);
        for (const t of texts) {
            if (!app.state.autoReadActive) return;
            await app.ttsNeural.warmUp(t);
        }
    },

    // NEU: feste Ansage je Seite statt Zufall. Bei einer KI-Stimme wird
    // jede gesprochene Zeile zwischengespeichert - eine zufällige Ansage
    // hätte pro Seite bis zu fünf verschiedene Aufnahmen erzeugt. Aus der
    // Seiten-ID abgeleitet bleibt die Abwechslung zwischen den Seiten
    // erhalten, dieselbe Seite klingt aber immer gleich.
    // FIX (Nutzer-Screenshot "Das Bild zeigt: Auf dem Bild siehst du ..."):
    // der Analyse-Prompt (js/api.js) lässt die KI die Bildbeschreibung schon
    // selbst mit "Auf dem Bild siehst du ..." beginnen - dann keine zweite
    // Ansage davor. Nur ältere Beschreibungen ohne solchen Einstieg
    // bekommen weiter eine aus IMAGE_INTROS.
    _descWithIntro(page, desc) {
        const startsWithIntro = /^\s*(auf (dem|diesem) bild|hier (siehst|sehen|sieht)|(das|dieses|im|auf dem) bild|wir sehen|man sieht|du siehst|schau|guck|zu sehen)/i.test(desc || '');
        return startsWithIntro ? desc : `${this._introForPage(page)} ${desc}`;
    },

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
        // NEU (übersetzte Bücher): die Mitmach-Pausen hängen an der deutschen
        // Gerätestimme und der Emoji-Zerlegung - bei einem fremdsprachigen Buch
        // stattdessen normal (ohne Pausen) vorlesen statt mit deutscher Stimme.
        if (this._foreignLang()) { this.speak(erstleserText, onEnd, highlightElementId); return; }
        // FIX: über die gemeinsame stop()-Weiche abbrechen, damit auch eine
        // laufende KI-Stimme verstummt. stop() zählt die Generation selbst
        // hoch - die eigene wird deshalb DANACH gemerkt.
        this.stop();
        const myGen = this.speakGeneration;

        // NEU: gleiche Glättung wie beim normalen Vorlesen (Trennstriche/
        // Zeilenumbrüche/Abkürzungen) - läuft VOR splitBySpeechEmoji(), das
        // die Emoji-Positionen erst danach aus dem Text ermittelt, betrifft
        // also nicht die Emoji-Erkennung selbst.
        const parts = app.utils.splitBySpeechEmoji(app.utils.prepareTextForSpeech(erstleserText));
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
        this.hideSpeakCaption();
        stepRunId++; // auch eine per Hand gestartete Schritt-Kette abbrechen

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
            // NEU: mit aktiver KI-Stimme läuft der Mitmachmodus jetzt über
            // Pausen-Tags statt der Gerätestimme (siehe app.ttsNeural.speakMitmach)
            // - die Funktion fällt selbst auf die Gerätestimme zurück, wenn
            // der Anbieter das nicht unterstützt.
            app.ttsNeural.speakMitmach(variant.erstleserText, null, this._currentTextElementId());
        } else {
            const { plain, tagged } = this._pickSpeechVariant(variant);
            this._speakPageText(page, plain, tagged, null, this._currentTextElementId());
        }
    },

    // NEU (v0.43.0-beta): Seitentext vorlesen - mit der eigenen Aufnahme
    // (Mama/Papa, js/actions/voiceRecord.js), falls es eine gibt, sonst wie
    // bisher über speak(). Nur der SEITENTEXT läuft hierüber; Zwischenruf,
    // Wort-Erklärungen, Bildbeschreibung und Rätsel bleiben bei speak().
    // Nie ohne Ton: jede Panne (Datei fehlt/kaputt) fällt auf speak() zurück.
    _speakPageText(page, plain, tagged, onEnd, containerId) {
        const bookId = app.state.currentBookId;
        const speaker = page && app.voice.speakerForPage?.(bookId, page.id);
        if (!speaker) { this.speak(plain, onEnd, containerId, tagged); return; }

        this.stop();
        const generation = this.speakGeneration;
        const clean = this._prepare(plain, containerId);
        const fallback = () => {
            if (generation !== this.speakGeneration) return;
            this.speak(plain, onEnd, containerId, tagged);
        };
        app.voice.getRecording(bookId, page.id, speaker).then(entry => {
            if (generation !== this.speakGeneration) return;
            if (!entry || !entry.blob) { fallback(); return; }
            app.voice.play(entry, clean, onEnd, containerId, fallback);
        }).catch(e => {
            console.error('Eigene Aufnahme nicht lesbar:', e);
            fallback();
        });
    },

    // NEU: Beschriftung des großen Vorlese-Knopfes. Bei einem Übungsheft
    // wird NICHT das ganze Heft durchgelesen, sondern die aktuelle Aufgabe
    // erklärt - der Knopf muss das auch versprechen.
    autoReadLabel() {
        const book = app.library[app.state.currentBookId];
        return (book && app.utils.resolveBookType(book) === 'workbook')
            ? '▶️ Aufgabe vorlesen & helfen'
            : '▶️ Buch automatisch vorlesen';
    },

    // NEU: nur die Hilfeschritte vorlesen (🔊-Knopf an der Hilfe-Karte),
    // ohne die Aufgabe davor noch einmal zu wiederholen.
    speakWorkbookSteps() {
        if (app.state.autoReadActive) this.stopAutoRead();

        const book = app.library[app.state.currentBookId];
        const page = book?.pages[app.state.currentPageIdx];
        if (!page) return;

        const variant = app.utils.resolvePageVariant(page, app.state.readingPersonaId);
        const steps = (variant && Array.isArray(variant.helpSteps)) ? variant.helpSteps : [];
        if (steps.length === 0) {
            app.ui.toast('Für dieses Blatt gibt es noch keine Hilfeschritte.', 'ℹ️');
            return;
        }
        this._speakSteps(steps, 0);
    },

    // Spricht die Schritte nacheinander mit Pause dazwischen. Läuft über
    // einen Index statt über eine Schleife, weil jeder Schritt erst nach
    // dem Ende des vorherigen starten darf (onEnd-Kette).
    _speakSteps(steps, index, onFinished, runId) {
        if (runId === undefined) runId = ++stepRunId; // neue Kette startet
        if (runId !== stepRunId) return;              // eine neuere Kette hat übernommen

        if (index >= steps.length) {
            if (onFinished) onFinished();
            return;
        }
        this.speak(steps[index], () => {
            if (runId !== stepRunId) return;
            setTimeout(() => this._speakSteps(steps, index + 1, onFinished, runId), WORKBOOK_STEP_PAUSE_MS);
        });
    },

    // NEU: Rückmeldung der Blatt-Kontrolle vorlesen - das Kind kann sie
    // nicht selbst lesen, deshalb ist das der eigentliche Ausgabeweg und
    // nicht nur eine Zusatzfunktion. Lob, Rückmeldung und Tipps kommen
    // nacheinander mit kurzer Pause, damit es nicht wie ein Textblock klingt.
    speakCheckResult(check) {
        if (!check) return;
        if (app.state.autoReadActive) this.stopAutoRead();
        stepRunId++; // eine laufende Schritt-Kette hat jetzt Vorrang verloren

        const parts = [check.praise, check.feedback].filter(Boolean);
        const hints = Array.isArray(check.hints) ? check.hints : [];

        const readHints = () => {
            if (hints.length > 0) this._speakSteps(hints, 0);
        };

        if (parts.length === 0) { readHints(); return; }
        this.speak(parts[0], () => {
            if (parts.length > 1) {
                this.speak(parts[1], readHints);
            } else {
                readHints();
            }
        });
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
        // NEU: auch eine wartende Übungsheft-Schritt-Kette verfällt damit
        // (ihre Pausen laufen über setTimeout, nicht über die Sprachausgabe).
        stepRunId++;
        this.stop();
        this.hideSpeakCaption();
        // NEU (v0.51.0-beta): eine beim Vorlesen geöffnete Klappe wieder zuklappen
        if (app.state.openFlapId) app.actions.showFlapImage?.(null);
        const btn = document.getElementById('btnAutoRead');
        if (btn) btn.innerHTML = this.autoReadLabel();
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
        // NEU (v0.52.0-beta): Klappen-Seiten werden innerhalb ihrer Hauptseite
        // vorgelesen (js/actions/flapBook.js), nicht noch einmal als eigene Seite
        if (app.utils.isFlapPage?.(book, page)) { advanceToNext(); return; }

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

        // NEU: Übungsheft - Aufgabe erklären und bei der Bearbeitung helfen,
        // statt wie bei einer Geschichte automatisch weiterzublättern. Das
        // Kind braucht die Zeit ja zum Malen/Zählen/Verbinden. Steht bewusst
        // VOR dem Vorwärmen: es wird keine nächste Seite vorgelesen.
        if (app.utils.resolveBookType(book) === 'workbook') {
            this._readWorkbookTask(variant);
            return;
        }

        // NEU: Bei einer KI-Stimme dauert das Erzeugen der Audiodatei ein
        // paar Sekunden. Während diese Seite vorgelesen wird, entsteht die
        // nächste schon im Hintergrund - so bleibt beim Umblättern keine
        // Stille. Ohne KI-Stimme passiert hier nichts.
        const nextPage = book.pages[app.state.currentPageIdx + 1];
        // NEU (v0.43.0-beta): Seite mit eigener Aufnahme braucht keine KI-Aufnahme
        // (sonst würde Kontingent für etwas verbraucht, das nie abgespielt wird).
        if (nextPage && !nextPage.excluded && !app.utils.isFlapPage?.(book, nextPage) && !app.voice.speakerForPage?.(book.id, nextPage.id)) {
            const nextVariant = app.utils.resolvePageVariant(nextPage, app.state.readingPersonaId);
            if (nextVariant && nextVariant.text) {
                // NEU (Audio-Tags): dieselbe Fassung vorbereiten, die beim
                // tatsächlichen Vorlesen gleich unten (startPageText) auch
                // angefordert wird - sonst landet die getaggte Fassung nicht
                // im Cache und es wird beim Umblättern trotzdem neu erzeugt.
                const { plain, tagged } = this._pickSpeechVariant(nextVariant);
                app.ttsNeural.warmUp(tagged || plain);
            }
        }

        // NEU (Nutzer-Feedback): beim Vorlesen von Wort-Erklärungen,
        // Bildbeschreibung, Rätsel und Zwischenruf stand bisher weiter der
        // (fertig vorgelesene) Seitentext da. Jetzt zeigt die Karte
        // "🔊 Wird vorgelesen" (#readerSpeakCaption) genau den Text, der
        // gerade gesprochen wird, mit Wort-Hervorhebung - im Vollbild-
        // Modus ersetzt er den Text dort (focusText).
        const caption = (label) => this._showSpeakCaption(label);

        // NEU (Nutzer-Feedback): Reihenfolge geändert - der Zwischenruf der
        // Persona leitet oft schon zur nächsten Seite über ("Wollen wir
        // weiterblättern?"), kam aber VOR der Bildbeschreibung. Jetzt:
        // Text -> schwierige Wörter -> Bildbeschreibung -> Rätsel ->
        // Zwischenruf -> umblättern.
        const sayPersonaComment = () => {
            if (!app.state.autoReadActive) return;
            if (!variant.personaComment) { this.hideSpeakCaption(); advanceToNext(); return; }
            const persona = app.personas.find(p => p.id === app.state.readingPersonaId);
            const target = caption(persona ? `${persona.icon || '💬'} ${persona.label.split('(')[0].trim()}` : '💬 Zwischenruf');
            this.speak(variant.personaComment, () => { this.hideSpeakCaption(); advanceToNext(); }, target);
        };

        // Kombinierter Modus: Rätselfrage sichtbar UND hörbar, mit Pause
        // zum Raten, bevor die Antwort kommt.
        const maybeAskQuiz = () => {
            if (!app.state.autoReadActive) return;
            if (app.state.autoReadWithQuiz && variant.quizQ) {
                // FIX: kein Tab-Wechsel mehr - Frage und Antwort stehen in
                // der "Wird vorgelesen"-Karte (die Antwort zusätzlich wie
                // bisher aufgedeckt im Quiz-Tab).
                this.speak(variant.quizQ, () => {
                    if (!app.state.autoReadActive) return;
                    setTimeout(() => {
                        if (!app.state.autoReadActive) return;
                        const answerEl = document.getElementById('readerQuizA');
                        if (answerEl) answerEl.classList.remove('hidden');
                        this.speak(variant.quizA, sayPersonaComment, caption('✅ Antwort'));
                    // FIX (Nutzer-Feedback "Wartezeit nach der Rätselfrage ein
                    // Tick zu lang"): 4 s -> 3 s Bedenkzeit
                    }, QUIZ_THINK_PAUSE_MS);
                }, caption('❓ Rätselfrage'));
            } else {
                sayPersonaComment();
            }
        };

        // Reihenfolge (v0.52.0-beta für Klappen, seit v0.54.0-beta auf
        // Nutzerentscheid für ALLE Seiten):
        //   Text -> Bildbeschreibung -> [Klappen: Text + Bildbeschreibung] ->
        //   schwierige Wörter (Seite + Klappen) -> Rätsel -> Zwischenruf.
        const flaps = app.utils.flapsForPage(book, page, app.state.readingPersonaId);
        const hasFlaps = flaps.length > 0;

        const describeImage = () => {
            if (!app.state.autoReadActive) return;
            const next = hasFlaps ? readFlaps : explainDifficultWords;
            if (variant.desc) {
                // FIX: Ansage und Bildbeschreibung laufen jetzt in EINEM
                // Sprechvorgang. Vorher waren es zwei - bei einer KI-Stimme
                // also zwei API-Aufrufe und zwei Aufnahmen pro Seite. Klingt
                // nebenbei natürlicher, weil die Pause dazwischen wegfällt.
                this.speak(this._descWithIntro(page, variant.desc), next, caption('🖼️ Bildbeschreibung'));
            } else {
                next();
            }
        };

        // Jede Klappe: Bild wechselt zum Klappen-Foto, "Heb mal die Klappe
        // hoch!", Klappen-Text, Klappen-Bildbeschreibung; danach zuklappen.
        const readFlaps = () => {
            if (!app.state.autoReadActive) return;
            const next = (i) => {
                if (!app.state.autoReadActive) return;
                if (i >= flaps.length) { app.actions.showFlapImage(null); explainDifficultWords(); return; }
                app.actions.showFlapImage(flaps[i].page);
                const label = flaps.length > 1 ? `🪟 Klappe ${i + 1}` : '🪟 Klappe';
                this.speakFlap(flaps[i], i, () => setTimeout(() => next(i + 1), 500), {
                    target: (part) => caption(part === 'desc' ? `${label} · Bild` : label),
                    isActive: () => app.state.autoReadActive
                });
            };
            next(0);
        };

        // NEU (Nutzerwunsch: "schwierige Wörter sollten nach dem Textteil
        // leicht erklärt werden"): Wort und Erklärung als ZWEI getrennte
        // Sprechvorgänge mit kurzer Pause dazwischen. Läuft leer durch, wenn
        // die Seite keine schwierigen Wörter hat.
        // NEU (Nutzer-Feedback): vorher eine kurze Ansage ("Jetzt erkläre
        // ich dir ...") statt kommentarlos weiterzusprechen, und die Pause
        // zwischen Wort und Erklärung von 600 auf 200 ms verkürzt (dazu
        // werden die Aufnahmen bei einer KI-Stimme vorab erzeugt, siehe
        // _warmUpPageSegments - vorher kam die Ladezeit noch obendrauf).
        // Bei Klappen: Wörter von Seite UND Klappen zusammen, ohne Doppelte.
        const words = app.utils.mergeDifficultWords([
            Array.isArray(variant.difficultWords) ? variant.difficultWords : [],
            ...flaps.map(f => Array.isArray(f.variant.difficultWords) ? f.variant.difficultWords : [])
        ]);
        const explainDifficultWords = () => {
            if (!app.state.autoReadActive) return;
            const afterWords = maybeAskQuiz;
            if (words.length === 0) { afterWords(); return; }
            const speakNext = (i) => {
                if (!app.state.autoReadActive) return;
                if (i >= words.length) { afterWords(); return; }
                const w = words[i];
                const target = caption(`📚 ${w.word}`);
                this.speak(w.word, () => {
                    if (!app.state.autoReadActive) return;
                    setTimeout(() => {
                        if (!app.state.autoReadActive) return;
                        this.speak(w.explanation, () => speakNext(i + 1), target);
                    }, WORD_EXPLAIN_PAUSE_MS);
                }, target);
            };
            this.speak(this._wordsAnnouncement(words.length), () => {
                if (!app.state.autoReadActive) return;
                setTimeout(() => speakNext(0), 300);
            }, caption('📚 Schwierige Wörter'));
        };
        // was direkt nach dem Seitentext kommt
        // FIX (v0.54.0-beta, Nutzerentscheid): für ALLE Seiten Bild vor den Wörtern
        const afterPageText = describeImage;

        // Bei einer KI-Stimme: die übrigen Teile dieser Seite schon erzeugen,
        // während der Seitentext läuft (wird ohnehin gleich vorgelesen).
        // Kurz verzögert, damit die Aufnahme des Seitentexts selbst Vorrang
        // hat (Anbieter mit Anfrage-Limit reihen die Aufrufe hintereinander).
        const warmPageIdx = app.state.currentPageIdx;
        setTimeout(() => {
            if (app.state.autoReadActive && app.state.currentPageIdx === warmPageIdx) this._warmUpPageSegments(page, variant, words, flaps);
        }, 1500);

        const startPageText = () => {
            // NEU (Nutzerwunsch): eine reine Bildseite ohne eigenen Text
            // (originalText war leer, buildPageVariant() setzt dafür den
            // Platzhalter "Kein Text.") soll beim automatischen Vorlesen
            // nicht wörtlich "Kein Text." ansagen - direkt weiter springen
            // (schwierige Wörter/Bildbeschreibung, falls vorhanden), statt
            // die Seite mit einer verwirrenden Ansage zu eröffnen.
            if (variant.text === 'Kein Text.' && variant.desc) {
                afterPageText();
                return;
            }
            // NEU: im Mitmachmodus den Erstleser-Text mit Rate-Pausen
            // vorlesen, aber nur wenn er auch existiert - sonst wie gewohnt
            // Originaltext. Wechselt auch sichtbar zum Erstleser-Tab, damit
            // die Emoji-Pausen dort zu sehen sind, wo sie hingehören.
            if (app.state.mitmachModus && variant.erstleserText) {
                app.readerUI.setTab('erstleser');
                // NEU: siehe speakCurrentText() oben - Pausen-Tags statt
                // Gerätestimme, sofern der Anbieter das unterstützt.
                app.ttsNeural.speakMitmach(variant.erstleserText, afterPageText, this._currentTextElementId());
            } else {
                const { plain, tagged } = this._pickSpeechVariant(variant);
                // NEU (v0.43.0-beta): eigene Aufnahme hat Vorrang (siehe _speakPageText)
                this._speakPageText(page, plain, tagged, afterPageText, this._currentTextElementId());
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

    // NEU: der eine Satz "Der Titel des Buchs ist ... geschrieben von ...".
    // Ausgelagert aus _buildMetadataAnnouncements() (siehe unten), weil der
    // Video-Export (js/actions/videoTimeline.js, js/actions/videoExport.js)
    // ihn für die Titelkarten-Ansage GENAUSO braucht, aber unabhängig von
    // einer konkreten Seite/pageIdx - eine zweite Fassung dieser Sätze an
    // zweiter Stelle wäre genau die Art Dopplung, die laut CLAUDE.md
    // vermieden werden soll. Liefert null, wenn kein erkannter Titel vorliegt.
    _buildBookIntro(book) {
        if (!book || !book.title || book.title === 'Neues Buch') return null;
        let intro = `Der Titel des Buchs ist ${book.title}.`;
        if (book.author && book.author !== 'Unbekannt') intro += ` Geschrieben von ${book.author}.`;
        if (book.publisher) intro += ` Aus dem ${book.publisher}-Verlag.`;
        if (book.series) intro += ` Gehört zur ${book.series}-Reihe.`;
        return intro;
    },

    // NEU: baut die Ansage-Sätze für Buch-/Kapitel-Metadaten, die die KI
    // beim Analysieren erkannt hat (siehe js/api.js Schema-Felder
    // "title"/"author"/"publisher"/"series"/"chapterTitle"/"tocEntries").
    // Nur für den automatischen Vorlesemodus gedacht - beim einzelnen
    // 🔊-Button wäre die Wiederholung bei jedem erneuten Antippen nervig.
    _buildMetadataAnnouncements(book, page, pageIdx) {
        const announcements = [];
        // NEU (übersetzte Bücher): die Ansage-Sätze sind deutsch formuliert -
        // in einem fremdsprachigen Buch mit fremder Stimme vorgelesen klänge
        // das falsch. Titel/Kapitel stehen ohnehin sichtbar auf der Seite.
        if (app.utils.bookSpeechLang(book)) return announcements;

        // Buchvorstellung nur auf der allerersten Seite, und nur, wenn
        // überhaupt ein erkannter Titel vorliegt (kein "Neues Buch" mehr).
        if (pageIdx === 0) {
            const intro = this._buildBookIntro(book);
            if (intro) announcements.push(intro);
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
    },

    // NEU: Ablauf im Heft-Modus - gedruckte Aufgabe, dann die kindgerechte
    // Erklärung (nur falls sie sich wirklich unterscheidet), dann die
    // Hilfeschritte mit Pausen. Danach ist Schluss: kein automatisches
    // Weiterblättern.
    _readWorkbookTask(variant) {
        const steps = Array.isArray(variant.helpSteps) ? variant.helpSteps : [];

        const finish = () => {
            if (!app.state.autoReadActive) return;
            this.stopAutoRead();
            app.ui.toast('Jetzt bist du dran!', '🖍️');
        };

        const readSteps = () => {
            if (!app.state.autoReadActive) return;
            if (steps.length === 0) { finish(); return; }
            this.speak('Und so geht es Schritt für Schritt:', () => {
                if (!app.state.autoReadActive) return;
                this._speakSteps(steps, 0, finish);
            });
        };

        const readExplanation = () => {
            if (!app.state.autoReadActive) return;
            const explained = variant.erstleserText;
            if (explained && explained !== variant.text) {
                this.speak(explained, readSteps);
            } else {
                readSteps();
            }
        };

        this.speak(variant.text, readExplanation, this._currentTextElementId());
    }
});
