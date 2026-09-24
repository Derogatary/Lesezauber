import { app } from '../../core.js';

// Kleine Verzögerung (Debounce) für die Live-Suche - bei jedem
// Tastendruck sofort das komplette Grid neu zu rendern ist bei größeren
// Bibliotheken unnötig ruckelig. 200ms sind für Menschen nicht spürbar,
// sparen aber überflüssige Render-Durchläufe beim schnellen Tippen.
let searchDebounceTimer = null;

// Mehrfachauswahl-Zustand - bewusst NICHT in app.atlas.state (das wird sonst
// überall mitgespeichert/geprüft), sondern lokal in diesem Modul, da es
// reine UI-Sitzungslogik ist und nach dem Verlassen der Bibliotheks-Ansicht
// ohnehin keine Bedeutung mehr hat.
let selectMode = false;
const selectedIds = new Set();

Object.assign(app.atlas.actions, {
    debounceLibrarySearch() {
        clearTimeout(searchDebounceTimer);
        searchDebounceTimer = setTimeout(() => app.atlas.render.library(), 200);
    },

    dismissBackupReminder() {
        app.atlas.state.backupReminderDismissed = true;
        document.getElementById('atlasBackupReminder')?.classList.add('hidden');
    },

    // ------------- Mehrfachauswahl -------------
    // Wird von nav.go() aufgerufen, sobald man die Bibliothek verlässt -
    // sonst bliebe der Auswahlmodus unbemerkt aktiv, wenn man z.B. ein
    // Buch öffnet und später zurückkommt.
    resetLibrarySelection() {
        selectMode = false;
        selectedIds.clear();
    },

    toggleLibrarySelectMode() {
        selectMode = !selectMode;
        if (!selectMode) selectedIds.clear();
        app.atlas.render.library();
    },

    toggleBookSelection(id) {
        if (selectedIds.has(id)) selectedIds.delete(id);
        else selectedIds.add(id);
        app.atlas.render.library();
    },

    confirmDeleteSelectedBooks() {
        if (selectedIds.size === 0) return;
        const confirmed = confirm(`${selectedIds.size} Buch/Bücher endgültig löschen? Das kann NICHT rückgängig gemacht werden.`);
        if (!confirmed) return;

        selectedIds.forEach(id => app.atlas.dbOps.removeBookRecord(id));
        selectedIds.clear();
        selectMode = false;
        app.atlas.render.library();
        app.atlas.ui.toast('Ausgewählte Bücher gelöscht', '🗑️');
    },

    exportSelectedBooks() {
        if (selectedIds.size === 0) return;

        // Gleiches Format wie der komplette Bibliotheks-Export (Objekt,
        // keyed by Buch-ID) - die Datei lässt sich über "Importieren" in
        // den Einstellungen genauso wieder einlesen.
        const selected = {};
        selectedIds.forEach(id => { if (app.atlas.library[id]) selected[id] = app.atlas.library[id]; });

        const dataStr = JSON.stringify(selected, null, 2);
        const blob = new Blob([dataStr], { type: 'application/json' });
        const url = URL.createObjectURL(blob);

        const dateStr = new Date().toISOString().slice(0, 10);
        const a = document.createElement('a');
        a.href = url;
        a.download = `buchatlas-auswahl-${dateStr}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        app.atlas.ui.toast(`${selectedIds.size} Buch/Bücher exportiert.`, '📤');
    }
});

Object.assign(app.atlas.render, {
    library() {
        const container = document.getElementById('atlasLibraryList');

        // sanfte Backup-Erinnerung, wenn lange kein Export gemacht wurde
        const reminderEl = document.getElementById('atlasBackupReminder');
        if (reminderEl) {
            const lastExport = parseInt(localStorage.getItem('lz_atlas_last_export') || '0', 10);
            const daysSince = lastExport ? (Date.now() - lastExport) / (1000 * 60 * 60 * 24) : Infinity;
            const hasBooks = Object.keys(app.atlas.library).length > 0;
            const shouldShow = hasBooks && daysSince > 14 && !app.atlas.state.backupReminderDismissed;
            reminderEl.classList.toggle('hidden', !shouldShow);
        }

        // NEU (v0.47.0-beta): vorgemerkte Nacht-Aufträge (js/atlas/atlasNight.js)
        const nightList = document.getElementById('atlasNightQueueList');
        if (nightList) {
            const rows = app.atlas.render.nightJobRows({ dark: true });
            nightList.innerHTML = rows;
            document.getElementById('atlasNightQueue')?.classList.toggle('hidden', !rows);
        }

        // Auswahlmodus-UI (Button-Beschriftung, Aktionsleiste)
        const toggleBtn = document.getElementById('atlasLibrarySelectToggleBtn');
        if (toggleBtn) toggleBtn.textContent = selectMode ? 'Abbrechen' : 'Auswählen';
        const selectBar = document.getElementById('atlasLibrarySelectBar');
        if (selectBar) selectBar.classList.toggle('hidden', !selectMode);
        const countEl = document.getElementById('atlasLibrarySelectCount');
        if (countEl) countEl.textContent = `${selectedIds.size} ausgewählt`;

        // Suchfeld filtert nach Titel/Autor. Das Suchfeld selbst liegt
        // außerhalb von #libraryList, bleibt beim Neu-Rendern also fokussiert
        // - man verliert beim Tippen nicht den Cursor.
        const searchInput = document.getElementById('atlasLibrarySearch');
        const query = (searchInput?.value || '').trim().toLowerCase();

        let keys = Object.keys(app.atlas.library);
        if (query) {
            keys = keys.filter(id => {
                const b = app.atlas.library[id];
                return b.title.toLowerCase().includes(query) || b.author.toLowerCase().includes(query);
            });
        }

        // Sortierung nach Datum oder Titel
        const sortSelect = document.getElementById('atlasLibrarySort');
        const sortMode = sortSelect?.value || 'newest';
        keys.sort((a, b) => {
            const bookA = app.atlas.library[a];
            const bookB = app.atlas.library[b];
            if (sortMode === 'oldest') return (bookA.created || 0) - (bookB.created || 0);
            if (sortMode === 'title') return bookA.title.localeCompare(bookB.title, 'de');
            return (bookB.created || 0) - (bookA.created || 0); // "newest" (Standard)
        });

        if (keys.length === 0) {
            container.innerHTML = query
                ? `<div class="col-span-full text-center py-12 text-slate-500 bg-white rounded-2xl border border-dashed border-slate-200">
                        <span class="text-4xl block mb-2">🔍</span>
                        <p class="text-xs font-semibold">Keine Treffer für "${app.utils.sanitize(query)}"</p>
                   </div>`
                : `<div class="col-span-full text-center py-12 text-slate-500 bg-white rounded-2xl border border-dashed border-slate-200">
                        <span class="text-4xl block mb-2">📖</span>
                        <p class="text-xs font-semibold">Noch keine Bücher vorhanden.<br>Importiere deinen ersten Text!</p>
                   </div>`;
            return;
        }

        container.innerHTML = keys.map(id => {
            const book = app.atlas.library[id];
            const isSelected = selectedIds.has(id);
            // Im Auswahlmodus öffnet ein Klick nicht das Buch, sondern
            // schaltet die Auswahl um - dieselbe Karte, anderes Verhalten.
            const clickAction = selectMode
                ? `app.atlas.actions.toggleBookSelection('${book.id}')`
                : `app.atlas.state.currentBookId='${book.id}'; app.atlas.nav.go('book');`;

            return `
                <div onclick="${clickAction}" class="relative bg-white rounded-2xl overflow-hidden border ${isSelected ? 'border-indigo-500 ring-2 ring-indigo-200' : 'border-slate-200'} shadow-sm hover:shadow-md transition cursor-pointer active:scale-95 flex flex-col">
                    ${selectMode ? `
                        <div class="absolute top-2 left-2 z-10 w-5 h-5 rounded-full border-2 ${isSelected ? 'bg-indigo-600 border-indigo-600' : 'bg-white/80 border-slate-300'} flex items-center justify-center">
                            ${isSelected ? '<span class="text-white text-[10px] font-bold">✓</span>' : ''}
                        </div>` : ''}
                    <div class="h-24 bg-slate-100 relative flex items-center justify-center">
                        <span class="text-2xl">📚</span>
                        <span class="absolute bottom-2 right-2 bg-black/60 backdrop-blur-md text-white text-[10px] font-bold px-2 py-0.5 rounded-full">
                            ${book.pages.length} Seiten
                        </span>
                    </div>
                    <div class="p-3 flex-grow flex flex-col justify-between">
                        <div>
                            <h3 class="font-bold text-slate-900 text-xs line-clamp-1">${app.utils.sanitize(book.title)}</h3>
                            <p class="text-[10px] text-slate-500 font-semibold">${app.utils.sanitize(book.author)}</p>
                        </div>
                    </div>
                </div>`;
        }).join('');
    }
});
