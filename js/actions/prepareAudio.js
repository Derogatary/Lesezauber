import { app } from '../core.js';

// ================= "Buch hörfertig machen" =================
// NEU: Bereitet den Stimmen-Zwischenspeicher (ttsCache) für alle Seiten des
// aktuell geöffneten Buchs vor, damit später ohne Wartezeit und auch offline
// vorgelesen werden kann. Nur mit einer KI-Stimme sinnvoll - die Gerätestimme
// erzeugt keine Datei, die sich zwischenspeichern ließe (siehe
// app.ttsNeural.isActive), deshalb ist der Knopf dann ausgeblendet.

Object.assign(app.actions, {
    async prepareBookAudio() {
        const book = app.library[app.state.currentBookId];
        if (!book) return;

        if (!app.ttsNeural.isActive()) {
            app.ui.toast('Dafür muss in den Einstellungen eine KI-Stimme gewählt sein.', 'ℹ️');
            return;
        }
        if (app.state.apiBusy) {
            app.ui.toast('Bitte warten, es läuft gerade schon etwas anderes.', '⏳');
            return;
        }

        // NEU: exakt die Persona, mit der im Reader gerade vorgelesen würde
        // (siehe app.tts._readCurrentThenAdvance) - eine andere Persona
        // klänge beim tatsächlichen Vorlesen ohnehin anders und würde den
        // Zwischenspeicher nur mit ungenutztem Text füllen.
        const personaId = app.state.readingPersonaId || app.settings.persona;
        const pages = book.pages.filter(p => !p.excluded);
        if (pages.length === 0) {
            app.ui.toast('Keine Seiten zum Vorbereiten vorhanden.', 'ℹ️');
            return;
        }

        // Wiederverwendet dieselbe Abbrechen-Weiche wie die Batch-Analyse
        // (siehe app.actions.analyzeAllPending) - Knopf im Loader-Overlay
        // ruft ohnehin schon app.actions.cancelAnalysis() auf.
        app.state.cancelAnalysis = false;
        app.state.apiBusy = true;
        app.ui.showLoader('Buch wird hörfertig gemacht...', `Seite 1 von ${pages.length}`);

        let prepared = 0;
        let failed = 0;
        let skipped = 0;

        for (let i = 0; i < pages.length; i++) {
            if (app.state.cancelAnalysis) {
                app.ui.toast('Vorbereiten abgebrochen', '⏹️');
                break;
            }

            const sub = document.getElementById('processSub');
            if (sub) sub.innerText = `Seite ${i + 1} von ${pages.length}`;

            const page = pages[i];
            const variant = app.utils.resolvePageVariant(page, personaId);
            if (!variant || !variant.text) {
                skipped++; // noch nicht (für diese Persona) analysiert
                continue;
            }

            try {
                // Legt bereits gecachten Text NICHT erneut an - _getAudio in
                // ttsNeural.js prüft den Zwischenspeicher zuerst (siehe
                // CLAUDE.md "Jede Aufnahme kostet Geld/Kontingent").
                //
                // FIX (Zusammenführung mit den Audio-Tags): hier stand fest
                // variant.text. Der Cache-Schlüssel hängt aber am Text, und
                // beim Vorlesen geht bei einem Anbieter mit supportsTags die
                // GETAGGTE Fassung an die Synthese. Vorbereitet wurde also die
                // eine Fassung, gebraucht die andere - das Buch war trotz
                // "hörfertig" nicht fertig und jede Seite kostete doppelt.
                // Dieselbe Weiche wie in app.tts.speak() benutzen.
                const { plain, tagged } = app.tts._pickSpeechVariant(variant);
                await app.ttsNeural.renderAudio(tagged || plain, { personaId });
                prepared++;
            } catch (e) {
                console.error(`Vorbereiten von Seite ${i + 1} fehlgeschlagen:`, e);
                app.ui.toast(`Seite ${i + 1}: ${e.message || 'Fehler beim Vorbereiten'}`, '⚠️');
                failed++;
            }
        }

        app.state.apiBusy = false;
        app.ui.hideLoader();

        if (!app.state.cancelAnalysis) {
            const skippedInfo = skipped > 0 ? `, ${skipped} noch nicht ausgelesen` : '';
            app.ui.toast(
                failed > 0
                    ? `${prepared} von ${pages.length} Seite(n) bereit, ${failed} fehlgeschlagen${skippedInfo}`
                    : `Buch ist jetzt hörfertig (${prepared} Seite(n)${skippedInfo})`,
                failed > 0 ? '⚠️' : '🎧'
            );
        }
    }
});
