import { app } from '../core.js';

// ================= App-Gesundheit (v0.40.0-beta, Release-Prüfung) =================
// NEU: drei kleine Betriebs-Bausteine aus docs/RELEASE-CHECKLISTE.md, bewusst
// OHNE Server und OHNE Tracking (passt zum Datenschutzversprechen der App):
//
// 1. Fehlerprotokoll (D7): die letzten Fehler bleiben NUR im Arbeitsspeicher
//    des Geräts. Über "📋 Fehlerprotokoll kopieren" in den Einstellungen kann
//    der Betreiber sie selbst kopieren und z.B. an Claude weitergeben - es wird
//    nie automatisch etwas verschickt.
// 2. Update-Hinweis (C5): eine neue Version wird nicht mehr still mitten in
//    der Nutzung eingeschaltet (vorher self.skipWaiting() in sw.js), sondern
//    per Hinweis "Neue Version - neu laden" - sonst liefen alte Seite und neue
//    Dateien gemischt weiter.
// (Eine Sicherungs-Erinnerung gibt es schon länger als Banner in der
//  Bibliothek - #backupReminder, js/render/library.js - deshalb hier keine
//  zweite. FIX v0.41.0-beta: die in v0.40.0-beta zusätzlich eingebaute
//  Toast-Erinnerung war doppelt und wurde wieder entfernt.)

const MAX_LOG_ENTRIES = 50;

const errorLog = [];

function describe(value) {
    if (value instanceof Error) return `${value.name}: ${value.message}`;
    if (typeof value === 'string') return value;
    try { return JSON.stringify(value); } catch (e) { return String(value); }
}

function remember(source, args) {
    errorLog.push({ at: new Date().toISOString(), source, text: args.map(describe).join(' ').slice(0, 500) });
    if (errorLog.length > MAX_LOG_ENTRIES) errorLog.shift();
}

// console.error wird ergänzt, nicht ersetzt - die Ausgabe in den
// Entwicklertools bleibt unverändert. Die App meldet ihre Fehler ohnehin schon
// überall per console.error (CLAUDE.md: "Fehler nie stumm verschlucken").
const originalConsoleError = console.error.bind(console);
console.error = (...args) => {
    remember('console', args);
    originalConsoleError(...args);
};
window.addEventListener('error', (e) => remember('window', [e.error || e.message]));
window.addEventListener('unhandledrejection', (e) => remember('promise', [e.reason]));


Object.assign(app.actions, {
    // Kopiert Version, Browser und die letzten Fehler in die Zwischenablage.
    // Enthält KEINE Buchinhalte und KEINE API-Keys (nur Fehlertexte).
    async copyErrorLog() {
        const version = document.querySelector('[data-app-version]')?.innerText || 'unbekannt';
        const lines = [
            `LeseZauber Pro ${version}`,
            `Browser: ${navigator.userAgent}`,
            `Zeit: ${new Date().toISOString()}`,
            '',
            errorLog.length ? `${errorLog.length} Fehler seit dem Start:` : 'Keine Fehler seit dem Start aufgezeichnet.',
            ...errorLog.map(e => `[${e.at}] (${e.source}) ${e.text}`)
        ];
        // Sicherheitsnetz: falls ein Fehlertext doch einmal einen Key enthält
        // (z.B. eine URL), diesen unkenntlich machen.
        const keys = [app.settings.apiKey, app.settings.mistralApiKey, app.settings.elevenLabsKey, app.settings.openAiKey, app.settings.googleTtsKey, app.settings.speechifyKey].filter(k => k && k.length > 8);
        let text = lines.join('\n');
        keys.forEach(k => { text = text.split(k).join('[KEY ENTFERNT]'); });
        try {
            await navigator.clipboard.writeText(text);
            app.ui.toast('Fehlerprotokoll kopiert - jetzt z.B. in eine Nachricht einfügen.', '📋');
        } catch (e) {
            originalConsoleError('Zwischenablage nicht verfügbar:', e);
            window.prompt('Fehlerprotokoll (markieren und kopieren):', text);
        }
    },


    // Service Worker: auf eine wartende neue Version hinweisen.
    watchForAppUpdate(registration) {
        const offer = (worker) => {
            if (!worker || !navigator.serviceWorker.controller) return; // Erstinstallation: nichts anzubieten
            app.ui.toast('Eine neue Version ist da.', '✨', () => worker.postMessage({ type: 'SKIP_WAITING' }), 'Neu laden');
        };
        if (registration.waiting) offer(registration.waiting);
        registration.addEventListener('updatefound', () => {
            const worker = registration.installing;
            if (!worker) return;
            worker.addEventListener('statechange', () => {
                if (worker.state === 'installed') offer(worker);
            });
        });
        let reloading = false;
        navigator.serviceWorker.addEventListener('controllerchange', () => {
            if (reloading) return;
            reloading = true;
            window.location.reload();
        });
    }
});
