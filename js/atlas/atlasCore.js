import { app } from '../core.js';

// NEU (v0.47.0-beta): Buchatlas - Kern (Zustand, Navigation, UI-Brücke).
//
// Buchatlas war eine Zeit lang als eigenständige App abgetrennt (eigene
// Seite mit Netlify-Function für den API-Key). Jetzt wieder Teil von
// LeseZauber, als eigener Bereich wie der SchreibZauber (Knopf
// "🗺️ Buchatlas" in der Bibliothek). Der übernommene Code spricht
// durchgehend app.atlas.* an statt app.* - so kollidiert nichts mit den
// gleichnamigen LeseZauber-Funktionen (app.render.library, app.actions.
// translateBook ...). Was sinnvoll GEMEINSAM genutzt wird, leitet diese
// Datei an LeseZauber weiter:
// - der Gemini-Key und die Modell-Rotation (js/api.js) - kein zweiter Key,
//   keine Netlify-Function mehr nötig
// - Toast und Lade-Overlay inkl. "Vorgang abbrechen" (app.state.cancelAnalysis)
// - app.state.apiBusy: solange Buchatlas übersetzt, wartet die
//   Hintergrund-Vorbereitung (js/backgroundPregen.js), statt parallel
//   dasselbe Gemini-Tageskontingent anzuzapfen
// - app.utils.sanitize() (XSS-Schutz)

Object.assign(app.atlas.settings, {
    // Liste statt einzelner Wert, weil der übernommene Code überall
    // "!app.atlas.settings.apiKeys.length" prüft. Als Getter, damit ein
    // gerade in den LeseZauber-Einstellungen eingetragener Key sofort gilt.
    get apiKeys() {
        return app.settings.apiKey ? [app.settings.apiKey] : [];
    }
});

Object.assign(app.atlas.state, {
    currentBookId: null,
    pageTextModalIdx: null,
    translateActiveTab: 'translate',
    backupReminderDismissed: false
});

// Buchatlas-interne Ansichtsnamen -> Ansichten in app.nav.go() (js/nav.js)
const VIEW_MAP = {
    lib: 'atlas',
    book: 'atlasBook',
    wiki: 'atlasWiki',
    translate: 'atlasTranslate',
    settings: 'atlasSettings'
};

Object.assign(app.atlas.nav, {
    // Der übernommene Code ruft go('lib'/'book'/...) auf - hier auf die
    // LeseZauber-Ansichten umgebogen, damit Browser-Zurück, Kinder-
    // Lesemodus-Sperre usw. genauso greifen wie überall sonst.
    go(viewId) {
        app.nav.go(VIEW_MAP[viewId] || viewId);
    },

    // Wird von app.nav.go() für jede Buchatlas-Ansicht aufgerufen.
    show(viewId) {
        if (viewId === 'atlas') {
            document.getElementById('atlasViewLibrary').classList.remove('view-hidden');
            app.atlas.render.library();
            // Beim allerersten Öffnen kann die Buchatlas-Datenbank noch laden
            app.atlas.dbOps.ready?.then(() => {
                if (app.state.currentView === 'atlas') app.atlas.render.library();
            });
        } else if (viewId === 'atlasBook') {
            document.getElementById('atlasViewBook').classList.remove('view-hidden');
            app.atlas.render.book(app.atlas.state.currentBookId);
        } else if (viewId === 'atlasWiki') {
            document.getElementById('atlasViewWiki').classList.remove('view-hidden');
            app.atlas.render.bookWiki();
        } else if (viewId === 'atlasTranslate') {
            document.getElementById('atlasViewTranslate').classList.remove('view-hidden');
            app.atlas.render.bookTranslate();
        } else if (viewId === 'atlasSettings') {
            document.getElementById('atlasViewSettings').classList.remove('view-hidden');
            app.atlas.render.settings();
        }
    },

    viewIds: ['atlasViewLibrary', 'atlasViewBook', 'atlasViewWiki', 'atlasViewTranslate', 'atlasViewSettings']
});

let lastFocusedElement = null;

Object.assign(app.atlas.ui, {
    // durationMs aus der alten Buchatlas-Fassung wird ignoriert - der
    // LeseZauber-Toast regelt die Anzeigedauer selbst (länger mit Rückgängig).
    toast(msg, icon = 'ℹ️', undoCallback = null) {
        app.ui.toast(msg, icon, undoCallback);
    },

    showLoader(title, sub) {
        app.ui.showLoader(title, sub);
    },

    hideLoader() {
        app.ui.hideLoader();
    },

    // Nur die Status-Unterzeile im Loader, z.B. "Rate-Limit, neuer Versuch in 8s..."
    setProgress(sub) {
        if (!sub) return;
        const el = document.getElementById('processSub');
        if (el) el.innerText = sub;
    },

    toastApiError(error, fallbackMessage) {
        if (error?.message === 'API_KEY_MISSING') {
            app.ui.toast('Kein Gemini-Key hinterlegt - in den LeseZauber-Einstellungen (⚙️) eintragen.', '🔑');
        } else {
            app.ui.toast(fallbackMessage, '❌');
        }
    },

    // Fokus vor dem Öffnen eines Modals merken und beim Schließen
    // zurückgeben (Tastatur-/Screenreader-Nutzung).
    openModalFocus(focusElementId) {
        lastFocusedElement = document.activeElement;
        const target = focusElementId ? document.getElementById(focusElementId) : null;
        if (target) target.focus();
    },

    closeModalFocus() {
        const el = lastFocusedElement;
        lastFocusedElement = null;
        if (el && typeof el.focus === 'function') el.focus();
    },

    // Browser-Benachrichtigung, wenn ein langer Lauf fertig ist - nur mit
    // erteilter Berechtigung und nur, wenn der Tab gerade im Hintergrund ist.
    notifyIfHidden(title, body) {
        if (!('Notification' in window)) return;
        if (Notification.permission !== 'granted') return;
        if (!document.hidden) return;
        try {
            new Notification(title, { body, icon: 'icons/icon-192.png' });
        } catch (e) {
            console.error('Benachrichtigung fehlgeschlagen:', e);
        }
    },

    // Nur auf ausdrücklichen Klick (Buchatlas-Einstellungen), nie automatisch.
    async requestNotifyPermission() {
        if (!('Notification' in window)) {
            app.ui.toast('Dein Browser unterstützt keine Benachrichtigungen.', 'ℹ️');
            return;
        }
        const result = await Notification.requestPermission();
        app.ui.toast(result === 'granted' ? 'Benachrichtigungen aktiviert.' : 'Benachrichtigungen nicht erlaubt.', result === 'granted' ? '🔔' : 'ℹ️');
        app.atlas.render.settings();
    }
});

Object.assign(app.atlas.settingsConfig, {
    resetApiUsageStats() {
        app.atlas.api.resetUsageStats();
        app.atlas.render.settings();
        app.ui.toast('Nutzungsstatistik zurückgesetzt', '✅');
    }
});

// Tastatur im Seiten-Text-Fenster: Pfeiltasten blättern, Escape schließt -
// nur solange das Fenster offen ist.
document.addEventListener('keydown', (e) => {
    const modal = document.getElementById('atlasPageTextModal');
    if (!modal || modal.classList.contains('hidden')) return;

    // Beim Bearbeiten bewegen Pfeiltasten den Cursor, statt zu blättern
    const editing = !document.getElementById('atlasPageTextEditArea')?.classList.contains('hidden');

    if (e.key === 'Escape') {
        app.atlas.actions.hidePageTextModal();
    } else if (e.key === 'ArrowLeft' && !editing) {
        app.atlas.actions.showAdjacentPageText(-1);
    } else if (e.key === 'ArrowRight' && !editing) {
        app.atlas.actions.showAdjacentPageText(1);
    }
});
