import { app } from '../core.js';

// NEU: kleine Verzögerung (Debounce) für die Live-Suche - bei jedem
// Tastendruck sofort das komplette Grid neu zu rendern ist bei größeren
// Bibliotheken unnötig ruckelig. 200ms sind für Menschen nicht spürbar,
// sparen aber überflüssige Render-Durchläufe beim schnellen Tippen.
let searchDebounceTimer = null;
Object.assign(app.actions, {
    debounceLibrarySearch() {
        clearTimeout(searchDebounceTimer);
        searchDebounceTimer = setTimeout(() => app.render.library(), 200);
    }
});

Object.assign(app.render, {
    library() {
        const container = document.getElementById('libraryList');

        // NEU: persönliche Begrüßung mit dem Namen des aktuellen Profils
        const profile = app.profiles.find(p => p.id === app.state.currentProfileId);
        const greetingEl = document.getElementById('libraryGreeting');
        if (greetingEl) greetingEl.innerText = profile ? `Hallo, ${profile.name}!` : 'Deine interaktive Kinderbuch-Welt';

        // NEU: Rollen-Symbol (Kind/Erwachsen) - nur bei einem konkreten
        // Profil sinnvoll, nicht beim "Alle Profile"-Filter.
        const roleBadge = document.getElementById('profileRoleBadge');
        if (roleBadge) {
            roleBadge.classList.toggle('hidden', !profile);
            if (profile) {
                const isAdult = app.utils.resolveProfileRole(profile) === 'adult';
                roleBadge.innerText = isAdult ? '🧑' : '🧒';
                roleBadge.title = isAdult
                    ? 'Erwachsenen-Profil - zu Kinderprofil wechseln (sperrt teure/heikle Einstellungen)'
                    : 'Kinderprofil - zu Erwachsenen-Profil wechseln (schaltet alle Einstellungen frei)';
            }
        }
        // FIX (künstliches Nutzer-Feedback): dieselbe Begründung wie beim
        // Rollen-Symbol oben - "🔍 Alle Profile" ist kein echtes Profil,
        // renameProfile()/deleteProfile() liefen dafür bisher lautlos ins
        // Leere. Jetzt konsequent ausgeblendet statt wirkungslos anklickbar.
        document.getElementById('profileRenameBtn')?.classList.toggle('hidden', !profile);
        document.getElementById('profileDeleteBtn')?.classList.toggle('hidden', !profile);

        // NEU: Auswahl "als was wird das nächste Buch angelegt" + Belohnungs-Zähler
        app.render.newBookTypeButtons();
        app.render.medalBadge();

        // NEU (Nutzerwunsch): kleine Anzeige, ob im Hintergrund noch
        // Aufgaben offen sind - nur wenn die Hintergrund-Vorbereitung
        // überhaupt eingeschaltet ist, sonst wäre die Zahl irreführend
        // (sie würde ja gar nicht automatisch abgearbeitet).
        // FIX (Nutzerhinweis: "man sieht auch nicht die Anzahl der
        // verbleibenden Speechify-Calls"): countMissingScans() (seit
        // v0.35.1-beta) und countMissingAudio() (seit v0.36.2-beta) fehlten
        // hier bisher - der Zähler in den Einstellungen kannte beide schon
        // lange, dieser kleine Bibliotheks-Hinweis war seitdem nicht mehr
        // vollständig. countMissingAudio() ist async (fragt den ttsCache
        // ab) - wird deshalb nachgereicht, statt die ganze Bibliotheks-
        // Ansicht dafür synchron zu blockieren.
        const pregenBadge = document.getElementById('pregenBadge');
        if (pregenBadge) {
            const syncMissing = app.settings.backgroundPregenEnabled
                ? app.utils.countMissingScans() + app.utils.countMissingVariants() + app.utils.countMissingBookQuiz()
                    + (app.settings.backgroundPregenBirkenbihl ? app.utils.countMissingBirkenbihl() : 0)
                : 0;

            const showPregenBadge = (total) => {
                pregenBadge.classList.toggle('hidden', total === 0);
                // NEU (v0.44.0-beta): Nachtmodus-Knopf gleich daneben
                // NEU (v0.47.0-beta): auch bei vorgemerkten Buchatlas-Aufträgen
                const atlasOpen = app.atlas.utils.countNightOpen?.() || 0;
                document.getElementById('nightPrepLibBtn')?.classList.toggle('hidden', total === 0 && atlasOpen === 0);
                if (total > 0) pregenBadge.innerText = `⏳ ${total} im Hintergrund offen`;
            };
            showPregenBadge(syncMissing);

            if (app.settings.backgroundPregenEnabled && app.settings.backgroundPregenAudio) {
                app.utils.countMissingAudio().then(audioMissing => {
                    // Ansicht kann bis zur Antwort gewechselt haben.
                    if (document.getElementById('pregenBadge')) showPregenBadge(syncMissing + audioMissing);
                });
            }
        }

        // NEU: Lese-Serie (Streak) anzeigen, wenn mindestens 2 Tage in Folge
        const streakInfo = app.utils.getStreakInfo();
        const streakEl = document.getElementById('streakBadge');
        if (streakEl) {
            const show = streakInfo.currentStreak > 1;
            streakEl.classList.toggle('hidden', !show);
            if (show) streakEl.innerText = `🔥 ${streakInfo.currentStreak} Tage in Folge`;
        }

        // Profil-Dropdown befüllen - inkl. "Alle Profile"-Option, damit
        // Bücher aus einem anderen/verwaisten Profil nicht unsichtbar
        // bleiben (z.B. wenn Export mehr Bücher zählt als sichtbar sind).
        const profileSelect = document.getElementById('profileSelect');
        if (profileSelect) {
            profileSelect.innerHTML = app.profiles.map(p =>
                `<option value="${p.id}" ${p.id === app.state.currentProfileId ? 'selected' : ''}>${app.utils.sanitize(p.name)}</option>`
            ).join('')
                + `<option value="__all__" ${app.state.currentProfileId === '__all__' ? 'selected' : ''}>🔍 Alle Profile</option>`
                + `<option value="__new__">+ Neues Profil</option>`;
        }

        // NEU: "Weiterlesen"-Karte für das zuletzt gelesene Buch (im
        // aktuellen Profil), ganz oben in der Bibliothek.
        const continueBar = document.getElementById('continueReadingBar');
        const kidMode = app.utils.isKidMode();
        if (continueBar) {
            const profileBooks = Object.values(app.library).filter(b =>
                (app.state.currentProfileId === '__all__' || (b.profileId || 'default') === app.state.currentProfileId)
                // NEU (v0.42.0-beta): im Kinder-Lesemodus nur freigegebene Bücher
                && app.utils.isBookVisibleForKid(b, kidMode)
            );
            const mostRecent = profileBooks
                .filter(b => typeof b.lastReadIdx === 'number' && b.lastReadAt && b.lastReadIdx < b.pages.length - 1)
                .sort((a, b) => (b.lastReadAt || 0) - (a.lastReadAt || 0))[0];

            if (mostRecent) {
                const coverImg = app.utils.resolveCoverUrl(mostRecent);
                continueBar.innerHTML = `
                    <div onclick="app.state.currentBookId='${mostRecent.id}'; app.state.currentPageIdx=${mostRecent.lastReadIdx}; app.nav.go('reader');" class="bg-gradient-to-r from-indigo-600 to-purple-600 rounded-2xl p-3 flex items-center gap-3 cursor-pointer active:scale-98 transition shadow-md">
                        <div class="w-12 h-14 bg-white/20 rounded-lg overflow-hidden flex-shrink-0">
                            ${coverImg ? `<img src="${coverImg}" class="w-full h-full object-cover">` : ''}
                        </div>
                        <div class="flex-grow min-w-0">
                            <p class="text-[10px] text-indigo-100 font-bold uppercase tracking-wide">Weiterlesen</p>
                            <p class="text-sm text-white font-bold truncate">${app.utils.sanitize(mostRecent.title)}</p>
                        </div>
                        <span class="text-white text-xl flex-shrink-0">▶</span>
                    </div>`;
            } else {
                continueBar.innerHTML = '';
            }
        }

        // NEU: sanfte Backup-Erinnerung, wenn lange kein Export gemacht wurde
        // NEU (v0.41.0-beta): Hinweis "App für Eltern", bis er weggeklickt wurde.
        let parentNoticeOk = false;
        try { parentNoticeOk = localStorage.getItem('lz_parent_notice_ok') === '1'; } catch (e) { parentNoticeOk = false; }
        document.getElementById('parentNotice')?.classList.toggle('hidden', parentNoticeOk);

        const reminderEl = document.getElementById('backupReminder');
        if (reminderEl) {
            const lastExport = parseInt(localStorage.getItem('lz_last_export') || '0', 10);
            const daysSince = lastExport ? (Date.now() - lastExport) / (1000 * 60 * 60 * 24) : Infinity;
            const hasBooks = Object.keys(app.library).length > 0;
            const shouldShow = hasBooks && daysSince > 14 && !app.state.backupReminderDismissed;
            reminderEl.classList.toggle('hidden', !shouldShow);
        }

        // Suchfeld filtert nach Titel/Autor. Das Suchfeld selbst liegt
        // außerhalb von #libraryList, bleibt beim Neu-Rendern also fokussiert
        // - man verliert beim Tippen nicht den Cursor.
        const searchInput = document.getElementById('librarySearch');
        const query = (searchInput?.value || '').trim().toLowerCase();

        // FIX: "Alle Profile" zeigt jetzt wirklich jedes Buch, unabhängig
        // vom profileId - löst den Fall, dass Export mehr Bücher zählte
        // als in der Bibliothek sichtbar waren (Bücher eines anderen/
        // verwaisten Profils).
        let keys = Object.keys(app.library).filter(id => {
            if (app.state.currentProfileId === '__all__') return true;
            const b = app.library[id];
            return (b.profileId || 'default') === app.state.currentProfileId;
        });
        // NEU (v0.42.0-beta): Kinder-Lesemodus zeigt nur freigegebene Bücher
        keys = keys.filter(id => app.utils.isBookVisibleForKid(app.library[id], kidMode));

        // NEU: Suche prüft jetzt auch Verlag/Reihe, falls die KI sie auf
        // der Titelseite erkannt hat - nicht nur Titel/Autor.
        if (query) {
            keys = keys.filter(id => {
                const b = app.library[id];
                return b.title.toLowerCase().includes(query) ||
                    b.author.toLowerCase().includes(query) ||
                    (b.publisher || '').toLowerCase().includes(query) ||
                    (b.series || '').toLowerCase().includes(query);
            });
        }

        // Sortierung nach Datum oder Titel
        const sortSelect = document.getElementById('librarySort');
        const sortMode = sortSelect?.value || 'newest';
        keys.sort((a, b) => {
            const bookA = app.library[a];
            const bookB = app.library[b];
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
                : kidMode
                ? `<div class="col-span-full text-center py-12 text-slate-500 bg-white rounded-2xl border border-dashed border-slate-200">
                        <span class="text-4xl block mb-2">🔒</span>
                        <p class="text-xs font-semibold">Hier ist noch kein Buch für dich freigegeben.<br>Frag Mama oder Papa!</p>
                   </div>`
                : `<div class="col-span-full text-center py-12 text-slate-500 bg-white rounded-2xl border border-dashed border-slate-200">
                        <span class="text-4xl block mb-2">📖</span>
                        <p class="text-xs font-semibold">Noch keine Bücher vorhanden.<br>Fotografiere deine erste Seite!</p>
                   </div>`;
            return;
        }

        container.innerHTML = keys.map(id => {
            const book = app.library[id];
            const coverImg = app.utils.resolveCoverUrl(book);
            return `
                <div onclick="${kidMode ? `app.actions.openBookForKid('${book.id}')` : `app.state.currentBookId='${book.id}'; app.nav.go('book');`}" class="bg-white rounded-2xl overflow-hidden border border-slate-200 shadow-sm hover:shadow-md transition cursor-pointer active:scale-95 flex flex-col">
                    <div class="h-36 bg-slate-100 relative">
                        ${coverImg ? `<img src="${coverImg}" loading="lazy" class="w-full h-full object-cover">` : `<div class="flex items-center justify-center h-full text-2xl">📚</div>`}
                        <span class="absolute bottom-2 right-2 bg-black/60 backdrop-blur-md text-white text-[10px] font-bold px-2 py-0.5 rounded-full">
                            ${book.pages.length} ${app.utils.resolveBookType(book) === 'workbook' ? 'Blätter' : 'Seiten'}
                        </span>
                        ${book.approvedForKids && !kidMode ? '<span class="absolute top-2 right-2 bg-white/90 text-[10px] font-bold px-2 py-0.5 rounded-full text-emerald-700" title="Für den Kinder-Lesemodus freigegeben">🧒 frei</span>' : ''}
                        ${app.utils.resolveBookType(book) === 'workbook' ? '<span class="absolute top-2 left-2 bg-white/90 text-[10px] font-bold px-2 py-0.5 rounded-full text-indigo-700">📝 Übungsheft</span>' : ''}
                    </div>
                    <div class="p-3 flex-grow flex flex-col justify-between">
                        <div>
                            <h3 class="font-bold text-slate-900 text-xs line-clamp-1">${app.utils.sanitize(book.title)}</h3>
                            <p class="text-[10px] text-slate-500 font-semibold">${app.utils.sanitize(book.author)}</p>
                            ${book.series ? `<span class="inline-block mt-1 bg-indigo-50 text-indigo-700 text-[9px] font-bold px-2 py-0.5 rounded-full">📚 ${app.utils.sanitize(book.series)}</span>` : ''}
                            ${app.render.progressBadgeHtml(book)}
                        </div>
                    </div>
                </div>`;
        }).join('');
    }
});
