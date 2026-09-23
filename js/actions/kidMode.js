import { app } from '../core.js';

// ================= Kinder-Lesemodus, Buch-Freigabe, Chat pro Profil (v0.42.0-beta) =================
// NEU (Ideenliste aus v0.41.0-beta, Nutzer: "Alles andere kannst du erledigen"):
// LeseZauber ist eine App für Eltern. Damit ein Kind trotzdem allein lesen kann,
// ohne an Einstellungen, Keys oder den SchreibZauber zu kommen, gibt es einen
// Kinder-Lesemodus:
//   - Die Bibliothek zeigt nur noch Bücher, die Eltern FREIGEGEBEN haben
//     (book.approvedForKids, Schalter in der Buchansicht) - so hat ein
//     Erwachsener die KI-Texte vorher wenigstens einmal gesehen.
//   - Ein Tipp auf ein Buch öffnet direkt den Reader (die Buchansicht mit
//     Löschen/Neu-Auslesen/Export bleibt verborgen).
//   - Alles mit data-parent-only im HTML wird per CSS (body.kid-mode, css/style.css)
//     ausgeblendet, app.nav.go() lässt nur Bibliothek/Reader/Vokabeln/Hilfe zu.
//   - Verlassen nur über eine Eltern-Frage (Einmaleins-Aufgabe). Das ist KEIN
//     Passwortschutz (wer die Entwicklertools öffnet, kommt raus), sondern eine
//     Absichts-Bremse für kleine Kinder - gleiche Haltung wie die Profil-Rollen.
// Der Modus gilt pro Gerät (localStorage), nicht pro Profil: er beschreibt,
// wer das Gerät gerade in der Hand hat.

const KID_MODE_KEY = 'lz_kid_mode';

// Ansichten, die ein Kind im Kinder-Lesemodus sehen darf.
const KID_VIEWS = ['lib', 'reader', 'vocab', 'help'];

function readKidMode() {
    try { return localStorage.getItem(KID_MODE_KEY) === '1'; } catch (e) { return false; }
}

function applyBodyClass(on) {
    if (typeof document === 'undefined' || !document.body) return;
    document.body.classList.toggle('kid-mode', on);
}

Object.assign(app.utils, {
    isKidMode() {
        return readKidMode();
    },

    // Reine Entscheidungsfunktion (Unit-Test): wohin darf app.nav.go() im
    // Kinder-Lesemodus? Gibt die Ziel-Ansicht zurück, 'lib' als Umleitung
    // (Buchansicht - z.B. der "Zurück"-Knopf im Reader) oder null = gesperrt.
    kidModeTarget(viewId, kidMode) {
        if (!kidMode) return viewId;
        if (KID_VIEWS.includes(viewId)) return viewId;
        if (viewId === 'book') return 'lib';
        return null;
    },

    // Soll dieses Buch in der Bibliothek erscheinen?
    isBookVisibleForKid(book, kidMode) {
        return !kidMode || !!(book && book.approvedForKids);
    },

    // "Frag den Zauberer" (freier KI-Chat) pro Profil:
    //   'always'  - immer anzeigen
    //   'parents' - nur außerhalb des Kinder-Lesemodus (Standard: der Chat ist
    //               der einzige Teil, in dem die KI frei auf Kinder-Eingaben
    //               antwortet - allein lieber nicht)
    //   'never'   - nie anzeigen
    resolveChatMode(profile) {
        const mode = profile && profile.chatMode;
        return ['always', 'parents', 'never'].includes(mode) ? mode : 'parents';
    },

    chatAllowed(profile, kidMode) {
        const mode = this.resolveChatMode(profile);
        if (mode === 'never') return false;
        if (mode === 'always') return true;
        return !kidMode;
    },

    isChatAllowedNow() {
        const profile = (app.profiles || []).find(p => p.id === app.state.currentProfileId);
        return this.chatAllowed(profile, readKidMode());
    },

    // Einmaleins-Aufgabe für die Eltern-Frage (6-9 x 6-9: für Erwachsene
    // sofort lösbar, für Vorschul-/Erstklasskinder nicht). rand ist nur für
    // den Unit-Test austauschbar.
    parentGateQuestion(rand = Math.random) {
        const a = 6 + Math.floor(rand() * 4);
        const b = 6 + Math.floor(rand() * 4);
        return { text: `${a} × ${b}`, answer: a * b };
    }
});

Object.assign(app.actions, {
    // Wird von app.nav.go() VOR jedem Ansichtswechsel gefragt. Gibt die
    // tatsächlich anzuzeigende Ansicht zurück oder null (= nicht wechseln).
    kidModeGuard(viewId) {
        const kidMode = readKidMode();
        const target = app.utils.kidModeTarget(viewId, kidMode);
        if (target === null) {
            app.ui.toast('Das ist nur für Eltern. Zum Verlassen oben auf 🔒 tippen.', '🔒');
        }
        return target;
    },

    enterKidMode() {
        const approved = Object.values(app.library).filter(b => b.approvedForKids).length;
        const chatNote = app.utils.isChatAllowedNow() && app.utils.resolveChatMode(app.profiles.find(p => p.id === app.state.currentProfileId)) === 'always'
            ? '\n\nAchtung: „Frag den Zauberer“ ist für dieses Profil auf „immer“ gestellt und bleibt sichtbar.'
            : '';
        const msg = approved === 0
            ? 'Kinder-Lesemodus einschalten?\n\nNoch ist KEIN Buch freigegeben - die Bibliothek wäre leer. Bücher gibst du in der Buchansicht frei („🧒 Für den Kinder-Lesemodus freigeben“).'
            : `Kinder-Lesemodus einschalten?\n\nSichtbar sind dann nur ${approved} freigegebene(s) Buch/Bücher. Einstellungen, SchreibZauber und Import sind ausgeblendet. Zum Verlassen fragt die App eine Einmaleins-Aufgabe ab.${chatNote}`;
        if (!confirm(msg)) return;
        try { localStorage.setItem(KID_MODE_KEY, '1'); } catch (e) { console.error('Kinder-Lesemodus nicht speicherbar:', e); }
        applyBodyClass(true);
        app.nav.go('lib');
        app.ui.toast('Kinder-Lesemodus ist an.', '🧒');
    },

    exitKidMode() {
        const q = app.utils.parentGateQuestion();
        const input = prompt(`Eltern-Frage: Wie viel ist ${q.text}?`);
        if (input === null) return;
        if (parseInt(String(input).trim(), 10) !== q.answer) {
            app.ui.toast('Das stimmt leider nicht.', '🔒');
            return;
        }
        try { localStorage.removeItem(KID_MODE_KEY); } catch (e) { console.error('Kinder-Lesemodus nicht zurücksetzbar:', e); }
        applyBodyClass(false);
        app.nav.go('lib');
        app.ui.toast('Kinder-Lesemodus ist aus.', '🔓');
    },

    // Bibliothek im Kinder-Lesemodus: Buch direkt im Reader öffnen, an der
    // zuletzt gelesenen Stelle (die Buchansicht ist Eltern-Sache).
    openBookForKid(bookId) {
        const book = app.library[bookId];
        if (!book || !book.approvedForKids) return;
        app.state.currentBookId = bookId;
        const last = typeof book.lastReadIdx === 'number' ? book.lastReadIdx : 0;
        app.state.currentPageIdx = Math.min(Math.max(last, 0), Math.max(book.pages.length - 1, 0));
        app.nav.go('reader');
    },

    // Buchansicht: Freigabe für den Kinder-Lesemodus an/aus.
    toggleBookApproval() {
        const book = app.library[app.state.currentBookId];
        if (!book) return;
        if (!book.approvedForKids) {
            const pending = book.pages.filter(p => p.status !== 'done' && !p.excluded).length;
            const extra = pending > 0 ? `\n\nHinweis: ${pending} Seite(n) sind noch nicht ausgelesen - deren Texte hat noch niemand gesehen.` : '';
            if (!confirm(`„${book.title}“ für den Kinder-Lesemodus freigeben?\n\nAm besten hast du die Texte der KI (Erstleser-Text, Zwischenrufe, Bildbeschreibung, Rätsel) einmal durchgeblättert. Unpassendes kannst du vorher mit 🚩 ausblenden.${extra}`)) return;
            book.approvedForKids = true;
            book.approvedAt = Date.now();
        } else {
            book.approvedForKids = false;
            delete book.approvedAt;
        }
        app.dbOps.saveBook(book);
        app.render.bookFamilyCard(book);
        app.ui.toast(book.approvedForKids ? 'Buch freigegeben.' : 'Freigabe zurückgenommen.', book.approvedForKids ? '✅' : '↩️');
    }
});

Object.assign(app.render, {
    // Karte in der Buchansicht (#bookFamilyCard): Freigabe + Wortkarten.
    bookFamilyCard(book) {
        const card = document.getElementById('bookFamilyCard');
        if (!card || !book) return;
        card.classList.toggle('hidden', book.pages.length === 0);
        const status = document.getElementById('bookApprovalStatus');
        const btn = document.getElementById('bookApprovalBtn');
        if (status) {
            status.innerText = book.approvedForKids
                ? `✅ Für den Kinder-Lesemodus freigegeben${book.approvedAt ? ` (seit ${new Date(book.approvedAt).toLocaleDateString('de-DE')})` : ''}.`
                : '🔒 Noch nicht freigegeben - im Kinder-Lesemodus unsichtbar.';
        }
        if (btn) btn.innerText = book.approvedForKids ? '↩️ Freigabe zurücknehmen' : '🧒 Für den Kinder-Lesemodus freigeben';
        const wordBtn = document.getElementById('bookWordCardsBtn');
        if (wordBtn) wordBtn.classList.toggle('hidden', app.utils.collectBookWords(book).length === 0);
    },

    // Reader: Chat-Karte ein-/ausblenden (aufgerufen aus app.render.reader).
    chatVisibility() {
        document.getElementById('chatCard')?.classList.toggle('hidden', !app.utils.isChatAllowedNow());
    }
});

// Beim Laden den gespeicherten Zustand auf <body> übertragen - Modul-Skripte
// laufen erst nach dem Parsen, document.body existiert hier also schon.
applyBodyClass(readKidMode());
