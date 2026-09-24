import { app } from '../../core.js';

Object.assign(app.atlas.render, {
    book(id) {
        const book = app.atlas.library[id];
        if (!book) { app.atlas.nav.go('lib'); return; }

        const header = document.getElementById('atlasBookDetailHeader');
        header.innerHTML = `
            <div class="w-16 h-20 bg-slate-100 rounded-lg overflow-hidden flex-shrink-0 border border-slate-200 flex items-center justify-center">
                <span class="text-2xl">📚</span>
            </div>
            <div>
                <h2 class="text-base font-extrabold text-slate-900">${app.utils.sanitize(book.title)}</h2>
                <p class="text-xs text-slate-500 font-medium">Autor: ${app.utils.sanitize(book.author)}</p>
                <p class="text-[10px] text-slate-500 mt-1">${book.pages.length} Seiten gespeichert</p>
            </div>`;

        const grid = document.getElementById('atlasPagesGrid');
        grid.innerHTML = book.pages.map((p, i) => `
            <div class="bg-white rounded-xl border border-slate-200 shadow-sm flex flex-col justify-between">
                <div class="relative h-28 bg-slate-100 rounded-t-xl overflow-hidden cursor-pointer p-2" onclick="app.atlas.actions.showPageText(${i})">
                    <p class="text-[9px] leading-tight text-slate-400 line-clamp-6">${app.utils.sanitize((p.text || '').slice(0, 220))}</p>
                </div>
                <div class="p-2 flex justify-between items-center bg-slate-50 border-t border-slate-100 rounded-b-xl gap-1">
                    <span class="text-[11px] font-bold text-slate-600 flex-shrink-0">S. ${i + 1}</span>
                    <div class="flex items-center">
                        <button onclick="app.atlas.actions.movePage(${i}, -1)" ${i === 0 ? 'disabled' : ''} title="Nach oben verschieben" aria-label="Seite nach oben verschieben" class="text-xs p-1 ${i === 0 ? 'text-slate-300' : 'text-slate-500 hover:text-slate-800'}">⬆️</button>
                        <button onclick="app.atlas.actions.movePage(${i}, 1)" ${i === book.pages.length - 1 ? 'disabled' : ''} title="Nach unten verschieben" aria-label="Seite nach unten verschieben" class="text-xs p-1 ${i === book.pages.length - 1 ? 'text-slate-300' : 'text-slate-500 hover:text-slate-800'}">⬇️</button>
                        <button onclick="app.atlas.actions.deletePage(${i})" title="Seite entfernen" aria-label="Seite entfernen" class="text-xs p-1 text-slate-500 hover:text-red-600">🗑️</button>
                    </div>
                </div>
            </div>`).join('');
    }
});
