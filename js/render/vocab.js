import { app } from '../core.js';

Object.assign(app.render, {
    vocabTrainer() {
        const words = Object.values(app.vocabulary);
        const emptyState = document.getElementById('vocabEmptyState');
        const cardArea = document.getElementById('vocabCardArea');
        if (!emptyState || !cardArea) return;

        if (words.length === 0) {
            emptyState.classList.remove('hidden');
            cardArea.classList.add('hidden');
            return;
        }

        emptyState.classList.add('hidden');
        cardArea.classList.remove('hidden');

        // Deck bei jedem Öffnen neu mischen
        app.state.vocabDeck = words.slice().sort(() => Math.random() - 0.5);
        app.state.vocabIndex = 0;
        this.vocabCard();
    },

    vocabCard() {
        const deck = app.state.vocabDeck;
        if (!deck || deck.length === 0) return;
        const card = deck[app.state.vocabIndex];

        document.getElementById('vocabCounter').innerText = `Karte ${app.state.vocabIndex + 1} von ${deck.length}`;
        document.getElementById('vocabEmoji').innerText = card.emoji;

        const wordEl = document.getElementById('vocabWord');
        wordEl.innerText = card.displayWord;
        wordEl.classList.add('hidden');
        document.getElementById('vocabHint').classList.remove('hidden');
    }
});
