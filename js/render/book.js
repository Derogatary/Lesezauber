import { app } from '../core.js';

Object.assign(app.render, {
    book(id) {
        const book = app.library[id];
        if (!book) { app.nav.go('lib'); return; }

        const coverImg = app.utils.resolveCoverUrl(book);
        const header = document.getElementById('bookDetailHeader');
        // NEU: Verlag/Reihe anzeigen, falls die KI sie auf der Titelseite
        // erkannt hat (siehe app.actions.analyzePage) - sonst einfach weg.
        const publisherLine = (book.publisher || book.series)
            ? `<p class="text-[10px] text-slate-400">${[book.publisher ? `${app.utils.sanitize(book.publisher)}-Verlag` : null, book.series ? `${app.utils.sanitize(book.series)}-Reihe` : null].filter(Boolean).join(' · ')}</p>`
            : '';
        header.innerHTML = `
            <div class="w-16 h-20 bg-slate-100 rounded-lg overflow-hidden flex-shrink-0 border border-slate-200">
                ${coverImg ? `<img src="${coverImg}" class="w-full h-full object-cover">` : `<div class="flex items-center justify-center h-full">📚</div>`}
            </div>
            <div>
                <h2 class="text-base font-extrabold text-slate-900">${app.utils.sanitize(book.title)}</h2>
                <p class="text-xs text-slate-500 font-medium">Autor: ${app.utils.sanitize(book.author)}</p>
                ${publisherLine}
                <p class="text-[10px] text-slate-500 mt-1">${book.pages.length} Seiten gespeichert</p>
            </div>`;

        // NEU: "Weiterlesen"-Leiste, falls schon mal eine Seite geöffnet wurde
        const resumeBar = document.getElementById('resumeBar');
        const resumeIdx = (typeof book.lastReadIdx === 'number' && book.lastReadIdx >= 0 && book.lastReadIdx < book.pages.length)
            ? book.lastReadIdx : null;
        resumeBar.innerHTML = resumeIdx !== null
            ? `<button onclick="app.state.currentPageIdx=${resumeIdx}; app.nav.go('reader');" class="w-full bg-indigo-50 text-indigo-700 font-bold py-2.5 rounded-xl text-sm hover:bg-indigo-100 transition">▶ Weiterlesen (Seite ${resumeIdx + 1})</button>`
            : '';

        // NEU: Seiten-Rollen-Auswahl (Titelseite/Rückseite/Inhaltsverzeichnis)
        // befüllen - nur sichtbar, wenn es überhaupt Seiten zur Auswahl gibt.
        const rolesCard = document.getElementById('pageRolesCard');
        if (rolesCard) {
            rolesCard.classList.toggle('hidden', book.pages.length === 0);
            const roleOptions = (selectedId) => ['<option value="">– nicht festgelegt –</option>']
                .concat(book.pages.map((p, i) => `<option value="${p.id}" ${selectedId === p.id ? 'selected' : ''}>Seite ${i + 1}</option>`))
                .join('');
            const titleSelect = document.getElementById('roleTitlePage');
            if (titleSelect) titleSelect.innerHTML = roleOptions(book.titlePageId);
            const backCoverSelect = document.getElementById('roleBackCoverPage');
            if (backCoverSelect) backCoverSelect.innerHTML = roleOptions(book.backCoverPageId);
            const tocSelect = document.getElementById('roleTocPage');
            if (tocSelect) tocSelect.innerHTML = roleOptions(book.tocPageId);
        }

        // Check if pending pages exist to toggle batch action bar
        const targetPersona = app.state.readingPersonaId || app.settings.persona;
        const hasPending = book.pages.some(p =>
            p.status === 'pending' || p.status === 'error' ||
            (p.status === 'done' && !app.utils.resolvePageVariant(p, targetPersona))
        );
        document.getElementById('batchActionBar').classList.toggle('hidden', !hasPending);

        const grid = document.getElementById('pagesGrid');
        grid.innerHTML = book.pages.map((p, i) => {
            let statusBadge = `<span class="bg-emerald-100 text-emerald-800 text-[10px] font-bold px-2 py-0.5 rounded-full">Bereit</span>`;
            if (p.status === 'pending') statusBadge = `<span class="bg-amber-100 text-amber-800 text-[10px] font-bold px-2 py-0.5 rounded-full">Offen</span>`;
            if (p.status === 'processing') statusBadge = `<span class="bg-indigo-100 text-indigo-800 text-[10px] font-bold px-2 py-0.5 rounded-full animate-pulse">Liest...</span>`;
            if (p.status === 'error') statusBadge = `<span class="bg-red-100 text-red-800 text-[10px] font-bold px-2 py-0.5 rounded-full">Fehler</span>`;

            const isCover = book.coverPageId ? book.coverPageId === p.id : i === 0;

            return `
                <div class="bg-white rounded-xl border border-slate-200 shadow-sm flex flex-col justify-between">
                    <div class="relative h-28 bg-slate-100 rounded-t-xl overflow-hidden cursor-pointer" onclick="app.state.currentPageIdx=${i}; app.nav.go('reader');">
                        <img src="${p.thumbUrl || p.imgUrl}" loading="lazy" class="w-full h-full object-cover">
                        <div class="absolute top-2 left-2">${statusBadge}</div>
                        ${isCover ? '<div class="absolute top-2 right-2 text-amber-400 text-sm drop-shadow">⭐</div>' : ''}
                    </div>
                    ${p.chapterTitle ? `<div class="px-2 py-1 bg-indigo-50 border-t border-indigo-100 text-[10px] font-bold text-indigo-700 truncate" title="${app.utils.sanitize(p.chapterTitle)}">📑 ${app.utils.sanitize(p.chapterTitle)}</div>` : ''}
                    <div class="p-2 flex justify-between items-center bg-slate-50 border-t border-slate-100 rounded-b-xl gap-1">
                        <span class="text-[11px] font-bold text-slate-600 flex-shrink-0">S. ${i + 1}</span>
                        <div class="flex items-center">
                            <button onclick="app.actions.movePage(${i}, -1)" ${i === 0 ? 'disabled' : ''} title="Nach oben verschieben" aria-label="Seite nach oben verschieben" class="text-xs p-1 ${i === 0 ? 'text-slate-300' : 'text-slate-500 hover:text-slate-800'}">⬆️</button>
                            <button onclick="app.actions.movePage(${i}, 1)" ${i === book.pages.length - 1 ? 'disabled' : ''} title="Nach unten verschieben" aria-label="Seite nach unten verschieben" class="text-xs p-1 ${i === book.pages.length - 1 ? 'text-slate-300' : 'text-slate-500 hover:text-slate-800'}">⬇️</button>
                            <div class="relative">
                                <button onclick="app.actions.toggleCardMenu(${p.id})" title="Mehr Optionen" aria-label="Mehr Optionen" class="text-sm px-1.5 py-1 text-slate-500 hover:text-slate-800">⋮</button>
                                <div id="cardMenu-${p.id}" data-card-menu="${p.id}" class="hidden absolute right-0 bottom-full mb-1 bg-white border border-slate-200 rounded-lg shadow-lg py-1 z-10 min-w-[150px]">
                                    <button onclick="app.actions.setCover(${p.id}); app.actions.toggleCardMenu(${p.id})" class="w-full text-left px-3 py-2 text-xs hover:bg-slate-50 ${isCover ? 'text-amber-600 font-bold' : 'text-slate-700'}">${isCover ? '⭐ Ist Cover' : '☆ Als Cover festlegen'}</button>
                                    ${(p.status === 'error' || p.status === 'pending') ? `<button onclick="app.actions.retryPage(${i}); app.actions.toggleCardMenu(${p.id})" class="w-full text-left px-3 py-2 text-xs hover:bg-slate-50 text-indigo-600">${p.status === 'error' ? '🔄 Erneut versuchen' : '▶️ Analysieren'}</button>` : ''}
                                    <button onclick="app.actions.deletePage(${i})" class="w-full text-left px-3 py-2 text-xs hover:bg-red-50 text-red-500">🗑️ Entfernen</button>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>`;
        }).join('');
    }
});
