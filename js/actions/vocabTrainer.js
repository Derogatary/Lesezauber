import { app } from '../core.js';

Object.assign(app.actions, {
    // NEU: sammelt die von Gemini gelieferten Nomen+Emoji-Paare in der
    // Vokabel-Datenbank. Wird nach jeder erfolgreichen Seiten-Analyse
    // aufgerufen (egal ob per Batch, Kamera oder Hintergrund-Vorbereitung).
    recordVocabulary(vocabList) {
        if (!Array.isArray(vocabList)) return;

        vocabList.forEach(item => {
            if (!item || !item.word || !item.emoji) return;
            const key = String(item.word).trim().toLowerCase();
            if (!key) return;

            const existing = app.vocabulary[key];
            const entry = {
                word: key,
                displayWord: String(item.word).trim(),
                emoji: item.emoji,
                // FIX: bei einem Alt-Eintrag ohne count wurde hier
                // "undefined + 1" = NaN gespeichert - der Zähler war danach
                // dauerhaft kaputt und ließ sich auch nicht mehr erholen.
                count: (existing?.count || 0) + 1
            };
            app.dbOps.saveVocabEntry(entry);
        });
    },

    // Deckt die aktuell gezeigte Karte auf (Wort erscheint unter dem Emoji)
    revealVocabCard() {
        const wordEl = document.getElementById('vocabWord');
        const hintEl = document.getElementById('vocabHint');
        if (wordEl) wordEl.classList.remove('hidden');
        if (hintEl) hintEl.classList.add('hidden');
    },

    nextVocabCard() {
        if (!app.state.vocabDeck || app.state.vocabDeck.length === 0) return;
        app.state.vocabIndex = (app.state.vocabIndex + 1) % app.state.vocabDeck.length;
        app.render.vocabCard();
    }
});
