import { app } from '../core.js';

// ================= Birkenbihl-Methode (Interlinear-Übersetzung) =================
// NEU: eigener, in sich geschlossener Reader-Tab (siehe docs/TODO-GESAMT.md,
// Bereich "Mehrsprachigkeit") - zerlegt den aktuellen Seitentext in eine
// Zielsprache (oben) und eine wörtliche deutsche Übersetzung in
// Zielsprachen-Wortstellung (darunter), damit ein Kind eine Fremdsprache
// "dekodierend" mitliest statt über Grammatikregeln zu lernen. Wird wie das
// Buch-Quiz PRO SEITE gecacht (page.birkenbihl), damit nicht bei jedem
// erneuten Öffnen des Tabs wieder die KI bemüht wird - nur bei explizitem
// "Neu erzeugen" oder wenn seither eine andere Zielsprache gewählt wurde.
Object.assign(app.actions, {
    async generateBirkenbihlDecoding(forceRegenerate = false) {
        const book = app.library[app.state.currentBookId];
        const page = book?.pages[app.state.currentPageIdx];
        if (!book || !page) return;

        // NEU (übersetzte Bücher): ein schon übersetztes Buch nicht noch einmal
        // aus dem Deutschen zerlegen lassen.
        if (book.language) {
            app.ui.toast('Dieses Buch ist schon eine Übersetzung - Birkenbihl gibt es im deutschen Original.', 'ℹ️');
            return;
        }

        const langId = app.settings.birkenbihlLanguage;
        if (page.birkenbihl && page.birkenbihl.lang === langId && !forceRegenerate) {
            app.render.birkenbihlTab(page);
            return;
        }

        const personaId = app.state.readingPersonaId || app.settings.persona;
        const variant = app.utils.resolveAnyVariant(page, personaId);
        if (!variant || !variant.text) {
            app.ui.toast('Diese Seite hat noch keinen Text - erst analysieren.', 'ℹ️');
            return;
        }

        app.ui.showLoader('Übersetze Wort für Wort...', 'Einen Moment bitte');
        app.state.apiBusy = true;
        try {
            const { pairs } = await app.api.generateBirkenbihlDecoding(variant.text, langId);
            if (pairs.length === 0) throw new Error('Keine Übersetzung erhalten');
            page.birkenbihl = { lang: langId, pairs, generatedAt: Date.now() };
            app.dbOps.saveBook(book);
            app.render.birkenbihlTab(page);
        } catch (e) {
            console.error('Birkenbihl-Zerlegung fehlgeschlagen:', e);
            // FIX (Bugreport "Übersetzung schlägt fehl"): bisher stand hier
            // IMMER derselbe pauschale Satz, egal was wirklich schiefging -
            // auf dem Handy sieht man aber keine Konsole. Jetzt der
            // tatsächliche Grund im Toast (z.B. "Gemini-Fehler 429" bei
            // Tageslimit, oder der Hinweis auf eine abgeschnittene Antwort),
            // damit sich ein erneuter Versuch gezielt einschätzen lässt.
            const msg = e.message === 'API_KEY_MISSING'
                ? 'Bitte zuerst einen Gemini-API-Key in den Einstellungen eintragen.'
                : `Übersetzung fehlgeschlagen: ${e.message}. Bitte nochmal versuchen.`;
            app.ui.toast(msg, '❌');
        } finally {
            app.state.apiBusy = false;
            app.ui.hideLoader();
        }
    },

    // Liest den erzeugten Zielsprachen-Text laut vor. Bewusst NICHT über
    // app.tts.speak() - das würde deutsch aufbereiten und die deutsche
    // Persona-Stimmfärbung benutzen.
    // NEU (KI-Stimme für die Birkenbihl-Zielsprache): mit eingestellter
    // KI-Stimme liest jetzt diese vor (app.ttsNeural.speakForeign() -
    // eigene Route ohne Persona, Sprache als Teil des Cache-Schlüssels,
    // also nur beim ersten Antippen pro Seite ein Synthese-Aufruf). Mit
    // Gerätestimme, oder wenn der Anbieter die Sprache nicht kann (z.B.
    // Speechify bei Türkisch), bleibt es beim bisherigen Weg: Gerätestimme
    // mit passendem Sprachcode.
    speakBirkenbihlTarget() {
        const book = app.library[app.state.currentBookId];
        const page = book?.pages[app.state.currentPageIdx];
        if (!page?.birkenbihl?.pairs?.length) return;

        const langInfo = app.birkenbihlLanguages.find(l => l.id === page.birkenbihl.lang) || app.birkenbihlLanguages[0];
        const text = page.birkenbihl.pairs.map(p => p.target).join(' ');
        // Laufendes Vorlesen (deutsch, Gerät oder KI) vorher beenden, sonst
        // sprechen beide gleichzeitig.
        app.tts.stop();
        app.ttsNeural.speakForeign(text, langInfo.speechLang);
    }
});
