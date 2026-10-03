// NEU (v0.56.0-beta): Gemini-Kontingent, Klappentext-Reihenfolge, Fragerunde
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { app } from './helpers.mjs';

test('Kontingent: 429 als Tages- oder Minutenlimit erkennen', () => {
    const c = app.geminiQuota.classify429;
    const day = { error: { details: [
        { '@type': 'type.googleapis.com/google.rpc.QuotaFailure', violations: [{ quotaId: 'GenerateRequestsPerDayPerProjectPerModel-FreeTier' }] },
        { '@type': 'type.googleapis.com/google.rpc.RetryInfo', retryDelay: '37s' }
    ] } };
    assert.equal(c(day).kind, 'day');
    const minute = { error: { details: [
        { violations: [{ quotaId: 'GenerateRequestsPerMinutePerProjectPerModel-FreeTier' }] },
        { retryDelay: '12.5s' }
    ] } };
    assert.deepEqual(c(minute), { kind: 'minute', retryMs: 12500 });
    assert.deepEqual(c(null), { kind: 'minute', retryMs: null });
});

test('Kontingent: Zurücksetzen um Mitternacht Pazifik-Zeit', () => {
    // 3. Okt. 2026, 12:00 UTC = 05:00 PDT -> nächste Mitternacht PDT = 4. Okt. 07:00 UTC
    const now = Date.UTC(2026, 9, 3, 12, 0, 0);
    assert.equal(app.geminiQuota.nextMidnight(now), Date.UTC(2026, 9, 4, 7, 0, 0));
    // Winter (PST, UTC-8): 10. Jan. 2027 20:00 UTC -> 11. Jan. 08:00 UTC
    assert.equal(app.geminiQuota.nextMidnight(Date.UTC(2027, 0, 10, 20, 0, 0)), Date.UTC(2027, 0, 11, 8, 0, 0));
    // Zeitumstellung am 1. Nov. 2026 (Tag mit 25 Stunden):
    // 31. Okt. 22:00 PDT -> 1. Nov. 00:00 PDT = 07:00 UTC
    assert.equal(app.geminiQuota.nextMidnight(Date.UTC(2026, 10, 1, 5, 0, 0)), Date.UTC(2026, 10, 1, 7, 0, 0));
    // 1. Nov. 00:30 PDT -> 2. Nov. 00:00 PST = 08:00 UTC
    assert.equal(app.geminiQuota.nextMidnight(Date.UTC(2026, 10, 1, 7, 30, 0)), Date.UTC(2026, 10, 2, 8, 0, 0));
    // 1. Nov. 04:00 PST -> 2. Nov. 08:00 UTC
    assert.equal(app.geminiQuota.nextMidnight(Date.UTC(2026, 10, 1, 12, 0, 0)), Date.UTC(2026, 10, 2, 8, 0, 0));
});

test('Nachtmodus: leeres Tageskontingent beendet ehrlich', () => {
    const s = app.utils.nightPrepStatus;
    const now = 10_000_000;
    assert.equal(s({ open: 5, lastProgressAt: now, now, quotaBlocked: true, otherOpen: 0 }), 'quota');
    // KI-Stimmen laufen über einen anderen Anbieter weiter
    assert.equal(s({ open: 5, lastProgressAt: now, now, quotaBlocked: true, otherOpen: 2 }), 'running');
});

function book(pages, extra = {}) {
    return { id: 'b', bookType: 'story', pages: pages.map((p, i) => ({ id: i + 1, status: 'done', ...p })), ...extra };
}

test('Klappentext wird direkt nach der Titelseite vorgelesen', () => {
    const b = book([{}, {}, {}, {}, {}], { backCoverPageId: 5 });
    assert.deepEqual(app.utils.autoReadOrder(b), [0, 4, 1, 2, 3]);
    assert.equal(app.utils.autoReadNextIdx(b, 0), 4);
    assert.equal(app.utils.autoReadNextIdx(b, 4), 1);
    assert.equal(app.utils.autoReadNextIdx(b, 3), null);
    // eigene Titelseite
    const b2 = book([{}, {}, {}, {}], { titlePageId: 2, backCoverPageId: 4 });
    assert.deepEqual(app.utils.autoReadOrder(b2), [0, 1, 3, 2]);
    // ohne Klappentext unverändert
    assert.deepEqual(app.utils.autoReadOrder(book([{}, {}])), [0, 1]);
});

test('Fragerunde: Rätsel + Wörter je Seite, Wörter nur einmal, dann Buchfragen', () => {
    const v = (quizQ, words) => ({ papa: { text: 't', quizQ, quizA: quizQ && 'A', difficultWords: words } });
    const b = book([
        { variants: v('Wer?', [{ word: 'Höhle', explanation: 'ein Loch im Berg' }]) },
        { variants: v(null, [{ word: 'höhle', explanation: 'doppelt' }, { word: 'Moos', explanation: 'weiche Pflanze' }]) },
        { excluded: true, variants: v('Weg?', []) }
    ], { bookQuiz: { questions: [{ question: 'Wie endet es?', answer: 'Gut' }] } });
    const items = app.utils.buildReviewQuizItems(b, 'papa');
    assert.deepEqual(items.map(i => i.kind), ['quiz', 'word', 'word', 'book']);
    assert.equal(items[2].word, 'Moos');
    assert.equal(items[2].pageIdx, 1);
    assert.equal(app.utils.buildReviewQuizItems({ ...b, bookType: 'workbook' }, 'papa').length, 0);
});
