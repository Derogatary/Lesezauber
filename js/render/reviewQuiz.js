import { app } from '../core.js';

// ================= 📝 Fragerunde: Anzeige (v0.56.0-beta) =================
// Logik: js/actions/reviewQuiz.js. Fragen/Antworten sind KI-Text -> innerText
// bzw. sanitize(). Frage- und Antwort-Element dienen gleichzeitig als Ziel der
// Wort-Hervorhebung (app.tts.speak(..., 'reviewQuizQ'/'reviewQuizA')).

const KIND_LABEL = { quiz: '❓ Rätsel', word: '📚 Schwieriges Wort', book: '📖 Frage zum ganzen Buch' };

function el(id) { return document.getElementById(id); }

Object.assign(app.render, {
    reviewQuiz(rq) {
        const book = app.library[app.state.currentBookId];
        const item = rq.items[rq.idx];
        const total = rq.items.length;
        const done = rq.idx >= total;

        el('reviewQuizCounter').innerText = done ? `${total} / ${total}` : `${rq.idx + 1} / ${total}`;
        el('reviewQuizLabel').innerText = done ? '🎉 Geschafft!'
            : `${KIND_LABEL[item.kind] || ''}${item.pageIdx !== null && item.pageIdx !== undefined ? ` · Seite ${item.pageIdx + 1}` : ''}`;

        const img = el('reviewQuizImg');
        const page = item && item.pageIdx !== null && item.pageIdx !== undefined ? book?.pages[item.pageIdx] : null;
        if (page) {
            const url = app.utils.resolveDisplayImageUrl(page);
            if (img.getAttribute('src') !== url) img.src = url;
            img.classList.remove('hidden');
        } else {
            img.classList.add('hidden');
            img.removeAttribute('src');
        }

        // Frage nur neu setzen, wenn sie sich ändert - sonst würde die
        // gerade laufende Wort-Hervorhebung überschrieben
        const q = done ? 'Super, das war die ganze Fragerunde! Toll mitgemacht.' : item.q;
        const qEl = el('reviewQuizQ');
        if (qEl.dataset.text !== q) { qEl.innerText = q; qEl.dataset.text = q; }
        const aEl = el('reviewQuizA');
        const a = done ? '' : item.a;
        if (aEl.dataset.text !== a) { aEl.innerText = a; aEl.dataset.text = a; }
        aEl.classList.toggle('hidden', done || !rq.revealed);
        el('reviewQuizRevealBtn').classList.toggle('hidden', done || rq.revealed);

        el('reviewQuizPlayBtn').innerText = rq.playing ? '⏸️' : '▶️';
        el('reviewQuizPrevBtn').disabled = rq.idx === 0;
        el('reviewQuizNextBtn').disabled = done;
    }
});
