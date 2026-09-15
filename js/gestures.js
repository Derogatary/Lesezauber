import { app } from './core.js';

// NEU: Wisch-Gesten (Touch) für Vor/Zurück - Ergänzung zu den Tap-Buttons
// und Pfeiltasten. Nur eine klare, überwiegend horizontale Bewegung zählt,
// damit normales vertikales Scrollen nicht versehentlich die Seite wechselt.
function attachSwipeNavigation(elementId) {
    const el = document.getElementById(elementId);
    if (!el) return;

    let startX = 0;
    let startY = 0;

    el.addEventListener('touchstart', (e) => {
        startX = e.touches[0].clientX;
        startY = e.touches[0].clientY;
    }, { passive: true });

    el.addEventListener('touchend', (e) => {
        const dx = e.changedTouches[0].clientX - startX;
        const dy = e.changedTouches[0].clientY - startY;

        if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) {
            if (dx < 0) {
                app.actions.goToPage(1);  // nach links wischen = nächste Seite
            } else {
                app.actions.goToPage(-1); // nach rechts wischen = vorherige Seite
            }
        }
    }, { passive: true });
}

attachSwipeNavigation('readerImageContainer');
attachSwipeNavigation('focusImageContainer');
