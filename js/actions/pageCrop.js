import { app } from '../core.js';

// ================= ✂️ Seite zuschneiden (v0.53.0-beta) =================
// NEU (Nutzerwunsch beim Klappenbuch: "beim Fotografieren einen Rahmen
// setzen bzw. auf die Klappe begrenzen"): ein Rahmen, den man mit dem Finger
// (oder der Maus) über den gewünschten Bereich zieht. Gilt für JEDE Seite
// (⋮-Menü "✂️ Zuschneiden"), beim Zuordnen einer Klappe wird es zusätzlich
// angeboten (js/actions/flapBook.js).
//
// - Rechnet mit dem gespeicherten Seitenbild (max. 1600 px breit) und legt
//   wie jeder Import zwei WebP-Größen an (app.utils.createImageVariants).
// - Das Original bleibt beim ersten Zuschnitt in page.originalImgUrl
//   erhalten -> "Original wiederherstellen" ist jederzeit möglich.
// - War die Seite schon ausgelesen, passt der Text evtl. nicht mehr zum
//   Ausschnitt -> Angebot, sie neu auszulesen (eine KI-Anfrage).

const MIN_SIZE = 0.03; // kleinere Rahmen gelten als versehentlicher Tipp

const crop = {
    pageId: null,
    rect: null,      // { x, y, w, h } in Anteilen (0..1) des angezeigten Bildes
    start: null,
    onDone: null,    // optional: was danach passieren soll (z.B. Klappe auslesen)
    bound: false
};

function el(id) { return document.getElementById(id); }

function currentPage() {
    const book = app.library[app.state.currentBookId];
    return book ? { book, page: book.pages.find(p => p.id === crop.pageId) } : {};
}

function drawRect() {
    const box = el('cropRect');
    if (!box || !crop.rect) return;
    const r = crop.rect;
    box.style.left = `${r.x * 100}%`;
    box.style.top = `${r.y * 100}%`;
    box.style.width = `${r.w * 100}%`;
    box.style.height = `${r.h * 100}%`;
}

function pointFromEvent(e) {
    const wrap = el('cropImgWrap').getBoundingClientRect();
    const x = Math.min(1, Math.max(0, (e.clientX - wrap.left) / wrap.width));
    const y = Math.min(1, Math.max(0, (e.clientY - wrap.top) / wrap.height));
    return { x, y };
}

function bindPointer() {
    if (crop.bound) return;
    crop.bound = true;
    const wrap = el('cropImgWrap');
    wrap.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        wrap.setPointerCapture?.(e.pointerId);
        crop.start = pointFromEvent(e);
        crop.prevRect = crop.rect;
        crop.rect = { x: crop.start.x, y: crop.start.y, w: 0, h: 0 };
        drawRect();
    });
    wrap.addEventListener('pointermove', (e) => {
        if (!crop.start) return;
        const p = pointFromEvent(e);
        crop.rect = {
            x: Math.min(p.x, crop.start.x), y: Math.min(p.y, crop.start.y),
            w: Math.abs(p.x - crop.start.x), h: Math.abs(p.y - crop.start.y)
        };
        drawRect();
    });
    const end = () => {
        if (!crop.start) return;
        crop.start = null;
        // versehentlicher kurzer Tipp: vorherigen Rahmen behalten
        if (!crop.rect || crop.rect.w < MIN_SIZE || crop.rect.h < MIN_SIZE) {
            crop.rect = crop.prevRect;
            drawRect();
        }
    };
    wrap.addEventListener('pointerup', end);
    wrap.addEventListener('pointercancel', end);
}

function loadImage(url) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = () => reject(new Error('Bild konnte nicht geladen werden.'));
        img.src = url;
    });
}

Object.assign(app.actions, {
    // opts.onDone(applied:boolean) - wird nach Übernehmen/Abbrechen aufgerufen
    openPageCrop(pageId, opts = {}) {
        const book = app.library[app.state.currentBookId];
        const page = book?.pages.find(p => p.id === pageId);
        if (!page || !page.imgUrl) return;
        crop.pageId = pageId;
        crop.onDone = opts.onDone || null;
        crop.rect = { x: 0.05, y: 0.05, w: 0.9, h: 0.9 };
        el('cropImg').src = page.imgUrl;
        el('cropResetBtn').classList.toggle('hidden', !page.originalImgUrl);
        el('cropHint').innerText = opts.hint || 'Mit dem Finger einen Rahmen über den gewünschten Bereich ziehen.';
        el('cropOverlay').classList.remove('hidden');
        bindPointer();
        drawRect();
    },

    closePageCrop(applied = false) {
        el('cropOverlay')?.classList.add('hidden');
        const done = crop.onDone;
        crop.onDone = null;
        crop.pageId = null;
        if (done) done(applied);
    },

    async applyPageCrop() {
        const { book, page } = currentPage();
        if (!page || !crop.rect) { this.closePageCrop(false); return; }
        try {
            const img = await loadImage(page.imgUrl);
            const r = crop.rect;
            const sx = Math.round(r.x * img.naturalWidth), sy = Math.round(r.y * img.naturalHeight);
            const sw = Math.max(1, Math.round(r.w * img.naturalWidth)), sh = Math.max(1, Math.round(r.h * img.naturalHeight));
            const canvas = document.createElement('canvas');
            canvas.width = sw;
            canvas.height = sh;
            canvas.getContext('2d').drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh);
            const variants = app.utils.createImageVariants(canvas, sw, sh);
            if (!page.originalImgUrl) {
                page.originalImgUrl = page.imgUrl;
                page.originalThumbUrl = page.thumbUrl;
            }
            page.imgUrl = variants.full;
            page.thumbUrl = variants.thumb;
            app.dbOps.saveBook(book);
            app.render.book(book.id);
            app.ui.toast('Zugeschnitten ✂️', '✅');
            const wasDone = page.status === 'done';
            const hadCallback = !!crop.onDone;
            this.closePageCrop(true);
            // Nur ohne eigenen Folgeschritt nachfragen (die Klappen-Zuordnung
            // kümmert sich selbst ums Auslesen)
            if (wasDone && !hadCallback && confirm('Die Seite war schon ausgelesen. Jetzt mit dem neuen Ausschnitt neu auslesen? (eine KI-Anfrage)')) {
                await app.actions.reanalyzePage(book.pages.indexOf(page), { skipConfirm: true });
            }
        } catch (e) {
            console.error('Zuschneiden fehlgeschlagen:', e);
            app.ui.toast(`Zuschneiden fehlgeschlagen: ${e.message}`, '❌');
        }
    },

    // Zuschnitt rückgängig: Originalfoto zurück
    resetPageCrop() {
        const { book, page } = currentPage();
        if (!page || !page.originalImgUrl) return;
        page.imgUrl = page.originalImgUrl;
        page.thumbUrl = page.originalThumbUrl || page.thumbUrl;
        delete page.originalImgUrl;
        delete page.originalThumbUrl;
        app.dbOps.saveBook(book);
        app.render.book(book.id);
        el('cropImg').src = page.imgUrl;
        el('cropResetBtn').classList.add('hidden');
        crop.rect = { x: 0.05, y: 0.05, w: 0.9, h: 0.9 };
        drawRect();
        app.ui.toast('Originalfoto wiederhergestellt', '↩️');
    }
});
