import { app } from '../core.js';

// ================= 🗺️🌙 Buchatlas im Nachtmodus (v0.47.0-beta) =================
// NEU (Nutzerwunsch: "Nachtmodus auch für Buchatlas, erst LeseZauber, dann
// Buchatlas"). Buchatlas-Aufträge werden NICHT automatisch erraten, sondern
// ausdrücklich vorgemerkt ("🌙 Über Nacht übersetzen" / "🌙 Wiki über Nacht"
// in der Übersetzungs- bzw. Wiki-Ansicht) - eine Roman-Übersetzung kostet
// hunderte Anfragen aus demselben Tageskontingent wie LeseZauber, das soll
// nie unbemerkt passieren. Vorgemerkt wird am Buch:
//   book.nightJobs = { wiki: true, translate: ['Englisch', ...] }
// Erledigte Aufträge räumen sich selbst weg.
//
// Abgearbeitet wird das vom Nachtmodus (js/actions/nightPrep.js), und zwar
// erst, wenn LeseZaubers eigene TEXT-Aufgaben erledigt sind - beide ziehen
// aus demselben Gemini-Kontingent. Die KI-Stimmen der Hintergrund-
// Vorbereitung laufen über einen anderen Anbieter und dürfen parallel weiter.
// Pro Buch zuerst das Wiki, dann die Übersetzung: das fertige Wiki dient der
// Übersetzung als Namens-Glossar (gleichbleibende Eigennamen).

// "1 Block" / "3 Blöcke"
function plural(n, one, many) {
    return `${n} ${n === 1 ? one : many}`;
}

function jobsOf(book) {
    const jobs = book.nightJobs || {};
    return { wiki: !!jobs.wiki, translate: Array.isArray(jobs.translate) ? jobs.translate : [] };
}

function saveJobs(book, jobs) {
    if (!jobs.wiki && jobs.translate.length === 0) delete book.nightJobs;
    else book.nightJobs = { ...(jobs.wiki ? { wiki: true } : {}), ...(jobs.translate.length ? { translate: jobs.translate } : {}) };
    app.atlas.dbOps.saveBook(book);
}

function booksInOrder() {
    return Object.values(app.atlas.library).sort((a, b) => (a.created || 0) - (b.created || 0));
}

// Offene Arbeit eines Buchs: Wiki-Blöcke + fehlende Übersetzungsseiten
function openWorkOf(book) {
    const jobs = jobsOf(book);
    const wiki = jobs.wiki ? app.atlas.utils.countWikiChunksOpen(book) : 0;
    const translate = jobs.translate.reduce((sum, lang) => sum + app.atlas.utils.countMissingTranslation(book, lang), 0);
    return { wiki, translate };
}

Object.assign(app.atlas.utils, {
    // Anzahl offener Einheiten (Wiki-Blöcke + Übersetzungsseiten) aller
    // vorgemerkten Aufträge - dieselbe Zahl zählt der Nachtmodus mit.
    countNightOpen() {
        return booksInOrder().reduce((sum, book) => {
            const w = openWorkOf(book);
            return sum + w.wiki + w.translate;
        }, 0);
    },

    // Nächster Schritt (reine Auswahl, keine Wirkung - auch für Tests):
    // { book, type: 'wiki' } | { book, type: 'translate', lang } | null
    nextNightTask() {
        for (const book of booksInOrder()) {
            const jobs = jobsOf(book);
            if (jobs.wiki && app.atlas.utils.countWikiChunksOpen(book) > 0) return { book, type: 'wiki' };
            for (const lang of jobs.translate) {
                if (app.atlas.utils.countMissingTranslation(book, lang) > 0) return { book, type: 'translate', lang };
            }
        }
        return null;
    },

    // Fertige Aufträge aus book.nightJobs entfernen (damit die Anzeige
    // "vorgemerkt" nicht ewig stehen bleibt).
    cleanupNightJobs() {
        for (const book of Object.values(app.atlas.library)) {
            if (!book.nightJobs) continue;
            const jobs = jobsOf(book);
            const next = {
                wiki: jobs.wiki && app.atlas.utils.countWikiChunksOpen(book) > 0,
                translate: jobs.translate.filter(lang => app.atlas.utils.countMissingTranslation(book, lang) > 0)
            };
            if (next.wiki !== jobs.wiki || next.translate.length !== jobs.translate.length) saveJobs(book, next);
        }
    },

    // Kurzbeschreibung für die Anzeige, z.B. "Wiki · Englisch (12 S.)"
    describeNightJobs(book) {
        const jobs = jobsOf(book);
        const parts = [];
        if (jobs.wiki) parts.push(`Wiki (${plural(app.atlas.utils.countWikiChunksOpen(book), 'Block', 'Blöcke')} offen)`);
        jobs.translate.forEach(lang => parts.push(`${lang} (${plural(app.atlas.utils.countMissingTranslation(book, lang), 'Seite', 'Seiten')} offen)`));
        return parts.join(' · ');
    }
});

// Nach dem Vormerken: gleich starten oder bis heute Abend liegen lassen
async function offerStart(what) {
    if (app.actions.isNightPrepActive?.()) {
        app.ui.toast(`${what} vorgemerkt - läuft im aktuellen Nachtmodus mit.`, '🌙');
        return;
    }
    if (confirm(`${what} ist für den Nachtmodus vorgemerkt.\n\nJetzt starten? (Sonst später über „🌙 über Nacht“ in der Bibliothek oder den Einstellungen.)\n\nZuerst werden offene LeseZauber-Aufgaben erledigt, danach der Buchatlas. Es verbraucht KI-Anfragen deines Tageskontingents.`)) {
        await app.actions.startNightPrep();
    } else {
        app.ui.toast(`${what} für den Nachtmodus vorgemerkt.`, '🌙');
    }
}

Object.assign(app.atlas.actions, {
    // Knopf in der Übersetzungs-Ansicht: aktuelle Zielsprache vormerken
    async queueNightTranslate() {
        const book = app.atlas.library[app.atlas.state.currentBookId];
        if (!book) return;
        const lang = (document.getElementById('atlasTranslateTargetLang')?.value || '').trim();
        if (!lang) {
            app.ui.toast('Bitte Zielsprache angeben.', 'ℹ️');
            return;
        }
        if (app.atlas.utils.countMissingTranslation(book, lang) === 0) {
            app.ui.toast(`Schon alle Seiten nach ${lang} übersetzt.`, '✅');
            return;
        }
        const jobs = jobsOf(book);
        if (!jobs.translate.includes(lang)) jobs.translate.push(lang);
        saveJobs(book, jobs);
        app.atlas.render.bookTranslate();
        await offerStart(`Übersetzung nach ${lang}`);
    },

    // Knopf in der Wiki-Ansicht (leer oder unvollständig)
    async queueNightWiki() {
        const book = app.atlas.library[app.atlas.state.currentBookId];
        if (!book) return;
        if (app.atlas.utils.countWikiChunksOpen(book) === 0) {
            app.ui.toast(book.pages.some(p => p.text) ? 'Das Wiki ist schon vollständig.' : 'Noch kein Text im Buch.', 'ℹ️');
            return;
        }
        const jobs = jobsOf(book);
        jobs.wiki = true;
        saveJobs(book, jobs);
        app.atlas.render.bookWiki();
        await offerStart('Das Wiki');
    },

    // ✕ an einem vorgemerkten Auftrag
    unqueueNightJob(bookId, type, lang) {
        const book = app.atlas.library[bookId];
        if (!book) return;
        const jobs = jobsOf(book);
        if (type === 'wiki') jobs.wiki = false;
        else jobs.translate = jobs.translate.filter(l => l !== lang);
        saveJobs(book, jobs);
        if (app.state.currentView === 'atlasWiki') app.atlas.render.bookWiki();
        if (app.state.currentView === 'atlasTranslate') app.atlas.render.bookTranslate();
        if (app.state.currentView === 'atlas') app.atlas.render.library();
        app.ui.toast('Nacht-Auftrag entfernt', '🗑️');
    }
});

// Wird vom Nachtmodus in einer Schleife aufgerufen: EIN Schritt (ein
// Wiki-Block bzw. eine Seite). Gibt eine Beschreibung des Schritts zurück
// oder null, wenn nichts mehr offen ist. Fehler (Kontingent, Netz) werden
// geworfen - der Nachtmodus wartet dann und versucht es erneut.
app.atlas.night = {
    async runNext(shouldCancel) {
        app.atlas.utils.cleanupNightJobs();
        const task = app.atlas.utils.nextNightTask();
        if (!task) return null;
        const { book } = task;
        if (task.type === 'wiki') {
            setActivity(`Buchatlas-Wiki · „${book.title}“`);
            await app.atlas.actions.generateBookWiki(false, { book, silent: true, shouldCancel, maxChunks: 1 });
            return { type: 'wiki', usedApi: true };
        }
        const openBefore = app.atlas.utils.countMissingTranslation(book, task.lang);
        setActivity(`Buchatlas-Übersetzung ${task.lang} · „${book.title}“ · noch ${plural(openBefore, 'Seite', 'Seiten')}`);
        const result = await app.atlas.actions._translateNextPageForNight(book, task.lang);
        return { type: 'translate', usedApi: result === 'api' };
    }
};

function setActivity(text) {
    app.state.pregenActivity = { ...(app.state.pregenActivity || {}), current: text };
}

// ---------------- Anzeige (Bibliothek, Wiki, Übersetzung) ----------------
// Eine Zeile pro vorgemerktem Auftrag mit ✕ zum Entfernen. Titel/Sprache
// sind Nutzertext -> sanitize(); in onclick nur IDs und die Sprache als
// JSON-String (JSON.stringify + sanitize wäre im onclick falsch, deshalb
// die Sprache über ein data-Attribut und this.dataset).
function jobRowHtml(book, type, lang, label, dark) {
    const cls = dark ? 'text-slate-200' : 'text-slate-700';
    return `<div class="flex items-center justify-between gap-2 text-[11px] ${cls}">
        <span>🌙 ${app.utils.sanitize(label)}</span>
        <button data-lang="${app.utils.sanitize(lang || '')}" onclick="app.atlas.actions.unqueueNightJob('${book.id}', '${type}', this.dataset.lang)" aria-label="Nacht-Auftrag entfernen" title="Nacht-Auftrag entfernen" class="px-1 font-bold opacity-70 hover:opacity-100">✕</button>
    </div>`;
}

Object.assign(app.atlas.render, {
    // type: 'wiki' | 'translate' | undefined (alle), book: nur dieses Buch
    nightJobRows({ book, type, dark = false } = {}) {
        app.atlas.utils.cleanupNightJobs();
        const books = book ? [book] : booksInOrder();
        const rows = [];
        for (const b of books) {
            const jobs = jobsOf(b);
            const prefix = book ? '' : `„${b.title}“: `;
            if (jobs.wiki && (!type || type === 'wiki')) {
                rows.push(jobRowHtml(b, 'wiki', '', `${prefix}Wiki über Nacht (${plural(app.atlas.utils.countWikiChunksOpen(b), 'Block', 'Blöcke')} offen)`, dark));
            }
            if (!type || type === 'translate') {
                jobs.translate.forEach(lang => rows.push(jobRowHtml(b, 'translate', lang,
                    `${prefix}Übersetzung ${lang} über Nacht (${plural(app.atlas.utils.countMissingTranslation(b, lang), 'Seite', 'Seiten')} offen)`, dark)));
            }
        }
        return rows.join('');
    },

    // Füllt ein Hinweis-Element und blendet es aus, wenn nichts vorgemerkt ist
    nightJobInfo(elementId, opts) {
        const el = document.getElementById(elementId);
        if (!el) return;
        const html = app.atlas.render.nightJobRows(opts);
        el.innerHTML = html;
        el.classList.toggle('hidden', !html);
    }
});
