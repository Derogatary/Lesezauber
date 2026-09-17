// Bei jeder inhaltlichen Änderung an einer dieser Dateien diese Nummer
// erhöhen - sonst bekommen wiederkehrende Besucher weiter die alte
// zwischengespeicherte Version ausgeliefert.
const CACHE_NAME = 'lesezauber-shell-v19';

// Nur die eigenen, lokalen Dateien werden zwischengespeichert (die
// "App-Hülle"). Die Gemini-/Mistral-APIs werden absichtlich NICHT
// hierüber abgewickelt - die sollen immer frisch aus dem Netz kommen.
const APP_SHELL = [
    './',
    './index.html',
    './css/style.css',
    './css/tailwind.css',
    './js/main.js',
    './js/core.js',
    './js/config.js',
    './js/state.js',
    './js/db.js',
    './js/profiles.js',
    './js/nav.js',
    './js/api.js',
    './js/tts.js',
    './js/ttsProviders.js',
    './js/ttsNeural.js',
    './js/ui.js',
    './js/utils.js',
    './js/readerUI.js',
    './js/settingsConfig.js',
    './js/actions/scanner.js',
    './js/actions/reader.js',
    './js/actions/reorder.js',
    './js/actions/backup.js',
    './js/actions/bookQuiz.js',
    './js/actions/focusMode.js',
    './js/actions/pdfImport.js',
    './js/actions/vocabTrainer.js',
    './js/render/library.js',
    './js/render/book.js',
    './js/render/reader.js',
    './js/render/settings.js',
    './js/render/vocab.js',
    './js/backgroundPregen.js',
    './js/keyboard.js',
    './js/gestures.js',
    './js/actions/epubImport.js',
    './manifest.json'
];

self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL))
    );
    self.skipWaiting();
});

self.addEventListener('activate', (event) => {
    // Alte Cache-Versionen aufräumen, sobald eine neue aktiv wird.
    event.waitUntil(
        caches.keys().then((keys) =>
            Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
        )
    );
    self.clients.claim();
});

self.addEventListener('fetch', (event) => {
    const url = new URL(event.request.url);

    // Fremde Anfragen (Google-Gemini-API, Mistral-API) unangetastet lassen
    // - dafür ist dieser Service Worker nicht zuständig. (Tailwind kommt
    // seit dem eigenen Build aus css/tailwind.css, also von hier.)
    if (url.origin !== self.location.origin) {
        return;
    }

    // "Cache first, dann Netzwerk": eigene Dateien liegen schon lokal vor
    // und laden dadurch sofort, auch offline. Dateien, die nicht in der
    // festen APP_SHELL-Liste stehen (z.B. die PDF.js-Bibliothek, die nur
    // bei Bedarf nachgeladen wird), werden nach dem ersten Abruf ebenfalls
    // automatisch im Cache abgelegt - so ist auch ein PDF-Import später
    // offline bzw. sofort verfügbar, ohne die App beim Start unnötig mit
    // ca. 1,7 MB PDF.js-Code zu belasten.
    event.respondWith(
        caches.match(event.request).then((cached) => {
            if (cached) return cached;
            return fetch(event.request).then((response) => {
                if (response.ok) {
                    const responseClone = response.clone();
                    caches.open(CACHE_NAME).then((cache) => cache.put(event.request, responseClone));
                }
                return response;
            });
        })
    );
});
