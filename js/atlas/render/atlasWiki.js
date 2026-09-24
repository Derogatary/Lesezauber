import { app } from '../../core.js';

const TYPE_META = {
    person: { label: 'Personen', icon: '🧑' },
    ort: { label: 'Orte', icon: '📍' },
    monster: { label: 'Monster & Kreaturen', icon: '👹' },
    faehigkeit: { label: 'Fähigkeiten & Zauber', icon: '⚡' },
    system: { label: 'Systeme & Regeln', icon: '🎮' },
    konzept: { label: 'Konzepte & Fraktionen', icon: '💭' },
    sonstiges: { label: 'Sonstiges', icon: '✨' }
};
const TYPE_ORDER = ['person', 'ort', 'monster', 'faehigkeit', 'system', 'konzept', 'sonstiges'];

function jumpToPageButton(pageNum, label) {
    return `<button onclick="app.atlas.actions.showPageText(${(pageNum | 0) - 1})"
        class="text-[10px] bg-indigo-50 text-indigo-700 font-bold px-2 py-0.5 rounded-full hover:bg-indigo-100 transition">
        ${label}
    </button>`;
}

// Entitäten aus älteren/frisch zusammengeführten Wikis haben evtl. noch
// keine stabile ID (siehe mergeWikiResults in actions/bookWiki.js, die IDs
// erst nachträglich hier vergibt) - wird hier einmalig nachgeholt, damit
// Bearbeiten/Löschen einen verlässlichen Anker zum Wiederfinden hat.
function ensureEntityIds(book) {
    let changed = false;
    (book.wiki?.entities || []).forEach(e => {
        if (!e.id) {
            e.id = 'ent_' + Math.random().toString(36).slice(2, 10);
            changed = true;
        }
    });
    if (changed) app.atlas.dbOps.saveBook(book);
}

function entityCardHtml(e, type) {
    const pages = Array.isArray(e.pages) ? e.pages : [];
    const pageChips = pages.map(p => jumpToPageButton(p, `S. ${p}`)).join('');
    const cardId = `atlasWikiCard-${e.id}`;

    return `
        <div class="bg-white rounded-xl border border-slate-200 shadow-sm p-3">
            <button onclick="document.getElementById('${cardId}').classList.toggle('hidden')" class="w-full flex justify-between items-center gap-2 text-left">
                <span id="atlasWikiNameDisplay-${e.id}" class="text-sm font-bold text-slate-900">${app.utils.sanitize(e.name || '?')}${e.editedManually ? ' <span class="text-[10px] font-normal text-slate-400">· bearbeitet</span>' : ''}</span>
                <span class="text-slate-400 text-xs flex-shrink-0">▾ Details</span>
            </button>
            <div id="${cardId}" class="hidden mt-2 space-y-2">
                <input id="atlasWikiNameEdit-${e.id}" type="text" class="hidden w-full text-sm font-bold text-slate-900 border border-slate-200 rounded-lg px-2 py-1.5 focus:outline-none focus:border-indigo-500" aria-label="Name bearbeiten">
                <p id="atlasWikiDescDisplay-${e.id}" class="text-xs text-slate-600 leading-relaxed">${app.utils.sanitize(e.description || '')}</p>
                <textarea id="atlasWikiDescEdit-${e.id}" rows="3" class="hidden w-full text-xs text-slate-600 leading-relaxed border border-slate-200 rounded-lg p-2 focus:outline-none focus:border-indigo-500 resize-none" aria-label="Beschreibung bearbeiten"></textarea>
                ${pageChips ? `<div class="flex flex-wrap gap-1">${pageChips}</div>` : ''}
                <div class="flex gap-2 pt-1">
                    <button id="atlasWikiEditBtn-${e.id}" onclick="app.atlas.actions.startEditWikiEntity('${e.id}')" class="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold py-1.5 rounded-lg text-[11px] transition">
                        ✏️ Bearbeiten
                    </button>
                    <button id="atlasWikiSaveBtn-${e.id}" onclick="app.atlas.actions.saveWikiEntityEdit('${e.id}')" class="hidden flex-1 bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-1.5 rounded-lg text-[11px] transition">
                        Speichern
                    </button>
                    <button id="atlasWikiCancelBtn-${e.id}" onclick="app.atlas.render.bookWiki()" class="hidden flex-1 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold py-1.5 rounded-lg text-[11px] transition">
                        Abbrechen
                    </button>
                    <button onclick="app.atlas.actions.deleteWikiEntity('${e.id}')" title="Eintrag löschen" aria-label="Eintrag löschen" class="text-red-500 hover:text-red-700 px-2 text-xs">
                        🗑️
                    </button>
                </div>
            </div>
        </div>`;
}

Object.assign(app.atlas.render, {
    bookWiki() {
        const book = app.atlas.library[app.atlas.state.currentBookId];
        if (!book) { app.atlas.nav.go('lib'); return; }

        ensureEntityIds(book);
        document.getElementById('atlasWikiBookTitle').textContent = book.title;

        const wiki = book.wiki || {};
        const chapters = Array.isArray(wiki.chapters) ? wiki.chapters : [];
        const entities = Array.isArray(wiki.entities) ? wiki.entities : [];
        const hasWiki = chapters.length > 0 || entities.length > 0;

        document.getElementById('atlasWikiEmptyState').classList.toggle('hidden', hasWiki);
        document.getElementById('atlasWikiSearchBar').classList.toggle('hidden', !hasWiki);
        document.getElementById('atlasWikiRegenerateBtn').classList.toggle('hidden', !hasWiki);
        document.getElementById('atlasWikiRestoreBtn')?.classList.toggle('hidden', !book.wikiPrevious);

        // Grobe Vorab-Schätzung, BEVOR man überhaupt startet - bei kurzen
        // Büchern (1 Block) bleibt das leer, das läuft eh in ~10-20s durch.
        // 15000 ist dieselbe Block-Zeichengrenze wie in actions/bookWiki.js
        // (WIKI_CHUNK_CHAR_LIMIT) - hier bewusst als grober Schätzwert
        // dupliziert statt importiert, um die Render-Datei nicht von der
        // Action-Datei abhängig zu machen.
        const estimateEl = document.getElementById('atlasWikiEstimate');
        if (estimateEl && !hasWiki) {
            const totalChars = book.pages.reduce((sum, p) => sum + (p.text?.length || 0), 0);
            const estimatedChunks = Math.max(1, Math.ceil(totalChars / 15000));
            estimateEl.textContent = estimatedChunks > 1
                ? `Bei diesem Buchumfang vermutlich ${estimatedChunks} Textblöcke nötig - ${app.atlas.utils.formatEta(estimatedChunks, app.atlas.api.getPacingDelayMs())}${app.atlas.api.getKeyCount() > 1 ? ` (mit ${app.atlas.api.getKeyCount()} Keys)` : ''}.`
                : '';
        }

        // Unvollständig verarbeitetes Wiki (Abbruch oder dauerhaft
        // fehlgeschlagener Block) - Banner mit Fortsetzen-Option statt
        // stillschweigend nur den Teil-Stand zu zeigen.
        const incomplete = hasWiki && wiki.complete === false;
        const noticeEl = document.getElementById('atlasWikiIncompleteNotice');
        if (noticeEl) {
            noticeEl.classList.toggle('hidden', !incomplete);
            if (incomplete) {
                const done = (wiki.processedChunkIndices || []).length;
                document.getElementById('atlasWikiIncompleteText').textContent =
                    `⏸️ Unvollständig - ${done} von ${wiki.totalChunks} Textblöcken verarbeitet.`;
            }
        }

        // NEU (v0.47.0-beta): für den Nachtmodus vorgemerkt?
        app.atlas.render.nightJobInfo('atlasWikiNightInfo', { book, type: 'wiki' });

        const container = document.getElementById('atlasWikiContent');
        if (!hasWiki) { container.innerHTML = ''; return; }

        const query = (document.getElementById('atlasWikiSearchInput')?.value || '').toLowerCase().trim();
        const matches = (...vals) => !query || vals.some(v => (v || '').toLowerCase().includes(query));

        // ---------- Kapitelübersicht ----------
        const filteredChapters = chapters.filter(c => matches(c.title, c.summary));
        const chapterSection = filteredChapters.length === 0 ? '' : `
            <section>
                <h3 class="text-xs font-bold uppercase tracking-wider text-slate-500 mb-2 px-1">📚 Kapitel (${filteredChapters.length})</h3>
                <div class="space-y-2">
                    ${filteredChapters.map((c, i) => {
                        const cardId = `atlasWikiChapter-${i}`;
                        const range = (c.startPage && c.endPage)
                            ? (c.startPage === c.endPage ? `Seite ${c.startPage}` : `Seite ${c.startPage}–${c.endPage}`)
                            : '';
                        return `
                            <div class="bg-white rounded-xl border border-slate-200 shadow-sm p-3">
                                <button onclick="document.getElementById('${cardId}').classList.toggle('hidden')" class="w-full flex justify-between items-center gap-2 text-left">
                                    <div class="min-w-0">
                                        <span class="text-sm font-bold text-slate-900 block truncate">${app.utils.sanitize(c.title || `Kapitel ${i + 1}`)}</span>
                                        ${range ? `<span class="text-[10px] text-slate-400">${range}</span>` : ''}
                                    </div>
                                    <span class="text-slate-400 text-xs flex-shrink-0">▾</span>
                                </button>
                                <div id="${cardId}" class="hidden mt-2 space-y-2">
                                    <p class="text-xs text-slate-600 leading-relaxed">${app.utils.sanitize(c.summary || '')}</p>
                                    ${c.startPage ? `<div>${jumpToPageButton(c.startPage, 'Kapitel öffnen')}</div>` : ''}
                                </div>
                            </div>`;
                    }).join('')}
                </div>
            </section>`;

        // ---------- Wiki-Einträge nach Kategorie ----------
        const filteredEntities = entities.filter(e => matches(e.name, e.description));
        const groups = { person: [], ort: [], monster: [], faehigkeit: [], system: [], konzept: [], sonstiges: [] };
        filteredEntities.forEach(e => {
            const key = groups[e.type] ? e.type : 'sonstiges';
            groups[key].push(e);
        });

        const entitySections = TYPE_ORDER
            .filter(type => groups[type].length > 0)
            .map(type => {
                const meta = TYPE_META[type];
                const cards = groups[type].map(e => entityCardHtml(e, type)).join('');

                return `
                    <section>
                        <h3 class="text-xs font-bold uppercase tracking-wider text-slate-500 mb-2 px-1">${meta.icon} ${meta.label} (${groups[type].length})</h3>
                        <div class="space-y-2">${cards}</div>
                    </section>`;
            }).join('');

        const combined = chapterSection + entitySections;
        container.innerHTML = combined || `<p class="text-sm text-slate-500 text-center py-8">Keine Treffer für "${app.utils.sanitize(query)}".</p>`;
    }
});
