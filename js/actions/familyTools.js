import { app } from '../core.js';

// ================= Familien-Werkzeuge (v0.42.0-beta) =================
// NEU (Ideenliste aus v0.41.0-beta): drei kleine Helfer für Eltern.
//   1. Monatsbudget-Warnung: ein selbst gesetztes Limit für die geschätzten
//      KI-Stimmen-Kosten (app.costMeter) - Hinweis bei 80 % und bei
//      Überschreiten, jeweils nur EINMAL pro Monat. Keine Sperre: die
//      Schätzung ist ungenau, ein hartes Abschalten mitten im Vorlesen wäre
//      schlimmer als ein paar Cent zu viel.
//   2. Wochenrückblick: was das aktive Profil in den letzten 7 Tagen gemacht
//      hat - nur aus Daten, die ohnehin auf dem Gerät liegen.
//   3. Wortkarten drucken: schwierige Wörter eines Buches (mit Erklärung) oder
//      die Vokabeln (Emoji + Wort) als Schneide-Karten.

const BUDGET_KEY = 'lz_cost_budget';
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

function loadBudget() {
    try { return JSON.parse(localStorage.getItem(BUDGET_KEY) || '{}') || {}; } catch (e) { console.error('Budget unlesbar:', e); return {}; }
}
function saveBudget(data) {
    try { localStorage.setItem(BUDGET_KEY, JSON.stringify(data)); } catch (e) { console.error('Budget nicht speicherbar:', e); }
}

Object.assign(app.utils, {
    // Reine Funktion (Unit-Test): Stufe 'ok' | 'near' (ab 80 %) | 'over'.
    budgetLevel(totalCost, limit) {
        if (!(limit > 0)) return 'ok';
        if (totalCost >= limit) return 'over';
        if (totalCost >= limit * 0.8) return 'near';
        return 'ok';
    },

    // Reine Funktion (Unit-Test): Wochenrückblick eines Profils.
    // profileId '__all__' = alle Profile zusammen.
    weeklyReview(library, vocabulary, profileId, now = Date.now()) {
        const since = now - WEEK_MS;
        const all = profileId === '__all__';
        const result = { pagesDone: 0, stickers: 0, books: [], checks: 0, checksGood: 0, newWords: [] };
        Object.values(library || {}).forEach(book => {
            const ownBook = all || (book.profileId || 'default') === profileId;
            let donePages = 0;
            (book.pages || []).forEach(p => {
                Object.entries(p.progress || {}).forEach(([pid, entry]) => {
                    if (!all && pid !== profileId) return;
                    if (entry && entry.done && entry.doneAt >= since) {
                        donePages++;
                        if (entry.sticker) result.stickers++;
                    }
                });
                Object.entries(p.check || {}).forEach(([pid, entry]) => {
                    if (!all && pid !== profileId) return;
                    if (entry && entry.checkedAt >= since) {
                        result.checks++;
                        if (entry.verdict === 'richtig') result.checksGood++;
                    }
                });
            });
            result.pagesDone += donePages;
            const readRecently = ownBook && book.lastReadAt >= since;
            if (readRecently || donePages > 0) {
                result.books.push({ title: book.title, donePages, lastReadAt: book.lastReadAt || 0 });
            }
        });
        result.books.sort((a, b) => b.lastReadAt - a.lastReadAt);
        // Vokabeln sind nicht pro Profil gespeichert - deshalb geräteweit.
        result.newWords = Object.values(vocabulary || {})
            .filter(v => v && v.firstSeen >= since)
            .map(v => `${v.emoji || ''} ${v.displayWord || v.word}`.trim());
        return result;
    },

    // Reine Funktion (Unit-Test): schwierige Wörter eines Buches, ohne
    // Doppelte (Groß-/Kleinschreibung egal), in Seitenreihenfolge.
    collectBookWords(book, personaId) {
        const seen = new Set();
        const out = [];
        (book?.pages || []).forEach(p => {
            if (p.excluded) return;
            const variant = app.utils.resolveAnyVariant(p, personaId || app.settings?.persona);
            (variant?.difficultWords || []).forEach(w => {
                if (!w || !w.word || !w.explanation) return;
                const key = String(w.word).trim().toLowerCase();
                if (!key || seen.has(key)) return;
                seen.add(key);
                out.push({ word: String(w.word).trim(), explanation: String(w.explanation).trim() });
            });
        });
        return out;
    }
});

Object.assign(app.actions, {
    // Einstellungen: Monatsbudget setzen (leer/0 = aus).
    setMonthlyBudget(value) {
        const limit = parseFloat(String(value).replace(',', '.'));
        const data = loadBudget();
        data.limit = limit > 0 ? Math.round(limit * 100) / 100 : 0;
        data.warned = {}; // neues Limit = neue Warnungen möglich
        saveBudget(data);
        app.render.budgetStatus();
        app.ui.toast(data.limit ? `Monatsbudget: ${data.limit.toLocaleString('de-DE')} USD` : 'Monatsbudget aus.', '💰');
    },

    // Aufgerufen nach jeder echten Sprachausgabe (app.costMeter.trackTts).
    checkMonthlyBudget() {
        const data = loadBudget();
        if (!(data.limit > 0)) return;
        const stats = app.costMeter.currentMonthStats();
        const level = app.utils.budgetLevel(stats.totalCost, data.limit);
        if (level === 'ok') return;
        const warned = data.warned || {};
        const key = `${stats.month}:${level}`;
        if (warned[key]) return;
        warned[key] = Date.now();
        data.warned = warned;
        saveBudget(data);
        const fmt = n => n.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        app.ui.toast(level === 'over'
            ? `Monatsbudget überschritten: ca. ${fmt(stats.totalCost)} von ${fmt(data.limit)} USD (Schätzung).`
            : `80 % des Monatsbudgets erreicht: ca. ${fmt(stats.totalCost)} von ${fmt(data.limit)} USD.`, '💰');
    },

    // Wortkarten drucken. source: 'book' (aktuelles Buch) | 'vocab'.
    printWordCards(source) {
        let title;
        let cards;
        if (source === 'vocab') {
            title = 'Meine Vokabeln';
            cards = Object.values(app.vocabulary)
                .sort((a, b) => (a.displayWord || a.word).localeCompare(b.displayWord || b.word, 'de'))
                .map(v => ({ big: v.emoji || '', word: v.displayWord || v.word, small: '' }));
        } else {
            const book = app.library[app.state.currentBookId];
            if (!book) return;
            title = `Wörter aus „${book.title}“`;
            cards = app.utils.collectBookWords(book, app.state.readingPersonaId || app.settings.persona)
                .map(w => ({ big: '', word: w.word, small: w.explanation }));
        }
        if (cards.length === 0) {
            app.ui.toast('Noch keine Wörter vorhanden.', 'ℹ️');
            return;
        }
        const s = app.utils.sanitize;
        const cardsHtml = cards.map(c => `
            <div class="card">
                ${c.big ? `<div class="big">${s(c.big)}</div>` : ''}
                <div class="word">${s(c.word)}</div>
                ${c.small ? `<div class="small">${s(c.small)}</div>` : ''}
            </div>`).join('');
        const win = window.open('', '_blank');
        if (!win) {
            app.ui.toast('Pop-up blockiert - bitte für diese Seite erlauben.', '⚠️');
            return;
        }
        win.document.write(`
            <html><head><title>${s(title)}</title>
            <style>
                body { font-family: sans-serif; margin: 12mm; }
                h1 { font-size: 16px; text-align: center; margin: 0 0 8mm; color: #555; }
                .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 0; }
                .card { border: 1px dashed #999; min-height: 55mm; padding: 6mm; box-sizing: border-box;
                        display: flex; flex-direction: column; align-items: center; justify-content: center;
                        text-align: center; break-inside: avoid; page-break-inside: avoid; }
                .big { font-size: 48px; line-height: 1.1; margin-bottom: 4mm; }
                .word { font-size: 28px; font-weight: bold; }
                .small { font-size: 14px; color: #444; margin-top: 4mm; line-height: 1.4; }
            </style></head>
            <body><h1>${s(title)} - an den Linien ausschneiden ✂️</h1><div class="grid">${cardsHtml}</div></body></html>`);
        win.document.close();
        win.focus();
        setTimeout(() => win.print(), 400);
    }
});

Object.assign(app.render, {
    // Einstellungen: Budget-Feld + Status unter dem Kosten-Zähler.
    budgetStatus(locked = app.utils.isSettingsLockedForActiveProfile?.()) {
        const input = document.getElementById('costBudgetInput');
        const status = document.getElementById('costBudgetStatus');
        if (!input || !status) return;
        const data = loadBudget();
        input.disabled = !!locked;
        if (document.activeElement !== input) input.value = data.limit > 0 ? String(data.limit).replace('.', ',') : '';
        if (!(data.limit > 0)) { status.innerText = 'Kein Monatsbudget gesetzt.'; return; }
        const stats = app.costMeter.currentMonthStats();
        const level = app.utils.budgetLevel(stats.totalCost, data.limit);
        const pct = Math.round((stats.totalCost / data.limit) * 100);
        status.innerText = `${pct} % des Budgets verbraucht${level === 'over' ? ' - überschritten!' : level === 'near' ? ' - bald erreicht.' : '.'}`;
        status.className = `text-[11px] font-semibold ${level === 'over' ? 'text-red-600' : level === 'near' ? 'text-amber-600' : 'text-slate-600'}`;
    },

    // Einstellungen: Familien-Karte (Chat pro Profil, Kinder-Lesemodus, Wochenrückblick).
    familyCard() {
        const profileId = app.state.currentProfileId;
        const profile = (app.profiles || []).find(p => p.id === profileId);
        const nameEl = document.getElementById('familyProfileName');
        if (nameEl) nameEl.innerText = profile ? profile.name : 'Alle Profile';

        const chatSelect = document.getElementById('familyChatMode');
        if (chatSelect) {
            chatSelect.value = app.utils.resolveChatMode(profile);
            chatSelect.disabled = !profile;
        }
        document.getElementById('familyChatHint')?.classList.toggle('hidden', !!profile);

        const reviewEl = document.getElementById('familyWeekReview');
        if (!reviewEl) return;
        const r = app.utils.weeklyReview(app.library, app.vocabulary, profileId);
        const s = app.utils.sanitize;
        const lines = [];
        lines.push(`<p>✅ <b>${r.pagesDone}</b> Seite(n)/Aufgabe(n) erledigt${r.stickers ? `, ${r.stickers} Sticker gesammelt` : ''}</p>`);
        if (r.checks) lines.push(`<p>📷 <b>${r.checks}</b> Blatt/Blätter kontrolliert, davon ${r.checksGood} auf Anhieb richtig</p>`);
        lines.push(r.books.length
            ? `<p>📚 Gelesen: ${r.books.slice(0, 6).map(b => `„${s(b.title)}“${b.donePages ? ` (${b.donePages} erledigt)` : ''}`).join(', ')}${r.books.length > 6 ? ` und ${r.books.length - 6} weitere` : ''}</p>`
            : '<p>📚 Diese Woche noch kein Buch geöffnet.</p>');
        if (r.newWords.length) lines.push(`<p>🎓 Neue Wörter (alle Profile): ${s(r.newWords.slice(0, 12).join(', '))}${r.newWords.length > 12 ? ' …' : ''}</p>`);
        reviewEl.innerHTML = lines.join('');
    }
});
