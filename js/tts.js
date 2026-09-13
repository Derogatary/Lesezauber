import { app } from './core.js';

Object.assign(app.tts, {
    synth: window.speechSynthesis,
    loadVoices() {
        if (!this.synth) return;
        // NEU: alle installierten Stimmen anzeigen (nicht nur deutsche) -
        // sortiert nach Sprache, damit z.B. "en-GB"/"en-US" leichter
        // auffindbar sind, wenn viele Stimmen installiert sind.
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

    // "onEnd" wird optional aufgerufen, sobald der Satz zu Ende vorgelesen
    // wurde - das nutzt der Auto-Vorlese-Modus, um zur nächsten Seite zu
    // springen.
    speak(text, onEnd) {
        if (!this.synth || !text) return;
        this.synth.cancel();
        const utter = new SpeechSynthesisUtterance(text);

        if (app.settings.voiceUri) {
            const voices = this.synth.getVoices();
            const chosen = voices.find(v => v.voiceURI === app.settings.voiceUri);
            if (chosen) {
                utter.voice = chosen;
                // NEU: Sprache kommt jetzt von der gewählten Stimme selbst
                // (z.B. "en-US" oder "en-GB"), statt fest "de-DE" zu
                // erzwingen - dadurch passen Text und Aussprache zusammen,
                // auch bei einer englischen oder anderssprachigen Stimme.
                utter.lang = chosen.lang;
            } else {
                utter.lang = 'de-DE';
            }
        } else {
            utter.lang = 'de-DE'; // Standard, wenn keine Stimme explizit gewählt ist
        }

        if (onEnd) utter.onend = onEnd;
        this.synth.speak(utter);
    },

    speakCurrentText() {
        // Einzel-Vorlesen soll den Auto-Modus nicht durcheinanderbringen:
        // läuft er gerade, wird er zuerst sauber gestoppt.
        if (app.state.autoReadActive) this.stopAutoRead();

        const book = app.library[app.state.currentBookId];
        if (!book) return;
        const page = book.pages[app.state.currentPageIdx];
        if (!page) return;

        const variant = app.utils.resolvePageVariant(page, app.state.readingPersonaId);
        if (!variant) return;

        const text = app.state.activeTab === 'erstleser' ? (variant.erstleserText || variant.text) : variant.text;
        this.speak(text);
    },

    // ================= Auto-Vorlese-Modus =================
    // Liest die aktuelle Seite (im gerade aktiven Tab: Original oder
    // Erstleser) vor und springt danach automatisch zur nächsten Seite,
    // bis das Buch zu Ende ist oder man selbst stoppt.

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

        this.speak(text, () => {
            // Falls in der Zwischenzeit gestoppt wurde (z.B. Nutzer hat
            // etwas anderes angeklickt), hier nicht weitermachen.
            if (!app.state.autoReadActive) return;

            const isLastPage = app.state.currentPageIdx >= book.pages.length - 1;
            if (isLastPage) {
                this.stopAutoRead();
                app.ui.toast('Buch zu Ende vorgelesen 🎉', '📖');
                return;
            }

            app.state.currentPageIdx++;
            app.render.reader(app.state.currentPageIdx);
            if (app.state.focusMode) app.render.focusMode();
            // Kurze Pause zwischen den Seiten, bevor es weitergeht.
            setTimeout(() => this._readCurrentThenAdvance(), 600);
        });
    }
});
