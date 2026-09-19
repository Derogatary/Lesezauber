import { app } from './core.js';

// NEU (Nutzer-Feedback, Laptop): im dunklen Rand links/rechts neben dem
// App-Rahmen (#appShell, "Mobile Screen Frame Container" in index.html)
// reagierte das Mausrad auf nichts - dort liegt schlicht <body>, das
// bewusst NICHT scrollbar ist (sonst würde das zentrierte "Handy-Rahmen"-
// Layout auf breiten Bildschirmen zerbrechen). Nur direkt über dem Rahmen
// scrollte die jeweils sichtbare Ansicht über ihr eigenes overflow-y-auto.
// Diese Datei reicht ein Mausrad-Ereignis über dem Rand einfach an die
// aktuell sichtbare <main id="view...">-Ansicht weiter, statt das Layout
// selbst umzubauen.
document.body.addEventListener('wheel', (e) => {
    // Pinch-Zoom am Trackpad kommt ebenfalls als wheel-Ereignis, aber mit
    // gedrückter Ctrl-Taste - das soll der Browser normal zoomen.
    if (e.ctrlKey) return;
    // Nur eingreifen, wenn direkt über <body> gescrollt wird (= im Rand
    // außerhalb des App-Rahmens). Über dem Rahmen selbst ist e.target ein
    // Kind-Element mit eigenem overflow-y-auto - dort nicht doppelt eingreifen.
    if (e.target !== document.body) return;

    const activeView = document.querySelector('#appShell > main:not(.view-hidden)');
    if (!activeView) return;
    activeView.scrollTop += e.deltaY;
    e.preventDefault();
}, { passive: false });
