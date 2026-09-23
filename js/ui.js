import { app } from './core.js';

Object.assign(app.ui, {
    _undoCallback: null,
    _toastTimeout: null,

    // "undoCallback" ist optional: wird sie mitgegeben, zeigt der Toast
    // einen "Rückgängig"-Knopf und bleibt etwas länger stehen.
    // NEU (v0.40.0-beta): optionales actionLabel - derselbe Knopf dient nicht
    // nur für "Rückgängig", sondern z.B. auch für "Neu laden"/"Jetzt sichern"
    // (js/actions/appHealth.js). Ohne Angabe bleibt es bei "Rückgängig".
    toast(msg, icon = 'ℹ️', undoCallback = null, actionLabel = null) {
        const toast = document.getElementById('toast');
        const undoBtn = document.getElementById('toastUndoBtn');
        if (undoBtn) undoBtn.innerText = actionLabel || 'Rückgängig';

        document.getElementById('toastMsg').innerText = msg;
        document.getElementById('toastIcon').innerText = icon;

        this._undoCallback = undoCallback;
        if (undoBtn) undoBtn.classList.toggle('hidden', !undoCallback);

        toast.classList.remove('opacity-0', 'pointer-events-none');

        if (this._toastTimeout) clearTimeout(this._toastTimeout);
        this._toastTimeout = setTimeout(() => {
            toast.classList.add('opacity-0', 'pointer-events-none');
            this._undoCallback = null;
        }, undoCallback ? (actionLabel ? 10000 : 5000) : 3000);
    },

    handleUndo() {
        if (this._undoCallback) {
            const cb = this._undoCallback;
            this._undoCallback = null;
            cb();
        }
        document.getElementById('toast').classList.add('opacity-0', 'pointer-events-none');
    },

    showLoader(title, sub) {
        document.getElementById('processTitle').innerText = title;
        document.getElementById('processSub').innerText = sub;
        document.getElementById('loaderOverlay').classList.remove('hidden');
    },
    hideLoader() {
        document.getElementById('loaderOverlay').classList.add('hidden');
    }
});
