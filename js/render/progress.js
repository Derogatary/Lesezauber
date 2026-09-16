import { app } from '../core.js';

Object.assign(app.render, {
    // NEU: der "Geschafft"-Knopf im Reader + Belohnungs-Banner, wenn das
    // ganze Buch/Heft durch ist. Beschriftung hängt an der Buchart: bei
    // einem Übungsheft hakt man eine Aufgabe ab, bei einer Geschichte eine
    // gelesene Seite.
    pageDone() {
        const book = app.library[app.state.currentBookId];
        const page = book && book.pages[app.state.currentPageIdx];
        const btn = document.getElementById('pageDoneBtn');
        const banner = document.getElementById('rewardBanner');
        if (!book || !page || !btn) return;

        const isWorkbook = app.utils.resolveBookType(book) === 'workbook';
        const done = app.progress.isPageDone(page);

        btn.innerHTML = done
            ? `${app.progress.pageSticker(page)} ${isWorkbook ? 'Aufgabe erledigt' : 'Seite geschafft'} - nochmal tippen zum Zurücknehmen`
            : (isWorkbook ? '✅ Aufgabe erledigt!' : '✅ Seite geschafft!');
        btn.className = done
            ? 'w-full py-3 rounded-xl font-bold text-sm transition bg-emerald-100 text-emerald-800 border-2 border-emerald-300'
            : 'w-full py-3 rounded-xl font-bold text-sm transition bg-emerald-600 text-white hover:bg-emerald-700 active:scale-98 shadow-md';

        if (!banner) return;
        const status = app.progress.bookProgress(book);
        banner.classList.toggle('hidden', !status.complete);
        if (status.complete) {
            banner.innerHTML = `
                <div class="bg-gradient-to-r from-amber-400 to-amber-500 rounded-2xl p-4 text-center shadow-md">
                    <p class="text-3xl">🏆</p>
                    <p class="text-sm font-extrabold text-white mt-1">${isWorkbook ? 'Das ganze Heft ist geschafft!' : 'Das ganze Buch ist geschafft!'}</p>
                    <p class="text-[11px] text-amber-50 font-semibold">${status.total} von ${status.total} ${isWorkbook ? 'Aufgaben' : 'Seiten'}</p>
                </div>`;
        }
    },

    // NEU: Fortschrittsbalken in der Buchansicht. Wird ausgeblendet, solange
    // noch gar nichts abgehakt wurde - ein leerer Balken über jedem Buch
    // wäre nur Lärm.
    progressBar(book) {
        const container = document.getElementById('bookProgressBar');
        if (!container || !book) return;

        const status = app.progress.bookProgress(book);
        if (status.done === 0) {
            container.innerHTML = '';
            return;
        }

        const isWorkbook = app.utils.resolveBookType(book) === 'workbook';
        container.innerHTML = `
            <div class="bg-white p-3 rounded-2xl border border-slate-200 shadow-sm">
                <div class="flex justify-between items-center mb-1.5">
                    <span class="text-[11px] font-bold text-slate-600">${status.complete ? '🏆 Alles geschafft!' : 'Schon geschafft'}</span>
                    <span class="text-[11px] font-bold text-emerald-700">${status.done} / ${status.total} ${isWorkbook ? 'Aufgaben' : 'Seiten'}</span>
                </div>
                <div class="h-2.5 bg-slate-100 rounded-full overflow-hidden">
                    <div class="h-full bg-emerald-500 rounded-full transition-all" style="width: ${status.percent}%"></div>
                </div>
            </div>`;
    },

    // NEU: kleiner Fortschritts-Streifen für die Buchkarten in der
    // Bibliothek. Gibt HTML zurück (statt selbst zu zeichnen), weil die
    // Karten dort in einem Rutsch als String zusammengebaut werden.
    progressBadgeHtml(book) {
        const status = app.progress.bookProgress(book);
        if (status.done === 0) return '';
        return `
            <div class="mt-1.5">
                <div class="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                    <div class="h-full bg-emerald-500 rounded-full" style="width: ${status.percent}%"></div>
                </div>
                <p class="text-[10px] text-emerald-700 font-bold mt-0.5">${status.complete ? '🏆 geschafft' : `${status.done}/${status.total} geschafft`}</p>
            </div>`;
    },

    // NEU: Medaillen-Zähler im Bibliotheks-Kopf, direkt unter der Lese-Serie.
    medalBadge() {
        const el = document.getElementById('medalBadge');
        if (!el) return;
        const count = app.progress.medalCount();
        el.classList.toggle('hidden', count === 0);
        if (count > 0) el.innerText = `🏆 ${count} komplett geschafft`;
    }
});
