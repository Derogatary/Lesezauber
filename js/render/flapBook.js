import { app } from '../core.js';

// ================= 🪟 Klappenbücher: Anzeige (v0.51.0-beta) =================
// NEU: Klappen-Bereich im Reader (#readerFlaps) und die Schalter
// "🪟 Klappenbuch" beim Anlegen bzw. in der Buchansicht.
// Logik: js/actions/flapBook.js. Nutzer-/KI-Text immer über sanitize().

Object.assign(app.render, {
    // Chip in "Neu anlegen als" - nur sinnvoll bei Geschichten
    flapChipHtml() {
        if (app.state.newBookType === 'workbook') return '';
        const on = app.state.newBookFlaps;
        const cls = on ? 'bg-amber-500 text-white border-amber-500' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50';
        return `<button onclick="app.actions.toggleNewBookFlaps()" title="Bilderbuch mit Klappen zum Aufklappen" class="text-[11px] font-bold px-2.5 py-1 rounded-lg border transition ${cls}">🪟 Klappenbuch${on ? ' ✓' : ''}</button>`;
    },

    // Schalter in der Buchansicht (unter "Art:")
    bookFlapToggleHtml(book) {
        if (!book || app.utils.resolveBookType(book) === 'workbook') return '';
        const count = book.pages.filter(p => p.flapOf).length;
        const on = !!book.flapBook;
        return `
            <div class="mt-2 flex items-center justify-between gap-2 bg-white px-3 py-2 rounded-2xl border ${on ? 'border-amber-300' : 'border-slate-200'} shadow-sm">
                <span class="text-[11px] text-slate-600">${on ? `🪟 <b>Klappenbuch</b> · ${count} ${count === 1 ? 'Klappe' : 'Klappen'} zugeordnet. Fotos mit offener Klappe über ⋮ → „Als Klappe zuordnen“.` : '🪟 Hat das Buch Klappen zum Aufklappen?'}</span>
                <button onclick="app.actions.toggleBookFlaps()" class="text-[11px] font-bold px-2.5 py-1 rounded-lg border flex-shrink-0 ${on ? 'bg-amber-500 text-white border-amber-500' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'}">${on ? 'An' : 'Aus'}</button>
            </div>`;
    },

    readerFlaps(pageIdx = app.state.currentPageIdx) {
        const box = document.getElementById('readerFlaps');
        if (!box) return;
        const book = app.library[app.state.currentBookId];
        const page = book?.pages[pageIdx];
        if (!book || !page || !book.flapBook) { box.classList.add('hidden'); box.innerHTML = ''; return; }

        // Man blättert manuell auf ein Klappen-Foto
        if (page.flapOf) {
            const base = book.pages.findIndex(p => p.id === page.flapOf);
            box.classList.remove('hidden');
            box.innerHTML = `<p class="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-xl p-2">🪟 Das ist die geöffnete Klappe von Seite ${base + 1} - sie wird dort vorgelesen.</p>`;
            return;
        }

        const flaps = app.utils.flapsForPage(book, page);
        const pending = book.pages.filter(p => p.flapOf === page.id && (!p.flap || p.flap.status !== 'done')).length;
        if (!flaps.length && !pending) { box.classList.add('hidden'); box.innerHTML = ''; return; }

        const openFlap = flaps.find(f => f.id === app.state.openFlapId);
        const buttons = flaps.map((f, i) => {
            const isOpen = f === openFlap;
            return `<button onclick="app.actions.toggleReaderFlap(${f.id})" class="text-xs font-bold px-3 py-2 rounded-xl border transition ${isOpen ? 'bg-amber-500 text-white border-amber-500' : 'bg-white text-amber-800 border-amber-300 hover:bg-amber-100'}">🪟 ${isOpen ? 'Zuklappen' : `Klappe${flaps.length > 1 ? ` ${i + 1}` : ''} öffnen`}</button>`;
        }).join('');
        const text = openFlap ? [openFlap.flap.text, openFlap.flap.desc].filter(Boolean).join(' ') : '';
        box.classList.remove('hidden');
        box.innerHTML = `
            <div class="bg-amber-50 border border-amber-200 rounded-2xl p-3 space-y-2">
                <div class="flex flex-wrap gap-2">${buttons}</div>
                ${pending ? `<p class="text-[11px] text-amber-700">${pending} ${pending === 1 ? 'Klappe ist' : 'Klappen sind'} noch nicht ausgelesen (Buchansicht → ⋮ an der Klappe).</p>` : ''}
                <p id="readerFlapText" class="${openFlap ? '' : 'hidden'} text-sm text-slate-800 leading-relaxed">${app.utils.sanitize(text)}</p>
            </div>`;
    }
});
