import { app } from '../../core.js';

// Ordnet die Seiten den Kapiteln aus dem Buch-Wiki zu (startPage/endPage,
// 1-indexiert), damit die Übersetzungs-Ansicht dieselbe Gliederung nutzt
// wie das Wiki - eine Seite landet nie in zwei Kapiteln gleichzeitig.
// Gibt null zurück, wenn kein (nutzbares) Wiki vorhanden ist - der
// Aufrufer zeigt dann die bisherige flache Seitenliste.
function groupPagesByChapters(pages, chapters) {
    const validChapters = (chapters || []).filter(c =>
        Number.isInteger(c.startPage) && Number.isInteger(c.endPage) &&
        c.startPage >= 1 && c.endPage >= c.startPage
    );
    if (validChapters.length === 0) return null;

    const assigned = new Set();
    const groups = validChapters
        .slice()
        .sort((a, b) => a.startPage - b.startPage)
        .map(c => {
            const pageIndices = [];
            const from = Math.max(0, c.startPage - 1);
            const to = Math.min(c.endPage - 1, pages.length - 1);
            for (let i = from; i <= to; i++) {
                if (!assigned.has(i)) {
                    pageIndices.push(i);
                    assigned.add(i);
                }
            }
            return { title: c.title || '', pageIndices };
        })
        .filter(g => g.pageIndices.length > 0);

    const leftover = [];
    pages.forEach((_, i) => { if (!assigned.has(i)) leftover.push(i); });
    if (leftover.length > 0) {
        groups.push({ title: 'Weitere Seiten', pageIndices: leftover });
    }

    return groups.length > 0 ? groups : null;
}

function pageCardHtml(p, i, lang, issuesByPage) {
    const translation = p.translations && p.translations[lang];
    const cardId = `atlasTranslatePageCard-${i}`;
    const pageIssues = issuesByPage.get(i) || [];

    const statusBadge = !translation
        ? `<span class="bg-amber-100 text-amber-800 text-[10px] font-bold px-2 py-0.5 rounded-full">Ausstehend</span>`
        : pageIssues.length > 0
            ? `<span class="bg-red-100 text-red-700 text-[10px] font-bold px-2 py-0.5 rounded-full">⚠️ ${pageIssues.length}</span>`
            : `<span class="bg-emerald-100 text-emerald-800 text-[10px] font-bold px-2 py-0.5 rounded-full">✓ Übersetzt</span>`;

    const issuesHtml = pageIssues.length > 0 ? `
        <div class="bg-red-50 border border-red-100 rounded-lg p-2 space-y-1">
            <p class="text-[10px] font-bold text-red-700">⚠️ Namens-Check: möglicherweise fehlend</p>
            ${pageIssues.map(iss => `<p class="text-[10px] text-red-600">"${app.utils.sanitize(iss.expectedName)}" (${app.utils.sanitize(iss.entityName)})</p>`).join('')}
        </div>` : '';

    return `
        <div class="bg-white rounded-xl border border-slate-200 shadow-sm p-3">
            <button onclick="document.getElementById('${cardId}').classList.toggle('hidden')" class="w-full flex justify-between items-center gap-2 text-left">
                <span class="text-sm font-bold text-slate-900">Seite ${i + 1}</span>
                <div class="flex items-center gap-2 flex-shrink-0">
                    ${statusBadge}
                    <span class="text-slate-400 text-xs">▾</span>
                </div>
            </button>
            <div id="${cardId}" class="hidden mt-3 space-y-3">
                ${issuesHtml}
                <div>
                    <p class="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">Original</p>
                    <p class="text-xs text-slate-600 leading-relaxed whitespace-pre-line">${app.utils.sanitize(p.text || '(kein Text)')}</p>
                </div>
                ${translation ? `
                <div>
                    <div class="flex items-center justify-between mb-1">
                        <p class="text-[10px] font-bold uppercase tracking-wider text-slate-400">Übersetzung (${app.utils.sanitize(lang)})${translation.editedManually ? ' · von Hand geprüft' : ''}${translation.fromMemory ? ' · 💾 aus Translation Memory' : ''}</p>
                        <button id="atlasTranslateEditBtn-${i}" onclick="app.atlas.actions.startEditTranslation(${i})" class="text-[10px] text-indigo-600 hover:text-indigo-800 font-bold flex-shrink-0">✏️ Bearbeiten</button>
                    </div>
                    <p id="atlasTranslateText-${i}" class="text-xs text-indigo-700 leading-relaxed whitespace-pre-line">${app.utils.sanitize(translation.text || '')}</p>
                    <textarea id="atlasTranslateEditArea-${i}" rows="6" class="hidden w-full text-xs text-slate-700 leading-relaxed border border-slate-200 rounded-lg p-2 focus:outline-none focus:border-indigo-500 resize-none" aria-label="Übersetzung von Seite ${i + 1} bearbeiten"></textarea>
                    <div id="atlasTranslateEditActions-${i}" class="hidden flex gap-2 mt-2">
                        <button onclick="app.atlas.actions.saveTranslationEdit(${i})" class="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-1.5 rounded-lg text-[11px] transition">Speichern</button>
                        <button onclick="app.atlas.actions.cancelEditTranslation(${i})" class="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold py-1.5 rounded-lg text-[11px] transition">Abbrechen</button>
                    </div>
                </div>` : `<p class="text-xs text-slate-400 italic">Noch nicht übersetzt.</p>`}
            </div>
        </div>`;
}

function chapterGroupHtml(group, groupIdx, pages, lang, issuesByPage) {
    const groupId = `atlasTranslateChapterGroup-${groupIdx}`;
    const total = group.pageIndices.length;
    const done = group.pageIndices.filter(i => pages[i].translations && pages[i].translations[lang]).length;
    const complete = total > 0 && done === total;
    const issueCount = group.pageIndices.reduce((sum, i) => sum + (issuesByPage.get(i)?.length || 0), 0);

    const statusBadge = issueCount > 0
        ? `<span class="bg-red-100 text-red-700 text-[10px] font-bold px-2 py-0.5 rounded-full">⚠️ ${issueCount}</span>`
        : complete
            ? `<span class="bg-emerald-100 text-emerald-800 text-[10px] font-bold px-2 py-0.5 rounded-full">✓ Vollständig</span>`
            : `<span class="bg-amber-100 text-amber-800 text-[10px] font-bold px-2 py-0.5 rounded-full">${done}/${total}</span>`;

    const firstPage = group.pageIndices[0] + 1;
    const lastPage = group.pageIndices[total - 1] + 1;
    const pageRange = firstPage === lastPage ? `Seite ${firstPage}` : `Seite ${firstPage}–${lastPage}`;

    return `
        <div class="bg-white rounded-xl border border-slate-200 shadow-sm">
            <button onclick="document.getElementById('${groupId}').classList.toggle('hidden')" aria-expanded="false" class="w-full flex justify-between items-center gap-2 text-left p-3">
                <div class="min-w-0">
                    <span class="text-sm font-bold text-slate-900 block truncate">${app.utils.sanitize(group.title || `Kapitel ${groupIdx + 1}`)}</span>
                    <span class="text-[10px] text-slate-400">${pageRange} · ${total} Seite${total === 1 ? '' : 'n'}</span>
                </div>
                <div class="flex items-center gap-2 flex-shrink-0">
                    ${statusBadge}
                    <span class="text-slate-400 text-xs">▾</span>
                </div>
            </button>
            <div id="${groupId}" class="hidden px-3 pb-3 space-y-2">
                ${group.pageIndices.map(i => pageCardHtml(pages[i], i, lang, issuesByPage)).join('')}
            </div>
        </div>`;
}

Object.assign(app.atlas.render, {
    bookTranslate() {
        const book = app.atlas.library[app.atlas.state.currentBookId];
        if (!book) { app.atlas.nav.go('lib'); return; }

        document.getElementById('atlasTranslateBookTitle').textContent = book.title;

        // Aktiven Tab wiederherstellen/synchronisieren - wichtig nach jedem
        // Re-Render (z.B. nach einem abgeschlossenen Lauf), damit man nicht
        // ungewollt auf "Übersetzen" zurückspringt.
        app.atlas.actions.switchTranslateTab(app.atlas.state.translateActiveTab || 'translate');

        const hint = document.getElementById('atlasTranslateWikiHint');
        if (hint) {
            const entityCount = book.wiki?.entities?.length || 0;
            hint.textContent = entityCount > 0
                ? `Nutzt das vorhandene Wiki (${entityCount} Einträge) als Namens-Glossar für konsistente Übersetzung.`
                : 'Tipp: Erstelle zuerst das 📖 Wiki - Namen/Orte werden dann konsistent übersetzt UND diese Ansicht gliedert sich automatisch nach Kapiteln.';
        }

        const lang = (document.getElementById('atlasTranslateTargetLang')?.value || 'Deutsch').trim();
        const totalPages = book.pages.length;
        const translatedCount = book.pages.filter(p => p.translations && p.translations[lang]).length;
        const hasTranslations = translatedCount > 0;

        document.getElementById('atlasTranslateDownloadBtn').classList.toggle('hidden', !hasTranslations);
        document.getElementById('atlasTranslateDownloadOnlyBtn')?.classList.toggle('hidden', !hasTranslations);
        document.getElementById('atlasTranslateDownloadEpubBtn')?.classList.toggle('hidden', !hasTranslations);
        document.getElementById('atlasTranslateExportEmptyHint')?.classList.toggle('hidden', hasTranslations);
        document.getElementById('atlasTranslateQaSection')?.classList.toggle('hidden', !hasTranslations);
        document.getElementById('atlasTranslateQaEmptyHint')?.classList.toggle('hidden', hasTranslations);

        // Fortschritts-Übersicht - auf einen Blick sichtbar, ohne irgendwas
        // aufzuklappen. Genau das, was für eine schnelle Übersicht zählt.
        const progressEl = document.getElementById('atlasTranslateProgress');
        if (progressEl) {
            progressEl.classList.toggle('hidden', totalPages === 0);
            if (totalPages > 0) {
                const pct = Math.round((translatedCount / totalPages) * 100);
                const allDone = translatedCount === totalPages;
                const pending = totalPages - translatedCount;
                const keyCount = app.atlas.api.getKeyCount();
                const etaLine = allDone ? '' : `
                    <p class="text-[10px] text-slate-400 mt-1">${pending} ausstehend · ${app.atlas.utils.formatEta(pending, app.atlas.api.getPacingDelayMs())}${keyCount > 1 ? ` (mit ${keyCount} Keys)` : ''}</p>`;
                progressEl.innerHTML = `
                    <div class="flex items-center justify-between mb-1.5">
                        <span class="text-xs font-bold text-slate-700">${allDone ? '✅ Vollständig übersetzt' : `${translatedCount} von ${totalPages} Seiten übersetzt`}</span>
                        <span class="text-[10px] text-slate-400">${pct}%</span>
                    </div>
                    <div class="w-full bg-slate-100 rounded-full h-2 overflow-hidden">
                        <div class="bg-indigo-500 h-full transition-all" style="width: ${pct}%"></div>
                    </div>${etaLine}`;
            }
        }

        // QA-Bericht (Namens-Konsistenz-Check) - nur relevant, wenn er für
        // die AKTUELL gewählte Sprache erstellt wurde, sonst würde er
        // beim Sprachwechsel irreführend stehen bleiben.
        const qaEl = document.getElementById('atlasTranslateQaReport');
        const qa = book.qaReport && book.qaReport.lang === lang ? book.qaReport : null;
        const issuesByPage = new Map();
        if (qa) {
            qa.issues.forEach(iss => {
                if (!issuesByPage.has(iss.pageIdx)) issuesByPage.set(iss.pageIdx, []);
                issuesByPage.get(iss.pageIdx).push(iss);
            });
        }
        if (qaEl) {
            qaEl.classList.toggle('hidden', !qa);
            if (qa) {
                qaEl.className = qa.issues.length > 0
                    ? 'bg-amber-50 border border-amber-200 rounded-xl p-3'
                    : 'bg-emerald-50 border border-emerald-200 rounded-xl p-3';
                qaEl.innerHTML = qa.issues.length > 0
                    ? `<p class="text-xs font-bold text-amber-800">⚠️ Namens-Check: ${qa.issues.length} mögliche Inkonsistenz(en)</p>
                       <p class="text-[10px] text-amber-700 mt-0.5">Markierte Seiten unten aufklappen für Details. Heuristischer Check (reiner Text-Abgleich) - kein Beweis für einen echten Fehler, nur ein Hinweis zum Gegenlesen.</p>`
                    : `<p class="text-xs font-bold text-emerald-800">✅ Namens-Check: keine Auffälligkeiten gefunden</p>`;
            }
        }
        document.getElementById('atlasTranslateQaBadge')?.classList.toggle('hidden', !qa || qa.issues.length === 0);

        // Rückübersetzungs-Stichprobe - zum manuellen Vergleich, keine
        // automatische Bewertung (siehe Kommentar in actions/bookTranslate.js).
        const backEl = document.getElementById('atlasTranslateBackTransReport');
        const backCheck = book.backTranslationCheck && book.backTranslationCheck.lang === lang ? book.backTranslationCheck : null;
        if (backEl) {
            backEl.classList.toggle('hidden', !backCheck);
            if (backCheck) {
                backEl.innerHTML = `
                    <p class="text-xs font-bold text-slate-700 mb-1">🔁 Rückübersetzungs-Stichprobe (${backCheck.results.length} Seite${backCheck.results.length === 1 ? '' : 'n'})</p>
                    <p class="text-[10px] text-slate-500 mb-2">Original vs. Rückübersetzung - bitte selbst vergleichen, ob die Bedeutung erhalten blieb. Keine automatische Bewertung.</p>
                    <div class="space-y-2">
                        ${backCheck.results.map(r => {
                            const page = book.pages[r.pageIdx];
                            const rowId = `atlasBackTransRow-${r.pageIdx}`;
                            return `
                                <div class="bg-slate-50 rounded-lg border border-slate-200">
                                    <button onclick="document.getElementById('${rowId}').classList.toggle('hidden')" class="w-full flex justify-between items-center gap-2 text-left p-2.5">
                                        <span class="text-xs font-bold text-slate-700">Seite ${r.pageIdx + 1}</span>
                                        <span class="text-slate-400 text-xs">▾</span>
                                    </button>
                                    <div id="${rowId}" class="hidden px-2.5 pb-2.5 space-y-2">
                                        <div>
                                            <p class="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">Original</p>
                                            <p class="text-xs text-slate-600 leading-relaxed whitespace-pre-line">${app.utils.sanitize(page?.text || '')}</p>
                                        </div>
                                        <div>
                                            <p class="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">Rückübersetzung</p>
                                            <p class="text-xs text-purple-700 leading-relaxed whitespace-pre-line">${app.utils.sanitize(r.backTranslation)}</p>
                                        </div>
                                    </div>
                                </div>`;
                        }).join('')}
                    </div>`;
            }
        }

        const container = document.getElementById('atlasTranslatePagesList');
        const groups = groupPagesByChapters(book.pages, book.wiki?.chapters);

        // Suche: filtert nach Original- ODER Übersetzungstext. Kapitel-
        // Gruppen, die danach keine passende Seite mehr enthalten, werden
        // komplett ausgeblendet statt leer angezeigt zu werden.
        const pageQuery = (document.getElementById('atlasTranslatePageSearch')?.value || '').toLowerCase().trim();
        const pageMatches = (i) => {
            if (!pageQuery) return true;
            const p = book.pages[i];
            const orig = (p.text || '').toLowerCase();
            const trans = (p.translations?.[lang]?.text || '').toLowerCase();
            return orig.includes(pageQuery) || trans.includes(pageQuery);
        };

        let html;
        if (groups) {
            const filteredGroups = groups
                .map(g => ({ ...g, pageIndices: g.pageIndices.filter(pageMatches) }))
                .filter(g => g.pageIndices.length > 0);
            html = filteredGroups.map((g, gi) => chapterGroupHtml(g, gi, book.pages, lang, issuesByPage)).join('');
        } else {
            const filteredIndices = book.pages.map((_, i) => i).filter(pageMatches);
            html = filteredIndices.map(i => pageCardHtml(book.pages[i], i, lang, issuesByPage)).join('');
        }

        container.innerHTML = html || (pageQuery
            ? `<p class="text-sm text-slate-500 text-center py-8">Keine Treffer für "${app.utils.sanitize(pageQuery)}".</p>`
            : '');
    }
});
