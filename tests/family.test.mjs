// NEU (v0.42.0-beta): Kinder-Lesemodus, Chat pro Profil, Budget, Wochenrückblick, Wortkarten.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { app } from './helpers.mjs';

test('Kinder-Lesemodus: nur Bibliothek/Reader/Vokabeln/Hilfe, Buchansicht wird umgeleitet', () => {
    const t = app.utils.kidModeTarget;
    assert.equal(t('settings', false), 'settings');
    assert.equal(t('reader', true), 'reader');
    assert.equal(t('vocab', true), 'vocab');
    assert.equal(t('book', true), 'lib');
    assert.equal(t('settings', true), null);
    assert.equal(t('studio', true), null);
    assert.equal(t('scanner', true), null);
});

test('Kinder-Lesemodus zeigt nur freigegebene Bücher', () => {
    assert.equal(app.utils.isBookVisibleForKid({ approvedForKids: true }, true), true);
    assert.equal(app.utils.isBookVisibleForKid({}, true), false);
    assert.equal(app.utils.isBookVisibleForKid({}, false), true);
});

test('Chat pro Profil: Standard "nur mit Eltern"', () => {
    assert.equal(app.utils.resolveChatMode(undefined), 'parents');
    assert.equal(app.utils.resolveChatMode({ chatMode: 'kaputt' }), 'parents');
    assert.equal(app.utils.chatAllowed({}, false), true);
    assert.equal(app.utils.chatAllowed({}, true), false);
    assert.equal(app.utils.chatAllowed({ chatMode: 'always' }, true), true);
    assert.equal(app.utils.chatAllowed({ chatMode: 'never' }, false), false);
});

test('Eltern-Frage: Einmaleins 6-9', () => {
    const q = app.utils.parentGateQuestion(() => 0.99);
    assert.equal(q.answer, 81);
    assert.equal(q.text, '9 × 9');
    assert.equal(app.utils.parentGateQuestion(() => 0).answer, 36);
});

test('Monatsbudget: Stufen', () => {
    assert.equal(app.utils.budgetLevel(1, 0), 'ok');
    assert.equal(app.utils.budgetLevel(3, 5), 'ok');
    assert.equal(app.utils.budgetLevel(4, 5), 'near');
    assert.equal(app.utils.budgetLevel(5, 5), 'over');
});

test('Wochenrückblick zählt nur die letzten 7 Tage des Profils', () => {
    const now = Date.UTC(2026, 8, 23);
    const day = 24 * 60 * 60 * 1000;
    const library = {
        b1: { id: 'b1', title: 'Bär', profileId: 'lena', lastReadAt: now - day, pages: [
            { progress: { lena: { done: true, doneAt: now - 2 * day, sticker: '⭐' }, max: { done: true, doneAt: now - day } } },
            { progress: { lena: { done: true, doneAt: now - 10 * day } }, check: { lena: { verdict: 'richtig', checkedAt: now - day } } }
        ] },
        b2: { id: 'b2', title: 'Alt', profileId: 'lena', lastReadAt: now - 20 * day, pages: [] }
    };
    const vocab = { baum: { word: 'baum', displayWord: 'Baum', emoji: '🌳', firstSeen: now - day }, alt: { word: 'alt', emoji: '👴' } };
    const r = app.utils.weeklyReview(library, vocab, 'lena', now);
    assert.equal(r.pagesDone, 1);
    assert.equal(r.stickers, 1);
    assert.equal(r.checks, 1);
    assert.equal(r.checksGood, 1);
    assert.deepEqual(r.books.map(b => b.title), ['Bär']);
    assert.deepEqual(r.newWords, ['🌳 Baum']);
    assert.equal(app.utils.weeklyReview(library, vocab, '__all__', now).pagesDone, 2);
});

test('Wortkarten: schwierige Wörter ohne Doppelte, ausgeschlossene Seiten übersprungen', () => {
    const book = { pages: [
        { status: 'done', variants: { papa: { text: 'a', difficultWords: [{ word: 'Höhle', explanation: 'Ein Loch im Berg.' }] } } },
        { status: 'done', variants: { papa: { text: 'b', difficultWords: [{ word: 'höhle', explanation: 'doppelt' }, { word: 'Moos', explanation: 'Weiche Pflanze.' }] } } },
        { status: 'done', excluded: true, variants: { papa: { text: 'c', difficultWords: [{ word: 'Impressum', explanation: 'x' }] } } }
    ] };
    assert.deepEqual(app.utils.collectBookWords(book, 'papa').map(w => w.word), ['Höhle', 'Moos']);
});
