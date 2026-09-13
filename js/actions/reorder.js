import { app } from '../core.js';

Object.assign(app.actions, {
    // NEU: kompaktes "..."-Menü statt vieler einzelner Icons auf der
    // Seiten-Karte. Öffnet man ein Menü, schließen sich alle anderen
    // automatisch - es soll nie mehr als eins gleichzeitig offen sein.
    toggleCardMenu(pageId) {
        document.querySelectorAll('[data-card-menu]').forEach(el => {
            if (el.dataset.cardMenu !== String(pageId)) el.classList.add('hidden');
        });
        const menu = document.getElementById(`cardMenu-${pageId}`);
        if (menu) menu.classList.toggle('hidden');
    },

    // direction: -1 = eine Position nach oben, +1 = eine Position nach unten
    movePage(idx, direction) {
        const book = app.library[app.state.currentBookId];
        const newIdx = idx + direction;
        if (newIdx < 0 || newIdx >= book.pages.length) return;

        const pages = book.pages;
        [pages[idx], pages[newIdx]] = [pages[newIdx], pages[idx]];

        app.dbOps.saveBook(book);
        app.render.book(book.id);
    }
});
